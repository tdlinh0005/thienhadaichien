# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 of the durable event scheduler: the leased single
writer lifecycle, global watermark enforcement, deterministic retry/backoff,
quarantine semantics, MutationGate bridge, direct scheduler factory, and
fresh-only maintenance cutover. Preserve the accepted Task 1-5 code and keep
all Task 7+ public app/API/world routing out of scope.

**Architecture:** Add an internal `SchedulerWriter` that owns one durable
lease, drains global barriers before account-local work, fences every mutation
through Task 2 `SchedulerStore`, delegates business preparation/application to
Task 5 `EventReducer` and `GameAdvanceService`, and exposes a narrow
Task-6-only bridge through `server/scheduler/index.js`. Fresh-only cutover is a
local maintenance path that migrates an empty legacy database to durable mode
without importing or reconciling historical rows.

**Tech Stack:** Node.js CommonJS, `node:test`, SQLite through the existing
`Kho` unit-of-work API, Task 2 scheduler tables/store, Task 5 reducer and
advance-service seams, Foundation clock/logger/options conventions.

**Spec and authorities:**

- Design spec:
  `docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md`
  (`sha256 1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf`,
  311 lines, 42,966 bytes).
- Parent durable scheduler plan:
  `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md`
  (`sha256 cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3`,
  23,455 lines, 1,128,291 bytes). Task 6 starts at line 10866 and ends
  before Task 7.
- Model routing:
  `.superpowers/sdd/model-routing.md`
  (`sha256 09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f`,
  102 lines, 5,732 bytes). Task 6 implementer route is `gpt-5.5`,
  effort `xhigh`; fresh read-only reviews after implementation are
  `gpt-5.6-sol high` for behavior/logic and `gpt-5.6-sol high` for
  scope/runtime.
- Accepted Task 5 report:
  `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-5-report.md`
  (`sha256 85b06ed44455a1deb2a535041ea90736b7962df55b698afab1b3e0cd4a5cb85d`,
  76 lines, 3,983 bytes). Its accepted evidence is the direct business-code
  candidate and review passes. The superseded Task 5 forensic harness is not
  acceptance evidence and must remain ignored.

## Global Constraints

- Preserve all existing dirty user changes. Do not normalize, reformat, or
  rewrite unrelated files.
- Task 6 owns only these implementation paths:

  - Create `server/scheduler/writer.js`
  - Create `server/scheduler/index.js`
  - Create `server/scheduler/cutover.js`
  - Create `tools/scheduler-cutover.js`
  - Modify `tools/test-scheduler.js`
  - Modify `server/scheduler/store.js` only if a Task 6 RED test proves a
    missing writer-consumer primitive. The live store already exposes the
    expected primitives; no default store edit is expected.
  - Create the implementation report at
    `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md`
    after all verification commands pass.

- Task 6 must not edit these Task 7+ paths: `server/app.js`,
  `server/api.js`, `server/world.js`, `server/index.js`,
  `server/scheduler/contract.js`, browser/UI files, `dist/`, package files, or
  HTTP readiness/routing code.
- Use TDD. Each implementation group below starts by appending failing tests
  to `tools/test-scheduler.js`. Do not write production code for a group before
  its RED command proves the new tests fail for the intended missing behavior.
- Keep the accepted Task 5 seams exactly:

  - `SchedulerStore.insertApplication(token, executableJob, application, nowMs,
    canonicalTContext)` is the only application insertion path.
  - `SchedulerStore.assertCanonicalExecutable(token, executableJob, nowMs)` is
    the only execution-capability verifier.
  - `GameAdvanceService.toPublicAdvanceResult(outcome)` returns exactly five
    public fields.
  - `reducers.js` exports `{EventReducer, seed32,
    resolveCanonicalGlobalInCurrentUow}`.
  - `resolveCanonicalGlobalInCurrentUow(context, jobId, reason, options)` keeps
    the exact four-argument ABI.
  - `SchedulerStore.getOrCreateCombatSeedKey(token, nowMs)` remains the
    store-owned seed path.
  - Writer startup calls `EventReducer.initializeCombatSeed` only after
    acquiring a durable writer lease and before recovery/readiness. Standby and
    legacy-mode writers never call it.

- Respect the live reducer contract: `EventReducer.prepare` currently accepts
  only the option key `executionTargetS`. Do not pass
  `deferAccountFinalize`, `partial`, or any other new reducer option. Partial
  lifecycle handling belongs in `SchedulerWriter` around the Task 5 prepared
  result and store lifecycle methods.
- All unit-of-work callbacks passed to `kho.trongGiaoDich` must be synchronous.
  If a command closure returns a Promise, reject with `UNIT_OF_WORK_ASYNC`
  before committing.
- Every writer mutation must be lease-fenced and inside a single transaction.
  The writer may keep a Promise tail outside the database, but each database
  callback must stay synchronous.
- Global claim order is:
  `(eligible_at_ms, priority, sequence, id)`. Account-local claims must use the
  current `globalWatermarkS` and cannot pass unresolved global barriers.
- Retry/backoff uses the live store helpers:
  `deterministicJitter(job.id, attempt)` and
  `retryAtMs(job.id, nextAttempt, nowMs, policy)`. Defaults:
  `baseMs = 1000`, `maxMs = 300000`, `maxAttempts = 8`.
- Retry classification:

  - Transient retryable: `SQLITE_BUSY`, `SQLITE_LOCKED`, `SQLITE_IOERR`,
    `ETIMEDOUT`, and explicit `TRANSIENT_*` scheduler errors.
  - Quarantine: payload integrity, invariant/canonicalization failures,
    unclassified errors, and max-attempt exhaustion.
  - Fatal writer state: storage fatality that prevents safe lifecycle writes.
    This stops timers and refuses admission until a new writer instance starts.
  - Lease lost: transition to standby, stop drain timers, and do not continue
    mutating under the old token.

- MutationGate boundaries:

  - Validate command shape and command method before opening a write UoW.
  - Reject admission when stopped, not ready, lease-lost, storage-fatal, or
    quarantine budget has been exceeded.
  - Set the durable mutation marker before any command-side world mutation.
  - Drain all due global barriers at or before the command effective time before
    executing the command closure.
  - If the global drain stops on a 50,000-tick budget partial, return
    `{deferred: true, code: 'TICK_PARTIAL'}` and do not invoke the command
    closure.
  - Do not add HTTP/API/readiness wiring. Task 7 owns public app routing.

- Final verification must include direct TAP, throw-deprecation TAP,
  syntax checks, diff whitespace checks, and the two fresh Sol reviews described
  in model routing.

## Current Accepted Live Seams

The implementation starts from these current live identities, which match the
accepted Task 5 report:

- `server/scheduler/store.js`:
  `517de850b015fe90e8d6d200098a71ef20015ffaf02b26c683d64e065aed471c`
  (1,867 lines, 93,543 bytes).
- `server/scheduler/combat-snapshot.js`:
  `4055a66f1f8e6f1097e67dc6830e3c2df2ffdc3b1ebfaa03614041b345d298f0`
  (234 lines, 9,686 bytes).
- `server/scheduler/advance-service.js`:
  `edebe9a7f380b16de6ef5519479dd8249e5c3f0d1433168af53dac42bab88c4d`
  (632 lines, 25,464 bytes).
- `server/scheduler/reducers.js`:
  `3e5678d0da3e0a359de64cda72bedb77c5822889556332f3aee34a7620b33b5a`
  (489 lines, 22,716 bytes).
- `server/world.js`:
  `a9a56d2150e9dc38bdb5d8ca7516be3a2619204f8fdfe0543160870bd7b8b1d7`
  (2,355 lines, 110,490 bytes).
- `tools/test-scheduler.js`:
  `4ec33beca23b43d76c8938a3439bcd51ed77667461d5bbfb1db8c98097bfae5b`
  (11,053 lines, 519,340 bytes).

The current Task 5 baseline command is:

```bash
node tools/test-scheduler.js
```

Baseline result from the accepted report is 163 tests, 162 passed, 0 failed,
and 1 skipped. The skip is the known port-zero EPERM skip and is not a pass.

**Resolved reference drift:** the older Task 6 reference text names
deterministic jitter sentinel values for `job-224`, `job-225`, `job-49`, and
`job-50` that do not match the accepted live Task 2/5 `store.js` hash above.
The live helper currently returns:

- `deterministicJitter('job-224', 1) === 404`
- `deterministicJitter('job-224', 2) === 261`
- `deterministicJitter('job-225', 1) === 971`
- `deterministicJitter('job-225', 2) === 590`
- `deterministicJitter('job-49', 1) === 897`
- `deterministicJitter('job-49', 2) === 40`
- `deterministicJitter('job-50', 1) === 903`
- `deterministicJitter('job-50', 2) === 522`

Task 6 must preserve these live helper results and use `retryAtMs`; it must not
rewrite accepted Task 2/5 store hashing solely to match superseded parent-plan
sentinels.

## Task 1: Surface, options, fresh-only cutover, and test harness

**Files:**

- Modify `tools/test-scheduler.js`
- Create `server/scheduler/index.js`
- Create `server/scheduler/cutover.js`
- Create `tools/scheduler-cutover.js`
- Create `server/scheduler/writer.js` with a minimal validated surface used by
  the Task 1 tests

**Interfaces introduced:**

- `server/scheduler/writer.js` exports exactly `{SchedulerWriter}`.
- `server/scheduler/index.js` exports exactly
  `{taoScheduler, resolveDurableSchedulerOptions, inRange}`.
- `server/scheduler/cutover.js` exports exactly `{runMaintenanceCutover}`.
- `tools/scheduler-cutover.js` exports `{parseCutoverArgs, main}` and runs
  `main(process.argv.slice(2), process.env, process.stdout, process.stderr)`
  only when `require.main === module`.

### Step 1.1: Append Task 6 shared test helpers and five RED tests

- [ ] Append the Task 6 helper block after the existing Task 5 tests in
  `tools/test-scheduler.js`. Use Task 4/5 live helpers; do not resurrect older
  superseded names such as `taoPvpFixtureAt`.

```js
var TASK6_OWNER_A = '00000000-0000-4000-8000-000000000601';
var TASK6_OWNER_B = '00000000-0000-4000-8000-000000000602';

function task6Lazy(modulePath, exportName) {
  var loaded = require(modulePath);
  assert.ok(
    loaded && Object.prototype.hasOwnProperty.call(loaded, exportName),
    'TASK6_SURFACE_' + exportName.toUpperCase() + '_EXPORT'
  );
  return loaded[exportName];
}

function task6Modules() {
  return {
    SchedulerWriter: task6Lazy('../server/scheduler/writer.js', 'SchedulerWriter'),
    taoScheduler: task6Lazy('../server/scheduler/index.js', 'taoScheduler'),
    resolveDurableSchedulerOptions: task6Lazy(
      '../server/scheduler/index.js',
      'resolveDurableSchedulerOptions'
    ),
    inRange: task6Lazy('../server/scheduler/index.js', 'inRange'),
    runMaintenanceCutover: task6Lazy(
      '../server/scheduler/cutover.js',
      'runMaintenanceCutover'
    )
  };
}

function task6BaseOptions(overrides) {
  return Object.assign({
    schedulerPollMs: 25,
    schedulerLogTicks: false,
    cleanupMs: 60000,
    schedulerLeaseMs: 9000,
    schedulerLockMs: 30000,
    schedulerRetryBaseMs: 1000,
    schedulerRetryMaxMs: 300000,
    schedulerMaxAttempts: 8,
    schedulerQuarantineLimit: 0
  }, overrides || {});
}

function task6ModeValue(x) {
  return x.kho.db.prepare(
    "SELECT value FROM scheduler_meta WHERE key='scheduler_mode'"
  ).get().value;
}

function task6SetDurableModeAndReleaseSetupLease(x) {
  x.kho.trongGiaoDich(function () {
    x.store.assertLiveLease(x.lease, x.clock.nowMs());
    x.kho.db.prepare(
      "UPDATE scheduler_meta SET value='durable', updated_at_ms=? " +
      "WHERE key='scheduler_mode'"
    ).run(x.clock.nowMs());
    assert.equal(x.store.releaseLease(x.lease, x.clock.nowMs()), true);
  }, { immediate: true });
  x.lease = null;
}

function task6TimerHarness(clock) {
  var active = new Map();
  var nextId = 1;
  return {
    active: active,
    setTimeout: function (fn, delayMs) {
      var id = nextId++;
      active.set(id, { fn: fn, delayMs: delayMs, cleared: false });
      return id;
    },
    clearTimeout: function (id) {
      var timer = active.get(id);
      if (timer) {
        timer.cleared = true;
        active.delete(id);
      }
    },
    fireNext: function () {
      var first = active.entries().next();
      assert.equal(first.done, false, 'TASK6_TIMER_EXPECTED');
      var id = first.value[0];
      var timer = first.value[1];
      active.delete(id);
      clock.advanceMs(timer.delayMs);
      return timer.fn();
    }
  };
}

function task6WriterFixture(t, ownerId, options) {
  var modules = task6Modules();
  var x = task5ReducerFixture(t, ownerId || TASK6_OWNER_A);
  task6SetDurableModeAndReleaseSetupLease(x);
  x.task6Logs = [];
  x.task6Timers = task6TimerHarness(x.clock);
  x.writer = new modules.SchedulerWriter({
    ownerId: ownerId || TASK6_OWNER_A,
    store: x.store,
    world: x.world,
    reducer: x.reducer,
    advanceService: x.service,
    clock: x.clock,
    logger: silentLogger(x.task6Logs),
    timers: x.task6Timers,
    options: task6BaseOptions(options),
    manualDrain: true
  });
  return x;
}
```

- [ ] Add exactly these five tests:

  1. `Task 6 modules expose frozen public surfaces`:
     assert the export key lists are exact for `writer.js`, `index.js`, and
     `cutover.js`; assert `SchedulerWriter.prototype` has
     `start`, `stop`, `drainNow`, `runCommand`, `schedule`, `cancel`,
     `reconcile`, `advanceTo`, and `getStatus`.
  2. `Task 6 deterministic retry jitter is inclusive and stable`:
     import `deterministicJitter` and `retryAtMs` from
     `server/scheduler/store.js`; assert jitter is always integer
     `0 <= value <= 999` for ids `job-0` through `job-999`; assert the current
     live contract for fixed ids is stable with the exact values listed in the
     "Resolved reference drift" note above; assert `retryAtMs` uses
     `base * 2 ** (attempt - 1) + jitter`, capped at `maxMs + jitter`.
  3. `Task 6 durable options preserve Foundation shape and reject invalid ranges`:
     call `resolveDurableSchedulerOptions` with Foundation keys plus Task 6
     keys; assert unknown keys reject with `SCHEDULER_OPTIONS_UNKNOWN`; assert
     invalid integer/range values reject with `SCHEDULER_OPTIONS_INVALID`;
     assert defaults are frozen and include lease, lock, retry, max-attempt,
     quarantine, poll, cleanup, and log flags.
  4. `Task 6 fresh cutover atomically marks empty legacy store durable`:
     create a temporary store with `taoStoreTam(fakeClock(NOW_MS))`; assert mode
     starts `legacy`; run `runMaintenanceCutover({ kho, clock, logger,
     ownerId: TASK6_OWNER_A })`; assert result is exactly
     `{ action: 'cutover', mode: 'durable', imported: 0, recovered: 0 }`;
     assert scheduler mode is `durable`, the writer lease is released, one
     combat seed key exists, and one `CUTOVER` audit row exists.
  5. `Task 6 fresh cutover rejects nonempty legacy store without mutation`:
     create a fixture with one account or one pending job; run cutover; assert
     rejection code `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`; assert mode
     remains `legacy`, lease is not held, combat seed count is unchanged, and no
     `CUTOVER` audit row was written.

### Step 1.2: Prove RED for Task 1

- [ ] Run the RED command and require the new tests to fail because Task 6
  modules are absent or incomplete:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 168$' "$tap_file"
rg -q '^# fail [1-5]$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 1.3: Implement the minimal surfaces and fresh-only cutover

- [ ] Create `server/scheduler/writer.js` with a real constructor and public
  method skeletons. The constructor must validate the UUID owner through
  `assertSchedulerOwnerId` before touching `store`, `world`, timers, or the
  database.

```js
var {
  assertSchedulerOwnerId,
  normalizeSchedulerErrorCode,
  retryAtMs
} = require('./store.js');

class SchedulerWriter {
  constructor(context) {
    if (!context || typeof context !== 'object') {
      throw schedulerError('SCHEDULER_WRITER_CONTEXT', 'writer context required');
    }
    this.ownerId = assertSchedulerOwnerId(context.ownerId);
    this.store = requireObject(context.store, 'store');
    this.world = requireObject(context.world, 'world');
    this.reducer = requireObject(context.reducer, 'reducer');
    this.advanceService = requireObject(context.advanceService, 'advanceService');
    this.clock = requireObject(context.clock, 'clock');
    this.logger = context.logger || console;
    this.timers = context.timers || {
      setTimeout: setTimeout,
      clearTimeout: clearTimeout
    };
    this.options = freezeWriterOptions(context.options || {});
    this.manualDrain = context.manualDrain === true;
    this.state = 'CREATED';
    this.ready = false;
    this.reason = 'CREATED';
    this.leaseToken = null;
    this.fatalError = null;
    this.tail = Promise.resolve();
    this.timerIds = new Set();
  }

  start() {
    return this._enqueue('start', () => this._startSync());
  }

  stop() {
    return this._enqueue('stop', () => this._stopSync('STOPPED'));
  }

  drainNow() {
    return this._enqueue('drainNow', () => this._drainSync());
  }

  runCommand(command) {
    return this._enqueue('runCommand', () => this._runCommandSync(command));
  }

  schedule(job) {
    return this._enqueue('schedule', () => this._scheduleSync(job));
  }

  cancel(jobId, reason) {
    return this._enqueue('cancel', () => this._cancelSync(jobId, reason));
  }

  reconcile(options) {
    return this._enqueue('reconcile', () => this._reconcileSync(options));
  }

  advanceTo(accountId, targetS) {
    return this._enqueue('advanceTo', () => this._advanceToSync(accountId, targetS));
  }

  getStatus() {
    return this._statusSnapshot();
  }
}
```

Define same-file helpers `schedulerError(code, message)`,
`requireObject(value, label)`, and `freezeWriterOptions(options)`. These helpers
must throw bounded `.code` errors and must not read the database.

- [ ] Create `server/scheduler/index.js` with option validation and a direct
  bridge. Do not import or edit `server/scheduler/contract.js`.

```js
var crypto = require('crypto');
var { SchedulerWriter } = require('./writer.js');
var { SchedulerStore } = require('./store.js');
var { EventReducer } = require('./reducers.js');
var { GameAdvanceService } = require('./advance-service.js');

function inRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function resolveDurableSchedulerOptions(input) {
  var allowed = new Set([
    'schedulerPollMs',
    'schedulerLogTicks',
    'cleanupMs',
    'schedulerLeaseMs',
    'schedulerLockMs',
    'schedulerRetryBaseMs',
    'schedulerRetryMaxMs',
    'schedulerMaxAttempts',
    'schedulerQuarantineLimit'
  ]);
  var options = Object.assign({
    schedulerPollMs: 1000,
    schedulerLogTicks: false,
    cleanupMs: 60000,
    schedulerLeaseMs: 15000,
    schedulerLockMs: 30000,
    schedulerRetryBaseMs: 1000,
    schedulerRetryMaxMs: 300000,
    schedulerMaxAttempts: 8,
    schedulerQuarantineLimit: 0
  }, input || {});
  Object.keys(input || {}).forEach(function (key) {
    if (!allowed.has(key)) {
      throw schedulerError('SCHEDULER_OPTIONS_UNKNOWN', key);
    }
  });
  validateDurableOptions(options);
  return Object.freeze(options);
}
```

- [ ] `taoScheduler(context)` must support two Task-6-only construction
  shapes:

  - Direct test shape with `{ writer }`: return a memoized bridge around that
    writer. Memoize in a `WeakMap` keyed by the writer.
  - Production construction shape with `{ kho, tg, clock, logger,
    schedulerOptions, makeOwnerId }`: build `SchedulerStore`,
    `GameAdvanceService`, `EventReducer`, and `SchedulerWriter`, then return the
    same bridge. Memoize in a `WeakMap` keyed by `kho`.

  Reject unknown context keys with `SCHEDULER_CONTEXT_UNKNOWN`. `makeOwnerId` is
  a Task 6 deterministic test seam; if absent use `crypto.randomUUID`.

- [ ] Create `server/scheduler/cutover.js`. `runMaintenanceCutover(context)`
  must:

  1. Run the existing scheduler migration.
  2. Construct or use a `SchedulerStore`.
  3. Reject unless `scheduler_mode` is `legacy`.
  4. Reject any nonempty durable queue/application/audit state with
     `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`.
  5. Acquire a UUID-v4 writer lease.
  6. Create the combat seed through
     `store.getOrCreateCombatSeedKey(token, nowMs)`.
  7. Update `scheduler_meta.scheduler_mode` to `durable`.
  8. Write one bounded `CUTOVER` audit row.
  9. Commit, then release the lease in a second synchronous UoW.
  10. Return exactly
      `{ action: 'cutover', mode: 'durable', imported: 0, recovered: 0 }`.

- [ ] Create `tools/scheduler-cutover.js` as a local command only. It accepts:

```bash
node tools/scheduler-cutover.js --db /absolute/or/relative/file.sqlite --action cutover
```

It must reject missing/unknown flags, unsupported actions, and directories. It
must print one JSON line on success and one bounded error JSON line on failure.
It must not call HTTP, import app/server startup, or inspect browser assets.

### Step 1.4: Prove GREEN for Task 1

- [ ] Run:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 168$' "$tap_file"
rg -q '^# pass 167$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Task 2: Writer startup, lease, heartbeat, recovery, and status lifecycle

**Files:**

- Modify `tools/test-scheduler.js`
- Modify `server/scheduler/writer.js`

**Interfaces completed:**

- `SchedulerWriter.start()`
- `SchedulerWriter.stop()`
- `SchedulerWriter.getStatus()`
- Internal lease/timer/heartbeat/recovery methods

### Step 2.1: Append seven RED lifecycle tests

- [ ] Add exactly these tests:

  1. `Task 6 legacy writer reports health-visible standby and never drains`:
     create a Task 5 reducer fixture but do not switch durable mode; release
     the setup lease; start a writer; assert status
     `{ ready: false, state: 'LEGACY', reason: 'SCHEDULER_MODE_LEGACY' }`;
     assert no combat seed row is created, no lease is held by the writer, and
     `drainNow()` returns `{ processed: 0, reason: 'NOT_READY' }`.
  2. `Task 6 invalid owner is rejected before database work`:
     construct with `ownerId: 'writer-a'`; assert code
     `SCHEDULER_OWNER_INVALID`; assert scheduler metadata and writer lease rows
     are byte-for-byte unchanged from the pre-construction snapshot.
  3. `Task 6 only one writer holds the durable lease and release permits takeover`:
     start writer A; assert ready and lease generation `1`; start writer B at
     the same clock; assert B is standby with `LEASE_BUSY`; stop A; advance
     clock past the released lease instant; start B; assert B is ready and
     generation increased.
  4. `Task 6 manualDrain start creates no poll wake heartbeat or reconcile timers`:
     start a `manualDrain: true` writer; assert the fake timer map is empty;
     assert no work is processed until explicit `drainNow()`.
  5. `Task 6 heartbeat renews before one third lease and lease loss stops timers`:
     start a non-manual writer; assert heartbeat delay is
     `Math.floor(leaseMs / 3) - 1`; fire heartbeat and assert `expires_at_ms`
     moves forward; delete or replace the lease row in a second UoW; fire
     heartbeat again; assert state `STANDBY`, reason `LEASE_LOST`, no active
     timers, and no additional drain occurs.
  6. `Task 6 fatal storage error clears timers and refuses new admission`:
     inject a startup-only store method that throws
     `{ code: 'SCHEDULER_STORAGE_FATAL' }` after lease acquisition; assert state
     `FATAL`, reason
     `STORAGE_FATAL`, timers cleared, lease not released by a failed writer, and
     `runCommand()` rejects with `SCHEDULER_NOT_READY`.
  7. `Task 6 startup recovers expired RUNNING rows exactly once`:
     create a RUNNING job with an expired lock under an old owner; start writer
     A; assert `recoverExpiredRunning` increments attempts once and moves the
     row to `RETRY_WAIT` or `QUARANTINED` according to attempt count; stop and
     restart writer A; assert the same row is not recovered a second time unless
     it is RUNNING and expired again.

### Step 2.2: Prove RED for Task 2

- [ ] Run:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 175$' "$tap_file"
rg -q '^# fail [1-7]$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 2.3: Implement startup lifecycle

- [ ] Complete `SchedulerWriter._startSync()` in this order:

  1. If state is terminal `FATAL`, reject with `SCHEDULER_FATAL`.
  2. Read `store.schedulerMode()`. If not `durable`, set legacy status and do
     not acquire a lease.
  3. Acquire lease with `store.acquireLease(ownerId, nowMs, leaseMs)`.
  4. If no token is returned, set standby status and do not initialize seed,
     recover, or schedule drain timers.
  5. Record monotonic effective time using
     `peekEffectiveNowMs()` and `recordEffectiveNowMs()`.
  6. Call `reducer.initializeCombatSeed({ leaseToken, nowMs })`.
  7. Call `store.assertAccountDependencyIntegrity(token, nowMs)` if present in
     the live store.
  8. Call `store.recoverExpiredRunning(token, nowMs, lockMs, retryPolicy)`.
  9. Mark recovery complete, ready, lease-held, and schedule timers only when
     `manualDrain !== true`.

- [ ] Implement timer lifecycle:

  - Track every timer id in a single set.
  - Heartbeat delay is `Math.max(1, Math.floor(leaseMs / 3) - 1)`.
  - Poll delay is `schedulerPollMs` unless `store.nextEligibleAtMs` returns an
    earlier due time.
  - Wakes replace older poll timers instead of stacking duplicates.
  - `stop()` clears timers before releasing the lease.
  - Lease release happens in a separate synchronous UoW and only when the
    current writer still owns the token.

- [ ] Implement status shape with at least:

```js
{
  ready: Boolean,
  reason: String,
  state: String,
  dbOpen: Boolean,
  leaseHeld: Boolean,
  writerLeaseHeld: Boolean,
  ownerId: String,
  watermarkS: Number,
  counts: Object,
  ages: Object,
  recoveryComplete: Boolean,
  draining: Boolean,
  timerFlags: Object,
  signalHandlerInstalled: false,
  metrics: Object
}
```

### Step 2.4: Prove GREEN for Task 2

- [ ] Run:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 175$' "$tap_file"
rg -q '^# pass 174$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Task 3: Drain loop, watermark, retry/backoff, quarantine, and partials

**Files:**

- Modify `tools/test-scheduler.js`
- Modify `server/scheduler/writer.js`
- Modify `server/scheduler/store.js` only for a narrowly failing store-consumer
  seam proven by the RED tests

**Interfaces completed:**

- `SchedulerWriter.drainNow()`
- Internal global-then-local claim loop
- Internal `executeClaimedInCurrentUow`
- Internal retry/quarantine settlement
- Internal budget continuation scheduling

### Step 3.1: Append seven RED drain tests

- [ ] Add exactly these tests:

  1. `Task 6 global retry keeps watermark and account claim cannot cross it`:
     create a due global barrier at `NOW_S`, force its first execution to throw
     `SQLITE_BUSY`, create an account advance after `NOW_S`; assert the global
     row moves to `RETRY_WAIT`, `globalWatermarkS()` remains `NOW_S`, and the
     account row is not claimed until the global completes.
  2. `Task 6 local poison retry does not block independent aggregates`:
     create account A and account B jobs at the same second; force A to throw
     retryable storage failure; assert A moves to `RETRY_WAIT` and B completes
     in the same or next drain without waiting for A.
  3. `Task 6 retry reaches max attempts then quarantines with deterministic backoff`:
     force the same job through attempts 1 through 8; assert retry timestamps
     equal `retryAtMs(job.id, nextAttempt, nowMs, policy)` through attempt 7;
     assert attempt 8 transitions to `QUARANTINED` with a bounded code and no
     `next_attempt_at_ms`.
  4. `Task 6 payload tamper and unclassified reducer errors quarantine before effects`:
     corrupt a pending job payload/hash and assert quarantine before
     `reducer.prepare`; then force `reducer.prepare` to throw a plain `Error`;
     assert quarantine and assert no world/save/application effects were
     committed.
  5. `Task 6 account partial checkpoint preserves RUNNING and completes on continuation`:
     create a job whose reducer consumes exactly the 50,000-tick budget and
     returns `{ checkpointRevision, saveReceipt }`; assert
     `store.checkpointPartial` persists the checkpoint, the row remains
     `RUNNING`, no duplicate application row is inserted, and the second
     `drainNow()` completes the same job.
  6. `Task 6 global barrier partial remains RUNNING and resumes before account work`:
     create a global barrier that partially advances an account and an account
     job at the same time; assert the first drain leaves the global row
     `RUNNING`, assert the account job is not claimed, assert the second drain
     completes the barrier, then the account job proceeds.
  7. `Task 6 quarantine warning is scrubbed and quarantine budget gates MutationGate`:
     quarantine a job with a message containing a password-like value; assert
     one warning log contains the code and a scrubbed message; set
     `schedulerQuarantineLimit: 0`; assert `runCommand()` rejects with
     `SCHEDULER_QUARANTINE_LIMIT`.

### Step 3.2: Prove RED for Task 3

- [ ] Run:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 182$' "$tap_file"
rg -q '^# fail [1-7]$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 3.3: Implement drain order and execution

- [ ] Implement `SchedulerWriter._drainSync()` as a bounded loop:

  1. Reject or return `{ processed: 0, reason: 'NOT_READY' }` when not ready.
  2. Allocate one mutable budget object per drain:
     `{ value: 50000 }`.
  3. Refresh/validate the current lease before each claim.
  4. Claim due global barrier work first with `store.claimForResolution` or the
     live barrier-list helpers.
  5. Resolve all global rows at or before effective time before account-local
     work.
  6. Compute `watermarkS = store.globalWatermarkS()`.
  7. Claim account-local work with `store.claimNext(token, nowMs, watermarkS,
     lockMs)`.
  8. Stop when no eligible work remains, the budget is exhausted, the lease is
     lost, or a fatal storage condition is reached.

- [ ] Implement execution inside one synchronous UoW:

```js
function executeClaimedInCurrentUow(executableJob, mutation) {
  var canonical = store.assertCanonicalExecutable(
    mutation.leaseToken,
    executableJob,
    mutation.effectiveNowMs
  );
  store.markDurableMutation(mutation.leaseToken, canonical, mutation.effectiveNowMs);
  var alreadyApplied = store.hasCommittedApplication(
    mutation.leaseToken,
    canonical.id,
    mutation.effectiveNowMs
  );
  var prepared = reducer.prepare(canonical, {
    executionTargetS: canonical.scheduled_at_s
  });
  var application = prepared.application;
  var effect = prepared.effect;
  if (!alreadyApplied) {
    store.insertApplication(
      mutation.leaseToken,
      canonical,
      application,
      mutation.effectiveNowMs,
      prepared.canonicalTContext
    );
    reducer.applyPrepared(mutation, prepared);
  }
  finalizeLifecycle(canonical, prepared, effect, mutation);
}
```

The exact implementation may split this function, but it must keep the same
observable ordering: canonical executable check, durable mutation mark,
prepare, idempotency check/application insert, apply only when new, lifecycle
finish, and lease refresh before commit.

- [ ] Implement partial semantics:

  - For account `ACCOUNT_ADVANCE` effects with both `checkpointRevision` and
    `saveReceipt` present, call `store.checkpointPartial` and keep the row
    `RUNNING`.
  - For established-zero account effects where both fields are `null`, do not
    call checkpoint/block/finish; keep the row `RUNNING` for a continuation.
  - For global partial barriers, keep the global row `RUNNING`, schedule a
    continuation wake, and do not release dependent account jobs.
  - Only call `completeAccountAdvanceAndScheduleSuccessor`,
    `finishResolved`, or `completeApplied` after a full prepared result.

- [ ] Implement failure settlement outside the effect transaction:

  - Roll back the failed effect transaction.
  - Open a new synchronous UoW.
  - Classify the error.
  - For retryable errors below max attempts, call `store.fail` so the job
    becomes `RETRY_WAIT` with deterministic retry time.
  - For payload, invariant, unclassified, and max-attempt errors, call
    `store.fail` so the job becomes `QUARANTINED`.
  - For storage fatality that prevents settlement, set writer state `FATAL`,
    clear timers, and preserve enough status/logging for diagnosis.
  - For injected crash test errors, rethrow without lifecycle settlement.

- [ ] Emit scrubbed warnings only through the configured logger. Never log raw
  payload JSON, password-like values, tokens, or full stack traces.

### Step 3.4: Prove GREEN for Task 3

- [ ] Run:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 182$' "$tap_file"
rg -q '^# pass 181$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Task 4: MutationGate bridge, `advanceTo`, direct factory, and no Task 7 leakage

**Files:**

- Modify `tools/test-scheduler.js`
- Modify `server/scheduler/writer.js`
- Modify `server/scheduler/index.js`

**Interfaces completed:**

- `SchedulerWriter.runCommand(command)`
- `SchedulerWriter.advanceTo(accountId, targetS)`
- `taoScheduler(context)` direct and production construction bridge

### Step 4.1: Append five RED MutationGate/factory tests

- [ ] Add exactly these tests:

  1. `Task 6 runCommand validates command before durable marker or game write`:
     call `runCommand` with missing method, invalid target, and a Promise-return
     closure; assert `SCHEDULER_COMMAND_INVALID` or `UNIT_OF_WORK_ASYNC`; assert
     no durable mutation marker, game save, account advance, or queue row was
     written.
  2. `Task 6 runCommand drains same-second global barrier before command closure`:
     create a due global PvP/external barrier at `T`; call `runCommand` for a
     command at `T`; assert the barrier application committed before the command
     closure snapshot and assert the closure observed the post-barrier world.
  3. `Task 6 runCommand defers on budget partial without invoking command closure`:
     create due global work that consumes the 50,000-tick budget; call
     `runCommand`; assert the result is exactly
     `{ deferred: true, code: 'TICK_PARTIAL' }`; assert the command closure
     counter stays zero and a continuation wake is scheduled.
  4. `Task 6 advanceTo rejects future targets and returns exact public keys`:
     call `advanceTo(accountId, NOW_S + 1)` with current time `NOW_S`; assert
     `ADVANCE_TARGET_IN_FUTURE` before any write; call
     `advanceTo(accountId, NOW_S)` and assert
     `Object.keys(result).sort()` equals
     `['advanced', 'processed', 'remainingBudget', 'targetS', 'updated']`.
  5. `Task 6 taoScheduler memoizes bridge and creates one UUID owner per Kho`:
     call `taoScheduler({ writer })` twice and assert the same bridge; call
     production construction twice with the same `kho` and deterministic
     `makeOwnerId`; assert one writer owner is created, the same bridge is
     returned, unknown keys reject, and the bridge exposes only
     `start`, `stop`, `getStatus`, `runCommand`, `schedule`, `cancel`,
     `reconcile`, and `advanceTo`.

### Step 4.2: Prove RED for Task 4

- [ ] Run:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 187$' "$tap_file"
rg -q '^# fail [1-5]$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 4.3: Implement MutationGate and scheduler bridge

- [ ] Implement `SchedulerWriter._runCommandSync(command)`:

  - Validate command shape before opening a write UoW. Required shape:
    `{ type, accountId, effectiveNowS, run }`, where `run` is a synchronous
    function and `effectiveNowS` is an integer not in the future.
  - Assert ready, live lease, nonfatal state, and quarantine count within
    `schedulerQuarantineLimit`.
  - Record monotonic effective time.
  - Drain due global barriers at or before `effectiveNowS`.
  - If the barrier drain returns budget partial, commit no command mutation and
    return exactly `{ deferred: true, code: 'TICK_PARTIAL' }`.
  - Open one command UoW, revalidate the lease, call
    `store.markDurableMutation`, optionally adopt the account advance dependency
    through the live store helper, invoke `command.run(mutation)`, reject Promise
    results, flush metrics, and commit.
  - Schedule a continuation after commit when command-side work enqueued
    eligible scheduler rows.

- [ ] Implement `SchedulerWriter._advanceToSync(accountId, targetS)`:

  - Reject future targets before opening a write UoW.
  - Assert ready and live lease.
  - Drain due global barriers at or before `targetS` first.
  - Open one UoW and call `advanceService.advanceTo(mutation, accountId,
    targetS)`.
  - Return `toPublicAdvanceResult` output with exactly five keys.

- [ ] Implement bridge methods in `index.js`:

```js
function bridgeForWriter(writer) {
  return Object.freeze({
    start: function () { return writer.start(); },
    stop: function () { return writer.stop(); },
    getStatus: function () { return writer.getStatus(); },
    runCommand: function (command) { return writer.runCommand(command); },
    schedule: function (job) { return writer.schedule(job); },
    cancel: function (jobId, reason) { return writer.cancel(jobId, reason); },
    reconcile: function (options) { return writer.reconcile(options); },
    advanceTo: function (accountId, targetS) {
      return writer.advanceTo(accountId, targetS);
    }
  });
}
```

For Task 6, `schedule`, `cancel`, and `reconcile` may be narrow durable helpers
backed by existing store primitives and must remain internal. Do not route API
or world calls through them in this task.

### Step 4.4: Prove GREEN for Task 4

- [ ] Run:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 187$' "$tap_file"
rg -q '^# pass 186$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Task 5: Full verification, report, and review handoff

**Files:**

- Create
  `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md`
- No additional source paths

### Step 5.1: Run complete local verification

- [ ] Run direct TAP:

```bash
node tools/test-scheduler.js
```

Expected result after exactly the planned Task 6 tests: 187 tests, 186 passed,
0 failed, 1 skipped.

- [ ] Run throw-deprecation TAP:

```bash
node --throw-deprecation tools/test-scheduler.js
```

Expected result: 187 tests, 186 passed, 0 failed, 1 skipped.

- [ ] Run syntax checks:

```bash
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
```

- [ ] Run scoped whitespace check:

```bash
git diff --check -- \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  server/scheduler/store.js \
  tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md
```

- [ ] Run the broader project test command only after the Task 6 scoped suite is
  green:

```bash
npm test
```

If an existing environment restriction blocks a non-Task-6 test, record the
exact command, exit code, and blocker text in the report. Do not convert a
blocked command into a pass.

### Step 5.2: Write Task 6 report

- [ ] Create
  `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md`
  with:

  - Summary of implemented writer lifecycle, watermark, retry/quarantine,
    MutationGate, factory, and cutover behavior.
  - Exact final `sha256sum`, line count, and byte count for every owned file.
  - Exact verification commands and outputs.
  - Confirmation that no Task 7+ paths were edited.
  - Confirmation that the superseded Task 5 forensic harness was not used as
    acceptance evidence.
  - Review routing request for two fresh `gpt-5.6-sol high` reviews:
    behavior/logic and scope/runtime.

### Step 5.3: Scope and contradiction audit before handoff

- [ ] Run:

```bash
git diff --name-only -- \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  server/scheduler/store.js \
  tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md
```

The output must contain only owned Task 6 files. If `server/app.js`,
`server/api.js`, `server/world.js`, `server/index.js`,
`server/scheduler/contract.js`, browser/UI files, `dist/`, or package files
appear in the Task 6 diff, revert or isolate that scope before review.

- [ ] Search for prohibited Task 7+ routing:

```bash
rg -n "require\\('./scheduler/index|require\\(\"./scheduler/index|taoScheduler\\(" \
  server/app.js server/api.js server/index.js server/world.js server/scheduler/contract.js
```

This command may print existing Foundation `contract.js` references. It must
not show new Task 6 durable routing in app/API/world entry points.

- [ ] Search the new writer for reducer option leakage:

```bash
rg -n "reducer\\.prepare|deferAccountFinalize" server/scheduler/writer.js
```

Review every `reducer.prepare` call printed by this command. Each call must
pass only `{ executionTargetS: ... }`; any occurrence of `deferAccountFinalize`
in executable code is a failure.

- [ ] Search for placeholders and unfinished markers in owned Task 6 paths:

```bash
rg -n "TODO|TBD|FIXME|placeholder|stub|fake implementation|skip this test" \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md
```

The command must produce no matches in new implementation code or tests.

### Step 5.4: Review handoff

- [ ] Request fresh behavior/logic review from `gpt-5.6-sol high` focused on:

  - Startup order: migrate/health, lease, seed, recovery, integrity, ready,
    timers.
  - Single-writer lease fencing and generation checks.
  - Global watermark and claim ordering.
  - Retry/backoff/quarantine classification and deterministic timing.
  - Partial checkpoint/restart/replay semantics.
  - MutationGate admission order and command UoW boundaries.

- [ ] Request fresh scope/runtime review from `gpt-5.6-sol high` focused on:

  - Owned-file allowlist.
  - No Task 7+ app/API/world/HTTP routing.
  - No public behavior changes outside direct scheduler surfaces.
  - Timer cleanup, no unbounded sleep, no Promise in UoW, no leaked credentials
    in logs.
  - CLI remains local-only and cutover remains fresh-only.

## Completion Definition

Task 6 is complete only when all of these are true:

- The 24 new Task 6 tests are present and meaningful.
- Direct TAP and throw-deprecation TAP both report 187 tests, 186 passed,
  0 failed, and 1 skipped.
- Syntax checks and scoped `git diff --check` pass.
- `npm test` either passes or has a precisely reported external blocker.
- The Task 6 report exists with final hashes, line counts, byte counts, and
  verification evidence.
- Two fresh read-only Sol reviews pass or every review finding has been
  addressed with a new verification run.
- No Task 7+ files are edited by Task 6.
