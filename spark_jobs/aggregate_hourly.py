#!/usr/bin/env python3
"""
Hourly Aggregation Job: Aggregate hourly temperature and humidity statistics
from MongoDB events collection and write to MySQL thong_ke_gio table.

Uses Vietnam timezone (UTC+7) for consistency.
"""

from pymongo import MongoClient
import mysql.connector
from datetime import datetime, timedelta, timezone
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Vietnam timezone (UTC+7)
VN_TZ = timezone(timedelta(hours=7))


def get_vn_now():
    """Get current time in Vietnam timezone."""
    return datetime.now(VN_TZ)


def get_mongo_hourly_events(target_date, target_hour):
    """
    Load events from MongoDB for a specific hour (Vietnam time).
    """
    client = MongoClient("mongodb://mongodb:27017")
    db = client.iot
    
    # Calculate timestamp range for the target hour in VN timezone
    start_dt = datetime(target_date.year, target_date.month, target_date.day, 
                        target_hour, 0, 0, tzinfo=VN_TZ)
    end_dt = start_dt + timedelta(hours=1)
    start_ts = start_dt.timestamp()
    end_ts = end_dt.timestamp()
    
    logger.info(f"Fetching events for {target_date} hour {target_hour}:00 VN (ts: {start_ts:.0f} - {end_ts:.0f})")
    
    # Aggregate in MongoDB
    pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": start_ts, "$lt": end_ts},
                "$or": [
                    {"temperature": {"$exists": True, "$ne": None}},
                    {"humidity": {"$exists": True, "$ne": None}}
                ]
            }
        },
        {
            "$group": {
                "_id": "$device_id",
                "nhiet_do_tb": {"$avg": "$temperature"},
                "nhiet_do_max": {"$max": "$temperature"},
                "nhiet_do_min": {"$min": "$temperature"},
                "do_am_tb": {"$avg": "$humidity"},
                "do_am_max": {"$max": "$humidity"},
                "do_am_min": {"$min": "$humidity"},
                "so_mau": {"$sum": 1}
            }
        }
    ]
    
    results = list(db.events.aggregate(pipeline))
    client.close()
    
    logger.info(f"Found {len(results)} devices with data for hour {target_hour}:00")
    return results


def get_device_id_map():
    """Get mapping from ma_thiet_bi to thiet_bi_id."""
    conn = mysql.connector.connect(
        host="mysql", user="iot", password="iot123", database="iot_data"
    )
    cursor = conn.cursor()
    cursor.execute("SELECT id, ma_thiet_bi FROM thiet_bi WHERE is_active = 1")
    device_map = {row[1]: row[0] for row in cursor.fetchall()}
    cursor.close()
    conn.close()
    return device_map


def upsert_hourly_stats(aggregated_data, target_date, target_hour, device_map):
    """Upsert aggregated statistics into MySQL thong_ke_gio table."""
    conn = mysql.connector.connect(
        host="mysql", user="iot", password="iot123", database="iot_data"
    )
    cursor = conn.cursor()
    
    inserted = 0
    updated = 0
    
    for row in aggregated_data:
        device_id_str = row["_id"]
        thiet_bi_id = device_map.get(device_id_str)
        
        if not thiet_bi_id:
            continue
        
        try:
            cursor.execute("""
                INSERT INTO thong_ke_gio 
                    (thiet_bi_id, ngay, gio, nhiet_do_tb, nhiet_do_max, nhiet_do_min, 
                     do_am_tb, do_am_max, do_am_min, so_mau)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    nhiet_do_tb = VALUES(nhiet_do_tb),
                    nhiet_do_max = VALUES(nhiet_do_max),
                    nhiet_do_min = VALUES(nhiet_do_min),
                    do_am_tb = VALUES(do_am_tb),
                    do_am_max = VALUES(do_am_max),
                    do_am_min = VALUES(do_am_min),
                    so_mau = VALUES(so_mau),
                    ngay_cap_nhat = CURRENT_TIMESTAMP
            """, (
                thiet_bi_id,
                target_date,
                target_hour,
                round(row.get("nhiet_do_tb"), 2) if row.get("nhiet_do_tb") else None,
                round(row.get("nhiet_do_max"), 2) if row.get("nhiet_do_max") else None,
                round(row.get("nhiet_do_min"), 2) if row.get("nhiet_do_min") else None,
                round(row.get("do_am_tb"), 2) if row.get("do_am_tb") else None,
                round(row.get("do_am_max"), 2) if row.get("do_am_max") else None,
                round(row.get("do_am_min"), 2) if row.get("do_am_min") else None,
                row.get("so_mau", 0)
            ))
            
            if cursor.rowcount == 1:
                inserted += 1
            else:
                updated += 1
                
        except Exception as e:
            logger.error(f"Error upserting hourly stats for {device_id_str}: {e}")
    
    conn.commit()
    cursor.close()
    conn.close()
    
    logger.info(f"Hourly upsert: {inserted} inserted, {updated} updated")
    return inserted, updated


def main():
    """Main entry point - aggregate recent hours."""
    now = get_vn_now()
    logger.info("=" * 50)
    logger.info(f"Hourly Aggregation - VN Time: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 50)
    
    device_map = get_device_id_map()
    logger.info(f"Loaded {len(device_map)} registered devices")
    
    # Aggregate previous hour (complete data)
    prev_hour_dt = now - timedelta(hours=1)
    target_date = prev_hour_dt.date()
    target_hour = prev_hour_dt.hour
    
    data = get_mongo_hourly_events(target_date, target_hour)
    if data:
        upsert_hourly_stats(data, target_date, target_hour, device_map)
    
    # Also aggregate current hour (partial data)
    current_date = now.date()
    current_hour = now.hour
    data_current = get_mongo_hourly_events(current_date, current_hour)
    if data_current:
        upsert_hourly_stats(data_current, current_date, current_hour, device_map)
    
    logger.info("Hourly aggregation completed")


if __name__ == "__main__":
    main()
