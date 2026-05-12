/**
 * Tests for Markdown report template rendering.
 *
 * Validates that the generated Markdown includes correct structure and values.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateMarkdown } from '../../src/report/markdown.js';
import { inferModules } from '../../src/report/modules.js';
import type { ExplorerConfig, FailureEntry, PageEntry } from '../../src/types.js';

function makePage(id: string, depth: number, path: string[], hasFailure = false, loadTimeMs = 100): PageEntry {
  return {
    id,
    screenId: `screen-${id}`,
    screenTitle: id,
    depth,
    path,
    arrivedFrom: null,
    viaElement: null,
    loadTimeMs,
    clickableCount: 5,
    hasFailure,
  };
}

function makeFailure(pageScreenId: string, elementLabel = 'btn'): FailureEntry {
  return {
    pageScreenId,
    elementLabel,
    failureType: 'TAP_FAILED',
    retryCount: 1,
    errorMessage: 'tap failed',
    depth: 1,
    path: ['some-path'],
  };
}

const mockConfig: ExplorerConfig = {
  mode: 'scoped',
  auth: { type: 'skip-auth' },
  failureStrategy: 'retry-3',
  maxDepth: 8,
  maxPages: 100,
  timeoutMs: 300_000,
  compareWith: null,
  platform: 'ios-simulator',
  destructiveActionPolicy: 'skip',
  appId: 'com.example.app',
  reportDir: '/tmp/reports',
};

describe('generateMarkdown', () => {
  it('includes overview table with correct values', () => {
    const pages = [makePage('p1', 0, []), makePage('p2', 1, ['p1'])];
    const failures: FailureEntry[] = [];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, failures, modules, mockConfig, {
      partial: false,
      durationMs: 120_000,
    });

    assert.ok(md.includes('# APP Exploration Report — com.example.app'));
    assert.ok(md.includes('| Total Pages | 2 |'));
    assert.ok(md.includes('| Max Depth | 1 |'));
    assert.ok(md.includes('| Platform | ios-simulator |'));
    assert.ok(md.includes('| Mode | scoped |'));
  });

  it('partial report includes PARTIAL REPORT prefix', () => {
    const pages = [makePage('p1', 0, [])];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: true,
      abortReason: 'Timeout',
      durationMs: 5000,
    });

    assert.ok(md.includes('# ⚠️ PARTIAL REPORT'));
    assert.ok(md.includes('> **Aborted:** Timeout'));
  });

  it('module breakdown groups pages correctly', () => {
    const pages = [
      makePage('p1', 0, []),
      makePage('p2', 1, ['Settings']),
      makePage('p3', 1, ['Settings']),
    ];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });

    assert.ok(md.includes('## Module Breakdown'));
    assert.ok(md.includes('### Home (1 pages)'));
    assert.ok(md.includes('### Settings (2 pages)'));
    assert.ok(md.includes('| Page | Depth | Path | Status |'));
  });

  it('failure section lists all failures', () => {
    const pages = [makePage('p1', 0, []), makePage('p2', 1, ['p1'], true)];
    const failures = [
      makeFailure('screen-p2', 'submit-btn'),
      makeFailure('screen-p2', 'cancel-btn'),
    ];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, failures, modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });

    assert.ok(md.includes('## Alerts'));
    assert.ok(md.includes('[failure-review.md](./failure-review.md)'));
    assert.ok(md.includes('### ❌ Failed Pages (2)'));
    assert.ok(md.includes('submit-btn'));
    assert.ok(md.includes('cancel-btn'));
  });

  it('slow pages section appears only when pages exceed 5s threshold', () => {
    // No slow pages
    const pages1 = [makePage('p1', 0, [], false, 1000)];
    const modules1 = inferModules(pages1);
    const md1 = generateMarkdown(pages1, [], modules1, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.ok(!md1.includes('### ⚠️ Slow Pages'));

    // With slow pages
    const pages2 = [makePage('p1', 0, [], false, 6000)];
    const modules2 = inferModules(pages2);
    const md2 = generateMarkdown(pages2, [], modules2, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    assert.ok(md2.includes('### ⚠️ Slow Pages (load > 5s)'));
    assert.ok(md2.includes('6000ms'));
  });

  it('escapes pipe characters in markdown table cells', () => {
    const pages = [makePage('Screen | Title', 0, ['Module | A'])];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });
    // Pipes should be escaped in table cells
    assert.ok(md.includes('Screen \\| Title'));
    assert.ok(md.includes('Module \\| A'));
  });

  it('includes rule decision section with escaped examples', () => {
    const page = makePage('Help | FAQ', 1, ['Settings', 'Help | FAQ']);
    page.ruleDecision = {
      ruleId: 'default.element.help.low-value-skip',
      category: 'low-value-content',
      action: 'skip-element',
      reason: 'Help | FAQ pages are low value',
      source: 'default',
      path: ['Settings', 'Help | FAQ'],
      screenTitle: 'Help | FAQ',
      elementLabel: 'Help | FAQ',
    };
    const modules = inferModules([page]);
    const md = generateMarkdown([page], [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });

    assert.ok(md.includes('## Rule Decisions'));
    assert.ok(md.includes('default.element.help.low-value-skip'));
    assert.ok(md.includes('Help \\| FAQ pages are low value'));
  });

  it('explains rule decisions with summaries, top reasons, and support context', () => {
    const page = makePage('Settings', 1, ['Settings']);
    page.ruleDecisions = [
      {
        ruleId: 'default.element.help.low-value-skip',
        category: 'low-value-content',
        action: 'skip-element',
        reason: 'Help pages are low value',
        source: 'default',
        path: ['Settings', 'Help'],
        elementLabel: 'Help',
        supportLevel: 'contract-ready',
      },
      {
        ruleId: 'project.element.faq.low-value-skip',
        category: 'low-value-content',
        action: 'skip-element',
        reason: 'Help pages are low value',
        source: 'project-config',
        path: ['Settings', 'FAQ'],
        elementLabel: 'FAQ',
        supportLevel: 'experimental',
        caveat: 'Project-specific wording only',
      },
      {
        ruleId: 'default.page.account.stateful-gate',
        category: 'stateful-form',
        action: 'gate-page',
        reason: 'Account settings can modify user state',
        source: 'default',
        path: ['Settings', 'Account'],
        screenTitle: 'Account',
        recoveryMethod: 'navigate_back',
        supportLevel: 'contract-ready',
      },
    ];
    const modules = inferModules([page]);
    const md = generateMarkdown([page], [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
    });

    assert.ok(md.includes('Total recorded rule decisions: 3'));
    assert.ok(md.includes('### Decision Summary'));
    assert.ok(md.includes('| skip-element | low-value-content | 2 |'));
    assert.ok(md.includes('| gate-page | stateful-form | 1 |'));
    assert.ok(md.includes('### Top Skip Reasons'));
    assert.ok(md.includes('| 2 | skip-element | low-value-content | Help pages are low value |'));
    assert.ok(md.includes('### Decision Examples'));
    assert.ok(md.includes('project-config'));
    assert.ok(md.includes('experimental'));
    assert.ok(md.includes('navigate_back'));
    assert.ok(md.includes('Project-specific wording only'));
  });

  it('includes a detailed sampling report when sampling metadata is present', () => {
    const pages = [makePage('Fonts', 1, ['General', 'Fonts'])];
    const modules = inferModules(pages);
    const md = generateMarkdown(pages, [], modules, mockConfig, {
      partial: false,
      durationMs: 5000,
      sampling: {
        appliedPages: ['screen-Fonts'],
        skippedChildren: 2,
        details: {
          'screen-Fonts': {
            screenTitle: 'Fonts',
            totalChildren: 3,
            exploredChildren: 1,
            skippedChildren: 2,
            exploredLabels: ['Academy Engraved LET'],
            skippedLabels: ['Al Nile', 'Apple Braille'],
          },
        },
      },
    });

    assert.ok(md.includes('## Sampling Report'));
    assert.ok(md.includes('| Sampled Pages | 1 |'));
    assert.ok(md.includes('| Skipped Children | 2 |'));
    assert.ok(md.includes('| Fonts | 3 | 1 | 2 | Academy Engraved LET | Al Nile, Apple Braille |'));
    assert.ok(md.includes('Sampling indicates intentional bounded coverage, not an unexplored traversal failure.'));
  });
});
