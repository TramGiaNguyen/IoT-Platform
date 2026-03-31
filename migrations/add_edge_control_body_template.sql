-- Body JSON tùy chỉnh gửi tới edge (placeholder {{relay}}, {{state}}, {{cmd}})
-- Chạy nếu DB đã tồn tại:
-- docker exec -i mysql mysql -uiot -piot123 iot_data < migrations/add_edge_control_body_template.sql

ALTER TABLE `thiet_bi`
  ADD COLUMN `edge_control_body_template` MEDIUMTEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL
  COMMENT 'JSON template for POST body; use {{relay}} {{state}} {{cmd}} on/off';
