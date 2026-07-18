import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DisplaySettings extends ChangeNotifier {
  static const _kResponseFontSize = 'display.responseFontSize';
  static const _kTranscriptFontSize = 'display.transcriptFontSize';
  static const _kShowTimestamps = 'display.showTimestamps';

  /// Response text font size, in logical pixels. Range 12.0 - 28.0.
  double _responseFontSize = 16.0;
  double _transcriptFontSize = 14.0;
  bool _showTimestamps = true;

  double get responseFontSize => _responseFontSize;
  double get transcriptFontSize => _transcriptFontSize;
  bool get showTimestamps => _showTimestamps;

  /// Label used in the UI: Small / Medium / Large / Extra Large.
  String get responseSizeLabel {
    if (_responseFontSize < 14) return 'Small';
    if (_responseFontSize < 17) return 'Medium';
    if (_responseFontSize < 21) return 'Large';
    return 'Extra Large';
  }

  static const double minSize = 12.0;
  static const double maxSize = 28.0;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _responseFontSize = (prefs.getDouble(_kResponseFontSize) ?? 16.0).clamp(minSize, maxSize);
    _transcriptFontSize = (prefs.getDouble(_kTranscriptFontSize) ?? 14.0).clamp(minSize, maxSize);
    _showTimestamps = prefs.getBool(_kShowTimestamps) ?? true;
    notifyListeners();
  }

  Future<void> setResponseFontSize(double value) async {
    _responseFontSize = value.clamp(minSize, maxSize);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_kResponseFontSize, _responseFontSize);
  }

  Future<void> setTranscriptFontSize(double value) async {
    _transcriptFontSize = value.clamp(minSize, maxSize);
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_kTranscriptFontSize, _transcriptFontSize);
  }

  Future<void> setShowTimestamps(bool value) async {
    _showTimestamps = value;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kShowTimestamps, value);
  }

  /// Quick-pick presets used in the settings slider.
  static const Map<String, double> responsePresets = {
    'Small': 13.0,
    'Medium': 16.0,
    'Large': 20.0,
    'Extra Large': 24.0,
  };
}
