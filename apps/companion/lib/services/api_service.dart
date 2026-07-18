import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter/foundation.dart';

class AiResponseMessage {
  final String sessionId;
  final String content;
  final String? query;
  final int? totalTokens;
  final String? model;
  final String? provider;
  final DateTime receivedAt;

  AiResponseMessage({
    required this.sessionId,
    required this.content,
    required this.receivedAt,
    this.query,
    this.totalTokens,
    this.model,
    this.provider,
  });
}

class TranscriptMessage {
  final String sessionId;
  final String speaker;
  final String text;
  final double confidence;
  final int timestamp;
  final bool isFinal;

  TranscriptMessage({
    required this.sessionId,
    required this.speaker,
    required this.text,
    required this.confidence,
    required this.timestamp,
    required this.isFinal,
  });
}

class SessionEventMessage {
  final String sessionId;
  final String status;
  final String? name;
  final String? model;

  SessionEventMessage({
    required this.sessionId,
    required this.status,
    this.name,
    this.model,
  });
}

class ApiService extends ChangeNotifier {
  static const String _baseUrlKey = 'cloud_api_url';
  static const String _tokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String defaultBaseUrl = 'http://192.168.1.102:4000';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  String? _baseUrl;
  String? _token;
  String? _userId;
  WebSocketChannel? _wsChannel;
  bool _isConnected = false;
  bool _isConnecting = false;
  StreamSubscription? _wsSubscription;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;

  final _aiResponseController = StreamController<AiResponseMessage>.broadcast();
  final _transcriptController = StreamController<TranscriptMessage>.broadcast();
  final _sessionEventController = StreamController<SessionEventMessage>.broadcast();

  Stream<AiResponseMessage> get aiResponses => _aiResponseController.stream;
  Stream<TranscriptMessage> get transcripts => _transcriptController.stream;
  Stream<SessionEventMessage> get sessionEvents => _sessionEventController.stream;

  FlutterSecureStorage get storage => _storage;
  String get baseUrl => _baseUrl ?? defaultBaseUrl;
  bool get isConnected => _isConnected;
  String? get userId => _userId;

  Future<void> init() async {
    _baseUrl = await _storage.read(key: _baseUrlKey) ?? defaultBaseUrl;
    final token = await _storage.read(key: _tokenKey);
    _token = token;
    if (token != null) {
      _userId = _extractUserIdFromJwt(token);
      connectWebSocket();
    }
  }

  Future<void> setBaseUrl(String url) async {
    _baseUrl = url;
    await _storage.write(key: _baseUrlKey, value: url);
    notifyListeners();
  }

  Future<void> setToken(String token, String refreshToken) async {
    _token = token;
    _userId = _extractUserIdFromJwt(token);
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
    connectWebSocket();
    notifyListeners();
  }

  Future<void> clearToken() async {
    _token = null;
    _userId = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshTokenKey);
    disconnectWebSocket();
    notifyListeners();
  }

  String? _extractUserIdFromJwt(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      String payload = parts[1];
      payload = payload.replaceAll('-', '+').replaceAll('_', '/');
      while (payload.length % 4 != 0) {
        payload += '=';
      }
      final decoded = utf8.decode(base64Decode(payload));
      final json = jsonDecode(decoded) as Map<String, dynamic>;
      return json['userId'] as String? ?? json['sub'] as String?;
    } catch (_) {
      return null;
    }
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<dynamic> get(String path) async {
    var res = await http.get(Uri.parse('$baseUrl/api$path'), headers: _headers);
    if (res.statusCode == 401) {
      if (await _tryRefreshToken()) {
        res = await http.get(Uri.parse('$baseUrl/api$path'), headers: _headers);
      }
    }
    if (res.statusCode == 401) throw Exception('Unauthorized');
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
    return jsonDecode(res.body);
  }

  Future<Map<String, dynamic>> getMap(String path) async {
    final data = await get(path);
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    throw Exception('Expected JSON object from $path');
  }

  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async {
    var res = await http.post(Uri.parse('$baseUrl/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
    if (res.statusCode == 401) {
      if (await _tryRefreshToken()) {
        res = await http.post(Uri.parse('$baseUrl/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
      }
    }
    if (res.statusCode == 401) throw Exception('Unauthorized');
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode} ${res.body}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> put(String path, {Map<String, dynamic>? body}) async {
    var res = await http.put(Uri.parse('$baseUrl/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
    if (res.statusCode == 401) {
      if (await _tryRefreshToken()) {
        res = await http.put(Uri.parse('$baseUrl/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
      }
    }
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<void> delete(String path) async {
    var res = await http.delete(Uri.parse('$baseUrl/api$path'), headers: _headers);
    if (res.statusCode == 401) {
      if (await _tryRefreshToken()) {
        res = await http.delete(Uri.parse('$baseUrl/api$path'), headers: _headers);
      }
    }
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
  }

  Future<bool> _tryRefreshToken() async {
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    if (refreshToken == null) return false;
    try {
      final res = await http.post(
        Uri.parse('$baseUrl/api/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final newToken = data['tokens']['accessToken'] as String;
        final newRefresh = data['tokens']['refreshToken'] as String;
        _token = newToken;
        _userId = _extractUserIdFromJwt(newToken);
        await _storage.write(key: _tokenKey, value: newToken);
        await _storage.write(key: _refreshTokenKey, value: newRefresh);
        connectWebSocket();
        notifyListeners();
        return true;
      }
    } catch (_) {}
    return false;
  }

  void connectWebSocket() {
    if (_token == null || _isConnecting || _isConnected) return;
    _isConnecting = true;

    try {
      final wsUrl = baseUrl.replaceFirst('http://', 'ws://');
      debugPrint('[WebSocket] Connecting to: $wsUrl/ws');
      _wsChannel = WebSocketChannel.connect(Uri.parse('$wsUrl/ws?token=$_token'));
      _wsSubscription = _wsChannel!.stream.listen(
        (data) {
          if (!_isConnected) {
            debugPrint('[WebSocket] Connected successfully');
            _isConnected = true;
            _isConnecting = false;
            _reconnectAttempts = 0;
            _reconnectTimer?.cancel();
            _reconnectTimer = null;
            _startHeartbeat();
            notifyListeners();
          }

          try {
            final message = jsonDecode(data as String) as Map<String, dynamic>;
            _handleWebSocketMessage(message);
          } catch (e) {
            debugPrint('[WebSocket] Failed to parse message: $e');
          }
        },
        onError: (error) {
          debugPrint('[WebSocket] Error: $error');
          _handleConnectionLost();
        },
        onDone: () {
          debugPrint('[WebSocket] Connection closed');
          _handleConnectionLost();
        },
      );
    } catch (e) {
      debugPrint('[WebSocket] Exception: $e');
      _handleConnectionLost();
    }
  }

  void _handleConnectionLost() {
    _isConnected = false;
    _isConnecting = false;
    _stopHeartbeat();
    _wsSubscription?.cancel();
    _wsSubscription = null;
    _wsChannel = null;
    notifyListeners();

    if (_reconnectTimer?.isActive == true) {
      return;
    }

    final delay = Duration(seconds: (1 << _reconnectAttempts).clamp(1, 30));
    _reconnectAttempts++;

    debugPrint('[WebSocket] Reconnecting in ${delay.inSeconds}s (attempt $_reconnectAttempts)');
    _reconnectTimer = Timer(delay, () {
      _reconnectTimer = null;
      if (_token != null && !_isConnected && !_isConnecting) {
        connectWebSocket();
      }
    });
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (_isConnected && _wsChannel != null) {
        try {
          _wsChannel!.sink.add(jsonEncode({'action': 'ping'}));
        } catch (e) {
          debugPrint('[WebSocket] Heartbeat failed: $e');
          _handleConnectionLost();
        }
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void _handleWebSocketMessage(Map<String, dynamic> message) {
    final type = message['type'] as String?;

    switch (type) {
      case 'connected':
        if (_userId != null) {
          sendWsMessage({
            'action': 'subscribe',
            'rooms': ['user:$_userId'],
          });
        }
        break;
      case 'ai.response':
        final data = message['data'] as Map<String, dynamic>?;
        if (data != null) {
          final content = (data['content'] as String?)?.trim() ?? '';
          if (content.isEmpty) break;
          final tokens = data['tokensUsed'] as Map<String, dynamic>?;
          _aiResponseController.add(
            AiResponseMessage(
              sessionId: data['sessionId'] as String? ?? '',
              content: content,
              query: data['query'] as String?,
              totalTokens: tokens != null && tokens['total'] is int ? tokens['total'] as int : null,
              model: data['model'] as String?,
              provider: data['provider'] as String?,
              receivedAt: DateTime.now(),
            ),
          );
        }
        break;
      case 'transcript.update':
        final data = message['data'] as Map<String, dynamic>?;
        if (data != null) {
          _transcriptController.add(
            TranscriptMessage(
              sessionId: data['sessionId'] as String? ?? '',
              speaker: data['speaker'] as String? ?? 'Speaker',
              text: data['text'] as String? ?? '',
              confidence: (data['confidence'] as num?)?.toDouble() ?? 0,
              timestamp: (data['timestamp'] as num?)?.toInt() ?? 0,
              isFinal: data['isFinal'] as bool? ?? false,
            ),
          );
        }
        break;
      case 'session.start':
      case 'session.pause':
      case 'session.resume':
      case 'session.end':
        final data = message['data'] as Map<String, dynamic>?;
        if (data != null) {
          _sessionEventController.add(
            SessionEventMessage(
              sessionId: data['sessionId'] as String? ?? '',
              status: type!.split('.').last,
              name: data['name'] as String?,
              model: data['model'] as String?,
            ),
          );
        }
        break;
      case 'subscribed':
        debugPrint('[WebSocket] Subscribed to: ${message['rooms']}');
        break;
      case 'pong':
        break;
      default:
        debugPrint('[WebSocket] Unknown message type: $type');
    }
  }

  void disconnectWebSocket() {
    _stopHeartbeat();
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _wsSubscription?.cancel();
    _wsSubscription = null;
    _wsChannel?.sink.close();
    _wsChannel = null;
    _isConnected = false;
    _isConnecting = false;
    _reconnectAttempts = 0;
    notifyListeners();
  }

  void sendWsMessage(Map<String, dynamic> message) {
    if (_wsChannel != null && _isConnected) {
      _wsChannel!.sink.add(jsonEncode(message));
    }
  }

  @override
  void dispose() {
    disconnectWebSocket();
    _aiResponseController.close();
    _transcriptController.close();
    _sessionEventController.close();
    super.dispose();
  }
}
