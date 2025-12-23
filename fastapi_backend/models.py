# fastapi_backend/models.py

from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class Event(BaseModel):
    device_id: str
    temperature: float
    humidity: float
    timestamp: Optional[float] = None
    
    class Config:
        extra = "allow"

class Token(BaseModel):
    access_token: str
    token_type: str
    vai_tro: Optional[str] = None
    allowed_pages: Optional[List[str]] = None


# =========================================================
# Dashboard Models
# =========================================================

class DashboardCreateRequest(BaseModel):
    ten_dashboard: str
    mo_ta: Optional[str] = None
    icon: Optional[str] = "dashboard"
    mau_sac: Optional[str] = "#22d3ee"
    widgets: Optional[List[Dict[str, Any]]] = []  # Optional widgets to create with dashboard


class DashboardUpdateRequest(BaseModel):
    ten_dashboard: Optional[str] = None
    mo_ta: Optional[str] = None
    icon: Optional[str] = None
    mau_sac: Optional[str] = None
    trang_thai: Optional[str] = None  # 'active' or 'archived'


class WidgetCreateRequest(BaseModel):
    widget_type: str  # 'line_chart', 'bar_chart', 'gauge', 'stat_card', 'table', 'pie_chart'
    ten_widget: Optional[str] = None
    vi_tri_x: int = 0
    vi_tri_y: int = 0
    chieu_rong: int = 4
    chieu_cao: int = 3
    cau_hinh: Dict[str, Any]  # JSON config: device_id, data_keys, time_range, colors, etc.
    thu_tu: int = 0


class WidgetUpdateRequest(BaseModel):
    widget_type: Optional[str] = None
    ten_widget: Optional[str] = None
    vi_tri_x: Optional[int] = None
    vi_tri_y: Optional[int] = None
    chieu_rong: Optional[int] = None
    chieu_cao: Optional[int] = None
    cau_hinh: Optional[Dict[str, Any]] = None
    thu_tu: Optional[int] = None


class WidgetDataRequest(BaseModel):
    time_range: Optional[str] = "1h"  # '1h', '6h', '24h', '7d', '30d'
    start_time: Optional[float] = None  # Unix timestamp (optional, overrides time_range)
    end_time: Optional[float] = None  # Unix timestamp (optional)


class DashboardResponse(BaseModel):
    id: int
    ten_dashboard: str
    mo_ta: Optional[str]
    icon: str
    mau_sac: str
    nguoi_tao_id: int
    nguoi_tao_ten: Optional[str] = None
    ngay_tao: datetime
    ngay_cap_nhat: datetime
    trang_thai: str
    widgets: Optional[List[Dict[str, Any]]] = None  # Widgets will be loaded separately or included


class WidgetResponse(BaseModel):
    id: int
    dashboard_id: int
    widget_type: str
    ten_widget: Optional[str]
    vi_tri_x: int
    vi_tri_y: int
    chieu_rong: int
    chieu_cao: int
    cau_hinh: Dict[str, Any]
    thu_tu: int
    ngay_tao: datetime
