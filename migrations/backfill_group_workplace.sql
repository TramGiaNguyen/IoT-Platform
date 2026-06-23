-- Backfill: Tạo "Nhóm 1" cho các lớp học hiện có (chạy SAU add_group_workplace.sql rev 2)
-- Lưu ý: Theo model mới, lớp có NHIỀU nhóm. Backfill chỉ tạo 1 nhóm đầu tiên "Nhóm 1"
-- cho các lớp CHƯA có nhóm nào. Sinh viên sẽ KHÔNG tự động được thêm vào nhóm
-- (GV sẽ tự phân nhóm thủ công qua UI Quản lý nhóm).
-- Idempotent: chi tao nhom cho lop chua co nhom nao.
-- Date: 2026-06-17 (rev 2)

USE iot_data;

-- 1. Dat ten_nhom cho cac phong nhom CU chua co ten (idempotent, bao gom ca 25TH01)
UPDATE phong
SET ten_nhom = CONCAT('Nhóm 1')
WHERE loai_phong = 'nhom'
  AND (ten_nhom IS NULL OR ten_nhom = '');

-- 2. Insert "Nhóm 1" cho moi lop CHUA co nhom nao
--    (truong hop lop duoc tao truoc khi co migration group workplace, hoac
--     truong hop migration cu da tao phong nhom nhung ten_nhom dang NULL)
INSERT INTO phong (ten_phong, ten_nhom, mo_ta, vi_tri, nguoi_so_huu_id, loai_phong, lop_hoc_id, ma_phong, ngay_tao)
SELECT
  CONCAT('Phòng nhóm - ', l.ten_lop) AS ten_phong,
  'Nhóm 1' AS ten_nhom,
  'Nhóm làm việc mặc định của lớp' AS mo_ta,
  NULL AS vi_tri,
  l.giao_vien_id AS nguoi_so_huu_id,
  'nhom' AS loai_phong,
  l.id AS lop_hoc_id,
  CONCAT('NHOM_', l.id, '_1') AS ma_phong,
  NOW() AS ngay_tao
FROM lop_hoc l
LEFT JOIN phong p
  ON p.lop_hoc_id = l.id
  AND p.loai_phong = 'nhom'
WHERE p.id IS NULL;

-- 3. KHONG tu dong them SV vao nhom o backfill (theo model moi, GV tu phan nhom).
--    Se clear cac row phong_nhom_thanh_vien cu (da duoc tao tu migration truoc) de bat dau sach.
--    LUU Y: Chi clear neu can thiet - co the comment lai neu muon giu lai.
DELETE ptv FROM phong_nhom_thanh_vien ptv
INNER JOIN phong p ON ptv.phong_id = p.id
WHERE p.loai_phong = 'nhom';

SELECT 'Backfill Nhóm 1 cho các lớp hiện có: hoàn tất (SV sẽ được phân nhóm thủ công)' AS status;

-- Thống kê kết quả
SELECT
  l.id AS lop_id,
  l.ten_lop,
  (SELECT COUNT(*) FROM phong WHERE lop_hoc_id = l.id AND loai_phong = 'nhom') AS so_phong_nhom,
  (SELECT COUNT(*) FROM phong_nhom_thanh_vien ptv
   INNER JOIN phong p2 ON ptv.phong_id = p2.id
   WHERE p2.lop_hoc_id = l.id AND p2.loai_phong = 'nhom') AS so_thanh_vien
FROM lop_hoc l
ORDER BY l.id;
