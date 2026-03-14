from __future__ import annotations

import os
from typing import Any, Dict, Optional

import requests


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def parse_screenshot(
    *,
    image_base64: str,
    mode: str,
    goal: str,
    context: Optional[str] = None,
) -> Dict[str, Any]:
    response = requests.post(
        _required_env("BEAKVISION_PARSE_URL"),
        headers={
            "Authorization": f"Bearer {_required_env('BEAKVISION_API_KEY')}",
            "Content-Type": "application/json",
        },
        json={
            "image": image_base64,
            "mode": mode,
            "goal": goal,
            "context": context,
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()
