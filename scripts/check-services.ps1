# IoT Platform Service Health Check
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "IoT PLATFORM SERVICE HEALTH CHECK" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Function to check service
function Check-Service {
    param(
        [string]$Name,
        [string]$Container,
        [string]$Category,
        [string]$Port = "",
        [string]$HealthUrl = ""
    )
    
    $status = docker inspect --format='{{.State.Status}}' $Container 2>$null
    $health = docker inspect --format='{{.State.Health.Status}}' $Container 2>$null
    
    if ($status -eq "running") {
        $icon = "✅"
        $color = "Green"
        
        if ($health -eq "unhealthy") {
            $icon = "⚠️"
            $color = "Yellow"
            $statusText = "Running (Unhealthy)"
        } elseif ($health -eq "healthy") {
            $statusText = "Running (Healthy)"
        } else {
            $statusText = "Running"
        }
    } else {
        $icon = "❌"
        $color = "Red"
        $statusText = "Not Running"
    }
    
    $portText = if ($Port) { " [$Port]" } else { "" }
    Write-Host "$icon $Name$portText" -ForegroundColor $color -NoNewline
    Write-Host " - $statusText" -ForegroundColor Gray
}

# Core Infrastructure
Write-Host "`n📦 CORE INFRASTRUCTURE" -ForegroundColor Yellow
Write-Host "-" * 80
Check-Service "Zookeeper" "zookeeper" "Infrastructure" "2181"
Check-Service "Kafka" "kafka" "Infrastructure" "9092"
Check-Service "MySQL" "mysql" "Database" "3308"
Check-Service "MongoDB" "mongodb" "Database" "27017"

# Message Brokers
Write-Host "`n📡 MESSAGE BROKERS" -ForegroundColor Yellow
Write-Host "-" * 80
Check-Service "MQTT Broker" "mqtt" "Broker" "1883, 9001"
Check-Service "MQTT to Kafka" "mqtt_to_kafka" "Adapter"
Check-Service "HTTP to Kafka" "http_to_kafka" "Adapter" "5000"
Check-Service "CoAP Adapter" "coap_adapter" "Adapter" "5683"

# Data Processing
Write-Host "`n⚙️ DATA PROCESSING" -ForegroundColor Yellow
Write-Host "-" * 80
Check-Service "Spark Processor" "spark_processor" "Processing"
Check-Service "Rule Engine" "rule_engine" "Automation"

# Backend Services
Write-Host "`n🔧 BACKEND SERVICES" -ForegroundColor Yellow
Write-Host "-" * 80
Check-Service "FastAPI Backend" "fastapi_backend" "API" "8000"
Check-Service "Backend App Control" "backend_app_control" "API" "8001"
Check-Service "Device Control" "device_control" "Control" "8100"

# Frontend and Monitoring
Write-Host "`nFRONTEND AND MONITORING" -ForegroundColor Yellow
Write-Host "-" * 80
Check-Service "React Dashboard" "react_dashboard" "Frontend" "3000"
Check-Service "Grafana" "grafana" "Monitoring" "3001"

# Simulators
Write-Host "`nSIMULATORS AND TESTING" -ForegroundColor Yellow
Write-Host "-" * 80
Check-Service "Device Simulator" "device_simulator" "Testing"

Write-Host "`n" + "=" * 80 -ForegroundColor Cyan

# Summary
Write-Host "`n📊 SUMMARY" -ForegroundColor Cyan
Write-Host "-" * 80

$allContainers = @(
    "zookeeper", "kafka", "mysql", "mongodb",
    "mqtt", "mqtt_to_kafka", "http_to_kafka", "coap_adapter",
    "spark_processor", "rule_engine",
    "fastapi_backend", "backend_app_control", "device_control",
    "react_dashboard", "grafana",
    "device_simulator"
)

$running = 0
$stopped = 0
$unhealthy = 0

foreach ($container in $allContainers) {
    $status = docker inspect --format='{{.State.Status}}' $container 2>$null
    $health = docker inspect --format='{{.State.Health.Status}}' $container 2>$null
    
    if ($status -eq "running") {
        $running++
        if ($health -eq "unhealthy") {
            $unhealthy++
        }
    } else {
        $stopped++
    }
}

Write-Host "Total Services: $($allContainers.Count)" -ForegroundColor White
Write-Host "Running: $running" -ForegroundColor Green
Write-Host "Stopped: $stopped" -ForegroundColor Red
Write-Host "Unhealthy: $unhealthy" -ForegroundColor Yellow

Write-Host "`n" + "=" * 80 -ForegroundColor Cyan

# Quick Access URLs
Write-Host "`n🌐 QUICK ACCESS URLS" -ForegroundColor Cyan
Write-Host "-" * 80
Write-Host "Dashboard:        http://localhost:3000" -ForegroundColor White
Write-Host "API Docs:         http://localhost:8000/docs" -ForegroundColor White
Write-Host "App Control:      http://localhost:8001" -ForegroundColor White
Write-Host "Grafana:          http://localhost:3001" -ForegroundColor White
Write-Host "Device Control:   http://localhost:8100" -ForegroundColor White
Write-Host ""
Write-Host "MQTT Broker:      mqtt://localhost:1883" -ForegroundColor White
Write-Host "HTTP Ingestion:   http://localhost:5000/data" -ForegroundColor White
Write-Host "CoAP Ingestion:   coap://localhost:5683/data" -ForegroundColor White

Write-Host "`n" + "=" * 80 -ForegroundColor Cyan
