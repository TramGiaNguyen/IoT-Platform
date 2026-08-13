# Robust Statistics Module
# MAD-based statistics for anomaly detection (robust against outliers)

import math
from typing import List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class RobustStatistics:
    """Statistical summary using robust measures."""
    count: int
    min_val: float
    max_val: float
    median: float
    mad: float  # Median Absolute Deviation
    mean: float
    std: float  # Standard deviation (non-robust, for reference)
    p01: float
    p05: float
    p25: float
    p50: float  # Same as median
    p75: float
    p95: float
    p99: float
    iqr: float  # Interquartile Range


def compute_percentile(sorted_data: List[float], p: float) -> float:
    """
    Compute percentile from sorted data.
    p is in range [0, 100].
    Uses linear interpolation.
    """
    if not sorted_data:
        return 0.0
    
    n = len(sorted_data)
    if n == 1:
        return sorted_data[0]
    
    # Calculate the index
    idx = (p / 100.0) * (n - 1)
    lower = int(math.floor(idx))
    upper = int(math.ceil(idx))
    
    if lower == upper:
        return sorted_data[lower]
    
    # Linear interpolation
    weight = idx - lower
    return sorted_data[lower] * (1 - weight) + sorted_data[upper] * weight


def compute_median(sorted_data: List[float]) -> float:
    """Compute median from sorted data."""
    return compute_percentile(sorted_data, 50)


def compute_mad(sorted_data: List[float], median: float) -> float:
    """
    Compute Median Absolute Deviation (MAD).
    MAD = median(|Xi - median|)
    
    NIST recommends scaling factor: σ ≈ 1.4826 × MAD for normal distribution
    """
    if not sorted_data:
        return 0.0
    
    abs_deviations = [abs(x - median) for x in sorted_data]
    return compute_median(abs_deviations)


def compute_robust_sigma(mad: float) -> float:
    """
    Convert MAD to standard deviation estimate.
    σ ≈ 1.4826 × MAD (for normal distribution)
    """
    return 1.4826 * mad


def compute_statistics(values: List[float]) -> RobustStatistics:
    """
    Compute comprehensive robust statistics from a list of values.
    """
    if not values:
        return RobustStatistics(
            count=0, min_val=0, max_val=0, median=0, mad=0,
            mean=0, std=0, p01=0, p05=0, p25=0, p50=0,
            p75=0, p95=0, p99=0, iqr=0
        )
    
    # Sort for percentile calculations
    sorted_values = sorted(values)
    n = len(sorted_values)
    
    # Basic statistics
    min_val = sorted_values[0]
    max_val = sorted_values[-1]
    mean = sum(values) / n
    
    # Median and MAD (robust)
    median = compute_median(sorted_values)
    mad = compute_mad(sorted_values, median)
    
    # Standard deviation (non-robust, for reference)
    if n > 1:
        variance = sum((x - mean) ** 2 for x in values) / (n - 1)
        std = math.sqrt(variance)
    else:
        std = 0.0
    
    # Percentiles
    p01 = compute_percentile(sorted_values, 1)
    p05 = compute_percentile(sorted_values, 5)
    p25 = compute_percentile(sorted_values, 25)
    p50 = median
    p75 = compute_percentile(sorted_values, 75)
    p95 = compute_percentile(sorted_values, 95)
    p99 = compute_percentile(sorted_values, 99)
    
    # IQR
    iqr = p75 - p25
    
    return RobustStatistics(
        count=n,
        min_val=min_val,
        max_val=max_val,
        median=median,
        mad=mad,
        mean=mean,
        std=std,
        p01=p01,
        p05=p05,
        p25=p25,
        p50=p50,
        p75=p75,
        p95=p95,
        p99=p99,
        iqr=iqr
    )


def detect_point_anomaly(
    value: float,
    median: float,
    mad: float,
    k: float = 3.0
) -> Tuple[float, bool]:
    """
    Detect if a value is anomalous using MAD-based method.
    
    Returns: (anomaly_score, is_anomaly)
    
    - score: 0.0 to 1.0 (0 = normal, 1 = extremely anomalous)
    - is_anomaly: True if score >= 0.5
    
    NIST recommends: σ ≈ 1.4826 × MAD for normal distribution
    Using k=3 covers ~99.7% for normal distribution
    """
    if mad == 0:
        # No variance - could be flatline or single point
        if len([value]) == 1:
            return 0.0, False
        return 0.0, True  # Flatline might be anomalous
    
    robust_sigma = 1.4826 * mad
    deviation = abs(value - median)
    
    # Z-score relative to robust sigma
    z_score = deviation / robust_sigma
    
    # Convert to score (0-1)
    # Using sigmoid-like scaling for better distribution
    score = min(1.0, z_score / (k * 2))
    
    return score, score >= 0.5


def get_dynamic_threshold(
    median: float,
    mad: float,
    severity: str = 'warning'
) -> Tuple[float, float]:
    """
    Get dynamic threshold based on MAD.
    
    Returns: (lower_bound, upper_bound)
    
    Severity levels:
    - 'warning': ±3σ (covers ~99.7%)
    - 'critical': ±5σ (covers ~99.9999%)
    - 'low': ±2σ (covers ~95%)
    """
    if mad == 0:
        return float('-inf'), float('inf')
    
    robust_sigma = 1.4826 * mad
    
    k_map = {
        'low': 2.0,
        'warning': 3.0,
        'critical': 5.0,
        'high': 4.0,
        'medium': 3.0
    }
    
    k = k_map.get(severity, 3.0)
    
    lower = median - k * robust_sigma
    upper = median + k * robust_sigma
    
    return lower, upper


def detect_contextual_anomaly(
    value: float,
    expected_value: float,
    expected_std: float,
    k: float = 3.0
) -> Tuple[float, bool]:
    """
    Detect contextual anomaly: value deviates from expected based on trend/seasonality.
    
    Returns: (anomaly_score, is_anomaly)
    """
    if expected_std == 0:
        deviation = abs(value - expected_value)
        return min(1.0, deviation), deviation > 0
    
    z_score = abs(value - expected_value) / expected_std
    score = min(1.0, z_score / (k * 2))
    
    return score, score >= 0.5


def rolling_stats(values: List[float], window: int = 100) -> List[RobustStatistics]:
    """
    Compute rolling statistics with specified window size.
    Returns list of statistics for each position.
    """
    results = []
    n = len(values)
    
    for i in range(n):
        start_idx = max(0, i - window + 1)
        window_values = values[start_idx:i + 1]
        results.append(compute_statistics(window_values))
    
    return results


def detect_change_point(
    values: List[float],
    window: int = 30,
    threshold: float = 0.7
) -> List[int]:
    """
    Detect change points using CUSUM-like approach.
    Returns list of indices where change points were detected.
    """
    if len(values) < window * 2:
        return []
    
    change_points = []
    
    for i in range(window, len(values) - window):
        left_window = values[i - window:i]
        right_window = values[i:i + window]
        
        left_stats = compute_statistics(left_window)
        right_stats = compute_statistics(right_window)
        
        # Check if distributions are significantly different
        # Using difference of medians normalized by pooled MAD
        median_diff = abs(left_stats.median - right_stats.median)
        pooled_mad = (left_stats.mad + right_stats.mad) / 2
        
        if pooled_mad > 0:
            normalized_diff = median_diff / (1.4826 * pooled_mad)
            if normalized_diff > threshold:
                # Avoid detecting consecutive change points
                if not change_points or (i - change_points[-1]) > window / 2:
                    change_points.append(i)
    
    return change_points
