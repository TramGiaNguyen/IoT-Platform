"""
Zone tracker module for ai_analyst.
Tracks which zone each person (centroid-based) belongs to and accumulates occupancy time.
"""

import cv2
import numpy as np
from typing import Dict, Set, List, Tuple, Optional
from dataclasses import dataclass


OverlayBox = Tuple[float, float, float, float, Optional[int]]


@dataclass
class ZoneInfo:
    id: int
    name: str
    points: List[Tuple[float, float]]
    is_entry: bool = False


class ZoneTracker:
    def __init__(self, zones: List[dict], camera_id: int):
        self.camera_id = camera_id
        self.zone_infos: List[ZoneInfo] = []
        self.zone_polygons: List[np.ndarray] = []
        self.zone_ids: List[int] = []
        self.zone_names: List[str] = []

        for z in zones:
            zid = z["id"]
            name = z.get("name") or z.get("zone_name") or f"Zone {z.get('index', zid)}"
            pts_raw = z.get("points") or z.get("polygon_points") or []
            if isinstance(pts_raw, str):
                import json
                pts_raw = json.loads(pts_raw)
            points = [(float(x), float(y)) for x, y in pts_raw]
            is_entry = z.get("is_entry", False)

            self.zone_infos.append(ZoneInfo(id=zid, name=name, points=points, is_entry=is_entry))
            self.zone_polygons.append(np.array(points, np.int32))
            self.zone_ids.append(zid)
            self.zone_names.append(name)

        self._track_zones: Dict[int, Set[int]] = {}
        self._zone_seconds: Dict[int, float] = {z["id"]: 0.0 for z in zones}
        self._zone_occupied: Dict[int, bool] = {z["id"]: False for z in zones}
        self._zone_occupied_since: Dict[int, Optional[float]] = {z["id"]: None for z in zones}
        self._zone_people: Dict[int, Set[int]] = {z["id"]: set() for z in zones}
        # Track accumulated time per track_id per zone
        self._track_zone_seconds: Dict[int, Dict[int, float]] = {}  # track_id -> zone_id -> accumulated seconds
        self._last_update_time: Optional[float] = None

    def point_in_polygon(self, x: float, y: float, polygon: np.ndarray) -> bool:
        result = cv2.pointPolygonTest(polygon, (x, y), False)
        return result >= 0

    @staticmethod
    def get_centroid(box: OverlayBox) -> Tuple[float, float]:
        x1, y1, x2, y2, _ = box
        return ((x1 + x2) / 2, (y1 + y2) / 2)

    def get_zone_for_box(self, box: OverlayBox) -> int:
        """Return zone_id where the person's centroid falls (primary zone).
        If centroid outside all zones, return -1 (not tracked)."""
        cx, cy = self.get_centroid(box)
        for i, poly in enumerate(self.zone_polygons):
            if self.point_in_polygon(cx, cy, poly):
                return self.zone_ids[i]
        return -1

    def update(self, boxes: List[OverlayBox], frame_time: float):
        """Update zone membership for all tracked people.
        boxes: list of (x1, y1, x2, y2, track_id)
        frame_time: seconds since session start (or absolute time)"""
        dt = 0.5
        if self._last_update_time is not None:
            dt = max(0.1, min(frame_time - self._last_update_time, 2.0))
        self._last_update_time = frame_time

        current_zones: Dict[int, int] = {}

        for box in boxes:
            zone_id = self.get_zone_for_box(box)
            track_id = box[4]
            if zone_id != -1 and track_id is not None:
                current_zones[track_id] = zone_id

        for zid in self._zone_people:
            self._zone_people[zid] = set()

        for track_id, zone_id in current_zones.items():
            self._zone_people[zone_id].add(track_id)
            self._track_zones[track_id] = {zone_id}
            # Accumulate time for this track in this zone
            if track_id not in self._track_zone_seconds:
                self._track_zone_seconds[track_id] = {}
            if zone_id not in self._track_zone_seconds[track_id]:
                self._track_zone_seconds[track_id][zone_id] = 0.0
            self._track_zone_seconds[track_id][zone_id] += dt

        # Remove track_id from _track_zone_seconds if no longer in any zone
        for track_id in list(self._track_zone_seconds.keys()):
            if track_id not in current_zones:
                del self._track_zone_seconds[track_id]

        for zid in self._zone_seconds:
            count = len(self._zone_people[zid])
            if count > 0:
                if not self._zone_occupied[zid]:
                    self._zone_occupied[zid] = True
                    self._zone_occupied_since[zid] = frame_time
                self._zone_seconds[zid] += dt
            else:
                self._zone_occupied[zid] = False
                self._zone_occupied_since[zid] = None

    def get_occupancy(self) -> List[dict]:
        """Return current zone occupancy status including per-track time in each zone."""
        result = []
        for i, zid in enumerate(self.zone_ids):
            # Per-track time for this zone
            track_times = []
            for track_id, zone_seconds in self._track_zone_seconds.items():
                if zid in zone_seconds:
                    track_times.append({
                        "track_id": track_id,
                        "seconds": int(round(zone_seconds[zid])),
                    })
            # Sort by track_id for consistent display
            track_times.sort(key=lambda x: x["track_id"])
            result.append({
                "zone_id": zid,
                "zone_name": self.zone_names[i],
                "occupied": self._zone_occupied[zid],
                "seconds": int(round(self._zone_seconds[zid])),
                "people_count": len(self._zone_people[zid]),
                "track_times": track_times,
            })
        return result

    def draw_overlay(self, vis: np.ndarray) -> np.ndarray:
        """Draw zone polygons and labels on the frame. Returns the modified frame."""
        zone_status = self.get_occupancy()
        for i, zs in enumerate(zone_status):
            pts = self.zone_polygons[i]
            occupied = zs["occupied"]
            color = (0, 255, 0) if occupied else (0, 0, 255)

            cv2.polylines(vis, [pts], True, color, 2)
            x_coords = pts[:, 0]
            y_coords = pts[:, 1]
            cx = int(x_coords.mean())
            cy = int(y_coords.mean())

            label = f"{zs['zone_name']}: {zs['seconds']}s"
            if zs["people_count"] > 0:
                label += f" ({zs['people_count']})"

            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            bg_x1 = cx - tw // 2 - 4
            bg_y1 = cy - th - 4
            bg_x2 = cx + tw // 2 + 4
            bg_y2 = cy + 4
            cv2.rectangle(vis, (bg_x1, bg_y1), (bg_x2, bg_y2), color, -1)
            cv2.putText(
                vis,
                label,
                (cx - tw // 2, cy),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
            )
        return vis
