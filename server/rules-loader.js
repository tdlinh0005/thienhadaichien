"use strict";

const path = require("node:path");
const manifest = require("../tools/source-manifest.js");

let cached = null;

function rulesError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function restoreWindow(object, hadOwn, value) {
  if (hadOwn) object.window = value;
  else delete object.window;
}

function clearAttempt(files) {
  for (const file of files) delete require.cache[file];
}

function napLuat(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, "..");
  const requireFn = options.requireFn || require;
  const globalObject = options.globalObject || global;
  if (cached) {
    if (cached.globalObject !== globalObject) {
      throw rulesError(
        "RULES_GLOBAL_CONFLICT",
        "rules already loaded for another globalObject"
      );
    }
    return cached.G;
  }

  const hadTargetWindow = Object.hasOwn(globalObject, "window");
  const priorTargetWindow = globalObject.window;
  const hadProcessWindow = Object.hasOwn(global, "window");
  const priorProcessWindow = global.window;
  const targetWindow = globalObject.window || {};
  const attempted = [];
  let currentFile = null;
  globalObject.window = targetWindow;
  global.window = targetWindow;
  try {
    for (const file of manifest.rulesScripts) {
      currentFile = file;
      const absolute = path.join(rootDir, file);
      attempted.push(absolute);
      requireFn(absolute);
    }
    if (!targetWindow.G) {
      throw rulesError("RULES_MISSING_G", "rules did not publish G");
    }
    cached = {globalObject: globalObject, G: targetWindow.G};
    return cached.G;
  } catch (cause) {
    clearAttempt(attempted);
    const prefix = currentFile ? "cannot load " + currentFile + ": " : "cannot load rules: ";
    throw rulesError(cause.code || "RULES_LOAD_FAILED", prefix + cause.message);
  } finally {
    if (globalObject !== global) {
      restoreWindow(globalObject, hadTargetWindow, priorTargetWindow);
    }
    restoreWindow(global, hadProcessWindow, priorProcessWindow);
  }
}

const THU_TU = manifest.rulesScripts.slice();

module.exports = {napLuat: napLuat, THU_TU: THU_TU};
