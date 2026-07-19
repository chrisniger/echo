import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../services/pairing_service.dart';

class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  bool _scanned = false;
  String? _error;
  PermissionStatus _cameraStatus = PermissionStatus.granted;

  @override
  void initState() {
    super.initState();
    _ensureCameraPermission();
  }

  Future<void> _ensureCameraPermission() async {
    final status = await Permission.camera.status;
    if (status.isGranted) {
      setState(() => _cameraStatus = status);
      return;
    }
    final requested = await Permission.camera.request();
    setState(() => _cameraStatus = requested);
  }

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (_scanned) return;
    final raw = capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue : null;
    if (raw == null || raw.isEmpty) return;

    // Read providers before any async gap to avoid using BuildContext across it.
    final api = context.read<ApiService>();
    final pairing = context.read<PairingService>();

    setState(() => _scanned = true);

    String? code;
    String? serverUrl;

    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      code = json['code'] as String?;
      serverUrl = json['serverUrl'] as String?;
    } catch (_) {
      // Fallback: treat the raw value as the pairing code.
      code = raw.trim().toUpperCase();
    }

    if (code == null || code.length != 6) {
      if (!mounted) return;
      setState(() {
        _error = 'Invalid QR code. Please scan the code shown on your desktop.';
        _scanned = false;
      });
      return;
    }

    if (serverUrl != null && serverUrl.isNotEmpty) {
      await api.setBaseUrl(serverUrl);
    }

    try {
      await pairing.verifyCode(code);
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceAll('Exception: ', '');
          _scanned = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cameraStatus.isDenied || _cameraStatus.isPermanentlyDenied) {
      return Scaffold(
        appBar: AppBar(title: const Text('Scan Pairing QR')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.camera_alt, size: 64, color: Color(0xFF5C7CFA)),
                const SizedBox(height: 16),
                const Text('Camera permission required', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                const Text('Echo Companion needs camera access to scan the pairing QR code.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _ensureCameraPermission,
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5C7CFA)),
                  child: const Text('Grant Permission', style: TextStyle(color: Colors.white)),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Scan Pairing QR')),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            onDetect: _handleBarcode,
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            child: IgnorePointer(
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white.withValues(alpha: 0.5), width: 2),
                  borderRadius: BorderRadius.circular(16),
                ),
                margin: const EdgeInsets.all(64),
              ),
            ),
          ),
          if (_error != null)
            Positioned(
              bottom: 32,
              left: 24,
              right: 24,
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade900.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          if (_scanned)
            const Positioned(
              bottom: 100,
              left: 0,
              right: 0,
              child: Center(
                child: CircularProgressIndicator(),
              ),
            ),
        ],
      ),
    );
  }
}
