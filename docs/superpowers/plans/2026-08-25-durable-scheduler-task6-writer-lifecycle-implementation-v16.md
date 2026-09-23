# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V16

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every implementation wave and `superpowers:verification-before-completion` before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark, retry/backoff/quarantine, command MutationGate, fresh cutover, CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** Parent Task6 runtime tests remain authoritative: `73` parent runtime registrations plus `9` remediation overlay registrations gives `N=82` and final scheduler TAP `245/244/0/1`. V16 fixes V15 by restoring full overlay assertion contracts, defining Store primitive ABIs, adding exact writer command/direct-retarget algorithms, sealing parent imported bytes, and making Stage-A/B run fresh tests instead of trusting stale TAP artifacts.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.

## Global constraints

- Preserve V1-V15 plan artifacts. This planning task creates only this V16 file.
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
- Parent regression 73 tests do not require individual RED or sentinels. Some parent cases can already pass. Preserve their runtime names and assertions.
- Only overlay9 tests require isolated one-time RED evidence with lazy imports and unique sentinels.
- Parent Task6, accepted Task5, and live source APIs override every V1-V15 conflict.
- No report self-hash and no embedded V16 self-hash.
- Raw TAP contains `duration_ms`; Stage-A/B seal the fresh normalized TAP hash produced by `normalize_tap_for_hash` below. Raw TAP files are retained as evidence, but raw TAP hashes are not used as equality seals.

## V16 approved-hash pattern

Embedding this V16 file's own SHA inside itself is self-referential and invalid. Use this external approval pattern:

1. Root freezes V16 after authoring and computes the exact 64-hex SHA.
2. Root passes that reviewer-approved hash to the implementer as `TASK6_V16_APPROVED_SHA`.
3. Preflight writes `/tmp/task6-v16-approved-plan.sha256` from the approved value.
4. Preflight, Stage-A, and Stage-B compare the current V16 file to that approved hash.

Executable check:

```bash
test -n "$TASK6_V16_APPROVED_SHA"
case "$TASK6_V16_APPROVED_SHA" in
  (*[!0-9a-f]*|'') echo 'TASK6_V16_APPROVED_SHA must be lowercase sha256' >&2; exit 1 ;;
esac
test "${#TASK6_V16_APPROVED_SHA}" -eq 64
plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v16.md'
test -f "$plan"
test ! -L "$plan"
python3 - <<'PY' "$plan"
import os, stat, sys
st = os.lstat(sys.argv[1])
mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
    raise SystemExit('V16 plan must be real regular 100644')
PY
actual="$(sha256sum "$plan" | awk '{print $1}')"
test "$actual" = "$TASK6_V16_APPROVED_SHA"
printf '%s  %s\n' "$TASK6_V16_APPROVED_SHA" "$plan" > /tmp/task6-v16-approved-plan.sha256
sha256sum -c /tmp/task6-v16-approved-plan.sha256
```

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
```

## Complete Task6 Store consumption list

This is the complete planned Store/API consumption list for Task6. If implementation needs a Store method not listed here, stop and update the implementation report before coding that use.

- Constructor/export helpers: `new SchedulerStore(kho, clock)`, `assertSchedulerOwnerId`, `validateJob`, `normalizeSchedulerErrorCode`, `canonicalJson`, `sha256`, `payloadIntegrity`, `safeErrorMessage`.
- Scheduling/public writes: `schedule`, `cancel`, `markDurableMutation`, `writeAudit`.
- Lease/time: `schedulerMode`, `peekEffectiveNowMs`, `recordEffectiveNowMs`, `acquireLease`, `renewLease`, `releaseLease`, `leaseTokenIsLive`, `assertLiveLease`.
- Claim/read: `claimNext`, `claimForResolution`, `resumeOwnedRunning`, `getById`, `getByIdempotencyKey`, `loadExecutableJob`.
- Application/lifecycle: `hasCommittedApplication`, `insertApplication`, `checkpointPartial`, `completeApplied`, `finishResolved`, `completeAccountAdvanceAndScheduleSuccessor`, `fail`, `recoverExpiredRunning`.
- Status/logging: `statusSnapshot`, `globalWatermarkS`, `nextEligibleAtMs`, `nextAccountEligibleAtMs`, `scrubLogEntry`, `safeErrorMessage`.
- Barrier/account helpers: `listBarrierJobsAtOrBefore`, `adoptAccountAdvanceForCommand`, `replaceAccountAdvance`, `blockOwnedAccountAdvance`, `parkGlobalBehindPreceding`, `assertAccountDependencyIntegrity`.
- Task6-owned new primitives: `quarantineClaimedRaw`, `retargetOwnedPendingAccountAdvanceForCommand`, `validateBlockedAccountAdvanceForDependency`, `listExpiredRunningForRecovery`, `listOwnedRunningForRecovery`.

## New Store primitive contracts

Implement these in `server/scheduler/store.js`. All run inside an existing immediate UoW. All re-check the live lease in SQL. All errors use `fail(code)` or existing `mutationConflict` conventions. No primitive parses payload unless explicitly stated.

### `quarantineClaimedRaw(token, rawRow, failure, nowMs)`

Purpose: terminalize a claimed RUNNING row whose payload cannot be reloaded/branded. This is the only fallback after settlement reload fails with payload integrity.

Exact method signature:

`SchedulerStore.prototype.quarantineClaimedRaw(token, rawRow, failure, nowMs)`

Input contract:

- `token` is the active writer token.
- `rawRow` is a raw `event_jobs` row previously returned from `claimNext`, `claimForResolution`, or `resumeOwnedRunning`.
- Validate only safe lock identity fields: `rawRow.id` via `assertSchedulerJobId`, `rawRow.state === 'RUNNING'`, `rawRow.locked_by === token.ownerId`, `Number(rawRow.locked_generation) === token.generation`, `Number(rawRow.locked_until_ms) > nowMs`.
- Do not read, parse, canonicalize, hash, or validate `payload_json`, `payload_sha256`, `idempotency_key`, `aggregate_id`, or application rows.
- Preserve `attempt`; do not increment it.
- `failure` is scrubbed through `normalizeSchedulerErrorCode` and `safeErrorMessage`.

SQL shape:

```sql
UPDATE event_jobs
SET state='QUARANTINED',
    retry_at_ms=NULL,
    error_code=@code,
    error_message_safe=@safeMessage,
    quarantined_at_ms=@nowMs,
    updated_at_ms=@nowMs,
    locked_by=NULL,
    locked_generation=NULL,
    locked_until_ms=NULL
WHERE id=@id
  AND state='RUNNING'
  AND locked_by=@ownerId
  AND locked_generation=@generation
  AND locked_until_ms>@nowMs
  AND EXISTS (
    SELECT 1 FROM scheduler_lease
    WHERE lease_name='global-writer'
      AND owner_id=@ownerId
      AND generation=@generation
      AND expires_at_ms>@nowMs
  )
RETURNING id,state,attempt,error_code,quarantined_at_ms
```

Result and errors:

- Return the returned row with `state === 'QUARANTINED'`.
- If no row changes and `leaseTokenIsLive(token, nowMs)` is false, throw `LEASE_LOST`.
- If no row changes while the lease is still live, throw `RAW_QUARANTINE_CONFLICT`.
- If `rawRow` lock identity is invalid before SQL, throw `RAW_QUARANTINE_INVALID`.

### `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)`

Purpose: when normal `World` save creates a same-key local wake after a command discovers an external dependency, retarget that exact same-key unblocked PENDING wake to the dependency time so the writer can adopt and block it. This preserves row id, idempotency key, sequence, and attempt.

Exact method signature:

`SchedulerStore.prototype.retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)`

Input contract:

- `accountId`, `revision`, `targetS`, and `nowMs` are safe integers; `accountId >= 1`, `revision >= 0`, `targetS >= 0`.
- Idempotency key is exactly `'account-advance:' + accountId + ':' + revision`.
- First query by that exact key. If absent, return `null`.
- If a matching-key row exists, validate payload and persisted identity before state checks:
  - `parseCanonicalBoundedJson(row.payload_json, row.payload_sha256)`
  - `validateJob(executableInput(row, payload))`
  - validated kind `ACCOUNT_ADVANCE`, aggregate type `account`, aggregate id `String(accountId)`, expected revision `revision`, priority `100`, maxAttempts preserved.
  - Any mismatch maps to `PAYLOAD_INTEGRITY`.
- After successful validation, conflicting states map to `ACCOUNT_ADVANCE_RETARGET_CONFLICT`: `RUNNING`, `COMPLETED`, `CANCELLED`, `QUARANTINED`, `RETRY_WAIT`, or any non-null `blocked_by_job_id`.
- Only unblocked `PENDING` rows are retargeted.

Pseudocode:

```js
var key = 'account-advance:' + accountId + ':' + revision;
this.assertLiveLease(token, nowMs);
var row = this.db.prepare('SELECT * FROM event_jobs WHERE idempotency_key=?').get(key);
if (!row) return null;
var payload;
try {
  payload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
  validateJob(executableInput(row, payload));
} catch (error) {
  throw payloadIntegrity();
}
if (row.kind !== 'ACCOUNT_ADVANCE' || row.aggregate_type !== 'account' ||
    row.aggregate_id !== String(accountId) || Number(row.expected_revision) !== revision ||
    row.blocked_by_job_id !== null || row.state !== 'PENDING') {
  fail('ACCOUNT_ADVANCE_RETARGET_CONFLICT');
}
var nextPayload = {schemaVersion: 1, accountId: accountId, nextLocalAtS: targetS};
var payloadJson = canonicalJson(nextPayload);
var payloadHash = sha256(payloadJson);
var changed = this.db.prepare(
  "UPDATE event_jobs SET scheduled_at_s=?,payload_json=?,payload_sha256=?,updated_at_ms=? " +
  "WHERE id=? AND state='PENDING' AND blocked_by_job_id IS NULL " +
  "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
  "AND owner_id=? AND generation=? AND expires_at_ms>?) RETURNING *"
).get(targetS, payloadJson, payloadHash, nowMs, row.id,
  token.ownerId, token.generation, nowMs);
if (!changed && !this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
if (!changed) fail('ACCOUNT_ADVANCE_RETARGET_CONFLICT');
return changed;
```

Regression expectations:

- Absent same key, including wrong supplied account/revision, returns `null`; writer then uses supported create fallback.
- Matching-key payload/canonical contradiction maps `PAYLOAD_INTEGRITY`.
- RUNNING, blocked, terminal, or retry-wait matching-key rows map `ACCOUNT_ADVANCE_RETARGET_CONFLICT`.
- Idempotent repeat with already retargeted same key returns the same row after validating canonical payload.

### `validateBlockedAccountAdvanceForDependency(token, accountId, revision, dependencyJobId, targetS, nowMs)`

Purpose: validate `replaceAccountAdvance` early-return rows before writer treats an existing blocked row as the command dependency continuation.

Exact method signature:

`SchedulerStore.prototype.validateBlockedAccountAdvanceForDependency(token, accountId, revision, dependencyJobId, targetS, nowMs)`

Contract:

- Validate the live lease.
- Validate `dependencyJobId` via `assertSchedulerJobId`.
- Query the exact account/revision key and `blocked_by_job_id`.
- Validate payload using `parseCanonicalBoundedJson` and `validateJob`.
- Require row state `PENDING`, kind `ACCOUNT_ADVANCE`, aggregate id `String(accountId)`, expected revision `revision`, `checkpoint_revision === revision`, and `scheduled_at_s <= targetS`.
- Require dependency row exists with id `dependencyJobId`, kind `PVP_RESOLVE` or `EXTERNAL_RESOLVE`, `replay_of_job_id IS NULL`, `source_account_id === accountId`, state in `PENDING`, `RUNNING`, `RETRY_WAIT`, or `QUARANTINED`, and `scheduled_at_s >= row.scheduled_at_s`.
- Return `{job: loadExecutableJob(token, row, nowMs), preExistingBlocked: true}`.
- If no blocked row exists for the key, return `null`.
- If a blocked row exists but any identity/dependency check fails, throw `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`.
- If lease is lost during validation, throw `LEASE_LOST`.

### `listExpiredRunningForRecovery(token, nowMs)` and `listOwnedRunningForRecovery(token, nowMs)`

Purpose: startup must separate rows that recovery will mutate from rows the same generation can resume.

Exact method signatures:

- `SchedulerStore.prototype.listExpiredRunningForRecovery(token, nowMs)`
- `SchedulerStore.prototype.listOwnedRunningForRecovery(token, nowMs)`

`listExpiredRunningForRecovery` returns raw rows ordered by `scheduled_at_s,priority,sequence,id` where:

```sql
state='RUNNING'
AND (
  locked_generation < @generation
  OR (locked_generation=@generation AND locked_by=@ownerId AND locked_until_ms<=@nowMs)
)
```

`listOwnedRunningForRecovery` returns raw rows ordered by `scheduled_at_s,priority,sequence,id` where:

```sql
state='RUNNING'
AND locked_by=@ownerId
AND locked_generation=@generation
AND locked_until_ms>@nowMs
AND blocked_by_job_id IS NULL
```

The two sets must be disjoint by id. Both functions assert the live lease. Neither function parses payload. Startup marks durable before `recoverExpiredRunning` only when the expired list is nonempty. Startup resumes only the surviving owned list after a fresh lease renewal and lock rebase.

## Production implementation map

Do not copy Markdown fences or prose from the parent plan. Extract only JavaScript between fences and edit via `apply_patch`. `rg '^```' tools/test-scheduler.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js` must find no appended parent fences.

Production copying starts at parent line `13083`. Resolve overlaps by complete method name:

| File | Methods/helpers to implement | Parent source |
|---|---|---|
| `server/scheduler/writer.js` | module prelude, imports, `newWriterMetricState`, `SchedulerWriter` constructor, `SchedulerWriter.prototype.status`, status cache helpers, `log`, `schedulerError`, queue/admission helpers, metrics ledger, `effectiveNowMs`, `recordEffectiveNowInCurrentUow`, `markDurableMutationInCurrentUow`, lifecycle transitions, heartbeat, poll/reconcile timers, `clearMutationTimers`, `clearPollTimer`, `clearGraceTimer`, `clearAllTimers`, startup/unwind, `start`, `beginStop`, `stop`, `schedule`, `cancel`, `reconcile`, wake, `enqueuePartial`, `enqueueCommittedPartial`, `enqueueBudgetContinuationIfDue`, `takeNextJob`, `claimFirstBarrierForDrain`, `drainNow`, `executeClaimedInCurrentUow`, `directAccountOutcomeInCurrentUow`, `ensureEstablishedZeroDirectContinuation`, `ensureExternalBlockedDirectContinuation`, `advanceAccountInCurrentUow`, `advanceDueInCurrentUow`, `withCommandWorldBatchInCurrentUow`, `applyClaimed`, `finishPreparedOrPartial`, `settleClaimFailure`, `settleBarriersForAdmission`, `handleLeaseLoss`, `transitionStorageFatal`, `handlePublicFailure`, `callFaultHook`, command validation, command finalizer, `runCommand`, `advanceTo`, export. | Parent `13083-14594` plus command overlap `14557-14870`; if a method starts before a range and ends inside it, copy the complete method from its start. |
| `server/scheduler/index.js` | `baseSchedulerOptions`, `inRange`, `envRange`, `resolveDurableSchedulerOptions`, cache helpers, `factoryContextKind`, `taoScheduler`, private non-enumerable descriptors, exact exports. | Parent `14870-15249`; public production export keys are `baseSchedulerOptions`, `resolveDurableSchedulerOptions`, `taoScheduler`. Test-only/direct extra keys follow parent and are non-production. |
| `server/scheduler/cutover.js` | `runMaintenanceCutover(context)` fresh-only body and export. | Parent `15250-15333` plus V16 cutover overlay below. |
| `tools/scheduler-cutover.js` | `parseArgs`, `safeCliCode`, `runCli(argv,deps)`, `main(argv,deps,io)`, require-main guard, exports. | V16 CLI contract below. |
| `server/scheduler/store.js` | raw quarantine, retarget primitive, blocked-dependency validator, recovery list helpers, any missing exports required by writer/cutover. | Live Store ABI; preserve accepted Tasks 1-5 behavior. |
| `tools/test-scheduler.js` | overlay9 tests first, parent complete test blocks second, name/manifest helpers. | Parent test blocks `10886-11844`, `11848-12485`, `12490-12833`, `12837-13070`; strip fences. |

## Task 1: Preflight, overlay RED, skeletons, parent import, and seals

**Files:**

- Modify: `tools/test-scheduler.js`
- Create or modify after overlay RED only: `server/scheduler/writer.js`, `server/scheduler/index.js`, `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`
- Temp artifacts: `/tmp/task6-v16-*`

**Interfaces:**

- Produces baseline/prefix/name seals, overlay RED evidence, skeleton module exports, and parent imported test byte slice seal.

- [ ] **Step 1: Capture normalized PRE inventory before any test/source/report edit**

```bash
cat > /tmp/task6-v16-inventory.sh <<'SH'
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
sha256sum /tmp/task6-v16-inventory.sh > /tmp/task6-v16-inventory.sh.sha256
. /tmp/task6-v16-inventory.sh
repo_inventory > /tmp/task6-v16-pre-inventory.tsv
sha256sum /tmp/task6-v16-pre-inventory.tsv > /tmp/task6-v16-pre-inventory.tsv.sha256
```

- [ ] **Step 2: Capture baseline, prefix bytes, and TAP normalizer**

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v16-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v16-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v16-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v16-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v16-baseline.tap
node - <<'NODE' /tmp/task6-v16-baseline.tap > /tmp/task6-v16-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v16-baseline-names.txt > /tmp/task6-v16-baseline-names.txt.sha256
node - <<'NODE' > /tmp/task6-v16-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const path = 'tools/test-scheduler.js';
const marker = '// TASK6_V16_OVERLAY_TESTS_START';
const data = fs.readFileSync(path);
if (data.includes(Buffer.from(marker))) throw new Error('TASK6_V16_MARKER_ALREADY_PRESENT');
console.log([data.length, crypto.createHash('sha256').update(data).digest('hex')].join('\t'));
NODE
cat > /tmp/task6-v16-tap-normalize.sh <<'SH'
normalize_tap_for_hash() {
  sed -E '/^[[:space:]]+duration_ms: /d' "$1"
}
SH
sha256sum /tmp/task6-v16-tap-normalize.sh > /tmp/task6-v16-tap-normalize.sh.sha256
```

- [ ] **Step 3: Append overlay9 lazy tests**

Append tests between explicit markers:

```js
// TASK6_V16_OVERLAY_TESTS_START
// TASK6_V16_OVERLAY_TESTS_END
```

Each overlay test:

- Uses the exact runtime name below.
- Lazy-requires new modules inside the test body.
- Wraps any failure with the exact sentinel string so isolated RED evidence proves the correct test failed.
- Contains real fixtures and assertions listed below. A sentinel-only throw does not satisfy the overlay contract.

Overlay names and sentinels:

| # | Runtime test name | Sentinel |
|---:|---|---|
| 1 | `Task 6 v16 remediation Task5 live ABI order replay and arity are exact` | `TASK6V16_RED_001_TASK5_ABI` |
| 2 | `Task 6 v16 remediation partial receipt wrapper identity and established zero retention are exact` | `TASK6V16_RED_002_PARTIAL_RECEIPT` |
| 3 | `Task 6 v16 remediation raw malformed payload quarantines without reducer prepare or payload parse` | `TASK6V16_RED_003_RAW_QUARANTINE` |
| 4 | `Task 6 v16 remediation status nested metrics validation clone and DB close seams are exact` | `TASK6V16_RED_004_STATUS_DB_CLOSE` |
| 5 | `Task 6 v16 remediation external only same key retarget and unrelated block are exact` | `TASK6V16_RED_005_RETARGET` |
| 6 | `Task 6 v16 remediation startup near expiry recovery renews and rebases before ready` | `TASK6V16_RED_006_STARTUP_REBASE` |
| 7 | `Task 6 v16 remediation advance due 61 boundary is partial and does not run closure` | `TASK6V16_RED_007_DUE_61` |
| 8 | `Task 6 v16 remediation runMaintenanceCutover fresh only release policy is exact` | `TASK6V16_RED_008_CUTOVER` |
| 9 | `Task 6 v16 remediation scheduler cutover CLI grammar lifecycle and exports are exact` | `TASK6V16_RED_009_CLI` |

Detailed overlay assertion contracts:

1. **Task5 live ABI/order/replay/arity**
   - Assert `EventReducer.prototype.prepare.length === 3` and `EventReducer.prototype.applyPrepared.length === 2`.
   - Spy on `store.markDurableMutation`, `advanceService.advanceBarrier`, `store.hasCommittedApplication`, `reducer.prepare`, `store.insertApplication`, `reducer.applyPrepared`, `store.completeApplied`, and `store.finishResolved`.
   - Execute a global claimed job and assert order: `markDurableMutation` before `advanceBarrier`; `advanceBarrier` before replay check; replay check before `prepare`; `prepare` before `insertApplication`; `insertApplication` before `applyPrepared`; final Store terminal method after effect.
   - Seed a committed application for the same job and assert replay validates the existing application, skips `prepare` and `applyPrepared`, then completes according to the accepted Task5 terminal mapping.
   - Force zero-budget unapplied global and assert writer returns partial before `reducer.prepare` is invoked.
   - Assert live `advanceService.advanceBarrier` already parks preceding roots and writer does not call `store.parkGlobalBehindPreceding` again.

2. **Partial receipt wrapper and established-zero retention**
   - Use an account job whose reducer `prepare` returns `{kind:'partial', advanceResult, saveReceipt, nextLocalAtS}`.
   - Assert the effect returned from `reducer.applyPrepared(mutation, prepared)` has `Object.getPrototypeOf(effect) === Object.prototype`.
   - Assert exactly two own enumerable string keys in order: `['checkpointRevision', 'saveReceipt']`.
   - Assert `Reflect.ownKeys(effect).length === 2`; no symbols and no non-enumerable extras.
   - Assert `effect.saveReceipt === prepared.saveReceipt` and `prepared.saveReceipt === prepared.advanceResult.saveReceipt`.
   - Assert `checkpointPartial(token, executable, receipt.revision, nowMs)` is used for partial.
   - For established-zero account advance, assert RUNNING lock fields remain byte-identical and the job is retained for restart rather than completed or cancelled.

3. **Raw malformed payload quarantine**
   - Claim a job into RUNNING, then corrupt `payload_json` or `payload_sha256`.
   - Install a reducer spy that would fail the test if `prepare` is called.
   - Cause settlement reload to fail with `PAYLOAD_INTEGRITY`.
   - Assert `quarantineClaimedRaw(token, rawRow, failure, nowMs)` updates the raw RUNNING row to `QUARANTINED` without parsing payload bytes.
   - Assert `attempt` is preserved, lock fields are cleared, `error_code` is scrubbed, and no application row is inserted.

4. **Status metrics, DB-close cache, and private seams**
   - Force invalid nested metrics: numeric strings, `null`, booleans, `NaN`, `Infinity`, negative counts, and invalid bucket arrays.
   - Assert `SchedulerWriter.prototype.status()` returns `ready:false`, `reason:'SCHEDULER_STATUS_INVALID'`, and never exposes the invalid object by reference.
   - Assert valid status deep clones `jobAttempts`, `jobDuration`, bucket arrays, `leaseAcquire`, and `reconcile`; mutating the returned status does not mutate the writer.
   - Assert `effectiveNowMs` in status is `Math.max(lastEffectiveNowMs, clock.nowMs())`.
   - Expire the held lease before status and assert status synchronously transitions to standby with `reason:'SCHEDULER_LEASE_LOST'`, clears mutation timers, and retains exactly one standby poll.
   - Call `_datDatabaseClosing()` and assert it captures a final safe status before `dbOpen=false`; after close, `status()` returns cached clone only with `ready:false`, `dbOpen:false`, `reason:'SCHEDULER_DB_CLOSED'`, and performs no SQLite read.
   - Assert private descriptors `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing` are non-enumerable; `_datSignalHandlerInstalled` is a function.

5. **External-only same-key retarget and unrelated block**
   - Use real `World` save so normal save receipt is non-null and creates or leaves a same-key account wake.
   - Simulate `deferredExternal` with `blockedExternalJobId`.
   - If a same-key unblocked PENDING wake exists later than dependency T, assert `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, dependencyT, nowMs)` retargets that row, preserves id/sequence/attempt/idempotency key, regenerates canonical payload and hash, then writer adopts and blocks it.
   - If no same-key wake exists, assert writer calls `replaceAccountAdvance(token, accountId, revision, dependencyT, nowMs)` once and validates any returned row.
   - If `replaceAccountAdvance` early-returns an already blocked row, assert `validateBlockedAccountAdvanceForDependency` must prove the exact same dependency before writer treats it as success.
   - Seed unrelated block A while command discovers dependency B; assert writer returns or throws `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`, does not synthesize success, and records no job metric for B.
   - Assert public `advanceTo` and `runCommand` returned partial/deferred object includes `deferredExternal:true`, `blockedExternalJobId`, and continuation scheduling for null job id.
   - Assert helper methods do not call `mutation.recordJob`; finalizer records exactly once.

6. **Startup near-expiry recovery**
   - Seed one expired RUNNING row and one same-owner unexpired RUNNING row whose lock is near expiry.
   - Assert `listExpiredRunningForRecovery` and `listOwnedRunningForRecovery` are disjoint.
   - Assert durable marker is written before `recoverExpiredRunning` when expired rows exist.
   - Assert expired rows become `RETRY_WAIT` or `QUARANTINED` and are never resumed.
   - Assert writer obtains fresh effective time, requires `renewLease(token, freshNow, leaseMs) === true`, then calls `resumeOwnedRunning(token, jobId, freshNow, leaseMs)` for surviving ids.
   - Advance the fake clock to `leaseMs - 1` before renewal and `+2ms` after final fence; assert renewed lease expiry and every resumed row lock remain `> finalNow`.
   - Assert timers/partial queues publish only after startup commit.

7. **Advance-due 61 boundary**
   - Seed 61 due accounts with deterministic ids/order.
   - Run `runCommand({name:'advance-due', run})` with a closure that increments a counter.
   - Assert writer queries `kho.q.dqDenHan.all(nowS, 61)`, processes only the first 60 in stable order, returns `{deferred:true, code:'TICK_PARTIAL'}`, and closure count remains `0`.
   - Assert returned internal summary has `partial:true`, `hasMoreDue:true`, `partialJobId:null`, `processed` equal to the number of committed account advances, and enqueues exactly one continuation after commit.
   - Assert manualDrain mode does not arm an implicit continuation.

8. **Fresh-only cutover**
   - Context is exactly `{kho, clock, ownerId}`.
   - Validate context and owner before Store construction that can access scheduler tables.
   - Assert migration runs before `new SchedulerStore(kho, clock)`.
   - Assert all cutover writes run inside `context.kho.trongGiaoDich(fn,{immediate:true})`.
   - Assert lease duration is `15000`.
   - Reject nonlegacy mode with `SCHEDULER_CUTOVER_ALREADY_DURABLE`.
   - Reject any nonempty `dq` row with `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`.
   - Seed only `combat_seed_key_v1`, set durable mode, write audit action `CUTOVER`, return `{mode:'durable', imported:0, recovered:0}`.
   - Release the same token in `finally`.
   - If primary cutover error exists and release also fails, rethrow the primary error and perform no logging.
   - If no primary error exists and release fails, throw the release error.

9. **CLI grammar/lifecycle/exports**
   - `parseArgs(argv)` accepts exactly four tokens in this exact order: `--db`, `<nonempty path>`, `--action`, `cutover`.
   - Reject duplicates, unknown flags, missing values, extra tokens, empty db path, and existing directory path before opening.
   - `runCli(argv,deps)` supports deps exactly `{openKho, makeOwnerId, clock}`.
   - Validate args before open.
   - Owner is `assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)())`.
   - Clock is `deps.clock || taoClock()`.
   - On success, close with `kho.dong()` in `finally` and return `{exitCode:0, stdout: JSON.stringify({action:'cutover', mode:'durable', imported:0, recovered:0}) + '\n', stderr:''}`.
   - On primary failure, preserve primary error even if close fails.
   - If close fails and there was no primary error, return failure for the close error.
   - `safeCliCode` uses `error.code` only if `/^[A-Z][A-Z0-9_]{1,63}$/`, else `error.message` only if the same pattern matches, else `SCHEDULER_CUTOVER_FAILED`; stderr is `${code}\n` and never raw unsafe message.
   - Exports exactly `{parseArgs, runCli, main}`.
   - `main(argv,deps,io)` writes returned stdout/stderr to injected streams or process streams, sets `process.exitCode`, returns the result, and never calls `process.exit`.
   - Require-main guard calls `main(process.argv.slice(2), {}, {stdout:process.stdout, stderr:process.stderr})`.

- [ ] **Step 4: Create overlay names and freeze isolated RED evidence**

```bash
cat > /tmp/task6-v16-overlay9-names.txt <<'EOF'
Task 6 v16 remediation Task5 live ABI order replay and arity are exact
Task 6 v16 remediation partial receipt wrapper identity and established zero retention are exact
Task 6 v16 remediation raw malformed payload quarantines without reducer prepare or payload parse
Task 6 v16 remediation status nested metrics validation clone and DB close seams are exact
Task 6 v16 remediation external only same key retarget and unrelated block are exact
Task 6 v16 remediation startup near expiry recovery renews and rebases before ready
Task 6 v16 remediation advance due 61 boundary is partial and does not run closure
Task 6 v16 remediation runMaintenanceCutover fresh only release policy is exact
Task 6 v16 remediation scheduler cutover CLI grammar lifecycle and exports are exact
EOF
wc -l /tmp/task6-v16-overlay9-names.txt | grep -E '^9 '
sort /tmp/task6-v16-overlay9-names.txt | uniq -d > /tmp/task6-v16-overlay9-duplicates.txt
test ! -s /tmp/task6-v16-overlay9-duplicates.txt
sha256sum /tmp/task6-v16-overlay9-names.txt > /tmp/task6-v16-overlay9-names.txt.sha256
```

RED helper and exact invocation order:

```bash
test ! -e /tmp/task6-v16-red-evidence.tap
: > /tmp/task6-v16-red-evidence.tap
run_one_overlay_red() {
  name="$1"
  sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v16-overlay-red.XXXXXX.tap)"
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
    printf '%s\n' '### TASK6_V16_OVERLAY_RED_CASE_START'
    printf '%s\n' "name=$name"
    printf '%s\n' "sentinel=$sentinel"
    cat "$tmp"
    printf '%s\n' '### TASK6_V16_OVERLAY_RED_CASE_END'
  } >> /tmp/task6-v16-red-evidence.tap
  rm -f "$tmp"
}
run_one_overlay_red 'Task 6 v16 remediation Task5 live ABI order replay and arity are exact' 'TASK6V16_RED_001_TASK5_ABI'
run_one_overlay_red 'Task 6 v16 remediation partial receipt wrapper identity and established zero retention are exact' 'TASK6V16_RED_002_PARTIAL_RECEIPT'
run_one_overlay_red 'Task 6 v16 remediation raw malformed payload quarantines without reducer prepare or payload parse' 'TASK6V16_RED_003_RAW_QUARANTINE'
run_one_overlay_red 'Task 6 v16 remediation status nested metrics validation clone and DB close seams are exact' 'TASK6V16_RED_004_STATUS_DB_CLOSE'
run_one_overlay_red 'Task 6 v16 remediation external only same key retarget and unrelated block are exact' 'TASK6V16_RED_005_RETARGET'
run_one_overlay_red 'Task 6 v16 remediation startup near expiry recovery renews and rebases before ready' 'TASK6V16_RED_006_STARTUP_REBASE'
run_one_overlay_red 'Task 6 v16 remediation advance due 61 boundary is partial and does not run closure' 'TASK6V16_RED_007_DUE_61'
run_one_overlay_red 'Task 6 v16 remediation runMaintenanceCutover fresh only release policy is exact' 'TASK6V16_RED_008_CUTOVER'
run_one_overlay_red 'Task 6 v16 remediation scheduler cutover CLI grammar lifecycle and exports are exact' 'TASK6V16_RED_009_CLI'
grep -c '^### TASK6_V16_OVERLAY_RED_CASE_START$' /tmp/task6-v16-red-evidence.tap | grep -E '^9$'
grep -c '^### TASK6_V16_OVERLAY_RED_CASE_END$' /tmp/task6-v16-red-evidence.tap | grep -E '^9$'
sha256sum /tmp/task6-v16-red-evidence.tap > /tmp/task6-v16-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v16-red-evidence.tap.sha256
```

- [ ] **Step 5: Add minimal skeletons after overlay RED and before parent import**

Use `apply_patch` only. Scope is exactly these files:

- `server/scheduler/writer.js`
- `server/scheduler/index.js`
- `server/scheduler/cutover.js`
- `tools/scheduler-cutover.js`

Skeleton requirements:

- `writer.js` exports `{SchedulerWriter}`. Constructor validates owner UUID through live Store helper and installs `status`, `start`, `stop`, `schedule`, `cancel`, `reconcile`, `runCommand`, and `advanceTo` methods that throw named Task6 missing-implementation errors.
- `index.js` exports `baseSchedulerOptions`, `resolveDurableSchedulerOptions`, and `taoScheduler`; `taoScheduler` returns a bridge object with the public surfaces needed for parent imports.
- `cutover.js` exports `{runMaintenanceCutover}`.
- `tools/scheduler-cutover.js` exports `{parseArgs, runCli, main}`.
- Do not implement behavior in skeletons beyond exports and input validation needed for parent test registration. The goal is to let parent top-level `require` register tests after overlay RED.

- [ ] **Step 6: Parent73 expected names and parent block seals**

Create deterministic expected names:

```bash
cat > /tmp/task6-v16-parent73-names.txt <<'EOF'
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
wc -l /tmp/task6-v16-parent73-names.txt | grep -E '^73 '
sort /tmp/task6-v16-parent73-names.txt | uniq -d > /tmp/task6-v16-parent73-duplicates.txt
test ! -s /tmp/task6-v16-parent73-duplicates.txt
sha256sum /tmp/task6-v16-parent73-names.txt > /tmp/task6-v16-parent73-names.txt.sha256
```

Extract parent block source and seal it:

```bash
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
sed -n '10886,11844p' "$parent" > /tmp/task6-v16-parent-block-1.md
sed -n '11848,12485p' "$parent" > /tmp/task6-v16-parent-block-2.md
sed -n '12490,12833p' "$parent" > /tmp/task6-v16-parent-block-3.md
sed -n '12837,13070p' "$parent" > /tmp/task6-v16-parent-block-4.md
sha256sum /tmp/task6-v16-parent-block-*.md > /tmp/task6-v16-parent-blocks.sha256
```

Append complete JS parent block content between explicit markers:

```js
// TASK6_V16_PARENT_TESTS_START
// copied JS only, no Markdown fences
// TASK6_V16_PARENT_TESTS_END
```

Allowed adaptations are limited to import paths, marker comments, and V16 overlay prefix isolation. After appending, seal the current byte slice:

```bash
node - <<'NODE' > /tmp/task6-v16-current-parent-slice.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V16_PARENT_TESTS_START\n';
const end = '// TASK6_V16_PARENT_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_PARENT_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
test -s /tmp/task6-v16-current-parent-slice.js
sha256sum /tmp/task6-v16-current-parent-slice.js > /tmp/task6-v16-current-parent-slice.js.sha256
if rg -n '^```' tools/test-scheduler.js; then exit 1; fi
```

## Task 2: Writer status, lifecycle, startup, and admission

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Test: `tools/test-scheduler.js`

**Interfaces:**

- Produces `SchedulerWriter.prototype.status`, startup recovery, timer lifecycle, admission gate, DB-close cache, and private Task7 seams.

- [ ] **Step 1: Implement status helpers and status method**

Implement these exact internal helper names in `writer.js`; do not import a `metrics.js` module:

- `computeOpenStatusFromStore(writer)`
- `canonicalSchedulerStatus(raw, durableOptions)`
- `cloneSchedulerStatus(status)`

`SchedulerWriter.prototype.status` contract:

- If `dbOpen === false`, return `cloneSchedulerStatus(this.closedStatusCache)`. It must not call SQLite, Store, clock, logger, reducer, advance service, or world.
- `_datDatabaseClosing()` computes and stores `closedStatusCache` before setting `dbOpen=false`. The cached status must include `ready:false`, `dbOpen:false`, `state` unchanged or `stopped`, `reason:'SCHEDULER_DB_CLOSED'`.
- If open and a held lease exists but `store.leaseTokenIsLive(this.leaseToken, effectiveNowMs())` is false, synchronously call `transitionLeaseLost`, then return standby status with `ready:false`, `reason:'SCHEDULER_LEASE_LOST'`.
- Strict validation occurs before normalization:
  - Top-level Store snapshot must be a plain object.
  - Counts `pending`, `retryWait`, `running`, `quarantined`, `dueBacklog` must be JavaScript numbers, safe integers, and `>=0`.
  - Reject `null`, `''`, booleans, numeric strings, `NaN`, `Infinity`, and negative values.
  - `oldestDueAgeMs` must be finite number `>=0`.
  - `nextEligibleAtMs` may be `null` or finite number `>=0`.
  - `metrics`, `jobAttempts`, `jobDuration`, `leaseAcquire`, and `reconcile` must be plain objects.
  - Every `jobDuration[key]` must be a plain object with `count`, `sum`, and `buckets`; buckets must be an array of finite numbers and must be cloned.
- Invalid status data returns a safe status with `ready:false`, `reason:'SCHEDULER_STATUS_INVALID'`; it must not expose raw invalid objects.
- `effectiveNowMs` in status is `Math.max(writer.lastEffectiveNowMs, writer.clock.nowMs())`.
- Do not read `writer.options`.
- Deep clone nested `jobAttempts`, `jobDuration`, `jobDuration[*].buckets`, `leaseAcquire`, and `reconcile`.
- Public status keys are exactly the parent schema keys: ready/state/reason/dbOpen/mode/watermarkS counts/ages/next eligible plus nested `metrics` with `jobAttempts`, `jobDuration`, `leaseAcquire`, `reconcile`, `advanceProcessed`, `advanceBudgetExhaustedTotal`, and `lastSuccessfulDrainTimestampMs`.

- [ ] **Step 2: Timer lifecycle**

Implement exact methods `clearMutationTimers`, `clearPollTimer`, `clearGraceTimer`, and `clearAllTimers`. `clearAllTimers` calls `clearMutationTimers`, `clearPollTimer`, and `clearGraceTimer` in that order.

Contracts:

- `clearMutationTimers` clears heartbeat, wake/continuation, immediate continuation, and reconcile timers; it does not clear the standby poll.
- Lease loss alone calls `clearMutationTimers()` and then ensures exactly one standby acquisition poll if the writer is open, not stopping, not stopped, and not manual.
- Fatal storage, crashed, `_beginStop`, `beginStop`, `stop`, and `_datDatabaseClosing` call `clearAllTimers()`.
- Stop clears grace and all timers and prevents timer resurrection in `finally` blocks.

- [ ] **Step 3: Startup recovery**

Startup sequence:

1. Enter serialized `start()` tail.
2. If mode is legacy, set health-visible legacy status and return.
3. Immediate UoW acquires lease with `acquireLease(ownerId, candidateNow, leaseMs)`.
4. `recordEffectiveNowInCurrentUow(token, candidateNow)`.
5. `reducer.initializeCombatSeed(token, effective)`.
6. `store.assertAccountDependencyIntegrity(token, effective)`.
7. `expiredRows = store.listExpiredRunningForRecovery(token, effective)`.
8. `survivors = store.listOwnedRunningForRecovery(token, effective)`.
9. Assert disjoint id sets.
10. If `expiredRows.length > 0`, call `store.markDurableMutation(token, effective)` before `store.recoverExpiredRunning(token, effective, policy)`.
11. Expired rows are never resumed.
12. Obtain `freshNow = recordEffectiveNowInCurrentUow(token, effectiveNowMs())`.
13. Require `store.renewLease(token, freshNow, leaseMs) === true`.
14. For each survivor id, call `store.resumeOwnedRunning(token, id, freshNow, leaseMs)` and assert non-null.
15. Compute `finalNow = recordEffectiveNowInCurrentUow(token, effectiveNowMs())`.
16. Final fence asserts live lease and every survivor lock `> finalNow`.
17. Commit, set ready, publish survivor partial queue and timers after commit only.

Startup unwind:

- On acquisition/seed/dependency/recovery failure, clear all timers, clear state, release the token only if acquisition transaction committed, guard release errors so the original startup error is preserved, and set `SCHEDULER_STARTUP_FAILED` with a standby poll if not stopped/manual/fatal.
- If `stopRequested` becomes true during startup, cleanup completes and final reason is `SCHEDULER_STOPPED`.

- [ ] **Step 4: Operational admission**

Implement quarantine-aware operational gate:

- `assertOperationalAdmission()` calls `status()`.
- If status is not ready, reject before enqueue/DB with `status.reason`.
- Stop-tail captured capability may proceed only when parent stop rules and live lease still pass.
- Quarantine/backlog threshold rejects `runCommand`, `advanceTo`, `schedule`, `cancel`, `drainNow`, and `reconcile` before first durable write.

## Task 3: Claim, Task5 downstream, direct account continuation, commands, cutover, and CLI

**Files:** all six owned files.

**Interfaces:** Consumes live Store primitives and produces full writer command/drain behavior plus maintenance cutover surfaces.

- [ ] **Step 1: Claim and downstream order**

Implement parent `takeNextJob` literally with these V16 constraints:

- Claim UOws call `recordEffectiveNowInCurrentUow` before eligibility decisions.
- `before-claim` hook runs inside the claim UoW before Store claim.
- `after-claim` hook runs immediately after the claim UoW commits and before effect UoW.
- Global claim path runs before account `claimNext`.
- Global path uses live `claimForResolution` for owned RUNNING resume/global barrier resolution. Account `claimNext` runs only when global classification allows accounts.
- `partialQueue` stores string ids and rotates watermark-ineligible partials.
- Foreign RUNNING global blocks generic account work; QUARANTINED root permits only due account work through watermark; future RETRY_WAIT returns retry wait.

Accepted Task5 downstream order:

1. Fresh effect UoW.
2. `recordEffectiveNowInCurrentUow`.
3. `markDurableMutationInCurrentUow`.
4. Global `advanceBarrier` before reducer for global jobs.
5. If `advanceBarrier` returns already-parked `blockedExternal:true` and `blockedExternalJobId`, writer returns reordered/partial and does not call `parkGlobalBehindPreceding`.
6. Application replay validation/charge before `prepare`.
7. `reducer.prepare(mutation, executable, options)`.
8. For prepared result, `store.insertApplication`.
9. `reducer.applyPrepared(mutation, prepared)` with arity `(mutation, prepared)`.
10. Terminal Store method: `completeApplied`, `finishResolved`, or `completeAccountAdvanceAndScheduleSuccessor`.
11. Final lease fence before commit.

Crash hooks are exactly `before-claim`, `after-claim`, `after-application-insert`, `after-game-mutation`, and `before-job-completion`.

- [ ] **Step 2: Direct account external retarget integration**

Implement these exact writer methods:

- `SchedulerWriter.prototype.directAccountOutcomeInCurrentUow(mutation, accountId, targetS, nowMs, options)`
- `SchedulerWriter.prototype.ensureEstablishedZeroDirectContinuation(mutation, result, executable, nowMs)`
- `SchedulerWriter.prototype.ensureExternalBlockedDirectContinuation(mutation, result, accountId, targetS, nowMs)`
- `SchedulerWriter.prototype.advanceAccountInCurrentUow(mutation, accountId, targetS, nowMs, options)`
- `SchedulerWriter.prototype.finalizeCommandAccountInCurrentUow(mutation, finalizer, nowMs)`

Rules:

- Direct normal account path must not pass `deferAccountWake:true`; live `World` must be allowed to call `replaceAccountAdvance`.
- Use `world.advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)` only after `world._schedulerActive(mutation)` succeeds.
- If result completes normally, preserve successor created by live World and call `completeAccountAdvanceAndScheduleSuccessor` for the durable job when a claimed job exists.
- If result is established-zero, retain the RUNNING job lock and schedule exactly one continuation using `ensureEstablishedZeroDirectContinuation`.
- If result has `deferredExternal === true` or `blockedExternalJobId`, call `ensureExternalBlockedDirectContinuation`.

`ensureExternalBlockedDirectContinuation` algorithm:

1. Require `result.saveReceipt` and safe `result.saveReceipt.revision`.
2. Let `revision = result.saveReceipt.revision`, `dependencyId = result.blockedExternalJobId`, and `dependencyT = result.nextDueAtS` or `targetS`.
3. Call `store.validateBlockedAccountAdvanceForDependency(token, accountId, revision, dependencyId, dependencyT, nowMs)`.
4. If it returns `{preExistingBlocked:true}`, return that job and set result flags `{preExistingBlocked:true, newlyAdoptedBlocked:false}`.
5. If it returns `null`, call `store.retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, dependencyT, nowMs)`.
6. If retarget returns `null`, call `store.replaceAccountAdvance(token, accountId, revision, dependencyT, nowMs)` once.
7. If `replaceAccountAdvance` returns a row with non-null `blocked_by_job_id`, validate it again with `validateBlockedAccountAdvanceForDependency`; if validation fails, throw `ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT`.
8. Adopt the unblocked row via `store.adoptAccountAdvanceForCommand(token, accountId, dependencyT, nowMs, leaseMs)`.
9. Block the adopted executable via `store.blockOwnedAccountAdvance(token, adopted, revision, dependencyId, nowMs)`.
10. Return `{partial:true, deferredExternal:true, blockedExternalJobId: dependencyId, jobId: blocked.id, newlyAdoptedBlocked:true, preExistingBlocked:false, accountFinalizer}`.

Metric ownership:

- `ensureEstablishedZeroDirectContinuation`, `ensureExternalBlockedDirectContinuation`, retarget helper, and Store helpers never call `mutation.recordJob`.
- Command/account finalizer records exactly one job metric for a newly blocked/adopted durable job.
- Pre-existing blocked rows record no duplicate metric unless parent explicitly records an existing outcome for that command; if recorded, it is through finalizer once.

- [ ] **Step 3: `advanceDueInCurrentUow` and command world batch**

Implement:

```js
SchedulerWriter.prototype.withCommandWorldBatchInCurrentUow = function (mutation, fn) {
  this.world._schedulerActive(mutation);
  return fn();
};
```

`advanceDueInCurrentUow` exact algorithm:

1. Call `world._schedulerActive(mutation)`.
2. Query live due accounts with `this.world.kho.q.dqDenHan.all(nowS, 61)`.
3. Sort or preserve the query's deterministic order by account id; process only the first 60 rows.
4. For each processed row:
   - call `directAccountOutcomeInCurrentUow(mutation, Number(row.tk), nowS, nowMs, {source:'advance-due'})`;
   - record the advance result exactly once through the mutation ledger;
   - if the account outcome is partial, budget exhausted, or deferred external, stop processing and return partial summary.
5. If row 61 exists, return:

```js
{
  partial: true,
  hasMoreDue: true,
  deferredExternal: false,
  partialJobId: null,
  processed: processed,
  advanceResult: {
    processed: processed,
    advancedToS: nowS,
    nextDueAtS: nowS,
    hasMoreDue: true,
    budgetExhausted: false
  }
}
```

6. The `runCommand({name:'advance-due'})` caller must branch on `partial || hasMoreDue || deferredExternal`, persist `TICK_PARTIAL`, skip the command closure, and enqueue one post-commit continuation. In manualDrain mode it returns partial and does not arm an implicit continuation.
7. If all due accounts complete and no 61st row exists, `runCommand` may invoke the closure after finalizing all account finalizers inside the same owning UoW.

- [ ] **Step 4: `runCommand`, `advanceTo`, and reconciler gates**

`runCommand`:

- Validates command shape before enqueue.
- Uses internally derived monotonic time; no public caller supplies time.
- Barrier partial returns `{deferred:true, code:'TICK_PARTIAL'}` and never invokes closure.
- Thenable closure can only be rejected after invocation with `UNIT_OF_WORK_ASYNC`; tests must not claim rollback before invocation for thenables.
- `account-delete` uses parent direct branch.
- `advance-due` uses writer-owned `advanceDueInCurrentUow`; no `server/world.js` edit and no `world.advanceDueNoiBo`.
- Every command UoW path gets a post-world final lease fence before commit.
- Postcommit partial handling:
  - if `partialJobId` is non-null, enqueue that running job id;
  - if response has `deferredExternal:true` or `code:'TICK_PARTIAL'` with `partialJobId === null`, enqueue one budget/due continuation;
  - manualDrain does not arm implicit continuation.

`advanceTo`:

- Rejects future target before marker/barrier writes.
- Runs global barriers first.
- For direct account deferred external, public result includes `deferredExternal:true` and dependency fields, then schedules immediate continuation when `partialJobId === null`.

`reconcile`:

- If no reconciler is installed, reject `SCHEDULER_RECONCILER_UNAVAILABLE` before enqueue or DB write.
- Installed reconciler owns its page UoWs in Task9; writer does not wrap reconciler page writes in Task6.

- [ ] **Step 5: Cutover**

`runMaintenanceCutover(context)` exact contract:

- Context exactly `{kho, clock, ownerId}`.
- Validate context and owner before Store access.
- Call `apDungMigrationScheduler(kho, clock.nowMs())` before constructing `SchedulerStore`.
- Construct `new SchedulerStore(kho, clock)`.
- Use `context.kho.trongGiaoDich(fn, {immediate:true})`.
- Lease duration exactly `15000`.
- Reject nonlegacy mode with `SCHEDULER_CUTOVER_ALREADY_DURABLE`.
- Reject nonempty `dq` with `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`.
- Acquire fresh lease for owner; if unavailable throw `SCHEDULER_LEASE_UNHELD`.
- Seed only `combat_seed_key_v1`; do not seed universe or lazy bootstrap.
- Set durable mode and audit `CUTOVER`.
- Return `{mode:'durable', imported:0, recovered:0}`.
- Release same token in `finally`.
- Release error policy: preserve primary error if primary exists; if no primary exists, propagate release error; no logger exists in context.

- [ ] **Step 6: CLI**

Implement exact surface in `tools/scheduler-cutover.js`:

```js
var fs = require('node:fs');
var crypto = require('node:crypto');
var Kho = require('../server/db.js').Kho;
var taoClock = require('../server/clock.js').taoClock;
var runMaintenanceCutover = require('../server/scheduler/cutover.js').runMaintenanceCutover;
var assertSchedulerOwnerId = require('../server/scheduler/store.js').assertSchedulerOwnerId;
function cliError(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}
function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 4 ||
      argv[0] !== '--db' || typeof argv[1] !== 'string' || argv[1].length === 0 ||
      argv[2] !== '--action' || argv[3] !== 'cutover') {
    throw cliError('SCHEDULER_CLI_ARGS_INVALID');
  }
  if (fs.existsSync(argv[1]) && fs.statSync(argv[1]).isDirectory()) {
    throw cliError('SCHEDULER_CLI_DB_INVALID');
  }
  return {dbPath: argv[1], action: 'cutover'};
}
function safeCliCode(error) {
  var codePattern = /^[A-Z][A-Z0-9_]{1,63}$/;
  if (error && typeof error.code === 'string' && codePattern.test(error.code)) return error.code;
  if (error && typeof error.message === 'string' && codePattern.test(error.message)) return error.message;
  return 'SCHEDULER_CUTOVER_FAILED';
}
async function runCli(argv, deps) {
  deps = deps || {};
  var parsed, kho = null, primary = null, result = null;
  try {
    parsed = parseArgs(argv);
    var ownerId = assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)());
    var clock = deps.clock || taoClock();
    kho = deps.openKho ? deps.openKho(parsed.dbPath) : new Kho(parsed.dbPath);
    result = runMaintenanceCutover({kho: kho, clock: clock, ownerId: ownerId});
  } catch (error) {
    primary = error;
  } finally {
    if (kho && typeof kho.dong === 'function') {
      try { kho.dong(); }
      catch (closeError) { if (!primary) primary = closeError; }
    }
  }
  if (primary) return {exitCode: 1, stdout: '', stderr: safeCliCode(primary) + '\n'};
  return {exitCode: 0, stdout: JSON.stringify({
    action: 'cutover',
    mode: result.mode,
    imported: result.imported,
    recovered: result.recovered
  }) + '\n', stderr: ''};
}
async function main(argv, deps, io) {
  io = io || {stdout: process.stdout, stderr: process.stderr};
  var output = await runCli(argv, deps || {});
  if (output.stdout) io.stdout.write(output.stdout);
  if (output.stderr) io.stderr.write(output.stderr);
  process.exitCode = output.exitCode;
  return output;
}
if (require.main === module) {
  main(process.argv.slice(2), {}, {stdout: process.stdout, stderr: process.stderr});
}
module.exports = {parseArgs: parseArgs, runCli: runCli, main: main};
```

`runCli(argv,deps)`:

- `deps` exactly supports `{openKho, makeOwnerId, clock}`.
- Validate args before open.
- Owner id is `assertSchedulerOwnerId((deps.makeOwnerId || crypto.randomUUID)())`.
- Clock is `deps.clock || taoClock()`.
- Open with `deps.openKho(dbPath)` if supplied; otherwise construct default `Kho`.
- Always close opened `kho` with `kho.dong()` in `finally` when present.
- If primary work throws and close also throws, return failure for primary error.
- If close throws without primary error, return failure for close error.
- Success stdout is exact JSON with newline: `{action:'cutover', mode:'durable', imported:0, recovered:0}`.
- Failure stdout is empty and stderr is `${safeCliCode(error)}\n`.

`main(argv,deps,io)`:

- Uses injected streams or process streams.
- Awaits `runCli`.
- Writes returned stdout/stderr.
- Sets `process.exitCode = result.exitCode`.
- Returns result.
- Does not call `process.exit`.

## Task 4: Final verification, report, Stage-A/B, and reviews

**Files:** exact report artifact plus six owned source/test files.

- [ ] **Step 1: Final prefix/name checks**

```bash
node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [lenText, hash] = fs.readFileSync('/tmp/task6-v16-prefix.tsv', 'utf8').trim().split('\t');
const len = Number(lenText);
const data = fs.readFileSync('tools/test-scheduler.js');
const actual = crypto.createHash('sha256').update(data.subarray(0, len)).digest('hex');
if (actual !== hash) throw new Error('TASK6_PREFIX_CHANGED');
NODE
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v16-final.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v16-final-throw.tap
for f in /tmp/task6-v16-final.tap /tmp/task6-v16-final-throw.tap; do
  grep -E '^# tests 245$' "$f"
  grep -E '^# pass 244$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
. /tmp/task6-v16-tap-normalize.sh
normalize_tap_for_hash /tmp/task6-v16-final.tap > /tmp/task6-v16-final.normalized.tap
normalize_tap_for_hash /tmp/task6-v16-final-throw.tap > /tmp/task6-v16-final-throw.normalized.tap
sha256sum /tmp/task6-v16-final.normalized.tap > /tmp/task6-v16-final.normalized.tap.sha256
sha256sum /tmp/task6-v16-final-throw.normalized.tap > /tmp/task6-v16-final-throw.normalized.tap.sha256
```

Extract final ordered names:

```bash
node - <<'NODE' /tmp/task6-v16-final.tap > /tmp/task6-v16-final-parent73-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const actual = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const expected = fs.readFileSync('/tmp/task6-v16-parent73-names.txt', 'utf8').trim().split('\n');
const expectedSet = new Set(expected);
const selected = actual.filter((name) => expectedSet.has(name));
if (selected.length !== 73) throw new Error('PARENT73_FINAL_COUNT_' + selected.length);
for (const name of selected) console.log(name);
NODE
node - <<'NODE' /tmp/task6-v16-final.tap > /tmp/task6-v16-final-overlay9-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (Task 6 v16 remediation .+)$/gm)).map((m) => m[1]);
if (names.length !== 9) throw new Error('OVERLAY9_FINAL_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
node - <<'NODE' /tmp/task6-v16-final.tap > /tmp/task6-v16-final-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const actual = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const parent = new Set(fs.readFileSync('/tmp/task6-v16-parent73-names.txt', 'utf8').trim().split('\n'));
const baseline = actual.filter((name) => !parent.has(name) && !name.startsWith('Task 6 v16 remediation '));
if (baseline.length !== 163) throw new Error('BASELINE_FINAL_COUNT_' + baseline.length);
for (const name of baseline) console.log(name);
NODE
diff -u /tmp/task6-v16-parent73-names.txt /tmp/task6-v16-final-parent73-names.txt
diff -u /tmp/task6-v16-overlay9-names.txt /tmp/task6-v16-final-overlay9-names.txt
diff -u /tmp/task6-v16-baseline-names.txt /tmp/task6-v16-final-baseline-names.txt
sort /tmp/task6-v16-final-parent73-names.txt | uniq -d > /tmp/task6-v16-final-parent73-duplicates.txt
sort /tmp/task6-v16-final-overlay9-names.txt | uniq -d > /tmp/task6-v16-final-overlay9-duplicates.txt
test ! -s /tmp/task6-v16-final-parent73-duplicates.txt
test ! -s /tmp/task6-v16-final-overlay9-duplicates.txt
```

- [ ] **Step 2: Six metadata generator and seal**

```bash
cat > /tmp/task6-v16-six-meta.sh <<'SH'
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
sha256sum /tmp/task6-v16-six-meta.sh > /tmp/task6-v16-six-meta.sh.sha256
. /tmp/task6-v16-six-meta.sh
make_six_meta > /tmp/task6-v16-six-meta.sealed.tsv
sha256sum /tmp/task6-v16-six-meta.sealed.tsv > /tmp/task6-v16-six-meta.sealed.tsv.sha256
```

- [ ] **Step 3: Create report draft before post inventory**

```bash
mkdir -p docs/superpowers/reports
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
: > "$report"
chmod 0755 docs/superpowers/reports
chmod 0644 "$report"
```

Draft report must contain these exact fields before Stage-A validation:

```text
plan_v16_sha=<approved sha from /tmp/task6-v16-approved-plan.sha256>
parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf
parent_blocks_sha=<sha of /tmp/task6-v16-parent-blocks.sha256 file contents>
parent_slice_sha=<sha from /tmp/task6-v16-current-parent-slice.js.sha256>
baseline_names_sha=<sha from /tmp/task6-v16-baseline-names.txt.sha256>
prefix_len=<len from /tmp/task6-v16-prefix.tsv>
prefix_sha=<sha from /tmp/task6-v16-prefix.tsv>
parent73_names_sha=<sha from /tmp/task6-v16-parent73-names.txt.sha256>
overlay9_names_sha=<sha from /tmp/task6-v16-overlay9-names.txt.sha256>
overlay_red_evidence_sha=<sha from /tmp/task6-v16-red-evidence.tap.sha256>
six_meta_sha=<sha from /tmp/task6-v16-six-meta.sealed.tsv.sha256>
final_normalized_tap_sha=<sha from /tmp/task6-v16-final.normalized.tap.sha256>
final_throw_normalized_tap_sha=<sha from /tmp/task6-v16-final-throw.normalized.tap.sha256>
stage_a_normalized_tap_sha=<sha emitted by Stage-A fresh run>
stage_a_throw_normalized_tap_sha=<sha emitted by Stage-A fresh run>
stage_a_counts=245 tests / 244 pass / 0 fail / 1 skipped
node_check_status=PASS
whitespace_status=PASS
inventory_status=PASS
stage_a_status=PASS
parent runtime=73 + overlay=9 => N=82
```

Run post inventory after the draft file exists:

```bash
. /tmp/task6-v16-inventory.sh
repo_inventory > /tmp/task6-v16-post-inventory.tsv
sha256sum /tmp/task6-v16-post-inventory.tsv > /tmp/task6-v16-post-inventory.tsv.sha256
```

- [ ] **Step 4: Stage-A executable script**

Generate `/tmp/task6-v16-stage-a.sh`. Stage-A recomputes current six metadata before tests, runs fresh normal and throw-deprecation tests, checks `245/244/0/1`, normalizes TAP for stable hashing, recomputes six metadata after tests, and diffs before/after and sealed/current metadata.

```bash
cat > /tmp/task6-v16-stage-a.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
sha256sum -c /tmp/task6-v16-approved-plan.sha256
sha256sum -c <<'EOF'
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
EOF
sha256sum -c /tmp/task6-v16-inventory.sh.sha256
sha256sum -c /tmp/task6-v16-pre-inventory.tsv.sha256
sha256sum -c /tmp/task6-v16-tap-normalize.sh.sha256
sha256sum -c /tmp/task6-v16-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v16-parent73-names.txt.sha256
sha256sum -c /tmp/task6-v16-overlay9-names.txt.sha256
sha256sum -c /tmp/task6-v16-baseline-names.txt.sha256
sha256sum -c /tmp/task6-v16-parent-blocks.sha256
sha256sum -c /tmp/task6-v16-current-parent-slice.js.sha256
sha256sum -c /tmp/task6-v16-six-meta.sh.sha256
. /tmp/task6-v16-six-meta.sh
make_six_meta > /tmp/task6-v16-six-meta.stage-a-before.tsv
diff -u /tmp/task6-v16-six-meta.sealed.tsv /tmp/task6-v16-six-meta.stage-a-before.tsv
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v16-stage-a.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v16-stage-a-throw.tap
for f in /tmp/task6-v16-stage-a.tap /tmp/task6-v16-stage-a-throw.tap; do
  grep -E '^# tests 245$' "$f"
  grep -E '^# pass 244$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
done
. /tmp/task6-v16-tap-normalize.sh
normalize_tap_for_hash /tmp/task6-v16-stage-a.tap > /tmp/task6-v16-stage-a.normalized.tap
normalize_tap_for_hash /tmp/task6-v16-stage-a-throw.tap > /tmp/task6-v16-stage-a-throw.normalized.tap
sha256sum /tmp/task6-v16-stage-a.normalized.tap > /tmp/task6-v16-stage-a.normalized.tap.sha256
sha256sum /tmp/task6-v16-stage-a-throw.normalized.tap > /tmp/task6-v16-stage-a-throw.normalized.tap.sha256
make_six_meta > /tmp/task6-v16-six-meta.stage-a-after.tsv
diff -u /tmp/task6-v16-six-meta.stage-a-before.tsv /tmp/task6-v16-six-meta.stage-a-after.tsv
diff -u /tmp/task6-v16-six-meta.sealed.tsv /tmp/task6-v16-six-meta.stage-a-after.tsv
node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [lenText, hash] = fs.readFileSync('/tmp/task6-v16-prefix.tsv', 'utf8').trim().split('\t');
const actual = crypto.createHash('sha256')
  .update(fs.readFileSync('tools/test-scheduler.js').subarray(0, Number(lenText)))
  .digest('hex');
if (actual !== hash) throw new Error('TASK6_PREFIX_CHANGED');
NODE
node - <<'NODE' > /tmp/task6-v16-current-parent-slice.stage-a.js
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = '// TASK6_V16_PARENT_TESTS_START\n';
const end = '// TASK6_V16_PARENT_TESTS_END\n';
const a = text.indexOf(start);
const b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_PARENT_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
test "$(sha256sum /tmp/task6-v16-current-parent-slice.stage-a.js | awk '{print $1}')" = \
  "$(cut -d' ' -f1 /tmp/task6-v16-current-parent-slice.js.sha256)"
node - <<'NODE' /tmp/task6-v16-stage-a.tap > /tmp/task6-v16-stage-a-parent73-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const actual = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const expected = fs.readFileSync('/tmp/task6-v16-parent73-names.txt', 'utf8').trim().split('\n');
const expectedSet = new Set(expected);
const selected = actual.filter((name) => expectedSet.has(name));
if (selected.length !== 73) throw new Error('PARENT73_STAGEA_COUNT_' + selected.length);
for (const name of selected) console.log(name);
NODE
node - <<'NODE' /tmp/task6-v16-stage-a.tap > /tmp/task6-v16-stage-a-overlay9-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (Task 6 v16 remediation .+)$/gm)).map((m) => m[1]);
if (names.length !== 9) throw new Error('OVERLAY9_STAGEA_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
node - <<'NODE' /tmp/task6-v16-stage-a.tap > /tmp/task6-v16-stage-a-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const actual = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const parent = new Set(fs.readFileSync('/tmp/task6-v16-parent73-names.txt', 'utf8').trim().split('\n'));
const baseline = actual.filter((name) => !parent.has(name) && !name.startsWith('Task 6 v16 remediation '));
if (baseline.length !== 163) throw new Error('BASELINE_STAGEA_COUNT_' + baseline.length);
for (const name of baseline) console.log(name);
NODE
diff -u /tmp/task6-v16-parent73-names.txt /tmp/task6-v16-stage-a-parent73-names.txt
diff -u /tmp/task6-v16-overlay9-names.txt /tmp/task6-v16-stage-a-overlay9-names.txt
diff -u /tmp/task6-v16-baseline-names.txt /tmp/task6-v16-stage-a-baseline-names.txt
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
grep -F "plan_v16_sha=$(cut -d' ' -f1 /tmp/task6-v16-approved-plan.sha256)" "$report"
grep -F 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3' "$report"
grep -F 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf' "$report"
grep -F "parent_blocks_sha=$(sha256sum /tmp/task6-v16-parent-blocks.sha256 | awk '{print $1}')" "$report"
grep -F "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v16-current-parent-slice.js.sha256)" "$report"
grep -F "baseline_names_sha=$(cut -d' ' -f1 /tmp/task6-v16-baseline-names.txt.sha256)" "$report"
grep -F "overlay9_names_sha=$(cut -d' ' -f1 /tmp/task6-v16-overlay9-names.txt.sha256)" "$report"
grep -F "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v16-red-evidence.tap.sha256)" "$report"
grep -F "six_meta_sha=$(cut -d' ' -f1 /tmp/task6-v16-six-meta.sealed.tsv.sha256)" "$report"
grep -F "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v16-stage-a.normalized.tap.sha256)" "$report"
grep -F "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v16-stage-a-throw.normalized.tap.sha256)" "$report"
grep -F 'stage_a_counts=245 tests / 244 pass / 0 fail / 1 skipped' "$report"
grep -F 'node_check_status=PASS' "$report"
grep -F 'whitespace_status=PASS' "$report"
grep -F 'inventory_status=PASS' "$report"
grep -F 'stage_a_status=PASS' "$report"
grep -F 'parent runtime=73 + overlay=9 => N=82' "$report"
. /tmp/task6-v16-inventory.sh
repo_inventory > /tmp/task6-v16-post-inventory.stage-a.tsv
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
pre = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v16-pre-inventory.tsv').read_text().splitlines()}
post = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v16-post-inventory.stage-a.tsv').read_text().splitlines()}
bad = [p for p in sorted(set(pre) | set(post)) if pre.get(p) != post.get(p) and p not in allowed]
if bad:
    raise SystemExit('NON_OWNED_SCOPE_CHANGED\n' + '\n'.join(bad))
PY
SH
chmod +x /tmp/task6-v16-stage-a.sh
```

Run once, write the computed Stage-A normalized TAP hashes into the report, then run again and require pass:

```bash
/tmp/task6-v16-stage-a.sh || true
sha256sum /tmp/task6-v16-stage-a.normalized.tap /tmp/task6-v16-stage-a-throw.normalized.tap
# update report fields stage_a_normalized_tap_sha and stage_a_throw_normalized_tap_sha
/tmp/task6-v16-stage-a.sh
```

- [ ] **Step 5: Reviews and Stage-B**

Launch two genuine fresh collaboration reviewers using `model=gpt-5.6-sol` and `effort=high` over:

- V16 approved plan SHA
- parent and Task5 authority SHAs
- exact six-file metadata rows and hash
- parent block source hash
- current parent marker slice hash
- overlay RED evidence hash
- Stage-A script and fresh Stage-A normalized TAP hashes
- report draft

Actual collaboration tool outcomes are required separately; structured report text alone is not proof.

Append approvals only after genuine PASS:

```text
Reviewer 1: identity=<distinct-tool-agent-id-1> model=gpt-5.6-sol effort=high outcome=PASS
Reviewer 2: identity=<distinct-tool-agent-id-2> model=gpt-5.6-sol effort=high outcome=PASS
```

Stage-B:

```bash
/tmp/task6-v16-stage-a.sh
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

- [ ] V16 hash approval uses external `TASK6_V16_APPROVED_SHA`; the plan does not embed its own SHA.
- [ ] Store primitive signatures, SQL fences, return values, and conflict codes are defined.
- [ ] Overlay 1-9 include detailed fixtures/assertions and exact sentinel mapping.
- [ ] Nine `run_one_overlay_red` invocations are explicit and ordered.
- [ ] `advanceDueInCurrentUow` uses live `kho.q.dqDenHan.all(nowS, 61)` and `world.advanceAccountNoiBo`; no `server/world.js` edit.
- [ ] `withCommandWorldBatchInCurrentUow` uses live `world._schedulerActive(mutation)`.
- [ ] Direct external retarget integration handles same-key retarget, absent create fallback, early-return dependency validation, unrelated block conflict, deferredExternal public return, and one metric owner.
- [ ] Skeleton step is explicit and sequenced overlay RED before skeleton before parent import.
- [ ] CLI parse grammar, close/primary precedence, safe code, main streams, exports, and require-main guard are exact.
- [ ] Parent import has explicit markers, parent block source hash, and current marker-slice hash.
- [ ] Stage-A validates sealed preinventory, parent-block source, current parent slice, prefix/names, current six metadata before/after fresh tests, fresh normalized TAP hashes/counts, node checks, whitespace, report fields, and scope.
- [ ] Stage-B reruns Stage-A and validates two distinct fresh Sol/high PASS reviewer lines.
