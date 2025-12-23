# spark_jobs/process_events.py
from pyspark.sql import SparkSession
from pyspark.sql.functions import from_json, col, expr
from pyspark.sql.types import StructType, StringType, DoubleType
import logging
from pymongo import MongoClient
import mysql.connector
import json

spark = SparkSession.builder \
    .appName("KafkaToMongoMySQL") \
    .getOrCreate()

# Basic logging to surface runtime errors in container logs
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

spark.sparkContext.setLogLevel("WARN")

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

json_df = df.selectExpr("CAST(value AS STRING)") \
    .select(from_json(col("value"), schema).alias("data")) \
    .select("data.*")

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
        # row.asDict() sẽ bao gồm tất cả các field trong schema (kể cả null)
        # Chúng ta lọc bỏ null để tiết kiệm
        data_dict = {k: v for k, v in row.asDict().items() if v is not None}
        
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
        
        # Insert các keys dữ liệu động (temperature, humidity, state, setpoint, brightness, ...)
        keys_to_insert = []
        
        # Sensor keys standard
        if hasattr(row, 'temperature') and row.temperature is not None:
            keys_to_insert.append(('temperature', str(row.temperature)))
        if hasattr(row, 'humidity') and row.humidity is not None:
            keys_to_insert.append(('humidity', str(row.humidity)))
        
        # Air Conditioner / Light keys
        if hasattr(row, 'state') and row.state is not None:
            keys_to_insert.append(('state', str(row.state)))
        if hasattr(row, 'setpoint') and row.setpoint is not None:
            keys_to_insert.append(('setpoint', str(row.setpoint)))
        if hasattr(row, 'brightness') and row.brightness is not None:
            keys_to_insert.append(('brightness', str(row.brightness)))
            
        # Smart Classroom KPI keys (nếu cần lưu vào MySQL để query nhanh, còn lại để Mongo)
        # Ví dụ lưu Nang_luong, Cong_suat_TB
        if hasattr(row, 'Nang_luong') and row.Nang_luong is not None:
             keys_to_insert.append(('Nang_luong', str(row.Nang_luong)))
        if hasattr(row, 'Cong_suat_TB') and row.Cong_suat_TB is not None:
             keys_to_insert.append(('Cong_suat_TB', str(row.Cong_suat_TB)))

        # Insert tất cả các keys
        inserted_count = 0
        for khoa, gia_tri in keys_to_insert:
            try:
                cursor.execute("""
                    INSERT INTO du_lieu_thiet_bi (thiet_bi_id, khoa, gia_tri, thoi_gian)
                    VALUES (%s, %s, %s, %s)
                """, (thiet_bi_id, khoa, gia_tri, thoi_gian))
                inserted_count += 1
            except Exception as e:
                logging.warning(f"[WARNING] Failed to insert {khoa} for {row.device_id}: {e}")
        
        # Cập nhật last_seen và trang_thai trong bảng thiet_bi
        # Dù có insert data hay không (với heartbeat hoặc data lạ), miễn là message valid từ device
        try:
            cursor.execute("""
                UPDATE thiet_bi 
                SET last_seen = %s, trang_thai = 'online'
                WHERE id = %s
            """, (thoi_gian, thiet_bi_id))
        except Exception as e:
            logging.error(f"[ERROR] Failed to update thiet_bi.last_seen for {row.device_id}: {e}")
        
        conn.commit()
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
