// Count 1970 records
print("=== iot_events.events ===");
print("Total:", db.events.countDocuments({}));
print("1970 records:", db.events.countDocuments({timestamp: {$in: [null, 0]}}));
print("Before 2001:", db.events.countDocuments({timestamp: {$lt: 1000000000}}));

print("\n=== iot.events ===");
print("Total:", db.events.countDocuments({}));
print("1970 records:", db.events.countDocuments({timestamp: {$in: [null, 0]}}));
print("Before 2001:", db.events.countDocuments({timestamp: {$lt: 1000000000}}));
