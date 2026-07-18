import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../services/display_settings.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<_ChatMessage> _messages = [];
  StreamSubscription<AiResponseMessage>? _aiSub;
  bool _listening = false;
  String? _activeSessionId;

  @override
  void initState() {
    super.initState();
    _messages.add(_ChatMessage(
      role: 'system',
      content: 'Echo is mirroring your Desktop session. AI answers will appear here as soon as Desktop generates them.',
      timestamp: DateTime.now(),
    ));

    final api = context.read<ApiService>();
    _aiSub = api.aiResponses.listen(_onAiResponse);
  }

  @override
  void dispose() {
    _aiSub?.cancel();
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onAiResponse(AiResponseMessage msg) {
    if (msg.content.trim().isEmpty) return;

    setState(() {
      _activeSessionId ??= msg.sessionId;

      if (msg.query != null && msg.query!.trim().isNotEmpty) {
        _messages.add(_ChatMessage(
          role: 'user',
          content: msg.query!,
          timestamp: DateTime.now(),
        ));
      }

      _messages.add(_ChatMessage(
        role: 'assistant',
        content: msg.content,
        timestamp: msg.receivedAt,
        model: msg.model,
        provider: msg.provider,
      ));
    });
    _scrollToTop();
  }

  void _scrollToTop() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          0,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _sendMessage() {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty) return;
    final api = context.read<ApiService>();
    if (!api.isConnected) return;

    if (_activeSessionId == null) {
      setState(() {
        _messages.add(_ChatMessage(
          role: 'system',
          content: 'No active session on Desktop yet. Start a session there first.',
          timestamp: DateTime.now(),
        ));
      });
      return;
    }

    setState(() {
      _messages.add(_ChatMessage(role: 'user', content: text, timestamp: DateTime.now()));
    });
    _inputCtrl.clear();

    api.sendWsMessage({
      'action': 'ai.request',
      'data': {
        'sessionId': _activeSessionId,
        'content': text,
      },
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
              child: const Row(children: [
                Icon(Icons.wifi_off, size: 16, color: Colors.white),
                SizedBox(width: 8),
                Text('Disconnected', style: TextStyle(fontSize: 13)),
              ]),
            ),
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (_, i) {
                final index = _messages.length - 1 - i;
                return _MessageBubble(message: _messages[index]);
              },
            ),
          ),
          if (api.isConnected)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: Color(0xFF1A1A1A),
                border: Border(top: BorderSide(color: Color(0xFF2A2A2A))),
              ),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _inputCtrl,
                    decoration: const InputDecoration(hintText: 'Ask Echo...', border: OutlineInputBorder()),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(onPressed: _sendMessage, icon: const Icon(Icons.send)),
              ]),
            ),
        ],
      ),
    );
  }
}

class _ChatMessage {
  final String role;
  final String content;
  final DateTime timestamp;
  final String? model;
  final String? provider;

  _ChatMessage({
    required this.role,
    required this.content,
    required this.timestamp,
    this.model,
    this.provider,
  });
}

class _MessageBubble extends StatelessWidget {
  final _ChatMessage message;
  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final display = context.watch<DisplaySettings>();
    final isUser = message.role == 'user';
    final isSystem = message.role == 'system';

    Color bg;
    Alignment align;
    TextStyle textStyle;
    Radius? brUser;
    Radius? brOther;
    double textSize;

    if (isSystem) {
      bg = const Color(0xFF2A2A2A);
      align = Alignment.center;
      textSize = display.responseFontSize - 2;
      textStyle = TextStyle(
        fontSize: textSize,
        color: Colors.white70,
        fontStyle: FontStyle.italic,
      );
    } else if (isUser) {
      bg = const Color(0xFF5C7CFA);
      align = Alignment.centerRight;
      textSize = display.responseFontSize - 1;
      textStyle = TextStyle(fontSize: textSize, color: Colors.white);
      brUser = const Radius.circular(0);
    } else {
      bg = const Color(0xFF1A1A1A);
      align = Alignment.centerLeft;
      textSize = display.responseFontSize;
      textStyle = TextStyle(fontSize: textSize, color: Colors.white);
      brOther = const Radius.circular(0);
    }

    final bubble = Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12).copyWith(
          bottomRight: brUser,
          bottomLeft: brOther,
        ),
      ),
      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Text(message.content, style: textStyle),
          if (display.showTimestamps) ...[
            const SizedBox(height: 4),
            Text(
              _formatTimestamp(message.timestamp) +
                  (message.model != null
                      ? ' · ${message.model}${message.provider != null ? ' (${message.provider})' : ''}'
                      : ''),
              style: TextStyle(fontSize: textSize - 4, color: Colors.white38),
            ),
          ] else if (message.model != null) ...[
            const SizedBox(height: 4),
            Text(
              '${message.model}${message.provider != null ? ' · ${message.provider}' : ''}',
              style: TextStyle(fontSize: textSize - 4, color: Colors.white38),
            ),
          ],
        ],
      ),
    );

    if (isSystem) return Center(child: bubble);
    return Align(alignment: align, child: bubble);
  }

  String _formatTimestamp(DateTime ts) {
    final now = DateTime.now();
    final isToday = ts.year == now.year && ts.month == now.month && ts.day == now.day;
    final hh = ts.hour.toString().padLeft(2, '0');
    final mm = ts.minute.toString().padLeft(2, '0');
    if (isToday) return '$hh:$mm';
    return '${ts.year}-${ts.month.toString().padLeft(2, '0')}-${ts.day.toString().padLeft(2, '0')} $hh:$mm';
  }
}
