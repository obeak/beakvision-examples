import "dotenv/config";
import { chromium } from "playwright";
import { parseScreenshot } from "../lib/beakvision.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(required("TARGET_URL"), { waitUntil: "networkidle" });

  const image = (await page.screenshot({ type: "png" })).toString("base64");
  const result = await parseScreenshot({
    imageBase64: image,
    mode: "computer",
    goal: "Decide the next action needed to reach checkout and describe if the page looks blocked.",
    context: "QA watchdog. Flag overlays, disabled buttons, cookie banners, and modal blockers.",
  });

  console.log(JSON.stringify({
    thought: result.data.action?.thought,
    suggested_actions: result.data.suggested_actions,
    element_count: result.data.elements.length,
    top_elements: result.data.elements.slice(0, 5),
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
