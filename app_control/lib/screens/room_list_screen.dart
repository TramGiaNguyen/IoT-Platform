import 'package:flutter/material.dart';
import 'dart:async';
import '../services/api_service.dart';
import '../services/websocket_service.dart';
import '../models/room.dart';
import '../widgets/room_card.dart';
import 'room_detail_screen.dart';
import 'login_screen.dart';
import 'rules_screen.dart';

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
    _wsService.connect();
    
    _wsSubscription = _wsService.eventStream.listen((event) {
      // Can be used to update device online/offline counts in real-time
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

        if (_error!.contains('het han')) {
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
      body: Container(
        decoration: const BoxDecoration(
          color: Color(0xFFF7FAFC),
        ),
        child: Column(
          children: [
            // Glassmorphism App Bar
            Container(
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 8,
                left: 8,
                right: 8,
                bottom: 8,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFF7FAFC).withOpacity(0.4),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0F1C1E06),
                    blurRadius: 24,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Phong cua toi',
                          style: TextStyle(
                            fontFamily: 'Manrope',
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.02,
                            color: Color(0xFF003345),
                          ),
                        ),
                      ),
                      IconButton(
                        icon: const Icon(
                          Icons.rule,
                          color: Color(0xFF006a6a),
                        ),
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const RulesScreen(),
                            ),
                          );
                        },
                      ),
                      IconButton(
                        icon: const Icon(
                          Icons.refresh,
                          color: Color(0xFF006a6a),
                        ),
                        onPressed: _loadRooms,
                      ),
                      PopupMenuButton<String>(
                        icon: const Icon(
                          Icons.account_circle,
                          color: Color(0xFF003345),
                        ),
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
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF003345),
                                    ),
                                  ),
                                  Text(
                                    _userInfo!['role'] ?? '',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Color(0xFF40484C),
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
                                Icon(Icons.logout, size: 20, color: Color(0xFFBA1A1A)),
                                SizedBox(width: 8),
                                Text('Dang xuat', style: TextStyle(color: Color(0xFFBA1A1A))),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFF006a6a),
                      ),
                    )
                  : _error != null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.error_outline,
                                size: 64,
                                color: Color(0xFFBA1A1A),
                              ),
                              const SizedBox(height: 16),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 32),
                                child: Text(
                                  _error!,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(color: Color(0xFF40484C)),
                                ),
                              ),
                              const SizedBox(height: 16),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    colors: [Color(0xFF003345), Color(0xFF004B63)],
                                  ),
                                  borderRadius: BorderRadius.circular(9999),
                                ),
                                child: const Text(
                                  'Thu lai',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontFamily: 'Manrope',
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: () => _loadRooms(),
                          color: const Color(0xFF006a6a),
                          child: Column(
                            children: [
                              // Search bar
                              Padding(
                                padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                                child: TextField(
                                  controller: _searchController,
                                  decoration: InputDecoration(
                                    hintText: 'Tim kiem phong...',
                                    prefixIcon: const Icon(
                                      Icons.search,
                                      color: Color(0xFF006a6a),
                                    ),
                                    suffixIcon: _searchController.text.isNotEmpty
                                        ? IconButton(
                                            icon: const Icon(Icons.clear, color: Color(0xFF40484C)),
                                            onPressed: () {
                                              _searchController.clear();
                                              _filterRooms('');
                                            },
                                          )
                                        : null,
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      borderSide: BorderSide(
                                        color: const Color(0xFFC0C7CD).withOpacity(0.15),
                                      ),
                                    ),
                                    enabledBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      borderSide: BorderSide(
                                        color: const Color(0xFFC0C7CD).withOpacity(0.15),
                                      ),
                                    ),
                                    focusedBorder: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                      borderSide: BorderSide(
                                        color: const Color(0xFF006a6a).withOpacity(0.3),
                                        width: 2,
                                      ),
                                    ),
                                    filled: true,
                                    fillColor: const Color(0xFFF1F4F6),
                                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                                  ),
                                  onChanged: _filterRooms,
                                ),
                              ),

                              // Room count
                              Padding(
                                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                                child: Row(
                                  children: [
                                    Text(
                                      '${_filteredRooms.length} PHONG',
                                      style: const TextStyle(
                                        fontFamily: 'Inter',
                                        fontSize: 10,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 0.15,
                                        color: Color(0xFF40484C),
                                      ),
                                    ),
                                  ],
                                ),
                              ),

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
                                              color: const Color(0xFFC0C7CD),
                                            ),
                                            const SizedBox(height: 16),
                                            Text(
                                              _searchController.text.isNotEmpty
                                                  ? 'Khong tim thay phong'
                                                  : 'Chua co phong nao',
                                              style: const TextStyle(
                                                fontSize: 16,
                                                color: Color(0xFF40484C),
                                              ),
                                            ),
                                          ],
                                        ),
                                      )
                                    : ListView.builder(
                                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                                        itemCount: _filteredRooms.length,
                                        itemBuilder: (context, index) {
                                          final room = _filteredRooms[index];
                                          return RoomCard(
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
                                          );
                                        },
                                      ),
                              ),
                            ],
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
