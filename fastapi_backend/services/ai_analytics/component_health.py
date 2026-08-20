# Component Health Analyzer
# Per-component health analysis and cross-component validation

from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
import json
import math

from database import get_mysql
from .statistics import compute_statistics


@dataclass
class HealthReport:
    """Health analysis report for a component."""
    component_id: int
    device_id: str
    component_type: str
    health_score: float  # 0.0 - 1.0
    health_status: str  # healthy, degraded, failed, unknown
    issues: List['HealthIssue'] = field(default_factory=list)
    findings: Dict[str, Any] = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=dict)
    analyzed_at: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> Dict:
        result = asdict(self)
        result['analyzed_at'] = self.analyzed_at.isoformat()
        return result


@dataclass
class HealthIssue:
    """A health issue detected for a component."""
    issue_type: str  # battery_low, sensor_drift, sensor_stuck, connection_issue, cross_component_anomaly
    severity: str  # info, warning, critical
    title: str
    description: str
    details: Dict[str, Any] = field(default_factory=dict)
    detected_at: datetime = field(default_factory=datetime.now)


class BatteryHealthAnalyzer:
    """
    Analyze battery health from voltage/current history.
    Detects: low battery, voltage drop, estimated runtime.
    """
    
    LOW_BATTERY_THRESHOLD = 20  # %
    CRITICAL_BATTERY_THRESHOLD = 10  # %
    VOLTAGE_DROP_THRESHOLD = 0.1  # V per hour
    VOLTAGE_RECOVERY_THRESHOLD = 0.05  # V per hour
    
    def analyze(self, device_id: str, component_id: int) -> Optional[HealthReport]:
        """Analyze battery health for a device."""
        issues = []
        findings = {}
        
        # Get battery readings
        readings = self._get_battery_readings(device_id)
        if not readings or len(readings) < 10:
            return None
        
        # Calculate statistics
        values = [r['value'] for r in readings]
        stats = compute_statistics(values)
        
        current_value = values[-1]
        first_value = values[0]
        
        # Determine battery level
        if current_value <= 100:  # Percentage
            level = current_value
            unit = '%'
        else:  # Voltage (assume 3.0-4.2V range for Li-ion)
            level = ((current_value - 3.0) / 1.2) * 100
            level = max(0, min(100, level))
            unit = 'V'
        
        findings['current_level'] = level
        findings['unit'] = unit
        findings['median'] = stats.median
        findings['variance'] = stats.mad
        
        # Check for low battery
        if level <= self.CRITICAL_BATTERY_THRESHOLD:
            issues.append(HealthIssue(
                issue_type='battery_critical',
                severity='critical',
                title='Critical Battery Level',
                description=f'Battery at {level:.1f}% - immediate attention required',
                details={'level': level, 'threshold': self.CRITICAL_BATTERY_THRESHOLD}
            ))
        elif level <= self.LOW_BATTERY_THRESHOLD:
            issues.append(HealthIssue(
                issue_type='battery_low',
                severity='warning',
                title='Low Battery',
                description=f'Battery at {level:.1f}% - consider replacing soon',
                details={'level': level, 'threshold': self.LOW_BATTERY_THRESHOLD}
            ))
        
        # Check for voltage recovery (possible charging)
        if len(readings) >= 20:
            first_half = values[:len(values)//2]
            second_half = values[len(values)//2:]
            avg_first = sum(first_half) / len(first_half)
            avg_second = sum(second_half) / len(second_half)
            
            if avg_second > avg_first + 0.2:
                issues.append(HealthIssue(
                    issue_type='battery_charging',
                    severity='info',
                    title='Battery Charging Detected',
                    description=f'Voltage increased from {avg_first:.2f}V to {avg_second:.2f}V',
                    details={'start_voltage': avg_first, 'end_voltage': avg_second}
                ))
        
        # Calculate health score
        health_score = min(1.0, level / 50)  # 50% = score 1.0
        health_status = 'healthy' if level > self.LOW_BATTERY_THRESHOLD else 'degraded' if level > self.CRITICAL_BATTERY_THRESHOLD else 'failed'
        
        return HealthReport(
            component_id=component_id,
            device_id=device_id,
            component_type='battery',
            health_score=health_score,
            health_status=health_status,
            issues=issues,
            findings=findings
        )
    
    def _get_battery_readings(self, device_id: str) -> List[Dict]:
        """Get battery readings from database."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT m.id as metric_id, dc.id as component_id, dc.component_type
                FROM metrics m
                JOIN device_components dc ON dc.device_id = m.device_id 
                    AND dc.component_type = 'battery'
                WHERE m.device_id = %s AND m.semantic_type = 'BATTERY'
                LIMIT 1
            """, (device_id,))
            result = cursor.fetchone()
            
            if not result:
                return []
            
            # Get readings from MongoDB
            from database import get_mongo
            mongo = get_mongo()
            
            # Try common battery field names
            for field_name in ['battery', 'battery_level', 'soc', 'battery_percent', 'vbat']:
                events = list(mongo.events.find(
                    {'device_id': device_id},
                    {field_name: 1, 'timestamp': 1}
                ).sort('timestamp', -1).limit(100))
                
                if events:
                    return [{'value': e.get(field_name, 0), 'timestamp': e.get('timestamp')} 
                            for e in reversed(events) if field_name in e]
            
            return []
        finally:
            cursor.close()
            conn.close()


class SensorDriftAnalyzer:
    """
    Detect gradual sensor drift over time.
    Compares recent readings to historical baseline.
    """
    
    DRIFT_THRESHOLD = 2.0  # Standard deviations from baseline
    
    def analyze(self, component_id: int, device_id: str, component_type: str) -> Optional[HealthReport]:
        """Analyze sensor for drift."""
        # Get profile data
        profile = self._get_profile(component_id)
        if not profile or profile['count'] < 100:
            return None
        
        # Get recent readings
        readings = self._get_recent_readings(device_id, component_type)
        if not readings or len(readings) < 20:
            return None
        
        recent_values = [r['value'] for r in readings]
        recent_median = compute_statistics(recent_values).median
        
        # Compare to profile median
        baseline_median = profile['median']
        profile_mad = profile['mad'] or 0.01
        
        # Calculate drift score
        drift = abs(recent_median - baseline_median)
        drift_score = drift / (1.4826 * profile_mad) if profile_mad > 0 else 0
        
        issues = []
        findings = {
            'baseline_median': baseline_median,
            'recent_median': recent_median,
            'drift': drift,
            'drift_score': drift_score
        }
        
        if drift_score > self.DRIFT_THRESHOLD:
            direction = 'increased' if recent_median > baseline_median else 'decreased'
            issues.append(HealthIssue(
                issue_type='sensor_drift',
                severity='warning',
                title=f'Sensor {direction} over time',
                description=f'Readings have drifted {drift:.2f} units from baseline',
                details={
                    'baseline': baseline_median,
                    'recent': recent_median,
                    'drift_score': drift_score
                }
            ))
        
        health_score = max(0, 1.0 - (drift_score / 5))
        health_status = 'healthy' if drift_score < 1 else 'degraded' if drift_score < 2 else 'failed'
        
        return HealthReport(
            component_id=component_id,
            device_id=device_id,
            component_type=component_type,
            health_score=health_score,
            health_status=health_status,
            issues=issues,
            findings=findings
        )
    
    def _get_profile(self, component_id: int) -> Optional[Dict]:
        """Get metric profile from database."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT mp.*, m.source_path, m.semantic_type
                FROM metric_profiles mp
                JOIN metrics m ON mp.metric_id = m.id
                WHERE m.id = %s
            """, (component_id,))
            return cursor.fetchone()
        finally:
            cursor.close()
            conn.close()
    
    def _get_recent_readings(self, device_id: str, component_type: str) -> List[Dict]:
        """Get recent readings from MongoDB."""
        from database import get_mongo
        mongo = get_mongo()
        
        # Map component type to field names
        field_mapping = {
            'temperature': 'temperature',
            'humidity': 'humidity',
            'pressure': 'pressure',
            'light': 'light',
            'co2': 'co2',
        }
        
        field_name = field_mapping.get(component_type, component_type)
        
        events = list(mongo.events.find(
            {'device_id': device_id},
            {field_name: 1, 'timestamp': 1}
        ).sort('timestamp', -1).limit(50))
        
        return [{'value': e.get(field_name), 'timestamp': e.get('timestamp')} 
                for e in reversed(events) if field_name in e]


class CrossComponentValidator:
    """
    Validate component readings against correlated components.
    E.g., temperature up should mean humidity down.
    """
    
    CORRELATION_THRESHOLD = 0.5
    
    def validate(self, device_id: str) -> List[HealthReport]:
        """Validate all component correlations for a device."""
        reports = []
        
        # Get validation rules
        rules = self._get_validation_rules()
        
        # Get device components
        components = self._get_device_components(device_id)
        component_types = {c['component_type'] for c in components}
        
        for rule in rules:
            if rule['component_a_type'] not in component_types or rule['component_b_type'] not in component_types:
                continue
            
            # Get readings for both components
            readings_a = self._get_component_readings(device_id, rule['component_a_type'])
            readings_b = self._get_component_readings(device_id, rule['component_b_type'])
            
            if not readings_a or not readings_b:
                continue
            
            # Calculate correlation
            correlation = self._calculate_correlation(
                [r['value'] for r in readings_a],
                [r['value'] for r in readings_b]
            )
            
            if abs(correlation) < self.CORRELATION_THRESHOLD:
                continue
            
            # Check if correlation matches expectation
            expected_positive = rule['expected_correlation'] == 'positive'
            actual_positive = correlation > 0
            matches = expected_positive == actual_positive
            
            if not matches:
                component_a = next(c for c in components if c['component_type'] == rule['component_a_type'])
                issues = [HealthIssue(
                    issue_type='cross_component_anomaly',
                    severity='warning',
                    title='Component Correlation Anomaly',
                    description=f'{rule["component_a_type"]} and {rule["component_b_type"]} show unexpected correlation pattern',
                    details={
                        'correlation': correlation,
                        'expected': rule['expected_correlation'],
                        'actual': 'positive' if actual_positive else 'negative',
                        'rule_description': rule['description']
                    }
                )]
                
                reports.append(HealthReport(
                    component_id=component_a['id'],
                    device_id=device_id,
                    component_type=rule['component_a_type'],
                    health_score=max(0, 1.0 - abs(correlation)),
                    health_status='degraded',
                    issues=issues,
                    findings={'correlation': correlation, 'rule_id': rule['id']}
                ))
        
        return reports
    
    def _get_validation_rules(self) -> List[Dict]:
        """Get cross-component validation rules."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT * FROM component_validation_rules WHERE enabled = TRUE
            """)
            return cursor.fetchall()
        finally:
            cursor.close()
            conn.close()
    
    def _get_device_components(self, device_id: str) -> List[Dict]:
        """Get device components."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT id, component_type, component_id, field_name 
                FROM device_components WHERE device_id = %s
            """, (device_id,))
            return cursor.fetchall()
        finally:
            cursor.close()
            conn.close()
    
    def _get_component_readings(self, device_id: str, component_type: str) -> List[Dict]:
        """Get recent readings for a component."""
        from database import get_mongo
        mongo = get_mongo()
        
        field_mapping = {
            'temperature': 'temperature',
            'humidity': 'humidity',
            'pressure': 'pressure',
            'battery': 'battery',
            'rssi': 'rssi',
            'light': 'light',
            'soil_moisture': 'soil_moisture',
        }
        
        field_name = field_mapping.get(component_type, component_type)
        
        events = list(mongo.events.find(
            {'device_id': device_id},
            {field_name: 1, 'timestamp': 1}
        ).sort('timestamp', -1).limit(100))
        
        return [{'value': e.get(field_name), 'timestamp': e.get('timestamp')} 
                for e in reversed(events) if field_name in e and e.get(field_name) is not None]
    
    def _calculate_correlation(self, values_a: List[float], values_b: List[float]) -> float:
        """Calculate Pearson correlation coefficient."""
        n = min(len(values_a), len(values_b))
        if n < 5:
            return 0
        
        values_a = values_a[:n]
        values_b = values_b[:n]
        
        mean_a = sum(values_a) / n
        mean_b = sum(values_b) / n
        
        numerator = sum((a - mean_a) * (b - mean_b) for a, b in zip(values_a, values_b))
        
        sum_sq_a = sum((a - mean_a) ** 2 for a in values_a)
        sum_sq_b = sum((b - mean_b) ** 2 for b in values_b)
        
        denominator = math.sqrt(sum_sq_a * sum_sq_b)
        
        if denominator == 0:
            return 0
        
        return numerator / denominator


class ComponentHealthAnalyzer:
    """
    Main component health analysis engine.
    Coordinates all health analyzers.
    """
    
    def __init__(self):
        self.battery_analyzer = BatteryHealthAnalyzer()
        self.drift_analyzer = SensorDriftAnalyzer()
        self.cross_validator = CrossComponentValidator()
    
    def analyze_device(self, device_id: str) -> Dict[str, HealthReport]:
        """
        Run all health analyses for a device.
        Returns dict of component_id -> HealthReport.
        """
        reports = {}
        
        # Get device components
        components = self._get_device_components(device_id)
        
        for component in components:
            component_id = component['id']
            component_type = component['component_type']
            
            # Run battery analysis
            if component_type == 'battery':
                report = self.battery_analyzer.analyze(device_id, component_id)
                if report:
                    reports[component_id] = report
            
            # Run drift analysis for sensors
            elif component_type in ('temperature', 'humidity', 'pressure', 'light', 'co2'):
                report = self.drift_analyzer.analyze(component_id, device_id, component_type)
                if report:
                    reports[component_id] = report
        
        # Run cross-component validation
        cross_reports = self.cross_validator.validate(device_id)
        for report in cross_reports:
            if report.component_id in reports:
                # Merge with existing report
                existing = reports[report.component_id]
                existing.issues.extend(report.issues)
                existing.health_score = min(existing.health_score, report.health_score)
                if report.health_status == 'failed':
                    existing.health_status = 'failed'
                elif report.health_status == 'degraded' and existing.health_status == 'healthy':
                    existing.health_status = 'degraded'
            else:
                reports[report.component_id] = report
        
        # Save reports to database
        self._save_reports(reports)
        
        return reports
    
    def analyze_component(self, component_id: int, device_id: str, component_type: str) -> HealthReport:
        """Analyze a single component."""
        # Run appropriate analyzer
        if component_type == 'battery':
            report = self.battery_analyzer.analyze(device_id, component_id)
        else:
            report = self.drift_analyzer.analyze(component_id, device_id, component_type)
        
        if report:
            self._save_reports({component_id: report})
        
        return report
    
    def _get_device_components(self, device_id: str) -> List[Dict]:
        """Get device components from database."""
        conn = get_mysql()
        cursor = conn.cursor(dictionary=True)
        try:
            cursor.execute("""
                SELECT id, component_id, component_type, field_name, hardware_model
                FROM device_components WHERE device_id = %s
            """, (device_id,))
            return cursor.fetchall()
        finally:
            cursor.close()
            conn.close()
    
    def _save_reports(self, reports: Dict[int, HealthReport]) -> None:
        """Save health reports to database."""
        conn = get_mysql()
        cursor = conn.cursor()
        try:
            for component_id, report in reports.items():
                # Get device_id from component
                cursor.execute("""
                    SELECT device_id FROM device_components WHERE id = %s
                """, (component_id,))
                result = cursor.fetchone()
                if not result:
                    continue
                
                # Update component health status
                cursor.execute("""
                    UPDATE device_components 
                    SET health_status = %s, health_score = %s, 
                        health_history = JSON_MERGE_PATCH(COALESCE(health_history, '{}'), %s)
                    WHERE id = %s
                """, (
                    report.health_status,
                    report.health_score,
                    json.dumps([{
                        'timestamp': datetime.now().isoformat(),
                        'status': report.health_status,
                        'score': report.health_score,
                        'issues': len(report.issues)
                    }]),
                    component_id
                ))
                
                # Save detailed analysis
                for issue in report.issues:
                    cursor.execute("""
                        INSERT INTO component_health_analysis 
                        (component_id, device_id, analysis_type, health_score, findings, is_resolved)
                        VALUES (%s, %s, %s, %s, %s, FALSE)
                    """, (
                        component_id,
                        report.device_id,
                        issue.issue_type,
                        report.health_score,
                        json.dumps({'title': issue.title, 'description': issue.description, 'details': issue.details})
                    ))
            
            conn.commit()
        except Exception as e:
            print(f"[COMPONENT-HEALTH] Error saving reports: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()


# Global instance
component_health_analyzer = ComponentHealthAnalyzer()
