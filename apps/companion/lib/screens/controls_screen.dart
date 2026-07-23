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

  /// Fetch the currently active/paused session from the server.
  /// Returns null if none is active.
  Future<String?> _fetchActiveSessionId(ApiService api) async {
    try {
      final data = await api.getMap('/sessions');
      final sessions = data['sessions'] as List<dynamic>? ?? [];
      for (final s in sessions) {
        if (s is Map && (s['status'] == 'active' || s['status'] == 'paused')) {
          return s['id'] as String?;
        }
      }
    } catch (_) {}
    return null;
  }

  Future<void> _run(String action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final api = context.read<ApiService>();

      // Re-fetch the active session from the server before every action.
      // This prevents stale session IDs when the server restarts or the
      // token expires and gets refreshed — the session list always comes
      // from a fresh authenticated request.
      final freshId = await _fetchActiveSessionId(api);
      if (freshId == null) {
        if (!mounted) return;
        setState(() {
          _sessionId = null;
          _status = 'No active session';
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No active session found. Start one on Desktop first.')),
        );
        return;
      }

      // Update our local state with the fresh session info
      if (freshId != _sessionId) {
        setState(() => _sessionId = freshId);
      }

      final result = await api.post('/sessions/$freshId/$action');
      if (!mounted) return;
      setState(() => _status = result['status'] as String? ?? _status);
      final label = action == 'end' ? 'ended' : action == 'pause' ? 'paused' : 'resumed';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Session $label')));
    } catch (e) {
      if (!mounted) return;
      // Extract a cleaner message from the error
      final msg = e.toString().replaceFirst('Exception: ', '');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: Colors.redAccent,
      ));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _triggerScreenshot() async {
    final api = context.read<ApiService>();
    final sent = api.triggerScreenshot();
    if (!mounted) return;
    if (sent) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Screenshot requested on desktop')));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Not connected — screenshot request failed')));
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
              Expanded(
                child: _ControlButton(
                  icon: isActive ? Icons.pause : Icons.play_arrow,
                  label: isActive ? 'Pause' : 'Resume',
                  color: Colors.orange,
                  busy: _busy,
                  onTap: hasSession && !_busy ? () => _run(isActive ? 'pause' : 'resume') : null,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _ControlButton(
                  icon: Icons.stop,
                  label: 'End',
                  color: Colors.red,
                  busy: _busy,
                  onTap: hasSession && !_busy ? () => _run('end') : null,
                ),
              ),
            ]),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Expanded(
                child: _ControlButton(
                  icon: Icons.camera_alt,
                  label: 'Screenshot',
                  color: Colors.indigo,
                  busy: _busy,
                  onTap: hasSession && !_busy ? () => _triggerScreenshot() : null,
                ),
              ),
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
  final bool busy;
  final VoidCallback? onTap;

  const _ControlButton({
    required this.icon,
    required this.label,
    required this.color,
    this.busy = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            )
          : Icon(icon, color: Colors.white),
      label: Text(label, style: const TextStyle(color: Colors.white)),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        padding: const EdgeInsets.symmetric(vertical: 18),
        minimumSize: const Size.fromHeight(56),
      ),
    );
  }
}
