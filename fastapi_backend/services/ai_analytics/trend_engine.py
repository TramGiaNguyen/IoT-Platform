# Trend Detection Engine
# Rolling linear regression for trend analysis

import math
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass

from .statistics import compute_statistics


@dataclass
class TrendResult:
    """Result of trend analysis."""
    direction: str  # 'up', 'down', 'stable', 'insufficient_data'
    slope: float
    normalized_slope: float  # Relative to noise
    confidence: float  # 0-1
    r_squared: float  # Goodness of fit
    sample_count: int
    window_size: int


class TrendEngine:
    """
    Trend detection using rolling linear regression.
    Provides normalized trend scores for fair comparison across metrics.
    """
    
    def __init__(self):
        self.min_window = 10
        self.default_window = 50
        self.max_window = 500
    
    def detect_trend(
        self,
        values: List[float],
        window: int = 50
    ) -> TrendResult:
        """
        Detect trend using linear regression on rolling window.
        
        Returns TrendResult with direction, slope, and confidence.
        """
        if len(values) < self.min_window:
            return TrendResult(
                direction='insufficient_data',
                slope=0,
                normalized_slope=0,
                confidence=0,
                r_squared=0,
                sample_count=len(values),
                window_size=len(values)
            )
        
        # Use sliding window
        n = min(window, len(values))
        recent = values[-n:]
        
        # Linear regression
        slope, intercept, r_squared = self._linear_regression(recent)
        
        # Calculate residuals for noise estimation
        residuals = self._calculate_residuals(recent, slope, intercept)
        noise_scale = self._robust_noise_scale(residuals)
        
        # Normalize slope by noise
        if noise_scale > 1e-10:
            normalized_slope = slope / noise_scale
        else:
            normalized_slope = 0
        
        # Determine direction
        if abs(normalized_slope) < 0.1:
            direction = 'stable'
        elif normalized_slope > 0:
            direction = 'up'
        else:
            direction = 'down'
        
        # Calculate confidence based on R-squared and sample size
        confidence = min(0.95, r_squared * (n / 100))
        
        return TrendResult(
            direction=direction,
            slope=slope,
            normalized_slope=normalized_slope,
            confidence=confidence,
            r_squared=r_squared,
            sample_count=n,
            window_size=window
        )
    
    def detect_all_trends(
        self,
        values: List[float],
        window: int = 50
    ) -> List[TrendResult]:
        """
        Detect trends at multiple window sizes.
        Returns list of TrendResult for each window.
        """
        windows = [10, 20, 50, 100, 200]
        results = []
        
        for w in windows:
            if len(values) >= w:
                results.append(self.detect_trend(values, w))
        
        return results
    
    def get_rate_of_change(
        self,
        values: List[float],
        window: int = 20
    ) -> float:
        """
        Get rate of change (units per sample).
        """
        if len(values) < 2:
            return 0.0
        
        n = min(window, len(values))
        recent = values[-n:]
        
        slope, _, _ = self._linear_regression(recent)
        return slope
    
    def predict_next_value(
        self,
        values: List[float],
        steps: int = 1,
        window: int = 50
    ) -> float:
        """
        Predict next value using linear trend.
        """
        if len(values) < self.min_window:
            return values[-1] if values else 0.0
        
        n = min(window, len(values))
        recent = values[-n:]
        
        slope, intercept, _ = self._linear_regression(recent)
        
        # Predict for step positions ahead
        return slope * (n + steps - 1) + intercept
    
    def detect_trend_reversal(
        self,
        values: List[float],
        window: int = 50,
        threshold: float = 0.5
    ) -> List[int]:
        """
        Detect points where trend reverses direction.
        Returns list of indices.
        """
        if len(values) < window * 2:
            return []
        
        reversals = []
        half_window = window // 2
        
        for i in range(half_window, len(values) - half_window):
            # Trend before point
            before = values[i - half_window:i]
            slope_before, _, _ = self._linear_regression(before)
            
            # Trend after point
            after = values[i:i + half_window]
            slope_after, _, _ = self._linear_regression(after)
            
            # Check for reversal
            if slope_before > 0 and slope_after < -threshold * abs(slope_before):
                reversals.append(i)
            elif slope_before < 0 and slope_after > threshold * abs(slope_before):
                reversals.append(i)
        
        return reversals
    
    def _linear_regression(
        self,
        values: List[float]
    ) -> Tuple[float, float, float]:
        """
        Perform simple linear regression.
        Returns (slope, intercept, r_squared).
        """
        n = len(values)
        if n < 2:
            return 0, 0, 0
        
        x = list(range(n))
        x_mean = sum(x) / n
        y_mean = sum(values) / n
        
        # Calculate slope and intercept
        numerator = sum((x[i] - x_mean) * (values[i] - y_mean) for i in range(n))
        denominator = sum((x[i] - x_mean) ** 2 for i in range(n))
        
        if denominator == 0:
            return 0, y_mean, 0
        
        slope = numerator / denominator
        intercept = y_mean - slope * x_mean
        
        # Calculate R-squared
        ss_res = sum((values[i] - (slope * x[i] + intercept)) ** 2 for i in range(n))
        ss_tot = sum((values[i] - y_mean) ** 2 for i in range(n))
        
        if ss_tot == 0:
            r_squared = 1.0 if ss_res == 0 else 0.0
        else:
            r_squared = 1 - (ss_res / ss_tot)
        
        return slope, intercept, r_squared
    
    def _calculate_residuals(
        self,
        values: List[float],
        slope: float,
        intercept: float
    ) -> List[float]:
        """Calculate residuals from regression."""
        return [
            values[i] - (slope * i + intercept)
            for i in range(len(values))
        ]
    
    def _robust_noise_scale(self, residuals: List[float]) -> float:
        """
        Estimate noise scale using MAD (robust).
        σ ≈ 1.4826 × MAD
        """
        if not residuals:
            return 0.0
        
        n = len(residuals)
        sorted_residuals = sorted(residuals, key=abs)
        median = sorted_residuals[n // 2]
        
        abs_deviations = [abs(r - median) for r in residuals]
        abs_deviations.sort()
        mad = abs_deviations[n // 2]
        
        return 1.4826 * mad


# Global instance
trend_engine = TrendEngine()
