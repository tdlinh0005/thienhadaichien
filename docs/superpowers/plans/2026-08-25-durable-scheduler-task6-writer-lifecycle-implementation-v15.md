# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V15

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every implementation wave and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark, retry/backoff/quarantine, command MutationGate, fresh cutover, CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** V15 keeps the V14 test strategy: parent runtime registrations are authoritative (`73`) and remediation overlay tests are exact (`9`), for `N=82` and final scheduler TAP `245/244/0/1`. V15 fixes workflow and implementation-map blockers: V15 hash is approved externally, parent code is imported from complete JS blocks without Markdown fences, overlay RED runs before skeletons, production methods are inventoried by method name, status validation is strict before coercion, startup recovery separates expired rows from surviving owned RUNNING rows, and Stage-A/B are executable scripts that recompute current seals.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.

## Global constraints

- Preserve V1-V14 plan artifacts. This planning task creates only this V15 file.
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
- Mechanical count: `parent runtime=73 + overlay=9 => N=82`.
- Expected final scheduler TAP from accepted baseline `163/162/0/1`: `245 tests`, `244 pass`, `0 fail`, `1 skipped`.
- Parent regression 73 tests do not require individual RED or sentinels. Some may already pass. Preserve their runtime names and assertions.
- Only overlay9 tests require isolated one-time RED evidence with lazy imports and unique sentinels.
- Parent Task6, accepted Task5, and live source APIs override every V1-V14 conflict.
- No report self-hash and no embedded V15 self-hash.

## V15 approved-hash pattern

Embedding this V15 file's own SHA inside itself is self-referential and invalid. Use this external approval pattern:

1. Root freezes V15 after authoring and computes the exact 64-hex SHA.
2. Root passes that exact reviewer-approved hash to the implementer as `TASK6_V15_APPROVED_SHA` and writes the same value into `/tmp/task6-v15-approved-plan.sha256`.
3. Preflight, Stage-A, and Stage-B compare the current V15 file to that approved hash.

Executable check:

```bash
test -n "$TASK6_V15_APPROVED_SHA"
case "$TASK6_V15_APPROVED_SHA" in
  (*[!0-9a-f]*|'') echo 'TASK6_V15_APPROVED_SHA must be lowercase sha256' >&2; exit 1 ;;
esac
test "${#TASK6_V15_APPROVED_SHA}" -eq 64
plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v15.md'
test -f "$plan"
test ! -L "$plan"
python3 - <<'PY' "$plan"
import os, stat, sys
st = os.lstat(sys.argv[1])
mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
    raise SystemExit('V15 plan must be real regular 100644')
PY
actual="$(sha256sum "$plan" | awk '{print $1}')"
test "$actual" = "$TASK6_V15_APPROVED_SHA"
printf '%s  %s\n' "$TASK6_V15_APPROVED_SHA" "$plan" > /tmp/task6-v15-approved-plan.sha256
sha256sum -c /tmp/task6-v15-approved-plan.sha256
```

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
```

## Complete Task6 Store consumption list

This is the complete planned Store/API consumption list for Task6. If implementation needs a Store method not listed here, stop and update the implementation report before coding that use.

- Constructor/export helpers: `new SchedulerStore(kho, clock)`, `assertSchedulerOwnerId`, `validateJob`, `normalizeSchedulerErrorCode`, `canonicalJson`, `sha256`.
- Scheduling/public writes: `schedule`, `cancel`, `markDurableMutation`, `writeAudit`.
- Lease/time: `schedulerMode`, `peekEffectiveNowMs`, `recordEffectiveNowMs`, `acquireLease`, `renewLease`, `releaseLease`, `leaseTokenIsLive`, `assertLiveLease`.
- Claim/read: `claimNext`, `claimForResolution`, `resumeOwnedRunning`, `getById`, `getByIdempotencyKey`, `loadExecutableJob`.
- Application/lifecycle: `hasCommittedApplication`, `insertApplication`, `checkpointPartial`, `completeApplied`, `finishResolved`, `completeAccountAdvanceAndScheduleSuccessor`, `fail`, `recoverExpiredRunning`.
- Status/logging: `statusSnapshot`, `globalWatermarkS`, `nextEligibleAtMs`, `nextAccountEligibleAtMs`, `scrubLogEntry`, `safeErrorMessage`.
- Barrier/account helpers: `listBarrierJobsAtOrBefore`, `adoptAccountAdvanceForCommand`, `replaceAccountAdvance`, `blockOwnedAccountAdvance`, `parkGlobalBehindPreceding`, `assertAccountDependencyIntegrity`.
- New Task6 Store primitives: `quarantineClaimedRaw`, `retargetOwnedPendingAccountAdvanceForCommand`, and a read-only startup preview helper for expired/surviving RUNNING classification if implemented.

## Production implementation map

Do not copy Markdown fences or prose from the parent plan. Extract only JavaScript between fences and edit via `apply_patch`. `rg '^```' tools/test-scheduler.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js` must find no appended parent fences.

Production copying starts at parent line 13083. Resolve overlaps by method name:

| File | Methods/helpers to implement | Parent source |
|---|---|---|
| `server/scheduler/writer.js` | module prelude, imports, `newWriterMetricState`, constructor, `schedulerError`, queue/admission helpers, metrics ledger, `effectiveNowMs`, `recordEffectiveNowInCurrentUow`, `markDurableMutationInCurrentUow`, lifecycle transitions, heartbeat, poll/reconcile timers, startup/unwind, stop, schedule, cancel, reconcile, wake, continuation queue, budget helpers, `executeClaimedInCurrentUow`, `directAccountOutcomeInCurrentUow`, `advanceAccountInCurrentUow`, `applyClaimed`, `claimFirstBarrierForDrain`, `drainNow`, `settleClaimFailure`, `settleBarriersForAdmission`, `handleLeaseLoss`, `callFaultHook`, command batch, command finalizer, `runCommand`, `advanceTo`, export. | Parent `13083-14594` plus command overlap `14557-14870`; if a method starts before a range and ends inside it, copy the complete method from its start. |
| `server/scheduler/index.js` | `baseSchedulerOptions`, `inRange`, `envRange`, `resolveDurableSchedulerOptions`, cache helpers, `factoryContextKind`, `taoScheduler`, private descriptors, exact exports. | Parent `14870-15249`; exports follow live parent inspection unless fresh authority changes. |
| `server/scheduler/cutover.js` | `runMaintenanceCutover(context)` fresh-only body and export. | Parent `15250-15333` plus V15 cutover overlay. |
| `tools/scheduler-cutover.js` | `parseArgs`, `safeCliCode`, `runCli(argv,deps)`, `main(argv,deps)`, require-main guard, exports. | Task6 CLI prose at parent `15318-15333` plus V15 CLI overlay. |
| `server/scheduler/store.js` | raw quarantine, retarget primitive, startup preview helper, any missing exports required by writer/cutover. | Live Store ABI; preserve accepted Tasks 1-5 behavior. |
| `tools/test-scheduler.js` | overlay9 tests first, parent complete test blocks second, name/manifest helpers. | Parent test blocks `10886-11844`, `11848-12485`, `12490-12833`, `12837-13070`; strip fences. |

## Import/test ordering

Implement in this order:

1. Preflight and PRE inventory.
2. Append overlay9 lazy tests only.
3. Prove/freeze overlay RED evidence exactly once.
4. Create minimal new-module skeleton exports so parent tests can load:
   - `server/scheduler/writer.js`: exports `SchedulerWriter` constructor that validates owner and stubs methods.
   - `server/scheduler/index.js`: exports `taoScheduler`, `inRange`, `resolveDurableSchedulerOptions`.
   - `server/scheduler/cutover.js`: exports `runMaintenanceCutover`.
   - `tools/scheduler-cutover.js`: exports `parseArgs`, `runCli`, `main`.
5. Append faithful parent JS regression blocks, stripped of Markdown fences.
6. Verify exact parent73 runtime registration and expected-name diff.
7. Run full regression RED/GREEN and implementation waves.

---

## Task 1: Preflight, inventory, overlay RED, and expected names

**Files:** `tools/test-scheduler.js` only in this task.

- [ ] **Step 1: PRE inventory before any edit**

```bash
cat > /tmp/task6-v15-inventory.sh <<'SH'
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
        data = open(path, 'rb').read()
        print(path + '\tfile\t' + fs_mode + '\t' + str(len(data)) + '\t' + hashlib.sha256(data).hexdigest() + '\t-\t' + git_mode)
    elif stat.S_ISDIR(st.st_mode):
        print(path + '\tdir\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
    else:
        print(path + '\tother\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
PY
}
SH
sha256sum /tmp/task6-v15-inventory.sh > /tmp/task6-v15-inventory.sh.sha256
. /tmp/task6-v15-inventory.sh
repo_inventory > /tmp/task6-v15-pre-inventory.tsv
sha256sum /tmp/task6-v15-pre-inventory.tsv > /tmp/task6-v15-pre-inventory.tsv.sha256
```

- [ ] **Step 2: Baseline and prefix**

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v15-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v15-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v15-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v15-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v15-baseline.tap
node - <<'NODE' /tmp/task6-v15-baseline.tap > /tmp/task6-v15-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v15-baseline-names.txt > /tmp/task6-v15-baseline-names.txt.sha256
node - <<'NODE' > /tmp/task6-v15-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const path = 'tools/test-scheduler.js';
const marker = '// TASK6_V15_OVERLAY_TESTS_START';
const data = fs.readFileSync(path);
if (data.includes(Buffer.from(marker))) throw new Error('TASK6_V15_MARKER_ALREADY_PRESENT');
console.log([data.length, crypto.createHash('sha256').update(data).digest('hex')].join('\t'));
NODE
```

- [ ] **Step 3: Overlay9 expected names and RED**

Create `/tmp/task6-v15-overlay9-names.txt`:

```bash
cat > /tmp/task6-v15-overlay9-names.txt <<'EOF'
Task 6 v15 remediation Task5 live ABI order replay and arity are exact
Task 6 v15 remediation partial receipt wrapper identity and established zero retention are exact
Task 6 v15 remediation raw malformed payload quarantines without reducer prepare or payload parse
Task 6 v15 remediation status nested metrics validation clone and DB close seams are exact
Task 6 v15 remediation external only same key retarget and unrelated block are exact
Task 6 v15 remediation startup near expiry recovery renews and rebases before ready
Task 6 v15 remediation advance due 61 boundary is partial and does not run closure
Task 6 v15 remediation runMaintenanceCutover fresh only release policy is exact
Task 6 v15 remediation scheduler cutover CLI grammar lifecycle and exports are exact
EOF
wc -l /tmp/task6-v15-overlay9-names.txt | grep -E '^9 '
sort /tmp/task6-v15-overlay9-names.txt | uniq -d > /tmp/task6-v15-overlay9-duplicates.txt
test ! -s /tmp/task6-v15-overlay9-duplicates.txt
sha256sum /tmp/task6-v15-overlay9-names.txt > /tmp/task6-v15-overlay9-names.txt.sha256
```

Append overlay tests after `// TASK6_V15_OVERLAY_TESTS_START`. Every overlay test lazy-imports inside its body and wraps errors with its sentinel.

Freeze overlay RED:

```bash
test ! -e /tmp/task6-v15-red-evidence.tap
: > /tmp/task6-v15-red-evidence.tap
run_overlay_red() {
  name="$1"
  sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v15-overlay-red.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"
    rm -f "$tmp"
    echo "Overlay RED unexpectedly passed: $name" >&2
    exit 1
  fi
  grep -F "# Subtest: $name" "$tmp"
  grep -F "not ok 1 - $name" "$tmp"
  grep -F "$sentinel" "$tmp"
  {
    printf '%s\n' '### TASK6_V15_OVERLAY_RED_CASE_START'
    printf '%s\n' "name=$name"
    printf '%s\n' "sentinel=$sentinel"
    cat "$tmp"
    printf '%s\n' '### TASK6_V15_OVERLAY_RED_CASE_END'
  } >> /tmp/task6-v15-red-evidence.tap
  rm -f "$tmp"
}
```

Run the 9 overlay names in file order with sentinels `TASK6V15_RED_001_TASK5_ABI` through `TASK6V15_RED_009_CLI`, then:

```bash
grep -c '^### TASK6_V15_OVERLAY_RED_CASE_START$' /tmp/task6-v15-red-evidence.tap | grep -E '^9$'
grep -c '^### TASK6_V15_OVERLAY_RED_CASE_END$' /tmp/task6-v15-red-evidence.tap | grep -E '^9$'
sha256sum /tmp/task6-v15-red-evidence.tap > /tmp/task6-v15-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v15-red-evidence.tap.sha256
```

- [ ] **Step 4: Parent73 expected names and complete block import**

Create deterministic parent73 expected names. Its hash is part of Stage-A/B.

```bash
cat > /tmp/task6-v15-parent73-names.txt <<'EOF'
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
wc -l /tmp/task6-v15-parent73-names.txt | grep -E '^73 '
sort /tmp/task6-v15-parent73-names.txt | uniq -d > /tmp/task6-v15-parent73-duplicates.txt
test ! -s /tmp/task6-v15-parent73-duplicates.txt
sha256sum /tmp/task6-v15-parent73-names.txt > /tmp/task6-v15-parent73-names.txt.sha256
```

Copy complete parent test JS blocks, strip Markdown fences/prose, and append after `// TASK6_V15_PARENT_TESTS_START`:

```bash
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
sed -n '10886,11844p' "$parent" > /tmp/task6-v15-parent-block-1.md
sed -n '11848,12485p' "$parent" > /tmp/task6-v15-parent-block-2.md
sed -n '12490,12833p' "$parent" > /tmp/task6-v15-parent-block-3.md
sed -n '12837,13070p' "$parent" > /tmp/task6-v15-parent-block-4.md
sha256sum /tmp/task6-v15-parent-block-*.md > /tmp/task6-v15-parent-blocks.sha256
```

Use `apply_patch` to append only JS code between fences. Verify:

```bash
if rg -n '^```' tools/test-scheduler.js; then exit 1; fi
```

---

## Task 2: Writer status, lifecycle, startup, and admission

**Files:** `server/scheduler/writer.js`, `server/scheduler/store.js`

**Tests:** parent lifecycle/status tests and overlays 4 and 6.

- [ ] **Step 1: Status helper contracts**

Implement explicit helpers in `writer.js`:

- `newWriterMetricState()`
- `strictNonNegativeInteger(value)`
- `strictNonNegativeFiniteNumber(value)`
- `strictPlainObject(value)`
- `cloneMetricsStrict(metrics)`
- `canonicalSchedulerStatus(raw, durableOptions)`
- `cloneSchedulerStatus(status)`
- `computeOpenStatusFromStore(writer)`

Contracts:

- Counts `pending`, `retryWait`, `running`, `quarantined`, and `dueBacklog` must be JavaScript numbers, integers, and `>= 0`. Reject `null`, `''`, booleans, numeric strings, `NaN`, and infinities before coercion.
- Duration `count`, `sum`, and each bucket must be JavaScript numbers, finite, and `>= 0`; bucket arrays are copied with `slice()`.
- Top-level `metrics`, `jobAttempts`, `jobDuration`, `leaseAcquire`, and `reconcile` must be plain objects.
- Deep clone nested `jobAttempts`, `jobDuration`, `jobDuration[*].buckets`, `leaseAcquire`, and `reconcile`.
- `effectiveNowMs = Math.max(writer.lastEffectiveNowMs, writer.clock.nowMs())`.
- Do not read `writer.options`.
- Expired held lease observed by status synchronously calls `transitionLeaseLost`, clears admission/timers, and returns `ready:false`, `state:'standby'`, reason `SCHEDULER_LEASE_LOST`.
- Invalid nested metrics/counts return `ready:false`, reason `SCHEDULER_STATUS_INVALID`; they do not expose raw invalid objects.

- [ ] **Step 2: Operational admission**

Replace parent Task6 temporary admission with parent Task8 quarantine-aware readiness logic from parent around `18594-18607`:

- `assertOperationalAdmission()` calls `status()`.
- If status is not ready, reject before enqueue/DB using `status.reason`.
- Captured stop-tail capability may override only while exact live capability still passes parent stop rules.
- Quarantine threshold and backlog threshold therefore reject `runCommand`, `advanceTo`, `schedule`, `cancel`, and `drainNow` before DB writes.

- [ ] **Step 3: Startup disjoint recovery sets**

Define two disjoint startup sets:

- `expiredRows`: rows that `recoverExpiredRunning` will mutate into `RETRY_WAIT` or `QUARANTINED`. If this set is nonempty, mark durable before calling `recoverExpiredRunning`. These rows are never resumed.
- `survivingOwnedRunningRows`: owned, unexpired RUNNING rows for the current token/generation. Stage only their IDs during startup.

Near-expiry sequence:

1. Acquire token.
2. Record effective.
3. Initialize combat seed.
4. Assert account dependency integrity.
5. Preview `expiredRows`; mark durable if nonempty.
6. Recover expired rows.
7. Stage `survivingOwnedRunningRows`.
8. Fresh effective time.
9. Require `store.renewLease(token, freshNow, leaseMs) === true`.
10. Rebase each surviving row with `resumeOwnedRunning(token, jobId, freshNow, leaseMs)` and assert nonnull.
11. Compute `finalNow`; assert renewed lease expiry and each surviving lock `> finalNow` with nonzero horizon.
12. Final fence, commit, publish only surviving IDs/timers postcommit.

---

## Task 3: Claim, Task5 downstream, commands, cutover, and CLI

**Files:** all six owned files.

- [ ] **Step 1: Retain V14/V13 logic corrections**

Keep these required corrections:

- `partialQueue` contains string IDs and rotates watermark-ineligible partials.
- Global classification handles owned RUNNING, future RETRY_WAIT, QUARANTINED, and foreign RUNNING.
- Hooks run inside claim UoWs for `before-claim` and immediately after commit for `after-claim`.
- Accepted Task5 order lines 825-833 controls mark/barrier/replay/charge/prepare/application/effect/terminal.
- Zero-budget unapplied global never prepares.
- Account partial validates exact wrapper and receipt identity.
- Raw quarantine never parses payload.
- Thenable error is `UNIT_OF_WORK_ASYNC`.
- Account finalizer executes inside owning UoW before final fence, including partial.
- Missing reconciler rejects `SCHEDULER_RECONCILER_UNAVAILABLE` before enqueue/DB.
- Installed reconciler owns Task9 page UoWs; writer does not wrap it.

- [ ] **Step 2: Cutover exact policy**

`runMaintenanceCutover(context)`:

- Context exactly `{kho, clock, ownerId}`.
- No logger and no logger fallback.
- Validate context/owner before migration.
- `apDungMigrationScheduler(kho, clock.nowMs())` before Store.
- `new SchedulerStore(kho, clock)`.
- `context.kho.trongGiaoDich(fn, {immediate:true})`.
- Lease `15000`.
- Reject nonlegacy and nonempty `dq`.
- Acquire lease, seed only `combat_seed_key_v1`, set durable mode, audit `CUTOVER`, return `{mode:'durable', imported:0, recovered:0}`.
- Release same token in `finally`.
- If primary error exists and release throws, preserve primary error and do not log.
- If no primary error and release throws, propagate release error.

- [ ] **Step 3: CLI exact policy**

Implement:

```js
function safeCliCode(error) {
  var codePattern = /^[A-Z][A-Z0-9_]{1,63}$/;
  if (error && typeof error.code === 'string' && codePattern.test(error.code)) return error.code;
  if (error && typeof error.message === 'string' && codePattern.test(error.message)) return error.message;
  return 'SCHEDULER_CUTOVER_FAILED';
}
```

`runCli(argv, deps)`:

- `deps` exactly supports `{openKho, makeOwnerId, clock}`.
- Validate args before open.
- Owner is `assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)())`.
- Clock is `deps.clock || taoClock()`.
- Open precedence: use `deps.openKho(dbPath)` when supplied; otherwise construct default `Kho`.
- Close precedence: if open succeeded and `kho.dong` is a function, call `kho.dong()` in `finally` after success or failure.
- Success returns `{exitCode:0, stdout: JSON.stringify({action:'cutover', mode:'durable', imported:0, recovered:0}) + '\n', stderr:''}`.
- Failure returns `{exitCode:1, stdout:'', stderr: safeCliCode(error) + '\n'}`.
- Never include raw message unless it exactly matches the safe code pattern.
- Exports exactly `{parseArgs, runCli, main}`.
- `main(process.argv.slice(2), {})` in require-main; no `process.exit`.

---

## Task 4: Final verification, seals, report, and reviews

**Files:** exact report artifact plus six owned source/test files.

- [ ] **Step 1: Prefix and names**

Final prefix guard:

```bash
node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [lenText, hash] = fs.readFileSync('/tmp/task6-v15-prefix.tsv', 'utf8').trim().split('\t');
const len = Number(lenText);
const data = fs.readFileSync('tools/test-scheduler.js');
const actual = crypto.createHash('sha256').update(data.subarray(0, len)).digest('hex');
if (actual !== hash) throw new Error('TASK6_PREFIX_CHANGED');
NODE
```

Final TAP/name checks:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v15-final.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v15-final-throw.tap
for f in /tmp/task6-v15-final.tap /tmp/task6-v15-final-throw.tap; do
  grep -E '^# tests 245$' "$f"
  grep -E '^# pass 244$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
sha256sum /tmp/task6-v15-final.tap > /tmp/task6-v15-final.tap.sha256
sha256sum /tmp/task6-v15-final-throw.tap > /tmp/task6-v15-final-throw.tap.sha256
```

Extract final ordered name artifacts and compare them:

```bash
node - <<'NODE' /tmp/task6-v15-final.tap > /tmp/task6-v15-final-parent73-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const actual = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]);
const expected = fs.readFileSync('/tmp/task6-v15-parent73-names.txt', 'utf8').trim().split('\n');
const expectedSet = new Set(expected);
const selected = actual.filter((name) => expectedSet.has(name));
if (selected.length !== 73) throw new Error('PARENT73_FINAL_COUNT_' + selected.length);
for (const name of selected) console.log(name);
NODE
node - <<'NODE' /tmp/task6-v15-final.tap > /tmp/task6-v15-final-overlay9-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (Task 6 v15 remediation .+)$/gm)].map((m) => m[1]);
if (names.length !== 9) throw new Error('OVERLAY9_FINAL_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
node - <<'NODE' /tmp/task6-v15-final.tap > /tmp/task6-v15-final-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const actual = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]);
const parent = new Set(fs.readFileSync('/tmp/task6-v15-parent73-names.txt', 'utf8').trim().split('\n'));
const baseline = actual.filter((name) => !parent.has(name) && !name.startsWith('Task 6 v15 remediation '));
if (baseline.length !== 163) throw new Error('BASELINE_FINAL_COUNT_' + baseline.length);
for (const name of baseline) console.log(name);
NODE
diff -u /tmp/task6-v15-parent73-names.txt /tmp/task6-v15-final-parent73-names.txt
diff -u /tmp/task6-v15-overlay9-names.txt /tmp/task6-v15-final-overlay9-names.txt
diff -u /tmp/task6-v15-baseline-names.txt /tmp/task6-v15-final-baseline-names.txt
sort /tmp/task6-v15-final-parent73-names.txt | uniq -d > /tmp/task6-v15-final-parent73-duplicates.txt
sort /tmp/task6-v15-final-overlay9-names.txt | uniq -d > /tmp/task6-v15-final-overlay9-duplicates.txt
test ! -s /tmp/task6-v15-final-parent73-duplicates.txt
test ! -s /tmp/task6-v15-final-overlay9-duplicates.txt
```

- [ ] **Step 2: Six metadata generator and seal**

```bash
cat > /tmp/task6-v15-six-meta.sh <<'SH'
make_six_meta() {
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
    mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
        raise SystemExit('SIX_FILE_MODE_INVALID ' + path + ' ' + mode)
    git_mode = tracked.get(path, '-')
    if git_mode not in ('-', '100644'):
        raise SystemExit('SIX_TRACKED_MODE_INVALID ' + path + ' ' + git_mode)
    data = open(path, 'rb').read()
    print('\t'.join([path, 'file', mode, git_mode, str(len(data)), hashlib.sha256(data).hexdigest()]))
PY
}
SH
sha256sum /tmp/task6-v15-six-meta.sh > /tmp/task6-v15-six-meta.sh.sha256
. /tmp/task6-v15-six-meta.sh
make_six_meta > /tmp/task6-v15-six-meta.sealed.tsv
sha256sum /tmp/task6-v15-six-meta.sealed.tsv > /tmp/task6-v15-six-meta.sealed.tsv.sha256
```

Stage-A/B must recompute:

```bash
sha256sum -c /tmp/task6-v15-six-meta.sh.sha256
. /tmp/task6-v15-six-meta.sh
make_six_meta > /tmp/task6-v15-six-meta.current.tsv
diff -u /tmp/task6-v15-six-meta.sealed.tsv /tmp/task6-v15-six-meta.current.tsv
```

- [ ] **Step 3: Report before post inventory**

```bash
mkdir -p docs/superpowers/reports
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
: > "$report"
chmod 0755 docs/superpowers/reports
chmod 0644 "$report"
```

Write draft with `inventory_status=PENDING_POST_INVENTORY`, run post inventory, replace exactly with `inventory_status=PASS`, and rerun post inventory before Stage-A. Stage-A rejects `PENDING_POST_INVENTORY`.

- [ ] **Step 4: Stage-A script**

Generate `/tmp/task6-v15-stage-a.sh`:

```bash
cat > /tmp/task6-v15-stage-a.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
sha256sum -c /tmp/task6-v15-approved-plan.sha256
python3 - <<'PY'
import os, stat
path = 'docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v15.md'
st = os.lstat(path)
mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
    raise SystemExit('V15_PLAN_TYPE_MODE_INVALID ' + mode)
PY
sha256sum -c <<'EOF'
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
EOF
sha256sum -c /tmp/task6-v15-inventory.sh.sha256
sha256sum -c /tmp/task6-v15-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v15-parent73-names.txt.sha256
sha256sum -c /tmp/task6-v15-overlay9-names.txt.sha256
sha256sum -c /tmp/task6-v15-baseline-names.txt.sha256
sha256sum -c /tmp/task6-v15-final.tap.sha256
sha256sum -c /tmp/task6-v15-final-throw.tap.sha256
for f in /tmp/task6-v15-final.tap /tmp/task6-v15-final-throw.tap; do
  grep -E '^# tests 245$' "$f"
  grep -E '^# pass 244$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [lenText, hash] = fs.readFileSync('/tmp/task6-v15-prefix.tsv', 'utf8').trim().split('\t');
const data = fs.readFileSync('tools/test-scheduler.js');
const actual = crypto.createHash('sha256').update(data.subarray(0, Number(lenText))).digest('hex');
if (actual !== hash) throw new Error('TASK6_PREFIX_CHANGED');
NODE
diff -u /tmp/task6-v15-parent73-names.txt /tmp/task6-v15-final-parent73-names.txt
diff -u /tmp/task6-v15-overlay9-names.txt /tmp/task6-v15-final-overlay9-names.txt
diff -u /tmp/task6-v15-baseline-names.txt /tmp/task6-v15-final-baseline-names.txt
sha256sum -c /tmp/task6-v15-six-meta.sh.sha256
. /tmp/task6-v15-six-meta.sh
make_six_meta > /tmp/task6-v15-six-meta.stage-a.tsv
diff -u /tmp/task6-v15-six-meta.sealed.tsv /tmp/task6-v15-six-meta.stage-a.tsv
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
test -f "$report"
test ! -L "$report"
python3 - <<'PY' "$report"
import os, stat, sys
checks = [('docs/superpowers/reports', '040755'), (sys.argv[1], '100644')]
for path, expected in checks:
    st = os.lstat(path)
    mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if mode != expected:
        raise SystemExit(path + ' mode ' + mode + ' expected ' + expected)
PY
if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js "$report"; then
  exit 1
fi
! grep -F 'PENDING_POST_INVENTORY' "$report"
grep -F 'inventory_status=PASS' "$report"
grep -F 'parent runtime=73 + overlay=9 => N=82' "$report"
grep -F '245 tests / 244 pass / 0 fail / 1 skipped' "$report"
grep -F "$(cut -d' ' -f1 /tmp/task6-v15-approved-plan.sha256)" "$report"
grep -F "$(cut -d' ' -f1 /tmp/task6-v15-red-evidence.tap.sha256)" "$report"
grep -F "$(cut -d' ' -f1 /tmp/task6-v15-six-meta.sealed.tsv.sha256)" "$report"
. /tmp/task6-v15-inventory.sh
repo_inventory > /tmp/task6-v15-post-inventory.stage-a.tsv
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
pre = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v15-pre-inventory.tsv').read_text().splitlines()}
post = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v15-post-inventory.stage-a.tsv').read_text().splitlines()}
bad = [p for p in sorted(set(pre) | set(post)) if pre.get(p) != post.get(p) and p not in allowed]
if bad:
    raise SystemExit('NON_OWNED_SCOPE_CHANGED\n' + '\n'.join(bad))
PY
SH
chmod +x /tmp/task6-v15-stage-a.sh
/tmp/task6-v15-stage-a.sh
```

- [ ] **Step 5: Reviews and Stage-B**

Launch two genuine fresh collaboration reviewers using `model=gpt-5.6-sol` and `effort=high` over Stage-A artifacts. Actual collaboration tool outcomes are required separately; structured text alone is not proof.

Append approvals only after genuine PASS:

```text
Reviewer 1: identity=<distinct-tool-agent-id-1> model=gpt-5.6-sol effort=high outcome=PASS
Reviewer 2: identity=<distinct-tool-agent-id-2> model=gpt-5.6-sol effort=high outcome=PASS
```

Stage-B:

```bash
/tmp/task6-v15-stage-a.sh
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
python3 - <<'PY' "$report"
import re, sys
text = open(sys.argv[1], encoding='utf8').read()
rows = re.findall(r'^Reviewer [12]: identity=([^ \n]+) model=([^ \n]+) effort=([^ \n]+) outcome=([^ \n]+)$', text, re.M)
if len(rows) != 2:
    raise SystemExit('REVIEWER_LINE_COUNT_INVALID')
ids = [r[0] for r in rows]
if len(set(ids)) != 2:
    raise SystemExit('REVIEWER_IDENTITIES_NOT_DISTINCT')
for identity, model, effort, outcome in rows:
    if model != 'gpt-5.6-sol' or effort != 'high' or outcome != 'PASS':
        raise SystemExit('REVIEWER_LINE_INVALID')
PY
if rg -n '[[:blank:]]+$' "$report"; then exit 1; fi
```

## Self-audit checklist

- [ ] V15 hash approval uses external `TASK6_V15_APPROVED_SHA`; the plan does not embed its own SHA.
- [ ] Store consumption list includes `schedule`, `cancel`, `scrubLogEntry`, and `writeAudit`.
- [ ] PRE inventory is before edits.
- [ ] Production method inventory resolves parent line-range overlap by method name.
- [ ] Import order puts overlay RED before skeletons and parent regressions.
- [ ] Operational admission uses quarantine-aware status.
- [ ] Status validation is strict before coercion and rejects strings/null/booleans.
- [ ] Startup has disjoint expired rows and surviving owned RUNNING rows.
- [ ] Prefix, parent73, overlay9, and baseline name diffs are executable.
- [ ] Six metadata seal is recomputed and diffed in Stage-A/B.
- [ ] Stage-A script validates all required artifacts and rejects report placeholders.
- [ ] Cutover and CLI safe-code policies are exact.
