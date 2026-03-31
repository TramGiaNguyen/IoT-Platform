#!/usr/bin/env python3
"""
Script để import dữ liệu từ file backup vào MySQL và MongoDB
Chạy trên máy MỚI để import dữ liệu
"""
import mysql.connector
import pymongo
import json
import os
import sys
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

def import_mysql_data(data):
    """Import dữ liệu vào MySQL"""
    print("🔄 Connecting to MySQL...")
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    
    # Thứ tự import quan trọng (foreign key dependencies)
    table_order = [
        'nguoi_dung',
        'lop_hoc',
        'hoc_vien',
        'phong',
        'device_profiles',
        'thiet_bi',
        'quy_tac',
        'scheduled_rules',
        'rule_chains',
        'dashboards',
        'dashboard_widgets',
        'canh_bao'
    ]
    
    for table in table_order:
        if table not in data or not data[table]:
            print(f"⏭️  Skipping {table} (no data)")
            continue
        
        rows = data[table]
        if not rows:
            continue
        
        # Get column names from first row
        columns = list(rows[0].keys())
        placeholders = ', '.join(['%s'] * len(columns))
        columns_str = ', '.join([f'`{col}`' for col in columns])
        
        # Build INSERT query with ON DUPLICATE KEY UPDATE
        update_clause = ', '.join([f'`{col}`=VALUES(`{col}`)' for col in columns if col != 'id'])
        query = f"""
            INSERT INTO {table} ({columns_str})
            VALUES ({placeholders})
            ON DUPLICATE KEY UPDATE {update_clause}
        """
        
        try:
            for row in rows:
                values = [row[col] for col in columns]
                cursor.execute(query, values)
            
            conn.commit()
            print(f"✅ Imported {len(rows)} rows into {table}")
        except mysql.connector.Error as e:
            print(f"⚠️  Error importing {table}: {e}")
            conn.rollback()
    
    cursor.close()
    conn.close()

def import_mongodb_data(data):
    """Import dữ liệu vào MongoDB"""
    print("\n🔄 Connecting to MongoDB...")
    client = pymongo.MongoClient(
        MONGO_CONFIG['host'],
        MONGO_CONFIG['port']
    )
    db = client[MONGO_CONFIG['database']]
    
    if 'events' in data and data['events']:
        try:
            # Convert string _id back to ObjectId if needed
            from bson import ObjectId
            events = data['events']
            for event in events:
                if '_id' in event and isinstance(event['_id'], str):
                    try:
                        event['_id'] = ObjectId(event['_id'])
                    except:
                        del event['_id']  # Let MongoDB generate new ID
            
            # Insert with ordered=False to continue on duplicates
            result = db.events.insert_many(events, ordered=False)
            print(f"✅ Imported {len(result.inserted_ids)} events into MongoDB")
        except pymongo.errors.BulkWriteError as e:
            # Some documents might be duplicates, that's ok
            inserted = e.details.get('nInserted', 0)
            print(f"✅ Imported {inserted} events into MongoDB (some duplicates skipped)")
        except Exception as e:
            print(f"⚠️  Error importing MongoDB: {e}")
    
    client.close()

def load_from_file(mysql_file, mongo_file):
    """Load dữ liệu từ file JSON"""
    print("📂 Loading backup files...")
    
    with open(mysql_file, 'r', encoding='utf-8') as f:
        mysql_data = json.load(f)
    print(f"✅ Loaded MySQL data from {mysql_file}")
    
    with open(mongo_file, 'r', encoding='utf-8') as f:
        mongo_data = json.load(f)
    print(f"✅ Loaded MongoDB data from {mongo_file}")
    
    return mysql_data, mongo_data

if __name__ == '__main__':
    print("=" * 60)
    print("📥 IoT Platform Data Import Tool")
    print("=" * 60)
    
    if len(sys.argv) < 3:
        print("\n❌ Usage: python import_data.py <mysql_backup.json> <mongodb_backup.json>")
        print("\nExample:")
        print("  python import_data.py backup/mysql_backup_20260331_120000.json backup/mongodb_backup_20260331_120000.json")
        sys.exit(1)
    
    mysql_file = sys.argv[1]
    mongo_file = sys.argv[2]
    
    if not os.path.exists(mysql_file):
        print(f"❌ MySQL backup file not found: {mysql_file}")
        sys.exit(1)
    
    if not os.path.exists(mongo_file):
        print(f"❌ MongoDB backup file not found: {mongo_file}")
        sys.exit(1)
    
    try:
        # Load data
        mysql_data, mongo_data = load_from_file(mysql_file, mongo_file)
        
        # Import MySQL
        print("\n" + "=" * 60)
        import_mysql_data(mysql_data)
        
        # Import MongoDB
        print("\n" + "=" * 60)
        import_mongodb_data(mongo_data)
        
        print("\n" + "=" * 60)
        print("✅ Import completed successfully!")
        print("=" * 60)
        print("\n📋 Next steps:")
        print("1. Restart Docker containers: docker-compose restart")
        print("2. Verify data in dashboard: http://localhost:3000")
        print("3. Check devices are showing up correctly")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
