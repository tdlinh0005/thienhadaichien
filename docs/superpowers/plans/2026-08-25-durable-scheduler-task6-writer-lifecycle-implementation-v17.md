# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V17

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every implementation wave and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark, retry/backoff/quarantine, command MutationGate, fresh cutover, CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** Keep the V16 structure and test arithmetic: parent runtime registrations `73` plus remediation overlay registrations `9` gives `N=82`; accepted baseline `163/162/0/1` becomes final scheduler TAP `245/244/0/1`. V17 only changes the failed contracts: replay always prepares, blocked-account validation returns a safe descriptor, owned RUNNING uses `resumeOwnedRunning`, public `advanceTo` returns the Task5 five-key shape only, status does not expose internal effective time, due processing preserves live `dqDenHan` order, Stage-A validates all report fields from fresh runs, and overlay9 contains exact executable JS bodies sealed by byte slice.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.

## Global constraints

- Preserve V1-V16 plan artifacts. This planning task creates only this V17 file.
- Implementation may edit exactly these six Task6-owned source/test files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task7+ production edits. Forbidden examples include `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, every `js/*.js`, and `web/js/mp.js`.
- Parent runtime registrations: `73`.
- Overlay runtime registrations: `9`.
- Mechanical count: `parent runtime=73 + overlay=9 => N=82`.
- Expected final scheduler TAP: `245 tests`, `244 pass`, `0 fail`, `1 skipped`.
- Parent regression 73 tests do not need individual RED evidence. Overlay9 tests do.
- Parent Task6, accepted Task5, and live source APIs override any V1-V16 conflict.
- No report self-hash and no embedded V17 self-hash; embedding the plan's own SHA would be self-referential. Root must pass `TASK6_V17_APPROVED_SHA` externally.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
```

Approved plan hash check:

```bash
test -n "$TASK6_V17_APPROVED_SHA"
case "$TASK6_V17_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V17_APPROVED_SHA}" -eq 64
plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v17.md'
test -f "$plan"
test ! -L "$plan"
python3 - <<'PY' "$plan"
import os, stat, sys
st = os.lstat(sys.argv[1])
mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
    raise SystemExit('V17 plan must be real regular 100644')
PY
test "$(sha256sum "$plan" | awk '{print $1}')" = "$TASK6_V17_APPROVED_SHA"
printf '%s  %s\n' "$TASK6_V17_APPROVED_SHA" "$plan" > /tmp/task6-v17-approved-plan.sha256
sha256sum -c /tmp/task6-v17-approved-plan.sha256
```

## Exact V17 corrections

### 1. Replay and Task5 downstream order

Every executable call path calls `reducer.prepare(mutation, executable, options)`, including jobs with an already committed application. The committed-application replay branch is:

1. `markDurableMutationInCurrentUow(mutation, nowMs)`.
2. Global `advanceBarrier` before reducer for global jobs.
3. `prepared = reducer.prepare(mutation, executable, options)`.
4. `application = store.insertApplication(token, executable, prepared.application, nowMs, prepared.canonicalTContext || null)`.
5. `store.insertApplication` revalidates immutable committed bytes and returns an object with `alreadyApplied:true` plus the immutable stored application fields when the application already exists.
6. If `application.alreadyApplied === true`, skip only `reducer.applyPrepared` and any world effect. Do not skip `prepare`.
7. Finish terminal bookkeeping from the prepared/application result.

The overlay must fail if prepare is not called on replay.

### 2. Blocked account validator returns descriptor, never executable

`validateBlockedAccountAdvanceForDependency(token, accountId, revision, dependencyJobId, targetS, nowMs)` must not call `loadExecutableJob` because the candidate is blocked `PENDING`, not branded `RUNNING`.

Implementation contract:

- Assert live lease.
- Query the exact idempotency key `account-advance:${accountId}:${revision}`.
- If no row with non-null `blocked_by_job_id` exists, return `null`.
- Validate raw payload with `parseCanonicalBoundedJson(row.payload_json, row.payload_sha256)`.
- Validate canonical job with `validateJob(executableInput(row, payload), {allowReconcile:true})`; add `executableInput` to Store-internal scope or export it only if already exported by live Store policy allows it.
- Require kind `ACCOUNT_ADVANCE`, aggregate type `account`, aggregate id `String(accountId)`, expected revision `revision`, idempotency key exact, `state === 'PENDING'`, `blocked_by_job_id === dependencyJobId`, `checkpoint_revision === revision`, and `scheduled_at_s <= targetS`.
- Validate dependency row id `dependencyJobId` exists, kind `PVP_RESOLVE` or `EXTERNAL_RESOLVE`, `replay_of_job_id IS NULL`, `source_account_id === accountId`, state in `PENDING/RUNNING/RETRY_WAIT/QUARANTINED`, and `scheduled_at_s >= row.scheduled_at_s`.
- Return a frozen descriptor only:

```js
Object.freeze({
  id: row.id,
  accountId: accountId,
  revision: revision,
  scheduledAtS: Number(row.scheduled_at_s),
  blockedByJobId: dependencyJobId
})
```

- Never return raw payload, raw row, or executable.
- If a blocked row exists but any check fails, throw `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`; if lease is lost, throw `LEASE_LOST`.

Writer consumption:

- Pre-existing blocked descriptor is used only as proof that the continuation already exists.
- Writer must not pass descriptor to `loadExecutableJob`, `blockOwnedAccountAdvance`, or reducer.
- New adoption path still uses `adoptAccountAdvanceForCommand` to brand an unblocked row RUNNING, then `blockOwnedAccountAdvance`.

### 3. Owned RUNNING global classification

Global owned RUNNING continuation must use `resumeOwnedRunning(token, id, nowMs, leaseMs)`. `claimForResolution` is only for PENDING, due RETRY_WAIT, or explicit allowed QUARANTINED contracts. Parent classification order:

1. Recompute effective time inside the claim UoW.
2. Inspect first global tuple.
3. If tuple is owned RUNNING with live lock, call `resumeOwnedRunning`.
4. If tuple is foreign RUNNING, block accounts at or beyond the root watermark.
5. If tuple is future RETRY_WAIT, return retry wait.
6. If tuple is QUARANTINED, allow only due account work through its watermark.
7. Only after global classification allows account work may account `claimNext` run.

### 4. TAP normalization

The TAP normalizer strips both subtest YAML duration and root reporter duration:

```bash
cat > /tmp/task6-v17-tap-normalize.sh <<'SH'
normalize_tap_for_hash() {
  sed -E '/^[[:space:]]+duration_ms:/d;/^# duration_ms /d' "$1"
}
SH
sha256sum /tmp/task6-v17-tap-normalize.sh > /tmp/task6-v17-tap-normalize.sh.sha256
```

Stage-A and Stage-B may record fresh normalized TAP hashes, but deterministic equality is enforced only for names/counts and immutable source metadata. If the report records Stage-A fresh hashes, Stage-B reruns Stage-A and updates/checks `stage_b_*` fields separately; it must not fail solely because a normalized TAP hash differs after all duration lines are stripped unless names/counts differ.

### 5. Public `advanceTo` result

`advanceTo(accountId,targetS)` returns exactly `toPublicAdvanceResult(internalAdvanceOutcome)`: five enumerable public keys only:

```js
['advancedToS', 'budgetExhausted', 'hasMoreDue', 'nextDueAtS', 'processed']
```

Internal metadata `deferredExternal`, `blockedExternalJobId`, `partialJobId`, and continuation metadata are committed bookkeeping only. They are used for postcommit continuation scheduling and never escape the public `advanceTo` result.

### 6. Index exports

`server/scheduler/index.js` exports exactly:

```js
module.exports = {
  taoScheduler: taoScheduler,
  inRange: inRange,
  resolveDurableSchedulerOptions: resolveDurableSchedulerOptions
};
```

`baseSchedulerOptions` remains private and non-exported.

### 7. Status public schema

`effectiveNowMs` is internal only. It is used to calculate due ages and lease checks, but it is not a public status key. Public status follows the parent nested schema only: ready/state/reason/dbOpen/mode/watermarkS, counts/ages/next eligible, and nested metrics. Overlay 4 fails if `status().effectiveNowMs` exists.

### 8. Due ordering

`advanceDueInCurrentUow` preserves live `kho.q.dqDenHan.all(nowS, 61)` order, which is `ORDER BY keTiep,tk`. It must not sort by account id only. Overlay 7 seeds mixed `keTiep` values and asserts processing order matches live query order.

### 9. Stage-A report fields

Report format includes exact lines:

```text
plan_v17_sha=<approved sha>
parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf
prefix_len=<number>
prefix_sha=<sha>
baseline_names_sha=<sha>
parent73_names_sha=<sha>
overlay9_names_sha=<sha>
overlay_slice_sha=<sha>
parent_blocks_sha=<sha>
parent_slice_sha=<sha>
overlay_red_evidence_sha=<sha>
final_normalized_tap_sha=<sha>
final_throw_normalized_tap_sha=<sha>
stage_a_normalized_tap_sha=<sha>
stage_a_throw_normalized_tap_sha=<sha>
stage_a_counts=245 tests / 244 pass / 0 fail / 1 skipped
node_check_status=PASS
whitespace_status=PASS
inventory_status=PASS
stage_a_status=PASS
parent runtime=73 + overlay=9 => N=82
```

For every sealed six-file metadata row, append one exact line:

```text
six_meta=<path>	<type>	<fs_mode>	<tracked_mode>	<size>	<sha256>
```

Stage-A loops over `/tmp/task6-v17-six-meta.sealed.tsv` and requires each `six_meta=` line in the report.

## Overlay9 executable JS block

Append this exact block to `tools/test-scheduler.js` between `// TASK6_V17_OVERLAY_TESTS_START` and `// TASK6_V17_OVERLAY_TESTS_END`. It uses only helpers already present before the append point (`test`, `assert`, `taoKhoTam`, `dongKhoTam`, `apDungMigrationScheduler`, `fakeClock`, `NOW_MS`, `NOW_S`, `PASSWORD_HASH`, and `PASSWORD_SALT`) plus lazy requires inside test bodies.

```js
// TASK6_V17_OVERLAY_TESTS_START
function task6v17Sentinel(sentinel, body) {
  return async function (t) {
    try { return await body(t); }
    catch (error) {
      error.message = sentinel + ': ' + (error && error.message || String(error));
      throw error;
    }
  };
}
function task6v17Owner(suffix) {
  return '11111111-1111-4111-8111-' + String(suffix).padStart(12, '1').slice(-12);
}
function task6v17JobId(suffix) {
  return '22222222-2222-4222-8222-' + String(suffix).padStart(12, '2').slice(-12);
}
function task6v17DurableKho(t, label) {
  var x = taoKhoTam();
  t.after(function () { dongKhoTam(x); });
  apDungMigrationScheduler(x.kho, NOW_MS);
  x.kho.db.prepare(
    "UPDATE scheduler_meta SET value='durable',updated_at_ms=? WHERE key='scheduler_mode'"
  ).run(NOW_MS);
  return x;
}
function task6v17Acquire(store, ownerId, nowMs, leaseMs) {
  var token = store.acquireLease(ownerId, nowMs, leaseMs || 15000);
  assert.ok(token, 'lease acquired');
  return token;
}
function task6v17Stack(t, label) {
  var modules = {
    SchedulerStore: require('../server/scheduler/store.js').SchedulerStore,
    SchedulerWriter: require('../server/scheduler/writer.js').SchedulerWriter,
    EventReducer: require('../server/scheduler/reducers.js').EventReducer,
    GameAdvanceService: require('../server/scheduler/advance-service.js').GameAdvanceService
  };
  var x = task6v17DurableKho(t, label);
  var clock = fakeClock(NOW_MS);
  var store = new modules.SchedulerStore(x.kho, clock);
  var world = new TheGioi(x.kho, {clock: clock});
  world.datScheduler(store);
  var advanceService = new modules.GameAdvanceService({
    kho: x.kho, world: world, store: store, clock: clock
  });
  world.datAdvanceService(advanceService);
  var reducer = new modules.EventReducer({
    kho: x.kho, world: world, store: store, clock: clock, advanceService: advanceService
  });
  return Object.assign({x: x, clock: clock, store: store, world: world,
    advanceService: advanceService, reducer: reducer}, modules);
}
function task6v17SeedAccount(stack, label, offsetS) {
  var username = 'v17' + label.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase();
  stack.x.kho.q.tkThem.run(username, label, PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
  var account = stack.x.kho.q.tkTheoTen.get(username);
  var empire = stack.world.taoDeQuoc(account.id, label);
  assert.ok(empire && empire.st, 'empire created');
  if (Number.isSafeInteger(offsetS)) {
    stack.x.kho.db.prepare('UPDATE dq SET keTiep=? WHERE tk=?').run(NOW_S + offsetS, account.id);
  }
  return account.id;
}

test('Task 6 v17 remediation Task5 live ABI order replay and arity are exact',
  task6v17Sentinel('TASK6V17_RED_001_TASK5_ABI', async function (t) {
    var EventReducer = require('../server/scheduler/reducers.js').EventReducer;
    var SchedulerWriter = require('../server/scheduler/writer.js').SchedulerWriter;
    assert.equal(EventReducer.prototype.prepare.length, 3);
    assert.equal(EventReducer.prototype.applyPrepared.length, 2);
    assert.equal(typeof SchedulerWriter.prototype.executeClaimedInCurrentUow, 'function');
    var order = [];
    var executable = Object.freeze({
      id: task6v17JobId(1),
      kind: 'PVP_RESOLVE',
      scheduled_at_s: NOW_S,
      priority: 50,
      sequence: 1,
      logical_root_id: task6v17JobId(1),
      payload: Object.freeze({schemaVersion: 1})
    });
    var mutation = {
      leaseToken: {ownerId: task6v17Owner(1), generation: 1},
      remainingBudget: {value: 50000},
      effectiveNowMs: NOW_MS,
      recordAdvance: function () {},
      recordJob: function () {}
    };
    var writer = Object.create(SchedulerWriter.prototype);
    writer.store = {
      hasCommittedApplication: function () { order.push('replay-check'); return {alreadyApplied: true}; },
      insertApplication: function () { order.push('insert-application'); return {alreadyApplied: true}; },
      completeApplied: function () { order.push('complete-applied'); },
      finishResolved: function () { order.push('finish-resolved'); },
      completeAccountAdvanceAndScheduleSuccessor: function () { order.push('complete-account'); }
    };
    writer.advanceService = {
      advanceBarrier: function () {
        order.push('advance-barrier');
        return {processed: 0, advancedToS: NOW_S, nextDueAtS: null,
          hasMoreDue: false, budgetExhausted: false};
      }
    };
    writer.reducer = {
      prepare: function () {
        order.push('prepare');
        return {kind: 'prepared', application: {result: {code: 'PVP_RESOLVED'}}};
      },
      applyPrepared: function () {
        order.push('apply-prepared');
        return {};
      }
    };
    writer.markDurableMutationInCurrentUow = function () { order.push('mark'); };
    await writer.executeClaimedInCurrentUow(mutation, executable, NOW_MS);
    assert.deepEqual(order.slice(0, 5), [
      'mark', 'advance-barrier', 'prepare', 'insert-application', 'complete-applied'
    ]);
    assert.equal(order.includes('apply-prepared'), false,
      'alreadyApplied skips only reducer.applyPrepared/world effect');
  }));

test('Task 6 v17 remediation partial receipt wrapper identity and established zero retention are exact',
  task6v17Sentinel('TASK6V17_RED_002_PARTIAL_RECEIPT', async function () {
    var SchedulerWriter = require('../server/scheduler/writer.js').SchedulerWriter;
    assert.equal(typeof SchedulerWriter.prototype.finishPreparedOrPartial, 'function');
    var receipt = {revision: 7, nextLocalAtS: NOW_S + 10};
    var advanceResult = {processed: 50000, advancedToS: NOW_S,
      nextDueAtS: NOW_S + 10, hasMoreDue: true, budgetExhausted: true,
      saveReceipt: receipt};
    var prepared = {kind: 'partial', advanceResult: advanceResult, saveReceipt: receipt};
    var effect = {checkpointRevision: receipt.revision, saveReceipt: receipt};
    assert.equal(Object.getPrototypeOf(effect), Object.prototype);
    assert.deepEqual(Object.keys(effect), ['checkpointRevision', 'saveReceipt']);
    assert.deepEqual(Reflect.ownKeys(effect), ['checkpointRevision', 'saveReceipt']);
    assert.strictEqual(effect.saveReceipt, prepared.saveReceipt);
    assert.strictEqual(prepared.saveReceipt, prepared.advanceResult.saveReceipt);
    var checkpointArgs = null;
    var writer = Object.create(SchedulerWriter.prototype);
    writer.store = {
      checkpointPartial: function (token, job, revision) {
        checkpointArgs = {token: token, job: job, revision: revision};
      }
    };
    var mutation = {leaseToken: {ownerId: task6v17Owner(2), generation: 1},
      effectiveNowMs: NOW_MS, recordAdvance: function () {}, recordJob: function () {}};
    var job = {id: task6v17JobId(2), kind: 'ACCOUNT_ADVANCE'};
    var beforeLock = JSON.stringify({locked_by: task6v17Owner(2),
      locked_generation: 1, locked_until_ms: NOW_MS + 15000});
    var result = writer.finishPreparedOrPartial(mutation, job, prepared, effect, NOW_MS);
    assert.equal(checkpointArgs.revision, 7);
    assert.equal(result.partial, true);
    assert.equal(JSON.stringify({locked_by: task6v17Owner(2),
      locked_generation: 1, locked_until_ms: NOW_MS + 15000}), beforeLock,
    'established-zero retains the running lock bytes');
  }));

test('Task 6 v17 remediation raw malformed payload quarantines without reducer prepare or payload parse',
  task6v17Sentinel('TASK6V17_RED_003_RAW_QUARANTINE', async function (t) {
    var stack = task6v17Stack(t, 'raw-quarantine');
    var token = task6v17Acquire(stack.store, task6v17Owner(3), NOW_MS, 15000);
    var accountId = task6v17SeedAccount(stack, 'raw quarantine', 1);
    stack.store.schedule(token, {kind: 'ACCOUNT_ADVANCE', scheduledAtS: NOW_S,
      priority: 100, idempotencyKey: 'account-advance:' + accountId + ':0',
      aggregateType: 'account', aggregateId: String(accountId), expectedRevision: 0,
      maxAttempts: 8, payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: NOW_S}}, NOW_MS);
    var raw = stack.store.claimNext(token, NOW_MS, null, 15000);
    stack.x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
      .run('{"not":"canonical"}', raw.id);
    var prepareCalled = false;
    var reducer = {prepare: function () { prepareCalled = true; }};
    assert.throws(function () {
      stack.store.loadExecutableJob(token, raw, NOW_MS);
    }, /PAYLOAD_INTEGRITY/);
    var quarantined = stack.store.quarantineClaimedRaw(token, raw,
      Object.assign(new Error('PAYLOAD_INTEGRITY'), {code: 'PAYLOAD_INTEGRITY'}), NOW_MS);
    assert.equal(prepareCalled, false);
    assert.equal(reducer.prepare === reducer.prepare, true);
    assert.equal(quarantined.state, 'QUARANTINED');
    var row = stack.x.kho.db.prepare(
      'SELECT state,attempt,locked_by,locked_generation,locked_until_ms,error_code FROM event_jobs WHERE id=?'
    ).get(raw.id);
    assert.equal(row.state, 'QUARANTINED');
    assert.equal(Number(row.attempt), Number(raw.attempt));
    assert.equal(row.locked_by, null);
    assert.equal(row.locked_generation, null);
    assert.equal(row.locked_until_ms, null);
    assert.equal(row.error_code, 'PAYLOAD_INTEGRITY');
  }));

test('Task 6 v17 remediation status nested metrics validation clone and DB close seams are exact',
  task6v17Sentinel('TASK6V17_RED_004_STATUS_DB_CLOSE', async function () {
    var SchedulerWriter = require('../server/scheduler/writer.js').SchedulerWriter;
    var writer = Object.create(SchedulerWriter.prototype);
    writer.clock = fakeClock(NOW_MS);
    writer.lastEffectiveNowMs = NOW_MS + 1000;
    writer.dbOpen = true;
    writer.state = 'ready';
    writer.ready = true;
    writer.reason = 'SCHEDULER_READY';
    writer.leaseToken = {ownerId: task6v17Owner(4), generation: 1};
    writer.store = {
      leaseTokenIsLive: function () { return true; },
      statusSnapshot: function () {
        return {pending: 0, retryWait: 0, running: 0, quarantined: 0,
          dueBacklog: 0, oldestDueAgeMs: 0, nextEligibleAtMs: null};
      },
      globalWatermarkS: function () { return null; }
    };
    writer.metrics = {jobAttempts: {'ACCOUNT_ADVANCE|success': 1},
      jobDuration: {'ACCOUNT_ADVANCE|success': {count: 1, sum: 5, buckets: [1, 0, 0, 0, 0]}},
      leaseAcquire: {acquired: 1, unavailable: 0, error: 0},
      reconcile: {success: 0, error: 0}, advanceProcessed: 0,
      advanceBudgetExhaustedTotal: 0, lastSuccessfulDrainTimestampMs: 0};
    var status = writer.status();
    assert.equal(Object.prototype.hasOwnProperty.call(status, 'effectiveNowMs'), false);
    status.metrics.jobDuration['ACCOUNT_ADVANCE|success'].buckets[0] = 99;
    assert.equal(writer.metrics.jobDuration['ACCOUNT_ADVANCE|success'].buckets[0], 1);
    writer.metrics.jobAttempts.bad = '1';
    var invalid = writer.status();
    assert.equal(invalid.ready, false);
    assert.equal(invalid.reason, 'SCHEDULER_STATUS_INVALID');
    writer.metrics.jobAttempts.bad = 1;
    writer.store.leaseTokenIsLive = function () { return false; };
    var leaseLost = writer.status();
    assert.equal(leaseLost.reason, 'SCHEDULER_LEASE_LOST');
    assert.equal(typeof SchedulerWriter.prototype._datDatabaseClosing, 'function');
    writer._datDatabaseClosing();
    writer.store.statusSnapshot = function () { throw new Error('SQLITE_READ_AFTER_CLOSE'); };
    var closed = writer.status();
    assert.equal(closed.ready, false);
    assert.equal(closed.dbOpen, false);
    assert.equal(closed.reason, 'SCHEDULER_DB_CLOSED');
    ['_datSignalHandlerInstalled', '_waitForStopFinalization', '_beginStop', '_datDatabaseClosing']
      .forEach(function (name) {
        var descriptor = Object.getOwnPropertyDescriptor(writer, name) ||
          Object.getOwnPropertyDescriptor(SchedulerWriter.prototype, name);
        assert.ok(descriptor, name + ' descriptor exists');
        assert.equal(descriptor.enumerable, false, name + ' non-enumerable');
      });
    assert.equal(typeof writer._datSignalHandlerInstalled, 'function');
  }));

test('Task 6 v17 remediation external only same key retarget and unrelated block are exact',
  task6v17Sentinel('TASK6V17_RED_005_RETARGET', async function (t) {
    var stack = task6v17Stack(t, 'retarget');
    var token = task6v17Acquire(stack.store, task6v17Owner(5), NOW_MS, 15000);
    var accountId = task6v17SeedAccount(stack, 'retarget account', 100);
    var dependency = stack.store.schedule(token, {kind: 'EXTERNAL_RESOLVE',
      scheduledAtS: NOW_S + 50, priority: 50,
      idempotencyKey: 'external:fleet:transport:' + accountId + ':1:1:1:1:' + NOW_S + ':' + (NOW_S + 50),
      aggregateType: 'fleet', aggregateId: '1', expectedRevision: null,
      sourceAccountId: accountId, maxAttempts: 8,
      payload: {schemaVersion: 1, ref: {kind: 'fleet', mission: 'transport',
        ownerAccountId: accountId, fleetId: 1, targetKey: '1:1:1',
        launchAtS: NOW_S, arrivalAtS: NOW_S + 50}}}, NOW_MS);
    var wake = stack.store.replaceAccountAdvance(token, accountId, 0, NOW_S + 100, NOW_MS);
    var retargeted = stack.store.retargetOwnedPendingAccountAdvanceForCommand(
      token, accountId, 0, NOW_S + 50, NOW_MS);
    assert.equal(retargeted.id, wake.id);
    assert.equal(retargeted.idempotency_key, wake.idempotency_key);
    assert.equal(Number(retargeted.scheduled_at_s), NOW_S + 50);
    var adopted = stack.store.adoptAccountAdvanceForCommand(token, accountId, NOW_S + 50, NOW_MS, 15000);
    var blocked = stack.store.blockOwnedAccountAdvance(token, adopted, 0, dependency.id, NOW_MS);
    assert.equal(blocked.blocked_by_job_id, dependency.id);
    var descriptor = stack.store.validateBlockedAccountAdvanceForDependency(
      token, accountId, 0, dependency.id, NOW_S + 50, NOW_MS);
    assert.deepEqual(Object.keys(descriptor).sort(), [
      'accountId', 'blockedByJobId', 'id', 'revision', 'scheduledAtS'
    ].sort());
    assert.equal(Object.isFrozen(descriptor), true);
    assert.equal(descriptor.blockedByJobId, dependency.id);
    assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'payload'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'kind'), false);
    assert.throws(function () {
      stack.store.validateBlockedAccountAdvanceForDependency(
        token, accountId, 0, task6v17JobId(50), NOW_S + 50, NOW_MS);
    }, /ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT/);
  }));

test('Task 6 v17 remediation startup near expiry recovery renews and rebases before ready',
  task6v17Sentinel('TASK6V17_RED_006_STARTUP_REBASE', async function (t) {
    var stack = task6v17Stack(t, 'startup');
    var ownerId = task6v17Owner(6);
    var token = task6v17Acquire(stack.store, ownerId, NOW_MS, 15000);
    var accountA = task6v17SeedAccount(stack, 'expired running', 1);
    var accountB = task6v17SeedAccount(stack, 'survivor running', 2);
    stack.store.schedule(token, {kind: 'ACCOUNT_ADVANCE', scheduledAtS: NOW_S,
      priority: 100, idempotencyKey: 'account-advance:' + accountA + ':0',
      aggregateType: 'account', aggregateId: String(accountA), expectedRevision: 0,
      maxAttempts: 8, payload: {schemaVersion: 1, accountId: accountA, nextLocalAtS: NOW_S}}, NOW_MS);
    stack.store.schedule(token, {kind: 'ACCOUNT_ADVANCE', scheduledAtS: NOW_S,
      priority: 100, idempotencyKey: 'account-advance:' + accountB + ':0',
      aggregateType: 'account', aggregateId: String(accountB), expectedRevision: 0,
      maxAttempts: 8, payload: {schemaVersion: 1, accountId: accountB, nextLocalAtS: NOW_S}}, NOW_MS);
    var expired = stack.store.claimNext(token, NOW_MS, null, 15000);
    var survivor = stack.store.claimNext(token, NOW_MS, null, 15000);
    stack.x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?')
      .run(NOW_MS - 1, expired.id);
    stack.x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?')
      .run(NOW_MS + 1, survivor.id);
    var expiredRows = stack.store.listExpiredRunningForRecovery(token, NOW_MS);
    var survivorRows = stack.store.listOwnedRunningForRecovery(token, NOW_MS);
    assert.deepEqual(expiredRows.map(function (row) { return row.id; }), [expired.id]);
    assert.deepEqual(survivorRows.map(function (row) { return row.id; }), [survivor.id]);
    stack.store.markDurableMutation(token, NOW_MS);
    assert.equal(stack.store.recoverExpiredRunning(token, NOW_MS, {
      retryBaseMs: 1000, retryMaxMs: 300000, maxAttempts: 8
    }), 1);
    stack.clock.advanceMs(14999);
    var freshNow = stack.store.recordEffectiveNowMs(token, stack.clock.nowMs());
    assert.equal(stack.store.renewLease(token, freshNow, 15000), true);
    var resumed = stack.store.resumeOwnedRunning(token, survivor.id, freshNow, 15000);
    assert.equal(resumed.id, survivor.id);
    stack.clock.advanceMs(2);
    var finalNow = stack.store.peekEffectiveNowMs(stack.clock.nowMs());
    var row = stack.x.kho.db.prepare('SELECT locked_until_ms FROM event_jobs WHERE id=?').get(survivor.id);
    assert.ok(Number(row.locked_until_ms) > finalNow);
    assert.notEqual(stack.x.kho.db.prepare('SELECT state FROM event_jobs WHERE id=?').get(expired.id).state, 'RUNNING');
  }));

test('Task 6 v17 remediation advance due 61 boundary is partial and does not run closure',
  task6v17Sentinel('TASK6V17_RED_007_DUE_61', async function () {
    var SchedulerWriter = require('../server/scheduler/writer.js').SchedulerWriter;
    assert.equal(typeof SchedulerWriter.prototype.advanceDueInCurrentUow, 'function');
    var rows = [];
    for (var i = 0; i < 61; i++) rows.push({tk: i + 1, keTiep: i === 60 ? NOW_S + 1 : NOW_S});
    var processed = [];
    var writer = Object.create(SchedulerWriter.prototype);
    writer.world = {
      _schedulerActive: function (mutation) { assert.equal(mutation.tag, 'mutation'); },
      kho: {q: {dqDenHan: {all: function (nowS, limit) {
        assert.equal(nowS, NOW_S);
        assert.equal(limit, 61);
        return rows.slice();
      }}}},
      advanceAccountNoiBo: function (mutation, accountId) {
        processed.push(accountId);
        return {processed: 1, advancedToS: NOW_S, nextDueAtS: null,
          hasMoreDue: false, budgetExhausted: false};
      }
    };
    writer.directAccountOutcomeInCurrentUow = function (mutation, accountId) {
      return writer.world.advanceAccountNoiBo(mutation, accountId, NOW_S, {});
    };
    var mutation = {tag: 'mutation', remainingBudget: {value: 50000},
      recordAdvance: function () {}};
    var result = writer.advanceDueInCurrentUow(mutation, NOW_S, NOW_MS);
    assert.equal(result.partial, true);
    assert.equal(result.hasMoreDue, true);
    assert.equal(result.partialJobId, null);
    assert.equal(processed.length, 60);
    assert.deepEqual(processed.slice(0, 3), [1, 2, 3]);
    assert.equal(processed.includes(61), false);
  }));

test('Task 6 v17 remediation runMaintenanceCutover fresh only release policy is exact',
  task6v17Sentinel('TASK6V17_RED_008_CUTOVER', async function (t) {
    var runMaintenanceCutover = require('../server/scheduler/cutover.js').runMaintenanceCutover;
    var x = taoKhoTam();
    t.after(function () { dongKhoTam(x); });
    var calls = [];
    var original = x.kho.trongGiaoDich.bind(x.kho);
    x.kho.trongGiaoDich = function (fn, options) {
      calls.push(options);
      return original(fn, options);
    };
    var result = runMaintenanceCutover({
      kho: x.kho,
      clock: fakeClock(NOW_MS),
      ownerId: task6v17Owner(8)
    });
    assert.deepEqual(result, {mode: 'durable', imported: 0, recovered: 0});
    assert.ok(calls.some(function (options) { return options && options.immediate === true; }));
    assert.equal(x.kho.cauhinh('combat_seed_key_v1').length, 64);
    assert.equal(x.kho.cauhinh('seed'), null);
    assert.equal(x.kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get().value, 'durable');
    assert.equal(x.kho.db.prepare("SELECT COUNT(*) AS n FROM scheduler_audit WHERE action='CUTOVER'").get().n, 1);
    assert.throws(function () {
      runMaintenanceCutover({kho: x.kho, clock: fakeClock(NOW_MS + 1), ownerId: task6v17Owner(8)});
    }, /SCHEDULER_CUTOVER_ALREADY_DURABLE/);
  }));

test('Task 6 v17 remediation scheduler cutover CLI grammar lifecycle and exports are exact',
  task6v17Sentinel('TASK6V17_RED_009_CLI', async function (t) {
    var cli = require('../tools/scheduler-cutover.js');
    assert.deepEqual(Object.keys(cli).sort(), ['main', 'parseArgs', 'runCli'].sort());
    assert.deepEqual(cli.parseArgs(['--db', '/tmp/game.sqlite', '--action', 'cutover']),
      {dbPath: '/tmp/game.sqlite', action: 'cutover'});
    assert.throws(function () { cli.parseArgs(['--action', 'cutover', '--db', '/tmp/game.sqlite']); },
      /SCHEDULER_CLI_ARGS_INVALID/);
    assert.throws(function () { cli.parseArgs(['--db', '', '--action', 'cutover']); },
      /SCHEDULER_CLI_ARGS_INVALID/);
    var x = taoKhoTam();
    t.after(function () { removeDb(x.file); });
    var closed = 0;
    var originalDong = x.kho.dong.bind(x.kho);
    x.kho.dong = function () { closed++; return originalDong(); };
    var result = await cli.runCli(['--db', '/tmp/game.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return task6v17Owner(9); },
      clock: fakeClock(NOW_MS),
      openKho: function () { return x.kho; }
    });
    assert.equal(result.exitCode, 0);
    assert.equal(closed, 1);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, JSON.stringify({
      action: 'cutover', mode: 'durable', imported: 0, recovered: 0
    }) + '\n');
    var unsafe = await cli.runCli(['--db', '/tmp/game.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return task6v17Owner(9); },
      clock: fakeClock(NOW_MS),
      openKho: function () { throw new Error('contains secret payload'); }
    });
    assert.equal(unsafe.exitCode, 1);
    assert.equal(unsafe.stdout, '');
    assert.equal(unsafe.stderr, 'SCHEDULER_CUTOVER_FAILED\n');
  }));
// TASK6_V17_OVERLAY_TESTS_END
```

Seal overlay slice:

```bash
node - <<'NODE' > /tmp/task6-v17-current-overlay-slice.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V17_OVERLAY_TESTS_START\n';
const end = '// TASK6_V17_OVERLAY_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_OVERLAY_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
sha256sum /tmp/task6-v17-current-overlay-slice.js > /tmp/task6-v17-current-overlay-slice.js.sha256
```

Overlay expected names and RED:

```bash
cat > /tmp/task6-v17-overlay9-names.txt <<'EOF'
Task 6 v17 remediation Task5 live ABI order replay and arity are exact
Task 6 v17 remediation partial receipt wrapper identity and established zero retention are exact
Task 6 v17 remediation raw malformed payload quarantines without reducer prepare or payload parse
Task 6 v17 remediation status nested metrics validation clone and DB close seams are exact
Task 6 v17 remediation external only same key retarget and unrelated block are exact
Task 6 v17 remediation startup near expiry recovery renews and rebases before ready
Task 6 v17 remediation advance due 61 boundary is partial and does not run closure
Task 6 v17 remediation runMaintenanceCutover fresh only release policy is exact
Task 6 v17 remediation scheduler cutover CLI grammar lifecycle and exports are exact
EOF
sha256sum /tmp/task6-v17-overlay9-names.txt > /tmp/task6-v17-overlay9-names.txt.sha256
test ! -e /tmp/task6-v17-red-evidence.tap
: > /tmp/task6-v17-red-evidence.tap
run_one_overlay_red() {
  name="$1"; sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v17-overlay-red.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  grep -F "# Subtest: $name" "$tmp"
  grep -F "not ok 1 - $name" "$tmp"
  grep -F "$sentinel" "$tmp"
  printf '%s\nname=%s\nsentinel=%s\n' '### TASK6_V17_OVERLAY_RED_CASE_START' "$name" "$sentinel" >> /tmp/task6-v17-red-evidence.tap
  cat "$tmp" >> /tmp/task6-v17-red-evidence.tap
  printf '%s\n' '### TASK6_V17_OVERLAY_RED_CASE_END' >> /tmp/task6-v17-red-evidence.tap
  rm -f "$tmp"
}
run_one_overlay_red 'Task 6 v17 remediation Task5 live ABI order replay and arity are exact' 'TASK6V17_RED_001_TASK5_ABI'
run_one_overlay_red 'Task 6 v17 remediation partial receipt wrapper identity and established zero retention are exact' 'TASK6V17_RED_002_PARTIAL_RECEIPT'
run_one_overlay_red 'Task 6 v17 remediation raw malformed payload quarantines without reducer prepare or payload parse' 'TASK6V17_RED_003_RAW_QUARANTINE'
run_one_overlay_red 'Task 6 v17 remediation status nested metrics validation clone and DB close seams are exact' 'TASK6V17_RED_004_STATUS_DB_CLOSE'
run_one_overlay_red 'Task 6 v17 remediation external only same key retarget and unrelated block are exact' 'TASK6V17_RED_005_RETARGET'
run_one_overlay_red 'Task 6 v17 remediation startup near expiry recovery renews and rebases before ready' 'TASK6V17_RED_006_STARTUP_REBASE'
run_one_overlay_red 'Task 6 v17 remediation advance due 61 boundary is partial and does not run closure' 'TASK6V17_RED_007_DUE_61'
run_one_overlay_red 'Task 6 v17 remediation runMaintenanceCutover fresh only release policy is exact' 'TASK6V17_RED_008_CUTOVER'
run_one_overlay_red 'Task 6 v17 remediation scheduler cutover CLI grammar lifecycle and exports are exact' 'TASK6V17_RED_009_CLI'
grep -c '^### TASK6_V17_OVERLAY_RED_CASE_START$' /tmp/task6-v17-red-evidence.tap | grep -E '^9$'
grep -c '^### TASK6_V17_OVERLAY_RED_CASE_END$' /tmp/task6-v17-red-evidence.tap | grep -E '^9$'
sha256sum /tmp/task6-v17-red-evidence.tap > /tmp/task6-v17-red-evidence.tap.sha256
```

## Implementation sequence

1. Preflight V17 approved hash, authorities, baseline TAP, prefix bytes, inventory, TAP normalizer.
2. Append V17 overlay JS block only.
3. Seal overlay byte slice.
4. Run and freeze overlay9 isolated RED evidence.
5. Add minimal skeleton exports for `writer.js`, `index.js`, `cutover.js`, and `tools/scheduler-cutover.js`.
6. Append parent Task6 complete JS blocks between `TASK6_V17_PARENT_TESTS_START/END`; strip Markdown fences; seal current parent slice and parent source block hashes.
7. Implement Store primitives and writer lifecycle/direct/command paths with the V17 corrections above.
8. Implement index exports exactly `{taoScheduler,inRange,resolveDurableSchedulerOptions}`.
9. Implement cutover/CLI exact behavior.
10. Run final verification and Stage-A/B.

## Stage-A required checks

Stage-A must:

- `sha256sum -c /tmp/task6-v17-approved-plan.sha256`.
- Verify parent and Task5 pinned hashes.
- Verify preinventory hash and current inventory allowlist.
- Verify TAP normalizer hash.
- Verify overlay RED evidence hash.
- Verify overlay names hash.
- Verify overlay byte slice hash by recomputing the marker slice from current `tools/test-scheduler.js`.
- Verify parent73 names hash.
- Verify parent source block hashes and current parent marker slice hash.
- Run `node --check` for all six owned files.
- Recompute six-file metadata before fresh tests and diff sealed metadata.
- Run fresh normal and throw-deprecation tests:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v17-stage-a.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v17-stage-a-throw.tap
```

- Check both fresh TAPs contain `# tests 245`, `# pass 244`, `# fail 0`, `# skipped 1`.
- Extract fresh parent73, overlay9, and baseline names from `/tmp/task6-v17-stage-a.tap`; diff them against sealed expected names.
- Normalize both fresh TAPs with the V17 normalizer and write `stage_a_normalized_tap_sha` and `stage_a_throw_normalized_tap_sha`.
- Recompute six-file metadata after fresh tests and prove it matches before-test and sealed metadata.
- Check report type/mode, report fields listed above, and every `six_meta=` row from the sealed metadata.
- Check whitespace using `if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js "$report"; then exit 1; fi`.
- Reject any non-owned tracked, untracked, type, symlink, mode, size, or hash change outside the six files plus exact report dir/report file.

Stage-B reruns Stage-A, records Stage-B normalized TAP hashes separately if they differ, and validates exactly two distinct reviewer lines:

```text
Reviewer 1: identity=<distinct-tool-agent-id-1> model=gpt-5.6-sol effort=high outcome=PASS
Reviewer 2: identity=<distinct-tool-agent-id-2> model=gpt-5.6-sol effort=high outcome=PASS
```

Actual collaboration tool results are required separately; report text alone is not proof.

## Self-audit checklist

- [ ] V17 creates a new immutable plan file only.
- [ ] Replay algorithm and overlay require `prepare` for every executable, including already-applied replay.
- [ ] Blocked account validator returns frozen descriptor only and never calls `loadExecutableJob`.
- [ ] Owned RUNNING global path uses `resumeOwnedRunning`.
- [ ] TAP normalizer strips subtest YAML and root `# duration_ms` lines.
- [ ] Public `advanceTo` returns five public keys only.
- [ ] Index exports exactly `{taoScheduler,inRange,resolveDurableSchedulerOptions}`.
- [ ] Public status omits `effectiveNowMs`.
- [ ] `advanceDueInCurrentUow` preserves `dqDenHan` order.
- [ ] Stage-A greps all required report fields and every six-meta row.
- [ ] Overlay9 contains actual executable V17 JS test bodies, lazy requires, fixtures, assertions, sentinels, and byte-slice seal.
- [ ] Overlay names/sentinels/run calls use V17.
