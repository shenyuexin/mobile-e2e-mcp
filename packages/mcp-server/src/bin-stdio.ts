#!/usr/bin/env node

import process from "node:process";
import { runUnifiedCli } from "./cli/unified-cli.js";

runUnifiedCli(process.argv.slice(2))
  .then((exitCode) => {
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
