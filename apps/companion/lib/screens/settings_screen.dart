import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/discovery_service.dart';
import '../services/display_settings.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _serverCtrl;
  bool _scanning = false;
  String? _scanError;
  List<DiscoveredServer> _found = [];

  @override
  void initState() {
    super.initState();
    _serverCtrl = TextEditingController(text: context.read<ApiService>().baseUrl);
  }

  @override
  void dispose() {
    _serverCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final api = context.read<ApiService>();
    final url = _serverCtrl.text.trim();
    if (url.isEmpty) return;
    await api.setBaseUrl(url);
    await api.storage.write(key: 'saved_server', value: url);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Server URL saved. Reconnecting…')),
    );
    api.connectWebSocket();
  }

  Future<void> _scan() async {
    setState(() {
      _scanning = true;
      _scanError = null;
      _found = [];
    });
    try {
      final results = await DiscoveryService.scanLocalSubnet();
      if (!mounted) return;
      setState(() {
        _found = results;
        if (results.isEmpty) {
          _scanError = 'No Echo servers found. Make sure the Cloud API is running.';
        } else {
          _serverCtrl.text = results.first.url;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _scanError = e.toString());
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _logout() async {
    await context.read<AuthService>().logout();
    if (!mounted) return;
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final api = context.watch<ApiService>();
    final auth = context.watch<AuthService>();
    final display = context.watch<DisplaySettings>();

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _SectionHeader('Display'),
          _DisplaySettingsCard(display: display),
          const Divider(height: 32),
          const _SectionHeader('Server'),
          TextField(
            controller: _serverCtrl,
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
                onPressed: _scanning ? null : _scan,
                icon: _scanning
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.wifi_tethering),
                label: Text(_scanning ? 'Scanning…' : 'Scan local network'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton.icon(
                onPressed: _save,
                icon: const Icon(Icons.save),
                label: const Text('Save'),
              ),
            ),
          ]),
          if (_scanError != null) ...[
            const SizedBox(height: 8),
            Text(_scanError!, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
          ],
          if (_found.length > 1) ...[
            const SizedBox(height: 12),
            const Text('Other Echo servers on this network:'),
            ..._found.skip(1).map((s) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(s.url, style: const TextStyle(fontFamily: 'JetBrainsMono', fontSize: 13)),
                  subtitle: Text('${s.latencyMs} ms', style: const TextStyle(fontSize: 11)),
                  onTap: () => setState(() => _serverCtrl.text = s.url),
                )),
          ],
          const Divider(height: 32),
          const _SectionHeader('Account'),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.person),
            title: Text(auth.userName ?? '—'),
            subtitle: Text(auth.userEmail ?? '—'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              api.isConnected ? Icons.cloud_done : Icons.cloud_off,
              color: api.isConnected ? Colors.green : Colors.red,
            ),
            title: Text(api.isConnected ? 'Connected' : 'Disconnected'),
            subtitle: Text('Server: ${api.baseUrl}'),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _logout,
            icon: const Icon(Icons.logout, color: Colors.red),
            label: const Text('Log out', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _DisplaySettingsCard extends StatelessWidget {
  final DisplaySettings display;
  const _DisplaySettingsCard({required this.display});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Color(0xFF1A1A1A),
        borderRadius: BorderRadius.all(Radius.circular(12)),
        border: Border.fromBorderSide(BorderSide(color: Color(0xFF2A2A2A))),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.text_fields, color: Color(0xFF5C7CFA), size: 18),
          const SizedBox(width: 8),
          const Text('Response Font Size', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          const Spacer(),
          Text(display.responseSizeLabel,
              style: const TextStyle(color: Color(0xFF5C7CFA), fontSize: 12, fontWeight: FontWeight.w500)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          const Text('A-', style: TextStyle(fontSize: 12)),
          Expanded(
            child: Slider(
              value: display.responseFontSize,
              min: DisplaySettings.minSize,
              max: DisplaySettings.maxSize,
              divisions: 32,
              label: '${display.responseFontSize.toStringAsFixed(0)} pt',
              onChanged: (v) => display.setResponseFontSize(v),
            ),
          ),
          const Text('A+', style: TextStyle(fontSize: 18)),
        ]),
        const SizedBox(height: 4),
        Wrap(spacing: 6, children: DisplaySettings.responsePresets.entries.map((e) {
          final selected = (display.responseFontSize - e.value).abs() < 0.5;
          return ChoiceChip(
            label: Text(e.key),
            selected: selected,
            onSelected: (_) => display.setResponseFontSize(e.value),
          );
        }).toList()),
        const SizedBox(height: 12),
        const Divider(),
        const SizedBox(height: 8),
        Row(children: [
          const Icon(Icons.show_chart, color: Color(0xFF5C7CFA), size: 18),
          const SizedBox(width: 8),
          const Expanded(
            child: Text('Transcript Font Size', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          ),
          Text('${display.transcriptFontSize.toStringAsFixed(0)} pt',
              style: const TextStyle(color: Color(0xFF5C7CFA), fontSize: 12, fontWeight: FontWeight.w500)),
        ]),
        Slider(
          value: display.transcriptFontSize,
          min: DisplaySettings.minSize,
          max: DisplaySettings.maxSize,
          divisions: 32,
          label: '${display.transcriptFontSize.toStringAsFixed(0)} pt',
          onChanged: (v) => display.setTranscriptFontSize(v),
        ),
        const SizedBox(height: 4),
        Row(children: [
          const Text('Show timestamps on messages', style: TextStyle(fontSize: 13)),
          const Spacer(),
          Switch(
            value: display.showTimestamps,
            onChanged: (v) => display.setShowTimestamps(v),
          ),
        ]),
      ]),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, top: 4),
      child: Text(text, style: const TextStyle(fontSize: 12, color: Colors.grey, letterSpacing: 1.2)),
    );
  }
}
