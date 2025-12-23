#!/usr/bin/env python3
"""
Daily Aggregation Job: Aggregate daily temperature and humidity statistics
from thong_ke_gio (hourly stats) table and write to thong_ke_ngay table.

Uses Vietnam timezone (UTC+7) for consistency.
"""

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


def aggregate_daily_from_hourly(target_date):
    """
    Aggregate daily stats from hourly stats in thong_ke_gio.
    """
    conn = mysql.connector.connect(
        host="mysql", user="iot", password="iot123", database="iot_data"
    )
    cursor = conn.cursor(dictionary=True)
    
    logger.info(f"Aggregating daily stats for {target_date}")
    
    cursor.execute("""
        SELECT 
            thiet_bi_id,
            AVG(nhiet_do_tb) as nhiet_do_tb,
            MAX(nhiet_do_max) as nhiet_do_max,
            MIN(nhiet_do_min) as nhiet_do_min,
            AVG(do_am_tb) as do_am_tb,
            MAX(do_am_max) as do_am_max,
            MIN(do_am_min) as do_am_min,
            SUM(so_mau) as so_mau,
            COUNT(*) as so_gio
        FROM thong_ke_gio
        WHERE ngay = %s
        GROUP BY thiet_bi_id
    """, (target_date,))
    
    results = cursor.fetchall()
    logger.info(f"Found {len(results)} devices with hourly data")
    
    inserted = 0
    updated = 0
    
    for row in results:
        try:
            cursor.execute("""
                INSERT INTO thong_ke_ngay 
                    (thiet_bi_id, ngay, nhiet_do_tb, nhiet_do_max, nhiet_do_min, 
                     do_am_tb, do_am_max, do_am_min, so_mau)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                row["thiet_bi_id"],
                target_date,
                round(row["nhiet_do_tb"], 2) if row["nhiet_do_tb"] else None,
                round(row["nhiet_do_max"], 2) if row["nhiet_do_max"] else None,
                round(row["nhiet_do_min"], 2) if row["nhiet_do_min"] else None,
                round(row["do_am_tb"], 2) if row["do_am_tb"] else None,
                round(row["do_am_max"], 2) if row["do_am_max"] else None,
                round(row["do_am_min"], 2) if row["do_am_min"] else None,
                row["so_mau"]
            ))
            
            if cursor.rowcount == 1:
                inserted += 1
            else:
                updated += 1
                
        except Exception as e:
            logger.error(f"Error upserting daily stats: {e}")
    
    conn.commit()
    cursor.close()
    conn.close()
    
    logger.info(f"Daily upsert: {inserted} inserted, {updated} updated")
    return inserted, updated


def main():
    """Main entry point - aggregate yesterday and today."""
    now = get_vn_now()
    logger.info("=" * 50)
    logger.info(f"Daily Aggregation - VN Time: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("=" * 50)
    
    # Aggregate yesterday (complete data)
    yesterday = now.date() - timedelta(days=1)
    aggregate_daily_from_hourly(yesterday)
    
    # Aggregate today (partial data)
    today = now.date()
    aggregate_daily_from_hourly(today)
    
    logger.info("Daily aggregation completed")


if __name__ == "__main__":
    main()
