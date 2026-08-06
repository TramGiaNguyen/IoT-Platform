import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import '../models/widget_config.dart';

/// HTTP client giao tiếp với ESP.
///
/// ESP generator (xem `react_dashboard/src/utils/standaloneESPGenerator.js`)
/// đăng ký mỗi widget với route pattern: `/<widget_type>/<sanitized_id>`,
/// và đăng ký route `/<serverEndpoint>` (mặc định `control`) trả về HTML UI.
///
/// Client này gửi lệnh điều khiển qua GET request tới các endpoint này.
/// Mỗi lệnh có thể truyền state/value qua query string hoặc body.
class EspClient {
  final Duration timeout;

  EspClient({this.timeout = const Duration(seconds: 5)});

  /// Danh sách base URL ưu tiên - thử theo thứ tự.
  /// Trong AP mode: ESP phát WiFi `apSsid`, mặc định IP là `192.168.4.1`.
  /// Trong STA mode: cùng mạng LAN, dùng hostname hoặc IP tĩnh.
  List<String> candidateBaseUrls(WidgetConfig widget, {
    required String apSsid,
    required String apPassword,
    required int serverPort,
    required String serverEndpoint,
    required String apLocalIp,
    String? staHostname,
    int? staPort,
  }) {
    final urls = <String>[
      'http://$apLocalIp:$serverPort', // AP default
      'http://$apSsid.local:$serverPort', // mDNS
    ];
    if (staHostname != null && staHostname.isNotEmpty) {
      urls.add('http://$staHostname:${staPort ?? serverPort}');
    }
    return urls;
  }

  /// Ping ESP bằng cách GET `/` hoặc `/<serverEndpoint>`.
  /// Trả về true nếu có ESP phản hồi 200.
  Future<bool> ping(String baseUrl, {String serverEndpoint = 'control'}) async {
    for (final path in ['/', '/$serverEndpoint']) {
      try {
        final resp = await http
            .get(Uri.parse('$baseUrl$path'))
            .timeout(timeout);
        if (resp.statusCode == 200) return true;
      } catch (_) {
        // try next base URL
      }
    }
    return false;
  }

  /// Thử ping qua nhiều base URL, trả về URL đầu tiên thành công.
  Future<String?> findReachableEsp(List<String> baseUrls,
      {String serverEndpoint = 'control'}) async {
    for (final base in baseUrls) {
      if (await ping(base, serverEndpoint: serverEndpoint)) return base;
    }
    return null;
  }

  /// Gửi lệnh điều khiển tới widget cụ thể.
  /// `widget.endpointUrl(baseUrl)` tạo URL đúng pattern ESP đã đăng ký.
  ///
  /// Payload (nếu có) sẽ được encode vào query string cho GET.
  /// ESP generator sử dụng HTTP_GET cho hầu hết handler nên GET là đủ.
  Future<bool> sendCommand({
    required WidgetConfig widget,
    required String baseUrl,
    Map<String, dynamic> query = const {},
  }) async {
    final url = widget.endpointUrl(baseUrl);
    final uri = Uri.parse(url).replace(queryParameters: {
      ...Uri.parse(url).queryParameters,
      ...query.map((k, v) => MapEntry(k, v.toString())),
    });
    try {
      final resp = await http.get(uri).timeout(timeout);
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Gửi nhiều lệnh liên tiếp - dùng cho joystick (gửi X + Y).
  Future<bool> sendCommands({
    required WidgetConfig widget,
    required String baseUrl,
    required List<Map<String, dynamic>> queries,
  }) async {
    bool allOk = true;
    for (final q in queries) {
      final ok = await sendCommand(
        widget: widget,
        baseUrl: baseUrl,
        query: q,
      );
      if (!ok) allOk = false;
    }
    return allOk;
  }

  /// Gửi payload POST (nếu sau này ESP hỗ trợ).
  Future<bool> postCommand({
    required WidgetConfig widget,
    required String baseUrl,
    required Map<String, dynamic> body,
  }) async {
    final url = widget.endpointUrl(baseUrl);
    try {
      final resp = await http
          .post(Uri.parse(url),
              headers: {'Content-Type': 'application/json'},
              body: json.encode(body))
          .timeout(timeout);
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}