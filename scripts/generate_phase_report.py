#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime


ROOT = Path("/Users/linan/Documents/mobile-e2e-mcp")
ARTIFACT_ROOTS = {
    "ios": ROOT / "artifacts/phase1-ios",
    "android": ROOT / "artifacts/phase1-android",
}
REPORT_DIR = ROOT / "reports"
JSON_OUT = REPORT_DIR / "phase-sample-report.json"
MD_OUT = REPORT_DIR / "phase-sample-report.md"


def collect_platform(platform: str, root: Path) -> dict:
    runs = []
    for run_dir in sorted(p for p in root.glob("run-*") if p.is_dir()):
        result_file = run_dir / "result.txt"
        maestro_out = run_dir / "maestro.out"
        result = result_file.read_text().strip() if result_file.exists() else "MISSING"
        runs.append(
            {
                "run": run_dir.name,
                "result": result,
                "maestro_out": str(maestro_out.relative_to(ROOT)) if maestro_out.exists() else None,
                "final_image": str((run_dir / "final.jpg").relative_to(ROOT)) if (run_dir / "final.jpg").exists() else None,
            }
        )

    total = len(runs)
    passed = sum(1 for run in runs if run["result"] == "PASS")
    pass_rate = 0.0 if total == 0 else passed / total
    return {
        "platform": platform,
        "total_runs": total,
        "passed_runs": passed,
        "pass_rate": round(pass_rate, 4),
        "status": "GO" if total > 0 and pass_rate >= 0.95 else "NO_GO",
        "runs": runs,
    }


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "phase": "Phase 2 baseline report",
        "sample": "rn-login-demo",
        "platforms": [collect_platform(platform, root) for platform, root in ARTIFACT_ROOTS.items()],
    }

    JSON_OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    lines = [
        "# Sample Phase Report",
        "",
        f"Generated at: {report['generated_at']}",
        "",
        "| Platform | Passed | Total | Pass Rate | Status |",
        "|---|---:|---:|---:|---|",
    ]
    for platform in report["platforms"]:
        lines.append(
            f"| {platform['platform']} | {platform['passed_runs']} | {platform['total_runs']} | {platform['pass_rate']:.0%} | {platform['status']} |"
        )
    lines.extend(["", "## Run Details", ""])
    for platform in report["platforms"]:
        lines.append(f"### {platform['platform']}")
        lines.append("")
        for run in platform["runs"]:
            lines.append(
                f"- {run['run']}: {run['result']} (out: {run['maestro_out'] or 'n/a'}, image: {run['final_image'] or 'n/a'})"
            )
        lines.append("")
    MD_OUT.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
