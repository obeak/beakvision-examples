from __future__ import annotations

import asyncio
import base64
import os
import sys
from pathlib import Path

from autogen_agentchat.agents import AssistantAgent
from dotenv import load_dotenv
from autogen_ext.models.openai import OpenAIChatCompletionClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from lib.beakvision import parse_screenshot


async def beakvision_plan(goal: str) -> str:
    """Inspect a screenshot with BeakVision and return the next grounded UI action."""
    screenshot_path = os.getenv("SCREENSHOT_PATH", "assets/example-browser.png")
    with open(screenshot_path, "rb") as handle:
        screenshot = base64.b64encode(handle.read()).decode("utf-8")

    result = parse_screenshot(
        image_base64=screenshot,
        mode="computer",
        goal=goal,
        context="AutoGen tool handoff for UI planning.",
    )

    action = result["data"].get("action") or {}
    return (
        f"Thought: {action.get('thought', '')}\n"
        f"Suggested actions: {result['data'].get('suggested_actions', [])}\n"
        f"Elements returned: {len(result['data'].get('elements', []))}"
    )


async def main() -> None:
    load_dotenv()
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY not set. Running BeakVision tool smoke test instead of AutoGen agent run.")
        print(await beakvision_plan(os.getenv("BEAKVISION_GOAL", "Find the next step to complete checkout.")))
        return

    model_client = OpenAIChatCompletionClient(
        model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
    )
    agent = AssistantAgent(
        name="ui_delegate",
        model_client=model_client,
        tools=[beakvision_plan],
        reflect_on_tool_use=True,
    )
    result = await agent.run(
        task=(
            "Use the beakvision_plan tool and summarize the next action for this goal: "
            + os.getenv("BEAKVISION_GOAL", "Find the next step to complete checkout.")
        )
    )
    print(result.messages[-1].content)
    await model_client.close()


if __name__ == "__main__":
    asyncio.run(main())
