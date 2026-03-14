import "dotenv/config";
import { chromium, Page } from "playwright";
import { parseScreenshot, ParsedAction } from "./lib/beakvision.js";

type ActionRecord = {
  step: number;
  url: string;
  action: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function screenshotBase64(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: "png", fullPage: false });
  return buffer.toString("base64");
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

async function visibleTextSnippets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("h1, h2, h3, button, a, [role='button']"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
      .filter(Boolean);
    return candidates.slice(0, 12);
  });
}

async function workflowIsComplete(page: Page): Promise<{ done: boolean; reason?: string }> {
  const urlContains = optional("BEAKVISION_SUCCESS_URL_CONTAINS");
  if (urlContains && page.url().includes(urlContains)) {
    return { done: true, reason: `URL contains "${urlContains}"` };
  }

  const textContains = optional("BEAKVISION_SUCCESS_TEXT_CONTAINS");
  if (textContains) {
    const pageText = await page.evaluate(() => document.body?.innerText || "");
    if (pageText.includes(textContains)) {
      return { done: true, reason: `Page text contains "${textContains}"` };
    }
  }

  const selector = optional("BEAKVISION_SUCCESS_SELECTOR");
  if (selector && await page.locator(selector).count()) {
    return { done: true, reason: `Selector matched: ${selector}` };
  }

  return { done: false };
}

async function buildContext(page: Page, step: number, history: ActionRecord[]): Promise<string> {
  const url = page.url();
  const textSnippets = await visibleTextSnippets(page);
  const successChecks = [
    optional("BEAKVISION_SUCCESS_URL_CONTAINS")
      ? `URL contains: ${optional("BEAKVISION_SUCCESS_URL_CONTAINS")}`
      : null,
    optional("BEAKVISION_SUCCESS_TEXT_CONTAINS")
      ? `Visible page text contains: ${optional("BEAKVISION_SUCCESS_TEXT_CONTAINS")}`
      : null,
    optional("BEAKVISION_SUCCESS_SELECTOR")
      ? `DOM selector exists: ${optional("BEAKVISION_SUCCESS_SELECTOR")}`
      : null,
  ].filter(Boolean);

  const priorActions = history.length
    ? history.map((entry) => `- step ${entry.step}: ${entry.action} @ ${entry.url}`).join("\n")
    : "- none yet";

  return [
    "Browser automation loop.",
    `Current URL: ${url}`,
    `Current step: ${step}`,
    successChecks.length
      ? `Success criteria:\n${successChecks.map((line) => `- ${line}`).join("\n")}`
      : "Success criteria:\n- When the target state is already visible, return finished.",
    "If the success criteria are already met on this screenshot, return finished instead of repeating an earlier click.",
    `Recent visible labels:\n${textSnippets.map((line) => `- ${line}`).join("\n") || "- none"}`,
    `Prior actions:\n${priorActions}`,
  ].join("\n\n");
}

async function perform(page: Page, action: ParsedAction): Promise<void> {
  switch (action.type) {
    case "click":
      await page.mouse.click(action.point.x, action.point.y);
      return;
    case "left_double":
      await page.mouse.dblclick(action.point.x, action.point.y);
      return;
    case "right_single":
      await page.mouse.click(action.point.x, action.point.y, { button: "right" });
      return;
    case "drag":
      if (!action.end_point) {
        throw new Error("Drag action missing end_point");
      }
      await page.mouse.move(action.point.x, action.point.y);
      await page.mouse.down();
      await page.mouse.move(action.end_point.x, action.end_point.y, { steps: 15 });
      await page.mouse.up();
      return;
    case "scroll":
      await page.mouse.move(action.point.x, action.point.y);
      await page.mouse.wheel(0, action.direction === "up" ? -700 : 700);
      return;
    case "type":
      await page.mouse.click(action.point.x, action.point.y);
      await page.keyboard.type(action.text ?? "");
      return;
    case "hotkey":
      if (!action.key) {
        throw new Error("Hotkey action missing key");
      }
      for (const key of action.key.split(/\s+/)) {
        await page.keyboard.down(key);
      }
      for (const key of action.key.split(/\s+/).reverse()) {
        await page.keyboard.up(key);
      }
      return;
    case "wait":
      await page.waitForTimeout(5000);
      return;
    case "finished":
      return;
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

async function main() {
  const goal = required("BEAKVISION_GOAL");
  const targetUrl = required("TARGET_URL");
  const maxSteps = Number(process.env.BEAKVISION_MAX_STEPS ?? "12");
  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  let lastActionSignature = "";
  let repeatedActionCount = 0;
  const history: ActionRecord[] = [];

  for (let step = 1; step <= maxSteps; step += 1) {
    const completion = await workflowIsComplete(page);
    if (completion.done) {
      console.log(`Workflow complete before step ${step}: ${completion.reason}`);
      break;
    }

    const context = await buildContext(page, step, history);
    const result = await parseScreenshot({
      imageBase64: await screenshotBase64(page),
      mode: "computer",
      goal,
      context,
    });

    const action = result.data.action;
    console.log(`\nStep ${step}`);
    console.log(`URL: ${page.url()}`);
    console.log(`Thought: ${action?.thought ?? "(none)"}`);
    console.log(`Suggested actions: ${result.data.suggested_actions.join(", ")}`);

    if (!action || action.type === "finished") {
      console.log("BeakVision marked the task as complete.");
      break;
    }

    const actionSignature = JSON.stringify({
      type: action.type,
      point: action.point,
      end_point: action.end_point,
      text: action.text,
      direction: action.direction,
      key: action.key,
    });

    repeatedActionCount = actionSignature === lastActionSignature
      ? repeatedActionCount + 1
      : 1;
    lastActionSignature = actionSignature;

    if (repeatedActionCount >= 3) {
      console.log("Stopping because BeakVision repeated the same action 3 times in a row.");
      break;
    }

    history.push({
      step,
      url: page.url(),
      action: result.data.suggested_actions[0] ?? action.type,
    });

    await perform(page, action);
    await page.waitForTimeout(900);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
