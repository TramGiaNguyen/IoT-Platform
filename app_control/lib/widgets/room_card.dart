import 'package:flutter/material.dart';
import '../models/room.dart';

class RoomCard extends StatelessWidget {
  final Room room;
  final VoidCallback onTap;

  const RoomCard({
    Key? key,
    required this.room,
    required this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: const Color(0xFFC0C7CD).withOpacity(0.15),
          width: 1,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F1C1E10),
            blurRadius: 32,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(24),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header with icon and name
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF90EFEF).withOpacity(0.2),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: const Icon(
                        Icons.meeting_room,
                        color: Color(0xFF006a6a),
                        size: 28,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            room.name,
                            style: const TextStyle(
                              fontFamily: 'Manrope',
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.02,
                              color: Color(0xFF003345),
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (room.description != null &&
                              room.description!.isNotEmpty)
                            Text(
                              room.description!,
                              style: const TextStyle(
                                fontFamily: 'Inter',
                                fontSize: 12,
                                color: Color(0xFF40484C),
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.chevron_right,
                      color: Color(0xFF006a6a),
                      size: 28,
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Device stats - pill shaped chips with dot indicator
                Row(
                  children: [
                    Expanded(
                      child: _buildStatChip(
                        icon: Icons.devices,
                        label: 'Thiet bi',
                        value: room.deviceCount.toString(),
                        color: const Color(0xFF003345),
                        bgColor: const Color(0xFF003345).withOpacity(0.08),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildStatChip(
                        icon: Icons.check_circle,
                        label: 'Online',
                        value: room.onlineCount.toString(),
                        color: const Color(0xFF006a6a),
                        bgColor: const Color(0xFF90EFEF).withOpacity(0.3),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildStatChip(
                        icon: Icons.person,
                        label: 'Nguoi',
                        value: room.occupancy.toString(),
                        color: room.occupancy > 0 ? const Color(0xFFA855F7) : const Color(0xFF40484C),
                        bgColor: room.occupancy > 0
                            ? const Color(0xFFA855F7).withOpacity(0.12)
                            : const Color(0xFFE0E3E5),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Last update
                if (room.lastUpdate != null)
                  Row(
                    children: [
                      const Icon(
                        Icons.access_time,
                        size: 14,
                        color: Color(0xFF71787D),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _formatLastUpdate(room.lastUpdate!),
                        style: const TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.5,
                          color: Color(0xFF71787D),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatChip({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
    required Color bgColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: color, size: 16),
              const SizedBox(width: 4),
              Text(
                value,
                style: TextStyle(
                  fontFamily: 'Manrope',
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.3,
              color: color.withOpacity(0.7),
            ),
          ),
        ],
      ),
    );
  }

  String _formatLastUpdate(DateTime lastUpdate) {
    final now = DateTime.now();
    final difference = now.difference(lastUpdate);

    if (difference.inSeconds < 60) {
      return 'Vua xong';
    } else if (difference.inMinutes < 60) {
      return '${difference.inMinutes} phut truoc';
    } else if (difference.inHours < 24) {
      return '${difference.inHours} gio truoc';
    } else {
      return '${difference.inDays} ngay truoc';
    }
  }
}
