# Durable Event Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay quét `dq.keTiep` và timer authoritative bằng durable scheduler SQLite single-writer, đồng thời xử lý PvP đúng lát cắt thời gian arrival.

**Architecture:** `dq.state` tiếp tục là nguồn game canonical; `event_jobs` chỉ lưu wake record/idempotency và interaction liên tài khoản. `SchedulerWriter` sở hữu lease, MutationGate và outer Unit-of-Work; `GameAdvanceService` là đường duy nhất gọi `G.tick`. Các event local dùng `ACCOUNT_ADVANCE`, còn PvP và hook liên tài khoản dùng reducer explicit phía sau global barrier.

**Tech Stack:** Node.js >=22.5, CommonJS, `node:sqlite`/`DatabaseSync`, `node:crypto`, `node:http`, Node built-in test runner, SQLite temp file; không dependency runtime.

**Spec:** [durable scheduler design](../specs/2026-08-23-durable-event-scheduler-design.md), [quality and maintainability design](../specs/2026-08-23-quality-maintainability-design.md)

## Global Constraints

- Node runtime remains `>=22.5`; production uses only Node core plus SQLite through `node:sqlite`.
- `THDC_DB` selects the one shared game-and-scheduler database, defaulting to `server/data/thdc.db`; production must reject `:memory:`.
- Gameplay time is Unix epoch seconds (`*_at_s`, `st.now`, `st.lastTick`, `den_t`, `keTiep`); lease, retry, lock and operational timestamps are Unix epoch milliseconds (`*_at_ms`).
- `dq.state` is the only canonical copy of fleets and assets. `hamdang` and `hamgiu` are rebuildable projections and `event_jobs` must not duplicate inventory or fleet snapshots.
- Exactly one valid `global-writer` lease may mutate game state. All endpoint mutations, session/account/chat cleanup, gameplay commands, and state reads that advance time pass through `MutationGate`.
- Outer effects use one re-entrant `BEGIN IMMEDIATE`; state, projections, successor jobs, `event_applications`, and completion commit or roll back together. No `await`, network I/O, or nested transaction occurs inside it.
- A shared `options.remainingBudget` caps every `G.tick` reached during one drain/barrier at 50,000 game events total. A partial result never jumps `lastTick`/`now` past the last handled event.
- PvP snapshots are created only at arrival `T` after the global barrier, with a persisted HMAC key and an explicit 32-bit endian rule. No current wall-clock seed or launch-time defender/supporter snapshot is allowed.
- The only MVP operational HTTP endpoints are `/healthz`, `/readyz`, and `/metrics`. Quarantine inspection/replay/resolve is local `tools/scheduler-cli.js`, never an admin HTTP endpoint.
- Keep existing gameplay API payloads and URLs stable; before ready, gameplay routes return transient 503/retry feedback. UI never consumes scheduler job metadata.
- This work starts only after Quality Foundation Tasks 1–8 have merged (including `kho.trongGiaoDich`, factory, bridge and `test:scheduler`), and finishes before its UI/module-split Tasks 9–12. Quality Task 14 is the post-scheduler cross-contract check. The quality workstream owns the initial `server/app.js` factory and package/CI gates; this plan consumes its fixed `taoUngDung(options)`/clock/logger/UoW contract and coordinates every shared-file edit through the integration owner.

---

## Planned file structure and ownership

| Path | Status | Responsibility |
|---|---|---|
| `server/db.js` | Modify | Add only revision-aware prepared statements after Quality owns `trongGiaoDich`; never replace its UoW implementation. |
| `server/scheduler/migrations.js` | Create | Idempotent scheduler schema migration and schema-version bookkeeping. |
| `server/scheduler/store.js` | Create | Canonical JSON/hash, sequence allocation, lease, atomic claim, transition, idempotency, reconcile queries. |
| `server/scheduler/events.js` | Create | Stable external-reference derivation and local/external job factories from canonical state. |
| `server/scheduler/advance-service.js` | Create | Shared-budget advancement and global barrier orchestration. |
| `server/scheduler/reducers.js` | Create | `ACCOUNT_ADVANCE`, PvP reducer, snapshot/HMAC, invalidation and application records. |
| `server/scheduler/writer.js` | Create | Serialized MutationGate, drain loop, retry/backoff/quarantine, lease lifecycle. |
| `server/scheduler/index.js` | Create | Public quality-bridge adapter `taoScheduler(context)`; store and writer remain internal. |
| `server/scheduler/metrics.js` | Create | Fixed-cardinality Prometheus exposition and readiness summary. |
| `server/scheduler/cutover.js` | Create | Canonical import, reconciliation, overdue recovery and pre-effect rollback guard. |
| `js/fleet.js` | Modify | Event classifier, `BLOCKED_EXTERNAL`, partial `G.tick` contract and shared budget. |
| `server/world.js` | Modify | Clock injection, staging with outer UoW, revision/projection synchronization, explicit external reducer hook. |
| `server/api.js` | Modify | Gate all mutating/advancing calls and preserve existing response shapes. |
| `server/app.js` | Modify after quality factory lands | Inject scheduler, lifecycle/readiness routes, in-flight request accounting. |
| `server/index.js` | Modify | Production adapter: create/start/stop factory and signal handling only. |
| `tools/test-scheduler.js` | Modify/extend (created by Quality Task 7) | Node built-in scheduler unit/fault/cutover tests on temp SQLite. |
| `tools/test-server.js` | Modify | Factory, readiness, restart, HTTP mutation-gate integration tests. |
| `tools/test-tai.js` | Modify | Durable 60-account barrier/load regression. |
| `tools/scheduler-cli.js` | Create | Local redacted quarantine inspect/replay/resolve command. |
| `docs/MAY-CHU.md` | Modify | Cutover, rollback, metrics and local-CLI operational runbook. |
| `package.json` | Modify with quality integration owner | Add `test:scheduler`; make `npm test` include scheduler without adding runtime dependencies. |

## Shared interfaces

All later tasks use these exact names and shapes.

```js
// server/scheduler/store.js -- all state-changing methods below receive a
// live token and conditionally prove it in their SQL/UoW.
function SchedulerStore(kho, clock) {}
function assertSchedulerOwnerId(ownerId) {} // -> same UUID-v4 string or throws SCHEDULER_OWNER_ID_INVALID
SchedulerStore.prototype.acquireLease = function (ownerId, nowMs, leaseMs) {}; // -> LeaseToken|null
SchedulerStore.prototype.renewLease = function (leaseToken, nowMs, leaseMs) {}; // -> boolean
SchedulerStore.prototype.releaseLease = function (leaseToken, nowMs) {}; // -> boolean
SchedulerStore.prototype.claimNext = function (leaseToken, nowMs, watermarkS, lockMs) {}; // -> Job|null
SchedulerStore.prototype.schedule = function (leaseToken, job, nowMs) {}; // -> Job, idempotent by key/hash
SchedulerStore.prototype.getByIdempotencyKey = function (idempotencyKey) {}; // -> Job | null
SchedulerStore.prototype.completeApplied = function (leaseToken, job, application, nowMs) {};
SchedulerStore.prototype.fail = function (leaseToken, job, failure, nowMs) {}; // -> RETRY_WAIT | QUARANTINED
SchedulerStore.prototype.cancel = function (leaseToken, idempotencyKey, reason, nowMs) {};
SchedulerStore.prototype.replaceAccountAdvance = function (leaseToken, accountId, revision, nextLocalAtS, nowMs) {};
SchedulerStore.prototype.recoverExpiredRunning = function (leaseToken, nowMs) {}; // -> count
SchedulerStore.prototype.writeAudit = function (leaseToken, action, jobId, detailSafe, nowMs) {};
SchedulerStore.prototype.assertLiveLease = function (leaseToken, nowMs) {}; // -> true or throws LEASE_LOST
SchedulerStore.prototype.peekEffectiveNowMs = function (wallNowMs) {}; // -> number, read-only
SchedulerStore.prototype.recordEffectiveNowMs = function (leaseToken, effectiveNowMs) {}; // -> number

// server/scheduler/writer.js
function SchedulerWriter(options) {}
SchedulerWriter.prototype.start = function () {}; // -> Promise<void>
SchedulerWriter.prototype.stop = function (graceMs) {}; // -> Promise<void>
SchedulerWriter.prototype.runCommand = function (command) {}; // command={name,accountId?,run}; run is synchronous
SchedulerWriter.prototype.drainNow = function () {}; // -> Promise<void>, testable one complete drain
SchedulerWriter.prototype.setFaultHook = function (hook) {}; // hook(stage, job), test-only; null disables it
SchedulerWriter.prototype.simulateFatalCrashForTest = function () {}; // clears timer; deliberately does not release lease
SchedulerWriter.prototype.status = function () {}; // -> readiness-safe object

// js/fleet.js
G.phanLoaiSuKienKe = function (st, ownerAccountId) {}; // -> { atS, order, scope: 'local'|'external', ref?: ExternalRef } | null
G.xuLyMotSuKien = function (st, atS, options) {}; // -> { processed: boolean, blockedExternal?: ExternalRef }
G.tick = function (st, targetS, options) {}; // -> AdvanceResult
G.TICK_PARTIAL = 'Đang tua thời gian; thử lại ngay.';

// server/scheduler/events.js
function deriveExternalJobs(accountId, state, targetAccountForKey) {} // -> Job[]

// server/scheduler/advance-service.js
function GameAdvanceService(options) {}
GameAdvanceService.prototype.advanceTo = function (leaseToken, accountId, targetS, options) {}; // -> AdvanceResult
GameAdvanceService.prototype.advanceBarrier = function (leaseToken, job, remainingBudget) {}; // -> AdvanceResult

// server/scheduler/reducers.js
function EventReducer(options) {}
EventReducer.prototype.initializeCombatSeed = function (leaseToken, effectiveNowMs) {}; // -> validated 64-char hex; must run inside outer UoW
EventReducer.prototype.reduce = function (leaseToken, job, remainingBudget) {}; // -> application; must run inside outer UoW
EventReducer.prototype.seedForJob = function (job) {}; // -> unsigned 32-bit integer; requires persisted key

// server/scheduler/index.js, supplied to the quality factory as schedulerFactory
// context accepts ownerId? or makeOwnerId?() only as an injectable test seam.
function taoScheduler(context) {} // -> SchedulerBridge
// SchedulerBridge: { start, stop, getStatus, runCommand, schedule, cancel, reconcile, advanceTo }
// command is exactly { name: string, accountId?: number, run: function () {} }; run must not return a Promise.

// server/app.js, supplied first by the quality workstream and extended here
function resolveSchedulerOptions(options, env) {} // -> { pollMs, leaseMs, logTicks, deprecatedAlias, deprecatedAliases, ... }
function taoUngDung(options) {} // -> { server, kho, tg, api, scheduler, start, stop, nhip, donRac, trangThai }
```

```js
/** @typedef {{
 *   kind: 'fleet', ownerAccountId: number, fleetId: number, launchAtS: number,
 *   targetKey: string, arrivalAtS: number,
 *   mission: 'attack'|'transport'|'spy'|'hold'|'deploy'
 * }} FleetExternalRef */
/** @typedef {{
 *   kind: 'missile', ownerAccountId: number, missileId: number, launchAtS: number,
 *   targetKey: string, arrivalAtS: number, mission: 'missile'
 * }} MissileExternalRef */
/** @typedef {FleetExternalRef|MissileExternalRef} ExternalRef */
/** @typedef {{ ownerId: string, generation: number }} LeaseToken */
/** @typedef {{
 *   processed: number, advancedToS: number, nextDueAtS: number|null,
 *   hasMoreDue: boolean, budgetExhausted: boolean,
 *   blockedExternal?: ExternalRef
 * }} AdvanceResult */
```

`Job` uses `scheduled_at_s` for game time and `retry_at_ms` for retry eligibility. A `FleetExternalRef` never contains ships, inventory, names, token, or combat snapshot. A `MissileExternalRef` is equally minimal. New missiles persist `diLuc: st.now`; for a legacy persisted missile without `diLuc`, `deriveExternalJobs` derives `launchAtS` deterministically as `khi - G.tgTenLua(Math.abs(den.h - tu.h))`. `deriveExternalJobs` creates `PVP_RESOLVE` only for a fleet `attack`; it creates `EXTERNAL_RESOLVE` for fleet `transport`/`spy`/`hold`/`deploy` and for `missile`. It accepts `targetAccountForKey(targetKey)` so it can leave NPC/self-only arrivals local without using a projection as canonical evidence.

### Task 1: Establish the scheduler test harness and migration on the Quality UoW

**Files:**

- Create: `server/scheduler/migrations.js`
- Modify/extend: `tools/test-scheduler.js` (the Quality Task-7 file)
- Modify: `server/db.js:196-200` only if a revision-aware prepared statement is absent; do not alter `Kho.prototype.trongGiaoDich` or its `giaoDich` facade.

**Interfaces:**

- Consumes: `Kho`, `moDB`, and Quality Task-5 `Kho.prototype.trongGiaoDich(fn, { immediate: true })` from `server/db.js`.
- Produces: `apDungMigrationScheduler(kho, nowMs)`, plus reusable Node test helpers `taoKhoTam()` and `dongKhoTam()`; it does not produce a second transaction abstraction.

- [ ] **Step 1: Write the failing migration/UoW tests**

  Extend `tools/test-scheduler.js` with a temporary SQLite helper and tests that assert the required columns/tables, deterministic legacy feature mode, and rollback across game plus scheduler writes.

  ```js
  'use strict';
  var test = require('node:test');
  var assert = require('node:assert/strict');
  var fs = require('node:fs');
  var os = require('node:os');
  var path = require('node:path');
  var { Kho } = require('../server/db.js');
  var { apDungMigrationScheduler } = require('../server/scheduler/migrations.js');

  var soKhoTam = 0;
  function taoKhoTam() {
    var file = path.join(os.tmpdir(), 'thdc-scheduler-' + process.pid + '-' + Date.now() + '-' + (++soKhoTam) + '.db');
    ['','-wal','-shm'].forEach(function (suffix) { fs.rmSync(file + suffix, { force: true }); });
    return { kho: new Kho(file), file: file };
  }
  function dongKhoTam(x) {
    x.kho.dong();
    ['','-wal','-shm'].forEach(function (suffix) { fs.rmSync(x.file + suffix, { force: true }); });
  }

  test('migration adds dq.revision and durable scheduler tables atomically', function () {
    var x = taoKhoTam();
    apDungMigrationScheduler(x.kho, 1_700_000_000_000);
    var columns = x.kho.db.prepare('PRAGMA table_info(dq)').all();
    assert.ok(columns.some(function (c) { return c.name === 'revision'; }));
    assert.equal(x.kho.db.prepare("SELECT name FROM sqlite_master WHERE name='event_jobs'").get().name, 'event_jobs');
    assert.equal(x.kho.db.prepare("SELECT name FROM sqlite_master WHERE name='scheduler_audit'").get().name, 'scheduler_audit');
    assert.equal(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='schema_version'").get().value, '1');
    assert.equal(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get().value, 'legacy');
    dongKhoTam(x);
  });

  test('outer Unit-of-Work rolls back dq and event_jobs together', function () {
    var x = taoKhoTam();
    apDungMigrationScheduler(x.kho, 1);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.kho.db.prepare("INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('probe','1',1)").run();
        throw new Error('inject rollback');
      }, { immediate: true });
    }, /inject rollback/);
    assert.equal(x.kho.db.prepare("SELECT COUNT(*) AS n FROM scheduler_meta WHERE key='probe'").get().n, 0);
    assert.equal(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get().value, 'legacy');
    dongKhoTam(x);
  });
  ```

- [ ] **Step 2: Run the new test to verify it fails**

  Run: `node --test --test-name-pattern='migration|outer Unit' tools/test-scheduler.js`

  Expected: FAIL with `Cannot find module '../server/scheduler/migrations.js'`.

- [ ] **Step 3: Implement the minimal migration using the Quality transaction boundary**

  Add `server/scheduler/migrations.js`; use `PRAGMA table_info(dq)` before the one-time `ALTER TABLE`, then put all DDL and metadata in Quality's one synchronous outer UoW:

  ```js
  function apDungMigrationScheduler(kho, nowMs) {
    return kho.trongGiaoDich(function () {
      var dqColumns = kho.db.prepare('PRAGMA table_info(dq)').all();
      if (!dqColumns.some(function (column) { return column.name === 'revision'; })) {
        kho.db.exec('ALTER TABLE dq ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
      }
      kho.db.exec([
        'CREATE TABLE IF NOT EXISTS scheduler_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at_ms INTEGER NOT NULL)',
        "CREATE TABLE IF NOT EXISTS scheduler_lease (lease_name TEXT PRIMARY KEY CHECK (lease_name='global-writer'), owner_id TEXT NOT NULL, expires_at_ms INTEGER NOT NULL, heartbeat_at_ms INTEGER NOT NULL, generation INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS event_jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, scheduled_at_s INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 100, sequence INTEGER NOT NULL UNIQUE, state TEXT NOT NULL CHECK (state IN ('PENDING','RUNNING','RETRY_WAIT','COMPLETED','CANCELLED','QUARANTINED')), idempotency_key TEXT NOT NULL UNIQUE, aggregate_type TEXT NOT NULL, aggregate_id TEXT NOT NULL, expected_revision INTEGER, payload_json TEXT NOT NULL, payload_sha256 TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL, retry_at_ms INTEGER, locked_by TEXT, locked_until_ms INTEGER, completed_at_ms INTEGER, cancelled_at_ms INTEGER, cancel_reason TEXT, quarantined_at_ms INTEGER, error_code TEXT, error_message_safe TEXT, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, CHECK (attempt >= 0 AND max_attempts >= 1))",
        'CREATE INDEX IF NOT EXISTS event_jobs_due_idx ON event_jobs(state, scheduled_at_s, priority, sequence, id)',
        'CREATE INDEX IF NOT EXISTS event_jobs_retry_idx ON event_jobs(state, retry_at_ms, priority, sequence, id)',
        'CREATE INDEX IF NOT EXISTS event_jobs_aggregate_idx ON event_jobs(aggregate_type, aggregate_id, state)',
        'CREATE TABLE IF NOT EXISTS event_applications (idempotency_key TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES event_jobs(id), effective_at_s INTEGER NOT NULL, applied_at_ms INTEGER NOT NULL, snapshot_json TEXT, snapshot_sha256 TEXT, result_json TEXT NOT NULL)',
        "CREATE TABLE IF NOT EXISTS scheduler_audit (id INTEGER PRIMARY KEY, action TEXT NOT NULL CHECK (action IN ('CLI_INSPECT','CLI_REPLAY','CLI_RESOLVE')), job_id TEXT NOT NULL, detail_safe TEXT NOT NULL, at_ms INTEGER NOT NULL)"
      ].join(';'));
      kho.db.prepare("INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('schema_version','1',?) ON CONFLICT(key) DO NOTHING").run(nowMs);
      kho.db.prepare("INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('scheduler_mode','legacy',?) ON CONFLICT(key) DO NOTHING").run(nowMs);
    }, { immediate: true });
  }
  ```

  The migration never generates a seed or imports jobs. `scheduler_meta.key` is the literal schema column everywhere; no `k` alias is introduced. The existing Quality `giaoDich` remains only its compatibility facade and is not modified here.

- [ ] **Step 4: Run the focused test to verify it passes**

  Run: `node --test --test-name-pattern='migration|outer Unit' tools/test-scheduler.js`

  Expected: PASS with two passing subtests and no leftover temp database.

- [ ] **Step 5: Commit the independently testable database foundation**

  ```bash
  git add server/db.js server/scheduler/migrations.js tools/test-scheduler.js
  git commit -m "feat: add durable scheduler schema migration"
  ```

### Task 2: Implement durable store primitives: sequence, lease, claim order, and idempotency

**Files:**

- Create: `server/scheduler/store.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: `Kho.prototype.trongGiaoDich`, scheduler tables from Task 1, and `{ nowMs: () => number }` clock.
- Produces: `SchedulerStore`, `assertSchedulerOwnerId`, `canonicalJson`, `sha256`, `schedule`, `acquireLease`, `renewLease`, `releaseLease`, `claimNext`, `completeApplied`, `writeAudit`, and `replaceAccountAdvance`.

- [ ] **Step 1: Write failing store tests for deterministic scheduling**

  Add tests for duplicate key/hash, conflicting duplicate payload, strict lease-expiry/takeover boundaries, conditional release by owner/generation, and CTE order across pending/retry jobs.

  ```js
  // Add beside the Task 1 imports in tools/test-scheduler.js.
  var { SchedulerStore } = require('../server/scheduler/store.js');

  function job(key, scheduledAtS, priority, overrides) {
    return Object.assign({
      kind: 'ACCOUNT_ADVANCE', scheduledAtS: scheduledAtS, priority: priority,
      idempotencyKey: key, aggregateType: 'account', aggregateId: '1',
      expectedRevision: 1, payload: { accountId: 1 }, maxAttempts: 8
    }, overrides || {});
  }
  function taoStoreTam(clock) {
    var x = taoKhoTam();
    x.clock = clock;
    apDungMigrationScheduler(x.kho, clock.nowMs());
    x.store = new SchedulerStore(x.kho, clock);
    x.dong = function () { dongKhoTam(x); };
    return x;
  }
  function danhDauRetry(kho, idempotencyKey, retryAtMs) {
    kho.db.prepare("UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=?,locked_by=NULL,locked_until_ms=NULL WHERE idempotency_key=?")
      .run(retryAtMs, idempotencyKey);
  }
  function layLease(x, ownerId) {
    var token = x.store.acquireLease(ownerId, x.clock.nowMs(), 15_000);
    assert.ok(token, 'lease phải acquire được trong fixture mới');
    return { ownerId: ownerId, generation: token.generation };
  }

  test('claim merges PENDING and RETRY_WAIT by eligible_at_ms', function () {
    var clock = { nowMs: function () { return 10_000; } };
    var x = taoStoreTam(clock);
    try {
      var lease = layLease(x, '00000000-0000-4000-8000-000000000001');
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, job('local-old', 8, 100), clock.nowMs());
        x.store.schedule(lease, job('retry-now', 1, 100), clock.nowMs());
      }, { immediate: true });
      danhDauRetry(x.kho, 'retry-now', 9_000);
      var claimed = x.kho.trongGiaoDich(function () {
        return x.store.claimNext(lease, 10_000, null, 15_000);
      }, { immediate: true });
      assert.equal(claimed.idempotency_key, 'local-old');
    } finally { x.dong(); }
  });

  test('same idempotency key accepts equal hash and rejects different payload', function () {
    var x = taoStoreTam({ nowMs: function () { return 1; } });
    try {
      var lease = layLease(x, '00000000-0000-4000-8000-000000000002'), first;
      x.kho.trongGiaoDich(function () {
        first = x.store.schedule(lease, job('same', 10, 100, { payload: { n: 1 } }), 1);
        assert.equal(x.store.schedule(lease, job('same', 10, 100, { payload: { n: 1 } }), 1).id, first.id);
        assert.throws(function () {
          x.store.schedule(lease, job('same', 10, 100, { payload: { n: 2 } }), 1);
        }, /IDEMPOTENCY_PAYLOAD_MISMATCH/);
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
      assert.equal(x.kho.db.prepare("SELECT generation FROM scheduler_lease WHERE lease_name='global-writer'").get().generation, oldLease.generation);
      now = 15_002; // expiry is strict: existing expires_at_ms=15_001 must be < nowMs
      var newLease = layLease(x, '00000000-0000-4000-8000-000000000004');
      assert.notEqual(newLease.generation, oldLease.generation);
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.completeApplied(oldLease, saved, { effectiveAtS: 1, result: { code: 'ok' } }, now);
        }, { immediate: true });
      }, /LEASE_LOST/);
      assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?').get('generation-job').n, 0);
      assert.equal(x.kho.db.prepare('SELECT state FROM event_jobs WHERE id=?').get(saved.id).state, 'PENDING');
      assert.equal(x.kho.trongGiaoDich(function () { return x.store.releaseLease(oldLease, now); }, { immediate: true }), false);
      assert.equal(x.kho.trongGiaoDich(function () { return x.store.releaseLease(newLease, now); }, { immediate: true }), true);
      assert.equal(x.kho.db.prepare("SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get().expires_at_ms, 0);
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
      assert.equal(x.kho.db.prepare("SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get().expires_at_ms, 15_100);
      assert.equal(x.kho.trongGiaoDich(function () {
        return x.store.releaseLease(current, now);
      }, { immediate: true }), true);
      assert.equal(x.kho.db.prepare("SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get().expires_at_ms, 0);
      var successor = layLease(x, '00000000-0000-4000-8000-000000000016');
      assert.equal(successor.generation, current.generation + 1);
    } finally { x.dong(); }
  });
  ```

- [ ] **Step 2: Run the store tests to verify they fail**

  Run: `node --test --test-name-pattern='claim merges|same idempotency|stale lease|releaseLease' tools/test-scheduler.js`

  Expected: FAIL with `Cannot find module '../server/scheduler/store.js'`.

- [ ] **Step 3: Implement store statements and return shapes**

  Canonicalize JSON by recursively sorting object keys before `JSON.stringify`, calculate `sha256` with `crypto.createHash('sha256')`, and allocate `sequence` in the caller's outer transaction. Export one UUID-v4 boundary validator from `store.js`, and call it in both `acquireLease` and the direct `SchedulerWriter` constructor before any DB work:

  ```js
  var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function assertSchedulerOwnerId(ownerId) {
    if (typeof ownerId !== 'string' || !UUID_V4.test(ownerId)) throw new Error('SCHEDULER_OWNER_ID_INVALID');
    return ownerId;
  }
  module.exports = { SchedulerStore: SchedulerStore, assertSchedulerOwnerId: assertSchedulerOwnerId };
  ```

  Every mutating store method begins with an `assertLiveLease(leaseToken, nowMs)` predicate within the same synchronous `kho.trongGiaoDich(..., { immediate: true })` UoW; `acquireLease` creates a token and `releaseLease` uses its own conditional expiry update. A zero-row lease predicate throws `LEASE_LOST`, causing the outer UoW to roll back before any game effect/application/job transition commits. Claim through one atomic CTE and add a watermark predicate only when `watermarkS !== null`.

  ```sql
  INSERT INTO scheduler_lease(lease_name,owner_id,expires_at_ms,heartbeat_at_ms,generation)
  VALUES('global-writer',:ownerId,:expiresAtMs,:nowMs,1)
  ON CONFLICT(lease_name) DO UPDATE SET
    owner_id=excluded.owner_id,
    expires_at_ms=excluded.expires_at_ms,
    heartbeat_at_ms=excluded.heartbeat_at_ms,
    generation=scheduler_lease.generation+1
  WHERE scheduler_lease.expires_at_ms < :nowMs
  RETURNING owner_id,generation;

  UPDATE scheduler_lease
  SET expires_at_ms=0, heartbeat_at_ms=:nowMs
  WHERE lease_name='global-writer'
    AND owner_id=:ownerId
    AND generation=:generation
    AND expires_at_ms>:nowMs
  RETURNING generation;
  ```

  ```sql
  WITH live_lease AS (
    SELECT 1 AS live
    FROM scheduler_lease
    WHERE lease_name='global-writer'
      AND owner_id=:ownerId
      AND generation=:generation
      AND expires_at_ms>:nowMs
  ), candidate AS (
    SELECT id
    FROM event_jobs
    WHERE (
      (state='PENDING' AND scheduled_at_s <= :nowS) OR
      (state='RETRY_WAIT' AND retry_at_ms <= :nowMs)
    )
      AND (locked_until_ms IS NULL OR locked_until_ms < :nowMs)
      AND (:watermarkS IS NULL OR scheduled_at_s <= :watermarkS)
    ORDER BY CASE WHEN state='RETRY_WAIT' THEN retry_at_ms ELSE scheduled_at_s * 1000 END,
             priority, sequence, id
    LIMIT 1
  )
  UPDATE event_jobs
  SET state='RUNNING', locked_by=:ownerId, locked_until_ms=:lockedUntil, updated_at_ms=:nowMs
  WHERE id=(SELECT id FROM candidate)
    AND state IN ('PENDING','RETRY_WAIT')
    AND (locked_until_ms IS NULL OR locked_until_ms < :nowMs)
    AND EXISTS (SELECT 1 FROM live_lease)
  RETURNING *;
  ```

  `acquireLease(ownerId, nowMs, leaseMs)` uses the exact strict predicate above: at equality the existing holder remains authoritative, and only `expires_at_ms < nowMs` increments the database `generation`. `releaseLease(leaseToken, nowMs)` uses the exact owner+generation conditional expiry above and returns false after loss/expiry; it never touches a newer holder, preserves the generation row, and therefore permits immediate takeover with generation incremented again. `ownerId` is one UUID for the whole factory/process lifetime; it is never inferred from PID or generation. A restarted/takeover writer receives a new owner UUID and a strictly larger database generation. `renewLease`, `claimNext`, `schedule`, `cancel`, `completeApplied`, `fail`, `recoverExpiredRunning`, `writeAudit`, and `replaceAccountAdvance` all take the full `{ ownerId, generation }` token and prove it live as shown above. `writeAudit` allowlists its action and persists only `action`, UUID job id, `detail_safe` and operation time; no payload/snapshot is copied. `recoverExpiredRunning` also uses that predicate before changing an expired `RUNNING` row to retry/quarantine. `replaceAccountAdvance(leaseToken, accountId, revision, nextLocalAtS, nowMs)` cancels only live `ACCOUNT_ADVANCE` jobs for that account with `SUPERSEDED`; when `nextLocalAtS === null`, it creates no replacement. Its key is `account-advance:<accountId>:<revision>:<nextLocalAtS>`.

- [ ] **Step 4: Run focused store tests to verify they pass**

  Run: `node --test --test-name-pattern='claim merges|same idempotency|stale lease generation|lease' tools/test-scheduler.js`

  Expected: PASS; takeover is refused at exact expiry equality and succeeds one millisecond later, release cannot remove a newer generation, retry ordering uses `retry_at_ms` rather than an independent query, and an old generation cannot insert an application or transition its job.

- [ ] **Step 5: Commit the store boundary**

  ```bash
  git add server/scheduler/store.js tools/test-scheduler.js
  git commit -m "feat: add durable scheduler store and lease claims"
  ```

### Task 3: Add local/external event classification and a correct partial `G.tick`

**Files:**

- Modify: `js/fleet.js:73-75`, `js/fleet.js:935-1072`
- Modify: `js/app.js:298-308`, `js/main.js:70-77`, `js/actions.js:186-192`
- Modify: `tools/smoke.js:203-230`, `tools/test-scheduler.js`

**Interfaces:**

- Consumes: existing `G.mocHamKe`, `G.hamToiDich`, `G.xuLySuKien`, and `G.sukienKe`.
- Produces: `G.phanLoaiSuKienKe(st)`, `G.BLOCKED_EXTERNAL(ref, atS)`, and `G.tick(st, targetS, { remainingBudget, allowExternalRef }) -> AdvanceResult`.

- [ ] **Step 1: Write failing timeline tests**

  Add a test with 50,001 same-second internal events, both the three-argument shared-budget path and the existing two-argument solo path, plus a fleet reference classified external in multiplayer mode.

  ```js
  // Add beside the earlier imports in tools/test-scheduler.js.
  var G = require('../server/rules.js').G;

  function gameWithEventsAt(atS, count) {
    var st = G.moiGame('Ngân sách', 'scheduler-budget-' + atS + '-' + count);
    var p = st.planets[0];
    st.now = atS - 1; st.lastTick = atS - 1;
    st.nextRaid = atS + 9_000_000;
    st.baoTri.nextAt = atS + 9_000_000;
    st.nextMaint = st.baoTri.nextAt;
    p.qB = Array.from({ length: count }, function () {
      return { id: 'metalMine', n: 1, xong: atS, tg: 0 };
    });
    return st;
  }
  function externalAttackState(atS) {
    var st = gameWithEventsAt(atS, 0), home = st.planets[0].c;
    st.fleets.push({
      id: st.fleetIdSeq++, pi: 0, tu: { g: home.g, h: home.h, p: home.p },
      den: { g: home.g, h: home.h + 1, p: home.p }, mission: 'attack',
      ships: { fighterL: 1 }, linh: {}, cargo: {}, pct: 100,
      diLuc: atS - 30, den_t: atS, veLuc: null, ve_t: null,
      pha: 'di', giu: 0, nl: 0, kc: 1, doiHuong: 0
    });
    return st;
  }

  test('G.tick leaves same-second work pending when shared budget is exhausted', function () {
    var st = gameWithEventsAt(2_000, 50_001);
    var budget = { value: 50_000 };
    var result = G.tick(st, 2_000, { remainingBudget: budget, multiplayer: true });
    assert.equal(result.budgetExhausted, true);
    assert.equal(result.processed, 50_000);
    assert.equal(G.phanLoaiSuKienKe(st).atS, 2_000);
    assert.equal(budget.value, 0);
  });

  test('two-argument solo tick continues same-second work without skipping it', function () {
    var st = gameWithEventsAt(2_000, 50_001);
    var first = G.tick(st, 2_000);
    assert.equal(first.budgetExhausted, true);
    assert.equal(first.nextDueAtS, 2_000);
    assert.equal(G.phanLoaiSuKienKe(st).atS, 2_000);
    var second = G.tick(st, 2_000);
    assert.equal(second.processed, 1);
    assert.equal(second.hasMoreDue, false);
  });

  test('multiplayer classifier returns a fleet ExternalRef without resolving it', function () {
    var oldHook = G.HOOK;
    G.HOOK = { oNguoi: function () { return { loai: 'nguoi', tk: 2, key: '1:2:4' }; } };
    try {
      var next = G.phanLoaiSuKienKe(externalAttackState(3_000), 1);
      assert.deepEqual(next.ref, {
        kind: 'fleet', ownerAccountId: 1, fleetId: 1, launchAtS: 2_970,
        targetKey: '1:2:4', arrivalAtS: 3_000, mission: 'attack'
      });
    } finally { G.HOOK = oldHook; }
  });
  ```

- [ ] **Step 2: Run the timeline test to verify it fails**

  Run: `node --test --test-name-pattern='same-second work|classified external' tools/test-scheduler.js`

  Expected: FAIL because current `G.tick` returns `undefined` and sets `st.lastTick = now` after its guard.

- [ ] **Step 3: Implement classifier and partial advance mechanics**

  Keep `G.sukienKe(st)` numeric for existing callers. Add `G.phanLoaiSuKienKe(st, ownerAccountId)` and `G.xuLyMotSuKien(st, atS, options)`: both choose exactly the next due primitive in the existing engine order, not merely a timestamp. Server callers supply the numeric owner ID through `tickOptions.ownerAccountId`; a browser-only call has no multiplayer external hook. It returns a stable `FleetExternalRef` for a player-targeted fleet `attack`, `transport`, `spy`, `hold`, or `deploy`, and a `MissileExternalRef` for a player-targeted missile; all others are `{ scope: 'local' }`. Add `diLuc: st.now` in `G.banTenLua`; the classifier derives the documented legacy-missile launch time only when that property is absent. Thread an optional third `options` argument through `G.tick`, `G.xuLyMotSuKien`, `G.hamToiDich`, `G.tenLuaToiDich`, and every external hook call.

  At one timestamp, preserve the old primitive order. `G.tick` executes local primitives that precede an external primitive at `T`; when that exact external primitive is next and `allowExternalRef` does not match it, return `BLOCKED_EXTERNAL` without mutating the fleet/missile or changing its arrival timestamp. It must not run a local primitive ordered after that external event until the reducer calls it again with the matching `allowExternalRef`. Thus a barrier snapshots at the precise point in the original event sequence, including local/external ties at the same second.

  ```js
  G.BLOCKED_EXTERNAL = function (ref, atS) {
    return { code: 'BLOCKED_EXTERNAL', ref: ref, atS: atS };
  };

  G.tick = function (st, targetS, options) {
    options = options || {};
    var budget = options.remainingBudget || { value: 50_000 }, processed = 0;
    // Continue when a prior two-argument call stopped at a due event whose
    // timestamp equals st.lastTick; do not use only `st.lastTick < targetS`.
    // Each successful G.xuLyMotSuKien decrements this exact shared object once.
    // At the end, never overwrite st.lastTick with targetS after a partial result.
    var next = G.phanLoaiSuKienKe(st, options.ownerAccountId);
    if (budget.value === 0 && next && next.atS <= targetS) {
      return { processed: processed, advancedToS: st.lastTick, nextDueAtS: next.atS,
      hasMoreDue: true, budgetExhausted: true };
    }
    return { processed: processed, advancedToS: st.lastTick,
      nextDueAtS: next ? next.atS : null, hasMoreDue: !!(next && next.atS <= targetS), budgetExhausted: false };
  }
  ```

  Preserve the two-argument solo contract, but do not preserve the current guard's skip. An omitted `options` allocates a fresh `{ value: 50_000 }`, returns an `AdvanceResult`, and leaves a same-second remainder due for the next two-argument call. Add a cooperative browser continuation so the result is not merely ignored:

  ```js
  // js/app.js
  APP._soloTickQueued = false;
  APP.tuaSolo = function () {
    if (!window.ST) return null;
    var result = G.tick(window.ST, G.giay());
    if (result && result.budgetExhausted && !APP._soloTickQueued) {
      APP._soloTickQueued = true;
      setTimeout(function () {
        APP._soloTickQueued = false;
        APP.tuaSolo(); U.live(); U.ve();
      }, 0);
    }
    return result;
  };
  // Replace both direct ticks in APP.batDauNhip with APP.tuaSolo().
  // js/main.js: replace G.tick(ST, G.giay()) in batDau with APP.tuaSolo().
  // js/actions.js
  G.chay = function (st, ten, dl) {
    var f = G.HANHDONG[ten], advanced;
    if (!f) return 'Hành động không tồn tại.';
    advanced = G.tick(st, G.giay());
    if (advanced && advanced.budgetExhausted) return G.TICK_PARTIAL;
    return f(st, dl || {}) || null;
  };
  // js/main.js's APP.lam schedules APP.tuaSolo() before returning G.TICK_PARTIAL to U.toast.
  ```

- [ ] **Step 4: Run the focused and legacy core tests**

  Run: `node --test --test-name-pattern='same-second work|two-argument solo|classified external' tools/test-scheduler.js && node tools/smoke.js`

  Expected: PASS; legacy smoke scenarios still complete with existing two-argument `G.tick` calls, and a 50,001st same-second primitive is reached by the scheduled follow-up rather than skipped.

- [ ] **Step 5: Commit the engine-only behavior boundary**

  ```bash
  git add js/fleet.js js/app.js js/main.js js/actions.js tools/smoke.js tools/test-scheduler.js
  git commit -m "feat: classify external events and preserve partial ticks"
  ```

### Task 4: Make world saves revisioned and synchronize canonical state with scheduler jobs

**Files:**

- Create: `server/scheduler/events.js`
- Modify: `server/db.js:196-200`
- Modify: `server/world.js:15-24`, `server/world.js:323-426`, `server/world.js:471-518`
- Modify: `tools/test-scheduler.js`, `tools/test-server.js`

**Interfaces:**

- Consumes: Task 2 `SchedulerStore.replaceAccountAdvance/schedule`, Task 3 `G.phanLoaiSuKienKe`, and existing `TheGioi._ghiNhieu` projection ordering.
- Produces: `deriveExternalJobs(accountId, state, targetAccountForKey)`, `TheGioi(kho, { clock, scheduler })`, revision-aware `dqLuu`, `TheGioi.prototype.datScheduler(schedulerStore)`, `TheGioi.prototype.trongMutationScheduler(leaseToken, fn)`, and `TheGioi.prototype.tick(accountId, targetS, dl, tickOptions)`. Here `schedulerStore` is the private store capability installed once by the writer/adapter, never a field exported by `taoUngDung`; every call carries the current `tickOptions.leaseToken`.

- [ ] **Step 1: Write failing state/job ownership tests**

  Test a save that changes a fleet from local to player attack: one `PVP_RESOLVE` is created from stable references, one local `ACCOUNT_ADVANCE` remains for the earliest local deadline, and a later save increments `dq.revision` exactly once and supersedes only the old account wake.

  ```js
  // Add beside the earlier imports in tools/test-scheduler.js.
  var { TheGioi } = require('../server/world.js');

  function taoDongHoS(startS) {
    var nowMs = startS * 1000;
    return {
      nowS: function () { return Math.floor(nowMs / 1000); },
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
    x.attacker = themTaiKhoan(x.kho, 'attacker-' + x.file, clock.nowS());
    x.target = themTaiKhoan(x.kho, 'target-' + x.file, clock.nowS());
    x.kho.trongGiaoDich(function () {
      x.world.taoDeQuoc(x.attacker, 'Attacker', { leaseToken: x.lease });
      x.world.taoDeQuoc(x.target, 'Target', { leaseToken: x.lease });
    }, { immediate: true });
    x.targetHome = docState(x.kho, x.target).planets[0].c;
    x.kho.trongGiaoDich(function () {
      x.world.luu(x.attacker, docState(x.kho, x.attacker), { leaseToken: x.lease });
      x.world.luu(x.target, docState(x.kho, x.target), { leaseToken: x.lease });
    }, { immediate: true });
    return x;
  }

  test('saving canonical state replaces only ACCOUNT_ADVANCE and derives one PvP job', function () {
    var x = taoWorldSchedulerTam();
    try {
      var priorRevision = Number(x.kho.q.dqGet.get(x.attacker).revision);
      var state = docState(x.kho, x.attacker);
      state.fleets.push(attackTo(state, x.targetHome));
      x.kho.trongGiaoDich(function () {
        x.world.luu(x.attacker, state, { leaseToken: x.lease });
      }, { immediate: true });
      var jobs = x.kho.db.prepare('SELECT kind,idempotency_key FROM event_jobs ORDER BY sequence').all();
      assert.equal(jobs.filter(function (j) { return j.kind === 'PVP_RESOLVE'; }).length, 1);
      var pvp = jobs.filter(function (j) { return j.kind === 'PVP_RESOLVE'; })[0];
      assert.match(pvp.idempotency_key, new RegExp('^pvp-resolve:[0-9a-f]{64}:' + (state.lastTick + 120) + '$'));
      assert.equal(jobs.filter(function (j) {
        return j.kind === 'ACCOUNT_ADVANCE' && j.idempotency_key.indexOf('account-advance:' + x.attacker + ':') === 0;
      }).length, 1);
      assert.equal(Number(x.kho.q.dqGet.get(x.attacker).revision), priorRevision + 1);
    } finally { x.dong(); }
  });
  ```

- [ ] **Step 2: Run the ownership test to verify it fails**

  Run: `node --test --test-name-pattern='replaces only ACCOUNT_ADVANCE' tools/test-scheduler.js`

  Expected: FAIL because `dq` has no prepared revision-aware update and no scheduler derivation is called from `_ghiNhieu`.

- [ ] **Step 3: Implement revision-aware staging and job derivation**

  Extend the `dqLuu` prepared statement to increment and return revision, keep all state/projection writes inside the existing outer `TheGioi` context, then call scheduler synchronization after `dq`, `ht`, `hamdang`, and `hamgiu` are staged.

  ```sql
  UPDATE dq
  SET state=?, diem=?, diemCT=?, diemNC=?, diemHam=?, diemThu=?,
      lastTick=?, keTiep=?, lm=?, soHT=?, capNhat=?, revision=revision+1
  WHERE tk=?
  RETURNING revision;
  ```

  `deriveExternalJobs(accountId, state, targetAccountForKey)` iterates only canonical `state.fleets`/`state.tenLua`, uses the discriminated `FleetExternalRef`/`MissileExternalRef`, and creates no inventory or combat snapshot. Its `targetAccountForKey` callback reads current ownership from `ht` only to classify the current target; it never reads fleet/supporter data from `hamdang` or `hamgiu`. It emits `PVP_RESOLVE` only for a fleet attack; it emits `EXTERNAL_RESOLVE` for player-targeted transport, spy, hold, deploy, and missile arrivals. New missiles use their persisted `diLuc`; legacy missiles use the deterministic derivation defined in Shared interfaces. Use `G.phanLoaiSuKienKe(state, accountId)` for local successor selection; exclude an external deadline from `ACCOUNT_ADVANCE` creation.

  For every derived external job, persist only its stable reference/revision. For attack, define `matchId` as the canonical JSON SHA-256 of `{ ownerAccountId, fleetId, launchAtS, targetKey, arrivalAtS, rule: 'pvp-v1' }` encoded lower-case hex, and use exactly `pvp-resolve:<matchId>:<arrival_at_s>` where `arrival_at_s` is the decimal `arrivalAtS`. Other interaction jobs use `external:<kind>:<ownerAccountId>:<entityId>:<launchAtS>:<arrivalAtS>`. On a save, cancel a still-live derived job only when its exact canonical reference no longer exists and it has no `event_applications` row; never cancel a running/retrying/quarantined global job merely because a later save no longer lists the fleet.

  `TheGioi` only stages `dq`, `ht`, `hamdang`, and `hamgiu`; `datScheduler(schedulerStore)` installs its one private Store after factory construction and rejects a different second store. That private capability receives the same outer UoW's `leaseToken` and calls `replaceAccountAdvance(leaseToken, ...)`, `schedule(leaseToken, ...)`, or `cancel(leaseToken, ...)`. `trongMutationScheduler(leaseToken, fn)` pushes that token on a synchronous private stack, calls `fn()`, and pops it in `finally`; `luu`/`tick` use an explicit `tickOptions.leaseToken` or that stack value, otherwise throw `MUTATION_GATE_REQUIRED`. The public app has only the Task-6 bridge. A stale token causes the enclosing save UoW to roll back, so a revision/projection save cannot commit without its successor/cancellation rows.

- [ ] **Step 4: Run state/job and existing server tests**

  Run: `node --test --test-name-pattern='replaces only ACCOUNT_ADVANCE|stale revision' tools/test-scheduler.js && node tools/test-server.js`

  Expected: PASS; projection rows still rebuild from `dq.state`, and no duplicate PvP job appears after a retrying save.

- [ ] **Step 5: Commit canonical ownership integration**

  ```bash
  git add server/db.js server/world.js server/scheduler/events.js tools/test-scheduler.js tools/test-server.js
  git commit -m "feat: synchronize revisioned world state with scheduler jobs"
  ```

### Task 5: Implement PvP global barrier, canonical supporter scan, and persisted HMAC snapshot

**Files:**

- Create: `server/scheduler/reducers.js`
- Create: `server/scheduler/advance-service.js`
- Modify: `server/world.js:208-224`, `server/world.js:521-756`
- Modify: `tools/test-scheduler.js`, `tools/test-server.js`

**Interfaces:**

- Consumes: `ExternalRef`, `SchedulerStore.completeApplied`, Task 3 `allowExternalRef`, Task 4 world staging, and Node `crypto`.
- Produces: `GameAdvanceService.advanceBarrier(leaseToken, job, remainingBudget)`, `EventReducer.initializeCombatSeed(leaseToken, effectiveNowMs)`, `EventReducer.reduce(leaseToken, job, remainingBudget)`, `EventReducer.seedForJob(job)`, `TheGioi.prototype.resolvePvpAt(ref, effectiveAtS, seed32)`, and `combat_seed_key_v1` initialization.

- [ ] **Step 1: Write failing barrier and snapshot tests**

  Include a defender change before `T`, a missing `hamgiu` projection row, and restart reuse of the HMAC seed. The admission-after-barrier acceptance test belongs to Task 6, where the real public MutationGate exists.

  ```js
  // Add beside earlier imports in tools/test-scheduler.js.
  var { GameAdvanceService } = require('../server/scheduler/advance-service.js');
  var { EventReducer } = require('../server/scheduler/reducers.js');

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
  function taoPvpFixtureAt(arrivalAtS) {
    var x = taoWorldSchedulerTam(), alliance = 'LienMinh' + x.target;
    x.clock.setS(arrivalAtS - 120);
    x.lease = layLease(x, '00000000-0000-4000-8000-000000000006');
    x.supporter = themTaiKhoan(x.kho, 'supporter-' + path.basename(x.file), x.clock.nowS());
    x.unrelatedAccount = themTaiKhoan(x.kho, 'unrelated-' + path.basename(x.file), x.clock.nowS());
    x.kho.trongGiaoDich(function () {
      x.world.taoDeQuoc(x.supporter, 'Supporter', { leaseToken: x.lease });
      x.world.taoDeQuoc(x.unrelatedAccount, 'Unrelated', { leaseToken: x.lease });
    }, { immediate: true });
    x.kho.q.lmThem.run(alliance, 'LM' + x.target, x.target, arrivalAtS - 90_000, null);
    x.kho.q.chienThemTK.run(x.attacker, x.target, arrivalAtS - 90_000);

    var defender = coDinhTimeline(docState(x.kho, x.target), arrivalAtS - 120);
    defender.lm = { ten: alliance };
    x.kho.trongGiaoDich(function () {
      x.world.luu(x.target, defender, { leaseToken: x.lease });
    }, { immediate: true });
    var supporter = coDinhTimeline(docState(x.kho, x.supporter), arrivalAtS - 120);
    supporter.lm = { ten: alliance };
    supporter.fleets.push(holdAt(supporter, x.targetHome, x.target, arrivalAtS));
    x.kho.trongGiaoDich(function () {
      x.world.luu(x.supporter, supporter, { leaseToken: x.lease });
    }, { immediate: true });
    var unrelated = coDinhTimeline(docState(x.kho, x.unrelatedAccount), arrivalAtS - 120);
    x.kho.trongGiaoDich(function () {
      x.world.luu(x.unrelatedAccount, unrelated, { leaseToken: x.lease });
    }, { immediate: true });
    var attacker = coDinhTimeline(docState(x.kho, x.attacker), arrivalAtS - 120);
    attacker.fleets.push(attackTo(attacker, x.targetHome));
    x.kho.trongGiaoDich(function () {
      x.world.luu(x.attacker, attacker, { leaseToken: x.lease });
    }, { immediate: true });
    var key = x.kho.db.prepare("SELECT idempotency_key FROM event_jobs WHERE kind='PVP_RESOLVE' ORDER BY sequence LIMIT 1").get().idempotency_key;
    x.pvpJob = x.store.getByIdempotencyKey(key);
    x.service = new GameAdvanceService({ kho: x.kho, world: x.world, store: x.store, clock: x.clock });
    x.reducer = new EventReducer({ kho: x.kho, world: x.world, store: x.store, clock: x.clock, advanceService: x.service });
    return x;
  }
  function giaiPvp(x) {
    x.kho.trongGiaoDich(function () {
      x.reducer.initializeCombatSeed(x.lease, x.clock.nowMs());
      x.reducer.reduce(x.lease, x.pvpJob, { value: 50_000 });
    }, { immediate: true });
    return x.kho.db.prepare('SELECT effective_at_s,snapshot_json FROM event_applications WHERE idempotency_key=?').get(x.pvpJob.idempotency_key);
  }
  function moLaiPvpFixture(x) {
    x.kho.dong();
    x.kho = new Kho(x.file);
    x.store = new SchedulerStore(x.kho, x.clock);
    x.world = new TheGioi(x.kho, { clock: x.clock, scheduler: x.store });
    x.service = new GameAdvanceService({ kho: x.kho, world: x.world, store: x.store, clock: x.clock });
    x.reducer = new EventReducer({ kho: x.kho, world: x.world, store: x.store, clock: x.clock, advanceService: x.service });
    x.pvpJob = x.store.getByIdempotencyKey(x.pvpJob.idempotency_key);
    return x;
  }

  test('PvP scans canonical supporter state and snapshots only at arrival T', function () {
    var x = taoPvpFixtureAt(1_800_008_000);
    try {
      var defender = docState(x.kho, x.target);
      defender.planets[0].ships.fighterL = 7; // legal change before T must enter snapshot
      x.kho.trongGiaoDich(function () {
        x.world.luu(x.target, defender, { leaseToken: x.lease });
      }, { immediate: true });
      x.kho.db.prepare('DELETE FROM hamgiu WHERE tkA=?').run(x.supporter);
      var app = giaiPvp(x), snapshot = JSON.parse(app.snapshot_json);
      assert.equal(app.effective_at_s, 1_800_008_000);
      assert.match(x.kho.cauhinh('combat_seed_key_v1'), /^[0-9a-f]{64}$/);
      assert.equal(snapshot.defender.planets[0].ships.fighterL, 7);
      assert.ok(snapshot.supporters.some(function (s) { return s.accountId === x.supporter; }));
    } finally { x.dong(); }
  });

  test('same match, arrival and persisted key produce the same 32-bit seed after restart', function () {
    var x = taoPvpFixtureAt(1_800_009_000);
    try {
      giaiPvp(x);
      var first = x.reducer.seedForJob(x.pvpJob);
      moLaiPvpFixture(x);
      assert.equal(x.reducer.seedForJob(x.pvpJob), first);
    } finally { x.dong(); }
  });
  ```

- [ ] **Step 2: Run barrier tests to verify they fail**

  Run: `node --test --test-name-pattern='canonical supporter|persisted key' tools/test-scheduler.js`

  Expected: FAIL because current `TheGioi.danhNguoi` uses `hamgiu` candidates plus horizon rebase and `G.hash(f.id + ':' + st.now + ':' + o.key)`.

- [ ] **Step 3: Implement explicit reducer and barrier**

  Remove the horizon/latest-state rebase branch from `TheGioi.danhNguoi`. The ordinary world hook must return `BLOCKED_EXTERNAL` outside reducer context. `GameAdvanceService.advanceBarrier` first identifies the attacker's ref and `T`, then scans all `dq.state` JSON rows ordered by account ID and fleet ID for the defender and eligible `hold` fleets. It advances attacker, defender, and each eligible supporter to the exact ordered primitive at `T` with one shared `{ value: 50_000 }`; it never reads `hamgiu` as membership. Rebuild projections, scan canonical states once more, and require the sorted participant/ref set to be identical before resolving. If any participant is already beyond `T`, write an audited temporal-invariant failure and quarantine the job; never rebase `T`.

  The barrier passes `{ ownerAccountId, remainingBudget, allowExternalRef: job.payload.ref }` only for the job's exact next external primitive. A local primitive tied at `T` remains before or after the snapshot according to Task 3's original engine order; no hook can run directly outside this reducer. `EventReducer.reduce` verifies job revision/reference against current canonical state, creates `MATCH_INVALIDATED` plus application when it is no longer valid, otherwise builds the immutable snapshot at `T` and completes its application in the same outer UoW.

  ```js
  function seed32(keyHex, matchId, arrivalAtS, schemaVersion) {
    var bytes = crypto.createHmac('sha256', Buffer.from(keyHex, 'hex'))
      .update(matchId + '|' + arrivalAtS + '|' + schemaVersion, 'utf8').digest();
    return bytes.readUInt32BE(0);
  }
  ```

  Define `EventReducer.initializeCombatSeed(leaseToken, effectiveNowMs)` as the only initialization seam. It first calls `store.assertLiveLease(leaseToken, effectiveNowMs)`, then performs `INSERT INTO cauhinh(k,v) VALUES('combat_seed_key_v1',?) ON CONFLICT(k) DO NOTHING` with `crypto.randomBytes(32).toString('hex')`, reads `kho.cauhinh('combat_seed_key_v1')`, and rejects anything other than 64 lower-case hex characters. `SchedulerWriter.start()` calls this exact seam after its successful acquire and before recovery; the Task-5 fixture calls the same seam in its lease-owned UoW. Standby code never calls it. Persist `snapshot_json` and `snapshot_sha256` before applying the seeded combat outcome; persist combat result, reports, `tran.khi`, bulletin, loot/debris, cooldowns, successor jobs, and the `event_applications` record with effective time `T` in that same UoW. `seedForJob` always computes from the persisted `cauhinh` key, `job.idempotency_key`, `T`, and schema version with `readUInt32BE(0)`; it never uses process state, `Date.now`, or launch-time defender/supporter data.

- [ ] **Step 4: Run focused barrier/restart tests**

  Run: `node --test --test-name-pattern='canonical supporter|persisted key|before T' tools/test-scheduler.js && node tools/test-server.js`

  Expected: PASS; projection deletion cannot remove a defender, the seed is persisted in `cauhinh`, and reports use `T`, not wall-clock time. Task 6 separately proves admission ordering at the public gate.

- [ ] **Step 5: Commit exact-timestamp PvP behavior**

  ```bash
  git add server/world.js server/scheduler/advance-service.js server/scheduler/reducers.js tools/test-scheduler.js tools/test-server.js
  git commit -m "feat: resolve PvP through durable global barriers"
  ```

### Task 6: Implement writer lifecycle, global watermark, retry/backoff, and quarantine behavior

**Files:**

- Create: `server/scheduler/writer.js`
- Create: `server/scheduler/index.js`
- Modify: `server/scheduler/store.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: Task 2 store functions, Task 5 reducer/advance service, and Quality clock/logger/UoW/bridge contracts.
- Produces: internal `SchedulerWriter`, public `taoScheduler(context)`, MutationGate through `scheduler.runCommand(command)`, `getStatus`, retry classification, deterministic backoff, and monotonic operational time.

- [ ] **Step 1: Write failing writer fault tests**

  Add tests for only-one-writer takeover, a retrying PvP holding watermark `T`, a poisoned local job not blocking another aggregate, a global poison holding readiness/barrier, recovery after crash between claim and effect, manual-drain timer behavior, and a post-barrier MutationGate command.

  ```js
  // Add beside earlier imports in tools/test-scheduler.js.
  var { SchedulerWriter } = require('../server/scheduler/writer.js');
  var { taoScheduler } = require('../server/scheduler/index.js');

  function silentLogger() {
    return { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
  }
  function taoWriterFixture() {
    var x = taoPvpFixtureAt(1_800_010_000);
    x.ownerId = '00000000-0000-4000-8000-000000000007';
    x.writer = new SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
    x.scheduler = taoScheduler({ writer: x.writer, store: x.store, world: x.world,
      clock: x.clock, logger: silentLogger() });
    return x;
  }
  test('direct SchedulerWriter construction rejects a non-UUID owner before DB work', function () {
    var x = taoPvpFixtureAt(1_800_010_000);
    try {
      var leaseBefore = x.kho.db.prepare("SELECT owner_id,generation,expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get();
      assert.throws(function () {
        return new SchedulerWriter({
          ownerId: 'writer-not-a-uuid', store: x.store, world: x.world, reducer: x.reducer,
          advanceService: x.service, clock: x.clock, logger: silentLogger(), pollMs: 1_000, leaseMs: 15_000
        });
      }, /SCHEDULER_OWNER_ID_INVALID/);
      assert.deepEqual(x.kho.db.prepare("SELECT owner_id,generation,expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get(), leaseBefore);
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
      assert.equal(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'RETRY_WAIT');
      assert.equal(x.writer.status().watermarkS, x.pvpJob.scheduled_at_s);
      assert.ok(docState(x.kho, x.unrelatedAccount).lastTick <= x.pvpJob.scheduled_at_s);
    } finally {
      await x.writer.stop(100);
      x.dong();
    }
  });

  test('MutationGate drains pending PvP at T before admitting the later command', async function () {
    var x = taoWriterFixture();
    try {
      var defenderBefore = docState(x.kho, x.target).planets[0].ships.fighterL;
      assert.equal(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'PENDING');
      x.clock.setS(x.pvpJob.scheduled_at_s); // expiry lets the real writer acquire a new generation at T
      await x.scheduler.start();
      await thayDoiSauBarrierQuaGate(x, 99);
      var application = x.kho.db.prepare('SELECT effective_at_s,snapshot_json FROM event_applications WHERE idempotency_key=?')
        .get(x.pvpJob.idempotency_key).snapshot_json;
      var snapshot = JSON.parse(application);
      assert.equal(x.kho.db.prepare('SELECT effective_at_s FROM event_applications WHERE idempotency_key=?')
        .get(x.pvpJob.idempotency_key).effective_at_s, x.pvpJob.scheduled_at_s);
      assert.equal(snapshot.defender.planets[0].ships.fighterL, defenderBefore);
      assert.equal(docState(x.kho, x.target).planets[0].ships.fighterL, 99);
    } finally {
      await x.scheduler.stop(100);
      x.dong();
    }
  });

  function taoWriterGia() {
    return {
      start: async function () {}, stop: async function () {}, getStatus: function () { return { state: 'ready' }; },
      runCommand: async function (command) { return command.run(); }, schedule: function () {}, cancel: function () {},
      reconcile: async function () {}, advanceTo: async function () {}, status: function () { return { state: 'ready' }; }
    };
  }
  test('adapter supplies one injectable process UUID to its writer', function () {
    var x = taoWriterFixture(), seen, expected = '00000000-0000-4000-8000-000000000001';
    try { taoScheduler({
      kho: x.kho, tg: x.world, store: x.store, advanceService: x.service, reducer: x.reducer,
      clock: x.clock, logger: silentLogger(),
      makeOwnerId: function () { return expected; },
      createWriter: function (options) { seen = options; return taoWriterGia(); }
    }); assert.equal(seen.ownerId, expected); }
    finally { x.dong(); }
  });
  ```

- [ ] **Step 2: Run writer tests to verify they fail**

  Run: `node --test --test-name-pattern='global retry|only-one-writer|crash between claim' tools/test-scheduler.js`

  Expected: FAIL with `Cannot find module '../server/scheduler/writer.js'`.

- [ ] **Step 3: Implement writer serialization and state transitions**

  `SchedulerStore` retains its constructor's `kho` as `this.kho`. At the direct writer boundary, import Task-2's single validator and reject a bad owner before constructing timers, acquiring a lease, or opening any UoW:

  ```js
  var { assertSchedulerOwnerId } = require('./store.js');
  function SchedulerWriter(options) {
    options = options || {};
    this.ownerId = assertSchedulerOwnerId(options.ownerId);
    this.store = options.store;
    this.clock = options.clock;
    this.lastEffectiveNowMs = 0;
    this.leaseToken = null;
  }
  ```

  `SchedulerWriter` uses one promise tail to serialize admitted work, but invokes each UoW callback synchronously through `kho.trongGiaoDich(fn, { immediate: true })`; no `await` occurs inside that callback. `manualDrain:true` is test mode: `start()` acquires/recoveries but creates neither a poll nor a wake timer, and only an explicit `drainNow()` executes a drain. Production leaves it false and schedules wake-up at `min(nextEligibleAtMs, effectiveNowMs + pollMs)`.

  Implement `effectiveNowMs` as `Math.max(lastEffectiveNowMs, clock.nowMs())`. The writer reads `store.peekEffectiveNowMs(clock.nowMs())` before lease acquire; after acquiring, every command/drain writes the selected value through `store.recordEffectiveNowMs(leaseToken, effectiveNowMs)` in its lease-verified UoW. It computes `nowS = Math.floor(effectiveNowMs / 1000)` only at that boundary. A backward clock therefore never lowers retry/lock/eligibility time or game `lastTick`.

  Compute the global watermark as the earliest `scheduled_at_s` among unresolved external interactions in `PENDING`, `RUNNING`, `RETRY_WAIT`, and `QUARANTINED`. Do not claim any job after this watermark; a retrying or quarantined global job therefore holds every account before its arrival `T`. Before invoking a player command, `runCommand(command)` synchronously drains/settles every eligible global barrier at or before its effective `nowS`. If such a barrier remains unresolved (including `RETRY_WAIT` whose `retry_at_ms` is still future), it rejects with `GLOBAL_BARRIER_PENDING` before calling `command.run`; the HTTP dispatcher maps that code to existing transient 503/retry feedback. Only after no barrier at or before `nowS` remains does it start one UoW, verify the current `{ ownerId, generation }`, call `world.trongMutationScheduler(leaseToken, command.run)`, and commit or roll back all staged state. `command.run` returning a Promise throws `UNIT_OF_WORK_ASYNC`. Local `ACCOUNT_ADVANCE` poison is isolated to its aggregate and cannot hold an unrelated account. Use retry math exactly below and an allowlisted error classification.

  ```js
  function deterministicJitter(id, attempt, maxJitterMs) {
    var text = String(id) + ':' + attempt, hash = 2166136261;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0) % (maxJitterMs + 1);
  }
  function retryAtMs(job, nowMs, baseMs, maxMs) {
    var delay = Math.min(maxMs, baseMs * Math.pow(2, job.attempt - 1));
    return nowMs + delay + deterministicJitter(job.id, job.attempt, 1000);
  }
  ```

  `MATCH_INVALIDATED` writes an application and `CANCELLED` state, thereby releasing the barrier. `QUARANTINED` is terminal storage but never releases a global aggregate watermark; only a successful replay application or explicit audited invalidation does. Expired `RUNNING` is returned to `RETRY_WAIT` with a deterministic retry timestamp; a new lease owner checks `event_applications` before re-running an effect. Each claim, recovery, retry, cancellation, application insertion and completion passes the same `{ ownerId, generation }` to Store; loss of generation raises `LEASE_LOST` and rolls back the effect UoW. `setFaultHook(stage, job)` runs synchronously at `before-claim`, `after-claim`, `after-application`, `after-mutation`, and `before-complete`; an `INJECTED_CRASH` error is rethrown so the test can simulate a process death rather than a normal retry.

  After `stop(graceMs)` has stopped admission/timers and its serialized tail has no in-flight UoW, it releases only the token it still owns in a final synchronous UoW. This is the sole normal-writer release path; a fatal-crash simulation intentionally skips it:

  ```js
  var token = this.leaseToken;
  if (token) {
    var releaseNowMs = Math.max(this.lastEffectiveNowMs, this.clock.nowMs());
    this.lastEffectiveNowMs = releaseNowMs;
    var released = this.store.kho.trongGiaoDich(function () {
      return this.store.releaseLease(token, releaseNowMs);
    }.bind(this), { immediate: true });
    if (released) this.leaseToken = null;
  }
  ```

  Add `server/scheduler/index.js` as the only public durable surface:

  ```js
  var crypto = require('node:crypto');
  var { SchedulerStore, assertSchedulerOwnerId } = require('./store.js');
  function taoScheduler(context) {
    context = context || {};
    var world = context.world || context.tg;
    var store = context.store || new SchedulerStore(context.kho, context.clock);
    if (world && typeof world.datScheduler === 'function') world.datScheduler(store);
    var advanceService = context.advanceService || new GameAdvanceService({
      kho: context.kho, world: world, store: store, clock: context.clock
    });
    var reducer = context.reducer || new EventReducer({
      kho: context.kho, world: world, store: store, clock: context.clock, advanceService: advanceService
    });
    var ownerId = assertSchedulerOwnerId(context.ownerId || (context.makeOwnerId || crypto.randomUUID)());
    var Writer = context.createWriter || SchedulerWriter;
    var writer = context.writer || new Writer({
      ownerId: ownerId,
      store: store, world: world, reducer: reducer,
      advanceService: advanceService, clock: context.clock, logger: context.logger,
      pollMs: context.schedulerPollMs, leaseMs: context.schedulerLeaseMs,
      logTicks: context.schedulerLogTicks
    });
    return {
      start: function () { return writer.start(); },
      stop: function (graceMs) { return writer.stop(graceMs); },
      getStatus: function () { return writer.status(); },
      runCommand: function (command) { return writer.runCommand(command); },
      schedule: function (job) { return writer.schedule(job); },
      cancel: function (idempotencyKey, reason) { return writer.cancel(idempotencyKey, reason); },
      reconcile: function () { return writer.reconcile(); },
      advanceTo: function (accountId, targetS) { return writer.advanceTo(accountId, targetS); }
    };
  }
  module.exports = { taoScheduler: taoScheduler };
  ```

  `taoScheduler` calls `crypto.randomUUID()` exactly once when `context.ownerId` is absent and retains that value in the writer for the process lifetime. `context.makeOwnerId` and `context.createWriter` are test seams only; production never derives owner identity from PID/environment. `taoScheduler` is handed to Quality's `schedulerFactory`; `taoUngDung` passes `ownerId: options.schedulerOwnerId` and `makeOwnerId: options.makeSchedulerOwnerId` only when a deterministic test injects them, exposes the returned bridge as `app.scheduler`, and never exports `writer` or `store`. `writer.schedule/cancel/reconcile/advanceTo` run through the same serialized, lease-verified UoW as `runCommand`.

- [ ] **Step 4: Run focused fault tests**

  Run: `node --test --test-name-pattern='global retry|MutationGate drains pending PvP|adapter supplies|only-one-writer|crash between claim|poison' tools/test-scheduler.js`

  Expected: PASS; retry uses `retry_at_ms`, the CTE ordering remains deterministic, and a new lease owner recovers expired `RUNNING` without treating the claim as proof of effect.

- [ ] **Step 5: Commit writer behavior**

  ```bash
  git add server/scheduler/index.js server/scheduler/writer.js server/scheduler/store.js tools/test-scheduler.js
  git commit -m "feat: add leased scheduler writer and quarantine handling"
  ```

### Task 7: Route API and world operations through MutationGate and the quality factory

**Files:**

- Modify: `server/api.js:59-124`, `server/api.js:126-430`
- Modify: `server/world.js:15-24`, `server/world.js:471-518`, `server/world.js:1359-1369`
- Modify: `server/app.js` (new factory supplied by quality workstream)
- Modify: `server/index.js:1-144`
- Modify: `tools/test-server.js`

**Interfaces:**

- Consumes: public `SchedulerBridge.runCommand(command)/getStatus()/start()/stop()`, `taoUngDung(options)`, injected `clock.nowMs()`, injected logger methods, and current API response shapes.
- Produces: gated API constructor `API(kho, tg, { clock, logger, releaseVersion, scheduler })`, factory lifecycle `{ start, stop, server, kho, tg, api, scheduler, nhip, donRac, trangThai }`, and no direct authoritative `tg.nhip()` interval.

- [ ] **Step 1: Write failing factory/gate HTTP tests**

  Add tests that create two factory instances with a fake monotonic clock and independent temp DBs, assert `GET /healthz` is 200 during standby, `GET /readyz` and `/api/state` are 503 before lease/recovery, and prove at runtime that registration, an action, chat, state advance, and logout cross `scheduler.runCommand(command)` before their durable writes.

  ```js
  // Add to tools/test-server.js before its existing server process test.
  var test = require('node:test');
  var assert = require('node:assert/strict');
  var fs = require('node:fs');
  var http = require('node:http');
  var os = require('node:os');
  var path = require('node:path');
  var { taoUngDung } = require('../server/app.js');
  var { Kho } = require('../server/db.js');
  var { SchedulerStore } = require('../server/scheduler/store.js');
  var { apDungMigrationScheduler } = require('../server/scheduler/migrations.js');
  var { taoScheduler } = require('../server/scheduler/index.js');
  var soDbTam = 0;

  function tempDb() {
    var file = path.join(os.tmpdir(), 'thdc-factory-' + process.pid + '-' + Date.now() + '-' + (++soDbTam) + '.db');
    ['','-wal','-shm'].forEach(function (suffix) { fs.rmSync(file + suffix, { force: true }); });
    return file;
  }
  function xoaDb(file) {
    ['','-wal','-shm'].forEach(function (suffix) { fs.rmSync(file + suffix, { force: true }); });
  }
  function fakeClock(startMs) {
    var ms = startMs;
    return {
      nowMs: function () { return ms; }, nowS: function () { return Math.floor(ms / 1000); },
      advanceMs: function (delta) { ms += delta; }, setMs: function (value) { ms = value; }
    };
  }
  function silentLogger() {
    return { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
  }
  async function get(app, pathname, token) {
    var address = app.server.address();
    var response = await fetch('http://127.0.0.1:' + address.port + pathname, {
      headers: token ? { 'x-thdc-token': token } : {}
    });
    return { status: response.status, text: await response.text() };
  }
  async function post(app, pathname, body, token) {
    var address = app.server.address();
    var response = await fetch('http://127.0.0.1:' + address.port + pathname, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, token ? { 'x-thdc-token': token } : {}),
      body: JSON.stringify(body)
    });
    return { status: response.status, json: await response.json() };
  }
  function doi(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  async function doiSanSang(app) {
    for (var attempt = 0; attempt < 50; attempt++) {
      if ((await get(app, '/readyz')).status === 200) return;
      await doi(10);
    }
    throw new Error('scheduler không ready trong 500ms');
  }
  function giuLease(dbPath, clock) {
    var kho = new Kho(dbPath);
    apDungMigrationScheduler(kho, clock.nowMs());
    var store = new SchedulerStore(kho, clock);
    assert.ok(store.acquireLease('00000000-0000-4000-8000-000000000008', clock.nowMs(), 60_000));
    return { kho: kho, store: store };
  }
  function taoSchedulerSpy(commands) {
    return function (context) {
      var real = taoScheduler(context);
      return {
        start: function () { return real.start(); },
        stop: function (graceMs) { return real.stop(graceMs); },
        getStatus: function () { return real.getStatus(); },
        runCommand: function (command) {
          commands.push({ name: command.name, accountId: command.accountId });
          return real.runCommand(command);
        },
        schedule: function (job) { return real.schedule(job); },
        cancel: function (idempotencyKey, reason) { return real.cancel(idempotencyKey, reason); },
        reconcile: function () { return real.reconcile(); },
        advanceTo: function (accountId, targetS) { return real.advanceTo(accountId, targetS); }
      };
    };
  }

  test('standby exposes observability but rejects gameplay before DB mutation', async function () {
    var dbPath = tempDb(), clock = fakeClock(5_000);
    var holder = giuLease(dbPath, clock);
    var app = taoUngDung({ port: 0, dbPath: dbPath, clock: clock, logger: silentLogger(), schedulerFactory: taoScheduler });
    try {
      await app.start(); // resolves after listen even though standby-holder owns the valid lease
      assert.equal((await get(app, '/healthz')).status, 200);
      assert.equal((await get(app, '/readyz')).status, 503);
      assert.equal((await get(app, '/api/state')).status, 503);
    } finally {
      await app.stop();
      holder.kho.dong();
      xoaDb(dbPath);
    }
  });

  test('runtime API exercises every durable command family through the real leased scheduler', async function () {
    var dbPath = tempDb(), clock = fakeClock(8_000), commands = [];
    var app = taoUngDung({ port: 0, dbPath: dbPath, clock: clock, logger: silentLogger(), schedulerFactory: taoSchedulerSpy(commands) });
    try {
      await app.start();
      await doiSanSang(app);
      var registered = await post(app, '/api/dangky', { ten: 'gateuser', mk: 'mat-khau-123', hienthi: 'Gate User' });
      assert.equal(registered.status, 200);
      var token = registered.json.token;
      var second = await post(app, '/api/dangky', { ten: 'gatetwo', mk: 'mat-khau-123', hienthi: 'Gate Two' });
      assert.equal(second.status, 200);
      var login = await post(app, '/api/dangnhap', { ten: 'gateuser', mk: 'mat-khau-123' });
      assert.equal(login.status, 200);
      token = login.json.token;
      var targetId = app.kho.q.tkTheoTen.get('gatetwo').id;
      assert.equal((await get(app, '/api/state', token)).status, 200);
      await post(app, '/api/lam', { ten: 'lmra', dl: {} }, token);
      await post(app, '/api/lmtao', { ten: 'Gate Alliance', tag: 'GATE' }, token);
      await post(app, '/api/tuyenchien', { tk: targetId }, token);
      await post(app, '/api/chuyengalana', { tk: targetId, so: 1 }, token);
      assert.equal((await post(app, '/api/chat', { kenh: 'chung', noi: 'gate proof' }, token)).status, 200);
      await post(app, '/api/guithu', { den: 'gatetwo', noi: 'mail proof' }, token);
      assert.equal((await post(app, '/api/doimk', { cu: 'mat-khau-123', moi: 'mat-khau-456' }, token)).status, 200);
      app.kho.q.phienThem.run('expired-gate-token', app.kho.q.tkTheoTen.get('gatetwo').id, 1, 1);
      assert.equal((await get(app, '/api/state', 'expired-gate-token')).status, 401);
      await app.donRac();
      assert.equal((await get(app, '/api/dangxuat', token)).status, 200);
      var disposable = await post(app, '/api/dangky', { ten: 'gatedelete', mk: 'mat-khau-123', hienthi: 'Gate Delete' });
      assert.equal((await post(app, '/api/xoatk', { mk: 'mat-khau-123', xacnhan: 'XOA' }, disposable.json.token)).status, 200);
      [
        'register', 'login', 'session-expiry', 'last-seen', 'logout', 'state-read', 'action',
        'alliance', 'war', 'transfer-galana', 'chat', 'mail', 'password-change', 'account-delete', 'cleanup'
      ].forEach(function (name) {
        assert.ok(commands.some(function (command) { return command.name === name; }), name + ' phải đi qua bridge');
      });
      assert.ok(commands.every(function (command) {
        return typeof command.name === 'string' && command.name.length > 0 && typeof command.accountId !== 'string';
      }));
    } finally {
      await app.stop();
      xoaDb(dbPath);
    }
  });
  ```

- [ ] **Step 2: Run the integration test to verify it fails**

  Run: `node --test --test-name-pattern='standby exposes|runtime API exercises every durable command' tools/test-server.js`

  Expected: FAIL because the current entrypoint binds immediately and API methods directly call `tg.tick`, `tg.hanhDong`, and `kho.q` writes.

- [ ] **Step 3: Implement factory-backed admission and API injection**

  In `server/app.js`, retain the Quality factory construction of `Kho`, `TheGioi`, and `API`; pass `{ kho, tg, clock, logger, env, schedulerPollMs, schedulerLogTicks, schedulerLeaseMs, ownerId: options.schedulerOwnerId, makeOwnerId: options.makeSchedulerOwnerId }` to `options.schedulerFactory || taoSchedulerRong`. The last two are deterministic-test seams; production passes neither, so `taoScheduler` creates its own process-lifetime UUID. The production integration supplies `taoScheduler` from `server/scheduler/index.js`, and the factory exposes the returned bridge only as `app.scheduler`. Bind listener in `recovering`, then let `scheduler.getStatus()` transition to `ready` after lease/recovery. `start()` resolves once the listener is bound, not after lease acquisition, so health can report standby. Before `ready`, the request dispatcher returns the transient 503 response for gameplay routes before session authentication or any database write. Keep static routes unchanged.

  In `server/api.js`, keep `phien(req)` read-only: it returns an expired-token marker instead of deleting it. The dispatcher sees that marker, first submits `session-expiry` with the token deletion closure, then returns the existing 401 payload. For each authenticated request, submit `last-seen` before any route-specific command. After each body `await` and authentication recheck, submit a synchronous closure through `this.scheduler.runCommand({ name, accountId, run })`. Use these exact names and put the named write inside the closure: `register` for account/empire/session creation; `login` for session creation and first empire; `session-expiry` for deleting an expired session; `last-seen` for `tkVao`; `logout`; `state-read`; `action`; `alliance` for every `lm*` command; `war`; `transfer-galana`; `chat`; `mail`; `password-change`; `account-delete`; and `cleanup` for `phienDonRac`, `chatDonRac`, and periodic cleanup. Each route's syntactically valid request constructs and submits its family command before calling the corresponding domain method, so a domain rejection is still runtime evidence of gate admission. Password hashing, JSON body parsing, and rate-limit map updates stay outside the UoW; every `kho.q` or `tg.*` call that can change durable state is inside the named bridge command. `run` is a synchronous closure; the scheduler throws if it returns a Promise.

  ```js
  API.prototype.goiState = function (p) {
    var self = this;
    return this.scheduler.runCommand({ name: 'state-read', accountId: p.tk, run: function () {
      return self.tg.tick(p.tk, Math.floor(self.clock.nowMs() / 1000));
    });
  };
  ```

  Make every caller of `goiState` `await` this promise before serializing its unchanged payload shape.

  Replace `server/index.js` interval/signal logic with the production adapter only: call `taoUngDung({ env: process.env, schedulerFactory: taoScheduler })`, call `start()`, then set `process.exitCode` after `stop()` resolves on SIGINT/SIGTERM. Preserve `PORT`, `THDC_DB`, `THDC_PROXY`, legacy aliases, static URLs, and response formats. Make public `app.donRac()` itself return `app.scheduler.runCommand({ name: 'cleanup', run: donRacNoiBo })`, where private synchronous `donRacNoiBo` contains `phienDonRac`, `hdDonRac`, and `chatDonRac`; no timer or test can bypass it. Remove the old direct authoritative `tg.nhip()` interval; process timers may still wake the scheduler or invoke `app.donRac()`, but they never call durable cleanup SQL directly.

- [ ] **Step 4: Run factory and existing HTTP tests**

  Run: `node --test --test-name-pattern='standby exposes|runtime API exercises every durable command' tools/test-server.js && node tools/test-server.js`

  Expected: PASS; factory construction does not bind a port, gameplay returns transient 503 while not ready, and existing login/action/state paths remain compatible when ready.

- [ ] **Step 5: Commit the application integration**

  ```bash
  git add server/app.js server/index.js server/api.js server/world.js tools/test-server.js
  git commit -m "feat: gate multiplayer mutations through scheduler writer"
  ```

### Task 8: Add readiness, metrics, shutdown correctness, aliases, and local quarantine CLI

**Files:**

- Create: `server/scheduler/metrics.js`
- Create: `tools/scheduler-cli.js`
- Modify: `server/app.js`
- Modify: `server/scheduler/writer.js`
- Modify: `server/api.js`
- Modify: `tools/test-scheduler.js`, `tools/test-server.js`

**Interfaces:**

- Consumes: `SchedulerBridge.getStatus()`, fixed metric names from the durable spec, quality logger/clock, and `THDC_NHIP`/`THDC_AM` compatibility contract.
- Produces: `renderMetrics(status)`, `/healthz`, `/readyz`, `/metrics`, `scheduler-cli inspect|replay|resolve`, graceful `stop(graceMs)`.

- [ ] **Step 1: Write failing observability/CLI/shutdown tests**

  Test metric redaction, readiness reasons, monotonic `effectiveNowMs`, full poll/lease/log precedence and ranges, a local CLI replay creating a new key, and stop waiting for both in-flight HTTP and UoW completion.

  ```js
  // tools/test-server.js already has tempDb, xoaDb, fakeClock, silentLogger, and get from Task 7.
  var resolveSchedulerOptions = require('../server/app.js').resolveSchedulerOptions;
  var taoScheduler = require('../server/scheduler/index.js').taoScheduler;

  // `doi(ms)` was defined by the Task-7 HTTP harness above.
  async function taoReadyApp() {
    var dbPath = tempDb();
    var app = taoUngDung({ port: 0, dbPath: dbPath, clock: fakeClock(10_000), logger: silentLogger(), schedulerFactory: taoScheduler });
    await app.start();
    for (var attempt = 0; attempt < 50; attempt++) {
      if ((await get(app, '/readyz')).status === 200) return { app: app, dbPath: dbPath };
      await doi(10);
    }
    await app.stop();
    xoaDb(dbPath);
    throw new Error('writer did not become ready in 500ms');
  }
  function moPostDangDo(app, pathname) {
    var address = app.server.address(), req;
    var done = new Promise(function (resolve, reject) {
      req = http.request({ host: '127.0.0.1', port: address.port, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json' } }, function (response) {
        response.resume(); response.on('end', resolve);
      });
      req.on('error', reject);
      req.write('{');
    });
    return { done: done, finish: function () { req.end('}'); } };
  }

  test('metrics have fixed labels and omit job/account identifiers', async function () {
    var x = await taoReadyApp();
    try {
      var response = await get(x.app, '/metrics');
      assert.match(response.text, /^scheduler_writer_lease_held 1/m);
      assert.doesNotMatch(response.text, /job-[0-9a-f-]+|accountId|payload_json/);
    } finally {
      await x.app.stop();
      xoaDb(x.dbPath);
    }
  });

  test('SCHEDULER_POLL_MS overrides THDC_NHIP and logs alias deprecation only when used', function () {
    var explicit = resolveSchedulerOptions({ schedulerPollMs: 900, schedulerLeaseMs: 9_000, schedulerLogTicks: false }, {
      SCHEDULER_POLL_MS: '1000', THDC_NHIP: '2000', SCHEDULER_LEASE_MS: '15000', SCHEDULER_LOG_TICKS: '1', THDC_AM: '1'
    });
    assert.equal(explicit.pollMs, 900);
    assert.equal(explicit.leaseMs, 9_000);
    assert.equal(explicit.logTicks, false);
    assert.equal(resolveSchedulerOptions({ tickMs: 800, schedulerLeaseMs: 9_000 }, { SCHEDULER_POLL_MS: '1000' }).pollMs, 800);
    assert.equal(resolveSchedulerOptions({ schedulerLeaseMs: 9_000 }, { SCHEDULER_POLL_MS: '1000', THDC_NHIP: '2000' }).pollMs, 1000);
    var legacy = resolveSchedulerOptions({ schedulerLeaseMs: 9_000 }, { THDC_NHIP: '800', THDC_AM: '1' });
    assert.equal(legacy.pollMs, 800);
    assert.equal(legacy.logTicks, true);
    assert.deepEqual(legacy.deprecatedAliases, ['THDC_NHIP', 'THDC_AM']);
    assert.throws(function () { resolveSchedulerOptions({}, { SCHEDULER_LEASE_MS: '2000' }); }, /SCHEDULER_LEASE_MS/);
    assert.throws(function () {
      resolveSchedulerOptions({}, { SCHEDULER_LEASE_MS: '9000', SCHEDULER_POLL_MS: '3000' });
    }, /SCHEDULER_POLL_MS.*lease/);
    assert.throws(function () { resolveSchedulerOptions({}, { SCHEDULER_LOG_TICKS: 'maybe' }); }, /SCHEDULER_LOG_TICKS/);
  });

  test('stop waits for an admitted request before closing the listener and database', async function () {
    var x = await taoReadyApp();
    try {
      var slow = moPostDangDo(x.app, '/api/dangky');
      await doi(10);
      var stopping = x.app.stop(1_000);
      var stoppedTooSoon = await Promise.race([stopping.then(function () { return true; }), doi(20).then(function () { return false; })]);
      assert.equal(stoppedTooSoon, false);
      slow.finish();
      await slow.done;
      await stopping;
    } finally { xoaDb(x.dbPath); }
  });

  // Add in tools/test-scheduler.js; taoWriterFixture comes from Task 6 and uses the real writer, lease and retry path.
  test('effectiveNowMs stays monotonic through real command, drain and retry after clock rollback', async function () {
    var x = taoWriterFixture();
    try {
      x.clock.setS(x.pvpJob.scheduled_at_s);
      x.writer.setFaultHook(function (stage, job) {
        if (stage === 'after-claim' && job.idempotency_key === x.pvpJob.idempotency_key) {
          var error = new Error('SQLITE_BUSY monotonic'); error.code = 'SQLITE_BUSY'; throw error;
        }
      });
      await x.scheduler.start();
      await x.writer.drainNow();
      var firstEffective = Number(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='effective_now_ms'").get().value);
      var accountIds = [x.attacker, x.target, x.supporter, x.unrelatedAccount];
      var before = accountIds.map(function (accountId) {
        var state = docState(x.kho, accountId);
        return { accountId: accountId, lastTick: state.lastTick, now: state.now };
      });
      function assertNoGameTimeRegressed() {
        before.forEach(function (prior) {
          var state = docState(x.kho, prior.accountId);
          assert.ok(state.lastTick >= prior.lastTick, 'lastTick ' + prior.accountId);
          assert.ok(state.now >= prior.now, 'now ' + prior.accountId);
        });
      }
      assert.equal(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'RETRY_WAIT');
      var retryAtMs = Number(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).retry_at_ms);
      assert.ok(retryAtMs > firstEffective);
      x.clock.setMs(firstEffective - 5_000);
      await x.writer.drainNow();
      assert.equal(Number(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='effective_now_ms'").get().value), firstEffective);
      assertNoGameTimeRegressed();
      var ranDuringBarrier = false;
      await assert.rejects(x.scheduler.runCommand({
        name: 'monotonic-probe', accountId: x.unrelatedAccount,
        run: function () { ranDuringBarrier = true; return null; }
      }), /GLOBAL_BARRIER_PENDING/);
      assert.equal(ranDuringBarrier, false);
      x.writer.setFaultHook(null);
      x.clock.setMs(retryAtMs);
      await x.writer.drainNow();
      assert.notEqual(x.store.getByIdempotencyKey(x.pvpJob.idempotency_key).state, 'RETRY_WAIT');
      assert.ok(Number(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='effective_now_ms'").get().value) >= retryAtMs);
      assertNoGameTimeRegressed();
      await thayDoiSauBarrierQuaGate(x, 99);
      assert.equal(docState(x.kho, x.target).planets[0].ships.fighterL, 99);
      assertNoGameTimeRegressed();
    } finally {
      await x.scheduler.stop(100);
      x.dong();
    }
  });

  var spawnSyncCli = require('node:child_process').spawnSync;
  function taoCliReplayFixture() {
    var clock = { nowMs: function () { return 20_000; } }, x = taoStoreTam(clock), lease = layLease(x, '00000000-0000-4000-8000-000000000009');
    x.kho.trongGiaoDich(function () {
      x.oldJob = x.store.schedule(lease, job('cli-old', 30, 100, { payload: { accountId: 1 } }), clock.nowMs());
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED', quarantined_at_ms=?, error_code='PAYLOAD_INTEGRITY' WHERE id=?")
        .run(clock.nowMs(), x.oldJob.id);
    }, { immediate: true });
    return x;
  }
  function chayCliScheduler(args) {
    return spawnSyncCli(process.execPath, ['tools/scheduler-cli.js'].concat(args), {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', env: Object.assign({}, process.env)
    });
  }
  test('local CLI replay keeps quarantined job and writes audited replacement', function () {
    var x = taoCliReplayFixture(), nonce = 'fixture-replay-01';
    try {
      var child = chayCliScheduler(['--db', x.file, '--action', 'replay', '--job', x.oldJob.id, '--nonce', nonce]);
      assert.equal(child.status, 0, child.stderr);
      assert.equal(x.kho.db.prepare('SELECT state FROM event_jobs WHERE id=?').get(x.oldJob.id).state, 'QUARANTINED');
      var replacement = x.kho.db.prepare('SELECT idempotency_key,state FROM event_jobs WHERE idempotency_key=?')
        .get('manual-replay:' + x.oldJob.id + ':' + nonce);
      assert.equal(replacement.state, 'PENDING');
      assert.equal(x.kho.db.prepare("SELECT action,job_id FROM scheduler_audit WHERE action='CLI_REPLAY' ORDER BY id DESC LIMIT 1").get().job_id, x.oldJob.id);
      assert.doesNotMatch(child.stdout, /payload_json|accountId|"payload"/);
    } finally { x.dong(); }
  });
  ```

- [ ] **Step 2: Run observability tests to verify they fail**

  Run: `node --test --test-name-pattern='metrics have fixed|SCHEDULER_POLL_MS|effectiveNowMs|local CLI replay|in-flight' tools/test-scheduler.js tools/test-server.js`

  Expected: FAIL because no metrics renderer, readiness routes, CLI, or shutdown wait exists.

- [ ] **Step 3: Implement operational interfaces**

  Implement a dependency-free Prometheus text renderer with only the spec's fixed metric names and `kind`/`outcome` allowlists. Use route-level state in `server/app.js`: `/healthz` ignores lease/backlog; `/readyz` returns a non-PII reason when not ready; `/metrics` returns text/plain and relies on reverse proxy/deployment restriction.

  Implement `tools/scheduler-cli.js` requiring explicit `--db`, `--action`, and `--job`; `replay` also requires a nonempty 1–64-character `[A-Za-z0-9_-]+` `--nonce`. Open the same `THDC_DB`-format SQLite file, generate a fresh UUID owner, acquire a lease, and perform inspect/replay/resolve inside `kho.trongGiaoDich(..., { immediate: true })` with the resulting lease token. `replay` rejects a non-`QUARANTINED` source, validates its stored hash/schema, calls `store.schedule(leaseToken, clonedStableJob, nowMs)` with immutable key `manual-replay:<old-id>:<nonce>`, leaves the source row `QUARANTINED`, calls `store.writeAudit(leaseToken, 'CLI_REPLAY', oldId, 'replacement-created', nowMs)`, and prints only `{ action: 'replay', jobId: shortId, replacement: shortId, state: 'PENDING' }`. It never prints payload, snapshot, account ID, token, or raw error. `inspect` and `resolve` use the same token and `scheduler_audit` allowlist. `replay` creates `manual-replay:<old-id>:<nonce>` rather than changing the quarantined row.

  Export `resolveSchedulerOptions(options, env)` from `server/app.js`. Parse every supplied number exactly once, reject non-integers/out-of-range values rather than silently falling back, and resolve poll/lease/log settings in this exact order:

  ```js
  function inRange(name, value, min, max) {
    var n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(name + ' must be an integer in [' + min + ',' + max + ']');
    return n;
  }
  function choose(options, env, optionName, aliasOptionName, envName, legacyEnvName, fallback, min, max) {
    if (options[optionName] !== undefined) return inRange(optionName, options[optionName], min, max);
    if (aliasOptionName && options[aliasOptionName] !== undefined) return inRange(aliasOptionName, options[aliasOptionName], min, max);
    if (env[envName] !== undefined) return inRange(envName, env[envName], min, max);
    if (legacyEnvName && env[legacyEnvName] !== undefined) return inRange(legacyEnvName, env[legacyEnvName], min, max);
    return fallback;
  }
  function boolean01(name, value) {
    if (value === true || value === '1' || value === 1) return true;
    if (value === false || value === '0' || value === 0) return false;
    throw new Error(name + ' must be 0 or 1');
  }
  function resolveSchedulerOptions(options, env) {
    options = options || {}; env = env || process.env;
    var pollMs = choose(options, env, 'schedulerPollMs', 'tickMs', 'SCHEDULER_POLL_MS', 'THDC_NHIP', 1000, 100, 10000);
    var leaseMs = choose(options, env, 'schedulerLeaseMs', null, 'SCHEDULER_LEASE_MS', null, 15000, 3000, 60000);
    if (pollMs >= leaseMs / 3) throw new Error('SCHEDULER_POLL_MS must be less than lease/3');
    var logTicks;
    if (options.schedulerLogTicks !== undefined) logTicks = boolean01('schedulerLogTicks', options.schedulerLogTicks);
    else if (env.SCHEDULER_LOG_TICKS !== undefined) logTicks = boolean01('SCHEDULER_LOG_TICKS', env.SCHEDULER_LOG_TICKS);
    else if (env.THDC_AM !== undefined) logTicks = boolean01('THDC_AM', env.THDC_AM);
    else logTicks = false;
    var deprecatedAliases = [];
    if (options.schedulerPollMs === undefined && options.tickMs === undefined && env.SCHEDULER_POLL_MS === undefined && env.THDC_NHIP !== undefined) deprecatedAliases.push('THDC_NHIP');
    if (options.schedulerLogTicks === undefined && env.SCHEDULER_LOG_TICKS === undefined && env.THDC_AM !== undefined) deprecatedAliases.push('THDC_AM');
    return {
      pollMs: pollMs, leaseMs: leaseMs, logTicks: logTicks,
      deprecatedAlias: deprecatedAliases[0] || null, deprecatedAliases: deprecatedAliases
    };
  }
  ```

  `stop()` switches to draining, rejects new gameplay admission, calls `server.close(callback)`, calls `app.scheduler.stop(graceMs)` to cancel wake-up, and waits for both the close callback and the in-flight HTTP count through the supplied grace period. Track every accepted request with a `finally` decrement. At grace expiry, destroy remaining sockets and wait for their handlers to settle; before SQLite closes, `SchedulerWriter.stop` performs the Task-6 `store.releaseLease(this.leaseToken, releaseNowMs)` conditional owner-plus-generation call in its final immediate UoW. It never deletes or expires a newer lease, and an already-lost token merely returns `false`. A UoW has no `await` and therefore cannot be force-rolled back from shutdown: `stop()` must never close SQLite while `kho._uow !== null`; a thrown UoW has already rolled itself back synchronously before the event loop can enter shutdown.

- [ ] **Step 4: Run focused operational tests**

  Run: `node --test --test-name-pattern='metrics have fixed|SCHEDULER_POLL_MS|effectiveNowMs|local CLI replay|in-flight|manual-replay' tools/test-scheduler.js tools/test-server.js`

  Expected: PASS; no endpoint exposes payload/snapshot, alias precedence is deterministic, and shutdown never closes SQLite before in-flight work finishes.

- [ ] **Step 5: Commit operations support**

  ```bash
  git add server/app.js server/api.js server/scheduler/metrics.js server/scheduler/writer.js tools/scheduler-cli.js tools/test-scheduler.js tools/test-server.js
  git commit -m "feat: add scheduler readiness metrics and local recovery cli"
  ```

### Task 9: Implement reconciliation, cutover, already-overdue recovery, rollback guard, and runbook

**Files:**

- Create: `server/scheduler/cutover.js`
- Modify: `server/scheduler/store.js`, `server/scheduler/writer.js`
- Modify: `docs/MAY-CHU.md`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: canonical `dq.state`, `SchedulerStore.schedule/replaceAccountAdvance`, `deriveExternalJobs`, and `SchedulerWriter` lease status.
- Produces: `reconcileCanonicalState()`, `cutoverDurableScheduler()`, `canRollbackDurableScheduler()`, and documented operator commands.

- [ ] **Step 1: Write failing reconcile/cutover tests**

  Add tests for missing projection repair, one account wake per revision, imported future explicit interaction, lease-verified `cauhinh` seed before overdue recovery, atomic `scheduler_mode` transition, and rollback only before first durable application.

  ```js
  // Add beside earlier imports in tools/test-scheduler.js.
  var cutover = require('../server/scheduler/cutover.js');
  var cutoverDurableScheduler = cutover.cutoverDurableScheduler;
  var canRollbackDurableScheduler = cutover.canRollbackDurableScheduler;

  function taoCutoverFixture(options) {
    var arrivalAtS = options.overdueArrivalS === null ? options.cutoverAtS + 1 : options.overdueArrivalS;
    var x = taoPvpFixtureAt(arrivalAtS), attacker = docState(x.kho, x.attacker);
    attacker.fleets[0].den_t = arrivalAtS;
    x.kho.q.dqLuuState.run(JSON.stringify(attacker), options.cutoverAtS, x.attacker);
    x.kho.db.exec('DELETE FROM event_applications; DELETE FROM event_jobs;');
    x.clock.setS(options.cutoverAtS);
    x.leaseToken = layLease(x, '00000000-0000-4000-8000-000000000010');
    x.ownerId = x.leaseToken.ownerId;
    x.context = {
      kho: x.kho, store: x.store, world: x.world, clock: x.clock, cutoverAtS: options.cutoverAtS,
      leaseToken: x.leaseToken, reducer: x.reducer, advanceService: x.service
    };
    x.writer = new SchedulerWriter({ ownerId: '00000000-0000-4000-8000-000000000011', store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(), manualDrain: true });
    return x;
  }

  test('cutover marks overdue interaction recovered-latest-state instead of claiming historical replay', function () {
    var x = taoCutoverFixture({ overdueArrivalS: 1_800_019_900, cutoverAtS: 1_800_020_000 });
    try {
      var stages = [];
      x.context.onStageForTest = function (stage) { stages.push(stage); };
      cutoverDurableScheduler(x.context);
      var app = x.kho.db.prepare('SELECT result_json,effective_at_s FROM event_applications').get();
      assert.match(app.result_json, /recovered-latest-state/);
      assert.equal(app.effective_at_s, 1_800_020_000);
      assert.match(x.kho.db.prepare('SELECT v FROM cauhinh WHERE k=?').get('combat_seed_key_v1').v, /^[0-9a-f]{64}$/);
      assert.deepEqual(stages, ['seed-initialized', 'overdue-reducer', 'before-mode-durable', 'mode-durable']);
      assert.equal(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get().value, 'durable');
      assert.equal(x.kho.db.prepare("SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get().expires_at_ms, 0);
    } finally { x.dong(); }
  });

  test('failed cutover leaves legacy mode and imports rolled back atomically', function () {
    var x = taoCutoverFixture({ overdueArrivalS: null, cutoverAtS: 1_800_021_000 });
    try {
      x.context.onStageForTest = function (stage) {
        if (stage === 'before-mode-durable') throw new Error('CUTOVER_TEST_ABORT');
      };
      assert.throws(function () { cutoverDurableScheduler(x.context); }, /CUTOVER_TEST_ABORT/);
      assert.equal(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get().value, 'legacy');
      assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_jobs').get().n, 0);
      assert.equal(x.kho.db.prepare("SELECT COUNT(*) AS n FROM cauhinh WHERE k='combat_seed_key_v1'").get().n, 0);
      assert.equal(x.kho.db.prepare("SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get().expires_at_ms, 0);
    } finally { x.dong(); }
  });

  test('rollback is refused after the first durable application commits', async function () {
    var x = taoCutoverFixture({ overdueArrivalS: null, cutoverAtS: 1_800_020_000 });
    try {
      cutoverDurableScheduler(x.context);
      x.clock.setS(1_800_020_001);
      await x.writer.start();
      await x.writer.drainNow();
      assert.equal(canRollbackDurableScheduler(x.kho), false);
    } finally {
      await x.writer.stop(100);
      x.dong();
    }
  });
  ```

- [ ] **Step 2: Run cutover tests to verify they fail**

  Run: `node --test --test-name-pattern='cutover marks|failed cutover|rollback is refused|reconcile' tools/test-scheduler.js`

  Expected: FAIL with `Cannot find module '../server/scheduler/cutover.js'`.

- [ ] **Step 3: Implement canonical reconciliation and cutover**

  Implement reconciliation in stable account-ID pages with `scheduler_meta.reconcile_cursor`. It must derive jobs from each `dq.state`, repair `hamdang`/`hamgiu` from canonical state, insert only missing jobs by idempotency key/hash, and cancel only non-global orphan jobs. A global orphan must receive explicit reducer invalidation/application before its barrier is released.

  `cutoverDurableScheduler(context)` requires `{ kho, store, world, clock, cutoverAtS, leaseToken, reducer, advanceService }`; the optional synchronous `onStageForTest(stage)` is test-only fault/order instrumentation. Compute `effectiveNowMs` once from the persisted watermark and clock, write it only after proving the token live, and call the following defined helper in `finally` after the cutover UoW settles:

  ```js
  function releaseCutoverLease(context, effectiveNowMs) {
    var releaseNowMs = Math.max(effectiveNowMs, context.clock.nowMs());
    return context.kho.trongGiaoDich(function () {
      return context.store.releaseLease(context.leaseToken, releaseNowMs);
    }, { immediate: true });
  }
  ```

  `cutoverDurableScheduler` computes `effectiveNowMs` as `Math.max(store.peekEffectiveNowMs(clock.nowMs()), clock.nowMs())`, then runs the following complete state transition in one synchronous `kho.trongGiaoDich(..., { immediate: true })` UoW: prove `leaseToken` live; `recordEffectiveNowMs(leaseToken, effectiveNowMs)`; validate migration metadata; initialize/validate the seed; snapshot/import/reconcile canonical state; recover every overdue interaction; write `scheduler_mode='durable'`; commit. It encloses that UoW in `try/finally` and calls the defined `releaseCutoverLease(context, effectiveNowMs)` from `finally`, regardless of success or rollback. In the indicated synchronous UoW, verify that migration's `scheduler_meta.key='schema_version'` is supported and `scheduler_meta.key='scheduler_mode'` is exactly `legacy`. Still under that live lease and before importing/reducing any overdue job, call `reducer.initializeCombatSeed(leaseToken, effectiveNowMs)`, validate the `cauhinh(k='combat_seed_key_v1',v)` winner, then invoke `onStageForTest('seed-initialized')`. Snapshot `dq.state`, assign initial revisions, import future local/external jobs through token-taking store calls, and validate projections. For every unresolved overdue interaction, call the supplied recovery reducer at `cutover_at_s` using latest state, write `recovered-latest-state` plus original timestamp in result JSON, then invoke `onStageForTest('overdue-reducer')`. Invoke `onStageForTest('before-mode-durable')`, atomically write `scheduler_mode='durable'`, invoke `onStageForTest('mode-durable')`, and commit that same UoW. Any throw rolls back imports, seed and mode together, leaving migration's `legacy` row intact. The `finally` UoW invokes `releaseLease` with the original `{ ownerId, generation }`; a false return cannot touch a replacement holder, while true writes `expires_at_ms=0` so the normal writer takes over immediately. Set `durable_first_application_at_ms` at first committed application; rollback is legal only while this key is absent.

- [ ] **Step 4: Run cutover/reconcile tests**

  Run: `node --test --test-name-pattern='cutover marks|failed cutover|rollback is refused|reconcile' tools/test-scheduler.js`

  Expected: PASS; rerunning cutover/reconcile creates no duplicate job, repair does not source fleet data from projections, and rollback guard is immutable after effect.

- [ ] **Step 5: Document and commit operational migration semantics**

  Add exact runbook sections to `docs/MAY-CHU.md`: pre-cutover consistent SQLite backup, feature mode checks, health/readiness/metrics verification, local CLI usage, overdue `recovered-latest-state` meaning, allowed pre-effect rollback, and required backup restore after the first durable effect.

  ```bash
  git add server/scheduler/cutover.js server/scheduler/store.js server/scheduler/writer.js tools/test-scheduler.js docs/MAY-CHU.md
  git commit -m "feat: add durable scheduler cutover and reconciliation"
  ```

### Task 10: Integrate package scripts, regression/fault matrix, and load verification

**Files:**

- Verify with Quality integration owner: `package.json` already supplies `test:scheduler`; do not overwrite its scripts.
- Modify/extend: `tools/test-scheduler.js` (the existing Quality bridge test file)
- Modify: `tools/test-server.js`
- Modify: `tools/test-tai.js`
- Modify: `docs/MAY-CHU.md`

**Interfaces:**

- Consumes: all scheduler modules and the quality-spec test contract.
- Produces: behavioral evidence that `npm run test:scheduler` really executes the scheduler suite, deterministic fault matrix, 60-account load coverage, and release handoff evidence.

- [ ] **Step 1: Write failing end-to-end assertions and script contract checks**

  Extend scheduler tests with failure injection immediately before claim, after claim, after application insert, after game mutation, and before completion. Extend `tools/test-tai.js` to advance concurrent PvP through writer/barrier rather than looping `tg.tick`. Add a behavioral package test that launches the real `npm run test:scheduler`, not a source/manifest grep.

  ```js
  function taoCrashFixture(point) {
    var x = taoWriterFixture();
    x.key = x.pvpJob.idempotency_key;
    x.writer = new SchedulerWriter({ ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(), pollMs: 1_000, leaseMs: 15_000, manualDrain: false });
    x.scheduler = taoScheduler({ writer: x.writer, store: x.store, world: x.world, clock: x.clock, logger: silentLogger() });
    x.clock.setS(x.pvpJob.scheduled_at_s - 1); // lease is acquired; wake timer is armed one game second ahead
    x.writer.setFaultHook(function (stage) {
      if (stage === point) {
        var error = new Error('INJECTED_CRASH:' + point);
        error.code = 'INJECTED_CRASH';
        throw error;
      }
    });
    return x;
  }
  async function assertCrashThenRestart(x) {
    await x.writer.start();
    assert.equal(x.writer.status().wakeTimerActive, true);
    x.clock.setS(x.pvpJob.scheduled_at_s); // job is now eligible, so drainNow reaches the selected crash hook
    await assert.rejects(x.writer.drainNow(), /INJECTED_CRASH/);
    var leaseBeforeCrash = x.kho.db.prepare("SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'").get();
    x.writer.simulateFatalCrashForTest();
    assert.equal(x.writer.status().wakeTimerActive, false);
    assert.deepEqual(x.kho.db.prepare("SELECT owner_id,generation FROM scheduler_lease WHERE lease_name='global-writer'").get(), leaseBeforeCrash);
    x.kho.dong(); // abrupt process loss: timer is cancelled, but no writer.stop() or lease release occurs before DB close
    x.clock.advanceMs(15_001);
    x.kho = new Kho(x.file);
    x.store = new SchedulerStore(x.kho, x.clock);
    x.world = new TheGioi(x.kho, { clock: x.clock, scheduler: x.store });
    x.service = new GameAdvanceService({ kho: x.kho, world: x.world, store: x.store, clock: x.clock });
    x.reducer = new EventReducer({ kho: x.kho, world: x.world, store: x.store, clock: x.clock, advanceService: x.service });
    x.pvpJob = x.store.getByIdempotencyKey(x.key);
    x.writer = new SchedulerWriter({ ownerId: '00000000-0000-4000-8000-000000000012', store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(), manualDrain: true });
    await x.writer.start();
    var recovered = x.store.getByIdempotencyKey(x.key);
    assert.ok(recovered.state === 'PENDING' || recovered.state === 'RETRY_WAIT', 'recovery state=' + recovered.state);
    if (recovered.state === 'RETRY_WAIT') {
      assert.ok(Number(recovered.retry_at_ms) > x.clock.nowMs(), 'recovery must schedule a future retry');
      x.clock.setMs(Number(recovered.retry_at_ms));
    }
    await x.writer.drainNow();
  }

  var spawnSync = require('node:child_process').spawnSync;
  function runSchedulerScriptProbe() {
    return spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:scheduler'], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8',
      env: Object.assign({}, process.env, {
        THDC_SCHEDULER_PACKAGE_PROBE: '1', THDC_SCHEDULER_PACKAGE_CHILD: '1'
      })
    });
  }
  if (!process.env.THDC_SCHEDULER_PACKAGE_CHILD) {
    test('npm run test:scheduler executes the scheduler suite package probe', function () {
      var child = runSchedulerScriptProbe();
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /scheduler-package-probe/);
    });
  }

  test('each injected crash point leaves at most one application and no duplicated battle report', async function () {
    for (var point of ['before-claim', 'after-claim', 'after-application', 'after-mutation', 'before-complete']) {
      var x = taoCrashFixture(point);
      try {
        await assertCrashThenRestart(x);
        assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?').get(x.key).n, 1);
        assert.ok(x.kho.db.prepare('SELECT COUNT(*) AS n FROM tran').get().n <= 1);
      } finally {
        await x.writer.stop(100);
        x.dong();
      }
    }
  });
  ```

- [ ] **Step 2: Run the final scheduler test before package integration**

  Run: `npm run test:scheduler`

  Expected: FAIL. The newly added package-probe assertion launches `npm run test:scheduler` but no child marker exists yet; the fault matrix also calls the still-unimplemented fatal-crash cleanup seam. This is a genuine RED run of the package command, not a manifest/source inspection.

- [ ] **Step 3: Complete the fatal-crash seam and behavioral package probe**

  Quality Task 7 already owns and created these scripts; verify rather than rewrite them:

  ```json
  {
    "scripts": {
      "test:scheduler": "node --test tools/test-scheduler.js",
      "test": "node tools/smoke.js && node tools/test-server.js && node --test tools/test-scheduler.js"
    }
  }
  ```

  Implement `SchedulerWriter.prototype.simulateFatalCrashForTest` as a test-only synchronous method: set state to `crashed`, `clearTimeout(this.wakeTimer)`, set `wakeTimer=null`, stop heartbeat scheduling, and deliberately do not call `releaseLease`, `stop`, or any Store transition. Add this top-level marker to `tools/test-scheduler.js` before the package-probe test definition:

  ```js
  if (process.env.THDC_SCHEDULER_PACKAGE_PROBE === '1') process.stdout.write('scheduler-package-probe\n');
  ```

  The child receives `THDC_SCHEDULER_PACKAGE_CHILD=1`, so it emits the marker but does not recursively spawn npm. Require the tests to cover: seconds/ms conversion only at clock boundary, backward-clock monotonicity, 50,001 same-second events, lease takeover/generation loss, CTE order, global retry/quarantine watermark, stale revision, missing projection supporter, HMAC seed restart, API standby/ready/draining, SIGTERM grace, cutover recovery/rollback, and no PII in metrics/log objects.

- [ ] **Step 4: Run the release-scale verification set**

  Run:

  ```bash
  npm run test:core
  npm run test:scheduler
  npm run test:server
  npm run test:load
  npm run check:syntax
  npm run lint
  ```

  Expected: each command exits 0. If quality scripts have not merged yet, run the equivalent existing commands (`node tools/smoke.js`, `node tools/test-server.js`, `node tools/test-tai.js 60`, and `node --check` over changed JavaScript) and record the missing quality-gate integration as a dependency, not a passing substitute.

- [ ] **Step 5: Commit the verified durable scheduler release slice**

  ```bash
  git add tools/test-scheduler.js tools/test-server.js tools/test-tai.js docs/MAY-CHU.md
  git commit -m "test: verify durable scheduler fault and load matrix"
  ```

## Spec coverage review

| Requirement | Implementing task |
|---|---|
| SQLite shared DB, revisions, schema, idempotency, single writer/lease | Tasks 1–2 |
| Seconds gameplay versus milliseconds operations | Tasks 2–3 and 10 |
| `ACCOUNT_ADVANCE`, local/external ownership, `BLOCKED_EXTERNAL` | Tasks 3–4 |
| Outer UoW and all HTTP mutation gate | Tasks 1, 4, and 7 |
| Partial 50,000 contract and no skip at same second | Task 3 |
| PvP barrier, canonical supporter scan, timestamp `T`, deterministic seed/snapshot | Task 5 |
| Retry, backoff, poison handling, quarantine barrier and CLI | Tasks 2, 6, and 8 |
| Health/readiness/metrics, aliases, listener and shutdown | Tasks 7–8 |
| Reconcile, cutover, overdue recovery, rollback | Task 9 |
| Fault injection, restart, concurrency, load, quality test command | Task 10 |

## Plan self-review

- Coverage: every durable-spec section maps to one or more tasks in the table above; quality-spec factory, clock, logger, UoW, test script, and lifecycle interfaces are explicitly consumed.
- Placeholder scan: this plan contains concrete paths, signatures, SQL, test code, commands, expected outcomes, and commit commands for every task; it contains no unresolved marker, source-grep gate, obsolete schema-key spelling, or scheduler-meta `k` column.
- Helper/interface consistency: each fixture is introduced before its first use (`taoKhoTam` → `taoStoreTam` → world/PvP/writer → server/CLI/cutover/crash); `taoScheduler(context)`, `app.scheduler.getStatus()`, and `runCommand({ name, accountId?, run })` are the only public bridge seam.
- Type consistency: `scheduled_at_s`, `retry_at_ms`, `remainingBudget`, `ExternalRef`, `LeaseToken { ownerId, generation }`, `schema_version`, `cauhinh.combat_seed_key_v1`, `SchedulerStore`, `SchedulerWriter`, `MutationGate`, and `AdvanceResult` retain the same meaning throughout all tasks.

Plan complete and saved to `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
