-- Insert test anomalies for sensor-bdu-001
INSERT INTO detected_anomalies (metric_id, timestamp, value, score, severity, anomaly_type, details) VALUES
(1, NOW() - INTERVAL 10 MINUTE, 95.5, 4.2, 'high', 'point', '{"expected_range": "20-35", "deviation": 3.5}'),
(1, NOW() - INTERVAL 5 MINUTE, 99.8, 5.1, 'critical', 'point', '{"expected_range": "20-35", "deviation": 4.8}'),
(2, NOW() - INTERVAL 3 MINUTE, 5.2, 3.8, 'medium', 'point', '{"expected_range": "40-70", "deviation": 2.9}');
