import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter/foundation.dart';
import 'discovery_service.dart';

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

  /// Normalize a server URL so it never ends with `/api` or a trailing slash.
  /// Adds an `http://` scheme if missing. Returns an empty string if the input
  /// is empty.
  static String normalizeBaseUrl(String url) {
    url = url.trim();
    if (url.isEmpty) return '';

    // Add a scheme if the user only typed an IP:port like 192.168.1.5:4000.
    if (!url.startsWith(RegExp(r'^https?://', caseSensitive: false))) {
      url = 'http://$url';
    }

    // Strip trailing /api or /api/
    url = url.replaceAll(RegExp(r'/api/?$'), '');
    // Strip trailing slash
    url = url.replaceAll(RegExp(r'/$'), '');

    return url;
  }

  /// Returns true if the URL points to localhost/127.0.0.1/::1, which will not
  /// work when the companion app is running on a physical phone or emulator.
  static bool isLocalhost(String url) {
    try {
      final host = Uri.parse(url).host.toLowerCase();
      return host == 'localhost' || host == '127.0.0.1' || host == '::1';
    } catch (_) {
      return false;
    }
  }

  /// Returns true if the URL is well-formed and has a host and port.
  static bool isValidServerUrl(String url) {
    try {
      final uri = Uri.parse(url);
      return uri.hasScheme && uri.host.isNotEmpty && uri.port > 0;
    } catch (_) {
      return false;
    }
  }

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
  String? get baseUrl => _baseUrl;
  bool get hasBaseUrl => _baseUrl != null && _baseUrl!.isNotEmpty;
  bool get isConnected => _isConnected;
  String? get userId => _userId;

  /// Throws if no base URL has been configured.
  String _requireBaseUrl() {
    final url = _baseUrl;
    if (url == null || url.isEmpty) {
      throw Exception('Server URL not configured. Use Scan local network or enter the PC\'s IP.');
    }
    return url;
  }

  Future<void> init() async {
    final stored = await _storage.read(key: _baseUrlKey);
    if (stored != null && stored.isNotEmpty) {
      final normalized = normalizeBaseUrl(stored);
      // localhost/127.0.0.1 can never reach the PC from a phone/emulator.
      if (isLocalhost(normalized)) {
        debugPrint('[ApiService] Rejecting stored localhost URL: $normalized');
        _baseUrl = null;
        await _storage.delete(key: _baseUrlKey);
      } else if (normalized.isNotEmpty) {
        _baseUrl = normalized;
      }
    }
    notifyListeners();
    final token = await _storage.read(key: _tokenKey);
    _token = token;
    if (token != null) {
      _userId = _extractUserIdFromJwt(token);
      connectWebSocket();
    }
  }

  /// Discover an Echo Cloud API server on the local network and persist it.
  /// Returns the discovered URL or null if none is found.
  Future<String?> discoverBaseUrl() async {
    try {
      final servers = await DiscoveryService.scanLocalSubnet();
      for (final server in servers) {
        final url = normalizeBaseUrl(server.url);
        if (isValidServerUrl(url) && !isLocalhost(url)) {
          await setBaseUrl(url);
          return url;
        }
      }
    } catch (e) {
      debugPrint('[ApiService] Discovery failed: $e');
    }
    return null;
  }

  Future<void> setBaseUrl(String url) async {
    final normalized = normalizeBaseUrl(url);
    if (normalized.isEmpty) {
      throw ArgumentError('Server URL cannot be empty');
    }
    if (!isValidServerUrl(normalized)) {
      throw ArgumentError('Invalid server URL: $url');
    }
    if (isLocalhost(normalized)) {
      throw ArgumentError(
        'Use the PC\'s local IP address (e.g. 192.168.x.x:4000), not localhost.',
      );
    }
    _baseUrl = normalized;
    await _storage.write(key: _baseUrlKey, value: normalized);
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
    final base = _requireBaseUrl();
    var res = await http.get(Uri.parse('$base/api$path'), headers: _headers);      if (res.statusCode == 401) {
        if (await tryRefreshToken()) {
          res = await http.get(Uri.parse('$base/api$path'), headers: _headers);
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
    final base = _requireBaseUrl();
    var res = await http.post(Uri.parse('$base/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);      if (res.statusCode == 401) {
        if (await tryRefreshToken()) {
          res = await http.post(Uri.parse('$base/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
        }
      }
    if (res.statusCode == 401) throw Exception('Unauthorized');
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode} ${res.body}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> put(String path, {Map<String, dynamic>? body}) async {
    final base = _requireBaseUrl();
    var res = await http.put(Uri.parse('$base/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);      if (res.statusCode == 401) {
        if (await tryRefreshToken()) {
          res = await http.put(Uri.parse('$base/api$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
        }
      }
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<void> delete(String path) async {
    final base = _requireBaseUrl();
    var res = await http.delete(Uri.parse('$base/api$path'), headers: _headers);      if (res.statusCode == 401) {
        if (await tryRefreshToken()) {
          res = await http.delete(Uri.parse('$base/api$path'), headers: _headers);
        }
      }
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
  }

  Future<bool> tryRefreshToken() async {
    final refreshToken = await _storage.read(key: _refreshTokenKey);
    if (refreshToken == null) return false;
    final base = _requireBaseUrl();
    try {
      final res = await http.post(
        Uri.parse('$base/api/auth/refresh'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'refreshToken': refreshToken}),
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        // The server may return { tokens: AuthTokens } (wrapped) or AuthTokens
        // directly (legacy). Accept either shape so a server-side change does
        // not silently break token rotation.
        final tokens = data['tokens'] as Map<String, dynamic>? ?? data;
        final newToken = tokens['accessToken'] as String;
        final newRefresh = tokens['refreshToken'] as String;
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
    final base = _baseUrl;
    if (base == null || base.isEmpty) return;
    _isConnecting = true;

    try {
      final wsUrl = base.replaceFirst('http://', 'ws://');
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

  /// Ask the paired desktop app to initiate a screenshot capture.
  /// The desktop will open its area-selection UI and analyze the selected region.
  /// Returns true if the message was sent, false if the WebSocket is not connected.
  bool triggerScreenshot() {
    if (!_isConnected || _wsChannel == null) return false;
    sendWsMessage({'action': 'screenshot.trigger'});
    return true;
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
