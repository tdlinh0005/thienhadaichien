# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V9

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 writer lifecycle, global-first drain/claim, global watermark, retry/backoff, raw quarantine fallback, command MutationGate, direct external-only account continuation retargeting, cutover CLI, and private lifecycle seams on top of accepted Tasks 1-5.

**Architecture:** Task 6 adds one leased `SchedulerWriter` and a durable scheduler bridge while preserving live `TheGioi` as canonical world owner. All durable writes run inside existing immediate SQLite UoWs and `world.trongMutationScheduler(mutation, fn)`. Writer code consumes accepted Task 5 reducer/store protocol literally, adds only Task6-owned Store/writer primitives, and does not add Task7 routing or mutate `server/world.js`.

**Tech Stack:** Node.js CommonJS, `node:test` TAP, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task 6 in `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` beginning at line 10866, with exact parent writer snippets around lines 13840-14535 and 14680-14897, plus accepted Task 5 downstream protocol lines 825-833 in `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`.

## Direct inspection baseline

V9 was written after direct inspection of live source and live Node behavior:

- `node --test --test-isolation=none --test-reporter=tap --test-name-pattern '^exact name$'` on live Node `v24.19.0` runs exactly the matching TAP subtest and reports `# tests 1`.
- `server/world.js`: `trongMutationScheduler(mutation,fn)` at line 207, `_schedulerActive(mutation)` at 219, `advanceAccountNoiBo(mutation,accountId,targetS,saveOptions)` at 226, `luu` at 492, `_dongBoSchedulerLuu` at 538. `_dongBoSchedulerLuu` calls `store.replaceAccountAdvance(token,accountId,revision,nextAtS,nowMs)` only when `!currentAccountAdvanceJobId && !deferAccountWake`. There is no live `advanceDueNoiBo`.
- `server/db.js`: `dqDenHan` is `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?`.
- `server/scheduler/advance-service.js`: `advanceTo` saves when state changed or `blockedExternal`; it returns `saveReceipt`, `deferredExternal`, and `blockedExternalJobId`. `advanceBarrier` already calls `store.parkGlobalBehindPreceding(...)` and returns `blockedExternal:true, blockedExternalJobId`.
- `server/scheduler/reducers.js`: `initializeCombatSeed(leaseToken,effectiveNowMs)`, `prepare(mutation,executableJob,options)`, `applyPrepared(mutation,prepared)`.
- `server/scheduler/store.js`: live claim APIs are `claimNext(token,nowMs,watermarkS,lockMs)`, which claims only ACCOUNT_ADVANCE, and `claimForResolution(token,jobId,nowMs,lockMs,options)`, which claims one chosen global/logical row. Live canonical helpers inside Store include `validateJob`, `canonicalJson`, `sha256`, `parseCanonicalBoundedJson`, `executableInput`, `payloadIntegrity`, `mutationConflict`, `requiredMutation`, and `fail`.
- `replaceAccountAdvance(token,accountId,revision,nextLocalAtS,nowMs)` uses idempotency key `account-advance:<accountId>:<revision>`. If that key already exists with a different scheduled time/payload, Store schedule throws `IDEMPOTENCY_PAYLOAD_MISMATCH`; direct external-only same-key retarget therefore requires a Task6-owned retarget primitive.
- `blockOwnedAccountAdvance(token,job,checkpointRevision,blockedByJobId,nowMs)` requires a live RUNNING ACCOUNT_ADVANCE for the same account, a live dependency global job, `job.scheduled_at_s <= dependency.scheduled_at_s`, matching current `dq` revision, no sibling PENDING/RETRY_WAIT/RUNNING, and a fresh lease fence.
- Task 5 tests require partial `applyPrepared` result to be a plain two-key effect with `Reflect.ownKeys(effect).join(',') === 'checkpointRevision,saveReceipt'` and strict receipt identity `effect.saveReceipt === prepared.saveReceipt === prepared.advanceResult.saveReceipt`.

## Global Constraints

- Preserve V1-V8 plan files. This planning task creates only this V9 file.
- Task 6 implementation may modify exactly six implementation/test files: `server/scheduler/store.js`, `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`.
- Exact implementation report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task 7+ scope: do not modify `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, `js/*.js`, or `web/js/mp.js`.
- Do not add `TheGioi.prototype.advanceDueNoiBo`; Task 6 owns `SchedulerWriter.prototype.advanceDueInCurrentUow`.
- Existing accepted scheduler suite baseline is 163 tests. V9 adds exactly 42 tests total, including the manifest validator folded into case 41, so the expected final scheduler output is 205 tests, 204 passed, 0 failed, 1 known environment skip. If a fresh pre-edit run proves the baseline changed, report command output and recompute arithmetic explicitly.
- Public bridge enumerable keys remain exactly `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`. `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` are private non-enumerable lifecycle seams only.
- The active V9 plan hash is not embedded in this plan. After this file is frozen, implementation preflight must run `sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v9.md > /tmp/task6-active-plan.sha256` and finish with `sha256sum -c /tmp/task6-active-plan.sha256`.

## V9 correction ledger

1. Direct external blocked finalizer returns include `partial:true`, `deferredExternal:true`, `jobId:null`, `blockedAccountJobId`, `dependencyJobId`, and `advanceResult`. Postcommit code branches on `deferredExternal:true` when `partialJobId` is null and calls `enqueueBudgetContinuationIfDue` outside manual mode.
2. `advanceDueInCurrentUow` summary includes `partial:true` for the 61-account boundary. `runCommand` branches on `due.partial || due.hasMoreDue || due.budgetExhausted || due.deferredExternal`, returns `{deferred:true,code:'TICK_PARTIAL'}`, invokes closure zero times, and enqueues continuation postcommit.
3. Retarget semantics are corrected: absent same-key row returns `null` and triggers supported fallback; wrong supplied account/revision with no matching key also returns `null`; matching-key persisted identity corruption fails via `PAYLOAD_INTEGRITY` or `ACCOUNT_ADVANCE_RETARGET_INVALID`; RUNNING/blocked/terminal matching-key rows fail `ACCOUNT_ADVANCE_RETARGET_CONFLICT`; lease loss remains `LEASE_LOST`.
4. Inventory verification requires `docs/superpowers/reports` to be a real directory and the report to be a real file before allowlist comparison. Symlink directory/report are rejected explicitly.
5. RED helper uses `--test-name-pattern` with a robust anchored escaped full test name, verifies `# tests 1`, and verifies the sentinel appears only in that exact one-test TAP run. All 42 cases are invoked independently.
6. All V1-V8 fixes remain binding: exact Task5 downstream, global-first claim, effective-now-before-claim, already-parked global barrier, zero-global metric, strict partial effect, fatal settlement transitions, raw quarantine with no payload parse, private seams, one standby poll, exact CLI, external plan hash, report without self-hash, and two fresh Sol/high reviews over exact six implementation/test hashes.

---

## Task 1: Preflight, exact RED manifest, and normalized inventory

**Files:**

- Modify later: `tools/test-scheduler.js`
- Create temp at implementation time: `/tmp/task6-active-plan.sha256`, `/tmp/task6-inventory-functions.sh`, `/tmp/task6-inventory-functions.sha256`, `/tmp/task6-pre-inventory.tsv`, `/tmp/task6-pre-forbidden.tsv`

**Interfaces:**

- Consumes: `node --test --test-isolation=none --test-reporter=tap --test-name-pattern <anchored-pattern> tools/test-scheduler.js`
- Produces: exact 42-case RED manifest, isolated RED proof helper, untracked-aware inventory helper

- [ ] **Step 1: Pin active V9 plan externally**

Run before any source/test edit:

```bash
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v9.md \
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
  ['Task 6 v9 writer rejects legacy mode before lease', 'TASK6V9_RED_001_LEGACY'],
  ['Task 6 v9 startup acquisition rollback arms no poll while stopping', 'TASK6V9_RED_002_STARTUP_ROLLBACK'],
  ['Task 6 v9 startup committed lease release preserves original failure', 'TASK6V9_RED_003_STARTUP_RELEASE'],
  ['Task 6 v9 startup recovery marks expired rows asserts integrity stages resume and fences', 'TASK6V9_RED_004_STARTUP_RECOVERY'],
  ['Task 6 v9 heartbeat transient rearms and generation loss keeps one poll', 'TASK6V9_RED_005_HEARTBEAT'],
  ['Task 6 v9 lease loss during stop finalization is idempotent', 'TASK6V9_RED_006_LEASE_STOP'],
  ['Task 6 v9 shutdown admission fence drains captured tail with bounded grace', 'TASK6V9_RED_007_SHUTDOWN'],
  ['Task 6 v9 private lifecycle seams are non enumerable and db close cache only', 'TASK6V9_RED_008_PRIVATE'],
  ['Task 6 v9 runMaintenanceCutover fresh only lease audit and release', 'TASK6V9_RED_009_CUTOVER'],
  ['Task 6 v9 scheduler cutover CLI exports exact surface and closes kho', 'TASK6V9_RED_010_CLI'],
  ['Task 6 v9 claim brands raw row before target default', 'TASK6V9_RED_011_BRAND'],
  ['Task 6 v9 before claim crash leaves no running row', 'TASK6V9_RED_012_BEFORE_CLAIM'],
  ['Task 6 v9 after claim crash uses effective lock time and recovers backward clock restart', 'TASK6V9_RED_013_AFTER_CLAIM_CLOCK'],
  ['Task 6 v9 after application crash restarts without duplicate effect', 'TASK6V9_RED_014_AFTER_APP'],
  ['Task 6 v9 after effect crash rolls back application and world state', 'TASK6V9_RED_015_AFTER_EFFECT'],
  ['Task 6 v9 before final fence generation flip rolls back effect UoW', 'TASK6V9_RED_016_FINAL_FENCE'],
  ['Task 6 v9 already applied restart skips effect and terminalizes once', 'TASK6V9_RED_017_REPLAY'],
  ['Task 6 v9 stale generation effect fails before commit', 'TASK6V9_RED_018_STALE_GENERATION'],
  ['Task 6 v9 global first drain claims barrier before account and parks once', 'TASK6V9_RED_019_GLOBAL_FIRST'],
  ['Task 6 v9 zero budget global synthesizes exact advance metric', 'TASK6V9_RED_020_ZERO_GLOBAL'],
  ['Task 6 v9 account partial effect shape and identity are exact', 'TASK6V9_RED_021_PARTIAL_SHAPE'],
  ['Task 6 v9 account partial blocked external uses advanceResult dependency', 'TASK6V9_RED_022_PARTIAL_BLOCK'],
  ['Task 6 v9 established zero partial retains running lock unchanged', 'TASK6V9_RED_023_ESTABLISHED_ZERO'],
  ['Task 6 v9 prepared global charges primitive once before idempotency insert', 'TASK6V9_RED_024_GLOBAL_CHARGE'],
  ['Task 6 v9 prepared replay validates application and skips second effect', 'TASK6V9_RED_025_REPLAY_CHARGE'],
  ['Task 6 v9 terminal mapping uses only accepted Store methods', 'TASK6V9_RED_026_TERMINAL'],
  ['Task 6 v9 account cancelled terminal is not deferred and returns afterCancel', 'TASK6V9_RED_027_ACCOUNT_CANCEL'],
  ['Task 6 v9 deferred completed account records advance once before finalizer', 'TASK6V9_RED_028_DEFER_METRIC'],
  ['Task 6 v9 settlement reloads executable then Store fail', 'TASK6V9_RED_029_SETTLE_FAIL'],
  ['Task 6 v9 settlement raw corruption quarantines without payload parse', 'TASK6V9_RED_030_RAW_QUARANTINE'],
  ['Task 6 v9 settlement missing fresh row preserves original failure', 'TASK6V9_RED_031_MISSING_ROW'],
  ['Task 6 v9 settlement short circuits injected lease and fatal originals', 'TASK6V9_RED_032_SETTLE_SHORT'],
  ['Task 6 v9 runCommand barrier partial returns TICK_PARTIAL', 'TASK6V9_RED_033_CMD_BARRIER'],
  ['Task 6 v9 runCommand external account partial enqueues continuation after commit', 'TASK6V9_RED_034_CMD_EXTERNAL_CONTINUATION'],
  ['Task 6 v9 runCommand thenable rolls back after invocation only', 'TASK6V9_RED_035_CMD_THENABLE'],
  ['Task 6 v9 account delete skips advance and adopted success returns closure', 'TASK6V9_RED_036_CMD_DELETE_ADOPT'],
  ['Task 6 v9 advance due 61 account boundary returns partial and queues continuation', 'TASK6V9_RED_037_CMD_DUE_61'],
  ['Task 6 v9 direct completed account preserves World synchronized successor', 'TASK6V9_RED_038_DIRECT_COMPLETE'],
  ['Task 6 v9 direct established zero creates exact fallback continuation', 'TASK6V9_RED_039_DIRECT_ZERO'],
  ['Task 6 v9 retarget absent same key falls back and corrupt identity fails exact', 'TASK6V9_RED_040_DIRECT_RETARGET'],
  ['Task 6 v9 RED manifest and normalized scope reject report symlinks and extra files', 'TASK6V9_RED_041_SCOPE_MANIFEST'],
  ['Task 6 v9 implementation seal excludes report and active plan is fixed', 'TASK6V9_RED_042_SEAL']
]);
```

Task assignments are exact: 1-8 lifecycle/private seams, 9-10 cutover/CLI, 11-32 claim/downstream/store/settlement, 33-40 command/direct-account behavior, 41-42 scope/seal.

- [ ] **Step 4: Use isolated exact-name RED helper for every case**

The helper runs each case independently with a full-name anchored regex. The sentinel can only come from the one matching TAP run.

```bash
task6_name_pattern() {
  node -e 'const s = process.argv[1];
    console.log("^" + s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&") + "$");' "$1"
}
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
  pattern=$(task6_name_pattern "$test_name")
  node --test --test-isolation=none --test-reporter=tap \
    --test-name-pattern "$pattern" tools/test-scheduler.js >"$out" 2>&1
  code=$?
  escaped=$(task6_regex_escape "$test_name")
  registration=$(grep -E "^# Subtest: $escaped$" "$out")
  not_ok=$(grep -E "^not ok 1 - $escaped$" "$out")
  sentinel_count=$(grep -F "$sentinel" "$out" | wc -l | tr -d ' ')
  subtest_count=$(grep -c '^# Subtest: ' "$out")
  test_count=$(grep -E '^# tests 1$' "$out")
  if [ -n "$old_trap" ]; then eval "$old_trap"; else trap - EXIT; fi
  if [ "$had_errexit" = 1 ]; then set -e; else set +e; fi
  ok=1
  if [ "$code" -eq 0 ] || [ "$subtest_count" -ne 1 ] ||
      [ -z "$registration" ] || [ -z "$not_ok" ] ||
      [ "$sentinel_count" -lt 1 ] || [ -z "$test_count" ]; then
    ok=0
  fi
  rm -f "$out"
  if [ "$ok" -ne 1 ]; then
    printf 'RED proof failed for %s\n' "$test_name" >&2
    return 1
  fi
}
```

Invoke `task6_red_one` exactly 42 times, once per `TASK6_RED_CASES` entry. Every new test lazy-requires new Task 6 modules inside the named subtest or fixture. Loader failure that prevents the exact named TAP registration is a RED proof failure.

---

## Task 2: Lifecycle, startup recovery, timers, and private bridge

**Files:**

- Create/Modify: `server/scheduler/writer.js`
- Create/Modify: `server/scheduler/index.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: `store.acquireLease`, `store.releaseLease`, `store.recoverExpiredRunning(token,nowMs,policy)`, `store.assertAccountDependencyIntegrity(token,nowMs)`, `store.resumeOwnedRunning(token,jobId,nowMs,lockMs)`, `reducer.initializeCombatSeed(token,nowMs)`.
- Produces: `SchedulerWriter`, `taoScheduler(context)`, lifecycle states, timers, private bridge seams, committed metric ledger.

- [ ] **Step 1: Prove RED cases 1-8**

Run `task6_red_one` for cases 1-8.

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

- acquisition rollback has no committed token and clears state/timers;
- after acquisition, release lease best-effort in guarded `try/catch`; log sanitized release error but throw original startup error;
- if `stopRequested` becomes true during startup, release any committed lease, clear timers, do not arm standby poll, and end with stopped cache state;
- original fatal startup error calls `transitionStorageFatal(original)`;
- ordinary lease loss clears mutation/retry timers and arms at most one standby acquisition poll;
- lease loss during stopping/stopped/stop finalization is idempotent and does not arm another poll;
- stop clears grace, heartbeat, wake, retry, mutation, and standby poll timers;
- `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` are private non-enumerable, non-writable, non-configurable descriptors;
- `_datDatabaseClosing` sets reason `SCHEDULER_DB_CLOSED`, clears all timers, and later `getStatus` is cache-only.

---

## Task 3: Store retarget primitive, global-first claim/drain, claimed-job lifecycle, retry, and quarantine

**Files:**

- Modify: `server/scheduler/store.js`
- Create/Modify: `server/scheduler/writer.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: accepted Task5 protocol; live Store private helpers; `claimForResolution`, `claimNext`, `globalWatermarkS`, `listBarrierJobsAtOrBefore`, `resumeOwnedRunning`.
- Produces: `retargetOwnedPendingAccountAdvanceForCommand`, global-first claim/drain, claimed-job apply path, strict account partial validation, failure settlement.

- [ ] **Step 1: Prove RED cases 11-32**

Run `task6_red_one` for cases 11-32. Case 13 must fail without effective-now-before-claim. Case 19 must fail if drain claims account work while a global barrier is due.

- [ ] **Step 2: Add Store retarget primitive with corrected absent-row semantics**

Add this Task6-internal method to `server/scheduler/store.js`. It is in owned scope and included in the six-file seal.

```js
SchedulerStore.prototype.retargetOwnedPendingAccountAdvanceForCommand = function (
  token, accountId, revision, targetS, nowMs
) {
  this.assertLiveLease(token, nowMs);
  if (!Number.isSafeInteger(accountId) || accountId < 1 ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      !Number.isSafeInteger(targetS) || targetS < 0) {
    fail('ACCOUNT_ADVANCE_RETARGET_INVALID');
  }
  var key = 'account-advance:' + accountId + ':' + revision;
  var existing = this.getByIdempotencyKey(key);
  if (!existing) return null;
  var existingPayload;
  try {
    existingPayload = parseCanonicalBoundedJson(existing.payload_json, existing.payload_sha256);
    validateJob(executableInput(existing, existingPayload), {allowReconcile: true});
  } catch (error) {
    throw payloadIntegrity();
  }
  if (existing.kind !== 'ACCOUNT_ADVANCE' || existing.aggregate_type !== 'account' ||
      existing.aggregate_id !== String(accountId) ||
      Number(existing.expected_revision) !== revision ||
      existing.idempotency_key !== key ||
      Number(existing.priority) !== 100 ||
      Number(existing.max_attempts) !== 8 ||
      existing.replay_of_job_id !== null ||
      existing.source_account_id !== null) {
    fail('ACCOUNT_ADVANCE_RETARGET_INVALID');
  }
  if (existing.state !== 'PENDING' || existing.blocked_by_job_id !== null ||
      !(existing.locked_by === null ||
        existing.locked_by === token.ownerId &&
        Number(existing.locked_generation) === Number(token.generation) &&
        Number(existing.locked_until_ms) > nowMs)) {
    mutationConflict(this, token, nowMs, 'ACCOUNT_ADVANCE_RETARGET_CONFLICT');
  }
  var normalized = validateJob({kind: 'ACCOUNT_ADVANCE', scheduledAtS: targetS,
    priority: 100, idempotencyKey: key, aggregateType: 'account',
    aggregateId: String(accountId), expectedRevision: revision,
    maxAttempts: 8, replayOfJobId: null,
    payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: targetS}}, {});
  var payloadJson = canonicalJson(normalized.payload);
  var payloadHash = sha256(payloadJson);
  if (Number(existing.scheduled_at_s) === targetS &&
      existing.payload_json === payloadJson &&
      existing.payload_sha256 === payloadHash) {
    return existing;
  }
  var changed = this.db.prepare(
    "UPDATE event_jobs SET scheduled_at_s=?,payload_json=?,payload_sha256=?," +
    "updated_at_ms=? WHERE id=? AND kind='ACCOUNT_ADVANCE' " +
    "AND aggregate_type='account' AND aggregate_id=? AND expected_revision=? " +
    "AND idempotency_key=? AND state='PENDING' AND blocked_by_job_id IS NULL " +
    "AND (locked_by IS NULL OR (locked_by=? AND locked_generation=? AND locked_until_ms>?)) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(targetS, payloadJson, payloadHash, nowMs, existing.id, String(accountId),
    revision, key, token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'ACCOUNT_ADVANCE_RETARGET_CONFLICT');
  return this.getById(existing.id);
};
```

Semantics:

- absent same key returns `null`, including calls with a wrong supplied account/revision that produce a different key;
- `null` means writer may use the supported `replaceAccountAdvance` fallback once;
- a matching key whose stored payload/hash cannot parse or validate fails `PAYLOAD_INTEGRITY`;
- a matching key whose stored identity fields contradict the key fails `ACCOUNT_ADVANCE_RETARGET_INVALID`;
- a matching key in RUNNING, blocked PENDING, RETRY_WAIT, COMPLETED, CANCELLED, or QUARANTINED fails `ACCOUNT_ADVANCE_RETARGET_CONFLICT`, unless the lease has been lost, in which case `mutationConflict` yields `LEASE_LOST`;
- idempotent repeat with same target returns the existing row and preserves `id`, `idempotency_key`, `sequence`, `attempt`, and `max_attempts`.

Persistent ACCOUNT_ADVANCE has no separate logical-time columns; its logical due time is `scheduled_at_s` plus canonical payload `nextLocalAtS`. This primitive updates both consistently with `validateJob`, `canonicalJson`, and `sha256`.

- [ ] **Step 3: Implement global-first claim helpers**

Use parent ordering. Account `claimNext` is called only after global barrier logic.

```js
function barrierJobEligible(job, nowMs, nowS) {
  return job.state === 'PENDING' && Number(job.scheduled_at_s) <= nowS ||
    job.state === 'RETRY_WAIT' && Number(job.retry_at_ms) <= nowMs;
}

SchedulerWriter.prototype.claimFirstBarrierForDrain = function (
  token, nowMs, horizonS
) {
  var self = this;
  var nowS = horizonS === undefined ? Math.floor(nowMs / 1000) : horizonS;
  var rows = this.store.listBarrierJobsAtOrBefore(token, nowS, nowMs);
  if (!rows.length) return {claimed: null, blocked: false};
  var row = rows[0];
  if (row.state !== 'RUNNING' && !barrierJobEligible(row, nowMs, nowS)) {
    return {claimed: null, blocked: true, allowAccount: true};
  }
  this.callFaultHook('before-claim', row);
  var claimed = this.store.kho.trongGiaoDich(function () {
    nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
    if (row.state === 'RUNNING') {
      return self.store.resumeOwnedRunning(token, row.id, nowMs, self.leaseMs);
    }
    return self.store.claimForResolution(
      token, row.id, nowMs, self.leaseMs, {nowS: nowS}
    );
  }, {immediate: true});
  if (!claimed) return {claimed: null, blocked: true, allowAccount: row.state !== 'RUNNING'};
  this.partialIds.delete(row.id);
  this.partialQueue = this.partialQueue.filter(function (id) { return id !== row.id; });
  return {claimed: claimed, blocked: false};
};
```

Case 19 creates one due global and one earlier-looking account wake. Drain must call `claimForResolution` for the global before any `claimNext` account claim, and the already-parked preceding-root path must still produce exactly one total Store park call.

- [ ] **Step 4: Implement account claim only after global path**

Every account claim UoW records effective time before claim and uses the returned value for lock expiry.

```js
SchedulerWriter.prototype.takeNextAccountJob = function (token, nowMs, watermarkS) {
  var self = this;
  return this.store.kho.trongGiaoDich(function () {
    nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
    var remaining = self.partialQueue.length;
    while (remaining-- > 0) {
      var id = self.partialQueue.shift();
      var row = self.store.getById(id);
      var accountAllowed = row && row.kind === 'ACCOUNT_ADVANCE' &&
        (watermarkS === null || Number(row.scheduled_at_s) <= watermarkS);
      if (accountAllowed) {
        self.partialIds.delete(id);
        return self.store.resumeOwnedRunning(token, id, nowMs, self.leaseMs);
      }
      self.partialQueue.push(id);
    }
    return self.store.claimNext(token, nowMs, watermarkS, self.leaseMs);
  }, {immediate: true});
};
```

Case 13 uses a monotonic clock fixture where wall-clock moves backward between enqueue and after-claim restart. The claimed row's `locked_until_ms` must be based on `recordEffectiveNowInCurrentUow` returned time, not stale caller time, and startup recovery must classify it using the stored lock accurately.

- [ ] **Step 5: Implement drain/admission global-first loops and postcommit partial scheduling**

Drain uses `claimFirstBarrierForDrain` first, then account `takeNextAccountJob`. Postcommit scheduling is explicit:

```js
SchedulerWriter.prototype.afterCommittedPartial = function (token, outcome, nowMs) {
  if (!outcome || outcome.partial !== true) return false;
  if (outcome.jobId && this.enqueueCommittedPartial(outcome.jobId)) return true;
  if (outcome.deferredExternal === true || outcome.needsBudgetContinuation === true) {
    return this.enqueueBudgetContinuationIfDue(token, nowMs);
  }
  return false;
};
```

`enqueueBudgetContinuationIfDue` keeps parent semantics: in automatic mode it installs at most one immediate continuation; in manual drain mode it returns false and does not arm timers. Case 34 proves external ACCOUNT_ADVANCE partial with `jobId:null` and `deferredExternal:true` enqueues immediate continuation after commit in automatic mode and does not arm one in manual mode.

`settleBarriersForAdmission` is called by `runCommand` before marker/closure writes. If it returns deferred/partial, return `{deferred:true,code:'TICK_PARTIAL'}`, enqueue after commit, and do not invoke closure.

- [ ] **Step 6: Implement claimed apply skeleton and exact global branch**

`applyClaimed` opens an effect UoW, records effective now, constructs mutation, wraps execution in `world.trongMutationScheduler`, calls `before-final-fence`, and refreshes lease immediately before commit.

Global branch:

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

The preceding-root branch recognizes the already parked result from live `advanceBarrier`; writer must not call `parkGlobalBehindPreceding` again. Case 20 asserts `zeroGlobal.advanceResult` exact fields and committed `scheduler.tick` metric.

- [ ] **Step 7: Apply Task5 downstream and strict partial validation**

Order is fixed:

1. `loadExecutableJob(token,rawClaim,nowMs)` brands raw.
2. default `executionTargetS` from branded executable.
3. `markDurableMutation(token,nowMs)`.
4. global barrier before reducer for global jobs.
5. `reducer.prepare(mutation,executable,options)`.
6. prepared jobs call `store.insertApplication(...)` after `prepare`.
7. `application.alreadyApplied` validates and skips `reducer.applyPrepared`.
8. non-applied prepared jobs call `reducer.applyPrepared(mutation,prepared)`.
9. finish with accepted Store terminal methods.

Strict partial effect:

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

Partial ACCOUNT_ADVANCE uses only `checkpointPartial`, `blockOwnedAccountAdvance`, or established-zero RUNNING retention. Prepared terminals use only `finishResolved`, `completeApplied`, and `completeAccountAdvanceAndScheduleSuccessor`.

- [ ] **Step 8: Implement failure settlement short circuits and raw quarantine**

`settleClaimFailure(rawRow, originalError)` begins with exact short circuits: `INJECTED_CRASH` rethrows untouched, original `LEASE_LOST` transitions lease loss and rethrows, original fatal storage transitions storage fatal and rethrows. Only ordinary failures open fresh settlement. Raw quarantine uses no payload parse and does not change `attempt`.

---

## Task 4: Command MutationGate, direct account retarget, advance-due, bridge, and CLI

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/index.js`
- Modify: `server/scheduler/cutover.js`
- Create/Modify: `tools/scheduler-cutover.js`
- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: live `world._schedulerActive`, `world.advanceAccountNoiBo`, `kho.q.dqDenHan`, `store.retargetOwnedPendingAccountAdvanceForCommand`, parent `runCommand({name,accountId?,run})`.
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

- [ ] **Step 4: Implement direct external-only retarget/adopt/block with deferred return**

```js
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
    var retargeted = this.store.retargetOwnedPendingAccountAdvanceForCommand(
      mutation.leaseToken, Number(finalizer.accountId),
      Number(finalizer.directReceipt.revision), safeTargetS, nowMs
    );
    if (!retargeted) {
      retargeted = this.store.replaceAccountAdvance(
        mutation.leaseToken, Number(finalizer.accountId),
        Number(finalizer.directReceipt.revision), safeTargetS, nowMs
      );
    }
    if (retargeted && retargeted.blocked_by_job_id) {
      return {alreadyBlocked: true, id: retargeted.id,
        aggregate_id: retargeted.aggregate_id, scheduled_at_s: retargeted.scheduled_at_s};
    }
    adopted = this.store.adoptAccountAdvanceForCommand(
      mutation.leaseToken, finalizer.accountId, safeTargetS, nowMs, this.leaseMs
    );
    if (adopted) return adopted;
  }

  return this.ensureEstablishedZeroDirectContinuation(mutation, finalizer, nowMs);
};

SchedulerWriter.prototype.finalizeDirectAccountInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  var adopted = this.ensureDirectContinuationInCurrentUow(mutation, finalizer, nowMs);
  if (adopted.alreadyBlocked) {
    return {partial: true, deferredExternal: true, jobId: null,
      blockedAccountJobId: adopted.id, dependencyJobId: finalizer.blockedExternalJobId,
      advanceResult: finalizer.advanceResult};
  }
  if (typeof mutation.recordJob === 'function') mutation.recordJob(adopted, 'partial', nowMs);
  if (finalizer.deferredExternal === true) {
    this.store.blockOwnedAccountAdvance(
      mutation.leaseToken, adopted, finalizer.directReceipt.revision,
      finalizer.blockedExternalJobId, nowMs
    );
    return {partial: true, deferredExternal: true, jobId: null,
      blockedAccountJobId: adopted.id, dependencyJobId: finalizer.blockedExternalJobId,
      advanceResult: finalizer.advanceResult};
  }
  if (finalizer.directReceipt) {
    this.store.checkpointPartial(
      mutation.leaseToken, adopted, finalizer.directReceipt.revision, nowMs
    );
  }
  return {partial: true, deferredExternal: false, jobId: adopted.id,
    advanceResult: finalizer.advanceResult};
};
```

Case 40 exact assertions:

- absent same key, including wrong supplied account/revision that produces a different key, returns `null` and writer calls `replaceAccountAdvance` fallback once;
- matching key with invalid payload/hash fails `PAYLOAD_INTEGRITY`;
- matching key with identity fields that contradict the key fails `ACCOUNT_ADVANCE_RETARGET_INVALID`;
- matching key in RUNNING, blocked PENDING, RETRY_WAIT, COMPLETED, CANCELLED, or QUARANTINED fails `ACCOUNT_ADVANCE_RETARGET_CONFLICT`;
- live lease loss returns `LEASE_LOST`;
- successful retarget/adopt/block return has `deferredExternal:true`, `jobId:null`, `blockedAccountJobId`, and `dependencyJobId`.

- [ ] **Step 5: Implement writer-owned `advanceDueInCurrentUow` with explicit boundary partial**

```js
SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, targetS, nowMs) {
  this.world._schedulerActive(mutation);
  var rows = this.store.kho.q.dqDenHan.all(targetS, 61);
  var dueRows = rows.slice(0, 60);
  var summary = {partial: rows.length > 60, processed: 0,
    advancedToS: targetS, nextDueAtS: null, hasMoreDue: rows.length > 60,
    budgetExhausted: false, deferredExternal: false,
    blockedExternalJobId: null, saveReceipt: null};
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
    if (one.partial || summary.budgetExhausted || summary.deferredExternal) {
      summary.partial = true;
      summary.hasMoreDue = true;
      break;
    }
  }
  return summary;
};
```

`runCommand` branch for advance-due:

```js
if (command.name === 'advance-due') {
  due = self.advanceDueInCurrentUow(mutation, nowS, nowMs);
  if (due.partial || due.hasMoreDue || due.budgetExhausted || due.deferredExternal) {
    if (mutation.commandAccountFinalizer) {
      finalized = self.finalizeCommandAccountInCurrentUow(
        mutation, mutation.commandAccountFinalizer, nowMs
      );
    }
    return {response: {deferred: true, code: 'TICK_PARTIAL'},
      partialJobId: finalized && finalized.jobId || null,
      needsBudgetContinuation: true,
      metricOutcome: due};
  }
}
```

Case 37 creates 61 due accounts in deterministic `keTiep,tk` order and asserts exact summary fields: `partial:true`, `hasMoreDue:true`, `budgetExhausted:false` unless budget actually exhausts, `deferredExternal:false` unless an external dependency occurs, `processed` equals the first 60 processed total, closure count `0`, response `{deferred:true,code:'TICK_PARTIAL'}`, and postcommit continuation queued.

- [ ] **Step 6: Implement `runCommand` with global-first admission and honest thenable semantics**

Required flow:

- use internally derived monotonic `nowMs`;
- call `settleBarriersForAdmission` before marker/closure writes;
- every command UoW calls `markDurableMutationInCurrentUow` before command writes;
- account-delete calls closure immediately after marker and does not auto-advance;
- advance-due calls writer-owned `advanceDueInCurrentUow`;
- inspect command account/advance-due outcome; if partial/deferred, persist `{deferred:true,code:'TICK_PARTIAL'}`, finalize any account finalizer, enqueue partial/continuation after commit, and never invoke closure;
- if command closure returns a thenable, throw `UNIT_OF_WORK_ASYNC` after invocation; rollback after invocation is all that can be guaranteed;
- `callFaultHook('before-final-fence', null)` runs before `refreshLeasePhaseInCurrentUow('before-command-commit',token,nowMs)`;
- `flushCommittedMetricLedger(committed.metricLedger)` runs only after commit;
- after commit, if `partialJobId` is non-null, call `enqueueCommittedPartial(partialJobId)`; if `partialJobId` is null and either `deferredExternal:true` or `needsBudgetContinuation:true`, call `enqueueBudgetContinuationIfDue(token,effectiveNowMs)` unless manual mode suppresses automatic continuation.

- [ ] **Step 7: Implement cutover and CLI exact surfaces**

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

The report includes these six hashes, verification outputs, RED proof summary, inventory helper hash, scope checks, and the fact that review binding is to the six-file seal plus external V9 plan hash only. The report does not include its own hash.

- [ ] **Step 4: Normalized inventory checks with report path type guards**

Before allowlist comparison, reject report symlinks:

```bash
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
test -f docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
test ! -L docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
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
  'docs/superpowers/reports',
  'docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md',
}
expected_fixed = {
  'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v9.md',
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

Case 41 explicitly creates a symlink at `docs/superpowers/reports` in a temp fixture and a symlink report file in another temp fixture; both guard commands must reject them before the allowlist comparison runs.

- [ ] **Step 5: Launch two fresh Sol/high reviews over exact seals**

Send reviewers:

- V9 plan path and external hash from `/tmp/task6-active-plan.sha256`,
- inventory helper hash from `/tmp/task6-inventory-functions.sha256`,
- six implementation/test paths and hashes from `/tmp/task6-six-file-sha256.txt`,
- verification outputs,
- normalized inventory/forbidden diff result,
- exact report path.

Any change to the six sealed files or V9 plan invalidates both approvals and requires rerunning verification, recomputing six hashes, and launching two new fresh Sol/high reviews.

- [ ] **Step 6: Finalize report and rerun final checks**

Approvals may be recorded in the report after review because review binding is to the six implementation/test hashes, inventory helper hash, and external V9 plan hash. If report text changes after approval, rerun:

```bash
sha256sum -c /tmp/task6-six-file-sha256.txt
sha256sum -c /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-inventory-functions.sha256
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
test -f docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
test ! -L docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
. /tmp/task6-inventory-functions.sh
task6_inventory > /tmp/task6-final-inventory.tsv
rg -n '[[:blank:]]+$' docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

Repeat the normalized inventory comparison with `/tmp/task6-final-inventory.tsv`. If any six-file hash, plan hash, or inventory helper hash differs, discard reviews and restart Task 5.

## Self-audit checklist

- Direct external-blocked finalizer returns carry `deferredExternal:true` and dependency/job fields.
- Postcommit code queues a budget continuation for `partialJobId:null` plus `deferredExternal:true` outside manual mode.
- Advance-due 61 boundary summary carries `partial:true`; command closure count is zero and response is `TICK_PARTIAL`.
- Retarget absent same key returns `null`; matching corrupt identity is invalid/integrity; conflicting matching state is conflict.
- Report directory and report file are verified as non-symlink real dir/file before allowlist comparison.
- RED helper runs each case with anchored exact `--test-name-pattern`, verifies `# tests 1`, and requires the sentinel in that exact run.
- Manifest is exactly 42 unique `TASK6V9_RED_*` sentinels, with cases 1-42 assigned as stated.
- Plan has no self-hash requirement; external `/tmp/task6-active-plan.sha256` is authoritative.

## Completion definition

- V1-V8 plans are preserved.
- V9 active plan hash is pinned externally and remains fixed through final handoff.
- Exactly 42 new tests are added and proven RED by exact TAP subtest name and sentinel using anchored `--test-name-pattern`; final suite arithmetic is 205 total tests.
- Store retarget primitive handles direct external-only same-key wake retargets atomically and lease-fenced with corrected absent-row semantics.
- Drain/admission are global-first and never omit due global jobs.
- Claimed-job execution follows Task 5 lines 825-833 exactly.
- Partial account effects enforce strict plain-object/key/identity contract.
- `ACCOUNT_ADVANCE` cancellation is terminalized before any deferred success finalizer.
- Direct account commands use normal World save options, preserve direct completed successor, handle established-zero fallback, retarget dependency-safe external-only fallback wakes, return `deferredExternal:true` for blocked external partials, and never commit a missing continuation.
- `advance-due` is Task 6 writer-owned, uses `dqDenHan` limit+1 plus `world.advanceAccountNoiBo`, and treats the 61-account boundary as command partial.
- `advanceBarrier` preceding-root path causes exactly one Store park call, owned by AdvanceService.
- Every command/effect/settlement/recovery UoW performs a final live-lease fence immediately before commit.
- Startup recovery conditionally marks durable for recovered rows, asserts dependency integrity, stages resumed rows until commit, and publishes queues after commit.
- Raw quarantine does not parse payload and does not change attempt.
- CLI exports exactly `parseArgs`, `runCli`, and `main`, with the stated `require.main` call.
- Scope checks prove no non-owned tracked, untracked, mode-only, type, directory, file, or symlink change except exact non-symlink report directory/report.
- Report has no self-hash. Two fresh Sol/high approvals bind to exact six implementation/test hashes, external V9 plan hash, and inventory helper hash.
