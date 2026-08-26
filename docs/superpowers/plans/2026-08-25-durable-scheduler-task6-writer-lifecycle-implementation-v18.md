# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V18

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every implementation wave and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark, retry/backoff/quarantine, command MutationGate, fresh cutover, CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** Keep the authoritative count: parent runtime `73` plus overlay runtime `9` gives `N=82`; accepted baseline `163/162/0/1` becomes final scheduler TAP `245/244/0/1`. V18 changes the failed workflow: preinventory and baseline first, skeleton exports second, faithful parent helpers/tests third, overlay9 after parent helpers, and only then isolated overlay RED. Overlay expected JS is extracted from this approved V18 plan and byte-compared with the current test slice; there is no current-slice self-seal.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.

## Global constraints

- Preserve V1-V17 plan artifacts. This planning task creates only this V18 file.
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
- Overlay runtime registrations: `9`.
- Mechanical count: `parent runtime=73 + overlay=9 => N=82`.
- Expected final scheduler TAP: `245 tests`, `244 pass`, `0 fail`, `1 skipped`.
- Parent regression 73 tests do not need individual RED evidence. Overlay9 tests do.
- Parent Task6, accepted Task5, and live source APIs override any V1-V17 conflict.
- No report self-hash and no embedded V18 self-hash; embedding the plan's own SHA is self-referential. Root passes `TASK6_V18_APPROVED_SHA` externally.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
```

## Required implementation sequence

1. Preinventory, baseline TAP/names, prefix bytes, approved V18 hash, authority hashes, and TAP normalizer.
2. Create minimal skeleton exports in `writer.js`, `index.js`, `cutover.js`, and `tools/scheduler-cutover.js` so module loading succeeds.
3. Import faithful parent Task6 blocks/helpers. Parent Task6 lines `10886-13070` define `taoWriterFixture`, `taoPartialWriterFixture`, `taoBoHenGia`, and `taoImmediateGia`; they rely on accepted live Task1-5 helper names such as `taoPvpFixtureAt`, `taoWorldSchedulerTam`, `taoMutationTam`, `docState`, `giayTuClock`, `job`, and `layLease`. If any of those helper prerequisites are absent in the current live harness, import the exact parent helper prerequisite JS ranges that define them before importing lines `10886-13070`; do not rewrite helper logic.
4. Append V18 overlay9 after the parent block. Overlay tests may use `taoWriterFixture` and the imported parent helpers.
5. Extract expected overlay JS from this approved V18 plan and `cmp` it byte-for-byte with the current `tools/test-scheduler.js` overlay slice.
6. Run isolated overlay RED. Since skeletons and parent helpers now load, each targeted failure must contain that overlay's sentinel and must not be `MODULE_NOT_FOUND`.
7. Implement Store/writer/index/cutover/CLI.
8. Run Stage-A, fresh reviews, Stage-B.

## Core logic contracts retained and corrected

### Replay protocol

Every executable calls `reducer.prepare(mutation, executable, options)`, including committed replay. The replay branch is:

1. Load/lease validation.
2. Replay precheck may inspect existing committed application metadata but does not bypass prepare.
3. `reducer.prepare`.
4. `store.insertApplication` revalidates immutable committed bytes and returns `alreadyApplied:true` for replay.
5. Only `reducer.applyPrepared` and the world effect are skipped when `alreadyApplied:true`.
6. Terminal bookkeeping still runs exactly once.

### Blocked account validator

`validateBlockedAccountAdvanceForDependency(token, accountId, revision, dependencyJobId, targetS, nowMs)` validates raw canonical bytes but never brands blocked PENDING as executable:

- It must not call `loadExecutableJob`.
- It parses with `parseCanonicalBoundedJson(row.payload_json,row.payload_sha256)`.
- It validates with `validateJob(executableInput(row,payload), {allowReconcile:true})`.
- It checks exact account/revision/idempotency/scheduled/dependency state.
- It returns only `Object.freeze({id, accountId, revision, scheduledAtS, blockedByJobId})`.
- It never returns raw row, payload, or executable.

### Global claim and public surfaces

- Owned RUNNING global continuation uses `resumeOwnedRunning(token,id,nowMs,leaseMs)`.
- `claimForResolution` is for PENDING, due RETRY_WAIT, and explicit allowed quarantine contracts only.
- `advanceTo` returns exactly `toPublicAdvanceResult(internalOutcome)`: public keys `advancedToS`, `budgetExhausted`, `hasMoreDue`, `nextDueAtS`, `processed`. Internal `deferredExternal`, `blockedExternalJobId`, and partial metadata never escape.
- `server/scheduler/index.js` exports exactly `{taoScheduler,inRange,resolveDurableSchedulerOptions}`. `baseSchedulerOptions` is private.
- Public status uses the full parent schema and does not expose `effectiveNowMs`.
- `advanceDueInCurrentUow` preserves live `kho.q.dqDenHan.all(nowS,61)` order (`ORDER BY keTiep,tk`), never account-id-only sorting.

## Production method inventory and live-ABI overlays

### `server/scheduler/store.js`

Keep the accepted Task1-5 Store bodies/arity intact unless this task explicitly extends Store. Required Task6 additions:

- `quarantineClaimedRaw(token, rawRow, failure, nowMs) -> {id,state:'QUARANTINED',errorCode}`:
  - Never parse `rawRow.payload_json`.
  - Validate only safe scalar identity fields: `id`, `state==='RUNNING'`, `locked_by===token.ownerId`, `locked_generation===token.generation`, and live lease at `nowMs`.
  - Atomic SQL fences on row id, state, owner, generation, lock expiry, and live lease.
  - Set terminal `QUARANTINED`, preserve `attempt`, clear `locked_by`, `locked_generation`, `locked_until_ms`, clear retry, store scrubbed `error_code`/message fields only.
  - If row is missing or no longer fenced, throw `LEASE_LOST` for lease mismatch/expiry and `CLAIM_SETTLEMENT_CONFLICT` otherwise.
- `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs) -> descriptor|null`:
  - Validate current same-key PENDING `ACCOUNT_ADVANCE` by canonical payload/hash first; persisted identity/canonical contradiction maps `PAYLOAD_INTEGRITY`.
  - Return `null` when no same-key row exists, including wrong supplied account/revision.
  - Reject RUNNING, blocked, terminal, or different-key rows with `ACCOUNT_ADVANCE_RETARGET_CONFLICT`.
  - Lease-fenced atomic update preserves job id, idempotency key, attempt, ownerless PENDING state, regenerates canonical payload bytes/hash and logical/scheduled time consistently with live Store canonical helpers.
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
- Status/cache: `computeOpenStatusFromStore(writer)`, `canonicalSchedulerStatus(status)`, `cloneSchedulerStatus(status)`. No `metrics.js` dependency in Task6. Validate raw values/keys before normalization; numeric strings, booleans, null counts, negative/infinite metrics are invalid. Clone nested `jobAttempts`, `jobDuration`, `leaseAcquire`, and `reconcile`. Public keys include full parent compatibility fields: flattened counts/ages, `counts`, `ages`, lifecycle booleans, `continuationActive`, metrics, and never `effectiveNowMs`. Use `max(lastEffectiveNowMs, clock.nowMs())` for read ages. Expired held lease synchronously transitions lease-lost, clears mutation/retry timers, retains exactly one standby poll. `_datDatabaseClosing()` snapshots safe public status before `dbOpen=false`; after close, `status()` and bridge `getStatus()` are cache-only and return `ready:false`, `dbOpen:false`, `reason:'SCHEDULER_DB_CLOSED'` without SQLite.
- Timers: define `clearMutationTimers()` for mutation/retry/heartbeat/reconcile/wake/continuation timers, `clearPollTimer()`, `clearGraceTimer()`, and `clearAllTimers()`. Fatal/crashed/beginStop/stop/DB-close call `clearAllTimers()`. Lease loss alone calls `clearMutationTimers()` then ensures exactly one standby acquisition poll. `_beginStop` delegates to beginStop; `_waitForStopFinalization` waits for the bounded stop tail.
- Startup: validate mode/options, acquire lease, marker before `recoverExpiredRunning` when preview has expired rows, recover expired rows, call `assertAccountDependencyIntegrity(token,effective)`, renew lease with fresh effective time, rebase surviving owned RUNNING locks with `resumeOwnedRunning(token,id,freshNow,leaseMs)`, final lease/row fence before commit, then publish staged partial ids/timers after commit.
- Claim/drain: every claim UoW calls `recordEffectiveNowInCurrentUow` before listing/claiming. `takeNextJob` checks owned RUNNING global resume first, then global barrier classification, due RETRY_WAIT, quarantine rules, foreign RUNNING, watermark gating, and only then account work. `partialQueue` contains string ids and rotates watermark-ineligible partials. Global drain uses the parent claim-for-resolution path; owned RUNNING uses `resumeOwnedRunning`.
- Downstream apply: `applyClaimed` derives default execution target from branded executable, not raw claim. It runs all advance/reducer/command work inside immediate `kho.trongGiaoDich` and `world.trongMutationScheduler`, with final lease fence before every commit.
- Failure settlement: injected crash rethrows unchanged; original `LEASE_LOST` transitions lease-lost/rethrows; original fatal storage transitions storage fatal/rethrows. Ordinary reducer failure settles in a fresh immediate UoW: reload/brand by job id and `store.fail(executable)` when valid; only when reload fails payload integrity use `quarantineClaimedRaw`. Settlement fatal storage transitions storage fatal while rethrowing the original reducer error unchanged; settlement lease loss preserves original semantics and lifecycle state.
- Crash hooks: `before-claim`, `after-claim`, `after-application-insert`, `after-game-mutation`, `before-job-completion`.
- `advanceDueInCurrentUow(mutation, nowS, budget)`:
  - Assert `world._schedulerActive(mutation)`.
  - Query `kho.q.dqDenHan.all(nowS, 61)` and process the first 60 in returned order only.
  - For each row, call live `world.advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)` through the direct account outcome/finalizer path; do not edit `server/world.js`.
  - If a 61st row remains, return command partial with `hasMoreDue:true`, persist `TICK_PARTIAL`, enqueue continuation after commit, and never invoke the command closure.
- Commands: `runCommand({name, accountId?, run})` derives effective monotonic time internally. It drains due work before invoking the closure. Any global/account partial or 61-boundary due partial returns a defined deferred response, persists `TICK_PARTIAL`, and postcommit enqueues continuation; `manualDrain` never arms implicit continuation. The closure must not be invoked on partial. If closure returns a thenable, throw `UNIT_OF_WORK_ASYNC` after invocation and roll back only changes after invocation; tests must not claim impossible pre-invocation rollback for thenables. `accountFinalizer` runs inside the owning immediate UoW before final fence/commit and exactly once.
- Direct external continuation: normal World save must not pass `deferAccountWake:true`. When direct account result has `deferredExternal`/`blockedExternalJobId`, first retarget the same-key wake with `retargetOwnedPendingAccountAdvanceForCommand`; if absent, create it once with existing `replaceAccountAdvance`; validate any existing or returned row with `validateBlockedAccountAdvanceForDependency` before adopting/blocking. A row already blocked by the same dependency is accepted; unrelated block returns exact conflict/deferred result and must not synthesize dependency success. Only finalizer records metrics.

### `server/scheduler/index.js`

Export exactly `{taoScheduler, inRange, resolveDurableSchedulerOptions}`. `taoScheduler(context)` memoizes one bridge and one world capability set per Kho, uses production six-key context, test seven-key context with `makeOwnerId`, and direct eight-key injection only per parent. Public bridge `getStatus` calls `writer.status()`, not a non-existent `writer.getStatus`.

### `server/scheduler/cutover.js`

`runMaintenanceCutover({kho, clock, ownerId})` has only those three context keys. It validates context/owner before Store construction where possible, runs `apDungMigrationScheduler(kho, clock.nowMs())` before Store, constructs Store, acquires a 15,000ms fresh lease, rejects non-legacy mode with `SCHEDULER_CUTOVER_ALREADY_DURABLE`, rejects any existing `dq` row with `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`, seeds only `combat_seed_key_v1`, writes durable mode and `CUTOVER` audit, recovers expired durable rows per parent, and releases the same token in `finally`. If both primary and release fail, rethrow the primary error; if only release fails, throw the release error. No logger dependency and no startup writer.

### `tools/scheduler-cutover.js`

Export exactly `{parseArgs, runCli, main}`. `parseArgs(argv)` accepts exactly `['--db', nonemptyFile, '--action', 'cutover']` in that order and rejects duplicates, unknowns, missing/extra tokens, empty path, or directory before opening. `runCli(argv, deps)` uses injectable `{openKho, makeOwnerId, clock}`, validates before open, derives owner by `assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)())`, defaults `clock` to live `taoClock()`, calls `runMaintenanceCutover`, returns `{exitCode, stdout, stderr}`, and closes with `kho.dong()` in `finally`. Primary errors win over close errors; close-only errors fail. `safeCliCode(error)` uses `error.code` only when it matches `/^[A-Z][A-Z0-9_]{1,63}$/`, otherwise uses `error.message` only if it matches the same code pattern, otherwise `SCHEDULER_CUTOVER_FAILED`. `main(process.argv.slice(2), process.env, {stdout:process.stdout, stderr:process.stderr}, {})` writes returned streams, sets `process.exitCode`, and never calls `process.exit`.

## Standalone artifact creation

Create these artifacts from scratch in V18 preflight:

```bash
test -n "$TASK6_V18_APPROVED_SHA"
case "$TASK6_V18_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V18_APPROVED_SHA}" -eq 64
printf '%s  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v18.md\n' \
  "$TASK6_V18_APPROVED_SHA" > /tmp/task6-v18-approved-plan.sha256
sha256sum -c /tmp/task6-v18-approved-plan.sha256

cat > /tmp/task6-v18-tap-normalize.sh <<'SH'
normalize_tap_for_hash() {
  sed -E '/^[[:space:]]+duration_ms:/d;/^# duration_ms /d' "$1"
}
SH
sha256sum /tmp/task6-v18-tap-normalize.sh > /tmp/task6-v18-tap-normalize.sh.sha256
```

Inventory helper:

```bash
cat > /tmp/task6-v18-inventory.sh <<'SH'
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
        try: st = os.lstat(p)
        except FileNotFoundError: continue
        if stat.S_ISLNK(st.st_mode):
            paths.add(p)
            dirnames.remove(name)
    for name in filenames:
        paths.add(os.path.join(rel, name) if rel else name)
for p in sorted(paths):
    try: st = os.lstat(p)
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
sha256sum /tmp/task6-v18-inventory.sh > /tmp/task6-v18-inventory.sh.sha256
. /tmp/task6-v18-inventory.sh
repo_inventory > /tmp/task6-v18-pre-inventory.tsv
sha256sum /tmp/task6-v18-pre-inventory.tsv > /tmp/task6-v18-pre-inventory.tsv.sha256
```

Baseline and prefix:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v18-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v18-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v18-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v18-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v18-baseline.tap
node - <<'NODE' /tmp/task6-v18-baseline.tap > /tmp/task6-v18-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v18-baseline-names.txt > /tmp/task6-v18-baseline-names.txt.sha256
node - <<'NODE' > /tmp/task6-v18-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const data = fs.readFileSync('tools/test-scheduler.js');
if (data.includes(Buffer.from('// TASK6_V18_PARENT_TESTS_START'))) throw new Error('TASK6_V18_ALREADY_PRESENT');
if (data.includes(Buffer.from('// TASK6_V18_PARENT_TESTS_END'))) throw new Error('TASK6_V18_ALREADY_PRESENT');
console.log([data.length, crypto.createHash('sha256').update(data).digest('hex')].join('\t'));
NODE
```

Parent names and parent source block artifacts:

```bash
cat > /tmp/task6-v18-parent73-names.txt <<'EOF'
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
wc -l /tmp/task6-v18-parent73-names.txt | grep -E '^73 '
sha256sum /tmp/task6-v18-parent73-names.txt > /tmp/task6-v18-parent73-names.txt.sha256
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
sed -n '10886,11844p' "$parent" > /tmp/task6-v18-parent-block-1.md
sed -n '11848,12485p' "$parent" > /tmp/task6-v18-parent-block-2.md
sed -n '12490,12833p' "$parent" > /tmp/task6-v18-parent-block-3.md
sed -n '12837,13070p' "$parent" > /tmp/task6-v18-parent-block-4.md
sha256sum /tmp/task6-v18-parent-block-*.md > /tmp/task6-v18-parent-blocks.sha256
python3 - <<'PY' /tmp/task6-v18-parent-block-1.md /tmp/task6-v18-parent-block-2.md /tmp/task6-v18-parent-block-3.md /tmp/task6-v18-parent-block-4.md > /tmp/task6-v18-expected-parent-slice.js
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
test -s /tmp/task6-v18-expected-parent-slice.js
sha256sum /tmp/task6-v18-expected-parent-slice.js > /tmp/task6-v18-expected-parent-slice.js.sha256
```

## V18 overlay JS authority and body

Stage extracts expected JS from the approved V18 plan, not from the current test file:

```bash
awk '/^\\/\\/ TASK6_V18_PLAN_OVERLAY_JS_START$/{flag=1; next} /^\\/\\/ TASK6_V18_PLAN_OVERLAY_JS_END$/{flag=0} flag' \
  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v18.md \
  > /tmp/task6-v18-expected-overlay.js
test -s /tmp/task6-v18-expected-overlay.js
sha256sum /tmp/task6-v18-expected-overlay.js > /tmp/task6-v18-expected-overlay.js.sha256
```

Append the expected JS after the parent block between `// TASK6_V18_OVERLAY_TESTS_START` and `// TASK6_V18_OVERLAY_TESTS_END`. Then compare:

```bash
node - <<'NODE' > /tmp/task6-v18-current-overlay.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V18_OVERLAY_TESTS_START\n';
const end = '// TASK6_V18_OVERLAY_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V18_OVERLAY_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
cmp -s /tmp/task6-v18-expected-overlay.js /tmp/task6-v18-current-overlay.js
```

```js
// TASK6_V18_PLAN_OVERLAY_JS_START
function task6v18Sentinel(sentinel, body) {
  return async function (t) {
    try { return await body(t); }
    catch (error) {
      error.message = sentinel + ': ' + (error && error.message || String(error));
      throw error;
    }
  };
}
function task6v18AssertMethod(object, name, sentinel) {
  assert.equal(typeof object[name], 'function', sentinel + ' missing ' + name);
}
function task6v18Rows(kho, sql, params) {
  var stmt = kho.db.prepare(sql);
  return stmt.all.apply(stmt, params || []);
}

test('Task 6 v18 remediation replay prepares committed applications and skips only effect',
  task6v18Sentinel('TASK6V18_RED_001_REPLAY_PREPARE', async function () {
    var x = taoWriterFixture();
    var order = [];
    try {
      task6v18AssertMethod(x.writer, 'applyClaimed', 'TASK6V18_RED_001_REPLAY_PREPARE');
      x.clock.setS(x.pvpJob.scheduled_at_s);
      await x.writer.start();
      var token = x.writer.leaseToken;
      var nowMs = x.clock.nowMs();
      var claimed = x.kho.trongGiaoDich(function () {
        return x.store.claimForResolution(token, x.pvpJob.id, nowMs, 15_000, {allowFuturePending: true});
      }, {immediate: true});
      var executable = x.store.loadExecutableJob(token, claimed, nowMs);
      var mutation = x.writer.newMutationContext(token, {value: 50_000}, nowMs);
      x.kho.trongGiaoDich(function () {
        x.world.trongMutationScheduler(mutation, function () {
          var prepared = x.reducer.prepare(mutation, executable, {executionTargetS: executable.scheduled_at_s});
          x.store.insertApplication(token, executable, prepared.application, nowMs, prepared.canonicalTContext || null);
        });
      }, {immediate: true});
      var originalPrepare = x.reducer.prepare;
      var originalApplyPrepared = x.reducer.applyPrepared;
      var originalInsert = x.store.insertApplication;
      var originalLoad = x.store.loadExecutableJob;
      var originalCommitted = x.store.hasCommittedApplication;
      x.store.loadExecutableJob = function () {
        order.push('load');
        return originalLoad.apply(this, arguments);
      };
      x.store.hasCommittedApplication = function () {
        order.push('replay-precheck');
        return originalCommitted.apply(this, arguments);
      };
      x.reducer.prepare = function () {
        order.push('prepare');
        return originalPrepare.apply(this, arguments);
      };
      x.store.insertApplication = function () {
        order.push('insert');
        var row = originalInsert.apply(this, arguments);
        assert.equal(row.alreadyApplied, true, 'TASK6V18_RED_001_REPLAY_PREPARE insert revalidates replay bytes');
        return row;
      };
      x.reducer.applyPrepared = function () {
        order.push('apply');
        return originalApplyPrepared.apply(this, arguments);
      };
      await x.writer.applyClaimed(claimed, {value: 50_000}, nowMs);
      assert.ok(order.indexOf('load') >= 0, 'TASK6V18_RED_001_REPLAY_PREPARE load/lease before replay');
      assert.ok(order.indexOf('replay-precheck') > order.indexOf('load'),
        'TASK6V18_RED_001_REPLAY_PREPARE replay precheck after load');
      assert.ok(order.indexOf('prepare') > order.indexOf('replay-precheck'), 'prepare after replay precheck');
      assert.ok(order.indexOf('insert') > order.indexOf('prepare'), 'insert after prepare');
      assert.equal(order.indexOf('apply'), -1, 'alreadyApplied skips only applyPrepared/world effect');
    } finally {
      await x.writer.stop(100).catch(function () {});
      x.dong();
    }
  }));

test('Task 6 v18 remediation partial wrapper and established zero retain exact locks',
  task6v18Sentinel('TASK6V18_RED_002_PARTIAL_ZERO', async function () {
    var x = taoPartialWriterFixture();
    try {
      task6v18AssertMethod(x.writer, 'finishPreparedOrPartial', 'TASK6V18_RED_002_PARTIAL_ZERO');
      await x.writer.start();
      await x.writer.drainNow();
      var partial = x.store.getById(x.accountJob.id);
      var before = x.kho.db.prepare(
        'SELECT state,locked_by,locked_generation,locked_until_ms,checkpoint_revision FROM event_jobs WHERE id=?'
      ).get(partial.id);
      assert.equal(before.state, 'RUNNING');
      assert.ok(Number.isSafeInteger(Number(before.checkpoint_revision)));
      var prepared = {kind: 'partial',
        advanceResult: {processed: 1, advancedToS: giayTuClock(x.clock), nextDueAtS: null,
          hasMoreDue: true, budgetExhausted: true, saveReceipt: {revision: Number(before.checkpoint_revision)}},
        saveReceipt: {revision: Number(before.checkpoint_revision)}};
      var effect = {checkpointRevision: Number(before.checkpoint_revision), saveReceipt: prepared.saveReceipt};
      var zeroPrepared = {kind: 'partial',
        advanceResult: {processed: 0, advancedToS: giayTuClock(x.clock), nextDueAtS: partial.scheduled_at_s,
          hasMoreDue: true, budgetExhausted: true, saveReceipt: null},
        saveReceipt: null};
      var zeroEffect = {checkpointRevision: null, saveReceipt: null};
      assert.equal(Object.getPrototypeOf(effect), Object.prototype);
      assert.deepEqual(Object.keys(effect), ['checkpointRevision', 'saveReceipt']);
      assert.deepEqual(Reflect.ownKeys(effect), ['checkpointRevision', 'saveReceipt']);
      assert.strictEqual(effect.saveReceipt, prepared.saveReceipt);
      assert.deepEqual(Object.keys(zeroEffect), ['checkpointRevision', 'saveReceipt']);
      assert.equal(zeroEffect.checkpointRevision, null);
      assert.equal(zeroEffect.saveReceipt, null);
      assert.strictEqual(zeroPrepared.advanceResult.saveReceipt, zeroEffect.saveReceipt);
      var after = x.kho.db.prepare(
        'SELECT state,locked_by,locked_generation,locked_until_ms,checkpoint_revision FROM event_jobs WHERE id=?'
      ).get(partial.id);
      assert.deepEqual(after, before, 'established-zero/partial retained RUNNING lock tuple before final batch');
      await x.writer.drainNow();
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v18 remediation corrupted claimed payload uses raw quarantine settlement',
  task6v18Sentinel('TASK6V18_RED_003_RAW_QUARANTINE', async function () {
    var x = taoWriterFixture();
    var prepareCount = 0;
    var originalPrepare = x.reducer.prepare;
    try {
      task6v18AssertMethod(x.store, 'quarantineClaimedRaw', 'TASK6V18_RED_003_RAW_QUARANTINE');
      x.clock.setS(x.pvpJob.scheduled_at_s);
      x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
        .run('{"schemaVersion":1,"bad":true}', x.pvpJob.id);
      x.reducer.prepare = function () {
        prepareCount++;
        return originalPrepare.apply(this, arguments);
      };
      await x.writer.start();
      await x.writer.drainNow();
      var stored = x.store.getByIdempotencyKey(x.pvpJob.idempotency_key);
      assert.equal(prepareCount, 0);
      assert.equal(stored.state, 'QUARANTINED');
      assert.equal(stored.error_code, 'PAYLOAD_INTEGRITY');
      assert.equal(Number(stored.attempt), 0);
      assert.equal(stored.retry_at_ms, null);
      assert.equal(stored.locked_by, null);
      assert.equal(stored.locked_generation, null);
      assert.equal(stored.locked_until_ms, null);
    } finally {
      x.reducer.prepare = originalPrepare;
      await x.writer.stop(100).catch(function () {});
      x.dong();
    }
  }));

test('Task 6 v18 remediation status exposes exact public schema and DB-close cache',
  task6v18Sentinel('TASK6V18_RED_004_STATUS_SCHEMA', async function () {
    var x = taoWriterFixture({manualDrain: false, timers: taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }})});
    try {
      await x.writer.start();
      var status = x.writer.status();
      var keys = Object.keys(status).sort();
      assert.deepEqual(keys, [
        'ages', 'continuationActive', 'counts', 'dbOpen', 'draining',
        'dueBacklog', 'heartbeatTimerActive', 'leaseHeld', 'metrics', 'mode',
        'nextEligibleAtMs', 'oldestDueAgeMs', 'pending', 'pollTimerActive',
        'quarantined', 'ready', 'reason', 'reconcileTimerActive',
        'recoveryComplete', 'retryWait', 'running', 'signalHandlerInstalled',
        'state', 'wakeTimerActive', 'watermarkS', 'writerLeaseHeld'
      ].sort());
      assert.equal(Object.prototype.hasOwnProperty.call(status, 'effectiveNowMs'), false);
      assert.equal(typeof status.leaseHeld, 'boolean');
      assert.equal(typeof status.writerLeaseHeld, 'boolean');
      assert.equal(typeof status.recoveryComplete, 'boolean');
      assert.equal(typeof status.draining, 'boolean');
      assert.equal(typeof status.wakeTimerActive, 'boolean');
      assert.equal(typeof status.heartbeatTimerActive, 'boolean');
      assert.equal(typeof status.reconcileTimerActive, 'boolean');
      assert.equal(typeof status.continuationActive, 'boolean');
      assert.equal(typeof status.signalHandlerInstalled, 'boolean');
      assert.equal(typeof status.counts.dueBacklog, 'number');
      assert.equal(typeof status.ages.oldestDueAgeMs, 'number');
      assert.equal(typeof status.metrics.jobAttempts, 'object');
      status.metrics.jobAttempts.mutated = 1;
      assert.equal(x.writer.metrics.jobAttempts.mutated, undefined);
      x.writer.metrics.jobAttempts.invalid = '1';
      assert.equal(x.writer.status().reason, 'SCHEDULER_STATUS_INVALID');
      delete x.writer.metrics.jobAttempts.invalid;
      task6v18AssertMethod(x.writer, '_datDatabaseClosing', 'TASK6V18_RED_004_STATUS_SCHEMA');
      x.writer._datDatabaseClosing();
      x.store.statusSnapshot = function () { throw new Error('SQLITE_READ_AFTER_CLOSE'); };
      var closed = x.writer.status();
      assert.equal(closed.dbOpen, false);
      assert.equal(closed.ready, false);
      assert.equal(closed.reason, 'SCHEDULER_DB_CLOSED');
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v18 remediation external retarget uses writer continuation and rejects unrelated block',
  task6v18Sentinel('TASK6V18_RED_005_RETARGET', async function () {
    var x = taoSecondaryDeferredExternalFixture('mail');
    var recordJobs = 0;
    try {
      task6v18AssertMethod(x.store, 'retargetOwnedPendingAccountAdvanceForCommand', 'TASK6V18_RED_005_RETARGET');
      task6v18AssertMethod(x.store, 'validateBlockedAccountAdvanceForDependency', 'TASK6V18_RED_005_RETARGET');
      var dependencyT = x.targetS || x.dependencyTargetS || x.store.globalWatermarkS() || giayTuClock(x.clock);
      x.clock.setS(dependencyT);
      await x.writer.start();
      var originalNewMutationContext = x.writer.newMutationContext;
      x.writer.newMutationContext = function () {
        var mutation = originalNewMutationContext.apply(this, arguments);
        var originalRecord = mutation.recordJob;
        mutation.recordJob = function () { recordJobs++; return originalRecord.apply(this, arguments); };
        return mutation;
      };
      var deferred = await x.scheduler.runCommand({
        name: 'v18-retarget-proof',
        accountId: x.attacker,
        run: function () { throw new Error('closure must not run'); }
      });
      assert.deepEqual(deferred, {deferred: true, code: 'TICK_PARTIAL'});
      assert.equal(recordJobs, 1);
      var blocked = task6v18Rows(x.kho,
        "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? AND blocked_by_job_id IS NOT NULL",
        [String(x.attacker)]);
      assert.equal(blocked.length, 1);
      var descriptor = x.store.validateBlockedAccountAdvanceForDependency(
        x.writer.leaseToken, x.attacker, Number(blocked[0].checkpoint_revision),
        blocked[0].blocked_by_job_id, Number(blocked[0].scheduled_at_s), x.clock.nowMs()
      );
      assert.equal(Object.isFrozen(descriptor), true);
      assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'payload'), false);
      assert.equal(Object.keys(descriptor).sort().join(','),
        ['accountId', 'blockedByJobId', 'id', 'revision', 'scheduledAtS'].sort().join(','));
      assert.throws(function () {
        x.store.validateBlockedAccountAdvanceForDependency(
          x.writer.leaseToken, x.attacker, Number(blocked[0].checkpoint_revision),
          '00000000-0000-4000-8000-000000000999', Number(blocked[0].scheduled_at_s), x.clock.nowMs()
        );
      }, /ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT/);
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v18 remediation startup recovery renews before resume and publishes after commit',
  task6v18Sentinel('TASK6V18_RED_006_STARTUP_RECOVERY', async function () {
    var x = taoWriterFixture({manualDrain: false, timers: taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }})});
    var order = [];
    try {
      task6v18AssertMethod(x.store, 'listExpiredRunningForRecovery', 'TASK6V18_RED_006_STARTUP_RECOVERY');
      task6v18AssertMethod(x.store, 'listOwnedRunningForRecovery', 'TASK6V18_RED_006_STARTUP_RECOVERY');
      var token = layLease(x, x.ownerId);
      var nowMs = x.clock.nowMs();
      var expired = x.store.claimForResolution(token, x.pvpJob.id, nowMs, 15_000, {allowFuturePending: true});
      x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?').run(nowMs - 1, expired.id);
      var local = x.store.schedule(token, job('account-advance:' + x.attacker + ':0',
        giayTuClock(x.clock), 100, {aggregateId: String(x.attacker), expectedRevision: 0,
          payload: {schemaVersion: 1, accountId: x.attacker}}), nowMs);
      var survivor = x.store.claimForResolution(token, local.id, nowMs, 15_000, {allowFuturePending: true});
      x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?').run(nowMs + 60_000, survivor.id);
      var originalMark = x.store.markDurableMutation;
      var originalRecover = x.store.recoverExpiredRunning;
      var originalRenew = x.store.renewLease;
      var originalResume = x.store.resumeOwnedRunning;
      x.store.markDurableMutation = function () { order.push('mark'); return originalMark.apply(this, arguments); };
      x.store.recoverExpiredRunning = function () { order.push('recover'); return originalRecover.apply(this, arguments); };
      x.store.renewLease = function () { order.push('renew'); return originalRenew.apply(this, arguments); };
      x.store.resumeOwnedRunning = function () { order.push('resume'); return originalResume.apply(this, arguments); };
      await x.writer.start();
      assert.ok(order.indexOf('mark') >= 0 && order.indexOf('mark') < order.indexOf('recover'));
      assert.ok(order.indexOf('renew') >= 0 && order.indexOf('renew') < order.indexOf('resume'));
      assert.equal(x.writer.status().ready, true);
      assert.notEqual(x.store.getById(expired.id).state, 'RUNNING');
      assert.ok(Number(x.store.getById(survivor.id).locked_until_ms) > x.clock.nowMs());
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v18 remediation advance-due preserves dqDenHan order and skips closure at sixty one',
  task6v18Sentinel('TASK6V18_RED_007_DUE_ORDER', async function () {
    var x = taoWriterFixture();
    var processed = [];
    var closureRan = false;
    try {
      task6v18AssertMethod(x.writer, 'advanceDueInCurrentUow', 'TASK6V18_RED_007_DUE_ORDER');
      await x.writer.start();
      var originalAll = x.kho.q.dqDenHan.all;
      var mixed = [{tk: 3, keTiep: 1}, {tk: 1, keTiep: 2}, {tk: 2, keTiep: 2}];
      for (var i = 4; i <= 61; i++) mixed.push({tk: i, keTiep: 2});
      x.kho.q.dqDenHan.all = function (nowS, limit) {
        assert.equal(limit, 61);
        return mixed.slice();
      };
      var originalDirect = x.writer.directAccountOutcomeInCurrentUow;
      x.writer.directAccountOutcomeInCurrentUow = function (mutation, accountId) {
        processed.push(accountId);
        return {processed: 1, advancedToS: giayTuClock(x.clock),
          nextDueAtS: null, hasMoreDue: false, budgetExhausted: false};
      };
      var result = await x.scheduler.runCommand({
        name: 'advance-due',
        run: function () { closureRan = true; }
      });
      assert.deepEqual(processed.slice(0, 3), [3, 1, 2]);
      assert.equal(processed.length, 60);
      assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'});
      assert.equal(closureRan, false);
      x.kho.q.dqDenHan.all = originalAll;
      x.writer.directAccountOutcomeInCurrentUow = originalDirect;
    } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
  }));

test('Task 6 v18 remediation maintenance cutover validates context and release policy',
  task6v18Sentinel('TASK6V18_RED_008_CUTOVER', async function () {
    var runMaintenanceCutover = require('../server/scheduler/cutover.js').runMaintenanceCutover;
    var x = taoKhoTam();
    var calls = [];
    try {
      task6v18AssertMethod({runMaintenanceCutover: runMaintenanceCutover}, 'runMaintenanceCutover',
        'TASK6V18_RED_008_CUTOVER');
      var original = x.kho.trongGiaoDich.bind(x.kho);
      x.kho.trongGiaoDich = function (fn, options) {
        calls.push(options);
        return original(fn, options);
      };
      var result = runMaintenanceCutover({kho: x.kho, clock: fakeClock(NOW_MS),
        ownerId: '00000000-0000-4000-8000-000000000888'});
      assert.deepEqual(result, {mode: 'durable', imported: 0, recovered: 0});
      assert.ok(calls.some(function (options) { return options && options.immediate === true; }));
      assert.equal(x.kho.cauhinh('seed'), null);
      assert.equal(x.kho.cauhinh('combat_seed_key_v1').length, 64);
      assert.equal(x.kho.db.prepare("SELECT COUNT(*) AS n FROM scheduler_audit WHERE action='CUTOVER'").get().n, 1);
      assert.equal(x.kho.db.prepare("SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'").get().expires_at_ms, 0);
      assert.throws(function () { runMaintenanceCutover({kho: x.kho, clock: fakeClock(NOW_MS), ownerId: 'bad'}); },
        /SCHEDULER_OWNER_ID_INVALID/);
    } finally { dongKhoTam(x); }
    var nonempty = taoKhoTam();
    try {
      var legacyId = Number(nonempty.kho.db.prepare(
        'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
      ).run('v18-cutover-legacy', 'V18 Cutover Legacy', 'h', 's', 1, 1).lastInsertRowid);
      nonempty.kho.db.prepare(
        'INSERT INTO dq(' +
        'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
        'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
      assert.throws(function () {
        runMaintenanceCutover({kho: nonempty.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000889'});
      }, /SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED/);
    } finally { dongKhoTam(nonempty); }
    var primary = taoKhoTam();
    try {
      var realPrimaryUow = primary.kho.trongGiaoDich.bind(primary.kho);
      primary.kho.trongGiaoDich = function (fn, options) {
        return realPrimaryUow(function () { throw new Error('PRIMARY_CUTOVER_FAILURE'); }, options);
      };
      assert.throws(function () {
        runMaintenanceCutover({kho: primary.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000890'});
      }, /PRIMARY_CUTOVER_FAILURE/);
    } finally { dongKhoTam(primary); }
    var releaseOnly = taoKhoTam();
    try {
      var released = false;
      var realReleaseUow = releaseOnly.kho.trongGiaoDich.bind(releaseOnly.kho);
      releaseOnly.kho.trongGiaoDich = function (fn, options) {
        return realReleaseUow(function () {
          var result = fn();
          if (result && result.mode === 'durable') {
            released = true;
            throw new Error('RELEASE_ONLY_FAILURE');
          }
          return result;
        }, options);
      };
      assert.throws(function () {
        runMaintenanceCutover({kho: releaseOnly.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000891'});
      }, /RELEASE_ONLY_FAILURE/);
      assert.equal(released, true);
    } finally { dongKhoTam(releaseOnly); }
  }));

test('Task 6 v18 remediation scheduler cutover CLI grammar lifecycle and exact exports',
  task6v18Sentinel('TASK6V18_RED_009_CLI', async function () {
    var cli = require('../tools/scheduler-cutover.js');
    assert.deepEqual(Object.keys(cli).sort(), ['main', 'parseArgs', 'runCli'].sort());
    assert.deepEqual(cli.parseArgs(['--db', '/tmp/game.sqlite', '--action', 'cutover']),
      {dbPath: '/tmp/game.sqlite', action: 'cutover'});
    assert.throws(function () { cli.parseArgs(['--action', 'cutover', '--db', '/tmp/game.sqlite']); },
      /SCHEDULER_CLI_ARGS_INVALID/);
    assert.throws(function () { cli.parseArgs(['--db', '', '--action', 'cutover']); },
      /SCHEDULER_CLI_ARGS_INVALID/);
    var x = taoKhoTam();
    var closed = 0;
    var originalDong = x.kho.dong.bind(x.kho);
    x.kho.dong = function () { closed++; return originalDong(); };
    try {
      var result = await cli.runCli(['--db', x.file, '--action', 'cutover'], {
        makeOwnerId: function () { return '00000000-0000-4000-8000-000000000999'; },
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
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000999'; },
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
    var closeOnly = await cli.runCli(['--db', '/tmp/game.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000997'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { return closeDb.kho; }
    });
    assert.equal(closeOnly.exitCode, 1);
    assert.equal(closeOnly.stdout, '');
    assert.equal(closeOnly.stderr, 'BAD_CLOSE\n');
    assert.equal(closeCount, 1);
    removeDb(closeDb.file);
    var indexExports = require('../server/scheduler/index.js');
    assert.deepEqual(Object.keys(indexExports).sort(),
      ['inRange', 'resolveDurableSchedulerOptions', 'taoScheduler'].sort());
  }));
// TASK6_V18_PLAN_OVERLAY_JS_END
```

Overlay names and RED:

```bash
cat > /tmp/task6-v18-overlay9-names.txt <<'EOF'
Task 6 v18 remediation replay prepares committed applications and skips only effect
Task 6 v18 remediation partial wrapper and established zero retain exact locks
Task 6 v18 remediation corrupted claimed payload uses raw quarantine settlement
Task 6 v18 remediation status exposes exact public schema and DB-close cache
Task 6 v18 remediation external retarget uses writer continuation and rejects unrelated block
Task 6 v18 remediation startup recovery renews before resume and publishes after commit
Task 6 v18 remediation advance-due preserves dqDenHan order and skips closure at sixty one
Task 6 v18 remediation maintenance cutover validates context and release policy
Task 6 v18 remediation scheduler cutover CLI grammar lifecycle and exact exports
EOF
sha256sum /tmp/task6-v18-overlay9-names.txt > /tmp/task6-v18-overlay9-names.txt.sha256
test ! -e /tmp/task6-v18-red-evidence.tap
: > /tmp/task6-v18-red-evidence.tap
run_one_overlay_red() {
  name="$1"; sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v18-overlay-red.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  grep -F "# Subtest: $name" "$tmp"
  grep -F "not ok 1 - $name" "$tmp"
  grep -F "$sentinel" "$tmp"
  if grep -F 'MODULE_NOT_FOUND' "$tmp"; then cat "$tmp"; rm -f "$tmp"; exit 1; fi
  printf '%s\nname=%s\nsentinel=%s\n' '### TASK6_V18_OVERLAY_RED_CASE_START' "$name" "$sentinel" >> /tmp/task6-v18-red-evidence.tap
  cat "$tmp" >> /tmp/task6-v18-red-evidence.tap
  printf '%s\n' '### TASK6_V18_OVERLAY_RED_CASE_END' >> /tmp/task6-v18-red-evidence.tap
  rm -f "$tmp"
}
run_one_overlay_red 'Task 6 v18 remediation replay prepares committed applications and skips only effect' 'TASK6V18_RED_001_REPLAY_PREPARE'
run_one_overlay_red 'Task 6 v18 remediation partial wrapper and established zero retain exact locks' 'TASK6V18_RED_002_PARTIAL_ZERO'
run_one_overlay_red 'Task 6 v18 remediation corrupted claimed payload uses raw quarantine settlement' 'TASK6V18_RED_003_RAW_QUARANTINE'
run_one_overlay_red 'Task 6 v18 remediation status exposes exact public schema and DB-close cache' 'TASK6V18_RED_004_STATUS_SCHEMA'
run_one_overlay_red 'Task 6 v18 remediation external retarget uses writer continuation and rejects unrelated block' 'TASK6V18_RED_005_RETARGET'
run_one_overlay_red 'Task 6 v18 remediation startup recovery renews before resume and publishes after commit' 'TASK6V18_RED_006_STARTUP_RECOVERY'
run_one_overlay_red 'Task 6 v18 remediation advance-due preserves dqDenHan order and skips closure at sixty one' 'TASK6V18_RED_007_DUE_ORDER'
run_one_overlay_red 'Task 6 v18 remediation maintenance cutover validates context and release policy' 'TASK6V18_RED_008_CUTOVER'
run_one_overlay_red 'Task 6 v18 remediation scheduler cutover CLI grammar lifecycle and exact exports' 'TASK6V18_RED_009_CLI'
grep -c '^### TASK6_V18_OVERLAY_RED_CASE_START$' /tmp/task6-v18-red-evidence.tap | grep -E '^9$'
grep -c '^### TASK6_V18_OVERLAY_RED_CASE_END$' /tmp/task6-v18-red-evidence.tap | grep -E '^9$'
sha256sum /tmp/task6-v18-red-evidence.tap > /tmp/task6-v18-red-evidence.tap.sha256
```

## Stage-A and Stage-B

Create six-file metadata from scratch:

```bash
cat > /tmp/task6-v18-six-meta.sh <<'SH'
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
sha256sum /tmp/task6-v18-six-meta.sh > /tmp/task6-v18-six-meta.sh.sha256
. /tmp/task6-v18-six-meta.sh
make_six_meta > /tmp/task6-v18-six-meta.sealed.tsv
sha256sum /tmp/task6-v18-six-meta.sealed.tsv > /tmp/task6-v18-six-meta.sealed.tsv.sha256
```

Stage-A must run fresh, not trust stale TAP:

```bash
sha256sum -c /tmp/task6-v18-approved-plan.sha256
sha256sum -c /tmp/task6-v18-inventory.sh.sha256
sha256sum -c /tmp/task6-v18-pre-inventory.tsv.sha256
sha256sum -c /tmp/task6-v18-tap-normalize.sh.sha256
sha256sum -c /tmp/task6-v18-baseline-names.txt.sha256
sha256sum -c /tmp/task6-v18-parent73-names.txt.sha256
sha256sum -c /tmp/task6-v18-parent-blocks.sha256
sha256sum -c /tmp/task6-v18-expected-parent-slice.js.sha256
sha256sum -c /tmp/task6-v18-expected-overlay.js.sha256
sha256sum -c /tmp/task6-v18-overlay9-names.txt.sha256
sha256sum -c /tmp/task6-v18-red-evidence.tap.sha256
node - <<'NODE' > /tmp/task6-v18-current-parent-slice.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V18_PARENT_TESTS_START\n';
const end = '// TASK6_V18_PARENT_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V18_PARENT_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
cmp -s /tmp/task6-v18-expected-parent-slice.js /tmp/task6-v18-current-parent-slice.js
node - <<'NODE' > /tmp/task6-v18-current-overlay.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V18_OVERLAY_TESTS_START\n';
const end = '// TASK6_V18_OVERLAY_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V18_OVERLAY_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
cmp -s /tmp/task6-v18-expected-overlay.js /tmp/task6-v18-current-overlay.js
. /tmp/task6-v18-six-meta.sh
make_six_meta > /tmp/task6-v18-six-meta.stage-a-before.tsv
diff -u /tmp/task6-v18-six-meta.sealed.tsv /tmp/task6-v18-six-meta.stage-a-before.tsv
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v18-stage-a.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v18-stage-a-throw.tap
for f in /tmp/task6-v18-stage-a.tap /tmp/task6-v18-stage-a-throw.tap; do
  grep -E '^# tests 245$' "$f"
  grep -E '^# pass 244$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
. /tmp/task6-v18-tap-normalize.sh
normalize_tap_for_hash /tmp/task6-v18-stage-a.tap > /tmp/task6-v18-stage-a.normalized.tap
normalize_tap_for_hash /tmp/task6-v18-stage-a-throw.tap > /tmp/task6-v18-stage-a-throw.normalized.tap
sha256sum /tmp/task6-v18-stage-a.normalized.tap > /tmp/task6-v18-stage-a.normalized.tap.sha256
sha256sum /tmp/task6-v18-stage-a-throw.normalized.tap > /tmp/task6-v18-stage-a-throw.normalized.tap.sha256
make_six_meta > /tmp/task6-v18-six-meta.stage-a-after.tsv
diff -u /tmp/task6-v18-six-meta.stage-a-before.tsv /tmp/task6-v18-six-meta.stage-a-after.tsv
```

Stage-A report validation:

```bash
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
grep -F "plan_v18_sha=$(cut -d' ' -f1 /tmp/task6-v18-approved-plan.sha256)" "$report"
grep -F 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3' "$report"
grep -F 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf' "$report"
grep -F "prefix_len=$(cut -f1 /tmp/task6-v18-prefix.tsv)" "$report"
grep -F "prefix_sha=$(cut -f2 /tmp/task6-v18-prefix.tsv)" "$report"
grep -F "baseline_names_sha=$(cut -d' ' -f1 /tmp/task6-v18-baseline-names.txt.sha256)" "$report"
grep -F "parent73_names_sha=$(cut -d' ' -f1 /tmp/task6-v18-parent73-names.txt.sha256)" "$report"
grep -F "overlay9_names_sha=$(cut -d' ' -f1 /tmp/task6-v18-overlay9-names.txt.sha256)" "$report"
grep -F "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v18-expected-parent-slice.js.sha256)" "$report"
grep -F "overlay_slice_sha=$(cut -d' ' -f1 /tmp/task6-v18-expected-overlay.js.sha256)" "$report"
grep -F "parent_blocks_sha=$(sha256sum /tmp/task6-v18-parent-blocks.sha256 | awk '{print $1}')" "$report"
grep -F "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v18-red-evidence.tap.sha256)" "$report"
grep -F "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v18-stage-a.normalized.tap.sha256)" "$report"
grep -F "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v18-stage-a-throw.normalized.tap.sha256)" "$report"
grep -F "final_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v18-stage-a.normalized.tap.sha256)" "$report"
grep -F "final_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v18-stage-a-throw.normalized.tap.sha256)" "$report"
grep -F 'stage_a_counts=245 tests / 244 pass / 0 fail / 1 skipped' "$report"
grep -F 'node_check_status=PASS' "$report"
grep -F 'whitespace_status=PASS' "$report"
grep -F 'inventory_status=PASS' "$report"
grep -F 'stage_a_status=PASS' "$report"
grep -F 'parent runtime=73 + overlay=9 => N=82' "$report"
while IFS= read -r row; do grep -F "six_meta=$row" "$report"; done < /tmp/task6-v18-six-meta.sealed.tsv
if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js "$report"; then exit 1; fi
```

Stage-B reruns Stage-A, then validates exactly two distinct reviewer lines:

```text
Reviewer 1: identity=<distinct-tool-agent-id-1> model=gpt-5.6-sol effort=high outcome=PASS
Reviewer 2: identity=<distinct-tool-agent-id-2> model=gpt-5.6-sol effort=high outcome=PASS
```

Actual collaboration tool results are required separately; report text alone is not proof.

## Self-audit checklist

- [ ] Sequence is preinventory/baseline, skeleton exports, parent blocks/helpers, overlay append, overlay RED.
- [ ] Overlay tests use parent `taoWriterFixture`/helpers, not custom invalid world fixtures.
- [ ] Expected overlay JS is extracted from the approved V18 plan and byte-compared with the current test slice.
- [ ] Overlay1 asserts prepare is called on committed replay and apply/effect is skipped only after `alreadyApplied`.
- [ ] Overlay2 covers partial wrapper and established-zero lock retention.
- [ ] Overlay3 covers real writer drain corrupted payload raw quarantine.
- [ ] Overlay4 covers full parent public status schema, no `effectiveNowMs`, strict invalid metrics, clone, DB-close cache.
- [ ] Overlay5 exercises writer external retarget/adopt/block and unrelated dependency conflict.
- [ ] Overlay6 uses actual `SchedulerWriter.start` recovery order and live locks.
- [ ] Overlay7 proves mixed `dqDenHan` order and 61 boundary partial with closure skipped.
- [ ] Overlay8 covers real cutover success/rejection/release policy.
- [ ] Overlay9 covers exact CLI and exact index exports.
- [ ] Stage-A creates and validates every referenced artifact from scratch, runs fresh tests, compares overlay and parent slices, validates all report fields and six-meta rows.
