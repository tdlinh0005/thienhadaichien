# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V19

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every implementation wave and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark handling, retry/backoff/quarantine, command MutationGate, fresh cutover, CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** V19 reduces remediation overlays to seven tests that prove only new Task6 seams not already frozen by accepted Task5 tests or parent Task6 runtime registrations. The authoritative runtime count is parent `73` plus overlay `7`, giving `N=80`; accepted baseline `163/162/0/1` becomes final scheduler TAP `243/242/0/1`. Parent tests are imported faithfully from the parent plan; overlays run after skeletons and parent helpers so RED failures are targeted behavior failures, not module-load failures.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.

## Global constraints

- Preserve V1-V18 plan artifacts. This planning task creates only this V19 file.
- Implementation may edit exactly six Task6-owned source/test files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task7+ production edits. Forbidden examples include `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, every `js/*.js`, and `web/js/mp.js`.
- Parent runtime registrations: `73`.
- Overlay runtime registrations: `7`.
- Mechanical count: `parent runtime=73 + overlay=7 => N=80`.
- Expected final scheduler TAP: `243 tests`, `242 pass`, `0 fail`, `1 skipped`.
- Parent regression 73 tests do not need individual RED evidence. Overlay7 tests do.
- Dropped V18 overlay replay and partial-wrapper tests. Those protocols are already accepted in Task5 baseline tests and parent73; V19 does not duplicate them.
- Parent Task6, accepted Task5, and live source APIs override any V1-V18 conflict.
- No report self-hash and no embedded V19 self-hash; embedding the plan's own SHA is self-referential. Root passes `TASK6_V19_APPROVED_SHA` externally.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
```

## Required implementation sequence

1. Capture approved V19 hash, authority hashes, PRE inventory, baseline TAP/names, and prefix bytes before any source/test/report edit.
2. Create minimal skeleton exports in `writer.js`, `index.js`, `cutover.js`, and `tools/scheduler-cutover.js` so `tools/test-scheduler.js` can load.
3. Import faithful parent Task6 helper/test source from parent ranges `10886-11844`, `11848-12485`, `12489-12833`, and `12837-13070`. Block 3 starts at line `12489`, the opening JavaScript fence.
4. Append V19 overlay7 after the parent block. Overlay tests may use parent `taoWriterFixture`, `taoBoHenGia`, `taoSecondaryDeferredExternalFixture`, `taoPvpFixtureAt`, `taoKhoTam`, `layLease`, `job`, `fakeClock`, `NOW_MS`, and existing accepted Task1-5 helpers.
5. Extract expected overlay JS from the approved V19 plan and `cmp` it byte-for-byte with the current `tools/test-scheduler.js` overlay slice.
6. Run isolated overlay RED exactly once. Skeletons and parent helpers must load first, so every targeted RED failure must contain that overlay's sentinel and must not contain `MODULE_NOT_FOUND`.
7. Implement Store/writer/index/cutover/CLI in TDD waves.
8. Run Stage-A validation, launch two fresh Sol/high implementation reviews over exact six implementation/test hashes plus V19 plan/evidence artifacts, append genuine approvals to the report only after both PASS, then run Stage-B.

## Production contracts retained and corrected

### Downstream Task5 protocol

Every executable calls `reducer.prepare(mutation, executable, options)`, including committed replay. The writer must follow the accepted Task5 ordering:

1. Store-loaded branded executable only; never reducer raw rows.
2. `markDurableMutation`.
3. For global jobs, run `advanceBarrier`; stop on already-parked/partial/reordered barrier before reducer work.
4. Check committed application status but do not bypass `prepare`.
5. Charge the external primitive only when no committed application exists.
6. Call `reducer.prepare`.
7. If `prepared.kind==='partial'`, call `reducer.applyPrepared(mutation, prepared)`, validate exact two-key plain effect `{checkpointRevision, saveReceipt}`, then call Store `checkpointPartial` or `blockOwnedAccountAdvance` as appropriate.
8. If `prepared.kind==='prepared'`, call Store `insertApplication(token, executable, prepared.application, nowMs, prepared.canonicalTContext || null)` even when already committed. On `alreadyApplied:false`, call `reducer.applyPrepared(mutation, prepared)`; on `alreadyApplied:true`, skip only `applyPrepared` and world effect. Then terminalize exactly once with `finishResolved`, `completeApplied`, or `completeAccountAdvanceAndScheduleSuccessor`.

### `server/scheduler/store.js`

Keep accepted Task1-5 Store bodies/arity intact unless this task explicitly extends Store. Required Task6 additions:

- `quarantineClaimedRaw(token, rawRow, failure, nowMs) -> {id,state:'QUARANTINED',errorCode}`:
  - Never parse `rawRow.payload_json`.
  - Validate only safe scalar identity fields: `id`, `state==='RUNNING'`, `locked_by===token.ownerId`, `locked_generation===token.generation`, and live lease at `nowMs`.
  - Atomic SQL fences on row id, state, owner, generation, lock expiry, and live lease.
  - Set terminal `QUARANTINED`, preserve current `attempt`, clear `retry_at_ms`, clear `locked_by`, `locked_generation`, and `locked_until_ms`, store scrubbed `error_code` and `error_message_safe`.
  - If no row changes, throw `LEASE_LOST` for lease mismatch/expiry and `CLAIM_SETTLEMENT_CONFLICT` otherwise.
- `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs) -> descriptor|null`:
  - Validate the current same-key PENDING `ACCOUNT_ADVANCE` by canonical payload/hash first; persisted identity/canonical contradiction maps `PAYLOAD_INTEGRITY`.
  - Return `null` when no same-key row exists, including wrong supplied account/revision.
  - Reject RUNNING, blocked, terminal, or different-key conflicts with `ACCOUNT_ADVANCE_RETARGET_CONFLICT`.
  - Lease-fenced atomic update preserves job id, idempotency key, attempt, ownerless PENDING state, regenerates canonical payload bytes/hash and logical/scheduled time consistently with live Store canonical helpers.
  - Return only a frozen descriptor `{id, accountId, revision, scheduledAtS}`.
- `validateBlockedAccountAdvanceForDependency(token, accountId, revision, dependencyJobId, targetS, nowMs) -> frozen descriptor`:
  - Parse canonical bounded JSON and validate `validateJob(executableInput(row,payload), {allowReconcile:true})`.
  - Do not call `loadExecutableJob`; blocked PENDING is not branded RUNNING executable.
  - Check state PENDING, exact `ACCOUNT_ADVANCE`, aggregate/account/revision/idempotency/scheduled time, no terminal fields, and exact `blocked_by_job_id`.
  - Return only `Object.freeze({id, accountId, revision, scheduledAtS, blockedByJobId})`.
- `listExpiredRunningForRecovery(token, nowMs)` and `listOwnedRunningForRecovery(token, nowMs)`:
  - Disjoint reads inside startup UoW. Expired rows feed `recoverExpiredRunning`; surviving owned RUNNING rows feed lease renewal/rebase/resume only.
  - Neither method publishes timers/queues; startup stages ids and publishes after commit.

### `server/scheduler/writer.js`

Implement a single `SchedulerWriter` with these explicit internals or exact inline equivalents:

- Constructor/admission: validates owner UUID before timers/UoW; owns `store`, `world`, `reducer`, `advanceService`, `clock`, `logger`, durable options, lease state, `partialQueue` string ids, timers, lifecycle private seams, and metric state. Add quarantine-aware operational admission before enqueue/DB work.
- Status/cache: implement `computeOpenStatusFromStore(writer)`, `canonicalSchedulerStatus(status)`, and `cloneSchedulerStatus(status)` inside `writer.js`; no `metrics.js` dependency in Task6. Validate raw values/keys before normalization; numeric strings, booleans, null counts, negative/infinite metrics are invalid. Clone nested `jobAttempts`, `jobDuration`, `leaseAcquire`, and `reconcile`. Public status keys include full parent compatibility fields: flattened counts/ages, `counts`, `ages`, lifecycle booleans, `continuationActive`, metrics, and never `effectiveNowMs`. Use `max(lastEffectiveNowMs, clock.nowMs())` for read ages. Expired held lease synchronously transitions lease-lost, clears mutation/retry timers, retains exactly one standby poll. `_datDatabaseClosing()` snapshots safe public status before `dbOpen=false`; after close, `status()` and bridge `getStatus()` are cache-only and return `ready:false`, `dbOpen:false`, `reason:'SCHEDULER_DB_CLOSED'` without SQLite.
- Private Task7 seams: `_datSignalHandlerInstalled(installed)` is a private non-enumerable function seam that changes the status `signalHandlerInstalled` boolean. `_beginStop(reason, graceMs)` delegates to the same stop path as public stop. `_waitForStopFinalization()` resolves only after the bounded stop tail. `_datDatabaseClosing()` uses reason `SCHEDULER_DB_CLOSED`.
- Timers: define `clearMutationTimers()` for mutation/retry/heartbeat/reconcile/wake/continuation timers, `clearPollTimer()`, `clearGraceTimer()`, and `clearAllTimers()`. Fatal/crashed/beginStop/stop/DB-close call `clearAllTimers()`. Lease loss alone calls `clearMutationTimers()` then ensures exactly one standby acquisition poll.
- Startup: validate mode/options, acquire lease, marker before `recoverExpiredRunning` when preview has expired rows, recover expired rows, call `assertAccountDependencyIntegrity(token,effective)`, renew lease with fresh effective time after long startup work, rebase surviving owned RUNNING locks with `resumeOwnedRunning(token,id,freshNow,leaseMs)`, final lease/row fence before commit, then publish staged partial ids/timers after commit.
- Claim/drain: every claim UoW calls `recordEffectiveNowInCurrentUow` before listing/claiming. `takeNextJob` checks owned RUNNING global resume first, then global barrier classification, due RETRY_WAIT, quarantine rules, foreign RUNNING, watermark gating, and only then account work. `partialQueue` contains string ids and rotates watermark-ineligible partials. Global drain uses the parent claim-for-resolution path; owned RUNNING uses `resumeOwnedRunning`.
- Downstream apply: `applyClaimed` derives default execution target from branded executable, not raw claim. It runs all advance/reducer/command work inside immediate `kho.trongGiaoDich` and `world.trongMutationScheduler`, with final lease fence before every commit.
- Failure settlement: injected crash rethrows unchanged; original `LEASE_LOST` transitions lease-lost/rethrows; original fatal storage transitions storage fatal/rethrows. Ordinary reducer failure settles in a fresh immediate UoW: reload/brand by job id and `store.fail(executable)` when valid; only when reload fails payload integrity use `quarantineClaimedRaw`. Settlement fatal storage transitions storage fatal while rethrowing the original reducer error unchanged; settlement lease loss preserves original semantics and lifecycle state.
- Crash hooks: `before-claim`, `after-claim`, `after-application-insert`, `after-game-mutation`, `before-job-completion`.
- `advanceDueInCurrentUow(mutation, nowS, budget)`:
  - Assert `world._schedulerActive(mutation)`.
  - Query `kho.q.dqDenHan.all(nowS, 61)` and process the first 60 in returned order only.
  - For each row, call the direct account outcome/finalizer path using live `world.advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)`; do not edit `server/world.js`.
  - If a 61st row remains, return command partial with `hasMoreDue:true`, persist `TICK_PARTIAL`, enqueue continuation after commit, and never invoke the command closure.
- Commands: `runCommand({name, accountId?, run})` derives effective monotonic time internally. It drains due work before invoking the closure. Any global/account partial or 61-boundary due partial returns a defined deferred response, persists `TICK_PARTIAL`, and postcommit enqueues continuation; `manualDrain` never arms implicit continuation. The closure must not be invoked on partial. If closure returns a thenable, throw `UNIT_OF_WORK_ASYNC` after invocation and roll back only changes after invocation. `accountFinalizer` runs inside the owning immediate UoW before final fence/commit and exactly once.
- Direct external continuation: normal World save must not pass `deferAccountWake:true`. When direct account result has `deferredExternal`/`blockedExternalJobId`, first retarget the same-key wake with `retargetOwnedPendingAccountAdvanceForCommand`; if absent, create it once with existing `replaceAccountAdvance`; validate any existing or returned row with `validateBlockedAccountAdvanceForDependency` before adopting/blocking. A row already blocked by the same dependency is accepted; unrelated block returns exact conflict/deferred result and must not synthesize dependency success. Only finalizer records metrics.
- Public `advanceTo` returns exactly five keys through `toPublicAdvanceResult`: `advancedToS`, `budgetExhausted`, `hasMoreDue`, `nextDueAtS`, `processed`.

### `server/scheduler/index.js`

Export exactly `{taoScheduler, inRange, resolveDurableSchedulerOptions}`. `taoScheduler(context)` memoizes one bridge and one world capability set per Kho, uses production six-key context, test seven-key context with `makeOwnerId`, and direct eight-key injection only per parent. Public bridge `getStatus` calls `writer.status()`, not a non-existent `writer.getStatus`.

### `server/scheduler/cutover.js`

`runMaintenanceCutover({kho, clock, ownerId})` has only those three context keys. It validates context/owner before Store construction where possible, runs `apDungMigrationScheduler(kho, clock.nowMs())` before Store, constructs Store, acquires a 15,000ms fresh lease, rejects non-legacy mode with `SCHEDULER_CUTOVER_ALREADY_DURABLE`, rejects any existing `dq` row with `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`, seeds only `combat_seed_key_v1`, writes durable mode and `CUTOVER` audit, recovers expired durable rows per parent, and releases the same token in `finally`. If both primary and release fail, rethrow the primary error; if only release fails, throw the release error. No logger dependency and no startup writer.

### `tools/scheduler-cutover.js`

Export exactly `{parseArgs, runCli, main}`. `parseArgs(argv)` accepts exactly `['--db', nonemptyFile, '--action', 'cutover']` in that order and rejects duplicates, unknowns, missing/extra tokens, empty path, or directory before opening. `runCli(argv, deps)` uses injectable `{openKho, makeOwnerId, clock}`, validates before open, derives owner by `assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)())`, defaults `clock` to live `taoClock()`, calls `runMaintenanceCutover`, returns `{exitCode, stdout, stderr}`, and closes with `kho.dong()` in `finally`. Primary errors win over close errors; close-only errors fail. `safeCliCode(error)` uses `error.code` only when it matches `/^[A-Z][A-Z0-9_]{1,63}$/`, otherwise uses `error.message` only if it matches the same code pattern, otherwise `SCHEDULER_CUTOVER_FAILED`. `main(process.argv.slice(2), process.env, {stdout:process.stdout, stderr:process.stderr}, {})` writes returned streams, sets `process.exitCode`, and never calls `process.exit`.

## Standalone artifact creation

Create every referenced artifact from scratch in V19 preflight.

Approved plan and TAP normalizer:

```bash
test -n "$TASK6_V19_APPROVED_SHA"
case "$TASK6_V19_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V19_APPROVED_SHA}" -eq 64
printf '%s  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v19.md\n' \
  "$TASK6_V19_APPROVED_SHA" > /tmp/task6-v19-approved-plan.sha256
sha256sum -c /tmp/task6-v19-approved-plan.sha256
printf '%s  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md\n' \
  cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3 > /tmp/task6-v19-authorities.sha256
printf '%s  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md\n' \
  c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf >> /tmp/task6-v19-authorities.sha256
sha256sum -c /tmp/task6-v19-authorities.sha256

cat > /tmp/task6-v19-tap-normalize.sh <<'SH'
normalize_tap_for_hash() {
  sed -E '/^[[:space:]]+duration_ms:/d;/^# duration_ms /d' "$1"
}
SH
sha256sum /tmp/task6-v19-tap-normalize.sh > /tmp/task6-v19-tap-normalize.sh.sha256
```

Inventory helper and PRE inventory:

```bash
cat > /tmp/task6-v19-inventory.sh <<'SH'
repo_inventory() {
  python3 - <<'PY'
import hashlib, os, stat, subprocess
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if record:
        meta, path = record.split(b'\t', 1)
        tracked[path.decode()] = meta.split()[0].decode()
paths = set(tracked)
for dirpath, dirnames, filenames in os.walk('.', topdown=True, followlinks=False):
    dirnames[:] = [d for d in dirnames if d != '.git']
    rel = dirpath[2:] if dirpath.startswith('./') else dirpath
    for name in list(dirnames):
        p = os.path.join(rel, name) if rel else name
        try:
            st = os.lstat(p)
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(st.st_mode):
            paths.add(p)
            dirnames.remove(name)
    for name in filenames:
        paths.add(os.path.join(rel, name) if rel else name)
for p in sorted(paths):
    try:
        st = os.lstat(p)
    except FileNotFoundError:
        print(p + '\tmissing\t-\t-\t-\t-\t' + tracked.get(p, '-'))
        continue
    fs_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    git_mode = tracked.get(p, '-')
    if stat.S_ISLNK(st.st_mode):
        print(p + '\tsymlink\t' + fs_mode + '\t' + str(st.st_size) + '\t-\t' + os.readlink(p) + '\t' + git_mode)
    elif stat.S_ISREG(st.st_mode):
        data = open(p, 'rb').read()
        print(p + '\tfile\t' + fs_mode + '\t' + str(len(data)) + '\t' + hashlib.sha256(data).hexdigest() + '\t-\t' + git_mode)
    elif stat.S_ISDIR(st.st_mode):
        print(p + '\tdir\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
    else:
        print(p + '\tother\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
PY
}
SH
sha256sum /tmp/task6-v19-inventory.sh > /tmp/task6-v19-inventory.sh.sha256
. /tmp/task6-v19-inventory.sh
repo_inventory > /tmp/task6-v19-pre-inventory.tsv
sha256sum /tmp/task6-v19-pre-inventory.tsv > /tmp/task6-v19-pre-inventory.tsv.sha256
```

Baseline TAP/names and prefix bytes:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v19-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v19-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v19-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v19-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v19-baseline.tap
node - <<'NODE' /tmp/task6-v19-baseline.tap > /tmp/task6-v19-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v19-baseline-names.txt > /tmp/task6-v19-baseline-names.txt.sha256
node - <<'NODE' > /tmp/task6-v19-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const data = fs.readFileSync('tools/test-scheduler.js');
for (const marker of [
  '// TASK6_V19_PARENT_TESTS_START',
  '// TASK6_V19_PARENT_TESTS_END',
  '// TASK6_V19_OVERLAY_TESTS_START',
  '// TASK6_V19_OVERLAY_TESTS_END'
]) {
  if (data.includes(Buffer.from(marker))) throw new Error('TASK6_V19_ALREADY_PRESENT');
}
console.log([data.length, crypto.createHash('sha256').update(data).digest('hex')].join('\t'));
NODE
sha256sum /tmp/task6-v19-prefix.tsv > /tmp/task6-v19-prefix.tsv.sha256
```

Parent73 expected names and parent source slice:

```bash
cat > /tmp/task6-v19-parent73-names.txt <<'EOF'
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
wc -l /tmp/task6-v19-parent73-names.txt | grep -E '^73 '
sha256sum /tmp/task6-v19-parent73-names.txt > /tmp/task6-v19-parent73-names.txt.sha256
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
sed -n '10886,11844p' "$parent" > /tmp/task6-v19-parent-block-1.md
sed -n '11848,12485p' "$parent" > /tmp/task6-v19-parent-block-2.md
sed -n '12489,12833p' "$parent" > /tmp/task6-v19-parent-block-3.md
sed -n '12837,13070p' "$parent" > /tmp/task6-v19-parent-block-4.md
sha256sum /tmp/task6-v19-parent-block-*.md > /tmp/task6-v19-parent-blocks.sha256
python3 - <<'PY' /tmp/task6-v19-parent-block-1.md /tmp/task6-v19-parent-block-2.md /tmp/task6-v19-parent-block-3.md /tmp/task6-v19-parent-block-4.md > /tmp/task6-v19-expected-parent-slice.js
import pathlib, sys
for filename in sys.argv[1:]:
    in_js = False
    for line in pathlib.Path(filename).read_text().splitlines(True):
        if line.strip() == '```js':
            in_js = True
            continue
        if in_js and line.strip() == '```':
            in_js = False
            continue
        if in_js:
            sys.stdout.write(line)
PY
test -s /tmp/task6-v19-expected-parent-slice.js
sha256sum /tmp/task6-v19-expected-parent-slice.js > /tmp/task6-v19-expected-parent-slice.js.sha256
```

## V19 overlay JS authority and body

Stage extracts expected JS from the approved V19 plan, not from the current test file:

```bash
awk '/^\/\/ TASK6_V19_PLAN_OVERLAY_JS_START$/{flag=1; next} /^\/\/ TASK6_V19_PLAN_OVERLAY_JS_END$/{flag=0} flag' \
  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v19.md \
  > /tmp/task6-v19-expected-overlay.js
test -s /tmp/task6-v19-expected-overlay.js
sha256sum /tmp/task6-v19-expected-overlay.js > /tmp/task6-v19-expected-overlay.js.sha256
```

Append the expected JS after the parent block between `// TASK6_V19_OVERLAY_TESTS_START` and `// TASK6_V19_OVERLAY_TESTS_END`. Then compare:

```bash
node - <<'NODE' > /tmp/task6-v19-current-overlay.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V19_OVERLAY_TESTS_START\n';
const end = '// TASK6_V19_OVERLAY_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V19_OVERLAY_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
cmp -s /tmp/task6-v19-expected-overlay.js /tmp/task6-v19-current-overlay.js
```

```js
// TASK6_V19_PLAN_OVERLAY_JS_START
function task6v19Sentinel(sentinel, body) {
  return async function (t) {
    try { return await body(t); }
    catch (error) {
      error.message = sentinel + ': ' + (error && error.message || String(error));
      throw error;
    }
  };
}
function task6v19AssertMethod(object, name, sentinel) {
  assert.equal(typeof object[name], 'function', sentinel + ' missing ' + name);
}
function task6v19Rows(kho, sql, params) {
  var stmt = kho.db.prepare(sql);
  return stmt.all.apply(stmt, params || []);
}

test('Task 6 v19 overlay raw quarantine store primitive preserves claimed attempt without payload parse',
  task6v19Sentinel('TASK6V19_RED_001_RAW_QUARANTINE_STORE', async function () {
    var x = taoWriterFixture();
    try {
      task6v19AssertMethod(x.store, 'quarantineClaimedRaw', 'TASK6V19_RED_001_RAW_QUARANTINE_STORE');
      x.clock.setS(x.pvpJob.scheduled_at_s);
      var token = layLease(x, x.ownerId);
      var nowMs = x.clock.nowMs();
      var claimed = x.kho.trongGiaoDich(function () {
        return x.store.claimForResolution(token, x.pvpJob.id, nowMs, 15_000, {allowFuturePending: true});
      }, {immediate: true});
      x.kho.db.prepare('UPDATE event_jobs SET attempt=?,payload_json=? WHERE id=?')
        .run(3, '{"schemaVersion":1,"tampered":"not parsed by raw quarantine"}', claimed.id);
      var raw = x.kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(claimed.id);
      var settled = x.kho.trongGiaoDich(function () {
        return x.store.quarantineClaimedRaw(token, raw,
          Object.assign(new Error('unsafe payload'), {code: 'PAYLOAD_INTEGRITY'}), nowMs);
      }, {immediate: true});
      assert.equal(settled.id, claimed.id);
      assert.equal(settled.state, 'QUARANTINED');
      var stored = x.store.getById(claimed.id);
      assert.equal(stored.state, 'QUARANTINED');
      assert.equal(Number(stored.attempt), 3);
      assert.equal(stored.error_code, 'PAYLOAD_INTEGRITY');
      assert.equal(stored.retry_at_ms, null);
      assert.equal(stored.locked_by, null);
      assert.equal(stored.locked_generation, null);
      assert.equal(stored.locked_until_ms, null);
    } finally { x.dong(); }
  }));

test('Task 6 v19 overlay status db close cache and exact scheduler exports',
  task6v19Sentinel('TASK6V19_RED_002_STATUS_EXPORTS', async function () {
    var indexExports = require('../server/scheduler/index.js');
    assert.deepEqual(Object.keys(indexExports).sort(),
      ['inRange', 'resolveDurableSchedulerOptions', 'taoScheduler'].sort());
    var x = taoWriterFixture({manualDrain: false, timers: taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }})});
    try {
      await x.writer.start();
      var calls = 0;
      var realStatus = x.writer.status.bind(x.writer);
      x.writer.status = function () { calls += 1; return realStatus(); };
      var bridgeStatus = x.scheduler.getStatus();
      assert.equal(calls, 1, 'TASK6V19_RED_002_STATUS_EXPORTS bridge calls writer.status');
      var keys = Object.keys(bridgeStatus).sort();
      assert.deepEqual(keys, [
        'ages', 'continuationActive', 'counts', 'dbOpen', 'draining',
        'dueBacklog', 'heartbeatTimerActive', 'leaseHeld', 'metrics', 'mode',
        'nextEligibleAtMs', 'oldestDueAgeMs', 'pending', 'pollTimerActive',
        'quarantined', 'ready', 'reason', 'reconcileTimerActive',
        'recoveryComplete', 'retryWait', 'running', 'signalHandlerInstalled',
        'state', 'wakeTimerActive', 'watermarkS', 'writerLeaseHeld'
      ].sort());
      assert.equal(Object.prototype.hasOwnProperty.call(bridgeStatus, 'effectiveNowMs'), false);
      assert.equal(typeof bridgeStatus.continuationActive, 'boolean');
      assert.equal(typeof bridgeStatus.writerLeaseHeld, 'boolean');
      assert.equal(typeof bridgeStatus.counts.dueBacklog, 'number');
      assert.equal(typeof bridgeStatus.ages.oldestDueAgeMs, 'number');
      assert.equal(typeof bridgeStatus.metrics.jobAttempts, 'object');
      bridgeStatus.metrics.jobAttempts.mutated = 1;
      assert.equal(x.writer.metrics.jobAttempts.mutated, undefined);
      x.writer.metrics.jobAttempts.invalid = '1';
      assert.equal(x.writer.status().reason, 'SCHEDULER_STATUS_INVALID');
      delete x.writer.metrics.jobAttempts.invalid;
      task6v19AssertMethod(x.writer, '_datSignalHandlerInstalled', 'TASK6V19_RED_002_STATUS_EXPORTS');
      task6v19AssertMethod(x.writer, '_datDatabaseClosing', 'TASK6V19_RED_002_STATUS_EXPORTS');
      assert.equal(Object.keys(x.writer).includes('_datSignalHandlerInstalled'), false);
      x.writer._datSignalHandlerInstalled(true);
      assert.equal(x.writer.status().signalHandlerInstalled, true);
      x.writer._datDatabaseClosing();
      x.store.statusSnapshot = function () { throw new Error('SQLITE_READ_AFTER_CLOSE'); };
      var closed = x.scheduler.getStatus();
      assert.equal(closed.dbOpen, false);
      assert.equal(closed.ready, false);
      assert.equal(closed.reason, 'SCHEDULER_DB_CLOSED');
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v19 overlay retarget and blocked descriptor store primitives use source account',
  task6v19Sentinel('TASK6V19_RED_003_RETARGET_DESCRIPTOR', async function () {
    var T = 1_800_020_000;
    var x = taoPvpFixtureAt(T);
    try {
      task6v19AssertMethod(x.store, 'retargetOwnedPendingAccountAdvanceForCommand', 'TASK6V19_RED_003_RETARGET_DESCRIPTOR');
      task6v19AssertMethod(x.store, 'validateBlockedAccountAdvanceForDependency', 'TASK6V19_RED_003_RETARGET_DESCRIPTOR');
      x.clock.setS(T);
      var token = layLease(x, '00000000-0000-4000-8000-000000000391');
      var nowMs = x.clock.nowMs();
      var accountId = Number(x.pvpJob.source_account_id);
      assert.equal(accountId, x.attacker);
      var revision = Number(x.kho.q.dqGet.get(accountId).revision);
      var pending = x.kho.trongGiaoDich(function () {
        return x.store.replaceAccountAdvance(token, accountId, revision, T + 10, nowMs);
      }, {immediate: true});
      assert.equal(Number(pending.scheduled_at_s), T + 10);
      var retargeted = x.kho.trongGiaoDich(function () {
        return x.store.retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, T, nowMs);
      }, {immediate: true});
      assert.deepEqual(retargeted, Object.freeze({id: pending.id, accountId: accountId,
        revision: revision, scheduledAtS: T}));
      assert.equal(Number(x.store.getById(pending.id).scheduled_at_s), T);
      var claimed = x.kho.trongGiaoDich(function () {
        return x.store.claimForResolution(token, pending.id, nowMs, 15_000, {allowFuturePending: true});
      }, {immediate: true});
      x.kho.trongGiaoDich(function () {
        x.store.blockOwnedAccountAdvance(token, claimed, revision, x.pvpJob.id, nowMs);
      }, {immediate: true});
      var descriptor = x.store.validateBlockedAccountAdvanceForDependency(
        token, accountId, revision, x.pvpJob.id, T, nowMs
      );
      assert.equal(Object.isFrozen(descriptor), true);
      assert.deepEqual(Object.keys(descriptor).sort(),
        ['accountId', 'blockedByJobId', 'id', 'revision', 'scheduledAtS'].sort());
      assert.equal(descriptor.id, pending.id);
      assert.equal(descriptor.blockedByJobId, x.pvpJob.id);
      assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'payload'), false);
      assert.equal(x.store.retargetOwnedPendingAccountAdvanceForCommand(token, accountId + 1, revision, T, nowMs), null);
      assert.throws(function () {
        x.store.validateBlockedAccountAdvanceForDependency(
          token, accountId, revision, '00000000-0000-4000-8000-000000000999', T, nowMs
        );
      }, /ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT/);
    } finally { x.dong(); }
  }));

test('Task 6 v19 overlay startup renews after long recovery before ready',
  task6v19Sentinel('TASK6V19_RED_004_STARTUP_RENEW', async function () {
    var x;
    var timers = taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }});
    x = taoWriterFixture({manualDrain: false, timers: timers});
    var order = [], entryNow;
    try {
      task6v19AssertMethod(x.store, 'renewLease', 'TASK6V19_RED_004_STARTUP_RENEW');
      task6v19AssertMethod(x.writer, 'setFaultHook', 'TASK6V19_RED_004_STARTUP_RENEW');
      x.writer.setFaultHook(function () {});
      var originalRecover = x.store.recoverExpiredRunning;
      var originalRenew = x.store.renewLease;
      x.store.recoverExpiredRunning = function () {
        order.push('recover');
        x.clock.advanceMs(14_900);
        return originalRecover.apply(this, arguments);
      };
      x.store.renewLease = function (token, nowMs, leaseMs) {
        order.push('renew:' + nowMs);
        assert.ok(nowMs >= entryNow + 14_900, 'TASK6V19_RED_004_STARTUP_RENEW renew uses fresh post-recovery time');
        return originalRenew.apply(this, arguments);
      };
      entryNow = x.clock.nowMs();
      await x.writer.start();
      var status = x.writer.status();
      var lease = x.kho.db.prepare(
        "SELECT owner_id,generation,expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
      ).get();
      assert.equal(status.ready, true);
      assert.ok(order.indexOf('recover') >= 0);
      assert.ok(order.some(function (item) { return item.indexOf('renew:') === 0; }));
      assert.ok(Number(lease.expires_at_ms) > x.clock.nowMs());
      assert.equal(lease.owner_id, x.writer.leaseToken.ownerId);
      assert.equal(Number(lease.generation), Number(x.writer.leaseToken.generation));
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v19 overlay advance due keeps live order and enqueues continuation at sixty one',
  task6v19Sentinel('TASK6V19_RED_005_DUE61_ORDER', async function () {
    var x = taoWriterFixture({manualDrain: false});
    var timers = taoBoHenGia(x.clock);
    var processed = [], closureRan = false, helperCalls = 0;
    try {
      task6v19AssertMethod(x.writer, 'advanceDueInCurrentUow', 'TASK6V19_RED_005_DUE61_ORDER');
      x.writer.timers = timers;
      await x.writer.start();
      var originalAll = x.kho.q.dqDenHan.all;
      var originalDirect = x.writer.directAccountOutcomeInCurrentUow;
      var originalHelper = x.writer.advanceDueInCurrentUow;
      var nowS = Math.floor(x.clock.nowMs() / 1000);
      var mixed = [{tk: 3, keTiep: nowS - 2}, {tk: 1, keTiep: nowS - 1}, {tk: 2, keTiep: nowS - 1}];
      for (var i = 4; i <= 61; i++) mixed.push({tk: i, keTiep: nowS});
      x.kho.q.dqDenHan.all = function (queryNowS, limit) {
        assert.equal(limit, 61);
        assert.ok(queryNowS >= nowS);
        return mixed.slice();
      };
      x.writer.directAccountOutcomeInCurrentUow = function (mutation, accountId, targetS) {
        processed.push(Number(accountId));
        assert.ok(targetS <= Math.floor(x.clock.nowMs() / 1000));
        return {partial: false, processed: 1, advancedToS: targetS,
          nextDueAtS: null, hasMoreDue: false, budgetExhausted: false};
      };
      x.writer.advanceDueInCurrentUow = function () {
        helperCalls++;
        return originalHelper.apply(this, arguments);
      };
      var result = await x.scheduler.runCommand({
        name: 'advance-due',
        run: function () { closureRan = true; return 'closure'; }
      });
      assert.equal(helperCalls, 1);
      assert.deepEqual(processed.slice(0, 3), [3, 1, 2]);
      assert.equal(processed.length, 60);
      assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'});
      assert.equal(closureRan, false);
      assert.equal(x.writer.status().continuationActive, true);
      assert.ok(timers.dangCho().length >= 1);
      x.kho.q.dqDenHan.all = originalAll;
      x.writer.directAccountOutcomeInCurrentUow = originalDirect;
      x.writer.advanceDueInCurrentUow = originalHelper;
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v19 overlay maintenance cutover validates guard and release precedence',
  task6v19Sentinel('TASK6V19_RED_006_CUTOVER_RELEASE', async function () {
    var cutover = require('../server/scheduler/cutover.js');
    var storeModule = require('../server/scheduler/store.js');
    var runMaintenanceCutover = cutover.runMaintenanceCutover;
    task6v19AssertMethod(cutover, 'runMaintenanceCutover', 'TASK6V19_RED_006_CUTOVER_RELEASE');
    var originalAcquire = storeModule.SchedulerStore.prototype.acquireLease;
    var originalRelease = storeModule.SchedulerStore.prototype.releaseLease;
    var originalWriteAudit = storeModule.SchedulerStore.prototype.writeAudit;
    try {
      var success = taoKhoTam(), acquired = null, released = null;
      try {
        storeModule.SchedulerStore.prototype.acquireLease = function () {
          acquired = originalAcquire.apply(this, arguments);
          return acquired;
        };
        storeModule.SchedulerStore.prototype.releaseLease = function (token) {
          released = token;
          return originalRelease.apply(this, arguments);
        };
        var result = runMaintenanceCutover({kho: success.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000501'});
        assert.deepEqual(result, {mode: 'durable', imported: 0, recovered: 0});
        assert.equal(released.ownerId, acquired.ownerId);
        assert.equal(Number(released.generation), Number(acquired.generation));
        assert.equal(success.kho.cauhinh('seed'), null);
        assert.equal(success.kho.cauhinh('combat_seed_key_v1').length, 64);
      } finally { dongKhoTam(success); }

      var nonempty = taoKhoTam();
      try {
        var legacyId = Number(nonempty.kho.db.prepare(
          'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
        ).run('v19-cutover-legacy', 'V19 Cutover Legacy', 'h', 's', 1, 1).lastInsertRowid);
        nonempty.kho.db.prepare(
          'INSERT INTO dq(' +
          'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
          'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
        ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
        assert.throws(function () {
          runMaintenanceCutover({kho: nonempty.kho, clock: fakeClock(NOW_MS),
            ownerId: '00000000-0000-4000-8000-000000000502'});
        }, /SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED/);
      } finally { dongKhoTam(nonempty); }

      var primary = taoKhoTam(), primaryReleased = false;
      try {
        storeModule.SchedulerStore.prototype.writeAudit = function () {
          throw new Error('PRIMARY_WRITE_AUDIT_FAILURE');
        };
        storeModule.SchedulerStore.prototype.releaseLease = function () {
          primaryReleased = true;
          throw new Error('RELEASE_FAILURE');
        };
        assert.throws(function () {
          runMaintenanceCutover({kho: primary.kho, clock: fakeClock(NOW_MS),
            ownerId: '00000000-0000-4000-8000-000000000503'});
        }, /PRIMARY_WRITE_AUDIT_FAILURE/);
        assert.equal(primaryReleased, true);
      } finally { dongKhoTam(primary); }

      var releaseOnly = taoKhoTam();
      try {
        storeModule.SchedulerStore.prototype.writeAudit = originalWriteAudit;
        storeModule.SchedulerStore.prototype.releaseLease = function () {
          throw new Error('RELEASE_ONLY_FAILURE');
        };
        assert.throws(function () {
          runMaintenanceCutover({kho: releaseOnly.kho, clock: fakeClock(NOW_MS),
            ownerId: '00000000-0000-4000-8000-000000000504'});
        }, /RELEASE_ONLY_FAILURE/);
      } finally { dongKhoTam(releaseOnly); }
    } finally {
      storeModule.SchedulerStore.prototype.acquireLease = originalAcquire;
      storeModule.SchedulerStore.prototype.releaseLease = originalRelease;
      storeModule.SchedulerStore.prototype.writeAudit = originalWriteAudit;
    }
  }));

test('Task 6 v19 overlay scheduler cutover CLI grammar lifecycle and exact exports',
  task6v19Sentinel('TASK6V19_RED_007_CLI', async function () {
    var cli = require('../tools/scheduler-cutover.js');
    assert.deepEqual(Object.keys(cli).sort(), ['main', 'parseArgs', 'runCli'].sort());
    assert.deepEqual(cli.parseArgs(['--db', '/tmp/game.sqlite', '--action', 'cutover']),
      {dbPath: '/tmp/game.sqlite', action: 'cutover'});
    assert.throws(function () { cli.parseArgs(['--action', 'cutover', '--db', '/tmp/game.sqlite']); },
      /SCHEDULER_CLI_ARGS_INVALID/);
    assert.throws(function () { cli.parseArgs(['--db', '', '--action', 'cutover']); },
      /SCHEDULER_CLI_ARGS_INVALID/);
    assert.throws(function () { cli.parseArgs(['--db', '/tmp', '--action', 'cutover']); },
      /SCHEDULER_CLI_ARGS_INVALID/);
    var x = taoKhoTam();
    var closed = 0;
    var originalDong = x.kho.dong.bind(x.kho);
    x.kho.dong = function () { closed++; return originalDong(); };
    try {
      var result = await cli.runCli(['--db', x.file, '--action', 'cutover'], {
        makeOwnerId: function () { return '00000000-0000-4000-8000-000000000601'; },
        clock: fakeClock(NOW_MS),
        openKho: function () { return x.kho; }
      });
      assert.equal(result.exitCode, 0);
      assert.equal(closed, 1);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, JSON.stringify({action: 'cutover', mode: 'durable',
        imported: 0, recovered: 0}) + '\n');
    } finally { removeDb(x.file); }
    var unsafe = await cli.runCli(['--db', '/tmp/game.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000602'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { throw new Error('contains secret payload'); }
    });
    assert.equal(unsafe.exitCode, 1);
    assert.equal(unsafe.stdout, '');
    assert.equal(unsafe.stderr, 'SCHEDULER_CUTOVER_FAILED\n');
    var closeDb = taoKhoTam();
    var closeCount = 0;
    var realClose = closeDb.kho.dong.bind(closeDb.kho);
    closeDb.kho.dong = function () {
      closeCount++;
      realClose();
      throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'});
    };
    var closeOnly = await cli.runCli(['--db', closeDb.file, '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000603'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { return closeDb.kho; }
    });
    assert.equal(closeOnly.exitCode, 1);
    assert.equal(closeOnly.stdout, '');
    assert.equal(closeOnly.stderr, 'BAD_CLOSE\n');
    assert.equal(closeCount, 1);
    removeDb(closeDb.file);
    var out = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var err = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var mainResult = await cli.main(['--db', '/tmp', '--action', 'cutover'], {}, {stdout: out, stderr: err}, {});
    assert.equal(mainResult.exitCode, 1);
    assert.equal(err.chunks.join(''), 'SCHEDULER_CLI_ARGS_INVALID\n');
  }));
// TASK6_V19_PLAN_OVERLAY_JS_END
```

Overlay names and RED evidence:

```bash
cat > /tmp/task6-v19-overlay7-names.txt <<'EOF'
Task 6 v19 overlay raw quarantine store primitive preserves claimed attempt without payload parse
Task 6 v19 overlay status db close cache and exact scheduler exports
Task 6 v19 overlay retarget and blocked descriptor store primitives use source account
Task 6 v19 overlay startup renews after long recovery before ready
Task 6 v19 overlay advance due keeps live order and enqueues continuation at sixty one
Task 6 v19 overlay maintenance cutover validates guard and release precedence
Task 6 v19 overlay scheduler cutover CLI grammar lifecycle and exact exports
EOF
sha256sum /tmp/task6-v19-overlay7-names.txt > /tmp/task6-v19-overlay7-names.txt.sha256
test ! -e /tmp/task6-v19-red-evidence.tap
: > /tmp/task6-v19-red-evidence.tap
run_one_overlay_red() {
  name="$1"; sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v19-overlay-red.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  grep -F "# Subtest: $name" "$tmp"
  grep -F "not ok 1 - $name" "$tmp"
  grep -F "$sentinel" "$tmp"
  if grep -F 'MODULE_NOT_FOUND' "$tmp"; then cat "$tmp"; rm -f "$tmp"; exit 1; fi
  printf '%s\nname=%s\nsentinel=%s\n' '### TASK6_V19_OVERLAY_RED_CASE_START' "$name" "$sentinel" >> /tmp/task6-v19-red-evidence.tap
  cat "$tmp" >> /tmp/task6-v19-red-evidence.tap
  printf '%s\n' '### TASK6_V19_OVERLAY_RED_CASE_END' >> /tmp/task6-v19-red-evidence.tap
  rm -f "$tmp"
}
run_one_overlay_red 'Task 6 v19 overlay raw quarantine store primitive preserves claimed attempt without payload parse' 'TASK6V19_RED_001_RAW_QUARANTINE_STORE'
run_one_overlay_red 'Task 6 v19 overlay status db close cache and exact scheduler exports' 'TASK6V19_RED_002_STATUS_EXPORTS'
run_one_overlay_red 'Task 6 v19 overlay retarget and blocked descriptor store primitives use source account' 'TASK6V19_RED_003_RETARGET_DESCRIPTOR'
run_one_overlay_red 'Task 6 v19 overlay startup renews after long recovery before ready' 'TASK6V19_RED_004_STARTUP_RENEW'
run_one_overlay_red 'Task 6 v19 overlay advance due keeps live order and enqueues continuation at sixty one' 'TASK6V19_RED_005_DUE61_ORDER'
run_one_overlay_red 'Task 6 v19 overlay maintenance cutover validates guard and release precedence' 'TASK6V19_RED_006_CUTOVER_RELEASE'
run_one_overlay_red 'Task 6 v19 overlay scheduler cutover CLI grammar lifecycle and exact exports' 'TASK6V19_RED_007_CLI'
grep -c '^### TASK6_V19_OVERLAY_RED_CASE_START$' /tmp/task6-v19-red-evidence.tap | grep -E '^7$'
grep -c '^### TASK6_V19_OVERLAY_RED_CASE_END$' /tmp/task6-v19-red-evidence.tap | grep -E '^7$'
sha256sum /tmp/task6-v19-red-evidence.tap > /tmp/task6-v19-red-evidence.tap.sha256
```

## TDD implementation waves

### Wave 1: Skeletons and parent import

**Files:**
- Modify: `tools/test-scheduler.js`
- Create/modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/index.js`
- Create: `server/scheduler/cutover.js`
- Create: `tools/scheduler-cutover.js`

- [ ] Add minimal module skeletons with the exact export keys required by overlay import assertions.
- [ ] Append parent source exactly between `// TASK6_V19_PARENT_TESTS_START` and `// TASK6_V19_PARENT_TESTS_END`.
- [ ] Append overlay source exactly between `// TASK6_V19_OVERLAY_TESTS_START` and `// TASK6_V19_OVERLAY_TESTS_END`.
- [ ] Run the seven isolated overlay RED commands and freeze `/tmp/task6-v19-red-evidence.tap.sha256`.

### Wave 2: Store primitives

**Files:**
- Modify: `server/scheduler/store.js`
- Test: `tools/test-scheduler.js`

- [ ] Implement `quarantineClaimedRaw`.
- [ ] Implement `retargetOwnedPendingAccountAdvanceForCommand`.
- [ ] Implement `validateBlockedAccountAdvanceForDependency`.
- [ ] Implement `listExpiredRunningForRecovery` and `listOwnedRunningForRecovery`.
- [ ] Run overlay A/C plus parent store/writer registrations:

```bash
node --test --test-isolation=none --test-reporter=tap \
  --test-name-pattern '^(Task 6 v19 overlay raw quarantine store primitive preserves claimed attempt without payload parse|Task 6 v19 overlay retarget and blocked descriptor store primitives use source account)$' \
  tools/test-scheduler.js
```

### Wave 3: Writer lifecycle, status, startup, drain, and commands

**Files:**
- Modify: `server/scheduler/writer.js`
- Test: `tools/test-scheduler.js`

- [ ] Implement constructor/admission, timers, stop, private Task7 seams, status/cache helpers, and logging.
- [ ] Implement startup recovery with marker/recover/integrity/renew/rebase/final fence/publish order.
- [ ] Implement `takeNextJob`, global barrier drain, claim/apply/failure settlement, retry/backoff/quarantine, and crash hooks.
- [ ] Implement `advanceDueInCurrentUow`, direct account retarget/adopt/block, `runCommand`, and `advanceTo`.
- [ ] Run overlay B/D/E and parent writer registrations:

```bash
node --test --test-isolation=none --test-reporter=tap \
  --test-name-pattern '^(Task 6 v19 overlay status db close cache and exact scheduler exports|Task 6 v19 overlay startup renews after long recovery before ready|Task 6 v19 overlay advance due keeps live order and enqueues continuation at sixty one)$' \
  tools/test-scheduler.js
```

### Wave 4: Factory, cutover, and CLI

**Files:**
- Modify: `server/scheduler/index.js`
- Create/modify: `server/scheduler/cutover.js`
- Create/modify: `tools/scheduler-cutover.js`
- Test: `tools/test-scheduler.js`

- [ ] Implement exact `taoScheduler`, `inRange`, and `resolveDurableSchedulerOptions` surfaces.
- [ ] Implement `runMaintenanceCutover({kho, clock, ownerId})` with the release precedence contract.
- [ ] Implement CLI `parseArgs`, `runCli`, and `main`.
- [ ] Run overlay F/G and factory parent registrations:

```bash
node --test --test-isolation=none --test-reporter=tap \
  --test-name-pattern '^(Task 6 v19 overlay maintenance cutover validates guard and release precedence|Task 6 v19 overlay scheduler cutover CLI grammar lifecycle and exact exports)$' \
  tools/test-scheduler.js
```

## Stage-A and Stage-B validation

Create six-file metadata from scratch:

```bash
cat > /tmp/task6-v19-six-meta.sh <<'SH'
make_six_meta() {
  python3 - <<'PY'
import hashlib, os, stat, subprocess
paths = ['server/scheduler/store.js','server/scheduler/writer.js','server/scheduler/index.js',
  'server/scheduler/cutover.js','tools/scheduler-cutover.js','tools/test-scheduler.js']
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if record:
        meta, path = record.split(b'\t', 1)
        tracked[path.decode()] = meta.split()[0].decode()
for p in paths:
    st = os.lstat(p)
    mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
        raise SystemExit('SIX_FILE_MODE_INVALID ' + p + ' ' + mode)
    git_mode = tracked.get(p, '-')
    if git_mode not in ('-', '100644'):
        raise SystemExit('SIX_TRACKED_MODE_INVALID ' + p + ' ' + git_mode)
    data = open(p, 'rb').read()
    print('\t'.join([p, 'file', mode, git_mode, str(len(data)), hashlib.sha256(data).hexdigest()]))
PY
}
SH
sha256sum /tmp/task6-v19-six-meta.sh > /tmp/task6-v19-six-meta.sh.sha256
. /tmp/task6-v19-six-meta.sh
make_six_meta > /tmp/task6-v19-six-meta.sealed.tsv
sha256sum /tmp/task6-v19-six-meta.sealed.tsv > /tmp/task6-v19-six-meta.sealed.tsv.sha256
```

Create Stage-A script:

```bash
cat > /tmp/task6-v19-stage-a.sh <<'SH'
set -eu
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
sha256sum -c /tmp/task6-v19-stage-a.sh.sha256
sha256sum -c /tmp/task6-v19-approved-plan.sha256
sha256sum -c /tmp/task6-v19-authorities.sha256
sha256sum -c /tmp/task6-v19-inventory.sh.sha256
sha256sum -c /tmp/task6-v19-pre-inventory.tsv.sha256
sha256sum -c /tmp/task6-v19-tap-normalize.sh.sha256
sha256sum -c /tmp/task6-v19-baseline-names.txt.sha256
sha256sum -c /tmp/task6-v19-prefix.tsv.sha256
sha256sum -c /tmp/task6-v19-parent73-names.txt.sha256
sha256sum -c /tmp/task6-v19-parent-blocks.sha256
sha256sum -c /tmp/task6-v19-expected-parent-slice.js.sha256
sha256sum -c /tmp/task6-v19-expected-overlay.js.sha256
sha256sum -c /tmp/task6-v19-overlay7-names.txt.sha256
sha256sum -c /tmp/task6-v19-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v19-six-meta.sh.sha256
sha256sum -c /tmp/task6-v19-six-meta.sealed.tsv.sha256

node - <<'NODE' > /tmp/task6-v19-current-parent-slice.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V19_PARENT_TESTS_START\n';
const end = '// TASK6_V19_PARENT_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V19_PARENT_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
cmp -s /tmp/task6-v19-expected-parent-slice.js /tmp/task6-v19-current-parent-slice.js

node - <<'NODE' > /tmp/task6-v19-current-overlay.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V19_OVERLAY_TESTS_START\n';
const end = '// TASK6_V19_OVERLAY_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V19_OVERLAY_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
cmp -s /tmp/task6-v19-expected-overlay.js /tmp/task6-v19-current-overlay.js

node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [lenText, sha] = fs.readFileSync('/tmp/task6-v19-prefix.tsv', 'utf8').trim().split('\t');
const len = Number(lenText);
const data = fs.readFileSync('tools/test-scheduler.js').subarray(0, len);
const actual = crypto.createHash('sha256').update(data).digest('hex');
if (actual !== sha) throw new Error('TASK6_V19_PREFIX_CHANGED');
NODE

. /tmp/task6-v19-six-meta.sh
make_six_meta > /tmp/task6-v19-six-meta.stage-a-before.tsv
diff -u /tmp/task6-v19-six-meta.sealed.tsv /tmp/task6-v19-six-meta.stage-a-before.tsv
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js

node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v19-stage-a.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v19-stage-a-throw.tap
for f in /tmp/task6-v19-stage-a.tap /tmp/task6-v19-stage-a-throw.tap; do
  grep -E '^# tests 243$' "$f"
  grep -E '^# pass 242$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done

. /tmp/task6-v19-tap-normalize.sh
normalize_tap_for_hash /tmp/task6-v19-stage-a.tap > /tmp/task6-v19-stage-a.normalized.tap
normalize_tap_for_hash /tmp/task6-v19-stage-a-throw.tap > /tmp/task6-v19-stage-a-throw.normalized.tap
sha256sum /tmp/task6-v19-stage-a.normalized.tap > /tmp/task6-v19-stage-a.normalized.tap.sha256
sha256sum /tmp/task6-v19-stage-a-throw.normalized.tap > /tmp/task6-v19-stage-a-throw.normalized.tap.sha256

node - <<'NODE' /tmp/task6-v19-stage-a.tap
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const parentExpected = fs.readFileSync('/tmp/task6-v19-parent73-names.txt', 'utf8').trim().split('\n');
const overlayExpected = fs.readFileSync('/tmp/task6-v19-overlay7-names.txt', 'utf8').trim().split('\n');
if (names.length !== 243) throw new Error('TASK6_V19_NAME_COUNT_' + names.length);
const baseline = fs.readFileSync('/tmp/task6-v19-baseline-names.txt', 'utf8').trim().split('\n');
const task6Names = new Set([...parentExpected, ...overlayExpected]);
const filtered = names.filter((name) => !task6Names.has(name));
if (filtered.join('\n') !== baseline.join('\n')) throw new Error('TASK6_V19_BASELINE_NAMES_CHANGED');
if (new Set(overlayExpected).size !== 7) throw new Error('TASK6_V19_OVERLAY_DUPLICATE');
const actualTask6 = names.slice(baseline.length);
const expectedTask6 = [...parentExpected, ...overlayExpected];
if (actualTask6.join('\n') !== expectedTask6.join('\n')) {
  throw new Error('TASK6_V19_TASK6_NAME_ORDER_CHANGED');
}
NODE

make_six_meta > /tmp/task6-v19-six-meta.stage-a-after.tsv
diff -u /tmp/task6-v19-six-meta.stage-a-before.tsv /tmp/task6-v19-six-meta.stage-a-after.tsv

test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
test -f "$report"
test ! -L "$report"
. /tmp/task6-v19-inventory.sh
repo_inventory > /tmp/task6-v19-post-inventory.tsv
python3 - <<'PY'
from pathlib import Path
pre = {line.split('\t',1)[0]: line for line in Path('/tmp/task6-v19-pre-inventory.tsv').read_text().splitlines()}
post = {line.split('\t',1)[0]: line for line in Path('/tmp/task6-v19-post-inventory.tsv').read_text().splitlines()}
allowed = {
 'server/scheduler/store.js','server/scheduler/writer.js','server/scheduler/index.js',
 'server/scheduler/cutover.js','tools/scheduler-cutover.js','tools/test-scheduler.js',
 'docs/superpowers/reports',
 'docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md',
}
diffs = []
for key in sorted(set(pre) | set(post)):
    if pre.get(key) != post.get(key) and key not in allowed:
        diffs.append(key)
if diffs:
    raise SystemExit('TASK6_V19_SCOPE_DIFF ' + ','.join(diffs))
PY
sha256sum /tmp/task6-v19-post-inventory.tsv > /tmp/task6-v19-post-inventory.tsv.sha256

if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js "$report"; then exit 1; fi

grep -F "plan_v19_sha=$(cut -d' ' -f1 /tmp/task6-v19-approved-plan.sha256)" "$report"
grep -F 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3' "$report"
grep -F 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf' "$report"
grep -F "pre_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v19-pre-inventory.tsv.sha256)" "$report"
grep -F "post_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v19-post-inventory.tsv.sha256)" "$report"
grep -F "prefix_len=$(cut -f1 /tmp/task6-v19-prefix.tsv)" "$report"
grep -F "prefix_sha=$(cut -f2 /tmp/task6-v19-prefix.tsv)" "$report"
grep -F "baseline_names_sha=$(cut -d' ' -f1 /tmp/task6-v19-baseline-names.txt.sha256)" "$report"
grep -F "parent73_names_sha=$(cut -d' ' -f1 /tmp/task6-v19-parent73-names.txt.sha256)" "$report"
grep -F "overlay7_names_sha=$(cut -d' ' -f1 /tmp/task6-v19-overlay7-names.txt.sha256)" "$report"
grep -F "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v19-expected-parent-slice.js.sha256)" "$report"
grep -F "overlay_slice_sha=$(cut -d' ' -f1 /tmp/task6-v19-expected-overlay.js.sha256)" "$report"
grep -F "parent_blocks_sha=$(sha256sum /tmp/task6-v19-parent-blocks.sha256 | awk '{print $1}')" "$report"
grep -F "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v19-red-evidence.tap.sha256)" "$report"
grep -F "stage_a_script_sha=$(cut -d' ' -f1 /tmp/task6-v19-stage-a.sh.sha256)" "$report"
grep -F "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v19-stage-a.normalized.tap.sha256)" "$report"
grep -F "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v19-stage-a-throw.normalized.tap.sha256)" "$report"
grep -F 'stage_a_counts=243 tests / 242 pass / 0 fail / 1 skipped' "$report"
grep -F 'node_check_status=PASS' "$report"
grep -F 'whitespace_status=PASS' "$report"
grep -F 'inventory_status=PASS' "$report"
grep -F 'stage_a_status=PASS' "$report"
grep -F 'parent runtime=73 + overlay=7 => N=80' "$report"
while IFS= read -r row; do grep -F "six_meta=$row" "$report"; done < /tmp/task6-v19-six-meta.sealed.tsv
SH
chmod +x /tmp/task6-v19-stage-a.sh
sha256sum /tmp/task6-v19-stage-a.sh > /tmp/task6-v19-stage-a.sh.sha256
```

Stage-A execution:

```bash
/tmp/task6-v19-stage-a.sh
```

Review handoff:

- Launch two distinct fresh implementation reviewers using model `gpt-5.6-sol` with effort `high`.
- Review payload includes:
  - exact six rows from `/tmp/task6-v19-six-meta.sealed.tsv`;
  - V19 approved plan hash;
  - parent/Task5 authority hashes;
  - parent and overlay slice hashes;
  - overlay RED evidence hash;
  - Stage-A TAP counts and normalized hashes.
- Any six-file, plan, parent-slice, overlay-slice, evidence, or Stage-A artifact mismatch invalidates those reviews and requires new Stage-A plus two fresh reviews.

Stage-B:

```bash
/tmp/task6-v19-stage-a.sh
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
python3 - <<'PY' "$report"
import re, sys
text = open(sys.argv[1], encoding='utf-8').read().splitlines()
rows = [line for line in text if line.startswith('reviewer\t')]
if len(rows) != 2:
    raise SystemExit('TASK6_V19_REVIEWER_COUNT')
seen = set()
for row in rows:
    parts = dict(field.split('=', 1) for field in row.split('\t')[1:])
    ident = parts.get('identity')
    if not ident or ident in seen:
        raise SystemExit('TASK6_V19_REVIEWER_IDENTITY')
    seen.add(ident)
    if parts.get('model') != 'gpt-5.6-sol' or parts.get('effort') != 'high' or parts.get('outcome') != 'PASS':
        raise SystemExit('TASK6_V19_REVIEWER_OUTCOME')
PY
```

Actual collaboration tool outcomes are required separately; report text alone is not proof.

## Self-audit checklist

- [ ] V19 count is parent runtime `73` plus overlay `7`, final `243/242/0/1`.
- [ ] V18 replay and partial-wrapper overlays are absent.
- [ ] Parent block 3 starts at `12489`.
- [ ] Parent registration names count is exactly `73`.
- [ ] Overlay7 contains only the seven requested tests and each test body claims only what it proves.
- [ ] Overlay A is direct Store raw quarantine and does not claim writer settlement.
- [ ] Overlay B covers full public status, DB-close cache, Task7 private signal seam, bridge `getStatus`, and exact index exports.
- [ ] Overlay C uses source account from the PVP job, retargets same-key local wake to `targetS<=nowS`, blocks behind the PVP dependency, and validates frozen descriptor.
- [ ] Overlay D proves actual `writer.start()` renews after long recovery before ready and final lease expiry is live.
- [ ] Overlay E proves live `dqDenHan` order `[3,1,2]`, 61 boundary partial, closure skipped, and continuation active.
- [ ] Overlay F proves cutover success release same token, nonempty guard, primary-over-release precedence, and release-only propagation with prototype spies.
- [ ] Overlay G proves CLI parse grammar, safe errors, close behavior, `main`, and exports.
- [ ] Stage-A creates and validates every referenced artifact from scratch, runs fresh normal and throw-deprecation tests, compares parent and overlay slices, validates scope/inventory, and parses report fields.
