/* Foundation Task 7: every durable mutation crosses one scheduler bridge. */
"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {PassThrough} = require("node:stream");
const {taoUngDung} = require("../server/app.js");
const {API, bam} = require("../server/api.js");
const {G} = require("../server/rules.js");
// Add once beside the existing Foundation imports. The lazy load preserves
// the historical positive-count missing-module RED and keeps remediation
// test registration independent from module initialization.
const {Kho} = require('../server/db.js');
const {TheGioi} = require('../server/world.js');
function migrationModule() {
  return require('../server/scheduler/migrations.js');
}
function apDungMigrationScheduler(kho, nowMs) {
  return migrationModule().apDungMigrationScheduler(kho, nowMs);
}
function runMaintenanceCutoverForTest(context) {
  return require('../server/scheduler/cutover.js').runMaintenanceCutover(context);
}

const NOW_MS = 1700000000000;
const NOW_S = Math.floor(NOW_MS / 1000);
const PASSWORD = "scheduler-secret";
const PASSWORD_SALT = "0123456789abcdef0123456789abcdef";
const PASSWORD_HASH = bam(PASSWORD, PASSWORD_SALT);
const transientBodies = {
  SCHEDULER_UNAVAILABLE: {
    loi: "Máy chủ đang đồng bộ, hãy thử lại.",
    code: "SCHEDULER_UNAVAILABLE"
  },
  GLOBAL_BARRIER_PENDING: {
    loi: "Máy chủ đang đồng bộ, hãy thử lại.",
    code: "GLOBAL_BARRIER_PENDING"
  }
};

function tempDb(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-scheduler-" + label + "-"));
  return path.join(directory, "game.sqlite");
}

function removeDb(filename) {
  fs.rmSync(path.dirname(filename), {recursive: true, force: true});
}

let soKhoTam = 0;
function taoKhoTam() {
  var file = tempDb('migration-' + (++soKhoTam));
  return { kho: new Kho(file), file: file };
}
function dongKhoTam(x) {
  x.kho.dong();
  removeDb(x.file);
}
function voiKhoTam(t, fn) {
  var x = taoKhoTam();
  t.after(function () { dongKhoTam(x); });
  return fn(x);
}
function tableColumns(kho, table) {
  return kho.db.prepare('PRAGMA table_info(' + table + ')').all()
    .map(function (row) { return row.name; });
}
function tableInfo(kho, table) {
  return kho.db.prepare('PRAGMA table_info(' + table + ')').all();
}
function schedulerSchemaObjects(kho) {
  return kho.db.prepare(
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE " +
    "name GLOB 'scheduler_*' OR name GLOB 'event_*' OR " +
    "(type IN ('index','trigger') AND tbl_name IN (" +
    "'scheduler_meta','scheduler_lease','event_jobs'," +
    "'event_applications','scheduler_audit'," +
    "'scheduler_cutover_snapshot')) ORDER BY type,name"
  ).all();
}
function assertNoTempRootCleanup(file) {
  assert.notEqual(path.dirname(file), os.tmpdir());
}

function fakeClock(startMs) {
  let now = startMs;
  return {
    nowMs: function () { return now; },
    advanceMs: function (delta) { now += delta; return now; }
  };
}

function silentLogger(records) {
  records = records || [];
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

function appUrl(app) {
  const address = app.server.address();
  return address && typeof address === "object" ? "http://127.0.0.1:" + address.port : null;
}

function responseHeaders(headers) {
  function read(name) {
    if (headers && typeof headers.get === "function") return headers.get(name);
    return headers && (headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()]);
  }
  return {
    "cache-control": read("cache-control"),
    "content-type": read("content-type"),
    "x-content-type-options": read("x-content-type-options")
  };
}

function inProcessRequest(app, method, pathname, body, token) {
  const req = new PassThrough();
  req.url = pathname;
  req.method = method;
  req.headers = {};
  if (body !== undefined) req.headers["content-type"] = "application/json";
  if (token) req.headers["x-thdc-token"] = token;
  req.socket = {remoteAddress: "127.0.0.1"};
  let resolveResponse;
  const response = new Promise(function (resolve) { resolveResponse = resolve; });
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead: function (status, headers) {
      this.status = status;
      this.headers = Object.fromEntries(Object.entries(headers || {}).map(function (entry) {
        return [entry[0].toLowerCase(), entry[1]];
      }));
      this.headersSent = true;
    },
    end: function (chunk) {
      this.writableEnded = true;
      const text = chunk === undefined ? "" : String(chunk);
      const normalizedHeaders = responseHeaders(this.headers);
      const contentType = String(normalizedHeaders["content-type"] || "");
      const parsed = text && /application\/json/i.test(contentType) ? JSON.parse(text) : text;
      resolveResponse({status: this.status, headers: normalizedHeaders, body: parsed});
    }
  };
  app.server.emit("request", req, res);
  req.end(body === undefined ? undefined : JSON.stringify(body));
  return response;
}

async function requestJson(app, method, pathname, body, token) {
  const base = appUrl(app);
  if (!base) return inProcessRequest(app, method, pathname, body, token);
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["x-thdc-token"] = token;
  const response = await fetch(base + pathname, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: responseHeaders(response.headers),
    body: text ? JSON.parse(text) : null
  };
}

function get(app, pathname, token) {
  return requestJson(app, "GET", pathname, undefined, token);
}

function post(app, pathname, body, token) {
  return requestJson(app, "POST", pathname, body, token);
}

function snapshot(kho) {
  const names = kho.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' " +
      "AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(function (row) { return row.name; });
  const logical = names.map(function (name) {
    const quoted = '"' + name.replace(/"/g, '""') + '"';
    const rows = kho.db.prepare("SELECT rowid AS __rowid__, * FROM " + quoted + " ORDER BY rowid").all();
    return {name: name, rows: rows};
  });
  return JSON.stringify(logical);
}

async function seedAccounts(fixture, count) {
  const bootstrapped = await get(fixture.app, "/api/thongtin");
  assert.equal(bootstrapped.status, 200);
  const accounts = [];
  for (let index = 0; index < (count || 3); index++) {
    const username = fixture.label.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10) + index;
    const display = "Scheduler " + fixture.label + " " + index;
    fixture.app.kho.q.tkThem.run(
      username, display, PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S
    );
    const account = fixture.app.kho.q.tkTheoTen.get(username);
    const created = fixture.app.tg.taoDeQuoc(account.id, display);
    assert.ok(created.st && created.nha, fixture.label + " seeded empire " + index);
    const token = "token-" + fixture.label + "-" + index;
    fixture.app.kho.q.phienThem.run(token, account.id, NOW_S, NOW_S + 3600);
    accounts.push({
      id: account.id,
      username: username,
      display: display,
      token: token,
      password: PASSWORD,
      home: created.nha
    });
  }
  return accounts;
}

function makeBridge(options) {
  const config = options || {};
  const commands = [];
  let closures = 0;
  const scheduler = {
    start: async function () {},
    stop: async function () {},
    getStatus: function () {
      return config.status || {state: "ready", ready: true};
    },
    runCommand: function (command) {
      commands.push({name: command.name, accountId: command.accountId});
      if (config.code) {
        const error = new Error(config.code);
        error.code = config.code;
        throw error;
      }
      closures++;
      const value = command.run();
      return config.promiseResult ? Promise.resolve(value) : value;
    },
    schedule: function () {},
    cancel: function () {},
    reconcile: function () {},
    advanceTo: function () {}
  };
  return {scheduler: scheduler, commands: commands, closures: function () { return closures; }};
}

async function taoApp(label, options) {
  options = options || {};
  const dbPath = tempDb(label);
  const config = options.bridgeOptions || {};
  const bridge = makeBridge(config);
  const records = [];
  const app = taoUngDung({
    port: 0,
    dbPath: dbPath,
    env: {},
    clock: options.clock || fakeClock(NOW_MS),
    logger: silentLogger(records),
    timers: {
      setInterval: function (fn, ms) { return {fn: fn, ms: ms}; },
      clearInterval: function () {}
    },
    schedulerFactory: function () { return bridge.scheduler; }
  });
  if (!options.realSocket) {
    app.server.listen = function () {
      queueMicrotask(function () { app.server.emit("listening"); });
      return app.server;
    };
  }
  try {
    await app.start();
  } catch (error) {
    await app.stop().catch(function () {});
    removeDb(dbPath);
    throw error;
  }
  return {
    app: app,
    bridge: bridge,
    config: config,
    dbPath: dbPath,
    label: label,
    records: records
  };
}

async function taoDurableApp(label, options) {
  options = options || {};
  const dbPath = tempDb(label);
  const clock = options.clock || fakeClock(NOW_MS);
  const ownerId = options.ownerId || "00000000-0000-4000-8000-000000000107";
  const cutoverKho = new Kho(dbPath);
  try {
    runMaintenanceCutoverForTest({
      kho: cutoverKho,
      clock: clock,
      ownerId: ownerId,
      logger: silentLogger()
    });
  } finally {
    cutoverKho.dong();
  }
  const records = [];
  const app = taoUngDung({
    port: 0,
    dbPath: dbPath,
    env: {},
    clock: clock,
    logger: silentLogger(records),
    timers: {
      setInterval: function (fn, ms) { return {fn: fn, ms: ms}; },
      clearInterval: function () {}
    }
  });
  app.server.listen = function () {
    queueMicrotask(function () { app.server.emit("listening"); });
    return app.server;
  };
  try {
    await app.start();
  } catch (error) {
    await app.stop().catch(function () {});
    removeDb(dbPath);
    throw error;
  }
  return {
    app: app,
    bridge: {scheduler: app.scheduler},
    dbPath: dbPath,
    label: label,
    records: records
  };
}

function setBlockedCommand(fixture, commandName, code) {
  Object.defineProperty(fixture.config, "code", {
    configurable: true,
    get: function () {
      const last = fixture.bridge.commands[fixture.bridge.commands.length - 1];
      return last && last.name === commandName ? code : null;
    }
  });
}

function clearBlockedCommand(fixture) {
  Object.defineProperty(fixture.config, "code", {
    configurable: true,
    writable: true,
    value: null
  });
}

async function assertBlockedHttp(fixture, commandName, accountId, invoke) {
  const before = snapshot(fixture.app.kho);
  assert.strictEqual(fixture.app.scheduler, fixture.bridge.scheduler);
  for (const code of Object.keys(transientBodies)) {
    fixture.app.api.nhip.clear();
    const commandsAt = fixture.bridge.commands.length;
    const closuresAt = fixture.bridge.closures();
    setBlockedCommand(fixture, commandName, code);
    const response = await invoke();
    assert.deepEqual(response, {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff"
      },
      body: transientBodies[code]
    }, fixture.label + " " + code);
    const attempted = fixture.bridge.commands.slice(commandsAt);
    assert.deepEqual(attempted[attempted.length - 1], {
      name: commandName,
      accountId: accountId
    });
    assert.equal(
      fixture.bridge.closures() - closuresAt,
      attempted.length - 1,
      fixture.label + " rejected closure did not run"
    );
    assert.equal(snapshot(fixture.app.kho), before, fixture.label + " blocked snapshot");
  }
  clearBlockedCommand(fixture);
  fixture.app.api.nhip.clear();
}

async function assertBlockedCall(fixture, commandName, invoke) {
  const before = snapshot(fixture.app.kho);
  assert.strictEqual(fixture.app.scheduler, fixture.bridge.scheduler);
  for (const code of Object.keys(transientBodies)) {
    const commandsAt = fixture.bridge.commands.length;
    const closuresAt = fixture.bridge.closures();
    const recordsAt = fixture.records.length;
    const originalRunCommand = fixture.app.scheduler.runCommand;
    const injectedRunCommand = function (command) {
      fixture.bridge.commands.push({name: command.name, accountId: command.accountId});
      const error = new Error(code);
      error.code = code;
      throw error;
    };
    fixture.app.scheduler.runCommand = injectedRunCommand;
    assert.strictEqual(fixture.app.scheduler.runCommand, injectedRunCommand);
    let propagated = null;
    try { await invoke(); }
    catch (error) { propagated = error; }
    finally { fixture.app.scheduler.runCommand = originalRunCommand; }
    assert.deepEqual(fixture.bridge.commands.slice(commandsAt), [
      {name: commandName, accountId: undefined}
    ]);
    assert.equal(propagated && propagated.code, code,
      fixture.label + " public call propagates scheduler failure");
    assert.equal(fixture.bridge.closures(), closuresAt);
    assert.equal(snapshot(fixture.app.kho), before, fixture.label + " blocked snapshot");
    const errors = fixture.records.slice(recordsAt).filter(function (entry) {
      return entry.level === "error";
    });
    assert.deepEqual(errors, [], fixture.label + " public call propagates without timer logging");
  }
  clearBlockedCommand(fixture);
}

function stateOf(app, accountId) {
  return JSON.parse(app.kho.q.dqGet.get(accountId).state);
}

function updateState(app, accountId, mutate) {
  const state = stateOf(app, accountId);
  mutate(state);
  app.tg.luu(accountId, state);
  return state;
}

function createAlliance(app, owner, suffix) {
  const result = app.tg.lmTao(owner.id, "Liên Minh " + suffix, "L" + suffix.slice(-2).toUpperCase());
  assert.equal(result.loi, null);
  return result.ten;
}

function joinAlliance(app, alliance, owner, member) {
  assert.equal(app.tg.lmXin(member.id, alliance), null);
  assert.equal(app.tg.lmDuyet(owner.id, member.id, true), null);
}

function makeStateDue(app, account) {
  updateState(app, account.id, function (state) {
    state.now = NOW_S - 120;
    state.lastTick = NOW_S - 120;
    state.nextRaid = NOW_S + 100000;
    if (state.baoTri) state.baoTri.nextAt = NOW_S + 100000;
    state.nextMaint = NOW_S + 100000;
  });
  app.kho.db.prepare("UPDATE dq SET keTiep=? WHERE tk=?").run(NOW_S - 1, account.id);
}

async function fundGalanaThroughDurableScheduler(app, accountId, amount) {
  return app.scheduler.runCommand({
    name: "test-fund-galana",
    accountId: accountId,
    run: function () {
      const loaded = app.tg.nap(accountId);
      assert.ok(loaded && loaded.st, "durable fixture account exists");
      loaded.st.galana = amount;
      app.tg.luu(accountId, loaded.st, {mutation: app.tg._schedulerMutation});
      return null;
    }
  });
}

async function closeFixture(fixture) {
  await fixture.app.stop().catch(function () {});
  removeDb(fixture.dbPath);
}

test('migration exports and adds dq.revision with durable tables atomically', function (t) {
  voiKhoTam(t, function (x) {
    var migration = migrationModule();
    assert.equal(migration.SCHEDULER_SCHEMA_VERSION, 1);
    assert.equal(typeof migration.apDungMigrationScheduler, 'function');
    assertNoTempRootCleanup(x.file);
    var legacyState = '{"legacy":true}';
    var legacyId = Number(x.kho.db.prepare(
      'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
    ).run('migration-legacy', 'Migration Legacy', 'h', 's', 1, 1).lastInsertRowid);
    x.kho.db.prepare(
      'INSERT INTO dq(' +
      'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
      'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run(legacyId, legacyState, 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
    apDungMigrationScheduler(x.kho, 1_700_000_000_000);
    var revisionColumn = tableInfo(x.kho, 'dq').find(function (row) {
      return row.name === 'revision';
    });
    assert.equal(String(revisionColumn.type).toUpperCase(), 'INTEGER');
    assert.equal(Number(revisionColumn.notnull), 1);
    assert.equal(revisionColumn.dflt_value, '0');
    assert.equal(Number(revisionColumn.pk), 0);
    var legacyRow = x.kho.db.prepare(
      'SELECT state,revision FROM dq WHERE tk=?'
    ).get(legacyId);
    assert.equal(legacyRow.state, legacyState);
    assert.equal(Number(legacyRow.revision), 0);
    assertExactSchedulerSchema(x.kho);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='schema_version'"
    ).get().value, '1');
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='scheduler_mode'"
    ).get().value, 'legacy');
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, '0');
    x.kho.db.prepare('UPDATE dq SET revision=7 WHERE tk=?').run(legacyId);
    x.kho.db.prepare(
      "UPDATE scheduler_meta SET value='durable',updated_at_ms=123 " +
      "WHERE key='scheduler_mode'"
    ).run();
    apDungMigrationScheduler(x.kho, 1_700_000_000_001);
    var preservedDq = x.kho.db.prepare(
      'SELECT state,revision FROM dq WHERE tk=?'
    ).get(legacyId);
    assert.equal(preservedDq.state, legacyState);
    assert.equal(Number(preservedDq.revision), 7);
    var preservedMode = x.kho.db.prepare(
      "SELECT value,updated_at_ms FROM scheduler_meta WHERE key='scheduler_mode'"
    ).get();
    assert.equal(preservedMode.value, 'durable');
    assert.equal(Number(preservedMode.updated_at_ms), 123);
    assertExactSchedulerSchema(x.kho);
  });
});

test('event_jobs enforces lifecycle checks and the priority default in SQLite', function (t) {
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    var insert = x.kho.db.prepare(
      'INSERT INTO event_jobs(' +
      'id,kind,scheduled_at_s,sequence,state,idempotency_key,aggregate_type,' +
      'aggregate_id,payload_json,payload_sha256,attempt,max_attempts,' +
      'created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    insert.run('default-priority', 'ACCOUNT_ADVANCE', 1, 1, 'PENDING',
      'default-priority', 'account', '1', '{}', 'x', 0, 1, 1, 1);
    assert.equal(x.kho.db.prepare(
      "SELECT priority FROM event_jobs WHERE id='default-priority'"
    ).get().priority, 100);
    assert.throws(function () {
      insert.run('bad-state', 'ACCOUNT_ADVANCE', 1, 2, 'UNKNOWN',
        'bad-state', 'account', '1', '{}', 'x', 0, 1, 1, 1);
    }, /CHECK constraint/);
    assert.throws(function () {
      insert.run('bad-attempt', 'ACCOUNT_ADVANCE', 1, 3, 'PENDING',
        'bad-attempt', 'account', '1', '{}', 'x', -1, 1, 1, 1);
    }, /CHECK constraint/);
    assert.throws(function () {
      insert.run('bad-max', 'ACCOUNT_ADVANCE', 1, 4, 'PENDING',
        'bad-max', 'account', '1', '{}', 'x', 0, 0, 1, 1);
    }, /CHECK constraint/);
    var dependencyFk = x.kho.db.prepare('PRAGMA foreign_key_list(event_jobs)').all()
      .find(function (row) { return row.from === 'blocked_by_job_id'; });
    assert.equal(dependencyFk.table, 'event_jobs');
    assert.match(x.kho.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' " +
      "AND name='event_jobs_blocked_by_idx'"
    ).get().sql, /UNIQUE INDEX[\s\S]*WHERE blocked_by_job_id IS NOT NULL/i);
    assert.throws(function () {
      x.kho.db.prepare(
        "UPDATE event_jobs SET blocked_by_job_id='default-priority' " +
        "WHERE id='default-priority'"
      ).run();
    }, /CHECK constraint/);
  });
});

test('migration rejects malformed base lease and audit tables before mutation', function (t) {
  [
    'CREATE TABLE scheduler_lease(lease_name TEXT)',
    'CREATE TABLE scheduler_audit(id INTEGER)'
  ].forEach(function (ddl) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    x.kho.db.exec(ddl);
    assert.throws(function () {
      apDungMigrationScheduler(x.kho, 1);
    }, /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.equal(x.kho.db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='event_jobs'"
    ).get().n, 0);
  });
});



test('outer Unit-of-Work rolls back dq and event_jobs together', function (t) {
  voiKhoTam(t, function (x) {
  apDungMigrationScheduler(x.kho, 1);
  var accountId = Number(x.kho.db.prepare(
    'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
  ).run('uow-probe', 'UoW Probe', 'h', 's', 1, 1).lastInsertRowid);
  x.kho.db.prepare(
    'INSERT INTO dq(' +
    'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
    'lm,soHT,capNhat,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(accountId, '{"before":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1, 0);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.kho.db.prepare('UPDATE dq SET state=?,revision=revision+1 WHERE tk=?')
        .run('{"after":true}', accountId);
      x.kho.db.prepare(
        'INSERT INTO event_jobs(' +
        'id,kind,scheduled_at_s,priority,sequence,state,idempotency_key,' +
        'aggregate_type,aggregate_id,expected_revision,payload_json,' +
        'payload_sha256,max_attempts,created_at_ms,updated_at_ms) ' +
        'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(
        'uow-event', 'ACCOUNT_ADVANCE', 2, 100, 1, 'PENDING',
        'uow-event', 'account', String(accountId), 0,
        JSON.stringify({ schemaVersion: 1, accountId: accountId }),
        'fixture-sha256', 8, 1, 1
      );
      throw new Error('inject rollback');
    }, { immediate: true });
  }, /inject rollback/);
  var restored = x.kho.db.prepare('SELECT state,revision FROM dq WHERE tk=?')
    .get(accountId);
  var events = x.kho.db.prepare(
    "SELECT COUNT(*) AS n FROM event_jobs WHERE id='uow-event'"
  ).get().n;
  assert.equal(restored.state, '{"before":true}');
  assert.equal(restored.revision, 0);
  assert.equal(events, 0);
  });
});

test('migration DDL failure rolls back its one immediate UoW', function (t) {
  voiKhoTam(t, function (x) {
    var beforeDq = tableInfo(x.kho, 'dq');
    var beforeSchema = schedulerSchemaObjects(x.kho);
    var phases = [];
    var sawRevisionAlter = false;
    var injected = new Error('MIGRATION_DDL_INJECTED');
    var originalExec = x.kho.db.exec;
    x.kho.onTransaction = function (phase) { phases.push(phase); };
    x.kho.db.exec = function (sql) {
      var result = originalExec.call(x.kho.db, sql);
      if (/^ALTER TABLE dq ADD COLUMN revision\b/.test(String(sql))) {
        sawRevisionAlter = true;
        throw injected;
      }
      return result;
    };
    try {
      assert.throws(function () {
        apDungMigrationScheduler(x.kho, 1);
      }, function (error) { return error === injected; });
    } finally {
      x.kho.db.exec = originalExec;
    }
    assert.equal(sawRevisionAlter, true);
    assert.deepEqual(phases, ['begin-immediate', 'rollback']);
    assert.deepEqual(tableInfo(x.kho, 'dq'), beforeDq);
    assert.deepEqual(schedulerSchemaObjects(x.kho), beforeSchema);
    assert.equal(x.kho.transactionDepth, 0);
  });
});

test('future schema wins before any non-meta scheduler access', function (t) {
  ['2', '9007199254740993'].forEach(function (stored) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    x.kho.db.exec(
      'CREATE TABLE scheduler_meta (' +
      'key TEXT PRIMARY KEY,value TEXT NOT NULL,' +
      'updated_at_ms INTEGER NOT NULL,future_flag TEXT);' +
      'CREATE TABLE event_jobs(future_column TEXT);' +
      'CREATE TABLE scheduler_future_object(value TEXT)'
    );
    x.kho.db.prepare(
      'INSERT INTO scheduler_meta(key,value,updated_at_ms) ' +
      "VALUES('schema_version',?,1)"
    ).run(stored);
    var nonMetaNames = [
      'scheduler_lease', 'event_jobs', 'event_applications',
      'scheduler_audit', 'scheduler_cutover_snapshot'
    ];
    var reads = [];
    var beforeDq = tableInfo(x.kho, 'dq');
    var beforeSchema = schedulerSchemaObjects(x.kho);
    var originalPrepare = x.kho.db.prepare;
    x.kho.db.prepare = function (sql) {
      var source = String(sql);
      if (nonMetaNames.some(function (name) { return source.indexOf(name) >= 0; })) {
        reads.push(source);
      }
      return originalPrepare.call(x.kho.db, sql);
    };
    try {
      assert.throws(function () {
        apDungMigrationScheduler(x.kho, 2);
      }, function (error) {
        return error && error.code === 'SCHEDULER_SCHEMA_TOO_NEW';
      });
    } finally {
      x.kho.db.prepare = originalPrepare;
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(tableInfo(x.kho, 'dq'), beforeDq);
    assert.deepEqual(schedulerSchemaObjects(x.kho), beforeSchema);
  });
});



var JOB_CURRENT_COLUMNS = [
  'id', 'kind', 'scheduled_at_s', 'priority', 'sequence', 'state',
  'idempotency_key', 'aggregate_type', 'aggregate_id', 'expected_revision',
  'source_account_id', 'checkpoint_revision', 'replay_of_job_id',
  'blocked_by_job_id',
  'resolved_by_job_id', 'payload_json', 'payload_sha256', 'attempt',
  'max_attempts', 'retry_at_ms', 'locked_by', 'locked_generation', 'locked_until_ms',
  'completed_at_ms', 'cancelled_at_ms', 'cancel_reason', 'quarantined_at_ms',
  'error_code', 'error_message_safe', 'created_at_ms', 'updated_at_ms'
];
var APPLICATION_CURRENT_COLUMNS = [
  'idempotency_key', 'job_id', 'resolves_job_id', 'effective_at_s',
  'applied_at_ms', 'snapshot_json', 'snapshot_sha256', 'result_json',
  'result_sha256'
];
var CUTOVER_SNAPSHOT_CURRENT_COLUMNS = [
  'snapshot_id', 'created_at_ms', 'mode_before', 'reconcile_cursor_before',
  'dq_rows_json', 'ht_rows_json', 'hamdang_rows_json', 'hamgiu_rows_json',
  'event_jobs_rows_json', 'event_applications_rows_json', 'scheduler_meta_rows_json',
  'scheduler_lease_rows_json', 'scheduler_audit_rows_json',
  'imported_job_ids_json', 'combat_seed_key_before'
];
var SCHEDULER_SCHEMA_SHAPES = {
  scheduler_meta: {
    columns: ['key', 'value', 'updated_at_ms'],
    integers: ['updated_at_ms'],
    notNull: ['value', 'updated_at_ms'],
    primary: 'key'
  },
  scheduler_lease: {
    columns: [
      'lease_name', 'owner_id', 'expires_at_ms', 'heartbeat_at_ms', 'generation'
    ],
    integers: ['expires_at_ms', 'heartbeat_at_ms', 'generation'],
    notNull: ['owner_id', 'expires_at_ms', 'heartbeat_at_ms', 'generation'],
    primary: 'lease_name'
  },
  event_jobs: {
    columns: JOB_CURRENT_COLUMNS,
    integers: [
      'scheduled_at_s', 'priority', 'sequence', 'expected_revision',
      'source_account_id', 'checkpoint_revision', 'attempt', 'max_attempts',
      'retry_at_ms', 'locked_generation', 'locked_until_ms', 'completed_at_ms',
      'cancelled_at_ms', 'quarantined_at_ms', 'created_at_ms', 'updated_at_ms'
    ],
    notNull: [
      'kind', 'scheduled_at_s', 'priority', 'sequence', 'state',
      'idempotency_key', 'aggregate_type', 'aggregate_id', 'payload_json',
      'payload_sha256', 'attempt', 'max_attempts', 'created_at_ms', 'updated_at_ms'
    ],
    primary: 'id',
    defaults: {priority: '100', attempt: '0'}
  },
  event_applications: {
    columns: APPLICATION_CURRENT_COLUMNS,
    integers: ['effective_at_s', 'applied_at_ms'],
    notNull: [
      'job_id', 'effective_at_s', 'applied_at_ms', 'result_json', 'result_sha256'
    ],
    primary: 'idempotency_key'
  },
  scheduler_audit: {
    columns: ['id', 'action', 'job_id', 'detail_safe', 'at_ms'],
    integers: ['id', 'at_ms'],
    notNull: ['action', 'detail_safe', 'at_ms'],
    primary: 'id'
  },
  scheduler_cutover_snapshot: {
    columns: CUTOVER_SNAPSHOT_CURRENT_COLUMNS,
    integers: ['snapshot_id', 'created_at_ms'],
    notNull: CUTOVER_SNAPSHOT_CURRENT_COLUMNS.filter(function (name) {
      return ![
        'snapshot_id', 'reconcile_cursor_before', 'combat_seed_key_before'
      ].includes(name);
    }),
    primary: 'snapshot_id'
  }
};
var EXPECTED_UNIQUE_SHAPES = {
  scheduler_meta: ['key|pk|0'],
  scheduler_lease: ['lease_name|pk|0'],
  event_jobs: [
    'blocked_by_job_id|c|1', 'id|pk|0',
    'idempotency_key|u|0', 'sequence|u|0'
  ],
  event_applications: [
    'idempotency_key|pk|0', 'job_id|u|0', 'resolves_job_id|u|0'
  ],
  scheduler_audit: [],
  scheduler_cutover_snapshot: []
};
var EXPECTED_FOREIGN_KEY_SHAPES = {
  scheduler_meta: [],
  scheduler_lease: [],
  event_jobs: [
    'blocked_by_job_id>event_jobs.id|NO ACTION|NO ACTION|NONE',
    'replay_of_job_id>event_jobs.id|NO ACTION|NO ACTION|NONE',
    'resolved_by_job_id>event_jobs.id|NO ACTION|NO ACTION|NONE'
  ],
  event_applications: [
    'job_id>event_jobs.id|NO ACTION|NO ACTION|NONE',
    'resolves_job_id>event_jobs.id|NO ACTION|NO ACTION|NONE'
  ],
  scheduler_audit: [],
  scheduler_cutover_snapshot: []
};
var EXPECTED_CHECKS = {
  scheduler_lease: ["check(lease_name='global-writer')"],
  event_jobs: [
    "check(statein('pending','running','retry_wait','completed','cancelled'," +
      "'quarantined'))",
    'check(attempt>=0andmax_attempts>=1)',
    "check(blocked_by_job_idisnullor(kind='account_advance'andstate='pending'))",
    'check(blocked_by_job_idisnullorblocked_by_job_id<>id)'
  ],
  scheduler_cutover_snapshot: ['check(snapshot_id=1)']
};
var EXPECTED_INDEX_SQL = {
  event_jobs_aggregate_idx:
    'CREATE INDEX event_jobs_aggregate_idx ' +
    'ON event_jobs(aggregate_type,aggregate_id,state)',
  event_jobs_blocked_by_idx:
    'CREATE UNIQUE INDEX event_jobs_blocked_by_idx ' +
    'ON event_jobs(blocked_by_job_id) WHERE blocked_by_job_id IS NOT NULL',
  event_jobs_due_idx:
    'CREATE INDEX event_jobs_due_idx ' +
    'ON event_jobs(state,scheduled_at_s,priority,sequence,id)',
  event_jobs_retry_idx:
    'CREATE INDEX event_jobs_retry_idx ' +
    'ON event_jobs(state,retry_at_ms,priority,sequence,id)',
  event_jobs_source_unresolved_idx:
    'CREATE INDEX event_jobs_source_unresolved_idx ' +
    'ON event_jobs(source_account_id,state,scheduled_at_s)'
};
function quoteIdentifier(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}
function compactSql(sql) {
  return String(sql || '').replace(/\s+/g, '').toLowerCase();
}
function uniqueShapes(kho, table) {
  return kho.db.prepare('PRAGMA index_list(' + quoteIdentifier(table) + ')').all()
    .filter(function (row) { return Number(row.unique) === 1; })
    .map(function (row) {
      var columns = kho.db.prepare(
        'PRAGMA index_info(' + quoteIdentifier(row.name) + ')'
      ).all().map(function (column) { return column.name; });
      return columns.join(',') + '|' + row.origin + '|' + Number(row.partial);
    }).sort();
}
function foreignKeyShapes(kho, table) {
  return kho.db.prepare(
    'PRAGMA foreign_key_list(' + quoteIdentifier(table) + ')'
  ).all().map(function (row) {
    return row.from + '>' + row.table + '.' + row.to + '|' +
      row.on_update + '|' + row.on_delete + '|' + row.match;
  }).sort();
}
function assertExactSchedulerSchema(kho) {
  var tables = Object.keys(SCHEDULER_SCHEMA_SHAPES);
  tables.forEach(function (table) {
    var shape = SCHEDULER_SCHEMA_SHAPES[table];
    var defaults = shape.defaults || {};
    var rows = tableInfo(kho, table);
    assert.deepEqual(
      rows.map(function (row) { return row.name; }), shape.columns,
      table + ' columns'
    );
    rows.forEach(function (row) {
      var label = table + '.' + row.name;
      var expectedType = shape.integers.includes(row.name) ? 'INTEGER' : 'TEXT';
      var expectedNotNull = shape.notNull.includes(row.name) ? 1 : 0;
      var expectedPrimary = row.name === shape.primary ? 1 : 0;
      var expectedDefault = Object.prototype.hasOwnProperty.call(defaults, row.name) ?
        defaults[row.name] : null;
      assert.equal(String(row.type).toUpperCase(), expectedType, label + ' type');
      assert.equal(Number(row.notnull), expectedNotNull, label + ' not-null');
      assert.equal(Number(row.pk), expectedPrimary, label + ' primary-key');
      assert.equal(row.dflt_value, expectedDefault, label + ' default');
    });
    assert.deepEqual(
      uniqueShapes(kho, table), EXPECTED_UNIQUE_SHAPES[table].slice().sort(),
      table + ' unique shapes'
    );
    assert.deepEqual(
      foreignKeyShapes(kho, table),
      EXPECTED_FOREIGN_KEY_SHAPES[table].slice().sort(), table + ' foreign keys'
    );
    var tableSql = compactSql(kho.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table).sql);
    var checks = EXPECTED_CHECKS[table] || [];
    assert.equal(
      (tableSql.match(/check\(/g) || []).length, checks.length,
      table + ' CHECK count'
    );
    checks.forEach(function (check) {
      assert.ok(tableSql.includes(check), table + ' ' + check);
    });
  });
  var actualIndexes = kho.db.prepare(
    "SELECT name,sql FROM sqlite_master WHERE type='index' " +
    "AND tbl_name IN ('scheduler_meta','scheduler_lease','event_jobs'," +
    "'event_applications','scheduler_audit','scheduler_cutover_snapshot') " +
    'AND sql IS NOT NULL ORDER BY name'
  ).all().map(function (row) {
    return row.name + '|' + compactSql(row.sql);
  });
  var expectedIndexes = Object.keys(EXPECTED_INDEX_SQL).sort().map(function (name) {
    return name + '|' + compactSql(EXPECTED_INDEX_SQL[name]);
  });
  assert.deepEqual(actualIndexes, expectedIndexes);
  assert.deepEqual(kho.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='trigger' " +
    "AND tbl_name IN ('scheduler_meta','scheduler_lease','event_jobs'," +
    "'event_applications','scheduler_audit','scheduler_cutover_snapshot')"
  ).all(), []);
}
var PARTIAL_CASES = [
  ['event_jobs', 'replay_of_job_id', JOB_CURRENT_COLUMNS],
  ['event_jobs', 'resolved_by_job_id', JOB_CURRENT_COLUMNS],
  ['event_jobs', 'checkpoint_revision', JOB_CURRENT_COLUMNS],
  ['event_jobs', 'source_account_id', JOB_CURRENT_COLUMNS],
  ['event_jobs', 'blocked_by_job_id', JOB_CURRENT_COLUMNS],
  ['event_jobs', 'locked_generation', JOB_CURRENT_COLUMNS],
  ['event_applications', 'resolves_job_id', APPLICATION_CURRENT_COLUMNS],
  ['event_applications', 'result_sha256', APPLICATION_CURRENT_COLUMNS],
  ['scheduler_cutover_snapshot', 'ht_rows_json', CUTOVER_SNAPSHOT_CURRENT_COLUMNS],
  ['scheduler_cutover_snapshot', 'event_jobs_rows_json', CUTOVER_SNAPSHOT_CURRENT_COLUMNS],
  ['scheduler_cutover_snapshot', 'event_applications_rows_json', CUTOVER_SNAPSHOT_CURRENT_COLUMNS],
  ['scheduler_cutover_snapshot', 'scheduler_meta_rows_json', CUTOVER_SNAPSHOT_CURRENT_COLUMNS]
  ,['scheduler_cutover_snapshot', 'scheduler_lease_rows_json', CUTOVER_SNAPSHOT_CURRENT_COLUMNS]
  ,['scheduler_cutover_snapshot', 'scheduler_audit_rows_json', CUTOVER_SNAPSHOT_CURRENT_COLUMNS]
];
function omitTopLevelColumn(sql, omitted) {
  var open = sql.indexOf('('), close = sql.lastIndexOf(')');
  var body = sql.slice(open + 1, close), parts = [], start = 0, depth = 0;
  var quote = false, index, character;
  for (index = 0; index < body.length; index += 1) {
    character = body[index];
    if (character === "'" && body[index - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(body.slice(start, index)); start = index + 1;
    }
  }
  parts.push(body.slice(start));
  var dependentCheck = new RegExp('\\b' + omitted + '\\b');
  return sql.slice(0, open + 1) + parts.filter(function (part) {
    var source = part.trim();
    if (source.split(/\s+/)[0] === omitted) return false;
    return !(/^CHECK\s*\(/i.test(source) && dependentCheck.test(source));
  }).join(',') + sql.slice(close);
}
function replaceWithShape(kho, table, columns, omitted, nonempty) {
  var kept = columns.filter(function (name) { return name !== omitted; });
  var sourceSql = kho.db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
  ).get(table).sql;
  var sql;
  var values;
  var statement;
  kho.db.exec('DROP TABLE ' + table);
  kho.db.exec(omitted === '__none__' ?
    sourceSql.replace('scheduled_at_s INTEGER', 'scheduled_at_s TEXT') :
    omitTopLevelColumn(sourceSql, omitted));
  if (nonempty) {
    if (table === 'event_applications') {
      kho.db.prepare(
        'INSERT INTO event_jobs(' +
        'id,kind,scheduled_at_s,sequence,state,idempotency_key,aggregate_type,' +
        'aggregate_id,payload_json,payload_sha256,max_attempts,created_at_ms,updated_at_ms) ' +
        'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run('partial-parent', 'ACCOUNT_ADVANCE', 1, 99, 'PENDING',
        'partial-parent', 'account', '1', '{}', 'x', 1, 1, 1);
    }
    sql = 'INSERT INTO ' + table + '(' + kept.join(',') + ') VALUES(' +
      kept.map(function () { return '?'; }).join(',') + ')';
    values = kept.map(function (name) {
      if (['expected_revision', 'checkpoint_revision', 'replay_of_job_id',
        'blocked_by_job_id', 'resolved_by_job_id', 'resolves_job_id', 'retry_at_ms',
        'locked_by', 'locked_generation',
        'locked_until_ms', 'completed_at_ms', 'cancelled_at_ms', 'cancel_reason',
        'quarantined_at_ms', 'error_code', 'error_message_safe',
        'reconcile_cursor_before', 'combat_seed_key_before'].includes(name)) return null;
      if (name === 'id') return 'partial-job';
      if (name === 'kind') return 'ACCOUNT_ADVANCE';
      if (name === 'state') return 'PENDING';
      if (name === 'idempotency_key') return table === 'event_applications' ?
        'partial-parent' : 'partial-job';
      if (name === 'job_id') return 'partial-parent';
      if (name === 'aggregate_type') return 'account';
      if (name === 'aggregate_id') return '1';
      if (name === 'payload_json' || name === 'result_json') return '{}';
      if (/_rows_json$/.test(name) || name === 'imported_job_ids_json') return '[]';
      if (name === 'mode_before') return 'legacy';
      if (name === 'priority') return 100;
      if (name === 'max_attempts') return 1;
      if (name === 'attempt') return 0;
      if (name === 'snapshot_id') return 1;
      if (name === 'sequence') return 10;
      if (/(_at_s|_at_ms|_revision)$/.test(name)) return 1;
      return 'x';
    });
    statement = kho.db.prepare(sql);
    statement.run.apply(statement, values);
  }
}
function schedulerMetaRows(kho) {
  return kho.db.prepare(
    'SELECT key,value,updated_at_ms FROM scheduler_meta ORDER BY key'
  ).all();
}



test('schema_version accepts only its canonical decimal literal', function (t) {
  ['0', '01', '1.0', '+1', ' 1 ', '0x1', '1e0'].forEach(function (stored) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.prepare(
      "UPDATE scheduler_meta SET value=? WHERE key='schema_version'"
    ).run(stored);
    var beforeDq = tableInfo(x.kho, 'dq');
    var beforeSchema = schedulerSchemaObjects(x.kho);
    var beforeMeta = schedulerMetaRows(x.kho);
    assert.throws(function () {
      apDungMigrationScheduler(x.kho, 2);
    }, function (error) {
      return error && error.code === 'SCHEDULER_SCHEMA_UNSUPPORTED';
    });
    assert.deepEqual(tableInfo(x.kho, 'dq'), beforeDq);
    assert.deepEqual(schedulerSchemaObjects(x.kho), beforeSchema);
    assert.deepEqual(schedulerMetaRows(x.kho), beforeMeta);
  });
});

test('scheduler object allowlist rejects namespace and owned triggers', function (t) {
  [
    'CREATE TABLE scheduler_unexpected(value INTEGER)',
    'CREATE TABLE Scheduler_Unexpected(value INTEGER)',
    'CREATE VIEW event_unexpected AS SELECT 1 AS value',
    'CREATE INDEX scheduler_unexpected_idx ON dq(keTiep)',
    "CREATE TRIGGER arbitrary_guard BEFORE INSERT ON event_jobs " +
      "BEGIN SELECT RAISE(ABORT,'blocked'); END"
  ].forEach(function (ddl) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec(ddl);
    var beforeDq = tableInfo(x.kho, 'dq');
    var beforeSchema = schedulerSchemaObjects(x.kho);
    assert.throws(function () {
      apDungMigrationScheduler(x.kho, 2);
    }, function (error) {
      return error && error.code === 'SCHEDULER_SCHEMA_UNSUPPORTED';
    });
    assert.deepEqual(tableInfo(x.kho, 'dq'), beforeDq);
    assert.deepEqual(schedulerSchemaObjects(x.kho), beforeSchema);
  });
});

test('scheduler allowlist preserves implicit SQLite autoindexes', function (t) {
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    var implicitBefore = x.kho.db.prepare(
      "SELECT name,tbl_name FROM sqlite_master " +
      "WHERE type='index' AND sql IS NULL AND tbl_name IN (" +
      "'scheduler_meta','scheduler_lease','event_jobs'," +
      "'event_applications','scheduler_cutover_snapshot') " +
      'ORDER BY name'
    ).all();
    var schemaBefore = schedulerSchemaObjects(x.kho);
    assert.ok(implicitBefore.length > 0);
    apDungMigrationScheduler(x.kho, 2);
    assert.deepEqual(x.kho.db.prepare(
      "SELECT name,tbl_name FROM sqlite_master " +
      "WHERE type='index' AND sql IS NULL AND tbl_name IN (" +
      "'scheduler_meta','scheduler_lease','event_jobs'," +
      "'event_applications','scheduler_cutover_snapshot') " +
      'ORDER BY name'
    ).all(), implicitBefore);
    assert.deepEqual(schedulerSchemaObjects(x.kho), schemaBefore);
  });
});

test('existing dq.revision must match its exact PRAGMA shape', function (t) {
  [
    'TEXT NOT NULL DEFAULT 0',
    'INTEGER DEFAULT 0',
    'INTEGER NOT NULL DEFAULT 1',
    "INTEGER NOT NULL DEFAULT '0'"
  ].forEach(function (definition) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    x.kho.db.exec('ALTER TABLE dq ADD COLUMN revision ' + definition);
    var beforeDq = tableInfo(x.kho, 'dq');
    var beforeSchema = schedulerSchemaObjects(x.kho);
    var writes = [];
    var originalExec = x.kho.db.exec;
    x.kho.db.exec = function (sql) {
      if (/\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE)\b/i.test(String(sql))) {
        writes.push(String(sql));
      }
      return originalExec.call(x.kho.db, sql);
    };
    try {
      assert.throws(function () {
        apDungMigrationScheduler(x.kho, 2);
      }, function (error) {
        return error && error.code === 'SCHEDULER_SCHEMA_UNSUPPORTED';
      });
    } finally {
      x.kho.db.exec = originalExec;
    }
    assert.deepEqual(writes, []);
    assert.deepEqual(tableInfo(x.kho, 'dq'), beforeDq);
    assert.deepEqual(schedulerSchemaObjects(x.kho), beforeSchema);
  });
  voiKhoTam(t, function (x) {
    x.kho.db.exec(
      'ALTER TABLE dq ADD COLUMN revision INTEGER NOT NULL DEFAULT 0'
    );
    var revisionBefore = tableInfo(x.kho, 'dq').find(function (row) {
      return row.name === 'revision';
    });
    apDungMigrationScheduler(x.kho, 2);
    assert.deepEqual(tableInfo(x.kho, 'dq').find(function (row) {
      return row.name === 'revision';
    }), revisionBefore);
  });
});

test('each nonempty exact partial scheduler column fails before any mutation', function (t) {
  PARTIAL_CASES.forEach(function (caseInfo) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec('DELETE FROM event_jobs; DELETE FROM event_applications;');
    replaceWithShape(x.kho, caseInfo[0], caseInfo[2], caseInfo[1], true);
    var beforeInfo = tableInfo(x.kho, caseInfo[0]);
    var beforeMode = x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='scheduler_mode'"
    ).get().value;
    var beforeMeta = schedulerMetaRows(x.kho);
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
      /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.deepEqual(tableInfo(x.kho, caseInfo[0]), beforeInfo, caseInfo.join(':'));
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='scheduler_mode'"
    ).get().value, beforeMode);
    assert.deepEqual(schedulerMetaRows(x.kho), beforeMeta);
    assert.equal(tableColumns(x.kho, caseInfo[0]).includes(caseInfo[1]), false);
  });
});

test('a nonempty application row missing result_sha256 fails without defaulting it', function (t) {
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec('DELETE FROM event_jobs; DELETE FROM event_applications;');
    replaceWithShape(x.kho, 'event_applications', APPLICATION_CURRENT_COLUMNS, 'result_sha256', true);
    var beforeInfo = tableInfo(x.kho, 'event_applications');
    var beforeMeta = schedulerMetaRows(x.kho);
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); }, /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.deepEqual(tableInfo(x.kho, 'event_applications'), beforeInfo);
    assert.deepEqual(schedulerMetaRows(x.kho), beforeMeta);
    assert.equal(tableColumns(x.kho, 'event_applications').includes('result_sha256'), false);
  });
});

test('each empty exact partial scheduler column upgrades before indexes and reruns', function (t) {
  PARTIAL_CASES.forEach(function (caseInfo) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec('DELETE FROM event_jobs; DELETE FROM event_applications;');
    replaceWithShape(x.kho, caseInfo[0], caseInfo[2], caseInfo[1], false);
    apDungMigrationScheduler(x.kho, 2);
    assert.equal(tableColumns(x.kho, caseInfo[0]).includes(caseInfo[1]), true);
    if (caseInfo[0] === 'event_jobs' && caseInfo[1] === 'source_account_id') {
      assert.equal(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE name='event_jobs_source_unresolved_idx'"
      ).get().n, 1);
    }
    apDungMigrationScheduler(x.kho, 3);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='scheduler_mode'"
    ).get().value, 'legacy');
  });
});

test('current-shaped scheduler tables reject wrong affinity and extra columns', function (t) {
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec('DELETE FROM event_applications; DELETE FROM event_jobs;');
    replaceWithShape(x.kho, 'event_jobs', JOB_CURRENT_COLUMNS, '__none__', false);
    assert.throws(function () {
      apDungMigrationScheduler(x.kho, 2);
    }, /SCHEDULER_SCHEMA_UNSUPPORTED/);
  });
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec('ALTER TABLE scheduler_audit ADD COLUMN unexpected TEXT');
    assert.throws(function () {
      apDungMigrationScheduler(x.kho, 2);
    }, /SCHEDULER_SCHEMA_UNSUPPORTED/);
  });
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec(
      'DELETE FROM scheduler_lease; DROP TABLE scheduler_lease;' +
      'CREATE TABLE scheduler_lease(' +
      'lease_name TEXT PRIMARY KEY,owner_id TEXT NOT NULL,' +
      'expires_at_ms INTEGER NOT NULL,generation INTEGER NOT NULL)'
    );
    var before = snapshot(x.kho);
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
      /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.equal(snapshot(x.kho), before, 'empty malformed base table is never blessed');
  });
});

test('preflight rejects malformed meta and orphan scheduler inventory without mutation', function (t) {
  voiKhoTam(t, function (x) {
    x.kho.db.exec('CREATE TABLE scheduler_meta(key TEXT,updated_at_ms INTEGER)');
    var before = x.kho.db.prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'scheduler_%' ORDER BY name"
    ).all();
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); }, function (error) {
      return error.code === 'SCHEDULER_SCHEMA_UNSUPPORTED';
    });
    assert.deepEqual(x.kho.db.prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'scheduler_%' ORDER BY name"
    ).all(), before);
  });
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.exec('PRAGMA foreign_keys=OFF');
    x.kho.db.prepare(
      'INSERT INTO event_jobs(' +
      'id,kind,scheduled_at_s,sequence,state,idempotency_key,aggregate_type,' +
      'aggregate_id,payload_json,payload_sha256,max_attempts,created_at_ms,updated_at_ms) ' +
      'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).run('orphan-source', 'ACCOUNT_ADVANCE', 1, 1, 'PENDING', 'orphan-source',
      'account', '1', '{}', 'x', 1, 1, 1);
    x.kho.db.prepare(
      'INSERT INTO event_applications(' +
      'idempotency_key,job_id,effective_at_s,applied_at_ms,result_json,result_sha256) ' +
      'VALUES(?,?,?,?,?,?)'
    ).run('orphan-source', 'orphan-source', 1, 1, '{}', 'x');
    x.kho.db.exec('DROP TABLE event_jobs; PRAGMA foreign_keys=ON');
    var schemaBefore = x.kho.db.prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'scheduler_%' " +
      "OR name LIKE 'event_%' ORDER BY type,name"
    ).all();
    var rowsBefore = x.kho.db.prepare('SELECT * FROM event_applications').all();
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
      /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.deepEqual(x.kho.db.prepare(
      "SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'scheduler_%' " +
      "OR name LIKE 'event_%' ORDER BY type,name"
    ).all(), schemaBefore);
    assert.deepEqual(x.kho.db.prepare('SELECT * FROM event_applications').all(), rowsBefore);
  });
});

test('preflight rejects extra CHECK semantics and the complete explicit index inventory', function (t) {
  ['table', 'literal-case', 'index', 'extra-unique-index'].forEach(function (mode) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    apDungMigrationScheduler(x.kho, 1);
    if (mode === 'table' || mode === 'literal-case') {
      var sql = x.kho.db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='event_jobs'"
      ).get().sql;
      var applicationsSql = x.kho.db.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='event_applications'"
      ).get().sql;
      x.kho.db.exec('DROP TABLE event_applications; DROP TABLE event_jobs');
      x.kho.db.exec(mode === 'table' ?
        sql.slice(0, -1) + ",CHECK(state='PENDING'))" :
        sql.replace("'PENDING'", "'pending'"));
      x.kho.db.exec(applicationsSql);
    } else if (mode === 'index') {
      x.kho.db.exec('DROP INDEX event_jobs_due_idx');
      x.kho.db.exec(
        'CREATE INDEX event_jobs_due_idx ON event_jobs(state,sequence,id)'
      );
    } else {
      // Keep every scheduler table empty. This proves preflight rejects an
      // extra restrictive index itself rather than relying on payload rows.
      x.kho.db.exec(
        'CREATE UNIQUE INDEX event_jobs_extra_unique_idx ON event_jobs(error_code) ' +
        'WHERE error_code IS NOT NULL'
      );
    }
    if (mode === 'table' || mode === 'literal-case') {
      x.kho.db.prepare(
        'INSERT INTO event_jobs(' +
        'id,kind,scheduled_at_s,sequence,state,idempotency_key,aggregate_type,' +
        'aggregate_id,payload_json,payload_sha256,max_attempts,created_at_ms,updated_at_ms) ' +
        'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run('signature-probe', 'ACCOUNT_ADVANCE', 1, 1,
        mode === 'literal-case' ? 'pending' : 'PENDING',
        'signature-probe', 'account', '1', '{}', 'x', 1, 1, 1);
    }
    var before = snapshot(x.kho);
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
      /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.equal(snapshot(x.kho), before);
  });
});



test('sequence bootstrap rejects every nonempty unsafe counter and preserves valid values', function (t) {
  [null, 'abc', '-1', '9007199254740992', '9'].forEach(function (counter) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.prepare(
      "INSERT INTO event_jobs(id,kind,scheduled_at_s,priority,sequence,state," +
      "idempotency_key,aggregate_type,aggregate_id,payload_json,payload_sha256," +
      "max_attempts,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run('counter-' + String(counter), 'ACCOUNT_ADVANCE', 1, 100, 10, 'PENDING',
      'counter-' + String(counter), 'account', '1', '{"accountId":1,"schemaVersion":1}',
      'x', 8, 1, 1);
    if (counter === null) {
      x.kho.db.prepare("DELETE FROM scheduler_meta WHERE key='sequence'").run();
    } else {
      x.kho.db.prepare("UPDATE scheduler_meta SET value=? WHERE key='sequence'").run(counter);
    }
    var before = snapshot(x.kho);
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
      /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.equal(snapshot(x.kho), before);
  });
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.prepare("UPDATE scheduler_meta SET value='13' WHERE key='sequence'").run();
    apDungMigrationScheduler(x.kho, 2);
    apDungMigrationScheduler(x.kho, 3);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, '13');
  });
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.prepare(
      "INSERT INTO event_jobs(id,kind,scheduled_at_s,priority,sequence,state," +
      "idempotency_key,aggregate_type,aggregate_id,payload_json,payload_sha256," +
      "max_attempts,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run('counter-ok', 'ACCOUNT_ADVANCE', 1, 100, 10, 'PENDING',
      'counter-ok', 'account', '1', '{"accountId":1,"schemaVersion":1}',
      'x', 8, 1, 1);
    x.kho.db.prepare("UPDATE scheduler_meta SET value='10' WHERE key='sequence'").run();
    apDungMigrationScheduler(x.kho, 4);
    apDungMigrationScheduler(x.kho, 5);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, '10');
  });
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.prepare("DELETE FROM scheduler_meta WHERE key='sequence'").run();
    apDungMigrationScheduler(x.kho, 2);
    apDungMigrationScheduler(x.kho, 3);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, '0');
  });
});

test('meta-only payload cannot bless an incomplete scheduler inventory', function (t) {
  voiKhoTam(t, function (x) {
    x.kho.db.exec(
      'CREATE TABLE scheduler_meta (' +
      'key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at_ms INTEGER NOT NULL);' +
      "INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('schema_version','1',1);" +
      "INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('sequence','0',1)"
    );
    var before = snapshot(x.kho);
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
      /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.equal(snapshot(x.kho), before);
  });
});

test('sequence is validated before CREATE when jobs are absent or empty', function (t) {
  ['abc', '-1', '9007199254740992'].forEach(function (bad) {
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    x.kho.db.exec(
      'CREATE TABLE scheduler_meta (' +
      'key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at_ms INTEGER NOT NULL);' +
      "INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('sequence','" +
      bad + "',1)"
    );
    var absentBefore = snapshot(x.kho);
    var writes = [], originalExec = x.kho.db.exec.bind(x.kho.db);
    x.kho.db.exec = function (sql) {
      if (/\b(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE)\b/i.test(String(sql))) {
        writes.push(String(sql));
      }
      return originalExec(sql);
    };
    try {
      assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
        /SCHEDULER_SCHEMA_UNSUPPORTED/);
    } finally { x.kho.db.exec = originalExec; }
    assert.equal(snapshot(x.kho), absentBefore);
    assert.deepEqual(writes, []);
  });
  voiKhoTam(t, function (x) {
    apDungMigrationScheduler(x.kho, 1);
    x.kho.db.prepare("UPDATE scheduler_meta SET value='not-an-integer' " +
      "WHERE key='sequence'").run();
    var emptyBefore = snapshot(x.kho);
    assert.throws(function () { apDungMigrationScheduler(x.kho, 2); },
      /SCHEDULER_SCHEMA_UNSUPPORTED/);
    assert.equal(snapshot(x.kho), emptyBefore);
  });
});

test("factory shares one canonical bridge with API and world", async function () {
  const fixture = await taoApp("bridge-identity");
  try {
    assert.strictEqual(fixture.app.api.scheduler, fixture.app.scheduler);
    assert.strictEqual(fixture.app.tg.scheduler, fixture.app.scheduler);
    assert.throws(function () {
      return new API({q: {}}, {}, {
        clock: fakeClock(NOW_MS),
        gameNow: function () { return NOW_S; }
      });
    }, /SCHEDULER_BRIDGE_REQUIRED/);
    assert.throws(function () {
      return new API({q: {}}, {}, {
        clock: fakeClock(NOW_MS),
        scheduler: fixture.app.scheduler,
        gameNow: function () { return NOW_S; }
      });
    }, /GET_UNIVERSE_SEED_REQUIRED/);
  } finally {
    await closeFixture(fixture);
  }
});

test("universe bootstrap is gated, memoized, primitive, and read-only after success", async function () {
  const fixture = await taoApp("bootstrap-gate");
  try {
    assert.equal(fixture.app.kho.cauhinh("seed"), null);
    assert.equal(fixture.app.kho.cauhinh("moLuc"), null);
    await assertBlockedHttp(fixture, "universe-bootstrap", undefined, function () {
      return get(fixture.app, "/api/thongtin");
    });

    const commandAt = fixture.bridge.commands.length;
    const first = await get(fixture.app, "/api/thongtin");
    assert.equal(first.status, 200);
    assert.equal(typeof first.body.seed, "string");
    assert.ok(first.body.seed.length > 0);
    assert.deepEqual(fixture.bridge.commands.slice(commandAt), [
      {name: "universe-bootstrap", accountId: undefined}
    ]);
    assert.equal(fixture.app.kho.cauhinh("seed"), first.body.seed);
    assert.equal(fixture.app.kho.cauhinh("moLuc"), String(NOW_S));
    const afterFirst = snapshot(fixture.app.kho);
    const second = await get(fixture.app, "/api/thongtin");
    assert.equal(second.body.seed, first.body.seed);
    assert.equal(fixture.bridge.commands.length, commandAt + 1);
    assert.equal(snapshot(fixture.app.kho), afterFirst);
  } finally {
    await closeFixture(fixture);
  }
});

test("fresh registration bootstraps before register and persists its complete result", async function () {
  const fixture = await taoApp("register-first");
  try {
    const commandsAt = fixture.bridge.commands.length;
    const response = await post(fixture.app, "/api/dangky", {
      ten: "firstcommander", hienthi: "First Commander", mk: "first-password"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.bridge.commands.slice(commandsAt), [
      {name: "universe-bootstrap", accountId: undefined},
      {name: "register", accountId: undefined}
    ]);
    const account = fixture.app.kho.q.tkTheoTen.get("firstcommander");
    assert.ok(account);
    assert.ok(fixture.app.kho.q.dqGet.get(account.id));
    assert.equal(fixture.app.kho.q.phienGet.get(response.body.token).tk, account.id);
    assert.equal(typeof fixture.app.kho.cauhinh("seed"), "string");
    assert.equal(fixture.app.kho.cauhinh("moLuc"), String(NOW_S));

    const stateAt = fixture.bridge.commands.length;
    const state = await get(fixture.app, "/api/state", response.body.token);
    assert.equal(state.status, 200);
    assert.deepEqual(fixture.bridge.commands.slice(stateAt).map(function (entry) {
      return entry.name;
    }), ["last-seen", "state-read"]);
  } finally {
    await closeFixture(fixture);
  }
});

test("Promise bridge resolves one concurrent bootstrap and a real system object", async function () {
  const fixture = await taoApp("promise-bridge", {bridgeOptions: {promiseResult: true}});
  try {
    const responses = await Promise.all([
      get(fixture.app, "/api/thongtin"),
      get(fixture.app, "/api/thongtin")
    ]);
    assert.equal(responses[0].status, 200);
    assert.equal(responses[1].status, 200);
    assert.equal(responses[0].body.seed, responses[1].body.seed);
    assert.equal(typeof responses[0].body.seed, "string");
    assert.notEqual(typeof responses[0].body.seed, "object");
    assert.equal(
      fixture.bridge.commands.filter(function (entry) {
        return entry.name === "universe-bootstrap";
      }).length,
      1
    );
    const third = await get(fixture.app, "/api/thongtin");
    assert.equal(third.body.seed, responses[0].body.seed);
    assert.equal(
      fixture.bridge.commands.filter(function (entry) {
        return entry.name === "universe-bootstrap";
      }).length,
      1
    );
    assert.equal(fixture.app.kho.cauhinh("seed"), responses[0].body.seed);
    assert.equal(fixture.app.kho.cauhinh("moLuc"), String(NOW_S));

    const accounts = await seedAccounts(fixture, 1);
    const system = await get(
      fixture.app,
      "/api/he?g=" + accounts[0].home.g + "&h=" + accounts[0].home.h,
      accounts[0].token
    );
    assert.equal(system.status, 200);
    assert.ok(system.body && Array.isArray(system.body.o));
    assert.equal(typeof system.body.then, "undefined");
    assert.ok(system.body.o.length > 1);
  } finally {
    await closeFixture(fixture);
  }
});

test("readiness precedes expired-token authentication and preserves every table", async function () {
  const status = {state: "ready", ready: true};
  const fixture = await taoApp("readiness-expiry", {bridgeOptions: {status: status}});
  try {
    const accounts = await seedAccounts(fixture, 1);
    fixture.app.kho.q.phienThem.run("expired-before-ready", accounts[0].id, 1, 2);
    status.state = "standby";
    status.ready = false;
    const before = snapshot(fixture.app.kho);
    const commandsAt = fixture.bridge.commands.length;
    const response = await get(
      fixture.app,
      "/api/he?g=1&h=1",
      "expired-before-ready"
    );
    assert.deepEqual(response, {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff"
      },
      body: {
        loi: "Máy chủ đang đồng bộ, hãy thử lại.",
        code: "SCHEDULER_NOT_READY"
      }
    });
    assert.equal(fixture.bridge.commands.length, commandsAt);
    assert.ok(fixture.app.kho.q.phienGet.get("expired-before-ready"));
    assert.equal(snapshot(fixture.app.kho), before);
  } finally {
    await closeFixture(fixture);
  }
});

test("system GET blocks before auth writes, then admits last-seen and NPC creation", async function () {
  const fixture = await taoApp("system-read");
  try {
    const accounts = await seedAccounts(fixture, 1);
    const account = accounts[0];
    fixture.app.kho.q.tkVao.run(NOW_S - 10, account.id);
    const seed = fixture.app.kho.cauhinh("seed");
    let system = null;
    for (let g = 1; g <= G.C.SO_THIEN_HA && !system; g++) {
      for (let h = 1; h <= Math.min(G.C.SO_HE, 30) && !system; h++) {
        for (let p = 1; p <= G.C.SO_HANH_TINH; p++) {
          if (G.coNPC(seed, G.toaDo(g, h, p))) {
            system = {g: g, h: h};
            break;
          }
        }
      }
    }
    assert.ok(system, "deterministic NPC system found");
    const pathname = "/api/he?g=" + system.g + "&h=" + system.h;
    const before = snapshot(fixture.app.kho);
    const commandAt = fixture.bridge.commands.length;
    const closuresAt = fixture.bridge.closures();
    fixture.config.code = "GLOBAL_BARRIER_PENDING";
    const blocked = await get(fixture.app, pathname, account.token);
    assert.deepEqual(blocked, {
      status: 503,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff"
      },
      body: transientBodies.GLOBAL_BARRIER_PENDING
    });
    assert.deepEqual(fixture.bridge.commands.slice(commandAt), [
      {name: "last-seen", accountId: account.id}
    ]);
    assert.equal(fixture.bridge.closures(), closuresAt);
    assert.equal(snapshot(fixture.app.kho), before);

    fixture.config.code = null;
    const successAt = fixture.bridge.commands.length;
    const success = await get(fixture.app, pathname, account.token);
    assert.equal(success.status, 200);
    assert.deepEqual(fixture.bridge.commands.slice(successAt), [
      {name: "last-seen", accountId: account.id},
      {name: "system-read", accountId: account.id}
    ]);
    assert.equal(fixture.app.kho.q.tkTheoId.get(account.id).vaoCuoi, NOW_S);
    const npcRows = fixture.app.kho.db.prepare("SELECT * FROM npc ORDER BY key").all();
    assert.ok(npcRows.length > 0);
    assert.ok(success.body.o.some(function (entry) {
      return entry.loai === "npc" && G.coNPC(seed, entry.c);
    }));
    assert.notEqual(snapshot(fixture.app.kho), before);
  } finally {
    await closeFixture(fixture);
  }
});

test("full HTTP mutation matrix blocks each family and admits its real write", async function () {
  const rows = [
    {
      label: "register", command: "register", account: function () { return undefined; },
      request: function (fixture) {
        return post(fixture.app, "/api/dangky", {
          ten: "newcommander", hienthi: "New Commander", mk: "new-password"
        });
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        const account = fixture.app.kho.q.tkTheoTen.get("newcommander");
        assert.ok(account);
        assert.ok(fixture.app.kho.q.dqGet.get(account.id));
        assert.equal(fixture.app.kho.q.phienGet.get(response.body.token).tk, account.id);
        assert.ok(response.body.token && response.body.nha);
      }
    },
    {
      label: "login", command: "login", account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.app.kho.q.phienThem.run("expired-login", accounts[0].id, 1, 2);
        fixture.app.kho.q.tkVao.run(NOW_S - 10, accounts[0].id);
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/dangnhap", {
          ten: accounts[0].username, mk: accounts[0].password
        });
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.ok(response.body.token);
        assert.equal(fixture.app.kho.q.phienGet.get(response.body.token).tk, accounts[0].id);
        assert.equal(fixture.app.kho.q.tkTheoId.get(accounts[0].id).vaoCuoi, NOW_S);
        assert.equal(fixture.app.kho.q.phienGet.get("expired-login"), undefined);
      }
    },
    {
      label: "session-expiry", command: "session-expiry",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.app.kho.q.phienThem.run("expired-session", accounts[0].id, 1, 2);
      },
      request: function (fixture) {
        return get(fixture.app, "/api/state", "expired-session");
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 401);
        assert.equal(fixture.app.kho.q.phienGet.get("expired-session"), undefined);
      }
    },
    {
      label: "last-seen", command: "last-seen", account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.app.kho.q.tkVao.run(NOW_S - 10, accounts[0].id);
      },
      request: function (fixture, accounts) {
        return get(fixture.app, "/api/xephang", accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.tkTheoId.get(accounts[0].id).vaoCuoi, NOW_S);
      }
    },
    {
      label: "logout", command: "logout", account: function (accounts) { return accounts[0].id; },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/dangxuat", {}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.phienGet.get(accounts[0].token), undefined);
      }
    },
    {
      label: "state-read", command: "state-read", account: function (accounts) { return accounts[0].id; },
      mutates: false,
      setup: function (fixture, accounts) { makeStateDue(fixture.app, accounts[0]); },
      request: function (fixture, accounts) {
        return get(fixture.app, "/api/state", accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(response.body.st.lastTick, NOW_S - 120);
      }
    },
    {
      label: "action-lmra", command: "action", account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) { createAlliance(fixture.app, accounts[0], "AR"); },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/lam", {ten: "lmra", dl: {}}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.dqGet.get(accounts[0].id).lm, null);
      }
    },
    {
      label: "war", command: "war", account: function (accounts) { return accounts[0].id; },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/tuyenchien", {tk: accounts[1].id}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.ok(fixture.app.kho.q.chienGetTK.get(accounts[0].id, accounts[1].id));
      }
    },
    {
      label: "transfer", command: "transfer-galana",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        const alliance = createAlliance(fixture.app, accounts[0], "TG");
        joinAlliance(fixture.app, alliance, accounts[0], accounts[1]);
        updateState(fixture.app, accounts[0].id, function (state) { state.galana = 5000; });
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/chuyengalana", {tk: accounts[1].id, so: 1000}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(stateOf(fixture.app, accounts[0].id).galana, 4000);
      }
    },
    {
      label: "alliance-create", command: "alliance",
      account: function (accounts) { return accounts[0].id; },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/lmtao", {ten: "Gate Create", tag: "GC"}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.ok(fixture.app.kho.q.lmGet.get("[GC] Gate Create"));
      }
    },
    {
      label: "alliance-apply", command: "alliance",
      account: function (accounts) { return accounts[1].id; },
      setup: function (fixture, accounts) {
        fixture.alliance = createAlliance(fixture.app, accounts[0], "AP");
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/lmxin", {ten: fixture.alliance}, accounts[1].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.ok(fixture.app.kho.q.lmXinGet.get(fixture.alliance, accounts[1].id));
      }
    },
    {
      label: "alliance-approve", command: "alliance",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.alliance = createAlliance(fixture.app, accounts[0], "OK");
        assert.equal(fixture.app.tg.lmXin(accounts[1].id, fixture.alliance), null);
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/lmduyet", {tk: accounts[1].id}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.dqGet.get(accounts[1].id).lm, fixture.alliance);
      }
    },
    {
      label: "alliance-reject", command: "alliance",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.alliance = createAlliance(fixture.app, accounts[0], "NO");
        assert.equal(fixture.app.tg.lmXin(accounts[1].id, fixture.alliance), null);
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/lmtuchoi", {tk: accounts[1].id}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.lmXinGet.get(fixture.alliance, accounts[1].id), undefined);
      }
    },
    {
      label: "alliance-kick", command: "alliance",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.alliance = createAlliance(fixture.app, accounts[0], "KI");
        joinAlliance(fixture.app, fixture.alliance, accounts[0], accounts[1]);
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/lmduoi", {tk: accounts[1].id}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.dqGet.get(accounts[1].id).lm, null);
      }
    },
    {
      label: "alliance-transfer", command: "alliance",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.alliance = createAlliance(fixture.app, accounts[0], "TR");
        joinAlliance(fixture.app, fixture.alliance, accounts[0], accounts[1]);
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/lmchuyen", {tk: accounts[1].id}, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.lmGet.get(fixture.alliance).chu, accounts[1].id);
      }
    },
    {
      label: "chat-get-cleanup", command: "chat",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.app.kho.q.chatThem.run(
          NOW_S - 31 * 86400, accounts[0].id, accounts[0].display, null, "chung", "expired-chat"
        );
        fixture.app.api.chatDonLuc = 0;
      },
      request: function (fixture, accounts) {
        return get(fixture.app, "/api/chat", accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(
          fixture.app.kho.db.prepare("SELECT COUNT(*) n FROM chat WHERE noi=?").get("expired-chat").n,
          0
        );
      }
    },
    {
      label: "chat-post", command: "chat", account: function (accounts) { return accounts[0].id; },
      request: function (fixture, accounts) {
        return post(
          fixture.app, "/api/chat", {kenh: "chung", noi: "scheduler chat"}, accounts[0].token
        );
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.ok(fixture.app.kho.db.prepare("SELECT * FROM chat WHERE noi=?").get("scheduler chat"));
      }
    },
    {
      label: "mail", command: "mail", account: function (accounts) { return accounts[0].id; },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/guithu", {
          den: accounts[1].display, noi: "scheduler mail"
        }, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.ok(stateOf(fixture.app, accounts[1].id).msgs.some(function (message) {
          return message.nd === "scheduler mail";
        }));
      }
    },
    {
      label: "password-change", command: "password-change",
      account: function (accounts) { return accounts[0].id; },
      setup: function (fixture, accounts) {
        fixture.app.kho.q.phienThem.run("other-password-session", accounts[0].id, NOW_S, NOW_S + 3600);
      },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/doimk", {
          cu: accounts[0].password, moi: "changed-password"
        }, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.notEqual(fixture.app.kho.q.tkTheoId.get(accounts[0].id).mk, PASSWORD_HASH);
        assert.equal(fixture.app.kho.q.phienGet.get("other-password-session"), undefined);
      }
    },
    {
      label: "account-delete", command: "account-delete",
      account: function (accounts) { return accounts[0].id; },
      request: function (fixture, accounts) {
        return post(fixture.app, "/api/xoatk", {
          mk: accounts[0].password, xacnhan: "XOA"
        }, accounts[0].token);
      },
      verify: function (fixture, accounts, response) {
        assert.equal(response.status, 200);
        assert.equal(fixture.app.kho.q.tkTheoId.get(accounts[0].id), undefined);
      }
    }
  ];

  for (const row of rows) {
    const fixture = await taoApp("matrix-" + row.label);
    try {
      const accounts = await seedAccounts(fixture, 3);
      if (row.setup) await row.setup(fixture, accounts);
      const accountId = row.account(accounts);
      await assertBlockedHttp(fixture, row.command, accountId, function () {
        return row.request(fixture, accounts);
      });
      const before = snapshot(fixture.app.kho);
      const commandsAt = fixture.bridge.commands.length;
      const closuresAt = fixture.bridge.closures();
      const response = await row.request(fixture, accounts);
      const commands = fixture.bridge.commands.slice(commandsAt);
      const expected = row.command === "last-seen" ||
        row.command === "register" || row.command === "login" ||
        row.command === "session-expiry" || row.command === "logout"
        ? [row.command]
        : ["last-seen", row.command];
      assert.deepEqual(commands.map(function (entry) { return entry.name; }), expected, row.label);
      assert.equal(fixture.bridge.closures() - closuresAt, expected.length, row.label);
      if (row.mutates === false) {
        assert.equal(snapshot(fixture.app.kho), before, row.label + " success read");
      } else {
        assert.notEqual(snapshot(fixture.app.kho), before, row.label + " success mutation");
      }
      await row.verify(fixture, accounts, response);
    } finally {
      await closeFixture(fixture);
    }
  }
});

test("cleanup and advance-due direct calls are bridge-gated writes", async function () {
  const cleanup = await taoApp("cleanup-call");
  try {
    const accounts = await seedAccounts(cleanup, 1);
    cleanup.app.kho.q.phienThem.run("cleanup-expired", accounts[0].id, 1, 2);
    await assertBlockedCall(cleanup, "cleanup", function () { return cleanup.app.donRac(); });
    const before = snapshot(cleanup.app.kho);
    const commandsAt = cleanup.bridge.commands.length;
    await cleanup.app.donRac();
    assert.deepEqual(cleanup.bridge.commands.slice(commandsAt), [
      {name: "cleanup", accountId: undefined}
    ]);
    assert.notEqual(snapshot(cleanup.app.kho), before);
    assert.equal(cleanup.app.kho.q.phienGet.get("cleanup-expired"), undefined);
  } finally {
    await closeFixture(cleanup);
  }

  const advance = await taoApp("advance-call");
  try {
    const accounts = await seedAccounts(advance, 1);
    makeStateDue(advance.app, accounts[0]);
    await assertBlockedCall(advance, "advance-due", function () { return advance.app.nhip(); });
    const before = snapshot(advance.app.kho);
    const commandsAt = advance.bridge.commands.length;
    await advance.app.nhip();
    assert.deepEqual(advance.bridge.commands.slice(commandsAt), [
      {name: "advance-due", accountId: undefined}
    ]);
    // The fake bridge only proves admission.  `advance-due` now intentionally
    // carries a raw bridge command, so no legacy world tick may run here.
    assert.equal(snapshot(advance.app.kho), before);
    assert.equal(stateOf(advance.app, accounts[0].id).lastTick, NOW_S - 120);
  } finally {
    await closeFixture(advance);
  }
});

test("real durable cutover app routes every public mutation through scheduler", async function () {
  const fixture = await taoDurableApp("real-durable-cutover");
  try {
    assert.equal(fixture.app.scheduler.getStatus().mode, "durable");
    const ready = await get(fixture.app, "/readyz");
    assert.equal(ready.status, 200);
    assert.deepEqual(ready.body, {ready: true, reason: null});

    const alphaRegister = await post(fixture.app, "/api/dangky", {
      ten: "realalpha", hienthi: "Real Alpha", mk: PASSWORD
    });
    assert.equal(alphaRegister.status, 200, JSON.stringify(alphaRegister.body));
    const betaRegister = await post(fixture.app, "/api/dangky", {
      ten: "realbeta", hienthi: "Real Beta", mk: PASSWORD
    });
    assert.equal(betaRegister.status, 200, JSON.stringify(betaRegister.body));
    const alpha = fixture.app.kho.q.tkTheoTen.get("realalpha");
    const beta = fixture.app.kho.q.tkTheoTen.get("realbeta");
    assert.ok(alpha && beta);

    const alphaState = await get(fixture.app, "/api/state", alphaRegister.body.token);
    assert.equal(alphaState.status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(alphaState.body.st, "pvpToi"), true);
    assert.equal(Object.prototype.hasOwnProperty.call(alphaState.body.st, "pvpGiu"), true);
    const persistedAlpha = stateOf(fixture.app, alpha.id);
    assert.equal(Object.prototype.hasOwnProperty.call(persistedAlpha, "pvpToi"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(persistedAlpha, "pvpGiu"), false);

    const action = await post(fixture.app, "/api/lam", {
      ten: "doithue", dl: {pi: 0, thue: 11}
    }, alphaRegister.body.token);
    assert.equal(action.status, 200, JSON.stringify(action.body));
    assert.equal(stateOf(fixture.app, alpha.id).planets[0].danSu.taxBp, 1100);

    const war = await post(
      fixture.app, "/api/tuyenchien", {tk: beta.id}, alphaRegister.body.token
    );
    assert.equal(war.status, 200, JSON.stringify(war.body));
    assert.ok(fixture.app.kho.q.chienGetTK.get(alpha.id, beta.id));

    const mail = await post(fixture.app, "/api/guithu", {
      den: "Real Beta", noi: "real durable mail"
    }, alphaRegister.body.token);
    assert.equal(mail.status, 200, JSON.stringify(mail.body));
    assert.ok(stateOf(fixture.app, beta.id).msgs.some(function (message) {
      return message.nd === "real durable mail";
    }));

    const alliance = await post(fixture.app, "/api/lmtao", {
      ten: "Real Durable", tag: "RD"
    }, alphaRegister.body.token);
    assert.equal(alliance.status, 200, JSON.stringify(alliance.body));
    const allianceName = "[RD] Real Durable";
    const apply = await post(
      fixture.app, "/api/lmxin", {ten: allianceName}, betaRegister.body.token
    );
    assert.equal(apply.status, 200, JSON.stringify(apply.body));
    const approve = await post(
      fixture.app, "/api/lmduyet", {tk: beta.id}, alphaRegister.body.token
    );
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    assert.equal(fixture.app.kho.q.dqGet.get(beta.id).lm, allianceName);

    await fundGalanaThroughDurableScheduler(fixture.app, alpha.id, 5000);
    const alphaRevision = Number(fixture.app.kho.q.dqGet.get(alpha.id).revision);
    const betaRevision = Number(fixture.app.kho.q.dqGet.get(beta.id).revision);
    const transfer = await post(
      fixture.app, "/api/chuyengalana", {tk: beta.id, so: 1000}, alphaRegister.body.token
    );
    assert.equal(transfer.status, 200, JSON.stringify(transfer.body));
    assert.equal(stateOf(fixture.app, alpha.id).galana, 4000);
    assert.equal(stateOf(fixture.app, beta.id).galana, 4000);
    assert.ok(Number(fixture.app.kho.q.dqGet.get(alpha.id).revision) > alphaRevision);
    assert.ok(Number(fixture.app.kho.q.dqGet.get(beta.id).revision) > betaRevision);
    [alpha.id, beta.id].forEach(function (accountId) {
      const wake = fixture.app.kho.db.prepare(
        "SELECT expected_revision FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
        "AND aggregate_id=? ORDER BY sequence DESC LIMIT 1"
      ).get(String(accountId));
      assert.equal(Number(wake.expected_revision),
        Number(fixture.app.kho.q.dqGet.get(accountId).revision));
    });
    const writerStatus = fixture.app.scheduler.getStatus();
    assert.equal(writerStatus.ready, true);
    assert.ok(writerStatus.wakeTimerActive || writerStatus.pollTimerActive ||
      writerStatus.heartbeatTimerActive, "Galana reconciliation leaves a live writer wake");

    const leave = await post(fixture.app, "/api/lam", {
      ten: "lmra", dl: {}
    }, betaRegister.body.token);
    assert.equal(leave.status, 200, JSON.stringify(leave.body));
    assert.equal(fixture.app.kho.q.dqGet.get(beta.id).lm, null);

    const deletion = await post(fixture.app, "/api/xoatk", {
      mk: PASSWORD, xacnhan: "XOA"
    }, betaRegister.body.token);
    assert.equal(deletion.status, 200, JSON.stringify(deletion.body));
    assert.equal(fixture.app.kho.q.tkTheoId.get(beta.id), undefined);
  } finally {
    await closeFixture(fixture);
  }
});

test("real port-zero bridge path remains executable outside restricted bind sandboxes", async function (t) {
  let fixture;
  try {
    fixture = await taoApp("real-port", {realSocket: true});
  } catch (error) {
    if (error && (error.code === "EPERM" || error.code === "EACCES")) {
      t.skip("sandbox bind " + error.code);
      return;
    }
    throw error;
  }
  try {
    const response = await get(fixture.app, "/api/thongtin");
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.seed, "string");
  } finally {
    await closeFixture(fixture);
  }
});

test("durable cutover app admits real HTTP mutations without legacy writes", async function () {
  const dbPath = tempDb("durable-cutover-http");
  const clock = fakeClock(NOW_MS);
  const cutoverKho = new Kho(dbPath);
  let app = null;
  try {
    const {runMaintenanceCutover} = require("../server/scheduler/cutover.js");
    assert.deepEqual(runMaintenanceCutover({
      kho: cutoverKho,
      clock: clock,
      ownerId: "00000000-0000-4000-8000-000000007001"
    }), {mode: "durable", imported: 0, recovered: 0});
    cutoverKho.dong();

    app = taoUngDung({
      port: 0,
      dbPath: dbPath,
      env: {},
      clock: clock,
      logger: silentLogger(),
      timers: {
        setInterval: function () { return {}; },
        clearInterval: function () {}
      }
    });
    // This is an in-process HTTP adapter test.  It deliberately does not
    // depend on binding a port, which EPERM-restricted sandboxes may skip.
    app.server.listen = function () {
      queueMicrotask(function () { app.server.emit("listening"); });
      return app.server;
    };
    await app.start();

    const ready = await get(app, "/readyz");
    assert.deepEqual(ready.body, {ready: true, reason: null});
    assert.equal(ready.status, 200);
    const alpha = await post(app, "/api/dangky", {
      ten: "cutoveralpha", hienthi: "Cutover Alpha", mk: "durable-secret"
    });
    const beta = await post(app, "/api/dangky", {
      ten: "cutoverbeta", hienthi: "Cutover Beta", mk: "durable-secret"
    });
    assert.equal(alpha.status, 200);
    assert.equal(beta.status, 200);
    const alphaAccount = app.kho.q.tkTheoTen.get("cutoveralpha");
    const betaAccount = app.kho.q.tkTheoTen.get("cutoverbeta");
    assert.ok(alphaAccount && betaAccount);

    const state = await get(app, "/api/state", alpha.body.token);
    assert.equal(state.status, 200);
    assert.ok(Object.hasOwn(state.body.st, "pvpToi"));
    assert.ok(Object.hasOwn(state.body.st, "pvpGiu"));
    const persistedBeforeAction = stateOf(app, alphaAccount.id);
    assert.equal(Object.hasOwn(persistedBeforeAction, "pvpToi"), false);
    assert.equal(Object.hasOwn(persistedBeforeAction, "pvpGiu"), false);

    const action = await post(app, "/api/lam", {
      ten: "doithue", dl: {pi: 0, thue: 11}
    }, alpha.body.token);
    assert.equal(action.status, 200);
    assert.equal(stateOf(app, alphaAccount.id).planets[0].danSu.taxBp, 1100);

    const mail = await post(app, "/api/guithu", {
      den: "Cutover Beta", noi: "durable mail"
    }, alpha.body.token);
    assert.equal(mail.status, 200);
    assert.ok(stateOf(app, betaAccount.id).msgs.some(function (message) {
      return message.nd === "durable mail";
    }));

    const war = await post(app, "/api/tuyenchien", {tk: betaAccount.id}, alpha.body.token);
    assert.equal(war.status, 200);
    assert.ok(app.kho.q.chienGetTK.get(alphaAccount.id, betaAccount.id));

    assert.equal((await post(app, "/api/lmtao", {
      ten: "Durable Collective", tag: "DC"
    }, alpha.body.token)).status, 200);
    assert.equal((await post(app, "/api/lmxin", {
      ten: "[DC] Durable Collective"
    }, beta.body.token)).status, 200);
    assert.equal((await post(app, "/api/lmduyet", {
      tk: betaAccount.id
    }, alpha.body.token)).status, 200);

    await app.scheduler.runCommand({
      name: "test-credit-galana",
      accountId: alphaAccount.id,
      run: function () {
        const loaded = app.tg.nap(alphaAccount.id);
        loaded.st.galana = 5000;
        app.tg.luu(alphaAccount.id, loaded.st, {mutation: app.tg._schedulerMutation});
        return null;
      }
    });
    const alphaRevision = Number(app.kho.q.dqGet.get(alphaAccount.id).revision);
    const betaRevision = Number(app.kho.q.dqGet.get(betaAccount.id).revision);
    const transfer = await post(app, "/api/chuyengalana", {
      tk: betaAccount.id, so: 1000
    }, alpha.body.token);
    assert.equal(transfer.status, 200);
    assert.equal(stateOf(app, alphaAccount.id).galana, 4000);
    assert.equal(stateOf(app, betaAccount.id).galana, 4000);
    assert.ok(Number(app.kho.q.dqGet.get(alphaAccount.id).revision) > alphaRevision);
    assert.ok(Number(app.kho.q.dqGet.get(betaAccount.id).revision) > betaRevision);
    [alphaAccount.id, betaAccount.id].forEach(function (accountId) {
      const accountJob = app.kho.db.prepare(
        "SELECT expected_revision FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
        "AND aggregate_id=? ORDER BY sequence DESC LIMIT 1"
      ).get(String(accountId));
      assert.equal(Number(accountJob.expected_revision),
        Number(app.kho.q.dqGet.get(accountId).revision));
    });
    const writerStatus = app.scheduler.getStatus();
    assert.equal(writerStatus.ready, true);
    assert.ok(writerStatus.wakeTimerActive || writerStatus.pollTimerActive ||
      writerStatus.heartbeatTimerActive, "committed Galana saves reconcile the live writer wake state");

    const deleted = await post(app, "/api/xoatk", {
      mk: "durable-secret", xacnhan: "XOA"
    }, beta.body.token);
    assert.equal(deleted.status, 200);
    assert.equal(app.kho.q.tkTheoId.get(betaAccount.id), undefined);
  } finally {
    if (app) await app.stop().catch(function () {});
    else cutoverKho.dong();
    removeDb(dbPath);
  }
});

// BEGIN TASK2_TEST_APPEND
// Append this block after the byte-identical Task-1 baseline.
var task2StoreCache;
function task2StoreModule() {
  if (!task2StoreCache) task2StoreCache = require('../server/scheduler/store.js');
  return task2StoreCache;
}
function canonicalJson(value) { return task2StoreModule().canonicalJson(value); }
function sha256(text) { return task2StoreModule().sha256(text); }
function newSchedulerStore(kho, clock) {
  return new (task2StoreModule().SchedulerStore)(kho, clock);
}

var fixtureAccountIds = new Map(), nextFixtureAccountId = 100_000;
function accountFixtureIdentity(label, overrides) {
  var canonical = /^account-advance:([1-9][0-9]*):(-1|[0-9]+)$/.exec(String(label));
  if (canonical) return {accountId: Number(canonical[1]), revision: Number(canonical[2])};
  var explicitId = overrides && overrides.aggregateId !== undefined
    ? Number(overrides.aggregateId) : null;
  var accountId = explicitId;
  if (accountId === null) {
    if (!fixtureAccountIds.has(label)) fixtureAccountIds.set(label, nextFixtureAccountId++);
    accountId = fixtureAccountIds.get(label);
  }
  var revision = overrides && overrides.expectedRevision !== undefined
    ? Number(overrides.expectedRevision) : 1;
  return {accountId: accountId, revision: revision};
}
function accountFixtureKey(label, overrides) {
  var identity = accountFixtureIdentity(label, overrides);
  return 'account-advance:' + identity.accountId + ':' + identity.revision;
}
function job(label, scheduledAtS, priority, overrides) {
  overrides = overrides || {};
  var kind = overrides.kind || 'ACCOUNT_ADVANCE';
  if (kind !== 'ACCOUNT_ADVANCE') {
    return Object.assign({
      kind: 'ACCOUNT_ADVANCE', scheduledAtS: scheduledAtS, priority: priority,
      idempotencyKey: label, aggregateType: 'account', aggregateId: '1',
      expectedRevision: 1, payload: {schemaVersion: 1, accountId: 1}, maxAttempts: 8
    }, overrides);
  }
  var identity = accountFixtureIdentity(label, overrides);
  var payload = Object.assign({schemaVersion: 1}, overrides.payload || {}, {
    accountId: identity.accountId
  });
  var canonicalKey = accountFixtureKey(label, overrides);
  return Object.assign({
    kind: kind, scheduledAtS: scheduledAtS, priority: priority,
    idempotencyKey: canonicalKey, aggregateType: 'account',
    aggregateId: String(identity.accountId), expectedRevision: identity.revision,
    payload: payload, maxAttempts: 8
  }, overrides, {
    idempotencyKey: Object.prototype.hasOwnProperty.call(overrides, 'idempotencyKey')
      ? overrides.idempotencyKey : canonicalKey,
    payload: payload
  });
}
function taoStoreTam(clock) {
  var api = task2StoreModule();
  var x;
  try {
    x = taoKhoTam();
    x.clock = clock;
    apDungMigrationScheduler(x.kho, clock.nowMs());
    x.store = new api.SchedulerStore(x.kho, clock);
    x.dong = function () { dongKhoTam(x); };
    return x;
  } catch (error) {
    if (x) dongKhoTam(x);
    throw error;
  }
}
function danhDauRetry(kho, idempotencyKey, retryAtMs) {
  kho.db.prepare(
    "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=?," +
    "locked_by=NULL,locked_until_ms=NULL WHERE idempotency_key=?"
  ).run(retryAtMs, idempotencyKey);
}
function layLease(x, ownerId) {
  var token = x.store.acquireLease(ownerId, x.clock.nowMs(), 15_000);
  assert.ok(token, 'lease phải acquire được trong fixture mới');
  return { ownerId: ownerId, generation: token.generation };
}

test('claim merges PENDING and RETRY_WAIT by the exact CASE eligible key', function () {
  var clock = { nowMs: function () { return 10_000; } };
  var x = taoStoreTam(clock);
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000001');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('local-old', 8, 100), clock.nowMs());
      x.store.schedule(lease, job('retry-now', 1, 100), clock.nowMs());
    }, { immediate: true });
    danhDauRetry(x.kho, accountFixtureKey('retry-now'), 9_000);
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, 10_000, null, 15_000);
    }, { immediate: true });
    assert.equal(claimed.idempotency_key, accountFixtureKey('local-old'));
    x.kho.db.prepare(
      "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
    ).run();
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimNext(lease, 10_000, null, 15_000);
      }, {immediate: true});
    }, /LEASE_LOST/, 'a stale token is not an empty-or-work sentinel when work exists');
    x.kho.db.prepare('DELETE FROM event_jobs').run();
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimNext(lease, 10_000, null, 15_000);
      }, {immediate: true});
    }, /LEASE_LOST/, 'a stale token throws even when the eligible queue is empty');
  } finally { x.dong(); }
});

test('claimNext skips an earlier active lock through equality and claims it one millisecond later',
  function () {
    var now = 10_000, x = taoStoreTam({nowMs: function () { return now; }});
    try {
      var lease = layLease(x, '00000000-0000-4000-8000-000000000066');
      var rows = x.kho.trongGiaoDich(function () {
        var early = x.store.schedule(lease, job('locked-early', 8, 100), now);
        var later = x.store.schedule(lease, job('unlocked-later', 9, 100), now);
        x.kho.db.prepare(
          "UPDATE event_jobs SET locked_by='other',locked_until_ms=? WHERE id=?"
        ).run(now + 1, early.id);
        return {early: early, later: later};
      }, {immediate: true});
      assert.equal(x.kho.trongGiaoDich(function () {
        return x.store.claimNext(lease, now, null, 15_000).id;
      }, {immediate: true}), rows.later.id, 'locked earlier row is skipped');
      now += 1;
      assert.equal(x.kho.trongGiaoDich(function () {
        return x.store.claimNext(lease, now, null, 15_000);
      }, {immediate: true}), null, 'lock expiry equality is still locked');
      now += 1;
      assert.equal(x.kho.trongGiaoDich(function () {
        return x.store.claimNext(lease, now, null, 15_000).id;
      }, {immediate: true}), rows.early.id, 'strictly later instant can claim it');
    } finally { x.dong(); }
  });

test('claim ordering is deterministic across randomized PENDING and RETRY_WAIT ties', function () {
  var now = 20_000, x = taoStoreTam({ nowMs: function () { return now; } });
  var keys = ['p-a', 'r-a', 'p-b', 'r-b', 'p-tie-a', 'p-tie-b'];
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000050');
    for (var seed = 0; seed < 16; seed++) {
      var seedRows = x.kho.trongGiaoDich(function () {
        var rows = [];
        keys.forEach(function (_, index) {
          var key = keys[(index * 5 + seed * 3) % keys.length];
          rows.push(x.store.schedule(
            lease, job(key + '-' + seed, key.indexOf('r-') === 0 ? 19 : 20, 100), now
          ));
        });
        return rows;
      }, { immediate: true });
      danhDauRetry(x.kho, accountFixtureKey('r-a-' + seed), 18_000);
      danhDauRetry(x.kho, accountFixtureKey('r-b-' + seed), 20_000);
      var ids = seedRows.map(function (row) { return row.id; });
      var expectedStatement = x.kho.db.prepare(
        'SELECT id FROM event_jobs WHERE id IN (' + ids.map(function () { return '?'; }).join(',') + ') ' +
        "ORDER BY CASE WHEN state='RETRY_WAIT' THEN retry_at_ms ELSE scheduled_at_s*1000 END," +
        'priority,sequence,id'
      );
      var expected = expectedStatement.all.apply(expectedStatement, ids)
        .map(function (row) { return row.id; });
      assert.equal(expected.length, seedRows.length, 'seed ' + seed + ' fixture cardinality');
      var actual = expected.map(function () {
        return x.kho.trongGiaoDich(function () {
          return x.store.claimNext(lease, now, null, 15_000).id;
        }, { immediate: true });
      });
      assert.deepEqual(actual, expected, 'seed ' + seed);
    }
  } finally { x.dong(); }
});


test('same idempotency key accepts equal hash and rejects different payload', function () {
  var literal = '{"a":{"a":1,"z":2},"b":[{"c":3,"d":4},2],"z":0}';
  assert.equal(canonicalJson({z: 0, b: [{d: 4, c: 3}, 2], a: {z: 2, a: 1}}), literal);
  assert.equal(sha256(literal), '1e3df1c647b57786cea2ac927e4c0dc526a70bc60b33f9aa0fc7e6fc142ff3f9');
  var x = taoStoreTam({ nowMs: function () { return 1; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000002'), first;
    var input = job('same', 10, 100, {
      payload: {schemaVersion: 1, nextLocalAtS: 10}
    });
    taoDqChoReconcile(x, Number(input.aggregateId), Number(input.expectedRevision));
    x.kho.trongGiaoDich(function () {
      first = x.store.schedule(lease, input, 1);
      assert.equal(x.store.schedule(lease, input, 1).id, first.id);
      assert.throws(function () {
        x.store.schedule(lease, Object.assign({}, input, {
          payload: Object.assign({}, input.payload, {nextLocalAtS: 11})
        }), 1);
      }, /IDEMPOTENCY_PAYLOAD_MISMATCH/);
      [
        ['kind', 'PVP_RESOLVE'],
        ['scheduled_at_s', 11],
        ['priority', 50],
        ['max_attempts', 9],
        ['aggregate_type', 'match'],
        ['aggregate_id', String(Number(input.aggregateId) + 1)],
        ['expected_revision', Number(input.expectedRevision) + 1],
        ['source_account_id', Number(input.aggregateId)],
        ['payload_json', '{}'],
        ['payload_sha256', '0'.repeat(64)],
        ['replay_of_job_id', first.id]
      ].forEach(function (mutation) {
        var column = mutation[0];
        var original = x.kho.db.prepare(
          'SELECT ' + column + ' AS value FROM event_jobs WHERE id=?'
        ).get(first.id).value;
        x.kho.db.prepare('UPDATE event_jobs SET ' + column + '=? WHERE id=?')
          .run(mutation[1], first.id);
        assert.throws(function () {
          x.store.schedule(lease, input, 1);
        }, /IDEMPOTENCY_PAYLOAD_MISMATCH/, column);
        x.kho.db.prepare('UPDATE event_jobs SET ' + column + '=? WHERE id=?')
          .run(original, first.id);
      });
    }, { immediate: true });
  } finally { x.dong(); }
});

test('stale lease generation rolls back an effect transition', function () {
  var now = 1, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var oldLease = layLease(x, '00000000-0000-4000-8000-000000000003'), saved;
    x.kho.trongGiaoDich(function () {
      saved = x.store.schedule(oldLease, job('generation-job', 1, 100), now);
    }, { immediate: true });
    now = 15_001;
    assert.equal(x.store.acquireLease('00000000-0000-4000-8000-000000000004', now, 15_000), null);
    var oldGeneration = x.kho.db.prepare(
      "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().generation;
    assert.equal(oldGeneration, oldLease.generation);
    now = 15_002; // expiry is strict: existing expires_at_ms=15_001 must be < nowMs
    var newLease = layLease(x, '00000000-0000-4000-8000-000000000004');
    assert.notEqual(newLease.generation, oldLease.generation);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(oldLease, saved, { effectiveAtS: 1, result: { code: 'ok' } }, now);
      }, { immediate: true });
    }, /LEASE_LOST/);
    var oldEffects = x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
    ).get(accountFixtureKey('generation-job')).n;
    assert.equal(oldEffects, 0);
    assert.equal(x.kho.db.prepare('SELECT state FROM event_jobs WHERE id=?').get(saved.id).state, 'PENDING');
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(oldLease, now);
    }, { immediate: true }), false);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(newLease, now);
    }, { immediate: true }), true);
    var releasedExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(releasedExpires, 0);
    var afterRelease = layLease(x, '00000000-0000-4000-8000-000000000013');
    assert.equal(afterRelease.generation, newLease.generation + 1);
  } finally { x.dong(); }
});



test('releaseLease checks owner and generation, then permits immediate takeover', function () {
  var now = 100, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var current = layLease(x, '00000000-0000-4000-8000-000000000014');
    var wrongOwner = { ownerId: '00000000-0000-4000-8000-000000000015', generation: current.generation };
    var wrongGeneration = { ownerId: current.ownerId, generation: current.generation + 1 };
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(wrongOwner, now);
    }, { immediate: true }), false);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(wrongGeneration, now);
    }, { immediate: true }), false);
    var heldExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(heldExpires, 15_100);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(current, now);
    }, { immediate: true }), true);
    var zeroExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(zeroExpires, 0);
    var successor = layLease(x, '00000000-0000-4000-8000-000000000016');
    assert.equal(successor.generation, current.generation + 1);
  } finally { x.dong(); }
});

test('renewLease is generation-conditional and only a live owner extends expiry', function () {
  var now = 1, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000017');
    now = 5_000;
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.renewLease(lease, now, 15_000);
    }, { immediate: true }), true);
    var renewedExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(renewedExpires, 20_000);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.renewLease({ ownerId: lease.ownerId, generation: lease.generation + 1 }, now, 15_000);
    }, { immediate: true }), false);
    var unchangedExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(unchangedExpires, 20_000);
  } finally { x.dong(); }
});

function fixtureMatchId(ref, defenderAccountId) {
  return sha256(canonicalJson({
    ownerAccountId: ref.ownerAccountId,
    defenderAccountId: defenderAccountId,
    fleetId: ref.fleetId,
    launchAtS: ref.launchAtS,
    targetKey: ref.targetKey,
    arrivalAtS: ref.arrivalAtS,
    rule: 'pvp-v1'
  }));
}
function globalJob(key, scheduledAtS, replayOfJobId, fleetId) {
  fleetId = fleetId || 1;
  var ref = {kind: 'fleet', ownerAccountId: 1, fleetId: fleetId, launchAtS: 1,
    targetKey: '1:1:1', arrivalAtS: scheduledAtS, mission: 'attack'};
  var matchId = fixtureMatchId(ref, 2);
  return job(
    replayOfJobId ? 'manual-replay:' + replayOfJobId + ':fixture-replay' :
      'pvp-resolve:' + matchId + ':' + scheduledAtS,
    scheduledAtS,
    50,
    {
    kind: 'PVP_RESOLVE', aggregateType: 'match', aggregateId: matchId,
    expectedRevision: null, sourceAccountId: 1, replayOfJobId: replayOfJobId || null,
    payload: {
      schemaVersion: 1,
      matchId: matchId,
      ref: ref
    }
  }
  );
}
function replayJobFrom(source, nonce) {
  var payload = source.payload || JSON.parse(source.payload_json);
  return {
    kind: source.kind, scheduledAtS: Number(source.scheduled_at_s),
    priority: Number(source.priority),
    idempotencyKey: 'manual-replay:' + source.id + ':' + nonce,
    aggregateType: source.aggregate_type, aggregateId: source.aggregate_id,
    expectedRevision: source.expected_revision === null ? null : Number(source.expected_revision),
    sourceAccountId: source.source_account_id === null ? null : Number(source.source_account_id),
    payload: payload,
    maxAttempts: Number(source.max_attempts), replayOfJobId: source.id
  };
}
function externalGlobalJob(scheduledAtS) {
  return job('external:fleet:transport:1:1:1:1:1:1:' + scheduledAtS, scheduledAtS, 50, {
    kind: 'EXTERNAL_RESOLVE', aggregateType: 'fleet', aggregateId: '1',
    expectedRevision: null, sourceAccountId: 1,
    payload: { schemaVersion: 1, ref: {
      kind: 'fleet', ownerAccountId: 1, fleetId: 1, launchAtS: 1,
      targetKey: '1:1:1', arrivalAtS: scheduledAtS, mission: 'transport'
    } }
  });
}
test('global quarantine holds T until its replacement application commits', function () {
  var now = 10_000, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000018');
    var source, replacement, laterRoot;
    x.kho.trongGiaoDich(function () {
      source = x.store.schedule(lease, globalJob('poison-root', 10), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
        "error_code='INVARIANT' WHERE id=?"
      ).run(now, source.id);
      replacement = x.store.schedule(lease, replayJobFrom(source, 'n1'), now);
      laterRoot = x.store.schedule(lease, globalJob('later-root', 10, null, 2), now);
    }, { immediate: true });
    assert.notEqual(laterRoot.id, source.id, 'same-T root B has a distinct stable identity');
    assert.notEqual(laterRoot.idempotency_key, source.idempotency_key,
      'same-T root B has a distinct canonical key');
    assert.equal(x.store.globalWatermarkS(), 10);
    assert.equal(x.store.getByIdempotencyKey(replacement.idempotency_key).state, 'PENDING');
    assert.equal(x.store.globalWatermarkS(), 10, 'creation alone must not release root barrier');
    var barriers = x.store.listBarrierJobsAtOrBefore(lease, 10, now);
    assert.deepEqual(barriers.map(function (row) { return row.id; }), [replacement.id, laterRoot.id]);
    assert.deepEqual([
      barriers[0].logical_root_id,
      barriers[0].logical_key,
      barriers[0].logical_scheduled_at_s,
      barriers[0].logical_priority,
      barriers[0].logical_sequence,
      barriers[0].logical_order_id
    ], [source.id, source.idempotency_key, 10, 50, Number(source.sequence), source.id]);
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(lease, replacement.id, now, 15_000);
    }, { immediate: true });
    assert.equal(claimed.id, replacement.id);
    x.kho.trongGiaoDich(function () {
      var executable = x.store.loadExecutableJob(lease, Object.assign({}, claimed, {
        logical_root_id: laterRoot.id,
        logical_sequence: Number(laterRoot.sequence)
      }), now);
      assert.deepEqual([
        executable.logical_root_id,
        executable.logical_key,
        executable.logical_scheduled_at_s,
        executable.logical_priority,
        executable.logical_sequence,
        executable.logical_order_id
      ], [source.id, source.idempotency_key, 10, 50, Number(source.sequence), source.id]);
      assert.throws(function () {
        x.store.parkGlobalBehindPreceding(lease, executable, executable.id, 10, now);
      }, /BARRIER_PRECEDING_ORDER_INVALID/);
      assert.equal(x.store.getById(executable.id).state, 'RUNNING');
      x.store.insertApplication(lease, executable, {
        effectiveAtS: 10, result: { code: 'MATCH_INVALIDATED' }, resolvesJobId: source.id
      }, now);
      assert.equal(x.store.globalWatermarkS(), 10, 'application insertion alone does not release root');
      x.store.finishResolved(lease, executable, 'CANCELLED', 'MATCH_INVALIDATED', now);
    }, { immediate: true });
    assert.equal(x.store.globalWatermarkS(), 10, 'later same-time root remains authoritative');
    x.kho.trongGiaoDich(function () {
      var claimedLater = x.store.claimForResolution(lease, laterRoot.id, now, 15_000);
      x.store.insertApplication(lease, claimedLater, {
        effectiveAtS: 10, result: {code: 'MATCH_INVALIDATED'}
      }, now);
      x.store.finishResolved(lease, claimedLater, 'CANCELLED', 'MATCH_INVALIDATED', now);
    }, {immediate: true});
    assert.equal(x.store.globalWatermarkS(), null);
    assert.equal(
      x.kho.db.prepare('SELECT resolved_by_job_id FROM event_jobs WHERE id=?').get(source.id)
        .resolved_by_job_id,
      claimed.id
    );
    var resolves = x.kho.db.prepare(
      'SELECT resolves_job_id FROM event_applications WHERE job_id=?'
    ).get(claimed.id).resolves_job_id;
    assert.equal(resolves, source.id);
  } finally { x.dong(); }
});



test('store accepts current and previous payload schema, then rejects unsafe jobs', function () {
  var now = 100, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000031');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('schema-v1', 1, 100), now);
      var previous = x.store.schedule(lease, job('account-advance:1:1', 2, 100, {
        payload: { schemaVersion: 0, accountId: 1 }
      }), now);
      assert.equal(
        previous.payload_json,
        '{"accountId":1,"nextLocalAtS":2,"schemaVersion":1}'
      );
      assert.equal(
        previous.payload_sha256,
        '59786c5adf75223e34241321256c956a7c28a7251a0e809f2f3d83580d219764'
      );
      assert.throws(function () {
        x.store.schedule(lease, job('schema-v2', 3, 100, {
          payload: { schemaVersion: 2, accountId: 1 }
        }), now);
      }, /PAYLOAD_SCHEMA_UNSUPPORTED/);
      assert.throws(function () {
        x.store.schedule(lease, job('bad-kind', 4, 100, {
          kind: 'RUN_ARBITRARY', payload: { schemaVersion: 1, accountId: 1 }
        }), now);
      }, /JOB_KIND_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('bad-priority', 5, 50), now);
      }, /JOB_PRIORITY_INVALID/);
      var huge = globalJob('large', 6);
      // `targetKey` is a known ref member.  This proves byte validation runs
      // before a later value-range rejection; an unknown `pad` must not mask it.
      huge.payload.ref.targetKey = 'x'.repeat(65_537);
      assert.throws(function () {
        x.store.schedule(lease, huge, now);
      }, /PAYLOAD_TOO_LARGE/);
      assert.throws(function () {
        x.store.schedule(lease, job('unsafe-time', -1, 100), now);
      }, /JOB_SCHEDULED_AT_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('empty-key', 7, 100, {idempotencyKey: ''}), now);
      }, /JOB_IDEMPOTENCY_KEY_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('unsafe-attempts', 8, 100, { maxAttempts: 0 }), now);
      }, /JOB_MAX_ATTEMPTS_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('unsafe-next', 9, 100, {
          payload: { schemaVersion: 1, accountId: 1, nextLocalAtS: -1 }
        }), now);
      }, /PAYLOAD_VALUE_INVALID/);
      var wrongPvpRef = globalJob('wrong-pvp-ref', 10);
      wrongPvpRef.payload.ref.mission = 'transport';
      assert.throws(function () {
        x.store.schedule(lease, wrongPvpRef, now);
      }, /PAYLOAD_VALUE_INVALID/);
      var wrongPvpAggregate = globalJob('wrong-pvp-aggregate', 10);
      wrongPvpAggregate.aggregateId = fixtureMatchId(Object.assign({}, wrongPvpAggregate.payload.ref, {
        fleetId: 99
      }), 2);
      assert.throws(function () {
        x.store.schedule(lease, wrongPvpAggregate, now);
      }, /JOB_AGGREGATE_INVALID/);
      var wrongExternalRef = externalGlobalJob(11);
      wrongExternalRef.priority = 51;
      wrongExternalRef.aggregateType = 'missile';
      wrongExternalRef.idempotencyKey = 'external:missile:spy:1:1:1:1:1:1:11';
      wrongExternalRef.payload.ref = {
        kind: 'missile', ownerAccountId: 1, missileId: 1, launchAtS: 1,
        targetKey: '1:1:1', arrivalAtS: 11, mission: 'spy'
      };
      assert.deepEqual([
        wrongExternalRef.priority, wrongExternalRef.aggregateType,
        wrongExternalRef.aggregateId, wrongExternalRef.sourceAccountId,
        wrongExternalRef.idempotencyKey
      ], [51, 'missile', '1', 1, 'external:missile:spy:1:1:1:1:1:1:11']);
      assert.throws(function () {
        x.store.schedule(lease, wrongExternalRef, now);
      }, /PAYLOAD_VALUE_INVALID/);
      var wrongExternalAggregate = externalGlobalJob(12);
      wrongExternalAggregate.aggregateId = '2';
      assert.throws(function () {
        x.store.schedule(lease, wrongExternalAggregate, now);
      }, /JOB_AGGREGATE_INVALID/);
      var wrongExternalRevision = externalGlobalJob(13);
      wrongExternalRevision.expectedRevision = 0;
      assert.throws(function () {
        x.store.schedule(lease, wrongExternalRevision, now);
      }, /JOB_AGGREGATE_INVALID/);
      var nonCanonicalTarget = globalJob('target-leading-zero', 14);
      nonCanonicalTarget.payload.ref.targetKey = '01:1:1';
      assert.throws(function () {
        x.store.schedule(lease, nonCanonicalTarget, now);
      }, /PAYLOAD_VALUE_INVALID/);
    }, { immediate: true });
    var adversarial = [
      'token=secret-token',
      'accountId=42',
      'name="Nguyễn Bí Mật"',
      'uuid=00000000-0000-4000-8000-000000000099',
      '{"payload":{"ships":{"cruiser":30}},"state":"raw"}',
      '😀'.repeat(200)
    ].join(' ');
    var safe = x.store.safeErrorMessage(adversarial);
    assert.ok(Buffer.byteLength(safe, 'utf8') <= 256);
    assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(safe)), safe);
    assert.doesNotMatch(
      safe,
      /secret-token|42|Nguyễn|Bí Mật|00000000-|cruiser|payload|state/
    );
    assert.equal(x.store.safeErrorMessage({ token: 'x', accountId: 7 }), '[redacted-object]');
    assert.deepEqual(x.store.scrubLogEntry({
      event: 'scheduler.tick', at: 123, count: 7, budgetExhausted: false,
      code: undefined, payload: adversarial, accountId: 42
    }), {event: 'scheduler.tick', at: 123, count: 7, budgetExhausted: false});
    assert.deepEqual(x.store.scrubLogEntry({
      event: 'scheduler.error', at: 124, code: 'SQLITE_FULL', message: adversarial
    }), {event: 'scheduler.error', at: 124, code: 'SQLITE_FULL'});
    assert.throws(function () {
      x.store.scrubLogEntry({event: 'scheduler.tick', at: 1, count: -1});
    }, /SCHEDULER_LOG_COUNT_INVALID/);
    assert.throws(function () {
      x.store.scrubLogEntry({event: 'scheduler.error', at: 1, count: 1});
    }, /SCHEDULER_LOG_TICK_FIELDS_INVALID/);
  } finally { x.dong(); }
});

test('execution rejects raw payload tampering before a reducer can receive it', function () {
  var now = 500, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000051');
    var saved = x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('raw-integrity', 0, 100), now);
      return x.store.claimNext(lease, now, null, 15_000);
    }, { immediate: true });
    [
      saved.id.toUpperCase(),
      ' ' + saved.id,
      saved.id.slice(0, 14) + '1' + saved.id.slice(15),
      saved.id.slice(0, 19) + '7' + saved.id.slice(20),
      7,
      null
    ].forEach(function (invalidId) {
      assert.throws(function () {
        x.store.getById(invalidId);
      }, /SCHEDULER_JOB_ID_INVALID/);
    });
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
      .run(' '.repeat(65_537), saved.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, saved, now);
    }, /PAYLOAD_INTEGRITY/);
    var badValues = { accountId: '1', schemaVersion: 1 };
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=?,payload_sha256=? WHERE id=?')
      .run(canonicalJson(badValues), sha256(canonicalJson(badValues)), saved.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, saved, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
      .run(' {"accountId":1,"schemaVersion":1}', saved.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, saved, now);
    }, /PAYLOAD_INTEGRITY/);
    var stale = x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('stale-application-object', 0, 100), now);
      var claimed = x.store.claimNext(lease, now, null, 15_000);
      x.store.fail(lease, claimed, {code: 'SQLITE_BUSY'}, now, {
        retryBaseMs: 1_000, retryMaxMs: 300_000, maxAttempts: 8
      });
      return claimed;
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, stale, {
          effectiveAtS: 0, result: {code: 'ACCOUNT_ADVANCED'}
        }, now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
    ).get(stale.id).n, 0);
  } finally { x.dong(); }
});

test('loadReplayableJob validates a quarantined source before CLI replay copies it', function () {
  var now = 510, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000052');
    var source = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('replay-validated', 12), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=? WHERE id=?"
      ).run(now, saved.id);
      return saved;
    }, { immediate: true });
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.loadReplayableJob(lease, source.id, now).id;
    }, { immediate: true }), source.id);
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
      .run('{not-json', source.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.loadReplayableJob(lease, source.id, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
  } finally { x.dong(); }
});

test('stored PVP and EXTERNAL rows retain source account through executable and replay validation', function () {
  var now = 21_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000053');
    [globalJob('stored-pvp-source', 20), externalGlobalJob(21)]
      .forEach(function (input, index) {
        var claimed = x.kho.trongGiaoDich(function () {
          var saved = x.store.schedule(lease, input, now);
          return x.store.claimForResolution(
            lease, saved.id, now, 15_000, {onlyEligible: true}
          );
        }, { immediate: true });
        var executable = x.kho.trongGiaoDich(function () {
          return x.store.loadExecutableJob(lease, claimed, now);
        }, { immediate: true });
        assert.equal(Number(executable.source_account_id), 1, input.kind + ' stored source');
        assert.equal(executable.payload.ref.ownerAccountId, 1, input.kind + ' executable ref');
        x.kho.db.prepare(
          "UPDATE event_jobs SET state='QUARANTINED',locked_by=NULL,locked_until_ms=NULL WHERE id=?"
        ).run(claimed.id);
        var replayable = x.kho.trongGiaoDich(function () {
          return x.store.loadReplayableJob(lease, claimed.id, now);
        }, { immediate: true });
        var replay = replayJobFrom(replayable, index === 0 ? 'pvp' : 'external');
        assert.equal(replay.sourceAccountId, 1, input.kind + ' replay source');
        assert.equal(replay.payload.ref.ownerAccountId, 1, input.kind + ' replay ref');
      });
  } finally { x.dong(); }
});

test('replay key and source identity must be canonical and equivalent', function () {
  var now = 515, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000057');
    var source = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('replay-source-check', 12), now);
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED' WHERE id=?").run(saved.id);
      return saved;
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, globalJob('mismatched', 13, source.id), now);
      }, { immediate: true });
    }, /REPLAY_SOURCE_MISMATCH/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, Object.assign(globalJob('bad-nonce', 12, source.id), {
          idempotencyKey: 'manual-replay:' + source.id + ':UPPER'
        }), now);
      }, { immediate: true });
    }, /JOB_IDEMPOTENCY_KEY_INVALID/);
  } finally { x.dong(); }
});

test('duplicate external application validates canonical result before alreadyApplied', function () {
  var now = 13_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000053');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, externalGlobalJob(13), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 13,
        result: { code: 'EXTERNAL_RESOLVED' }
      }, now);
    }, { immediate: true });
    x.kho.db.prepare(
      'UPDATE event_applications SET result_json=?,result_sha256=? WHERE job_id=?'
    ).run('{bad', sha256('{bad'), claimed.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 13, result: { code: 'EXTERNAL_RESOLVED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
  } finally { x.dong(); }
});

test('PvP application shape is context-validated on first insert and duplicate replay', function () {
  var now = 13_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000055');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('application-context', 13), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 13, result: { code: 'PVP_RESOLVED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 13, result: { code: 'MATCH_INVALIDATED' }
      }, now);
    }, { immediate: true });
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.insertApplication(lease, claimed, {
        effectiveAtS: 13, result: { code: 'MATCH_INVALIDATED' }
      }, now).alreadyApplied;
    }, { immediate: true }), true);
  } finally { x.dong(); }
});

test('application duplicate rejects tampered canonical result identity and replay linkage', function () {
  var now = 14_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000058');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('result-integrity', 14), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 14, result: { code: 'MATCH_INVALIDATED' }
      }, now);
    }, { immediate: true });
    x.kho.db.prepare('UPDATE event_applications SET result_json=?,result_sha256=? WHERE job_id=?')
      .run('{"code":"MATCH_INVALIDATED","schemaVersion":1}', sha256('{}'), claimed.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 14, result: { code: 'MATCH_INVALIDATED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.completeApplied(lease, claimed, now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);
  } finally { x.dong(); }
});

test('application results use per-kind exact fields and cutover recovery evidence', function () {
  var now = 15_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000060');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('cutover-evidence', 15), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 15, result: { code: 'MATCH_INVALIDATED', extra: true }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 15, result: { code: 'REPLAYED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/, 'REPLAYED needs a replay_of_job_id');
    var evidence = {
      code: 'RECOVERED_LATEST_STATE', recoveredAtCutover: true,
      recovery: 'recovered-latest-state', originalScheduledAtS: 15, recoveredAtS: 16
    };
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, { effectiveAtS: 16, result: evidence }, now);
    }, { immediate: true });
    assert.deepEqual(JSON.parse(x.kho.db.prepare(
      'SELECT result_json FROM event_applications WHERE job_id=?'
    ).get(claimed.id).result_json), evidence);
    x.kho.db.exec(
      "CREATE TEMP TRIGGER task2_completion_conflict BEFORE UPDATE OF state ON event_jobs " +
      "WHEN OLD.id='" + claimed.id + "' BEGIN SELECT RAISE(IGNORE); END"
    );
    try {
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.completeApplied(lease, claimed, now);
        }, {immediate: true});
      }, /JOB_COMPLETION_CONFLICT/);
    } finally {
      x.kho.db.exec('DROP TRIGGER task2_completion_conflict');
    }
    assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
    x.kho.trongGiaoDich(function () {
      x.store.completeApplied(lease, claimed, now);
    }, {immediate: true});
    assert.equal(x.store.getById(claimed.id).state, 'COMPLETED');
  } finally { x.dong(); }
});

test('unresolved global watermark blocks a later local wake instead of letting it cross T', function () {
  var now = 16_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000061');
    x.kho.trongGiaoDich(function () {
      var global = x.store.schedule(lease, globalJob('watermark-holds-local', 10), now);
      x.store.schedule(lease, {
        kind: 'ACCOUNT_ADVANCE', scheduledAtS: 11, priority: 100,
        idempotencyKey: 'account-advance:1:0', aggregateType: 'account', aggregateId: '1',
        expectedRevision: 0, maxAttempts: 8,
        payload: {schemaVersion: 1, accountId: 1, nextLocalAtS: 11}
      }, now);
      x.kho.db.prepare("UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?")
        .run(now + 10_000, global.id);
    }, { immediate: true });
    assert.equal(x.store.globalWatermarkS(), 10);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, x.store.globalWatermarkS(), 15_000);
    }, { immediate: true }), null);
    assert.equal(x.store.nextEligibleAtMs(now, x.store.globalWatermarkS()), now + 10_000);
  } finally { x.dong(); }
});

test('application conflict target never swallows an unrelated unique job linkage', function () {
  var now = 13_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000065');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, externalGlobalJob(13), now);
      return x.store.claimForResolution(lease, saved.id, now, 15_000);
    }, {immediate: true});
    var resultJson = canonicalJson({code: 'EXTERNAL_RESOLVED'});
    x.kho.db.prepare(
      'INSERT INTO event_applications(' +
      'idempotency_key,job_id,resolves_job_id,effective_at_s,applied_at_ms,' +
      'snapshot_json,snapshot_sha256,result_json,result_sha256) ' +
      'VALUES(?,?,?,?,?,?,?,?,?)'
    ).run(
      'different-application-key', claimed.id, null, 13, now,
      null, null, resultJson, sha256(resultJson)
    );
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 13, result: {code: 'EXTERNAL_RESOLVED'}
        }, now);
      }, {immediate: true});
    }, /UNIQUE/, 'ON CONFLICT(idempotency_key) must not absorb UNIQUE(job_id)');
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
    ).get(claimed.idempotency_key).n, 0);
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
    ).get('different-application-key').n, 1);
  } finally { x.dong(); }
});


test('retry and expired-running recovery use the incremented attempt exactly once', function () {
  var now = 10_000, x = taoStoreTam({ nowMs: function () { return now; } });
  var policy = { retryBaseMs: 1_000, retryMaxMs: 300_000, maxAttempts: 8 };
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000032');
    var first = x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('retry-one', 10, 100), now);
      return x.store.claimNext(lease, now, null, 15_000);
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.store.fail(lease, first, { code: 'SQLITE_BUSY', retryable: true }, now, policy);
    }, { immediate: true });
    var retried = x.store.getByIdempotencyKey(accountFixtureKey('retry-one'));
    assert.equal(retried.attempt, 1);
    assert.equal(
      Number(retried.retry_at_ms),
      now + 1_000 + x.store.deterministicJitter(retried.id, 1)
    );
    x.kho.db.prepare('UPDATE event_jobs SET retry_at_ms=? WHERE id=?')
      .run(100_000, retried.id);
    now = 30_000;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, job('stale-owner', 30, 100), now);
      }, { immediate: true });
    }, /LEASE_LOST/);
    var freshLease = layLease(x, '00000000-0000-4000-8000-000000000043');
    var running = x.kho.trongGiaoDich(function () {
      x.store.schedule(freshLease, job('recover-one', 30, 100), now);
      return x.store.claimNext(freshLease, now, null, 15_000);
    }, { immediate: true });
    assert.equal(running.idempotency_key, accountFixtureKey('recover-one'));
    assert.equal(Number(running.attempt), 0);
    assert.equal(running.locked_by, freshLease.ownerId);
    assert.equal(Number(running.locked_until_ms), 45_000);
    now = 45_000;
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.acquireLease('00000000-0000-4000-8000-000000000044', now, 15_000);
    }, { immediate: true }), null);
    now = 45_001;
    var recoveryLease = layLease(x, '00000000-0000-4000-8000-000000000044');
    assert.ok(recoveryLease.generation > freshLease.generation);
    var recoveredCount = x.kho.trongGiaoDich(function () {
      return x.store.recoverExpiredRunning(recoveryLease, now, policy);
    }, { immediate: true });
    assert.equal(recoveredCount, 1);
    assert.equal(x.store.getById(retried.id).state, 'RETRY_WAIT');
    assert.equal(Number(x.store.getById(retried.id).attempt), 1);
    var recovered = x.store.getByIdempotencyKey(running.idempotency_key);
    assert.equal(recovered.attempt, 1);
    assert.equal(
      Number(recovered.retry_at_ms),
      now + 1_000 + x.store.deterministicJitter(recovered.id, 1)
    );
  } finally { x.dong(); }
});

test('nextEligibleAtMs and statusSnapshot expose only aggregate scheduling data', function () {
  var now = 10_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000034');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('eligible-pending', 12, 100), now);
      x.store.schedule(lease, job('later-pending', 13, 100), now);
    }, { immediate: true });
    assert.equal(x.store.nextEligibleAtMs(now, null), 12_000);
    var status = x.store.statusSnapshot(now);
    assert.equal(status.pending, 2);
    assert.equal(status.nextEligibleAtMs, 12_000);
    assert.equal(Object.hasOwn(status, 'jobId'), false);
    assert.equal(Object.hasOwn(status, 'payload'), false);
  } finally { x.dong(); }
});



test('local cancellation is idempotent while global cancellation is refused', function () {
  var now = 50, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000033');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('cancel-local', 1, 100), now);
      var global = x.store.schedule(lease, globalJob('cancel-global', 1), now);
      x.store.cancel(lease, accountFixtureKey('cancel-local'), 'SUPERSEDED', now);
      x.store.cancel(lease, accountFixtureKey('cancel-local'), 'SUPERSEDED', now);
      assert.throws(function () {
        x.store.cancel(lease, global.idempotency_key, 'OPERATOR_CANCELLED', now);
      }, /GLOBAL_CANCEL_FORBIDDEN/);
      assert.throws(function () {
        x.store.cancel(lease, accountFixtureKey('cancel-local'), 'free-text', now);
      }, /CANCEL_REASON_INVALID/);
    }, { immediate: true });
    assert.equal(x.store.getByIdempotencyKey(accountFixtureKey('cancel-local')).state, 'CANCELLED');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('cancel-application', 0, 100), now);
      var claimed = x.store.claimNext(lease, now, null, 15_000);
      assert.throws(function () {
        x.store.completeApplied(lease, claimed, now);
      }, /APPLICATION_REQUIRED/);
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 0, result: {code: 'STALE_REVISION'}
      }, now);
      assert.throws(function () {
        x.store.completeApplied(lease, claimed, now);
      }, /JOB_COMPLETION_RESULT_INVALID/);
      assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
      x.store.finishResolved(lease, claimed, 'CANCELLED', 'STALE_REVISION', now);
    }, {immediate: true});
  } finally { x.dong(); }
});

test('quarantined global resolution claims, locks, applies, then reaches CANCELLED', function () {
  var now = 80, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000037');
    var source = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, globalJob('resolve-root', 9), now);
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
        "error_code='PAYLOAD_INTEGRITY',error_message_safe='safe' WHERE id=?"
      ).run(now, source.id);
      assert.equal(x.store.globalWatermarkS(), 9);
      var claimed = x.store.claimForResolution(lease, source.id, now, 15_000, {
        allowQuarantined: true
      });
      assert.equal(claimed.state, 'RUNNING');
      assert.equal(claimed.locked_by, lease.ownerId);
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 9,
        result: { code: 'MATCH_INVALIDATED' }
      }, now);
      assert.throws(function () {
        x.store.completeApplied(lease, claimed, now);
      }, /JOB_COMPLETION_RESULT_INVALID/);
      assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
      x.store.finishResolved(
        lease,
        claimed,
        'CANCELLED',
        'MATCH_INVALIDATED',
        now
      );
    }, { immediate: true });
    assert.equal(x.store.getByIdempotencyKey(source.idempotency_key).state, 'CANCELLED');
    assert.equal(x.store.globalWatermarkS(), null);
    assert.equal(
      x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?').get(source.id).n,
      1
    );
  } finally { x.dong(); }
});

test('pending global terminalization requires a claimed immutable application', function () {
  var now = 90, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000045');
    var source = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, globalJob('pending-orphan', 10), now);
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, source.id, now, 15_000);
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'default resolution claim obeys scheduled time');
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, source.id, now, 15_000, {allowFuturePending: true}
      );
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: Number(source.scheduled_at_s),
        result: {code: 'MATCH_INVALIDATED'}
      }, now);
      x.store.finishResolved(lease, claimed, 'CANCELLED', 'MATCH_INVALIDATED', now);
    }, { immediate: true });
    assert.equal(x.store.getById(source.id).state, 'CANCELLED');
    assert.equal(x.store.globalWatermarkS(), null);
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
    ).get(source.id).n, 1);

    function claimedWithApplication(input, result) {
      return x.kho.trongGiaoDich(function () {
        var saved = x.store.schedule(lease, input, now);
        var claimed = x.store.claimForResolution(lease, saved.id, now, 15_000, {
          allowFuturePending: true
        });
        if (result) {
          x.store.insertApplication(lease, claimed, {
            effectiveAtS: Number(saved.scheduled_at_s), result: result
          }, now);
        }
        return claimed;
      }, {immediate: true});
    }

    var missing = claimedWithApplication(job('terminal-missing-app', 0, 100), null);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, missing, 'CANCELLED', 'STALE_REVISION', now);
      }, {immediate: true});
    }, /APPLICATION_REQUIRED/);

    var staleRow = claimedWithApplication(job('terminal-stale-row', 0, 100), null);
    x.kho.db.prepare(
      "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?"
    ).run(now + 1_000, staleRow.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, staleRow, 'CANCELLED', 'STALE_REVISION', now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);

    var corrupt = claimedWithApplication(
      globalJob('terminal-corrupt-app', 11), {code: 'MATCH_INVALIDATED'}
    );
    x.kho.db.prepare(
      'UPDATE event_applications SET result_json=?,result_sha256=? WHERE job_id=?'
    ).run('{bad', sha256('{bad'), corrupt.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, corrupt, 'CANCELLED', 'MATCH_INVALIDATED', now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);

    var success = claimedWithApplication(
      externalGlobalJob(12), {code: 'EXTERNAL_RESOLVED'}
    );
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, success, 'COMPLETED', 'free-text', now);
      }, {immediate: true});
    }, /JOB_TERMINAL_STATE_INVALID/, 'state validation has first precedence');
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, success, 'CANCELLED', 'free-text', now);
      }, {immediate: true});
    }, /JOB_TERMINAL_REASON_INVALID/, 'reason validation precedes lease and row reads');
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(
          {ownerId: lease.ownerId, generation: lease.generation + 1},
          success,
          'CANCELLED',
          'MATCH_INVALIDATED',
          now
        );
      }, {immediate: true});
    }, /LEASE_LOST/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, success, 'CANCELLED', 'MATCH_INVALIDATED', now);
      }, {immediate: true});
    }, /JOB_TERMINAL_RESULT_MISMATCH/, 'a success application cannot cancel a job');

    [
      {
        input: job('terminal-mismatch-stale', 0, 100),
        result: {code: 'MATCH_INVALIDATED'}, reason: 'STALE_REVISION'
      },
      {
        input: globalJob('terminal-mismatch-match', 13),
        result: {code: 'ENTITY_REMOVED'}, reason: 'MATCH_INVALIDATED'
      },
      {
        input: globalJob('terminal-mismatch-entity', 14),
        result: {code: 'MATCH_INVALIDATED'}, reason: 'ENTITY_REMOVED'
      },
      {
        input: globalJob('terminal-mismatch-operator', 15),
        result: {code: 'MATCH_INVALIDATED'}, reason: 'OPERATOR_CONFIRMED_INVALID'
      }
    ].forEach(function (example) {
      var claimed = claimedWithApplication(example.input, example.result);
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.finishResolved(lease, claimed, 'CANCELLED', example.reason, now);
        }, {immediate: true});
      }, /JOB_TERMINAL_RESULT_MISMATCH/, example.reason);
      assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
    });

    var conflict = claimedWithApplication(
      globalJob('terminal-conflict', 16), {code: 'MATCH_INVALIDATED'}
    );
    x.kho.db.exec(
      "CREATE TEMP TRIGGER task2_terminal_conflict BEFORE UPDATE OF state ON event_jobs " +
      "WHEN OLD.id='" + conflict.id + "' BEGIN SELECT RAISE(IGNORE); END"
    );
    try {
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.finishResolved(lease, conflict, 'CANCELLED', 'MATCH_INVALIDATED', now);
        }, {immediate: true});
      }, /JOB_TERMINAL_CONFLICT/);
    } finally {
      x.kho.db.exec('DROP TRIGGER task2_terminal_conflict');
    }
    assert.equal(x.store.getById(conflict.id).state, 'RUNNING');
  } finally { x.dong(); }
});

test(
  'resolution claim enforces strict unlock and future capability never bypasses retry time',
  function () {
  var now = 20_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000064');
    var locked = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, globalJob('locked-resolution', 20), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET locked_by='other',locked_until_ms=? WHERE id=?"
      ).run(now + 1, row.id);
      return row;
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, locked.id, now, 15_000);
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'an active lock is not claimable');
    now += 1;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, locked.id, now, 15_000);
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'lock expiry equality remains locked');
    now += 1;
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(lease, locked.id, now, 15_000).id;
    }, {immediate: true}), locked.id, 'one millisecond past expiry is claimable');

    var futureRetry = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, globalJob('future-retry', 20), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?"
      ).run(now + 10_000, row.id);
      return row;
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, futureRetry.id, now, 15_000, {
          allowFuturePending: true
        });
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'future retry never uses the pending-only bypass');
  } finally { x.dong(); }
  }
);

test('terminal replay atomically resolves the quarantined forensic source only after its application', function () {
  var now = 11_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000049');
    x.kho.trongGiaoDich(function () {
      var source = x.store.schedule(lease, globalJob('replay-source', 11), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
        "error_code='PAYLOAD_INTEGRITY',error_message_safe='safe' WHERE id=?"
      ).run(now, source.id);
      var replay = x.store.schedule(lease, replayJobFrom(source, 'fixture-replay'), now);
      var claimed = x.store.claimForResolution(lease, replay.id, now, 15_000);
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 11,
        resolvesJobId: source.id,
        result: { code: 'REPLAYED' }
      }, now);
      assert.equal(x.store.globalWatermarkS(), 11, 'application alone does not release the source');
      x.store.completeApplied(lease, claimed, now);
      var resolved = x.store.getById(source.id);
      assert.equal(resolved.state, 'CANCELLED');
      assert.equal(resolved.resolved_by_job_id, replay.id);
      assert.equal(resolved.error_code, 'PAYLOAD_INTEGRITY');
    }, { immediate: true });
    assert.equal(x.store.globalWatermarkS(), null);
  } finally { x.dong(); }
});

function taoDqChoReconcile(x, accountId, revision) {
  x.kho.db.prepare(
    'INSERT INTO tk(id,ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?,?)'
  ).run(accountId, 'reconcile' + accountId, 'Reconcile ' + accountId, 'h', 's', 1, 1);
  x.kho.db.prepare(
    'INSERT INTO dq(tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
    'lm,soHT,capNhat,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(accountId, '{"v":1}', 0, 0, 0, 0, 0, 1, 10, null, 0, 1, revision);
}
test('only the lease-owned reconcile constructor admits expected revision minus one', function () {
  var now = 530, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000059');
    taoDqChoReconcile(x, 1, 0);
    var reconcile = job('private-template', 10, 200, {
      aggregateId: '1', expectedRevision: -1,
      payload: { schemaVersion: 1, accountId: 1, reconcile: true, reconcileRevision: 0 }
    });
    x.kho.trongGiaoDich(function () {
      assert.throws(function () { x.store.schedule(lease, reconcile, now); }, /RECONCILE_JOB_FORBIDDEN/);
      var saved = x.store.scheduleReconcileAccountAdvance(lease, reconcile, now);
      assert.equal(saved.expected_revision, -1);
      assert.equal(saved.priority, 200);
      assert.equal(saved.idempotency_key,
        'reconcile:account:1:0:' + saved.sequence + ':10');
      var kept = x.store.ensureReconcileAccountAdvance(lease, reconcile, now);
      assert.equal(kept.id, saved.id);
      assert.equal(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
        "AND aggregate_id='1' AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
      ).get().n, 1);
    }, { immediate: true });
    var sequenceBeforeReject = x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value;
    var rowsBeforeReject = x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_jobs').get().n;
    var rejected;
    try {
      x.kho.trongGiaoDich(function () {
        x.store.scheduleReconcileAccountAdvance(
          lease, Object.assign({}, reconcile, {priority: 100}), now
        );
      }, {immediate: true});
    } catch (error) { rejected = error; }
    assert.ok(rejected, 'private reconcile constructor rejects priority 100');
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, sequenceBeforeReject, 'rejection allocates no sequence');
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_jobs'
    ).get().n, rowsBeforeReject, 'rejection inserts no row');
    assert.match(String(rejected.message), /^RECONCILE_JOB_FORBIDDEN$/);
  } finally { x.dong(); }
});

test('metadata sequence is monotonic across terminal rows, restart, and rollback', function () {
  var now = 540, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000060');
    var first = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:1', 1, 100), now);
    }, {immediate: true});
    x.kho.db.prepare("UPDATE event_jobs SET state='COMPLETED' WHERE id=?").run(first.id);
    x.kho.db.prepare('DELETE FROM event_jobs WHERE id=?').run(first.id);
    var second = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:2', 2, 100), now);
    }, {immediate: true});
    assert.ok(Number(second.sequence) > Number(first.sequence));
    var persisted = x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, job('account-advance:1:3', 3, 100), now);
        throw new Error('rollback sequence');
      }, {immediate: true});
    }, /rollback sequence/);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, persisted);
    x.kho.dong();
    x.kho = new Kho(x.file);
    x.store = newSchedulerStore(x.kho, {nowMs: function () { return now; }});
    var afterRestart = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:3', 3, 100), now);
    }, {immediate: true});
    assert.ok(Number(afterRestart.sequence) > Number(second.sequence));
  } finally { x.dong(); }
});

test('reconcile keeps one RUNNING continuation and supersedes every live sibling', function () {
  var now = 535, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000062');
    taoDqChoReconcile(x, 1, 0);
    var template = job('private-template-running', 10, 200, {
      aggregateId: '1', expectedRevision: -1,
      payload: {schemaVersion: 1, accountId: 1, reconcile: true, reconcileRevision: 0}
    });
    x.kho.trongGiaoDich(function () {
      var running = x.store.scheduleReconcileAccountAdvance(lease, template, now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RUNNING',locked_by=?,locked_generation=?,locked_until_ms=? WHERE id=?"
      ).run(lease.ownerId, lease.generation, now + 15_000, running.id);
      x.store.scheduleReconcileAccountAdvance(lease, Object.assign({}, template, {
        scheduledAtS: 11,
        payload: Object.assign({}, template.payload, {nextLocalAtS: 11})
      }), now);
      assert.equal(x.store.ensureReconcileAccountAdvance(lease, template, now).id, running.id);
    }, {immediate: true});
    assert.equal(x.kho.db.prepare(
      "SELECT COUNT(*) AS n FROM event_jobs WHERE aggregate_id='1' AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
    ).get().n, 1);
  } finally { x.dong(); }
});

test('load boundary, local wake identity, and command adoption reject stale or future rows', function () {
  var now = 100_000;
  var x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000061');
    taoDqChoReconcile(x, 1, 3);
    var local = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(lease, 1, 3, 99, now);
    }, {immediate: true});
    assert.equal(local.source_account_id, null);
    [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null].forEach(function (accountId) {
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.adoptAccountAdvanceForCommand(lease, accountId, 99, now, 15_000);
        }, {immediate: true});
      }, /ACCOUNT_ADVANCE_ADOPTION_INVALID/);
      assert.equal(x.store.getById(local.id).state, 'PENDING');
    });
    var tooEarly = x.kho.trongGiaoDich(function () {
      return x.store.adoptAccountAdvanceForCommand(lease, 1, 98, now, 15000);
    }, {immediate: true});
    assert.equal(tooEarly, null);
    var running = x.kho.trongGiaoDich(function () {
      return x.store.adoptAccountAdvanceForCommand(lease, 1, 99, now, 15000);
    }, {immediate: true});
    var executable = x.kho.trongGiaoDich(function () {
      return x.store.loadExecutableJob(lease, running, now);
    }, {immediate: true});
    assert.equal(executable.id, running.id);
    x.kho.db.prepare("UPDATE event_jobs SET locked_generation=locked_generation+1 WHERE id=?")
      .run(running.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.loadExecutableJob(lease, running, now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET locked_generation=? WHERE id=?')
      .run(lease.generation, running.id);
    x.kho.db.prepare("UPDATE event_jobs SET locked_by='other' WHERE id=?").run(running.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET locked_by=?,locked_until_ms=? WHERE id=?')
      .run(lease.ownerId, now, running.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=?,state=? WHERE id=?')
      .run(now + 15_000, 'RETRY_WAIT', running.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare("UPDATE event_jobs SET state='RUNNING' WHERE id=?").run(running.id);
    x.kho.db.prepare(
      "UPDATE scheduler_lease SET expires_at_ms=? WHERE lease_name='global-writer'"
    ).run(now);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /LEASE_LOST/);
    x.kho.db.prepare(
      "UPDATE scheduler_lease SET expires_at_ms=? WHERE lease_name='global-writer'"
    ).run(now + 15_000);
  } finally { x.dong(); }
});

test('global dependency blocks account selection across retry quarantine and restart', function () {
  var now = 100_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000064');
    taoDqChoReconcile(x, 1, 3);
    var pair = x.kho.trongGiaoDich(function () {
      var local = x.store.replaceAccountAdvance(lease, 1, 3, 90, now);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(1), true,
        'ordinary PENDING is an actual null-replacement write');
      var global = x.store.schedule(lease, globalJob('ignored', 100), now);
      var adopted = x.store.adoptAccountAdvanceForCommand(lease, 1, 100, now, 15_000);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(1), false,
        'RUNNING continuation is not superseded by null replacement');
      x.store.blockOwnedAccountAdvance(lease, adopted, 3, global.id, now);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(1), false,
        'blocked PENDING triggers replaceAccountAdvance early-return parity');
      return {local: x.store.getById(local.id), global: global};
    }, {immediate: true});
    assert.equal(pair.local.state, 'PENDING');
    assert.equal(pair.local.blocked_by_job_id, pair.global.id);
    var derivedJobs = x.store.listDerivedJobsForAccount(lease, 1, now);
    assert.deepEqual(derivedJobs.map(function (row) { return row.id; }), [pair.global.id]);
    assert.equal(derivedJobs[0].logical_root_id, pair.global.id);
    taoDqChoReconcile(x, 2, 3);
    x.kho.trongGiaoDich(function () {
      var retry = x.store.replaceAccountAdvance(lease, 2, 3, 90, now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?"
      ).run(now + 1_000, retry.id);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(2), true,
        'ordinary unblocked RETRY_WAIT is superseded by null replacement');
      x.store.replaceAccountAdvance(lease, 2, 3, null, now);
      assert.equal(x.store.getById(retry.id).state, 'CANCELLED');
    }, {immediate: true});
    var sequenceBeforeSibling = x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, job('blocked-public-sibling', 91, 100, {
          aggregateId: '1', expectedRevision: 4,
          payload: {schemaVersion: 1, accountId: 1}
        }), now);
      }, {immediate: true});
    }, /ACCOUNT_ADVANCE_DEPENDENCY_BLOCKED/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.scheduleReconcileAccountAdvance(lease, job('unused', 92, 200, {
          aggregateId: '1', expectedRevision: -1,
          payload: {schemaVersion: 1, accountId: 1,
            reconcile: true, reconcileRevision: 3}
        }), now);
      }, {immediate: true});
    }, /ACCOUNT_ADVANCE_DEPENDENCY_BLOCKED/);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, sequenceBeforeSibling, 'rejected siblings allocate no sequence');
    assert.equal(x.store.nextAccountEligibleAtMs(100), null);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, 100, 15_000);
    }, {immediate: true}), null);
    x.kho.dong();
    x.kho = new Kho(x.file);
    x.store = newSchedulerStore(x.kho, {nowMs: function () { return now; }});
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, pair.global.id, now, 15_000, {onlyEligible: true, nowS: 100}
      );
      x.store.fail(lease, claimed, Object.assign(new Error('later'),
        {code: 'ETIMEDOUT'}), now,
      {retryBaseMs: 1, retryMaxMs: 10, maxAttempts: 8});
    }, {immediate: true});
    assert.equal(x.store.getById(pair.local.id).blocked_by_job_id, pair.global.id);
    now = Number(x.store.getById(pair.global.id).retry_at_ms);
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, pair.global.id, now, 15_000, {onlyEligible: true, nowS: 100}
      );
      x.store.fail(lease, claimed, new Error('poison'), now,
        {retryBaseMs: 1, retryMaxMs: 10, maxAttempts: 8});
    }, {immediate: true});
    assert.equal(x.store.getById(pair.global.id).state, 'QUARANTINED');
    assert.equal(x.store.getById(pair.local.id).attempt, 0);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, 100, 15_000);
    }, {immediate: true}), null);
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, pair.global.id, now, 15_000, {allowQuarantined: true}
      );
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 100,
        result: {code: 'OPERATOR_CONFIRMED_INVALID'}
      }, now);
      x.store.finishResolved(
        lease, claimed, 'CANCELLED', 'OPERATOR_CONFIRMED_INVALID', now
      );
    }, {immediate: true});
    assert.equal(x.store.getById(pair.local.id).blocked_by_job_id, null);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, 100, 15_000);
    }, {immediate: true}).id, pair.local.id);
  } finally { x.dong(); }
});

test('dependency integrity rejects a raw live account sibling at startup', function () {
  var now = 101_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000096');
    taoDqChoReconcile(x, 1, 3);
    x.kho.trongGiaoDich(function () {
      var primary = x.store.schedule(lease, job('dependency-primary', 99, 100, {
        aggregateId: '1', expectedRevision: 3,
        payload: {schemaVersion: 1, accountId: 1}
      }), now);
      var sibling = x.store.schedule(lease, job('dependency-corrupt-sibling', 100, 100, {
        aggregateId: '1', expectedRevision: 2,
        payload: {schemaVersion: 1, accountId: 1}
      }), now);
      var parent = x.store.schedule(lease, globalJob('ignored', 101), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='CANCELLED',cancel_reason='SUPERSEDED'," +
        "cancelled_at_ms=? WHERE id=?"
      ).run(now, sibling.id);
      var adopted = x.store.adoptAccountAdvanceForCommand(lease, 1, 101, now, 15_000);
      assert.equal(adopted.id, primary.id);
      x.store.blockOwnedAccountAdvance(lease, adopted, 3, parent.id, now);
      // Simulate persisted corruption that bypassed Store before restart.
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='PENDING',cancel_reason=NULL,cancelled_at_ms=NULL " +
        "WHERE id=?"
      ).run(sibling.id);
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.assertAccountDependencyIntegrity(lease, now);
      }, {immediate: true});
    }, /ACCOUNT_ADVANCE_DEPENDENCY_CORRUPT/);
  } finally { x.dong(); }
});

test('every Store transition conditions on the current owner generation', function () {
  var now = 8000;
  function mutationSnapshot(x) {
    return JSON.stringify([
      x.kho.db.prepare('SELECT * FROM scheduler_lease ORDER BY lease_name').all(),
      x.kho.db.prepare('SELECT * FROM scheduler_meta ORDER BY key').all(),
      x.kho.db.prepare('SELECT * FROM event_jobs ORDER BY sequence,id').all(),
      x.kho.db.prepare('SELECT * FROM event_applications ORDER BY idempotency_key').all(),
      x.kho.db.prepare('SELECT * FROM scheduler_audit ORDER BY id').all()
    ]);
  }
  function withLeaseLossBefore(x, matcher, label, mutation) {
    var db = x.kho.db;
    var originalPrepare = db.prepare;
    var fired = false;
    db.prepare = function (sql) {
      var statement = originalPrepare.call(db, sql);
      var normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (fired || !matcher.test(normalized)) return statement;
      return new Proxy(statement, {
        get: function (target, property) {
          var member = target[property];
          if (property !== 'run' && property !== 'get') {
            return typeof member === 'function' ? member.bind(target) : member;
          }
          return function () {
            fired = true;
            originalPrepare.call(db,
              "UPDATE scheduler_lease SET generation=generation+1 " +
              "WHERE lease_name='global-writer'"
            ).run();
            return member.apply(target, arguments);
          };
        }
      });
    };
    try {
      return mutation();
    } finally {
      db.prepare = originalPrepare;
      assert.equal(fired, true, label + ' reached its target mutation SQL');
    }
  }
  function pendingLocal(x, lease) {
    return x.store.schedule(lease, job('account-advance:1:0', 8, 100), now);
  }
  function runningLocal(x, lease) {
    var saved = pendingLocal(x, lease);
    return x.store.claimForResolution(lease, saved.id, now, 15_000, {nowS: 8});
  }
  function runningGlobal(x, lease, atS) {
    var saved = x.store.schedule(lease, globalJob('lease-fence-global', atS), now);
    return x.store.claimForResolution(lease, saved.id, now, 15_000, {nowS: atS});
  }
  function prove(label, matcher, setup, mutation) {
    var x = taoStoreTam({nowMs: function () { return now; }});
    try {
      var lease = layLease(x, '00000000-0000-4000-8000-000000000062');
      var context = x.kho.trongGiaoDich(function () {
        return setup ? setup(x, lease) : null;
      }, {immediate: true});
      var before = mutationSnapshot(x);
      var caught = null;
      try {
        x.kho.trongGiaoDich(function () {
          return withLeaseLossBefore(x, matcher, label, function () {
            return mutation(x, lease, context);
          });
        }, {immediate: true});
      } catch (error) {
        caught = error;
      }
      assert.equal(mutationSnapshot(x), before, label + ' changes zero target rows');
      assert.match(String(caught && (caught.code || caught.message)), /LEASE_LOST/, label);
    } finally { x.dong(); }
  }
  function validApplication(x, lease, claimed, result) {
    x.store.insertApplication(lease, claimed, {
      effectiveAtS: Number(claimed.scheduled_at_s), result: result
    }, now);
    return claimed;
  }
  var retryPolicy = {retryBaseMs: 1000, retryMaxMs: 300000, maxAttempts: 8};

  // These cases cover every non-lease mutation statement. Reconcile scheduling
  // composes sequence allocation, job insert, and local cancellation;
  // completeAccountAdvanceAndScheduleSuccessor composes completion and replacement;
  // claimGlobalForInvalidation composes explicit claim; resolveDeletedAccountJobs
  // composes deletion cancellation. Acquire/renew/release have dedicated cases above.

  prove('sequence allocation', /^UPDATE scheduler_meta SET value=CAST/, null,
    function (x, lease) { x.store._allocateSequence(lease, now); });
  prove('job insert', /^INSERT INTO event_jobs\(/, null,
    function (x, lease) { x.store.schedule(lease, job('account-advance:1:0', 8, 100), now); });
  prove('effective time metadata', /^INSERT INTO scheduler_meta.*'effective_now_ms'/, null,
    function (x, lease) { x.store.recordEffectiveNowMs(lease, now); });
  prove('claimNext', /^WITH candidate AS .*UPDATE event_jobs SET state='RUNNING'/,
    pendingLocal, function (x, lease) { x.store.claimNext(lease, now, null, 15_000); });
  prove('claimForResolution', /^WITH live_lease AS .*UPDATE event_jobs SET state='RUNNING'/,
    function (x, lease) { return x.store.schedule(lease, globalJob('claim-fence', 8), now); },
    function (x, lease, saved) {
      x.store.claimForResolution(lease, saved.id, now, 15_000, {nowS: 8});
    });
  prove('resumeOwnedRunning', /^UPDATE event_jobs SET locked_until_ms=/, runningLocal,
    function (x, lease, claimed) {
      x.store.resumeOwnedRunning(lease, claimed.id, now, 15_000);
    });
  prove('application insert', /^INSERT INTO event_applications\(/, runningLocal,
    function (x, lease, claimed) {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 8, result: {code: 'ACCOUNT_ADVANCED'}
      }, now);
    });
  prove('partial checkpoint', /^UPDATE event_jobs SET checkpoint_revision=/,
    function (x, lease) {
      taoDqChoReconcile(x, 1, 0);
      return runningLocal(x, lease);
    }, function (x, lease, claimed) { x.store.checkpointPartial(lease, claimed, 0, now); });
  prove('durable mutation metadata', /^INSERT INTO scheduler_meta.*durable_first_mutation/, null,
    function (x, lease) { x.store.markDurableMutation(lease, now); });
  prove('replay source terminalization', /^UPDATE event_jobs SET state='CANCELLED'.*RESOLVED_BY_REPLAY/,
    function (x, lease) {
      var source = x.store.schedule(lease, globalJob('replay-fence', 8), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=? WHERE id=?"
      ).run(now, source.id);
      var child = x.store.schedule(lease, replayJobFrom(source, 'lease-fence'), now);
      var claimed = x.store.claimForResolution(lease, child.id, now, 15_000, {nowS: 8});
      return validApplication(x, lease, claimed, {code: 'REPLAYED'});
    }, function (x, lease, child) { x.store.terminalizeReplaySource(lease, child, now); });
  prove('successful completion', /^UPDATE event_jobs SET state='COMPLETED'/,
    function (x, lease) {
      return validApplication(x, lease, runningLocal(x, lease), {code: 'ACCOUNT_ADVANCED'});
    }, function (x, lease, claimed) { x.store.completeApplied(lease, claimed, now); });
  prove('explicit cancellation', /^UPDATE event_jobs SET state='CANCELLED'.*cancel_reason=\?/,
    function (x, lease) {
      return validApplication(x, lease, runningLocal(x, lease), {code: 'STALE_REVISION'});
    }, function (x, lease, claimed) {
      x.store.finishResolved(lease, claimed, 'CANCELLED', 'STALE_REVISION', now);
    });
  prove('transient failure', /^UPDATE event_jobs SET state='RETRY_WAIT'/, runningLocal,
    function (x, lease, claimed) {
      x.store.fail(lease, claimed, {code: 'SQLITE_BUSY'}, now, retryPolicy);
    });
  prove('quarantine failure', /^UPDATE event_jobs SET state='QUARANTINED'/, runningLocal,
    function (x, lease, claimed) {
      x.store.fail(lease, claimed, new Error('poison'), now, retryPolicy);
    });
  prove('expired-running retry recovery', /^UPDATE event_jobs SET state='RETRY_WAIT'/,
    function (x, lease) {
      var claimed = runningLocal(x, lease);
      x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?').run(now, claimed.id);
      return claimed;
    }, function (x, lease) { x.store.recoverExpiredRunning(lease, now, retryPolicy); });
  prove('expired-running quarantine recovery', /^UPDATE event_jobs SET state='QUARANTINED'/,
    function (x, lease) {
      var claimed = runningLocal(x, lease);
      x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?').run(now, claimed.id);
      return claimed;
    }, function (x, lease) {
      x.store.recoverExpiredRunning(lease, now, {
        retryBaseMs: 1000, retryMaxMs: 300000, maxAttempts: 1
      });
    });
  prove('local cancellation', /^UPDATE event_jobs SET state='CANCELLED',cancel_reason=\?/,
    pendingLocal, function (x, lease) {
      x.store.cancel(lease, 'account-advance:1:0', 'SUPERSEDED', now);
    });
  prove('audit insert', /^INSERT INTO scheduler_audit\(/, null,
    function (x, lease) { x.store.writeAudit(lease, 'CUTOVER', null, 'fence', now); });
  prove('command adoption', /^WITH live_lease AS .*candidate AS .*UPDATE event_jobs/,
    pendingLocal, function (x, lease) {
      x.store.adoptAccountAdvanceForCommand(lease, 1, 8, now, 15_000);
    });
  prove('account replacement cancellation', /^UPDATE event_jobs SET state='CANCELLED'.*SUPERSEDED/,
    pendingLocal, function (x, lease) {
      x.store.replaceAccountAdvance(lease, 1, 0, null, now);
    });
  prove('account dependency block', /^UPDATE event_jobs SET state='PENDING',checkpoint_revision=/,
    function (x, lease) {
      taoDqChoReconcile(x, 1, 0);
      return {local: runningLocal(x, lease), global: x.store.schedule(
        lease, globalJob('block-fence', 8), now
      )};
    }, function (x, lease, rows) {
      x.store.blockOwnedAccountAdvance(lease, rows.local, 0, rows.global.id, now);
    });
  prove('blocked dependency release', /^UPDATE event_jobs SET blocked_by_job_id=NULL/,
    function (x, lease) {
      taoDqChoReconcile(x, 1, 0);
      var terminal = validApplication(
        x, lease, runningGlobal(x, lease, 8), {code: 'MATCH_INVALIDATED'}
      );
      x.store.finishResolved(lease, terminal, 'CANCELLED', 'MATCH_INVALIDATED', now);
      var local = pendingLocal(x, lease);
      x.kho.db.prepare('UPDATE event_jobs SET blocked_by_job_id=? WHERE id=?')
        .run(terminal.id, local.id);
      return terminal;
    }, function (x, lease, terminal) {
      x.store.releaseBlockedAccountDependents(lease, terminal.id, now);
    });
  prove('global barrier park', /^UPDATE event_jobs SET state='PENDING',locked_by=NULL/,
    function (x, lease) {
      var preceding = x.store.schedule(lease, globalJob('preceding-fence', 7), now);
      return {preceding: preceding, running: runningGlobal(x, lease, 8)};
    }, function (x, lease, rows) {
      x.store.parkGlobalBehindPreceding(lease, rows.running, rows.preceding.id, 8, now);
    });
  prove('deleted-account local cancellation',
    /^UPDATE event_jobs SET state='CANCELLED'.*ENTITY_REMOVED/,
    pendingLocal, function (x, lease) {
      x.store.cancelAccountAdvancesForDeletion(lease, 1, now);
    });
});

test('assembled migration and Store lease smoke uses the real current columns', function () {
  var now = 9000, x = taoKhoTam();
  try {
    apDungMigrationScheduler(x.kho, now);
    var store = newSchedulerStore(x.kho, {nowMs: function () { return now; }});
    var token = x.kho.trongGiaoDich(function () {
      return store.acquireLease('00000000-0000-4000-8000-000000000063', now, 15_000);
    }, {immediate: true});
    assert.ok(token);
    assert.equal(x.kho.db.prepare(
      "SELECT heartbeat_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().heartbeat_at_ms, now);
    assert.equal(x.kho.trongGiaoDich(function () {
      return store.renewLease(token, now + 1, 15_000);
    }, {immediate: true}), true);
    assert.equal(x.kho.trongGiaoDich(function () {
      return store.releaseLease(token, now + 2);
    }, {immediate: true}), true);
  } finally { dongKhoTam(x); }
});
// END TASK2_TEST_APPEND

var task3EventsCache;
function task3EventsModule() {
  if (!task3EventsCache) task3EventsCache = require('../server/scheduler/events.js');
  return task3EventsCache;
}

function task3FreshState(nowS) {
  var st = G.moiGame('Task3', 'task3-' + nowS, {g: 1, h: 1, p: 4}, nowS);
  st.accountId = 11;
  st.now = nowS;
  st.lastTick = nowS;
  st.nextRaid = nowS + 1000000;
  st.nextMaint = nowS + 1000000;
  if (st.baoTri) st.baoTri.nextAt = nowS + 1000000;
  st.fleets = [];
  st.toi = [];
  st.tenLua = [];
  st.msgs = [];
  st.nk = [];
  st.debris = {};
  st.npc = {};
  st.ncQueue = null;
  st.fleetIdSeq = 1000;
  st.planets.forEach(function (p) {
    p.qB = [];
    p.qS = [];
    p.res = {metal: 1000000, crystal: 1000000, deut: 1000000, food: 1000000};
    p.ships = {};
    p.def = {};
    p.mis = {};
  });
  return st;
}

function task3SameSecondWorkState(atS, count) {
  var st = task3FreshState(atS - 1);
  var p = st.planets[0];
  p.qB = Array.from({length: count}, function () {
    return {id: 'metalMine', n: 1, tg: 0, xong: atS};
  });
  return st;
}

function task3WithHook(hook, fn) {
  var old = G.HOOK;
  G.HOOK = hook;
  try { return fn(); } finally { G.HOOK = old; }
}

function task3PlayerHook(targetKey, accountId) {
  return {
    oNguoi: function (st, c) {
      if (G.tdKey(c) !== targetKey) return null;
      return {
        loai: 'nguoi',
        key: targetKey,
        c: {g: c.g, h: c.h, p: c.p},
        tk: accountId,
        pi: 0,
        ten: 'Defender',
        htTen: 'Defender Home'
      };
    }
  };
}

function task3Fleet(row) {
  return Object.assign({
    id: 70,
    pi: 0,
    tu: {g: 1, h: 1, p: 4},
    den: {g: 1, h: 2, p: 5},
    mission: 'attack',
    pha: 'di',
    diLuc: 100,
    den_t: 200,
    ve_t: 300,
    ships: {cargoS: 1},
    cargo: {}
  }, row || {});
}

function task3Missile(row) {
  return Object.assign({
    id: 80,
    pi: 0,
    tu: {g: 1, h: 1, p: 4},
    den: {g: 1, h: 3, p: 5},
    n: 3,
    khi: 240
  }, row || {});
}

function task3Incoming(row) {
  return Object.assign({
    id: 90,
    pi: 0,
    tu: {g: 1, h: 9, p: 4},
    den: {g: 1, h: 1, p: 4},
    den_t: 240,
    ships: {cargoS: 1}
  }, row || {});
}

function task3EightClassWorkState(atS) {
  var st = task3FreshState(atS - 1);
  var p = st.planets[0];
  var p2 = JSON.parse(JSON.stringify(p));
  p2.c = {g: p.c.g, h: p.c.h, p: p.c.p + 1};
  p2.qB = [];
  p2.qS = [];
  p2.res = Object.assign({}, p.res);
  p2.ships = {};
  p2.def = {};
  p2.mis = {};
  st.planets[1] = p2;
  st.nextMaint = atS;
  st.baoTri = Object.assign({}, st.baoTri || {}, {nextAt: atS});
  p.qB.push({id: 'metalMine', n: 1, tg: 0, xong: atS});
  p2.qB.push({id: 'crystalMine', n: 1, tg: 0, xong: atS});
  p.qS.push({id: 'cargoS', n: 1, tEach: 0, tLeft: 1});
  p2.qS.push({id: 'cargoS', n: 1, tEach: 0, tLeft: 1});
  st.ncQueue = {
    status: 'active',
    installmentsLeft: 0,
    finishAt: atS,
    planetKey: G.tdKey(p.c),
    id: 'energy',
    lv: 1,
    totalCost: {},
    installmentsTotal: 1,
    conLai: 0
  };
  st.fleets = [
    task3Fleet({id: 201, mission: 'recycle', den_t: atS, den: {g: 1, h: 50, p: 4}}),
    task3Fleet({id: 202, mission: 'deploy', den_t: atS, den: p.c})
  ];
  st.tenLua = [
    task3Missile({id: 301, den: p.c, khi: atS}),
    task3Missile({id: 302, den: {g: 1, h: 50, p: 4}, khi: atS})
  ];
  st.toi = [
    task3Incoming({id: 401, den_t: atS}),
    task3Incoming({id: 402, den_t: atS})
  ];
  st.nextRaid = atS;
  return st;
}

function task3BrowserElement(id) {
  return {
    id: id,
    style: {},
    classList: {toggle: function () {}, remove: function () {}},
    addEventListener: function () {},
    insertAdjacentHTML: function () {},
    click: function () {},
    remove: function () {},
    select: function () {},
    getAttribute: function () { return ''; },
    setAttribute: function () {},
    textContent: '',
    innerHTML: '',
    value: '',
    files: []
  };
}

function task3Document(elements) {
  return {
    hidden: false,
    body: {appendChild: function () {}},
    addEventListener: function (name, fn) { elements['event:' + name] = fn; },
    execCommand: function () { return false; },
    createElement: function (tag) { return task3BrowserElement(tag); },
    querySelector: function (selector) {
      return elements[selector] || (elements[selector] = task3BrowserElement(selector));
    },
    getElementById: function (id) {
      return elements[id] || (elements[id] = task3BrowserElement(id));
    }
  };
}

async function task3WithBrowser(win, fn) {
  var descriptors = {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    setTimeout: win.setTimeout,
    setInterval: win.setInterval,
    fetch: win.fetch,
    navigator: win.navigator || {clipboard: null},
    location: win.location || {reload: function () {}},
    confirm: win.confirm || function () { return true; },
    FileReader: win.FileReader || function () {},
    Blob: win.Blob || function () {},
    URL: win.URL || {
      createObjectURL: function () { return 'blob:task3'; },
      revokeObjectURL: function () {}
    }
  };
  var old = {};
  var installed = [];
  function install(key) {
    old[key] = Object.getOwnPropertyDescriptor(global, key);
    Object.defineProperty(global, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: descriptors[key]
    });
    installed.push(key);
  }
  try {
    Object.keys(descriptors).forEach(install);
    return await fn();
  } finally {
    installed.reverse().forEach(function (key) {
      if (old[key]) Object.defineProperty(global, key, old[key]);
      else delete global[key];
    });
  }
}

function task3RequireBrowserFile(relativePath) {
  var full = path.resolve(__dirname, '..', relativePath);
  var resolved = require.resolve(full);
  delete require.cache[resolved];
  return require(resolved);
}

async function task3FlushUntilSettled(predicate, label) {
  for (var i = 0; i < 12; i += 1) {
    await Promise.resolve();
    if (predicate()) return i + 1;
  }
  throw new Error('task3 deferred chain did not settle: ' + label);
}

function task3TickOutcomePartial(atS) {
  return {
    processed: 50000,
    advancedToS: atS,
    nextDueAtS: atS,
    hasMoreDue: true,
    budgetExhausted: true
  };
}

function task3TickOutcomeComplete(atS) {
  return {
    processed: 1,
    advancedToS: atS,
    nextDueAtS: null,
    hasMoreDue: false,
    budgetExhausted: false
  };
}

function task3LocalBrowserFixture() {
  var sentinel = {deferred: true, code: 'TICK_PARTIAL'};
  var elements = {
    'nhap-js': task3BrowserElement('nhap-js'),
    'kd-batdau': task3BrowserElement('kd-batdau'),
    'file-nhap': task3BrowserElement('file-nhap')
  };
  var timers = [];
  var intervals = [];
  var saves = [];
  var effects = [];
  var counters = {actions: 0, ticks: 0};
  var actionResults = [sentinel, sentinel, null];
  var tickOutcomes = [task3TickOutcomePartial(240), task3TickOutcomeComplete(240)];
  var state = {
    v: 6,
    moHinhCT: 'so-luong-v1',
    moHinhNhip: 'bao-tri-dan-su-v1',
    moHinhQuyDao: 'giu-quy-dao-v1',
    ten: 'Task3',
    planets: [{}],
    fleets: [],
    toi: [],
    tenLua: [],
    npc: {},
    debris: {},
    msgs: [],
    nk: [],
    stats: {},
    fleetIdSeq: 1
  };
  var win = {
    document: task3Document(elements),
    localStorage: {
      getItem: function () { return null; },
      setItem: function (key, value) {
        effects.push('save');
        saves.push([key, value]);
      },
      removeItem: function () {}
    },
    setTimeout: function (fn) {
      effects.push('timer');
      timers.push(fn);
      return timers.length;
    },
    setInterval: function (fn) { intervals.push(fn); return intervals.length; },
    addEventListener: function () {},
    THDC_ARTIFACT: true,
    G: {
      STATE_VERSION: 6,
      PHIEN_BAN_LICH_SU: 'task3',
      BOI_CANH: 'task3',
      TICK_PARTIAL: sentinel,
      laTickPartial: function (value) {
        return !!value && value.deferred === true && value.code === 'TICK_PARTIAL';
      },
      tickOutcomeNeedsDeferral: function (value) {
        return !!value && (value.budgetExhausted === true || !!value.blockedExternal);
      },
      giay: function () { return 240; },
      so: String,
      diem: function () { return {tong: 0}; },
      nangCapState: function () {},
      moiGame: function () { return JSON.parse(JSON.stringify(state)); },
      chay: function () {
        counters.actions += 1;
        return actionResults.length ? actionResults.shift() : null;
      },
      tick: function () {
        counters.ticks += 1;
        return tickOutcomes.length ? tickOutcomes.shift() : task3TickOutcomeComplete(240);
      }
    },
    U: {
      toast: function () {},
      esc: String,
      ve: function () {},
      live: function () {},
      hop: function () {},
      dongHop: function () {}
    },
    APP: {
      ACT: {},
      themACT: function (actions) { Object.assign(this.ACT, actions); },
      batDauNhip: function () {}
    }
  };
  win.window = win;
  return {win: win, elements: elements, timers: timers,
    intervals: intervals, saves: saves, effects: effects, counters: counters, state: state,
    actionResults: actionResults, tickOutcomes: tickOutcomes};
}

function task3KhoForState(accountId, state) {
  return {
    db: {
      prepare: function (sql) {
        assert.equal(sql, 'SELECT state FROM dq WHERE tk=?');
        return {
          get: function (tk) {
            return Number(tk) === Number(accountId) ?
              {state: JSON.stringify(state)} : undefined;
          }
        };
      }
    }
  };
}

test('task3 exposes a frozen TICK_PARTIAL sentinel and validates TickOutcome shape',
  function () {
    assert.deepEqual(G.TICK_PARTIAL, {deferred: true, code: 'TICK_PARTIAL'},
      'task3 frozen sentinel must expose the full local field contract');
    assert.equal(Object.isFrozen(G.TICK_PARTIAL), true,
      'task3 frozen sentinel must be immutable');
    assert.equal(G.laTickPartial({deferred: true, code: 'TICK_PARTIAL'}), true,
      'task3 full sentinel comparison must accept the exact contract');
    assert.equal(G.laTickPartial({deferred: false, code: 'TICK_PARTIAL'}), false);
    assert.equal(G.laTickPartial({code: 'TICK_PARTIAL'}), false);
    assert.equal(G.tickOutcomeNeedsDeferral(task3TickOutcomePartial(100)), true);
    assert.equal(G.tickOutcomeNeedsDeferral(task3TickOutcomeComplete(100)), false);
    assert.equal(G.tickOutcomeNeedsDeferral({
      processed: 0,
      advancedToS: 100,
      nextDueAtS: 100,
      hasMoreDue: true,
      budgetExhausted: false,
      blockedExternal: {code: 'BLOCKED_EXTERNAL', atS: 100, ref: {kind: 'fleet'}}
    }), true);

    var st = task3FreshState(100);
    var outcome = G.tick(st, 100, {remainingBudget: {value: 1}});
    assert.deepEqual(Object.keys(outcome || {}).sort(), [
      'advancedToS',
      'budgetExhausted',
      'hasMoreDue',
      'nextDueAtS',
      'processed'
    ], 'task3 tick must return an exact TickOutcome object');
    assert.equal(outcome.processed, 0);
    assert.equal(outcome.advancedToS, 100);
    assert.equal(outcome.nextDueAtS, null);
    assert.equal(outcome.hasMoreDue, false);
    assert.equal(outcome.budgetExhausted, false);
    assert.equal(typeof G.sukienKe(task3FreshState(100)), 'number',
      'task3 G.sukienKe must remain numeric for legacy callers');

    var oldLightMode = G.MO_PHONG_NHE;
    try {
      G.MO_PHONG_NHE = true;
      var lightState = task3FreshState(100);
      lightState.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: 101});
      var lightOutcome = G.tick(lightState, 101, {remainingBudget: {value: 1}});
      assert.deepEqual(Object.keys(lightOutcome || {}).sort(), [
        'advancedToS',
        'budgetExhausted',
        'hasMoreDue',
        'nextDueAtS',
        'processed'
      ], 'task3 G.MO_PHONG_NHE must return a TickOutcome bridge object');
      assert.equal(lightOutcome.processed, 0,
        'task3 G.MO_PHONG_NHE TickOutcome must remain zero-effect');
      assert.equal(G.tickOutcomeNeedsDeferral(lightOutcome), false,
        'task3 G.MO_PHONG_NHE TickOutcome must obey the deferral bridge');
    } finally {
      G.MO_PHONG_NHE = oldLightMode;
    }
  });

test('G.tick stops exactly at the 50000 budget and leaves event 50001 pending',
  function () {
    var st = task3SameSecondWorkState(101, 50001);
    var p = st.planets[0];
    var budget = {value: 50000};
    var outcome = G.tick(st, 101, {remainingBudget: budget});
    assert.equal(outcome && outcome.processed, 50000,
      'task3 budget must process exactly 50000 primitives');
    assert.equal(budget.value, 0,
      'task3 shared budget must be exhausted at the exact cap');
    assert.equal(outcome && outcome.advancedToS, 101,
      'task3 budget cap must not skip the due second');
    assert.equal(outcome && outcome.nextDueAtS, 101,
      'task3 budget cap must leave event 50001 discoverable');
    assert.equal(outcome && outcome.hasMoreDue, true,
      'task3 budget cap must report more due work');
    assert.equal(outcome && outcome.budgetExhausted, true,
      'task3 budget cap must report budget exhaustion');
    assert.equal(p.b.metalMine, 50000);
    assert.equal(p.qB.length, 1);
    assert.equal(G.phanLoaiSuKienKe(st).atS, 101);

    var finalBudget = {value: 1};
    var finalOutcome = G.tick(st, 101, {remainingBudget: finalBudget});
    assert.equal(finalOutcome.processed, 1);
    assert.equal(finalOutcome.budgetExhausted, false);
    assert.equal(finalOutcome.hasMoreDue, false);
    assert.equal(finalOutcome.nextDueAtS, null);
    assert.equal(p.b.metalMine, 50001);
    assert.equal(p.qB.length, 0);

    var solo = task3SameSecondWorkState(102, 50001);
    var soloPlanet = solo.planets[0];
    var soloOutcome = G.tick(solo, 110);
    assert.equal(soloOutcome && soloOutcome.processed, 50000,
      'task3 implicit two-arg budget must process exactly 50000 primitives');
    assert.equal(soloOutcome && soloOutcome.advancedToS, 102,
      'task3 implicit two-arg budget must stop at the due second, not later target');
    assert.equal(soloOutcome && soloOutcome.nextDueAtS, 102,
      'task3 implicit two-arg budget must leave event 50001 discoverable');
    assert.equal(soloOutcome && soloOutcome.hasMoreDue, true);
    assert.equal(soloOutcome && soloOutcome.budgetExhausted, true);
    assert.equal(solo.lastTick, 102);
    assert.equal(solo.now, 102);
    assert.equal(soloPlanet.b.metalMine, 50000);
    assert.equal(soloPlanet.qB.length, 1);
    var resumedSolo = G.tick(solo, 110);
    assert.equal(resumedSolo.processed, 1);
    assert.equal(resumedSolo.budgetExhausted, false);
    assert.equal(resumedSolo.nextDueAtS, null);
    assert.equal(solo.lastTick, 110);
    assert.equal(solo.now, 110);
    assert.equal(soloPlanet.b.metalMine, 50001);
    assert.equal(soloPlanet.qB.length, 0);
  });

test('two-argument solo tick continues same-second work without skipping it',
  function () {
    var st = task3FreshState(110);
    var p = st.planets[0];
    p.qB.push({id: 'metalMine', n: 1, tg: 1, xong: 111});
    p.qS.push({id: 'cargoS', n: 1, tEach: 1, tLeft: 1});
    var outcome = G.tick(st, 111);
    assert.equal(outcome && outcome.budgetExhausted, false,
      'task3 two-argument solo tick must return a nonpartial TickOutcome');
    assert.equal(outcome.hasMoreDue, false);
    assert.equal(outcome.nextDueAtS, null);
    assert.equal(st.lastTick, 111);
    assert.equal(st.now, 111);
    assert.equal(p.b.metalMine, 1);
    assert.equal(p.qS.length, 0);
    assert.equal(p.ships.cargoS, 1);

    var batched = task3FreshState(100);
    var batchedPlanet = batched.planets[0];
    batchedPlanet.qS.push({id: 'cargoS', n: 3, tEach: 10, tLeft: 10});
    var batchedDue = G.phanLoaiSuKienKe(batched);
    assert.equal(batchedDue.code, 'LOCAL_EVENT',
      'task3 multi-unit shipyard row must remain a local primitive');
    assert.equal(batchedDue.atS, 130,
      'task3 multi-unit shipyard row must be due after the full row, not the first unit');
    var beforeBatched = G.tick(batched, 129);
    assert.equal(beforeBatched.processed, 0,
      'task3 multi-unit shipyard row must not process before the full row due second');
    assert.equal(batchedPlanet.qS.length, 1,
      'task3 multi-unit shipyard row must remain queued before the full row due second');
    assert.equal(batchedPlanet.ships.cargoS || 0, 0,
      'task3 multi-unit shipyard row must not credit partial units before the full row due second');
    var atBatched = G.tick(batched, 130);
    assert.equal(atBatched.processed, 1,
      'task3 multi-unit shipyard row must consume one budget unit at the full row due second');
    assert.equal(batchedPlanet.qS.length, 0,
      'task3 multi-unit shipyard row must be removed at the full row due second');
    assert.equal(batchedPlanet.ships.cargoS, 3,
      'task3 multi-unit shipyard row must credit the entire row at the full row due second');

    var ordered = task3EightClassWorkState(150);
    var observed = [];
    var options = {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: []
    };
    for (var step = 0; step < 12; step += 1) {
      var candidate = G.phanLoaiSuKienKe(ordered, 11, {
        multiplayer: true,
        targetAccountForKey: function () { return null; }
      });
      observed.push(candidate.code + ':' + candidate.atS + ':' +
        candidate.order + ':' + candidate.tie);
      var one = G.tickNoiBo(ordered, 150, options);
      assert.equal(one.processed, 1,
        'task3 same-second ordering step must process exactly one primitive ' + step);
      options.remainingBudget.value = 1;
    }
    assert.deepEqual(observed, [
      'LOCAL_EVENT:150:1:maintenance',
      'LOCAL_EVENT:150:2:building:0',
      'LOCAL_EVENT:150:2:building:1',
      'LOCAL_EVENT:150:3:shipyard:0',
      'LOCAL_EVENT:150:3:shipyard:1',
      'LOCAL_EVENT:150:4:research',
      'LOCAL_EVENT:150:5:fleet:1',
      'LOCAL_EVENT:150:5:fleet:0',
      'LOCAL_EVENT:150:6:missile:1',
      'LOCAL_EVENT:150:6:missile:0',
      'LOCAL_EVENT:150:7:incoming:1',
      'LOCAL_EVENT:150:7:incoming:0'
    ], 'task3 same-second ordering must cover eight classes, ascending planet ties, and descending ref indices');
    assert.equal(ordered.tech.energy, 1,
      'task3 same-second ordering must execute a canonical research completion');
    var raid = G.phanLoaiSuKienKe(ordered, 11, {
      multiplayer: true,
      targetAccountForKey: function () { return null; }
    });
    assert.equal(raid.code + ':' + raid.atS + ':' + raid.order + ':' + raid.tie,
      'LOCAL_EVENT:150:8:raid',
      'task3 same-second ordering must leave raid last after incoming fleets');
    var beforeRaid = JSON.stringify(ordered);
    var raidOutcome = G.tickNoiBo(ordered, 150, options);
    assert.equal(raidOutcome.processed, 1,
      'task3 same-second ordering must execute the raid primitive last');
    assert.notEqual(JSON.stringify(ordered), beforeRaid,
      'task3 same-second ordering raid execution must mutate state');
  });

test('G.tick rejects invalid shared remainingBudget before mutation', function () {
  function populatedState() {
    var st = task3FreshState(120);
    st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: 121});
    return st;
  }
  var oldUpgrade = G.nangCapState;
  var upgradeCalls = 0;
  G.nangCapState = function () {
    upgradeCalls += 1;
    return oldUpgrade.apply(this, arguments);
  };
  try {
    [
    ['null', null],
    ['array', []],
    ['empty object', {}],
    ['missing value', {value: undefined}],
    ['null value', {value: null}],
    ['zero shared budget', {value: 0}],
    ['negative budget', {value: -1}],
    ['fractional budget', {value: 1.5}],
    ['over cap budget', {value: 50001}],
    ['NaN budget', {value: NaN}],
    ['unsafe budget', {value: Number.MAX_SAFE_INTEGER + 1}],
    ['infinite budget', {value: Infinity}],
    ['string budget', {value: '1'}],
    ['boolean budget', {value: false}],
    ['extra-key budget', {value: 1, extra: true}]
  ].forEach(function (entry) {
    var st = populatedState();
    var before = JSON.stringify(st);
    assert.throws(function () {
      G.tick(st, 121, {remainingBudget: entry[1]});
    }, /TICK_BUDGET_INVALID/, 'task3 invalid budget case ' + entry[0]);
    assert.equal(JSON.stringify(st), before,
      'task3 invalid budget case ' + entry[0] + ' mutated state');
  });
    [
    ['undefined target', undefined],
    ['null target', null],
    ['object target', {}],
    ['array target', []],
    ['NaN target', NaN],
    ['negative target', -1],
    ['fractional target', 1.5],
    ['unsafe target', Number.MAX_SAFE_INTEGER + 1],
    ['infinite target', Infinity],
    ['negative infinite target', -Infinity],
    ['string target', '121'],
    ['false target', false],
    ['true target', true]
  ].forEach(function (entry) {
    var st = populatedState();
    var before = JSON.stringify(st);
    assert.throws(function () {
      G.tick(st, entry[1], {remainingBudget: {value: 1}});
    }, /TICK_TARGET_INVALID/, 'task3 invalid target case ' + entry[0]);
    assert.equal(JSON.stringify(st), before,
      'task3 invalid target case ' + entry[0] + ' mutated state');
  });
    var nullProtoOptions = Object.create(null);
    nullProtoOptions.remainingBudget = {value: 1};
    [
    ['null options', null],
    ['array options', []],
    ['function options', function () {}],
    ['string options', 'options'],
    ['date options', new Date(0)],
    ['custom prototype options', Object.create({inherited: true})],
    ['null prototype options', nullProtoOptions],
    ['bad owner account', {remainingBudget: {value: 1}, ownerAccountId: 0}],
    ['fractional owner account', {remainingBudget: {value: 1}, ownerAccountId: 11.5}],
    ['string owner account', {remainingBudget: {value: 1}, ownerAccountId: '11'}],
    ['unsafe owner account', {remainingBudget: {value: 1}, ownerAccountId: Number.MAX_SAFE_INTEGER + 1}],
    ['bad target callback', {remainingBudget: {value: 1}, targetAccountForKey: 'no'}],
    ['bad multiplayer flag', {remainingBudget: {value: 1}, multiplayer: 'yes'}],
    ['bad durable fences', {remainingBudget: {value: 1}, durableFences: {}}],
    ['malformed durable fence entry', {remainingBudget: {value: 1}, durableFences: [{}]}],
    ['durable fence extra key', {remainingBudget: {value: 1}, durableFences: [{
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 1,
      launchAtS: 120,
      targetKey: '1:2:5',
      arrivalAtS: 121,
      mission: 'attack',
      extra: true
    }]}],
    ['extra option key', {remainingBudget: {value: 1}, unexpected: true}]
  ].forEach(function (entry) {
    var st = populatedState();
    var before = JSON.stringify(st);
    assert.throws(function () {
      G.tick(st, 121, entry[1]);
    }, /TICK_OPTIONS_INVALID|TICK_BUDGET_INVALID/,
      'task3 invalid options case ' + entry[0]);
    assert.equal(JSON.stringify(st), before,
      'task3 invalid options case ' + entry[0] + ' mutated state');
  });
    assert.equal(upgradeCalls, 0,
      'task3 invalid G.tick inputs must not call G.nangCapState before validation');
  } finally {
    G.nangCapState = oldUpgrade;
  }
});

test('G.tickNoiBo accepts zero local continuation without returning sentinel',
  function () {
    assert.equal(typeof G.tickNoiBo, 'function',
      'task3 tickNoiBo function must exist');
    var quiet = task3FreshState(124);
    var quietOutcome = G.tickNoiBo(quiet, 125, {
      remainingBudget: {value: 0},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: []
    });
    assert.deepEqual(quietOutcome, {
      processed: 0,
      advancedToS: 125,
      nextDueAtS: null,
      hasMoreDue: false,
      budgetExhausted: false
    });
    assert.equal(G.laTickPartial(quietOutcome), false);
    assert.notDeepEqual(quietOutcome, G.TICK_PARTIAL);

    var due = task3FreshState(124);
    due.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: 125});
    var dueOutcome = G.tickNoiBo(due, 125, {
      remainingBudget: {value: 0},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: []
    });
    assert.deepEqual(dueOutcome, {
      processed: 0,
      advancedToS: 124,
      nextDueAtS: 125,
      hasMoreDue: true,
      budgetExhausted: true
    });
    assert.equal(G.laTickPartial(dueOutcome), false);
    assert.notDeepEqual(dueOutcome, G.TICK_PARTIAL);

    [
      ['maintenance', function (s, atS) {
        s.nextMaint = atS;
        s.baoTri = Object.assign({}, s.baoTri || {}, {nextAt: atS});
      }],
      ['building', function (s, atS) {
        s.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: atS});
      }],
      ['shipyard', function (s) {
        s.planets[0].qS.push({id: 'cargoS', n: 1, tEach: 0, tLeft: 1});
      }],
      ['research', function (s, atS) {
        s.ncQueue = {
          status: 'active',
          installmentsLeft: 0,
          finishAt: atS,
          planetKey: G.tdKey(s.planets[0].c),
          id: 'energy',
          lv: 1,
          totalCost: {},
          installmentsTotal: 1,
          conLai: 0
        };
      }],
      ['fleet', function (s, atS) {
        s.fleets.push(task3Fleet({id: 501, mission: 'deploy', den: s.planets[0].c, den_t: atS}));
      }],
      ['missile', function (s, atS) {
        s.tenLua.push(task3Missile({id: 502, den: s.planets[0].c, khi: atS}));
      }],
      ['incoming', function (s, atS) {
        s.toi.push(task3Incoming({id: 503, den_t: atS}));
      }],
      ['raid', function (s, atS) { s.nextRaid = atS; }]
    ].forEach(function (entry) {
      var zeroCase = task3FreshState(127);
      entry[1](zeroCase, 128);
      var beforeZero = JSON.stringify(zeroCase);
      var zeroOutcome = G.tickNoiBo(zeroCase, 128, {
        remainingBudget: {value: 0},
        ownerAccountId: 11,
        targetAccountForKey: function () { return null; },
        durableFences: []
      });
      assert.equal(zeroOutcome.processed, 0,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' processed work');
      assert.equal(zeroOutcome.nextDueAtS, 128,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' lost due second');
      assert.equal(zeroOutcome.hasMoreDue, true,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' must report due work');
      assert.equal(zeroOutcome.budgetExhausted, true);
      assert.equal(JSON.stringify(zeroCase), beforeZero,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' mutated state');
    });

    var target = {g: 1, h: 5, p: 5};
    var targetKey = G.tdKey(target);
    var external = task3FreshState(130);
    var externalFleet = task3Fleet({
      id: 91,
      den: target,
      mission: 'attack',
      diLuc: 130,
      den_t: 140
    });
    var externalRef = {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 91,
      launchAtS: 130,
      targetKey: targetKey,
      arrivalAtS: 140,
      mission: 'attack'
    };
    external.fleets.push(externalFleet);
    external.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: 135});
    var beforeExternalFleets = JSON.stringify(external.fleets);
    var ownerFor = function (key) { return key === targetKey ? 22 : null; };
    assert.deepEqual(G.phanLoaiTatCaSuKienNgoai(external, 11, ownerFor),
      [externalRef],
      'task3 tickNoiBo fixture must expose exactly one external ref');
    var mixedOutcome = G.tickNoiBo(external, 140, {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: ownerFor,
      durableFences: []
    });
    assert.equal(mixedOutcome.processed, 1,
      'task3 tickNoiBo must process due local work before excluding external refs');
    assert.equal(external.planets[0].b.metalMine, 1);
    assert.equal(JSON.stringify(external.fleets), beforeExternalFleets,
      'task3 tickNoiBo mixed local/external case must leave external fleet unmutated');
    var externalOutcome = G.tickNoiBo(external, 140, {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: ownerFor,
      durableFences: []
    });
    assert.equal(externalOutcome.blockedExternal, undefined,
      'task3 tickNoiBo must not return blockedExternal');
    assert.equal(JSON.stringify(external.fleets), beforeExternalFleets,
      'task3 tickNoiBo must not mutate external ref primitives');

    var fenced = task3FreshState(130);
    fenced.fleets.push(task3Fleet({
      id: 92,
      den: target,
      mission: 'attack',
      diLuc: 130,
      den_t: 140
    }));
    var fenceRef = Object.assign({}, externalRef, {fleetId: 92});
    var beforeFenceFleets = JSON.stringify(fenced.fleets);
    var fencedOutcome = G.tickNoiBo(fenced, 140, {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: [fenceRef]
    });
    assert.equal(fencedOutcome.blockedExternal, undefined,
      'task3 tickNoiBo must not convert durable fences into blockedExternal');
    assert.equal(JSON.stringify(fenced.fleets), beforeFenceFleets,
      'task3 tickNoiBo must not mutate supplied durable fence refs');

    function tickNoiBoPopulatedState() {
      var st = task3FreshState(126);
      st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: 127});
      return st;
    }
    [
      ['null', null],
      ['array', []],
      ['empty object', {}],
      ['missing value', {value: undefined}],
      ['null value', {value: null}],
      ['negative budget', {value: -1}],
      ['fractional budget', {value: 1.5}],
      ['over cap budget', {value: 50001}],
      ['NaN budget', {value: NaN}],
      ['unsafe budget', {value: Number.MAX_SAFE_INTEGER + 1}],
      ['infinite budget', {value: Infinity}],
      ['string budget', {value: '1'}],
      ['boolean budget', {value: false}],
      ['extra-key budget', {value: 1, extra: true}]
    ].forEach(function (entry) {
      var st = tickNoiBoPopulatedState();
      var before = JSON.stringify(st);
      assert.throws(function () {
        G.tickNoiBo(st, 127, {
          remainingBudget: entry[1],
          ownerAccountId: 11,
          targetAccountForKey: function () { return null; },
          durableFences: []
        });
      }, /TICK_BUDGET_INVALID/,
      'task3 tickNoiBo invalid budget case ' + entry[0]);
      assert.equal(JSON.stringify(st), before,
        'task3 tickNoiBo invalid budget case ' + entry[0] + ' mutated state');
    });
    [
      ['undefined target', undefined],
      ['null target', null],
      ['object target', {}],
      ['array target', []],
      ['NaN target', NaN],
      ['negative target', -1],
      ['fractional target', 1.5],
      ['unsafe target', Number.MAX_SAFE_INTEGER + 1],
      ['infinite target', Infinity],
      ['negative infinite target', -Infinity],
      ['string target', '127'],
      ['false target', false],
      ['true target', true]
    ].forEach(function (entry) {
      var st = tickNoiBoPopulatedState();
      var before = JSON.stringify(st);
      assert.throws(function () {
        G.tickNoiBo(st, entry[1], {
          remainingBudget: {value: 1},
          ownerAccountId: 11,
          targetAccountForKey: function () { return null; },
          durableFences: []
        });
      }, /TICK_TARGET_INVALID/,
      'task3 tickNoiBo invalid target case ' + entry[0]);
      assert.equal(JSON.stringify(st), before,
        'task3 tickNoiBo invalid target case ' + entry[0] + ' mutated state');
    });
    var tickNoiBoNullProtoOptions = Object.create(null);
    tickNoiBoNullProtoOptions.remainingBudget = {value: 1};
    [
      ['null options', null],
      ['array options', []],
      ['function options', function () {}],
      ['string options', 'options'],
      ['date options', new Date(0)],
      ['custom prototype options', Object.create({inherited: true})],
      ['null prototype options', tickNoiBoNullProtoOptions],
      ['missing budget', {ownerAccountId: 11, targetAccountForKey: function () { return null; }}],
      ['bad owner account', {remainingBudget: {value: 1}, ownerAccountId: 0}],
      ['fractional owner account', {remainingBudget: {value: 1}, ownerAccountId: 11.5}],
      ['string owner account', {remainingBudget: {value: 1}, ownerAccountId: '11'}],
      ['unsafe owner account', {remainingBudget: {value: 1}, ownerAccountId: Number.MAX_SAFE_INTEGER + 1}],
      ['bad target callback', {remainingBudget: {value: 1}, targetAccountForKey: 'no'}],
      ['bad multiplayer flag', {remainingBudget: {value: 1}, multiplayer: true}],
      ['bad durable fences', {remainingBudget: {value: 1}, durableFences: {}}],
      ['malformed durable fence entry', {remainingBudget: {value: 1}, durableFences: [{}]}],
      ['extra option key', {remainingBudget: {value: 1}, unexpected: true}]
    ].forEach(function (entry) {
      var st = tickNoiBoPopulatedState();
      var before = JSON.stringify(st);
      assert.throws(function () {
        G.tickNoiBo(st, 127, entry[1]);
      }, /TICK_OPTIONS_INVALID|TICK_BUDGET_INVALID/,
      'task3 tickNoiBo invalid options case ' + entry[0]);
      assert.equal(JSON.stringify(st), before,
        'task3 tickNoiBo invalid options case ' + entry[0] + ' mutated state');
    });
  });

test('multiplayer classifier returns a stable fleet ref and blocks without mutation',
  function () {
    var st = task3FreshState(130);
    var target = {g: 1, h: 2, p: 5};
    var targetKey = G.tdKey(target);
    var fleet = task3Fleet({
      id: 71,
      den: target,
      mission: 'attack',
      diLuc: 130,
      den_t: 150
    });
    st.fleets.push(fleet);
    var options = {
      multiplayer: true,
      targetAccountForKey: function (key) { return key === targetKey ? 22 : null; }
    };
    task3WithHook(task3PlayerHook(targetKey, 22), function () {
      assert.equal(typeof G.phanLoaiSuKienKe, 'function',
        'task3 multiplayer classifier function must exist');
      var candidate = G.phanLoaiSuKienKe(st, 11, options);
      assert.equal(candidate.code, 'EXTERNAL_EVENT');
      assert.equal(candidate.atS, 150);
      assert.deepEqual(candidate.ref, {
        kind: 'fleet',
        ownerAccountId: 11,
        fleetId: 71,
        launchAtS: 130,
        targetKey: targetKey,
        arrivalAtS: 150,
        mission: 'attack'
      });
      var before = JSON.stringify(st);
      var outcome = G.tick(st, 150, {
        remainingBudget: {value: 1},
        multiplayer: true,
        ownerAccountId: 11,
        targetAccountForKey: options.targetAccountForKey
      });
      assert.equal(outcome.processed, 0);
      assert.deepEqual(outcome.blockedExternal, {
        code: 'BLOCKED_EXTERNAL',
        atS: 150,
        ref: candidate.ref
      });
      assert.equal(JSON.stringify(st), before);
    });
  });

test('recycle colonize deploy NPC and self targets stay local in multiplayer classification',
  function () {
    var selfSeed = task3FreshState(140);
    var selfTarget = selfSeed.planets[0].c;
    var playerTarget = {g: 1, h: 2, p: 6};
    var playerKey = G.tdKey(playerTarget);
    var localRows = [
      ['recycle', task3Fleet({id: 1, mission: 'recycle', den: playerTarget, den_t: 160})],
      ['colonize', task3Fleet({id: 2, mission: 'colonize', den: playerTarget, den_t: 160})],
      ['deploy', task3Fleet({id: 3, mission: 'deploy', den: playerTarget, den_t: 160})],
      ['self', task3Fleet({id: 4, mission: 'attack', den: selfTarget, den_t: 160})],
      ['empty', task3Fleet({id: 5, mission: 'attack', den: {g: 1, h: 50, p: 4}, den_t: 160})],
      ['npc', task3Fleet({id: 6, mission: 'attack', den: {g: 1, h: 51, p: 4}, den_t: 160})]
    ];
    task3WithHook(task3PlayerHook(playerKey, 22), function () {
      assert.equal(typeof G.phanLoaiSuKienKe, 'function',
        'task3 local multiplayer classifier function must exist');
      localRows.forEach(function (entry) {
        var st = task3FreshState(140);
        var row = entry[1];
        var callbackKeys = [];
        function ownerForCase(key) {
          callbackKeys.push(key);
          if (entry[0] === 'self' && key === G.tdKey(selfTarget)) return 11;
          return key === playerKey ? 22 : null;
        }
        st.npc[G.tdKey({g: 1, h: 51, p: 4})] = {key: 'npc', c: {g: 1, h: 51, p: 4}};
        st.fleets = [row];
        var before = JSON.stringify(st);
        var candidate = G.phanLoaiSuKienKe(st, 11, {
          multiplayer: true,
          targetAccountForKey: ownerForCase
        });
        assert.equal(candidate && candidate.code, 'LOCAL_EVENT',
          'task3 local multiplayer classifier case ' + entry[0] + ' must stay local');
        assert.equal(candidate && candidate.atS, 160,
          'task3 local multiplayer classifier case ' + entry[0] + ' must keep due second');
        if (entry[0] === 'self') {
          assert.deepEqual(callbackKeys, [G.tdKey(selfTarget)],
            'task3 self local classifier must exercise the equal-owner callback branch');
        }
        var outcome = G.tick(st, 160, {
          remainingBudget: {value: 1},
          multiplayer: true,
          ownerAccountId: 11,
          targetAccountForKey: ownerForCase
        });
        assert.equal(outcome.processed, 1,
          'task3 local multiplayer classifier case ' + entry[0] + ' must process locally');
        assert.notEqual(JSON.stringify(st), before,
          'task3 local multiplayer classifier case ' + entry[0] + ' must mutate locally');
      });
    });
  });

test('missile classification preserves explicit and legacy launch times',
  function () {
    var st = task3FreshState(170);
    var target = {g: 1, h: 4, p: 5};
    var targetKey = G.tdKey(target);
    st.tenLua = [task3Missile({id: 81, den: target, diLuc: 171, khi: 222})];
    task3WithHook(task3PlayerHook(targetKey, 22), function () {
      assert.equal(typeof G.phanLoaiSuKienKe, 'function',
        'task3 missile classifier function must exist');
      var explicit = G.phanLoaiSuKienKe(st, 11, {
        multiplayer: true,
        targetAccountForKey: function () { return 22; }
      });
      assert.equal(explicit.code, 'EXTERNAL_EVENT');
      assert.deepEqual(explicit.ref, {
        kind: 'missile',
        ownerAccountId: 11,
        missileId: 81,
        launchAtS: 171,
        targetKey: targetKey,
        arrivalAtS: 222,
        mission: 'missile'
      });
      st.tenLua = [task3Missile({id: 82, den: target, khi: 260})];
      var legacy = G.phanLoaiSuKienKe(st, 11, {
        multiplayer: true,
        targetAccountForKey: function () { return 22; }
      });
      assert.equal(legacy.ref.launchAtS, 260 - G.tgTenLua(3));
    });
    var launched = task3FreshState(180);
    var launchTarget = {g: 1, h: 2, p: 5};
    launched.tech.impulse = 1;
    launched.planets[0].mis.icbm = 2;
    launched.fleetIdSeq = 900;
    task3WithHook({kiemTraGui: function () { return null; }}, function () {
      assert.equal(G.HANHDONG.banTenLua(launched, {
        pi: 0,
        den: launchTarget,
        n: 1
      }), null, 'task3 actual G.banTenLua action must launch through production action');
    });
    assert.equal(launched.tenLua.length, 1);
    assert.equal(launched.tenLua[0].diLuc, 180,
      'task3 actual G.banTenLua action must capture diLuc at launch');
    assert.equal(launched.tenLua[0].khi, 180 + G.tgTenLua(1));
  });

test('server events derive canonical PVP external and missile jobs from live refs',
  function () {
    var events = task3EventsModule();
    var store = task2StoreModule();
    function task3StableJson(value) {
      if (Array.isArray(value)) return '[' + value.map(task3StableJson).join(',') + ']';
      if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(function (key) {
          return JSON.stringify(key) + ':' + task3StableJson(value[key]);
        }).join(',') + '}';
      }
      return JSON.stringify(value);
    }
    function task3IndependentPvpHash(ref, defenderAccountId) {
      return require('node:crypto').createHash('sha256').update(task3StableJson({
        arrivalAtS: ref.arrivalAtS,
        defenderAccountId: defenderAccountId,
        fleetId: ref.fleetId,
        launchAtS: ref.launchAtS,
        ownerAccountId: ref.ownerAccountId,
        rule: 'pvp-v1',
        targetKey: ref.targetKey
      })).digest('hex');
    }
    var attackRef = {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 71,
      launchAtS: 130,
      targetKey: '1:2:5',
      arrivalAtS: 150,
      mission: 'attack'
    };
    var matchId = events.derivePvpMatchId(attackRef, 22);
    assert.equal(matchId, '31fa1b6a5d6ecf7c882dbf36bd35b2cf0508252196ac6de8a9da629e4baba072');
    assert.equal(matchId, task3IndependentPvpHash(attackRef, 22),
      'task3 derivePvpMatchId must match independently computed canonical hash');
    assert.equal(events.derivePvpMatchId(Object.assign({}, attackRef, {fleetId: 72}), 22),
      task3IndependentPvpHash(Object.assign({}, attackRef, {fleetId: 72}), 22));
    assert.equal(events.derivePvpMatchId(attackRef, 23),
      task3IndependentPvpHash(attackRef, 23));
    assert.notEqual(events.derivePvpMatchId(attackRef, 23), matchId);
    function ownerFor(targetKey) { return targetKey === '1:2:5' ? 22 : null; }
    function withoutKey(base, key) {
      var copy = Object.assign({}, base);
      delete copy[key];
      return copy;
    }
    [
      ['owner', Object.assign({}, attackRef, {ownerAccountId: 12}), 22],
      ['launch', Object.assign({}, attackRef, {launchAtS: 131}), 22],
      ['target', Object.assign({}, attackRef, {targetKey: '1:2:6'}), 22],
      ['arrival', Object.assign({}, attackRef, {arrivalAtS: 151}), 22],
      ['fleet', Object.assign({}, attackRef, {fleetId: 72}), 22],
      ['defender', attackRef, 23]
    ].forEach(function (entry) {
      var changedHash = events.derivePvpMatchId(entry[1], entry[2]);
      assert.equal(changedHash, task3IndependentPvpHash(entry[1], entry[2]),
        'task3 derivePvpMatchId perturb ' + entry[0] + ' must match independent hash');
      assert.notEqual(changedHash, matchId,
        'task3 derivePvpMatchId perturb ' + entry[0] + ' must change the match id');
    });
    [
      ['undefined ref', undefined],
      ['null ref', null],
      ['number ref', 1],
      ['boolean ref', true],
      ['function ref', function () {}],
      ['empty object ref', {}],
      ['scalar ref', 'fleet'],
      ['array ref', []],
      ['missing kind', withoutKey(attackRef, 'kind')],
      ['wrong kind', Object.assign({}, attackRef, {kind: 'missile'})],
      ['extra key', Object.assign({}, attackRef, {extra: true})],
      ['missing owner', withoutKey(attackRef, 'ownerAccountId')],
      ['owner undefined', Object.assign({}, attackRef, {ownerAccountId: undefined})],
      ['owner null', Object.assign({}, attackRef, {ownerAccountId: null})],
      ['owner zero', Object.assign({}, attackRef, {ownerAccountId: 0})],
      ['owner negative', Object.assign({}, attackRef, {ownerAccountId: -1})],
      ['owner fractional', Object.assign({}, attackRef, {ownerAccountId: 11.5})],
      ['owner string', Object.assign({}, attackRef, {ownerAccountId: '11'})],
      ['owner unsafe', Object.assign({}, attackRef, {ownerAccountId: Number.MAX_SAFE_INTEGER + 1})],
      ['malformed owner', Object.assign({}, attackRef, {ownerAccountId: NaN})],
      ['owner infinite', Object.assign({}, attackRef, {ownerAccountId: Infinity})],
      ['owner negative infinite', Object.assign({}, attackRef, {ownerAccountId: -Infinity})],
      ['owner function', Object.assign({}, attackRef, {ownerAccountId: function () {}})],
      ['owner boolean', Object.assign({}, attackRef, {ownerAccountId: false})],
      ['owner object', Object.assign({}, attackRef, {ownerAccountId: {}})],
      ['owner array', Object.assign({}, attackRef, {ownerAccountId: []})],
      ['missing fleet', withoutKey(attackRef, 'fleetId')],
      ['fleet undefined', Object.assign({}, attackRef, {fleetId: undefined})],
      ['fleet null', Object.assign({}, attackRef, {fleetId: null})],
      ['fleet zero', Object.assign({}, attackRef, {fleetId: 0})],
      ['fleet negative', Object.assign({}, attackRef, {fleetId: -71})],
      ['fleet fractional', Object.assign({}, attackRef, {fleetId: 71.5})],
      ['fleet string', Object.assign({}, attackRef, {fleetId: '71'})],
      ['fleet unsafe', Object.assign({}, attackRef, {fleetId: Number.MAX_SAFE_INTEGER + 1})],
      ['fleet NaN', Object.assign({}, attackRef, {fleetId: NaN})],
      ['fleet infinite', Object.assign({}, attackRef, {fleetId: Infinity})],
      ['fleet negative infinite', Object.assign({}, attackRef, {fleetId: -Infinity})],
      ['fleet function', Object.assign({}, attackRef, {fleetId: function () {}})],
      ['fleet boolean', Object.assign({}, attackRef, {fleetId: false})],
      ['fleet object', Object.assign({}, attackRef, {fleetId: {}})],
      ['fleet array', Object.assign({}, attackRef, {fleetId: []})],
      ['missing mission', withoutKey(attackRef, 'mission')],
      ['wrong mission', Object.assign({}, attackRef, {mission: 'transport'})],
      ['mission null', Object.assign({}, attackRef, {mission: null})],
      ['mission number', Object.assign({}, attackRef, {mission: 1})],
      ['mission boolean', Object.assign({}, attackRef, {mission: false})],
      ['mission object', Object.assign({}, attackRef, {mission: {}})],
      ['mission array', Object.assign({}, attackRef, {mission: []})],
      ['mission function', Object.assign({}, attackRef, {mission: function () {}})],
      ['mission empty string', Object.assign({}, attackRef, {mission: ''})],
      ['missing launch', withoutKey(attackRef, 'launchAtS')],
      ['launch undefined', Object.assign({}, attackRef, {launchAtS: undefined})],
      ['launch null', Object.assign({}, attackRef, {launchAtS: null})],
      ['launch string', Object.assign({}, attackRef, {launchAtS: '130'})],
      ['launch negative', Object.assign({}, attackRef, {launchAtS: -1})],
      ['launch fractional', Object.assign({}, attackRef, {launchAtS: 130.5})],
      ['launch NaN', Object.assign({}, attackRef, {launchAtS: NaN})],
      ['launch infinite', Object.assign({}, attackRef, {launchAtS: Infinity})],
      ['launch negative infinite', Object.assign({}, attackRef, {launchAtS: -Infinity})],
      ['launch function', Object.assign({}, attackRef, {launchAtS: function () {}})],
      ['launch boolean', Object.assign({}, attackRef, {launchAtS: false})],
      ['launch object', Object.assign({}, attackRef, {launchAtS: {}})],
      ['launch array', Object.assign({}, attackRef, {launchAtS: []})],
      ['unsafe launch', Object.assign({}, attackRef, {launchAtS: 9007199254741})],
      ['missing arrival', withoutKey(attackRef, 'arrivalAtS')],
      ['arrival undefined', Object.assign({}, attackRef, {arrivalAtS: undefined})],
      ['arrival null', Object.assign({}, attackRef, {arrivalAtS: null})],
      ['arrival string', Object.assign({}, attackRef, {arrivalAtS: '150'})],
      ['arrival negative', Object.assign({}, attackRef, {arrivalAtS: -1})],
      ['arrival fractional', Object.assign({}, attackRef, {arrivalAtS: 150.5})],
      ['arrival NaN', Object.assign({}, attackRef, {arrivalAtS: NaN})],
      ['arrival infinite', Object.assign({}, attackRef, {arrivalAtS: Infinity})],
      ['arrival negative infinite', Object.assign({}, attackRef, {arrivalAtS: -Infinity})],
      ['arrival function', Object.assign({}, attackRef, {arrivalAtS: function () {}})],
      ['arrival boolean', Object.assign({}, attackRef, {arrivalAtS: false})],
      ['arrival object', Object.assign({}, attackRef, {arrivalAtS: {}})],
      ['arrival array', Object.assign({}, attackRef, {arrivalAtS: []})],
      ['unsafe arrival', Object.assign({}, attackRef, {arrivalAtS: 9007199254741})],
      ['launch after arrival', Object.assign({}, attackRef, {launchAtS: 151})],
      ['missing targetKey', withoutKey(attackRef, 'targetKey')],
      ['target null', Object.assign({}, attackRef, {targetKey: null})],
      ['target number', Object.assign({}, attackRef, {targetKey: 125})],
      ['target boolean', Object.assign({}, attackRef, {targetKey: false})],
      ['target object', Object.assign({}, attackRef, {targetKey: {}})],
      ['target array', Object.assign({}, attackRef, {targetKey: []})],
      ['target function', Object.assign({}, attackRef, {targetKey: function () {}})],
      ['malformed target', Object.assign({}, attackRef, {targetKey: '01:2:5'})]
    ].forEach(function (entry) {
      assert.throws(function () {
        events.derivePvpMatchId(entry[1], 22);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
      'task3 derivePvpMatchId malformed ref case ' + entry[0]);
    });
    assert.throws(function () {
      events.derivePvpMatchId({kind: 'fleet', ownerAccountId: 11}, 22);
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
    'task3 derivePvpMatchId strict validator must reject incomplete direct refs');
    [undefined, null, 0, -1, 11, 22.5, '22', NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, false, true, function () {}, {}, []].forEach(function (defender) {
      assert.throws(function () {
        events.derivePvpMatchId(attackRef, defender);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|DEFENDER_ACCOUNT_INVALID/,
      'task3 derivePvpMatchId malformed defender case ' + defender);
    });
    var pvp = events.jobFromRef(attackRef, ownerFor);
    assert.deepEqual(pvp, {
      kind: 'PVP_RESOLVE',
      scheduledAtS: 150,
      priority: 50,
      idempotencyKey: 'pvp-resolve:' + matchId + ':150',
      aggregateType: 'match',
      aggregateId: matchId,
      expectedRevision: null,
      sourceAccountId: 11,
      payload: {schemaVersion: 1, matchId: matchId, ref: attackRef},
      maxAttempts: 8
    });
    assert.deepEqual(store.validateJob(pvp), Object.freeze(Object.assign({}, pvp, {
      payload: Object.freeze(pvp.payload)
    })));

    var transportRef = Object.assign({}, attackRef, {mission: 'transport'});
    var external = events.jobFromRef(transportRef, ownerFor);
    assert.equal(events.externalKey(transportRef),
      'external:fleet:transport:11:71:1:2:5:130:150');
    assert.equal(external.kind, 'EXTERNAL_RESOLVE');
    assert.equal(external.aggregateType, 'fleet');
    assert.equal(external.aggregateId, '71');
    assert.equal(external.expectedRevision, null);
    assert.equal(external.maxAttempts, 8);
    assert.equal(external.idempotencyKey, events.externalKey(transportRef));
    assert.deepEqual(store.validateJob(external).payload.ref, transportRef);
    ['spy', 'hold'].forEach(function (mission) {
      var refForMission = Object.assign({}, attackRef, {mission: mission});
      var jobForMission = events.jobFromRef(refForMission, ownerFor);
      assert.equal(jobForMission.kind, 'EXTERNAL_RESOLVE');
      assert.equal(jobForMission.aggregateType, 'fleet');
      assert.equal(jobForMission.idempotencyKey, events.externalKey(refForMission));
      assert.deepEqual(store.validateJob(jobForMission).payload.ref, refForMission,
        'task3 Task2 validateJob must accept fleet ' + mission + ' job');
    });
    var callbackCalls = 0;
    assert.equal(events.jobFromRef(transportRef, function (targetKey) {
      callbackCalls += 1;
      assert.equal(targetKey, transportRef.targetKey);
      return null;
    }), null);
    assert.equal(callbackCalls, 1,
      'task3 jobFromRef must call targetAccountForKey exactly once for null defender');
    var equalOwnerCalls = 0;
    assert.equal(events.jobFromRef(attackRef, function (targetKey) {
      equalOwnerCalls += 1;
      assert.equal(targetKey, attackRef.targetKey,
        'task3 equal-owner callback must receive the ref target, not infer self coordinate');
      return 11;
    }), null, 'task3 equal-owner defender maps to null independent of self coordinate');
    assert.equal(equalOwnerCalls, 1);
    [
      0, 11, -1, 22.5, '22', Number.MAX_SAFE_INTEGER + 1,
      NaN, Infinity, false, true, {}, []
    ].forEach(function (defender) {
      var calls = 0;
      assert.equal(events.jobFromRef(attackRef, function () {
        calls += 1;
        return defender;
      }), null, 'task3 invalid defender account maps to null ' + defender);
      assert.equal(calls, 1, 'task3 invalid defender callback count ' + defender);
    });
    assert.throws(function () {
      events.jobFromRef(attackRef, null);
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|TARGET_ACCOUNT_FOR_KEY_INVALID/,
    'task3 malformed defender callback shape must reject');
    var ceilingRef = Object.assign({}, transportRef, {
      launchAtS: 9007199254740,
      arrivalAtS: 9007199254740
    });
    assert.equal(events.externalKey(ceilingRef),
      'external:fleet:transport:11:71:1:2:5:9007199254740:9007199254740');
    assert.deepEqual(store.validateJob(events.jobFromRef(ceilingRef, ownerFor)).payload.ref,
      ceilingRef, 'task3 safeSecond ceiling must match Task2 exact maximum');

    var missileRef = {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: 81,
      launchAtS: 171,
      targetKey: '1:4:5',
      arrivalAtS: 222,
      mission: 'missile'
    };
    var missile = events.jobFromRef(missileRef, function (targetKey) {
      return targetKey === '1:4:5' ? 22 : null;
    });
    assert.equal(missile.priority, 51);
    assert.equal(missile.aggregateType, 'missile');
    assert.equal(missile.aggregateId, '81');
    assert.equal(missile.idempotencyKey,
      'external:missile:missile:11:81:1:4:5:171:222');
    assert.deepEqual(store.validateJob(missile).payload.ref, missileRef,
      'task3 Task2 validateJob must accept missile job');

    var liveState = task3FreshState(130);
    var liveFleet = task3Fleet({
      id: 71,
      den: {g: 1, h: 2, p: 5},
      mission: 'attack',
      diLuc: 130,
      den_t: 150
    });
    liveState.fleets.push(liveFleet);
    assert.deepEqual(events.stableFleetRef(11, liveFleet), attackRef,
      'task3 direct stableFleetRef vector must match the durable attack ref');
    assert.equal(events.stableFleetRef(Number.MAX_SAFE_INTEGER, liveFleet).ownerAccountId,
      Number.MAX_SAFE_INTEGER,
      'task3 direct stableFleetRef must accept ownerAccountId safe-integer boundary');
    [undefined, null, 0, -1, 11.5, '11', NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, false, true, function () {}, {}, []].forEach(function (ownerAccountId) {
      assert.throws(function () {
        events.stableFleetRef(ownerAccountId, liveFleet);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|OWNER_ACCOUNT_INVALID/,
      'task3 direct stableFleetRef malformed ownerAccountId case ' + ownerAccountId);
    });
    var boundaryFleet = task3Fleet({
      id: 79,
      den: {g: 1, h: 2, p: 5},
      mission: 'transport',
      diLuc: 9007199254740,
      den_t: 9007199254740
    });
    assert.deepEqual(events.stableFleetRef(11, boundaryFleet), {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 79,
      launchAtS: 9007199254740,
      targetKey: '1:2:5',
      arrivalAtS: 9007199254740,
      mission: 'transport'
    }, 'task3 direct stableFleetRef must accept the Task2 safeSecond ceiling');
    var maxZeroFleet = task3Fleet({
      id: Number.MAX_SAFE_INTEGER,
      den: {g: 1, h: 2, p: 5},
      mission: 'transport',
      diLuc: 0,
      den_t: 0
    });
    assert.deepEqual(events.stableFleetRef(11, maxZeroFleet), {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: Number.MAX_SAFE_INTEGER,
      launchAtS: 0,
      targetKey: '1:2:5',
      arrivalAtS: 0,
      mission: 'transport'
    }, 'task3 direct stableFleetRef must accept max safe entity id and zero-second launch arrival');
    [
      ['undefined row', undefined],
      ['null row', null],
      ['scalar row', 'fleet'],
      ['number row', 1],
      ['boolean row', true],
      ['function row', function () {}],
      ['array row', []],
      ['missing id', withoutKey(liveFleet, 'id')],
      ['undefined id', Object.assign({}, liveFleet, {id: undefined})],
      ['null id', Object.assign({}, liveFleet, {id: null})],
      ['zero id', Object.assign({}, liveFleet, {id: 0})],
      ['negative id', Object.assign({}, liveFleet, {id: -71})],
      ['fractional id', Object.assign({}, liveFleet, {id: 71.5})],
      ['NaN id', Object.assign({}, liveFleet, {id: NaN})],
      ['infinite id', Object.assign({}, liveFleet, {id: Infinity})],
      ['negative infinite id', Object.assign({}, liveFleet, {id: -Infinity})],
      ['string id', Object.assign({}, liveFleet, {id: '71'})],
      ['function id', Object.assign({}, liveFleet, {id: function () {}})],
      ['boolean id', Object.assign({}, liveFleet, {id: false})],
      ['object id', Object.assign({}, liveFleet, {id: {}})],
      ['array id', Object.assign({}, liveFleet, {id: []})],
      ['unsafe id', Object.assign({}, liveFleet, {id: Number.MAX_SAFE_INTEGER + 1})],
      ['missing launch', withoutKey(liveFleet, 'diLuc')],
      ['undefined launch', Object.assign({}, liveFleet, {diLuc: undefined})],
      ['null launch', Object.assign({}, liveFleet, {diLuc: null})],
      ['string launch', Object.assign({}, liveFleet, {diLuc: '130'})],
      ['negative launch', Object.assign({}, liveFleet, {diLuc: -1})],
      ['fractional launch', Object.assign({}, liveFleet, {diLuc: 130.5})],
      ['NaN launch', Object.assign({}, liveFleet, {diLuc: NaN})],
      ['positive infinite launch', Object.assign({}, liveFleet, {diLuc: Infinity})],
      ['negative infinite launch', Object.assign({}, liveFleet, {diLuc: -Infinity})],
      ['function launch', Object.assign({}, liveFleet, {diLuc: function () {}})],
      ['boolean launch', Object.assign({}, liveFleet, {diLuc: false})],
      ['object launch', Object.assign({}, liveFleet, {diLuc: {}})],
      ['array launch', Object.assign({}, liveFleet, {diLuc: []})],
      ['unsafe launch', Object.assign({}, liveFleet, {diLuc: 9007199254741})],
      ['missing arrival', withoutKey(liveFleet, 'den_t')],
      ['undefined arrival', Object.assign({}, liveFleet, {den_t: undefined})],
      ['null arrival', Object.assign({}, liveFleet, {den_t: null})],
      ['string arrival', Object.assign({}, liveFleet, {den_t: '150'})],
      ['negative arrival', Object.assign({}, liveFleet, {den_t: -1})],
      ['fractional arrival', Object.assign({}, liveFleet, {den_t: 150.5})],
      ['NaN arrival', Object.assign({}, liveFleet, {den_t: NaN})],
      ['positive infinite arrival', Object.assign({}, liveFleet, {den_t: Infinity})],
      ['negative infinite arrival', Object.assign({}, liveFleet, {den_t: -Infinity})],
      ['function arrival', Object.assign({}, liveFleet, {den_t: function () {}})],
      ['boolean arrival', Object.assign({}, liveFleet, {den_t: false})],
      ['object arrival', Object.assign({}, liveFleet, {den_t: {}})],
      ['array arrival', Object.assign({}, liveFleet, {den_t: []})],
      ['unsafe arrival', Object.assign({}, liveFleet, {den_t: 9007199254741})],
      ['launch after arrival', Object.assign({}, liveFleet, {diLuc: 151, den_t: 150})],
      ['missing target', withoutKey(liveFleet, 'den')],
      ['malformed target', Object.assign({}, liveFleet, {den: {g: 1, h: 2}})],
      ['wrong mission', Object.assign({}, liveFleet, {mission: 'probe'})]
    ].forEach(function (entry) {
      assert.throws(function () {
        events.stableFleetRef(11, entry[1]);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
      'task3 direct stableFleetRef malformed case ' + entry[0]);
    });
    var liveMissile = task3Missile({
      id: 81,
      den: {g: 1, h: 4, p: 5},
      diLuc: 171,
      khi: 222
    });
    assert.deepEqual(events.stableMissileRef(11, liveMissile), missileRef,
      'task3 direct stableMissileRef vector must preserve explicit launchAtS');
    assert.equal(events.stableMissileRef(Number.MAX_SAFE_INTEGER, liveMissile).ownerAccountId,
      Number.MAX_SAFE_INTEGER,
      'task3 direct stableMissileRef must accept ownerAccountId safe-integer boundary');
    [undefined, null, 0, -1, 11.5, '11', NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, false, true, function () {}, {}, []].forEach(function (ownerAccountId) {
      assert.throws(function () {
        events.stableMissileRef(ownerAccountId, liveMissile);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|OWNER_ACCOUNT_INVALID/,
      'task3 direct stableMissileRef malformed ownerAccountId case ' + ownerAccountId);
    });
    var boundaryMissile = task3Missile({
      id: 83,
      den: {g: 1, h: 4, p: 5},
      diLuc: 9007199254740,
      khi: 9007199254740
    });
    assert.deepEqual(events.stableMissileRef(11, boundaryMissile), {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: 83,
      launchAtS: 9007199254740,
      targetKey: '1:4:5',
      arrivalAtS: 9007199254740,
      mission: 'missile'
    }, 'task3 direct stableMissileRef must accept the Task2 safeSecond ceiling');
    var maxZeroMissile = task3Missile({
      id: Number.MAX_SAFE_INTEGER,
      den: {g: 1, h: 4, p: 5},
      diLuc: 0,
      khi: 0
    });
    assert.deepEqual(events.stableMissileRef(11, maxZeroMissile), {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: Number.MAX_SAFE_INTEGER,
      launchAtS: 0,
      targetKey: '1:4:5',
      arrivalAtS: 0,
      mission: 'missile'
    }, 'task3 direct stableMissileRef must accept max safe entity id and zero-second explicit launch arrival');
    var legacyMissile = task3Missile({
      id: 82,
      den: {g: 1, h: 4, p: 5},
      khi: 260
    });
    var zeroLaunchLegacyMissile = task3Missile({
      id: Number.MAX_SAFE_INTEGER,
      den: {g: 1, h: 4, p: 5},
      khi: G.tgTenLua(3)
    });
    assert.equal(events.stableMissileRef(11, zeroLaunchLegacyMissile).launchAtS, 0,
      'task3 direct stableMissileRef legacy-derived matrix must accept zero-second derived launch');
    assert.equal(events.stableMissileRef(11, zeroLaunchLegacyMissile).missileId,
      Number.MAX_SAFE_INTEGER,
      'task3 direct stableMissileRef legacy-derived matrix must accept max safe entity id');
    [
      ['undefined row', undefined],
      ['null row', null],
      ['scalar row', 'missile'],
      ['number row', 1],
      ['boolean row', true],
      ['function row', function () {}],
      ['array row', []],
      ['missing id', withoutKey(liveMissile, 'id')],
      ['undefined id', Object.assign({}, liveMissile, {id: undefined})],
      ['null id', Object.assign({}, liveMissile, {id: null})],
      ['zero id', Object.assign({}, liveMissile, {id: 0})],
      ['negative id', Object.assign({}, liveMissile, {id: -81})],
      ['fractional id', Object.assign({}, liveMissile, {id: 81.5})],
      ['NaN id', Object.assign({}, liveMissile, {id: NaN})],
      ['infinite id', Object.assign({}, liveMissile, {id: Infinity})],
      ['negative infinite id', Object.assign({}, liveMissile, {id: -Infinity})],
      ['string id', Object.assign({}, liveMissile, {id: '81'})],
      ['function id', Object.assign({}, liveMissile, {id: function () {}})],
      ['boolean id', Object.assign({}, liveMissile, {id: false})],
      ['object id', Object.assign({}, liveMissile, {id: {}})],
      ['array id', Object.assign({}, liveMissile, {id: []})],
      ['unsafe id', Object.assign({}, liveMissile, {id: Number.MAX_SAFE_INTEGER + 1})],
      ['missing target', withoutKey(liveMissile, 'den')],
      ['malformed target', Object.assign({}, liveMissile, {den: {g: 1, h: 4}})],
      ['undefined explicit launch', Object.assign({}, liveMissile, {diLuc: undefined})],
      ['null explicit launch', Object.assign({}, liveMissile, {diLuc: null})],
      ['string explicit launch', Object.assign({}, liveMissile, {diLuc: '171'})],
      ['negative explicit launch', Object.assign({}, liveMissile, {diLuc: -1})],
      ['fractional explicit launch', Object.assign({}, liveMissile, {diLuc: 171.5})],
      ['NaN launch', Object.assign({}, liveMissile, {diLuc: NaN})],
      ['positive infinite explicit launch', Object.assign({}, liveMissile, {diLuc: Infinity})],
      ['negative infinite explicit launch', Object.assign({}, liveMissile, {diLuc: -Infinity})],
      ['function explicit launch', Object.assign({}, liveMissile, {diLuc: function () {}})],
      ['boolean explicit launch', Object.assign({}, liveMissile, {diLuc: false})],
      ['object explicit launch', Object.assign({}, liveMissile, {diLuc: {}})],
      ['array explicit launch', Object.assign({}, liveMissile, {diLuc: []})],
      ['unsafe launch', Object.assign({}, liveMissile, {diLuc: 9007199254741})],
      ['missing arrival', withoutKey(liveMissile, 'khi')],
      ['undefined arrival', Object.assign({}, liveMissile, {khi: undefined})],
      ['null arrival', Object.assign({}, liveMissile, {khi: null})],
      ['string arrival', Object.assign({}, liveMissile, {khi: '222'})],
      ['negative arrival', Object.assign({}, liveMissile, {khi: -1})],
      ['fractional arrival', Object.assign({}, liveMissile, {khi: 222.5})],
      ['NaN arrival', Object.assign({}, liveMissile, {khi: NaN})],
      ['positive infinite arrival', Object.assign({}, liveMissile, {khi: Infinity})],
      ['negative infinite arrival', Object.assign({}, liveMissile, {khi: -Infinity})],
      ['function arrival', Object.assign({}, liveMissile, {khi: function () {}})],
      ['boolean arrival', Object.assign({}, liveMissile, {khi: false})],
      ['object arrival', Object.assign({}, liveMissile, {khi: {}})],
      ['array arrival', Object.assign({}, liveMissile, {khi: []})],
      ['unsafe arrival', Object.assign({}, liveMissile, {khi: 9007199254741})],
      ['explicit launch after arrival', Object.assign({}, liveMissile, {diLuc: 223, khi: 222})],
      ['derived launch undefined arrival', Object.assign({}, legacyMissile, {khi: undefined})],
      ['derived launch null arrival', Object.assign({}, legacyMissile, {khi: null})],
      ['derived launch boolean arrival', Object.assign({}, legacyMissile, {khi: false})],
      ['derived launch object arrival', Object.assign({}, legacyMissile, {khi: {}})],
      ['derived launch array arrival', Object.assign({}, legacyMissile, {khi: []})],
      ['derived launch negative', Object.assign({}, legacyMissile, {
        den: {g: 1, h: 999999999, p: 5}, khi: 1
      })],
      ['derived launch fractional arrival', Object.assign({}, legacyMissile, {khi: 260.5})],
      ['derived launch string arrival', Object.assign({}, legacyMissile, {khi: '260'})],
      ['derived launch NaN arrival', Object.assign({}, legacyMissile, {khi: NaN})],
      ['derived launch positive infinite arrival', Object.assign({}, legacyMissile, {khi: Infinity})],
      ['derived launch negative infinite arrival', Object.assign({}, legacyMissile, {khi: -Infinity})],
      ['derived launch unsafe arrival', Object.assign({}, legacyMissile, {khi: 9007199254741})]
    ].forEach(function (entry) {
      assert.throws(function () {
        events.stableMissileRef(11, entry[1]);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
      'task3 direct stableMissileRef malformed case ' + entry[0]);
    });
    var legacyRef = events.stableMissileRef(11, legacyMissile);
    assert.equal(legacyRef.launchAtS, 260 - G.tgTenLua(3),
      'task3 direct stableMissileRef vector must derive legacy launchAtS');
    assert.equal(legacyRef.missileId, 82);
    var derived = events.deriveExternalJobs(11, liveState, ownerFor);
    assert.equal(derived.length, 1);
    assert.deepEqual(store.validateJob(derived[0]), store.validateJob(pvp));
    var returningAttackState = task3FreshState(130);
    returningAttackState.fleets.push(task3Fleet({
      id: 711,
      den: {g: 1, h: 2, p: 5},
      mission: 'attack',
      pha: 've',
      diLuc: 130,
      den_t: 150,
      ve_t: 190
    }));
    assert.deepEqual(events.deriveExternalJobs(11, returningAttackState, ownerFor), [],
      'task3 deriveExternalJobs must not derive PVP jobs for returning attack fleets');
    var heldState = task3FreshState(130);
    heldState.fleets.push(task3Fleet({
      id: 712,
      den: {g: 1, h: 2, p: 5},
      mission: 'hold',
      pha: 'giu',
      diLuc: 130,
      den_t: 150,
      giuDen_t: 190,
      tiepNL_t: 170
    }));
    assert.deepEqual(events.deriveExternalJobs(11, heldState, ownerFor), [],
      'task3 deriveExternalJobs must not derive external jobs for non-outbound hold fleets');
    task3WithHook(task3PlayerHook('1:2:5', 22), function () {
      var outboundCandidate = G.phanLoaiSuKienKe(liveState, 11, {
        multiplayer: true,
        targetAccountForKey: ownerFor
      });
      assert.equal(outboundCandidate.code, 'EXTERNAL_EVENT',
        'task3 outbound pha di fleet control must remain external');
      assert.deepEqual(outboundCandidate.ref, attackRef,
        'task3 outbound pha di fleet control must preserve the exact durable ref');
      var returningCandidate = G.phanLoaiSuKienKe(returningAttackState, 11, {
        multiplayer: true,
        targetAccountForKey: ownerFor
      });
      assert.notEqual(returningCandidate && returningCandidate.code, 'EXTERNAL_EVENT',
        'task3 returning attack fleet must not classify as external');
      var heldCandidate = G.phanLoaiSuKienKe(heldState, 11, {
        multiplayer: true,
        targetAccountForKey: ownerFor
      });
      assert.notEqual(heldCandidate && heldCandidate.code, 'EXTERNAL_EVENT',
        'task3 non-outbound hold fleet must not classify as external');
    });
    var multiState = task3FreshState(130);
    ['attack', 'transport', 'spy', 'hold'].forEach(function (mission, index) {
      multiState.fleets.push(task3Fleet({
        id: 710 + index,
        den: {g: 1, h: 2, p: 5},
        mission: mission,
        diLuc: 130,
        den_t: 150 + index
      }));
    });
    var multiJobs = events.deriveExternalJobs(11, multiState, ownerFor);
    assert.deepEqual(multiJobs.map(function (job) {
      return job.payload.ref.mission;
    }), ['attack', 'transport', 'spy', 'hold'],
    'task3 deriveExternalJobs must derive attack, transport, spy, and hold live fleet jobs');
    multiJobs.forEach(function (job) {
      assert.deepEqual(store.validateJob(job).payload.ref, job.payload.ref,
        'task3 Task2 validateJob must accept derived ' + job.payload.ref.mission + ' job');
    });
    ['attack', 'transport', 'spy', 'hold'].forEach(function (mission, index) {
      var classifyState = task3FreshState(130);
      classifyState.fleets.push(task3Fleet({
        id: 810 + index,
        den: {g: 1, h: 2, p: 5},
        mission: mission,
        diLuc: 130,
        den_t: 180 + index
      }));
      task3WithHook(task3PlayerHook('1:2:5', 22), function () {
        var candidate = G.phanLoaiSuKienKe(classifyState, 11, {
          multiplayer: true,
          targetAccountForKey: ownerFor
        });
        assert.equal(candidate.code, 'EXTERNAL_EVENT',
          'task3 real classifier must classify ' + mission + ' as external');
        assert.equal(candidate.ref.mission, mission,
          'task3 real classifier must preserve external mission ' + mission);
        assert.deepEqual(store.validateJob(events.jobFromRef(candidate.ref, ownerFor)).payload.ref,
          candidate.ref, 'task3 Task2 validateJob must accept real classifier ' + mission + ' job');
      });
    });
  });

test('server events sameExternalRef rejects near misses and canonical status is explicit',
  function () {
    var events = task3EventsModule();
    var st = task3FreshState(190);
    var target = {g: 1, h: 2, p: 5};
    var ref = {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 71,
      launchAtS: 190,
      targetKey: G.tdKey(target),
      arrivalAtS: 210,
      mission: 'transport'
    };
    st.fleets.push(task3Fleet({
      id: 71,
      mission: 'transport',
      den: target,
      diLuc: 190,
      den_t: 210
    }));
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref)), true);
    Object.keys(ref).forEach(function (key) {
      var changed = Object.assign({}, ref);
      changed[key] = key === 'mission' ? 'spy' : '__changed__';
      assert.equal(events.sameExternalRef(ref, changed), false,
        'task3 sameExternalRef field change case ' + key);
      assert.equal(events.sameExternalRef(ref, withoutKey(ref, key)), false,
        'task3 sameExternalRef missing field case ' + key);
    });
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref, {extra: true})), false,
      'task3 sameExternalRef extra field case');
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref, {arrivalAtS: 211})), false);
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref, {targetKey: '01:2:5'})), false);
    assert.throws(function () {
      events.externalKey(Object.assign({}, ref, {targetKey: '01:2:5'}));
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/);
    assert.throws(function () {
      events.jobFromRef(Object.assign({}, ref, {targetKey: '01:2:5'}), function () { return 22; });
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/);
    var deployRef = Object.assign({}, ref, {mission: 'deploy'});
    assert.equal(events.jobFromRef(deployRef, function () { return 22; }), null,
      'task3 deploy fleet ref maps to null as a local non-external mission');
    assert.throws(function () {
      events.externalKey(deployRef);
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/,
    'task3 deploy fleet ref must not receive an external durable key');
    assert.throws(function () {
      events.jobFromRef(Object.assign({}, ref, {mission: 'probe'}), function () { return 22; });
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/,
    'task3 wrong fleet mission must reject instead of sharing deploy null semantics');
    assert.throws(function () {
      events.jobFromRef(Object.assign({}, ref, {kind: 'unknown'}), function () { return 22; });
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|JOB_KIND_INVALID/);
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), ref), 'EXACT');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      launchAtS: 191
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      targetKey: '01:2:5'
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), null), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      kind: 'unknown'
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      fleetId: undefined
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, task3FreshState(190)), ref),
      'ALREADY_ABSENT');
    var returningState = task3FreshState(190);
    returningState.fleets.push(task3Fleet({
      id: 71,
      mission: 'transport',
      pha: 've',
      den: target,
      diLuc: 190,
      den_t: 210,
      ve_t: 230
    }));
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, returningState), ref),
      'ALREADY_ABSENT',
      'task3 stale outbound fleet ref must be absent after the live fleet leaves outbound phase');

    var missileState = task3FreshState(200);
    var missileTarget = {g: 1, h: 4, p: 5};
    var missileRef = {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: 81,
      launchAtS: 171,
      targetKey: G.tdKey(missileTarget),
      arrivalAtS: 222,
      mission: 'missile'
    };
    missileState.tenLua.push(task3Missile({
      id: 81,
      den: missileTarget,
      diLuc: 171,
      khi: 222
    }));
    assert.equal(events.canonicalExternalStatus(
      task3KhoForState(11, missileState), missileRef), 'EXACT');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
      Object.assign({}, missileRef, {launchAtS: 172})), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
      Object.assign({}, missileRef, {targetKey: '01:4:5'})), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
      Object.assign({}, missileRef, {missileId: undefined})), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, task3FreshState(200)),
      missileRef), 'ALREADY_ABSENT');

    function withoutKey(base, key) {
      var copy = Object.assign({}, base);
      delete copy[key];
      return copy;
    }
    var malformedRefs = [
      ['null ref', null],
      ['array ref', []],
      ['string ref', 'ref'],
      ['empty object ref', {}],
      ['fleet extra key', Object.assign({}, ref, {extra: true})],
      ['missile extra key', Object.assign({}, missileRef, {extra: true})],
      ['fleet wrong key cardinality', Object.assign({}, ref, {missileId: 71})],
      ['missile wrong key cardinality', Object.assign({}, missileRef, {fleetId: 81})],
      ['fleet owner zero', Object.assign({}, ref, {ownerAccountId: 0})],
      ['fleet owner negative', Object.assign({}, ref, {ownerAccountId: -1})],
      ['fleet owner fractional', Object.assign({}, ref, {ownerAccountId: 11.5})],
      ['fleet owner string', Object.assign({}, ref, {ownerAccountId: '11'})],
      ['fleet owner unsafe', Object.assign({}, ref, {ownerAccountId: Number.MAX_SAFE_INTEGER + 1})],
      ['fleet owner NaN', Object.assign({}, ref, {ownerAccountId: NaN})],
      ['fleet owner infinite', Object.assign({}, ref, {ownerAccountId: Infinity})],
      ['fleet id zero', Object.assign({}, ref, {fleetId: 0})],
      ['fleet id negative', Object.assign({}, ref, {fleetId: -71})],
      ['fleet id fractional', Object.assign({}, ref, {fleetId: 71.5})],
      ['fleet id string', Object.assign({}, ref, {fleetId: '71'})],
      ['fleet launch string', Object.assign({}, ref, {launchAtS: '190'})],
      ['fleet launch negative', Object.assign({}, ref, {launchAtS: -1})],
      ['fleet launch fractional', Object.assign({}, ref, {launchAtS: 190.5})],
      ['fleet launch unsafe', Object.assign({}, ref, {launchAtS: 9007199254741})],
      ['fleet launch NaN', Object.assign({}, ref, {launchAtS: NaN})],
      ['fleet launch infinite', Object.assign({}, ref, {launchAtS: Infinity})],
      ['fleet arrival string', Object.assign({}, ref, {arrivalAtS: '210'})],
      ['fleet arrival negative', Object.assign({}, ref, {arrivalAtS: -1})],
      ['fleet arrival fractional', Object.assign({}, ref, {arrivalAtS: 210.5})],
      ['fleet arrival unsafe', Object.assign({}, ref, {arrivalAtS: 9007199254741})],
      ['fleet arrival NaN', Object.assign({}, ref, {arrivalAtS: NaN})],
      ['fleet arrival infinite', Object.assign({}, ref, {arrivalAtS: Infinity})],
      ['fleet launch after arrival', Object.assign({}, ref, {launchAtS: 211})],
      ['fleet leading-zero target', Object.assign({}, ref, {targetKey: '01:2:5'})],
      ['fleet missing planet target', Object.assign({}, ref, {targetKey: '1:2'})],
      ['fleet nonnumeric target', Object.assign({}, ref, {targetKey: '1:a:5'})],
      ['fleet empty target', Object.assign({}, ref, {targetKey: ''})],
      ['fleet missile mission mismatch', Object.assign({}, ref, {mission: 'missile'})],
      ['missile mission mismatch', Object.assign({}, missileRef, {mission: 'attack'})],
      ['missile id zero', Object.assign({}, missileRef, {missileId: 0})],
      ['missile id negative', Object.assign({}, missileRef, {missileId: -81})],
      ['missile id fractional', Object.assign({}, missileRef, {missileId: 81.5})],
      ['missile id string', Object.assign({}, missileRef, {missileId: '81'})],
      ['missile owner unsafe', Object.assign({}, missileRef, {
        ownerAccountId: Number.MAX_SAFE_INTEGER + 1
      })],
      ['missile owner NaN', Object.assign({}, missileRef, {ownerAccountId: NaN})],
      ['missile owner infinite', Object.assign({}, missileRef, {ownerAccountId: Infinity})],
      ['missile leading-zero target', Object.assign({}, missileRef, {targetKey: '1:04:5'})],
      ['missile missing planet target', Object.assign({}, missileRef, {targetKey: '1:4'})],
      ['missile nonnumeric target', Object.assign({}, missileRef, {targetKey: '1:x:5'})],
      ['missile launch unsafe', Object.assign({}, missileRef, {launchAtS: 9007199254741})],
      ['missile launch NaN', Object.assign({}, missileRef, {launchAtS: NaN})],
      ['missile launch infinite', Object.assign({}, missileRef, {launchAtS: Infinity})],
      ['missile arrival unsafe', Object.assign({}, missileRef, {arrivalAtS: 9007199254741})],
      ['missile arrival NaN', Object.assign({}, missileRef, {arrivalAtS: NaN})],
      ['missile arrival infinite', Object.assign({}, missileRef, {arrivalAtS: Infinity})],
      ['missile launch after arrival', Object.assign({}, missileRef, {launchAtS: 223})]
    ];
    Object.keys(ref).forEach(function (key) {
      malformedRefs.push(['fleet missing key ' + key, withoutKey(ref, key)]);
    });
    Object.keys(missileRef).forEach(function (key) {
      malformedRefs.push(['missile missing key ' + key, withoutKey(missileRef, key)]);
    });
    malformedRefs.forEach(function (entry) {
      assert.throws(function () {
        events.externalKey(entry[1]);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/,
      'task3 malformed ref externalKey case ' + entry[0]);
      assert.throws(function () {
        events.jobFromRef(entry[1], function () { return 22; });
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|JOB_KIND_INVALID/,
      'task3 malformed ref jobFromRef case ' + entry[0]);
      assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
        entry[1]), 'REF_MISMATCH',
      'task3 malformed ref status case ' + entry[0]);
    });
  });

test('server events module parses standalone and exports only pure helper names',
  function () {
    var sourcePath = path.resolve(__dirname, '../server/scheduler/events.js');
    var source = fs.readFileSync(sourcePath, 'utf8');
    function task3LoaderTokens(text) {
      var tokens = [];
      var i = 0;
      function isIdStart(ch) { return /[A-Za-z_$]/.test(ch); }
      function isId(ch) { return /[A-Za-z0-9_$]/.test(ch); }
      function readUnicodeEscape(offset) {
        if (text[offset] !== '\\' || text[offset + 1] !== 'u') return null;
        if (text[offset + 2] === '{') {
          var end = text.indexOf('}', offset + 3);
          if (end < 0) return null;
          var pointHex = text.slice(offset + 3, end);
          if (!/^[0-9A-Fa-f]{1,6}$/.test(pointHex)) return null;
          var point = parseInt(pointHex, 16);
          if (point > 0x10ffff) return null;
          return {ch: String.fromCodePoint(point), width: end - offset + 1};
        }
        var hex = text.slice(offset + 2, offset + 6);
        if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return null;
        return {ch: String.fromCharCode(parseInt(hex, 16)), width: 6};
      }
      function readTemplateExpression(offset) {
        var depth = 1;
        var start = offset;
        var j = offset;
        while (j < text.length && depth > 0) {
          if (text[j] === '"' || text[j] === "'" || text[j] === '`') {
            var quote = text[j];
            j += 1;
            while (j < text.length) {
              if (text[j] === '\\') { j += 2; continue; }
              if (text[j] === quote) { j += 1; break; }
              j += 1;
            }
            continue;
          }
          if (text[j] === '{') depth += 1;
          else if (text[j] === '}') depth -= 1;
          j += 1;
        }
        tokens.push.apply(tokens, task3LoaderTokens(text.slice(start, j - 1)));
        return j;
      }
      while (i < text.length) {
        var ch = text[i];
        if (/\s/.test(ch)) { i += 1; continue; }
        if (ch === '/' && text[i + 1] === '/') {
          i += 2;
          while (i < text.length && !/[\n\r]/.test(text[i])) i += 1;
          continue;
        }
        if (ch === '/' && text[i + 1] === '*') {
          i += 2;
          while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
          i += 2;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          var quote = ch;
          var value = '';
          i += 1;
          while (i < text.length) {
            if (text[i] === '\\') { i += 2; continue; }
            if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
              i = readTemplateExpression(i + 2);
              continue;
            }
            if (text[i] === quote) { i += 1; break; }
            if (quote !== '`') value += text[i];
            i += 1;
          }
          tokens.push({type: 'string', value: quote === '`' ? null : value});
          continue;
        }
        var escaped = readUnicodeEscape(i);
        if ((escaped && isIdStart(escaped.ch)) || isIdStart(ch)) {
          var valueId = '';
          while (i < text.length) {
            escaped = readUnicodeEscape(i);
            if (escaped && isId(escaped.ch)) {
              valueId += escaped.ch;
              i += escaped.width;
              continue;
            }
            if (!isId(text[i])) break;
            valueId += text[i];
            i += 1;
          }
          tokens.push({type: 'id', value: valueId});
          continue;
        }
        tokens.push({type: 'p', value: ch});
        i += 1;
      }
      return tokens;
    }
    function assertEventsImportPolicy(text, label) {
      var tokens = task3LoaderTokens(text);
      var requires = [];
      function tok(offset, from) { return tokens[(from || 0) + offset] || {}; }
      function val(offset, from) { return tok(offset, from).value; }
      var computedConstructor =
        /\[\s*(?:['"`]con['"`]\s*\+\s*['"`]structor['"`]|['"`]con(?:\\u0073|\\u\{73\})tructor['"`]|`constructor`)\s*\]/;
      if (computedConstructor.test(text) ||
          /\[\s*(?:['"`]get['"`]\s*\+\s*['"`]BuiltinModule['"`]|['"`]_lo['"`]\s*\+\s*['"`]ad['"`])\s*\]/.test(text) ||
          /['"`](?:return\s+)?(?:require|import|module\.constructor|process\.getBuiltinModule|_load)\b/.test(text)) {
        throw new Error('task3 import policy rejected split/string-generated loader in ' + label);
      }
      tokens.forEach(function (token, index) {
        if (token.type === 'string' && token.value === 'constructor') {
          throw new Error('task3 import policy rejected computed constructor loader in ' + label);
        }
        if (token.type !== 'id') return;
        if (token.value === 'constructor') {
          throw new Error('task3 import policy rejected arbitrary constructor acquisition in ' + label);
        }
        if (token.value === 'import') {
          throw new Error('task3 import policy rejected dynamic import in ' + label);
        }
        if (token.value === 'Reflect' || token.value === 'createRequire' ||
            token.value === 'eval' || token.value === 'Function') {
          throw new Error('task3 import policy rejected computed loader in ' + label);
        }
        if (token.value === 'module') {
          if (!(val(1, index) === '.' && val(2, index) === 'exports' && val(3, index) === '=')) {
            throw new Error('task3 import policy rejected module use in ' + label);
          }
          return;
        }
        if ((token.value === 'global' || token.value === 'globalThis') &&
            (val(1, index) === '[' ||
             (val(1, index) === '.' && val(2, index) === 'require') ||
             (val(1, index) === '.' && val(2, index) === 'constructor'))) {
          throw new Error('task3 import policy rejected indirect loader in ' + label);
        }
        if (token.value === 'process' &&
            (val(1, index) === '[' ||
             (val(1, index) === '.' && val(2, index) === 'mainModule') ||
             (val(1, index) === '.' && val(2, index) === 'getBuiltinModule'))) {
          throw new Error('task3 import policy rejected indirect loader in ' + label);
        }
        if (token.value === 'G' && (val(1, index) === '.' || val(1, index) === '[')) {
          for (var j = index + 2; j < Math.min(tokens.length, index + 8); j += 1) {
            if (tokens[j].value === '=') {
              throw new Error('task3 import policy rejected G mutation in ' + label);
            }
          }
        }
        if (token.value !== 'require') return;
        if (val(-1, index) === '.' || val(1, index) !== '(') {
          throw new Error('task3 import policy rejected alias require in ' + label);
        }
        if (tok(2, index).type !== 'string' || val(3, index) !== ')') {
          throw new Error('task3 import policy rejected nonliteral require in ' + label);
        }
        requires.push(tok(2, index).value);
      });
      requires.sort();
      assert.deepEqual(requires, ['../rules.js', 'node:crypto'].sort(),
        'task3 import policy exact allowlist in ' + label);
      requires.forEach(function (request) {
        assert.equal(['../rules.js', 'node:crypto'].indexOf(request) >= 0, true,
          'task3 import policy rejected runtime import ' + request + ' in ' + label);
      });
      assert.equal(/\bDate\s*\.\s*now\b|new\s+SchedulerStore\b|new\s+Kho\b/.test(text),
        false, 'task3 import policy rejected runtime side effect in ' + label);
      assert.equal(/\bperformance\s*\.\s*now\b|\bprocess\s*\.\s*hrtime\b|new\s+Date\b/.test(text),
        false, 'task3 import policy rejected wall-clock side effect in ' + label);
      assert.equal(/Object\s*\.\s*assign\s*\(\s*G\b|Reflect\s*\.\s*set\s*\(\s*G\b/.test(text),
        false, 'task3 import policy rejected G mutation in ' + label);
    }
    assertEventsImportPolicy(source, 'events.js');
    [
      ['dead-branch literal require', "if (false) require('./store.js');"],
      ['comment-spaced literal require', "require /* hidden */ ('./store.js');"],
      ['dynamic nonliteral require', "require('./' + 'store.js');"],
      ['template interpolation require', "`${require('./store.js')}`;"],
      ['escaped identifier require', "var loader = requ\\u0069re; loader('./store.js');"],
      ['code-point escaped identifier require', "var loader = requ\\u{69}re; loader('./store.js');"],
      ['dynamic import', ['im', 'port'].join('') + "('./store.js');"],
      ['escaped identifier import', "im\\u0070ort('./store.js');"],
      ['comment-spaced dynamic import', "import /* hidden */ ('./store.js');"],
      ['module require', "module.require('./store.js');"],
      ['computed module require', "module['require']('./store.js');"],
      ['module constructor load', "module.constructor._load('./store.js');"],
      ['require resolve member', "require['resolve']('./store.js');"],
      ['aliased require', "var loader = require; loader('./store.js');"],
      ['delayed dead branch loader', "if (false) setImmediate(function () { require('./store.js'); });"],
      ['process mainModule require', "process.mainModule.require('./store.js');"],
      ['process builtin module load',
        "process.getBuiltinModule('module')._load('./store.js', null, false);"],
      ['global require', "globalThis.require('./store.js');"],
      ['computed global require', "globalThis['require']('./store.js');"],
      ['alternate constructor loader',
        "globalThis.constructor.constructor('return require')()('./store.js');"],
      ['arbitrary constructor loader',
        "({}).constructor.constructor('return require')()('./store.js');"],
      ['computed constructor loader',
        "var key = 'constructor'; globalThis[key][key]('return require')()('./store.js');"],
      ['split string constructor key',
        "globalThis['con' + 'structor']['constructor']('return require')()('./store.js');"],
      ['unicode string constructor key',
        "globalThis['con\\u0073tructor']['constructor']('return require')()('./store.js');"],
      ['code-point string constructor key',
        "globalThis['con\\u{73}tructor']['constructor']('return require')()('./store.js');"],
      ['template computed constructor key',
        "globalThis[`constructor`]['constructor']('return require')()('./store.js');"],
      ['Reflect apply require', "Reflect.apply(require, null, ['./store.js']);"],
      ['Reflect get module require', "Reflect.get(module, 'require')('./store.js');"],
      ['forged parent module load',
        "module.constructor._load('./store.js', {filename: __filename}, false);"],
      ['parentless module load', "module.constructor._load('./store.js', null, false);"],
      ['createRequire loader', "var cr = createRequire(__filename);"],
      ['eval loader', ['ev', 'al'].join('') + "('require(\"./store.js\")');"],
      ['Function loader', ['Fun', 'ction'].join('') + "('return require(\"./store.js\")')();"],
      ['Function string-generated loader',
        "var body = 'return require'; " + ['Fun', 'ction'].join('') + "(body)()('./store.js');"],
      ['string timer generated loader', "setTimeout('require(\"./store.js\")', 0);"],
      ['Promise delayed loader',
        "if (false) Promise.resolve().then(function () { require('./store.js'); });"],
      ['Promise delayed Function loader',
        "Promise.resolve().then(" + ['Fun', 'ction'].join('') + "('return require(\"./store.js\")'));"],
      ['split getBuiltinModule load',
        "process['get' + 'BuiltinModule']('module')['_lo' + 'ad']('./store.js', null, false);"],
      ['G direct mutation', "G.bad = true;"],
      ['G object assign mutation', "Object.assign(G, {bad: true});"],
      ['performance wall clock', "var t = performance.now();"],
      ['Date wall clock', "var d = new Date();"]
    ].forEach(function (entry) {
      assert.throws(function () {
        assertEventsImportPolicy(
          "require('node:crypto');\nrequire('../rules.js');\n" + entry[1],
          entry[0]
        );
      }, /task3 import policy/,
      'task3 import policy negative corpus case ' + entry[0]);
    });
    var Module = require('node:module');
    var oldLoad = Module._load;
    var seenDirect = [];
    delete require.cache[require.resolve(sourcePath)];
    try {
      Module._load = function (request, parent, isMain) {
        if ((!parent || parent.filename !== sourcePath) &&
            (request === './store.js' || /server\/scheduler\/store\.js$/.test(request))) {
          throw new Error('events.js rejected forged or parentless cold-load import ' + request);
        }
        if (parent && parent.filename === sourcePath) {
          seenDirect.push(request);
          if (['../rules.js', 'node:crypto'].indexOf(request) < 0) {
            throw new Error('events.js disallowed cold-load import ' + request);
          }
        }
        return oldLoad.apply(this, arguments);
      };
      require(sourcePath);
    } finally {
      Module._load = oldLoad;
      delete require.cache[require.resolve(sourcePath)];
      task3EventsCache = null;
    }
    assert.deepEqual(Array.from(new Set(seenDirect)).sort(),
      ['../rules.js', 'node:crypto'].sort());
    [
      ['parentless runtime import', './store.js', null],
      ['forged-parent runtime import', './store.js', {filename: __filename}],
      ['disallowed source runtime import', './store.js', {filename: sourcePath}]
    ].forEach(function (entry) {
      var rejected = false;
      try {
        Module._load = function (request, parent) {
          if (!parent || parent.filename !== sourcePath ||
              ['../rules.js', 'node:crypto'].indexOf(request) < 0) {
            throw new Error('task3 import policy rejected runtime loader ' + entry[0]);
          }
          return oldLoad.apply(this, arguments);
        };
        Module._load(entry[1], entry[2], false);
      } catch (error) {
        rejected = /task3 import policy rejected runtime loader/.test(String(error));
      } finally {
        Module._load = oldLoad;
      }
      assert.equal(rejected, true,
        'task3 import policy runtime negative corpus case ' + entry[0]);
    });
    var events = task3EventsModule();
    assert.deepEqual(Object.keys(events).sort(), [
      'canonicalExternalStatus',
      'deriveExternalJobs',
      'derivePvpMatchId',
      'externalKey',
      'jobFromRef',
      'sameExternalRef',
      'stableFleetRef',
      'stableMissileRef'
    ].sort());
    assert.deepEqual(events.deriveExternalJobs(11, task3FreshState(220),
      function () { return null; }), []);
  });

test('G.chay defers the action closure when preaction tick is partial',
  function () {
    var st = task3FreshState(230);
    var oldTick = G.tick;
    var oldGiay = G.giay;
    var oldAction = G.HANHDONG.__task3Partial;
    var ran = false;
    try {
      G.giay = function () { return 231; };
      G.tick = function () { return task3TickOutcomePartial(230); };
      G.HANHDONG.__task3Partial = function () { ran = true; return null; };
      var result = G.chay(st, '__task3Partial', {});
      assert.deepEqual(result, G.TICK_PARTIAL,
        'task3 G.chay must convert budget exhaustion to the local sentinel');
      assert.equal(ran, false,
        'task3 G.chay must not run action closure while budget exhausted');

      G.tick = function () {
        return {
          processed: 0,
          advancedToS: 230,
          nextDueAtS: 230,
          hasMoreDue: true,
          budgetExhausted: false,
          blockedExternal: {code: 'BLOCKED_EXTERNAL', atS: 230, ref: {kind: 'fleet'}}
        };
      };
      result = G.chay(st, '__task3Partial', {});
      assert.deepEqual(result, G.TICK_PARTIAL,
        'task3 G.chay must convert blockedExternal to the local sentinel');
      assert.equal(ran, false,
        'task3 G.chay must not run action closure while blockedExternal');

      var target = {g: 1, h: 5, p: 5};
      var targetKey = G.tdKey(target);
      var realExternal = task3FreshState(230);
      realExternal.fleets.push(task3Fleet({
        id: 93,
        den: target,
        mission: 'attack',
        diLuc: 230,
        den_t: 231
      }));
      var beforeRealExternal = JSON.stringify(realExternal.fleets);
      var receivedTickArgs = null;
      G.tick = function (receivedState, targetS) {
        receivedTickArgs = {state: receivedState, targetS: targetS};
        return oldTick(receivedState, targetS, {
          remainingBudget: {value: 1},
          multiplayer: true,
          ownerAccountId: 11,
          targetAccountForKey: function (key) { return key === targetKey ? 22 : null; }
        });
      };
      ran = false;
      result = task3WithHook(task3PlayerHook(targetKey, 22), function () {
        return G.chay(realExternal, '__task3Partial', {});
      });
      assert.equal(receivedTickArgs && receivedTickArgs.state, realExternal,
        'task3 G.chay real external fixture must pass the same state to G.tick');
      assert.equal(receivedTickArgs && receivedTickArgs.targetS, 231,
        'task3 G.chay real external fixture must pass G.giay target to G.tick');
      assert.deepEqual(result, G.TICK_PARTIAL,
        'task3 G.chay real external fixture must convert real blockedExternal');
      assert.equal(ran, false,
        'task3 G.chay real external fixture must not run action closure');
      assert.equal(JSON.stringify(realExternal.fleets), beforeRealExternal,
        'task3 G.chay real external fixture must leave external fleet unmutated');

      G.tick = function () { return G.TICK_PARTIAL; };
      assert.throws(function () {
        G.chay(st, '__task3Partial', {});
      }, /TICK_SENTINEL_FROM_TICK_INVALID/,
      'task3 G.chay must reject illegal sentinel returns from G.tick');
      assert.equal(ran, false);
    } finally {
      G.tick = oldTick;
      G.giay = oldGiay;
      if (oldAction === undefined) delete G.HANHDONG.__task3Partial;
      else G.HANHDONG.__task3Partial = oldAction;
    }
  });

test('local APP.lam validates input and serializes TickOutcome continuations',
  async function () {
    var f = task3LocalBrowserFixture();
    var browserKeys = [
      'window', 'document', 'localStorage', 'setTimeout', 'setInterval', 'fetch',
      'navigator', 'location', 'confirm', 'FileReader', 'Blob', 'URL'
    ];
    var beforeDescriptors = {};
    browserKeys.forEach(function (key) {
      beforeDescriptors[key] = Object.getOwnPropertyDescriptor(global, key);
    });
    await task3WithBrowser(f.win, async function () {
      task3RequireBrowserFile('js/main.js');
      var callbacks = [];
      var upgradeCalls = 0;
      var laTickPartialCalls = 0;
      var tickOutcomeBridgeCalls = 0;
      var oldUpgrade = f.win.G.nangCapState;
      var oldLaTickPartial = f.win.G.laTickPartial;
      var oldTickOutcomeNeedsDeferral = f.win.G.tickOutcomeNeedsDeferral;
      f.win.G.nangCapState = function () {
        upgradeCalls += 1;
        return oldUpgrade.apply(this, arguments);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        tickOutcomeBridgeCalls += 1;
        return oldTickOutcomeNeedsDeferral.call(this, value);
      };
      f.actionResults.splice(0, f.actionResults.length, null, null, null);
      f.win.APP.lam('bad action name over twenty four chars', {}, function (err) {
        callbacks.push(err);
      });
      f.win.APP.lam('docHet', [], function (err) { callbacks.push(err); });
      f.win.APP.lam('abcdefghijklmnopqrstuvwxy', {}, function (err) {
        callbacks.push('name25:' + err);
      });
      f.win.APP.lam('abcdefghijklmnopqrstuvwx', {}, function (err) {
        callbacks.push('name24:' + err);
      });
      f.win.APP.lam('docHet', function () {}, function (err) {
        callbacks.push('function:' + err);
      });
      f.win.APP.lam('docHet', new Date(0), function (err) {
        callbacks.push('date:' + err);
      });
      var customPayload = Object.create({x: 1});
      customPayload.ok = true;
      f.win.APP.lam('docHet', customPayload, function (err) {
        callbacks.push('custom:' + err);
      });
      assert.deepEqual(callbacks, [
        'Hành động không hợp lệ.',
        'Dữ liệu hành động không hợp lệ.',
        'name25:Hành động không hợp lệ.',
        'name24:null',
        'function:Dữ liệu hành động không hợp lệ.',
        'date:Dữ liệu hành động không hợp lệ.',
        'custom:Dữ liệu hành động không hợp lệ.'
      ], 'task3 local invalid action/data validation must reject before G.chay');
      assert.equal(f.counters.actions, 1,
        'task3 exact 24-char action name must execute while invalid inputs do not');
      assert.equal(upgradeCalls, 0,
        'task3 invalid local input must not call G.nangCapState before validation');
      f.actionResults.splice(0, f.actionResults.length, null);
      assert.doesNotThrow(function () {
        f.win.APP.lam('docHet', {}, 'not-a-callback');
      });
      assert.equal(f.counters.actions, 2);
      assert.equal(f.timers.length, 0);

      f.effects.splice(0, f.effects.length);
      f.actionResults.splice(0, f.actionResults.length,
        {deferred: true, code: 'TICK_PARTIAL'}, null, null);
      f.win.APP.lam('docHet', {}, function (err) { callbacks.push(err); });
      f.win.APP.lam('docHet', {}, function (err) { callbacks.push('second:' + err); });
      assert.equal(callbacks.length, 7,
        'task3 partial action must defer callback while invalid callbacks stay recorded');
      assert.equal(f.timers.length, 1,
        'task3 partial action must schedule exactly one continuation');
      assert.ok(f.saves.length >= 1);
      assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
      f.timers.shift()();
      await task3FlushUntilSettled(function () {
        return callbacks.length === 9;
      }, 'local APP.lam queued callbacks');
      assert.deepEqual(callbacks.slice(7), [null, 'second:null']);
      assert.equal(f.counters.actions, 5);
      assert.equal(laTickPartialCalls > 0, true,
        'task3 local APP.lam must consult G.laTickPartial for structural sentinels');
      assert.equal(tickOutcomeBridgeCalls, 0,
        'task3 local APP.lam action path must not use TickOutcome bridge directly');
      assert.ok(f.saves.length >= 1);
    });
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 browser descriptor restored after success for ' + key);
    });
    await assert.rejects(task3WithBrowser(f.win, async function () {
      throw new Error('TASK3_BROWSER_BODY_FAILURE');
    }), /TASK3_BROWSER_BODY_FAILURE/);
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 browser descriptor restored after failure for ' + key);
    });
  });

test('local APP.lam caps one action at 1000 partial continuations',
  async function () {
    var f = task3LocalBrowserFixture();
    await task3WithBrowser(f.win, async function () {
      task3RequireBrowserFile('js/main.js');
      f.elements['kd-batdau'].onclick();
      assert.equal(f.timers.length, 1,
        'task3 local cap private ST startup must schedule the first continuation');
      f.timers.shift()();
      await task3FlushUntilSettled(function () {
        return f.counters.ticks === 2;
      }, 'local cap private ST startup');
      f.effects.splice(0, f.effects.length);
      f.saves.splice(0, f.saves.length);
      f.timers.splice(0, f.timers.length);
      f.counters.actions = 0;
      f.win.G.chay = function (st) {
        f.counters.actions += 1;
        st.capMarker = f.counters.actions;
        return f.win.G.TICK_PARTIAL;
      };
      var callbacks = [];
      f.win.APP.lam('docHet', {}, function (err) { callbacks.push(err); });
      for (var i = 0; i < 999; i += 1) {
        assert.equal(f.timers.length, 1,
          'task3 1000-cap action must keep one pending timer before cap');
        f.timers.shift()();
        assert.equal(callbacks.length, 0,
          'task3 1000-cap action must not callback before exact cap');
      }
      var savesBeforeCap = f.saves.length;
      assert.equal(f.timers.length, 1,
        'task3 1000-cap action must enter the exact cap with one timer');
      f.timers.shift()();
      assert.deepEqual(callbacks, ['Tua thời gian quá dài, hãy thử lại.'],
        'task3 1000-cap action must callback once with the cap error');
      assert.equal(f.saves.length, savesBeforeCap + 1,
        'task3 1000-cap action must save the latest partial state at cap');
      assert.equal(JSON.parse(f.saves[f.saves.length - 1][1]).capMarker,
        f.counters.actions,
        'task3 1000-cap latest save must contain the exact final partial marker');
      assert.equal(f.timers.length, 0,
        'task3 1000-cap action must not schedule another timer after cap');
    });
  });

test('local startup partial tick schedules one macrotask continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    await task3WithBrowser(f.win, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = f.win.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = f.win.G.laTickPartial;
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/main.js');
        f.effects.splice(0, f.effects.length);
        f.elements['kd-batdau'].onclick();
        assert.equal(f.counters.ticks, 1);
        assert.equal(bridgeCalls, 1,
          'task3 startup must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(f.timers.length, 1,
          'task3 startup partial tick must schedule one macrotask continuation');
        assert.ok(f.saves.length >= 1);
        assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
        f.timers.shift()();
        await task3FlushUntilSettled(function () {
          return f.counters.ticks === 2;
        }, 'startup partial continuation completion');
        assert.equal(bridgeCalls, 2,
          'task3 startup must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 startup bridge must use G.laTickPartial for frozen sentinel checks');
        assert.ok(f.saves.length >= 1);
      } finally {
        f.win.G.tickOutcomeNeedsDeferral = oldBridge;
        f.win.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('local paste import schedules a partial checkpoint before continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    await task3WithBrowser(f.win, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = f.win.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = f.win.G.laTickPartial;
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/main.js');
        assert.equal(f.elements['nhap-js'].id, 'nhap-js',
          'task3 paste import fixture must precreate nhap-js');
        f.effects.splice(0, f.effects.length);
        f.elements['nhap-js'].value = JSON.stringify(f.state);
        f.win.APP.ACT['nhap-ok']();
        assert.equal(f.counters.ticks, 1);
        assert.equal(bridgeCalls, 1,
          'task3 paste import must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(f.timers.length, 1,
          'task3 paste import partial checkpoint must schedule one continuation');
        assert.ok(f.saves.length >= 1);
        assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
        f.timers.shift()();
        await task3FlushUntilSettled(function () {
          return f.counters.ticks === 2;
        }, 'paste import partial continuation completion');
        assert.equal(bridgeCalls, 2,
          'task3 paste import must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 paste import bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        f.win.G.tickOutcomeNeedsDeferral = oldBridge;
        f.win.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('local file import schedules a partial checkpoint before continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    var readerInstance = null;
    f.win.FileReader = function () {
      readerInstance = this;
      this.readAsText = function () {
        this.result = JSON.stringify(f.state);
        this.onload();
      };
    };
    await task3WithBrowser(f.win, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = f.win.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = f.win.G.laTickPartial;
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/main.js');
        f.effects.splice(0, f.effects.length);
        f.win.APP.doiFile({target: {id: 'file-nhap', files: [{name: 'save.json'}]}});
        assert.ok(readerInstance);
        assert.equal(f.counters.ticks, 1);
        assert.equal(bridgeCalls, 1,
          'task3 file import must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(f.timers.length, 1,
          'task3 file import partial checkpoint must schedule one continuation');
        assert.ok(f.saves.length >= 1);
        assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
        f.timers.shift()();
        await task3FlushUntilSettled(function () {
          return f.counters.ticks === 2;
        }, 'file import partial continuation completion');
        assert.equal(bridgeCalls, 2,
          'task3 file import must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 file import bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        f.win.G.tickOutcomeNeedsDeferral = oldBridge;
        f.win.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('shared heartbeat interval schedules exactly one partial continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    var heartbeatElements = {};
    var heartbeatTimers = [];
    var heartbeatIntervals = [];
    var heartbeatWin = {
      document: task3Document(heartbeatElements),
      setTimeout: function (fn) { heartbeatTimers.push(fn); return heartbeatTimers.length; },
      setInterval: function (fn) { heartbeatIntervals.push(fn); return heartbeatIntervals.length; },
      G: f.win.G,
      U: f.win.U,
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    };
    heartbeatWin.window = heartbeatWin;
    heartbeatWin.ST = f.state;
    await task3WithBrowser(heartbeatWin, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = heartbeatWin.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = heartbeatWin.G.laTickPartial;
      heartbeatWin.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      heartbeatWin.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/app.js');
        heartbeatWin.APP.batDauNhip();
        assert.equal(heartbeatIntervals.length, 1);
        heartbeatIntervals[0]();
        assert.equal(bridgeCalls, 1,
          'task3 heartbeat must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(heartbeatTimers.length, 1,
          'task3 heartbeat partial tick must schedule exactly one continuation');
        heartbeatTimers.shift()();
        assert.equal(f.counters.ticks, 2);
        assert.equal(bridgeCalls, 2,
          'task3 heartbeat must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 heartbeat bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        heartbeatWin.G.tickOutcomeNeedsDeferral = oldBridge;
        heartbeatWin.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('visibility heartbeat does not duplicate an already pending continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    var heartbeatElements = {};
    var heartbeatTimers = [];
    var heartbeatIntervals = [];
    var heartbeatWin = {
      document: task3Document(heartbeatElements),
      setTimeout: function (fn) { heartbeatTimers.push(fn); return heartbeatTimers.length; },
      setInterval: function (fn) { heartbeatIntervals.push(fn); return heartbeatIntervals.length; },
      G: f.win.G,
      U: f.win.U,
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    };
    heartbeatWin.window = heartbeatWin;
    heartbeatWin.ST = f.state;
    await task3WithBrowser(heartbeatWin, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = heartbeatWin.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = heartbeatWin.G.laTickPartial;
      heartbeatWin.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      heartbeatWin.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/app.js');
        heartbeatWin.APP.batDauNhip();
        assert.equal(heartbeatIntervals.length, 1);
        heartbeatIntervals[0]();
        assert.equal(bridgeCalls, 1,
          'task3 visibility flow must call G.tickOutcomeNeedsDeferral for the pending partial');
        assert.equal(heartbeatTimers.length, 1,
          'task3 visibility fixture must start with one pending continuation');
        heartbeatIntervals[0]();
        assert.equal(bridgeCalls, 1,
          'task3 second heartbeat interval must not tick while a continuation is pending');
        assert.equal(heartbeatTimers.length, 1,
          'task3 second heartbeat interval must not duplicate a pending continuation');
        heartbeatElements['event:visibilitychange']();
        assert.equal(bridgeCalls, 1,
          'task3 visibility event must not tick while interval continuation is pending');
        assert.equal(heartbeatTimers.length, 1,
          'task3 interval plus visibility overlap must not duplicate a pending continuation');
        heartbeatTimers.shift()();
        assert.equal(f.counters.ticks, 2);
        assert.equal(bridgeCalls, 2,
          'task3 visibility flow must call G.tickOutcomeNeedsDeferral for completion');
        f.tickOutcomes.push(task3TickOutcomePartial(240), task3TickOutcomeComplete(240));
        heartbeatElements['event:visibilitychange']();
        assert.equal(bridgeCalls, 3,
          'task3 visibility event after drain must call G.tickOutcomeNeedsDeferral again');
        assert.equal(heartbeatTimers.length, 1);
        heartbeatTimers.shift()();
        assert.equal(f.counters.ticks, 4);
        assert.equal(bridgeCalls, 4,
          'task3 visibility second continuation must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 visibility bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        heartbeatWin.G.tickOutcomeNeedsDeferral = oldBridge;
        heartbeatWin.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('MP startup and action transport code stay separate from the local sentinel',
  async function () {
    var base = task3LocalBrowserFixture();
    var mpCallbacks = [];
    var fetchCalls = [];
    var lamCalls = 0;
    var browserKeys = [
      'window', 'document', 'localStorage', 'setTimeout', 'setInterval', 'fetch',
      'navigator', 'location', 'confirm', 'FileReader', 'Blob', 'URL'
    ];
    var beforeDescriptors = {};
    browserKeys.forEach(function (key) {
      beforeDescriptors[key] = Object.getOwnPropertyDescriptor(global, key);
    });
    var lamReplies = [{
      ok: true,
      status: 200,
      body: {loi: 'Máy chủ đang đồng bộ (fulfilled).', code: 'TICK_PARTIAL'}
    }, {
      ok: false,
      status: 503,
      body: {loi: 'Máy chủ đang đồng bộ (rejected).', code: 'TICK_PARTIAL'}
    }];
    var mpElements = {};
    var mpWin = {
      document: task3Document(mpElements),
      localStorage: {
        getItem: function () { return 'tok'; },
        setItem: function () {},
        removeItem: function () {}
      },
      setTimeout: function () {},
      setInterval: function () {},
      fetch: function (url, opt) {
        fetchCalls.push({url: url, opt: opt || {}});
        if (url === '/api/lam') lamCalls += 1;
        var lamReply = lamReplies[Math.min(lamCalls - 1, lamReplies.length - 1)];
        return Promise.resolve({
          ok: url === '/api/lam' ? lamReply.ok : true,
          status: url === '/api/lam' ? lamReply.status : 200,
          json: function () {
            if (url === '/api/lam') {
              return Promise.resolve(lamReply.body);
            }
            if (url === '/api/state') return Promise.resolve({st: base.state});
            return Promise.resolve({now: 240, seed: 's', soNguoi: 1, soHT: 1, tocDo: 1, chuKy: 3600});
          }
        });
      },
      G: Object.assign({}, base.win.G, {
        MO_PHONG_NHE: false,
        LECH_GIO: 0,
        laTickPartial: function (value) {
          if (value && value.code === 'TICK_PARTIAL' && value.deferred !== true) {
            throw new Error('transport code used as local sentinel');
          }
          return !!value && value.deferred === true && value.code === 'TICK_PARTIAL';
        }
      }),
      U: Object.assign({}, base.win.U, {
        man: 'tongquan',
        pi: 0,
        sig: function () { return 'sig'; },
        sigCu: '',
        mpMoi: function () { return {}; }
      }),
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    };
    mpWin.window = mpWin;
    await task3WithBrowser(mpWin, async function () {
      task3RequireBrowserFile('web/js/mp.js');
      assert.equal(typeof mpWin.APP.batDauNhip, 'function',
        'task3 MP fixture must provide no-op batDauNhip');
      await task3FlushUntilSettled(function () {
        return fetchCalls.some(function (call) { return call.url === '/api/thongtin'; }) &&
          fetchCalls.some(function (call) { return call.url === '/api/state'; });
      }, 'MP startup thongtin and state fetches');
      assert.ok(fetchCalls.some(function (call) { return call.url === '/api/thongtin'; }));
      assert.ok(fetchCalls.some(function (call) { return call.url === '/api/state'; }));
      assert.equal(base.counters.ticks, 0);
      mpWin.APP.lam('docHet', {}, function (err, meta) {
        mpCallbacks.push({err: err, code: meta && meta.code});
      });
      assert.equal(mpCallbacks.length, 0,
        'task3 MP fulfilled-body partial callback must settle asynchronously');
      await task3FlushUntilSettled(function () {
        return mpCallbacks.length === 1;
      }, 'MP fulfilled-body TICK_PARTIAL callback');
      mpWin.APP.lam('docHet', {}, function (err, meta) {
        mpCallbacks.push({err: err, code: meta && meta.code});
      });
      assert.equal(mpCallbacks.length, 1,
        'task3 MP rejected-error partial callback must settle asynchronously');
      await task3FlushUntilSettled(function () {
        return mpCallbacks.length === 2;
      }, 'MP rejected-error TICK_PARTIAL callback');
      assert.deepEqual(mpCallbacks, [{
        err: 'Máy chủ đang đồng bộ (fulfilled).',
        code: 'TICK_PARTIAL'
      }, {
        err: 'Máy chủ đang đồng bộ (rejected).',
        code: 'TICK_PARTIAL'
      }], 'task3 MP partial callbacks must distinguish fulfilled body and rejected error');
      assert.equal(fetchCalls.filter(function (call) {
        return call.url === '/api/lam';
      }).length, 2);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(mpCallbacks.length, 2,
        'task3 MP test must await all action callback microtasks before descriptor restore');
      var fetchCountBeforeRestore = fetchCalls.length;
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(fetchCalls.length, fetchCountBeforeRestore,
        'task3 MP success path must have no async fetch leak before descriptor restore');
      assert.equal(base.counters.ticks, 0);
    });
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 MP browser descriptor restored after success for ' + key);
    });
    var failFetchCalls = [];
    var failElements = {};
    var failWin = Object.assign({}, mpWin, {
      document: task3Document(failElements),
      fetch: function (url, opt) {
        failFetchCalls.push({url: url, opt: opt || {}});
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () {
            if (url === '/api/state') return Promise.resolve({st: base.state});
            return Promise.resolve({now: 240, seed: 's', soNguoi: 1, soHT: 1, tocDo: 1, chuKy: 3600});
          }
        });
      },
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    });
    failWin.window = failWin;
    await assert.rejects(task3WithBrowser(failWin, async function () {
      task3RequireBrowserFile('web/js/mp.js');
      await task3FlushUntilSettled(function () {
        return failFetchCalls.some(function (call) { return call.url === '/api/thongtin'; }) &&
          failFetchCalls.some(function (call) { return call.url === '/api/state'; });
      }, 'MP failure startup thongtin and state fetches');
      var failFetchCountBeforeThrow = failFetchCalls.length;
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(failFetchCalls.length, failFetchCountBeforeThrow,
        'task3 MP failure path must have no async fetch leak before descriptor restore');
      throw new Error('TASK3_MP_BODY_FAILURE');
    }), /TASK3_MP_BODY_FAILURE/);
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 MP browser descriptor restored after failure for ' + key);
    });
  });

function task4Rows(kho) {
  function all(sql) { return kho.db.prepare(sql).all(); }
  return {
    config: all('SELECT * FROM cauhinh ORDER BY k'),
    accounts: all('SELECT * FROM tk ORDER BY id'),
    dq: all('SELECT * FROM dq ORDER BY tk'),
    sessions: all('SELECT * FROM phien ORDER BY token'),
    alliances: all('SELECT * FROM lm ORDER BY ten'),
    allianceRequests: all('SELECT * FROM lm_xin ORDER BY lm,tk'),
    wars: all('SELECT * FROM chien ORDER BY id'),
    chat: all('SELECT * FROM chat ORDER BY id'),
    bulletins: all('SELECT * FROM bangtin ORDER BY id'),
    battles: all('SELECT * FROM tran ORDER BY id'),
    npc: all('SELECT * FROM npc ORDER BY key'),
    debris: all('SELECT * FROM pl ORDER BY td'),
    sqliteSequence: all('SELECT * FROM sqlite_sequence ORDER BY name'),
    jobs: all('SELECT * FROM event_jobs ORDER BY scheduled_at_s,priority,sequence,id'),
    applications: all('SELECT * FROM event_applications ORDER BY job_id,effective_at_s'),
    audit: all('SELECT * FROM scheduler_audit ORDER BY id'),
    meta: all('SELECT * FROM scheduler_meta ORDER BY key'),
    lease: all('SELECT * FROM scheduler_lease ORDER BY lease_name'),
    cutover: all('SELECT * FROM scheduler_cutover_snapshot ORDER BY snapshot_id'),
    ht: all('SELECT * FROM ht ORDER BY td'),
    hamdang: all('SELECT * FROM hamdang ORDER BY tkA,fid'),
    hamgiu: all('SELECT * FROM hamgiu ORDER BY tkA,fid')
  };
}

function task4Mutation(leaseToken, clock, extra) {
  return Object.assign({
    leaseToken: leaseToken,
    remainingBudget: {value: 50_000},
    effectiveNowMs: clock.nowMs()
  }, extra || {});
}

function task4AccountWakes(kho, accountId) {
  return kho.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state IN ('PENDING','RETRY_WAIT','RUNNING') ORDER BY sequence,id"
  ).all(String(accountId));
}

// Reconciliation is deliberately not an ordinary ACCOUNT_ADVANCE fixture: the
// accepted Task-2 API owns its canonical nonce and requires priority 200.
function task4ReconcileWake(x, lease, accountId, scheduledAtS) {
  var revision = Number(x.kho.db.prepare('SELECT revision FROM dq WHERE tk=?').get(accountId).revision);
  return x.store.scheduleReconcileAccountAdvance(lease, {
    kind: 'ACCOUNT_ADVANCE', aggregateType: 'account', aggregateId: String(accountId),
    expectedRevision: -1, scheduledAtS: scheduledAtS, priority: 200, maxAttempts: 8,
    payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: scheduledAtS,
      reconcile: true, reconcileRevision: revision}
  }, x.clock.nowMs());
}

function task4Batch(x, mutation, fn) {
  var value, receipts, success = false;
  function execute() {
    x.world.batDau();
    try { value = fn(); success = true; }
    finally { receipts = x.world.ketThuc(success); }
  }
  if (typeof x.world.trongMutationScheduler === 'function') {
    x.world.trongMutationScheduler(mutation, execute);
  } else execute();
  return {value: value, receipts: receipts};
}

function task4Delete(x, mutation, accountId, displayName) {
  // RED fixture fallback is deliberately transparent: absence of the new active
  // API must not prevent every deletion body from reaching its real World call.
  if (typeof x.world.trongMutationScheduler !== 'function') {
    return x.world.xoaTaiKhoan(accountId, displayName, {mutation: mutation});
  }
  x.task4ActiveDeleteMutations = x.task4ActiveDeleteMutations || [];
  return x.world.trongMutationScheduler(mutation, function () {
    x.task4ActiveDeleteMutations.push(mutation);
    return x.world.xoaTaiKhoan(accountId, displayName, {mutation: mutation});
  });
}

function task4CanonicalReadTrace(x) {
  var prepare = x.kho.db.prepare, reads = 0, restores = [];
  function wrap(statement) {
    if (!statement || statement.__task4ReadTrace) return statement;
    ['get', 'all', 'iterate'].forEach(function (name) {
      if (typeof statement[name] !== 'function') return;
      var original = statement[name];
      statement[name] = function () { reads++; return original.apply(this, arguments); };
      restores.push(function () { statement[name] = original; });
    });
    statement.__task4ReadTrace = true;
    restores.push(function () { delete statement.__task4ReadTrace; });
    return statement;
  }
  x.kho.db.prepare = function () { return wrap(prepare.apply(this, arguments)); };
  Object.keys(x.kho.q || {}).forEach(function (key) { wrap(x.kho.q[key]); });
  return {count: function () { return reads; }, restore: function () {
    x.kho.db.prepare = prepare;
    restores.reverse().forEach(function (restore) { restore(); });
  }};
}

function task4AssertActiveDelete(x, mutation, marker) {
  if (typeof x.world.trongMutationScheduler === 'function') {
    assert.strictEqual(x.task4ActiveDeleteMutations.at(-1), mutation, marker);
  }
}

// This probe is deliberately transparent until the final private World fence.
// It rejects *any* following durable write (including account/alliance/chat/
// bulletin/projection/scheduler rows), and can then make just that fence stale.
function task4FinalFenceProbe(x, mutation, tag, staleAtFence) {
  var installed = x.world._assertSchedulerFinalFence, original = installed, calls = 0,
    prepare = x.kho.db.prepare, seen = false;
  // RED must enter production first.  This fallback records a missing hook only
  // when the exercised deletion/save/creation fails to invoke it before commit.
  if (typeof original !== 'function') original = function () {};
  x.kho.db.exec('CREATE TEMP TABLE task4_final_fence_probe ' +
    '(seen INTEGER NOT NULL, allow_lease_flip INTEGER NOT NULL);' +
    'INSERT INTO task4_final_fence_probe VALUES (0,0);');
  ['cauhinh', 'dq', 'ht', 'hamdang', 'hamgiu', 'event_jobs', 'event_applications',
    'scheduler_meta', 'scheduler_audit', 'scheduler_lease', 'scheduler_cutover_snapshot',
    'tk', 'phien', 'lm', 'lm_xin', 'chien', 'chat', 'bangtin', 'tran', 'npc', 'pl'].forEach(function (table) {
    ['INSERT', 'UPDATE', 'DELETE'].forEach(function (event) {
      x.kho.db.exec('CREATE TEMP TRIGGER task4_after_final_' + table + '_' + event.toLowerCase() +
        ' AFTER ' + event + ' ON ' + table +
        ' WHEN (SELECT seen FROM task4_final_fence_probe)=1' +
        (table === 'scheduler_lease' ? ' AND (SELECT allow_lease_flip FROM task4_final_fence_probe)=0' : '') +
        ' BEGIN ' +
        "SELECT RAISE(ABORT,'TASK4_RED_WRITE_AFTER_FINAL_FENCE'); END;");
    });
  });
  x.world._assertSchedulerFinalFence = function (given) {
    assert.strictEqual(given, mutation, tag + '_MUTATION');
    calls++;
    seen = true;
    x.kho.db.prepare('UPDATE task4_final_fence_probe SET seen=1,allow_lease_flip=?')
      .run(staleAtFence ? 1 : 0);
    if (staleAtFence) x.kho.db.prepare(
      "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
    ).run();
    x.kho.db.prepare('UPDATE task4_final_fence_probe SET allow_lease_flip=0').run();
    return original.call(this, given);
  };
  // SQLite does not permit a trigger on its `sqlite_sequence` system table.
  // The transparent prepare guard covers direct sequence writes after the fence;
  // ordinary event-job sequence allocation remains before the fence and snapshots it.
  x.kho.db.prepare = function (sql) {
    if (seen && /\bsqlite_sequence\b/i.test(String(sql))) {
      throw new Error('TASK4_RED_WRITE_AFTER_FINAL_FENCE');
    }
    return prepare.apply(this, arguments);
  };
  return {finish: function () {
    x.world._assertSchedulerFinalFence = installed;
    x.kho.db.prepare = prepare;
    assert.equal(calls, 1, tag + '_HOOK');
  }};
}

function task4Fixture(t) {
  var x = taoStoreTam(fakeClock(NOW_MS));
  var world = new TheGioi(x.kho, {clock: x.clock});
  function addAccount(id, name) {
    x.kho.q.tkThem.run('task4-' + id, name, PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
    assert.equal(Number(x.kho.q.tkTheoTen.get('task4-' + id).id), id);
    var created = world.taoDeQuoc(id, name);
    assert.ok(created.st && created.nha, 'real empire fixture ' + id);
  }
  addAccount(1, 'Task4 A');
  addAccount(2, 'Task4 B');
  x.world = world;
  x.state = function (id) {
    var loaded = world.nap(id);
    assert.ok(loaded && loaded.st, 'canonical state ' + id);
    return loaded.st;
  };
  x.globalFor = function (sourceId, targetId, scheduledAtS, targetKey) {
    var ref = {kind: 'fleet', ownerAccountId: sourceId, fleetId: 91, launchAtS: 1,
      targetKey: targetKey || G.tdKey(x.state(targetId).planets[0].c),
      arrivalAtS: scheduledAtS, mission: 'attack'};
    var matchId = fixtureMatchId(ref, targetId);
    return job('pvp-resolve:' + matchId + ':' + scheduledAtS, scheduledAtS, 50, {
      kind: 'PVP_RESOLVE', aggregateType: 'match', aggregateId: matchId,
      expectedRevision: null, sourceAccountId: sourceId,
      payload: {schemaVersion: 1, matchId: matchId, ref: ref}
    });
  };
  x.globalForRef = function (ref, targetId) {
    var matchId = fixtureMatchId(ref, targetId);
    return job('pvp-resolve:' + matchId + ':' + ref.arrivalAtS, ref.arrivalAtS, 50, {
      kind: 'PVP_RESOLVE', aggregateType: 'match', aggregateId: matchId,
      expectedRevision: null, sourceAccountId: ref.ownerAccountId,
      payload: {schemaVersion: 1, matchId: matchId, ref: ref}
    });
  };
  t.after(x.dong);
  return x;
}

function task4InstallScheduler(x) {
  if (typeof x.world.datScheduler === 'function') x.world.datScheduler(x.store);
}

function task4LiveInboundRoot(x, lease, arrivalOffsetS, redTag) {
  var events = require('../server/scheduler/events.js');
  var source = x.state(1), target = x.state(2).planets[0].c;
  var targetKey = G.tdKey(target);
  assert.ok(Number.isSafeInteger(arrivalOffsetS) && arrivalOffsetS > 0,
    (redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED') + ':OFFSET');
  var arrivalAtS = source.lastTick + arrivalOffsetS;
  assert.ok(Number.isSafeInteger(arrivalAtS) && source.lastTick <= arrivalAtS,
    (redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED') + ':CHRONOLOGY');
  source.fleets.push({
    id: 91, pi: 0, tu: source.planets[0].c, den: target, mission: 'attack',
    pha: 'di', diLuc: source.lastTick, den_t: arrivalAtS,
    ships: {cargoS: 1}, cargo: {}
  });
  var derived = events.deriveExternalJobs(1, source, function (key) {
    return key === targetKey ? 2 : null;
  });
  assert.equal(derived.length, 1, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(derived[0].scheduledAtS, arrivalAtS, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  var mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, source, {mutation: mutation});
  });
  var rows = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(rows.length, 1, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(rows[0].logical_key, derived[0].idempotencyKey, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(rows[0].canonical_ref.launchAtS, source.lastTick, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(rows[0].canonical_ref.arrivalAtS, arrivalAtS, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(events.canonicalExternalStatus(x.kho, rows[0].canonical_ref), 'EXACT',
    redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  return {root: x.store.getById(rows[0].logical_root_id), targetKey: targetKey, arrivalAtS: arrivalAtS};
}

function task4SeedRollbackWitnesses(x) {
  x.kho.q.cauhinhSet.run('task4-rollback-witness', 'present');
  x.kho.q.npcSet.run('1:99:1', JSON.stringify({ten: 'Task4 witness'}), NOW_S);
  x.kho.q.plSet.run('1:99:1', 7, 11);
  x.kho.q.tranThem.run(NOW_S, 1, 2, '1:99:1', 'task4-witness', 0, 0, 0);
}

test('Task 4 exposes scheduler-aware world contracts before behavior tests', function (t) {
  var x = task4Fixture(t);
  assert.equal(typeof x.world.datScheduler, 'function', 'TASK4_RED_WORLD_DAT_SCHEDULER');
  assert.equal(typeof x.world.datAdvanceService, 'function', 'TASK4_RED_WORLD_ADVANCE_SERVICE');
  assert.equal(typeof x.world.trongMutationScheduler, 'function', 'TASK4_RED_WORLD_MUTATION_GATE');
  assert.equal(typeof x.world.advanceAccountNoiBo, 'function', 'TASK4_RED_WORLD_ADVANCE_ABI');
  assert.throws(function () { x.world.datScheduler(null); }, /SCHEDULER_STORE_INVALID/);
  assert.throws(function () { x.world.datScheduler({}); }, /SCHEDULER_STORE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService(null); }, /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService({}); }, /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService({advanceTo: null}); }, /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService({advanceTo: function () { return null; }}); },
    /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  x.world.datScheduler(x.store);
  assert.doesNotThrow(function () { x.world.datScheduler(x.store); }, 'TASK4_RED_WORLD_STORE_IDEMPOTENT');
  var replacementStore = Object.assign(Object.create(Object.getPrototypeOf(x.store)), x.store);
  assert.throws(function () { x.world.datScheduler(replacementStore); }, /SCHEDULER_STORE_ALREADY_INSTALLED/);
  var advanceCalls = [];
  var advanceService = {
    advanceTo: function (mutation, accountId, targetS, saveOptions) {
      advanceCalls.push([mutation, accountId, targetS, saveOptions]);
      return {processed: 0, advancedToS: targetS, nextDueAtS: null, hasMoreDue: false,
        budgetExhausted: mutation.remainingBudget.value === 0};
    }
  };
  x.world.datAdvanceService(advanceService);
  assert.doesNotThrow(function () { x.world.datAdvanceService(advanceService); }, 'TASK4_RED_WORLD_SERVICE_IDEMPOTENT');
  assert.throws(function () {
    x.world.datAdvanceService({advanceTo: function (mutation, accountId, targetS, saveOptions) { return null; }});
  }, /SCHEDULER_ADVANCE_SERVICE_ALREADY_INSTALLED/);
  var lease = layLease(x, '00000000-0000-4000-8000-000000000432');
  var before = task4Rows(x.kho), st = x.state(1), activeMutation = task4Mutation(lease, x.clock),
    wrongFirstMutation = task4Mutation(lease, x.clock);
  // Before any staging, a different first-save object and a nested active
  // context must both fail without even a canonical read or durable write.
  assert.throws(function () {
    x.world.trongMutationScheduler(activeMutation, function () {
      x.world.luu(1, st, {mutation: wrongFirstMutation});
    });
  }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_FIRST_SAVE_WRONG_OBJECT');
  assert.deepEqual(task4Rows(x.kho), before, 'TASK4_RED_FIRST_SAVE_WRONG_OBJECT');
  assert.throws(function () {
    x.world.trongMutationScheduler(activeMutation, function () {
      x.world.trongMutationScheduler(wrongFirstMutation, function () {
        x.world.luu(1, st, {mutation: wrongFirstMutation});
      });
    });
  }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_NESTED_MUTATION_OBJECT');
  assert.deepEqual(task4Rows(x.kho), before, 'TASK4_RED_NESTED_MUTATION_OBJECT');
  x.kho.q.tkThem.run('task4-invalid-creation', 'Task4 invalid creation', PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
  var invalidCreationId = Number(x.kho.q.tkTheoTen.get('task4-invalid-creation').id);
  var invalidBefore = task4Rows(x.kho), invalidReads = task4CanonicalReadTrace(x),
    invalidTransactions = 0, invalidTransaction = x.kho.trongGiaoDich, invalidReached = [];
  x.kho.trongGiaoDich = function () { invalidTransactions++; return invalidTransaction.apply(this, arguments); };
  function invokeAfterAdmission(name, invoke) {
    var mutation = task4Mutation(lease, x.clock);
    return x.world.trongMutationScheduler(mutation, function () {
      mutation.effectiveNowMs = -1;
      invalidReached.push(name);
      invoke(mutation);
    });
  }
  try {
    assert.throws(function () { invokeAfterAdmission('SAVE_NEGATIVE_EFFECTIVE_BEFORE_READ', function (mutation) {
      x.world.luu(1, st, {mutation: mutation});
    }); }, /SCHEDULER_MUTATION_INVALID/, 'TASK4_RED_SAVE_NEGATIVE_EFFECTIVE_BEFORE_READ');
    assert.throws(function () { invokeAfterAdmission('CREATION_NEGATIVE_EFFECTIVE_BEFORE_READ', function (mutation) {
      x.world.taoDeQuoc(invalidCreationId, 'Task4 invalid creation', {mutation: mutation});
    }); }, /SCHEDULER_MUTATION_INVALID/, 'TASK4_RED_CREATION_NEGATIVE_EFFECTIVE_BEFORE_READ');
    assert.throws(function () { invokeAfterAdmission('DELETE_NEGATIVE_EFFECTIVE_BEFORE_READ', function (mutation) {
      x.world.xoaTaiKhoan(2, 'B', {mutation: mutation});
    }); }, /SCHEDULER_MUTATION_INVALID/, 'TASK4_RED_DELETE_NEGATIVE_EFFECTIVE_BEFORE_READ');
  } finally {
    x.kho.trongGiaoDich = invalidTransaction;
    invalidReads.restore();
  }
  assert.equal(invalidReads.count(), 0, 'TASK4_RED_INVALID_MUTATION_BEFORE_READ');
  assert.equal(invalidTransactions, 0, 'TASK4_RED_INVALID_MUTATION_BEFORE_TRANSACTION');
  assert.deepEqual(task4Rows(x.kho), invalidBefore, 'TASK4_RED_INVALID_MUTATION_BEFORE_WRITE');
  assert.deepEqual(invalidReached, ['SAVE_NEGATIVE_EFFECTIVE_BEFORE_READ', 'CREATION_NEGATIVE_EFFECTIVE_BEFORE_READ',
    'DELETE_NEGATIVE_EFFECTIVE_BEFORE_READ'], 'TASK4_RED_INVALID_MUTATION_ENTRYPOINT_REACHED');
  before = invalidBefore;
  [null, {}, {leaseToken: {}}, {leaseToken: {ownerId: 'x', generation: 1}},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: null, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: -1}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1.5}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 50_001}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: '1'}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: Number.MAX_SAFE_INTEGER + 1},
      effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}, effectiveNowMs: -1},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}, effectiveNowMs: NaN},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}, effectiveNowMs: Infinity}
  ].forEach(function (mutation) {
    assert.throws(function () {
      x.world.trongMutationScheduler(mutation, function () { x.world.luu(1, st, {mutation: mutation}); });
    }, /SCHEDULER_MUTATION_(TOKEN_REQUIRED|INVALID)/);
  });
  assert.deepEqual(task4Rows(x.kho), before);
  var identityA = task4Mutation(lease, x.clock), identityB = task4Mutation(lease, x.clock),
    transactionCalls = 0, transaction = x.kho.trongGiaoDich, beforeIdentity = task4Rows(x.kho),
    beforeDepth = x.kho.transactionDepth, beforeRollbackOnly = x.kho.transactionRollbackOnly;
  // Cover every canonical statement surface xoa can reach, including a newly
  // prepared statement.  Rejected identity/context calls must fail before it.
  var deleteReadTrace = task4CanonicalReadTrace(x);
  x.kho.trongGiaoDich = function () { transactionCalls++; return transaction.apply(this, arguments); };
  try {
    assert.throws(function () {
      x.world.xoaTaiKhoan(2, 'B', {mutation: identityA});
    }, /SCHEDULER_MUTATION_TOKEN_REQUIRED/, 'TASK4_RED_DELETE_ACTIVE_MUTATION_REQUIRED');
    assert.throws(function () {
      x.world.trongMutationScheduler(identityA, function () {
        x.world.xoaTaiKhoan(2, 'B', {mutation: identityB});
      });
    }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_DELETE_MUTATION_IDENTITY');
  } finally {
    x.kho.trongGiaoDich = transaction;
    deleteReadTrace.restore();
  }
  assert.equal(deleteReadTrace.count(), 0, 'TASK4_RED_DELETE_BEFORE_READ');
  assert.equal(transactionCalls, 0, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.equal(x.kho.transactionDepth, beforeDepth, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.equal(x.kho.transactionRollbackOnly, beforeRollbackOnly, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.deepEqual(task4Rows(x.kho), beforeIdentity, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.equal(task4Delete(x, identityA, 2, 'B'), null, 'TASK4_RED_DELETE_SAME_MUTATION_IDENTITY');
  task4AssertActiveDelete(x, identityA, 'TASK4_RED_DELETE_SAME_MUTATION_IDENTITY');
  var checkpoint = x.state(1);
  checkpoint.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: checkpoint.lastTick + 1});
  var exhaustedBudget = {value: 1};
  var partial = G.tick(checkpoint, checkpoint.lastTick + 1, {
    ownerAccountId: 1, remainingBudget: exhaustedBudget
  });
  assert.equal(partial.processed, 1, 'Task-3 final primitive is actually consumed');
  assert.equal(exhaustedBudget.value, 0, 'Task-3 leaves the same context at zero');
  var zeroMutation = task4Mutation(lease, x.clock, {remainingBudget: exhaustedBudget});
  task4Batch(x, zeroMutation, function () {
    x.world.luu(1, checkpoint, {mutation: zeroMutation});
  });
  assert.equal(Number(x.kho.db.prepare('SELECT revision FROM dq WHERE tk=1').get().revision), 1,
    'TASK4_RED_ZERO_BUDGET_CHECKPOINT');
  assert.strictEqual(zeroMutation.remainingBudget, exhaustedBudget);
  assert.equal(exhaustedBudget.value, 0);
  var zeroSaveOptions = {currentAccountAdvanceJobId: null, deferAccountWake: true};
  var outcome = x.world.trongMutationScheduler(zeroMutation, function () {
    return x.world.advanceAccountNoiBo(zeroMutation, 1, checkpoint.lastTick + 1, zeroSaveOptions);
  });
  assert.strictEqual(advanceCalls[0][0], zeroMutation);
  assert.deepEqual(advanceCalls[0].slice(1), [1, checkpoint.lastTick + 1, zeroSaveOptions]);
  assert.equal(outcome.budgetExhausted, true);
});

test('Task 4 reaches every scheduler surface and mutation-first ABI call in RED', function (t) {
  var x = task4Fixture(t), calls = [], activeCalls = [], failures = [], insideActiveCallback = false;
  var lease = layLease(x, '00000000-0000-4000-8000-000000000436');
  var mutation = task4Mutation(lease, x.clock, {remainingBudget: {value: 0}});
  function attempt(name, fn) {
    try { fn(); } catch (error) { failures.push(name + ':' + error.message); }
  }
  attempt('datScheduler', function () { x.world.datScheduler(x.store); });
  attempt('datAdvanceService', function () {
    x.world.datAdvanceService({advanceTo: function (m, accountId, targetS, saveOptions) {
      calls.push([m, accountId, targetS, saveOptions]);
      activeCalls.push(insideActiveCallback);
      return {budgetExhausted: true};
    }});
  });
  attempt('trongMutationScheduler+advanceAccountNoiBo', function () {
    x.world.trongMutationScheduler(mutation, function () {
      insideActiveCallback = true;
      try {
        // This is deliberately before luu: an initial missing save surface may
        // not make the frozen mutation-first delegation vacuous.
        x.world.advanceAccountNoiBo(mutation, 1, x.state(1).lastTick, {deferAccountWake: true});
        x.world.luu(1, x.state(1), {mutation: mutation});
      } finally { insideActiveCallback = false; }
    });
  });
  // Collect rather than throw after each check: all four calls and each ABI
  // check run even while the initial RED lacks every Task-4 surface.
  var contractFailures = [];
  if (failures.length !== 0) contractFailures.push('TASK4_RED_ALL_SURFACES_REACHED:' + failures.join('|'));
  if (calls.length !== 1) contractFailures.push('TASK4_RED_ABI_EXACT_ONCE:' + calls.length);
  if (calls.length === 1 && calls[0][0] !== mutation) {
    contractFailures.push('TASK4_RED_ABI_ARGUMENT_ORDER:mutation');
  }
  if (calls.length === 1 && JSON.stringify(calls[0].slice(1)) !==
      JSON.stringify([1, x.state(1).lastTick, {deferAccountWake: true}])) {
    contractFailures.push('TASK4_RED_ABI_ARGUMENT_ORDER:args');
  }
  if (calls.length === 1 && activeCalls[0] !== true) {
    contractFailures.push('TASK4_RED_ABI_ACTIVE_CALLBACK_REQUIRED');
  }
  if (insideActiveCallback) contractFailures.push('TASK4_RED_ABI_ACTIVE_CALLBACK_LEAK');
  assert.deepEqual(contractFailures, [], contractFailures.join(';'));
});

test('Task 4 coalesces two same-batch saves into one revision and one local wake', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000401');
  task4InstallScheduler(x);
  var st = x.state(1), mutation = task4Mutation(lease, x.clock), firstReceipt, secondReceipt;
  st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: st.lastTick + 120});
  var batch = task4Batch(x, mutation, function () {
    firstReceipt = x.world.luu(1, st, {mutation: mutation});
    st.msgs.push({t: st.lastTick, doc: false, loai: 'he', td: 'coalesce'});
    secondReceipt = x.world.luu(1, st, {mutation: mutation});
  });
  var dq = x.kho.db.prepare('SELECT revision,state FROM dq WHERE tk=1').get();
  var wakes = x.kho.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id='1' " +
    "AND state IN ('PENDING','RETRY_WAIT','RUNNING') ORDER BY sequence,id"
  ).all();
  assert.equal(Number(dq.revision), 1, 'TASK4_RED_COALESCED_SINGLE_REVISION');
  assert.equal(JSON.parse(dq.state).msgs.at(-1).td, 'coalesce');
  assert.equal(wakes.length, 1);
  assert.equal(Number(wakes[0].expected_revision), 1);
  assert.equal(Number(wakes[0].scheduled_at_s), st.lastTick + 120);
  assert.strictEqual(secondReceipt, firstReceipt);
  assert.deepEqual(firstReceipt, {revision: 1, nextLocalAtS: st.lastTick + 120});
  assert.ok(batch.receipts instanceof Map, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(Object.getPrototypeOf(batch.receipts), Map.prototype, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.deepEqual(Array.from(batch.receipts.entries()), [[1, firstReceipt]], 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(batch.receipts.get(1), firstReceipt);
});

test('Task 4 coalesces distinct state objects with sticky reducer options and conflicts', function (t) {
  function runOrder(firstReducer) {
    var x = task4Fixture(t), lease = layLease(x, firstReducer ?
      '00000000-0000-4000-8000-000000000429' : '00000000-0000-4000-8000-000000000430');
    task4InstallScheduler(x);
    var current = x.kho.trongGiaoDich(function () {
      var pending = task4ReconcileWake(x, lease, 1, NOW_S + 70);
      return x.store.claimForResolution(lease, pending.id, x.clock.nowMs(), 15_000, {
        allowFuturePending: true
      });
    }, {immediate: true});
    assert.match(current.idempotency_key, /^reconcile:account:1:0:[1-9][0-9]*:[1-9][0-9]*$/,
      'TASK4_RED_STICKY_RECONCILE_KEY');
    assert.equal(String(current.aggregate_id), '1');
    assert.equal(Number(current.expected_revision), -1);
    assert.equal(Number(current.priority), 200, 'TASK4_RED_STICKY_RECONCILE_PRIORITY');
    assert.equal(JSON.parse(current.payload_json).reconcile, true, 'TASK4_RED_STICKY_RECONCILE_PRIORITY');
    var currentBefore = x.store.getById(current.id);
    var one = x.state(1), two = JSON.parse(JSON.stringify(one));
    one.msgs.push({t: one.lastTick, doc: false, loai: 'he', td: 'first'});
    two.msgs.push({t: two.lastTick, doc: false, loai: 'he', td: 'second'});
    var mutation = task4Mutation(lease, x.clock), reducer = {
      currentAccountAdvanceJobId: current.id, deferAccountWake: true
    }, firstReceipt, secondReceipt;
    assert.equal(Object.hasOwn(mutation, 'currentAccountAdvanceJobId'), false,
      'TASK4_RED_STICKY_OPTIONS_NOT_MUTATION');
    assert.equal(Object.hasOwn(mutation, 'deferAccountWake'), false,
      'TASK4_RED_STICKY_OPTIONS_NOT_MUTATION');
    task4Batch(x, mutation, function () {
      firstReceipt = x.world.luu(1, firstReducer ? one : two,
        firstReducer ? Object.assign({mutation: mutation}, reducer) : {mutation: mutation});
      secondReceipt = x.world.luu(1, firstReducer ? two : one,
        firstReducer ? {mutation: mutation} : Object.assign({mutation: mutation}, reducer));
    });
    assert.strictEqual(firstReceipt, secondReceipt);
    assert.equal(x.state(1).msgs.at(-1).td, firstReducer ? 'second' : 'first');
    assert.equal(Number(x.kho.db.prepare('SELECT revision FROM dq WHERE tk=1').get().revision), 1,
      'TASK4_RED_STICKY_COALESCED_REVISION');
    assert.deepEqual(x.store.getById(current.id), currentBefore,
      'TASK4_RED_STICKY_CURRENT_WAKE_RETAINED');
    assert.equal(task4AccountWakes(x.kho, 1).filter(function (row) {
      return row.state === 'PENDING' || row.state === 'RETRY_WAIT';
    }).length, 0);
    var before = task4Rows(x.kho);
    assert.throws(function () {
      task4Batch(x, mutation, function () {
        var conflict = Object.assign({mutation: mutation}, reducer, {currentAccountAdvanceJobId: 'task4-conflict'});
        var sticky = Object.assign({mutation: mutation}, reducer);
        x.world.luu(1, one, firstReducer ? sticky : conflict);
        x.world.luu(1, two, firstReducer ? conflict : sticky);
      });
    }, /SCHEDULER_ACCOUNT_JOB_CONFLICT/);
    assert.deepEqual(task4Rows(x.kho), before);
    var otherMutation = task4Mutation(lease, x.clock);
    assert.throws(function () {
      task4Batch(x, mutation, function () {
        x.world.luu(1, one, {mutation: mutation});
        x.world.luu(1, two, {mutation: otherMutation});
      });
    }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_STICKY_MUTATION_CONFLICT');
    assert.deepEqual(task4Rows(x.kho), before);
  }
  runOrder(true);
  runOrder(false);
});

test('Task 4 scheduler-aware account creation writes one initial local wake', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000427');
  task4InstallScheduler(x);
  x.kho.q.tkThem.run('task4-3', 'Task4 C', PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
  assert.equal(Number(x.kho.q.tkTheoTen.get('task4-3').id), 3);
  var mutation = task4Mutation(lease, x.clock), created;
  var batch = task4Batch(x, mutation, function () {
    created = x.world.taoDeQuoc(3, 'Task4 C', {mutation: mutation});
  });
  assert.ok(created.st && created.nha);
  var expected = G.phanLoaiSuKienNoiBoKe(created.st, 3, function () { return null; });
  var wakes = task4AccountWakes(x.kho, 3);
  assert.equal(wakes.length, 1, 'TASK4_RED_INITIAL_ACCOUNT_ADVANCE_WAKE');
  assert.equal(Number(wakes[0].expected_revision), 0);
  assert.equal(Number(wakes[0].scheduled_at_s), expected.atS);
  assert.ok(created.receipt, 'scheduler account creation returns its batch receipt');
  assert.deepEqual(created.receipt, {revision: 0, nextLocalAtS: expected.atS});
  assert.ok(batch.receipts instanceof Map, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(Object.getPrototypeOf(batch.receipts), Map.prototype, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.deepEqual(Array.from(batch.receipts.entries()), [[3, created.receipt]], 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(batch.receipts.get(3), created.receipt);
});

test('Task 4 deletion atomically invalidates an outbound root after canonical absence', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000402');
  task4InstallScheduler(x);
  var ambientNowMs = x.clock.nowMs(), mutationNowMs = ambientNowMs + 4_000;
  var mutation = task4Mutation(lease, x.clock, {effectiveNowMs: mutationNowMs});
  var root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, 200), x.clock.nowMs());
  }, {immediate: true});
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), 200);
  assert.equal(task4Delete(x, mutation, 1, 'A'), null);
  task4AssertActiveDelete(x, mutation, 'TASK4_RED_OUTBOUND_ACTIVE_MUTATION');
  assert.equal(x.kho.db.prepare('SELECT 1 FROM dq WHERE tk=1').get(), undefined);
  assert.equal(x.store.getById(root.id).state, 'CANCELLED', 'TASK4_RED_OUTBOUND_CANONICAL_INVALIDATION');
  assert.equal(x.store.getById(root.id).cancel_reason, 'ENTITY_REMOVED');
  var application = x.kho.db.prepare(
    'SELECT effective_at_s,applied_at_ms,result_json FROM event_applications WHERE job_id=?'
  ).get(root.id);
  assert.equal(Number(application.effective_at_s), 200);
  assert.deepEqual(JSON.parse(application.result_json), {
    code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'ALREADY_ABSENT'
  });
  assert.equal(Number(application.applied_at_ms), mutationNowMs);
  assert.equal(Number(x.store.getById(root.id).cancelled_at_ms), mutationNowMs);
  assert.equal(Number(x.store.getById(root.id).updated_at_ms), mutationNowMs);
  assert.equal(x.kho.db.prepare('SELECT khi FROM bangtin ORDER BY id DESC LIMIT 1').get().khi,
    Math.floor(mutationNowMs / 1000));
  assert.equal(x.kho.transactionDepth, 0);
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), null);
});

test('Task 4 deletion invalidates an inbound target root with a Task-2-valid result', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000403');
  task4InstallScheduler(x);
  var live = task4LiveInboundRoot(x, lease, 210, 'TASK4_RED_INBOUND_TARGET_ROOT'), root = live.root;
  assert.equal(live.targetKey, G.tdKey(x.state(2).planets[0].c));
  var beforeRejectedEvidence = task4Rows(x.kho);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'EXACT', Number(root.scheduled_at_s),
        x.clock.nowMs());
    }, {immediate: true});
  }, /CANONICAL_NEUTRALIZATION_REQUIRED/);
  assert.deepEqual(task4Rows(x.kho), beforeRejectedEvidence);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'EXACT', Number(root.scheduled_at_s),
        x.clock.nowMs(), {targetRemovedKey: '1:99:99'});
    }, {immediate: true});
  }, /TARGET_REMOVAL_EVIDENCE_INVALID/);
  assert.deepEqual(task4Rows(x.kho), beforeRejectedEvidence);
  var inboundMutation = task4Mutation(lease, x.clock);
  assert.equal(task4Delete(x, inboundMutation, 2, 'B'), null);
  task4AssertActiveDelete(x, inboundMutation, 'TASK4_RED_INBOUND_ACTIVE_MUTATION');
  assert.ok(x.kho.db.prepare('SELECT 1 FROM dq WHERE tk=1').get());
  assert.equal(x.store.getById(root.id).state, 'CANCELLED', 'TASK4_RED_INBOUND_TARGET_ROOT');
  var application = x.kho.db.prepare(
    'SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?'
  ).get(root.id);
  assert.equal(Number(root.scheduled_at_s), live.arrivalAtS, 'TASK4_RED_INBOUND_TARGET_ROOT');
  assert.equal(Number(application.effective_at_s), live.arrivalAtS);
  assert.deepEqual(JSON.parse(application.result_json), {code: 'ENTITY_REMOVED'});
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), null);
});

test('Task 4 classifies inbound exact absent and mismatch roots before target deletion', function (t) {
  var events = require('../server/scheduler/events.js');
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000428');
  task4InstallScheduler(x);
  var live = task4LiveInboundRoot(x, lease, 212, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  var exact = live.root;
  var exactRef = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).find(function (row) {
    return row.logical_root_id === exact.id;
  }).canonical_ref;
  var targetKey = G.tdKey(x.state(2).planets[0].c);
  var absentRef = {kind: 'fleet', ownerAccountId: 1, fleetId: 92, launchAtS: x.state(1).lastTick,
    targetKey: targetKey, arrivalAtS: live.arrivalAtS + 1, mission: 'attack'};
  var mismatchRef = {kind: 'fleet', ownerAccountId: 1, fleetId: 91,
    launchAtS: x.state(1).lastTick, targetKey: targetKey, arrivalAtS: live.arrivalAtS + 2, mission: 'attack'};
  var roots = x.kho.trongGiaoDich(function () {
    return [exact, x.store.schedule(lease, x.globalForRef(absentRef, 2), x.clock.nowMs()),
      x.store.schedule(lease, x.globalForRef(mismatchRef, 2), x.clock.nowMs())];
  }, {immediate: true});
  assert.equal(events.canonicalExternalStatus(x.kho, exactRef), 'EXACT',
    'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(events.canonicalExternalStatus(x.kho, absentRef), 'ALREADY_ABSENT',
    'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(events.canonicalExternalStatus(x.kho, mismatchRef), 'REF_MISMATCH',
    'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  var classifiedMutation = task4Mutation(lease, x.clock);
  assert.equal(task4Delete(x, classifiedMutation, 2, 'B'), null);
  task4AssertActiveDelete(x, classifiedMutation, 'TASK4_RED_CLASSIFIED_ACTIVE_MUTATION');
  var exactApp = x.kho.db.prepare('SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?')
    .get(roots[0].id);
  assert.equal(Number(roots[0].scheduled_at_s), live.arrivalAtS, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(Number(roots[1].scheduled_at_s), live.arrivalAtS + 1, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(Number(roots[2].scheduled_at_s), live.arrivalAtS + 2, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(Number(exactApp.effective_at_s), live.arrivalAtS);
  assert.deepEqual(JSON.parse(exactApp.result_json), {code: 'ENTITY_REMOVED'});
  [roots[1], roots[2]].forEach(function (root, index) {
    var app = x.kho.db.prepare('SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?')
      .get(root.id);
    assert.ok(app, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
    assert.equal(Number(app.effective_at_s), live.arrivalAtS + index + 1);
    assert.deepEqual(JSON.parse(app.result_json), {
      code: 'ENTITY_REMOVED', invalidation: 'canonical',
      neutralization: index === 0 ? 'ALREADY_ABSENT' : 'REF_MISMATCH'
    });
    assert.equal(x.store.getById(root.id).state, 'CANCELLED');
  });
});

test('Task 4 deletion preserves a PENDING or RETRY_WAIT replay child', function (t) {
  ['PENDING', 'RETRY_WAIT'].forEach(function (state, index) {
    var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-00000000040' + (4 + index));
    task4InstallScheduler(x);
    var root = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, x.globalFor(1, 2, 220 + index), x.clock.nowMs());
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(row.id);
      return row;
    }, {immediate: true});
    var child = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, replayJobFrom(x.store.getById(root.id),
        'task4-' + String(state).toLowerCase()), x.clock.nowMs());
    }, {immediate: true});
    var local = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:' + index, 220 + index, 100), x.clock.nowMs());
    }, {immediate: true});
    if (state === 'RETRY_WAIT') danhDauRetry(x.kho, child.idempotency_key, x.clock.nowMs() + 60_000);
    var before = x.kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(child.id);
    var deleteMutation = task4Mutation(lease, x.clock);
    assert.equal(task4Delete(x, deleteMutation, 1, 'A'), null);
    task4AssertActiveDelete(x, deleteMutation, 'TASK4_RED_REPLAY_ACTIVE_MUTATION');
    assert.equal(x.store.getById(root.id).state, 'QUARANTINED');
    assert.deepEqual(x.kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(child.id), before);
    assert.equal(x.store.getById(local.id).state, 'CANCELLED', 'TASK4_RED_REPLAY_LOCAL_CANCELLATION');
    assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id IN (?,?)').get(root.id,
      child.id).n, 0);
    assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), 220 + index);
  });
});

test('Task 4 deletes a future RETRY_WAIT root only with a live lease fence', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000406');
  task4InstallScheduler(x);
  var root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, 230), x.clock.nowMs());
  }, {immediate: true});
  danhDauRetry(x.kho, root.idempotency_key, x.clock.nowMs() + 600_000);
  var retryMutation = task4Mutation(lease, x.clock);
  assert.equal(task4Delete(x, retryMutation, 1, 'A'), null);
  task4AssertActiveDelete(x, retryMutation, 'TASK4_RED_RETRY_ACTIVE_MUTATION');
  assert.equal(x.store.getById(root.id).state, 'CANCELLED', 'TASK4_RED_RETRY_WAIT_INVALIDATION');
  var y = task4Fixture(t), stale = layLease(y, '00000000-0000-4000-8000-000000000407');
  task4InstallScheduler(y);
  var protectedRoot = y.kho.trongGiaoDich(function () {
    return y.store.schedule(stale, y.globalFor(1, 2, 231), y.clock.nowMs());
  }, {immediate: true});
  danhDauRetry(y.kho, protectedRoot.idempotency_key, y.clock.nowMs() + 600_000);
  y.kho.db.prepare("UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'").run();
  var before = task4Rows(y.kho);
  assert.throws(function () {
    task4Delete(y, task4Mutation(stale, y.clock), 1, 'A');
  }, /LEASE_LOST/);
  assert.deepEqual(task4Rows(y.kho), before);
});

test('Task 4 deletion owns or joins one rollback-only UoW without nested begin', function (t) {
  function instrument(x) {
    var exec = x.kho.db.exec, tx = x.kho.trongGiaoDich, sql = [], depths = [];
    x.kho.db.exec = function (statement) { sql.push(statement); return exec.call(this, statement); };
    x.kho.trongGiaoDich = function (fn, options) {
      return tx.call(this, function () { depths.push(x.kho.transactionDepth); return fn(); }, options);
    };
    return {sql: sql, depths: depths, restore: function () { x.kho.db.exec = exec; x.kho.trongGiaoDich = tx; }};
  }
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000439');
  task4InstallScheduler(x);
  x.kho.trongGiaoDich(function () { x.store.schedule(lease, x.globalFor(1, 2, 245), x.clock.nowMs()); },
    {immediate: true});
  var direct = instrument(x);
  assert.equal(x.kho.transactionDepth, 0, 'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(task4Delete(x, task4Mutation(lease, x.clock), 1, 'A'), null,
    'TASK4_RED_UOW_OWNERSHIP');
  direct.restore();
  assert.equal(direct.sql.filter(function (s) { return /^BEGIN IMMEDIATE/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(direct.sql.filter(function (s) { return /^COMMIT/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.ok(direct.depths.every(function (depth) { return depth > 0; }),
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(x.kho.transactionDepth, 0, 'TASK4_RED_UOW_OWNERSHIP');
  var y = task4Fixture(t), yLease = layLease(y, '00000000-0000-4000-8000-000000000440');
  task4InstallScheduler(y);
  y.kho.trongGiaoDich(function () { y.store.schedule(yLease, y.globalFor(1, 2, 246), y.clock.nowMs()); },
    {immediate: true});
  var joined = instrument(y), outerDepth, joinedMutation = task4Mutation(yLease, y.clock);
  var joinedFence = task4FinalFenceProbe(y, joinedMutation, 'TASK4_RED_UOW_FINALIZER', false);
  try {
    y.kho.trongGiaoDich(function () {
      outerDepth = y.kho.transactionDepth;
      task4Delete(y, joinedMutation, 1, 'A');
      y.kho.q.cauhinhSet.run('task4-after-xoa-before-finalizer', 'present');
      assert.equal(y.kho.transactionDepth, outerDepth, 'TASK4_RED_UOW_OWNERSHIP');
    }, {immediate: true});
  } finally { joinedFence.finish(); }
  joined.restore();
  assert.equal(joined.sql.filter(function (s) { return /^BEGIN IMMEDIATE/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(joined.sql.filter(function (s) { return /^COMMIT/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.ok(joined.depths.some(function (depth) { return depth > outerDepth; }),
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(y.kho.transactionDepth, 0, 'TASK4_RED_UOW_OWNERSHIP');
  var lifecycle = task4Fixture(t), order = [], a = function () { order.push('a'); },
    b = function () { order.push('b'); }, c = function () { order.push('c'); };
  assert.throws(function () { lifecycle.kho.dangKySchedulerFinalizer(a); },
    /SCHEDULER_FINALIZER_TRANSACTION_REQUIRED/, 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  assert.throws(function () { lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(null);
  }, {immediate: true}); }, /SCHEDULER_FINALIZER_INVALID/, 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(a);
    lifecycle.kho.dangKySchedulerFinalizer(a); // identity dedupe
    lifecycle.kho.dangKySchedulerFinalizer(b);
    lifecycle.kho.trongGiaoDich(function () { lifecycle.kho.dangKySchedulerFinalizer(c); }, {immediate: true});
  }, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  // This is deliberately before every rollback-path case: an empty *new*
  // committed UoW proves that successful COMMIT reset the prior FIFO/dedupe
  // registry, rather than merely observing a later rollback cleanup.
  lifecycle.kho.trongGiaoDich(function () {}, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_COMMIT_RESET');
  assert.throws(function () { lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(function () { order.push('rollback'); });
    throw new Error('TASK4_CALLBACK_ROLLBACK');
  }, {immediate: true}); }, /TASK4_CALLBACK_ROLLBACK/);
  lifecycle.kho.trongGiaoDich(function () {}, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  var finalizerFailure = new Error('TASK4_FINALIZER_FAILURE');
  assert.throws(function () { lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(function () { throw finalizerFailure; });
  }, {immediate: true}); }, function (error) {
    assert.strictEqual(error, finalizerFailure, 'TASK4_RED_UOW_FINALIZER_IDENTITY');
    return true;
  }, 'TASK4_RED_UOW_FINALIZER_IDENTITY');
  lifecycle.kho.trongGiaoDich(function () {}, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  var z = task4Fixture(t), zLease = layLease(z, '00000000-0000-4000-8000-000000000441');
  task4InstallScheduler(z);
  z.kho.trongGiaoDich(function () { z.store.schedule(zLease, z.globalFor(1, 2, 247), z.clock.nowMs()); },
    {immediate: true});
  var failedJoin = instrument(z), beforeRollback = task4Rows(z.kho), sawRollbackOnly = false;
  var zMutation = task4Mutation(zLease, z.clock);
  var zFence = task4FinalFenceProbe(z, zMutation, 'TASK4_RED_UOW_FINALIZER', true);
  try {
    assert.throws(function () {
      z.kho.trongGiaoDich(function () {
        assert.ok(z.kho.transactionDepth > 0, 'TASK4_RED_UOW_ROLLBACK_ONLY');
        try {
          task4Delete(z, zMutation, 1, 'A');
          z.kho.q.cauhinhSet.run('task4-after-xoa-before-fault-finalizer', 'present');
        } catch (error) {
          sawRollbackOnly = z.kho.transactionRollbackOnly === true;
          throw error;
        }
      }, {immediate: true});
    }, /LEASE_LOST/, 'TASK4_RED_UOW_FINALIZER');
  } finally { zFence.finish(); }
  failedJoin.restore();
  assert.equal(sawRollbackOnly, false, 'TASK4_RED_UOW_FINALIZER_AFTER_CALLBACK');
  assert.equal(failedJoin.sql.filter(function (s) { return /^BEGIN IMMEDIATE/.test(s); }).length, 1,
    'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.equal(failedJoin.sql.filter(function (s) { return /^COMMIT/.test(s); }).length, 0,
    'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.equal(failedJoin.sql.filter(function (s) { return /^ROLLBACK/.test(s); }).length, 1,
    'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.deepEqual(task4Rows(z.kho), beforeRollback, 'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.equal(z.kho.transactionDepth, 0, 'TASK4_RED_UOW_ROLLBACK_ONLY');
});

test('Task 4 final lease fence proves deletion placement then rolls back protected globals', function (t) {
  function setup(ownerId) {
    var x = task4Fixture(t), lease = layLease(x, ownerId);
    task4InstallScheduler(x);
    var protectedRows = x.kho.trongGiaoDich(function () {
      var running = x.store.schedule(lease, x.globalFor(1, 2, 240), x.clock.nowMs());
      running = x.store.claimForResolution(lease, running.id, x.clock.nowMs(), 15_000, {allowFuturePending: true});
      var source = x.store.schedule(lease, x.globalFor(1, 2, 241), x.clock.nowMs());
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(source.id);
      var replay = x.store.schedule(lease, replayJobFrom(x.store.getById(source.id), 'task4-final-fence'),
        x.clock.nowMs());
      return {running: running, source: source, replay: replay};
    }, {immediate: true});
    return {x: x, lease: lease, rows: protectedRows};
  }
  var placed = setup('00000000-0000-4000-8000-000000000408');
  var placementMutation = task4Mutation(placed.lease, placed.x.clock);
  var placement = task4FinalFenceProbe(placed.x, placementMutation,
    'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE', false);
  try {
    assert.doesNotThrow(function () { task4Delete(placed.x, placementMutation, 1, 'A'); });
  } finally { placement.finish(); }
  [placed.rows.running.id, placed.rows.source.id, placed.rows.replay.id].forEach(function (id) {
    assert.ok(placed.x.store.getById(id), 'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE');
  });
  var failed = setup('00000000-0000-4000-8000-000000000442');
  task4SeedRollbackWitnesses(failed.x);
  var before = task4Rows(failed.x.kho), faultMutation = task4Mutation(failed.lease, failed.x.clock);
  var fault = task4FinalFenceProbe(failed.x, faultMutation,
    'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE', true);
  try {
    assert.throws(function () { task4Delete(failed.x, faultMutation, 1, 'A'); }, /LEASE_LOST/,
      'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE');
  } finally { fault.finish(); }
  assert.deepEqual(task4Rows(failed.x.kho), before);
  [failed.rows.running.id, failed.rows.source.id, failed.rows.replay.id].forEach(function (id) {
    assert.deepEqual(failed.x.store.getById(id), before.jobs.find(function (row) { return row.id === id; }));
  });
});

test('Task 4 final save fence proves placement then rolls back after local synchronization', function (t) {
  function setup(ownerId) {
    var x = task4Fixture(t), lease = layLease(x, ownerId), changed;
    task4InstallScheduler(x);
    changed = x.state(1);
    changed.msgs.push({t: changed.lastTick, doc: false, loai: 'he', td: 'save-lease-fence'});
    changed.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: changed.lastTick + 120});
    assert.equal(task4AccountWakes(x.kho, 1).length, 0, 'TASK4_RED_SAVE_FINAL_FENCE_PRECONDITION');
    assert.equal(x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).length, 0,
      'TASK4_RED_SAVE_FINAL_FENCE_PRECONDITION');
    return {x: x, lease: lease, changed: changed};
  }
  var placed = setup('00000000-0000-4000-8000-000000000433');
  var placementMutation = task4Mutation(placed.lease, placed.x.clock);
  var placement = task4FinalFenceProbe(placed.x, placementMutation, 'TASK4_RED_SAVE_LEASE_FENCE', false);
  try {
    assert.doesNotThrow(function () { task4Batch(placed.x, placementMutation, function () {
      placed.x.world.luu(1, placed.changed, {mutation: placementMutation});
    }); });
    assert.throws(function () {
      placed.x.kho.db.prepare("UPDATE sqlite_sequence SET seq=seq WHERE name='event_jobs'").run();
    }, /TASK4_RED_WRITE_AFTER_FINAL_FENCE/, 'TASK4_RED_SAVE_SEQUENCE_AFTER_FINAL_FENCE');
  } finally { placement.finish(); }
  assert.equal(task4AccountWakes(placed.x.kho, 1).length, 1, 'TASK4_RED_SAVE_LEASE_FENCE');
  var failed = setup('00000000-0000-4000-8000-000000000443');
  task4SeedRollbackWitnesses(failed.x);
  var before = task4Rows(failed.x.kho), faultMutation = task4Mutation(failed.lease, failed.x.clock);
  var fault = task4FinalFenceProbe(failed.x, faultMutation, 'TASK4_RED_SAVE_LEASE_FENCE', true);
  try {
    assert.throws(function () { task4Batch(failed.x, faultMutation, function () {
      failed.x.world.luu(1, failed.changed, {mutation: faultMutation});
    }); }, /LEASE_LOST/, 'TASK4_RED_SAVE_LEASE_FENCE');
  } finally { fault.finish(); }
  assert.deepEqual(task4Rows(failed.x.kho), before,
    'dq state/revision, projections, jobs/applications, metadata, witnesses, and sequence roll back');
  var joined = setup('00000000-0000-4000-8000-000000000445');
  var joinedMutation = task4Mutation(joined.lease, joined.x.clock);
  var joinedFence = task4FinalFenceProbe(joined.x, joinedMutation, 'TASK4_RED_SAVE_JOINED_FINALIZER', false);
  try {
    assert.doesNotThrow(function () { joined.x.kho.trongGiaoDich(function () {
      task4Batch(joined.x, joinedMutation, function () {
        joined.x.world.luu(1, joined.changed, {mutation: joinedMutation});
      });
      joined.x.kho.q.cauhinhSet.run('task4-save-caller-write-before-finalizer', 'present');
    }, {immediate: true}); }, 'TASK4_RED_SAVE_JOINED_FINALIZER');
  } finally { joinedFence.finish(); }
  assert.equal(joined.x.kho.q.cauhinhGet.get('task4-save-caller-write-before-finalizer').v, 'present');
  var joinedFailure = setup('00000000-0000-4000-8000-000000000446');
  task4SeedRollbackWitnesses(joinedFailure.x);
  var joinedBefore = task4Rows(joinedFailure.x.kho),
    joinedFaultMutation = task4Mutation(joinedFailure.lease, joinedFailure.x.clock);
  var joinedFault = task4FinalFenceProbe(joinedFailure.x, joinedFaultMutation, 'TASK4_RED_SAVE_JOINED_FINALIZER', true);
  try {
    assert.throws(function () { joinedFailure.x.kho.trongGiaoDich(function () {
      task4Batch(joinedFailure.x, joinedFaultMutation, function () {
        joinedFailure.x.world.luu(1, joinedFailure.changed, {mutation: joinedFaultMutation});
      });
      joinedFailure.x.kho.q.cauhinhSet.run('task4-save-caller-write-before-fault-finalizer', 'present');
    }, {immediate: true}); }, /LEASE_LOST/, 'TASK4_RED_SAVE_JOINED_FINALIZER');
  } finally { joinedFault.finish(); }
  assert.deepEqual(task4Rows(joinedFailure.x.kho), joinedBefore, 'TASK4_RED_SAVE_JOINED_FINALIZER');
});

test('Task 4 creation final fence proves placement then rolls back after initial wake', function (t) {
  function setup(ownerId) {
    var x = task4Fixture(t), lease = layLease(x, ownerId);
    task4InstallScheduler(x);
    x.kho.q.tkThem.run('task4-creation-fence', 'Task4 creation fence', PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
    assert.equal(Number(x.kho.q.tkTheoTen.get('task4-creation-fence').id), 3);
    return {x: x, lease: lease};
  }
  var placed = setup('00000000-0000-4000-8000-000000000434');
  var placementMutation = task4Mutation(placed.lease, placed.x.clock);
  var placement = task4FinalFenceProbe(placed.x, placementMutation, 'TASK4_RED_CREATION_LEASE_FENCE', false);
  try {
    assert.doesNotThrow(function () { task4Batch(placed.x, placementMutation, function () {
      placed.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: placementMutation});
    }); });
  } finally { placement.finish(); }
  assert.equal(task4AccountWakes(placed.x.kho, 3).length, 1, 'TASK4_RED_CREATION_LEASE_FENCE');
  var failed = setup('00000000-0000-4000-8000-000000000444');
  task4SeedRollbackWitnesses(failed.x);
  var before = task4Rows(failed.x.kho), faultMutation = task4Mutation(failed.lease, failed.x.clock);
  var fault = task4FinalFenceProbe(failed.x, faultMutation, 'TASK4_RED_CREATION_LEASE_FENCE', true);
  try {
    assert.throws(function () { task4Batch(failed.x, faultMutation, function () {
      failed.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: faultMutation});
    }); }, /LEASE_LOST/, 'TASK4_RED_CREATION_LEASE_FENCE');
  } finally { fault.finish(); }
  assert.deepEqual(task4Rows(failed.x.kho), before,
    'creation rolls back dq, projections, jobs/applications, metadata, witnesses, and sequence');
  var joined = setup('00000000-0000-4000-8000-000000000447');
  var joinedMutation = task4Mutation(joined.lease, joined.x.clock);
  var joinedFence = task4FinalFenceProbe(joined.x, joinedMutation, 'TASK4_RED_CREATION_JOINED_FINALIZER', false);
  try {
    assert.doesNotThrow(function () { joined.x.kho.trongGiaoDich(function () {
      task4Batch(joined.x, joinedMutation, function () {
        joined.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: joinedMutation});
      });
      joined.x.kho.q.cauhinhSet.run('task4-creation-caller-write-before-finalizer', 'present');
    }, {immediate: true}); }, 'TASK4_RED_CREATION_JOINED_FINALIZER');
  } finally { joinedFence.finish(); }
  assert.equal(joined.x.kho.q.cauhinhGet.get('task4-creation-caller-write-before-finalizer').v, 'present');
  var joinedFailure = setup('00000000-0000-4000-8000-000000000448');
  task4SeedRollbackWitnesses(joinedFailure.x);
  var joinedBefore = task4Rows(joinedFailure.x.kho),
    joinedFaultMutation = task4Mutation(joinedFailure.lease, joinedFailure.x.clock);
  var joinedFault = task4FinalFenceProbe(joinedFailure.x, joinedFaultMutation,
    'TASK4_RED_CREATION_JOINED_FINALIZER', true);
  try {
    assert.throws(function () { joinedFailure.x.kho.trongGiaoDich(function () {
      task4Batch(joinedFailure.x, joinedFaultMutation, function () {
        joinedFailure.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: joinedFaultMutation});
      });
      joinedFailure.x.kho.q.cauhinhSet.run('task4-creation-caller-write-before-fault-finalizer', 'present');
    }, {immediate: true}); }, /LEASE_LOST/, 'TASK4_RED_CREATION_JOINED_FINALIZER');
  } finally { joinedFault.finish(); }
  assert.deepEqual(task4Rows(joinedFailure.x.kho), joinedBefore, 'TASK4_RED_CREATION_JOINED_FINALIZER');
});

test('Task 4 derives durable timestamps from mutation effectiveNowMs, not ambient clock', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000435');
  task4InstallScheduler(x);
  var firstNowMs = x.clock.nowMs() + 4_000, secondNowMs = firstNowMs + 1_000;
  assert.notEqual(firstNowMs, x.clock.nowMs());
  var st = x.state(1), target = x.state(2).planets[0].c;
  st.fleets.push({id: 91, pi: 0, tu: st.planets[0].c, den: target, mission: 'attack',
    pha: 'di', diLuc: st.lastTick, den_t: st.lastTick + 90, ships: {cargoS: 1}, cargo: {}});
  st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: st.lastTick + 120});
  var firstMutation = task4Mutation(lease, x.clock, {effectiveNowMs: firstNowMs});
  task4Batch(x, firstMutation, function () { x.world.luu(1, st, {mutation: firstMutation}); });
  var firstDq = x.kho.db.prepare('SELECT capNhat FROM dq WHERE tk=1').get();
  var firstWake = task4AccountWakes(x.kho, 1)[0];
  var firstDerived = x.store.listDerivedJobsForAccount(lease, 1, firstNowMs);
  assert.ok(firstDq, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.ok(firstWake, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(firstDerived.length, 1, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  var firstGlobal = x.store.getById(firstDerived[0].logical_root_id);
  assert.ok(firstGlobal, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(Number(firstDq.capNhat), Math.floor(firstNowMs / 1000), 'TASK4_RED_MUTATION_EFFECTIVE_TIME');
  assert.equal(Number(firstWake.created_at_ms), firstNowMs);
  assert.equal(Number(firstGlobal.created_at_ms), firstNowMs);
  st.fleets[0].den_t += 1;
  var secondMutation = task4Mutation(lease, x.clock, {effectiveNowMs: secondNowMs});
  task4Batch(x, secondMutation, function () { x.world.luu(1, st, {mutation: secondMutation}); });
  var cancelled = x.store.getById(firstGlobal.id);
  var application = x.kho.db.prepare(
    'SELECT applied_at_ms FROM event_applications WHERE job_id=?'
  ).get(firstGlobal.id);
  var currentWake = task4AccountWakes(x.kho, 1)[0];
  var secondDerived = x.store.listDerivedJobsForAccount(lease, 1, secondNowMs);
  assert.ok(cancelled, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.ok(application, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.ok(currentWake, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(secondDerived.length, 1, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  var replacement = x.store.getById(secondDerived[0].logical_root_id);
  assert.ok(replacement, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(Number(cancelled.cancelled_at_ms), secondNowMs);
  assert.equal(Number(application.applied_at_ms), secondNowMs);
  assert.equal(Number(currentWake.created_at_ms), secondNowMs);
  assert.equal(Number(replacement.created_at_ms), secondNowMs);
  x.kho.q.tkThem.run('task4-time-creation', 'Task4 Time Creation', PASSWORD_HASH,
    PASSWORD_SALT, NOW_S, NOW_S);
  var creationMutation = task4Mutation(lease, x.clock, {effectiveNowMs: secondNowMs + 5000});
  task4Batch(x, creationMutation, function () {
    x.world.taoDeQuoc(3, 'Task4 Time Creation', {mutation: creationMutation});
  });
  var createdState = x.kho.db.prepare('SELECT state,lastTick,capNhat FROM dq WHERE tk=3').get();
  assert.equal(Number(createdState.capNhat), Math.floor(creationMutation.effectiveNowMs / 1000),
    'TASK4_REVIEW_CREATION_EFFECTIVE_TIME');
  assert.equal(Number(createdState.lastTick), Math.floor(creationMutation.effectiveNowMs / 1000),
    'TASK4_REVIEW_CREATION_EFFECTIVE_TIME');
  assert.equal(JSON.parse(createdState.state).lastTick, Number(createdState.lastTick),
    'TASK4_REVIEW_CREATION_EFFECTIVE_TIME');
  var creationWakes = task4AccountWakes(x.kho, 3);
  var creationState = JSON.parse(createdState.state);
  var creationNext = G.phanLoaiSuKienNoiBoKe(creationState, 3, function () { return null; });
  assert.equal(creationWakes.length, 1, 'TASK4_REVIEW_CREATION_EFFECTIVE_WAKE');
  assert.equal(Number(creationWakes[0].expected_revision), 0, 'TASK4_REVIEW_CREATION_EFFECTIVE_WAKE');
  assert.equal(Number(creationWakes[0].created_at_ms), creationMutation.effectiveNowMs,
    'TASK4_REVIEW_CREATION_EFFECTIVE_WAKE');
  assert.equal(Number(creationWakes[0].scheduled_at_s), creationNext.atS,
    'TASK4_REVIEW_CREATION_EFFECTIVE_WAKE');
});

test('Task 4 chooses a later local wake when an earlier external candidate exists', function (t) {
  var x = task4Fixture(t), st = x.state(1), owner = 1, targetKey = G.tdKey(x.state(2).planets[0].c);
  task4InstallScheduler(x);
  st.fleets.push({id: 91, pi: 0, tu: st.planets[0].c, den: x.state(2).planets[0].c,
    mission: 'attack', pha: 'di', diLuc: st.lastTick, den_t: st.lastTick + 30, ships: {cargoS: 1}, cargo: {}});
  st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: st.lastTick + 60});
  var owners = function (key) { return key === targetKey ? 2 : null; };
  assert.equal(G.phanLoaiSuKienKe(st, owner, {multiplayer: true, targetAccountForKey: owners}).atS, st.lastTick + 30);
  assert.equal(G.phanLoaiSuKienNoiBoKe(st, owner, owners).atS, st.lastTick + 60);
  var mutation = task4Mutation(layLease(x, '00000000-0000-4000-8000-000000000409'), x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(owner, st, {mutation: mutation});
  });
  assert.equal(task4AccountWakes(x.kho, owner).length, 1, 'TASK4_RED_LOCAL_WAKE_CREATED');
  assert.equal(Number(task4AccountWakes(x.kho, owner)[0].scheduled_at_s), st.lastTick + 60,
    'TASK4_RED_LOCAL_NOT_EXTERNAL_WAKE');
});

test('Task 4 synchronizes a Task-2-valid external root, retains exact and invalidates mismatch', function (t) {
  var events = require('../server/scheduler/events.js');
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000410');
  task4InstallScheduler(x);
  var st = x.state(1), target = x.state(2).planets[0].c;
  st.fleets.push({id: 91, pi: 0, tu: st.planets[0].c, den: target, mission: 'attack',
    pha: 'di', diLuc: st.lastTick, den_t: st.lastTick + 90, ships: {cargoS: 1}, cargo: {}});
  var owners = function (key) { return key === G.tdKey(target) ? 2 : null; };
  var expected = events.deriveExternalJobs(1, st, owners);
  var ref = {kind: 'fleet', ownerAccountId: 1, fleetId: 91, launchAtS: st.lastTick,
    targetKey: G.tdKey(target), arrivalAtS: st.lastTick + 90, mission: 'attack'};
  var matchId = fixtureMatchId(ref, 2);
  var exactVector = {
    kind: 'PVP_RESOLVE', scheduledAtS: st.lastTick + 90, priority: 50,
    idempotencyKey: 'pvp-resolve:' + matchId + ':' + (st.lastTick + 90),
    aggregateType: 'match', aggregateId: matchId, expectedRevision: null,
    sourceAccountId: 1, maxAttempts: 8,
    payload: {schemaVersion: 1, matchId: matchId, ref: ref}
  };
  assert.deepEqual(expected, [exactVector]);
  assert.deepEqual(task2StoreModule().validateJob(expected[0]), exactVector);
  var mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  var first = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(first.length, 1, 'TASK4_RED_EXTERNAL_DERIVATION_SCHEDULED');
  assert.equal(first[0].logical_key, expected[0].idempotencyKey);
  assert.equal(events.canonicalExternalStatus(x.kho, first[0].canonical_ref), 'EXACT');
  mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  var retained = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(retained.length, 1);
  assert.equal(retained[0].logical_root_id, first[0].logical_root_id);
  st.fleets[0].den_t += 1;
  mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  var cancelled = x.store.getById(first[0].logical_root_id);
  assert.equal(cancelled.state, 'CANCELLED');
  assert.equal(cancelled.cancel_reason, 'ENTITY_REMOVED');
  var application = x.kho.db.prepare('SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?')
    .get(cancelled.id);
  assert.equal(Number(application.effective_at_s), Number(cancelled.scheduled_at_s));
  assert.deepEqual(JSON.parse(application.result_json), {
    code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'REF_MISMATCH'
  });
  var replacement = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(replacement.length, 1);
  assert.notEqual(replacement[0].logical_root_id, first[0].logical_root_id);
});

test('Task 4 reducer continuation fences union independent protected roots and invalidate control', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000431');
  task4InstallScheduler(x);
  var roots = x.kho.trongGiaoDich(function () {
    var pending = x.store.schedule(lease, x.globalFor(1, 2, 280), x.clock.nowMs());
    var retry = x.store.schedule(lease, x.globalFor(1, 2, 281), x.clock.nowMs());
    var quarantined = x.store.schedule(lease, x.globalFor(1, 2, 282), x.clock.nowMs());
    var control = x.store.schedule(lease, x.globalFor(1, 2, 283), x.clock.nowMs());
    danhDauRetry(x.kho, retry.idempotency_key, x.clock.nowMs() + 60_000);
    x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?")
      .run(quarantined.id);
    return {pending: pending, retry: retry, quarantined: quarantined, control: control};
  }, {immediate: true});
  var currentWake = x.kho.trongGiaoDich(function () {
    var pending = x.store.schedule(lease, job('account-advance:1:0', 280, 100), x.clock.nowMs());
    return x.store.claimForResolution(lease, pending.id, x.clock.nowMs(), 15_000, {allowFuturePending: true});
  }, {immediate: true});
  var before = task4Rows(x.kho), firstState = x.state(1), secondState;
  firstState.fleets = [];
  secondState = JSON.parse(JSON.stringify(firstState));
  secondState.msgs.push({t: secondState.lastTick, doc: false, loai: 'he', td: 'protected-union'});
  var firstRoots = new Set([roots.pending.id]);
  var secondRoots = new Set([roots.retry.id, roots.quarantined.id]);
  var mutation = task4Mutation(lease, x.clock);
  assert.equal(Object.hasOwn(mutation, 'protectedRecoveryRootIds'), false,
    'TASK4_RED_REDUCER_CONTINUATION_OPTIONS_NOT_MUTATION');
  task4Batch(x, mutation, function () {
    x.world.luu(1, firstState, {mutation: mutation, currentAccountAdvanceJobId: currentWake.id,
      deferAccountWake: true, protectedRecoveryRootIds: firstRoots});
    x.world.luu(1, secondState, {mutation: mutation, currentAccountAdvanceJobId: currentWake.id,
      deferAccountWake: true, protectedRecoveryRootIds: secondRoots});
    firstRoots.clear();
    secondRoots.clear(); // caller Set mutation cannot replace or mutate the private union
  });
  assert.equal(Object.hasOwn(mutation, 'protectedRecoveryRootIds'), false,
    'TASK4_RED_REDUCER_CONTINUATION_OPTIONS_NOT_MUTATION');
  [roots.pending.id, roots.retry.id, roots.quarantined.id].forEach(function (id) {
    assert.deepEqual(x.store.getById(id), before.jobs.find(function (row) { return row.id === id; }));
  });
  assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id IN (?,?,?)')
    .get(roots.pending.id, roots.retry.id, roots.quarantined.id).n, 0);
  assert.equal(x.store.getById(roots.control.id).state, 'CANCELLED',
    'TASK4_RED_REDUCER_CONTINUATION_UNPROTECTED_CONTROL');
  assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?')
    .get(roots.control.id).n, 1, 'TASK4_RED_REDUCER_CONTINUATION_UNPROTECTED_CONTROL');
  assert.deepEqual(x.store.getById(currentWake.id),
    before.jobs.find(function (row) { return row.id === currentWake.id; }),
    'TASK4_RED_REDUCER_CONTINUATION_CURRENT_WAKE');
  assert.equal(task4AccountWakes(x.kho, 1).filter(function (row) { return row.state !== 'RUNNING'; }).length, 0,
    'TASK4_RED_REDUCER_CONTINUATION_CURRENT_WAKE');
  assert.deepEqual(task4Rows(x.kho).meta.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms' && row.key !== 'sequence';
  }), before.meta.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms' && row.key !== 'sequence';
  }));
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), 280);
  var protectedState = x.state(1), protectedTarget = x.state(2).planets[0].c;
  protectedState.fleets.push({id: 99, pi: 0, tu: protectedState.planets[0].c, den: protectedTarget,
    mission: 'attack', pha: 'di', diLuc: protectedState.lastTick,
    den_t: protectedState.lastTick + 90, ships: {cargoS: 1}, cargo: {}});
  var protectedMutation = task4Mutation(lease, x.clock);
  task4Batch(x, protectedMutation, function () { x.world.luu(1, protectedState, {mutation: protectedMutation}); });
  var protectedRoot = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).find(function (row) {
    return row.canonical_ref.fleetId === 99;
  });
  assert.equal(x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).filter(function (row) {
    return row.canonical_ref.fleetId === 100;
  }).length, 0, 'TASK4_REVIEW_PROTECTED_UNRELATED_DERIVED');
  var protectedBefore = task4Rows(x.kho), changed = JSON.parse(JSON.stringify(protectedState));
  changed.fleets.find(function (fleet) { return fleet.id === 99; }).den_t++;
  changed.fleets.push({id: 100, pi: 0, tu: changed.planets[0].c, den: protectedTarget,
    mission: 'attack', pha: 'di', diLuc: changed.lastTick,
    den_t: changed.lastTick + 91, ships: {cargoS: 1}, cargo: {}});
  protectedMutation = task4Mutation(lease, x.clock);
  task4Batch(x, protectedMutation, function () {
    x.world.luu(1, changed, {mutation: protectedMutation,
      protectedRecoveryRootIds: new Set([protectedRoot.logical_root_id])});
  });
  assert.deepEqual(x.store.getById(protectedRoot.logical_root_id),
    protectedBefore.jobs.find(function (row) { return row.id === protectedRoot.logical_root_id; }),
    'TASK4_REVIEW_PROTECTED_NO_REPLACEMENT');
  assert.equal(x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).filter(function (row) {
    return row.canonical_ref.fleetId === 99;
  }).length, 1, 'TASK4_REVIEW_PROTECTED_NO_REPLACEMENT');
  assert.equal(x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).filter(function (row) {
    return row.canonical_ref.fleetId === 100;
  }).length, 1, 'TASK4_REVIEW_PROTECTED_UNRELATED_DERIVED');
});

test('Task 4 sweep classifies every eligible root, local wake, running root and active replay state', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000411');
  var ambientNowMs = x.clock.nowMs(), now = ambientNowMs + 4_000, roots = x.kho.trongGiaoDich(function () {
    return ['PENDING', 'RETRY_WAIT', 'QUARANTINED', 'RUNNING'].map(function (state, index) {
      var row = x.store.schedule(lease, x.globalFor(1, 2, 300 + index), now);
      if (state === 'RETRY_WAIT') danhDauRetry(x.kho, row.idempotency_key, now + 60_000);
      if (state === 'QUARANTINED') x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?,error_code='TEST' WHERE id=?"
      ).run(now, row.id);
      if (state === 'RUNNING') return x.store.claimForResolution(lease, row.id, now, 15_000, {
        allowFuturePending: true
      });
      return row;
    });
  }, {immediate: true});
  var localPending = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, job('account-advance:1:0', 300, 100), now);
  }, {immediate: true});
  var localRetry = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, job('account-advance:1:1', 301, 100), now);
  }, {immediate: true});
  danhDauRetry(x.kho, localRetry.idempotency_key, now + 60_000);
  var replayCases = ['PENDING', 'RETRY_WAIT', 'RUNNING', 'QUARANTINED'].map(function (state, index) {
    return x.kho.trongGiaoDich(function () {
      var root = x.store.schedule(lease, x.globalFor(1, 2, 304 + index), now);
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(root.id);
      var child = x.store.schedule(lease, replayJobFrom(x.store.getById(root.id),
        'task4-sweep-' + String(state).toLowerCase()), now);
      if (state === 'RETRY_WAIT') danhDauRetry(x.kho, child.idempotency_key, now + 60_000);
      if (state === 'RUNNING') child = x.store.claimForResolution(lease, child.id, now, 15_000,
        {allowFuturePending: true});
      if (state === 'QUARANTINED') x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',error_code='TEST_CHILD' WHERE id=?"
      ).run(child.id);
      return {state: state, root: root, child: child};
    }, {immediate: true});
  });
  assert.notEqual(now, ambientNowMs, 'sweep receives a lease-valid mutation time, not fixture clock time');
  var replayBefore = replayCases.map(function (entry) {
    return {root: x.store.getById(entry.root.id), child: x.store.getById(entry.child.id)};
  });
  var runningBefore = x.store.getById(roots[3].id);
  var metadataBefore = task4Rows(x.kho);
  x.kho.q.tkXoa.run(1);
  var result;
  assert.doesNotThrow(function () { result = x.store.sweepDeletedAccountOrphans(lease, now); });
  assert.deepEqual(result, {local: 2, global: 3, protectedReplay: 4, running: 1});
  ['CANCELLED', 'CANCELLED', 'CANCELLED', 'RUNNING'].forEach(function (state, index) {
    assert.equal(x.store.getById(roots[index].id).state, state);
  });
  roots.slice(0, 3).forEach(function (root) {
    var application = x.kho.db.prepare(
      'SELECT effective_at_s,applied_at_ms,result_json FROM event_applications WHERE job_id=?'
    ).get(root.id);
    assert.equal(Number(application.effective_at_s), Number(root.scheduled_at_s));
    assert.equal(Number(application.applied_at_ms), now);
    assert.equal(Number(x.store.getById(root.id).cancelled_at_ms), now);
    assert.equal(Number(x.store.getById(root.id).updated_at_ms), now);
    assert.deepEqual(JSON.parse(application.result_json), {
      code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'ALREADY_ABSENT'
    });
  });
  assert.equal(x.store.getById(localPending.id).state, 'CANCELLED');
  assert.equal(x.store.getById(localRetry.id).state, 'CANCELLED');
  assert.equal(Number(x.store.getById(localPending.id).cancelled_at_ms), now);
  assert.equal(Number(x.store.getById(localRetry.id).cancelled_at_ms), now);
  replayCases.forEach(function (entry, index) {
    assert.deepEqual(x.store.getById(entry.child.id), replayBefore[index].child);
    assert.deepEqual(x.store.getById(entry.root.id), replayBefore[index].root);
    assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id IN (?,?)')
      .get(entry.root.id, entry.child.id).n, 0);
  });
  assert.deepEqual(x.store.getById(roots[3].id), runningBefore);
  var metaAfter = task4Rows(x.kho).meta;
  assert.equal(metaAfter.filter(function (row) {
    return row.key === 'durable_first_mutation_at_ms';
  }).length, 1);
  assert.equal(metaAfter.find(function (row) {
    return row.key === 'durable_first_mutation_at_ms';
  }).value, String(now));
  assert.equal(Number(metaAfter.find(function (row) {
    return row.key === 'durable_first_mutation_at_ms';
  }).updated_at_ms), now);
  assert.deepEqual(metaAfter.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms';
  }), metadataBefore.meta.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms';
  }));
  assert.deepEqual(task4Rows(x.kho).lease, metadataBefore.lease);
  assert.equal(x.store.globalWatermarkS(now), 303);
});

test('Task 4 sweep skips existing-source exact, terminal, and non-orphan rows and rolls back between candidates',
  function (t) {
  var events = require('../server/scheduler/events.js');
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000437');
  task4InstallScheduler(x);
  var live = task4LiveInboundRoot(x, lease, 360, 'TASK4_RED_SWEEP_EXACT_ROOT');
  var exact = live.root;
  var exactRef = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).find(function (row) {
    return row.logical_root_id === exact.id;
  }).canonical_ref;
  var mismatchRef = Object.assign({}, exactRef, {arrivalAtS: exactRef.arrivalAtS + 3});
  var mismatch = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalForRef(mismatchRef, 2), x.clock.nowMs());
  }, {immediate: true});
  assert.equal(Number(exact.scheduled_at_s), live.arrivalAtS, 'TASK4_RED_SWEEP_EXACT_ROOT');
  assert.equal(Number(mismatch.scheduled_at_s), live.arrivalAtS + 3,
    'TASK4_RED_SWEEP_EXISTING_REF_MISMATCH');
  assert.equal(events.canonicalExternalStatus(x.kho, exactRef), 'EXACT', 'TASK4_RED_SWEEP_EXACT_ROOT');
  assert.equal(events.canonicalExternalStatus(x.kho, mismatchRef), 'REF_MISMATCH',
    'TASK4_RED_SWEEP_EXISTING_REF_MISMATCH');
  var terminal = x.kho.trongGiaoDich(function () {
    var row = x.store.schedule(lease, x.globalFor(1, 2, 361), x.clock.nowMs());
    x.kho.db.prepare("UPDATE event_jobs SET state='CANCELLED',cancel_reason='TEST',cancelled_at_ms=? WHERE id=?")
      .run(x.clock.nowMs(), row.id);
    return row;
  }, {immediate: true});
  var local = x.kho.trongGiaoDich(function () {
    return task4ReconcileWake(x, lease, 2, 362);
  }, {immediate: true});
  assert.equal(Number(local.priority), 200, 'TASK4_RED_SWEEP_RECONCILE_PRIORITY');
  assert.equal(JSON.parse(local.payload_json).reconcile, true, 'TASK4_RED_SWEEP_RECONCILE_PRIORITY');
  var beforeSkips = task4Rows(x.kho);
  assert.deepEqual(x.store.sweepDeletedAccountOrphans(lease, x.clock.nowMs()),
    {local: 0, global: 0, protectedReplay: 0, running: 0});
  [exact.id, mismatch.id, terminal.id, local.id].forEach(function (id) {
    assert.deepEqual(x.store.getById(id), beforeSkips.jobs.find(function (row) { return row.id === id; }));
  });
  var y = task4Fixture(t), yLease = layLease(y, '00000000-0000-4000-8000-000000000438');
  var now = y.clock.nowMs() + 4_000;
  var candidates = y.kho.trongGiaoDich(function () {
    return [y.store.schedule(yLease, y.globalFor(1, 2, 370), now),
      y.store.schedule(yLease, y.globalFor(1, 2, 371), now)];
  }, {immediate: true});
  y.kho.q.tkXoa.run(1);
  var beforeLoss = task4Rows(y.kho);
  var release = y.store.releaseBlockedAccountDependents, releases = [];
  // A transparent probe (never a fake Store result) flips only *after* the
  // first candidate's application, terminal transition, and release call.
  y.store.releaseBlockedAccountDependents = function () {
    var result = release.apply(this, arguments);
    releases.push(arguments[1]);
    if (releases.length === 1) y.kho.db.prepare(
      "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
    ).run();
    return result;
  };
  try {
    assert.throws(function () { y.store.sweepDeletedAccountOrphans(yLease, now); }, /LEASE_LOST/,
      'TASK4_RED_SWEEP_BETWEEN_CANDIDATES');
  } finally { y.store.releaseBlockedAccountDependents = release; }
  assert.deepEqual(releases, [candidates[0].id], 'TASK4_RED_SWEEP_BETWEEN_CANDIDATES');
  assert.deepEqual(task4Rows(y.kho), beforeLoss);
  var z = task4Fixture(t), zLease = layLease(z, '00000000-0000-4000-8000-000000000449');
  var zNow = z.clock.nowMs() + 4000, zRoot = z.kho.trongGiaoDich(function () {
    return z.store.schedule(zLease, z.globalFor(1, 2, 380), zNow);
  }, {immediate: true});
  z.kho.q.tkXoa.run(1);
  var zBefore = task4Rows(z.kho), zRelease = z.store.releaseBlockedAccountDependents;
  z.store.releaseBlockedAccountDependents = function () {
    var result = zRelease.apply(this, arguments);
    z.kho.db.prepare("UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'").run();
    return result;
  };
  try {
    assert.throws(function () { z.store.sweepDeletedAccountOrphans(zLease, zNow); }, /LEASE_LOST/,
      'TASK4_REVIEW_SINGLE_SWEEP_FINAL_FENCE');
  } finally { z.store.releaseBlockedAccountDependents = zRelease; }
  assert.deepEqual(task4Rows(z.kho), zBefore, 'TASK4_REVIEW_SINGLE_SWEEP_FINAL_FENCE');
});

test('Task 4 preserves PENDING RETRY_WAIT RUNNING QUARANTINED replay children and a RUNNING root byte-for-byte',
  function (t) {
  ['PENDING', 'RETRY_WAIT', 'RUNNING', 'QUARANTINED'].forEach(function (state, index) {
    var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-00000000042' + index);
    task4InstallScheduler(x);
    var root = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, x.globalFor(1, 2, 320 + index), x.clock.nowMs());
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(row.id);
      return row;
    }, {immediate: true});
    var child = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, replayJobFrom(x.store.getById(root.id),
        'task4-' + String(state).toLowerCase()), x.clock.nowMs());
    }, {immediate: true});
    if (state === 'RETRY_WAIT') danhDauRetry(x.kho, child.idempotency_key, x.clock.nowMs() + 60_000);
    if (state === 'RUNNING') child = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(lease, child.id, x.clock.nowMs(), 15_000, {allowFuturePending: true});
    }, {immediate: true});
    if (state === 'QUARANTINED') x.kho.db.prepare(
      "UPDATE event_jobs SET state='QUARANTINED',error_code='TEST_CHILD' WHERE id=?"
    ).run(child.id);
    var local = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:' + (20 + index), 320 + index, 100), x.clock.nowMs());
    }, {immediate: true});
    var childBefore = x.store.getById(child.id), rootBefore = x.store.getById(root.id);
    var metadataBefore = task4Rows(x.kho);
    assert.equal(task4Delete(x, task4Mutation(lease, x.clock), 1, 'A'), null);
    assert.deepEqual(x.store.getById(child.id), childBefore);
    assert.deepEqual(x.store.getById(root.id), rootBefore);
    assert.equal(x.store.getById(local.id).state, 'CANCELLED', 'TASK4_RED_EXHAUSTIVE_REPLAY_LOCAL_CANCELLATION');
    assert.deepEqual(task4Rows(x.kho).meta, metadataBefore.meta);
    assert.deepEqual(task4Rows(x.kho).lease, metadataBefore.lease);
  });
  var y = task4Fixture(t), yLease = layLease(y, '00000000-0000-4000-8000-000000000423');
  task4InstallScheduler(y);
  var runningRoot = y.kho.trongGiaoDich(function () {
    var root = y.store.schedule(yLease, y.globalFor(1, 2, 330), y.clock.nowMs());
    return y.store.claimForResolution(yLease, root.id, y.clock.nowMs(), 15_000, {allowFuturePending: true});
  }, {immediate: true});
  var runningLocal = y.kho.trongGiaoDich(function () {
    return y.store.schedule(yLease, job('account-advance:1:30', 330, 100), y.clock.nowMs());
  }, {immediate: true});
  var before = task4Rows(y.kho);
  assert.equal(task4Delete(y, task4Mutation(yLease, y.clock), 1, 'A'), null);
  assert.deepEqual(y.store.getById(runningRoot.id),
    before.jobs.find(function (row) { return row.id === runningRoot.id; }));
  assert.equal(y.store.getById(runningLocal.id).state, 'CANCELLED');
  assert.deepEqual(task4Rows(y.kho).meta, before.meta);
  assert.deepEqual(task4Rows(y.kho).lease, before.lease);
});

test('Task 4 releases a real blocked ACCOUNT_ADVANCE only after invalidation application terminalizes', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000424');
  var now = x.clock.nowMs(), root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, NOW_S + 30), now);
  }, {immediate: true});
  var local = x.kho.trongGiaoDich(function () {
    var pending = x.store.schedule(lease, job('account-advance:1:0', NOW_S + 30, 100), now);
    var running = x.store.claimForResolution(lease, pending.id, now, 15_000, {allowFuturePending: true});
    return x.store.blockOwnedAccountAdvance(lease, running, 0, root.id, now);
  }, {immediate: true});
  assert.equal(local.blocked_by_job_id, root.id);
  var beforeRejectedInvalidation = task4Rows(x.kho);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'ALREADY_ABSENT', NOW_S + 31, now);
    }, {immediate: true});
  }, /INVALIDATION_EFFECTIVE_TIME_INVALID/);
  assert.deepEqual(task4Rows(x.kho), beforeRejectedInvalidation);
  assert.doesNotThrow(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'ALREADY_ABSENT', NOW_S + 30, now);
    }, {immediate: true});
  });
  assert.equal(x.store.getById(root.id).state, 'CANCELLED');
  assert.equal(x.store.getById(root.id).cancel_reason, 'ENTITY_REMOVED');
  assert.equal(Number(x.store.getById(root.id).cancelled_at_ms), now);
  var application = x.kho.db.prepare(
    'SELECT effective_at_s,applied_at_ms,result_json FROM event_applications WHERE job_id=?'
  ).get(root.id);
  assert.equal(Number(application.effective_at_s), NOW_S + 30);
  assert.equal(Number(application.applied_at_ms), now);
  assert.deepEqual(JSON.parse(application.result_json), {
    code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'ALREADY_ABSENT'
  });
  assert.equal(x.store.getById(local.id).blocked_by_job_id, null);
  assert.equal(x.store.getById(local.id).state, 'PENDING');
});

test('Task 4 rejects expired lease before application or watermark mutation', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000425');
  var root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, 340), x.clock.nowMs());
  }, {immediate: true});
  x.kho.db.prepare("UPDATE scheduler_lease SET expires_at_ms=? WHERE lease_name='global-writer'")
    .run(x.clock.nowMs());
  var before = task4Rows(x.kho);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'ALREADY_ABSENT', 340, x.clock.nowMs());
    }, {immediate: true});
  }, /LEASE_LOST/);
  assert.deepEqual(task4Rows(x.kho), before);
});

test('Task 4 keeps current RUNNING wake and supersedes stale normal wake', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000426');
  task4InstallScheduler(x);
  var now = x.clock.nowMs(), stale = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, job('account-advance:1:0', NOW_S + 50, 100), now);
  }, {immediate: true});
  var st = x.state(1);
  var mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  assert.equal(x.store.getById(stale.id).state, 'CANCELLED', 'TASK4_RED_CURRENT_WAKE_SUPERSESSION');
  var current = task4AccountWakes(x.kho, 1)[0];
  var running = x.kho.trongGiaoDich(function () {
    return x.store.claimForResolution(lease, current.id, now, 15_000, {allowFuturePending: true});
  }, {immediate: true});
  mutation = task4Mutation(lease, x.clock);
  var continuationSaveOptions = {
    mutation: mutation, currentAccountAdvanceJobId: running.id, deferAccountWake: true
  };
  assert.equal(Object.hasOwn(mutation, 'currentAccountAdvanceJobId'), false,
    'TASK4_RED_CURRENT_WAKE_OPTIONS_NOT_MUTATION');
  assert.equal(Object.hasOwn(mutation, 'deferAccountWake'), false,
    'TASK4_RED_CURRENT_WAKE_OPTIONS_NOT_MUTATION');
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, continuationSaveOptions);
  });
  assert.equal(x.store.getById(running.id).state, 'RUNNING');
  assert.equal(task4AccountWakes(x.kho, 1).filter(function (row) {
    return row.state === 'PENDING' || row.state === 'RETRY_WAIT';
  }).length, 0);
});
// BEGIN TASK5_TESTS
var TASK5_MODULE = Object.freeze({
  snapshot: '../server/scheduler/combat-snapshot.js',
  advance: '../server/scheduler/advance-service.js',
  reducers: '../server/scheduler/reducers.js'
});
function task5Lazy(name, redTag) {
  try { return require(TASK5_MODULE[name]); }
  catch (error) {
    var expected = "Cannot find module '" + TASK5_MODULE[name] + "'";
    var missing = error && error.code === 'MODULE_NOT_FOUND' &&
      typeof error.message === 'string' && error.message.split('\n')[0] === expected;
    if (missing) throw new Error(redTag);
    throw error;
  }
}

test('Task 5 combat snapshot module exposes the frozen surface', function () {
  var snapshot = task5Lazy('snapshot', 'TASK5_SURFACE_SNAPSHOT_MODULE');
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'buildCombatSnapshotV1', 'seed32', 'validateCombatSnapshotV1'
  ], 'TASK5_SURFACE_SNAPSHOT_MODULE');
  assert.equal(snapshot.seed32.length, 4, 'TASK5_SURFACE_SNAPSHOT_MODULE');
  assert.equal(snapshot.buildCombatSnapshotV1.length, 1, 'TASK5_SURFACE_SNAPSHOT_MODULE');
  assert.equal(snapshot.validateCombatSnapshotV1.length, 2, 'TASK5_SURFACE_SNAPSHOT_MODULE');
});

test('Task 5 Store exposes seed and committed-application surfaces', function () {
  var prototype = task2StoreModule().SchedulerStore.prototype;
  if (typeof prototype.getOrCreateCombatSeedKey !== 'function' ||
      typeof prototype.hasCommittedApplication !== 'function') {
    throw new Error('TASK5_SURFACE_STORE_APPLICATION');
  }
  assert.equal(typeof prototype.getOrCreateCombatSeedKey, 'function',
    'TASK5_SURFACE_STORE_APPLICATION');
  assert.equal(prototype.getOrCreateCombatSeedKey && prototype.getOrCreateCombatSeedKey.length, 2,
    'TASK5_SURFACE_STORE_APPLICATION');
  assert.equal(typeof prototype.hasCommittedApplication, 'function',
    'TASK5_SURFACE_STORE_APPLICATION');
  assert.equal(prototype.hasCommittedApplication && prototype.hasCommittedApplication.length, 3,
    'TASK5_SURFACE_STORE_APPLICATION');
  assert.equal(prototype.insertApplication.length, 5, 'TASK5_SURFACE_STORE_APPLICATION');
});

test('Task 5 Store exposes a private executable-capability verifier', function () {
  var storeModule = task2StoreModule();
  var prototype = storeModule.SchedulerStore.prototype;
  if (typeof prototype.assertCanonicalExecutable !== 'function') {
    throw new Error('TASK5_SURFACE_STORE_CAPABILITY');
  }
  assert.equal(typeof prototype.assertCanonicalExecutable, 'function',
    'TASK5_SURFACE_STORE_CAPABILITY');
  assert.equal(prototype.assertCanonicalExecutable && prototype.assertCanonicalExecutable.length, 3,
    'TASK5_SURFACE_STORE_CAPABILITY');
  assert.equal(Object.keys(storeModule).some(function (key) {
    return /brand|capabil|executable/i.test(key);
  }), false, 'TASK5_SURFACE_STORE_CAPABILITY');
  assert.deepEqual(Object.getOwnPropertySymbols(prototype), [],
    'TASK5_SURFACE_STORE_CAPABILITY');
});

function task5SqliteSnapshot(kho) {
  var queries = {
    scheduler_lease: 'SELECT * FROM scheduler_lease ORDER BY lease_name',
    cauhinh: 'SELECT * FROM cauhinh ORDER BY k',
    dq: 'SELECT * FROM dq ORDER BY tk',
    ht: 'SELECT * FROM ht ORDER BY td',
    hamdang: 'SELECT * FROM hamdang ORDER BY tkA,fid',
    hamgiu: 'SELECT * FROM hamgiu ORDER BY tkA,fid',
    npc: 'SELECT * FROM npc ORDER BY key',
    pl: 'SELECT * FROM pl ORDER BY td',
    bangtin: 'SELECT * FROM bangtin ORDER BY id',
    tran: 'SELECT * FROM tran ORDER BY id',
    scheduler_meta: 'SELECT * FROM scheduler_meta ORDER BY key',
    event_jobs: 'SELECT * FROM event_jobs ORDER BY id',
    event_applications: 'SELECT * FROM event_applications ORDER BY idempotency_key',
    scheduler_audit: 'SELECT * FROM scheduler_audit ORDER BY id'
  };
  var value = Object.keys(queries).sort().reduce(function (out, table) {
    out[table] = kho.db.prepare(queries[table]).all();
    return out;
  }, {});
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function task5DomainError(fn, code) {
  try { fn(); }
  catch (error) {
    if (error && (error.code === code || error.message === code)) return true;
    throw error;
  }
  return false;
}

function task5ClaimExecutable(x, lease, specification) {
  var stored = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, specification, x.clock.nowMs());
  }, {immediate: true});
  var claimed = x.kho.trongGiaoDich(function () {
    return x.store.claimForResolution(
      lease, stored.id, x.clock.nowMs(), 15_000, {allowFuturePending: true}
    );
  }, {immediate: true});
  assert.ok(claimed);
  return x.kho.trongGiaoDich(function () {
    return x.store.loadExecutableJob(lease, claimed, x.clock.nowMs());
  }, {immediate: true});
}

function task5SnapshotFixture(executableJob, keyHex) {
  var events = require('../server/scheduler/events.js');
  var ref = executableJob && executableJob.payload && executableJob.payload.ref || {
    kind: 'fleet', ownerAccountId: 1, fleetId: 91, launchAtS: NOW_S - 10,
    targetKey: '2:2:2', arrivalAtS: NOW_S, mission: 'attack'
  };
  var matchId = events.derivePvpMatchId(ref, 2);
  var jobValue = executableJob || {
    kind: 'PVP_RESOLVE', scheduled_at_s: ref.arrivalAtS,
    payload: {schemaVersion: 1, matchId: matchId, ref: ref}
  };
  return {
    executableJob: jobValue,
    seedKeyHex: keyHex,
    attacker: {
      accountId: ref.ownerAccountId, revision: 7, fleetId: ref.fleetId,
      tech: {weapon: 2, shield: 1, armor: 3}, ships: {fighterL: 12},
      linh: {robot: 4}, cargo: {metal: 5, crystal: 6, deut: 7, food: 8}
    },
    defender: {
      accountId: 2, revision: 9, targetKey: ref.targetKey,
      tech: {weapon: 1, shield: 2, armor: 1}, ships: {fighterL: 5},
      def: {missileLauncher: 3}, linh: {robot: 2},
      res: {metal: 100, crystal: 90, deut: 80, food: 70},
      terrain: {thuDat: 1, loaiHT: 'fixture'}
    },
    supporters: [{
      accountId: 2, revision: 9, fleetId: 3,
      tech: {weapon: 1, shield: 2, armor: 1}, ships: {fighterL: 2}
    }, {
      accountId: 3, revision: 4, fleetId: 2,
      tech: {weapon: 0, shield: 0, armor: 0}, ships: {fighterL: 1}
    }]
  };
}

test('Task 5 Store owns lease-fenced combat seed creation in an immediate UoW', function (t) {
  var x = task4Fixture(t), storeModule = task2StoreModule();
  var lease = layLease(x, '00000000-0000-4000-8000-000000000501');
  var key = x.kho.trongGiaoDich(function () {
    return x.store.getOrCreateCombatSeedKey(lease, x.clock.nowMs());
  }, {immediate: true});
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) {
    throw new Error('TASK5_RED_SEED_STORE_AUTHORITY');
  }
  assert.equal(x.kho.cauhinh('combat_seed_key_v1'), key);
  assert.equal(x.kho.db.prepare("SELECT COUNT(*) AS n FROM cauhinh WHERE k='combat_seed_key_v1'").get().n, 1);
  assert.equal(x.store instanceof storeModule.SchedulerStore, true);
});

test('Task 5 combat seed creation rejects outside an open immediate UoW', function (t) {
  var x = task4Fixture(t), prototype = task2StoreModule().SchedulerStore.prototype;
  var lease = layLease(x, '00000000-0000-4000-8000-000000000502');
  var before = task5SqliteSnapshot(x.kho);
  var rejected = task5DomainError(function () {
    prototype.getOrCreateCombatSeedKey.call(x.store, lease, x.clock.nowMs());
  }, 'SCHEDULER_UOW_REQUIRED');
  if (!rejected || !task5SqliteSnapshot(x.kho).equals(before)) {
    throw new Error('TASK5_RED_SEED_REQUIRES_UOW');
  }
  assert.equal(x.kho.cauhinh('combat_seed_key_v1'), null);
});

test('Task 5 combat seed statement and post-write fences roll back scheduler lease too', function (t) {
  var x = task4Fixture(t), prototype = task2StoreModule().SchedulerStore.prototype;
  var lease = layLease(x, '00000000-0000-4000-8000-000000000503');
  var before = task5SqliteSnapshot(x.kho);
  var stale = {ownerId: lease.ownerId, generation: lease.generation + 1};
  var staleRejected = task5DomainError(function () {
    x.kho.trongGiaoDich(function () {
      prototype.getOrCreateCombatSeedKey.call(x.store, stale, x.clock.nowMs());
    }, {immediate: true});
  }, 'LEASE_LOST');
  var originalPrepare = x.kho.db.prepare, flipped = false, postRejected = false;
  x.kho.db.prepare = function (sql) {
    var statement = originalPrepare.apply(this, arguments);
    if (/INSERT[\s\S]*combat_seed_key_v1/i.test(String(sql))) {
      var originalRun = statement.run;
      statement.run = function () {
        var result = originalRun.apply(this, arguments);
        originalPrepare.call(x.kho.db,
          "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
        ).run();
        flipped = true;
        return result;
      };
    }
    return statement;
  };
  try {
    postRejected = task5DomainError(function () {
      x.kho.trongGiaoDich(function () {
        prototype.getOrCreateCombatSeedKey.call(x.store, lease, x.clock.nowMs());
      }, {immediate: true});
    }, 'LEASE_LOST');
  } finally { x.kho.db.prepare = originalPrepare; }
  if (!staleRejected || !flipped || !postRejected || !task5SqliteSnapshot(x.kho).equals(before)) {
    throw new Error('TASK5_RED_SEED_POST_WRITE_FENCE');
  }
  assert.equal(x.kho.cauhinh('combat_seed_key_v1'), null);
});

test('Task 5 competing holders and restart converge on one persisted combat seed', function (t) {
  var x = task4Fixture(t), Store = task2StoreModule().SchedulerStore;
  var firstLease = layLease(x, '00000000-0000-4000-8000-000000000504');
  var first = x.kho.trongGiaoDich(function () {
    return x.store.getOrCreateCombatSeedKey(firstLease, x.clock.nowMs());
  }, {immediate: true});
  if (typeof first !== 'string' || !/^[0-9a-f]{64}$/.test(first)) {
    throw new Error('TASK5_RED_SEED_CONVERGENCE');
  }
  var secondKho = new Kho(x.file), secondStore;
  try {
    apDungMigrationScheduler(secondKho, x.clock.nowMs());
    secondStore = new Store(secondKho, x.clock);
    assert.equal(secondStore.acquireLease(
      '00000000-0000-4000-8000-000000000505', x.clock.nowMs(), 15_000
    ), null);
    x.clock.advanceMs(15_001);
    var secondToken = secondStore.acquireLease(
      '00000000-0000-4000-8000-000000000505', x.clock.nowMs(), 15_000
    );
    assert.ok(secondToken);
    var second = secondKho.trongGiaoDich(function () {
      return secondStore.getOrCreateCombatSeedKey(secondToken, x.clock.nowMs());
    }, {immediate: true});
    assert.equal(second, first);
    assert.equal(secondKho.cauhinh('combat_seed_key_v1'), first);
    var beforeStandby = task5SqliteSnapshot(secondKho);
    assert.equal(new Store(secondKho, x.clock).schedulerMode(), 'legacy');
    assert.ok(task5SqliteSnapshot(secondKho).equals(beforeStandby));
  } finally { secondKho.dong(); }
});

test('Task 5 seed32 is the sole big-endian HMAC implementation', function () {
  var snapshotModule = task5Lazy('snapshot');
  var key = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  if (snapshotModule.seed32(key, 'match-42', 1_700_000_000, 1) !== 0x09367fa0) {
    throw new Error('TASK5_RED_HMAC_BE_SINGLE_OWNER');
  }
  [
    function () { snapshotModule.seed32('00', 'match-42', 1_700_000_000, 1); },
    function () { snapshotModule.seed32(key, '', 1_700_000_000, 1); },
    function () { snapshotModule.seed32(key, 'match-42', -1, 1); },
    function () { snapshotModule.seed32(key, 'match-42', 1_700_000_000, 2); }
  ].forEach(function (probe) { assert.throws(probe); });
  var schedulerDirectory = path.join(__dirname, '..', 'server', 'scheduler');
  var sources = fs.readdirSync(schedulerDirectory).filter(function (name) {
    return name.endsWith('.js');
  }).map(function (name) {
    return {name: name, text: fs.readFileSync(path.join(schedulerDirectory, name), 'utf8')};
  });
  var hmacOwners = sources.filter(function (entry) { return entry.text.includes('createHmac'); });
  var beOwners = sources.filter(function (entry) { return entry.text.includes('readUInt32BE'); });
  assert.deepEqual(hmacOwners.map(function (entry) { return entry.name; }), ['combat-snapshot.js']);
  assert.deepEqual(beOwners.map(function (entry) { return entry.name; }), ['combat-snapshot.js']);
  assert.equal((hmacOwners[0].text.match(/createHmac/g) || []).length, 1);
  assert.equal((beOwners[0].text.match(/readUInt32BE\s*\(\s*0\s*\)/g) || []).length, 1);
});

test('Task 5 combat snapshot v1 validates exact schema and canonical T context', function () {
  var snapshotModule = task5Lazy('snapshot');
  var key = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  var input = task5SnapshotFixture(null, key);
  var snapshot = snapshotModule.buildCombatSnapshotV1(input);
  if (!snapshot || Object.keys(snapshot).join(',') !==
      'schemaVersion,matchId,arrivalAtS,seed,attacker,defender,supporters') {
    throw new Error('TASK5_RED_SNAPSHOT_CANONICAL_T');
  }
  var context = {executableJob: input.executableJob, seedKeyHex: key,
    canonicalTContext: {snapshot: snapshot, seedKeyHex: key}};
  assert.strictEqual(snapshotModule.validateCombatSnapshotV1(snapshot, context), snapshot);
  [
    function (copy) { copy.schemaVersion = 2; },
    function (copy) { copy.matchId = '0'.repeat(64); },
    function (copy) { copy.arrivalAtS += 1; },
    function (copy) { copy.seed = (copy.seed + 1) >>> 0; },
    function (copy) { copy.attacker.revision += 1; },
    function (copy) { copy.defender.targetKey = '9:9:9'; },
    function (copy) { copy.supporters.reverse(); }
  ].forEach(function (mutate) {
    var changed = JSON.parse(JSON.stringify(snapshot));
    mutate(changed);
    assert.throws(function () {
      snapshotModule.validateCombatSnapshotV1(changed, context);
    }, /PAYLOAD_INTEGRITY/);
  });
});

test('Task 5 duplicate PvP application revalidates immutable snapshot after restart', function (t) {
  var x = task4Fixture(t), Store = task2StoreModule().SchedulerStore;
  var snapshotModule = task5Lazy('snapshot');
  var lease = layLease(x, '00000000-0000-4000-8000-000000000506');
  var executable = task5ClaimExecutable(x, lease, x.globalFor(1, 2, NOW_S + 1));
  var key, snapshot, application, firstRow;
  x.kho.trongGiaoDich(function () {
    key = x.store.getOrCreateCombatSeedKey(lease, x.clock.nowMs());
    if (typeof key !== 'string') throw new Error('TASK5_RED_SNAPSHOT_RESTART');
    var input = task5SnapshotFixture(executable, key);
    snapshot = snapshotModule.buildCombatSnapshotV1(input);
    application = {effectiveAtS: Number(executable.scheduled_at_s), snapshot: snapshot,
      result: {code: 'PVP_RESOLVED'}};
    x.store.insertApplication(lease, executable, application, x.clock.nowMs(),
      {snapshot: snapshot, seedKeyHex: key});
  }, {immediate: true});
  firstRow = x.kho.db.prepare(
    'SELECT * FROM event_applications WHERE idempotency_key=?'
  ).get(executable.idempotency_key);
  x.kho.dong();
  x.kho = new Kho(x.file);
  apDungMigrationScheduler(x.kho, x.clock.nowMs());
  x.store = new Store(x.kho, x.clock);
  var fresh = x.store.loadExecutableJob(lease, x.store.getById(executable.id), x.clock.nowMs());
  assert.equal(x.store.hasCommittedApplication(lease, fresh, x.clock.nowMs()), true);
  var duplicate = x.kho.trongGiaoDich(function () {
    return x.store.insertApplication(lease, fresh, application, x.clock.nowMs(), null);
  }, {immediate: true});
  assert.equal(duplicate.alreadyApplied, true);
  assert.deepEqual(x.kho.db.prepare(
    'SELECT * FROM event_applications WHERE idempotency_key=?'
  ).get(executable.idempotency_key), firstRow);
  assert.equal(x.kho.cauhinh('combat_seed_key_v1'), key);
});

test('Task 5 executable capability rejects clones and accepts genuine reloads', function (t) {
  var x = task4Fixture(t), Store = task2StoreModule().SchedulerStore;
  var lease = layLease(x, '00000000-0000-4000-8000-000000000507');
  var executable = task5ClaimExecutable(x, lease, job(
    'account-advance:1:0', NOW_S, 100, {aggregateId: '1', expectedRevision: 0}
  ));
  var verified = x.store.assertCanonicalExecutable(lease, executable, x.clock.nowMs());
  if (!verified || verified === executable || !Object.isFrozen(verified)) {
    throw new Error('TASK5_RED_EXECUTABLE_BRAND_LIFECYCLE');
  }
  var clones = [Object.freeze(Object.assign({}, executable)),
    Object.freeze(Object.assign({}, executable, {payload: executable.payload})),
    JSON.parse(JSON.stringify(executable)), x.store.loadImmutableJobForAudit(executable.id)];
  clones.forEach(function (candidate) {
    assert.equal(task5DomainError(function () {
      x.store.assertCanonicalExecutable(lease, candidate, x.clock.nowMs());
    }, 'PAYLOAD_INTEGRITY'), true);
  });
  var otherStore = new Store(x.kho, x.clock);
  assert.equal(task5DomainError(function () {
    otherStore.assertCanonicalExecutable(lease, executable, x.clock.nowMs());
  }, 'PAYLOAD_INTEGRITY'), true);
  x.kho.dong();
  x.kho = new Kho(x.file);
  apDungMigrationScheduler(x.kho, x.clock.nowMs());
  x.store = new Store(x.kho, x.clock);
  assert.equal(task5DomainError(function () {
    x.store.assertCanonicalExecutable(lease, executable, x.clock.nowMs());
  }, 'PAYLOAD_INTEGRITY'), true);
  var reopened = x.store.loadExecutableJob(lease, x.store.getById(executable.id), x.clock.nowMs());
  assert.ok(x.store.assertCanonicalExecutable(lease, reopened, x.clock.nowMs()));
});

test('Task 5 executable branding preserves every accepted loader validation', function (t) {
  var x = task4Fixture(t), storeModule = task2StoreModule();
  var lease = layLease(x, '00000000-0000-4000-8000-000000000508');
  var pending = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, job(
      'account-advance:1:0', NOW_S, 100, {aggregateId: '1', expectedRevision: 0}
    ), x.clock.nowMs());
  }, {immediate: true});
  var claimed = x.kho.trongGiaoDich(function () {
    return x.store.claimForResolution(
      lease, pending.id, x.clock.nowMs(), 15_000, {allowFuturePending: true}
    );
  }, {immediate: true});
  var executable = x.store.loadExecutableJob(lease, claimed, x.clock.nowMs());
  var canonical = x.store.assertCanonicalExecutable(lease, executable, x.clock.nowMs());
  if (!canonical) throw new Error('TASK5_RED_EXECUTABLE_BRAND_VALIDATION');
  [pending, claimed, Object.assign({}, executable, {locked_by: 'wrong'}),
    Object.assign({}, executable, {locked_generation: lease.generation + 1}),
    Object.assign({}, executable, {payload: Object.assign({}, executable.payload, {schemaVersion: 99})})
  ].forEach(function (candidate) {
    assert.equal(task5DomainError(function () {
      x.store.assertCanonicalExecutable(lease, candidate, x.clock.nowMs());
    }, 'PAYLOAD_INTEGRITY'), true);
  });
  assert.equal(Object.keys(storeModule).some(function (name) {
    return /brand|capabil|registry/i.test(name);
  }), false);
  assert.equal(Object.getOwnPropertyNames(executable).some(function (name) {
    return /brand|capabil|registry/i.test(name);
  }), false);
});

test('Task 5 advance service module exposes its frozen exports', function () {
  var advance = task5Lazy('advance', 'TASK5_SURFACE_ADVANCE_MODULE');
  assert.deepEqual(Object.keys(advance).sort(), ['GameAdvanceService', 'toPublicAdvanceResult'],
    'TASK5_SURFACE_ADVANCE_MODULE');
  assert.equal(advance.GameAdvanceService.length, 1, 'TASK5_SURFACE_ADVANCE_MODULE');
  assert.equal(advance.toPublicAdvanceResult.length, 1, 'TASK5_SURFACE_ADVANCE_MODULE');
});

test('Task 5 advance service prototype exposes every frozen method', function () {
  var advance = task5Lazy('advance', 'TASK5_SURFACE_ADVANCE_PROTOTYPE');
  var prototype = advance.GameAdvanceService.prototype;
  assert.equal(prototype.advanceTo.length, 4, 'TASK5_SURFACE_ADVANCE_PROTOTYPE');
  assert.equal(prototype.advanceLocalOnlyTo.length, 5, 'TASK5_SURFACE_ADVANCE_PROTOTYPE');
  assert.equal(prototype.advanceBarrier.length, 2, 'TASK5_SURFACE_ADVANCE_PROTOTYPE');
  assert.equal(prototype.preflightCutover.length, 4, 'TASK5_SURFACE_ADVANCE_PROTOTYPE');
});

function task5AdvanceFixture(t, ownerId) {
  var x = task4Fixture(t), advance = task5Lazy('advance');
  task4InstallScheduler(x);
  x.lease = layLease(x, ownerId);
  x.service = new advance.GameAdvanceService({
    kho: x.kho, world: x.world, store: x.store, clock: x.clock
  });
  x.world.datAdvanceService(x.service);
  return x;
}

function task5SaveCanonical(x, accountId, state) {
  return x.kho.trongGiaoDich(function () {
    var mutation = task4Mutation(x.lease, x.clock);
    return x.world.trongMutationScheduler(mutation, function () {
      return x.world.luu(accountId, state, {mutation: mutation});
    });
  }, {immediate: true});
}

function task5Timeline(state, atS, count) {
  state.now = atS - 1;
  state.lastTick = atS - 1;
  state.nextRaid = atS + 9_000_000;
  state.nextMaint = atS + 9_000_000;
  if (state.baoTri) state.baoTri.nextAt = atS + 9_000_000;
  state.ncQueue = null;
  state.toi = [];
  state.tenLua = [];
  state.planets.forEach(function (planet) {
    planet.qB = [];
    planet.qS = [];
  });
  state.planets[0].qB = Array.from({length: count || 0}, function () {
    return {id: 'metalMine', n: 1, tg: 0, xong: atS};
  });
  return state;
}

function task5ClaimGlobal(x, atS) {
  return task5ClaimExecutable(x, x.lease, x.globalFor(1, 2, atS));
}

function task5RunBarrier(x, executable, budget) {
  var mutation = task4Mutation(x.lease, x.clock, {remainingBudget: budget});
  var result = x.kho.trongGiaoDich(function () {
    return x.world.trongMutationScheduler(mutation, function () {
      x.store.markDurableMutation(x.lease, x.clock.nowMs());
      return x.service.advanceBarrier(mutation, executable);
    });
  }, {immediate: true});
  return {result: result, mutation: mutation};
}

function task5DirectStateWrite(x, accountId, state) {
  x.kho.q.dqLuuState.run(JSON.stringify(state), Number(state.lastTick), accountId);
}

function task5AddAccount(x, accountId, name) {
  x.kho.q.tkThem.run('task5-' + accountId, name, PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
  x.kho.trongGiaoDich(function () {
    var mutation = task4Mutation(x.lease, x.clock);
    task4Batch(x, mutation, function () {
      x.world.taoDeQuoc(accountId, name, {mutation: mutation});
    });
  }, {immediate: true});
  return x.world.nap(accountId).st;
}

test('Task 5 barrier consumes only a Store-branded current executable', function (t) {
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000510');
  var executable = task5ClaimGlobal(x, NOW_S + 1), clone = Object.freeze(Object.assign({}, executable));
  var before = task5SqliteSnapshot(x.kho);
  var rejected = task5DomainError(function () {
    task5RunBarrier(x, clone, {value: 10});
  }, 'PAYLOAD_INTEGRITY');
  if (!rejected || !task5SqliteSnapshot(x.kho).equals(before)) {
    throw new Error('TASK5_RED_BARRIER_EXECUTABLE_ONLY');
  }
  var fresh = x.store.loadExecutableJob(x.lease, x.store.getById(executable.id), x.clock.nowMs());
  assert.equal(typeof task5RunBarrier(x, fresh, {value: 10}).result, 'object');
  assert.equal(task2StoreModule().SchedulerStore.prototype.assertCanonicalExecutable.length, 3);
});

test('Task 5 public AdvanceResult is exact and rejects coercible internal values', function () {
  var advance = task5Lazy('advance');
  var accepted = advance.toPublicAdvanceResult({
    processed: 1, advancedToS: 10, nextDueAtS: null,
    hasMoreDue: false, budgetExhausted: false,
    blockedExternal: false, saveReceipt: null, checkpointJobId: null,
    deferredExternal: false, blockedExternalJobId: null
  });
  var invalid = [
    {processed: '1', advancedToS: 10, nextDueAtS: null, hasMoreDue: false, budgetExhausted: false},
    {processed: 1, advancedToS: -1, nextDueAtS: null, hasMoreDue: false, budgetExhausted: false},
    {processed: 1, advancedToS: 10, nextDueAtS: undefined, hasMoreDue: false, budgetExhausted: false},
    {processed: 1, advancedToS: 10, nextDueAtS: null, hasMoreDue: 0, budgetExhausted: false},
    {processed: 1, advancedToS: 10, nextDueAtS: null, hasMoreDue: false,
      budgetExhausted: false, invented: true}
  ];
  var rejected = invalid.every(function (value) {
    return task5DomainError(function () { advance.toPublicAdvanceResult(value); }, 'ADVANCE_RESULT_INVALID');
  });
  if (!rejected) throw new Error('TASK5_RED_PUBLIC_ADVANCE_RESULT');
  assert.deepEqual(accepted, {processed: 1, advancedToS: 10, nextDueAtS: null,
    hasMoreDue: false, budgetExhausted: false});
  assert.deepEqual(Object.keys(accepted), [
    'processed', 'advancedToS', 'nextDueAtS', 'hasMoreDue', 'budgetExhausted'
  ]);
});

test('Task 5 preflightCutover is deterministic and writes no durable or world state', function (t) {
  var advance = task5Lazy('advance');
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000511');
  var before = task5SqliteSnapshot(x.kho), budget = {value: 10};
  var first = x.service.preflightCutover(x.lease, NOW_S, budget, x.clock.nowMs());
  var secondBudget = {value: 10};
  var second = x.service.preflightCutover(x.lease, NOW_S, secondBudget, x.clock.nowMs());
  var rejectsInvalid = task5DomainError(function () {
    x.service.preflightCutover(x.lease, -1, {value: 1}, x.clock.nowMs());
  }, 'PREFLIGHT_INPUT_INVALID');
  if (!rejectsInvalid) throw new Error('TASK5_RED_PREFLIGHT_NO_WRITE');
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ['processed', 'nextDueAtS', 'hasMoreDue']);
  assert.ok(task5SqliteSnapshot(x.kho).equals(before));
  assert.equal(budget.value, secondBudget.value);
  assert.equal(x.service instanceof advance.GameAdvanceService, true, 'TASK5_RED_PREFLIGHT_NO_WRITE');
});

test('Task 5 preflightCutover distinguishes exactly 50000 from 50001 due primitives', function (t) {
  task5Lazy('advance');
  var exact = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000512');
  var overflow = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000513');
  var atS = NOW_S + 2;
  task5DirectStateWrite(exact, 1, task5Timeline(exact.state(1), atS, 50_000));
  task5DirectStateWrite(overflow, 1, task5Timeline(overflow.state(1), atS, 50_001));
  var exactBudget = {value: 50_000}, overflowBudget = {value: 50_000};
  var exactResult = exact.service.preflightCutover(
    exact.lease, atS, exactBudget, exact.clock.nowMs()
  );
  var overflowResult = overflow.service.preflightCutover(
    overflow.lease, atS, overflowBudget, overflow.clock.nowMs()
  );
  if (exactResult.processed !== 50_000 || exactResult.hasMoreDue !== false ||
      overflowResult.processed !== 50_000 || overflowResult.hasMoreDue !== true) {
    throw new Error('TASK5_RED_PREFLIGHT_BUDGET_BOUNDARY');
  }
  assert.equal(exactResult.nextDueAtS, null);
  assert.equal(overflowResult.nextDueAtS, atS);
  assert.equal(exactBudget.value, 0);
  assert.equal(overflowBudget.value, 0);
});

test('Task 5 barrier scans canonical dq and repairs missing projections', function (t) {
  task5Lazy('advance');
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000514');
  var executable = task5ClaimGlobal(x, NOW_S + 1);
  x.kho.db.exec('DELETE FROM ht; DELETE FROM hamdang; DELETE FROM hamgiu;');
  var outcome = task5RunBarrier(x, executable, {value: 20}).result;
  var canonicalPlanets = x.kho.db.prepare('SELECT state FROM dq ORDER BY tk').all()
    .reduce(function (sum, row) { return sum + JSON.parse(row.state).planets.length; }, 0);
  var repaired = Number(x.kho.db.prepare('SELECT COUNT(*) AS n FROM ht').get().n);
  if (repaired !== canonicalPlanets) throw new Error('TASK5_RED_BARRIER_CANONICAL_REPAIR');
  assert.equal(outcome.hasMoreDue, false);
  assert.equal(x.kho.db.prepare(
    'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
  ).get(executable.id).n, 0);
});

test('Task 5 barrier rejects canonical owner conflict and repairs stale projections', function (t) {
  var stale = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000515');
  var staleExecutable = task5ClaimGlobal(stale, NOW_S + 1);
  var targetKey = staleExecutable.payload.ref.targetKey;
  stale.kho.db.prepare('UPDATE ht SET tk=? WHERE td=?').run(1, targetKey);
  task5RunBarrier(stale, staleExecutable, {value: 20});
  var repairedOwner = stale.kho.db.prepare('SELECT tk FROM ht WHERE td=?').get(targetKey);
  var conflict = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000516');
  var conflictExecutable = task5ClaimGlobal(conflict, NOW_S + 1);
  var state = conflict.state(1);
  state.planets.push(JSON.parse(JSON.stringify(conflict.state(2).planets[0])));
  task5DirectStateWrite(conflict, 1, state);
  var before = task5SqliteSnapshot(conflict.kho);
  var rejected = task5DomainError(function () {
    task5RunBarrier(conflict, conflictExecutable, {value: 20});
  }, 'CANONICAL_TARGET_OWNER_CONFLICT');
  if (!repairedOwner || Number(repairedOwner.tk) !== 2 || !rejected ||
      !task5SqliteSnapshot(conflict.kho).equals(before)) {
    throw new Error('TASK5_RED_BARRIER_PROJECTION_CONFLICT');
  }
  assert.equal(task2StoreModule().SchedulerStore.prototype.parkGlobalBehindPreceding.length, 5);
});

test('Task 5 barrier rescans to discover a supporter created by local work', function (t) {
  task5Lazy('advance');
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000517');
  var atS = NOW_S + 2, supporter = task5AddAccount(x, 3, 'Task5 Supporter');
  task5SaveCanonical(x, 1, task5Timeline(x.state(1), atS, 1));
  task5SaveCanonical(x, 2, task5Timeline(x.state(2), atS, 0));
  task5SaveCanonical(x, 3, task5Timeline(supporter, atS, 0));
  var executable = task5ClaimGlobal(x, atS), original = x.service.advanceLocalOnlyTo;
  var injected = false;
  x.service.advanceLocalOnlyTo = function (mutation, accountId, targetS, ownerFor, options) {
    var result = original.call(this, mutation, accountId, targetS, ownerFor, options);
    if (!injected && Number(accountId) === 1) {
      injected = true;
      var state = this.world.nap(3).st, target = this.world.nap(2).st.planets[0].c;
      state.fleets.push({id: 701, pi: 0, tu: state.planets[0].c, den: target,
        mission: 'hold', pha: 'giu', diLuc: atS - 10, den_t: atS - 5,
        giuLuc: atS - 5, giuDen_t: atS + 100, tiepNL_t: atS + 100,
        giuTaiTk: 2, ships: {fighterL: 1}, linh: {}, cargo: {}, pct: 100});
      this.world.luu(3, state, {mutation: mutation,
        protectedRecoveryRootIds: new Set([executable.logical_root_id])});
    }
    return result;
  };
  try { task5RunBarrier(x, executable, {value: 20}); }
  finally { x.service.advanceLocalOnlyTo = original; }
  if (!injected || Number(JSON.parse(x.kho.q.dqGet.get(3).state).lastTick) !== atS) {
    throw new Error('TASK5_RED_BARRIER_FIXED_POINT_DISCOVERY');
  }
  assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM hamgiu WHERE tkA=3').get().n, 1);
});

test('Task 5 barrier parks behind a newly discovered earlier logical root', function (t) {
  task5Lazy('advance');
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000518');
  var atS = NOW_S + 5, executable = task5ClaimGlobal(x, atS), state = x.state(1);
  state.fleets.push({id: 702, pi: 0, tu: state.planets[0].c, den: x.state(2).planets[0].c,
    mission: 'spy', pha: 'di', diLuc: NOW_S, den_t: atS - 1,
    ships: {probe: 1}, linh: {}, cargo: {}, pct: 100});
  task5DirectStateWrite(x, 1, state);
  var outcome = task5RunBarrier(x, executable, {value: 20}).result;
  var first = x.store.listLogicalBarrierJobsAtOrBefore(x.lease, atS, x.clock.nowMs())[0];
  if (x.store.getById(executable.id).state !== 'PENDING' || !first || first.id === executable.id) {
    throw new Error('TASK5_RED_BARRIER_LOGICAL_ORDER');
  }
  assert.equal(outcome.blockedExternal, true);
  assert.equal(outcome.blockedExternalJobId, first.id);
  assert.equal(x.kho.db.prepare(
    'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
  ).get(executable.id).n, 0);
});

test('Task 5 fixed point is stable across row candidate and restart permutations', function (t) {
  function run(ownerId, reverse) {
    var x = task5AdvanceFixture(t, ownerId), atS = NOW_S + 8, state = x.state(1);
    var defender = x.state(2);
    state.planets[0].c = {g: 7, h: 7, p: 1};
    defender.planets[0].c = {g: 7, h: 7, p: 2};
    var target = defender.planets[0].c;
    var fleets = [{id: 703, pi: 0, tu: state.planets[0].c, den: target,
      mission: 'spy', pha: 'di', diLuc: NOW_S, den_t: atS - 2,
      ships: {probe: 1}, linh: {}, cargo: {}, pct: 100},
    {id: 704, pi: 0, tu: state.planets[0].c, den: target,
      mission: 'transport', pha: 'di', diLuc: NOW_S, den_t: atS - 1,
      ships: {cargoS: 1}, linh: {}, cargo: {metal: 1}, pct: 100}];
    state.fleets = reverse ? fleets.slice().reverse() : fleets;
    task5DirectStateWrite(x, 1, state);
    task5DirectStateWrite(x, 2, defender);
    var executable = task5ClaimGlobal(x, atS);
    task5RunBarrier(x, executable, {value: 20});
    return x.store.listDerivedJobsForAccount(x.lease, 1, x.clock.nowMs())
      .map(function (row) { return [row.logical_key, Number(row.logical_scheduled_at_s),
        Number(row.logical_priority), Number(row.source_account_id)]; });
  }
  var forward = run('00000000-0000-4000-8000-000000000519', false);
  var reverse = run('00000000-0000-4000-8000-000000000520', true);
  if (forward.length < 2 || reverse.length < 2) {
    throw new Error('TASK5_RED_BARRIER_PERMUTATION');
  }
  assert.deepEqual(forward, reverse);
  assert.equal(task5Lazy('advance').GameAdvanceService.prototype.advanceBarrier.length, 2);
});

test('Task 5 semantic cycle detects A to B to A despite revision increments', function (t) {
  task5Lazy('advance');
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000521');
  var atS = NOW_S + 3;
  task5SaveCanonical(x, 1, task5Timeline(x.state(1), atS, 1));
  task5SaveCanonical(x, 2, task5Timeline(x.state(2), atS, 0));
  var executable = task5ClaimGlobal(x, atS), before = task5SqliteSnapshot(x.kho);
  var old = G.tickNoiBo, calls = 0, rejected;
  G.tickNoiBo = function (state, targetS, options) {
    calls++;
    options.remainingBudget.value -= 1;
    state.planets[0].qB = [{id: 'metalMine', n: calls % 2 ? 2 : 1, tg: 0, xong: atS}];
    return {processed: 1, advancedToS: atS - 1, nextDueAtS: atS,
      hasMoreDue: true, budgetExhausted: false};
  };
  try {
    rejected = task5DomainError(function () {
      task5RunBarrier(x, executable, {value: 20});
    }, 'BARRIER_FIXED_POINT_CYCLE');
  } finally { G.tickNoiBo = old; }
  if (!rejected || calls < 3 || !task5SqliteSnapshot(x.kho).equals(before)) {
    throw new Error('TASK5_RED_BARRIER_SEMANTIC_CYCLE');
  }
  assert.ok(calls <= 8);
});

test('Task 5 fixed point enforces convergence stall cycle and scan bounds', function (t) {
  task5Lazy('advance');
  var stable = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000522');
  var stableJob = task5ClaimGlobal(stable, NOW_S);
  var prepare = stable.kho.db.prepare, scans = 0;
  stable.kho.db.prepare = function (sql) {
    if (String(sql).trim() === 'SELECT tk,state,revision FROM dq ORDER BY tk') scans++;
    return prepare.apply(this, arguments);
  };
  try { task5RunBarrier(stable, stableJob, {value: 1}); }
  finally { stable.kho.db.prepare = prepare; }
  var stalled = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000523');
  var atS = NOW_S + 1;
  task5SaveCanonical(stalled, 1, task5Timeline(stalled.state(1), atS, 1));
  var stalledJob = task5ClaimGlobal(stalled, atS), old = G.tickNoiBo;
  G.tickNoiBo = function () {
    return {processed: 0, advancedToS: atS - 1, nextDueAtS: atS,
      hasMoreDue: true, budgetExhausted: false};
  };
  var stallRejected;
  try {
    stallRejected = task5DomainError(function () {
      task5RunBarrier(stalled, stalledJob, {value: 1});
    }, 'BARRIER_FIXED_POINT_STALL');
  } finally { G.tickNoiBo = old; }
  var bounded = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000524');
  task5SaveCanonical(bounded, 1, task5Timeline(bounded.state(1), atS, 1));
  var boundedJob = task5ClaimGlobal(bounded, atS), boundCalls = 0;
  G.tickNoiBo = function (state) {
    boundCalls++;
    state.planets[0].qB[0].n = boundCalls + 10;
    return {processed: 1, advancedToS: atS - 1, nextDueAtS: atS,
      hasMoreDue: true, budgetExhausted: false};
  };
  var boundRejected;
  try {
    boundRejected = task5DomainError(function () {
      task5RunBarrier(bounded, boundedJob, {value: 1});
    }, 'BARRIER_FIXED_POINT_BOUND');
  } finally { G.tickNoiBo = old; }
  if (scans < 2 || !stallRejected || !boundRejected || boundCalls > 16) {
    throw new Error('TASK5_RED_BARRIER_FIXED_POINT_BOUNDS');
  }
  assert.equal(4 + 4 * 2 + 4 * 1, 16);
});

test('Task 5 barrier shares one 50000 primitive budget across accounts', function (t) {
  task5Lazy('advance');
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000525');
  var atS = NOW_S + 4;
  task5SaveCanonical(x, 1, task5Timeline(x.state(1), atS, 25_000));
  task5SaveCanonical(x, 2, task5Timeline(x.state(2), atS, 25_001));
  var executable = task5ClaimGlobal(x, atS), budget = {value: 50_000};
  var first = task5RunBarrier(x, executable, budget).result;
  var remaining = JSON.parse(x.kho.q.dqGet.get(2).state).planets[0].qB.length;
  if (budget.value !== 0 || first.budgetExhausted !== true || remaining !== 1) {
    throw new Error('TASK5_RED_BARRIER_SHARED_BUDGET');
  }
  assert.equal(x.kho.db.prepare(
    "SELECT value FROM scheduler_meta WHERE key='durable_first_mutation_at_ms'"
  ).get().value, String(x.clock.nowMs()));
  var resumed = x.store.loadExecutableJob(x.lease, x.store.getById(executable.id), x.clock.nowMs());
  var nextBudget = {value: 50_000}, second = task5RunBarrier(x, resumed, nextBudget).result;
  assert.equal(second.budgetExhausted, false);
  assert.equal(JSON.parse(x.kho.q.dqGet.get(2).state).planets[0].qB.length, 0);
  assert.equal(nextBudget.value, 49_999);
});

test('Task 5 zero budget distinguishes pure advance from due local work', function (t) {
  task5Lazy('advance');
  var pure = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000526');
  var atS = NOW_S + 2;
  task5SaveCanonical(pure, 1, task5Timeline(pure.state(1), atS, 0));
  task5SaveCanonical(pure, 2, task5Timeline(pure.state(2), atS, 0));
  var pureJob = task5ClaimGlobal(pure, atS), pureBudget = {value: 0};
  var pureResult = task5RunBarrier(pure, pureJob, pureBudget).result;
  var due = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000527');
  task5SaveCanonical(due, 1, task5Timeline(due.state(1), atS, 1));
  task5SaveCanonical(due, 2, task5Timeline(due.state(2), atS, 0));
  var dueJob = task5ClaimGlobal(due, atS), dueBefore = due.kho.q.dqGet.get(1).state;
  var dueResult = task5RunBarrier(due, dueJob, {value: 0}).result;
  if (Number(pure.kho.q.dqGet.get(1).lastTick) !== atS ||
      pureResult.budgetExhausted !== false || dueResult.processed !== 0 ||
      dueResult.budgetExhausted !== true || dueResult.hasMoreDue !== true) {
    throw new Error('TASK5_RED_BARRIER_ZERO_BUDGET');
  }
  assert.equal(due.kho.q.dqGet.get(1).state, dueBefore);
  assert.equal(due.store.getById(dueJob.id).state, 'RUNNING');
  assert.equal(pureBudget.value, 0);
});

test('Task 5 barrier rejects participants beyond T and retains the watermark', function (t) {
  task5Lazy('advance');
  var x = task5AdvanceFixture(t, '00000000-0000-4000-8000-000000000528');
  var atS = NOW_S + 2, state = x.state(2);
  state.lastTick = atS + 1;
  state.now = atS + 1;
  task5DirectStateWrite(x, 2, state);
  var executable = task5ClaimGlobal(x, atS), before = task5SqliteSnapshot(x.kho);
  var rejected = task5DomainError(function () {
    task5RunBarrier(x, executable, {value: 20});
  }, 'BARRIER_PARTICIPANT_BEYOND_T');
  if (!rejected || !task5SqliteSnapshot(x.kho).equals(before)) {
    throw new Error('TASK5_RED_BARRIER_BEYOND_T');
  }
  assert.equal(Number(x.store.getById(executable.id).logical_scheduled_at_s ||
    x.store.getById(executable.id).scheduled_at_s), atS);
});

function task5PrototypeBody(source, name) {
  var marker = 'TheGioi.prototype.' + name + ' = function';
  var start = source.indexOf(marker);
  if (start < 0) throw new Error('TASK5_TEST_BODY_MISSING');
  var open = source.indexOf('{', start), depth = 0;
  for (var index = open; index < source.length; index++) {
    var character = source[index], next = source[index + 1];
    if (character === "'" || character === '"' || character === '`') {
      var quote = character;
      for (index++; index < source.length; index++) {
        if (source[index] === '\\') index++;
        else if (source[index] === quote) break;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index++;
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (index + 1 < source.length && !(source[index] === '*' && source[index + 1] === '/')) index++;
      index++;
      continue;
    }
    if (character === '{') depth++;
    if (character === '}' && --depth === 0) return source.slice(open, index + 1);
  }
  throw new Error('TASK5_TEST_BODY_UNBALANCED');
}

test('Task 5 durable advance preserves every accepted legacy tick bridge', function () {
  var advance = task5Lazy('advance'), cryptoModule = require('node:crypto');
  var worldSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'world.js'), 'utf8');
  var appSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'app.js'));
  var advanceSource = fs.readFileSync(path.join(__dirname, TASK5_MODULE.advance), 'utf8');
  var expected = {
    _tickNoiBo: '80227e10e8180f1a0f032fe7c250ac15abf63d053f35fb48643c1989f1493db8',
    danhNguoi: '283ce7477a6a74d1b7403c68a41833aeff79923f1785b2e87add6dc4bb84590a',
    doThamNguoi: '6f8ae6410b807936fdefd0fee2947ebe1af4ebcb12540af30c9b726a02739b37',
    tangNguoi: '8e98d10ec31bbfd7b86a0e25715e0f9ce132c2e4b5a803811f4a6dcddf6a89e6',
    tenLuaNguoi: 'f0a690572f25cc8277ece2d05fd83df5eb9a26902a82d088772b31d296d70f22'
  };
  var schedulerCalls = (advanceSource.match(/G\.tick\s*\(/g) || []).length;
  if (schedulerCalls !== 1) throw new Error('TASK5_RED_LEGACY_TICK_BRIDGE');
  Object.keys(expected).forEach(function (name) {
    var body = task5PrototypeBody(worldSource, name);
    assert.equal(cryptoModule.createHash('sha256').update(body).digest('hex'), expected[name]);
    assert.equal((body.match(/G\.tick\s*\(/g) || []).length, 1);
  });
  // Task 7 owns these request-time mutation paths.  They are deliberately
  // no longer frozen to the Task-5 legacy implementation: all must execute
  // through the active scheduler mutation and may not invoke a direct tick or
  // raw state-row write.
  ['hanhDong', 'guiThu', 'tuyenChien', 'chuyenGalana'].forEach(function (name) {
    var body = task5PrototypeBody(worldSource, name);
    assert.equal((body.match(/G\.tick\s*\(/g) || []).length, 0, name);
    assert.equal(/dqLuuState/.test(body), false, name);
  });
  assert.equal(/function nhip\(\)[\s\S]*?tg\.nhip\(\)/.test(appSource), false);
  assert.equal(advance.GameAdvanceService.prototype.advanceTo.length, 4);
});

test('Task 5 reducer module exposes both frozen downstream exports', function () {
  var reducers = task5Lazy('reducers', 'TASK5_SURFACE_REDUCER_MODULE');
  var snapshot = task5Lazy('snapshot');
  assert.deepEqual(Object.keys(reducers).sort(), [
    'EventReducer', 'resolveCanonicalGlobalInCurrentUow', 'seed32'
  ], 'TASK5_SURFACE_REDUCER_MODULE');
  assert.equal(reducers.EventReducer.length, 1, 'TASK5_SURFACE_REDUCER_MODULE');
  assert.equal(reducers.resolveCanonicalGlobalInCurrentUow.length, 4,
    'TASK5_SURFACE_REDUCER_MODULE');
  assert.strictEqual(reducers.seed32, snapshot.seed32, 'TASK5_SURFACE_REDUCER_MODULE');
});

test('Task 5 reducer prototype exposes every frozen method', function () {
  var reducers = task5Lazy('reducers', 'TASK5_SURFACE_REDUCER_PROTOTYPE');
  var prototype = reducers.EventReducer.prototype;
  assert.equal(prototype.initializeCombatSeed.length, 2, 'TASK5_SURFACE_REDUCER_PROTOTYPE');
  assert.equal(prototype.prepare.length, 3, 'TASK5_SURFACE_REDUCER_PROTOTYPE');
  assert.equal(prototype.applyPrepared.length, 2, 'TASK5_SURFACE_REDUCER_PROTOTYPE');
  assert.equal(prototype.prepareCanonicalInvalidation.length, 4,
    'TASK5_SURFACE_REDUCER_PROTOTYPE');
  assert.equal(prototype.prepareRecoveredLatestState.length, 3,
    'TASK5_SURFACE_REDUCER_PROTOTYPE');
  assert.equal(prototype.seedForJob.length, 1, 'TASK5_SURFACE_REDUCER_PROTOTYPE');
});

test('Task 5 world exposes exactly five reducer hook surfaces', function () {
  var names = ['resolvePvpAt', 'resolveTransportAt', 'resolveSpyAt',
    'resolveHoldAt', 'resolveMissileAt'];
  var worldModule = require('../server/world.js');
  var valid = names.every(function (name) {
    return typeof TheGioi.prototype[name] === 'function';
  });
  if (!valid) throw new Error('TASK5_SURFACE_WORLD_REDUCER_HOOKS');
  task5Lazy('reducers', 'TASK5_SURFACE_WORLD_REDUCER_HOOKS');
  assert.deepEqual(names.map(function (name) { return TheGioi.prototype[name].length; }),
    [5, 3, 3, 3, 3], 'TASK5_SURFACE_WORLD_REDUCER_HOOKS');
  assert.deepEqual(worldModule.RULES_HOOK_METHODS.filter(function (name) {
    return /^resolve(?:Pvp|Transport|Spy|Hold|Missile)At$/.test(name);
  }), names, 'TASK5_SURFACE_WORLD_REDUCER_HOOKS');
});

function task5ReducerFixture(t, ownerId) {
  var x = task5AdvanceFixture(t, ownerId);
  var Reducer = task5Lazy('reducers').EventReducer;
  x.reducer = new Reducer({kho: x.kho, world: x.world, store: x.store,
    clock: x.clock, advanceService: x.service});
  return x;
}

function task5ReopenReducerFixture(x) {
  x.kho.dong();
  x.kho = new Kho(x.file);
  apDungMigrationScheduler(x.kho, x.clock.nowMs());
  x.store = new (task2StoreModule().SchedulerStore)(x.kho, x.clock);
  x.world = new TheGioi(x.kho, {clock: x.clock});
  task4InstallScheduler(x);
  x.service = new (task5Lazy('advance').GameAdvanceService)({
    kho: x.kho, world: x.world, store: x.store, clock: x.clock
  });
  x.world.datAdvanceService(x.service);
  x.reducer = new (task5Lazy('reducers').EventReducer)({
    kho: x.kho, world: x.world, store: x.store,
    clock: x.clock, advanceService: x.service
  });
  x.state = function (id) {
    var loaded = x.world.nap(id);
    assert.ok(loaded && loaded.st, 'canonical reopened state ' + id);
    return loaded.st;
  };
  return x;
}

function task5ReducerUow(x, budget, fn) {
  var mutation = task4Mutation(x.lease, x.clock, {remainingBudget: budget || {value: 50_000}});
  var value = x.kho.trongGiaoDich(function () {
    return x.world.trongMutationScheduler(mutation, function () {
      x.store.markDurableMutation(x.lease, x.clock.nowMs());
      return fn(mutation);
    });
  }, {immediate: true});
  return {value: value, mutation: mutation};
}

function task5AccountExecutable(x, accountId, expectedRevision, atS) {
  var specification = {
    kind: 'ACCOUNT_ADVANCE', scheduledAtS: atS, priority: 100,
    idempotencyKey: 'account-advance:' + accountId + ':' + expectedRevision,
    aggregateType: 'account', aggregateId: String(accountId),
    expectedRevision: expectedRevision, maxAttempts: 8,
    payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: atS}
  };
  return task5ClaimExecutable(x, x.lease, specification);
}

function task5ExternalExecutable(x, mission, atS, id) {
  var events = require('../server/scheduler/events.js');
  var source = x.state(1), target = x.state(2), targetCoord = target.planets[0].c;
  if (mission === 'transport' || mission === 'hold') {
    source.lm = {ten: 'task5-fixture-alliance'};
    target.lm = {ten: 'task5-fixture-alliance'};
    x.kho.db.prepare("UPDATE dq SET lm='task5-fixture-alliance' WHERE tk IN (1,2)").run();
  }
  if (mission === 'attack' || mission === 'missile') {
    x.kho.db.prepare(
      'INSERT OR IGNORE INTO chien(lmA,tkA,tkD,khi) VALUES(NULL,1,2,?)'
    ).run(NOW_S - 100_000);
  }
  source.lastTick = atS;
  source.now = atS;
  target.lastTick = atS;
  target.now = atS;
  id = id || 801;
  var ref;
  if (mission === 'missile') {
    var missile = {id: id, n: 2, tu: source.planets[0].c, den: targetCoord,
      diLuc: Math.max(0, atS - 10), khi: atS};
    source.tenLua.push(missile);
    ref = events.stableMissileRef(1, missile);
  } else {
    var fleet = {id: id, pi: 0, tu: source.planets[0].c, den: targetCoord,
      mission: mission, pha: 'di', diLuc: Math.max(0, atS - 10), den_t: atS,
      ships: mission === 'spy' ? {probe: 2} : mission === 'attack' ? {fighterL: 8} : {cargoS: 2},
      linh: {}, cargo: {metal: 20, crystal: 10, deut: mission === 'hold' ? 100000 : 5, food: 3},
      pct: 100};
    if (mission === 'hold') fleet.giu = 3600;
    source.fleets.push(fleet);
    ref = events.stableFleetRef(1, fleet);
  }
  task5DirectStateWrite(x, 1, source);
  task5DirectStateWrite(x, 2, target);
  var specification = events.jobFromRef(ref, function (key) {
    return key === G.tdKey(targetCoord) ? 2 : null;
  });
  return {ref: ref, executable: task5ClaimExecutable(x, x.lease, specification),
    source: source, target: target};
}

function task5MoveCanonicalPlanet(x, fromAccountId, toAccountId, targetKey) {
  var from = x.state(fromAccountId), to = x.state(toAccountId), moved = null;
  from.planets = from.planets.filter(function (planet) {
    if (G.tdKey(planet.c) !== targetKey) return true;
    if (moved) throw new Error('TASK5_TEST_DUPLICATE_TARGET');
    moved = planet;
    return false;
  });
  if (!moved) throw new Error('TASK5_TEST_TARGET_MISSING');
  to.planets.push(moved);
  task5DirectStateWrite(x, fromAccountId, from);
  task5DirectStateWrite(x, toAccountId, to);
  return {from: from, to: to, planet: moved};
}

function reducerUnitTotalForTest(value) {
  return Object.keys(value || {}).reduce(function (sum, key) {
    return sum + Math.max(0, Math.floor(Number(value[key]) || 0));
  }, 0);
}

function task5InitializeSeed(x) {
  return x.kho.trongGiaoDich(function () {
    return x.reducer.initializeCombatSeed(x.lease, x.clock.nowMs());
  }, {immediate: true});
}

function task5PrepareAndApply(x, executable, budget, options) {
  return task5ReducerUow(x, budget, function (mutation) {
    var prepared = x.reducer.prepare(mutation, executable, options || {});
    return {prepared: prepared, effect: x.reducer.applyPrepared(mutation, prepared)};
  }).value;
}

test('Task 5 reducer initialization delegates seed creation to Store only', function (t) {
  var reducers = task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000529');
  var original = x.store.getOrCreateCombatSeedKey, calls = [];
  x.store.getOrCreateCombatSeedKey = function (token, nowMs) {
    calls.push([token, nowMs]);
    return 'ab'.repeat(32);
  };
  var value;
  try { value = x.reducer.initializeCombatSeed(x.lease, x.clock.nowMs()); }
  finally { x.store.getOrCreateCombatSeedKey = original; }
  if (value !== 'ab'.repeat(32) || calls.length !== 1 ||
      calls[0][0] !== x.lease || calls[0][1] !== x.clock.nowMs()) {
    throw new Error('TASK5_RED_REDUCER_SEED_DELEGATION');
  }
  assert.strictEqual(reducers.seed32, task5Lazy('snapshot').seed32);
});

test('Task 5 ACCOUNT_ADVANCE returns only accepted success stale and missing codes', function (t) {
  task5Lazy('reducers');
  function classify(ownerId, accountId, delta) {
    var x = task5ReducerFixture(t, ownerId);
    var row = x.kho.db.prepare('SELECT revision FROM dq WHERE tk=?').get(accountId);
    var expected = row ? Number(row.revision) + delta : 0;
    var executable = task5AccountExecutable(x, accountId, expected, NOW_S);
    return task5ReducerUow(x, {value: 10}, function (mutation) {
      return x.reducer.prepare(mutation, executable, {});
    }).value;
  }
  var success = classify('00000000-0000-4000-8000-000000000530', 1, 0);
  var stale = classify('00000000-0000-4000-8000-000000000531', 1, 1);
  var missing = classify('00000000-0000-4000-8000-000000000532', 99, 0);
  var codes = [success, stale, missing].map(function (prepared) {
    return prepared.application && prepared.application.result && prepared.application.result.code;
  });
  if (codes.join(',') !== 'ACCOUNT_ADVANCED,STALE_REVISION,MATCH_INVALIDATED') {
    throw new Error('TASK5_RED_ACCOUNT_RESULT_CODES');
  }
  assert.deepEqual([success.terminalState, stale.terminalState, missing.terminalState],
    ['COMPLETED', 'CANCELLED', 'CANCELLED']);
});

test('Task 5 parent lifecycle alone checkpoints or blocks one partial account', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000533');
  var atS = NOW_S + 2, state = task5Timeline(x.state(1), atS, 2);
  task5SaveCanonical(x, 1, state);
  var revision = Number(x.kho.q.dqGet.get(1).revision);
  var executable = task5AccountExecutable(x, 1, revision, atS);
  var observed = task5PrepareAndApply(x, executable, {value: 1}, {});
  var prepared = observed.prepared, effect = observed.effect;
  var valid = prepared.kind === 'partial' && effect &&
    Reflect.ownKeys(effect).join(',') === 'checkpointRevision,saveReceipt' &&
    effect.saveReceipt === prepared.saveReceipt &&
    prepared.saveReceipt === prepared.advanceResult.saveReceipt &&
    effect.checkpointRevision === effect.saveReceipt.revision;
  if (!valid) throw new Error('TASK5_RED_ACCOUNT_BLOCK_LINKAGE');
  assert.equal(prepared.advanceResult.budgetExhausted, true);
  assert.equal(prepared.advanceResult.hasMoreDue, true);
});

test('Task 5 blocked ACCOUNT_ADVANCE rolls back and resumes only after proved application', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000534');
  var atS = NOW_S + 2, external = task5ExternalExecutable(x, 'spy', atS, 810);
  var revision = Number(x.kho.q.dqGet.get(1).revision);
  var executable = task5AccountExecutable(x, 1, revision, atS);
  var prepared = task5ReducerUow(x, {value: 10}, function (mutation) {
    return x.reducer.prepare(mutation, executable, {});
  }).value;
  if (prepared.kind !== 'partial' || !prepared.advanceResult ||
      prepared.advanceResult.blockedExternalJobId !== external.executable.id) {
    throw new Error('TASK5_RED_ACCOUNT_BLOCK_RELEASE');
  }
  assert.equal(x.store.getById(executable.id).state, 'RUNNING');
  assert.equal(x.store.getById(external.executable.id).kind, 'EXTERNAL_RESOLVE');
});

test('Task 5 PvP snapshot commits every canonical change through T immutably', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000535');
  var external = task5ExternalExecutable(x, 'attack', NOW_S + 3, 811);
  task5InitializeSeed(x);
  var prepared = task5ReducerUow(x, {value: 10}, function (mutation) {
    return x.reducer.prepare(mutation, external.executable, {});
  }).value;
  var snapshot = prepared.application && prepared.application.snapshot;
  if (!snapshot || snapshot.arrivalAtS !== NOW_S + 3 ||
      snapshot.attacker.accountId !== 1 || snapshot.defender.accountId !== 2 ||
      snapshot.matchId !== external.executable.payload.matchId) {
    throw new Error('TASK5_RED_PVP_CANONICAL_AT_T');
  }
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(prepared.canonicalTContext.snapshot, snapshot);
});

test('Task 5 later same-T hold stays external and outside the current PvP snapshot', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000536');
  var atS = NOW_S + 3, attack = task5ExternalExecutable(x, 'attack', atS, 812);
  var state = x.state(1), hold = {id: 813, pi: 0, tu: state.planets[0].c,
    den: x.state(2).planets[0].c, mission: 'hold', pha: 'di', diLuc: NOW_S,
    den_t: atS, giu: 3600, ships: {cargoS: 1}, linh: {},
    cargo: {metal: 0, crystal: 0, deut: 100000, food: 0}, pct: 100};
  state.fleets.push(hold);
  task5DirectStateWrite(x, 1, state);
  task5InitializeSeed(x);
  var prepared = task5ReducerUow(x, {value: 10}, function (mutation) {
    return x.reducer.prepare(mutation, attack.executable, {});
  }).value;
  var snapshot = prepared.application && prepared.application.snapshot;
  if (!snapshot || snapshot.supporters.length !== 0 ||
      !x.state(1).fleets.some(function (fleet) { return fleet.id === 813 && fleet.pha === 'di'; })) {
    throw new Error('TASK5_RED_PVP_SAME_T_ORDER');
  }
  assert.equal(snapshot.arrivalAtS, atS);
});

test('Task 5 PvP restart preserves snapshot seed result and every effect', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000537');
  var external = task5ExternalExecutable(x, 'attack', NOW_S + 4, 814);
  var restartTarget = x.state(2);
  restartTarget.planets[0].ships.fighterL = 8;
  task5DirectStateWrite(x, 2, restartTarget);
  task5InitializeSeed(x);
  var before = task5SqliteSnapshot(x.kho), messagesBefore = [
    x.state(1).msgs.length, x.state(2).msgs.length
  ];
  var tranBefore = x.kho.db.prepare('SELECT COUNT(*) AS n FROM tran').get().n;
  var bulletinBefore = x.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n;
  var trial = null, rolledBack = false;
  try {
    task5ReducerUow(x, {value: 10}, function (mutation) {
      var prepared = x.reducer.prepare(mutation, external.executable, {});
      var application = x.store.insertApplication(
        x.lease, external.executable, prepared.application, x.clock.nowMs(),
        prepared.canonicalTContext
      );
      var effect = x.reducer.applyPrepared(mutation, prepared);
      trial = {snapshotBytes: canonicalJson(prepared.application.snapshot),
        applicationBytes: canonicalJson(prepared.application),
        applicationHash: sha256(canonicalJson(prepared.application)),
        effectBytes: canonicalJson(effect), alreadyApplied: application.alreadyApplied};
      throw new Error('TASK5_PVP_RESTART_BEFORE_COMMIT');
    });
  } catch (error) {
    rolledBack = error && error.message === 'TASK5_PVP_RESTART_BEFORE_COMMIT';
  }
  if (!rolledBack || !trial || trial.alreadyApplied ||
      !task5SqliteSnapshot(x.kho).equals(before)) {
    throw new Error('TASK5_RED_PVP_RESTART_DETERMINISM');
  }
  task5ReopenReducerFixture(x);
  var reloaded = x.store.loadExecutableJob(
    x.lease, x.store.getById(external.executable.id), x.clock.nowMs()
  );
  var committed = task5ReducerUow(x, {value: 10}, function (mutation) {
    var prepared = x.reducer.prepare(mutation, reloaded, {});
    var application = x.store.insertApplication(
      x.lease, reloaded, prepared.application, x.clock.nowMs(), prepared.canonicalTContext
    );
    var effect = x.reducer.applyPrepared(mutation, prepared);
    x.store.completeApplied(x.lease, reloaded, x.clock.nowMs());
    return {snapshotBytes: canonicalJson(prepared.application.snapshot),
      applicationBytes: canonicalJson(prepared.application),
      applicationHash: sha256(canonicalJson(prepared.application)),
      effectBytes: canonicalJson(effect), alreadyApplied: application.alreadyApplied,
      result: prepared.application.result};
  }).value;
  if (committed.alreadyApplied || trial.snapshotBytes !== committed.snapshotBytes ||
      trial.applicationBytes !== committed.applicationBytes ||
      trial.applicationHash !== committed.applicationHash ||
      trial.effectBytes !== committed.effectBytes ||
      x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?')
        .get(reloaded.id).n !== 1 ||
      x.state(1).msgs.length !== messagesBefore[0] + 1 ||
      x.state(2).msgs.length !== messagesBefore[1] + 1 ||
      x.kho.db.prepare('SELECT COUNT(*) AS n FROM tran').get().n !== tranBefore + 1 ||
      x.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n !== bulletinBefore + 1) {
    throw new Error('TASK5_RED_PVP_RESTART_DETERMINISM');
  }
  assert.deepEqual(committed.result, {code: 'PVP_RESOLVED'});
});

test('Task 5 PvP quantitatively conserves units loot capacity and debris', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000538');
  var external = task5ExternalExecutable(x, 'attack', NOW_S + 5, 815);
  var assaultSource = x.state(1);
  var assaultFleet = assaultSource.fleets.find(function (candidate) {
    return candidate.id === 815;
  });
  assaultFleet.ships = {battleship: 64};
  assaultFleet.linh = {robot: 8, tank: 2};
  var attackerStatsBefore = JSON.parse(JSON.stringify(assaultSource.stats));
  task5DirectStateWrite(x, 1, assaultSource);
  var balancedTarget = x.state(2);
  balancedTarget.planets[0].ships = {fighterL: 8};
  balancedTarget.planets[0].linh = {robot: 6, tank: 1};
  while (G.diem(assaultSource).tong >
      G.diem(balancedTarget).tong * G.C.BAO_VE_MOI_TY_LE) {
    balancedTarget.planets[0].b.metalMine =
      Number(balancedTarget.planets[0].b.metalMine || 0) + 10;
  }
  var defenderStatsBefore = JSON.parse(JSON.stringify(balancedTarget.stats));
  task5DirectStateWrite(x, 2, balancedTarget);
  task5InitializeSeed(x);
  var resources = ['metal', 'crystal', 'deut', 'food'];
  var resolved = task5PrepareAndApply(x, external.executable, {value: 10}, {});
  var effect = resolved.effect, result = effect && effect.result, snapshot =
    resolved.prepared.application && resolved.prepared.application.snapshot;
  var source = x.state(1), target = x.state(2);
  var fleet = source.fleets.find(function (candidate) { return candidate.id === 815; });
  function unitsConserved(before, after, lost) {
    return Object.keys(Object.assign({}, before, after, lost)).every(function (key) {
      return Number(before[key] || 0) === Number(after[key] || 0) + Number(lost[key] || 0);
    });
  }
  function exactNonnegativeIntegers(map) {
    return Object.keys(map || {}).every(function (key) {
      return Number.isSafeInteger(map[key]) && map[key] >= 0;
    });
  }
  var attackerConserved = snapshot && unitsConserved(
    snapshot.attacker.ships, result && result.conShipsA || {}, result && result.matA || {}
  );
  var defenderConserved = snapshot && unitsConserved(snapshot.defender.ships,
    result && result.conNhomD && result.conNhomD[0] || {},
    result && result.matNhomD && result.matNhomD[0] || {});
  var permanentDefenseLosses = Object.keys(result && result.matD || {}).reduce(
    function (out, key) {
      if (G.D(key)) out[key] = result.matD[key];
      return out;
    }, {});
  var defensesConserved = snapshot && unitsConserved(snapshot.defender.def,
    result && result.conDefD || {}, permanentDefenseLosses);
  var ground = effect && effect.ground;
  var attackerGroundConserved = snapshot && ground && unitsConserved(
    snapshot.attacker.linh, ground.kq.conBoA || {}, ground.kq.matA || {}
  );
  var defenderGroundConserved = snapshot && ground && unitsConserved(
    snapshot.defender.linh, ground.kq.conBoD || {}, ground.kq.matD || {}
  );
  var resourcesConserved = resources.every(function (resource) {
    return Number(snapshot.defender.res[resource]) + Number(snapshot.attacker.cargo[resource]) ===
      Number(target.planets[0].res[resource]) + Number(fleet && fleet.cargo[resource] || 0);
  });
  var expectedDebris = {metal: 0, crystal: 0};
  [result && result.matA || {}].concat(result && result.matNhomD || [])
    .forEach(function (losses) {
      Object.keys(losses).forEach(function (key) {
        var ship = G.S(key), lost = Number(losses[key] || 0);
        expectedDebris.metal += Number(ship.cost.metal || 0) * lost * G.C.PHE_LIEU;
        expectedDebris.crystal += Number(ship.cost.crystal || 0) * lost * G.C.PHE_LIEU;
      });
    });
  expectedDebris.metal = Math.round(expectedDebris.metal);
  expectedDebris.crystal = Math.round(expectedDebris.crystal);
  var attackerShipLosses = reducerUnitTotalForTest(result && result.matA);
  var hostShipLosses = reducerUnitTotalForTest(
    result && result.matNhomD && result.matNhomD[0]
  );
  var defenderShipLosses = (result && result.matNhomD || []).reduce(function (sum, losses) {
    return sum + reducerUnitTotalForTest(losses);
  }, 0);
  var statsExact = result && (
    Number(source.stats.thang || 0) - Number(attackerStatsBefore.thang || 0) ===
      (result.kq === 'thang' ? 1 : 0) &&
    Number(source.stats.thua || 0) - Number(attackerStatsBefore.thua || 0) ===
      (result.kq === 'thang' ? 0 : 1) &&
    Number(target.stats.thang || 0) - Number(defenderStatsBefore.thang || 0) ===
      (result.kq === 'thang' ? 0 : 1) &&
    Number(target.stats.thua || 0) - Number(defenderStatsBefore.thua || 0) ===
      (result.kq === 'thang' ? 1 : 0) &&
    Number(source.stats.tauMat || 0) - Number(attackerStatsBefore.tauMat || 0) ===
      attackerShipLosses &&
    Number(source.stats.tauDietDich || 0) -
      Number(attackerStatsBefore.tauDietDich || 0) === defenderShipLosses &&
    Number(source.stats.cuop || 0) - Number(attackerStatsBefore.cuop || 0) ===
      G.tongRes(effect.loot) &&
    Number(target.stats.tauMat || 0) - Number(defenderStatsBefore.tauMat || 0) ===
      hostShipLosses &&
    Number(target.stats.tauDietDich || 0) -
      Number(defenderStatsBefore.tauDietDich || 0) === attackerShipLosses &&
    Number(source.stats.doBo || 0) - Number(attackerStatsBefore.doBo || 0) === 1
  );
  if (!effect || !result || result.kq !== 'thang' || !attackerConserved ||
      !defenderConserved || !defensesConserved || !attackerGroundConserved ||
      !defenderGroundConserved || !statsExact || !resourcesConserved || !fleet ||
      G.tongRes(fleet.cargo) > G.khoangHang(fleet.ships) ||
      !resources.every(function (resource) {
        return Number(effect.loot[resource]) >= 0 &&
          Number(effect.loot[resource]) <= Number(snapshot.defender.res[resource]);
      }) || JSON.stringify(effect.debris) !== JSON.stringify(expectedDebris) ||
      ![result.conShipsA, result.matA, result.conDefD, result.matD]
        .every(exactNonnegativeIntegers) ||
      !(result.conNhomD || []).every(exactNonnegativeIntegers) ||
      !(result.matNhomD || []).every(exactNonnegativeIntegers) ||
      ![ground.kq.conBoA, ground.kq.matA, ground.kq.conBoD, ground.kq.matD]
        .every(exactNonnegativeIntegers)) {
    throw new Error('TASK5_RED_PVP_QUANTITATIVE_CONSERVATION');
  }
  assert.deepEqual(effect.debris, expectedDebris);

  var denied = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000638');
  var deniedExternal = task5ExternalExecutable(denied, 'attack', NOW_S + 6, 915);
  task5InitializeSeed(denied);
  denied.kho.db.prepare('DELETE FROM chien').run();
  var deniedTargetBefore = Buffer.from(JSON.stringify(denied.state(2)));
  var deniedPlBefore = denied.kho.db.prepare('SELECT * FROM pl ORDER BY td').all();
  var deniedTranBefore = denied.kho.db.prepare('SELECT * FROM tran ORDER BY id').all();
  var deniedBulletinBefore = denied.kho.db.prepare('SELECT * FROM bangtin ORDER BY id').all();
  var deniedResolved = task5PrepareAndApply(
    denied, deniedExternal.executable, {value: 10}, {}
  );
  var deniedFleet = denied.state(1).fleets.find(function (candidate) {
    return candidate.id === 915;
  });
  if (!deniedResolved.effect || deniedResolved.effect.authorized !== false ||
      !deniedFleet || deniedFleet.pha !== 've' ||
      !Buffer.from(JSON.stringify(denied.state(2))).equals(deniedTargetBefore) ||
      JSON.stringify(denied.kho.db.prepare('SELECT * FROM pl ORDER BY td').all()) !==
        JSON.stringify(deniedPlBefore) ||
      JSON.stringify(denied.kho.db.prepare('SELECT * FROM tran ORDER BY id').all()) !==
        JSON.stringify(deniedTranBefore) ||
      JSON.stringify(denied.kho.db.prepare('SELECT * FROM bangtin ORDER BY id').all()) !==
        JSON.stringify(deniedBulletinBefore)) {
    throw new Error('TASK5_RED_PVP_ARRIVAL_AUTHORIZATION');
  }

  var movedPvp = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000938');
  task5AddAccount(movedPvp, 3, 'Task5 Moved PvP Owner');
  var movedPvpExternal = task5ExternalExecutable(
    movedPvp, 'attack', NOW_S + 6, 1215
  );
  task5InitializeSeed(movedPvp);
  var movedPvpResolved = task5ReducerUow(movedPvp, {value: 10}, function (mutation) {
    var prepared = movedPvp.reducer.prepare(mutation, movedPvpExternal.executable, {});
    var movedCanonical = task5MoveCanonicalPlanet(
      movedPvp, 2, 3, movedPvpExternal.ref.targetKey
    );
    var targetOwnerBefore = Buffer.from(JSON.stringify(movedCanonical.to));
    return {prepared: prepared,
      effect: movedPvp.reducer.applyPrepared(mutation, prepared),
      targetOwnerBefore: targetOwnerBefore};
  }).value;
  var movedPvpFleet = movedPvp.state(1).fleets.find(function (candidate) {
    return candidate.id === 1215;
  });
  if (!movedPvpResolved.effect || movedPvpResolved.effect.authorized !== false ||
      !movedPvpFleet || movedPvpFleet.pha !== 've' ||
      !Buffer.from(JSON.stringify(movedPvp.state(3))).equals(
        movedPvpResolved.targetOwnerBefore)) {
    throw new Error('TASK5_RED_PVP_TARGET_OWNER_RECHECK');
  }

  var protectedX = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000738');
  var protectedExternal = task5ExternalExecutable(
    protectedX, 'attack', NOW_S + 7, 1015
  );
  var protectedSource = protectedX.state(1);
  protectedSource.planets[0].b.metalMine = 100;
  task5DirectStateWrite(protectedX, 1, protectedSource);
  task5InitializeSeed(protectedX);
  var protectedTargetBefore = Buffer.from(JSON.stringify(protectedX.state(2)));
  var protectedResolved = task5PrepareAndApply(
    protectedX, protectedExternal.executable, {value: 10}, {}
  );
  var protectedFleet = protectedX.state(1).fleets.find(function (candidate) {
    return candidate.id === 1015;
  });
  if (!(G.diem(protectedSource).tong > G.diem(protectedX.state(2)).tong *
        G.C.BAO_VE_MOI_TY_LE) ||
      !protectedResolved.effect || protectedResolved.effect.protected !== true ||
      !protectedFleet || protectedFleet.pha !== 've' ||
      !Buffer.from(JSON.stringify(protectedX.state(2))).equals(protectedTargetBefore)) {
    throw new Error('TASK5_RED_PVP_NEW_PLAYER_PROTECTION');
  }

  var supportX = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000838');
  task5AddAccount(supportX, 3, 'Task5 Supporter');
  task5AddAccount(supportX, 4, 'Task5 Valid Supporter');
  var supportAtS = NOW_S + 8;
  var supportExternal = task5ExternalExecutable(supportX, 'attack', supportAtS, 1115);
  var supportTarget = supportX.state(2);
  supportTarget.planets[0].ships.fighterL = 8;
  supportTarget.lm = {ten: 'task5-support-alliance'};
  supportTarget.fleets.push({id: 1119, pi: 0, tu: supportTarget.planets[0].c,
    den: supportTarget.planets[0].c, mission: 'hold', pha: 'giu',
    diLuc: supportAtS - 20, den_t: supportAtS - 10, giu: 3600,
    giuLuc: supportAtS - 10, giuDen_t: supportAtS + 100,
    tiepNL_t: supportAtS + 100, giuTaiTk: 2,
    giuRules: G.QUY_DAO_V1.holdRules, dangGiu: true,
    ships: {fighterL: 2}, linh: {},
    cargo: {metal: 0, crystal: 0, deut: 100, food: 0}, pct: 100});
  task5DirectStateWrite(supportX, 2, supportTarget);
  var supportSource = supportX.state(1);
  supportSource.fleets.push({id: 1120, pi: 0, tu: supportSource.planets[0].c,
    den: supportTarget.planets[0].c, mission: 'hold', pha: 'giu',
    diLuc: supportAtS - 20, den_t: supportAtS - 10, giu: 3600,
    giuLuc: supportAtS - 10, giuDen_t: supportAtS + 100,
    tiepNL_t: supportAtS + 100, giuTaiTk: 2,
    giuRules: G.QUY_DAO_V1.holdRules, dangGiu: true,
    ships: {fighterL: 2}, linh: {},
    cargo: {metal: 0, crystal: 0, deut: 100, food: 0}, pct: 100});
  task5DirectStateWrite(supportX, 1, supportSource);
  supportX.kho.db.prepare(
    "UPDATE dq SET lm='task5-support-alliance' WHERE tk IN (2,3,4)"
  ).run();
  function addSupporter(accountId, fleetId, ships) {
    var supporterState = supportX.state(accountId);
    supporterState.lm = {ten: 'task5-support-alliance'};
    supporterState.now = supportAtS;
    supporterState.lastTick = supportAtS;
    supporterState.fleets.push({id: fleetId, pi: 0, tu: supporterState.planets[0].c,
      den: supportTarget.planets[0].c, mission: 'hold', pha: 'giu',
      diLuc: supportAtS - 20, den_t: supportAtS - 10, giu: 3600,
      giuLuc: supportAtS - 10, giuDen_t: supportAtS + 100,
      tiepNL_t: supportAtS + 100, giuTaiTk: 2,
      giuRules: G.QUY_DAO_V1.holdRules, dangGiu: true,
      ships: ships, linh: {},
      cargo: {metal: 0, crystal: 0, deut: 100, food: 0}, pct: 100});
    task5DirectStateWrite(supportX, accountId, supporterState);
    return supporterState;
  }
  addSupporter(3, 1116, {fighterL: 2});
  addSupporter(4, 1117, {fighterL: 3});
  var validSupporterBefore = addSupporter(4, 1118, {fighterL: 4});
  var validSupporterStatsBefore = JSON.parse(JSON.stringify(validSupporterBefore.stats));
  var validSupporterMessagesBefore = validSupporterBefore.msgs.length;
  task5InitializeSeed(supportX);
  var supporterAccountLoads = new Map(), originalSupporterNap = supportX.world.nap;
  var supportResolved = task5ReducerUow(supportX, {value: 10}, function (mutation) {
    var prepared = supportX.reducer.prepare(mutation, supportExternal.executable, {});
    if (!prepared.application.snapshot || prepared.application.snapshot.supporters.length !== 5) {
      throw new Error('TASK5_RED_PVP_SUPPORTER_SNAPSHOT');
    }
    var staleState = supportX.state(3);
    staleState.lm = null;
    task5DirectStateWrite(supportX, 3, staleState);
    supportX.world.nap = function (accountId) {
      accountId = Number(accountId);
      if ([1, 2, 4].indexOf(accountId) >= 0) {
        supporterAccountLoads.set(accountId,
          Number(supporterAccountLoads.get(accountId) || 0) + 1);
      }
      return originalSupporterNap.apply(this, arguments);
    };
    try {
      return {prepared: prepared, effect: supportX.reducer.applyPrepared(mutation, prepared)};
    } finally { supportX.world.nap = originalSupporterNap; }
  }).value;
  var staleSupporter = supportX.state(3).fleets.find(function (candidate) {
    return candidate.id === 1116;
  });
  var staleAttackerSupporter = supportX.state(1).fleets.find(function (candidate) {
    return candidate.id === 1120;
  });
  var defenderAfter = supportX.state(2);
  var validSupporterAfter = supportX.state(4);
  var validReport = validSupporterAfter.msgs[0];
  var validLosses = [2, 3].reduce(function (sum, index) {
    return sum + reducerUnitTotalForTest(
      supportResolved.effect && supportResolved.effect.result &&
        supportResolved.effect.result.matNhomD[index]
    );
  }, 0);
  function persistedSupporterShips(fleetId) {
    var fleet = validSupporterAfter.fleets.find(function (candidate) {
      return candidate.id === fleetId;
    });
    return fleet ? fleet.ships : {};
  }
  var defenderHold = defenderAfter.fleets.find(function (candidate) {
    return candidate.id === 1119;
  });
  if (!supportResolved.effect || supportResolved.effect.supporterCount !== 3 ||
      supportResolved.effect.excludedSupporterCount !== 2 ||
      !staleSupporter || staleSupporter.pha !== 've' ||
      !staleAttackerSupporter || staleAttackerSupporter.pha !== 've' ||
      [1, 2, 4].some(function (accountId) {
        return supporterAccountLoads.get(accountId) !== 1;
      }) ||
      !validReport || !/^Hỗ trợ phòng thủ/.test(validReport.td) ||
      !validReport.data || validReport.data.ben !== 'hotro' ||
      validReport.data.mat !== validLosses ||
      validSupporterAfter.msgs.length !== validSupporterMessagesBefore + 1 ||
      Number(validSupporterAfter.stats.tauMat || 0) -
        Number(validSupporterStatsBefore.tauMat || 0) !== validLosses ||
      !supportResolved.effect.result.conNhomD ||
      supportResolved.effect.result.conNhomD.length !== 4 ||
      JSON.stringify(defenderHold ? defenderHold.ships : {}) !==
        JSON.stringify(supportResolved.effect.result.conNhomD[1]) ||
      JSON.stringify(persistedSupporterShips(1117)) !==
        JSON.stringify(supportResolved.effect.result.conNhomD[2]) ||
      JSON.stringify(persistedSupporterShips(1118)) !==
        JSON.stringify(supportResolved.effect.result.conNhomD[3])) {
    throw new Error('TASK5_RED_PVP_SUPPORTER_REVALIDATION');
  }
});

test('Task 5 transport conserves resources cargo and one returning fleet', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000539');
  var external = task5ExternalExecutable(x, 'transport', NOW_S + 5, 816);
  var beforeSource = x.state(1).fleets.find(function (fleet) { return fleet.id === 816; });
  var beforeTargetState = x.state(2), beforeTarget = beforeTargetState.planets[0];
  var targetMessagesBefore = beforeTargetState.msgs.length;
  var bulletinBefore = x.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n;
  var resources = ['metal', 'crystal', 'deut', 'food'];
  var totalsBefore = resources.reduce(function (out, resource) {
    out[resource] = Number(beforeSource.cargo[resource] || 0) +
      Number(beforeTarget.res[resource] || 0);
    return out;
  }, {});
  var resolved = task5PrepareAndApply(x, external.executable, {value: 10}, {});
  var afterSource = x.state(1).fleets.find(function (fleet) { return fleet.id === 816; });
  var afterTargetState = x.state(2), afterTarget = afterTargetState.planets[0];
  var conserved = resources.every(function (resource) {
    return Number(afterSource && afterSource.cargo[resource] || 0) +
      Number(afterTarget.res[resource] || 0) === totalsBefore[resource] &&
      Number(afterTarget.res[resource] || 0) <=
        Math.floor(Number(G.dungTich(afterTarget)[resource]) * 1.5);
  });
  if (!resolved.effect || resolved.effect.authorized !== true || !conserved ||
      !afterSource || afterSource.pha !== 've' ||
      afterTargetState.msgs.length !== targetMessagesBefore + 1 ||
      x.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n !== bulletinBefore + 1) {
    throw new Error('TASK5_RED_TRANSPORT_CONSERVATION');
  }
  assert.equal(x.state(1).fleets.filter(function (fleet) { return fleet.id === 816; }).length, 1);

  var denied = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000639');
  var deniedExternal = task5ExternalExecutable(denied, 'transport', NOW_S + 6, 916);
  var deniedTargetState = denied.state(2);
  deniedTargetState.lm = null;
  task5DirectStateWrite(denied, 2, deniedTargetState);
  var deniedSourceBefore = denied.state(1).fleets.find(function (fleet) {
    return fleet.id === 916;
  });
  var deniedCargoBefore = JSON.stringify(deniedSourceBefore.cargo);
  var deniedTargetBefore = Buffer.from(JSON.stringify(denied.state(2)));
  var deniedBulletinBefore = denied.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n;
  var deniedResolved = task5PrepareAndApply(
    denied, deniedExternal.executable, {value: 10}, {}
  );
  var deniedSourceAfter = denied.state(1).fleets.find(function (fleet) {
    return fleet.id === 916;
  });
  if (!deniedResolved.effect || deniedResolved.effect.authorized !== false ||
      !deniedSourceAfter || deniedSourceAfter.pha !== 've' ||
      JSON.stringify(deniedSourceAfter.cargo) !== deniedCargoBefore ||
      !Buffer.from(JSON.stringify(denied.state(2))).equals(deniedTargetBefore) ||
      denied.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n !==
        deniedBulletinBefore) {
    throw new Error('TASK5_RED_TRANSPORT_ARRIVAL_AUTHORIZATION');
  }

  var moved = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000739');
  task5AddAccount(moved, 3, 'Task5 Moved Owner');
  var movedExternal = task5ExternalExecutable(moved, 'transport', NOW_S + 7, 1016);
  var movedResolved = task5ReducerUow(moved, {value: 10}, function (mutation) {
    var prepared = moved.reducer.prepare(mutation, movedExternal.executable, {});
    var movedCanonical = task5MoveCanonicalPlanet(
      moved, 2, 3, movedExternal.ref.targetKey
    );
    var targetOwnerBefore = Buffer.from(JSON.stringify(movedCanonical.to));
    var effect = moved.reducer.applyPrepared(mutation, prepared);
    return {prepared: prepared, effect: effect, targetOwnerBefore: targetOwnerBefore};
  }).value;
  var movedFleet = moved.state(1).fleets.find(function (fleet) { return fleet.id === 1016; });
  if (!movedResolved.effect || movedResolved.effect.authorized !== false ||
      !movedFleet || movedFleet.pha !== 've' ||
      !Buffer.from(JSON.stringify(moved.state(3))).equals(movedResolved.targetOwnerBefore) ||
      moved.state(3).planets.filter(function (planet) {
        return G.tdKey(planet.c) === movedExternal.ref.targetKey;
      }).length !== 1) {
    throw new Error('TASK5_RED_TRANSPORT_TARGET_OWNER_RECHECK');
  }

  var missingProjection = task5ReducerFixture(
    t, '00000000-0000-4000-8000-000000000839'
  );
  var missingExternal = task5ExternalExecutable(
    missingProjection, 'transport', NOW_S + 8, 1116
  );
  missingProjection.kho.db.prepare('DELETE FROM ht WHERE td=?')
    .run(missingExternal.ref.targetKey);
  var missingResolved = task5PrepareAndApply(
    missingProjection, missingExternal.executable, {value: 10}, {}
  );
  if (!missingResolved.effect || missingResolved.effect.authorized !== true ||
      Number(missingProjection.kho.q.htGet.get(missingExternal.ref.targetKey).tk) !== 2) {
    throw new Error('TASK5_RED_TRANSPORT_CANONICAL_NOT_PROJECTION');
  }

  var full = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000939');
  var fullExternal = task5ExternalExecutable(full, 'transport', NOW_S + 9, 1216);
  var fullTarget = full.state(2), fullPlanet = fullTarget.planets[0];
  var fullCapacity = G.dungTich(fullPlanet);
  resources.forEach(function (resource) {
    fullPlanet.res[resource] = Math.floor(Number(fullCapacity[resource]) * 1.5);
  });
  task5DirectStateWrite(full, 2, fullTarget);
  var fullMessagesBefore = fullTarget.msgs.length;
  var fullBulletinBefore = full.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n;
  var fullResolved = task5PrepareAndApply(full, fullExternal.executable, {value: 10}, {});
  if (!fullResolved.effect || fullResolved.effect.authorized !== true ||
      G.tongRes(fullResolved.effect.delivered) !== 0 ||
      full.state(2).msgs.length !== fullMessagesBefore ||
      full.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n !==
        fullBulletinBefore) {
    throw new Error('TASK5_RED_TRANSPORT_ZERO_DELIVERY_NOTICE');
  }
});

test('Task 5 spy resolves one deterministic report at effective T', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000540');
  var atS = NOW_S + 6, external = task5ExternalExecutable(x, 'spy', atS, 817);
  var sourceBefore = x.state(1), targetBefore = x.state(2);
  sourceBefore.tech.spy = 0;
  targetBefore.tech.spy = 0;
  targetBefore.vaoCuoi = atS;
  x.kho.q.tkVao.run(atS - 8 * 86400, 2);
  targetBefore.planets[0].b.intel = 100;
  sourceBefore.fleets.find(function (fleet) { return fleet.id === 817; }).ships.probe = 8;
  var defenderMessagesBefore = targetBefore.msgs.length;
  task5DirectStateWrite(x, 1, sourceBefore);
  task5DirectStateWrite(x, 2, targetBefore);
  var deterministicTrial = null, trialRolledBack = false;
  try {
    task5ReducerUow(x, {value: 10}, function (mutation) {
      var trialPrepared = x.reducer.prepare(mutation, external.executable, {});
      var trialEffect = x.reducer.applyPrepared(mutation, trialPrepared);
      deterministicTrial = {
        effect: JSON.parse(JSON.stringify(trialEffect.report)),
        report: JSON.parse(JSON.stringify(x.world.nap(1).st.spy[external.ref.targetKey])),
        notice: JSON.parse(JSON.stringify(x.world.nap(2).st.msgs[0]))
      };
      throw new Error('TASK5_SPY_RESTART_TRIAL');
    });
  } catch (error) { trialRolledBack = error && error.message === 'TASK5_SPY_RESTART_TRIAL'; }
  var resolved = task5PrepareAndApply(x, external.executable, {value: 10}, {});
  var sourceAfter = x.state(1), targetAfter = x.state(2);
  var report = sourceAfter.spy && sourceAfter.spy[external.ref.targetKey];
  var fleetAfter = sourceAfter.fleets.find(function (fleet) { return fleet.id === 817; });
  var survivingProbes = Number(fleetAfter && fleetAfter.ships.probe || 0);
  var lostProbes = 8 - survivingProbes;
  var defenderNotice = targetAfter.msgs[0];
  if (!resolved.effect || !report || report.t !== atS || report.td === undefined ||
      report.mucDo !== 3 || report.mat !== lostProbes || lostProbes < 1 ||
      report.ten !== targetBefore.ten || report.lm !== '' ||
      report.diem !== Math.round(G.diem(targetBefore).tong) ||
      report.bo !== true ||
      report.pvp !== true || !Object.prototype.hasOwnProperty.call(report, 'danSu') ||
      !Object.prototype.hasOwnProperty.call(report, 'ctMode') ||
      !defenderNotice || !/^Bị do thám/.test(defenderNotice.td) ||
      targetAfter.msgs.length !== defenderMessagesBefore + 1 ||
      JSON.stringify(resolved.effect.report) !== JSON.stringify(report) ||
      !trialRolledBack || !deterministicTrial ||
      JSON.stringify(deterministicTrial.effect) !== JSON.stringify(resolved.effect.report) ||
      JSON.stringify(deterministicTrial.report) !== JSON.stringify(report) ||
      JSON.stringify(deterministicTrial.notice) !== JSON.stringify(defenderNotice) ||
      fleetAfter && fleetAfter.pha !== 've') {
    throw new Error('TASK5_RED_SPY_EFFECTIVE_T');
  }
  assert.equal(sourceAfter.msgs.filter(function (message) {
    return /^Báo cáo do thám/.test(message.td);
  }).length, 1);

  var moved = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000940');
  task5AddAccount(moved, 3, 'Task5 Moved Spy Owner');
  var movedExternal = task5ExternalExecutable(moved, 'spy', atS + 1, 1217);
  var movedResolved = task5ReducerUow(moved, {value: 10}, function (mutation) {
    var prepared = moved.reducer.prepare(mutation, movedExternal.executable, {});
    var movedCanonical = task5MoveCanonicalPlanet(moved, 2, 3, movedExternal.ref.targetKey);
    var targetOwnerBefore = Buffer.from(JSON.stringify(movedCanonical.to));
    return {effect: moved.reducer.applyPrepared(mutation, prepared),
      targetOwnerBefore: targetOwnerBefore};
  }).value;
  if (!movedResolved.effect || movedResolved.effect.authorized !== false ||
      moved.state(1).spy && moved.state(1).spy[movedExternal.ref.targetKey] ||
      !Buffer.from(JSON.stringify(moved.state(3))).equals(movedResolved.targetOwnerBefore)) {
    throw new Error('TASK5_RED_SPY_TARGET_OWNER_RECHECK');
  }

  var recent = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000941');
  var recentExternal = task5ExternalExecutable(recent, 'spy', atS + 2, 1317);
  var recentTarget = recent.state(2);
  recentTarget.vaoCuoi = 1;
  task5DirectStateWrite(recent, 2, recentTarget);
  recent.kho.q.tkVao.run(atS + 2 - 60, 2);
  var recentResolved = task5PrepareAndApply(
    recent, recentExternal.executable, {value: 10}, {}
  );
  var recentReport = recent.state(1).spy[recentExternal.ref.targetKey];
  if (!recentResolved.effect || !recentReport || recentReport.bo !== false) {
    throw new Error('TASK5_RED_SPY_IDENTITY_LAST_SEEN');
  }
});

test('Task 5 hold charges and schedules canonical orbital timing once', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000541');
  var atS = NOW_S + 7, external = task5ExternalExecutable(x, 'hold', atS, 818);
  var source = x.state(1), outbound = source.fleets.find(function (fleet) {
    return fleet.id === 818;
  });
  outbound.giu = G.QUY_DAO_V1.segmentSeconds * 2;
  var segmentCharge = G.nhienLieuGiu(
    source, outbound.ships, G.QUY_DAO_V1.segmentSeconds
  );
  var totalCharge = G.nhienLieuGiuTong(source, outbound.ships, outbound.giu);
  outbound.cargo.deut = segmentCharge;
  task5DirectStateWrite(x, 1, source);
  var resolved = task5PrepareAndApply(x, external.executable, {value: 10}, {});
  var held = x.state(1).fleets.find(function (fleet) { return fleet.id === 818; });
  if (!resolved.effect || !held || held.pha !== 'giu' || held.giuLuc !== atS ||
      held.giuDen_t !== atS + outbound.giu ||
      held.tiepNL_t !== atS + G.QUY_DAO_V1.segmentSeconds ||
      Number(held.cargo.deut || 0) !== 0 || totalCharge <= segmentCharge ||
      held.giuRules !== G.QUY_DAO_V1.holdRules || held.dangGiu !== true ||
      resolved.effect.chargedDeut !== segmentCharge) {
    throw new Error('TASK5_RED_HOLD_TIMING');
  }
  assert.equal(held.giuTaiTk, 2);

  var denied = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000641');
  var deniedExternal = task5ExternalExecutable(denied, 'hold', atS + 1, 918);
  var deniedTargetState = denied.state(2);
  deniedTargetState.lm = null;
  task5DirectStateWrite(denied, 2, deniedTargetState);
  var deniedBefore = denied.state(1).fleets.find(function (fleet) {
    return fleet.id === 918;
  });
  var deniedCargo = JSON.stringify(deniedBefore.cargo);
  var deniedResolved = task5PrepareAndApply(
    denied, deniedExternal.executable, {value: 10}, {}
  );
  var deniedAfter = denied.state(1).fleets.find(function (fleet) {
    return fleet.id === 918;
  });
  if (!deniedResolved.effect || deniedResolved.effect.authorized !== false ||
      !deniedAfter || deniedAfter.pha !== 've' ||
      JSON.stringify(deniedAfter.cargo) !== deniedCargo || deniedAfter.dangGiu === true) {
    throw new Error('TASK5_RED_HOLD_ARRIVAL_AUTHORIZATION');
  }

  var staleProjection = task5ReducerFixture(
    t, '00000000-0000-4000-8000-000000000741'
  );
  var staleExternal = task5ExternalExecutable(staleProjection, 'hold', atS + 2, 1018);
  staleProjection.kho.db.prepare('UPDATE ht SET tk=1 WHERE td=?')
    .run(staleExternal.ref.targetKey);
  var staleResolved = task5PrepareAndApply(
    staleProjection, staleExternal.executable, {value: 10}, {}
  );
  if (!staleResolved.effect || staleResolved.effect.authorized !== true ||
      staleProjection.state(1).fleets.find(function (fleet) {
        return fleet.id === 1018;
      }).pha !== 'giu') {
    throw new Error('TASK5_RED_HOLD_CANONICAL_NOT_PROJECTION');
  }

  var moved = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000841');
  task5AddAccount(moved, 3, 'Task5 Moved Hold Owner');
  var movedExternal = task5ExternalExecutable(moved, 'hold', atS + 3, 1118);
  var movedResolved = task5ReducerUow(moved, {value: 10}, function (mutation) {
    var prepared = moved.reducer.prepare(mutation, movedExternal.executable, {});
    var movedCanonical = task5MoveCanonicalPlanet(moved, 2, 3, movedExternal.ref.targetKey);
    var targetOwnerBefore = Buffer.from(JSON.stringify(movedCanonical.to));
    return {effect: moved.reducer.applyPrepared(mutation, prepared),
      targetOwnerBefore: targetOwnerBefore};
  }).value;
  var movedFleet = moved.state(1).fleets.find(function (fleet) { return fleet.id === 1118; });
  if (!movedResolved.effect || movedResolved.effect.authorized !== false ||
      !movedFleet || movedFleet.pha !== 've' || movedFleet.dangGiu === true ||
      !Buffer.from(JSON.stringify(moved.state(3))).equals(movedResolved.targetOwnerBefore)) {
    throw new Error('TASK5_RED_HOLD_TARGET_OWNER_RECHECK');
  }
});

test('Task 5 missile applies deterministic damage and removal once', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000542');
  var atS = NOW_S + 8, target = x.state(2);
  target.planets[0].def.missileLauncher = 5;
  task5DirectStateWrite(x, 2, target);
  var external = task5ExternalExecutable(x, 'missile', atS, 819);
  var targetBefore = x.state(2);
  var before = Number(targetBefore.planets[0].def.missileLauncher || 0);
  var targetMessagesBefore = targetBefore.msgs.length;
  var bulletinBefore = x.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n;
  var deterministicTrial = null, trialRolledBack = false;
  try {
    task5ReducerUow(x, {value: 10}, function (mutation) {
      var trialPrepared = x.reducer.prepare(mutation, external.executable, {});
      var trialEffect = x.reducer.applyPrepared(mutation, trialPrepared);
      var trialTarget = x.world.nap(2).st;
      deterministicTrial = {
        result: JSON.parse(JSON.stringify(trialEffect.result)),
        def: JSON.parse(JSON.stringify(trialTarget.planets[0].def)),
        mis: JSON.parse(JSON.stringify(trialTarget.planets[0].mis))
      };
      throw new Error('TASK5_MISSILE_RESTART_TRIAL');
    });
  } catch (error) { trialRolledBack = error && error.message === 'TASK5_MISSILE_RESTART_TRIAL'; }
  var resolved = task5PrepareAndApply(x, external.executable, {value: 10}, {});
  var targetAfter = x.state(2);
  var after = Number(targetAfter.planets[0].def.missileLauncher || 0);
  if (!resolved.effect || x.state(1).tenLua.some(function (missile) { return missile.id === 819; }) ||
      resolved.effect.authorized !== true || after > before ||
      targetAfter.msgs.length !== targetMessagesBefore + 1 ||
      !trialRolledBack || !deterministicTrial ||
      JSON.stringify(deterministicTrial.result) !== JSON.stringify(resolved.effect.result) ||
      JSON.stringify(deterministicTrial.def) !== JSON.stringify(targetAfter.planets[0].def) ||
      JSON.stringify(deterministicTrial.mis) !== JSON.stringify(targetAfter.planets[0].mis) ||
      x.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n !== bulletinBefore + 1) {
    throw new Error('TASK5_RED_MISSILE_EFFECT');
  }
  assert.equal(resolved.effect.atS, atS);

  var denied = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000642');
  var deniedTarget = denied.state(2);
  deniedTarget.planets[0].def.missileLauncher = 5;
  task5DirectStateWrite(denied, 2, deniedTarget);
  var deniedExternal = task5ExternalExecutable(denied, 'missile', atS + 1, 919);
  denied.kho.db.prepare('DELETE FROM chien').run();
  var deniedTargetBefore = Buffer.from(JSON.stringify(denied.state(2)));
  var deniedBulletinBefore = denied.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n;
  var deniedResolved = task5PrepareAndApply(
    denied, deniedExternal.executable, {value: 10}, {}
  );
  if (!deniedResolved.effect || deniedResolved.effect.authorized !== false ||
      denied.state(1).tenLua.some(function (missile) { return missile.id === 919; }) ||
      !Buffer.from(JSON.stringify(denied.state(2))).equals(deniedTargetBefore) ||
      denied.kho.db.prepare('SELECT COUNT(*) AS n FROM bangtin').get().n !==
        deniedBulletinBefore) {
    throw new Error('TASK5_RED_MISSILE_ARRIVAL_AUTHORIZATION');
  }

  var moved = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000842');
  task5AddAccount(moved, 3, 'Task5 Moved Missile Owner');
  var movedExternal = task5ExternalExecutable(moved, 'missile', atS + 2, 1019);
  var movedResolved = task5ReducerUow(moved, {value: 10}, function (mutation) {
    var prepared = moved.reducer.prepare(mutation, movedExternal.executable, {});
    var movedCanonical = task5MoveCanonicalPlanet(moved, 2, 3, movedExternal.ref.targetKey);
    var targetOwnerBefore = Buffer.from(JSON.stringify(movedCanonical.to));
    return {prepared: prepared, effect: moved.reducer.applyPrepared(mutation, prepared),
      targetOwnerBefore: targetOwnerBefore};
  }).value;
  if (!movedResolved.effect || movedResolved.effect.authorized !== false ||
      moved.state(1).tenLua.some(function (missile) { return missile.id === 1019; }) ||
      !Buffer.from(JSON.stringify(moved.state(3))).equals(movedResolved.targetOwnerBefore)) {
    throw new Error('TASK5_RED_MISSILE_TARGET_OWNER_RECHECK');
  }

});

test('Task 5 every reducer scenario maps to one exact accepted result and neutralization', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000543');
  var external = task5ExternalExecutable(x, 'spy', NOW_S + 9, 820);
  var state = x.state(1);
  state.fleets = state.fleets.filter(function (fleet) { return fleet.id !== 820; });
  task5DirectStateWrite(x, 1, state);
  var absent = task5ReducerUow(x, {value: 10}, function (mutation) {
    return x.reducer.prepare(mutation, external.executable, {});
  }).value;
  var operator = task5ReducerUow(x, {value: 10}, function (mutation) {
    return x.reducer.prepareCanonicalInvalidation(
      mutation, external.executable, 'OPERATOR_CONFIRMED_INVALID', null
    );
  }).value;
  var allowed = ['RETURNED', 'MISSILE_REMOVED', 'ALREADY_ABSENT', 'REF_MISMATCH'];
  var results = [absent, operator].map(function (prepared) {
    return prepared.application && prepared.application.result;
  });
  if (!results.every(function (result) {
    return result && result.invalidation === 'canonical' &&
      allowed.indexOf(result.neutralization) >= 0;
  }) || results[0].code !== 'MATCH_INVALIDATED' ||
      results[1].code !== 'OPERATOR_CONFIRMED_INVALID') {
    throw new Error('TASK5_RED_RESULT_MAPPING');
  }
  assert.equal(Object.keys(results[1]).sort().join(','), 'code,invalidation,neutralization');
});

test('Task 5 payload snapshot and canonical context corruption fail closed', function (t) {
  var storeApi = task2StoreModule();
  var dangerous = JSON.parse(
    '{"prototype":3,"__proto__":{"polluted":true},"constructor":2}'
  );
  var nestedDangerous = JSON.parse(
    '{"outer":{"prototype":3,"__proto__":{"polluted":true},"constructor":2}}'
  );
  var dangerousCanonical =
    '{"__proto__":{"polluted":true},"constructor":2,"prototype":3}';
  var nestedCanonical = '{"outer":' + dangerousCanonical + '}';
  var validAccount = job('task5-own-payload-fields', NOW_S + 10, 100);
  var inheritedRequired = JSON.parse('{"__proto__":{"schemaVersion":1,"accountId":' +
    String(validAccount.aggregateId) + '}}');
  var poisonedAccount = Object.assign({}, validAccount, {payload: inheritedRequired});
  var inheritedOnly = Object.create({schemaVersion: 1, accountId: Number(validAccount.aggregateId)});
  var events = require('../server/scheduler/events.js');
  var ref = {kind: 'fleet', ownerAccountId: 1, fleetId: 821,
    launchAtS: NOW_S, targetKey: '2:2:2', arrivalAtS: NOW_S + 10, mission: 'spy'};
  var externalSpecification = events.jobFromRef(ref, function () { return 2; });
  var dangerousRef = Object.assign({}, ref);
  Object.defineProperty(dangerousRef, '__proto__', {
    value: {mission: 'transport'}, enumerable: true, writable: true, configurable: true
  });
  var dangerousOuter = ['__proto__', 'constructor', 'prototype'].map(function (key) {
    var payload = {schemaVersion: 1, accountId: Number(validAccount.aggregateId)};
    Object.defineProperty(payload, key, {
      value: {unexpected: true}, enumerable: true, writable: true, configurable: true
    });
    return Object.assign({}, validAccount, {payload: payload});
  });
  var dangerousArray = [1];
  Object.defineProperty(dangerousArray, '__proto__', {
    value: {unexpected: true}, enumerable: true, writable: true, configurable: true
  });
  var sparseArray = new Array(2);
  sparseArray[1] = 1;
  var accessorArray = [1];
  Object.defineProperty(accessorArray, '0', {get: function () { return 1; }, enumerable: true});
  var canonicalSafe = storeApi.canonicalJson({b: [3], a: {z: 2, x: 1}});
  var canonicalDangerous = storeApi.canonicalJson(dangerous);
  var canonicalNested = storeApi.canonicalJson(nestedDangerous);
  var unsafeAccepted = [poisonedAccount].concat(dangerousOuter).some(function (candidate) {
    try { storeApi.validateJob(candidate); return true; }
    catch (error) { return false; }
  });
  var nestedUnsafeAccepted = false;
  try {
    storeApi.validateJob(Object.assign({}, externalSpecification, {
      payload: {schemaVersion: 1, ref: dangerousRef}
    }));
    nestedUnsafeAccepted = true;
  } catch (error) { void error; }
  if (canonicalSafe !== '{"a":{"x":1,"z":2},"b":[3]}' ||
      canonicalDangerous !== dangerousCanonical || canonicalNested !== nestedCanonical ||
      JSON.stringify(JSON.parse(canonicalDangerous)) !== dangerousCanonical ||
      storeApi.sha256(canonicalDangerous) === storeApi.sha256('{"constructor":2,"prototype":3}') ||
      {}.polluted !== undefined || unsafeAccepted || nestedUnsafeAccepted ||
      !task5DomainError(function () { storeApi.canonicalJson(inheritedOnly); },
        'PAYLOAD_VALUE_INVALID') ||
      ![dangerousArray, sparseArray, accessorArray].every(function (candidate) {
        return task5DomainError(function () { storeApi.canonicalJson(candidate); },
          'PAYLOAD_VALUE_INVALID');
      })) {
    throw new Error('TASK5_RED_STORE_OWN_PROPERTIES');
  }
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000544');
  var external = task5ExternalExecutable(x, 'attack', NOW_S + 10, 821);
  x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
    .run('{}', external.executable.id);
  var rejected = task5DomainError(function () {
    task5ReducerUow(x, {value: 10}, function (mutation) {
      return x.reducer.prepare(mutation, external.executable, {});
    });
  }, 'PAYLOAD_INTEGRITY');
  if (!rejected) throw new Error('TASK5_RED_REDUCER_INTEGRITY');
  assert.equal(x.kho.db.prepare(
    'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
  ).get(external.executable.id).n, 0);
});

test('Task 5 fault matrix rolls scheduler lease application effect save and completion together', function (t) {
  task5Lazy('reducers');
  var canonicalJson = task2StoreModule().canonicalJson, fixtureNumber = 600;
  function ownerId() {
    fixtureNumber++;
    return '00000000-0000-4000-8000-' + String(fixtureNumber).padStart(12, '0');
  }
  function failAt(label) { throw new Error('TASK5_FAULT_' + label.toUpperCase()); }
  function installMethodFault(owner, method, timing, label, expectedCalls) {
    var original = owner[method], calls = 0;
    owner[method] = function () {
      calls++;
      if (timing === 'before') failAt(label);
      var value = original.apply(this, arguments);
      if (timing === 'after') failAt(label);
      return value;
    };
    return function () {
      owner[method] = original;
      if (calls !== (expectedCalls || 1)) throw new Error('TASK5_RED_FAULT_MATRIX_FENCE_' +
        label.toUpperCase() + '_' + calls);
    };
  }
  function externalLifecycle(x, executable, budget, boundary, captured) {
    return x.kho.trongGiaoDich(function () {
      return x.world.trongMutationScheduler(task4Mutation(x.lease, x.clock,
        {remainingBudget: budget}), function () {
        var mutation = x.world._schedulerMutation;
        if (boundary === 'mark-before') failAt(boundary);
        x.store.markDurableMutation(x.lease, x.clock.nowMs());
        if (boundary === 'mark-after') failAt(boundary);
        var prepared = x.reducer.prepare(mutation, executable, {});
        captured.application = canonicalJson(prepared.application);
        var committed = x.store.hasCommittedApplication(
          x.lease, executable, x.clock.nowMs()
        );
        if (!committed) budget.value -= 1;
        if (boundary === 'insert-before') failAt(boundary);
        var application = x.store.insertApplication(x.lease, executable,
          prepared.application, x.clock.nowMs(), prepared.canonicalTContext || null);
        captured.alreadyApplied = application.alreadyApplied;
        if (boundary === 'insert-after') failAt(boundary);
        if (!application.alreadyApplied) {
          if (boundary === 'effect-before') failAt(boundary);
          captured.effect = canonicalJson(x.reducer.applyPrepared(mutation, prepared));
          if (boundary === 'effect-after') failAt(boundary);
        }
        if (boundary === 'completion-before') failAt(boundary);
        x.store.completeApplied(x.lease, executable, x.clock.nowMs());
        if (boundary === 'completion-after') failAt(boundary);
        return captured;
      });
    }, {immediate: true});
  }
  function assertRejected(error, boundary) {
    var expected = boundary === 'generation-flip' ? 'LEASE_LOST' :
      'TASK5_FAULT_' + boundary.toUpperCase();
    return error && (error.code === expected || error.message === expected);
  }

  // Seed creation has no deterministic value before it commits (the key is
  // intentionally random), so these two cases assert the actual statement
  // fences, exact rollback, and one valid persisted key on the clean retry.
  ['seed-before', 'seed-after'].forEach(function (boundary) {
    var x = task5ReducerFixture(t, ownerId()), before = task5SqliteSnapshot(x.kho);
    var generated = null, rejected = false;
    try {
      x.kho.trongGiaoDich(function () {
        if (boundary === 'seed-before') failAt(boundary);
        generated = x.reducer.initializeCombatSeed(x.lease, x.clock.nowMs());
        failAt(boundary);
      }, {immediate: true});
    } catch (error) { rejected = assertRejected(error, boundary); }
    if (!rejected || !task5SqliteSnapshot(x.kho).equals(before) ||
        x.kho.cauhinh('combat_seed_key_v1') !== null ||
        boundary === 'seed-after' && !/^[0-9a-f]{64}$/.test(generated)) {
      throw new Error('TASK5_RED_FAULT_MATRIX_' + boundary.toUpperCase());
    }
    var committed = task5InitializeSeed(x);
    if (!/^[0-9a-f]{64}$/.test(committed) ||
        x.kho.db.prepare("SELECT COUNT(*) AS n FROM cauhinh WHERE k='combat_seed_key_v1'").get().n !== 1) {
      throw new Error('TASK5_RED_FAULT_MATRIX_' + boundary.toUpperCase());
    }
  });

  var globalFaults = [
    {boundary: 'mark-before', cost: 0}, {boundary: 'mark-after', cost: 0},
    {boundary: 'insert-before', cost: 1}, {boundary: 'insert-after', cost: 1},
    {boundary: 'effect-before', cost: 1}, {boundary: 'effect-after', cost: 1},
    {boundary: 'save-before', cost: 1, method: 'luu', timing: 'before'},
    {boundary: 'save-after', cost: 1, method: 'luu', timing: 'after'},
    {boundary: 'sync-before', cost: 1, method: '_dongBoSchedulerLuu', timing: 'before'},
    {boundary: 'sync-after', cost: 1, method: '_dongBoSchedulerLuu', timing: 'after'},
    {boundary: 'final-fence-before', cost: 1,
      method: '_assertSchedulerFinalFence', timing: 'before'},
    {boundary: 'final-fence-after', cost: 1,
      method: '_assertSchedulerFinalFence', timing: 'after'},
    {boundary: 'completion-before', cost: 1}, {boundary: 'completion-after', cost: 1},
    {boundary: 'generation-flip', cost: 1, generation: true}
  ];
  globalFaults.forEach(function (scenario, index) {
    var x = task5ReducerFixture(t, ownerId());
    var external = task5ExternalExecutable(x, 'spy', NOW_S + 40 + index, 1300 + index);
    var before = task5SqliteSnapshot(x.kho), budget = {value: 2};
    var captured = {}, restore = function () {}, rejected = false;
    if (scenario.method) {
      restore = installMethodFault(x.world, scenario.method, scenario.timing,
        scenario.boundary);
    } else if (scenario.generation) {
      var originalFence = x.world._assertSchedulerFinalFence, fenceCalls = 0;
      x.world._assertSchedulerFinalFence = function (mutation) {
        fenceCalls++;
        x.kho.db.prepare(
          "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
        ).run();
        return originalFence.call(this, mutation);
      };
      restore = function () {
        x.world._assertSchedulerFinalFence = originalFence;
        if (fenceCalls !== 1) throw new Error('TASK5_RED_FAULT_MATRIX_GENERATION_FLIP');
      };
    }
    try { externalLifecycle(x, external.executable, budget, scenario.boundary, captured); }
    catch (error) { rejected = assertRejected(error, scenario.boundary); }
    finally { restore(); }
    if (!rejected || budget.value !== 2 - scenario.cost ||
        !task5SqliteSnapshot(x.kho).equals(before) ||
        x.store.getById(external.executable.id).state !== 'RUNNING' ||
        x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?')
          .get(external.executable.id).n !== 0) {
      throw new Error('TASK5_RED_FAULT_MATRIX_' + scenario.boundary.toUpperCase());
    }
    var retryBudget = {value: 1}, retry = {};
    externalLifecycle(x, external.executable, retryBudget, null, retry);
    if (retryBudget.value !== 0 || retry.alreadyApplied !== false ||
        x.store.getById(external.executable.id).state !== 'COMPLETED' ||
        x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?')
          .get(external.executable.id).n !== 1 ||
        captured.application && captured.application !== retry.application ||
        captured.effect && captured.effect !== retry.effect ||
        !Object.prototype.hasOwnProperty.call(x.state(1).spy, external.ref.targetKey)) {
      throw new Error('TASK5_RED_FAULT_MATRIX_RETRY_' + scenario.boundary.toUpperCase());
    }
  });

  // A committed-application retry does not spend a second global budget unit.
  // The two insertion fences are exercised separately for new and replay paths.
  ['insert-before', 'insert-after'].forEach(function (boundary, index) {
    var x = task5ReducerFixture(t, ownerId());
    var external = task5ExternalExecutable(x, 'spy', NOW_S + 70 + index, 1400 + index);
    x.kho.trongGiaoDich(function () {
      return x.world.trongMutationScheduler(task4Mutation(x.lease, x.clock,
        {remainingBudget: {value: 1}}), function () {
        var mutation = x.world._schedulerMutation;
        x.store.markDurableMutation(x.lease, x.clock.nowMs());
        var prepared = x.reducer.prepare(mutation, external.executable, {});
        x.store.insertApplication(x.lease, external.executable, prepared.application,
          x.clock.nowMs(), prepared.canonicalTContext || null);
      });
    }, {immediate: true});
    var before = task5SqliteSnapshot(x.kho), beforeDq = x.kho.db.prepare(
      'SELECT tk,state,revision FROM dq ORDER BY tk'
    ).all(), budget = {value: 0}, rejected = false;
    try { externalLifecycle(x, external.executable, budget, boundary, {}); }
    catch (error) { rejected = assertRejected(error, boundary); }
    if (!rejected || budget.value !== 0 || !task5SqliteSnapshot(x.kho).equals(before)) {
      throw new Error('TASK5_RED_FAULT_MATRIX_REPLAY_' + boundary.toUpperCase());
    }
    var retry = {};
    externalLifecycle(x, external.executable, budget, null, retry);
    if (!retry.alreadyApplied || budget.value !== 0 ||
        x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?')
          .get(external.executable.id).n !== 1 ||
        canonicalJson(x.kho.db.prepare('SELECT tk,state,revision FROM dq ORDER BY tk').all()) !==
          canonicalJson(beforeDq)) {
      throw new Error('TASK5_RED_FAULT_MATRIX_REPLAY_' + boundary.toUpperCase());
    }
  });

  function partialFixture(blocked) {
    var x = task5ReducerFixture(t, ownerId()), atS = NOW_S + fixtureNumber;
    var dependency = null;
    if (blocked) dependency = task5ExternalExecutable(x, 'spy', atS, 1500 + fixtureNumber);
    else task5SaveCanonical(x, 1, task5Timeline(x.state(1), atS, 2));
    var revision = Number(x.kho.q.dqGet.get(1).revision);
    return {x: x, executable: task5AccountExecutable(x, 1, revision, atS),
      dependency: dependency};
  }
  function partialLifecycle(pair, budget, kind, boundary, captured) {
    var x = pair.x;
    return x.kho.trongGiaoDich(function () {
      return x.world.trongMutationScheduler(task4Mutation(x.lease, x.clock,
        {remainingBudget: budget}), function () {
        var mutation = x.world._schedulerMutation;
        x.store.markDurableMutation(x.lease, x.clock.nowMs());
        var prepared = x.reducer.prepare(mutation, pair.executable, {});
        captured.prepared = canonicalJson({kind: prepared.kind,
          advanceResult: prepared.advanceResult, saveReceipt: prepared.saveReceipt});
        if (prepared.kind !== 'partial') throw new Error('TASK5_RED_FAULT_MATRIX_PARTIAL');
        var effect = x.reducer.applyPrepared(mutation, prepared);
        captured.effect = canonicalJson(effect);
        if (boundary === kind + '-before') failAt(boundary);
        if (kind === 'checkpoint') {
          x.store.checkpointPartial(x.lease, pair.executable,
            effect.checkpointRevision, x.clock.nowMs());
        } else {
          x.store.blockOwnedAccountAdvance(x.lease, pair.executable,
            effect.checkpointRevision, prepared.advanceResult.blockedExternalJobId,
            x.clock.nowMs());
        }
        if (boundary === kind + '-after') failAt(boundary);
        return captured;
      });
    }, {immediate: true});
  }
  [
    {boundary: 'account-save-before', timing: 'before'},
    {boundary: 'account-save-after', timing: 'after'},
    {boundary: 'checkpoint-before', kind: 'checkpoint'},
    {boundary: 'checkpoint-after', kind: 'checkpoint'},
    {boundary: 'block-before', kind: 'block', blocked: true},
    {boundary: 'block-after', kind: 'block', blocked: true}
  ].forEach(function (scenario) {
    var pair = partialFixture(scenario.blocked === true), x = pair.x;
    var budget = {value: scenario.blocked ? 10 : 1};
    var beforeBudget = budget.value, before = task5SqliteSnapshot(x.kho), captured = {};
    // Account save enters the existing public `luu` wrapper and its private
    // in-batch recursion; the after fence therefore observes both calls, while
    // the before fence stops at the outer statement boundary.
    var restore = scenario.timing ? installMethodFault(
      x.world, 'luu', scenario.timing, scenario.boundary,
      scenario.timing === 'after' ? 2 : 1
    ) : function () {};
    var rejected = false;
    try {
      partialLifecycle(pair, budget, scenario.kind || 'checkpoint', scenario.boundary, captured);
    } catch (error) { rejected = assertRejected(error, scenario.boundary); }
    finally { restore(); }
    var expectedCost = scenario.blocked ? 0 : 1;
    if (!rejected || budget.value !== beforeBudget - expectedCost ||
        !task5SqliteSnapshot(x.kho).equals(before) ||
        x.store.getById(pair.executable.id).state !== 'RUNNING') {
      throw new Error('TASK5_RED_FAULT_MATRIX_' + scenario.boundary.toUpperCase());
    }
    var retryBudget = {value: scenario.blocked ? 10 : 1}, retry = {};
    partialLifecycle(pair, retryBudget, scenario.blocked ? 'block' : 'checkpoint', null, retry);
    var row = x.store.getById(pair.executable.id);
    if (retryBudget.value !== (scenario.blocked ? 10 : 0) ||
        captured.prepared && captured.prepared !== retry.prepared ||
        captured.effect && captured.effect !== retry.effect ||
        scenario.blocked && (row.state !== 'PENDING' ||
          row.blocked_by_job_id !== pair.dependency.executable.id) ||
        !scenario.blocked && (row.state !== 'RUNNING' || row.checkpoint_revision === null)) {
      throw new Error('TASK5_RED_FAULT_MATRIX_RETRY_' + scenario.boundary.toUpperCase());
    }
  });
});

test('Task 5 post-commit restart cannot duplicate any external effect', function (t) {
  task5Lazy('reducers');
  ['attack', 'transport', 'spy', 'hold', 'missile'].forEach(function (mission, index) {
    var x = task5ReducerFixture(t,
      '00000000-0000-4000-8000-' + String(546 + index).padStart(12, '0'));
    var external = task5ExternalExecutable(x, mission, NOW_S + 12 + index, 823 + index);
    if (mission === 'attack') {
      var target = x.state(2);
      target.planets[0].ships.fighterL = 8;
      task5DirectStateWrite(x, 2, target);
      task5InitializeSeed(x);
    }
    function execute(executable) {
      return task5ReducerUow(x, {value: 10}, function (mutation) {
        var prepared = x.reducer.prepare(mutation, executable, {});
        if (!prepared.application) throw new Error('TASK5_RED_POST_COMMIT_IDEMPOTENCY');
        var application = x.store.insertApplication(
          x.lease, executable, prepared.application, x.clock.nowMs(),
          prepared.canonicalTContext || null
        );
        var effect = application.alreadyApplied ? null :
          x.reducer.applyPrepared(mutation, prepared);
        return {application: application, effect: effect};
      }).value;
    }
    var first = execute(external.executable), afterFirst = task5SqliteSnapshot(x.kho);
    task5ReopenReducerFixture(x);
    var reloaded = x.store.loadExecutableJob(
      x.lease, x.store.getById(external.executable.id), x.clock.nowMs()
    );
    var second = execute(reloaded), afterSecond = task5SqliteSnapshot(x.kho);
    if (!first.effect || first.application.alreadyApplied ||
        !second.application.alreadyApplied || second.effect !== null ||
        !afterSecond.equals(afterFirst)) {
      throw new Error('TASK5_RED_POST_COMMIT_IDEMPOTENCY_' + mission.toUpperCase());
    }
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
    ).get(external.executable.id).n, 1);
  });
});

test('Task 5 reducers join Task 4 finalizers and coalesce participant saves', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000547');
  var atS = NOW_S + 13, state = task5Timeline(x.state(1), atS, 2);
  task5SaveCanonical(x, 1, state);
  var beforeRevision = Number(x.kho.q.dqGet.get(1).revision);
  var executable = task5AccountExecutable(x, 1, beforeRevision, atS);
  var resolved = task5PrepareAndApply(x, executable, {value: 1}, {});
  var receipt = resolved.prepared.saveReceipt;
  if (!receipt || receipt !== resolved.prepared.advanceResult.saveReceipt ||
      receipt !== resolved.effect.saveReceipt || receipt.revision !== beforeRevision + 1) {
    throw new Error('TASK5_RED_TASK4_UOW_FINALIZERS');
  }
  assert.equal(Number(x.kho.q.dqGet.get(1).revision), beforeRevision + 1);
});

test('Task 5 every gameplay timestamp derives from effective T', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000548');
  var atS = NOW_S + 14, external = task5ExternalExecutable(x, 'spy', atS, 824);
  var resolved = task5PrepareAndApply(x, external.executable, {value: 10}, {});
  var report = x.state(1).spy && x.state(1).spy[external.ref.targetKey];
  if (!resolved.effect || !report || report.t !== atS ||
      resolved.prepared.application.effectiveAtS !== atS) {
    throw new Error('TASK5_RED_EFFECTIVE_TIME');
  }
  assert.notEqual(report.t * 1000, x.clock.nowMs() + 1);
});

test('Task 5 recovered latest state result has exactly five validated keys', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000549');
  var executable = task5ClaimGlobal(x, NOW_S + 15), recoveredAtS = NOW_S + 20;
  var prepared = task5ReducerUow(x, {value: 10}, function (mutation) {
    return x.reducer.prepareRecoveredLatestState(mutation, executable, recoveredAtS);
  }).value;
  var result = prepared.application && prepared.application.result;
  if (!result || Object.keys(result).sort().join(',') !==
      'code,originalScheduledAtS,recoveredAtCutover,recoveredAtS,recovery' ||
      result.code !== 'RECOVERED_LATEST_STATE' || result.recoveredAtS !== recoveredAtS) {
    throw new Error('TASK5_RED_RECOVERED_FIVE_KEYS');
  }
  assert.equal(result.originalScheduledAtS, NOW_S + 15);
  assert.equal(result.recoveredAtCutover, true);
});

test('Task 5 local and global reducers share the exact final budget unit', function (t) {
  task5Lazy('reducers');
  var local = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000550');
  var atS = NOW_S + 16, state = task5Timeline(local.state(1), atS, 1);
  task5SaveCanonical(local, 1, state);
  var revision = Number(local.kho.q.dqGet.get(1).revision);
  var accountJob = task5AccountExecutable(local, 1, revision, atS);
  var budget = {value: 2};
  var account = task5ReducerUow(local, budget, function (mutation) {
    return local.reducer.prepare(mutation, accountJob, {});
  }).value;
  var global = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000551');
  var external = task5ExternalExecutable(global, 'spy', atS, 825);
  if (budget.value > 0) budget.value -= 1;
  var prepared = task5ReducerUow(global, budget, function (mutation) {
    return global.reducer.prepare(mutation, external.executable, {});
  }).value;
  if (!account.application || account.application.result.code !== 'ACCOUNT_ADVANCED' ||
      budget.value !== 0 || !prepared.application ||
      prepared.application.result.code !== 'EXTERNAL_RESOLVED') {
    throw new Error('TASK5_RED_COMBINED_SHARED_BUDGET');
  }
  assert.equal(account.advanceResult.processed, 1);
});

test('Task 5 reducer dispatches every external family through its exact world hook', function (t) {
  task5Lazy('reducers');
  var families = [
    ['attack', 'resolvePvpAt'], ['transport', 'resolveTransportAt'],
    ['spy', 'resolveSpyAt'], ['hold', 'resolveHoldAt'], ['missile', 'resolveMissileAt']
  ];
  var observed = [];
  families.forEach(function (entry, index) {
    var x = task5ReducerFixture(t, '00000000-0000-4000-8000-' + String(552 + index).padStart(12, '0'));
    var external = task5ExternalExecutable(x, entry[0], NOW_S + 17 + index, 826 + index);
    if (entry[0] === 'attack') task5InitializeSeed(x);
    var original = x.world[entry[1]];
    x.world[entry[1]] = function () {
      observed.push([entry[1], Array.prototype.slice.call(arguments)]);
      return {family: entry[0], applied: true};
    };
    try { task5PrepareAndApply(x, external.executable, {value: 10}, {}); }
    finally { x.world[entry[1]] = original; }
  });
  if (observed.length !== 5 || observed.some(function (call, index) {
    return call[0] !== families[index][1] || call[1][0].mission !== families[index][0] ||
      call[1][1] !== NOW_S + 17 + index;
  })) throw new Error('TASK5_RED_WORLD_HOOK_DISPATCH');
  assert.deepEqual(observed.map(function (call) { return call[0]; }),
    families.map(function (entry) { return entry[1]; }));
});

test('Task 5 module topology preserves legacy bridges and exact new authorities', function () {
  var reducers = task5Lazy('reducers');
  var reducerSource = fs.readFileSync(path.join(__dirname, TASK5_MODULE.reducers), 'utf8');
  var advanceSource = fs.readFileSync(path.join(__dirname, TASK5_MODULE.advance), 'utf8');
  var storeSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'scheduler', 'store.js'), 'utf8');
  var snapshotSource = fs.readFileSync(path.join(__dirname, TASK5_MODULE.snapshot), 'utf8');
  var worldSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'world.js'), 'utf8');
  var valid = reducers.seed32 === task5Lazy('snapshot').seed32 &&
    (advanceSource.match(/G\.tick\s*\(/g) || []).length === 1 &&
    (snapshotSource.match(/createHmac\s*\(/g) || []).length === 1 &&
    /assertCanonicalExecutable\s*\(/.test(reducerSource) &&
    /getOrCreateCombatSeedKey\s*\(/.test(reducerSource) &&
    /supportersByAccount/.test(worldSource) && !/supporters\.find\s*\(/.test(worldSource) &&
    !/INSERT\s+INTO\s+event_applications/i.test(reducerSource) &&
    /INSERT\s+INTO\s+event_applications/i.test(storeSource);
  if (!valid) throw new Error('TASK5_RED_STATIC_TOPOLOGY');
  assert.deepEqual(Object.keys(reducers).sort(),
    ['EventReducer', 'resolveCanonicalGlobalInCurrentUow', 'seed32']);
});

test('Task 5 global charging and committed-application replay are exactly idempotent', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000557');
  var external = task5ExternalExecutable(x, 'spy', NOW_S + 22, 831);
  var budget = {value: 2}, effects = 0;
  function parentAttempt() {
    return task5ReducerUow(x, budget, function (mutation) {
      var prepared = x.reducer.prepare(mutation, external.executable, {});
      if (!prepared.application) throw new Error('TASK5_RED_GLOBAL_BUDGET_IDEMPOTENCY');
      var committed = x.store.hasCommittedApplication(x.lease, external.executable, x.clock.nowMs());
      if (!committed) budget.value -= 1;
      var application = x.store.insertApplication(x.lease, external.executable,
        prepared.application, x.clock.nowMs(), prepared.canonicalTContext || null);
      if (!application.alreadyApplied) { x.reducer.applyPrepared(mutation, prepared); effects++; }
      return application.alreadyApplied;
    }).value;
  }
  var firstExisting = parentAttempt(), secondExisting = parentAttempt();
  if (firstExisting || !secondExisting || budget.value !== 1 || effects !== 1) {
    throw new Error('TASK5_RED_GLOBAL_BUDGET_IDEMPOTENCY');
  }
  assert.equal(x.kho.db.prepare(
    'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
  ).get(external.executable.id).n, 1);
});

test('Task 5 canonical global helper remains downstream-compatible and resolves operator invalidation', function (t) {
  var reducers = task5Lazy('reducers');
  function fixture(ownerSuffix, id, removeEntity) {
    var x = task5ReducerFixture(t,
      '00000000-0000-4000-8000-' + String(ownerSuffix).padStart(12, '0'));
    var external = task5ExternalExecutable(x, 'spy', NOW_S + 23, id);
    x.kho.db.prepare(
      "UPDATE event_jobs SET state='PENDING',locked_by=NULL,locked_generation=NULL," +
      'locked_until_ms=NULL WHERE id=?'
    ).run(external.executable.id);
    if (removeEntity) {
      var state = x.state(1);
      state.fleets = state.fleets.filter(function (fleet) { return fleet.id !== id; });
      task5DirectStateWrite(x, 1, state);
    }
    return {x: x, external: external};
  }
  function contextFor(pair, mutation, lockMs) {
    var context = {store: pair.x.store, reducer: pair.x.reducer,
      mutation: mutation, leaseToken: pair.x.lease, nowMs: pair.x.clock.nowMs()};
    if (lockMs !== null) context.lockMs = lockMs;
    return context;
  }

  var defaulted = fixture(558, 832, true);
  var defaultBudget = {value: 1};
  var defaultMutation = task4Mutation(defaulted.x.lease, defaulted.x.clock,
    {remainingBudget: defaultBudget});
  var transactionPhases = [];
  defaulted.x.kho.onTransaction = function (phase) { transactionPhases.push(phase); };
  var defaultResult = defaulted.x.kho.trongGiaoDich(function () {
    return defaulted.x.world.trongMutationScheduler(defaultMutation, function () {
      return reducers.resolveCanonicalGlobalInCurrentUow(
        contextFor(defaulted, defaultMutation, null), defaulted.external.executable.id,
        'MATCH_INVALIDATED'
      );
    });
  }, {immediate: true});
  defaulted.x.kho.onTransaction = null;
  if (!defaultResult || Object.keys(defaultResult).join(',') !==
      'logicalRootId,resolvedJobId,neutralization' ||
      defaultResult.logicalRootId !== defaulted.external.executable.id ||
      defaultResult.resolvedJobId !== defaulted.external.executable.id ||
      defaultResult.neutralization !== 'ALREADY_ABSENT' || defaultBudget.value !== 0 ||
      defaulted.x.store.getById(defaulted.external.executable.id).state !== 'CANCELLED' ||
      transactionPhases.join(',') !== 'begin-immediate,commit') {
    throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER');
  }

  ['ENTITY_REMOVED', 'OPERATOR_CONFIRMED_INVALID'].forEach(function (reason, index) {
    var pair = fixture(560 + index, 834 + index, true);
    var budget = {value: 1};
    var mutation = task4Mutation(pair.x.lease, pair.x.clock, {remainingBudget: budget});
    var lockedUntilMs = null;
    var result = pair.x.kho.trongGiaoDich(function () {
      return pair.x.world.trongMutationScheduler(mutation, function () {
        return reducers.resolveCanonicalGlobalInCurrentUow(
          contextFor(pair, mutation, 12_345), pair.external.executable.id, reason, {
            afterApplicationForTest: function (jobValue) {
              lockedUntilMs = Number(jobValue.locked_until_ms);
            }
          }
        );
      });
    }, {immediate: true});
    if (Object.keys(result).join(',') !== 'logicalRootId,resolvedJobId,neutralization' ||
        result.neutralization !== 'ALREADY_ABSENT' || budget.value !== 0 ||
        lockedUntilMs !== pair.x.clock.nowMs() + 12_345) {
      throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER');
    }
  });

  var invalid = fixture(562, 836, true);
  var invalidBudget = {value: 1};
  var invalidMutation = task4Mutation(invalid.x.lease, invalid.x.clock,
    {remainingBudget: invalidBudget});
  var exactContext = contextFor(invalid, invalidMutation, null);
  var badContexts = [Object.assign({}, exactContext, {extra: true}),
    Object.assign({}, exactContext, {nowMs: exactContext.nowMs + 1})];
  var symbolContext = Object.assign({}, exactContext);
  symbolContext[Symbol('extra')] = true;
  badContexts.push(symbolContext);
  var hiddenContext = Object.assign({}, exactContext);
  Object.defineProperty(hiddenContext, 'extra', {value: true});
  badContexts.push(hiddenContext);
  var hiddenRequired = Object.assign({}, exactContext);
  Object.defineProperty(hiddenRequired, 'nowMs', {
    value: exactContext.nowMs, enumerable: false, writable: true, configurable: true
  });
  badContexts.push(hiddenRequired);
  var getterReads = 0, accessorRequired = Object.assign({}, exactContext);
  Object.defineProperty(accessorRequired, 'nowMs', {
    get: function () { getterReads++; return exactContext.nowMs; },
    enumerable: true, configurable: true
  });
  badContexts.push(accessorRequired);
  var undefinedLock = Object.assign({}, exactContext, {lockMs: undefined});
  badContexts.push(undefinedLock);
  var invalidBefore = task5SqliteSnapshot(invalid.x.kho);
  badContexts.forEach(function (badContext) {
    var rejected = invalid.x.kho.trongGiaoDich(function () {
      return invalid.x.world.trongMutationScheduler(invalidMutation, function () {
        return task5DomainError(function () {
          reducers.resolveCanonicalGlobalInCurrentUow(badContext,
            invalid.external.executable.id, 'ENTITY_REMOVED', {});
        }, 'CANONICAL_GLOBAL_HELPER_INVALID');
      });
    }, {immediate: true});
    if (!rejected || !task5SqliteSnapshot(invalid.x.kho).equals(invalidBefore)) {
      throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER');
    }
  });
  if (getterReads !== 0) throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER_ACCESSOR');

  var invalidOptionsPair = fixture(568, 842, true);
  var invalidOptionsBudget = {value: 1};
  var invalidOptionsMutation = task4Mutation(invalidOptionsPair.x.lease,
    invalidOptionsPair.x.clock, {remainingBudget: invalidOptionsBudget});
  var hiddenOptions = {};
  Object.defineProperty(hiddenOptions, 'detail', {value: null, enumerable: false});
  var optionsBefore = task5SqliteSnapshot(invalidOptionsPair.x.kho);
  var invalidOptionsRejected = invalidOptionsPair.x.kho.trongGiaoDich(function () {
    return invalidOptionsPair.x.world.trongMutationScheduler(invalidOptionsMutation, function () {
      return task5DomainError(function () {
        reducers.resolveCanonicalGlobalInCurrentUow(
          contextFor(invalidOptionsPair, invalidOptionsMutation, null),
          invalidOptionsPair.external.executable.id, 'ENTITY_REMOVED', hiddenOptions
        );
      }, 'CANONICAL_GLOBAL_HELPER_INVALID');
    });
  }, {immediate: true});
  if (!invalidOptionsRejected || invalidOptionsBudget.value !== 1 ||
      !task5SqliteSnapshot(invalidOptionsPair.x.kho).equals(optionsBefore)) {
    throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER_OPTIONS');
  }

  var outside = fixture(563, 837, true);
  var outsideBudget = {value: 1};
  var outsideMutation = task4Mutation(outside.x.lease, outside.x.clock,
    {remainingBudget: outsideBudget});
  var outsideBefore = task5SqliteSnapshot(outside.x.kho);
  var outsideRejected = task5DomainError(function () {
    reducers.resolveCanonicalGlobalInCurrentUow(
      contextFor(outside, outsideMutation, null), outside.external.executable.id,
      'ENTITY_REMOVED', {}
    );
  }, 'CANONICAL_GLOBAL_HELPER_INVALID');
  if (!outsideRejected || outsideBudget.value !== 1 ||
      !task5SqliteSnapshot(outside.x.kho).equals(outsideBefore)) {
    throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER');
  }

  var ordered = fixture(564, 838, false), orderedBudget = {value: 1};
  var orderedMutation = task4Mutation(ordered.x.lease, ordered.x.clock,
    {remainingBudget: orderedBudget});
  var calls = [], restorers = [], observedDetail = null;
  function observe(owner, name, label) {
    var original = owner[name];
    owner[name] = function () {
      calls.push(label);
      if (label === 'prepare') observedDetail = arguments[3];
      return original.apply(this, arguments);
    };
    restorers.push(function () { owner[name] = original; });
  }
  observe(ordered.x.store, 'claimGlobalForInvalidation', 'claim');
  observe(ordered.x.reducer, 'prepareCanonicalInvalidation', 'prepare');
  observe(ordered.x.store, 'hasCommittedApplication', 'hasCommitted');
  observe(ordered.x.store, 'markDurableMutation', 'mark');
  observe(ordered.x.store, 'insertApplication', 'insert');
  observe(ordered.x.reducer, 'applyPrepared', 'effect');
  observe(ordered.x.store, 'finishResolved', 'finish');
  var exactDetail = {source: 'task5'};
  try {
    ordered.x.kho.trongGiaoDich(function () {
      return ordered.x.world.trongMutationScheduler(orderedMutation, function () {
        reducers.resolveCanonicalGlobalInCurrentUow(
          contextFor(ordered, orderedMutation, null), ordered.external.executable.id,
          'ENTITY_REMOVED', {detail: exactDetail,
            afterApplicationForTest: function () { calls.push('hook'); }}
        );
      });
    }, {immediate: true});
  } finally { restorers.reverse().forEach(function (restore) { restore(); }); }
  if (calls.join(',') !== 'claim,prepare,hasCommitted,mark,insert,hook,effect,finish' ||
      observedDetail !== exactDetail || orderedBudget.value !== 0) {
    throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER_ORDER');
  }

  var strictPending = fixture(569, 843, true);
  var strictPendingBudget = {value: 1};
  var strictPendingMutation = task4Mutation(strictPending.x.lease, strictPending.x.clock,
    {remainingBudget: strictPendingBudget});
  var strictPendingBefore = task5SqliteSnapshot(strictPending.x.kho);
  var strictRejected = strictPending.x.kho.trongGiaoDich(function () {
    return strictPending.x.world.trongMutationScheduler(strictPendingMutation, function () {
      return task5DomainError(function () {
        reducers.resolveCanonicalGlobalInCurrentUow(
          contextFor(strictPending, strictPendingMutation, null),
          strictPending.external.executable.id, 'ENTITY_REMOVED',
          {rootMustBeQuarantined: true}
        );
      }, 'QUARANTINE_RESOLUTION_INVALID');
    });
  }, {immediate: true});
  if (!strictRejected || strictPendingBudget.value !== 1 ||
      !task5SqliteSnapshot(strictPending.x.kho).equals(strictPendingBefore)) {
    throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER_STRICT_QUARANTINE');
  }

  var strictQuarantined = fixture(570, 844, true);
  strictQuarantined.x.kho.db.prepare(
    "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
    'locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL WHERE id=?'
  ).run(strictQuarantined.x.clock.nowMs(), strictQuarantined.external.executable.id);
  var strictBudget = {value: 1};
  var strictMutation = task4Mutation(strictQuarantined.x.lease, strictQuarantined.x.clock,
    {remainingBudget: strictBudget});
  var strictResult = strictQuarantined.x.kho.trongGiaoDich(function () {
    return strictQuarantined.x.world.trongMutationScheduler(strictMutation, function () {
      return reducers.resolveCanonicalGlobalInCurrentUow(
        contextFor(strictQuarantined, strictMutation, null),
        strictQuarantined.external.executable.id, 'ENTITY_REMOVED',
        {rootMustBeQuarantined: true}
      );
    });
  }, {immediate: true});
  if (!strictResult || strictBudget.value !== 0 ||
      strictQuarantined.x.store.getById(strictQuarantined.external.executable.id).state !==
        'CANCELLED') {
    throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER_STRICT_QUARANTINE');
  }

  var replay = fixture(565, 839, true);
  var setupMutation = task4Mutation(replay.x.lease, replay.x.clock,
    {remainingBudget: {value: 1}});
  replay.x.kho.trongGiaoDich(function () {
    return replay.x.world.trongMutationScheduler(setupMutation, function () {
      var jobValue = replay.x.store.claimGlobalForInvalidation(
        replay.x.lease, replay.external.executable.id, replay.x.clock.nowMs(), 15_000,
        {allowQuarantined: true, allowFuturePending: true}
      );
      var prepared = replay.x.reducer.prepareCanonicalInvalidation(
        setupMutation, jobValue, 'MATCH_INVALIDATED', null
      );
      replay.x.store.markDurableMutation(replay.x.lease, replay.x.clock.nowMs());
      replay.x.store.insertApplication(replay.x.lease, jobValue, prepared.application,
        replay.x.clock.nowMs(), prepared.canonicalTContext || null);
      replay.x.kho.db.prepare(
        "UPDATE event_jobs SET state='PENDING',locked_by=NULL,locked_generation=NULL," +
        'locked_until_ms=NULL WHERE id=?'
      ).run(jobValue.id);
    });
  }, {immediate: true});
  task5ReopenReducerFixture(replay.x);
  var replayBudget = {value: 0}, replayEffects = 0;
  var replayMutation = task4Mutation(replay.x.lease, replay.x.clock,
    {remainingBudget: replayBudget});
  var originalReplayApply = replay.x.reducer.applyPrepared;
  replay.x.reducer.applyPrepared = function () {
    replayEffects++;
    return originalReplayApply.apply(this, arguments);
  };
  var replayResult;
  try {
    replayResult = replay.x.kho.trongGiaoDich(function () {
      return replay.x.world.trongMutationScheduler(replayMutation, function () {
        return reducers.resolveCanonicalGlobalInCurrentUow(
          contextFor(replay, replayMutation, null), replay.external.executable.id,
          'MATCH_INVALIDATED'
        );
      });
    }, {immediate: true});
  } finally { replay.x.reducer.applyPrepared = originalReplayApply; }
  if (!replayResult || replayResult.neutralization !== 'ALREADY_ABSENT' ||
      replayEffects !== 0 || replayBudget.value !== 0 ||
      replay.x.store.getById(replay.external.executable.id).state !== 'CANCELLED' ||
      replay.x.kho.db.prepare(
        'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
      ).get(replay.external.executable.id).n !== 1) {
    throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER_REPLAY');
  }

  [
    {suffix: 566, id: 840, fault: 'application'},
    {suffix: 567, id: 841, fault: 'hook'},
    {suffix: 571, id: 845, fault: 'effect'},
    {suffix: 572, id: 846, fault: 'save'},
    {suffix: 573, id: 847, fault: 'finish'},
    {suffix: 574, id: 848, fault: 'generation'}
  ].forEach(function (scenario) {
    var failed = fixture(scenario.suffix, scenario.id, false);
    var failedBudget = {value: 1};
    var failedMutation = task4Mutation(failed.x.lease, failed.x.clock,
      {remainingBudget: failedBudget});
    var failedBefore = task5SqliteSnapshot(failed.x.kho);
    var faultOwner = scenario.fault === 'application' ? failed.x.store :
      scenario.fault === 'effect' ? failed.x.reducer :
      scenario.fault === 'save' ? failed.x.world :
      scenario.fault === 'finish' ? failed.x.store : null;
    var faultMethod = scenario.fault === 'application' ? 'insertApplication' :
      scenario.fault === 'effect' ? 'applyPrepared' :
      scenario.fault === 'save' ? 'luu' : 'finishResolved';
    var originalFault = faultOwner && faultOwner[faultMethod];
    if (faultOwner) faultOwner[faultMethod] = function () {
      originalFault.apply(this, arguments);
      throw new Error('TASK5_HELPER_FAULT');
    };
    var sawFault = false;
    try {
      failed.x.kho.trongGiaoDich(function () {
        return failed.x.world.trongMutationScheduler(failedMutation, function () {
          return reducers.resolveCanonicalGlobalInCurrentUow(
            contextFor(failed, failedMutation, null), failed.external.executable.id,
            'ENTITY_REMOVED', scenario.fault === 'hook' || scenario.fault === 'generation' ? {
              afterApplicationForTest: function () {
                if (scenario.fault === 'hook') throw new Error('TASK5_HELPER_FAULT');
                failed.x.kho.db.prepare(
                  "UPDATE scheduler_lease SET generation=generation+1 " +
                  "WHERE lease_name='global-writer'"
                ).run();
              }
            } : {}
          );
        });
      }, {immediate: true});
    } catch (error) {
      sawFault = error && (error.message === 'TASK5_HELPER_FAULT' ||
        scenario.fault === 'generation' && error.message === 'LEASE_LOST');
    } finally { if (faultOwner) faultOwner[faultMethod] = originalFault; }
    if (!sawFault || failedBudget.value !== 0 ||
        !task5SqliteSnapshot(failed.x.kho).equals(failedBefore)) {
      throw new Error('TASK5_RED_CANONICAL_GLOBAL_HELPER_ROLLBACK');
    }
  });
});

test('Task 5 every world reducer hook rejects direct and inactive mutation execution', function (t) {
  task5Lazy('reducers');
  var x = task5ReducerFixture(t, '00000000-0000-4000-8000-000000000559');
  var names = ['resolvePvpAt', 'resolveTransportAt', 'resolveSpyAt',
    'resolveHoldAt', 'resolveMissileAt'];
  var rejected = names.every(function (name) {
    return task5DomainError(function () { x.world[name]({}, NOW_S, null, null, null); },
      'SCHEDULER_MUTATION_TOKEN_REQUIRED');
  });
  var external = task5ExternalExecutable(x, 'spy', NOW_S + 24, 833);
  var valid = task5PrepareAndApply(x, external.executable, {value: 10}, {});
  if (!rejected || !valid.effect || valid.effect.applied !== true) {
    throw new Error('TASK5_RED_WORLD_HOOK_CONTEXT');
  }
  assert.ok(x.state(1).spy[external.ref.targetKey]);
});
// TASK6_V27_HELPERS_START
var task6v27AdvanceModule = task5Lazy('advance');
var GameAdvanceService = task6v27AdvanceModule.GameAdvanceService;
var toPublicAdvanceResult = task6v27AdvanceModule.toPublicAdvanceResult;
var task6v27ReducersModule = task5Lazy('reducers');
var EventReducer = task6v27ReducersModule.EventReducer;
var resolveCanonicalGlobalInCurrentUow = task6v27ReducersModule.resolveCanonicalGlobalInCurrentUow;
var SchedulerStore = task2StoreModule().SchedulerStore;
  function giayTuClock(clock) { return Math.floor(clock.nowMs() / 1000); }
  function taoMutationTam(leaseToken, budget, effectiveNowMs) {
    var remaining = budget && typeof budget.value === 'number' ? budget : {
      value: budget === undefined ? 50_000 : budget
    };
    return {
      leaseToken: leaseToken,
      remainingBudget: remaining,
      effectiveNowMs: effectiveNowMs === undefined ? 1_700_000_000_000 : effectiveNowMs
    };
  }
  function taoDongHoS(startS) {
    var nowMs = startS * 1000;
    return {
      nowMs: function () { return nowMs; },
      setS: function (value) { nowMs = value * 1000; },
      setMs: function (value) { nowMs = value; },
      advanceMs: function (value) { nowMs += value; }
    };
  }
  function themTaiKhoan(kho, ten, nowS) {
    return Number(kho.q.tkThem.run(ten, ten, 'test-hash', 'test-salt', nowS, nowS).lastInsertRowid);
  }
  function docState(kho, accountId) {
    return JSON.parse(kho.q.dqGet.get(accountId).state);
  }
  function attackTo(st, target) {
    var home = st.planets[0].c;
    return {
      id: st.fleetIdSeq++, pi: 0, tu: { g: home.g, h: home.h, p: home.p },
      den: { g: target.g, h: target.h, p: target.p }, mission: 'attack',
      ships: { fighterL: 1 }, linh: {}, cargo: {}, pct: 100,
      diLuc: st.lastTick, den_t: st.lastTick + 120, veLuc: null, ve_t: null,
      pha: 'di', giu: 0, nl: 0, kc: 1, doiHuong: 0
    };
  }
  function taoWorldSchedulerTam() {
    var clock = taoDongHoS(1_700_000_000), x = taoStoreTam(clock);
    x.clock = clock;
    x.lease = layLease(x, '00000000-0000-4000-8000-000000000005');
    x.world = new TheGioi(x.kho, { clock: clock, scheduler: x.store });
    x.attacker = themTaiKhoan(x.kho, 'attacker-' + x.file, giayTuClock(clock));
    x.target = themTaiKhoan(x.kho, 'target-' + x.file, giayTuClock(clock));
    x.kho.trongGiaoDich(function () {
      var mutation = taoMutationTam(x.lease);
      x.world.trongMutationScheduler(mutation, function () {
        x.world.taoDeQuoc(x.attacker, 'Attacker', { mutation: mutation });
        x.world.taoDeQuoc(x.target, 'Target', { mutation: mutation });
      });
    }, { immediate: true });
    x.targetHome = docState(x.kho, x.target).planets[0].c;
    x.kho.trongGiaoDich(function () {
      var mutation = taoMutationTam(x.lease);
      x.world.trongMutationScheduler(mutation, function () {
        x.world.luu(x.attacker, docState(x.kho, x.attacker), { mutation: mutation });
        x.world.luu(x.target, docState(x.kho, x.target), { mutation: mutation });
      });
    }, { immediate: true });
    return x;
  }
  function installAdvanceServiceFixture(x) {
    if (!x.service) {
      x.service = new GameAdvanceService({
        kho: x.kho, world: x.world, store: x.store, clock: x.clock
      });
      x.world.datAdvanceService(x.service);
    }
    return x.service;
  }
  function coDinhTimeline(st, atS) {
    st.now = atS; st.lastTick = atS;
    st.nextRaid = atS + 9_000_000;
    st.baoTri.nextAt = atS + 9_000_000;
    st.nextMaint = st.baoTri.nextAt;
    return st;
  }
  function holdAt(st, target, ownerAccountId, atS) {
    var home = st.planets[0].c;
    return {
      id: st.fleetIdSeq++, pi: 0, tu: { g: home.g, h: home.h, p: home.p },
      den: { g: target.g, h: target.h, p: target.p }, mission: 'hold',
      ships: { fighterL: 1 }, linh: {}, cargo: { deut: 1_000 }, pct: 100,
      diLuc: atS - 120, den_t: atS - 60, veLuc: null, ve_t: null,
      pha: 'giu', giu: 600, giuLuc: atS - 60, giuDen_t: atS + 600,
      tiepNL_t: atS + 600, giuTaiTk: ownerAccountId, nl: 0, kc: 1, doiHuong: 0
    };
  }
  function luuQuaMutation(x, accountId, state, budget) {
    return x.kho.trongGiaoDich(function () {
      var mutation = taoMutationTam(x.lease, budget, x.clock.nowMs());
      return x.world.trongMutationScheduler(mutation, function () {
        return x.world.luu(accountId, state, { mutation: mutation });
      });
    }, { immediate: true });
  }
function task6v23AdvanceFixtureAccount(x, accountId, atS) {
  x.clock.setS(atS);
  damBaoLeaseFixture(x);
  x.kho.trongGiaoDich(function () {
    var mutation = taoMutationTam(x.lease, {value: 50_000}, x.clock.nowMs());
    x.world.trongMutationScheduler(mutation, function () {
      x.service.advanceTo(mutation, accountId, atS, undefined);
    });
  }, {immediate: true});
}
function taoPvpFixtureAt(arrivalAtS) {
  var x = taoWorldSchedulerTam(), alliance = 'LienMinh' + x.target;
  x.clock.setS(arrivalAtS - 120);
  x.lease = layLease(x, '00000000-0000-4000-8000-000000000006');
  x.supporter = themTaiKhoan(x.kho, 'supporter-' + path.basename(x.file), giayTuClock(x.clock));
  x.unrelatedAccount = themTaiKhoan(x.kho, 'unrelated-' + path.basename(x.file), giayTuClock(x.clock));
  x.kho.trongGiaoDich(function () {
    var mutation = taoMutationTam(x.lease, undefined, x.clock.nowMs());
    x.world.trongMutationScheduler(mutation, function () {
      x.world.taoDeQuoc(x.supporter, 'Supporter', {mutation: mutation});
      x.world.taoDeQuoc(x.unrelatedAccount, 'Unrelated', {mutation: mutation});
    });
  }, {immediate: true});
  x.kho.q.lmThem.run(alliance, 'LM' + x.target, x.target, arrivalAtS - 90_000, null);
  x.kho.q.chienThemTK.run(x.attacker, x.target, arrivalAtS - 90_000);
  var defender = coDinhTimeline(docState(x.kho, x.target), arrivalAtS - 120);
  defender.lm = {ten: alliance};
  luuQuaMutation(x, x.target, defender);
  var supporter = coDinhTimeline(docState(x.kho, x.supporter), arrivalAtS - 120);
  supporter.lm = {ten: alliance};
  supporter.fleets.push(holdAt(supporter, x.targetHome, x.target, arrivalAtS));
  luuQuaMutation(x, x.supporter, supporter);
  var unrelated = coDinhTimeline(docState(x.kho, x.unrelatedAccount), arrivalAtS - 120);
  luuQuaMutation(x, x.unrelatedAccount, unrelated);
  var attacker = coDinhTimeline(docState(x.kho, x.attacker), arrivalAtS - 120);
  attacker.fleets.push(attackTo(attacker, x.targetHome));
  luuQuaMutation(x, x.attacker, attacker);
  installAdvanceServiceFixture(x);
  task6v23AdvanceFixtureAccount(x, x.attacker, arrivalAtS);
  var row = x.kho.db.prepare(
    "SELECT idempotency_key FROM event_jobs WHERE kind='PVP_RESOLVE' " +
    'ORDER BY sequence LIMIT 1'
  ).get();
  assert.ok(row && row.idempotency_key, 'TASK6V23_FIXTURE_PVP_JOB_CREATED');
  x.pvpStoredJob = x.store.getByIdempotencyKey(row.idempotency_key);
  assert.ok(x.pvpStoredJob && x.pvpStoredJob.id, 'TASK6V23_FIXTURE_PVP_JOB_LOADABLE');
  x.pvpJob = x.pvpStoredJob;
  x.pvpExecutable = null;
  x.reducer = new EventReducer({
    kho: x.kho, world: x.world, store: x.store,
    clock: x.clock, advanceService: x.service
  });
  return x;
}
function tuaFixtureQuaDichVu(x, accountId, atS) {
  task6v23AdvanceFixtureAccount(x, accountId, atS);
}
  function executeFixtureClaimedInCurrentUow(x, mutation, claimed, nowMs) {
    var executable = x.store.loadExecutableJob(mutation.leaseToken, claimed, nowMs);
    x.store.markDurableMutation(mutation.leaseToken, nowMs);
    if (executable.kind !== 'ACCOUNT_ADVANCE') {
      var barrier = x.service.advanceBarrier(mutation, executable);
      if (barrier.budgetExhausted) return { partial: true, jobId: executable.id };
      if (!x.store.hasCommittedApplication(
        mutation.leaseToken, executable, nowMs
      )) {
        if (mutation.remainingBudget.value === 0) {
          return {partial: true, budgetExhausted: true, jobId: executable.id};
        }
        mutation.remainingBudget.value -= 1;
      }
    }
    var prepared = x.reducer.prepare(mutation, executable);
    if (prepared.kind === 'partial') {
      var checkpoint = x.reducer.applyPrepared(mutation, prepared);
      x.store.checkpointPartial(
        mutation.leaseToken, executable, checkpoint.checkpointRevision, nowMs
      );
      return { partial: true, jobId: executable.id };
    }
    var application = x.store.insertApplication(
      mutation.leaseToken,
      executable,
      prepared.application,
      nowMs,
      prepared.canonicalTContext || null
    );
    var effect = prepared.mutation || { nextLocalAtS: null };
    if (!application.alreadyApplied) effect = x.reducer.applyPrepared(mutation, prepared) || effect;
    if (prepared.terminalState === 'CANCELLED') {
      x.store.finishResolved(
        mutation.leaseToken, executable, 'CANCELLED', prepared.cancelReason, nowMs
      );
    } else if (executable.kind === 'ACCOUNT_ADVANCE') {
      x.store.completeAccountAdvanceAndScheduleSuccessor(
        mutation.leaseToken, executable, effect.nextLocalAtS, nowMs
      );
    } else {
      x.store.completeApplied(mutation.leaseToken, executable, nowMs);
    }
    return { partial: false, jobId: executable.id, executable: executable };
  }
  function damBaoLeaseFixture(x) {
    var row = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get();
    if (Number(row.expires_at_ms) <= x.clock.nowMs()) {
      if (Number(row.expires_at_ms) === x.clock.nowMs()) x.clock.advanceMs(1);
      x.lease = layLease(x, x.lease.ownerId);
    }
    return x.lease;
  }
  function apDungPrepared(x, job, remainingBudget) {
    // Store only accepts an effect application for a live RUNNING claim.  The
    // direct reducer tests therefore obtain the same lease-verified claim a
    // writer would have obtained, rather than bypassing the state machine.
    x.clock.setS(job.scheduled_at_s);
    // PvP setup begins 120 seconds earlier, while a local fixture can begin
    // one second earlier. Acquire a new generation only when the old token is
    // no longer strictly live at this operation time.
    damBaoLeaseFixture(x);
    job = x.kho.trongGiaoDich(function () {
      var claimed = job.kind === 'ACCOUNT_ADVANCE' ?
        x.store.claimNext(x.lease, x.clock.nowMs(), job.scheduled_at_s, 15_000) :
        x.store.claimForResolution(
          x.lease, job.id, x.clock.nowMs(), 15_000, {onlyEligible: true}
        );
      assert.ok(claimed, 'fixture job must be eligible for claim');
      assert.equal(claimed.id, job.id);
      return claimed;
    }, { immediate: true });
    x.pvpStoredJob = job.kind === 'PVP_RESOLVE' ? job : x.pvpStoredJob;
    x.pvpJob = x.pvpStoredJob;
    x.kho.trongGiaoDich(function () {
      var mutation = taoMutationTam(x.lease, remainingBudget, x.clock.nowMs());
      x.world.trongMutationScheduler(mutation, function () {
        x.reducer.initializeCombatSeed(mutation.leaseToken, x.clock.nowMs());
        var outcome = executeFixtureClaimedInCurrentUow(x, mutation, job, x.clock.nowMs());
        assert.equal(outcome.partial, false);
        if (outcome.executable.kind === 'PVP_RESOLVE') x.pvpExecutable = outcome.executable;
      });
    }, { immediate: true });
    return x.kho.db.prepare(
      'SELECT effective_at_s,snapshot_json,result_json ' +
      'FROM event_applications WHERE idempotency_key=?'
    ).get(job.idempotency_key);
  }
  function giaiPvp(x) {
    return apDungPrepared(x, x.pvpStoredJob, { value: 50_000 });
  }
  function taoAccountAdvanceFixture(atS) {
    var x = taoWorldSchedulerTam();
    x.clock.setS(atS - 1);
    // `taoWorldSchedulerTam` acquired while constructing its base world; this
    // fixture's logical horizon may be later.  Reacquire after moving the fake
    // clock, before the first revisioned save, so every operation has a live
    // generation rather than silently using the construction token.
    x.lease = layLease(x, x.lease.ownerId);
    var state = coDinhTimeline(docState(x.kho, x.attacker), atS - 1);
    state.planets[0].qB = [{ id: 'metalMine', n: 1, xong: atS, tg: 0 }];
    luuQuaMutation(x, x.attacker, state);
    x.accountJob = x.store.getByIdempotencyKey(
      x.kho.db.prepare(
        "SELECT idempotency_key FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
        'ORDER BY sequence DESC LIMIT 1'
      ).get().idempotency_key
    );
    installAdvanceServiceFixture(x);
    x.reducer = new EventReducer({
      kho: x.kho,
      world: x.world,
      store: x.store,
      clock: x.clock,
      advanceService: x.service
    });
    return x;
  }
  function moLaiPvpFixture(x) {
    x.kho.dong();
    x.kho = new Kho(x.file);
    // Reopen paths are migration-first too: a future schema must fail before
    // a Store can read or mutate any scheduler row.
    apDungMigrationScheduler(x.kho, x.clock.nowMs());
    x.store = new SchedulerStore(x.kho, x.clock);
    x.world = new TheGioi(x.kho, { clock: x.clock, scheduler: x.store });
    x.service = null;
    installAdvanceServiceFixture(x);
    x.reducer = new EventReducer({
      kho: x.kho, world: x.world, store: x.store,
      clock: x.clock, advanceService: x.service
    });
    x.pvpStoredJob = x.store.getByIdempotencyKey(x.pvpStoredJob.idempotency_key);
    x.pvpJob = x.pvpStoredJob;
    x.lease = layLease(x, '00000000-0000-4000-8000-000000000006');
    // A completed job is never executable again.  Restart determinism reads
    // only its immutable canonical identity; the strict RUNNING loader remains
    // the sole execution gate.
    x.pvpExecutable = x.store.loadImmutableJobForAudit(x.pvpStoredJob.id);
    return x;
  }
  function holdArrivingAt(st, target, ownerAccountId, atS) {
    var fleet = holdAt(st, target, ownerAccountId, atS);
    fleet.pha = 'di'; fleet.den_t = atS; fleet.giuLuc = null; fleet.giuDen_t = null;
    return fleet;
  }
  function datNoiTaiCungGiay(st, atS, count) {
    st.planets[0].qB = Array.from({ length: count }, function () {
      return { id: 'metalMine', n: 1, xong: atS, tg: 0 };
    });
    return st;
  }
// TASK6_V27_HELPERS_END
// TASK6_V27_PARENT_TESTS_START
  // Add only these imports beside the shared prelude. Reuse its existing
  // `silentLogger(records)` instead of redeclaring it.
  var { SchedulerWriter } = require('../server/scheduler/writer.js');
  var { deterministicJitter } = require('../server/scheduler/store.js');
  var {
    taoScheduler,
    resolveDurableSchedulerOptions
  } = require('../server/scheduler/index.js');
  function schedulerOptionsCoSo() {
    return {
      schedulerPollMs: 1_000,
      schedulerLogTicks: false,
      cleanupMs: 60_000
    };
  }
  test('deterministic retry jitter is always in the inclusive 0..999 contract', function () {
    for (var i = 0; i < 10_000; i++) {
      var jitter = deterministicJitter('job-' + i, i + 1);
      assert.ok(jitter >= 0 && jitter < 1000, String(jitter));
    }
    // These fixed FNV inputs exercise both residues; a `% 999` mistake fails
    // the second assertion even though a broad random-looking loop may pass.
    assert.equal(deterministicJitter('job-224', 225), 0);
    assert.equal(deterministicJitter('job-49', 50), 999);
  });
  function taoBoHenGia(clock) {
    var nextId = 0, jobs = new Map();
    return {
      setTimeout: function (fn, delayMs) {
        var id = ++nextId;
        jobs.set(id, { id: id, dueAtMs: clock.nowMs() + delayMs, fn: fn });
        return id;
      },
      // Writer clears every handle defensively, including an idle null handle.
      clearTimeout: function (id) { if (id !== null && id !== undefined) jobs.delete(id); },
      chayDenHienTai: async function () {
        var due = Array.from(jobs.values()).filter(function (job) { return job.dueAtMs <= clock.nowMs(); })
          .sort(function (a, b) { return a.dueAtMs - b.dueAtMs || a.id - b.id; });
        for (var job of due) { jobs.delete(job.id); await job.fn(); }
      },
      dangCho: function () {
        return Array.from(jobs.values()).sort(function (a, b) {
          return a.dueAtMs - b.dueAtMs || a.id - b.id;
        });
      },
      soDangCho: function () { return jobs.size; }
    };
  }
  function datModeDurableChiWriterUnit(x) {
    x.kho.trongGiaoDich(function () {
      x.store.assertLiveLease(x.lease, x.clock.nowMs());
      x.kho.db.prepare(
        "UPDATE scheduler_meta SET value='durable',updated_at_ms=? " +
        "WHERE key='scheduler_mode'"
      ).run(x.clock.nowMs());
      assert.equal(x.store.releaseLease(x.lease, x.clock.nowMs()), true);
    }, { immediate: true });
  }
  function taoWriterFixture(options) {
    options = options || {};
    var x = taoPvpFixtureAt(1_800_010_000);
    datModeDurableChiWriterUnit(x); // isolated writer unit only; integration uses maintenance cutover below
    x.ownerId = '00000000-0000-4000-8000-000000000007';
    x.writer = new SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: options.pollMs || 1_000, leaseMs: options.leaseMs || 15_000,
      retryBaseMs: options.retryBaseMs || 1_000, retryMaxMs: options.retryMaxMs || 300_000,
      maxAttempts: options.maxAttempts || 8, reconcileIntervalMs: options.reconcileIntervalMs || 300_000,
      onReconcileForTest: options.onReconcileForTest,
      timers: options.timers, manualDrain: options.manualDrain !== undefined ? options.manualDrain : true
    });
    x.scheduler = taoScheduler({ writer: x.writer, store: x.store, world: x.world,
      advanceService: x.service, reducer: x.reducer, clock: x.clock,
      logger: silentLogger(), schedulerOptions: schedulerOptionsCoSo() });
    return x;
  }
  test('writer in legacy mode remains health-visible but cannot ready or drain', async function () {
    var x = taoPvpFixtureAt(1_800_010_000);
    x.writer = new SchedulerWriter({
      ownerId: '00000000-0000-4000-8000-000000000020', store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
    try {
      await x.writer.start();
      assert.equal(x.writer.status().ready, false);
      assert.equal(x.writer.status().reason, 'SCHEDULER_MODE_LEGACY');
      await assert.rejects(x.writer.drainNow(), /SCHEDULER_MODE_LEGACY/);
    } finally { await x.writer.stop(100); x.dong(); }
  });
  test('direct SchedulerWriter construction rejects a non-UUID owner before DB work', function () {
    var x = taoPvpFixtureAt(1_800_010_000);
    try {
      var leaseBefore = x.kho.db.prepare(
        'SELECT owner_id,generation,expires_at_ms FROM scheduler_lease ' +
        "WHERE lease_name='global-writer'"
      ).get();
      assert.throws(function () {
        return new SchedulerWriter({
          ownerId: 'writer-not-a-uuid', store: x.store, world: x.world, reducer: x.reducer,
          advanceService: x.service, clock: x.clock, logger: silentLogger(), pollMs: 1_000, leaseMs: 15_000
        });
      }, /SCHEDULER_OWNER_ID_INVALID/);
      var leaseAfter = x.kho.db.prepare(
        'SELECT owner_id,generation,expires_at_ms FROM scheduler_lease ' +
        "WHERE lease_name='global-writer'"
      ).get();
      assert.deepEqual(leaseAfter, leaseBefore);
    } finally { x.dong(); }
  });
  function thayDoiSauBarrierQuaGate(x, ships) {
    return x.scheduler.runCommand({
      name: 'post-barrier-mutation', accountId: x.target,
      run: function () {
        var state = docState(x.kho, x.target);
        state.planets[0].ships.fighterL = ships;
        return x.world.luu(x.target, state);
      }
    });
  }

  function taoDurableOrderFixture(atS) {
    var x = taoWorldSchedulerTam();
    x.attackerHome = docState(x.kho, x.attacker).planets[0].c;
    x.clock.setS(atS - 60);
    damBaoLeaseFixture(x);
    x.unrelatedAccount = themTaiKhoan(
      x.kho, 'order-third-' + x.file, giayTuClock(x.clock)
    );
    x.kho.trongGiaoDich(function () {
      var mutation = taoMutationTam(x.lease, {value: 50_000}, x.clock.nowMs());
      x.world.trongMutationScheduler(mutation, function () {
        x.world.taoDeQuoc(x.unrelatedAccount, 'Order Third', {mutation: mutation});
      });
    }, {immediate: true});
    x.order = [];
    x.depth = 0;
    x.maxDepth = 0;
    x.appendOnKey = null;
    function saveState(accountId, state) {
      x.kho.trongGiaoDich(function () {
        var mutation = taoMutationTam(x.lease, {value: 50_000}, x.clock.nowMs());
        x.world.trongMutationScheduler(mutation, function () {
          x.world.luu(accountId, state, {mutation: mutation});
        });
      }, {immediate: true});
    }
    [x.attacker, x.target, x.unrelatedAccount].forEach(function (accountId) {
      saveState(accountId, coDinhTimeline(docState(x.kho, accountId), atS - 60));
    });
    x.addFleet = function (accountId, target, mission) {
      var state = coDinhTimeline(docState(x.kho, accountId), atS - 60);
      var fleet = attackTo(state, target);
      fleet.mission = mission;
      fleet.diLuc = atS - 60;
      fleet.den_t = atS;
      if (mission === 'spy') fleet.ships = {probe: 1};
      state.fleets.push(fleet);
      saveState(accountId, state);
      return fleet.id;
    };
    x.addMissile = function (accountId, target) {
      var state = coDinhTimeline(docState(x.kho, accountId), atS - 60);
      var missile = {id: state.fleetIdSeq++, pi: 0, tu: state.planets[0].c,
        den: target, n: 1, diLuc: atS - 60, khi: atS};
      state.tenLua.push(missile);
      saveState(accountId, state);
      return missile.id;
    };
    x.addBuildingAtT = function (accountId) {
      var state = coDinhTimeline(docState(x.kho, accountId), atS - 60);
      state.planets[0].qB.push({id: 'metalMine', n: 1, xong: atS, tg: 0});
      saveState(accountId, state);
      return Number(state.planets[0].b.metalMine || 0);
    };
    x.addLocalBatch = function (accountId, count) {
      var state = datNoiTaiCungGiay(
        coDinhTimeline(docState(x.kho, accountId), atS - 1), atS, count
      );
      saveState(accountId, state);
    };
    x.addLocalTimes = function (accountId, times) {
      var state = coDinhTimeline(docState(x.kho, accountId), times[0] - 1);
      times.forEach(function (when, index) {
        state.planets[0].qB.push({
          id: 'metalMine', n: 1, xong: when, tg: 0, marker: index
        });
      });
      saveState(accountId, state);
    };
    x.addFleetBatch = function (accountId, target, count) {
      var state = coDinhTimeline(docState(x.kho, accountId), atS - 60);
      for (var i = 0; i < count; i += 1) {
        var fleet = attackTo(state, target);
        fleet.mission = 'spy';
        fleet.ships = {probe: 1};
        fleet.diLuc = atS - 60;
        fleet.den_t = atS;
        state.fleets.push(fleet);
      }
      saveState(accountId, state);
    };
    x.installWriter = function (options) {
      options = options || {};
      x.service = new GameAdvanceService({
        kho: x.kho, world: x.world, store: x.store, clock: x.clock
      });
      var accountReducer = new EventReducer({
        kho: x.kho, world: x.world, store: x.store, clock: x.clock,
        advanceService: x.service
      });
      x.accountReducer = accountReducer;
      x.reducer = {
        initializeCombatSeed: function () {},
        applyPrepared: function (mutation, prepared) {
          return prepared.apply ? prepared.apply(mutation) :
            accountReducer.applyPrepared(mutation, prepared);
        },
        prepare: function (mutation, jobRow) {
          if (jobRow.kind === 'ACCOUNT_ADVANCE') {
            return accountReducer.prepare(mutation, jobRow);
          }
          var ref = jobRow.payload.ref;
          return {kind: 'prepared', terminalState: 'CANCELLED',
            cancelReason: 'MATCH_INVALIDATED', application: {
              effectiveAtS: Number(jobRow.scheduled_at_s),
              result: {code: 'MATCH_INVALIDATED'}
            }, apply: function () {
              x.depth += 1;
              x.maxDepth = Math.max(x.maxDepth, x.depth);
              try {
                x.order.push(jobRow.idempotency_key);
                var loaded = x.world.nap(Number(ref.ownerAccountId));
                var list = ref.kind === 'missile' ? loaded.st.tenLua : loaded.st.fleets;
                var id = ref.kind === 'missile' ? ref.missileId : ref.fleetId;
                var index = list.findIndex(function (unit) {
                  return Number(unit.id) === Number(id);
                });
                if (index >= 0) list.splice(index, 1);
                if (x.appendOnKey === jobRow.idempotency_key) {
                  x.appendOnKey = null;
                  var appended = attackTo(loaded.st, x.targetHome);
                  appended.id = loaded.st.fleetIdSeq++;
                  appended.mission = 'spy';
                  appended.ships = {probe: 1};
                  appended.diLuc = atS - 30;
                  appended.den_t = atS;
                  loaded.st.fleets.push(appended);
                }
                x.world.luu(Number(ref.ownerAccountId), loaded.st, {mutation: mutation});
                return {removed: index >= 0};
              } finally { x.depth -= 1; }
            }};
        }
      };
      datModeDurableChiWriterUnit(x);
      x.writer = new SchedulerWriter({
        ownerId: '00000000-0000-4000-8000-000000000081',
        store: x.store, world: x.world, reducer: x.reducer,
        advanceService: x.service, clock: x.clock, logger: silentLogger(),
        pollMs: 1_000, leaseMs: 15_000,
        manualDrain: options.manualDrain === undefined ? true : options.manualDrain,
        timers: options.timers, immediate: options.immediate
      });
      x.clock.setS(atS);
      return x.writer;
    };
    return x;
  }

  async function assertDynamicPlayerHandoff(
    mode, surface, corruptProjection, exerciseBlockedStates, futureSuccessor
  ) {
    var T = 1_800_009_530, x = taoDurableOrderFixture(T), targetKey;
    try {
      var source = coDinhTimeline(docState(x.kho, x.attacker), T - 60);
      var target = coDinhTimeline(docState(x.kho, x.target), T - 60);
      var destination = mode === 'self' ? source.planets[0].c :
        G.toaDo(8, 8, mode === 'npc' ? 8 : 9);
      if (mode !== 'self') {
        var suffix = 0;
        do { source.seed = 'dynamic-player-' + mode + '-' + suffix++; }
        while (G.coNPC(source.seed, destination) !== (mode === 'npc'));
      }
      var fleet = attackTo(source, destination);
      fleet.mission = 'spy'; fleet.ships = {probe: 1};
      fleet.diLuc = T - 60; fleet.den_t = T;
      source.fleets = [fleet]; targetKey = G.tdKey(destination);
      if (futureSuccessor) {
        source.planets[0].qB.push({id: 'metalMine', n: 1, xong: T + 10, tg: 0});
      }
      x.kho.trongGiaoDich(function () {
        var mutation = taoMutationTam(x.lease, {value: 50_000}, x.clock.nowMs());
        x.world.trongMutationScheduler(mutation, function () {
          x.world.luu(x.attacker, source, {mutation: mutation});
        });
      }, {immediate: true});
      assert.equal(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM event_jobs WHERE kind!='ACCOUNT_ADVANCE'"
      ).get().n, 0, 'launch was genuinely local before ownership changed');
      target.planets[0].c = destination;
      if (mode === 'self') source.planets[0].c = G.toaDo(8, 8, 6);
      x.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?')
        .run(JSON.stringify(source), x.attacker);
      x.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?')
        .run(JSON.stringify(target), x.target);
      x.kho.db.prepare('DELETE FROM ht WHERE td=?').run(targetKey);
      if (corruptProjection) {
        x.kho.db.prepare(
          'INSERT INTO ht(td,tk,ten,pi,thuDo) VALUES(?,?,?,?,?)'
        ).run(targetKey, x.attacker, 'Corrupt projection', 0, 0);
      }
      x.installWriter(); await x.writer.start();
      var closureCalls = 0;
      if (surface === 'command') {
        var first = await x.writer.runCommand({
          name: 'dynamic-player-handoff', accountId: x.attacker,
          run: function () { closureCalls += 1; return 'mutated'; }
        });
        assert.deepEqual(first, {deferred: true, code: 'TICK_PARTIAL'});
        assert.equal(closureCalls, 0);
      } else if (surface === 'advance') {
        var publicAdvance = await x.writer.advanceTo(x.attacker, T);
        assert.equal(publicAdvance.hasMoreDue, true);
        assert.equal(publicAdvance.advancedToS, T);
      } else await x.writer.drainNow();
      var globals = x.kho.db.prepare(
        "SELECT * FROM event_jobs WHERE kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE')"
      ).all();
      assert.equal(globals.length, 1, mode + ' persists exactly one exact global');
      assert.equal(JSON.parse(globals[0].payload_json).ref.targetKey, targetKey);
      assert.equal(x.store.getById(globals[0].id).state, 'PENDING');
      var blockedWake = x.kho.db.prepare(
        "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
        "AND blocked_by_job_id=?"
      ).get(String(x.attacker), globals[0].id);
      assert.ok(blockedWake, 'source continuation is durably fenced by exact global');
      assert.equal(blockedWake.state, 'PENDING');
      assert.equal(Number(blockedWake.attempt), 0);
      var beforeTerminal = docState(x.kho, x.attacker).fleets.find(function (candidate) {
        return Number(candidate.id) === Number(fleet.id);
      });
      assert.ok(beforeTerminal);
      assert.equal(beforeTerminal.pha, 'di', 'handoff never dispatches the external effect locally');
      assert.deepEqual(beforeTerminal.ships, {probe: 1});
      assert.equal(x.order.length, 0);
      assert.equal(x.kho.db.prepare(
        'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
      ).get(globals[0].id).n, 0);
      if (exerciseBlockedStates) {
        x.kho.trongGiaoDich(function () {
          var claimed = x.store.claimForResolution(
            x.writer.leaseToken, globals[0].id, x.clock.nowMs(), 15_000,
            {onlyEligible: true, nowS: T}
          );
          var timeout = new Error('dynamic retry'); timeout.code = 'ETIMEDOUT';
          x.store.fail(
            x.writer.leaseToken, claimed, timeout, x.clock.nowMs(), x.writer.retryPolicy()
          );
        }, {immediate: true});
        await x.writer.drainNow();
        assert.equal(x.store.getById(globals[0].id).state, 'RETRY_WAIT');
        assert.equal(x.store.getById(blockedWake.id).blocked_by_job_id, globals[0].id);
        assert.equal(x.store.getById(blockedWake.id).attempt, 0);
        assert.equal(closureCalls, 0);
        var retryAtMs = Number(x.store.getById(globals[0].id).retry_at_ms);
        x.clock.setMs(retryAtMs);
        x.kho.trongGiaoDich(function () {
          var claimed = x.store.claimForResolution(
            x.writer.leaseToken, globals[0].id, x.clock.nowMs(), 15_000,
            {onlyEligible: true, nowS: Math.floor(x.clock.nowMs() / 1000)}
          );
          x.store.fail(
            x.writer.leaseToken, claimed, new Error('dynamic poison'),
            x.clock.nowMs(), x.writer.retryPolicy()
          );
        }, {immediate: true});
        await x.writer.drainNow();
        assert.equal(x.store.getById(globals[0].id).state, 'QUARANTINED');
        assert.equal(x.store.getById(blockedWake.id).blocked_by_job_id, globals[0].id);
        assert.equal(x.store.getById(blockedWake.id).attempt, 0);
        assert.equal(closureCalls, 0);
        x.kho.trongGiaoDich(function () {
          var mutation = x.writer.newMutationContext(
            x.writer.leaseToken, {value: 1}, x.clock.nowMs()
          );
          x.world.trongMutationScheduler(mutation, function () {
            resolveCanonicalGlobalInCurrentUow({
              store: x.store, reducer: x.accountReducer, mutation: mutation,
              leaseToken: x.writer.leaseToken, nowMs: x.clock.nowMs()
            }, globals[0].id, 'OPERATOR_CONFIRMED_INVALID', {
              rootMustBeQuarantined: true
            });
          });
        }, {immediate: true});
      } else await x.writer.drainNow();
      await x.writer.drainNow();
      assert.equal(x.store.getById(globals[0].id).state, 'CANCELLED');
      assert.equal(x.store.getById(blockedWake.id).blocked_by_job_id, null);
      assert.ok(x.order.length <= 1, 'global is applied once; no same-T account spin');
      if (surface === 'command') {
        var second = await x.writer.runCommand({
          name: 'dynamic-player-handoff', accountId: x.attacker,
          run: function () { closureCalls += 1; return 'mutated'; }
        });
        assert.equal(second, 'mutated'); assert.equal(closureCalls, 1);
      }
      if (futureSuccessor) {
        var revision = Number(x.kho.db.prepare('SELECT revision FROM dq WHERE tk=?')
          .get(x.attacker).revision);
        var live = x.kho.db.prepare(
          "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
          "AND state IN ('PENDING','RETRY_WAIT','RUNNING') ORDER BY sequence"
        ).all(String(x.attacker));
        assert.equal(x.store.getById(blockedWake.id).state, 'COMPLETED');
        assert.equal(live.length, 1, 'released no-op continuation emits exactly one successor');
        assert.equal(live[0].state, 'PENDING');
        assert.equal(Number(live[0].scheduled_at_s), T + 10);
        assert.equal(live[0].idempotency_key,
          'account-advance:' + x.attacker + ':' + revision);
        assert.equal(Number(live[0].expected_revision), revision);
        var beforeSecondDrain = Object.assign({}, live[0]);
        await x.writer.drainNow();
        assert.deepEqual(x.store.getById(live[0].id), beforeSecondDrain,
          'future successor remains singular and byte-stable before it is due');
        assert.deepEqual(x.kho.db.prepare('PRAGMA foreign_key_check').all(), []);
      }
    } finally {
      if (x.writer) await x.writer.stop(100);
      x.dong();
    }
  }

  test('dynamic empty NPC and self targets defer commands to one canonical global', async function () {
    var modes = ['empty', 'npc', 'self'];
    for (var index = 0; index < modes.length; index += 1) {
      await assertDynamicPlayerHandoff(modes[index], 'command', index === 1);
    }
  });

  test('ordinary drain checkpoints every dynamically external target before global resume', async function () {
    for (var mode of ['empty', 'npc', 'self']) {
      await assertDynamicPlayerHandoff(mode, 'drain', mode === 'self');
    }
  });

  test('public advanceTo persists the same restart-safe dynamic dependency', async function () {
    for (var mode of ['empty', 'npc', 'self']) {
      await assertDynamicPlayerHandoff(mode, 'advance', mode === 'npc');
    }
  });

  test('retry and quarantine never release or spin the handed source continuation', async function () {
    await assertDynamicPlayerHandoff('empty', 'command', true, true);
  });

  test('global release resumes a no-op source wake and preserves its one future successor', async function () {
    await assertDynamicPlayerHandoff('empty', 'drain', false, false, true);
  });

  function globalTupleKeys(x) {
    return x.kho.db.prepare(
      "SELECT idempotency_key FROM event_jobs WHERE kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
      'ORDER BY scheduled_at_s,priority,sequence,id'
    ).all().map(function (row) { return row.idempotency_key; });
  }

  test('real Writer settles reciprocal same-T attacks once without recursive resolution', async function () {
    var T = 1_800_010_010, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.attacker, x.targetHome, 'attack');
      x.addFleet(x.target, x.attackerHome, 'attack');
      var expected = globalTupleKeys(x);
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.deepEqual(x.order, expected);
      assert.equal(x.writer.metrics.advanceProcessed, 2,
        'normal drain counts each committed global primitive once');
      assert.equal(x.maxDepth, 1);
      assert.equal(new Set(x.order).size, 2);
      assert.deepEqual(x.kho.db.prepare(
        "SELECT state FROM event_jobs WHERE kind='PVP_RESOLVE' ORDER BY sequence"
      ).all().map(function (row) { return row.state; }), ['CANCELLED', 'CANCELLED']);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('established zero reaches account service: pure completion or durable partial', async function () {
    for (var due of [false, true]) {
      var T = 1_800_010_011, x = taoDurableOrderFixture(T);
      try {
        x.addLocalBatch(x.attacker, 49_999);
        x.addFleet(x.attacker, x.targetHome, 'spy');
        if (due) x.addLocalTimes(x.unrelatedAccount, [T]);
        x.installWriter(); await x.writer.start();
        var closureCalls = 0;
        var beforeMetric = x.writer.metrics.advanceBudgetExhaustedTotal;
        var result = await x.writer.runCommand({
          name: 'established-zero-account', accountId: x.unrelatedAccount,
          run: function () { closureCalls += 1; return 'complete'; }
        });
        if (!due) {
          assert.equal(result, 'complete'); assert.equal(closureCalls, 1);
          assert.equal(docState(x.kho, x.unrelatedAccount).lastTick, T);
          assert.equal(x.writer.metrics.advanceBudgetExhaustedTotal, beforeMetric);
        } else {
          assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'});
          assert.equal(closureCalls, 0);
          assert.equal(x.writer.metrics.advanceBudgetExhaustedTotal, beforeMetric + 1);
          var wake = x.kho.db.prepare(
            "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
            "AND state='RUNNING'"
          ).get(String(x.unrelatedAccount));
          assert.ok(wake); assert.equal(Number(wake.locked_generation), x.writer.leaseToken.generation);
        }
      } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
    }
  });

  test('public advanceTo aggregates two barriers into exactly five requested-account fields', async function () {
    var T = 1_800_010_012, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.attacker, x.targetHome, 'spy');
      x.addFleet(x.target, x.attackerHome, 'spy');
      x.installWriter();
      x.scheduler = taoScheduler({
        writer: x.writer, store: x.store, world: x.world,
        advanceService: x.service, reducer: x.reducer, clock: x.clock,
        logger: silentLogger(), schedulerOptions: schedulerOptionsCoSo()
      });
      await x.scheduler.start();
      var result = await x.scheduler.advanceTo(x.unrelatedAccount, T);
      assert.deepEqual(result, {
        processed: 2, advancedToS: T, nextDueAtS: null,
        hasMoreDue: false, budgetExhausted: false
      });
      assert.deepEqual(Object.keys(result).sort(), [
        'advancedToS', 'budgetExhausted', 'hasMoreDue', 'nextDueAtS', 'processed'
      ]);
      assert.equal(docState(x.kho, x.unrelatedAccount).lastTick, T);
      assert.equal(x.writer.metrics.advanceProcessed, 2,
        'public admission counts two barriers once and no-work account zero');
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('runCommand and advanceTo count committed local primitives exactly once', async function () {
    for (var surface of ['command', 'advance']) {
      var T = 1_800_010_013, x = taoDurableOrderFixture(T);
      try {
        x.addLocalTimes(x.unrelatedAccount, [T]);
        x.installWriter(); await x.writer.start();
        var before = x.writer.metrics.advanceProcessed;
        if (surface === 'command') {
          assert.equal(await x.writer.runCommand({
            name: 'metric-local-command', accountId: x.unrelatedAccount,
            run: function () { return 'ok'; }
          }), 'ok');
        } else await x.writer.advanceTo(x.unrelatedAccount, T);
        assert.equal(x.writer.metrics.advanceProcessed - before, 1, surface);
      } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
    }
  });

  test('Writer ledger retains primitives consumed before parking behind a preceding root', async function () {
    var T = 1_800_010_013, x = taoDurableOrderFixture(T);
    try {
      x.addMissile(x.attacker, x.targetHome); // priority 51: row under test
      x.addFleet(x.target, x.attackerHome, 'spy'); // priority 50: preceding root
      x.installWriter(); await x.writer.start();
      var roots = x.store.listBarrierJobsAtOrBefore(
        x.writer.leaseToken, T, x.clock.nowMs()
      );
      var preceding = roots.find(function (row) { return Number(row.priority) === 50; });
      var current = roots.find(function (row) { return Number(row.priority) === 51; });
      var claimed = x.kho.trongGiaoDich(function () {
        return x.store.claimForResolution(
          x.writer.leaseToken, current.id, x.clock.nowMs(), 15_000,
          {onlyEligible: true, nowS: T}
        );
      }, {immediate: true});
      var original = x.service.advanceBarrier;
      x.service.advanceBarrier = function (mutation) {
        mutation.remainingBudget.value -= 3;
        return {processed: 3, advancedToS: T, nextDueAtS: T,
          hasMoreDue: true, budgetExhausted: false,
          precedingJobId: preceding.id};
      };
      var before = x.writer.metrics.advanceProcessed;
      var outcome;
      try {
        outcome = x.writer.applyClaimed(claimed, {value: 50_000}, x.clock.nowMs());
      } finally { x.service.advanceBarrier = original; }
      x.writer.flushCommittedMetricLedger(outcome.metricLedger);
      assert.equal(outcome.reordered, true);
      assert.equal(x.writer.metrics.advanceProcessed - before, 3);
      assert.equal(x.store.getById(current.id).state, 'PENDING');
      assert.equal(x.writer.metrics.jobAttempts['EXTERNAL_RESOLVE|partial'], 1);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('commit-scoped metric ledger sums primary and secondary and discards rollback', async function () {
    var x = taoSecondaryPartialFixture('mail', 1, 1);
    try {
      await x.writer.start();
      var beforeProcessed = x.writer.metrics.advanceProcessed;
      var beforeAttempts = JSON.parse(JSON.stringify(x.writer.metrics.jobAttempts));
      await assert.rejects(x.writer.runCommand({
        name: 'metric-ledger-rollback', accountId: x.attacker,
        run: function () {
          secondaryAction(x, 'mail');
          throw new Error('INJECTED_COMMAND_ROLLBACK');
        }
      }), /INJECTED_COMMAND_ROLLBACK/);
      assert.equal(x.writer.metrics.advanceProcessed, beforeProcessed);
      assert.deepEqual(x.writer.metrics.jobAttempts, beforeAttempts);
      assert.equal(secondaryEffectCount(x, 'mail'), 0);
      await x.writer.runCommand({
        name: 'metric-ledger-commit', accountId: x.attacker,
        run: function () { return secondaryAction(x, 'mail'); }
      });
      assert.equal(x.writer.metrics.advanceProcessed - beforeProcessed, 2,
        'one primary plus one secondary primitive, with no aggregate double count');
      var accountAttempts = Object.keys(x.writer.metrics.jobAttempts)
        .filter(function (key) { return key.indexOf('ACCOUNT_ADVANCE|') === 0; })
        .reduce(function (sum, key) { return sum + x.writer.metrics.jobAttempts[key]; }, 0);
      assert.equal(accountAttempts, 2);
      assert.equal(secondaryEffectCount(x, 'mail'), 1);
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('real Writer uses priority before insertion for same-T fleet and missile', async function () {
    var T = 1_800_010_011, x = taoDurableOrderFixture(T);
    try {
      x.addMissile(x.attacker, x.targetHome);
      x.addFleet(x.attacker, x.targetHome, 'spy');
      var expected = globalTupleKeys(x);
      assert.match(expected[0], /^external:fleet:spy:/);
      assert.match(expected[1], /^external:missile:missile:/);
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.deepEqual(x.order, expected);
      assert.equal(x.maxDepth, 1);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('real Writer preserves same-kind cross-account insertion sequence', async function () {
    var T = 1_800_010_012, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.target, x.attackerHome, 'spy');
      x.addFleet(x.attacker, x.targetHome, 'spy');
      var expected = globalTupleKeys(x);
      var tupleRows = x.kho.db.prepare(
        "SELECT source_account_id,sequence FROM event_jobs WHERE kind='EXTERNAL_RESOLVE' " +
        'ORDER BY scheduled_at_s,priority,sequence,id'
      ).all();
      assert.equal(Number(tupleRows[0].source_account_id), x.target);
      assert.equal(Number(tupleRows[1].source_account_id), x.attacker);
      assert.ok(Number(tupleRows[0].sequence) < Number(tupleRows[1].sequence));
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.deepEqual(x.order, expected);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('same-owner same-T fleets use persisted sequence while solo keeps reverse-array order', async function () {
    var T = 1_800_010_012, x = taoDurableOrderFixture(T);
    try {
      var firstId = x.addFleet(x.attacker, x.targetHome, 'spy');
      var secondId = x.addFleet(x.attacker, x.targetHome, 'spy');
      var rows = x.kho.db.prepare(
        "SELECT payload_json FROM event_jobs WHERE kind='EXTERNAL_RESOLVE' " +
        'ORDER BY scheduled_at_s,priority,sequence,id'
      ).all().map(function (row) { return JSON.parse(row.payload_json).ref.fleetId; });
      assert.deepEqual(rows, [firstId, secondId]);
      var solo = docState(x.kho, x.attacker);
      var oldArrival = G.hamToiDich;
      var arrivals = [];
      try {
        G.hamToiDich = function (state, fleet) {
          arrivals.push(fleet.id);
          G.xoaHam(state, fleet);
        };
        G.tick(solo, T, {ownerAccountId: x.attacker, remainingBudget: {value: 50_000}});
      } finally { G.hamToiDich = oldArrival; }
      assert.deepEqual(arrivals, [secondId, firstId]);
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.deepEqual(x.order, globalTupleKeys(x));
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('real Writer re-queries a reducer-created same-T fleet before a missile', async function () {
    var T = 1_800_010_013, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.attacker, x.targetHome, 'spy');
      x.addMissile(x.attacker, x.targetHome);
      var initial = globalTupleKeys(x);
      x.appendOnKey = initial[0];
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(x.order.length, 3);
      assert.equal(x.order[0], initial[0]);
      assert.match(x.order[1], /^external:fleet:spy:/);
      assert.equal(x.order[2], initial[1]);
      assert.equal(x.maxDepth, 1);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('real Writer completes a local T primitive before the external reducer snapshot', async function () {
    var T = 1_800_010_014, x = taoDurableOrderFixture(T), observed;
    try {
      var before = x.addBuildingAtT(x.attacker);
      x.addFleet(x.attacker, x.targetHome, 'spy');
      x.installWriter();
      var prepare = x.reducer.prepare;
      x.reducer.prepare = function () {
        observed = Number(x.world.nap(x.attacker).st.planets[0].b.metalMine || 0);
        return prepare.apply(this, arguments);
      };
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(observed, before + 1);
      assert.equal(docState(x.kho, x.attacker).lastTick, T);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('same-T eligible RETRY_WAIT remains before the later PENDING global tuple', async function () {
    var T = 1_800_010_015, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.attacker, x.targetHome, 'spy');
      x.addFleet(x.attacker, x.targetHome, 'spy');
      var expected = globalTupleKeys(x);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=?,attempt=1 " +
        'WHERE idempotency_key=?'
      ).run(T * 1000, expected[0]);
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.deepEqual(x.order, expected);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('blocked global root still advances account work only through its watermark', async function () {
    var T = 1_800_010_015, x = taoDurableOrderFixture(T);
    try {
      x.addFleetBatch(x.attacker, x.targetHome, 2);
      x.addLocalTimes(x.unrelatedAccount, [T - 1, T, T + 1]);
      var keys = globalTupleKeys(x);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE idempotency_key=?"
      ).run((T + 60) * 1000, keys[0]);
      var before = Number(docState(x.kho, x.unrelatedAccount)
        .planets[0].b.metalMine || 0);
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      var after = docState(x.kho, x.unrelatedAccount);
      assert.equal(Number(after.planets[0].b.metalMine || 0), before + 2);
      assert.equal(after.lastTick, T);
      assert.equal(after.planets[0].qB.length, 1);
      assert.equal(after.planets[0].qB[0].xong, T + 1);
      assert.equal(x.store.getByIdempotencyKey(keys[0]).state, 'RETRY_WAIT');
      assert.equal(x.store.getByIdempotencyKey(keys[1]).state, 'PENDING');
      assert.deepEqual(x.order, []);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('foreign RUNNING first global tuple blocks generic account work', async function () {
    var T = 1_800_010_016, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.attacker, x.targetHome, 'spy');
      x.addLocalTimes(x.target, [T]);
      var key = globalTupleKeys(x)[0];
      x.installWriter();
      await x.writer.start();
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RUNNING',locked_by=?,locked_generation=999," +
        'locked_until_ms=? WHERE idempotency_key=?'
      ).run('00000000-0000-4000-8000-000000000099', (T + 60) * 1000, key);
      var localBefore = docState(x.kho, x.target);
      var buildingBefore = Number(localBefore.planets[0].b.metalMine || 0);
      await x.writer.drainNow();
      assert.equal(x.order.length, 0);
      assert.equal(x.store.getByIdempotencyKey(key).state, 'RUNNING');
      var localAfter = docState(x.kho, x.target);
      assert.equal(localAfter.lastTick, localBefore.lastTick);
      assert.equal(Number(localAfter.planets[0].b.metalMine || 0), buildingBefore);
      assert.equal(localAfter.planets[0].qB.length, 1);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('QUARANTINED root permits only due account work through its watermark', async function () {
    var T = 1_800_010_016, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.attacker, x.targetHome, 'spy');
      x.addLocalTimes(x.unrelatedAccount, [T - 1, T, T + 1]);
      var key = globalTupleKeys(x)[0];
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
        "error_code='PAYLOAD_INTEGRITY' WHERE idempotency_key=?"
      ).run(T * 1000, key);
      var before = Number(docState(x.kho, x.unrelatedAccount)
        .planets[0].b.metalMine || 0);
      x.installWriter(); await x.writer.start(); await x.writer.drainNow();
      var after = docState(x.kho, x.unrelatedAccount);
      assert.equal(Number(after.planets[0].b.metalMine || 0), before + 2);
      assert.equal(after.lastTick, T);
      assert.equal(after.planets[0].qB.length, 1);
      assert.equal(after.planets[0].qB[0].xong, T + 1);
      assert.equal(x.store.getByIdempotencyKey(key).state, 'QUARANTINED');
      assert.equal(x.store.globalWatermarkS(), T);
      assert.deepEqual(x.order, []);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('after-claim crash leaves the committed global RUNNING at attempt zero', async function () {
    var T = 1_800_010_017, x = taoDurableOrderFixture(T);
    try {
      x.addFleet(x.attacker, x.targetHome, 'spy');
      var key = globalTupleKeys(x)[0];
      x.installWriter();
      x.writer.setFaultHook(function (stage) {
        if (stage !== 'after-claim') return;
        var error = new Error('INJECTED_CRASH');
        error.code = 'INJECTED_CRASH';
        throw error;
      });
      await x.writer.start();
      await assert.rejects(x.writer.drainNow(), /INJECTED_CRASH/);
      var running = x.store.getByIdempotencyKey(key);
      assert.equal(running.state, 'RUNNING');
      assert.equal(running.attempt, 0);
      assert.equal(x.order.length, 0);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('49,999 locals plus one global consume the exact shared 50,000 budget', async function () {
    var T = 1_800_010_018, x = taoDurableOrderFixture(T);
    try {
      x.addLocalBatch(x.attacker, 49_999);
      x.addFleet(x.attacker, x.targetHome, 'spy');
      var key = globalTupleKeys(x)[0];
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(key).state, 'CANCELLED');
      assert.equal(x.kho.db.prepare(
        'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
      ).get(key).n, 1);
      assert.equal(x.order.length, 1);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('50,000 locals leave the global RUNNING for batch two without an effect', async function () {
    var T = 1_800_010_019, x = taoDurableOrderFixture(T);
    try {
      x.addLocalBatch(x.attacker, 50_000);
      x.addFleet(x.attacker, x.targetHome, 'spy');
      var key = globalTupleKeys(x)[0];
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(key).state, 'RUNNING');
      assert.equal(x.order.length, 0);
      assert.equal(x.kho.db.prepare(
        'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
      ).get(key).n, 0);
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(key).state, 'CANCELLED');
      assert.equal(x.order.length, 1);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  test('many same-T globals each charge once and retain flat resolver depth', async function () {
    var T = 1_800_010_020, x = taoDurableOrderFixture(T);
    try {
      x.addFleetBatch(x.attacker, x.targetHome, 51);
      var expected = globalTupleKeys(x);
      x.installWriter();
      await x.writer.start();
      await x.writer.drainNow();
      assert.deepEqual(x.order, expected);
      assert.equal(x.maxDepth, 1);
      assert.equal(x.kho.db.prepare(
        'SELECT COUNT(*) AS n FROM event_applications'
      ).get().n, 51);
    } finally { if (x.writer) await x.writer.stop(100); x.dong(); }
  });

  function taoImmediateGia() {
    var callback = null, setCount = 0;
    return {
      set: function (fn) {
        assert.equal(callback, null, 'only one continuation may be armed');
        callback = fn;
        setCount += 1;
        return setCount;
      },
      clear: function () { callback = null; },
      pending: function () { return callback !== null; },
      count: function () { return setCount; },
      run: async function () {
        var fn = callback;
        assert.equal(typeof fn, 'function');
        callback = null;
        await fn();
      }
    };
  }

  test('exact-zero completion arms one macrotask for the next global', async function () {
    var T = 1_800_010_021, x = taoDurableOrderFixture(T);
    var immediate = taoImmediateGia();
    try {
      x.addLocalBatch(x.attacker, 49_999);
      x.addFleetBatch(x.attacker, x.targetHome, 2);
      var keys = globalTupleKeys(x);
      x.installWriter({manualDrain: false, immediate: immediate,
        timers: taoBoHenGia(x.clock)});
      await x.writer.start();
      await x.writer.drainNow();
      assert.deepEqual(x.order, keys.slice(0, 1));
      assert.equal(x.store.getByIdempotencyKey(keys[1]).state, 'PENDING');
      assert.equal(immediate.pending(), true);
      assert.equal(immediate.count(), 1);
      await immediate.run();
      assert.deepEqual(x.order, keys);
    } finally {
      if (x.writer) await x.writer.stop(100);
      x.dong();
    }
  });

  test('exact-zero global completion also wakes a due account continuation', async function () {
    var T = 1_800_010_022, x = taoDurableOrderFixture(T);
    var immediate = taoImmediateGia();
    try {
      x.addLocalBatch(x.attacker, 49_999);
      x.addFleet(x.attacker, x.targetHome, 'spy');
      x.addLocalBatch(x.unrelatedAccount, 1);
      var globalKey = globalTupleKeys(x)[0];
      x.installWriter({manualDrain: false, immediate: immediate,
        timers: taoBoHenGia(x.clock)});
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(globalKey).state, 'CANCELLED');
      assert.equal(immediate.pending(), true);
      assert.equal(immediate.count(), 1);
      await immediate.run();
      assert.equal(docState(x.kho, x.unrelatedAccount).lastTick, T);
    } finally {
      if (x.writer) await x.writer.stop(100);
      x.dong();
    }
  });
  function taoWriterKhac(x, ownerId, options) {
    options = options || {};
    return new SchedulerWriter({
      ownerId: ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service,
      clock: x.clock, logger: silentLogger(), pollMs: 1_000, leaseMs: 15_000,
      retryBaseMs: 1_000, retryMaxMs: 300_000, maxAttempts: 8,
      reconcileIntervalMs: 300_000,
      manualDrain: options.manualDrain !== undefined ? options.manualDrain : true,
      timers: options.timers
    });
  }

  function taoPartialWriterFixture(options) {
    options = options || {};
    var x = taoWorldSchedulerTam();
    var T = giayTuClock(x.clock) + 1;
    var state = coDinhTimeline(docState(x.kho, x.attacker), T - 1);
    state = datNoiTaiCungGiay(state, T, 50_001);
    luuQuaMutation(x, x.attacker, state);
    x.accountJob = x.store.getByIdempotencyKey(
      x.kho.db.prepare(
        "SELECT idempotency_key FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
        'ORDER BY sequence DESC LIMIT 1'
      ).get().idempotency_key
    );
    if (options.withoutInitialWake) {
      x.kho.trongGiaoDich(function () {
        x.kho.db.prepare('DELETE FROM event_jobs WHERE id=?').run(x.accountJob.id);
      }, { immediate: true });
      x.accountJob = null;
    }
    x.service = new GameAdvanceService({
      kho: x.kho,
      world: x.world,
      store: x.store,
      clock: x.clock
    });
    x.reducer = new EventReducer({
      kho: x.kho,
      world: x.world,
      store: x.store,
      clock: x.clock,
      advanceService: x.service
    });
    datModeDurableChiWriterUnit(x);
    x.ownerId = '00000000-0000-4000-8000-000000000035';
    x.writer = new SchedulerWriter({
      ownerId: x.ownerId,
      store: x.store,
      world: x.world,
      reducer: x.reducer,
      advanceService: x.service,
      clock: x.clock,
      logger: silentLogger(),
      pollMs: 1_000,
      leaseMs: 15_000,
      retryBaseMs: 1_000,
      retryMaxMs: 300_000,
      maxAttempts: 8,
      manualDrain: true
    });
    x.scheduler = taoScheduler({
      writer: x.writer,
      store: x.store,
      world: x.world,
      advanceService: x.service,
      reducer: x.reducer,
      clock: x.clock,
      logger: silentLogger(),
      schedulerOptions: schedulerOptionsCoSo()
    });
    x.clock.setS(T);
    return x;
  }

  test('only one direct writer owns the lease and a released holder permits a new generation', async function () {
    var x = taoWriterFixture(), second = taoWriterKhac(x, '00000000-0000-4000-8000-000000000029');
    try {
      await x.writer.start();
      var firstGeneration = x.kho.db.prepare(
        "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().generation;
      await second.start();
      assert.equal(second.status().ready, false);
      assert.equal(second.status().reason, 'SCHEDULER_LEASE_UNHELD');
      await x.writer.stop(100);
      await second.start();
      assert.equal(second.status().ready, true);
      var takeoverGeneration = x.kho.db.prepare(
        "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().generation;
      assert.ok(takeoverGeneration > firstGeneration);
    } finally {
      await x.writer.stop(100);
      await second.stop(100);
      x.dong();
    }
  });

  test('manualDrain starts with no timer and mutates a due job only on explicit drainNow', async function () {
    var x = taoWriterFixture({ manualDrain: true });
    try {
      // Acquire the writer lease at the due instant; moving the fake wall
      // clock 120 seconds after start would make a 15-second lease stale.
      x.clock.setS(x.pvpJob.scheduled_at_s);
      await x.writer.start();
      assert.equal(x.writer.status().wakeTimerActive, false);
      assert.equal(x.writer.status().heartbeatTimerActive, false);
      assert.equal(x.writer.status().writerLeaseHeld, true);
      assert.equal(x.writer.status().leaseHeld, true);
      assert.equal(x.writer.status().watermarkS, x.pvpJob.scheduled_at_s);
      assert.equal(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'PENDING');
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'COMPLETED');
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('committed schedule replaces a later wake with an earlier eligible wake', async function () {
    var x = taoWriterFixture({manualDrain: false}), timers = taoBoHenGia(x.clock);
    try {
      x.writer.timers = timers;
      x.kho.db.prepare('DELETE FROM event_applications').run();
      x.kho.db.prepare('DELETE FROM event_jobs').run();
      await x.writer.start();
      var nowS = Math.floor(x.clock.nowMs() / 1000);
      function wake(key, accountId, atS) {
        var revision = Number(x.kho.q.dqGet.get(accountId).revision);
        return job(key, atS, 100, {
          aggregateId: String(accountId), expectedRevision: revision,
          payload: {schemaVersion: 1, accountId: accountId}
        });
      }
      var lateWake = wake('wake-late', x.unrelatedAccount, nowS + 10);
      var earlyWake = wake('wake-early', x.attacker, nowS + 2);
      await x.writer.schedule(lateWake);
      var late = timers.dangCho().filter(function (handle) {
        return handle.dueAtMs === (nowS + 10) * 1000;
      });
      assert.equal(late.length, 1);
      await x.writer.schedule(earlyWake);
      var pending = timers.dangCho();
      assert.equal(pending.some(function (handle) {
        return handle.id === late[0].id;
      }), false, 'the superseded later wake is cancelled');
      assert.equal(pending.filter(function (handle) {
        return handle.dueAtMs === (nowS + 2) * 1000;
      }).length, 1);
      x.clock.setS(nowS + 2); await timers.chayDenHienTai();
      assert.equal(x.store.getByIdempotencyKey(earlyWake.idempotencyKey).state, 'COMPLETED');
      assert.equal(x.store.getByIdempotencyKey(lateWake.idempotencyKey).state, 'PENDING');
      assert.equal(timers.dangCho().filter(function (handle) {
        return handle.dueAtMs === (nowS + 10) * 1000;
      }).length, 1, 'successful drain re-arms the remaining later DB wake');
    } finally { await x.writer.stop(100); x.dong(); }
  });
  test('test-only fatal crash clears mutation timers without releasing its live lease', async function () {
    var x = taoWriterFixture({ manualDrain: false });
    var timers = taoBoHenGia(x.clock);
    x.writer.timers = timers;
    try {
      await x.writer.start();
      var before = x.kho.db.prepare(
        "SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get();
      x.writer.simulateFatalCrashForTest();
      var after = x.kho.db.prepare(
        "SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get();
      assert.deepEqual(after, before);
      assert.equal(x.writer.status().wakeTimerActive, false);
      assert.equal(x.writer.status().heartbeatTimerActive, false);
      assert.equal(x.writer.status().reconcileTimerActive, false);
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('fatal and crashed writers are terminal and start cannot resurrect timers or a lease', async function () {
    for (var mode of ['crashed', 'fatal']) {
      var x = taoWriterFixture({manualDrain: false});
      try {
        await x.writer.start();
        var before = x.kho.db.prepare(
          "SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'"
        ).get();
        if (mode === 'crashed') x.writer.simulateFatalCrashForTest();
        else x.writer.transitionStorageFatal(Object.assign(new Error('disk'), {errcode: 13}));
        await assert.rejects(x.writer.start(), new RegExp(
          mode === 'crashed' ? 'SCHEDULER_CRASHED' : 'SCHEDULER_STORAGE_FATAL'
        ));
        assert.deepEqual(x.kho.db.prepare(
          "SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'"
        ).get(), before);
        assert.equal(x.writer.wakeTimer, null);
        assert.equal(x.writer.heartbeatTimer, null);
        assert.equal(x.writer.reconcileTimer, null);
      } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
    }
  });

  test('one transient heartbeat error rearms below lease third and the next renewal succeeds', async function () {
    var x = taoWriterFixture({manualDrain: false}), timers = taoBoHenGia(x.clock);
    x.writer.timers = timers;
    try {
      await x.writer.start();
      var realRenew = x.store.renewLease.bind(x.store), calls = 0;
      x.store.renewLease = function () {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error('native busy'), {
          code: 'ERR_SQLITE_ERROR', errcode: 5
        });
        return realRenew.apply(null, arguments);
      };
      x.clock.advanceMs(x.writer.heartbeatDelayMs);
      await timers.chayDenHienTai();
      assert.ok(x.writer.heartbeatTimer, 'transient error arms one bounded retry');
      x.clock.advanceMs(x.writer.heartbeatDelayMs);
      await timers.chayDenHienTai();
      assert.ok(calls >= 2);
      assert.equal(x.writer.status().ready, true);
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('partial RUNNING job checkpoints its own revision and completes event 50,001 in batch two', async function () {
    var x = taoPartialWriterFixture();
    try {
      var originalId = x.accountJob.id;
      var originalRevision = Number(x.accountJob.expected_revision);
      await x.writer.start();
      await x.writer.drainNow();
      var partial = x.store.getByIdempotencyKey(x.accountJob.idempotency_key);
      assert.equal(partial.id, originalId);
      assert.equal(partial.state, 'RUNNING');
      assert.equal(Number(partial.checkpoint_revision), originalRevision + 1);
      assert.equal(Number(partial.checkpoint_revision), Number(x.kho.q.dqGet.get(x.attacker).revision));
      assert.equal(docState(x.kho, x.attacker).lastTick, giayTuClock(x.clock));
      var liveAfterBatchOne = x.kho.db.prepare(
        "SELECT id,state FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
        "AND state IN ('PENDING','RETRY_WAIT','RUNNING') ORDER BY sequence"
      ).all(String(x.attacker));
      assert.deepEqual(liveAfterBatchOne, [{ id: originalId, state: 'RUNNING' }]);
      await x.writer.drainNow();
      var completed = x.store.getByIdempotencyKey(x.accountJob.idempotency_key);
      assert.equal(completed.id, originalId);
      assert.equal(completed.state, 'COMPLETED');
      assert.equal(Number(x.kho.q.dqGet.get(x.attacker).revision), originalRevision + 2);
      assert.ok(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
        "AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
      ).get(String(x.attacker)).n <= 1, 'terminal path may create at most one new local wake');
      assert.equal(G.phanLoaiSuKienKe(docState(x.kho, x.attacker), x.attacker).atS > giayTuClock(x.clock), true);
    } finally { await x.writer.stop(100); x.dong(); }
  });
  test('MutationGate defers an account command at primitive 50,001 without running its closure', async function () {
    var x = taoPartialWriterFixture(), ran = false;
    try {
      await x.writer.start();
      var deferred = await x.scheduler.runCommand({
        name: 'account-budget-proof', accountId: x.attacker,
        run: function () { ran = true; return 'ran'; }
      });
      assert.deepEqual(deferred, { deferred: true, code: 'TICK_PARTIAL' });
      assert.equal(ran, false);
      var adopted = x.store.getById(x.accountJob.id);
      assert.equal(adopted.state, 'RUNNING');
      assert.equal(Number(adopted.checkpoint_revision), Number(x.kho.q.dqGet.get(x.attacker).revision));
      assert.equal(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
        "AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
      ).get(String(x.attacker)).n, 1, 'command adopted, rather than orphaned, the canonical wake');
      await x.writer.drainNow();
      assert.equal(await x.scheduler.runCommand({
        name: 'account-budget-proof', accountId: x.attacker,
        run: function () { ran = true; return 'ran'; }
      }), 'ran');
      assert.equal(ran, true);
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('MutationGate adopts the successor made by a direct partial advance before it returns', async function () {
    var x = taoPartialWriterFixture({ withoutInitialWake: true }), ran = false;
    try {
      await x.writer.start();
      var deferred = await x.scheduler.runCommand({
        name: 'new-wake-budget-proof', accountId: x.attacker,
        run: function () { ran = true; }
      });
      assert.deepEqual(deferred, { deferred: true, code: 'TICK_PARTIAL' });
      assert.equal(ran, false);
      var live = x.kho.db.prepare(
        "SELECT id,state,checkpoint_revision FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
        "AND aggregate_id=? AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
      ).all(String(x.attacker));
      assert.equal(live.length, 1);
      assert.equal(live[0].state, 'RUNNING');
      assert.ok(Number.isSafeInteger(Number(live[0].checkpoint_revision)) || live[0].checkpoint_revision === null);
      await x.writer.drainNow();
      assert.equal(await x.scheduler.runCommand({
        name: 'new-wake-budget-proof', accountId: x.attacker,
        run: function () { ran = true; }
      }), undefined);
      assert.equal(ran, true);
    } finally { await x.writer.stop(100); x.dong(); }
  });

  function taoSecondaryPartialFixture(kind, sourceCount, targetCount) {
    var x = taoWorldSchedulerTam();
    var T = giayTuClock(x.clock) + 1;
    var source = datNoiTaiCungGiay(
      coDinhTimeline(docState(x.kho, x.attacker), T - 1), T, sourceCount
    );
    var target = datNoiTaiCungGiay(
      coDinhTimeline(docState(x.kho, x.target), T - 1), T, targetCount
    );
    if (kind === 'galana') {
      var alliance = 'PartialAlliance' + T;
      source.lm = {ten: alliance};
      target.lm = {ten: alliance};
      source.galana = 100;
      // Keep exact transfer assertions focused on the secondary effect, not passive tax accrual.
      target.planets.forEach(function (planet) {
        planet.danSu = planet.danSu || G.danSuMacDinh();
        planet.danSu.supportBp = 0;
      });
      x.kho.q.lmThem.run(alliance, 'PA', x.attacker, T - 100, null);
    }
    luuQuaMutation(x, x.attacker, source);
    luuQuaMutation(x, x.target, target);
    x.sourceWake = x.kho.db.prepare(
      "SELECT id FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
      'ORDER BY sequence DESC LIMIT 1'
    ).get(String(x.attacker));
    x.targetWake = x.kho.db.prepare(
      "SELECT id FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
      'ORDER BY sequence DESC LIMIT 1'
    ).get(String(x.target));
    x.service = new GameAdvanceService({
      kho: x.kho, world: x.world, store: x.store, clock: x.clock
    });
    x.reducer = new EventReducer({
      kho: x.kho, world: x.world, store: x.store, clock: x.clock,
      advanceService: x.service
    });
    datModeDurableChiWriterUnit(x);
    x.writer = new SchedulerWriter({
      ownerId: '00000000-0000-4000-8000-000000000082',
      store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
    x.scheduler = taoScheduler({
      writer: x.writer, store: x.store, world: x.world,
      advanceService: x.service, reducer: x.reducer, clock: x.clock,
      logger: silentLogger(), schedulerOptions: schedulerOptionsCoSo()
    });
    x.clock.setS(T);
    x.T = T;
    return x;
  }

  function secondaryAction(x, kind) {
    if (kind === 'mail') {
      return x.world.guiThu(x.attacker, 'Attacker', String(x.target), 'hello-once');
    }
    if (kind === 'war') return x.world.tuyenChien(x.attacker, x.target);
    return x.world.chuyenGalana(x.attacker, x.target, 7);
  }

  function secondaryEffectCount(x, kind) {
    if (kind === 'mail') {
      return docState(x.kho, x.target).msgs.filter(function (message) {
        return message.td === 'Thư từ Attacker' && message.nd === 'hello-once';
      }).length;
    }
    if (kind === 'war') {
      return x.kho.db.prepare(
        'SELECT COUNT(*) AS n FROM chien WHERE tkA=? AND tkD=?'
      ).get(x.attacker, x.target).n;
    }
    return Number(docState(x.kho, x.target).galana || 0);
  }

  for (let secondaryKind of ['mail', 'war', 'galana']) {
    test(secondaryKind + ' secondary partial commits checkpoint before one domain effect',
      async function () {
        var kind = secondaryKind;
        var x = taoSecondaryPartialFixture(kind, 1, 50_001);
        var before = secondaryEffectCount(x, kind);
        try {
          await x.writer.start();
          var first = await x.scheduler.runCommand({
            name: 'secondary-' + kind, accountId: x.attacker,
            run: function () { return secondaryAction(x, kind); }
          });
          assert.deepEqual(first, {deferred: true, code: 'TICK_PARTIAL'});
          assert.equal(secondaryEffectCount(x, kind), before);
          assert.equal(x.store.getById(x.sourceWake.id).state, 'COMPLETED');
          assert.equal(x.store.getById(x.targetWake.id).state, 'RUNNING');
          await x.writer.drainNow();
          await x.scheduler.runCommand({
            name: 'secondary-' + kind, accountId: x.attacker,
            run: function () { return secondaryAction(x, kind); }
          });
          assert.equal(secondaryEffectCount(x, kind),
            kind === 'galana' ? before + 7 : before + 1);
        } finally { await x.writer.stop(100); x.dong(); }
      });
  }

  test('zero-progress secondary adopts its wake after primary spends exactly 50,000', async function () {
    var x = taoSecondaryPartialFixture('mail', 50_000, 1);
    try {
      await x.writer.start();
      var result = await x.scheduler.runCommand({
        name: 'zero-progress-secondary', accountId: x.attacker,
        run: function () { return secondaryAction(x, 'mail'); }
      });
      assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'});
      assert.equal(secondaryEffectCount(x, 'mail'), 0);
      assert.equal(x.store.getById(x.sourceWake.id).state, 'COMPLETED');
      var targetWake = x.store.getById(x.targetWake.id);
      assert.equal(targetWake.state, 'RUNNING');
      assert.equal(targetWake.checkpoint_revision, null);
      await x.writer.drainNow();
      await x.scheduler.runCommand({
        name: 'zero-progress-secondary', accountId: x.attacker,
        run: function () { return secondaryAction(x, 'mail'); }
      });
      assert.equal(secondaryEffectCount(x, 'mail'), 1);
    } finally { await x.writer.stop(100); x.dong(); }
  });

  function taoSecondaryDeferredExternalFixture(kind) {
    var x = taoSecondaryPartialFixture(kind, 0, 0), T = x.T;
    var sender = coDinhTimeline(docState(x.kho, x.attacker), T - 1);
    var secondary = coDinhTimeline(docState(x.kho, x.target), T - 1);
    var originalSelf = secondary.planets[0].c;
    var fleet = attackTo(secondary, originalSelf);
    fleet.mission = 'spy'; fleet.ships = {probe: 1};
    fleet.diLuc = T - 60; fleet.den_t = T;
    secondary.fleets = [fleet];
    x.lease = layLease(x, x.lease.ownerId);
    luuQuaMutation(x, x.target, secondary);
    assert.equal(x.store.releaseLease(x.lease, x.clock.nowMs()), true);
    // Ownership flips only after the self-target launch was saved. Corrupt ht
    // proves the hand-off uses canonical dq ownership, not a projection.
    secondary.planets[0].c = G.toaDo(9, 8, 7);
    sender.planets[0].c = originalSelf;
    x.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?')
      .run(JSON.stringify(sender), x.attacker);
    x.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?')
      .run(JSON.stringify(secondary), x.target);
    x.kho.db.prepare('DELETE FROM ht WHERE td=?').run(G.tdKey(originalSelf));
    x.kho.db.prepare(
      'INSERT INTO ht(td,tk,ten,pi,thuDo) VALUES(?,?,?,?,?)'
    ).run(G.tdKey(originalSelf), x.target, 'stale-owner', 0, 0);
    x.dynamicFleetId = fleet.id;
    return x;
  }

  for (let dynamicKind of ['mail', 'war', 'galana']) {
    test(dynamicKind + ' suppresses its effect when secondary discovers an external ref',
      async function () {
        var kind = dynamicKind, x = taoSecondaryDeferredExternalFixture(kind);
        var before = secondaryEffectCount(x, kind);
        try {
          await x.writer.start();
          var first = await x.scheduler.runCommand({
            name: 'secondary-external-' + kind, accountId: x.attacker,
            run: function () { return secondaryAction(x, kind); }
          });
          assert.deepEqual(first, {deferred: true, code: 'TICK_PARTIAL'});
          assert.equal(secondaryEffectCount(x, kind), before);
          var globals = x.kho.db.prepare(
            "SELECT * FROM event_jobs WHERE kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
            "AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
          ).all();
          assert.equal(globals.length, 1);
          assert.equal(docState(x.kho, x.target).fleets.find(function (fleet) {
            return Number(fleet.id) === Number(x.dynamicFleetId);
          }).pha, 'di');
          var blockedWake = x.kho.db.prepare(
            "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
            "AND aggregate_id=? AND state='PENDING'"
          ).get(String(x.target));
          assert.ok(blockedWake);
          assert.equal(blockedWake.blocked_by_job_id, globals[0].id);
          assert.equal(Number(blockedWake.attempt), 0);
          assert.equal(blockedWake.locked_by, null);
          assert.equal(blockedWake.locked_generation, null);
          await x.writer.drainNow(); await x.writer.drainNow();
          await x.scheduler.runCommand({
            name: 'secondary-external-' + kind, accountId: x.attacker,
            run: function () { return secondaryAction(x, kind); }
          });
          assert.equal(secondaryEffectCount(x, kind),
            kind === 'galana' ? before + 7 : before + 1);
        } finally { await x.writer.stop(100); x.dong(); }
      });
  }

  test('advance-due propagates deferredExternal and never reaches its closure', async function () {
    var x = taoSecondaryDeferredExternalFixture('mail'), closureCalls = 0;
    try {
      await x.writer.start();
      var first = await x.scheduler.runCommand({
        name: 'advance-due',
        run: function () { closureCalls += 1; }
      });
      assert.deepEqual(first, {deferred: true, code: 'TICK_PARTIAL'});
      assert.equal(closureCalls, 0);
      assert.equal(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM event_jobs WHERE kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE')"
      ).get().n, 1);
      assert.equal(docState(x.kho, x.target).fleets.find(function (fleet) {
        return Number(fleet.id) === Number(x.dynamicFleetId);
      }).pha, 'di');
    } finally { await x.writer.stop(100); x.dong(); }
  });
  test('MutationGate defers a cross-account barrier at primitive 50,001 before its closure', async function () {
    var T = 1_800_010_140, x = taoPvpFixtureAt(T), ran = false;
    try {
      var attacker = datNoiTaiCungGiay(docState(x.kho, x.attacker), T, 50_001);
      luuQuaMutation(x, x.attacker, attacker);
      datModeDurableChiWriterUnit(x);
      x.writer = new SchedulerWriter({
        ownerId: '00000000-0000-4000-8000-000000000056', store: x.store,
        world: x.world, reducer: x.reducer, advanceService: x.service,
        clock: x.clock, logger: silentLogger(), pollMs: 1_000, leaseMs: 15_000,
        manualDrain: true
      });
      x.scheduler = taoScheduler({ writer: x.writer, store: x.store, world: x.world,
        reducer: x.reducer, advanceService: x.service, clock: x.clock,
        logger: silentLogger(), schedulerOptions: schedulerOptionsCoSo() });
      x.clock.setS(T);
      await x.scheduler.start();
      var deferred = await x.scheduler.runCommand({
        name: 'cross-account-budget-proof', accountId: x.target,
        run: function () { ran = true; }
      });
      assert.deepEqual(deferred, { deferred: true, code: 'TICK_PARTIAL' });
      assert.equal(ran, false);
      assert.equal(x.store.globalWatermarkS(), T);
      await x.writer.drainNow();
      await x.scheduler.runCommand({
        name: 'cross-account-budget-proof', accountId: x.target,
        run: function () { ran = true; }
      });
      assert.equal(ran, true);
    } finally { await x.writer.stop(100); x.dong(); }
  });
  test('an outside revision after a partial keeps external stale rejection intact', async function () {
    var x = taoPartialWriterFixture();
    try {
      await x.writer.start();
      await x.writer.drainNow();
      var partial = x.store.getByIdempotencyKey(x.accountJob.idempotency_key);
      x.kho.trongGiaoDich(function () {
        x.kho.db.prepare('UPDATE dq SET revision=revision+1 WHERE tk=?').run(x.attacker);
      }, { immediate: true });
      await x.writer.drainNow();
      var stale = x.store.getByIdempotencyKey(x.accountJob.idempotency_key);
      assert.equal(stale.state, 'CANCELLED');
      assert.equal(stale.id, partial.id);
      assert.equal(JSON.parse(x.kho.db.prepare(
        'SELECT result_json FROM event_applications WHERE job_id=?'
      ).get(stale.id).result_json).code, 'STALE_REVISION');
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('standby automatically takes over after the active lease expires', async function () {
    var x = taoWriterFixture({ manualDrain: false });
    var timers = taoBoHenGia(x.clock);
    x.writer.timers = timers;
    var second = taoWriterKhac(
      x,
      '00000000-0000-4000-8000-000000000036',
      { manualDrain: false, timers: timers }
    );
    try {
      await x.writer.start();
      var generation = x.writer.leaseToken.generation;
      await second.start();
      assert.equal(second.status().ready, false);
      x.writer.simulateFatalCrashForTest();
      x.clock.advanceMs(15_001);
      await timers.chayDenHienTai();
      assert.equal(second.status().ready, true);
      assert.ok(second.leaseToken.generation > generation);
    } finally {
      await x.writer.stop(100);
      await second.stop(100);
      x.dong();
    }
  });

  test('real takeover after committed claim rejects the stale effect UoW', async function () {
    var x = taoWriterFixture(), takeover = null;
    try {
      x.clock.setS(x.pvpJob.scheduled_at_s);
      x.writer.setFaultHook(function (stage, claimed) {
        if (stage !== 'after-claim' || claimed.id !== x.pvpJob.id) return;
        x.kho.trongGiaoDich(function () {
          assert.equal(x.store.releaseLease(x.writer.leaseToken, x.clock.nowMs()), true);
          takeover = x.store.acquireLease(
            '00000000-0000-4000-8000-000000000066', x.clock.nowMs() + 1, 15_000
          );
          assert.ok(takeover);
        }, {immediate: true});
      });
      await x.writer.start();
      await assert.rejects(x.writer.drainNow(), /LEASE_LOST/);
      assert.equal(
        x.kho.db.prepare(
          'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
        ).get(x.pvpJob.idempotency_key).n,
        0
      );
      assert.equal(x.writer.status().ready, false);
      assert.equal(x.writer.status().reason, 'SCHEDULER_LEASE_LOST');
    } finally {
      if (takeover) x.kho.trongGiaoDich(function () {
        x.store.releaseLease(takeover, x.clock.nowMs() + 1);
      }, {immediate: true});
      await x.writer.stop(100);
      x.dong();
    }
  });
  test(
    'a retrying local poison does not stop an independent aggregate before T',
    async function () {
    var x = taoWriterFixture(), localAtS = x.pvpJob.scheduled_at_s - 1;
    try {
      var setupLease = layLease(x, '00000000-0000-4000-8000-000000000030');
      var poisonOptions = {aggregateId: String(x.attacker),
        expectedRevision: x.kho.q.dqGet.get(x.attacker).revision};
      var independentOptions = {aggregateId: String(x.unrelatedAccount),
        expectedRevision: x.kho.q.dqGet.get(x.unrelatedAccount).revision};
      var poisonKey = accountFixtureKey('poison-local', poisonOptions);
      var independentKey = accountFixtureKey('independent-local', independentOptions);
      x.kho.trongGiaoDich(function () {
        x.store.schedule(setupLease, job('poison-local', localAtS, 100, {
          aggregateId: poisonOptions.aggregateId, expectedRevision: poisonOptions.expectedRevision,
          payload: { schemaVersion: 1, accountId: x.attacker }
        }), x.clock.nowMs());
        x.store.schedule(setupLease, job('independent-local', localAtS, 100, {
          aggregateId: independentOptions.aggregateId,
          expectedRevision: independentOptions.expectedRevision,
          payload: { schemaVersion: 1, accountId: x.unrelatedAccount }
        }), x.clock.nowMs());
        assert.equal(x.store.releaseLease(setupLease, x.clock.nowMs()), true);
      }, { immediate: true });
      x.clock.setS(localAtS);
      x.writer.setFaultHook(function (stage, claimed) {
        if (stage === 'after-claim' && claimed.idempotency_key === poisonKey) {
          var error = new Error('SQLITE_BUSY local poison'); error.code = 'SQLITE_BUSY'; throw error;
        }
      });
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(poisonKey).state, 'RETRY_WAIT');
      assert.equal(x.store.getByIdempotencyKey(independentKey).state, 'COMPLETED');
    } finally { await x.writer.stop(100); x.dong(); }
    }
  );
  test(
    'classified retry reaches attempt eight then quarantines while an independent aggregate completes',
    async function () {
    var x = taoWriterFixture({ leaseMs: 60_000, retryBaseMs: 100 }), localAtS = x.pvpJob.scheduled_at_s - 1;
    try {
      var setupLease = layLease(x, '00000000-0000-4000-8000-000000000046');
      var retryOptions = {aggregateId: String(x.attacker),
        expectedRevision: x.kho.q.dqGet.get(x.attacker).revision};
      var survivorOptions = {aggregateId: String(x.unrelatedAccount),
        expectedRevision: x.kho.q.dqGet.get(x.unrelatedAccount).revision};
      var retryKey = accountFixtureKey('retry-eight', retryOptions);
      var survivorKey = accountFixtureKey('aggregate-survives', survivorOptions);
      x.kho.trongGiaoDich(function () {
        x.store.schedule(setupLease, job('retry-eight', localAtS, 100, {
          aggregateId: String(x.attacker), expectedRevision: x.kho.q.dqGet.get(x.attacker).revision,
          payload: { schemaVersion: 1, accountId: x.attacker }
        }), x.clock.nowMs());
        x.store.schedule(setupLease, job('aggregate-survives', localAtS, 100, {
          aggregateId: String(x.unrelatedAccount), expectedRevision: x.kho.q.dqGet.get(x.unrelatedAccount).revision,
          payload: { schemaVersion: 1, accountId: x.unrelatedAccount }
        }), x.clock.nowMs());
        assert.equal(x.store.releaseLease(setupLease, x.clock.nowMs()), true);
      }, { immediate: true });
      x.clock.setS(localAtS);
      x.writer.setFaultHook(function (stage, claimed) {
        if (stage === 'after-claim' && claimed.idempotency_key === retryKey) {
          var error = new Error('SQLITE_BUSY retry loop'); error.code = 'SQLITE_BUSY'; throw error;
        }
      });
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(survivorKey).state, 'COMPLETED');
      for (var expectedAttempt = 1; expectedAttempt < 8; expectedAttempt++) {
        var retry = x.store.getByIdempotencyKey(retryKey);
        assert.equal(retry.state, 'RETRY_WAIT');
        assert.equal(retry.attempt, expectedAttempt);
        assert.equal(
          Number(retry.retry_at_ms),
          x.clock.nowMs() + Math.min(300_000, 100 * Math.pow(2, expectedAttempt - 1)) +
            deterministicJitter(retry.id, expectedAttempt)
        );
        x.clock.setMs(Number(retry.retry_at_ms));
        await x.writer.drainNow();
      }
      var poisoned = x.store.getByIdempotencyKey(retryKey);
      assert.equal(poisoned.attempt, 8);
      assert.equal(poisoned.state, 'QUARANTINED');
      assert.equal(poisoned.retry_at_ms, null);
    } finally { await x.writer.stop(100); x.dong(); }
    }
  );

  test('an unclassified reducer exception quarantines instead of retrying', async function () {
    var x = taoWriterFixture(), localAtS = x.pvpJob.scheduled_at_s - 1;
    try {
      var setupLease = layLease(x, '00000000-0000-4000-8000-000000000038');
      var unknownOptions = {aggregateId: String(x.unrelatedAccount),
        expectedRevision: x.kho.q.dqGet.get(x.unrelatedAccount).revision};
      var unknownKey = accountFixtureKey('unknown-local', unknownOptions);
      x.kho.trongGiaoDich(function () {
        x.store.schedule(setupLease, job('unknown-local', localAtS, 100, {
          aggregateId: String(x.unrelatedAccount),
          expectedRevision: x.kho.q.dqGet.get(x.unrelatedAccount).revision,
          payload: { schemaVersion: 1, accountId: x.unrelatedAccount }
        }), x.clock.nowMs());
        assert.equal(x.store.releaseLease(setupLease, x.clock.nowMs()), true);
      }, { immediate: true });
      x.clock.setS(localAtS);
      x.writer.setFaultHook(function (stage, claimed) {
        if (stage === 'after-claim' && claimed.idempotency_key === unknownKey) {
          throw new Error('unclassified fixture failure');
        }
      });
      await x.writer.start();
      await x.writer.drainNow();
      var stored = x.store.getByIdempotencyKey(unknownKey);
      assert.equal(stored.state, 'QUARANTINED');
      assert.equal(stored.attempt, 1);
      assert.equal(stored.retry_at_ms, null);
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('quarantine transition emits one scrubbed post-commit warning and retries emit none',
    async function () {
      var x = taoWriterFixture(), records = [], secret = 'password=do-not-log';
      try {
        x.writer.logger = silentLogger(records);
        x.clock.setS(x.pvpJob.scheduled_at_s);
        x.writer.setFaultHook(function (stage) {
          if (stage === 'after-claim') {
            var error = new Error(secret); error.code = 'PAYLOAD_INTEGRITY'; throw error;
          }
        });
        await x.writer.start();
        await x.writer.drainNow();
        await x.writer.drainNow();
        var warnings = records.filter(function (entry) {
          return entry.info.event === 'scheduler.job_quarantined';
        });
        assert.equal(warnings.length, 1);
        assert.equal(warnings[0].level, 'warn');
        assert.deepEqual(Object.keys(warnings[0].info).sort(), ['at', 'code', 'event']);
        assert.equal(Number.isFinite(warnings[0].info.at), true);
        assert.doesNotMatch(JSON.stringify(warnings),
          /password|do-not-log|payload_json|accountId|[0-9a-f]{8}-[0-9a-f-]{27}/i);
      } finally { await x.writer.stop(100); x.dong(); }
    });

  test('tick logging honors canonical and alias precedence only after committed flush', function () {
    var resolveFoundationOptions = require('../server/app.js').resolveFoundationOptions;
    [
      [{}, {SCHEDULER_LOG_TICKS: '1', THDC_AM: '0'}, true, 'canonical-on'],
      [{}, {SCHEDULER_LOG_TICKS: '0', THDC_AM: '1'}, false, 'canonical-off'],
      [{}, {THDC_AM: '1'}, true, 'alias-on'],
      [{}, {THDC_AM: '0'}, false, 'alias-off']
    ].forEach(function (entry) {
      var x = taoWriterFixture(), records = [];
      try {
        x.writer.logger = silentLogger(records);
        x.writer.logTicks = resolveFoundationOptions(entry[0], entry[1]).schedulerLogTicks;
        var mutation = x.writer.newMutationContext(
          x.lease, {value: 50_000}, x.clock.nowMs()
        );
        mutation.recordAdvance({processed: 3, budgetExhausted: false});
        x.writer.flushCommittedMetricLedger(mutation.metricLedger);
        var ticks = records.filter(function (record) {
          return record.info.event === 'scheduler.tick';
        });
        assert.equal(ticks.length, entry[2] ? 1 : 0, entry[3]);
        if (entry[2]) {
          assert.equal(ticks[0].level, 'info');
          assert.deepEqual(Object.keys(ticks[0].info).sort(),
            ['at', 'budgetExhausted', 'count', 'event']);
          assert.deepEqual(ticks[0].info, {
            event: 'scheduler.tick', at: x.clock.nowMs(), count: 3,
            budgetExhausted: false
          });
        }
      } finally { x.dong(); }
    });
  });

  test('rolled-back effect emits no tick and fatal error logs one redacted stable record',
    async function () {
      var x = taoWriterFixture(), records = [];
      try {
        x.writer.logTicks = true;
        x.writer.logger = silentLogger(records);
        x.clock.setS(x.pvpJob.scheduled_at_s);
        var injectedCrash = new Error('payload password=never-log');
        injectedCrash.code = 'INJECTED_CRASH';
        var injectedMessage = injectedCrash.message;
        x.writer.setFaultHook(function (stage) {
          if (stage === 'after-game-mutation') throw injectedCrash;
        });
        await x.writer.start();
        var caughtCrash = null;
        try { await x.writer.drainNow(); }
        catch (error) { caughtCrash = error; }
        assert.equal(caughtCrash !== null, true);
        assert.equal(caughtCrash === injectedCrash, true);
        assert.equal(caughtCrash && caughtCrash.code === 'INJECTED_CRASH', true);
        assert.equal(caughtCrash && caughtCrash.message === injectedMessage, true);
        assert.equal(records.filter(function (record) {
          return record.info.event === 'scheduler.tick';
        }).length, 0, 'rolled-back application never reaches committed-ledger flush');
        x.writer.setFaultHook(null);
        var committed = x.writer.applyClaimed(
          x.store.getById(x.pvpJob.id), {value: 50_000}, x.clock.nowMs()
        );
        x.writer.flushCommittedMetricLedger(committed.metricLedger);
        var committedTicks = records.filter(function (record) {
          return record.info.event === 'scheduler.tick';
        });
        assert.equal(committedTicks.length, 1, 'successful retry logs once after commit');
        assert.deepEqual(Object.keys(committedTicks[0].info).sort(),
          ['at', 'budgetExhausted', 'count', 'event']);
        var fatal = Object.assign(new Error('password=super-secret payload_json={x}'), {
          code: 'ERR_SQLITE_ERROR', errcode: 13
        });
        assert.equal(x.writer.transitionStorageFatal(fatal), true);
        assert.equal(x.writer.transitionStorageFatal(fatal), false);
        var errors = records.filter(function (record) {
          return record.info.event === 'scheduler.error';
        });
        assert.equal(errors.length, 1);
        assert.equal(errors[0].level, 'error');
        assert.deepEqual(Object.keys(errors[0].info).sort(), ['at', 'code', 'event']);
        assert.equal(errors[0].info.code, 'SQLITE_FULL');
        assert.equal(/super-secret|payload_json|password/i.test(JSON.stringify(errors)), false);
        x.writer.logger.info = function () { throw new Error('broken sink'); };
        var ledger = x.writer.newMutationContext(x.lease, {value: 1}, x.clock.nowMs());
        ledger.recordAdvance({processed: 1, budgetExhausted: false});
        assert.doesNotThrow(function () {
          x.writer.flushCommittedMetricLedger(ledger.metricLedger);
        }, 'post-commit sink failure cannot reclassify committed work');
      } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
    });

  test('tampered stored payload quarantines before EventReducer.prepare receives it', async function () {
    var x = taoWriterFixture(), prepares = 0, originalPrepare = x.reducer.prepare;
    try {
      x.clock.setS(x.pvpJob.scheduled_at_s);
      x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?').run(
        '{"schemaVersion":1,"matchId":7,"ref":{}}', x.pvpJob.id
      );
      x.reducer.prepare = function () { prepares++; return originalPrepare.apply(this, arguments); };
      await x.writer.start();
      await x.writer.drainNow();
      var stored = x.store.getByIdempotencyKey(x.pvpJob.idempotency_key);
      assert.equal(stored.state, 'QUARANTINED');
      assert.equal(stored.error_code, 'PAYLOAD_INTEGRITY');
      assert.equal(prepares, 0);
    } finally {
      x.reducer.prepare = originalPrepare;
      await x.writer.stop(100);
      x.dong();
    }
  });
  test('a quarantined global poison holds readiness data and rejects a later MutationGate command', async function () {
    var x = taoWriterFixture();
    try {
      x.clock.setS(x.pvpJob.scheduled_at_s);
      x.writer.setFaultHook(function (stage, claimed) {
        if (stage === 'after-claim' && claimed.idempotency_key === x.pvpJob.idempotency_key) {
          var error = new Error('bad payload'); error.code = 'PAYLOAD_INTEGRITY'; throw error;
        }
      });
      await x.scheduler.start();
      await x.writer.drainNow();
      assert.equal(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'QUARANTINED');
      assert.equal(x.writer.status().watermarkS, x.pvpJob.scheduled_at_s);
      assert.ok(x.writer.status().quarantined >= 1);
      await assert.rejects(
        x.scheduler.runCommand({
          name: 'blocked-by-poison',
          run: function () { throw new Error('must not run'); }
        }),
        /SCHEDULER_QUARANTINE_LIMIT/
      );
    } finally { await x.scheduler.stop(100); x.dong(); }
  });

  test('global retry keeps watermark while unrelated local work does not cross T', async function () {
    var x = taoWriterFixture();
    try {
      x.clock.setS(x.pvpJob.scheduled_at_s); // old fixture lease is now expired
      x.writer.setFaultHook(function (stage, job) {
        if (stage === 'after-claim' && job.idempotency_key === x.pvpJob.idempotency_key) {
          var error = new Error('SQLITE_BUSY fixture'); error.code = 'SQLITE_BUSY'; throw error;
        }
      });
      await x.writer.start();
      assert.equal(x.writer.status().wakeTimerActive, false);
      await x.writer.drainNow();
      var retried = x.store.getByIdempotencyKey(x.pvpJob.idempotency_key);
      assert.equal(retried.state, 'RETRY_WAIT');
      assert.equal(retried.attempt, 1);
      assert.equal(Number(retried.retry_at_ms), x.clock.nowMs() + 1_000 + deterministicJitter(retried.id, 1));
      assert.equal(x.writer.status().watermarkS, x.pvpJob.scheduled_at_s);
      assert.ok(docState(x.kho, x.unrelatedAccount).lastTick <= x.pvpJob.scheduled_at_s);
    } finally {
      await x.writer.stop(100);
      x.dong();
    }
  });

  ['after-application-insert', 'after-game-mutation'].forEach(function (stage) {
    ['command', 'advance'].forEach(function (surface) {
      test(surface + ' barrier rolls back ' + stage + ' before retry', async function () {
        var x = taoWriterFixture(), closureRan = false;
        try {
          x.clock.setS(x.pvpJob.scheduled_at_s);
          var before = x.kho.db.prepare(
            'SELECT tk,state,revision FROM dq ORDER BY tk'
          ).all();
          x.writer.setFaultHook(function (actual, jobRow) {
            if (actual !== stage || jobRow.id !== x.pvpJob.id) return;
            var error = new Error('SQLITE_BUSY admission fixture');
            error.code = 'SQLITE_BUSY';
            throw error;
          });
          await x.writer.start();
          var operation = surface === 'command' ? x.scheduler.runCommand({
            name: 'admission-fault',
            run: function () { closureRan = true; }
          }) : x.scheduler.advanceTo(x.unrelatedAccount, x.pvpJob.scheduled_at_s);
          await assert.rejects(operation, /GLOBAL_BARRIER_PENDING/);
          assert.equal(closureRan, false);
          assert.equal(x.store.getByIdempotencyKey(
            x.pvpJob.idempotency_key
          ).state, 'RETRY_WAIT');
          assert.equal(x.kho.db.prepare(
            'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
          ).get(x.pvpJob.id).n, 0);
          assert.deepEqual(x.kho.db.prepare(
            'SELECT tk,state,revision FROM dq ORDER BY tk'
          ).all(), before);
        } finally { await x.writer.stop(100); x.dong(); }
      });
    });
  });
  test('heartbeat renews before lease/3 and loss changes writer to standby without a real sleep', async function () {
    var x = taoWriterFixture(), timers = taoBoHenGia(x.clock);
    x.writer = new SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(), timers: timers,
      pollMs: 1_000, leaseMs: 15_000, retryBaseMs: 1_000, retryMaxMs: 300_000, maxAttempts: 8, manualDrain: false
    });
    x.scheduler = taoScheduler({
      writer: x.writer, store: x.store, world: x.world,
      advanceService: x.service, reducer: x.reducer, clock: x.clock,
      logger: silentLogger(), schedulerOptions: schedulerOptionsCoSo()
    });
    try {
      await x.writer.start();
      var before = x.kho.db.prepare(
        "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().expires_at_ms;
      x.clock.advanceMs(4_999); // strictly less than leaseMs / 3
      await timers.chayDenHienTai();
      var after = x.kho.db.prepare(
        "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().expires_at_ms;
      assert.ok(after > before);
      x.clock.advanceMs(15_001);
      var outsider = new SchedulerStore(x.kho, x.clock);
      var takeover = x.kho.trongGiaoDich(function () {
        return outsider.acquireLease(
          '00000000-0000-4000-8000-000000000021',
          x.clock.nowMs(),
          15_000
        );
      }, {immediate: true});
      assert.ok(takeover, 'a strictly expired lease is really taken over');
      x.clock.advanceMs(4_999);
      await timers.chayDenHienTai();
      assert.equal(x.writer.status().ready, false);
      assert.equal(x.writer.status().reason, 'SCHEDULER_LEASE_LOST');
      assert.equal(x.writer.status().heartbeatTimerActive, false);
      await assert.rejects(
        x.scheduler.runCommand({
          name: 'after-heartbeat-loss',
          run: function () { throw new Error('must not run'); }
        }),
        /SCHEDULER_LEASE_LOST/
      );
    } finally { await x.writer.stop(100); x.dong(); }
  });

  test('public bridge advanceTo uses the writer lease and GameAdvanceService result', async function () {
    var x = taoWriterFixture();
    try {
      x.clock.setS(x.pvpJob.scheduled_at_s - 1);
      await x.scheduler.start();
      var targetS = x.pvpJob.scheduled_at_s - 1;
      var result = await x.scheduler.advanceTo(x.unrelatedAccount, targetS);
      assert.equal(result.advancedToS, targetS);
      assert.equal(docState(x.kho, x.unrelatedAccount).lastTick, targetS);
    } finally { await x.scheduler.stop(100); x.dong(); }
  });

  test('public bridge rejects a target beyond effective time before a marker or barrier write', async function () {
    var x = taoWriterFixture();
    try {
      await x.scheduler.start();
      var before = snapshot(x.kho);
      await assert.rejects(
        x.scheduler.advanceTo(x.unrelatedAccount, giayTuClock(x.clock) + 1),
        /ADVANCE_TARGET_FUTURE/
      );
      assert.equal(snapshot(x.kho), before);
    } finally { await x.scheduler.stop(100); x.dong(); }
  });

  test('invalid bridge command fails before enqueue, durable marker, or game write', async function () {
    var x = taoWriterFixture();
    try {
      await x.writer.start();
      var revision = Number(x.kho.q.dqGet.get(x.attacker).revision);
      assert.throws(function () {
        x.scheduler.runCommand({ name: '', run: function () {} });
      }, /SCHEDULER_COMMAND_INVALID/);
      assert.equal(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM scheduler_meta WHERE key='durable_first_mutation_at_ms'"
      ).get().n, 0);
      assert.equal(Number(x.kho.q.dqGet.get(x.attacker).revision), revision);
    } finally { await x.writer.stop(100); x.dong(); }
  });
  test('MutationGate drains pending PvP at T before admitting the later command', async function () {
    var x = taoWriterFixture();
    try {
      var defenderBefore = docState(x.kho, x.target).planets[0].ships.fighterL;
      assert.equal(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'PENDING');
      x.clock.setS(x.pvpJob.scheduled_at_s); // expiry lets the real writer acquire a new generation at T
      await x.scheduler.start();
      await thayDoiSauBarrierQuaGate(x, 99);
      var application = x.kho.db.prepare(
        'SELECT effective_at_s,snapshot_json FROM event_applications ' +
        'WHERE idempotency_key=?'
      ).get(x.pvpJob.idempotency_key).snapshot_json;
      var snapshot = JSON.parse(application);
      assert.equal(x.kho.db.prepare('SELECT effective_at_s FROM event_applications WHERE idempotency_key=?')
        .get(x.pvpJob.idempotency_key).effective_at_s, x.pvpJob.scheduled_at_s);
      assert.equal(snapshot.defender.ships.fighterL, defenderBefore);
      assert.equal(docState(x.kho, x.target).planets[0].ships.fighterL, 99);
    } finally {
      await x.scheduler.stop(100);
      x.dong();
    }
  });

  function schedulerFactoryForFixture(ownerId) {
    return function (context) {
      return taoScheduler(Object.assign({}, context, {
        makeOwnerId: function () { return ownerId; }
      }));
    };
  }
  test('adapter caches a deterministic makeOwnerId wrapper without a scalar owner field', async function () {
    var x = taoPvpFixtureAt(1_800_010_090);
    var expected = '00000000-0000-4000-8000-000000000001';
    try {
      datModeDurableChiWriterUnit(x);
      var context = {
        kho: x.kho, tg: x.world, clock: x.clock, logger: silentLogger(), env: {},
        schedulerOptions: schedulerOptionsCoSo()
      };
      var first = schedulerFactoryForFixture(expected)(context);
      var second = schedulerFactoryForFixture(expected)(context);
      assert.strictEqual(second, first, 'repeat wrapper construction reuses the safe bridge');
      await first.start();
      assert.equal(x.kho.db.prepare(
        "SELECT owner_id FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().owner_id, expected);
      await first.stop(100);
    } finally { x.dong(); }
  });

  test('production adapter creates and retains one UUID-v4 owner when no test wrapper exists', async function () {
    var x = taoPvpFixtureAt(1_800_010_091);
    try {
      datModeDurableChiWriterUnit(x);
      var bridge = taoScheduler({
        kho: x.kho, tg: x.world, clock: x.clock, logger: silentLogger(), env: {},
        schedulerOptions: schedulerOptionsCoSo()
      });
      await bridge.start();
      assert.match(x.kho.db.prepare(
        "SELECT owner_id FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().owner_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4/);
      await bridge.stop(100);
    } finally { x.dong(); }
  });
  test('bridge implements every writer surface and a rejected tail never poisons the next call', async function () {
    var x = taoWriterFixture({manualDrain: true});
    var reconciled = 0;
    x.writer.reconciler = {
      reconcile: function () { reconciled++; return {pages: 0, resumedFrom: null}; }
    };
    try {
      await x.scheduler.start();
      assert.equal(reconciled, 1, 'startup reconciliation runs before readiness');
      assert.throws(function () {
        x.scheduler.runCommand({name: 'bad', run: null});
      }, /SCHEDULER_COMMAND_INVALID/);
      assert.equal(await x.scheduler.runCommand({name: 'tail-good', run: function () { return 'ok'; }}), 'ok');
      var saved = await x.scheduler.schedule(job(
        'account-advance:' + x.unrelatedAccount + ':0',
        giayTuClock(x.clock),
        100,
        {
          aggregateId: String(x.unrelatedAccount),
          expectedRevision: 0,
          payload: {schemaVersion: 1, accountId: x.unrelatedAccount}
        }
      ));
      await x.scheduler.cancel(saved.idempotency_key, 'SUPERSEDED');
      await x.writer.drainNow();
      assert.deepEqual(await x.scheduler.reconcile(), {pages: 0, resumedFrom: null});
      assert.equal(reconciled, 2, 'public reconcile is serialized after startup');
      await x.scheduler.stop(100);
      assert.deepEqual(
        ['wakeTimerActive', 'pollTimerActive', 'heartbeatTimerActive', 'reconcileTimerActive']
          .map(function (key) { return x.scheduler.getStatus()[key]; }),
        [false, false, false, false]
      );
    } finally { await x.scheduler.stop(100); x.dong(); }
  });

  test('reconcile refuses before enqueue or DB write when no seam is installed', async function () {
    var x = taoWriterFixture({manualDrain: true});
    try {
      await x.scheduler.start();
      var before = snapshot(x.kho);
      await assert.rejects(x.scheduler.reconcile(), /SCHEDULER_RECONCILER_UNAVAILABLE/);
      assert.equal(snapshot(x.kho), before);
    } finally { await x.scheduler.stop(100); x.dong(); }
  });

  test('taoScheduler memoizes one bridge and one world capability set per Kho', async function () {
    var x = taoPvpFixtureAt(1_800_010_100), world;
    try {
      datModeDurableChiWriterUnit(x);
      world = new TheGioi(x.kho, { clock: x.clock });
      var context = {
        kho: x.kho, tg: world, clock: x.clock, logger: silentLogger(), env: {},
        schedulerOptions: schedulerOptionsCoSo()
      };
      var first = taoScheduler(context);
      var second = taoScheduler(context);
      assert.strictEqual(second, first);
      assert.strictEqual(second.getStatus, first.getStatus);
      await first.start();
      var generation = x.kho.db.prepare(
        "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().generation;
      await second.start();
      assert.equal(x.kho.db.prepare(
        "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get().generation, generation);
      await first.stop(100);
    } finally { x.dong(); }
  });
// TASK6_V27_PARENT_TESTS_END
// TASK6_V27_OVERLAY_TESTS_START
function task6v27RequireFunction(object, name, sentinel, label) {
  assert.equal(typeof (object && object[name]), 'function',
    sentinel + ' missing ' + (label || name));
}
function task6v27RequireExport(object, name, sentinel) {
  task6v27RequireFunction(object, name, sentinel, 'export.' + name);
}
function task6v27RequireBridgeSeam(bridge, name, sentinel) {
  task6v27RequireFunction(bridge, name, sentinel, 'bridge.' + name);
  assert.equal(Object.keys(bridge).includes(name), false,
    sentinel + ' bridge seam enumerable ' + name);
}
function task6v27Rows(kho, sql, params) {
  var stmt = kho.db.prepare(sql);
  return stmt.all.apply(stmt, params || []);
}
function task6v27RawJob(kho, id) {
  return kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(id);
}
function task6v27LockProjection(row) {
  return {
    id: row.id,
    state: row.state,
    locked_by: row.locked_by,
    locked_generation: row.locked_generation,
    locked_until_ms: row.locked_until_ms,
    attempt: row.attempt
  };
}

test('Task 6 v27 overlay raw quarantine store primitive preserves attempt without parsing invalid payload',
  async function () {
  var sentinel = 'TASK6V27_RED_001_RAW_QUARANTINE_STORE';
  var x = taoWriterFixture();
  try {
    assert.ok(x.pvpJob && x.pvpJob.idempotency_key, 'TASK6V27_FIXTURE_PVP_JOB_CREATED');
    task6v27RequireFunction(x.store, 'quarantineClaimedRaw', sentinel);
    x.clock.setS(x.pvpJob.scheduled_at_s);
    var token = layLease(x, x.ownerId);
    var nowMs = x.clock.nowMs();
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(token, x.pvpJob.id, nowMs, 15_000, {allowFuturePending: true});
    }, {immediate: true});
    x.kho.db.prepare('UPDATE event_jobs SET attempt=?,payload_json=? WHERE id=?')
      .run(3, '{not-json', claimed.id);
    var raw = task6v27RawJob(x.kho, claimed.id);
    var settled = x.kho.trongGiaoDich(function () {
      return x.store.quarantineClaimedRaw(token, raw,
        Object.assign(new Error('unsafe payload'), {code: 'PAYLOAD_INTEGRITY'}), nowMs);
    }, {immediate: true});
    assert.equal(settled.id, claimed.id, sentinel + ' quarantined id');
    assert.equal(settled.state, 'QUARANTINED', sentinel + ' state');
    var stored = x.store.getById(claimed.id);
    assert.equal(Number(stored.attempt), 3, sentinel + ' attempt preserved');
    assert.equal(stored.error_code, 'PAYLOAD_INTEGRITY', sentinel + ' scrubbed code');
    assert.equal(stored.retry_at_ms, null, sentinel + ' retry cleared');
    assert.equal(stored.locked_by, null, sentinel + ' owner cleared');
    assert.equal(stored.locked_generation, null, sentinel + ' generation cleared');
    assert.equal(stored.locked_until_ms, null, sentinel + ' lock cleared');
  } finally { x.dong(); }
});

test('Task 6 v27 overlay status cache private seams bridge seams and exact scheduler exports', async function () {
  var sentinel = 'TASK6V27_RED_002_STATUS_EXPORTS';
  var indexExports = require('../server/scheduler/index.js');
  task6v27RequireExport(indexExports, 'taoScheduler', sentinel);
  assert.deepEqual(Object.keys(indexExports).sort(),
    ['inRange', 'resolveDurableSchedulerOptions', 'taoScheduler',
      'validateProductionDatabasePath'].sort(),
    sentinel + ' exact public exports');
  var x = taoWriterFixture({manualDrain: false, timers: taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }})});
  try {
    await x.writer.start();
    ['_datSignalHandlerInstalled', '_beginStop', '_waitForStopFinalization', '_datDatabaseClosing']
      .forEach(function (name) { task6v27RequireBridgeSeam(x.scheduler, name, sentinel); });
    var clearAllCalls = 0;
    var realClearAll = x.writer.clearAllTimers.bind(x.writer);
    x.writer.clearAllTimers = function () { clearAllCalls += 1; return realClearAll(); };
    var calls = 0;
    var realStatus = x.writer.status.bind(x.writer);
    x.writer.status = function () { calls += 1; return realStatus(); };
    var bridgeStatus = x.scheduler.getStatus();
    assert.equal(calls, 1, sentinel + ' bridge delegates to writer.status');
    assert.deepEqual(Object.keys(bridgeStatus).sort(), [
      'ages', 'continuationActive', 'counts', 'dbOpen', 'draining',
      'dueBacklog', 'heartbeatTimerActive', 'leaseHeld', 'metrics', 'mode',
      'nextEligibleAtMs', 'oldestDueAgeMs', 'pending', 'pollTimerActive',
      'quarantined', 'ready', 'reason', 'reconcileTimerActive',
      'recoveryComplete', 'retryWait', 'running', 'signalHandlerInstalled',
      'state', 'wakeTimerActive', 'watermarkS', 'writerLeaseHeld'
    ].sort(), sentinel + ' exact status keys');
    assert.equal(Object.prototype.hasOwnProperty.call(bridgeStatus, 'effectiveNowMs'), false,
      sentinel + ' effectiveNowMs private');
    bridgeStatus.metrics.jobAttempts.mutated = 1;
    bridgeStatus.metrics.jobDuration.ACCOUNT_ADVANCE = {success: {bucket: 1}};
    bridgeStatus.metrics.leaseAcquire.acquired = 99;
    bridgeStatus.metrics.reconcile.success = 99;
    assert.equal(x.writer.metrics.jobAttempts.mutated, undefined, sentinel + ' clone attempts');
    assert.equal(x.writer.metrics.jobDuration.ACCOUNT_ADVANCE, undefined, sentinel + ' clone duration');
    assert.notEqual(x.writer.metrics.leaseAcquire.acquired, 99, sentinel + ' clone lease');
    assert.notEqual(x.writer.metrics.reconcile.success, 99, sentinel + ' clone reconcile');
    x.scheduler._datSignalHandlerInstalled(true);
    assert.equal(x.scheduler.getStatus().signalHandlerInstalled, true, sentinel + ' signal seam');
    x.scheduler._datDatabaseClosing();
    assert.equal(clearAllCalls, 1, sentinel + ' db close clears all timers');
    x.store.statusSnapshot = function () { throw new Error('SQLITE_READ_AFTER_CLOSE'); };
    var closed = x.scheduler.getStatus();
    assert.equal(closed.dbOpen, false, sentinel + ' closed db');
    assert.equal(closed.ready, false, sentinel + ' closed not ready');
    assert.equal(closed.reason, 'SCHEDULER_DB_CLOSED', sentinel + ' closed reason');
    x.scheduler._beginStop('test-stop', 100);
    await x.scheduler._waitForStopFinalization();
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});

test('Task 6 v27 overlay retarget and blocked descriptor store primitives use dependency source account',
  async function () {
  var sentinel = 'TASK6V27_RED_003_RETARGET_DESCRIPTOR';
  var T = 1_800_020_000;
  var x = taoPvpFixtureAt(T);
  try {
    task6v27RequireFunction(x.store, 'retargetOwnedPendingAccountAdvanceForCommand', sentinel);
    task6v27RequireFunction(x.store, 'validateBlockedAccountAdvanceForDependency', sentinel);
    assert.ok(x.pvpJob && x.pvpJob.idempotency_key, 'TASK6V27_FIXTURE_PVP_JOB_CREATED');
    x.clock.setS(T);
    var token = layLease(x, '00000000-0000-4000-8000-000000000391');
    var nowMs = x.clock.nowMs();
    var accountId = Number(x.pvpJob.source_account_id);
    assert.equal(accountId, x.attacker, sentinel + ' dependency source account');
    var revision = Number(x.kho.q.dqGet.get(accountId).revision);
    var pending = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(token, accountId, revision, T + 10, nowMs);
    }, {immediate: true});
    var retargeted = x.kho.trongGiaoDich(function () {
      return x.store.retargetOwnedPendingAccountAdvanceForCommand(
        token, accountId, revision, T, nowMs
      );
    }, {immediate: true});
    assert.deepEqual(retargeted, Object.freeze({id: pending.id, accountId: accountId,
      revision: revision, scheduledAtS: T}), sentinel + ' exact retarget descriptor');
    assert.equal(Number(x.store.getById(pending.id).scheduled_at_s), T, sentinel + ' scheduled retargeted');
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(token, pending.id, nowMs, 15_000, {allowFuturePending: true});
    }, {immediate: true});
    x.kho.trongGiaoDich(function () {
      x.store.blockOwnedAccountAdvance(token, claimed, revision, x.pvpJob.id, nowMs);
    }, {immediate: true});
    var descriptor = x.kho.trongGiaoDich(function () {
      return x.store.validateBlockedAccountAdvanceForDependency(
        token, accountId, revision, x.pvpJob.id, T, nowMs
      );
    }, {immediate: true});
    assert.equal(Object.isFrozen(descriptor), true, sentinel + ' frozen blocked descriptor');
    assert.deepEqual(Object.keys(descriptor).sort(),
      ['accountId', 'blockedByJobId', 'id', 'revision', 'scheduledAtS'].sort(),
      sentinel + ' safe descriptor keys');
    assert.equal(descriptor.id, pending.id, sentinel + ' descriptor id');
    assert.equal(descriptor.blockedByJobId, x.pvpJob.id, sentinel + ' dependency id');
    assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'payload'), false,
      sentinel + ' no raw payload');
    assert.equal(x.store.retargetOwnedPendingAccountAdvanceForCommand(token, accountId + 1, revision, T, nowMs),
      null, sentinel + ' absent same key returns null');
    assert.throws(function () {
      x.store.validateBlockedAccountAdvanceForDependency(
        token, accountId, revision, '00000000-0000-4000-8000-000000000999', T, nowMs
      );
    }, /ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT/, sentinel + ' wrong dependency rejected');
  } finally { x.dong(); }
});

test('Task 6 v27 overlay startup renews after recovery before ready and publishes after commit', async function () {
  var sentinel = 'TASK6V27_RED_004_STARTUP_RENEW';
  var x;
  var timers = taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }});
  x = taoWriterFixture({manualDrain: false, timers: timers});
  var order = [], entryNow, resumeCalls = 0, finalFenceCalls = 0;
  var resumedJobId = null, beforeResumeLock = null, afterResumeRow = null;
  try {
    ['listExpiredRunningForRecovery', 'listOwnedRunningForRecovery', 'resumeOwnedRunning']
      .forEach(function (name) { task6v27RequireFunction(x.store, name, sentinel); });
    task6v27RequireFunction(x.writer, 'refreshLeasePhaseInCurrentUow', sentinel);
    x.clock.setS(x.pvpJob.scheduled_at_s);
    var setupToken = layLease(x, x.ownerId);
    var setupNow = x.clock.nowMs();
    var ownedRunning = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(setupToken, x.pvpJob.id, setupNow, 15_000, {allowFuturePending: true});
    }, {immediate: true});
    resumedJobId = ownedRunning.id;
    beforeResumeLock = task6v27LockProjection(task6v27RawJob(x.kho, resumedJobId));
    var originalExpired = x.store.listExpiredRunningForRecovery;
    var originalOwned = x.store.listOwnedRunningForRecovery;
    var originalRecover = x.store.recoverExpiredRunning;
    var originalRenew = x.store.renewLease;
    var originalResume = x.store.resumeOwnedRunning;
    var originalFence = x.writer.refreshLeasePhaseInCurrentUow;
    x.store.listExpiredRunningForRecovery = function () {
      order.push('listExpired'); return originalExpired.apply(this, arguments);
    };
    x.store.listOwnedRunningForRecovery = function () {
      order.push('listOwned'); return originalOwned.apply(this, arguments);
    };
    x.store.recoverExpiredRunning = function () {
      order.push('recover'); x.clock.advanceMs(14_900);
      return originalRecover.apply(this, arguments);
    };
    x.store.renewLease = function (token, nowMs, leaseMs) {
      order.push('renew:' + nowMs);
      assert.equal(x.writer.ready, false, sentinel + ' renew before ready');
      assert.equal(timers.soDangCho(), 0, sentinel + ' no timer before commit');
      assert.ok(nowMs >= entryNow + 14_900, sentinel + ' fresh post-recovery now');
      return originalRenew.apply(this, arguments);
    };
    x.store.resumeOwnedRunning = function (token, jobId, nowMs, lockMs) {
      resumeCalls++;
      order.push('resume:' + jobId);
      assert.equal(jobId, resumedJobId, sentinel + ' resumes staged owned job');
      assert.equal(x.writer.ready, false, sentinel + ' resume before ready');
      assert.equal(timers.soDangCho(), 0, sentinel + ' no timer before resume commit');
      afterResumeRow = originalResume.apply(this, arguments);
      return afterResumeRow;
    };
    x.writer.refreshLeasePhaseInCurrentUow = function () {
      finalFenceCalls++;
      order.push('finalFence');
      assert.equal(x.writer.ready, false, sentinel + ' final fence before ready');
      assert.equal(timers.soDangCho(), 0, sentinel + ' no timer before final fence commit');
      return originalFence.apply(this, arguments);
    };
    entryNow = x.clock.nowMs();
    await x.writer.start();
    assert.deepEqual(order.map(function (item) { return item.split(':')[0]; }),
      ['listExpired', 'listOwned', 'recover', 'renew', 'resume', 'finalFence'],
      sentinel + ' exact recovery order');
    assert.equal(resumeCalls, 1, sentinel + ' one owned resume');
    assert.equal(finalFenceCalls, 1, sentinel + ' one final fence');
    assert.ok(Number(afterResumeRow.locked_until_ms) > Number(beforeResumeLock.locked_until_ms),
      sentinel + ' lock rebased');
    var readyStatus = x.writer.status();
    assert.equal(readyStatus.ready, true, sentinel + ' ready after commit');
    assert.ok(readyStatus.wakeTimerActive || readyStatus.pollTimerActive ||
      readyStatus.heartbeatTimerActive || readyStatus.continuationActive,
      sentinel + ' public status exposes timer');
    assert.ok(timers.soDangCho() > 0, sentinel + ' timers after commit');
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});

test('Task 6 v27 overlay advance due keeps live order and enqueues continuation at sixty one', async function () {
  var sentinel = 'TASK6V27_RED_005_DUE61_ORDER';
  var x = taoWriterFixture({manualDrain: false});
  var timers = taoBoHenGia(x.clock);
  var processed = [], closureRan = false, helperCalls = 0;
  try {
    task6v27RequireFunction(x.writer, 'advanceDueInCurrentUow', sentinel);
    x.writer.timers = timers;
    await x.writer.start();
    var beforeCommandTimerCount = timers.soDangCho();
    assert.equal(x.writer.status().continuationActive, false, sentinel + ' continuation initially inactive');
    var originalAll = x.kho.q.dqDenHan.all;
    var originalDirect = x.writer.directAccountOutcomeInCurrentUow;
    var originalHelper = x.writer.advanceDueInCurrentUow;
    var nowS = Math.floor(x.clock.nowMs() / 1000);
    var mixed = [{tk: 3, keTiep: nowS - 2}, {tk: 1, keTiep: nowS - 1}, {tk: 2, keTiep: nowS - 1}];
    for (var i = 4; i <= 61; i++) mixed.push({tk: i, keTiep: nowS});
    x.kho.q.dqDenHan.all = function (queryNowS, limit) {
      assert.equal(limit, 61, sentinel + ' limit plus one');
      assert.ok(queryNowS >= nowS, sentinel + ' query now');
      return mixed.slice();
    };
    x.writer.directAccountOutcomeInCurrentUow = function (mutation, accountId, targetS) {
      processed.push(Number(accountId));
      assert.ok(targetS <= Math.floor(x.clock.nowMs() / 1000), sentinel + ' target not future');
      return {partial: false, processed: 1, advancedToS: targetS,
        nextDueAtS: null, hasMoreDue: false, budgetExhausted: false};
    };
    x.writer.advanceDueInCurrentUow = function () { helperCalls++; return originalHelper.apply(this, arguments); };
    var result = await x.scheduler.runCommand({
      name: 'advance-due', run: function () { closureRan = true; return 'closure'; }
    });
    assert.equal(helperCalls, 1, sentinel + ' helper once');
    assert.deepEqual(processed.slice(0, 3), [3, 1, 2], sentinel + ' live order');
    assert.equal(processed.length, 60, sentinel + ' first sixty');
    assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'}, sentinel + ' partial');
    assert.equal(closureRan, false, sentinel + ' closure skipped');
    assert.equal(x.writer.status().continuationActive, true, sentinel + ' continuation status');
    assert.ok(timers.soDangCho() > beforeCommandTimerCount, sentinel + ' continuation timer armed');
    x.kho.q.dqDenHan.all = originalAll;
    x.writer.directAccountOutcomeInCurrentUow = originalDirect;
    x.writer.advanceDueInCurrentUow = originalHelper;
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});

test('Task 6 v27 overlay maintenance cutover validates guards and release precedence', function () {
  var sentinel = 'TASK6V27_RED_006_CUTOVER_RELEASE';
  var cutover = require('../server/scheduler/cutover.js');
  var storeModule = require('../server/scheduler/store.js');
  var runMaintenanceCutover = cutover.runMaintenanceCutover;
  task6v27RequireFunction(cutover, 'runMaintenanceCutover', sentinel);
  var originalAcquire = storeModule.SchedulerStore.prototype.acquireLease;
  var originalRelease = storeModule.SchedulerStore.prototype.releaseLease;
  var originalWriteAudit = storeModule.SchedulerStore.prototype.writeAudit;
  try {
    var success = taoKhoTam(), acquired = null, released = null;
    try {
      storeModule.SchedulerStore.prototype.acquireLease = function () {
        acquired = originalAcquire.apply(this, arguments);
        return acquired;
      };
      storeModule.SchedulerStore.prototype.releaseLease = function (token) {
        released = token;
        return originalRelease.apply(this, arguments);
      };
      var result = runMaintenanceCutover({kho: success.kho, clock: fakeClock(NOW_MS),
        ownerId: '00000000-0000-4000-8000-000000000501'});
      assert.deepEqual(result, {mode: 'durable', imported: 0, recovered: 0}, sentinel + ' exact result');
      assert.equal(released.ownerId, acquired.ownerId, sentinel + ' release same owner');
      assert.equal(Number(released.generation), Number(acquired.generation), sentinel + ' release same generation');
      assert.equal(success.kho.cauhinh('seed'), null, sentinel + ' no legacy seed');
      assert.match(success.kho.cauhinh('combat_seed_key_v1'), /^[0-9a-f]{64}$/, sentinel + ' combat seed');
      assert.deepEqual(success.kho.db.prepare(
        "SELECT action,job_id,detail_safe FROM scheduler_audit WHERE action='CUTOVER' ORDER BY id DESC LIMIT 1"
      ).get(), {action: 'CUTOVER', job_id: null, detail_safe: 'mode-durable'}, sentinel + ' audit');
      assert.throws(function () {
        runMaintenanceCutover({kho: success.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000505'});
      }, /SCHEDULER_CUTOVER_ALREADY_DURABLE/, sentinel + ' already durable');
    } finally { dongKhoTam(success); }
    var nonempty = taoKhoTam();
    try {
      var legacyId = Number(nonempty.kho.db.prepare(
        'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
      ).run('v23-cutover-legacy', 'V23 Cutover Legacy', 'h', 's', 1, 1).lastInsertRowid);
      nonempty.kho.db.prepare(
        'INSERT INTO dq(' +
        'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
        'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
      assert.throws(function () {
        runMaintenanceCutover({kho: nonempty.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000502'});
      }, /CANONICAL_STATE_INVALID/, sentinel + ' noncanonical legacy state');
    } finally { dongKhoTam(nonempty); }
    var primary = taoKhoTam(), primaryReleased = false;
    try {
      storeModule.SchedulerStore.prototype.writeAudit = function () {
        throw new Error('PRIMARY_WRITE_AUDIT_FAILURE');
      };
      storeModule.SchedulerStore.prototype.releaseLease = function () {
        primaryReleased = true;
        throw new Error('RELEASE_FAILURE');
      };
      assert.throws(function () {
        runMaintenanceCutover({kho: primary.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000503'});
      }, /PRIMARY_WRITE_AUDIT_FAILURE/, sentinel + ' primary over release');
      // Task 9 keeps acquisition and all cutover writes in the failed immediate
      // UoW, so rollback restores the pre-acquisition lease image.  A finally
      // release here would mutate that restored holder.
      assert.equal(primaryReleased, false, sentinel + ' failed cutover does not release restored lease');
    } finally { dongKhoTam(primary); }
    var releaseOnly = taoKhoTam();
    try {
      storeModule.SchedulerStore.prototype.writeAudit = originalWriteAudit;
      storeModule.SchedulerStore.prototype.releaseLease = function () {
        throw new Error('RELEASE_ONLY_FAILURE');
      };
      assert.throws(function () {
        runMaintenanceCutover({kho: releaseOnly.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000504'});
      }, /RELEASE_ONLY_FAILURE/, sentinel + ' release only');
    } finally { dongKhoTam(releaseOnly); }
  } finally {
    storeModule.SchedulerStore.prototype.acquireLease = originalAcquire;
    storeModule.SchedulerStore.prototype.releaseLease = originalRelease;
    storeModule.SchedulerStore.prototype.writeAudit = originalWriteAudit;
  }
});

test('Task 6 v27 overlay scheduler cutover CLI grammar lifecycle and exact exports', async function () {
  var sentinel = 'TASK6V27_RED_007_CLI';
  var cli = require('./scheduler-cutover.js');
  var priorExitCode = process.exitCode;
  try {
    task6v27RequireFunction(cli, 'runCli', sentinel);
    assert.deepEqual(Object.keys(cli).sort(), ['main', 'parseArgs', 'runCli'].sort(), sentinel + ' exports');
    assert.deepEqual(cli.parseArgs(['--db', '/tmp/game.sqlite', '--action', 'cutover']),
      {dbPath: '/tmp/game.sqlite', action: 'cutover'}, sentinel + ' valid grammar');
    [
      ['--action', 'cutover', '--db', '/tmp/game.sqlite'],
      ['--db', '', '--action', 'cutover'],
      ['--db', '/tmp', '--action', 'cutover'],
      ['--db', '/tmp/game.sqlite', '--action', 'cutover', '--action', 'cutover'],
      ['--db', '/tmp/game.sqlite', '--unknown', 'cutover'],
      ['--db', '/tmp/game.sqlite'],
      ['--db', '/tmp/game.sqlite', '--action', 'cutover', 'extra']
    ].forEach(function (argv) {
      assert.throws(function () { cli.parseArgs(argv); }, /SCHEDULER_CLI_ARGS_INVALID/,
        sentinel + ' invalid grammar ' + argv.join(' '));
    });
    var x = taoKhoTam(), closed = 0, originalDong = x.kho.dong.bind(x.kho);
    x.kho.dong = function () { closed++; return originalDong(); };
    try {
      var result = await cli.runCli(['--db', x.file, '--action', 'cutover'], {
        makeOwnerId: function () { return '00000000-0000-4000-8000-000000000601'; },
        clock: fakeClock(NOW_MS),
        openKho: function () { return x.kho; }
      });
      assert.equal(result.exitCode, 0, sentinel + ' success exit');
      assert.equal(closed, 1, sentinel + ' success closes');
      assert.equal(result.stderr, '', sentinel + ' success stderr');
      assert.equal(result.stdout, JSON.stringify({action: 'cutover', mode: 'durable',
        imported: 0, recovered: 0}) + '\n', sentinel + ' success stdout');
    } finally { removeDb(x.file); }
    var unsafe = await cli.runCli(['--db', '/tmp/game.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000602'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { throw new Error('contains secret payload'); }
    });
    assert.equal(unsafe.stderr, 'SCHEDULER_CUTOVER_FAILED\n', sentinel + ' safe generic error');
    var primaryClose = taoKhoTam(), primaryCloseCount = 0;
    var primaryCloseReal = primaryClose.kho.dong.bind(primaryClose.kho);
    primaryClose.kho.dong = function () {
      primaryCloseCount++;
      primaryCloseReal();
      throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'});
    };
    try {
      var legacyId = Number(primaryClose.kho.db.prepare(
        'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
      ).run('v23-cli-legacy', 'V23 CLI Legacy', 'h', 's', 1, 1).lastInsertRowid);
      primaryClose.kho.db.prepare(
        'INSERT INTO dq(' +
        'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
        'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
      var primaryWins = await cli.runCli(['--db', primaryClose.file, '--action', 'cutover'], {
        makeOwnerId: function () { return '00000000-0000-4000-8000-000000000603'; },
        clock: fakeClock(NOW_MS),
        openKho: function () { return primaryClose.kho; }
      });
      assert.equal(primaryWins.stderr, 'CANONICAL_STATE_INVALID\n', sentinel + ' primary over close');
      assert.equal(primaryCloseCount, 1, sentinel + ' primary close attempted');
    } finally { removeDb(primaryClose.file); }
    var closeDb = taoKhoTam(), closeCount = 0, realClose = closeDb.kho.dong.bind(closeDb.kho);
    closeDb.kho.dong = function () {
      closeCount++;
      realClose();
      throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'});
    };
    var closeOnly = await cli.runCli(['--db', closeDb.file, '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000604'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { return closeDb.kho; }
    });
    assert.equal(closeOnly.exitCode, 1, sentinel + ' close-only exit');
    assert.equal(closeOnly.stdout, '', sentinel + ' close-only stdout');
    assert.equal(closeOnly.stderr, 'BAD_CLOSE\n', sentinel + ' close-only code');
    assert.equal(closeCount, 1, sentinel + ' close-only count');
    removeDb(closeDb.file);
    var out = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var err = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var mainResult = await cli.main(['--db', '/tmp', '--action', 'cutover'], {}, {stdout: out, stderr: err}, {});
    assert.equal(mainResult.exitCode, 1, sentinel + ' main result');
    assert.equal(process.exitCode, 1, sentinel + ' process exitCode');
    assert.equal(err.chunks.join(''), 'SCHEDULER_CLI_ARGS_INVALID\n', sentinel + ' main stderr');
  } finally {
    process.exitCode = priorExitCode;
  }
});

test('Task 6 v27 overlay exact null partial retains running lock without lifecycle calls', function () {
  var sentinel = 'TASK6V27_RED_008_EXACT_NULL_PARTIAL';
  var writerModule = require('../server/scheduler/writer.js');
  task6v27RequireFunction(writerModule, 'SchedulerWriter', sentinel, 'export.SchedulerWriter');
  task6v27RequireFunction(writerModule.SchedulerWriter.prototype, 'executeClaimedInCurrentUow', sentinel);
  var T = 1_800_010_081, accountId = 880_081, revision = 7, x = taoWorldSchedulerTam();
  try {
    x.clock.setS(T - 1);
    x.ownerId = '00000000-0000-4000-8000-000000000881';
    x.lease = layLease(x, x.ownerId);
    taoDqChoReconcile(x, accountId, revision);
    x.accountJob = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(x.lease, accountId, revision, T, x.clock.nowMs());
    }, {immediate: true});
    assert.ok(x.accountJob && x.accountJob.id, 'TASK6V27_FIXTURE_ACCOUNT_JOB_CREATED');
    var loaded = x.store.getById(x.accountJob.id);
    assert.equal(loaded.id, x.accountJob.id, 'TASK6V27_FIXTURE_ACCOUNT_JOB_LOADABLE');
    assert.equal(loaded.kind, 'ACCOUNT_ADVANCE', 'TASK6V27_FIXTURE_ACCOUNT_KIND');
    assert.equal(Number(loaded.aggregate_id), accountId, 'TASK6V27_FIXTURE_ACCOUNT_ID');
    assert.equal(Number(loaded.expected_revision), revision, 'TASK6V27_FIXTURE_ACCOUNT_REVISION');
    assert.equal(Number(loaded.scheduled_at_s), T, 'TASK6V27_FIXTURE_ACCOUNT_TARGET');
    installAdvanceServiceFixture(x);
    x.reducer = new EventReducer({kho: x.kho, world: x.world, store: x.store,
      clock: x.clock, advanceService: x.service});
    x.writer = new writerModule.SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
    x.clock.setS(T);
    var token = x.lease;
    x.writer.leaseToken = token;
    var forbidden = ['checkpointPartial', 'blockOwnedAccountAdvance', 'insertApplication',
      'finishResolved', 'completeApplied', 'completeAccountAdvanceAndScheduleSuccessor',
      'releaseBlockedAccountDependents'];
    var calls = {}, faultCalls = 0, recordJobCalls = 0;
    forbidden.forEach(function (name) {
      if (typeof x.store[name] === 'function') {
        calls[name] = 0;
        var real = x.store[name].bind(x.store);
        x.store[name] = function () { calls[name]++; return real.apply(null, arguments); };
      }
    });
    x.writer.callFaultHook = function () { faultCalls++; };
    var prepareCalls = 0, applyCalls = 0, effectSeen = null, beforeLock = null, afterLock = null, outcome = null;
    var prepared = {kind: 'partial', deferredExternal: false,
      advanceResult: {processed: 0, advancedToS: T, nextDueAtS: T, hasMoreDue: true, budgetExhausted: true}};
    x.reducer.prepare = function (mutation, executable) {
      prepareCalls++;
      assert.equal(executable.kind, 'ACCOUNT_ADVANCE', sentinel + ' branded account executable');
      assert.equal(executable.id, x.accountJob.id, sentinel + ' exact executable id');
      return prepared;
    };
    x.reducer.applyPrepared = function (mutation, actualPrepared) {
      applyCalls++;
      assert.equal(actualPrepared, prepared, sentinel + ' prepared identity');
      effectSeen = {checkpointRevision: null, saveReceipt: null};
      return effectSeen;
    };
    x.kho.trongGiaoDich(function () {
      var nowMs = x.clock.nowMs();
      var claimed = x.store.claimForResolution(
        token, x.accountJob.id, nowMs, 15_000, {allowFuturePending: true, nowS: T}
      );
      assert.ok(claimed && claimed.id, 'TASK6V27_FIXTURE_ACCOUNT_JOB_CLAIMED');
      assert.equal(claimed.id, x.accountJob.id, 'TASK6V27_FIXTURE_ACCOUNT_EXACT_CLAIM');
      beforeLock = task6v27LockProjection(task6v27RawJob(x.kho, claimed.id));
      var mutation = taoMutationTam(token, {value: 0}, nowMs);
      var originalRecordJob = mutation.recordJob;
      if (typeof originalRecordJob === 'function') {
        mutation.recordJob = function () {
          recordJobCalls++;
          return originalRecordJob.apply(this, arguments);
        };
      }
      outcome = x.world.trongMutationScheduler(mutation, function () {
        return x.writer.executeClaimedInCurrentUow(mutation, claimed, nowMs, {executionTargetS: T});
      });
      afterLock = task6v27LockProjection(task6v27RawJob(x.kho, claimed.id));
    }, {immediate: true});
    assert.equal(prepareCalls, 1, sentinel + ' prepare once');
    assert.equal(applyCalls, 1, sentinel + ' apply once');
    assert.equal(Object.getPrototypeOf(effectSeen), Object.prototype, sentinel + ' plain effect');
    assert.deepEqual(Object.keys(effectSeen), ['checkpointRevision', 'saveReceipt'], sentinel + ' exact key order');
    assert.equal(Object.getOwnPropertySymbols(effectSeen).length, 0, sentinel + ' no symbols');
    assert.deepEqual(effectSeen, {checkpointRevision: null, saveReceipt: null}, sentinel + ' exact null wrapper');
    assert.equal(outcome.partial, true, sentinel + ' partial outcome');
    assert.deepEqual(afterLock, beforeLock, sentinel + ' running lock unchanged');
    forbidden.forEach(function (name) { assert.equal(calls[name] || 0, 0, sentinel + ' zero ' + name); });
    assert.equal(recordJobCalls, 0, sentinel + ' zero recordJob');
    assert.equal(faultCalls, 0, sentinel + ' zero fault hook');
  } finally { x.dong(); }
});
// TASK6_V27_OVERLAY_TESTS_END
test('Task 6 v28 world constructor installs supplied scheduler and preserves legacy mode', function () {
  var sentinel = 'TASK6_V28_RED_WORLD_CONSTRUCTOR_NOT_INSTALLED';
  var clock = {nowMs: function () { return 1_700_000_000_000; }};
  var scheduler = {};
  ['assertLiveLease', 'replaceAccountAdvance', 'listDerivedJobsForAccount',
    'schedule', 'invalidateGlobalJob', 'prepareDeletedAccountJobResolution']
    .forEach(function (name) { scheduler[name] = function () {}; });
  var durable = new TheGioi({}, {clock: clock, scheduler: scheduler});
  var legacy = new TheGioi({}, {clock: clock});
  if (durable._scheduler !== scheduler || durable.scheduler !== scheduler) {
    throw new Error(sentinel);
  }
  assert.equal(legacy._scheduler, null);
  assert.equal(legacy.scheduler, null);
});

// Task 8 local-only quarantine CLI.  The fixture deliberately uses the
// maintenance cutover rather than writing scheduler_mode by hand.
var task8SchedulerCli = require('../tools/scheduler-cli.js');
function task8CliFixture(t) {
  var x = taoKhoTam();
  x.clock = {nowMs: function () { return 20_000; }};
  var cutover = require('../server/scheduler/cutover.js').runMaintenanceCutover;
  cutover({
    kho: x.kho,
    clock: x.clock,
    ownerId: '00000000-0000-4000-8000-000000000123'
  });
  x.store = new SchedulerStore(x.kho, x.clock);
  t.after(function () { dongKhoTam(x); });
  var lease = layLease(x, '00000000-0000-4000-8000-000000000124');
  x.kho.trongGiaoDich(function () {
    x.root = x.store.schedule(lease, globalJob('task8-cli-root', 30), x.clock.nowMs());
    x.kho.db.prepare(
      "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
      "error_code='PAYLOAD_INTEGRITY' WHERE id=?"
    ).run(x.clock.nowMs(), x.root.id);
    assert.equal(x.store.releaseLease(lease, x.clock.nowMs()), true);
  }, {immediate: true});
  return x;
}
function task8RunCli(x, args) {
  return task8SchedulerCli.runCli(args, {
    clock: x.clock,
    makeOwnerId: function () { return '00000000-0000-4000-8000-000000000125'; }
  });
}

test('Task 8 local CLI inspect is redacted and audited', function (t) {
  var x = task8CliFixture(t);
  var result = task8RunCli(x, [
    '--db', x.file, '--action', 'inspect', '--job', x.root.id
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    action: 'inspect', jobId: x.root.id.slice(0, 8), kind: 'PVP_RESOLVE',
    state: 'QUARANTINED', attempt: 0, scheduledAtS: 30,
    activeReplacement: null, replacementState: null
  });
  assert.equal(x.kho.db.prepare(
    "SELECT action FROM scheduler_audit WHERE action='CLI_INSPECT' ORDER BY id DESC LIMIT 1"
  ).get().action, 'CLI_INSPECT');
  assert.doesNotMatch(result.stdout, /payload_json|accountId|snapshot|token|error_message_safe/);
  assert.doesNotMatch(result.stdout, new RegExp(x.root.id));
});

test('Task 8 local CLI replay keeps root quarantined and creates audited replacement', function (t) {
  var x = task8CliFixture(t);
  var result = task8RunCli(x, [
    '--db', x.file, '--action', 'replay', '--job', x.root.id, '--nonce', 'task8-replay-01'
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(x.store.getById(x.root.id).state, 'QUARANTINED');
  var replacement = x.kho.db.prepare(
    'SELECT id,state,idempotency_key FROM event_jobs WHERE replay_of_job_id=?'
  ).get(x.root.id);
  assert.equal(replacement.state, 'PENDING');
  assert.equal(replacement.idempotency_key, 'manual-replay:' + x.root.id + ':task8-replay-01');
  assert.deepEqual(JSON.parse(result.stdout), {
    action: 'replay', jobId: x.root.id.slice(0, 8),
    replacement: replacement.id.slice(0, 8), state: 'PENDING'
  });
  assert.equal(x.kho.db.prepare(
    "SELECT action FROM scheduler_audit WHERE action='CLI_REPLAY' ORDER BY id DESC LIMIT 1"
  ).get().action, 'CLI_REPLAY');
  assert.equal(x.store.globalWatermarkS(), 30);
  assert.doesNotMatch(result.stdout, /payload_json|accountId|snapshot|token/);
});

test('Task 8 local CLI resolves a quarantined global poison by audited application', function (t) {
  var x = task8CliFixture(t);
  var result = task8RunCli(x, [
    '--db', x.file, '--action', 'resolve', '--job', x.root.id,
    '--reason', 'OPERATOR_CONFIRMED_INVALID'
  ]);
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(x.store.getById(x.root.id).state, 'CANCELLED');
  assert.equal(JSON.parse(x.kho.db.prepare(
    'SELECT result_json FROM event_applications WHERE job_id=?'
  ).get(x.root.id).result_json).code, 'OPERATOR_CONFIRMED_INVALID');
  assert.equal(x.store.globalWatermarkS(), null);
  assert.deepEqual(JSON.parse(result.stdout), {
    action: 'resolve', jobId: x.root.id.slice(0, 8), state: 'CANCELLED',
    resolved: true, neutralization: 'ALREADY_ABSENT'
  });
  assert.equal(x.kho.db.prepare(
    "SELECT action FROM scheduler_audit WHERE action='CLI_RESOLVE' ORDER BY id DESC LIMIT 1"
  ).get().action, 'CLI_RESOLVE');
  assert.doesNotMatch(result.stdout + result.stderr, /payload_json|accountId|snapshot|token/);
});

test('Task 8 local CLI rejects invalid arguments before it opens SQLite', function () {
  var opened = 0;
  var result = task8SchedulerCli.runCli([
    '--db', '/not/opened.db', '--action', 'replay',
    '--job', '00000000-0000-4000-8000-000000000126', '--nonce', 'UpperCase'
  ], {
    openKho: function () { opened += 1; throw new Error('MUST_NOT_OPEN'); },
    clock: {nowMs: function () { return 20_000; }},
    makeOwnerId: function () { return '00000000-0000-4000-8000-000000000125'; }
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.stderr, 'SCHEDULER_CLI_INVALID_NONCE\n');
  assert.equal(opened, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /UpperCase|not\/opened|token|payload/);
});

// BEGIN TASK9_CUTOVER_RECONCILE_TESTS
// These contract tests intentionally exercise the public Task-9 surfaces.  They
// are placed after the Task-6/8 fixtures so their RED state remains useful while
// the durable implementation lands in parallel.
var task9Cutover = require('../server/scheduler/cutover.js');
var task9Events = require('../server/scheduler/events.js');

function taoTask9CutoverFixture(options) {
  var arrivalAtS = options.overdueArrivalS === null ? options.cutoverAtS + 1 : options.overdueArrivalS;
  var x = taoPvpFixtureAt(arrivalAtS);
  var attacker = docState(x.kho, x.attacker);
  attacker.fleets[0].den_t = arrivalAtS;
  x.kho.q.dqLuuState.run(JSON.stringify(attacker), options.cutoverAtS, x.attacker);
  x.kho.db.exec('DELETE FROM event_applications; DELETE FROM event_jobs;');
  x.clock.setS(options.cutoverAtS);
  // taoPvpFixtureAt finishes by claiming its setup lease at arrival.  Cutover
  // deliberately moves this fixture back to T, so release that setup holder
  // before acquiring the independent maintenance lease under test.
  x.kho.trongGiaoDich(function () {
    // An overdue fixture's setup lease has already expired; a future fixture's
    // is still live after the deliberate clock rewind.  Either condition leaves
    // the maintenance acquisition below as the only relevant holder.
    x.store.releaseLease(x.lease, x.clock.nowMs());
  }, {immediate: true});
  x.leaseToken = layLease(x, '00000000-0000-4000-8000-000000000210');
  x.context = {
    kho: x.kho, store: x.store, world: x.world, clock: x.clock,
    cutoverAtS: options.cutoverAtS, leaseToken: x.leaseToken,
    ownerId: x.leaseToken.ownerId, reducer: x.reducer, advanceService: x.service
  };
  return x;
}

function task9RunCutover(x) {
  return task9Cutover.runCutoverWithLease(x.context);
}

function task9BeforeImage(kho) {
  return {
    dq: kho.db.prepare('SELECT * FROM dq ORDER BY tk').all(),
    ht: kho.db.prepare('SELECT * FROM ht ORDER BY td').all(),
    hamdang: kho.db.prepare('SELECT * FROM hamdang ORDER BY tkA,fid').all(),
    hamgiu: kho.db.prepare('SELECT * FROM hamgiu ORDER BY tkA,fid').all(),
    jobs: kho.db.prepare('SELECT * FROM event_jobs ORDER BY id').all(),
    applications: kho.db.prepare('SELECT * FROM event_applications ORDER BY idempotency_key').all(),
    meta: kho.db.prepare('SELECT * FROM scheduler_meta ORDER BY key').all(),
    lease: kho.db.prepare('SELECT * FROM scheduler_lease ORDER BY lease_name').all(),
    seed: kho.db.prepare("SELECT v FROM cauhinh WHERE k='combat_seed_key_v1'").get()
  };
}

function taoTask9BudgetFixture(count) {
  var cutoverAtS = 1800021500;
  var x = taoTask9CutoverFixture({overdueArrivalS: null, cutoverAtS: cutoverAtS});
  var state = datNoiTaiCungGiay(
    coDinhTimeline(docState(x.kho, x.attacker), cutoverAtS - 1), cutoverAtS, count
  );
  x.kho.q.dqLuuState.run(JSON.stringify(state), cutoverAtS - 1, x.attacker);
  return x;
}

test('Task 9 reconciles canonical state, not projections, and checkpoints a crash-resumable cursor', function () {
  var x = taoTask9CutoverFixture({overdueArrivalS: null, cutoverAtS: 1800021100});
  try {
    task9RunCutover(x);
    x.leaseToken = layLease(x, '00000000-0000-4000-8000-000000000211');
    x.kho.db.exec('DELETE FROM ht; DELETE FROM hamdang; DELETE FROM hamgiu;');
    var pages = 0;
    assert.throws(function () {
      task9Cutover.reconcileCanonicalState({
        kho: x.kho, store: x.store, world: x.world, clock: x.clock,
        leaseToken: x.leaseToken, pageSize: 1,
        onPageForTest: function () {
          pages += 1;
          if (pages === 1) throw new Error('TASK9_AFTER_COMMIT_CRASH');
        }
      });
    }, /TASK9_AFTER_COMMIT_CRASH/);
    var cursor = x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='reconcile_cursor'"
    ).get();
    assert.ok(cursor && cursor.value, 'the first committed page persists its cursor');
    task9Cutover.reconcileCanonicalState({
      kho: x.kho, store: x.store, world: x.world, clock: x.clock,
      leaseToken: x.leaseToken, pageSize: 1
    });
    assert.equal(x.kho.db.prepare(
      "SELECT COUNT(*) AS n FROM scheduler_meta WHERE key='reconcile_cursor'"
    ).get().n, 0);
    assert.ok(x.kho.db.prepare('SELECT COUNT(*) AS n FROM ht').get().n > 0);
    var wakes = x.kho.db.prepare(
      "SELECT d.tk,COUNT(j.id) AS n FROM dq d LEFT JOIN event_jobs j ON " +
      "j.kind='ACCOUNT_ADVANCE' AND j.aggregate_id=CAST(d.tk AS TEXT) " +
      "AND j.state IN ('PENDING','RETRY_WAIT','RUNNING') GROUP BY d.tk"
    ).all();
    wakes.forEach(function (row) { assert.equal(row.n, 1, 'one wake for revision ' + row.tk); });
  } finally { x.dong(); }
});

test('Task 9 imports a future canonical explicit interaction without creating an application', function () {
  var T = 1800020000;
  var x = taoTask9CutoverFixture({overdueArrivalS: null, cutoverAtS: T});
  try {
    assert.equal(task9RunCutover(x).mode, 'durable');
    assert.ok(x.kho.db.prepare(
      "SELECT 1 FROM event_jobs WHERE kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') AND scheduled_at_s>?"
    ).get(T), 'future outbound canonical ref remains imported');
    assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications').get().n, 0);
  } finally { x.dong(); }
});

test('Task 9 initializes the seed before overdue recovered-latest-state', function () {
  var T = 1800020000;
  var x = taoTask9CutoverFixture({overdueArrivalS: T - 100, cutoverAtS: T});
  try {
    var stages = [];
    x.context.onStageForTest = function (stage) { stages.push(stage); };
    var outcome = task9RunCutover(x);
    assert.equal(outcome.mode, 'durable');
    assert.match(x.kho.db.prepare("SELECT v FROM cauhinh WHERE k='combat_seed_key_v1'").get().v, /^[0-9a-f]{64}$/);
    assert.deepEqual(stages, ['seed-initialized', 'overdue-reducer', 'before-mode-durable', 'mode-durable']);
    assert.deepEqual(JSON.parse(x.kho.db.prepare(
      'SELECT result_json FROM event_applications ORDER BY idempotency_key LIMIT 1'
    ).get().result_json), {
      code: 'RECOVERED_LATEST_STATE', recoveredAtCutover: true,
      recovery: 'recovered-latest-state', originalScheduledAtS: T - 100, recoveredAtS: T
    });
  } finally { x.dong(); }
});

test('Task 9 converts an expired attempt-0 overdue RUNNING root into recovered-latest-state', function () {
  var T = 1800020800;
  var x = taoTask9CutoverFixture({overdueArrivalS: T - 100, cutoverAtS: T});
  try {
    var attacker = docState(x.kho, x.attacker);
    var owners = new Map();
    [x.attacker, x.target].forEach(function (accountId) {
      docState(x.kho, accountId).planets.forEach(function (planet) {
        owners.set(G.tdKey(planet.c), accountId);
      });
    });
    var root = task9Events.deriveExternalJobs(x.attacker, attacker, function (targetKey) {
      return owners.has(targetKey) ? owners.get(targetKey) : null;
    })[0];
    assert.ok(root, 'fixture provides the canonical overdue outbound root');
    var saved = x.kho.trongGiaoDich(function () {
      var job = x.store.schedule(x.leaseToken, root, x.clock.nowMs());
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RUNNING',attempt=0,locked_by=?,locked_generation=?," +
        'locked_until_ms=?,retry_at_ms=NULL WHERE id=?'
      ).run('00000000-0000-4000-8000-000000000219', 0, x.clock.nowMs() - 1, job.id);
      return job;
    }, {immediate: true});
    var outcome = task9RunCutover(x);
    assert.equal(outcome.recovered, 1);
    assert.equal(x.store.getById(saved.id).state, 'COMPLETED');
    assert.deepEqual(JSON.parse(x.kho.db.prepare(
      'SELECT result_json FROM event_applications WHERE job_id=?'
    ).get(saved.id).result_json), {
      code: 'RECOVERED_LATEST_STATE', recoveredAtCutover: true,
      recovery: 'recovered-latest-state', originalScheduledAtS: T - 100, recoveredAtS: T
    });
  } finally { x.dong(); }
});

function task9PrepareRaidAtCutover(x, T) {
  [x.attacker, x.target].forEach(function (accountId) {
    var state = docState(x.kho, accountId);
    state.now = T - 1;
    state.lastTick = T - 1;
    state.nextRaid = T;
    state.nextMaint = T + 9_000_000;
    if (state.baoTri) state.baoTri.nextAt = T + 9_000_000;
    x.kho.q.dqLuuState.run(JSON.stringify(state), T - 1, accountId);
  });
}

function task9RaidCanonicalImage(x) {
  return x.kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all().map(function (row) {
    return {tk: Number(row.tk), state: JSON.parse(row.state)};
  });
}

test('Task 9 raid preflight and actual cutover are repeatable without Math.random', function () {
  var T = 1800021200;
  var primary = taoTask9CutoverFixture({overdueArrivalS: null, cutoverAtS: T});
  var repeated = taoTask9CutoverFixture({overdueArrivalS: null, cutoverAtS: T});
  var random = Math.random;
  try {
    task9PrepareRaidAtCutover(primary, T);
    // Independent fixture construction contains unrelated generated universe
    // metadata.  Copy the canonical input so this specifically proves the
    // preflight/actual raid decision is repeatable.
    task9RaidCanonicalImage(primary).forEach(function (row) {
      repeated.kho.q.dqLuuState.run(JSON.stringify(row.state), T - 1, row.tk);
    });
    Math.random = function () { throw new Error('TASK9_RAID_MATH_RANDOM_FORBIDDEN'); };
    var first = task9Cutover.preflightCutoverBudget(primary.context);
    var imported = primary.kho.db.prepare('SELECT COUNT(*) AS n FROM dq').get().n;
    assert.deepEqual(task9Cutover.preflightCutoverBudget(primary.context), first);
    assert.deepEqual(task9Cutover.preflightCutoverBudget(repeated.context), first);
    assert.deepEqual(task9RunCutover(primary), {mode: 'durable', imported: imported, recovered: 0});
    assert.deepEqual(task9RunCutover(repeated), {mode: 'durable', imported: imported, recovered: 0});
    assert.deepEqual(task9RaidCanonicalImage(repeated), task9RaidCanonicalImage(primary));
  } finally {
    Math.random = random;
    primary.dong(); repeated.dong();
  }
});

test('Task 9 switches scheduler mode atomically and restores the complete pre-effect image', function () {
  var x = taoTask9CutoverFixture({overdueArrivalS: null, cutoverAtS: 1800022100});
  try {
    var before = task9BeforeImage(x.kho);
    task9RunCutover(x);
    assert.equal(x.store.schedulerMode(), 'durable');
    assert.equal(task9Cutover.canRollbackDurableScheduler(x.kho), true);
    assert.deepEqual(task9Cutover.rollbackDurableScheduler({
      kho: x.kho, clock: x.clock, ownerId: '00000000-0000-4000-8000-000000000212'
    }), {mode: 'legacy', restored: true});
    assert.deepEqual(task9BeforeImage(x.kho), before);
  } finally { x.dong(); }
});

test('Task 9 refuses rollback after an application and preserves durable effects', function () {
  var x = taoTask9CutoverFixture({overdueArrivalS: 1800022190, cutoverAtS: 1800022200});
  try {
    task9RunCutover(x);
    assert.ok(x.kho.db.prepare('SELECT 1 FROM event_applications LIMIT 1').get());
    assert.equal(task9Cutover.canRollbackDurableScheduler(x.kho), false);
    assert.throws(function () {
      task9Cutover.rollbackDurableScheduler({
        kho: x.kho, clock: x.clock, ownerId: '00000000-0000-4000-8000-000000000213'
      });
    }, /DURABLE_EFFECT_ALREADY_APPLIED/);
    assert.equal(x.store.schedulerMode(), 'durable');
  } finally { x.dong(); }
});

test('Task 9 preflight accepts 50k, rejects 50001, and never consumes Math.random', function () {
  var exact = taoTask9BudgetFixture(50000);
  var overflow = taoTask9BudgetFixture(50001);
  var random = Math.random;
  try {
    Math.random = function () { throw new Error('TASK9_NONDETERMINISTIC_RNG'); };
    assert.deepEqual(task9Cutover.preflightCutoverBudget(exact.context), {
      ok: true, processed: 50000, nextDueAtS: null
    });
    var dry = task9Cutover.preflightCutoverBudget(overflow.context);
    assert.deepEqual(dry, {ok: false, processed: 50000, nextDueAtS: overflow.context.cutoverAtS});
    assert.throws(function () { task9RunCutover(overflow); }, /CUTOVER_PREFLIGHT_BUDGET_EXHAUSTED/);
    assert.equal(overflow.store.schedulerMode(), 'legacy');
    assert.equal(overflow.kho.db.prepare('SELECT COUNT(*) AS n FROM scheduler_cutover_snapshot').get().n, 0);
  } finally { Math.random = random; exact.dong(); overflow.dong(); }
});

test('Task 9 invalidates proven global orphans by application and sweeps deleted sources without stealing RUNNING work',
  function () {
  var x = taoTask9CutoverFixture({overdueArrivalS: null, cutoverAtS: 1800022300});
  try {
    task9RunCutover(x);
    var global = x.kho.db.prepare(
      "SELECT * FROM event_jobs WHERE kind='PVP_RESOLVE' ORDER BY sequence LIMIT 1"
    ).get();
    var source = docState(x.kho, x.attacker);
    source.fleets = [];
    x.kho.q.dqLuuState.run(JSON.stringify(source), x.context.cutoverAtS, x.attacker);
    x.leaseToken = layLease(x, '00000000-0000-4000-8000-000000000214');
    task9Cutover.reconcileCanonicalState({
      kho: x.kho, store: x.store, world: x.world, clock: x.clock, leaseToken: x.leaseToken
    });
    assert.equal(x.store.getById(global.id).state, 'CANCELLED');
    assert.equal(JSON.parse(x.kho.db.prepare(
      'SELECT result_json FROM event_applications WHERE job_id=?'
    ).get(global.id).result_json).code, 'MATCH_INVALIDATED');

    var running = x.kho.trongGiaoDich(function () {
      var runningJob = x.store.schedule(x.leaseToken, job(
        'task9-running-fence', x.context.cutoverAtS + 1, 100, {
          aggregateId: String(x.target),
          expectedRevision: Number(x.kho.q.dqGet.get(x.target).revision),
          payload: {schemaVersion: 1, accountId: x.target, nextLocalAtS: x.context.cutoverAtS + 1}
        }
      ), x.clock.nowMs());
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RUNNING',locked_by=?,locked_generation=?,locked_until_ms=? WHERE id=?"
      )
        .run(x.leaseToken.ownerId, x.leaseToken.generation, x.clock.nowMs() + 15000, runningJob.id);
      return runningJob;
    }, {immediate: true});
    x.kho.db.prepare('DELETE FROM dq WHERE tk=?').run(x.target);
    assert.throws(function () {
      task9Cutover.reconcileCanonicalState({
        kho: x.kho, store: x.store, world: x.world, clock: x.clock, leaseToken: x.leaseToken
      });
    }, /RECONCILE_UNRESOLVED_CANONICAL_ROWS/);
    assert.equal(x.store.getById(running.id).state, 'RUNNING');
  } finally { x.dong(); }
});

test('Task 9 writer reconciles after recovery and on the configured interval', async function () {
  var x = taoWriterFixture();
  var timers = taoBoHenGia(x.clock);
  var calls = 0;
  x.writer = new SchedulerWriter({
    ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
    advanceService: x.service, clock: x.clock, logger: silentLogger(), timers: timers,
    pollMs: 1000, leaseMs: 15000, reconcileIntervalMs: 1000, manualDrain: false,
    reconciler: {reconcile: function () { calls += 1; return {pages: 0, resumedFrom: null}; }}
  });
  try {
    await x.writer.start();
    assert.equal(calls, 1);
    x.clock.advanceMs(1000);
    await timers.chayDenHienTai();
    assert.equal(calls, 2);
  } finally { await x.writer.stop(100); x.dong(); }
});

test('Task 9 cutover CLI permits only cutover or rollback and emits safe exact summaries', async function () {
  var cli = require('./scheduler-cutover.js');
  assert.deepEqual(cli.parseArgs(['--db', '/tmp/task9.sqlite', '--action', 'rollback']), {
    dbPath: '/tmp/task9.sqlite', action: 'rollback'
  });
  assert.throws(function () {
    cli.parseArgs(['--db', '/tmp/task9.sqlite', '--action', 'inspect']);
  }, /SCHEDULER_CLI_ARGS_INVALID/);
  var x = taoKhoTam();
  try {
    var result = await cli.runCli(['--db', x.file, '--action', 'cutover'], {
      clock: fakeClock(NOW_MS), makeOwnerId: function () { return '00000000-0000-4000-8000-000000000215'; }
    });
    assert.deepEqual(JSON.parse(result.stdout), {action: 'cutover', mode: 'durable', imported: 0, recovered: 0});
    result = await cli.runCli(['--db', x.file, '--action', 'rollback'], {
      clock: fakeClock(NOW_MS), makeOwnerId: function () { return '00000000-0000-4000-8000-000000000216'; }
    });
    assert.deepEqual(JSON.parse(result.stdout), {action: 'rollback', mode: 'legacy', restored: true});
  } finally { dongKhoTam(x); }
});
// END TASK9_CUTOVER_RECONCILE_TESTS

function task8ReadyStatus(overrides) {
  return Object.assign({
    dbOpen: true, state: 'ready', reason: null, mode: 'durable',
    writerLeaseHeld: true, leaseHeld: true, recoveryComplete: true, draining: false,
    counts: {pending: 0, retryWait: 0, running: 0, quarantined: 0, dueBacklog: 0},
    ages: {oldestDueAgeMs: 0, nextEligibleAtMs: null},
    metrics: {jobAttempts: {}, jobDuration: {}, leaseAcquire: {}, reconcile: {}}
  }, overrides || {});
}

test('Task 8 readiness has a single stable precedence and exact thresholds', function () {
  var metrics = require('../server/scheduler/metrics.js');
  var options = {maxQuarantinedReady: 2, maxBacklogAgeMs: 500};
  [
    [{dbOpen: false}, 'SCHEDULER_DB_CLOSED'],
    [{state: 'fatal'}, 'SCHEDULER_STORAGE_FATAL'],
    [{state: 'crashed'}, 'SCHEDULER_CRASHED'],
    [{state: 'stopped'}, 'SCHEDULER_STOPPED'],
    [{counts: {pending: -1}}, 'SCHEDULER_STATUS_INVALID'],
    [{mode: 'legacy'}, 'SCHEDULER_MODE_LEGACY'],
    [{reason: 'SCHEDULER_LEASE_LOST'}, 'SCHEDULER_LEASE_LOST'],
    [{writerLeaseHeld: false}, 'SCHEDULER_LEASE_UNHELD'],
    [{recoveryComplete: false}, 'SCHEDULER_RECOVERING'],
    [{draining: true}, 'SCHEDULER_DRAINING'],
    [{counts: {pending: 0, retryWait: 0, running: 0, quarantined: 3, dueBacklog: 0}},
      'SCHEDULER_QUARANTINE_LIMIT'],
    [{ages: {oldestDueAgeMs: 501, nextEligibleAtMs: null}}, 'SCHEDULER_BACKLOG_AGE_LIMIT']
  ].forEach(function (row) {
    var decision = metrics.evaluateReadiness(task8ReadyStatus(row[0]), options);
    assert.deepEqual(decision, {ready: false, reason: row[1]}, row[1]);
  });
  assert.deepEqual(metrics.evaluateReadiness(task8ReadyStatus({
    counts: {pending: 0, retryWait: 0, running: 0, quarantined: 2, dueBacklog: 0},
    ages: {oldestDueAgeMs: 500, nextEligibleAtMs: null}
  }), options), {ready: true, reason: null});
});

test('Task 8 metrics use fixed labels and never expose scheduler identifiers', function () {
  var metrics = require('../server/scheduler/metrics.js');
  var status = task8ReadyStatus({
    metrics: {
      jobAttempts: {'ACCOUNT_ADVANCE|success': 2, 'secret-job-id': 999},
      jobDuration: {
        'ACCOUNT_ADVANCE|success': {count: 2, sum: 12, buckets: [1, 2, 2, 2, 2]},
        'secret-job-id': {count: 999, sum: 999, buckets: [999]}
      },
      leaseAcquire: {acquired: 1, unavailable: 0, error: 0, token: 99},
      reconcile: {success: 1, error: 0, accountId: 99},
      advanceProcessed: 3,
      advanceBudgetExhaustedTotal: 0,
      lastSuccessfulDrainTimestampMs: 20_000
    }
  });
  var rendered = metrics.renderMetrics(status);
  metrics.METRIC_FIELDS.filter(function (name) {
    return name !== 'scheduler_job_duration_ms';
  }).forEach(function (name) {
    assert.match(rendered, new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\{| )', 'm'));
  });
  assert.match(rendered,
    /^scheduler_job_duration_ms_bucket\{kind="ACCOUNT_ADVANCE",outcome="success",le="10"\} 1$/m);
  assert.match(rendered, /^scheduler_writer_lease_held 1$/m);
  assert.doesNotMatch(rendered, /secret-job-id|accountId|payload_json|token/);
});

test('Task 8 operational endpoints keep JSON gameplay and expose plaintext metrics', async function () {
  var fixture = await taoDurableApp('task8-operational-routes');
  try {
    var health = await get(fixture.app, '/healthz');
    assert.equal(health.status, 200);
    assert.equal(health.body, 'ok\n');
    var ready = await get(fixture.app, '/readyz');
    assert.deepEqual(ready.body, {ready: true, reason: null});
    var response = await get(fixture.app, '/metrics');
    assert.equal(response.status, 200);
    assert.equal(typeof response.body, 'string');
    assert.match(response.body, /^scheduler_writer_lease_held 1$/m);
    var registration = await post(fixture.app, '/api/dangky', {
      ten: 'task8routes', hienthi: 'Task Eight Routes', mk: PASSWORD
    });
    var state = await get(fixture.app, '/api/state', registration.body.token);
    assert.equal(state.status, 200);
    assert.equal(typeof state.body, 'object');
    assert.ok(state.body.st);
  } finally { await closeFixture(fixture); }
});

test('Task 8 durable option limits retain frozen base fields and reject invalid bounds', function () {
  var resolve = require('../server/scheduler/index.js').resolveDurableSchedulerOptions;
  var base = {schedulerPollMs: 900, schedulerLogTicks: false, cleanupMs: 60_000};
  var normalized = resolve(base, {
    SCHEDULER_LEASE_MS: '9000', SCHEDULER_RETRY_BASE_MS: '200',
    SCHEDULER_RETRY_MAX_MS: '5000', SCHEDULER_MAX_ATTEMPTS: '7',
    SCHEDULER_MAX_QUARANTINED_READY: '3', SCHEDULER_MAX_BACKLOG_AGE_MS: '20000',
    SCHEDULER_SHUTDOWN_GRACE_MS: '12000', SCHEDULER_RECONCILE_INTERVAL_MS: '2000'
  });
  assert.deepEqual(base, {schedulerPollMs: 900, schedulerLogTicks: false, cleanupMs: 60_000});
  assert.equal(normalized.leaseMs, 9000);
  assert.equal(normalized.maxQuarantinedReady, 3);
  assert.equal(normalized.maxBacklogAgeMs, 20000);
  assert.throws(function () {
    resolve(base, {SCHEDULER_LEASE_MS: '2000'});
  }, /SCHEDULER_LEASE_MS/);
  assert.throws(function () {
    resolve(base, {SCHEDULER_RETRY_BASE_MS: '2000', SCHEDULER_RETRY_MAX_MS: '1999'});
  }, /SCHEDULER_RETRY_MAX_MS.*base/);
  assert.throws(function () {
    resolve(base, {SCHEDULER_MAX_QUARANTINED_READY: '-1'});
  }, /SCHEDULER_MAX_QUARANTINED_READY/);
});

test('Task 8 local CLI resolve reports the bounded RETURNED neutralization', async function () {
  var T = 1800024200, x = taoDurableOrderFixture(T), root;
  try {
    var fleetId = x.addFleet(x.attacker, x.attackerHome, 'spy');
    var source = docState(x.kho, x.attacker);
    var target = docState(x.kho, x.target);
    source.planets[0].c = G.toaDo(8, 9, 6);
    target.planets[0].c = x.attackerHome;
    x.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?')
      .run(JSON.stringify(source), x.attacker);
    x.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?')
      .run(JSON.stringify(target), x.target);
    x.kho.db.prepare('DELETE FROM ht WHERE td=?').run(G.tdKey(x.attackerHome));
    x.installWriter();
    await x.writer.start();
    assert.deepEqual(await x.writer.runCommand({
      name: 'task8-cli-returned-fixture', accountId: x.attacker,
      run: function () { throw new Error('CLOSURE_MUST_NOT_RUN'); }
    }), {deferred: true, code: 'TICK_PARTIAL'});
    root = x.kho.db.prepare(
      "SELECT * FROM event_jobs WHERE kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
      "AND state='PENDING'"
    ).get();
    assert.ok(root);
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        x.writer.leaseToken, root.id, x.clock.nowMs(), 15000,
        {onlyEligible: true, nowS: T}
      );
      x.store.fail(x.writer.leaseToken, claimed, new Error('poison'),
        x.clock.nowMs(), x.writer.retryPolicy());
    }, {immediate: true});
    assert.equal(x.store.getById(root.id).state, 'QUARANTINED');
    await x.writer.stop(100);
    var resolved = task8RunCli(x, [
      '--db', x.file, '--action', 'resolve', '--job', root.id,
      '--reason', 'OPERATOR_CONFIRMED_INVALID'
    ]);
    assert.equal(resolved.exitCode, 0, resolved.stderr);
    assert.deepEqual(JSON.parse(resolved.stdout), {
      action: 'resolve', jobId: root.id.slice(0, 8), state: 'CANCELLED',
      resolved: true, neutralization: 'RETURNED'
    });
    var returned = docState(x.kho, x.attacker).fleets.find(function (fleet) {
      return Number(fleet.id) === Number(fleetId);
    });
    assert.equal(returned.pha, 've');
  } finally {
    if (x.writer) await (x.writer.stopFinalizePromise || x.writer.stop(100));
    x.dong();
  }
});

test('Task 8 rechecks readiness in the serialized tail before a queued closure', async function () {
  var T = 1800030000, x = taoDurableOrderFixture(T), release;
  var held = new Promise(function (resolve) { release = resolve; });
  try {
    x.installWriter();
    await x.writer.start();
    var blocker = x.writer.enqueue(function () { return held; }, true);
    var closureCalls = 0;
    var queued = x.writer.runCommand({
      name: 'task8-queued-readiness-race',
      run: function () { closureCalls += 1; }
    });
    var poison = x.store.schedule(
      x.writer.leaseToken, globalJob('task8-queued-poison', T), x.clock.nowMs()
    );
    x.kho.db.prepare(
      "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=? WHERE id=?"
    ).run(x.clock.nowMs(), poison.id);
    release();
    await blocker;
    await assert.rejects(queued, /SCHEDULER_QUARANTINE_LIMIT/);
    assert.equal(closureCalls, 0);
  } finally {
    release();
    if (x.writer) await x.writer.stop(100);
    x.dong();
  }
});

test('Task 8 stop closes new work while its captured pre-stop queue drains', async function () {
  var x = taoWriterFixture(), release, admittedCalls = 0;
  var held = new Promise(function (resolve) { release = resolve; });
  try {
    await x.writer.start();
    x.writer.tail = held;
    var admitted = x.writer.runCommand({
      name: 'task8-admitted-before-stop',
      run: function () { admittedCalls += 1; return 'committed'; }
    });
    var stopping = x.writer.stop(1000);
    var status = x.writer.status();
    assert.equal(status.ready, false);
    assert.equal(status.draining, true);
    assert.equal(status.state, 'stopping');
    assert.equal(status.reason, 'SCHEDULER_DRAINING');
    await assert.rejects(x.writer.runCommand({
      name: 'task8-after-stop-request', run: function () { throw new Error('must not run'); }
    }), /SCHEDULER_STOPPED/);
    release();
    assert.equal(await admitted, 'committed');
    assert.equal(admittedCalls, 1);
    await stopping;
    assert.equal(x.writer.status().state, 'stopped');
  } finally {
    release();
    await (x.writer.stopFinalizePromise || Promise.resolve());
    x.dong();
  }
});

test('Task 8 writer status is monotonic and falls back to its last safe fatal snapshot', async function () {
  var x = taoWriterFixture(), originalSnapshot;
  try {
    await x.writer.start();
    var safe = x.writer.status();
    var monotonicNow = x.clock.nowMs() + 1000;
    x.writer.lastEffectiveNowMs = monotonicNow;
    x.clock.setMs(monotonicNow - 500);
    var observedNowMs = null;
    originalSnapshot = x.store.statusSnapshot;
    x.store.statusSnapshot = function (nowMs) {
      observedNowMs = nowMs;
      return originalSnapshot.call(this, nowMs);
    };
    assert.equal(x.writer.status().ready, true);
    assert.equal(observedNowMs, monotonicNow);
    x.store.statusSnapshot = function () {
      var error = new Error('disk details must not escape');
      error.code = 'SQLITE_FULL';
      throw error;
    };
    var fatal = x.writer.status();
    assert.equal(fatal.ready, false);
    assert.equal(fatal.state, 'fatal');
    assert.equal(fatal.reason, 'SCHEDULER_STORAGE_FATAL');
    assert.deepEqual(fatal.counts, safe.counts);
    assert.doesNotMatch(JSON.stringify(fatal), /disk details/);
  } finally {
    if (originalSnapshot) x.store.statusSnapshot = originalSnapshot;
    await x.writer.stop(100);
    x.dong();
  }
});

test('Task 8 writer exports unavailable and error lease outcomes with fixed labels', async function () {
  var first = taoWriterFixture(), second = null, errored = null;
  try {
    await first.writer.start();
    second = new SchedulerWriter({
      ownerId: '00000000-0000-4000-8000-000000000191', store: first.store,
      world: first.world, reducer: first.reducer, advanceService: first.service,
      clock: first.clock, logger: silentLogger(), manualDrain: true
    });
    await second.start();
    var metrics = require('../server/scheduler/metrics.js');
    var unavailable = metrics.renderMetrics(second.status());
    assert.match(unavailable, /^scheduler_lease_acquire_total\{outcome="unavailable"\} 1$/m);
    assert.match(unavailable, /^scheduler_lease_acquire_total\{outcome="error"\} 0$/m);
    await second.stop(100);
    second = null;
    errored = taoWriterFixture();
    var realAcquire = errored.store.acquireLease;
    errored.store.acquireLease = function () {
      var error = new Error('retryable lease acquire');
      error.code = 'SQLITE_BUSY';
      throw error;
    };
    await assert.rejects(errored.writer.start(), /SQLITE_BUSY/);
    errored.store.acquireLease = realAcquire;
    var failed = metrics.renderMetrics(errored.writer.status());
    assert.match(failed, /^scheduler_lease_acquire_total\{outcome="unavailable"\} 0$/m);
    assert.match(failed, /^scheduler_lease_acquire_total\{outcome="error"\} 1$/m);
  } finally {
    if (second) await second.stop(100);
    if (errored) { await errored.writer.stop(100); errored.dong(); }
    await first.writer.stop(100);
    first.dong();
  }
});

// BEGIN TASK10_RELEASE_MATRIX_TESTS
// The child marker makes the package contract behavioral: its parent must run
// the actual scheduler test command, while the child cannot recursively spawn
// another package probe.
if (process.env.THDC_SCHEDULER_PACKAGE_PROBE === '1') {
  process.stdout.write('scheduler-package-probe\n');
}

function task10RunSchedulerPackageProbe() {
  var child = require('node:child_process').spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'test:scheduler'], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8',
      env: Object.assign({}, process.env, {
        THDC_SCHEDULER_PACKAGE_PROBE: '1', THDC_SCHEDULER_PACKAGE_CHILD: '1'
      })
    }
  );
  return child;
}

if (!process.env.THDC_SCHEDULER_PACKAGE_CHILD) {
  test('Task 10 package probe executes the scheduler suite through npm', function () {
    var child = task10RunSchedulerPackageProbe();
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /scheduler-package-probe/);
  });
}

test('Task 10 runtime floor accepts only concrete Node versions at or above 22.5', function () {
  var runtime = require('../server/runtime-version.js');
  assert.equal(runtime.supportsNodeSqlite('22.4.99'), false);
  assert.equal(runtime.supportsNodeSqlite('22.5.0'), true);
  assert.equal(runtime.supportsNodeSqlite('22.13.0'), true);
  assert.equal(runtime.supportsNodeSqlite('24.0.0'), true);
  assert.equal(runtime.supportsNodeSqlite('22.5.x'), false);
  assert.throws(function () { runtime.assertSupportedNode('22.4.99'); }, /NODE_VERSION_UNSUPPORTED/);
});

var TASK10_CRASH_SEED =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

function task10CrashFixture(point) {
  var x = taoWriterFixture({manualDrain: false});
  x.kho.cauhinh('combat_seed_key_v1', TASK10_CRASH_SEED);
  x.key = x.pvpJob.idempotency_key;
  x.writer.setFaultHook(function (stage) {
    if (stage !== point) return;
    var error = new Error('INJECTED_CRASH:' + point);
    error.code = 'INJECTED_CRASH';
    throw error;
  });
  return x;
}

async function task10CrashOutcome(x) {
  var job = x.store.getByIdempotencyKey(x.key);
  var app = x.kho.db.prepare(
    'SELECT result_json FROM event_applications WHERE idempotency_key=?'
  ).get(x.key);
  return {
    state: job.state,
    applications: x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
    ).get(x.key).n,
    result: app ? JSON.parse(app.result_json) : null,
    battleReports: x.kho.db.prepare('SELECT COUNT(*) AS n FROM tran').get().n,
    attacker: sha256(canonicalJson(task10Stable(task10CombatProjection(docState(x.kho, x.attacker))))),
    defender: sha256(canonicalJson(task10Stable(task10CombatProjection(docState(x.kho, x.target)))))
  };
}

function task10Stable(value) { return JSON.parse(JSON.stringify(value)); }

// Fixture databases intentionally allocate independent universe coordinates and
// display metadata.  Those are not combat inputs, so raw `dq.state` hashes are
// expected to differ across otherwise equivalent fixtures.  Retain every
// combat-relevant mutable field and remove only identity/location decoration.
function task10CombatProjection(state) {
  var planet = state.planets && state.planets[0] || {};
  return {
    // Economic production and timestamps advance during the recovered lease
    // interval.  The combat comparison deliberately retains only force/cargo
    // effects, which are invariant across recovery timing.
    tech: state.tech || {},
    planet: {ships: planet.ships || {}, def: planet.def || {}},
    fleets: (state.fleets || []).map(function (fleet) {
      return {mission: fleet.mission, ships: fleet.ships, linh: fleet.linh,
        cargo: fleet.cargo, pct: fleet.pct, pha: fleet.pha, giu: fleet.giu};
    }),
    missiles: (state.tenLua || []).map(function (missile) {
      return {n: missile.n};
    })
  };
}

test('Task 10 crash hooks recover to one deterministic terminal outcome', async function () {
  var points = ['before-claim', 'after-claim', 'after-application-insert',
    'after-game-mutation', 'before-job-completion'];
  var baseline = task10CrashFixture('never');
  var comparable = task10CrashFixture('never');
  try {
    var rawBaseline = {attacker: sha256(canonicalJson(docState(baseline.kho, baseline.attacker))),
      defender: sha256(canonicalJson(docState(baseline.kho, baseline.target)))};
    var rawComparable = {attacker: sha256(canonicalJson(docState(comparable.kho, comparable.attacker))),
      defender: sha256(canonicalJson(docState(comparable.kho, comparable.target)))};
    assert.notDeepEqual(rawBaseline, rawComparable,
      'independent universe fixtures differ before execution outside combat state');
    assert.deepEqual({attacker: task10CombatProjection(docState(baseline.kho, baseline.attacker)),
      defender: task10CombatProjection(docState(baseline.kho, baseline.target))},
    {attacker: task10CombatProjection(docState(comparable.kho, comparable.attacker)),
      defender: task10CombatProjection(docState(comparable.kho, comparable.target))},
    'crash fixtures begin with equivalent combat inputs');
    await baseline.writer.start();
    baseline.clock.setS(baseline.pvpJob.scheduled_at_s);
    await baseline.writer.drainNow();
    var expected = await task10CrashOutcome(baseline);
    assert.equal(expected.state, 'COMPLETED');
    assert.equal(expected.applications, 1);
    for (var point of points) {
      var x = task10CrashFixture(point);
      try {
        await x.writer.start();
        x.clock.setS(x.pvpJob.scheduled_at_s);
        await assert.rejects(x.writer.drainNow(), /INJECTED_CRASH/);
        var before = x.kho.db.prepare(
          "SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'"
        ).get();
        x.writer.simulateFatalCrashForTest();
        assert.equal(x.writer.status().wakeTimerActive, false);
        assert.equal(x.writer.status().heartbeatTimerActive, false);
        assert.equal(x.writer.status().reconcileTimerActive, false);
        assert.deepEqual(x.kho.db.prepare(
          "SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'"
        ).get(), before);
        x.kho.dong();
        x.clock.advanceMs(15001);
        x.kho = new Kho(x.file);
        apDungMigrationScheduler(x.kho, x.clock.nowMs());
        x.store = new SchedulerStore(x.kho, x.clock);
        x.world = new TheGioi(x.kho, {clock: x.clock, scheduler: x.store});
        x.service = new GameAdvanceService({kho: x.kho, world: x.world, store: x.store, clock: x.clock});
        x.world.datAdvanceService(x.service);
        x.reducer = new EventReducer({kho: x.kho, world: x.world, store: x.store,
          clock: x.clock, advanceService: x.service});
        x.writer = new SchedulerWriter({
          ownerId: '00000000-0000-4000-8000-000000000310', store: x.store,
          world: x.world, reducer: x.reducer, advanceService: x.service,
          clock: x.clock, logger: silentLogger(), manualDrain: true,
          pollMs: 1000, leaseMs: 15000, retryBaseMs: 1000, retryMaxMs: 300000, maxAttempts: 8
        });
        await x.writer.start();
        var recovered = x.store.getByIdempotencyKey(x.key);
        if (point === 'before-claim') {
          assert.equal(recovered.state, 'PENDING');
          assert.equal(recovered.attempt, 0);
        } else {
          assert.equal(recovered.state, 'RETRY_WAIT');
          assert.equal(recovered.attempt, 1);
          assert.equal(Number(recovered.retry_at_ms), x.clock.nowMs() + 1000 +
            deterministicJitter(recovered.id, 1));
          x.clock.setMs(Number(recovered.retry_at_ms));
        }
        await x.writer.drainNow();
        assert.deepEqual(await task10CrashOutcome(x), expected, point);
      } finally { await x.writer.stop(100); x.dong(); }
    }
  } finally {
    await comparable.writer.stop(100); comparable.dong();
    await baseline.writer.stop(100); baseline.dong();
  }
});

function task10DueRaidFixture() {
  var T = 1_800_000_000;
  var x = taoWriterFixture({manualDrain: true});
  var state = docState(x.kho, x.unrelatedAccount);
  state.now = T - 1;
  state.lastTick = T - 1;
  state.nextRaid = T;
  state.nextMaint = T + 9_000_000;
  state.baoTri.nextAt = T + 9_000_000;
  state.planets[0].ships = {fighterL: 250, cargoL: 20};
  state.planets[0].def = {};
  x.kho.q.dqLuuState.run(JSON.stringify(state), T - 1, x.unrelatedAccount);
  x.kho.cauhinh('combat_seed_key_v1', TASK10_CRASH_SEED);
  x.clock.setS(T);
  x.raidAtS = T;
  return x;
}

function task10RaidOutcome(x) {
  var accountId = String(x.unrelatedAccount);
  return {
    state: docState(x.kho, x.unrelatedAccount),
    applications: x.kho.db.prepare(
      'SELECT a.result_json FROM event_applications a JOIN event_jobs j ON j.id=a.job_id ' +
      'WHERE j.aggregate_id=? ORDER BY a.idempotency_key'
    ).all(accountId).map(function (row) { return JSON.parse(row.result_json); }),
    reports: x.kho.db.prepare('SELECT * FROM tran ORDER BY id').all()
  };
}

function task10RestartRaidWriter(x) {
  x.kho.dong();
  x.clock.advanceMs(15_001);
  x.kho = new Kho(x.file);
  apDungMigrationScheduler(x.kho, x.clock.nowMs());
  x.store = new SchedulerStore(x.kho, x.clock);
  x.world = new TheGioi(x.kho, {clock: x.clock, scheduler: x.store});
  x.service = new GameAdvanceService({
    kho: x.kho, world: x.world, store: x.store, clock: x.clock
  });
  x.world.datAdvanceService(x.service);
  x.reducer = new EventReducer({
    kho: x.kho, world: x.world, store: x.store, clock: x.clock,
    advanceService: x.service
  });
  x.writer = new SchedulerWriter({
    ownerId: '00000000-0000-4000-8000-000000000312', store: x.store,
    world: x.world, reducer: x.reducer, advanceService: x.service,
    clock: x.clock, logger: silentLogger(), manualDrain: true
  });
}

test('Task 10 due NPC raid is deterministic through rollback, restart, and local barrier advance',
  async function () {
    var baseline = task10DueRaidFixture();
    var recovered = task10DueRaidFixture();
    var local = task10DueRaidFixture();
    var random = Math.random;
    try {
      var input = docState(baseline.kho, baseline.unrelatedAccount);
      [recovered, local].forEach(function (x) {
        x.kho.q.dqLuuState.run(JSON.stringify(input), x.raidAtS - 1, x.unrelatedAccount);
      });
      Math.random = function () { throw new Error('TASK10_RAID_MATH_RANDOM_FORBIDDEN'); };
      await baseline.writer.start();
      assert.equal(baseline.kho.cauhinh('combat_seed_key_v1'), TASK10_CRASH_SEED);
      await baseline.writer.advanceTo(baseline.unrelatedAccount, baseline.raidAtS);
      var expectedAfterRaid = task10RaidOutcome(baseline);
      var incoming = docState(baseline.kho, baseline.unrelatedAccount).toi[0];
      if (incoming && Number.isSafeInteger(incoming.den_t)) {
        baseline.clock.setS(incoming.den_t);
        await baseline.writer.advanceTo(baseline.unrelatedAccount, incoming.den_t);
      }
      var expected = task10RaidOutcome(baseline);

      await recovered.writer.start();
      var originalRefresh = recovered.writer.refreshLeasePhaseInCurrentUow;
      recovered.writer.refreshLeasePhaseInCurrentUow = function (phase) {
        if (phase === 'before-advance-commit') {
          throw Object.assign(new Error('TASK10_RAID_ROLLBACK'), {code: 'INJECTED_CRASH'});
        }
        return originalRefresh.apply(this, arguments);
      };
      await assert.rejects(recovered.writer.advanceTo(recovered.unrelatedAccount, recovered.raidAtS),
        /TASK10_RAID_ROLLBACK/);
      assert.deepEqual(docState(recovered.kho, recovered.unrelatedAccount), input);
      recovered.writer.refreshLeasePhaseInCurrentUow = originalRefresh;
      recovered.writer.simulateFatalCrashForTest();
      task10RestartRaidWriter(recovered);
      await recovered.writer.start();
      await recovered.writer.advanceTo(recovered.unrelatedAccount, recovered.raidAtS);
      assert.deepEqual(task10RaidOutcome(recovered), expectedAfterRaid);
      var recoveredIncoming = docState(recovered.kho, recovered.unrelatedAccount).toi[0];
      if (recoveredIncoming && Number.isSafeInteger(recoveredIncoming.den_t)) {
        recovered.clock.setS(recoveredIncoming.den_t);
        await recovered.writer.advanceTo(recovered.unrelatedAccount, recoveredIncoming.den_t);
      }
      assert.deepEqual(task10RaidOutcome(recovered), expected);

      await local.writer.start();
      local.kho.trongGiaoDich(function () {
        var token = local.writer.leaseToken;
        var mutation = local.writer.newMutationContext(token, {value: 50_000}, local.clock.nowMs());
        local.world.trongMutationScheduler(mutation, function () {
          local.service.advanceLocalOnlyTo(mutation, local.unrelatedAccount, local.raidAtS,
            function () { return null; });
        });
      }, {immediate: true});
      assert.deepEqual(docState(local.kho, local.unrelatedAccount), expectedAfterRaid.state);
    } finally {
      Math.random = random;
      await local.writer.stop(100).catch(function () {}); local.dong();
      await recovered.writer.stop(100).catch(function () {}); recovered.dong();
      await baseline.writer.stop(100).catch(function () {}); baseline.dong();
    }
  });

test('Task 10 startup storage faults are terminal and leave no live writer timers', async function () {
  var codes = ['SQLITE_FULL', 'SQLITE_CORRUPT', 'SQLITE_NOTADB'];
  for (var phase of ['acquire', 'seed-recovery']) for (var code of codes) {
    var timers = taoBoHenGia({nowMs: function () { return 1_800_010_000_000; }});
    var x = taoWriterFixture({manualDrain: false, timers: timers});
    var before = x.kho.db.prepare(
      "SELECT owner_id,generation,expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get();
    var original = phase === 'acquire' ? x.store.acquireLease : x.reducer.initializeCombatSeed;
    try {
      if (phase === 'acquire') x.store.acquireLease = function () {
        throw Object.assign(new Error(code), {code: code});
      };
      else x.reducer.initializeCombatSeed = function () {
        throw Object.assign(new Error(code), {code: code});
      };
      await assert.rejects(x.writer.start(), new RegExp(code));
      var status = x.writer.status();
      assert.deepEqual({state: status.state, ready: status.ready, reason: status.reason}, {
        state: 'fatal', ready: false, reason: 'SCHEDULER_STORAGE_FATAL'
      }, phase + ':' + code);
      assert.equal(timers.soDangCho(), 0, phase + ':' + code + ':timers');
      await assert.rejects(x.writer.start(), /SCHEDULER_STORAGE_FATAL/);
      var leaseAfter = x.kho.db.prepare(
        "SELECT owner_id,generation,expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get();
      if (phase === 'acquire') assert.deepEqual(leaseAfter, before, code + ':acquire:lease');
      else assert.deepEqual(leaseAfter, {
        owner_id: x.writer.ownerId,
        generation: Number(before.generation) + 1,
        expires_at_ms: x.clock.nowMs() + x.writer.leaseMs
      }, code + ':seed-recovery:lease');
    } finally {
      if (phase === 'acquire') x.store.acquireLease = original;
      else x.reducer.initializeCombatSeed = original;
      await x.writer.stop(100).catch(function () {});
      x.dong();
    }
  }
});

test('Task 10 acceptance repeats cancellation and finishes stale revision terminally', function () {
  var now = 60000;
  var x = taoStoreTam({nowMs: function () { return now; }});
  var y = taoAccountAdvanceFixture(1700000030);
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000311');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('task10-cancel', 1, 100), now);
      x.store.cancel(lease, accountFixtureKey('task10-cancel'), 'SUPERSEDED', now);
      x.store.cancel(lease, accountFixtureKey('task10-cancel'), 'SUPERSEDED', now);
    }, {immediate: true});
    assert.equal(x.store.getByIdempotencyKey(accountFixtureKey('task10-cancel')).state, 'CANCELLED');
    y.kho.trongGiaoDich(function () {
      y.kho.db.prepare('UPDATE dq SET revision=revision+1 WHERE tk=?').run(y.attacker);
    }, {immediate: true});
    apDungPrepared(y, y.accountJob, {value: 50000});
    assert.equal(y.store.getByIdempotencyKey(y.accountJob.idempotency_key).state, 'CANCELLED');
  } finally { x.dong(); y.dong(); }
});
// END TASK10_RELEASE_MATRIX_TESTS
