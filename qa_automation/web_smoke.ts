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
  const [primaryCta, accountMenu] = await Promise.all([
    parseScreenshot({
      imageBase64: image,
      mode: "ground",
      goal: "the primary call to action button",
      context: "Smoke test for a public marketing page.",
    }),
    parseScreenshot({
      imageBase64: image,
      mode: "ground",
      goal: "the account or sign in button",
      context: "Smoke test for a public marketing page.",
    }),
  ]);

  console.log(JSON.stringify({
    primary_cta: primaryCta.data.action?.point,
    account_button: accountMenu.data.action?.point,
    coordinate_space: primaryCta.data.coordinate_space,
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
