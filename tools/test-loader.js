/* Foundation Task 8: CommonJS rules loader order, cache, and global policy. */
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const manifest = require("./source-manifest.js");

const rootDir = path.join(__dirname, "..");
const expectedRulesScripts = [
  "js/data.js",
  "js/util.js",
  "js/galaxy.js",
  "js/combat.js",
  "js/engine.js",
  "js/fleet.js",
  "js/actions.js"
];

function relativeFile(filename) {
  return path.relative(rootDir, filename).replaceAll(path.sep, "/");
}

function requireLoader() {
  return require("../server/rules-loader.js");
}

function childA() {
  assert.deepEqual(manifest.rulesScripts, expectedRulesScripts);
  const loader = requireLoader();
  const target = {};
  const seen = [];
  const processWindow = {sentinel: "process-window"};
  const hadProcessWindow = Object.hasOwn(global, "window");
  const priorProcessWindow = global.window;
  global.window = processWindow;
  try {
    function recordingRequire(filename) {
      seen.push(relativeFile(filename));
      return require(filename);
    }
    const first = loader.napLuat({
      rootDir: rootDir,
      requireFn: recordingRequire,
      globalObject: target
    });
    const second = loader.napLuat({
      rootDir: rootDir,
      requireFn: recordingRequire,
      globalObject: target
    });
    assert.deepEqual(seen, manifest.rulesScripts);
    assert.strictEqual(first, second);
    assert.ok(Number.isInteger(first.STATE_VERSION) && first.STATE_VERSION > 0);
    assert.equal(Object.hasOwn(target, "window"), false);
    assert.strictEqual(global.window, processWindow);
    assert.equal(Object.hasOwn(processWindow, "G"), false);

    const otherTarget = {};
    assert.throws(function () {
      loader.napLuat({rootDir: rootDir, globalObject: otherTarget});
    }, function (error) {
      return error && error.code === "RULES_GLOBAL_CONFLICT";
    });
    assert.equal(Object.hasOwn(otherTarget, "window"), false);
    assert.throws(function () {
      loader.napLuat();
    }, function (error) {
      return error && error.code === "RULES_GLOBAL_CONFLICT";
    });
    assert.strictEqual(global.window, processWindow);
    assert.equal(Object.hasOwn(processWindow, "G"), false);
  } finally {
    if (hadProcessWindow) global.window = priorProcessWindow;
    else delete global.window;
  }
}

function childB() {
  assert.deepEqual(manifest.rulesScripts, expectedRulesScripts);
  const hadProcessWindow = Object.hasOwn(global, "window");
  const priorProcessWindow = global.window;
  delete global.window;
  try {
    const facade = require("../server/rules.js");
    assert.equal(
      Object.hasOwn(global, "window"),
      false,
      "server/rules.js must restore an initially absent global.window"
    );
    assert.deepEqual(Object.keys(facade).sort(), ["G", "THU_TU", "napLuat"].sort());
    assert.deepEqual(facade.THU_TU, manifest.rulesScripts);
    assert.notStrictEqual(facade.THU_TU, manifest.rulesScripts);
    assert.strictEqual(facade.G, facade.napLuat());
    assert.strictEqual(facade.G, facade.napLuat());
    assert.ok(Number.isInteger(facade.G.STATE_VERSION) && facade.G.STATE_VERSION > 0);
  } finally {
    if (hadProcessWindow) global.window = priorProcessWindow;
    else delete global.window;
  }
}

function childC() {
  assert.deepEqual(manifest.rulesScripts, expectedRulesScripts);
  const loader = requireLoader();
  const failedTarget = {};
  const firstSeen = [];
  const hadProcessWindow = Object.hasOwn(global, "window");
  const priorProcessWindow = global.window;
  delete global.window;
  try {
    let failure = null;
    try {
      loader.napLuat({
        rootDir: rootDir,
        globalObject: failedTarget,
        requireFn: function (filename) {
          const relative = relativeFile(filename);
          firstSeen.push(relative);
          if (relative === "js/fleet.js") {
            const error = new Error("fixture fleet failure");
            error.code = "FLEET_FIXTURE";
            throw error;
          }
          return require(filename);
        }
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure);
    assert.equal(failure.code, "FLEET_FIXTURE");
    assert.match(failure.message, /js\/fleet\.js/);
    assert.deepEqual(firstSeen, manifest.rulesScripts.slice(0, 6));
    assert.equal(Object.hasOwn(failedTarget, "window"), false);
    assert.equal(Object.hasOwn(global, "window"), false);

    const retrySeen = [];
    const rules = loader.napLuat({
      rootDir: rootDir,
      globalObject: failedTarget,
      requireFn: function (filename) {
        retrySeen.push(relativeFile(filename));
        return require(filename);
      }
    });
    assert.deepEqual(retrySeen, manifest.rulesScripts);
    assert.ok(Number.isInteger(rules.STATE_VERSION) && rules.STATE_VERSION > 0);
    assert.equal(Object.hasOwn(failedTarget, "window"), false);
    assert.equal(Object.hasOwn(global, "window"), false);
    const otherTarget = {};
    assert.throws(function () {
      loader.napLuat({rootDir: rootDir, globalObject: otherTarget});
    }, function (error) {
      return error && error.code === "RULES_GLOBAL_CONFLICT";
    });
    assert.equal(Object.hasOwn(otherTarget, "window"), false);
  } finally {
    if (hadProcessWindow) global.window = priorProcessWindow;
    else delete global.window;
  }
}

const children = {"child-a": childA, "child-b": childB, "child-c": childC};

function runChildren() {
  for (const name of Object.keys(children)) {
    const result = spawnSync(process.execPath, [__filename, name], {
      cwd: rootDir,
      encoding: "utf8"
    });
    if (result.error && result.error.code === "EPERM") {
      console.log("SKIP loader child-process isolation spawn EPERM");
      return;
    }
    if (result.error) throw result.error;
    assert.equal(result.status, 0, name + "\n" + result.stdout + result.stderr);
  }
  console.log("✓ rules loader child isolation");
}

const selected = process.argv[2];
if (selected) {
  assert.ok(children[selected], "unknown loader child scenario " + selected);
  children[selected]();
  console.log("✓ " + selected);
} else {
  runChildren();
}
