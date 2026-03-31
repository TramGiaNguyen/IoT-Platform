#!/usr/bin/env python3
"""
POST sample to edge /api/v1/control — run on host and inside fastapi_backend container.

Usage:
  python scripts/verify_edge_control.py
  python scripts/verify_edge_control.py --url http://192.168.190.171/api/v1/control
  python scripts/verify_edge_control.py --header "X-API-Key: ak_xxx"
"""
from __future__ import annotations

import argparse
import json
import sys

try:
    import requests
except ImportError:
    print("Install requests: pip install requests", file=sys.stderr)
    sys.exit(2)


DEFAULT_BODY = {
    "control_commands": [
        {"relay": 1, "commands": {"on": {"relay": 1, "state": "ON"}}}
    ]
}


def main() -> int:
    p = argparse.ArgumentParser(description="POST test to edge control API")
    p.add_argument(
        "--url",
        default="http://192.168.190.171/api/v1/control",
        help="Full control endpoint URL",
    )
    p.add_argument(
        "--header",
        action="append",
        default=[],
        metavar="KEY: VALUE",
        help='Header them. VD: --header "X-API-Key: ak_abc"',
    )
    p.add_argument("--timeout", type=float, default=10.0)
    args = p.parse_args()

    headers = {"Content-Type": "application/json"}
    for h in args.header:
        if ":" not in h:
            print(f"Skip bad header: {h}", file=sys.stderr)
            continue
        k, v = h.split(":", 1)
        headers[k.strip()] = v.strip()

    print(f"POST {args.url}")
    print("Body:", json.dumps(DEFAULT_BODY, ensure_ascii=False))

    try:
        r = requests.post(args.url, json=DEFAULT_BODY, headers=headers, timeout=args.timeout)
    except requests.RequestException as e:
        print(f"FAIL: {e}")
        return 1

    print(f"HTTP {r.status_code}")
    text = (r.text or "")[:500]
    if text:
        print("Response:", text)
    return 0 if r.status_code < 400 else 1


if __name__ == "__main__":
    sys.exit(main())
