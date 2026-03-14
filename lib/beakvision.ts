export type BeakVisionMode = "mobile" | "computer" | "ground";

export type Point = { x: number; y: number };

export type ParsedAction = {
  type: string;
  point: Point;
  end_point?: Point;
  text?: string;
  direction?: string;
  key?: string;
  thought?: string;
};

export type ParseResponse = {
  success: boolean;
  data: {
    mode: BeakVisionMode;
    screen_description: string;
    layout_summary: string;
    elements: Array<{
      id: number;
      type: string;
      label: string;
      description: string;
      bounds: { x: number; y: number; width: number; height: number };
      center: Point;
      interactable: boolean;
      action_hint: string;
    }>;
    suggested_actions: string[];
    action?: ParsedAction;
    coordinate_space: { width: number; height: number };
  };
  meta?: Record<string, unknown>;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function parseUrl(): string {
  return required("BEAKVISION_PARSE_URL");
}

export function apiKey(): string {
  return required("BEAKVISION_API_KEY");
}

export async function parseScreenshot(params: {
  imageBase64: string;
  mode: BeakVisionMode;
  goal: string;
  context?: string;
}): Promise<ParseResponse> {
  const response = await fetch(parseUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      image: params.imageBase64,
      mode: params.mode,
      goal: params.goal,
      context: params.context,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BeakVision request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as ParseResponse;
}
