#!/usr/bin/env python3
"""
RTSP Camera Scanner
Scans IP range 192.168.88.xxx to find accessible RTSP cameras
using credentials: User=FIRA, Password=Fira@2024
"""

import socket
from concurrent.futures import ThreadPoolExecutor, as_completed
import cv2
import numpy as np
import sys
import time

BASE_IP = "192.168.88."
USERNAME = "FIRA"
PASSWORD = "Fira@2024"
START = 1
END = 254
PORT_TIMEOUT = 2
RTSP_TIMEOUT = 5
MAX_WORKERS = 30

def check_rtsp_port(ip):
    """Test if RTSP port 554 is open"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(PORT_TIMEOUT)
        result = sock.connect_ex((ip, 554))
        sock.close()
        return result == 0, ip
    except Exception:
        return False, ip

def test_rtsp_auth(ip):
    """Test RTSP connection with authentication"""
    url = f"rtsp://{USERNAME}:{PASSWORD}@{ip}/cam/realmonitor?channel=1&subtype=0"
    
    # Try with opencv
    cap = None
    try:
        cap = cv2.VideoCapture(url)
        if cap.isOpened():
            # Try to read a frame
            ret, frame = cap.read()
            if ret and frame is not None:
                return True, ip, url, "OK"
            return True, ip, url, "Opened but no frame"
        else:
            return False, ip, url, "Cannot open stream"
    except Exception as e:
        return False, ip, url, str(e)[:50]
    finally:
        if cap is not None:
            cap.release()

def main():
    print("=" * 70)
    print("RTSP Camera Scanner with Authentication")
    print(f"IP Range: {BASE_IP}{START} - {BASE_IP}{END}")
    print(f"Credentials: {USERNAME} / {PASSWORD}")
    print("=" * 70)
    print()
    
    ips_to_check = [f"{BASE_IP}{i}" for i in range(START, END + 1)]
    
    print(f"Phase 1: Scanning for open RTSP port (554)...")
    
    # Phase 1: Find hosts with port 554 open
    open_ports = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(check_rtsp_port, ip): ip for ip in ips_to_check}
        completed = 0
        for future in as_completed(futures):
            completed += 1
            is_open, ip = future.result()
            if is_open:
                open_ports.append(ip)
            if completed % 50 == 0:
                print(f"  Scanned: {completed}/{len(ips_to_check)}, Found: {len(open_ports)}", end="\r")
    
    print(f"\n  Found {len(open_ports)} IPs with port 554 open")
    print()
    
    if not open_ports:
        print("No cameras found with open RTSP port.")
        return
    
    # Phase 2: Test authentication
    print(f"Phase 2: Testing authentication on {len(open_ports)} cameras...")
    print("-" * 70)
    
    accessible = []
    not_accessible = []
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(test_rtsp_auth, ip): ip for ip in open_ports}
        completed = 0
        for future in as_completed(futures):
            completed += 1
            success, ip, url, msg = future.result()
            if success:
                accessible.append((ip, url))
                print(f"\r  [{completed}/{len(open_ports)}] [OK] {ip}", end="")
            else:
                not_accessible.append((ip, msg))
                print(f"\r  [{completed}/{len(open_ports)}] [NO] {ip}", end="")
    
    print()
    print()
    
    # Results
    print("=" * 70)
    print("RESULTS")
    print("=" * 70)
    
    if accessible:
        print(f"\n[+] {len(accessible)} CAMERAS ACCESSIBLE with {USERNAME}:{PASSWORD}:\n")
        for i, (ip, url) in enumerate(sorted(accessible, key=lambda x: int(x[0].split('.')[-1])), 1):
            print(f"  {i}. {ip}")
            print(f"     {url}")
            print()
    else:
        print("\n  No cameras accessible with provided credentials.")
    
    if not_accessible:
        print(f"\n[-] {len(not_accessible)} IPs with port open but auth failed")
    
    print()
    print("=" * 70)
    print(f"Scan complete. Found {len(accessible)} accessible cameras.")
    print("=" * 70)

if __name__ == "__main__":
    main()
