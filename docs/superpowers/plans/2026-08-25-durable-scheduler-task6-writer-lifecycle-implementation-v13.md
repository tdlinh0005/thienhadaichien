# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V13

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every code wave and `superpowers:verification-before-completion` before claiming completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark, retry/backoff/quarantine, command MutationGate, cutover, CLI, and Task7-private lifecycle seams on the accepted Tasks 1-5 foundation.

**Architecture:** V13 changes strategy: do not compress Task6 into a hand-authored 42-case subset. Transplant/adapt the 66 authoritative parent Task6 `test()` definitions as the minimum, then add a small remediation overlay only for review-blocked regressions not already fully covered. Implementation follows parent Task6 and accepted Task5 line ranges first; live source ABI overlays only adapt names/signatures that differ from parent snippets.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task 6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`.

## Global constraints

- Preserve V1-V12 plan artifacts. This planning task creates only this V13 file.
- Implementation may edit exactly these six Task6-owned source/test files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task7+ production edits. Forbidden examples include `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, every `js/*.js`, and `web/js/mp.js`.
- Parent tests: 66 parent Task6 `test()` definitions were mechanically counted between parent lines 10866 and 15333, excluding non-test code occurrences of `test(` at lines 14669 and 15301.
- Overlay tests: 7 remediation `test()` definitions are added.
- Added total: `N = 66 + 7 = 73`.
- Mechanical arithmetic for report handoff: `parent=66 + overlay=7 => N=73`.
- Expected final scheduler TAP if the accepted baseline remains 163/162/0/1: `236 tests`, `235 pass`, `0 fail`, `1 skipped`. If preflight baseline differs, stop and report drift before implementation; do not silently recompute.
- Parent+Task5+live accepted APIs override every V1-V12 pseudocode conflict.
- Do not import or create `server/scheduler/metrics.js` in Task6. Status helpers live inside `writer.js` or exact inline equivalents.
- Do not add `TheGioi.prototype.advanceDueNoiBo`; Task6 owns a writer helper that uses live `kho.q.dqDenHan`.
- Do not add generic reconciliation DB wrapping. Task6 rejects missing reconcilers before enqueue/DB; Task9 owns installed reconciler page UoWs.
- No report self-hash. The active V13 plan hash is captured externally in `/tmp/task6-active-plan.sha256`.

---

## Direct inspection baseline

Use these inspected facts as implementation constraints:

- Live `server/scheduler/store.js` constructor is `new SchedulerStore(kho, clock)`.
- Live Store methods/signatures available to Task6:
  - `recordEffectiveNowMs(token, effectiveNowMs)`
  - `acquireLease(ownerId, nowMs, leaseMs)`
  - `renewLease(token, nowMs, leaseMs)`
  - `releaseLease(token, nowMs)`
  - `claimNext(token, nowMs, watermarkS, lockMs)`
  - `claimForResolution(token, jobId, nowMs, lockMs, options)` with live option keys `nowS`, `allowFuturePending`, `allowQuarantined`
  - `resumeOwnedRunning(token, jobId, nowMs, lockMs)`
  - `getById(jobId)`, `getByIdempotencyKey(key)`, `loadExecutableJob(token, row, nowMs)`
  - `hasCommittedApplication(token, executable, nowMs)`
  - `insertApplication(token, executable, application, nowMs, canonicalTContext)`
  - `checkpointPartial(token, job, revision, nowMs)`
  - `markDurableMutation(token, nowMs)`
  - `completeApplied(token, job, nowMs)`
  - `finishResolved(token, job, state, reason, nowMs)`
  - `completeAccountAdvanceAndScheduleSuccessor(token, job, nextLocalAtS, nowMs)`
  - `fail(token, job, failure, nowMs, policy)`
  - `recoverExpiredRunning(token, nowMs, policy)`
  - `statusSnapshot(nowMs)`
  - `listBarrierJobsAtOrBefore(token, targetS, nowMs)`
  - `adoptAccountAdvanceForCommand(token, accountId, targetS, nowMs, lockMs)`
  - `replaceAccountAdvance(token, accountId, revision, nextLocalAtS, nowMs)`
  - `blockOwnedAccountAdvance(token, job, checkpointRevision, blockedByJobId, nowMs)`
  - `parkGlobalBehindPreceding(token, runningJob, precedingJobId, targetS, nowMs)`
  - `assertAccountDependencyIntegrity(token, nowMs)`
- Live reducer ABI:
  - `initializeCombatSeed(leaseToken, effectiveNowMs)`
  - `prepare(mutation, executableJob, options)` where `options` may contain only `executionTargetS`
  - `applyPrepared(mutation, prepared)` with arity 2
- Live accepted Task5 partial effect is exactly `{checkpointRevision: receipt && receipt.revision, saveReceipt: receipt}`; established-zero returns `{checkpointRevision:null, saveReceipt:null}`.
- Live `GameAdvanceService.advanceBarrier` already calls `store.parkGlobalBehindPreceding(...)` and returns `blockedExternal:true` with `blockedExternalJobId`. Writer must recognize that already-parked result and must not call `parkGlobalBehindPreceding` again.
- Live `TheGioi` has `trongMutationScheduler(mutation, fn)`, `_schedulerActive(mutation)`, and `advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)`. It has no `_mutationContexts` ABI and no `advanceDueNoiBo`.
- Live `server/db.js` has `kho.q.dqDenHan` ordered by `keTiep,tk`.
- Direct parent inspection confirms `server/scheduler/index.js` parent exports `taoScheduler`, `inRange`, and `resolveDurableSchedulerOptions`. The review text asked to confirm `baseSchedulerOptions`; parent defines it but does not export it. V13 follows the parent export set unless a fresh parent inspection shows a different exact module.exports before implementation.

---

## Authoritative parent source ranges

Implement by copying/adapting these parent ranges, not by rewriting from memory:

| Concern | Parent range | V13 instruction |
|---|---:|---|
| Task6 test prelude/helpers and first writer tests | 10866-11030 | Copy/adapt fixtures and imports; preserve assertions. |
| Dynamic dependency/global ordering tests | 11318-11833 | Copy/adapt exact tests and helper fixtures. |
| Lease, timers, fatal, partial, command tests | 11925-12478 | Copy/adapt exact tests and helper fixtures. |
| Retry/quarantine/logging/payload/status tests | 12491-12839 | Copy/adapt exact tests and helper fixtures. |
| Public bridge/factory/reconcile tests | 12887-13047 | Copy/adapt exact tests and helper fixtures. |
| Writer constructor, metrics, admission, effective time | 13090-13480 | Copy parent shape; overlay live ABI and V13 status corrections below. |
| Startup/stop/schedule/cancel/reconcile/wake | 13480-13950 | Copy parent shape; overlay startup marker/rebase and clearAllTimers. |
| Partial queue, drain, claimed job lifecycle | 13950-14595 | Copy parent shape; overlay live Task5 exact order and already-parked barrier. |
| Command/advanceTo MutationGate | 14595-14870 | Copy parent shape; overlay live World helper and command corrections. |
| Factory/index bridge | 14870-15249 | Copy exact context-key validation and bridge descriptors; overlay export confirmation. |
| Cutover and CLI | 15250-15333 | Copy exact fresh-only cutover contract; overlay context validation and live `taoClock()`/`kho.dong()` CLI. |
| Parent status canonical logic from Task8 | 18385-18620 | Extract faithfully into `writer.js`; do not import `metrics.js`. |
| Accepted Task5 downstream protocol | Task5 remediation 825-833 | This exact order wins over V12 and parent drift. |

---

## Parent Task6 test manifest

Add the 66 parent Task6 `test()` definitions as the authoritative minimum. Static names must stay byte-for-byte. The three dynamic parent definitions may be implemented as one registered `test()` definition each with subcase labels, or left as parent loops if the implementation updates the mechanical count honestly before final report. The preferred V13 path is one registered test per parent definition so `N=73` remains exact.

1. `deterministic retry jitter is always in the inclusive 0..999 contract`
2. `writer in legacy mode remains health-visible but cannot ready or drain`
3. `direct SchedulerWriter construction rejects a non-UUID owner before DB work`
4. `dynamic empty NPC and self targets defer commands to one canonical global`
5. `ordinary drain checkpoints every dynamically external target before global resume`
6. `public advanceTo persists the same restart-safe dynamic dependency`
7. `retry and quarantine never release or spin the handed source continuation`
8. `global release resumes a no-op source wake and preserves its one future successor`
9. `real Writer settles reciprocal same-T attacks once without recursive resolution`
10. `established zero reaches account service: pure completion or durable partial`
11. `public advanceTo aggregates two barriers into exactly five requested-account fields`
12. `runCommand and advanceTo count committed local primitives exactly once`
13. `Writer ledger retains primitives consumed before parking behind a preceding root`
14. `commit-scoped metric ledger sums primary and secondary and discards rollback`
15. `real Writer uses priority before insertion for same-T fleet and missile`
16. `real Writer preserves same-kind cross-account insertion sequence`
17. `same-owner same-T fleets use persisted sequence while solo keeps reverse-array order`
18. `real Writer re-queries a reducer-created same-T fleet before a missile`
19. `real Writer completes a local T primitive before the external reducer snapshot`
20. `same-T eligible RETRY_WAIT remains before the later PENDING global tuple`
21. `blocked global root still advances account work only through its watermark`
22. `foreign RUNNING first global tuple blocks generic account work`
23. `QUARANTINED root permits only due account work through its watermark`
24. `after-claim crash leaves the committed global RUNNING at attempt zero`
25. `49,999 locals plus one global consume the exact shared 50,000 budget`
26. `50,000 locals leave the global RUNNING for batch two without an effect`
27. `many same-T globals each charge once and retain flat resolver depth`
28. `exact-zero completion arms one macrotask for the next global`
29. `exact-zero global completion also wakes a due account continuation`
30. `only one direct writer owns the lease and a released holder permits a new generation`
31. `manualDrain starts with no timer and mutates a due job only on explicit drainNow`
32. `committed schedule replaces a later wake with an earlier eligible wake`
33. `test-only fatal crash clears mutation timers without releasing its live lease`
34. `fatal and crashed writers are terminal and start cannot resurrect timers or a lease`
35. `one transient heartbeat error rearms below lease third and the next renewal succeeds`
36. `partial RUNNING job checkpoints its own revision and completes event 50,001 in batch two`
37. `MutationGate defers an account command at primitive 50,001 without running its closure`
38. `MutationGate adopts the successor made by a direct partial advance before it returns`
39. Parent dynamic definition: `secondaryKind + ' secondary partial commits checkpoint before one domain effect'` for mail, war, galana fixtures.
40. `zero-progress secondary adopts its wake after primary spends exactly 50,000`
41. Parent dynamic definition: `dynamicKind + ' suppresses its effect when secondary discovers an external ref'` for mail, war, galana fixtures.
42. `advance-due propagates deferredExternal and never reaches its closure`
43. `MutationGate defers a cross-account barrier at primitive 50,001 before its closure`
44. `an outside revision after a partial keeps external stale rejection intact`
45. `standby automatically takes over after the active lease expires`
46. `real takeover after committed claim rejects the stale effect UoW`
47. `a retrying local poison does not stop an independent aggregate before T`
48. `classified retry reaches attempt eight then quarantines while an independent aggregate completes`
49. `an unclassified reducer exception quarantines instead of retrying`
50. `quarantine transition emits one scrubbed post-commit warning and retries emit none`
51. `tick logging honors canonical and alias precedence only after committed flush`
52. `rolled-back effect emits no tick and fatal error logs one redacted stable record`
53. `tampered stored payload quarantines before EventReducer.prepare receives it`
54. `a quarantined global poison holds readiness data and rejects a later MutationGate command`
55. `global retry keeps watermark while unrelated local work does not cross T`
56. Parent dynamic definition: `surface + ' barrier rolls back ' + stage + ' before retry'` for command/advance and after-application-insert/after-game-mutation.
57. `heartbeat renews before lease/3 and loss changes writer to standby without a real sleep`
58. `public bridge advanceTo uses the writer lease and GameAdvanceService result`
59. `public bridge rejects a target beyond effective time before a marker or barrier write`
60. `invalid bridge command fails before enqueue, durable marker, or game write`
61. `MutationGate drains pending PvP at T before admitting the later command`
62. `adapter caches a deterministic makeOwnerId wrapper without a scalar owner field`
63. `production adapter creates and retains one UUID-v4 owner when no test wrapper exists`
64. `bridge implements every writer surface and a rejected tail never poisons the next call`
65. `reconcile refuses before enqueue or DB write when no seam is installed`
66. `taoScheduler memoizes one bridge and one world capability set per Kho`

## Remediation overlay tests

Add these 7 tests after the parent 66. Prefix each name with `Task 6 v13 remediation ` and include the sentinel in its failure message. These are real production obligations; report/scope workflow is not a node:test case.

| # | Name suffix | Sentinel | Required assertions |
|---:|---|---|---|
| 1 | `Task5 live ABI order replay and arity are exact` | TASK6V13_RED_001_TASK5_ABI | Assert `reducer.prepare.length === 3`, `reducer.applyPrepared.length === 2`; claimed lifecycle order is mark, global barrier, replay/charge, prepare, application/effect/terminal; zero-budget unapplied global returns partial before prepare; already-applied restart validates application and skips effect. |
| 2 | `partial receipt wrapper identity and established zero retention are exact` | TASK6V13_RED_002_PARTIAL_RECEIPT | Partial effect is plain object with exact keys `checkpointRevision,saveReceipt`, no symbols/non-enumerables, and strict `effect.saveReceipt === prepared.saveReceipt === prepared.advanceResult.saveReceipt`; established-zero keeps the same RUNNING lock tuple and calls no checkpoint/block/application/terminal. |
| 3 | `raw malformed payload quarantines without reducer prepare or payload parse` | TASK6V13_RED_003_RAW_QUARANTINE | Corrupt a RUNNING row's payload bytes; `settleClaimFailure` reload failure uses lease-fenced `quarantineClaimedRaw`, never calls `EventReducer.prepare`, never parses unsafe payload, preserves attempt, sets QUARANTINED safe fields. |
| 4 | `private DB close seams cache status and clear all timers` | TASK6V13_RED_004_DB_CLOSE | `_datDatabaseClosing` captures safe status before `dbOpen=false`, post-close `getStatus()` is cache-only with `ready:false`, `dbOpen:false`, reason `SCHEDULER_DB_CLOSED`, no SQLite reads; `_beginStop` and DB close call `clearAllTimers`; descriptors are private non-enumerable. |
| 5 | `external only same key retarget and unrelated block are exact` | TASK6V13_RED_005_RETARGET | Real World save creates same-key local wake; Task6 Store retarget primitive retargets only exact unblocked same-key row, returns null on absent same key, maps persisted same-key identity corruption to `PAYLOAD_INTEGRITY`, conflicts on RUNNING/blocked/terminal, and rejects unrelated block A while dependency B without false success. |
| 6 | `startup near expiry recovery rebases locks before ready commit` | TASK6V13_RED_006_STARTUP_REBASE | Startup previews expired recovery; if recovery will mutate, marker occurs before `recoverExpiredRunning`; staged resumed rows are not queued precommit; fresh effective time and rebase happen immediately before final fence; each resumed lock is greater than final now at commit. |
| 7 | `advance due 61 boundary is partial and does not run closure` | TASK6V13_RED_007_DUE_61 | With 61 due accounts and limit 60, writer helper uses `dqDenHan` limit+1 or rescan, returns `{deferred:true, code:'TICK_PARTIAL'}` or exact partial summary, persists `TICK_PARTIAL`, closure count is 0, and manualDrain does not arm implicit continuation. |

---

## Task 1: Preflight, immutable plan hash, parent test import, and one-time RED evidence

**Files:**

- Modify: `tools/test-scheduler.js`
- Temp artifacts: `/tmp/task6-active-plan.sha256`, `/tmp/task6-v13-baseline.tap`, `/tmp/task6-v13-baseline-names.txt`, `/tmp/task6-v13-red-evidence.tap`, `/tmp/task6-v13-red-evidence.sha256`, `/tmp/task6-v13-parent66.txt`, `/tmp/task6-v13-overlay7.txt`

**Interfaces:**

- Consumes: existing accepted `tools/test-scheduler.js`.
- Produces: exact parent+overlay test manifest and frozen RED evidence.

- [ ] **Step 1: Pin V13 before any source/test edit**

```bash
plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v13.md'
test -f "$plan"
test ! -L "$plan"
sha256sum "$plan" > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

- [ ] **Step 2: Capture accepted baseline**

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v13-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v13-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v13-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v13-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v13-baseline.tap
node - <<'NODE' /tmp/task6-v13-baseline.tap > /tmp/task6-v13-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v13-baseline-names.txt > /tmp/task6-v13-baseline-names.sha256
```

- [ ] **Step 3: Append tests after an exact marker**

Append only after:

```js
// TASK6_V13_PARENT_TASK6_TESTS_START
```

Do not alter bytes before the marker. The append block must include:

- `TASK6_V13_PARENT_TEST_DEFINITIONS` with exactly 66 entries.
- `TASK6_V13_OVERLAY_TEST_DEFINITIONS` with exactly 7 entries.
- A manifest validator test helper that is not itself a registered test.
- Lazy `require()` calls inside each test body so missing modules register every test and RED evidence can name the selected failure.

- [ ] **Step 4: Prove RED exactly once**

If `/tmp/task6-v13-red-evidence.tap` exists, stop unless this is before the first proof and you explicitly choose cleanup:

```bash
if test -e /tmp/task6-v13-red-evidence.tap; then
  echo 'Existing V13 RED evidence found; remove only before first proof if restarting preflight.' >&2
  exit 1
fi
: > /tmp/task6-v13-red-evidence.tap
```

Run each of the 73 new test names exactly once with exact anchored `--test-name-pattern`. The helper must verify distinct name, sentinel, order, and a `not ok` line for that exact name:

```bash
run_one_red() {
  name="$1"
  sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v13-red-one.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" \
      tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"
    rm -f "$tmp"
    echo "RED unexpectedly passed: $name" >&2
    exit 1
  fi
  grep -F "# Subtest: $name" "$tmp"
  grep -F "not ok 1 - $name" "$tmp"
  grep -F "$sentinel" "$tmp"
  {
    printf '%s\n' '### TASK6_V13_RED_CASE_START'
    printf '%s\n' "name=$name"
    printf '%s\n' "sentinel=$sentinel"
    cat "$tmp"
    printf '%s\n' '### TASK6_V13_RED_CASE_END'
  } >> /tmp/task6-v13-red-evidence.tap
  rm -f "$tmp"
}
```

After all 73 runs:

```bash
grep -c '^### TASK6_V13_RED_CASE_START$' /tmp/task6-v13-red-evidence.tap | grep -E '^73$'
grep -c '^### TASK6_V13_RED_CASE_END$' /tmp/task6-v13-red-evidence.tap | grep -E '^73$'
sha256sum /tmp/task6-v13-red-evidence.tap > /tmp/task6-v13-red-evidence.sha256
sha256sum -c /tmp/task6-v13-red-evidence.sha256
```

Later GREEN waves must not append to `/tmp/task6-v13-red-evidence.tap`.

---

## Task 2: Writer status, timer lifecycle, DB-close seams, and startup recovery

**Files:**

- Create: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Test: parent tests 1-3, 30-35, 45, 57, 62-66; overlay tests 4 and 6

**Interfaces:**

- Produces: `module.exports = {SchedulerWriter: SchedulerWriter}`.
- Consumes: live Store methods listed in Direct inspection baseline.

- [ ] **Step 1: Status helpers**

Extract the parent Task8 status functions from parent lines 18385-18620 into `writer.js`:

- `newWriterMetricState()` exactly returns nested `jobAttempts`, `jobDuration`, `leaseAcquire`, `reconcile`, `advanceProcessed`, `advanceBudgetExhaustedTotal`, and `lastSuccessfulDrainTimestampMs`.
- Define `computeOpenStatusFromStore(writer)`, `canonicalSchedulerStatus(status, options)`, and `cloneSchedulerStatus(status)` in `writer.js` or exact inline equivalents.
- Validate raw `counts`, `ages`, and nested metrics before normalization; invalid numbers yield `SCHEDULER_STATUS_INVALID`.
- Deep clone nested `jobAttempts`, `jobDuration`, `leaseAcquire`, and `reconcile`; shallow `Object.assign` is insufficient.
- Use `Math.max(writer.lastEffectiveNowMs, writer.clock.nowMs())`.
- Do not read `writer.options`; use writer fields `maxQuarantinedReady`, `maxBacklogAgeMs`, and `durableOptions`.
- If `status()` observes an expired held lease, synchronously call `transitionLeaseLost` before/while returning status. That clears admission/mutation timers and changes reason to `SCHEDULER_LEASE_LOST`.
- Closed DB status is cache-only: no SQLite after `_datDatabaseClosing`.

- [ ] **Step 2: Timers**

Implement timer helpers with exact split:

- `clearMutationTimers()` clears wake, heartbeat, retry/continuation, and reconcile timers. It does not clear standby acquisition poll when called from lease-loss.
- `clearPollTimer()` clears only acquisition poll.
- `clearGraceTimer()` clears only shutdown grace.
- `clearAllTimers()` calls `clearMutationTimers()`, `clearPollTimer()`, and `clearGraceTimer()`.
- Lease loss alone: `clearMutationTimers()` then ensure exactly one standby poll when not manual/stopping/stopped.
- Fatal, crash, beginStop, stop, startup failure cleanup, and DB-close: `clearAllTimers()`.
- `manualDrain:true` never arms poll, wake, heartbeat, continuation, or reconcile timers.

- [ ] **Step 3: Startup**

Copy parent startup ordering but apply these V13 corrections:

1. Acquire lease in one immediate UoW.
2. `effective = recordEffectiveNowInCurrentUow(token, candidateNow)`.
3. `reducer.initializeCombatSeed(token, effective)`.
4. `store.assertAccountDependencyIntegrity(token, effective)`.
5. Preview expired RUNNING rows with a Task6-owned read-only Store helper or exact SQL under the live lease. If preview count is nonzero, call `markDurableMutationInCurrentUow(mutation, effective)` before `recoverExpiredRunning`; recovery is the first durable mutation and must be marked before it.
6. Call `store.recoverExpiredRunning(token, effective, retryPolicy)`.
7. Stage resumable owned RUNNING job IDs inside the transaction; do not queue or arm timers precommit.
8. Immediately before commit, refresh effective time, rebase every staged lock with `resumeOwnedRunning(token, jobId, freshEffective, leaseMs)`, assert each resulting `locked_until_ms > freshEffective`, then final lease fence.
9. Commit, assign `this.leaseToken`, then publish staged queues/timers exactly once.

Startup failure unwind:

- Release same committed token if one exists; guard release catch/log so original error is preserved.
- State/reason after startup dependency/seed failures is `SCHEDULER_STARTUP_FAILED` unless stop requested or fatal/lease-loss path applies.
- `clearAllTimers()` completes cleanup; no poll resurrection on stop-requested branch.

---

## Task 3: Claim, global classification, watermark, and accepted downstream lifecycle

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Test: parent tests 4-29, 36-44, 46, 53-56; overlay tests 1, 2, and 3

**Interfaces:**

- Consumes: live reducer ABI and accepted Task5 protocol.
- Produces: `takeNextJob`, `claimFirstBarrierForDrain`, `executeClaimedInCurrentUow`, `applyClaimed`, `settleClaimFailure`.

- [ ] **Step 1: Claim helpers**

Copy parent `takeNextJob` from parent lines 13920-14020 with V13 corrections:

- `partialQueue` contains string job IDs only.
- Rotate watermark-ineligible partial IDs to the tail; do not drop them.
- Use `this.leaseMs`, not `options.lockMs`.
- Execute `recordEffectiveNowInCurrentUow` inside the claim UoW.
- Call `callFaultHook('before-claim', rowOrNull)` inside the claim UoW before `resumeOwnedRunning` or `claimNext`.
- For account claims, return raw claimed row; the effect path brands it with `loadExecutableJob`.

Global first classification:

- Recompute global first row inside an immediate UoW after effective time is recorded.
- Classify:
  - owned RUNNING global: resume with `resumeOwnedRunning`.
  - eligible PENDING/RETRY_WAIT global: claim with live `claimForResolution(token, id, nowMs, leaseMs, {nowS})`.
  - future RETRY_WAIT or QUARANTINED first root: `{claimed:null, blocked:true, allowAccount:true}` so account work may proceed only through watermark.
  - foreign RUNNING first root: `{claimed:null, blocked:true, allowAccount:false}`.
- Call `callFaultHook('before-claim', row)` inside the same claim UoW before resume/claim.
- After the claim UoW commits, call `callFaultHook('after-claim', claimed)` immediately before opening the effect UoW.

- [ ] **Step 2: Downstream claimed-job order**

Use accepted Task5 remediation lines 825-833 exactly:

1. Open accepted `BEGIN IMMEDIATE`, create live mutation token, enter `world.trongMutationScheduler`, assert lease, and Store-load executable.
2. `markDurableMutationInCurrentUow(mutation, nowMs)` exactly once before barrier, reducer prepare, or staged save.
3. For global job, run `advanceBarrier`; if it returns already-parked `{blockedExternal:true, blockedExternalJobId}`, do not call `parkGlobalBehindPreceding` again. Return reordered/partial result and record the barrier advance.
4. Determine `alreadyCommitted = store.hasCommittedApplication(...)`. If false, require/decrement exactly one external primitive; if true, charge zero.
5. Call `reducer.prepare` for every executable that reaches classification, including already committed global applications. The only exception is unapplied global with zero remaining budget; it returns barrier partial before prepare.
6. For account partial, call `reducer.applyPrepared(mutation, prepared)` once and validate exact two-key wrapper/receipt identity. Established-zero does no checkpoint/block/application/terminal and preserves same RUNNING lock tuple.
7. For prepared, call `store.insertApplication` even on replay to revalidate bytes; call `applyPrepared` only when not already applied; terminalize with exactly one of `finishResolved`, `completeAccountAdvanceAndScheduleSuccessor`, or `completeApplied`.
8. No manual/post-apply World flush. Final lease fence occurs before commit and no durable write follows it.

- [ ] **Step 3: Failure settlement**

Implement settlement with V13 ordering:

- Short-circuit before settlement:
  - `INJECTED_CRASH`: rethrow untouched; no settlement.
  - original `LEASE_LOST`: transition lease lost; rethrow original.
  - original fatal storage: transition storage fatal; rethrow original.
- Ordinary failure opens a fresh immediate settlement UoW, refreshes effective time, reloads by job id, brands with `loadExecutableJob`, then calls `store.fail(token, executable, original, nowMs, policy)`.
- If branding fails due payload integrity, use Task6-owned `quarantineClaimedRaw(token, raw, original, nowMs)`.
- If row is missing, preserve original failure semantics and rethrow original.
- If settlement itself fails fatal storage, call `transitionStorageFatal(settlementError)` but rethrow original reducer error unchanged.
- If settlement itself fails lease loss, transition lease lost but rethrow original reducer error unchanged.

Add Store primitive `quarantineClaimedRaw` exactly as overlay test 3 describes: no payload parse, lease-fenced SQL, safe fields only, attempt preservation.

---

## Task 4: Commands, direct account continuation, advance-due, and reconcile

**Files:**

- Modify: `server/scheduler/writer.js`
- Modify: `server/scheduler/store.js`
- Test: parent tests 11-14, 31, 36-44, 58-61, 65; overlay tests 5 and 7

**Interfaces:**

- Produces: `runCommand`, `advanceTo`, writer-owned `advanceDueInCurrentUow`, direct retarget Store primitive.

- [ ] **Step 1: Command UoW**

Copy parent command flow from lines 14595-14870 with corrections:

- `runCommand` validates before enqueue/UoW/marker.
- It derives time internally; caller supplies no `nowMs`.
- Durable marker happens inside the owning command UoW before barrier, account advance, or closure write.
- Use live `world._schedulerActive(mutation)` in `withCommandWorldBatchInCurrentUow`; do not reference `_mutationContexts`.
- Thenable return throws exact `UNIT_OF_WORK_ASYNC`.
- On barrier/account/due partial, return a defined `{deferred:true, code:'TICK_PARTIAL'}` or exact public partial and never run closure.
- Account finalizer executes inside the owning UoW before final fence and commit, including partial finalizers.
- Postcommit scheduling:
  - If `manualDrain`, never arm implicit continuation.
  - If not manual and a committed partial job id exists, enqueue it once.
  - If no job id but committed response is deferred, call `enqueueBudgetContinuationIfDue`.

- [ ] **Step 2: Reconcile**

Implement parent reconcile gate:

- If no `reconciler` or missing `reconcile` function, return/reject `SCHEDULER_RECONCILER_UNAVAILABLE` before enqueue, durable marker, or DB write.
- If installed, writer does not wrap it in a parent UoW. The reconciler owns its page UoWs in Task9.
- Metrics record reconcile success/error around the external reconciler call only.

- [ ] **Step 3: Advance-due without World method**

Replace parent `world.advanceDueNoiBo` call with Task6-owned writer helper:

```js
SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, nowS, limit) {
  // Use live kho.q.dqDenHan with limit + 1 or rescan.
  // For each selected account <= limit, call:
  // this.world.advanceAccountNoiBo(mutation, accountId, nowS, saveOptions)
  // with normal save options and the active mutation.
};
```

Rules:

- `limit` default is 60.
- Query `limit + 1` rows or rescan after `limit` to prove `hasMoreDue`.
- 61 due accounts with limit 60 yields partial/TICK_PARTIAL and closure count 0.
- If direct account result has `deferredExternal:true`, return fields needed to block/adopt continuation and enqueue postcommit.

- [ ] **Step 4: Direct external retarget**

Add `retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)` to `store.js`:

- Validate job first; matching-key persisted identity/canonical contradiction maps `PAYLOAD_INTEGRITY`.
- Return `null` for absent same key, including wrong account/revision supplied.
- Conflict on RUNNING, blocked, terminal, or sibling conflict after successful validation.
- Retarget only exact same idempotency key, account, revision, unblocked PENDING/RETRY_WAIT row.
- Regenerate canonical payload JSON/SHA and scheduled time; preserve id, key, sequence, priority, attempt, max attempts.
- Lease-fence SQL by owner/generation/expires.

Caller:

- Use retarget when external-only/direct result has same-key local wake but dependency-safe target differs.
- If retarget returns null, call `replaceAccountAdvance` once as create fallback.
- Never accept an unrelated pre-existing blocked row from `replaceAccountAdvance`; return conflict/deferred result and record no success.
- If exact same dependency already blocks the wake, record no job metric. If newly adopted/blocked, finalizer records one metric.

---

## Task 5: Factory/index, cutover, and CLI

**Files:**

- Create: `server/scheduler/index.js`
- Create: `server/scheduler/cutover.js`
- Create: `tools/scheduler-cutover.js`
- Test: parent tests 2-3, 9-10, 62-66

**Interfaces:**

- Produces:
  - `server/scheduler/index.js` exports exact parent set: `taoScheduler`, `inRange`, `resolveDurableSchedulerOptions`
  - `server/scheduler/writer.js` exports `{SchedulerWriter}`
  - `server/scheduler/cutover.js` exports `{runMaintenanceCutover}`
  - `tools/scheduler-cutover.js` exports `{parseArgs, runCli, main}`

- [ ] **Step 1: Factory/index**

Copy parent `taoScheduler` from lines 14870-15249 with these exact context shapes:

- Production six-key: `clock,env,kho,logger,schedulerOptions,tg`
- Production-test seven-key: `clock,env,kho,logger,makeOwnerId,schedulerOptions,tg`
- Direct eight-key: `advanceService,clock,logger,reducer,schedulerOptions,store,world,writer`

Bridge:

- Enumerable keys: `advanceTo`, `cancel`, `getStatus`, `reconcile`, `runCommand`, `schedule`, `start`, `stop`.
- `getStatus` calls `writer.status()`.
- Private non-enumerable descriptors: `_datSignalHandlerInstalled`, `_waitForStopFinalization`, `_beginStop`, `_datDatabaseClosing`.
- `_datSignalHandlerInstalled` is a function accepting `installed`.
- `_beginStop` calls `writer.beginStop()`.
- `_datDatabaseClosing` delegates to writer DB-close cache path from Task 2.

- [ ] **Step 2: Cutover**

Copy parent cutover from lines 15250-15333:

- `runMaintenanceCutover(context)` receives only `{kho, clock, ownerId}`.
- Validate context and owner before migration.
- Call `apDungMigrationScheduler(context.kho, context.clock.nowMs())` before constructing Store.
- Construct `new SchedulerStore(context.kho, context.clock)`.
- Use `context.kho.trongGiaoDich(fn, {immediate:true})`.
- Use literal lease `15_000` or a named constant equal to `15000`.
- Reject non-legacy mode with `SCHEDULER_CUTOVER_ALREADY_DURABLE`.
- Reject nonempty `dq` with `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`.
- Acquire fresh owner lease.
- Seed only `combat_seed_key_v1` and validate lowercase 64-hex.
- Set mode durable and write audit `CUTOVER` detail `fresh-only`.
- Return exactly `{mode:'durable', imported:0, recovered:0}` for Task6 fresh-only.
- Release the same token in `finally`; if release throws after a primary error, log safely and preserve primary error.

- [ ] **Step 3: CLI**

`tools/scheduler-cutover.js`:

- `parseArgs(argv)` accepts exactly `--db <path> --action cutover`; rejects duplicates, missing values, unknown flags, and extra operands.
- Use live `taoClock()` from `server/clock.js`.
- Open `Kho` only after validation.
- Call `runMaintenanceCutover({kho, clock, ownerId})`.
- Close with `kho.dong()` in `finally` if opened.
- `runCli(argv, env, io, deps)` returns exactly `{exitCode, stdout, stderr}` and also writes through injected `io` streams consistently with those fields.
- Safe error output never includes payload/state/account data.
- `main(argv, env, io, deps)` sets `process.exitCode`, returns result, and never calls `process.exit`.
- Require-main:

```js
if (require.main === module) {
  main(process.argv.slice(2), process.env, {
    stdout: process.stdout,
    stderr: process.stderr
  }, {});
}
```

---

## Task 6: GREEN waves

Run the tests normally after frozen RED evidence. Do not append to RED evidence during GREEN.

Recommended waves:

1. Parent tests 1-3 plus overlay 4: constructor/status/timers/private seams.
2. Parent tests 30-35, 45, 57 plus overlay 6: lease/startup/heartbeat/takeover.
3. Parent tests 4-29 plus overlay 1-2: global/account downstream and Task5 compatibility.
4. Parent tests 36-44, 58-61 plus overlay 5 and 7: MutationGate/direct/retarget/due boundary.
5. Parent tests 47-56: retry/quarantine/logging/fault rollback.
6. Parent tests 62-66 plus cutover/CLI assertions: factory/index/cutover.

Commands:

```bash
node --test --test-isolation=none --test-reporter=tap --test-name-pattern 'Task 6' \
  tools/test-scheduler.js
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v13-final-scheduler.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v13-final-scheduler-throw-deprecation.tap
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
```

Expected final normal and throw-deprecation TAP:

```bash
grep -E '^# tests 236$' /tmp/task6-v13-final-scheduler.tap
grep -E '^# pass 235$' /tmp/task6-v13-final-scheduler.tap
grep -E '^# fail 0$' /tmp/task6-v13-final-scheduler.tap
grep -E '^# skipped 1$' /tmp/task6-v13-final-scheduler.tap
grep -E '^# tests 236$' /tmp/task6-v13-final-scheduler-throw-deprecation.tap
grep -E '^# pass 235$' /tmp/task6-v13-final-scheduler-throw-deprecation.tap
grep -E '^# fail 0$' /tmp/task6-v13-final-scheduler-throw-deprecation.tap
grep -E '^# skipped 1$' /tmp/task6-v13-final-scheduler-throw-deprecation.tap
```

Whitespace checks must not fail on no-match:

```bash
if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js \
    server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js \
    tools/test-scheduler.js docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md; then
  exit 1
fi
```

---

## Task 7: Scope, report, Stage-A/Stage-B validation, and genuine reviews

**Files:**

- Create: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`

### Scope order

Create the real report directory and draft report before post-inventory so the allowlist is deterministic:

```bash
mkdir -p docs/superpowers/reports
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
: > docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
chmod 0755 docs/superpowers/reports
chmod 0644 docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

Normalized inventory must compare type, symlink target, content hash, size, filesystem mode, and tracked mode for every tracked/untracked repo path. Allowed differences are exactly six owned files plus the exact report directory/file. Empty directories are not repository content; directory symlinks are content and must be rejected.

### Stage-A draft validation

Draft report must contain:

- V13 plan hash from `/tmp/task6-active-plan.sha256`
- RED evidence hash from `/tmp/task6-v13-red-evidence.sha256`
- Six-file metadata: path, type, filesystem mode, tracked mode, size, SHA256
- Normal TAP output 236/235/0/1
- Throw-deprecation TAP output 236/235/0/1
- node-check output for all five JS implementation files
- baseline prefix/name guard output
- whitespace check output
- normalized inventory/scope output
- report directory/file type and mode proof
- statement that report is excluded from the six-file review seal

Stage-A validates every draft claim and both hashes:

```bash
sha256sum -c /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-v13-red-evidence.sha256
test -s docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
```

### Fresh reviews

Launch two distinct fresh collaboration review agents with model `gpt-5.6-sol` and effort `high` over exact:

- V13 plan path and hash
- `/tmp/task6-v13-red-evidence.tap` hash
- six-file hash/metadata seal
- final normal and throw-deprecation TAP files
- draft report

Any implementation/test/source change after a review invalidates both reviews and requires new six-file hashes plus two fresh reviews.

Review identity is not provable from text lines alone. The root/implementer must actually launch the collaboration agents and record tool results. The report validation can only check structured report lines; completion additionally requires the actual tool outcomes to exist in the session/log.

After both genuine PASS outcomes, append exactly:

```text
Reviewer 1: identity=<distinct-tool-agent-id-1> model=gpt-5.6-sol effort=high outcome=PASS
Reviewer 2: identity=<distinct-tool-agent-id-2> model=gpt-5.6-sol effort=high outcome=PASS
```

### Stage-B final validation

Stage-B reruns Stage-A plus:

- exactly two reviewer lines
- distinct identities
- exact `model=gpt-5.6-sol`
- exact `effort=high`
- exact `outcome=PASS`
- current six file hashes/metadata still equal reviewed seal
- report path is real non-symlink file mode `100644`
- report directory is real non-symlink directory mode `040755`
- active plan and RED evidence hashes still pass `sha256sum -c`
- normalized inventory/scope still passes
- git tracked modes still match the pre/post allowlist

Reviewer structured-line validation:

```bash
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
python3 - <<'PY' "$report"
import re, sys
text = open(sys.argv[1], encoding='utf8').read()
rows = re.findall(r'^Reviewer [12]: identity=([^ ]+) model=([^ ]+) effort=([^ ]+) outcome=([^ ]+)$', text, re.M)
if len(rows) != 2:
    raise SystemExit('REVIEWER_LINE_COUNT_INVALID')
ids = [row[0] for row in rows]
if len(set(ids)) != 2:
    raise SystemExit('REVIEWER_IDENTITIES_NOT_DISTINCT')
for identity, model, effort, outcome in rows:
    if model != 'gpt-5.6-sol' or effort != 'high' or outcome != 'PASS':
        raise SystemExit('REVIEWER_LINE_INVALID')
PY
```

---

## Self-audit checklist

- [ ] Parent 66 Task6 test definitions are included as the minimum, with fixtures/assertions preserved/adapted from parent lines 10866-13047.
- [ ] Overlay is exactly 7 tests; report/seal workflow is not a node:test case.
- [ ] Expected final total is 236/235/0/1 from baseline 163/162/0/1 plus N=73.
- [ ] Status helpers are faithful extraction of parent status logic, internal to writer, deep-cloning nested metric structures and validating before normalization.
- [ ] Expired held lease observed by `status()` transitions synchronously to lease lost and clears admission/timers.
- [ ] `partialQueue` stores string IDs and rotates watermark-ineligible partials.
- [ ] Global first classification covers owned RUNNING, future RETRY_WAIT, QUARANTINED, and foreign RUNNING.
- [ ] Startup marker precedes `recoverExpiredRunning` when preview indicates recovery mutations, and staged locks are rebased before final fence/commit.
- [ ] Claimed-job lifecycle follows Task5 remediation lines 825-833 exactly.
- [ ] Command thenable error is `UNIT_OF_WORK_ASYNC`.
- [ ] Account finalizer executes inside the owning UoW before final fence, including partial finalizers.
- [ ] Reconcile missing seam rejects before enqueue/DB; installed reconciler owns Task9 page UoWs.
- [ ] Cutover uses parent fresh-only snippet and live `context.kho.trongGiaoDich(fn,{immediate:true})`.
- [ ] CLI uses live `taoClock()` and `kho.dong()`, returns `{exitCode,stdout,stderr}`, and never calls `process.exit`.
- [ ] Factory context keys and exports follow direct parent inspection.
- [ ] RED evidence refuses overwrite unless pre-proof cleanup is explicitly chosen, and Stage-A/B both verify its hash.
- [ ] Stage-A validates draft claims before reviews; Stage-B validates reviewer lines and reruns all seals.
- [ ] No un-negated `rg` whitespace check remains.
