# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V14

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every implementation wave and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark, retry/backoff/quarantine, command MutationGate, fresh cutover, CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** V14 treats the parent Task6 test block as authoritative. Parent has 66 syntactic `test()` definitions but 73 runtime registrations because three dynamic definitions expand to 3, 3, and 4 tests. V14 preserves those 73 runtime parent tests and adds 9 remediation overlays, for `N=82` added tests. Implementation copies complete parent ranges and then applies only live-ABI/remediation overlays; parent Task6, accepted Task5, and live source win over V1-V13 pseudocode.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`, pinned below. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`, pinned below.

## Global constraints

- Preserve V1-V13 plan artifacts. This planning task creates only this V14 file.
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
- Added total: `parent runtime=73 + overlay=9 => N=82`.
- Expected final scheduler TAP from accepted baseline `163/162/0/1`: `245 tests`, `244 pass`, `0 fail`, `1 skipped`. If preflight baseline differs, stop and report drift.
- Parent regression 73 tests do not require individual RED proofs or sentinels; some may already pass after Tasks 1-5. Import them faithfully, verify exact runtime-name multiset/count, and preserve their fixtures/assertions.
- Only the 9 overlay tests require one-time isolated RED evidence with unique sentinels and lazy imports.
- No report self-hash. Capture V14 hash externally after authoring.
- No un-negated whitespace `rg`; use `if rg ...; then exit 1; fi`.

## Pinned authority hashes

Preflight, Stage-A, and Stage-B must verify all three authorities as real regular non-symlink files with filesystem mode `100644` and these SHA256 hashes:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
<captured after authoring>  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v14.md
```

Authority check:

```bash
python3 - <<'PY'
import os, stat, sys
for path in [
  'docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md',
  'docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md',
  'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v14.md',
]:
    st = os.lstat(path)
    mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
        raise SystemExit(path + ' must be real regular 100644, got ' + mode)
PY
sha256sum -c <<'EOF'
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
EOF
sha256sum docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v14.md \
  > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

## Complete Store consumption list

This is the complete Task6 Store consumption list used by writer/index/cutover. If implementation adds another Store call, update this list before coding and include it in review handoff.

- `new SchedulerStore(kho, clock)`
- `assertSchedulerOwnerId(ownerId)`
- `validateJob(job)`
- `normalizeSchedulerErrorCode(error)`
- `safeErrorMessage(value)` through `store.safeErrorMessage`
- `schedulerMode()`
- `peekEffectiveNowMs(wallNowMs)`
- `recordEffectiveNowMs(token, effectiveNowMs)`
- `acquireLease(ownerId, nowMs, leaseMs)`
- `renewLease(token, nowMs, leaseMs)`
- `releaseLease(token, nowMs)`
- `leaseTokenIsLive(token, nowMs)`
- `assertLiveLease(token, nowMs)`
- `claimNext(token, nowMs, watermarkS, lockMs)`
- `claimForResolution(token, jobId, nowMs, lockMs, options)`
- `resumeOwnedRunning(token, jobId, nowMs, lockMs)`
- `getById(jobId)`
- `getByIdempotencyKey(key)`
- `loadExecutableJob(token, row, nowMs)`
- `hasCommittedApplication(token, executableJob, nowMs)`
- `insertApplication(token, executableJob, application, nowMs, canonicalTContext)`
- `checkpointPartial(token, job, revision, nowMs)`
- `markDurableMutation(token, nowMs)`
- `completeApplied(token, job, nowMs)`
- `finishResolved(token, job, state, reason, nowMs)`
- `completeAccountAdvanceAndScheduleSuccessor(token, job, nextLocalAtS, nowMs)`
- `fail(token, job, failure, nowMs, policy)`
- `recoverExpiredRunning(token, nowMs, policy)`
- `statusSnapshot(nowMs)`
- `globalWatermarkS()`
- `nextEligibleAtMs(nowMs, watermarkS)`
- `nextAccountEligibleAtMs(watermarkS)`
- `listBarrierJobsAtOrBefore(token, targetS, nowMs)`
- `adoptAccountAdvanceForCommand(token, accountId, targetS, nowMs, lockMs)`
- `replaceAccountAdvance(token, accountId, revision, nextLocalAtS, nowMs)`
- `blockOwnedAccountAdvance(token, job, checkpointRevision, blockedByJobId, nowMs)`
- `parkGlobalBehindPreceding(token, runningJob, precedingJobId, targetS, nowMs)` only through live `advanceBarrier`; writer must not double-call after an already-parked result.
- `assertAccountDependencyIntegrity(token, nowMs)`
- New Task6 primitives: `quarantineClaimedRaw(token, raw, failure, nowMs)`, `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)`, and read-only startup recovery preview helper if implemented.

## Live ABI overlays

- Live reducer ABI is `initializeCombatSeed(leaseToken, effectiveNowMs)`, `prepare(mutation, executableJob, options)`, and `applyPrepared(mutation, prepared)`.
- Live Task5 `prepareAccount` returns partials with `prepared.advanceResult`, `prepared.saveReceipt`, and `apply()` returning exactly `{checkpointRevision: receipt && receipt.revision, saveReceipt: receipt}`. Reviewers must reject `prepared.deferredExternal` drift.
- Live `advanceService.advanceBarrier` parks preceding roots itself and returns `blockedExternal:true`/`blockedExternalJobId`; writer recognizes this as already parked.
- Live World command batch verification uses `world._schedulerActive(mutation)`. Do not use `_mutationContexts`.
- Live World has no `advanceDueNoiBo`; writer implements `advanceDueInCurrentUow` using `kho.q.dqDenHan` and `world.advanceAccountNoiBo`.
- Live CLI clock is `taoClock()` from `server/clock.js`; live Kho close is `kho.dong()`.

---

## Task 1: Preflight inventory, parent import, expected names, and overlay RED evidence

**Files:**

- Modify: `tools/test-scheduler.js`
- Temp artifacts: `/tmp/task6-v14-*`

**Interfaces:**

- Produces the imported parent test block, overlay test block, expected-name artifacts, baseline guard, and frozen overlay RED evidence.

- [ ] **Step 1: Capture normalized PRE inventory before any test/source/report edit**

Create and hash the inventory helper:

```bash
cat > /tmp/task6-v14-inventory.sh <<'SH'
repo_inventory() {
  python3 - <<'PY'
import hashlib, os, stat, subprocess
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, path = record.split(b'\t', 1)
    tracked[path.decode()] = meta.split()[0].decode()
paths = set(tracked)
for dirpath, dirnames, filenames in os.walk('.', topdown=True, followlinks=False):
    dirnames[:] = [d for d in dirnames if d != '.git']
    rel_dir = dirpath[2:] if dirpath.startswith('./') else dirpath
    for name in list(dirnames):
        path = os.path.join(rel_dir, name) if rel_dir else name
        try:
            st = os.lstat(path)
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(st.st_mode):
            paths.add(path)
            dirnames.remove(name)
    for name in filenames:
        path = os.path.join(rel_dir, name) if rel_dir else name
        paths.add(path)
for path in sorted(paths):
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        print(path + '\tmissing\t-\t-\t-\t-\t' + tracked.get(path, '-'))
        continue
    fs_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    git_mode = tracked.get(path, '-')
    if stat.S_ISLNK(st.st_mode):
        print(path + '\tsymlink\t' + fs_mode + '\t' + str(st.st_size) + '\t-\t' + os.readlink(path) + '\t' + git_mode)
    elif stat.S_ISREG(st.st_mode):
        with open(path, 'rb') as fh:
            data = fh.read()
        print(path + '\tfile\t' + fs_mode + '\t' + str(len(data)) + '\t' + hashlib.sha256(data).hexdigest() + '\t-\t' + git_mode)
    elif stat.S_ISDIR(st.st_mode):
        print(path + '\tdir\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
    else:
        print(path + '\tother\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
PY
}
SH
sha256sum /tmp/task6-v14-inventory.sh > /tmp/task6-v14-inventory.sh.sha256
. /tmp/task6-v14-inventory.sh
repo_inventory > /tmp/task6-v14-pre-inventory.tsv
sha256sum /tmp/task6-v14-pre-inventory.tsv > /tmp/task6-v14-pre-inventory.tsv.sha256
```

- [ ] **Step 2: Capture baseline and prefix bytes**

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v14-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v14-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v14-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v14-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v14-baseline.tap
node - <<'NODE' /tmp/task6-v14-baseline.tap > /tmp/task6-v14-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v14-baseline-names.txt > /tmp/task6-v14-baseline-names.txt.sha256
node - <<'NODE' > /tmp/task6-v14-test-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const path = 'tools/test-scheduler.js';
const marker = '// TASK6_V14_PARENT_TASK6_TESTS_START';
const data = fs.readFileSync(path);
if (data.includes(Buffer.from(marker))) throw new Error('TASK6_V14_MARKER_ALREADY_PRESENT');
console.log([data.length, crypto.createHash('sha256').update(data).digest('hex')].join('\t'));
NODE
```

- [ ] **Step 3: Append complete parent test code blocks**

Append after exactly:

```js
// TASK6_V14_PARENT_TASK6_TESTS_START
```

Copy the complete parent blocks exactly, with only path/import adaptation required by live test harness. Do not copy cut snippets.

```bash
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
sed -n '10886,11844p' "$parent" > /tmp/task6-v14-parent-block-1.txt
sed -n '11848,12485p' "$parent" > /tmp/task6-v14-parent-block-2.txt
sed -n '12490,12833p' "$parent" > /tmp/task6-v14-parent-block-3.txt
sed -n '12837,13070p' "$parent" > /tmp/task6-v14-parent-block-4.txt
sha256sum /tmp/task6-v14-parent-block-*.txt > /tmp/task6-v14-parent-blocks.sha256
```

The implementation must preserve runtime names and assertions from these blocks. Parent tests do not need sentinels or individual RED proofs.

- [ ] **Step 4: Create deterministic expected parent73 runtime names**

```bash
cat > /tmp/task6-v14-parent73-names.txt <<'EOF'
deterministic retry jitter is always in the inclusive 0..999 contract
writer in legacy mode remains health-visible but cannot ready or drain
direct SchedulerWriter construction rejects a non-UUID owner before DB work
dynamic empty NPC and self targets defer commands to one canonical global
ordinary drain checkpoints every dynamically external target before global resume
public advanceTo persists the same restart-safe dynamic dependency
retry and quarantine never release or spin the handed source continuation
global release resumes a no-op source wake and preserves its one future successor
real Writer settles reciprocal same-T attacks once without recursive resolution
established zero reaches account service: pure completion or durable partial
public advanceTo aggregates two barriers into exactly five requested-account fields
runCommand and advanceTo count committed local primitives exactly once
Writer ledger retains primitives consumed before parking behind a preceding root
commit-scoped metric ledger sums primary and secondary and discards rollback
real Writer uses priority before insertion for same-T fleet and missile
real Writer preserves same-kind cross-account insertion sequence
same-owner same-T fleets use persisted sequence while solo keeps reverse-array order
real Writer re-queries a reducer-created same-T fleet before a missile
real Writer completes a local T primitive before the external reducer snapshot
same-T eligible RETRY_WAIT remains before the later PENDING global tuple
blocked global root still advances account work only through its watermark
foreign RUNNING first global tuple blocks generic account work
QUARANTINED root permits only due account work through its watermark
after-claim crash leaves the committed global RUNNING at attempt zero
49,999 locals plus one global consume the exact shared 50,000 budget
50,000 locals leave the global RUNNING for batch two without an effect
many same-T globals each charge once and retain flat resolver depth
exact-zero completion arms one macrotask for the next global
exact-zero global completion also wakes a due account continuation
only one direct writer owns the lease and a released holder permits a new generation
manualDrain starts with no timer and mutates a due job only on explicit drainNow
committed schedule replaces a later wake with an earlier eligible wake
test-only fatal crash clears mutation timers without releasing its live lease
fatal and crashed writers are terminal and start cannot resurrect timers or a lease
one transient heartbeat error rearms below lease third and the next renewal succeeds
partial RUNNING job checkpoints its own revision and completes event 50,001 in batch two
MutationGate defers an account command at primitive 50,001 without running its closure
MutationGate adopts the successor made by a direct partial advance before it returns
mail secondary partial commits checkpoint before one domain effect
war secondary partial commits checkpoint before one domain effect
galana secondary partial commits checkpoint before one domain effect
zero-progress secondary adopts its wake after primary spends exactly 50,000
mail suppresses its effect when secondary discovers an external ref
war suppresses its effect when secondary discovers an external ref
galana suppresses its effect when secondary discovers an external ref
advance-due propagates deferredExternal and never reaches its closure
MutationGate defers a cross-account barrier at primitive 50,001 before its closure
an outside revision after a partial keeps external stale rejection intact
standby automatically takes over after the active lease expires
real takeover after committed claim rejects the stale effect UoW
a retrying local poison does not stop an independent aggregate before T
classified retry reaches attempt eight then quarantines while an independent aggregate completes
an unclassified reducer exception quarantines instead of retrying
quarantine transition emits one scrubbed post-commit warning and retries emit none
tick logging honors canonical and alias precedence only after committed flush
rolled-back effect emits no tick and fatal error logs one redacted stable record
tampered stored payload quarantines before EventReducer.prepare receives it
a quarantined global poison holds readiness data and rejects a later MutationGate command
global retry keeps watermark while unrelated local work does not cross T
command barrier rolls back after-application-insert before retry
advance barrier rolls back after-application-insert before retry
command barrier rolls back after-game-mutation before retry
advance barrier rolls back after-game-mutation before retry
heartbeat renews before lease/3 and loss changes writer to standby without a real sleep
public bridge advanceTo uses the writer lease and GameAdvanceService result
public bridge rejects a target beyond effective time before a marker or barrier write
invalid bridge command fails before enqueue, durable marker, or game write
MutationGate drains pending PvP at T before admitting the later command
adapter caches a deterministic makeOwnerId wrapper without a scalar owner field
production adapter creates and retains one UUID-v4 owner when no test wrapper exists
bridge implements every writer surface and a rejected tail never poisons the next call
reconcile refuses before enqueue or DB write when no seam is installed
taoScheduler memoizes one bridge and one world capability set per Kho
EOF
wc -l /tmp/task6-v14-parent73-names.txt | grep -E '^73 '
sort /tmp/task6-v14-parent73-names.txt | uniq -d > /tmp/task6-v14-parent73-duplicates.txt
test ! -s /tmp/task6-v14-parent73-duplicates.txt
sha256sum /tmp/task6-v14-parent73-names.txt > /tmp/task6-v14-parent73-names.txt.sha256
```

- [ ] **Step 5: Add overlay9 tests with lazy imports and sentinels**

Append after:

```js
// TASK6_V14_REMEDIATION_OVERLAY_TESTS_START
```

Overlay names and sentinels:

| # | Runtime test name | Sentinel |
|---:|---|---|
| 1 | `Task 6 v14 remediation Task5 live ABI order replay and arity are exact` | `TASK6V14_RED_001_TASK5_ABI` |
| 2 | `Task 6 v14 remediation partial receipt wrapper identity and established zero retention are exact` | `TASK6V14_RED_002_PARTIAL_RECEIPT` |
| 3 | `Task 6 v14 remediation raw malformed payload quarantines without reducer prepare or payload parse` | `TASK6V14_RED_003_RAW_QUARANTINE` |
| 4 | `Task 6 v14 remediation status nested metrics validation clone and DB close seams are exact` | `TASK6V14_RED_004_STATUS_DB_CLOSE` |
| 5 | `Task 6 v14 remediation external only same key retarget and unrelated block are exact` | `TASK6V14_RED_005_RETARGET` |
| 6 | `Task 6 v14 remediation startup near expiry recovery renews and rebases before ready` | `TASK6V14_RED_006_STARTUP_REBASE` |
| 7 | `Task 6 v14 remediation advance due 61 boundary is partial and does not run closure` | `TASK6V14_RED_007_DUE_61` |
| 8 | `Task 6 v14 remediation runMaintenanceCutover fresh only release policy is exact` | `TASK6V14_RED_008_CUTOVER` |
| 9 | `Task 6 v14 remediation scheduler cutover CLI grammar lifecycle and exports are exact` | `TASK6V14_RED_009_CLI` |

Required overlay assertions:

- Overlay 1: assert live reducer arities, mark-before-barrier/prepare, already-applied replay validation/effect skip, zero-budget unapplied global returns partial before prepare, and Task5 terminal method mapping.
- Overlay 2: assert exact partial wrapper prototype/keys/order/no extras/receipt identity and established-zero RUNNING lock byte retention.
- Overlay 3: corrupt RUNNING payload bytes and prove raw quarantine without reducer prepare or payload parse.
- Overlay 4: invalid nested metrics and invalid bucket values yield `SCHEDULER_STATUS_INVALID`; returned `jobAttempts`, `jobDuration`, bucket arrays, `leaseAcquire`, and `reconcile` are deep clones; expired held lease transitions synchronously to `SCHEDULER_LEASE_LOST`; `_datDatabaseClosing` caches status and performs no SQLite read after close; private descriptors are non-enumerable.
- Overlay 5: retarget absent same key returns null; same-key canonical contradiction maps `PAYLOAD_INTEGRITY`; RUNNING/blocked/terminal conflicts fail; unrelated block A while dependency B does not produce success or metrics.
- Overlay 6: startup preview detects recovery mutation, marker precedes `recoverExpiredRunning`, `renewLease(token,freshNow,leaseMs) === true` before rebase/final fence, each staged RUNNING row lock and lease expiry are `> finalNow`, and timers/queues publish only after commit.
- Overlay 7: 61 due accounts with limit 60 returns partial/TICK_PARTIAL, closure count 0, and manualDrain arms no implicit continuation.
- Overlay 8: cutover exact context `{kho,clock,ownerId}`, migration before Store, `context.kho.trongGiaoDich(fn,{immediate:true})`, literal lease 15000 or named constant equal 15000, nonlegacy/nonempty guards, seed only combat seed, audit `CUTOVER`, same-token release; release error preserves primary without logger and propagates when no primary.
- Overlay 9: CLI injected deps `{openKho,makeOwnerId,clock}`, validates before open, owner is `assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)())`, uses `taoClock()` default, calls cutover, returns exact `{exitCode,stdout,stderr}`, closes `kho.dong()` in `finally`, safe code-only stderr, exports `{parseArgs,runCli,main}`, require-main uses `process.argv.slice(2)`, and never calls `process.exit`.

- [ ] **Step 6: Freeze RED evidence only for overlay9**

Refuse overwrite unless cleanup is chosen before any proof:

```bash
if test -e /tmp/task6-v14-red-evidence.tap; then
  echo 'Existing V14 overlay RED evidence exists. Remove it only before first proof if restarting preflight.' >&2
  exit 1
fi
: > /tmp/task6-v14-red-evidence.tap
run_one_overlay_red() {
  name="$1"
  sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v14-overlay-red.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" \
      tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"
    rm -f "$tmp"
    echo "Overlay RED unexpectedly passed: $name" >&2
    exit 1
  fi
  grep -F "# Subtest: $name" "$tmp"
  grep -F "not ok 1 - $name" "$tmp"
  grep -F "$sentinel" "$tmp"
  {
    printf '%s\n' '### TASK6_V14_OVERLAY_RED_CASE_START'
    printf '%s\n' "name=$name"
    printf '%s\n' "sentinel=$sentinel"
    cat "$tmp"
    printf '%s\n' '### TASK6_V14_OVERLAY_RED_CASE_END'
  } >> /tmp/task6-v14-red-evidence.tap
  rm -f "$tmp"
}
```

Run exactly 9 `run_one_overlay_red` invocations in table order, then:

```bash
grep -c '^### TASK6_V14_OVERLAY_RED_CASE_START$' /tmp/task6-v14-red-evidence.tap | grep -E '^9$'
grep -c '^### TASK6_V14_OVERLAY_RED_CASE_END$' /tmp/task6-v14-red-evidence.tap | grep -E '^9$'
sha256sum /tmp/task6-v14-red-evidence.tap > /tmp/task6-v14-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v14-red-evidence.tap.sha256
```

---

## Task 2: Writer status, timers, startup, and lifecycle

**Files:**

- Create: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Test: parent runtime tests 1-3, 30-35, 45, 49, 57, 64, 69-73; overlays 4 and 6

**Interfaces:**

- Produces `module.exports = {SchedulerWriter: SchedulerWriter}` and internal status helpers.

- [ ] **Step 1: Implement status helpers explicitly in `writer.js`**

Use this implementation as the authoritative status core; adapt only names that already exist in the surrounding writer.

```js
function newWriterMetricState() {
  return {
    jobAttempts: {},
    jobDuration: {},
    advanceProcessed: 0,
    advanceBudgetExhaustedTotal: 0,
    leaseAcquire: {acquired: 0, unavailable: 0, error: 0},
    reconcile: {success: 0, error: 0},
    lastSuccessfulDrainTimestampMs: 0
  };
}
function isPlainObject(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function finiteNonNegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}
function cloneDuration(value) {
  if (!isPlainObject(value)) throw schedulerError('SCHEDULER_STATUS_INVALID');
  if (!finiteNonNegative(value.count) || !finiteNonNegative(value.sum) ||
      !Array.isArray(value.buckets) || value.buckets.length !== 5 ||
      !value.buckets.every(finiteNonNegative)) {
    throw schedulerError('SCHEDULER_STATUS_INVALID');
  }
  return {count: Number(value.count), sum: Number(value.sum),
    buckets: value.buckets.map(Number)};
}
function cloneMetricMap(map, valueValidator) {
  if (!isPlainObject(map)) throw schedulerError('SCHEDULER_STATUS_INVALID');
  return Object.keys(map).reduce(function (out, key) {
    if (typeof key !== 'string' || key.length > 128) {
      throw schedulerError('SCHEDULER_STATUS_INVALID');
    }
    out[key] = valueValidator(map[key]);
    return out;
  }, {});
}
function cloneMetricCounters(map, keys) {
  if (!isPlainObject(map)) throw schedulerError('SCHEDULER_STATUS_INVALID');
  return keys.reduce(function (out, key) {
    if (!finiteNonNegative(map[key])) throw schedulerError('SCHEDULER_STATUS_INVALID');
    out[key] = Number(map[key]);
    return out;
  }, {});
}
function validateAndCloneMetrics(metrics) {
  metrics = Object.assign(newWriterMetricState(), metrics || {});
  if (!finiteNonNegative(metrics.advanceProcessed) ||
      !finiteNonNegative(metrics.advanceBudgetExhaustedTotal) ||
      !finiteNonNegative(metrics.lastSuccessfulDrainTimestampMs)) {
    throw schedulerError('SCHEDULER_STATUS_INVALID');
  }
  return {
    jobAttempts: cloneMetricMap(metrics.jobAttempts, function (value) {
      if (!finiteNonNegative(value)) throw schedulerError('SCHEDULER_STATUS_INVALID');
      return Number(value);
    }),
    jobDuration: cloneMetricMap(metrics.jobDuration, cloneDuration),
    advanceProcessed: Number(metrics.advanceProcessed),
    advanceBudgetExhaustedTotal: Number(metrics.advanceBudgetExhaustedTotal),
    leaseAcquire: cloneMetricCounters(metrics.leaseAcquire, ['acquired', 'unavailable', 'error']),
    reconcile: cloneMetricCounters(metrics.reconcile, ['success', 'error']),
    lastSuccessfulDrainTimestampMs: Number(metrics.lastSuccessfulDrainTimestampMs)
  };
}
function canonicalSchedulerStatus(raw, durableOptions) {
  var counts = Object.assign({
    pending: 0, retryWait: 0, running: 0, quarantined: 0, dueBacklog: 0
  }, raw.counts || {});
  var ages = Object.assign({oldestDueAgeMs: 0, nextEligibleAtMs: null}, raw.ages || {});
  ['pending', 'retryWait', 'running', 'quarantined', 'dueBacklog'].forEach(function (key) {
    if (!finiteNonNegative(counts[key])) throw schedulerError('SCHEDULER_STATUS_INVALID');
    counts[key] = Number(counts[key]);
  });
  if (!finiteNonNegative(ages.oldestDueAgeMs) ||
      (ages.nextEligibleAtMs !== null && !finiteNonNegative(ages.nextEligibleAtMs))) {
    throw schedulerError('SCHEDULER_STATUS_INVALID');
  }
  ages.oldestDueAgeMs = Number(ages.oldestDueAgeMs);
  ages.nextEligibleAtMs = ages.nextEligibleAtMs === null ? null : Number(ages.nextEligibleAtMs);
  var metrics = validateAndCloneMetrics(raw.metrics);
  var reason = null;
  if (!raw.dbOpen) reason = 'SCHEDULER_DB_CLOSED';
  else if (raw.state === 'fatal' || raw.reason === 'SCHEDULER_STORAGE_FATAL') reason = 'SCHEDULER_STORAGE_FATAL';
  else if (raw.state === 'crashed' || raw.reason === 'SCHEDULER_CRASHED') reason = 'SCHEDULER_CRASHED';
  else if (raw.state === 'stopped' || raw.reason === 'SCHEDULER_STOPPED') reason = 'SCHEDULER_STOPPED';
  else if (raw.mode !== 'durable') reason = 'SCHEDULER_MODE_LEGACY';
  else if (raw.reason === 'SCHEDULER_LEASE_LOST') reason = 'SCHEDULER_LEASE_LOST';
  else if (!raw.writerLeaseHeld) reason = 'SCHEDULER_LEASE_UNHELD';
  else if (!raw.recoveryComplete) reason = 'SCHEDULER_RECOVERING';
  else if (raw.draining) reason = 'SCHEDULER_DRAINING';
  else if (counts.quarantined > durableOptions.maxQuarantinedReady) reason = 'SCHEDULER_QUARANTINE_LIMIT';
  else if (ages.oldestDueAgeMs > durableOptions.maxBacklogAgeMs) reason = 'SCHEDULER_BACKLOG_AGE_LIMIT';
  return {
    mode: raw.mode || 'legacy',
    state: reason === 'SCHEDULER_LEASE_LOST' ? 'standby' : raw.state,
    ready: reason === null,
    reason: reason,
    writerLeaseHeld: Boolean(raw.writerLeaseHeld),
    leaseHeld: Boolean(raw.leaseHeld === undefined ? raw.writerLeaseHeld : raw.leaseHeld),
    watermarkS: raw.watermarkS === undefined ? null : raw.watermarkS,
    counts: counts,
    ages: ages,
    pending: counts.pending,
    retryWait: counts.retryWait,
    running: counts.running,
    quarantined: counts.quarantined,
    dueBacklog: counts.dueBacklog,
    oldestDueAgeMs: ages.oldestDueAgeMs,
    nextEligibleAtMs: ages.nextEligibleAtMs,
    dbOpen: Boolean(raw.dbOpen),
    recoveryComplete: Boolean(raw.recoveryComplete),
    draining: Boolean(raw.draining),
    wakeTimerActive: Boolean(raw.wakeTimerActive),
    pollTimerActive: Boolean(raw.pollTimerActive),
    heartbeatTimerActive: Boolean(raw.heartbeatTimerActive),
    reconcileTimerActive: Boolean(raw.reconcileTimerActive),
    signalHandlerInstalled: Boolean(raw.signalHandlerInstalled),
    metrics: metrics
  };
}
function cloneSchedulerStatus(status) {
  return canonicalSchedulerStatus(status, {
    maxQuarantinedReady: Number.MAX_SAFE_INTEGER,
    maxBacklogAgeMs: Number.MAX_SAFE_INTEGER
  });
}
function computeOpenStatusFromStore(writer) {
  var nowMs = Math.max(writer.lastEffectiveNowMs, writer.clock.nowMs());
  var aggregate = writer.store.statusSnapshot(nowMs);
  var mode = writer.store.schedulerMode();
  var watermarkS = writer.store.globalWatermarkS();
  var tokenLive = Boolean(writer.leaseToken &&
    writer.store.leaseTokenIsLive(writer.leaseToken, nowMs));
  if (writer.leaseToken && !tokenLive && writer.dbOpen && writer.state !== 'fatal') {
    writer.transitionLeaseLost(schedulerError('LEASE_LOST'));
  }
  return canonicalSchedulerStatus({
    mode: mode,
    state: writer.state,
    reason: writer.reason,
    dbOpen: writer.dbOpen,
    writerLeaseHeld: tokenLive,
    leaseHeld: tokenLive,
    watermarkS: watermarkS,
    counts: {
      pending: aggregate.pending,
      retryWait: aggregate.retryWait,
      running: aggregate.running,
      quarantined: aggregate.quarantined,
      dueBacklog: aggregate.dueBacklog
    },
    ages: {
      oldestDueAgeMs: aggregate.oldestDueAgeMs,
      nextEligibleAtMs: aggregate.nextEligibleAtMs
    },
    recoveryComplete: writer.recoveryComplete,
    draining: writer.draining,
    wakeTimerActive: Boolean(writer.wakeTimer),
    pollTimerActive: Boolean(writer.pollTimer),
    heartbeatTimerActive: Boolean(writer.heartbeatTimer),
    reconcileTimerActive: Boolean(writer.reconcileTimer),
    signalHandlerInstalled: Boolean(writer.signalHandlerState && writer.signalHandlerState.installed),
    metrics: writer.metrics
  }, writer.durableOptions);
}
```

`SchedulerWriter.prototype.status` must:

- Return `cloneSchedulerStatus(this.closedStatusCache)` when `dbOpen === false`.
- Otherwise call `computeOpenStatusFromStore(this)`, set `lastSafeStatusAggregate` and `lastStatusCache` to deep clones, and return a deep clone.
- Catch `SCHEDULER_STATUS_INVALID` raised by validation and return a cache-safe canonical status whose `ready` is `false`, `reason` is `SCHEDULER_STATUS_INVALID`, and nested metric objects are deep-cloned from the last valid cache or `newWriterMetricState()`. This catch is only for status validation; fatal Store read errors still transition fatal.
- If Store reads throw fatal storage, transition fatal and return a canonical status from the last safe cache with fatal reason.

- [ ] **Step 2: Timers and DB-close**

- `clearMutationTimers` clears wake, heartbeat, retry/continuation, and reconcile. It does not clear standby acquisition poll when called from `transitionLeaseLost`.
- `clearPollTimer` clears only poll.
- `clearGraceTimer` clears shutdown grace.
- `clearAllTimers` calls all three.
- Lease loss uses `clearMutationTimers` then ensures one poll if allowed.
- Fatal, crashed, beginStop, stop, startup failure, and DB-close use `clearAllTimers`.
- `_datDatabaseClosing` captures safe status before `dbOpen=false`, stores `closedStatusCache`, sets reason `SCHEDULER_DB_CLOSED`, clears all timers, and guarantees later `status()` does not touch SQLite.

- [ ] **Step 3: Startup near-expiry recovery**

Startup must satisfy overlay 6:

1. Preview expired RUNNING rows under live lease.
2. If preview count is nonzero, mark durable before `recoverExpiredRunning`.
3. Stage IDs to resume; do not queue or arm timers precommit.
4. Immediately before rebase, compute `freshNow = recordEffectiveNowInCurrentUow(token, Math.max(clock.nowMs(), lastEffectiveNowMs))`.
5. Require `store.renewLease(token, freshNow, leaseMs) === true` before rebase/final fence.
6. Rebase each staged RUNNING row with `resumeOwnedRunning(token, jobId, freshNow, leaseMs)`.
7. Compute `finalNow = Math.max(freshNow, effectiveNowMs())`; assert live lease expiry and every rebased `locked_until_ms` are `> finalNow`.
8. Final lease fence uses `finalNow`; commit; only after commit publish queues/timers.

---

## Task 3: Claim, downstream Task5 lifecycle, retry/quarantine, and direct continuations

**Files:** `server/scheduler/writer.js`, `server/scheduler/store.js`, `tools/test-scheduler.js`

**Tests:** parent runtime tests 4-29, 36-63; overlays 1, 2, 3, 5, and 7.

- [ ] **Step 1: Claim and global classification**

Copy parent production from lines 13950-14595, then apply these corrections:

- `partialQueue` stores string IDs. Rotate watermark-ineligible partial IDs.
- Use `this.leaseMs`.
- Effective time is recorded inside each claim UoW.
- `callFaultHook('before-claim', rowOrNull)` runs inside global and account claim UoWs before resume/claim.
- `callFaultHook('after-claim', claimed)` runs after the claim UoW commits and before effect UoW.
- Global classification handles owned RUNNING resume, future RETRY_WAIT, QUARANTINED, and foreign RUNNING with exact `blocked/allowAccount` behavior from parent tests 21-23.

- [ ] **Step 2: Accepted Task5 downstream order**

Use Task5 remediation lines 825-833 exactly:

1. `BEGIN IMMEDIATE`, live mutation token, `world.trongMutationScheduler`, lease assert, Store-loaded executable.
2. `markDurableMutationInCurrentUow(mutation, nowMs)` before barrier, prepare, or staged save.
3. Global `advanceBarrier`; recognize already-parked result from live service and do not call `parkGlobalBehindPreceding` again.
4. Replay/charge before prepare; already committed application charges zero.
5. Zero-budget unapplied global returns partial before prepare.
6. Account partial calls `applyPrepared(mutation, prepared)` once and validates wrapper/identity.
7. Prepared path always calls `insertApplication` for validation, skips effect only when already applied, then calls exactly one terminal Store method.
8. No manual World flush after apply; no durable write after final fence.

- [ ] **Step 3: Settlement and raw quarantine**

Implement:

- `INJECTED_CRASH` rethrows, no settlement.
- Original `LEASE_LOST` transitions lease lost and rethrows original.
- Original fatal storage transitions fatal and rethrows original.
- Ordinary failure opens fresh settlement UoW, reloads raw by job id, brands with `loadExecutableJob`, then `store.fail`.
- If branding fails payload integrity, `quarantineClaimedRaw` does lease-fenced raw quarantine with no payload parse.
- Settlement fatal/lease errors transition lifecycle but rethrow original reducer error unchanged.

- [ ] **Step 4: Direct retarget and due boundary**

- Add `retargetOwnedPendingAccountAdvanceForCommand` with exact overlay 5 contract.
- Implement `advanceDueInCurrentUow(mutation, nowS, limit)` using live `kho.q.dqDenHan` limit+1 or rescan, `world.advanceAccountNoiBo`, and manualDrain no-continuation behavior.

---

## Task 4: Commands, reconcile gate, factory, cutover, and CLI

**Files:** `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `tools/test-scheduler.js`

**Tests:** parent runtime tests 58-73 and overlays 8-9.

- [ ] **Step 1: Commands and reconcile**

Copy parent command/advanceTo production from lines 14595-14870, then apply:

- Thenable error is exact `UNIT_OF_WORK_ASYNC`.
- Use live `world._schedulerActive(mutation)` in command world batch.
- Account finalizer executes inside owning UoW before final fence/commit, including partial.
- `manualDrain` never arms implicit continuation.
- Missing reconciler rejects `SCHEDULER_RECONCILER_UNAVAILABLE` before enqueue/DB. Installed reconciler owns Task9 page UoWs; writer does not wrap it in parent UoW.

- [ ] **Step 2: Factory/index**

Copy parent factory from lines 14870-15249:

- Production keys: `clock,env,kho,logger,schedulerOptions,tg`
- Production-test keys: `clock,env,kho,logger,makeOwnerId,schedulerOptions,tg`
- Direct keys: `advanceService,clock,logger,reducer,schedulerOptions,store,world,writer`
- Public enumerable keys: `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`
- `getStatus` calls `writer.status()`.
- Private non-enumerable descriptors: `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, `_datDatabaseClosing`.
- Exports follow parent inspection: `{taoScheduler, inRange, resolveDurableSchedulerOptions}`. If a fresh direct parent inspection shows `baseSchedulerOptions` exported, update implementation and report before coding.

- [ ] **Step 3: Cutover**

Implement exact fresh-only Task6 cutover:

- Context must have exactly `{kho, clock, ownerId}`; no logger.
- Validate context and owner before migration.
- `apDungMigrationScheduler(kho, clock.nowMs())` before Store.
- `new SchedulerStore(kho, clock)`.
- `context.kho.trongGiaoDich(fn, {immediate:true})`.
- Use literal lease `15_000` or named constant `CUTOVER_LEASE_MS = 15000`.
- Reject nonlegacy and nonempty `dq` before mode write.
- Acquire fresh lease, seed only `combat_seed_key_v1`, validate 64 lowercase hex, set mode durable, audit `CUTOVER` detail `fresh-only`, return `{mode:'durable', imported:0, recovered:0}`.
- Release same token in `finally`.
- If release throws and primary error exists, preserve primary error and do not log because context has no logger.
- If release throws with no primary error, propagate release error.

- [ ] **Step 4: CLI**

`tools/scheduler-cutover.js`:

- Exports exactly `{parseArgs, runCli, main}`.
- `runCli(argv, deps)` signature, not env/io-first variants.
- `deps` may contain `{openKho, makeOwnerId, clock}`.
- Parse exactly `--db <path> --action cutover`; validate before open.
- Owner is `assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)())`.
- Clock is `deps.clock || taoClock()`.
- Open with `deps.openKho` or default Kho opener.
- Always close opened DB via `kho.dong()` in `finally`.
- On success return exact `{exitCode:0, stdout: JSON.stringify({action:'cutover', mode:'durable', imported:0, recovered:0}) + '\n', stderr:''}`.
- On safe error return `{exitCode:1, stdout:'', stderr: code + '\n'}` with code only.
- `main(argv, deps)` calls `runCli(argv, deps)`, writes returned stdout/stderr to process streams, sets `process.exitCode`, returns result, and never calls `process.exit`.
- Require-main uses `main(process.argv.slice(2), {})`.

---

## Task 5: Final tests, name diffs, seals, report, and reviews

**Files:** exact report path only plus six owned files.

- [ ] **Step 1: Run final TAP and name multiset checks**

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v14-final.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v14-final-throw-deprecation.tap
for f in /tmp/task6-v14-final.tap /tmp/task6-v14-final-throw-deprecation.tap; do
  grep -E '^# tests 245$' "$f"
  grep -E '^# pass 244$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
node - <<'NODE' /tmp/task6-v14-final.tap > /tmp/task6-v14-final-parent73-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const expected = fs.readFileSync('/tmp/task6-v14-parent73-names.txt', 'utf8').trim().split('\n');
const set = new Set(expected);
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]).filter((name) => set.has(name));
if (names.length !== 73) throw new Error('PARENT_RUNTIME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
diff -u /tmp/task6-v14-parent73-names.txt /tmp/task6-v14-final-parent73-names.txt
node - <<'NODE' /tmp/task6-v14-final.tap > /tmp/task6-v14-final-overlay9-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (Task 6 v14 remediation .+)$/gm)].map((m) => m[1]);
if (names.length !== 9) throw new Error('OVERLAY_RUNTIME_COUNT_' + names.length);
if (new Set(names).size !== 9) throw new Error('OVERLAY_DUPLICATE');
for (const name of names) console.log(name);
NODE
node - <<'NODE' /tmp/task6-v14-final.tap > /tmp/task6-v14-final-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const parent = new Set(fs.readFileSync('/tmp/task6-v14-parent73-names.txt', 'utf8').trim().split('\n'));
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1])
  .filter((name) => !parent.has(name) && !name.startsWith('Task 6 v14 remediation '));
if (names.length !== 163) throw new Error('BASELINE_FINAL_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
diff -u /tmp/task6-v14-baseline-names.txt /tmp/task6-v14-final-baseline-names.txt
```

- [ ] **Step 2: Node check and whitespace**

```bash
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js \
    server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js \
    tools/test-scheduler.js docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md; then
  exit 1
fi
```

- [ ] **Step 3: Six-file seal**

```bash
python3 - <<'PY' > /tmp/task6-v14-six-meta.tsv
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
    mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
        raise SystemExit('SIX_FILE_MODE_INVALID ' + path + ' ' + mode)
    git_mode = tracked.get(path, '-')
    if git_mode not in ('-', '100644'):
        raise SystemExit('SIX_TRACKED_MODE_INVALID ' + path + ' ' + git_mode)
    data = open(path, 'rb').read()
    print('\t'.join([path, 'file', mode, git_mode, str(len(data)), hashlib.sha256(data).hexdigest()]))
PY
sha256sum /tmp/task6-v14-six-meta.tsv > /tmp/task6-v14-six-meta.tsv.sha256
```

- [ ] **Step 4: Create draft report before post inventory**

```bash
mkdir -p docs/superpowers/reports
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
: > "$report"
chmod 0755 docs/superpowers/reports
chmod 0644 "$report"
test -f "$report"
test ! -L "$report"
```

Write draft report fields before post-inventory: V14/parent/Task5 hashes, RED evidence hash, parent block hashes, parent73/overlay9 name hashes, six meta hash, normal/throw TAP hashes and counts, node-check outputs, whitespace status, baseline prefix/name status, inventory status placeholder, and statement that report is excluded from six-file review seal.

- [ ] **Step 5: Post inventory and Stage-A validation**

```bash
sha256sum -c /tmp/task6-v14-inventory.sh.sha256
. /tmp/task6-v14-inventory.sh
repo_inventory > /tmp/task6-v14-post-inventory.tsv
python3 - <<'PY'
from pathlib import Path
allowed = {
  'server/scheduler/store.js',
  'server/scheduler/writer.js',
  'server/scheduler/index.js',
  'server/scheduler/cutover.js',
  'tools/scheduler-cutover.js',
  'tools/test-scheduler.js',
  'docs/superpowers/reports',
  'docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md',
}
pre = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v14-pre-inventory.tsv').read_text().splitlines()}
post = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v14-post-inventory.tsv').read_text().splitlines()}
bad = []
for path in sorted(set(pre) | set(post)):
    if pre.get(path) == post.get(path):
        continue
    if path not in allowed:
        bad.append(path)
if bad:
    raise SystemExit('NON_OWNED_SCOPE_CHANGED\n' + '\n'.join(bad))
PY
```

Stage-A executable validation must pass:

```bash
sha256sum -c /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-v14-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v14-parent73-names.txt.sha256
sha256sum -c /tmp/task6-v14-six-meta.tsv.sha256
sha256sum -c /tmp/task6-v14-baseline-names.txt.sha256
sha256sum -c <<'EOF'
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
EOF
test -s "$report"
grep -F 'parent runtime=73 + overlay=9 => N=82' "$report"
grep -F '245 tests / 244 pass / 0 fail / 1 skipped' "$report"
grep -F "$(cut -d' ' -f1 /tmp/task6-v14-red-evidence.tap.sha256)" "$report"
grep -F "$(cut -d' ' -f1 /tmp/task6-v14-six-meta.tsv.sha256)" "$report"
```

- [ ] **Step 6: Reviews and Stage-B**

Launch two genuine fresh collaboration review agents over Stage-A artifacts using `model=gpt-5.6-sol` and `effort=high`. Text lines alone do not prove identities; actual collaboration tool outcomes are required separately and must be recorded by root/implementer.

After two genuine PASS outcomes, append exactly:

```text
Reviewer 1: identity=<distinct-tool-agent-id-1> model=gpt-5.6-sol effort=high outcome=PASS
Reviewer 2: identity=<distinct-tool-agent-id-2> model=gpt-5.6-sol effort=high outcome=PASS
```

Stage-B reruns the complete Stage-A script, revalidates current six hashes/meta, evidence, inventory, report file type/mode/content, and reviewer lines:

```bash
python3 - <<'PY' "$report"
import re, sys
text = open(sys.argv[1], encoding='utf8').read()
rows = re.findall(r'^Reviewer [12]: identity=([^ ]+) model=([^ ]+) effort=([^ ]+) outcome=([^ ]+)$', text, re.M)
if len(rows) != 2:
    raise SystemExit('REVIEWER_LINE_COUNT_INVALID')
ids = [r[0] for r in rows]
if len(set(ids)) != 2:
    raise SystemExit('REVIEWER_IDENTITIES_NOT_DISTINCT')
for identity, model, effort, outcome in rows:
    if model != 'gpt-5.6-sol' or effort != 'high' or outcome != 'PASS':
        raise SystemExit('REVIEWER_LINE_INVALID')
PY
```

## Self-audit checklist

- [ ] Parent runtime names enumerate exactly 73 registrations, including dynamic loops 3+3+4.
- [ ] Overlay count is exactly 9, including cutover and CLI.
- [ ] Added total is `82`; final expected totals are `245/244/0/1`.
- [ ] Parent tests are imported from complete blocks `10886-11844`, `11848-12485`, `12490-12833`, and `12837-13070`; no cut snippets.
- [ ] Parent regressions do not require individual RED evidence; overlay RED evidence only covers 9 overlay tests.
- [ ] Authority hashes pin parent, Task5, and V14.
- [ ] Normalized PRE inventory is captured before any test/source/report edit.
- [ ] Status implementation is explicit, nested, validation-before-normalization, deep-cloning, and no `writer.options`.
- [ ] Startup near-expiry renews lease before rebase/final fence.
- [ ] Claim/Task5/commands corrections from V13 are retained.
- [ ] Cutover and CLI contracts are explicit and tested.
- [ ] Report exists before post inventory and is exact allowed artifact.
- [ ] Stage-A and Stage-B validate hashes, TAPs, node-checks, whitespace, name diffs, inventory, report, and review lines.
