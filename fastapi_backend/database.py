# fastapi_backend/database.py

from pymongo import MongoClient
import mysql.connector

def get_mongo():
    client = MongoClient("mongodb://mongodb:27017")
    return client.iot

def get_mysql():
    return mysql.connector.connect(
        host="mysql", user="iot", password="iot123", database="iot_data")