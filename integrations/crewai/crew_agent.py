from __future__ import annotations

import base64
import os
import sys
from pathlib import Path

from crewai import Agent, Crew, Process, Task
from crewai.tools import tool
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from lib.beakvision import parse_screenshot


@tool("beakvision_plan")
def inspect_ui(goal: str) -> str:
    """Inspect a screenshot with BeakVision and return the next grounded UI action."""
    screenshot_path = os.getenv("SCREENSHOT_PATH", "assets/example-browser.png")
    with open(screenshot_path, "rb") as handle:
        screenshot = base64.b64encode(handle.read()).decode("utf-8")

    result = parse_screenshot(
        image_base64=screenshot,
        mode="computer",
        goal=goal,
        context="CrewAI handoff. Return grounded guidance for the executor agent.",
    )
    action = result["data"].get("action") or {}
    return (
        f"Thought: {action.get('thought', '')}\n"
        f"Suggested actions: {result['data'].get('suggested_actions', [])}\n"
        f"Coordinate space: {result['data'].get('coordinate_space', {})}"
    )


if __name__ == "__main__":
    load_dotenv()
    goal = os.getenv("BEAKVISION_GOAL", "Find the next step to complete checkout.")
    openai_api_key = os.getenv("OPENAI_API_KEY")

    if not openai_api_key:
        print("OPENAI_API_KEY not set. Running BeakVision tool smoke test instead of Crew kickoff.")
        print(inspect_ui.run(goal))
        raise SystemExit(0)

    planner = Agent(
        role="UI Planner",
        goal="Turn screenshots into grounded UI actions.",
        backstory="Specialist in GUI reasoning for browser and desktop flows.",
        tools=[inspect_ui],
        verbose=True,
    )

    task = Task(
        description=(
            "Use the `beakvision_plan` tool to inspect the latest screenshot and "
            f"produce the next precise action for this goal: {goal}"
        ),
        expected_output="A concise execution brief with the thought and exact coordinates or action string.",
        agent=planner,
    )

    crew = Crew(agents=[planner], tasks=[task], process=Process.sequential, verbose=True)
    print(crew.kickoff())
