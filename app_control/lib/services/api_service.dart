import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/room.dart';
import '../models/room_data.dart';

class ApiService {
  // Thay YOUR_SERVER_IP bằng IP thực tế của server
  static const String baseUrl = 'http://192.168.190.51:8001';
  
  final storage = const FlutterSecureStorage();
  String? _token;

  // Login
  Future<Map<String, dynamic>> login(String username, String password) async {
    final uri = Uri.parse('$baseUrl/auth/login');
    try {
      final response = await http
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'username': username,
              'password': password,
            }),
          )
          .timeout(const Duration(seconds: 12));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _token = data['access_token'];

        // Lưu token vào secure storage
        await storage.write(key: 'auth_token', value: _token);
        await storage.write(
          key: 'user_info',
          value: jsonEncode(data['user_info']),
        );

        return data;
      }

      try {
        final error = jsonDecode(response.body);
        throw Exception(error['detail'] ?? 'Đăng nhập thất bại');
      } catch (_) {
        throw Exception(
          'Đăng nhập thất bại (HTTP ${response.statusCode}): ${response.body}',
        );
      }
    } on SocketException catch (e) {
      throw Exception(
        'Không kết nối được tới server ($baseUrl). Chi tiết: ${e.message}',
      );
    } on HttpException catch (e) {
      throw Exception('Lỗi HTTP khi gọi đăng nhập: ${e.message}');
    } on FormatException {
      throw Exception('Phản hồi từ server không đúng định dạng JSON');
    } on TimeoutException {
      throw Exception('Kết nối tới server bị timeout: $baseUrl');
    }
  }

  // Load token from storage
  Future<void> loadToken() async {
    _token = await storage.read(key: 'auth_token');
  }

  // Check if logged in
  Future<bool> isLoggedIn() async {
    await loadToken();
    return _token != null;
  }

  // Logout
  Future<void> logout() async {
    _token = null;
    await storage.delete(key: 'auth_token');
    await storage.delete(key: 'user_info');
  }

  // Get relay status
  Future<Map<String, dynamic>> getRelayStatus() async {
    if (_token == null) await loadToken();
    
    final response = await http.get(
      Uri.parse('$baseUrl/relay/status'),
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      throw Exception('Không lấy được trạng thái relay');
    }
  }

  // Control relay
  Future<void> controlRelay(int relay, String state) async {
    if (_token == null) await loadToken();
    
    final response = await http.post(
      Uri.parse('$baseUrl/relay/control'),
      headers: {
        'Authorization': 'Bearer $_token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'relay': relay,
        'state': state,
      }),
    );

    if (response.statusCode == 200) {
      return;
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Điều khiển thất bại');
    }
  }

  // Get user info
  Future<Map<String, dynamic>?> getUserInfo() async {
    final userInfoStr = await storage.read(key: 'user_info');
    if (userInfoStr != null) {
      return jsonDecode(userInfoStr);
    }
    return null;
  }

  // Get AC status
  Future<Map<String, dynamic>> getAcStatus() async {
    if (_token == null) await loadToken();

    final response = await http.get(
      Uri.parse('$baseUrl/ac/status'),
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Không lấy được trạng thái máy lạnh');
    }
  }

  // Control AC command: on/off/up/down
  Future<Map<String, dynamic>> controlAc(String command) async {
    if (_token == null) await loadToken();

    final response = await http.post(
      Uri.parse('$baseUrl/ac/control'),
      headers: {
        'Authorization': 'Bearer $_token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'command': command}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Điều khiển máy lạnh thất bại');
    }
  }

  // ========== NEW ROOM-BASED APIs ==========

  // Get list of rooms user has access to
  Future<List<Room>> getRooms() async {
    if (_token == null) await loadToken();

    final response = await http.get(
      Uri.parse('$baseUrl/rooms'),
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      final roomsList = <Room>[];
      
      for (var roomJson in data['rooms'] as List) {
        roomsList.add(Room.fromJson(roomJson as Map<String, dynamic>));
      }
      
      return roomsList;
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      throw Exception('Không lấy được danh sách phòng');
    }
  }

  // Get room data with all devices and metrics
  Future<RoomData> getRoomData(int roomId) async {
    if (_token == null) await loadToken();

    final response = await http.get(
      Uri.parse('$baseUrl/rooms/$roomId/data'),
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return RoomData.fromJson(data);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Không lấy được dữ liệu phòng');
    }
  }

  // Control relay in a room
  Future<void> controlRoomRelay({
    required int roomId,
    required String deviceId,
    required int relay,
    required String state,
  }) async {
    if (_token == null) await loadToken();

    final response = await http.post(
      Uri.parse('$baseUrl/rooms/$roomId/control'),
      headers: {
        'Authorization': 'Bearer $_token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'device_id': deviceId,
        'relay': relay,
        'state': state,
      }),
    );

    if (response.statusCode == 200) {
      return;
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Điều khiển thất bại');
    }
  }

  // Get devices list for dropdown
  Future<List<Map<String, dynamic>>> getDevicesForDropdown({int? phongId}) async {
    if (_token == null) await loadToken();

    var uri = Uri.parse('$baseUrl/devices');
    if (phongId != null) {
      uri = uri.replace(queryParameters: {'phong_id': phongId.toString()});
    }

    final response = await http.get(
      uri,
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return List<Map<String, dynamic>>.from(data['devices'] ?? []);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      throw Exception('Không lấy được danh sách thiết bị');
    }
  }

  // Get relay names for a device
  Future<List<Map<String, dynamic>>> getDeviceRelays(String deviceId) async {
    if (_token == null) await loadToken();

    final response = await http.get(
      Uri.parse('$baseUrl/devices/$deviceId/relays'),
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      return List<Map<String, dynamic>>.from(data['relays'] ?? []);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      throw Exception('Không lấy được danh sách relay');
    }
  }

  // ========== RULES APIs ==========

  // Get all conditional rules
  Future<List<dynamic>> getRules({int? phongId, String? trangThai}) async {
    if (_token == null) await loadToken();

    var uri = Uri.parse('$baseUrl/rules');
    final params = <String, String>{};
    if (phongId != null) params['phong_id'] = phongId.toString();
    if (trangThai != null) params['trang_thai'] = trangThai;
    if (params.isNotEmpty) {
      uri = uri.replace(queryParameters: params);
    }

    final response = await http.get(
      uri,
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['rules'] ?? [];
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      throw Exception('Không lấy được danh sách rules');
    }
  }

  // Create conditional rule
  Future<Map<String, dynamic>> createRule(Map<String, dynamic> ruleData) async {
    if (_token == null) await loadToken();

    final response = await http.post(
      Uri.parse('$baseUrl/rules'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      },
      body: jsonEncode(ruleData),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Tạo rule thất bại');
    }
  }

  // Update conditional rule
  Future<Map<String, dynamic>> updateRule(
      int ruleId, Map<String, dynamic> ruleData) async {
    if (_token == null) await loadToken();

    final response = await http.put(
      Uri.parse('$baseUrl/rules/$ruleId'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      },
      body: jsonEncode(ruleData),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Cập nhật rule thất bại');
    }
  }

  // Delete conditional rule
  Future<void> deleteRule(int ruleId) async {
    if (_token == null) await loadToken();

    final response = await http.delete(
      Uri.parse('$baseUrl/rules/$ruleId'),
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      return;
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Xóa rule thất bại');
    }
  }

  // ========== SCHEDULED RULES APIs ==========

  // Get all scheduled rules
  Future<List<dynamic>> getScheduledRules(
      {int? phongId, String? trangThai}) async {
    if (_token == null) await loadToken();

    var uri = Uri.parse('$baseUrl/scheduled-rules');
    final params = <String, String>{};
    if (phongId != null) params['phong_id'] = phongId.toString();
    if (trangThai != null) params['trang_thai'] = trangThai;
    if (params.isNotEmpty) {
      uri = uri.replace(queryParameters: params);
    }

    final response = await http.get(
      uri,
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['scheduled_rules'] ?? [];
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      throw Exception('Không lấy được danh sách scheduled rules');
    }
  }

  // Create scheduled rule
  Future<Map<String, dynamic>> createScheduledRule(
      Map<String, dynamic> ruleData) async {
    if (_token == null) await loadToken();

    final response = await http.post(
      Uri.parse('$baseUrl/scheduled-rules'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      },
      body: jsonEncode(ruleData),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Tạo scheduled rule thất bại');
    }
  }

  // Update scheduled rule
  Future<Map<String, dynamic>> updateScheduledRule(
      int ruleId, Map<String, dynamic> ruleData) async {
    if (_token == null) await loadToken();

    final response = await http.put(
      Uri.parse('$baseUrl/scheduled-rules/$ruleId'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_token',
      },
      body: jsonEncode(ruleData),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Cập nhật scheduled rule thất bại');
    }
  }

  // Delete scheduled rule
  Future<void> deleteScheduledRule(int ruleId) async {
    if (_token == null) await loadToken();

    final response = await http.delete(
      Uri.parse('$baseUrl/scheduled-rules/$ruleId'),
      headers: {
        'Authorization': 'Bearer $_token',
      },
    );

    if (response.statusCode == 200) {
      return;
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Phiên đăng nhập hết hạn');
    } else {
      final error = jsonDecode(response.body);
      throw Exception(error['detail'] ?? 'Xóa scheduled rule thất bại');
    }
  }
}
