// app_control/lib/screens/rules_screen.dart

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
      // Load conditional rules
      final conditionalData = await _apiService.getRules(
        phongId: widget.roomId,
      );
      
      // Load scheduled rules
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
          content: Text(newStatus == 'enabled' ? 'Đã bật rule' : 'Đã tắt rule'),
          backgroundColor: Colors.green,
        ),
      );
      
      _loadRules();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Lỗi: ${e.toString()}'),
          backgroundColor: Colors.red,
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
          content: Text(newStatus == 'enabled' ? 'Đã bật rule' : 'Đã tắt rule'),
          backgroundColor: Colors.green,
        ),
      );
      
      _loadRules();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Lỗi: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _deleteConditionalRule(Rule rule) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xác nhận xóa'),
        content: Text('Bạn có chắc muốn xóa rule "${rule.tenRule}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xóa', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteRule(rule.id);
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Đã xóa rule'),
            backgroundColor: Colors.green,
          ),
        );
        
        _loadRules();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Lỗi: ${e.toString()}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _deleteScheduledRule(ScheduledRule rule) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xác nhận xóa'),
        content: Text('Bạn có chắc muốn xóa rule "${rule.tenRule}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Hủy'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xóa', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await _apiService.deleteScheduledRule(rule.id);
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Đã xóa rule'),
            backgroundColor: Colors.green,
          ),
        );
        
        _loadRules();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Lỗi: ${e.toString()}'),
            backgroundColor: Colors.red,
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
      appBar: AppBar(
        title: Text(widget.roomId != null ? 'Rules của phòng' : 'Tất cả Rules'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Điều kiện', icon: Icon(Icons.rule)),
            Tab(text: 'Lịch trình', icon: Icon(Icons.schedule)),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error, size: 64, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(_error!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadRules,
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                )
              : TabBarView(
                  controller: _tabController,
                  children: [
                    // Conditional Rules Tab
                    _conditionalRules.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.rule, size: 64, color: Colors.grey.shade400),
                                const SizedBox(height: 16),
                                Text(
                                  'Chưa có rule điều kiện',
                                  style: TextStyle(color: Colors.grey.shade600),
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _loadRules,
                            child: ListView.builder(
                              itemCount: _conditionalRules.length,
                              itemBuilder: (context, index) {
                                final rule = _conditionalRules[index];
                                return RuleCard(
                                  rule: rule,
                                  onTap: () => _navigateToConditionalRuleForm(rule),
                                  onToggle: () => _toggleConditionalRule(rule),
                                  onDelete: () => _deleteConditionalRule(rule),
                                );
                              },
                            ),
                          ),
                    
                    // Scheduled Rules Tab
                    _scheduledRules.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.schedule, size: 64, color: Colors.grey.shade400),
                                const SizedBox(height: 16),
                                Text(
                                  'Chưa có rule lịch trình',
                                  style: TextStyle(color: Colors.grey.shade600),
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _loadRules,
                            child: ListView.builder(
                              itemCount: _scheduledRules.length,
                              itemBuilder: (context, index) {
                                final rule = _scheduledRules[index];
                                return ScheduledRuleCard(
                                  rule: rule,
                                  onTap: () => _navigateToScheduledRuleForm(rule),
                                  onToggle: () => _toggleScheduledRule(rule),
                                  onDelete: () => _deleteScheduledRule(rule),
                                );
                              },
                            ),
                          ),
                  ],
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          if (_tabController.index == 0) {
            _navigateToConditionalRuleForm();
          } else {
            _navigateToScheduledRuleForm();
          }
        },
        icon: const Icon(Icons.add),
        label: const Text('Tạo Rule'),
      ),
    );
  }
}
