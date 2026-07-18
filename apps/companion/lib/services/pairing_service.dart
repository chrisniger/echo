import 'dart:async';
import 'package:flutter/foundation.dart';
import 'api_service.dart';

enum PairingMethod { qrCode, pairCode, login }

class PairingService extends ChangeNotifier {
  ApiService _api;

  PairingService(this._api);

  void updateApi(ApiService api) {
    _api = api;
  }

  String? _pairingCode;
  String? _deviceName;
  String? _error;
  bool _isLoading = false;
  bool _isApproved = false;
  String? _token;
  String? _deviceId;
  Timer? _pollTimer;

  String? get pairingCode => _pairingCode;
  String? get deviceName => _deviceName;
  String? get error => _error;
  bool get isLoading => _isLoading;
  bool get isApproved => _isApproved;
  String? get deviceId => _deviceId;

  Future<String> requestPairingCode(String deviceName) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.post('/pairing/request', body: {
        'deviceName': deviceName,
        'platform': _platformLabel(),
      });
      _pairingCode = data['code'] as String;
      _deviceName = deviceName;
      _token = data['token'] as String;
      _isLoading = false;
      notifyListeners();

      _startPolling();
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
      _token = data['token'] as String?;
      _deviceName = data['deviceName'] as String?;
      _isLoading = false;
      notifyListeners();

      if (_token != null) {
        _startPolling();
        return _isApproved;
      }
      return false;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      rethrow;
    }
  }

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 1), (_) async {
      if (_token == null) return;
      try {
        final data = await _api.post('/pairing/status', body: {'token': _token});
        final status = data['status'] as String?;
        if (status == 'approved') {
          _deviceId = data['deviceId'] as String?;
          _isApproved = true;
          _pollTimer?.cancel();
          _pollTimer = null;
          notifyListeners();
        } else if (status == 'rejected') {
          _error = 'Pairing was rejected on the desktop.';
          _pollTimer?.cancel();
          _pollTimer = null;
          notifyListeners();
        } else if (status == 'expired') {
          _error = 'Pairing code expired. Request a new one.';
          _pollTimer?.cancel();
          _pollTimer = null;
          notifyListeners();
        }
      } catch (e) {
        if (kDebugMode) {
          debugPrint('[PairingService] poll error: $e');
        }
      }
    });
  }

  void reset() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _pairingCode = null;
    _deviceName = null;
    _error = null;
    _isLoading = false;
    _isApproved = false;
    _token = null;
    _deviceId = null;
    notifyListeners();
  }

  String _platformLabel() {
    if (defaultTargetPlatform == TargetPlatform.android) return 'android';
    if (defaultTargetPlatform == TargetPlatform.iOS) return 'ios';
    return 'mobile';
  }
}
