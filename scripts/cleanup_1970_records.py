"""
Script xóa các record 1970 trong MongoDB events collection.
Timestamp = 0 hoặc null sẽ hiển thị là 1970.
"""
from pymongo import MongoClient
import sys

MONGO_URI = "mongodb://localhost:27017"
DATABASE = "iot_data"
COLLECTION = "events"

def cleanup_1970_records():
    client = MongoClient(MONGO_URI)
    db = client[DATABASE]
    coll = db[COLLECTION]

    # Đếm trước
    total = coll.count_documents({})
    bad_timestamp = coll.count_documents({
        "$or": [
            {"timestamp": {"$eq": None}},
            {"timestamp": {"$eq": 0}},
            {"timestamp": {"$lt": 1000000000}}  # Trước năm 2001
        ]
    })

    print(f"[CLEANUP] Total records: {total:,}")
    print(f"[CLEANUP] Records với timestamp 1970 (null/0/<1e9): {bad_timestamp:,}")

    if bad_timestamp == 0:
        print("[CLEANUP] Không có record 1970 để xóa.")
        return

    # Xóa các record có timestamp không hợp lệ
    result = coll.delete_many({
        "$or": [
            {"timestamp": {"$eq": None}},
            {"timestamp": {"$eq": 0}},
            {"timestamp": {"$lt": 1000000000}}
        ]
    })

    print(f"[CLEANUP] Đã xóa {result.deleted_count:,} records 1970")

    # Verify
    remaining_bad = coll.count_documents({
        "$or": [
            {"timestamp": {"$eq": None}},
            {"timestamp": {"$eq": 0}},
            {"timestamp": {"$lt": 1000000000}}
        ]
    })
    print(f"[CLEANUP] Remaining bad records: {remaining_bad}")

    client.close()

if __name__ == "__main__":
    try:
        cleanup_1970_records()
        print("[CLEANUP] Hoàn tất!")
    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
