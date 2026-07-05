import 'package:flutter/foundation.dart';
import 'api_service.dart';

enum PairingMethod { qrCode, pairCode, login }

class PairingService extends ChangeNotifier {
  final ApiService _api = ApiService();

  String? _pairingCode;
  String? _deviceName;
  String? _error;
  bool _isLoading = false;
  bool _isApproved = false;

  String? get pairingCode => _pairingCode;
  String? get deviceName => _deviceName;
  String? get error => _error;
  bool get isLoading => _isLoading;
  bool get isApproved => _isApproved;

  Future<String> requestPairingCode(String deviceName) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.post('/pairing/request', body: {
        'deviceName': deviceName,
        'platform': 'ios',
      });
      _pairingCode = data['code'] as String;
      _deviceName = deviceName;
      _isLoading = false;
      notifyListeners();
      return data['token'] as String;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      rethrow;
    }
  }

  Future<bool> verifyCode(String code) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.post('/pairing/verify', body: {'code': code});
      _isApproved = data['approved'] as bool;
      _deviceName = data['deviceName'] as String?;
      _isLoading = false;
      notifyListeners();
      return _isApproved;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      rethrow;
    }
  }

  Future<bool> pollForApproval(String token, {int maxAttempts = 30, Duration interval = const Duration(seconds: 2)}) async {
    for (int i = 0; i < maxAttempts; i++) {
      await Future.delayed(interval);
      try {
        final data = await _api.get('/auth/devices');
        _isApproved = true;
        notifyListeners();
        return true;
      } catch (_) {}
    }
    _error = 'Pairing timed out';
    notifyListeners();
    return false;
  }

  void reset() {
    _pairingCode = null;
    _deviceName = null;
    _error = null;
    _isLoading = false;
    _isApproved = false;
    notifyListeners();
  }
}
