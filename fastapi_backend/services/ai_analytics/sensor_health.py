# Sensor Health Detection
# Detects sensor issues: flatline, missing data, counter reset, schema change

from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
import json

from database import get_mysql
from .statistics import compute_statistics


@dataclass
class HealthIssue:
    """Detected health issue."""
    type: str  # 'flatline', 'missing_data', 'counter_reset', 'schema_drift', 'stale_profile'
    metric_id: Optional[int]
    source_path: Optional[str]
    severity: str  # 'low', 'medium', 'high', 'critical'
    message: str
    details: Dict[str, Any]
    detected_at: datetime


class SensorHealthDetector:
    """
    Detects sensor health issues.
    Issues detected:
    - Flatline: Variance near zero (stuck sensor)
    - Missing data: High ratio of missing points
    - Counter reset: Counter value decreases
    - Schema drift: Payload schema changed
    """
    
    # Thresholds
    FLATLINE_VARIANCE_THRESHOLD = 0.001
    MISSING_DATA_THRESHOLD = 0.1  # 10% missing
    COUNTER_DECREASE_THRESHOLD = -0.001  # Any decrease is suspicious
    STALE_PROFILE_HOURS = 24
    
    def __init__(self):
        self.issues: List[HealthIssue] = []
    
    def detect_all(
        self,
        device_id: str,
        metric_ids: Optional[List[int]] = None
    ) -> List[HealthIssue]:
        """
        Run all health checks for a device.
        """
        self.issues = []
        try:
            if metric_ids is None:
                metric_ids = self._get_device_metrics(device_id)

            for metric_id in metric_ids:
                self._check_flatline(metric_id)
                self._check_missing_data(metric_id)
                self._check_counter_reset(metric_id)

            self._check_schema_drift(device_id)
            self._check_stale_profiles(device_id, metric_ids)
        except Exception as e:
            print(f"[SENSOR-HEALTH] Error detecting health for {device_id}: {e}")
        return self.issues
    
    def _get_device_metrics(self, device_id: str) -> List[int]:
        """Get all metric IDs for a device."""
        conn = get_mysql()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                SELECT id FROM metrics WHERE device_id = %s
            """, (device_id,))
            return [row[0] for row in cursor.fetchall()]
        finally:
            cursor.close()
            conn.close()
    
    def _check_flatline(self, metric_id: int) -> None:
        """
        Detect flatline (stuck sensor).
        Issue: Variance is near zero over many samples.
        """
        # Get profile
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT mp.*, m.source_path 
                FROM metric_profiles mp
                JOIN metrics m ON mp.metric_id = m.id
                WHERE mp.metric_id = %s
            """, (metric_id,))
            profile = cursor.fetchone()
            
            if not profile:
                return
            
            # Check MAD (robust variance measure)
            mad = profile['mad']
            
            # If MAD is very small and we have enough data, it's likely flatline
            if profile['count'] > 100 and mad < self.FLATLINE_VARIANCE_THRESHOLD:
                self.issues.append(HealthIssue(
                    type='flatline',
                    metric_id=metric_id,
                    source_path=profile['source_path'],
                    severity='high',
                    message=f"Possible flatline/stuck sensor: MAD={mad:.6f} over {profile['count']} samples",
                    details={
                        'mad': mad,
                        'count': profile['count'],
                        'median': profile['median'],
                        'range': profile['max_val'] - profile['min_val'] if profile['max_val'] and profile['min_val'] else 0
                    },
                    detected_at=datetime.now()
                ))
        
        finally:
            cursor.close()
            conn.close()
    
    def _check_missing_data(self, metric_id: int) -> None:
        """
        Detect high ratio of missing data.
        """
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT mp.*, m.source_path 
                FROM metric_profiles mp
                JOIN metrics m ON mp.metric_id = m.id
                WHERE mp.metric_id = %s
            """, (metric_id,))
            profile = cursor.fetchone()
            
            if not profile:
                return
            
            missing_ratio = profile['missing_ratio'] or 0
            
            if missing_ratio > self.MISSING_DATA_THRESHOLD:
                severity = 'high' if missing_ratio > 0.3 else 'medium'
                self.issues.append(HealthIssue(
                    type='missing_data',
                    metric_id=metric_id,
                    source_path=profile['source_path'],
                    severity=severity,
                    message=f"High missing data ratio: {missing_ratio*100:.1f}%",
                    details={
                        'missing_ratio': missing_ratio,
                        'count': profile['count'],
                        'sampling_interval': profile['sampling_interval']
                    },
                    detected_at=datetime.now()
                ))
        
        finally:
            cursor.close()
            conn.close()
    
    def _check_counter_reset(self, metric_id: int) -> None:
        """
        Detect counter reset (value decreases when it should only increase).
        """
        # Get recent values from MongoDB
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT * FROM metrics WHERE id = %s
            """, (metric_id,))
            metric = cursor.fetchone()
            
            if not metric:
                return
            
            # Get values from MongoDB
            from database import get_mongo
            mongo = get_mongo()
            
            field_name = metric['source_path'].replace('$.', '')
            
            events = list(mongo.events.find(
                {'device_id': metric['device_id']},
                {field_name: 1, 'timestamp': 1}
            ).sort('timestamp', -1).limit(100))
            
            if len(events) < 10:
                return
            
            # Check for decreases
            values = []
            for e in reversed(events):
                try:
                    val = float(e.get(field_name, 0))
                    values.append(val)
                except:
                    pass
            
            decreases = 0
            max_decrease = 0
            prev_val = values[0]
            
            for val in values[1:]:
                if val < prev_val:
                    decrease = prev_val - val
                    decreases += 1
                    max_decrease = max(max_decrease, decrease)
                prev_val = val
            
            # If counter decreases frequently, likely a reset
            decrease_ratio = decreases / (len(values) - 1) if len(values) > 1 else 0
            
            if decrease_ratio > 0.1:  # More than 10% decreases
                self.issues.append(HealthIssue(
                    type='counter_reset',
                    metric_id=metric_id,
                    source_path=metric['source_path'],
                    severity='medium',
                    message=f"Counter may have reset: {decrease_ratio*100:.1f}% decreases, max decrease: {max_decrease:.0f}",
                    details={
                        'decrease_count': decreases,
                        'total_count': len(values) - 1,
                        'max_decrease': max_decrease,
                        'decrease_ratio': decrease_ratio
                    },
                    detected_at=datetime.now()
                ))
        
        finally:
            cursor.close()
            conn.close()
    
    def _check_schema_drift(self, device_id: str) -> None:
        """
        Check for schema drift.
        """
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            # Get latest schema drift
            cursor.execute("""
                SELECT * FROM schema_drift_log
                WHERE device_id = %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (device_id,))
            drift = cursor.fetchone()
            
            if drift:
                fields_added = json.loads(drift['fields_added']) if drift['fields_added'] else []
                fields_removed = json.loads(drift['fields_removed']) if drift['fields_removed'] else []
                
                self.issues.append(HealthIssue(
                    type='schema_drift',
                    metric_id=None,
                    source_path=None,
                    severity='medium' if len(fields_added) + len(fields_removed) < 3 else 'high',
                    message=f"Schema changed: {len(fields_added)} fields added, {len(fields_removed)} removed",
                    details={
                        'old_version': drift['old_version'],
                        'new_version': drift['new_version'],
                        'fields_added': fields_added,
                        'fields_removed': fields_removed,
                        'confidence': drift['drift_confidence']
                    },
                    detected_at=drift['created_at']
                ))
        
        finally:
            cursor.close()
            conn.close()
    
    def _check_stale_profiles(self, device_id: str, metric_ids: List[int]) -> None:
        """
        Check for stale profiles (not updated recently).
        """
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            for metric_id in metric_ids:
                cursor.execute("""
                    SELECT mp.*, m.source_path 
                    FROM metric_profiles mp
                    JOIN metrics m ON mp.metric_id = m.id
                    WHERE mp.metric_id = %s
                """, (metric_id,))
                profile = cursor.fetchone()
                
                if not profile:
                    continue
                
                if profile['updated_at']:
                    age = datetime.now() - profile['updated_at']
                    age_hours = age.total_seconds() / 3600
                    
                    if age_hours > self.STALE_PROFILE_HOURS:
                        self.issues.append(HealthIssue(
                            type='stale_profile',
                            metric_id=metric_id,
                            source_path=profile['source_path'],
                            severity='low',
                            message=f"Profile not updated in {age_hours:.1f} hours",
                            details={
                                'age_hours': age_hours,
                                'last_update': profile['updated_at'].isoformat(),
                                'count': profile['count']
                            },
                            detected_at=datetime.now()
                        ))
        
        finally:
            cursor.close()
            conn.close()
    
    def save_health_issues(self, device_id: str) -> None:
        """
        Save detected issues to database (optional, for history).
        """
        # For now, just return - issues are returned directly
        pass


class DriftDetector:
    """
    ADWIN-based drift detection for concept drift.
    This is a simplified implementation.
    """
    
    def __init__(self, window_size: int = 100):
        self.window_size = window_size
        self.window: List[float] = []
    
    def add_value(self, value: float) -> bool:
        """
        Add a value and check for drift.
        Returns True if drift detected.
        """
        self.window.append(value)
        
        # Keep window size
        if len(self.window) > self.window_size * 2:
            self.window = self.window[-self.window_size:]
        
        if len(self.window) < self.window_size:
            return False
        
        # Check for drift between first half and second half
        first_half = self.window[:self.window_size // 2]
        second_half = self.window[self.window_size // 2:]
        
        stats1 = compute_statistics(first_half)
        stats2 = compute_statistics(second_half)
        
        # Simple drift detection: significant median shift
        median_diff = abs(stats1.median - stats2.median)
        pooled_mad = (stats1.mad + stats2.mad) / 2
        
        if pooled_mad > 0:
            drift_score = median_diff / (1.4826 * pooled_mad)
            
            # Drift if score > 2 (significant shift)
            return drift_score > 2.0
        
        return False
    
    def reset(self) -> None:
        """Reset the detector."""
        self.window = []


# Global instances
sensor_health_detector = SensorHealthDetector()
drift_detector = DriftDetector()
