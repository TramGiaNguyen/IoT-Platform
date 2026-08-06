import 'dart:async';
import 'dart:io' show Platform;
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:permission_handler/permission_handler.dart';

/// Helper kiểm tra kết nối WiFi hiện tại của thiết bị và hỗ trợ mở cài đặt WiFi.
///
/// Lưu ý:
/// - Flutter không thể trực tiếp connect WiFi programmatically trên Android/iOS
///   mà không can thiệp OS (yêu cầu root/đặc quyền). Thay vào đó app sẽ:
///   1. Đọc SSID hiện tại (qua network_info_plus)
///   2. Mở màn hình cài đặt WiFi của hệ thống để user tự kết nối
///   3. Sau khi user kết nối, app quay lại và tự động ping ESP
class WiFiHelper {
  final NetworkInfo _networkInfo = NetworkInfo();
  final Connectivity _connectivity = Connectivity();

  /// Lấy SSID WiFi hiện tại (Android cần permission ACCESS_FINE_LOCATION).
  Future<String?> getCurrentSsid() async {
    if (Platform.isAndroid) {
      // Xin quyền location nếu chưa có
      final status = await Permission.locationWhenInUse.request();
      if (!status.isGranted) return null;
    }
    try {
      return await _networkInfo.getWifiName();
    } catch (_) {
      return null;
    }
  }

  /// Kiểm tra thiết bị hiện tại có đang kết nối tới SSID của ESP không.
  Future<bool> isConnectedToEspSsid(String targetSsid) async {
    final current = await getCurrentSsid();
    if (current == null) return false;
    // Android thêm prefix "..."
    final cleanCurrent = current.replaceAll('"', '').trim();
    return cleanCurrent == targetSsid.trim();
  }

  /// Kiểm tra có kết nối WiFi nào không.
  Future<bool> isWifiConnected() async {
    final results = await _connectivity.checkConnectivity();
    return results.any((r) => r == ConnectivityResult.wifi);
  }

  /// Lấy IP local hiện tại của thiết bị.
  Future<String?> getLocalIp() async {
    try {
      return await _networkInfo.getWifiIP();
    } catch (_) {
      return null;
    }
  }

  /// Lấy BSSID (MAC address) của WiFi AP hiện tại.
  Future<String?> getBssid() async {
    try {
      return await _networkInfo.getWifiBSSID();
    } catch (_) {
      return null;
    }
  }
}