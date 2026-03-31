#!/bin/bash
# Setup cron job để tự động cleanup dữ liệu cũ
# Chạy mỗi ngày lúc 2:00 AM

echo "=== Setup Data Cleanup Cron Job ==="

# 1. Setup MongoDB TTL index (chạy 1 lần)
echo "1. Setting up MongoDB TTL index (30 days)..."
docker exec mongodb python /scripts/setup_mongodb_ttl.py --days 30

# 2. Add cron job cho MySQL cleanup
echo "2. Setting up MySQL cleanup cron job..."

# Tạo script cleanup
cat > /tmp/mysql_cleanup.sh << 'EOF'
#!/bin/bash
# Auto cleanup MySQL old data
docker exec mysql python /scripts/cleanup_mysql_old_data.py --days 30
EOF

chmod +x /tmp/mysql_cleanup.sh

# Add to crontab (chạy mỗi ngày lúc 2:00 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /tmp/mysql_cleanup.sh >> /var/log/mysql_cleanup.log 2>&1") | crontab -

echo "✓ Cron job added: Daily at 2:00 AM"
echo "✓ Log file: /var/log/mysql_cleanup.log"

# 3. Test run
echo ""
echo "3. Test run (dry-run)..."
docker exec mysql python /scripts/cleanup_mysql_old_data.py --days 30 --dry-run

echo ""
echo "=== Setup Complete ==="
echo "MongoDB: TTL index active (auto-delete after 30 days)"
echo "MySQL: Cron job scheduled (daily cleanup at 2:00 AM)"
