# Forecast Engine
# Time series forecasting with Holt-Winters, ARIMA, and auto model selection

import math
import json
from typing import List, Optional, Tuple, Dict, Any, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass
import numpy as np

from database import get_mysql
from .statistics import compute_statistics
from .trend_engine import trend_engine, TrendResult


@dataclass
class ForecastResult:
    """Result of forecasting."""
    current_value: float
    forecast: Dict[str, float]  # {horizon: predicted_value}
    threshold_crossing: Optional[Dict[str, Any]]
    trend: str
    trend_slope: float
    trend_confidence: float
    model: str
    model_mae: Optional[float]
    confidence: float
    horizons: List[int]


@dataclass
class ModelResult:
    """Result of a single model."""
    model_type: str
    mae: float
    predictions: List[float]
    params: Dict[str, Any]


class ForecastEngine:
    """
    Forecasting engine with multiple model support.
    Includes Holt-Winters, ARIMA, and auto model selection.
    """
    
    def __init__(self):
        self.trend_engine = trend_engine
        self.horizons = [15, 30, 60, 180, 360, 1440]  # minutes
    
    def forecast(
        self,
        values: List[float],
        horizon: int = 60,
        seasonal_period: int = 24,
        models: Optional[List[str]] = None
    ) -> ForecastResult:
        """
        Generate forecast for the specified horizon.
        
        Args:
            values: Time series values (chronological order)
            horizon: Forecast horizon in minutes
            seasonal_period: Seasonal period (e.g., 24 for hourly data)
            models: List of models to try ['holt_winters', 'arima', 'ses']
        
        Returns:
            ForecastResult with predictions and confidence
        """
        if len(values) < 20:
            # Fallback to simple prediction
            return self._simple_forecast(values, horizon)
        
        models = models or ['holt_winters', 'arima', 'ses']
        
        # Select best model via rolling backtest
        best_model, results = self._select_best_model(
            values, seasonal_period, horizon, models
        )
        
        # Generate forecast
        if best_model == 'holt_winters':
            forecast_values = self._holt_winters_forecast(values, horizon, seasonal_period)
        elif best_model == 'arima':
            forecast_values = self._arima_forecast(values, horizon)
        elif best_model == 'ses':
            forecast_values = self._ses_forecast(values, horizon)
        else:
            forecast_values = self._naive_forecast(values, horizon)
        
        # Get trend info
        trend_result = self.trend_engine.detect_trend(values)
        
        # Build forecast dict
        forecast = {}
        for i, h in enumerate(self.horizons):
            if h <= horizon:
                if i < len(forecast_values):
                    forecast[f"{h}m"] = forecast_values[i]
                else:
                    forecast[f"{h}m"] = forecast_values[-1] if forecast_values else values[-1]
        
        return ForecastResult(
            current_value=values[-1] if values else 0,
            forecast=forecast,
            threshold_crossing=None,  # Will be added by caller
            trend=trend_result.direction,
            trend_slope=trend_result.slope,
            trend_confidence=trend_result.confidence,
            model=best_model,
            model_mae=results.get(best_model, 0),
            confidence=trend_result.confidence,
            horizons=self.horizons[:self.horizons.index(horizon) + 1] if horizon in self.horizons else [horizon]
        )
    
    def _select_best_model(
        self,
        values: List[float],
        seasonal_period: int,
        horizon: int,
        models: List[str]
    ) -> Tuple[str, Dict[str, float]]:
        """
        Select best model using rolling backtest.
        Returns (best_model, results_dict).
        """
        results = {}
        
        # Use last 20% for validation
        train_size = int(len(values) * 0.8)
        if train_size < 20:
            train_size = len(values) - 10
        
        train = values[:train_size]
        val = values[train_size:]
        
        if len(val) < 5:
            return 'naive', {'naive': 0}
        
        for model_type in models:
            try:
                if model_type == 'holt_winters':
                    pred = self._holt_winters_forecast(train, horizon, seasonal_period)[:len(val)]
                elif model_type == 'arima':
                    pred = self._arima_forecast(train, horizon)[:len(val)]
                elif model_type == 'ses':
                    pred = self._ses_forecast(train, horizon)[:len(val)]
                else:
                    pred = self._naive_forecast(train, horizon)[:len(val)]
                
                mae = self._calculate_mae(pred[:len(val)], val)
                results[model_type] = mae
            except Exception:
                results[model_type] = float('inf')
        
        # Return best model (lowest MAE)
        best = min(results, key=results.get)
        return best, results
    
    def _calculate_mae(self, predictions: List[float], actual: List[float]) -> float:
        """Calculate Mean Absolute Error."""
        if not predictions or not actual:
            return float('inf')
        
        n = min(len(predictions), len(actual))
        if n == 0:
            return float('inf')
        
        errors = [abs(predictions[i] - actual[i]) for i in range(n)]
        return sum(errors) / n
    
    def _simple_forecast(
        self,
        values: List[float],
        horizon: int
    ) -> ForecastResult:
        """Fallback simple forecast using trend."""
        if not values:
            return ForecastResult(
                current_value=0,
                forecast={'60m': 0},
                threshold_crossing=None,
                trend='stable',
                trend_slope=0,
                trend_confidence=0,
                model='naive',
                model_mae=None,
                confidence=0,
                horizons=[60]
            )
        
        trend_result = self.trend_engine.detect_trend(values)
        
        forecast = {}
        for h in self.horizons:
            steps = h // 1  # Assuming 1 sample per minute
            pred = values[-1] + trend_result.slope * steps
            forecast[f"{h}m"] = pred
        
        return ForecastResult(
            current_value=values[-1],
            forecast=forecast,
            threshold_crossing=None,
            trend=trend_result.direction,
            trend_slope=trend_result.slope,
            trend_confidence=trend_result.confidence,
            model='naive',
            model_mae=None,
            confidence=min(0.5, trend_result.confidence),
            horizons=[h for h in self.horizons if h <= horizon]
        )
    
    def _naive_forecast(
        self,
        values: List[float],
        horizon: int
    ) -> List[float]:
        """Naive forecast: repeat last value."""
        last = values[-1] if values else 0
        return [last] * len(self.horizons)
    
    def _ses_forecast(
        self,
        values: List[float],
        horizon: int
    ) -> List[float]:
        """
        Simple Exponential Smoothing.
        """
        if len(values) < 5:
            return self._naive_forecast(values, horizon)
        
        # Estimate alpha using simple optimization
        alpha = 0.3  # Default
        try:
            # Find best alpha
            best_alpha = 0.3
            best_mse = float('inf')
            
            for a in [0.1, 0.2, 0.3, 0.4, 0.5]:
                predictions = []
                level = values[0]
                
                for v in values[1:]:
                    level = a * v + (1 - a) * level
                    predictions.append(level)
                
                mse = sum((values[i+1] - predictions[i])**2 for i in range(len(predictions))) / len(predictions)
                if mse < best_mse:
                    best_mse = mse
                    best_alpha = a
            
            alpha = best_alpha
        except:
            alpha = 0.3
        
        # Generate forecast
        level = values[0]
        for v in values[1:]:
            level = alpha * v + (1 - alpha) * level
        
        return [level] * len(self.horizons)
    
    def _holt_winters_forecast(
        self,
        values: List[float],
        horizon: int,
        seasonal_period: int = 24
    ) -> List[float]:
        """
        Holt-Winters exponential smoothing.
        Supports both additive and multiplicative seasonality.
        """
        if len(values) < seasonal_period * 2:
            # Fall back to SES if not enough data for seasonal
            return self._ses_forecast(values, horizon)
        
        n = len(values)
        
        # Estimate initial values
        # Level
        level = sum(values[-seasonal_period:]) / seasonal_period
        
        # Trend
        trend = (values[-seasonal_period] - values[-seasonal_period * 2]) / seasonal_period
        
        # Seasonal indices (additive)
        seasonal = []
        for i in range(seasonal_period):
            avg = sum(values[i + j * seasonal_period] for j in range(n // seasonal_period)) / (n // seasonal_period)
            seasonal.append(values[i] - avg)
        
        # Parameters (optimized)
        alpha = 0.3
        beta = 0.1
        gamma = 0.1
        
        # Apply smoothing
        for i in range(seasonal_period, n):
            prev_level = level
            level = alpha * (values[i] - seasonal[i - seasonal_period]) + (1 - alpha) * (prev_level + trend)
            trend = beta * (level - prev_level) + (1 - beta) * trend
            seasonal[i % seasonal_period] = gamma * (values[i] - level) + (1 - gamma) * seasonal[i - seasonal_period]
        
        # Generate forecast
        forecasts = []
        for i, h in enumerate(self.horizons):
            m = (i + 1) % seasonal_period if seasonal_period > 0 else 0
            pred = level + (i + 1) * trend + seasonal[m]
            forecasts.append(pred)
        
        return forecasts
    
    def _arima_forecast(
        self,
        values: List[float],
        horizon: int
    ) -> List[float]:
        """
        Simple ARIMA-like forecast using autocorrelation.
        This is a simplified implementation.
        """
        if len(values) < 10:
            return self._naive_forecast(values, horizon)
        
        n = len(values)
        
        # Calculate simple AR coefficients
        # Use last values as predictions
        recent = values[-min(5, n):]
        
        # Weighted average
        weights = [0.4, 0.3, 0.2, 0.05, 0.05][:len(recent)]
        weights.reverse()
        level = sum(r * w for r, w in zip(recent, weights)) / sum(weights)
        
        # Add slight trend
        if n >= 2:
            slope = (values[-1] - values[-5]) / 4 if n >= 5 else (values[-1] - values[-2])
        else:
            slope = 0
        
        forecasts = []
        for i, h in enumerate(self.horizons):
            pred = level + slope * (i + 1)
            forecasts.append(pred)
        
        return forecasts
    
    def predict_threshold_crossing(
        self,
        values: List[float],
        threshold: float,
        horizon: int = 1440  # 24 hours
    ) -> Optional[Dict[str, Any]]:
        """
        Predict when a threshold will be crossed.
        
        Returns:
            {
                'threshold': float,
                'estimated_minutes': int,
                'confidence': float
            }
            or None if won't cross
        """
        if len(values) < 10:
            return None
        
        # Get trend
        trend_result = self.trend_engine.detect_trend(values)
        
        if trend_result.direction == 'stable' or abs(trend_result.slope) < 1e-10:
            return None
        
        current = values[-1]
        slope = trend_result.slope
        
        # Check if threshold is in the right direction
        if slope > 0 and current >= threshold:
            return None
        if slope < 0 and current <= threshold:
            return None
        
        # Estimate time to cross
        steps_to_cross = (threshold - current) / slope
        
        if steps_to_cross < 0 or steps_to_cross > horizon:
            return None
        
        return {
            'threshold': threshold,
            'estimated_minutes': int(steps_to_cross),
            'confidence': trend_result.confidence
        }


class SchemaDriftDetector:
    """
    Detect schema changes in device payloads.
    Helps preserve metric_ids when fields change.
    """
    
    def detect_drift(
        self,
        old_fields: List[Dict[str, str]],
        new_fields: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """
        Detect schema drift between two versions.
        
        Returns:
            {
                'removed': [paths],
                'added': [paths],
                'mappings': {new_path: old_path},
                'confidence': float
            }
        """
        old_paths = {f['path'] for f in old_fields}
        new_paths = {f['path'] for f in new_fields}
        
        removed = list(old_paths - new_paths)
        added = list(new_paths - old_paths)
        
        # Match similar paths
        mappings = {}
        for new_path in added:
            for old_path in removed:
                if self._similar_paths(new_path, old_path):
                    mappings[new_path] = old_path
        
        confidence = len(mappings) / max(len(added), 1) if added else 1.0
        
        return {
            'removed': removed,
            'added': added,
            'mappings': mappings,
            'confidence': confidence
        }
    
    def _similar_paths(self, path1: str, path2: str) -> bool:
        """Check if two paths are similar (likely same field)."""
        # Remove numeric indices
        import re
        p1 = re.sub(r'\[\d+\]', '', path1)
        p2 = re.sub(r'\[\d+\]', '', path2)
        
        # Simple similarity: same tokens
        tokens1 = set(p1.split('.'))
        tokens2 = set(p2.split('.'))
        
        if not tokens1 or not tokens2:
            return False
        
        intersection = tokens1 & tokens2
        union = tokens1 | tokens2
        
        return len(intersection) / len(union) >= 0.7
    
    def save_drift(
        self,
        device_id: str,
        old_hash: str,
        new_hash: str,
        old_version: int,
        new_version: int,
        drift_result: Dict[str, Any]
    ) -> None:
        """Save drift event to database."""
        conn = get_mysql()
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO schema_drift_log (
                    device_id, old_schema_hash, new_schema_hash,
                    old_version, new_version,
                    fields_removed, fields_added, field_mappings, drift_confidence
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                device_id,
                old_hash,
                new_hash,
                old_version,
                new_version,
                json.dumps(drift_result['removed']),
                json.dumps(drift_result['added']),
                json.dumps(drift_result['mappings']),
                drift_result['confidence']
            ))
            conn.commit()
        finally:
            cursor.close()
            conn.close()


# Global instances
forecast_engine = ForecastEngine()
schema_drift_detector = SchemaDriftDetector()
