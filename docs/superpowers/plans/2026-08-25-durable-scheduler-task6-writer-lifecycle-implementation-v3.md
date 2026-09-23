# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement durable scheduler Task 6 with the exact parent writer
lifecycle, MutationGate, retry/quarantine, private app lifecycle seams, local
cutover CLI, and review handoff required by the accepted Task 1-5 code.

**Architecture:** `SchedulerWriter` is the only durable mutation owner. Claims
may commit separately, but every reducer/advance/command effect runs inside one
`kho.trongGiaoDich(fn, {immediate:true})` plus
`world.trongMutationScheduler(mutation, fn)` and is final-fenced by the current
lease before commit. `server/scheduler/index.js` exposes the enumerable public
bridge and private non-enumerable Task7 lifecycle seams; Task7 still owns
app/API/world routing.

**Tech Stack:** Node.js CommonJS, `node:test`, SQLite through `Kho`, Task 2
`SchedulerStore`, Task 5 `GameAdvanceService` and `EventReducer`, Foundation
clock/logger/options.

**Spec:** `docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md`
and parent Task 6 in
`docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md`
from line 10866 through the Task 7 boundary.

## Global Constraints

- Preserve V1 and V2 plan files. This V3 is a new immutable file at
  `docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v3.md`.
- Do not edit any source while authoring this plan. Future implementation
  scope is Task6 only.
- Owned implementation files:

  - Create `server/scheduler/writer.js`
  - Create `server/scheduler/index.js`
  - Create `server/scheduler/cutover.js`
  - Create `tools/scheduler-cutover.js`
  - Modify `server/scheduler/store.js` only for
    `quarantineClaimedRaw(token, rawRow, failure, nowMs)`
  - Modify `tools/test-scheduler.js`
  - Create a report file after verification. The report is not part of the
    implementation hash seal.

- Forbidden / Task7+ files must not change:
  `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`,
  `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`,
  `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`,
  `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`,
  `package-lock.json`, `README.md`, `js/*.js`, and `web/js/mp.js`.
- Baseline accepted Task5 scheduler suite: 163 tests, 162 passed, 0 failed,
  1 known environment skip. V3 keeps the V2 total of 42 new tests, for final
  expected 205 tests, 204 passed, 0 failed, 1 known environment skip. The new
  mandatory crash stage `before-claim` is added inside the existing crash
  chronology test, so the total remains 42.
- Do not claim exact RED wave fail counts. Lazy imports and partial existing
  implementation may change how many tests fail in one file run. RED proof is
  per test name with a failing-name trap.
- Model route from `.superpowers/sdd/model-routing.md`: implementation
  `gpt-5.5 xhigh`; two fresh implementation reviews after final hashes:
  `gpt-5.6-sol high` behavior/logic and `gpt-5.6-sol high` scope/runtime.

## Live ABI that V3 must use literally

```js
assertSchedulerOwnerId(ownerId); // throws SCHEDULER_OWNER_ID_INVALID
store.recoverExpiredRunning(token, nowMs, policy);
store.loadExecutableJob(token, rawRow, nowMs);
store.markDurableMutation(token, nowMs);
store.parkGlobalBehindPreceding(token, runningJob, precedingJobId, targetS, nowMs);
store.fail(token, executableJob, failure, nowMs, policy);
reducer.initializeCombatSeed(token, nowMs);
reducer.prepare(mutation, executableJob, options);
reducer.applyPrepared(mutation, prepared);
advanceService.advanceBarrier(mutation, executableJob);
advanceService.advanceTo(mutation, accountId, targetS, saveOptions);
toPublicAdvanceResult(outcome); // public keys: processed, advancedToS, nextDueAtS, hasMoreDue, budgetExhausted
```

`runCommand` accepts exactly `{name, accountId?, run}`. It derives
`effectiveNowMs` and `nowS` internally; no caller-provided effective time or
budget exists.

## Review-blocker correction ledger

V3 explicitly corrects these V2 blockers:

1. `runCommand` inspects `advanceAccountInCurrentUow` before invoking the
   closure. Account partial or `deferredExternal` commits durable
   `TICK_PARTIAL` handling and returns `{deferred:true, code:'TICK_PARTIAL'}`
   without invoking `command.run`.
2. Thenable command tests are honest: if a closure returns a thenable, closure
   invocation already happened. The only guarantee is rollback of the command
   UoW and `UNIT_OF_WORK_ASYNC`, not "closure never invoked".
3. Parent branches `account-delete` and `advance-due` are restored. The
   `advance-due` branch calls `world.advanceDueNoiBo(mutation, nowS)` for the
   Task7 `tg.nhip -> runCommand({name:'advance-due', run})` integration path.
4. `applyClaimed` derives default `executionTargetS` from the branded
   executable returned by `loadExecutableJob`, never from the raw claim.
5. Preceding-root global ordering uses the existing Store ABI
   `parkGlobalBehindPreceding(token, executable, precedingJobId, targetS,
   nowMs)`. This parks the global back to `PENDING`; it is distinct from a
   budget partial, which leaves the job `RUNNING`.
6. Failure settlement is a fresh settlement UoW. It reloads by job id, brands
   with `loadExecutableJob`, calls `store.fail` for branded jobs, and falls
   back to `quarantineClaimedRaw` only when reload/branding fails with
   `PAYLOAD_INTEGRITY`.
7. Crash chronology includes `before-claim`, `after-claim`,
   `after-application-insert`, `after-game-mutation`, and
   `before-job-completion`.
8. Startup unwind distinguishes rollback-before-commit from committed-token
   release and sets `SCHEDULER_STARTUP_FAILED` for nonfatal startup failures.
9. RED helper uses lazy test imports, restores traps, verifies exact subtest
   name, removes temp files, and treats loader failure as invalid RED.
10. Dirty/untracked scope verification hashes and sizes forbidden paths before
    and after implementation and compares them.
11. Report self-hash cycle is removed. The review seal binds only these six
    implementation/test files: `store.js`, `writer.js`, `index.js`,
    `cutover.js`, `scheduler-cutover.js`, and `test-scheduler.js`.
12. Private non-enumerable lifecycle seams are implemented in Task6:
    `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`,
    `_datDatabaseClosing`, and reason `SCHEDULER_DB_CLOSED`.
13. Lease loss clears mutation/retry timers but keeps exactly one standby
    acquisition poll; stop clears grace/all timers.
14. CLI `runCli(argv, dependencies)` has exact injectable `openKho`,
    `makeOwnerId`, `clock`, return shape, and finally-close behavior.
15. Handoff launches two new fresh Sol/high reviews over exact final six-file
    hashes; any fix invalidates the seal and requires two new reviews.
16. Public enumerable bridge keys remain exact and Task7+ routing remains
    deferred.

## Untracked-aware pre/post manifests

- [ ] Before source edits, capture forbidden scope identity:

```bash
task6_forbidden_manifest() {
  for path in \
    server/app.js server/api.js server/world.js server/index.js \
    server/contract.js server/scheduler/contract.js \
    public/game.html public/game.js public/game.css \
    dist/thienhadaichien.bin dist/thien-ha-dai-chien.html dist/artifact.html \
    package.json package-lock.json README.md \
    js/actions.js js/app.js js/combat.js js/data.js js/engine.js js/fleet.js \
    js/galaxy.js js/main.js js/ui.js js/util.js web/js/mp.js
  do
    if [ -e "$path" ]; then
      sha="$(sha256sum "$path" | cut -d' ' -f1)"
      lines="$(wc -l < "$path")"
      bytes="$(wc -c < "$path")"
      printf '%s\t%s\t%s\t%s\n' "$sha" "$lines" "$bytes" "$path"
    else
      printf 'MISSING\t0\t0\t%s\n' "$path"
    fi
  done
}
task6_forbidden_manifest > /tmp/task6-forbidden-pre.tsv
git status --short > /tmp/task6-status-pre.txt
```

- [ ] After implementation and before report, rerun and compare:

```bash
task6_forbidden_manifest > /tmp/task6-forbidden-post.tsv
git status --short > /tmp/task6-status-post.txt
diff -u /tmp/task6-forbidden-pre.tsv /tmp/task6-forbidden-post.tsv
```

Any diff in the forbidden manifest blocks Task6 handoff.

- [ ] Use untracked-aware whitespace checks for owned files:

```bash
for file in \
  server/scheduler/store.js server/scheduler/writer.js \
  server/scheduler/index.js server/scheduler/cutover.js \
  tools/scheduler-cutover.js tools/test-scheduler.js
do
  test -f "$file"
  if rg -n '[[:blank:]]+$' "$file"; then exit 1; fi
done
git diff --check -- \
  server/scheduler/store.js server/scheduler/writer.js \
  server/scheduler/index.js server/scheduler/cutover.js \
  tools/scheduler-cutover.js tools/test-scheduler.js
```

## RED helper and lazy import contract

- [ ] Add Task6 tests so every new module import happens inside the test body:

```js
function task6Lazy(modulePath, exportName) {
  var loaded = require(modulePath);
  assert.ok(
    loaded && Object.prototype.hasOwnProperty.call(loaded, exportName),
    'TASK6_EXPORT_MISSING_' + exportName
  );
  return loaded[exportName];
}
```

No top-level `require('../server/scheduler/writer.js')` is allowed in the new
test block. Missing modules must register every Task6 test and fail inside
the named subtest.

- [ ] Use this RED helper:

```bash
task6_red_one() {
  test_name="$1"
  expected="$2"
  tap_file="$(mktemp)"
  prior_exit_trap="$(trap -p EXIT || true)"
  restore_trap() {
    rm -f "$tap_file"
    if [ -n "$prior_exit_trap" ]; then
      eval "$prior_exit_trap"
    else
      trap - EXIT
    fi
  }
  trap restore_trap EXIT
  set +e
  node --test-reporter=tap --test-name-pattern "$test_name" \
    tools/test-scheduler.js >"$tap_file" 2>&1
  tap_status=$?
  set -e
  cat "$tap_file"
  rg -q "# Subtest: $test_name" "$tap_file" || {
    echo "RED_LOADER_FAILURE: named subtest did not register" >&2
    restore_trap
    return 1
  }
  if [ "$tap_status" -eq 0 ]; then
    echo "RED_EXPECTED_FAILURE_BUT_TEST_PASSED: $test_name" >&2
    restore_trap
    return 1
  fi
  rg -q "$expected" "$tap_file"
  restore_trap
}
```

Whole-file RED runs may be used to catch registration and syntax problems, but
do not assert exact fail counts before implementation.

## Test manifest: 42 additions, final total 205

Add exactly these 42 tests. If a test is split or removed, update the table and
final expected totals in this plan before implementation continues.

### Group 1: ABI, CLI, raw quarantine, and cutover surface (9 tests)

1. `Task 6 v3 owner validation is SCHEDULER_OWNER_ID_INVALID before DB`
2. `Task 6 v3 lazy module surfaces and lowercase status vocabulary register`
3. `Task 6 v3 durable options accept only Foundation three keys plus env`
4. `Task 6 v3 runMaintenanceCutover returns mode imported recovered only`
5. `Task 6 v3 fresh cutover rolls back invalid seed and nonempty legacy DB`
6. `Task 6 v3 runCli rejects invalid args before openKho`
7. `Task 6 v3 runCli closes Kho on success and failure`
8. `Task 6 v3 raw claimed payload tamper quarantines before reducer prepare`
9. `Task 6 v3 raw quarantine primitive is lease and state fenced`

### Group 2: lifecycle, startup unwind, timers, private seams (10 tests)

10. `Task 6 v3 startup order seed integrity recovery marker ready is exact`
11. `Task 6 v3 startup failure before commit rolls back and reports startup failed`
12. `Task 6 v3 post-acquire startup failure releases token and polls standby`
13. `Task 6 v3 legacy and standby modes do not seed recover or drain`
14. `Task 6 v3 heartbeat transient rearms and heartbeat lease loss keeps one standby poll`
15. `Task 6 v3 automatic takeover uses exactly one standby acquisition poll`
16. `Task 6 v3 manualDrain creates no wake heartbeat reconcile or continuation timer`
17. `Task 6 v3 stop closes admission synchronously and captured tail can finish`
18. `Task 6 v3 stop grace expiry reports timeout then finalization releases`
19. `Task 6 v3 private lifecycle seams are non-enumerable and db closed is cache-only`

### Group 3: drain, barrier, failure settlement, partials, crash (13 tests)

20. `Task 6 v3 applyClaimed derives executionTargetS from branded executable`
21. `Task 6 v3 global preceding root calls parkGlobalBehindPreceding not running partial`
22. `Task 6 v3 global budget partial remains RUNNING without application`
23. `Task 6 v3 failure settlement reloads and brands in fresh UoW`
24. `Task 6 v3 payload integrity settlement falls back to raw quarantine only`
25. `Task 6 v3 global retry keeps watermark and command cannot cross T`
26. `Task 6 v3 local transient retry does not block independent aggregate`
27. `Task 6 v3 retry fatal classifier matches fixed Store codes`
28. `Task 6 v3 account partial checkpoints no application and resumes manually`
29. `Task 6 v3 deferredExternal partial blocks adopted account continuation`
30. `Task 6 v3 established zero partial retains RUNNING with null checkpoint`
31. `Task 6 v3 crash chronology includes before claim and restart idempotency`
32. `Task 6 v3 stale generation final fence rolls back effect and settlement`

### Group 4: MutationGate, branches, bridge, review seal (10 tests)

33. `Task 6 v3 runCommand account partial returns TICK_PARTIAL before closure`
34. `Task 6 v3 runCommand thenable closure rolls back after invocation`
35. `Task 6 v3 runCommand restores account delete branch`
36. `Task 6 v3 runCommand restores advance due branch`
37. `Task 6 v3 advanceTo returns exact Task5 public result and rejects future`
38. `Task 6 v3 schedule marks durable and recomputes wake`
39. `Task 6 v3 cancel marks durable and rejects invalid global cancellation`
40. `Task 6 v3 reconcile unavailable and injected reconciler contracts are exact`
41. `Task 6 v3 taoScheduler enumerable and private bridge surfaces are exact`
42. `Task 6 v3 implementation hash seal excludes report and binds six files`

After all groups are GREEN, expected suite total is:

```text
# tests 205
# pass 204
# fail 0
# skipped 1
```

## Required implementation pseudocode

### `runCommand` partial, thenable, `account-delete`, and `advance-due`

```js
function validateCommand(command) {
  if (!command || Object.getPrototypeOf(command) !== Object.prototype ||
      typeof command.name !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(command.name) ||
      typeof command.run !== 'function' ||
      (command.accountId !== undefined &&
        (!Number.isSafeInteger(command.accountId) || command.accountId < 1))) {
    throw schedulerError('SCHEDULER_COMMAND_INVALID');
  }
  if (Object.keys(command).some(function (key) {
    return ['name', 'accountId', 'run'].indexOf(key) < 0;
  })) throw schedulerError('SCHEDULER_COMMAND_INVALID');
  return command;
}

SchedulerWriter.prototype.runCommand = function (command) {
  var self = this;
  validateCommand(command);
  try { this.assertAccepting(); } catch (error) { return Promise.reject(error); }
  return this.enqueue(function () {
    self.assertOperationalAdmission();
    var nowMs = self.effectiveNowMs();
    var nowS = Math.floor(nowMs / 1000);
    var budget = assertNewDrainBudget({value: 50000});
    var barrier = self.settleBarriersForAdmission(budget, nowS, nowMs);
    if (barrier.deferred) throw schedulerError('GLOBAL_BARRIER_PENDING');
    if (barrier.budgetExhausted) return {deferred: true, code: 'TICK_PARTIAL'};

    return self.store.kho.trongGiaoDich(function () {
      var token = self.requireReadyLease(self.effectiveNowMs());
      nowMs = self.recordEffectiveNowInCurrentUow(token, self.effectiveNowMs());
      nowS = Math.floor(nowMs / 1000);
      var mutation = self.newMutationContext(token, budget, nowMs);
      var transactionResult = self.world.trongMutationScheduler(mutation, function () {
        var result, outcome, finalized, due;
        self.markDurableMutationInCurrentUow(mutation, nowMs);

        if (command.name === 'account-delete') {
          result = command.run();
          if (result && typeof result.then === 'function') {
            throw schedulerError('UNIT_OF_WORK_ASYNC');
          }
          return {response: result, partialJobId: null, metricOutcome: null};
        }

        if (command.name === 'advance-due') {
          due = self.world.advanceDueNoiBo(mutation, nowS);
          if (due && (due.budgetExhausted || due.deferredExternal === true)) {
            if (!mutation.commandAccountFinalizer) {
              throw schedulerError('ACCOUNT_COMMAND_FINALIZER_MISSING');
            }
            finalized = self.finalizeCommandAccountInCurrentUow(
              mutation, mutation.commandAccountFinalizer, nowMs
            );
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId, metricOutcome: due};
          }
        }

        result = self.withCommandWorldBatchInCurrentUow(mutation, function () {
          if (command.accountId !== undefined) {
            outcome = self.advanceAccountInCurrentUow(
              mutation, command.accountId, nowS, nowMs,
              {deferAccountFinalize: true}
            );
            if (outcome && (outcome.budgetExhausted || outcome.partial ||
                outcome.deferredExternal === true)) {
              return {deferred: true, outcome: outcome};
            }
          }
          var value = command.run();
          if (value && typeof value.then === 'function') {
            throw schedulerError('UNIT_OF_WORK_ASYNC');
          }
          return {deferred: false, value: value, outcome: outcome || null};
        });

        if (result.deferred) {
          finalized = result.outcome.accountFinalizer ?
            self.finalizeCommandAccountInCurrentUow(
              mutation, result.outcome.accountFinalizer, nowMs
            ) : result.outcome;
          return {response: {deferred: true, code: 'TICK_PARTIAL'},
            partialJobId: finalized.jobId || null, metricOutcome: result.outcome};
        }
        self.refreshLeasePhaseInCurrentUow('before-command-commit', token, nowMs);
        return {response: result.value, partialJobId: null,
          metricOutcome: result.outcome || due || null};
      });
      transactionResult.metricLedger = mutation.metricLedger;
      return transactionResult;
    }, {immediate: true});
  }, true).then(function (committed) {
    self.flushCommittedMetricLedger(committed.metricLedger);
    if (committed.partialJobId) self.enqueueCommittedPartial(committed.partialJobId);
    return committed.response;
  }).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  });
};
```

Tests 33 and 34 must distinguish the two guarantees:

- Account partial: closure count remains `0`.
- Thenable closure: closure count is `1`, all UoW writes roll back, and the
  public error is `UNIT_OF_WORK_ASYNC`.

### Claimed-job execution, branded default target, and preceding-root branch

```js
SchedulerWriter.prototype.applyClaimed = function (rawClaim, budget, nowMs) {
  var self = this, token = this.leaseToken;
  return this.store.kho.trongGiaoDich(function () {
    nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
    var mutation = self.newMutationContext(token, budget, nowMs);
    var result = self.world.trongMutationScheduler(mutation, function () {
      var executable = self.store.loadExecutableJob(token, rawClaim, nowMs);
      return self.executeClaimedInCurrentUow(mutation, executable, nowMs, {
        executionTargetS: Number(executable.scheduled_at_s)
      });
    });
    result.metricLedger = mutation.metricLedger;
    self.refreshLeasePhaseInCurrentUow('before-effect-commit', token, nowMs);
    return result;
  }, {immediate: true});
};

SchedulerWriter.prototype.executeClaimedInCurrentUow = function (
  mutation, executable, nowMs, options
) {
  var token = mutation.leaseToken;
  this.markDurableMutationInCurrentUow(mutation, nowMs);
  if (executable.kind === 'PVP_RESOLVE' || executable.kind === 'EXTERNAL_RESOLVE') {
    var barrier = this.advanceService.advanceBarrier(mutation, executable);
    if (barrier.precedingJobId) {
      var targetS = Number(executable.logical_scheduled_at_s === undefined ?
        executable.scheduled_at_s : executable.logical_scheduled_at_s);
      this.store.parkGlobalBehindPreceding(
        token, executable, barrier.precedingJobId, targetS, nowMs
      );
      return {reordered: true, partial: false, jobId: executable.id,
        budgetExhausted: barrier.budgetExhausted === true,
        advanceResult: barrier};
    }
    if (barrier.budgetExhausted) {
      return {partial: true, budgetExhausted: true, jobId: executable.id,
        advanceResult: barrier};
    }
  }
  var prepared = this.reducer.prepare(mutation, executable, {
    executionTargetS: Number(options.executionTargetS)
  });
  return this.finishPreparedOrPartial(mutation, executable, prepared, nowMs);
};
```

Preceding-root behavior is not a budget partial: the row is parked to
`PENDING` by Store and must not enter `partialQueue`. A budget partial remains
owned `RUNNING` and must enter the resume path.

`finishPreparedOrPartial` is Task 6 local writer code and must implement only
the Task 5 reducer result contract:

```js
SchedulerWriter.prototype.finishPreparedOrPartial = function (
  mutation, executable, prepared, nowMs
) {
  if (prepared && prepared.partial) {
    this.store.checkpointPreparedPartial(
      mutation.leaseToken, executable, prepared.checkpoint, nowMs
    );
    return {
      partial: true,
      jobId: executable.id,
      checkpoint: prepared.checkpoint,
      application: null,
      effect: null
    };
  }
  if (!prepared || !prepared.application) {
    throw schedulerError('SCHEDULER_PREPARE_RESULT_INVALID');
  }
  var applied = this.reducer.applyPrepared(mutation, executable, prepared);
  this.store.completePrepared(mutation.leaseToken, executable, applied, nowMs);
  return {
    completed: true,
    jobId: executable.id,
    application: applied.application,
    effect: applied.effect || null
  };
};
```

Partial rows retain checkpoint/block/null application data exactly as returned
by Task 5. They do not run application side effects and do not call complete.

### Fresh failure settlement UoW

```js
SchedulerWriter.prototype.settleClaimFailure = function (rawClaim, failure, firstNowMs) {
  var self = this;
  if (failure && failure.code === 'INJECTED_CRASH') throw failure;
  if (failure && failure.code === 'LEASE_LOST') {
    this.transitionLeaseLost(failure);
    throw failure;
  }
  if (isFatalStorageError(failure)) {
    this.transitionStorageFatal(failure);
    throw failure;
  }
  return this.store.kho.trongGiaoDich(function () {
    var token = self.requireReadyLease(self.effectiveNowMs());
    var nowMs = self.recordEffectiveNowInCurrentUow(token, self.effectiveNowMs());
    var freshRaw = self.store.getById(rawClaim.id);
    var executable;
    try {
      executable = self.store.loadExecutableJob(token, freshRaw, nowMs);
    } catch (reloadError) {
      if (normalizeSchedulerErrorCode(reloadError) !== 'PAYLOAD_INTEGRITY' &&
          reloadError.code !== 'PAYLOAD_INTEGRITY') {
        throw reloadError;
      }
      var rawState = self.store.quarantineClaimedRaw(token, freshRaw, failure, nowMs);
      self.refreshLeasePhaseInCurrentUow('before-failure-commit', token, nowMs);
      return rawState;
    }
    var state = self.store.fail(token, executable, failure, nowMs, self.retryPolicy());
    self.refreshLeasePhaseInCurrentUow('before-failure-commit', token, nowMs);
    return state;
  }, {immediate: true});
};
```

### Startup failure unwind

```js
SchedulerWriter.prototype.unwindStartupFailure = function (committedToken, error) {
  this.clearAllTimers();
  this.accepting = false;
  this.ready = false;
  this.recoveryComplete = false;
  if (committedToken && this.dbOpen) {
    var releaseAt = this.effectiveNowMs();
    this.store.kho.trongGiaoDich(function () {
      this.store.releaseLease(committedToken, releaseAt);
    }.bind(this), {immediate: true});
  }
  this.leaseToken = null;
  if (isFatalStorageError(error)) {
    this.transitionStorageFatal(error);
    throw error;
  }
  if (error && error.code === 'LEASE_LOST') {
    this.transitionLeaseLost(error);
    throw error;
  }
  this.state = 'standby';
  this.reason = 'SCHEDULER_STARTUP_FAILED';
  if (this.dbOpen && !this.manualDrain && !this.stopRequested) this.ensureStandbyPoll();
  throw error;
};
```

If seed/dependency/recovery throws inside the acquisition UoW, pass
`committedToken=null`; the DB transaction rollback removes the acquired lease.
If an optional post-acquire reconciler throws after the acquisition UoW
committed, pass the committed token and release it in the unwind UoW.

### Timer semantics

```js
SchedulerWriter.prototype.clearMutationTimers = function () {
  this.clearWakeTimer();
  this.clearHeartbeatTimer();
  this.clearReconcileTimer();
  this.clearContinuationHandle();
};
SchedulerWriter.prototype.ensureStandbyPoll = function () {
  if (this.manualDrain || this.stopRequested || this.pollTimer) return;
  this.pollTimer = this.timers.setTimeout(function () {
    this.pollTimer = null;
    return this.start().catch(this.handleDrainError.bind(this));
  }.bind(this), this.pollMs);
};
SchedulerWriter.prototype.transitionLeaseLost = function (error) {
  this.clearMutationTimers();
  this.accepting = false;
  this.ready = false;
  this.recoveryComplete = false;
  this.state = 'standby';
  this.reason = 'SCHEDULER_LEASE_LOST';
  this.leaseToken = null;
  this.ensureStandbyPoll();
};
SchedulerWriter.prototype.clearAllTimers = function () {
  this.clearMutationTimers();
  this.clearPollTimer();
  this.clearGraceTimer();
};
```

Lease loss leaves at most one standby acquisition poll. `stop()` clears poll,
grace, wake, heartbeat, reconcile, and continuation handles.

### Private lifecycle seams in `index.js`

Enumerable bridge keys remain exactly:

```js
['advanceTo', 'cancel', 'getStatus', 'reconcile', 'runCommand', 'schedule', 'start', 'stop']
```

Private descriptors:

```js
function definePrivateBridgeMethod(bridge, name, value) {
  Object.defineProperty(bridge, name, {
    value: value,
    enumerable: false,
    configurable: false,
    writable: false
  });
}
definePrivateBridgeMethod(bridge, '_datSignalHandlerInstalled', function (installed) {
  writer.signalHandlerState.installed = Boolean(installed);
});
definePrivateBridgeMethod(bridge, '_waitForStopFinalization', function () {
  return writer.stopFinalizePromise || Promise.resolve();
});
definePrivateBridgeMethod(bridge, '_beginStop', function () {
  writer.beginStop();
});
definePrivateBridgeMethod(bridge, '_datDatabaseClosing', function () {
  if (!writer.dbOpen) return;
  var snapshotError = null;
  try { writer.status(); } catch (error) { snapshotError = error; }
  writer.dbOpen = false;
  writer.accepting = false;
  writer.ready = false;
  writer.reason = 'SCHEDULER_DB_CLOSED';
  writer.clearAllTimers();
  if (snapshotError) throw snapshotError;
});
```

After `_datDatabaseClosing`, `writer.status()` and bridge `getStatus()` must be
cache-only and return `ready:false`, `dbOpen:false`, reason
`SCHEDULER_DB_CLOSED` without reading SQLite.

### CLI contract

```js
function runCli(argv, dependencies) {
  dependencies = dependencies || {};
  var parsed = parseArgs(argv);
  var openKho = dependencies.openKho || function (dbPath) {
    return new Kho(dbPath);
  };
  var makeOwnerId = dependencies.makeOwnerId || crypto.randomUUID;
  var clock = dependencies.clock || taoClock();
  var kho = null;
  try {
    kho = openKho(parsed.dbPath);
    var result = runMaintenanceCutover({
      kho: kho,
      clock: clock,
      ownerId: assertSchedulerOwnerId(makeOwnerId())
    });
    return {exitCode: 0, stdout: JSON.stringify({
      action: 'cutover',
      mode: result.mode,
      imported: result.imported,
      recovered: result.recovered
    }) + '\n', stderr: ''};
  } catch (error) {
    return {exitCode: 1, stdout: '', stderr: safeCliError(error) + '\n'};
  } finally {
    if (kho && typeof kho.dong === 'function') kho.dong();
  }
}
function main(argv, env, io, dependencies) {
  var result = runCli(argv, dependencies);
  io.stdout.write(result.stdout);
  io.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
  return result;
}
```

`parseArgs` rejects missing `--db`, missing `--action`, any action other than
`cutover`, duplicate flags, extra flags, and directories before `openKho`.

## Verification and review seal

- [ ] Final scheduler verification:

```bash
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
```

Both commands must report 205 tests, 204 passed, 0 failed, and 1 known
environment skip.

- [ ] Syntax and whitespace:

```bash
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
for file in server/scheduler/store.js server/scheduler/writer.js \
  server/scheduler/index.js server/scheduler/cutover.js \
  tools/scheduler-cutover.js tools/test-scheduler.js
do
  if rg -n '[[:blank:]]+$' "$file"; then exit 1; fi
done
git diff --check -- server/scheduler/store.js server/scheduler/writer.js \
  server/scheduler/index.js server/scheduler/cutover.js \
  tools/scheduler-cutover.js tools/test-scheduler.js
```

- [ ] Build the six-file implementation seal, excluding the report:

```bash
sha256sum \
  server/scheduler/store.js \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js > /tmp/task6-implementation-sha256.tsv
wc -l -c \
  server/scheduler/store.js \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js > /tmp/task6-implementation-size.tsv
```

The report may include these two files verbatim. Do not include the report's
own hash in this implementation seal.

- [ ] Launch two fresh Sol/high reviews after the final seal:

  1. Behavior/logic review: give the reviewer the six hashes, the six files,
     this V3 plan, parent Task6, design spec, and Task5 report. Ask for a
     PASS/FAIL on writer lifecycle, MutationGate, barrier order, retry/fatal
     classification, partials, crash chronology, and private lifecycle seams.
  2. Scope/runtime review: give a fresh reviewer the same six hashes plus
     forbidden pre/post manifests. Ask for a PASS/FAIL on owned scope,
     untracked-aware manifests, public/private bridge descriptors, CLI local
     behavior, timer cleanup, and report seal correctness.

If any implementation fix follows review, rerun all verification, rebuild the
six-file seal, update the report, and launch two new fresh reviews over the new
seal. Do not reuse a prior PASS for a changed seal.

## Completion definition

Task6 implementation is complete only when:

- All 42 tests are added with lazy imports and per-name RED proof.
- Both scheduler commands report 205 tests, 204 passed, 0 failed, 1 known skip.
- Syntax, untracked-aware whitespace, and forbidden manifest comparison pass.
- `npm test` either exits 0 or is reported as blocked with exact exit code and
  output. Do not call it passed unless exit code is 0.
- The report excludes its own hash from the implementation seal and binds the
  two fresh reviews to the six implementation/test hashes.
- No Task7+ path identity changes.
- Both fresh Sol/high reviews pass on the exact final seal.
