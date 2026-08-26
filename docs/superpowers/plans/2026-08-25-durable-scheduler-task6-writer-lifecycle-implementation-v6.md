# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V6

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 writer lifecycle, global watermark, retry/backoff, raw quarantine fallback, command MutationGate, cutover CLI, and private lifecycle seams on top of accepted Tasks 1-5.

**Architecture:** Task 6 adds one leased `SchedulerWriter` and public durable scheduler bridge. All durable writes run inside existing immediate SQLite UoWs and `world.trongMutationScheduler(mutation, fn)`, and writer code consumes the accepted Task 5 reducer/store protocol without adding Task 7 routing or mutating `server/world.js`.

**Tech Stack:** Node.js CommonJS, `node:test` TAP, SQLite through the existing `Kho` wrapper, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` Task 6 beginning at line 10866, plus accepted Task 5 remediation protocol lines 825-833 in `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`.

## Direct inspection baseline

This V6 plan was written after direct inspection of live code and parent text:

- Live Node verification: `node --test --test-isolation=none --test-reporter=tap` on Node `v24.19.0` emits exact named TAP lines such as `# Subtest: Task 6 temp named subtest visible`.
- Parent Task 6: `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866`, `:13265`, `:14018`, `:14557`, `:14904`, `:15024`, `:15164`, `:15279`, `:15319`.
- Task 5 downstream order: `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.
- Live world ABI: `server/world.js:207` `trongMutationScheduler(mutation,fn)`, `:219` `_schedulerActive(mutation)`, `:226` `advanceAccountNoiBo(mutation,accountId,targetS,saveOptions)`, `:492` `luu`, `:538` `_dongBoSchedulerLuu`, `:576` `replaceAccountAdvance` is skipped when `currentAccountAdvanceJobId` or `deferAccountWake` is set, `:1684` `kho.q.dqDenHan.all(now,limit)`. There is no live `advanceDueNoiBo`.
- Live DB ABI: `server/db.js:218` `dqDenHan` is `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?`.
- Live reducer ABI: `server/scheduler/reducers.js:232` `initializeCombatSeed(leaseToken,effectiveNowMs)`, `:326` `prepare(mutation,executableJob,options)`, `:345` `applyPrepared(mutation,prepared)`.
- Live advance ABI: `server/scheduler/advance-service.js:421` `advanceTo`, `:442` saves when state changed or blocked external, `:491` `advanceBarrier`, which already calls `store.parkGlobalBehindPreceding(...)` at lines 523-524 and returns `blockedExternal:true, blockedExternalJobId`.
- Live Store ABI: `server/scheduler/store.js:845` `resumeOwnedRunning(token,jobId,nowMs,lockMs)`, `:866` `loadExecutableJob(token,row,nowMs)`, `:949` `hasCommittedApplication(token,executableJob,nowMs)`, `:974` `insertApplication(token,executableJob,application,nowMs,canonicalTContext)`, `:1031` `checkpointPartial(token,job,revision,nowMs)`, `:1050` `markDurableMutation(token,nowMs)`, `:1076` `completeApplied(token,job,nowMs)`, `:1106` `finishResolved(token,job,state,reason,nowMs)`, `:1142` `completeAccountAdvanceAndScheduleSuccessor(token,job,nextLocalAtS,nowMs)`, `:1158` `fail(token,job,failure,nowMs,policy)`, `:1198` `recoverExpiredRunning(token,nowMs,policy)`, `:1464` `blockOwnedAccountAdvance(token,job,checkpointRevision,blockedByJobId,nowMs)`, `:1527` `parkGlobalBehindPreceding(token,runningJob,precedingJobId,targetS,nowMs)`, `:1562` `assertAccountDependencyIntegrity(token,nowMs)`.
- Live Task 5 partial tests: `tools/test-scheduler.js:9336-9340` checks `Reflect.ownKeys(effect).join(',') === 'checkpointRevision,saveReceipt'` and strict receipt identity; `:10565-10567` checks `prepared.saveReceipt === prepared.advanceResult.saveReceipt === effect.saveReceipt`.

## Global Constraints

- Preserve V1-V5. During this planning task, create only this V6 plan file.
- Task 6 implementation may modify exactly six implementation/test files: `server/scheduler/store.js`, `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`.
- Exact implementation report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task 7+ scope: do not modify `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, `js/*.js`, or `web/js/mp.js`.
- Do not add `TheGioi.prototype.advanceDueNoiBo`; live world does not have it and `server/world.js` is forbidden. Task 6 owns `SchedulerWriter.prototype.advanceDueInCurrentUow`.
- Existing accepted scheduler suite baseline is 163 tests. V6 adds exactly 42 tests total, including the manifest validator folded into case 41, so final expected scheduler output is 205 tests, 204 passed, 0 failed, 1 known environment skip. If a fresh pre-edit run proves the baseline changed, report command output and recompute arithmetic explicitly.
- Public bridge enumerable keys remain exactly `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`. Task 7 lifecycle bridge helpers are private non-enumerable properties only.
- The active V6 plan hash is not embedded in this plan. After this file is frozen, implementation preflight must run `sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v6.md > /tmp/task6-active-plan.sha256`, pass that external hash to implementers and reviewers, and finish with `sha256sum -c /tmp/task6-active-plan.sha256`.
- After the plan hash is captured, the V6 plan is not mutable and is not part of the mutable allowlist. Inventory may contain it as an expected fixed artifact, but its hash must remain fixed.

## Correction ledger from blocked V5

1. RED proof command is now exactly `node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js`.
2. `ACCOUNT_ADVANCE` `prepared.terminalState === 'CANCELLED'` is finalized with `finishResolved` and returns `afterCancel` before any deferred success finalizer. Only completed account prepared results may be deferred.
3. Direct account command path does not pass `deferAccountWake:true`. It uses normal save options so live `World._dongBoSchedulerLuu` can call `replaceAccountAdvance` and preserve successors.
4. Direct partial/deferred/established-zero logic adopts the wake that World actually synchronized; if no wake exists for an established-zero budget partial, writer creates the exact fallback with `replaceAccountAdvance` before adoption.
5. `advance-due` detects the 61-account boundary by querying `limit + 1`; `hasMoreDue` yields command partial and skips closure.
6. Partial effect validation enforces plain object prototype, exactly two own keys, exact key order, no symbols, no non-enumerable extras, and strict receipt identity.
7. Deferred completed accounts record `prepared.advanceResult` exactly once before finalizer.
8. Startup recovery conditionally marks durable before `recoverExpiredRunning` when a preview query proves expired rows will be mutated, stages resumed rows inside the transaction, publishes queues only after commit, and fences immediately before commit.
9. Test manifest is revised but remains exactly 42 tests, including regressions for direct completed successor, direct established-zero continuation, direct partial/deferred, adopted cancellation, deferred metrics, and 61-account boundary.
10. Scope inventory includes type, symlink target/hash, filesystem mode, tracked mode from `git ls-files --stage`, and detects mode-only and symlink changes. The temp inventory helper script is hashed and sourced in every inventory block.
11. Prior improvements remain: exact Task 5 downstream protocol, already-parked global barrier, fatal settlement transition, raw quarantine, Task 7 private seams, exact CLI, external plan hash, report/review seal.

---

## Task 1: Preflight, active plan seal, RED harness, and inventory helper

**Files:**

- Modify: `tools/test-scheduler.js`
- Create at implementation time: `/tmp/task6-active-plan.sha256`, `/tmp/task6-inventory-functions.sh`, `/tmp/task6-inventory-functions.sha256`, `/tmp/task6-pre-inventory.tsv`, `/tmp/task6-pre-forbidden.tsv`

**Interfaces:**

- Consumes: live Node TAP command `node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js`.
- Produces: 42-case RED manifest and full inventory helper.

- [ ] **Step 1: Pin active V6 plan externally**

Run before any source/test edit:

```bash
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v6.md \
  > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

- [ ] **Step 2: Create and hash the inventory helper**

Create a temp helper. It is outside the repo and is intentionally sourced by later verification blocks.

```bash
cat > /tmp/task6-inventory-functions.sh <<'SH'
task6_inventory() {
  python3 - "$PWD" <<'PY'
import hashlib, os, stat, subprocess, sys
from pathlib import Path
root = Path(sys.argv[1])
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=root)
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, path = record.split(b'\t', 1)
    mode = meta.split()[0].decode()
    tracked[path.decode()] = mode
rows = []
for dirpath, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
    dirnames[:] = [d for d in dirnames if d != '.git']
    for name in filenames:
        path = Path(dirpath) / name
        rel = path.relative_to(root).as_posix()
        st = os.lstat(path)
        fs_mode = oct(stat.S_IMODE(st.st_mode))
        tracked_mode = tracked.get(rel, '-')
        if stat.S_ISLNK(st.st_mode):
            typ = 'symlink'
            target = os.readlink(path)
            payload = target.encode()
            size = len(payload)
            content_sha = '-'
            target_sha = hashlib.sha256(payload).hexdigest()
        elif stat.S_ISREG(st.st_mode):
            typ = 'file'
            payload = path.read_bytes()
            size = len(payload)
            content_sha = hashlib.sha256(payload).hexdigest()
            target = '-'
            target_sha = '-'
        else:
            typ = 'other'
            size = int(st.st_size)
            content_sha = '-'
            target = '-'
            target_sha = '-'
        rows.append((rel, typ, tracked_mode, fs_mode, str(size),
            content_sha, target_sha, target))
for row in sorted(rows):
    print('\t'.join(row))
PY
}
task6_forbidden_inventory() {
  awk -F '\t' '
    $1 ~ /^(server\/app\.js|server\/api\.js|server\/world\.js|server\/index\.js|server\/contract\.js|server\/scheduler\/contract\.js|public\/game\.(html|js|css)|dist\/thienhadaichien\.bin|dist\/thien-ha-dai-chien\.html|dist\/artifact\.html|package(-lock)?\.json|README\.md|js\/.*\.js|web\/js\/mp\.js)$/ {print}
  '
}
SH
chmod 700 /tmp/task6-inventory-functions.sh
sha256sum /tmp/task6-inventory-functions.sh > /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
task6_inventory > /tmp/task6-pre-inventory.tsv
task6_forbidden_inventory < /tmp/task6-pre-inventory.tsv > /tmp/task6-pre-forbidden.tsv
```

The output columns are: `path`, `type`, `tracked_mode`, `fs_mode`, `size`, `content_sha256`, `symlink_target_sha256`, `symlink_target`. This catches content, mode-only, symlink target, untracked symlink, and type changes.

- [ ] **Step 3: Install the exact 42-case manifest**

Add this manifest. Case 41 is the manifest/scope validator, not an extra test.

```js
var TASK6_RED_CASES = Object.freeze([
  ['Task 6 v6 writer rejects legacy mode before lease', 'TASK6V6_RED_001_LEGACY'],
  ['Task 6 v6 startup acquisition rollback arms no poll while stopping', 'TASK6V6_RED_002_STARTUP_ROLLBACK'],
  ['Task 6 v6 startup committed lease release preserves original failure', 'TASK6V6_RED_003_STARTUP_RELEASE'],
  ['Task 6 v6 startup recovery marks expired rows asserts integrity stages resume and fences', 'TASK6V6_RED_004_STARTUP_RECOVERY'],
  ['Task 6 v6 heartbeat transient rearms and generation loss keeps one poll', 'TASK6V6_RED_005_HEARTBEAT'],
  ['Task 6 v6 lease loss during stop finalization is idempotent', 'TASK6V6_RED_006_LEASE_STOP'],
  ['Task 6 v6 shutdown admission fence drains captured tail with bounded grace', 'TASK6V6_RED_007_SHUTDOWN'],
  ['Task 6 v6 private lifecycle seams are non enumerable and db close cache only', 'TASK6V6_RED_008_PRIVATE'],
  ['Task 6 v6 runMaintenanceCutover fresh only lease audit and release', 'TASK6V6_RED_009_CUTOVER'],
  ['Task 6 v6 scheduler cutover CLI exports exact surface and closes kho', 'TASK6V6_RED_010_CLI'],
  ['Task 6 v6 claim brands raw row before target default', 'TASK6V6_RED_011_BRAND'],
  ['Task 6 v6 before claim crash leaves no running row', 'TASK6V6_RED_012_BEFORE_CLAIM'],
  ['Task 6 v6 after claim crash recovers expired running without effect', 'TASK6V6_RED_013_AFTER_CLAIM'],
  ['Task 6 v6 after application crash restarts without duplicate effect', 'TASK6V6_RED_014_AFTER_APP'],
  ['Task 6 v6 after effect crash rolls back application and world state', 'TASK6V6_RED_015_AFTER_EFFECT'],
  ['Task 6 v6 before final fence generation flip rolls back effect UoW', 'TASK6V6_RED_016_FINAL_FENCE'],
  ['Task 6 v6 already applied restart skips effect and terminalizes once', 'TASK6V6_RED_017_REPLAY'],
  ['Task 6 v6 stale generation effect fails before commit', 'TASK6V6_RED_018_STALE_GENERATION'],
  ['Task 6 v6 global barrier already parked branch does not double park', 'TASK6V6_RED_019_BARRIER_PARK'],
  ['Task 6 v6 global barrier budget partial queues continuation after commit', 'TASK6V6_RED_020_BARRIER_PARTIAL'],
  ['Task 6 v6 account partial effect shape and identity are exact', 'TASK6V6_RED_021_PARTIAL_SHAPE'],
  ['Task 6 v6 account partial blocked external uses advanceResult dependency', 'TASK6V6_RED_022_PARTIAL_BLOCK'],
  ['Task 6 v6 established zero partial retains running lock unchanged', 'TASK6V6_RED_023_ESTABLISHED_ZERO'],
  ['Task 6 v6 prepared global charges primitive once before idempotency insert', 'TASK6V6_RED_024_GLOBAL_CHARGE'],
  ['Task 6 v6 prepared replay validates application and skips second effect', 'TASK6V6_RED_025_REPLAY_CHARGE'],
  ['Task 6 v6 terminal mapping uses only accepted Store methods', 'TASK6V6_RED_026_TERMINAL'],
  ['Task 6 v6 account cancelled terminal is not deferred and returns afterCancel', 'TASK6V6_RED_027_ACCOUNT_CANCEL'],
  ['Task 6 v6 deferred completed account records advance once before finalizer', 'TASK6V6_RED_028_DEFER_METRIC'],
  ['Task 6 v6 settlement reloads executable then Store fail', 'TASK6V6_RED_029_SETTLE_FAIL'],
  ['Task 6 v6 settlement raw corruption quarantines without payload parse', 'TASK6V6_RED_030_RAW_QUARANTINE'],
  ['Task 6 v6 settlement missing fresh row preserves original failure', 'TASK6V6_RED_031_MISSING_ROW'],
  ['Task 6 v6 settlement fatal storage transitions while rethrowing original', 'TASK6V6_RED_032_SETTLE_FATAL'],
  ['Task 6 v6 runCommand barrier partial returns TICK_PARTIAL', 'TASK6V6_RED_033_CMD_BARRIER'],
  ['Task 6 v6 runCommand account partial skips closure and queues continuation', 'TASK6V6_RED_034_CMD_PARTIAL'],
  ['Task 6 v6 runCommand thenable rolls back after invocation only', 'TASK6V6_RED_035_CMD_THENABLE'],
  ['Task 6 v6 account delete skips advance and adopted success returns closure', 'TASK6V6_RED_036_CMD_DELETE_ADOPT'],
  ['Task 6 v6 advance due 61 account boundary skips closure and queues continuation', 'TASK6V6_RED_037_CMD_DUE_61'],
  ['Task 6 v6 direct completed account preserves World synchronized successor', 'TASK6V6_RED_038_DIRECT_COMPLETE'],
  ['Task 6 v6 direct established zero creates exact fallback continuation', 'TASK6V6_RED_039_DIRECT_ZERO'],
  ['Task 6 v6 direct partial and deferred adopt synchronized wake exactly once', 'TASK6V6_RED_040_DIRECT_PARTIAL'],
  ['Task 6 v6 RED manifest and normalized scope catch mode symlink and extra files', 'TASK6V6_RED_041_SCOPE_MANIFEST'],
  ['Task 6 v6 implementation seal excludes report and active plan is fixed', 'TASK6V6_RED_042_SEAL']
]);
```

Task assignments are exact: 1-8 lifecycle/private seams, 9-10 cutover/CLI, 11-32 claim/downstream/settlement, 33-40 command/direct-account behavior, 41-42 scope/seal.

- [ ] **Step 4: Use the exact TAP RED helper for every case**

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
  node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js >"$out" 2>&1
  code=$?
  escaped=$(task6_regex_escape "$test_name")
  registration=$(grep -E "^# Subtest: $escaped$" "$out")
  not_ok=$(grep -E "^not ok [0-9]+ - $escaped$" "$out")
  sentinel_hit=$(grep -F "$sentinel" "$out")
  if [ -n "$old_trap" ]; then eval "$old_trap"; else trap - EXIT; fi
  if [ "$had_errexit" = 1 ]; then set -e; else set +e; fi
  ok=1
  if [ "$code" -eq 0 ] || [ -z "$registration" ] || [ -z "$not_ok" ] || [ -z "$sentinel_hit" ]; then
    ok=0
  fi
  rm -f "$out"
  if [ "$ok" -ne 1 ]; then
    printf 'RED proof failed for %s\n' "$test_name" >&2
    return 1
  fi
}
```

Every new test lazy-requires new Task 6 modules inside the test or fixture. Loader failure that prevents named TAP registration is a RED proof failure.

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

Install and prove RED for cases 1-8 before implementation.

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

Only `flushCommittedMetricLedger(ledger)` emits `scheduler.tick`, and only after the owner UoW commits.

- [ ] **Step 3: Implement startup recovery sequence with staged publication**

Startup order:

1. Reject `scheduler_mode='legacy'` before lease acquisition.
2. Acquire lease in one immediate UoW.
3. Open one recovery immediate UoW with the committed token.
4. Record monotonic effective time.
5. Call `reducer.initializeCombatSeed(token,effectiveNowMs)`.
6. Preview expired RUNNING rows. If the preview count is greater than zero, call `markDurableMutationInCurrentUow(mutation,effectiveNowMs)` before `recoverExpiredRunning`.
7. Call `store.recoverExpiredRunning(token,effectiveNowMs,retryPolicy)`.
8. Call `store.assertAccountDependencyIntegrity(token,effectiveNowMs)`.
9. Enumerate owned RUNNING ids and call `resumeOwnedRunning` for each id.
10. Return a staged object from the UoW; do not enqueue or arm timers inside it.
11. Call `refreshLeasePhaseInCurrentUow('before-recovery-commit',token,effectiveNowMs)` immediately before commit.
12. After commit, publish staged resumed rows to the partial queue exactly once, then set ready and arm heartbeat/wake/reconcile once.

Pseudocode:

```js
SchedulerWriter.prototype.previewExpiredRunningCount = function (token, nowMs) {
  this.store.assertLiveLease(token, nowMs);
  return Number(this.store.db.prepare(
    "SELECT COUNT(*) AS n FROM event_jobs WHERE state='RUNNING' AND " +
    "(locked_generation<? OR (locked_generation=? AND locked_by=? AND locked_until_ms<=?))"
  ).get(token.generation, token.generation, token.ownerId, nowMs).n || 0);
};
SchedulerWriter.prototype.ownedRunningIdsForResume = function (token, nowMs) {
  this.store.assertLiveLease(token, nowMs);
  return this.store.db.prepare(
    "SELECT id FROM event_jobs WHERE state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? AND blocked_by_job_id IS NULL " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
  ).all(token.ownerId, token.generation, nowMs).map(function (row) { return row.id; });
};
SchedulerWriter.prototype.recoverStartupInCurrentUow = function (token, nowMs) {
  nowMs = this.recordEffectiveNowInCurrentUow(token, nowMs);
  var mutation = this.newMutationContext(token, {value: 50_000}, nowMs);
  var expired = this.previewExpiredRunningCount(token, nowMs);
  this.reducer.initializeCombatSeed(token, nowMs);
  if (expired > 0) this.markDurableMutationInCurrentUow(mutation, nowMs);
  var recovered = this.store.recoverExpiredRunning(token, nowMs, this.retryPolicy());
  this.store.assertAccountDependencyIntegrity(token, nowMs);
  var resumedRows = [];
  this.ownedRunningIdsForResume(token, nowMs).forEach(function (id) {
    var row = this.store.resumeOwnedRunning(token, id, nowMs, this.leaseMs);
    if (row) resumedRows.push(row);
  }, this);
  this.refreshLeasePhaseInCurrentUow('before-recovery-commit', token, nowMs);
  return {recovered: recovered, resumedRows: resumedRows,
    metricLedger: mutation.metricLedger};
};
```

- [ ] **Step 4: Implement startup failure unwind, lease loss, timers, and private seams**

Retain V5 semantics:

- acquisition rollback uses `committedToken=null`;
- committed release is best-effort and logs sanitized release errors while throwing original startup error;
- fatal startup errors call `transitionStorageFatal(original)`;
- lease loss during stop/finalization clears mutation timers and does not arm another poll;
- ordinary lease loss leaves at most one standby acquisition poll;
- `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` are non-enumerable, non-writable, non-configurable;
- `_datDatabaseClosing` sets `reason='SCHEDULER_DB_CLOSED'`, clears all timers, and makes later status cache-only.

---

## Task 3: Claimed-job lifecycle, exact Task 5 protocol, retry, and quarantine

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: accepted Task 5 protocol and live Store/Reducer/AdvanceService ABIs listed above.
- Produces: claimed-job apply path, strict account partial validation, account finalizer protocol, raw quarantine primitive, failure settlement.

- [ ] **Step 1: RED cases 11-32**

Install and prove RED for cases 11-32.

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

`before-final-fence` is before the final lease refresh; generation-flip tests mutate the lease before this refresh and must roll back the effect UoW.

- [ ] **Step 3: Implement claimed execution with correct account terminal deferral**

```js
SchedulerWriter.prototype.executeClaimedInCurrentUow = function (
  mutation, claimedRow, nowMs, options
) {
  var token = mutation.leaseToken, startedAtMs = nowMs;
  var executable, barrier, prepared, application, effect, alreadyCommitted = false;
  var self = this;
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
    if (executable.kind !== 'ACCOUNT_ADVANCE') {
      throw schedulerError('GLOBAL_PARTIAL_PREPARE_INVALID');
    }
    if (typeof mutation.recordAdvance === 'function') {
      mutation.recordAdvance(prepared.advanceResult);
    }
    if (options.deferAccountFinalize === true) {
      return finish({partial: true,
        budgetExhausted: Boolean(prepared.advanceResult &&
          prepared.advanceResult.budgetExhausted),
        deferredExternal: Boolean(prepared.advanceResult &&
          prepared.advanceResult.blockedExternalJobId),
        jobId: executable.id,
        accountFinalizer: {directMode: false, job: executable,
          prepared: prepared, effect: effect, partial: true, finalized: false},
        advanceResult: prepared.advanceResult || null}, 'partial', null);
    }
    return finish(this.finalizePreparedAccountPartialInCurrentUow(
      mutation, executable, prepared, effect, nowMs
    ), 'partial', null);
  }
  if (prepared.kind !== 'prepared') throw schedulerError('PREPARED_KIND_INVALID');

  application = this.store.insertApplication(
    token, executable, prepared.application, nowMs, prepared.canonicalTContext || null
  );
  this.callFaultHook('after-application', executable);
  this.assertApplicationReplayDecision(executable, application);
  effect = application.alreadyApplied ? null : this.reducer.applyPrepared(mutation, prepared);
  if (!application.alreadyApplied) this.callFaultHook('after-effect', executable);

  if (prepared.terminalState === 'CANCELLED') {
    return finish(this.finishPreparedInCurrentUow(
      mutation, executable, prepared, application, effect, nowMs
    ), 'success', prepared.advanceResult || null);
  }
  if (prepared.terminalState !== 'COMPLETED') {
    throw schedulerError('JOB_TERMINAL_STATE_INVALID');
  }
  if (executable.kind === 'ACCOUNT_ADVANCE' && options.deferAccountFinalize === true) {
    if (prepared.advanceResult && typeof mutation.recordAdvance === 'function') {
      mutation.recordAdvance(prepared.advanceResult);
    }
    return finish({partial: false, budgetExhausted: false, jobId: executable.id,
      accountFinalizer: {directMode: false, job: executable, prepared: prepared,
        effect: effect, partial: false, finalized: false},
      advanceResult: prepared.advanceResult || null}, 'success', null);
  }
  return finish(this.finishPreparedInCurrentUow(
    mutation, executable, prepared, application, effect, nowMs
  ), 'success', isGlobalJob(executable) ? {
    processed: Number(barrier.processed) + (alreadyCommitted ? 0 : 1),
    advancedToS: Number(barrier.advancedToS),
    nextDueAtS: null,
    hasMoreDue: false,
    budgetExhausted: false
  } : prepared.advanceResult || null);
};
```

The adopted-cancellation regression is case 27: an adopted `ACCOUNT_ADVANCE` whose prepared terminal is `CANCELLED` must call `finishResolved`, return `afterCancel:true`, and must not return an `accountFinalizer`.

`assertApplicationReplayDecision(executable,application)` is a writer assertion over the live `insertApplication` result:

```js
SchedulerWriter.prototype.assertApplicationReplayDecision = function (executable, application) {
  if (!application || Object.getPrototypeOf(application) !== Object.prototype ||
      typeof application.alreadyApplied !== 'boolean' ||
      !application.row || application.row.idempotency_key !== executable.idempotency_key ||
      application.row.job_id !== executable.id) {
    throw schedulerError('APPLICATION_REPLAY_RESULT_INVALID');
  }
};
```

The real replay validation remains owned by `store.insertApplication`: it reloads/branded-validates the running job, validates candidate and stored application rows, and returns `alreadyApplied:true` only after the existing row validates. Writer must never reapply reducer effects when `alreadyApplied:true`.

- [ ] **Step 4: Strictly validate account partial effect**

```js
SchedulerWriter.prototype.assertAccountPartialEffect = function (prepared, effect, mutation) {
  if (!effect || Object.getPrototypeOf(effect) !== Object.prototype) {
    throw schedulerError('ACCOUNT_PARTIAL_EFFECT_INVALID');
  }
  var own = Reflect.ownKeys(effect);
  if (own.length !== 2 || own[0] !== 'checkpointRevision' ||
      own[1] !== 'saveReceipt' ||
      Object.keys(effect).join(',') !== 'checkpointRevision,saveReceipt' ||
      !Object.prototype.propertyIsEnumerable.call(effect, 'checkpointRevision') ||
      !Object.prototype.propertyIsEnumerable.call(effect, 'saveReceipt')) {
    throw schedulerError('ACCOUNT_PARTIAL_EFFECT_INVALID');
  }
  if (effect.saveReceipt !== null) {
    if (effect.saveReceipt !== prepared.saveReceipt ||
        prepared.saveReceipt !== prepared.advanceResult.saveReceipt ||
        effect.checkpointRevision !== effect.saveReceipt.revision) {
      throw schedulerError('ACCOUNT_PARTIAL_RECEIPT_MISMATCH');
    }
    return effect.saveReceipt;
  }
  if (effect.checkpointRevision !== null ||
      !prepared.advanceResult ||
      prepared.saveReceipt !== null ||
      prepared.advanceResult.saveReceipt !== null ||
      prepared.advanceResult.processed !== 0 ||
      prepared.advanceResult.budgetExhausted !== true ||
      prepared.advanceResult.hasMoreDue !== true ||
      mutation.remainingBudget.value !== 0) {
    throw schedulerError('ACCOUNT_ESTABLISHED_ZERO_INVALID');
  }
  return null;
};
```

Case 21 injects effect variants with a null prototype, symbol key, non-enumerable key, reversed key order, cloned receipt, and missing identity. Each must fail for the intended reason.

- [ ] **Step 5: Implement partial/prepared finalization**

```js
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

- [ ] **Step 6: Implement account finalizer exactly once**

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

Drain never sets `deferAccountFinalize:true`, so it finalizes immediately. Command paths finalize before their command UoW commits.

- [ ] **Step 7: Implement failure settlement and raw quarantine**

Implement settlement as a fresh immediate UoW. Do not settle inside the reducer/effect UoW that just failed.

```js
SchedulerWriter.prototype.settleClaimFailure = function (rawRow, originalError) {
  var self = this;
  try {
    return this.store.kho.trongGiaoDich(function () {
      var token = self.requireReadyLease(self.effectiveNowMs());
      var nowMs = self.recordEffectiveNowInCurrentUow(token, self.effectiveNowMs());
      var fresh = self.store.getById(rawRow && rawRow.id);
      if (!fresh) throw originalError;
      try {
        var executable = self.store.loadExecutableJob(token, fresh, nowMs);
        var state = self.store.fail(token, executable, originalError, nowMs, self.retryPolicy());
        self.refreshLeasePhaseInCurrentUow('before-failure-settlement-commit', token, nowMs);
        return {state: state, quarantinedRaw: false};
      } catch (integrityError) {
        if (!isPayloadIntegrityFailure(integrityError)) throw integrityError;
        self.store.quarantineClaimedRaw(token, fresh, originalError, nowMs);
        self.refreshLeasePhaseInCurrentUow('before-raw-quarantine-commit', token, nowMs);
        return {state: 'QUARANTINED', quarantinedRaw: true};
      }
    }, {immediate: true});
  } catch (settlementError) {
    if (isFatalStorageError(settlementError)) self.transitionStorageFatal(settlementError);
    if (isLeaseLost(settlementError)) self.transitionLeaseLost(settlementError);
    throw originalError;
  }
};
```

If the fresh row is missing, preserve the original reducer/apply error and do not invent a terminal row. If settlement itself throws fatal storage, call `transitionStorageFatal(settlementError)` and rethrow the original reducer/apply failure unchanged. If settlement itself loses lease, call `transitionLeaseLost(settlementError)` and rethrow the original failure unchanged.

Add Store primitive `quarantineClaimedRaw(token,rawRow,failure,nowMs)` with no payload parse:

```js
SchedulerStore.prototype.quarantineClaimedRaw = function (token, rawRow, failure, nowMs) {
  this.assertLiveLease(token, nowMs);
  assertSchedulerJobId(rawRow && rawRow.id);
  if (!Number.isSafeInteger(Number(rawRow.locked_generation)) ||
      String(rawRow.locked_by) !== token.ownerId ||
      Number(rawRow.locked_generation) !== Number(token.generation)) {
    fail('LEASE_LOST');
  }
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='QUARANTINED',retry_at_ms=NULL," +
    "error_code=?,error_message_safe=?,quarantined_at_ms=?,updated_at_ms=?," +
    "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL " +
    "WHERE id=? AND state='RUNNING' AND locked_by=? AND locked_generation=? " +
    "AND locked_until_ms>? AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(safeErrorMessage(normalizeSchedulerErrorCode(failure)),
    safeErrorMessage(failure && failure.message),
    nowMs, nowMs, rawRow.id, token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'RAW_QUARANTINE_CONFLICT');
  return this.getById(rawRow.id);
};
```

The SQL does not touch `attempt`, `payload_json`, `payload_sha256`, `max_attempts`, or replay fields. It uses only safe raw identity/lease columns and sanitized failure fields; unsafe raw payload and aggregate fields must not influence control flow.

---

## Task 4: Command MutationGate, direct account path, advance-due, public surfaces, and CLI

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/index.js`
- Modify: `server/scheduler/cutover.js`
- Create/Modify: `tools/scheduler-cutover.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: live `world._schedulerActive`, `world.advanceAccountNoiBo`, `kho.q.dqDenHan`, parent `runCommand({name,accountId?,run})`.
- Produces: command admission, direct account outcomes, `advanceDueInCurrentUow`, exact CLI module surface.

- [ ] **Step 1: RED cases 9-10 and 33-40**

Install/prove RED for cutover/CLI cases 9-10 and command/direct cases 33-40. Cases 9-10 are implemented in this task, not Task 3.

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

Do not inspect or create `_mutationContexts`.

- [ ] **Step 3: Implement direct account path with normal save options**

The direct path calls live World with normal save options so `_dongBoSchedulerLuu` can call `replaceAccountAdvance`.

```js
SchedulerWriter.prototype.directAccountOutcomeInCurrentUow = function (
  mutation, accountId, targetS, nowMs, options
) {
  options = options || {};
  var result = this.world.advanceAccountNoiBo(mutation, accountId, targetS, {});
  if (typeof mutation.recordAdvance === 'function') mutation.recordAdvance(result);
  if (result.budgetExhausted || result.deferredExternal === true) {
    var finalizer = {
      directMode: true,
      directReceipt: result.saveReceipt || null,
      accountId: accountId,
      targetS: Number.isSafeInteger(result.nextDueAtS) ? result.nextDueAtS : targetS,
      advanceResult: result,
      deferredExternal: result.deferredExternal === true,
      blockedExternalJobId: result.blockedExternalJobId || null,
      finalized: false
    };
    if (options.deferAccountFinalize === true) {
      return {partial: true, budgetExhausted: result.budgetExhausted === true,
        deferredExternal: result.deferredExternal === true, jobId: null,
        accountFinalizer: finalizer, advanceResult: result};
    }
    return this.finalizeDirectAccountInCurrentUow(mutation, finalizer, nowMs);
  }
  return {partial: false, budgetExhausted: false, jobId: null, advanceResult: result};
};
```

Completed direct account work relies on World's normal synchronized successor. Case 38 proves a direct completed command with a future local wake leaves the expected `ACCOUNT_ADVANCE` successor and returns the closure.

- [ ] **Step 4: Finalize direct partial/deferred/established-zero**

```js
SchedulerWriter.prototype.ensureDirectContinuationInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, finalizer.accountId, finalizer.targetS, nowMs, this.leaseMs
  );
  if (adopted) return adopted;
  if (finalizer.directReceipt === null &&
      finalizer.advanceResult &&
      finalizer.advanceResult.budgetExhausted === true &&
      Number.isSafeInteger(finalizer.advanceResult.nextDueAtS)) {
    var loaded = this.world.nap(Number(finalizer.accountId));
    if (!loaded || !loaded.row || !Number.isSafeInteger(Number(loaded.row.revision))) {
      throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
    }
    this.store.replaceAccountAdvance(
      mutation.leaseToken,
      Number(finalizer.accountId),
      Number(loaded.row.revision),
      Number(finalizer.advanceResult.nextDueAtS),
      nowMs
    );
    adopted = this.store.adoptAccountAdvanceForCommand(
      mutation.leaseToken, finalizer.accountId,
      Number(finalizer.advanceResult.nextDueAtS), nowMs, this.leaseMs
    );
    if (adopted) return adopted;
  }
  throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
};

SchedulerWriter.prototype.finalizeDirectAccountInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  var adopted = this.ensureDirectContinuationInCurrentUow(mutation, finalizer, nowMs);
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

Cases 39 and 40 prove established-zero fallback and direct partial/deferred adoption. No direct partial may commit with a missing continuation.

- [ ] **Step 5: Implement adopted account helper**

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
  return Object.assign({}, this.directAccountOutcomeInCurrentUow(
    mutation, accountId, targetS, nowMs,
    {deferAccountFinalize: options.deferAccountFinalize === true}
  ), {afterCancel: true});
};
```

Case 36 covers adopted success returning the command closure and account-delete skipping automatic advance. Case 27 covers adopted cancellation not deferred.

- [ ] **Step 6: Implement writer-owned `advanceDueInCurrentUow` with exact boundary**

```js
SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, targetS, nowMs) {
  this.world._schedulerActive(mutation);
  var rows = this.store.kho.q.dqDenHan.all(targetS, 61);
  var dueRows = rows.slice(0, 60);
  var summary = {processed: 0, advancedToS: targetS, nextDueAtS: null,
    hasMoreDue: rows.length > 60, budgetExhausted: false, saveReceipt: null,
    deferredExternal: false, blockedExternalJobId: null};
  for (var i = 0; i < dueRows.length; i++) {
    var accountId = Number(dueRows[i].tk);
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
  return summary;
};
```

Case 37 creates 61 due accounts in deterministic `keTiep,tk` order. `runCommand({name:'advance-due',run})` must return `{deferred:true,code:'TICK_PARTIAL'}`, skip closure, and enqueue continuation.

- [ ] **Step 7: Implement `runCommand` with final fences and continuations**

Retain V5 `runCommand` flow with these V6 corrections:

- every command UoW calls `markDurableMutationInCurrentUow` before command writes;
- account-delete calls closure immediately after marker and does not auto-advance;
- advance-due calls writer-owned `advanceDueInCurrentUow`, not a World method;
- if any command partial has `partialJobId`, enqueue it only after commit;
- if command response is deferred with null job id, call `enqueueBudgetContinuationIfDue` only after commit;
- `callFaultHook('before-final-fence', null)` runs before `refreshLeasePhaseInCurrentUow('before-command-commit', token, nowMs)`;
- `flushCommittedMetricLedger(committed.metricLedger)` runs only after commit;
- thenable closure count is exactly one and the UoW rolls back; account partial closure count is zero.

- [ ] **Step 8: Implement cutover and CLI**

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
- No source/test edits except if verification fails; any six-file fix restarts this task from Step 1.

**Interfaces:**

- Consumes: six implementation/test hashes, final report, active plan hash, inventory helper hash, two fresh Sol/high reviews.
- Produces: handoff evidence without report self-hash or stale review seals.

- [ ] **Step 1: Run full scheduler verification**

```bash
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
```

Expected after exactly 42 added tests: `# tests 205`, `# pass 204`, `# fail 0`, `# skipped 1`.

- [ ] **Step 2: Syntax and whitespace checks**

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

- [ ] **Step 3: Six-file implementation seal**

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

The report includes these six hashes, verification command outputs, RED proof summary, inventory helper hash, scope checks, and the fact that review binding is to the six-file seal plus external V6 plan hash only. The report does not include its own hash.

- [ ] **Step 4: Normalized inventory checks**

Every inventory block must source and verify the helper:

```bash
sha256sum -c /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
task6_inventory > /tmp/task6-post-inventory.tsv
task6_forbidden_inventory < /tmp/task6-post-inventory.tsv > /tmp/task6-post-forbidden.tsv
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
  'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v6.md',
}
def load(path):
  rows = {}
  for line in Path(path).read_text().splitlines():
    rel, typ, tracked_mode, fs_mode, size, sha, target_sha, target = line.split('\t', 7)
    rows[rel] = (typ, tracked_mode, fs_mode, size, sha, target_sha, target)
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

This detects content, file type, symlink target, filesystem mode, tracked mode, untracked symlink, deletion, and arbitrary untracked non-owned additions.

- [ ] **Step 5: Launch two fresh Sol/high reviews over exact seals**

Send reviewers:

- V6 plan path and external hash from `/tmp/task6-active-plan.sha256`,
- inventory helper hash from `/tmp/task6-inventory-functions.sha256`,
- six implementation/test paths and hashes from `/tmp/task6-six-file-sha256.txt`,
- verification outputs,
- normalized inventory/forbidden diff result,
- exact report path.

Any change to the six sealed files or V6 plan invalidates both approvals and requires rerunning verification, recomputing six hashes, and launching two new fresh Sol/high reviews.

- [ ] **Step 6: Finalize report and rerun final checks**

Approvals may be recorded in the report after review because review binding is to the six implementation/test hashes, inventory helper hash, and external V6 plan hash. If report text changes after approval, rerun:

```bash
sha256sum -c /tmp/task6-six-file-sha256.txt
sha256sum -c /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
task6_inventory > /tmp/task6-final-inventory.tsv
rg -n '[[:blank:]]+$' docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

Repeat the normalized inventory comparison with `/tmp/task6-final-inventory.tsv`. If any six-file hash, plan hash, or inventory helper hash differs, discard reviews and restart Task 5.

## Completion definition

- V1-V5 plans are preserved.
- V6 active plan hash is pinned externally and remains fixed through final handoff.
- Exactly 42 new tests are added and proven RED by exact TAP subtest name and sentinel using `--test-isolation=none`; final suite arithmetic is 205 total tests.
- Claimed-job execution follows Task 5 lines 825-833 exactly.
- Partial account effects enforce strict plain-object/key/identity contract.
- `ACCOUNT_ADVANCE` cancellation is terminalized before any deferred success finalizer.
- Direct account commands use normal World save options, preserve direct completed successor, handle established-zero fallback, and never commit a missing continuation.
- `advance-due` is Task 6 writer-owned, uses `dqDenHan` limit+1 plus `world.advanceAccountNoiBo`, and treats the 61-account boundary as command partial.
- `advanceBarrier` preceding-root path causes exactly one Store park call, owned by AdvanceService.
- Every command/effect/settlement/recovery UoW performs a final live-lease fence immediately before commit.
- Startup recovery conditionally marks durable for recovered rows, asserts dependency integrity, stages resumed rows until commit, and publishes queues after commit.
- Raw quarantine does not parse payload and does not change attempt.
- CLI exports exactly `parseArgs`, `runCli`, and `main`, with the stated `require.main` call.
- Scope checks prove no non-owned tracked, untracked, mode-only, type, or symlink change.
- Report has no self-hash. Two fresh Sol/high approvals bind to the exact six implementation/test hashes, external V6 plan hash, and inventory helper hash.
