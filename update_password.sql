USE iot_data;
UPDATE nguoi_dung 
SET mat_khau_hash = '$2b$12$hLW99Na4HJueC6LoUoczT.6sMtexA5y6vUUkeVMxQ5t.L9OFUp6Te' 
WHERE email = '22050026@student.bdu.edu.vn';
SELECT email, LENGTH(mat_khau_hash) as len, mat_khau_hash FROM nguoi_dung WHERE email = '22050026@student.bdu.edu.vn';

