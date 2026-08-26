# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V7

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 writer lifecycle, global watermark, retry/backoff, raw quarantine fallback, command MutationGate, cutover CLI, and private lifecycle seams on top of accepted Tasks 1-5.

**Architecture:** Task 6 adds one leased `SchedulerWriter` and a durable scheduler bridge while preserving live `TheGioi` as the canonical world owner. All durable writes run inside existing immediate SQLite UoWs and `world.trongMutationScheduler(mutation, fn)`. Writer code consumes accepted Task 5 reducer/store protocol literally and does not add Task 7 routing or mutate `server/world.js`.

**Tech Stack:** Node.js CommonJS, `node:test` TAP, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task 6 in `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` beginning at line 10866, parent exact writer snippets around lines 13265, 14035-14235, 14557-14897, and accepted Task 5 downstream protocol lines 825-833 in `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`.

## Direct inspection baseline

This V7 plan was written after direct inspection of live code:

- Node: `node --test --test-isolation=none --test-reporter=tap` on live Node `v24.19.0` emits named TAP subtests.
- `server/world.js`: `trongMutationScheduler(mutation,fn)` at line 207, `_schedulerActive(mutation)` at 219, `advanceAccountNoiBo(mutation,accountId,targetS,saveOptions)` at 226, `luu` at 492, `_dongBoSchedulerLuu` at 538. `_dongBoSchedulerLuu` calls `store.replaceAccountAdvance(token,accountId,revision,nextAtS,nowMs)` only when `!currentAccountAdvanceJobId && !deferAccountWake`. There is no live `advanceDueNoiBo`.
- `server/db.js`: `dqDenHan` is `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?`.
- `server/scheduler/advance-service.js`: `advanceTo` saves when state changed or `blockedExternal`; it returns `saveReceipt`, `deferredExternal`, and `blockedExternalJobId`. `advanceBarrier` already calls `store.parkGlobalBehindPreceding(...)` and returns `blockedExternal:true, blockedExternalJobId`.
- `server/scheduler/reducers.js`: `initializeCombatSeed(leaseToken,effectiveNowMs)`, `prepare(mutation,executableJob,options)`, `applyPrepared(mutation,prepared)`.
- `server/scheduler/store.js`: live methods include `loadExecutableJob`, `hasCommittedApplication`, `insertApplication`, `checkpointPartial`, `markDurableMutation`, `completeApplied`, `finishResolved`, `completeAccountAdvanceAndScheduleSuccessor`, `fail`, `recoverExpiredRunning`, `adoptAccountAdvanceForCommand`, `replaceAccountAdvance`, `blockOwnedAccountAdvance`, `parkGlobalBehindPreceding`, `assertAccountDependencyIntegrity`, and `resumeOwnedRunning(token,jobId,nowMs,lockMs)`.
- `replaceAccountAdvance(token,accountId,revision,nextLocalAtS,nowMs)` uses idempotency key `account-advance:<accountId>:<revision>`, cancels every unblocked PENDING/RETRY_WAIT sibling for that account except the same key as retained `SUPERSEDED` history, preserves RUNNING continuations, returns any already blocked PENDING account job immediately, and schedules the new ACCOUNT_ADVANCE when `nextLocalAtS` is safe.
- `blockOwnedAccountAdvance(token,job,checkpointRevision,blockedByJobId,nowMs)` requires a live RUNNING ACCOUNT_ADVANCE for the same account, a live dependency global job, `job.scheduled_at_s <= dependency.scheduled_at_s`, matching current `dq` revision, no sibling PENDING/RETRY_WAIT/RUNNING, and a fresh lease fence.
- Task 5 tests require partial `applyPrepared` result to be a plain two-key effect with `Reflect.ownKeys(effect).join(',') === 'checkpointRevision,saveReceipt'` and strict receipt identity `effect.saveReceipt === prepared.saveReceipt === prepared.advanceResult.saveReceipt`.

## Global Constraints

- Preserve V1-V6 plan files. This planning task creates only this V7 file.
- Task 6 implementation may modify exactly six implementation/test files: `server/scheduler/store.js`, `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`.
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task 7+ scope: do not modify `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, `js/*.js`, or `web/js/mp.js`.
- Do not add `TheGioi.prototype.advanceDueNoiBo`; Task 6 owns `SchedulerWriter.prototype.advanceDueInCurrentUow`.
- Existing accepted scheduler suite baseline is 163 tests. V7 adds exactly 42 tests total, including the manifest validator folded into case 41, so the expected final scheduler output is 205 tests, 204 passed, 0 failed, 1 known environment skip. If a fresh pre-edit run proves the baseline changed, report command output and recompute arithmetic explicitly.
- Public bridge enumerable keys remain exactly `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`. `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` are private non-enumerable lifecycle seams only.
- The active V7 plan hash is not embedded in this plan. After this file is frozen, implementation preflight must run `sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v7.md > /tmp/task6-active-plan.sha256` and finish with `sha256sum -c /tmp/task6-active-plan.sha256`.

## V7 correction ledger

1. Direct `deferredExternal` can be external-only: live World may save the account and return a non-null receipt while no local wake exists at or before the external dependency `T`. V7 defines an explicit writer fallback: create/replace an ACCOUNT_ADVANCE at dependency-safe `nextDueAtS` using `receipt.revision`, adopt it, then `blockOwnedAccountAdvance`.
2. Existing later local wake handling is deterministic: `replaceAccountAdvance` may cancel later unblocked local wakes as `SUPERSEDED`, but the blocked continuation at dependency `T` later computes the successor from current world state via accepted Store successor semantics. A pre-existing blocked account row is treated as the already installed continuation, not double-blocked.
3. Zero-budget global primitive branch synthesizes `zeroGlobal.advanceResult` exactly: `processed` inherited from barrier, `advancedToS` inherited from barrier, `nextDueAtS = Number(executable.scheduled_at_s)`, `hasMoreDue:true`, `budgetExhausted:true`; it is recorded in committed metrics/tick. Case 20 asserts that exact shape.
4. `settleClaimFailure` short-circuits before opening a settlement UoW for `INJECTED_CRASH`, original `LEASE_LOST`, and original fatal storage. Only ordinary reducer/apply failures use fresh settlement. Case 13 proves after-claim crash leaves the row RUNNING for startup recovery semantics.
5. Inventory helper records directory symlinks by inspecting both `dirnames` and `filenames` with `lstat`, removes symlink dirs from traversal, records real directories too, and detects type/mode/content/symlink target changes. Empty untracked directories are detected as directory additions; empty dirs are not part of the six-file implementation seal.
6. All V1-V6 fixes remain binding: exact Task 5 downstream protocol, already-parked global barrier, strict partial effect contract, fatal settlement transition, raw quarantine with no payload parse, Task 7 private seams, one standby poll, exact CLI, external plan hash, report without self-hash, and two fresh Sol/high reviews over exact six implementation/test hashes.

---

## Task 1: Preflight, exact RED manifest, and normalized inventory

**Files:**

- Modify later: `tools/test-scheduler.js`
- Create temp at implementation time: `/tmp/task6-active-plan.sha256`, `/tmp/task6-inventory-functions.sh`, `/tmp/task6-inventory-functions.sha256`, `/tmp/task6-pre-inventory.tsv`, `/tmp/task6-pre-forbidden.tsv`

**Interfaces:**

- Consumes: `node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js`
- Produces: exact 42-case RED manifest, RED proof helper, untracked-aware inventory helper

- [ ] **Step 1: Pin active V7 plan externally**

Run before any source/test edit:

```bash
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v7.md \
  > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

- [ ] **Step 2: Create inventory helper that records files, symlinks, and dirs**

Create the temp helper outside the repo and source it in every inventory block:

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
    tracked[path.decode()] = meta.split()[0].decode()
rows = []
def add_path(path):
    rel = path.relative_to(root).as_posix()
    st = os.lstat(path)
    fs_mode = oct(stat.S_IMODE(st.st_mode))
    tracked_mode = tracked.get(rel, '-')
    if stat.S_ISLNK(st.st_mode):
        target = os.readlink(path)
        payload = target.encode()
        return (rel, 'symlink', tracked_mode, fs_mode, str(len(payload)),
            '-', hashlib.sha256(payload).hexdigest(), target)
    if stat.S_ISREG(st.st_mode):
        payload = path.read_bytes()
        return (rel, 'file', tracked_mode, fs_mode, str(len(payload)),
            hashlib.sha256(payload).hexdigest(), '-', '-')
    if stat.S_ISDIR(st.st_mode):
        return (rel, 'dir', tracked_mode, fs_mode, '-', '-', '-', '-')
    return (rel, 'other', tracked_mode, fs_mode, str(int(st.st_size)), '-', '-', '-')
for dirpath, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
    current = Path(dirpath)
    if current == root / '.git':
        dirnames[:] = []
        continue
    if current != root:
        rows.append(add_path(current))
    keep_dirs = []
    for name in dirnames:
        path = current / name
        if name == '.git':
            continue
        st = os.lstat(path)
        if stat.S_ISLNK(st.st_mode):
            rows.append(add_path(path))
        else:
            keep_dirs.append(name)
    dirnames[:] = keep_dirs
    for name in filenames:
        rows.append(add_path(current / name))
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

Columns are `path`, `type`, `tracked_mode`, `fs_mode`, `size`, `content_sha256`, `symlink_target_sha256`, `symlink_target`. This proves no non-owned file, directory, symlink, file mode, tracked mode, content, deletion, or arbitrary untracked addition changed. Case 41 mutates/adds an untracked directory symlink target in a temp fixture and proves the helper catches it.

- [ ] **Step 3: Install exact 42-case manifest**

Use these exact test names and unique sentinels. The manifest validator is case 41, not an extra test.

```js
var TASK6_RED_CASES = Object.freeze([
  ['Task 6 v7 writer rejects legacy mode before lease', 'TASK6V7_RED_001_LEGACY'],
  ['Task 6 v7 startup acquisition rollback arms no poll while stopping', 'TASK6V7_RED_002_STARTUP_ROLLBACK'],
  ['Task 6 v7 startup committed lease release preserves original failure', 'TASK6V7_RED_003_STARTUP_RELEASE'],
  ['Task 6 v7 startup recovery marks expired rows asserts integrity stages resume and fences', 'TASK6V7_RED_004_STARTUP_RECOVERY'],
  ['Task 6 v7 heartbeat transient rearms and generation loss keeps one poll', 'TASK6V7_RED_005_HEARTBEAT'],
  ['Task 6 v7 lease loss during stop finalization is idempotent', 'TASK6V7_RED_006_LEASE_STOP'],
  ['Task 6 v7 shutdown admission fence drains captured tail with bounded grace', 'TASK6V7_RED_007_SHUTDOWN'],
  ['Task 6 v7 private lifecycle seams are non enumerable and db close cache only', 'TASK6V7_RED_008_PRIVATE'],
  ['Task 6 v7 runMaintenanceCutover fresh only lease audit and release', 'TASK6V7_RED_009_CUTOVER'],
  ['Task 6 v7 scheduler cutover CLI exports exact surface and closes kho', 'TASK6V7_RED_010_CLI'],
  ['Task 6 v7 claim brands raw row before target default', 'TASK6V7_RED_011_BRAND'],
  ['Task 6 v7 before claim crash leaves no running row', 'TASK6V7_RED_012_BEFORE_CLAIM'],
  ['Task 6 v7 after claim crash leaves running row for startup recovery', 'TASK6V7_RED_013_AFTER_CLAIM'],
  ['Task 6 v7 after application crash restarts without duplicate effect', 'TASK6V7_RED_014_AFTER_APP'],
  ['Task 6 v7 after effect crash rolls back application and world state', 'TASK6V7_RED_015_AFTER_EFFECT'],
  ['Task 6 v7 before final fence generation flip rolls back effect UoW', 'TASK6V7_RED_016_FINAL_FENCE'],
  ['Task 6 v7 already applied restart skips effect and terminalizes once', 'TASK6V7_RED_017_REPLAY'],
  ['Task 6 v7 stale generation effect fails before commit', 'TASK6V7_RED_018_STALE_GENERATION'],
  ['Task 6 v7 global barrier already parked branch does not double park', 'TASK6V7_RED_019_BARRIER_PARK'],
  ['Task 6 v7 zero budget global synthesizes exact advance metric', 'TASK6V7_RED_020_ZERO_GLOBAL'],
  ['Task 6 v7 account partial effect shape and identity are exact', 'TASK6V7_RED_021_PARTIAL_SHAPE'],
  ['Task 6 v7 account partial blocked external uses advanceResult dependency', 'TASK6V7_RED_022_PARTIAL_BLOCK'],
  ['Task 6 v7 established zero partial retains running lock unchanged', 'TASK6V7_RED_023_ESTABLISHED_ZERO'],
  ['Task 6 v7 prepared global charges primitive once before idempotency insert', 'TASK6V7_RED_024_GLOBAL_CHARGE'],
  ['Task 6 v7 prepared replay validates application and skips second effect', 'TASK6V7_RED_025_REPLAY_CHARGE'],
  ['Task 6 v7 terminal mapping uses only accepted Store methods', 'TASK6V7_RED_026_TERMINAL'],
  ['Task 6 v7 account cancelled terminal is not deferred and returns afterCancel', 'TASK6V7_RED_027_ACCOUNT_CANCEL'],
  ['Task 6 v7 deferred completed account records advance once before finalizer', 'TASK6V7_RED_028_DEFER_METRIC'],
  ['Task 6 v7 settlement reloads executable then Store fail', 'TASK6V7_RED_029_SETTLE_FAIL'],
  ['Task 6 v7 settlement raw corruption quarantines without payload parse', 'TASK6V7_RED_030_RAW_QUARANTINE'],
  ['Task 6 v7 settlement missing fresh row preserves original failure', 'TASK6V7_RED_031_MISSING_ROW'],
  ['Task 6 v7 settlement short circuits injected lease and fatal originals', 'TASK6V7_RED_032_SETTLE_SHORT'],
  ['Task 6 v7 runCommand barrier partial returns TICK_PARTIAL', 'TASK6V7_RED_033_CMD_BARRIER'],
  ['Task 6 v7 runCommand account partial skips closure and queues continuation', 'TASK6V7_RED_034_CMD_PARTIAL'],
  ['Task 6 v7 runCommand thenable rolls back after invocation only', 'TASK6V7_RED_035_CMD_THENABLE'],
  ['Task 6 v7 account delete skips advance and adopted success returns closure', 'TASK6V7_RED_036_CMD_DELETE_ADOPT'],
  ['Task 6 v7 advance due 61 account boundary skips closure and queues continuation', 'TASK6V7_RED_037_CMD_DUE_61'],
  ['Task 6 v7 direct completed account preserves World synchronized successor', 'TASK6V7_RED_038_DIRECT_COMPLETE'],
  ['Task 6 v7 direct established zero creates exact fallback continuation', 'TASK6V7_RED_039_DIRECT_ZERO'],
  ['Task 6 v7 direct partial and external only deferred adopt fallback wake exactly once', 'TASK6V7_RED_040_DIRECT_EXTERNAL_ONLY'],
  ['Task 6 v7 RED manifest and normalized scope catch mode symlink dirs and extra files', 'TASK6V7_RED_041_SCOPE_MANIFEST'],
  ['Task 6 v7 implementation seal excludes report and active plan is fixed', 'TASK6V7_RED_042_SEAL']
]);
```

Task assignments remain exact: 1-8 lifecycle/private seams, 9-10 cutover/CLI, 11-32 claim/downstream/settlement, 33-40 command/direct-account behavior, 41-42 scope/seal.

- [ ] **Step 4: Use exact TAP RED helper for every case**

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

Every new test lazy-requires new Task 6 modules inside the named subtest or fixture. Loader failure that prevents named TAP registration is a RED proof failure.

---

## Task 2: Lifecycle, startup recovery, timers, and private bridge

**Files:**

- Create/Modify: `server/scheduler/writer.js`
- Create/Modify: `server/scheduler/index.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: `store.acquireLease`, `store.releaseLease`, `store.recoverExpiredRunning(token,nowMs,policy)`, `store.assertAccountDependencyIntegrity(token,nowMs)`, `store.resumeOwnedRunning(token,jobId,nowMs,lockMs)`, `reducer.initializeCombatSeed(token,nowMs)`.
- Produces: `SchedulerWriter`, `taoScheduler(context)`, lifecycle states, timers, private bridge seams.

- [ ] **Step 1: Prove RED cases 1-8**

Run `task6_red_one` for cases 1-8. Each case must register its exact TAP subtest and fail on its unique sentinel.

- [ ] **Step 2: Implement committed mutation context**

Use parent ledger shape:

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

- [ ] **Step 3: Implement startup recovery with staged publication**

Startup order is exact:

1. Reject `scheduler_mode='legacy'` before lease acquisition.
2. Acquire lease in one immediate UoW.
3. Open one recovery immediate UoW with the committed token.
4. Record monotonic effective time.
5. Call `reducer.initializeCombatSeed(token,effectiveNowMs)`.
6. Preview expired RUNNING rows. If preview count is greater than zero, call `markDurableMutationInCurrentUow(mutation,effectiveNowMs)` before `recoverExpiredRunning`.
7. Call `store.recoverExpiredRunning(token,effectiveNowMs,retryPolicy)`.
8. Call `store.assertAccountDependencyIntegrity(token,effectiveNowMs)`.
9. Enumerate owned RUNNING ids and call `resumeOwnedRunning(token,id,nowMs,leaseMs)` for each id.
10. Return staged `{recovered,resumedRows,metricLedger}` from the UoW.
11. Call `refreshLeasePhaseInCurrentUow('before-recovery-commit',token,effectiveNowMs)` immediately before commit.
12. After commit, publish staged resumed rows to the partial queue exactly once, set ready, and arm heartbeat/wake/reconcile once.

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
  var mutation = this.newMutationContext(token, {value: 50000}, nowMs);
  this.reducer.initializeCombatSeed(token, nowMs);
  if (this.previewExpiredRunningCount(token, nowMs) > 0) {
    this.markDurableMutationInCurrentUow(mutation, nowMs);
  }
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

- [ ] **Step 4: Implement startup unwind, lease-loss timers, and private seams**

Required lifecycle semantics:

- acquisition rollback has no committed token and must clear state/timers;
- if failure happens after acquisition, release lease best-effort in a guarded `try/catch`; log sanitized release error but throw the original startup error;
- if `stopRequested` becomes true during startup, release any committed lease, clear timers, do not arm standby poll, and end with stopped cache state;
- original fatal startup error calls `transitionStorageFatal(original)`;
- ordinary lease loss clears mutation/retry timers and arms at most one standby acquisition poll;
- lease loss during stopping/stopped/stop finalization is idempotent and does not arm another poll;
- stop clears grace, heartbeat, wake, retry, mutation, and standby poll timers;
- `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` are private non-enumerable, non-writable, non-configurable descriptors;
- `_datDatabaseClosing` sets reason `SCHEDULER_DB_CLOSED`, clears all timers, and later `getStatus` is cache-only.

---

## Task 3: Claimed-job lifecycle, exact Task 5 downstream, retry, and quarantine

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: accepted Task 5 protocol and live Store/Reducer/AdvanceService ABIs.
- Produces: claimed-job apply path, strict account partial validation, account finalizer protocol, raw quarantine primitive, failure settlement.

- [ ] **Step 1: Prove RED cases 11-32**

Run `task6_red_one` for cases 11-32.

- [ ] **Step 2: Implement claim/apply skeleton with final fence**

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
    var result = self.world.trongMutationScheduler(mutation, function () {
      return self.executeClaimedInCurrentUow(mutation, rawClaim, nowMs, {
        executionTargetS: undefined,
        deferAccountFinalize: false
      });
    });
    result.metricLedger = mutation.metricLedger;
    self.callFaultHook('before-final-fence', rawClaim);
    self.refreshLeasePhaseInCurrentUow('before-effect-commit', token, nowMs);
    return result;
  }, {immediate: true});
};
```

Crash hooks are `before-claim`, `after-claim`, `after-application`, `after-effect`, and `before-final-fence`. Case 13 injects `INJECTED_CRASH` after claim and asserts the row remains `RUNNING` with the original owner/generation until startup recovery sees it expired; no `fail`/quarantine settlement runs for injected crash.

- [ ] **Step 3: Implement global branch with already-parked and exact zero-budget result**

```js
if (isGlobalJob(executable)) {
  barrier = this.advanceService.advanceBarrier(mutation, executable);
  if (barrier.blockedExternal === true && barrier.blockedExternalJobId) {
    var reordered = {reordered: true, partial: false, budgetExhausted: false,
      jobId: executable.id, blockedExternalJobId: barrier.blockedExternalJobId,
      advanceResult: {processed: Number(barrier.processed),
        advancedToS: Number(barrier.advancedToS),
        nextDueAtS: Number(executable.scheduled_at_s),
        hasMoreDue: true, budgetExhausted: false}};
    return finish(reordered, 'partial', reordered.advanceResult);
  }
  if (barrier.budgetExhausted === true) {
    var barrierPartial = {partial: true, budgetExhausted: true, jobId: executable.id,
      advanceResult: {processed: Number(barrier.processed),
        advancedToS: Number(barrier.advancedToS),
        nextDueAtS: barrier.nextDueAtS === undefined ? null : barrier.nextDueAtS,
        hasMoreDue: true, budgetExhausted: true}};
    return finish(barrierPartial, 'partial', barrierPartial.advanceResult);
  }
  alreadyCommitted = this.store.hasCommittedApplication(token, executable, nowMs);
  if (!alreadyCommitted && mutation.remainingBudget.value === 0) {
    var zeroGlobal = {partial: true, budgetExhausted: true, jobId: executable.id,
      advanceResult: {processed: Number(barrier.processed),
        advancedToS: Number(barrier.advancedToS),
        nextDueAtS: Number(executable.scheduled_at_s),
        hasMoreDue: true, budgetExhausted: true}};
    return finish(zeroGlobal, 'partial', zeroGlobal.advanceResult);
  }
  if (!alreadyCommitted) mutation.remainingBudget.value -= 1;
}
```

The preceding-root branch recognizes the already parked result from live `advanceBarrier`; writer must not call `parkGlobalBehindPreceding` again. Case 19 asserts exactly one total Store park call. Case 20 asserts `zeroGlobal.advanceResult` exact fields and that `mutation.recordAdvance(zeroGlobal.advanceResult)` feeds the committed `scheduler.tick` count/budget flag after commit.

- [ ] **Step 4: Prepare before idempotency, validate replay decision, skip applied effect**

Order is fixed by Task 5:

1. `loadExecutableJob(token,rawClaim,nowMs)` brands raw.
2. default `executionTargetS` from branded executable.
3. `markDurableMutation(token,nowMs)`.
4. global barrier before reducer for global jobs.
5. `reducer.prepare(mutation,executable,options)`.
6. for prepared jobs, `store.insertApplication(...)` after `prepare`.
7. if `application.alreadyApplied`, validate the application result and skip `reducer.applyPrepared`.
8. if not already applied, `reducer.applyPrepared(mutation,prepared)`.
9. finish with accepted Store terminal methods.

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

`store.insertApplication` remains the authoritative validation boundary: it reloads/branded-validates the running job, validates candidate and stored application rows, and returns `alreadyApplied:true` only after the existing row validates.

- [ ] **Step 5: Strict partial account effect validation**

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

Case 21 injects null prototype, symbol key, non-enumerable key, reversed key order, cloned receipt, and missing identity variants.

- [ ] **Step 6: Finish partial/prepared with accepted Store methods only**

Partial ACCOUNT_ADVANCE:

- `blockedExternalJobId` path calls `blockOwnedAccountAdvance(token,job,checkpointRevision,blockedExternalJobId,nowMs)`;
- normal receipt path calls `checkpointPartial(token,job,revision,nowMs)`;
- established-zero path keeps the RUNNING lock and returns `{partial:true,jobId:job.id,establishedZero:true}` with no application and no checkpoint/block.

Prepared terminal:

- `CANCELLED` calls `finishResolved(token,job,'CANCELLED',cancelReason,nowMs)` before any deferral and returns `afterCancel:true` for ACCOUNT_ADVANCE;
- completed ACCOUNT_ADVANCE calls `completeAccountAdvanceAndScheduleSuccessor(token,job,nextLocalAtS,nowMs)`;
- completed global calls `completeApplied(token,job,nowMs)`.

Deferred completed ACCOUNT_ADVANCE records `prepared.advanceResult` exactly once before returning its finalizer. Drain does not set `deferAccountFinalize:true`; command paths finalize exactly once before command UoW commit.

- [ ] **Step 7: Implement failure settlement short circuits and raw quarantine**

`settleClaimFailure(rawRow, originalError)` begins with exact short circuits:

```js
SchedulerWriter.prototype.settleClaimFailure = function (rawRow, originalError) {
  if (isInjectedCrash(originalError)) throw originalError;
  if (isLeaseLost(originalError)) {
    this.transitionLeaseLost(originalError);
    throw originalError;
  }
  if (isFatalStorageError(originalError)) {
    this.transitionStorageFatal(originalError);
    throw originalError;
  }
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
    if (isFatalStorageError(settlementError)) this.transitionStorageFatal(settlementError);
    if (isLeaseLost(settlementError)) this.transitionLeaseLost(settlementError);
    throw originalError;
  }
};
```

If the fresh row is missing, rethrow the original reducer/apply error and do not invent a terminal row. If settlement itself throws fatal storage or loses lease, transition lifecycle accordingly while rethrowing the original error unchanged.

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
  var code = safeErrorMessage(normalizeSchedulerErrorCode(failure));
  var message = safeErrorMessage(failure && failure.message);
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='QUARANTINED',retry_at_ms=NULL," +
    "error_code=?,error_message_safe=?,quarantined_at_ms=?,updated_at_ms=?," +
    "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL " +
    "WHERE id=? AND state='RUNNING' AND locked_by=? AND locked_generation=? " +
    "AND locked_until_ms>? AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(code, message, nowMs, nowMs, rawRow.id, token.ownerId, token.generation,
    nowMs, token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'RAW_QUARANTINE_CONFLICT');
  return this.getById(rawRow.id);
};
```

This SQL does not touch `attempt`, `payload_json`, `payload_sha256`, `max_attempts`, or replay fields, and it never reads unsafe raw payload/aggregate fields.

---

## Task 4: Command MutationGate, direct account fallback, advance-due, bridge, and CLI

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/index.js`
- Modify: `server/scheduler/cutover.js`
- Create/Modify: `tools/scheduler-cutover.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: live `world._schedulerActive`, `world.advanceAccountNoiBo`, `kho.q.dqDenHan`, parent `runCommand({name,accountId?,run})`.
- Produces: command admission, direct account outcomes, `advanceDueInCurrentUow`, exact CLI module surface.

- [ ] **Step 1: Prove RED cases 9-10 and 33-40**

Run `task6_red_one` for cutover/CLI cases 9-10 and command/direct cases 33-40.

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

- [ ] **Step 3: Implement direct account path with normal World save options**

Direct path must not pass `deferAccountWake:true`; it lets live World synchronize the normal successor.

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
      targetS: this.dependencySafeContinuationS(result, targetS),
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

- [ ] **Step 4: Implement dependency-safe fallback for direct partial/deferred**

The external-only bug is fixed here. A direct external deferral can have `result.saveReceipt !== null` but no local wake at or before the external dependency. Writer must create one using the receipt revision.

```js
SchedulerWriter.prototype.dependencySafeContinuationS = function (result, fallbackTargetS) {
  if (result && result.deferredExternal === true && result.blockedExternalJobId) {
    var dependency = this.store.getById(result.blockedExternalJobId);
    if (!dependency) throw schedulerError('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
    return Number(dependency.scheduled_at_s);
  }
  if (result && Number.isSafeInteger(result.nextDueAtS)) return Number(result.nextDueAtS);
  return fallbackTargetS;
};

SchedulerWriter.prototype.ensureDirectContinuationInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  var targetS = Number(finalizer.targetS);
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, finalizer.accountId, targetS, nowMs, this.leaseMs
  );
  if (adopted) return adopted;

  if (finalizer.deferredExternal === true) {
    if (!finalizer.directReceipt || !Number.isSafeInteger(finalizer.directReceipt.revision) ||
        !finalizer.blockedExternalJobId) {
      throw schedulerError('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
    }
    var dependency = this.store.getById(finalizer.blockedExternalJobId);
    if (!dependency || !Number.isSafeInteger(Number(dependency.scheduled_at_s))) {
      throw schedulerError('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
    }
    var safeTargetS = Number(dependency.scheduled_at_s);
    var replaced = this.store.replaceAccountAdvance(
      mutation.leaseToken,
      Number(finalizer.accountId),
      Number(finalizer.directReceipt.revision),
      safeTargetS,
      nowMs
    );
    if (replaced && replaced.blocked_by_job_id) {
      return {alreadyBlocked: true, id: replaced.id, aggregate_id: replaced.aggregate_id,
        scheduled_at_s: replaced.scheduled_at_s};
    }
    adopted = this.store.adoptAccountAdvanceForCommand(
      mutation.leaseToken, finalizer.accountId, safeTargetS, nowMs, this.leaseMs
    );
    if (adopted) return adopted;
  }

  if (finalizer.directReceipt === null &&
      finalizer.advanceResult &&
      finalizer.advanceResult.budgetExhausted === true &&
      Number.isSafeInteger(finalizer.advanceResult.nextDueAtS)) {
    var loaded = this.world.nap(Number(finalizer.accountId));
    if (!loaded || !loaded.row || !Number.isSafeInteger(Number(loaded.row.revision))) {
      throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
    }
    this.store.replaceAccountAdvance(
      mutation.leaseToken, Number(finalizer.accountId), Number(loaded.row.revision),
      Number(finalizer.advanceResult.nextDueAtS), nowMs
    );
    adopted = this.store.adoptAccountAdvanceForCommand(
      mutation.leaseToken, finalizer.accountId,
      Number(finalizer.advanceResult.nextDueAtS), nowMs, this.leaseMs
    );
    if (adopted) return adopted;
  }

  throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
};
```

Deterministic later-wake handling: when `replaceAccountAdvance` installs the dependency-safe wake, any later unblocked PENDING/RETRY_WAIT local wake for that account is retained as `CANCELLED/SUPERSEDED`. This is not lost gameplay state: the blocked continuation resumes at the dependency's `T`, and `completeAccountAdvanceAndScheduleSuccessor` schedules the next local wake from the current `dq` revision after the dependency is released. If `replaceAccountAdvance` returns an already blocked account row, writer returns a partial pointing at that existing blocked row and does not double-block.

```js
SchedulerWriter.prototype.finalizeDirectAccountInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  var adopted = this.ensureDirectContinuationInCurrentUow(mutation, finalizer, nowMs);
  if (adopted.alreadyBlocked) {
    return {partial: true, jobId: null, blockedAccountJobId: adopted.id,
      dependencyJobId: finalizer.blockedExternalJobId,
      advanceResult: finalizer.advanceResult};
  }
  if (typeof mutation.recordJob === 'function') mutation.recordJob(adopted, 'partial', nowMs);
  if (finalizer.deferredExternal === true) {
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

Case 40 proves both the previous direct partial/deferred adoption and the external-only path: a direct command creates an external dependency, has no local event due before dependency `T`, has an existing later local wake, calls `replaceAccountAdvance(token,accountId,receipt.revision,dependencyT,nowMs)`, adopts the dependency-safe wake, calls `blockOwnedAccountAdvance`, and leaves the later wake only as deterministic `SUPERSEDED` history.

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
  var outcome = this.executeClaimedInCurrentUow(mutation, adopted, nowMs, {
    executionTargetS: targetS,
    deferAccountFinalize: options.deferAccountFinalize === true
  });
  if (!outcome.afterCancel) return outcome;
  return Object.assign({}, this.directAccountOutcomeInCurrentUow(
    mutation, accountId, targetS, nowMs,
    {deferAccountFinalize: options.deferAccountFinalize === true}
  ), {afterCancel: true});
};
```

Case 27 covers adopted cancellation not deferred. Case 36 covers adopted success returning the command closure and account-delete skipping automatic advance.

- [ ] **Step 6: Implement writer-owned `advanceDueInCurrentUow` with limit+1**

```js
SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, targetS, nowMs) {
  this.world._schedulerActive(mutation);
  var rows = this.store.kho.q.dqDenHan.all(targetS, 61);
  var dueRows = rows.slice(0, 60);
  var summary = {processed: 0, advancedToS: targetS, nextDueAtS: null,
    hasMoreDue: rows.length > 60, budgetExhausted: false, saveReceipt: null,
    deferredExternal: false, blockedExternalJobId: null};
  for (var i = 0; i < dueRows.length; i++) {
    var one = this.directAccountOutcomeInCurrentUow(
      mutation, Number(dueRows[i].tk), targetS, nowMs,
      {deferAccountFinalize: true}
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
      if (mutation.commandAccountFinalizer) throw schedulerError('ACCOUNT_COMMAND_FINALIZER_DUPLICATE');
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

Case 37 creates 61 due accounts in deterministic `keTiep,tk` order. `runCommand({name:'advance-due',run})` returns `{deferred:true,code:'TICK_PARTIAL'}`, skips the closure, and enqueues continuation.

- [ ] **Step 7: Implement `runCommand` with honest thenable semantics**

Required flow:

- use internally derived monotonic `nowMs`;
- settle admission barriers before closure;
- every command UoW calls `markDurableMutationInCurrentUow` before command writes;
- account-delete calls closure immediately after marker and does not auto-advance;
- advance-due calls writer-owned `advanceDueInCurrentUow`;
- inspect command account/advance-due outcome; if partial/deferred, persist `{deferred:true,code:'TICK_PARTIAL'}`, finalize any account finalizer, enqueue partial/continuation after commit, and never invoke closure;
- if command closure returns a thenable, throw `UNIT_OF_WORK_ASYNC` after invocation; rollback after invocation is all that can be guaranteed;
- `callFaultHook('before-final-fence', null)` runs before `refreshLeasePhaseInCurrentUow('before-command-commit',token,nowMs)`;
- `flushCommittedMetricLedger(committed.metricLedger)` runs only after commit;
- if committed result has `partialJobId`, enqueue it after commit; if deferred result has null job id, call `enqueueBudgetContinuationIfDue` after commit.

- [ ] **Step 8: Implement cutover and CLI exact surfaces**

`server/scheduler/cutover.js` exports `{runMaintenanceCutover}`. It separates function result from CLI printing and always releases fresh lease on success/failure.

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

- [ ] **Step 1: Run scheduler verification**

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

The report includes these six hashes, verification outputs, RED proof summary, inventory helper hash, scope checks, and the fact that review binding is to the six-file seal plus external V7 plan hash only. The report does not include its own hash.

- [ ] **Step 4: Normalized inventory checks**

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
  'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v7.md',
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
  raise SystemExit('non-owned inventory changes:\n' + '\n'.join(bad))
PY
sha256sum -c /tmp/task6-active-plan.sha256
```

This detects non-owned tracked, untracked, mode-only, type, directory, file, symlink target, deletion, and arbitrary untracked additions.

- [ ] **Step 5: Launch two fresh Sol/high reviews over exact seals**

Send reviewers:

- V7 plan path and external hash from `/tmp/task6-active-plan.sha256`,
- inventory helper hash from `/tmp/task6-inventory-functions.sha256`,
- six implementation/test paths and hashes from `/tmp/task6-six-file-sha256.txt`,
- verification outputs,
- normalized inventory/forbidden diff result,
- exact report path.

Any change to the six sealed files or V7 plan invalidates both approvals and requires rerunning verification, recomputing six hashes, and launching two new fresh Sol/high reviews.

- [ ] **Step 6: Finalize report and rerun final checks**

Approvals may be recorded in the report after review because review binding is to the six implementation/test hashes, inventory helper hash, and external V7 plan hash. If report text changes after approval, rerun:

```bash
sha256sum -c /tmp/task6-six-file-sha256.txt
sha256sum -c /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
task6_inventory > /tmp/task6-final-inventory.tsv
rg -n '[[:blank:]]+$' docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

Repeat the normalized inventory comparison with `/tmp/task6-final-inventory.tsv`. If any six-file hash, plan hash, or inventory helper hash differs, discard reviews and restart Task 5.

## Self-audit checklist

- The direct external-only path creates dependency-safe continuation with `replaceAccountAdvance(token,accountId,receipt.revision,dependencyT,nowMs)`, then adopts and blocks it.
- Later local wakes are handled by live `replaceAccountAdvance` successor semantics and tested by case 40.
- Zero-global exact advance result is restored and tied to committed metrics by case 20.
- `settleClaimFailure` short-circuits injected crash, original lease loss, and original fatal storage before settlement UoW.
- Inventory helper records directory symlinks and prevents traversal through them.
- Manifest is exactly 42 unique `TASK6V7_RED_*` sentinels, with cases 1-42 assigned as stated.
- Plan has no self-hash requirement; external `/tmp/task6-active-plan.sha256` is authoritative.

## Completion definition

- V1-V6 plans are preserved.
- V7 active plan hash is pinned externally and remains fixed through final handoff.
- Exactly 42 new tests are added and proven RED by exact TAP subtest name and sentinel using `--test-isolation=none`; final suite arithmetic is 205 total tests.
- Claimed-job execution follows Task 5 lines 825-833 exactly.
- Partial account effects enforce strict plain-object/key/identity contract.
- `ACCOUNT_ADVANCE` cancellation is terminalized before any deferred success finalizer.
- Direct account commands use normal World save options, preserve direct completed successor, handle established-zero fallback, create dependency-safe external-only fallback wakes, and never commit a missing continuation.
- `advance-due` is Task 6 writer-owned, uses `dqDenHan` limit+1 plus `world.advanceAccountNoiBo`, and treats the 61-account boundary as command partial.
- `advanceBarrier` preceding-root path causes exactly one Store park call, owned by AdvanceService.
- Every command/effect/settlement/recovery UoW performs a final live-lease fence immediately before commit.
- Startup recovery conditionally marks durable for recovered rows, asserts dependency integrity, stages resumed rows until commit, and publishes queues after commit.
- Raw quarantine does not parse payload and does not change attempt.
- CLI exports exactly `parseArgs`, `runCli`, and `main`, with the stated `require.main` call.
- Scope checks prove no non-owned tracked, untracked, mode-only, type, directory, file, or symlink change.
- Report has no self-hash. Two fresh Sol/high approvals bind to exact six implementation/test hashes, external V7 plan hash, and inventory helper hash.
