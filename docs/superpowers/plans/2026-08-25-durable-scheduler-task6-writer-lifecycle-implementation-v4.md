# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 writer lifecycle, global watermark, retry/backoff, quarantine fallback, MutationGate, cutover command, and lifecycle bridge seams exactly on top of accepted Tasks 1-5.

**Architecture:** Add one leased `SchedulerWriter` that serializes all durable mutations through live-lease immediate SQLite UoWs and `world.trongMutationScheduler`. The writer consumes live Task 5 reducer/advance/store contracts without replacing reducer ownership, double-parking barrier roots, or adding Task 7+ API routing.

**Tech Stack:** Node.js CommonJS, `node:test`, SQLite through existing `Kho.trongGiaoDich(...,{immediate:true})`, accepted scheduler Store/Reducer/AdvanceService modules.

**Spec:** `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` Task 6 lines 10866 onward; accepted Task 5 remediation protocol `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md` lines 825-833.

## Direct inspection baseline for V4

This plan was authored after direct inspection of these live seams:

- Parent Task 6 files/surfaces: `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866`, `:14557`, `:14904`, `:15024`, `:15164`, `:15279`, `:15319`.
- Task 5 protocol: `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825`.
- Reducer live ABI: `server/scheduler/reducers.js:232` `initializeCombatSeed(leaseToken,effectiveNowMs)`, `:319` `prepare(mutation,executableJob,options)`, `:345` `applyPrepared(mutation,prepared)`.
- Advance live ABI: `server/scheduler/advance-service.js:491` `advanceBarrier(mutation,executableJob)`.
- Store live ABI: `server/scheduler/store.js:845` `resumeOwnedRunning(token,jobId,nowMs,lockMs)`, `:866` `loadExecutableJob(token,row,nowMs)`, `:949` `hasCommittedApplication(token,executableJob,nowMs)`, `:974` `insertApplication(token,executableJob,application,nowMs,canonicalTContext)`, `:1031` `checkpointPartial(token,job,revision,nowMs)`, `:1050` `markDurableMutation(token,nowMs)`, `:1076` `completeApplied(token,job,nowMs)`, `:1106` `finishResolved(token,job,state,reason,nowMs)`, `:1142` `completeAccountAdvanceAndScheduleSuccessor(token,job,nextLocalAtS,nowMs)`, `:1158` `fail(token,job,failure,nowMs,policy)`, `:1198` `recoverExpiredRunning(token,nowMs,policy)`, `:1464` `blockOwnedAccountAdvance(token,job,checkpointRevision,blockedByJobId,nowMs)`, `:1527` `parkGlobalBehindPreceding(token,runningJob,precedingJobId,targetS,nowMs)`.
- Existing tests around Task 5 surfaces/faults: `tools/test-scheduler.js:8550`, `:8631`, `:8691`, `:8837`, `:10260`, `:10853`.

## Global Constraints

- Preserve V1-V3 immutable plan files. Create only this V4 plan while authoring this planning task.
- Task 6 implementation may modify exactly these six implementation/test files: `server/scheduler/store.js`, `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`.
- The exact implementation report path is `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- During implementation, only the six files above plus the exact report path and the active plan artifact may differ at final handoff. Any change to parent plan files, Task 7+ source, distribution artifacts, package manifests, or arbitrary untracked files blocks handoff.
- Explicit forbidden Task 7+ paths include `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, `js/actions.js`, `js/app.js`, `js/combat.js`, `js/data.js`, `js/engine.js`, `js/fleet.js`, `js/galaxy.js`, `js/main.js`, `js/ui.js`, `js/util.js`, and `web/js/mp.js`.
- Keep the accepted public bridge enumerable keys exactly `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`. Task 7-required lifecycle helpers are private non-enumerable own properties.
- Keep Foundation scheduler options exactly three base keys: `cleanupMs,schedulerLogTicks,schedulerPollMs`. Durable env keys remain the parent Task 6 keys: `SCHEDULER_LEASE_MS`, `SCHEDULER_RETRY_BASE_MS`, `SCHEDULER_RETRY_MAX_MS`, `SCHEDULER_MAX_ATTEMPTS`, `SCHEDULER_MAX_QUARANTINED_READY`, `SCHEDULER_MAX_BACKLOG_AGE_MS`, `SCHEDULER_SHUTDOWN_GRACE_MS`, `SCHEDULER_RECONCILE_INTERVAL_MS`.
- TDD is mandatory. Each listed RED test is installed and proven to fail by its exact TAP subtest name and unique sentinel before production code for that behavior is added.
- The existing accepted suite baseline is 163 tests. V4 keeps 42 new Task 6 tests, so final scheduler verification target is 205 tests, 204 passed, 0 failed, 1 known environment skip. If the executor finds a different live baseline before editing, update this arithmetic in the report with the command output and do not silently keep stale totals.

## Corrections from blocked V3

1. Replace V3 `finishPreparedOrPartial` with the accepted Task 5 protocol: `prepare` returns `kind:'partial'` or `kind:'prepared'`; `applyPrepared` is called as `reducer.applyPrepared(mutation, prepared)`.
2. Writer recognizes `advanceBarrier` preceding-root output already parked by `advance-service.js:523`; it never calls `store.parkGlobalBehindPreceding` a second time. Tests assert exactly one total Store park call.
3. `runCommand` returns `{deferred:true,code:'TICK_PARTIAL'}` for barrier partials, enqueues partial/continuation only after the responsible UoW commits, restores account finalizer success branches, restores completed `advance-due` finalizer flow, and executes a final lease fence on every UoW exit.
4. Startup unwind catches/logs compensating release failures without replacing the original startup error, handles `stopRequested`, and avoids poll rearm when stopping.
5. Scope verification is an allowlist-based full repository inventory with untracked files, plus forbidden hashes. It detects new `js/*.js` and arbitrary untracked non-owned files.
6. RED helper uses lazy imports, exact literal TAP subtest registration, exact `not ok` line matching, unique diagnostic sentinels, prior trap and `errexit` restoration, and a 42-entry manifest.
7. Lease-loss and final-fence behavior is idempotent under stopping/stopped/finalization races.
8. `quarantineClaimedRaw` is a new Store primitive with no payload parse, token/id/generation fences, attempt preservation, live lease checks, and quarantine fields only.
9. Fresh settlement handles a missing fresh row explicitly and rethrows the original failure unchanged after sanitized logging.
10. V1-V3 items remain fixed: branded executable target defaults, private non-enumerable Task 7 seams, one standby poll on lease loss, exact CLI contract, no report self-hash, and two fresh Sol/high implementation reviews over the exact six-file implementation seal.

---

## Task 1: Preflight inventory and RED harness

**Files:**

- Modify: `tools/test-scheduler.js`
- Create at implementation time: `/tmp/task6-pre-inventory.tsv`, `/tmp/task6-pre-forbidden.tsv`

**Interfaces:**

- Consumes: existing `node --test` TAP output from `tools/test-scheduler.js`.
- Produces: reusable shell helpers for exact RED proof and scope proof.

- [ ] **Step 1: Capture full pre-inventory and forbidden hashes**

Run before any source edit:

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

The executor must store both files until final verification. This inventory includes tracked, modified, and untracked files. It is not `git status`.

- [ ] **Step 2: Add the RED manifest with exactly 42 cases**

Append a manifest near existing scheduler test helpers:

```js
var TASK6_RED_CASES = Object.freeze([
  ['Task 6 v4 writer rejects legacy mode before lease', 'TASK6_RED_001_LEGACY'],
  ['Task 6 v4 startup failure releases committed lease and keeps original error', 'TASK6_RED_002_STARTUP'],
  ['Task 6 v4 startup failure during acquisition rollback arms no poll when stopping', 'TASK6_RED_003_STARTUP_STOP'],
  ['Task 6 v4 heartbeat transient rearms while generation loss keeps one poll', 'TASK6_RED_004_HEARTBEAT'],
  ['Task 6 v4 transitionLeaseLost is idempotent during stop finalization', 'TASK6_RED_005_LEASE_STOP'],
  ['Task 6 v4 shutdown admission fence drains captured tail with bounded grace', 'TASK6_RED_006_SHUTDOWN'],
  ['Task 6 v4 private lifecycle descriptors are non enumerable and exact', 'TASK6_RED_007_PRIVATE_KEYS'],
  ['Task 6 v4 database closing status is cache only', 'TASK6_RED_008_DB_CLOSED'],
  ['Task 6 v4 cutover rejects nonempty legacy database before Task 9', 'TASK6_RED_009_CUTOVER'],
  ['Task 6 v4 CLI runCli validates args injects owner and closes kho', 'TASK6_RED_010_CLI'],
  ['Task 6 v4 claim uses raw row only through loadExecutableJob branding', 'TASK6_RED_011_BRAND'],
  ['Task 6 v4 branded default execution target comes from executable', 'TASK6_RED_012_TARGET'],
  ['Task 6 v4 before claim crash leaves no running row', 'TASK6_RED_013_BEFORE_CLAIM'],
  ['Task 6 v4 after claim crash recovers expired running without effect', 'TASK6_RED_014_AFTER_CLAIM'],
  ['Task 6 v4 after application crash restarts without duplicate effect', 'TASK6_RED_015_AFTER_APP'],
  ['Task 6 v4 after effect crash rolls back application and state together', 'TASK6_RED_016_AFTER_EFFECT'],
  ['Task 6 v4 before final fence generation flip rolls back effect UoW', 'TASK6_RED_017_FINAL_FENCE'],
  ['Task 6 v4 already applied restart skips effect and terminalizes once', 'TASK6_RED_018_REPLAY'],
  ['Task 6 v4 stale generation effect fails before commit', 'TASK6_RED_019_STALE_GEN'],
  ['Task 6 v4 barrier preceding root uses already parked result once', 'TASK6_RED_020_BARRIER_PARK'],
  ['Task 6 v4 barrier budget partial queues continuation after commit', 'TASK6_RED_021_BARRIER_PARTIAL'],
  ['Task 6 v4 partial account checkpoint follows Task 5 wrapper', 'TASK6_RED_022_PARTIAL_CHECKPOINT'],
  ['Task 6 v4 partial account blocked external calls blockOwnedAccountAdvance', 'TASK6_RED_023_PARTIAL_BLOCK'],
  ['Task 6 v4 established zero partial retains running lock unchanged', 'TASK6_RED_024_ESTABLISHED_ZERO'],
  ['Task 6 v4 prepared global charges primitive once before idempotency insert', 'TASK6_RED_025_GLOBAL_CHARGE'],
  ['Task 6 v4 prepared replay validates insert and skips effect charge', 'TASK6_RED_026_REPLAY_CHARGE'],
  ['Task 6 v4 terminal mapping uses finishResolved completeApplied and account successor', 'TASK6_RED_027_TERMINAL'],
  ['Task 6 v4 failure settlement reloads executable then store fail', 'TASK6_RED_028_SETTLE_FAIL'],
  ['Task 6 v4 failure settlement raw payload corruption quarantines without parse', 'TASK6_RED_029_RAW_QUAR'],
  ['Task 6 v4 failure settlement missing fresh row preserves original failure', 'TASK6_RED_030_MISSING_ROW'],
  ['Task 6 v4 retry classifier matches Store transient and fatal codes', 'TASK6_RED_031_RETRY'],
  ['Task 6 v4 recover expired running uses exact token now policy ABI', 'TASK6_RED_032_RECOVER'],
  ['Task 6 v4 runCommand barrier partial returns TICK_PARTIAL response', 'TASK6_RED_033_CMD_BARRIER'],
  ['Task 6 v4 runCommand account partial never invokes closure', 'TASK6_RED_034_CMD_PARTIAL'],
  ['Task 6 v4 runCommand thenable rolls back after invocation only', 'TASK6_RED_035_CMD_THENABLE'],
  ['Task 6 v4 runCommand successful adopted account finalizer preserves closure response', 'TASK6_RED_036_CMD_ADOPT'],
  ['Task 6 v4 runCommand advance due completed finalizer preserves closure response', 'TASK6_RED_037_CMD_DUE_DONE'],
  ['Task 6 v4 runCommand advance due partial skips closure', 'TASK6_RED_038_CMD_DUE_PARTIAL'],
  ['Task 6 v4 account delete skips automatic advance branch', 'TASK6_RED_039_ACCOUNT_DELETE'],
  ['Task 6 v4 schedule cancel reconcile mark durable and keep public surfaces exact', 'TASK6_RED_040_PUBLIC_SURFACES'],
  ['Task 6 v4 normalized scope allowlist rejects arbitrary untracked file', 'TASK6_RED_041_SCOPE'],
  ['Task 6 v4 implementation report seal excludes itself and binds six hashes', 'TASK6_RED_042_SEAL']
]);
```

Add a manifest validation test before feature tests:

```js
test('Task 6 v4 RED manifest has exactly 42 unique names and sentinels', function () {
  assert.equal(TASK6_RED_CASES.length, 42, 'TASK6_RED_MANIFEST_COUNT');
  var names = new Set(), sentinels = new Set();
  TASK6_RED_CASES.forEach(function (entry) {
    assert.equal(entry.length, 2, 'TASK6_RED_MANIFEST_SHAPE');
    assert.equal(typeof entry[0], 'string', 'TASK6_RED_MANIFEST_NAME');
    assert.equal(typeof entry[1], 'string', 'TASK6_RED_MANIFEST_SENTINEL');
    assert.equal(entry[0].indexOf(entry[1]), -1, 'TASK6_RED_SENTINEL_NOT_TITLE');
    assert.equal(names.has(entry[0]), false, 'TASK6_RED_NAME_UNIQUE');
    assert.equal(sentinels.has(entry[1]), false, 'TASK6_RED_SENTINEL_UNIQUE');
    names.add(entry[0]);
    sentinels.add(entry[1]);
  });
});
```

- [ ] **Step 3: Use the exact RED helper for every case**

Create this shell helper in the implementation notes or report and run it for each manifest entry before making the corresponding production change:

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
  node --test tools/test-scheduler.js >"$out" 2>&1
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

Each test body must lazy-require new modules inside the test or fixture, not at file top, so missing modules register all 42 subtests. Loader failure cannot pass because the helper requires both the TAP registration line and the selected `not ok` line. The sentinel must be emitted only by the failing assertion in that subtest.

---

## Task 2: Writer lifecycle, lease, timers, startup, and private bridge

**Files:**

- Create/Modify: `server/scheduler/writer.js`
- Create/Modify: `server/scheduler/index.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: `store.acquireLease`, `store.releaseLease`, `store.recoverExpiredRunning(token,nowMs,policy)`, `reducer.initializeCombatSeed(token,nowMs)`, `world.trongMutationScheduler`.
- Produces: `SchedulerWriter`, `taoScheduler(context)`, private non-enumerable bridge lifecycle seams.

- [ ] **Step 1: RED tests 1-8**

Install and prove RED for manifest cases 1-8. These cover legacy refusal, startup unwind, heartbeat transient, lease loss during stop, bounded shutdown, private descriptors, and DB-closing cache status.

- [ ] **Step 2: Implement startup order and unwind**

Startup order is exact:

1. Reject legacy mode before lease acquisition.
2. Acquire standby lease in an immediate UoW.
3. Inside the startup/recovery UoW call `reducer.initializeCombatSeed(token, nowMs)`.
4. Call `store.recoverExpiredRunning(token, nowMs, retryPolicy)`.
5. Resume owned running rows by `store.resumeOwnedRunning(token, jobId, nowMs, leaseMs)`.
6. Adopt queued continuations before ordinary claims.
7. Arm heartbeat, wake, and reconcile timers only after state is `ready`.

Use this unwind shape:

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

If failure occurs inside the acquisition UoW, pass `committedToken=null`; rollback removes the tentative lease. If failure occurs after acquisition committed, pass the committed token and release it best-effort. A release failure is logged and never replaces the original startup error.

- [ ] **Step 3: Implement idempotent lease-loss and timer semantics**

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
  if (this.state === 'stopping' || this.state === 'stopped' ||
      this.stopRequested || this.stopFinalizePromise) {
    this.clearMutationTimers();
    return;
  }
  this.clearMutationTimers();
  this.accepting = false;
  this.ready = false;
  this.recoveryComplete = false;
  this.state = 'standby';
  this.reason = 'SCHEDULER_LEASE_LOST';
  this.leaseToken = null;
  this.ensureStandbyPoll();
};
```

Lease loss clears mutation/retry timers but retains at most one standby acquisition poll. `stop()` clears grace, poll, wake, heartbeat, reconcile, and continuation handles.

- [ ] **Step 4: Implement private bridge descriptors**

Enumerable bridge keys remain exactly:

```js
['advanceTo', 'cancel', 'getStatus', 'reconcile', 'runCommand', 'schedule', 'start', 'stop']
```

Define private methods with non-enumerable, non-writable, non-configurable descriptors:

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

After `_datDatabaseClosing`, `writer.status()` and bridge `getStatus()` must use cached fields only and must not touch SQLite.

---

## Task 3: Claimed-job lifecycle and exact Task 5 downstream protocol

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: accepted Task 5 protocol lines 825-833; live reducer/store/advance methods listed in the baseline.
- Produces: `claimNext`/`applyClaimed`/settlement lifecycle, `quarantineClaimedRaw(token,rawRow,failure,nowMs)`.

- [ ] **Step 1: RED tests 11-32**

Install and prove RED for manifest cases 11-32. Tests must use real Store, Reducer, AdvanceService, and World fixtures unless a fault injection needs a narrow method wrapper restored in `finally`.

- [ ] **Step 2: Claim and apply order with crash hooks**

Claim order:

```js
SchedulerWriter.prototype.claimOneDue = function (budget, nowMs) {
  this.callFaultHook('before-claim', null);
  var raw = this.store.kho.trongGiaoDich(function () {
    var token = this.requireReadyLease(nowMs);
    var watermarkS = this.store.globalWatermarkS();
    return this.store.claimNext(token, nowMs, watermarkS, this.leaseMs);
  }.bind(this), {immediate: true});
  if (raw) this.callFaultHook('after-claim', raw);
  return raw;
};
```

Effect UoW order:

```js
SchedulerWriter.prototype.applyClaimed = function (rawClaim, budget, nowMs) {
  var self = this;
  return this.store.kho.trongGiaoDich(function () {
    var token = self.requireReadyLease(self.effectiveNowMs());
    nowMs = self.recordEffectiveNowInCurrentUow(token, self.effectiveNowMs());
    var mutation = self.newMutationContext(token, budget, nowMs);
    var tx = self.world.trongMutationScheduler(mutation, function () {
      var executable = self.store.loadExecutableJob(token, rawClaim, nowMs);
      self.markDurableMutationInCurrentUow(mutation, nowMs);
      return self.executeClaimedInCurrentUow(mutation, executable, nowMs, {
        executionTargetS: Number(executable.scheduled_at_s)
      });
    });
    tx.metricLedger = mutation.metricLedger;
    self.callFaultHook('before-final-fence', rawClaim);
    self.refreshLeasePhaseInCurrentUow('before-effect-commit', token, nowMs);
    return tx;
  }, {immediate: true});
};
```

Accepted crash stages are `before-claim`, `after-claim`, `after-application`, `after-effect`, and `before-final-fence`. The three post-claim crash hooks are `after-claim`, `after-application`, and `after-effect`; `before-final-fence` is the stale-generation fence test.

- [ ] **Step 3: Implement claimed job protocol exactly**

```js
SchedulerWriter.prototype.executeClaimedInCurrentUow = function (
  mutation, executable, nowMs, options
) {
  var token = mutation.leaseToken;
  var prepared, application, effect, alreadyCommitted, barrier;
  if (executable.kind === 'PVP_RESOLVE' || executable.kind === 'EXTERNAL_RESOLVE') {
    barrier = this.advanceService.advanceBarrier(mutation, executable);
    if (barrier.blockedExternal === true && barrier.blockedExternalJobId) {
      return {reordered: true, partial: false, jobId: executable.id,
        blockedExternalJobId: barrier.blockedExternalJobId, advanceResult: barrier};
    }
    if (barrier.budgetExhausted === true) {
      return {partial: true, budgetExhausted: true, jobId: executable.id,
        advanceResult: barrier};
    }
    alreadyCommitted = this.store.hasCommittedApplication(token, executable, nowMs);
    if (!alreadyCommitted) {
      if (mutation.remainingBudget.value < 1) {
        return {partial: true, budgetExhausted: true, jobId: executable.id,
          advanceResult: barrier};
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
    return this.finishPartialInCurrentUow(mutation, executable, prepared, effect, nowMs);
  }
  if (prepared.kind !== 'prepared') throw schedulerError('PREPARED_KIND_INVALID');
  application = this.store.insertApplication(
    token, executable, prepared.application, nowMs, prepared.canonicalTContext || null
  );
  this.callFaultHook('after-application', executable);
  if (application.alreadyApplied) {
    effect = null;
  } else {
    effect = this.reducer.applyPrepared(mutation, prepared);
    this.callFaultHook('after-effect', executable);
  }
  return this.finishPreparedInCurrentUow(
    mutation, executable, prepared, application, effect, nowMs
  );
};
```

Important: `advanceBarrier` already calls `store.parkGlobalBehindPreceding(...)` and returns `{blockedExternal:true,blockedExternalJobId}` when a preceding root exists. Writer must not call `parkGlobalBehindPreceding` in that branch. Keep the Store ABI in inventory for tests, but the test must count exactly one total call during a preceding-root drain.

- [ ] **Step 4: Implement partial finalization exactly**

```js
SchedulerWriter.prototype.finishPartialInCurrentUow = function (
  mutation, executable, prepared, effect, nowMs
) {
  var keys = effect && Object.keys(effect);
  if (!keys || keys.join(',') !== 'checkpointRevision,saveReceipt') {
    throw schedulerError('ACCOUNT_PARTIAL_EFFECT_INVALID');
  }
  if (effect.saveReceipt !== null) {
    if (effect.saveReceipt !== prepared.saveReceipt ||
        effect.checkpointRevision !== effect.saveReceipt.revision) {
      throw schedulerError('ACCOUNT_PARTIAL_RECEIPT_MISMATCH');
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
  }
  if (effect.checkpointRevision !== null ||
      !prepared.advanceResult ||
      prepared.advanceResult.processed !== 0 ||
      prepared.advanceResult.budgetExhausted !== true ||
      prepared.advanceResult.hasMoreDue !== true ||
      mutation.remainingBudget.value !== 0) {
    throw schedulerError('ACCOUNT_ESTABLISHED_ZERO_INVALID');
  }
  this.store.loadExecutableJob(mutation.leaseToken, executable, nowMs);
  return {partial: true, jobId: executable.id, establishedZero: true,
    advanceResult: prepared.advanceResult};
};
```

Established-zero performs no checkpoint, no block, no application, no terminal transition, no world save, and no new marker. The already adopted RUNNING row keeps its lock tuple and checkpoint state byte-for-byte.

- [ ] **Step 5: Implement prepared finalization exactly**

```js
SchedulerWriter.prototype.finishPreparedInCurrentUow = function (
  mutation, executable, prepared, application, effect, nowMs
) {
  if (application.alreadyApplied) {
    if (effect !== null) throw schedulerError('APPLICATION_REPLAY_EFFECT_INVALID');
  } else if (executable.kind === 'PVP_RESOLVE' || executable.kind === 'EXTERNAL_RESOLVE') {
    if (!effect) throw schedulerError('GLOBAL_EFFECT_REQUIRED');
  }
  if (prepared.terminalState === 'CANCELLED') {
    this.store.finishResolved(
      mutation.leaseToken, executable, 'CANCELLED', prepared.cancelReason, nowMs
    );
    return {completed: true, terminalState: 'CANCELLED', jobId: executable.id};
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
    return {completed: true, terminalState: 'COMPLETED', jobId: executable.id};
  }
  this.store.completeApplied(mutation.leaseToken, executable, nowMs);
  return {completed: true, terminalState: 'COMPLETED', jobId: executable.id};
};
```

Terminal mapping is closed:

| Prepared terminal | Store call |
|---|---|
| `CANCELLED` with `STALE_REVISION`, `MATCH_INVALIDATED`, `ENTITY_REMOVED`, or `OPERATOR_CONFIRMED_INVALID` | `finishResolved(token, executable, 'CANCELLED', reason, nowMs)` |
| `COMPLETED` for `ACCOUNT_ADVANCE` | `completeAccountAdvanceAndScheduleSuccessor(token, executable, nextLocalAtS, nowMs)` |
| `COMPLETED` for `PVP_RESOLVE` or `EXTERNAL_RESOLVE` | `completeApplied(token, executable, nowMs)` |

The writer calls `insertApplication` even when `hasCommittedApplication` was true so immutable bytes are revalidated. Existing application replay spends zero extra global primitive and skips every world effect.

- [ ] **Step 6: Implement raw quarantine fallback**

Add this Store method only for payload-integrity failure during fresh settlement reload:

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

This method never parses `payload_json`, never validates semantic payload fields, never trusts raw owner/generation as SQL authority, and never changes `attempt`. It uses Store's accepted terminal quarantine representation: state `QUARANTINED`, `quarantined_at_ms`, `error_code`, `error_message_safe`, null lock fields, null retry. No SQL state named `FAILED` is added.

- [ ] **Step 7: Implement fresh failure settlement**

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
    if (settlementError === original) throw original;
    if (normalizeSchedulerErrorCode(settlementError) === 'LEASE_LOST') {
      this.transitionLeaseLost(settlementError);
      throw original;
    }
    this.log('error', 'scheduler.error', {code: normalizeSchedulerErrorCode(settlementError)});
    throw original;
  }
};
```

Missing fresh row is not silently quarantined and does not replace the original failure. Fresh time is captured inside the settlement UoW and the final lease fence runs immediately before commit.

---

## Task 4: Admission commands, global barriers, schedule/cancel/reconcile, and CLI

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/cutover.js`
- Modify: `server/scheduler/index.js`
- Create/Modify: `tools/scheduler-cutover.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: parent Task 6 `runCommand(command)` shape `{name,accountId?,run}`, `world.advanceDueNoiBo(mutation,nowS)`, Store/reducer live ABIs.
- Produces: public `runCommand`, `advanceTo`, `schedule`, `cancel`, `reconcile`, `runMaintenanceCutover(context)`, `runCli(argv,dependencies)`.

- [ ] **Step 1: RED tests 33-40**

Install and prove RED for manifest cases 33-40.

- [ ] **Step 2: Implement `runCommand` with exact branches and fences**

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
        var due = null, result, outcome = null, finalized;
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
          return {deferred: false, value: value, outcome: outcome};
        });
        if (result.outcome && result.outcome.accountFinalizer) {
          finalized = self.finalizeCommandAccountInCurrentUow(
            mutation, result.outcome.accountFinalizer, nowMs
          );
          if (finalized.partial) {
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId, metricOutcome: result.outcome};
          }
        }
        if (mutation.commandAccountFinalizer) {
          finalized = self.finalizeCommandAccountInCurrentUow(
            mutation, mutation.commandAccountFinalizer, nowMs
          );
          if (finalized.partial) {
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId,
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

Honest thenable guarantee: the closure count is `1`, then `UNIT_OF_WORK_ASYNC` rolls back all UoW writes. Only account partials guarantee closure count `0`.

- [ ] **Step 3: Implement cutover and CLI exact contract**

`server/scheduler/cutover.js` exports only `runMaintenanceCutover(context)` for Task 6. It receives exactly `{kho,clock,ownerId}`, runs migration before constructing Store, rejects nonempty legacy DB with `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`, initializes only `combat_seed_key_v1`, marks mode durable, writes `CUTOVER`, releases token in `finally`, and returns `{mode:'durable', imported:0, recovered:0}`.

`tools/scheduler-cutover.js` exports and uses:

```js
function runCli(argv, dependencies) {
  dependencies = dependencies || {};
  var parsed = parseArgs(argv);
  var openKho = dependencies.openKho || function (dbPath) { return new Kho(dbPath); };
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

`parseArgs` accepts exactly `--db <file> --action cutover`, rejects missing/duplicate/extra flags, rejects directories before `openKho`, and prints no payload/account/state data.

---

## Task 5: Final verification, scope seal, report, and fresh reviews

**Files:**

- Modify/Create: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`
- No source edits in this task except fixes required by failed verification, which restart Task 5 from the beginning.

**Interfaces:**

- Consumes: six owned implementation/test file hashes and the pre-inventory.
- Produces: final report excluding its own hash, review handoff, and scope proof.

- [ ] **Step 1: Run full scheduler verification**

```bash
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
```

Both commands must report `# tests 205`, `# pass 204`, `# fail 0`, and `# skipped 1`, unless the executor documented a fresh baseline change before editing.

- [ ] **Step 2: Run syntax and untracked-aware whitespace checks**

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

- [ ] **Step 3: Compare normalized allowlist inventory and forbidden hashes**

```bash
task6_inventory > /tmp/task6-post-inventory.tsv
awk -F '\t' '
  $3 ~ /^(server\/app\.js|server\/api\.js|server\/world\.js|server\/index\.js|server\/contract\.js|server\/scheduler\/contract\.js|public\/game\.(html|js|css)|dist\/thienhadaichien\.bin|dist\/thien-ha-dai-chien\.html|dist\/artifact\.html|package(-lock)?\.json|README\.md|js\/.*\.js|web\/js\/mp\.js)$/ {print}
' /tmp/task6-post-inventory.tsv > /tmp/task6-post-forbidden.tsv
diff -u /tmp/task6-pre-forbidden.tsv /tmp/task6-post-forbidden.tsv
python3 - <<'PY'
from pathlib import Path
allowed = {
  'server/scheduler/store.js',
  'server/scheduler/writer.js',
  'server/scheduler/index.js',
  'server/scheduler/cutover.js',
  'tools/scheduler-cutover.js',
  'tools/test-scheduler.js',
  'docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md',
  'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v4.md',
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
bad = sorted(p for p in changed if p not in allowed)
if bad:
  raise SystemExit('non-owned inventory changes:\\n' + '\\n'.join(bad))
PY
```

This procedure allows intentional changes in owned files and exact artifacts while rejecting arbitrary new untracked files, new `js/*.js`, deleted non-owned files, and modifications under forbidden Task 7+ paths.

- [ ] **Step 4: Build the implementation hash seal**

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

The report includes these six hashes, verification outputs, RED proof list, scope inventory result, and reviewer results. The report does not include its own hash. If an external seal is desired, write it outside the report after report content is final; do not create a self-hash cycle.

- [ ] **Step 5: Launch two fresh Sol/high implementation reviews**

Use two new fresh reviewers over the exact six-file seal from `/tmp/task6-six-file-sha256.txt`. Each review request must include:

- the six file paths and hashes,
- this V4 plan path and hash,
- the final verification command outputs,
- the normalized allowlist inventory result,
- the exact report path,
- the instruction that any required code fix invalidates both reviews and requires rerunning tests, recomputing all six hashes, and launching two new fresh Sol/high reviews.

The report must bind both review responses to the same six-file hash set. A review over stale hashes is not acceptance evidence.

## Completion definition

- V1-V3 are preserved.
- The active Task 6 implementation changes only the six owned source/test files and the exact report artifact.
- All 42 new tests were proven RED by exact TAP name and unique sentinel before GREEN.
- `advanceBarrier` preceding-root path produces exactly one total `parkGlobalBehindPreceding` call, owned by AdvanceService.
- Claimed-job execution follows Task 5 lines 825-833 exactly, including application replay validation/effect skipping and established-zero retention.
- Every command/effect/settlement UoW has a final live-lease fence before commit.
- Startup, lease loss, stop, private lifecycle seams, timers, CLI, retry/fatal classification, and raw quarantine behavior match this plan.
- Final scheduler tests report 205 tests, 204 passed, 0 failed, 1 skipped, unless a fresh pre-edit baseline change is documented with arithmetic.
- Scope inventory and forbidden hashes pass.
- The report excludes self-hash and binds two fresh Sol/high approvals to the exact six-file implementation hash seal.
