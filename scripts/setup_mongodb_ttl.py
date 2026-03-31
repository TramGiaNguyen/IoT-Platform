#!/usr/bin/env python3
"""
Setup TTL (Time To Live) index cho MongoDB collection events.
Tự động xóa dữ liệu cũ hơn X ngày.

Usage:
  python scripts/setup_mongodb_ttl.py --days 30
  docker exec -it mongodb python /scripts/setup_mongodb_ttl.py --days 30
"""
import argparse
from pymongo import MongoClient
from datetime import datetime, timedelta

def setup_ttl_index(days=30):
    """
    Tạo TTL index trên field 'timestamp' để tự động xóa dữ liệu cũ.
    
    Args:
        days: Số ngày giữ dữ liệu (mặc định 30 ngày)
    """
    client = MongoClient("mongodb://mongodb:27017")
    db = client.iot
    collection = db.events
    
    # Xóa TTL index cũ nếu có
    try:
        collection.drop_index("timestamp_1")
        print("✓ Dropped old TTL index")
    except Exception:
        pass
    
    # Tạo TTL index mới
    # expireAfterSeconds: số giây sau khi document được tạo sẽ bị xóa
    seconds = days * 24 * 60 * 60
    
    collection.create_index(
        "timestamp",
        expireAfterSeconds=seconds,
        name="timestamp_ttl"
    )
    
    print(f"✓ Created TTL index on 'timestamp' field")
    print(f"✓ Documents older than {days} days will be automatically deleted")
    print(f"✓ Expire after: {seconds} seconds ({days} days)")
    
    # Verify index
    indexes = list(collection.list_indexes())
    print("\nCurrent indexes:")
    for idx in indexes:
        print(f"  - {idx['name']}: {idx.get('key', {})}")
        if 'expireAfterSeconds' in idx:
            print(f"    TTL: {idx['expireAfterSeconds']} seconds")
    
    # Show collection stats
    stats = db.command("collStats", "events")
    print(f"\nCollection stats:")
    print(f"  Documents: {stats.get('count', 0):,}")
    print(f"  Size: {stats.get('size', 0) / 1024 / 1024:.2f} MB")
    print(f"  Storage: {stats.get('storageSize', 0) / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Setup MongoDB TTL index")
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of days to keep data (default: 30)"
    )
    args = parser.parse_args()
    
    print(f"Setting up TTL index for {args.days} days...")
    setup_ttl_index(args.days)
    print("\n✓ Done!")
