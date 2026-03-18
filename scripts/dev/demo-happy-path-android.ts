import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "../../packages/mcp-server/src/index.ts";

const execFileAsync = promisify(execFile);

interface StepResult {
  status: string;
  reasonCode?: string;
  data?: {
    screenSummary?: {
      screenTitle?: string;
      topVisibleTexts?: string[];
    };
  };
  nextSuggestions?: string[];
}

function toStepResult(value: unknown): StepResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("Tool result is not an object.");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.status !== "string") {
    throw new Error("Tool result missing status field.");
  }
  return candidate as unknown as StepResult;
}

function ensureStep(stepName: string, result: StepResult, accepted: ReadonlyArray<string> = ["success"]): void {
  if (!accepted.includes(result.status)) {
    const reason = result.reasonCode ? ` (${result.reasonCode})` : "";
    const suggestions = result.nextSuggestions?.join(" | ") ?? "";
    throw new Error(`${stepName} failed: ${result.status}${reason}${suggestions ? `; suggestions: ${suggestions}` : ""}`);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryTapAddToCart(sessionBase: {
  sessionId: string;
  platform: "android";
  runnerProfile: "native_android";
  deviceId: string;
  appId: string;
}): Promise<{ picked: string; result: StepResult }> {
  const server = createServer();
  const candidates = [
    "Add to cart Xiaomi POCO X4 PRO 5G",
    "Add to cart Asus ROG",
    "Add to cart Samsung Galaxy S10+ Plus 128GB",
    "Add to cart Samsung Galaxy S21 Ultra 5G 128GB",
  ];

  for (const contentDesc of candidates) {
    const raw = await server.invoke("tap_element", { ...sessionBase, contentDesc });
    const result = toStepResult(raw);
    if (result.status === "success") {
      return { picked: contentDesc, result };
    }
  }

  throw new Error("Unable to find a visible 'Add to cart' button after scrolling.");
}

function expectedCartKeywordFromAction(contentDesc: string): string {
  if (contentDesc.includes("Xiaomi POCO X4 PRO 5G")) return "Xiaomi POCO X4 PRO 5G";
  if (contentDesc.includes("Asus ROG")) return "Asus ROG";
  if (contentDesc.includes("Samsung Galaxy S10+ Plus 128GB")) return "Samsung Galaxy S10+ Plus 128GB";
  if (contentDesc.includes("Samsung Galaxy S21 Ultra 5G 128GB")) return "Samsung Galaxy S21 Ultra 5G 128GB";
  return contentDesc;
}

async function main(): Promise<void> {
  const deviceId = process.env.DEVICE_ID ?? "10AEA40Z3Y000R5";
  const appId = process.env.APP_ID ?? "com.epam.mobitru";
  const sessionId = process.env.SESSION_ID ?? `happy-path-${Date.now()}`;
  const server = createServer();
  const base = {
    sessionId,
    platform: "android" as const,
    runnerProfile: "native_android" as const,
    deviceId,
    appId,
  };

  const start = toStepResult(await server.invoke("start_session", {
    sessionId,
    platform: "android",
    deviceId,
    profile: "native_android",
    policyProfile: "sample-harness-default",
  }));
  ensureStep("start_session", start);

  const reset = toStepResult(await server.invoke("reset_app_state", {
    ...base,
    strategy: "clear_data",
  }));
  ensureStep("reset_app_state", reset);

  const launch = toStepResult(await server.invoke("launch_app", base));
  ensureStep("launch_app", launch);
  await sleep(1500);

  const quickLogin = toStepResult(await server.invoke("tap_element", {
    ...base,
    resourceId: "com.epam.mobitru:id/type_and_login",
  }));
  ensureStep("tap_element(type_and_login)", quickLogin);
  await sleep(2600);

  await execFileAsync("adb", ["-s", deviceId, "shell", "input", "swipe", "630", "2200", "630", "1000", "800"]);
  await sleep(1200);
  await execFileAsync("adb", ["-s", deviceId, "shell", "input", "swipe", "630", "2200", "630", "1000", "800"]);
  await sleep(2800);

  const scrolledSummary = toStepResult(await server.invoke("get_screen_summary", base));
  ensureStep("get_screen_summary(after_scroll)", scrolledSummary);

  const addToCart = await tryTapAddToCart(base);
  await sleep(1300);

  const orders = toStepResult(await server.invoke("tap_element", {
    ...base,
    contentDesc: "Orders",
  }));
  ensureStep("tap_element(Orders)", orders);
  await sleep(1400);

  const cart = toStepResult(await server.invoke("tap_element", {
    ...base,
    resourceId: "com.epam.mobitru:id/cart_title",
  }));
  ensureStep("tap_element(cart_title)", cart);
  await sleep(2200);

  const finalSummary = toStepResult(await server.invoke("get_screen_summary", base));
  ensureStep("get_screen_summary(cart)", finalSummary);

  const expectedKeyword = expectedCartKeywordFromAction(addToCart.picked);
  const finalTexts = finalSummary.data?.screenSummary?.topVisibleTexts ?? [];
  const cartContainsExpected = finalTexts.some((value) => value.includes(expectedKeyword));
  if (!cartContainsExpected) {
    throw new Error(`Cart does not show expected item '${expectedKeyword}'. Top texts: ${finalTexts.join(" | ")}`);
  }

  const end = toStepResult(await server.invoke("end_session", { sessionId }));
  ensureStep("end_session", end);

  console.log(JSON.stringify({
    sessionId,
    deviceId,
    appId,
    flow: [
      "launch_app",
      "quick_login(type_and_login)",
      "swipe_up_twice",
      "pause",
      "add_to_cart",
      "open_orders_tab",
      "open_cart",
    ],
    addToCartPicked: addToCart.picked,
    cartExpectedKeyword: expectedKeyword,
    cartContainsExpected,
    scrolledTopVisibleTexts: scrolledSummary.data?.screenSummary?.topVisibleTexts?.slice(0, 8) ?? [],
    finalScreenTitle: finalSummary.data?.screenSummary?.screenTitle,
    finalTopVisibleTexts: finalSummary.data?.screenSummary?.topVisibleTexts?.slice(0, 8) ?? [],
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[demo-happy-path-android] ${message}`);
  process.exitCode = 1;
});
