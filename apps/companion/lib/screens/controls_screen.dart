import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

class ControlsScreen extends StatelessWidget {
  const ControlsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Remote Controls')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            _ControlButton(icon: Icons.play_arrow, label: 'Start Session', color: Colors.green, onTap: () {}),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _ControlButton(icon: Icons.pause, label: 'Pause', color: Colors.orange, onTap: () {}),
              const SizedBox(width: 16),
              _ControlButton(icon: Icons.stop, label: 'End', color: Colors.red, onTap: () {}),
            ]),
            const SizedBox(height: 16),
            _ControlButton(icon: Icons.camera_alt, label: 'Take Screenshot', color: Colors.blue, onTap: () {}),
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
  final VoidCallback onTap;

  const _ControlButton({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, color: Colors.white),
        label: Text(label, style: const TextStyle(color: Colors.white)),
        style: ElevatedButton.styleFrom(backgroundColor: color, padding: const EdgeInsets.symmetric(vertical: 14)),
      ),
    );
  }
}
