from __future__ import annotations

import os
import time
from typing import Any, Dict

import requests
from appium import webdriver
from appium.options.common.base import AppiumOptions
from dotenv import load_dotenv

from lib.beakvision import parse_screenshot


def required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def screenshot_base64(driver: webdriver.Remote) -> str:
    return driver.get_screenshot_as_base64()


def build_driver() -> webdriver.Remote:
    server_url = required("APPIUM_SERVER_URL")
    try:
        response = requests.get(f"{server_url}/status", timeout=5)
        response.raise_for_status()
    except Exception as exc:
        raise RuntimeError(
            f"Appium server is not reachable at {server_url}. Start Appium before running mobile_test.py."
        ) from exc

    options = AppiumOptions()
    options.set_capability("platformName", required("APPIUM_PLATFORM_NAME"))
    options.set_capability("appium:deviceName", required("APPIUM_DEVICE_NAME"))
    options.set_capability("appium:automationName", "UiAutomator2")
    options.set_capability("appium:appPackage", required("APPIUM_APP_PACKAGE"))
    options.set_capability("appium:appActivity", required("APPIUM_APP_ACTIVITY"))
    return webdriver.Remote(server_url, options=options)


def perform(driver: webdriver.Remote, action: Dict[str, Any]) -> None:
    action_type = action["type"]
    point = action.get("point", {})
    x = int(point.get("x", 0))
    y = int(point.get("y", 0))

    if action_type == "click":
        driver.tap([(x, y)])
        return
    if action_type == "long_press":
        driver.tap([(x, y)], 1200)
        return
    if action_type == "scroll":
        delta = 550
        direction = action.get("direction", "down")
        end_y = y - delta if direction == "up" else y + delta
        driver.swipe(x, y, x, end_y, 600)
        return
    if action_type == "drag":
        end = action["end_point"]
        driver.swipe(x, y, int(end["x"]), int(end["y"]), 700)
        return
    if action_type == "type":
        driver.tap([(x, y)])
        driver.execute_script("mobile: type", {"text": action.get("text", "")})
        return
    if action_type == "press_back":
        driver.back()
        return
    if action_type == "press_home":
        driver.press_keycode(3)
        return
    if action_type == "finished":
        return
    raise RuntimeError(f"Unsupported action type: {action_type}")


def main() -> None:
    load_dotenv()
    goal = required("BEAKVISION_GOAL")
    driver = build_driver()
    try:
        for step in range(1, 13):
            result = parse_screenshot(
                image_base64=screenshot_base64(driver),
                mode="mobile",
                goal=goal,
                context=f"Android mobile test loop. Step {step}.",
            )
            action = result["data"].get("action")
            print(f"\nStep {step}")
            print(f"Thought: {action.get('thought', '(none)') if action else '(none)'}")

            if not action or action["type"] == "finished":
                print("BeakVision marked the task as complete.")
                break

            perform(driver, action)
            time.sleep(1)
    finally:
        driver.quit()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"mobile_test.py failed: {exc}")
        raise SystemExit(1)
