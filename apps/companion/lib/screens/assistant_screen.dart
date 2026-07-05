import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _inputCtrl = TextEditingController();
  final _messages = <Map<String, String>>[];
  bool _listening = false;

  @override
  void dispose() {
    _inputCtrl.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _messages.add({'role': 'user', 'content': text});
      _inputCtrl.clear();
      _messages.add({'role': 'assistant', 'content': 'Thinking...'});
    });
  }

  @override
  Widget build(BuildContext context) {
    final api = context.watch<ApiService>();
    return Scaffold(
      appBar: AppBar(title: const Text('AI Assistant'), actions: [
        IconButton(
          icon: Icon(_listening ? Icons.mic : Icons.mic_none, color: _listening ? Colors.red : null),
          onPressed: () => setState(() => _listening = !_listening),
        ),
      ]),
      body: Column(
        children: [
          if (!api.isConnected)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.orange.shade900,
              child: const Row(children: [Icon(Icons.wifi_off, size: 16, color: Colors.white), SizedBox(width: 8), Text('Disconnected', style: TextStyle(fontSize: 13))]),
            ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final msg = _messages[i];
                final isUser = msg['role'] == 'user';
                return Align(
                  alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: isUser ? const Color(0xFF5C7CFA) : const Color(0xFF1A1A1A),
                      borderRadius: BorderRadius.circular(12).copyWith(
                        bottomRight: isUser ? const Radius.circular(0) : null,
                        bottomLeft: !isUser ? const Radius.circular(0) : null,
                      ),
                    ),
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                    child: Text(msg['content'] ?? '', style: const TextStyle(fontSize: 14)),
                  ),
                );
              },
            ),
          ),
          if (api.isConnected)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(color: Color(0xFF1A1A1A), border: Border(top: BorderSide(color: Color(0xFF2A2A2A)))),
              child: Row(children: [
                Expanded(child: TextField(controller: _inputCtrl, decoration: const InputDecoration(hintText: 'Ask Echo...', border: OutlineInputBorder()), onSubmitted: (_) => _sendMessage())),
                const SizedBox(width: 8),
                IconButton.filled(onPressed: _sendMessage, icon: const Icon(Icons.send)),
              ]),
            ),
        ],
      ),
    );
  }
}
