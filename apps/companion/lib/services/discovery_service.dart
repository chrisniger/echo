import 'dart:async';
import 'dart:io';
import 'package:multicast_dns/multicast_dns.dart';
import 'package:network_info_plus/network_info_plus.dart';

class DiscoveredServer {
  final String url;
  final int latencyMs;
  const DiscoveredServer({required this.url, required this.latencyMs});
}

class DiscoveryService {
  /// Discover Echo cloud-api servers on the local network using mDNS first,
  /// then fall back to a subnet IP scan. Returns a list of reachable servers
  /// sorted by latency.
  static Future<List<DiscoveredServer>> scanLocalSubnet({
    int port = 4000,
    Duration perHostTimeout = const Duration(milliseconds: 400),
    Duration totalTimeout = const Duration(seconds: 8),
    List<String> seedHosts = const [],
  }) async {
    final candidates = <String>[...seedHosts];

    // 1. Try mDNS discovery first.
    try {
      final mdnsResults = await _discoverMdns(port: port, timeout: totalTimeout);
      if (mdnsResults.isNotEmpty) {
        return mdnsResults;
      }
    } catch (_) {
      // Fall back to IP scan.
    }

    try {
      final info = NetworkInfo();
      final wifiIP = await info.getWifiIP();
      final subnet = _subnetBase(wifiIP);
      if (subnet != null) {
        for (int i = 1; i < 255; i++) {
          candidates.add('$subnet.$i');
        }
      }
    } catch (_) {
      // Network info unavailable — fall back to seedHosts only.
    }

    // De-duplicate
    final unique = candidates.toSet().toList();

    final results = <DiscoveredServer>[];
    final client = HttpClient()..connectionTimeout = perHostTimeout;
    final stopwatch = Stopwatch()..start();
    final futures = <Future<void>>[];

    for (final host in unique) {
      if (stopwatch.elapsed > totalTimeout) break;
      futures.add(_probeHost(client, host, port).then((result) {
        if (result != null) results.add(result);
      }).catchError((_) {}));
    }

    await Future.wait(futures);
    client.close(force: true);

    results.sort((a, b) => a.latencyMs.compareTo(b.latencyMs));
    return results;
  }

  static Future<DiscoveredServer?> _probeHost(HttpClient client, String host, int port) async {
    final url = 'http://$host:$port/api/health';
    final sw = Stopwatch()..start();
    try {
      final response = await client.getUrl(Uri.parse(url)).then((req) => req.close());
      await response.drain<void>();
      if (response.statusCode == 200) {
        sw.stop();
        return DiscoveredServer(url: 'http://$host:$port', latencyMs: sw.elapsedMilliseconds);
      }
    } catch (_) {
      // host unreachable, port closed, or timeout
    }
    return null;
  }

  static String? _subnetBase(String? ip) {
    if (ip == null) return null;
    final parts = ip.split('.');
    if (parts.length != 4) return null;
    return '${parts[0]}.${parts[1]}.${parts[2]}';
  }

  /// Query mDNS for `_echo._tcp` services. Returns reachable servers sorted
  /// by latency, or an empty list if no service is found.
  static Future<List<DiscoveredServer>> _discoverMdns({
    required int port,
    Duration timeout = const Duration(seconds: 3),
  }) async {
    return Future.any<List<DiscoveredServer>>([
      Future<List<DiscoveredServer>>(() async {
        final results = <DiscoveredServer>[];
        final MDnsClient client = MDnsClient();
        await client.start();
        try {
          final ptrStream = client.lookup<PtrResourceRecord>(
            ResourceRecordQuery.serverPointer('_echo._tcp.local'),
          );
          final ptrRecords = await ptrStream.timeout(timeout, onTimeout: (sink) => sink.close()).toList();
          for (final PtrResourceRecord ptr in ptrRecords) {
            if (ptr.domainName.isEmpty) continue;

            final hostName = ptr.domainName;
            String? target;
            int? discoveredPort;

            await for (final SrvResourceRecord srv in client.lookup<SrvResourceRecord>(
              ResourceRecordQuery.service(hostName),
            )) {
              target = srv.target;
              discoveredPort = srv.port;
              break;
            }

            if (target == null || discoveredPort == null) continue;

            // Resolve the target hostname to an usable IP address.
            try {
              final addresses = await InternetAddress.lookup(target);
              if (addresses.isEmpty) continue;
              final ip = addresses.firstWhere(
                (a) => a.type == InternetAddressType.IPv4,
                orElse: () => addresses.first,
              );
              final server = await _probeHost(
                HttpClient()..connectionTimeout = const Duration(milliseconds: 400),
                ip.address,
                discoveredPort,
              );
              if (server != null) results.add(server);
            } catch (_) {
              // Could not resolve target; skip.
            }
          }
        } finally {
          client.stop();
        }
        results.sort((a, b) => a.latencyMs.compareTo(b.latencyMs));
        return results;
      }),
      Future.delayed(timeout, () => <DiscoveredServer>[]),
    ]);
  }
}
