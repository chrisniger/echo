import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_service.dart';

class AuthService extends ChangeNotifier {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  ApiService _api;

  AuthService(this._api);

  void updateApi(ApiService api) {
    _api = api;
  }

  bool _isAuthenticated = false;
  bool _isPaired = false;
  bool _isLoading = true;
  String? _userName;
  String? _userEmail;
  String? _error;

  bool get isAuthenticated => _isAuthenticated;
  bool get isPaired => _isPaired;
  bool get isLoading => _isLoading;
  String? get userName => _userName;
  String? get userEmail => _userEmail;
  String? get error => _error;

  Future<void> init() async {
    _isLoading = true;
    notifyListeners();

    final token = await _storage.read(key: 'access_token');
    final refreshToken = await _storage.read(key: 'refresh_token');
    _isAuthenticated = token != null || refreshToken != null;

    if (_isAuthenticated) {
      try {
        final data = await _api.getMap('/auth/me');
        _userName = data['user']['name'] as String?;
        _userEmail = data['user']['email'] as String?;
      } catch (_) {
        // Access token may be expired; try to refresh before giving up.
        final refreshed = await _api.tryRefreshToken();
        if (refreshed) {
          try {
            final data = await _api.getMap('/auth/me');
            _userName = data['user']['name'] as String?;
            _userEmail = data['user']['email'] as String?;
          } catch (_) {
            _isAuthenticated = false;
            _isLoading = false;
            notifyListeners();
            return;
          }
        } else {
          _isAuthenticated = false;
          _isLoading = false;
          notifyListeners();
          return;
        }
      }

      // Determine pairing state from explicit flag, falling back to devices list
      // (which only counts devices paired AFTER this version, not legacy data).
      final pairedFlag = await _storage.read(key: 'is_paired');
      if (pairedFlag == 'true') {
        _isPaired = true;
      } else {
        try {
          final devices = await _api.get('/devices');
          if (devices is List && devices.isNotEmpty) {
            // Only mark as paired if at least one device was registered on
            // this device-id (i.e. a record exists in our local store).
            final localDeviceId = await _storage.read(key: 'device_id');
            if (localDeviceId != null &&
                devices.any((d) => (d as Map<String, dynamic>)['id'] == localDeviceId)) {
              _isPaired = true;
              await _storage.write(key: 'is_paired', value: 'true');
            }
          }
        } catch (_) {
          // ignore — keep default false
        }
      }
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password, {bool rememberMe = false}) async {
    _error = null;
    try {
      final data = await _api.post('/auth/login', body: {'email': email, 'password': password});
      await _api.setToken(data['tokens']['accessToken'] as String, data['tokens']['refreshToken'] as String);
      _userName = data['user']['name'] as String?;
      _userEmail = data['user']['email'] as String?;
      _isAuthenticated = true;
      
      if (rememberMe) {
        await _storage.write(key: 'saved_email', value: email);
      }
      
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    await _api.clearToken();
    await _storage.delete(key: 'is_paired');
    // Keep saved_email and saved_server for convenience
    _isAuthenticated = false;
    _isPaired = false;
    _userName = null;
    _userEmail = null;
    notifyListeners();
  }

  Future<void> setPaired(bool paired, {String? deviceId}) async {
    _isPaired = paired;
    if (paired) {
      await _storage.write(key: 'is_paired', value: 'true');
      if (deviceId != null) {
        await _storage.write(key: 'device_id', value: deviceId);
      }
    } else {
      await _storage.delete(key: 'is_paired');
      await _storage.delete(key: 'device_id');
    }
    notifyListeners();
  }
}
