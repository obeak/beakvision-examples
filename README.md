# BeakVision Examples

Open-source examples for turning any screenshot into structured UI elements, exact coordinates, grounded actions, and next-step reasoning with a single `POST /v1/parse`.

![Browser playground demo](./assets/playground-browser.gif)
![Mobile playground demo](./assets/playground-mobile.gif)
![Grounding playground demo](./assets/playground-grounding.gif)

## What is inside

- `browser_agent.ts` — Playwright loop that screenshots a browser, asks BeakVision what to do next, and executes the returned action.
- `mac_desktop_agent.ts` — native macOS desktop loop using `screencapture` + BeakVision + `cliclick`.
- `mobile_test.py` — Appium-driven mobile test that converts each device screenshot into the next tap, scroll, type, or drag.
- `qa_automation/` — smoke-test and regression-watchdog examples for QA teams.
- `integrations/langgraph/` — LangGraph state machine that treats BeakVision as the UI planner node.
- `integrations/crewai/` — CrewAI example for handing a screenshot to a UI-planning crew member.
- `integrations/autogen/` — AutoGen example that injects grounded screen reasoning into an agent conversation.

## Why teams use this

- One endpoint: screenshot in, action out.
- Works across browser, desktop, and mobile screenshots.
- Returns structured elements, exact coordinates, and an actionable next step.
- Fast enough for agent loops, cheap enough for broad QA and RPA coverage.
- No SDKs required.

## 30-second setup

```bash
git clone https://github.com/openbeak/beakvision-examples.git
cd beakvision-examples
cp .env.example .env
npm install
pip install -r requirements.txt
```

Set these env vars in `.env`:

```bash
BEAKVISION_PARSE_URL=https://your-beakvision-host/v1/parse
BEAKVISION_API_KEY=your_api_key
TARGET_URL=https://example.com
BEAKVISION_GOAL=Log into the app and open the billing settings page.
BEAKVISION_SUCCESS_URL_CONTAINS=#billing
```

## Example 1: Browser agent

```bash
npm run browser-agent
```

The Playwright loop:

1. Opens a browser page.
2. Captures a screenshot.
3. Sends the screenshot plus task state, action history, and completion criteria to BeakVision in `computer` mode.
4. Reads back `thought`, `suggested_actions`, and exact coordinates.
5. Executes the returned click, type, scroll, drag, or hotkey.
6. Stops when the success condition is met or the model marks the task `finished`.

Useful browser-agent env vars:

- `BEAKVISION_SUCCESS_URL_CONTAINS` lets the runner stop when the URL reaches a known fragment or path.
- `BEAKVISION_SUCCESS_TEXT_CONTAINS` lets the runner stop when specific visible text appears.
- `BEAKVISION_SUCCESS_SELECTOR` lets the runner stop when a CSS selector exists.
- `BEAKVISION_MAX_STEPS` caps the loop.

## Example 2: Mobile test

```bash
python mobile_test.py
```

This example uses Appium plus BeakVision `mobile` mode to drive Android UI flows from screenshots instead of brittle selector-only scripts.

## Example 3: macOS desktop control

Install the click helper once:

```bash
brew install cliclick
```

Then run:

```bash
MACOS_APP_NAME=Calculator \
BEAKVISION_GOAL="Click the 7 button in Calculator." \
npm run mac-agent
```

Notes:

- This example captures the live macOS desktop with `screencapture`.
- It scales BeakVision pixel coordinates into macOS desktop coordinates before executing them with `cliclick`.
- macOS Accessibility permission is required for real clicks and typing.
- macOS Screen Recording permission is required so the script can capture the desktop screenshot it sends to BeakVision.
- Set `MACOS_DRY_RUN=true` if you want to print the planned desktop actions without executing them.

## Example 4: QA automation

```bash
npm run qa:smoke
npm run qa:watch
```

`qa_automation/web_smoke.ts` uses `ground` mode to localize critical controls on a page.

`qa_automation/regression_watchdog.ts` uses `computer` mode to describe blockers, overlays, and the next step in a fragile flow.

## Framework integrations

### LangGraph

```bash
pip install -r requirements-langgraph.txt
python integrations/langgraph/browser_graph.py
```

### CrewAI

```bash
pip install -r requirements-crewai.txt
python integrations/crewai/crew_agent.py
```

Without `OPENAI_API_KEY`, this script falls back to a BeakVision tool smoke test so you can verify the integration wiring locally.

### AutoGen

```bash
pip install -r requirements-autogen.txt
python integrations/autogen/ui_delegate.py
```

Without `OPENAI_API_KEY`, this script falls back to a BeakVision tool smoke test so you can verify the integration wiring locally.

## Raw API shape

Every example uses the same request shape:

```json
{
  "image": "<base64 screenshot>",
  "mode": "computer",
  "context": "Browser automation loop. Current URL: https://example.com.",
  "goal": "Open the billing settings page."
}
```

And reads back the same key fields:

```json
{
  "success": true,
  "data": {
    "elements": [],
    "suggested_actions": ["click(410, 190)"],
    "action": {
      "type": "click",
      "point": { "x": 410, "y": 190 },
      "thought": "The billing settings entry is visible in the sidebar."
    }
  }
}
```

## Good fits

- Browser agents
- Desktop agents
- Mobile testing
- QA automation
- RPA
- Accessibility tooling

## Notes

- These examples intentionally use raw `fetch` and `requests` calls so you can see the full BeakVision contract.
- Replace the placeholder host in `.env.example` with your deployed or hosted BeakVision parse endpoint.
- The GIFs live in `assets/` so you can swap them with fresh playground captures anytime.
