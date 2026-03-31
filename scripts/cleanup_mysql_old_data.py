#!/usr/bin/env python3
"""
Cleanup old data from MySQL du_lieu_thiet_bi table.
Xóa dữ liệu cũ hơn X ngày để tránh database quá lớn.

Usage:
  python scripts/cleanup_mysql_old_data.py --days 30
  docker exec -it mysql python /scripts/cleanup_mysql_old_data.py --days 30
"""
import argparse
import mysql.connector
from datetime import datetime, timedelta

def cleanup_old_data(days=30, dry_run=False):
    """
    Xóa dữ liệu cũ hơn X ngày từ bảng du_lieu_thiet_bi.
    
    Args:
        days: Số ngày giữ dữ liệu (mặc định 30 ngày)
        dry_run: Nếu True, chỉ hiển thị số lượng sẽ xóa, không thực sự xóa
    """
    conn = mysql.connector.connect(
        host="mysql",
        user="iot",
        password="iot123",
        database="iot_data"
    )
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Tính ngày cutoff
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Đếm số rows sẽ bị xóa
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM du_lieu_thiet_bi
            WHERE thoi_gian < %s
        """, (cutoff_date,))
        result = cursor.fetchone()
        count_to_delete = result['count']
        
        # Lấy thống kê trước khi xóa
        cursor.execute("SELECT COUNT(*) as total FROM du_lieu_thiet_bi")
        total_before = cursor.fetchone()['total']
        
        cursor.execute("""
            SELECT MIN(thoi_gian) as oldest, MAX(thoi_gian) as newest
            FROM du_lieu_thiet_bi
        """)
        date_range = cursor.fetchone()
        
        print(f"Database statistics:")
        print(f"  Total rows: {total_before:,}")
        print(f"  Oldest data: {date_range['oldest']}")
        print(f"  Newest data: {date_range['newest']}")
        print(f"\nCleanup plan:")
        print(f"  Cutoff date: {cutoff_date}")
        print(f"  Rows to delete: {count_to_delete:,} ({count_to_delete/total_before*100:.1f}%)")
        print(f"  Rows to keep: {total_before - count_to_delete:,}")
        
        if dry_run:
            print("\n[DRY RUN] No data deleted.")
            return
        
        # Confirm
        if count_to_delete > 0:
            print(f"\nDeleting {count_to_delete:,} rows...")
            
            # Xóa theo batch để tránh lock table quá lâu
            batch_size = 10000
            deleted_total = 0
            
            while True:
                cursor.execute("""
                    DELETE FROM du_lieu_thiet_bi
                    WHERE thoi_gian < %s
                    LIMIT %s
                """, (cutoff_date, batch_size))
                
                deleted = cursor.rowcount
                deleted_total += deleted
                conn.commit()
                
                if deleted == 0:
                    break
                
                print(f"  Deleted {deleted_total:,} / {count_to_delete:,} rows...")
            
            print(f"\n✓ Deleted {deleted_total:,} rows")
            
            # Optimize table
            print("Optimizing table...")
            cursor.execute("OPTIMIZE TABLE du_lieu_thiet_bi")
            print("✓ Table optimized")
        else:
            print("\nNo data to delete.")
    
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cleanup old MySQL data")
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Delete data older than X days (default: 30)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without actually deleting"
    )
    args = parser.parse_args()
    
    print(f"MySQL Data Cleanup")
    print(f"Keep last {args.days} days of data\n")
    
    cleanup_old_data(args.days, args.dry_run)
    print("\n✓ Done!")
