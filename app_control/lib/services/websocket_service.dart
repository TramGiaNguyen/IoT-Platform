import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class WebSocketService {
  static const String baseUrl = 'ws://192.168.190.101:8001';
  
  WebSocketChannel? _channel;
  final _storage = const FlutterSecureStorage();
  final _eventController = StreamController<Map<String, dynamic>>.broadcast();
  Timer? _reconnectTimer;
  bool _isConnecting = false;
  bool _shouldReconnect = true;
  
  // Public stream for listening to events
  Stream<Map<String, dynamic>> get eventStream => _eventController.stream;
  
  bool get isConnected => _channel != null;
  
  Future<void> connect() async {
    if (_isConnecting || _channel != null) return;
    
    _isConnecting = true;
    _shouldReconnect = true;
    
    try {
      // Get token
      final token = await _storage.read(key: 'auth_token');
      if (token == null) {
        print('[WebSocket] No token found, skipping connection');
        _isConnecting = false;
        return;
      }
      
      // Connect to WebSocket
      final wsUrl = '$baseUrl/ws/events?token=$token';
      print('[WebSocket] Connecting to $wsUrl');
      
      _channel = WebSocketChannel.connect(
        Uri.parse(wsUrl),
        // Add timeout to prevent hanging
      );
      
      // Listen to messages with timeout
      _channel!.stream.timeout(
        const Duration(seconds: 10),
        onTimeout: (sink) {
          print('[WebSocket] Connection timeout');
          sink.close();
          _handleDisconnect();
        },
      ).listen(
        (message) {
          try {
            final data = jsonDecode(message as String) as Map<String, dynamic>;
            
            // Skip ping messages
            if (data['type'] == 'ping') return;
            
            // Broadcast event
            _eventController.add(data);
            print('[WebSocket] Event received: ${data['device_id']}');
          } catch (e) {
            print('[WebSocket] Error parsing message: $e');
          }
        },
        onError: (error) {
          print('[WebSocket] Error: $error');
          _handleDisconnect();
        },
        onDone: () {
          print('[WebSocket] Connection closed');
          _handleDisconnect();
        },
      );
      
      print('[WebSocket] Connected successfully');
      _isConnecting = false;
      
    } catch (e) {
      print('[WebSocket] Connection error: $e');
      _isConnecting = false;
      _handleDisconnect();
    }
  }
  
  void _handleDisconnect() {
    _channel = null;
    _isConnecting = false;
    
    // Auto reconnect after 5 seconds
    if (_shouldReconnect) {
      _reconnectTimer?.cancel();
      _reconnectTimer = Timer(const Duration(seconds: 5), () {
        print('[WebSocket] Attempting to reconnect...');
        connect();
      });
    }
  }
  
  void disconnect() {
    _shouldReconnect = false;
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _channel = null;
    print('[WebSocket] Disconnected');
  }
  
  void dispose() {
    disconnect();
    _eventController.close();
  }
}
