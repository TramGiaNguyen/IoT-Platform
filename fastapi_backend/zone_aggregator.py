"""
Daily zone occupancy aggregator.
Runs at 00:05 each day to aggregate zone_occupancy_log into zone_occupancy_daily.
"""

import logging
from datetime import date, timedelta, datetime
from database import get_mysql

logger = logging.getLogger("zone_aggregator")


def aggregate_daily_zone_occupancy(target_date: date = None):
    """
    Aggregate zone occupancy logs for target_date into zone_occupancy_daily.
    If target_date is None, defaults to yesterday.
    """
    if target_date is None:
        target_date = date.today() - timedelta(days=1)

    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT zone_id, camera_id, zone_name,
                   SUM(duration_seconds) as total_seconds,
                   SUM(entered_count) as total_entries,
                   MAX(entered_count) as peak_count_during_day,
                   AVG(entered_count) as avg_count_during_day
            FROM zone_occupancy_log
            WHERE DATE(zone_entered_at) = %s
            GROUP BY zone_id, camera_id, zone_name
            """,
            (target_date.isoformat(),),
        )

        rows = cursor.fetchall()
        if not rows:
            logger.info("No zone occupancy logs for %s", target_date)
            return 0

        count = 0
        for row in rows:
            cursor.execute(
                """
                INSERT INTO zone_occupancy_daily
                  (camera_id, zone_id, zone_name, ngay, total_seconds, peak_count, total_entries, avg_count)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    total_seconds = VALUES(total_seconds),
                    peak_count = VALUES(peak_count),
                    total_entries = VALUES(total_entries),
                    avg_count = VALUES(avg_count)
                """,
                (
                    row["camera_id"],
                    row["zone_id"],
                    row["zone_name"],
                    target_date,
                    int(row["total_seconds"] or 0),
                    int(row["peak_count_during_day"] or 0),
                    int(row["total_entries"] or 0),
                    float(row["avg_count_during_day"] or 0.0),
                ),
            )
            count += 1

        conn.commit()
        logger.info("Aggregated %d zone records for %s", count, target_date)
        return count
    finally:
        cursor.close()
        conn.close()
