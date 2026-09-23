# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V11

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This V11 file is immutable after the external plan hash is captured.

**Goal:** Implement Task 6 writer lifecycle, global-first drain, watermark, retry/backoff/quarantine, command MutationGate, direct-account continuation, cutover CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** One leased `SchedulerWriter` owns durable scheduler writes. Every durable mutation runs in an existing immediate SQLite UoW and inside `world.trongMutationScheduler(mutation, fn)`. The public adapter is `taoScheduler(context)` in `server/scheduler/index.js`; Store and writer internals remain private except for explicit Task6-owned primitives.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task 6 starts at line 10866 of `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md`. Exact bridge/factory API is parent lines 14980-15215. Exact app DB-close seam behavior is parent lines 17880-18005 and 18940-19015. Exact Task 5 downstream protocol is lines 823-833 of `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`.

## Direct inspection baseline

V11 was authored after direct inspection of live and parent source:

- Live `server/scheduler/contract.js` is a stub with public `getStatus`, not the final durable bridge.
- Parent `taoScheduler` public bridge has enumerable keys `start,stop,getStatus,runCommand,schedule,cancel,reconcile,advanceTo`; `getStatus` calls `writer.status()`, not `writer.getStatus()`.
- Parent `_datSignalHandlerInstalled` is a non-enumerable function that accepts `installed` and writes `writer.signalHandlerState.installed = Boolean(installed)`.
- Parent `_datDatabaseClosing` is app-private and runs before `kho.dong()`. V11 tightens it to capture a final safe status snapshot before `dbOpen=false`, store a cache, then make every later `writer.status()`/bridge `getStatus()` cache-only with `ready:false`, `dbOpen:false`, and `reason:'SCHEDULER_DB_CLOSED'`.
- Live `server/world.js` has `trongMutationScheduler(mutation, fn)`, `_schedulerActive(mutation)`, `advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)`, and no `advanceDueNoiBo`.
- Live `server/db.js` has `dqDenHan`: `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?`.
- Live `advanceService.advanceBarrier` already calls `store.parkGlobalBehindPreceding(...)` and returns internal `blockedExternal:true, blockedExternalJobId`. Writer must recognize that result and must not park twice.
- Live `replaceAccountAdvance` may early-return an unrelated PENDING blocked `ACCOUNT_ADVANCE` for the account. Writer must validate exact dependency identity before accepting that row.
- Live `resumeOwnedRunning` extends only an owned RUNNING row whose `locked_until_ms > nowMs`; startup recovery must rebase staged rows with fresh effective time immediately before commit.
- Live Store private helpers include `validateJob`, `canonicalJson`, `sha256`, `parseCanonicalBoundedJson`, `executableInput`, `payloadIntegrity`, `mutationConflict`, `requiredMutation`, `optionalMutation`, and `fail`.

## Global constraints

- Preserve V1-V10 plan artifacts. This planning task creates only this V11 file.
- Implementation may edit exactly these six Task6-owned source/test files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task7+ edits: do not modify `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, `js/*.js`, or `web/js/mp.js`.
- Do not add `TheGioi.prototype.advanceDueNoiBo`. Task 6 owns `SchedulerWriter.prototype.advanceDueInCurrentUow`.
- Existing accepted scheduler suite baseline is 163 tests. V11 adds exactly 42 tests, so expected final scheduler output is 205 tests, 204 passed, 0 failed, and 1 known environment skip. If a fresh pre-edit baseline differs, record the exact output and recompute arithmetic in the report.
- Public bridge enumerable keys remain exactly `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop` when sorted. `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` are private non-enumerable descriptors only.
- Do not embed this plan's hash in the plan. After V11 is frozen, implementation preflight captures the external hash:

```bash
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v11.md \
  > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

## V11 correction ledger

1. Bridge contract is exact: public `getStatus` calls `writer.status()`, `_datSignalHandlerInstalled(installed)` is a function, and `_datDatabaseClosing` stores a post-close cache before disabling SQLite access.
2. Metric ownership is exact: helper methods never call `mutation.recordJob`. The finalizer records once for each newly adopted RUNNING/blocked/established-zero continuation and records zero for a pre-existing already-blocked row.
3. `callFaultHook('after-claim', claimed)` runs immediately after a global/account claim UoW commits and before the effect UoW opens. The five crash stages are exactly `before-claim`, `after-claim`, `after-application-insert`, `after-game-mutation`, and `before-job-completion`.
4. Active plan, six source/test files, report directory, and report file are verified as real non-symlink paths with exact type and filesystem mode. Source/test file seals include content hash, size, type, fs mode, and tracked mode; same-content symlinks or mode changes invalidate reviews.
5. Each isolated RED proof is retained in `/tmp/task6-v11-red-evidence.tap`; the evidence file is hashed and included in review/report handoff.
6. Report machine-validation checks nonempty content and exact presence of V11 plan hash, six implementation hashes, normal/throw verification output with 205/204/0/1, node-check/diff/scope results, RED evidence hash, and two reviewer identities/models/outcomes `PASS`.
7. The 42-case manifest explicitly covers all parent Task6 obligations: owner UUID rejection, one-writer takeover, manual drain, public schedule/cancel/advanceTo/reconcile, factory options/cache/exports, fatal lifecycle, retry/backoff+jitter/quarantine, logs/status, shutdown/private seams, global/account/crash, cutover, CLI, command gate, and scope/seal.
8. Accepted 163 tests are guarded: preflight captures baseline TAP names/hash and test file prefix bytes/hash before an append marker; final excludes the 42 V11 names and compares the original names/hash and prefix hash.
9. All V1-V10 logic fixes remain binding: strict Task5 downstream, global already-parked recognition, prepare-before-idempotency, direct save options, retarget `PAYLOAD_INTEGRITY` contract, explicit established-zero continuation, external blocked-row validation, startup lock rebase, UoW global claim recompute, raw quarantine without payload parse, runCommand partial responses, and no report self-hash.

---

## Task 1: Preflight, baseline guard, RED manifest, RED evidence, and inventory

**Files:**

- Modify later: `tools/test-scheduler.js`
- Temp only: `/tmp/task6-active-plan.sha256`, `/tmp/task6-v11-baseline.tap`, `/tmp/task6-v11-baseline-names.txt`, `/tmp/task6-v11-baseline-names.sha256`, `/tmp/task6-v11-test-prefix.tsv`, `/tmp/task6-v11-red-evidence.tap`, `/tmp/task6-v11-red-evidence.sha256`, `/tmp/task6-inventory-functions.sh`, `/tmp/task6-inventory-functions.sha256`, `/tmp/task6-pre-inventory.tsv`, `/tmp/task6-pre-forbidden.tsv`, `/tmp/task6-six-pre-meta.tsv`

### Step 1: pin V11 and prove it is a real file

```bash
plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v11.md'
test -f "$plan"
test ! -L "$plan"
python3 - <<'PY' "$plan"
import os, stat, subprocess, sys
path = sys.argv[1]
st = os.lstat(path)
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
    raise SystemExit('active plan must be a real regular file')
fs_mode = oct(stat.S_IMODE(st.st_mode))
if fs_mode != '0o644':
    raise SystemExit('active plan fs mode must be 0644: ' + fs_mode)
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, p = record.split(b'\t', 1)
    tracked[p.decode()] = meta.split()[0].decode()
tracked_mode = tracked.get(path, '-')
if tracked_mode not in ('-', '100644'):
    raise SystemExit('active plan tracked mode must be - or 100644: ' + tracked_mode)
print(path + '\tfile\t' + tracked_mode + '\t' + fs_mode)
PY
sha256sum "$plan" > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

Do not modify this plan after this command. The plan is not in the mutable allowlist.

### Step 2: capture the accepted 163-test baseline and append-only prefix

Before editing `tools/test-scheduler.js`, run:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v11-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v11-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v11-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v11-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v11-baseline.tap
node - <<'NODE' /tmp/task6-v11-baseline.tap > /tmp/task6-v11-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map(m => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v11-baseline-names.txt > /tmp/task6-v11-baseline-names.sha256
node - <<'NODE' > /tmp/task6-v11-test-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const path = 'tools/test-scheduler.js';
const marker = '// TASK6_V11_TESTS_APPEND_ONLY_START';
const bytes = fs.readFileSync(path);
if (bytes.includes(Buffer.from(marker))) throw new Error('TASK6_V11_MARKER_ALREADY_PRESENT');
console.log([bytes.length, crypto.createHash('sha256').update(bytes).digest('hex')].join('\t'));
NODE
```

Task6 tests must be appended after exactly:

```js
// TASK6_V11_TESTS_APPEND_ONLY_START
```

No earlier test text may change. Final verification compares the original prefix bytes and the baseline test-name list after excluding the 42 V11 names.

### Step 3: install exactly 42 lazy RED tests

Append only after the marker. Every test lazy-requires Task6 modules inside its named subtest. Each sentinel is unique and appears only in its own test body/diagnostic.

```js
var TASK6_V11_CASES = Object.freeze([
  ['Task 6 v11 owner UUID and legacy mode reject before DB mutation', 'TASK6V11_RED_001_OWNER_LEGACY'],
  ['Task 6 v11 one writer takeover standby poll and manual drain timer rules', 'TASK6V11_RED_002_TAKEOVER_MANUAL'],
  ['Task 6 v11 startup failure unwind releases committed lease and preserves original', 'TASK6V11_RED_003_STARTUP_UNWIND'],
  ['Task 6 v11 startup recovery asserts integrity stages ids and rebases locks', 'TASK6V11_RED_004_STARTUP_REBASE'],
  ['Task 6 v11 heartbeat transient rearm and lease loss keep one acquisition poll', 'TASK6V11_RED_005_HEARTBEAT_POLL'],
  ['Task 6 v11 retry backoff jitter quarantine logs and fatal lifecycle are exact', 'TASK6V11_RED_006_RETRY_FATAL_LOGS'],
  ['Task 6 v11 shutdown admission fence drains captured tail with bounded grace', 'TASK6V11_RED_007_SHUTDOWN_GRACE'],
  ['Task 6 v11 bridge private seams cache status and close DB without SQLite reads', 'TASK6V11_RED_008_BRIDGE_CACHE'],
  ['Task 6 v11 runMaintenanceCutover fresh lease audit recovery and release', 'TASK6V11_RED_009_CUTOVER'],
  ['Task 6 v11 CLI factory options cache exports and close behavior are exact', 'TASK6V11_RED_010_CLI_FACTORY'],
  ['Task 6 v11 public schedule cancel advanceTo reconcile use MutationGate fences', 'TASK6V11_RED_011_PUBLIC_SURFACES'],
  ['Task 6 v11 before claim crash leaves no running row', 'TASK6V11_RED_012_BEFORE_CLAIM'],
  ['Task 6 v11 after claim crash hook uses effective lock time and global due recompute', 'TASK6V11_RED_013_AFTER_CLAIM_CLOCK'],
  ['Task 6 v11 after application crash restarts without duplicate effect', 'TASK6V11_RED_014_AFTER_APP'],
  ['Task 6 v11 after game mutation crash rolls back application and world state', 'TASK6V11_RED_015_AFTER_EFFECT'],
  ['Task 6 v11 before job completion generation flip rolls back effect UoW', 'TASK6V11_RED_016_FINAL_FENCE'],
  ['Task 6 v11 already applied restart skips effect and terminalizes once', 'TASK6V11_RED_017_REPLAY'],
  ['Task 6 v11 stale generation effect fails before commit', 'TASK6V11_RED_018_STALE_GENERATION'],
  ['Task 6 v11 global first drain claims barrier inside UoW before account and parks once', 'TASK6V11_RED_019_GLOBAL_FIRST'],
  ['Task 6 v11 zero budget global synthesizes exact advance metric', 'TASK6V11_RED_020_ZERO_GLOBAL'],
  ['Task 6 v11 account partial effect shape keys and receipt identity are exact', 'TASK6V11_RED_021_PARTIAL_SHAPE'],
  ['Task 6 v11 account partial blocked external uses advanceResult dependency', 'TASK6V11_RED_022_PARTIAL_BLOCK'],
  ['Task 6 v11 established zero partial retains running lock unchanged', 'TASK6V11_RED_023_ESTABLISHED_ZERO'],
  ['Task 6 v11 prepared global charges primitive once before idempotency insert', 'TASK6V11_RED_024_GLOBAL_CHARGE'],
  ['Task 6 v11 prepared replay validates application and skips second effect', 'TASK6V11_RED_025_REPLAY_CHARGE'],
  ['Task 6 v11 terminal mapping uses only accepted Store methods', 'TASK6V11_RED_026_TERMINAL'],
  ['Task 6 v11 account cancelled terminal is not deferred and returns afterCancel', 'TASK6V11_RED_027_ACCOUNT_CANCEL'],
  ['Task 6 v11 deferred completed account records advance once before finalizer', 'TASK6V11_RED_028_DEFER_METRIC'],
  ['Task 6 v11 settlement reloads executable then Store fail', 'TASK6V11_RED_029_SETTLE_FAIL'],
  ['Task 6 v11 settlement raw corruption quarantines without payload parse', 'TASK6V11_RED_030_RAW_QUARANTINE'],
  ['Task 6 v11 settlement missing fresh row preserves original failure', 'TASK6V11_RED_031_MISSING_ROW'],
  ['Task 6 v11 settlement short circuits injected lease and fatal originals', 'TASK6V11_RED_032_SETTLE_SHORT'],
  ['Task 6 v11 runCommand barrier partial persists TICK_PARTIAL and skips closure', 'TASK6V11_RED_033_CMD_BARRIER'],
  ['Task 6 v11 runCommand external account partial queues continuation after commit', 'TASK6V11_RED_034_CMD_EXTERNAL_CONTINUATION'],
  ['Task 6 v11 runCommand thenable rolls back after invocation only', 'TASK6V11_RED_035_CMD_THENABLE'],
  ['Task 6 v11 account delete skips advance and adopted success finalizes once', 'TASK6V11_RED_036_CMD_DELETE_ADOPT'],
  ['Task 6 v11 advance due 61 account boundary returns partial and queues continuation', 'TASK6V11_RED_037_CMD_DUE_61'],
  ['Task 6 v11 direct completed account preserves World synchronized successor', 'TASK6V11_RED_038_DIRECT_COMPLETE'],
  ['Task 6 v11 direct established zero helper returns continuation with one metric owner', 'TASK6V11_RED_039_DIRECT_ZERO_METRIC'],
  ['Task 6 v11 direct external retarget rejects unrelated block and records one metric', 'TASK6V11_RED_040_DIRECT_RETARGET_METRIC'],
  ['Task 6 v11 RED evidence baseline prefix and normalized scope guards are machine checked', 'TASK6V11_RED_041_SCOPE_BASELINE'],
  ['Task 6 v11 report seal reviewer identities and real file modes are machine checked', 'TASK6V11_RED_042_REPORT_SEAL']
]);
```

Case-to-obligation mapping:

| Case | Parent obligations covered |
|---:|---|
| 1 | owner UUID rejection, legacy mode refusal before DB mutation |
| 2 | one-writer acquisition, takeover/standby, manual-drain timer suppression |
| 3 | startup failure unwind, committed lease release, original error preservation, stop-requested branch |
| 4 | startup recovery order, `assertAccountDependencyIntegrity`, conditional durable mark, staged resume, nearly-expired lock rebase |
| 5 | heartbeat transient rearm, lease generation loss, exactly one standby poll |
| 6 | retry/backoff/jitter, transient/fatal classification, quarantine readiness/log/status safety |
| 7 | shutdown admission fence, bounded grace, captured-tail finalization, stop private seam |
| 8 | bridge private seams, DB-close cache-only status, signal-handler function, no post-close SQLite |
| 9 | maintenance cutover function/lease audit/recovery/release separation from CLI |
| 10 | CLI surface, factory options shape, cache, exports, owner seam |
| 11 | public `schedule`, `cancel`, `advanceTo`, `reconcile`, MutationGate fences, manual drain |
| 12-18 | five crash stages, restart semantics, application replay, stale generation/final fence |
| 19-20 | global-first drain, UoW claim recompute, already-parked barrier, zero-budget global metric |
| 21-28 | Task5 account/global downstream, strict partial wrapper, terminals, cancelled/adopted/deferred account semantics |
| 29-32 | retry settlement, raw quarantine, missing fresh row, injected/lease/fatal short-circuits |
| 33-37 | `runCommand` barrier partial, external continuation, thenable honesty, account delete/adopt success, 61 due boundary |
| 38-40 | direct completed successor, established-zero continuation, external retarget, blocked-row validation, metric owner |
| 41 | isolated RED evidence, accepted 163 prefix/name guard, normalized scope/type/symlink/mode guards |
| 42 | report machine validation, six-file real file/mode seal, reviewer identity/model/outcome PASS lines |

### Step 4: prove RED and retain evidence

The helper runs one exact test name per process, appends an immutable transcript to `/tmp/task6-v11-red-evidence.tap`, and deletes only per-case temp output.

```bash
task6_name_pattern() {
  node -e 'const s = process.argv[1];
    console.log("^" + s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&") + "$");' "$1"
}
task6_red_one() (
  index=$1
  test_name=$2
  sentinel=$3
  evidence=/tmp/task6-v11-red-evidence.tap
  old_exit_trap=$(trap -p EXIT || true)
  case $- in *e*) had_errexit=1 ;; *) had_errexit=0 ;; esac
  out=$(mktemp "${TMPDIR:-/tmp}/task6-v11-red.XXXXXX")
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
  {
    printf '### TASK6_V11_RED_EVIDENCE %02d\\n' "$index"
    printf 'name: %s\\n' "$test_name"
    printf 'sentinel: %s\\n' "$sentinel"
    printf 'exit_status: %s\\n' "$status"
    cat "$out"
    printf '\\n### END_TASK6_V11_RED_EVIDENCE %02d\\n' "$index"
  } >> "$evidence"
  if [ "$status" -eq 0 ]; then echo "expected RED but passed: $test_name" >&2; exit 1; fi
  grep -Eq '^# tests 1$' "$out" || { echo "not exactly one test: $test_name" >&2; exit 1; }
  grep -Fq "$sentinel" "$out" || { echo "sentinel missing: $sentinel" >&2; exit 1; }
  grep -Fq "not ok 1 - $test_name" "$out" || { echo "wrong TAP failure: $test_name" >&2; exit 1; }
  exit 0
)
: > /tmp/task6-v11-red-evidence.tap
```

Invoke `task6_red_one 1 ...` through `task6_red_one 42 ...`, exactly once per manifest entry. Then verify evidence:

```bash
grep -c '^### TASK6_V11_RED_EVIDENCE ' /tmp/task6-v11-red-evidence.tap | grep -x 42
grep -c '^### END_TASK6_V11_RED_EVIDENCE ' /tmp/task6-v11-red-evidence.tap | grep -x 42
sha256sum /tmp/task6-v11-red-evidence.tap > /tmp/task6-v11-red-evidence.sha256
```

### Step 5: create normalized inventory and six-file metadata helpers

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
task6_six_file_meta() {
  python3 - <<'PY'
import hashlib, os, stat, subprocess
paths = [
  'server/scheduler/store.js',
  'server/scheduler/writer.js',
  'server/scheduler/index.js',
  'server/scheduler/cutover.js',
  'tools/scheduler-cutover.js',
  'tools/test-scheduler.js',
]
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, path = record.split(b'\t', 1)
    tracked[path.decode()] = meta.split()[0].decode()
for path in paths:
    st = os.lstat(path)
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
        raise SystemExit('six-file target is not regular real file: ' + path)
    fs_mode = oct(stat.S_IMODE(st.st_mode))
    if fs_mode != '0o644':
        raise SystemExit('six-file target fs mode must be 0644: ' + path + ' ' + fs_mode)
    tracked_mode = tracked.get(path, '-')
    if tracked_mode not in ('-', '100644'):
        raise SystemExit('six-file tracked mode must be - or 100644: ' + path + ' ' + tracked_mode)
    data = open(path, 'rb').read()
    print('\t'.join([path, 'file', tracked_mode, fs_mode, str(len(data)),
      hashlib.sha256(data).hexdigest()]))
PY
}
SH
chmod 700 /tmp/task6-inventory-functions.sh
sha256sum /tmp/task6-inventory-functions.sh > /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
task6_inventory > /tmp/task6-pre-inventory.tsv
task6_forbidden_inventory < /tmp/task6-pre-inventory.tsv > /tmp/task6-pre-forbidden.tsv
```

For source files that do not exist yet, `task6_six_file_meta` is expected to fail in preflight. After implementation it must pass and every six-file row is part of the review seal. If any six-file path is a symlink, same-content symlink, directory, or mode other than `0644`, verification fails.

---

## Task 2: writer lifecycle, status cache, timers, and bridge private seams

**Files:** `server/scheduler/writer.js`, `server/scheduler/index.js`, `tools/test-scheduler.js`

### Step 1: prove RED cases 1-8

Run the isolated RED helper for cases 1-8.

### Step 2: implement owner validation, lifecycle states, and timer primitives

`SchedulerWriter` constructor must call live `assertSchedulerOwnerId(options.ownerId)` before any DB read/write. Case 1 snapshots `scheduler_lease` before construction and asserts invalid UUID throws `SCHEDULER_OWNER_ID_INVALID` with identical DB rows.

Implement idempotent timer methods:

```js
SchedulerWriter.prototype.clearMutationTimers = function () {
  this.timers.clearTimeout(this.wakeTimer);
  this.timers.clearTimeout(this.heartbeatTimer);
  this.timers.clearTimeout(this.reconcileTimer);
  this.immediate.clear(this.continuationHandle);
  this.wakeTimer = null;
  this.wakeAtMs = null;
  this.heartbeatTimer = null;
  this.reconcileTimer = null;
  this.continuationHandle = null;
};
SchedulerWriter.prototype.clearPollTimer = function () {
  this.timers.clearTimeout(this.pollTimer);
  this.pollTimer = null;
};
SchedulerWriter.prototype.clearGraceTimer = function () {
  this.timers.clearTimeout(this.stopGraceTimer);
  this.stopGraceTimer = null;
};
SchedulerWriter.prototype.clearAllTimers = function () {
  this.clearMutationTimers();
  this.clearPollTimer();
  this.clearGraceTimer();
};
```

Lease loss clears mutation/retry timers but retains exactly one standby acquisition poll when not stopping/stopped/manual. Stop and DB close call `clearAllTimers()`.

### Step 3: implement startup order and nearly-expired lock rebase

Startup order:

1. Reject fatal/crashed/stopped.
2. If mode is not durable, set `legacy/SCHEDULER_MODE_LEGACY` and do not acquire.
3. Enter `recovering`, open one immediate UoW.
4. `candidateNow = store.peekEffectiveNowMs(wallNowMs)`.
5. `token = store.acquireLease(ownerId, candidateNow, leaseMs)`. If null, commit no writes, enter standby, arm one acquisition poll outside manual mode.
6. `effective = recordEffectiveNowInCurrentUow(token, candidateNow)`.
7. `reducer.initializeCombatSeed(token, effective)`.
8. `store.assertAccountDependencyIntegrity(token, effective)`.
9. `recovered = store.recoverExpiredRunning(token, effective, retryPolicy())`; call `store.markDurableMutation(token, effective)` only when `recovered > 0`.
10. Stage owned running ids using:

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

11. Do not enqueue ids or arm timers precommit.
12. Immediately before commit:

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
```

Case 4 advances fake time to `leaseMs - 1` before rebase and by `+2ms` before final fence; after commit every staged row remains live/resumable.

13. After commit only: assign `leaseToken`, become ready, publish staged ids to `enqueuePartial` exactly once, schedule heartbeat/wake/poll/reconcile.

Startup failure unwind catches/logs release failure and rethrows the original startup error unchanged.

### Step 4: implement `status()` cache and bridge descriptors exactly

Writer status:

```js
SchedulerWriter.prototype.status = function () {
  if (!this.dbOpen && this.closedStatusCache) {
    return Object.assign({}, this.closedStatusCache, {
      counts: Object.assign({}, this.closedStatusCache.counts),
      ages: Object.assign({}, this.closedStatusCache.ages),
      metrics: Object.assign({}, this.closedStatusCache.metrics)
    });
  }
  var status = this.computeOpenStatusFromStore();
  this.lastOpenStatusCache = cloneSchedulerStatus(status);
  return status;
};
SchedulerWriter.prototype.closedStatusFromCache = function () {
  var base = this.lastOpenStatusCache || this.lastSafeStatusAggregate || {};
  return canonicalSchedulerStatus(Object.assign({}, base, {
    state: 'stopped',
    ready: false,
    reason: 'SCHEDULER_DB_CLOSED',
    dbOpen: false,
    writerLeaseHeld: false,
    leaseHeld: false,
    draining: false,
    wakeTimerActive: false,
    pollTimerActive: false,
    heartbeatTimerActive: false,
    reconcileTimerActive: false
  }), this.durableOptions);
};
```

`status()` must perform zero SQLite calls after `dbOpen=false`. Tests replace `store.statusSnapshot` after close and assert call count does not increase.

Bridge implementation:

```js
var bridge = {
  start: function () { return writer.start(); },
  stop: function (graceMs) { return writer.stop(graceMs); },
  getStatus: function () { return writer.status(); },
  runCommand: function (command) { return writer.runCommand(command); },
  schedule: function (job) { return writer.schedule(job); },
  cancel: function (key, reason) { return writer.cancel(key, reason); },
  reconcile: function () { return writer.reconcile(); },
  advanceTo: function (accountId, targetS) { return writer.advanceTo(accountId, targetS); }
};
Object.defineProperty(bridge, '_datSignalHandlerInstalled', {
  enumerable: false, configurable: false, writable: false,
  value: function (installed) {
    writer.signalHandlerState.installed = Boolean(installed);
  }
});
Object.defineProperty(bridge, '_waitForStopFinalization', {
  enumerable: false, configurable: false, writable: false,
  value: function () { return writer.stopFinalizePromise || Promise.resolve(); }
});
Object.defineProperty(bridge, '_beginStop', {
  enumerable: false, configurable: false, writable: false,
  value: function () { writer.beginStop(); }
});
Object.defineProperty(bridge, '_datDatabaseClosing', {
  enumerable: false, configurable: false, writable: false,
  value: function () {
    if (!writer.dbOpen) return;
    var snapshotError = null, snapshot;
    try { snapshot = writer.status(); }
    catch (error) { snapshotError = error; snapshot = writer.closedStatusFromCache(); }
    writer.closedStatusCache = canonicalSchedulerStatus(Object.assign({}, snapshot, {
      state: 'stopped',
      ready: false,
      reason: 'SCHEDULER_DB_CLOSED',
      dbOpen: false,
      writerLeaseHeld: false,
      leaseHeld: false,
      draining: false,
      wakeTimerActive: false,
      pollTimerActive: false,
      heartbeatTimerActive: false,
      reconcileTimerActive: false
    }), writer.durableOptions);
    writer.dbOpen = false;
    writer.accepting = false;
    writer.ready = false;
    writer.reason = 'SCHEDULER_DB_CLOSED';
    if (typeof writer.clearAllTimers === 'function') writer.clearAllTimers();
    else {
      writer.clearMutationTimers();
      writer.clearPollTimer();
      writer.clearGraceTimer();
    }
    if (snapshotError) throw snapshotError;
  }
});
```

Case 8 asserts descriptors are non-enumerable, `_datSignalHandlerInstalled` is a function, `getStatus` delegates to `writer.status()`, post-close status is cache-only, and `SCHEDULER_DB_CLOSED` survives a transient snapshot error.

---

## Task 3: Store primitives, global-first claim, Task5 downstream, crash hooks, and settlement

**Files:** `server/scheduler/store.js`, `server/scheduler/writer.js`, `tools/test-scheduler.js`

### Step 1: prove RED cases 12-32

Run the isolated RED helper for cases 12-32.

### Step 2: implement retarget and blocked dependency validation

`retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)`:

- Validate caller args first; invalid args throw `ACCOUNT_ADVANCE_RETARGET_INVALID`.
- Build key `account-advance:<accountId>:<revision>`.
- Query by idempotency key. If absent, return `null`.
- Validate any matching row before state checks:

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

Any matching-key persisted identity/canonical contradiction is `PAYLOAD_INTEGRITY`. `ACCOUNT_ADVANCE_RETARGET_INVALID` is input-only. After validation, state conflicts are `ACCOUNT_ADVANCE_RETARGET_CONFLICT`; lease loss is `LEASE_LOST`.

Regenerate canonical payload with live helpers and update only an unblocked PENDING same-key row under a live lease. Preserve id, sequence, idempotency key, attempt, and max attempts.

`validateBlockedAccountAdvanceForDependency(token, rowOrId, accountId, revision, targetS, dependencyJobId, nowMs)`:

- Asserts live lease and validates scalars.
- Reloads row, parses/hash-validates canonical payload.
- Requires exact account/revision/key/payload/scheduled_at_s/state `PENDING` and `blocked_by_job_id === dependencyJobId`.
- Requires dependency exists, is root `PVP_RESOLVE` or `EXTERNAL_RESOLVE`, has `source_account_id === accountId`, is non-terminal, and has `dependency.scheduled_at_s >= targetS`.
- Mismatch in blocked dependency is `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`; payload/hash corruption is `PAYLOAD_INTEGRITY`.

### Step 3: implement global-first claim and `after-claim` hook

Global claim must recompute list and eligibility inside the UoW after effective time:

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

```js
var barrierClaim = this.claimFirstBarrierForDrain(token, nowMs);
if (barrierClaim.blocked && !barrierClaim.allowAccount) return;
claimed = barrierClaim.claimed || this.takeNextAccountJob(token, nowMs, this.store.globalWatermarkS());
if (!claimed) return;
this.callFaultHook('after-claim', claimed);
outcome = this.applyClaimed(claimed, budget, nowMs);
```

`after-claim` is immediately after the claim UoW commits and before the effect UoW opens. The five supported crash stages are exactly:

1. `before-claim`
2. `after-claim`
3. `after-application-insert`
4. `after-game-mutation`
5. `before-job-completion`

Case 13 asserts the after-claim hook, effective lock time, and backward-clock/global-due recompute.

### Step 4: implement Task5 downstream lifecycle exactly

`applyClaimed` opens a fresh immediate UoW and `world.trongMutationScheduler`. It loads a branded executable before deriving default `executionTargetS`:

```js
var executable = this.store.loadExecutableJob(token, rawClaim, nowMs);
var executionTargetS = options.executionTargetS === undefined ?
  Number(executable.scheduled_at_s) : Number(options.executionTargetS);
```

Order:

1. `recordEffectiveNowInCurrentUow`.
2. New mutation context with committed metric ledger.
3. `store.loadExecutableJob`.
4. `markDurableMutationInCurrentUow` before barrier/reducer/world work.
5. For global, run `advanceService.advanceBarrier` before reducer. If barrier returns internal `blockedExternal:true`, writer returns reordered and never calls `parkGlobalBehindPreceding` again. Case 19 asserts exactly one total park call.
6. For zero-budget global, synthesize advance metric exactly: inherited `processed`, inherited `advancedToS`, `nextDueAtS = executable.scheduled_at_s`, `hasMoreDue:true`, `budgetExhausted:true`.
7. Charge one external primitive only for a new unapplied global application; never extra-charge account work.
8. Call `reducer.prepare(mutation, executable, options)` before idempotency insert.
9. For account partial, call `reducer.applyPrepared(mutation, prepared)` and enforce strict two-key plain wrapper:

```js
function assertTask5PartialEffect(effect, prepared) {
  if (!effect || Object.getPrototypeOf(effect) !== Object.prototype) {
    throw schedulerError('PARTIAL_EFFECT_INVALID');
  }
  if (Reflect.ownKeys(effect).length !== 2) throw schedulerError('PARTIAL_EFFECT_INVALID');
  var keys = Object.keys(effect);
  if (keys.length !== 2 || keys[0] !== 'checkpointRevision' || keys[1] !== 'saveReceipt') {
    throw schedulerError('PARTIAL_EFFECT_INVALID');
  }
  if (Object.getOwnPropertySymbols(effect).length !== 0) throw schedulerError('PARTIAL_EFFECT_INVALID');
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

10. Deferred partial calls exactly `blockOwnedAccountAdvance(token, executable, effect.checkpointRevision, prepared.advanceResult.blockedExternalJobId, nowMs)`. Non-deferred receipt calls `checkpointPartial`. Established-zero `{checkpointRevision:null, saveReceipt:null}` retains the RUNNING row byte-for-byte and calls no checkpoint/block/application/terminal.
11. Prepared terminal calls `insertApplication` even on replay. New application calls `applyPrepared`; replay skips effect. Then exactly one terminal path: `finishResolved`, `completeAccountAdvanceAndScheduleSuccessor`, or `completeApplied`.
12. Account `terminalState:'CANCELLED'` runs `finishResolved` and returns `afterCancel` before any deferred success finalizer; cancelled accounts are not eligible for deferral.
13. Every UoW has a final lease fence before commit; no durable write follows that fence. Metric ledger flushes only after commit.

### Step 5: implement settlement and raw quarantine

`settleClaimFailure` short-circuits `INJECTED_CRASH`, original `LEASE_LOST`, and original fatal storage before opening settlement. Ordinary failures open a fresh settlement UoW, reload by id, brand with `loadExecutableJob`, call `store.fail` on valid executable, or call raw quarantine only for payload integrity load failure. Missing fresh row preserves the original error unchanged after a live final fence. If settlement itself has fatal storage, call `transitionStorageFatal(settlementError)` but rethrow the original reducer error unchanged.

`quarantineClaimedRaw` does not parse payload. It atomically requires raw id, `state='RUNNING'`, owner/generation, `locked_until_ms>nowMs`, no block, and live lease; sets terminal `QUARANTINED`, safe error fields, clears locks, preserves attempt.

---

## Task 4: command MutationGate, direct-account continuation, advance-due, cutover, and CLI

**Files:** `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`

### Step 1: prove RED cases 9-11 and 33-40

Run isolated RED for cases 9-11 and 33-40.

### Step 2: implement public surfaces and factory options/cache

`taoScheduler(context)` accepts only parent exact context kinds:

- production `{kho,tg,clock,logger,env,schedulerOptions}`
- production-test adds only `makeOwnerId`
- direct `{writer,store,world,advanceService,reducer,clock,logger,schedulerOptions}`

Reject unknown keys before option resolution, UUID creation, cache access, or World installation. Nested `schedulerOptions` keeps only `schedulerPollMs`, `schedulerLogTicks`, and `cleanupMs`. `makeOwnerId` must be a function returning a valid UUID; scalar owner injection is forbidden.

Case 10 asserts module exports `taoScheduler`, `inRange`, and `resolveDurableSchedulerOptions`; repeated calls return one bridge per Kho/writer only when frozen dependencies/options match.

Case 11 asserts `schedule`, `cancel`, `advanceTo`, and `reconcile` all pass through operational admission, immediate UoW, mark/final fence where applicable, and manual-drain timer rules.

### Step 3: implement direct account finalizer with one metric owner

Helpers do not record job metrics. Finalizer records exactly once.

Continuation descriptors:

```js
// Newly adopted RUNNING local continuation.
{kind: 'running', job: adopted}

// Existing blocked row that exactly matches the dependency. No RUNNING work was
// claimed or blocked by this command, so finalizer records no job metric.
{kind: 'blocked', preExistingBlocked: true,
  blockedAccountJobId: row.id, dependencyJobId: dependencyJobId}

// This command adopted a RUNNING wake and blocked it. Finalizer records once.
{kind: 'blocked', newlyAdoptedBlocked: true, job: adopted,
  blockedAccountJobId: adopted.id, dependencyJobId: dependencyJobId}
```

`ensureEstablishedZeroDirectContinuation(mutation, finalizer, nowMs)` returns only `{kind:'running', job: adopted}` and never calls `recordJob`:

```js
SchedulerWriter.prototype.ensureEstablishedZeroDirectContinuation = function (
  mutation, finalizer, nowMs
) {
  var result = finalizer && finalizer.advanceResult;
  if (!result || finalizer.deferredExternal === true ||
      result.budgetExhausted !== true || Number(result.processed) !== 0 ||
      result.hasMoreDue !== true || !Number.isSafeInteger(Number(result.nextDueAtS))) {
    throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
  }
  var loaded = this.world.nap(Number(finalizer.accountId));
  if (!loaded || !loaded.row || !Number.isSafeInteger(Number(loaded.row.revision))) {
    throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
  }
  var row = this.store.replaceAccountAdvance(
    mutation.leaseToken, Number(finalizer.accountId),
    Number(loaded.row.revision), Number(result.nextDueAtS), nowMs
  );
  if (row && row.blocked_by_job_id) throw schedulerError('ACCOUNT_CONTINUATION_BLOCKED');
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, Number(finalizer.accountId),
    Number(result.nextDueAtS), nowMs, this.leaseMs
  );
  if (!adopted) throw schedulerError('ACCOUNT_CONTINUATION_MISSING');
  return {kind: 'running', job: adopted};
};
```

External continuation:

- Try `adoptAccountAdvanceForCommand` at current target.
- If deferred external, compute `safeTargetS = dependency.scheduled_at_s`.
- Call `retargetOwnedPendingAccountAdvanceForCommand`.
- If null, call `replaceAccountAdvance` once.
- If a row with `blocked_by_job_id` is returned, call `validateBlockedAccountAdvanceForDependency`. If it passes, return `preExistingBlocked:true`; if it is block A while current dependency is B, throw `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT` and rollback.
- Else adopt at `safeTargetS`, call `blockOwnedAccountAdvance`, and return `newlyAdoptedBlocked:true`.

Finalizer:

```js
SchedulerWriter.prototype.finalizeDirectAccountInCurrentUow = function (mutation, finalizer, nowMs) {
  if (finalizer.finalized) throw schedulerError('ACCOUNT_FINALIZER_ALREADY_USED');
  finalizer.finalized = true;
  var continuation = this.ensureDirectContinuationInCurrentUow(mutation, finalizer, nowMs);
  if (continuation.job && typeof mutation.recordJob === 'function') {
    mutation.recordJob(continuation.job, 'partial', nowMs);
  }
  if (continuation.kind === 'blocked') {
    return {partial: true, deferredExternal: true, jobId: null,
      blockedAccountJobId: continuation.blockedAccountJobId,
      dependencyJobId: continuation.dependencyJobId,
      advanceResult: finalizer.advanceResult};
  }
  if (finalizer.directReceipt) {
    this.store.checkpointPartial(
      mutation.leaseToken, continuation.job, finalizer.directReceipt.revision, nowMs
    );
  }
  return {partial: true, deferredExternal: false, jobId: continuation.job.id,
    advanceResult: finalizer.advanceResult};
};
```

Cases 39 and 40 assert helpers never record metrics, finalizer records once for newly adopted continuations, records zero for exact pre-existing blocked rows, and never double-records.

### Step 4: implement direct account path and advance-due

Direct account path calls `world.advanceAccountNoiBo(mutation, accountId, targetS, {})`. It must not pass `deferAccountWake:true`; direct completed account preserves the World-synchronized successor.

`advanceDueInCurrentUow` uses `dqDenHan.all(targetS, 61)`, processes at most 60 rows, and returns `partial:true`/`hasMoreDue:true` when a 61st row exists. `runCommand` treats that as `TICK_PARTIAL`, persists the command marker/result, invokes closure zero times, and queues continuation postcommit.

### Step 5: implement runCommand

`runCommand({name, accountId?, run})` derives monotonic time internally. It settles barrier admission before closure. Every command UoW calls `markDurableMutationInCurrentUow` before command writes. Partial command paths persist and return `{deferred:true, code:'TICK_PARTIAL'}`, never invoke closure, and after commit enqueue either `partialJobId` or a budget continuation when `partialJobId === null && deferredExternal === true`. Manual mode suppresses automatic continuation but returns the same durable response.

If `run` returns a thenable, throw `UNIT_OF_WORK_ASYNC` after invocation; rollback after invocation is the only guaranteed property.

### Step 6: implement cutover and CLI

`server/scheduler/cutover.js` exports `{runMaintenanceCutover}`. It acquires a fresh lease, audits mode, seeds/recovery work, and releases in `finally`; it returns data and never prints or exits.

`tools/scheduler-cutover.js` exports exactly:

```js
module.exports = {parseArgs: parseArgs, runCli: runCli, main: main};
if (require.main === module) {
  main(process.argv.slice(2), process.env, {
    stdout: process.stdout,
    stderr: process.stderr
  }, {});
}
```

`runCli(argv, env, io, deps)` accepts injected `openKho`, `makeOwnerId`, and `clock`; opens Kho only after args validate; closes Kho in `finally`; returns `{exitCode, stdout, stderr}`; prints only JSON success `{action:'cutover', mode, imported, recovered}`.

---

## Task 5: final verification, scope seals, report validation, and fresh reviews

**Files:** `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md` and the six Task6-owned files only if verification requires fixes.

### Step 1: verify append-only baseline and final scheduler output

```bash
node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [size, sha] = fs.readFileSync('/tmp/task6-v11-test-prefix.tsv', 'utf8').trim().split('\t');
const data = fs.readFileSync('tools/test-scheduler.js');
const prefix = data.subarray(0, Number(size));
if (crypto.createHash('sha256').update(prefix).digest('hex') !== sha) {
  throw new Error('TASK6_PREFIX_CHANGED');
}
const rest = data.subarray(Number(size)).toString('utf8');
if (!rest.startsWith('\n// TASK6_V11_TESTS_APPEND_ONLY_START\n') &&
    !rest.startsWith('// TASK6_V11_TESTS_APPEND_ONLY_START\n')) {
  throw new Error('TASK6_APPEND_MARKER_MISSING_AT_PREFIX');
}
NODE
node tools/test-scheduler.js > /tmp/task6-v11-final-normal.tap
node --throw-deprecation tools/test-scheduler.js > /tmp/task6-v11-final-throw.tap
grep -E '^# tests 205$' /tmp/task6-v11-final-normal.tap
grep -E '^# pass 204$' /tmp/task6-v11-final-normal.tap
grep -E '^# fail 0$' /tmp/task6-v11-final-normal.tap
grep -E '^# skipped 1$' /tmp/task6-v11-final-normal.tap
grep -E '^# tests 205$' /tmp/task6-v11-final-throw.tap
grep -E '^# pass 204$' /tmp/task6-v11-final-throw.tap
grep -E '^# fail 0$' /tmp/task6-v11-final-throw.tap
grep -E '^# skipped 1$' /tmp/task6-v11-final-throw.tap
node - <<'NODE' /tmp/task6-v11-final-normal.tap > /tmp/task6-v11-final-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const v11 = new Set([
  'Task 6 v11 owner UUID and legacy mode reject before DB mutation',
  'Task 6 v11 one writer takeover standby poll and manual drain timer rules',
  'Task 6 v11 startup failure unwind releases committed lease and preserves original',
  'Task 6 v11 startup recovery asserts integrity stages ids and rebases locks',
  'Task 6 v11 heartbeat transient rearm and lease loss keep one acquisition poll',
  'Task 6 v11 retry backoff jitter quarantine logs and fatal lifecycle are exact',
  'Task 6 v11 shutdown admission fence drains captured tail with bounded grace',
  'Task 6 v11 bridge private seams cache status and close DB without SQLite reads',
  'Task 6 v11 runMaintenanceCutover fresh lease audit recovery and release',
  'Task 6 v11 CLI factory options cache exports and close behavior are exact',
  'Task 6 v11 public schedule cancel advanceTo reconcile use MutationGate fences',
  'Task 6 v11 before claim crash leaves no running row',
  'Task 6 v11 after claim crash hook uses effective lock time and global due recompute',
  'Task 6 v11 after application crash restarts without duplicate effect',
  'Task 6 v11 after game mutation crash rolls back application and world state',
  'Task 6 v11 before job completion generation flip rolls back effect UoW',
  'Task 6 v11 already applied restart skips effect and terminalizes once',
  'Task 6 v11 stale generation effect fails before commit',
  'Task 6 v11 global first drain claims barrier inside UoW before account and parks once',
  'Task 6 v11 zero budget global synthesizes exact advance metric',
  'Task 6 v11 account partial effect shape keys and receipt identity are exact',
  'Task 6 v11 account partial blocked external uses advanceResult dependency',
  'Task 6 v11 established zero partial retains running lock unchanged',
  'Task 6 v11 prepared global charges primitive once before idempotency insert',
  'Task 6 v11 prepared replay validates application and skips second effect',
  'Task 6 v11 terminal mapping uses only accepted Store methods',
  'Task 6 v11 account cancelled terminal is not deferred and returns afterCancel',
  'Task 6 v11 deferred completed account records advance once before finalizer',
  'Task 6 v11 settlement reloads executable then Store fail',
  'Task 6 v11 settlement raw corruption quarantines without payload parse',
  'Task 6 v11 settlement missing fresh row preserves original failure',
  'Task 6 v11 settlement short circuits injected lease and fatal originals',
  'Task 6 v11 runCommand barrier partial persists TICK_PARTIAL and skips closure',
  'Task 6 v11 runCommand external account partial queues continuation after commit',
  'Task 6 v11 runCommand thenable rolls back after invocation only',
  'Task 6 v11 account delete skips advance and adopted success finalizes once',
  'Task 6 v11 advance due 61 account boundary returns partial and queues continuation',
  'Task 6 v11 direct completed account preserves World synchronized successor',
  'Task 6 v11 direct established zero helper returns continuation with one metric owner',
  'Task 6 v11 direct external retarget rejects unrelated block and records one metric',
  'Task 6 v11 RED evidence baseline prefix and normalized scope guards are machine checked',
  'Task 6 v11 report seal reviewer identities and real file modes are machine checked'
]);
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map(m => m[1]).filter(n => !v11.has(n));
if (names.length !== 163) throw new Error('FINAL_BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum -c /tmp/task6-v11-baseline-names.sha256
diff -u /tmp/task6-v11-baseline-names.txt /tmp/task6-v11-final-baseline-names.txt
```

### Step 2: syntax, whitespace, and six-file real-file seal

```bash
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
git diff --check -- server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js
rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
sha256sum -c /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
task6_six_file_meta > /tmp/task6-six-file-meta.tsv
cut -f1,6 /tmp/task6-six-file-meta.tsv | awk '{print $2 "  " $1}' > /tmp/task6-six-file-sha256.txt
```

Every six source/test path must be a real regular non-symlink file with filesystem mode `0644`; tracked mode must be `100644` if tracked or `-` if untracked at handoff. The meta TSV is part of the review seal, so a same-content symlink or mode-only change invalidates reviews.

### Step 3: normalized inventory and report type guards

```bash
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
test -f docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
test ! -L docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
python3 - <<'PY'
import os, stat
checks = [
  ('docs/superpowers/reports', 'dir'),
  ('docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md', 'file'),
]
for path, expected in checks:
    st = os.lstat(path)
    if stat.S_ISLNK(st.st_mode):
        raise SystemExit('report path symlink rejected: ' + path)
    if expected == 'dir' and not stat.S_ISDIR(st.st_mode):
        raise SystemExit('report directory expected: ' + path)
    if expected == 'file' and not stat.S_ISREG(st.st_mode):
        raise SystemExit('report file expected: ' + path)
    mode = oct(stat.S_IMODE(st.st_mode))
    if expected == 'file' and mode != '0o644':
        raise SystemExit('report file fs mode must be 0644: ' + mode)
PY
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
expected_fixed = {'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v11.md'}
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

Case 41 proves report symlink dir/file rejection, arbitrary untracked non-owned JS rejection, mode-only detection, baseline prefix detection, and final baseline name comparison.

### Step 4: report machine-validation

The report must be nonempty and contain exact evidence values. After writing the report, run:

```bash
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
test -s "$report"
plan_hash=$(awk '{print $1}' /tmp/task6-active-plan.sha256)
red_hash=$(awk '{print $1}' /tmp/task6-v11-red-evidence.sha256)
grep -F "V11 plan hash: $plan_hash" "$report"
grep -F "RED evidence hash: $red_hash" "$report"
while IFS=$'\t' read -r path typ tracked fs_mode size sha; do
  grep -F "$path $sha $size $typ $tracked $fs_mode" "$report"
done < /tmp/task6-six-file-meta.tsv
grep -F "normal scheduler output: tests=205 pass=204 fail=0 skipped=1" "$report"
grep -F "throw-deprecation scheduler output: tests=205 pass=204 fail=0 skipped=1" "$report"
grep -F "node --check: PASS" "$report"
grep -F "git diff --check: PASS" "$report"
grep -F "normalized scope: PASS" "$report"
grep -E '^Reviewer 1: identity=.+ model=.+ outcome=PASS$' "$report"
grep -E '^Reviewer 2: identity=.+ model=.+ outcome=PASS$' "$report"
```

The report is excluded from the six-file review seal and has no self-hash. Final guards still verify report type, content, and whitespace.

### Step 5: launch two fresh Sol/high reviews over exact seals

Review handoff includes:

- V11 path and hash from `/tmp/task6-active-plan.sha256`
- RED evidence transcript and hash from `/tmp/task6-v11-red-evidence.sha256`
- six-file metadata from `/tmp/task6-six-file-meta.tsv`
- six-file content hashes from `/tmp/task6-six-file-sha256.txt`
- normal and throw-deprecation scheduler outputs
- baseline prefix/name proof
- normalized inventory/forbidden diff output
- report machine-validation output

Any change to a six sealed file, V11 plan, inventory helper, or RED evidence invalidates approvals and requires rerunning verification, recomputing hashes, and launching two new fresh reviewers.

### Step 6: final guard before handoff

```bash
sha256sum -c /tmp/task6-active-plan.sha256
python3 - <<'PY'
import os, stat, subprocess
path = 'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v11.md'
st = os.lstat(path)
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
    raise SystemExit('active plan must remain a real regular file')
if oct(stat.S_IMODE(st.st_mode)) != '0o644':
    raise SystemExit('active plan fs mode changed')
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, p = record.split(b'\t', 1)
    tracked[p.decode()] = meta.split()[0].decode()
if tracked.get(path, '-') not in ('-', '100644'):
    raise SystemExit('active plan tracked mode changed')
PY
sha256sum -c /tmp/task6-inventory-functions.sha256
sha256sum -c /tmp/task6-v11-red-evidence.sha256
sha256sum -c /tmp/task6-six-file-sha256.txt
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
test -f docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
test ! -L docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
test "$(stat -c '%a' docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md)" = 644
. /tmp/task6-inventory-functions.sh
task6_six_file_meta > /tmp/task6-six-file-meta-final.tsv
diff -u /tmp/task6-six-file-meta.tsv /tmp/task6-six-file-meta-final.tsv
task6_inventory > /tmp/task6-final-inventory.tsv
rg -n '[[:blank:]]+$' docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

Repeat the normalized allowlist comparison with `/tmp/task6-final-inventory.tsv`. Do not hand off completion if any command fails.

## Self-audit checklist

- V11 file is new; V1-V10 are preserved.
- Bridge `getStatus` calls `writer.status()`, `_datSignalHandlerInstalled` is a non-enumerable function, and `_datDatabaseClosing` creates a cache-only post-close `SCHEDULER_DB_CLOSED` status.
- Timer cleanup defines or calls `clearAllTimers`, `clearMutationTimers`, `clearPollTimer`, and `clearGraceTimer`; stop/DB close clear all timers, lease loss retains exactly one standby poll.
- Helper methods never record job metrics. Finalizer records once for newly adopted continuations and zero for exact pre-existing blocked rows.
- `after-claim` hook is after committed claim and before effect UoW; five crash stages are exact.
- Retarget persisted identity corruption is `PAYLOAD_INTEGRITY`; retarget invalid is input-only; unrelated blocked row conflicts.
- Startup recovery uses integrity assertion, conditional durable mark, staged ids, fresh rebase, final fence, and postcommit publication.
- Global list/eligibility recompute occurs inside claim UoW after effective time.
- Task5 downstream is exact: strict partial wrapper, prepare before insert, replay validation/effect skipping, exact Store terminal methods, final fence before commit.
- Direct path never passes `deferAccountWake:true`; established-zero continuation and external dependency fallback are explicit.
- 42 cases cover parent Task6 obligations, not only the latest regressions.
- Accepted 163 tests are protected by prefix hash and final baseline-name comparison.
- RED evidence is retained and hashed.
- Six source/test paths and report path are real non-symlink files with exact mode/type metadata.
- Report machine-validation checks exact plan hash, six hashes, verification counts, RED evidence hash, scope results, and two PASS reviewer lines.

## Completion definition

Task 6 is complete only when every V11 RED case has an evidence transcript, implementation passes normal and throw-deprecation scheduler runs with 205/204/0/1, original 163 tests are proven append-only unchanged, six-file real-file/mode/content seals pass, report machine-validation passes, normalized scope guards pass, and two fresh Sol/high reviewers approve the exact sealed six-file hashes under the externally pinned V11 plan.
