import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

class DeviceStatusWidget extends StatefulWidget {
  const DeviceStatusWidget({super.key});

  @override
  State<DeviceStatusWidget> createState() => _DeviceStatusWidgetState();
}

class _DeviceStatusWidgetState extends State<DeviceStatusWidget> {
  int _latency = 0;
  DateTime _lastSync = DateTime.now();

  @override
  void initState() {
    super.initState();
    _startLatencyMonitor();
  }

  void _startLatencyMonitor() {
    Future.doWhile(() async {
      await Future.delayed(const Duration(seconds: 5));
      if (!mounted) return false;
      
      final api = context.read<ApiService>();
      final startTime = DateTime.now();
      
      try {
        // Simple ping to measure latency
        await api.get('/health');
        final endTime = DateTime.now();
        final latency = endTime.difference(startTime).inMilliseconds;
        
        setState(() {
          _latency = latency;
          _lastSync = DateTime.now();
        });
      } catch (_) {
        setState(() {
          _latency = -1; // Connection failed
        });
      }
      
      return mounted;
    });
  }

  String _formatLastSync() {
    final diff = DateTime.now().difference(_lastSync);
    if (diff.inSeconds < 1) return 'Just now';
    if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    return '${diff.inHours}h ago';
  }

  String _getSignalStrength() {
    if (_latency < 0) return 'Disconnected';
    if (_latency < 50) return 'Excellent';
    if (_latency < 100) return 'Good';
    if (_latency < 200) return 'Fair';
    return 'Poor';
  }

  Color _getSignalColor() {
    if (_latency < 0) return Colors.red;
    if (_latency < 50) return Colors.green;
    if (_latency < 100) return Colors.lightGreen;
    if (_latency < 200) return Colors.orange;
    return Colors.red;
  }

  @override
  Widget build(BuildContext context) {
    final api = context.watch<ApiService>();
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF2A2A2A)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            api.isConnected ? Icons.wifi : Icons.wifi_off,
            color: api.isConnected ? Colors.green : Colors.red,
            size: 16,
          ),
          const SizedBox(width: 8),
          Text(
            api.isConnected ? 'Connected' : 'Disconnected',
            style: TextStyle(
              color: api.isConnected ? Colors.green : Colors.red,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (api.isConnected) ...[
            const SizedBox(width: 12),
            Text(
              '${_latency}ms',
              style: TextStyle(
                color: _getSignalColor(),
                fontSize: 12,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              _getSignalStrength(),
              style: TextStyle(
                color: _getSignalColor(),
                fontSize: 12,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              _formatLastSync(),
              style: const TextStyle(
                color: Colors.grey,
                fontSize: 12,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
