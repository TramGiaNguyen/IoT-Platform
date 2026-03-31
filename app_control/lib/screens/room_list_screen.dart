import 'package:flutter/material.dart';
import 'dart:async';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../models/room.dart';
import '../widgets/room_card.dart';
import 'room_detail_screen.dart';
import 'login_screen.dart';

class RoomListScreen extends StatefulWidget {
  const RoomListScreen({Key? key}) : super(key: key);

  @override
  State<RoomListScreen> createState() => _RoomListScreenState();
}

class _RoomListScreenState extends State<RoomListScreen> {
  final _apiService = ApiService();
  final _wsService = WebSocketService();
  List<Room> _rooms = [];
  List<Room> _filteredRooms = [];
  bool _isLoading = true;
  String? _error;
  Timer? _refreshTimer;
  StreamSubscription? _wsSubscription;
  final _searchController = TextEditingController();
  Map<String, dynamic>? _userInfo;

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
    _loadRooms();
    // Don't connect WebSocket immediately - wait for successful data load
    // _connectWebSocket();
    // Auto refresh every 30 seconds
    _refreshTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _loadRooms(silent: true),
    );
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _wsSubscription?.cancel();
    _searchController.dispose();
    _wsService.dispose();
    super.dispose();
  }

  void _connectWebSocket() {
    // Connect to WebSocket
    _wsService.connect();
    
    // Listen to events (for future use - can update room stats)
    _wsSubscription = _wsService.eventStream.listen((event) {
      // Can be used to update device online/offline counts in real-time
      // For now, we rely on periodic refresh
    });
  }

  Future<void> _loadUserInfo() async {
    final userInfo = await _apiService.getUserInfo();
    if (mounted) {
      setState(() {
        _userInfo = userInfo;
      });
    }
  }

  Future<void> _loadRooms({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final rooms = await _apiService.getRooms();
      if (mounted) {
        setState(() {
          _rooms = rooms;
          _filteredRooms = rooms;
          _isLoading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceAll('Exception: ', '');
          _isLoading = false;
        });

        if (_error!.contains('hết hạn')) {
          _logout();
        }
      }
    }
  }

  void _filterRooms(String query) {
    setState(() {
      if (query.isEmpty) {
        _filteredRooms = _rooms;
      } else {
        _filteredRooms = _rooms
            .where((room) =>
                room.name.toLowerCase().contains(query.toLowerCase()) ||
                (room.description?.toLowerCase().contains(query.toLowerCase()) ??
                    false))
            .toList();
      }
    });
  }

  Future<void> _logout() async {
    await _apiService.logout();
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Phòng của tôi'),
        backgroundColor: Colors.blue.shade900,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadRooms,
            tooltip: 'Làm mới',
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.account_circle),
            onSelected: (value) {
              if (value == 'logout') {
                _logout();
              }
            },
            itemBuilder: (context) => [
              if (_userInfo != null)
                PopupMenuItem(
                  enabled: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _userInfo!['username'] ?? '',
                        style: const TextStyle(fontWeight: FontWeight.bold),
                      ),
                      Text(
                        _userInfo!['role'] ?? '',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout, size: 20),
                    SizedBox(width: 8),
                    Text('Đăng xuất'),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 60,
                        color: Colors.red,
                      ),
                      const SizedBox(height: 16),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: Text(
                          _error!,
                          textAlign: TextAlign.center,
                        ),
                      ),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadRooms,
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => _loadRooms(),
                  child: Column(
                    children: [
                      // Search bar
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: TextField(
                          controller: _searchController,
                          decoration: InputDecoration(
                            hintText: 'Tìm kiếm phòng...',
                            prefixIcon: const Icon(Icons.search),
                            suffixIcon: _searchController.text.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.clear),
                                    onPressed: () {
                                      _searchController.clear();
                                      _filterRooms('');
                                    },
                                  )
                                : null,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            filled: true,
                            fillColor: Colors.grey[100],
                          ),
                          onChanged: _filterRooms,
                        ),
                      ),

                      // Room count
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          children: [
                            Text(
                              '${_filteredRooms.length} phòng',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.grey[600],
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),

                      // Room list
                      Expanded(
                        child: _filteredRooms.isEmpty
                            ? Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.meeting_room_outlined,
                                      size: 80,
                                      color: Colors.grey[400],
                                    ),
                                    const SizedBox(height: 16),
                                    Text(
                                      _searchController.text.isNotEmpty
                                          ? 'Không tìm thấy phòng'
                                          : 'Chưa có phòng nào',
                                      style: TextStyle(
                                        fontSize: 16,
                                        color: Colors.grey[600],
                                      ),
                                    ),
                                  ],
                                ),
                              )
                            : ListView.builder(
                                padding: const EdgeInsets.all(16),
                                itemCount: _filteredRooms.length,
                                itemBuilder: (context, index) {
                                  final room = _filteredRooms[index];
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: RoomCard(
                                      room: room,
                                      onTap: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => RoomDetailScreen(
                                              room: room,
                                            ),
                                          ),
                                        );
                                      },
                                    ),
                                  );
                                },
                              ),
                      ),
                    ],
                  ),
                ),
    );
  }
}
