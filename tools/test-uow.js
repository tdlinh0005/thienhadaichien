/* Regression contract for the deterministic clock, structured logger,
 * re-entrant database unit of work, and foundation scheduler bridge. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {taoClock} = require("../server/clock.js");
const {taoLogger} = require("../server/logger.js");
const {Kho} = require("../server/db.js");
const {taoScheduler} = require("../server/scheduler/contract.js");

const clock = taoClock({nowMs: () => 1700000000123});
assert.equal(clock.nowMs(), 1700000000123);
assert.equal(Math.floor(clock.nowMs() / 1000), 1700000000);

const records = [];
const sink = Object.fromEntries(
  ["debug", "info", "warn", "error"].map(level => [level, entry => records.push({level, entry})])
);
const logger = taoLogger(sink);
for (const level of ["debug", "info", "warn", "error"]) {
  assert.equal(typeof logger[level], "function");
}
assert.throws(() => logger.info(null), /structured log required/);
assert.throws(() => logger.info({event: "missing-at"}), /structured log required/);
assert.throws(() => logger.info({event: 7, at: clock.nowMs()}), /structured log required/);
const logInput = {
  event: "probe",
  at: clock.nowMs(),
  password: "root-secret",
  token: "root-token",
  state: {hidden: true},
  detail: {
    safe: "visible",
    auth: [{mk: "nested-password", salt: "nested-salt"}, {muoi: "nested-muoi"}],
    request: {body: {secret: true}}
  }
};
logger.info(logInput);
assert.deepEqual(records.at(-1), {
  level: "info",
  entry: {
    event: "probe",
    at: 1700000000123,
    password: "[redacted]",
    token: "[redacted]",
    state: "[redacted]",
    detail: {
      safe: "visible",
      auth: [{mk: "[redacted]", salt: "[redacted]"}, {muoi: "[redacted]"}],
      request: {body: "[redacted]"}
    }
  }
});
assert.equal(logInput.detail.auth[0].mk, "nested-password");

assert.throws(() => new Kho(":memory:"), /allowMemoryDb/);
const permittedMemory = new Kho(":memory:", {allowMemoryDb: true, clock, logger});
assert.equal(permittedMemory.clock, clock);
assert.equal(permittedMemory.logger, logger);
permittedMemory.dong();

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-uow-"));
const filePath = path.join(tempDir, "game.sqlite");
try {
  const fileKho = new Kho(filePath, {clock, logger});
  fileKho.cauhinh("persistence-probe", "kept");
  fileKho.dong();
  const reopened = new Kho(filePath, {clock, logger});
  assert.equal(reopened.cauhinh("persistence-probe"), "kept");
  reopened.dong();
} finally {
  fs.rmSync(tempDir, {recursive: true, force: true});
}

const transactionEvents = [];
const kho = new Kho(":memory:", {
  allowMemoryDb: true,
  clock,
  logger,
  onTransaction: event => transactionEvents.push(event)
});
assert.equal(Kho.prototype.giaoDich, Kho.prototype.trongGiaoDich);
const nestedResult = kho.trongGiaoDich(function () {
  return kho.trongGiaoDich(function () {
    kho.cauhinh("nested", "committed");
    return "nested-result";
  });
}, {immediate: true});
assert.equal(nestedResult, "nested-result");
assert.equal(kho.cauhinh("nested"), "committed");
assert.deepEqual(transactionEvents, ["begin-immediate", "commit"]);

transactionEvents.length = 0;
kho.trongGiaoDich(function () {
  kho.trongGiaoDich(function () {
    kho.cauhinh("nested-immediate", "outer-mode-wins");
  }, {immediate: true});
});
assert.deepEqual(transactionEvents, ["begin", "commit"]);

transactionEvents.length = 0;
assert.throws(() => kho.trongGiaoDich(function () {
  return kho.trongGiaoDich(function () {
    kho.cauhinh("rollback", "no");
    throw new Error("nested failure");
  });
}), /nested failure/);
assert.equal(kho.cauhinh("rollback"), null);
assert.deepEqual(transactionEvents, ["begin", "rollback"]);

transactionEvents.length = 0;
assert.throws(() => kho.trongGiaoDich(function () {
  kho.cauhinh("async", "no");
  return Promise.resolve("forbidden");
}), /UNIT_OF_WORK_ASYNC/);
assert.equal(kho.cauhinh("async"), null);
assert.deepEqual(transactionEvents, ["begin", "rollback"]);

function caughtNestedScenario(kind) {
  const events = [];
  const scenarioKho = new Kho(":memory:", {
    allowMemoryDb: true,
    onTransaction: event => events.push(event)
  });
  const original = kind === "ordinary" ? new Error("caught-nested-original") : null;
  let innerError;
  let outerError;
  try {
    scenarioKho.trongGiaoDich(function () {
      try {
        scenarioKho.trongGiaoDich(function () {
          scenarioKho.cauhinh(kind + "-nested", "must-rollback");
          if (original) throw original;
          return Promise.resolve("forbidden");
        });
      } catch (error) {
        innerError = error;
      }
      scenarioKho.cauhinh(kind + "-later", "must-also-rollback");
    });
  } catch (error) {
    outerError = error;
  }
  const failedEvents = events.slice();
  const nestedValue = scenarioKho.cauhinh(kind + "-nested");
  const laterValue = scenarioKho.cauhinh(kind + "-later");
  events.length = 0;
  scenarioKho.trongGiaoDich(() => scenarioKho.cauhinh(kind + "-fresh", "committed"));
  const result = {
    kind,
    sameError: outerError === innerError,
    innerMessage: innerError ? innerError.message : null,
    outerMessage: outerError ? outerError.message : null,
    code: outerError ? outerError.code || null : null,
    failedEvents,
    nestedValue,
    laterValue,
    freshEvents: events.slice(),
    freshValue: scenarioKho.cauhinh(kind + "-fresh")
  };
  scenarioKho.dong();
  return result;
}

const caughtNestedResults = [caughtNestedScenario("ordinary"), caughtNestedScenario("async")];
assert.deepEqual(caughtNestedResults, [
  {
    kind: "ordinary",
    sameError: true,
    innerMessage: "caught-nested-original",
    outerMessage: "caught-nested-original",
    code: null,
    failedEvents: ["begin", "rollback"],
    nestedValue: null,
    laterValue: null,
    freshEvents: ["begin", "commit"],
    freshValue: "committed"
  },
  {
    kind: "async",
    sameError: true,
    innerMessage: "UNIT_OF_WORK_ASYNC",
    outerMessage: "UNIT_OF_WORK_ASYNC",
    code: "UNIT_OF_WORK_ASYNC",
    failedEvents: ["begin", "rollback"],
    nestedValue: null,
    laterValue: null,
    freshEvents: ["begin", "commit"],
    freshValue: "committed"
  }
]);

const observerEvents = [];
const observerError = new Error("commit observer failed");
let throwOnCommit = true;
const observerKho = new Kho(":memory:", {
  allowMemoryDb: true,
  onTransaction: event => {
    observerEvents.push(event);
    if (event === "commit" && throwOnCommit) throw observerError;
  }
});
const observedSql = [];
const realObserverExec = observerKho.db.exec.bind(observerKho.db);
observerKho.db.exec = function (sql) {
  observedSql.push(sql);
  return realObserverExec(sql);
};
let propagatedObserverError;
try {
  observerKho.trongGiaoDich(() => observerKho.cauhinh("observer-commit", "persisted"));
} catch (error) {
  propagatedObserverError = error;
}
assert.deepEqual({
  sameError: propagatedObserverError === observerError,
  events: observerEvents.slice(),
  sql: observedSql.slice(),
  value: observerKho.cauhinh("observer-commit")
}, {
  sameError: true,
  events: ["begin", "commit"],
  sql: ["BEGIN", "COMMIT"],
  value: "persisted"
});
throwOnCommit = false;
observerEvents.length = 0;
observedSql.length = 0;
observerKho.trongGiaoDich(() => observerKho.cauhinh("observer-fresh", "committed"));
assert.deepEqual(observerEvents, ["begin", "commit"]);
assert.deepEqual(observedSql, ["BEGIN", "COMMIT"]);
assert.equal(observerKho.cauhinh("observer-fresh"), "committed");
observerKho.dong();

transactionEvents.length = 0;
const compatibilityResult = kho.giaoDich(function () {
  kho.cauhinh("after-rollback", "committed");
  return 17;
}, {immediate: true});
assert.equal(compatibilityResult, 17);
assert.equal(kho.cauhinh("after-rollback"), "committed");
assert.deepEqual(transactionEvents, ["begin-immediate", "commit"]);

const bridge = taoScheduler({kho, clock, logger});
assert.deepEqual(Object.keys(bridge).sort(), [
  "advanceTo", "cancel", "getStatus", "reconcile", "runCommand", "schedule", "start", "stop"
]);
assert.deepEqual(bridge.getStatus(), {
  state: "ready",
  ready: true,
  writerLeaseHeld: true,
  mode: "bridge"
});
assert.equal(bridge.start() instanceof Promise, true);
assert.equal(bridge.stop() instanceof Promise, true);

transactionEvents.length = 0;
const commandResult = bridge.runCommand({
  name: "probe",
  run: () => {
    kho.cauhinh("bridge", "committed");
    return 23;
  }
});
assert.equal(commandResult, 23);
assert.equal(kho.cauhinh("bridge"), "committed");
assert.deepEqual(transactionEvents, ["begin-immediate", "commit"]);

transactionEvents.length = 0;
kho.trongGiaoDich(function () {
  bridge.runCommand({name: "nested-probe", run: () => kho.cauhinh("bridge-nested", "committed")});
});
assert.equal(kho.cauhinh("bridge-nested"), "committed");
assert.deepEqual(transactionEvents, ["begin", "commit"]);

transactionEvents.length = 0;
assert.throws(() => bridge.runCommand({name: "invalid"}), /invalid command/);
assert.deepEqual(transactionEvents, []);
let asyncCommandCalls = 0;
let bridgeAsyncError;
try {
  bridge.runCommand({
    name: "async",
    run: () => {
      asyncCommandCalls++;
      return Promise.resolve();
    }
  });
} catch (error) {
  bridgeAsyncError = error;
}
assert.equal(asyncCommandCalls, 1);
assert.equal(bridgeAsyncError && bridgeAsyncError.message, "UNIT_OF_WORK_ASYNC");
assert.equal(bridgeAsyncError && bridgeAsyncError.code, "UNIT_OF_WORK_ASYNC");
assert.deepEqual(transactionEvents, ["begin-immediate", "rollback"]);
kho.dong();

process.stdout.write("✓ clock/logger/UoW/scheduler contract\n");
