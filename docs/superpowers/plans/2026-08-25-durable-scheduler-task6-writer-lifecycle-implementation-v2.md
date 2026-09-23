# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the durable scheduler Task 6 writer exactly on the accepted
Task 1-5 live APIs: one leased writer, global watermark, retry/backoff,
quarantine, partial continuation, MutationGate, direct scheduler bridge, and
fresh-only local cutover.

**Architecture:** `SchedulerWriter` serializes all admitted work through one
Promise tail while every database mutation runs in a synchronous
`kho.trongGiaoDich(fn, {immediate:true})` callback. Each gameplay effect runs
inside `world.trongMutationScheduler(mutation, fn)` and is fenced by the
current lease before commit. The public Task-6 surface is only
`server/scheduler/index.js`; Task 7 owns app/API/world routing.

**Tech Stack:** Node.js CommonJS, `node:test`, SQLite via existing `Kho`,
Task 2 `SchedulerStore`, Task 5 `GameAdvanceService` and `EventReducer`,
Foundation clock/logger/options.

**Spec:** `docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md`
and parent Task 6 in
`docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md`
from line 10866 through the Task 7 boundary.

## Global Constraints

- Preserve V1 at
  `docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation.md`.
  This V2 is a new immutable plan file.
- Preserve all existing user changes and untracked files. Do not use
  `git diff` alone as evidence because accepted scheduler files are currently
  untracked.
- Task 6 owned implementation paths:

  - Create `server/scheduler/writer.js`
  - Create `server/scheduler/index.js`
  - Create `server/scheduler/cutover.js`
  - Create `tools/scheduler-cutover.js`
  - Modify `server/scheduler/store.js` only for the raw-claimed quarantine
    primitive defined below
  - Modify `tools/test-scheduler.js`
  - Create
    `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md`

- Task 6 must not edit `server/app.js`, `server/api.js`, `server/world.js`,
  `server/index.js`, `server/scheduler/contract.js`, browser files, `dist/`,
  package files, or Task 7+ readiness/HTTP routing.
- Use TDD. Every group adds tests first, proves every new test fails by name,
  then implements only the behavior needed for those failures.
- Route from `.superpowers/sdd/model-routing.md`:
  implementer `gpt-5.5 xhigh`; fresh reviews after implementation are
  `gpt-5.6-sol high` behavior/logic and `gpt-5.6-sol high` scope/runtime.
- Accepted live Task 5 identities remain the starting point:

  - `server/scheduler/store.js`
    `517de850b015fe90e8d6d200098a71ef20015ffaf02b26c683d64e065aed471c`
  - `server/scheduler/advance-service.js`
    `edebe9a7f380b16de6ef5519479dd8249e5c3f0d1433168af53dac42bab88c4d`
  - `server/scheduler/reducers.js`
    `3e5678d0da3e0a359de64cda72bedb77c5822889556332f3aee34a7620b33b5a`
  - `server/scheduler/combat-snapshot.js`
    `4055a66f1f8e6f1097e67dc6830e3c2df2ffdc3b1ebfaa03614041b345d298f0`
  - `server/world.js`
    `a9a56d2150e9dc38bdb5d8ca7516be3a2619204f8fdfe0543160870bd7b8b1d7`
  - `tools/test-scheduler.js`
    `4ec33beca23b43d76c8938a3439bcd51ed77667461d5bbfb1db8c98097bfae5b`

- Accepted Task 5 report:
  `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-5-report.md`
  `85b06ed44455a1deb2a535041ea90736b7962df55b698afab1b3e0cd4a5cb85d`.
  Do not use the superseded forensic harness as acceptance evidence.
- Baseline from the accepted report is 163 tests, 162 passed, 0 failed,
  1 known environment skip.

## Exact live API contract for Task 6

Use these signatures literally:

```js
assertSchedulerOwnerId(ownerId); // throws SCHEDULER_OWNER_ID_INVALID
store.acquireLease(ownerId, nowMs, leaseMs);
store.renewLease(token, nowMs, leaseMs);
store.releaseLease(token, nowMs);
store.recordEffectiveNowMs(token, effectiveNowMs);
store.recoverExpiredRunning(token, nowMs, policy);
store.claimForResolution(token, jobId, nowMs, lockMs, options);
store.claimNext(token, nowMs, watermarkS, lockMs);
store.resumeOwnedRunning(token, jobId, nowMs, lockMs);
store.loadExecutableJob(token, rawRow, nowMs);
store.assertCanonicalExecutable(token, executableJob, nowMs);
store.markDurableMutation(token, nowMs);
store.insertApplication(token, executableJob, application, nowMs, canonicalTContext);
store.checkpointPartial(token, executableJob, checkpointRevision, nowMs);
store.blockOwnedAccountAdvance(token, executableJob, checkpointRevision, blockedByJobId, nowMs);
store.adoptAccountAdvanceForCommand(token, accountId, targetS, nowMs, lockMs);
store.completeApplied(token, executableJob, nowMs);
store.finishResolved(token, executableJob, 'CANCELLED', reason, nowMs);
store.completeAccountAdvanceAndScheduleSuccessor(token, executableJob, nextLocalAtS, nowMs);
store.fail(token, executableJob, failure, nowMs, policy);
reducer.initializeCombatSeed(token, nowMs);
reducer.prepare(mutation, executableJob, options);
reducer.applyPrepared(mutation, prepared);
advanceService.advanceBarrier(mutation, executableJob);
advanceService.advanceTo(mutation, accountId, targetS, saveOptions);
toPublicAdvanceResult(outcome); // exact five public keys
```

The five public `AdvanceResult` keys are exactly:

```js
['advancedToS', 'budgetExhausted', 'hasMoreDue', 'nextDueAtS', 'processed']
```

`runCommand` accepts exactly `{name, accountId?, run}`. It derives
`effectiveNowMs` and `nowS` internally from the monotonic writer clock. It does
not accept `effectiveNowS`, `targetS`, or caller-supplied budget.

`resolveDurableSchedulerOptions(baseSchedulerOptions, env)` receives the exact
Foundation three-key object:

```js
{
  schedulerPollMs: Number,
  schedulerLogTicks: Boolean,
  cleanupMs: Number
}
```

It parses durable values only from env: `SCHEDULER_LEASE_MS`,
`SCHEDULER_RETRY_BASE_MS`, `SCHEDULER_RETRY_MAX_MS`,
`SCHEDULER_MAX_ATTEMPTS`, `SCHEDULER_MAX_QUARANTINED_READY`,
`SCHEDULER_MAX_BACKLOG_AGE_MS`, `SCHEDULER_SHUTDOWN_GRACE_MS`, and
`SCHEDULER_RECONCILE_INTERVAL_MS`.

Writer states are lowercase only:

```js
[
  'created', 'legacy', 'recovering', 'standby', 'ready',
  'draining', 'stopping', 'stopped', 'fatal', 'crashed'
]
```

Observable reasons are `SCHEDULER_*` strings only:

```js
[
  'SCHEDULER_RECOVERING',
  'SCHEDULER_MODE_LEGACY',
  'SCHEDULER_LEASE_UNHELD',
  'SCHEDULER_READY',
  'SCHEDULER_DRAINING',
  'SCHEDULER_STOP_GRACE_EXPIRED',
  'SCHEDULER_STOPPED',
  'SCHEDULER_STORAGE_FATAL',
  'SCHEDULER_CRASHED',
  'SCHEDULER_LEASE_LOST',
  'SCHEDULER_NOT_READY',
  'SCHEDULER_QUARANTINE_LIMIT'
]
```

## Test-count manifest

V2 adds exactly 42 tests:

| Group | New tests | Cumulative tests | Expected GREEN |
|---|---:|---:|---|
| Group 1 ABI/options/cutover/store primitive | 9 | 172 | 171 pass, 0 fail, 1 skip |
| Group 2 lifecycle/lease/shutdown | 10 | 182 | 181 pass, 0 fail, 1 skip |
| Group 3 drain/retry/partial/crash | 13 | 195 | 194 pass, 0 fail, 1 skip |
| Group 4 public bridge/factory/scope | 10 | 205 | 204 pass, 0 fail, 1 skip |

Do not reuse the V1 count. If an implementer adds or removes a planned test,
they must update this table before running RED.

## Premanifest before source edits

- [ ] Capture untracked-aware state before editing implementation files:

```bash
git status --short
find server/scheduler tools .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation \
  docs/superpowers/plans -type f -print0 | sort -z | xargs -0 sha256sum
find server/scheduler tools .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation \
  docs/superpowers/plans -type f -print0 | sort -z | xargs -0 wc -l -c
```

Record this output in the Task 6 report. This is the premanifest; `git diff`
alone is not sufficient.

## RED proof protocol used by every group

- [ ] After appending each group, run each new test by name and require one
  failure for the named behavior:

```bash
task6_red_one() {
  test_name="$1"
  expected="$2"
  tap_file="$(mktemp)"
  set +e
  node --test-reporter=tap --test-name-pattern "$test_name" \
    tools/test-scheduler.js >"$tap_file" 2>&1
  tap_status=$?
  set -e
  cat "$tap_file"
  rg -q '^# fail 1$' "$tap_file"
  rg -q "$expected" "$tap_file"
  rm -f "$tap_file"
  test "$tap_status" -ne 0
}
```

- [ ] Then run the whole file and require the exact cumulative fail count for
  that group. This catches accidental pass-through, broad syntax errors, and
  wrong test registration count.

## Group 1: ABI, options, cutover, CLI, and raw-claimed quarantine

**Files:**

- Modify `tools/test-scheduler.js`
- Modify `server/scheduler/store.js`
- Create `server/scheduler/writer.js`
- Create `server/scheduler/index.js`
- Create `server/scheduler/cutover.js`
- Create `tools/scheduler-cutover.js`

**Interfaces produced:**

- `SchedulerStore.prototype.quarantineClaimedRaw(token, rawRow, failure, nowMs)`
- `server/scheduler/writer.js` exports `{SchedulerWriter}`
- `server/scheduler/index.js` exports
  `{taoScheduler, inRange, resolveDurableSchedulerOptions}`
- `server/scheduler/cutover.js` exports `{runMaintenanceCutover}`
- `tools/scheduler-cutover.js` exports `{parseArgs, runCli, main}`

### Step 1.1: Append nine RED tests

- [ ] Add these tests, each named exactly as written:

1. `Task 6 v2 owner validation uses SCHEDULER_OWNER_ID_INVALID before DB work`
   - Break caught: constructor uses the wrong owner error or touches DB before
     validation.
   - Assert invalid owner throws `SCHEDULER_OWNER_ID_INVALID`.
   - Snapshot `scheduler_lease`, `scheduler_meta`, and `cauhinh` before and
     after; assert byte-identical.

2. `Task 6 v2 module surfaces and status vocabulary are exact`
   - Break caught: missing surface, extra export, uppercase state, or non
     `SCHEDULER_*` reason.
   - Assert exact export key lists.
   - Assert `SchedulerWriter.prototype` has `start`, `stop`, `status`,
     `getStatus`, `drainNow`, `runCommand`, `schedule`, `cancel`, `reconcile`,
     and `advanceTo`.
   - Construct a valid writer and assert initial status state `created`, reason
     `SCHEDULER_RECOVERING`, and no uppercase lifecycle state.

3. `Task 6 v2 durable option resolver accepts only Foundation three keys and env`
   - Break caught: resolver accepts V1 object shape, unknown durable object
     keys, or creates UUID before env validation.
   - Pass exactly `{schedulerPollMs:1000, schedulerLogTicks:false,
     cleanupMs:3600000}` plus env values.
   - Assert returned durable values use parent ranges.
   - Assert unknown base key and unknown context key throw before
     `makeOwnerId` is called.
   - Assert `schedulerPollMs >= leaseMs / 3` rejects.

4. `Task 6 v2 runMaintenanceCutover function returns no action field`
   - Break caught: function and CLI return shapes are conflated.
   - On an empty legacy DB, assert function result is exactly
     `{mode:'durable', imported:0, recovered:0}`.
   - Assert scheduler mode is durable, lease is released, one `CUTOVER` audit
     row exists, and no lazy universe seed or `moLuc` data is created.

5. `Task 6 v2 fresh cutover rolls back invalid seed and rejects nonempty legacy DB`
   - Break caught: failed cutover leaks lease/mode/audit, or imports nonempty
     DB before Task 9.
   - Preload invalid `combat_seed_key_v1`; assert `COMBAT_SEED_KEY_INVALID`
     and exact rollback.
   - Add one `dq` row; assert `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`,
     mode remains legacy, lease row unchanged, and no audit row.

6. `Task 6 v2 CLI rejects invalid flags before opening SQLite`
   - Break caught: CLI opens DB or leaks raw args before validation.
   - Call `runCli` with missing `--db`, unknown `--action`, extra flags, and a
     bad owner seam; inject `openKho` that throws if called.
   - Assert exit code `1`, bounded `SCHEDULER_CLI_ARGUMENT_INVALID`, and
     `openKho` count `0`.

7. `Task 6 v2 CLI cutover prints action while function does not`
   - Break caught: CLI omits `action` or function includes it.
   - On empty DB, `runCli(['--db', file, '--action', 'cutover'])` returns
     stdout JSON exactly
     `{action:'cutover', mode:'durable', imported:0, recovered:0}`.
   - Assert no HTTP module or app factory is imported by the CLI path.

8. `Task 6 v2 raw claimed tamper quarantines without reducer prepare`
   - Break caught: `store.fail` is called with an unbrandable raw row and loops
     on `PAYLOAD_INTEGRITY`, or reducer sees corrupt payload.
   - Claim a global row, corrupt `payload_json` or `payload_sha256`, call the
     writer drain, assert `reducer.prepare` count `0`, row state
     `QUARANTINED`, attempt `1`, error code `PAYLOAD_INTEGRITY`, no
     application row, and no game effect.

9. `Task 6 v2 raw quarantine primitive is lease fenced`
   - Break caught: raw quarantine can update a terminal row, stale generation,
     or foreign lock.
   - Directly exercise `store.quarantineClaimedRaw` inside an immediate UoW.
   - Assert success only for state `RUNNING`, matching owner/generation,
     nonexpired lock, and live lease.
   - Assert stale generation throws `LEASE_LOST` or `JOB_FAILURE_CONFLICT`
     without changing terminal rows.

### Step 1.2: Prove Group 1 RED

- [ ] Run `task6_red_one` for all nine names. Expected regexes:

```bash
task6_red_one "Task 6 v2 owner validation uses SCHEDULER_OWNER_ID_INVALID before DB work" \
  "SCHEDULER_OWNER_ID_INVALID"
task6_red_one "Task 6 v2 module surfaces and status vocabulary are exact" \
  "SchedulerWriter"
task6_red_one "Task 6 v2 durable option resolver accepts only Foundation three keys and env" \
  "resolveDurableSchedulerOptions"
task6_red_one "Task 6 v2 runMaintenanceCutover function returns no action field" \
  "runMaintenanceCutover"
task6_red_one "Task 6 v2 fresh cutover rolls back invalid seed and rejects nonempty legacy DB" \
  "SCHEDULER_CUTOVER"
task6_red_one "Task 6 v2 CLI rejects invalid flags before opening SQLite" \
  "scheduler-cutover"
task6_red_one "Task 6 v2 CLI cutover prints action while function does not" \
  "cutover"
task6_red_one "Task 6 v2 raw claimed tamper quarantines without reducer prepare" \
  "quarantineClaimedRaw"
task6_red_one "Task 6 v2 raw quarantine primitive is lease fenced" \
  "quarantineClaimedRaw"
```

- [ ] Run whole-file RED:

```bash
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 172$' "$tap_file"
rg -q '^# fail 9$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 1.3: Implement Group 1

- [ ] Add the raw quarantine Store primitive exactly for raw rows that cannot
  be branded after claim:

```js
SchedulerStore.prototype.quarantineClaimedRaw = function (
  token, rawRow, failure, nowMs
) {
  this.assertLiveLease(token, nowMs);
  if (!rawRow || typeof rawRow.id !== 'string') throw payloadIntegrity();
  var normalizedCode = normalizeSchedulerErrorCode(failure) || 'PAYLOAD_INTEGRITY';
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='QUARANTINED',attempt=attempt+1," +
    "retry_at_ms=NULL,error_code=?,error_message_safe=?,quarantined_at_ms=?," +
    "updated_at_ms=?,locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL " +
    "WHERE id=? AND state='RUNNING' AND locked_by=? AND locked_generation=? " +
    "AND locked_until_ms>? AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? " +
    "AND expires_at_ms>?)"
  ).run(
    safeErrorMessage(normalizedCode),
    safeErrorMessage(failure && failure.message),
    nowMs,
    nowMs,
    rawRow.id,
    token.ownerId,
    token.generation,
    nowMs,
    token.ownerId,
    token.generation,
    nowMs
  ).changes;
  if (changed !== 1) {
    if (!this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
    fail('JOB_FAILURE_CONFLICT');
  }
  return 'QUARANTINED';
};
```

This method must not parse `payload_json`, call `loadExecutableJob`, or accept
rows that are not currently owned `RUNNING` rows.

- [ ] Create the three modules and CLI with exact exports. `getStatus` is an
  alias to `status`:

```js
SchedulerWriter.prototype.getStatus = function () {
  return this.status();
};
module.exports = {SchedulerWriter: SchedulerWriter};
```

- [ ] `runMaintenanceCutover(context)` accepts only `{kho, clock, ownerId}`.
  It calls `apDungMigrationScheduler(kho, clock.nowMs())` before constructing
  `SchedulerStore`. It returns exactly `{mode:'durable', imported:0,
  recovered:0}`. `tools/scheduler-cutover.js` adds `action:'cutover'` only in
  CLI output.

- [ ] `resolveDurableSchedulerOptions(baseSchedulerOptions, env)` must validate
  the three-key Foundation shape before cache lookup or UUID creation.

### Step 1.4: Prove Group 1 GREEN

- [ ] Run:

```bash
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 172$' "$tap_file"
rg -q '^# pass 171$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Group 2: Startup, lease, heartbeat, shutdown, and status lifecycle

**Files:**

- Modify `tools/test-scheduler.js`
- Modify `server/scheduler/writer.js`

**Interfaces produced:**

- `start`, `stop`, `beginStop`, `waitForTailWithin`, `status`
- `scheduleHeartbeat`, `schedulePoll`, `scheduleWake`,
  `scheduleReconcileTimer`, `clearMutationTimers`
- `transitionLeaseLost`, `transitionStorageFatal`,
  `simulateFatalCrashForTest`

### Step 2.1: Append ten RED tests

Add these exact tests:

1. `Task 6 v2 startup calls seed recovery integrity in exact order`
   - Assert durable start order:
     `schedulerMode`, `peekEffectiveNowMs`, `acquireLease`,
     `recordEffectiveNowMs`, `initializeCombatSeed(token,effective)`,
     `assertAccountDependencyIntegrity(token,effective)`,
     `recoverExpiredRunning(token,effective,policy)`,
     `markDurableMutation(token,effective)` only when recovered count is
     positive, then ready.

2. `Task 6 v2 legacy mode is health visible and never acquires seed or drains`
   - Assert state `legacy`, reason `SCHEDULER_MODE_LEGACY`, no seed call, no
     recovery call, no lease held, no timers, and `drainNow` rejects
     `SCHEDULER_MODE_LEGACY`.

3. `Task 6 v2 standby lease unavailable polls and does not initialize seed`
   - Start writer A, then writer B with injected timers.
   - Assert writer B state `standby`, reason `SCHEDULER_LEASE_UNHELD`, no seed,
     and one poll timer when not manual.

4. `Task 6 v2 standby automatically acquires after lease expiry`
   - Let writer A crash without releasing.
   - Advance clock past `leaseMs`, fire standby poll, assert writer B ready and
     generation greater than A.

5. `Task 6 v2 heartbeat transient re-arms below lease third`
   - Inject `renewLease` first throwing native `ERR_SQLITE_ERROR` errcode `5`.
   - Assert warning `scheduler.heartbeat_retry`, next heartbeat timer exists,
     second heartbeat succeeds, state remains `ready`.

6. `Task 6 v2 heartbeat lease loss clears timers and closes admission`
   - Replace lease with another owner before heartbeat.
   - Assert state `standby`, reason `SCHEDULER_LEASE_LOST`, all mutation timers
     clear, and `runCommand` rejects before closure.

7. `Task 6 v2 manualDrain creates no implicit timers or continuation handles`
   - Start manual writer with due work.
   - Assert wake, poll, heartbeat, reconcile, and continuation handles are
     null; only explicit `drainNow` progresses work.

8. `Task 6 v2 stop closes admission synchronously and lets captured tail finish`
   - Queue one command that blocks on injected latch.
   - Call `beginStop`; assert a later `runCommand`, `schedule`, `cancel`,
     `reconcile`, and `advanceTo` reject `SCHEDULER_STOPPED` or
     `SCHEDULER_DRAINING` before their closures.
   - Release latch and assert captured command commits under the same live
     lease.

9. `Task 6 v2 stop grace expiry reports bounded timeout while finalization continues`
   - Call `stop(1)` while tail is inflight.
   - Assert caller receives `SCHEDULER_STOP_GRACE_EXPIRED`, state `stopping`,
     reason `SCHEDULER_STOP_GRACE_EXPIRED`.
   - Release tail; assert `stopFinalizePromise` releases lease and state
     `stopped`.

10. `Task 6 v2 fatal and crashed writers are terminal`
    - For `SQLITE_FULL`, `SQLITE_CORRUPT`, and `SQLITE_NOTADB`, assert state
      `fatal`, reason `SCHEDULER_STORAGE_FATAL`, timers clear, all public
      mutation surfaces fail-close.
    - For `simulateFatalCrashForTest`, assert state `crashed`, reason
      `SCHEDULER_CRASHED`, timers clear, lease is not released, and `start`
      cannot resurrect it.

### Step 2.2: Prove Group 2 RED

- [ ] Run `task6_red_one` for the ten Group 2 names with expected regex
  `SCHEDULER|heartbeat|startup|stop`.
- [ ] Run whole-file RED:

```bash
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 182$' "$tap_file"
rg -q '^# fail 10$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 2.3: Implement Group 2

- [ ] Implement constructor defaults from parent Task 6:

```js
this.state = 'created';
this.reason = 'SCHEDULER_RECOVERING';
this.ready = false;
this.accepting = false;
this.recoveryComplete = false;
this.leaseMs = options.leaseMs === undefined ? 15000 : options.leaseMs;
this.heartbeatDelayMs = Math.max(1, Math.floor(this.leaseMs / 3) - 1);
this.retryBaseMs = options.retryBaseMs === undefined ? 1000 : options.retryBaseMs;
this.retryMaxMs = options.retryMaxMs === undefined ? 300000 : options.retryMaxMs;
this.maxAttempts = options.maxAttempts === undefined ? 8 : options.maxAttempts;
```

- [ ] Implement `start()` exactly in this order:

```js
store.kho.trongGiaoDich(function () {
  var candidateNow = store.peekEffectiveNowMs(writer.effectiveNowMs());
  var token = store.acquireLease(writer.ownerId, candidateNow, writer.leaseMs);
  if (!token) return;
  var effective = writer.recordEffectiveNowInCurrentUow(token, candidateNow);
  reducer.initializeCombatSeed(token, effective);
  store.assertAccountDependencyIntegrity(token, effective);
  var recovered = store.recoverExpiredRunning(token, effective, writer.retryPolicy());
  if (recovered > 0) store.markDurableMutation(token, effective);
  acquired = {token: token, nowMs: effective};
}, {immediate: true});
```

Assign `this.leaseToken = acquired.token` only after that transaction commits.
If no token is acquired, state is `standby`, reason
`SCHEDULER_LEASE_UNHELD`, and only the standby poll timer may be armed.

- [ ] Implement heartbeat, standby poll, stop, and fatal/crash behavior per the
  tests. Every timer uses injected `timers` or `immediate`; no real sleep is
  allowed in tests.

### Step 2.4: Prove Group 2 GREEN

```bash
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 182$' "$tap_file"
rg -q '^# pass 181$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Group 3: Drain, global barrier, retry/fatal classification, partials, and crash chronology

**Files:**

- Modify `tools/test-scheduler.js`
- Modify `server/scheduler/writer.js`
- Modify `server/scheduler/store.js` only if Group 1 raw primitive needs a
  narrow correction

**Interfaces produced:**

- `takeNextJob`, `claimFirstBarrierForDrain`, `applyClaimed`,
  `executeClaimedInCurrentUow`, `settleClaimFailure`,
  `settleBarriersForAdmission`
- `enqueuePartial`, `enqueueCommittedPartial`,
  `enqueueBudgetContinuationIfDue`
- `setFaultHook`, `setPhaseRecheckHook`

### Step 3.1: Append thirteen RED tests

Add these exact tests:

1. `Task 6 v2 claim raw row is branded only by loadExecutableJob`
   - Assert `claimForResolution` and `claimNext` raw rows are never passed to
     `reducer.prepare`.
   - Assert `loadExecutableJob(token, raw, nowMs)` occurs before reducer work.
   - Tamper after claim and assert raw quarantine path handles it.

2. `Task 6 v2 reducer prepare precedes idempotency check and application replay`
   - Insert an already committed application for a job.
   - Restart writer and drain.
   - Assert `reducer.prepare(mutation, executable, {executionTargetS})` is
     still called before `hasCommittedApplication` or `insertApplication`.
   - Assert `applyPrepared` is skipped when `insertApplication` reports
     `alreadyApplied:true`; terminal transition still completes.

3. `Task 6 v2 global advanceBarrier runs before reducer and re-queries fixed point order`
   - Create two same-second globals where the claimed root discovers an earlier
     root during `advanceBarrier`.
   - Assert `advanceService.advanceBarrier(mutation, executable)` runs before
     `reducer.prepare`.
   - Assert writer parks the later root, re-queries
     `listBarrierJobsAtOrBefore`, and processes tuple order
     `(scheduled_at_s, priority, sequence, id)`.

4. `Task 6 v2 global retry keeps watermark and blocks command crossing T`
   - Force global `SQLITE_BUSY`.
   - Assert row `RETRY_WAIT`, attempt `1`, retry time from
     `retryAtMs(job.id, 1, nowMs, policy)`, `globalWatermarkS() === T`, and
     `runCommand` rejects `GLOBAL_BARRIER_PENDING` before closure.

5. `Task 6 v2 local transient retry does not block independent aggregate`
   - Force one account job to `SQLITE_LOCKED`.
   - Assert it becomes `RETRY_WAIT` and another aggregate due at or before the
     same watermark completes.

6. `Task 6 v2 retry classifier matches Store fixed codes and max attempts`
   - Assert retry only for normalized `SQLITE_BUSY`, `SQLITE_LOCKED`,
     `SQLITE_IOERR`, and `ETIMEDOUT`.
   - Assert `TRANSIENT_TIMEOUT` is mapped to `ETIMEDOUT` before `store.fail`
     or rejected by the test if left as `TRANSIENT_TIMEOUT`.
   - Assert attempt 8 transitions to `QUARANTINED`.

7. `Task 6 v2 fatal classifier stops mutation on fixed fatal SQLite codes`
   - Assert `SQLITE_FULL`, `SQLITE_CORRUPT`, and `SQLITE_NOTADB` set fatal,
     clear timers, log one scrubbed `scheduler.error`, and never call
     `store.fail`.
   - Assert native `ERR_SQLITE_ERROR` errcodes `11`, `13`, and `26` normalize to
     those fatal codes.

8. `Task 6 v2 account partial checkpoints no application and resumes in manual drain`
   - Create 50,001 local primitives.
   - First drain returns partial, calls `applyPrepared`, writes no
     `event_applications` row, calls `checkpointPartial`, leaves job `RUNNING`,
     and creates no implicit continuation under `manualDrain:true`.
   - Second explicit drain uses `resumeOwnedRunning` and completes.

9. `Task 6 v2 deferredExternal partial blocks owned account continuation`
   - Force account advance to discover a global external ref.
   - Assert no application row, `blockOwnedAccountAdvance` in the same UoW,
     blocked wake attempt stays `0`, and no command closure runs.

10. `Task 6 v2 established zero partial retains RUNNING with null checkpoint`
    - Spend exactly 50,000 budget before a secondary account has work.
    - Assert `applyPrepared` returns `{checkpointRevision:null,
      saveReceipt:null}`, writer does not call checkpoint or block, the adopted
      row remains `RUNNING`, and resume completes it.

11. `Task 6 v2 global barrier partial leaves RUNNING and no application`
    - Force `advanceBarrier` to return budget exhausted.
    - Assert no reducer prepare, no application insert, global row stays
      `RUNNING`, watermark remains `T`, and next drain resumes before any
      account work.

12. `Task 6 v2 crash chronology is deterministic across restart`
    - Inject stages `after-claim`, `after-application-insert`,
      `after-game-mutation`, and `before-job-completion`.
    - Assert rollback/commit chronology:
      after-claim leaves `RUNNING` and no application/effect;
      after-application and after-game roll back application/effect;
      before-completion rolls back effect UoW.
    - Restart after lease expiry and assert one deterministic final outcome.
    - Insert already-applied application before restart and assert no duplicate
      game effect.

13. `Task 6 v2 final lease fences reject stale generation effects`
    - Advance clock or take over lease between prepare/apply and final fence.
    - Assert effect UoW rolls back for drain, command, public advance, partial
      checkpoint, and failure settlement; no retry is written from stale time.

### Step 3.2: Prove Group 3 RED

- [ ] Run `task6_red_one` for the thirteen Group 3 names with expected regex
  matching the named primitive, for example `loadExecutableJob`,
  `advanceBarrier`, `GLOBAL_BARRIER_PENDING`, `retryAtMs`, `resumeOwnedRunning`,
  or `LEASE_LOST`.
- [ ] Run whole-file RED:

```bash
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 195$' "$tap_file"
rg -q '^# fail 13$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 3.3: Implement Group 3

- [ ] Wrap every claimed job effect in one immediate UoW and one scheduler
  world mutation scope:

```js
SchedulerWriter.prototype.applyClaimed = function (rawClaim, budget, nowMs) {
  var writer = this;
  var token = this.leaseToken;
  return this.store.kho.trongGiaoDich(function () {
    nowMs = writer.recordEffectiveNowInCurrentUow(token, nowMs);
    var mutation = writer.newMutationContext(token, budget, nowMs);
    var result = writer.world.trongMutationScheduler(mutation, function () {
      return writer.executeClaimedInCurrentUow(mutation, rawClaim, nowMs, {
        executionTargetS: Number(rawClaim.scheduled_at_s)
      });
    });
    result.metricLedger = mutation.metricLedger;
    writer.refreshLeasePhaseInCurrentUow('before-effect-commit', token, nowMs);
    return result;
  }, {immediate:true});
};
```

- [ ] Use this effect ordering. The code may be split into helpers, but the
  order is mandatory:

```js
function executeClaimedInCurrentUow(mutation, rawClaim, nowMs, writerOptions) {
  var token = mutation.leaseToken;
  var executable = store.loadExecutableJob(token, rawClaim, nowMs);
  writer.markDurableMutationInCurrentUow(mutation, nowMs);

  if (executable.kind === 'PVP_RESOLVE' || executable.kind === 'EXTERNAL_RESOLVE') {
    var barrier = advanceService.advanceBarrier(mutation, executable);
    if (barrier.budgetExhausted || barrier.precedingJobId) {
      return finishGlobalBarrierPartial(executable, barrier, mutation, nowMs);
    }
  }

  var reducerOptions = {executionTargetS: Number(
    writerOptions && writerOptions.executionTargetS !== undefined ?
      writerOptions.executionTargetS : executable.scheduled_at_s
  )};
  var prepared = reducer.prepare(mutation, executable, reducerOptions);

  if (prepared.kind === 'partial') {
    var partialEffect = reducer.applyPrepared(mutation, prepared);
    finalizePartialWithoutApplication(
      executable, prepared, partialEffect, mutation, nowMs
    );
    return {partial:true, jobId: executable.id, advanceResult: prepared.advanceResult || null};
  }

  var alreadyCommitted = store.hasCommittedApplication(token, executable, nowMs);
  if (!alreadyCommitted && mutation.remainingBudget.value === 0) {
    return retainRunningBudgetPartial(executable, mutation, nowMs);
  }
  if (!alreadyCommitted) mutation.remainingBudget.value -= 1;

  var inserted = store.insertApplication(
    token, executable, prepared.application, nowMs,
    prepared.canonicalTContext || null
  );
  var effect = null;
  if (!inserted.alreadyApplied) {
    writer.callFaultHook('after-application-insert', executable);
    effect = reducer.applyPrepared(mutation, prepared);
    writer.callFaultHook('after-game-mutation', executable);
  }
  writer.refreshLeasePhaseInCurrentUow('before-completion', token, nowMs);
  writer.callFaultHook('before-job-completion', executable);
  finishPreparedTerminal(executable, prepared, effect, mutation, nowMs);
  return {partial:false, jobId: executable.id, advanceResult: prepared.advanceResult || null};
}
```

- [ ] Partial finalization rules:

  - No partial path calls `insertApplication`, `completeApplied`, or
    `finishResolved`.
  - Account partial with `prepared.advanceResult.deferredExternal === true`
    calls `blockOwnedAccountAdvance` with the checkpoint revision and
    `blockedExternalJobId`.
  - Account partial with a real `saveReceipt` calls `checkpointPartial`.
  - Established-zero partial with null receipt and zero processed work only
    reloads the executable to prove the fence and leaves the row `RUNNING`.
  - Global barrier partial leaves the global row `RUNNING`; continuation uses
    `resumeOwnedRunning`.

- [ ] Failure settlement rules:

  - If `loadExecutableJob` throws `PAYLOAD_INTEGRITY` before branding, call
    `quarantineClaimedRaw(token, rawClaim, error, nowMs)` in a new immediate
    UoW.
  - If an executable is branded, use `store.fail(token, executable, error,
    nowMs, retryPolicy)`.
  - Fixed retry codes are exactly `SQLITE_BUSY`, `SQLITE_LOCKED`,
    `SQLITE_IOERR`, `ETIMEDOUT`.
  - Fatal writer codes are exactly `SQLITE_FULL`, `SQLITE_CORRUPT`,
    `SQLITE_NOTADB`.
  - `INJECTED_CRASH` escapes classification for crash chronology tests.

### Step 3.4: Prove Group 3 GREEN

```bash
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 195$' "$tap_file"
rg -q '^# pass 194$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Group 4: MutationGate, schedule/cancel/reconcile, factory, final scope

**Files:**

- Modify `tools/test-scheduler.js`
- Modify `server/scheduler/writer.js`
- Modify `server/scheduler/index.js`
- Modify `tools/scheduler-cutover.js` only for CLI refinements proven RED

**Interfaces produced:**

- `runCommand({name, accountId?, run})`
- `advanceTo(accountId, targetS)`
- `schedule(job)`, `cancel(idempotencyKey, reason)`, `reconcile()`
- `taoScheduler(context)` direct/production bridge

### Step 4.1: Append ten RED tests

Add these exact tests:

1. `Task 6 v2 runCommand validates shape before enqueue marker or closure`
   - Missing name, invalid name, invalid account ID, extra `effectiveNowS`, and
     Promise return all fail before durable marker and before closure side
     effects.

2. `Task 6 v2 runCommand derives monotonic now and drains barriers before closure`
   - Move clock backward after prior effective time.
   - Assert command uses stored monotonic `nowS`.
   - Assert all due barriers at or before `nowS` complete before closure sees
     world state.

3. `Task 6 v2 runCommand returns TICK_PARTIAL without invoking closure`
   - Barrier or account advance exhausts budget.
   - Assert exact result `{deferred:true, code:'TICK_PARTIAL'}`, closure count
     `0`, and continuation queued only when not manual.

4. `Task 6 v2 public advanceTo returns exact Task5 public AdvanceResult`
   - Assert future target rejects `ADVANCE_TARGET_FUTURE` before marker.
   - Assert success keys are exactly
     `advancedToS,budgetExhausted,hasMoreDue,nextDueAtS,processed`.

5. `Task 6 v2 schedule marks durable and schedules a wake`
   - Assert `schedule(job)` validates through Task 2 `validateJob`, calls
     `markDurableMutation(token, effectiveNowMs)` before `store.schedule`,
     returns stored row, and recomputes wake.

6. `Task 6 v2 cancel marks durable and is idempotent for account jobs`
   - Assert invalid args reject `SCHEDULER_CANCEL_INVALID`.
   - Assert account cancellation writes marker and returns boolean.
   - Assert global cancel is rejected by Store and fail-closes through writer.

7. `Task 6 v2 reconcile unavailable and injected reconciler contracts are exact`
   - With no reconciler, assert `SCHEDULER_RECONCILER_UNAVAILABLE`.
   - With injected reconciler, assert context has `{leaseToken,
     effectiveNowMs, writer}` and no parent UoW wraps the reconciler.

8. `Task 6 v2 taoScheduler caches direct and production contexts exactly`
   - Direct context keys exactly
     `advanceService,clock,logger,reducer,schedulerOptions,store,world,writer`.
   - Production keys exactly `clock,env,kho,logger,schedulerOptions,tg`, with
     optional test-only `makeOwnerId`.
   - Unknown keys including `timers`, `manualDrain`, `schedulerOwnerId`, and
     `createWriter` reject before UUID creation.
   - Same `kho` or writer returns same bridge only when frozen dependencies and
     durable env are identical.

9. `Task 6 v2 bridge exposes only public scheduler methods`
   - Assert enumerable bridge keys are exactly `advanceTo`, `cancel`,
     `getStatus`, `reconcile`, `runCommand`, `schedule`, `start`, `stop`.
   - Assert it does not expose writer, store, lease token, DB, or internal
     timers.

10. `Task 6 v2 bridge getStatus is read-only and canonical`
    - Break caught: bridge status call mutates lease, DB metadata, timers, or
      returns a divergent shape from `writer.status()`.
    - Snapshot scheduler tables and timer handles, call `bridge.getStatus()`
      twice, assert both results equal `writer.status()` for lowercase state,
      `SCHEDULER_*` reason, counts, ages, watermark, and timer flags.
    - Assert scheduler tables and timer handles are unchanged by status reads.

### Step 4.2: Prove Group 4 RED

- [ ] Run `task6_red_one` for the ten Group 4 names with expected regex
  matching `runCommand`, `advanceTo`, `schedule`, `cancel`, `reconcile`, or
  `taoScheduler`.
- [ ] Run whole-file RED:

```bash
tap_file="$(mktemp)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests 205$' "$tap_file"
rg -q '^# fail 10$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
test "$tap_status" -ne 0
```

### Step 4.3: Implement Group 4

- [ ] Implement `runCommand` with this admission order:

```js
validateCommand(command);              // before enqueue or UoW
assertAccepting();                     // before enqueue
enqueue(function () {
  assertOperationalAdmission();
  var nowMs = effectiveNowMs();
  var nowS = Math.floor(nowMs / 1000);
  var budget = {value: 50000};
  var barrier = settleBarriersForAdmission(budget, nowS, nowMs);
  if (barrier.deferred) throw schedulerError('GLOBAL_BARRIER_PENDING');
  if (barrier.budgetExhausted) return {deferred:true, code:'TICK_PARTIAL'};
  return kho.trongGiaoDich(function () {
    var token = requireReadyLease(nowMs);
    nowMs = recordEffectiveNowInCurrentUow(token, nowMs);
    var mutation = newMutationContext(token, budget, nowMs);
    return world.trongMutationScheduler(mutation, function () {
      markDurableMutationInCurrentUow(mutation, nowMs);
      if (command.accountId !== undefined) {
        advanceAccountInCurrentUow(mutation, command.accountId, nowS, nowMs);
      }
      var value = command.run();
      if (value && typeof value.then === 'function') {
        throw schedulerError('UNIT_OF_WORK_ASYNC');
      }
      refreshLeasePhaseInCurrentUow('before-command-commit', token, nowMs);
      return value;
    });
  }, {immediate:true});
}, true);
```

The implementation may use helper functions, but every command-side game write
must be inside `world.trongMutationScheduler` and final-fenced before commit.

- [ ] Implement `advanceTo`, `schedule`, `cancel`, `reconcile`, and
  `taoScheduler` using the exact contracts described above.
- [ ] Keep `server/scheduler/contract.js` untouched. Task 7 wires app routing.

### Step 4.4: Prove Group 4 GREEN

```bash
tap_file="$(mktemp)"
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
cat "$tap_file"
rg -q '^# tests 205$' "$tap_file"
rg -q '^# pass 204$' "$tap_file"
rg -q '^# fail 0$' "$tap_file"
rg -q '^# skipped 1$' "$tap_file"
rm -f "$tap_file"
```

## Final verification and report

- [ ] Run direct scheduler suite:

```bash
node tools/test-scheduler.js
```

Expected after the planned additions: 205 tests, 204 passed, 0 failed,
1 known environment skip.

- [ ] Run throw-deprecation scheduler suite:

```bash
node --throw-deprecation tools/test-scheduler.js
```

Expected after the planned additions: 205 tests, 204 passed, 0 failed,
1 known environment skip.

- [ ] Run syntax checks:

```bash
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
```

- [ ] Run scoped whitespace check:

```bash
git diff --check -- \
  server/scheduler/store.js \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md
```

- [ ] Run broader project tests:

```bash
npm test
```

If this command exits nonzero for an environment restriction or unrelated
preexisting failure, report it as blocked for that exact command with exit
code and output excerpt. Do not write that `npm test` passed unless its exit
code is zero in the final verification run.

- [ ] Capture final untracked-aware path identities:

```bash
git status --short
sha256sum \
  server/scheduler/store.js \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md
wc -l -c \
  server/scheduler/store.js \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md
```

- [ ] Write the Task 6 report with:

  - Premanifest and final manifest.
  - Exact command outputs.
  - Exact owned path identities.
  - Confirmation V1 plan was preserved.
  - Confirmation no Task 7+ paths changed.
  - Confirmation the superseded Task 5 forensic harness was not used.
  - Review request for the two fresh Sol reviews from model routing.

- [ ] Run scope guards:

```bash
git status --short -- \
  server/scheduler/store.js \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md \
  server/app.js server/api.js server/world.js server/index.js server/scheduler/contract.js
rg -n "require\\('./scheduler/index|require\\(\\\"./scheduler/index|from './scheduler/index" \
  server/app.js server/api.js server/world.js server/index.js server/scheduler/contract.js
rg -n "effectiveNowS|deferAccountFinalize|schedulerOwnerId|createWriter|manualDrain|timers" \
  server/scheduler/index.js server/scheduler/writer.js tools/test-scheduler.js
rg -n "T[O]DO|T[B]D|F[I]XME|place[- ]?holder|st[u]b|f[a]ke implementation|sk[i]p this test" \
  server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js \
  server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-6-report.md
```

The `effectiveNowS` and `deferAccountFinalize` guard may print prose in this
plan only; implementation code must not contain executable use of either key.

## Completion Definition

Task 6 is complete only when:

- All 42 V2 tests are present and every RED group proved each new test failed
  individually before implementation.
- `node tools/test-scheduler.js` and
  `node --throw-deprecation tools/test-scheduler.js` both report 205 tests,
  204 passed, 0 failed, and 1 known environment skip.
- Syntax checks and scoped `git diff --check` pass.
- `npm test` either passes with exit code zero or is reported as blocked with
  coherent evidence.
- The Task 6 report contains premanifest, final manifest, hashes, line counts,
  byte counts, and verification output.
- No Task 7+ path is edited.
- Fresh behavior/logic and scope/runtime Sol reviews pass, or every finding is
  addressed with a new RED/GREEN/verification cycle.
