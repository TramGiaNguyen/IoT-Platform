-- Migration: Thêm index cho bảng rules và rule_actions để tăng tốc CRUD operations
-- Chạy: docker exec mysql mysql -uiot -piot123 iot_data < migrations/add_rules_perf_indexes.sql

ALTER TABLE rules ADD INDEX idx_rules_owner_status (nguoi_so_huu_id, trang_thai);
ALTER TABLE rules ADD INDEX idx_rules_status (trang_thai);
ALTER TABLE rule_actions ADD INDEX idx_rule_actions_rule_status (rule_id, delay_seconds);
