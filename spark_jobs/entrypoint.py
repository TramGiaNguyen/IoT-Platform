#!/usr/bin/env python3
"""
Entrypoint script with WATCHDOG that:
1. Runs the streaming job (process_events.py) via spark-submit
2. MONITORS MongoDB for new data - restarts Spark if stalled
3. Runs hourly aggregation every 1 hour
4. Runs daily aggregation every 24 hours

This ensures continuous data flow even if Spark crashes or hangs.
"""

import subprocess
import time
import os
import sys
import logging
import signal
from datetime import datetime, timedelta, timezone
from threading import Thread, Event
from pymongo import MongoClient

logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Vietnam timezone
VN_TZ = timezone(timedelta(hours=7))

# Scheduler intervals in seconds
HOURLY_INTERVAL = 3600      # 1 hour
DAILY_INTERVAL = 86400      # 24 hours

# Watchdog settings
WATCHDOG_CHECK_INTERVAL = 60     # Check every 60 seconds
WATCHDOG_MAX_AGE = 180           # Max 3 minutes without new data
WATCHDOG_MONGO_URI = "mongodb://mongodb:27017"

# Track last run times
last_hourly_run = 0
last_daily_run = 0

# Streaming process reference
streaming_proc = None
shutdown_event = Event()


def get_vn_now():
    return datetime.now(VN_TZ)


def check_mongodb_health():
    """
    Check if MongoDB is receiving recent data.
    Returns True if healthy, False if stalled.
    """
    try:
        client = MongoClient(WATCHDOG_MONGO_URI, serverSelectionTimeoutMS=5000)
        db = client.iot
        threshold = time.time() - WATCHDOG_MAX_AGE
        count = db.events.count_documents({"timestamp": {"$gte": threshold}})
        client.close()
        return count > 0
    except Exception as e:
        logger.warning(f"[WATCHDOG] MongoDB check error: {e}")
        return False


def run_streaming_job():
    """Start the Spark streaming job as subprocess."""
    logger.info("[SPARK] Starting streaming job...")
    cmd = [
        "/opt/spark/bin/spark-submit",
        "--packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0",
        "/app/process_events.py"
    ]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def restart_streaming_job():
    """Kill current streaming job and start a new one."""
    global streaming_proc
    
    if streaming_proc:
        logger.warning("[WATCHDOG] Killing stalled streaming process...")
        try:
            streaming_proc.terminate()
            streaming_proc.wait(timeout=10)
        except:
            streaming_proc.kill()
    
    logger.info("[WATCHDOG] Restarting streaming job...")
    streaming_proc = run_streaming_job()
    time.sleep(30)  # Give Spark time to initialize
    
    if streaming_proc.poll() is not None:
        logger.error("[WATCHDOG] Streaming job failed to restart!")
        return False
    
    logger.info("[WATCHDOG] Streaming job restarted successfully")
    return True


def watchdog_loop():
    """
    Watchdog thread that monitors MongoDB for data flow.
    Restarts Spark if no new data for WATCHDOG_MAX_AGE seconds.
    """
    global streaming_proc
    
    # Initial delay to let Spark fully initialize
    logger.info(f"[WATCHDOG] Starting with {WATCHDOG_MAX_AGE}s max age, checking every {WATCHDOG_CHECK_INTERVAL}s")
    time.sleep(120)  # Wait 2 minutes before first check
    
    consecutive_failures = 0
    
    while not shutdown_event.is_set():
        try:
            is_healthy = check_mongodb_health()
            
            if is_healthy:
                consecutive_failures = 0
                logger.info("[WATCHDOG] Data flow healthy ✓")
            else:
                consecutive_failures += 1
                logger.warning(f"[WATCHDOG] No recent data! Failure count: {consecutive_failures}/3")
                
                if consecutive_failures >= 3:
                    logger.error(f"[WATCHDOG] Data stalled for {WATCHDOG_MAX_AGE * 3}s - RESTARTING SPARK!")
                    if restart_streaming_job():
                        consecutive_failures = 0
                    else:
                        # If restart fails, wait longer before retry
                        time.sleep(60)
            
            time.sleep(WATCHDOG_CHECK_INTERVAL)
            
        except Exception as e:
            logger.error(f"[WATCHDOG] Error: {e}")
            time.sleep(WATCHDOG_CHECK_INTERVAL)


def run_hourly_aggregation():
    """Run the hourly aggregation job."""
    global last_hourly_run
    try:
        vn_now = get_vn_now()
        logger.info(f"[HOURLY] Running aggregation at {vn_now.strftime('%H:%M:%S')} VN...")
        result = subprocess.run(
            ["python3", "/app/aggregate_hourly.py"],
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode == 0:
            logger.info("[HOURLY] Aggregation completed successfully")
        else:
            logger.error(f"[HOURLY] Failed: {result.stderr[:200]}")
        last_hourly_run = time.time()
    except Exception as e:
        logger.error(f"[HOURLY] Error: {e}")


def run_daily_aggregation():
    """Run the daily aggregation job."""
    global last_daily_run
    try:
        vn_now = get_vn_now()
        logger.info(f"[DAILY] Running aggregation at {vn_now.strftime('%H:%M:%S')} VN...")
        result = subprocess.run(
            ["python3", "/app/aggregate_daily.py"],
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode == 0:
            logger.info("[DAILY] Aggregation completed successfully")
        else:
            logger.error(f"[DAILY] Failed: {result.stderr[:200]}")
        last_daily_run = time.time()
    except Exception as e:
        logger.error(f"[DAILY] Error: {e}")


def scheduler_loop():
    """
    Main scheduler loop - runs aggregations at intervals.
    """
    global last_hourly_run, last_daily_run
    
    # Initial delay to let system stabilize
    logger.info("[SCHEDULER] Waiting 60s before first run...")
    time.sleep(60)
    
    # Run both immediately on startup
    run_hourly_aggregation()
    run_daily_aggregation()
    
    while not shutdown_event.is_set():
        try:
            current_time = time.time()
            
            # Check if hourly aggregation is due
            if current_time - last_hourly_run >= HOURLY_INTERVAL:
                run_hourly_aggregation()
            
            # Check if daily aggregation is due
            if current_time - last_daily_run >= DAILY_INTERVAL:
                run_daily_aggregation()
            
            # Sleep for 60 seconds before next check
            time.sleep(60)
            
        except Exception as e:
            logger.error(f"[SCHEDULER] Error: {e}")
            time.sleep(60)


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    logger.info("Received shutdown signal, cleaning up...")
    shutdown_event.set()
    if streaming_proc:
        streaming_proc.terminate()
    sys.exit(0)


def main():
    global streaming_proc
    
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    
    vn_now = get_vn_now()
    logger.info("=" * 60)
    logger.info("Starting Spark Processor with WATCHDOG")
    logger.info(f"VN Time: {vn_now.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"Hourly interval: {HOURLY_INTERVAL}s | Daily interval: {DAILY_INTERVAL}s")
    logger.info(f"Watchdog: check every {WATCHDOG_CHECK_INTERVAL}s, max age {WATCHDOG_MAX_AGE}s")
    logger.info("=" * 60)
    
    # Start streaming job
    streaming_proc = run_streaming_job()
    
    # Give streaming job time to initialize
    time.sleep(30)
    
    # Check if streaming started successfully
    if streaming_proc.poll() is not None:
        logger.error("[SPARK] Streaming job failed to start!")
        sys.exit(1)
    
    logger.info("[SPARK] Streaming job started")
    
    # Start watchdog thread
    watchdog_thread = Thread(target=watchdog_loop, daemon=True)
    watchdog_thread.start()
    logger.info("[WATCHDOG] Thread started")
    
    # Run scheduler in main thread
    try:
        scheduler_loop()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        shutdown_event.set()
        streaming_proc.terminate()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        shutdown_event.set()
        streaming_proc.terminate()
        sys.exit(1)


if __name__ == "__main__":
    main()
