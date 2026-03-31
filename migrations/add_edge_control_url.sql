-- Chạy thủ công trên MySQL nếu DB đã tồn tại trước khi có cột này trong data.sql:
-- docker exec -i mysql mysql -uiot -piot123 iot_data < migrations/add_edge_control_url.sql

ALTER TABLE `thiet_bi`
  ADD COLUMN `edge_control_url` VARCHAR(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL
  COMMENT 'HTTP POST relay control, e.g. http://192.168.190.171/api/v1/control';
