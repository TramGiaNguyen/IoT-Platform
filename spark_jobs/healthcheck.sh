#!/bin/bash
# Health check script for Spark Processor
# Checks if MongoDB is receiving recent data (within last 5 minutes)

MONGO_HOST="mongodb"
MONGO_DB="iot"
MAX_AGE_SECONDS=300  # 5 minutes

# Get current timestamp
NOW=$(date +%s)
THRESHOLD=$((NOW - MAX_AGE_SECONDS))

# Check if there are recent events in MongoDB
RECENT_COUNT=$(mongosh --host $MONGO_HOST --quiet --eval "
db = db.getSiblingDB('$MONGO_DB');
db.events.countDocuments({timestamp: {\$gte: $THRESHOLD}})
" 2>/dev/null)

if [ -z "$RECENT_COUNT" ] || [ "$RECENT_COUNT" = "0" ]; then
    echo "UNHEALTHY: No recent data in MongoDB (last $MAX_AGE_SECONDS seconds)"
    exit 1
fi

echo "HEALTHY: Found $RECENT_COUNT events in last $MAX_AGE_SECONDS seconds"
exit 0
