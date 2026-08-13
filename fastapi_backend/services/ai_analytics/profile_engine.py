# Profile Engine
# Learning and updating statistical profiles for metrics

import json
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict

from database import get_mysql, get_mongo
from .statistics import compute_statistics, RobustStatistics


# Metric lifecycle states
class MetricStatus:
    DISCOVERED = 'DISCOVERED'      # Just found
    LEARNING = 'LEARNING'          # Collecting initial data
    ACTIVE = 'ACTIVE'             # Profile stable
    DRIFTED = 'DRIFTED'           # Schema or distribution changed
    DEGRADED = 'DEGRADED'        # Sensor issue suspected


@dataclass
class MetricProfile:
    """Statistical profile for a metric."""
    metric_id: int
    count: int
    min_val: Optional[float]
    max_val: Optional[float]
    median: float
    mad: float
    mean_val: float
    std_val: float
    p01: float
    p05: float
    p50: float
    p95: float
    p99: float
    sampling_interval: float
    missing_ratio: float
    trend: str  # 'up', 'down', 'stable'
    seasonality: Optional[Dict[int, float]]  # {hour: avg}
    updated_at: datetime
    profile_version: int = 1


class ProfileEngine:
    """
    Engine for learning and maintaining metric profiles.
    Handles lifecycle management and profile updates.
    """
    
    # Thresholds for lifecycle transitions
    LEARNING_MIN_SAMPLES = 30       # Minimum samples to start learning
    ACTIVE_MIN_SAMPLES = 100       # Minimum samples to become active
    DRIFT_THRESHOLD = 0.3          # MAD change ratio to trigger drift
    RECOVERY_SAMPLES = 50          # Samples to confirm recovery
    
    def __init__(self):
        self._db = None
    
    @property
    def db(self):
        if self._db is None:
            self._db = get_mysql()
        return self._db
    
    def get_or_create_metric(
        self,
        device_id: str,
        source_path: str,
        data_type: str = 'FLOAT'
    ) -> int:
        """
        Get existing metric ID or create new one.
        Returns metric_id.
        """
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            # Try to find existing
            cursor.execute("""
                SELECT id FROM metrics 
                WHERE device_id = %s AND source_path = %s
            """, (device_id, source_path))
            row = cursor.fetchone()
            
            if row:
                return row['id']
            
            # Create new metric
            cursor.execute("""
                INSERT INTO metrics (device_id, source_path, data_type, status)
                VALUES (%s, %s, %s, %s)
            """, (device_id, source_path, data_type, MetricStatus.DISCOVERED))
            conn.commit()
            
            return cursor.lastrowid
        finally:
            cursor.close()
            conn.close()
    
    def update_metric_status(self, metric_id: int, status: str) -> None:
        """Update metric lifecycle status."""
        conn = get_mysql()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                UPDATE metrics SET status = %s, updated_at = NOW()
                WHERE id = %s
            """, (status, metric_id))
            conn.commit()
        finally:
            cursor.close()
            conn.close()
    
    def get_profile(self, metric_id: int) -> Optional[MetricProfile]:
        """Get current profile for a metric."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT * FROM metric_profiles WHERE metric_id = %s
            """, (metric_id,))
            row = cursor.fetchone()
            
            if not row:
                return None
            
            return MetricProfile(
                metric_id=row['metric_id'],
                count=row['count'],
                min_val=row['min_val'],
                max_val=row['max_val'],
                median=row['median'],
                mad=row['mad'],
                mean_val=row['mean_val'],
                std_val=row['std_val'],
                p01=row['p01'],
                p05=row['p05'],
                p50=row['p50'],
                p95=row['p95'],
                p99=row['p99'],
                sampling_interval=row['sampling_interval'],
                missing_ratio=row['missing_ratio'],
                trend=row['trend'],
                seasonality=json.loads(row['seasonality']) if row['seasonality'] else None,
                updated_at=row['updated_at'],
                profile_version=row['profile_version']
            )
        finally:
            cursor.close()
            conn.close()
    
    def compute_and_save_profile(
        self,
        metric_id: int,
        values: List[float],
        timestamps: List[datetime]
    ) -> MetricProfile:
        """
        Compute statistics from values and save/update profile.
        """
        if len(values) < self.LEARNING_MIN_SAMPLES:
            # Not enough data, create placeholder
            profile = MetricProfile(
                metric_id=metric_id,
                count=len(values),
                min_val=min(values) if values else None,
                max_val=max(values) if values else None,
                median=0, mad=0, mean_val=0, std_val=0,
                p01=0, p05=0, p50=0, p95=0, p99=0,
                sampling_interval=0, missing_ratio=0,
                trend='insufficient_data',
                seasonality=None,
                updated_at=datetime.now(),
                profile_version=1
            )
        else:
            # Compute robust statistics
            stats = compute_statistics(values)
            
            # Detect trend
            trend = self._detect_trend(values)
            
            # Compute sampling interval
            sampling_interval = self._compute_sampling_interval(timestamps)
            
            # Compute missing ratio
            missing_ratio = self._compute_missing_ratio(timestamps)
            
            # Extract seasonality (hourly patterns)
            seasonality = self._extract_seasonality(values, timestamps)
            
            profile = MetricProfile(
                metric_id=metric_id,
                count=stats.count,
                min_val=stats.min_val,
                max_val=stats.max_val,
                median=stats.median,
                mad=stats.mad,
                mean_val=stats.mean,
                std_val=stats.std,
                p01=stats.p01,
                p05=stats.p05,
                p50=stats.p50,
                p95=stats.p95,
                p99=stats.p99,
                sampling_interval=sampling_interval,
                missing_ratio=missing_ratio,
                trend=trend,
                seasonality=seasonality,
                updated_at=datetime.now(),
                profile_version=1
            )
            
            # Update lifecycle status
            self._update_lifecycle(metric_id, len(values), stats)
        
        # Save to database
        self._save_profile(profile)
        
        return profile
    
    def _detect_trend(self, values: List[float], window: int = 20) -> str:
        """Detect trend direction using linear regression."""
        if len(values) < window:
            return 'insufficient_data'
        
        recent = values[-window:]
        
        # Simple linear regression
        n = len(recent)
        x = list(range(n))
        x_mean = sum(x) / n
        y_mean = sum(recent) / n
        
        numerator = sum((x[i] - x_mean) * (recent[i] - y_mean) for i in range(n))
        denominator = sum((x[i] - x_mean) ** 2 for i in range(n))
        
        if denominator == 0:
            return 'stable'
        
        slope = numerator / denominator
        
        # Normalize by mean to get relative trend
        if abs(y_mean) > 1e-10:
            normalized_slope = slope / abs(y_mean)
        else:
            normalized_slope = slope
        
        # Classify
        if abs(normalized_slope) < 0.01:
            return 'stable'
        elif normalized_slope > 0:
            return 'up'
        else:
            return 'down'
    
    def _compute_sampling_interval(self, timestamps: List[datetime]) -> float:
        """Compute average sampling interval in seconds."""
        if len(timestamps) < 2:
            return 0.0
        
        # Sort timestamps
        sorted_ts = sorted(timestamps)
        
        # Calculate intervals
        intervals = []
        for i in range(1, len(sorted_ts)):
            delta = (sorted_ts[i] - sorted_ts[i-1]).total_seconds()
            if 0 < delta < 3600:  # Ignore gaps > 1 hour
                intervals.append(delta)
        
        if not intervals:
            return 0.0
        
        return sum(intervals) / len(intervals)
    
    def _compute_missing_ratio(self, timestamps: List[datetime]) -> float:
        """Compute ratio of missing data points."""
        if len(timestamps) < 2:
            return 0.0
        
        # Sort timestamps
        sorted_ts = sorted(timestamps)
        
        # Calculate expected vs actual points
        total_time = (sorted_ts[-1] - sorted_ts[0]).total_seconds()
        avg_interval = self._compute_sampling_interval(timestamps)
        
        if avg_interval <= 0:
            return 0.0
        
        expected_points = int(total_time / avg_interval) + 1
        actual_points = len(timestamps)
        
        if expected_points <= actual_points:
            return 0.0
        
        return (expected_points - actual_points) / expected_points
    
    def _extract_seasonality(
        self,
        values: List[float],
        timestamps: List[datetime],
        max_hour: int = 24
    ) -> Optional[Dict[int, float]]:
        """
        Extract hourly seasonality patterns.
        Returns dict {hour: average_value}
        """
        if len(values) < 100:  # Need enough data
            return None
        
        hour_values: Dict[int, List[float]] = {h: [] for h in range(max_hour)}
        
        for value, ts in zip(values, timestamps):
            hour = ts.hour
            hour_values[hour].append(value)
        
        # Calculate averages
        result = {}
        for hour, vals in hour_values.items():
            if len(vals) >= 5:  # Need enough samples
                result[hour] = sum(vals) / len(vals)
        
        return result if result else None
    
    def _update_lifecycle(
        self,
        metric_id: int,
        sample_count: int,
        stats: RobustStatistics
    ) -> None:
        """Update lifecycle status based on sample count and statistics."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            # Get current status
            cursor.execute("""
                SELECT status FROM metrics WHERE id = %s
            """, (metric_id,))
            row = cursor.fetchone()
            current_status = row['status'] if row else MetricStatus.DISCOVERED
            
            # Determine new status
            new_status = current_status
            
            if sample_count < self.LEARNING_MIN_SAMPLES:
                new_status = MetricStatus.DISCOVERED
            elif sample_count < self.ACTIVE_MIN_SAMPLES:
                new_status = MetricStatus.LEARNING
            else:
                new_status = MetricStatus.ACTIVE
            
            # Update if changed
            if new_status != current_status:
                self.update_metric_status(metric_id, new_status)
        
        finally:
            cursor.close()
            conn.close()
    
    def _save_profile(self, profile: MetricProfile) -> None:
        """Save or update profile in database."""
        conn = get_mysql()
        cursor = conn.cursor()
        try:
            # Check if profile exists
            cursor.execute("""
                SELECT id FROM metric_profiles WHERE metric_id = %s
            """, (profile.metric_id,))
            exists = cursor.fetchone()
            
            seasonality_json = json.dumps(profile.seasonality) if profile.seasonality else None
            
            if exists:
                # Update existing
                cursor.execute("""
                    UPDATE metric_profiles SET
                        count = %s,
                        min_val = %s,
                        max_val = %s,
                        median = %s,
                        mad = %s,
                        mean_val = %s,
                        std_val = %s,
                        p01 = %s,
                        p05 = %s,
                        p50 = %s,
                        p95 = %s,
                        p99 = %s,
                        sampling_interval = %s,
                        missing_ratio = %s,
                        trend = %s,
                        seasonality = %s,
                        updated_at = NOW(),
                        profile_version = profile_version + 1
                    WHERE metric_id = %s
                """, (
                    profile.count, profile.min_val, profile.max_val,
                    profile.median, profile.mad, profile.mean_val, profile.std_val,
                    profile.p01, profile.p05, profile.p50, profile.p95, profile.p99,
                    profile.sampling_interval, profile.missing_ratio,
                    profile.trend, seasonality_json,
                    profile.metric_id
                ))
            else:
                # Insert new
                cursor.execute("""
                    INSERT INTO metric_profiles (
                        metric_id, count, min_val, max_val, median, mad,
                        mean_val, std_val, p01, p05, p50, p95, p99,
                        sampling_interval, missing_ratio, trend, seasonality,
                        updated_at, profile_version
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), 1
                    )
                """, (
                    profile.metric_id, profile.count, profile.min_val, profile.max_val,
                    profile.median, profile.mad, profile.mean_val, profile.std_val,
                    profile.p01, profile.p05, profile.p50, profile.p95, profile.p99,
                    profile.sampling_interval, profile.missing_ratio,
                    profile.trend, seasonality_json
                ))
            
            conn.commit()
        finally:
            cursor.close()
            conn.close()
    
    def get_metric_values_from_mongo(
        self,
        device_id: str,
        source_path: str,
        limit: int = 1000
    ) -> tuple[List[float], List[datetime]]:
        """
        Extract numeric values from MongoDB events for a metric.
        Returns (values, timestamps).
        """
        mongo = get_mongo()
        
        # Extract field name from path (remove $. prefix)
        field_name = source_path.replace('$.', '').replace('$', '')
        
        # Query recent events
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
                    
                    # Parse timestamp
                    if isinstance(ts, datetime):
                        timestamps.append(ts)
                    elif isinstance(ts, (int, float)):
                        timestamps.append(datetime.fromtimestamp(ts))
                except (ValueError, TypeError):
                    pass
        
        # Reverse to get chronological order
        values.reverse()
        timestamps.reverse()
        
        return values, timestamps


# Global instance
profile_engine = ProfileEngine()
