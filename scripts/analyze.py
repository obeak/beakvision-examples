#!/usr/bin/env python3
"""
OpenBeak Vision Analyzer - Sends screenshots to the OpenBeak API and returns
structured action recommendations for browser automation.

Usage:
    python analyze.py --image /tmp/screenshot.png --goal "Click the sign up button" --mode computer
    python analyze.py --image /tmp/screenshot.png --goal "Submit button" --mode ground
"""

import argparse
import base64
import json
import sys
import urllib.request
import urllib.error

OPENBEAK_URL = "http://localhost:8787/v1/parse"
API_KEY = "bv_8fd221760f814c40453a985bfcfb23fc5aa2c19b2d3652b8b5fd7199256b3a1a"


def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def analyze(image_path: str, goal: str, mode: str = "computer", context: str = "") -> dict:
    image_b64 = encode_image(image_path)

    payload = {
        "image": image_b64,
        "mode": mode,
        "goal": goal,
    }
    if context:
        payload["context"] = context

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        OPENBEAK_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(json.dumps({"success": False, "error": f"HTTP {e.code}: {body}"}), file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(json.dumps({"success": False, "error": f"Connection failed: {e.reason}. Is the OpenBeak server running at {OPENBEAK_URL}?"}), file=sys.stderr)
        sys.exit(1)

    return result


def main():
    parser = argparse.ArgumentParser(description="Analyze a screenshot with OpenBeak vision API")
    parser.add_argument("--image", required=True, help="Path to screenshot image (PNG/JPEG)")
    parser.add_argument("--goal", required=True, help="Task goal or element name (for ground mode)")
    parser.add_argument("--mode", default="computer", choices=["computer", "mobile", "ground"],
                        help="Analysis mode (default: computer)")
    parser.add_argument("--context", default="", help="Additional context for the task")
    parser.add_argument("--compact", action="store_true", help="Output only the action, not full response")
    args = parser.parse_args()

    result = analyze(args.image, args.goal, args.mode, args.context)

    if args.compact and result.get("success") and result.get("data"):
        data = result["data"]
        compact_output = {
            "screen_description": data.get("screen_description", ""),
            "action": data.get("action", {}),
            "element_count": len(data.get("elements", [])),
        }
        print(json.dumps(compact_output, indent=2))
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
