---
name: openbeak-browser-agent
description: "AI-powered browser automation using OpenBeak vision API and Playwright. Use this skill when the user needs an intelligent agent to complete multi-step web tasks like signing up for a service, filling out complex forms, navigating multi-page workflows, purchasing items, booking appointments, or any task that requires understanding what's on screen and deciding what to do next. Triggers on: 'register on this site', 'sign up for', 'fill out the form at', 'complete this checkout', 'book an appointment', 'automate this web workflow', 'log into and do X', 'navigate this site and', or any complex browser task where the agent needs to see the page, reason about it, and take multiple sequential actions. Also use when the user says 'use openbeak' or 'use vision to browse'."
allowed-tools: Bash(python*:*), Read, Write
---

# OpenBeak Browser Agent

An intelligent browser automation agent that **sees** web pages through OpenBeak's vision API and **acts** on them through Playwright. This combination allows you to complete complex multi-step web tasks — registration flows, form filling, checkout processes — by analyzing screenshots and deciding what to do next, just like a human would.

## How It Works

The agent operates in a perception-action loop using Python Playwright for browser control and OpenBeak for visual understanding:

1. **Navigate** to the target URL with Playwright
2. **Screenshot** the current page
3. **Send the screenshot to OpenBeak** (`POST /v1/parse`) which returns:
   - A description of what's on screen
   - Detected UI elements with coordinates
   - A suggested next action with reasoning
4. **Execute the action** using Playwright's low-level APIs (mouse.click, keyboard.type)
5. **Repeat** until the task is complete

## Why Playwright + OpenBeak (not agent-browser)

Benchmarks show this combination outperforms DOM-based tools:

- **100% success rate** vs 40% for agent-browser across 5 tasks
- **Custom React inputs**: `keyboard.type()` bypasses framework abstractions that break `fill()`
- **Visual disambiguation**: When multiple buttons share the same label, vision reads surrounding context (prices, plan names) to pick the right one
- **State verification**: Screenshots confirm UI actually changed — DOM snapshots miss non-interactive labels and badges

## Setup

The OpenBeak API runs locally at `http://localhost:8787/`. The API key is:

```
bv_8fd221760f814c40453a985bfcfb23fc5aa2c19b2d3652b8b5fd7199256b3a1a
```

Ensure Python Playwright is installed:
```bash
pip install playwright
python -m playwright install chromium
```

## The Automation Loop

Write a Python script using this pattern for every task. The key: **always re-screenshot after every action**.

### Basic Template

```python
import json, base64, urllib.request
from playwright.sync_api import sync_playwright

OPENBEAK_URL = "http://localhost:8787/v1/parse"
API_KEY = "bv_8fd221760f814c40453a985bfcfb23fc5aa2c19b2d3652b8b5fd7199256b3a1a"

def openbeak_analyze(image_path, goal, mode="computer"):
    """Send screenshot to OpenBeak, get back action + reasoning."""
    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")
    payload = json.dumps({"image": image_b64, "mode": mode, "goal": goal}).encode()
    req = urllib.request.Request(OPENBEAK_URL, data=payload, headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }, method="POST")
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})

    # Step 1: Navigate
    page.goto("https://example.com")
    page.wait_for_load_state("networkidle")

    # Step 2: Screenshot
    page.screenshot(path="/tmp/step1.png")

    # Step 3: Ask OpenBeak what to do
    result = openbeak_analyze("/tmp/step1.png", "Click the Sign Up button")
    action = result["data"]["action"]
    print(f"Thought: {action['thought']}")
    print(f"Action: {action['type']} at ({action['point']['x']}, {action['point']['y']})")

    # Step 4: Execute
    page.mouse.click(action["point"]["x"], action["point"]["y"])
    page.wait_for_timeout(1500)

    # Step 5: Repeat — screenshot again, analyze again, act again
    page.screenshot(path="/tmp/step2.png")
    result = openbeak_analyze("/tmp/step2.png", "Fill in the email field with test@test.com")
    action = result["data"]["action"]
    page.mouse.click(action["point"]["x"], action["point"]["y"])
    page.wait_for_timeout(300)
    page.keyboard.type("test@test.com", delay=20)

    browser.close()
```

### Action Mapping

When OpenBeak returns an action, use these Playwright methods:

| OpenBeak Action | Playwright Command |
|---|---|
| `click` at (x, y) | `page.mouse.click(x, y)` |
| `type` with text | `page.mouse.click(x, y)` then `page.keyboard.type(text, delay=20)` |
| `scroll` down | `page.mouse.wheel(0, 500)` |
| `hotkey` (Enter, Tab) | `page.keyboard.press("Enter")` |
| `right_single` | `page.mouse.click(x, y, button="right")` |
| `left_double` | `page.mouse.dblclick(x, y)` |
| `drag` | `page.mouse.move(x1,y1)` then `down()` then `move(x2,y2)` then `up()` |
| `finished` | Task complete — take final screenshot to confirm |

### Important: Always use keyboard.type() for text input

Do NOT use `page.fill()` or `locator.fill()` — these fail on custom React/Vue input components. Instead:

1. **Click** the input at coordinates from OpenBeak
2. **Wait** briefly: `page.wait_for_timeout(300)`
3. **Type** via keyboard: `page.keyboard.type("your text", delay=20)`

This sends individual keystrokes to whatever element has focus, bypassing framework-level input handling.

## Helper Script

A ready-to-use helper is included at `scripts/analyze.py`:

```bash
python scripts/analyze.py \
  --image /tmp/screenshot.png \
  --goal "Click the sign up button" \
  --mode computer
```

Returns JSON with the action, thought, elements, and screen description.

## Modes

- **`computer`** (default): For desktop/browser screenshots. Returns click, type, scroll, hotkey, drag actions.
- **`mobile`**: For mobile viewports. Returns click, long_press, type, scroll actions.
- **`ground`**: Quick element localization. Give an element name, get coordinates. No reasoning.

## Tips

- **Always wait after navigation**: `page.wait_for_load_state("networkidle")` or `page.wait_for_timeout(1500)`
- **Re-screenshot after every action**: Page state changes — never reuse old screenshots
- **Use specific goals**: "Click the blue Submit button at the bottom" beats "Submit"
- **Scroll if needed**: If OpenBeak says an element isn't visible, `page.mouse.wheel(0, 500)` and re-screenshot
- **Verify success**: After completing a flow, screenshot + analyze one final time to confirm
- **Handle CAPTCHAs**: Inform the user if detected — automated solving isn't supported
- **Viewport matters**: Set `viewport={"width": 1280, "height": 720}` for consistent coordinate mapping
