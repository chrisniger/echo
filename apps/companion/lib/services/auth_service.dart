import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_service.dart';

class AuthService extends ChangeNotifier {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final ApiService _api = ApiService();

  bool _isAuthenticated = false;
  bool _isPaired = false;
  String? _userName;
  String? _userEmail;
  String? _error;

  bool get isAuthenticated => _isAuthenticated;
  bool get isPaired => _isPaired;
  String? get userName => _userName;
  String? get userEmail => _userEmail;
  String? get error => _error;

  Future<void> init() async {
    final token = await _storage.read(key: 'access_token');
    _isAuthenticated = token != null;
    if (_isAuthenticated) {
      try {
        final data = await _api.get('/auth/me');
        _userName = data['user']['name'] as String?;
        _userEmail = data['user']['email'] as String?;
      } catch (_) {
        _isAuthenticated = false;
      }
    }
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    _error = null;
    try {
      final data = await _api.post('/auth/login', body: {'email': email, 'password': password});
      await _api.setToken(data['tokens']['accessToken'] as String, data['tokens']['refreshToken'] as String);
      _userName = data['user']['name'] as String?;
      _userEmail = data['user']['email'] as String?;
      _isAuthenticated = true;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    await _api.clearToken();
    await _storage.deleteAll();
    _isAuthenticated = false;
    _isPaired = false;
    _userName = null;
    _userEmail = null;
    notifyListeners();
  }

  void setPaired(bool paired) {
    _isPaired = paired;
    notifyListeners();
  }
}
