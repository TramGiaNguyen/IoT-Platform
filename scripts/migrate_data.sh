#!/bin/bash
# Script tổng hợp để migrate dữ liệu giữa 2 máy

echo "=========================================="
echo "IoT Platform Data Migration Tool"
echo "=========================================="
echo ""
echo "Chọn chế độ:"
echo "1. Export data (chạy trên máy CŨ)"
echo "2. Import data (chạy trên máy MỚI)"
echo ""
read -p "Nhập lựa chọn (1 hoặc 2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    echo "📦 EXPORT MODE - Máy CŨ"
    echo "=========================================="
    
    # Install dependencies
    echo "📥 Installing Python dependencies..."
    pip install mysql-connector-python pymongo
    
    # Run export
    echo ""
    echo "🔄 Exporting data..."
    python scripts/export_data.py
    
    echo ""
    echo "✅ Export completed!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Copy folder 'backup/' to new machine"
    echo "2. Run this script on new machine and choose option 2"
    
elif [ "$choice" == "2" ]; then
    echo ""
    echo "📥 IMPORT MODE - Máy MỚI"
    echo "=========================================="
    
    # Check if backup folder exists
    if [ ! -d "backup" ]; then
        echo "❌ Error: backup/ folder not found!"
        echo "Please copy backup folder from old machine first."
        exit 1
    fi
    
    # Find latest backup files
    MYSQL_BACKUP=$(ls -t backup/mysql_backup_*.json 2>/dev/null | head -1)
    MONGO_BACKUP=$(ls -t backup/mongodb_backup_*.json 2>/dev/null | head -1)
    
    if [ -z "$MYSQL_BACKUP" ] || [ -z "$MONGO_BACKUP" ]; then
        echo "❌ Error: Backup files not found in backup/ folder"
        exit 1
    fi
    
    echo "Found backup files:"
    echo "  MySQL: $MYSQL_BACKUP"
    echo "  MongoDB: $MONGO_BACKUP"
    echo ""
    
    # Install dependencies
    echo "📥 Installing Python dependencies..."
    pip install mysql-connector-python pymongo
    
    # Run import
    echo ""
    echo "🔄 Importing data..."
    python scripts/import_data.py "$MYSQL_BACKUP" "$MONGO_BACKUP"
    
    echo ""
    echo "✅ Import completed!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Restart containers: docker-compose restart"
    echo "2. Check dashboard: http://localhost:3000"
    
else
    echo "❌ Invalid choice. Please run again and choose 1 or 2."
    exit 1
fi
