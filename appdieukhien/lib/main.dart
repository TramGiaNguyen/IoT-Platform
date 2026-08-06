import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'screens/home_screen.dart';
import 'services/config_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Khóa orientation - cho phép xoay khi vào ControlScreen
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  runApp(const AppDieuKhien());
}

class AppDieuKhien extends StatelessWidget {
  const AppDieuKhien({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ConfigProvider()),
      ],
      child: MaterialApp(
        title: 'ESP Controller',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.dark,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF00e5ff),
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: const Color(0xFF06121f),
        ),
        home: const HomeScreen(),
      ),
    );
  }
}