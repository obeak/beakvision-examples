from __future__ import annotations

import base64
import os
import sys
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv
from langgraph.graph import END, StateGraph

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from lib.beakvision import parse_screenshot


class BrowserState(TypedDict):
    screenshot_base64: str
    goal: str
    thought: str
    next_action: str
    done: bool
    steps_remaining: int


def reason_about_screen(state: BrowserState) -> BrowserState:
    result = parse_screenshot(
        image_base64=state["screenshot_base64"],
        mode="computer",
        goal=state["goal"],
        context="LangGraph node for browser-state planning.",
    )
    action = result["data"].get("action") or {}
    steps_remaining = max(state["steps_remaining"] - 1, 0)
    return {
        **state,
        "thought": action.get("thought", ""),
        "next_action": result["data"].get("suggested_actions", ["finished"])[0],
        "done": action.get("type") == "finished" or steps_remaining == 0,
        "steps_remaining": steps_remaining,
    }


def route(state: BrowserState) -> str:
    return END if state["done"] else "reason_about_screen"


def build_graph():
    graph = StateGraph(BrowserState)
    graph.add_node("reason_about_screen", reason_about_screen)
    graph.set_entry_point("reason_about_screen")
    graph.add_conditional_edges("reason_about_screen", route)
    return graph.compile()


if __name__ == "__main__":
    load_dotenv()
    screenshot_path = os.getenv("SCREENSHOT_PATH", "assets/example-browser.png")
    with open(screenshot_path, "rb") as handle:
        screenshot = base64.b64encode(handle.read()).decode("utf-8")

    app = build_graph()
    result = app.invoke(
        {
            "screenshot_base64": screenshot,
            "goal": os.getenv("BEAKVISION_GOAL", "Open the billing settings page."),
            "thought": "",
            "next_action": "",
            "done": False,
            "steps_remaining": 1,
        }
    )
    print(
        {
            "goal": result["goal"],
            "thought": result["thought"],
            "next_action": result["next_action"],
            "done": result["done"],
            "steps_remaining": result["steps_remaining"],
        }
    )
