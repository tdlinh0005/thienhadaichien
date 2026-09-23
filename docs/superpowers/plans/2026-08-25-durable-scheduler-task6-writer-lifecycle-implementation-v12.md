# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V12

> **For implementers:** Use `superpowers:executing-plans` to execute this file task-by-task. Use `superpowers:test-driven-development` before every implementation wave and `superpowers:verification-before-completion` before reporting completion. This V12 file is immutable after `/tmp/task6-active-plan.sha256` is captured.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global-first drain, watermark, retry/backoff/quarantine, command MutationGate, direct-account continuation, maintenance cutover, CLI, and Task7-private lifecycle seams on the accepted Tasks 1-5 foundation.

**Architecture:** A single leased `SchedulerWriter` owns all durable scheduler writes. Every advance/reducer/command mutation runs inside an existing immediate SQLite UoW and inside `world.trongMutationScheduler(mutation, fn)`. Public access is through `taoScheduler(context)` in `server/scheduler/index.js`; Store and writer internals stay private except for explicitly owned Task6 primitives.

**Tech stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Primary spec:** Task 6 begins around line 10866 of `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md`. Exact parent bridge/factory API is around lines 14980-15215. Accepted Task5 downstream protocol is lines 825-833 of `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`.

## Direct inspection baseline

This V12 plan is based on direct inspection of the live parent and source seams:

- V11 active-plan SHA that failed review: `c4cd7370717f764a532de5df5bee14222ae3d430be8e8c6990ac917bcb5109a6`.
- Live `server/scheduler/store.js` has `recordEffectiveNowMs`, `acquireLease`, `renewLease`, `releaseLease`, `claimNext`, `claimForResolution`, `resumeOwnedRunning`, `loadExecutableJob`, `insertApplication`, `checkpointPartial`, `markDurableMutation`, `completeApplied`, `finishResolved`, `completeAccountAdvanceAndScheduleSuccessor`, `fail`, `recoverExpiredRunning`, `statusSnapshot`, `listBarrierJobsAtOrBefore`, `adoptAccountAdvanceForCommand`, `replaceAccountAdvance`, `blockOwnedAccountAdvance`, `parkGlobalBehindPreceding`, and `assertAccountDependencyIntegrity`.
- Live `server/scheduler/reducers.js` has `initializeCombatSeed(leaseToken, effectiveNowMs)`, `prepare(mutation, executableJob, options)` with only option key `executionTargetS`, and `applyPrepared(mutation, prepared)`.
- Live Task5 partials are exact: `prepareAccount` returns `kind:'partial'` with `advanceResult`, `saveReceipt`, and `apply()` returning exactly `{checkpointRevision, saveReceipt}`. `effect.saveReceipt === prepared.saveReceipt === prepared.advanceResult.saveReceipt` is part of the accepted contract.
- Live `GameAdvanceService.advanceBarrier` already calls `store.parkGlobalBehindPreceding(...)` and returns `blockedExternal:true` plus `blockedExternalJobId`. Writer must recognize that already-parked result and must not call `parkGlobalBehindPreceding` a second time.
- Live `TheGioi` has `trongMutationScheduler(mutation, fn)`, `_schedulerActive(mutation)`, and `advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)`. It has no `advanceDueNoiBo`; Task6 must not edit `server/world.js`.
- Live `world._dongBoSchedulerLuu` calls `store.replaceAccountAdvance` unless `currentAccountAdvanceJobId` or `deferAccountWake` is set. Direct account command paths must not pass `deferAccountWake:true` on normal World saves.
- Live `server/db.js` has `kho.q.dqDenHan` as `SELECT tk FROM dq WHERE keTiep<=? ORDER BY keTiep,tk LIMIT ?`.
- Parent bridge exposes enumerable keys `start`, `stop`, `getStatus`, `runCommand`, `schedule`, `cancel`, `reconcile`, and `advanceTo`; `getStatus` calls `writer.status()`, not `writer.getStatus()`.
- Parent bridge private seams are non-enumerable descriptors: `_datSignalHandlerInstalled(installed)`, `_waitForStopFinalization`, `_beginStop`, and `_datDatabaseClosing`.
- Parent writer has `takeNextJob(token, nowMs, watermarkS)`. V12 must use and extend that exact name; do not invent `takeNextAccountJob`.
- Parent cutover is fresh-only: migration before Store construction, validate legacy mode, reject nonempty legacy `dq`, seed only `combat_seed_key_v1`, audit `CUTOVER`, release the same lease token in `finally`, and separate function return from CLI behavior.

## Global constraints and owned scope

- Preserve V1-V11 plan artifacts. This planning task creates only this V12 file.
- Implementation may edit exactly these six Task6-owned source/test files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact implementation report path: `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- Task7+ and non-owned files are forbidden, including `server/app.js`, `server/api.js`, `server/world.js`, `server/index.js`, `server/contract.js`, `server/scheduler/contract.js`, `public/game.html`, `public/game.js`, `public/game.css`, `dist/thienhadaichien.bin`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, `package.json`, `package-lock.json`, `README.md`, every `js/*.js`, and `web/js/mp.js`.
- The report and `docs/superpowers/reports` directory are verification artifacts, not part of the six-file source/test seal.
- No report self-hash. No plan self-hash embedded in this file. Implementation captures the V12 hash externally after the plan is frozen.
- Accepted scheduler suite baseline is exactly 163 tests: 162 passed, 0 failed, 1 skipped. Task6 V12 adds exactly 42 production tests. Expected final scheduler output is 205 tests, 204 passed, 0 failed, 1 skipped. If the preflight baseline is not exactly 163/162/0/1, stop and report drift before implementation.
- All new files must be real regular files, non-symlinks, filesystem type/mode `100644` (`stat` regular file plus `0644`). If a new file is staged, git tracked mode must be `100644`; if left untracked, tracked mode is recorded as `-`. Existing tracked paths must keep their original tracked mode.

## V12 correction ledger

1. Status is internal to `writer.js`: define `computeOpenStatusFromStore(writer)`, `canonicalSchedulerStatus(status)`, and `cloneSchedulerStatus(status)` in `writer.js` or exact inline equivalents. Do not depend on `metrics.js`.
2. Timer cleanup is exact: `clearMutationTimers` omits only the standby acquisition poll for lease-loss; `clearAllTimers` clears mutation, poll, and grace timers. Fatal, crash, beginStop, stop, and DB-close paths call `clearAllTimers`. Lease-loss alone calls `clearMutationTimers()` and then ensures exactly one acquisition poll.
3. Claim path uses parent `takeNextJob`. Global and account paths call `callFaultHook('before-claim', ...)` inside the claim UoW before the SQL claim/resume, and `callFaultHook('after-claim', claimed)` immediately after the claim UoW commits and before any effect UoW opens.
4. Initial RED evidence is collected exactly once into `/tmp/task6-v12-red-evidence.tap`, frozen, and hashed. Later TDD waves run tests normally and never append to that evidence file.
5. Cases 41-42 are production obligations, not scope/report tests. Scope/report/seal are verification commands outside the 42 node:test additions.
6. The 42-case manifest contains names, sentinels, fixtures, and assertions. It covers owner UUID, factory options/cache/exports, one-writer/takeover, manual drain, lifecycle, timers/status/logs, same-T ordering, exact shared budgets, exact-zero macrotask/wake behavior, earlier-wake replacement, rejected-tail recovery, retry/backoff/jitter/quarantine, public schedule/cancel/advanceTo/reconcile/runCommand, cutover/CLI, global/account downstream, crash chronology, direct paths, retarget, settlement, and watermark.
7. Final added-test guard derives expected 42 names from the manifest artifact, derives actual `Task 6 v12 ` names from TAP, sorts both, checks exact diff, `wc=42`, and no duplicates. Baseline final excludes exact prefix `Task 6 v12 ` and compares the original 163 TAP names and prefix byte hash.
8. Review/report sequencing is two-stage: Stage-A validates draft report and seals before approvals; two distinct fresh Sol/high reviewers review exact six hashes, V12 plan hash, and RED evidence hash; only after both genuine PASS are reviewer lines appended and Stage-B validation run.
9. Stage-B requires exactly two distinct reviewer identities with exact `model=gpt-5.6-sol`, `effort=high`, and `outcome=PASS`.
10. Report directory must be real non-symlink mode `0755`; report file must be real non-symlink mode `0644`. Plan and six files must be real non-symlink paths with exact type/mode/content metadata.
11. Whitespace guards use `if rg ...; then exit 1; fi`; no un-negated no-match command is allowed.
12. Cutover and CLI contracts are fully specified below: migration before Store, context/owner validation, fresh lease, legacy/nonempty `dq` reconciliation guard, seed only combat seed, durable mode/audit `CUTOVER`, recovery count, same-token release with original error preservation, validated open/close CLI behavior, safe errors, exact exports, and no `process.exit`.
13. All V1-V11 logic fixes remain binding: metric one owner, Task5 downstream protocol, partial shape validation, prepare-before-idempotency, already-parked global recognition, raw quarantine, startup rebase, global effective claim, retarget, settlement fatal handling, final fences, private seams, and report review seal.

---

## Task 1: Preflight, baseline, manifest, one-time RED evidence, and scope inventory

**Owned files in this task:** append only to `tools/test-scheduler.js` after the V12 marker. Create no production source yet.

### 1.1 Pin V12 externally

Run before any implementation edit:

```bash
plan='docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v12.md'
test -f "$plan"
test ! -L "$plan"
python3 - <<'PY' "$plan"
import os, stat, subprocess, sys
path = sys.argv[1]
st = os.lstat(path)
mode = stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode)
if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
    raise SystemExit('active plan must be a real regular file')
if format(mode, '06o') != '100644':
    raise SystemExit('active plan must have filesystem type/mode 100644')
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, p = record.split(b'\t', 1)
    tracked[p.decode()] = meta.split()[0].decode()
tm = tracked.get(path, '-')
if tm not in ('-', '100644'):
    raise SystemExit('active plan tracked mode invalid: ' + tm)
print(path + '\tfile\t' + tm + '\t100644')
PY
sha256sum "$plan" > /tmp/task6-active-plan.sha256
sha256sum -c /tmp/task6-active-plan.sha256
```

Do not modify V12 after this command. The plan is not in any mutable allowlist.

### 1.2 Capture accepted baseline and append-only prefix

Run before modifying `tools/test-scheduler.js`:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v12-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v12-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v12-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v12-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v12-baseline.tap
node - <<'NODE' /tmp/task6-v12-baseline.tap > /tmp/task6-v12-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v12-baseline-names.txt > /tmp/task6-v12-baseline-names.sha256
node - <<'NODE' > /tmp/task6-v12-test-prefix.tsv
const fs = require('fs');
const crypto = require('crypto');
const path = 'tools/test-scheduler.js';
const marker = '// TASK6_V12_TESTS_APPEND_ONLY_START';
const bytes = fs.readFileSync(path);
if (bytes.includes(Buffer.from(marker))) throw new Error('TASK6_V12_MARKER_ALREADY_PRESENT');
console.log([bytes.length, crypto.createHash('sha256').update(bytes).digest('hex')].join('\t'));
NODE
```

Task6 tests are appended after exactly:

```js
// TASK6_V12_TESTS_APPEND_ONLY_START
```

No pre-marker byte may change.

### 1.3 Add the exact 42-case manifest and lazy RED tests

In `tools/test-scheduler.js`, add a JSON manifest bracketed by:

```js
// TASK6_V12_MANIFEST_JSON_START
// TASK6_V12_MANIFEST_JSON_END
```

The test file must parse this single manifest; do not duplicate names in a second table. Every test name has exact prefix `Task 6 v12 `. Every test lazy-requires Task6 modules inside its own subtest. Every test wraps fixture/import/assertion errors with its unique sentinel so loader failure cannot pass and cannot hide the selected failing subtest:

```js
test(entry.name, function () {
  try {
    // Lazy requires go here, inside the named subtest.
    // Assertions implement entry.assertions.
  } catch (error) {
    error.message = entry.sentinel + ': ' + (error && error.message || error);
    throw error;
  }
});
```

The exact manifest is:

| # | Name | Sentinel | Fixture and assertions |
|---:|---|---|---|
| 1 | Task 6 v12 owner UUID legacy mode and factory exports are exact | TASK6V12_RED_001_OWNER_FACTORY | Invalid owner IDs are rejected before mutation; legacy scheduler mode blocks `start` with `SCHEDULER_MODE_LEGACY`; `taoScheduler` enumerable keys sort to `advanceTo,cancel,getStatus,reconcile,runCommand,schedule,start,stop`; module exports are exact and cache writer per context. |
| 2 | Task 6 v12 factory options cache bridge status and private descriptors are exact | TASK6V12_RED_002_FACTORY_STATUS | Foundation options are exactly `clock`, `logger`, `schedulerOptions`; durable env wiring is accepted; private seams are non-enumerable; `_datSignalHandlerInstalled` is a function; `getStatus()` delegates to `writer.status()` and returns a clone. |
| 3 | Task 6 v12 one writer takeover standby poll and manual drain are exact | TASK6V12_RED_003_TAKEOVER_MANUAL | Two owners contend; only one lease is active; standby has exactly one acquisition poll; manual drain runs synchronously without wake/poll accumulation and honors admission fence. |
| 4 | Task 6 v12 startup recovery integrity staged ids and lock rebase are exact | TASK6V12_RED_004_STARTUP_REBASE | Startup order is acquire, effective time, `initializeCombatSeed(token, nowMs)`, `recoverExpiredRunning(token, nowMs, policy)`, conditional `markDurableMutation(token, nowMs)`, `assertAccountDependencyIntegrity(token, nowMs)`, stage resumed IDs, refresh effective time, rebase locks, final lease fence, commit, then publish timers once. |
| 5 | Task 6 v12 startup failure unwind releases lease and preserves original | TASK6V12_RED_005_STARTUP_FAILED | Inject failures after acquire, seed, and dependency integrity; writer releases same token when possible; release error is logged but original error/reason `SCHEDULER_STARTUP_FAILED` is retained; state/timers/poll are cleaned; stop-requested branch does not resurrect. |
| 6 | Task 6 v12 heartbeat lease loss timer split and no resurrection are exact | TASK6V12_RED_006_HEARTBEAT_LEASE | Transient heartbeat failure rearms heartbeat; lease loss clears mutation timers, keeps/ensures exactly one standby poll, sets reason `SCHEDULER_LEASE_LOST`, and late failures during stopping/stopped/finalization are ignored idempotently. |
| 7 | Task 6 v12 fatal crash status logs and all timer cleanup are exact | TASK6V12_RED_007_FATAL_TIMERS | Fatal storage and injected crash set lowercase terminal states, SCHEDULER reason, safe scrubbed logs, and call `clearAllTimers`; no mutation/retry/poll/grace timer fires afterward. |
| 8 | Task 6 v12 shutdown beginStop DB close cache and signal seams are exact | TASK6V12_RED_008_SHUTDOWN_DB_CLOSE | `_beginStop` reaches `beginStop` and `clearAllTimers`; `_waitForStopFinalization` resolves after bounded grace; `_datDatabaseClosing` captures status before closing, stores cache, and every later status is cache-only with `ready:false`, `dbOpen:false`, reason `SCHEDULER_DB_CLOSED`, no SQLite call. |
| 9 | Task 6 v12 runMaintenanceCutover fresh lease audit recovery and release are exact | TASK6V12_RED_009_CUTOVER | Cutover validates context/owner, applies migration before Store, rejects nonlegacy and nonempty `dq`, acquires fresh lease, seeds only combat seed, writes durable mode and `CUTOVER` audit, runs recovery semantics, final fences, releases same token in `finally`, and returns exact object. |
| 10 | Task 6 v12 scheduler cutover CLI grammar output and close behavior are exact | TASK6V12_RED_010_CLI | CLI grammar accepts only `--db <path> --action cutover`; opens Kho only after validation; closes in `finally`; returns exitCode/stdout/stderr without `process.exit`; require-main calls `main(process.argv.slice(2), process.env, {stdout,stderr}, {})`; exports are exact. |
| 11 | Task 6 v12 public schedule cancel advanceTo reconcile use MutationGate fences | TASK6V12_RED_011_PUBLIC_SURFACES | Public `schedule`, `cancel`, `advanceTo`, and `reconcile` each open an immediate UoW, derive effective time inside, enter `world.trongMutationScheduler`, call Store live-lease fences before commit, and return exact success/cancel/reconcile summaries. |
| 12 | Task 6 v12 runCommand admission derives time internally and fences every exit | TASK6V12_RED_012_RUNCOMMAND_ADMISSION | `runCommand({name,accountId?,run})` derives monotonic time internally, never accepts caller time, admits only when writer lease/status is ready, and final-fences success, partial, account-delete, advance-due, closure throw, and thenable exits. |
| 13 | Task 6 v12 before claim crash leaves no running row | TASK6V12_RED_013_BEFORE_CLAIM | `callFaultHook('before-claim', ...)` runs inside global/account claim UoW before SQL claim/resume; injected crash rolls back and leaves no RUNNING row. |
| 14 | Task 6 v12 after claim hook effective lock and global due recompute are exact | TASK6V12_RED_014_AFTER_CLAIM | Global eligibility is recomputed inside claim UoW after `recordEffectiveNowMs`; account `takeNextJob` uses effective now for `claimNext`; after-claim hook runs immediately after commit; backward wall-clock does not shorten locks. |
| 15 | Task 6 v12 after application crash restarts without duplicate effect | TASK6V12_RED_015_AFTER_APPLICATION | Crash after `insertApplication` commit but before effect causes restart to validate replay and skip duplicate effect while terminalizing once. |
| 16 | Task 6 v12 after game mutation crash rolls back application and world state | TASK6V12_RED_016_AFTER_GAME | Crash after `reducer.applyPrepared(mutation, prepared)` inside effect UoW rolls back both application/effect state and leaves row resumable. |
| 17 | Task 6 v12 before job completion generation flip rolls back effect UoW | TASK6V12_RED_017_BEFORE_COMPLETION | Crash/fence before completion after world mutation rolls back UoW when generation flips; no completed job without live lease. |
| 18 | Task 6 v12 already applied restart and stale generation effect are exact | TASK6V12_RED_018_REPLAY_STALE | Already-applied restart validates application hash and skips effect; stale-generation effect fails before commit and preserves original row. |
| 19 | Task 6 v12 global first drain claims barrier before account and parks once | TASK6V12_RED_019_GLOBAL_FIRST | Drain loop calls global claim helper before account `takeNextJob`; same due account/global chooses global; `advanceBarrier` already parks preceding root; total Store park call count is exactly one. |
| 20 | Task 6 v12 same second ordering zero budget and flat barrier are exact | TASK6V12_RED_020_ORDER_BUDGET | Same-T priority/sequence/id ordering re-queries after each claim; barrier fixed point is flat/non-recursive; exact budget cases 49,999 and 50,000 pass; zero global synthesizes `advanceResult` with processed inherited, advancedToS target, nextDueAtS target, hasMoreDue true, budgetExhausted true and records metrics. |
| 21 | Task 6 v12 earlier wake replacement rejected tail and exact zero wake are exact | TASK6V12_RED_021_WAKE_TAIL | Earlier account wake replaces later unblocked local wake without losing blocked dependency; rejected-tail recovery is retained; exact-zero macrotask/wake behavior leaves continuation in RUNNING or scheduled according to parent rules. |
| 22 | Task 6 v12 account partial effect shape keys and receipt identity are exact | TASK6V12_RED_022_PARTIAL_SHAPE | Partial effect must be a plain object with prototype `Object.prototype`, exactly two own enumerable string keys in order `checkpointRevision,saveReceipt`, no symbols/non-enumerables, and strict receipt identity across effect/prepared/advanceResult. |
| 23 | Task 6 v12 account partial blocked external uses advanceResult dependency | TASK6V12_RED_023_PARTIAL_BLOCK | `prepared.advanceResult.deferredExternal === true` and `blockedExternalJobId` drive `blockOwnedAccountAdvance`; no stale `prepared.deferredExternal`; blocked dependency and checkpoint revision are validated. |
| 24 | Task 6 v12 established zero partial retains running lock unchanged | TASK6V12_RED_024_ESTABLISHED_ZERO | Established-zero budget partial with no receipt is retained as RUNNING with original checkpoint/null retention and no application insert. |
| 25 | Task 6 v12 prepared global charges primitive once before idempotency insert | TASK6V12_RED_025_GLOBAL_CHARGE | Global reducer prepare runs before idempotency insert; external primitive charging happens once; committed ledger records mutation.recordAdvance and mutation.recordJob exact shapes before final fence. |
| 26 | Task 6 v12 prepared replay validates application and terminal mapping is exact | TASK6V12_RED_026_REPLAY_TERMINAL | Application replay validation catches hash/result mismatch; terminal success uses `completeApplied`; account success uses `completeAccountAdvanceAndScheduleSuccessor`; cancellation uses `finishResolved`; no unsupported Store methods. |
| 27 | Task 6 v12 account cancelled terminal is never deferred | TASK6V12_RED_027_CANCELLED_ACCOUNT | `ACCOUNT_ADVANCE` terminalState `CANCELLED` runs `finishResolved`/afterCancel before any deferred success finalizer and never returns a success finalizer. |
| 28 | Task 6 v12 deferred completed account records advance exactly once | TASK6V12_RED_028_DEFERRED_METRIC | Only `COMPLETED` account results are eligible for deferral; prepared `advanceResult` is recorded exactly once before finish/finalizer; helpers do not call `recordJob`. |
| 29 | Task 6 v12 settlement reloads executable then Store fail | TASK6V12_RED_029_SETTLEMENT_FAIL | Ordinary reducer failure opens a fresh settlement UoW, reloads/brands by job id, uses `store.fail(token, executable, error, nowMs, policy)` when valid, performs fresh-time lease check before commit, and rethrows original reducer error. |
| 30 | Task 6 v12 settlement raw corruption quarantines without payload parse | TASK6V12_RED_030_RAW_QUARANTINE | If reload fails payload integrity, `quarantineClaimedRaw` validates only safe raw id/generation/lease/state SQL fields, never parses payload, preserves attempt, sets terminal QUARANTINED safe fields, and lease-fences atomically. |
| 31 | Task 6 v12 settlement missing row injected lease and fatal originals are exact | TASK6V12_RED_031_SETTLEMENT_ORIGINALS | Missing fresh row preserves original failure semantics; `INJECTED_CRASH` rethrows untouched/no settlement; original `LEASE_LOST` transitions lease lost and rethrows; original fatal storage transitions storage fatal and rethrows. |
| 32 | Task 6 v12 settlement fatal storage during settlement transitions and rethrows original | TASK6V12_RED_032_SETTLEMENT_FATAL | If settlement itself fails with fatal storage, writer calls `transitionStorageFatal(settlementError)` while rethrowing the original reducer error unchanged; lease settlement errors follow lease-loss handling. |
| 33 | Task 6 v12 runCommand barrier partial persists TICK_PARTIAL and skips closure | TASK6V12_RED_033_COMMAND_BARRIER | `runCommand` inspects `advanceAccountInCurrentUow`/barrier result; on partial or deferredExternal it persists `TICK_PARTIAL`, returns a defined partial response, queues continuation after commit, and never invokes closure. |
| 34 | Task 6 v12 runCommand external account partial queues manual continuation after commit | TASK6V12_RED_034_COMMAND_EXTERNAL | External blocked direct account result includes `deferredExternal:true` plus dependency/job fields so public `advanceTo`/`runCommand` schedules immediate budget continuation when `partialJobId` is null, including manual mode. |
| 35 | Task 6 v12 runCommand thenable honesty and rollback boundary are exact | TASK6V12_RED_035_COMMAND_THENABLE | If `run` returns a thenable, rollback is guaranteed only after closure invocation; test wording asserts invocation occurred, UoW rolled back, and error is `WORLD_RULES_HOOK_ASYNC`. |
| 36 | Task 6 v12 account delete and adopted finalizers run exactly once | TASK6V12_RED_036_COMMAND_DELETE_ADOPT | Account-delete branch skips advance and runs `mutation.commandAccountFinalizer`; adopted success returns `accountFinalizer`; finalizer is invoked exactly once after commit and never on partial. |
| 37 | Task 6 v12 advance due 61 boundary returns partial and queues continuation | TASK6V12_RED_037_DUE_61 | Writer queries `dqDenHan` with limit+1 or rescans; 61 due accounts with limit 60 returns `partial:true`, `TICK_PARTIAL`, closure count 0, exact summary fields, and enqueues continuation. |
| 38 | Task 6 v12 direct completed successor and established zero metric owner are exact | TASK6V12_RED_038_DIRECT_SUCCESS_ZERO | Direct completed path uses normal `world.advanceAccountNoiBo` save options, preserves World-synchronized successor, and established-zero uses explicit continuation helper with exactly one metric owner. |
| 39 | Task 6 v12 external-only fallback schedules or retargets dependency-safe wake | TASK6V12_RED_039_EXTERNAL_WAKE | When save receipt is nonnull but no local wake is suitable, writer creates/replaces an `ACCOUNT_ADVANCE` at dependency-safe `nextDueAtS`; when same-key unblocked wake exists it retargets safely; no local event case is covered. |
| 40 | Task 6 v12 retarget rejects unrelated block validates identity and records one metric | TASK6V12_RED_040_RETARGET_BLOCK | Retarget absent same key returns null and caller falls back; persisted same-key identity/canonical contradiction maps `PAYLOAD_INTEGRITY`; RUNNING/blocked/terminal conflicts fail; unrelated pre-existing block A while dependency B never counts as success; newly adopted/blocked records one job metric, pre-existing exact same block records zero. |
| 41 | Task 6 v12 retry backoff deterministic jitter quarantine and watermark are exact | TASK6V12_RED_041_RETRY_WATERMARK | Transient codes retry with deterministic jitter; fixed fatal codes quarantine; watermark excludes global barriers from account claim, releases blocked accounts after global terminal, and readiness handles quarantine/backlog thresholds. |
| 42 | Task 6 v12 status logs and tick metrics are canonical and cloned | TASK6V12_RED_042_STATUS_METRICS | `computeOpenStatusFromStore`, `canonicalSchedulerStatus`, and `cloneSchedulerStatus` expose exact keys/reasons/counts/ages/metrics, clone nested data, scrub logs, and do not import `metrics.js`. |

### 1.4 Prove initial RED exactly once

Create `/tmp/task6-v12-red-evidence.tap` once. Do not append to it after the 42 initial RED proofs are frozen.

```bash
: > /tmp/task6-v12-red-evidence.tap
run_one_red() {
  name="$1"
  sentinel="$2"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v12-red-one.XXXXXX.tap)"
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
    printf '%s\n' "### TASK6_V12_RED_CASE_START"
    printf '%s\n' "name=$name"
    printf '%s\n' "sentinel=$sentinel"
    cat "$tmp"
    printf '%s\n' "### TASK6_V12_RED_CASE_END"
  } >> /tmp/task6-v12-red-evidence.tap
  rm -f "$tmp"
}
```

Invoke `run_one_red` exactly 42 times using the manifest in order. Then freeze:

```bash
grep -c '^### TASK6_V12_RED_CASE_START$' /tmp/task6-v12-red-evidence.tap | grep -E '^42$'
grep -c '^### TASK6_V12_RED_CASE_END$' /tmp/task6-v12-red-evidence.tap | grep -E '^42$'
sha256sum /tmp/task6-v12-red-evidence.tap > /tmp/task6-v12-red-evidence.sha256
```

After this freeze, TDD waves run targeted or full tests normally and never append to `/tmp/task6-v12-red-evidence.tap`.

### 1.5 Capture normalized pre-inventory

Use a temp helper so final checks can compare complete repo inventory, including untracked paths, symlinks, file type, size, content hash, filesystem mode, and git tracked mode. Empty directories are not repository changes; directory symlinks are repository changes and must be recorded.

```bash
cat > /tmp/task6-inventory-functions.sh <<'SH'
repo_inventory() {
  python3 - <<'PY'
import hashlib, os, stat, subprocess
root = os.getcwd()
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, p = record.split(b'\t', 1)
    tracked[p.decode()] = meta.split()[0].decode()
paths = set(tracked)
for dirpath, dirnames, filenames in os.walk('.', topdown=True, followlinks=False):
    dirnames[:] = [d for d in dirnames if d != '.git']
    rel_dir = dirpath[2:] if dirpath.startswith('./') else dirpath
    for name in list(dirnames):
        p = os.path.join(rel_dir, name) if rel_dir else name
        try:
            st = os.lstat(p)
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(st.st_mode):
            paths.add(p)
            dirnames.remove(name)
    for name in filenames:
        p = os.path.join(rel_dir, name) if rel_dir else name
        paths.add(p)
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
        with open(p, 'rb') as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        print(p + '\tfile\t' + fs_mode + '\t' + str(st.st_size) + '\t' + digest + '\t-\t' + git_mode)
    elif stat.S_ISDIR(st.st_mode):
        print(p + '\tdir\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
    else:
        print(p + '\tother\t' + fs_mode + '\t-\t-\t-\t' + git_mode)
PY
}
SH
sha256sum /tmp/task6-inventory-functions.sh > /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
repo_inventory > /tmp/task6-v12-pre-inventory.tsv
```

Allowed final differences are exactly the six owned source/test files, the exact report file, and the real directory entry `docs/superpowers/reports` if it did not exist at preflight. Any new non-owned file, symlink, mode-only change, content change, or directory symlink fails scope.

---

## Task 2: Implement writer status, timers, lifecycle, startup, and bridge seams

**Owned files:** `server/scheduler/writer.js`, `server/scheduler/index.js`.

### 2.1 Writer status functions

Define these functions in `writer.js` and export only if tests require white-box access; otherwise keep them private and exercise through `taoScheduler(...).getStatus()`.

```js
function newMetricState() {
  return {
    ticks: 0,
    drains: 0,
    claimed: 0,
    completed: 0,
    cancelled: 0,
    partial: 0,
    failed: 0,
    retried: 0,
    quarantined: 0,
    leaseAcquired: 0,
    leaseUnavailable: 0,
    leaseLost: 0,
    storageFatal: 0,
    runCommand: 0,
    runCommandPartial: 0,
    manualDrain: 0,
    cutover: 0
  };
}

function cloneSchedulerStatus(status) {
  return {
    mode: status.mode,
    state: status.state,
    ready: status.ready,
    reason: status.reason,
    dbOpen: status.dbOpen,
    leaseHeld: status.leaseHeld,
    writerLeaseHeld: status.writerLeaseHeld,
    watermarkS: status.watermarkS,
    counts: Object.assign({}, status.counts),
    ages: Object.assign({}, status.ages),
    pending: status.pending,
    retryWait: status.retryWait,
    running: status.running,
    quarantined: status.quarantined,
    dueBacklog: status.dueBacklog,
    oldestDueAgeMs: status.oldestDueAgeMs,
    nextEligibleAtMs: status.nextEligibleAtMs,
    recoveryComplete: status.recoveryComplete,
    draining: status.draining,
    wakeTimerActive: status.wakeTimerActive,
    pollTimerActive: status.pollTimerActive,
    heartbeatTimerActive: status.heartbeatTimerActive,
    reconcileTimerActive: status.reconcileTimerActive,
    signalHandlerInstalled: status.signalHandlerInstalled,
    metrics: Object.assign(newMetricState(), status.metrics || {})
  };
}

function canonicalSchedulerStatus(status) {
  var counts = status.counts || {};
  var ages = status.ages || {};
  function nonnegative(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }
  function age(value, allowNull) {
    return value === null && allowNull || nonnegative(value);
  }
  var normalized = {
    mode: status.mode === 'durable' ? 'durable' : 'legacy',
    state: String(status.state || 'stopped'),
    ready: false,
    reason: null,
    dbOpen: status.dbOpen !== false,
    leaseHeld: status.leaseHeld === true,
    writerLeaseHeld: status.writerLeaseHeld === true,
    watermarkS: Number.isSafeInteger(status.watermarkS) ? status.watermarkS : null,
    counts: {
      pending: nonnegative(counts.pending) ? counts.pending : 0,
      retryWait: nonnegative(counts.retryWait) ? counts.retryWait : 0,
      running: nonnegative(counts.running) ? counts.running : 0,
      quarantined: nonnegative(counts.quarantined) ? counts.quarantined : 0,
      dueBacklog: nonnegative(counts.dueBacklog) ? counts.dueBacklog : 0
    },
    ages: {
      oldestDueAgeMs: age(ages.oldestDueAgeMs, false) ? ages.oldestDueAgeMs : 0,
      nextEligibleAtMs: age(ages.nextEligibleAtMs, true) ? ages.nextEligibleAtMs : null
    },
    recoveryComplete: status.recoveryComplete === true,
    draining: status.draining === true,
    wakeTimerActive: status.wakeTimerActive === true,
    pollTimerActive: status.pollTimerActive === true,
    heartbeatTimerActive: status.heartbeatTimerActive === true,
    reconcileTimerActive: status.reconcileTimerActive === true,
    signalHandlerInstalled: status.signalHandlerInstalled === true,
    metrics: Object.assign(newMetricState(), status.metrics || {})
  };
  normalized.pending = normalized.counts.pending;
  normalized.retryWait = normalized.counts.retryWait;
  normalized.running = normalized.counts.running;
  normalized.quarantined = normalized.counts.quarantined;
  normalized.dueBacklog = normalized.counts.dueBacklog;
  normalized.oldestDueAgeMs = normalized.ages.oldestDueAgeMs;
  normalized.nextEligibleAtMs = normalized.ages.nextEligibleAtMs;
  if (!normalized.dbOpen) normalized.reason = 'SCHEDULER_DB_CLOSED';
  else if (status.reason === 'SCHEDULER_STORAGE_FATAL' || normalized.state === 'fatal') normalized.reason = 'SCHEDULER_STORAGE_FATAL';
  else if (status.reason === 'SCHEDULER_CRASHED' || normalized.state === 'crashed') normalized.reason = 'SCHEDULER_CRASHED';
  else if (normalized.state === 'stopped') normalized.reason = 'SCHEDULER_STOPPED';
  else if (!nonnegative(normalized.pending) || !nonnegative(normalized.running)) normalized.reason = 'SCHEDULER_STATUS_INVALID';
  else if (normalized.mode !== 'durable') normalized.reason = 'SCHEDULER_MODE_LEGACY';
  else if (status.reason === 'SCHEDULER_LEASE_LOST') normalized.reason = 'SCHEDULER_LEASE_LOST';
  else if (!normalized.writerLeaseHeld) normalized.reason = 'SCHEDULER_LEASE_UNHELD';
  else if (!normalized.recoveryComplete) normalized.reason = 'SCHEDULER_RECOVERING';
  else if (normalized.draining) normalized.reason = 'SCHEDULER_DRAINING';
  else if (normalized.quarantined > Number(status.maxQuarantinedReady || 0)) normalized.reason = 'SCHEDULER_QUARANTINE_LIMIT';
  else if (normalized.oldestDueAgeMs > Number(status.maxBacklogAgeMs || Infinity)) normalized.reason = 'SCHEDULER_BACKLOG_AGE_LIMIT';
  normalized.ready = normalized.reason === null;
  return cloneSchedulerStatus(normalized);
}

function computeOpenStatusFromStore(writer) {
  var nowMs = writer.clock.nowMs();
  var counts = writer.store.statusSnapshot(nowMs);
  var mode = writer.store.schedulerMode ? writer.store.schedulerMode() : 'durable';
  var token = writer.leaseToken || null;
  var live = token ? writer.store.leaseTokenIsLive(token, nowMs) : false;
  return canonicalSchedulerStatus({
    mode: mode,
    state: writer.state,
    dbOpen: writer.dbOpen !== false,
    leaseHeld: live,
    writerLeaseHeld: live,
    watermarkS: writer.store.globalWatermarkS(),
    counts: counts,
    ages: {oldestDueAgeMs: counts.oldestDueAgeMs, nextEligibleAtMs: counts.nextEligibleAtMs},
    recoveryComplete: writer.recoveryComplete === true,
    draining: writer.draining === true,
    wakeTimerActive: !!writer.wakeTimer,
    pollTimerActive: !!writer.pollTimer,
    heartbeatTimerActive: !!writer.heartbeatTimer,
    reconcileTimerActive: !!writer.reconcileTimer,
    signalHandlerInstalled: !!(writer.signalHandlerState && writer.signalHandlerState.installed),
    metrics: writer.metrics,
    reason: writer.reason,
    maxQuarantinedReady: writer.options.maxQuarantinedReady,
    maxBacklogAgeMs: writer.options.maxBacklogAgeMs
  });
}
```

Status cache semantics:

- `writer.status()` returns `cloneSchedulerStatus(writer.closedStatusCache)` when `writer.dbOpen === false`; it must not call SQLite after DB-close.
- On open status, `writer.status()` calls `computeOpenStatusFromStore(writer)`, stores `writer.lastOpenStatusCache = cloneSchedulerStatus(status)`, and returns a fresh clone.
- `_datDatabaseClosing()` first captures `lastOpenStatusCache` if possible while DB is still open, then sets `writer.closedStatusCache = canonicalSchedulerStatus({...snapshot, ready:false, dbOpen:false, writerLeaseHeld:false, leaseHeld:false, reason:'SCHEDULER_DB_CLOSED', state: writer.state === 'stopped' ? 'stopped' : 'stopping'})`, sets `writer.dbOpen = false`, calls `clearAllTimers()`, and returns nothing.
- Tests mutate returned `counts`, `ages`, and `metrics` and prove the next `getStatus()` is unchanged.

### 2.2 Timer lifecycle

Implement exact timer helpers:

```js
SchedulerWriter.prototype.clearWakeTimer = function () { /* clear wakeTimer */ };
SchedulerWriter.prototype.clearPollTimer = function () { /* clear pollTimer */ };
SchedulerWriter.prototype.clearGraceTimer = function () { /* clear graceTimer */ };

SchedulerWriter.prototype.clearMutationTimers = function () {
  this.clearWakeTimer();
  this.clearHeartbeatTimer();
  this.clearRetryTimer();
  this.clearContinuationTimer();
  this.clearReconcileTimer();
};

SchedulerWriter.prototype.clearAllTimers = function () {
  this.clearMutationTimers();
  this.clearPollTimer();
  this.clearGraceTimer();
};
```

Required call sites:

- `transitionLeaseLost(error)`: if state is `stopping`, `stopped`, `fatal`, or stop finalization already began, ignore late lease loss idempotently. Otherwise set reason `SCHEDULER_LEASE_LOST`, increment `metrics.leaseLost`, call `clearMutationTimers()`, then `ensureStandbyPoll()` which first checks `!this.pollTimer` so exactly one poll exists.
- `transitionStorageFatal(error)`, injected crash transition, startup failure after acquisition, `beginStop`, `stop`, and `_datDatabaseClosing`: call `clearAllTimers()`.
- `_beginStop` is a non-enumerable bridge seam that calls `writer.beginStop('manual-private-seam')`; `beginStop` sets admission fence synchronously, captures current in-flight tail, calls `clearAllTimers()`, and starts bounded finalization only once.
- `stop()` calls `beginStop('public-stop')`, awaits `_waitForStopFinalization`, releases lease if still live, clears all timers again, sets state `stopped`, reason `SCHEDULER_STOPPED`.

### 2.3 Startup and recovery order

Startup sequence:

1. Validate durable mode and owner UUID before mutation.
2. Acquire lease in an immediate UoW.
3. Record effective time with `store.recordEffectiveNowMs(token, nowMs)` and use returned `effectiveNowMs`.
4. Call `reducer.initializeCombatSeed(token, effectiveNowMs)`.
5. Call `recovered = store.recoverExpiredRunning(token, effectiveNowMs, retryPolicy)`.
6. If `recovered > 0`, call `store.markDurableMutation(token, effectiveNowMs)`.
7. Call `store.assertAccountDependencyIntegrity(token, effectiveNowMs)`.
8. Discover resumable owned RUNNING rows using exact known job IDs only. Do not invent a generic resume enumeration API. Stage IDs in an array returned from the transaction; do not arm timers inside the UoW.
9. Refresh effective time immediately before commit: `freshNow = store.recordEffectiveNowMs(token, clock.nowMs())`.
10. Rebase staged locks with `store.resumeOwnedRunning(token, jobId, freshNow, lockMs)` for each staged ID. If many IDs are required later, add a Task6-owned bulk Store primitive with the same SQL fences; otherwise use the live method.
11. Final lease fence at the same or later `freshNow` before commit.
12. Commit. Only after commit publish partial queues and arm wake/heartbeat/poll timers exactly once.

Startup failure unwind:

- If failure occurs after acquiring a token, attempt to release that same token in a guarded `finally` immediate UoW.
- Release errors are scrub-logged and never replace the original startup error.
- State becomes `stopped` or `crashed` according to the original error; public reason is `SCHEDULER_STARTUP_FAILED` during startup unwind.
- `clearAllTimers()` runs even when release throws.
- If stop was requested during startup, no standby poll or mutation timer is armed after cleanup.

### 2.4 Bridge implementation

`server/scheduler/index.js` implements `taoScheduler(context)`:

- Production context keys: `{kho, tg, clock, logger, env, schedulerOptions}`.
- Direct test context keys: `{store, world, advanceService, reducer, writer, clock, logger, schedulerOptions}`.
- Public enumerable methods: `start`, `stop`, `getStatus`, `runCommand`, `schedule`, `cancel`, `reconcile`, `advanceTo`.
- `getStatus: function () { return writer.status(); }`.
- Private non-enumerable descriptors:
  - `_datSignalHandlerInstalled: {enumerable:false, value:function (installed) { writer.signalHandlerState.installed = Boolean(installed); }}`
  - `_waitForStopFinalization: {enumerable:false, value:function () { return writer.waitForStopFinalization(); }}`
  - `_beginStop: {enumerable:false, value:function () { return writer.beginStop('private-seam'); }}`
  - `_datDatabaseClosing: {enumerable:false, value:function () { return writer.datDatabaseClosing(); }}`

---

## Task 3: Store additions and exact Task5 downstream protocol

**Owned files:** `server/scheduler/store.js`, `server/scheduler/writer.js`.

### 3.1 Claim helpers and chronology

Implement writer-owned global helper; do not add `takeNextAccountJob`.

```js
SchedulerWriter.prototype.takeNextJob = function (token, nowMs, watermarkS) {
  var self = this;
  return this.withImmediateUow(function () {
    var effectiveNowMs = self.store.recordEffectiveNowMs(token, nowMs);
    if (self.partialQueue.length) {
      var partial = self.partialQueue.shift();
      self.callFaultHook('before-claim', partial);
      return self.store.resumeOwnedRunning(token, partial.jobId, effectiveNowMs, self.options.lockMs);
    }
    self.callFaultHook('before-claim', null);
    return self.store.claimNext(token, effectiveNowMs, watermarkS, self.options.lockMs);
  });
};
```

Global claim helper:

```js
SchedulerWriter.prototype.claimFirstBarrierForDrain = function (token, requestedNowMs) {
  var self = this;
  return this.withImmediateUow(function () {
    var effectiveNowMs = self.store.recordEffectiveNowMs(token, requestedNowMs);
    var nowS = Math.floor(effectiveNowMs / 1000);
    var roots = self.store.listBarrierJobsAtOrBefore(token, nowS, effectiveNowMs);
    var first = roots[0] || null;
    if (!first) return null;
    self.callFaultHook('before-claim', first);
    return self.store.claimForResolution(token, first.id, effectiveNowMs, self.options.lockMs, {nowS: nowS});
  });
};
```

Drain order:

1. If manual drain or command requires global resolution, call `claimFirstBarrierForDrain` first.
2. After the global claim UoW commits, call `callFaultHook('after-claim', claimed)` immediately, then open effect UoW.
3. If no global job was claimed, compute watermark with `store.globalWatermarkS()` and call parent `takeNextJob(token, nowMs, watermarkS)` for account jobs.
4. After account claim UoW commits, call `callFaultHook('after-claim', claimed)` immediately.
5. Re-query after each completed/parked/partial job; no recursive drain.

Crash stages are exactly:

- `before-claim`
- `after-claim`
- `after-application-insert`
- `after-game-mutation`
- `before-job-completion`

### 3.2 Retarget primitive for external-only direct wake

Add `SchedulerStore.prototype.retargetOwnedPendingAccountAdvanceForCommand(token, accountId, revision, targetS, nowMs)`:

- Validate account/revision/target scalars.
- Assert live lease first.
- Locate only the exact idempotency key `account-advance:${accountId}:${revision}`.
- If no same-key row exists, return `null`.
- Validate persisted same-key canonical payload before checking state; any persisted identity/canonical contradiction maps `PAYLOAD_INTEGRITY`.
- If row exists but state is `RUNNING`, terminal, or `blocked_by_job_id IS NOT NULL`, fail with `ACCOUNT_ADVANCE_RETARGET_CONFLICT`.
- If row is exact unblocked `PENDING` or `RETRY_WAIT`, atomically update `scheduled_at_s`, `payload_json`, `payload_sha256`, `updated_at_ms`, and retry fields to canonical `ACCOUNT_ADVANCE` payload for the same account/revision/target.
- Preserve job id, idempotency key, sequence, priority, attempt, and max attempts.
- SQL must be lease-fenced by owner/generation/expires and row id/state.
- Return the updated raw row; caller must brand it through `loadExecutableJob`.

Retarget caller rules:

- If retarget returns `null`, call existing `replaceAccountAdvance(token, accountId, revision, targetS, nowMs)` once as create fallback.
- Never accept the return from `replaceAccountAdvance` unless it validates as exact same account/revision/key and either is unblocked at the target or already blocked by the same dependency.
- If `replaceAccountAdvance` returns an unrelated existing blocked row, return a command conflict/deferred result; do not synthesize a new dependency and do not record success.
- If an exact same blocked dependency already exists, classify `preExistingBlocked:true` and record no job metric.
- If writer newly adopts and blocks a wake, classify `newlyAdoptedBlocked:true` and record exactly one job metric in the finalizer.

### 3.3 Raw quarantine primitive

Add `SchedulerStore.prototype.quarantineClaimedRaw(token, raw, failure, nowMs)`:

- Do not parse `payload_json`.
- Validate only safe raw id string, state `RUNNING`, `locked_by`, `locked_generation`, `locked_until_ms`, and current live lease.
- Atomic SQL WHERE includes id, state `RUNNING`, owner, generation, `locked_until_ms > nowMs`, and live scheduler lease.
- Set state `QUARANTINED`, preserve current attempt, set `retry_at_ms=NULL`, `quarantined_at_ms=nowMs`, scrubbed `error_code` and `error_message_safe`, clear lock fields, and update `updated_at_ms`.
- If SQL changes zero and lease is not live, throw `LEASE_LOST`; otherwise throw `JOB_RAW_QUARANTINE_CONFLICT`.

### 3.4 Accepted Task5 finish protocol

Writer applies claimed jobs through this exact shape:

```js
function applyClaimed(executable) {
  var mutation = makeMutationContext(executable);
  return world.trongMutationScheduler(mutation, function () {
    mutation.recordAdvance = function (advanceResult) { /* exact live ledger shape */ };
    mutation.recordJob = function (jobResult) { /* exact live ledger shape */ };
    var targetS = executable.kind === 'ACCOUNT_ADVANCE'
      ? Number(executable.scheduled_at_s)
      : undefined;
    var prepared = reducer.prepare(
      mutation,
      executable,
      executable.kind === 'ACCOUNT_ADVANCE' ? {executionTargetS: targetS} : {}
    );
    if (prepared.kind === 'partial') return finishPartial(mutation, executable, prepared);
    return finishPrepared(mutation, executable, prepared);
  });
}
```

Rules:

- Claim raw row, then immediately brand with `store.loadExecutableJob(token, raw, nowMs)`. Derive default `executionTargetS` from branded executable, never from raw claim.
- `prepare` runs before idempotency insert.
- For global jobs, call `advanceService.advanceBarrier` before `insertApplication`; if it returns already-parked `{blockedExternal:true, blockedExternalJobId}`, writer returns `reordered:true` and never calls `parkGlobalBehindPreceding`.
- For zero global budget, synthesize and record `zeroGlobal.advanceResult` exactly: `processed` inherited from barrier, `advancedToS` equal target, `nextDueAtS` equal job target, `hasMoreDue:true`, `budgetExhausted:true`.
- Partial effect validation is strict:
  - `Object.getPrototypeOf(effect) === Object.prototype`
  - exactly two own enumerable string keys in order `checkpointRevision`, `saveReceipt`
  - no symbols and no non-enumerable extras
  - `effect.saveReceipt === prepared.saveReceipt`
  - `prepared.saveReceipt === prepared.advanceResult.saveReceipt`
- Partial branch:
  - `effect = reducer.applyPrepared(mutation, prepared)`
  - `store.checkpointPartial(token, executable, effect.checkpointRevision, nowMs)` when checkpoint is non-null
  - If `prepared.advanceResult.deferredExternal === true` or `prepared.advanceResult.blockedExternalJobId`, block with `store.blockOwnedAccountAdvance(token, executable, effect.checkpointRevision, prepared.advanceResult.blockedExternalJobId, nowMs)`
  - Otherwise keep RUNNING for budget continuation or established-zero retention.
  - `store.checkpointPartial`/`blockOwnedAccountAdvance` happens in the same effect UoW as final fences.
- Prepared branch:
  - `store.insertApplication(token, executable, prepared.application, nowMs, canonicalTContext)`
  - If already applied, validate and skip `reducer.applyPrepared`; if new, call `reducer.applyPrepared(mutation, prepared)` inside `world.trongMutationScheduler`.
  - `callFaultHook('after-application-insert', executable)` after application insert.
  - `callFaultHook('after-game-mutation', executable)` after effect and before terminal completion.
  - `callFaultHook('before-job-completion', executable)` immediately before terminal Store method.
  - Terminal mapping: `COMPLETED` account uses `completeAccountAdvanceAndScheduleSuccessor`; global success uses `completeApplied`; cancellation uses `finishResolved`.
- Every UoW exit has a final lease fence using effective time at or after all durable/world mutations.

### 3.5 Failure settlement

Failure settlement opens a fresh settlement UoW only for ordinary reducer/application failures:

1. Short-circuit before settlement:
   - `INJECTED_CRASH`: rethrow untouched, no settlement.
   - Original `LEASE_LOST`: transition lease lost and rethrow.
   - Original fatal storage code: `transitionStorageFatal(original)` and rethrow.
2. Fresh settlement UoW:
   - Refresh effective time.
   - Reload raw by job id.
   - Brand with `store.loadExecutableJob(token, raw, nowMs)`.
   - If branding succeeds, call `store.fail(token, executable, original, nowMs, retryPolicy)`.
   - If branding fails due payload integrity, call `store.quarantineClaimedRaw(token, raw, original, nowMs)`.
   - If fresh row is missing, preserve original failure semantics and rethrow original.
   - Final lease fence immediately before commit.
3. If settlement itself fails with fatal storage, call `transitionStorageFatal(settlementError)` but rethrow original reducer error unchanged.
4. If settlement itself fails with lease loss, transition lease lost and rethrow original reducer error unchanged.

---

## Task 4: Direct account commands, public command paths, and due-account draining

**Owned files:** `server/scheduler/writer.js`, `server/scheduler/store.js`, `tools/test-scheduler.js`.

### 4.1 `runCommand` contract

`runCommand({name, accountId, run})`:

- Validates `name` as safe scheduler command string, optional `accountId` as positive integer, and `run` as function.
- Derives monotonic effective time internally with `recordEffectiveNowMs`; caller cannot supply time.
- Opens an immediate UoW and enters `world.trongMutationScheduler(mutation, fn)`.
- If pre-command advance returns partial, deferred external, or due-boundary partial, persist `TICK_PARTIAL`, return a defined partial response, enqueue continuation after commit, and never invoke closure.
- On account delete, skip advance and run `mutation.commandAccountFinalizer`.
- On successful adopted account advance, return `accountFinalizer`; invoke exactly once after commit.
- On closure throw, rollback and rethrow.
- On thenable return, the only honest guarantee is rollback after invocation; tests assert invocation happened, UoW rolled back, and `WORLD_RULES_HOOK_ASYNC` is raised.
- Every exit path, including partial/account-delete/advance-due/throw/thenable, executes a post-world final lease fence before UoW commit or rollback result.

### 4.2 Direct account advance finalization

Direct account paths must use live World synchronization:

- Normal direct save options must not include `deferAccountWake:true`; live World then calls `replaceAccountAdvance` itself.
- Completed direct advance preserves successor created by World. Do not replace it with a stale caller-created wake.
- `ensureEstablishedZeroDirectContinuation(token, accountId, revision, targetS, advanceResult, nowMs)` signature:
  - Requires established-zero result: processed `0`, budgetExhausted `true`, hasMoreDue `true`, no save receipt.
  - If an owned RUNNING account wake exists for same account/revision, return `{kind:'partial', partialJobId, preExistingBlocked:false, newlyAdoptedBlocked:false, recordJob:false}`.
  - Otherwise call `replaceAccountAdvance` with exact account/revision/target, validate exact identity, adopt if due, and return continuation summary.
  - The helper does not call `mutation.recordJob`; finalizer owns metrics.
- Deferred completed accounts:
  - `terminalState:'CANCELLED'` is handled before any deferred success finalizer.
  - Only `terminalState:'COMPLETED'` account results are eligible for deferred finalization.
  - `prepared.advanceResult` is recorded exactly once before finish/finalizer.

### 4.3 External-only continuation fallback

When direct account advance returns `deferredExternal:true`/`blockedExternalJobId`:

- Public/direct result must include `deferredExternal:true`, `blockedExternalJobId`, `accountId`, `revision`, `targetS`, `dependencyJobId`, and enough summary fields for postcommit enqueue when `partialJobId` is null.
- If save receipt has revision and the World-created same-key wake is unblocked but scheduled later than dependency-safe target, call `retargetOwnedPendingAccountAdvanceForCommand` and then adopt/block.
- If no same-key wake exists, call `replaceAccountAdvance` once to create at dependency-safe `nextDueAtS`, validate exact identity, adopt, and block.
- If `replaceAccountAdvance` returns unrelated blocked row, return command conflict/deferred summary; do not mark success and do not record job metric.
- If exact same dependency already blocks the wake, finalizer records zero job metric.
- If writer newly adopts/blocks, finalizer records exactly one job metric.

### 4.4 Advance-due boundary

Implement Task6-owned `advanceDueInCurrentUow(mutation, targetS, limit)` using live `kho.q.dqDenHan`:

- Query `limit + 1` rows or rescan after processing `limit` to compute `hasMoreDue` accurately.
- Deterministic order is `keTiep, tk`.
- For 61 due accounts with limit 60, return `partial:true`, persist `TICK_PARTIAL`, closure count `0`, and enqueue continuation after commit.
- Summary fields include `processed`, `advancedToS`, `nextDueAtS`, `hasMoreDue`, `budgetExhausted`, `partial`, `partialJobId` if any, and `deferredExternal` if external dependency blocked.
- Use `world.advanceAccountNoiBo(mutation, accountId, targetS, saveOptions)` with normal save options for direct completed paths.

---

## Task 5: Maintenance cutover and CLI

**Owned files:** `server/scheduler/cutover.js`, `tools/scheduler-cutover.js`, `server/scheduler/index.js`, `tools/test-scheduler.js`.

### 5.1 `runMaintenanceCutover({kho, clock, ownerId})`

Contract:

```js
function schedulerError(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}

function fail(code) {
  throw schedulerError(code);
}

function runMaintenanceCutover(context) {
  if (!context || !context.kho || !context.clock ||
      typeof context.clock.nowMs !== 'function') {
    throw schedulerError('SCHEDULER_CUTOVER_CONTEXT_INVALID');
  }
  var ownerId = assertSchedulerOwnerId(context.ownerId);
  var kho = context.kho;
  var clock = context.clock;
  var firstNowMs = clock.nowMs();
  if (!Number.isSafeInteger(firstNowMs) || firstNowMs < 0) {
    throw schedulerError('SCHEDULER_CUTOVER_TIME_INVALID');
  }
  apDungMigrationScheduler(kho, firstNowMs);
  var store = new SchedulerStore(kho, clock);
  var token = null;
  var primaryError = null;
  try {
    var result = kho.giaoDichImmediate(function () {
      if (store.schedulerMode() !== 'legacy') {
        fail('SCHEDULER_CUTOVER_ALREADY_DURABLE');
      }
      if (kho.db.prepare('SELECT 1 AS ok FROM dq LIMIT 1').get()) {
        fail('SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED');
      }
      var nowMs = store.peekEffectiveNowMs(clock.nowMs());
      token = store.acquireLease(ownerId, nowMs, CUTOVER_LEASE_MS);
      if (!token) fail('SCHEDULER_LEASE_UNHELD');
      var effective = store.recordEffectiveNowMs(token, nowMs);
      var recovered = store.recoverExpiredRunning(token, effective, CUTOVER_RETRY_POLICY);
      store.getOrCreateCombatSeedKey(token, effective);
      var seed = kho.cauhinh('combat_seed_key_v1');
      if (typeof seed !== 'string' || !/^[0-9a-f]{64}$/.test(seed)) {
        fail('COMBAT_SEED_KEY_INVALID');
      }
      var changed = kho.db.prepare(
        "UPDATE scheduler_meta SET value='durable',updated_at_ms=? " +
        "WHERE key='scheduler_mode' AND value='legacy' " +
        "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
        "AND owner_id=? AND generation=? AND expires_at_ms>?)"
      ).run(effective, token.ownerId, token.generation, effective).changes;
      if (changed !== 1) fail('SCHEDULER_CUTOVER_MODE_CONFLICT');
      store.writeAudit(token, 'CUTOVER', null, 'fresh-only', effective);
      store.assertLiveLease(token, effective);
      return {mode: 'durable', imported: 0, recovered: recovered};
    });
    return result;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (token) {
      try {
        kho.giaoDichImmediate(function () {
          var releaseNowMs = store.peekEffectiveNowMs(clock.nowMs());
          store.releaseLease(token, releaseNowMs);
        });
      } catch (releaseError) {
        if (!primaryError) throw releaseError;
        if (context.logger && typeof context.logger.warn === 'function') {
          context.logger.warn({event: 'scheduler.cutover.release_failed',
            code: store.safeErrorMessage(releaseError && releaseError.code || releaseError && releaseError.message)});
        }
      }
    }
  }
}
```

Implement exactly the contract above, with these extra notes:

1. Validate context and `ownerId` before migration.
2. `apDungMigrationScheduler(kho, clock.nowMs())` before constructing `SchedulerStore`.
3. Construct `store` as `new SchedulerStore(kho, clock)`.
4. In one immediate UoW:
   - Read scheduler mode. If not legacy, throw `SCHEDULER_CUTOVER_ALREADY_DURABLE`.
   - If `SELECT 1 FROM dq LIMIT 1` returns a row, throw `SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED`.
   - `token = store.acquireLease(ownerId, effectiveNowMs, cutoverLeaseMs)`. If null, throw `SCHEDULER_LEASE_UNHELD`.
   - `effective = store.recordEffectiveNowMs(token, effectiveNowMs)`.
   - `recovered = store.recoverExpiredRunning(token, effective, retryPolicy)`; expected fresh result is `0`, but return the actual count.
   - `reducer.initializeCombatSeed(token, effective)` or Store seed equivalent; seed only `combat_seed_key_v1`, validate 64 lowercase hex.
   - Set scheduler meta mode to durable under live lease.
   - `store.writeAudit(token, 'CUTOVER', null, 'fresh-only', effective)`.
   - Final lease fence.
   - Return `{mode:'durable', imported:0, recovered:recovered}`.
5. In `finally`, if `token` exists, release that same token in a guarded immediate UoW using fresh `clock.nowMs()`.
6. If release throws and there was a primary error, scrub-log release failure and rethrow the primary error unchanged. If release throws with no primary error, throw the release error.

### 5.2 CLI surface

`tools/scheduler-cutover.js`:

- `parseArgs(argv)` accepts exactly `--db <path> --action cutover` in any pair order, rejects duplicates, missing values, unknown flags, and extra operands.
- `runCli(argv, env, io, deps)`:
  - Does not call `process.exit`.
  - Validates args before opening DB.
  - Uses `deps.openKho || defaultOpenKho` and `deps.ownerId || env.THDC_SCHEDULER_OWNER_ID`.
  - Calls `runMaintenanceCutover({kho, clock: deps.clock || systemClock, ownerId})`.
  - Closes `kho` in `finally` if opened and close exists.
  - On success writes one JSON line with exactly `{action:'cutover', mode:'durable', imported:number, recovered:number}` to stdout and returns `{exitCode:0}`.
  - On safe error writes scrubbed code/message to stderr and returns `{exitCode:1}`.
- `main(argv, env, io, deps)` awaits or returns `runCli`, sets `process.exitCode = result.exitCode`, and returns the result.
- Require-main tail:

```js
if (require.main === module) {
  main(process.argv.slice(2), process.env, {
    stdout: process.stdout,
    stderr: process.stderr
  }, {});
}
module.exports = {parseArgs: parseArgs, runCli: runCli, main: main};
```

---

## Task 6: GREEN waves and verification cadence

Run TDD in waves. The initial RED evidence stays frozen; do not append to it.

1. **RED wave A, cases 1-8:** status, timers, lifecycle, bridge. Implement `writer.js` skeleton and `index.js` bridge. Run each case by exact `--test-name-pattern`, then full `tools/test-scheduler.js`.
2. **RED wave B, cases 9-10:** cutover and CLI. Implement `cutover.js` and `tools/scheduler-cutover.js`.
3. **RED wave C, cases 11-18:** public APIs, command admission, and crash chronology.
4. **RED wave D, cases 19-28:** global/account drain and accepted Task5 downstream.
5. **RED wave E, cases 29-32:** settlement, retry, raw quarantine, fatal/lease short-circuits.
6. **RED wave F, cases 33-40:** `runCommand`, direct account, due boundary, retarget.
7. **RED wave G, cases 41-42:** retry/watermark/status-metrics production obligations.

Use these commands after each wave:

```bash
node --test --test-isolation=none --test-reporter=tap --test-name-pattern '^Task 6 v12 ' \
  tools/test-scheduler.js
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
```

Final scheduler check:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js \
  > /tmp/task6-v12-final-scheduler.tap
grep -E '^# tests 205$' /tmp/task6-v12-final-scheduler.tap
grep -E '^# pass 204$' /tmp/task6-v12-final-scheduler.tap
grep -E '^# fail 0$' /tmp/task6-v12-final-scheduler.tap
grep -E '^# skipped 1$' /tmp/task6-v12-final-scheduler.tap
```

Final added-test guard:

```bash
node - <<'NODE' > /tmp/task6-v12-expected-names.txt
const fs = require('fs');
const src = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = src.indexOf('// TASK6_V12_MANIFEST_JSON_START');
const end = src.indexOf('// TASK6_V12_MANIFEST_JSON_END');
if (start < 0 || end < 0 || end <= start) throw new Error('TASK6_V12_MANIFEST_MISSING');
const block = src.slice(start, end).split(/\r?\n/).slice(1).join('\n')
  .replace(/^\/\/ ?/gm, '').trim();
const cases = JSON.parse(block);
const names = cases.map((entry) => entry.name).sort();
if (names.length !== 42) throw new Error('EXPECTED_42_' + names.length);
for (let i = 1; i < names.length; i++) {
  if (names[i] === names[i - 1]) throw new Error('DUPLICATE_EXPECTED_' + names[i]);
}
for (const name of names) {
  if (!name.startsWith('Task 6 v12 ')) throw new Error('BAD_PREFIX_' + name);
  console.log(name);
}
NODE
node - <<'NODE' /tmp/task6-v12-final-scheduler.tap > /tmp/task6-v12-actual-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (Task 6 v12 .+)$/gm)].map((m) => m[1]).sort();
for (let i = 1; i < names.length; i++) {
  if (names[i] === names[i - 1]) throw new Error('DUPLICATE_ACTUAL_' + names[i]);
}
for (const name of names) console.log(name);
NODE
wc -l /tmp/task6-v12-expected-names.txt | grep -E '^42 '
wc -l /tmp/task6-v12-actual-names.txt | grep -E '^42 '
diff -u /tmp/task6-v12-expected-names.txt /tmp/task6-v12-actual-names.txt
node - <<'NODE' /tmp/task6-v12-final-scheduler.tap > /tmp/task6-v12-final-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = [...tap.matchAll(/^# Subtest: (.+)$/gm)]
  .map((m) => m[1])
  .filter((name) => !name.startsWith('Task 6 v12 '));
if (names.length !== 163) throw new Error('BASELINE_FINAL_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
diff -u /tmp/task6-v12-baseline-names.txt /tmp/task6-v12-final-baseline-names.txt
sha256sum -c /tmp/task6-v12-baseline-names.sha256
node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [sizeText, hash] = fs.readFileSync('/tmp/task6-v12-test-prefix.tsv', 'utf8').trim().split('\t');
const size = Number(sizeText);
const bytes = fs.readFileSync('tools/test-scheduler.js');
const prefix = bytes.subarray(0, size);
const actual = crypto.createHash('sha256').update(prefix).digest('hex');
if (actual !== hash) throw new Error('TASK6_PREFIX_CHANGED');
NODE
```

Whitespace checks:

```bash
if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js \
    server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js \
    tools/test-scheduler.js docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md; then
  exit 1
fi
if rg -n $'\t$' server/scheduler/store.js server/scheduler/writer.js \
    server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js \
    tools/test-scheduler.js docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md; then
  exit 1
fi
```

---

## Task 7: Scope guards, report, and fresh review handoff

**Owned artifact:** `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.

### 7.1 Six-file seal

After implementation and tests pass, compute the six-file source/test seal:

```bash
six='server/scheduler/store.js
server/scheduler/writer.js
server/scheduler/index.js
server/scheduler/cutover.js
tools/scheduler-cutover.js
tools/test-scheduler.js'
python3 - <<'PY' > /tmp/task6-v12-six-meta.tsv
import hashlib, os, stat, subprocess
paths = '''server/scheduler/store.js
server/scheduler/writer.js
server/scheduler/index.js
server/scheduler/cutover.js
tools/scheduler-cutover.js
tools/test-scheduler.js'''.splitlines()
tracked = {}
raw = subprocess.check_output(['git', 'ls-files', '--stage', '-z'])
for record in raw.split(b'\0'):
    if not record:
        continue
    meta, p = record.split(b'\t', 1)
    tracked[p.decode()] = meta.split()[0].decode()
for p in paths:
    st = os.lstat(p)
    mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or mode != '100644':
        raise SystemExit('six path type/mode invalid: ' + p + ' ' + mode)
    tm = tracked.get(p, '-')
    if tm not in ('-', '100644'):
        raise SystemExit('six tracked mode invalid: ' + p + ' ' + tm)
    with open(p, 'rb') as fh:
        data = fh.read()
    print('\t'.join([p, 'file', mode, str(len(data)), hashlib.sha256(data).hexdigest(), tm]))
PY
cut -f1,5 /tmp/task6-v12-six-meta.tsv > /tmp/task6-v12-six-hashes.tsv
```

The six hashes, file sizes, filesystem mode, and tracked mode are the exact review seal. Any later change to these six files invalidates both final reviews.

### 7.2 Normalized scope and forbidden diff

After implementation:

```bash
sha256sum -c /tmp/task6-inventory-functions.sha256
. /tmp/task6-inventory-functions.sh
repo_inventory > /tmp/task6-v12-post-inventory.tsv
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
test -f docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
test ! -L docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md
python3 - <<'PY'
import os, stat
checks = [
    ('docs/superpowers/reports', 'dir', '040755'),
    ('docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md', 'file', '100644'),
]
for path, kind, expected in checks:
    st = os.lstat(path)
    mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if mode != expected:
        raise SystemExit(path + ' mode expected ' + expected + ' got ' + mode)
PY
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
pre = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v12-pre-inventory.tsv').read_text().splitlines()}
post = {line.split('\t', 1)[0]: line for line in Path('/tmp/task6-v12-post-inventory.tsv').read_text().splitlines()}
bad = []
for path in sorted(set(pre) | set(post)):
    if pre.get(path) == post.get(path):
        continue
    if path not in allowed:
        bad.append(path)
if bad:
    raise SystemExit('NON_OWNED_SCOPE_CHANGED:\n' + '\n'.join(bad))
PY
```

This detects arbitrary untracked file additions, symlinks, mode-only changes, forbidden content changes, and directory symlink target changes. Empty directories are intentionally ignored because they are not repository content.

### 7.3 Draft report, Stage-A validation, reviews, Stage-B validation

Report sequence:

1. Create draft report with:
   - V12 plan hash from `/tmp/task6-active-plan.sha256`
   - RED evidence hash from `/tmp/task6-v12-red-evidence.sha256`
   - six-file hashes/sizes/modes from `/tmp/task6-v12-six-meta.tsv`
   - final scheduler TAP summary `205/204/0/1`
   - node-check outputs
   - prefix/baseline guard results
   - normalized scope result
   - whitespace result
   - explicit statement that report is excluded from the six-file review seal
2. Run Stage-A validation. Stage-A must not require reviewer approvals:

```bash
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
test -s "$report"
test -f "$report"
test ! -L "$report"
grep -F "$(cut -d' ' -f1 /tmp/task6-active-plan.sha256)" "$report"
grep -F "$(cut -d' ' -f1 /tmp/task6-v12-red-evidence.sha256)" "$report"
grep -F '# tests 205' /tmp/task6-v12-final-scheduler.tap
grep -F '# pass 204' /tmp/task6-v12-final-scheduler.tap
grep -F '# fail 0' /tmp/task6-v12-final-scheduler.tap
grep -F '# skipped 1' /tmp/task6-v12-final-scheduler.tap
```

3. Launch two distinct fresh Sol/high implementation reviews over exact:
   - V12 plan path and hash
   - `/tmp/task6-v12-red-evidence.sha256`
   - `/tmp/task6-v12-six-meta.tsv`
   - six source/test files at those exact hashes
   - draft report content

   Reviewer instructions must state: `model=gpt-5.6-sol`, `effort=high`, outcome must be PASS/BLOCKED, and any fix requires new six-file hashes and two fresh reviews. Handoff reviewers do not require Stage-B output because Stage-B appends their own approvals afterward.

4. Only after both genuine PASS, append exactly two approval lines to the report:

```text
Reviewer 1: identity=<distinct-id-1> model=gpt-5.6-sol effort=high outcome=PASS
Reviewer 2: identity=<distinct-id-2> model=gpt-5.6-sol effort=high outcome=PASS
```

5. Run Stage-B validation:

```bash
python3 - <<'PY' "$report"
import re, sys
text = open(sys.argv[1], 'r', encoding='utf8').read()
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
sha256sum -c /tmp/task6-active-plan.sha256
python3 - <<'PY'
import hashlib, os, stat
for line in open('/tmp/task6-v12-six-meta.tsv', encoding='utf8'):
    path, kind, mode, size, digest, tracked = line.rstrip('\n').split('\t')
    st = os.lstat(path)
    current_mode = format(stat.S_IFMT(st.st_mode) | stat.S_IMODE(st.st_mode), '06o')
    if kind != 'file' or stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or current_mode != mode:
        raise SystemExit('SIX_TYPE_MODE_CHANGED ' + path)
    with open(path, 'rb') as fh:
        data = fh.read()
    if str(len(data)) != size or hashlib.sha256(data).hexdigest() != digest:
        raise SystemExit('SIX_HASH_CHANGED ' + path)
PY
```

Final report changes after review do not invalidate the six-file review seal because the review seal excludes the report. Stage-B separately validates final report type, mode, content, and reviewer lines.

---

## Completion checklist

- [ ] V12 plan hash captured externally and verified; V12 file not modified afterward.
- [ ] Preflight accepted scheduler baseline is exactly 163/162/0/1 and prefix bytes are sealed.
- [ ] Exactly 42 `Task 6 v12 ` tests appended after marker; each has lazy imports and unique sentinel.
- [ ] Initial RED evidence collected exactly once, contains 42 failed selected subtests, and is hashed.
- [ ] Only six owned source/test files changed plus exact report artifact and reports directory.
- [ ] Writer status functions exist in `writer.js` or exact inline equivalents, with no `metrics.js` dependency.
- [ ] Timer semantics match V12: lease loss preserves exactly one poll; fatal/crash/stop/DB-close clear all.
- [ ] Claim path uses parent `takeNextJob`, not `takeNextAccountJob`; global/account claim hooks are ordered exactly.
- [ ] Task5 downstream protocol is exact, including partial effect shape, application replay, and terminal methods.
- [ ] Direct command/deferred/external retarget and 61 due boundary cases pass.
- [ ] Cutover function and CLI contracts pass exact tests.
- [ ] Final scheduler TAP is exactly 205 tests, 204 passed, 0 failed, 1 skipped.
- [ ] Added-test and baseline guards pass exactly.
- [ ] Whitespace, node-check, normalized inventory, file type/mode, and six-file seal checks pass.
- [ ] Draft report Stage-A passes, two fresh distinct Sol/high reviews PASS exact six hashes, approval lines appended, and Stage-B passes.
