#!/usr/bin/env python3
"""
Script để export dữ liệu từ MySQL và MongoDB sang file backup
Chạy trên máy CŨ để export dữ liệu
"""
import mysql.connector
import pymongo
import json
import os
from datetime import datetime

# Cấu hình kết nối
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'localhost'),
    'port': int(os.getenv('MYSQL_PORT', 3307)),
    'user': 'iot',
    'password': 'iot123',
    'database': 'iot_data'
}

MONGO_CONFIG = {
    'host': os.getenv('MONGO_HOST', 'localhost'),
    'port': int(os.getenv('MONGO_PORT', 27017)),
    'database': 'iot'
}

def export_mysql_data():
    """Export dữ liệu từ MySQL"""
    print("🔄 Connecting to MySQL...")
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor(dictionary=True)
    
    data = {}
    
    # Danh sách các bảng cần export
    tables = [
        'nguoi_dung',
        'lop_hoc',
        'hoc_vien',
        'phong',
        'thiet_bi',
        'device_profiles',
        'quy_tac',
        'scheduled_rules',
        'rule_chains',
        'dashboards',
        'dashboard_widgets',
        'canh_bao'
    ]
    
    for table in tables:
        try:
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()
            data[table] = rows
            print(f"✅ Exported {len(rows)} rows from {table}")
        except mysql.connector.Error as e:
            print(f"⚠️  Table {table} not found or error: {e}")
            data[table] = []
    
    cursor.close()
    conn.close()
    
    return data

def export_mongodb_data(limit_days=30):
    """Export dữ liệu từ MongoDB (chỉ lấy dữ liệu gần đây)"""
    print("\n🔄 Connecting to MongoDB...")
    client = pymongo.MongoClient(
        MONGO_CONFIG['host'],
        MONGO_CONFIG['port']
    )
    db = client[MONGO_CONFIG['database']]
    
    data = {}
    
    # Export events collection (giới hạn số lượng để không quá lớn)
    try:
        # Lấy 10000 documents gần nhất
        events = list(db.events.find().sort('timestamp', -1).limit(10000))
        # Convert ObjectId to string
        for event in events:
            if '_id' in event:
                event['_id'] = str(event['_id'])
        data['events'] = events
        print(f"✅ Exported {len(events)} events from MongoDB")
    except Exception as e:
        print(f"⚠️  Error exporting MongoDB: {e}")
        data['events'] = []
    
    client.close()
    return data

def save_to_file(mysql_data, mongo_data, output_dir='backup'):
    """Lưu dữ liệu vào file JSON"""
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Save MySQL data
    mysql_file = os.path.join(output_dir, f'mysql_backup_{timestamp}.json')
    with open(mysql_file, 'w', encoding='utf-8') as f:
        json.dump(mysql_data, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n💾 MySQL data saved to: {mysql_file}")
    
    # Save MongoDB data
    mongo_file = os.path.join(output_dir, f'mongodb_backup_{timestamp}.json')
    with open(mongo_file, 'w', encoding='utf-8') as f:
        json.dump(mongo_data, f, ensure_ascii=False, indent=2, default=str)
    print(f"💾 MongoDB data saved to: {mongo_file}")
    
    return mysql_file, mongo_file

if __name__ == '__main__':
    print("=" * 60)
    print("📦 IoT Platform Data Export Tool")
    print("=" * 60)
    
    try:
        # Export MySQL
        mysql_data = export_mysql_data()
        
        # Export MongoDB
        mongo_data = export_mongodb_data()
        
        # Save to files
        mysql_file, mongo_file = save_to_file(mysql_data, mongo_data)
        
        print("\n" + "=" * 60)
        print("✅ Export completed successfully!")
        print("=" * 60)
        print("\n📋 Next steps:")
        print("1. Copy backup files to new machine:")
        print(f"   - {mysql_file}")
        print(f"   - {mongo_file}")
        print("2. Run import_data.py on new machine")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
