import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

class TranscriptScreen extends StatelessWidget {
  const TranscriptScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.watch<ApiService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Live Transcript'),
        actions: !api.isConnected
            ? const [
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: Row(children: [
                    Icon(Icons.wifi_off, size: 16, color: Colors.orange),
                    SizedBox(width: 4),
                    Text('Disconnected', style: TextStyle(fontSize: 12)),
                  ]),
                ),
              ]
            : const [],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.transcribe, size: 48, color: Colors.grey),
              const SizedBox(height: 16),
              const Text(
                'Transcript disabled on companion',
                style: TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 8),
              Text(
                'Use the desktop app to review live transcripts. This companion view only shows AI responses.',
                style: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
