import assert from "node:assert/strict";
import test from "node:test";
import type { DeviceInfo } from "@mobile-e2e-mcp/contracts";
import {
  collectIosKeyboardDoctorChecks,
  enrichIosSimulatorDisplayMetadata,
  isNonLatinImeKeyboard,
  parseAppleKeyboardsOutput,
  parseAxeDisplaysOutput,
} from "../src/ios-simulator-env.ts";

test("parseAppleKeyboardsOutput parses plist arrays cleanly and detects non-Latin IMEs", () => {
  const raw = `(
    "zh_Hans-Pinyin@sw=Pinyin-Simplified;hw=ABC",
    "en_US@sw=QWERTY;hw=Automatic",
    "emoji@sw=Emoji"
)`;
  const parsed = parseAppleKeyboardsOutput(raw);
  assert.deepEqual(parsed, [
    "zh_Hans-Pinyin@sw=Pinyin-Simplified;hw=ABC",
    "en_US@sw=QWERTY;hw=Automatic",
    "emoji@sw=Emoji",
  ]);
  assert.equal(isNonLatinImeKeyboard(parsed[0]!), true);
  assert.equal(isNonLatinImeKeyboard(parsed[1]!), false);
});

test("collectIosKeyboardDoctorChecks warns on Pinyin-first keyboard and passes on en_US-first", async () => {
  const devices: DeviceInfo[] = [
    { id: "11111111-1111-1111-1111-111111111111", name: "LinkNotes-UT-M", platform: "ios", state: "Booted", available: true },
    { id: "22222222-2222-2222-2222-222222222222", name: "iPhone 18 Pro", platform: "ios", state: "Booted", available: true },
    { id: "33333333-3333-3333-3333-333333333333", name: "Shutdown Sim", platform: "ios", state: "Shutdown", available: false },
  ];

  const checks = await collectIosKeyboardDoctorChecks("/repo", devices, {
    execute: async (command) => {
      const udid = command[3];
      if (udid === "11111111-1111-1111-1111-111111111111") {
        return {
          exitCode: 0,
          stdout: '(\n "zh_Hans-Pinyin@sw=Pinyin-Simplified;hw=ABC",\n "en_US@sw=QWERTY;hw=Automatic"\n)',
          stderr: "",
        };
      }
      return {
        exitCode: 0,
        stdout: '(\n "en_US@sw=QWERTY;hw=Automatic"\n)',
        stderr: "",
      };
    },
  });

  assert.equal(checks.length, 2);
  assert.equal(checks[0]?.status, "warn");
  assert.match(checks[0]?.detail ?? "", /zh_Hans-Pinyin/);
  assert.equal(checks[1]?.status, "pass");
});

test("parseAxeDisplaysOutput and enrichIosSimulatorDisplayMetadata parse foldable iPhone Duo displays and hinge", async () => {
  const duoJson = JSON.stringify({
    command: "displays",
    data: {
      result: {
        activeScreen: {
          height: 669,
          id: 3,
          orientation: "landscape",
          role: "inner",
          rotation: 90,
          scale: 3,
          state: "on",
          uuid: "1EA78780-856D-4A99-984D-78C65553080C",
          width: 951,
        },
        hinge: { degrees: 180, mechanicalDegrees: 180, posture: "open" },
        otherScreens: [
          {
            height: 678,
            id: 1,
            role: "outer",
            scale: 3,
            state: "off",
            uuid: "92B705F8-8412-491F-92E4-D54CC879574B",
            width: 466,
          },
        ],
      },
    },
  });

  const parsed = parseAxeDisplaysOutput(duoJson);
  assert.equal(parsed?.activeScreen.width, 951);
  assert.equal(parsed?.activeScreen.height, 669);
  assert.equal(parsed?.activeScreen.role, "inner");
  assert.equal(parsed?.hinge?.posture, "open");
  assert.equal(parsed?.otherScreens?.length, 1);

  const enriched = await enrichIosSimulatorDisplayMetadata(
    "/repo",
    [
      { id: "566191C4-2003-4FAA-B224-257F21F9DE81", name: "iPhone Duo", platform: "ios", state: "Booted", available: true },
      { id: "00008101-000D482C1E78001E", name: "Physical", platform: "ios", state: "Connected", available: true },
    ],
    {
      execute: async () => ({ exitCode: 0, stdout: duoJson, stderr: "" }),
    },
  );
  assert.equal(enriched[0]?.displays?.activeScreen.orientation, "landscape");
  assert.equal(enriched[1]?.displays, undefined);
});
