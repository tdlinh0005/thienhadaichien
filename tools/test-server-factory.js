/* Foundation Task 6: deterministic server factory, lifecycle, and isolation. */
"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const {Readable, PassThrough} = require("node:stream");
const {taoUngDung, resolveFoundationOptions, resolveDbPath} = require("../server/app.js");
const {API} = require("../server/api.js");
const {G, TheGioi, RULES_HOOK_METHODS} = require("../server/world.js");
const {Kho} = require("../server/db.js");
const {taoLogger} = require("../server/logger.js");
const {apDungMigrationScheduler} = require("../server/scheduler/migrations.js");

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), "thdc-factory-" + label + "-"));
}

function tempDb(directory, name) {
  return path.join(directory, name || "game.sqlite");
}

function removeDb(directory) {
  fs.rmSync(directory, {recursive: true, force: true});
}

function fakeClock(value) {
  return {nowMs: function () { return value; }};
}

function silentLogger(records) {
  records = records || [];
  return taoLogger(captureConsoleSink(records));
}

function captureConsoleSink(records) {
  function record(level) {
    return function (info) { records.push({level: level, info: info}); };
  }
  return {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error")
  };
}

function readyStatus() {
  return {state: "ready", ready: true};
}

function taoDeferred() {
  let resolve;
  let reject;
  const promise = new Promise(function (ok, fail) {
    resolve = ok;
    reject = fail;
  });
  return {promise: promise, resolve: resolve, reject: reject};
}

function taoTimersGia(secondFailure) {
  const setCalls = [];
  const clearCalls = [];
  const handles = [{name: "tick"}, {name: "cleanup"}];
  return {
    setInterval: function (fn, ms) {
      setCalls.push({fn: fn, ms: ms});
      if (secondFailure && setCalls.length === 2) throw secondFailure;
      return handles[setCalls.length - 1];
    },
    clearInterval: function (handle) { clearCalls.push(handle); },
    setCalls: setCalls,
    clearCalls: clearCalls,
    handles: handles
  };
}

function request(server, pathname, options) {
  options = options || {};
  const address = server.address();
  return new Promise(function (resolve, reject) {
    const req = http.request({
      host: "127.0.0.1",
      port: address.port,
      path: pathname,
      method: options.method || "GET",
      headers: options.headers || {}
    }, function (res) {
      const chunks = [];
      res.on("data", function (chunk) { chunks.push(chunk); });
      res.on("end", function () {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

function snapshot(kho) {
  const names = kho.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(function (row) { return row.name; });
  return JSON.stringify(names.map(function (name) {
    return [name, kho.db.prepare("SELECT * FROM \"" + name.replace(/\"/g, '\"\"') + "\"").all()];
  }));
}

function recordingSchedulerFactory(order, status, startFailure) {
  return function makeScheduler(context) {
    let starts = 0;
    let stops = 0;
    return {
      start: async function () {
        starts++;
        order.push("scheduler.start");
        if (startFailure) throw startFailure;
      },
      stop: async function () {
        if (starts) stops++;
        order.push("scheduler.stop");
      },
      getStatus: function () { return status(); },
      runCommand: function (command) { return command.run(); },
      schedule: function () {},
      cancel: function () {},
      reconcile: function () {},
      advanceTo: function () {},
      counters: function () {
        return {starts: starts, stops: stops, context: context};
      }
    };
  };
}

function taoApp(label, overrides) {
  const directory = tempDir(label);
  const records = [];
  const order = [];
  const timers = taoTimersGia();
  const options = Object.assign({
    port: 0,
    dbPath: tempDb(directory),
    env: {},
    clock: fakeClock(1700000000000),
    logger: silentLogger(records),
    timers: timers,
    schedulerFactory: recordingSchedulerFactory(order, readyStatus)
  }, overrides || {});
  const app = taoUngDung(options);
  return {app: app, directory: directory, records: records, order: order, timers: timers};
}

test("foundation option resolver follows exact precedence and validation", function () {
  const pollCases = [
    ["canonical option", {schedulerPollMs: 800}, {}, 800, []],
    ["legacy option", {tickMs: 801}, {}, 801, ["tickMs"]],
    ["canonical environment", {}, {SCHEDULER_POLL_MS: "802"}, 802, []],
    ["legacy environment", {}, {THDC_NHIP: "803"}, 803, ["THDC_NHIP"]],
    ["default", {}, {}, 1000, []],
    ["canonical option wins conflicting aliases", {schedulerPollMs: 804, tickMs: 805},
      {SCHEDULER_POLL_MS: "806", THDC_NHIP: "807"}, 804, []],
    ["canonical environment wins legacy environment", {},
      {SCHEDULER_POLL_MS: "808", THDC_NHIP: "809"}, 808, []],
    ["selected canonical option hides invalid legacy environment", {schedulerPollMs: 810},
      {THDC_NHIP: "invalid"}, 810, []]
  ];
  pollCases.forEach(function (entry) {
    const resolved = resolveFoundationOptions(entry[1], entry[2]);
    assert.equal(resolved.schedulerPollMs, entry[3], entry[0]);
    assert.deepEqual(resolved.deprecatedAliases, entry[4], entry[0]);
  });

  const logCases = [
    ["canonical option", {schedulerLogTicks: false}, {THDC_AM: "1"}, false, []],
    ["canonical env", {}, {SCHEDULER_LOG_TICKS: "0", THDC_AM: "1"}, false, []],
    ["legacy env", {}, {THDC_AM: "1"}, true, ["THDC_AM"]],
    ["default", {}, {}, false, []]
  ];
  logCases.forEach(function (entry) {
    const resolved = resolveFoundationOptions(entry[1], entry[2]);
    assert.equal(resolved.schedulerLogTicks, entry[3], entry[0]);
    assert.deepEqual(resolved.deprecatedAliases, entry[4], entry[0]);
  });
  assert.equal(resolveFoundationOptions({schedulerLogTicks: true}, {}).schedulerLogTicks, true);
  assert.equal(resolveFoundationOptions({}, {}).cleanupMs, 3600000);
  assert.equal(resolveFoundationOptions({cleanupMs: 60000}, {}).cleanupMs, 60000);
  assert.throws(function () { resolveFoundationOptions({schedulerPollMs: 99}, {}); },
    /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({tickMs: 100.5}, {}); },
    /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({}, {SCHEDULER_POLL_MS: "800ms"}); },
    /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({}, {THDC_NHIP: "invalid"}); },
    /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({schedulerLogTicks: "true"}, {}); },
    /SCHEDULER_LOG_TICKS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({}, {SCHEDULER_LOG_TICKS: "true"}); },
    /SCHEDULER_LOG_TICKS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({}, {THDC_AM: "yes"}); },
    /SCHEDULER_LOG_TICKS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({cleanupMs: 0}, {}); }, /CLEANUP_MS_INVALID/);
  assert.throws(function () { resolveFoundationOptions({cleanupMs: "60000"}, {}); }, /CLEANUP_MS_INVALID/);

  const root = path.join(path.sep, "tmp", "foundation-root");
  assert.equal(resolveDbPath({dbPath: "option.sqlite"}, {THDC_DB: "env.sqlite"}, root), "option.sqlite");
  assert.equal(resolveDbPath({}, {THDC_DB: "env.sqlite"}, root), "env.sqlite");
  assert.equal(resolveDbPath({}, {}, root), path.join(root, "server", "data", "thdc.db"));
});

test("deprecated alias warning is scrubbed and exactly once", async function () {
  const cases = [
    ["legacy-option", {tickMs: 800}, {}, ["tickMs"]],
    ["legacy-poll-env", {}, {THDC_NHIP: "801"}, ["THDC_NHIP"]],
    ["legacy-log-env", {}, {THDC_AM: "1"}, ["THDC_AM"]]
  ];
  for (const entry of cases) {
    const aliasEvents = [];
    const aliasDirectory = tempDir("alias-" + entry[0]);
    let aliasApp = null;
    try {
      aliasApp = taoUngDung(Object.assign({}, entry[1], {
        clock: fakeClock(1700000000000),
        dbPath: tempDb(aliasDirectory),
        env: Object.assign({TOP_SECRET: "khong-duoc-log"}, entry[2]),
        logger: taoLogger(captureConsoleSink(aliasEvents)),
        schedulerFactory: recordingSchedulerFactory([], readyStatus)
      }));
      const warnings = aliasEvents.filter(function (entry0) {
        return entry0.info.event === "server.config.deprecated_alias";
      }).map(function (entry0) {
        return {level: entry0.level, event: entry0.info.event, at: entry0.info.at, alias: entry0.info.alias};
      });
      assert.deepEqual(warnings, entry[3].map(function (alias) {
        return {level: "warn", event: "server.config.deprecated_alias", at: 1700000000000, alias: alias};
      }));
      assert.doesNotMatch(JSON.stringify(aliasEvents), /khong-duoc-log/);
    } finally {
      if (aliasApp) await aliasApp.stop();
      removeDb(aliasDirectory);
    }
  }
});

test("factory is inert, exposes exact surface, and passes six-key instance-local context", async function () {
  const firstDirectory = tempDir("context-one");
  const secondDirectory = tempDir("context-two");
  const ignoredScheduler = {name: "must-not-be-used"};
  const timersOne = taoTimersGia();
  const timersTwo = taoTimersGia();
  let app1;
  let app2;
  try {
    const env1 = {
      PORT: "0", THDC_DB: path.join(firstDirectory, "ignored.sqlite"), THDC_NHIP: "800",
      THDC_AM: "1", THDC_PROXY: "1", THDC_GIOI_HAN: "9", THDC_GIOI_HAN_DN: "3"
    };
    app1 = taoUngDung({
      port: 0,
      dbPath: tempDb(firstDirectory, "chosen.sqlite"),
      env: env1,
      clock: fakeClock(1700000000000),
      logger: silentLogger(),
      timers: timersOne,
      scheduler: ignoredScheduler,
      schedulerFactory: recordingSchedulerFactory([], readyStatus)
    });
    app2 = taoUngDung({
      port: 0,
      dbPath: tempDb(secondDirectory),
      env: {THDC_PROXY: "0", THDC_GIOI_HAN: "19", THDC_GIOI_HAN_DN: "13"},
      clock: fakeClock(1700000000000),
      logger: silentLogger(),
      timers: timersTwo,
      schedulerFactory: recordingSchedulerFactory([], readyStatus)
    });
    assert.deepEqual(Object.keys(app1).sort(),
      ["api", "donRac", "getStatus", "kho", "nhip", "scheduler", "server", "start", "stop", "tg"].sort());
    assert.equal(app1.server.listening, false);
    assert.equal(timersOne.setCalls.length, 0);
    assert.notEqual(app1.scheduler, ignoredScheduler);
    assert.equal(app1.kho.duong, tempDb(firstDirectory, "chosen.sqlite"));
    assert.deepEqual(app1.scheduler.counters().context.schedulerOptions, {
      schedulerPollMs: 800,
      schedulerLogTicks: true,
      cleanupMs: 3600000
    });
    assert.deepEqual(Object.keys(app1.scheduler.counters().context).sort(),
      ["clock", "env", "kho", "logger", "schedulerOptions", "tg"]);
    assert.equal(app1.api.tinProxy, true);
    assert.equal(app1.api.nhipToiDa, 9);
    assert.equal(app1.api.nhipXacThuc, 3);
    assert.equal(app2.api.tinProxy, false);
    assert.equal(app2.api.nhipToiDa, 19);
    assert.equal(app2.api.nhipXacThuc, 13);
    assert.equal(app1.api.nhipToiDa, 9);
    assert.equal(app1.api.kho, app1.kho);
    assert.equal(app1.tg.kho, app1.kho);
  } finally {
    if (app2) await app2.stop();
    if (app1) await app1.stop();
    removeDb(secondDirectory);
    removeDb(firstDirectory);
  }

  assert.throws(function () {
    taoUngDung({dbPath: ":memory:", env: {}, logger: silentLogger()});
  }, /allowMemoryDb/);
  const memoryApp = taoUngDung({
    dbPath: ":memory:", allowMemoryDb: true, env: {}, logger: silentLogger(),
    schedulerFactory: recordingSchedulerFactory([], readyStatus)
  });
  await memoryApp.stop();
});

test("fake clock initializes engine and persisted account state deterministically", async function () {
  const direct = G.moiGame("Clock", "CLOCK-SEED", undefined, 1700000123);
  assert.equal(direct.now, 1700000123);
  assert.equal(direct.t0, 1700000123);
  assert.equal(direct.lastTick, 1700000123);
  assert.throws(function () { G.moiGame("Bad", "SEED", undefined, 1.5); }, /GAME_NOW_INVALID/);
  const legacy = G.moiGame("Legacy", "LEGACY-SEED");
  assert.equal(typeof legacy.now, "number");
  assert.ok(Array.isArray(legacy.planets));

  const fixture = taoApp("clock", {clock: fakeClock(1700000123000)});
  try {
    fixture.app.kho.q.tkThem.run("clock", "Clock", "x", "y", 1700000123, 1700000123);
    const id = fixture.app.kho.q.tkTheoTen.get("clock").id;
    const made = fixture.app.tg.taoDeQuoc(id, "Clock");
    assert.equal(made.loi, undefined);
    const persisted = JSON.parse(fixture.app.kho.q.dqGet.get(id).state);
    assert.deepEqual({now: persisted.now, t0: persisted.t0, lastTick: persisted.lastTick}, {
      now: 1700000123, t0: 1700000123, lastTick: 1700000123
    });
    assert.equal(fixture.app.kho.q.dqGet.get(id).capNhat, 1700000123);
  } finally {
    await fixture.app.stop();
    removeDb(fixture.directory);
  }
});

test("factory gives API one lazy-bootstrap capability backed by the scheduler bridge", async function () {
  const directory = tempDir("lazy-bootstrap-contract");
  const calls = [];
  let app;
  try {
    app = taoUngDung({
      port: 0,
      dbPath: tempDb(directory),
      env: {},
      clock: fakeClock(1700000123000),
      logger: silentLogger(),
      schedulerFactory: function () {
        return {
          start: async function () {}, stop: async function () {},
          getStatus: readyStatus,
          runCommand: async function (command) {
            calls.push(command.name);
            return command.run();
          },
          schedule: function () {}, cancel: function () {}, reconcile: function () {}, advanceTo: function () {}
        };
      },
      testHooks: {
        createApi: function (kho, world, options) {
          assert.equal(typeof options.ensureUniverseBootstrap, "function");
          return new API(kho, world, options);
        }
      }
    });
    assert.equal(typeof app.api.ensureUniverseBootstrap, "function");
    assert.equal(await app.api.ensureUniverseBootstrap(), app.tg.seed());
    assert.deepEqual(calls, ["universe-bootstrap"]);
  } finally {
    if (app) await app.stop();
    removeDb(directory);
  }
});

test("default factory applies schema before world creation and exposes legacy through the real bridge",
  async function () {
  const directory = tempDir("real-default-bridge");
  const order = [];
  let app;
  try {
    app = taoUngDung({
      port: 0,
      dbPath: tempDb(directory),
      env: {},
      clock: fakeClock(1700000123000),
      logger: silentLogger(),
      applySchedulerMigration: function (kho, nowMs) {
        order.push("migration");
        return apDungMigrationScheduler(kho, nowMs);
      },
      testHooks: {
        createWorld: function (kho, options) {
          order.push("world");
          return new TheGioi(kho, options);
        }
      }
    });
    assert.deepEqual(order, ["migration", "world"]);
    assert.equal(app.scheduler.getStatus().mode, "legacy");
    assert.equal(app.scheduler.getStatus().ready, false);
  } finally {
    if (app) await app.stop();
    removeDb(directory);
  }
});

test("instance clock drives API rate, account, session, chat, migration, and world timestamps", async function () {
  let nowMs = 1700000123000;
  const clock = {nowMs: function () { return nowMs; }};
  const fixture = taoApp("clock-paths", {
    clock: clock,
    env: {THDC_PROXY: "1", THDC_GIOI_HAN: "9", THDC_GIOI_HAN_DN: "3"}
  });
  function req(body, token) {
    const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    stream.method = body === undefined ? "GET" : "POST";
    stream.headers = token ? {"x-thdc-token": token, "x-forwarded-for": "203.0.113.9"} :
      {"x-forwarded-for": "203.0.113.9"};
    stream.socket = {remoteAddress: "127.0.0.1"};
    return stream;
  }
  function res() {
    return {
      headersSent: false,
      writableEnded: false,
      writeHead: function (status, headers) {
        this.status = status;
        this.headers = headers;
        this.headersSent = true;
      },
      end: function (body) {
        this.body = body ? String(body) : "";
        this.writableEnded = true;
      }
    };
  }
  try {
    const directInfoApi = new API(fixture.app.kho, fixture.app.tg, {
      clock: clock,
      logger: silentLogger(),
      scheduler: fixture.app.scheduler,
      env: {},
      gameNow: function () { return Math.floor(clock.nowMs() / 1000); },
      getUniverseSeed: function () { return "CLOCK-INFO-SEED"; },
      ensureUniverseBootstrap: async function () { return "CLOCK-INFO-SEED"; }
    });
    assert.equal(directInfoApi.thongTin().now, 1700000123);
    assert.equal(fixture.app.api.gioiHan("clock-window", 1), true);
    assert.equal(fixture.app.api.gioiHan("clock-window", 1), false);
    nowMs += 10001;
    assert.equal(fixture.app.api.gioiHan("clock-window", 1), true);
    nowMs = 1700000123000;

    const registerRes = res();
    await fixture.app.api.xuLy(req({ten: "clockapi", mk: "secret-123", hienthi: "Clock API"}),
      registerRes, "/api/dangky", new URLSearchParams());
    assert.equal(registerRes.status, 200);
    const registered = JSON.parse(registerRes.body);
    const account = fixture.app.kho.q.tkTheoTen.get("clockapi");
    const firstSession = fixture.app.kho.q.phienGet.get(registered.token);
    const firstState = JSON.parse(fixture.app.kho.q.dqGet.get(account.id).state);
    assert.deepEqual({tao: account.tao, vaoCuoi: account.vaoCuoi}, {tao: 1700000123, vaoCuoi: 1700000123});
    assert.deepEqual({tao: firstSession.tao, hetHan: firstSession.hetHan}, {
      tao: 1700000123,
      hetHan: 1700000123 + 30 * 86400
    });
    assert.deepEqual({now: firstState.now, t0: firstState.t0, lastTick: firstState.lastTick}, {
      now: 1700000123,
      t0: 1700000123,
      lastTick: 1700000123
    });
    assert.equal(fixture.app.kho.cauhinh("moLuc"), "1700000123");

    nowMs = 1700001123000;
    const loginRes = res();
    await fixture.app.api.xuLy(req({ten: "clockapi", mk: "secret-123"}), loginRes,
      "/api/dangnhap", new URLSearchParams());
    assert.equal(loginRes.status, 200);
    const loggedIn = JSON.parse(loginRes.body);
    assert.equal(fixture.app.kho.q.tkTheoId.get(account.id).vaoCuoi, 1700001123);
    assert.equal(fixture.app.kho.q.phienGet.get(loggedIn.token).tao, 1700001123);

    fixture.app.kho.q.phienThem.run("expired-clock-token", account.id, 1, 2);
    const commands = [];
    const runCommand = fixture.app.scheduler.runCommand;
    fixture.app.scheduler.runCommand = function (command) {
      commands.push({name: command.name, accountId: command.accountId});
      return runCommand(command);
    };
    const commandsAtExpiry = commands.length;
    assert.deepEqual(
      fixture.app.api.phien({headers: {"x-thdc-token": "expired-clock-token"}}),
      {expiredToken: "expired-clock-token", tk: account.id}
    );
    assert.ok(fixture.app.kho.q.phienGet.get("expired-clock-token"));
    assert.equal(commands.length, commandsAtExpiry);
    const expiryRes = res();
    await fixture.app.api.xuLy(
      req(undefined, "expired-clock-token"), expiryRes, "/api/state", new URLSearchParams()
    );
    assert.equal(expiryRes.status, 401);
    assert.deepEqual(commands.slice(commandsAtExpiry), [
      {name: "session-expiry", accountId: account.id}
    ]);
    assert.equal(fixture.app.kho.q.phienGet.get("expired-clock-token"), undefined);

    const chatRes = res();
    await fixture.app.api.xuLy(req({kenh: "chung", noi: "clocked chat"}, loggedIn.token), chatRes,
      "/api/chat", new URLSearchParams());
    assert.equal(chatRes.status, 200);
    const chat = fixture.app.kho.db.prepare("SELECT * FROM chat ORDER BY id DESC LIMIT 1").get();
    assert.equal(chat.khi, 1700001123);
    assert.equal(chat.noi, "clocked chat");

    fixture.app.kho.q.tkThem.run("clock-target", "Clock Target", "x", "y", 1700001123, 1700001123);
    const targetId = fixture.app.kho.q.tkTheoTen.get("clock-target").id;
    fixture.app.tg.taoDeQuoc(targetId, "Clock Target");
    nowMs = 1700002123000;
    assert.equal(fixture.app.tg.tuyenChien(account.id, targetId), null);
    assert.equal(fixture.app.kho.q.chienGetTK.get(account.id, targetId).khi, 1700002123);
    assert.equal(fixture.app.kho.q.btDS.all(1)[0].khi, 1700002123);

    const legacyState = JSON.parse(fixture.app.kho.q.dqGet.get(account.id).state);
    legacyState.v = 5;
    fixture.app.kho.q.dqLuuState.run(JSON.stringify(legacyState), 1, account.id);
    nowMs = 1700003123000;
    assert.equal(fixture.app.tg.nangCapDuLieu(), 1);
    const migrated = fixture.app.kho.q.dqGet.get(account.id);
    assert.equal(JSON.parse(migrated.state).v, G.STATE_VERSION);
    assert.equal(migrated.capNhat, 1700003123);
  } finally {
    await fixture.app.stop();
    removeDb(fixture.directory);
  }
});

test("in-process handler preserves known client errors and scrubs unknown failures", async function () {
  const fixture = taoApp("handler-errors");
  const app = fixture.app;
  app.server.listen = function () {
    queueMicrotask(function () { app.server.emit("listening"); });
    return app.server;
  };

  function openRequest(pathname, method, token) {
    const req = new PassThrough();
    req.url = pathname;
    req.method = method;
    req.headers = token ? {"x-thdc-token": token} : {};
    req.socket = {remoteAddress: "127.0.0.1"};
    let resolveResponse;
    const response = new Promise(function (resolve) { resolveResponse = resolve; });
    const res = {
      headersSent: false,
      writableEnded: false,
      writeHead: function (status, headers) {
        this.status = status;
        this.headers = headers;
        this.headersSent = true;
      },
      end: function (body) {
        this.body = body ? String(body) : "";
        this.writableEnded = true;
        resolveResponse({status: this.status, headers: this.headers, body: this.body});
      }
    };
    app.server.emit("request", req, res);
    return {req: req, response: response};
  }

  function assertJsonHeaders(result) {
    assert.equal(result.headers["Content-Type"], "application/json; charset=utf-8");
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(result.headers["X-Content-Type-Options"], "nosniff");
  }

  try {
    await app.start();

    const invalidTarget = openRequest("http://[", "GET");
    invalidTarget.req.end();
    const invalidTargetResult = await invalidTarget.response;
    assert.equal(invalidTargetResult.status, 400);
    assert.equal(invalidTargetResult.body, "Đường dẫn không hợp lệ.");
    assert.equal(invalidTargetResult.headers["Content-Type"], "text/plain; charset=utf-8");

    const malformedPath = openRequest("/api/%E0%A4%A", "GET");
    malformedPath.req.end();
    const malformedPathResult = await malformedPath.response;
    assert.equal(malformedPathResult.status, 400);
    assert.equal(malformedPathResult.body, "Đường dẫn không hợp lệ.");

    const originalXuLy = app.api.xuLy;
    let parsedTarget = null;
    app.api.xuLy = async function (req, res, pathname, query) {
      parsedTarget = {
        pathname: pathname,
        plus: query.get("plus"),
        utf8: query.get("utf8"),
        repeated: query.getAll("r")
      };
      return originalXuLy.call(this, req, res, pathname, query);
    };
    try {
      const encoded = openRequest(
        "/api/%74hongtin?plus=a+b&utf8=%E2%9C%93&r=mot&r=hai",
        "GET"
      );
      encoded.req.end();
      assert.equal((await encoded.response).status, 200);
    } finally {
      app.api.xuLy = originalXuLy;
    }
    assert.deepEqual(parsedTarget, {
      pathname: "/api/thongtin",
      plus: "a b",
      utf8: "✓",
      repeated: ["mot", "hai"]
    });

    const malformed = openRequest("/api/dangky", "POST");
    malformed.req.end("{");
    const malformedResult = await malformed.response;
    assert.equal(malformedResult.status, 400);
    assert.deepEqual(JSON.parse(malformedResult.body), {loi: "JSON không hợp lệ."});
    assertJsonHeaders(malformedResult);

    const oversized = openRequest("/api/dangky", "POST");
    oversized.req.end(Buffer.alloc(96 * 1024 + 1, "x"));
    const oversizedResult = await oversized.response;
    assert.equal(oversizedResult.status, 413);
    assert.deepEqual(JSON.parse(oversizedResult.body), {loi: "Dữ liệu gửi lên quá lớn."});
    assertJsonHeaders(oversizedResult);

    app.kho.q.tkThem.run("revoked", "Revoked", "hash", "salt", 1700000000, 1700000000);
    const accountId = app.kho.q.tkTheoTen.get("revoked").id;
    app.kho.q.phienThem.run("revoked-token", accountId, 1700000000, 1700003600);
    const revoked = openRequest("/api/doimk", "POST", "revoked-token");
    await new Promise(function (resolve) { setImmediate(resolve); });
    assert.ok(revoked.req.listenerCount("end") > 0);
    revoked.req.write(JSON.stringify({cu: "old-password", moi: "new-password"}));
    app.kho.q.phienXoa.run("revoked-token");
    revoked.req.end();
    const revokedResult = await revoked.response;
    assert.equal(revokedResult.status, 401);
    assert.deepEqual(JSON.parse(revokedResult.body), {loi: "Phiên đăng nhập đã hết hạn."});
    assertJsonHeaders(revokedResult);
    assert.equal(fixture.records.filter(function (entry) {
      return entry.info.event === "http.error";
    }).length, 0);

    app.api.xuLy = async function () {
      const error = new Error("unsafe token=secret body=password state=hidden");
      error.ma = 500;
      error.code = "INTERNAL_TEST";
      throw error;
    };
    const internal = openRequest("/api/thongtin", "GET");
    internal.req.end();
    const internalResult = await internal.response;
    assert.equal(internalResult.status, 500);
    assert.deepEqual(JSON.parse(internalResult.body), {loi: "Lỗi máy chủ."});
    assertJsonHeaders(internalResult);
    const internalLog = fixture.records.filter(function (entry) {
      return entry.info.event === "http.error";
    }).at(-1);
    assert.equal(internalLog.info.code, "INTERNAL_TEST");
    assert.doesNotMatch(JSON.stringify(internalLog), /secret|password|hidden/);

    app.api.xuLy = async function () {
      const error = new Error("must-not-leak");
      error.ma = "400";
      throw error;
    };
    const invalidClientCode = openRequest("/api/thongtin", "GET");
    invalidClientCode.req.end();
    const invalidResult = await invalidClientCode.response;
    assert.equal(invalidResult.status, 500);
    assert.deepEqual(JSON.parse(invalidResult.body), {loi: "Lỗi máy chủ."});
    assert.doesNotMatch(invalidResult.body, /must-not-leak/);
  } finally {
    await app.stop().catch(function () {});
    removeDb(fixture.directory);
  }
});

test("Kho choRanh waits through real outer commit and rollback", async function () {
  const depths = [];
  const kho = new Kho(":memory:", {allowMemoryDb: true, onIdleWait: function (depth) { depths.push(depth); }});
  try {
    let commitSettled = false;
    let commitWait;
    kho.trongGiaoDich(function () {
      commitWait = kho.choRanh().then(function () { commitSettled = true; });
      assert.equal(commitSettled, false);
      kho.cauhinh("idle-commit", "yes");
    });
    assert.equal(commitSettled, false);
    await commitWait;
    assert.equal(commitSettled, true);

    let rollbackSettled = false;
    let rollbackWait;
    assert.throws(function () {
      kho.trongGiaoDich(function () {
        rollbackWait = kho.choRanh().then(function () { rollbackSettled = true; });
        assert.equal(rollbackSettled, false);
        throw new Error("rollback-idle");
      });
    }, /rollback-idle/);
    assert.equal(rollbackSettled, false);
    await rollbackWait;
    assert.equal(rollbackSettled, true);
    assert.deepEqual(depths, [1, 1]);
  } finally {
    kho.dong();
  }
});

test("world rule hooks are inventory-locked, nested, synchronous, and instance-isolated", async function () {
  const dir1 = tempDir("hook-one");
  const dir2 = tempDir("hook-two");
  const priorHook = G.HOOK;
  let app1;
  let app2;
  try {
    app1 = taoUngDung({dbPath: tempDb(dir1), env: {}, clock: fakeClock(1700000000000),
      logger: silentLogger(), schedulerFactory: recordingSchedulerFactory([], readyStatus)});
    assert.equal(G.HOOK, priorHook);
    app2 = taoUngDung({dbPath: tempDb(dir2), env: {}, clock: fakeClock(1700000000000),
      logger: silentLogger(), schedulerFactory: recordingSchedulerFactory([], readyStatus)});
    assert.equal(G.HOOK, priorHook);

    const internalMethods = new Set([
      "constructor", "veHook", "withRulesHook", "datScheduler", "datAdvanceService",
      "trongMutationScheduler", "_schedulerActive", "_tickNoiBo", "advanceAccountNoiBo",
      "_assertSchedulerFinalFence", "_dongBoSchedulerLuu", "_dongBoSchedulerCreations"
    ]);
    const actualMethods = Object.getOwnPropertyNames(TheGioi.prototype)
      .filter(function (name) { return !internalMethods.has(name); })
      .sort();
    assert.deepEqual(actualMethods, RULES_HOOK_METHODS.slice().sort());
    assert.equal(Object.isFrozen(RULES_HOOK_METHODS), true);

    const nestedError = new Error("nested-world");
    assert.throws(function () {
      app1.tg.withRulesHook(function () {
        assert.equal(G.HOOK, app1.tg.rulesHook);
        try {
          app2.tg.withRulesHook(function () {
            assert.equal(G.HOOK, app2.tg.rulesHook);
            throw nestedError;
          });
        } finally {
          assert.equal(G.HOOK, app1.tg.rulesHook);
        }
      });
    }, function (error) { return error === nestedError; });
    assert.equal(G.HOOK, priorHook);
    assert.throws(function () {
      app1.tg.withRulesHook(function () { return Promise.resolve(); });
    }, function (error) {
      return error instanceof TypeError && error.message === "WORLD_RULES_HOOK_ASYNC" &&
        error.code === "WORLD_RULES_HOOK_ASYNC";
    });
    assert.equal(G.HOOK, priorHook);

    app1.kho.q.tkThem.run("hook", "Hook", "x", "y", 1700000000, 1700000000);
    const id = app1.kho.q.tkTheoTen.get("hook").id;
    const made = app1.tg.taoDeQuoc(id, "Hook");
    const before2 = snapshot(app2.kho);
    let npcCoordinate = null;
    for (let h = 1; h <= G.C.SO_HE && !npcCoordinate; h++) {
      for (let p = 1; p <= G.C.SO_HANH_TINH; p++) {
        const c = G.toaDo(1, h, p);
        if (G.coNPC(made.st.seed, c)) { npcCoordinate = c; break; }
      }
    }
    assert.ok(npcCoordinate);
    app1.tg.xemHe(id, npcCoordinate.g, npcCoordinate.h);
    assert.ok(app1.kho.db.prepare("SELECT COUNT(*) n FROM npc").get().n > 0);
    assert.equal(snapshot(app2.kho), before2);
    assert.equal(G.HOOK, priorHook);
  } finally {
    if (app2) await app2.stop();
    if (app1) await app1.stop();
    assert.equal(G.HOOK, priorHook);
    removeDb(dir2);
    removeDb(dir1);
  }
});

test("world exposes a read-only state seam but no public authoritative tick bypass", function () {
  assert.equal(typeof TheGioi.prototype.layStateNoiBo, "function");
  assert.equal(RULES_HOOK_METHODS.includes("layStateNoiBo"), true);
  assert.equal(RULES_HOOK_METHODS.includes("tick"), false);
  assert.equal(Object.hasOwn(TheGioi.prototype, "tick"), false,
    "server-side advancement must be owned by the leased GameAdvanceService");
});

test("construction failures close only the acquired DB and preserve the original cause", function () {
  const cases = ["logger-open", "world", "schedulerFactory", "api"];
  cases.forEach(function (kind) {
    const directory = tempDir("construction-" + kind);
    const dbPath = tempDb(directory);
    const cause = new Error("construction-" + kind);
    const events = [];
    const schedulerOrder = [];
    const timers = taoTimersGia();
    const options = {
      dbPath: dbPath,
      env: {},
      clock: fakeClock(1700000000000),
      logger: silentLogger(),
      timers: timers,
      lifecycleObserver: function (event) { events.push(event); },
      schedulerFactory: recordingSchedulerFactory(schedulerOrder, readyStatus),
      testHooks: {}
    };
    if (kind === "logger-open") {
      options.logger = {
        debug: function () {}, warn: function () {}, error: function () {},
        info: function (entry) { if (entry.event === "db.opened") throw cause; }
      };
    } else if (kind === "world") {
      options.testHooks.createWorld = function (kho) {
        const close = kho.dong.bind(kho);
        kho.dong = function () {
          close();
          throw new Error("construction-cleanup-must-not-win");
        };
        throw cause;
      };
    } else if (kind === "schedulerFactory") {
      options.schedulerFactory = function () { throw cause; };
    } else {
      options.testHooks.createApi = function () { throw cause; };
    }
    assert.throws(function () { taoUngDung(options); }, function (error) { return error === cause; }, kind);
    assert.deepEqual(events.filter(function (event) {
      return event === "db.opened" || event === "db.close";
    }), ["db.opened", "db.close"], kind);
    assert.equal(timers.setCalls.length, 0, kind);
    assert.deepEqual(schedulerOrder, [], kind);
    const reopened = new Kho(dbPath);
    reopened.dong();
    removeDb(directory);
  });
});

test("default logger uses console-shaped sink during factory construction", async function () {
  const directory = tempDir("default-console");
  const calls = [];
  const originals = {};
  for (const level of ["debug", "info", "warn", "error"]) {
    originals[level] = console[level];
    console[level] = function (entry) { calls.push({level: level, entry: entry}); };
  }
  let app;
  try {
    app = taoUngDung({dbPath: tempDb(directory), env: {}, clock: fakeClock(1700000000000),
      schedulerFactory: recordingSchedulerFactory([], readyStatus)});
    assert.ok(calls.some(function (entry) { return entry.entry.event === "db.opened"; }));
  } finally {
    if (app) await app.stop();
    for (const level of ["debug", "info", "warn", "error"]) console[level] = originals[level];
    removeDb(directory);
  }
});

test("legacy facade require is inert and memoizes coherent getters", async function () {
  const directory = tempDir("legacy");
  const dbPath = tempDb(directory);
  const modulePath = require.resolve("../server/index.js");
  const oldDb = process.env.THDC_DB;
  const oldPort = process.env.PORT;
  const realSetInterval = global.setInterval;
  let intervalCalls = 0;
  try {
    process.env.THDC_DB = dbPath;
    process.env.PORT = "0";
    delete require.cache[modulePath];
    global.setInterval = function () { intervalCalls++; return realSetInterval.apply(this, arguments); };
    const facade = require("../server/index.js");
    assert.equal(intervalCalls, 0);
    assert.equal(fs.existsSync(dbPath), false);
    assert.equal(facade.server, facade.server);
    assert.equal(facade.kho, facade.tg.kho);
    assert.equal(facade.kho, facade.api.kho);
    assert.equal(facade.api, facade.api);
    assert.equal(facade.server.listening, false);
    assert.equal(intervalCalls, 0);
    assert.equal(path.resolve(facade.kho.duong), path.resolve(dbPath));
    await facade.getLegacyApp().stop();
  } finally {
    global.setInterval = realSetInterval;
    if (oldDb === undefined) delete process.env.THDC_DB; else process.env.THDC_DB = oldDb;
    if (oldPort === undefined) delete process.env.PORT; else process.env.PORT = oldPort;
    delete require.cache[modulePath];
    removeDb(directory);
  }
});

test("recovering listener exposes probes while gameplay remains unavailable", async function (t) {
  const directory = tempDir("recovering");
  const deferred = taoDeferred();
  const app = taoUngDung({
    port: 0,
    dbPath: tempDb(directory),
    env: {},
    clock: fakeClock(1700000000000),
    logger: silentLogger(),
    timers: taoTimersGia(),
    schedulerFactory: function () {
      return {
        start: function () { return deferred.promise; },
        stop: async function () {},
        getStatus: function () { return {state: "recovering", ready: false}; },
        runCommand: function (command) { return command.run(); },
        schedule: function () {}, cancel: function () {}, reconcile: function () {}, advanceTo: function () {}
      };
    }
  });
  try {
    const listening = new Promise(function (resolve) { app.server.once("listening", resolve); });
    const starting = app.start();
    try {
      await Promise.race([
        listening,
        starting.then(function () { throw new Error("start resolved before deferred scheduler"); })
      ]);
    } catch (error) {
      if (error && (error.code === "EPERM" || error.code === "EACCES")) {
        t.skip("sandbox bind " + error.code);
        return;
      }
      throw error;
    }
    const health = await request(app.server, "/healthz");
    const ready = await request(app.server, "/readyz");
    const metrics = await request(app.server, "/metrics");
    const gameplay = await request(app.server, "/api/thongtin");
    assert.equal(health.status, 200);
    assert.equal(ready.status, 503);
    assert.equal(metrics.status, 200);
    assert.equal(gameplay.status, 503);
    assert.equal(app.getStatus().state, "recovering");
    deferred.resolve();
    await starting;
  } finally {
    deferred.resolve();
    await app.stop().catch(function () {});
    removeDb(directory);
  }
});

test("healthy lifecycle, readiness, static bytes, HTTP scrub, and inflight drain", async function (t) {
  const events = [];
  const order = [];
  const records = [];
  const deferred = taoDeferred();
  const entered = taoDeferred();
  let hookEnabled = false;
  const timers = taoTimersGia();
  const directory = tempDir("lifecycle");
  let bindCount = 0;
  const app = taoUngDung({
    port: 0,
    dbPath: tempDb(directory),
    env: {},
    clock: fakeClock(1700000000000),
    logger: silentLogger(records),
    timers: timers,
    lifecycleObserver: function (event) { events.push(event); },
    schedulerFactory: recordingSchedulerFactory(order, readyStatus),
    testHooks: {
      beforeApiDispatch: function () {
        if (hookEnabled) {
          entered.resolve();
          return deferred.promise;
        }
      },
      onWaitForUowIdle: function () { order.push("wait.uow.public"); }
    }
  });
  app.server.on("listening", function () { bindCount++; });
  try {
    try {
      await Promise.all([app.start(), app.start()]);
    } catch (error) {
      if (error && (error.code === "EPERM" || error.code === "EACCES")) {
        t.skip("sandbox bind " + error.code);
        return;
      }
      throw error;
    }
    assert.equal(app.scheduler.counters().starts, 1);
    assert.equal(bindCount, 1);
    assert.equal(timers.setCalls.length, 2);
    const health = await request(app.server, "/healthz");
    const ready = await request(app.server, "/readyz");
    const metrics = await request(app.server, "/metrics");
    assert.equal(health.status, 200);
    assert.equal(ready.status, 200);
    assert.equal(metrics.status, 200);

    const webRoot = await request(app.server, "/");
    const webIndex = await request(app.server, "/index.html");
    const solo = await request(app.server, "/solo");
    const motNguoi = await request(app.server, "/motnguoi");
    assert.match(webRoot.body, /web\/js\/mp\.js/);
    assert.match(webIndex.body, /web\/js\/mp\.js/);
    assert.match(solo.body, /js\/main\.js/);
    assert.match(motNguoi.body, /js\/main\.js/);
    assert.notEqual(webRoot.body, solo.body);
    const traversal = await request(app.server, "/web/%2e%2e/server/app.js");
    assert.equal(traversal.status, 404);
    assert.equal(webRoot.headers["x-content-type-options"], "nosniff");

    app.api.xuLy = async function () {
      const error = new Error("unsafe token=secret body=password state=hidden");
      error.code = "HTTP_TEST";
      throw error;
    };
    const failed = await request(app.server, "/api/thongtin");
    assert.equal(failed.status, 500);
    assert.deepEqual(JSON.parse(failed.body), {loi: "Lỗi máy chủ."});
    assert.match(failed.headers["content-type"], /^application\/json/);
    assert.equal(failed.headers["cache-control"], "no-store");
    assert.equal(failed.headers["x-content-type-options"], "nosniff");
    assert.ok(events.includes("http.error"));
    const httpLog = records.find(function (entry) { return entry.info.event === "http.error"; });
    assert.equal(httpLog.info.code, "HTTP_TEST");
    assert.equal(Object.hasOwn(httpLog.info, "body"), false);
    assert.equal(Object.hasOwn(httpLog.info, "token"), false);
    assert.equal(Object.hasOwn(httpLog.info, "state"), false);
    assert.doesNotMatch(JSON.stringify(httpLog), /secret|password|hidden/);

    app.api.xuLy = async function (req, res) {
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end("{}");
    };
    hookEnabled = true;
    const activeRequest = request(app.server, "/api/state");
    await entered.promise;
    const stopA = app.stop();
    const stopB = app.stop();
    await new Promise(function (resolve) { setImmediate(resolve); });
    assert.equal(app.scheduler.counters().stops, 0);
    deferred.resolve();
    await activeRequest;
    await Promise.all([stopA, stopB]);
    assert.equal(app.scheduler.counters().stops, 1);
    assert.deepEqual(timers.clearCalls, timers.handles);
    assert.deepEqual(events.filter(function (event) {
      return ["draining", "admission.close", "listener.close", "wait.inflight", "wait.uow",
        "scheduler.stop", "timer.clear", "db.close"].includes(event);
    }), ["draining", "admission.close", "listener.close", "wait.inflight", "wait.uow",
      "scheduler.stop", "timer.clear", "db.close"]);
    assert.equal(order.filter(function (entry) { return entry === "wait.uow.public"; }).length, 1);
  } finally {
    await app.stop().catch(function () {});
    removeDb(directory);
  }
});

test("migration failure closes only DB and preserves the migration error", async function () {
  const directory = tempDir("start-failure-migration");
  const events = [];
  const order = [];
  const timers = taoTimersGia();
  const app = taoUngDung({
    port: 0,
    dbPath: tempDb(directory),
    env: {},
    clock: fakeClock(1700000000000),
    logger: silentLogger(),
    timers: timers,
    lifecycleObserver: function (event) { events.push(event); },
    schedulerFactory: recordingSchedulerFactory(order, readyStatus)
  });
  try {
    app.kho.db.exec("PRAGMA foreign_keys=OFF");
    app.kho.db.prepare("INSERT INTO dq(tk,state,lastTick,keTiep,capNhat) VALUES(?,?,?,?,?)")
      .run(999, "{bad-json", 0, 0, 0);
    let caught;
    try { await app.start(); } catch (failure) { caught = failure; }
    assert.ok(caught instanceof Error);
    assert.match(caught.message, /JSON/);
    assert.ok(events.includes("migration.failed"));
    assert.equal(order.includes("scheduler.start"), false);
    assert.equal(events.includes("listener.close"), false);
    assert.equal(timers.setCalls.length, 0);
    assert.equal(events.filter(function (event) { return event === "db.close"; }).length, 1);
    await Promise.all([app.stop(), app.stop()]);
    assert.equal(events.filter(function (event) { return event === "db.close"; }).length, 1);
  } finally {
    await app.stop().catch(function () {});
    removeDb(directory);
  }
});

test("timer cleanup attempts every handle and preserves an original start failure", async function () {
  async function runScenario(label, failStart) {
    const directory = tempDir("timer-clear-" + label);
    const events = [];
    const handles = [{name: label + "-tick"}, {name: label + "-cleanup"}];
    const clearCalls = [];
    const clearError = new Error(label + "-clear-first");
    const startError = new Error(label + "-start-original");
    let nextHandle = 0;
    let schedulerStops = 0;
    const logger = {
      debug: function () {},
      warn: function () {},
      error: function () {},
      info: function (entry) {
        if (failStart && entry.event === "server.started") throw startError;
      }
    };
    const app = taoUngDung({
      port: 0,
      dbPath: tempDb(directory),
      env: {},
      clock: fakeClock(1700000000000),
      logger: logger,
      lifecycleObserver: function (event) { events.push(event); },
      timers: {
        setInterval: function () { return handles[nextHandle++]; },
        clearInterval: function (handle) {
          clearCalls.push(handle);
          if (clearCalls.length === 1) throw clearError;
        }
      },
      schedulerFactory: function () {
        return {
          start: async function () {},
          stop: async function () { schedulerStops++; },
          getStatus: readyStatus,
          runCommand: function (command) { return command.run(); },
          schedule: function () {}, cancel: function () {}, reconcile: function () {}, advanceTo: function () {}
        };
      }
    });
    app.server.listen = function () {
      queueMicrotask(function () { app.server.emit("listening"); });
      return app.server;
    };
    try {
      if (failStart) {
        let caught;
        try { await app.start(); } catch (error) { caught = error; }
        assert.equal(caught, startError);
      } else {
        await app.start();
        const firstStop = app.stop();
        const secondStop = app.stop();
        assert.equal(firstStop, secondStop);
        const settled = await Promise.allSettled([firstStop, secondStop]);
        assert.equal(settled[0].status, "rejected");
        assert.equal(settled[0].reason, clearError);
        assert.equal(settled[1].reason, clearError);
      }
      assert.deepEqual(clearCalls, handles);
      assert.equal(schedulerStops, 1);
      assert.equal(events.filter(function (event) { return event === "timer.clear"; }).length, 1);
      assert.equal(events.filter(function (event) { return event === "db.close"; }).length, 1);
      return {app: app, directory: directory};
    } catch (error) {
      await app.stop().catch(function () {});
      removeDb(directory);
      throw error;
    }
  }

  const healthy = await runScenario("healthy", false);
  removeDb(healthy.directory);
  const failedStart = await runScenario("failed-start", true);
  await failedStart.app.stop();
  removeDb(failedStart.directory);
});

test("scheduler-start and timer failures clean only acquired resources", async function (t) {
  async function runCase(kind) {
    const directory = tempDir("start-failure-" + kind);
    const events = [];
    const order = [];
    const error = new Error(kind + "-original");
    const timers = taoTimersGia(kind === "timer" ? error : null);
    const app = taoUngDung({
      port: 0,
      dbPath: tempDb(directory),
      env: {},
      clock: fakeClock(1700000000000),
      logger: silentLogger(),
      timers: timers,
      lifecycleObserver: function (event) { events.push(event); },
      schedulerFactory: recordingSchedulerFactory(order, readyStatus, kind === "scheduler" ? error : null)
    });
    try {
      let caught;
      try { await app.start(); } catch (failure) { caught = failure; }
      if (caught && (caught.code === "EPERM" || caught.code === "EACCES")) {
        t.skip(kind + " blocked by sandbox bind " + caught.code);
        return false;
      }
      if (kind === "scheduler") {
        assert.equal(caught, error, kind);
        assert.ok(events.includes("listener.close"));
        assert.equal(order.includes("scheduler.stop"), false);
        assert.equal(timers.setCalls.length, 0);
      } else {
        assert.equal(caught, error, kind);
        assert.deepEqual(timers.clearCalls, [timers.handles[0]]);
        assert.equal(app.scheduler.counters().stops, 1);
      }
      await Promise.all([app.stop(), app.stop()]);
      return true;
    } finally {
      await app.stop().catch(function () {});
      removeDb(directory);
    }
  }
  const scheduler = await runCase("scheduler");
  if (!scheduler) return;
  await runCase("timer");
});
