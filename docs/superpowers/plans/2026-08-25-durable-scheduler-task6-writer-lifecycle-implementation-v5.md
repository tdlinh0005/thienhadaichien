# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V5

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 writer lifecycle, global watermark, retry/backoff, raw quarantine fallback, command MutationGate, cutover CLI, and private lifecycle seams on top of accepted Tasks 1-5.

**Architecture:** Task 6 adds one leased `SchedulerWriter` and public durable scheduler bridge. Every durable write runs inside a live-lease `Kho.trongGiaoDich(...,{immediate:true})` UoW and `world.trongMutationScheduler(mutation, fn)`, while the writer consumes the accepted Task 5 reducer/store protocol instead of adding a second protocol.

**Tech Stack:** Node.js CommonJS, `node:test` TAP, SQLite via the existing `Kho` wrapper, existing `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` Task 6 beginning at line 10866, plus accepted Task 5 remediation protocol lines 825-833 in `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`.

## Direct inspection baseline

This V5 plan was written after direct inspection of live code and parent text:

- Parent Task 6: `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866`, `:13265`, `:14018`, `:14557`, `:14904`, `:15024`, `:15164`, `:15279`, `:15319`.
- Task 5 downstream order: `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.
- Live world ABI: `server/world.js:207` `trongMutationScheduler(mutation,fn)`, `:219` `_schedulerActive(mutation)`, `:226` `advanceAccountNoiBo(mutation,accountId,targetS,saveOptions)`, `:1684` `kho.q.dqDenHan.all(now,limit)`, `:2327` no live `advanceDueNoiBo`.
- Live DB ABI: `server/db.js:218` `dqDenHan` is `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?`.
- Live reducer ABI: `server/scheduler/reducers.js:232` `initializeCombatSeed(leaseToken,effectiveNowMs)`, `:326` `prepare(mutation,executableJob,options)`, `:345` `applyPrepared(mutation,prepared)`.
- Live advance ABI: `server/scheduler/advance-service.js:491` `advanceBarrier(mutation,executableJob)`, which already calls `store.parkGlobalBehindPreceding(...)` at lines 523-524 and returns `blockedExternal:true, blockedExternalJobId`.
- Live Store ABI: `server/scheduler/store.js:845` `resumeOwnedRunning(token,jobId,nowMs,lockMs)`, `:866` `loadExecutableJob(token,row,nowMs)`, `:949` `hasCommittedApplication(token,executableJob,nowMs)`, `:974` `insertApplication(token,executableJob,application,nowMs,canonicalTContext)`, `:1031` `checkpointPartial(token,job,revision,nowMs)`, `:1050` `markDurableMutation(token,nowMs)`, `:1076` `completeApplied(token,job,nowMs)`, `:1106` `finishResolved(token,job,state,reason,nowMs)`, `:1142` `completeAccountAdvanceAndScheduleSuccessor(token,job,nextLocalAtS,nowMs)`, `:1158` `fail(token,job,failure,nowMs,policy)`, `:1198` `recoverExpiredRunning(token,nowMs,policy)`, `:1464` `blockOwnedAccountAdvance(token,job,checkpointRevision,blockedByJobId,nowMs)`, `:1527` `parkGlobalBehindPreceding(token,runningJob,precedingJobId,targetS,nowMs)`, `:1562` `assertAccountDependencyIntegrity(token,nowMs)`.

## Global Constraints

- Preserve V1-V4. Create this V5 plan file only during planning.
- Task 6 implementation may modify exactly six implementation/test files: `server/scheduler/store.js`, `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`.
- Exact implementation report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task 7+ scope: do not modify `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, `js/*.js`, or `web/js/mp.js`.
- Do not add `TheGioi.prototype.advanceDueNoiBo`; live world does not have it and `server/world.js` is forbidden for Task 6. Task 6 owns the writer-side `advanceDueInCurrentUow` helper.
- Existing accepted scheduler suite baseline is 163 tests. V5 adds exactly 42 tests total, including the manifest validator folded into case 41, so final expected scheduler output is 205 tests, 204 passed, 0 failed, 1 known environment skip. If a fresh pre-edit run proves the baseline changed, report the command output and recompute arithmetic explicitly.
- Public bridge enumerable keys remain exactly `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`. Task 7 lifecycle bridge helpers are private non-enumerable properties only.
- The active V5 plan hash is not embedded in this plan. After this file is frozen, implementation preflight must run `sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v5.md > /tmp/task6-active-plan.sha256`, pass that external hash to implementers and reviewers, and finish with `sha256sum -c /tmp/task6-active-plan.sha256`.
- After the plan hash is captured, the V5 plan is no longer mutable and is removed from the mutable allowlist. Inventory may contain this expected plan artifact, but its hash must remain fixed.

## Correction ledger from blocked V4

1. Account command deferral now uses the live Task 5 account partial protocol: `prepared.kind`, `prepared.advanceResult`, `reducer.applyPrepared(mutation,prepared)`, exact two-key effect `{checkpointRevision,saveReceipt}`, and `prepared.advanceResult.blockedExternalJobId`. There is no `prepared.deferredExternal`.
2. Drain finalizes account results immediately. `runCommand` may request `{deferAccountFinalize:true}` but must finalize each returned `accountFinalizer` exactly once before its command UoW commits.
3. Failure settlement now transitions storage fatal on `settlementError` while rethrowing the original reducer failure unchanged; lease loss does the same lease transition and still rethrows the original failure.
4. Startup sequence includes `store.assertAccountDependencyIntegrity(token,effective)` and uses a real enumeration of owned running ids before calling `resumeOwnedRunning(token,jobId,nowMs,lockMs)`. It refreshes/fences the lease immediately before the long recovery UoW commits.
5. The 42-test total is honest: cases 1-42 are the only new tests.
6. Finish bookkeeping includes exact `mutation.recordAdvance`, `mutation.recordJob`, committed metric ledger flushing, and `before-final-fence` hook before the final live-lease refresh.
7. RED proof uses `node --test --test-reporter=tap tools/test-scheduler.js`.
8. `withCommandWorldBatchInCurrentUow` uses live `world._schedulerActive(mutation)`, not nonexistent `_mutationContexts`.
9. Final seal sequence separates six implementation/test hashes from report and review text. Report changes after review do not invalidate six-file review binding, but final verification separately checks report whitespace, final inventory, active plan hash, and six-file hashes.
10. V4 fixes are retained: raw quarantine primitive, already-parked global barrier, command fences/continuations, startup release guard, stop guard, private seams/timers, exact CLI, exact owned files/report, no report self-hash, and two fresh Sol/high reviews.

---

## Task 1: Preflight, active plan seal, and RED proof harness

**Files:**

- Modify: `tools/test-scheduler.js`
- Create at implementation time: `/tmp/task6-active-plan.sha256`, `/tmp/task6-pre-inventory.tsv`, `/tmp/task6-pre-forbidden.tsv`

**Interfaces:**

- Consumes: `node --test --test-reporter=tap tools/test-scheduler.js`.
- Produces: 42-case RED manifest and allowlist-aware scope verification inputs.

- [ ] **Step 1: Pin the active V5 plan externally**

Run before any source/test edit:

```bash
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v5.md \
  > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

Do not edit this plan after this point. Do not include the V5 plan file in the mutable allowlist.

- [ ] **Step 2: Capture full pre-inventory and forbidden hashes**

```bash
task6_inventory() {
  find . -path ./.git -prune -o -type f -print0 |
    LC_ALL=C sort -z |
    while IFS= read -r -d '' path; do
      rel=${path#./}
      bytes=$(wc -c < "$path")
      sha=$(sha256sum "$path" | awk '{print $1}')
      printf '%s\t%s\t%s\n' "$sha" "$bytes" "$rel"
    done
}
task6_inventory > /tmp/task6-pre-inventory.tsv
awk -F '\t' '
  $3 ~ /^(server\/app\.js|server\/api\.js|server\/world\.js|server\/index\.js|server\/contract\.js|server\/scheduler\/contract\.js|public\/game\.(html|js|css)|dist\/thienhadaichien\.bin|dist\/thien-ha-dai-chien\.html|dist\/artifact\.html|package(-lock)?\.json|README\.md|js\/.*\.js|web\/js\/mp\.js)$/ {print}
' /tmp/task6-pre-inventory.tsv > /tmp/task6-pre-forbidden.tsv
```

- [ ] **Step 3: Add exactly 42 RED cases**

Add one manifest and use it as the source of truth. The manifest validator is case 41, not an extra test.

```js
var TASK6_RED_CASES = Object.freeze([
  ['Task 6 v5 writer rejects legacy mode before lease', 'TASK6V5_RED_001_LEGACY'],
  ['Task 6 v5 startup acquisition rollback arms no poll while stopping', 'TASK6V5_RED_002_STARTUP_ROLLBACK'],
  ['Task 6 v5 startup committed lease release preserves original failure', 'TASK6V5_RED_003_STARTUP_RELEASE'],
  ['Task 6 v5 startup recovery asserts dependency integrity and fences commit', 'TASK6V5_RED_004_STARTUP_INTEGRITY'],
  ['Task 6 v5 heartbeat transient rearms and generation loss keeps one poll', 'TASK6V5_RED_005_HEARTBEAT'],
  ['Task 6 v5 lease loss during stop finalization is idempotent', 'TASK6V5_RED_006_LEASE_STOP'],
  ['Task 6 v5 shutdown admission fence drains captured tail with bounded grace', 'TASK6V5_RED_007_SHUTDOWN'],
  ['Task 6 v5 private lifecycle seams are non enumerable and db close cache only', 'TASK6V5_RED_008_PRIVATE'],
  ['Task 6 v5 runMaintenanceCutover fresh only lease audit and release', 'TASK6V5_RED_009_CUTOVER'],
  ['Task 6 v5 scheduler cutover CLI exports exact surface and closes kho', 'TASK6V5_RED_010_CLI'],
  ['Task 6 v5 claim brands raw row before target default', 'TASK6V5_RED_011_BRAND'],
  ['Task 6 v5 before claim crash leaves no running row', 'TASK6V5_RED_012_BEFORE_CLAIM'],
  ['Task 6 v5 after claim crash recovers expired running without effect', 'TASK6V5_RED_013_AFTER_CLAIM'],
  ['Task 6 v5 after application crash restarts without duplicate effect', 'TASK6V5_RED_014_AFTER_APP'],
  ['Task 6 v5 after effect crash rolls back application and world state', 'TASK6V5_RED_015_AFTER_EFFECT'],
  ['Task 6 v5 before final fence generation flip rolls back effect UoW', 'TASK6V5_RED_016_FINAL_FENCE'],
  ['Task 6 v5 already applied restart skips effect and terminalizes once', 'TASK6V5_RED_017_REPLAY'],
  ['Task 6 v5 stale generation effect fails before commit', 'TASK6V5_RED_018_STALE_GENERATION'],
  ['Task 6 v5 global barrier already parked branch does not double park', 'TASK6V5_RED_019_BARRIER_PARK'],
  ['Task 6 v5 global barrier budget partial queues continuation after commit', 'TASK6V5_RED_020_BARRIER_PARTIAL'],
  ['Task 6 v5 account partial checkpoint uses exact two key effect', 'TASK6V5_RED_021_PARTIAL_CHECKPOINT'],
  ['Task 6 v5 account partial blocked external uses advanceResult dependency', 'TASK6V5_RED_022_PARTIAL_BLOCK'],
  ['Task 6 v5 established zero partial retains running lock unchanged', 'TASK6V5_RED_023_ESTABLISHED_ZERO'],
  ['Task 6 v5 prepared global charges primitive once before idempotency insert', 'TASK6V5_RED_024_GLOBAL_CHARGE'],
  ['Task 6 v5 prepared replay validates application and skips second effect', 'TASK6V5_RED_025_REPLAY_CHARGE'],
  ['Task 6 v5 terminal mapping uses only accepted Store methods', 'TASK6V5_RED_026_TERMINAL'],
  ['Task 6 v5 account defer returns finalizer and drain finalizes immediately', 'TASK6V5_RED_027_DEFER_ACCOUNT'],
  ['Task 6 v5 command account finalizer finalizes exactly once', 'TASK6V5_RED_028_FINALIZER_ONCE'],
  ['Task 6 v5 settlement reloads executable then Store fail', 'TASK6V5_RED_029_SETTLE_FAIL'],
  ['Task 6 v5 settlement raw corruption quarantines without payload parse', 'TASK6V5_RED_030_RAW_QUARANTINE'],
  ['Task 6 v5 settlement missing fresh row preserves original failure', 'TASK6V5_RED_031_MISSING_ROW'],
  ['Task 6 v5 settlement fatal storage transitions while rethrowing original', 'TASK6V5_RED_032_SETTLE_FATAL'],
  ['Task 6 v5 runCommand barrier partial returns TICK_PARTIAL', 'TASK6V5_RED_033_CMD_BARRIER'],
  ['Task 6 v5 runCommand account partial skips closure and queues continuation', 'TASK6V5_RED_034_CMD_PARTIAL'],
  ['Task 6 v5 runCommand thenable rolls back after invocation only', 'TASK6V5_RED_035_CMD_THENABLE'],
  ['Task 6 v5 runCommand adopted account success finalizes and returns closure', 'TASK6V5_RED_036_CMD_ADOPTED'],
  ['Task 6 v5 advance due uses dqDenHan and advanceAccountNoiBo without world edit', 'TASK6V5_RED_037_CMD_DUE'],
  ['Task 6 v5 advance due partial skips closure and finalizes dependency', 'TASK6V5_RED_038_CMD_DUE_PARTIAL'],
  ['Task 6 v5 account delete skips automatic advance branch', 'TASK6V5_RED_039_ACCOUNT_DELETE'],
  ['Task 6 v5 schedule cancel reconcile mark durable and keep surfaces exact', 'TASK6V5_RED_040_PUBLIC_SURFACES'],
  ['Task 6 v5 RED manifest and normalized scope allowlist reject extra files', 'TASK6V5_RED_041_SCOPE_MANIFEST'],
  ['Task 6 v5 implementation seal excludes report and active plan is fixed', 'TASK6V5_RED_042_SEAL']
]);
```

Case 41 asserts `TASK6_RED_CASES.length === 42`, unique names, unique sentinels, sentinel absent from title, and normalized inventory rejection for a temporary non-owned untracked file. It is counted as one of the 42 new tests.

- [ ] **Step 4: Use TAP-safe RED helper for every case**

```bash
task6_regex_escape() {
  node -e 'console.log(process.argv[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))' "$1"
}
task6_red_one() {
  test_name=$1
  sentinel=$2
  old_trap=$(trap -p EXIT || true)
  case $- in *e*) had_errexit=1 ;; *) had_errexit=0 ;; esac
  set +e
  out=$(mktemp "${TMPDIR:-/tmp}/task6-red.XXXXXX")
  node --test --test-reporter=tap tools/test-scheduler.js >"$out" 2>&1
  code=$?
  escaped=$(task6_regex_escape "$test_name")
  registration=$(grep -E "^# Subtest: $escaped$" "$out")
  not_ok=$(grep -E "^not ok [0-9]+ - $escaped$" "$out")
  sentinel_hit=$(grep -F "$sentinel" "$out")
  rm -f "$out"
  if [ -n "$old_trap" ]; then eval "$old_trap"; else trap - EXIT; fi
  if [ "$had_errexit" = 1 ]; then set -e; else set +e; fi
  if [ "$code" -eq 0 ] || [ -z "$registration" ] || [ -z "$not_ok" ] || [ -z "$sentinel_hit" ]; then
    printf 'RED proof failed for %s\n' "$test_name" >&2
    return 1
  fi
}
```

Every new test lazy-requires new Task 6 modules inside the test or fixture. A top-level missing `writer.js` import that prevents TAP registration is a RED proof failure.

---

## Task 2: Lifecycle, startup recovery, timers, and private bridge

**Files:**

- Create/Modify: `server/scheduler/writer.js`
- Create/Modify: `server/scheduler/index.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: `store.acquireLease`, `store.releaseLease`, `store.recoverExpiredRunning(token,nowMs,policy)`, `store.assertAccountDependencyIntegrity(token,nowMs)`, `store.resumeOwnedRunning(token,jobId,nowMs,lockMs)`, `reducer.initializeCombatSeed(token,nowMs)`.
- Produces: `SchedulerWriter`, `taoScheduler(context)`, lifecycle states, timers, private bridge seams.

- [ ] **Step 1: RED cases 1-8**

Install and prove RED for cases 1-8 before implementing lifecycle code.

- [ ] **Step 2: Implement exact mutation context and committed metric ledger**

Use the parent Task 6 ledger shape exactly:

```js
function newCommittedMetricLedger() {
  return {seenAdvance: new WeakSet(), seenJobs: new Set(),
    advances: [], jobs: [], flushed: false};
}
SchedulerWriter.prototype.newMutationContext = function (token, budget, nowMs) {
  var ledger = newCommittedMetricLedger();
  return {
    leaseToken: token,
    remainingBudget: budget,
    effectiveNowMs: nowMs,
    metricLedger: ledger,
    recordAdvance: function (result) {
      if (!result || typeof result !== 'object' || ledger.seenAdvance.has(result)) return;
      if (!Number.isSafeInteger(Number(result.processed)) || Number(result.processed) < 0 ||
          typeof result.budgetExhausted !== 'boolean') {
        throw schedulerError('SCHEDULER_ADVANCE_METRIC_INVALID');
      }
      ledger.seenAdvance.add(result);
      ledger.advances.push({processed: Number(result.processed),
        budgetExhausted: result.budgetExhausted});
    },
    recordJob: function (job, outcome, startedAtMs) {
      if (!job || typeof job.id !== 'string' || typeof job.kind !== 'string' ||
          ['success', 'partial'].indexOf(outcome) < 0 ||
          !Number.isSafeInteger(startedAtMs) || ledger.seenJobs.has(job.id)) {
        throw schedulerError('JOB_METRIC_DUPLICATE');
      }
      ledger.seenJobs.add(job.id);
      ledger.jobs.push({job: {id: job.id, kind: job.kind},
        outcome: outcome, startedAtMs: startedAtMs});
    }
  };
};
```

Only `flushCommittedMetricLedger(ledger)` may emit `scheduler.tick`, and only after its owner UoW commits.

- [ ] **Step 3: Implement startup sequence**

Startup order:

1. Reject `scheduler_mode='legacy'` before lease acquisition.
2. Acquire lease in one immediate UoW.
3. Open one long recovery immediate UoW with the committed token.
4. Record monotonic effective time.
5. Call `reducer.initializeCombatSeed(token,effectiveNowMs)`.
6. Call `store.recoverExpiredRunning(token,effectiveNowMs,retryPolicy)`.
7. Call `store.assertAccountDependencyIntegrity(token,effectiveNowMs)`.
8. Enumerate currently owned active RUNNING ids with a read-only query and call `resumeOwnedRunning` for each id:

```js
SchedulerWriter.prototype.ownedRunningIdsForResume = function (token, nowMs) {
  this.store.assertLiveLease(token, nowMs);
  return this.store.db.prepare(
    "SELECT id FROM event_jobs WHERE state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? AND blocked_by_job_id IS NULL " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
  ).all(token.ownerId, token.generation, nowMs).map(function (row) { return row.id; });
};
```

9. For each id, call `store.resumeOwnedRunning(token,id,effectiveNowMs,leaseMs)` and enqueue the returned row if non-null.
10. Call `refreshLeasePhaseInCurrentUow('before-recovery-commit', token, effectiveNowMs)` immediately before committing the recovery UoW.
11. Only after commit set `ready=true`, `state='ready'`, and arm heartbeat/wake/reconcile timers.

- [ ] **Step 4: Implement startup failure unwind**

```js
SchedulerWriter.prototype.unwindStartupFailure = function (committedToken, error) {
  var original = error;
  this.clearAllTimers();
  this.accepting = false;
  this.ready = false;
  this.recoveryComplete = false;
  var stopping = this.stopRequested || this.state === 'stopping' || this.state === 'stopped';
  if (committedToken && this.dbOpen) {
    try {
      var releaseAt = this.effectiveNowMs();
      this.store.kho.trongGiaoDich(function () {
        this.store.releaseLease(committedToken, releaseAt);
      }.bind(this), {immediate: true});
    } catch (releaseError) {
      this.log('error', 'scheduler.error', {code: normalizeSchedulerErrorCode(releaseError)});
    }
  }
  this.leaseToken = null;
  if (stopping) {
    this.state = this.stopRequested ? 'stopping' : 'stopped';
    this.reason = this.reason || 'SCHEDULER_DRAINING';
    throw original;
  }
  if (isFatalStorageError(original)) {
    this.transitionStorageFatal(original);
    throw original;
  }
  if (normalizeSchedulerErrorCode(original) === 'LEASE_LOST') {
    this.transitionLeaseLost(original);
    throw original;
  }
  this.state = 'standby';
  this.reason = 'SCHEDULER_STARTUP_FAILED';
  if (this.dbOpen && !this.manualDrain && !this.stopRequested) this.ensureStandbyPoll();
  throw original;
};
```

If acquisition/recovery fails inside the acquisition UoW, pass `committedToken=null`. If an optional post-acquire dependency throws after acquisition committed, pass the committed token and release it best-effort. Release failure is logged and never replaces the original startup error.

- [ ] **Step 5: Implement timer and lease-loss semantics**

```js
SchedulerWriter.prototype.clearMutationTimers = function () {
  this.clearWakeTimer();
  this.clearHeartbeatTimer();
  this.clearReconcileTimer();
  this.clearContinuationHandle();
};
SchedulerWriter.prototype.clearAllTimers = function () {
  this.clearMutationTimers();
  this.clearPollTimer();
  this.clearGraceTimer();
};
SchedulerWriter.prototype.ensureStandbyPoll = function () {
  if (this.pollTimer || this.manualDrain || this.stopRequested ||
      this.state === 'stopping' || this.state === 'stopped') return;
  this.pollTimer = this.timers.setTimeout(function () {
    this.pollTimer = null;
    return this.start().catch(this.handleDrainError.bind(this));
  }.bind(this), this.pollMs);
};
SchedulerWriter.prototype.transitionLeaseLost = function (error) {
  if (this.stopRequested || this.state === 'stopping' || this.state === 'stopped' ||
      this.stopFinalizePromise) {
    this.clearMutationTimers();
    this.accepting = false;
    this.ready = false;
    this.leaseToken = null;
    return;
  }
  if (this.reason === 'SCHEDULER_LEASE_LOST' && this.state === 'standby') return;
  this.clearMutationTimers();
  this.accepting = false;
  this.ready = false;
  this.recoveryComplete = false;
  this.draining = false;
  this.state = 'standby';
  this.reason = 'SCHEDULER_LEASE_LOST';
  this.leaseToken = null;
  if (this.dbOpen && !this.manualDrain && !this.stopRequested) this.ensureStandbyPoll();
};
```

Lease loss leaves at most one standby acquisition poll. `stop()` clears every timer, including poll and grace.

- [ ] **Step 6: Implement private lifecycle descriptors**

Bridge enumerable keys stay exactly:

```js
['advanceTo', 'cancel', 'getStatus', 'reconcile', 'runCommand', 'schedule', 'start', 'stop']
```

Private methods:

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
  writer.statusCache = Object.assign({}, writer.statusCache || {}, {
    ready: false, dbOpen: false, reason: 'SCHEDULER_DB_CLOSED'
  });
  if (snapshotError) throw snapshotError;
});
```

After `_datDatabaseClosing`, `status()` and `getStatus()` must be cache-only and must not query SQLite.

---

## Task 3: Claimed-job lifecycle, Task 5 downstream protocol, retry, and quarantine

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: accepted Task 5 protocol and live Store/Reducer/AdvanceService ABIs listed above.
- Produces: claimed-job apply path, account finalizer protocol, raw quarantine primitive, failure settlement.

- [ ] **Step 1: RED cases 11-32**

Install and prove RED for cases 11-32 before implementation.

- [ ] **Step 2: Implement claim/apply skeleton and final bookkeeping**

```js
SchedulerWriter.prototype.claimOneDue = function (budget, nowMs) {
  this.callFaultHook('before-claim', null);
  var raw = this.store.kho.trongGiaoDich(function () {
    var token = this.requireReadyLease(nowMs);
    return this.store.claimNext(token, nowMs, this.store.globalWatermarkS(), this.leaseMs);
  }.bind(this), {immediate: true});
  if (raw) this.callFaultHook('after-claim', raw);
  return raw;
};

SchedulerWriter.prototype.applyClaimed = function (rawClaim, budget, nowMs) {
  var self = this;
  return this.store.kho.trongGiaoDich(function () {
    var token = self.requireReadyLease(self.effectiveNowMs());
    nowMs = self.recordEffectiveNowInCurrentUow(token, self.effectiveNowMs());
    var mutation = self.newMutationContext(token, budget, nowMs);
    var transactionResult = self.world.trongMutationScheduler(mutation, function () {
      return self.executeClaimedInCurrentUow(mutation, rawClaim, nowMs, {
        executionTargetS: undefined,
        deferAccountFinalize: false
      });
    });
    transactionResult.metricLedger = mutation.metricLedger;
    self.callFaultHook('before-final-fence', rawClaim);
    self.refreshLeasePhaseInCurrentUow('before-effect-commit', token, nowMs);
    return transactionResult;
  }, {immediate: true});
};
```

`before-final-fence` occurs before `refreshLeasePhaseInCurrentUow`; generation-flip tests mutate the lease before that final fence and must roll back the effect UoW.

- [ ] **Step 3: Implement Task5-compatible claimed execution with account deferral**

```js
function isGlobalJob(job) {
  return job.kind === 'PVP_RESOLVE' || job.kind === 'EXTERNAL_RESOLVE';
}

SchedulerWriter.prototype.executeClaimedInCurrentUow = function (
  mutation, claimedRow, nowMs, options
) {
  var token = mutation.leaseToken, self = this, startedAtMs = nowMs;
  var executable, barrier, prepared, application, effect, alreadyCommitted = false;
  function finish(outcome, label, advanceResult) {
    if (advanceResult && typeof mutation.recordAdvance === 'function') {
      mutation.recordAdvance(advanceResult);
    }
    if (typeof mutation.recordJob === 'function') {
      mutation.recordJob(executable, label, startedAtMs);
    }
    return outcome;
  }
  options = options || {};
  this.store.assertLiveLease(token, nowMs);
  executable = this.store.loadExecutableJob(token, claimedRow, nowMs);
  if (options.executionTargetS === undefined) {
    options.executionTargetS = Number(executable.scheduled_at_s);
  }
  this.markDurableMutationInCurrentUow(mutation, nowMs);

  if (isGlobalJob(executable)) {
    barrier = this.advanceService.advanceBarrier(mutation, executable);
    if (barrier.blockedExternal === true && barrier.blockedExternalJobId) {
      return finish({reordered: true, partial: false, jobId: executable.id,
        blockedExternalJobId: barrier.blockedExternalJobId, advanceResult: barrier},
      'partial', barrier);
    }
    if (barrier.budgetExhausted === true) {
      return finish({partial: true, budgetExhausted: true, jobId: executable.id,
        advanceResult: barrier}, 'partial', barrier);
    }
    alreadyCommitted = this.store.hasCommittedApplication(token, executable, nowMs);
    if (!alreadyCommitted) {
      if (mutation.remainingBudget.value < 1) {
        return finish({partial: true, budgetExhausted: true, jobId: executable.id,
          advanceResult: barrier}, 'partial', barrier);
      }
      mutation.remainingBudget.value -= 1;
    }
  }

  prepared = this.reducer.prepare(mutation, executable, {
    executionTargetS: Number(options.executionTargetS)
  });
  if (prepared.kind === 'partial') {
    effect = this.reducer.applyPrepared(mutation, prepared);
    this.callFaultHook('after-effect', executable);
    if (executable.kind === 'ACCOUNT_ADVANCE') {
      if (typeof mutation.recordAdvance === 'function') {
        mutation.recordAdvance(prepared.advanceResult);
      }
      if (options.deferAccountFinalize === true) {
        return finish({
          partial: true,
          budgetExhausted: Boolean(prepared.advanceResult &&
            prepared.advanceResult.budgetExhausted),
          deferredExternal: Boolean(prepared.advanceResult &&
            prepared.advanceResult.blockedExternalJobId),
          jobId: executable.id,
          accountFinalizer: {
            directMode: false,
            job: executable,
            prepared: prepared,
            effect: effect,
            partial: true,
            finalized: false
          },
          advanceResult: prepared.advanceResult || null
        }, 'partial', null);
      }
      return finish(
        this.finalizePreparedAccountPartialInCurrentUow(
          mutation, executable, prepared, effect, nowMs
        ),
        'partial',
        null
      );
    }
    throw schedulerError('GLOBAL_PARTIAL_PREPARE_INVALID');
  }
  if (prepared.kind !== 'prepared') throw schedulerError('PREPARED_KIND_INVALID');

  application = this.store.insertApplication(
    token, executable, prepared.application, nowMs, prepared.canonicalTContext || null
  );
  this.callFaultHook('after-application', executable);
  effect = application.alreadyApplied ? null : this.reducer.applyPrepared(mutation, prepared);
  if (!application.alreadyApplied) this.callFaultHook('after-effect', executable);

  if (executable.kind === 'ACCOUNT_ADVANCE' && options.deferAccountFinalize === true) {
    return finish({
      partial: false,
      budgetExhausted: false,
      jobId: executable.id,
      accountFinalizer: {
        directMode: false,
        job: executable,
        prepared: prepared,
        effect: effect,
        partial: false,
        finalized: false
      },
      advanceResult: prepared.advanceResult || null
    }, 'success', null);
  }

  return finish(
    this.finishPreparedInCurrentUow(
      mutation, executable, prepared, application, effect, nowMs
    ),
    'success',
    isGlobalJob(executable) ? {
      processed: Number(barrier.processed) + (alreadyCommitted ? 0 : 1),
      advancedToS: Number(barrier.advancedToS),
      nextDueAtS: null,
      hasMoreDue: false,
      budgetExhausted: false
    } : prepared.advanceResult || null
  );
};
```

For preceding-root global jobs, writer recognizes `barrier.blockedExternal === true` and does not call `store.parkGlobalBehindPreceding`. The test for case 19 must spy on Store and assert exactly one total `parkGlobalBehindPreceding` call, originating from `advanceBarrier`.

- [ ] **Step 4: Implement exact partial and prepared finalizers**

```js
SchedulerWriter.prototype.assertAccountPartialEffect = function (prepared, effect, mutation) {
  var keys = effect && Object.keys(effect);
  if (!keys || keys.join(',') !== 'checkpointRevision,saveReceipt') {
    throw schedulerError('ACCOUNT_PARTIAL_EFFECT_INVALID');
  }
  if (effect.saveReceipt !== null) {
    if (effect.saveReceipt !== prepared.saveReceipt ||
        effect.checkpointRevision !== effect.saveReceipt.revision) {
      throw schedulerError('ACCOUNT_PARTIAL_RECEIPT_MISMATCH');
    }
    return effect.saveReceipt;
  }
  if (effect.checkpointRevision !== null ||
      !prepared.advanceResult ||
      prepared.advanceResult.processed !== 0 ||
      prepared.advanceResult.budgetExhausted !== true ||
      prepared.advanceResult.hasMoreDue !== true ||
      mutation.remainingBudget.value !== 0) {
    throw schedulerError('ACCOUNT_ESTABLISHED_ZERO_INVALID');
  }
  return null;
};

SchedulerWriter.prototype.finalizePreparedAccountPartialInCurrentUow = function (
  mutation, executable, prepared, effect, nowMs
) {
  var receipt = this.assertAccountPartialEffect(prepared, effect, mutation);
  if (!receipt) {
    this.store.loadExecutableJob(mutation.leaseToken, executable, nowMs);
    return {partial: true, jobId: executable.id, establishedZero: true,
      advanceResult: prepared.advanceResult};
  }
  if (prepared.advanceResult && prepared.advanceResult.blockedExternalJobId) {
    this.store.blockOwnedAccountAdvance(
      mutation.leaseToken, executable, effect.checkpointRevision,
      prepared.advanceResult.blockedExternalJobId, nowMs
    );
    return {partial: true, jobId: null, blockedAccountJobId: executable.id,
      dependencyJobId: prepared.advanceResult.blockedExternalJobId,
      advanceResult: prepared.advanceResult};
  }
  this.store.checkpointPartial(
    mutation.leaseToken, executable, effect.checkpointRevision, nowMs
  );
  return {partial: true, jobId: executable.id, advanceResult: prepared.advanceResult};
};

SchedulerWriter.prototype.finishPreparedInCurrentUow = function (
  mutation, executable, prepared, application, effect, nowMs
) {
  if (prepared.terminalState === 'CANCELLED') {
    this.store.finishResolved(
      mutation.leaseToken, executable, 'CANCELLED', prepared.cancelReason, nowMs
    );
    return {partial: false, completed: true, jobId: executable.id,
      afterCancel: executable.kind === 'ACCOUNT_ADVANCE',
      advanceResult: prepared.advanceResult || null};
  }
  if (prepared.terminalState !== 'COMPLETED') {
    throw schedulerError('JOB_TERMINAL_STATE_INVALID');
  }
  if (executable.kind === 'ACCOUNT_ADVANCE') {
    var receipt = effect || prepared.saveReceipt || null;
    this.store.completeAccountAdvanceAndScheduleSuccessor(
      mutation.leaseToken, executable,
      receipt && receipt.nextLocalAtS !== undefined ? receipt.nextLocalAtS : prepared.nextLocalAtS,
      nowMs
    );
    return {partial: false, completed: true, jobId: executable.id,
      advanceResult: prepared.advanceResult || null};
  }
  this.store.completeApplied(mutation.leaseToken, executable, nowMs);
  return {partial: false, completed: true, jobId: executable.id};
};
```

Established-zero calls no checkpoint, no block, no application, no terminal method, and no world save. It retains the RUNNING row and lock byte-for-byte.

- [ ] **Step 5: Implement account finalizer exactly once**

```js
SchedulerWriter.prototype.finalizeCommandAccountInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  if (!finalizer || finalizer.finalized === true) {
    throw schedulerError('ACCOUNT_FINALIZER_INVALID');
  }
  finalizer.finalized = true;
  if (finalizer.directMode === true) {
    return this.finalizeDirectAccountInCurrentUow(mutation, finalizer, nowMs);
  }
  if (finalizer.partial) {
    return this.finalizePreparedAccountPartialInCurrentUow(
      mutation, finalizer.job, finalizer.prepared, finalizer.effect, nowMs
    );
  }
  this.store.completeAccountAdvanceAndScheduleSuccessor(
    mutation.leaseToken,
    finalizer.job,
    finalizer.effect && finalizer.effect.nextLocalAtS !== undefined ?
      finalizer.effect.nextLocalAtS : finalizer.prepared.nextLocalAtS,
    nowMs
  );
  return {partial: false, jobId: null};
};
```

Drain path never sets `deferAccountFinalize:true`, so it finalizes before returning from `executeClaimedInCurrentUow`. Only command/admission paths use the finalizer, and they must finalize before commit.

- [ ] **Step 6: Implement failure settlement and raw quarantine**

Add Store primitive:

```js
SchedulerStore.prototype.quarantineClaimedRaw = function (token, rawRow, failure, nowMs) {
  this.assertLiveLease(token, nowMs);
  if (!rawRow || typeof rawRow.id !== 'string' ||
      rawRow.state !== 'RUNNING' ||
      rawRow.locked_by !== token.ownerId ||
      Number(rawRow.locked_generation) !== Number(token.generation)) {
    fail('CLAIMED_RAW_QUARANTINE_INVALID');
  }
  assertSchedulerJobId(rawRow.id);
  var code = safeErrorMessage(normalizeSchedulerErrorCode(failure));
  var message = safeErrorMessage(failure && failure.message);
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='QUARANTINED',retry_at_ms=NULL," +
    "error_code=?,error_message_safe=?,quarantined_at_ms=?,updated_at_ms=?," +
    "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL " +
    "WHERE id=? AND state='RUNNING' AND locked_by=? AND locked_generation=? " +
    "AND locked_until_ms>? AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(code, message, nowMs, nowMs, rawRow.id, token.ownerId,
    token.generation, nowMs, token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) {
    if (!this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
    fail('CLAIMED_RAW_QUARANTINE_CONFLICT');
  }
  return 'QUARANTINED';
};
```

It does not parse payload, does not alter attempt, does not trust raw fields as SQL authority beyond matching token/id/generation fences, and never creates SQL state `FAILED`.

Settlement:

```js
SchedulerWriter.prototype.settleClaimFailure = function (rawClaim, failure) {
  var original = failure;
  if (normalizeSchedulerErrorCode(original) === 'INJECTED_CRASH') throw original;
  if (normalizeSchedulerErrorCode(original) === 'LEASE_LOST') {
    this.transitionLeaseLost(original);
    throw original;
  }
  if (isFatalStorageError(original)) {
    this.transitionStorageFatal(original);
    throw original;
  }
  try {
    return this.store.kho.trongGiaoDich(function () {
      var token = this.requireReadyLease(this.effectiveNowMs());
      var nowMs = this.recordEffectiveNowInCurrentUow(token, this.effectiveNowMs());
      var freshRaw = this.store.getById(rawClaim.id);
      if (!freshRaw) {
        this.log('error', 'scheduler.error', {code: 'JOB_FAILURE_MISSING'});
        throw original;
      }
      var executable;
      try {
        executable = this.store.loadExecutableJob(token, freshRaw, nowMs);
      } catch (reloadError) {
        if (normalizeSchedulerErrorCode(reloadError) !== 'PAYLOAD_INTEGRITY' &&
            reloadError.code !== 'PAYLOAD_INTEGRITY') {
          throw reloadError;
        }
        var rawState = this.store.quarantineClaimedRaw(token, freshRaw, original, nowMs);
        this.refreshLeasePhaseInCurrentUow('before-failure-commit', token, nowMs);
        return rawState;
      }
      var state = this.store.fail(token, executable, original, nowMs, this.retryPolicy());
      this.refreshLeasePhaseInCurrentUow('before-failure-commit', token, nowMs);
      return state;
    }.bind(this), {immediate: true});
  } catch (settlementError) {
    if (normalizeSchedulerErrorCode(settlementError) === 'LEASE_LOST') {
      this.transitionLeaseLost(settlementError);
      throw original;
    }
    if (isFatalStorageError(settlementError)) {
      this.transitionStorageFatal(settlementError);
      throw original;
    }
    if (settlementError === original) throw original;
    this.log('error', 'scheduler.error', {code: normalizeSchedulerErrorCode(settlementError)});
    throw original;
  }
};
```

Missing fresh row logs sanitized `JOB_FAILURE_MISSING` and preserves the original failure semantics. Settlement fatal/lease transitions are based on `settlementError`, but the thrown error remains the original reducer/apply failure unchanged.

---

## Task 4: Command MutationGate, advance-due writer helper, public surfaces, and CLI

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/index.js`
- Modify: `server/scheduler/cutover.js`
- Create/Modify: `tools/scheduler-cutover.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: live `world._schedulerActive`, `world.advanceAccountNoiBo`, `kho.q.dqDenHan`, parent `runCommand({name,accountId?,run})`.
- Produces: command admission, `advanceDueInCurrentUow`, exact CLI module surface.

- [ ] **Step 1: RED cases 33-40**

Install and prove RED for cases 33-40.

- [ ] **Step 2: Implement command world batch with live ABI**

```js
SchedulerWriter.prototype.withCommandWorldBatchInCurrentUow = function (mutation, fn) {
  var ok = false, result;
  this.world._schedulerActive(mutation);
  if (this.world.ctx) throw schedulerError('SCHEDULER_WORLD_BATCH_ALREADY_OPEN');
  this.world.batDau();
  try {
    result = fn();
    ok = true;
    return result;
  } finally {
    this.world.ketThuc(ok);
  }
};
```

Do not inspect or create `_mutationContexts`; live world uses `_schedulerMutation` and `_schedulerActive`.

- [ ] **Step 3: Implement direct account command helper**

```js
SchedulerWriter.prototype.directAccountOutcomeInCurrentUow = function (
  mutation, accountId, targetS, nowMs, options
) {
  options = options || {};
  var result = this.world.advanceAccountNoiBo(
    mutation, accountId, targetS, {deferAccountWake: true}
  );
  if (typeof mutation.recordAdvance === 'function') mutation.recordAdvance(result);
  if (result.budgetExhausted || result.deferredExternal === true) {
    if (options.deferAccountFinalize === true) {
      return {
        partial: true,
        budgetExhausted: result.budgetExhausted === true,
        deferredExternal: result.deferredExternal === true,
        jobId: null,
        accountFinalizer: {
          directMode: true,
          directReceipt: result.saveReceipt,
          accountId: accountId,
          targetS: targetS,
          advanceResult: result,
          deferredExternal: result.deferredExternal === true,
          blockedExternalJobId: result.blockedExternalJobId || null,
          finalized: false
        },
        advanceResult: result
      };
    }
    return this.finalizeDirectAccountInCurrentUow(mutation, {
      directMode: true,
      directReceipt: result.saveReceipt,
      accountId: accountId,
      targetS: targetS,
      advanceResult: result,
      deferredExternal: result.deferredExternal === true,
      blockedExternalJobId: result.blockedExternalJobId || null,
      finalized: false
    }, nowMs);
  }
  return {partial: false, budgetExhausted: false, jobId: null, advanceResult: result};
};

SchedulerWriter.prototype.finalizeDirectAccountInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, finalizer.accountId, finalizer.targetS, nowMs, this.leaseMs
  );
  if (!adopted) throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
  if (typeof mutation.recordJob === 'function') mutation.recordJob(adopted, 'partial', nowMs);
  if (finalizer.deferredExternal === true) {
    if (!finalizer.directReceipt || !Number.isSafeInteger(finalizer.directReceipt.revision) ||
        !finalizer.blockedExternalJobId) {
      throw schedulerError('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
    }
    this.store.blockOwnedAccountAdvance(
      mutation.leaseToken, adopted, finalizer.directReceipt.revision,
      finalizer.blockedExternalJobId, nowMs
    );
    return {partial: true, jobId: null, blockedAccountJobId: adopted.id,
      dependencyJobId: finalizer.blockedExternalJobId,
      advanceResult: finalizer.advanceResult};
  }
  if (finalizer.directReceipt) {
    this.store.checkpointPartial(
      mutation.leaseToken, adopted, finalizer.directReceipt.revision, nowMs
    );
  }
  return {partial: true, jobId: adopted.id, advanceResult: finalizer.advanceResult};
};
```

- [ ] **Step 4: Implement adopted account command helper**

```js
SchedulerWriter.prototype.advanceAccountInCurrentUow = function (
  mutation, accountId, targetS, nowMs, options
) {
  options = options || {};
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, accountId, targetS, nowMs, this.leaseMs
  );
  if (!adopted) {
    return this.directAccountOutcomeInCurrentUow(
      mutation, accountId, targetS, nowMs,
      {deferAccountFinalize: options.deferAccountFinalize === true}
    );
  }
  var adoptedOutcome = this.executeClaimedInCurrentUow(mutation, adopted, nowMs, {
    executionTargetS: targetS,
    deferAccountFinalize: options.deferAccountFinalize === true
  });
  if (!adoptedOutcome.afterCancel) return adoptedOutcome;
  var afterCancel = this.directAccountOutcomeInCurrentUow(
    mutation, accountId, targetS, nowMs,
    {deferAccountFinalize: options.deferAccountFinalize === true}
  );
  return Object.assign({}, afterCancel, {afterCancel: true});
};
```

- [ ] **Step 5: Implement writer-owned advance-due helper**

```js
SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, targetS, nowMs) {
  this.world._schedulerActive(mutation);
  var rows = this.store.kho.q.dqDenHan.all(targetS, 60);
  var summary = {processed: 0, advancedToS: targetS, nextDueAtS: null,
    hasMoreDue: false, budgetExhausted: false, saveReceipt: null,
    deferredExternal: false, blockedExternalJobId: null};
  for (var i = 0; i < rows.length; i++) {
    var accountId = Number(rows[i].tk);
    var one = this.directAccountOutcomeInCurrentUow(
      mutation, accountId, targetS, nowMs, {deferAccountFinalize: true}
    );
    var advance = one.advanceResult || one;
    summary.processed += Number(advance.processed || 0);
    summary.advancedToS = Math.max(summary.advancedToS, Number(advance.advancedToS || targetS));
    summary.nextDueAtS = advance.nextDueAtS === null || advance.nextDueAtS === undefined ?
      summary.nextDueAtS : (summary.nextDueAtS === null ?
        Number(advance.nextDueAtS) : Math.min(summary.nextDueAtS, Number(advance.nextDueAtS)));
    summary.budgetExhausted = summary.budgetExhausted || advance.budgetExhausted === true;
    summary.deferredExternal = summary.deferredExternal || advance.deferredExternal === true;
    summary.blockedExternalJobId = summary.blockedExternalJobId || advance.blockedExternalJobId || null;
    if (one.accountFinalizer) {
      if (mutation.commandAccountFinalizer) {
        throw schedulerError('ACCOUNT_COMMAND_FINALIZER_DUPLICATE');
      }
      mutation.commandAccountFinalizer = one.accountFinalizer;
    }
    if (summary.budgetExhausted || summary.deferredExternal) {
      summary.hasMoreDue = true;
      break;
    }
  }
  if (rows.length === 60 && !summary.budgetExhausted && !summary.deferredExternal) {
    summary.hasMoreDue = true;
  }
  return summary;
};
```

This helper is Task 6-owned writer code. It does not modify `server/world.js`. It preserves deterministic `dqDenHan` ordering and uses live `world.advanceAccountNoiBo` through `directAccountOutcomeInCurrentUow`.

- [ ] **Step 6: Implement `runCommand`**

```js
SchedulerWriter.prototype.runCommand = function (command) {
  var self = this;
  validateCommand(command);
  try { this.assertAccepting(); } catch (error) { return Promise.reject(error); }
  return this.enqueue(function () {
    self.assertOperationalAdmission();
    var nowMs = self.effectiveNowMs();
    var nowS = Math.floor(nowMs / 1000);
    var budget = assertNewDrainBudget(sharedRemainingBudget());
    var barrier = self.settleBarriersForAdmission(budget, nowS, nowMs);
    if (barrier.deferred) throw schedulerError('GLOBAL_BARRIER_PENDING');
    if (barrier.budgetExhausted) {
      if (barrier.jobId) self.enqueueCommittedPartial(barrier.jobId);
      else self.enqueueBudgetContinuationIfDue(self.leaseToken, self.effectiveNowMs());
      return {deferred: true, code: 'TICK_PARTIAL'};
    }
    var committed = self.store.kho.trongGiaoDich(function () {
      var token = self.requireReadyLease(self.effectiveNowMs());
      nowMs = self.recordEffectiveNowInCurrentUow(token, self.effectiveNowMs());
      nowS = Math.floor(nowMs / 1000);
      var mutation = self.newMutationContext(token, budget, nowMs);
      var transactionResult = self.world.trongMutationScheduler(mutation, function () {
        var outcome = null, due = null, result, finalized;
        self.markDurableMutationInCurrentUow(mutation, nowMs);
        if (command.name === 'account-delete') {
          result = command.run();
          if (result && typeof result.then === 'function') {
            throw schedulerError('UNIT_OF_WORK_ASYNC');
          }
          return {response: result, partialJobId: null, metricOutcome: null};
        }
        if (command.name === 'advance-due') {
          due = self.advanceDueInCurrentUow(mutation, nowS, nowMs);
          if (due.budgetExhausted || due.deferredExternal === true) {
            if (!mutation.commandAccountFinalizer) {
              throw schedulerError('ACCOUNT_COMMAND_FINALIZER_MISSING');
            }
            finalized = self.finalizeCommandAccountInCurrentUow(
              mutation, mutation.commandAccountFinalizer, nowMs
            );
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId || null, metricOutcome: due};
          }
        }
        result = self.withCommandWorldBatchInCurrentUow(mutation, function () {
          if (command.accountId !== undefined) {
            outcome = self.advanceAccountInCurrentUow(
              mutation, command.accountId, nowS, nowMs,
              {deferAccountFinalize: true}
            );
            if (outcome.budgetExhausted || outcome.partial ||
                outcome.deferredExternal === true) {
              return {deferred: true, outcome: outcome};
            }
          }
          var value = command.run();
          if (value && typeof value.then === 'function') {
            throw schedulerError('UNIT_OF_WORK_ASYNC');
          }
          return {deferred: false, value: value, outcome: outcome};
        });
        if (result.outcome && result.outcome.accountFinalizer) {
          finalized = self.finalizeCommandAccountInCurrentUow(
            mutation, result.outcome.accountFinalizer, nowMs
          );
          if (finalized.partial) {
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId || null, metricOutcome: result.outcome};
          }
        }
        if (mutation.commandAccountFinalizer) {
          finalized = self.finalizeCommandAccountInCurrentUow(
            mutation, mutation.commandAccountFinalizer, nowMs
          );
          if (finalized.partial) {
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId || null,
              metricOutcome: mutation.commandAccountFinalizer.advanceResult || due};
          }
        }
        if (result.deferred) {
          finalized = result.outcome.accountFinalizer ?
            self.finalizeCommandAccountInCurrentUow(
              mutation, result.outcome.accountFinalizer, nowMs
            ) : result.outcome;
          return {response: {deferred: true, code: 'TICK_PARTIAL'},
            partialJobId: finalized.jobId || null, metricOutcome: result.outcome};
        }
        return {response: result.value, partialJobId: null,
          metricOutcome: result.outcome || due || null};
      });
      transactionResult.metricLedger = mutation.metricLedger;
      self.callFaultHook('before-final-fence', null);
      self.refreshLeasePhaseInCurrentUow('before-command-commit', token, nowMs);
      return transactionResult;
    }, {immediate: true});
    self.flushCommittedMetricLedger(committed.metricLedger);
    if (committed.partialJobId) self.enqueueCommittedPartial(committed.partialJobId);
    else if (committed.response && committed.response.deferred === true) {
      self.enqueueBudgetContinuationIfDue(self.leaseToken, self.effectiveNowMs());
    }
    return committed.response;
  }, true).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  });
};
```

Account partial tests assert closure count `0`. Thenable tests assert closure count `1`, public `UNIT_OF_WORK_ASYNC`, and rollback of all writes in that UoW.

- [ ] **Step 7: Implement exact CLI surface**

`server/scheduler/cutover.js` exports `{runMaintenanceCutover}`.

`tools/scheduler-cutover.js` exports exactly:

```js
module.exports = {
  parseArgs: parseArgs,
  runCli: runCli,
  main: main
};

if (require.main === module) {
  main(process.argv.slice(2), process.env, {
    stdout: process.stdout,
    stderr: process.stderr
  }, {});
}
```

`runCli(argv,dependencies)` accepts injected `openKho`, `makeOwnerId`, and `clock`; opens Kho only after args validate; returns `{exitCode,stdout,stderr}`; closes Kho in `finally`; prints only `{action:'cutover',mode,imported,recovered}` JSON on success.

---

## Task 5: Verification, report, immutable seals, and reviews

**Files:**

- Create/Modify: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`
- No source/test edits except if verification fails; any source/test fix restarts Task 5 from Step 1.

**Interfaces:**

- Consumes: six implementation/test hashes, final report, active plan hash, two fresh Sol/high reviews.
- Produces: handoff evidence without report self-hash or stale review seals.

- [ ] **Step 1: Run full scheduler verification**

```bash
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
```

Expected output after 42 added tests: `# tests 205`, `# pass 204`, `# fail 0`, `# skipped 1`.

- [ ] **Step 2: Run syntax and whitespace checks**

```bash
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
git diff --check -- server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js
rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

- [ ] **Step 3: Compute six-file implementation seal**

```bash
sha256sum \
  server/scheduler/store.js \
  server/scheduler/writer.js \
  server/scheduler/index.js \
  server/scheduler/cutover.js \
  tools/scheduler-cutover.js \
  tools/test-scheduler.js \
  > /tmp/task6-six-file-sha256.txt
```

The report includes these six hashes, verification command outputs, RED proof summary, scope checks, and the fact that review binding is to the six-file seal only. The report does not include its own hash.

- [ ] **Step 4: Run normalized inventory checks**

```bash
task6_inventory > /tmp/task6-post-inventory.tsv
awk -F '\t' '
  $3 ~ /^(server\/app\.js|server\/api\.js|server\/world\.js|server\/index\.js|server\/contract\.js|server\/scheduler\/contract\.js|public\/game\.(html|js|css)|dist\/thienhadaichien\.bin|dist\/thien-ha-dai-chien\.html|dist\/artifact\.html|package(-lock)?\.json|README\.md|js\/.*\.js|web\/js\/mp\.js)$/ {print}
' /tmp/task6-post-inventory.tsv > /tmp/task6-post-forbidden.tsv
diff -u /tmp/task6-pre-forbidden.tsv /tmp/task6-post-forbidden.tsv
python3 - <<'PY'
from pathlib import Path
allowed_mutable = {
  'server/scheduler/store.js',
  'server/scheduler/writer.js',
  'server/scheduler/index.js',
  'server/scheduler/cutover.js',
  'tools/scheduler-cutover.js',
  'tools/test-scheduler.js',
  'docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md',
}
expected_fixed = {
  'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v5.md',
}
def load(path):
  rows = {}
  for line in Path(path).read_text().splitlines():
    sha, size, rel = line.split('\t', 2)
    rows[rel] = (sha, size)
  return rows
pre = load('/tmp/task6-pre-inventory.tsv')
post = load('/tmp/task6-post-inventory.tsv')
changed = {p for p in pre.keys() | post.keys() if pre.get(p) != post.get(p)}
bad = sorted(p for p in changed if p not in allowed_mutable and p not in expected_fixed)
if bad:
  raise SystemExit('non-owned inventory changes:\\n' + '\\n'.join(bad))
PY
sha256sum -c /tmp/task6-active-plan.sha256
```

The plan file may exist as an expected fixed artifact, but any hash mismatch fails the `sha256sum -c` check.

- [ ] **Step 5: Launch two fresh Sol/high reviews over exact six hashes**

Send both reviewers:

- V5 plan path and external hash from `/tmp/task6-active-plan.sha256`,
- six implementation/test paths and hashes from `/tmp/task6-six-file-sha256.txt`,
- verification outputs,
- normalized inventory/forbidden diff result,
- exact report path.

The review request must state: any change to the six sealed files or V5 plan invalidates both approvals and requires rerunning verification, recomputing six hashes, and launching two new fresh Sol/high reviews.

- [ ] **Step 6: Finalize report and rerun final checks**

Approvals may be recorded in the report after review because review binding is only to the six implementation/test hashes and the external V5 plan hash. If report text changes after approval, rerun:

```bash
sha256sum -c /tmp/task6-six-file-sha256.txt
sha256sum -c /tmp/task6-active-plan.sha256
task6_inventory > /tmp/task6-final-inventory.tsv
rg -n '[[:blank:]]+$' docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

Then repeat the normalized inventory comparison using `/tmp/task6-final-inventory.tsv` in place of post inventory. If any six-file hash or plan hash differs, discard the reviews and restart Task 5.

## Completion definition

- V1-V4 plans are preserved.
- V5 active plan hash is pinned externally and remains fixed through final handoff.
- Exactly 42 new tests are added and proven RED by exact TAP subtest name and sentinel; final suite arithmetic is 205 total tests.
- Claimed-job execution follows Task 5 lines 825-833 exactly.
- `advanceBarrier` preceding-root path causes exactly one Store park call, owned by AdvanceService.
- `runCommand` account deferral finalizes exactly once before commit and never uses `prepared.deferredExternal`.
- `advance-due` is Task 6 writer-owned and uses `dqDenHan` plus `world.advanceAccountNoiBo`; `server/world.js` remains unchanged.
- Every command/effect/settlement/recovery UoW performs a final live-lease fence immediately before commit.
- Raw quarantine does not parse payload and does not change attempt.
- Startup recovery includes `assertAccountDependencyIntegrity` and real `resumeOwnedRunning(token,jobId,nowMs,lockMs)` calls.
- CLI exports exactly `parseArgs`, `runCli`, and `main`, with the stated `require.main` call.
- Scope checks prove no non-owned tracked or untracked file changed.
- Report has no self-hash. Two fresh Sol/high approvals bind to the exact six implementation/test hashes and external V5 plan hash.
