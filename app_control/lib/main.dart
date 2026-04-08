import 'package:flutter/material.dart';
import 'services/api_service.dart';
import 'screens/login_screen.dart';
import 'screens/room_list_screen.dart';

// Design System: Ethereal Sentinel
// Primary: #003345 | Secondary: #006a6a | Tertiary: #00353b
// Surface: #f7fafc → #e0e3e5
class AppTheme {
  static const Color primary = Color(0xFF003345);
  static const Color secondary = Color(0xFF006a6a);
  static const Color tertiary = Color(0xFF00353b);
  static const Color surface = Color(0xFFF7FAFC);
  static const Color surfaceContainerLow = Color(0xFFF1F4F6);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceContainerHigh = Color(0xFFE5E9EB);
  static const Color surfaceContainerHighest = Color(0xFFE0E3E5);
  static const Color outlineVariant = Color(0xFFC0C7CD);
  static const Color onSurface = Color(0xFF181C1E);
  static const Color onSurfaceVariant = Color(0xFF40484C);
  static const Color primaryContainer = Color(0xFF004B63);
  static const Color secondaryContainer = Color(0xFF90EFEF);
  static const Color onSecondaryContainer = Color(0xFF006E6E);
  static const Color tertiaryContainer = Color(0xFF004D56);
  static const Color onTertiary = Color(0xFFFFFFFF);
  static const Color error = Color(0xFFBA1A1A);

  static const double radiusXl = 24.0;
  static const double radiusLg = 16.0;
  static const double radiusFull = 9999.0;

  static const BoxShadow ambientShadow = BoxShadow(
    color: Color(0x0F1C1E10),
    blurRadius: 32,
    offset: Offset(0, 8),
  );

  static const BoxShadow appBarShadow = BoxShadow(
    color: Color(0x0F1C1E06),
    blurRadius: 24,
    offset: Offset(0, 8),
  );

  static BorderSide ghostBorder = BorderSide(
    color: outlineVariant.withOpacity(0.15),
    width: 1,
  );
}

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BDU IoT',
      debugShowCheckedModeBanner: false,
      theme: _buildLightTheme(),
      home: const SplashScreen(),
    );
  }

  ThemeData _buildLightTheme() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme(
        brightness: Brightness.light,
        primary: AppTheme.primary,
        onPrimary: Colors.white,
        primaryContainer: AppTheme.primaryContainer,
        onPrimaryContainer: const Color(0xFF83BAD6),
        secondary: AppTheme.secondary,
        onSecondary: Colors.white,
        secondaryContainer: AppTheme.secondaryContainer,
        onSecondaryContainer: AppTheme.onSecondaryContainer,
        tertiary: AppTheme.tertiary,
        onTertiary: AppTheme.onTertiary,
        tertiaryContainer: AppTheme.tertiaryContainer,
        onTertiaryContainer: const Color(0xFF31C4D7),
        error: AppTheme.error,
        onError: Colors.white,
        surface: AppTheme.surface,
        onSurface: AppTheme.onSurface,
        onSurfaceVariant: AppTheme.onSurfaceVariant,
        outline: const Color(0xFF71787D),
        outlineVariant: AppTheme.outlineVariant,
        shadow: AppTheme.onSurface,
        scrim: Colors.black,
        inverseSurface: const Color(0xFF2D3133),
        onInverseSurface: const Color(0xFFEEF1F3),
        inversePrimary: const Color(0xFF96CEEB),
        surfaceTint: const Color(0xFF2A657E),
      ),
      scaffoldBackgroundColor: AppTheme.surface,
      fontFamily: 'Inter',
      textTheme: const TextTheme(
        displayLarge: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w800, letterSpacing: -0.02),
        displayMedium: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w700, letterSpacing: -0.02),
        displaySmall: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w700, letterSpacing: -0.02),
        headlineLarge: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w700, letterSpacing: -0.02),
        headlineMedium: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w600, letterSpacing: -0.02),
        headlineSmall: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w600, letterSpacing: -0.02),
        titleLarge: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w600, letterSpacing: -0.01),
        titleMedium: TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w600),
        titleSmall: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600),
        bodyLarge: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w500),
        bodyMedium: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w500),
        bodySmall: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w400),
        labelLarge: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600, letterSpacing: 0.05),
        labelMedium: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600, letterSpacing: 0.05),
        labelSmall: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600, letterSpacing: 0.05),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusXl),
          side: AppTheme.ghostBorder,
        ),
        color: AppTheme.surfaceContainerLowest,
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusFull),
          ),
          textStyle: const TextStyle(
            fontFamily: 'Manrope',
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppTheme.surfaceContainerLow,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          borderSide: AppTheme.ghostBorder,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          borderSide: AppTheme.ghostBorder,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          borderSide: BorderSide(color: AppTheme.secondary.withOpacity(0.3), width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          borderSide: const BorderSide(color: AppTheme.error, width: 1),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: TextStyle(
          fontFamily: 'Inter',
          fontWeight: FontWeight.w600,
          fontSize: 11,
          letterSpacing: 0.5,
          color: AppTheme.onSurfaceVariant,
        ),
        hintStyle: TextStyle(
          fontFamily: 'Inter',
          color: AppTheme.outlineVariant,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppTheme.surface.withOpacity(0.4),
        foregroundColor: AppTheme.primary,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: const TextStyle(
          fontFamily: 'Manrope',
          fontWeight: FontWeight.w700,
          fontSize: 18,
          letterSpacing: -0.02,
          color: AppTheme.primary,
        ),
        iconTheme: const IconThemeData(color: AppTheme.primary),
      ),
      dividerTheme: const DividerThemeData(
        color: Colors.transparent,
        thickness: 0,
        space: 0,
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: AppTheme.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusFull),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return Colors.white;
          }
          return Colors.white;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppTheme.secondary;
          }
          return AppTheme.surfaceContainerHighest;
        }),
        trackOutlineColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppTheme.secondary.withOpacity(0.3);
          }
          return AppTheme.outlineVariant.withOpacity(0.3);
        }),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppTheme.primary,
        contentTextStyle: const TextStyle(
          fontFamily: 'Inter',
          color: Colors.white,
          fontWeight: FontWeight.w500,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: AppTheme.secondary,
        unselectedLabelColor: AppTheme.onSurfaceVariant,
        indicator: BoxDecoration(
          color: AppTheme.secondary.withOpacity(0.15),
          borderRadius: BorderRadius.circular(AppTheme.radiusFull),
        ),
        labelStyle: const TextStyle(
          fontFamily: 'Manrope',
          fontWeight: FontWeight.w600,
          fontSize: 13,
        ),
        unselectedLabelStyle: const TextStyle(
          fontFamily: 'Inter',
          fontWeight: FontWeight.w500,
          fontSize: 13,
        ),
        dividerColor: Colors.transparent,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: AppTheme.surfaceContainerLowest,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusXl),
        ),
        titleTextStyle: const TextStyle(
          fontFamily: 'Manrope',
          fontWeight: FontWeight.w700,
          fontSize: 18,
          color: AppTheme.primary,
        ),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppTheme.surfaceContainerLowest,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        ),
      ),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({Key? key}) : super(key: key);

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  final _apiService = ApiService();

  @override
  void initState() {
    super.initState();
    _checkLoginStatus();
  }

  Future<void> _checkLoginStatus() async {
    await Future.delayed(const Duration(milliseconds: 1200));
    
    final isLoggedIn = await _apiService.isLoggedIn();
    
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => isLoggedIn
              ? const RoomListScreen()
              : const LoginScreen(),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppTheme.primary,
              AppTheme.secondary,
            ],
          ),
        ),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(AppTheme.radiusXl),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      blurRadius: 40,
                      offset: const Offset(0, 16),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.power_settings_new,
                  size: 64,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 28),
              const Text(
                'BDU IoT',
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.02,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 48),
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
