# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V10

> **For implementation agents:** use `superpowers:executing-plans` before source work. This file is immutable once handed off. Preserve V1-V9 and do not edit this plan after pinning its external hash.

**Goal:** implement Task 6 writer lifecycle, global-first drain, global watermark, retry/backoff/quarantine, command MutationGate, direct-account continuation, cutover CLI, and lifecycle seams on top of accepted Tasks 1-5.

**Architecture:** one leased `SchedulerWriter` owns durable scheduler writes. Every scheduler mutation runs in the existing immediate SQLite UoW and inside `world.trongMutationScheduler(mutation, fn)`. Task 6 consumes Task 5 reducer/store protocol literally and adds only Task6-owned Store/writer/CLI primitives.

**Spec:** parent Task 6 in `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` beginning at line 10866, especially parent writer snippets around lines 13318-14897, plus accepted Task 5 downstream protocol lines 823-833 in `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`.

## Direct inspection baseline

V10 was authored after direct inspection of live code:

- `server/world.js` has `trongMutationScheduler(mutation, fn)`, `_schedulerActive(mutation)`, and `advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)`. It has no `advanceDueNoiBo`. `world._dongBoSchedulerLuu` calls `store.replaceAccountAdvance(token, accountId, revision, nextAtS, nowMs)` unless `deferAccountWake` is true.
- `server/db.js` has `dqDenHan`: `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?`.
- `server/scheduler/advance-service.js` has `advanceTo(mutation, accountId, targetS, saveOptions)` and `advanceBarrier(mutation, executableJob)`. `advanceBarrier` already calls `store.parkGlobalBehindPreceding(...)` when a preceding root is discovered and returns an advance result carrying internal `blockedExternal:true` and `blockedExternalJobId`.
- `server/scheduler/reducers.js` exposes `initializeCombatSeed(leaseToken, effectiveNowMs)`, `prepare(mutation, executableJob, options)`, and `applyPrepared(mutation, prepared)` with arity 2.
- `server/scheduler/store.js` live claim APIs are `claimNext(token, nowMs, watermarkS, lockMs)`, `claimForResolution(token, jobId, nowMs, lockMs, options)`, `resumeOwnedRunning(token, jobId, nowMs, lockMs)`, `listBarrierJobsAtOrBefore(token, targetS, nowMs)`, `replaceAccountAdvance(token, accountId, revision, nextLocalAtS, nowMs)`, and `blockOwnedAccountAdvance(token, job, checkpointRevision, blockedByJobId, nowMs)`.
- `replaceAccountAdvance` early-returns any PENDING blocked `ACCOUNT_ADVANCE` for that account, even when the block belongs to an unrelated dependency. The writer must never accept that row without exact dependency validation.
- `resumeOwnedRunning` extends only an already owned RUNNING row whose `locked_until_ms > nowMs`, so startup recovery must rebase staged owned rows immediately before commit with a fresh effective time.
- Store private helpers available in `store.js` include `validateJob`, `canonicalJson`, `sha256`, `parseCanonicalBoundedJson`, `executableInput`, `payloadIntegrity`, `mutationConflict`, `requiredMutation`, `optionalMutation`, and `fail`.
- Live Node accepts `node --test --test-isolation=none --test-reporter=tap --test-name-pattern '^exact name$' tools/test-scheduler.js` and reports exactly one matching subtest when the name is unique.

## Global constraints

- Preserve all earlier plan artifacts V1-V9.
- This plan allows source edits only in these six Task6-owned files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task7+ edits: do not modify `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, `js/*.js`, or `web/js/mp.js`.
- Do not add `TheGioi.prototype.advanceDueNoiBo`; Task 6 owns `SchedulerWriter.prototype.advanceDueInCurrentUow`.
- Existing accepted scheduler baseline is 163 tests. This plan adds exactly 42 tests, so expected final scheduler output is 205 tests, 204 passed, 0 failed, and 1 known environment skip. If a fresh pre-edit baseline differs, record the command output and recompute the arithmetic explicitly.
- Public bridge enumerable keys remain exactly `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`. Add `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` only as private non-enumerable properties/descriptors. Include reason `SCHEDULER_DB_CLOSED`.
- Do not embed the V10 plan hash in this file. After the file is frozen, implementation preflight must run:

```bash
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v10.md \
  > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

## V10 correction ledger

1. Retarget validates any matching-key persisted row through live canonical validation first; persisted identity/canonical contradictions map to `PAYLOAD_INTEGRITY`. `ACCOUNT_ADVANCE_RETARGET_INVALID` is reserved only for invalid caller arguments before any persisted row is inspected.
2. `ensureEstablishedZeroDirectContinuation(mutation, finalizer, nowMs)` is defined explicitly with live Store calls and testable return semantics.
3. External fallback validates `replaceAccountAdvance` early-return rows before use. A blocked row is accepted only when its account/revision/key, `blocked_by_job_id`, payload, and scheduled time exactly match the expected dependency. An unrelated pre-existing block A while command dependency B is needed produces `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT` and rolls back; no dependency B is synthesized.
4. Startup recovery stages owned RUNNING ids, then immediately before commit refreshes effective time, rebases every staged RUNNING row with `resumeOwnedRunning(token, id, freshNow, leaseMs)`, fences again, and asserts every rebased lock is live at the final effective time. No partial/retry timer is armed before commit.
5. Global claim eligibility and list selection are recomputed inside the claim UoW after `recordEffectiveNowInCurrentUow` returns the monotonic effective time. No pre-effective list decision is used for global jobs.
6. All V1-V9 corrections remain binding: Task5 downstream order, strict partial wrapper, prepared-before-idempotency, global already-parked recognition, zero-global metric, fatal settlement semantics, raw quarantine without payload parse, runCommand partial responses, command thenable honesty, direct account save options, 61-account due boundary, private seams/timers, exact CLI, normalized inventory guards, no report self-hash, and two fresh Sol/high reviews over sealed six-file hashes.

---

## Task 1: Preflight, exact RED manifest, and normalized inventory

**Files:**

- Modify later: `tools/test-scheduler.js`
- Temp only: `/tmp/task6-active-plan.sha256`, `/tmp/task6-inventory-functions.sh`, `/tmp/task6-inventory-functions.sha256`, `/tmp/task6-pre-inventory.tsv`, `/tmp/task6-pre-forbidden.tsv`

### Step 1: pin the active plan externally

Run before any source/test edit:

```bash
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v10.md \
  > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

After this point the plan is not in the mutable allowlist. Any change to this V10 file invalidates all RED proof, implementation review, and final seals.

### Step 2: create the untracked-aware inventory helper

Create the helper under `/tmp`; source it for every pre/post/final inventory block:

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

Inventory columns are `path`, `type`, `tracked_mode`, `fs_mode`, `size`, `content_sha256`, `symlink_target_sha256`, and `symlink_target`. The helper records filenames and directory names with `lstat`, records directory symlinks without traversing them, records tracked mode from `git ls-files --stage`, and detects mode-only changes. Empty directories are not Git repository content; this scope proof is for files, symlinks, types, modes, contents, deletions, and arbitrary untracked non-empty additions. Case 41 covers directory-symlink target mutation/addition.

### Step 3: add exactly 42 lazy RED tests

Add this manifest to `tools/test-scheduler.js`. Each test lazy-requires new Task 6 modules inside the named subtest so missing modules register all test names.

```js
var TASK6_RED_CASES = Object.freeze([
  ['Task 6 v10 writer rejects legacy mode before lease', 'TASK6V10_RED_001_LEGACY'],
  ['Task 6 v10 startup acquisition rollback arms no poll while stopping', 'TASK6V10_RED_002_STARTUP_ROLLBACK'],
  ['Task 6 v10 startup committed lease release preserves original failure', 'TASK6V10_RED_003_STARTUP_RELEASE'],
  ['Task 6 v10 startup recovery rebases nearly expired locks before commit', 'TASK6V10_RED_004_STARTUP_REBASE'],
  ['Task 6 v10 heartbeat transient rearms and generation loss keeps one poll', 'TASK6V10_RED_005_HEARTBEAT'],
  ['Task 6 v10 lease loss during stop finalization is idempotent', 'TASK6V10_RED_006_LEASE_STOP'],
  ['Task 6 v10 shutdown admission fence drains captured tail with bounded grace', 'TASK6V10_RED_007_SHUTDOWN'],
  ['Task 6 v10 private lifecycle seams are non enumerable and db close cache only', 'TASK6V10_RED_008_PRIVATE'],
  ['Task 6 v10 runMaintenanceCutover fresh only lease audit and release', 'TASK6V10_RED_009_CUTOVER'],
  ['Task 6 v10 scheduler cutover CLI exports exact surface and closes kho', 'TASK6V10_RED_010_CLI'],
  ['Task 6 v10 claim brands raw row before target default', 'TASK6V10_RED_011_BRAND'],
  ['Task 6 v10 before claim crash leaves no running row', 'TASK6V10_RED_012_BEFORE_CLAIM'],
  ['Task 6 v10 after claim crash uses effective lock time and global due recompute', 'TASK6V10_RED_013_AFTER_CLAIM_CLOCK'],
  ['Task 6 v10 after application crash restarts without duplicate effect', 'TASK6V10_RED_014_AFTER_APP'],
  ['Task 6 v10 after effect crash rolls back application and world state', 'TASK6V10_RED_015_AFTER_EFFECT'],
  ['Task 6 v10 before final fence generation flip rolls back effect UoW', 'TASK6V10_RED_016_FINAL_FENCE'],
  ['Task 6 v10 already applied restart skips effect and terminalizes once', 'TASK6V10_RED_017_REPLAY'],
  ['Task 6 v10 stale generation effect fails before commit', 'TASK6V10_RED_018_STALE_GENERATION'],
  ['Task 6 v10 global first drain claims barrier inside UoW before account', 'TASK6V10_RED_019_GLOBAL_FIRST'],
  ['Task 6 v10 zero budget global synthesizes exact advance metric', 'TASK6V10_RED_020_ZERO_GLOBAL'],
  ['Task 6 v10 account partial effect shape and identity are exact', 'TASK6V10_RED_021_PARTIAL_SHAPE'],
  ['Task 6 v10 account partial blocked external uses advanceResult dependency', 'TASK6V10_RED_022_PARTIAL_BLOCK'],
  ['Task 6 v10 established zero partial retains running lock unchanged', 'TASK6V10_RED_023_ESTABLISHED_ZERO'],
  ['Task 6 v10 prepared global charges primitive once before idempotency insert', 'TASK6V10_RED_024_GLOBAL_CHARGE'],
  ['Task 6 v10 prepared replay validates application and skips second effect', 'TASK6V10_RED_025_REPLAY_CHARGE'],
  ['Task 6 v10 terminal mapping uses only accepted Store methods', 'TASK6V10_RED_026_TERMINAL'],
  ['Task 6 v10 account cancelled terminal is not deferred and returns afterCancel', 'TASK6V10_RED_027_ACCOUNT_CANCEL'],
  ['Task 6 v10 deferred completed account records advance once before finalizer', 'TASK6V10_RED_028_DEFER_METRIC'],
  ['Task 6 v10 settlement reloads executable then Store fail', 'TASK6V10_RED_029_SETTLE_FAIL'],
  ['Task 6 v10 settlement raw corruption quarantines without payload parse', 'TASK6V10_RED_030_RAW_QUARANTINE'],
  ['Task 6 v10 settlement missing fresh row preserves original failure', 'TASK6V10_RED_031_MISSING_ROW'],
  ['Task 6 v10 settlement short circuits injected lease and fatal originals', 'TASK6V10_RED_032_SETTLE_SHORT'],
  ['Task 6 v10 runCommand barrier partial returns TICK_PARTIAL', 'TASK6V10_RED_033_CMD_BARRIER'],
  ['Task 6 v10 runCommand external account partial enqueues continuation after commit', 'TASK6V10_RED_034_CMD_EXTERNAL_CONTINUATION'],
  ['Task 6 v10 runCommand thenable rolls back after invocation only', 'TASK6V10_RED_035_CMD_THENABLE'],
  ['Task 6 v10 account delete skips advance and adopted success returns closure', 'TASK6V10_RED_036_CMD_DELETE_ADOPT'],
  ['Task 6 v10 advance due 61 account boundary returns partial and queues continuation', 'TASK6V10_RED_037_CMD_DUE_61'],
  ['Task 6 v10 direct completed account preserves World synchronized successor', 'TASK6V10_RED_038_DIRECT_COMPLETE'],
  ['Task 6 v10 direct established zero creates exact fallback continuation', 'TASK6V10_RED_039_DIRECT_ZERO'],
  ['Task 6 v10 direct external retarget validates same dependency and rejects unrelated block', 'TASK6V10_RED_040_DIRECT_RETARGET'],
  ['Task 6 v10 RED manifest and normalized scope reject report symlinks and extra files', 'TASK6V10_RED_041_SCOPE_MANIFEST'],
  ['Task 6 v10 implementation seal excludes report and active plan is fixed', 'TASK6V10_RED_042_SEAL']
]);
```

Assignments are exact: 1-8 lifecycle/private seams, 9-10 cutover/CLI, 11-32 claim/downstream/store/settlement, 33-40 command/direct-account behavior, 41-42 scope/seal.

### Step 4: prove RED per exact test name

Run each case independently. A loader failure, wrong name, wrong sentinel, or more than one selected subtest fails the proof.

```bash
task6_name_pattern() {
  node -e 'const s = process.argv[1];
    console.log("^" + s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&") + "$");' "$1"
}
task6_red_one() (
  test_name=$1
  sentinel=$2
  old_exit_trap=$(trap -p EXIT || true)
  case $- in *e*) had_errexit=1 ;; *) had_errexit=0 ;; esac
  out=$(mktemp "${TMPDIR:-/tmp}/task6-red.XXXXXX")
  restore_task6_shell() {
    rm -f "$out"
    if [ -n "$old_exit_trap" ]; then eval "$old_exit_trap"; else trap - EXIT; fi
    if [ "$had_errexit" -eq 1 ]; then set -e; else set +e; fi
  }
  trap 'restore_task6_shell' EXIT
  pattern=$(task6_name_pattern "$test_name")
  set +e
  node --test --test-isolation=none --test-reporter=tap \
    --test-name-pattern "$pattern" tools/test-scheduler.js >"$out" 2>&1
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "expected RED but passed: $test_name" >&2
    sed -n '1,160p' "$out" >&2
    exit 1
  fi
  if ! grep -Eq '^# tests 1$' "$out"; then
    echo "exact-name pattern did not select exactly one subtest: $test_name" >&2
    sed -n '1,200p' "$out" >&2
    exit 1
  fi
  if ! grep -Fq "$sentinel" "$out"; then
    echo "sentinel missing from selected RED subtest: $sentinel" >&2
    sed -n '1,200p' "$out" >&2
    exit 1
  fi
  if ! grep -Fq "not ok 1 - $test_name" "$out"; then
    echo "selected TAP subtest did not fail with exact name: $test_name" >&2
    sed -n '1,200p' "$out" >&2
    exit 1
  fi
  exit 0
)
```

Invoke `task6_red_one "${name}" "${sentinel}"` exactly 42 times from `TASK6_RED_CASES`. Do not use `>=1` failure counts. Do not use a broad `node tools/test-scheduler.js` RED run as acceptance evidence.

---

## Task 2: lifecycle, startup recovery, timers, and private bridge

**Files:** `server/scheduler/writer.js`, `server/scheduler/index.js`, `tools/test-scheduler.js`

### Step 1: prove RED cases 1-8

Run `task6_red_one` for cases 1-8.

### Step 2: implement lifecycle states and private seams

States/reasons are lowercase state strings plus exact `SCHEDULER_*` reasons:

- `legacy/SCHEDULER_MODE_LEGACY`
- `standby/SCHEDULER_LEASE_UNHELD`
- `recovering/SCHEDULER_RECOVERING`
- `ready/SCHEDULER_READY`
- `stopping/SCHEDULER_DRAINING` or `SCHEDULER_STOP_GRACE_EXPIRED`
- `stopped/SCHEDULER_STOPPED`
- `fatal/SCHEDULER_STORAGE_FATAL`
- `standby/SCHEDULER_STARTUP_FAILED`
- `standby/SCHEDULER_LEASE_LOST`
- `stopped/SCHEDULER_DB_CLOSED`

`server/scheduler/index.js` exports the bridge with exactly enumerable public keys:

```js
var bridge = {
  advanceTo: writer.advanceTo.bind(writer),
  cancel: writer.cancel.bind(writer),
  getStatus: writer.getStatus.bind(writer),
  reconcile: writer.reconcile.bind(writer),
  runCommand: writer.runCommand.bind(writer),
  schedule: writer.schedule.bind(writer),
  start: writer.start.bind(writer),
  stop: writer.stop.bind(writer)
};
Object.defineProperties(bridge, {
  _datSignalHandlerInstalled: {value: false, writable: true, configurable: true, enumerable: false},
  _waitForStopFinalization: {value: function () { return writer.stopFinalizePromise || Promise.resolve(); }, enumerable: false},
  _beginStop: {value: writer.beginStop.bind(writer), enumerable: false},
  _datDatabaseClosing: {value: function () {
    writer.dbOpen = false;
    writer.clearAllTimers();
    writer.accepting = false;
    writer.ready = false;
    writer.state = 'stopped';
    writer.reason = 'SCHEDULER_DB_CLOSED';
  }, enumerable: false}
});
```

Tests assert descriptor enumerability and that `Object.keys(bridge).join(',')` is unchanged.

### Step 3: implement startup sequence with fresh rebase

Startup order is exact:

1. Reject fatal/crashed/stopped immediately.
2. If scheduler mode is not durable, set `legacy/SCHEDULER_MODE_LEGACY` and do not acquire.
3. Enter `recovering`; open one immediate UoW.
4. Compute `candidateNow = store.peekEffectiveNowMs(wallNowMs)`.
5. `token = store.acquireLease(ownerId, candidateNow, leaseMs)`. If null, commit no changes, become standby, arm exactly one acquisition poll.
6. `effective = recordEffectiveNowInCurrentUow(token, candidateNow)`.
7. `reducer.initializeCombatSeed(token, effective)`.
8. `store.assertAccountDependencyIntegrity(token, effective)`.
9. `recovered = store.recoverExpiredRunning(token, effective, retryPolicy())`; call `store.markDurableMutation(token, effective)` only when `recovered > 0`.
10. Stage owned RUNNING ids using a new Task6 Store helper:

```js
SchedulerStore.prototype.listOwnedRunningForRecovery = function (token, nowMs) {
  this.assertLiveLease(token, nowMs);
  return this.db.prepare(
    "SELECT id FROM event_jobs WHERE state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? AND blocked_by_job_id IS NULL " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
  ).all(token.ownerId, token.generation, nowMs).map(function (row) { return row.id; });
};
```

11. No `enqueuePartial`, retry timer, wake timer, heartbeat, or poll is armed inside this UoW.
12. Immediately before commit, refresh effective time and rebase every staged id:

```js
freshNow = self.refreshLeasePhaseInCurrentUow('before-recovery-rebase', token, effective);
rebasedRows = stagedIds.map(function (id) {
  var row = self.store.resumeOwnedRunning(token, id, freshNow, self.leaseMs);
  if (!row) throw schedulerError('RECOVERY_RESUME_REBASE_LOST');
  return row;
});
finalNow = self.refreshLeasePhaseInCurrentUow('before-recovery-commit', token, freshNow);
rebasedRows.forEach(function (row) {
  if (Number(row.locked_until_ms) <= finalNow) {
    throw schedulerError('RECOVERY_RESUME_REBASE_EXPIRED');
  }
});
acquired = {token: token, nowMs: finalNow, resumedRows: rebasedRows, recovered: recovered};
```

The second final fence may observe a later monotonic time than the rebase. That is valid only if every rebased row remains locked beyond that final time. Case 4 advances the fake clock to `leaseMs - 1` before the rebase hook and by `+2ms` before the final fence; after commit, every staged row remains resumable/live.

13. After commit only: assign `this.leaseToken = token`, log recovery quarantine warnings, publish `resumedRows` to `enqueuePartial` once per id, schedule heartbeat/wake/poll/reconcile timers, and become ready.

Startup failure unwind:

```js
SchedulerWriter.prototype.unwindStartupFailure = function (token, error) {
  this.clearMutationTimers();
  this.accepting = false;
  this.ready = false;
  this.recoveryComplete = false;
  if (token && this.dbOpen) {
    try {
      var releaseAt = this.effectiveNowMs();
      this.store.kho.trongGiaoDich(function () {
        this.store.releaseLease(token, releaseAt);
      }.bind(this), {immediate: true});
    } catch (releaseError) {
      this.log('warn', 'scheduler.start_release_failed', {
        code: this.store.safeErrorMessage(releaseError && releaseError.code)
      });
    }
  }
  this.leaseToken = null;
  if (this.stopRequested) {
    this.state = 'stopped';
    this.reason = 'SCHEDULER_STOPPED';
  } else if (error && error.code === 'LEASE_LOST') {
    this.transitionLeaseLost(error);
  } else if (isFatalStorageError(error)) {
    this.transitionStorageFatal(error);
  } else {
    this.state = 'standby';
    this.reason = 'SCHEDULER_STARTUP_FAILED';
    if (this.dbOpen && !this.manualDrain && !this.stopRequested) this.schedulePoll();
  }
  throw error;
};
```

The compensating release is catch/log only; it never replaces the original startup error.

### Step 4: implement timer semantics

- Heartbeat transient storage errors (`SQLITE_BUSY`, `SQLITE_LOCKED`, `SQLITE_IOERR`, `ETIMEDOUT`) log and rearm heartbeat once while ready.
- Lease generation loss calls `transitionLeaseLost`. It clears mutation/retry/wake/heartbeat timers, leaves exactly one standby acquisition poll, and does not accumulate polls.
- `transitionLeaseLost` is idempotent when stopping/stopped/stop finalization is active. Late lease errors during finalization must not resurrect standby.
- `stop()` synchronously closes admission, captures the current tail, clears every timer including standby poll and grace timer on finalization, releases only a live token, and exposes bounded grace. A grace timeout leaves finalization running; `_waitForStopFinalization` observes its eventual result.

---

## Task 3: Store primitives, global-first claim, Task5 downstream, and settlement

**Files:** `server/scheduler/store.js`, `server/scheduler/writer.js`, `tools/test-scheduler.js`

### Step 1: prove RED cases 11-32

Run `task6_red_one` for cases 11-32.

### Step 2: implement exact retarget and blocked-dependency validation

Add two Task6-owned Store methods.

#### `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)`

Contract:

- Validate caller arguments first; invalid account/revision/target/time throws `ACCOUNT_ADVANCE_RETARGET_INVALID`.
- Build key `account-advance:<accountId>:<revision>`.
- Query by idempotency key. If absent, return `null`. This includes wrong supplied account/revision that produce a different key.
- Validate the matching persisted row before any state-specific decision:

```js
var payload, validated;
try {
  payload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
  validated = validateJob(executableInput(row, payload), {allowReconcile: true});
} catch (error) {
  throw payloadIntegrity();
}
if (validated.kind !== 'ACCOUNT_ADVANCE' ||
    validated.aggregateType !== 'account' ||
    Number(validated.aggregateId) !== accountId ||
    Number(validated.expectedRevision) !== revision ||
    validated.idempotencyKey !== key ||
    Number(validated.payload.accountId) !== accountId) {
  throw payloadIntegrity();
}
```

Any matching-key canonical contradiction, payload/hash corruption, aggregate mismatch, revision mismatch, idempotency-key contradiction, or ACCOUNT_ADVANCE payload mismatch is `PAYLOAD_INTEGRITY`. Do not test or document `ACCOUNT_ADVANCE_RETARGET_INVALID` for persisted identity corruption.

- After successful validation, conflicting persisted state is `ACCOUNT_ADVANCE_RETARGET_CONFLICT`: state not `PENDING`, `blocked_by_job_id IS NOT NULL`, terminal row, retry row, or running row. Lease loss remains `LEASE_LOST` through `mutationConflict`.
- If the row is already the exact target schedule/payload/hash, return it idempotently after a live lease fence.
- Otherwise regenerate canonical payload with live helpers:

```js
var normalized = validateJob({
  kind: 'ACCOUNT_ADVANCE',
  scheduledAtS: targetS,
  priority: 100,
  idempotencyKey: key,
  aggregateType: 'account',
  aggregateId: String(accountId),
  expectedRevision: revision,
  maxAttempts: 8,
  payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: targetS}
});
var payloadJson = canonicalJson(normalized.payload);
var payloadHash = sha256(payloadJson);
```

- Atomic SQL fence:

```sql
UPDATE event_jobs
SET scheduled_at_s=?, payload_json=?, payload_sha256=?, updated_at_ms=?
WHERE id=? AND idempotency_key=? AND kind='ACCOUNT_ADVANCE'
  AND aggregate_type='account' AND aggregate_id=? AND expected_revision=?
  AND state='PENDING' AND blocked_by_job_id IS NULL
  AND locked_by IS NULL AND locked_generation IS NULL AND locked_until_ms IS NULL
  AND EXISTS (
    SELECT 1 FROM scheduler_lease
    WHERE lease_name='global-writer'
      AND owner_id=? AND generation=? AND expires_at_ms>?
  )
```

If changes are not 1, call `mutationConflict(this, token, nowMs, 'ACCOUNT_ADVANCE_RETARGET_CONFLICT')`. Preserve id, sequence, idempotency key, attempt, max attempts, source fields, replay fields, and history. Return the reloaded row.

#### `validateBlockedAccountAdvanceForDependency(token, rowOrId, accountId, revision, targetS, dependencyJobId, nowMs)`

This method exists because live `replaceAccountAdvance` may return an unrelated blocked row.

Contract:

- Validate scalar arguments; invalid input throws `ACCOUNT_ADVANCE_DEPENDENCY_INVALID`.
- Assert live lease.
- Reload by `rowOrId.id || rowOrId`; absent returns `null` only when the caller supplied `null`; otherwise throws `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`.
- Parse/hash/validate row using `parseCanonicalBoundedJson` and `validateJob(executableInput(row,payload), {allowReconcile:true})`. Any payload/hash/canonical contradiction throws `PAYLOAD_INTEGRITY`.
- Require exact identity:
  - `kind === 'ACCOUNT_ADVANCE'`
  - `aggregate_type === 'account'`
  - `Number(aggregate_id) === accountId`
  - `Number(expected_revision) === revision`
  - `idempotency_key === 'account-advance:' + accountId + ':' + revision`
  - `state === 'PENDING'`
  - `blocked_by_job_id === dependencyJobId`
  - `Number(scheduled_at_s) === targetS`
  - validated payload has `accountId` and `nextLocalAtS === targetS`
- Require the dependency row exists, is a root `PVP_RESOLVE` or `EXTERNAL_RESOLVE`, has `source_account_id === accountId`, is not terminal, and `Number(row.scheduled_at_s) <= Number(dependency.scheduled_at_s)`.
- If `blocked_by_job_id` is non-null but differs from `dependencyJobId`, throw `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`.
- Return the reloaded raw row only after all checks pass.

Case 40 assertions:

- Absent same-key row returns `null` from retarget and writer calls the supported `replaceAccountAdvance` fallback.
- Matching-key invalid payload/hash or canonical identity contradiction throws `PAYLOAD_INTEGRITY`.
- Matching-key RUNNING, blocked PENDING, RETRY_WAIT, COMPLETED, CANCELLED, or QUARANTINED throws `ACCOUNT_ADVANCE_RETARGET_CONFLICT`.
- Lease loss throws `LEASE_LOST`.
- Live World creates same-key local wake; retarget moves it to dependency-safe `targetS`, preserves id/sequence/idempotency/attempt, then writer adopts and blocks it.
- If `replaceAccountAdvance` returns unrelated blocked row A while current command needs dependency B, `validateBlockedAccountAdvanceForDependency` throws `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`, the UoW rolls back, and no dependency B success is reported.

### Step 3: implement global-first claim with effective-now inside UoW

`claimFirstBarrierForDrain` must not call `listBarrierJobsAtOrBefore` before `recordEffectiveNowInCurrentUow`. Pseudocode:

```js
SchedulerWriter.prototype.claimFirstBarrierForDrain = function (token, callerNowMs, horizonS) {
  var self = this;
  return this.store.kho.trongGiaoDich(function () {
    var nowMs = self.recordEffectiveNowInCurrentUow(token, callerNowMs);
    var nowS = horizonS === undefined ? Math.floor(nowMs / 1000) : horizonS;
    var rows = self.store.listBarrierJobsAtOrBefore(token, nowS, nowMs);
    if (!rows.length) return {claimed: null, blocked: false, allowAccount: true};
    var row = rows[0];
    var runningOwned = row.state === 'RUNNING' &&
      row.locked_by === token.ownerId &&
      Number(row.locked_generation) === Number(token.generation) &&
      Number(row.locked_until_ms) > nowMs;
    var due = row.state === 'PENDING' && Number(row.scheduled_at_s) <= nowS ||
      row.state === 'RETRY_WAIT' && Number(row.retry_at_ms) <= nowMs;
    if (!runningOwned && row.state === 'RUNNING') {
      return {claimed: null, blocked: true, allowAccount: false, blockingJobId: row.id};
    }
    if (!runningOwned && !due) {
      return {claimed: null, blocked: true, allowAccount: true, blockingJobId: row.id};
    }
    self.callFaultHook('before-claim', row);
    var claimed = runningOwned ?
      self.store.resumeOwnedRunning(token, row.id, nowMs, self.leaseMs) :
      self.store.claimForResolution(token, row.id, nowMs, self.leaseMs, {nowS: nowS});
    if (!claimed) return {claimed: null, blocked: true, allowAccount: false, blockingJobId: row.id};
    self.partialIds.delete(row.id);
    self.partialQueue = self.partialQueue.filter(function (id) { return id !== row.id; });
    return {claimed: claimed, blocked: false, allowAccount: false};
  }, {immediate: true});
};
```

Drain loop order:

1. Require ready lease.
2. Call `claimFirstBarrierForDrain(token, nowMs)` first.
3. If it returns `blocked && !allowAccount`, stop drain.
4. Only if no global was claimed, compute `watermarkS = store.globalWatermarkS()` and claim account partial/next with `takeNextAccountJob`.

Case 19 has one due global and one earlier-looking account wake; global claim must happen first. Case 13 includes a backward wall-clock/global-due subassertion: a global whose retry/due status becomes true only after `recordEffectiveNowInCurrentUow` is selected inside the UoW and `claimForResolution` receives the same `nowS`.

### Step 4: implement claimed-job lifecycle exactly as Task5 downstream

`applyClaimed` and every command/admission path must derive default `executionTargetS` from the branded executable, never from the raw claimed row:

```js
var executable = this.store.loadExecutableJob(token, rawClaim, nowMs);
var targetS = options.executionTargetS === undefined ?
  Number(executable.scheduled_at_s) : Number(options.executionTargetS);
```

Downstream order inside one immediate UoW and `world.trongMutationScheduler(mutation, fn)`:

1. `recordEffectiveNowInCurrentUow(token, nowMs)`.
2. Create mutation with committed metric ledger and budget object.
3. `store.loadExecutableJob(token, rawClaim, effectiveNowMs)`; from this point use only the frozen executable.
4. `markDurableMutationInCurrentUow(mutation, effectiveNowMs)` exactly once before barrier/reducer/World work.
5. For global jobs, run `advanceService.advanceBarrier(mutation, executable)` before reducer:
   - If it returns internal `blockedExternal:true` and `blockedExternalJobId`, recognize that AdvanceService has already called `parkGlobalBehindPreceding`. Do not call `parkGlobalBehindPreceding` again. Return `{reordered:true, partial:false, jobId:executable.id, precedingJobId:barrier.blockedExternalJobId, advanceResult:barrier}` and record partial metric. Case 19 asserts exactly one total Store park call.
   - If barrier budget is exhausted, return partial with `jobId: executable.id`.
   - If no committed application and mutation budget is zero, synthesize `zeroGlobal.advanceResult` exactly: `processed` inherited from barrier, `advancedToS` inherited from barrier, `nextDueAtS = Number(executable.scheduled_at_s)`, `hasMoreDue:true`, `budgetExhausted:true`; record it in committed metrics/tick. Case 20 asserts all fields.
   - If application is not already committed, decrement exactly one external primitive before `insertApplication`.
6. Call `reducer.prepare(mutation, executable, options)` for every non-zero-budget executable. This is before idempotency/application replay.
7. For account partial:
   - Call `reducer.applyPrepared(mutation, prepared)` exactly as `applyPrepared(mutation, prepared)`.
   - Validate the effect exactly:

```js
function assertTask5PartialEffect(effect, prepared) {
  if (!effect || Object.getPrototypeOf(effect) !== Object.prototype) {
    throw schedulerError('PARTIAL_EFFECT_INVALID');
  }
  var names = Object.keys(effect);
  if (names.length !== 2 || names[0] !== 'checkpointRevision' ||
      names[1] !== 'saveReceipt' || Reflect.ownKeys(effect).length !== 2) {
    throw schedulerError('PARTIAL_EFFECT_INVALID');
  }
  if (effect.saveReceipt !== prepared.saveReceipt ||
      effect.saveReceipt !== prepared.advanceResult.saveReceipt) {
    throw schedulerError('PARTIAL_EFFECT_RECEIPT_MISMATCH');
  }
  if (effect.saveReceipt !== null &&
      effect.checkpointRevision !== effect.saveReceipt.revision) {
    throw schedulerError('PARTIAL_EFFECT_REVISION_MISMATCH');
  }
  return effect;
}
```

   - If deferred external, call exactly `store.blockOwnedAccountAdvance(token, executable, effect.checkpointRevision, prepared.advanceResult.blockedExternalJobId, nowMs)`.
   - If non-deferred and `effect.saveReceipt !== null`, call exactly `store.checkpointPartial(token, executable, effect.checkpointRevision, nowMs)`.
   - If exact established-zero `{checkpointRevision:null, saveReceipt:null}`, require `prepared.advanceResult.processed === 0`, `budgetExhausted === true`, `hasMoreDue === true`, and shared budget zero. Call no checkpoint, no block, no application, no terminal, no world save, and retain the already adopted RUNNING lock.
8. For prepared terminal:
   - Call `store.insertApplication(token, executable, prepared.application, nowMs, prepared.canonicalTContext || null)` even if already applied.
   - If `application.alreadyApplied === false`, call `reducer.applyPrepared(mutation, prepared)` once; if true, skip application effect and all world effects.
   - If `prepared.terminalState === 'CANCELLED'`, call `store.finishResolved(token, executable, 'CANCELLED', prepared.cancelReason, nowMs)` before any account-success finalizer. Account CANCELLED is never deferred.
   - Else if executable is `ACCOUNT_ADVANCE`, call `store.completeAccountAdvanceAndScheduleSuccessor(token, executable, prepared.nextLocalAtS || effect.nextLocalAtS, nowMs)` unless `options.deferAccountFinalize === true`, in which case return an account finalizer only for eligible COMPLETED account work.
   - Else call `store.completeApplied(token, executable, nowMs)`.
9. Run crash hooks `after-application-insert`, `after-game-mutation`, and `before-job-completion` for the post-claim matrix. A separate `before-claim` hook is inside the claim UoW.
10. Before every UoW commit, call `refreshLeasePhaseInCurrentUow` with the phase name for that path. No durable write follows the actual final fence.
11. Flush committed metric ledger only after commit.

Case coverage:

- Cases 14-18 cover crash chronology after application, after effect, before final fence, already-applied restart, and stale-generation effect.
- Cases 21-28 cover strict effect shape, deferred block, established-zero retention, charge/replay, terminal method mapping, cancel before finalizer, and deferred completed account metrics.

### Step 5: implement failure settlement and raw quarantine

`settleClaimFailure(claimedRaw, originalError, startedNowMs)`:

1. Short-circuit before any settlement UoW:
   - `originalError.code === 'INJECTED_CRASH'`: rethrow original unchanged.
   - `originalError.code === 'LEASE_LOST'`: call `transitionLeaseLost(originalError)` and rethrow original unchanged.
   - fatal storage original: call `transitionStorageFatal(originalError)` and rethrow original unchanged.
2. Open a fresh immediate settlement UoW.
3. `freshNow = recordEffectiveNowInCurrentUow(token, effectiveNowMs())`.
4. Reload by `claimedRaw.id`; if missing, run a final live lease fence and rethrow original unchanged after commit. Do not invent a terminal state for a missing row.
5. Try `store.loadExecutableJob(token, freshRow, freshNow)`.
6. If load succeeds, call `store.fail(token, executable, originalError, freshNow, retryPolicy())`.
7. If load fails with payload integrity only, call new `quarantineClaimedRaw(token, freshRow.id, freshRow.locked_generation, freshNow, safeCode, safeMessage)` as a fallback.
8. If settlement fails with fatal storage, call `transitionStorageFatal(settlementError)` but rethrow `originalError` unchanged. Lease settlement errors transition lease lost and rethrow original unchanged. Nonfatal settlement errors are logged and original is rethrown unchanged.
9. Before commit, refresh/fence lease with fresh time.

`quarantineClaimedRaw` implementation:

- Does not parse `payload_json`.
- Validates only safe raw id/generation/owner/time scalars.
- Atomic SQL requires id, `state='RUNNING'`, `locked_by=token.ownerId`, `locked_generation=token.generation`, `locked_until_ms>nowMs`, no blocked job, and a live scheduler lease.
- Sets `state='QUARANTINED'`, `error_code`, `error_message_safe`, `quarantined_at_ms`, `updated_at_ms`, clears lock fields, preserves attempt.
- If SQL changes 0 and lease is lost, throw `LEASE_LOST`; otherwise throw `JOB_RAW_QUARANTINE_CONFLICT`.

---

## Task 4: command MutationGate, direct-account continuation, advance-due, cutover, and CLI

**Files:** `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`

### Step 1: prove RED cases 9-10 and 33-40

Run `task6_red_one` for cases 9-10 and 33-40.

### Step 2: implement command world batch with live ABI

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

### Step 3: implement direct account path without `deferAccountWake:true`

Direct account commands call live World normally so completed direct work preserves World-created successor:

```js
SchedulerWriter.prototype.directAccountOutcomeInCurrentUow = function (
  mutation, accountId, targetS, nowMs, options
) {
  options = options || {};
  var result = this.world.advanceAccountNoiBo(mutation, accountId, targetS, {});
  if (typeof mutation.recordAdvance === 'function') mutation.recordAdvance(result);
  if (result.budgetExhausted === true || result.deferredExternal === true) {
    var finalizer = {
      directMode: true,
      directReceipt: result.saveReceipt || null,
      accountId: Number(accountId),
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
  return {partial: false, budgetExhausted: false, deferredExternal: false,
    jobId: null, advanceResult: result};
};
```

Case 38 asserts direct completed account does not pass `deferAccountWake:true`, returns success, and preserves the World-synchronized successor.

### Step 4: define `ensureEstablishedZeroDirectContinuation`

This fixes the previously undefined helper. Signature and contract:

```js
SchedulerWriter.prototype.ensureEstablishedZeroDirectContinuation = function (
  mutation, finalizer, nowMs
) {
  var result = finalizer && finalizer.advanceResult;
  if (!finalizer || finalizer.deferredExternal === true ||
      !result || result.deferredExternal === true ||
      result.budgetExhausted !== true ||
      Number(result.processed) !== 0 ||
      result.hasMoreDue !== true ||
      !Number.isSafeInteger(Number(result.nextDueAtS))) {
    throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
  }
  var loaded = this.world.nap(Number(finalizer.accountId));
  if (!loaded || !loaded.row ||
      !Number.isSafeInteger(Number(loaded.row.revision))) {
    throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
  }
  var row = this.store.replaceAccountAdvance(
    mutation.leaseToken, Number(finalizer.accountId),
    Number(loaded.row.revision), Number(result.nextDueAtS), nowMs
  );
  if (row && row.blocked_by_job_id) {
    throw schedulerError('ACCOUNT_CONTINUATION_BLOCKED');
  }
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, Number(finalizer.accountId),
    Number(result.nextDueAtS), nowMs, this.leaseMs
  );
  if (!adopted) throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
  if (typeof mutation.recordJob === 'function') {
    mutation.recordJob(adopted, 'partial', nowMs);
  }
  return adopted;
};
```

Case 39 asserts:

- established-zero direct partial calls `replaceAccountAdvance` with `result.nextDueAtS`, adopts the returned wake, and returns `jobId` for the continuation;
- a blocked existing row without a matching dependency is `ACCOUNT_CONTINUATION_BLOCKED`;
- missing loaded account/revision is `ACCOUNT_CONTINUATION_MISSING`;
- no deferred-external path calls this helper.

### Step 5: implement direct external continuation with retarget and exact blocked-row validation

Direct external-only continuation must handle a World-created same-key local wake whose scheduled time is not dependency-safe, and must not accept unrelated blocked rows.

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
    if (!finalizer.directReceipt ||
        !Number.isSafeInteger(Number(finalizer.directReceipt.revision)) ||
        !finalizer.blockedExternalJobId) {
      throw schedulerError('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
    }
    var dependency = this.store.getById(finalizer.blockedExternalJobId);
    if (!dependency || !Number.isSafeInteger(Number(dependency.scheduled_at_s))) {
      throw schedulerError('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
    }
    var safeTargetS = Number(dependency.scheduled_at_s);
    var row = this.store.retargetOwnedPendingAccountAdvanceForCommand(
      mutation.leaseToken, Number(finalizer.accountId),
      Number(finalizer.directReceipt.revision), safeTargetS, nowMs
    );
    if (!row) {
      row = this.store.replaceAccountAdvance(
        mutation.leaseToken, Number(finalizer.accountId),
        Number(finalizer.directReceipt.revision), safeTargetS, nowMs
      );
    }
    if (row && row.blocked_by_job_id) {
      this.store.validateBlockedAccountAdvanceForDependency(
        mutation.leaseToken, row, Number(finalizer.accountId),
        Number(finalizer.directReceipt.revision), safeTargetS,
        finalizer.blockedExternalJobId, nowMs
      );
      return {alreadyBlocked: true, id: row.id, dependencyJobId: finalizer.blockedExternalJobId};
    }
    adopted = this.store.adoptAccountAdvanceForCommand(
      mutation.leaseToken, Number(finalizer.accountId), safeTargetS, nowMs, this.leaseMs
    );
    if (!adopted) throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
    this.store.blockOwnedAccountAdvance(
      mutation.leaseToken, adopted, Number(finalizer.directReceipt.revision),
      finalizer.blockedExternalJobId, nowMs
    );
    return {alreadyBlocked: true, id: adopted.id, dependencyJobId: finalizer.blockedExternalJobId};
  }

  return this.ensureEstablishedZeroDirectContinuation(mutation, finalizer, nowMs);
};
```

`finalizeDirectAccountInCurrentUow` returns:

```js
if (continuation.alreadyBlocked) {
  return {partial: true, deferredExternal: true, jobId: null,
    blockedAccountJobId: continuation.id,
    dependencyJobId: continuation.dependencyJobId,
    advanceResult: finalizer.advanceResult};
}
```

For non-external established-zero it checkpoints only if `directReceipt` is non-null, otherwise returns the adopted continuation job id. Deferred completed accounts must record `prepared.advanceResult` exactly once before finish/finalizer. Account `prepared.terminalState === 'CANCELLED'` must run `finishResolved`/`afterCancel` before any deferred success finalizer and is not eligible for deferral.

### Step 6: implement writer-owned advance-due with 61-row boundary partial

```js
SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, targetS, nowMs) {
  this.world._schedulerActive(mutation);
  var rows = this.store.kho.q.dqDenHan.all(targetS, 61);
  var dueRows = rows.slice(0, 60);
  var summary = {partial: rows.length > 60, processed: 0,
    advancedToS: targetS, nextDueAtS: null, hasMoreDue: rows.length > 60,
    budgetExhausted: false, deferredExternal: false,
    blockedExternalJobId: null, saveReceipt: null};
  for (var i = 0; i < dueRows.length; i += 1) {
    var one = this.directAccountOutcomeInCurrentUow(
      mutation, Number(dueRows[i].tk), targetS, nowMs,
      {deferAccountFinalize: true}
    );
    var advance = one.advanceResult || one;
    summary.processed += Number(advance.processed || 0);
    summary.advancedToS = Math.max(summary.advancedToS, Number(advance.advancedToS || targetS));
    if (advance.nextDueAtS !== null && advance.nextDueAtS !== undefined) {
      summary.nextDueAtS = summary.nextDueAtS === null ?
        Number(advance.nextDueAtS) :
        Math.min(summary.nextDueAtS, Number(advance.nextDueAtS));
    }
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

Case 37 creates 61 due accounts. It asserts `partial:true`, `hasMoreDue:true`, closure count 0, command response `{deferred:true, code:'TICK_PARTIAL'}`, persisted `TICK_PARTIAL`, and postcommit continuation queued.

### Step 7: implement runCommand admission and partial return semantics

`runCommand({name, accountId?, run})`:

- derives monotonic `nowMs` internally;
- uses immediate UoW and `world.trongMutationScheduler`;
- settles global barriers before command closure;
- calls `markDurableMutationInCurrentUow` before command writes;
- for account commands, inspects `advanceAccountInCurrentUow` result;
- on any partial (`budgetExhausted`, `deferredExternal`, due boundary, or barrier partial), persists `TICK_PARTIAL`, never invokes `run`, returns the correct response, and after commit enqueues the RUNNING partial job or immediate budget continuation;
- for account-delete, runs closure but skips auto-advance;
- for adopted success, returns `accountFinalizer` and finalizes exactly once;
- if `run` returns a thenable after invocation, throw `UNIT_OF_WORK_ASYNC`; only rollback after invocation is guaranteed;
- before every command UoW commit, call `refreshLeasePhaseInCurrentUow('before-command-commit', token, nowMs)`.

Postcommit queue semantics:

```js
if (result.partialJobId) {
  this.enqueueCommittedPartial(result.partialJobId);
} else if ((result.deferredExternal === true || result.needsBudgetContinuation === true) &&
    !this.manualDrain) {
  this.enqueueBudgetContinuationIfDue(token, result.effectiveNowMs);
}
```

Case 34 proves external-blocked direct command returns `deferredExternal:true` with dependency/job fields and queues continuation even when `partialJobId === null`; manual mode suppresses automatic scheduling but returns the same durable response.

### Step 8: implement cutover and CLI exact surfaces

`server/scheduler/cutover.js` exports `{runMaintenanceCutover}`. It obtains a fresh owner/lease, audits mode, seeds/recoveries, releases in `finally`, and returns a data object. It does not print or call `process.exit`.

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

`runCli(argv, env, io, deps)` accepts injected `openKho`, `makeOwnerId`, and `clock`; opens Kho only after args validate; closes Kho in `finally`; returns `{exitCode, stdout, stderr}`; prints one JSON success object with `{action:'cutover', mode, imported, recovered}`. CLI tests cover invalid args, injected open failure, close in finally, stdout/stderr separation, and module surface.

---

## Task 5: verification, report, immutable seals, and fresh reviews

**Files:** exact report path only, plus the six Task6-owned implementation/test files if fixes are required.

### Step 1: run scheduler verification

```bash
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
```

Expected after 42 additions: `# tests 205`, `# pass 204`, `# fail 0`, `# skipped 1`. If blocked because npm/package scripts are unavailable, record the exact command and stderr; do not claim package-level tests passed.

### Step 2: syntax and whitespace checks

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

### Step 3: seal six implementation/test files

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

The report records these six hashes, verification outputs, RED proof summary, inventory helper hash, normalized scope proof, external V10 plan hash, and review outcomes. The report does not include its own hash.

### Step 4: run normalized inventory with report guards

Reject symlink report paths before allowlist comparison:

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
  'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v10.md',
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

Case 41 proves the guards reject a symlink `docs/superpowers/reports` directory and a symlink report file in temp fixtures before allowlist comparison. It also proves arbitrary untracked non-owned `*.js` files, mode-only changes, symlink target mutations, and forbidden file hashes are detected.

### Step 5: launch two fresh Sol/high reviews over exact seals

Review handoff includes:

- V10 plan path and external hash from `/tmp/task6-active-plan.sha256`;
- inventory helper hash from `/tmp/task6-inventory-functions.sha256`;
- six implementation/test paths and hashes from `/tmp/task6-six-file-sha256.txt`;
- scheduler verification output;
- RED proof output for all 42 exact-name cases;
- normalized inventory and forbidden diff output;
- exact report path.

Any change to a sealed six file or the V10 plan invalidates both approvals and requires rerunning verification, recomputing hashes, and launching two fresh reviewers. Approvals may be recorded in the report after review because review binding is to the six implementation/test hashes, inventory helper hash, and external V10 plan hash. If the report changes after approval, rerun final report guards and whitespace checks; do not recompute review binding unless a sealed six file changed.

### Step 6: final checks

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

Repeat the normalized allowlist comparison against `/tmp/task6-final-inventory.tsv`. If any six-file hash, active plan hash, inventory helper hash, forbidden diff, or report guard fails, do not hand off completion.

## Self-audit checklist

- V10 path is immutable and V1-V9 remain untouched.
- Retarget persisted identity corruption is `PAYLOAD_INTEGRITY`; `ACCOUNT_ADVANCE_RETARGET_INVALID` is input-only.
- `ensureEstablishedZeroDirectContinuation` has an exact signature, live Store calls, return values, and case 39 tests.
- External fallback never accepts a `replaceAccountAdvance` blocked early-return unless exact dependency validation passes; unrelated block A vs dependency B conflicts and rolls back.
- Startup recovery uses `assertAccountDependencyIntegrity`, conditional `markDurableMutation`, staged ids, near-expiry rebase by `resumeOwnedRunning`, final fence, and postcommit queue publication only.
- Global barrier listing and eligibility happen inside the claim UoW after effective time is recorded.
- Claimed-job downstream follows Task5 lines 823-833, including strict partial wrapper and application replay validation/effect skipping.
- Global preceding-root result is recognized as already parked; writer does not call `parkGlobalBehindPreceding` a second time.
- Zero-budget global metric has exact synthesized fields.
- runCommand partial paths persist/return `TICK_PARTIAL`, do not invoke closure, and queue continuation correctly when `partialJobId` is null but `deferredExternal:true`.
- Direct account path does not pass `deferAccountWake:true`; direct completed successor, established-zero continuation, and external same-key retarget are tested.
- Advance-due uses `dqDenHan` limit 61, returns `partial:true` on the boundary, invokes closure zero times, and queues continuation.
- RED helper uses isolated anchored `--test-name-pattern`, requires `# tests 1`, exact `not ok 1 - <name>`, and unique sentinel.
- Scope checks are untracked-aware and symlink-aware, with report dir/file type guards.
- Report has no self-hash. Fresh reviews bind to exact six source/test hashes plus external plan/inventory helper hashes.

## Completion definition

Task 6 is complete only when all 42 tests are proven RED individually, the implementation passes the full scheduler suite with the honest expected arithmetic, final scope/seal checks pass, and two fresh Sol/high reviewers approve the exact sealed six implementation/test hashes under this externally pinned V10 plan.
