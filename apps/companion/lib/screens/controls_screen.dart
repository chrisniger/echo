import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

class ControlsScreen extends StatefulWidget {
  const ControlsScreen({super.key});

  @override
  State<ControlsScreen> createState() => _ControlsScreenState();
}

class _ControlsScreenState extends State<ControlsScreen> {
  StreamSubscription<SessionEventMessage>? _events;
  String? _sessionId;
  String _status = 'No active session';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final api = context.read<ApiService>();
    _events = api.sessionEvents.listen((event) {
      if (!mounted) return;
      setState(() {
        _sessionId = event.sessionId;
        _status = event.status;
      });
    });
    _loadActiveSession(api);
  }

  Future<void> _loadActiveSession(ApiService api) async {
    try {
      final data = await api.getMap('/sessions');
      final sessions = data['sessions'] as List<dynamic>? ?? [];
      final active = sessions.cast<Map>().firstWhere(
        (s) => s['status'] == 'active' || s['status'] == 'paused',
        orElse: () => <String, dynamic>{},
      );
      if (!mounted || active.isEmpty) return;
      setState(() {
        _sessionId = active['id'] as String?;
        _status = active['status'] as String? ?? 'unknown';
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  Future<void> _run(String action) async {
    final id = _sessionId;
    if (id == null || _busy) return;
    setState(() => _busy = true);
    try {
      final api = context.read<ApiService>();
      final result = await api.post('/sessions/$id/$action');
      if (!mounted) return;
      setState(() => _status = result['status'] as String? ?? _status);
      final label = action == 'end' ? 'ended' : action == 'pause' ? 'paused' : 'resumed';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Session $label')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Action failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasSession = _sessionId != null && _status != 'ended' && _status != 'No active session';
    final isActive = _status == 'active';
    return Scaffold(
      appBar: AppBar(title: const Text('Remote Controls')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('Status: $_status', style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Expanded(child: _ControlButton(icon: isActive ? Icons.pause : Icons.play_arrow, label: isActive ? 'Pause' : 'Resume', color: Colors.orange, onTap: hasSession && !_busy ? () => _run(isActive ? 'pause' : 'resume') : null)),
              const SizedBox(width: 16),
              Expanded(child: _ControlButton(icon: Icons.stop, label: 'End', color: Colors.red, onTap: hasSession && !_busy ? () => _run('end') : null)),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  const _ControlButton({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, color: Colors.white),
      label: Text(label, style: const TextStyle(color: Colors.white)),
      style: ElevatedButton.styleFrom(backgroundColor: color, padding: const EdgeInsets.symmetric(vertical: 14)),
    );
  }
}
