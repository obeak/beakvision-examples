import "dotenv/config";
import { chromium, Page } from "playwright";
import { parseScreenshot, ParsedAction } from "./lib/beakvision.js";

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
  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(targetUrl, { waitUntil: "networkidle" });

  for (let step = 1; step <= 12; step += 1) {
    const result = await parseScreenshot({
      imageBase64: await screenshotBase64(page),
      mode: "computer",
      goal,
      context: `Browser automation loop. Current URL: ${page.url()}. Step ${step}.`,
    });

    const action = result.data.action;
    console.log(`\nStep ${step}`);
    console.log(`Thought: ${action?.thought ?? "(none)"}`);
    console.log(`Suggested actions: ${result.data.suggested_actions.join(", ")}`);

    if (!action || action.type === "finished") {
      console.log("BeakVision marked the task as complete.");
      break;
    }

    await perform(page, action);
    await page.waitForTimeout(900);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
