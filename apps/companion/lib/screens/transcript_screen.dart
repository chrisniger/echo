import 'package:flutter/material.dart';

class TranscriptScreen extends StatelessWidget {
  const TranscriptScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Live Transcript')),
      body: const Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.transcribe, size: 48, color: Colors.grey),
          SizedBox(height: 16),
          Text('No active session', style: TextStyle(color: Colors.grey)),
          SizedBox(height: 8),
          Text('Start a session on your desktop to see the live transcript here.', style: TextStyle(color: Colors.grey, fontSize: 13), textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}
