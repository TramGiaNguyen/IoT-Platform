#!/usr/bin/env python3
"""Script để cập nhật password hash trong database"""
import mysql.connector
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Tạo hash mới cho password "123456"
new_hash = pwd_context.hash("123456")
print(f"New hash: {new_hash}")
print(f"Hash length: {len(new_hash)}")

# Kết nối database
conn = mysql.connector.connect(
    host="mysql",
    user="iot",
    password="iot123",
    database="iot_data"
)
cursor = conn.cursor()

# Update password
cursor.execute(
    "UPDATE nguoi_dung SET mat_khau_hash = %s WHERE email = %s",
    (new_hash, "22050026@student.bdu.edu.vn")
)
conn.commit()

# Verify
cursor.execute(
    "SELECT mat_khau_hash FROM nguoi_dung WHERE email = %s",
    ("22050026@student.bdu.edu.vn",)
)
result = cursor.fetchone()
if result:
    stored_hash = result[0]
    print(f"\nStored hash length: {len(stored_hash)}")
    print(f"Stored hash: {stored_hash}")
    verify_result = pwd_context.verify("123456", stored_hash)
    print(f"\nPassword '123456' verification: {verify_result}")
    if verify_result:
        print("✅ Password updated successfully!")
    else:
        print("❌ Password verification failed!")

cursor.close()
conn.close()





