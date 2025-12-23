CREATE TABLE IF NOT EXISTS quyen_trang (
  id INT NOT NULL AUTO_INCREMENT,
  nguoi_dung_id INT NOT NULL,
  trang VARCHAR(50) NOT NULL,
  ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_user_page (nguoi_dung_id, trang),
  FOREIGN KEY (nguoi_dung_id) REFERENCES nguoi_dung(id) ON DELETE CASCADE
) ENGINE=InnoDB;
