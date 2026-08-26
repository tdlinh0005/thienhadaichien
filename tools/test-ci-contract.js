"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const root = path.join(__dirname, "..");
const yml = fs.readFileSync(path.join(root, ".github", "workflows", "quality.yml"), "utf8");
const lockPath = path.join(root, "package-lock.json");
assert.ok(fs.existsSync(lockPath), "foundation Task 1 package-lock blocked by npm registry/cache");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const expectedTest = "npm run test:core && npm run test:server && npm run test:scheduler";
const expectedAll = [
  "npm run check:syntax", "npm run lint", "npm run check:version", "npm run build",
  "npm run check:artifact", "npm run test:core", "npm run test:server",
  "npm run test:scheduler", "npm run test:load", "npm run test:ui"
].join(" && ");
const qualityGate = [
  "node tools/test-ci-contract.js", "node tools/test-package-contract.js",
  "node tools/test-quality-gate.js",
  "node tools/check-syntax.js", "npm run lint", "node tools/test-version-contract.js",
  "npm run check:version"
].join(" && ");
const artifactGate = [
  "npm run build", "node tools/test-artifact.js", "npm run check:artifact",
  "git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html",
  "node tools/test-loader.js", "npm run test:core"
].join(" && ");
const serverGate = [
  "node tools/test-uow.js", "node tools/test-server-factory.js",
  "node tools/test-server-entrypoint.js", "npm run test:server", "npm run test:scheduler"
].join(" && ");
const jobsAt = yml.indexOf("\njobs:\n");
assert.ok(jobsAt >= 0, "missing jobs map");
const jobNames = Array.from(
  yml.slice(jobsAt).matchAll(/^  ([A-Za-z][A-Za-z0-9-]*):$/gm), match => match[1]
);
assert.deepEqual(jobNames, ["quality", "artifact-and-core", "server", "load", "ui"]);
function jobBlock(name) {
  const marker = "\n  " + name + ":\n";
  const start = yml.indexOf(marker);
  assert.ok(start >= 0, "missing job " + name);
  const bodyStart = start + marker.length;
  const next = yml.slice(bodyStart).search(/\n  [A-Za-z][A-Za-z0-9-]*:\n/);
  return next < 0 ? yml.slice(start) : yml.slice(start, bodyStart + next);
}
function assertMatrixJob(name) {
  const block = jobBlock(name);
  assert.match(block, /node:\s*\["22\.5\.x", "24\.x"\]/, name + " matrix");
  assert.match(block, /actions\/checkout@v4/, name + " checkout");
  assert.match(block, /actions\/setup-node@v4/, name + " setup-node");
  assert.match(block, /node-version:\s*"?\$\{\{\s*matrix\.node\s*\}\}"?/, name + " node variable");
  assert.match(block, /npm ci/, name + " npm ci");
  return block;
}
function assertNode24Job(name) {
  const block = jobBlock(name);
  assert.match(block, /actions\/checkout@v4/, name + " checkout");
  assert.match(block, /actions\/setup-node@v4/, name + " setup-node");
  assert.match(block, /node-version:\s*"24\.x"/, name + " Node 24.x");
  assert.match(block, /npm ci/, name + " npm ci");
  return block;
}
function runCommands(block) {
  const lines = block.split("\n"), commands = [];
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s+- run:\s*(.*)$/);
    if (!match) continue;
    if (match[1] !== ">-") {
      commands.push(match[1]);
      continue;
    }
    const parts = [];
    while (index + 1 < lines.length && /^\s{10,}\S/.test(lines[index + 1])) {
      parts.push(lines[++index].trim());
    }
    commands.push(parts.join(" "));
  }
  return commands;
}
assert.equal(pkg.engines.node, ">=22.5");
assert.deepEqual(pkg.dependencies, {});
assert.equal(pkg.scripts.test, expectedTest);
assert.equal(pkg.scripts["test:all"], expectedAll);
assert.deepEqual(pkg.devDependencies, {playwright: "1.62.1"});
assert.deepEqual(lock.packages[""].devDependencies, {playwright: "1.62.1"});
assert.equal(lock.packages["node_modules/playwright"].version, "1.62.1");
assert.equal(lock.packages["node_modules/playwright"].dev, true);

const quality = assertMatrixJob("quality");
const artifact = assertMatrixJob("artifact-and-core");
const server = assertMatrixJob("server");
const load = assertNode24Job("load");
const ui = assertNode24Job("ui");
const browserInstall = "npx --no-install playwright install --with-deps chromium";
assert.deepEqual(runCommands(quality), ["npm ci", qualityGate]);
assert.deepEqual(runCommands(artifact), ["npm ci", artifactGate]);
assert.deepEqual(runCommands(server), ["npm ci", serverGate]);
assert.deepEqual(runCommands(load), ["npm ci", "npm run test:load"]);
assert.deepEqual(runCommands(ui), ["npm ci", browserInstall, "npm run test:ui"]);
