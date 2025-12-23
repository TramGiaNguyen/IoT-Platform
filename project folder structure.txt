BinhDuong-IoT-Platform/
├── fastapi_backend/               # Backend (REST API + WebSocket + JWT)
│   ├── main.py
│   ├── auth.py
│   ├── database.py
│   ├── models.py
│   ├── routes.py
│   ├── websocket.py
│   ├── requirements.txt
│   └── .env

├── frontend/                      # React Web UI
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── index.js
│       ├── components/
│       │   ├── Dashboard.js
│       │   ├── DeviceList.js
│       │   └── Login.js
│       ├── services/
│       │   └── service.js
│       ├── styles/
│       │   └── style.css
│       └── package.json

├── mqtt_to_kafka/                # Cầu nối MQTT → Kafka
│   ├── mqtt_to_kafka.py
│   ├── config.json
│   ├── requirements.txt
│   └── Dockerfile

├── spark_jobs/                   # Spark Streaming: Kafka → MongoDB & MySQL
│   ├── process_events.py
│   └── Dockerfile

├── grafana/                      # Giám sát dữ liệu
│   ├── dashboards/
│   │   └── mqtt_mongo_dashboard.json
│   └── provisioning/
│       ├── datasources/
│       │   └── mongodb.yml
│       └── dashboards/
│           └── default.yaml

├── mqtt_server/                  # MQTT broker riêng
│   ├── docker-compose.yml
│   └── mosquitto.conf

├── simulator/                    # Thiết bị giả lập riêng
│   ├── device_simulator.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml

├── docker-compose.yml            # Docker Compose (cho hệ thống chính, không bao gồm mqtt và simulator)
├── README.md
