/* THIÊN HÀ ĐẠI CHIẾN — observable, instance-local server factory. */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {taoClock} = require("./clock.js");
const {taoLogger} = require("./logger.js");
const {Kho} = require("./db.js");
const {TheGioi} = require("./world.js");
const {API} = require("./api.js");
const schedulerIndex = require("./scheduler/index.js");
const {apDungMigrationScheduler} = require("./scheduler/migrations.js");

const taoSchedulerMacDinh = schedulerIndex.taoScheduler;
const resolveDurableSchedulerOptions = schedulerIndex.resolveDurableSchedulerOptions;
const inRange = schedulerIndex.inRange;

let renderSchedulerMetrics = null;

function schedulerStatusUnavailable() {
  const error = new Error("SCHEDULER_STATUS_UNAVAILABLE");
  error.code = "SCHEDULER_STATUS_UNAVAILABLE";
  return error;
}

function loadRenderMetrics() {
  if (renderSchedulerMetrics) return renderSchedulerMetrics;
  try {
    const metrics = require("./scheduler/metrics.js");
    if (!metrics || typeof metrics.renderMetrics !== "function") {
      throw schedulerStatusUnavailable();
    }
    renderSchedulerMetrics = metrics.renderMetrics;
    return renderSchedulerMetrics;
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND" &&
        /server\/scheduler\/metrics\.js/.test(String(error.message || ""))) {
      throw schedulerStatusUnavailable();
    }
    throw error;
  }
}

function optionPoll(value) {
  if (!Number.isSafeInteger(value) || value < 100 || value > 10000) {
    throw new Error("SCHEDULER_POLL_MS_INVALID");
  }
  return value;
}

function envPoll(value) {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new Error("SCHEDULER_POLL_MS_INVALID");
  }
  return optionPoll(Number(value));
}

function envBool(value) {
  if (value === "1") return true;
  if (value === "0") return false;
  throw new Error("SCHEDULER_LOG_TICKS_INVALID");
}

function resolveFoundationOptions(options, env) {
  options = options || {};
  env = env || {};
  const deprecatedAliases = [];
  let poll;
  if (Object.hasOwn(options, "schedulerPollMs")) {
    poll = optionPoll(options.schedulerPollMs);
  } else if (Object.hasOwn(options, "tickMs")) {
    poll = optionPoll(options.tickMs);
    deprecatedAliases.push("tickMs");
  } else if (env.SCHEDULER_POLL_MS !== undefined) {
    poll = envPoll(env.SCHEDULER_POLL_MS);
  } else if (env.THDC_NHIP !== undefined) {
    poll = envPoll(env.THDC_NHIP);
    deprecatedAliases.push("THDC_NHIP");
  } else {
    poll = 1000;
  }

  let logTicks;
  if (Object.hasOwn(options, "schedulerLogTicks")) {
    if (typeof options.schedulerLogTicks !== "boolean") {
      throw new Error("SCHEDULER_LOG_TICKS_INVALID");
    }
    logTicks = options.schedulerLogTicks;
  } else if (env.SCHEDULER_LOG_TICKS !== undefined) {
    logTicks = envBool(env.SCHEDULER_LOG_TICKS);
  } else if (env.THDC_AM !== undefined) {
    logTicks = envBool(env.THDC_AM);
    deprecatedAliases.push("THDC_AM");
  } else {
    logTicks = false;
  }

  const cleanup = Object.hasOwn(options, "cleanupMs") ? options.cleanupMs : 3600000;
  if (!Number.isSafeInteger(cleanup) || cleanup < 1) throw new Error("CLEANUP_MS_INVALID");
  return {
    schedulerPollMs: poll,
    schedulerLogTicks: logTicks,
    cleanupMs: cleanup,
    deprecatedAliases: deprecatedAliases
  };
}

function resolveDbPath(options, env, rootDir) {
  options = options || {};
  env = env || {};
  if (Object.hasOwn(options, "dbPath")) return options.dbPath;
  if (env.THDC_DB !== undefined) return env.THDC_DB;
  return path.join(rootDir, "server", "data", "thdc.db");
}

function resolvePort(options, env) {
  const source = Object.hasOwn(options, "port") ? options.port :
    (env.PORT !== undefined ? Number(env.PORT) : 8080);
  if (!Number.isSafeInteger(source) || source < 0 || source > 65535) {
    throw new Error("PORT_INVALID");
  }
  return source;
}

function taoUngDung(options) {
  options = options || {};
  const env = options.env || process.env;
  const rootDir = options.rootDir || path.join(__dirname, "..");
  const dbPath = resolveDbPath(options, env, rootDir);
  const port = resolvePort(options, env);
  const clock = options.clock || taoClock();
  const logger = options.logger || taoLogger();
  const testHooks = options.testHooks || {};
  const lifecycleObserver = options.lifecycleObserver || function () {};
  const timers = Object.assign({
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
  }, options.timers || {});
  ["setTimeout", "clearTimeout", "setInterval", "clearInterval"].forEach(function (name) {
    if (typeof timers[name] !== "function") throw new TypeError("TIMERS_" + name + "_REQUIRED");
  });
  const afterAdmittedCommand = Object.hasOwn(testHooks, "afterAdmittedCommand") ?
    testHooks.afterAdmittedCommand : null;
  const onRequestTracked = testHooks.onRequestTracked || function () {};
  const onShutdownGraceTimer = testHooks.onShutdownGraceTimer || function () {};
  const onShutdownGraceExpiry = testHooks.onShutdownGraceExpiry || function () {};
  if (afterAdmittedCommand !== null && typeof afterAdmittedCommand !== "function") {
    throw new TypeError("AFTER_ADMITTED_COMMAND_INVALID");
  }
  if (typeof onRequestTracked !== "function") throw new TypeError("REQUEST_TRACK_HOOK_INVALID");
  if (typeof onShutdownGraceTimer !== "function") {
    throw new TypeError("SHUTDOWN_GRACE_TIMER_HOOK_INVALID");
  }
  if (typeof onShutdownGraceExpiry !== "function") {
    throw new TypeError("SHUTDOWN_GRACE_HOOK_INVALID");
  }
  const resolved = resolveFoundationOptions(options, env);
  const acquired = {db: false, listener: false, scheduler: false, timers: false, admission: false};
  let kho = null;
  let tg = null;
  let scheduler = null;
  let api = null;
  let gameNow = null;
  let schedulerOptions = null;
  let durableOptions = null;
  let universeBootstrapPromise = null;
  let databaseClosingMarked = false;

  function currentUniverseSeed() {
    return kho.cauhinh("seed");
  }

  async function awaitHttpCommand(command) {
    const result = await scheduler.runCommand(command);
    if (result && result.deferred === true) {
      const error = new Error(result.code || "TICK_PARTIAL");
      error.code = result.code || "TICK_PARTIAL";
      throw error;
    }
    return result;
  }

  async function ensureUniverseBootstrap() {
    if (!universeBootstrapPromise) {
      universeBootstrapPromise = awaitHttpCommand({
        name: "universe-bootstrap",
        run: function () { return tg.seed(); }
      }).then(function (seed) {
        if (typeof seed !== "string" || seed.length === 0) {
          throw new Error("UNIVERSE_SEED_INVALID");
        }
        return seed;
      }).catch(function (error) {
        universeBootstrapPromise = null;
        throw error;
      });
    }
    return await universeBootstrapPromise;
  }

  function scrubMessage(error) {
    if (!error || typeof error.message !== "string") return undefined;
    return error.message.slice(0, 500).replace(
      /(?:password|token|state|body|salt|muoi|mk)(?:\s*[:=]\s*[^\s,;]*)?/gi,
      "[redacted]"
    );
  }

  function safeLog(level, event, error) {
    try {
      logger[level]({
        event: event,
        at: clock.nowMs(),
        code: error && error.code,
        message: scrubMessage(error)
      });
    } catch (ignored) {
      void ignored;
    }
  }

  function reportError(event, error) {
    safeLog("error", event, error);
  }

  function emit(event) {
    lifecycleObserver(event);
  }

  function emitCleanup(event) {
    try { emit(event); } catch (error) { reportError("server.cleanup_failed", error); }
  }

  function markDatabaseClosing() {
    if (databaseClosingMarked) return;
    databaseClosingMarked = true;
    if (scheduler && typeof scheduler._datDatabaseClosing === "function") {
      scheduler._datDatabaseClosing();
    }
  }

  function closeConstruction(cause) {
    if (acquired.db) {
      acquired.db = false;
      try { markDatabaseClosing(); }
      catch (cleanupError) { reportError("server.cleanup_failed", cleanupError); }
      try { kho.dong(); } catch (cleanupError) { reportError("server.cleanup_failed", cleanupError); }
      safeLog("info", "db.closed");
      emitCleanup("db.closed");
      emitCleanup("db.close");
    }
    throw cause;
  }

  try {
    resolved.deprecatedAliases.forEach(function (alias) {
      logger.warn({event: "server.config.deprecated_alias", at: clock.nowMs(), alias: alias});
    });
    kho = new Kho(dbPath, {
      allowMemoryDb: options.allowMemoryDb === true,
      clock: clock,
      logger: logger,
      onIdleWait: testHooks.onWaitForUowIdle
    });
    acquired.db = true;
    emit("db.opened");
    logger.info({event: "db.opened", at: clock.nowMs()});
    const applySchedulerMigration = options.applySchedulerMigration || apDungMigrationScheduler;
    applySchedulerMigration(kho, clock.nowMs());
    const makeWorld = testHooks.createWorld || function (kho0, worldOptions) {
      return new TheGioi(kho0, worldOptions);
    };
    tg = makeWorld(kho, {clock: clock});
    gameNow = function () { return tg.gameNow(); };
    schedulerOptions = {
      schedulerPollMs: resolved.schedulerPollMs,
      schedulerLogTicks: resolved.schedulerLogTicks,
      cleanupMs: resolved.cleanupMs
    };
    durableOptions = resolveDurableSchedulerOptions(schedulerOptions, env);
    const schedulerFactory = options.schedulerFactory || taoSchedulerMacDinh;
    scheduler = schedulerFactory({
      kho: kho,
      tg: tg,
      clock: clock,
      logger: logger,
      env: env,
      schedulerOptions: schedulerOptions
    });
    tg.scheduler = scheduler;
    if (afterAdmittedCommand) {
      const realScheduler = scheduler;
      const wrappedScheduler = Object.create(
        Object.getPrototypeOf(realScheduler),
        Object.getOwnPropertyDescriptors(realScheduler)
      );
      Object.defineProperty(wrappedScheduler, "runCommand", {
        enumerable: true,
        configurable: true,
        writable: true,
        value: async function (command) {
          const result = await realScheduler.runCommand(command);
          await afterAdmittedCommand(command, result);
          return result;
        }
      });
      scheduler = wrappedScheduler;
      tg.scheduler = scheduler;
    }
    const makeApi = testHooks.createApi || function (kho0, tg0, apiOptions) {
      return new API(kho0, tg0, apiOptions);
    };
    api = makeApi(kho, tg, {
      clock: clock,
      logger: logger,
      scheduler: scheduler,
      env: env,
      gameNow: gameNow,
      getUniverseSeed: currentUniverseSeed,
      ensureUniverseBootstrap: ensureUniverseBootstrap
    });
  } catch (cause) {
    closeConstruction(cause);
  }

  const timerHandles = [];
  const inflightWaiters = [];
  let admissionOpen = false;
  let inflight = 0;
  let tickRunning = false;

  function finishInflight() {
    inflight--;
    if (inflight === 0) inflightWaiters.splice(0).forEach(function (resolve) { resolve(); });
  }

  function trackApiRequest(fn) {
    inflight++;
    onRequestTracked();
    return Promise.resolve().then(fn).finally(finishInflight);
  }

  function waitForInflight() {
    if (inflight === 0) return Promise.resolve();
    return new Promise(function (resolve) { inflightWaiters.push(resolve); });
  }

  function traJsonApp(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(body);
  }

  const transientBodies = {
    SCHEDULER_UNAVAILABLE: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_UNAVAILABLE"
    },
    GLOBAL_BARRIER_PENDING: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "GLOBAL_BARRIER_PENDING"
    },
    TICK_PARTIAL: {
      loi: "Máy chủ đang tua thời gian, hãy thử lại ngay.",
      code: "TICK_PARTIAL"
    },
    SCHEDULER_DB_CLOSED: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_DB_CLOSED"
    },
    SCHEDULER_STORAGE_FATAL: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_STORAGE_FATAL"
    },
    SCHEDULER_CRASHED: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_CRASHED"
    },
    SCHEDULER_MODE_LEGACY: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_MODE_LEGACY"
    },
    SCHEDULER_LEASE_LOST: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_LEASE_LOST"
    },
    LEASE_LOST: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_LEASE_LOST"
    },
    SCHEDULER_LEASE_UNHELD: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_LEASE_UNHELD"
    },
    SCHEDULER_RECOVERING: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_RECOVERING"
    },
    SCHEDULER_DRAINING: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_DRAINING"
    },
    SCHEDULER_QUARANTINE_LIMIT: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_QUARANTINE_LIMIT"
    },
    SCHEDULER_BACKLOG_AGE_LIMIT: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_BACKLOG_AGE_LIMIT"
    },
    SCHEDULER_STATUS_INVALID: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_STATUS_INVALID"
    },
    SCHEDULER_STATUS_UNAVAILABLE: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_STATUS_UNAVAILABLE"
    },
    SCHEDULER_NOT_READY: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_NOT_READY"
    },
    SCHEDULER_STOPPED: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_STOPPED"
    }
  };

  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json"
  };
  const allowedRoots = new Set(["web", "js", "css", "docs", "dist"]);

  function sendText(res, status, body) {
    res.writeHead(status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(body);
  }

  function resolveStaticFile(pathname) {
    if (pathname.indexOf("\0") >= 0) return null;
    if (pathname === "/" || pathname === "/index.html") return path.join(rootDir, "web", "index.html");
    if (pathname === "/motnguoi" || pathname === "/solo") return path.join(rootDir, "index.html");
    const relative = pathname.replace(/^[/\\]+/, "");
    const pieces = relative.split(/[/\\]/);
    if (!pieces.length || !allowedRoots.has(pieces[0]) || pieces.includes("..")) return null;
    const candidate = path.resolve(rootDir, relative);
    const root = path.resolve(rootDir) + path.sep;
    if (!candidate.startsWith(root)) return null;
    return candidate;
  }

  function sendStatic(req, res, pathname) {
    const filename = resolveStaticFile(pathname);
    if (!filename) return sendText(res, 404, "Không có file.");
    fs.readFile(filename, function (error, data) {
      if (error) return sendText(res, 404, "Không có file.");
      res.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filename).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff"
      });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  }

  function getStatus() {
    return scheduler.getStatus() || {};
  }

  function transientBody(reason) {
    return transientBodies[reason] || transientBodies.SCHEDULER_UNAVAILABLE;
  }

  function writeOperational(res, status, contentType, body) {
    res.writeHead(status, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(body);
    return true;
  }

  function answerOperational(pathname, res) {
    if (pathname === "/healthz") {
      return writeOperational(res, 200, "text/plain; charset=utf-8", "ok\n");
    }
    if (pathname !== "/readyz" && pathname !== "/metrics") return false;
    let status;
    try {
      status = getStatus();
      if (pathname === "/metrics") {
        const rendered = loadRenderMetrics()(status);
        return writeOperational(res, 200, "text/plain; version=0.0.4; charset=utf-8", rendered);
      }
    } catch (error) {
      reportError("scheduler.status_failed", error);
      if (pathname === "/readyz") {
        return writeOperational(res, 503, "application/json; charset=utf-8",
          JSON.stringify({ready: false, reason: "SCHEDULER_STATUS_UNAVAILABLE"}));
      }
      return writeOperational(res, 503, "text/plain; charset=utf-8",
        "scheduler_status_unavailable 1\n");
    }
    const ready = status.ready === true && !stopRequested;
    return writeOperational(res, ready ? 200 : 503, "application/json; charset=utf-8",
      JSON.stringify({
        ready: ready,
        reason: stopRequested ? "SCHEDULER_DRAINING" : (status.reason || null)
      }));
  }

  async function dispatchAdmittedApi(req, res, pathname, query) {
    let status;
    try { status = getStatus(); }
    catch (error) {
      reportError("scheduler.status_failed", error);
      return traJsonApp(res, 503, transientBodies.SCHEDULER_STATUS_UNAVAILABLE);
    }
    if (stopRequested || status.ready !== true) {
      const reason = stopRequested ? "SCHEDULER_DRAINING" : (status.reason || "SCHEDULER_NOT_READY");
      return traJsonApp(res, 503, transientBody(reason));
    }
    return api.xuLy(req, res, pathname, query);
  }

  function xuLyApiCoTheoDoi(req, res, pathname, query) {
    return trackApiRequest(async function () {
      try {
        if (testHooks.beforeApiDispatch) await testHooks.beforeApiDispatch(req);
        return await dispatchAdmittedApi(req, res, pathname, query);
      } catch (error) {
        const transient = error && transientBodies[error.code];
        if (transient) {
          if (!res.headersSent) return traJsonApp(res, 503, transient);
          if (!res.writableEnded) res.end();
          return;
        }
        const clientStatus = error && Number.isSafeInteger(error.ma) &&
          error.ma >= 400 && error.ma < 500 ? error.ma : null;
        if (clientStatus !== null) {
          if (!res.headersSent) {
            const message = typeof error.message === "string" ? error.message : "Yêu cầu không hợp lệ.";
            return traJsonApp(res, clientStatus, {loi: message});
          }
          if (!res.writableEnded) res.end();
          return;
        }
        emitCleanup("http.error");
        reportError("http.error", error);
        if (!res.headersSent) return traJsonApp(res, 500, {loi: "Lỗi máy chủ."});
        if (!res.writableEnded) res.end();
      }
    });
  }

  const sockets = new Set();
  const server = http.createServer(function (req, res) {
    let parsed;
    let pathname;
    try {
      parsed = new URL(req.url || "/", "http://localhost");
      pathname = decodeURIComponent(parsed.pathname || "/");
    } catch (error) {
      return sendText(res, 400, "Đường dẫn không hợp lệ.");
    }
    const query = parsed.searchParams;

    if (answerOperational(pathname, res)) return;
    if (pathname.indexOf("/api/") === 0) {
      void xuLyApiCoTheoDoi(req, res, pathname, query);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, {"X-Content-Type-Options": "nosniff"});
      return res.end();
    }
    return sendStatic(req, res, pathname);
  });

  server.on("connection", function (socket) {
    sockets.add(socket);
    socket.once("close", function () { sockets.delete(socket); });
  });

  function closeListenerWithoutAcceptingNewRequests() {
    return new Promise(function (resolve, reject) {
      let settled = false;
      function finish(error) {
        if (settled) return;
        settled = true;
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING") return reject(error);
        resolve();
      }
      try { server.close(finish); } catch (error) { finish(error); }
    });
  }

  function clearAllTimers() {
    let firstError = null;
    timerHandles.splice(0).forEach(function (handle) {
      try { timers.clearInterval(handle); }
      catch (error) { if (!firstError) firstError = error; }
    });
    if (firstError) throw firstError;
  }

  function listenOnConfiguredPort() {
    return new Promise(function (resolve, reject) {
      function onError(error) {
        server.removeListener("listening", onListening);
        reject(error);
      }
      function onListening() {
        server.removeListener("error", onError);
        resolve();
      }
      server.once("error", onError);
      server.once("listening", onListening);
      if (options.host !== undefined) server.listen(port, options.host);
      else server.listen(port);
    });
  }

  function nhipNoiBo() {
    if (tickRunning) return Promise.resolve(0);
    tickRunning = true;
    return Promise.resolve().then(function () {
      return nhip();
    }).catch(function (error) {
      reportError("scheduler.tick_failed", error);
      return 0;
    }).finally(function () {
      tickRunning = false;
    });
  }

  function nhip() {
    return scheduler.runCommand({
      name: "advance-due",
      run: function () { return null; }
    });
  }

  function donRacNoiBo() {
    const now = gameNow();
    kho.q.phienDonRac.run(now);
    kho.q.hdDonRac.run(now - 86400);
    kho.q.chatDonRac.run(now - 30 * 86400);
    return null;
  }

  function donRac() {
    return scheduler.runCommand({
      name: "cleanup",
      run: donRacNoiBo
    });
  }

  function donRacTimer() {
    try {
      return Promise.resolve(donRac()).catch(function (error) {
        reportError("server.cleanup_tick_failed", error);
      });
    } catch (error) {
      reportError("server.cleanup_tick_failed", error);
    }
    return undefined;
  }

  let starting = null;
  let stopping = null;
  let stopRequested = false;
  let startupCleanupCompleted = false;

  function destroyTrackedSockets() {
    sockets.forEach(function (socket) {
      try { socket.destroy(); } catch (error) { reportError("server.cleanup_failed", error); }
    });
  }

  function beginShutdownDeadline(ms, onCleanupError) {
    let done = false;
    let expiredFlag = false;
    let handle = null;
    let resolveDeadline;
    const expired = new Promise(function (resolve) { resolveDeadline = resolve; });
    function expireNow() {
      if (done) return;
      done = true;
      expiredFlag = true;
      try { onShutdownGraceExpiry(); } catch (error) { onCleanupError(error); }
      destroyTrackedSockets();
      resolveDeadline("expired");
    }
    try {
      handle = timers.setTimeout(expireNow, ms);
      try { onShutdownGraceTimer(handle); } catch (error) { onCleanupError(error); }
    } catch (error) {
      onCleanupError(error);
      expireNow();
    }
    return {
      expired: expired,
      didExpire: function () { return expiredFlag; },
      settle: function () {
        if (done) return;
        done = true;
        try { timers.clearTimeout(handle); } catch (error) { onCleanupError(error); }
        resolveDeadline("settled");
      }
    };
  }

  async function attemptCleanup(action, original, firstCleanupError) {
    try {
      await action();
    } catch (error) {
      reportError("server.cleanup_failed", error);
      if (!original && !firstCleanupError.value) firstCleanupError.value = error;
    }
  }

  async function closeAcquired(original, graceMs) {
    const firstCleanupError = {value: null};
    const hadRunningService = acquired.listener || acquired.scheduler || acquired.timers;
    const needsDbDrain = hadRunningService;
    if (hadRunningService) {
      emitCleanup("draining");
      if (acquired.admission) {
        admissionOpen = false;
        acquired.admission = false;
        emitCleanup("admission.close");
      }
    }
    let listenerClosed = Promise.resolve();
    if (acquired.listener) {
      listenerClosed = Promise.resolve().then(closeListenerWithoutAcceptingNewRequests);
      acquired.listener = false;
      emitCleanup("listener.close");
      emitCleanup("wait.inflight");
      await attemptCleanup(waitForInflight, original, firstCleanupError);
      await attemptCleanup(function () { return listenerClosed; }, original, firstCleanupError);
    }
    if (acquired.db && needsDbDrain) {
      emitCleanup("wait.uow");
      await attemptCleanup(function () { return kho.choRanh(); }, original, firstCleanupError);
    }
    if (acquired.scheduler) {
      acquired.scheduler = false;
      await attemptCleanup(function () { return scheduler.stop(graceMs); }, original, firstCleanupError);
      emitCleanup("scheduler.stop");
    }
    if (acquired.timers) {
      acquired.timers = false;
      await attemptCleanup(clearAllTimers, original, firstCleanupError);
      emitCleanup("timer.clear");
    }
    if (acquired.db) {
      acquired.db = false;
      await attemptCleanup(markDatabaseClosing, original, firstCleanupError);
      await attemptCleanup(function () { return kho.dong(); }, original, firstCleanupError);
      safeLog("info", "db.closed");
      emitCleanup("db.closed");
      emitCleanup("db.close");
    }
    if (original) throw original;
    if (firstCleanupError.value) throw firstCleanupError.value;
  }

  async function startOnce() {
    let migrationCompleted = false;
    try {
      emit("migration.started");
      logger.info({event: "migration.started", at: clock.nowMs()});
      tg.nangCapDuLieu();
      migrationCompleted = true;
      emit("migration.completed");
      logger.info({event: "migration.completed", at: clock.nowMs()});
      if (stopRequested) return;
      await listenOnConfiguredPort();
      acquired.listener = true;
      if (stopRequested) return;
      await scheduler.start();
      acquired.scheduler = true;
      if (stopRequested) return;
      const tickHandle = timers.setInterval(nhipNoiBo, schedulerOptions.schedulerPollMs);
      timerHandles.push(tickHandle);
      acquired.timers = true;
      const cleanupHandle = timers.setInterval(donRacTimer, schedulerOptions.cleanupMs);
      timerHandles.push(cleanupHandle);
      acquired.timers = true;
      admissionOpen = true;
      acquired.admission = true;
      emit("server.started");
      logger.info({event: "server.started", at: clock.nowMs()});
    } catch (error) {
      const failureEvent = migrationCompleted ? "server.start_failed" : "migration.failed";
      emitCleanup(failureEvent);
      reportError(failureEvent, error);
      if (stopping) throw error;
      try {
        await closeAcquired(error);
      } finally {
        startupCleanupCompleted = true;
      }
    }
  }

  function start() {
    if (!starting) starting = startOnce();
    return starting;
  }

  function stop(graceMs) {
    if (stopping) return stopping;
    const grace = graceMs === undefined ? durableOptions.shutdownGraceMs :
      inRange("graceMs", graceMs, 1000, 60000);
    stopRequested = true;
    let resolveStopping;
    let rejectStopping;
    stopping = new Promise(function (resolve, reject) {
      resolveStopping = resolve;
      rejectStopping = reject;
    });
    let hadRunningService = acquired.listener || acquired.scheduler || acquired.timers;
    let needsDbDrain = hadRunningService;
    let drainingEmitted = false;
    let firstCleanupError = null;
    let startupError = null;
    let listenerClosed = Promise.resolve();
    let listenerCloseStarted = false;

    function recordCleanup(error) {
      reportError("server.cleanup_failed", error);
      if (!firstCleanupError) firstCleanupError = error;
    }

    function settledCall(fn) {
      let value;
      try { value = Promise.resolve(fn()); }
      catch (error) { value = Promise.reject(error); }
      value = value.catch(function (error) {
        recordCleanup(error);
        throw error;
      });
      value.catch(function () {});
      return value;
    }

    function beginListenerCloseIfAcquired() {
      if (listenerCloseStarted || !acquired.listener) return;
      listenerCloseStarted = true;
      hadRunningService = true;
      needsDbDrain = true;
      if (!drainingEmitted) {
        emitCleanup("draining");
        drainingEmitted = true;
      }
      acquired.listener = false;
      emitCleanup("listener.close");
      emitCleanup("wait.inflight");
      listenerClosed = settledCall(closeListenerWithoutAcceptingNewRequests);
    }

    if (hadRunningService) {
      emitCleanup("draining");
      drainingEmitted = true;
    }
    admissionOpen = false;
    if (acquired.admission) {
      acquired.admission = false;
      emitCleanup("admission.close");
    }
    beginListenerCloseIfAcquired();
    if (scheduler && typeof scheduler._beginStop === "function") {
      try { scheduler._beginStop(); } catch (error) { recordCleanup(error); }
    }
    const deadline = beginShutdownDeadline(grace, recordCleanup);
    const stopWork = (async function () {
      if (starting) {
        await starting.catch(function (error) {
          if (!startupCleanupCompleted) startupError = error;
        });
      }
      hadRunningService = hadRunningService || acquired.listener || acquired.scheduler || acquired.timers;
      needsDbDrain = needsDbDrain || hadRunningService;
      if (hadRunningService && !drainingEmitted) {
        emitCleanup("draining");
        drainingEmitted = true;
      }
      beginListenerCloseIfAcquired();
      if (deadline.didExpire()) destroyTrackedSockets();
      const inflightSettled = settledCall(waitForInflight);
      const shutdownSettlement = Promise.allSettled([inflightSettled, listenerClosed]);
      const graceOutcome = await Promise.race([
        shutdownSettlement.then(function () { return "settled"; }),
        deadline.expired
      ]);
      if (graceOutcome === "settled") deadline.settle();
      await shutdownSettlement;
      if (acquired.db && needsDbDrain) {
        emitCleanup("wait.uow");
        await Promise.allSettled([settledCall(function () { return kho.choRanh(); })]);
      }
      if (acquired.scheduler) {
        acquired.scheduler = false;
        await Promise.allSettled([settledCall(function () { return scheduler.stop(grace); })]);
        emitCleanup("scheduler.stop");
      }
      if (acquired.timers) {
        acquired.timers = false;
        try { clearAllTimers(); } catch (error) { recordCleanup(error); }
        emitCleanup("timer.clear");
      }
      if (scheduler && typeof scheduler._waitForStopFinalization === "function") {
        await Promise.allSettled([
          settledCall(function () { return scheduler._waitForStopFinalization(); })
        ]);
      }
      if (acquired.db) {
        try { markDatabaseClosing(); } catch (error) { recordCleanup(error); }
        acquired.db = false;
        try { kho.dong(); } catch (error) { recordCleanup(error); }
        safeLog("info", "db.closed");
        emitCleanup("db.closed");
        emitCleanup("db.close");
      }
      if (startupError) throw startupError;
      if (firstCleanupError) throw firstCleanupError;
    })().finally(function () {
      if (hadRunningService) safeLog("info", "server.stopped");
      if (hadRunningService) emitCleanup("server.stopped");
    });
    stopWork.then(resolveStopping, rejectStopping);
    return stopping;
  }

  return {
    server: server,
    kho: kho,
    tg: tg,
    api: api,
    scheduler: scheduler,
    start: start,
    stop: stop,
    nhip: nhip,
    donRac: donRac,
    getStatus: getStatus
  };
}

module.exports = {
  taoUngDung: taoUngDung,
  resolveDbPath: resolveDbPath,
  optionPoll: optionPoll,
  envPoll: envPoll,
  envBool: envBool,
  resolveFoundationOptions: resolveFoundationOptions
};
