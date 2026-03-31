# spark_jobs/process_events.py
from pyspark.sql import SparkSession
from pyspark.sql.functions import from_json, col, expr
from pyspark.sql.types import StructType, StringType, DoubleType
import logging
from pymongo import MongoClient
import mysql.connector
import json
from datetime import datetime, timedelta

spark = SparkSession.builder \
    .appName("KafkaToMongoMySQL") \
    .getOrCreate()

# Basic logging to surface runtime errors in container logs
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

spark.sparkContext.setLogLevel("WARN")

# =============================================================================
# Setup MongoDB TTL Index - Tự động xóa dữ liệu cũ hơn 30 ngày
# =============================================================================
def setup_mongodb_ttl(days=30):
    """Setup TTL index cho MongoDB để tự động xóa dữ liệu cũ."""
    try:
        client = MongoClient("mongodb://mongodb:27017")
        db = client.iot
        collection = db.events
        
        # Xóa TTL index cũ nếu có
        try:
            collection.drop_index("timestamp_ttl")
        except Exception:
            pass
        
        # Tạo TTL index mới - MongoDB sẽ tự động xóa documents cũ hơn X ngày
        seconds = days * 24 * 60 * 60
        collection.create_index(
            "timestamp",
            expireAfterSeconds=seconds,
            name="timestamp_ttl"
        )
        
        logging.info(f"[MONGO TTL] ✓ Setup TTL index: auto-delete data older than {days} days")
        
        # Log collection stats
        stats = db.command("collStats", "events")
        logging.info(f"[MONGO TTL] Collection stats: {stats.get('count', 0):,} documents, {stats.get('size', 0) / 1024 / 1024:.2f} MB")
        
    except Exception as e:
        logging.error(f"[MONGO TTL] Failed to setup TTL index: {e}")

# Setup TTL khi Spark khởi động
logging.info("[INIT] Setting up MongoDB TTL index...")
setup_mongodb_ttl(days=30)

# =============================================================================
# Cleanup MySQL old data - Chạy định kỳ
# =============================================================================
def cleanup_mysql_old_data(days=30):
    """Xóa dữ liệu MySQL cũ hơn X ngày."""
    try:
        conn = mysql.connector.connect(
            host="mysql",
            user="iot",
            password="iot123",
            database="iot_data"
        )
        cursor = conn.cursor()
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Đếm số rows sẽ xóa
        cursor.execute("""
            SELECT COUNT(*) FROM du_lieu_thiet_bi WHERE thoi_gian < %s
        """, (cutoff_date,))
        count_to_delete = cursor.fetchone()[0]
        
        if count_to_delete > 0:
            logging.info(f"[MYSQL CLEANUP] Deleting {count_to_delete:,} rows older than {days} days...")
            
            # Xóa theo batch để tránh lock
            batch_size = 10000
            deleted_total = 0
            
            while True:
                cursor.execute("""
                    DELETE FROM du_lieu_thiet_bi
                    WHERE thoi_gian < %s
                    LIMIT %s
                """, (cutoff_date, batch_size))
                
                deleted = cursor.rowcount
                deleted_total += deleted
                conn.commit()
                
                if deleted == 0:
                    break
                
                if deleted_total % 50000 == 0:
                    logging.info(f"[MYSQL CLEANUP] Progress: {deleted_total:,} rows deleted...")
            
            logging.info(f"[MYSQL CLEANUP] ✓ Deleted {deleted_total:,} rows")
        else:
            logging.info(f"[MYSQL CLEANUP] No data older than {days} days to delete")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        logging.error(f"[MYSQL CLEANUP] Failed: {e}")

# Cleanup MySQL khi Spark khởi động
logging.info("[INIT] Cleaning up old MySQL data...")
cleanup_mysql_old_data(days=30)

# Schema linh hoạt hơn để xử lý các loại dữ liệu khác nhau
# Dùng DoubleType cho timestamp để không bị null khi payload gửi float seconds.
schema = StructType() \
    .add("device_id", StringType()) \
    .add("type", StringType()) \
    .add("timestamp", DoubleType()) \
    .add("temperature", DoubleType()) \
    .add("humidity", DoubleType()) \
    .add("state", StringType()) \
    .add("setpoint", DoubleType()) \
    .add("brightness", DoubleType()) \
    .add("Thoi_gian_bat_dau", StringType()) \
    .add("Thoi_gian_ket_thuc", StringType()) \
    .add("Thoi_luong", DoubleType()) \
    .add("Nang_luong", DoubleType()) \
    .add("Dien_ap_TB", DoubleType()) \
    .add("Dien_ap_Max", DoubleType()) \
    .add("Dien_ap_Min", DoubleType()) \
    .add("Dong_dien_TB", DoubleType()) \
    .add("Dong_dien_Max", DoubleType()) \
    .add("Dong_dien_Min", DoubleType()) \
    .add("Cong_suat_TB", DoubleType()) \
    .add("Cong_suat_Max", DoubleType()) \
    .add("Cong_suat_Min", DoubleType()) \
    .add("He_so_cong_suat_TB", DoubleType()) \
    .add("Tan_so_TB", DoubleType()) \
    .add("Tien_dien", DoubleType())

df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka:9092") \
    .option("subscribe", "iot-events") \
    .option("startingOffsets", "latest") \
    .option("failOnDataLoss", "false") \
    .load()

json_df = df.selectExpr("CAST(value AS STRING) as raw_json") \
    .select(from_json(col("raw_json"), schema).alias("data"), col("raw_json")) \
    .select("data.*", "raw_json")

def write_to_mongo(row):
    """
    Ghi dữ liệu vào MongoDB collection events.
    Chỉ ghi nếu device_id đã được đăng ký trong MySQL.
    """
    # Kiểm tra device đã đăng ký chưa
    conn = mysql.connector.connect(
        host="mysql",
        user="iot",
        password="iot123",
        database="iot_data"
    )
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (row.device_id,))
        result = cursor.fetchone()
        
        if not result:
            return
        
        # Thiết bị đã đăng ký, ghi vào MongoDB
        # Parse JSON thô để không bị mất các trường custom ngoài schema!
        import json
        try:
            if not getattr(row, 'raw_json', None):
                logging.error("[MONGO] row.raw_json is empty or missing")
                data_dict = row.asDict()
            else:
                data_dict = json.loads(row.raw_json)
        except Exception as e:
            logging.error(f"[MONGO JSON ERR] {e} | raw_json: {getattr(row, 'raw_json', None)}")
            data_dict = {k: v for k, v in row.asDict().items() if v is not None}
            data_dict.pop('raw_json', None)
        
        client = MongoClient("mongodb://mongodb:27017")
        db = client.iot
        db.events.insert_one(data_dict)
    except Exception as e:
        logging.warning(f"[WARNING] MongoDB write check failed for {row.device_id}: {e}")
    finally:
        cursor.close()
        conn.close()

def write_to_mysql(row):
    """
    Ghi dữ liệu vào MySQL bảng du_lieu_thiet_bi.
    Mỗi key (temperature, humidity) được insert thành một row riêng.
    Flatten nested objects (relays array → relay_1_state, relay_2_state...).
    """
    conn = mysql.connector.connect(
        host="mysql",
        user="iot",
        password="iot123",
        database="iot_data"
    )
    cursor = conn.cursor()
    
    try:
        # Lấy thiet_bi_id từ ma_thiet_bi (device_id)
        cursor.execute("SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1", (row.device_id,))
        result = cursor.fetchone()
        
        if not result:
            # Thiết bị chưa đăng ký, bỏ qua hoặc log warning
            print(f"[WARNING] Device {row.device_id} chưa được đăng ký, bỏ qua ghi dữ liệu")
            return
        
        thiet_bi_id = result[0]
        
        # Convert timestamp từ Unix timestamp (seconds) sang datetime
        from datetime import datetime
        try:
            if hasattr(row, 'timestamp') and row.timestamp is not None:
                thoi_gian = datetime.fromtimestamp(float(row.timestamp))
            else:
                thoi_gian = datetime.utcnow()
        except (ValueError, OSError, TypeError):
            # Nếu timestamp không hợp lệ, dùng thời gian hiện tại
            thoi_gian = datetime.utcnow()
        
        import json
        # Parse raw json để insert toàn bộ dữ liệu linh hoạt, không bị cứng vào schema
        try:
            if not getattr(row, 'raw_json', None):
                logging.error("[MYSQL] row.raw_json is empty or missing")
                raw_data = row.asDict()
            else:
                raw_data = json.loads(row.raw_json)
        except Exception as e:
            logging.error(f"[MYSQL JSON ERR] {e} | raw_json: {getattr(row, 'raw_json', None)}")
            raw_data = row.asDict()
        
        # Flatten nested data
        flattened_data = {}
        skip_keys = {'device_id', 'type', 'timestamp', 'topic', '_internal_id', 'raw_json'}
        
        for khoa, gia_tri in raw_data.items():
            if khoa in skip_keys or gia_tri is None:
                continue
            
            # Xử lý mảng relays đặc biệt
            if khoa == 'relays' and isinstance(gia_tri, list):
                for relay_obj in gia_tri:
                    if isinstance(relay_obj, dict):
                        relay_num = relay_obj.get('relay')
                        if relay_num is not None:
                            # Flatten: relay_1_state, relay_1_name, relay_1_on_time_seconds...
                            for relay_key, relay_val in relay_obj.items():
                                if relay_key != 'relay' and relay_val is not None:
                                    flat_key = f"relay_{relay_num}_{relay_key}"
                                    flattened_data[flat_key] = str(relay_val)
            # Xử lý dict thông thường (flatten 1 level)
            elif isinstance(gia_tri, dict):
                for sub_key, sub_val in gia_tri.items():
                    if sub_val is not None:
                        flat_key = f"{khoa}_{sub_key}"
                        flattened_data[flat_key] = str(sub_val)
            # Xử lý list thông thường (lưu dạng JSON string)
            elif isinstance(gia_tri, list):
                flattened_data[khoa] = json.dumps(gia_tri)
            # Xử lý giá trị đơn giản
            else:
                flattened_data[khoa] = str(gia_tri)

        # Insert tất cả các keys đã flatten
        inserted_count = 0
        for khoa, gia_tri in flattened_data.items():
            try:
                cursor.execute("""
                    INSERT INTO du_lieu_thiet_bi (thiet_bi_id, khoa, gia_tri, thoi_gian)
                    VALUES (%s, %s, %s, %s)
                """, (thiet_bi_id, khoa, gia_tri, thoi_gian))
                inserted_count += 1
            except Exception as e:
                logging.warning(f"[WARNING] Failed to insert {khoa} for {row.device_id}: {e}")
        
        # Cập nhật last_seen và trang_thai trong bảng thiet_bi
        try:
            cursor.execute("""
                UPDATE thiet_bi 
                SET last_seen = %s, trang_thai = 'online'
                WHERE id = %s
            """, (thoi_gian, thiet_bi_id))
        except Exception as e:
            logging.error(f"[ERROR] Failed to update thiet_bi.last_seen for {row.device_id}: {e}")
        
        conn.commit()
        logging.info(f"[MYSQL] Inserted {inserted_count} keys for device {row.device_id}")
    except Exception as e:
        logging.error(f"[ERROR] MySQL write error: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

def foreach_batch_function(df, epoch_id):
    df.persist()
    try:
        total = df.count()
        logging.info(f"[SPARK] Epoch {epoch_id} incoming rows: {total}")
        if total == 0:
            return
        df.foreach(write_to_mongo)
        df.foreach(write_to_mysql)
        
        # Cleanup định kỳ mỗi 100 epochs (~8 phút nếu trigger 5s)
        # Điều này tránh cleanup quá thường xuyên
        if epoch_id % 100 == 0:
            logging.info(f"[CLEANUP] Running periodic cleanup (epoch {epoch_id})...")
            cleanup_mysql_old_data(days=30)
            
    except Exception as e:
        logging.error(f"[SPARK] Error in foreach_batch epoch {epoch_id}: {e}")
    finally:
        df.unpersist()

query = json_df.writeStream \
    .foreachBatch(foreach_batch_function) \
    .outputMode("append") \
    .trigger(processingTime="5 seconds") \
    .start()

query.awaitTermination()
