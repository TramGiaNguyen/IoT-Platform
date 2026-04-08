import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/rule.dart';
import '../models/scheduled_rule.dart';
import '../widgets/rule_card.dart';
import '../widgets/scheduled_rule_card.dart';
import 'rule_form_screen.dart';
import 'scheduled_rule_form_screen.dart';

class RulesScreen extends StatefulWidget {
  final int? roomId;

  const RulesScreen({Key? key, this.roomId}) : super(key: key);

  @override
  State<RulesScreen> createState() => _RulesScreenState();
}

class _RulesScreenState extends State<RulesScreen>
    with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  late TabController _tabController;

  List<Rule> _conditionalRules = [];
  List<ScheduledRule> _scheduledRules = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadRules();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadRules() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final conditionalData = await _apiService.getRules(
        phongId: widget.roomId,
      );
      
      final scheduledData = await _apiService.getScheduledRules(
        phongId: widget.roomId,
      );

      setState(() {
        _conditionalRules = conditionalData
            .map((json) => Rule.fromJson(json as Map<String, dynamic>))
            .toList();
        _scheduledRules = scheduledData
            .map((json) => ScheduledRule.fromJson(json as Map<String, dynamic>))
            .toList();
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleConditionalRule(Rule rule) async {
    try {
      final newStatus = rule.trangThai == 'enabled' ? 'disabled' : 'enabled';
      await _apiService.updateRule(rule.id, {'trang_thai': newStatus});
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(newStatus == 'enabled' ? 'Da bat rule' : 'Da tat rule'),
          backgroundColor: const Color(0xFF006a6a),
        ),
      );
      
      _loadRules();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Loi: ${e.toString()}'),
          backgroundColor: const Color(0xFFBA1A1A),
        ),
      );
    }
  }

  Future<void> _toggleScheduledRule(ScheduledRule rule) async {
    try {
      final newStatus = rule.trangThai == 'enabled' ? 'disabled' : 'enabled';
      await _apiService.updateScheduledRule(rule.id, {'trang_thai': newStatus});
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(newStatus == 'enabled' ? 'Da bat lich trinh' : 'Da tat lich trinh'),
          backgroundColor: const Color(0xFF006a6a),
        ),
      );
      
      _loadRules();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Loi: ${e.toString()}'),
          backgroundColor: const Color(0xFFBA1A1A),
        ),
      );
    }
  }

  Future<void> _deleteConditionalRule(Rule rule) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xac nhan xoa'),
        content: Text('Ban co chac muon xoa rule "${rule.tenRule}"?'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        backgroundColor: Colors.white,
        titleTextStyle: const TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w700, fontSize: 18, color: Color(0xFF003345)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Huy', style: TextStyle(color: Color(0xFF40484C))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xoa', style: TextStyle(color: Color(0xFFBA1A1A))),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteRule(rule.id);
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Da xoa rule'),
            backgroundColor: Color(0xFF006a6a),
          ),
        );
        
        _loadRules();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Loi: ${e.toString()}'),
            backgroundColor: const Color(0xFFBA1A1A),
          ),
        );
      }
    }
  }

  Future<void> _deleteScheduledRule(ScheduledRule rule) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xac nhan xoa'),
        content: Text('Ban co chac muon xoa lich trinh "${rule.tenRule}"?'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        backgroundColor: Colors.white,
        titleTextStyle: const TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w700, fontSize: 18, color: Color(0xFF003345)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Huy', style: TextStyle(color: Color(0xFF40484C))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xoa', style: TextStyle(color: Color(0xFFBA1A1A))),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteScheduledRule(rule.id);
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Da xoa lich trinh'),
            backgroundColor: Color(0xFF006a6a),
          ),
        );
        
        _loadRules();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Loi: ${e.toString()}'),
            backgroundColor: const Color(0xFFBA1A1A),
          ),
        );
      }
    }
  }

  void _navigateToConditionalRuleForm([Rule? rule]) async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => RuleFormScreen(
          roomId: widget.roomId,
          rule: rule,
        ),
      ),
    );

    if (result == true) {
      _loadRules();
    }
  }

  void _navigateToScheduledRuleForm([ScheduledRule? rule]) async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ScheduledRuleFormScreen(
          roomId: widget.roomId,
          rule: rule,
        ),
      ),
    );

    if (result == true) {
      _loadRules();
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
                left: 4,
                right: 8,
                bottom: 8,
              ),
              decoration: const BoxDecoration(
                color: Color(0xFFF7FAFC),
                boxShadow: [
                  BoxShadow(
                    color: Color(0x0F1C1E06),
                    blurRadius: 24,
                    offset: Offset(0, 8),
                  ),
                ],
              ),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Color(0xFF003345)),
                    onPressed: () => Navigator.pop(context),
                  ),
                  Expanded(
                    child: Text(
                      widget.roomId != null ? 'Rules cua phong' : 'Tat ca Rules',
                      style: const TextStyle(
                        fontFamily: 'Manrope',
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.02,
                        color: Color(0xFF003345),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Tab bar - pill style
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F4F6),
                  borderRadius: BorderRadius.circular(9999),
                ),
                child: TabBar(
                  controller: _tabController,
                  dividerColor: Colors.transparent,
                  indicator: BoxDecoration(
                    color: const Color(0xFF006a6a),
                    borderRadius: BorderRadius.circular(9999),
                  ),
                  indicatorSize: TabBarIndicatorSize.tab,
                  labelColor: Colors.white,
                  unselectedLabelColor: const Color(0xFF40484C),
                  labelStyle: const TextStyle(fontFamily: 'Manrope', fontWeight: FontWeight.w600, fontSize: 13),
                  unselectedLabelStyle: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w500, fontSize: 13),
                  tabs: const [
                    Tab(text: 'Dieu kien', icon: Icon(Icons.rule, size: 18)),
                    Tab(text: 'Lich trinh', icon: Icon(Icons.schedule, size: 18)),
                  ],
                ),
              ),
            ),

            // Tab content
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  // Conditional Rules Tab
                  _conditionalRules.isEmpty
                      ? _buildEmptyState('Chua co rule dieu kien', Icons.rule)
                      : RefreshIndicator(
                          color: const Color(0xFF006a6a),
                          onRefresh: _loadRules,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _conditionalRules.length,
                            itemBuilder: (context, index) => RuleCard(
                              rule: _conditionalRules[index],
                              onTap: () => _navigateToConditionalRuleForm(_conditionalRules[index]),
                              onToggle: () => _toggleConditionalRule(_conditionalRules[index]),
                              onDelete: () => _deleteConditionalRule(_conditionalRules[index]),
                            ),
                          ),
                        ),
                  
                  // Scheduled Rules Tab
                  _scheduledRules.isEmpty
                      ? _buildEmptyState('Chua co lich trinh', Icons.schedule)
                      : RefreshIndicator(
                          color: const Color(0xFF006a6a),
                          onRefresh: _loadRules,
                          child: ListView.builder(
                            padding: const EdgeInsets.all(16),
                            itemCount: _scheduledRules.length,
                            itemBuilder: (context, index) => ScheduledRuleCard(
                              rule: _scheduledRules[index],
                              onTap: () => _navigateToScheduledRuleForm(_scheduledRules[index]),
                              onToggle: () => _toggleScheduledRule(_scheduledRules[index]),
                              onDelete: () => _deleteScheduledRule(_scheduledRules[index]),
                            ),
                          ),
                        ),
                ],
              ),
            ),
          ],
        ),
      ),

      // Gradient FAB
      floatingActionButton: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF003345), Color(0xFF004B63)],
          ),
          borderRadius: BorderRadius.circular(9999),
          boxShadow: [
            BoxShadow(
              color: const Color(0x40003345),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: FloatingActionButton.extended(
          onPressed: () {
            if (_tabController.index == 0) {
              _navigateToConditionalRuleForm();
            } else {
              _navigateToScheduledRuleForm();
            }
          },
          backgroundColor: Colors.transparent,
          elevation: 0,
          highlightElevation: 0,
          icon: const Icon(Icons.add, color: Colors.white),
          label: const Text(
            'Tao Rule',
            style: TextStyle(
              fontFamily: 'Manrope',
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState(String message, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFFC0C7CD).withOpacity(0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              size: 48,
              color: const Color(0xFFC0C7CD),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            message,
            style: const TextStyle(
              fontSize: 16,
              color: Color(0xFF40484C),
            ),
          ),
        ],
      ),
    );
  }
}
