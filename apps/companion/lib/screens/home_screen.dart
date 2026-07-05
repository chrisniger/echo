import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';
import 'assistant_screen.dart';
import 'transcript_screen.dart';
import 'controls_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  final _screens = const [
    AssistantScreen(),
    TranscriptScreen(),
    ControlsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.chat), label: 'Assistant'),
          NavigationDestination(icon: Icon(Icons.transcribe), label: 'Transcript'),
          NavigationDestination(icon: Icon(Icons.gamepad), label: 'Controls'),
        ],
      ),
    );
  }
}
