"use strict";

const {spawnSync} = require("node:child_process");
const {listSourceFiles} = require("./lint.js");

function writeSpawnError(stderr, file, error) {
  const code = String((error && (error.code || error.name)) || "UNKNOWN");
  const message = String((error && error.message) || "unknown spawn failure");
  stderr.write(file + ": syntax-check spawn " + code + ": " + message + "\n");
}

function checkFiles(files, dependencies) {
  const deps = dependencies || {};
  const run = deps.spawnSync || spawnSync;
  const stderr = deps.stderr || process.stderr;
  let failed = false;
  for (const file of files) {
    const result = run(process.execPath, ["--check", file], {encoding: "utf8"});
    if (result.error) {
      failed = true;
      writeSpawnError(stderr, file, result.error);
    } else if (result.status !== 0) {
      failed = true;
      stderr.write(file + "\n" + (result.stderr || ""));
    }
  }
  return failed ? 1 : 0;
}

function main(dependencies) {
  const deps = dependencies || {};
  return checkFiles(deps.files || listSourceFiles(), deps);
}

if (require.main === module) process.exitCode = main();

module.exports = {checkFiles, main};
