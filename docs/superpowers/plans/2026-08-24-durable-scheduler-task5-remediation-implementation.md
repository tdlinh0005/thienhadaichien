# Durable Scheduler Task 5 Remediation Implementation Plan

> **For the Task 5 implementer:** Use `superpowers:test-driven-development` and execute this plan in order. Stop at the first failed gate. Do not improvise a new baseline, broaden the allowlist, or repair an accepted prerequisite in this task.

**Goal:** Add the durable scheduler's global barrier, deterministic fixed-point advance, every external reducer, and persisted HMAC combat snapshots while preserving the accepted Store, replay, revision, deletion, and Unit-of-Work authorities.

**Architecture:** `dq.state` is canonical; `ht`, `hamdang`, and `hamgiu` are repairable projections. `GameAdvanceService` is the durable-scheduler advance boundary, while accepted legacy `server/world.js`/`server/app.js` tick bridges remain unchanged until their routed factory-integration task. The service advances canonical participants in stable order with one shared budget and separate convergence and cycle signatures. `EventReducer` classifies and stages typed world effects only from an unforgeably Store-branded executable; it never owns checkpoint, block, application, durable-mark, or terminal lifecycle calls. The Task 6 writer owns the supported claimed-job lifecycle, while exported `resolveCanonicalGlobalInCurrentUow` is the one self-contained invalidation lifecycle used by the already-specified maintenance/deletion consumers. `SchedulerStore` remains the only application/terminal SQL owner and owns the only lease-fenced combat-key insertion. One pure combat-snapshot module owns the single big-endian HMAC implementation used by reducer construction and Store validation. Task 4's synchronous outer transaction and finalizers atomically commit state, projections, applications, results, successors, and completion.

**Tech stack:** Node.js `>=22.5`, CommonJS, `node:sqlite`, `node:crypto`, Node's built-in test runner, file-backed temporary SQLite fixtures, and the accepted synchronous `BEGIN IMMEDIATE` Unit-of-Work. Add no dependency.

**Authorities:**

- Design: `docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md`.
- Parent Task 5 section: `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:7572` through line 10865.
- Routing: `.superpowers/sdd/model-routing.md`, SHA-256 `09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f`, 102 lines, 5732 bytes.
- Accepted Task 3 envelope ID `task3-accepted-35334d372202-20260824`, SHA-256 `08a5cbc3942e8a1dcd9b97260a24861214f8535faeaf480123472e1272dcafcc`, nested reviewed-handoff SHA-256 `35334d3722023665b11eab5c9bf32ee51d7b514e559fcc663198a75e887d3786`.
- Accepted Task 4 envelope ID `task4-accepted-0710718826d3-20260824`, SHA-256 `d915c2b6720d877c72f005b964a71e9ec0575b9aad2ef718afe53a70462b24f6`, nested reviewed-handoff SHA-256 `0710718826d3e6bb6441c19d69982b266d18eb386bee21f432afdd6e09d5e894`.

The non-dispatch protected baseline is also exact:

- Design: `1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf`.
- Parent plan: `cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3`.
- Progress: `e6e2b92aaeb58c870ffbf0b85979d547470d104e04832600f7f8ceb91638317e`.
- Task 1 brief/report: `2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a` / `6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38`.
- Task 2 brief/report: `a09e794304213d0f178e65b50957cc351be93580624caca3c38ca8dd172e1622` / `8823be0784319862af394d007fad4574830108c11910691b7f47ad540bb1edf2`.
- Migrations: `1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76`.
- Contract: `3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1`.
- Package: `7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f`.
- Legacy server app/factory bridge: `server/app.js`, SHA-256 `b99ff52dcf6e43d02f92acb1359c0f8490475978ace332cc55f5f277537900d2`, 656 lines, 21055 bytes.
- Task 3 plan: `ebfaf4489bf37296755908e1d380870c0c9d70ea5d0f1b3a60210ee5ec772e9f`, 5131 lines, 249060 bytes.
- Task 4 plan: `dc0af317bda6d5b5b2e4c4f81ba293597e7dad766e6e8a04c5893b4eebc5bac2`, 2863 lines, 204422 bytes.

The Task 5 plan identity is supplied only by its immutable dispatch because embedding a self-hash would be circular.

### Controller-authorized plan-identity transition

This dispatch is the sole continuation authority for preserved evidence captured under the immediately prior approved Task 5 plan, SHA-256 `4b46b79fc60d9bd154e76403a1164404177b32d6aef2c3415c458e3f5569ca7c`, 843 lines, 108633 bytes. The active replacement identity remains supplied only by the new immutable controller dispatch and is verified from its exact `TASK5_DISPATCH_HANDOFF_ID`, `TASK5_DISPATCH_PLAN_SHA256`, `TASK5_DISPATCH_PLAN_LINES`, and `TASK5_DISPATCH_PLAN_BYTES`; none is embedded in this self-referential plan.

The transition is evidence-preserving, not a rebaseline. Existing raw `scope.before`, `authority.before`, `allowed.before`, `status.before`, `index.before`, `cached.before`, and `temp.before` artifacts remain immutable. Fresh raw after captures also remain immutable. A sealed transition helper may create only disposable projected-after JSONL files under `$task5_tmp`: it authenticates the exact prior plan row and exact active dispatched live plan, proves that the raw before/after plan rows differ only in `sha256` and `size`, substitutes the prior `sha256`/`size` into an in-memory clone of the raw after plan row, and writes that clone while copying every other raw after line byte-for-byte. Existing exact comparators then consume the projection. No raw artifact is edited, replaced, renamed, deleted, or treated as a new baseline.

This exception is exact to `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md`. It does not add that path, `.agents`, or `.codex` to the seven implementation paths; authorize a second authority change; normalize any other field; or excuse implementation drift. A continuation whose preserved scope and authority plan rows do not both carry the exact prior SHA/size above must stop for a new controller decision. A newly captured active-plan row is not a substitute for either preserved before artifact.

## Non-negotiable scope and routing

The implementation may change exactly these paths:

- Create `server/scheduler/combat-snapshot.js`.
- Create `server/scheduler/advance-service.js`.
- Create `server/scheduler/reducers.js`.
- Modify `server/scheduler/store.js`.
- Modify `server/world.js`.
- Modify `tools/test-scheduler.js`.
- Create `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-5-report.md` only after all pre-report gates pass.

Everything else is protected, including `.git/index`, package metadata, migrations, contract, accepted reports, Task 3 sources/artifacts, plans/specifications, routing, progress records, and foreign temporary files. Do not stage or commit. The commit command at the end is intent only.

Binding roles are exact:

- Plan author and source implementer: fresh `gpt-5.6-sol`, effort `max`.
- Behavior/logic reviewer: fresh independent `gpt-5.6-sol`, effort `xhigh`.
- Scope/runtime/protocol reviewer: a second fresh independent `gpt-5.6-sol`, effort `high`.

Only the roles above apply; there is no fallback reviewer mapping. A Sol implementer does not review its own work. If any mapped model or effort is unavailable, stop for a controller-authorized routing change.

No Task 5 brief exists or is required. Human-readable report status text is not an acceptance authority. Only the controller envelopes below authorize implementation.

## Frozen Task 5 interfaces

These signatures are one coherent ABI. Do not create alternate helpers, duplicate snippets, a generic `resolveExternalAt`, or a second `seed32`.

```js
// server/scheduler/combat-snapshot.js
seed32(keyHex, matchId, arrivalAtS, schemaVersion)
buildCombatSnapshotV1(input)
validateCombatSnapshotV1(snapshot, context)

// server/scheduler/store.js
SchedulerStore.prototype.getOrCreateCombatSeedKey(token, nowMs)
SchedulerStore.prototype.insertApplication(
  token, executableJob, application, nowMs, canonicalTContext
)
SchedulerStore.prototype.hasCommittedApplication(token, executableJob, nowMs)
SchedulerStore.prototype.assertCanonicalExecutable(token, executableJob, nowMs)

// server/scheduler/advance-service.js
new GameAdvanceService({kho, world, store, clock})
GameAdvanceService.prototype.advanceTo(mutation, accountId, targetS, saveOptions)
GameAdvanceService.prototype.advanceLocalOnlyTo(
  mutation, accountId, targetS, targetAccountForKey, runOptions
)
GameAdvanceService.prototype.advanceBarrier(mutation, executableJob)
GameAdvanceService.prototype.preflightCutover(
  leaseToken, cutoverAtS, remainingBudget, effectiveNowMs
)
toPublicAdvanceResult(outcome)

// server/scheduler/reducers.js
new EventReducer({kho, world, store, clock, advanceService})
EventReducer.prototype.initializeCombatSeed(leaseToken, effectiveNowMs)
EventReducer.prototype.prepare(mutation, executableJob, options)
EventReducer.prototype.applyPrepared(mutation, prepared)
EventReducer.prototype.prepareCanonicalInvalidation(
  mutation, executableJob, reason, detail
)
EventReducer.prototype.prepareRecoveredLatestState(mutation, executableJob, cutoverAtS)
EventReducer.prototype.seedForJob(executableJob)
resolveCanonicalGlobalInCurrentUow(context, jobId, reason, options)

// server/world.js
TheGioi.prototype.resolvePvpAt(ref, effectiveAtS, seed, snapshot, canonicalTarget)
TheGioi.prototype.resolveTransportAt(ref, effectiveAtS, canonicalTarget)
TheGioi.prototype.resolveSpyAt(ref, effectiveAtS, canonicalTarget)
TheGioi.prototype.resolveHoldAt(ref, effectiveAtS, canonicalTarget)
TheGioi.prototype.resolveMissileAt(ref, effectiveAtS, canonicalTarget)
```

`insertApplication` remains Store-owned. Callers supply a validated executable job and values, never SQL or a caller-created application row. Its accepted five-argument ABI, Store reload through `loadExecutableJob`, conditional lease/generation/lock predicates, canonical hashing, replay linkage, and result-code allowlist remain intact. Task 5 only replaces the opaque PvP snapshot check with v1 semantic validation.

`assertCanonicalExecutable` is the only execution-capability verifier. Store owns a module-private `WeakMap<Store,WeakSet<object>>`; the constructor installs a fresh set, and only the final successful return path of accepted `loadExecutableJob` freezes and adds that exact object. No Symbol/property/shape/constructor check is a capability. The verifier first requires membership in the calling Store instance, then reloads through `loadExecutableJob` and returns that fresh branded canonical object. A frozen structural clone, JSON round trip, audit-loaded object, different-Store object, stale generation object, or pre-restart object fails `PAYLOAD_INTEGRITY`; a genuine load and a fresh load after reopening pass. Advance and reducer entry points replace their input with the verifier's return before reading payload or state.

`toPublicAdvanceResult` returns exactly `{processed,advancedToS,nextDueAtS,hasMoreDue,budgetExhausted}`. All five keys are mandatory, with safe nonnegative integer seconds/counts, `nextDueAtS` either a safe nonnegative integer or `null`, and strict booleans. Input may additionally carry only the frozen internal `AdvanceOutcome` keys `blockedExternal`, `saveReceipt`, `checkpointJobId`, `deferredExternal`, and `blockedExternalJobId`; these never escape. Coercible/missing/unknown extra fields reject `ADVANCE_RESULT_INVALID`.

`reducers.js` exports exactly `{EventReducer,seed32,resolveCanonicalGlobalInCurrentUow}`. Its `seed32` is the strict same function identity imported from `combat-snapshot.js`, not a wrapper or second implementation. The helper's frozen four-argument ABI is:

```js
resolveCanonicalGlobalInCurrentUow(
  {store, reducer, mutation, leaseToken, nowMs, lockMs},
  jobId,
  reason,
  {rootMustBeQuarantined, detail, afterApplicationForTest}
)
```

`lockMs` defaults to `15000` and otherwise is a positive safe millisecond integer; the options object may be omitted. Required context identity is `mutation.leaseToken === leaseToken`, safe nonnegative `nowMs`, established shared budget, Store, and reducer, all inside one accepted immediate UoW and active matching world mutation. Accepted reasons are exactly `MATCH_INVALIDATED`, `ENTITY_REMOVED`, and `OPERATOR_CONFIRMED_INVALID`. Options accept only `rootMustBeQuarantined`, `detail`, and `afterApplicationForTest`: the flag is strict boolean when present, detail is object/null and passed only to `prepareCanonicalInvalidation`, and the hook is a function when present and is the sole test hook. Unknown/coercible context, reason, or option values reject before application/effect. The return is exactly `{logicalRootId,resolvedJobId,neutralization}`. Task 4 deletion and downstream Task 6/operator imports must continue to destructure this exact export without an adapter.

`getOrCreateCombatSeedKey` is also Store-owned. Reducer initialization delegates to it; reducer/world code must not execute `INSERT INTO cauhinh`. The method accepts no candidate key or caller object. It requires an already-open outer UoW, generates 32 random bytes internally, performs one conditional `INSERT ... SELECT ... WHERE EXISTS(live owner/generation/expiry) ON CONFLICT(k) DO NOTHING`, uses the accepted mutation-fence helper, reads the winning row, validates exactly 64 lower-case hexadecimal characters, then performs a post-write `assertLiveLease` before return. It never opens or commits a transaction. Losing the generation after the statement but before return throws `LEASE_LOST`, making the outer UoW roll back the new key.

Task 6's writer startup will call `EventReducer.initializeCombatSeed` only after acquiring the durable writer lease and before recovery/readiness. Task 5 supplies and tests that seam but does not edit the future writer. Standby and legacy-mode paths never call it.

The only production HMAC call is in `combat-snapshot.js`. It computes `HMAC-SHA-256(Buffer.from(keyHex, 'hex'), matchId + '|' + arrivalAtS + '|' + schemaVersion)` and returns `digest.readUInt32BE(0)`. Here `schemaVersion` is the immutable combat-snapshot version `1`, not the transport payload version; accepted payload v0 is validated/upgraded before a v1 snapshot is built. The known vector is key `00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff`, message `match-42|1700000000|1`, result `0x09367fa0`.

## Task 1: Fail-closed controller, acceptance, baseline, and hygiene gates

**Files:** Read only. Create evidence only under one private `mktemp -d` directory.

- [ ] **Step 1: Prove the immutable Task 5 plan dispatch before inspecting a test**

Run from the repository root:

```bash
set -Eeuo pipefail
task5_plan=docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
: "${TASK5_DISPATCH_HANDOFF_ID:?TASK5_DISPATCH_HANDOFF_ID_REQUIRED}"
: "${TASK5_DISPATCH_PLAN_SHA256:?TASK5_DISPATCH_PLAN_SHA256_REQUIRED}"
: "${TASK5_DISPATCH_PLAN_LINES:?TASK5_DISPATCH_PLAN_LINES_REQUIRED}"
: "${TASK5_DISPATCH_PLAN_BYTES:?TASK5_DISPATCH_PLAN_BYTES_REQUIRED}"
test "$(sha256sum "$task5_plan" | cut -d' ' -f1)" = "$TASK5_DISPATCH_PLAN_SHA256"
test "$(wc -l <"$task5_plan" | tr -d ' ')" = "$TASK5_DISPATCH_PLAN_LINES"
test "$(wc -c <"$task5_plan" | tr -d ' ')" = "$TASK5_DISPATCH_PLAN_BYTES"
printf 'TASK5_DISPATCH %s %s %s %s\n' \
  "$TASK5_DISPATCH_HANDOFF_ID" "$TASK5_DISPATCH_PLAN_SHA256" \
  "$TASK5_DISPATCH_PLAN_LINES" "$TASK5_DISPATCH_PLAN_BYTES"
```

Capture this output. Any mismatch is `TASK5_PLAN_IDENTITY_DRIFT`: stop before RED. Never change this plan or environment values to make the gate pass.

For the controller-authorized continuation, also capture the exact four-field dispatch output and the live plan's `lstat`/SHA/line/byte row as immutable transition evidence. Require the active SHA to differ from the fixed prior SHA above. Do not overwrite a prior dispatch capture: the old and new controller dispatch records are separate evidence. Record the controller bytes now; after Step 3 validates and reuses the exact private `$task5_tmp`, preserve its existing `dispatch-continuation-r4.txt` byte-identically as the b197/S01 record and exclusively capture this plan's new dispatch line at never-used `$task5_tmp/dispatch-continuation-r5.txt`. Require exactly one canonical `TASK5_DISPATCH <handoff-id> <sha256> <lines> <bytes>\n` line byte-equal to the controller output, and seal its regular nonsymlink `nlink===1` identity before creating round-3 helpers. The active values come only from the immutable controller dispatch, never this plan text or an existing helper. The later transition helper must read the same environment variables and reverify the live plan on every invocation; CLI-supplied identity values are forbidden.

- [ ] **Step 2: Decode both accepted controller envelopes and their nested handoffs**

Require all six controller variables:

```bash
set -Eeuo pipefail
: "${TASK3_ACCEPTANCE_ENVELOPE_ID:?TASK3_ACCEPTANCE_ENVELOPE_ID_REQUIRED}"
: "${TASK3_ACCEPTANCE_ENVELOPE_SHA256:?TASK3_ACCEPTANCE_ENVELOPE_SHA256_REQUIRED}"
: "${TASK3_ACCEPTANCE_ENVELOPE_B64:?TASK3_ACCEPTANCE_ENVELOPE_B64_REQUIRED}"
: "${TASK4_ACCEPTANCE_ENVELOPE_ID:?TASK4_ACCEPTANCE_ENVELOPE_ID_REQUIRED}"
: "${TASK4_ACCEPTANCE_ENVELOPE_SHA256:?TASK4_ACCEPTANCE_ENVELOPE_SHA256_REQUIRED}"
: "${TASK4_ACCEPTANCE_ENVELOPE_B64:?TASK4_ACCEPTANCE_ENVELOPE_B64_REQUIRED}"
task5_tmp=$(mktemp -d /tmp/task5-runtime.XXXXXXXX)
export task5_tmp
node <<'NODE'
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const expected = {
  task3: {
    id: 'task3-accepted-35334d372202-20260824',
    envelopeHash: '08a5cbc3942e8a1dcd9b97260a24861214f8535faeaf480123472e1272dcafcc',
    handoffHash: '35334d3722023665b11eab5c9bf32ee51d7b514e559fcc663198a75e887d3786',
    outerBegin: 'TASK3_ACCEPTANCE_ENVELOPE_BEGIN',
    outerEnd: 'TASK3_ACCEPTANCE_ENVELOPE_END',
    innerBegin: 'TASK3_CONTROLLER_HANDOFF_BEGIN',
    innerEnd: 'TASK3_CONTROLLER_HANDOFF_END'
  },
  task4: {
    id: 'task4-accepted-0710718826d3-20260824',
    envelopeHash: 'd915c2b6720d877c72f005b964a71e9ec0575b9aad2ef718afe53a70462b24f6',
    handoffHash: '0710718826d3e6bb6441c19d69982b266d18eb386bee21f432afdd6e09d5e894',
    outerBegin: 'TASK4_ACCEPTANCE_ENVELOPE_BEGIN',
    outerEnd: 'TASK4_ACCEPTANCE_ENVELOPE_END',
    innerBegin: 'TASK4_CONTROLLER_HANDOFF_BEGIN',
    innerEnd: 'TASK4_CONTROLLER_HANDOFF_END'
  }
};
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function decodeStrict(name) {
  const encoded = process.env[name];
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error(name + '_BASE64_INVALID');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error(name + '_BASE64_NONCANONICAL');
  return bytes.toString('utf8');
}
function one(lines, prefix) {
  const found = lines.filter(line => line.startsWith(prefix));
  if (found.length !== 1) throw new Error('ACCEPTANCE_FIELD_INVALID:' + prefix);
  return found[0].slice(prefix.length);
}
function parseEnvelope(task) {
  const upper = task.toUpperCase();
  const cfg = expected[task];
  const id = process.env[upper + '_ACCEPTANCE_ENVELOPE_ID'];
  const declaredHash = process.env[upper + '_ACCEPTANCE_ENVELOPE_SHA256'];
  if (id !== cfg.id || declaredHash !== cfg.envelopeHash) {
    throw new Error(upper + '_ACCEPTANCE_BINDING_DRIFT');
  }
  const envelope = decodeStrict(upper + '_ACCEPTANCE_ENVELOPE_B64');
  if (digest(envelope) !== cfg.envelopeHash || /\r/.test(envelope)) {
    throw new Error(upper + '_ACCEPTANCE_ENVELOPE_HASH_DRIFT');
  }
  const lines = envelope.trimEnd().split('\n');
  if (lines[0] !== cfg.outerBegin || lines.at(-1) !== cfg.outerEnd ||
      one(lines, 'acceptance-id ') !== cfg.id ||
      one(lines, 'reviewed-handoff-sha256 ') !== cfg.handoffHash) {
    throw new Error(upper + '_ACCEPTANCE_ENVELOPE_SHAPE_INVALID');
  }
  const reviewedB64 = one(lines, 'reviewed-handoff-base64 ');
  const attestations = [one(lines, 'controller-attestation '),
    one(lines, 'logic-reviewer-attestation '), one(lines, 'runtime-reviewer-attestation ')];
  if (attestations[0] !== 'ACCEPTED ' + cfg.handoffHash ||
      attestations[1] !== 'gpt-5.6-sol high APPROVED ' + cfg.handoffHash ||
      attestations[2] !== 'gpt-5.6-sol high APPROVED ' + cfg.handoffHash) {
    throw new Error(upper + '_ACCEPTANCE_ATTESTATION_INVALID');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(reviewedB64) || reviewedB64.length % 4 !== 0) {
    throw new Error(upper + '_REVIEWED_HANDOFF_BASE64_INVALID');
  }
  const handoffBytes = Buffer.from(reviewedB64, 'base64');
  if (handoffBytes.toString('base64') !== reviewedB64 || digest(handoffBytes) !== cfg.handoffHash) {
    throw new Error(upper + '_REVIEWED_HANDOFF_HASH_DRIFT');
  }
  const handoff = handoffBytes.toString('utf8');
  const inner = handoff.trimEnd().split('\n');
  if (/\r/.test(handoff) || inner[0] !== cfg.innerBegin || inner.at(-1) !== cfg.innerEnd) {
    throw new Error(upper + '_REVIEWED_HANDOFF_SHAPE_INVALID');
  }
  fs.writeFileSync(path.join(process.env.task5_tmp, task + '-acceptance.txt'), envelope);
  fs.writeFileSync(path.join(process.env.task5_tmp, task + '-handoff.txt'), handoff);
  return inner.slice(1, -1);
}
function parseRows(lines, label) {
  return lines.filter(line => line.startsWith('file ')).map(line => {
    const match = /^file ([0-9a-f]{64}) ([0-9]+) ([0-9]+) ([0-9]+):([0-9]+) (.+)$/.exec(line);
    if (!match) throw new Error(label + '_ROW_INVALID:' + line);
    const row = {hash: match[1], mode: Number(match[2]), size: Number(match[3]),
      uid: Number(match[4]), gid: Number(match[5]), path: match[6]};
    if (path.isAbsolute(row.path) || row.path.includes('\0') || row.path.split('/').includes('..')) {
      throw new Error(label + '_PATH_INVALID:' + row.path);
    }
    return row;
  });
}
function live(row, lines) {
  const absolute = path.resolve(root, row.path);
  if (!absolute.startsWith(root + path.sep)) throw new Error('LIVE_PATH_ESCAPE:' + row.path);
  const stat = fs.lstatSync(absolute);
  const data = fs.readFileSync(absolute);
  const actualLines = data.length === 0 ? 0 : data.toString('utf8').split('\n').length -
    (data.at(-1) === 10 ? 1 : 0);
  if (!stat.isFile() || stat.mode !== row.mode || stat.size !== row.size ||
      stat.uid !== row.uid || stat.gid !== row.gid || digest(data) !== row.hash ||
      (lines !== undefined && actualLines !== lines)) {
    throw new Error('LIVE_IDENTITY_DRIFT:' + row.path);
  }
}
const task3Lines = parseEnvelope('task3');
const task4Lines = parseEnvelope('task4');
const task3Rows = parseRows(task3Lines, 'TASK3_HANDOFF');
const task4Rows = parseRows(task4Lines, 'TASK4_HANDOFF');
const task3Expected = new Map([
  ['tools/test-scheduler.js', ['06d563196617b771d34f8112597fc6139f5765781cc3cc22ddbae2864e9b1a4c', 289814, 6694]],
  ['js/fleet.js', ['4e4b67984e935a42545236be51eb5becc1959df061f8d02ace145dc883478137', 76997, 1707]],
  ['js/actions.js', ['2ddfffe5f9b46bbf44dfd35903daddd2fc57f924a8dc5bea878bd75eddd1c3d7', 9085, 204]],
  ['js/app.js', ['200fd096a52a225db544039df64938a5b44bce3da323f4d4f535ca5e083fb2a7', 14334, 333]],
  ['js/main.js', ['db284a1d10df0fa4e6d56353b98265329c0360a323378a225c9488170d460433', 11124, 263]],
  ['web/js/mp.js', ['fbed4e0f6f9cf90ff64f90dc09216d7b9b6dfdf19f4073ba9a521fcef3d89d94', 34408, 674]],
  ['server/scheduler/events.js', ['6bca684dc66ae9e5b639b2f420420e65a4544ad9751f2b41db904f852f170ee1', 9562, 269]],
  ['dist/thien-ha-dai-chien.html', ['80c9a917a29acba7f52b1984dcef55321be92b9330b51f5a71bde1b644fd52e0', 323932, 6408]],
  ['dist/artifact.html', ['d9e4b031f94dcc6016398d92563af6ce4561099354ab5f4fe07a963ebf81263f', 323101, 6398]],
  ['.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md',
    ['56228ff608a1e073b3dbb38d32da1a217327db6d042d9c5afaf4cfa73b28e5ef', 17410, 220]]
]);
const task4Expected = new Map([
  ['.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-4-report.md',
    ['cea2625acae6aab9e112c817a3e4f0495f68a26f9da577bc5cd38f9c6a80d7b9', 50222, 800]],
  ['server/db.js', ['5e1030ede9258a8451d3215e6f615ce0896eced57e239753e9ebe8a2b9d7cd5b', 21455, 441]],
  ['server/scheduler/store.js', ['e13962cc9443c10b8f6f3d5cd59a49e06f3dd8e243f66212a3e6fe6ab2c244fa', 89885, 1792]],
  ['server/world.js', ['a85b53e7843a148e55ebe3840778cd5b431fd60e8c2b34f9690013f95177f3e1', 79895, 1738]],
  ['tools/test-scheduler.js', ['5372a7f7fe526a94e5740ddaeb9f21b9846aa189ba21b4e8c0d9d18508a282c1', 378737, 8232]]
]);
function exactRows(rows, wanted, label) {
  if (rows.length !== wanted.size) throw new Error(label + '_ROW_COUNT');
  const seen = new Set();
  for (const row of rows) {
    const expectedRow = wanted.get(row.path);
    if (!expectedRow || seen.has(row.path) || row.hash !== expectedRow[0] ||
        row.mode !== 33188 || row.size !== expectedRow[1] || row.uid !== 0 || row.gid !== 983) {
      throw new Error(label + '_ROW_DRIFT:' + row.path);
    }
    seen.add(row.path);
  }
}
exactRows(task3Rows, task3Expected, 'TASK3_HANDOFF');
exactRows(task4Rows, task4Expected, 'TASK4_HANDOFF');
for (const row of task3Rows) {
  if (row.path !== 'tools/test-scheduler.js') live(row, task3Expected.get(row.path)[2]);
}
for (const row of task4Rows) live(row, task4Expected.get(row.path)[2]);
const rules = {path: 'server/rules.js', hash: 'd47d6ec8970b76a75c13975da30eaf85dc32c1b1eee7b45d20a4a47889fd3882',
  mode: 33188, size: 153, uid: 0, gid: 983};
live(rules);
console.log('TASK3_TASK4_ACCEPTANCE_AND_LIVE_ROWS_OK');
NODE
```

This validates the historical Task 3 test row inside its signed payload but does not demand that old row be live: accepted Task 4 is the sole legitimate superseder of that shared path. All other Task 3 rows and all five Task 4 handoff rows must be live. Any other discrepancy is a stop, not Task 5 repair authority.

Before continuing, record exact balanced-function-body hashes for the accepted Task 4 prerequisites and require the same hashes after every Store/world edit. Protected Store bodies are `leaseTokenIsLive`, `assertLiveLease`, `requiredMutation`, `optionalMutation`, `mutationConflict`, `assertReplayLineage`, `decorateLogicalGlobal`, `validInvalidation`, `classifyTerminalResult`, `claimGlobalForInvalidation`, `loadImmutableJobForAudit`, `markDurableMutation`, `checkpointPartial`, `completeAccountAdvanceAndScheduleSuccessor`, `completeApplied`, `finishResolved`, `listLogicalBarrierJobsAtOrBefore`, `listUnresolvedGlobalEntriesAtOrBefore`, `parkGlobalBehindPreceding`, `blockOwnedAccountAdvance`, `releaseBlockedAccountDependents`, `prepareDeletedAccountJobResolution`, `invalidateGlobalJob`, and `sweepDeletedAccountOrphans`. Protected world bodies are `schedulerMutationError`, `ketThuc`, `trongMutationScheduler`, `_assertSchedulerFinalFence`, `luu`, `_dongBoSchedulerLuu`, `_dongBoSchedulerCreations`, `taoDeQuoc`, and `xoaTaiKhoan`. Use a lexical balanced-brace extractor that handles both declarations and prototype assignments, not `sed` line ranges.

`loadExecutableJob` has one narrowly authorized Task 5 delta, so a whole-body equality check would be wrong. Seal its accepted body separately. The post-edit lexical gate must prove the only token changes are: one module-private Store-to-WeakSet registry; one constructor initialization; replacement of the accepted final `return Object.freeze(loaded)` with freeze-to-local, membership registration, and return of the same object; and the new three-argument `assertCanonicalExecutable` verifier described above. Strip those exact additions from the post-edit token stream and require byte equality with the accepted body. Preserve every Task 2/4 parse, payload hash, RUNNING, lock, generation, expiry, blocked-account, replay-lineage, logical-root, and freeze check. `loadImmutableJobForAudit` and `loadReplayableJob` never brand. Reject any writable brand field, exported registry, caller-provided marker, alternate load path, or weakening of accepted validation.

The ABI probe must also require the current arities: Store `claimGlobalForInvalidation/5`, `loadExecutableJob/3`, `loadImmutableJobForAudit/1`, `insertApplication/5`, `markDurableMutation/2`, `checkpointPartial/4`, `completeAccountAdvanceAndScheduleSuccessor/4`, `completeApplied/3`, `finishResolved/5`, `listLogicalBarrierJobsAtOrBefore/3`, `listUnresolvedGlobalEntriesAtOrBefore/3`, `parkGlobalBehindPreceding/5`, `blockOwnedAccountAdvance/5`, `releaseBlockedAccountDependents/3`, `prepareDeletedAccountJobResolution/4`, `invalidateGlobalJob/6`, and `sweepDeletedAccountOrphans/2`; world `trongMutationScheduler/2` and `_assertSchedulerFinalFence/1`. The remaining world methods intentionally report arity zero and are protected by body hash instead. After the Group A shell, additionally require Store `assertCanonicalExecutable/3` without changing any accepted arity. After the Group C shell require `EventReducer.prepareCanonicalInvalidation/4` and exported `resolveCanonicalGlobalInCurrentUow/4`.

These bodies retain Task 4's exact authority: logical replay children execute under their immutable root tuple; active PENDING/RETRY_WAIT/RUNNING/QUARANTINED replay state and current RUNNING roots are not orphan-deleted; deletion/invalidation is application-backed, lease-fenced, and uses only Task 2 result/status mappings; future RETRY_WAIT deletion and every sweep candidate get final lease fences; blocked `ACCOUNT_ADVANCE` rows release only after a proved terminal application. Task 5 consumes these rules and must not rewrite them.

Probe Task 3 at the same boundary. `server/scheduler/events.js` must export exactly `stableFleetRef/2`, `stableMissileRef/2`, `sameExternalRef/2`, `derivePvpMatchId/2`, `externalKey/1`, `jobFromRef/2`, `deriveExternalJobs/3`, and `canonicalExternalStatus/2`, with no extra export. The frozen argument orders are `jobFromRef(ref,targetAccountForKey)`, `deriveExternalJobs(accountId,state,targetAccountForKey)`, and `canonicalExternalStatus(kho,ref)`. Require `G.tick/3`, `G.tickNoiBo/3`, `G.phanLoaiSuKienKe/3`, `G.phanLoaiSuKienNoiBoKe/4`, `G.phanLoaiTatCaSuKienNgoai/3`, `G.tickOutcomeNeedsDeferral/1`, `G.laTickPartial/1`, and the frozen local `G.TICK_PARTIAL` sentinel. Task 5 consumes real TickOutcome objects; a local sentinel or multiplayer transport code is never an AdvanceResult.

- [ ] **Step 3: Prove the accepted functional baseline and immutable test prefix**

Run the accepted suite before editing:

```bash
set -Eeuo pipefail
node --test-reporter=tap tools/test-scheduler.js >"$task5_tmp/baseline.tap" 2>&1
node - "$task5_tmp/baseline.tap" <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8');
for (const [key, expected] of Object.entries({tests: 106, pass: 105, fail: 0, skipped: 1})) {
  const match = new RegExp('^# ' + key + ' ([0-9]+)$', 'm').exec(text);
  if (!match || Number(match[1]) !== expected) throw new Error('TASK4_BASELINE_' + key.toUpperCase());
}
if (/^not ok /m.test(text)) throw new Error('TASK4_BASELINE_FAILURE');
NODE
node - <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const data = fs.readFileSync('tools/test-scheduler.js');
if (data.length !== 378737 || crypto.createHash('sha256').update(data).digest('hex') !==
    '5372a7f7fe526a94e5740ddaeb9f21b9846aa189ba21b4e8c0d9d18508a282c1') {
  throw new Error('TASK4_TEST_PREFIX_BASELINE_DRIFT');
}
const lines = data.toString('utf8').split('\n');
if (lines.length - (data.at(-1) === 10 ? 1 : 0) !== 8232) throw new Error('TASK4_TEST_LINES_DRIFT');
NODE
head -n 8232 tools/test-scheduler.js >"$task5_tmp/task4-test-prefix.js"
test "$(wc -c <"$task5_tmp/task4-test-prefix.js" | tr -d ' ')" = 378737
test "$(sha256sum "$task5_tmp/task4-test-prefix.js" | cut -d' ' -f1)" = \
  5372a7f7fe526a94e5740ddaeb9f21b9846aa189ba21b4e8c0d9d18508a282c1
```

The immutable prefix is the first 8232 lines and 378737 bytes. After each Task 5 test append, hash those exact prefix bytes again; do not use a moving line number or reconstruct the prefix from Git.

- [ ] **Step 4: Capture closed-world, status, physical-index, cached-diff, authority, and temporary baselines**

Create `$task5_tmp/task5-manifest.cjs` as a temporary evidence helper. It must use `fs.lstatSync`, never follow symlinks, sort paths by UTF-8 byte order, and emit one JSON line per entry with `path`, `type`, decimal `mode`, `uid`, `gid`, `dev`, `ino`, `nlink`, and `size`; regular files also carry SHA-256 and symlinks carry their exact target. It must preserve whitespace in names by JSON encoding. Unknown types, unreadable entries, duplicate normalized paths, path escape, a NUL, or an allowed regular file with `nlink !== 1` is a hard failure.

Keep every raw manifest byte-for-byte, including `dev`; never rewrite or normalize `scope.before`, `authority.before`, or any later raw capture. On continuation entry, before creating another artifact, recursively enumerate every pre-existing regular file under the exact non-symlink `$task5_tmp`, including all seven named before artifacts, every sealed RED/GREEN TAP/source-suffix artifact, and every historical failed after/comparator transcript. Reject symlinks, hard-linked regular files, unknown nondirectory types, path escape, duplicates, and unreadable entries; directories are traversal containers and are not identity rows because later exclusive evidence files may legitimately change directory metadata. Write canonical path-sorted `path/mode/uid/gid/dev/ino/nlink/size/sha256` rows once to `$task5_tmp/preserved-evidence.lock` with exclusive creation, then hash the lock and capture that hash in the immutable continuation transcript. On retry an existing lock is accepted only when that captured hash and every listed pre-existing regular file still match; new artifacts named by this revised plan are checked separately and do not alter the lock. Require the lock and listed identities before every transition, report, review, and cleanup gate. A missing/changed preserved file, a regenerated before, or an active-plan row substituted into either preserved before manifest is `TASK5_PRESERVED_EVIDENCE_DRIFT`.

The round-2 recovery must not recreate, append to, or otherwise rewrite that lock. Require its controller-recorded full SHA-256 (whose displayed prefix is `a3d3`) and exactly 89 canonical rows; a prefix match, a newly calculated but unrecorded digest, or any other row count fails. Before authorizing a new runner, reverify every original row and the already sealed post-lock artifacts: the missing-helper RED source/fixtures/transcript/status, transition and comparator sources, and the failed CJS GREEN attempt's source plus its only two result artifacts. Historical failure evidence is exactly `task5-transition-selftest-green.out`, 3461 bytes, SHA-256 `7048473cbf2100272d4a950e25ba2c22cbdc0ab924dd1613562121f5f7a4c137`, containing the combined uncaught Node stack, and `task5-transition-selftest-green.status`, exact bytes `1\n`, SHA-256 `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865`. Exact `task5-transition-selftest-green.err` must remain `ENOENT`; do not create or infer separate historical stdout/stderr. Parse the preserved bytes as the first attempted `child_process.spawnSync` using executable `/root/.nvm/versions/node/v24.19.0/bin/node` and exact ordered `spawnargs` `['/tmp/task5-runtime.eO2ILbtw/task5-scope-compare.cjs','/tmp/task5-runtime.eO2ILbtw/transition-selftest-work.U9UtsW/positive-managed.compare-before.jsonl','/tmp/task5-runtime.eO2ILbtw/transition-selftest-work.U9UtsW/positive-managed.compare-after.jsonl']`, denied with `EPERM`; require that exact scope-comparator argv in both stack renderings and no GREEN marker. A transition-helper first invocation, different fixture path/order, helper semantic failure, later-case failure, successful spawn, altered byte, or retroactively split stream is not this environmental exception. This exact historical combined-stream exception does not apply to any round-2, round-3, or later command: every new invocation still captures separate exclusive stdout, stderr, and status artifacts. The failed attempt was made under dispatch `dea027e813dba9a19270ddb3b2a8ab2f383f709a7fbf46ac95223faafd6404a8`, 952 lines, 132568 bytes, but the evidence transition remains the fixed `4b46b79fc60d9bd154e76403a1164404177b32d6aef2c3415c458e3f5569ca7c` preserved row directly to the newly controller-supplied active dispatch; `dea027e813dba9a19270ddb3b2a8ab2f383f709a7fbf46ac95223faafd6404a8` is provenance only, never a replacement baseline.

Exclusively create `$task5_tmp/preserved-evidence.round2.lock` as an immutable supplement over the complete exact post-lock set just verified, including the original lock and its recorded-hash transcript, RED artifacts, the exact combined EPERM `.out` and `.status`, helper/self-test/fixture sources, and their pre-existing seal records. Record the historical `.err` `ENOENT` separately in the immutable continuation transcript; never materialize it to make a regular-file row. Use the same canonical lstat schema and UTF-8 byte ordering as the original lock, require regular nonsymlink `nlink===1` evidence files, reject an unlisted extra, and capture the supplement's full SHA-256 in a new exclusive continuation transcript. The supplement never absorbs a new runner artifact after creation. New generator, protocol, driver, and verifier artifacts instead receive their own immutable source seal as specified below. Every later gate verifies all original-lock rows, the original lock digest/89-row count, every supplement row and digest, exact historical `.err` absence, and the runner seal; no current observation may overwrite or excuse preserved evidence.

Before creating the transition helper, write `$task5_tmp/task5-dispatch-transition-selftest.cjs` and all canonical fixtures. Its first run must exit nonzero because only the exact helper path is absent and emit exactly `TASK5_TRANSITION_SELFTEST_RED helper-missing`; it may translate only an exact first-line `MODULE_NOT_FOUND` for that path, never a transitive miss or arbitrary exception. Seal that RED transcript/status and the self-test source/fixture hashes. This is temporary evidence TDD and adds no `tools/test-scheduler.js` title.

Do not edit or rerun the sealed CJS self-test to conceal its `EPERM` result, and do not delete the helper to manufacture another RED. The only permitted continuation is the sealed outer-shell matrix below. On a later retry after its GREEN, reuse every byte-identical original, supplement, runner source, protocol, RED, EPERM, and GREEN artifact after verifying all seals. If the helper pre-exists without the exact RED, preserved EPERM, supplement, outer-shell GREEN chain, stop.

Create `$task5_tmp/task5-dispatch-transition.cjs` with frozen CLI:

```text
node "$task5_tmp/task5-dispatch-transition.cjs" <scope|authority> <raw-before-jsonl> <raw-after-jsonl> <new-projected-after-jsonl>
```

The helper must require exactly four CLI operands; mode exactly `scope` or `authority`; distinct regular nonsymlink before/after inputs; and a nonexistent output whose parent realpath is exactly `$task5_tmp`. Open the output with exclusive creation and remove only that incomplete exact output on failure. It reads both inputs completely, requires a final newline/no blank line, parses every row, rejects duplicate JSON keys by requiring each raw line to equal `JSON.stringify(parsedRow)`, validates the manifest helper's exact per-type key schema, and requires unique normalized relative paths sorted by UTF-8 bytes. Before and after must have identical row count, path set, and order. Scope mode requires exact `.agents` and `.codex` directory rows once each; authority mode forbids both paths.

It hard-codes only the exact plan path and prior identity `4b46b79fc60d9bd154e76403a1164404177b32d6aef2c3415c458e3f5569ca7c` / 843 / 108633. It requires exactly one regular, `nlink===1` plan row in each input. The before row must have that prior SHA and size. The helper requires `TASK5_DISPATCH_HANDOFF_ID` to byte-equal the ID in the sealed active four-field dispatch record, rereads the live plan, requires its SHA/line/byte counts to equal the remaining SHA/line/byte fields of that same record, and requires the raw after plan row's SHA/size to equal that same live identity. After deleting only `sha256` and `size` from clones of the two plan rows, their canonical JSON must be identical, preserving exact path, type, mode, uid, gid, dev, ino, and nlink. The active SHA must differ from the prior SHA. Missing, empty, or wrong handoff ID fails before input projection. Any CLI/env attempt to name a different path or identity is impossible because neither is an argument.

Only after those checks does it copy every raw after line unchanged except the exact plan row, whose clone receives the fixed prior `sha256` and `size`. It must assert before writing that the projected plan line byte-equals the original raw before plan line and that a line-by-line diff between raw after and projection contains exactly that one path and exactly those two fields. It rereads and revalidates the completed projection, fsyncs/closes it, and emits exactly one canonical evidence line:

```text
DISPATCH_PLAN_TRANSITION {"kind":"<scope|authority>","path":"docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md","beforeSha256":"4b46b79fc60d9bd154e76403a1164404177b32d6aef2c3415c458e3f5569ca7c","beforeLines":843,"beforeBytes":108633,"afterSha256":"<active-dispatch-sha256>","afterLines":<active-dispatch-lines>,"afterBytes":<active-dispatch-bytes>}
```

Create `$task5_tmp/task5-scope-compare.cjs` solely for comparing the preserved raw scope-before JSONL to one transition-projected scope-after JSONL. Its frozen CLI remains `node "$task5_tmp/task5-scope-compare.cjs" <before-jsonl> <projected-after-jsonl>`. It must read both complete files, require a final newline/no blank line, parse every row, reject duplicate JSON keys by requiring each raw line to equal `JSON.stringify(parsedRow)`, validate the manifest helper's exact per-type key schema, and require unique UTF-8-byte-sorted normalized relative paths. It then requires identical row count, path set, and path order. It has no knowledge of the plan path or dispatch transition and therefore cannot authorize it itself.

For every path other than exact `.agents` and `.codex`, the corresponding raw canonical JSON line must be byte-identical. For each of those two exact managed paths, both rows must exist exactly once, have `type === 'directory'`, have the exact directory keys `path,type,mode,uid,gid,dev,ino,nlink,size`, and have a nonnegative safe-integer `dev`. Delete only `dev` from in-memory clones and require the remaining canonical JSON bytes to be identical, thereby retaining exact equality for type, mode, uid, gid, ino, nlink, and size. A changed field other than `dev`, missing/extra/reordered path, wrong managed type/schema, nonnumeric `dev`, or a `dev` change on any third path fails. Do not ignore a subtree, use a prefix match, recapture a baseline, or add either managed directory to the seven-path implementation allowlist.

Only after validating every row may the comparator exit zero and emit exactly two path-ordered evidence lines:

```text
MANAGED_MOUNT_DEV_ONLY {"path":".agents","beforeDev":<raw-before-number>,"afterDev":<raw-after-number>}
MANAGED_MOUNT_DEV_ONLY {"path":".codex","beforeDev":<raw-before-number>,"afterDev":<raw-after-number>}
```

These lines report—not replace—the raw values. A failure emits no success marker. Capture stdout and status separately at every gate. The exception is valid whether the two numeric values differ or remain equal, but it never permits another difference.

This comparator is used only for the preserved raw `scope.before` plus authenticated transition projections of fresh raw `scope.after.*` captures. `allowed.*`, physical index, cached diff, NUL-aware status, and `temp.*` keep their existing exact byte/type rules with no normalization. `authority.after.*` is first projected by the dispatch helper and then must byte-equal preserved raw `authority.before`; authority never uses the managed-mount comparator. The observed hard-stop evidence in the existing raw `scope.before` and historical raw `scope.after.pre-report` is `.agents.dev` `90→91` and `.codex.dev` `91→92`; those numbers and that failed after capture are preserved evidence, not a new baseline or hard-coded acceptance pattern. Every new after capture uses a new name and both helpers derive values from their raw inputs.

The sealed first-version helpers are also security RED evidence: they resolve an input with `realpath` before `lstat`, so a symlink to an otherwise valid regular fixture can be accepted. Preserve those source bytes and all existing evidence. Through separate top-level Node invocations, give each old helper one symlink input followed by an exact later-invalid sentinel that is reachable only after operand-type validation. Require its exact status/stdout/stderr to prove it reached the later semantic rejection instead of rejecting the symlink, require every input byte unchanged and every output absent, and seal this as RED. Do not count these harness REDs among the 57 scheduler titles or the 38 core protocol cases.

Then create new, never-before-used `$task5_tmp/task5-dispatch-transition.round2.cjs` and `$task5_tmp/task5-scope-compare.round2.cjs` rather than overwriting either old helper. Their positional CLI and every semantic rule/output marker above remain identical. Before any `realpath`, each requires every original input operand to be absolute and normalized, walks and `lstat`s its complete ancestor chain, applies BigInt `lstat` to that exact final directory entry, and rejects any symlink, non-regular type, or `nlink !== 1`; `realpathSync(operand)` must then byte-equal the original operand. Define the exact input tuple as `[mode,uid,gid,dev,ino,nlink,size,mtimeNs,ctimeNs]`. For each input, capture initial path tuple `I`, open once with `O_RDONLY|O_NOFOLLOW`, capture descriptor tuple `F0`, and require `I === F0` before reading. Read only that descriptor, capture post-read descriptor tuple `F1`, keep it open, capture final path tuple `P` immediately before accepting any result, and require `I === F0 === F1 === P`; distinct inputs also require distinct `(dev,ino)`. Any mismatch, including swap-open-restore where initial and final path tuples match but the opened descriptor does not, is `TASK5_INPUT_IDENTITY_RACE` and produces no output. The comparator applies this same discipline to both inputs.

The transition output must be absent by exact `lstat` `ENOENT`; its complete original absolute parent chain must be nonsymlink directories whose final realpath is exactly `$task5_tmp`. Open it with `O_CREAT|O_EXCL|O_WRONLY|O_NOFOLLOW`, reject an input `(dev,ino)` alias, write completely, `fsync`, capture final descriptor tuple `OF` while still open, then close and capture final output-path tuple `OP`; require a regular `nlink===1` output and exact `OF === OP` before emitting success. On any failure after exclusive creation, cleanup may unlink only after an immediate BigInt `lstat` proves the path tuple exactly equals the last trusted output `fstat` tuple, including `mode,uid,gid,dev,ino,nlink,size,mtimeNs,ctimeNs`. If no trusted tuple exists, the path is absent, or any field differs, preserve every path and fail with `TASK5_OUTPUT_CLEANUP_IDENTITY_RACE`; never unlink a replacement or an unapproved inode.

Run the same symlink operands, one per input position, plus a hard-link alias fixture through separate top-level commands; require each corrected helper to fail with its exact deterministic error bytes, no success marker, and no output write. Every old-RED and corrected-GREEN TDD command uses the same absolute sealed `env -i --`/Node boundary and exact eight assignments later used by the matrix. Seal the old RED inputs/outputs/statuses and corrected GREEN rejection inputs/outputs/statuses without deleting the deliberately named symlink fixtures; seal exact symlink targets as such, and require all evidence outputs to remain regular nonsymlink `nlink===1` files. The `.round2.cjs` helpers, their immutable `dispatch-continuation-r4.txt` binding to `b197ed1ed0e9c7d44a8a16e0195574668635ef73cfae1567fcc992810fc024fd` / 1041 / 159714, their TDD, and their S01 artifacts are now historical evidence only: preserve every byte and seal, never edit or rerun them, and reject their paths in S02, the matrix, every real phase, and every review gate.

After Steps 1 and 3 exclusively capture and seal the new controller-supplied immutable active handoff ID/SHA/lines/bytes in never-before-used exact `$task5_tmp/dispatch-continuation-r5.txt`, exclusively create fresh `$task5_tmp/task5-dispatch-transition.round3.cjs` and `$task5_tmp/task5-scope-compare.round3.cjs`. Audit their sources before execution against the sealed round-2 sources: each existing round-2 helper contains exactly one record-basename literal `dispatch-continuation-r4.txt`, and each round-3 source must differ only by replacing that one literal with `dispatch-continuation-r5.txt`; resolution remains the unchanged `TASK5_TMP`-bound `path.join`, so no absolute path or caller operand is introduced. No active SHA/lines/bytes are embedded, and no CLI, marker, error code, tuple, symlink/ancestor/alias rule, `I === F0 === F1 === P`, `OF === OP`, cleanup, output, or other security/semantic byte may change. Exclusively create and seal non-spawning `$task5_tmp/task5-round3-helper-delta-verify.cjs`, limited to fixed `node:fs`, `node:path`, and `node:crypto` imports and the exact four helper paths. After its separate eight-assignment `env -i --` `node --check`, it requires one r4 literal and zero r5 literals in each round-2 source, zero r4 literals and one r5 literal in each round-3 source, replaces only the r5 literal in memory with r4, and requires byte equality to the corresponding sealed round-2 source; it also rejects an active identity literal or another changed byte. Capture exact zero status, empty stderr, and sole stdout `TASK5_ROUND3_HELPER_DELTA_OK replacements=2\n`; any mismatch emits no marker. Under the same active eight-assignment boundary, capture fresh exclusive `node --check` status/stdout/stderr for both round-3 helpers and rerun only the corrected symlink-input-position and hard-link-alias rejection TDD with fresh output names, exact deterministic statuses/streams, unchanged inputs, and absent projections. Do not rerun S01 or any round-2 test. Seal the active record, both round-3 sources, delta-verifier source/syntax/proof artifacts, helper syntax artifacts, and round-3 rejection TDD as a new immutable forward-helper seal. Only the `.round3.cjs` helpers may be used for S02, D01/D02, P01–N35, the 44 matrix invocations, real phases, or reviewer gates; each such gate verifies both the preserved round-2 evidence seal and the round-3 forward-helper seal.

Add exactly two deterministic outer-shell race negatives, outside P01–N35 and the 44 core invocations. A sealed test-only control file under `$task5_tmp` may make the temporary corrected helper pause at named validation checkpoints and create exclusive marker files; it may only pause, never mutate, skip, or alter a validation result, adds no CLI/environment operand, and every core/real preflight requires all live control/marker/release paths absent. The already completed S01 hard stop is provenance-bound to plan `b197ed1ed0e9c7d44a8a16e0195574668635ef73cfae1567fcc992810fc024fd` / 1041 / 159714; the replacement plan identity is accepted only from the new immutable active dispatch's exact handoff ID/SHA/lines/bytes. Before changing any current S01 path, exclusively write and seal a new append-only S01-continuation supplement over the existing status file (`1\n`), empty stdout, stderr (`TASK5_INPUT_IDENTITY_RACE\n`), projection `ENOENT`, all preexisting hashes, and the current control/marker/release plus restored-original/held-replacement path types, BigInt `lstat` identities, metadata, and content hashes. The original 89-row lock, prior supplement, S01 streams, and prior hashes remain byte-identical; record truthfully that neither S02 nor any 38-ID/44-invocation matrix command ran, and never manufacture their artifacts retroactively.

The preserved S01 sequence already ran and must not be rerun: its genuine pre/post manifests, helper checkpoint marker/release observations, exact streams/status, and current restored-live/held-replacement topology show the original was displaced, a distinct-inode byte-identical replacement occupied the live path for `F0`, the replacement was then held, and the original was restored before release. The production helper still compares the complete tuple including `ctimeNs` and requires `I === F0 === F1 === P` on an accepted execution; S01 correctly rejected at `I !== F0`, so it need not reach `F1` or `P` and its outer-shell oracle must not assert that the initial and restored complete tuples are equal. Require exact status 1, empty stdout, exact stderr `TASK5_INPUT_IDENTITY_RACE\n`, and projection `ENOENT`. For both the original and replacement, require exact equality from their pre-rename state to their respective restored-live/held state for `mode`, `uid`, `gid`, `dev`, `ino`, `nlink`, `size`, `mtimeNs`, and content SHA-256; require the live path to contain the original `(dev,ino)`, the held path to contain the replacement `(dev,ino)`, and the aside and replacement-source paths to be `ENOENT`. Treat every genuinely captured `ctimeNs` as an exact nonnegative BigInt serialized without Number conversion (and require `Number.isSafeInteger` if any value is ever converted to Number); for each inode the final captured value must be strictly greater than its initial value, and any genuine intermediate captures must be in strict chronological increase. Do not invent a missing intermediate checkpoint or command receipt. No sealed S01 command/receipt transcript exists. Record the controller's explicit current observation of every live/absent path and exact identity/hash in the continuation supplement, and state only the bounded inference that the observed `ctimeNs` increases are consistent with and attributable to the explicit rename sequence described by the genuine manifests, marker/release state, and final topology; do not claim exclusive proof that no unrecorded operation occurred. This test-only evidence rule neither removes `ctimeNs` from the helper tuple nor permits an input race in normal execution.

Before S02, preserve the restored-live and held-replacement fixture states under seal, then archive each currently live S01-only control/marker/release path exactly once to a predeclared absent immutable destination. Resolve and seal an absolute GNU `mv` executable, require its advertised `--no-clobber` and `--no-copy` support, and invoke it as one explicit top-level command under the exact eight-assignment `env -i --` boundary with `--no-clobber --no-copy -- "$source" "$destination"`; no implicit `PATH`, ordinary overwrite-capable rename, copy, truncation, or unlink is permitted. Immediately before each move require the source's exact captured type, `(dev,ino)`, `mode`, `uid`, `gid`, `nlink`, `size`, `mtimeNs`, and content hash and require destination `ENOENT`; capture exact status/stdout/stderr, then require status 0, empty streams, source `ENOENT`, destination on the same captured `(dev,ino)` with every listed field/hash unchanged, and an exact integer `ctimeNs` greater only because of that rename. Chain canonical command/archive receipts and the sealed `mv` identity into a new immutable seal. On any mismatch, unexpected destination, unsupported option, or extra/missing path, preserve all current paths and stop; no cleanup may delete an inode. Only after the continuation supplement, archive seal, and round-3 forward-helper seal verify and every live S01 control/marker/release path is `ENOENT` may fresh, distinctly named S02 artifacts be created. S02 must invoke only the round-3 helper under the new active record; pause after output `fsync`/final descriptor `fstat`/close but before final path `lstat`, let the outer shell rename the genuine output to an absent held path and place a distinct-inode decoy at the output path, capture both pre-release tuples/hashes, then release; require exact status 1/stdout/stderr, `TASK5_OUTPUT_CLEANUP_IDENTITY_RACE`, and both held genuine output and decoy to match those pre-release tuples/hashes afterward, proving no unlink or mutation. All S02 renames target prevalidated absent exact paths, are issued by explicit top-level outer-shell commands rather than Node `child_process`, and are captured in a closed pre/post path/tuple/hash manifest. Archive its exact control/marker/release/effect fixtures once under the same no-replace rules, seal those archive identities with the statuses, streams, manifests, and exact no-unapproved-unlink evidence, and require every live control path `ENOENT`. Real phases refuse to start if a live control path exists or any S01-continuation, archive, round-2-history, round-3-forward-helper, or completed race seal fails verification.

Every real phase uses the same sealed execution boundary as the matrix after its two fresh raw captures. `task5_node_bin` and `task5_env_bin` are the absolute executable paths validated below, the eight environment assignments are the complete vector, and `task5_phase` must be one exact predeclared label from `pre-report`, `post-report`, `final`, `pre-logic-review`, `pre-scope-review`, or `reviewers`; no caller-supplied path is permitted. The repeated blocks are intentional—do not replace them with a dynamically assembled command:

```bash
set -Eeuo pipefail
set -C
umask 077
set +e
"$task5_env_bin" -i -- LANG=C LC_ALL=C TZ=UTC \
  TASK5_TMP="$task5_tmp" \
  TASK5_DISPATCH_HANDOFF_ID="$TASK5_DISPATCH_HANDOFF_ID" \
  TASK5_DISPATCH_PLAN_SHA256="$TASK5_DISPATCH_PLAN_SHA256" \
  TASK5_DISPATCH_PLAN_LINES="$TASK5_DISPATCH_PLAN_LINES" \
  TASK5_DISPATCH_PLAN_BYTES="$TASK5_DISPATCH_PLAN_BYTES" \
  "$task5_node_bin" "$task5_tmp/task5-dispatch-transition.round3.cjs" scope \
  "$task5_tmp/scope.before" "$task5_tmp/scope.after.${task5_phase}.active" \
  "$task5_tmp/scope.after.${task5_phase}.projected" \
  >"$task5_tmp/dispatch-transition.${task5_phase}.scope.out" \
  2>"$task5_tmp/dispatch-transition.${task5_phase}.scope.err"
task5_status=$?
set -e
printf '%s\n' "$task5_status" \
  >"$task5_tmp/dispatch-transition.${task5_phase}.scope.status"
test "$task5_status" -eq 0
set +e
"$task5_env_bin" -i -- LANG=C LC_ALL=C TZ=UTC \
  TASK5_TMP="$task5_tmp" \
  TASK5_DISPATCH_HANDOFF_ID="$TASK5_DISPATCH_HANDOFF_ID" \
  TASK5_DISPATCH_PLAN_SHA256="$TASK5_DISPATCH_PLAN_SHA256" \
  TASK5_DISPATCH_PLAN_LINES="$TASK5_DISPATCH_PLAN_LINES" \
  TASK5_DISPATCH_PLAN_BYTES="$TASK5_DISPATCH_PLAN_BYTES" \
  "$task5_node_bin" "$task5_tmp/task5-scope-compare.round3.cjs" \
  "$task5_tmp/scope.before" "$task5_tmp/scope.after.${task5_phase}.projected" \
  >"$task5_tmp/scope-compare.${task5_phase}.out" \
  2>"$task5_tmp/scope-compare.${task5_phase}.err"
task5_status=$?
set -e
printf '%s\n' "$task5_status" \
  >"$task5_tmp/scope-compare.${task5_phase}.status"
test "$task5_status" -eq 0
set +e
"$task5_env_bin" -i -- LANG=C LC_ALL=C TZ=UTC \
  TASK5_TMP="$task5_tmp" \
  TASK5_DISPATCH_HANDOFF_ID="$TASK5_DISPATCH_HANDOFF_ID" \
  TASK5_DISPATCH_PLAN_SHA256="$TASK5_DISPATCH_PLAN_SHA256" \
  TASK5_DISPATCH_PLAN_LINES="$TASK5_DISPATCH_PLAN_LINES" \
  TASK5_DISPATCH_PLAN_BYTES="$TASK5_DISPATCH_PLAN_BYTES" \
  "$task5_node_bin" "$task5_tmp/task5-dispatch-transition.round3.cjs" authority \
  "$task5_tmp/authority.before" "$task5_tmp/authority.after.${task5_phase}.active" \
  "$task5_tmp/authority.after.${task5_phase}.projected" \
  >"$task5_tmp/dispatch-transition.${task5_phase}.authority.out" \
  2>"$task5_tmp/dispatch-transition.${task5_phase}.authority.err"
task5_status=$?
set -e
printf '%s\n' "$task5_status" \
  >"$task5_tmp/dispatch-transition.${task5_phase}.authority.status"
test "$task5_status" -eq 0
set +e
"$task5_env_bin" -i -- LANG=C LC_ALL=C TZ=UTC \
  TASK5_TMP="$task5_tmp" \
  TASK5_DISPATCH_HANDOFF_ID="$TASK5_DISPATCH_HANDOFF_ID" \
  TASK5_DISPATCH_PLAN_SHA256="$TASK5_DISPATCH_PLAN_SHA256" \
  TASK5_DISPATCH_PLAN_LINES="$TASK5_DISPATCH_PLAN_LINES" \
  TASK5_DISPATCH_PLAN_BYTES="$TASK5_DISPATCH_PLAN_BYTES" \
  "$task5_node_bin" "$task5_tmp/task5-transition-verify.round3.cjs" phase "$task5_phase" \
  >"$task5_tmp/phase-verify.${task5_phase}.out" \
  2>"$task5_tmp/phase-verify.${task5_phase}.err"
task5_status=$?
set -e
printf '%s\n' "$task5_status" >"$task5_tmp/phase-verify.${task5_phase}.status"
test "$task5_status" -eq 0
```

Before running it, require every named output/projection and every live race-control path absent, reverify the original lock, supplement, preserved round-2 helper/TDD/S01 evidence, round-3 forward-helper TDD/race evidence, archived race seals, runner/protocol/result seals, and validate the phase label before any path interpolation. The verifier's frozen `phase <label>` mode knows the exact predeclared names and closed inventory; it rejects any unversioned or round-2 helper reference, checks the three round-3 helper statuses are exactly `0\n`, every stderr is zero bytes, each transition stdout is exactly its one mode-matching marker, scope stdout is exactly its two markers, all raw inputs retain their sealed identities, the scope projection satisfies the round-3 comparator, and the authority projection byte-equals raw `authority.before`. It applies the round-3 helpers' original-entry/descriptor/stability rules when reading, lstat-checks every completed helper artifact as regular nonsymlink `nlink===1`, and computes all hashes itself. Its sole stdout line is `TASK5_REAL_PHASE_OK ` followed by canonical JSON with keys in exact order `phase`, `authorityComparison`, and `artifacts`; comparison is exactly `EXACT`, and `artifacts` is the complete fixed path-ordered array of objects with keys `path`, `bytes`, `sha256`. The controller then requires verifier status `0\n`, empty verifier stderr, and that exact record, and lstat-checks/seals the verifier's own three artifacts. This replaces ambient `cmp`/`sha256sum`; a zero helper status without exact bytes or an extra/missing phase artifact fails.

This revised dispatch is continuation-only. Do not create a fresh baseline under it. Require the existing artifacts captured before the first implementation edit, their fixed prior plan rows where applicable, and the exact original three-live/four-ENOENT `allowed.before` shape before sealing `preserved-evidence.lock`. The preserved artifacts are:

1. `scope.before`: every repository entry except `.git/**` and the seven allowed paths, including dirty and untracked files.
2. `allowed.before`: exactly seven rows and no others: live regular-file identities for `server/scheduler/store.js`, `server/world.js`, and `tools/test-scheduler.js`; exact `ENOENT` markers for `server/scheduler/combat-snapshot.js`, `server/scheduler/advance-service.js`, `server/scheduler/reducers.js`, and `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-5-report.md`. Never include `server/db.js` or the Task 4 report in `allowed.before`.
3. `status.before`: raw `git status --porcelain=v1 -z` bytes.
4. `index.before`: physical `.git/index` lstat/hash row. If absent, record an exact `ENOENT`; never create it.
5. `cached.before`: raw `git diff --cached --binary` bytes.
6. `authority.before`: design, parent plan, this dispatched plan, routing, progress, Task 1/2 briefs and reports, Task 3/4 reports, Task 3 sources/artifacts, `server/rules.js`, migrations, contract, `server/db.js`, `server/app.js`, `package.json`, and the accepted remediation plans `docs/superpowers/plans/2026-08-24-durable-scheduler-task3-remediation-implementation.md` at SHA-256 `ebfaf4489bf37296755908e1d380870c0c9d70ea5d0f1b3a60210ee5ec772e9f` and `docs/superpowers/plans/2026-08-24-durable-scheduler-task4-remediation-implementation.md` at SHA-256 `dc0af317bda6d5b5b2e4c4f81ba293597e7dad766e6e8a04c5893b4eebc5bac2`.
7. `temp.before`: a type-aware recursive `/tmp` manifest excluding only the exact realpath `$task5_tmp`; do not exclude by prefix or glob.

Also seal the pre-edit `node tools/check-syntax.js` transcript and its nonzero status. Its accepted restricted-sandbox fingerprint is exactly 43 unique source paths, each with one `syntax-check spawn EPERM` line and no other text. The final classifier must compare against this sealed path set plus the exact three new module paths, rather than trusting a hard-coded total alone.

Repeat every original baseline check against preserved raw `authority.before`: compare every non-dispatch hash to the literal protected baseline above, including both prerequisite remediation-plan path/hash pairs, and every Task 3/4 payload path to the decoded-envelope maps. Require its Task 5 plan row to be the fixed prior identity and never recapture it. Each fresh raw `authority.after.*` must enumerate the identical path set; after the one-row authenticated projection, it must byte-equal raw `authority.before`. A before/after comparison alone is insufficient because it could preserve an already-drifted input.

The status comparator must parse the NUL format, reject rename/copy records it cannot pair, remove entries only when their normalized path is in the exact allowlist, and byte-compare the remaining records. A line-oriented or whitespace-splitting status parser is forbidden. Capture both physical index identity and cached diff; neither substitutes for the other.

Run an injected fixture against the manifest helper before trusting it: create in `$task5_tmp` a regular file with a space and newline in its name, a directory, and a symlink; require three distinct JSON rows and the correct types, then remove only those exact fixtures. Never clean a pre-existing `/tmp` path.

Run two synthetic helper protocols under `$task5_tmp`, without adding a scheduler test title. First retain the managed comparator's canonical three-row fixtures containing directory rows for `.agents` and `.codex` plus regular `server/example.js`. The positive pair changes only `.agents.dev` `90→91` and `.codex.dev` `91→92`; require status 0, empty stderr, and the exact two `MANAGED_MOUNT_DEV_ONLY` lines. Independent negatives must reject regular-file SHA/content drift, `.agents.mode`, `server/example.js.dev`, wrong managed type, and nonnumeric managed `dev` with exact status 1 and exact stdout/stderr bytes.

Second, build canonical path-sorted scope and authority fixtures containing the exact Task 5 plan row, a non-plan regular row, and—only for scope—the two managed directory rows. The transition-positive before plan row uses exact fixed prior SHA/size and the after row uses the active dispatch SHA/size; every plan metadata field is identical. Use only the round-3 helpers: require the transition helper's exact one-line marker, prove raw inputs unchanged, prove its projection differs from raw after at only plan `sha256`/`size`, then require the round-3 scope comparator or exact authority byte comparison to pass. Table-driven negatives must fail closed for each of: wrong prior SHA; wrong prior size; a before row already carrying the active identity (baseline regeneration); a stale after row still carrying the prior identity; wrong active after SHA or size; separate top-level helper invocations with wrong active dispatch SHA, lines, or bytes; any plan `type`, `mode`, `uid`, `gid`, `dev`, `ino`, `nlink`, or path change; missing, extra, duplicate, or reordered rows; aliased inputs/output; pre-existing or out-of-`$task5_tmp` output; and malformed/noncanonical JSON. An attempted transition on any other path is impossible and must have no CLI seam.

Finally compose only the round-3 helpers against non-plan and managed negatives: allow the round-3 transition helper to project an after fixture whose non-plan content/SHA changed, then require the downstream scope/authority gate to reject it; likewise require `.agents.mode` and third-path `dev` changes to survive projection and fail in the round-3 managed comparator. This proves projection does not hide implementation or mount drift. Preserve every historical failed after capture under its old name. Capture each new live raw after under a fresh exclusive name; never regenerate a before artifact or overwrite an old after to make a test pass.

Because the managed sandbox denies Node `child_process`, do not invoke either helper from the sealed CJS self-test, from the generator, or from the verifier. Exclusively create three never-before-used round-3 forward-runner sources: non-spawning `$task5_tmp/task5-transition-protocol-generator.round3.cjs`, static `$task5_tmp/task5-transition-matrix.round3.sh`, and non-spawning `$task5_tmp/task5-transition-verify.round3.cjs`. The two CJS files may import only fixed `node:fs`, `node:path`, and `node:crypto` names; reject `child_process`, `worker_threads`, `cluster`, `vm`, dynamic `require`/`import`, native bindings, or another execution facility. Capture separate top-level `node --check` results for both CJS sources and an absolute sealed Bash `-n` result for the driver, all under the same explicit sealed eight-assignment `env -i --` boundary used below. The generator may emit only canonical data/fixtures into a new exact private protocol root; it never emits shell source, reads a result, or derives an expectation from observed output.

Before generation, resolve `process.execPath`, Bash, and `env` once through controller-level top-level commands; require absolute normalized realpaths to regular nonsymlink executables and record their complete lstat identities and SHA-256 values. Embed those absolute values and only the exact absolute `.round3.cjs` helper paths in the static driver/protocol; a `.round2.cjs`, unversioned, or other helper path is an H11-style hard failure, and no matrix command may use `PATH` to select an executable or helper. Create `$task5_tmp/task5-round3-runner-source.seal` exclusively over the round-3 generator, driver, verifier, preserved round-2 helper/history seal, round-3 forward-helper seal and sources, race-control source/archive manifest, and executable identities. The generator runs only through sealed absolute `env -i --` and Node with the exact eight-value environment. It requires every live race-control path absent and all archived race evidence sealed, requires the handoff ID to byte-equal the ID field of sealed `dispatch-continuation-r5.txt`, validates the live plan against that same record's remaining SHA/line/byte fields, reads only sealed inputs, and exclusively emits canonical case metadata, fixed fixtures, expected bytes, and per-invocation NUL-delimited argv/environment vectors. Neither the source seal nor the later protocol seal includes or rewrites the original 89-row lock, its round-2 supplement, or any round-2 helper/TDD/S01 artifact.

Use two dispatch-binding meta-negative values with all eight assignments present: D01 assigns `TASK5_DISPATCH_HANDOFF_ID` the empty string and D02 one fixed wrong value. First run D01/D02 separately against the round-3 transition helper and generator; invoking a round-2 helper is forbidden, not a negative case. Then invoke the successful generator with the sealed exact ID, capture exact status/stdout/stderr, seal that ID and the complete generated tree in `$task5_tmp/task5-round3-protocol.seal`, and only then run D01/D02 against isolated driver and verifier inputs before the core driver. Every negative call must fail before projection/protocol/result creation with exact status 1/stdout/stderr and no output. Seal all eight negative calls outside P01–N35, and require each component's later prescribed correct-ID call to succeed before GREEN.

The protocol has exactly 38 ordered logical IDs `P01,P02,P03,N01,…,N35` and exactly 44 ordered actual helper invocations. The binding is immutable: P01 is one scope-comparator call; P02 is scope transition then scope comparator; P03 is one authority transition followed by verifier-owned byte comparison; N01–N22 and N24–N32 are one call each; N23 is two transition calls, aliasing output to before and after respectively; N33 is scope transition/comparator plus authority transition/verifier comparison for the same non-plan drift; and N34/N35 are scope transition then comparator. Thus P01/P02/P03 contribute 1/2/1, N01–N27 contribute 28, N28–N32 contribute five, N33 contributes three, and N34/N35 contribute two each. Every invocation record fixes its logical ID, ordinal, helper enum (`transition` or `scope-compare`), complete argv array, the exact eight-entry environment vector in the order `LANG`, `LC_ALL`, `TZ`, `TASK5_TMP`, `TASK5_DISPATCH_HANDOFF_ID`, `TASK5_DISPATCH_PLAN_SHA256`, `TASK5_DISPATCH_PLAN_LINES`, `TASK5_DISPATCH_PLAN_BYTES`, exact expected integer status (`0` or `1`), exact stdout bytes, exact stderr bytes, and output postcondition with exact expected bytes/hash or exact absence. Every core invocation carries the sealed correct handoff ID; N07–N09 alter only SHA, lines, and bytes respectively. The generator must reject a count, ID, ordinal, helper path, handoff ID, or active-plan mismatch before emitting the seal.

Run the driver only through the absolute sealed `env -i --` with the same eight explicit assignments, followed by the absolute sealed Bash with `--noprofile --norc` and the exact driver/protocol/result operands; capture that outer status/stdout/stderr exclusively. It uses `set -Eeuo pipefail`, `umask 077`, and noclobber; a private nonsymlink work/result tree and every case directory are predeclared by the sealed protocol and verified empty. For each sealed invocation it loads only that invocation's argv/environment NUL files with Bash NUL-safe arrays, switches to `set +e` only for the one quoted helper command, captures `$?`, immediately restores `set -e`, and never branches on the captured semantic status. It invokes the absolute sealed `env` as `env -i --` with exactly `LANG=C`, `LC_ALL=C`, `TZ=UTC`, `TASK5_TMP`, the sealed exact `TASK5_DISPATCH_HANDOFF_ID`, `TASK5_DISPATCH_PLAN_SHA256`, `TASK5_DISPATCH_PLAN_LINES`, and `TASK5_DISPATCH_PLAN_BYTES`, with no ambient inheritance, and executes the absolute Node/helper argv with quoted array expansion. It has no expectation-file operand or read permission in its source logic; stdout/stderr can come only from command redirection, status only from the captured `$?`, and a projection only from the helper. The actual driver contains no `eval`, `source`/dot include, `sh -c`, command substitution, backticks, generated shell, unquoted word splitting, wildcard/glob, pipeline, or implicit executable/helper lookup. Its literal ordered case/invocation inventory and the protocol are both checked before execution, including exactly one helper command before each corresponding status/receipt write.

The sealed static scanner must accept only the exact real driver and reject exactly 12 canonical nonexecuted fixtures: H01 `eval`, H02 `source`, H03 dot include, H04 `sh -c`, H05 `$()` substitution, H06 backticks, H07 unquoted parameter expansion/word splitting, H08 wildcard/glob, H09 pipeline, H10 implicit `PATH` command selection, H11 an unapproved helper path, and H12 generated-shell write/execute. Each fixture contains only its named defect, must produce its exact scanner status 1/stdout/stderr with no success marker, and is outside P01–N35.

Each invocation gets a unique, initially absent stdout, stderr, decimal-status, and receipt path. Noclobber redirection creates stdout/stderr and the Bash `printf` builtin creates status/receipt files exclusively; the helper alone creates a declared projection with exclusive open. A receipt is exactly one canonical JSON line with keys in fixed order `ordinal`, `id`, `invocationId`, and `previousReceiptSha256`; ordinals are 1–44, the first predecessor is 64 zeroes, and every later predecessor is the protocol-precomputed SHA-256 of the exact preceding expected receipt. A single exclusively opened ledger receives that same receipt line only after the command returns. The verifier hashes each actual receipt and requires the next predecessor plus byte equality to the corresponding ledger line, so a missing, duplicate, reorder, or changed receipt breaks the chain. The driver never interprets success, rewrites an artifact, deletes a failed output, or prints GREEN. All 44 bundles, the ledger, every input hash, and every output are regular nonsymlink `nlink===1` evidence and are sealed immediately after the driver returns. The exact N25 outside-temp directory is controller-created with a private `mktemp -d` name before protocol sealing, lstat/realpath-validated with a nonsymlink ancestor chain, embedded literally, and must remain empty; after verification it is removed only by exact `rmdir` and `/tmp` is rechecked against `temp.before`.

Run the verifier only through separate explicit top-level Node commands under the same sealed eight-assignment `env -i --` boundary. It rejects a live race-control path or bad archived race seal, then rejects a missing, empty, or non-sealed handoff ID before reading a result, and never executes or imports a helper. Its preflight mode validates both runner seals, canonical protocol encoding, the exact 38-ID/44-invocation expansion and order, absolute sealed binaries/helpers, every exact eight-entry `env -i` vector, NUL argv boundaries, input identities, empty result paths, and driver static policy. Its result mode re-enumerates the closed result tree and requires exactly one chained ordered receipt and one complete bundle per invocation, no extra/missing/duplicate/reordered/skipped logical ID or invocation, exact status/stdout/stderr bytes for every call, unchanged input hashes, and exact per-case output postconditions. Its phase mode accepts only one frozen phase label and performs the real-gate checks specified above. In particular N22/N23 make no write through any alias, N24 leaves its occupied output byte-identical, N25 creates nothing outside, every other failed output is absent, and N33–N35 retain the intended downstream drift in their projection before the later exact rejection.

Before trusting result mode, run it as separate top-level commands against sealed canonical synthetic receipt/result trees for `missing`, `extra`, `duplicate`, `reordered`, and explicit `skipped`; each must return its exact status 1/stdout/stderr and no GREEN. These verifier meta-negatives and the static-scanner meta-negatives are harness checks, not additions to the three positives or 35 negatives. Capture all top-level command statuses without a pipeline and seal every stdout/stderr/result byte. A generic throw, a changed expected count, an unexpected pass, a byte merely containing an expected marker, or a marker printed before every seal and postcondition has been checked fails.

Only after all checks may result mode emit exactly `TASK5_TRANSITION_SELFTEST_GREEN positives=3 negatives=35`. P01 is the standalone managed-device comparison; P02/P03 are composed scope/authority transitions. Core IDs N01–N27 follow the exact sentence order above: two prior-identity cases, regenerated-before, stale-after, two active-after cases, three dispatch-env cases, eight plan-metadata/path cases, four row-set/order cases, `before===after`, one two-invocation output-alias ID, pre-existing output, outside-temp output, malformed JSON, and noncanonical JSON. N28–N32 are the five standalone managed-comparator negatives; N33–N35 are the three composed downstream-drift negatives. Verify the original lock, supplement, exact combined historical EPERM pair/`.err` absence, preserved round-2 helper/TDD/S01 evidence, round-3 delta/syntax/rejection TDD seal, round-3 S02 evidence, no-unapproved-unlink manifest, runner sources, protocol, 44 result bundles, meta-negative transcripts, and final GREEN transcript before every real use.

## TDD protocol shared by all three implementation groups

Task 5 appends exactly 57 top-level tests in three contiguous groups. Each group has two deliberately different RED phases: a small surface RED while its module/API does not exist, then a GREEN contract shell, then behavior tests whose RED is observed through that loaded shell at the named semantic boundary, then behavior implementation. A missing module is valid only for a surface RED. It is never evidence for snapshot, barrier, reducer, rollback, conservation, ordering, or restart behavior.

The exact cumulative arithmetic is immutable:

| Stage | New tests | Exact `tests/pass/fail/skipped` | Exact failing inventory |
|---|---:|---|---|
| Accepted baseline | 0 | `106/105/0/1` | none |
| A surface RED | 3 | `109/105/3/1` | A-S1 through A-S3 |
| A shell GREEN | 0 | `109/108/0/1` | none |
| A behavior RED | 9 | `118/108/9/1` | A-B1 through A-B9 |
| A behavior GREEN | 0 | `118/117/0/1` | none |
| B surface RED | 2 | `120/117/2/1` | B-S1 through B-S2 |
| B shell GREEN | 0 | `120/119/0/1` | none |
| B behavior RED | 15 | `135/119/15/1` | B-B1 through B-B15 |
| B behavior GREEN | 0 | `135/134/0/1` | none |
| C surface RED | 3 | `138/134/3/1` | C-S1 through C-S3 |
| C shell GREEN | 0 | `138/137/0/1` | none |
| C behavior RED | 25 | `163/137/25/1` | C-B1 through C-B25 |
| Final behavior GREEN | 0 | `163/162/0/1` | none |

No other top-level test, skip, todo, suite, or title is permitted. The 57 tests are eight surface tests plus 49 behavior tests. A stage manifest under `$task5_tmp` records every stage name, cumulative title set, expected tag map, TAP SHA, and source suffix SHA before the next production edit.

At the first Task 5 suffix line, add one marker and a lazy loader:

```js
// BEGIN TASK5_TESTS
var TASK5_MODULE = Object.freeze({
  snapshot: '../server/scheduler/combat-snapshot.js',
  advance: '../server/scheduler/advance-service.js',
  reducers: '../server/scheduler/reducers.js'
});
function task5Lazy(name, redTag) {
  try { return require(TASK5_MODULE[name]); }
  catch (error) {
    var expected = "Cannot find module '" + TASK5_MODULE[name] + "'";
    var missing = error && error.code === 'MODULE_NOT_FOUND' &&
      typeof error.message === 'string' && error.message.split('\n')[0] === expected;
    if (missing) throw new Error(redTag);
    throw error;
  }
}
```

Every test that consumes a newly-created module calls `task5Lazy` inside its callback. Only a surface test may pass a surface tag as the second argument. Every behavior test calls `task5Lazy(name)` with no RED tag, after the named module exists and its sealed shell GREEN passed; its unique tag must be the message on the assertion at the named state/result/effect boundary. It may capture a specifically enumerated domain outcome as data, but may not catch/translate `MODULE_NOT_FOUND`, arbitrary exceptions, fixture failures, or a generic `TASK5_NOT_IMPLEMENTED` into its tag. Shells therefore export exact signatures and safe inert/no-op structural values; they do not throw a common placeholder that could make every behavior test fail for the same reason.

Store-only tests use the accepted `task2StoreModule()` seam. All behavioral fixtures use real file-backed SQLite, a live claimed executable, the exact parsed frozen payload, an open Task 4 immediate UoW where required, and production Store/world boundaries. No test may import at registration time, mock Store application authority, pass a raw query row, attach `payload_json` by hand, invoke a world effect outside its reducer except the explicit rejection test, or bypass `assertCanonicalExecutable`. Catch only the exact missing Task 5 module named on the first `MODULE_NOT_FOUND` line in surface RED; a transitive miss is always an unexpected failure.

Every Task 5 test that claims rollback or “zero writes” uses the same stable primary-key/byte snapshot protocol over `scheduler_lease`, `cauhinh`, `dq`, `ht`, `hamdang`, `hamgiu`, `npc`, `pl`, `bangtin`, `tran`, `scheduler_meta`, `event_jobs`, `event_applications`, and `scheduler_audit`, plus the in-memory world batch/context fields other than `mutation.remainingBudget`. It must prove byte identity, not only row counts. The shared `remainingBudget` object is deliberately outside SQLite rollback and is checked instead by the exact attempted-consumption delta table in Group C; it is never snapshotted as rollback-restored state. This applies to seed, capability rejection, projection conflict, cycle/stall/bound, beyond-T, blocked continuation, reducer integrity, every fault injection, and every generation flip. A rollback assertion that omits `scheduler_lease` or claims that rollback refunds budget is invalid.

All mutating barrier/reducer behavior fixtures run through one test-only simulation of the downstream Task 6 claimed-job lifecycle. It calls a parent-compatible `markDurableMutationInCurrentUow(mutation,nowMs)` once, backed by a fixture-private WeakSet and accepted `store.markDurableMutation`, before `advanceBarrier`, `reducer.prepare`, or any staged save. It then follows the exact ownership order specified in Group C. A negative harness call without this mark is rejected by the harness before service/reducer entry. `preflightCutover` is read-only and never marks. Task 5 production services/reducers neither call nor emulate the writer marker; tests that invoke a component in isolation may inspect pure output but cannot claim supported committed-partial evidence.

After each append, a parser-based suffix checker must prove:

- The immutable first 8232-line prefix still hashes to the accepted Task 4 test SHA.
- There is one `BEGIN TASK5_TESTS`, no nested `test`, and exactly the stage's cumulative title set/count: `3`, `12`, `14`, `29`, `32`, or `57`.
- The three production path literals occur only in `TASK5_MODULE`; the only dynamic production require is `require(TASK5_MODULE[name])` inside `task5Lazy`.
- Each expected title has a nonempty callback containing `task5Lazy` or the accepted Store-only lazy seam, at least one assertion, a call/surface probe for its named boundary, and its unique direct tag. Behavior tests must have the module's prior shell-GREEN identity and may not use their tag in loader/catch translation.
- No `.only`, `.skip`, TODO, fake pass, direct SQL application insert, `require.resolve` bypass, or direct reducer bypass occurs in the suffix.

Create a TAP verifier in `$task5_tmp` that parses top-level `not ok N - title` blocks through the next top-level result/summary. For each of the six REDs it requires nonzero status, the exact summary row above, exact unordered failure-title set, and each block's direct `error:` or `message:` scalar equal to that title's unique tag. A tag found only in title, expected value, nested diagnostic, stack/source listing, or loader catch does not count. It rejects generic placeholder/module failure in behavior RED and every extra failure. For each shell/behavior GREEN it requires zero status, its exact row, and no `not ok`. Every stage requires `suites=0`, `cancelled=0`, `todo=0`; the sole skip remains exactly `real port-zero bridge path remains executable outside restricted bind sandboxes`.

Use this invocation pattern for every sealed run; never pipe the test process through another command:

```bash
set +e
node --test-reporter=tap tools/test-scheduler.js >"$task5_tmp/group-X-phase-red.tap" 2>&1
task5_red_status=$?
set -e
test "$task5_red_status" -ne 0
node "$task5_tmp/task5-tap-verify.cjs" red X-phase "$task5_tmp/group-X-phase-red.tap"
sha256sum "$task5_tmp/group-X-phase-red.tap" >"$task5_tmp/group-X-phase-red.sha256"
```

## Task 2: Group A — capability, Store-owned combat key, and one snapshot/HMAC authority

**Files:** Modify `tools/test-scheduler.js`; then create `server/scheduler/combat-snapshot.js` and modify `server/scheduler/store.js`.

- [ ] **Step 1: Append and seal these three surface tests**

| ID | Exact test title | Direct surface RED tag | Surface proof |
|---|---|---|---|
| A-S1 | `Task 5 combat snapshot module exposes the frozen surface` | `TASK5_SURFACE_SNAPSHOT_MODULE` | The absent module alone causes RED; after shell it exports only the three frozen functions at exact arities. |
| A-S2 | `Task 5 Store exposes seed and committed-application surfaces` | `TASK5_SURFACE_STORE_APPLICATION` | Store lacks the exact new seed/read signatures before shell and has them after; no behavior is claimed. |
| A-S3 | `Task 5 Store exposes a private executable-capability verifier` | `TASK5_SURFACE_STORE_CAPABILITY` | Store lacks `assertCanonicalExecutable/3` before shell; after shell its registry is not exported or object-carried. |

Seal exact A surface RED `109/105/3/1`, then create only the snapshot/Store contract shell. The snapshot exports exact arities and inert structural values. Store exposes exact arities, installs the private registry/final-return brand delta, and exposes a safe inert verifier boundary; seed/application behavior is not implemented. Seal shell GREEN `109/108/0/1`, syntax, accepted-prefix, protected-body, and authorized-loader-delta identities before appending behavior tests.

- [ ] **Step 2: Append these nine behavior tests only after A shell GREEN**

| ID | Exact test title | Direct behavior RED tag | Required proof |
|---|---|---|---|
| A-B1 | `Task 5 Store owns lease-fenced combat seed creation in an immediate UoW` | `TASK5_RED_SEED_STORE_AUTHORITY` | A live token inside accepted `BEGIN IMMEDIATE` creates exactly one lower-case 64-hex `cauhinh` row; no caller key/object/SQL exists. |
| A-B2 | `Task 5 combat seed creation rejects outside an open immediate UoW` | `TASK5_RED_SEED_REQUIRES_UOW` | Live lease with no active immediate Task 4 UoW rejects before randomness/INSERT and leaves `cauhinh` and all scheduler tables unchanged. |
| A-B3 | `Task 5 combat seed statement and post-write fences roll back scheduler lease too` | `TASK5_RED_SEED_POST_WRITE_FENCE` | Stale/expired generation writes nothing; generation flip after INSERT makes post-fence throw `LEASE_LOST`, and rollback restores `cauhinh`, `scheduler_lease`, metadata, jobs, applications, and audit byte-for-byte. |
| A-B4 | `Task 5 competing holders and restart converge on one persisted combat seed` | `TASK5_RED_SEED_CONVERGENCE` | Two file-backed connections/generations cannot replace the winner; reopen returns identical key; standby/legacy paths do zero writes. |
| A-B5 | `Task 5 seed32 is the sole big-endian HMAC implementation` | `TASK5_RED_HMAC_BE_SINGLE_OWNER` | Known vector is `0x09367fa0`; malformed key/match/time/schema reject; one production `createHmac` and `readUInt32BE(0)`, both in snapshot. |
| A-B6 | `Task 5 combat snapshot v1 validates exact schema and canonical T context` | `TASK5_RED_SNAPSHOT_CANONICAL_T` | Exact keys/order/numeric bounds, stable match/ref/arrival, post-normalization revisions/participants/supporter order/seed/hash bind at T; every one-field mutation rejects. |
| A-B7 | `Task 5 duplicate PvP application revalidates immutable snapshot after restart` | `TASK5_RED_SNAPSHOT_RESTART` | First insert uses canonical-at-T context; reopen validates persisted seed/job/snapshot bytes, never later `dq`; duplicate changes no state/application/effect. |
| A-B8 | `Task 5 executable capability rejects clones and accepts genuine reloads` | `TASK5_RED_EXECUTABLE_BRAND_LIFECYCLE` | Frozen spread clone, exact structural clone, JSON clone, audit load, different Store, stale/pre-restart object reject; genuine load and new-Store fresh load pass and return fresh branded canonical objects. |
| A-B9 | `Task 5 executable branding preserves every accepted loader validation` | `TASK5_RED_EXECUTABLE_BRAND_VALIDATION` | Re-run accepted loader negatives, then pass raw, PENDING, blocked account, wrong owner/generation/lock/expiry, payload/hash/schema/replay/root tamper to the new verifier and require rejection before execution; no writable/exported marker can forge membership. |

Seal exact behavior RED `118/108/9/1`. Every module is loadable, all three surface tests stay green, and each failure is its table's semantic assertion rather than module/shell failure.

- [ ] **Step 3: Implement Group A behavior minimally**

Create a single strict snapshot module. `buildCombatSnapshotV1` accepts the validated executable job, persisted key, and canonical-at-T attacker/defender/supporter inputs; it emits exactly `{schemaVersion,matchId,arrivalAtS,seed,attacker,defender,supporters}` with snapshot schema version `1`, normalized sorted maps, and supporters ordered by `(accountId,fleetId)`. `validateCombatSnapshotV1` validates that exact v1 schema, Task 3 stable ref/match identity, HMAC seed, and optional first-insert canonical context. It does not read the DB, clock, projections, or mutable later state. Accepted payload schema v0/v1 parsing remains Store authority and is not a second snapshot schema.

Add Store-owned `getOrCreateCombatSeedKey` exactly as frozen above. Add `hasCommittedApplication` as a fenced read: assert the live lease, reload the exact RUNNING executable, read by idempotency key, return false if absent, otherwise fully validate immutable application/job/snapshot linkage and return true. Extend the existing Store validator rather than replacing its result/replay/effective-time checks. `insertApplication` must still reload through `loadExecutableJob`, use its existing conditional `INSERT ... SELECT` lease and running-lock predicates, call the accepted mutation helper, reread the row, and validate it. PvP `PVP_RESOLVED` requires a snapshot and first-insert canonical context; every other valid result forbids a snapshot. Duplicate/read validation uses the persisted seed key and immutable application/job bytes, not current game state.

Implement the module-private Store-instance capability exactly as frozen. Every Task 5 execution path calls `assertCanonicalExecutable` and uses its returned object. Branding is applied only after every accepted `loadExecutableJob` check; it does not brand audit/replayable/raw objects and does not alter payload or logical-root shape. The lexical accepted-loader delta gate must pass.

There is no second `seed32` alias on `EventReducer`, Store, tests, or world. Tests import the pure export from `combat-snapshot.js`.

- [ ] **Step 4: Seal Group A behavior GREEN**

Expected exact summary is `118/117/0/1`. Also run syntax, immutable-prefix/suffix, capability-negative corpus, protected-body, authorized-loader-delta, SQL-owner, and HMAC gates.

## Task 3: Group B — canonical barrier, projection repair, fixed point, and shared budget

**Files:** Modify `tools/test-scheduler.js`; then create `server/scheduler/advance-service.js` and make only required integration edits to `server/scheduler/store.js` and `server/world.js`.

- [ ] **Step 1: Append and seal these two surface tests**

| ID | Exact test title | Direct surface RED tag | Surface proof |
|---|---|---|---|
| B-S1 | `Task 5 advance service module exposes its frozen exports` | `TASK5_SURFACE_ADVANCE_MODULE` | Absent module causes only this surface RED; shell exports exactly `GameAdvanceService` and `toPublicAdvanceResult`. |
| B-S2 | `Task 5 advance service prototype exposes every frozen method` | `TASK5_SURFACE_ADVANCE_PROTOTYPE` | Absent module causes surface RED; shell has exact constructor and method arities without behavior claims. |

Seal B surface RED `120/117/2/1`. Create only a syntax-valid advance shell whose methods return inert strict structures and whose public converter is deliberately incomplete but runnable. Do not edit Store/world behavior. Seal shell GREEN `120/119/0/1` and all earlier GREEN/static gates.

- [ ] **Step 2: Append these fifteen behavior tests only after B shell GREEN**

| ID | Exact test title | Direct behavior RED tag | Required proof |
|---|---|---|---|
| B-B1 | `Task 5 barrier consumes only a Store-branded current executable` | `TASK5_RED_BARRIER_EXECUTABLE_ONLY` | Barrier invokes verifier before payload/scan; clone/audit/different Store/stale/expired fail with zero writes; claimed then freshly loaded branded job passes. |
| B-B2 | `Task 5 public AdvanceResult is exact and rejects coercible internal values` | `TASK5_RED_PUBLIC_ADVANCE_RESULT` | Exactly five keys/types; extra internal fields are stripped; missing, extra public, string number, non-safe/negative, undefined due time, or nonboolean rejects. |
| B-B3 | `Task 5 preflightCutover is deterministic and writes no durable or world state` | `TASK5_RED_PREFLIGHT_NO_WRITE` | Valid branded/cutover inputs run cloned fixed-point order and return exactly `{processed,nextDueAtS,hasMoreDue}`; all DB tables, world maps, queues, seed, projections, scheduling, applications, and clock stay byte-identical; invalid/negative `effectiveNowMs`, target, token, or budget rejects. |
| B-B4 | `Task 5 preflightCutover distinguishes exactly 50000 from 50001 due primitives` | `TASK5_RED_PREFLIGHT_BUDGET_BOUNDARY` | 50,000 drains with `hasMoreDue:false`; 50,001 reports processed 50,000, earliest due time, `hasMoreDue:true`; caller budget object alone changes. |
| B-B5 | `Task 5 barrier scans canonical dq and repairs missing projections` | `TASK5_RED_BARRIER_CANONICAL_REPAIR` | Delete relevant projections; canonical defender/supporter discovery still works and Task 4 save finalizers rebuild them in same UoW. |
| B-B6 | `Task 5 barrier rejects canonical owner conflict and repairs stale projections` | `TASK5_RED_BARRIER_PROJECTION_CONFLICT` | Stale projection never chooses target and is rebuilt; two canonical owners reject with no effect/save/application. |
| B-B7 | `Task 5 barrier rescans to discover a supporter created by local work` | `TASK5_RED_BARRIER_FIXED_POINT_DISCOVERY` | Local work changes eligibility at/before T; next canonical scan includes it before snapshot without projection seeding. |
| B-B8 | `Task 5 barrier parks behind a newly discovered earlier logical root` | `TASK5_RED_BARRIER_LOGICAL_ORDER` | Exact logical tuple order; Store parks current root with no attempt/application; earlier root wins requery. |
| B-B9 | `Task 5 fixed point is stable across row candidate and restart permutations` | `TASK5_RED_BARRIER_PERMUTATION` | Reverse DB/projection/candidate insertion and reopen produce identical participants, keys, convergence signature, and root. |
| B-B10 | `Task 5 semantic cycle detects A to B to A despite revision increments` | `TASK5_RED_BARRIER_SEMANTIC_CYCLE` | Fixture alternates relevant eligibility A→B→A while each save increments revision/audit metadata; semantic cycle signature repeats and throws `BARRIER_FIXED_POINT_CYCLE`, rolling back. |
| B-B11 | `Task 5 fixed point enforces convergence stall cycle and scan bounds` | `TASK5_RED_BARRIER_FIXED_POINT_BOUNDS` | Two stable convergence scans succeed; same semantic signature with due work stalls; scan count never exceeds exact bound and overflow is `BARRIER_FIXED_POINT_BOUND`, all rollback. |
| B-B12 | `Task 5 barrier shares one 50000 primitive budget across accounts` | `TASK5_RED_BARRIER_SHARED_BUDGET` | Through the marked supported harness, 50,001 same-second local primitives across accounts process exactly 50,000, commit valid partial saves plus exact `durable_first_mutation_at_ms`, retain event 50,001, and resume without per-account reset. Unmarked harness entry rejects before service. |
| B-B13 | `Task 5 zero budget distinguishes pure advance from due local work` | `TASK5_RED_BARRIER_ZERO_BUDGET` | No-primitive account may pure-advance without decrement; due work returns zero-progress partial with no gameplay/job/application/projection change. The supported lifecycle's prior durable marker is the only permitted metadata effect and is rolled back on error. |
| B-B14 | `Task 5 barrier rejects participants beyond T and retains the watermark` | `TASK5_RED_BARRIER_BEYOND_T` | `lastTick`/`now>T` rolls back/quarantines, produces no effect/application, and logical root retains T. |
| B-B15 | `Task 5 durable advance preserves every accepted legacy tick bridge` | `TASK5_RED_LEGACY_TICK_BRIDGE` | Baseline balanced bodies/call sites in `server/world.js` and hash of out-of-scope `server/app.js` are unchanged; scheduler modules add only the new service call and do not claim installed app/factory wiring. |

Seal behavior RED `135/119/15/1`; all modules load, earlier 14 tests remain green, and all fifteen direct tags match. Every fixture claims and loads through accepted Store, then the service verifies the branded object.

- [ ] **Step 3: Implement Group B behavior minimally**

`GameAdvanceService` is the durable scheduler's `G.tick` caller, not the sole server caller. It runs synchronously inside `world.withRulesHook`, pushes/pops account owner in `finally`, rejects thenables, and passes the exact shared `mutation.remainingBudget` to Task 3 ticks. It validates target/budget and never allocates a replacement. Preserve the accepted direct legacy `G.tick` calls and balanced bodies in `server/world.js`; do not edit out-of-scope `server/app.js` or route its bridge through `advanceAccountNoiBo`, because legacy app/factory code does not install a Store/service. Task 5's static ownership gate is: exact accepted legacy call-site/body multiset unchanged, plus exactly one scheduler-service call in `advance-service.js`, and no `G.tick` call in snapshot/reducers/Store/new world hooks. Service installation/factory/API wiring is explicitly deferred to the later routed factory integration (Task 7), not fabricated here.

For every scan:

1. Read `SELECT tk,state,revision FROM dq ORDER BY tk`; parse canonical state and build a target-owner map. Duplicate canonical ownership fails closed.
2. Treat projections only as a cross-check. Missing/stale rows are repaired only by Task 4's `world.luu` batching/finalizers, carrying the union of existing protected roots and the current logical root ID so repair cannot invalidate its own barrier. Ambiguous canonical state rejects; raw projection SQL is forbidden.
3. Call accepted Task 3 `deriveExternalJobs(ownerAccountId, state, targetAccountForKey)` with that exact argument order. Sort new candidates by `(scheduledAtS,priority,sourceAccountId,idempotencyKey)` before Store scheduling.
4. Reload Task 4 logical roots and compare the exact logical tuple. If a strictly earlier root appears, return its ID; the Store parks the current root. Never recursively execute another root.
5. Determine participants from canonical owner/ref/state at T; for PvP include valid held fleets only when `giuLuc <= T < giuDen_t`, stable target ownership matches, and the fleet is nonempty.
6. Advance the smallest account ID still needing local work to T with `G.tickNoiBo` and the exact unresolved durable fences. Save once through Task 4, rebuild projections, then restart at step 1.
7. Compute two different signatures. `convergenceSignature` covers canonical gameplay state needed for exact snapshot/result, participants, derived keys, next-due vector, and logical root, excluding projections/SQLite order and audit-only bytes. `semanticCycleSignature` covers the normalized next-work/eligibility graph: sorted account/entity/stable-ref ownership, event/fleet/missile phase and effective times, participant set, derived keys, and logical root, while explicitly excluding `dq.revision`, save sequence, row IDs unrelated to stable identity, lock/update/audit timestamps, and other monotonic persistence metadata. Do not omit any field read by classification/eligibility. Two identical convergence signatures with no due work converge; same semantic signature with due work stalls; any earlier nonterminal semantic signature, including A→B→A with revisions increasing, cycles.
8. Enforce exact scan bound `4 + 4 * initialCanonicalAccountCount + 4 * initialRemainingBudget`. Each scan must converge, park, consume at least one primitive, persist one previously unseen derived key/repair, or change semantic signature. Exceeding the bound is `BARRIER_FIXED_POINT_BOUND`; no snapshot/application follows.

Budget consumption counts every local primitive and the eventual external reducer primitive against the same batch-owned object. It does not recursively execute a newly discovered root: the Task 5 protocol harness commits/parks/blocks the current UoW, then opens the next accepted UoW for that root while retaining the batch budget object; Task 6's writer later owns that production loop. Exact 50,000 with nothing due is complete; 50,001 is partial. When partial, each completed canonical save and Task 4 successor/checkpoint is committed, but no global snapshot/application/effect/completion occurs. Resume rescans canonical state from the beginning, so no process-memory cursor is authoritative.

`preflightCutover` is a no-write deep-cloned in-memory execution of the same ordering/signature/bound rules for Task 9. It may read accepted Store rows but cannot call `world.luu`, seed initialization, projections, application, or scheduling. It validates nonnegative safe `cutoverAtS`/`effectiveNowMs`, live token, and exact shared budget; returns only `{processed,nextDueAtS,hasMoreDue}`.

- [ ] **Step 4: Seal Group B behavior GREEN**

Expected exact summary is `135/134/0/1`. Require exact legacy-call baseline plus one scheduler-service call, zero Task 5 cycles, frozen Task 3 imports/orders, signature negative corpus, scan-bound evidence, and all Group A gates.

## Task 4: Group C — total reducers, canonical-at-T effects, and Task 4 UoW integration

**Files:** Modify `tools/test-scheduler.js`; then create `server/scheduler/reducers.js` and make only required edits to `server/world.js` and `server/scheduler/store.js`.

- [ ] **Step 1: Append and seal these three surface tests**

| ID | Exact test title | Direct surface RED tag | Surface proof |
|---|---|---|---|
| C-S1 | `Task 5 reducer module exposes both frozen downstream exports` | `TASK5_SURFACE_REDUCER_MODULE` | Absent module only; shell exports exact keys `EventReducer`, same-identity imported `seed32`, and `resolveCanonicalGlobalInCurrentUow/4`; the Task 4/6 destructuring import loads without an adapter. |
| C-S2 | `Task 5 reducer prototype exposes every frozen method` | `TASK5_SURFACE_REDUCER_PROTOTYPE` | Absent module only; shell has exact constructor/method arities. |
| C-S3 | `Task 5 world exposes exactly five reducer hook surfaces` | `TASK5_SURFACE_WORLD_REDUCER_HOOKS` | Before shell hooks/manifest entries are absent; after shell exactly five names/arities exist and no behavior is claimed. |

Seal C surface RED `138/134/3/1`. Create only runnable reducer and world-hook shells. Export an arity-four inert `resolveCanonicalGlobalInCurrentUow` beside `EventReducer`, without Store lifecycle behavior. Hook shells must retain Task 4 mutation guards and return inert receipts inside an active mutation; reducer shells return inert typed structures. Seal shell GREEN `138/137/0/1` plus all protected-world/body/static gates.

- [ ] **Step 2: Append these twenty-five behavior tests only after C shell GREEN**

| ID | Exact test title | Direct behavior RED tag | Required proof |
|---|---|---|---|
| C-B1 | `Task 5 reducer initialization delegates seed creation to Store only` | `TASK5_RED_REDUCER_SEED_DELEGATION` | Exact one call with lease/effectiveNow; no reducer/world randomness/SQL; outside-UoW Store rejection propagates. |
| C-B2 | `Task 5 ACCOUNT_ADVANCE returns only accepted success stale and missing codes` | `TASK5_RED_ACCOUNT_RESULT_CODES` | Match→`{code:'ACCOUNT_ADVANCED'}`/COMPLETED; stale→`{code:'STALE_REVISION'}`/CANCELLED; missing→`{code:'MATCH_INVALIDATED'}`/CANCELLED. |
| C-B3 | `Task 5 parent lifecycle alone checkpoints or blocks one partial account` | `TASK5_RED_ACCOUNT_BLOCK_LINKAGE` | Exercise both partial subcases with the same exact plain wrapper whose `Reflect.ownKeys` are `['checkpointRevision','saveReceipt']`. Mutating/deferred: instrument `world.luu`; `GameAdvanceService.advanceTo` calls it once, its self-flush fills safe revision R/increments canonical revision once, reducer adds zero world/save/lifecycle calls, strict `effect.saveReceipt === prepared.saveReceipt === prepared.advanceResult.saveReceipt`, and `effect.checkpointRevision === effect.saveReceipt.revision === R`; the marked parent calls exactly one of checkpoint(R) or block(R,D). Established-zero due-work: in the already-active parent mutation require `processed===0`, `budgetExhausted===true`, `hasMoreDue===true`, `remainingBudget.value===0`, and `prepared.saveReceipt===effect.saveReceipt===null`; the wrapper still has exactly both keys with `effect.checkpointRevision===null`, its conditional construction never dereferences null, and the branch makes zero additional lifecycle/world/canonical writes. The previously adopted row remains byte-identical `RUNNING` with the same non-null lock owner/generation/expiry for later Task 6 retain/adopt; it calls neither checkpoint nor block. Unsupported unmarked harness entry still rejects before reducer/service. |
| C-B4 | `Task 5 blocked ACCOUNT_ADVANCE rolls back and resumes only after proved application` | `TASK5_RED_ACCOUNT_BLOCK_RELEASE` | No unlinked/RUNNING deferred continuation exists. Failures including generation flip restore every table/lease; restart cannot claim blocked row; only Task 4 application-backed terminal/replay release clears D, refreshes checkpoint revision, then claim/resume succeeds. |
| C-B5 | `Task 5 PvP snapshot commits every canonical change through T immutably` | `TASK5_RED_PVP_CANONICAL_AT_T` | Pre/at-T changes enter; participants are exactly T. A later direct canonical mutation may affect future work but cannot change committed snapshot/application/effects. No post-barrier public-admission claim is made; MutationGate exclusion belongs to Task 6. |
| C-B6 | `Task 5 later same-T hold stays external and outside the current PvP snapshot` | `TASK5_RED_PVP_SAME_T_ORDER` | Later logical HOLD remains outbound until its root and absent from earlier attack snapshot. |
| C-B7 | `Task 5 PvP restart preserves snapshot seed result and every effect` | `TASK5_RED_PVP_RESTART_DETERMINISM` | Reopen/retry identical input yields byte-identical snapshot/hash/result/effects, one application/effect set. |
| C-B8 | `Task 5 PvP quantitatively conserves units loot capacity and debris` | `TASK5_RED_PVP_QUANTITATIVE_CONSERVATION` | Per unit type before = survivors + destroyed; per resource defender-before + attacker-cargo-before = defender-after + return-cargo-after; loot is nonnegative and capacity/availability bounded; debris delta equals exact rules formula from destroyed metal/crystal costs; all integers/nonnegative. |
| C-B9 | `Task 5 transport conserves resources cargo and one returning fleet` | `TASK5_RED_TRANSPORT_CONSERVATION` | Exact per-resource equation, one delivery/return, no negative/capacity breach, replay inert. |
| C-B10 | `Task 5 spy resolves one deterministic report at effective T` | `TASK5_RED_SPY_EFFECTIVE_T` | One deterministic T-stamped report/notification; replay inert. |
| C-B11 | `Task 5 hold charges and schedules canonical orbital timing once` | `TASK5_RED_HOLD_TIMING` | First v1 segment only, canonical T fields, nonnegative later segments/return, once. |
| C-B12 | `Task 5 missile applies deterministic damage and removal once` | `TASK5_RED_MISSILE_EFFECT` | Deterministic T damage/report/removal once across restart. |
| C-B13 | `Task 5 every reducer scenario maps to one exact accepted result and neutralization` | `TASK5_RED_RESULT_MAPPING` | Exercise every row of the closed mapping below, including all four full-shape operator neutralizations; applied effect neutralization must equal application neutralization. No fallback, `TARGET_REMOVED`, or invented code/status. |
| C-B14 | `Task 5 payload snapshot and canonical context corruption fail closed` | `TASK5_RED_REDUCER_INTEGRITY` | Schema/hash/ref/match/revision/target/supporter/seed/result corruption rejects before effect with accepted retry/quarantine classification. |
| C-B15 | `Task 5 fault matrix rolls scheduler lease application effect save and completion together` | `TASK5_RED_FAULT_MATRIX_ROLLBACK` | Every listed injection and generation flip restores every listed SQLite table including `scheduler_lease`, plus all in-memory batch/context state except the shared budget, byte-for-byte. The non-transactional budget is not refunded: for every boundary assert the exact `L+G` attempted-consumption delta from the table below, no compensating decrement/refund, and no duplicate charge on committed-application replay. |
| C-B16 | `Task 5 post-commit restart cannot duplicate any external effect` | `TASK5_RED_POST_COMMIT_IDEMPOTENCY` | Recovery validates existing application and adds zero second combat/resource/report/debris/cooldown/successor effects. |
| C-B17 | `Task 5 reducers join Task 4 finalizers and coalesce participant saves` | `TASK5_RED_TASK4_UOW_FINALIZERS` | Owning/joined UoWs avoid nested BEGIN. In the nonnull partial-account fixture, `advanceTo` alone calls/stages `world.luu` exactly once; that World call self-flushes inside the caller-owned UoW, fills its receipt, and increments `dq.revision` once before return. Reducer apply makes zero save/stage/coalesce calls and returns the exact two-key nullable wrapper around that identical receipt; no post-apply flush occurs. The established-zero companion returns the same two wrapper keys with both values null and performs no flush/finalizer/canonical write, leaving the adopted RUNNING lock untouched. A completed-account apply returns only its already-produced receipt as the frozen prepared ABI requires. Global reducers may stage their required participant saves through their world hooks; each hook owns its World batch/self-flush, and Task 4 coalesces repeated same-account saves within that batch. All nonnull receipts finalize before their reducer/lifecycle consumers, and final-fence generation loss rolls all SQLite state back while retaining the exact attempted budget delta. |
| C-B18 | `Task 5 every gameplay timestamp derives from effective T` | `TASK5_RED_EFFECTIVE_TIME` | Application, combat, bulletin, messages, loot/debris, cooldown/return/successors use T; wall clock variation is inert. |
| C-B19 | `Task 5 recovered latest state result has exactly five validated keys` | `TASK5_RED_RECOVERED_FIVE_KEYS` | Exactly `{code:'RECOVERED_LATEST_STATE',recoveredAtCutover:true,recovery:'recovered-latest-state',originalScheduledAtS,recoveredAtS}`; safe time/order checks; ordinary replay never calls it. |
| C-B20 | `Task 5 local and global reducers share the exact final budget unit` | `TASK5_RED_COMBINED_SHARED_BUDGET` | With one batch object across sequential accepted UoWs, 49,999 local commits/blocks then a new global application consumes unit 50,000; 50,000 local commits/blocks with zero remaining leaves an unapplied global due next batch. ACCOUNT_ADVANCE gets no extra charge. No recursive execution, 50,001st charge, or reset. |
| C-B21 | `Task 5 reducer dispatches every external family through its exact world hook` | `TASK5_RED_WORLD_HOOK_DISPATCH` | Through `EventReducer`, PvP/transport/spy/hold/missile dispatch exactly once to the matching hook with the frozen ref, exact T, family-specific seed/snapshot/target arguments, and returned receipt/effect. Shell guard surfaces alone cannot pass because shell implements no dispatch. |
| C-B22 | `Task 5 module topology preserves legacy bridges and exact new authorities` | `TASK5_RED_STATIC_TOPOLOGY` | Exact exports/imports/no cycles; accepted legacy tick sites unchanged plus one service tick; one HMAC; Store-only application/seed; exact five hooks; app/factory deferral explicit. |
| C-B23 | `Task 5 global charging and committed-application replay are exactly idempotent` | `TASK5_RED_GLOBAL_BUDGET_IDEMPOTENCY` | New PVP/EXTERNAL application charges exactly one after its barrier; ACCOUNT_ADVANCE never gets an extra charge. An already committed global still calls `prepare`, charges zero, calls `insertApplication` to validate exact replay, skips `applyPrepared`/world effect, and performs one idempotent matching terminal transition/release. |
| C-B24 | `Task 5 canonical global helper remains downstream-compatible and resolves operator invalidation` | `TASK5_RED_CANONICAL_GLOBAL_HELPER` | Destructure the frozen exports exactly as Task 4/6 do. Exercise default/explicit lock, omitted options, strict quarantine flag, detail forwarding, optional hook, and invalid context/token/time/budget/job/reason/options rejection. For `OPERATOR_CONFIRMED_INVALID`, prove claim/brand, prepare, conditional one charge, one helper-owned durable mark, insert/replay validation, effect-or-skip, neutralization equality, finish/release order, exact return, restart idempotency, lease-inclusive SQLite rollback, and the helper rows of the non-refundable attempted-budget table. |
| C-B25 | `Task 5 every world reducer hook rejects direct and inactive mutation execution` | `TASK5_RED_WORLD_HOOK_CONTEXT` | Separately invoke each of all five hooks directly and without the active identical Task 4 mutation; each rejects before state/effect. Then call each valid family fixture inside the active matching mutation and require its non-inert family receipt/state delta. Shell guards plus inert returns cannot pass; this remains separate from C-B21's reducer-to-hook dispatch proof. |

Seal behavior RED `163/137/25/1`; all modules/shells load, the 32 earlier tests remain green, and every reducer test reaches its direct semantic boundary.

- [ ] **Step 3: Implement Group C behavior minimally**

`EventReducer.initializeCombatSeed` contains no randomness or SQL; it calls only `store.getOrCreateCombatSeedKey(leaseToken,effectiveNowMs)` and returns that key. `EventReducer.prepare` is total over accepted executable kinds:

- `ACCOUNT_ADVANCE` compares `checkpoint_revision ?? expected_revision` with canonical `dq.revision`. Only a validated reconcile wake with `expected_revision === -1`, exact reconcile payload/key, and no checkpoint may adopt current revision. It calls `advanceTo` once, and `GameAdvanceService.advanceTo` is the sole owner of this account execution's `world.luu` call and save staging. With no pre-existing World batch, that call opens/closes its own World batch while its SQL joins the existing immediate UoW; before it returns, a mutating partial/deferred `advanceResult.saveReceipt` is already filled with one safe canonical revision. `prepare` copies the exact nullable value without cloning as `prepared.saveReceipt === prepared.advanceResult.saveReceipt`. For every `kind:'partial'`, its account `apply` closure performs no world call/save/stage/coalesce and returns exactly `{checkpointRevision:receipt && receipt.revision,saveReceipt:receipt}` with no third key. A nonnull receipt is mandatory for a mutating/deferred partial. The sole null case is established-zero due-work with exact `processed===0`, `budgetExhausted===true`, `hasMoreDue===true`, and shared budget zero; it must not dereference the receipt or make a canonical/lifecycle write. For completed `kind:'prepared'`, apply returns only the exact already-produced receipt (or exact `null` for a proved zero-mutation outcome) as the parent frozen ABI requires. No path fabricates/clones a receipt or performs a post-apply batch flush. Neither reducer method contains or directly invokes `world.luu`, `markDurableMutation`, `checkpointPartial`, `blockOwnedAccountAdvance`, application insertion, or terminalization; `prepare`'s sole `advanceTo` delegation is the account save source. Complete classifications use exact accepted codes. Global reducers remain separately authorized to stage their own required participant saves through their exact world hooks.
- `PVP_RESOLVE` calls accepted `canonicalExternalStatus(kho,ref)` with that exact argument order, validates schema/stable identity, re-resolves canonical defender ownership at T, confirms Task 3 `derivePvpMatchId`, builds the immutable v1 snapshot after the barrier, and returns exact `PVP_RESOLVED` or an accepted application-backed invalidation.
- `EXTERNAL_RESOLVE` uses the same exact canonical status boundary and dispatches only `transport`, `spy`, `hold`, or `missile` to one explicit prepare path. It returns exact `EXTERNAL_RESOLVED` or an accepted invalidation. Cross-player deploy remains local and has no external reducer.
- Unknown kind/schema/ref/mission is `PAYLOAD_INTEGRITY`; it is not silently cancelled or executed.

The result mapping is closed and exact:

| Scenario | Exact result | Terminal mapping/effect |
|---|---|---|
| matching account revision complete | `{code:'ACCOUNT_ADVANCED'}` | COMPLETED; no neutralization |
| stale account revision | `{code:'STALE_REVISION'}` | CANCELLED reason `STALE_REVISION`; no neutralization |
| missing account aggregate | `{code:'MATCH_INVALIDATED'}` | CANCELLED reason `MATCH_INVALIDATED`; no neutralization |
| valid PvP / valid non-PvP external | `{code:'PVP_RESOLVED'}` / `{code:'EXTERNAL_RESOLVED'}` | COMPLETED; exact typed effect |
| stable canonical entity already absent | `{code:'MATCH_INVALIDATED',invalidation:'canonical',neutralization:'ALREADY_ABSENT'}` | application-backed CANCELLED `MATCH_INVALIDATED`; no-op proof |
| fleet target becomes self/NPC/empty/invalid while stable fleet exists | `{code:'MATCH_INVALIDATED',invalidation:'canonical',neutralization:'RETURNED'}` | application-backed CANCELLED; exact one return |
| missile target becomes self/NPC/empty/invalid while stable missile exists | `{code:'MATCH_INVALIDATED',invalidation:'canonical',neutralization:'MISSILE_REMOVED'}` | application-backed CANCELLED; exact one removal |
| stable ref points to mismatched/replaced entity | `{code:'MATCH_INVALIDATED',invalidation:'canonical',neutralization:'REF_MISMATCH'}` | application-backed CANCELLED; no effect on replacement |
| Task 4 exact inbound target deletion with captured matching target key | `{code:'ENTITY_REMOVED'}` | application-backed CANCELLED reason `ENTITY_REMOVED`; Task 5 ordinary reducers never synthesize it |
| Task 4 outbound deleted-source status `ALREADY_ABSENT` | `{code:'ENTITY_REMOVED',invalidation:'canonical',neutralization:'ALREADY_ABSENT'}` | application-backed CANCELLED reason `ENTITY_REMOVED`; no-op proof |
| Task 4 outbound deleted-source status `REF_MISMATCH` | `{code:'ENTITY_REMOVED',invalidation:'canonical',neutralization:'REF_MISMATCH'}` | application-backed CANCELLED reason `ENTITY_REMOVED`; replacement untouched |
| operator-confirmed live outbound fleet | `{code:'OPERATOR_CONFIRMED_INVALID',invalidation:'canonical',neutralization:'RETURNED'}` | application-backed CANCELLED reason `OPERATOR_CONFIRMED_INVALID`; apply returns the same `RETURNED` |
| operator-confirmed live missile | `{code:'OPERATOR_CONFIRMED_INVALID',invalidation:'canonical',neutralization:'MISSILE_REMOVED'}` | application-backed CANCELLED reason `OPERATOR_CONFIRMED_INVALID`; apply returns the same `MISSILE_REMOVED` |
| operator-confirmed already absent entity | `{code:'OPERATOR_CONFIRMED_INVALID',invalidation:'canonical',neutralization:'ALREADY_ABSENT'}` | application-backed CANCELLED reason `OPERATOR_CONFIRMED_INVALID`; apply proves the same no-op |
| operator-confirmed stable-ref mismatch | `{code:'OPERATOR_CONFIRMED_INVALID',invalidation:'canonical',neutralization:'REF_MISMATCH'}` | application-backed CANCELLED reason `OPERATOR_CONFIRMED_INVALID`; replacement untouched and apply returns the same `REF_MISMATCH` |

Only `RETURNED`, `MISSILE_REMOVED`, `ALREADY_ABSENT`, or `REF_MISMATCH` are valid neutralization values. Account invalidations are exact one-key results. There is no “as applicable” branch. `prepareRecoveredLatestState` is reserved for Task 9's validated cutover executable and returns exactly five keys: `code`, `recoveredAtCutover`, `recovery`, `originalScheduledAtS`, and `recoveredAtS`; ordinary restart/replay never calls it.

Every reducer receives a Store-loaded, verifier-approved executable, never a raw row. `prepare` classifies and constructs closures. For partial `ACCOUNT_ADVANCE`, `applyPrepared` returns the exact two-key nullable wrapper `{checkpointRevision:receipt && receipt.revision,saveReceipt:receipt}`. A nonnull effect preserves strict identity with the already-filled `advanceTo` receipt; established-zero returns `{checkpointRevision:null,saveReceipt:null}` without dereference. Completed account work returns the exact pre-existing receipt/null required by the separate frozen parent prepared contract. All account paths invoke no world effect or save. For a global reducer, `applyPrepared` invokes exactly one captured synchronous family world effect, which may stage and self-flush the participant saves required by that global result, and returns its receipt/effect. Neither reducer method opens a transaction, marks durable state, inserts/reads an application, terminalizes, checkpoints, blocks/releases dependents, allocates/resets/decrements budget, calls wall time, independently saves an account, or flushes a World batch after apply. Static spies and negative-corpus scans enforce zero calls to `world.luu`, `world.batDau`, `world.ketThuc`, `markDurableMutation`, `checkpointPartial`, `blockOwnedAccountAdvance`, `insertApplication`, `completeAccountAdvanceAndScheduleSuccessor`, `completeApplied`, `finishResolved`, or `releaseBlockedAccountDependents` from the account reducer path; global world-hook dispatch is the sole reducer-owned exception to staging participant saves.

The protocol-valid downstream Task 6 claimed-job order, simulated by the Task 5 harness and exercised by the fault matrix, is exact:

1. Open accepted `BEGIN IMMEDIATE`, establish live mutation token and `world.trongMutationScheduler`, assert lease, and Store-load/verify the executable.
2. The lifecycle owner calls `markDurableMutationInCurrentUow(mutation,nowMs)` exactly once before any barrier, reducer prepare, or staged save. Its accepted Store call makes `durable_first_mutation_at_ms` part of every committed partial/full mutation; rollback removes it together with all other changes.
3. For a global job, run `advanceBarrier`; stop/park on partial/preceding root. Determine `alreadyCommitted = store.hasCommittedApplication(...)`. If false, require/decrement exactly one external primitive; if true, decrement zero. `ACCOUNT_ADVANCE` is never extra-charged because its local primitives are counted by `G.tick`.
4. Call `reducer.prepare` for every executable that reaches classification, including a global with an already committed application. The only exception is an unapplied global with zero remaining budget, which returns a barrier partial before executing its primitive.
5. For account `kind:'partial'`, call `reducer.applyPrepared` once and require a plain object with exactly the two own string keys `checkpointRevision` then `saveReceipt`, constructed as `{checkpointRevision:receipt && receipt.revision,saveReceipt:receipt}`. If `effect.saveReceipt !== null`, `advanceTo` has already completed its sole World self-flush, strict `effect.saveReceipt === prepared.saveReceipt === prepared.advanceResult.saveReceipt`, and `effect.checkpointRevision === effect.saveReceipt.revision`; the lifecycle owner calls exactly one: `blockOwnedAccountAdvance(token,job,effect.checkpointRevision,prepared.advanceResult.blockedExternalJobId,nowMs)` when deferred, otherwise `checkpointPartial(token,job,effect.checkpointRevision,nowMs)`. If the effect is `{checkpointRevision:null,saveReceipt:null}`, require exact established-zero due-work (`processed===0`, `budgetExhausted===true`, `hasMoreDue===true`, shared budget zero): do not dereference it and call no checkpoint, block, application, terminal, world, save, or new marker operation. Preserve the already-adopted job byte-for-byte as `RUNNING` with its same non-null lock tuple for Task 6's later retain/adopt continuation. Neither branch performs a post-apply flush; no unlinked continuation exists.
6. For `kind:'prepared'`, call Store `insertApplication` even when `alreadyCommitted` so immutable bytes are revalidated. If `application.alreadyApplied===false`, call `applyPrepared` once; if true, skip it and every world effect. For an account, `advanceTo` already self-flushed its save and a non-skipped completed apply returns only the exact receipt/null from that result; no later batch flush exists. For a global, the exact world hook owns and self-flushes/coalesces its required participant saves before returning its effect. Then call exactly one matching terminal path: `finishResolved`, `completeAccountAdvanceAndScheduleSuccessor`, or `completeApplied`. Existing-application recovery performs zero second charge/effect and one idempotent terminalization; Store-owned completion/replay logic releases dependencies exactly once.
7. Task 4 save/create/delete synchronization happens only when its owning World operation closes its own World batch; its SQL joins the caller-owned SQLite UoW and registers or executes the accepted final fence. The outer lifecycle performs no manual/post-apply World flush; it refreshes the lease as required and commits once. No durable write follows the actual final fence.

Task 6 owns `markDurableMutationInCurrentUow` and the writer loop/MutationGate. Task 5 does not create/edit `writer.js` or create a second production claimed-job lifecycle; its marked protocol harness proves downstream compatibility. Task 6 owns post-barrier command exclusion. Task 7 only routes public API/world/factory entry points through the already-real Task 6 gate.

`resolveCanonicalGlobalInCurrentUow` is the separate, exported, self-contained maintenance/deletion invalidation lifecycle, never called from Task 6 `executeClaimedInCurrentUow`. Inside its caller-owned immediate UoW it validates the exact context/options, calls `claimGlobalForInvalidation(leaseToken,jobId,nowMs,lockMs,{allowQuarantined:true,allowFuturePending:true,rootMustBeQuarantined:options.rootMustBeQuarantined===true})`, verifies the branded executable, and always calls `prepareCanonicalInvalidation(mutation,executable,reason,options.detail||null)` before replay decisions. It computes `alreadyCommitted = hasCommittedApplication`; only a false result requires/decrements one unit. It then calls Store `markDurableMutation` exactly once as this helper path's sole marker, calls `insertApplication` to create or validate the exact application, and invokes `afterApplicationForTest(executable,application)` when supplied. On a new application it calls `applyPrepared` and requires `effect.neutralization === prepared.application.result.neutralization`; on an existing application it skips effect and uses the already-validated prepared neutralization. Finally it calls `finishResolved(leaseToken,executable,'CANCELLED',prepared.cancelReason,nowMs)`; that protected Store path performs application-proved replay/dependent release, so the helper never calls release separately. It returns exactly the three-key result. Every error/generation flip rolls back `scheduler_lease` and the full SQLite matrix byte-for-byte, but retains the helper's exact zero-or-one attempted budget delta defined below. This order is conditional-charge → one mark → insert/replay validation → optional hook → effect-or-skip → neutralization equality → finish/release, with no duplicate owner.

World reducer hooks run only under the exact active matching Task 4 mutation context, use captured `effectiveAtS`, and return receipts. Every one of the five independently rejects direct and out-of-active-mutation execution before state access. They do not import Store, open transactions, call `G.tick`, use projections as canonical, or run application SQL. Add exactly these five names to `RULES_HOOK_METHODS`: `resolvePvpAt`, `resolveTransportAt`, `resolveSpyAt`, `resolveHoldAt`, `resolveMissileAt`. Add no other public prototype method.

PvP saves attacker, defender, supporters, debris, reports, `tran`, bulletin, loot, cooldowns, returns, and successors in the same Task 4 batch. Snapshot revisions are post-normalization canonical revisions from that UoW. Enforce the C-B8 integer conservation equations and exact debris rules formula, not merely nonnegative output. A later direct canonical mutation cannot rewrite already committed snapshot/application/effect bytes; Task 5 does not claim public admission exclusion after the barrier, which belongs to Task 6 MutationGate. Task 7 only performs public API/world/factory routing. Transport preserves resource+cargo conservation and returns the original fleet once. Spy and missile randomness is deterministic from stable identity and T. Hold uses the accepted v1 first-segment contract and leaves later segment handling local. Missing/mismatched entities are neutralized exactly once according to the closed table, and every cancellation effect's neutralization equals its application result.

The fault matrix snapshots these tables in stable primary-key order before each injection and after rollback: `scheduler_lease`, `cauhinh`, `dq`, `ht`, `hamdang`, `hamgiu`, `npc`, `pl`, `bangtin`, `tran`, `scheduler_meta`, `event_jobs`, `event_applications`, and `scheduler_audit`. Injections are before/after seed, after parent/helper durable mark, before/after new or replay-validation application insertion, before and after the account `advanceTo` save self-flush or global-hook effect/self-flush, before and after parent checkpoint/block, after Task 4 save/create/delete synchronization, at the helper's frozen `afterApplicationForTest`, after completion-before-COMMIT, and generation flip before every final fence. Every SQLite rowset, including lease owner/generation/expiry and `durable_first_mutation_at_ms`, plus in-memory batch/context state other than `remainingBudget`, must be byte-identical. Generation flip is performed inside the owning test transaction/proxy so rollback restores the original lease. A claim omitting a table/fault is invalid. Other injections use test-only wrappers/proxies restored in `finally`; no production fault seam other than the parent-required helper option is added.

`mutation.remainingBudget` is a drain-owned JavaScript object, not transactional state. Define `L` as the exact count of local/barrier primitives whose decrements occurred before the injected fault, and `G` as `1` only when the conditional charge for a new global application occurred before that fault, otherwise `0`. The fixture records the object identity and entry value, instruments every decrement, and requires `entryValue - exitValue === L + G`; rollback never increments/refunds it. The exact boundary matrix is:

| Fault boundary | `L` | `G` | Required attempted-consumption delta |
|---|---:|---:|---:|
| before/after seed; after parent durable mark but before account advance/global barrier | 0 | 0 | 0 |
| established-zero account due-work classification/wrapper/retain branch | 0 | 0 | 0; budget remains exactly zero and the RUNNING lock/canonical rows remain unchanged |
| after the nth account-local or global-barrier primitive, before a new-global charge | n | 0 | n |
| account after `advanceTo`'s save self-flush, partial wrapper/completed receipt apply, checkpoint/block, completion, synchronization, or final fence | exact local decrement count n | 0 | n |
| new global after its conditional charge, application insert, world effect, participant save flush, completion, synchronization, or final fence | exact preceding barrier-local count n | 1 | n + 1 |
| committed-global replay validation/effect-skip at any later boundary | exact preceding barrier-local count n | 0 | n |
| helper before its conditional charge | 0 | 0 | 0 |
| new-application helper after charge through insert/hook/effect/finish/final fence | 0 | 1 | 1 |
| committed-application helper replay at every boundary | 0 | 0 | 0 |

The same row applies to a generation flip at that boundary. The failed Task 6 drain records this attempted delta and retires the object; it does not restore it from SQLite before reporting failure. A later retry uses Task 6's fresh drain budget and charges only primitives actually attempted in that new drain. If it observes a committed application, its global replay charge is exactly zero; if the prior application rolled back, one charge in the new attempt is legitimate, but no attempt may compensate, refund, or double-decrement. This is the parent Task 6 failure-accounting contract, and C-B15 must prove both the lease-inclusive SQLite before-image and these non-refundable deltas.

- [ ] **Step 4: Seal Group C behavior GREEN**

Expected exact summary is `163/162/0/1`. Repeat under `node --throw-deprecation`. Seal TAP hashes and rerun every surface/behavior manifest, prefix/suffix, capability/import/topology, HMAC, SQL-owner, lifecycle-zero-call/helper-export, result-map, fixed-point, budget, blocked-account, and rollback gate.

## Task 5: Deterministic static and aggregate verification

- [ ] **Step 1: Run direct gates**

All of these must exit zero:

```bash
set -Eeuo pipefail
node --test-reporter=tap tools/test-scheduler.js >"$task5_tmp/final.tap" 2>&1
node "$task5_tmp/task5-tap-verify.cjs" green final "$task5_tmp/final.tap"
node --throw-deprecation --test-reporter=tap tools/test-scheduler.js \
  >"$task5_tmp/final-deprecation.tap" 2>&1
node "$task5_tmp/task5-tap-verify.cjs" green final "$task5_tmp/final-deprecation.tap"
node tools/test-uow.js
node tools/lint.js
node --check server/scheduler/combat-snapshot.js
node --check server/scheduler/advance-service.js
node --check server/scheduler/reducers.js
node --check server/scheduler/store.js
node --check server/world.js
git diff --check -- server/scheduler/combat-snapshot.js \
  server/scheduler/advance-service.js server/scheduler/reducers.js \
  server/scheduler/store.js server/world.js tools/test-scheduler.js
```

The final TAP must be exactly 163 tests, 162 pass, zero fail, one established sandbox skip. Do not count the skip as a pass or hide a new skip.

- [ ] **Step 2: Run parser-based static ownership gates**

Use a Node lexical scanner that skips comments, strings, regex literals, and template raw text but recursively scans template expressions. It must inspect every `server/**/*.js` file and prove:

- The balanced bodies and lexical call-site multiset for every accepted legacy `G.tick(` occurrence in `server/world.js` equal the sealed baseline; `server/app.js` remains exact SHA/lines/bytes above. Exactly one additional scheduler call occurs in `server/scheduler/advance-service.js`; no other new module or reducer hook calls it. The scanner must not require legacy call sites to disappear.
- `createHmac('sha256', ...)` and `readUInt32BE(0)` each occur once in production and only in `combat-snapshot.js`.
- `INSERT INTO event_applications` and job completion/cancellation SQL remain only in `store.js`.
- The `combat_seed_key_v1` INSERT occurs once and only in Store; reducers only call `getOrCreateCombatSeedKey`.
- Only Store's accepted `loadExecutableJob` final return registers a private Store-instance WeakSet brand; only `assertCanonicalExecutable/3` reads membership. No exported/object-carried brand, structural fallback, alternate execution loader, or audit/replayable branding exists. Stripping the exact authorized delta restores the sealed accepted loader token stream.
- Store imports snapshot validation, reducers import the same builder/seed function, and neither defines an alias implementation.
- `advance-service.js` imports exact accepted Task 3 helpers and calls `deriveExternalJobs(ownerAccountId,state,targetAccountForKey)` and `jobFromRef(ref,targetAccountForKey)` with the frozen orders.
- `GameAdvanceService.advanceTo` is the sole account-save/stage owner: account reducer branches contain no `world.luu` call, save operation, coalescing operation, or batch flush. Partial reducer apply returns only the exact nullable two-key `{checkpointRevision:receipt && receipt.revision,saveReceipt:receipt}` parent wrapper; completed apply returns the exact receipt/null required by its separate parent contract. Dynamic C-B3/C-B17 instrumentation proves the mutating fixture's one `world.luu` call originates in `advanceTo`, self-flushes and fills/revisions the receipt once before return, remains one after reducer apply, and preserves strict wrapper-to-receipt identity. The established-zero fixture proves both wrapper values null without dereference, zero new lifecycle/world/canonical writes, zero budget, and an unchanged adopted RUNNING lock. Global family hooks remain allowed to stage/self-flush their own participants.
- Advance/reducer boundaries invoke `assertCanonicalExecutable` before payload/state reads. Separate convergence/cycle signature builders exist; the cycle builder's lexical read set excludes revision/lock/update/audit/sequence metadata and includes every classifier eligibility field. The scan-bound expression is exact and cannot be disabled or coerced.
- No Task 5 module imports `server/world.js`; world imports no Task 5 Store internals. The CommonJS graph over Store/events/rules/world/advance/reducers/snapshot is acyclic.
- `reducers.js` exports exactly `EventReducer`, same-identity snapshot `seed32`, and `resolveCanonicalGlobalInCurrentUow/4`; the downstream Task 4/6 destructuring import succeeds and no second HMAC exists. The helper alone contains its one Store-owned invalidation lifecycle in the frozen conditional-charge/mark/insert/effect-or-skip/finish order.
- `RULES_HOOK_METHODS` has the accepted Task 4 names plus exactly the five Task 5 reducer hooks, with no private helper.
- The protected accepted `markDurableMutation/2`, `checkpointPartial/4`, `blockOwnedAccountAdvance/5`, `completeAccountAdvanceAndScheduleSuccessor/4`, `completeApplied/3`, `finishResolved/5`, and `releaseBlockedAccountDependents/3` bodies/arities remain exact. `EventReducer.prepare`, `applyPrepared`, and world hooks call none of them. For a nonnull partial receipt only, the simulated/future Task 6 lifecycle consumes the exact two-key wrapper and calls exactly one checkpoint/block with `effect.checkpointRevision`, equal to the identical already-filled `effect.saveReceipt.revision`. For exact established-zero `{checkpointRevision:null,saveReceipt:null}`, it dereferences neither field, makes zero lifecycle call, and retains the existing RUNNING lock for later Task 6 adoption. Helper terminalization releases only through protected `finishResolved`.
- Every mutating supported harness path marks once before barrier/prepare/save and asserts committed `durable_first_mutation_at_ms`; no service/reducer owns the marker. Only a new global application consumes the additional unit; ACCOUNT_ADVANCE and existing-application terminal replay consume none. Reducer prepare still runs for committed replay, insert revalidates, effect is skipped, and terminalization matches. Fault rollback restores SQLite, never the drain-owned budget: the scanner/behavior manifest requires C-B15's exact `L+G` delta rows and forbids compensation/refund code.
- Every Task 5 `OPERATOR_CONFIRMED_INVALID` preparation has exactly `code`, `invalidation:'canonical'`, and one proved allowed `neutralization`; no Task 5 reducer/helper creates the legacy one-key operator shape. Every applied cancellation receipt equals the application neutralization.
- Task 5 modules and the five reducer-hook bodies do not contain `TARGET_REMOVED`, `Math.random`, `Date.now`, transaction SQL, raw projection membership, or a second application lifecycle. Existing transaction ownership remains allowlisted only in accepted `server/db.js`; unrelated legacy world randomness is outside reducer execution and must remain unchanged.

The scanner must fail on a disposable negative corpus containing whitespace-separated calls, computed properties, aliased imports, dynamic `require`, template expressions, dead branches, and comments that resemble allowed code. A regex-only `rg` count is supplementary, not the gate.

- [ ] **Step 3: Run aggregate commands without masking environmental failures**

Run `npm test` and `node tools/check-syntax.js`, capturing status and complete stdout/stderr without a pipeline. A zero result passes. A nonzero result is acceptable only if a parser proves the exact already-accepted environment fingerprint and no additional failure:

- `npm test`: 201 smoke checks complete, then the sole failure marker `SERVER KHÔNG LÊN:`; no assertion failure, stack, extra `KHÔNG`, or new `/tmp/thdc-test-*.db` row.
- `node tools/check-syntax.js`: derive the expected file list from the accepted 43-path baseline plus exactly the three new Task 5 modules. In the current restricted sandbox the final transcript is therefore exactly 46 one-per-path `EPERM` spawn failures, with no `EACCES`, syntax/module/runtime failure, duplicate, missing path, or extra line. In an environment where spawning is permitted, the command must instead pass outright.

Snapshot exact `/tmp/thdc-test-*.db` regular-file rows before and after `npm test`. If a new exact regular file was created, remove only that new name after lstat, ownership, and pattern checks; never remove a pre-existing file, symlink, directory, or glob expansion. Recompare the snapshot. Record environmental results as blockers, never GREEN tests.

- [ ] **Step 4: Re-run the full functional suite once more**

After aggregate probes and any permitted exact fixture cleanup, rerun the exact `163/162/0/1` suite and deprecation suite. This catches leaked module cache, timer, database, or global `G.HOOK` state. Test fixtures must restore `require.cache`, hooks, fake clocks, world stacks, and timers in `finally`; no Task 5 module may depend on load order.

## Task 6: Closed-world verification, report, handoff, and dual review

- [ ] **Step 1: Compare pre-report protected state**

Using the same type-aware helper and exact allowlist:

- Verify the original 89-row lock and recorded digest, round-2 supplement, old-helper symlink RED, immutable round-2 helper/TDD/S01 evidence, round-3 delta/syntax/rejection/S02 evidence, runner/protocol/result seals, every meta-negative, and the exact 38-ID/44-invocation GREEN. Preserve the historical failed after captures and exact combined CJS EPERM `.out`/`.status`; require historical `.err` `ENOENT`. Exclusively create fresh raw `scope.after.pre-report.active` and `authority.after.pre-report.active`, retaining every field including `dev`; neither may pre-exist.
- Execute the full sealed `env -i` real-phase template for `pre-report`, producing new `scope.after.pre-report.projected` and `authority.after.pre-report.projected`. Require all three helper status/stdout/stderr contracts plus the phase-verifier contract, hash every status/stdout/stderr/projection artifact, and prove all four raw before/after manifest hashes unchanged.
- Run the corrected sealed scope comparator against raw `scope.before` and `scope.after.pre-report.projected`; require zero status and exactly the two path-ordered `MANAGED_MOUNT_DEV_ONLY` lines derived from the raw rows. Its comparison semantics remain byte-identical to the first version; no other row/field difference is accepted after the authenticated plan projection.
- `authority.after.pre-report.projected` must byte-equal raw `authority.before`. Compare raw path sets/orders as well; the sole raw authority difference must be the authenticated plan SHA/size transition proved by the helper.
- Physical `.git/index` and `git diff --cached --binary` must byte-equal their baselines.
- NUL-aware status outside the allowlist must byte-equal baseline.
- `/tmp` outside the exact `$task5_tmp` realpath must byte-equal `temp.before`.
- Every allowed target must be a regular file, never a symlink/hard-link substitution; the three modules must have been absent at baseline.
- The original 8232-line test prefix must retain the accepted Task 4 SHA; the suffix must contain exactly the 57 titled Task 5 tests in the sealed stage manifest.

Any mismatch stops. Do not delete, chmod, chown, stage, restore, or rewrite a foreign path to make a comparison pass.

- [ ] **Step 2: Create the Task 5 report last**

Create `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-5-report.md` with `apply_patch`. It must record:

- Exact Task 5 dispatch ID/plan SHA/lines/bytes and routing identity/roles.
- Both accepted envelope IDs/SHAs, nested reviewed-handoff SHAs, attestations, supersession rule for the Task 3 test row, and all validated live identities.
- Initial and final SHA/line/byte/mode/uid:gid for every allowed source/test path, without claiming the report's own final hash inside itself.
- Baseline `106/105/0/1`; all six immutable surface/behavior RED TAP identities, exact title/tag/direct-field maps, shell GREEN rows `109/108/0/1`, `120/119/0/1`, `138/137/0/1`, behavior GREEN rows `118/117/0/1`, `135/134/0/1`, and final `163/162/0/1`.
- The separate convergence/semantic-cycle signatures, revision-increment A→B→A evidence, scan bound, canonical projection repair/rejection, preflight and 50,001 boundaries, partial checkpoints, and unforgeable executable-only proof.
- Store-owned statement/post-write seed fences, one HMAC vector/owner, snapshot/context validation, restart determinism, and application authority.
- Exact closed reducer result/neutralization table including full operator shapes, five-field public AdvanceResult, five-key recovery result, quantitative conservation/timing evidence, reducer zero-lifecycle-call proof, `advanceTo`-owned one self-flushed account save with strict receipt identity/revision-once evidence, exact nullable partial `{checkpointRevision:receipt && receipt.revision,saveReceipt:receipt}` ABI and zero post-apply flush, nonnull one-checkpoint/block evidence, established-zero null/no-dereference/no-write/RUNNING-lock evidence, parent-owned mark/checkpoint/block, helper export/order compatibility, full SQLite rollback matrix including `scheduler_lease`, every non-refundable `L+G` attempted-budget row, post-commit idempotency, and Task 4 finalizer/UoW integration.
- Exact preservation of accepted legacy tick bridges and immutable `server/app.js`; Task 6 owns MutationGate exclusion, while Task 7 only performs public API/world/factory routing.
- Direct/static/aggregate command statuses, strictly classified environment blockers, and no hidden failure.
- Closed-world/status/index/cached/temp/authority evidence and the unexecuted commit intent `feat: add deterministic durable scheduler barriers and reducers`. Record the fixed prior plan identity, active dispatch identity, corrected transition-helper source SHA, preserved-evidence lock SHA, every self-test status/transcript SHA, complete raw before/active-after plan rows, projected plan rows, exact transition markers, raw/projection hashes, equal path count/set/order, exact plan metadata invariants, and byte equality of projected authority to raw authority-before. For scope also record both old and corrected comparator source SHAs, complete raw `.agents` and `.codex` rows/dev values, its exact two markers, byte equality of every raw-after line carried through projection except plan SHA/size, byte equality of every projected non-managed row to raw before, and every managed non-`dev` field. State explicitly that all raw manifests retained `dev`, historical failed captures were preserved, no before artifact was regenerated, and neither repository nor implementation allowlist was broadened.
- The original lock's recorded full SHA and exact 89 rows; the supplement SHA/inventory; preserved missing-helper RED; exact combined historical CJS EPERM `.out` SHA/bytes, `.status` SHA/bytes, and `.err` `ENOENT`; old-helper symlink RED; immutable round-2 helper/TDD/S01 hashes and r4 record; round-3 helper/delta/syntax/rejection/S02 hashes and active r5 record; absolute Node/Bash/`env`/S01-archive-`mv` identities; generator/driver/verifier hashes and syntax/static results; the sealed active handoff ID and exact eight-entry environment ABI; all eight D01/D02 and both S01/S02 status/stream/postcondition hashes; source/protocol/result seal hashes; exact 38 logical IDs and 44 invocation receipts; all five inventory and 12 static-policy meta-negative status/stdout/stderr hashes; the sole final outer-shell GREEN hash; and each real phase's exact helper/verifier status/stdout/stderr/output hashes. Record the S01 hard stop's exact `b197ed1ed0e9c7d44a8a16e0195574668635ef73cfae1567fcc992810fc024fd` / 1041 / 159714 provenance, continuation-supplement/archive-seal hashes, exact status/empty-stdout/error/projection-absence bytes, original/replacement stable-field and content equality, exact path topology, observed initial/final `ctimeNs` increase, the bounded rename-attribution inference, explicit absence of an S01 command/receipt transcript, and the fact that S02/matrix had not run before evidence preservation and archival. State that no historical `.err` or retroactive S01 transcript was created, every new stream remained separate, no race cleanup unlinked an unapproved inode, no old, unversioned, or round-2 helper was used for S02 or a forward phase, and neither CJS generator nor verifier spawned a process.

After the report write, run trailing-whitespace and 240-byte maximum-line checks over every allowed regular file, `git diff --check`, all closed-world comparisons, and the final functional/static gates again. Exclusively capture fresh raw `scope.after.post-report.active` and `authority.after.post-report.active`, then execute the full sealed `env -i` real-phase template for `post-report`; hash every raw capture and every helper/verifier status/stdout/stderr/output artifact. Do not edit the report to add this later evidence. A report edit after this point invalidates the handoff and requires all post-report gates again.

- [ ] **Step 3: Build one exact final handoff payload**

Exclusively capture fresh raw `scope.after.final.active` and `authority.after.final.active`, then execute the full sealed `env -i` real-phase template for `final`; require its scope/authority/phase checks and all original/supplement/helper/runner/protocol/result seals before regenerating `allowed.after`. Require exactly seven allowed regular-file rows: the six implementation/test paths and the report. Hash every pre-report/post-report/final raw capture and every helper/verifier status/stdout/stderr/output artifact. Write, under `$task5_tmp`, exactly:

```text
TASK5_CONTROLLER_HANDOFF_BEGIN
file <sha256> <decimal-mode> <bytes> <uid>:<gid> <path>
... six more canonical path-sorted file rows ...
test-summary 163 162 0 1
dispatch-transition-prior 4b46b79fc60d9bd154e76403a1164404177b32d6aef2c3415c458e3f5569ca7c 843 108633
dispatch-transition-active <active-dispatch-handoff-id> <active-dispatch-sha256> <active-dispatch-lines> <active-dispatch-bytes>
preserved-evidence <preserved-evidence-lock-sha256> 89 <round2-supplement-sha256>
historical-selftest <missing-helper-red-seal-sha256>
historical-cjs-eperm 7048473cbf2100272d4a950e25ba2c22cbdc0ab924dd1613562121f5f7a4c137 3461 4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865 2 1 err=ENOENT
round2-historical-helpers <transition-round2-source-sha256> <scope-round2-source-sha256> <round2-helper-tdd-seal-sha256> R4_S01_ONLY
round3-forward-helpers <transition-round3-source-sha256> <scope-round3-source-sha256> <round3-delta-proof-sha256> <round3-helper-tdd-seal-sha256> <round3-forward-helper-seal-sha256> R5_ACTIVE_ONLY
round3-runner <generator-source-sha256> <driver-source-sha256> <verifier-source-sha256> <runner-source-seal-sha256> <protocol-seal-sha256>
round3-dispatch-id <active-dispatch-handoff-id> assignments 8 negative-calls 8 <dispatch-id-negative-seal-sha256>
round2-s01-continuation b197ed1ed0e9c7d44a8a16e0195574668635ef73cfae1567fcc992810fc024fd 1041 159714 <s01-continuation-supplement-sha256> <s01-archive-seal-sha256> STATUS1 STDOUT_EMPTY TASK5_INPUT_IDENTITY_RACE PROJECTION_ENOENT S02_NOT_RUN MATRIX_NOT_RUN_AT_SEAL
race-negatives S01=round2 S02=round3 <race-negative-seal-sha256> NO_UNAPPROVED_UNLINK
round3-matrix 3 35 38 44 <driver-stdout-sha256> <driver-stderr-sha256> <driver-status-sha256> <result-seal-sha256> <meta-negative-seal-sha256> <green-transcript-sha256>
raw-after pre-report scope <raw-jsonl-sha256>
raw-after pre-report authority <raw-jsonl-sha256>
dispatch-transition pre-report scope <stdout-sha256> <stderr-sha256> <status-sha256> <projected-jsonl-sha256>
dispatch-transition pre-report authority <stdout-sha256> <stderr-sha256> <status-sha256> <projected-jsonl-sha256>
raw-after post-report scope <raw-jsonl-sha256>
raw-after post-report authority <raw-jsonl-sha256>
dispatch-transition post-report scope <stdout-sha256> <stderr-sha256> <status-sha256> <projected-jsonl-sha256>
dispatch-transition post-report authority <stdout-sha256> <stderr-sha256> <status-sha256> <projected-jsonl-sha256>
raw-after final scope <raw-jsonl-sha256>
raw-after final authority <raw-jsonl-sha256>
dispatch-transition final scope <stdout-sha256> <stderr-sha256> <status-sha256> <projected-jsonl-sha256>
dispatch-transition final authority <stdout-sha256> <stderr-sha256> <status-sha256> <projected-jsonl-sha256>
scope-compare pre-report <stdout-sha256> <stderr-sha256> <status-sha256> MANAGED_MOUNT_DEV_ONLY
scope-compare post-report <stdout-sha256> <stderr-sha256> <status-sha256> MANAGED_MOUNT_DEV_ONLY
scope-compare final <stdout-sha256> <stderr-sha256> <status-sha256> MANAGED_MOUNT_DEV_ONLY
phase-verify pre-report <stdout-sha256> <stderr-sha256> <status-sha256> TASK5_REAL_PHASE_OK
phase-verify post-report <stdout-sha256> <stderr-sha256> <status-sha256> TASK5_REAL_PHASE_OK
phase-verify final <stdout-sha256> <stderr-sha256> <status-sha256> TASK5_REAL_PHASE_OK
authority-compare pre-report EXACT
authority-compare post-report EXACT
authority-compare final EXACT
scope-managed-final MANAGED_MOUNT_DEV_ONLY {"path":".agents","beforeDev":<raw-before-number>,"afterDev":<raw-final-number>}
scope-managed-final MANAGED_MOUNT_DEV_ONLY {"path":".codex","beforeDev":<raw-before-number>,"afterDev":<raw-final-number>}
group-a-surface-red <tap-sha256> 109 105 3 1
group-a-behavior-red <tap-sha256> 118 108 9 1
group-b-surface-red <tap-sha256> 120 117 2 1
group-b-behavior-red <tap-sha256> 135 119 15 1
group-c-surface-red <tap-sha256> 138 134 3 1
group-c-behavior-red <tap-sha256> 163 137 25 1
routing 09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f 102 5732
task3-acceptance task3-accepted-35334d372202-20260824 08a5cbc3942e8a1dcd9b97260a24861214f8535faeaf480123472e1272dcafcc 35334d3722023665b11eab5c9bf32ee51d7b514e559fcc663198a75e887d3786
task4-acceptance task4-accepted-0710718826d3-20260824 d915c2b6720d877c72f005b964a71e9ec0575b9aad2ef718afe53a70462b24f6 0710718826d3e6bb6441c19d69982b266d18eb386bee21f432afdd6e09d5e894
TASK5_CONTROLLER_HANDOFF_END
```

All seven file rows, active dispatch fields, preservation/runner rows, transition hashes, comparison statuses, phase-verifier rows, and both managed-device rows are derived from sealed environment/artifacts, never typed manually. Transition and scope rows bind exact stdout/stderr/status plus projections; phase rows bind the non-spawning verifier's canonical record, empty stderr, and zero status; raw manifests remain separate immutable review evidence. `EXACT` authority rows are emitted only after verifier-owned byte comparison of projection to preserved raw before. Hash and line/byte count the payload. Both reviewers receive the exact same bytes and must echo the full payload and its SHA before approving.

- [ ] **Step 4: Obtain both mapped reviews**

1. Fresh `gpt-5.6-sol` at `xhigh`: behavior/logic/counterexample review. It replays all 57 tests and six RED causes, capability clone/reload lifecycle, separate fixed-point signatures/A→B→A/bound, preflight/combined/global idempotent budgets, parent-owned durable mark/checkpoint/block, `advanceTo` sole self-flushed account-save ownership, exact nullable partial wrapper ABI, nonnull strict receipt identity/revision-once/checkpoint-or-block order, established-zero null/no-dereference/no-write/RUNNING-lock retention, and zero post-apply flush, reducer zero-lifecycle calls, separate hook guards/dispatch, helper export/operator order, canonical-at-T/HMAC, exact result maps/five-field shapes, quantitative reducers, lease-inclusive SQLite faults with non-refundable `L+G` deltas, restart idempotency, and Task 4 finalizers.
2. Distinct fresh `gpt-5.6-sol` at `high`: scope/runtime/protocol review. It replays controller/envelope/dispatch/authority gates, surface-then-shell-then-semantic RED chronology, accepted prefix, seven-row allowlist, loader-delta/protected bodies, legacy bridge preservation/factory deferral, topology/commands/counts/environment, report rows, closed-world/status/index/cached/temp evidence, and scope. It receives preserved raw scope/authority before artifacts, every historical and fresh raw after, every projection, old/round-2/round-3 helper sources and TDD hashes, both dispatch records, the exact round-2-to-round-3 delta proof, original lock and supplement, the S01-continuation supplement/archive seal, generator/driver/verifier/protocol/result seals, all 44 bundles, dispatch-ID/race/meta-negatives, and all self-test/comparison transcripts. It independently verifies the exact historical combined `.out`/`.status` identities and `.err` absence; S01's exact hard-stop streams/projection absence, restored/held inode-content topology, stable fields, observed increasing `ctimeNs`, bounded attribution inference, explicit absence of a command/receipt transcript, absence of any pre-preservation S02/matrix execution, and no-replace/no-unapproved-unlink archival; byte-identical preservation and nonuse of round 2 after S01; the sole dispatch-record-literal delta in round 3 and exclusive round-3 use for S02/matrix/real/review gates; the exact active handoff ID and eight-assignment `env -i` ABI at every new boundary; all eight empty/wrong-ID rejections; normal accepted input `I===F0===F1===P`, S01 rejection at `I!==F0` without weakening the full tuple, output `OF===OP`, swap-open-restore rejection, and no-unapproved-unlink evidence; the exact fixed-prior to active-dispatch plan transition; sole plan-row SHA/size projection; exact 38-ID/44-invocation inventory; every status/stdout/stderr/output byte; exact authority equality after projection; exact path count/set/order; projected equality outside `.agents`/`.codex`; directory schema/all non-`dev` equality for those two; numeric raw device values/markers; and negative rejection of baseline regeneration, wrong identities, metadata/path/schema/alias drift, non-plan content, managed mode/type, and third-path device drift.

A reviewer finding returns to the corresponding test and requires a new RED cause if behavior changes, then all later GREEN/static/report/handoff gates. Immediately before each reviewer dispatch, exclusively capture fresh raw scope and authority manifests (`scope.after.pre-logic-review.active` / `authority.after.pre-logic-review.active`, then `scope.after.pre-scope-review.active` / `authority.after.pre-scope-review.active`) and execute the full sealed `env -i` real-phase template for its exact label. Attach all raw/helper/verifier status/stdout/stderr/output hashes to that review without changing the frozen report or handoff payload. Verify every original/supplement/helper/runner/protocol/result seal before and after each review. Do not edit this approved plan, acceptance records, or routing. Approval is valid only when both reviewers attest `APPROVED` to the same final handoff SHA and exact bytes.

- [ ] **Step 5: Controller capture and private cleanup**

The controller exports `TASK5_CONTROLLER_HANDOFF_CAPTURED_SHA256` equal to the final handoff SHA only after recording both approvals. Before accepting it, exclusively capture raw `scope.after.reviewers.active` and `authority.after.reviewers.active` and execute the full sealed `env -i` real-phase template for `reviewers`, again requiring only the authenticated plan transition plus two managed-root device exceptions. Verify all raw/helper/verifier status/stdout/stderr/output hashes, every original/supplement/helper/runner/protocol/result seal, and the captured handoff SHA. First `lstat` and unlink only the exact named deliberate symlink fixtures without following them; then delete only verified regular files and empty directories whose original absolute paths and realpaths are descendants of the exact nonsymlink `$task5_tmp`. Remove that directory, prove it absent, and compare `/tmp` outside it to `temp.before`. Never use a wildcard or recursive deletion.

## Final fail-fast checklist

- [ ] The immutable Task 5 dispatch and both controller acceptance envelopes were verified before RED.
- [ ] Task 3's historical shared-test row was superseded only by the exact accepted Task 4 row; every other signed row was live.
- [ ] Accepted baseline was exactly `106/105/0/1`, and the first 8232 test lines remained byte-identical.
- [ ] Each module group followed surface RED → shell GREEN → behavior RED → behavior GREEN with exact rows `109/105/3/1`, `109/108/0/1`, `118/108/9/1`, `118/117/0/1`, `120/117/2/1`, `120/119/0/1`, `135/119/15/1`, `135/134/0/1`, `138/134/3/1`, `138/137/0/1`, `163/137/25/1`, and `163/162/0/1`; no behavior RED was a missing-module/generic-shell failure.
- [ ] Final GREEN is exactly `163/162/0/1` in normal, deprecation, and post-aggregate runs.
- [ ] Only Store inserts applications and `combat_seed_key_v1`; both use statement lease fencing, and the key path has a post-write fence.
- [ ] One big-endian HMAC implementation, one snapshot schema/context authority, one unforgeable Store-instance executable brand, and one frozen interface set exist.
- [ ] Barriers accept only verified branded executables, repair projections from canonical state or reject explicitly, use separate convergence/cycle signatures with bounds, and retain earlier roots/watermarks.
- [ ] One shared 50,000 budget, global-only new-application charge, zero replay/account extra charge, non-refundable per-fault `L+G` attempted-consumption accounting, and parent-owned exact partial checkpoints preserve event 50,001 for the next batch.
- [ ] Reducers use the exact accepted result/neutralization map and effective T, quantitatively conserve game values, make zero lifecycle Store calls, and produce no duplicate effect; partial account apply returns exactly `{checkpointRevision:receipt && receipt.revision,saveReceipt:receipt}` with no World call/flush. Task 6 consumes nonnull `effect.checkpointRevision` once to checkpoint/block; exact established-zero null makes no lifecycle/canonical write and retains the locked RUNNING row for later adoption. The exported helper alone owns its compatible invalidation sequence.
- [ ] Task 4 owning/joined UoWs, global participant-save coalescing, account `advanceTo` sole self-flushed save/receipt identity and one revision increment, root protection, and final lease fence remain authoritative.
- [ ] The exact three-live/four-ENOENT seven-row baseline, both remediation-plan authorities, legacy server app/bridges, and every protected path are unchanged outside the authorized final rows.
- [ ] Every preserved/raw manifest and failed transcript survived byte-identically under the original exact 89-row `preserved-evidence.lock` and immutable round-2 supplement. Historical CJS `spawnSync EPERM` evidence remained exactly the combined 3461-byte `.out` and `1\n` `.status`, with `.err` still absent; every new invocation used separate streams. The S01 hard stop remained bound to exact plan `b197ed1ed0e9c7d44a8a16e0195574668635ef73cfae1567fcc992810fc024fd` / 1041 / 159714 and exact status 1/empty stdout/`TASK5_INPUT_IDENTITY_RACE\n`/projection absence; its immutable continuation supplement established restored-original/held-replacement stable metadata and content, exact topology, observed increasing `ctimeNs`, the bounded rename-attribution inference rather than nonexistent exclusive command proof, and that S02/matrix had not run. Its live coordination paths were archived by exact identity with no replace or unlink before S02. Old helpers remained sealed RED evidence; round-2 helpers/TDD/S01 and `dispatch-continuation-r4.txt` remained byte-identical historical evidence and were never used forward. Round-3 helpers differed only by the exact r4-to-r5 record-basename replacement, retained exact normal-input `I===F0===F1===P` including `ctimeNs` and output `OF===OP`, passed fresh syntax/symlink/hardlink TDD, rejected symlink/alias/swap races, and alone ran S02, D01/D02, all 44 matrix invocations, real phases, and reviews; S02 proved failure cleanup did not unlink a replacement. Every generator, driver, verifier, TDD, protocol, matrix, and real invocation used the exact eight-assignment `env -i` ABI; the active handoff ID byte-equaled the immutable r5 dispatch record, while all eight D01/D02 calls rejected empty/wrong IDs before output. The outer shell executed exactly 38 IDs/44 sealed helper CLIs, the non-spawning verifier checked every status/stdout/stderr/output byte and inventory/static/race meta-negative, and only then emitted `TASK5_TRANSITION_SELFTEST_GREEN positives=3 negatives=35`. The round-3 transition helper authenticated only fixed prior plan `4b46b79fc60d9bd154e76403a1164404177b32d6aef2c3415c458e3f5569ca7c` / 843 / 108633 to the active dispatch, preserved every plan metadata field, projected only plan SHA/size, and rejected every identity/metadata/path/schema/output/baseline-regeneration negative. Every pre-report, post-report, final, pre-review, and post-review scope/authority projection passed the round-3 downstream comparator; raw after captures differed from raw before only by the authenticated plan identity and exact `.agents.dev`/`.codex.dev`, while projections differed only by the two managed devices. No before/after artifact was overwritten and no allowlist was broadened.
- [ ] No package, migration, accepted report, Task 3 source/artifact, plan/spec other than the exact controller-authenticated Task 5 dispatch transition, routing, progress, Git index/cache, unrelated dirty/untracked path, or foreign temp entry changed.
- [ ] The report was written last; both fresh mapped Sol reviewers approved one identical final handoff captured by the controller.
