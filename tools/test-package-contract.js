"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");

const root = path.join(__dirname, "..");
const playwrightVersion = "1.62.1";
const expectedDevDependencies = {playwright: playwrightVersion};
const expectedScripts = {
  start: "node server/index.js",
  test: "npm run test:core && npm run test:server && npm run test:scheduler",
  "test:luat": "node tools/smoke.js",
  "test:core": "node tools/smoke.js",
  "test:server": "node tools/test-server.js",
  "test:scheduler": "node --test tools/test-scheduler.js",
  "test:load": "node tools/test-tai.js 60",
  "test:ui": "node tools/test-mp-ui.mjs",
  "check:syntax": "node tools/check-syntax.js",
  lint: "node tools/lint.js",
  "check:version": "node tools/check-version.js",
  build: "node tools/build.js && node tools/build.js --artifact",
  "check:artifact": "node tools/check-artifact.js",
  "test:all": [
    "npm run check:syntax",
    "npm run lint",
    "npm run check:version",
    "npm run build",
    "npm run check:artifact",
    "npm run test:core",
    "npm run test:server",
    "npm run test:scheduler",
    "npm run test:load",
    "npm run test:ui"
  ].join(" && ")
};

function readLockfile() {
  const lockPath = path.join(root, "package-lock.json");
  return JSON.parse(fs.readFileSync(lockPath, "utf8"));
}

assert.equal(pkg.engines.node, ">=22.5");
assert.deepEqual(pkg.dependencies, {});
assert.deepEqual(pkg.devDependencies, expectedDevDependencies);
assert.equal(Object.hasOwn(pkg.dependencies, "playwright"), false);
assert.deepEqual(pkg.scripts, expectedScripts);

const lock = readLockfile();
assert.equal(lock.lockfileVersion, 3);
assert.deepEqual(lock.packages[""].dependencies || {}, {});
assert.deepEqual(lock.packages[""].devDependencies, expectedDevDependencies);
assert.equal(lock.packages["node_modules/playwright"].version, playwrightVersion);
assert.equal(lock.packages["node_modules/playwright"].dev, true);
