import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'services/auth_service.dart';
import 'services/pairing_service.dart';
import 'services/api_service.dart';
import 'services/display_settings.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/pairing_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await WakelockPlus.enable();
  runApp(const EchoCompanionApp());
}

class EchoCompanionApp extends StatelessWidget {
  const EchoCompanionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ApiService()..init()),
        ChangeNotifierProvider(create: (_) => DisplaySettings()..load()),
        ChangeNotifierProxyProvider<ApiService, AuthService>(
          create: (context) => AuthService(context.read<ApiService>())..init(),
          update: (_, api, auth) {
            auth?.updateApi(api);
            return auth ?? AuthService(api);
          },
        ),
        ChangeNotifierProxyProvider<ApiService, PairingService>(
          create: (context) => PairingService(context.read<ApiService>()),
          update: (_, api, pairing) {
            pairing?.updateApi(api);
            return pairing ?? PairingService(api);
          },
        ),
      ],
      child: MaterialApp(
        title: 'Echo Companion',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark(useMaterial3: true).copyWith(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF5C7CFA),
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: const Color(0xFF0F0F0F),
          cardColor: const Color(0xFF1A1A1A),
        ),
        home: const AuthGate(),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthService>(
      builder: (context, auth, _) {
        if (auth.isLoading) return const SplashScreen();
        if (!auth.isAuthenticated) return const LoginScreen();
        if (!auth.isPaired) return const PairingScreen();
        return const HomeScreen();
      },
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.record_voice_over, size: 64, color: Color(0xFF5C7CFA)),
            SizedBox(height: 16),
            Text('Echo Companion', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
            SizedBox(height: 24),
            CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
