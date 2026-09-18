/* THIÊN HÀ ĐẠI CHIẾN — production entrypoint and lazy legacy facade. */
"use strict";

const path = require("node:path");
const {taoUngDung, resolveDbPath} = require("./app.js");
const schedulerIndex = require("./scheduler/index.js");

const taoScheduler = schedulerIndex.taoScheduler;
const validateProductionDatabasePath = schedulerIndex.validateProductionDatabasePath;

let legacyApp = null;

function trustedDbAllowlist(env) {
  if (!env || env.NODE_ENV !== "production") return undefined;
  if (typeof env.THDC_DB_ALLOWLIST !== "string" || env.THDC_DB_ALLOWLIST.trim() === "") {
    throw new Error("THDC_DB_ALLOWLIST_REQUIRED");
  }
  return env.THDC_DB_ALLOWLIST.split(",").map(function (entry) {
    const value = entry.trim();
    if (!path.isAbsolute(value)) throw new Error("THDC_DB_ALLOWLIST_INVALID");
    return value;
  });
}

function selectedDbPath(env, overrides) {
  const options = overrides || {};
  const rootDir = options.rootDir || path.join(__dirname, "..");
  return resolveDbPath(options, env || process.env, rootDir);
}

function validateEntrypointDbPath(dbPath, env, dbPathAllowlist) {
  const production = env && env.NODE_ENV === "production";
  if (!production) return dbPath;
  if (typeof validateProductionDatabasePath !== "function") {
    throw new Error("THDC_DB_VALIDATOR_UNAVAILABLE");
  }
  return validateProductionDatabasePath(dbPath, {
    production: true,
    nodeEnv: env.NODE_ENV,
    dbPathAllowlist: dbPathAllowlist
  });
}

function taoUngDungSanXuat(env, overrides) {
  env = env || process.env;
  const options = overrides || {};
  const dbPathAllowlist = trustedDbAllowlist(env);
  const dbPath = validateEntrypointDbPath(selectedDbPath(env, options), env, dbPathAllowlist);
  return taoUngDung(Object.assign({}, options, {
    env: env,
    dbPath: dbPath,
    schedulerFactory: options.schedulerFactory || taoScheduler,
    dbPathAllowlist: dbPathAllowlist
  }));
}

function getLegacyApp() {
  if (!legacyApp) legacyApp = taoUngDungSanXuat(process.env);
  return legacyApp;
}

async function main(env, overrides) {
  env = env || process.env;
  const mainOptions = Object.assign({}, overrides || {});
  if (env.THDC_ENTRYPOINT_PROBE === "1") {
    mainOptions.logger = {
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {}
    };
    mainOptions.testHooks = Object.assign({}, mainOptions.testHooks || {}, {
      onRequestTracked: function () {
        process.stdout.write(JSON.stringify({event: "request-tracked"}) + "\n");
      }
    });
  }
  const app = taoUngDungSanXuat(env, mainOptions);
  legacyApp = app;
  let signalStopping = null;

  function shutdown() {
    if (!signalStopping) {
      try {
        signalStopping = Promise.resolve(app.stop());
      } catch (error) {
        signalStopping = Promise.reject(error);
      }
      signalStopping = signalStopping.then(function () {
        process.exitCode = 0;
      }).catch(function (error) {
        void error;
        process.stderr.write("SERVER_STOP_FAILED\n");
        process.exitCode = 1;
      });
    }
    return signalStopping;
  }

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  if (app.scheduler && typeof app.scheduler._datSignalHandlerInstalled === "function") {
    app.scheduler._datSignalHandlerInstalled(true);
  }
  await app.start();
  if (env.THDC_ENTRYPOINT_PROBE === "1") {
    process.stdout.write(JSON.stringify({port: app.server.address().port}) + "\n");
  }
  return app;
}

// Chỉ in mã lỗi dạng HOA_GACH_DUOI, không in message tự do/stack: đủ để biết
// vì sao server không lên (ví dụ SCHEDULER_POLL_MS_INVALID, THDC_DB_NOT_ALLOWLISTED)
// mà không lộ đường dẫn, payload hay state ra log khởi động.
function schedulerStartFailureCode(error) {
  var code = error && typeof error.code === "string" ? error.code : null;
  if (!code && error && typeof error.message === "string") code = error.message;
  return /^[A-Z][A-Z0-9_]{0,80}$/.test(code || "") ? code : null;
}

if (require.main === module) {
  main(process.env).catch(function (error) {
    const code = schedulerStartFailureCode(error);
    process.stderr.write("SERVER_START_FAILED" + (code ? " " + code : "") + "\n");
    process.exitCode = 1;
  });
}

module.exports.taoUngDung = taoUngDung;
module.exports.taoUngDungSanXuat = taoUngDungSanXuat;
module.exports.main = main;
module.exports.getLegacyApp = getLegacyApp;
module.exports.trustedDbAllowlist = trustedDbAllowlist;
["server", "kho", "tg", "api"].forEach(function (name) {
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    get: function () { return getLegacyApp()[name]; }
  });
});
