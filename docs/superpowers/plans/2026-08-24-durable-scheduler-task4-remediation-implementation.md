# Durable Scheduler Task 4 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each durable world save revisioned and atomically synchronize its canonical state, projections, local wake, external jobs, deletion invalidations, and orphan recovery without breaking replay or global-barrier safety.

**Architecture:** `dq.state` remains the only game-state authority.  Task 4 adds a revision-aware save path and a single post-save synchronization point inside the already-owned outer immediate Unit of Work; `event_jobs` remains wake/idempotency metadata.  Deletion and reconciliation use root-aware Store APIs: an unresolved global root is invalidated only after canonical absence is proved, an active replay child is never cancelled or invalidated by deletion/sweeping, and target-account inbound roots are discovered from the target keys captured before account deletion.

**Tech Stack:** Node.js `>=22.5`, Node built-in test runner, `node:sqlite`, SQLite, existing project UoW and scheduler Store.

**Spec:** `docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md` (SHA-256 `1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf`); this remediation is an execution overlay for Task 4 of `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md` (SHA-256 `cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3`) and does not modify either approved document.

## Global Constraints

- **Binding:** implementation and plan author are fresh `gpt-5.6-terra` agents at `high` effort. The immutable routing authority is `.superpowers/sdd/model-routing.md` SHA-256 `09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f` (102 lines / 5,732 bytes). Two distinct fresh `gpt-5.6-sol` agents at `high` effort perform the behavior/logic and scope/runtime reviews; neither reviewer may be the implementer or the other reviewer.
- **Prerequisite:** do not start RED until the controller injects one immutable Task-3 acceptance envelope. The envelope binds the SHA-256 and exact base64 bytes of the actual Task-3 `TASK3_CONTROLLER_HANDOFF_BEGIN/END` payload which both fresh Sol reviewers echoed—its ten `file` rows plus its `report-lines-bytes` row—along with explicit controller `ACCEPTED` and each Sol reviewer `APPROVED` attestation naming that same payload SHA. It must additionally pin live-consumed `server/rules.js` as a separate type/mode/uid/gid/size/SHA-256 identity row because Task 3's reviewed payload intentionally does not contain it; this separate rule identity does not pretend that either Task-3 reviewer echoed a different payload. A report/status line or live-source snapshot alone is not acceptance. The accepted payload must provide `server/scheduler/events.js` and the executable contracts `G.phanLoaiSuKienKe`, `G.BLOCKED_EXTERNAL(ref,atS)->{code:'BLOCKED_EXTERNAL',ref,atS}`, `G.tick(state,targetS,options)->TickOutcome`, `deriveExternalJobs`, `stableFleetRef`, `stableMissileRef`, and `canonicalExternalStatus`. No substitute, copied helper, partial Task-3 implementation, or unpinned review result is allowed.
- **Authoritative ownership ruling:** the approved scheduler design assigns reconciliation and cancellation of live orphan jobs to the canonical-state synchronization responsibility. Task 2 explicitly deferred `invalidateGlobalJob` and `sweepDeletedAccountOrphans` together to Task 4. Therefore Task 4 owns (1) root-aware global invalidation, (2) explicit account-deletion handling including inbound targets, and (3) the deleted-account orphan sweep. Task 9 must consume these APIs only; it must not reimplement, defer, or supersede them. This ruling resolves the parent-plan Task-9 deferral without editing the approved parent plan.
- **Authoritative transaction invariant:** a successful canonical save or scheduler-aware account creation increments/binds its affected `dq.revision` exactly once in its outer `BEGIN IMMEDIATE`; in that same UoW it rebuilds `ht`, `hamdang`, and `hamgiu`, schedules retained/derived globals, replaces only the normal local wake, writes invalidation applications, releases dependents only through terminal application proof, and commits. Every scheduler mutation is the exact active object `{leaseToken, remainingBudget:{value:<safe-integer 0..50_000>}, effectiveNowMs}`. Continuation ownership, `currentAccountAdvanceJobId`, and `deferAccountWake` are per-`luu` save options, never mutation fields. An already-active context may hold exactly zero after its final primitive so its partial checkpoint can save; only new Writer admission and a new `G.tick` invocation reject a starting zero. Any error or lease-generation loss rolls all of those writes back.
- **Canonical-state invariant:** derive ownership only from the complete post-save `dq.state` set. `ht`, `hamdang`, and `hamgiu` are projections and must never be used as canonical input for derived-job identity, orphan status, or target ownership.
- **Revision/job invariant:** an ordinary save schedules exactly one live `ACCOUNT_ADVANCE` for the earliest **local** deadline and its post-save revision. A stale local wake is `CANCELLED` with `STALE_REVISION` or `SUPERSEDED`; a reducer-owned current `RUNNING` wake is not cancelled and its continuation is finalized by the writer. External/global jobs have `expected_revision=NULL` and are retained by stable reference, not invalidated because an unrelated account revision changed.
- **Deletion/barrier invariant:** account deletion first snapshots the deleting account's canonical target keys and root-aware global references, then cancels only un-applied local PENDING/RETRY_WAIT wakes, deletes canonical account data, and invalidates only eligible root globals in the same outer UoW. Every invalidation creates the immutable Task-2-valid application at the job's `scheduled_at_s`, then makes the root `CANCELLED` with the matching `ENTITY_REMOVED` reason; no raw global update, `cancel()`, or row deletion is permitted. Outbound canonical absence/mismatch writes `{code:'ENTITY_REMOVED', invalidation:'canonical', neutralization:'ALREADY_ABSENT'|'REF_MISMATCH'}`; an inbound target deletion uses the exact result `{code:'ENTITY_REMOVED'}` — `TARGET_REMOVED` is not a Task-2 status or neutralization value. A global watermark remains until this application and terminal transition commit together.
- **Replay invariant:** a root with any active replay child is protected; in particular, children in `PENDING`, `RETRY_WAIT`, `RUNNING`, or `QUARANTINED` must remain byte-for-byte untouched by deletion/sweeping. Deletion and sweeping neither claim, cancel, invalidate, terminalize, nor release that child/root; the active replay owns resolution. A `RUNNING` root without a replay child is likewise left for lease-expiry recovery. A quarantined replay child may be processed only by the existing audited quarantine-resolution path, never by a deletion shortcut.
- **Inbound-target invariant:** deleting account B must also discover a live canonical global root launched by account A whose validated stable ref has a `targetKey` owned by B **before** B's `dq`/`ht` cascade. An `EXACT` inbound root with no active replay child and state PENDING/RETRY_WAIT/QUARANTINED is invalidated solely by immutable `{targetRemovedKey: ref.targetKey}` evidence: the world passes reason `EXACT` with that evidence, the Store writes the exact Task-2 result `{code:'ENTITY_REMOVED'}`, and it terminalizes atomically. This prevents an inbound global barrier from persisting after B is gone. Capturing target keys before deletion is mandatory; no JSON `LIKE`, projection-only query, or post-delete inference may replace it.
- **Sweep invariant:** `sweepDeletedAccountOrphans` is lease-owned and root-aware. It cancels missing-account local PENDING/RETRY_WAIT wakes; it invalidates only Task-2-valid source-account global roots that are PENDING/RETRY_WAIT/QUARANTINED, have no active replay child, and whose now-missing canonical source is therefore `ALREADY_ABSENT`. `REF_MISMATCH` requires an existing source and is a byte-identical non-orphan skip, as are `EXACT` refs, terminal rows, RUNNING roots, and every active replay child. Each successful sweep invalidation must call `markDurableMutation` in the same UoW before the application-proven terminal transition; therefore the first successful sweep may add only `scheduler_meta.durable_first_mutation_at_ms`, while lease and all unrelated metadata remain unchanged. Inbound target deletions are covered atomically by `xoaTaiKhoan`; a post-crash sweep must not guess a deleted target from a now-empty coordinate.
- **Scope:** source/test execution changes are limited to `server/db.js`, `server/world.js`, `server/scheduler/store.js`, and `tools/test-scheduler.js`, plus Task 4's newly created execution report `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md`. Task 4 alone is authorized to add the minimal private `Kho` transaction-finalizer lifecycle in `server/db.js`; no other Foundation transaction behavior may change. Do not change package metadata, migrations, Task 1/2 artifacts, Task 3 artifacts, approved specs/plans, progress ledger, generated artifacts, Git index, or any unrelated file. Do not create `task-4-brief.md`; it did not exist at plan-authoring preflight.
- **Protected current identities:** preserve the approved scheduler design (`1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf`), parent implementation plan (`cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3`), Task-1 migration (`1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76`), scheduler contract (`3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1`), package (`7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f`), Task-1 brief/report, Task-2 brief/report, and routing record. Before RED, fail closed unless the Task-4-owned `server/db.js` baseline is exactly SHA-256 `982ff360fa62c0ece158d57cf9acdca34783f35f12ea82409ea478437ade3545` / 414 lines / 20,202 bytes. Recalculate and compare every exact SHA-256 value before RED and after GREEN; a current-file snapshot alone is not sufficient and any mismatch is a fail-fast stop.
- **Accepted-input identity invariant:** never merely snapshot the Task-1/Task-2 records present at dispatch. Before RED and after GREEN, fail closed unless Task-1 brief/report are exactly `2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a` / `6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38`, Task-2 brief/report are exactly `a09e794304213d0f178e65b50957cc351be93580624caca3c38ca8dd172e1622` / `8823be0784319862af394d007fad4574830108c11910691b7f47ad540bb1edf2`, and routing remains `09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f`.
- **Task-4 dispatch identity invariant:** before RED and after GREEN, compare this exact plan's SHA-256, line count, and byte count to the immutable controller handoff values `TASK4_DISPATCH_PLAN_SHA256`, `TASK4_DISPATCH_PLAN_LINES`, and `TASK4_DISPATCH_PLAN_BYTES`; record the handoff ID and both observations in the report. These values are injected only by the controller at dispatch, not edited by the implementer. Any plan-byte change after dispatch is a hard stop until the controller issues a fresh immutable handoff with a new ID; do not self-hash or silently rebaseline the plan.
- **R3 continuity exception:** a fresh dispatch always follows the strict twenty-four-test chronological RED gate below. The sole exception is controller handoff `task4-r3-continuation-cc343cd4819a-c54a3cfe73aa-20260824`, authenticated by `TASK4_R3_CONTINUATION_HANDOFF_ID`, `TASK4_R3_CONTINUATION_HANDOFF_SHA256`, and `TASK4_R3_CONTINUATION_HANDOFF_B64`. It binds the real R2 `24/0/24/0` evidence, its three invalid inbound-fixture failures, the `21/3` focused result, and the current four-file identities. An R3 executor must follow the fail-closed continuation task before changing a test or source file; it must never claim that the final corrected fixture chronologically produced a new twenty-four-failure RED run. Any absent, partial, malformed, unverified, or different R3 input takes the fresh path.
- **Dirty-worktree protocol:** the preflight worktree already has unrelated tracked and untracked changes. Record a NUL-delimited porcelain-status baseline plus type-aware, closed-world before manifests under a new validated `mktemp -d` directory. The after comparison may differ only at the four Task-4 execution paths and the Task-4 report, and must detect additions, removals, content changes, chmod, owner, group, size, symlink target/type, directory, FIFO, socket, and other special-file drift—including untracked paths. Bind the actual `.git/index` regular-file type/mode/uid/gid/size/hash and the exact cached binary diff before and after. Never clean, reset, stage, delete, or edit another agent's path. Remove only the temp directory created by this task after the controller captures the final handoff and the delta is proven empty outside the allowlist.
- **TDD protocol:** every task below is strict RED → observed intended failure → smallest GREEN → focused rerun. A passing RED, a fixture/setup error, unexpected failure, missing Task-3 prerequisite, changed protected hash, non-empty cached index, or scope delta is a stop condition; diagnose before changing code. Every named RED test must execute an assertion after the production call; pattern-only TAP presence is not evidence.

---

## File Structure and Interfaces

| File | Change | Responsibility |
|---|---|---|
| `server/db.js` | Modify | Lazy `dq.revision` save statement only after migration proves the column exists. |
| `server/world.js` | Modify | Scheduler-aware staging/batch save, revision receipt, canonical job synchronization, creation/deletion orchestration. |
| `server/scheduler/store.js` | Modify | Root-aware reference listing, global invalidation, deletion preparation, and orphan sweep; no gameplay reducer. |
| `tools/test-scheduler.js` | Modify | Deterministic unit/integration/fault tests for all Task-4 invariants. |
| `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md` | Create after implementation | Exact RED/GREEN evidence, hashes, scope/hygiene evidence, and reviewer handoff. |

Task 4 produces these private contracts; callers may not duplicate their SQL or semantics:

```text
Kho.prototype.schedulerStatements = function () -> {dqLuu};
// dqLuu(stateJson, diem, diemCT, diemNC, diemHam, diemThu, lastTick, keTiep, lm, soHT, capNhat, accountId) -> {revision: integer}; throws SCHEDULER_SCHEMA_REQUIRED.
// dangKySchedulerFinalizer(fn) registers FIFO on the current outer transaction;
// it runs after its callback returns, immediately before COMMIT, with no later write.
Kho.prototype.dangKySchedulerFinalizer = function (fn) -> undefined;

TheGioi.prototype.datScheduler = function (store) -> undefined; // same instance is a no-op; distinct valid replacement throws SCHEDULER_STORE_ALREADY_INSTALLED
TheGioi.prototype.datAdvanceService = function (service) -> undefined; // same instance is a no-op; distinct valid replacement throws SCHEDULER_ADVANCE_SERVICE_ALREADY_INSTALLED
TheGioi.prototype.advanceAccountNoiBo = function (mutation, accountId, targetS, saveOptions) -> AdvanceOutcome;
TheGioi.prototype.trongMutationScheduler = function (mutation, fn) -> any;
TheGioi.prototype._assertSchedulerFinalFence = function (mutation) -> undefined; // private: exactly once after all durable writes and immediately before outer commit
TheGioi.prototype.taoDeQuoc = function (accountId, displayName, options) -> {st, nha, receipt};
// In a scheduler batch, batDau()/ketThuc(true) return Map<accountId,{revision,nextLocalAtS}>.
TheGioi.prototype.luu = function (accountId, state, options) -> {
  revision: integer | null, nextLocalAtS: integer | null
};
// options.protectedRecoveryRootIds is an immutable Set of logical global root IDs
// currently owned by a reducer/replay continuation. It is never inferred from a
// projection and prevents this same save from invalidating or replacing its own root.

SchedulerStore.prototype.listLogicalGlobalsReferencingAccount = function (
  leaseToken, accountId, targetKeys, nowMs
) -> Array<{root, activeChild, canonicalRef, referencedAsSource, referencedAsTarget}>;
SchedulerStore.prototype.prepareDeletedAccountJobResolution = function (
  leaseToken, accountId, targetKeys, nowMs
) -> {localCancelled: number, invalidatable: Array<LogicalGlobal>, protectedReplay: Array<LogicalGlobal>};
SchedulerStore.prototype.invalidateGlobalJob = function (
  leaseToken, rootJobId, reason, effectiveAtS, nowMs, invalidationEvidence
) -> ExecutableGlobalJob;
SchedulerStore.prototype.sweepDeletedAccountOrphans = function (
  leaseToken, nowMs
) -> {local: number, global: number, protectedReplay: number, running: number};
```

`listLogicalGlobalsReferencingAccount` validates each payload through the Store's canonical parser and reports the logical root plus optional child. It matches an outbound root by `source_account_id===accountId`; it matches an inbound root only when `canonicalRef.targetKey` is in the immutable pre-delete `targetKeys` set. It never returns a bare replay child as an independently invalidatable job.

### Task 1: Freeze the preflight and prove the Task-3 boundary

**Files:**

- Modify: none.
- Verify: `server/scheduler/events.js`, `server/db.js`, `server/world.js`, `server/scheduler/store.js`, `tools/test-scheduler.js`, protected records listed above.

**Consumes:** accepted Task 3 report/reviews and the current Task-2 Store contracts.

**Produces:** a signed-in-report preflight manifest and an explicit proceed/stop decision.

- [ ] **Step 0: Prove the controller's immutable Task-4 plan handoff**

Run before inspecting or changing a test:

```bash
set -Eeuo pipefail
task4_plan=docs/superpowers/plans/2026-08-24-durable-scheduler-task4-remediation-implementation.md
: "${TASK4_DISPATCH_HANDOFF_ID:?TASK4_DISPATCH_HANDOFF_ID_REQUIRED}"
: "${TASK4_DISPATCH_PLAN_SHA256:?TASK4_DISPATCH_PLAN_SHA256_REQUIRED}"
: "${TASK4_DISPATCH_PLAN_LINES:?TASK4_DISPATCH_PLAN_LINES_REQUIRED}"
: "${TASK4_DISPATCH_PLAN_BYTES:?TASK4_DISPATCH_PLAN_BYTES_REQUIRED}"
test "$(sha256sum "$task4_plan" | cut -d' ' -f1)" = "$TASK4_DISPATCH_PLAN_SHA256"
test "$(wc -l <"$task4_plan" | tr -d ' ')" = "$TASK4_DISPATCH_PLAN_LINES"
test "$(wc -c <"$task4_plan" | tr -d ' ')" = "$TASK4_DISPATCH_PLAN_BYTES"
printf 'TASK4_DISPATCH %s %s %s %s\n' "$TASK4_DISPATCH_HANDOFF_ID" "$TASK4_DISPATCH_PLAN_SHA256" "$TASK4_DISPATCH_PLAN_LINES" "$TASK4_DISPATCH_PLAN_BYTES"
```

Expected: all three live values equal the controller's immutable dispatch record. Preserve this output for the report. A mismatch means `TASK4_PLAN_IDENTITY_DRIFT`: stop before RED and obtain a new controller handoff; never amend environment values, report values, or this plan to make the comparison pass.

- [ ] **Step 1: Confirm Task 3 acceptance and interfaces before changing any test**

Run:

```bash
set -Eeuo pipefail
: "${TASK3_ACCEPTANCE_ENVELOPE_ID:?TASK3_ACCEPTANCE_ENVELOPE_ID_REQUIRED}"
: "${TASK3_ACCEPTANCE_ENVELOPE_SHA256:?TASK3_ACCEPTANCE_ENVELOPE_SHA256_REQUIRED}"
: "${TASK3_ACCEPTANCE_ENVELOPE_B64:?TASK3_ACCEPTANCE_ENVELOPE_B64_REQUIRED}"
node <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const envelope = Buffer.from(process.env.TASK3_ACCEPTANCE_ENVELOPE_B64, 'base64').toString('utf8');
const envelopeHash = crypto.createHash('sha256').update(envelope).digest('hex');
if (envelopeHash !== process.env.TASK3_ACCEPTANCE_ENVELOPE_SHA256) {
  throw new Error('TASK3_ACCEPTANCE_ENVELOPE_HASH_DRIFT');
}
const lines = envelope.trimEnd().split('\n');
if (lines[0] !== 'TASK3_ACCEPTANCE_ENVELOPE_BEGIN' || lines.at(-1) !== 'TASK3_ACCEPTANCE_ENVELOPE_END' ||
    lines[1] !== 'acceptance-id ' + process.env.TASK3_ACCEPTANCE_ENVELOPE_ID || lines.length !== 9) {
  throw new Error('TASK3_ACCEPTANCE_ENVELOPE_SHAPE_INVALID');
}
const reviewedHash = /^reviewed-handoff-sha256 ([0-9a-f]{64})$/.exec(lines[2]);
const reviewedB64 = /^reviewed-handoff-base64 ([A-Za-z0-9+/=]+)$/.exec(lines[3]);
const controller = /^controller-attestation ACCEPTED ([0-9a-f]{64})$/.exec(lines[4]);
const logic = /^logic-reviewer-attestation gpt-5\.6-sol high APPROVED ([0-9a-f]{64})$/.exec(lines[5]);
const runtime = /^runtime-reviewer-attestation gpt-5\.6-sol high APPROVED ([0-9a-f]{64})$/.exec(lines[6]);
const rules = /^rules-identity file ([0-9a-f]{64}) ([0-9]+) ([0-9]+) ([0-9]+):([0-9]+) server\/rules\.js$/.exec(lines[7]);
if (!reviewedHash || !reviewedB64 || !controller || !logic || !runtime || !rules ||
    [controller[1], logic[1], runtime[1]].some((value) => value !== reviewedHash[1])) {
  throw new Error('TASK3_ACCEPTANCE_ATTESTATION_INVALID');
}
const handoff = Buffer.from(reviewedB64[1], 'base64').toString('utf8');
if (crypto.createHash('sha256').update(handoff).digest('hex') !== reviewedHash[1]) {
  throw new Error('TASK3_REVIEWED_HANDOFF_HASH_DRIFT');
}
const handoffLines = handoff.trimEnd().split('\n');
if (handoffLines[0] !== 'TASK3_CONTROLLER_HANDOFF_BEGIN' ||
    handoffLines.at(-1) !== 'TASK3_CONTROLLER_HANDOFF_END' || handoffLines.length !== 13) {
  throw new Error('TASK3_REVIEWED_HANDOFF_SHAPE_INVALID');
}
const required = [
  'tools/test-scheduler.js', 'js/fleet.js', 'js/actions.js', 'js/app.js',
  'js/main.js', 'web/js/mp.js', 'server/scheduler/events.js',
  'dist/thien-ha-dai-chien.html', 'dist/artifact.html'
];
const seen = new Set();
for (const line of handoffLines.slice(1, -2)) {
  const match = /^file ([0-9a-f]{64}) ([0-9]+) ([0-9]+) ([0-9]+):([0-9]+) (.+)$/.exec(line);
  if (!match) throw new Error('TASK3_REVIEWED_HANDOFF_ROW_INVALID:' + line);
  const [, expectedHash, expectedMode, expectedSize, expectedUid, expectedGid, rel] = match;
  if (!(required.includes(rel) || rel === '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md') || seen.has(rel)) {
    throw new Error('TASK3_REVIEWED_HANDOFF_PATH_INVALID:' + rel);
  }
  const stat = fs.lstatSync(rel);
  if (!stat.isFile()) throw new Error('TASK3_REVIEWED_HANDOFF_TYPE_DRIFT:' + rel);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(rel)).digest('hex');
  if (actual !== expectedHash || String(stat.mode) !== expectedMode || String(stat.size) !== expectedSize ||
      String(stat.uid) !== expectedUid || String(stat.gid) !== expectedGid) {
    throw new Error('TASK3_REVIEWED_HANDOFF_IDENTITY_DRIFT:' + rel);
  }
  seen.add(rel);
}
const reportLine = /^report-lines-bytes ([0-9]+) ([0-9]+) (\.superpowers\/sdd\/2026-08-23-durable-event-scheduler-implementation\/task-3-report\.md)$/.exec(handoffLines.at(-2));
if (!reportLine || seen.size !== 10) throw new Error('TASK3_REVIEWED_HANDOFF_PATHS_INCOMPLETE');
const report = fs.readFileSync(reportLine[3], 'utf8');
const reportLines = report.length === 0 ? 0 : report.split('\n').length - (report.endsWith('\n') ? 1 : 0);
if (String(reportLines) !== reportLine[1] || String(Buffer.byteLength(report)) !== reportLine[2]) {
  throw new Error('TASK3_REVIEWED_REPORT_LINES_BYTES_DRIFT');
}
const rulesStat = fs.lstatSync('server/rules.js');
const rulesHash = crypto.createHash('sha256').update(fs.readFileSync('server/rules.js')).digest('hex');
if (!rulesStat.isFile() || rulesHash !== rules[1] || String(rulesStat.mode) !== rules[2] ||
    String(rulesStat.size) !== rules[3] || String(rulesStat.uid) !== rules[4] || String(rulesStat.gid) !== rules[5]) {
  throw new Error('TASK3_RULES_IDENTITY_DRIFT');
}
NODE
node - <<'NODE'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {G} = require('./server/rules.js');
const events = require('./server/scheduler/events.js');
const {Kho} = require('./server/db.js');
const {TheGioi} = require('./server/world.js');
for (const name of ['phanLoaiSuKienKe', 'phanLoaiSuKienNoiBoKe', 'tick']) {
  if (typeof G[name] !== 'function') throw new Error('TASK3_RULES_INTERFACE_MISSING:' + name);
}
const ref = Object.freeze({kind: 'fleet', ownerAccountId: 1, fleetId: 1, launchAtS: 0,
  targetKey: '1:1:1', arrivalAtS: 1, mission: 'attack'});
const blocked = G.BLOCKED_EXTERNAL(ref, 1);
if (!blocked || blocked.code !== 'BLOCKED_EXTERNAL' || blocked.ref !== ref || blocked.atS !== 1) {
  throw new Error('TASK3_BLOCKED_EXTERNAL_CONTRACT_INVALID');
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task4-task3-tick-'));
let kho;
try {
  kho = new Kho(path.join(root, 'tick.sqlite'));
  const world = new TheGioi(kho, {clock: {nowMs: () => 1_700_000_000_000}});
  kho.q.tkThem.run('task4-tick', 'Task4 Tick', 'hash', 'salt', 1_700_000_000, 1_700_000_000);
  const accountId = Number(kho.q.tkTheoTen.get('task4-tick').id);
  const created = world.taoDeQuoc(accountId, 'Task4 Tick');
  if (!created || !created.st) throw new Error('TASK3_TICK_FIXTURE_CREATION_FAILED');
  const state = world.nap(accountId).st;
  const budget = {value: 1};
  const outcome = G.tick(state, state.lastTick, {ownerAccountId: accountId, remainingBudget: budget,
    targetAccountForKey: () => accountId});
  if (!outcome || Object.keys(outcome).sort().join(',') !==
      'advancedToS,budgetExhausted,hasMoreDue,nextDueAtS,processed' || outcome.processed !== 0 ||
      outcome.advancedToS !== state.lastTick || outcome.nextDueAtS !== null || outcome.hasMoreDue !== false ||
      outcome.budgetExhausted !== false || budget.value !== 1) throw new Error('TASK3_TICK_OUTCOME_CONTRACT_INVALID');
} finally {
  if (kho) kho.dong();
  fs.rmSync(root, {recursive: true, force: true});
}
for (const name of [
  'deriveExternalJobs', 'jobFromRef', 'stableFleetRef', 'stableMissileRef',
  'canonicalExternalStatus'
]) if (typeof events[name] !== 'function') throw new Error('TASK3_INTERFACE_MISSING:' + name);
NODE
```

Expected: the controller-provided envelope has an exact SHA, acceptance ID, `ACCEPTED` controller attestation, and two distinct `gpt-5.6-sol`/high `APPROVED` attestations which all bind the same hash of the exact Task-3 payload the reviewers echoed. That nested payload is the actual Task-3 begin/end marker, its ten file rows, and its report-lines-bytes row—not a Task-4 replacement format—and every live identity must equal it. `server/rules.js` is separately pinned and verified without claiming it was in the Task-3 reviewer payload. `G.BLOCKED_EXTERNAL` must build its exact blocking record; a real temporary canonical state must yield the exact successful five-field no-work `TickOutcome` from `G.tick`. Any absent/malformed envelope, attestational mismatch, source/rules drift, missing export, failed temporary fixture cleanup, or executable contract failure is a hard stop; do not infer acceptance from source presence.

- [ ] **Step 2: Capture protected identities, scope, index, and temp baseline**

Run the following once, saving the printed temp root in the implementation report:

```bash
set -Eeuo pipefail
task4_tmp="$(mktemp -d)"
case "$task4_tmp" in /tmp/*) ;; *) false ;; esac
test -d "$task4_tmp"
export task4_tmp
git status --porcelain=v1 -z >"$task4_tmp/status.before"
git diff --cached --binary >"$task4_tmp/cached-diff.before.patch"
test ! -s "$task4_tmp/cached-diff.before.patch"
node - "$task4_tmp/index.before.manifest" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const index = path.resolve(root, '.git/index');
if (!index.startsWith(root + path.sep)) throw new Error('TASK4_INDEX_PATH_ESCAPES_ROOT');
const stat = fs.lstatSync(index);
if (!stat.isFile()) throw new Error('TASK4_INDEX_NOT_REGULAR_FILE');
fs.writeFileSync(process.argv[2], JSON.stringify({type: 'file', mode: stat.mode, uid: stat.uid,
  gid: stat.gid, size: stat.size, hash: crypto.createHash('sha256').update(fs.readFileSync(index)).digest('hex'),
  path: '.git/index'}) + '\n');
NODE
test "$(sha256sum server/db.js | cut -d' ' -f1)" = \
  982ff360fa62c0ece158d57cf9acdca34783f35f12ea82409ea478437ade3545
test "$(wc -l <server/db.js | tr -d ' ')" = 414
test "$(wc -c <server/db.js | tr -d ' ')" = 20202
test "$(sha256sum docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md | cut -d' ' -f1)" = \
  1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf
test "$(sha256sum docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md | cut -d' ' -f1)" = \
  cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
test "$(sha256sum server/scheduler/migrations.js | cut -d' ' -f1)" = \
  1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76
test "$(sha256sum server/scheduler/contract.js | cut -d' ' -f1)" = \
  3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1
test "$(sha256sum package.json | cut -d' ' -f1)" = \
  7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f
test "$(sha256sum .superpowers/sdd/model-routing.md | cut -d' ' -f1)" = \
  09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md | cut -d' ' -f1)" = \
  2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md | cut -d' ' -f1)" = \
  6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md | cut -d' ' -f1)" = \
  a09e794304213d0f178e65b50957cc351be93580624caca3c38ca8dd172e1622
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md | cut -d' ' -f1)" = \
  8823be0784319862af394d007fad4574830108c11910691b7f47ad540bb1edf2
cat >"$task4_tmp/task4-manifest.cjs" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const [phase, scopeOutput, allowedOutput] = process.argv.slice(2);
if (!['before', 'after'].includes(phase)) throw new Error('TASK4_MANIFEST_PHASE_INVALID');
const root = fs.realpathSync(process.cwd());
const allowed = [
  'server/db.js', 'server/world.js', 'server/scheduler/store.js', 'tools/test-scheduler.js',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md'
];
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) throw new Error('TASK4_ALLOWED_PATH_ESCAPES_ROOT:' + rel);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) throw new Error('TASK4_ALLOWED_PARENT_ESCAPES_ROOT:' + rel);
  return abs;
}
function row(abs) {
  const stat = fs.lstatSync(abs);
  const rel = path.relative(root, abs).split(path.sep).join('/');
  const base = {mode: stat.mode, uid: stat.uid, gid: stat.gid, size: stat.size, path: './' + rel};
  if (stat.isFile()) return {type: 'file', hash: crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'), ...base};
  if (stat.isDirectory()) return {type: 'dir', ...base};
  if (stat.isSymbolicLink()) return {type: 'link', target: fs.readlinkSync(abs), ...base};
  if (stat.isFIFO()) return {type: 'fifo', ...base};
  if (stat.isSocket()) return {type: 'socket', ...base};
  return {type: 'other', ...base};
}
function assertAllowedTextHygiene(abs, rel) {
  const bytes = fs.readFileSync(abs);
  let start = 0;
  for (let index = 0; index <= bytes.length; index++) {
    if (index !== bytes.length && bytes[index] !== 0x0a) continue;
    let end = index;
    if (end > start && bytes[end - 1] === 0x0d) end--;
    if (end - start > 240) throw new Error('TASK4_ALLOWED_MAX_LINE_240:' + rel + ':' + (start === 0 ? 1 : bytes.subarray(0, start).filter((value) => value === 0x0a).length + 1));
    if (end > start && (bytes[end - 1] === 0x20 || bytes[end - 1] === 0x09)) {
      throw new Error('TASK4_ALLOWED_TRAILING_WHITESPACE:' + rel);
    }
    start = index + 1;
  }
}
const allowedRows = [];
for (const rel of allowed) {
  const abs = rooted(rel);
  if (phase === 'before' && rel.endsWith('/task-4-report.md')) {
    try { fs.lstatSync(abs); throw new Error('TASK4_REPORT_EXISTS_BEFORE_IMPLEMENTATION'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    allowedRows.push({type: 'absent', path: './' + rel});
    continue;
  }
  const value = row(abs);
  if (value.type !== 'file') throw new Error('TASK4_ALLOWED_TARGET_NOT_REGULAR_FILE:' + rel);
  assertAllowedTextHygiene(abs, rel);
  allowedRows.push(value);
}
const allowedSet = new Set(allowedRows.map((value) => value.path));
const scopeRows = [];
function visit(abs) {
  const rel = './' + path.relative(root, abs).split(path.sep).join('/');
  if (rel === './.git' || rel.startsWith('./.git/') || allowedSet.has(rel)) return;
  const value = row(abs);
  scopeRows.push(value);
  if (value.type === 'dir') for (const name of fs.readdirSync(abs).sort()) visit(path.join(abs, name));
}
visit(root);
for (const values of [scopeRows, allowedRows]) values.sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(scopeOutput, scopeRows.map(JSON.stringify).join('\n') + (scopeRows.length ? '\n' : ''));
fs.writeFileSync(allowedOutput, allowedRows.map(JSON.stringify).join('\n') + '\n');
NODE
cat >"$task4_tmp/task4-status-delta.cjs" <<'NODE'
const fs = require('node:fs');
const allowed = new Set([
  'server/db.js', 'server/world.js', 'server/scheduler/store.js', 'tools/test-scheduler.js',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md'
]);
function records(filename) {
  const tokens = fs.readFileSync(filename).subarray(0).toString('binary').split('\0').filter(Boolean);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 4 || token[2] !== ' ') throw new Error('TASK4_STATUS_RECORD_INVALID');
    const xy = token.slice(0, 2), paths = [Buffer.from(token.slice(3), 'binary').toString('utf8')];
    if (xy.includes('R') || xy.includes('C')) {
      if (++i >= tokens.length) throw new Error('TASK4_STATUS_RENAME_SOURCE_MISSING');
      paths.push(Buffer.from(tokens[i], 'binary').toString('utf8'));
    }
    out.push({key: [token].concat(paths.length === 2 ? [tokens[i]] : []).map((value) => Buffer.from(value, 'binary').toString('base64')).join('|'), paths});
  }
  return out.filter((entry) => !entry.paths.every((rel) => allowed.has(rel))).map((entry) => entry.key).sort();
}
const [before, after] = process.argv.slice(2);
const a = records(before), b = records(after);
if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('TASK4_STATUS_DELTA_OUTSIDE_ALLOWLIST');
NODE
node "$task4_tmp/task4-manifest.cjs" before "$task4_tmp/scope.before.manifest" "$task4_tmp/allowed.before.manifest"
sha256sum \
  docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md \
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md \
  .superpowers/sdd/model-routing.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md \
  server/scheduler/migrations.js server/scheduler/contract.js package.json \
  >"$task4_tmp/protected.before.sha256"
printf '%s\n' "$task4_tmp"
```

Expected: cached index is empty and only the known pre-existing dirty manifest is captured. Any staged path is a stop condition; do not unstage it.

- [ ] **Step 3: Select fresh versus controller-authorized R3 execution without changing files**

Run only after Step 2 created `task4_tmp`:

```bash
set -Eeuo pipefail
test -n "${task4_tmp:-}"
test -d "$task4_tmp"
task4_r3_count=0
for task4_r3_var in \
  TASK4_R3_CONTINUATION_HANDOFF_ID \
  TASK4_R3_CONTINUATION_HANDOFF_SHA256 \
  TASK4_R3_CONTINUATION_HANDOFF_B64
do
  if test -n "${!task4_r3_var:-}"; then task4_r3_count=$((task4_r3_count + 1)); fi
done
case "$task4_r3_count" in
  0) printf 'fresh\n' >"$task4_tmp/task4-execution-route" ;;
  3) printf 'r3\n' >"$task4_tmp/task4-execution-route" ;;
  *) echo 'TASK4_R3_CONTINUATION_ENV_PARTIAL' >&2; exit 1 ;;
esac
cat "$task4_tmp/task4-execution-route"
```

Expected: exactly `fresh` or `r3`. This step is route selection only: it trusts neither a populated R3 variable nor the existing backend. The R3 task below verifies the signed controller payload, evidence, names, causes, and current file identities before it permits a corrected test-block replacement. A partial R3 environment is a hard stop.

- [ ] **Step 4: Run the Task-2 Store baseline without treating it as Task-4 GREEN (fresh route only)**

Run:

```bash
test "$(cat "$task4_tmp/task4-execution-route")" = fresh
node --test-reporter=tap tools/test-scheduler.js
```

Expected: the Task-2 registrations pass with only the documented sandbox skip. A failure is a stop condition: attach the complete TAP output to the Task-4 report and return to root-cause investigation; do not add Task-4 changes.

### Task 2: Fresh-dispatch RED — specify revision/save/job synchronization and deletion safety

**Files:**

- Modify: `tools/test-scheduler.js`.
- Verify: Task-3 event helpers and current Store replay lineage helpers.

**Consumes:** Task 3's classifier/derivation API and Task 2's lease, claim, application, replay, and root-decoration APIs.

**Produces:** executable failing tests that name the exact production behavior required below.

- [ ] **Step 1: Add deterministic Task-4 fixtures and RED tests (fresh route only)**

Require `test "$(cat "$task4_tmp/task4-execution-route")" = fresh` before this step. Add the following helpers beside the existing scheduler fixtures, then append the tests. Add `const {TheGioi} = require('../server/world.js');` beside the existing server imports. The fixture creates real `tk` and `dq` rows through the legacy two-argument `TheGioi.taoDeQuoc` before a scheduler is installed; each test's scheduler-active mutation below uses `task4Mutation`, never this setup path. It reloads canonical states through `world.nap`, uses the real Store, and cleans up every created database. Do not mock Store methods or import browser code. The R3 route must not append a duplicate block; it follows the R3 replacement step instead.

```js
function task4Rows(kho) {
  function all(sql) { return kho.db.prepare(sql).all(); }
  return {
    config: all('SELECT * FROM cauhinh ORDER BY k'),
    accounts: all('SELECT * FROM tk ORDER BY id'),
    dq: all('SELECT * FROM dq ORDER BY tk'),
    sessions: all('SELECT * FROM phien ORDER BY token'),
    alliances: all('SELECT * FROM lm ORDER BY ten'),
    allianceRequests: all('SELECT * FROM lm_xin ORDER BY lm,tk'),
    wars: all('SELECT * FROM chien ORDER BY id'),
    chat: all('SELECT * FROM chat ORDER BY id'),
    bulletins: all('SELECT * FROM bangtin ORDER BY id'),
    battles: all('SELECT * FROM tran ORDER BY id'),
    npc: all('SELECT * FROM npc ORDER BY key'),
    debris: all('SELECT * FROM pl ORDER BY td'),
    sqliteSequence: all('SELECT * FROM sqlite_sequence ORDER BY name'),
    jobs: all('SELECT * FROM event_jobs ORDER BY scheduled_at_s,priority,sequence,id'),
    applications: all('SELECT * FROM event_applications ORDER BY job_id,effective_at_s'),
    audit: all('SELECT * FROM scheduler_audit ORDER BY id'),
    meta: all('SELECT * FROM scheduler_meta ORDER BY key'),
    lease: all('SELECT * FROM scheduler_lease ORDER BY lease_name'),
    cutover: all('SELECT * FROM scheduler_cutover_snapshot ORDER BY snapshot_id'),
    ht: all('SELECT * FROM ht ORDER BY td'),
    hamdang: all('SELECT * FROM hamdang ORDER BY tkA,fid'),
    hamgiu: all('SELECT * FROM hamgiu ORDER BY tkA,fid')
  };
}

function task4Mutation(leaseToken, clock, extra) {
  return Object.assign({
    leaseToken: leaseToken,
    remainingBudget: {value: 50_000},
    effectiveNowMs: clock.nowMs()
  }, extra || {});
}

function task4AccountWakes(kho, accountId) {
  return kho.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state IN ('PENDING','RETRY_WAIT','RUNNING') ORDER BY sequence,id"
  ).all(String(accountId));
}

// Reconciliation is deliberately not an ordinary ACCOUNT_ADVANCE fixture: the
// accepted Task-2 API owns its canonical nonce and requires priority 200.
function task4ReconcileWake(x, lease, accountId, scheduledAtS) {
  var revision = Number(x.kho.db.prepare('SELECT revision FROM dq WHERE tk=?').get(accountId).revision);
  return x.store.scheduleReconcileAccountAdvance(lease, {
    kind: 'ACCOUNT_ADVANCE', aggregateType: 'account', aggregateId: String(accountId),
    expectedRevision: -1, scheduledAtS: scheduledAtS, priority: 200, maxAttempts: 8,
    payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: scheduledAtS,
      reconcile: true, reconcileRevision: revision}
  }, x.clock.nowMs());
}

function task4Batch(x, mutation, fn) {
  var value, receipts, success = false;
  function execute() {
    x.world.batDau();
    try { value = fn(); success = true; }
    finally { receipts = x.world.ketThuc(success); }
  }
  if (typeof x.world.trongMutationScheduler === 'function') {
    x.world.trongMutationScheduler(mutation, execute);
  } else execute();
  return {value: value, receipts: receipts};
}

function task4Delete(x, mutation, accountId, displayName) {
  // RED fixture fallback is deliberately transparent: absence of the new active
  // API must not prevent every deletion body from reaching its real World call.
  if (typeof x.world.trongMutationScheduler !== 'function') {
    return x.world.xoaTaiKhoan(accountId, displayName, {mutation: mutation});
  }
  x.task4ActiveDeleteMutations = x.task4ActiveDeleteMutations || [];
  return x.world.trongMutationScheduler(mutation, function () {
    x.task4ActiveDeleteMutations.push(mutation);
    return x.world.xoaTaiKhoan(accountId, displayName, {mutation: mutation});
  });
}

function task4CanonicalReadTrace(x) {
  var prepare = x.kho.db.prepare, reads = 0, restores = [];
  function wrap(statement) {
    if (!statement || statement.__task4ReadTrace) return statement;
    ['get', 'all', 'iterate'].forEach(function (name) {
      if (typeof statement[name] !== 'function') return;
      var original = statement[name];
      statement[name] = function () { reads++; return original.apply(this, arguments); };
      restores.push(function () { statement[name] = original; });
    });
    statement.__task4ReadTrace = true;
    restores.push(function () { delete statement.__task4ReadTrace; });
    return statement;
  }
  x.kho.db.prepare = function () { return wrap(prepare.apply(this, arguments)); };
  Object.keys(x.kho.q || {}).forEach(function (key) { wrap(x.kho.q[key]); });
  return {count: function () { return reads; }, restore: function () {
    x.kho.db.prepare = prepare;
    restores.reverse().forEach(function (restore) { restore(); });
  }};
}

function task4AssertActiveDelete(x, mutation, marker) {
  if (typeof x.world.trongMutationScheduler === 'function') {
    assert.strictEqual(x.task4ActiveDeleteMutations.at(-1), mutation, marker);
  }
}

// This probe is deliberately transparent until the final private World fence.
// It rejects *any* following durable write (including account/alliance/chat/
// bulletin/projection/scheduler rows), and can then make just that fence stale.
function task4FinalFenceProbe(x, mutation, tag, staleAtFence) {
  var installed = x.world._assertSchedulerFinalFence, original = installed, calls = 0,
    prepare = x.kho.db.prepare, seen = false;
  // RED must enter production first.  This fallback records a missing hook only
  // when the exercised deletion/save/creation fails to invoke it before commit.
  if (typeof original !== 'function') original = function () {};
  x.kho.db.exec('CREATE TEMP TABLE task4_final_fence_probe ' +
    '(seen INTEGER NOT NULL, allow_lease_flip INTEGER NOT NULL);' +
    'INSERT INTO task4_final_fence_probe VALUES (0,0);');
  ['cauhinh', 'dq', 'ht', 'hamdang', 'hamgiu', 'event_jobs', 'event_applications',
    'scheduler_meta', 'scheduler_audit', 'scheduler_lease', 'scheduler_cutover_snapshot',
    'tk', 'phien', 'lm', 'lm_xin', 'chien', 'chat', 'bangtin', 'tran', 'npc', 'pl'].forEach(function (table) {
    ['INSERT', 'UPDATE', 'DELETE'].forEach(function (event) {
      x.kho.db.exec('CREATE TEMP TRIGGER task4_after_final_' + table + '_' + event.toLowerCase() +
        ' AFTER ' + event + ' ON ' + table +
        ' WHEN (SELECT seen FROM task4_final_fence_probe)=1' +
        (table === 'scheduler_lease' ? ' AND (SELECT allow_lease_flip FROM task4_final_fence_probe)=0' : '') +
        ' BEGIN ' +
        "SELECT RAISE(ABORT,'TASK4_RED_WRITE_AFTER_FINAL_FENCE'); END;");
    });
  });
  x.world._assertSchedulerFinalFence = function (given) {
    assert.strictEqual(given, mutation, tag + '_MUTATION');
    calls++;
    seen = true;
    x.kho.db.prepare('UPDATE task4_final_fence_probe SET seen=1,allow_lease_flip=?')
      .run(staleAtFence ? 1 : 0);
    if (staleAtFence) x.kho.db.prepare(
      "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
    ).run();
    x.kho.db.prepare('UPDATE task4_final_fence_probe SET allow_lease_flip=0').run();
    return original.call(this, given);
  };
  // SQLite does not permit a trigger on its `sqlite_sequence` system table.
  // The transparent prepare guard covers direct sequence writes after the fence;
  // ordinary event-job sequence allocation remains before the fence and snapshots it.
  x.kho.db.prepare = function (sql) {
    if (seen && /\bsqlite_sequence\b/i.test(String(sql))) {
      throw new Error('TASK4_RED_WRITE_AFTER_FINAL_FENCE');
    }
    return prepare.apply(this, arguments);
  };
  return {finish: function () {
    x.world._assertSchedulerFinalFence = installed;
    x.kho.db.prepare = prepare;
    assert.equal(calls, 1, tag + '_HOOK');
  }};
}

function task4Fixture(t) {
  var x = taoStoreTam(fakeClock(NOW_MS));
  var world = new TheGioi(x.kho, {clock: x.clock});
  function addAccount(id, name) {
    x.kho.q.tkThem.run('task4-' + id, name, PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
    assert.equal(Number(x.kho.q.tkTheoTen.get('task4-' + id).id), id);
    var created = world.taoDeQuoc(id, name);
    assert.ok(created.st && created.nha, 'real empire fixture ' + id);
  }
  addAccount(1, 'Task4 A');
  addAccount(2, 'Task4 B');
  x.world = world;
  x.state = function (id) {
    var loaded = world.nap(id);
    assert.ok(loaded && loaded.st, 'canonical state ' + id);
    return loaded.st;
  };
  x.globalFor = function (sourceId, targetId, scheduledAtS, targetKey) {
    var ref = {kind: 'fleet', ownerAccountId: sourceId, fleetId: 91, launchAtS: 1,
      targetKey: targetKey || G.tdKey(x.state(targetId).planets[0].c),
      arrivalAtS: scheduledAtS, mission: 'attack'};
    var matchId = fixtureMatchId(ref, targetId);
    return job('pvp-resolve:' + matchId + ':' + scheduledAtS, scheduledAtS, 50, {
      kind: 'PVP_RESOLVE', aggregateType: 'match', aggregateId: matchId,
      expectedRevision: null, sourceAccountId: sourceId,
      payload: {schemaVersion: 1, matchId: matchId, ref: ref}
    });
  };
  x.globalForRef = function (ref, targetId) {
    var matchId = fixtureMatchId(ref, targetId);
    return job('pvp-resolve:' + matchId + ':' + ref.arrivalAtS, ref.arrivalAtS, 50, {
      kind: 'PVP_RESOLVE', aggregateType: 'match', aggregateId: matchId,
      expectedRevision: null, sourceAccountId: ref.ownerAccountId,
      payload: {schemaVersion: 1, matchId: matchId, ref: ref}
    });
  };
  t.after(x.dong);
  return x;
}

function task4InstallScheduler(x) {
  if (typeof x.world.datScheduler === 'function') x.world.datScheduler(x.store);
}

function task4LiveInboundRoot(x, lease, arrivalOffsetS, redTag) {
  var events = require('../server/scheduler/events.js');
  var source = x.state(1), target = x.state(2).planets[0].c;
  var targetKey = G.tdKey(target);
  assert.ok(Number.isSafeInteger(arrivalOffsetS) && arrivalOffsetS > 0,
    (redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED') + ':OFFSET');
  var arrivalAtS = source.lastTick + arrivalOffsetS;
  assert.ok(Number.isSafeInteger(arrivalAtS) && source.lastTick <= arrivalAtS,
    (redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED') + ':CHRONOLOGY');
  source.fleets.push({
    id: 91, pi: 0, tu: source.planets[0].c, den: target, mission: 'attack',
    pha: 'di', diLuc: source.lastTick, den_t: arrivalAtS,
    ships: {cargoS: 1}, cargo: {}
  });
  var derived = events.deriveExternalJobs(1, source, function (key) {
    return key === targetKey ? 2 : null;
  });
  assert.equal(derived.length, 1, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(derived[0].scheduledAtS, arrivalAtS, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  var mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, source, {mutation: mutation});
  });
  var rows = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(rows.length, 1, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(rows[0].logical_key, derived[0].idempotencyKey, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(rows[0].canonical_ref.launchAtS, source.lastTick, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(rows[0].canonical_ref.arrivalAtS, arrivalAtS, redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  assert.equal(events.canonicalExternalStatus(x.kho, rows[0].canonical_ref), 'EXACT',
    redTag || 'TASK4_RED_INBOUND_ROOT_SCHEDULED');
  return {root: x.store.getById(rows[0].logical_root_id), targetKey: targetKey, arrivalAtS: arrivalAtS};
}

function task4SeedRollbackWitnesses(x) {
  x.kho.q.cauhinhSet.run('task4-rollback-witness', 'present');
  x.kho.q.npcSet.run('1:99:1', JSON.stringify({ten: 'Task4 witness'}), NOW_S);
  x.kho.q.plSet.run('1:99:1', 7, 11);
  x.kho.q.tranThem.run(NOW_S, 1, 2, '1:99:1', 'task4-witness', 0, 0, 0);
}

test('Task 4 exposes scheduler-aware world contracts before behavior tests', function (t) {
  var x = task4Fixture(t);
  assert.equal(typeof x.world.datScheduler, 'function', 'TASK4_RED_WORLD_DAT_SCHEDULER');
  assert.equal(typeof x.world.datAdvanceService, 'function', 'TASK4_RED_WORLD_ADVANCE_SERVICE');
  assert.equal(typeof x.world.trongMutationScheduler, 'function', 'TASK4_RED_WORLD_MUTATION_GATE');
  assert.equal(typeof x.world.advanceAccountNoiBo, 'function', 'TASK4_RED_WORLD_ADVANCE_ABI');
  assert.throws(function () { x.world.datScheduler(null); }, /SCHEDULER_STORE_INVALID/);
  assert.throws(function () { x.world.datScheduler({}); }, /SCHEDULER_STORE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService(null); }, /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService({}); }, /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService({advanceTo: null}); }, /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  assert.throws(function () { x.world.datAdvanceService({advanceTo: function () { return null; }}); },
    /SCHEDULER_ADVANCE_SERVICE_INVALID/);
  x.world.datScheduler(x.store);
  assert.doesNotThrow(function () { x.world.datScheduler(x.store); }, 'TASK4_RED_WORLD_STORE_IDEMPOTENT');
  var replacementStore = Object.assign(Object.create(Object.getPrototypeOf(x.store)), x.store);
  assert.throws(function () { x.world.datScheduler(replacementStore); }, /SCHEDULER_STORE_ALREADY_INSTALLED/);
  var advanceCalls = [];
  var advanceService = {
    advanceTo: function (mutation, accountId, targetS, saveOptions) {
      advanceCalls.push([mutation, accountId, targetS, saveOptions]);
      return {processed: 0, advancedToS: targetS, nextDueAtS: null, hasMoreDue: false,
        budgetExhausted: mutation.remainingBudget.value === 0};
    }
  };
  x.world.datAdvanceService(advanceService);
  assert.doesNotThrow(function () { x.world.datAdvanceService(advanceService); }, 'TASK4_RED_WORLD_SERVICE_IDEMPOTENT');
  assert.throws(function () {
    x.world.datAdvanceService({advanceTo: function (mutation, accountId, targetS, saveOptions) { return null; }});
  }, /SCHEDULER_ADVANCE_SERVICE_ALREADY_INSTALLED/);
  var lease = layLease(x, '00000000-0000-4000-8000-000000000432');
  var before = task4Rows(x.kho), st = x.state(1), activeMutation = task4Mutation(lease, x.clock),
    wrongFirstMutation = task4Mutation(lease, x.clock);
  // Before any staging, a different first-save object and a nested active
  // context must both fail without even a canonical read or durable write.
  assert.throws(function () {
    x.world.trongMutationScheduler(activeMutation, function () {
      x.world.luu(1, st, {mutation: wrongFirstMutation});
    });
  }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_FIRST_SAVE_WRONG_OBJECT');
  assert.deepEqual(task4Rows(x.kho), before, 'TASK4_RED_FIRST_SAVE_WRONG_OBJECT');
  assert.throws(function () {
    x.world.trongMutationScheduler(activeMutation, function () {
      x.world.trongMutationScheduler(wrongFirstMutation, function () {
        x.world.luu(1, st, {mutation: wrongFirstMutation});
      });
    });
  }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_NESTED_MUTATION_OBJECT');
  assert.deepEqual(task4Rows(x.kho), before, 'TASK4_RED_NESTED_MUTATION_OBJECT');
  x.kho.q.tkThem.run('task4-invalid-creation', 'Task4 invalid creation', PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
  var invalidCreationId = Number(x.kho.q.tkTheoTen.get('task4-invalid-creation').id);
  var invalidBefore = task4Rows(x.kho), invalidReads = task4CanonicalReadTrace(x),
    invalidTransactions = 0, invalidTransaction = x.kho.trongGiaoDich, invalidReached = [];
  x.kho.trongGiaoDich = function () { invalidTransactions++; return invalidTransaction.apply(this, arguments); };
  function invokeAfterAdmission(name, invoke) {
    var mutation = task4Mutation(lease, x.clock);
    return x.world.trongMutationScheduler(mutation, function () {
      mutation.effectiveNowMs = -1;
      invalidReached.push(name);
      invoke(mutation);
    });
  }
  try {
    assert.throws(function () { invokeAfterAdmission('SAVE_NEGATIVE_EFFECTIVE_BEFORE_READ', function (mutation) {
      x.world.luu(1, st, {mutation: mutation});
    }); }, /SCHEDULER_MUTATION_INVALID/, 'TASK4_RED_SAVE_NEGATIVE_EFFECTIVE_BEFORE_READ');
    assert.throws(function () { invokeAfterAdmission('CREATION_NEGATIVE_EFFECTIVE_BEFORE_READ', function (mutation) {
      x.world.taoDeQuoc(invalidCreationId, 'Task4 invalid creation', {mutation: mutation});
    }); }, /SCHEDULER_MUTATION_INVALID/, 'TASK4_RED_CREATION_NEGATIVE_EFFECTIVE_BEFORE_READ');
    assert.throws(function () { invokeAfterAdmission('DELETE_NEGATIVE_EFFECTIVE_BEFORE_READ', function (mutation) {
      x.world.xoaTaiKhoan(2, 'B', {mutation: mutation});
    }); }, /SCHEDULER_MUTATION_INVALID/, 'TASK4_RED_DELETE_NEGATIVE_EFFECTIVE_BEFORE_READ');
  } finally {
    x.kho.trongGiaoDich = invalidTransaction;
    invalidReads.restore();
  }
  assert.equal(invalidReads.count(), 0, 'TASK4_RED_INVALID_MUTATION_BEFORE_READ');
  assert.equal(invalidTransactions, 0, 'TASK4_RED_INVALID_MUTATION_BEFORE_TRANSACTION');
  assert.deepEqual(task4Rows(x.kho), invalidBefore, 'TASK4_RED_INVALID_MUTATION_BEFORE_WRITE');
  assert.deepEqual(invalidReached, ['SAVE_NEGATIVE_EFFECTIVE_BEFORE_READ', 'CREATION_NEGATIVE_EFFECTIVE_BEFORE_READ',
    'DELETE_NEGATIVE_EFFECTIVE_BEFORE_READ'], 'TASK4_RED_INVALID_MUTATION_ENTRYPOINT_REACHED');
  before = invalidBefore;
  [null, {}, {leaseToken: {}}, {leaseToken: {ownerId: 'x', generation: 1}},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: null, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: -1}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1.5}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 50_001}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: '1'}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: Number.MAX_SAFE_INTEGER + 1}, effectiveNowMs: NOW_MS},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}, effectiveNowMs: -1},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}, effectiveNowMs: NaN},
    {leaseToken: {ownerId: 'x', generation: 1}, remainingBudget: {value: 1}, effectiveNowMs: Infinity}
  ].forEach(function (mutation) {
    assert.throws(function () {
      x.world.trongMutationScheduler(mutation, function () { x.world.luu(1, st, {mutation: mutation}); });
    }, /SCHEDULER_MUTATION_(TOKEN_REQUIRED|INVALID)/);
  });
  assert.deepEqual(task4Rows(x.kho), before);
  var identityA = task4Mutation(lease, x.clock), identityB = task4Mutation(lease, x.clock),
    transactionCalls = 0, transaction = x.kho.trongGiaoDich, beforeIdentity = task4Rows(x.kho),
    beforeDepth = x.kho.transactionDepth, beforeRollbackOnly = x.kho.transactionRollbackOnly;
  // Cover every canonical statement surface xoa can reach, including a newly
  // prepared statement.  Rejected identity/context calls must fail before it.
  var deleteReadTrace = task4CanonicalReadTrace(x);
  x.kho.trongGiaoDich = function () { transactionCalls++; return transaction.apply(this, arguments); };
  try {
    assert.throws(function () {
      x.world.xoaTaiKhoan(2, 'B', {mutation: identityA});
    }, /SCHEDULER_MUTATION_TOKEN_REQUIRED/, 'TASK4_RED_DELETE_ACTIVE_MUTATION_REQUIRED');
    assert.throws(function () {
      x.world.trongMutationScheduler(identityA, function () {
        x.world.xoaTaiKhoan(2, 'B', {mutation: identityB});
      });
    }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_DELETE_MUTATION_IDENTITY');
  } finally {
    x.kho.trongGiaoDich = transaction;
    deleteReadTrace.restore();
  }
  assert.equal(deleteReadTrace.count(), 0, 'TASK4_RED_DELETE_BEFORE_READ');
  assert.equal(transactionCalls, 0, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.equal(x.kho.transactionDepth, beforeDepth, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.equal(x.kho.transactionRollbackOnly, beforeRollbackOnly, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.deepEqual(task4Rows(x.kho), beforeIdentity, 'TASK4_RED_DELETE_BEFORE_TRANSACTION');
  assert.equal(task4Delete(x, identityA, 2, 'B'), null, 'TASK4_RED_DELETE_SAME_MUTATION_IDENTITY');
  task4AssertActiveDelete(x, identityA, 'TASK4_RED_DELETE_SAME_MUTATION_IDENTITY');
  var checkpoint = x.state(1);
  checkpoint.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: checkpoint.lastTick + 1});
  var exhaustedBudget = {value: 1};
  var partial = G.tick(checkpoint, checkpoint.lastTick + 1, {
    ownerAccountId: 1, remainingBudget: exhaustedBudget
  });
  assert.equal(partial.processed, 1, 'Task-3 final primitive is actually consumed');
  assert.equal(exhaustedBudget.value, 0, 'Task-3 leaves the same context at zero');
  var zeroMutation = task4Mutation(lease, x.clock, {remainingBudget: exhaustedBudget});
  task4Batch(x, zeroMutation, function () {
    x.world.luu(1, checkpoint, {mutation: zeroMutation});
  });
  assert.equal(Number(x.kho.db.prepare('SELECT revision FROM dq WHERE tk=1').get().revision), 1,
    'TASK4_RED_ZERO_BUDGET_CHECKPOINT');
  assert.strictEqual(zeroMutation.remainingBudget, exhaustedBudget);
  assert.equal(exhaustedBudget.value, 0);
  var zeroSaveOptions = {currentAccountAdvanceJobId: null, deferAccountWake: true};
  var outcome = x.world.trongMutationScheduler(zeroMutation, function () {
    return x.world.advanceAccountNoiBo(zeroMutation, 1, checkpoint.lastTick + 1, zeroSaveOptions);
  });
  assert.strictEqual(advanceCalls[0][0], zeroMutation);
  assert.deepEqual(advanceCalls[0].slice(1), [1, checkpoint.lastTick + 1, zeroSaveOptions]);
  assert.equal(outcome.budgetExhausted, true);
});

test('Task 4 reaches every scheduler surface and mutation-first ABI call in RED', function (t) {
  var x = task4Fixture(t), calls = [], activeCalls = [], failures = [], insideActiveCallback = false;
  var lease = layLease(x, '00000000-0000-4000-8000-000000000436');
  var mutation = task4Mutation(lease, x.clock, {remainingBudget: {value: 0}});
  function attempt(name, fn) {
    try { fn(); } catch (error) { failures.push(name + ':' + error.message); }
  }
  attempt('datScheduler', function () { x.world.datScheduler(x.store); });
  attempt('datAdvanceService', function () {
    x.world.datAdvanceService({advanceTo: function (m, accountId, targetS, saveOptions) {
      calls.push([m, accountId, targetS, saveOptions]);
      activeCalls.push(insideActiveCallback);
      return {budgetExhausted: true};
    }});
  });
  attempt('trongMutationScheduler+advanceAccountNoiBo', function () {
    x.world.trongMutationScheduler(mutation, function () {
      insideActiveCallback = true;
      try {
        // This is deliberately before luu: an initial missing save surface may
        // not make the frozen mutation-first delegation vacuous.
        x.world.advanceAccountNoiBo(mutation, 1, x.state(1).lastTick, {deferAccountWake: true});
        x.world.luu(1, x.state(1), {mutation: mutation});
      } finally { insideActiveCallback = false; }
    });
  });
  // Collect rather than throw after each check: all four calls and each ABI
  // check run even while the initial RED lacks every Task-4 surface.
  var contractFailures = [];
  if (failures.length !== 0) contractFailures.push('TASK4_RED_ALL_SURFACES_REACHED:' + failures.join('|'));
  if (calls.length !== 1) contractFailures.push('TASK4_RED_ABI_EXACT_ONCE:' + calls.length);
  if (calls.length === 1 && calls[0][0] !== mutation) {
    contractFailures.push('TASK4_RED_ABI_ARGUMENT_ORDER:mutation');
  }
  if (calls.length === 1 && JSON.stringify(calls[0].slice(1)) !==
      JSON.stringify([1, x.state(1).lastTick, {deferAccountWake: true}])) {
    contractFailures.push('TASK4_RED_ABI_ARGUMENT_ORDER:args');
  }
  if (calls.length === 1 && activeCalls[0] !== true) {
    contractFailures.push('TASK4_RED_ABI_ACTIVE_CALLBACK_REQUIRED');
  }
  if (insideActiveCallback) contractFailures.push('TASK4_RED_ABI_ACTIVE_CALLBACK_LEAK');
  assert.deepEqual(contractFailures, [], contractFailures.join(';'));
});

test('Task 4 coalesces two same-batch saves into one revision and one local wake', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000401');
  task4InstallScheduler(x);
  var st = x.state(1), mutation = task4Mutation(lease, x.clock), firstReceipt, secondReceipt;
  st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: st.lastTick + 120});
  var batch = task4Batch(x, mutation, function () {
    firstReceipt = x.world.luu(1, st, {mutation: mutation});
    st.msgs.push({t: st.lastTick, doc: false, loai: 'he', td: 'coalesce'});
    secondReceipt = x.world.luu(1, st, {mutation: mutation});
  });
  var dq = x.kho.db.prepare('SELECT revision,state FROM dq WHERE tk=1').get();
  var wakes = x.kho.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id='1' " +
    "AND state IN ('PENDING','RETRY_WAIT','RUNNING') ORDER BY sequence,id"
  ).all();
  assert.equal(Number(dq.revision), 1, 'TASK4_RED_COALESCED_SINGLE_REVISION');
  assert.equal(JSON.parse(dq.state).msgs.at(-1).td, 'coalesce');
  assert.equal(wakes.length, 1);
  assert.equal(Number(wakes[0].expected_revision), 1);
  assert.equal(Number(wakes[0].scheduled_at_s), st.lastTick + 120);
  assert.strictEqual(secondReceipt, firstReceipt);
  assert.deepEqual(firstReceipt, {revision: 1, nextLocalAtS: st.lastTick + 120});
  assert.ok(batch.receipts instanceof Map, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(Object.getPrototypeOf(batch.receipts), Map.prototype, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.deepEqual(Array.from(batch.receipts.entries()), [[1, firstReceipt]], 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(batch.receipts.get(1), firstReceipt);
});

test('Task 4 coalesces distinct state objects with sticky reducer options and conflicts', function (t) {
  function runOrder(firstReducer) {
    var x = task4Fixture(t), lease = layLease(x, firstReducer ?
      '00000000-0000-4000-8000-000000000429' : '00000000-0000-4000-8000-000000000430');
    task4InstallScheduler(x);
    var current = x.kho.trongGiaoDich(function () {
      var pending = task4ReconcileWake(x, lease, 1, NOW_S + 70);
      return x.store.claimForResolution(lease, pending.id, x.clock.nowMs(), 15_000, {
        allowFuturePending: true
      });
    }, {immediate: true});
    assert.match(current.idempotency_key, /^reconcile:account:1:0:[1-9][0-9]*:[1-9][0-9]*$/,
      'TASK4_RED_STICKY_RECONCILE_KEY');
    assert.equal(String(current.aggregate_id), '1');
    assert.equal(Number(current.expected_revision), -1);
    assert.equal(Number(current.priority), 200, 'TASK4_RED_STICKY_RECONCILE_PRIORITY');
    assert.equal(JSON.parse(current.payload_json).reconcile, true, 'TASK4_RED_STICKY_RECONCILE_PRIORITY');
    var currentBefore = x.store.getById(current.id);
    var one = x.state(1), two = JSON.parse(JSON.stringify(one));
    one.msgs.push({t: one.lastTick, doc: false, loai: 'he', td: 'first'});
    two.msgs.push({t: two.lastTick, doc: false, loai: 'he', td: 'second'});
    var mutation = task4Mutation(lease, x.clock), reducer = {
      currentAccountAdvanceJobId: current.id, deferAccountWake: true
    }, firstReceipt, secondReceipt;
    assert.equal(Object.hasOwn(mutation, 'currentAccountAdvanceJobId'), false,
      'TASK4_RED_STICKY_OPTIONS_NOT_MUTATION');
    assert.equal(Object.hasOwn(mutation, 'deferAccountWake'), false,
      'TASK4_RED_STICKY_OPTIONS_NOT_MUTATION');
    task4Batch(x, mutation, function () {
      firstReceipt = x.world.luu(1, firstReducer ? one : two,
        firstReducer ? Object.assign({mutation: mutation}, reducer) : {mutation: mutation});
      secondReceipt = x.world.luu(1, firstReducer ? two : one,
        firstReducer ? {mutation: mutation} : Object.assign({mutation: mutation}, reducer));
    });
    assert.strictEqual(firstReceipt, secondReceipt);
    assert.equal(x.state(1).msgs.at(-1).td, firstReducer ? 'second' : 'first');
    assert.equal(Number(x.kho.db.prepare('SELECT revision FROM dq WHERE tk=1').get().revision), 1,
      'TASK4_RED_STICKY_COALESCED_REVISION');
    assert.deepEqual(x.store.getById(current.id), currentBefore,
      'TASK4_RED_STICKY_CURRENT_WAKE_RETAINED');
    assert.equal(task4AccountWakes(x.kho, 1).filter(function (row) {
      return row.state === 'PENDING' || row.state === 'RETRY_WAIT';
    }).length, 0);
    var before = task4Rows(x.kho);
    assert.throws(function () {
      task4Batch(x, mutation, function () {
        var conflict = Object.assign({mutation: mutation}, reducer, {currentAccountAdvanceJobId: 'task4-conflict'});
        var sticky = Object.assign({mutation: mutation}, reducer);
        x.world.luu(1, one, firstReducer ? sticky : conflict);
        x.world.luu(1, two, firstReducer ? conflict : sticky);
      });
    }, /SCHEDULER_ACCOUNT_JOB_CONFLICT/);
    assert.deepEqual(task4Rows(x.kho), before);
    var otherMutation = task4Mutation(lease, x.clock);
    assert.throws(function () {
      task4Batch(x, mutation, function () {
        x.world.luu(1, one, {mutation: mutation});
        x.world.luu(1, two, {mutation: otherMutation});
      });
    }, /SCHEDULER_MUTATION_TOKEN_CONFLICT/, 'TASK4_RED_STICKY_MUTATION_CONFLICT');
    assert.deepEqual(task4Rows(x.kho), before);
  }
  runOrder(true);
  runOrder(false);
});

test('Task 4 scheduler-aware account creation writes one initial local wake', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000427');
  task4InstallScheduler(x);
  x.kho.q.tkThem.run('task4-3', 'Task4 C', PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
  assert.equal(Number(x.kho.q.tkTheoTen.get('task4-3').id), 3);
  var mutation = task4Mutation(lease, x.clock), created;
  var batch = task4Batch(x, mutation, function () {
    created = x.world.taoDeQuoc(3, 'Task4 C', {mutation: mutation});
  });
  assert.ok(created.st && created.nha);
  var expected = G.phanLoaiSuKienNoiBoKe(created.st, 3, function () { return null; });
  var wakes = task4AccountWakes(x.kho, 3);
  assert.equal(wakes.length, 1, 'TASK4_RED_INITIAL_ACCOUNT_ADVANCE_WAKE');
  assert.equal(Number(wakes[0].expected_revision), 0);
  assert.equal(Number(wakes[0].scheduled_at_s), expected.atS);
  assert.ok(created.receipt, 'scheduler account creation returns its batch receipt');
  assert.deepEqual(created.receipt, {revision: 0, nextLocalAtS: expected.atS});
  assert.ok(batch.receipts instanceof Map, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(Object.getPrototypeOf(batch.receipts), Map.prototype, 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.deepEqual(Array.from(batch.receipts.entries()), [[3, created.receipt]], 'TASK4_RED_BATCH_RECEIPTS_REAL_MAP');
  assert.strictEqual(batch.receipts.get(3), created.receipt);
});

test('Task 4 deletion atomically invalidates an outbound root after canonical absence', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000402');
  task4InstallScheduler(x);
  var ambientNowMs = x.clock.nowMs(), mutationNowMs = ambientNowMs + 4_000;
  var mutation = task4Mutation(lease, x.clock, {effectiveNowMs: mutationNowMs});
  var root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, 200), x.clock.nowMs());
  }, {immediate: true});
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), 200);
  assert.equal(task4Delete(x, mutation, 1, 'A'), null);
  task4AssertActiveDelete(x, mutation, 'TASK4_RED_OUTBOUND_ACTIVE_MUTATION');
  assert.equal(x.kho.db.prepare('SELECT 1 FROM dq WHERE tk=1').get(), undefined);
  assert.equal(x.store.getById(root.id).state, 'CANCELLED', 'TASK4_RED_OUTBOUND_CANONICAL_INVALIDATION');
  assert.equal(x.store.getById(root.id).cancel_reason, 'ENTITY_REMOVED');
  var application = x.kho.db.prepare(
    'SELECT effective_at_s,applied_at_ms,result_json FROM event_applications WHERE job_id=?'
  ).get(root.id);
  assert.equal(Number(application.effective_at_s), 200);
  assert.deepEqual(JSON.parse(application.result_json), {
    code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'ALREADY_ABSENT'
  });
  assert.equal(Number(application.applied_at_ms), mutationNowMs);
  assert.equal(Number(x.store.getById(root.id).cancelled_at_ms), mutationNowMs);
  assert.equal(Number(x.store.getById(root.id).updated_at_ms), mutationNowMs);
  assert.equal(x.kho.db.prepare('SELECT khi FROM bangtin ORDER BY id DESC LIMIT 1').get().khi,
    Math.floor(mutationNowMs / 1000));
  assert.equal(x.kho.transactionDepth, 0);
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), null);
});

test('Task 4 deletion invalidates an inbound target root with a Task-2-valid result', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000403');
  task4InstallScheduler(x);
  var live = task4LiveInboundRoot(x, lease, 210, 'TASK4_RED_INBOUND_TARGET_ROOT'), root = live.root;
  assert.equal(live.targetKey, G.tdKey(x.state(2).planets[0].c));
  var beforeRejectedEvidence = task4Rows(x.kho);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'EXACT', Number(root.scheduled_at_s),
        x.clock.nowMs());
    }, {immediate: true});
  }, /CANONICAL_NEUTRALIZATION_REQUIRED/);
  assert.deepEqual(task4Rows(x.kho), beforeRejectedEvidence);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'EXACT', Number(root.scheduled_at_s),
        x.clock.nowMs(), {targetRemovedKey: '1:99:99'});
    }, {immediate: true});
  }, /TARGET_REMOVAL_EVIDENCE_INVALID/);
  assert.deepEqual(task4Rows(x.kho), beforeRejectedEvidence);
  var inboundMutation = task4Mutation(lease, x.clock);
  assert.equal(task4Delete(x, inboundMutation, 2, 'B'), null);
  task4AssertActiveDelete(x, inboundMutation, 'TASK4_RED_INBOUND_ACTIVE_MUTATION');
  assert.ok(x.kho.db.prepare('SELECT 1 FROM dq WHERE tk=1').get());
  assert.equal(x.store.getById(root.id).state, 'CANCELLED', 'TASK4_RED_INBOUND_TARGET_ROOT');
  var application = x.kho.db.prepare(
    'SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?'
  ).get(root.id);
  assert.equal(Number(root.scheduled_at_s), live.arrivalAtS, 'TASK4_RED_INBOUND_TARGET_ROOT');
  assert.equal(Number(application.effective_at_s), live.arrivalAtS);
  assert.deepEqual(JSON.parse(application.result_json), {code: 'ENTITY_REMOVED'});
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), null);
});

test('Task 4 classifies inbound exact absent and mismatch roots before target deletion', function (t) {
  var events = require('../server/scheduler/events.js');
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000428');
  task4InstallScheduler(x);
  var live = task4LiveInboundRoot(x, lease, 212, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  var exact = live.root;
  var exactRef = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).find(function (row) {
    return row.logical_root_id === exact.id;
  }).canonical_ref;
  var targetKey = G.tdKey(x.state(2).planets[0].c);
  var absentRef = {kind: 'fleet', ownerAccountId: 1, fleetId: 92, launchAtS: x.state(1).lastTick,
    targetKey: targetKey, arrivalAtS: live.arrivalAtS + 1, mission: 'attack'};
  var mismatchRef = {kind: 'fleet', ownerAccountId: 1, fleetId: 91,
    launchAtS: x.state(1).lastTick, targetKey: targetKey, arrivalAtS: live.arrivalAtS + 2, mission: 'attack'};
  var roots = x.kho.trongGiaoDich(function () {
    return [exact, x.store.schedule(lease, x.globalForRef(absentRef, 2), x.clock.nowMs()),
      x.store.schedule(lease, x.globalForRef(mismatchRef, 2), x.clock.nowMs())];
  }, {immediate: true});
  assert.equal(events.canonicalExternalStatus(x.kho, exactRef), 'EXACT',
    'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(events.canonicalExternalStatus(x.kho, absentRef), 'ALREADY_ABSENT',
    'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(events.canonicalExternalStatus(x.kho, mismatchRef), 'REF_MISMATCH',
    'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  var classifiedMutation = task4Mutation(lease, x.clock);
  assert.equal(task4Delete(x, classifiedMutation, 2, 'B'), null);
  task4AssertActiveDelete(x, classifiedMutation, 'TASK4_RED_CLASSIFIED_ACTIVE_MUTATION');
  var exactApp = x.kho.db.prepare('SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?')
    .get(roots[0].id);
  assert.equal(Number(roots[0].scheduled_at_s), live.arrivalAtS, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(Number(roots[1].scheduled_at_s), live.arrivalAtS + 1, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(Number(roots[2].scheduled_at_s), live.arrivalAtS + 2, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
  assert.equal(Number(exactApp.effective_at_s), live.arrivalAtS);
  assert.deepEqual(JSON.parse(exactApp.result_json), {code: 'ENTITY_REMOVED'});
  [roots[1], roots[2]].forEach(function (root, index) {
    var app = x.kho.db.prepare('SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?')
      .get(root.id);
    assert.ok(app, 'TASK4_RED_INBOUND_CLASSIFICATION_ROOT');
    assert.equal(Number(app.effective_at_s), live.arrivalAtS + index + 1);
    assert.deepEqual(JSON.parse(app.result_json), {
      code: 'ENTITY_REMOVED', invalidation: 'canonical',
      neutralization: index === 0 ? 'ALREADY_ABSENT' : 'REF_MISMATCH'
    });
    assert.equal(x.store.getById(root.id).state, 'CANCELLED');
  });
});

test('Task 4 deletion preserves a PENDING or RETRY_WAIT replay child', function (t) {
  ['PENDING', 'RETRY_WAIT'].forEach(function (state, index) {
    var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-00000000040' + (4 + index));
    task4InstallScheduler(x);
    var root = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, x.globalFor(1, 2, 220 + index), x.clock.nowMs());
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(row.id);
      return row;
    }, {immediate: true});
    var child = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, replayJobFrom(x.store.getById(root.id), 'task4-' + String(state).toLowerCase()), x.clock.nowMs());
    }, {immediate: true});
    var local = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:' + index, 220 + index, 100), x.clock.nowMs());
    }, {immediate: true});
    if (state === 'RETRY_WAIT') danhDauRetry(x.kho, child.idempotency_key, x.clock.nowMs() + 60_000);
    var before = x.kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(child.id);
    var deleteMutation = task4Mutation(lease, x.clock);
    assert.equal(task4Delete(x, deleteMutation, 1, 'A'), null);
    task4AssertActiveDelete(x, deleteMutation, 'TASK4_RED_REPLAY_ACTIVE_MUTATION');
    assert.equal(x.store.getById(root.id).state, 'QUARANTINED');
    assert.deepEqual(x.kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(child.id), before);
    assert.equal(x.store.getById(local.id).state, 'CANCELLED', 'TASK4_RED_REPLAY_LOCAL_CANCELLATION');
    assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id IN (?,?)').get(root.id, child.id).n, 0);
    assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), 220 + index);
  });
});

test('Task 4 deletes a future RETRY_WAIT root only with a live lease fence', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000406');
  task4InstallScheduler(x);
  var root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, 230), x.clock.nowMs());
  }, {immediate: true});
  danhDauRetry(x.kho, root.idempotency_key, x.clock.nowMs() + 600_000);
  var retryMutation = task4Mutation(lease, x.clock);
  assert.equal(task4Delete(x, retryMutation, 1, 'A'), null);
  task4AssertActiveDelete(x, retryMutation, 'TASK4_RED_RETRY_ACTIVE_MUTATION');
  assert.equal(x.store.getById(root.id).state, 'CANCELLED', 'TASK4_RED_RETRY_WAIT_INVALIDATION');
  var y = task4Fixture(t), stale = layLease(y, '00000000-0000-4000-8000-000000000407');
  task4InstallScheduler(y);
  var protectedRoot = y.kho.trongGiaoDich(function () {
    return y.store.schedule(stale, y.globalFor(1, 2, 231), y.clock.nowMs());
  }, {immediate: true});
  danhDauRetry(y.kho, protectedRoot.idempotency_key, y.clock.nowMs() + 600_000);
  y.kho.db.prepare("UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'").run();
  var before = task4Rows(y.kho);
  assert.throws(function () {
    task4Delete(y, task4Mutation(stale, y.clock), 1, 'A');
  }, /LEASE_LOST/);
  assert.deepEqual(task4Rows(y.kho), before);
});

test('Task 4 deletion owns or joins one rollback-only UoW without nested begin', function (t) {
  function instrument(x) {
    var exec = x.kho.db.exec, tx = x.kho.trongGiaoDich, sql = [], depths = [];
    x.kho.db.exec = function (statement) { sql.push(statement); return exec.call(this, statement); };
    x.kho.trongGiaoDich = function (fn, options) {
      return tx.call(this, function () { depths.push(x.kho.transactionDepth); return fn(); }, options);
    };
    return {sql: sql, depths: depths, restore: function () { x.kho.db.exec = exec; x.kho.trongGiaoDich = tx; }};
  }
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000439');
  task4InstallScheduler(x);
  x.kho.trongGiaoDich(function () { x.store.schedule(lease, x.globalFor(1, 2, 245), x.clock.nowMs()); }, {immediate: true});
  var direct = instrument(x);
  assert.equal(x.kho.transactionDepth, 0, 'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(task4Delete(x, task4Mutation(lease, x.clock), 1, 'A'), null,
    'TASK4_RED_UOW_OWNERSHIP');
  direct.restore();
  assert.equal(direct.sql.filter(function (s) { return /^BEGIN IMMEDIATE/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(direct.sql.filter(function (s) { return /^COMMIT/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.ok(direct.depths.every(function (depth) { return depth > 0; }),
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(x.kho.transactionDepth, 0, 'TASK4_RED_UOW_OWNERSHIP');
  var y = task4Fixture(t), yLease = layLease(y, '00000000-0000-4000-8000-000000000440');
  task4InstallScheduler(y);
  y.kho.trongGiaoDich(function () { y.store.schedule(yLease, y.globalFor(1, 2, 246), y.clock.nowMs()); }, {immediate: true});
  var joined = instrument(y), outerDepth, joinedMutation = task4Mutation(yLease, y.clock);
  var joinedFence = task4FinalFenceProbe(y, joinedMutation, 'TASK4_RED_UOW_FINALIZER', false);
  try {
    y.kho.trongGiaoDich(function () {
      outerDepth = y.kho.transactionDepth;
      task4Delete(y, joinedMutation, 1, 'A');
      y.kho.q.cauhinhSet.run('task4-after-xoa-before-finalizer', 'present');
      assert.equal(y.kho.transactionDepth, outerDepth, 'TASK4_RED_UOW_OWNERSHIP');
    }, {immediate: true});
  } finally { joinedFence.finish(); }
  joined.restore();
  assert.equal(joined.sql.filter(function (s) { return /^BEGIN IMMEDIATE/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(joined.sql.filter(function (s) { return /^COMMIT/.test(s); }).length, 1,
    'TASK4_RED_UOW_OWNERSHIP');
  assert.ok(joined.depths.some(function (depth) { return depth > outerDepth; }),
    'TASK4_RED_UOW_OWNERSHIP');
  assert.equal(y.kho.transactionDepth, 0, 'TASK4_RED_UOW_OWNERSHIP');
  var lifecycle = task4Fixture(t), order = [], a = function () { order.push('a'); },
    b = function () { order.push('b'); }, c = function () { order.push('c'); };
  assert.throws(function () { lifecycle.kho.dangKySchedulerFinalizer(a); },
    /SCHEDULER_FINALIZER_TRANSACTION_REQUIRED/, 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  assert.throws(function () { lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(null);
  }, {immediate: true}); }, /SCHEDULER_FINALIZER_INVALID/, 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(a);
    lifecycle.kho.dangKySchedulerFinalizer(a); // identity dedupe
    lifecycle.kho.dangKySchedulerFinalizer(b);
    lifecycle.kho.trongGiaoDich(function () { lifecycle.kho.dangKySchedulerFinalizer(c); }, {immediate: true});
  }, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  // This is deliberately before every rollback-path case: an empty *new*
  // committed UoW proves that successful COMMIT reset the prior FIFO/dedupe
  // registry, rather than merely observing a later rollback cleanup.
  lifecycle.kho.trongGiaoDich(function () {}, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_COMMIT_RESET');
  assert.throws(function () { lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(function () { order.push('rollback'); });
    throw new Error('TASK4_CALLBACK_ROLLBACK');
  }, {immediate: true}); }, /TASK4_CALLBACK_ROLLBACK/);
  lifecycle.kho.trongGiaoDich(function () {}, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  var finalizerFailure = new Error('TASK4_FINALIZER_FAILURE');
  assert.throws(function () { lifecycle.kho.trongGiaoDich(function () {
    lifecycle.kho.dangKySchedulerFinalizer(function () { throw finalizerFailure; });
  }, {immediate: true}); }, function (error) {
    assert.strictEqual(error, finalizerFailure, 'TASK4_RED_UOW_FINALIZER_IDENTITY');
    return true;
  }, 'TASK4_RED_UOW_FINALIZER_IDENTITY');
  lifecycle.kho.trongGiaoDich(function () {}, {immediate: true});
  assert.deepEqual(order, ['a', 'b', 'c'], 'TASK4_RED_UOW_FINALIZER_LIFECYCLE');
  var z = task4Fixture(t), zLease = layLease(z, '00000000-0000-4000-8000-000000000441');
  task4InstallScheduler(z);
  z.kho.trongGiaoDich(function () { z.store.schedule(zLease, z.globalFor(1, 2, 247), z.clock.nowMs()); }, {immediate: true});
  var failedJoin = instrument(z), beforeRollback = task4Rows(z.kho), sawRollbackOnly = false;
  var zMutation = task4Mutation(zLease, z.clock);
  var zFence = task4FinalFenceProbe(z, zMutation, 'TASK4_RED_UOW_FINALIZER', true);
  try {
    assert.throws(function () {
      z.kho.trongGiaoDich(function () {
        assert.ok(z.kho.transactionDepth > 0, 'TASK4_RED_UOW_ROLLBACK_ONLY');
        try {
          task4Delete(z, zMutation, 1, 'A');
          z.kho.q.cauhinhSet.run('task4-after-xoa-before-fault-finalizer', 'present');
        } catch (error) {
          sawRollbackOnly = z.kho.transactionRollbackOnly === true;
          throw error;
        }
      }, {immediate: true});
    }, /LEASE_LOST/, 'TASK4_RED_UOW_FINALIZER');
  } finally { zFence.finish(); }
  failedJoin.restore();
  assert.equal(sawRollbackOnly, false, 'TASK4_RED_UOW_FINALIZER_AFTER_CALLBACK');
  assert.equal(failedJoin.sql.filter(function (s) { return /^BEGIN IMMEDIATE/.test(s); }).length, 1,
    'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.equal(failedJoin.sql.filter(function (s) { return /^COMMIT/.test(s); }).length, 0,
    'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.equal(failedJoin.sql.filter(function (s) { return /^ROLLBACK/.test(s); }).length, 1,
    'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.deepEqual(task4Rows(z.kho), beforeRollback, 'TASK4_RED_UOW_ROLLBACK_ONLY');
  assert.equal(z.kho.transactionDepth, 0, 'TASK4_RED_UOW_ROLLBACK_ONLY');
});

test('Task 4 final lease fence proves deletion placement then rolls back protected globals', function (t) {
  function setup(ownerId) {
    var x = task4Fixture(t), lease = layLease(x, ownerId);
    task4InstallScheduler(x);
    var protectedRows = x.kho.trongGiaoDich(function () {
      var running = x.store.schedule(lease, x.globalFor(1, 2, 240), x.clock.nowMs());
      running = x.store.claimForResolution(lease, running.id, x.clock.nowMs(), 15_000, {allowFuturePending: true});
      var source = x.store.schedule(lease, x.globalFor(1, 2, 241), x.clock.nowMs());
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(source.id);
      var replay = x.store.schedule(lease, replayJobFrom(x.store.getById(source.id), 'task4-final-fence'), x.clock.nowMs());
      return {running: running, source: source, replay: replay};
    }, {immediate: true});
    return {x: x, lease: lease, rows: protectedRows};
  }
  var placed = setup('00000000-0000-4000-8000-000000000408');
  var placementMutation = task4Mutation(placed.lease, placed.x.clock);
  var placement = task4FinalFenceProbe(placed.x, placementMutation,
    'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE', false);
  try {
    assert.doesNotThrow(function () { task4Delete(placed.x, placementMutation, 1, 'A'); });
  } finally { placement.finish(); }
  [placed.rows.running.id, placed.rows.source.id, placed.rows.replay.id].forEach(function (id) {
    assert.ok(placed.x.store.getById(id), 'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE');
  });
  var failed = setup('00000000-0000-4000-8000-000000000442');
  task4SeedRollbackWitnesses(failed.x);
  var before = task4Rows(failed.x.kho), faultMutation = task4Mutation(failed.lease, failed.x.clock);
  var fault = task4FinalFenceProbe(failed.x, faultMutation,
    'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE', true);
  try {
    assert.throws(function () { task4Delete(failed.x, faultMutation, 1, 'A'); }, /LEASE_LOST/,
      'TASK4_RED_FINAL_PRECOMMIT_LEASE_FENCE');
  } finally { fault.finish(); }
  assert.deepEqual(task4Rows(failed.x.kho), before);
  [failed.rows.running.id, failed.rows.source.id, failed.rows.replay.id].forEach(function (id) {
    assert.deepEqual(failed.x.store.getById(id), before.jobs.find(function (row) { return row.id === id; }));
  });
});

test('Task 4 final save fence proves placement then rolls back after local synchronization', function (t) {
  function setup(ownerId) {
    var x = task4Fixture(t), lease = layLease(x, ownerId), changed;
    task4InstallScheduler(x);
    changed = x.state(1);
    changed.msgs.push({t: changed.lastTick, doc: false, loai: 'he', td: 'save-lease-fence'});
    changed.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: changed.lastTick + 120});
    assert.equal(task4AccountWakes(x.kho, 1).length, 0, 'TASK4_RED_SAVE_FINAL_FENCE_PRECONDITION');
    assert.equal(x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).length, 0,
      'TASK4_RED_SAVE_FINAL_FENCE_PRECONDITION');
    return {x: x, lease: lease, changed: changed};
  }
  var placed = setup('00000000-0000-4000-8000-000000000433');
  var placementMutation = task4Mutation(placed.lease, placed.x.clock);
  var placement = task4FinalFenceProbe(placed.x, placementMutation, 'TASK4_RED_SAVE_LEASE_FENCE', false);
  try {
    assert.doesNotThrow(function () { task4Batch(placed.x, placementMutation, function () {
      placed.x.world.luu(1, placed.changed, {mutation: placementMutation});
    }); });
    assert.throws(function () {
      placed.x.kho.db.prepare("UPDATE sqlite_sequence SET seq=seq WHERE name='event_jobs'").run();
    }, /TASK4_RED_WRITE_AFTER_FINAL_FENCE/, 'TASK4_RED_SAVE_SEQUENCE_AFTER_FINAL_FENCE');
  } finally { placement.finish(); }
  assert.equal(task4AccountWakes(placed.x.kho, 1).length, 1, 'TASK4_RED_SAVE_LEASE_FENCE');
  var failed = setup('00000000-0000-4000-8000-000000000443');
  task4SeedRollbackWitnesses(failed.x);
  var before = task4Rows(failed.x.kho), faultMutation = task4Mutation(failed.lease, failed.x.clock);
  var fault = task4FinalFenceProbe(failed.x, faultMutation, 'TASK4_RED_SAVE_LEASE_FENCE', true);
  try {
    assert.throws(function () { task4Batch(failed.x, faultMutation, function () {
      failed.x.world.luu(1, failed.changed, {mutation: faultMutation});
    }); }, /LEASE_LOST/, 'TASK4_RED_SAVE_LEASE_FENCE');
  } finally { fault.finish(); }
  assert.deepEqual(task4Rows(failed.x.kho), before,
    'dq state/revision, projections, jobs/applications, metadata, witnesses, and sequence roll back');
  var joined = setup('00000000-0000-4000-8000-000000000445');
  var joinedMutation = task4Mutation(joined.lease, joined.x.clock);
  var joinedFence = task4FinalFenceProbe(joined.x, joinedMutation, 'TASK4_RED_SAVE_JOINED_FINALIZER', false);
  try {
    assert.doesNotThrow(function () { joined.x.kho.trongGiaoDich(function () {
      task4Batch(joined.x, joinedMutation, function () {
        joined.x.world.luu(1, joined.changed, {mutation: joinedMutation});
      });
      joined.x.kho.q.cauhinhSet.run('task4-save-caller-write-before-finalizer', 'present');
    }, {immediate: true}); }, 'TASK4_RED_SAVE_JOINED_FINALIZER');
  } finally { joinedFence.finish(); }
  assert.equal(joined.x.kho.q.cauhinhGet.get('task4-save-caller-write-before-finalizer').v, 'present');
  var joinedFailure = setup('00000000-0000-4000-8000-000000000446');
  task4SeedRollbackWitnesses(joinedFailure.x);
  var joinedBefore = task4Rows(joinedFailure.x.kho), joinedFaultMutation = task4Mutation(joinedFailure.lease, joinedFailure.x.clock);
  var joinedFault = task4FinalFenceProbe(joinedFailure.x, joinedFaultMutation, 'TASK4_RED_SAVE_JOINED_FINALIZER', true);
  try {
    assert.throws(function () { joinedFailure.x.kho.trongGiaoDich(function () {
      task4Batch(joinedFailure.x, joinedFaultMutation, function () {
        joinedFailure.x.world.luu(1, joinedFailure.changed, {mutation: joinedFaultMutation});
      });
      joinedFailure.x.kho.q.cauhinhSet.run('task4-save-caller-write-before-fault-finalizer', 'present');
    }, {immediate: true}); }, /LEASE_LOST/, 'TASK4_RED_SAVE_JOINED_FINALIZER');
  } finally { joinedFault.finish(); }
  assert.deepEqual(task4Rows(joinedFailure.x.kho), joinedBefore, 'TASK4_RED_SAVE_JOINED_FINALIZER');
});

test('Task 4 creation final fence proves placement then rolls back after initial wake', function (t) {
  function setup(ownerId) {
    var x = task4Fixture(t), lease = layLease(x, ownerId);
    task4InstallScheduler(x);
    x.kho.q.tkThem.run('task4-creation-fence', 'Task4 creation fence', PASSWORD_HASH, PASSWORD_SALT, NOW_S, NOW_S);
    assert.equal(Number(x.kho.q.tkTheoTen.get('task4-creation-fence').id), 3);
    return {x: x, lease: lease};
  }
  var placed = setup('00000000-0000-4000-8000-000000000434');
  var placementMutation = task4Mutation(placed.lease, placed.x.clock);
  var placement = task4FinalFenceProbe(placed.x, placementMutation, 'TASK4_RED_CREATION_LEASE_FENCE', false);
  try {
    assert.doesNotThrow(function () { task4Batch(placed.x, placementMutation, function () {
      placed.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: placementMutation});
    }); });
  } finally { placement.finish(); }
  assert.equal(task4AccountWakes(placed.x.kho, 3).length, 1, 'TASK4_RED_CREATION_LEASE_FENCE');
  var failed = setup('00000000-0000-4000-8000-000000000444');
  task4SeedRollbackWitnesses(failed.x);
  var before = task4Rows(failed.x.kho), faultMutation = task4Mutation(failed.lease, failed.x.clock);
  var fault = task4FinalFenceProbe(failed.x, faultMutation, 'TASK4_RED_CREATION_LEASE_FENCE', true);
  try {
    assert.throws(function () { task4Batch(failed.x, faultMutation, function () {
      failed.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: faultMutation});
    }); }, /LEASE_LOST/, 'TASK4_RED_CREATION_LEASE_FENCE');
  } finally { fault.finish(); }
  assert.deepEqual(task4Rows(failed.x.kho), before,
    'creation rolls back dq, projections, jobs/applications, metadata, witnesses, and sequence');
  var joined = setup('00000000-0000-4000-8000-000000000447');
  var joinedMutation = task4Mutation(joined.lease, joined.x.clock);
  var joinedFence = task4FinalFenceProbe(joined.x, joinedMutation, 'TASK4_RED_CREATION_JOINED_FINALIZER', false);
  try {
    assert.doesNotThrow(function () { joined.x.kho.trongGiaoDich(function () {
      task4Batch(joined.x, joinedMutation, function () {
        joined.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: joinedMutation});
      });
      joined.x.kho.q.cauhinhSet.run('task4-creation-caller-write-before-finalizer', 'present');
    }, {immediate: true}); }, 'TASK4_RED_CREATION_JOINED_FINALIZER');
  } finally { joinedFence.finish(); }
  assert.equal(joined.x.kho.q.cauhinhGet.get('task4-creation-caller-write-before-finalizer').v, 'present');
  var joinedFailure = setup('00000000-0000-4000-8000-000000000448');
  task4SeedRollbackWitnesses(joinedFailure.x);
  var joinedBefore = task4Rows(joinedFailure.x.kho), joinedFaultMutation = task4Mutation(joinedFailure.lease, joinedFailure.x.clock);
  var joinedFault = task4FinalFenceProbe(joinedFailure.x, joinedFaultMutation, 'TASK4_RED_CREATION_JOINED_FINALIZER', true);
  try {
    assert.throws(function () { joinedFailure.x.kho.trongGiaoDich(function () {
      task4Batch(joinedFailure.x, joinedFaultMutation, function () {
        joinedFailure.x.world.taoDeQuoc(3, 'Task4 creation fence', {mutation: joinedFaultMutation});
      });
      joinedFailure.x.kho.q.cauhinhSet.run('task4-creation-caller-write-before-fault-finalizer', 'present');
    }, {immediate: true}); }, /LEASE_LOST/, 'TASK4_RED_CREATION_JOINED_FINALIZER');
  } finally { joinedFault.finish(); }
  assert.deepEqual(task4Rows(joinedFailure.x.kho), joinedBefore, 'TASK4_RED_CREATION_JOINED_FINALIZER');
});

test('Task 4 derives durable timestamps from mutation effectiveNowMs, not ambient clock', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000435');
  task4InstallScheduler(x);
  var firstNowMs = x.clock.nowMs() + 4_000, secondNowMs = firstNowMs + 1_000;
  assert.notEqual(firstNowMs, x.clock.nowMs());
  var st = x.state(1), target = x.state(2).planets[0].c;
  st.fleets.push({id: 91, pi: 0, tu: st.planets[0].c, den: target, mission: 'attack',
    pha: 'di', diLuc: st.lastTick, den_t: st.lastTick + 90, ships: {cargoS: 1}, cargo: {}});
  st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: st.lastTick + 120});
  var firstMutation = task4Mutation(lease, x.clock, {effectiveNowMs: firstNowMs});
  task4Batch(x, firstMutation, function () { x.world.luu(1, st, {mutation: firstMutation}); });
  var firstDq = x.kho.db.prepare('SELECT capNhat FROM dq WHERE tk=1').get();
  var firstWake = task4AccountWakes(x.kho, 1)[0];
  var firstDerived = x.store.listDerivedJobsForAccount(lease, 1, firstNowMs);
  assert.ok(firstDq, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.ok(firstWake, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(firstDerived.length, 1, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  var firstGlobal = x.store.getById(firstDerived[0].logical_root_id);
  assert.ok(firstGlobal, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(Number(firstDq.capNhat), Math.floor(firstNowMs / 1000), 'TASK4_RED_MUTATION_EFFECTIVE_TIME');
  assert.equal(Number(firstWake.created_at_ms), firstNowMs);
  assert.equal(Number(firstGlobal.created_at_ms), firstNowMs);
  st.fleets[0].den_t += 1;
  var secondMutation = task4Mutation(lease, x.clock, {effectiveNowMs: secondNowMs});
  task4Batch(x, secondMutation, function () { x.world.luu(1, st, {mutation: secondMutation}); });
  var cancelled = x.store.getById(firstGlobal.id);
  var application = x.kho.db.prepare(
    'SELECT applied_at_ms FROM event_applications WHERE job_id=?'
  ).get(firstGlobal.id);
  var currentWake = task4AccountWakes(x.kho, 1)[0];
  var secondDerived = x.store.listDerivedJobsForAccount(lease, 1, secondNowMs);
  assert.ok(cancelled, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.ok(application, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.ok(currentWake, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(secondDerived.length, 1, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  var replacement = x.store.getById(secondDerived[0].logical_root_id);
  assert.ok(replacement, 'TASK4_RED_MUTATION_EFFECTIVE_ROWS');
  assert.equal(Number(cancelled.cancelled_at_ms), secondNowMs);
  assert.equal(Number(application.applied_at_ms), secondNowMs);
  assert.equal(Number(currentWake.created_at_ms), secondNowMs);
  assert.equal(Number(replacement.created_at_ms), secondNowMs);
});

test('Task 4 chooses a later local wake when an earlier external candidate exists', function (t) {
  var x = task4Fixture(t), st = x.state(1), owner = 1, targetKey = G.tdKey(x.state(2).planets[0].c);
  task4InstallScheduler(x);
  st.fleets.push({id: 91, pi: 0, tu: st.planets[0].c, den: x.state(2).planets[0].c,
    mission: 'attack', pha: 'di', diLuc: st.lastTick, den_t: st.lastTick + 30, ships: {cargoS: 1}, cargo: {}});
  st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: st.lastTick + 60});
  var owners = function (key) { return key === targetKey ? 2 : null; };
  assert.equal(G.phanLoaiSuKienKe(st, owner, {multiplayer: true, targetAccountForKey: owners}).atS, st.lastTick + 30);
  assert.equal(G.phanLoaiSuKienNoiBoKe(st, owner, owners).atS, st.lastTick + 60);
  var mutation = task4Mutation(layLease(x, '00000000-0000-4000-8000-000000000409'), x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(owner, st, {mutation: mutation});
  });
  assert.equal(task4AccountWakes(x.kho, owner).length, 1, 'TASK4_RED_LOCAL_WAKE_CREATED');
  assert.equal(Number(task4AccountWakes(x.kho, owner)[0].scheduled_at_s), st.lastTick + 60,
    'TASK4_RED_LOCAL_NOT_EXTERNAL_WAKE');
});
```

Append these additional top-level tests after the preceding block. They use the real
Task-3 module, the real Task-2 Store, and real lease state; no test may replace a
Store method with a stub.

```js
test('Task 4 synchronizes a Task-2-valid external root, retains exact and invalidates mismatch', function (t) {
  var events = require('../server/scheduler/events.js');
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000410');
  task4InstallScheduler(x);
  var st = x.state(1), target = x.state(2).planets[0].c;
  st.fleets.push({id: 91, pi: 0, tu: st.planets[0].c, den: target, mission: 'attack',
    pha: 'di', diLuc: st.lastTick, den_t: st.lastTick + 90, ships: {cargoS: 1}, cargo: {}});
  var owners = function (key) { return key === G.tdKey(target) ? 2 : null; };
  var expected = events.deriveExternalJobs(1, st, owners);
  var ref = {kind: 'fleet', ownerAccountId: 1, fleetId: 91, launchAtS: st.lastTick,
    targetKey: G.tdKey(target), arrivalAtS: st.lastTick + 90, mission: 'attack'};
  var matchId = fixtureMatchId(ref, 2);
  var exactVector = {
    kind: 'PVP_RESOLVE', scheduledAtS: st.lastTick + 90, priority: 50,
    idempotencyKey: 'pvp-resolve:' + matchId + ':' + (st.lastTick + 90),
    aggregateType: 'match', aggregateId: matchId, expectedRevision: null,
    sourceAccountId: 1, maxAttempts: 8,
    payload: {schemaVersion: 1, matchId: matchId, ref: ref}
  };
  assert.deepEqual(expected, [exactVector]);
  assert.deepEqual(task2StoreModule().validateJob(expected[0]), exactVector);
  var mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  var first = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(first.length, 1, 'TASK4_RED_EXTERNAL_DERIVATION_SCHEDULED');
  assert.equal(first[0].logical_key, expected[0].idempotencyKey);
  assert.equal(events.canonicalExternalStatus(x.kho, first[0].canonical_ref), 'EXACT');
  mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  var retained = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(retained.length, 1);
  assert.equal(retained[0].logical_root_id, first[0].logical_root_id);
  st.fleets[0].den_t += 1;
  mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  var cancelled = x.store.getById(first[0].logical_root_id);
  assert.equal(cancelled.state, 'CANCELLED');
  assert.equal(cancelled.cancel_reason, 'ENTITY_REMOVED');
  var application = x.kho.db.prepare('SELECT effective_at_s,result_json FROM event_applications WHERE job_id=?')
    .get(cancelled.id);
  assert.equal(Number(application.effective_at_s), Number(cancelled.scheduled_at_s));
  assert.deepEqual(JSON.parse(application.result_json), {
    code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'REF_MISMATCH'
  });
  var replacement = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs());
  assert.equal(replacement.length, 1);
  assert.notEqual(replacement[0].logical_root_id, first[0].logical_root_id);
});

test('Task 4 reducer continuation fences union independent protected roots and invalidate control', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000431');
  task4InstallScheduler(x);
  var roots = x.kho.trongGiaoDich(function () {
    var pending = x.store.schedule(lease, x.globalFor(1, 2, 280), x.clock.nowMs());
    var retry = x.store.schedule(lease, x.globalFor(1, 2, 281), x.clock.nowMs());
    var quarantined = x.store.schedule(lease, x.globalFor(1, 2, 282), x.clock.nowMs());
    var control = x.store.schedule(lease, x.globalFor(1, 2, 283), x.clock.nowMs());
    danhDauRetry(x.kho, retry.idempotency_key, x.clock.nowMs() + 60_000);
    x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?")
      .run(quarantined.id);
    return {pending: pending, retry: retry, quarantined: quarantined, control: control};
  }, {immediate: true});
  var currentWake = x.kho.trongGiaoDich(function () {
    var pending = x.store.schedule(lease, job('account-advance:1:0', 280, 100), x.clock.nowMs());
    return x.store.claimForResolution(lease, pending.id, x.clock.nowMs(), 15_000, {allowFuturePending: true});
  }, {immediate: true});
  var before = task4Rows(x.kho), firstState = x.state(1), secondState;
  firstState.fleets = [];
  secondState = JSON.parse(JSON.stringify(firstState));
  secondState.msgs.push({t: secondState.lastTick, doc: false, loai: 'he', td: 'protected-union'});
  var firstRoots = new Set([roots.pending.id]);
  var secondRoots = new Set([roots.retry.id, roots.quarantined.id]);
  var mutation = task4Mutation(lease, x.clock);
  assert.equal(Object.hasOwn(mutation, 'protectedRecoveryRootIds'), false,
    'TASK4_RED_REDUCER_CONTINUATION_OPTIONS_NOT_MUTATION');
  task4Batch(x, mutation, function () {
    x.world.luu(1, firstState, {mutation: mutation, currentAccountAdvanceJobId: currentWake.id,
      deferAccountWake: true, protectedRecoveryRootIds: firstRoots});
    x.world.luu(1, secondState, {mutation: mutation, currentAccountAdvanceJobId: currentWake.id,
      deferAccountWake: true, protectedRecoveryRootIds: secondRoots});
    firstRoots.clear();
    secondRoots.clear(); // caller Set mutation cannot replace or mutate the private union
  });
  assert.equal(Object.hasOwn(mutation, 'protectedRecoveryRootIds'), false,
    'TASK4_RED_REDUCER_CONTINUATION_OPTIONS_NOT_MUTATION');
  [roots.pending.id, roots.retry.id, roots.quarantined.id].forEach(function (id) {
    assert.deepEqual(x.store.getById(id), before.jobs.find(function (row) { return row.id === id; }));
  });
  assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id IN (?,?,?)')
    .get(roots.pending.id, roots.retry.id, roots.quarantined.id).n, 0);
  assert.equal(x.store.getById(roots.control.id).state, 'CANCELLED',
    'TASK4_RED_REDUCER_CONTINUATION_UNPROTECTED_CONTROL');
  assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?')
    .get(roots.control.id).n, 1, 'TASK4_RED_REDUCER_CONTINUATION_UNPROTECTED_CONTROL');
  assert.deepEqual(x.store.getById(currentWake.id), before.jobs.find(function (row) { return row.id === currentWake.id; }),
    'TASK4_RED_REDUCER_CONTINUATION_CURRENT_WAKE');
  assert.equal(task4AccountWakes(x.kho, 1).filter(function (row) { return row.state !== 'RUNNING'; }).length, 0,
    'TASK4_RED_REDUCER_CONTINUATION_CURRENT_WAKE');
  assert.deepEqual(task4Rows(x.kho).meta.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms' && row.key !== 'sequence';
  }), before.meta.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms' && row.key !== 'sequence';
  }));
  assert.equal(x.store.globalWatermarkS(x.clock.nowMs()), 280);
});

test('Task 4 sweep classifies every eligible root, local wake, running root and active replay state', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000411');
  var ambientNowMs = x.clock.nowMs(), now = ambientNowMs + 4_000, roots = x.kho.trongGiaoDich(function () {
    return ['PENDING', 'RETRY_WAIT', 'QUARANTINED', 'RUNNING'].map(function (state, index) {
      var row = x.store.schedule(lease, x.globalFor(1, 2, 300 + index), now);
      if (state === 'RETRY_WAIT') danhDauRetry(x.kho, row.idempotency_key, now + 60_000);
      if (state === 'QUARANTINED') x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?,error_code='TEST' WHERE id=?"
      ).run(now, row.id);
      if (state === 'RUNNING') return x.store.claimForResolution(lease, row.id, now, 15_000, {
        allowFuturePending: true
      });
      return row;
    });
  }, {immediate: true});
  var localPending = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, job('account-advance:1:0', 300, 100), now);
  }, {immediate: true});
  var localRetry = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, job('account-advance:1:1', 301, 100), now);
  }, {immediate: true});
  danhDauRetry(x.kho, localRetry.idempotency_key, now + 60_000);
  var replayCases = ['PENDING', 'RETRY_WAIT', 'RUNNING', 'QUARANTINED'].map(function (state, index) {
    return x.kho.trongGiaoDich(function () {
      var root = x.store.schedule(lease, x.globalFor(1, 2, 304 + index), now);
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(root.id);
      var child = x.store.schedule(lease, replayJobFrom(x.store.getById(root.id), 'task4-sweep-' + String(state).toLowerCase()), now);
      if (state === 'RETRY_WAIT') danhDauRetry(x.kho, child.idempotency_key, now + 60_000);
      if (state === 'RUNNING') child = x.store.claimForResolution(lease, child.id, now, 15_000, {allowFuturePending: true});
      if (state === 'QUARANTINED') x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',error_code='TEST_CHILD' WHERE id=?"
      ).run(child.id);
      return {state: state, root: root, child: child};
    }, {immediate: true});
  });
  assert.notEqual(now, ambientNowMs, 'sweep receives a lease-valid mutation time, not fixture clock time');
  var replayBefore = replayCases.map(function (entry) {
    return {root: x.store.getById(entry.root.id), child: x.store.getById(entry.child.id)};
  });
  var runningBefore = x.store.getById(roots[3].id);
  var metadataBefore = task4Rows(x.kho);
  x.kho.q.tkXoa.run(1);
  var result;
  assert.doesNotThrow(function () { result = x.store.sweepDeletedAccountOrphans(lease, now); });
  assert.deepEqual(result, {local: 2, global: 3, protectedReplay: 4, running: 1});
  ['CANCELLED', 'CANCELLED', 'CANCELLED', 'RUNNING'].forEach(function (state, index) {
    assert.equal(x.store.getById(roots[index].id).state, state);
  });
  roots.slice(0, 3).forEach(function (root) {
    var application = x.kho.db.prepare(
      'SELECT effective_at_s,applied_at_ms,result_json FROM event_applications WHERE job_id=?'
    ).get(root.id);
    assert.equal(Number(application.effective_at_s), Number(root.scheduled_at_s));
    assert.equal(Number(application.applied_at_ms), now);
    assert.equal(Number(x.store.getById(root.id).cancelled_at_ms), now);
    assert.equal(Number(x.store.getById(root.id).updated_at_ms), now);
    assert.deepEqual(JSON.parse(application.result_json), {
      code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'ALREADY_ABSENT'
    });
  });
  assert.equal(x.store.getById(localPending.id).state, 'CANCELLED');
  assert.equal(x.store.getById(localRetry.id).state, 'CANCELLED');
  assert.equal(Number(x.store.getById(localPending.id).cancelled_at_ms), now);
  assert.equal(Number(x.store.getById(localRetry.id).cancelled_at_ms), now);
  replayCases.forEach(function (entry, index) {
    assert.deepEqual(x.store.getById(entry.child.id), replayBefore[index].child);
    assert.deepEqual(x.store.getById(entry.root.id), replayBefore[index].root);
    assert.equal(x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id IN (?,?)')
      .get(entry.root.id, entry.child.id).n, 0);
  });
  assert.deepEqual(x.store.getById(roots[3].id), runningBefore);
  var metaAfter = task4Rows(x.kho).meta;
  assert.equal(metaAfter.filter(function (row) {
    return row.key === 'durable_first_mutation_at_ms';
  }).length, 1);
  assert.equal(metaAfter.find(function (row) {
    return row.key === 'durable_first_mutation_at_ms';
  }).value, String(now));
  assert.equal(Number(metaAfter.find(function (row) {
    return row.key === 'durable_first_mutation_at_ms';
  }).updated_at_ms), now);
  assert.deepEqual(metaAfter.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms';
  }), metadataBefore.meta.filter(function (row) {
    return row.key !== 'durable_first_mutation_at_ms';
  }));
  assert.deepEqual(task4Rows(x.kho).lease, metadataBefore.lease);
  assert.equal(x.store.globalWatermarkS(now), 303);
});

test('Task 4 sweep skips existing-source exact, terminal, and non-orphan rows and rolls back between candidates', function (t) {
  var events = require('../server/scheduler/events.js');
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000437');
  task4InstallScheduler(x);
  var live = task4LiveInboundRoot(x, lease, 360, 'TASK4_RED_SWEEP_EXACT_ROOT');
  var exact = live.root;
  var exactRef = x.store.listDerivedJobsForAccount(lease, 1, x.clock.nowMs()).find(function (row) {
    return row.logical_root_id === exact.id;
  }).canonical_ref;
  var mismatchRef = Object.assign({}, exactRef, {arrivalAtS: exactRef.arrivalAtS + 3});
  var mismatch = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalForRef(mismatchRef, 2), x.clock.nowMs());
  }, {immediate: true});
  assert.equal(Number(exact.scheduled_at_s), live.arrivalAtS, 'TASK4_RED_SWEEP_EXACT_ROOT');
  assert.equal(Number(mismatch.scheduled_at_s), live.arrivalAtS + 3,
    'TASK4_RED_SWEEP_EXISTING_REF_MISMATCH');
  assert.equal(events.canonicalExternalStatus(x.kho, exactRef), 'EXACT', 'TASK4_RED_SWEEP_EXACT_ROOT');
  assert.equal(events.canonicalExternalStatus(x.kho, mismatchRef), 'REF_MISMATCH',
    'TASK4_RED_SWEEP_EXISTING_REF_MISMATCH');
  var terminal = x.kho.trongGiaoDich(function () {
    var row = x.store.schedule(lease, x.globalFor(1, 2, 361), x.clock.nowMs());
    x.kho.db.prepare("UPDATE event_jobs SET state='CANCELLED',cancel_reason='TEST',cancelled_at_ms=? WHERE id=?")
      .run(x.clock.nowMs(), row.id);
    return row;
  }, {immediate: true});
  var local = x.kho.trongGiaoDich(function () {
    return task4ReconcileWake(x, lease, 2, 362);
  }, {immediate: true});
  assert.equal(Number(local.priority), 200, 'TASK4_RED_SWEEP_RECONCILE_PRIORITY');
  assert.equal(JSON.parse(local.payload_json).reconcile, true, 'TASK4_RED_SWEEP_RECONCILE_PRIORITY');
  var beforeSkips = task4Rows(x.kho);
  assert.deepEqual(x.store.sweepDeletedAccountOrphans(lease, x.clock.nowMs()),
    {local: 0, global: 0, protectedReplay: 0, running: 0});
  [exact.id, mismatch.id, terminal.id, local.id].forEach(function (id) {
    assert.deepEqual(x.store.getById(id), beforeSkips.jobs.find(function (row) { return row.id === id; }));
  });
  var y = task4Fixture(t), yLease = layLease(y, '00000000-0000-4000-8000-000000000438');
  var now = y.clock.nowMs() + 4_000;
  var candidates = y.kho.trongGiaoDich(function () {
    return [y.store.schedule(yLease, y.globalFor(1, 2, 370), now),
      y.store.schedule(yLease, y.globalFor(1, 2, 371), now)];
  }, {immediate: true});
  y.kho.q.tkXoa.run(1);
  var beforeLoss = task4Rows(y.kho);
  var release = y.store.releaseBlockedAccountDependents, releases = [];
  // A transparent probe (never a fake Store result) flips only *after* the
  // first candidate's application, terminal transition, and release call.
  y.store.releaseBlockedAccountDependents = function () {
    var result = release.apply(this, arguments);
    releases.push(arguments[1]);
    if (releases.length === 1) y.kho.db.prepare(
      "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
    ).run();
    return result;
  };
  try {
    assert.throws(function () { y.store.sweepDeletedAccountOrphans(yLease, now); }, /LEASE_LOST/,
      'TASK4_RED_SWEEP_BETWEEN_CANDIDATES');
  } finally { y.store.releaseBlockedAccountDependents = release; }
  assert.deepEqual(releases, [candidates[0].id], 'TASK4_RED_SWEEP_BETWEEN_CANDIDATES');
  assert.deepEqual(task4Rows(y.kho), beforeLoss);
});

test('Task 4 preserves PENDING RETRY_WAIT RUNNING QUARANTINED replay children and a RUNNING root byte-for-byte', function (t) {
  ['PENDING', 'RETRY_WAIT', 'RUNNING', 'QUARANTINED'].forEach(function (state, index) {
    var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-00000000042' + index);
    task4InstallScheduler(x);
    var root = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, x.globalFor(1, 2, 320 + index), x.clock.nowMs());
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED',error_code='TEST' WHERE id=?").run(row.id);
      return row;
    }, {immediate: true});
    var child = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, replayJobFrom(x.store.getById(root.id), 'task4-' + String(state).toLowerCase()), x.clock.nowMs());
    }, {immediate: true});
    if (state === 'RETRY_WAIT') danhDauRetry(x.kho, child.idempotency_key, x.clock.nowMs() + 60_000);
    if (state === 'RUNNING') child = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(lease, child.id, x.clock.nowMs(), 15_000, {allowFuturePending: true});
    }, {immediate: true});
    if (state === 'QUARANTINED') x.kho.db.prepare(
      "UPDATE event_jobs SET state='QUARANTINED',error_code='TEST_CHILD' WHERE id=?"
    ).run(child.id);
    var local = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:' + (20 + index), 320 + index, 100), x.clock.nowMs());
    }, {immediate: true});
    var childBefore = x.store.getById(child.id), rootBefore = x.store.getById(root.id);
    var metadataBefore = task4Rows(x.kho);
    assert.equal(task4Delete(x, task4Mutation(lease, x.clock), 1, 'A'), null);
    assert.deepEqual(x.store.getById(child.id), childBefore);
    assert.deepEqual(x.store.getById(root.id), rootBefore);
    assert.equal(x.store.getById(local.id).state, 'CANCELLED', 'TASK4_RED_EXHAUSTIVE_REPLAY_LOCAL_CANCELLATION');
    assert.deepEqual(task4Rows(x.kho).meta, metadataBefore.meta);
    assert.deepEqual(task4Rows(x.kho).lease, metadataBefore.lease);
  });
  var y = task4Fixture(t), yLease = layLease(y, '00000000-0000-4000-8000-000000000423');
  task4InstallScheduler(y);
  var runningRoot = y.kho.trongGiaoDich(function () {
    var root = y.store.schedule(yLease, y.globalFor(1, 2, 330), y.clock.nowMs());
    return y.store.claimForResolution(yLease, root.id, y.clock.nowMs(), 15_000, {allowFuturePending: true});
  }, {immediate: true});
  var runningLocal = y.kho.trongGiaoDich(function () {
    return y.store.schedule(yLease, job('account-advance:1:30', 330, 100), y.clock.nowMs());
  }, {immediate: true});
  var before = task4Rows(y.kho);
  assert.equal(task4Delete(y, task4Mutation(yLease, y.clock), 1, 'A'), null);
  assert.deepEqual(y.store.getById(runningRoot.id), before.jobs.find(function (row) { return row.id === runningRoot.id; }));
  assert.equal(y.store.getById(runningLocal.id).state, 'CANCELLED');
  assert.deepEqual(task4Rows(y.kho).meta, before.meta);
  assert.deepEqual(task4Rows(y.kho).lease, before.lease);
});

test('Task 4 releases a real blocked ACCOUNT_ADVANCE only after invalidation application terminalizes', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000424');
  var now = x.clock.nowMs(), root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, NOW_S + 30), now);
  }, {immediate: true});
  var local = x.kho.trongGiaoDich(function () {
    var pending = x.store.schedule(lease, job('account-advance:1:0', NOW_S + 30, 100), now);
    var running = x.store.claimForResolution(lease, pending.id, now, 15_000, {allowFuturePending: true});
    return x.store.blockOwnedAccountAdvance(lease, running, 0, root.id, now);
  }, {immediate: true});
  assert.equal(local.blocked_by_job_id, root.id);
  var beforeRejectedInvalidation = task4Rows(x.kho);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'ALREADY_ABSENT', NOW_S + 31, now);
    }, {immediate: true});
  }, /INVALIDATION_EFFECTIVE_TIME_INVALID/);
  assert.deepEqual(task4Rows(x.kho), beforeRejectedInvalidation);
  assert.doesNotThrow(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'ALREADY_ABSENT', NOW_S + 30, now);
    }, {immediate: true});
  });
  assert.equal(x.store.getById(root.id).state, 'CANCELLED');
  assert.equal(x.store.getById(root.id).cancel_reason, 'ENTITY_REMOVED');
  assert.equal(Number(x.store.getById(root.id).cancelled_at_ms), now);
  var application = x.kho.db.prepare(
    'SELECT effective_at_s,applied_at_ms,result_json FROM event_applications WHERE job_id=?'
  ).get(root.id);
  assert.equal(Number(application.effective_at_s), NOW_S + 30);
  assert.equal(Number(application.applied_at_ms), now);
  assert.deepEqual(JSON.parse(application.result_json), {
    code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: 'ALREADY_ABSENT'
  });
  assert.equal(x.store.getById(local.id).blocked_by_job_id, null);
  assert.equal(x.store.getById(local.id).state, 'PENDING');
});

test('Task 4 rejects expired lease before application or watermark mutation', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000425');
  var root = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, x.globalFor(1, 2, 340), x.clock.nowMs());
  }, {immediate: true});
  x.kho.db.prepare("UPDATE scheduler_lease SET expires_at_ms=? WHERE lease_name='global-writer'")
    .run(x.clock.nowMs());
  var before = task4Rows(x.kho);
  assert.throws(function () {
    x.kho.trongGiaoDich(function () {
      x.store.invalidateGlobalJob(lease, root.id, 'ALREADY_ABSENT', 340, x.clock.nowMs());
    }, {immediate: true});
  }, /LEASE_LOST/);
  assert.deepEqual(task4Rows(x.kho), before);
});

test('Task 4 keeps current RUNNING wake and supersedes stale normal wake', function (t) {
  var x = task4Fixture(t), lease = layLease(x, '00000000-0000-4000-8000-000000000426');
  task4InstallScheduler(x);
  var now = x.clock.nowMs(), stale = x.kho.trongGiaoDich(function () {
    return x.store.schedule(lease, job('account-advance:1:0', NOW_S + 50, 100), now);
  }, {immediate: true});
  var st = x.state(1);
  var mutation = task4Mutation(lease, x.clock);
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, {mutation: mutation});
  });
  assert.equal(x.store.getById(stale.id).state, 'CANCELLED', 'TASK4_RED_CURRENT_WAKE_SUPERSESSION');
  var current = task4AccountWakes(x.kho, 1)[0];
  var running = x.kho.trongGiaoDich(function () {
    return x.store.claimForResolution(lease, current.id, now, 15_000, {allowFuturePending: true});
  }, {immediate: true});
  mutation = task4Mutation(lease, x.clock);
  var continuationSaveOptions = {
    mutation: mutation, currentAccountAdvanceJobId: running.id, deferAccountWake: true
  };
  assert.equal(Object.hasOwn(mutation, 'currentAccountAdvanceJobId'), false,
    'TASK4_RED_CURRENT_WAKE_OPTIONS_NOT_MUTATION');
  assert.equal(Object.hasOwn(mutation, 'deferAccountWake'), false,
    'TASK4_RED_CURRENT_WAKE_OPTIONS_NOT_MUTATION');
  task4Batch(x, mutation, function () {
    x.world.luu(1, st, continuationSaveOptions);
  });
  assert.equal(x.store.getById(running.id).state, 'RUNNING');
  assert.equal(task4AccountWakes(x.kho, 1).filter(function (row) {
    return row.state === 'PENDING' || row.state === 'RETRY_WAIT';
  }).length, 0);
});
```

For the replay test, construct the child through the real `replayJobFrom` path. Do not update its state through a raw mutation except to establish the targeted PENDING/RETRY_WAIT fixture; record its full ordered row before deletion and compare it byte-for-byte after. For inbound testing, set `ref.targetKey` from B's actual canonical planet coordinate, not a fabricated coordinate string.

- [ ] **Step 2: Run the focused RED command and verify the intended failure**

Run exactly:

```bash
set -Eeuo pipefail
test "$(cat "$task4_tmp/task4-execution-route")" = fresh
task4_red="$(mktemp)"
trap 'rm -f "$task4_red"' EXIT
set +e
node --test-reporter=tap --test-name-pattern='Task 4 (exposes|reaches every|coalesces|scheduler-aware|deletion owns|deletion|classifies inbound|deletes|final lease fence|final save fence|creation final fence|derives durable timestamps|chooses|synchronizes|reducer continuation|sweep|preserves PENDING|releases|rejects expired|keeps current)' \
  tools/test-scheduler.js >"$task4_red" 2>&1
task4_status=$?
set -e
cat "$task4_red"
test "$task4_status" -ne 0
rg -q '^# tests 24$' "$task4_red"
rg -q '^# pass 0$' "$task4_red"
rg -q '^# fail 24$' "$task4_red"
rg -q '^# skipped 0$' "$task4_red"
for task4_name in \
  'Task 4 exposes scheduler-aware world contracts before behavior tests' \
  'Task 4 reaches every scheduler surface and mutation-first ABI call in RED' \
  'Task 4 coalesces two same-batch saves into one revision and one local wake' \
  'Task 4 coalesces distinct state objects with sticky reducer options and conflicts' \
  'Task 4 scheduler-aware account creation writes one initial local wake' \
  'Task 4 deletion atomically invalidates an outbound root after canonical absence' \
  'Task 4 deletion owns or joins one rollback-only UoW without nested begin' \
  'Task 4 deletion invalidates an inbound target root with a Task-2-valid result' \
  'Task 4 classifies inbound exact absent and mismatch roots before target deletion' \
  'Task 4 deletion preserves a PENDING or RETRY_WAIT replay child' \
  'Task 4 deletes a future RETRY_WAIT root only with a live lease fence' \
  'Task 4 final lease fence proves deletion placement then rolls back protected globals' \
  'Task 4 final save fence proves placement then rolls back after local synchronization' \
  'Task 4 creation final fence proves placement then rolls back after initial wake' \
  'Task 4 derives durable timestamps from mutation effectiveNowMs, not ambient clock' \
  'Task 4 chooses a later local wake when an earlier external candidate exists' \
  'Task 4 synchronizes a Task-2-valid external root, retains exact and invalidates mismatch' \
  'Task 4 reducer continuation fences union independent protected roots and invalidate control' \
  'Task 4 sweep classifies every eligible root, local wake, running root and active replay state' \
  'Task 4 sweep skips existing-source exact, terminal, and non-orphan rows and rolls back between candidates' \
  'Task 4 preserves PENDING RETRY_WAIT RUNNING QUARANTINED replay children and a RUNNING root byte-for-byte' \
  'Task 4 releases a real blocked ACCOUNT_ADVANCE only after invalidation application terminalizes' \
  'Task 4 rejects expired lease before application or watermark mutation' \
  'Task 4 keeps current RUNNING wake and supersedes stale normal wake'
do
  rg -q "^not ok [0-9]+ - $task4_name$" "$task4_red"
done
test "$(rg -c '^not ok ' "$task4_red")" -eq 24
node - "$task4_red" <<'NODE'
const fs = require('node:fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const expected = [
  ['Task 4 exposes scheduler-aware world contracts before behavior tests', /TASK4_RED_(WORLD_(DAT_SCHEDULER|ADVANCE_SERVICE|MUTATION_GATE|ADVANCE_ABI)|FIRST_SAVE_WRONG_OBJECT|NESTED_MUTATION_OBJECT|DELETE_(ACTIVE_MUTATION_REQUIRED|MUTATION_IDENTITY|BEFORE_(READ|TRANSACTION)|SAME_MUTATION_IDENTITY))|SCHEDULER_MUTATION_TOKEN_(REQUIRED|CONFLICT)/],
  ['Task 4 reaches every scheduler surface and mutation-first ABI call in RED', /TASK4_RED_(ALL_SURFACES_REACHED|ABI_EXACT_ONCE|ABI_ARGUMENT_ORDER|ABI_ACTIVE_CALLBACK_(REQUIRED|LEAK))/],
  ['Task 4 coalesces two same-batch saves into one revision and one local wake', /TASK4_RED_(COALESCED_SINGLE_REVISION|BATCH_RECEIPTS_REAL_MAP)/],
  ['Task 4 coalesces distinct state objects with sticky reducer options and conflicts', /TASK4_RED_STICKY_(COALESCED_REVISION|CURRENT_WAKE_RETAINED|MUTATION_CONFLICT|OPTIONS_NOT_MUTATION)|SCHEDULER_MUTATION_TOKEN_CONFLICT/],
  ['Task 4 scheduler-aware account creation writes one initial local wake', /TASK4_RED_(INITIAL_ACCOUNT_ADVANCE_WAKE|BATCH_RECEIPTS_REAL_MAP)/],
  ['Task 4 deletion atomically invalidates an outbound root after canonical absence', /TASK4_RED_OUTBOUND_CANONICAL_INVALIDATION/],
  ['Task 4 deletion invalidates an inbound target root with a Task-2-valid result', /TASK4_RED_INBOUND_TARGET_ROOT|CANONICAL_NEUTRALIZATION_REQUIRED|TARGET_REMOVAL_EVIDENCE_INVALID/],
  ['Task 4 classifies inbound exact absent and mismatch roots before target deletion', /TASK4_RED_INBOUND_CLASSIFICATION_ROOT|ALREADY_ABSENT|REF_MISMATCH/],
  ['Task 4 deletion preserves a PENDING or RETRY_WAIT replay child', /TASK4_RED_REPLAY_LOCAL_CANCELLATION|REPLAY_REPLACEMENT_ACTIVE/],
  ['Task 4 deletes a future RETRY_WAIT root only with a live lease fence', /TASK4_RED_RETRY_WAIT_INVALIDATION|LEASE_LOST/],
  ['Task 4 deletion owns or joins one rollback-only UoW without nested begin', /TASK4_RED_UOW_(OWNERSHIP|ROLLBACK_ONLY|FINALIZER)/],
  ['Task 4 final lease fence proves deletion placement then rolls back protected globals', /TASK4_RED_(FINAL_PRECOMMIT_LEASE_FENCE|WRITE_AFTER_FINAL_FENCE)|LEASE_LOST/],
  ['Task 4 final save fence proves placement then rolls back after local synchronization', /TASK4_RED_(SAVE_(LEASE_FENCE|JOINED_FINALIZER)|SAVE_FINAL_FENCE_PRECONDITION|WRITE_AFTER_FINAL_FENCE)|LEASE_LOST/],
  ['Task 4 creation final fence proves placement then rolls back after initial wake', /TASK4_RED_(CREATION_(LEASE_FENCE|JOINED_FINALIZER)|WRITE_AFTER_FINAL_FENCE)|LEASE_LOST/],
  ['Task 4 derives durable timestamps from mutation effectiveNowMs, not ambient clock', /TASK4_RED_MUTATION_EFFECTIVE_(TIME|ROWS)/],
  ['Task 4 chooses a later local wake when an earlier external candidate exists', /TASK4_RED_LOCAL_(WAKE_CREATED|NOT_EXTERNAL_WAKE)/],
  ['Task 4 synchronizes a Task-2-valid external root, retains exact and invalidates mismatch', /TASK4_RED_EXTERNAL_DERIVATION_SCHEDULED|REF_MISMATCH/],
  ['Task 4 reducer continuation fences union independent protected roots and invalidate control', /TASK4_RED_REDUCER_CONTINUATION_(OPTIONS_NOT_MUTATION|CURRENT_WAKE|UNPROTECTED_CONTROL)|protectedRecoveryRootIds/],
  ['Task 4 sweep classifies every eligible root, local wake, running root and active replay state', /sweepDeletedAccountOrphans/],
  ['Task 4 sweep skips existing-source exact, terminal, and non-orphan rows and rolls back between candidates', /TASK4_RED_SWEEP_(EXACT_ROOT|EXISTING_REF_MISMATCH|RECONCILE_PRIORITY|BETWEEN_CANDIDATES)|LEASE_LOST/],
  ['Task 4 preserves PENDING RETRY_WAIT RUNNING QUARANTINED replay children and a RUNNING root byte-for-byte', /TASK4_RED_EXHAUSTIVE_REPLAY_LOCAL_CANCELLATION|REPLAY_REPLACEMENT_ACTIVE/],
  ['Task 4 releases a real blocked ACCOUNT_ADVANCE only after invalidation application terminalizes', /invalidateGlobalJob/],
  ['Task 4 rejects expired lease before application or watermark mutation', /invalidateGlobalJob|LEASE_LOST/],
  ['Task 4 keeps current RUNNING wake and supersedes stale normal wake', /TASK4_RED_CURRENT_WAKE_(SUPERSESSION|OPTIONS_NOT_MUTATION)|currentAccountAdvanceJobId/]
];
function unquote(value) {
  const text = value.trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    try { return JSON.parse(text); } catch (_) { return text.slice(1, -1); }
  }
  return text;
}
function actualDiagnosticFields(block) {
  const fields = [];
  const lines = block.split('\n');
  for (let index = 0; index < lines.length; index++) {
    // Node TAP diagnostic YAML has its top-level mapping at two spaces. Do not
    // descend into `expected:` values or nested collection entries.
    const match = /^ {2}(actual|error|message|cause):(?:[ \t]*(.*))?$/.exec(lines[index]);
    if (!match) continue;
    const raw = match[2] || '';
    const indicator = raw.trim();
    if (!/^[|>](?:[1-9][+-]?|[+-]?[1-9]?)?$/.test(indicator)) {
      fields.push({key: match[1], value: unquote(raw)});
      continue;
    }
    const body = [];
    let cursor = index + 1;
    for (; cursor < lines.length; cursor++) {
      // A two-space (or less) nonblank line is the next YAML top-level item,
      // the document terminator, or TAP, and cannot belong to this scalar.
      if (/^ {0,2}\S/.test(lines[cursor])) break;
      body.push(lines[cursor]);
    }
    const indents = body.filter((line) => /\S/.test(line)).map(function (line) {
      return (/^ */.exec(line) || [''])[0].length;
    });
    const indent = indents.length ? Math.min(...indents) : 0;
    fields.push({key: match[1], value: body.map(function (line) {
      return /\S/.test(line) ? line.slice(indent) : '';
    }).join('\n')});
    index = cursor - 1;
  }
  return fields;
}
function diagnosticFor(tapText, name, source) {
  const marker = new RegExp('^not ok [0-9]+ - ' +
    name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm');
  const match = marker.exec(tapText);
  if (!match) throw new Error('TASK4_RED_NAME_MISSING:' + source + ':' + name);
  const rest = tapText.slice(match.index);
  const end = rest.slice(1).search(/\nnot ok [0-9]+ - |\n# tests /);
  const block = end < 0 ? rest : rest.slice(0, end + 1);
  return block.replace(/^[^\n]*(?:\n|$)/, '');
}
function assertExpectedRedCauses(tapText, source) {
  for (const [name, cause] of expected) {
    // Parse only direct actual-failure fields. In particular, a regex written
    // in an AssertionError `expected:` field must never count as the cause.
    const diagnostic = diagnosticFor(tapText, name, source);
    const actual = actualDiagnosticFields(diagnostic);
    if (!actual.length) {
      throw new Error('TASK4_RED_ACTUAL_CAUSE_FIELD_MISSING:' + source + ':' + name + '\n' + diagnostic);
    }
    if (!actual.some((field) => cause.test(field.value))) {
      throw new Error('TASK4_RED_CAUSE_MISSING:' + source + ':' + name + '\n' + JSON.stringify(actual));
    }
  }
}
assertExpectedRedCauses(tap, 'CURRENT');
// Regression proof for the observed Node TAP `error: |-` form. The saved
// evidence is supplemental because /tmp paths are not dispatch artifacts;
// the mandatory CURRENT proof above remains the RED gate on every execution.
const savedRedPath = '/tmp/task4-red.AkVI27';
if (fs.existsSync(savedRedPath)) {
  const savedDiagnostic = diagnosticFor(fs.readFileSync(savedRedPath, 'utf8'), expected[0][0], 'SAVED');
  const savedFields = actualDiagnosticFields(savedDiagnostic);
  if (!savedFields.some((field) => field.key === 'error' && /TASK4_RED_WORLD_DAT_SCHEDULER/.test(field.value))) {
    throw new Error('TASK4_RED_BLOCK_SCALAR_REGRESSION');
  }
}
const expectedOnly = actualDiagnosticFields(
  "  expected: 'TASK4_RED_WORLD_DAT_SCHEDULER'\n  actual: 'undefined'\n"
);
if (expectedOnly.some((field) => /TASK4_RED_WORLD_DAT_SCHEDULER/.test(field.value))) {
  throw new Error('TASK4_RED_EXPECTED_FIELD_ACCEPTED');
}
NODE
```

Expected: all twenty-four named tests execute, with twenty-four failures, zero passes, and zero skips; the compound surface test attempts every production entry point before it asserts a missing surface. Every remaining RED body must expose its own named semantic token in a direct top-level `actual`, `error`, `message`, or `cause` Node-TAP-YAML scalar, including literal or folded block scalars such as `error: |-`; generic `Expected values`, a test heading, nested collection entry, or assertion `expected:` echo is insufficient. The supplemental saved-TAP regression and the `expected:`-only negative proof must pass when the saved evidence exists. A passing test, missing `not ok` name, TAP skip, fixture/setup exception, missing actual-cause field, unmatched root cause, parser-regression failure, or extra failure is `BLOCKED_RED_SHAPE`.

### Task 2R3: Controller-authorized fixture-recovery continuation (R3 route only)

**Files:**

- Modify first: `tools/test-scheduler.js` — replace the one existing Task-4 test block with the corrected fixture block in Task 2; never append a duplicate.
- Modify only if a live corrected-fixture run reports residual semantic RED: `server/db.js`, `server/world.js`, or `server/scheduler/store.js`.
- Create only under `task4_tmp` and `/tmp`: verifier, manifests, TAP captures, and disposable shadow copies.

**Consumes:** the controller's exact R3 continuation handoff, immutable R2 TAP captures, the current four-file identity rows, and the Task-2 RED cause table above.

**Produces:** a truthful continuation record: either residual RED followed by minimal GREEN, or an explicit TDD-deviation disclosure backed by disposable mutation-sensitivity proof. It never manufactures a final-plan `24/0/24/0` chronology.

This task is legal only when `cat "$task4_tmp/task4-execution-route"` is exactly `r3`. A fresh route must execute Task 2's strict RED steps and must not enter this task. Conversely, an R3 route must skip every fresh-only Task-2 command: its backend is already the controller-pinned R2 `21/3` state, and rerunning a corrected test against it cannot be evidence of an earlier RED.

- [ ] **Step 1: Verify the exact R3 authority, R2 evidence, names, causes, and current files before any edit**

Run exactly. This writes only a disposable verifier under the preflight temp directory. The verifier loads the exact `expected` table from the fresh RED gate in this immutable plan, so the same field-level semantic patterns—not a weaker R3 table—validate the twenty-one accepted R2 failures and any residual failure.

```bash
set -Eeuo pipefail
test "$(cat "$task4_tmp/task4-execution-route")" = r3
: "${TASK4_R3_CONTINUATION_HANDOFF_ID:?TASK4_R3_CONTINUATION_HANDOFF_ID_REQUIRED}"
: "${TASK4_R3_CONTINUATION_HANDOFF_SHA256:?TASK4_R3_CONTINUATION_HANDOFF_SHA256_REQUIRED}"
: "${TASK4_R3_CONTINUATION_HANDOFF_B64:?TASK4_R3_CONTINUATION_HANDOFF_B64_REQUIRED}"
cat >"$task4_tmp/task4-r3-continuation.cjs" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handoffId = 'task4-r3-continuation-cc343cd4819a-c54a3cfe73aa-20260824';
const handoffHash = 'b3be56417e5edade1d562b6906499797c45df23f4352d8757d13e56371d5e3e0';
const planPath = 'docs/superpowers/plans/2026-08-24-durable-scheduler-task4-remediation-implementation.md';
const superseded = [
  'Task 4 deletion invalidates an inbound target root with a Task-2-valid result',
  'Task 4 classifies inbound exact absent and mismatch roots before target deletion',
  'Task 4 sweep skips existing-source exact, terminal, and non-orphan rows and rolls back between candidates'
];
function fail(code) { throw new Error(code); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function lines(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}
function same(left, right, code) {
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) fail(code);
}
function loadExpected() {
  const plan = fs.readFileSync(planPath, 'utf8');
  const match = /const expected = \[[\s\S]*?\n\];/.exec(plan);
  if (!match) fail('TASK4_R3_EXPECTED_TABLE_MISSING');
  const sandbox = {};
  vm.runInNewContext(match[0] + '\nglobalThis.task4Expected = expected;', sandbox);
  const value = sandbox.task4Expected;
  if (!Array.isArray(value) || value.length !== 24 || value.some((row) => !Array.isArray(row) ||
      typeof row[0] !== 'string' || !row[1] || typeof row[1].test !== 'function')) fail('TASK4_R3_EXPECTED_TABLE_INVALID');
  if (new Set(value.map((row) => row[0])).size !== 24) fail('TASK4_R3_EXPECTED_NAMES_DUPLICATED');
  return value;
}
const expected = loadExpected();
const expectedByName = new Map(expected);
function unquote(value) {
  const text = value.trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    try { return JSON.parse(text); } catch (_) { return text.slice(1, -1); }
  }
  return text;
}
function actualDiagnosticFields(block) {
  const fields = [], tapLines = block.split('\n');
  for (let index = 0; index < tapLines.length; index++) {
    const match = /^ {2}(actual|error|message|cause):(?:[ \t]*(.*))?$/.exec(tapLines[index]);
    if (!match) continue;
    const raw = match[2] || '', indicator = raw.trim();
    if (!/^[|>](?:[1-9][+-]?|[+-]?[1-9]?)?$/.test(indicator)) {
      fields.push({key: match[1], value: unquote(raw)});
      continue;
    }
    const body = [];
    let cursor = index + 1;
    for (; cursor < tapLines.length; cursor++) {
      if (/^ {0,2}\S/.test(tapLines[cursor])) break;
      body.push(tapLines[cursor]);
    }
    const indents = body.filter((line) => /\S/.test(line)).map((line) => (/^ */.exec(line) || [''])[0].length);
    const indent = indents.length ? Math.min(...indents) : 0;
    fields.push({key: match[1], value: body.map((line) => /\S/.test(line) ? line.slice(indent) : '').join('\n')});
    index = cursor - 1;
  }
  return fields;
}
function diagnosticFor(tap, name, source) {
  const marker = new RegExp('^not ok [0-9]+ - ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm');
  const match = marker.exec(tap);
  if (!match) fail('TASK4_R3_NAME_MISSING:' + source + ':' + name);
  const rest = tap.slice(match.index), end = rest.slice(1).search(/\nnot ok [0-9]+ - |\n# tests /);
  return (end < 0 ? rest : rest.slice(0, end + 1)).replace(/^[^\n]*(?:\n|$)/, '');
}
function assertCause(tap, name, source) {
  const cause = expectedByName.get(name);
  if (!cause) fail('TASK4_R3_UNKNOWN_FAILURE_NAME:' + source + ':' + name);
  const fields = actualDiagnosticFields(diagnosticFor(tap, name, source));
  if (!fields.length) fail('TASK4_R3_ACTUAL_CAUSE_FIELD_MISSING:' + source + ':' + name);
  if (!fields.some((field) => cause.test(field.value))) fail('TASK4_R3_CAUSE_MISSING:' + source + ':' + name + ':' + JSON.stringify(fields));
  return fields;
}
function tally(tap, tests, pass, failed, skipped, source) {
  for (const [label, count] of [['tests', tests], ['pass', pass], ['fail', failed], ['skipped', skipped]]) {
    if (!new RegExp('^# ' + label + ' ' + count + '$', 'm').test(tap)) fail('TASK4_R3_TAP_TALLY_INVALID:' + source + ':' + label);
  }
}
function named(tap) {
  return [...tap.matchAll(/^(ok|not ok) [0-9]+ - (Task 4 .+?)(?: # SKIP .*)?$/mg)].map((match) => ({ok: match[1] === 'ok', name: match[2]}));
}
function exactNames(rows, source) {
  const names = rows.map((row) => row.name);
  if (new Set(names).size !== 24) fail('TASK4_R3_TAP_NAMES_DUPLICATED:' + source);
  same(names.slice().sort(), expected.map((row) => row[0]).slice().sort(), 'TASK4_R3_TAP_NAMES_INVALID:' + source);
}
function decodedNames(line, prefix) {
  if (!line.startsWith(prefix)) fail('TASK4_R3_ENVELOPE_NAMES_LINE_INVALID');
  const value = Buffer.from(line.slice(prefix.length), 'base64').toString('utf8');
  if (!value.endsWith('\n')) fail('TASK4_R3_ENVELOPE_NAMES_NEWLINE_MISSING');
  return value.trimEnd().split('\n');
}
function verifyFile(record, source) {
  const match = /^file ([0-9a-f]{64}) ([0-9]+) ([0-9]+) ([0-9]+):([0-9]+) ([0-9]+) (.+)$/.exec(record);
  if (!match) fail('TASK4_R3_FILE_ROW_INVALID:' + source);
  const [, expectedHash, mode, size, uid, gid, count, rel] = match;
  const stat = fs.lstatSync(rel), bytes = fs.readFileSync(rel);
  if (!stat.isFile() || hash(bytes) !== expectedHash || String(stat.mode) !== mode || String(stat.size) !== size ||
      String(stat.uid) !== uid || String(stat.gid) !== gid || String(lines(bytes)) !== count) fail('TASK4_R3_FILE_IDENTITY_DRIFT:' + rel);
}
function verifyEvidence(line, kind, expectedTally) {
  const match = new RegExp('^' + kind + ' file ([0-9a-f]{64}) ([0-9]+) ([0-9]+) ([0-9]+):([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) (/.+)$').exec(line);
  if (!match) fail('TASK4_R3_EVIDENCE_ROW_INVALID:' + kind);
  const [, expectedHash, mode, size, uid, gid, count, tests, pass, failed, skipped, evidencePath] = match;
  const stat = fs.lstatSync(evidencePath), bytes = fs.readFileSync(evidencePath), tap = bytes.toString('utf8');
  if (!stat.isFile() || hash(bytes) !== expectedHash || String(stat.mode) !== mode || String(stat.size) !== size ||
      String(stat.uid) !== uid || String(stat.gid) !== gid || String(lines(bytes)) !== count) fail('TASK4_R3_EVIDENCE_IDENTITY_DRIFT:' + kind);
  tally(tap, Number(tests), Number(pass), Number(failed), Number(skipped), kind);
  same([Number(tests), Number(pass), Number(failed), Number(skipped)], expectedTally, 'TASK4_R3_EVIDENCE_TALLY_UNAUTHORIZED:' + kind);
  return tap;
}
function verify() {
  if (process.env.TASK4_R3_CONTINUATION_HANDOFF_ID !== handoffId ||
      process.env.TASK4_R3_CONTINUATION_HANDOFF_SHA256 !== handoffHash) fail('TASK4_R3_HANDOFF_ENV_INVALID');
  const envelope = Buffer.from(process.env.TASK4_R3_CONTINUATION_HANDOFF_B64 || '', 'base64').toString('utf8');
  if (hash(envelope) !== handoffHash || !envelope.endsWith('\n')) fail('TASK4_R3_HANDOFF_HASH_DRIFT');
  const rows = envelope.trimEnd().split('\n');
  if (rows.length !== 13 || rows[0] !== 'TASK4_R3_CONTINUATION_HANDOFF_BEGIN' ||
      rows[1] !== 'continuation-id ' + handoffId || rows[2] !== 'controller-attestation AUTHORIZED_R2_FIXTURE_RECOVERY' ||
      rows[12] !== 'TASK4_R3_CONTINUATION_HANDOFF_END') fail('TASK4_R3_HANDOFF_SHAPE_INVALID');
  const r2Red = verifyEvidence(rows[3], 'r2-red-evidence', [24, 0, 24, 0]);
  const r2Focused = verifyEvidence(rows[4], 'r2-focused-evidence', [24, 21, 3, 0]);
  const current = rows.slice(5, 9);
  const expectedPaths = ['server/db.js', 'server/world.js', 'server/scheduler/store.js', 'tools/test-scheduler.js'];
  same(current.map((row) => /^current-file (file .+)$/.exec(row)?.[1] || ''), current.map((row) => /^current-file file /.test(row) ? row.slice('current-file '.length) : ''), 'TASK4_R3_CURRENT_ROW_INVALID');
  same(current.map((row) => row.split(' ').at(-1)), expectedPaths, 'TASK4_R3_CURRENT_PATHS_INVALID');
  current.forEach((row) => verifyFile(row.slice('current-file '.length), 'current-file'));
  const valid = decodedNames(rows[9], 'valid-r2-red-names-base64 ');
  const supersededNames = decodedNames(rows[10], 'superseded-r2-red-names-base64 ');
  same(supersededNames, superseded, 'TASK4_R3_SUPERSEDED_NAMES_INVALID');
  const expectedValid = expected.map((row) => row[0]).filter((name) => !superseded.includes(name));
  same(valid, expectedValid, 'TASK4_R3_VALID_NAMES_INVALID');
  if (rows[11] !== 'shadow-permission DISPOSABLE_TEMP_ONLY LIVE_REPO_IMMUTABLE TASK3_IMMUTABLE') fail('TASK4_R3_SHADOW_PERMISSION_INVALID');
  const redRows = named(r2Red), focusedRows = named(r2Focused);
  exactNames(redRows, 'R2_RED');
  exactNames(focusedRows, 'R2_FOCUSED');
  same(redRows.filter((row) => !row.ok).map((row) => row.name), expected.map((row) => row[0]), 'TASK4_R3_R2_RED_NAMES_INVALID');
  valid.forEach((name) => assertCause(r2Red, name, 'R2_RED'));
  same(focusedRows.filter((row) => row.ok).map((row) => row.name), valid, 'TASK4_R3_R2_FOCUSED_PASS_NAMES_INVALID');
  same(focusedRows.filter((row) => !row.ok).map((row) => row.name), superseded, 'TASK4_R3_R2_FOCUSED_FAIL_NAMES_INVALID');
  process.stdout.write('TASK4_R3_CONTINUATION_VERIFIED\n');
}
function residual(tapPath) {
  const tap = fs.readFileSync(tapPath, 'utf8'), rows = named(tap);
  const failures = rows.filter((row) => !row.ok).map((row) => row.name);
  tally(tap, 24, 24 - failures.length, failures.length, 0, 'R3_CURRENT');
  exactNames(rows, 'R3_CURRENT');
  const evidence = failures.map((name) => ({name: name, fields: assertCause(tap, name, 'R3_CURRENT')}));
  if (!failures.length) return process.stdout.write('TASK4_R3_IMMEDIATE_GREEN\n');
  process.stdout.write('TASK4_R3_RESIDUAL_DIRECT_CAUSES_BASE64 ' +
    Buffer.from(JSON.stringify(evidence) + '\n').toString('base64') + '\n');
  process.stdout.write('TASK4_R3_RESIDUAL_RED ' + Buffer.from(failures.join('\n') + '\n').toString('base64') + '\n');
}
function shadow(tapPath, name, tag) {
  const tap = fs.readFileSync(tapPath, 'utf8');
  const rows = named(tap), row = rows.find((value) => value.name === name);
  if (!row || row.ok) fail('TASK4_R3_SHADOW_EXPECTED_FAILURE_MISSING:' + name);
  const fields = actualDiagnosticFields(diagnosticFor(tap, name, 'R3_SHADOW'));
  if (!fields.some((field) => field.value.includes(tag))) fail('TASK4_R3_SHADOW_TAG_MISSING:' + tag);
  if (fields.some((field) => /is not a function/.test(field.value))) fail('TASK4_R3_SHADOW_GENERIC_SETUP_FAILURE:' + name);
  process.stdout.write('TASK4_R3_SHADOW_SEMANTIC_FAILURE_PROVED:' + tag + '\n');
}
function manifest(output) {
  const root = fs.realpathSync(process.cwd());
  const files = ['server/db.js', 'server/world.js', 'server/scheduler/store.js', 'tools/test-scheduler.js',
    'server/scheduler/events.js', 'server/rules.js'];
  const rows = files.map((rel) => {
    const stat = fs.lstatSync(rel), bytes = fs.readFileSync(rel);
    if (!stat.isFile()) fail('TASK4_R3_LIVE_MANIFEST_TYPE_INVALID:' + rel);
    return {path: rel, mode: stat.mode, uid: stat.uid, gid: stat.gid, size: stat.size, hash: hash(bytes)};
  });
  if (fs.realpathSync(process.cwd()) !== root) fail('TASK4_R3_ROOT_DRIFT');
  fs.writeFileSync(output, rows.map(JSON.stringify).join('\n') + '\n');
}
const [command, ...args] = process.argv.slice(2);
if (command === 'verify') verify();
else if (command === 'residual' && args.length === 1) residual(args[0]);
else if (command === 'shadow' && args.length === 3) shadow(args[0], args[1], args[2]);
else if (command === 'manifest' && args.length === 1) manifest(args[0]);
else fail('TASK4_R3_COMMAND_INVALID');
NODE
node "$task4_tmp/task4-r3-continuation.cjs" verify
```

Expected: `TASK4_R3_CONTINUATION_VERIFIED`. Verification rejects an altered envelope, any different controller ID/hash, nonregular evidence, wrong R2 tally, a changed evidence byte/mode/owner/group/line count, a name-list substitution, a nonexact three-name supersession, a valid R2 cause that does not match this plan's direct field-level table, or any R2-current source/test identity drift. It accepts no report text, current snapshot, or self-authored replacement as a substitute.

- [ ] **Step 2: Replace the existing Task-4 test block with the corrected fixture before any source edit**

The verified `tools/test-scheduler.js` identity contains exactly one copy of each Task-4 title, including the three superseded tests. Replace that one existing Task-4 helper/test block—not the accepted Task-3 tests and not a second appended copy—with the complete Task-2 Step-1 code above, including its revised `task4LiveInboundRoot(arrivalOffsetS, ...)`, absolute timestamp assertions, direct Task-3 derivation proof, method-specific cause patterns, and the two inbound assertion tags added above. Preserve all twenty-four test names exactly once and preserve the focused name-pattern command. This is the only test edit permitted before an R3 residual result is known.

Run:

```bash
set -Eeuo pipefail
test "$(cat "$task4_tmp/task4-execution-route")" = r3
test "$(rg -c "^test\\('Task 4 " tools/test-scheduler.js)" -eq 24
node --check tools/test-scheduler.js
```

Expected: exactly twenty-four Task-4 registrations and valid syntax. A duplicate/missing title, a fixture change outside the specified Task-4 block, or any source edit before this replacement is a hard stop.

- [ ] **Step 3: Run the corrected focused suite and choose residual RED or immediate-GREEN evidence honestly**

Run:

```bash
set -Eeuo pipefail
task4_r3_first_tap="$task4_tmp/task4-r3-first.tap"
task4_r3_first_causes="$task4_tmp/task4-r3-first.causes"
task4_r3_first_result="$task4_tmp/task4-r3-first.result"
task4_r3_first_hash="$task4_tmp/task4-r3-first.sha256"
test ! -e "$task4_tmp/task4-r3-residual-seen"
for task4_r3_first_path in "$task4_r3_first_tap" "$task4_r3_first_causes" \
  "$task4_r3_first_result" "$task4_r3_first_hash"
do
  test ! -e "$task4_r3_first_path"
done
set +e
node --test-reporter=tap --test-name-pattern='Task 4 (exposes|reaches every|coalesces|scheduler-aware|deletion owns|deletion|classifies inbound|deletes|final lease fence|final save fence|creation final fence|derives durable timestamps|chooses|synchronizes|reducer continuation|sweep|preserves PENDING|releases|rejects expired|keeps current)' \
  tools/test-scheduler.js >"$task4_r3_first_tap" 2>&1
task4_r3_first_status=$?
set -e
cat "$task4_r3_first_tap"
node "$task4_tmp/task4-r3-continuation.cjs" residual "$task4_r3_first_tap" | tee "$task4_r3_first_causes"
if rg -q '^TASK4_R3_IMMEDIATE_GREEN$' "$task4_r3_first_causes"; then
  test "$task4_r3_first_status" -eq 0
  printf 'immediate-green\n' >"$task4_r3_first_result"
else
  test "$task4_r3_first_status" -ne 0
  rg -q '^TASK4_R3_RESIDUAL_DIRECT_CAUSES_BASE64 [A-Za-z0-9+/=]+$' "$task4_r3_first_causes"
  rg -q '^TASK4_R3_RESIDUAL_RED [A-Za-z0-9+/=]+$' "$task4_r3_first_causes"
  printf 'residual-red\n' >"$task4_r3_first_result"
  printf 'residual observed; first TAP, direct causes, and first result are sealed\n' \
    >"$task4_tmp/task4-r3-residual-seen"
fi
if test -e "$task4_tmp/task4-r3-residual-seen"; then
  sha256sum "$task4_r3_first_tap" "$task4_r3_first_causes" "$task4_r3_first_result" \
    "$task4_tmp/task4-r3-residual-seen" >"$task4_r3_first_hash"
else
  sha256sum "$task4_r3_first_tap" "$task4_r3_first_causes" "$task4_r3_first_result" >"$task4_r3_first_hash"
fi
chmod 0444 -- "$task4_r3_first_tap" "$task4_r3_first_causes" "$task4_r3_first_result" "$task4_r3_first_hash"
if test -e "$task4_tmp/task4-r3-residual-seen"; then chmod 0444 -- "$task4_tmp/task4-r3-residual-seen"; fi
cat "$task4_r3_first_result"
```

Expected: the verifier enforces exactly twenty-four named tests and `pass + fail = 24` with zero skips. The first corrected-fixture TAP, its direct field-level residual-cause evidence, its verdict, and their SHA-256 manifest are write-once/sealed evidence. If any remain failing, every failure must have its own direct actual/error/message/cause semantic match from the unchanged expected table; only those names are residual RED. `task4-r3-residual-seen` is then mandatory and immutable: implement the smallest source change for those residual failures only, preserving all first-run artifacts. Capture the post-fix command in distinct `task4-r3-postfix-green.tap`, `.causes`, `.result`, and `.sha256` files; require `TASK4_R3_IMMEDIATE_GREEN` / `24/24/0/0`, seal them, and rerun `sha256sum -c "$task4_r3_first_hash"` before continuing. If the *first* result is `immediate-green` and no residual marker exists, do not call it a chronological RED/GREEN cycle: record the controller-authorized TDD deviation and complete Step 4's shadow proof. Never revert, patch, or otherwise mutate a live source file merely to recreate RED.

When the sealed first result is `residual-red`, make only the minimal residual GREEN source edit, then run this distinct post-fix capture; it must not write to any `task4-r3-first.*` or `task4-r3-residual-seen` path:

```bash
set -Eeuo pipefail
test "$(cat "$task4_tmp/task4-r3-first.result")" = residual-red
test -f "$task4_tmp/task4-r3-residual-seen"
sha256sum -c "$task4_tmp/task4-r3-first.sha256"
task4_r3_postfix_tap="$task4_tmp/task4-r3-postfix-green.tap"
task4_r3_postfix_causes="$task4_tmp/task4-r3-postfix-green.causes"
task4_r3_postfix_result="$task4_tmp/task4-r3-postfix-green.result"
task4_r3_postfix_hash="$task4_tmp/task4-r3-postfix-green.sha256"
for task4_r3_postfix_path in "$task4_r3_postfix_tap" "$task4_r3_postfix_causes" \
  "$task4_r3_postfix_result" "$task4_r3_postfix_hash"
do
  test ! -e "$task4_r3_postfix_path"
done
node --test-reporter=tap --test-name-pattern='Task 4 (exposes|reaches every|coalesces|scheduler-aware|deletion owns|deletion|classifies inbound|deletes|final lease fence|final save fence|creation final fence|derives durable timestamps|chooses|synchronizes|reducer continuation|sweep|preserves PENDING|releases|rejects expired|keeps current)' \
  tools/test-scheduler.js >"$task4_r3_postfix_tap" 2>&1
node "$task4_tmp/task4-r3-continuation.cjs" residual "$task4_r3_postfix_tap" | tee "$task4_r3_postfix_causes"
rg -q '^TASK4_R3_IMMEDIATE_GREEN$' "$task4_r3_postfix_causes"
printf 'postfix-green\n' >"$task4_r3_postfix_result"
sha256sum "$task4_r3_postfix_tap" "$task4_r3_postfix_causes" "$task4_r3_postfix_result" >"$task4_r3_postfix_hash"
chmod 0444 -- "$task4_r3_postfix_tap" "$task4_r3_postfix_causes" "$task4_r3_postfix_result" "$task4_r3_postfix_hash"
sha256sum -c "$task4_r3_first_hash"
sha256sum -c "$task4_r3_postfix_hash"
```

- [ ] **Step 4: For immediate GREEN only, prove corrected-test sensitivity in disposable shadows**

Skip this step only after a genuine residual RED was fixed and rerun to all-green; it is mandatory only when the sealed *first* result is immediate-green and no residual marker exists. It must never infer eligibility from a post-fix result. Before the first copy and after the final shadow, record and compare complete live identities for all four Task-4 paths plus immutable Task-3 `events.js`/`rules.js`:

```bash
set -Eeuo pipefail
test "$(cat "$task4_tmp/task4-r3-first.result")" = immediate-green
test ! -e "$task4_tmp/task4-r3-residual-seen"
sha256sum -c "$task4_tmp/task4-r3-first.sha256"
node "$task4_tmp/task4-r3-continuation.cjs" manifest "$task4_tmp/task4-r3-shadow-live.before"
node "$task4_tmp/task4-manifest.cjs" before "$task4_tmp/task4-r3-shadow-scope.before" \
  "$task4_tmp/task4-r3-shadow-allowed.before"
task4_shadow_probe="$(mktemp -d /tmp/task4-r3-shadow.XXXXXX)"
case "$task4_shadow_probe" in /tmp/task4-r3-shadow.??????) ;; *) false ;; esac
set +e
(
  set -Eeuo pipefail
  task4_shadow_cleanup_root="$task4_shadow_probe"
  task4_shadow_cleanup() {
    task4_shadow_cleanup_status=$?
    case "${task4_shadow_cleanup_root:-}" in
      /tmp/task4-r3-shadow.??????) ;;
      *) return "$task4_shadow_cleanup_status" ;;
    esac
    if test -e "$task4_shadow_cleanup_root"; then find "$task4_shadow_cleanup_root" -depth -delete; fi
    test ! -e "$task4_shadow_cleanup_root"
    return "$task4_shadow_cleanup_status"
  }
  trap task4_shadow_cleanup EXIT HUP INT TERM
  false # injected failure: the EXIT trap must remove only task4_shadow_probe
)
task4_shadow_probe_status=$?
set -e
test "$task4_shadow_probe_status" -ne 0
test ! -e "$task4_shadow_probe"
for task4_shadow_case in inbound-target inbound-classification orphan-sweep; do
  (
  set -Eeuo pipefail
  task4_shadow_root="$(mktemp -d /tmp/task4-r3-shadow.XXXXXX)"
  case "$task4_shadow_root" in /tmp/task4-r3-shadow.??????) ;; *) false ;; esac
  task4_shadow_cleanup_root="$task4_shadow_root"
  task4_shadow_cleanup() {
    task4_shadow_cleanup_status=$?
    case "${task4_shadow_cleanup_root:-}" in
      /tmp/task4-r3-shadow.??????) ;;
      *) return "$task4_shadow_cleanup_status" ;;
    esac
    if test -e "$task4_shadow_cleanup_root"; then find "$task4_shadow_cleanup_root" -depth -delete; fi
    test ! -e "$task4_shadow_cleanup_root"
    return "$task4_shadow_cleanup_status"
  }
  trap task4_shadow_cleanup EXIT HUP INT TERM
  task4_shadow_repo="$task4_shadow_root/repo"
  mkdir "$task4_shadow_repo"
  node - "$PWD" "$task4_shadow_repo" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.realpathSync(process.argv[2]);
const destination = path.resolve(process.argv[3]);
if (!/^\/tmp\/task4-r3-shadow\.[A-Za-z0-9]{6}\/repo$/.test(destination) ||
    fs.readdirSync(destination).length !== 0) {
  throw new Error('TASK4_R3_SHADOW_COPY_DESTINATION_INVALID');
}
for (const name of fs.readdirSync(source)) {
  if (name === '.git') continue;
  fs.cpSync(path.join(source, name), path.join(destination, name), {
    recursive: true, dereference: false, errorOnExist: true, force: false,
    preserveTimestamps: false, verbatimSymlinks: true
  });
}
if (fs.existsSync(path.join(destination, '.git'))) throw new Error('TASK4_R3_SHADOW_GIT_COPIED');
for (const rel of ['server/db.js', 'server/world.js', 'server/scheduler/store.js', 'tools/test-scheduler.js']) {
  const from = path.join(source, rel), to = path.join(destination, rel);
  const left = fs.readFileSync(from), right = fs.readFileSync(to), stat = fs.lstatSync(to);
  if (!stat.isFile() || !left.equals(right) || crypto.createHash('sha256').update(left).digest('hex') !==
      crypto.createHash('sha256').update(right).digest('hex')) throw new Error('TASK4_R3_SHADOW_COPY_INVALID:' + rel);
  if (typeof process.getuid === 'function' && (stat.uid !== process.getuid() || stat.gid !== process.getgid())) {
    throw new Error('TASK4_R3_SHADOW_COPY_OWNERSHIP_INVALID:' + rel);
  }
}
NODE
  node - "$task4_shadow_repo" "$task4_shadow_case" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2], kind = process.argv[3];
const cases = {
  'inbound-target': {
    file: 'server/world.js',
    from: "if (entry.referencedAsTarget && candidate.status === 'EXACT') {",
    to: "if (false && entry.referencedAsTarget && candidate.status === 'EXACT') {"
  },
  'inbound-classification': {
    file: 'server/world.js',
    from: 'reason = schedulerEvents.canonicalExternalStatus(self.kho, entry.canonicalRef);',
    to: "reason = 'EXACT'; // TASK4_R3_SHADOW_DISABLE_SOURCE_CLASSIFICATION"
  },
  'orphan-sweep': {
    file: 'server/scheduler/store.js',
    from: "self.invalidateGlobalJob(token, entry.root.id, 'ALREADY_ABSENT', Number(entry.root.scheduled_at_s), nowMs);",
    to: 'self.assertLiveLease(token, nowMs); // TASK4_R3_SHADOW_DISABLE_ORPHAN_INVALIDATION'
  }
};
const change = cases[kind];
if (!change) throw new Error('TASK4_R3_SHADOW_CASE_INVALID');
const file = path.resolve(root, change.file);
if (!file.startsWith(root + path.sep)) throw new Error('TASK4_R3_SHADOW_PATH_ESCAPE');
const text = fs.readFileSync(file, 'utf8');
if (text.split(change.from).length !== 2) throw new Error('TASK4_R3_SHADOW_MUTATION_ANCHOR_INVALID:' + kind);
fs.writeFileSync(file, text.replace(change.from, change.to));
NODE
  case "$task4_shadow_case" in
    inbound-target)
      task4_shadow_name='Task 4 deletion invalidates an inbound target root with a Task-2-valid result'
      task4_shadow_tag=TASK4_RED_INBOUND_TARGET_ROOT ;;
    inbound-classification)
      task4_shadow_name='Task 4 classifies inbound exact absent and mismatch roots before target deletion'
      task4_shadow_tag=TASK4_RED_INBOUND_CLASSIFICATION_ROOT ;;
    orphan-sweep)
      task4_shadow_name='Task 4 sweep skips existing-source exact, terminal, and non-orphan rows and rolls back between candidates'
      task4_shadow_tag=TASK4_RED_SWEEP_BETWEEN_CANDIDATES ;;
  esac
  set +e
  (cd "$task4_shadow_repo" && node --test-reporter=tap --test-name-pattern="^$task4_shadow_name$" tools/test-scheduler.js) \
    >"$task4_tmp/task4-r3-shadow-$task4_shadow_case.tap" 2>&1
  task4_shadow_status=$?
  set -e
  cat "$task4_tmp/task4-r3-shadow-$task4_shadow_case.tap"
  test "$task4_shadow_status" -ne 0
  node "$task4_tmp/task4-r3-continuation.cjs" shadow \
    "$task4_tmp/task4-r3-shadow-$task4_shadow_case.tap" "$task4_shadow_name" "$task4_shadow_tag"
  sha256sum "$task4_shadow_repo/server/world.js" "$task4_shadow_repo/server/scheduler/store.js" \
    >"$task4_tmp/task4-r3-shadow-$task4_shadow_case.sha256"
  )
done
node "$task4_tmp/task4-r3-continuation.cjs" manifest "$task4_tmp/task4-r3-shadow-live.after"
cmp -s "$task4_tmp/task4-r3-shadow-live.before" "$task4_tmp/task4-r3-shadow-live.after"
node "$task4_tmp/task4-manifest.cjs" before "$task4_tmp/task4-r3-shadow-scope.after" \
  "$task4_tmp/task4-r3-shadow-allowed.after"
cmp -s "$task4_tmp/task4-r3-shadow-scope.before" "$task4_tmp/task4-r3-shadow-scope.after"
cmp -s "$task4_tmp/task4-r3-shadow-allowed.before" "$task4_tmp/task4-r3-shadow-allowed.after"
```

Expected: each exact named corrected test fails only in its own disposable copy and exposes its required semantic tag in a direct diagnostic field: disabling the pre-delete inbound-target exact branch proves target invalidation, forcing post-delete source status `EXACT` proves absent/mismatch classification/invalidation, and suppressing only missing-source `invalidateGlobalJob` proves the sweep's leased orphan path. A missing method, fixture/setup failure, a live-file difference, an accepted Task-3 difference, an ambiguous replacement anchor, or a mutation that does not produce the named tag is a hard stop. The stored per-case shadow hashes, TAP, and live before/after manifests are report evidence; never copy a shadow change back, use `git reset`, or revert live code.

### Task 3: GREEN — implement the smallest revision-aware canonical synchronization path (fresh route only)

Before every command in this task, require `test "$(cat "$task4_tmp/task4-execution-route")" = fresh`. R3 executes only its named residual GREEN in Task 2R3 Step 3; it must not replay this broad implementation task against controller-pinned backend changes.

**Files:**

- Modify: `server/db.js`.
- Modify: `server/world.js`.
- Modify: `server/scheduler/store.js`.
- Test: `tools/test-scheduler.js`.

**Consumes:** `SchedulerStore.replaceAccountAdvance`, `listDerivedJobsForAccount`, replay lineage validation, Task 3 event contracts, the existing world `_ghiNhieu` projection order, and the mutation context's `{leaseToken, remainingBudget, effectiveNowMs}`.

**Produces:** the interfaces declared above and one atomically synchronized world-save/delete path.

- [ ] **Step 1: Add only the lazy revision statement to `server/db.js`**

Implement `Kho.prototype.schedulerStatements()` after the existing `Kho` methods. It must cache a single prepared statement only after `PRAGMA table_info(dq)` proves `revision` exists; otherwise throw `SCHEDULER_SCHEMA_REQUIRED`. The statement must update the existing save fields, set `revision=revision+1`, and `RETURNING revision`. Do not change constructor statement preparation, schema, migrations, or any `giaoDich`/`trongGiaoDich` behavior except the explicitly authorized minimal finalizer lifecycle below. The implementation shape is:

```js
Kho.prototype.schedulerStatements = function () {
  if (this._schedulerStatements) return this._schedulerStatements;
  var columns = this.db.prepare('PRAGMA table_info(dq)').all().map(function (row) {
    return row.name;
  });
  if (columns.indexOf('revision') < 0) throw new Error('SCHEDULER_SCHEMA_REQUIRED');
  this._schedulerStatements = {dqLuu: this.db.prepare(
    'UPDATE dq SET state=?,diem=?,diemCT=?,diemNC=?,diemHam=?,diemThu=?,' +
    'lastTick=?,keTiep=?,lm=?,soHT=?,capNhat=?,revision=revision+1 WHERE tk=? ' +
    'RETURNING revision'
  )};
  return this._schedulerStatements;
};
```

The revisioned caller must use this SQLite `RETURNING` statement with `.get(...)`, not `.run(...)`: it must reject a missing returned row with `SCHEDULER_DQ_SAVE_CONFLICT`, reject a returned revision that is not a safe integer `>= 1` with `SCHEDULER_DQ_REVISION_INVALID`, and return `Number(row.revision)`. This conversion is mandatory before the value enters the receipt, `expected_revision`, or any assertion; never retain SQLite's raw numeric representation.

**Minimal Task-4-owned transaction-finalizer override:** in this same file only, add `_schedulerFinalizers` to the existing outer transaction state. `dangKySchedulerFinalizer(fn)` rejects a non-function or `transactionDepth===0`, stores each function at most once by identity in FIFO order on the outer state, and never opens a transaction. Nested `trongGiaoDich` joins that same outer list. At the outermost `trongGiaoDich` success path, after its callback returns and after the rollback-only check, run finalizers FIFO immediately before `COMMIT`; each may only perform the exact scheduler lease assertion. If a finalizer throws, mark rollback-only, execute one `ROLLBACK`, rethrow the same error, and reset depth, rollback state, failure, and finalizer list. Reset/clear the list as well after normal commit or any callback/commit rollback. Do not change nested transaction behavior, begin mode, callback ordering, error propagation except this pre-commit lifecycle, or execute a finalizer after `COMMIT`. Task 3 and Task 5 may rely on the resulting atomic scheduler ABI but must neither register finalizers nor alter `Kho` transaction semantics.

- [ ] **Step 2: Make `server/world.js` stage then synchronize the real batch**

Keep Foundation behavior exactly when no scheduler Store was injected. Before any valid capability is installed, `datScheduler(store)` must reject null and malformed Store shapes with `SCHEDULER_STORE_INVALID`; it accepts the first valid Store, treats that **same instance** as an idempotent no-op, and rejects a distinct otherwise-valid replacement with exactly `SCHEDULER_STORE_ALREADY_INSTALLED`. Before any valid service is installed, `datAdvanceService(service)` must reject null, missing/non-function `advanceTo`, and a callable with the wrong frozen four-argument ABI with `SCHEDULER_ADVANCE_SERVICE_INVALID`; it accepts the first valid service, treats that **same instance** as an idempotent no-op, and rejects a distinct otherwise-valid replacement with exactly `SCHEDULER_ADVANCE_SERVICE_ALREADY_INSTALLED`. Scheduler mutation staging/save/creation/delete entry points must reject missing/non-object mutation, missing lease token, non-object budget, values other than safe integers in `0..50_000`, and `effectiveNowMs` values that are missing, negative, non-safe-integer, `NaN`, or infinite **before any canonical read, batch staging, account creation, transaction, or durable write**, using `SCHEDULER_MUTATION_TOKEN_REQUIRED` or `SCHEDULER_MUTATION_INVALID` as applicable. Each entrypoint must independently revalidate the exact active mutation immediately before its own work; a mutation that passed `trongMutationScheduler` admission but is changed to invalid inside its active callback must fail at that entrypoint with `SCHEDULER_MUTATION_INVALID` and make no read/write. Exact zero is legal only for an already-active context after its final primitive: it must persist its final partial checkpoint without replacing the `remainingBudget` object. New Writer admission and a new `G.tick` still reject a starting zero; World must not reclassify that established zero as invalid. In scheduler mode: install one Store and one advance service; require the exact active mutation object including a live `{value: <safe-integer>}` `remainingBudget`; add `schedulerLuu:new Map()` to the existing batch context; and coalesce repeated `luu(accountId, state, {mutation})` calls in one context by replacing the map value for that account rather than appending another write. Each account entry owns one receipt, one exact mutation-object identity, and sticky **`luu` options** `{currentAccountAdvanceJobId:null,deferAccountWake:false,protectedRecoveryRootIds:new Set()}`; none is a field on `mutation`. A supplied non-null current wake ID must equal a prior supplied ID or throw `SCHEDULER_ACCOUNT_JOB_CONFLICT`; `deferAccountWake` is monotonic OR; a later ordinary save may not clear either flag. This applies in both call orders and uses the final supplied state object, never an earlier object mutated in place. Each staged account entry privately copies its supplied `options.protectedRecoveryRootIds` once into an immutable Set, unions later options Sets for that same account, and retains every root in that private union even when the final derived key set no longer contains it. A conflicting mutation object for the same account throws `SCHEDULER_MUTATION_TOKEN_CONFLICT`. `advanceAccountNoiBo(mutation,accountId,targetS,saveOptions)` must delegate exactly once as `this._advanceService.advanceTo(mutation,accountId,targetS,saveOptions)` **from inside the callback of that same object's** `trongMutationScheduler(mutation, fn)`; account-first argument order and after-callback delegation are forbidden. The real outer `batDau()`/`ketThuc(true)` pair owns this batch: each staged `luu` returns the same mutable receipt for its account, initially nullable and filled to `{revision,nextLocalAtS}` by `ketThuc`; the outer `ketThuc(true)` returns `Map<accountId,receipt>`. `_ghiNhieu` must consume the final one-row-per-account map, return `Map<accountId,revision>` after its existing `dq → delete projections → all ht → fleet projections` order, and call post-save synchronization once only after this batch completes inside the same outer immediate UoW. While an active mutation exists, every durable clock write derives only from `mutation.effectiveNowMs`: `dq.capNhat` is `Math.floor(effectiveNowMs/1000)`; `event_jobs.created_at_ms`, `updated_at_ms`, and `cancelled_at_ms`, plus `event_applications.applied_at_ms`, receive that exact millisecond value. Domain deadlines such as `scheduled_at_s` remain their canonical event time, but Store scheduling/cancellation/application calls receive `effectiveNowMs`, never `clock.nowMs()`. Before its first write and before each derived-job/local-wake mutation, assert the exact lease owner/generation/expiry. Then call the private `_assertSchedulerFinalFence(mutation)` exactly once after the **last** post-save derived/global/local Store mutation and immediately before the actual outermost `COMMIT`; it does only `store.assertLiveLease(mutation.leaseToken, mutation.effectiveNowMs)`, and no durable write may follow it. For an owning UoW, perform that check directly at the end; for a caller-owned UoW, register the same check exactly once through `kho.dangKySchedulerFinalizer` so it runs after all caller writes immediately before that caller's outermost commit. The deletion/save/creation tests instrument both forms: their TEMP SQLite guards abort any post-fence `dq`, projection, account, alliance, chat, bulletin, battle, or scheduler write, then a separate fault run flips generation at the actual final fence so only its inner live-lease assertion yields `LEASE_LOST`. The check remains mandatory when the batch has only protected replay/RUNNING globals and no eligible Store mutation follows it. Any stale generation throws `LEASE_LOST` and rolls back dq state/revision, projections, jobs, applications, metadata, config, shared NPC/debris, battle history, and SQLite sequence state together. The coalescing and test-only temporary SQLite triggers above are mandatory proof; do not add a production test hook.

When deletion, a staged save, or scheduler-aware creation joins a caller-owned UoW, it must register—not execute—its `_assertSchedulerFinalFence(mutation)` through `kho.dangKySchedulerFinalizer`. The outermost `trongGiaoDich` runs that FIFO finalizer after all caller writes and immediately before the actual outer `COMMIT`; it is the only legal final check. A caller may write before that finalizer executes, but no durable write may occur after the finalizer's live-lease assertion. The joined deletion/save/creation placement cases each deliberately make a caller configuration write after the World operation and before outer commit; the companion generation-flip case must throw `LEASE_LOST` from the finalizer at that actual outer commit and roll back both the World writes and caller write. Preserve the independent owning-UoW placement/fault cases for all three operations.

**Task 3/Task 5 boundary:** neither Task 3 nor Task 5 receives a finalizer registration API. They consume only Task-4 World/Store results after the outer transaction commits; any direct `Kho.dangKySchedulerFinalizer`, transaction-state mutation, or post-commit callback is out of their ABI and a scope failure. The Task-4 report must record the pre-RED `server/db.js` identity above and finalizer lifecycle evidence. Both mandatory reviewers must specifically verify finalizer registration/dedup/order/reset, joined-UoW rollback, and that Task 3/5 interfaces remain unchanged.

For each saved account, construct owner mapping from `SELECT tk,state FROM dq ORDER BY tk`, call Task 3 `deriveExternalJobs(accountId,state,targetAccountForKey)`, and call only `canonicalExternalStatus(kho, ref)` before deciding whether a retained root is `EXACT`, `ALREADY_ABSENT`, or `REF_MISMATCH`. The state/callback overload is forbidden: `canonicalExternalStatus` must reload the authoritative owner row through the supplied `kho`. Schedule missing derived roots idempotently, retain exact stable roots, and pass only an already-proved `ALREADY_ABSENT`/`REF_MISMATCH` reason to the Store method in Step 3. Before any stale-derived-root invalidation, reject a root that appears in the entry's immutable `protectedRecoveryRootIds`: this current logical-global reducer/replay continuation fence wins even if the saved state changes its ref or removes it. It retains both the root and every child byte-for-byte, produces no application, does not mark durable mutation, and leaves the watermark unchanged; a later writer/replay terminal path is its only resolver. Call `replaceAccountAdvance` only for normal command saves. A reducer-owned save with `currentAccountAdvanceJobId` plus `deferAccountWake:true` must return `{revision,nextLocalAtS}` without cancelling its active `RUNNING` wake or creating a second wake.

After `datScheduler(store)`, `taoDeQuoc(accountId,displayName,{mutation})` is also a scheduler mutation. It must create its canonical state/projections and initial `ACCOUNT_ADVANCE` in the same outer `batDau`/`ketThuc` UoW, with `expected_revision=0`, `nextLocalAtS=G.phanLoaiSuKienNoiBoKe(createdState,accountId,ownerFor).atS`, and the returned `created.receipt` object filled by the batch receipt. The legacy two-argument account-creation path remains byte-for-byte behaviorally unchanged.

Use `G.phanLoaiSuKienNoiBoKe(state, accountId, targetAccountForKey, durableFences)` and the canonical owner callback to select only a local successor. Never use `G.phanLoaiSuKienKe` or `G.sukienKe` as an `ACCOUNT_ADVANCE` wake source: an earlier external primitive must not suppress a later local primitive. The helper's returned `atS` is the sole local-wake input; the explicit earlier-external/later-local RED test above must prove this case.

```js
if (!item.options.currentAccountAdvanceJobId && !item.options.deferAccountWake) {
  world._scheduler.replaceAccountAdvance(
    item.mutation.leaseToken, accountId, revision,
    nextLocal ? nextLocal.atS : null, item.mutation.effectiveNowMs
  );
}
```

- [ ] **Step 3: Implement root-aware Store invalidation, deletion preparation, and sweep**

Extend `server/scheduler/store.js` without changing Task-2 validation, schema, replay creation, public cancellation rules, or lease fence semantics.

1. `listLogicalGlobalsReferencingAccount` must scan logical global roots plus at most one active replay child using the existing replay-lineage validator. It validates payloads, returns root/child/reference metadata, and matches `(source_account_id===accountId) || targetKeys.has(ref.targetKey)`. It deduplicates by root id and preserves deterministic `(scheduled_at_s,priority,sequence,id)` order.
2. `prepareDeletedAccountJobResolution` must assert the lease, refuse a `RUNNING` local wake with `DELETED_ACCOUNT_RUNNING_ACTIVE`, cancel only local PENDING/RETRY_WAIT wakes, and classify globals. A replay child in PENDING/RETRY_WAIT/RUNNING/QUARANTINED makes its logical root `protectedReplay`; neither row is mutated. Roots without an active child may enter `invalidatable` only when their root state is PENDING/RETRY_WAIT/QUARANTINED; RUNNING roots remain untouched.
3. `invalidateGlobalJob` accepts a **logical root id**, rejects `ACCOUNT_ADVANCE`, rejects every active replay child with `REPLAY_REPLACEMENT_ACTIVE`, and rejects any effective time unequal to the logical root's `scheduled_at_s` with `INVALIDATION_EFFECTIVE_TIME_INVALID`. With no evidence it accepts only caller-proved outbound reason `ALREADY_ABSENT` or `REF_MISMATCH` (the world determines it only by Task 3 `canonicalExternalStatus(kho, ref)`, never by a Store/rules import) and writes `{code:'ENTITY_REMOVED', invalidation:'canonical', neutralization:<proved-status>}`. The only `EXACT` case is a live inbound root: the caller must pass reason `EXACT` plus immutable `{targetRemovedKey: ref.targetKey}` captured before cascade; a missing object throws `CANONICAL_NEUTRALIZATION_REQUIRED`, and an absent, non-string, or nonmatching key throws `TARGET_REMOVAL_EVIDENCE_INVALID`. The Store verifies the exact key against the validated root ref and writes the exact Task-2 result `{code:'ENTITY_REMOVED'}`. It never invents `TARGET_REMOVED`. Its conditional root claim must accept `PENDING`, `RETRY_WAIT`, or `QUARANTINED` irrespective of a future `retry_at_ms`, require the live owner/generation/expiry in the same SQL predicate, and recheck the lease after every zero-row update. It then calls `markDurableMutation` before inserting exactly one application, uses the existing application-proven terminal transition, and invokes `releaseBlockedAccountDependents` only after that terminal proof. It never calls `cancel()`.
4. `sweepDeletedAccountOrphans` must call the same helper in a Store-owned immediate UoW or receive the existing one, so a row cannot be observed absent then committed partially. It detects missing local aggregate accounts and missing global sources by left join, then applies the exact classification from item 2. Its matrix is exhaustive and reachable: a Task-2-valid missing-source root is `ALREADY_ABSENT` and is invalidated; `REF_MISMATCH` requires an existing canonical source and therefore is a non-orphan skip, not a missing-source sweep result; an existing-source `EXACT` root is also skipped; terminal roots, non-orphan local wakes, and non-orphan globals are byte-identical skips; PENDING/RETRY_WAIT/RUNNING/QUARANTINED replay children protect their roots. A future `RETRY_WAIT` global remains a barrier and is invalidated only through the lease-fenced helper, never treated as ineligible. Use the supplied `effectiveNowMs` for every cancellation, application, metadata, and audit time. In the multi-candidate case, recheck the live lease after every candidate; an injected generation flip between candidates throws `LEASE_LOST` and rolls back every jobs/applications/metadata/lease/sequence row from the whole sweep. It must not attempt inbound-target inference after deletion because only `xoaTaiKhoan` has the durable pre-delete `targetKeys` evidence.

- [ ] **Step 4: Orchestrate deletion in `TheGioi.prototype.xoaTaiKhoan`**

In scheduler mode, require the exact active mutation before any canonical write: every scheduler-active `xoaTaiKhoan` test calls it through `trongMutationScheduler(mutation, () => xoaTaiKhoan(...,{mutation}))`, never merely passes an options object. `xoaTaiKhoan` owns one `kho.trongGiaoDich(fn,{immediate:true})` boundary: it opens that outer immediate UoW when `transactionDepth===0`, and when a caller already owns one it joins the existing rollback-only transaction rather than opening a nested SQLite transaction. The returned/error path leaves `transactionDepth` unchanged for the caller and resets it to zero only for an originally absent transaction. Read and freeze the deleting state's full target-key set while `dq` still exists; call `prepareDeletedAccountJobResolution` in that same UoW; execute the existing account/alliance/session deletion; then call `invalidateGlobalJob` for each `invalidatable` root before any commit. Keep the current legacy no-scheduler branch unmodified. The ordering must be:

```text
assert mutation + lease
→ capture canonical target keys and logical roots
→ cancel eligible local wakes
→ delete account canonical/projection/session rows
→ invalidate eligible outbound and inbound global roots
→ existing alliance/chat cleanup and bulletin
→ `_assertSchedulerFinalFence(mutation)` exactly once
→ commit once
```

Do not start a nested transaction. The final-fence helper is literally the last durable operation after alliance/chat/bulletin cleanup; it may only assert the active lease, and no write—including `scheduler_lease`, a scheduler table, or a later bulletin—may follow it. For each live inbound candidate whose pre-delete Task-3 status is `EXACT`, call `invalidateGlobalJob(...,'EXACT',...,{targetRemovedKey:candidate.canonicalRef.targetKey})`; that evidence authorizes only the exact Task-2-valid application `{code:'ENTITY_REMOVED'}`. Outbound candidates pass no target-removal evidence and must prove source absence/mismatch normally. Thread `mutation.effectiveNowMs` (not the ambient fixture clock) through local cancellation, global invalidation/application, scheduler metadata, and the deletion bulletin timestamp. If `prepareDeletedAccountJobResolution` reports a protected replay or RUNNING global, deletion may commit its canonical delete and local cancellation while preserving the global logical barrier; the existing replay/expiry lifecycle is its only resolver. This is intentional and tested.

- [ ] **Step 5: Run focused GREEN after each smallest coherent change**

Run, saving and checking its TAP output rather than accepting a process exit alone:

```bash
set -Eeuo pipefail
task4_green="$(mktemp)"
trap 'rm -f "$task4_green"' EXIT
node --test-reporter=tap --test-name-pattern='Task 4 (exposes|reaches every|coalesces|scheduler-aware|deletion owns|deletion|classifies inbound|deletes|final lease fence|final save fence|creation final fence|derives durable timestamps|chooses|synchronizes|reducer continuation|sweep|preserves PENDING|releases|rejects expired|keeps current)' \
  tools/test-scheduler.js >"$task4_green" 2>&1
cat "$task4_green"
rg -q '^# tests 24$' "$task4_green"
rg -q '^# pass 24$' "$task4_green"
rg -q '^# fail 0$' "$task4_green"
rg -q '^# skipped 0$' "$task4_green"
test "$(rg -c '^ok [0-9]+ - Task 4 ' "$task4_green")" -eq 24
test "$(rg -c '^not ok ' "$task4_green" || true)" -eq 0
test "$(rg -c '# SKIP' "$task4_green" || true)" -eq 0
node --test-reporter=tap tools/test-uow.js
```

Expected: all twenty-four Task-4 tests pass with twenty-four `ok` records and zero selected-test skips. If any failure occurs, do not add a second fix. Reproduce the one failure, compare its receipt, root/child state, application rows, effective time, lease generation, watermark, and metadata snapshots against the invariants above, then make the minimal correction.

### Task 4: Verify integration, rollback, static fences, scope, and handoff

**Files:**

- Verify: all Task-4 source/test paths and protected paths.
- Create after passing verification: `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md`.

**Consumes:** passing focused Task-4 tests and the Task-1/Task-2 protected identity baselines.

**Produces:** evidence sufficient for independent logic and scope/runtime review.

- [ ] **Step 1: Run the complete direct scheduler suite and syntax/lint gates**

Run:

```bash
set -Eeuo pipefail
node --test-reporter=tap tools/test-scheduler.js
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
node --check server/db.js
node --check server/world.js
node --check server/scheduler/store.js
node --check tools/test-scheduler.js
node tools/lint.js
```

Expected: every runnable command exits zero. The documented sandbox socket skip may remain only if its TAP label/reason is unchanged. If `npm test` or `node tools/check-syntax.js` is also required by the current accepted Task-3 gate and fails due to sandbox `EPERM`, record its entire output as an environmental blocker; never call it a pass or alter package/tooling to evade it.

- [ ] **Step 2: Run explicit static and semantic fence checks**

Run:

```bash
set -Eeuo pipefail
task4_count_literal() {
  local needle="$1"
  shift
  rg --no-filename -c -F -- "$needle" "$@" | awk '{total += $1} END {print total + 0}'
}
rg -n "SchedulerStore\.prototype\.(invalidateGlobalJob|sweepDeletedAccountOrphans|prepareDeletedAccountJobResolution|listLogicalGlobalsReferencingAccount)" server/scheduler/store.js
rg -n "xoaTaiKhoan|schedulerStatements|revision=revision\+1|RETURNING revision|datScheduler|datAdvanceService|advanceAccountNoiBo|advanceTo\(mutation,accountId,targetS,saveOptions\)|trongMutationScheduler|_assertSchedulerFinalFence|schedulerLuu|remainingBudget|effectiveNowMs|capNhat|currentAccountAdvanceJobId|deferAccountWake|protectedRecoveryRootIds|canonicalExternalStatus|taoDeQuoc|batDau|ketThuc" server/world.js server/db.js
test "$(task4_count_literal 'SCHEDULER_MUTATION_TOKEN_REQUIRED' server/world.js)" -ge 1
test "$(task4_count_literal 'REPLAY_REPLACEMENT_ACTIVE' server/scheduler/store.js)" -ge 1
test "$(task4_count_literal 'markDurableMutation' server/scheduler/store.js)" -ge 2
test "$(task4_count_literal 'protectedRecoveryRootIds' server/world.js server/scheduler/store.js)" -ge 2
test "$(task4_count_literal 'advanceTo(mutation,accountId,targetS,saveOptions)' server/world.js)" -ge 1
test "$(task4_count_literal 'effectiveNowMs' server/world.js server/scheduler/store.js)" -ge 4
test "$(task4_count_literal 'ENTITY_REMOVED' server/scheduler/store.js server/world.js)" -ge 2
if rg -n -F -- 'listAccountAdvance' server/db.js server/world.js server/scheduler/store.js tools/test-scheduler.js; then false; fi
git diff --check -- server/db.js server/world.js server/scheduler/store.js tools/test-scheduler.js \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md
test ! -s "$task4_tmp/cached-diff.before.patch"
```

Expected: each required named method and fence is present, whitespace check is clean, and the index remains empty. Inspect the diff manually to confirm no migration, package, generated artifact, Task-2 region, or replay constructor changed.

- [ ] **Step 3: Prove protected scope before writing the report**

Using the `task4_tmp` created in Task 1, run:

```bash
set -Eeuo pipefail
sha256sum \
  docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md \
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md \
  .superpowers/sdd/model-routing.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md \
  server/scheduler/migrations.js server/scheduler/contract.js package.json \
  >"$task4_tmp/protected.after.sha256"
cmp "$task4_tmp/protected.before.sha256" "$task4_tmp/protected.after.sha256"
task4_plan=docs/superpowers/plans/2026-08-24-durable-scheduler-task4-remediation-implementation.md
test "$(sha256sum "$task4_plan" | cut -d' ' -f1)" = "$TASK4_DISPATCH_PLAN_SHA256"
test "$(wc -l <"$task4_plan" | tr -d ' ')" = "$TASK4_DISPATCH_PLAN_LINES"
test "$(wc -c <"$task4_plan" | tr -d ' ')" = "$TASK4_DISPATCH_PLAN_BYTES"
printf 'TASK4_DISPATCH_RECHECK %s %s %s %s\n' "$TASK4_DISPATCH_HANDOFF_ID" "$TASK4_DISPATCH_PLAN_SHA256" "$TASK4_DISPATCH_PLAN_LINES" "$TASK4_DISPATCH_PLAN_BYTES"
task4_assert_accepted_sha() {
  test "$(sha256sum "$1" | cut -d' ' -f1)" = "$2"
}
task4_assert_accepted_sha docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md \
  1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf
task4_assert_accepted_sha docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md \
  cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
task4_assert_accepted_sha server/scheduler/migrations.js \
  1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76
task4_assert_accepted_sha server/scheduler/contract.js \
  3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1
task4_assert_accepted_sha package.json \
  7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f
task4_assert_accepted_sha .superpowers/sdd/model-routing.md \
  09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f
task4_assert_accepted_sha .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md \
  2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a
task4_assert_accepted_sha .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md \
  6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38
task4_assert_accepted_sha .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md \
  a09e794304213d0f178e65b50957cc351be93580624caca3c38ca8dd172e1622
task4_assert_accepted_sha .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md \
  8823be0784319862af394d007fad4574830108c11910691b7f47ad540bb1edf2
node "$task4_tmp/task4-manifest.cjs" before "$task4_tmp/scope.pre-report.manifest" "$task4_tmp/allowed.pre-report.manifest"
cmp -s "$task4_tmp/scope.before.manifest" "$task4_tmp/scope.pre-report.manifest"
test -s "$task4_tmp/allowed.before.manifest"
node - "$task4_tmp/allowed.pre-report.manifest" <<'NODE'
const fs = require('node:fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trimEnd().split('\n').map(JSON.parse);
const report = rows.find((row) => row.path.endsWith('/task-4-report.md'));
if (!report || report.type !== 'absent') throw new Error('TASK4_REPORT_PREMATURELY_EXISTS');
for (const row of rows.filter((row) => !row.path.endsWith('/task-4-report.md'))) {
  if (row.type !== 'file') throw new Error('TASK4_ALLOWED_PRE_REPORT_TYPE_DRIFT:' + row.path);
}
NODE
```

Expected: the protected comparison is exact, and the second exact-digest pass independently rejects any Task-1/Task-2 brief/report or routing drift. The pre-report closed-world manifest must be byte-identical outside the allowlist, while every allowed source/test regular file is rooted, has no trailing whitespace, and has no line longer than 240 bytes; the report remains truly absent. Do not compare a plain file-hash list: it cannot prove type, symlink, mode, ownership, untracked-path safety, or text hygiene.

- [ ] **Step 4: Write the Task-4 report and request dual review**

Create the report only after all pre-report evidence is captured. It must include: binding/model/effort; the controller Task-3 acceptance-envelope ID/SHA, the exact nested Task-3 reviewed-handoff SHA echoed by both Sol reviewers, controller/logic/runtime attestations for that same SHA, and the separately verified `server/rules.js` identity; the exact pinned Task-1 brief/report and Task-2 brief/report digests from both pre-RED and post-GREEN checks; initial and final hash/line/byte counts for the four Task-4 source/test paths (but never a self-hash for this report); every named RED diagnostic tag plus field-level actual cause and each GREEN command/result; all environmental blockers labelled blockers; the explicit ownership ruling; each deletion/replay/inbound/sweep assertion (including exact versus absent/mismatch target candidates, target-removal evidence, and PENDING/RETRY_WAIT/RUNNING/QUARANTINED replay matrix); owning and caller-owned deletion/save/creation final-fence placement and generation-flip rollback proof; pre-report protected-hash/scope/index/cached-diff/text-hygiene evidence; and the unexecuted commit intent. For the R3 route, additionally include the full verified continuation envelope and hash, both immutable R2 evidence identities/tallies, the revalidated twenty-one accepted RED names with their direct diagnostic fields, the exact three superseded fixture names and launch-after-arrival defect, and the sealed `task4-r3-first.{tap,causes,result,sha256}` identities. If the first result was residual RED, include its immutable residual-seen marker, the preserved direct-cause payload, the narrow source change, and the distinct sealed `task4-r3-postfix-green.{tap,causes,result,sha256}` identities; never overwrite, relabel, or use the post-fix result to qualify for shadow. If the first result was immediate green, include an explicit statement that no final-plan chronological `24/0/24/0` run was possible, the authorized TDD deviation, each disposable shadow mutation anchor/replacement/hash/TAP/tag, successful injected-failure cleanup proof, Node copy verification/no-`.git` proof, and both complete live identity comparisons. The report must distinguish superseded fixture failure from valid RED and must never label R2's three fixture failures as behavioral RED:

```text
feat: synchronize revisioned world state with durable jobs
```

Do not write a final self-hash/line/byte identity for this report in its body: writing that value changes the report. End the report with `READY_FOR_REVIEW` only when the evidence above is complete. Then run the following post-report gate; it is the only final identity for the report and all Task-4-allowed files:

```bash
set -Eeuo pipefail
test -n "${task4_tmp:-}"
test -d "$task4_tmp"
task4_report=.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md
node "$task4_tmp/task4-manifest.cjs" after "$task4_tmp/scope.after.manifest" "$task4_tmp/allowed.after.manifest"
cmp -s "$task4_tmp/scope.before.manifest" "$task4_tmp/scope.after.manifest"
git status --porcelain=v1 -z >"$task4_tmp/status.after"
node "$task4_tmp/task4-status-delta.cjs" "$task4_tmp/status.before" "$task4_tmp/status.after"
git diff --cached --binary >"$task4_tmp/cached-diff.after.patch"
node - "$task4_tmp/index.after.manifest" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const index = path.resolve(root, '.git/index');
if (!index.startsWith(root + path.sep)) throw new Error('TASK4_INDEX_PATH_ESCAPES_ROOT');
const stat = fs.lstatSync(index);
if (!stat.isFile()) throw new Error('TASK4_INDEX_NOT_REGULAR_FILE');
fs.writeFileSync(process.argv[2], JSON.stringify({type: 'file', mode: stat.mode, uid: stat.uid,
  gid: stat.gid, size: stat.size, hash: crypto.createHash('sha256').update(fs.readFileSync(index)).digest('hex'),
  path: '.git/index'}) + '\n');
NODE
cmp -s "$task4_tmp/index.before.manifest" "$task4_tmp/index.after.manifest"
cmp -s "$task4_tmp/cached-diff.before.patch" "$task4_tmp/cached-diff.after.patch"
test ! -s "$task4_tmp/cached-diff.after.patch"
git diff --check -- server/db.js server/world.js server/scheduler/store.js tools/test-scheduler.js "$task4_report"
node - "$task4_tmp/task4-controller-handoff.txt" "$task4_tmp/allowed.after.manifest" <<'NODE'
const fs = require('node:fs');
const rows = fs.readFileSync(process.argv[3], 'utf8').trimEnd().split('\n').map(JSON.parse);
if (rows.length !== 5 || rows.some((row) => row.type !== 'file' || !/^[0-9a-f]{64}$/.test(row.hash))) {
  throw new Error('TASK4_HANDOFF_ALLOWED_IDENTITY_INVALID');
}
const payload = rows.map((row) => 'file ' + row.hash + ' ' + row.mode + ' ' + row.size + ' ' + row.uid + ':' + row.gid + ' ' + row.path.slice(2));
fs.writeFileSync(process.argv[2], 'TASK4_CONTROLLER_HANDOFF_BEGIN\n' + payload.join('\n') + '\nTASK4_CONTROLLER_HANDOFF_END\n');
NODE
cat "$task4_tmp/task4-controller-handoff.txt"
for task4_review_role in logic runtime; do
  task4_review_prompt="$task4_tmp/${task4_review_role}-review-prompt.txt"
  {
    echo "Task4 ${task4_review_role} review must verify and echo this exact controller handoff marker payload:"
    cat "$task4_tmp/task4-controller-handoff.txt"
  } >"$task4_review_prompt"
done
```

The controller must capture the exact printed marker before it dispatches reviews. The report's final handoff record must include the four allowed source/test paths and the regular-file report with their exact SHA-256, mode, size, uid, and gid. The post-report manifest reruns the same trailing-whitespace and 240-byte maximum-line gate over every allowed regular file, including untracked `store.js`, untracked `test-scheduler.js`, and the newly untracked report; `git diff --check` is supplementary only. A scope/status/index/cached-diff/whitespace/max-line failure after writing the report is a stop, not an editable report addendum.

Request fresh independent reviews in this order, with the exact printed marker payload included in each prompt:

1. Fresh independent `gpt-5.6-sol`, high effort, behavior/logic review of revision increments, `.get()`/`Number(row.revision)` handling, mutation/service gates, UoW atomicity, root/replay state transitions, barrier release, and inbound deletion evidence. The reviewer must verify and echo the marker identity payload verbatim before PASS.
2. A second fresh independent `gpt-5.6-sol`, high effort, scope/runtime review of allowed paths, protected hashes, actual index identity/cached diff, direct commands, static fences, exact RED cause bodies, untracked/report post-write scope, and temp hygiene. This distinct reviewer must verify and echo the same marker payload verbatim before PASS.

The controller records both approvals only when both fresh reviewers echo the same marker payload, then acknowledges capture by exporting `TASK4_CONTROLLER_HANDOFF_CAPTURED_SHA256` equal to `sha256sum "$task4_tmp/task4-controller-handoff.txt"`. Only then remove the exact temp directory and prove removal:

```bash
set -Eeuo pipefail
: "${TASK4_CONTROLLER_HANDOFF_CAPTURED_SHA256:?TASK4_CONTROLLER_HANDOFF_CAPTURE_REQUIRED}"
test "$TASK4_CONTROLLER_HANDOFF_CAPTURED_SHA256" = "$(sha256sum "$task4_tmp/task4-controller-handoff.txt" | cut -d' ' -f1)"
find "$task4_tmp" -type f -delete
find "$task4_tmp" -mindepth 1 -type d -empty -delete
rmdir "$task4_tmp"
test ! -e "$task4_tmp"
unset task4_tmp task4_review_role task4_review_prompt task4_report
```

The controller records both approvals before Task 5 or Task 9 consumes any Task-4 API. A review finding returns the work to the appropriate RED test; do not amend an approved plan, Task-2 artifact, or progress ledger.

## Spec Coverage Review

| Requirement | Plan coverage |
|---|---|
| `dq.state` canonical; projections rebuild in same UoW | Task 3, Step 2; Task 4, Steps 1–2 |
| revision increments exactly once and binds local wake | Task 2 RED save test; Task 3, Steps 1–2 |
| external jobs use stable refs, not player revision | Task 2 save test; Task 3, Step 2 |
| no raw cancellation/deletion of a global interaction | Global constraints; Task 3, Step 3 |
| deletion invalidates outbound roots with application/effective time | Task 2 deletion test; Task 3, Step 4 |
| deletion handles inbound target global/barrier | Task 2 inbound test; Task 3, Steps 3–4 |
| exact Task-2-valid external root is retained; mismatch is atomically invalidated | Task 4 synchronization test; Task 3, Step 2 |
| active replay PENDING/RETRY_WAIT/RUNNING/QUARANTINED child and RUNNING root are protected | Task 4 replay/root preservation test; Task 3, Step 3 |
| reconciliation/sweep exhaustively classifies local PENDING/RETRY_WAIT, root PENDING/RETRY_WAIT/QUARANTINED/RUNNING, and active replay PENDING/RETRY_WAIT/RUNNING/QUARANTINED | Task 4 sweep test; Task 3, Step 3 |
| invalidation application effective time, watermark, lease expiry, and blocked dependent release | Task 4 invalidation, lease, and dependent tests |
| stale normal wake is superseded while reducer-owned current RUNNING wake is retained | Task 4 current/stale wake test |
| post-cutover account creation has revision 0, one initial local wake, and a committed batch receipt | Task 4 scheduler-aware account-creation test; Task 3, Step 2 |
| final generation-fence rollback with no eligible post-delete Store mutation snapshots account, projection, scheduler metadata/lease, configuration, NPC, debris, battle, and SQLite sequence rows | Task 4 final lease-fence rollback test and `task4Rows` |
| Task-3 prerequisite and dual-review handoff | Global constraints; Task 1; Task 4, Step 4 |

## Plan Self-Review

- No placeholder implementation step remains: every production mutation, test behavior, command, expected result, and handoff role is named.
- The parent-plan Task-9 orphan-sweep deferral is explicitly overridden for Task-4 execution by the approved design and Task-2 deferral record; Task 9 is a consumer only.
- Global root/child terminology is consistent: only roots are invalidated; active replay PENDING/RETRY_WAIT/RUNNING/QUARANTINED children are protected; a root is released only through an application-proven terminal transition.
- Inbound deletion uses pre-delete canonical target keys, so a target's `ht` cascade cannot make a live global barrier undiscoverable.
- The static fence rejects the nonexistent `listAccountAdvance` surface and requires the scheduler world/batch interfaces actually exercised by the focused tests.
- Plan-authoring scope contains only this plan. `task-4-brief.md` was absent at preflight and remains absent; no approved material, Task-2 artifact, source, test, index, or progress ledger was changed by this planning task.
