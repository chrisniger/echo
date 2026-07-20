// ignore_for_file: prefer_const_constructors

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';
import '../services/pairing_service.dart';
import '../services/api_service.dart';

class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key});

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  bool _isProcessing = false;
  String? _error;
  bool _permissionDenied = false;
  bool _checkingPermission = true;

  @override
  void initState() {
    super.initState();
    _checkCameraPermission();
  }

  Future<void> _checkCameraPermission() async {
    final status = await Permission.camera.status;
    if (mounted) {
      setState(() {
        _permissionDenied = !status.isGranted;
        _checkingPermission = false;
      });
    }
  }

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (_isProcessing) return;

    final barcode = capture.barcodes.isNotEmpty ? capture.barcodes.first : null;
    if (barcode == null || barcode.rawValue == null || barcode.rawValue!.isEmpty) {
      return;
    }

    setState(() { _isProcessing = true; _error = null; });

    String? code;
    String? serverUrl;
    final raw = barcode.rawValue!;

    try {
      // The desktop encodes the QR payload as JSON: {"code": "ABC123", "serverUrl": "..."}
      final json = jsonDecode(raw) as Map<String, dynamic>;
      code = json['code'] as String?;
      serverUrl = json['serverUrl'] as String?;
    } catch (_) {
      // Fallback: treat the raw value as the pairing code itself.
      code = raw.trim();
    }

    if (code == null || code.isEmpty || code.length < 4) {
      if (mounted) {
        setState(() {
          _error = 'Invalid pairing code. Please scan the QR code shown on your desktop.';
          _isProcessing = false;
        });
      }
      return;
    }

    // Capture services before any await to avoid use_build_context_synchronously.
    final api = context.read<ApiService>();
    final pairing = context.read<PairingService>();

    // If the QR payload includes a server URL, use it so the companion doesn't
    // need to discover or manually enter it. Reject localhost/127.0.0.1 because
    // the phone cannot reach the PC's loopback address.
    if (serverUrl != null && serverUrl.isNotEmpty && !ApiService.isLocalhost(serverUrl)) {
      try {
        await api.setBaseUrl(serverUrl);
      } catch (e) {
        if (mounted) {
          setState(() {
            _error = 'Server URL from QR code is invalid: $e';
            _isProcessing = false;
          });
        }
        return;
      }
    }

    // The QR code either omitted the server URL or contained localhost. Try to
    // discover the real server on the LAN before giving up.
    if (!api.hasBaseUrl) {
      final discovered = await api.discoverBaseUrl();
      if (discovered == null && mounted) {
        setState(() {
          _error = 'Could not find the Echo server on this network. Make sure the Cloud API is running and both devices are on the same Wi-Fi.';
          _isProcessing = false;
        });
        return;
      }
    }

    if (!api.hasBaseUrl) {
      if (mounted) {
        setState(() {
          _error = 'No server URL configured. Set it in Settings or scan a QR code that includes the server URL.';
          _isProcessing = false;
        });
      }
      return;
    }

    try {
      await pairing.verifyCode(code.toUpperCase());
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceAll('Exception: ', '');
          _isProcessing = false;
        });
      }
    }
  }

  Future<void> _requestCameraPermission() async {
    final status = await Permission.camera.request();
    if (mounted) {
      setState(() => _permissionDenied = !status.isGranted);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checkingPermission) {
      return Scaffold(
        appBar: AppBar(title: const Text('Scan Pairing QR Code')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_permissionDenied) {
      return Scaffold(
        appBar: AppBar(title: const Text('Scan Pairing QR Code')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.camera_alt, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                const Text(
                  'Camera permission is required to scan the pairing QR code.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _requestCameraPermission,
                  child: const Text('Grant Camera Permission'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: openAppSettings,
                  child: const Text('Open app settings'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Scan Pairing QR Code')),
      body: Column(
        children: [
          Expanded(
            child: Stack(
              fit: StackFit.expand,
              children: [
                MobileScanner(
                  onDetect: _handleBarcode,
                ),
                Center(
                  child: Container(
                    width: 250,
                    height: 250,
                    decoration: BoxDecoration(
                      border: Border.all(color: const Color(0xFF5C7CFA), width: 2),
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(24),
            decoration: const BoxDecoration(
              color: Color(0xFF1A1A1A),
              borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Point your camera at the QR code shown on your desktop',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
                if (_isProcessing) ...[
                  const SizedBox(height: 16),
                  const CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF5C7CFA)),
                  const SizedBox(height: 8),
                  const Text('Verifying pairing code...', style: TextStyle(color: Colors.grey)),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: const BoxDecoration(
                      color: Color(0x4DB71C1C),
                      borderRadius: BorderRadius.all(Radius.circular(8)),
                    ),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
