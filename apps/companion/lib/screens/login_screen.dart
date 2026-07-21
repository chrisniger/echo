import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';
import '../services/discovery_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _serverCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _rememberMe = true;
  bool _scanning = false;
  List<DiscoveredServer> _discovered = [];

  @override
  void initState() {
    super.initState();
    _loadSavedCredentials();
  }

  Future<void> _loadSavedCredentials() async {
    final api = context.read<ApiService>();
    await api.init();

    final savedEmail = await api.storage.read(key: 'saved_email');
    final savedServer = await api.storage.read(key: 'saved_server');

    if (savedEmail != null) _emailCtrl.text = savedEmail;
    if (savedServer != null && savedServer.isNotEmpty) {
      _serverCtrl.text = savedServer;
    } else {
      _serverCtrl.text = api.baseUrl ?? '';
    }

    // If no server URL is known yet, automatically scan the local network.
    if (_serverCtrl.text.trim().isEmpty) {
      await _scanNetwork();
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _serverCtrl.dispose();
    super.dispose();
  }

  Future<void> _scanNetwork() async {
    setState(() {
      _scanning = true;
      _discovered = [];
      _error = null;
    });
    try {
      final results = await DiscoveryService.scanLocalSubnet(
        seedHosts: _initialCandidates(),
      );
      if (!mounted) return;
      setState(() {
        _discovered = results;
        if (results.isEmpty) {
          _error = 'No Echo servers found on the local network. Make sure the Cloud API is running on the desktop machine.';
        } else {
          _serverCtrl.text = results.first.url;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Scan failed: $e');
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  List<String> _initialCandidates() {
    final current = _serverCtrl.text.trim();
    if (current.isEmpty || !current.startsWith('http')) return [];
    try {
      final uri = Uri.parse(current);
      if (uri.host.isEmpty) return [];
      final parts = uri.host.split('.');
      if (parts.length == 4) {
        return List.generate(20, (i) {
          final last = (int.tryParse(parts[3]) ?? 1) + i;
          if (last > 254) return null;
          return 'http://${parts[0]}.${parts[1]}.${parts[2]}.$last:${uri.port}';
        }).whereType<String>().toList();
      }
    } catch (_) {}
    return [];
  }

  Future<void> _login() async {
    setState(() { _loading = true; _error = null; });
    final api = context.read<ApiService>();
    final auth = context.read<AuthService>();
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text.trim();
    final server = _serverCtrl.text.trim();
    final remember = _rememberMe;

    final normalized = ApiService.normalizeBaseUrl(server);
    _serverCtrl.text = normalized;

    if (!ApiService.isValidServerUrl(normalized)) {
      setState(() {
        _loading = false;
        _error = 'Enter a valid server URL like http://192.168.x.x:4000';
      });
      return;
    }

    if (ApiService.isLocalhost(normalized)) {
      setState(() {
        _loading = false;
        _error = 'Use the PC\'s local IP address (e.g. 192.168.x.x:4000), not localhost.';
      });
      return;
    }

    try {
      await api.setBaseUrl(normalized);
      await auth.login(email, password, rememberMe: remember);

      if (remember) {
        await api.storage.write(key: 'saved_email', value: email);
        await api.storage.write(key: 'saved_server', value: normalized);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = e.toString().replaceAll('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  bool get _canLogin {
    final server = _serverCtrl.text.trim();
    final normalized = ApiService.normalizeBaseUrl(server);
    return _emailCtrl.text.trim().isNotEmpty &&
        _passwordCtrl.text.isNotEmpty &&
        ApiService.isValidServerUrl(normalized) &&
        !ApiService.isLocalhost(normalized);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.record_voice_over, size: 64, color: Color(0xFF5C7CFA)),
            const SizedBox(height: 16),
            const Text('Echo Companion', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Sign in to connect', style: TextStyle(color: Colors.grey[400])),
            const SizedBox(height: 24),
            if (_error != null) Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.red.shade900.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(8)),
              child: Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _serverCtrl,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Server URL',
                hintText: 'http://192.168.x.x:4000',
                border: OutlineInputBorder(),
              ),
              style: const TextStyle(fontFamily: 'JetBrainsMono', fontSize: 14),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _scanning ? null : _scanNetwork,
                  icon: _scanning
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.wifi_tethering, size: 18),
                  label: Text(_scanning ? 'Scanning local network…' : 'Scan local network'),
                ),
              ),
            ]),
            if (_discovered.length > 1) ...[
              const SizedBox(height: 8),
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF1A1A1A),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF2A2A2A)),
                ),
                child: Column(children: [
                  const Padding(
                    padding: EdgeInsets.all(8),
                    child: Text('Other Echo servers on this network:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                  ),
                  ..._discovered.skip(1).map((s) => ListTile(
                        dense: true,
                        title: Text(s.url, style: const TextStyle(fontFamily: 'JetBrainsMono', fontSize: 13)),
                        subtitle: Text('${s.latencyMs} ms', style: const TextStyle(fontSize: 11)),
                        onTap: () => setState(() => _serverCtrl.text = s.url),
                      )),
                ]),
              ),
            ],
            const SizedBox(height: 16),
            TextField(controller: _emailCtrl, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()), keyboardType: TextInputType.emailAddress),
            const SizedBox(height: 12),
            TextField(controller: _passwordCtrl, onChanged: (_) => setState(() {}), decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()), obscureText: true),
            const SizedBox(height: 16),
            Row(
              children: [
                Checkbox(
                  value: _rememberMe,
                  onChanged: (value) => setState(() => _rememberMe = value ?? true),
                  activeColor: const Color(0xFF5C7CFA),
                ),
                const Text('Remember me', style: TextStyle(color: Colors.grey)),
              ],
            ),
            const SizedBox(height: 16),
            SizedBox(width: double.infinity, height: 48, child: ElevatedButton(
              onPressed: (_loading || !_canLogin) ? null : _login,
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5C7CFA)),
              child: _loading ? const CircularProgressIndicator(strokeWidth: 2, color: Colors.white) : const Text('Sign In', style: TextStyle(fontSize: 16, color: Colors.white)),
            )),
          ]),
        ),
      ),
    );
  }
}
