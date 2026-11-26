import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Machine-readable scaffold for docs/showcase/killer-demo-real-app.md.
 *
 * This is a dry-run contract: it checks that the showcase still documents two
 * 60-second workflows on real open-source apps and keeps the honest
 * `reproducible-demo` boundary. It never runs a device and never claims live
 * proof.
 */

export interface DemoPlan {
  id: string;
  title: string;
  appId: string;
  budgetSeconds: number;
  commandTokens: string[];
  outputs: string[];
}

export interface ShowcasePlan {
  proofLevel: "reproducible-demo";
  liveProofClaimed: false;
  deviceRequired: true;
  demos: DemoPlan[];
}

export const SHOWCASE_PLAN: ShowcasePlan = {
  proofLevel: "reproducible-demo",
  liveProofClaimed: false,
  deviceRequired: true,
  demos: [
    {
      id: "zero-script-ui-inspection",
      title: "Zero-script UI Inspection",
      appId: "org.wikipedia",
      budgetSeconds: 60,
      commandTokens: [
        "explore",
        "--export-flows",
        "audit",
        "--baseline-path",
        "--fail-on-regression",
        "diff",
        "report.html",
      ],
      outputs: ["diff.md", "report.html", "summary.json", "failure-review.md", "flows/"],
    },
    {
      id: "agent-closed-loop",
      title: "AI Coding Agent Closed Loop",
      appId: "org.joinmastodon.android",
      budgetSeconds: 60,
      commandTokens: [
        "--toolset core",
        "run",
        "--record-on-failure",
        "--suggest-heal",
        "audit_ui_surface",
        "explain_last_failure",
        "suggest_known_remediation",
        "--fail-on-regression",
      ],
      outputs: ["failure.mp4", "heal suggestion", "green regression pass"],
    },
  ],
};

export const SHOWCASE_DOC_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/showcase/killer-demo-real-app.md",
);

export function checkShowcaseDoc(docText: string, plan: ShowcasePlan = SHOWCASE_PLAN): string[] {
  const issues: string[] = [];
  if (plan.proofLevel !== "reproducible-demo" || plan.liveProofClaimed !== false) {
    issues.push("showcase must stay at reproducible-demo level with liveProofClaimed=false");
  }
  if (plan.demos.length !== 2) issues.push("expected exactly two 60-second demos");

  if (!/Proof level:\s*`reproducible-demo`/.test(docText)) {
    issues.push("doc must state its reproducible-demo proof level");
  }
  if (!/not live proof/i.test(docText)) {
    issues.push("doc must state that the on-device steps are not live proof");
  }

  for (const demo of plan.demos) {
    if (demo.budgetSeconds !== 60) {
      issues.push(`demo '${demo.id}' must have a 60-second budget`);
    }
    if (!docText.includes(`\`${demo.id}\``)) {
      issues.push(`doc must declare demo id '${demo.id}'`);
    }
    if (!docText.includes(demo.appId)) {
      issues.push(`doc must reference app id '${demo.appId}'`);
    }
    for (const token of demo.commandTokens) {
      if (!docText.includes(token)) {
        issues.push(`demo '${demo.id}' is missing command token '${token}'`);
      }
    }
  }
  return issues;
}

export function formatPlanSummary(plan: ShowcasePlan = SHOWCASE_PLAN): string {
  const lines = [
    `Proof level: ${plan.proofLevel} (live proof claimed: ${plan.liveProofClaimed})`,
    "",
  ];
  for (const demo of plan.demos) {
    lines.push(`- ${demo.id}: ${demo.title} — ${demo.budgetSeconds}s — ${demo.appId}`);
  }
  return lines.join("\n");
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  if (!existsSync(SHOWCASE_DOC_PATH)) {
    console.error(`Missing showcase doc: ${SHOWCASE_DOC_PATH}`);
    process.exitCode = 1;
  } else {
    const issues = checkShowcaseDoc(readFileSync(SHOWCASE_DOC_PATH, "utf8"));
    if (issues.length === 0) {
      console.log("Real-app killer demo dry-run contract passed.");
      console.log(formatPlanSummary());
    } else {
      console.error("Real-app killer demo dry-run contract failed:");
      for (const issue of issues) console.error(`  - ${issue}`);
      process.exitCode = 1;
    }
  }
}
