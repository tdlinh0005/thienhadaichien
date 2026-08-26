/* Foundation Task 6 entrypoint contract: start, signal-driven stop, exit 0. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawn, spawnSync} = require("node:child_process");

const spawnProbe = spawnSync(process.execPath, ["-e", ""], {encoding: "utf8"});
if (spawnProbe.error && (spawnProbe.error.code === "EPERM" || spawnProbe.error.code === "EACCES")) {
  console.log("SKIP entrypoint spawn " + spawnProbe.error.code);
} else {
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-entrypoint-"));
const dbPath = path.join(directory, "game.sqlite");
const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "index.js")], {
  env: Object.assign({}, process.env, {
    PORT: "0",
    THDC_DB: dbPath,
    SCHEDULER_POLL_MS: "1000"
  }),
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
let finished = false;
let sentSignal = false;

function cleanup() {
  if (!finished && child.exitCode === null) child.kill("SIGKILL");
  fs.rmSync(directory, {recursive: true, force: true});
}

const timeout = setTimeout(function () {
  cleanup();
  console.error("entrypoint timeout\n" + output);
  process.exitCode = 1;
}, 10000);

function inspect(chunk) {
  output += chunk.toString("utf8");
  if (!sentSignal && /server\.started/.test(output)) {
    sentSignal = true;
    child.kill("SIGTERM");
  }
}

child.stdout.on("data", inspect);
child.stderr.on("data", inspect);
child.on("error", function (error) {
  finished = true;
  clearTimeout(timeout);
  cleanup();
  if (error && (error.code === "EPERM" || error.code === "EACCES")) {
    console.log("SKIP entrypoint spawn " + error.code);
    return;
  }
  throw error;
});
child.on("close", function (code, signal) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  cleanup();
  if (!sentSignal && /(?:EPERM|EACCES)/.test(output)) {
    console.log("SKIP entrypoint bind blocked by sandbox\n" + output.trim());
    return;
  }
  assert.equal(sentSignal, true, output);
  assert.equal(signal, null, output);
  assert.equal(code, 0, output);
  assert.match(output, /server\.started/);
  assert.match(output, /server\.stopped/);
  console.log("entrypoint lifecycle passed");
});
}
