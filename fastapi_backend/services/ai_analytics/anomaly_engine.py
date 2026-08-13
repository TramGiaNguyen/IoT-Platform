# Anomaly Detection Engine
# MAD-based point anomaly detection with severity classification

from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime
from dataclasses import dataclass
import json

from database import get_mysql
from .statistics import (
    compute_statistics, detect_point_anomaly, get_dynamic_threshold,
    RobustStatistics
)
from .profile_engine import profile_engine, MetricStatus


@dataclass
class Anomaly:
    """Detected anomaly record."""
    id: Optional[int]
    metric_id: int
    timestamp: datetime
    value: float
    score: float
    severity: str  # 'low', 'medium', 'high', 'critical'
    anomaly_type: str  # 'point', 'contextual', 'trend', 'change_point', 'sensor_health'
    details: Dict[str, Any]
    created_at: datetime


class AnomalyDetector:
    """
    Real-time anomaly detection using robust statistics.
    Uses MAD-based detection to avoid false positives from outliers.
    """
    
    # Severity thresholds (anomaly score)
    SEVERITY_LOW = 0.5
    SEVERITY_MEDIUM = 0.7
    SEVERITY_HIGH = 0.85
    SEVERITY_CRITICAL = 0.95
    
    def __init__(self):
        self.profile_engine = profile_engine
    
    def detect_anomaly(
        self,
        metric_id: int,
        value: float,
        timestamp: datetime,
        profile: Optional[Any] = None
    ) -> Optional[Anomaly]:
        """
        Detect if a single value is anomalous.
        Returns Anomaly if detected, None otherwise.
        """
        if profile is None:
            profile = self.profile_engine.get_profile(metric_id)
        
        if profile is None or profile.count < 30:
            # Not enough data for reliable detection
            return None
        
        # Get current statistics
        median = profile.median
        mad = profile.mad
        
        # Detect anomaly
        score, is_anomaly = detect_point_anomaly(value, median, mad, k=3.0)
        
        if not is_anomaly:
            return None
        
        # Determine severity
        severity = self._score_to_severity(score)
        
        # Calculate expected value for details
        expected_value = median
        deviation = abs(value - median)
        
        details = {
            'expected_value': expected_value,
            'deviation': deviation,
            'mad': mad,
            'z_score': deviation / (1.4826 * mad) if mad > 0 else 0,
            'profile_median': median,
            'profile_mad': mad
        }
        
        # Save anomaly to database
        anomaly_id = self._save_anomaly(
            metric_id=metric_id,
            timestamp=timestamp,
            value=value,
            score=score,
            severity=severity,
            anomaly_type='point',
            details=details
        )

        # Create alert from anomaly
        if anomaly_id:
            self.create_ai_alert_from_anomaly(
                anomaly=Anomaly(
                    id=anomaly_id,
                    metric_id=metric_id,
                    timestamp=timestamp,
                    value=value,
                    score=score,
                    severity=severity,
                    anomaly_type='point',
                    details=details,
                    created_at=datetime.now()
                )
            )

        return Anomaly(
            id=anomaly_id,
            metric_id=metric_id,
            timestamp=timestamp,
            value=value,
            score=score,
            severity=severity,
            anomaly_type='point',
            details=details,
            created_at=datetime.now()
        )
    
    def detect_batch_anomalies(
        self,
        metric_id: int,
        values: List[float],
        timestamps: List[datetime]
    ) -> List[Anomaly]:
        """
        Detect anomalies in a batch of values.
        Used for historical analysis.
        """
        if len(values) < 30:
            return []
        
        anomalies = []
        
        # Compute profile from first portion of data
        profile_values = values[:-10]  # Leave some for testing
        profile_stats = compute_statistics(profile_values)
        
        # Test against remaining values
        test_values = values[-10:]
        test_times = timestamps[-10:]
        
        for value, timestamp in zip(test_values, test_times):
            anomaly = self._detect_single(
                metric_id, value, timestamp, profile_stats
            )
            if anomaly:
                anomalies.append(anomaly)
        
        return anomalies
    
    def _detect_single(
        self,
        metric_id: int,
        value: float,
        timestamp: datetime,
        stats: RobustStatistics
    ) -> Optional[Anomaly]:
        """Internal method to detect single anomaly."""
        score, is_anomaly = detect_point_anomaly(
            value, stats.median, stats.mad, k=3.0
        )
        
        if not is_anomaly:
            return None
        
        severity = self._score_to_severity(score)
        
        details = {
            'expected_value': stats.median,
            'deviation': abs(value - stats.median),
            'mad': stats.mad
        }
        
        anomaly_id = self._save_anomaly(
            metric_id=metric_id,
            timestamp=timestamp,
            value=value,
            score=score,
            severity=severity,
            anomaly_type='point',
            details=details
        )
        
        return Anomaly(
            id=anomaly_id,
            metric_id=metric_id,
            timestamp=timestamp,
            value=value,
            score=score,
            severity=severity,
            anomaly_type='point',
            details=details,
            created_at=datetime.now()
        )
    
    def _score_to_severity(self, score: float) -> str:
        """Convert anomaly score to severity level."""
        if score >= self.SEVERITY_CRITICAL:
            return 'critical'
        elif score >= self.SEVERITY_HIGH:
            return 'high'
        elif score >= self.SEVERITY_MEDIUM:
            return 'medium'
        elif score >= self.SEVERITY_LOW:
            return 'low'
        else:
            return 'low'
    
    def _save_anomaly(
        self,
        metric_id: int,
        timestamp: datetime,
        value: float,
        score: float,
        severity: str,
        anomaly_type: str,
        details: Dict[str, Any]
    ) -> int:
        """Save anomaly to database and return ID."""
        conn = get_mysql()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO detected_anomalies (
                    metric_id, timestamp, value, score, severity, anomaly_type, details
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                metric_id,
                timestamp,
                value,
                score,
                severity,
                anomaly_type,
                json.dumps(details)
            ))
            conn.commit()
            return cursor.lastrowid
        finally:
            cursor.close()
            conn.close()

    def _get_metric_info(self, metric_id: int) -> Optional[Dict[str, Any]]:
        """Get metric and device info for a metric ID."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT m.id, m.name, m.source_path, m.device_id,
                       t.ten_thiet_bi, t.phong_id
                FROM metrics m
                LEFT JOIN thiet_bi t ON m.device_id = t.id
                WHERE m.id = %s
            """, (metric_id,))
            return cursor.fetchone()
        finally:
            cursor.close()
            conn.close()

    def create_ai_alert_from_anomaly(
        self,
        anomaly: Anomaly,
        metric_name: Optional[str] = None,
        device_id: Optional[str] = None,
        device_name: Optional[str] = None
    ) -> Optional[int]:
        """
        Create an alert in canh_bao table from a detected anomaly.
        Returns: alarm_id or None
        """
        # Get metric info if not provided
        if metric_name is None or device_id is None:
            metric_info = self._get_metric_info(anomaly.metric_id)
            if metric_info:
                metric_name = metric_name or metric_info.get('name') or metric_info.get('source_path', 'Unknown')
                device_id = device_id or metric_info.get('device_id')
                device_name = device_name or metric_info.get('ten_thiet_bi')
        else:
            metric_info = None

        if device_id is None:
            logger.warning(f"[ANOMALY_ALERT] Cannot create alert: device_id not found for metric {anomaly.metric_id}")
            return None

        # Create message
        score_percent = f"{anomaly.score * 100:.1f}%"
        message = (
            f"AI phat hien bat thuong [{anomaly.severity.upper()}] "
            f"trên chi so '{metric_name or 'Unknown'}': "
            f"gia tri {anomaly.value} (diem: {score_percent})"
        )

        # Prepare data context
        data_context = {
            'anomaly_id': anomaly.id,
            'metric_id': anomaly.metric_id,
            'metric_name': metric_name,
            'value': anomaly.value,
            'score': anomaly.score,
            'score_percent': score_percent,
            'anomaly_type': anomaly.anomaly_type,
            'expected_value': anomaly.details.get('expected_value') if anomaly.details else None,
            'deviation': anomaly.details.get('deviation') if anomaly.details else None,
        }

        # Insert directly to canh_bao with nguon='ai'
        conn = get_mysql()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO canh_bao (loai, device_id, tin_nhan, muc_do, trang_thai, data_context, nguon)
                VALUES ('ai_anomaly', %s, %s, %s, 'new', %s, 'ai')
            """, (
                device_id,
                message,
                anomaly.severity,
                json.dumps(data_context)
            ))
            conn.commit()
            alarm_id = cursor.lastrowid
            return alarm_id
        except Exception as e:
            # Table might not have nguon column yet, try without it
            try:
                cursor.execute("""
                    INSERT INTO canh_bao (loai, device_id, tin_nhan, muc_do, trang_thai, data_context)
                    VALUES ('ai_anomaly', %s, %s, %s, 'new', %s)
                """, (
                    device_id,
                    message,
                    anomaly.severity,
                    json.dumps(data_context)
                ))
                conn.commit()
                return cursor.lastrowid
            except Exception as fallback_error:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"[ANOMALY_ALERT] Failed to create alert: {fallback_error}")
                conn.rollback()
                return None
        finally:
            cursor.close()
            conn.close()
    
    def get_recent_anomalies(
        self,
        metric_id: int,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get recent anomalies for a metric."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT * FROM detected_anomalies
                WHERE metric_id = %s
                ORDER BY timestamp DESC
                LIMIT %s
            """, (metric_id, limit))
            rows = cursor.fetchall()
            
            result = []
            for row in rows:
                result.append({
                    'id': row['id'],
                    'metric_id': row['metric_id'],
                    'timestamp': row['timestamp'],
                    'value': row['value'],
                    'score': row['score'],
                    'severity': row['severity'],
                    'anomaly_type': row['anomaly_type'],
                    'details': json.loads(row['details']) if row['details'] else None
                })
            
            return result
        finally:
            cursor.close()
            conn.close()


class ThresholdSuggestionEngine:
    """
    Generate threshold suggestions based on statistical analysis.
    Uses robust statistics to avoid outlier influence.
    """
    
    def get_suggestions(
        self,
        metric_id: int,
        profile: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Generate threshold suggestions for a metric.
        
        Returns:
            {
                'suggested_warning': {'low': float, 'high': float},
                'suggested_critical': {'low': float, 'high': float},
                'method': str,
                'reason': str,
                'current_data_points': int
            }
        """
        if profile is None:
            profile = profile_engine.get_profile(metric_id)
        
        if profile is None:
            return {
                'suggested_warning': {'low': None, 'high': None},
                'suggested_critical': {'low': None, 'high': None},
                'method': 'none',
                'reason': 'No profile data available',
                'current_data_points': 0
            }
        
        # Normalize profile access: handle both dict and MetricProfile object
        def get_profile_attr(name, default=None):
            if isinstance(profile, dict):
                return profile.get(name, default)
            return getattr(profile, name, default)
        
        profile_count = get_profile_attr('count', 0)
        
        if profile_count < 30:
            return {
                'suggested_warning': {'low': None, 'high': None},
                'suggested_critical': {'low': None, 'high': None},
                'method': 'insufficient_data',
                'reason': f'Need at least 30 data points, have {profile_count}',
                'current_data_points': profile_count
            }
        
        median = get_profile_attr('median', 0)
        mad = get_profile_attr('mad', 0)
        
        # Calculate thresholds using robust sigma
        robust_sigma = 1.4826 * mad
        
        if robust_sigma == 0:
            # No variance - use percentile-based
            warning_low = get_profile_attr('p05')
            warning_high = get_profile_attr('p95')
            critical_low = get_profile_attr('p01')
            critical_high = get_profile_attr('p99')
            method = 'percentile'
        else:
            # MAD-based thresholds
            # Warning: median ± 3σ (~99.7%)
            warning_low = median - 3 * robust_sigma
            warning_high = median + 3 * robust_sigma
            # Critical: median ± 5σ (~99.9999%)
            critical_low = median - 5 * robust_sigma
            critical_high = median + 5 * robust_sigma
            method = 'robust_mad'
        
        return {
            'suggested_warning': {
                'low': round(warning_low, 2) if warning_low is not None else None,
                'high': round(warning_high, 2) if warning_high is not None else None
            },
            'suggested_critical': {
                'low': round(critical_low, 2) if critical_low is not None else None,
                'high': round(critical_high, 2) if critical_high is not None else None
            },
            'method': method,
            'reason': f'Based on {profile_count} data points. Median ± 3×MAD for warning, ± 5×MAD for critical.',
            'current_data_points': profile_count
        }
    
    def create_rule_from_suggestion(
        self,
        metric_id: int,
        threshold_type: str = 'warning',
        device_id: Optional[str] = None
    ) -> int:
        """
        Create a rule from threshold suggestion.
        Returns rule_id.
        """
        suggestions = self.get_suggestions(metric_id)
        
        if threshold_type == 'warning':
            threshold = suggestions['suggested_warning']
        else:
            threshold = suggestions['suggested_critical']
        
        if threshold['low'] is None or threshold['high'] is None:
            raise ValueError("Cannot create rule: invalid threshold values")
        
        # Get metric info
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT * FROM metrics WHERE id = %s
            """, (metric_id,))
            metric = cursor.fetchone()
            
            if not metric:
                raise ValueError(f"Metric {metric_id} not found")
            
            dev_id = device_id or metric['device_id']
            field_path = metric['source_path'].replace('$.', '')
            
            # Create rule (simplified - actual implementation would depend on rules table)
            cursor.execute("""
                INSERT INTO rules (
                    ten_rule, thiet_bi_id, ten_thiet_bi, dieu_kien, hanh_dong,
                    trang_thai, loai_rule, muc_do
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                f"AI Threshold {threshold_type} - {field_path}",
                dev_id,
                dev_id,
                json.dumps({
                    'metric_path': field_path,
                    'condition': 'outside_range',
                    'low': threshold['low'],
                    'high': threshold['high']
                }),
                json.dumps({'action': 'alert', 'message': f'{threshold_type} threshold exceeded'}),
                'active',
                'ai_suggested',
                threshold_type
            ))
            conn.commit()
            
            return cursor.lastrowid
        
        finally:
            cursor.close()
            conn.close()


# Global instances
anomaly_detector = AnomalyDetector()
threshold_engine = ThresholdSuggestionEngine()
