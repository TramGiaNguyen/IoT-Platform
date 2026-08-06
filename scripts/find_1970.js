// Find records with 1970 timestamp
print("=== iot.events ===");
db.events.find(
    {timestamp: {$lt: 1000000000}},
    {device_id:1, timestamp:1, time:1, _id:0}
).sort({timestamp:-1}).limit(10).forEach(printjson);

print("\n=== iot_events.events ===");
db.getSiblingDB("iot_events").events.find(
    {timestamp: {$lt: 1000000000}},
    {device_id:1, timestamp:1, time:1, _id:0}
).sort({timestamp:-1}).limit(10).forEach(printjson);
