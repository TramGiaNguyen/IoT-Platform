# AI Analytics API Routes
# FastAPI routes for AI Analytics endpoints

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
import json

from auth import get_current_user
from database import get_mysql
from routes import get_workspace_conditions
import ws_events


router = APIRouter(prefix="/api/ai", tags=["AI Analytics"])


# ============================================
# Request/Response Models
# ============================================

class FieldInfoResponse(BaseModel):
    path: str
    data_type: str
    role: str
    semantic_type: Optional[str] = None
    semantic_confidence: float = 0.0
    sample_value: Optional[str] = None


class SchemaResponse(BaseModel):
    device_id: str
    schema_hash: str
    schema_version: int
    format: str
    format_confidence: float
    fields: List[FieldInfoResponse]
    created_at: Optional[datetime] = None


class MetricResponse(BaseModel):
    id: int
    device_id: str
    source_path: str
    data_type: str
    semantic_type: str
    semantic_confidence: float
    unit: Optional[str] = None
    status: str


class MetricProfileResponse(BaseModel):
    metric_id: int
    count: int
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    median: Optional[float] = None
    mad: Optional[float] = None
    mean_val: Optional[float] = None
    std_val: Optional[float] = None
    p01: Optional[float] = None
    p05: Optional[float] = None
    p50: Optional[float] = None
    p95: Optional[float] = None
    p99: Optional[float] = None
    sampling_interval: Optional[float] = None
    missing_ratio: float = 0.0
    trend: str = "stable"
    seasonality: Optional[dict] = None
    updated_at: Optional[datetime] = None


class AnomalyResponse(BaseModel):
    id: int
    metric_id: int
    timestamp: datetime
    value: float
    score: float
    severity: str
    anomaly_type: str
    details: Optional[dict] = None


class ThresholdSuggestionResponse(BaseModel):
    metric_id: int
    source_path: str
    current_threshold_warning: Optional[dict] = None
    current_threshold_critical: Optional[dict] = None
    suggested_warning: dict
    suggested_critical: dict
    method: str
    reason: str


class ForecastResponse(BaseModel):
    metric_id: int
    current_value: float
    forecast: dict
    threshold_crossing: Optional[dict] = None
    trend: str
    trend_slope: float
    trend_confidence: float
    model: str
    model_mae: Optional[float] = None
    confidence: float


class TrendResponse(BaseModel):
    direction: str
    slope: float
    normalized_slope: float
    confidence: float
    r_squared: float
    sample_count: int


class HealthIssue(BaseModel):
    type: str
    metric_id: Optional[int] = None
    source_path: Optional[str] = None
    severity: str
    message: str
    details: Optional[dict] = None
    detected_at: datetime


class ApplyThresholdRequest(BaseModel):
    threshold_type: str = "warning"  # warning or critical


# ============================================
# Helper Functions
# ============================================

def get_db_metrics(device_id: str):
    """Get all metrics for a device from DB."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM metrics WHERE device_id = %s ORDER BY source_path",
            (device_id,)
        )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


def get_metric_profile(metric_id: int):
    """Get profile for a specific metric."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM metric_profiles WHERE metric_id = %s",
            (metric_id,)
        )
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()


def get_metric(metric_id: int):
    """Get metric by ID."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM metrics WHERE id = %s", (metric_id,))
        return cursor.fetchone()
    finally:
        cursor.close()
        conn.close()


def get_metric_values_from_mongo(device_id: str, source_path: str, limit: int = 500):
    """Extract values from MongoDB events."""
    from database import get_mongo
    
    field_name = source_path.replace('$.', '').replace('$', '')
    mongo = get_mongo()
    
    cursor = mongo.events.find(
        {'device_id': device_id},
        {field_name: 1, 'timestamp': 1}
    ).sort('timestamp', -1).limit(limit)
    
    values = []
    timestamps = []
    
    for event in cursor:
        value = event.get(field_name)
        ts = event.get('timestamp')
        
        if value is not None and ts is not None:
            try:
                float_val = float(value)
                values.append(float_val)
                
                if isinstance(ts, datetime):
                    timestamps.append(ts)
                elif isinstance(ts, (int, float)):
                    timestamps.append(datetime.fromtimestamp(ts))
            except (ValueError, TypeError):
                pass
    
    values.reverse()
    timestamps.reverse()
    
    return values, timestamps


# ============================================
# Schema Endpoints
# ============================================

@router.get("/devices/{device_id}/schema", response_model=SchemaResponse)
async def get_device_schema(
    device_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the current payload schema for a device.
    Returns schema fingerprint, version, and field list.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT * FROM device_payload_schemas 
            WHERE device_id = %s 
            ORDER BY schema_version DESC 
            LIMIT 1
        """, (device_id,))
        schema = cursor.fetchone()
        
        if not schema:
            raise HTTPException(status_code=404, detail="No schema found for this device")
        
        fields = schema['fields']
        if isinstance(fields, str):
            fields = json.loads(fields)
        
        return SchemaResponse(
            device_id=device_id,
            schema_hash=schema['schema_hash'],
            schema_version=schema['schema_version'],
            format="json",
            format_confidence=1.0,
            fields=[
                FieldInfoResponse(
                    path=f['path'],
                    data_type=f.get('data_type', 'unknown'),
                    role=f.get('role', 'unknown'),
                    semantic_type=f.get('semantic_type'),
                    semantic_confidence=f.get('semantic_confidence', 0.0),
                    sample_value=str(f.get('sample_value', ''))[:50]
                ) for f in fields
            ],
            created_at=schema.get('created_at')
        )
    finally:
        cursor.close()
        conn.close()


# ============================================
# Metrics Endpoints
# ============================================

@router.get("/devices/{device_id}/metrics", response_model=List[MetricResponse])
async def get_device_metrics(
    device_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all metrics discovered for a device."""
    metrics = get_db_metrics(device_id)
    
    return [
        MetricResponse(
            id=m['id'],
            device_id=m['device_id'],
            source_path=m['source_path'],
            data_type=m['data_type'],
            semantic_type=m['semantic_type'],
            semantic_confidence=m['semantic_confidence'],
            unit=m['unit'],
            status=m['status']
        ) for m in metrics
    ]


@router.get("/metrics/{metric_id}", response_model=MetricResponse)
async def get_metric_endpoint(
    metric_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific metric by ID."""
    m = get_metric(metric_id)
    
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    return MetricResponse(
        id=m['id'],
        device_id=m['device_id'],
        source_path=m['source_path'],
        data_type=m['data_type'],
        semantic_type=m['semantic_type'],
        semantic_confidence=m['semantic_confidence'],
        unit=m['unit'],
        status=m['status']
    )


# ============================================
# Profile Endpoints
# ============================================

@router.get("/metrics/{metric_id}/profile", response_model=MetricProfileResponse)
async def get_metric_profile_endpoint(
    metric_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get statistical profile for a metric."""
    m = get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    profile = get_metric_profile(metric_id)
    
    if not profile:
        # Auto-compute profile if not found
        values, timestamps = get_metric_values_from_mongo(
            m['device_id'], m['source_path'], limit=1000
        )
        if len(values) < 30:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data to compute profile (need 30, have {len(values)})"
            )
        from services.ai_analytics.profile_engine import profile_engine
        profile = profile_engine.compute_and_save_profile(metric_id, values, timestamps)
        # Convert MetricProfile object to dict for uniform access
        profile = {
            'metric_id': profile.metric_id,
            'count': profile.count,
            'min_val': profile.min_val,
            'max_val': profile.max_val,
            'median': profile.median,
            'mad': profile.mad,
            'mean_val': profile.mean_val,
            'std_val': profile.std_val,
            'p01': profile.p01,
            'p05': profile.p05,
            'p50': profile.p50,
            'p95': profile.p95,
            'p99': profile.p99,
            'sampling_interval': profile.sampling_interval,
            'missing_ratio': profile.missing_ratio,
            'trend': profile.trend,
            'seasonality': profile.seasonality,
            'updated_at': profile.updated_at,
        }
    
    seasonality = None
    if profile['seasonality']:
        if isinstance(profile['seasonality'], str):
            seasonality = json.loads(profile['seasonality'])
        else:
            seasonality = profile['seasonality']
    
    return MetricProfileResponse(
        metric_id=metric_id,
        count=profile['count'],
        min_val=profile['min_val'],
        max_val=profile['max_val'],
        median=profile['median'],
        mad=profile['mad'],
        mean_val=profile['mean_val'],
        std_val=profile['std_val'],
        p01=profile['p01'],
        p05=profile['p05'],
        p50=profile['p50'],
        p95=profile['p95'],
        p99=profile['p99'],
        sampling_interval=profile['sampling_interval'],
        missing_ratio=profile['missing_ratio'],
        trend=profile['trend'],
        seasonality=seasonality,
        updated_at=profile['updated_at']
    )


@router.get("/devices/{device_id}/profile-summary")
async def get_device_profile_summary(
    device_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get profile summary for all metrics of a device."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT m.id, m.source_path, m.status, m.semantic_type,
                   mp.count, mp.trend, mp.mad, mp.median, mp.p95, mp.updated_at
            FROM metrics m
            LEFT JOIN metric_profiles mp ON m.id = mp.metric_id
            WHERE m.device_id = %s
        """, (device_id,))
        
        rows = cursor.fetchall()
        
        result = []
        for row in rows:
            health_score = 1.0
            if row['count']:
                if row['count'] < 100:
                    health_score = 0.5
                elif row['updated_at']:
                    age_hours = (datetime.now() - row['updated_at']).total_seconds() / 3600
                    if age_hours > 24:
                        health_score = 0.7
            
            result.append({
                'metric_id': row['id'],
                'source_path': row['source_path'],
                'status': row['status'],
                'semantic_type': row['semantic_type'],
                'data_points': row['count'] or 0,
                'health_score': health_score,
                'trend': row['trend'] or 'unknown',
                'median': row['median'],
                'p95': row['p95'],
            })
        
        return {'metrics': result}
    finally:
        cursor.close()
        conn.close()


@router.post("/metrics/{metric_id}/compute-profile")
async def compute_profile(
    metric_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Trigger profile computation for a metric."""
    from services.ai_analytics.profile_engine import profile_engine
    
    m = get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    # Get values from MongoDB
    values, timestamps = get_metric_values_from_mongo(
        m['device_id'], m['source_path'], limit=1000
    )
    
    if len(values) < 30:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough data to compute profile (need 30, have {len(values)})"
        )
    
    # Compute and save profile
    profile = profile_engine.compute_and_save_profile(metric_id, values, timestamps)

    # Publish AI event for frontend to refresh
    ws_events.publish_ai_event("profile", m['device_id'], {
        'metric_id': metric_id
    })

    return {
        'success': True,
        'metric_id': metric_id,
        'profile': {
            'count': profile.count,
            'median': profile.median,
            'mad': profile.mad,
            'trend': profile.trend,
            'updated_at': profile.updated_at
        }
    }


# ============================================
# Anomaly Endpoints
# ============================================

@router.get("/metrics/{metric_id}/anomalies", response_model=List[AnomalyResponse])
async def get_metric_anomalies(
    metric_id: int,
    from_time: Optional[datetime] = Query(None, description="Start time"),
    to_time: Optional[datetime] = Query(None, description="End time"),
    severity: Optional[str] = Query(None, regex="^(low|medium|high|critical)$"),
    limit: int = Query(100, le=1000),
    current_user: dict = Depends(get_current_user)
):
    """Get anomalies detected for a metric."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT * FROM detected_anomalies 
            WHERE metric_id = %s
        """
        params = [metric_id]
        
        if from_time:
            query += " AND timestamp >= %s"
            params.append(from_time)
        
        if to_time:
            query += " AND timestamp <= %s"
            params.append(to_time)
        
        if severity:
            query += " AND severity = %s"
            params.append(severity)
        
        query += " ORDER BY timestamp DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, params)
        anomalies = cursor.fetchall()
        
        return [
            AnomalyResponse(
                id=a['id'],
                metric_id=a['metric_id'],
                timestamp=a['timestamp'],
                value=a['value'],
                score=a['score'],
                severity=a['severity'],
                anomaly_type=a['anomaly_type'],
                details=json.loads(a['details']) if a['details'] else None
            ) for a in anomalies
        ]
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/anomalies", response_model=List[AnomalyResponse])
async def get_device_anomalies(
    device_id: str,
    from_time: Optional[datetime] = Query(None),
    to_time: Optional[datetime] = Query(None),
    limit: int = Query(100, le=1000),
    current_user: dict = Depends(get_current_user)
):
    """Get all anomalies for a device."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT da.* FROM detected_anomalies da
            JOIN metrics m ON da.metric_id = m.id
            WHERE m.device_id = %s
        """
        params = [device_id]
        
        if from_time:
            query += " AND da.timestamp >= %s"
            params.append(from_time)
        
        if to_time:
            query += " AND da.timestamp <= %s"
            params.append(to_time)
        
        query += " ORDER BY da.timestamp DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, params)
        anomalies = cursor.fetchall()
        
        return [
            AnomalyResponse(
                id=a['id'],
                metric_id=a['metric_id'],
                timestamp=a['timestamp'],
                value=a['value'],
                score=a['score'],
                severity=a['severity'],
                anomaly_type=a['anomaly_type'],
                details=json.loads(a['details']) if a['details'] else None
            ) for a in anomalies
        ]
    finally:
        cursor.close()
        conn.close()


@router.post("/metrics/{metric_id}/detect-anomalies")
async def detect_anomalies(
    metric_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Run anomaly detection on recent data for a metric."""
    from services.ai_analytics.anomaly_engine import anomaly_detector
    
    m = get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    values, timestamps = get_metric_values_from_mongo(
        m['device_id'], m['source_path'], limit=100
    )
    
    if len(values) < 30:
        return {
            'success': True,
            'anomalies_found': 0,
            'message': f'Not enough data for detection (need 30, have {len(values)})'
        }
    
    anomalies = anomaly_detector.detect_batch_anomalies(metric_id, values, timestamps)

    # Publish AI event for frontend to refresh
    ws_events.publish_ai_event("anomaly", m['device_id'], {
        'metric_id': metric_id,
        'anomalies_found': len(anomalies)
    })

    return {
        'success': True,
        'anomalies_found': len(anomalies),
        'anomalies': [
            {
                'id': a.id,
                'timestamp': a.timestamp,
                'value': a.value,
                'score': a.score,
                'severity': a.severity
            } for a in anomalies
        ]
    }


# ============================================
# Threshold Endpoints
# ============================================

@router.get("/metrics/{metric_id}/threshold-suggestions", response_model=ThresholdSuggestionResponse)
async def get_threshold_suggestions(
    metric_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get AI-suggested thresholds based on statistical analysis."""
    from services.ai_analytics.anomaly_engine import threshold_engine
    
    m = get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    profile = get_metric_profile(metric_id)
    
    suggestions = threshold_engine.get_suggestions(metric_id, profile)
    
    return ThresholdSuggestionResponse(
        metric_id=metric_id,
        source_path=m['source_path'],
        suggested_warning=suggestions['suggested_warning'],
        suggested_critical=suggestions['suggested_critical'],
        method=suggestions['method'],
        reason=suggestions['reason']
    )


@router.post("/metrics/{metric_id}/apply-threshold")
async def apply_threshold_suggestion(
    metric_id: int,
    request: ApplyThresholdRequest,
    current_user: dict = Depends(get_current_user)
):
    """Apply a suggested threshold as a new rule."""
    from services.ai_analytics.anomaly_engine import threshold_engine

    m = get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")

    try:
        rule_id = threshold_engine.create_rule_from_suggestion(
            metric_id,
            threshold_type=request.threshold_type
        )

        # Publish AI event for frontend to refresh
        ws_events.publish_ai_event("threshold", m['device_id'], {
            'metric_id': metric_id,
            'rule_id': rule_id
        })

        return {
            'success': True,
            'rule_id': rule_id,
            'message': f'Threshold rule created with ID {rule_id}'
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================
# Forecast Endpoints
# ============================================

@router.get("/metrics/{metric_id}/forecast", response_model=ForecastResponse)
async def get_metric_forecast(
    metric_id: int,
    horizon: int = Query(60, ge=5, le=1440, description="Forecast horizon in minutes"),
    current_user: dict = Depends(get_current_user)
):
    """Get forecast for a metric."""
    from services.ai_analytics.forecast_engine import forecast_engine
    
    m = get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    profile = get_metric_profile(metric_id)
    
    # Get values
    values, _ = get_metric_values_from_mongo(
        m['device_id'], m['source_path'], limit=200
    )
    
    if len(values) < 10:
        raise HTTPException(status_code=400, detail="Not enough data for forecast")
    
    # Generate forecast
    result = forecast_engine.forecast(values, horizon=horizon)
    
    # Check for threshold crossing
    threshold_crossing = None
    if profile and profile['p95']:
        threshold_crossing = forecast_engine.predict_threshold_crossing(
            values, profile['p95'], horizon
        )
    
    return ForecastResponse(
        metric_id=metric_id,
        current_value=result.current_value,
        forecast=result.forecast,
        threshold_crossing=threshold_crossing,
        trend=result.trend,
        trend_slope=result.trend_slope,
        trend_confidence=result.trend_confidence,
        model=result.model,
        model_mae=result.model_mae,
        confidence=result.confidence
    )


@router.get("/metrics/{metric_id}/trend", response_model=TrendResponse)
async def get_metric_trend(
    metric_id: int,
    window: int = Query(50, ge=10, le=500, description="Window size for trend calculation"),
    current_user: dict = Depends(get_current_user)
):
    """Get trend direction and statistics for a metric."""
    from services.ai_analytics.trend_engine import trend_engine
    
    m = get_metric(metric_id)
    if not m:
        raise HTTPException(status_code=404, detail="Metric not found")
    
    values, _ = get_metric_values_from_mongo(
        m['device_id'], m['source_path'], limit=window
    )
    
    if len(values) < 10:
        return TrendResponse(
            direction='insufficient_data',
            slope=0,
            normalized_slope=0,
            confidence=0,
            r_squared=0,
            sample_count=len(values)
        )
    
    result = trend_engine.detect_trend(values, window)
    
    return TrendResponse(
        direction=result.direction,
        slope=result.slope,
        normalized_slope=result.normalized_slope,
        confidence=result.confidence,
        r_squared=result.r_squared,
        sample_count=result.sample_count
    )


# ============================================
# Health Endpoints
# ============================================

@router.get("/devices/{device_id}/health", response_model=List[HealthIssue])
async def get_device_health(
    device_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get sensor health issues for a device."""
    from services.ai_analytics.sensor_health import sensor_health_detector
    
    issues = sensor_health_detector.detect_all(device_id)
    
    return [
        HealthIssue(
            type=i.type,
            metric_id=i.metric_id,
            source_path=i.source_path,
            severity=i.severity,
            message=i.message,
            details=i.details,
            detected_at=i.detected_at
        ) for i in issues
    ]


@router.post("/devices/{device_id}/run-health-check")
async def run_health_check(
    device_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Force run health check for a device."""
    from services.ai_analytics.sensor_health import sensor_health_detector
    
    issues = sensor_health_detector.detect_all(device_id)

    # Publish AI event for frontend to refresh
    ws_events.publish_ai_event("health", device_id, {
        'issues_found': len(issues)
    })

    return {
        'success': True,
        'device_id': device_id,
        'issues_found': len(issues),
        'issues': [
            {
                'type': i.type,
                'severity': i.severity,
                'message': i.message
            } for i in issues
        ]
    }


# ============================================
# Payload Analysis Endpoint
# ============================================

@router.post("/analyze-payload")
async def analyze_payload(
    device_id: str,
    payload: str,
    current_user: dict = Depends(get_current_user)
):
    """Analyze a sample payload from a device."""
    from services.ai_analytics import metric_normalizer
    
    try:
        raw_bytes = payload.encode('utf-8')
        result = metric_normalizer.normalize(
            raw_bytes=raw_bytes,
            device_id=device_id
        )
        
        return {
            'device_id': device_id,
            'format': result.format.value,
            'format_confidence': result.format_confidence,
            'schema_hash': result.schema_hash,
            'metrics_found': len(result.metrics),
            'metadata_found': len(result.metadata),
            'errors': result.errors,
            'fields': [
                {
                    'path': m.source_path,
                    'role': 'metric',
                    'value_sample': str(m.value)[:50]
                } for m in result.metrics
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================
# On-demand Schema Discovery
# ============================================

@router.post("/devices/{device_id}/discover-schema")
async def discover_device_schema(
    device_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    On-demand schema discovery: pull recent events from MongoDB and run
    the AI analytics pipeline to populate device_payload_schemas + metrics.
    Also marks thiet_bi.is_analyzed = 1.
    """
    from database import get_mongo
    from services.ai_analytics import metric_normalizer

    try:
        # 1. Verify device exists
        conn = get_mysql()
        try:
            cursor = conn.cursor(dictionary=True)
            try:
                cursor.execute(
                    "SELECT id FROM thiet_bi WHERE ma_thiet_bi = %s AND is_active = 1",
                    (device_id,)
                )
                device = cursor.fetchone()
                if not device:
                    raise HTTPException(status_code=404, detail="Thiết bị không tồn tại")
            finally:
                cursor.close()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi kiểm tra thiết bị: {e}")
        finally:
            conn.close()

        # 2. Pull recent events from MongoDB
        mongo = get_mongo()
        try:
            events = list(
                mongo.events.find({'device_id': device_id})
                .sort('timestamp', -1)
                .limit(50)
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Lỗi truy vấn MongoDB: {e}")

        if not events:
            raise HTTPException(
                status_code=404,
                detail="Không có dữ liệu telemetry cho thiết bị này trong MongoDB. "
                       "Hãy đảm bảo thiết bị đã gửi data."
            )

        # 3. Normalize all events and collect merged schema
        normalizer = metric_normalizer.metric_normalizer
        all_fields = {}   # path -> field dict (union of all events)
        metrics_count = 0
        errors = []

        for event in events:
            try:
                raw_bytes = json.dumps(event).encode('utf-8')
                result = normalizer.normalize(raw_payload=raw_bytes, device_id=device_id)
                for m in result.metrics:
                    path = m.source_path
                    if path not in all_fields:
                        all_fields[path] = {
                            'path': path,
                            'data_type': type(m.value).__name__.upper(),
                            'role': 'metric',
                            'semantic_type': 'UNKNOWN_NUMERIC',
                            'semantic_confidence': 0.0,
                        }
                metrics_count += len(result.metrics)
                errors.extend(result.errors)
            except Exception as e:
                errors.append(f"Event parse error: {e}")

        if not all_fields:
            raise HTTPException(
                status_code=422,
                detail="Không phát hiện được metrics nào từ dữ liệu telemetry. "
                       "Payload có thể không đúng định dạng."
            )

        # 4. Generate schema hash from union of fields
        import hashlib
        field_signatures = sorted(all_fields.keys())
        schema_hash = hashlib.sha256(
            json.dumps(field_signatures, sort_keys=True).encode()
        ).hexdigest()

        fields_json = json.dumps(list(all_fields.values()))

        # 5. Upsert into MySQL
        conn2 = get_mysql()
        try:
            cursor = conn2.cursor()
            try:
                cursor.execute("""
                    INSERT INTO device_payload_schemas
                        (device_id, schema_hash, schema_version, fields)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        schema_version = GREATEST(VALUES(schema_version), schema_version),
                        fields = VALUES(fields)
                """, (device_id, schema_hash, 1, fields_json))

                for path, field in all_fields.items():
                    cursor.execute("""
                        INSERT INTO metrics
                            (device_id, source_path, data_type, semantic_type, semantic_confidence, unit, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                            data_type = VALUES(data_type),
                            status = IF(status = 'DISCOVERED', VALUES(status), status)
                    """, (
                        device_id, path,
                        field['data_type'], field['semantic_type'],
                        field['semantic_confidence'], None, 'LEARNING',
                    ))

                cursor.execute("""
                    UPDATE thiet_bi
                    SET is_analyzed = 1
                    WHERE ma_thiet_bi = %s
                      AND (is_analyzed IS NULL OR is_analyzed = 0)
                """, (device_id,))

                conn2.commit()
            except Exception as e:
                conn2.rollback()
                raise HTTPException(status_code=500, detail=f"Lỗi khi lưu schema: {e}")
            finally:
                cursor.close()
        finally:
            conn2.close()

        return {
            'success': True,
            'device_id': device_id,
            'events_analyzed': len(events),
            'schema_hash': schema_hash,
            'metrics_discovered': len(all_fields),
            'total_metric_points': metrics_count,
            'errors': errors[:10],
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[DISCOVER] Unexpected error for {device_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Lỗi phân tích: {str(e)}")


# ============================================
# AI Alerts Endpoints
# ============================================

@router.get("/alerts", response_model=List[dict])
async def get_ai_alerts(
    device_id: Optional[str] = None,
    severity: Optional[str] = Query(None, regex="^(low|medium|high|critical)$"),
    acknowledged: Optional[bool] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(get_current_user)
):
    """Get AI-generated alerts."""
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        query = "SELECT * FROM ai_alerts WHERE 1=1"
        params = []
        
        if device_id:
            query += " AND device_id = %s"
            params.append(device_id)
        
        if severity:
            query += " AND severity = %s"
            params.append(severity)
        
        if acknowledged is not None:
            if acknowledged:
                query += " AND acknowledged_at IS NOT NULL"
            else:
                query += " AND acknowledged_at IS NULL"
        
        query += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        
        cursor.execute(query, params)
        alerts = cursor.fetchall()
        
        return alerts
    finally:
        cursor.close()
        conn.close()


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Acknowledge an AI alert."""
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE ai_alerts SET acknowledged_at = NOW() WHERE id = %s
        """, (alert_id,))
        conn.commit()
        
        return {'success': True, 'alert_id': alert_id}
    finally:
        cursor.close()
        conn.close()


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Resolve an AI alert."""
    conn = get_mysql()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE ai_alerts SET resolved_at = NOW() WHERE id = %s
        """, (alert_id,))
        conn.commit()

        return {'success': True, 'alert_id': alert_id}
    finally:
        cursor.close()
        conn.close()


# ============================================
# Devices Summary (for AI Analytics list page)
# ============================================

@router.get("/devices/summary")
async def get_devices_summary(
    workspace_id: Optional[int] = Query(None, description="Filter by workspace (Cá nhân / Nhóm)"),
    current_user: str = Depends(get_current_user)
):
    """
    Trả về danh sách thiết bị kèm thông tin tổng hợp AI:
    - trạng thái online/offline
    - đã được phân tích chưa (có metrics + profile)
    - trạng thái học (DISCOVERED / LEARNING / ACTIVE / DRIFTED / DEGRADED)
    - số anomaly 24h gần nhất + severity cao nhất
    - số AI alert đang mở + severity cao nhất
    Áp dụng cùng workspace filter như GET /devices (admin/teacher/student).
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Xác định workspace filter giống /devices
        ws_cond, ws_params = get_workspace_conditions(cursor, current_user, workspace_id, alias="t")

        sql = f"""
            SELECT
                t.ma_thiet_bi,
                t.ten_thiet_bi,
                t.loai_thiet_bi,
                t.trang_thai,
                t.last_seen,
                t.phong_id,
                p.ten_phong,
                COUNT(DISTINCT m.id) AS metrics_count,
                MAX(m.status) AS status_overall,
                (
                    SELECT COUNT(DISTINCT da.id)
                    FROM detected_anomalies da
                    INNER JOIN metrics m2 ON da.metric_id = m2.id
                    WHERE m2.device_id = t.ma_thiet_bi
                      AND da.timestamp >= (NOW() - INTERVAL 1 DAY)
                ) AS anomaly_count_24h,
                (
                    SELECT CASE
                        WHEN EXISTS (
                            SELECT 1 FROM detected_anomalies da2
                            INNER JOIN metrics m3 ON da2.metric_id = m3.id
                            WHERE m3.device_id = t.ma_thiet_bi
                              AND da2.timestamp >= (NOW() - INTERVAL 1 DAY)
                              AND da2.severity = 'critical'
                        ) THEN 'critical'
                        WHEN EXISTS (
                            SELECT 1 FROM detected_anomalies da2
                            INNER JOIN metrics m3 ON da2.metric_id = m3.id
                            WHERE m3.device_id = t.ma_thiet_bi
                              AND da2.timestamp >= (NOW() - INTERVAL 1 DAY)
                              AND da2.severity = 'high'
                        ) THEN 'high'
                        WHEN EXISTS (
                            SELECT 1 FROM detected_anomalies da2
                            INNER JOIN metrics m3 ON da2.metric_id = m3.id
                            WHERE m3.device_id = t.ma_thiet_bi
                              AND da2.timestamp >= (NOW() - INTERVAL 1 DAY)
                              AND da2.severity = 'medium'
                        ) THEN 'medium'
                        WHEN EXISTS (
                            SELECT 1 FROM detected_anomalies da2
                            INNER JOIN metrics m3 ON da2.metric_id = m3.id
                            WHERE m3.device_id = t.ma_thiet_bi
                              AND da2.timestamp >= (NOW() - INTERVAL 1 DAY)
                              AND da2.severity = 'low'
                        ) THEN 'low'
                        ELSE NULL
                    END
                ) AS anomaly_max_severity,
                (
                    SELECT COUNT(*)
                    FROM ai_alerts aa
                    WHERE aa.device_id = t.ma_thiet_bi
                      AND aa.resolved_at IS NULL
                ) AS alert_unresolved_count,
                (
                    SELECT CASE
                        WHEN EXISTS (
                            SELECT 1 FROM ai_alerts aa2
                            WHERE aa2.device_id = t.ma_thiet_bi
                              AND aa2.resolved_at IS NULL
                              AND aa2.severity = 'critical'
                        ) THEN 'critical'
                        WHEN EXISTS (
                            SELECT 1 FROM ai_alerts aa2
                            WHERE aa2.device_id = t.ma_thiet_bi
                              AND aa2.resolved_at IS NULL
                              AND aa2.severity = 'high'
                        ) THEN 'high'
                        WHEN EXISTS (
                            SELECT 1 FROM ai_alerts aa2
                            WHERE aa2.device_id = t.ma_thiet_bi
                              AND aa2.resolved_at IS NULL
                              AND aa2.severity = 'medium'
                        ) THEN 'medium'
                        WHEN EXISTS (
                            SELECT 1 FROM ai_alerts aa2
                            WHERE aa2.device_id = t.ma_thiet_bi
                              AND aa2.resolved_at IS NULL
                              AND aa2.severity = 'low'
                        ) THEN 'low'
                        ELSE NULL
                    END
                ) AS alert_max_severity
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            LEFT JOIN metrics m ON m.device_id = t.ma_thiet_bi
            WHERE t.is_active = 1 AND ({ws_cond})
            GROUP BY t.id
            ORDER BY t.last_seen DESC, t.ma_thiet_bi ASC
        """
        cursor.execute(sql, ws_params)
        rows = cursor.fetchall() or []

        devices = []
        online_count = 0
        for r in rows:
            metrics_count = int(r.get("metrics_count") or 0)
            anomaly_count = int(r.get("anomaly_count_24h") or 0)
            alert_count = int(r.get("alert_unresolved_count") or 0)

            severity_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1, None: 0}
            anomaly_sev = r.get("anomaly_max_severity")
            alert_sev = r.get("alert_max_severity")
            overall_sev = (
                anomaly_sev
                if severity_rank.get(anomaly_sev, 0) >= severity_rank.get(alert_sev, 0)
                else alert_sev
            )

            analyzed = metrics_count > 0
            status_overall = r.get("status_overall") if analyzed else "NONE"

            trang_thai = r.get("trang_thai") or "offline"
            if trang_thai == "online":
                online_count += 1

            last_seen = r.get("last_seen")
            if last_seen is not None and not isinstance(last_seen, str):
                try:
                    last_seen = last_seen.isoformat()
                except Exception:
                    last_seen = str(last_seen)

            devices.append({
                "ma_thiet_bi": r.get("ma_thiet_bi"),
                "ten_thiet_bi": r.get("ten_thiet_bi") or r.get("ma_thiet_bi"),
                "loai_thiet_bi": r.get("loai_thiet_bi"),
                "phong_id": r.get("phong_id"),
                "ten_phong": r.get("ten_phong"),
                "trang_thai": trang_thai,
                "last_seen": last_seen,
                "analyzed": analyzed,
                "metrics_count": metrics_count,
                "status_overall": status_overall,
                "anomaly_count_24h": anomaly_count,
                "anomaly_max_severity": anomaly_sev,
                "alert_unresolved_count": alert_count,
                "alert_max_severity": alert_sev,
                "max_severity": overall_sev,
            })

        return {
            "devices": devices,
            "total": len(devices),
            "online_count": online_count,
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/devices/{device_id}/summary")
async def get_device_summary(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Trả về AI summary cho 1 thiết bị cụ thể (dùng cho realtime update).
    """
    from routes import get_workspace_conditions

    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        workspace_filter, params = get_workspace_conditions(current_user, "t")
        params.append(device_id)

        cursor.execute(f"""
            SELECT
                t.ma_thiet_bi,
                t.ten_thiet_bi,
                t.loai_thiet_bi,
                t.phong_id,
                p.ten_phong,
                t.trang_thai,
                t.last_seen,
                (SELECT COUNT(DISTINCT m.id) FROM metrics m WHERE m.device_id = t.ma_thiet_bi AND m.status != 'NONE') AS metrics_count,
                t.status AS status_overall,
                CASE
                    WHEN EXISTS (SELECT 1 FROM metrics m WHERE m.device_id = t.ma_thiet_bi AND m.status != 'NONE') THEN 1
                    ELSE 0
                END AS analyzed
            FROM thiet_bi t
            LEFT JOIN phong p ON t.phong_id = p.id
            WHERE t.ma_thiet_bi = %s
              AND {workspace_filter}
            LIMIT 1
        """, params)
        row = cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Device not found")

        # Get anomaly count (24h)
        cursor.execute("""
            SELECT COUNT(*) as cnt, MAX(da.severity) as max_severity
            FROM detected_anomalies da
            JOIN metrics m ON da.metric_id = m.id
            WHERE m.device_id = %s
              AND da.timestamp >= (NOW() - INTERVAL 1 DAY)
        """, [device_id])
        anomaly_row = cursor.fetchone()
        anomaly_count = anomaly_row['cnt'] or 0
        anomaly_sev = anomaly_row['max_severity']

        # Get alert count
        cursor.execute("""
            SELECT COUNT(*) as cnt, MAX(severity) as max_severity
            FROM alerts
            WHERE device_id = %s AND resolved = 0
        """, [device_id])
        alert_row = cursor.fetchone()
        alert_count = alert_row['cnt'] or 0
        alert_sev = alert_row['max_severity']

        # Compute overall severity
        def severity_rank(s):
            return {'critical': 4, 'high': 3, 'medium': 2, 'low': 1}.get(s, 0)

        severities = [s for s in [anomaly_sev, alert_sev] if s]
        overall_sev = max(severities, key=severity_rank) if severities else None

        last_seen = row.get("last_seen")
        if last_seen is not None and not isinstance(last_seen, str):
            try:
                last_seen = last_seen.isoformat()
            except Exception:
                last_seen = str(last_seen)

        return {
            "ma_thiet_bi": row.get("ma_thiet_bi"),
            "ten_thiet_bi": row.get("ten_thiet_bi") or row.get("ma_thiet_bi"),
            "loai_thiet_bi": row.get("loai_thiet_bi"),
            "phong_id": row.get("phong_id"),
            "ten_phong": row.get("ten_phong"),
            "trang_thai": row.get("trang_thai"),
            "last_seen": last_seen,
            "analyzed": bool(row.get("analyzed")),
            "metrics_count": row.get("metrics_count") or 0,
            "status_overall": row.get("status_overall"),
            "anomaly_count_24h": anomaly_count,
            "anomaly_max_severity": anomaly_sev,
            "alert_unresolved_count": alert_count,
            "alert_max_severity": alert_sev,
            "max_severity": overall_sev,
        }
    finally:
        cursor.close()
        conn.close()


@router.get("/components/{device_id}/widget-summary")
async def get_component_widget_summary(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Get compact summary for widget display.
    Returns: overall_health_score, component_count, issues_count, status, top_components
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get all components for this device
        cursor.execute("""
            SELECT
                component_id,
                component_type,
                field_name,
                hardware_model,
                health_score,
                health_status,
                last_seen
            FROM device_components
            WHERE device_id = %s
            ORDER BY CASE WHEN health_score IS NULL THEN 1 ELSE 0 END, health_score ASC
            LIMIT 10
        """, (device_id,))
        components = cursor.fetchall()

        if not components:
            return {
                "device_id": device_id,
                "status": "unknown",
                "overall_health_score": None,
                "component_count": 0,
                "issues_count": 0,
                "top_components": [],
                "message": "No components detected yet"
            }

        # Calculate overall health
        valid_scores = [c['health_score'] for c in components if c['health_score'] is not None]
        overall_score = sum(valid_scores) / len(valid_scores) if valid_scores else None

        # Count issues
        issues_count = sum(
            1 for c in components
            if c['health_status'] in ('critical', 'warning', 'degraded') or
               (c['health_score'] is not None and c['health_score'] < 0.7)
        )

        # Determine status
        if overall_score is None:
            status = "unknown"
        elif overall_score >= 0.8:
            status = "healthy"
        elif overall_score >= 0.5:
            status = "warning"
        else:
            status = "critical"

        # Get top components (most important)
        top_components = []
        for c in components[:5]:
            top_components.append({
                "component_type": c['component_type'],
                "field_name": c['field_name'],
                "health_score": c['health_score'],
                "health_status": c['health_status'],
                "last_seen": c['last_seen'].isoformat() if c['last_seen'] else None
            })

        # Get recent critical issues
        cursor.execute("""
            SELECT event_type, severity, details, created_at
            FROM component_events
            WHERE device_id = %s
              AND severity IN ('critical', 'warning')
              AND created_at > NOW() - INTERVAL 24 HOUR
            ORDER BY created_at DESC
            LIMIT 3
        """, (device_id,))
        recent_events = cursor.fetchall()

        return {
            "device_id": device_id,
            "status": status,
            "overall_health_score": round(overall_score, 3) if overall_score else None,
            "component_count": len(components),
            "issues_count": issues_count,
            "top_components": top_components,
            "recent_alerts": [
                {
                    "event_type": e['event_type'],
                    "severity": e['severity'],
                    "created_at": e['created_at'].isoformat() if e['created_at'] else None
                }
                for e in recent_events
            ]
        }

    finally:
        cursor.close()
        conn.close()


@router.get("/components/{device_id}/hardware-profile")
async def get_hardware_profile(
    device_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Get complete hardware profile for a device.
    Returns all detected components, inferred device type, and hardware models.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT
                id,
                component_id as component_id_name,
                component_type,
                field_name,
                hardware_model,
                connection_type,
                detection_confidence,
                device_type,
                device_type_confidence,
                health_status,
                health_score,
                metadata,
                first_seen,
                last_seen
            FROM device_components
            WHERE device_id = %s
            ORDER BY detection_confidence DESC
        """, (device_id,))
        rows = cursor.fetchall()

        if not rows:
            return {
                "device_id": device_id,
                "found": False,
                "message": "No hardware components detected yet"
            }

        # Determine overall device type from components
        device_type = None
        max_confidence = 0
        for row in rows:
            if row['device_type'] and row['device_type_confidence'] > max_confidence:
                device_type = row['device_type']
                max_confidence = row['device_type_confidence']

        # Get most common hardware model
        hardware_models = [r['hardware_model'] for r in rows if r['hardware_model']]
        hardware_model = max(set(hardware_models), key=hardware_models.count) if hardware_models else None

        components = []
        for row in rows:
            metadata = row.get('metadata')
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except:
                    metadata = None

            components.append({
                "component_id": row['component_id_name'],
                "component_type": row['component_type'],
                "field_name": row['field_name'],
                "hardware_model": row['hardware_model'],
                "connection_type": row['connection_type'],
                "detection_confidence": row['detection_confidence'],
                "device_type": row['device_type'],
                "device_type_confidence": row['device_type_confidence'],
                "health_status": row['health_status'],
                "health_score": row['health_score'],
                "metadata": metadata,
                "first_seen": row['first_seen'].isoformat() if row['first_seen'] else None,
                "last_seen": row['last_seen'].isoformat() if row['last_seen'] else None
            })

        return {
            "device_id": device_id,
            "found": True,
            "device_type": device_type,
            "device_type_confidence": max_confidence,
            "hardware_model": hardware_model,
            "components": components,
            "component_count": len(components)
        }

    finally:
        cursor.close()
        conn.close()


@router.get("/components/{device_id}/{component_id}/health")
async def get_component_health(
    device_id: str,
    component_id: str,
    current_user: str = Depends(get_current_user)
):
    """
    Get health status for a specific component.
    Returns health score, issues, and recent events.
    """
    conn = get_mysql()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get component details
        cursor.execute("""
            SELECT
                id,
                component_id as component_id_name,
                component_type,
                field_name,
                hardware_model,
                health_status,
                health_score,
                health_history,
                metadata,
                last_seen
            FROM device_components
            WHERE device_id = %s
              AND (component_id = %s OR id = %s)
            LIMIT 1
        """, (device_id, component_id, component_id))
        component = cursor.fetchone()

        if not component:
            raise HTTPException(status_code=404, detail="Component not found")

        # Parse health history
        health_history = component.get('health_history')
        if isinstance(health_history, str):
            try:
                health_history = json.loads(health_history)
            except:
                health_history = []

        # Get recent events for this component
        cursor.execute("""
            SELECT id, event_type, severity, details, timestamp
            FROM component_events
            WHERE device_id = %s
              AND (component_id = %s OR component_id LIKE %s)
            ORDER BY timestamp DESC
            LIMIT 10
        """, (device_id, component_id, f"{component_id}%"))
        events = cursor.fetchall()

        # Build issues list
        issues = []
        if component['health_status'] in ('degraded', 'failed'):
            issues.append({
                "type": "health_degraded",
                "severity": "warning" if component['health_status'] == 'degraded' else "critical",
                "description": f"Component health is {component['health_status']}",
                "message": f"Component '{component['component_type']}' is in {component['health_status']} state"
            })

        if component['health_score'] is not None and component['health_score'] < 0.5:
            issues.append({
                "type": "low_health_score",
                "severity": "critical",
                "description": f"Health score below threshold: {component['health_score']:.2f}",
                "message": f"Health score is critically low"
            })

        # Determine overall score
        overall_score = component['health_score'] if component['health_score'] is not None else 0.5

        return {
            "device_id": device_id,
            "component_id": component['component_id_name'],
            "component_type": component['component_type'],
            "field_name": component['field_name'],
            "hardware_model": component['hardware_model'],
            "health_status": component['health_status'],
            "health_score": overall_score,
            "overall_score": overall_score,
            "issues": issues,
            "events": [
                {
                    "id": e['id'],
                    "event_type": e['event_type'],
                    "severity": e['severity'],
                    "timestamp": e['timestamp'].isoformat() if e['timestamp'] else None
                }
                for e in events
            ]
        }

    finally:
        cursor.close()
        conn.close()
