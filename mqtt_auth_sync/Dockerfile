FROM eclipse-mosquitto:2

# Install Python and dependencies for password sync
RUN apk add --no-cache python3 py3-pip

# Install Python packages
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt --break-system-packages

# Copy sync script
COPY sync_credentials.py /app/sync_credentials.py

# Copy mosquitto config
COPY mosquitto.conf /mosquitto/config/mosquitto.conf

# Create password file with default users and correct permissions
RUN touch /mosquitto/config/password_file && \
    chown mosquitto:mosquitto /mosquitto/config/password_file && \
    chmod 600 /mosquitto/config/password_file && \
    mosquitto_passwd -b /mosquitto/config/password_file mqtt_to_kafka mqtt2kafka_secret && \
    mosquitto_passwd -b /mosquitto/config/password_file device_simulator simulator_secret && \
    mosquitto_passwd -b /mosquitto/config/password_file rule_engine ruleengine_secret && \
    mosquitto_passwd -b /mosquitto/config/password_file bdu_admin admin_secret

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 1883 9001

ENTRYPOINT ["/entrypoint.sh"]
