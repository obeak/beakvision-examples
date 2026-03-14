import "dotenv/config";
import { readFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { parseScreenshot, ParsedAction } from "./lib/beakvision.js";

const execFile = promisify(execFileCallback);

type Point = { x: number; y: number };
type ActionRecord = {
  step: number;
  action: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

async function run(command: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFile(command, args);
  const text = `${stdout}${stderr}`.trim();
  return text;
}

async function ensureAccessibilityAccess(dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }

  try {
    await run("osascript", [
      "-e",
      'tell application "System Events" to count processes',
    ]);
  } catch {
    throw new Error(
      "macOS Accessibility access is required. Enable it for the terminal app you are using, then rerun the mac_desktop_agent example."
    );
  }
}

async function activateApp(appName: string): Promise<void> {
  await run("open", ["-a", appName]);
  const delayMs = Number(process.env.MACOS_ACTIVATE_DELAY_MS ?? "1200");
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function desktopBounds(): Promise<{ width: number; height: number }> {
  const output = await run("osascript", [
    "-e",
    'tell application "Finder" to get bounds of window of desktop',
  ]);
  const values = output.split(",").map((value) => Number(value.trim()));
  return {
    width: values[2] - values[0],
    height: values[3] - values[1],
  };
}

async function screenshotDesktop(path: string): Promise<{ imageBase64: string; pixelWidth: number; pixelHeight: number }> {
  try {
    await execFile("screencapture", ["-x", path]);
  } catch {
    throw new Error(
      "macOS Screen Recording permission is required. Enable it for the terminal app you are using, then rerun the mac_desktop_agent example."
    );
  }
  const imageBase64 = (await readFile(path)).toString("base64");
  const info = await run("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path]);
  const widthMatch = info.match(/pixelWidth:\s+(\d+)/);
  const heightMatch = info.match(/pixelHeight:\s+(\d+)/);
  if (!widthMatch || !heightMatch) {
    throw new Error("Could not determine screenshot dimensions.");
  }

  return {
    imageBase64,
    pixelWidth: Number(widthMatch[1]),
    pixelHeight: Number(heightMatch[1]),
  };
}

function scalePoint(point: Point, screenshot: { pixelWidth: number; pixelHeight: number }, desktop: { width: number; height: number }): Point {
  return {
    x: Math.round(point.x * (desktop.width / screenshot.pixelWidth)),
    y: Math.round(point.y * (desktop.height / screenshot.pixelHeight)),
  };
}

async function perform(action: ParsedAction, screenshot: { pixelWidth: number; pixelHeight: number }, desktop: { width: number; height: number }, dryRun: boolean): Promise<void> {
  const start = scalePoint(action.point, screenshot, desktop);
  const end = action.end_point ? scalePoint(action.end_point, screenshot, desktop) : undefined;

  const commandArgs = (() => {
    switch (action.type) {
      case "click":
        return [`c:${start.x},${start.y}`];
      case "left_double":
        return [`dc:${start.x},${start.y}`];
      case "right_single":
        return [`rc:${start.x},${start.y}`];
      case "drag":
        if (!end) {
          throw new Error("Drag action missing end_point");
        }
        return [`dd:${start.x},${start.y}`, `du:${end.x},${end.y}`];
      case "scroll":
        return action.direction === "up" ? ["kp:page-up"] : ["kp:page-down"];
      case "type":
        return [`c:${start.x},${start.y}`, `t:${action.text ?? ""}`];
      case "hotkey":
        if (!action.key) {
          throw new Error("Hotkey action missing key");
        }
        const keys = action.key.split(/\s+/).join(",");
        return [`kd:${keys}`, `ku:${keys}`];
      case "wait":
        return ["w:5000"];
      case "finished":
        return [];
      default:
        throw new Error(`Unsupported macOS action type: ${action.type}`);
    }
  })();

  if (!commandArgs.length) {
    return;
  }

  if (dryRun) {
    console.log(`DRY RUN cliclick ${commandArgs.join(" ")}`);
    return;
  }

  await execFile("cliclick", commandArgs);
}

async function buildContext(step: number, history: ActionRecord[]): Promise<string> {
  const successHint = optional("BEAKVISION_SUCCESS_HINT") ?? "If the requested desktop state is already visible, return finished.";
  const priorActions = history.length
    ? history.map((entry) => `- step ${entry.step}: ${entry.action}`).join("\n")
    : "- none yet";

  return [
    "macOS desktop automation loop.",
    `Current step: ${step}`,
    `Success criteria: ${successHint}`,
    "You are looking at a native macOS desktop screenshot. If the target state is already achieved, return finished.",
    `Prior actions:\n${priorActions}`,
  ].join("\n\n");
}

async function main() {
  const appName = required("MACOS_APP_NAME");
  const goal = required("BEAKVISION_GOAL");
  const maxSteps = Number(process.env.BEAKVISION_MAX_STEPS ?? "6");
  const dryRun = process.env.MACOS_DRY_RUN === "true";
  const screenshotPath = process.env.MACOS_SCREENSHOT_PATH ?? "/tmp/beakvision-macos.png";

  await ensureAccessibilityAccess(dryRun);
  await activateApp(appName);

  const desktop = await desktopBounds();
  const history: ActionRecord[] = [];

  for (let step = 1; step <= maxSteps; step += 1) {
    const screenshot = await screenshotDesktop(screenshotPath);
    const result = await parseScreenshot({
      imageBase64: screenshot.imageBase64,
      mode: "computer",
      goal,
      context: await buildContext(step, history),
    });

    const action = result.data.action;
    console.log(`\nStep ${step}`);
    console.log(`Thought: ${action?.thought ?? "(none)"}`);
    console.log(`Suggested actions: ${result.data.suggested_actions.join(", ")}`);

    if (!action || action.type === "finished") {
      console.log("BeakVision marked the macOS workflow as complete.");
      break;
    }

    history.push({
      step,
      action: result.data.suggested_actions[0] ?? action.type,
    });

    await perform(action, screenshot, desktop, dryRun);
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
