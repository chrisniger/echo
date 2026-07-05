import 'dart:convert';
import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter/foundation.dart';

class ApiService extends ChangeNotifier {
  static const String _baseUrlKey = 'cloud_api_url';
  static const String _tokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String defaultBaseUrl = 'http://localhost:4000';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  String? _baseUrl;
  String? _token;
  WebSocketChannel? _wsChannel;
  bool _isConnected = false;

  String get baseUrl => _baseUrl ?? defaultBaseUrl;
  bool get isConnected => _isConnected;

  Future<void> init() async {
    _baseUrl = await _storage.read(key: _baseUrlKey) ?? defaultBaseUrl;
    _token = await _storage.read(key: _tokenKey);
    if (_token != null) connectWebSocket();
  }

  Future<void> setBaseUrl(String url) async {
    _baseUrl = url;
    await _storage.write(key: _baseUrlKey, value: url);
    notifyListeners();
  }

  Future<void> setToken(String token, String refreshToken) async {
    _token = token;
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
    connectWebSocket();
    notifyListeners();
  }

  Future<void> clearToken() async {
    _token = null;
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshTokenKey);
    disconnectWebSocket();
    notifyListeners();
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> get(String path) async {
    final res = await http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    if (res.statusCode == 401) throw Exception('Unauthorized');
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> post(String path, {Map<String, dynamic>? body}) async {
    final res = await http.post(Uri.parse('$baseUrl$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
    if (res.statusCode == 401) throw Exception('Unauthorized');
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode} ${res.body}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> put(String path, {Map<String, dynamic>? body}) async {
    final res = await http.put(Uri.parse('$baseUrl$path'), headers: _headers, body: body != null ? jsonEncode(body) : null);
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<void> delete(String path) async {
    final res = await http.delete(Uri.parse('$baseUrl$path'), headers: _headers);
    if (res.statusCode >= 400) throw Exception('API error: ${res.statusCode}');
  }

  void connectWebSocket() {
    if (_token == null) return;
    try {
      _wsChannel = WebSocketChannel.connect(Uri.parse('ws://localhost:4000/ws?token=$_token'));
      _isConnected = true;
      notifyListeners();
      _wsChannel!.stream.listen((_) {}, onDone: () {
        _isConnected = false;
        notifyListeners();
        Future.delayed(const Duration(seconds: 3), connectWebSocket);
      });
    } catch (_) {}
  }

  void disconnectWebSocket() {
    _wsChannel?.sink.close();
    _isConnected = false;
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
    super.dispose();
  }
}
