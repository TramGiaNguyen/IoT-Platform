import 'package:flutter/material.dart';
import '../models/scheduled_rule.dart';

class ScheduledRuleCard extends StatelessWidget {
  final ScheduledRule rule;
  final VoidCallback onTap;
  final VoidCallback? onToggle;
  final VoidCallback? onDelete;

  const ScheduledRuleCard({
    Key? key,
    required this.rule,
    required this.onTap,
    this.onToggle,
    this.onDelete,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final isEnabled = rule.trangThai == 'enabled';

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
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        rule.tenRule,
                        style: const TextStyle(
                          fontFamily: 'Manrope',
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF003345),
                        ),
                      ),
                    ),
                    if (onToggle != null)
                      Switch(
                        value: isEnabled,
                        onChanged: (_) => onToggle!(),
                        activeColor: const Color(0xFF006a6a),
                      ),
                    if (onDelete != null)
                      IconButton(
                        icon: const Icon(Icons.delete_outline, color: Color(0xFFC0C7CD)),
                        onPressed: onDelete,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                
                // Schedule
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F4F6),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.schedule, size: 16, color: Color(0xFFA855F7)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          rule.displaySchedule,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: Color(0xFF181C1E),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                
                const SizedBox(height: 10),
                
                // Action
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F4F6),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.play_arrow, size: 16, color: Color(0xFF22C55E)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          rule.displayAction,
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 13,
                            color: Color(0xFF181C1E),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                
                const SizedBox(height: 12),
                
                // Status and last run
                Row(
                  children: [
                    // Status chip - pill with dot
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: isEnabled
                            ? const Color(0xFF90EFEF).withOpacity(0.3)
                            : const Color(0xFFE0E3E5),
                        borderRadius: BorderRadius.circular(9999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: isEnabled
                                  ? const Color(0xFF006a6a)
                                  : const Color(0xFF71787D),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            isEnabled ? 'Dang bat' : 'Da tat',
                            style: TextStyle(
                              fontFamily: 'Inter',
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: isEnabled
                                  ? const Color(0xFF006e6e)
                                  : const Color(0xFF40484C),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (rule.lastRunAt != null) ...[
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Chay lan cuoi: ${_formatDateTime(rule.lastRunAt!)}',
                          style: const TextStyle(
                            fontFamily: 'Inter',
                            fontSize: 11,
                            color: Color(0xFF71787D),
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatDateTime(DateTime dt) {
    return '${dt.day}/${dt.month} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
