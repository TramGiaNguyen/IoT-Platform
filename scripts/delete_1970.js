// Delete 1970 records (timestamp < 1000000000)
var deleted = db.events.deleteMany({timestamp: {$lt: 1000000000}});
print("Deleted:", deleted.deletedCount, "records");

// Verify
print("Remaining 1970 records:", db.events.countDocuments({timestamp: {$lt: 1000000000}}));
