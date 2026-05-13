/**
 * Minimal jest-compatible runner so we can verify ratingService.test.js
 * without adding jest as a dependency. Only supports the subset used by
 * the rating tests: describe, test, beforeEach, expect with these matchers:
 *   toBe, toBeCloseTo, toBeGreaterThan, toBeGreaterThanOrEqual,
 *   toBeLessThan, toBeLessThanOrEqual, toBeNull, toBeDefined.
 *
 * Usage: node tests/runTests.js [path/to/test/file.js]
 */
import path from "node:path";
import url from "node:url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stats = { passed: 0, failed: 0, failures: [] };
const groupStack = [];
let currentBeforeEach = null;
const beforeEachStack = [];

function fmtGroup() {
  return groupStack.join(" › ");
}

function expect(actual) {
  const fail = (msg) => {
    const e = new Error(msg);
    e._expectErr = true;
    throw e;
  };
  return {
    toBe(expected) {
      if (!Object.is(actual, expected))
        fail(`Expected ${actual} to be ${expected}`);
    },
    toBeCloseTo(expected, digits = 2) {
      const tolerance = Math.pow(10, -digits) / 2;
      if (Math.abs(actual - expected) > tolerance)
        fail(`Expected ${actual} to be close to ${expected} (±${tolerance})`);
    },
    toBeGreaterThan(n) {
      if (!(actual > n)) fail(`Expected ${actual} > ${n}`);
    },
    toBeGreaterThanOrEqual(n) {
      if (!(actual >= n)) fail(`Expected ${actual} >= ${n}`);
    },
    toBeLessThan(n) {
      if (!(actual < n)) fail(`Expected ${actual} < ${n}`);
    },
    toBeLessThanOrEqual(n) {
      if (!(actual <= n)) fail(`Expected ${actual} <= ${n}`);
    },
    toBeNull() {
      if (actual !== null) fail(`Expected ${actual} to be null`);
    },
    toBeDefined() {
      if (actual === undefined) fail(`Expected value to be defined`);
    },
  };
}

function describe(name, fn) {
  groupStack.push(name);
  beforeEachStack.push([]);
  fn();
  beforeEachStack.pop();
  groupStack.pop();
}

function test(name, fn) {
  const fullName = `${fmtGroup()} › ${name}`;
  try {
    for (const stack of beforeEachStack) {
      for (const hook of stack) hook();
    }
    fn();
    stats.passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    stats.failed++;
    stats.failures.push({ name: fullName, err });
    console.log(`  \u2717 ${name}`);
    if (err && err.message) console.log(`      ${err.message}`);
  }
}

function beforeEach(fn) {
  beforeEachStack[beforeEachStack.length - 1].push(fn);
}

globalThis.describe = describe;
globalThis.test = test;
globalThis.it = test;
globalThis.beforeEach = beforeEach;
globalThis.expect = expect;

const target = process.argv[2] || path.join(__dirname, "ratingService.test.js");
const targetUrl = url.pathToFileURL(path.resolve(target)).href;

console.log(`Running ${target}\n`);
await import(targetUrl);

console.log(`\n${stats.passed} passed, ${stats.failed} failed`);
if (stats.failed > 0) {
  console.log("\nFailures:");
  for (const f of stats.failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.err.stack || f.err.message}`);
  }
  process.exit(1);
}
