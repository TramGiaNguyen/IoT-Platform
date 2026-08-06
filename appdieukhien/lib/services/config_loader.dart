import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;

import '../models/standalone_config.dart';

/// Kết quả load config - có thể là thành công, lỗi parse, hoặc user cancel.
class ConfigLoadResult {
  final StandaloneConfig? config;
  final String? error;
  final bool cancelled;
  final String? sourceLabel; // ví dụ: 'file.json', 'asset:sample_config.json'

  const ConfigLoadResult._({
    this.config,
    this.error,
    this.cancelled = false,
    this.sourceLabel,
  });

  factory ConfigLoadResult.success(StandaloneConfig config, String label) =>
      ConfigLoadResult._(config: config, sourceLabel: label);

  factory ConfigLoadResult.failure(String error) =>
      ConfigLoadResult._(error: error);

  factory ConfigLoadResult.cancelled() => const ConfigLoadResult._(cancelled: true);

  bool get isSuccess => config != null;
}

/// Load cấu hình ESP từ nhiều nguồn: file JSON, asset, hoặc API backend.
class ConfigLoader {
  /// Mo file picker de user chon file JSON xuat tu React Dashboard.
  Future<ConfigLoadResult> loadFromFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) {
        return ConfigLoadResult.cancelled();
      }
      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null) {
        return ConfigLoadResult.failure('File rong hoac khong doc duoc.');
      }
      final raw = utf8.decode(bytes);
      final config = StandaloneConfig.fromJsonString(raw);
      if (!config.isValid) {
        return ConfigLoadResult.failure('File JSON khong hop le.');
      }
      return ConfigLoadResult.success(config, file.name);
    } catch (e) {
      return ConfigLoadResult.failure('Loi doc file: $e');
    }
  }

  /// Load file JSON mẫu được bundle sẵn trong assets (dùng cho demo).
  Future<ConfigLoadResult> loadFromAsset({String path = 'assets/sample_config.json'}) async {
    try {
      final raw = await rootBundle.loadString(path);
      final config = StandaloneConfig.fromJsonString(raw);
      if (!config.isValid) {
        return ConfigLoadResult.failure('Asset JSON không hợp lệ.');
      }
      return ConfigLoadResult.success(config, 'asset:$path');
    } catch (e) {
      return ConfigLoadResult.failure('Lỗi load asset: $e');
    }
  }

  /// Fetch config từ backend API public (theo device_code).
  /// URL ví dụ: https://yourserver.com/api/public/standalone-config/ESP001
  Future<ConfigLoadResult> loadFromApi(String apiUrl) async {
    try {
      final uri = Uri.parse(apiUrl);
      final resp = await http.get(uri).timeout(const Duration(seconds: 10));
      if (resp.statusCode != 200) {
        return ConfigLoadResult.failure('HTTP ${resp.statusCode}: ${resp.body}');
      }
      final config = StandaloneConfig.fromJsonString(resp.body);
      if (!config.isValid) {
        return ConfigLoadResult.failure('API response không hợp lệ.');
      }
      return ConfigLoadResult.success(config, 'api:$apiUrl');
    } catch (e) {
      return ConfigLoadResult.failure('Lỗi gọi API: $e');
    }
  }
}