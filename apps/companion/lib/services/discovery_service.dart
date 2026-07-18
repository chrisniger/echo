import 'dart:async';
import 'dart:io';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:http/http.dart' as http;

class DiscoveredServer {
  final String url;
  final int latencyMs;
  const DiscoveredServer({required this.url, required this.latencyMs});
}

class DiscoveryService {
  /// Scan the local subnet (e.g. 192.168.1.0/24) for an Echo cloud-api
  /// responding on port 4000. Returns a list of reachable servers sorted
  /// by latency. Times out after [perHostTimeoutMs] per host and
  /// [totalTimeoutMs] overall.
  static Future<List<DiscoveredServer>> scanLocalSubnet({
    int port = 4000,
    Duration perHostTimeout = const Duration(milliseconds: 400),
    Duration totalTimeout = const Duration(seconds: 8),
    List<String> seedHosts = const [],
  }) async {
    final candidates = <String>[...seedHosts];

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
}
