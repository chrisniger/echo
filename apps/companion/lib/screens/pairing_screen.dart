import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/pairing_service.dart';
import '../services/auth_service.dart';

class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key});

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  final _nameCtrl = TextEditingController(text: 'My Phone');
  final _codeCtrl = TextEditingController();
  String? _code;
  bool _loading = false;
  String? _error;
  bool _waitingForApproval = false;

  @override
  void initState() {
    super.initState();
    // Listen to pairing service changes
    context.read<PairingService>().addListener(_onPairingStateChanged);
  }

  @override
  void dispose() {
    context.read<PairingService>().removeListener(_onPairingStateChanged);
    _nameCtrl.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  void _onPairingStateChanged() {
    final pairing = context.read<PairingService>();

    if (pairing.isApproved) {
      context.read<AuthService>().setPaired(true, deviceId: pairing.deviceId);
    }

    if (mounted) {
      setState(() {
        _code = pairing.pairingCode;
        _waitingForApproval = pairing.pairingCode != null && !pairing.isApproved;
        _loading = pairing.isLoading;
        _error = pairing.error;
      });
    }
  }

  Future<void> _requestCode() async {
    setState(() { _loading = true; _error = null; });
    try {
      final pairing = context.read<PairingService>();
      await pairing.requestPairingCode(_nameCtrl.text.trim());
      setState(() { 
        _code = pairing.pairingCode;
        _waitingForApproval = true;
      });
    } catch (e) {
      setState(() { _error = e.toString().replaceAll('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  Future<void> _enterCode() async {
    final code = _codeCtrl.text.trim().toUpperCase();
    if (code.length != 6) return;
    setState(() { _loading = true; _error = null; });
    try {
      await context.read<PairingService>().verifyCode(code);
      // Approval is async — AuthGate will navigate when pairing.isApproved becomes true.
    } catch (e) {
      setState(() { _error = e.toString().replaceAll('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pair with Desktop')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.link, size: 64, color: Color(0xFF5C7CFA)),
            const SizedBox(height: 16),
            const Text('Pair your device', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Connect to your Echo Desktop', style: TextStyle(color: Colors.grey[400])),
            const SizedBox(height: 32),
            if (_error != null)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(color: Colors.red.shade900.withValues(alpha: 0.3), borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
              ),
            if (_code != null) ...[
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(color: const Color(0xFF1A1A1A), borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFF2A2A2A))),
                child: Column(children: [
                  if (_waitingForApproval) ...[
                    const Icon(Icons.hourglass_empty, size: 48, color: Color(0xFF5C7CFA)),
                    const SizedBox(height: 16),
                    const Text('Waiting for approval...', style: TextStyle(fontSize: 16, color: Colors.grey)),
                    const SizedBox(height: 8),
                    const CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF5C7CFA)),
                    const SizedBox(height: 16),
                    const Text('Enter this code on your desktop:', style: TextStyle(fontSize: 14, color: Colors.grey)),
                    const SizedBox(height: 12),
                    Text(_code!, style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: 8, fontFamily: 'JetBrainsMono', color: Color(0xFF5C7CFA))),
                  ] else ...[
                    const Text('Enter this code on your desktop:', style: TextStyle(fontSize: 14, color: Colors.grey)),
                    const SizedBox(height: 12),
                    Text(_code!, style: const TextStyle(fontSize: 36, fontWeight: FontWeight.bold, letterSpacing: 8, fontFamily: 'JetBrainsMono', color: Color(0xFF5C7CFA))),
                    const SizedBox(height: 12),
                    Text('OR', style: TextStyle(color: Colors.grey[500])),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(width: double.infinity, child: ElevatedButton(
                    onPressed: _requestCode, child: const Text('Request New Code'),
                  )),
                ]),
              ),
            ] else ...[
              TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Device Name', border: OutlineInputBorder())),
              const SizedBox(height: 16),
              SizedBox(width: double.infinity, child: ElevatedButton(
                onPressed: _loading ? null : _requestCode,
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF5C7CFA), padding: const EdgeInsets.symmetric(vertical: 14)),
                child: _loading ? const CircularProgressIndicator(strokeWidth: 2, color: Colors.white) : const Text('Generate Pairing Code', style: TextStyle(color: Colors.white)),
              )),
              const SizedBox(height: 24),
              const Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: Text('OR', style: TextStyle(color: Colors.grey))), Expanded(child: Divider())]),
              const SizedBox(height: 24),
              TextField(controller: _codeCtrl, decoration: const InputDecoration(labelText: 'Enter 6-character code', border: OutlineInputBorder(), hintText: 'ABC123'), style: const TextStyle(fontFamily: 'JetBrainsMono', fontSize: 20, letterSpacing: 4)),
              const SizedBox(height: 16),
              SizedBox(width: double.infinity, child: OutlinedButton(
                onPressed: _loading ? null : _enterCode,
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                child: _loading ? const CircularProgressIndicator(strokeWidth: 2) : const Text('Pair with Code'),
              )),
            ],
          ]),
        ),
      ),
    );
  }
}
