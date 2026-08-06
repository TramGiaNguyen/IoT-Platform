import 'package:flutter/foundation.dart';

import '../models/standalone_config.dart';

/// State toàn cục cho cấu hình ESP đang load + trạng thái kết nối.
///
/// Được khởi tạo qua `MultiProvider` ở main.dart và truy cập qua
/// `context.watch<ConfigProvider>()` trong các màn hình.
class ConfigProvider extends ChangeNotifier {
  StandaloneConfig? _config;
  String? _error;
  String? _sourceLabel;
  String? _activeBaseUrl; // base URL ESP đang kết nối thành công
  bool _connecting = false;

  StandaloneConfig? get config => _config;
  String? get error => _error;
  String? get sourceLabel => _sourceLabel;
  String? get activeBaseUrl => _activeBaseUrl;
  bool get connecting => _connecting;
  bool get hasConfig => _config != null;

  void setConfig(StandaloneConfig cfg, {String? label}) {
    _config = cfg;
    _sourceLabel = label;
    _error = null;
    notifyListeners();
  }

  void setError(String message) {
    _error = message;
    notifyListeners();
  }

  void setConnecting(bool value) {
    _connecting = value;
    notifyListeners();
  }

  void setActiveBaseUrl(String? url) {
    _activeBaseUrl = url;
    notifyListeners();
  }

  void clear() {
    _config = null;
    _error = null;
    _sourceLabel = null;
    _activeBaseUrl = null;
    _connecting = false;
    notifyListeners();
  }
}