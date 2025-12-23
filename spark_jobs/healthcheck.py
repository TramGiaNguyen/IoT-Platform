#!/usr/bin/env python3
"""
Health check for Spark Processor.
Checks if MongoDB is receiving recent data (within last 5 minutes).
"""
import sys
from pymongo import MongoClient
import time

MAX_AGE_SECONDS = 300  # 5 minutes

try:
    client = MongoClient("mongodb://mongodb:27017", serverSelectionTimeoutMS=5000)
    db = client.iot
    
    threshold = time.time() - MAX_AGE_SECONDS
    count = db.events.count_documents({"timestamp": {"$gte": threshold}})
    
    if count == 0:
        print(f"UNHEALTHY: No recent data in last {MAX_AGE_SECONDS} seconds")
        sys.exit(1)
    
    print(f"HEALTHY: {count} events in last {MAX_AGE_SECONDS} seconds")
    sys.exit(0)
    
except Exception as e:
    print(f"UNHEALTHY: Error checking MongoDB: {e}")
    sys.exit(1)
