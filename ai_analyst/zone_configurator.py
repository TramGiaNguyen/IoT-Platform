"""
Parking Zone Configuration Tool
================================


Hướng dẫn sử dụng:
- Click trái: Thêm điểm vào polygon hiện tại
- Click phải: Hoàn thành polygon hiện tại
- 'n': Bắt đầu polygon mới
- 'u': Undo điểm cuối
- 'd': Xóa polygon cuối cùng
- 's': Lưu và in ra code
- 'e': Chuyển sang chế độ vẽ Entry Zone
- 'p': Chuyển sang chế độ vẽ Parking Slots
- 'q': Thoát
- Space: Pause/Resume video
"""

import cv2
import numpy as np
import os
import sys

# Add parent directories to path
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, base_dir)

from config import PARKING_VIDEO_URL

# Match ai_analyst/main.py: proportional resize, max 1280px
DISPLAY_MAX_SIZE = 1280

# RTSP transport: TCP for stability across NAT/firewall
if not os.environ.get("OPENCV_FFMPEG_CAPTURE_OPTIONS"):
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;8000000"


class ParkingZoneConfigurator:
    def __init__(self, video_path):
        self.video_path = video_path
        self.cap = None
        self.frame = None
        self.original_frame = None
        self.original_h = 0
        self.original_w = 0
        self.display_w = 0
        self.display_h = 0
        self.scale_x = 1.0
        self.scale_y = 1.0

        # Polygon storage (in ORIGINAL frame coordinates)
        self.parking_slots = []
        self.entry_zones = []
        self.current_polygon = []

        # Mode: 'parking' or 'entry'
        self.mode = 'parking'

        # UI state
        self.paused = True
        self.frame_pos = 0

        # Window
        self.window_name = "Parking Zone Configurator"
        
    def load_video(self):
        """Load video file (RTSP or local file)"""
        full_path = self.video_path
        print(f"[INFO] Loading video: {full_path}")

        self.cap = cv2.VideoCapture(full_path)
        if not self.cap.isOpened():
            print(f"[ERROR] Cannot open video: {full_path}")
            return False

        ret, frame = self.cap.read()
        if not ret:
            print("[ERROR] Cannot read video frame")
            return False

        self.original_h, self.original_w = frame.shape[:2]
        print(f"[INFO] Camera resolution: {self.original_w}x{self.original_h}")

        # Proportional resize — keep aspect ratio (matches main.py)
        if max(self.original_h, self.original_w) > DISPLAY_MAX_SIZE:
            s = DISPLAY_MAX_SIZE / max(self.original_h, self.original_w)
            self.display_w = int(self.original_w * s)
            self.display_h = int(self.original_h * s)
        else:
            self.display_w = self.original_w
            self.display_h = self.original_h
        self.scale_x = self.original_w / self.display_w
        self.scale_y = self.original_h / self.display_h

        self.original_frame = cv2.resize(frame, (self.display_w, self.display_h))
        print(f"[INFO] Display size: {self.display_w}x{self.display_h}  (scale_x={self.scale_x:.3f}, scale_y={self.scale_y:.3f})")
        return True
    
    def mouse_callback(self, event, x, y, flags, param):
        """Handle mouse events — store coordinates in ORIGINAL frame resolution."""
        if event == cv2.EVENT_LBUTTONDOWN:
            # Convert display coords → original frame coords (for use in main.py)
            ox = int(x * self.scale_x)
            oy = int(y * self.scale_y)
            self.current_polygon.append((ox, oy))
            print(f"[{self.mode.upper()}] Point added: display=({x},{y}) original=({ox},{oy})")
            self.update_display()
            
        elif event == cv2.EVENT_RBUTTONDOWN:
            # Complete current polygon
            if len(self.current_polygon) >= 3:
                if self.mode == 'parking':
                    self.parking_slots.append(self.current_polygon.copy())
                    slot_num = len(self.parking_slots)
                    print(f"[PARKING] Slot {slot_num} completed with {len(self.current_polygon)} points")
                else:
                    self.entry_zones.append(self.current_polygon.copy())
                    zone_num = len(self.entry_zones)
                    print(f"[ENTRY] Zone {zone_num} completed with {len(self.current_polygon)} points")
                self.current_polygon = []
            else:
                print("[WARN] Need at least 3 points to create polygon")
            self.update_display()
    
    def update_display(self):
        """Redraw frame with all polygons.

        Polygons are stored in original frame coordinates.
        Convert to display coords for drawing, so the user sees
        the exact same geometry as main.py will use at inference time.
        """
        self.frame = self.original_frame.copy()

        # Draw completed parking slots (green) — convert orig→display coords
        for i, slot in enumerate(self.parking_slots):
            disp_pts = [(int(p[0] / self.scale_x), int(p[1] / self.scale_y)) for p in slot]
            pts = np.array(disp_pts, np.int32)
            cv2.polylines(self.frame, [pts], True, (0, 255, 0), 2)
            cx = sum(p[0] for p in disp_pts) // len(disp_pts)
            cy = sum(p[1] for p in disp_pts) // len(disp_pts)
            cv2.putText(self.frame, str(i + 1), (cx - 10, cy + 5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        # Draw completed entry zones (cyan)
        for i, zone in enumerate(self.entry_zones):
            disp_pts = [(int(p[0] / self.scale_x), int(p[1] / self.scale_y)) for p in zone]
            pts = np.array(disp_pts, np.int32)
            cv2.polylines(self.frame, [pts], True, (255, 255, 0), 3)
            overlay = self.frame.copy()
            cv2.fillPoly(overlay, [pts], (255, 255, 0))
            cv2.addWeighted(overlay, 0.2, self.frame, 0.8, 0, self.frame)
            cx = sum(p[0] for p in disp_pts) // len(disp_pts)
            cy = sum(p[1] for p in disp_pts) // len(disp_pts)
            cv2.putText(self.frame, f"ENTRY {i + 1}", (cx - 30, cy),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

        # Draw current polygon being created — display coords
        if self.current_polygon:
            color = (0, 255, 255) if self.mode == 'parking' else (0, 165, 255)
            disp_current = [(int(p[0] / self.scale_x), int(p[1] / self.scale_y)) for p in self.current_polygon]
            for pt in disp_current:
                cv2.circle(self.frame, pt, 5, color, -1)
            if len(disp_current) > 1:
                pts = np.array(disp_current, np.int32)
                cv2.polylines(self.frame, [pts], False, color, 2)
        
        # Draw mode indicator + resolution info (bottom panel)
        mode_text = f"Mode: {self.mode.upper()}"
        mode_color = (0, 255, 0) if self.mode == 'parking' else (255, 255, 0)
        panel_h = 105
        panel_y = self.frame.shape[0] - panel_h - 5
        cv2.rectangle(self.frame, (5, panel_y), (350, panel_y + panel_h), (0, 0, 0), -1)
        cv2.putText(self.frame, mode_text, (10, panel_y + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.65, mode_color, 2)
        cv2.putText(self.frame, f"Slots: {len(self.parking_slots)}  |  Entry Zones: {len(self.entry_zones)}", (10, panel_y + 45),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1)
        cv2.putText(self.frame, f"Frame: {self.original_w}x{self.original_h}  Display: {self.display_w}x{self.display_h}  Scale: {self.scale_x:.3f}x{self.scale_y:.3f}", (10, panel_y + 65),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)
        cv2.putText(self.frame, f"Zone coords are in ORIGINAL resolution", (10, panel_y + 85),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (100, 200, 255), 1)

        # Draw instructions (at very bottom)
        instructions = [
            "L-Click: Add point | R-Click: Complete",
            "N: New polygon | U: Undo | D: Delete last",
            "P: Parking mode | E: Entry mode | S: Save",
            "Space: Pause/Play | Q: Quit"
        ]
        y_offset = self.frame.shape[0] - 75
        for instr in instructions:
            cv2.putText(self.frame, instr, (10, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
            y_offset += 18
        
        cv2.imshow(self.window_name, self.frame)
    
    def generate_code(self):
        """Generate Python code for parking areas and entry zones.

        Coordinates are in ORIGINAL frame resolution so they are compatible
        with ai_analyst/main.py inference output (bounding boxes from YOLO
        are also in original frame coordinates).
        """
        print("\n" + "=" * 60)
        print(f"GENERATED CODE  (frame: {self.original_w}x{self.original_h})")
        print("Compatible with ai_analyst/main.py")
        print("=" * 60)
        
        # Parking slots code
        print("\n# Paste this into define_parking_areas():")
        print("def define_parking_areas():")
        print("    return [")
        for i, slot in enumerate(self.parking_slots):
            slot_str = "[" + ",".join(f"({p[0]},{p[1]})" for p in slot) + "]"
            comment = f"  # Slot {i + 1}"
            if i < len(self.parking_slots) - 1:
                print(f"        {slot_str},{comment}")
            else:
                print(f"        {slot_str}{comment}")
        print("    ]")
        
        # Entry zones code
        print("\n# Paste this as a new function:")
        print("def define_entry_zones():")
        print('    """Define zones where vehicles from gate camera should be matched"""')
        print("    return [")
        for i, zone in enumerate(self.entry_zones):
            zone_str = "[" + ",".join(f"({p[0]},{p[1]})" for p in zone) + "]"
            comment = f"  # Entry Zone {i + 1}"
            if i < len(self.entry_zones) - 1:
                print(f"        {zone_str},{comment}")
            else:
                print(f"        {zone_str}{comment}")
        print("    ]")
        
        print("\n" + "=" * 60)
        
        # Also save to file with resolution metadata
        output_path = os.path.join(os.path.dirname(__file__), 'parking_zones_config.txt')
        with open(output_path, 'w') as f:
            f.write(f"# Frame resolution: {self.original_w}x{self.original_h}\n")
            f.write(f"# Display resolution: {self.display_w}x{self.display_h}\n")
            f.write(f"# Scale: {self.scale_x:.4f} x {self.scale_y:.4f}\n\n")
            f.write("# Parking Slots\n")
            f.write("PARKING_SLOTS = [\n")
            for slot in self.parking_slots:
                slot_str = "    [" + ",".join(f"({p[0]},{p[1]})" for p in slot) + "],\n"
                f.write(slot_str)
            f.write("]\n\n")

            f.write("# Entry Zones\n")
            f.write("ENTRY_ZONES = [\n")
            for zone in self.entry_zones:
                zone_str = "    [" + ",".join(f"({p[0]},{p[1]})" for p in zone) + "],\n"
                f.write(zone_str)
            f.write("]\n")
        
        print(f"[INFO] Config saved to: {output_path}")
    
    def run(self):
        """Main loop"""
        if not self.load_video():
            return
        
        cv2.namedWindow(self.window_name)
        cv2.setMouseCallback(self.window_name, self.mouse_callback)
        
        print("\n" + "=" * 60)
        print("PARKING ZONE CONFIGURATOR")
        print("=" * 60)
        print("Instructions:")
        print("  Left-click: Add point to current polygon")
        print("  Right-click: Complete current polygon")
        print("  'n': Start new polygon")
        print("  'u': Undo last point")
        print("  'd': Delete last completed polygon")
        print("  'p': Switch to Parking Slots mode")
        print("  'e': Switch to Entry Zone mode")
        print("  's': Save and generate code")
        print("  'q': Quit")
        print("  Space: Pause/Play video")
        print("=" * 60 + "\n")
        
        self.update_display()
        
        while True:
            key = cv2.waitKey(30) & 0xFF
            
            if key == ord('q'):
                break
            
            elif key == ord('n'):
                # Start new polygon
                self.current_polygon = []
                print(f"[{self.mode.upper()}] Starting new polygon")
                self.update_display()
            
            elif key == ord('u'):
                # Undo last point
                if self.current_polygon:
                    removed = self.current_polygon.pop()
                    print(f"[{self.mode.upper()}] Removed point: {removed}")
                    self.update_display()
            
            elif key == ord('d'):
                # Delete last completed polygon
                if self.mode == 'parking' and self.parking_slots:
                    self.parking_slots.pop()
                    print(f"[PARKING] Deleted last slot. Remaining: {len(self.parking_slots)}")
                elif self.mode == 'entry' and self.entry_zones:
                    self.entry_zones.pop()
                    print(f"[ENTRY] Deleted last zone. Remaining: {len(self.entry_zones)}")
                self.update_display()
            
            elif key == ord('p'):
                # Switch to parking mode
                self.mode = 'parking'
                self.current_polygon = []
                print("[MODE] Switched to PARKING SLOTS mode")
                self.update_display()
            
            elif key == ord('e'):
                # Switch to entry mode
                self.mode = 'entry'
                self.current_polygon = []
                print("[MODE] Switched to ENTRY ZONE mode")
                self.update_display()
            
            elif key == ord('s'):
                # Save and generate code
                self.generate_code()
            
            elif key == ord(' '):
                # Toggle pause
                self.paused = not self.paused
                print(f"[VIDEO] {'Paused' if self.paused else 'Playing'}")
            
            elif key == ord(','):
                # Previous frame
                self.frame_pos = max(0, self.frame_pos - 30)
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, self.frame_pos)
                ret, frame = self.cap.read()
                if ret:
                    self.original_frame = cv2.resize(frame, (self.display_w, self.display_h))
                    self.update_display()

            elif key == ord('.'):
                # Next frame
                self.frame_pos += 30
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, self.frame_pos)
                ret, frame = self.cap.read()
                if ret:
                    self.original_frame = cv2.resize(frame, (self.display_w, self.display_h))
                    self.update_display()

            # Auto advance video if not paused
            if not self.paused:
                ret, frame = self.cap.read()
                if ret:
                    self.original_frame = cv2.resize(frame, (self.display_w, self.display_h))
                    self.frame_pos += 1
                    self.update_display()
                else:
                    # Loop video
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    self.frame_pos = 0
        
        self.cap.release()
        cv2.destroyAllWindows()


def main():
    """Main entry point"""
    # Use default video or command line arg
    if len(sys.argv) > 1:
        video_path = sys.argv[1]
    else:
        video_path = PARKING_VIDEO_URL
    
    configurator = ParkingZoneConfigurator(video_path)
    configurator.run()


if __name__ == "__main__":
    main()
