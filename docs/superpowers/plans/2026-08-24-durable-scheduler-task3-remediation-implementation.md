# Durable Scheduler Task 3 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement local/external event classification, the partial `G.tick` contract, and the Task-3 adapter/report evidence without weakening the completed Task-1/Task-2 scheduler baseline.

**Architecture:** Add all Task-3 tests before source changes, then implement the engine classifier, pure scheduler event helpers, bounded partial ticking, and browser/client deferred-action adapters as one TDD slice. `G.sukienKe(st)` remains numeric for legacy callers; new structured classifiers and `server/scheduler/events.js` provide the durable identities that later writer/reducer tasks consume. `server/scheduler/events.js` is deliberately pure and Store-compatible, but it must not import Store or any writer/reducer module.

**Tech Stack:** Node.js >=22.5, CommonJS, Node built-in test runner, existing browser globals, existing build pipeline, no new runtime dependency.

**Spec:** [durable scheduler design](../specs/2026-08-23-durable-event-scheduler-design.md), parent implementation plan Task 3 at `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:5486-6372`, and the completed Task-2 GREEN-remediation report at `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md`.

## Global Constraints

- This plan supersedes only parent Task 3, lines 5486-6372, from parent plan SHA-256 `cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3` (23,455 lines / 1,128,291 bytes). Tasks 1-2 completed artifacts and Tasks 4-10 interfaces remain binding.
- Authority identities are immutable for this Task-3 dispatch: durable scheduler design SHA-256 `1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf` (311 lines / 42,966 bytes); parent implementation plan SHA-256 `cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3` (23,455 lines / 1,128,291 bytes); model routing SHA-256 `09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f` (102 lines / 5,732 bytes); progress ledger SHA-256 `e6e2b92aaeb58c870ffbf0b85979d547470d104e04832600f7f8ceb91638317e` (276 lines / 18,494 bytes); Task-1 brief/report SHA-256 `2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a` / `6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38`; Task-2 brief/report SHA-256 `a09e794304213d0f178e65b50957cc351be93580624caca3c38ca8dd172e1622` / `8823be0784319862af394d007fad4574830108c11910691b7f47ad540bb1edf2`. No Task-4 remediation candidate is an authority for this Task-3 plan.
- Latest scheduler FAIL review authorities read for this remediation are `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-semantic-review.md` SHA-256 `4a3b53007287d45bd1bbeded5bb6735cf9dc06f00a4362622c54564f48618499` (306 lines / 17,663 bytes) and `round8-final-executable-review.md` SHA-256 `995828d330a935b5bf6219b9ac41265493a0da0bf949c38f5bc14997a09cf70e` (260 lines / 14,755 bytes), plus the Task-3 FAIL controller findings bound to this remediation pass.
- Cross-module Task-3 ABI is frozen by parent shared interface `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:346`, parent Task-3 body `:6290-6336`, and later approved parent consumers `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:7041`, `:7459-7508`, `:8958-9058`, and `:21067-21555`: `deriveExternalJobs(accountId, state, targetAccountForKey)`, `jobFromRef(ref, targetAccountForKey)`, and `canonicalExternalStatus(kho, ref)`. Do not swap these arguments or introduce alternate overloads.
- Source implementer must be fresh `gpt-5.5`, effort `xhigh`. Final behavior/logic reviewer and runtime/scope reviewer must be two separate fresh independent `gpt-5.6-sol` agents, each effort `high`, per `.superpowers/sdd/model-routing.md` SHA-256 `09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f` (102 lines / 5,732 bytes). Do not dispatch a Terra reviewer for this Task-3 pass.
- Current Task-2 baseline is immutable before Task-3 edits: `tools/test-scheduler.js` SHA `59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e` (3,814 lines / 164,072 bytes), `server/scheduler/store.js` SHA `f15b00f6e45e32d17446d0004fac569ab0479e64c071930853a7e7e2d100974d` (1,667 lines / 83,150 bytes), 62 top-level scheduler tests, zero nested `t.test`, and 24 lease-fault `prove(...)` registrations.
- `server/scheduler/events.js` must be absent before RED. Its creation is part of Task 3 and must have same-task tests plus `node --check server/scheduler/events.js` in GREEN gates.
- `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-brief.md` is absent at plan-authoring time. Do not create a replacement brief unless the controller later supplies one explicitly.
- Allowed implementation writes are only `tools/test-scheduler.js`, `js/fleet.js`, `js/actions.js`, `js/app.js`, `js/main.js`, `web/js/mp.js`, `server/scheduler/events.js`, `dist/thien-ha-dai-chien.html`, `dist/artifact.html`, and `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md`.
- Verify-only paths include `server/scheduler/store.js`, `server/scheduler/migrations.js`, `server/scheduler/contract.js`, `server/db.js`, `server/rules.js`, `server/rules-loader.js`, `tools/build.js`, `tools/check-artifact.js`, `tools/source-manifest.js`, package metadata, parent plans/specs, Task-1/Task-2 briefs/reports, progress ledger, and the Git index.
- `G.TICK_PARTIAL` is the local UI deferred sentinel: `Object.freeze({deferred: true, code: 'TICK_PARTIAL'})`. `G.tick` and `G.tickNoiBo` never return this sentinel; they return `TickOutcome`. `G.tickOutcomeNeedsDeferral(outcome)` is the explicit bridge from real `TickOutcome` exhaustion or `blockedExternal` to the local sentinel used by `G.chay` and browser adapters. Every local adapter must compare the full sentinel field contract through `G.laTickPartial(value)`; raw string checks, object identity checks, and ad hoc `{code}` checks are insufficient.
- Transport response code `code: 'TICK_PARTIAL'` from `/api/lam` is not the local sentinel. Multiplayer code must propagate it as API metadata `{code:'TICK_PARTIAL'}` without calling `G.laTickPartial` on the transport body and without replaying a POST.
- `G.tick(st, targetS, options)` validates `targetS`, `options`, and `options.remainingBudget.value` before mutation. `targetS` must be a finite safe integer second `>= 0`. A supplied `options` object must be plain, use only the documented option keys, and reject malformed `ownerAccountId`, `multiplayer`, `targetAccountForKey`, `remainingBudget`, and `durableFences` shapes. A newly supplied shared budget must be the exact single-key object `{value}` with an integer from 1 to 50,000; an established local-only continuation may enter with value 0 only through `G.tickNoiBo`.
- Budget exhaustion is a valid partial result, not an exception. It must not jump `st.lastTick` or `st.now` beyond the last processed primitive, and due same-second work must remain discoverable by `G.phanLoaiSuKienKe(st)`.
- Multiplayer external fleet/missile work returns `G.BLOCKED_EXTERNAL(ref, atS)` without mutating that primitive. Recycle, colonize, deploy, NPC, empty, self-owned, and non-player targets remain local.
- `APP.lam` scope is local to the adapters that own it: `js/main.js` for single-player and `web/js/mp.js` for multiplayer. Shared UI command collection in `js/app.js` may call the adapter but must not allocate scheduler budgets or classify events.
- Durable external job identity must match Task-2 `validateJob` exactly. Attack refs produce PVP jobs with `aggregateType: 'match'`, `aggregateId === matchId`, `expectedRevision: null`, `maxAttempts: 8`, `sourceAccountId === ref.ownerAccountId`, key `pvp-resolve:<matchId>:<arrivalAtS>`, and payload `{schemaVersion: 1, matchId, ref}`. Transport, spy, hold, and missile refs produce `EXTERNAL_RESOLVE` jobs with `expectedRevision: null`, `maxAttempts: 8`, `sourceAccountId === ref.ownerAccountId`, key from `externalKey(ref)`, and payload `{schemaVersion: 1, ref}`.
- `canonicalExternalStatus` returns only `EXACT`, `ALREADY_ABSENT`, or `REF_MISMATCH`. These strings are downstream-compatible with Task 4 and replace all previous ad hoc status names.
- Aggregate environmental gates must be classified, not hidden. Direct Task-3 functional gates must pass. `npm test` may be reported as environmental only when the server preflight baseline was captured before Task-3 edits, protected server hashes are unchanged, standalone Task-3 direct gates passed, and the aggregate failure is only the known server/socket `SERVER KHÔNG LÊN` condition. `node tools/check-syntax.js` may be reported as environmental only when every failing child check is a spawn `EPERM` or `EACCES` and direct `node --check` gates for every changed JS file passed.
- Do not run `git add`, `git commit`, or any index mutation. Record commit intent only: `feat: add durable event classification and partial ticking`.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `tools/test-scheduler.js` | Modify | Append exactly 20 Task-3 top-level tests after the Task-2 block; preserve the first 3,814 lines byte-for-byte until Task-3 append. |
| `js/fleet.js` | Modify | Define `G.TICK_PARTIAL`, `G.BLOCKED_EXTERNAL`, structured classifiers, stable refs, partial ticking, local-only ticking, and missile launch timestamp capture. |
| `server/scheduler/events.js` | Create | Pure CommonJS helpers for durable external refs and job derivation: `stableFleetRef`, `stableMissileRef`, `sameExternalRef`, `derivePvpMatchId`, `externalKey`, `jobFromRef`, `deriveExternalJobs`, and `canonicalExternalStatus`; no Store import. |
| `js/actions.js` | Modify | Make `G.chay` defer an action when pre-action tick returns partial, before action mutation. |
| `js/app.js` | Modify | Update heartbeat/visibility tick calls to use the partial-aware adapter surface rather than ignoring `TickOutcome`. |
| `js/main.js` | Modify | Local `APP.lam` validates finite action input, serializes deferred local actions, saves partial checkpoints, and schedules macrotask continuations without calling callbacks twice. |
| `web/js/mp.js` | Modify | Multiplayer `APP.lam` maps `{code:'TICK_PARTIAL'}` server responses to the same retryable UI behavior and does not run local authoritative ticks. |
| `dist/thien-ha-dai-chien.html`, `dist/artifact.html` | Regenerate | Built output from `npm run build` after browser source changes. |
| `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md` | Create | RED/GREEN, gate, hash, environmental classification, scope, temp, and reviewer handoff evidence. |

### Task 1: Establish Immutable Baseline And Snapshots

**Files:**

- Verify: all owned/protected hashes listed below
- Verify absent: `server/scheduler/events.js`
- Verify absent: `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md`

**Interfaces:**

- Consumes: completed Task-2 exact source and report identities.
- Produces: exported before-scope and before-temp snapshots for the final GREEN comparison.

- [ ] **Step 1: Open one persistent shell and verify exact preconditions**

```bash
set -Eeuo pipefail
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
test "$(wc -l < tools/test-scheduler.js)" -eq 3814
test "$(wc -c < tools/test-scheduler.js)" -eq 164072
test "$(rg -c '^test\(' tools/test-scheduler.js)" -eq 62
test "$(awk '/t\.test\(/{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(rg -c '^  prove\(' tools/test-scheduler.js)" -eq 24
test "$(sha256sum js/fleet.js | cut -d' ' -f1)" = \
  a4ecd68a1e35d701fcf4756ba0cbbadead1d92f564ff092366a2f7d6770562f1
test "$(sha256sum js/actions.js | cut -d' ' -f1)" = \
  a5295cb931d690e5bd6df03c945a80a1b6222e8a3d4e323a79ae88772fef030a
test "$(sha256sum js/app.js | cut -d' ' -f1)" = \
  9e7a0125308fb23b6249396329bfa216af5884ccee99e04849c78af22e6eaa96
test "$(sha256sum js/main.js | cut -d' ' -f1)" = \
  9f71a0e5ff95b19d7835eb392c27a553fada9933bf3912b09b5a9f4845aa14ce
test "$(sha256sum web/js/mp.js | cut -d' ' -f1)" = \
  dfe1ba45d9369b2c36f73aebcbfe0a583b841144c16c2b14f3831d9a2db2e243
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  f15b00f6e45e32d17446d0004fac569ab0479e64c071930853a7e7e2d100974d
test "$(sha256sum server/scheduler/migrations.js | cut -d' ' -f1)" = \
  1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76
test "$(sha256sum server/scheduler/contract.js | cut -d' ' -f1)" = \
  3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1
test "$(sha256sum server/db.js | cut -d' ' -f1)" = \
  982ff360fa62c0ece158d57cf9acdca34783f35f12ea82409ea478437ade3545
test "$(sha256sum server/app.js | cut -d' ' -f1)" = \
  b99ff52dcf6e43d02f92acb1359c0f8490475978ace332cc55f5f277537900d2
test "$(sha256sum server/api.js | cut -d' ' -f1)" = \
  e7ea7e2a2bb899209222bcdc2aab1b1bdef724800283d445968778fe59bfecf0
test "$(sha256sum server/world.js | cut -d' ' -f1)" = \
  621a484b4153496efde3a45f3023e227cd168598b91a88daec14d2065a836f49
test "$(sha256sum tools/test-server.js | cut -d' ' -f1)" = \
  3bad4e64675157d8eb335c8c14b0837b6bfa6f00b782f6a49fa60a8605fd7bf9
test "$(sha256sum package.json | cut -d' ' -f1)" = \
  7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f
test "$(sha256sum .superpowers/sdd/model-routing.md | cut -d' ' -f1)" = \
  09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md | cut -d' ' -f1)" = \
  8823be0784319862af394d007fad4574830108c11910691b7f47ad540bb1edf2
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('absent path escapes root: ' + rel);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) {
    throw new Error('absent parent escapes root: ' + rel);
  }
  return abs;
}
for (const rel of [
  'server/scheduler/events.js',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-brief.md'
]) {
  try {
    fs.lstatSync(rooted(rel));
    throw new Error('absent target exists or is dangling symlink: ' + rel);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
NODE
node --check tools/test-scheduler.js
node --check js/fleet.js
node --check js/actions.js
node --check js/app.js
node --check js/main.js
node --check web/js/mp.js
node --check server/scheduler/store.js
```

- [ ] **Step 2: Capture server preflight baseline for aggregate classification**

This step runs before any Task-3 source/test edit. It is not a Task-3 functional gate; it records whether the current unchanged server aggregate already has the known socket environmental failure.

```bash
task3_runtime_dir="$(mktemp -d /tmp/task3-runtime.XXXXXXXXXX)"
export task3_runtime_dir
test "$(sha256sum server/app.js | cut -d' ' -f1)" = \
  b99ff52dcf6e43d02f92acb1359c0f8490475978ace332cc55f5f277537900d2
test "$(sha256sum server/api.js | cut -d' ' -f1)" = \
  e7ea7e2a2bb899209222bcdc2aab1b1bdef724800283d445968778fe59bfecf0
test "$(sha256sum server/world.js | cut -d' ' -f1)" = \
  621a484b4153496efde3a45f3023e227cd168598b91a88daec14d2065a836f49
test "$(sha256sum tools/test-server.js | cut -d' ' -f1)" = \
  3bad4e64675157d8eb335c8c14b0837b6bfa6f00b782f6a49fa60a8605fd7bf9
node --check server/app.js
node --check server/api.js
node --check server/world.js
node --check tools/test-server.js
task3_server_preflight_output="$task3_runtime_dir/server-preflight.txt"
task3_server_preflight_fingerprint="$task3_runtime_dir/server-preflight-fingerprint.txt"
export task3_server_preflight_output
export task3_server_preflight_fingerprint
set +e
node tools/test-server.js >"$task3_server_preflight_output" 2>&1
task3_server_preflight_status=$?
set -e
cat "$task3_server_preflight_output"
if test "$task3_server_preflight_status" -ne 0; then
  rg -q 'SERVER KHÔNG LÊN' "$task3_server_preflight_output"
  node - "$task3_server_preflight_output" "$task3_server_preflight_fingerprint" <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8');
const nonblank = text.split('\n').filter((line) => line.trim().length > 0);
const knownBenign = /^(TAP version|ok\b|1\.\.|#|✓|> |npm |$)/;
const plainInteger = '(?:0|[1-9][0-9]*)';
const localeNumber = '(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:\\.[0-9]{3})+)';
const defenseName = '(?:Bệ Phóng Tên Lửa|Pháo Laser Nhỏ|Pháo Laser Lớn|Pháo Gauss|Pháo Ion|Pháo Plasma)';
const defenseBreakdown = '(?:không phá được gì|' + defenseName + ' ×' + localeNumber + '(?:, ' +
  defenseName + ' ×' + localeNumber + ')*)';
const expeditionKey = '(?:tài nguyên|tàu trôi dạt|Galana|chạm trán|lạc đường|thiên thạch|không thấy gì)';
const smokeProgressPatterns = [
  new RegExp('^  · sản lượng/giờ: KL ' + plainInteger + ' TA ' + plainInteger +
    ' NL ' + plainInteger + ' TP ' + plainInteger + ' \\| điện ' + plainInteger + '/' + plainInteger + '$'),
  new RegExp('^  · kết quả trận: (?:hoa|thắng|thua), phế liệu ' + localeNumber + ' KL$'),
  new RegExp('^  · tên lửa: bắn 10, bị chặn ' + plainInteger + ', phá ' + defenseBreakdown + '$'),
  new RegExp('^  · kết quả ' + plainInteger + ' chuyến thám hiểm: \\{(?:\"' + expeditionKey +
    '\":' + plainInteger + ')(?:,\"' + expeditionKey + '\":' + plainInteger + ')*\\}$'),
  new RegExp('^  · đổ bộ: (?:thắng|thua), phòng thủ mặt đất địch ' + localeNumber +
    ' -> ' + localeNumber + ', cướp ' + localeNumber + '$'),
  new RegExp('^  · tua 30 ngày mất ' + plainInteger + 'ms$')
];
function isSmokeProgressLine(line) {
  return smokeProgressPatterns.some((pattern) => pattern.test(line));
}
function isKnownBenignLine(line) {
  return knownBenign.test(line) || isSmokeProgressLine(line);
}
[
  '  · sản lượng/giờ: KL 27360 TA 18200 NL 3072 TP 11041 | điện 5140/3750',
  '  · kết quả trận: hoa, phế liệu 9.900 KL',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×4',
  '  · kết quả 30 chuyến thám hiểm: {"tài nguyên":11,"thiên thạch":3,"lạc đường":4,"chạm trán":3,"không thấy gì":2,"tàu trôi dạt":3,"Galana":4}',
  '  · đổ bộ: thắng, phòng thủ mặt đất địch 632 -> 292, cướp 1.141.288',
  '  · tua 30 ngày mất 3ms'
].forEach((line) => {
  if (!isKnownBenignLine(line)) throw new Error('aggregate smoke progress benign line rejected');
});
[
  '  arbitrary indented content',
  '   · smoke progress: wrong indent',
  '  · smoke progress: browser smoke completed',
  '  · arbitrary Unicode Ω',
  '  · kết quả trận: boom, phế liệu 9.900 KL',
  '  · kết quả trận: hoa, phế liệu . KL',
  '  · kết quả trận: hoa, phế liệu 9..900 KL',
  '  · kết quả trận: hoa, phế liệu 99.90 KL',
  '  · kết quả trận: hoa, phế liệu .9 KL',
  '  · kết quả trận: hoa, phế liệu 9. KL',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×.',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×4..000',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×4.00',
  '  · đổ bộ: thắng, phòng thủ mặt đất địch . -> .., cướp ...',
  '  · đổ bộ: thắng, phòng thủ mặt đất địch 1.23.456 -> 292, cướp 1.141.288',
  '  · kết quả 30 chuyến thám hiểm: {"evil":1}',
  '  · FAIL leaked',
  '  · Error leaked'
].forEach((line) => {
  if (isKnownBenignLine(line)) throw new Error('aggregate smoke progress accepted arbitrary line');
});
const failureLines = text.split('\n').filter((line) =>
  /(^not ok\b|✗|FAILED|\bFAIL\b|\bfailed\b|ERR_|\b[Ee]rror\b|AssertionError|Assertion failed|unmatched assertion|SyntaxError|ReferenceError|TypeError|RangeError|AggregateError|SERVER KHÔNG LÊN)/.test(line)
);
for (const line of nonblank) {
  if (isKnownBenignLine(line) || failureLines.indexOf(line) >= 0) continue;
  throw new Error('unknown server preflight output line: ' + line);
}
if (failureLines.length === 0) throw new Error('missing server preflight failure lines');
if (failureLines.filter((line) => /SERVER KHÔNG LÊN:/.test(line)).length !== 1) {
  throw new Error('server preflight fingerprint lacks exactly one SERVER KHÔNG LÊN line');
}
for (const line of failureLines) {
  if (/SERVER KHÔNG LÊN:|listen (?:EPERM|EACCES)|spawnSync .* (?:EPERM|EACCES)|\bERR_.*(?:EPERM|EACCES)|\b[Ee]rror\b.*(?:EPERM|EACCES)/.test(line)) {
    continue;
  }
  throw new Error('unexpected server preflight failure line: ' + line);
}
fs.writeFileSync(process.argv[3], failureLines.join('\n') + '\n');
NODE
else
  : >"$task3_server_preflight_fingerprint"
fi
export task3_server_preflight_status
```

If `node tools/test-server.js` fails before edits for any pattern other than `SERVER KHÔNG LÊN`, stop and report `BLOCKED_SERVER_BASELINE`.

- [ ] **Step 3: Capture scope and temp snapshots**

```bash
test -n "${task3_runtime_dir:-}"
test -d "$task3_runtime_dir"
task3_scope_before="$task3_runtime_dir/scope-before.manifest"
task3_temp_before="$task3_runtime_dir/tmp-before.txt"
task3_index_before="$task3_runtime_dir/index-before.manifest"
task3_cached_diff_before="$task3_runtime_dir/cached-diff-before.patch"
task3_authority_before="$task3_runtime_dir/authority-before.sha256"
task3_allowed_before="$task3_runtime_dir/allowed-before.manifest"
task3_root_identity="$task3_runtime_dir/root.identity"
task3_controller_plan_path="docs/superpowers/plans/2026-08-24-durable-scheduler-task3-remediation-implementation.md"
export task3_scope_before task3_temp_before task3_index_before task3_cached_diff_before
export task3_authority_before task3_allowed_before task3_root_identity task3_controller_plan_path
node - "$task3_root_identity" <<'NODE'
const fs = require('node:fs');
const root = fs.realpathSync(process.cwd());
const stat = fs.lstatSync(root);
if (!stat.isDirectory()) throw new Error('workspace root is not a directory');
fs.writeFileSync(process.argv[2], [
  root,
  stat.dev,
  stat.ino,
  stat.mode,
  stat.size,
  stat.uid + ':' + stat.gid
].join(' ') + '\n');
NODE
task3_assert_root_identity() {
  node - "$task3_root_identity" <<'NODE'
const fs = require('node:fs');
const expected = fs.readFileSync(process.argv[2], 'utf8').trim();
const root = fs.realpathSync(process.cwd());
const stat = fs.lstatSync(root);
const actual = [
  root,
  stat.dev,
  stat.ino,
  stat.mode,
  stat.size,
  stat.uid + ':' + stat.gid
].join(' ');
if (actual !== expected) throw new Error('workspace root identity changed\n' + expected + '\n' + actual);
NODE
}
task3_assert_root_identity
test -n "${task3_controller_plan_sha256:-}"
test "$(sha256sum "$task3_controller_plan_path" | cut -d' ' -f1)" = "$task3_controller_plan_sha256"
task3_assert_root_identity
node - "$task3_index_before" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const indexPath = path.resolve(root, '.git/index');
if (indexPath !== root && !indexPath.startsWith(root + path.sep)) {
  throw new Error('index path escapes root: .git/index');
}
const stat = fs.lstatSync(indexPath);
if (!stat.isFile()) throw new Error('.git/index is not a regular file');
const hash = crypto.createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex');
process.stdout.write('file ' + hash + ' ' + stat.size + ' ' + stat.mode + ' ' +
  stat.uid + ':' + stat.gid + ' .git/index\n');
fs.writeFileSync(process.argv[2], 'file ' + hash + ' ' + stat.size + ' ' +
  stat.mode + ' ' + stat.uid + ':' + stat.gid + ' .git/index\n');
NODE
git diff --cached --binary >"$task3_cached_diff_before"
test ! -s "$task3_cached_diff_before"
task3_assert_root_identity
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const existing = [
  'tools/test-scheduler.js',
  'js/fleet.js',
  'js/actions.js',
  'js/app.js',
  'js/main.js',
  'web/js/mp.js',
  'dist/thien-ha-dai-chien.html',
  'dist/artifact.html'
];
const created = [
  'server/scheduler/events.js',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md'
];
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('allowed path escapes root: ' + rel);
  }
  const parent = path.dirname(abs);
  const realParent = fs.realpathSync(parent);
  if (realParent !== root && !realParent.startsWith(root + path.sep)) {
    throw new Error('allowed parent escapes root: ' + rel);
  }
  return abs;
}
existing.forEach((rel) => {
  const stat = fs.lstatSync(rooted(rel));
  if (!stat.isFile()) throw new Error('allowed existing target is not regular file: ' + rel);
});
created.forEach((rel) => {
  const abs = rooted(rel);
  try {
    const stat = fs.lstatSync(abs);
    if (stat.isSymbolicLink()) throw new Error('created target is broken symlink: ' + rel);
    throw new Error('created target exists before Task-3 RED: ' + rel);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
});
NODE
node - "$task3_allowed_before" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const allowed = [
  'tools/test-scheduler.js', 'js/fleet.js', 'js/actions.js', 'js/app.js',
  'js/main.js', 'web/js/mp.js', 'server/scheduler/events.js',
  'dist/thien-ha-dai-chien.html', 'dist/artifact.html',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md'
];
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('allowed path escapes root: ' + rel);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) {
    throw new Error('allowed parent escapes root: ' + rel);
  }
  return abs;
}
function row(rel) {
  try {
    const abs = rooted(rel);
    const stat = fs.lstatSync(abs);
    const meta = stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid;
    if (stat.isSymbolicLink()) return 'link ' + meta + ' ' + fs.readlinkSync(abs) + ' ' + rel;
    if (stat.isDirectory()) return 'dir ' + meta + ' ' + rel;
    if (!stat.isFile()) return 'other ' + meta + ' ' + rel;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    return 'file ' + hash + ' ' + meta + ' ' + rel;
  } catch (error) {
    if (error.code === 'ENOENT') return 'ENOENT ' + rel;
    return 'error ' + (error.code || 'UNKNOWN') + ' ' + rel;
  }
}
fs.writeFileSync(process.argv[2], allowed.map(row).join('\n') + '\n');
NODE
test "$(sha256sum docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md | cut -d' ' -f1)" = \
  1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf
test "$(sha256sum docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md | cut -d' ' -f1)" = \
  cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
test "$(sha256sum .superpowers/sdd/model-routing.md | cut -d' ' -f1)" = \
  09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/progress.md | cut -d' ' -f1)" = \
  e6e2b92aaeb58c870ffbf0b85979d547470d104e04832600f7f8ceb91638317e
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md | cut -d' ' -f1)" = \
  2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md | cut -d' ' -f1)" = \
  6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md | cut -d' ' -f1)" = \
  a09e794304213d0f178e65b50957cc351be93580624caca3c38ca8dd172e1622
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md | cut -d' ' -f1)" = \
  8823be0784319862af394d007fad4574830108c11910691b7f47ad540bb1edf2
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-semantic-review.md | cut -d' ' -f1)" = \
  4a3b53007287d45bd1bbeded5bb6735cf9dc06f00a4362622c54564f48618499
test "$(sha256sum .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-executable-review.md | cut -d' ' -f1)" = \
  995828d330a935b5bf6219b9ac41265493a0da0bf949c38f5bc14997a09cf70e
sha256sum \
  "$task3_controller_plan_path" \
  docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md \
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md \
  .superpowers/sdd/model-routing.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/progress.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-semantic-review.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-executable-review.md \
  >"$task3_authority_before"
task3_assert_root_identity
node - "$task3_scope_before" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const output = process.argv[2];
const root = process.cwd();
const allowed = new Set([
  './tools/test-scheduler.js',
  './js/fleet.js',
  './js/actions.js',
  './js/app.js',
  './js/main.js',
  './web/js/mp.js',
  './server/scheduler/events.js',
  './dist/thien-ha-dai-chien.html',
  './dist/artifact.html',
  './.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md'
]);
const rows = [];
function label(abs) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return rel ? './' + rel : '.';
}
function skip(abs) {
  const rel = label(abs);
  return rel === './.git' || rel.startsWith('./.git/') || allowed.has(rel);
}
function typeRow(stat, abs) {
  const rel = label(abs);
  const meta = stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid;
  if (stat.isDirectory()) return 'dir ' + meta + ' ' + rel;
  if (stat.isSymbolicLink()) return 'link ' + meta + ' ' + fs.readlinkSync(abs) + ' ' + rel;
  if (stat.isFIFO()) return 'fifo ' + meta + ' ' + rel;
  if (stat.isSocket()) return 'socket ' + meta + ' ' + rel;
  if (!stat.isFile()) return 'other ' + meta + ' ' + rel;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  return 'file ' + hash + ' ' + meta + ' ' + rel;
}
function visit(abs) {
  if (skip(abs)) return;
  let stat;
  try { stat = fs.lstatSync(abs); }
  catch (error) {
    rows.push('error ' + label(abs) + ' ' + (error && error.code || 'UNKNOWN'));
    return;
  }
  rows.push(typeRow(stat, abs));
  if (!stat.isDirectory()) return;
  let names;
  try { names = fs.readdirSync(abs).sort(); }
  catch (error) {
    rows.push('error ' + label(abs) + ' ' + (error && error.code || 'UNKNOWN'));
    return;
  }
  names.forEach((name) => visit(path.join(abs, name)));
}
visit(root);
fs.writeFileSync(output, rows.join('\n') + (rows.length ? '\n' : ''));
NODE
task3_assert_root_identity
node - "$task3_runtime_dir" "$task3_temp_before" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const runtime = path.resolve(process.argv[2]);
const output = process.argv[3];
const rows = [];
function skip(entry) {
  const resolved = path.resolve(entry);
  return resolved === runtime || resolved.startsWith(runtime + path.sep);
}
function visit(entry) {
  if (skip(entry)) return;
  let stat;
  try { stat = fs.lstatSync(entry); }
  catch (error) {
    rows.push('error ' + entry + ' ' + (error && error.code || 'UNKNOWN'));
    return;
  }
  if (stat.isDirectory()) {
    rows.push('dir ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid + ' ' + entry);
    let names;
    try { names = fs.readdirSync(entry).sort(); }
    catch (error) {
      rows.push('error ' + entry + ' ' + (error && error.code || 'UNKNOWN'));
      return;
    }
    names.forEach((name) => visit(path.join(entry, name)));
    return;
  }
  if (stat.isFile()) {
    const hash = crypto.createHash('sha256')
      .update(fs.readFileSync(entry))
      .digest('hex');
    rows.push('file ' + hash + ' ' + stat.mode + ' ' + stat.size + ' ' +
      stat.uid + ':' + stat.gid + ' ' + entry);
    return;
  }
  if (stat.isSymbolicLink()) {
    rows.push('link ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
      stat.gid + ' ' + fs.readlinkSync(entry) + ' ' + entry);
    return;
  }
  if (stat.isFIFO()) {
    rows.push('fifo ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
      stat.gid + ' ' + entry);
    return;
  }
  if (stat.isSocket()) {
    rows.push('socket ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
      stat.gid + ' ' + entry);
    return;
  }
  rows.push('other ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
    stat.gid + ' ' + entry);
}
fs.readdirSync('/tmp').sort().forEach((name) => visit(path.join('/tmp', name)));
fs.writeFileSync(output, rows.join('\n') + (rows.length ? '\n' : ''));
NODE
test -s "$task3_scope_before"
test -f "$task3_temp_before"
test -s "$task3_authority_before"
```

### Task 2: Write Task-3 Failing Tests

**Files:**

- Modify: `tools/test-scheduler.js`

**Interfaces:**

- Consumes: `G` from `server/rules.js`, lazy `require('../server/scheduler/events.js')`, and a minimal browser adapter fixture for `APP.lam`.
- Produces: 20 Task-3 top-level tests while preserving the 62-test Task-2 topology and zero nested `t.test`.

- [ ] **Step 1: Append exactly this Task-3 test block**

Add this block after `// END TASK2_TEST_APPEND`. Do not add nested `t.test`
registrations. These twenty top-level names are part of the report contract.

```js

var task3EventsCache;
function task3EventsModule() {
  if (!task3EventsCache) task3EventsCache = require('../server/scheduler/events.js');
  return task3EventsCache;
}

function task3FreshState(nowS) {
  var st = G.moiGame('Task3', 'task3-' + nowS, {g: 1, h: 1, p: 4}, nowS);
  st.accountId = 11;
  st.now = nowS;
  st.lastTick = nowS;
  st.nextRaid = nowS + 1000000;
  st.nextMaint = nowS + 1000000;
  if (st.baoTri) st.baoTri.nextAt = nowS + 1000000;
  st.fleets = [];
  st.toi = [];
  st.tenLua = [];
  st.msgs = [];
  st.nk = [];
  st.debris = {};
  st.npc = {};
  st.ncQueue = null;
  st.fleetIdSeq = 1000;
  st.planets.forEach(function (p) {
    p.qB = [];
    p.qS = [];
    p.res = {metal: 1000000, crystal: 1000000, deut: 1000000, food: 1000000};
    p.ships = {};
    p.def = {};
    p.mis = {};
  });
  return st;
}

function task3SameSecondWorkState(atS, count) {
  var st = task3FreshState(atS - 1);
  var p = st.planets[0];
  p.qB = Array.from({length: count}, function () {
    return {id: 'metalMine', n: 1, tg: 0, xong: atS};
  });
  return st;
}

function task3WithHook(hook, fn) {
  var old = G.HOOK;
  G.HOOK = hook;
  try { return fn(); } finally { G.HOOK = old; }
}

function task3PlayerHook(targetKey, accountId) {
  return {
    oNguoi: function (st, c) {
      if (G.tdKey(c) !== targetKey) return null;
      return {
        loai: 'nguoi',
        key: targetKey,
        c: {g: c.g, h: c.h, p: c.p},
        tk: accountId,
        pi: 0,
        ten: 'Defender',
        htTen: 'Defender Home'
      };
    }
  };
}

function task3Fleet(row) {
  return Object.assign({
    id: 70,
    pi: 0,
    tu: {g: 1, h: 1, p: 4},
    den: {g: 1, h: 2, p: 5},
    mission: 'attack',
    pha: 'di',
    diLuc: 100,
    den_t: 200,
    ve_t: 300,
    ships: {cargoS: 1},
    cargo: {}
  }, row || {});
}

function task3Missile(row) {
  return Object.assign({
    id: 80,
    pi: 0,
    tu: {g: 1, h: 1, p: 4},
    den: {g: 1, h: 3, p: 5},
    n: 3,
    khi: 240
  }, row || {});
}

function task3Incoming(row) {
  return Object.assign({
    id: 90,
    pi: 0,
    tu: {g: 1, h: 9, p: 4},
    den: {g: 1, h: 1, p: 4},
    den_t: 240,
    ships: {cargoS: 1}
  }, row || {});
}

function task3EightClassWorkState(atS) {
  var st = task3FreshState(atS - 1);
  var p = st.planets[0];
  var p2 = JSON.parse(JSON.stringify(p));
  p2.c = {g: p.c.g, h: p.c.h, p: p.c.p + 1};
  p2.qB = [];
  p2.qS = [];
  p2.res = Object.assign({}, p.res);
  p2.ships = {};
  p2.def = {};
  p2.mis = {};
  st.planets[1] = p2;
  st.nextMaint = atS;
  st.baoTri = Object.assign({}, st.baoTri || {}, {nextAt: atS});
  p.qB.push({id: 'metalMine', n: 1, tg: 0, xong: atS});
  p2.qB.push({id: 'crystalMine', n: 1, tg: 0, xong: atS});
  p.qS.push({id: 'cargoS', n: 1, tEach: 0, tLeft: 1});
  p2.qS.push({id: 'cargoS', n: 1, tEach: 0, tLeft: 1});
  st.ncQueue = {
    status: 'active',
    installmentsLeft: 0,
    finishAt: atS,
    planetKey: G.tdKey(p.c),
    id: 'energy',
    lv: 1,
    totalCost: {},
    installmentsTotal: 1,
    conLai: 0
  };
  st.fleets = [
    task3Fleet({id: 201, mission: 'recycle', den_t: atS, den: {g: 1, h: 50, p: 4}}),
    task3Fleet({id: 202, mission: 'deploy', den_t: atS, den: p.c})
  ];
  st.tenLua = [
    task3Missile({id: 301, den: p.c, khi: atS}),
    task3Missile({id: 302, den: {g: 1, h: 50, p: 4}, khi: atS})
  ];
  st.toi = [
    task3Incoming({id: 401, den_t: atS}),
    task3Incoming({id: 402, den_t: atS})
  ];
  st.nextRaid = atS;
  return st;
}

function task3BrowserElement(id) {
  return {
    id: id,
    style: {},
    classList: {toggle: function () {}, remove: function () {}},
    addEventListener: function () {},
    insertAdjacentHTML: function () {},
    click: function () {},
    remove: function () {},
    select: function () {},
    getAttribute: function () { return ''; },
    setAttribute: function () {},
    textContent: '',
    innerHTML: '',
    value: '',
    files: []
  };
}

function task3Document(elements) {
  return {
    hidden: false,
    body: {appendChild: function () {}},
    addEventListener: function (name, fn) { elements['event:' + name] = fn; },
    execCommand: function () { return false; },
    createElement: function (tag) { return task3BrowserElement(tag); },
    querySelector: function (selector) {
      return elements[selector] || (elements[selector] = task3BrowserElement(selector));
    },
    getElementById: function (id) {
      return elements[id] || (elements[id] = task3BrowserElement(id));
    }
  };
}

async function task3WithBrowser(win, fn) {
  var descriptors = {
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    setTimeout: win.setTimeout,
    setInterval: win.setInterval,
    fetch: win.fetch,
    navigator: win.navigator || {clipboard: null},
    location: win.location || {reload: function () {}},
    confirm: win.confirm || function () { return true; },
    FileReader: win.FileReader || function () {},
    Blob: win.Blob || function () {},
    URL: win.URL || {
      createObjectURL: function () { return 'blob:task3'; },
      revokeObjectURL: function () {}
    }
  };
  var old = {};
  var installed = [];
  function install(key) {
    old[key] = Object.getOwnPropertyDescriptor(global, key);
    Object.defineProperty(global, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: descriptors[key]
    });
    installed.push(key);
  }
  try {
    Object.keys(descriptors).forEach(install);
    return await fn();
  } finally {
    installed.reverse().forEach(function (key) {
      if (old[key]) Object.defineProperty(global, key, old[key]);
      else delete global[key];
    });
  }
}

function task3RequireBrowserFile(relativePath) {
  var full = path.resolve(__dirname, '..', relativePath);
  var resolved = require.resolve(full);
  delete require.cache[resolved];
  return require(resolved);
}

async function task3FlushUntilSettled(predicate, label) {
  for (var i = 0; i < 12; i += 1) {
    await Promise.resolve();
    if (predicate()) return i + 1;
  }
  throw new Error('task3 deferred chain did not settle: ' + label);
}

function task3TickOutcomePartial(atS) {
  return {
    processed: 50000,
    advancedToS: atS,
    nextDueAtS: atS,
    hasMoreDue: true,
    budgetExhausted: true
  };
}

function task3TickOutcomeComplete(atS) {
  return {
    processed: 1,
    advancedToS: atS,
    nextDueAtS: null,
    hasMoreDue: false,
    budgetExhausted: false
  };
}

function task3LocalBrowserFixture() {
  var sentinel = {deferred: true, code: 'TICK_PARTIAL'};
  var elements = {
    'nhap-js': task3BrowserElement('nhap-js'),
    'kd-batdau': task3BrowserElement('kd-batdau'),
    'file-nhap': task3BrowserElement('file-nhap')
  };
  var timers = [];
  var intervals = [];
  var saves = [];
  var effects = [];
  var counters = {actions: 0, ticks: 0};
  var actionResults = [sentinel, sentinel, null];
  var tickOutcomes = [task3TickOutcomePartial(240), task3TickOutcomeComplete(240)];
  var state = {
    v: 6,
    moHinhCT: 'so-luong-v1',
    moHinhNhip: 'bao-tri-dan-su-v1',
    moHinhQuyDao: 'giu-quy-dao-v1',
    ten: 'Task3',
    planets: [{}],
    fleets: [],
    toi: [],
    tenLua: [],
    npc: {},
    debris: {},
    msgs: [],
    nk: [],
    stats: {},
    fleetIdSeq: 1
  };
  var win = {
    document: task3Document(elements),
    localStorage: {
      getItem: function () { return null; },
      setItem: function (key, value) {
        effects.push('save');
        saves.push([key, value]);
      },
      removeItem: function () {}
    },
    setTimeout: function (fn) {
      effects.push('timer');
      timers.push(fn);
      return timers.length;
    },
    setInterval: function (fn) { intervals.push(fn); return intervals.length; },
    addEventListener: function () {},
    THDC_ARTIFACT: true,
    G: {
      STATE_VERSION: 6,
      PHIEN_BAN_LICH_SU: 'task3',
      BOI_CANH: 'task3',
      TICK_PARTIAL: sentinel,
      laTickPartial: function (value) {
        return !!value && value.deferred === true && value.code === 'TICK_PARTIAL';
      },
      tickOutcomeNeedsDeferral: function (value) {
        return !!value && (value.budgetExhausted === true || !!value.blockedExternal);
      },
      giay: function () { return 240; },
      so: String,
      diem: function () { return {tong: 0}; },
      nangCapState: function () {},
      moiGame: function () { return JSON.parse(JSON.stringify(state)); },
      chay: function () {
        counters.actions += 1;
        return actionResults.length ? actionResults.shift() : null;
      },
      tick: function () {
        counters.ticks += 1;
        return tickOutcomes.length ? tickOutcomes.shift() : task3TickOutcomeComplete(240);
      }
    },
    U: {
      toast: function () {},
      esc: String,
      ve: function () {},
      live: function () {},
      hop: function () {},
      dongHop: function () {}
    },
    APP: {
      ACT: {},
      themACT: function (actions) { Object.assign(this.ACT, actions); },
      batDauNhip: function () {}
    }
  };
  win.window = win;
  return {win: win, elements: elements, timers: timers,
    intervals: intervals, saves: saves, effects: effects, counters: counters, state: state,
    actionResults: actionResults, tickOutcomes: tickOutcomes};
}

function task3KhoForState(accountId, state) {
  return {
    db: {
      prepare: function (sql) {
        assert.equal(sql, 'SELECT state FROM dq WHERE tk=?');
        return {
          get: function (tk) {
            return Number(tk) === Number(accountId) ?
              {state: JSON.stringify(state)} : undefined;
          }
        };
      }
    }
  };
}

test('task3 exposes a frozen TICK_PARTIAL sentinel and validates TickOutcome shape',
  function () {
    assert.deepEqual(G.TICK_PARTIAL, {deferred: true, code: 'TICK_PARTIAL'},
      'task3 frozen sentinel must expose the full local field contract');
    assert.equal(Object.isFrozen(G.TICK_PARTIAL), true,
      'task3 frozen sentinel must be immutable');
    assert.equal(G.laTickPartial({deferred: true, code: 'TICK_PARTIAL'}), true,
      'task3 full sentinel comparison must accept the exact contract');
    assert.equal(G.laTickPartial({deferred: false, code: 'TICK_PARTIAL'}), false);
    assert.equal(G.laTickPartial({code: 'TICK_PARTIAL'}), false);
    assert.equal(G.tickOutcomeNeedsDeferral(task3TickOutcomePartial(100)), true);
    assert.equal(G.tickOutcomeNeedsDeferral(task3TickOutcomeComplete(100)), false);
    assert.equal(G.tickOutcomeNeedsDeferral({
      processed: 0,
      advancedToS: 100,
      nextDueAtS: 100,
      hasMoreDue: true,
      budgetExhausted: false,
      blockedExternal: {code: 'BLOCKED_EXTERNAL', atS: 100, ref: {kind: 'fleet'}}
    }), true);

    var st = task3FreshState(100);
    var outcome = G.tick(st, 100, {remainingBudget: {value: 1}});
    assert.deepEqual(Object.keys(outcome || {}).sort(), [
      'advancedToS',
      'budgetExhausted',
      'hasMoreDue',
      'nextDueAtS',
      'processed'
    ], 'task3 tick must return an exact TickOutcome object');
    assert.equal(outcome.processed, 0);
    assert.equal(outcome.advancedToS, 100);
    assert.equal(outcome.nextDueAtS, null);
    assert.equal(outcome.hasMoreDue, false);
    assert.equal(outcome.budgetExhausted, false);
    assert.equal(typeof G.sukienKe(task3FreshState(100)), 'number',
      'task3 G.sukienKe must remain numeric for legacy callers');

    var oldLightMode = G.MO_PHONG_NHE;
    try {
      G.MO_PHONG_NHE = true;
      var lightState = task3FreshState(100);
      lightState.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: 101});
      var lightOutcome = G.tick(lightState, 101, {remainingBudget: {value: 1}});
      assert.deepEqual(Object.keys(lightOutcome || {}).sort(), [
        'advancedToS',
        'budgetExhausted',
        'hasMoreDue',
        'nextDueAtS',
        'processed'
      ], 'task3 G.MO_PHONG_NHE must return a TickOutcome bridge object');
      assert.equal(lightOutcome.processed, 0,
        'task3 G.MO_PHONG_NHE TickOutcome must remain zero-effect');
      assert.equal(G.tickOutcomeNeedsDeferral(lightOutcome), false,
        'task3 G.MO_PHONG_NHE TickOutcome must obey the deferral bridge');
    } finally {
      G.MO_PHONG_NHE = oldLightMode;
    }
  });

test('G.tick stops exactly at the 50000 budget and leaves event 50001 pending',
  function () {
    var st = task3SameSecondWorkState(101, 50001);
    var p = st.planets[0];
    var budget = {value: 50000};
    var outcome = G.tick(st, 101, {remainingBudget: budget});
    assert.equal(outcome && outcome.processed, 50000,
      'task3 budget must process exactly 50000 primitives');
    assert.equal(budget.value, 0,
      'task3 shared budget must be exhausted at the exact cap');
    assert.equal(outcome && outcome.advancedToS, 101,
      'task3 budget cap must not skip the due second');
    assert.equal(outcome && outcome.nextDueAtS, 101,
      'task3 budget cap must leave event 50001 discoverable');
    assert.equal(outcome && outcome.hasMoreDue, true,
      'task3 budget cap must report more due work');
    assert.equal(outcome && outcome.budgetExhausted, true,
      'task3 budget cap must report budget exhaustion');
    assert.equal(p.b.metalMine, 50000);
    assert.equal(p.qB.length, 1);
    assert.equal(G.phanLoaiSuKienKe(st).atS, 101);

    var finalBudget = {value: 1};
    var finalOutcome = G.tick(st, 101, {remainingBudget: finalBudget});
    assert.equal(finalOutcome.processed, 1);
    assert.equal(finalOutcome.budgetExhausted, false);
    assert.equal(finalOutcome.hasMoreDue, false);
    assert.equal(finalOutcome.nextDueAtS, null);
    assert.equal(p.b.metalMine, 50001);
    assert.equal(p.qB.length, 0);

    var solo = task3SameSecondWorkState(102, 50001);
    var soloPlanet = solo.planets[0];
    var soloOutcome = G.tick(solo, 110);
    assert.equal(soloOutcome && soloOutcome.processed, 50000,
      'task3 implicit two-arg budget must process exactly 50000 primitives');
    assert.equal(soloOutcome && soloOutcome.advancedToS, 102,
      'task3 implicit two-arg budget must stop at the due second, not later target');
    assert.equal(soloOutcome && soloOutcome.nextDueAtS, 102,
      'task3 implicit two-arg budget must leave event 50001 discoverable');
    assert.equal(soloOutcome && soloOutcome.hasMoreDue, true);
    assert.equal(soloOutcome && soloOutcome.budgetExhausted, true);
    assert.equal(solo.lastTick, 102);
    assert.equal(solo.now, 102);
    assert.equal(soloPlanet.b.metalMine, 50000);
    assert.equal(soloPlanet.qB.length, 1);
    var resumedSolo = G.tick(solo, 110);
    assert.equal(resumedSolo.processed, 1);
    assert.equal(resumedSolo.budgetExhausted, false);
    assert.equal(resumedSolo.nextDueAtS, null);
    assert.equal(solo.lastTick, 110);
    assert.equal(solo.now, 110);
    assert.equal(soloPlanet.b.metalMine, 50001);
    assert.equal(soloPlanet.qB.length, 0);
  });

test('two-argument solo tick continues same-second work without skipping it',
  function () {
    var st = task3FreshState(110);
    var p = st.planets[0];
    p.qB.push({id: 'metalMine', n: 1, tg: 1, xong: 111});
    p.qS.push({id: 'cargoS', n: 1, tEach: 1, tLeft: 1});
    var outcome = G.tick(st, 111);
    assert.equal(outcome && outcome.budgetExhausted, false,
      'task3 two-argument solo tick must return a nonpartial TickOutcome');
    assert.equal(outcome.hasMoreDue, false);
    assert.equal(outcome.nextDueAtS, null);
    assert.equal(st.lastTick, 111);
    assert.equal(st.now, 111);
    assert.equal(p.b.metalMine, 1);
    assert.equal(p.qS.length, 0);
    assert.equal(p.ships.cargoS, 1);

    var ordered = task3EightClassWorkState(150);
    var observed = [];
    var options = {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: []
    };
    for (var step = 0; step < 12; step += 1) {
      var candidate = G.phanLoaiSuKienKe(ordered, 11, {
        multiplayer: true,
        targetAccountForKey: function () { return null; }
      });
      observed.push(candidate.code + ':' + candidate.atS + ':' +
        candidate.order + ':' + candidate.tie);
      var one = G.tickNoiBo(ordered, 150, options);
      assert.equal(one.processed, 1,
        'task3 same-second ordering step must process exactly one primitive ' + step);
      options.remainingBudget.value = 1;
    }
    assert.deepEqual(observed, [
      'LOCAL_EVENT:150:1:maintenance',
      'LOCAL_EVENT:150:2:building:0',
      'LOCAL_EVENT:150:2:building:1',
      'LOCAL_EVENT:150:3:shipyard:0',
      'LOCAL_EVENT:150:3:shipyard:1',
      'LOCAL_EVENT:150:4:research',
      'LOCAL_EVENT:150:5:fleet:1',
      'LOCAL_EVENT:150:5:fleet:0',
      'LOCAL_EVENT:150:6:missile:1',
      'LOCAL_EVENT:150:6:missile:0',
      'LOCAL_EVENT:150:7:incoming:1',
      'LOCAL_EVENT:150:7:incoming:0'
    ], 'task3 same-second ordering must cover eight classes, ascending planet ties, and descending ref indices');
    assert.equal(ordered.tech.energy, 1,
      'task3 same-second ordering must execute a canonical research completion');
    var raid = G.phanLoaiSuKienKe(ordered, 11, {
      multiplayer: true,
      targetAccountForKey: function () { return null; }
    });
    assert.equal(raid.code + ':' + raid.atS + ':' + raid.order + ':' + raid.tie,
      'LOCAL_EVENT:150:8:raid',
      'task3 same-second ordering must leave raid last after incoming fleets');
    var beforeRaid = JSON.stringify(ordered);
    var raidOutcome = G.tickNoiBo(ordered, 150, options);
    assert.equal(raidOutcome.processed, 1,
      'task3 same-second ordering must execute the raid primitive last');
    assert.notEqual(JSON.stringify(ordered), beforeRaid,
      'task3 same-second ordering raid execution must mutate state');
  });

test('G.tick rejects invalid shared remainingBudget before mutation', function () {
  function populatedState() {
    var st = task3FreshState(120);
    st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: 121});
    return st;
  }
  var oldUpgrade = G.nangCapState;
  var upgradeCalls = 0;
  G.nangCapState = function () {
    upgradeCalls += 1;
    return oldUpgrade.apply(this, arguments);
  };
  try {
    [
    ['null', null],
    ['array', []],
    ['empty object', {}],
    ['missing value', {value: undefined}],
    ['null value', {value: null}],
    ['zero shared budget', {value: 0}],
    ['negative budget', {value: -1}],
    ['fractional budget', {value: 1.5}],
    ['over cap budget', {value: 50001}],
    ['NaN budget', {value: NaN}],
    ['unsafe budget', {value: Number.MAX_SAFE_INTEGER + 1}],
    ['infinite budget', {value: Infinity}],
    ['string budget', {value: '1'}],
    ['boolean budget', {value: false}],
    ['extra-key budget', {value: 1, extra: true}]
  ].forEach(function (entry) {
    var st = populatedState();
    var before = JSON.stringify(st);
    assert.throws(function () {
      G.tick(st, 121, {remainingBudget: entry[1]});
    }, /TICK_BUDGET_INVALID/, 'task3 invalid budget case ' + entry[0]);
    assert.equal(JSON.stringify(st), before,
      'task3 invalid budget case ' + entry[0] + ' mutated state');
  });
    [
    ['undefined target', undefined],
    ['null target', null],
    ['object target', {}],
    ['array target', []],
    ['NaN target', NaN],
    ['negative target', -1],
    ['fractional target', 1.5],
    ['unsafe target', Number.MAX_SAFE_INTEGER + 1],
    ['infinite target', Infinity],
    ['negative infinite target', -Infinity],
    ['string target', '121'],
    ['false target', false],
    ['true target', true]
  ].forEach(function (entry) {
    var st = populatedState();
    var before = JSON.stringify(st);
    assert.throws(function () {
      G.tick(st, entry[1], {remainingBudget: {value: 1}});
    }, /TICK_TARGET_INVALID/, 'task3 invalid target case ' + entry[0]);
    assert.equal(JSON.stringify(st), before,
      'task3 invalid target case ' + entry[0] + ' mutated state');
  });
    var nullProtoOptions = Object.create(null);
    nullProtoOptions.remainingBudget = {value: 1};
    [
    ['null options', null],
    ['array options', []],
    ['function options', function () {}],
    ['string options', 'options'],
    ['date options', new Date(0)],
    ['custom prototype options', Object.create({inherited: true})],
    ['null prototype options', nullProtoOptions],
    ['bad owner account', {remainingBudget: {value: 1}, ownerAccountId: 0}],
    ['fractional owner account', {remainingBudget: {value: 1}, ownerAccountId: 11.5}],
    ['string owner account', {remainingBudget: {value: 1}, ownerAccountId: '11'}],
    ['unsafe owner account', {remainingBudget: {value: 1}, ownerAccountId: Number.MAX_SAFE_INTEGER + 1}],
    ['bad target callback', {remainingBudget: {value: 1}, targetAccountForKey: 'no'}],
    ['bad multiplayer flag', {remainingBudget: {value: 1}, multiplayer: 'yes'}],
    ['bad durable fences', {remainingBudget: {value: 1}, durableFences: {}}],
    ['malformed durable fence entry', {remainingBudget: {value: 1}, durableFences: [{}]}],
    ['durable fence extra key', {remainingBudget: {value: 1}, durableFences: [{
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 1,
      launchAtS: 120,
      targetKey: '1:2:5',
      arrivalAtS: 121,
      mission: 'attack',
      extra: true
    }]}],
    ['extra option key', {remainingBudget: {value: 1}, unexpected: true}]
  ].forEach(function (entry) {
    var st = populatedState();
    var before = JSON.stringify(st);
    assert.throws(function () {
      G.tick(st, 121, entry[1]);
    }, /TICK_OPTIONS_INVALID|TICK_BUDGET_INVALID/,
      'task3 invalid options case ' + entry[0]);
    assert.equal(JSON.stringify(st), before,
      'task3 invalid options case ' + entry[0] + ' mutated state');
  });
    assert.equal(upgradeCalls, 0,
      'task3 invalid G.tick inputs must not call G.nangCapState before validation');
  } finally {
    G.nangCapState = oldUpgrade;
  }
});

test('G.tickNoiBo accepts zero local continuation without returning sentinel',
  function () {
    assert.equal(typeof G.tickNoiBo, 'function',
      'task3 tickNoiBo function must exist');
    var quiet = task3FreshState(124);
    var quietOutcome = G.tickNoiBo(quiet, 125, {
      remainingBudget: {value: 0},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: []
    });
    assert.deepEqual(quietOutcome, {
      processed: 0,
      advancedToS: 125,
      nextDueAtS: null,
      hasMoreDue: false,
      budgetExhausted: false
    });
    assert.equal(G.laTickPartial(quietOutcome), false);
    assert.notDeepEqual(quietOutcome, G.TICK_PARTIAL);

    var due = task3FreshState(124);
    due.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: 125});
    var dueOutcome = G.tickNoiBo(due, 125, {
      remainingBudget: {value: 0},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: []
    });
    assert.deepEqual(dueOutcome, {
      processed: 0,
      advancedToS: 124,
      nextDueAtS: 125,
      hasMoreDue: true,
      budgetExhausted: true
    });
    assert.equal(G.laTickPartial(dueOutcome), false);
    assert.notDeepEqual(dueOutcome, G.TICK_PARTIAL);

    [
      ['maintenance', function (s, atS) {
        s.nextMaint = atS;
        s.baoTri = Object.assign({}, s.baoTri || {}, {nextAt: atS});
      }],
      ['building', function (s, atS) {
        s.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: atS});
      }],
      ['shipyard', function (s) {
        s.planets[0].qS.push({id: 'cargoS', n: 1, tEach: 0, tLeft: 1});
      }],
      ['research', function (s, atS) {
        s.ncQueue = {
          status: 'active',
          installmentsLeft: 0,
          finishAt: atS,
          planetKey: G.tdKey(s.planets[0].c),
          id: 'energy',
          lv: 1,
          totalCost: {},
          installmentsTotal: 1,
          conLai: 0
        };
      }],
      ['fleet', function (s, atS) {
        s.fleets.push(task3Fleet({id: 501, mission: 'deploy', den: s.planets[0].c, den_t: atS}));
      }],
      ['missile', function (s, atS) {
        s.tenLua.push(task3Missile({id: 502, den: s.planets[0].c, khi: atS}));
      }],
      ['incoming', function (s, atS) {
        s.toi.push(task3Incoming({id: 503, den_t: atS}));
      }],
      ['raid', function (s, atS) { s.nextRaid = atS; }]
    ].forEach(function (entry) {
      var zeroCase = task3FreshState(127);
      entry[1](zeroCase, 128);
      var beforeZero = JSON.stringify(zeroCase);
      var zeroOutcome = G.tickNoiBo(zeroCase, 128, {
        remainingBudget: {value: 0},
        ownerAccountId: 11,
        targetAccountForKey: function () { return null; },
        durableFences: []
      });
      assert.equal(zeroOutcome.processed, 0,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' processed work');
      assert.equal(zeroOutcome.nextDueAtS, 128,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' lost due second');
      assert.equal(zeroOutcome.hasMoreDue, true,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' must report due work');
      assert.equal(zeroOutcome.budgetExhausted, true);
      assert.equal(JSON.stringify(zeroCase), beforeZero,
        'task3 tickNoiBo zero budget primitive case ' + entry[0] + ' mutated state');
    });

    var target = {g: 1, h: 5, p: 5};
    var targetKey = G.tdKey(target);
    var external = task3FreshState(130);
    var externalFleet = task3Fleet({
      id: 91,
      den: target,
      mission: 'attack',
      diLuc: 130,
      den_t: 140
    });
    var externalRef = {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 91,
      launchAtS: 130,
      targetKey: targetKey,
      arrivalAtS: 140,
      mission: 'attack'
    };
    external.fleets.push(externalFleet);
    external.planets[0].qB.push({id: 'metalMine', n: 1, tg: 0, xong: 135});
    var beforeExternalFleets = JSON.stringify(external.fleets);
    var ownerFor = function (key) { return key === targetKey ? 22 : null; };
    assert.deepEqual(G.phanLoaiTatCaSuKienNgoai(external, 11, ownerFor),
      [externalRef],
      'task3 tickNoiBo fixture must expose exactly one external ref');
    var mixedOutcome = G.tickNoiBo(external, 140, {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: ownerFor,
      durableFences: []
    });
    assert.equal(mixedOutcome.processed, 1,
      'task3 tickNoiBo must process due local work before excluding external refs');
    assert.equal(external.planets[0].b.metalMine, 1);
    assert.equal(JSON.stringify(external.fleets), beforeExternalFleets,
      'task3 tickNoiBo mixed local/external case must leave external fleet unmutated');
    var externalOutcome = G.tickNoiBo(external, 140, {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: ownerFor,
      durableFences: []
    });
    assert.equal(externalOutcome.blockedExternal, undefined,
      'task3 tickNoiBo must not return blockedExternal');
    assert.equal(JSON.stringify(external.fleets), beforeExternalFleets,
      'task3 tickNoiBo must not mutate external ref primitives');

    var fenced = task3FreshState(130);
    fenced.fleets.push(task3Fleet({
      id: 92,
      den: target,
      mission: 'attack',
      diLuc: 130,
      den_t: 140
    }));
    var fenceRef = Object.assign({}, externalRef, {fleetId: 92});
    var beforeFenceFleets = JSON.stringify(fenced.fleets);
    var fencedOutcome = G.tickNoiBo(fenced, 140, {
      remainingBudget: {value: 1},
      ownerAccountId: 11,
      targetAccountForKey: function () { return null; },
      durableFences: [fenceRef]
    });
    assert.equal(fencedOutcome.blockedExternal, undefined,
      'task3 tickNoiBo must not convert durable fences into blockedExternal');
    assert.equal(JSON.stringify(fenced.fleets), beforeFenceFleets,
      'task3 tickNoiBo must not mutate supplied durable fence refs');

    function tickNoiBoPopulatedState() {
      var st = task3FreshState(126);
      st.planets[0].qB.push({id: 'metalMine', n: 1, tg: 1, xong: 127});
      return st;
    }
    [
      ['null', null],
      ['array', []],
      ['empty object', {}],
      ['missing value', {value: undefined}],
      ['null value', {value: null}],
      ['negative budget', {value: -1}],
      ['fractional budget', {value: 1.5}],
      ['over cap budget', {value: 50001}],
      ['NaN budget', {value: NaN}],
      ['unsafe budget', {value: Number.MAX_SAFE_INTEGER + 1}],
      ['infinite budget', {value: Infinity}],
      ['string budget', {value: '1'}],
      ['boolean budget', {value: false}],
      ['extra-key budget', {value: 1, extra: true}]
    ].forEach(function (entry) {
      var st = tickNoiBoPopulatedState();
      var before = JSON.stringify(st);
      assert.throws(function () {
        G.tickNoiBo(st, 127, {
          remainingBudget: entry[1],
          ownerAccountId: 11,
          targetAccountForKey: function () { return null; },
          durableFences: []
        });
      }, /TICK_BUDGET_INVALID/,
      'task3 tickNoiBo invalid budget case ' + entry[0]);
      assert.equal(JSON.stringify(st), before,
        'task3 tickNoiBo invalid budget case ' + entry[0] + ' mutated state');
    });
    [
      ['undefined target', undefined],
      ['null target', null],
      ['object target', {}],
      ['array target', []],
      ['NaN target', NaN],
      ['negative target', -1],
      ['fractional target', 1.5],
      ['unsafe target', Number.MAX_SAFE_INTEGER + 1],
      ['infinite target', Infinity],
      ['negative infinite target', -Infinity],
      ['string target', '127'],
      ['false target', false],
      ['true target', true]
    ].forEach(function (entry) {
      var st = tickNoiBoPopulatedState();
      var before = JSON.stringify(st);
      assert.throws(function () {
        G.tickNoiBo(st, entry[1], {
          remainingBudget: {value: 1},
          ownerAccountId: 11,
          targetAccountForKey: function () { return null; },
          durableFences: []
        });
      }, /TICK_TARGET_INVALID/,
      'task3 tickNoiBo invalid target case ' + entry[0]);
      assert.equal(JSON.stringify(st), before,
        'task3 tickNoiBo invalid target case ' + entry[0] + ' mutated state');
    });
    var tickNoiBoNullProtoOptions = Object.create(null);
    tickNoiBoNullProtoOptions.remainingBudget = {value: 1};
    [
      ['null options', null],
      ['array options', []],
      ['function options', function () {}],
      ['string options', 'options'],
      ['date options', new Date(0)],
      ['custom prototype options', Object.create({inherited: true})],
      ['null prototype options', tickNoiBoNullProtoOptions],
      ['missing budget', {ownerAccountId: 11, targetAccountForKey: function () { return null; }}],
      ['bad owner account', {remainingBudget: {value: 1}, ownerAccountId: 0}],
      ['fractional owner account', {remainingBudget: {value: 1}, ownerAccountId: 11.5}],
      ['string owner account', {remainingBudget: {value: 1}, ownerAccountId: '11'}],
      ['unsafe owner account', {remainingBudget: {value: 1}, ownerAccountId: Number.MAX_SAFE_INTEGER + 1}],
      ['bad target callback', {remainingBudget: {value: 1}, targetAccountForKey: 'no'}],
      ['bad multiplayer flag', {remainingBudget: {value: 1}, multiplayer: true}],
      ['bad durable fences', {remainingBudget: {value: 1}, durableFences: {}}],
      ['malformed durable fence entry', {remainingBudget: {value: 1}, durableFences: [{}]}],
      ['extra option key', {remainingBudget: {value: 1}, unexpected: true}]
    ].forEach(function (entry) {
      var st = tickNoiBoPopulatedState();
      var before = JSON.stringify(st);
      assert.throws(function () {
        G.tickNoiBo(st, 127, entry[1]);
      }, /TICK_OPTIONS_INVALID|TICK_BUDGET_INVALID/,
      'task3 tickNoiBo invalid options case ' + entry[0]);
      assert.equal(JSON.stringify(st), before,
        'task3 tickNoiBo invalid options case ' + entry[0] + ' mutated state');
    });
  });

test('multiplayer classifier returns a stable fleet ref and blocks without mutation',
  function () {
    var st = task3FreshState(130);
    var target = {g: 1, h: 2, p: 5};
    var targetKey = G.tdKey(target);
    var fleet = task3Fleet({
      id: 71,
      den: target,
      mission: 'attack',
      diLuc: 130,
      den_t: 150
    });
    st.fleets.push(fleet);
    var options = {
      multiplayer: true,
      targetAccountForKey: function (key) { return key === targetKey ? 22 : null; }
    };
    task3WithHook(task3PlayerHook(targetKey, 22), function () {
      assert.equal(typeof G.phanLoaiSuKienKe, 'function',
        'task3 multiplayer classifier function must exist');
      var candidate = G.phanLoaiSuKienKe(st, 11, options);
      assert.equal(candidate.code, 'EXTERNAL_EVENT');
      assert.equal(candidate.atS, 150);
      assert.deepEqual(candidate.ref, {
        kind: 'fleet',
        ownerAccountId: 11,
        fleetId: 71,
        launchAtS: 130,
        targetKey: targetKey,
        arrivalAtS: 150,
        mission: 'attack'
      });
      var before = JSON.stringify(st);
      var outcome = G.tick(st, 150, {
        remainingBudget: {value: 1},
        multiplayer: true,
        ownerAccountId: 11,
        targetAccountForKey: options.targetAccountForKey
      });
      assert.equal(outcome.processed, 0);
      assert.deepEqual(outcome.blockedExternal, {
        code: 'BLOCKED_EXTERNAL',
        atS: 150,
        ref: candidate.ref
      });
      assert.equal(JSON.stringify(st), before);
    });
  });

test('recycle colonize deploy NPC and self targets stay local in multiplayer classification',
  function () {
    var selfSeed = task3FreshState(140);
    var selfTarget = selfSeed.planets[0].c;
    var playerTarget = {g: 1, h: 2, p: 6};
    var playerKey = G.tdKey(playerTarget);
    var localRows = [
      ['recycle', task3Fleet({id: 1, mission: 'recycle', den: playerTarget, den_t: 160})],
      ['colonize', task3Fleet({id: 2, mission: 'colonize', den: playerTarget, den_t: 160})],
      ['deploy', task3Fleet({id: 3, mission: 'deploy', den: playerTarget, den_t: 160})],
      ['self', task3Fleet({id: 4, mission: 'attack', den: selfTarget, den_t: 160})],
      ['empty', task3Fleet({id: 5, mission: 'attack', den: {g: 1, h: 50, p: 4}, den_t: 160})],
      ['npc', task3Fleet({id: 6, mission: 'attack', den: {g: 1, h: 51, p: 4}, den_t: 160})]
    ];
    task3WithHook(task3PlayerHook(playerKey, 22), function () {
      assert.equal(typeof G.phanLoaiSuKienKe, 'function',
        'task3 local multiplayer classifier function must exist');
      localRows.forEach(function (entry) {
        var st = task3FreshState(140);
        var row = entry[1];
        var callbackKeys = [];
        function ownerForCase(key) {
          callbackKeys.push(key);
          if (entry[0] === 'self' && key === G.tdKey(selfTarget)) return 11;
          return key === playerKey ? 22 : null;
        }
        st.npc[G.tdKey({g: 1, h: 51, p: 4})] = {key: 'npc', c: {g: 1, h: 51, p: 4}};
        st.fleets = [row];
        var before = JSON.stringify(st);
        var candidate = G.phanLoaiSuKienKe(st, 11, {
          multiplayer: true,
          targetAccountForKey: ownerForCase
        });
        assert.equal(candidate && candidate.code, 'LOCAL_EVENT',
          'task3 local multiplayer classifier case ' + entry[0] + ' must stay local');
        assert.equal(candidate && candidate.atS, 160,
          'task3 local multiplayer classifier case ' + entry[0] + ' must keep due second');
        if (entry[0] === 'self') {
          assert.deepEqual(callbackKeys, [G.tdKey(selfTarget)],
            'task3 self local classifier must exercise the equal-owner callback branch');
        }
        var outcome = G.tick(st, 160, {
          remainingBudget: {value: 1},
          multiplayer: true,
          ownerAccountId: 11,
          targetAccountForKey: ownerForCase
        });
        assert.equal(outcome.processed, 1,
          'task3 local multiplayer classifier case ' + entry[0] + ' must process locally');
        assert.notEqual(JSON.stringify(st), before,
          'task3 local multiplayer classifier case ' + entry[0] + ' must mutate locally');
      });
    });
  });

test('missile classification preserves explicit and legacy launch times',
  function () {
    var st = task3FreshState(170);
    var target = {g: 1, h: 4, p: 5};
    var targetKey = G.tdKey(target);
    st.tenLua = [task3Missile({id: 81, den: target, diLuc: 171, khi: 222})];
    task3WithHook(task3PlayerHook(targetKey, 22), function () {
      assert.equal(typeof G.phanLoaiSuKienKe, 'function',
        'task3 missile classifier function must exist');
      var explicit = G.phanLoaiSuKienKe(st, 11, {
        multiplayer: true,
        targetAccountForKey: function () { return 22; }
      });
      assert.equal(explicit.code, 'EXTERNAL_EVENT');
      assert.deepEqual(explicit.ref, {
        kind: 'missile',
        ownerAccountId: 11,
        missileId: 81,
        launchAtS: 171,
        targetKey: targetKey,
        arrivalAtS: 222,
        mission: 'missile'
      });
      st.tenLua = [task3Missile({id: 82, den: target, khi: 260})];
      var legacy = G.phanLoaiSuKienKe(st, 11, {
        multiplayer: true,
        targetAccountForKey: function () { return 22; }
      });
      assert.equal(legacy.ref.launchAtS, 260 - G.tgTenLua(3));
    });
    var launched = task3FreshState(180);
    var launchTarget = {g: 1, h: 2, p: 5};
    launched.tech.impulse = 1;
    launched.planets[0].mis.icbm = 2;
    launched.fleetIdSeq = 900;
    task3WithHook({kiemTraGui: function () { return null; }}, function () {
      assert.equal(G.HANHDONG.banTenLua(launched, {
        pi: 0,
        den: launchTarget,
        n: 1
      }), null, 'task3 actual G.banTenLua action must launch through production action');
    });
    assert.equal(launched.tenLua.length, 1);
    assert.equal(launched.tenLua[0].diLuc, 180,
      'task3 actual G.banTenLua action must capture diLuc at launch');
    assert.equal(launched.tenLua[0].khi, 180 + G.tgTenLua(1));
  });

test('server events derive canonical PVP external and missile jobs from live refs',
  function () {
    var events = task3EventsModule();
    var store = task2StoreModule();
    function task3StableJson(value) {
      if (Array.isArray(value)) return '[' + value.map(task3StableJson).join(',') + ']';
      if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(function (key) {
          return JSON.stringify(key) + ':' + task3StableJson(value[key]);
        }).join(',') + '}';
      }
      return JSON.stringify(value);
    }
    function task3IndependentPvpHash(ref, defenderAccountId) {
      return require('node:crypto').createHash('sha256').update(task3StableJson({
        arrivalAtS: ref.arrivalAtS,
        defenderAccountId: defenderAccountId,
        fleetId: ref.fleetId,
        launchAtS: ref.launchAtS,
        ownerAccountId: ref.ownerAccountId,
        rule: 'pvp-v1',
        targetKey: ref.targetKey
      })).digest('hex');
    }
    var attackRef = {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 71,
      launchAtS: 130,
      targetKey: '1:2:5',
      arrivalAtS: 150,
      mission: 'attack'
    };
    var matchId = events.derivePvpMatchId(attackRef, 22);
    assert.equal(matchId, '31fa1b6a5d6ecf7c882dbf36bd35b2cf0508252196ac6de8a9da629e4baba072');
    assert.equal(matchId, task3IndependentPvpHash(attackRef, 22),
      'task3 derivePvpMatchId must match independently computed canonical hash');
    assert.equal(events.derivePvpMatchId(Object.assign({}, attackRef, {fleetId: 72}), 22),
      task3IndependentPvpHash(Object.assign({}, attackRef, {fleetId: 72}), 22));
    assert.equal(events.derivePvpMatchId(attackRef, 23),
      task3IndependentPvpHash(attackRef, 23));
    assert.notEqual(events.derivePvpMatchId(attackRef, 23), matchId);
    function ownerFor(targetKey) { return targetKey === '1:2:5' ? 22 : null; }
    function withoutKey(base, key) {
      var copy = Object.assign({}, base);
      delete copy[key];
      return copy;
    }
    [
      ['owner', Object.assign({}, attackRef, {ownerAccountId: 12}), 22],
      ['launch', Object.assign({}, attackRef, {launchAtS: 131}), 22],
      ['target', Object.assign({}, attackRef, {targetKey: '1:2:6'}), 22],
      ['arrival', Object.assign({}, attackRef, {arrivalAtS: 151}), 22],
      ['fleet', Object.assign({}, attackRef, {fleetId: 72}), 22],
      ['defender', attackRef, 23]
    ].forEach(function (entry) {
      var changedHash = events.derivePvpMatchId(entry[1], entry[2]);
      assert.equal(changedHash, task3IndependentPvpHash(entry[1], entry[2]),
        'task3 derivePvpMatchId perturb ' + entry[0] + ' must match independent hash');
      assert.notEqual(changedHash, matchId,
        'task3 derivePvpMatchId perturb ' + entry[0] + ' must change the match id');
    });
    [
      ['undefined ref', undefined],
      ['null ref', null],
      ['number ref', 1],
      ['boolean ref', true],
      ['function ref', function () {}],
      ['empty object ref', {}],
      ['scalar ref', 'fleet'],
      ['array ref', []],
      ['missing kind', withoutKey(attackRef, 'kind')],
      ['wrong kind', Object.assign({}, attackRef, {kind: 'missile'})],
      ['extra key', Object.assign({}, attackRef, {extra: true})],
      ['missing owner', withoutKey(attackRef, 'ownerAccountId')],
      ['owner undefined', Object.assign({}, attackRef, {ownerAccountId: undefined})],
      ['owner null', Object.assign({}, attackRef, {ownerAccountId: null})],
      ['owner zero', Object.assign({}, attackRef, {ownerAccountId: 0})],
      ['owner negative', Object.assign({}, attackRef, {ownerAccountId: -1})],
      ['owner fractional', Object.assign({}, attackRef, {ownerAccountId: 11.5})],
      ['owner string', Object.assign({}, attackRef, {ownerAccountId: '11'})],
      ['owner unsafe', Object.assign({}, attackRef, {ownerAccountId: Number.MAX_SAFE_INTEGER + 1})],
      ['malformed owner', Object.assign({}, attackRef, {ownerAccountId: NaN})],
      ['owner infinite', Object.assign({}, attackRef, {ownerAccountId: Infinity})],
      ['owner negative infinite', Object.assign({}, attackRef, {ownerAccountId: -Infinity})],
      ['owner function', Object.assign({}, attackRef, {ownerAccountId: function () {}})],
      ['owner boolean', Object.assign({}, attackRef, {ownerAccountId: false})],
      ['owner object', Object.assign({}, attackRef, {ownerAccountId: {}})],
      ['owner array', Object.assign({}, attackRef, {ownerAccountId: []})],
      ['missing fleet', withoutKey(attackRef, 'fleetId')],
      ['fleet undefined', Object.assign({}, attackRef, {fleetId: undefined})],
      ['fleet null', Object.assign({}, attackRef, {fleetId: null})],
      ['fleet zero', Object.assign({}, attackRef, {fleetId: 0})],
      ['fleet negative', Object.assign({}, attackRef, {fleetId: -71})],
      ['fleet fractional', Object.assign({}, attackRef, {fleetId: 71.5})],
      ['fleet string', Object.assign({}, attackRef, {fleetId: '71'})],
      ['fleet unsafe', Object.assign({}, attackRef, {fleetId: Number.MAX_SAFE_INTEGER + 1})],
      ['fleet NaN', Object.assign({}, attackRef, {fleetId: NaN})],
      ['fleet infinite', Object.assign({}, attackRef, {fleetId: Infinity})],
      ['fleet negative infinite', Object.assign({}, attackRef, {fleetId: -Infinity})],
      ['fleet function', Object.assign({}, attackRef, {fleetId: function () {}})],
      ['fleet boolean', Object.assign({}, attackRef, {fleetId: false})],
      ['fleet object', Object.assign({}, attackRef, {fleetId: {}})],
      ['fleet array', Object.assign({}, attackRef, {fleetId: []})],
      ['missing mission', withoutKey(attackRef, 'mission')],
      ['wrong mission', Object.assign({}, attackRef, {mission: 'transport'})],
      ['mission null', Object.assign({}, attackRef, {mission: null})],
      ['mission number', Object.assign({}, attackRef, {mission: 1})],
      ['mission boolean', Object.assign({}, attackRef, {mission: false})],
      ['mission object', Object.assign({}, attackRef, {mission: {}})],
      ['mission array', Object.assign({}, attackRef, {mission: []})],
      ['mission function', Object.assign({}, attackRef, {mission: function () {}})],
      ['mission empty string', Object.assign({}, attackRef, {mission: ''})],
      ['missing launch', withoutKey(attackRef, 'launchAtS')],
      ['launch undefined', Object.assign({}, attackRef, {launchAtS: undefined})],
      ['launch null', Object.assign({}, attackRef, {launchAtS: null})],
      ['launch string', Object.assign({}, attackRef, {launchAtS: '130'})],
      ['launch negative', Object.assign({}, attackRef, {launchAtS: -1})],
      ['launch fractional', Object.assign({}, attackRef, {launchAtS: 130.5})],
      ['launch NaN', Object.assign({}, attackRef, {launchAtS: NaN})],
      ['launch infinite', Object.assign({}, attackRef, {launchAtS: Infinity})],
      ['launch negative infinite', Object.assign({}, attackRef, {launchAtS: -Infinity})],
      ['launch function', Object.assign({}, attackRef, {launchAtS: function () {}})],
      ['launch boolean', Object.assign({}, attackRef, {launchAtS: false})],
      ['launch object', Object.assign({}, attackRef, {launchAtS: {}})],
      ['launch array', Object.assign({}, attackRef, {launchAtS: []})],
      ['unsafe launch', Object.assign({}, attackRef, {launchAtS: 9007199254741})],
      ['missing arrival', withoutKey(attackRef, 'arrivalAtS')],
      ['arrival undefined', Object.assign({}, attackRef, {arrivalAtS: undefined})],
      ['arrival null', Object.assign({}, attackRef, {arrivalAtS: null})],
      ['arrival string', Object.assign({}, attackRef, {arrivalAtS: '150'})],
      ['arrival negative', Object.assign({}, attackRef, {arrivalAtS: -1})],
      ['arrival fractional', Object.assign({}, attackRef, {arrivalAtS: 150.5})],
      ['arrival NaN', Object.assign({}, attackRef, {arrivalAtS: NaN})],
      ['arrival infinite', Object.assign({}, attackRef, {arrivalAtS: Infinity})],
      ['arrival negative infinite', Object.assign({}, attackRef, {arrivalAtS: -Infinity})],
      ['arrival function', Object.assign({}, attackRef, {arrivalAtS: function () {}})],
      ['arrival boolean', Object.assign({}, attackRef, {arrivalAtS: false})],
      ['arrival object', Object.assign({}, attackRef, {arrivalAtS: {}})],
      ['arrival array', Object.assign({}, attackRef, {arrivalAtS: []})],
      ['unsafe arrival', Object.assign({}, attackRef, {arrivalAtS: 9007199254741})],
      ['launch after arrival', Object.assign({}, attackRef, {launchAtS: 151})],
      ['missing targetKey', withoutKey(attackRef, 'targetKey')],
      ['target null', Object.assign({}, attackRef, {targetKey: null})],
      ['target number', Object.assign({}, attackRef, {targetKey: 125})],
      ['target boolean', Object.assign({}, attackRef, {targetKey: false})],
      ['target object', Object.assign({}, attackRef, {targetKey: {}})],
      ['target array', Object.assign({}, attackRef, {targetKey: []})],
      ['target function', Object.assign({}, attackRef, {targetKey: function () {}})],
      ['malformed target', Object.assign({}, attackRef, {targetKey: '01:2:5'})]
    ].forEach(function (entry) {
      assert.throws(function () {
        events.derivePvpMatchId(entry[1], 22);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
      'task3 derivePvpMatchId malformed ref case ' + entry[0]);
    });
    assert.throws(function () {
      events.derivePvpMatchId({kind: 'fleet', ownerAccountId: 11}, 22);
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
    'task3 derivePvpMatchId strict validator must reject incomplete direct refs');
    [undefined, null, 0, -1, 11, 22.5, '22', NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, false, true, function () {}, {}, []].forEach(function (defender) {
      assert.throws(function () {
        events.derivePvpMatchId(attackRef, defender);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|DEFENDER_ACCOUNT_INVALID/,
      'task3 derivePvpMatchId malformed defender case ' + defender);
    });
    var pvp = events.jobFromRef(attackRef, ownerFor);
    assert.deepEqual(pvp, {
      kind: 'PVP_RESOLVE',
      scheduledAtS: 150,
      priority: 50,
      idempotencyKey: 'pvp-resolve:' + matchId + ':150',
      aggregateType: 'match',
      aggregateId: matchId,
      expectedRevision: null,
      sourceAccountId: 11,
      payload: {schemaVersion: 1, matchId: matchId, ref: attackRef},
      maxAttempts: 8
    });
    assert.deepEqual(store.validateJob(pvp), Object.freeze(Object.assign({}, pvp, {
      payload: Object.freeze(pvp.payload)
    })));

    var transportRef = Object.assign({}, attackRef, {mission: 'transport'});
    var external = events.jobFromRef(transportRef, ownerFor);
    assert.equal(events.externalKey(transportRef),
      'external:fleet:transport:11:71:1:2:5:130:150');
    assert.equal(external.kind, 'EXTERNAL_RESOLVE');
    assert.equal(external.aggregateType, 'fleet');
    assert.equal(external.aggregateId, '71');
    assert.equal(external.expectedRevision, null);
    assert.equal(external.maxAttempts, 8);
    assert.equal(external.idempotencyKey, events.externalKey(transportRef));
    assert.deepEqual(store.validateJob(external).payload.ref, transportRef);
    ['spy', 'hold'].forEach(function (mission) {
      var refForMission = Object.assign({}, attackRef, {mission: mission});
      var jobForMission = events.jobFromRef(refForMission, ownerFor);
      assert.equal(jobForMission.kind, 'EXTERNAL_RESOLVE');
      assert.equal(jobForMission.aggregateType, 'fleet');
      assert.equal(jobForMission.idempotencyKey, events.externalKey(refForMission));
      assert.deepEqual(store.validateJob(jobForMission).payload.ref, refForMission,
        'task3 Task2 validateJob must accept fleet ' + mission + ' job');
    });
    var callbackCalls = 0;
    assert.equal(events.jobFromRef(transportRef, function (targetKey) {
      callbackCalls += 1;
      assert.equal(targetKey, transportRef.targetKey);
      return null;
    }), null);
    assert.equal(callbackCalls, 1,
      'task3 jobFromRef must call targetAccountForKey exactly once for null defender');
    var equalOwnerCalls = 0;
    assert.equal(events.jobFromRef(attackRef, function (targetKey) {
      equalOwnerCalls += 1;
      assert.equal(targetKey, attackRef.targetKey,
        'task3 equal-owner callback must receive the ref target, not infer self coordinate');
      return 11;
    }), null, 'task3 equal-owner defender maps to null independent of self coordinate');
    assert.equal(equalOwnerCalls, 1);
    [
      0, 11, -1, 22.5, '22', Number.MAX_SAFE_INTEGER + 1,
      NaN, Infinity, false, true, {}, []
    ].forEach(function (defender) {
      var calls = 0;
      assert.equal(events.jobFromRef(attackRef, function () {
        calls += 1;
        return defender;
      }), null, 'task3 invalid defender account maps to null ' + defender);
      assert.equal(calls, 1, 'task3 invalid defender callback count ' + defender);
    });
    assert.throws(function () {
      events.jobFromRef(attackRef, null);
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|TARGET_ACCOUNT_FOR_KEY_INVALID/,
    'task3 malformed defender callback shape must reject');
    var ceilingRef = Object.assign({}, transportRef, {
      launchAtS: 9007199254740,
      arrivalAtS: 9007199254740
    });
    assert.equal(events.externalKey(ceilingRef),
      'external:fleet:transport:11:71:1:2:5:9007199254740:9007199254740');
    assert.deepEqual(store.validateJob(events.jobFromRef(ceilingRef, ownerFor)).payload.ref,
      ceilingRef, 'task3 safeSecond ceiling must match Task2 exact maximum');

    var missileRef = {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: 81,
      launchAtS: 171,
      targetKey: '1:4:5',
      arrivalAtS: 222,
      mission: 'missile'
    };
    var missile = events.jobFromRef(missileRef, function (targetKey) {
      return targetKey === '1:4:5' ? 22 : null;
    });
    assert.equal(missile.priority, 51);
    assert.equal(missile.aggregateType, 'missile');
    assert.equal(missile.aggregateId, '81');
    assert.equal(missile.idempotencyKey,
      'external:missile:missile:11:81:1:4:5:171:222');
    assert.deepEqual(store.validateJob(missile).payload.ref, missileRef,
      'task3 Task2 validateJob must accept missile job');

    var liveState = task3FreshState(130);
    var liveFleet = task3Fleet({
      id: 71,
      den: {g: 1, h: 2, p: 5},
      mission: 'attack',
      diLuc: 130,
      den_t: 150
    });
    liveState.fleets.push(liveFleet);
    assert.deepEqual(events.stableFleetRef(11, liveFleet), attackRef,
      'task3 direct stableFleetRef vector must match the durable attack ref');
    assert.equal(events.stableFleetRef(Number.MAX_SAFE_INTEGER, liveFleet).ownerAccountId,
      Number.MAX_SAFE_INTEGER,
      'task3 direct stableFleetRef must accept ownerAccountId safe-integer boundary');
    [undefined, null, 0, -1, 11.5, '11', NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, false, true, function () {}, {}, []].forEach(function (ownerAccountId) {
      assert.throws(function () {
        events.stableFleetRef(ownerAccountId, liveFleet);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|OWNER_ACCOUNT_INVALID/,
      'task3 direct stableFleetRef malformed ownerAccountId case ' + ownerAccountId);
    });
    var boundaryFleet = task3Fleet({
      id: 79,
      den: {g: 1, h: 2, p: 5},
      mission: 'transport',
      diLuc: 9007199254740,
      den_t: 9007199254740
    });
    assert.deepEqual(events.stableFleetRef(11, boundaryFleet), {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 79,
      launchAtS: 9007199254740,
      targetKey: '1:2:5',
      arrivalAtS: 9007199254740,
      mission: 'transport'
    }, 'task3 direct stableFleetRef must accept the Task2 safeSecond ceiling');
    var maxZeroFleet = task3Fleet({
      id: Number.MAX_SAFE_INTEGER,
      den: {g: 1, h: 2, p: 5},
      mission: 'transport',
      diLuc: 0,
      den_t: 0
    });
    assert.deepEqual(events.stableFleetRef(11, maxZeroFleet), {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: Number.MAX_SAFE_INTEGER,
      launchAtS: 0,
      targetKey: '1:2:5',
      arrivalAtS: 0,
      mission: 'transport'
    }, 'task3 direct stableFleetRef must accept max safe entity id and zero-second launch arrival');
    [
      ['undefined row', undefined],
      ['null row', null],
      ['scalar row', 'fleet'],
      ['number row', 1],
      ['boolean row', true],
      ['function row', function () {}],
      ['array row', []],
      ['missing id', withoutKey(liveFleet, 'id')],
      ['undefined id', Object.assign({}, liveFleet, {id: undefined})],
      ['null id', Object.assign({}, liveFleet, {id: null})],
      ['zero id', Object.assign({}, liveFleet, {id: 0})],
      ['negative id', Object.assign({}, liveFleet, {id: -71})],
      ['fractional id', Object.assign({}, liveFleet, {id: 71.5})],
      ['NaN id', Object.assign({}, liveFleet, {id: NaN})],
      ['infinite id', Object.assign({}, liveFleet, {id: Infinity})],
      ['negative infinite id', Object.assign({}, liveFleet, {id: -Infinity})],
      ['string id', Object.assign({}, liveFleet, {id: '71'})],
      ['function id', Object.assign({}, liveFleet, {id: function () {}})],
      ['boolean id', Object.assign({}, liveFleet, {id: false})],
      ['object id', Object.assign({}, liveFleet, {id: {}})],
      ['array id', Object.assign({}, liveFleet, {id: []})],
      ['unsafe id', Object.assign({}, liveFleet, {id: Number.MAX_SAFE_INTEGER + 1})],
      ['missing launch', withoutKey(liveFleet, 'diLuc')],
      ['undefined launch', Object.assign({}, liveFleet, {diLuc: undefined})],
      ['null launch', Object.assign({}, liveFleet, {diLuc: null})],
      ['string launch', Object.assign({}, liveFleet, {diLuc: '130'})],
      ['negative launch', Object.assign({}, liveFleet, {diLuc: -1})],
      ['fractional launch', Object.assign({}, liveFleet, {diLuc: 130.5})],
      ['NaN launch', Object.assign({}, liveFleet, {diLuc: NaN})],
      ['positive infinite launch', Object.assign({}, liveFleet, {diLuc: Infinity})],
      ['negative infinite launch', Object.assign({}, liveFleet, {diLuc: -Infinity})],
      ['function launch', Object.assign({}, liveFleet, {diLuc: function () {}})],
      ['boolean launch', Object.assign({}, liveFleet, {diLuc: false})],
      ['object launch', Object.assign({}, liveFleet, {diLuc: {}})],
      ['array launch', Object.assign({}, liveFleet, {diLuc: []})],
      ['unsafe launch', Object.assign({}, liveFleet, {diLuc: 9007199254741})],
      ['missing arrival', withoutKey(liveFleet, 'den_t')],
      ['undefined arrival', Object.assign({}, liveFleet, {den_t: undefined})],
      ['null arrival', Object.assign({}, liveFleet, {den_t: null})],
      ['string arrival', Object.assign({}, liveFleet, {den_t: '150'})],
      ['negative arrival', Object.assign({}, liveFleet, {den_t: -1})],
      ['fractional arrival', Object.assign({}, liveFleet, {den_t: 150.5})],
      ['NaN arrival', Object.assign({}, liveFleet, {den_t: NaN})],
      ['positive infinite arrival', Object.assign({}, liveFleet, {den_t: Infinity})],
      ['negative infinite arrival', Object.assign({}, liveFleet, {den_t: -Infinity})],
      ['function arrival', Object.assign({}, liveFleet, {den_t: function () {}})],
      ['boolean arrival', Object.assign({}, liveFleet, {den_t: false})],
      ['object arrival', Object.assign({}, liveFleet, {den_t: {}})],
      ['array arrival', Object.assign({}, liveFleet, {den_t: []})],
      ['unsafe arrival', Object.assign({}, liveFleet, {den_t: 9007199254741})],
      ['launch after arrival', Object.assign({}, liveFleet, {diLuc: 151, den_t: 150})],
      ['missing target', withoutKey(liveFleet, 'den')],
      ['malformed target', Object.assign({}, liveFleet, {den: {g: 1, h: 2}})],
      ['wrong mission', Object.assign({}, liveFleet, {mission: 'probe'})]
    ].forEach(function (entry) {
      assert.throws(function () {
        events.stableFleetRef(11, entry[1]);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
      'task3 direct stableFleetRef malformed case ' + entry[0]);
    });
    var liveMissile = task3Missile({
      id: 81,
      den: {g: 1, h: 4, p: 5},
      diLuc: 171,
      khi: 222
    });
    assert.deepEqual(events.stableMissileRef(11, liveMissile), missileRef,
      'task3 direct stableMissileRef vector must preserve explicit launchAtS');
    assert.equal(events.stableMissileRef(Number.MAX_SAFE_INTEGER, liveMissile).ownerAccountId,
      Number.MAX_SAFE_INTEGER,
      'task3 direct stableMissileRef must accept ownerAccountId safe-integer boundary');
    [undefined, null, 0, -1, 11.5, '11', NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, false, true, function () {}, {}, []].forEach(function (ownerAccountId) {
      assert.throws(function () {
        events.stableMissileRef(ownerAccountId, liveMissile);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|OWNER_ACCOUNT_INVALID/,
      'task3 direct stableMissileRef malformed ownerAccountId case ' + ownerAccountId);
    });
    var boundaryMissile = task3Missile({
      id: 83,
      den: {g: 1, h: 4, p: 5},
      diLuc: 9007199254740,
      khi: 9007199254740
    });
    assert.deepEqual(events.stableMissileRef(11, boundaryMissile), {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: 83,
      launchAtS: 9007199254740,
      targetKey: '1:4:5',
      arrivalAtS: 9007199254740,
      mission: 'missile'
    }, 'task3 direct stableMissileRef must accept the Task2 safeSecond ceiling');
    var maxZeroMissile = task3Missile({
      id: Number.MAX_SAFE_INTEGER,
      den: {g: 1, h: 4, p: 5},
      diLuc: 0,
      khi: 0
    });
    assert.deepEqual(events.stableMissileRef(11, maxZeroMissile), {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: Number.MAX_SAFE_INTEGER,
      launchAtS: 0,
      targetKey: '1:4:5',
      arrivalAtS: 0,
      mission: 'missile'
    }, 'task3 direct stableMissileRef must accept max safe entity id and zero-second explicit launch arrival');
    var legacyMissile = task3Missile({
      id: 82,
      den: {g: 1, h: 4, p: 5},
      khi: 260
    });
    var zeroLaunchLegacyMissile = task3Missile({
      id: Number.MAX_SAFE_INTEGER,
      den: {g: 1, h: 4, p: 5},
      khi: G.tgTenLua(3)
    });
    assert.equal(events.stableMissileRef(11, zeroLaunchLegacyMissile).launchAtS, 0,
      'task3 direct stableMissileRef legacy-derived matrix must accept zero-second derived launch');
    assert.equal(events.stableMissileRef(11, zeroLaunchLegacyMissile).missileId,
      Number.MAX_SAFE_INTEGER,
      'task3 direct stableMissileRef legacy-derived matrix must accept max safe entity id');
    [
      ['undefined row', undefined],
      ['null row', null],
      ['scalar row', 'missile'],
      ['number row', 1],
      ['boolean row', true],
      ['function row', function () {}],
      ['array row', []],
      ['missing id', withoutKey(liveMissile, 'id')],
      ['undefined id', Object.assign({}, liveMissile, {id: undefined})],
      ['null id', Object.assign({}, liveMissile, {id: null})],
      ['zero id', Object.assign({}, liveMissile, {id: 0})],
      ['negative id', Object.assign({}, liveMissile, {id: -81})],
      ['fractional id', Object.assign({}, liveMissile, {id: 81.5})],
      ['NaN id', Object.assign({}, liveMissile, {id: NaN})],
      ['infinite id', Object.assign({}, liveMissile, {id: Infinity})],
      ['negative infinite id', Object.assign({}, liveMissile, {id: -Infinity})],
      ['string id', Object.assign({}, liveMissile, {id: '81'})],
      ['function id', Object.assign({}, liveMissile, {id: function () {}})],
      ['boolean id', Object.assign({}, liveMissile, {id: false})],
      ['object id', Object.assign({}, liveMissile, {id: {}})],
      ['array id', Object.assign({}, liveMissile, {id: []})],
      ['unsafe id', Object.assign({}, liveMissile, {id: Number.MAX_SAFE_INTEGER + 1})],
      ['missing target', withoutKey(liveMissile, 'den')],
      ['malformed target', Object.assign({}, liveMissile, {den: {g: 1, h: 4}})],
      ['undefined explicit launch', Object.assign({}, liveMissile, {diLuc: undefined})],
      ['null explicit launch', Object.assign({}, liveMissile, {diLuc: null})],
      ['string explicit launch', Object.assign({}, liveMissile, {diLuc: '171'})],
      ['negative explicit launch', Object.assign({}, liveMissile, {diLuc: -1})],
      ['fractional explicit launch', Object.assign({}, liveMissile, {diLuc: 171.5})],
      ['NaN launch', Object.assign({}, liveMissile, {diLuc: NaN})],
      ['positive infinite explicit launch', Object.assign({}, liveMissile, {diLuc: Infinity})],
      ['negative infinite explicit launch', Object.assign({}, liveMissile, {diLuc: -Infinity})],
      ['function explicit launch', Object.assign({}, liveMissile, {diLuc: function () {}})],
      ['boolean explicit launch', Object.assign({}, liveMissile, {diLuc: false})],
      ['object explicit launch', Object.assign({}, liveMissile, {diLuc: {}})],
      ['array explicit launch', Object.assign({}, liveMissile, {diLuc: []})],
      ['unsafe launch', Object.assign({}, liveMissile, {diLuc: 9007199254741})],
      ['missing arrival', withoutKey(liveMissile, 'khi')],
      ['undefined arrival', Object.assign({}, liveMissile, {khi: undefined})],
      ['null arrival', Object.assign({}, liveMissile, {khi: null})],
      ['string arrival', Object.assign({}, liveMissile, {khi: '222'})],
      ['negative arrival', Object.assign({}, liveMissile, {khi: -1})],
      ['fractional arrival', Object.assign({}, liveMissile, {khi: 222.5})],
      ['NaN arrival', Object.assign({}, liveMissile, {khi: NaN})],
      ['positive infinite arrival', Object.assign({}, liveMissile, {khi: Infinity})],
      ['negative infinite arrival', Object.assign({}, liveMissile, {khi: -Infinity})],
      ['function arrival', Object.assign({}, liveMissile, {khi: function () {}})],
      ['boolean arrival', Object.assign({}, liveMissile, {khi: false})],
      ['object arrival', Object.assign({}, liveMissile, {khi: {}})],
      ['array arrival', Object.assign({}, liveMissile, {khi: []})],
      ['unsafe arrival', Object.assign({}, liveMissile, {khi: 9007199254741})],
      ['explicit launch after arrival', Object.assign({}, liveMissile, {diLuc: 223, khi: 222})],
      ['derived launch undefined arrival', Object.assign({}, legacyMissile, {khi: undefined})],
      ['derived launch null arrival', Object.assign({}, legacyMissile, {khi: null})],
      ['derived launch boolean arrival', Object.assign({}, legacyMissile, {khi: false})],
      ['derived launch object arrival', Object.assign({}, legacyMissile, {khi: {}})],
      ['derived launch array arrival', Object.assign({}, legacyMissile, {khi: []})],
      ['derived launch negative', Object.assign({}, legacyMissile, {
        den: {g: 1, h: 999999999, p: 5}, khi: 1
      })],
      ['derived launch fractional arrival', Object.assign({}, legacyMissile, {khi: 260.5})],
      ['derived launch string arrival', Object.assign({}, legacyMissile, {khi: '260'})],
      ['derived launch NaN arrival', Object.assign({}, legacyMissile, {khi: NaN})],
      ['derived launch positive infinite arrival', Object.assign({}, legacyMissile, {khi: Infinity})],
      ['derived launch negative infinite arrival', Object.assign({}, legacyMissile, {khi: -Infinity})],
      ['derived launch unsafe arrival', Object.assign({}, legacyMissile, {khi: 9007199254741})]
    ].forEach(function (entry) {
      assert.throws(function () {
        events.stableMissileRef(11, entry[1]);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|EXTERNAL_REF_INVALID/,
      'task3 direct stableMissileRef malformed case ' + entry[0]);
    });
    var legacyRef = events.stableMissileRef(11, legacyMissile);
    assert.equal(legacyRef.launchAtS, 260 - G.tgTenLua(3),
      'task3 direct stableMissileRef vector must derive legacy launchAtS');
    assert.equal(legacyRef.missileId, 82);
    var derived = events.deriveExternalJobs(11, liveState, ownerFor);
    assert.equal(derived.length, 1);
    assert.deepEqual(store.validateJob(derived[0]), store.validateJob(pvp));
    var multiState = task3FreshState(130);
    ['attack', 'transport', 'spy', 'hold'].forEach(function (mission, index) {
      multiState.fleets.push(task3Fleet({
        id: 710 + index,
        den: {g: 1, h: 2, p: 5},
        mission: mission,
        diLuc: 130,
        den_t: 150 + index
      }));
    });
    var multiJobs = events.deriveExternalJobs(11, multiState, ownerFor);
    assert.deepEqual(multiJobs.map(function (job) {
      return job.payload.ref.mission;
    }), ['attack', 'transport', 'spy', 'hold'],
    'task3 deriveExternalJobs must derive attack, transport, spy, and hold live fleet jobs');
    multiJobs.forEach(function (job) {
      assert.deepEqual(store.validateJob(job).payload.ref, job.payload.ref,
        'task3 Task2 validateJob must accept derived ' + job.payload.ref.mission + ' job');
    });
    ['attack', 'transport', 'spy', 'hold'].forEach(function (mission, index) {
      var classifyState = task3FreshState(130);
      classifyState.fleets.push(task3Fleet({
        id: 810 + index,
        den: {g: 1, h: 2, p: 5},
        mission: mission,
        diLuc: 130,
        den_t: 180 + index
      }));
      task3WithHook(task3PlayerHook('1:2:5', 22), function () {
        var candidate = G.phanLoaiSuKienKe(classifyState, 11, {
          multiplayer: true,
          targetAccountForKey: ownerFor
        });
        assert.equal(candidate.code, 'EXTERNAL_EVENT',
          'task3 real classifier must classify ' + mission + ' as external');
        assert.equal(candidate.ref.mission, mission,
          'task3 real classifier must preserve external mission ' + mission);
        assert.deepEqual(store.validateJob(events.jobFromRef(candidate.ref, ownerFor)).payload.ref,
          candidate.ref, 'task3 Task2 validateJob must accept real classifier ' + mission + ' job');
      });
    });
  });

test('server events sameExternalRef rejects near misses and canonical status is explicit',
  function () {
    var events = task3EventsModule();
    var st = task3FreshState(190);
    var target = {g: 1, h: 2, p: 5};
    var ref = {
      kind: 'fleet',
      ownerAccountId: 11,
      fleetId: 71,
      launchAtS: 190,
      targetKey: G.tdKey(target),
      arrivalAtS: 210,
      mission: 'transport'
    };
    st.fleets.push(task3Fleet({
      id: 71,
      mission: 'transport',
      den: target,
      diLuc: 190,
      den_t: 210
    }));
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref)), true);
    Object.keys(ref).forEach(function (key) {
      var changed = Object.assign({}, ref);
      changed[key] = key === 'mission' ? 'spy' : '__changed__';
      assert.equal(events.sameExternalRef(ref, changed), false,
        'task3 sameExternalRef field change case ' + key);
      assert.equal(events.sameExternalRef(ref, withoutKey(ref, key)), false,
        'task3 sameExternalRef missing field case ' + key);
    });
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref, {extra: true})), false,
      'task3 sameExternalRef extra field case');
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref, {arrivalAtS: 211})), false);
    assert.equal(events.sameExternalRef(ref, Object.assign({}, ref, {targetKey: '01:2:5'})), false);
    assert.throws(function () {
      events.externalKey(Object.assign({}, ref, {targetKey: '01:2:5'}));
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/);
    assert.throws(function () {
      events.jobFromRef(Object.assign({}, ref, {targetKey: '01:2:5'}), function () { return 22; });
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/);
    var deployRef = Object.assign({}, ref, {mission: 'deploy'});
    assert.equal(events.jobFromRef(deployRef, function () { return 22; }), null,
      'task3 deploy fleet ref maps to null as a local non-external mission');
    assert.throws(function () {
      events.externalKey(deployRef);
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/,
    'task3 deploy fleet ref must not receive an external durable key');
    assert.throws(function () {
      events.jobFromRef(Object.assign({}, ref, {mission: 'probe'}), function () { return 22; });
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/,
    'task3 wrong fleet mission must reject instead of sharing deploy null semantics');
    assert.throws(function () {
      events.jobFromRef(Object.assign({}, ref, {kind: 'unknown'}), function () { return 22; });
    }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|JOB_KIND_INVALID/);
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), ref), 'EXACT');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      launchAtS: 191
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      targetKey: '01:2:5'
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), null), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      kind: 'unknown'
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, st), Object.assign({}, ref, {
      fleetId: undefined
    })), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, task3FreshState(190)), ref),
      'ALREADY_ABSENT');

    var missileState = task3FreshState(200);
    var missileTarget = {g: 1, h: 4, p: 5};
    var missileRef = {
      kind: 'missile',
      ownerAccountId: 11,
      missileId: 81,
      launchAtS: 171,
      targetKey: G.tdKey(missileTarget),
      arrivalAtS: 222,
      mission: 'missile'
    };
    missileState.tenLua.push(task3Missile({
      id: 81,
      den: missileTarget,
      diLuc: 171,
      khi: 222
    }));
    assert.equal(events.canonicalExternalStatus(
      task3KhoForState(11, missileState), missileRef), 'EXACT');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
      Object.assign({}, missileRef, {launchAtS: 172})), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
      Object.assign({}, missileRef, {targetKey: '01:4:5'})), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
      Object.assign({}, missileRef, {missileId: undefined})), 'REF_MISMATCH');
    assert.equal(events.canonicalExternalStatus(task3KhoForState(11, task3FreshState(200)),
      missileRef), 'ALREADY_ABSENT');

    function withoutKey(base, key) {
      var copy = Object.assign({}, base);
      delete copy[key];
      return copy;
    }
    var malformedRefs = [
      ['null ref', null],
      ['array ref', []],
      ['string ref', 'ref'],
      ['empty object ref', {}],
      ['fleet extra key', Object.assign({}, ref, {extra: true})],
      ['missile extra key', Object.assign({}, missileRef, {extra: true})],
      ['fleet wrong key cardinality', Object.assign({}, ref, {missileId: 71})],
      ['missile wrong key cardinality', Object.assign({}, missileRef, {fleetId: 81})],
      ['fleet owner zero', Object.assign({}, ref, {ownerAccountId: 0})],
      ['fleet owner negative', Object.assign({}, ref, {ownerAccountId: -1})],
      ['fleet owner fractional', Object.assign({}, ref, {ownerAccountId: 11.5})],
      ['fleet owner string', Object.assign({}, ref, {ownerAccountId: '11'})],
      ['fleet owner unsafe', Object.assign({}, ref, {ownerAccountId: Number.MAX_SAFE_INTEGER + 1})],
      ['fleet owner NaN', Object.assign({}, ref, {ownerAccountId: NaN})],
      ['fleet owner infinite', Object.assign({}, ref, {ownerAccountId: Infinity})],
      ['fleet id zero', Object.assign({}, ref, {fleetId: 0})],
      ['fleet id negative', Object.assign({}, ref, {fleetId: -71})],
      ['fleet id fractional', Object.assign({}, ref, {fleetId: 71.5})],
      ['fleet id string', Object.assign({}, ref, {fleetId: '71'})],
      ['fleet launch string', Object.assign({}, ref, {launchAtS: '190'})],
      ['fleet launch negative', Object.assign({}, ref, {launchAtS: -1})],
      ['fleet launch fractional', Object.assign({}, ref, {launchAtS: 190.5})],
      ['fleet launch unsafe', Object.assign({}, ref, {launchAtS: 9007199254741})],
      ['fleet launch NaN', Object.assign({}, ref, {launchAtS: NaN})],
      ['fleet launch infinite', Object.assign({}, ref, {launchAtS: Infinity})],
      ['fleet arrival string', Object.assign({}, ref, {arrivalAtS: '210'})],
      ['fleet arrival negative', Object.assign({}, ref, {arrivalAtS: -1})],
      ['fleet arrival fractional', Object.assign({}, ref, {arrivalAtS: 210.5})],
      ['fleet arrival unsafe', Object.assign({}, ref, {arrivalAtS: 9007199254741})],
      ['fleet arrival NaN', Object.assign({}, ref, {arrivalAtS: NaN})],
      ['fleet arrival infinite', Object.assign({}, ref, {arrivalAtS: Infinity})],
      ['fleet launch after arrival', Object.assign({}, ref, {launchAtS: 211})],
      ['fleet leading-zero target', Object.assign({}, ref, {targetKey: '01:2:5'})],
      ['fleet missing planet target', Object.assign({}, ref, {targetKey: '1:2'})],
      ['fleet nonnumeric target', Object.assign({}, ref, {targetKey: '1:a:5'})],
      ['fleet empty target', Object.assign({}, ref, {targetKey: ''})],
      ['fleet missile mission mismatch', Object.assign({}, ref, {mission: 'missile'})],
      ['missile mission mismatch', Object.assign({}, missileRef, {mission: 'attack'})],
      ['missile id zero', Object.assign({}, missileRef, {missileId: 0})],
      ['missile id negative', Object.assign({}, missileRef, {missileId: -81})],
      ['missile id fractional', Object.assign({}, missileRef, {missileId: 81.5})],
      ['missile id string', Object.assign({}, missileRef, {missileId: '81'})],
      ['missile owner unsafe', Object.assign({}, missileRef, {
        ownerAccountId: Number.MAX_SAFE_INTEGER + 1
      })],
      ['missile owner NaN', Object.assign({}, missileRef, {ownerAccountId: NaN})],
      ['missile owner infinite', Object.assign({}, missileRef, {ownerAccountId: Infinity})],
      ['missile leading-zero target', Object.assign({}, missileRef, {targetKey: '1:04:5'})],
      ['missile missing planet target', Object.assign({}, missileRef, {targetKey: '1:4'})],
      ['missile nonnumeric target', Object.assign({}, missileRef, {targetKey: '1:x:5'})],
      ['missile launch unsafe', Object.assign({}, missileRef, {launchAtS: 9007199254741})],
      ['missile launch NaN', Object.assign({}, missileRef, {launchAtS: NaN})],
      ['missile launch infinite', Object.assign({}, missileRef, {launchAtS: Infinity})],
      ['missile arrival unsafe', Object.assign({}, missileRef, {arrivalAtS: 9007199254741})],
      ['missile arrival NaN', Object.assign({}, missileRef, {arrivalAtS: NaN})],
      ['missile arrival infinite', Object.assign({}, missileRef, {arrivalAtS: Infinity})],
      ['missile launch after arrival', Object.assign({}, missileRef, {launchAtS: 223})]
    ];
    Object.keys(ref).forEach(function (key) {
      malformedRefs.push(['fleet missing key ' + key, withoutKey(ref, key)]);
    });
    Object.keys(missileRef).forEach(function (key) {
      malformedRefs.push(['missile missing key ' + key, withoutKey(missileRef, key)]);
    });
    malformedRefs.forEach(function (entry) {
      assert.throws(function () {
        events.externalKey(entry[1]);
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID/,
      'task3 malformed ref externalKey case ' + entry[0]);
      assert.throws(function () {
        events.jobFromRef(entry[1], function () { return 22; });
      }, /PAYLOAD_INTEGRITY|PAYLOAD_VALUE_INVALID|JOB_KIND_INVALID/,
      'task3 malformed ref jobFromRef case ' + entry[0]);
      assert.equal(events.canonicalExternalStatus(task3KhoForState(11, missileState),
        entry[1]), 'REF_MISMATCH',
      'task3 malformed ref status case ' + entry[0]);
    });
  });

test('server events module parses standalone and exports only pure helper names',
  function () {
    var sourcePath = path.resolve(__dirname, '../server/scheduler/events.js');
    var source = fs.readFileSync(sourcePath, 'utf8');
    function task3LoaderTokens(text) {
      var tokens = [];
      var i = 0;
      function isIdStart(ch) { return /[A-Za-z_$]/.test(ch); }
      function isId(ch) { return /[A-Za-z0-9_$]/.test(ch); }
      function readUnicodeEscape(offset) {
        if (text[offset] !== '\\' || text[offset + 1] !== 'u') return null;
        if (text[offset + 2] === '{') {
          var end = text.indexOf('}', offset + 3);
          if (end < 0) return null;
          var pointHex = text.slice(offset + 3, end);
          if (!/^[0-9A-Fa-f]{1,6}$/.test(pointHex)) return null;
          var point = parseInt(pointHex, 16);
          if (point > 0x10ffff) return null;
          return {ch: String.fromCodePoint(point), width: end - offset + 1};
        }
        var hex = text.slice(offset + 2, offset + 6);
        if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return null;
        return {ch: String.fromCharCode(parseInt(hex, 16)), width: 6};
      }
      function readTemplateExpression(offset) {
        var depth = 1;
        var start = offset;
        var j = offset;
        while (j < text.length && depth > 0) {
          if (text[j] === '"' || text[j] === "'" || text[j] === '`') {
            var quote = text[j];
            j += 1;
            while (j < text.length) {
              if (text[j] === '\\') { j += 2; continue; }
              if (text[j] === quote) { j += 1; break; }
              j += 1;
            }
            continue;
          }
          if (text[j] === '{') depth += 1;
          else if (text[j] === '}') depth -= 1;
          j += 1;
        }
        tokens.push.apply(tokens, task3LoaderTokens(text.slice(start, j - 1)));
        return j;
      }
      while (i < text.length) {
        var ch = text[i];
        if (/\s/.test(ch)) { i += 1; continue; }
        if (ch === '/' && text[i + 1] === '/') {
          i += 2;
          while (i < text.length && !/[\n\r]/.test(text[i])) i += 1;
          continue;
        }
        if (ch === '/' && text[i + 1] === '*') {
          i += 2;
          while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
          i += 2;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          var quote = ch;
          var value = '';
          i += 1;
          while (i < text.length) {
            if (text[i] === '\\') { i += 2; continue; }
            if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
              i = readTemplateExpression(i + 2);
              continue;
            }
            if (text[i] === quote) { i += 1; break; }
            if (quote !== '`') value += text[i];
            i += 1;
          }
          tokens.push({type: 'string', value: quote === '`' ? null : value});
          continue;
        }
        var escaped = readUnicodeEscape(i);
        if ((escaped && isIdStart(escaped.ch)) || isIdStart(ch)) {
          var valueId = '';
          while (i < text.length) {
            escaped = readUnicodeEscape(i);
            if (escaped && isId(escaped.ch)) {
              valueId += escaped.ch;
              i += escaped.width;
              continue;
            }
            if (!isId(text[i])) break;
            valueId += text[i];
            i += 1;
          }
          tokens.push({type: 'id', value: valueId});
          continue;
        }
        tokens.push({type: 'p', value: ch});
        i += 1;
      }
      return tokens;
    }
    function assertEventsImportPolicy(text, label) {
      var tokens = task3LoaderTokens(text);
      var requires = [];
      function tok(offset, from) { return tokens[(from || 0) + offset] || {}; }
      function val(offset, from) { return tok(offset, from).value; }
      if (/\[\s*(?:['"`]con['"`]\s*\+\s*['"`]structor['"`]|['"`]con(?:\\u0073|\\u\{73\})tructor['"`]|`constructor`)\s*\]/.test(text) ||
          /\[\s*(?:['"`]get['"`]\s*\+\s*['"`]BuiltinModule['"`]|['"`]_lo['"`]\s*\+\s*['"`]ad['"`])\s*\]/.test(text) ||
          /['"`](?:return\s+)?(?:require|import|module\.constructor|process\.getBuiltinModule|_load)\b/.test(text)) {
        throw new Error('task3 import policy rejected split/string-generated loader in ' + label);
      }
      tokens.forEach(function (token, index) {
        if (token.type === 'string' && token.value === 'constructor') {
          throw new Error('task3 import policy rejected computed constructor loader in ' + label);
        }
        if (token.type !== 'id') return;
        if (token.value === 'constructor') {
          throw new Error('task3 import policy rejected arbitrary constructor acquisition in ' + label);
        }
        if (token.value === 'import') {
          throw new Error('task3 import policy rejected dynamic import in ' + label);
        }
        if (token.value === 'Reflect' || token.value === 'createRequire' ||
            token.value === 'eval' || token.value === 'Function') {
          throw new Error('task3 import policy rejected computed loader in ' + label);
        }
        if (token.value === 'module') {
          if (!(val(1, index) === '.' && val(2, index) === 'exports' && val(3, index) === '=')) {
            throw new Error('task3 import policy rejected module use in ' + label);
          }
          return;
        }
        if ((token.value === 'global' || token.value === 'globalThis') &&
            (val(1, index) === '[' ||
             (val(1, index) === '.' && val(2, index) === 'require') ||
             (val(1, index) === '.' && val(2, index) === 'constructor'))) {
          throw new Error('task3 import policy rejected indirect loader in ' + label);
        }
        if (token.value === 'process' &&
            (val(1, index) === '[' ||
             (val(1, index) === '.' && val(2, index) === 'mainModule') ||
             (val(1, index) === '.' && val(2, index) === 'getBuiltinModule'))) {
          throw new Error('task3 import policy rejected indirect loader in ' + label);
        }
        if (token.value === 'G' && (val(1, index) === '.' || val(1, index) === '[')) {
          for (var j = index + 2; j < Math.min(tokens.length, index + 8); j += 1) {
            if (tokens[j].value === '=') {
              throw new Error('task3 import policy rejected G mutation in ' + label);
            }
          }
        }
        if (token.value !== 'require') return;
        if (val(-1, index) === '.' || val(1, index) !== '(') {
          throw new Error('task3 import policy rejected alias require in ' + label);
        }
        if (tok(2, index).type !== 'string' || val(3, index) !== ')') {
          throw new Error('task3 import policy rejected nonliteral require in ' + label);
        }
        requires.push(tok(2, index).value);
      });
      requires.sort();
      assert.deepEqual(requires, ['../rules.js', 'node:crypto'].sort(),
        'task3 import policy exact allowlist in ' + label);
      requires.forEach(function (request) {
        assert.equal(['../rules.js', 'node:crypto'].indexOf(request) >= 0, true,
          'task3 import policy rejected runtime import ' + request + ' in ' + label);
      });
      assert.equal(/\bDate\s*\.\s*now\b|new\s+SchedulerStore\b|new\s+Kho\b/.test(text),
        false, 'task3 import policy rejected runtime side effect in ' + label);
      assert.equal(/\bperformance\s*\.\s*now\b|\bprocess\s*\.\s*hrtime\b|new\s+Date\b/.test(text),
        false, 'task3 import policy rejected wall-clock side effect in ' + label);
      assert.equal(/Object\s*\.\s*assign\s*\(\s*G\b|Reflect\s*\.\s*set\s*\(\s*G\b/.test(text),
        false, 'task3 import policy rejected G mutation in ' + label);
    }
    assertEventsImportPolicy(source, 'events.js');
    [
      ['dead-branch literal require', "if (false) require('./store.js');"],
      ['comment-spaced literal require', "require /* hidden */ ('./store.js');"],
      ['dynamic nonliteral require', "require('./' + 'store.js');"],
      ['template interpolation require', "`${require('./store.js')}`;"],
      ['escaped identifier require', "var loader = requ\\u0069re; loader('./store.js');"],
      ['code-point escaped identifier require', "var loader = requ\\u{69}re; loader('./store.js');"],
      ['dynamic import', "import('./store.js');"],
      ['escaped identifier import', "im\\u0070ort('./store.js');"],
      ['comment-spaced dynamic import', "import /* hidden */ ('./store.js');"],
      ['module require', "module.require('./store.js');"],
      ['computed module require', "module['require']('./store.js');"],
      ['module constructor load', "module.constructor._load('./store.js');"],
      ['require resolve member', "require['resolve']('./store.js');"],
      ['aliased require', "var loader = require; loader('./store.js');"],
      ['delayed dead branch loader', "if (false) setImmediate(function () { require('./store.js'); });"],
      ['process mainModule require', "process.mainModule.require('./store.js');"],
      ['process builtin module load',
        "process.getBuiltinModule('module')._load('./store.js', null, false);"],
      ['global require', "globalThis.require('./store.js');"],
      ['computed global require', "globalThis['require']('./store.js');"],
      ['alternate constructor loader',
        "globalThis.constructor.constructor('return require')()('./store.js');"],
      ['arbitrary constructor loader',
        "({}).constructor.constructor('return require')()('./store.js');"],
      ['computed constructor loader',
        "var key = 'constructor'; globalThis[key][key]('return require')()('./store.js');"],
      ['split string constructor key',
        "globalThis['con' + 'structor']['constructor']('return require')()('./store.js');"],
      ['unicode string constructor key',
        "globalThis['con\\u0073tructor']['constructor']('return require')()('./store.js');"],
      ['code-point string constructor key',
        "globalThis['con\\u{73}tructor']['constructor']('return require')()('./store.js');"],
      ['template computed constructor key',
        "globalThis[`constructor`]['constructor']('return require')()('./store.js');"],
      ['Reflect apply require', "Reflect.apply(require, null, ['./store.js']);"],
      ['Reflect get module require', "Reflect.get(module, 'require')('./store.js');"],
      ['forged parent module load',
        "module.constructor._load('./store.js', {filename: __filename}, false);"],
      ['parentless module load', "module.constructor._load('./store.js', null, false);"],
      ['createRequire loader', "var cr = createRequire(__filename);"],
      ['eval loader', "eval('require(\"./store.js\")');"],
      ['Function loader', "Function('return require(\"./store.js\")')();"],
      ['Function string-generated loader',
        "var body = 'return require'; Function(body)()('./store.js');"],
      ['string timer generated loader', "setTimeout('require(\"./store.js\")', 0);"],
      ['Promise delayed loader',
        "if (false) Promise.resolve().then(function () { require('./store.js'); });"],
      ['Promise delayed Function loader',
        "Promise.resolve().then(Function('return require(\"./store.js\")'));"],
      ['split getBuiltinModule load',
        "process['get' + 'BuiltinModule']('module')['_lo' + 'ad']('./store.js', null, false);"],
      ['G direct mutation', "G.bad = true;"],
      ['G object assign mutation', "Object.assign(G, {bad: true});"],
      ['performance wall clock', "var t = performance.now();"],
      ['Date wall clock', "var d = new Date();"]
    ].forEach(function (entry) {
      assert.throws(function () {
        assertEventsImportPolicy(
          "require('node:crypto');\nrequire('../rules.js');\n" + entry[1],
          entry[0]
        );
      }, /task3 import policy/,
      'task3 import policy negative corpus case ' + entry[0]);
    });
    var Module = require('node:module');
    var oldLoad = Module._load;
    var seenDirect = [];
    delete require.cache[require.resolve(sourcePath)];
    try {
      Module._load = function (request, parent, isMain) {
        if ((!parent || parent.filename !== sourcePath) &&
            (request === './store.js' || /server\/scheduler\/store\.js$/.test(request))) {
          throw new Error('events.js rejected forged or parentless cold-load import ' + request);
        }
        if (parent && parent.filename === sourcePath) {
          seenDirect.push(request);
          if (['../rules.js', 'node:crypto'].indexOf(request) < 0) {
            throw new Error('events.js disallowed cold-load import ' + request);
          }
        }
        return oldLoad.apply(this, arguments);
      };
      require(sourcePath);
    } finally {
      Module._load = oldLoad;
      delete require.cache[require.resolve(sourcePath)];
      task3EventsCache = null;
    }
    assert.deepEqual(Array.from(new Set(seenDirect)).sort(),
      ['../rules.js', 'node:crypto'].sort());
    [
      ['parentless runtime import', './store.js', null],
      ['forged-parent runtime import', './store.js', {filename: __filename}],
      ['disallowed source runtime import', './store.js', {filename: sourcePath}]
    ].forEach(function (entry) {
      var rejected = false;
      try {
        Module._load = function (request, parent) {
          if (!parent || parent.filename !== sourcePath ||
              ['../rules.js', 'node:crypto'].indexOf(request) < 0) {
            throw new Error('task3 import policy rejected runtime loader ' + entry[0]);
          }
          return oldLoad.apply(this, arguments);
        };
        Module._load(entry[1], entry[2], false);
      } catch (error) {
        rejected = /task3 import policy rejected runtime loader/.test(String(error));
      } finally {
        Module._load = oldLoad;
      }
      assert.equal(rejected, true,
        'task3 import policy runtime negative corpus case ' + entry[0]);
    });
    var events = task3EventsModule();
    assert.deepEqual(Object.keys(events).sort(), [
      'canonicalExternalStatus',
      'deriveExternalJobs',
      'derivePvpMatchId',
      'externalKey',
      'jobFromRef',
      'sameExternalRef',
      'stableFleetRef',
      'stableMissileRef'
    ].sort());
    assert.deepEqual(events.deriveExternalJobs(11, task3FreshState(220),
      function () { return null; }), []);
  });

test('G.chay defers the action closure when preaction tick is partial',
  function () {
    var st = task3FreshState(230);
    var oldTick = G.tick;
    var oldGiay = G.giay;
    var oldAction = G.HANHDONG.__task3Partial;
    var ran = false;
    try {
      G.giay = function () { return 231; };
      G.tick = function () { return task3TickOutcomePartial(230); };
      G.HANHDONG.__task3Partial = function () { ran = true; return null; };
      var result = G.chay(st, '__task3Partial', {});
      assert.deepEqual(result, G.TICK_PARTIAL,
        'task3 G.chay must convert budget exhaustion to the local sentinel');
      assert.equal(ran, false,
        'task3 G.chay must not run action closure while budget exhausted');

      G.tick = function () {
        return {
          processed: 0,
          advancedToS: 230,
          nextDueAtS: 230,
          hasMoreDue: true,
          budgetExhausted: false,
          blockedExternal: {code: 'BLOCKED_EXTERNAL', atS: 230, ref: {kind: 'fleet'}}
        };
      };
      result = G.chay(st, '__task3Partial', {});
      assert.deepEqual(result, G.TICK_PARTIAL,
        'task3 G.chay must convert blockedExternal to the local sentinel');
      assert.equal(ran, false,
        'task3 G.chay must not run action closure while blockedExternal');

      var target = {g: 1, h: 5, p: 5};
      var targetKey = G.tdKey(target);
      var realExternal = task3FreshState(230);
      realExternal.fleets.push(task3Fleet({
        id: 93,
        den: target,
        mission: 'attack',
        diLuc: 230,
        den_t: 231
      }));
      var beforeRealExternal = JSON.stringify(realExternal.fleets);
      var receivedTickArgs = null;
      G.tick = function (receivedState, targetS) {
        receivedTickArgs = {state: receivedState, targetS: targetS};
        return oldTick(receivedState, targetS, {
          remainingBudget: {value: 1},
          multiplayer: true,
          ownerAccountId: 11,
          targetAccountForKey: function (key) { return key === targetKey ? 22 : null; }
        });
      };
      ran = false;
      result = task3WithHook(task3PlayerHook(targetKey, 22), function () {
        return G.chay(realExternal, '__task3Partial', {});
      });
      assert.equal(receivedTickArgs && receivedTickArgs.state, realExternal,
        'task3 G.chay real external fixture must pass the same state to G.tick');
      assert.equal(receivedTickArgs && receivedTickArgs.targetS, 231,
        'task3 G.chay real external fixture must pass G.giay target to G.tick');
      assert.deepEqual(result, G.TICK_PARTIAL,
        'task3 G.chay real external fixture must convert real blockedExternal');
      assert.equal(ran, false,
        'task3 G.chay real external fixture must not run action closure');
      assert.equal(JSON.stringify(realExternal.fleets), beforeRealExternal,
        'task3 G.chay real external fixture must leave external fleet unmutated');

      G.tick = function () { return G.TICK_PARTIAL; };
      assert.throws(function () {
        G.chay(st, '__task3Partial', {});
      }, /TICK_SENTINEL_FROM_TICK_INVALID/,
      'task3 G.chay must reject illegal sentinel returns from G.tick');
      assert.equal(ran, false);
    } finally {
      G.tick = oldTick;
      G.giay = oldGiay;
      if (oldAction === undefined) delete G.HANHDONG.__task3Partial;
      else G.HANHDONG.__task3Partial = oldAction;
    }
  });

test('local APP.lam validates input and serializes TickOutcome continuations',
  async function () {
    var f = task3LocalBrowserFixture();
    var browserKeys = [
      'window', 'document', 'localStorage', 'setTimeout', 'setInterval', 'fetch',
      'navigator', 'location', 'confirm', 'FileReader', 'Blob', 'URL'
    ];
    var beforeDescriptors = {};
    browserKeys.forEach(function (key) {
      beforeDescriptors[key] = Object.getOwnPropertyDescriptor(global, key);
    });
    await task3WithBrowser(f.win, async function () {
      task3RequireBrowserFile('js/main.js');
      var callbacks = [];
      var upgradeCalls = 0;
      var laTickPartialCalls = 0;
      var tickOutcomeBridgeCalls = 0;
      var oldUpgrade = f.win.G.nangCapState;
      var oldLaTickPartial = f.win.G.laTickPartial;
      var oldTickOutcomeNeedsDeferral = f.win.G.tickOutcomeNeedsDeferral;
      f.win.G.nangCapState = function () {
        upgradeCalls += 1;
        return oldUpgrade.apply(this, arguments);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        tickOutcomeBridgeCalls += 1;
        return oldTickOutcomeNeedsDeferral.call(this, value);
      };
      f.actionResults.splice(0, f.actionResults.length, null, null, null);
      f.win.APP.lam('bad action name over twenty four chars', {}, function (err) {
        callbacks.push(err);
      });
      f.win.APP.lam('docHet', [], function (err) { callbacks.push(err); });
      f.win.APP.lam('abcdefghijklmnopqrstuvwxy', {}, function (err) {
        callbacks.push('name25:' + err);
      });
      f.win.APP.lam('abcdefghijklmnopqrstuvwx', {}, function (err) {
        callbacks.push('name24:' + err);
      });
      f.win.APP.lam('docHet', function () {}, function (err) {
        callbacks.push('function:' + err);
      });
      f.win.APP.lam('docHet', new Date(0), function (err) {
        callbacks.push('date:' + err);
      });
      var customPayload = Object.create({x: 1});
      customPayload.ok = true;
      f.win.APP.lam('docHet', customPayload, function (err) {
        callbacks.push('custom:' + err);
      });
      assert.deepEqual(callbacks, [
        'Hành động không hợp lệ.',
        'Dữ liệu hành động không hợp lệ.',
        'name25:Hành động không hợp lệ.',
        'name24:null',
        'function:Dữ liệu hành động không hợp lệ.',
        'date:Dữ liệu hành động không hợp lệ.',
        'custom:Dữ liệu hành động không hợp lệ.'
      ], 'task3 local invalid action/data validation must reject before G.chay');
      assert.equal(f.counters.actions, 1,
        'task3 exact 24-char action name must execute while invalid inputs do not');
      assert.equal(upgradeCalls, 0,
        'task3 invalid local input must not call G.nangCapState before validation');
      f.actionResults.splice(0, f.actionResults.length, null);
      assert.doesNotThrow(function () {
        f.win.APP.lam('docHet', {}, 'not-a-callback');
      });
      assert.equal(f.counters.actions, 2);
      assert.equal(f.timers.length, 0);

      f.effects.splice(0, f.effects.length);
      f.actionResults.splice(0, f.actionResults.length,
        {deferred: true, code: 'TICK_PARTIAL'}, null, null);
      f.win.APP.lam('docHet', {}, function (err) { callbacks.push(err); });
      f.win.APP.lam('docHet', {}, function (err) { callbacks.push('second:' + err); });
      assert.equal(callbacks.length, 7,
        'task3 partial action must defer callback while invalid callbacks stay recorded');
      assert.equal(f.timers.length, 1,
        'task3 partial action must schedule exactly one continuation');
      assert.ok(f.saves.length >= 1);
      assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
      f.timers.shift()();
      await task3FlushUntilSettled(function () {
        return callbacks.length === 9;
      }, 'local APP.lam queued callbacks');
      assert.deepEqual(callbacks.slice(7), [null, 'second:null']);
      assert.equal(f.counters.actions, 5);
      assert.equal(laTickPartialCalls > 0, true,
        'task3 local APP.lam must consult G.laTickPartial for structural sentinels');
      assert.equal(tickOutcomeBridgeCalls, 0,
        'task3 local APP.lam action path must not use TickOutcome bridge directly');
      assert.ok(f.saves.length >= 1);
    });
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 browser descriptor restored after success for ' + key);
    });
    await assert.rejects(task3WithBrowser(f.win, async function () {
      throw new Error('TASK3_BROWSER_BODY_FAILURE');
    }), /TASK3_BROWSER_BODY_FAILURE/);
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 browser descriptor restored after failure for ' + key);
    });
  });

test('local APP.lam caps one action at 1000 partial continuations',
  async function () {
    var f = task3LocalBrowserFixture();
    await task3WithBrowser(f.win, async function () {
      task3RequireBrowserFile('js/main.js');
      f.elements['kd-batdau'].onclick();
      assert.equal(f.timers.length, 1,
        'task3 local cap private ST startup must schedule the first continuation');
      f.timers.shift()();
      await task3FlushUntilSettled(function () {
        return f.counters.ticks === 2;
      }, 'local cap private ST startup');
      f.effects.splice(0, f.effects.length);
      f.saves.splice(0, f.saves.length);
      f.timers.splice(0, f.timers.length);
      f.counters.actions = 0;
      f.win.G.chay = function (st) {
        f.counters.actions += 1;
        st.capMarker = f.counters.actions;
        return f.win.G.TICK_PARTIAL;
      };
      var callbacks = [];
      f.win.APP.lam('docHet', {}, function (err) { callbacks.push(err); });
      for (var i = 0; i < 999; i += 1) {
        assert.equal(f.timers.length, 1,
          'task3 1000-cap action must keep one pending timer before cap');
        f.timers.shift()();
        assert.equal(callbacks.length, 0,
          'task3 1000-cap action must not callback before exact cap');
      }
      var savesBeforeCap = f.saves.length;
      assert.equal(f.timers.length, 1,
        'task3 1000-cap action must enter the exact cap with one timer');
      f.timers.shift()();
      assert.deepEqual(callbacks, ['Tua thời gian quá dài, hãy thử lại.'],
        'task3 1000-cap action must callback once with the cap error');
      assert.equal(f.saves.length, savesBeforeCap + 1,
        'task3 1000-cap action must save the latest partial state at cap');
      assert.equal(JSON.parse(f.saves[f.saves.length - 1][1]).capMarker,
        f.counters.actions,
        'task3 1000-cap latest save must contain the exact final partial marker');
      assert.equal(f.timers.length, 0,
        'task3 1000-cap action must not schedule another timer after cap');
    });
  });

test('local startup partial tick schedules one macrotask continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    await task3WithBrowser(f.win, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = f.win.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = f.win.G.laTickPartial;
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/main.js');
        f.effects.splice(0, f.effects.length);
        f.elements['kd-batdau'].onclick();
        assert.equal(f.counters.ticks, 1);
        assert.equal(bridgeCalls, 1,
          'task3 startup must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(f.timers.length, 1,
          'task3 startup partial tick must schedule one macrotask continuation');
        assert.ok(f.saves.length >= 1);
        assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
        f.timers.shift()();
        await task3FlushUntilSettled(function () {
          return f.counters.ticks === 2;
        }, 'startup partial continuation completion');
        assert.equal(bridgeCalls, 2,
          'task3 startup must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 startup bridge must use G.laTickPartial for frozen sentinel checks');
        assert.ok(f.saves.length >= 1);
      } finally {
        f.win.G.tickOutcomeNeedsDeferral = oldBridge;
        f.win.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('local paste import schedules a partial checkpoint before continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    await task3WithBrowser(f.win, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = f.win.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = f.win.G.laTickPartial;
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/main.js');
        assert.equal(f.elements['nhap-js'].id, 'nhap-js',
          'task3 paste import fixture must precreate nhap-js');
        f.effects.splice(0, f.effects.length);
        f.elements['nhap-js'].value = JSON.stringify(f.state);
        f.win.APP.ACT['nhap-ok']();
        assert.equal(f.counters.ticks, 1);
        assert.equal(bridgeCalls, 1,
          'task3 paste import must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(f.timers.length, 1,
          'task3 paste import partial checkpoint must schedule one continuation');
        assert.ok(f.saves.length >= 1);
        assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
        f.timers.shift()();
        await task3FlushUntilSettled(function () {
          return f.counters.ticks === 2;
        }, 'paste import partial continuation completion');
        assert.equal(bridgeCalls, 2,
          'task3 paste import must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 paste import bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        f.win.G.tickOutcomeNeedsDeferral = oldBridge;
        f.win.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('local file import schedules a partial checkpoint before continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    var readerInstance = null;
    f.win.FileReader = function () {
      readerInstance = this;
      this.readAsText = function () {
        this.result = JSON.stringify(f.state);
        this.onload();
      };
    };
    await task3WithBrowser(f.win, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = f.win.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = f.win.G.laTickPartial;
      f.win.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      f.win.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/main.js');
        f.effects.splice(0, f.effects.length);
        f.win.APP.doiFile({target: {id: 'file-nhap', files: [{name: 'save.json'}]}});
        assert.ok(readerInstance);
        assert.equal(f.counters.ticks, 1);
        assert.equal(bridgeCalls, 1,
          'task3 file import must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(f.timers.length, 1,
          'task3 file import partial checkpoint must schedule one continuation');
        assert.ok(f.saves.length >= 1);
        assert.deepEqual(f.effects.slice(0, 2), ['save', 'timer']);
        f.timers.shift()();
        await task3FlushUntilSettled(function () {
          return f.counters.ticks === 2;
        }, 'file import partial continuation completion');
        assert.equal(bridgeCalls, 2,
          'task3 file import must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 file import bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        f.win.G.tickOutcomeNeedsDeferral = oldBridge;
        f.win.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('shared heartbeat interval schedules exactly one partial continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    var heartbeatElements = {};
    var heartbeatTimers = [];
    var heartbeatIntervals = [];
    var heartbeatWin = {
      document: task3Document(heartbeatElements),
      setTimeout: function (fn) { heartbeatTimers.push(fn); return heartbeatTimers.length; },
      setInterval: function (fn) { heartbeatIntervals.push(fn); return heartbeatIntervals.length; },
      G: f.win.G,
      U: f.win.U,
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    };
    heartbeatWin.window = heartbeatWin;
    heartbeatWin.ST = f.state;
    await task3WithBrowser(heartbeatWin, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = heartbeatWin.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = heartbeatWin.G.laTickPartial;
      heartbeatWin.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      heartbeatWin.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/app.js');
        heartbeatWin.APP.batDauNhip();
        assert.equal(heartbeatIntervals.length, 1);
        heartbeatIntervals[0]();
        assert.equal(bridgeCalls, 1,
          'task3 heartbeat must call G.tickOutcomeNeedsDeferral for the partial TickOutcome');
        assert.equal(heartbeatTimers.length, 1,
          'task3 heartbeat partial tick must schedule exactly one continuation');
        heartbeatTimers.shift()();
        assert.equal(f.counters.ticks, 2);
        assert.equal(bridgeCalls, 2,
          'task3 heartbeat must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 heartbeat bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        heartbeatWin.G.tickOutcomeNeedsDeferral = oldBridge;
        heartbeatWin.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('visibility heartbeat does not duplicate an already pending continuation',
  async function () {
    var f = task3LocalBrowserFixture();
    var heartbeatElements = {};
    var heartbeatTimers = [];
    var heartbeatIntervals = [];
    var heartbeatWin = {
      document: task3Document(heartbeatElements),
      setTimeout: function (fn) { heartbeatTimers.push(fn); return heartbeatTimers.length; },
      setInterval: function (fn) { heartbeatIntervals.push(fn); return heartbeatIntervals.length; },
      G: f.win.G,
      U: f.win.U,
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    };
    heartbeatWin.window = heartbeatWin;
    heartbeatWin.ST = f.state;
    await task3WithBrowser(heartbeatWin, async function () {
      var bridgeCalls = 0;
      var laTickPartialCalls = 0;
      var oldBridge = heartbeatWin.G.tickOutcomeNeedsDeferral;
      var oldLaTickPartial = heartbeatWin.G.laTickPartial;
      heartbeatWin.G.tickOutcomeNeedsDeferral = function (value) {
        bridgeCalls += 1;
        return oldBridge.call(this, value);
      };
      heartbeatWin.G.laTickPartial = function (value) {
        laTickPartialCalls += 1;
        return oldLaTickPartial.call(this, value);
      };
      try {
        task3RequireBrowserFile('js/app.js');
        heartbeatWin.APP.batDauNhip();
        assert.equal(heartbeatIntervals.length, 1);
        heartbeatIntervals[0]();
        assert.equal(bridgeCalls, 1,
          'task3 visibility flow must call G.tickOutcomeNeedsDeferral for the pending partial');
        assert.equal(heartbeatTimers.length, 1,
          'task3 visibility fixture must start with one pending continuation');
        heartbeatIntervals[0]();
        assert.equal(bridgeCalls, 1,
          'task3 second heartbeat interval must not tick while a continuation is pending');
        assert.equal(heartbeatTimers.length, 1,
          'task3 second heartbeat interval must not duplicate a pending continuation');
        heartbeatElements['event:visibilitychange']();
        assert.equal(bridgeCalls, 1,
          'task3 visibility event must not tick while interval continuation is pending');
        assert.equal(heartbeatTimers.length, 1,
          'task3 interval plus visibility overlap must not duplicate a pending continuation');
        heartbeatTimers.shift()();
        assert.equal(f.counters.ticks, 2);
        assert.equal(bridgeCalls, 2,
          'task3 visibility flow must call G.tickOutcomeNeedsDeferral for completion');
        f.tickOutcomes.push(task3TickOutcomePartial(240), task3TickOutcomeComplete(240));
        heartbeatElements['event:visibilitychange']();
        assert.equal(bridgeCalls, 3,
          'task3 visibility event after drain must call G.tickOutcomeNeedsDeferral again');
        assert.equal(heartbeatTimers.length, 1);
        heartbeatTimers.shift()();
        assert.equal(f.counters.ticks, 4);
        assert.equal(bridgeCalls, 4,
          'task3 visibility second continuation must call G.tickOutcomeNeedsDeferral for completion');
        assert.equal(laTickPartialCalls > 0, true,
          'task3 visibility bridge must use G.laTickPartial for frozen sentinel checks');
      } finally {
        heartbeatWin.G.tickOutcomeNeedsDeferral = oldBridge;
        heartbeatWin.G.laTickPartial = oldLaTickPartial;
      }
    });
  });

test('MP startup and action transport code stay separate from the local sentinel',
  async function () {
    var base = task3LocalBrowserFixture();
    var mpCallbacks = [];
    var fetchCalls = [];
    var lamCalls = 0;
    var browserKeys = [
      'window', 'document', 'localStorage', 'setTimeout', 'setInterval', 'fetch',
      'navigator', 'location', 'confirm', 'FileReader', 'Blob', 'URL'
    ];
    var beforeDescriptors = {};
    browserKeys.forEach(function (key) {
      beforeDescriptors[key] = Object.getOwnPropertyDescriptor(global, key);
    });
    var lamReplies = [{
      ok: true,
      status: 200,
      body: {loi: 'Máy chủ đang đồng bộ (fulfilled).', code: 'TICK_PARTIAL'}
    }, {
      ok: false,
      status: 503,
      body: {loi: 'Máy chủ đang đồng bộ (rejected).', code: 'TICK_PARTIAL'}
    }];
    var mpElements = {};
    var mpWin = {
      document: task3Document(mpElements),
      localStorage: {
        getItem: function () { return 'tok'; },
        setItem: function () {},
        removeItem: function () {}
      },
      setTimeout: function () {},
      setInterval: function () {},
      fetch: function (url, opt) {
        fetchCalls.push({url: url, opt: opt || {}});
        if (url === '/api/lam') lamCalls += 1;
        var lamReply = lamReplies[Math.min(lamCalls - 1, lamReplies.length - 1)];
        return Promise.resolve({
          ok: url === '/api/lam' ? lamReply.ok : true,
          status: url === '/api/lam' ? lamReply.status : 200,
          json: function () {
            if (url === '/api/lam') {
              return Promise.resolve(lamReply.body);
            }
            if (url === '/api/state') return Promise.resolve({st: base.state});
            return Promise.resolve({now: 240, seed: 's', soNguoi: 1, soHT: 1, tocDo: 1, chuKy: 3600});
          }
        });
      },
      G: Object.assign({}, base.win.G, {
        MO_PHONG_NHE: false,
        LECH_GIO: 0,
        laTickPartial: function (value) {
          if (value && value.code === 'TICK_PARTIAL' && value.deferred !== true) {
            throw new Error('transport code used as local sentinel');
          }
          return !!value && value.deferred === true && value.code === 'TICK_PARTIAL';
        }
      }),
      U: Object.assign({}, base.win.U, {
        man: 'tongquan',
        pi: 0,
        sig: function () { return 'sig'; },
        sigCu: '',
        mpMoi: function () { return {}; }
      }),
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    };
    mpWin.window = mpWin;
    await task3WithBrowser(mpWin, async function () {
      task3RequireBrowserFile('web/js/mp.js');
      assert.equal(typeof mpWin.APP.batDauNhip, 'function',
        'task3 MP fixture must provide no-op batDauNhip');
      await task3FlushUntilSettled(function () {
        return fetchCalls.some(function (call) { return call.url === '/api/thongtin'; }) &&
          fetchCalls.some(function (call) { return call.url === '/api/state'; });
      }, 'MP startup thongtin and state fetches');
      assert.ok(fetchCalls.some(function (call) { return call.url === '/api/thongtin'; }));
      assert.ok(fetchCalls.some(function (call) { return call.url === '/api/state'; }));
      assert.equal(base.counters.ticks, 0);
      mpWin.APP.lam('docHet', {}, function (err, meta) {
        mpCallbacks.push({err: err, code: meta && meta.code});
      });
      assert.equal(mpCallbacks.length, 0,
        'task3 MP fulfilled-body partial callback must settle asynchronously');
      await task3FlushUntilSettled(function () {
        return mpCallbacks.length === 1;
      }, 'MP fulfilled-body TICK_PARTIAL callback');
      mpWin.APP.lam('docHet', {}, function (err, meta) {
        mpCallbacks.push({err: err, code: meta && meta.code});
      });
      assert.equal(mpCallbacks.length, 1,
        'task3 MP rejected-error partial callback must settle asynchronously');
      await task3FlushUntilSettled(function () {
        return mpCallbacks.length === 2;
      }, 'MP rejected-error TICK_PARTIAL callback');
      assert.deepEqual(mpCallbacks, [{
        err: 'Máy chủ đang đồng bộ (fulfilled).',
        code: 'TICK_PARTIAL'
      }, {
        err: 'Máy chủ đang đồng bộ (rejected).',
        code: 'TICK_PARTIAL'
      }], 'task3 MP partial callbacks must distinguish fulfilled body and rejected error');
      assert.equal(fetchCalls.filter(function (call) {
        return call.url === '/api/lam';
      }).length, 2);
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(mpCallbacks.length, 2,
        'task3 MP test must await all action callback microtasks before descriptor restore');
      var fetchCountBeforeRestore = fetchCalls.length;
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(fetchCalls.length, fetchCountBeforeRestore,
        'task3 MP success path must have no async fetch leak before descriptor restore');
      assert.equal(base.counters.ticks, 0);
    });
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 MP browser descriptor restored after success for ' + key);
    });
    var failFetchCalls = [];
    var failElements = {};
    var failWin = Object.assign({}, mpWin, {
      document: task3Document(failElements),
      fetch: function (url, opt) {
        failFetchCalls.push({url: url, opt: opt || {}});
        return Promise.resolve({
          ok: true,
          status: 200,
          json: function () {
            if (url === '/api/state') return Promise.resolve({st: base.state});
            return Promise.resolve({now: 240, seed: 's', soNguoi: 1, soHT: 1, tocDo: 1, chuKy: 3600});
          }
        });
      },
      APP: {
        ACT: {},
        themACT: function (actions) { Object.assign(this.ACT, actions); },
        batDauNhip: function () {}
      }
    });
    failWin.window = failWin;
    await assert.rejects(task3WithBrowser(failWin, async function () {
      task3RequireBrowserFile('web/js/mp.js');
      await task3FlushUntilSettled(function () {
        return failFetchCalls.some(function (call) { return call.url === '/api/thongtin'; }) &&
          failFetchCalls.some(function (call) { return call.url === '/api/state'; });
      }, 'MP failure startup thongtin and state fetches');
      var failFetchCountBeforeThrow = failFetchCalls.length;
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(failFetchCalls.length, failFetchCountBeforeThrow,
        'task3 MP failure path must have no async fetch leak before descriptor restore');
      throw new Error('TASK3_MP_BODY_FAILURE');
    }), /TASK3_MP_BODY_FAILURE/);
    browserKeys.forEach(function (key) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(global, key), beforeDescriptors[key],
        'task3 MP browser descriptor restored after failure for ' + key);
    });
  });
```

- [ ] **Step 2: Run the sole full RED**

Run no focused Task-3 test before this block.

```bash
test -n "${task3_runtime_dir:-}"
test -d "$task3_runtime_dir"
task3_red_tap="$task3_runtime_dir/red.tap"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$task3_red_tap" 2>&1
task3_red_status=$?
set -e
cat "$task3_red_tap"
test "$task3_red_status" -ne 0
rg -q '^# tests 82$' "$task3_red_tap"
rg -q '^# pass 61$' "$task3_red_tap"
rg -q '^# fail 20$' "$task3_red_tap"
rg -q '^# skipped 1$' "$task3_red_tap"
test "$(rg -c '^not ok ' "$task3_red_tap")" -eq 20
node - "$task3_red_tap" <<'NODE'
const fs = require('node:fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const expected = [
  {
    name: 'task3 exposes a frozen TICK_PARTIAL sentinel and validates TickOutcome shape',
    cause: /task3 frozen sentinel must expose the full local field contract|task3 tick must return an exact TickOutcome object|task3 G\.sukienKe must remain numeric|task3 G\.MO_PHONG_NHE/
  },
  {
    name: 'G.tick stops exactly at the 50000 budget and leaves event 50001 pending',
    cause: /task3 budget must process exactly 50000 primitives|task3 budget cap must leave event 50001 discoverable|task3 implicit two-arg budget must/
  },
  {
    name: 'two-argument solo tick continues same-second work without skipping it',
    cause: /task3 two-argument solo tick must return a nonpartial TickOutcome|task3 same-second ordering/
  },
  {
    name: 'G.tick rejects invalid shared remainingBudget before mutation',
    cause: /task3 invalid (budget|target|options) case|task3 invalid G\.tick inputs must not call G\.nangCapState/
  },
  {
    name: 'G.tickNoiBo accepts zero local continuation without returning sentinel',
    cause: /task3 tickNoiBo function must exist|task3 tickNoiBo fixture must expose exactly one external ref|task3 tickNoiBo invalid (budget|target|options) case|task3 tickNoiBo zero budget primitive case|task3 tickNoiBo must process due local work/
  },
  {
    name: 'multiplayer classifier returns a stable fleet ref and blocks without mutation',
    cause: /task3 multiplayer classifier function must exist|BLOCKED_EXTERNAL|EXTERNAL_EVENT/
  },
  {
    name: 'recycle colonize deploy NPC and self targets stay local in multiplayer classification',
    cause: /task3 local multiplayer classifier function must exist|task3 local multiplayer classifier case|LOCAL_EVENT/
  },
  {
    name: 'missile classification preserves explicit and legacy launch times',
    cause: /task3 missile classifier function must exist|missile|launchAtS|diLuc|task3 actual G\.banTenLua action/
  },
  {
    name: 'server events derive canonical PVP external and missile jobs from live refs',
    cause: /Cannot find module.*server\/scheduler\/events\.js|MODULE_NOT_FOUND|task3 direct stable(Fleet|Missile)Ref (vector|malformed|must accept)|task3 direct stable(Fleet|Missile)Ref .*zero-second|task3 Task2 validateJob|task3 safeSecond ceiling|task3 jobFromRef must call targetAccountForKey|task3 deriveExternalJobs must derive|task3 real classifier must classify|task3 derivePvpMatchId (perturb|malformed|strict validator)|task3 malformed defender callback/
  },
  {
    name: 'server events sameExternalRef rejects near misses and canonical status is explicit',
    cause: /Cannot find module.*server\/scheduler\/events\.js|MODULE_NOT_FOUND|task3 (deploy fleet ref|wrong fleet mission|malformed ref|sameExternalRef)/
  },
  {
    name: 'server events module parses standalone and exports only pure helper names',
    cause: /Cannot find module.*server\/scheduler\/events\.js|MODULE_NOT_FOUND|ENOENT|task3 import policy/
  },
  {
    name: 'G.chay defers the action closure when preaction tick is partial',
    cause: /task3 G\.chay must convert budget exhaustion|task3 G\.chay must convert blockedExternal|task3 G\.chay real external fixture|task3 G\.chay must reject illegal sentinel/
  },
  {
    name: 'local APP.lam validates input and serializes TickOutcome continuations',
    cause: /task3 local invalid action\/data validation must reject before G\.chay|task3 exact 24-char action name|task3 invalid local input must not call G\.nangCapState|task3 partial action must schedule exactly one continuation|task3 browser descriptor restored/
  },
  {
    name: 'local APP.lam caps one action at 1000 partial continuations',
    cause: /task3 local cap private ST startup must schedule the first continuation|task3 1000-cap action must keep one pending timer before cap|task3 1000-cap action must save the latest partial state at cap|local cap private ST startup/
  },
  {
    name: 'local startup partial tick schedules one macrotask continuation',
    cause: /task3 startup partial tick must schedule one macrotask continuation|task3 startup must call G\.tickOutcomeNeedsDeferral|task3 startup bridge must use G\.laTickPartial/
  },
  {
    name: 'local paste import schedules a partial checkpoint before continuation',
    cause: /task3 paste import partial checkpoint must schedule one continuation|task3 paste import must call G\.tickOutcomeNeedsDeferral|task3 paste import bridge must use G\.laTickPartial/
  },
  {
    name: 'local file import schedules a partial checkpoint before continuation',
    cause: /task3 file import partial checkpoint must schedule one continuation|task3 file import must call G\.tickOutcomeNeedsDeferral|task3 file import bridge must use G\.laTickPartial/
  },
  {
    name: 'shared heartbeat interval schedules exactly one partial continuation',
    cause: /task3 heartbeat partial tick must schedule exactly one continuation|task3 heartbeat must call G\.tickOutcomeNeedsDeferral|task3 heartbeat bridge must use G\.laTickPartial/
  },
  {
    name: 'visibility heartbeat does not duplicate an already pending continuation',
    cause: /task3 visibility fixture must start with one pending continuation|task3 second heartbeat interval must not (duplicate|tick)|task3 interval plus visibility overlap must not duplicate|task3 visibility (flow|event|second continuation).*G\.tickOutcomeNeedsDeferral|task3 visibility bridge must use G\.laTickPartial/
  },
  {
    name: 'MP startup and action transport code stay separate from the local sentinel',
    cause: /task3 MP fulfilled-body partial callback must settle asynchronously|task3 MP partial callbacks must distinguish fulfilled body and rejected error|task3 MP test must await all action callback microtasks|task3 MP fixture must provide no-op batDauNhip|task3 MP (success|failure) path must have no async fetch leak|task3 MP browser descriptor restored|transport code used as local sentinel/
  }
];
for (const item of expected) {
  const marker = new RegExp('^not ok [0-9]+ - ' +
    item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm');
  const match = marker.exec(tap);
  if (!match) throw new Error('missing failing test: ' + item.name);
  const rest = tap.slice(match.index);
  const next = rest.slice(1).search(/\nnot ok [0-9]+ - |\n# tests /);
  const block = next < 0 ? rest : rest.slice(0, next + 1);
  const body = block.slice(block.indexOf('\n') + 1);
  if (!item.cause.test(body)) {
    throw new Error('missing RED cause for ' + item.name + '\n' + body);
  }
}
NODE
test "$(head -n 3814 tools/test-scheduler.js | sha256sum | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
test ! -e server/scheduler/events.js
export task3_red_status
```

If any existing Task-1/Task-2 test fails, if the skip count differs from one, or if fewer than all 20 new tests fail, stop before production edits and report `BLOCKED_RED_SHAPE`.

### Task 3: Implement Event Classification And Partial Ticking

**Files:**

- Modify: `js/fleet.js`
- Create: `server/scheduler/events.js`
- Modify: `js/actions.js`

**Interfaces:**

- Produces in `js/fleet.js`: `G.TICK_PARTIAL`, `G.laTickPartial(value)`, `G.BLOCKED_EXTERNAL(ref, atS)`, `G.phanLoaiSuKienKe(st, ownerAccountId, options)`, `G.phanLoaiSuKienNoiBoKe(st, ownerAccountId, targetAccountForKey, durableFences)`, `G.phanLoaiTatCaSuKienNgoai(st, ownerAccountId, targetAccountForKey)`, `G.tickNoiBo(st, targetS, options)`, and `G.tick(st, targetS, options) -> TickOutcome`.
- Produces in `server/scheduler/events.js`: `stableFleetRef`, `stableMissileRef`, `sameExternalRef`, `derivePvpMatchId`, `externalKey`, `jobFromRef`, `deriveExternalJobs`, and `canonicalExternalStatus`.

- [ ] **Step 1: Implement the sentinel and result contract**

`G.TICK_PARTIAL` must be assigned exactly once near the timeline code in `js/fleet.js`:

```js
G.TICK_PARTIAL = Object.freeze({deferred: true, code: 'TICK_PARTIAL'});
G.laTickPartial = function (value) {
  return !!value && value.deferred === true && value.code === 'TICK_PARTIAL';
};
G.tickOutcomeNeedsDeferral = function (value) {
  return !!value && (value.budgetExhausted === true || !!value.blockedExternal);
};
G.BLOCKED_EXTERNAL = function (ref, atS) {
  return {code: 'BLOCKED_EXTERNAL', ref: ref, atS: atS};
};
```

Every `TickOutcome` returned by `G.tick` or `G.tickNoiBo` has exactly these public fields plus optional `blockedExternal`: `processed`, `advancedToS`, `nextDueAtS`, `hasMoreDue`, and `budgetExhausted`. `G.laTickPartial` is the only local-sentinel comparison helper and is used by `G.chay`, `js/main.js`, and `js/app.js`. `G.tickOutcomeNeedsDeferral` is the only helper that interprets `TickOutcome` partial exhaustion or `blockedExternal`; do not make `G.tick` return `G.TICK_PARTIAL`. `web/js/mp.js` handles transport metadata `code === 'TICK_PARTIAL'` separately and must not treat a server JSON body as a local sentinel.

- [ ] **Step 2: Implement structured primitive classification**

Refactor the existing `G.xuLySuKien` order into a primitive selector that preserves current solo order but returns one primitive at a time. A primitive candidate has:

```text
{
  code: 'LOCAL_EVENT' | 'EXTERNAL_EVENT',
  atS: Number,
  order: Number,
  tie: String,
  ref: Object | null,
  run: Function
}
```

Same-second ordering is exact and stable:

1. maintenance checkpoint;
2. building queue head by ascending planet index;
3. shipyard queue head by ascending planet index;
4. research completion;
5. fleets by descending current array index, matching the existing reverse loop;
6. missiles by descending current array index;
7. incoming NPC fleets by descending current array index;
8. raid checkpoint.

`G.sukienKe(st)` stays numeric and delegates to the structured classifier by returning `next ? next.atS : Infinity`.

Fleet refs are external only for player-targeted `attack`, `transport`, `spy`, and `hold`. Missile refs are external only for player targets. The stable ref fields are:

```text
{kind: 'fleet', ownerAccountId, fleetId, launchAtS, targetKey, arrivalAtS, mission}
{kind: 'missile', ownerAccountId, missileId, launchAtS, targetKey, arrivalAtS, mission: 'missile'}
```

`G.banTenLua` must set `diLuc: st.now` on new missile rows. `stableMissileRef` must derive the legacy launch time only when `diLuc` is absent, using `missile.khi - G.tgTenLua(abs(den.h - tu.h))`.

`ownerAccountId` comes from the explicit classifier/tick option first, then `st.accountId` only if the option is absent. A multiplayer external candidate is produced only when `options.multiplayer === true` and `options.targetAccountForKey(targetKey)` returns a positive defender account id different from the owner. If the target is self-owned, empty, NPC, recycle, colonize, deploy, or no defender id is available, the candidate remains local.

- [ ] **Step 3: Implement budgeted ticking without timestamp skipping**

`G.tick` must:

- validate finite safe integer `targetS >= 0`;
- reject a non-plain `options` value or any option key outside `remainingBudget`, `multiplayer`, `ownerAccountId`, `targetAccountForKey`, and `durableFences` with `TICK_OPTIONS_INVALID` before mutation;
- validate `ownerAccountId` as a positive safe integer when supplied, `multiplayer` as a boolean when supplied, `targetAccountForKey` as a function when supplied, and `durableFences` as an array when supplied;
- create a shared budget `{value: 50000}` for two-argument solo calls;
- reject invalid supplied budgets before mutation with `TICK_BUDGET_INVALID`; a supplied budget must be the exact single-key object `{value}` and `value` must be an integer from 1 to 50,000 for `G.tick`;
- process at most one primitive per budget unit;
- leave same-second due work visible when budget reaches zero;
- return `budgetExhausted: true` and `hasMoreDue: true` when due work remains;
- return `blockedExternal` without mutating the external primitive when multiplayer classification blocks;
- preserve `G.MO_PHONG_NHE` display-only behavior while returning a valid zero-effect `TickOutcome`.

The current `G.xuLySuKien` and `G.chayXuong` loops must be split so budget units cannot hide multiple primitives:

- Passive elapsed advancement (`G.sanXuat`, countdown fields, and `ncQueue.conLai`) costs no budget and may advance from `lastTick` to the next selected `atS`.
- Shipyard elapsed progress no longer completes multiple queue rows inside `G.chayXuong`. Keep `G.chayXuong(st, p, dt)` for passive `tLeft` decrement only, and add a one-row completion primitive that shifts at most `p.qS[0]` for one planet per budget unit.
- Building queue completion shifts at most one `p.qB[0]` for one planet per budget unit.
- Research completion, one fleet transition, one missile impact, one incoming NPC fleet, and one raid are each one primitive.
- `G.xuLySuKien(st, t)` remains only as a legacy compatibility wrapper that repeatedly invokes the one-primitive runner until no local primitive remains at or before `t`; `G.tick` and `G.tickNoiBo` must not call the old all-events loop.
- After each primitive, reclassify. If another candidate has the same `atS`, `nextDueAtS` must equal that same second, not the later target.
- If a supplied budget reaches zero while any queue still has due work at or before `targetS`, return `processed` for the completed primitives, `advancedToS: st.lastTick`, `nextDueAtS` equal to the due primitive second, `hasMoreDue: true`, and `budgetExhausted: true`.

`G.tickNoiBo` is local-only. It excludes external refs and supplied durable fences, accepts an established zero budget only for pure time/production advancement when no primitive is due at or before `targetS`, and returns a partial zero-processed outcome when zero budget meets any due maintenance, building, shipyard, research, fleet, missile, incoming, or raid queue. It throws `TICK_BUDGET_INVALID` for malformed budget objects and `TICK_OPTIONS_INVALID` for malformed option objects before mutation.

- [ ] **Step 4: Implement pure server event helpers**

`server/scheduler/events.js` must be standalone CommonJS with `'use strict'`. Its complete import allowlist is exactly `require('node:crypto')` and `require('../rules.js')`; no other loader token is permitted. The source policy is token-aware and closed-world: comments and strings do not create vacuous passes, while dead branches are still scanned as code. The same-task test and GREEN gate must reject dynamic `import()`, nonliteral `require`, aliased `require`, `require[...]`, `module.require`, computed `module[...]`, `process.mainModule.require`, `global.require`, `globalThis.require`, computed global loaders, `Reflect.apply`, `Reflect.get`, `createRequire`, `eval`, and `Function`. Runtime cold-load interception must independently prove the same direct import set. It must not import `./store.js`, writer, reducer, cutover, migrations, database modules, world modules, or future Task-4+ modules; this prevents cycles between pure classification and durable persistence. It must not mutate `G`, open a database, allocate a lease, read `Date.now()`, or capture wall-clock time.

`derivePvpMatchId(ref, defenderAccountId)` returns lower-case hex SHA-256 over canonical JSON with recursively sorted keys for exactly:

```text
{
  arrivalAtS: ref.arrivalAtS,
  defenderAccountId: defenderAccountId,
  fleetId: ref.fleetId,
  launchAtS: ref.launchAtS,
  ownerAccountId: ref.ownerAccountId,
  rule: 'pvp-v1',
  targetKey: ref.targetKey
}
```

`externalKey(ref)` returns exactly:

```text
external:<kind>:<mission>:<ownerAccountId>:<entityId>:<targetKey>:<launchAtS>:<arrivalAtS>
```

where `entityId` is `fleetId` for fleet refs or `missileId` for missile refs, and `targetKey` is already the canonical non-leading-zero `g:h:p` key. Reject, do not normalize, non-canonical target keys such as `01:2:5`.

Every external ref validator must enforce the exact key set and scalar type matrix. Fleet refs have exactly `kind`, `ownerAccountId`, `fleetId`, `launchAtS`, `targetKey`, `arrivalAtS`, and `mission`; missile refs have exactly `kind`, `ownerAccountId`, `missileId`, `launchAtS`, `targetKey`, `arrivalAtS`, and `mission`. Missing keys, extra keys, wrong cross-kind entity keys, zero/negative account or entity ids, non-integer launch/arrival seconds, unsafe/NaN/infinite owner/launch/arrival values, launch after arrival, wrong mission for the kind, and non-canonical target keys must be rejected with `PAYLOAD_INTEGRITY` or `PAYLOAD_VALUE_INVALID`, and `canonicalExternalStatus(kho, ref)` must classify those malformed refs as `REF_MISMATCH` rather than throwing. `launchAtS`, `arrivalAtS`, and job `scheduledAtS` must match Task-2 `safeSecond`: integer `0 <= value <= 9007199254740`; `9007199254741`, `Number.MAX_SAFE_INTEGER`, NaN, and infinities reject. `jobFromRef` returns `null` for a well-shaped `deploy` fleet ref because deploy is a local non-external mission, but `externalKey(deployRef)` rejects it and arbitrary wrong missions such as `probe` reject rather than sharing the deploy-null path.

`jobFromRef(ref, targetAccountForKey)` calls `targetAccountForKey(ref.targetKey)` exactly once and returns a Task-2-valid job input when that result is a positive defender account id different from `ref.ownerAccountId`; otherwise it returns `null`. It returns:

- `kind: 'PVP_RESOLVE'`, priority 50 for fleet attack;
- `kind: 'EXTERNAL_RESOLVE'`, priority 50 for fleet transport/spy/hold;
- `kind: 'EXTERNAL_RESOLVE'`, priority 51 for missile;
- `scheduledAtS = ref.arrivalAtS`;
- `aggregateType` equal to `match` for attack refs, `fleet` for transport/spy/hold refs, or `missile` for missile refs;
- `aggregateId = derivePvpMatchId(ref, defenderAccountId)` for attacks, `String(ref.fleetId)` for transport/spy/hold refs, or `String(ref.missileId)` for missile refs, where `defenderAccountId` is the callback result;
- `expectedRevision: null`;
- `sourceAccountId = ref.ownerAccountId`;
- `maxAttempts: 8`;
- canonical idempotency key without PII: `pvp-resolve:<matchId>:<arrivalAtS>` for attacks, otherwise `externalKey(ref)`;
- payload `{schemaVersion: 1, matchId, ref}` for attacks or `{schemaVersion: 1, ref}` for non-attack externals.

`deriveExternalJobs(accountId, state, targetAccountForKey)` must keep this exact argument order. It calls `G.phanLoaiTatCaSuKienNgoai(state, accountId, targetAccountForKey)`, maps each ref through `jobFromRef(ref, targetAccountForKey)`, filters `null`, and never returns local deploy/recycle/colonize/NPC/self jobs. The same-task test must prove a nonempty attack derivation by calling `deriveExternalJobs(11, liveState, ownerFor)` and validating the returned job through Task-2 `validateJob`.

`canonicalExternalStatus(kho, ref)` returns exactly:

- `EXACT` when the owner account's live fleet/missile row still exists and every canonical ref field matches;
- `ALREADY_ABSENT` when the referenced fleet/missile row no longer exists in the account state;
- `REF_MISMATCH` for null/missing refs, invalid kind, malformed ref shape, any existing row mismatch, non-canonical target key, changed mission, changed launch/arrival time, changed target, or changed owner.

`canonicalExternalStatus` reads canonical owner state through `kho.db.prepare('SELECT state FROM dq WHERE tk=?').get(ref.ownerAccountId)`. It must not accept a raw state object or target callback overload; Task 4 invalidation and reconciliation pass `context.kho` through this frozen ABI.

- [ ] **Step 5: Make `G.chay` partial-aware**

`G.chay(st, ten, dl)` must first resolve `G.HANHDONG[ten]`. If the action is missing, return the existing user-facing action error and do not tick. For a valid action, call `G.tick(st, G.giay())` before the action closure. If `G.tickOutcomeNeedsDeferral(result)` is true, return `G.TICK_PARTIAL` and do not execute the action function. If `G.laTickPartial(result)` is true, throw `TICK_SENTINEL_FROM_TICK_INVALID` because `G.tick` is not allowed to return the local sentinel. Only a terminal non-partial `TickOutcome` may enter the action closure. The same-task test must include a real external fixture whose blocked outcome is produced by the actual `G.tick`/classifier path against a live fleet row, not only by a hard-coded fake `{kind:'fleet'}` object.

### Task 4: Implement APP Adapter Boundaries

**Files:**

- Modify: `js/main.js`
- Modify: `js/app.js`
- Modify: `web/js/mp.js`

**Interfaces:**

- Consumes: field contract of `G.TICK_PARTIAL` and `TickOutcome`.
- Produces: local and multiplayer `APP.lam` behavior that is finite, retryable, and callback-safe.

- [ ] **Step 1: Implement local `APP.lam` serialization in `js/main.js`**

Local `APP.lam(ten, dl, xong)` must:

- accept only action names that are strings matching `/^[A-Za-z][A-Za-z0-9_-]{0,23}$/`; reject anything else before mutation and call a function callback once with `Hành động không hợp lệ.`;
- accept `dl === undefined` or `dl === null` as `{}`; accept only plain objects otherwise; reject arrays, functions, dates, and other non-plain values before mutation and call a function callback once with `Dữ liệu hành động không hợp lệ.`;
- ignore a non-function `xong` without throwing;
- run one action at a time through a FIFO local queue;
- call `G.chay(ST, ten, dl)`;
- when `G.laTickPartial(result)` is true, save the partial state, schedule exactly one `setTimeout(..., 0)` continuation for the same queued action, and do not call the user callback yet;
- cap one queued action at 1,000 partial continuations. If the cap is reached, save the latest partial state and call the callback once with `Tua thời gian quá dài, hãy thử lại.`;
- after a non-partial action result, save only on no gameplay error and call the callback exactly once.

Startup and import paths in `js/main.js` must call `G.tick(ST, G.giay())`, interpret the returned `TickOutcome` only through `G.tickOutcomeNeedsDeferral`, and schedule the next macrotask by returning the local `G.TICK_PARTIAL` sentinel to the same local continuation helper. Replace direct `G.tick(ST, G.giay())` calls in `batDau`, `nhap-ok`, and `APP.doiFile` import completion. A startup/import partial saves the partial state, schedules one macrotask continuation, and avoids synchronous spinning before the first `U.ve()`.

- [ ] **Step 2: Update shared heartbeat calls in `js/app.js`**

Replace direct heartbeat `G.tick(window.ST, G.giay())` calls with a helper that handles a returned `TickOutcome` through `G.tickOutcomeNeedsDeferral`, schedules one macrotask continuation, and avoids synchronous spinning. Interval heartbeat and `visibilitychange` must share one pending-continuation flag: if a second interval or visibility event fires while an interval continuation is already queued, no second timer is scheduled. It may redraw live counters after each call but must not execute gameplay actions from the heartbeat path.

- [ ] **Step 3: Update multiplayer `APP.lam` in `web/js/mp.js`**

The multiplayer adapter must propagate API codes before handling them: when `api()` rejects because a JSON response body has `code`, the thrown `Error` must carry `error.code = body.code`. `APP.lam` must treat response bodies or rejected API errors with transport metadata `code === 'TICK_PARTIAL'` as retryable/deferred server work. It must not call `G.laTickPartial` on the response body, must not construct `G.TICK_PARTIAL` from server JSON, must not call local `G.tick` authoritatively for startup or an action, and must not replay a POST automatically without a future server-admission contract. Its callback receives the server error text once as the first argument and `{code: 'TICK_PARTIAL'}` as the second argument; existing one-argument callers remain compatible.

### Task 5: Build Artifacts And Run GREEN Gates

**Files:**

- Regenerate: `dist/thien-ha-dai-chien.html`
- Regenerate: `dist/artifact.html`
- Verify: all changed source/test files and protected paths

**Interfaces:**

- Consumes: passing direct scheduler and smoke tests.
- Produces: final source/test/artifact identities and classified aggregate-gate evidence.

- [ ] **Step 1: Run the full GREEN and direct functional gates**

```bash
test -n "${task3_runtime_dir:-}"
test -d "$task3_runtime_dir"
task3_assert_root_identity
task3_green_tap="$task3_runtime_dir/green.tap"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$task3_green_tap" 2>&1
task3_green_status=$?
set -e
cat "$task3_green_tap"
rg -q '^# tests 82$' "$task3_green_tap"
rg -q '^# pass 81$' "$task3_green_tap"
rg -q '^# fail 0$' "$task3_green_tap"
rg -q '^# skipped 1$' "$task3_green_tap"
test "$task3_green_status" -eq 0
node tools/smoke.js
node --throw-deprecation tools/test-scheduler.js
node --check tools/test-scheduler.js
node --check js/fleet.js
node --check js/actions.js
node --check js/app.js
node --check js/main.js
node --check web/js/mp.js
node --check server/scheduler/events.js
node - <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync('server/scheduler/events.js', 'utf8');
function task3LoaderTokens(text) {
  const tokens = [];
  let i = 0;
  const isIdStart = (ch) => /[A-Za-z_$]/.test(ch);
  const isId = (ch) => /[A-Za-z0-9_$]/.test(ch);
  function readUnicodeEscape(offset) {
    if (text[offset] !== '\\' || text[offset + 1] !== 'u') return null;
    if (text[offset + 2] === '{') {
      const end = text.indexOf('}', offset + 3);
      if (end < 0) return null;
      const pointHex = text.slice(offset + 3, end);
      if (!/^[0-9A-Fa-f]{1,6}$/.test(pointHex)) return null;
      const point = parseInt(pointHex, 16);
      if (point > 0x10ffff) return null;
      return {ch: String.fromCodePoint(point), width: end - offset + 1};
    }
    const hex = text.slice(offset + 2, offset + 6);
    if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return null;
    return {ch: String.fromCharCode(parseInt(hex, 16)), width: 6};
  }
  function readTemplateExpression(offset) {
    let depth = 1;
    const start = offset;
    let j = offset;
    while (j < text.length && depth > 0) {
      if (text[j] === '"' || text[j] === "'" || text[j] === '`') {
        const quote = text[j];
        j += 1;
        while (j < text.length) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text[j] === quote) { j += 1; break; }
          j += 1;
        }
        continue;
      }
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') depth -= 1;
      j += 1;
    }
    tokens.push(...task3LoaderTokens(text.slice(start, j - 1)));
    return j;
  }
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '/' && text[i + 1] === '/') {
      i += 2;
      while (i < text.length && !/[\n\r]/.test(text[i])) i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      let value = '';
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (quote === '`' && text[i] === '$' && text[i + 1] === '{') {
          i = readTemplateExpression(i + 2);
          continue;
        }
        if (text[i] === quote) { i += 1; break; }
        if (quote !== '`') value += text[i];
        i += 1;
      }
      tokens.push({type: 'string', value: quote === '`' ? null : value});
      continue;
    }
    let escaped = readUnicodeEscape(i);
    if ((escaped && isIdStart(escaped.ch)) || isIdStart(ch)) {
      let valueId = '';
      while (i < text.length) {
        escaped = readUnicodeEscape(i);
        if (escaped && isId(escaped.ch)) {
          valueId += escaped.ch;
          i += escaped.width;
          continue;
        }
        if (!isId(text[i])) break;
        valueId += text[i];
        i += 1;
      }
      tokens.push({type: 'id', value: valueId});
      continue;
    }
    tokens.push({type: 'p', value: ch});
    i += 1;
  }
  return tokens;
}
function assertEventsImportPolicy(text, label) {
  const tokens = task3LoaderTokens(text);
  const requires = [];
  const tok = (offset, from) => tokens[(from || 0) + offset] || {};
  const val = (offset, from) => tok(offset, from).value;
  if (/\[\s*(?:['"`]con['"`]\s*\+\s*['"`]structor['"`]|['"`]con(?:\\u0073|\\u\{73\})tructor['"`]|`constructor`)\s*\]/.test(text) ||
      /\[\s*(?:['"`]get['"`]\s*\+\s*['"`]BuiltinModule['"`]|['"`]_lo['"`]\s*\+\s*['"`]ad['"`])\s*\]/.test(text) ||
      /['"`](?:return\s+)?(?:require|import|module\.constructor|process\.getBuiltinModule|_load)\b/.test(text)) {
    throw new Error('events.js uses split or string-generated loader: ' + label);
  }
  tokens.forEach((token, index) => {
    if (token.type === 'string' && token.value === 'constructor') {
      throw new Error('events.js uses computed constructor loader: ' + label);
    }
    if (token.type !== 'id') return;
    if (token.value === 'constructor') {
      throw new Error('events.js uses arbitrary constructor acquisition: ' + label);
    }
    if (token.value === 'import') {
      throw new Error('events.js uses dynamic import: ' + label);
    }
    if (token.value === 'Reflect' || token.value === 'createRequire' ||
        token.value === 'eval' || token.value === 'Function') {
      throw new Error('events.js uses computed code loading: ' + label);
    }
    if (token.value === 'module') {
      if (!(val(1, index) === '.' && val(2, index) === 'exports' && val(3, index) === '=')) {
        throw new Error('events.js uses disallowed module object: ' + label);
      }
      return;
    }
    if ((token.value === 'global' || token.value === 'globalThis') &&
        (val(1, index) === '[' ||
         (val(1, index) === '.' && val(2, index) === 'require') ||
         (val(1, index) === '.' && val(2, index) === 'constructor'))) {
      throw new Error('events.js uses indirect loader: ' + label);
    }
    if (token.value === 'process' &&
        (val(1, index) === '[' ||
         (val(1, index) === '.' && val(2, index) === 'mainModule') ||
         (val(1, index) === '.' && val(2, index) === 'getBuiltinModule'))) {
      throw new Error('events.js uses indirect loader: ' + label);
    }
    if (token.value === 'G' && (val(1, index) === '.' || val(1, index) === '[')) {
      for (let j = index + 2; j < Math.min(tokens.length, index + 8); j += 1) {
        if (tokens[j].value === '=') throw new Error('events.js mutates G: ' + label);
      }
    }
    if (token.value !== 'require') return;
    if (val(-1, index) === '.' || val(1, index) !== '(') {
      throw new Error('events.js uses alias require: ' + label);
    }
    if (tok(2, index).type !== 'string' || val(3, index) !== ')') {
      throw new Error('events.js uses nonliteral require: ' + label);
    }
    requires.push(tok(2, index).value);
  });
  requires.sort();
  if (JSON.stringify(requires) !== JSON.stringify(['../rules.js', 'node:crypto'].sort())) {
    throw new Error('events.js import allowlist mismatch: ' + label + ': ' + requires.join(','));
  }
  if (/\bDate\s*\.\s*now\b|new\s+SchedulerStore\b|new\s+Kho\b/.test(text)) {
    throw new Error('events.js captures runtime side effect: ' + label);
  }
  if (/\bperformance\s*\.\s*now\b|\bprocess\s*\.\s*hrtime\b|new\s+Date\b/.test(text)) {
    throw new Error('events.js captures wall-clock side effect: ' + label);
  }
  if (/Object\s*\.\s*assign\s*\(\s*G\b|Reflect\s*\.\s*set\s*\(\s*G\b/.test(text)) {
    throw new Error('events.js mutates G: ' + label);
  }
}
assertEventsImportPolicy(source, 'events.js');
for (const entry of [
  ['dead-branch literal require', "if (false) require('./store.js');"],
  ['comment-spaced literal require', "require /* hidden */ ('./store.js');"],
  ['dynamic nonliteral require', "require('./' + 'store.js');"],
  ['template interpolation require', "`${require('./store.js')}`;"],
  ['escaped identifier require', "var loader = requ\\u0069re; loader('./store.js');"],
  ['code-point escaped identifier require', "var loader = requ\\u{69}re; loader('./store.js');"],
  ['dynamic import', "import('./store.js');"],
  ['escaped identifier import', "im\\u0070ort('./store.js');"],
  ['comment-spaced dynamic import', "import /* hidden */ ('./store.js');"],
  ['module require', "module.require('./store.js');"],
  ['computed module require', "module['require']('./store.js');"],
  ['module constructor load', "module.constructor._load('./store.js');"],
  ['require resolve member', "require['resolve']('./store.js');"],
  ['aliased require', "var loader = require; loader('./store.js');"],
  ['delayed dead branch loader', "if (false) setImmediate(function () { require('./store.js'); });"],
  ['process mainModule require', "process.mainModule.require('./store.js');"],
  ['process builtin module load',
    "process.getBuiltinModule('module')._load('./store.js', null, false);"],
  ['global require', "globalThis.require('./store.js');"],
  ['computed global require', "globalThis['require']('./store.js');"],
  ['alternate constructor loader',
    "globalThis.constructor.constructor('return require')()('./store.js');"],
  ['arbitrary constructor loader',
    "({}).constructor.constructor('return require')()('./store.js');"],
  ['computed constructor loader',
    "var key = 'constructor'; globalThis[key][key]('return require')()('./store.js');"],
  ['split string constructor key',
    "globalThis['con' + 'structor']['constructor']('return require')()('./store.js');"],
  ['unicode string constructor key',
    "globalThis['con\\u0073tructor']['constructor']('return require')()('./store.js');"],
  ['code-point string constructor key',
    "globalThis['con\\u{73}tructor']['constructor']('return require')()('./store.js');"],
  ['template computed constructor key',
    "globalThis[`constructor`]['constructor']('return require')()('./store.js');"],
  ['Reflect apply require', "Reflect.apply(require, null, ['./store.js']);"],
  ['Reflect get module require', "Reflect.get(module, 'require')('./store.js');"],
  ['forged parent module load',
    "module.constructor._load('./store.js', {filename: __filename}, false);"],
  ['parentless module load', "module.constructor._load('./store.js', null, false);"],
  ['createRequire loader', "var cr = createRequire(__filename);"],
  ['eval loader', "eval('require(\"./store.js\")');"],
  ['Function loader', "Function('return require(\"./store.js\")')();"],
  ['Function string-generated loader',
    "var body = 'return require'; Function(body)()('./store.js');"],
  ['string timer generated loader', "setTimeout('require(\"./store.js\")', 0);"],
  ['Promise delayed loader',
    "if (false) Promise.resolve().then(function () { require('./store.js'); });"],
  ['Promise delayed Function loader',
    "Promise.resolve().then(Function('return require(\"./store.js\")'));"],
  ['split getBuiltinModule load',
    "process['get' + 'BuiltinModule']('module')['_lo' + 'ad']('./store.js', null, false);"],
  ['G direct mutation', "G.bad = true;"],
  ['G object assign mutation', "Object.assign(G, {bad: true});"],
  ['performance wall clock', "var t = performance.now();"],
  ['Date wall clock', "var d = new Date();"]
]) {
  let rejected = false;
  try {
    assertEventsImportPolicy(
      "require('node:crypto');\nrequire('../rules.js');\n" + entry[1],
      entry[0]
    );
  } catch (error) {
    rejected = true;
  }
  if (!rejected) throw new Error('events.js import negative corpus missed: ' + entry[0]);
}
const path = require('node:path');
const Module = require('node:module');
const sourcePath = path.resolve('server/scheduler/events.js');
const oldLoad = Module._load;
const seenDirect = [];
delete require.cache[require.resolve('./server/scheduler/events.js')];
try {
  Module._load = function (request, parent, isMain) {
    if ((!parent || parent.filename !== sourcePath) &&
        (request === './store.js' || /server\/scheduler\/store\.js$/.test(request))) {
      throw new Error('events.js rejected forged or parentless cold-load import ' + request);
    }
    if (parent && parent.filename === sourcePath) {
      seenDirect.push(request);
      if (!['../rules.js', 'node:crypto'].includes(request)) {
        throw new Error('events.js disallowed cold-load import ' + request);
      }
    }
    return oldLoad.apply(this, arguments);
  };
  require('./server/scheduler/events.js');
} finally {
  Module._load = oldLoad;
  delete require.cache[require.resolve('./server/scheduler/events.js')];
}
if (JSON.stringify(Array.from(new Set(seenDirect)).sort()) !==
    JSON.stringify(['../rules.js', 'node:crypto'].sort())) {
  throw new Error('events.js cold-load import set mismatch: ' + seenDirect.join(','));
}
for (const entry of [
  ['parentless runtime import', './store.js', null],
  ['forged-parent runtime import', './store.js', {filename: __filename}],
  ['disallowed source runtime import', './store.js', {filename: sourcePath}]
]) {
  let rejected = false;
  try {
    Module._load = function (request, parent) {
      if (!parent || parent.filename !== sourcePath ||
          !['../rules.js', 'node:crypto'].includes(request)) {
        throw new Error('events.js runtime import rejected: ' + entry[0]);
      }
      return oldLoad.apply(this, arguments);
    };
    Module._load(entry[1], entry[2], false);
  } catch (error) {
    rejected = /events.js runtime import rejected/.test(String(error));
  } finally {
    Module._load = oldLoad;
  }
  if (!rejected) throw new Error('events.js runtime import negative corpus missed: ' + entry[0]);
}
const events = require('./server/scheduler/events.js');
for (const name of [
  'stableFleetRef',
  'stableMissileRef',
  'sameExternalRef',
  'derivePvpMatchId',
  'externalKey',
  'jobFromRef',
  'deriveExternalJobs',
  'canonicalExternalStatus'
]) {
  if (typeof events[name] !== 'function') throw new Error('missing export ' + name);
}
NODE
node tools/lint.js
```

- [ ] **Step 2: Rebuild artifacts and verify generated output**

```bash
task3_assert_root_identity
npm run build
node tools/check-artifact.js
test "$(rg -c 'source: js/fleet.js sha256:' dist/thien-ha-dai-chien.html)" -eq 1
test "$(rg -c 'source: js/actions.js sha256:' dist/thien-ha-dai-chien.html)" -eq 1
test "$(rg -c 'source: js/app.js sha256:' dist/thien-ha-dai-chien.html)" -eq 1
test "$(rg -c 'source: js/main.js sha256:' dist/thien-ha-dai-chien.html)" -eq 1
```

- [ ] **Step 3: Run aggregate gates and classify environmental failures literally**

```bash
test -n "${task3_runtime_dir:-}"
test -d "$task3_runtime_dir"
task3_assert_root_identity
task3_npm_output="$task3_runtime_dir/npm-test.txt"
task3_syntax_output="$task3_runtime_dir/check-syntax.txt"
set +e
npm test >"$task3_npm_output" 2>&1
task3_npm_status=$?
node tools/check-syntax.js >"$task3_syntax_output" 2>&1
task3_syntax_status=$?
set -e
cat "$task3_npm_output"
cat "$task3_syntax_output"
if test "$task3_npm_status" -ne 0; then
  test -n "${task3_server_preflight_status+x}"
  test "$task3_server_preflight_status" -ne 0
  test -n "${task3_server_preflight_output:-}"
  test -f "$task3_server_preflight_output"
  test -n "${task3_server_preflight_fingerprint:-}"
  test -f "$task3_server_preflight_fingerprint"
  test "$(sha256sum server/app.js | cut -d' ' -f1)" = \
    b99ff52dcf6e43d02f92acb1359c0f8490475978ace332cc55f5f277537900d2
  test "$(sha256sum server/api.js | cut -d' ' -f1)" = \
    e7ea7e2a2bb899209222bcdc2aab1b1bdef724800283d445968778fe59bfecf0
  test "$(sha256sum server/world.js | cut -d' ' -f1)" = \
    621a484b4153496efde3a45f3023e227cd168598b91a88daec14d2065a836f49
  test "$(sha256sum tools/test-server.js | cut -d' ' -f1)" = \
    3bad4e64675157d8eb335c8c14b0837b6bfa6f00b782f6a49fa60a8605fd7bf9
  rg -q 'SERVER KHÔNG LÊN' "$task3_server_preflight_output"
  rg -q '✓ [0-9]+ kiểm tra đạt' "$task3_npm_output"
  rg -q 'SERVER KHÔNG LÊN' "$task3_npm_output"
  test "$(rg -c 'not ok [0-9]+ - task3|TICK_PARTIAL|BLOCKED_EXTERNAL|tools/test-scheduler.js' \
    "$task3_npm_output")" -eq 0
  node - "$task3_npm_output" "$task3_server_preflight_fingerprint" <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8');
const expectedFingerprint = fs.readFileSync(process.argv[3], 'utf8').trimEnd();
const lines = text.split('\n');
const nonblank = lines.filter((line) => line.trim().length > 0);
const knownBenign = /^(TAP version|ok\b|1\.\.|#|✓|> |npm |$)/;
const plainInteger = '(?:0|[1-9][0-9]*)';
const localeNumber = '(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:\\.[0-9]{3})+)';
const defenseName = '(?:Bệ Phóng Tên Lửa|Pháo Laser Nhỏ|Pháo Laser Lớn|Pháo Gauss|Pháo Ion|Pháo Plasma)';
const defenseBreakdown = '(?:không phá được gì|' + defenseName + ' ×' + localeNumber + '(?:, ' +
  defenseName + ' ×' + localeNumber + ')*)';
const expeditionKey = '(?:tài nguyên|tàu trôi dạt|Galana|chạm trán|lạc đường|thiên thạch|không thấy gì)';
const smokeProgressPatterns = [
  new RegExp('^  · sản lượng/giờ: KL ' + plainInteger + ' TA ' + plainInteger +
    ' NL ' + plainInteger + ' TP ' + plainInteger + ' \\| điện ' + plainInteger + '/' + plainInteger + '$'),
  new RegExp('^  · kết quả trận: (?:hoa|thắng|thua), phế liệu ' + localeNumber + ' KL$'),
  new RegExp('^  · tên lửa: bắn 10, bị chặn ' + plainInteger + ', phá ' + defenseBreakdown + '$'),
  new RegExp('^  · kết quả ' + plainInteger + ' chuyến thám hiểm: \\{(?:\"' + expeditionKey +
    '\":' + plainInteger + ')(?:,\"' + expeditionKey + '\":' + plainInteger + ')*\\}$'),
  new RegExp('^  · đổ bộ: (?:thắng|thua), phòng thủ mặt đất địch ' + localeNumber +
    ' -> ' + localeNumber + ', cướp ' + localeNumber + '$'),
  new RegExp('^  · tua 30 ngày mất ' + plainInteger + 'ms$')
];
function isSmokeProgressLine(line) {
  return smokeProgressPatterns.some((pattern) => pattern.test(line));
}
function isKnownBenignLine(line) {
  return knownBenign.test(line) || isSmokeProgressLine(line);
}
[
  '  · sản lượng/giờ: KL 27360 TA 18200 NL 3072 TP 11041 | điện 5140/3750',
  '  · kết quả trận: hoa, phế liệu 9.900 KL',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×4',
  '  · kết quả 30 chuyến thám hiểm: {"tài nguyên":11,"thiên thạch":3,"lạc đường":4,"chạm trán":3,"không thấy gì":2,"tàu trôi dạt":3,"Galana":4}',
  '  · đổ bộ: thắng, phòng thủ mặt đất địch 632 -> 292, cướp 1.141.288',
  '  · tua 30 ngày mất 3ms'
].forEach((line) => {
  if (!isKnownBenignLine(line)) throw new Error('npm aggregate smoke progress benign line rejected');
});
[
  '  arbitrary indented content',
  '   · smoke progress: wrong indent',
  '  · smoke progress: browser smoke completed',
  '  · arbitrary Unicode Ω',
  '  · kết quả trận: boom, phế liệu 9.900 KL',
  '  · kết quả trận: hoa, phế liệu . KL',
  '  · kết quả trận: hoa, phế liệu 9..900 KL',
  '  · kết quả trận: hoa, phế liệu 99.90 KL',
  '  · kết quả trận: hoa, phế liệu .9 KL',
  '  · kết quả trận: hoa, phế liệu 9. KL',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×.',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×4..000',
  '  · tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×4.00',
  '  · đổ bộ: thắng, phòng thủ mặt đất địch . -> .., cướp ...',
  '  · đổ bộ: thắng, phòng thủ mặt đất địch 1.23.456 -> 292, cướp 1.141.288',
  '  · kết quả 30 chuyến thám hiểm: {"evil":1}',
  '  · FAIL leaked',
  '  · Error leaked'
].forEach((line) => {
  if (isKnownBenignLine(line)) throw new Error('npm aggregate smoke progress accepted arbitrary line');
});
const failureLines = lines.filter((line) =>
  /(^not ok\b|✗|FAILED|\bFAIL\b|\bfailed\b|ERR_|\b[Ee]rror\b|AssertionError|Assertion failed|unmatched assertion|SyntaxError|ReferenceError|TypeError|RangeError|AggregateError|SERVER KHÔNG LÊN)/.test(line)
);
for (const line of nonblank) {
  if (isKnownBenignLine(line) || failureLines.indexOf(line) >= 0) continue;
  throw new Error('unknown aggregate output line: ' + line);
}
if (!/SERVER KHÔNG LÊN/.test(text)) throw new Error('missing known server failure');
if (failureLines.filter((line) => /SERVER KHÔNG LÊN:/.test(line)).length !== 1) {
  throw new Error('known server failure fingerprint count changed');
}
const aggregateFingerprint = failureLines.join('\n');
if (aggregateFingerprint !== expectedFingerprint) {
  throw new Error('aggregate failure fingerprint changed\nexpected:\n' +
    expectedFingerprint + '\nactual:\n' + aggregateFingerprint);
}
if (/task3|TICK_PARTIAL|BLOCKED_EXTERNAL|server\/scheduler\/events\.js/.test(
    aggregateFingerprint)) {
  throw new Error('Task-3 failure leaked into aggregate output');
}
NODE
fi
if test "$task3_syntax_status" -ne 0; then
  node - "$task3_syntax_output" <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8');
const directSpawnLine = /^\/[^:\n]+\.js: syntax-check spawn (EPERM|EACCES): spawnSync [^\n]* (EPERM|EACCES)$/;
const nodeCheckLine = /^node --check [^\n]+\.js$/;
const spawnErrorLine = /^(Error: )?spawnSync [^\n]* (EPERM|EACCES)$/;
const stackLine = /^\s*at .*(node:child_process|tools\/check-syntax\.js)(?::[0-9]+:[0-9]+)?\)?$/;
function isEnvironmentalSyntaxLine(line) {
  return directSpawnLine.test(line) ||
    nodeCheckLine.test(line) ||
    spawnErrorLine.test(line) ||
    stackLine.test(line);
}
function hasEnvironmentalSpawnEvidence(line) {
  return directSpawnLine.test(line) || spawnErrorLine.test(line);
}
function isFunctionalSyntaxLine(line) {
  return /SyntaxError|Unexpected token|ReferenceError|TypeError|AssertionError|Assertion failed|unmatched assertion|RangeError|AggregateError|\bFAIL\b|\bfailed\b|\b[Ee]rror\b/.test(line);
}
function classifySyntaxOutput(candidate) {
  const blocks = candidate.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length === 0) throw new Error('no syntax output blocks captured');
  let environmentalBlocks = 0;
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trimEnd()).filter(Boolean);
    if (lines.length === 0) throw new Error('empty syntax output block');
    for (const line of lines) {
      if (isFunctionalSyntaxLine(line) && !hasEnvironmentalSpawnEvidence(line)) {
        throw new Error('functional syntax diagnostic line:\n' + line);
      }
      if (!isEnvironmentalSyntaxLine(line)) {
        throw new Error('unknown syntax output line:\n' + line);
      }
    }
    if (!lines.some(hasEnvironmentalSpawnEvidence)) {
      throw new Error('syntax block lacks EPERM/EACCES spawn evidence:\n' + block);
    }
    environmentalBlocks += 1;
  }
  if (environmentalBlocks !== blocks.length) throw new Error('unclassified syntax output block');
}
[
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM',
  '/app/thienhadaichien/web/js/mp.js: syntax-check spawn EACCES: spawnSync node EACCES',
  'node --check js/fleet.js\nError: spawnSync node EPERM\n    at Object.spawnSync (node:child_process:1120:20)'
].forEach(classifySyntaxOutput);
[
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM\nRangeError: leaked',
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM\nFAIL leaked',
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM\nError: leaked',
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM SyntaxError: leaked',
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM RangeError: leaked',
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM FAIL leaked',
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM Error: leaked',
  '/app/thienhadaichien/js/fleet.js: syntax-check spawn EPERM: spawnSync node EPERM\nunknown leaked'
].forEach((candidate) => {
  let rejected = false;
  try { classifySyntaxOutput(candidate); } catch (error) { rejected = true; }
  if (!rejected) throw new Error('syntax parser self-test accepted adjacent bad line');
});
classifySyntaxOutput(text);
NODE
fi
export task3_npm_status task3_syntax_status
export task3_npm_output task3_syntax_output
```

If either aggregate command fails for any reason outside those exact patterns, stop and mark the report `BLOCKED_FUNCTIONAL_GATE`.

- [ ] **Step 4: Verify protected hashes, scope, index, static shape, and temp delta**

```bash
task3_assert_root_identity
test "$(head -n 3814 tools/test-scheduler.js | sha256sum | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  f15b00f6e45e32d17446d0004fac569ab0479e64c071930853a7e7e2d100974d
test "$(sha256sum server/scheduler/migrations.js | cut -d' ' -f1)" = \
  1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76
test "$(sha256sum server/scheduler/contract.js | cut -d' ' -f1)" = \
  3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1
test "$(sha256sum server/db.js | cut -d' ' -f1)" = \
  982ff360fa62c0ece158d57cf9acdca34783f35f12ea82409ea478437ade3545
test "$(sha256sum package.json | cut -d' ' -f1)" = \
  7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f
test "$(rg -c '^test\(' tools/test-scheduler.js)" -eq 82
test "$(tail -n +3815 tools/test-scheduler.js | rg -c '^test\(')" -eq 20
test "$(awk '/t\.test\(/{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(rg -c '^  prove\(' tools/test-scheduler.js)" -eq 24
git diff --check -- tools/test-scheduler.js js/fleet.js js/actions.js js/app.js js/main.js web/js/mp.js server/scheduler/events.js
test "$(awk 'length($0)>120{n++} END{print n+0}' \
  tools/test-scheduler.js js/fleet.js js/actions.js js/app.js js/main.js web/js/mp.js server/scheduler/events.js)" -eq 0
test "$(rg -n '[[:blank:]]+$' \
  tools/test-scheduler.js js/fleet.js js/actions.js js/app.js js/main.js web/js/mp.js server/scheduler/events.js | wc -l)" -eq 0
test -n "${task3_index_before:-}"
test -f "$task3_index_before"
test -n "${task3_cached_diff_before:-}"
test -f "$task3_cached_diff_before"
task3_index_after="$task3_runtime_dir/index-after.manifest"
task3_cached_diff_after="$task3_runtime_dir/cached-diff-after.patch"
task3_allowed_impl_after="$task3_runtime_dir/allowed-implementation-after.manifest"
node - "$task3_index_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const indexPath = path.resolve(root, '.git/index');
if (indexPath !== root && !indexPath.startsWith(root + path.sep)) {
  throw new Error('index path escapes root: .git/index');
}
const stat = fs.lstatSync(indexPath);
if (!stat.isFile()) throw new Error('.git/index is not a regular file');
const hash = crypto.createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex');
fs.writeFileSync(process.argv[2], 'file ' + hash + ' ' + stat.size + ' ' +
  stat.mode + ' ' + stat.uid + ':' + stat.gid + ' .git/index\n');
NODE
git diff --cached --binary >"$task3_cached_diff_after"
cmp -s "$task3_index_before" "$task3_index_after"
cmp -s "$task3_cached_diff_before" "$task3_cached_diff_after"
test ! -s "$task3_cached_diff_after"
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const finalRegular = [
  'tools/test-scheduler.js',
  'js/fleet.js',
  'js/actions.js',
  'js/app.js',
  'js/main.js',
  'web/js/mp.js',
	  'server/scheduler/events.js',
	  'dist/thien-ha-dai-chien.html',
	  'dist/artifact.html'
	];
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('final path escapes root: ' + rel);
  }
  const realParent = fs.realpathSync(path.dirname(abs));
  if (realParent !== root && !realParent.startsWith(root + path.sep)) {
    throw new Error('final parent escapes root: ' + rel);
  }
  return abs;
}
	finalRegular.forEach((rel) => {
	  const stat = fs.lstatSync(rooted(rel));
	  if (!stat.isFile()) throw new Error('final target is not regular file: ' + rel);
	});
NODE
test -n "${task3_allowed_before:-}"
test -f "$task3_allowed_before"
node - "$task3_allowed_impl_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const allowed = [
  'tools/test-scheduler.js', 'js/fleet.js', 'js/actions.js', 'js/app.js',
  'js/main.js', 'web/js/mp.js', 'server/scheduler/events.js',
  'dist/thien-ha-dai-chien.html', 'dist/artifact.html',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md'
];
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('allowed path escapes root: ' + rel);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) {
    throw new Error('allowed parent escapes root: ' + rel);
  }
  return abs;
}
function row(rel) {
  try {
    const abs = rooted(rel);
    const stat = fs.lstatSync(abs);
    const meta = stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid;
    if (stat.isSymbolicLink()) return 'link ' + meta + ' ' + fs.readlinkSync(abs) + ' ' + rel;
    if (stat.isDirectory()) return 'dir ' + meta + ' ' + rel;
    if (!stat.isFile()) return 'other ' + meta + ' ' + rel;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    return 'file ' + hash + ' ' + meta + ' ' + rel;
  } catch (error) {
    if (error.code === 'ENOENT') return 'ENOENT ' + rel;
    return 'error ' + (error.code || 'UNKNOWN') + ' ' + rel;
  }
}
fs.writeFileSync(process.argv[2], allowed.map(row).join('\n') + '\n');
NODE
test -n "${task3_authority_before:-}"
test -f "$task3_authority_before"
task3_authority_after="$task3_runtime_dir/authority-after.sha256"
test "$(sha256sum "$task3_controller_plan_path" | cut -d' ' -f1)" = "$task3_controller_plan_sha256"
sha256sum \
  "$task3_controller_plan_path" \
  docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md \
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md \
  .superpowers/sdd/model-routing.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/progress.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-semantic-review.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-executable-review.md \
  >"$task3_authority_after"
cmp -s "$task3_authority_before" "$task3_authority_after"
test -n "${task3_scope_before:-}"
test -f "$task3_scope_before"
task3_scope_after="$task3_runtime_dir/scope-after.manifest"
node - "$task3_scope_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const output = process.argv[2];
const root = process.cwd();
const allowed = new Set([
  './tools/test-scheduler.js',
  './js/fleet.js',
  './js/actions.js',
  './js/app.js',
  './js/main.js',
  './web/js/mp.js',
  './server/scheduler/events.js',
  './dist/thien-ha-dai-chien.html',
  './dist/artifact.html',
  './.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md'
]);
const rows = [];
function label(abs) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return rel ? './' + rel : '.';
}
function skip(abs) {
  const rel = label(abs);
  return rel === './.git' || rel.startsWith('./.git/') || allowed.has(rel);
}
function typeRow(stat, abs) {
  const rel = label(abs);
  const meta = stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid;
  if (stat.isDirectory()) return 'dir ' + meta + ' ' + rel;
  if (stat.isSymbolicLink()) return 'link ' + meta + ' ' + fs.readlinkSync(abs) + ' ' + rel;
  if (stat.isFIFO()) return 'fifo ' + meta + ' ' + rel;
  if (stat.isSocket()) return 'socket ' + meta + ' ' + rel;
  if (!stat.isFile()) return 'other ' + meta + ' ' + rel;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  return 'file ' + hash + ' ' + meta + ' ' + rel;
}
function visit(abs) {
  if (skip(abs)) return;
  let stat;
  try { stat = fs.lstatSync(abs); }
  catch (error) {
    rows.push('error ' + label(abs) + ' ' + (error && error.code || 'UNKNOWN'));
    return;
  }
  rows.push(typeRow(stat, abs));
  if (!stat.isDirectory()) return;
  let names;
  try { names = fs.readdirSync(abs).sort(); }
  catch (error) {
    rows.push('error ' + label(abs) + ' ' + (error && error.code || 'UNKNOWN'));
    return;
  }
  names.forEach((name) => visit(path.join(abs, name)));
}
visit(root);
fs.writeFileSync(output, rows.join('\n') + (rows.length ? '\n' : ''));
NODE
cmp -s "$task3_scope_before" "$task3_scope_after"
test -n "${task3_temp_before:-}"
test -f "$task3_temp_before"
task3_temp_after="$task3_runtime_dir/tmp-after.txt"
task3_temp_diff="$task3_runtime_dir/tmp-diff.txt"
node - "$task3_runtime_dir" "$task3_temp_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const runtime = path.resolve(process.argv[2]);
const output = process.argv[3];
const rows = [];
function skip(entry) {
  const resolved = path.resolve(entry);
  return resolved === runtime || resolved.startsWith(runtime + path.sep);
}
function visit(entry) {
  if (skip(entry)) return;
  let stat;
  try { stat = fs.lstatSync(entry); }
  catch (error) {
    rows.push('error ' + entry + ' ' + (error && error.code || 'UNKNOWN'));
    return;
  }
  if (stat.isDirectory()) {
    rows.push('dir ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid + ' ' + entry);
    let names;
    try { names = fs.readdirSync(entry).sort(); }
    catch (error) {
      rows.push('error ' + entry + ' ' + (error && error.code || 'UNKNOWN'));
      return;
    }
    names.forEach((name) => visit(path.join(entry, name)));
    return;
  }
  if (stat.isFile()) {
    const hash = crypto.createHash('sha256')
      .update(fs.readFileSync(entry))
      .digest('hex');
    rows.push('file ' + hash + ' ' + stat.mode + ' ' + stat.size + ' ' +
      stat.uid + ':' + stat.gid + ' ' + entry);
    return;
  }
  if (stat.isSymbolicLink()) {
    rows.push('link ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
      stat.gid + ' ' + fs.readlinkSync(entry) + ' ' + entry);
    return;
  }
  if (stat.isFIFO()) {
    rows.push('fifo ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
      stat.gid + ' ' + entry);
    return;
  }
  if (stat.isSocket()) {
    rows.push('socket ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
      stat.gid + ' ' + entry);
    return;
  }
  rows.push('other ' + stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' +
    stat.gid + ' ' + entry);
}
fs.readdirSync('/tmp').sort().forEach((name) => visit(path.join('/tmp', name)));
fs.writeFileSync(output, rows.join('\n') + (rows.length ? '\n' : ''));
NODE
if ! cmp -s "$task3_temp_before" "$task3_temp_after"; then
  diff -u "$task3_temp_before" "$task3_temp_after" >"$task3_temp_diff" || true
  cat "$task3_temp_diff"
  false
fi
export task3_scope_after task3_index_after task3_cached_diff_after task3_allowed_impl_after
export task3_authority_after task3_temp_after
export task3_temp_diff
```

### Task 6: Write Report And Handoff For Fresh Review

**Files:**

- Create: `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md`

**Interfaces:**

- Consumes: final hashes, line/byte counts, RED/GREEN TAP summaries, direct gate statuses, aggregate classifications, scope/index/temp evidence.
- Produces: `READY_FOR_REVIEW` report only when every direct functional gate passes and aggregate failures are classified literally.

- [ ] **Step 1: Write the report after all gates**

The report must include:

- authority identities for this plan, parent scheduler design, parent implementation plan, model routing, Task-1 brief/report, Task-2 brief/report, and progress ledger;
- controller-provided accepted remediation-plan SHA via `$task3_controller_plan_sha256`, with before/after authority comparison proving the plan did not drift during source work;
- absence of `task-3-brief.md` at dispatch and confirmation that no replacement brief was created;
- exact allowed paths and exact changed paths;
- baseline and final SHA-256, line count, and byte count for every changed implementation artifact, including both artifacts and `server/scheduler/events.js`; the report must not claim its own final hash because the controller handoff owns report identity after write;
- the sole RED command, status, 82/61/20/1 TAP summary, all 20 failing Task-3 test names, and root-cause classification;
- the sole GREEN command, status, 82/81/0/1 TAP summary, and all 20 passing Task-3 test names;
- direct `node tools/smoke.js`, strict deprecation, `node --check`, lint, build, artifact, protected-hash, topology, width, whitespace, type-aware closed-world scope manifest, allowed-path pre/post type/mode/hash manifests that expose chmod-only changes, staged-index existence/type/size/hash plus cached diff snapshot, authority snapshot, rooted allowed-path regular-file guards, created-path and absent-brief true-ENOENT lstat guards, final target type checks, and full `/tmp` before/after manifest comparison evidence covering additions, deletions, modifications, symlinks, directories, FIFOs, sockets, modes, ownership, and sizes;
- literal `npm test` and `node tools/check-syntax.js` outcomes with environmental blocker classification when applicable, never labeled as pass unless exit status is 0, plus the before-edit `node tools/test-server.js` preflight status when `SERVER KHÔNG LÊN` is cited; generic `Error`/`error` lines are fingerprinted and rejected unless they carry the exact known `EPERM`/`EACCES` environmental code, exact indented `  · ...` smoke-progress lines are accepted as benign while arbitrary indented lines are rejected, and syntax nonzero output is classified line-by-line with unknown blocks, adjacent generic diagnostics, or same-line EPERM/EACCES functional suffixes rejected;
- proof that `G.TICK_PARTIAL` is the only local deferred sentinel, `G.sukienKe(st)` remains numeric, `G.MO_PHONG_NHE` returns a zero-effect `TickOutcome` that obeys `G.tickOutcomeNeedsDeferral`, `G.tick` and `G.tickNoiBo` return real `TickOutcome` objects instead of the sentinel, `G.tickNoiBo` has zero-budget local-continuation coverage for the listed primitive families plus explicit exclusion of live external refs and supplied durable fences, `G.tickOutcomeNeedsDeferral` is the only TickOutcome-to-sentinel bridge, full sentinel comparison uses `G.laTickPartial`, `G.chay` covers budget exhaustion, stubbed `blockedExternal`, a real classifier-produced external block on the same state/target args received by `G.tick`, and illegal local-sentinel returns from `G.tick`, transport `code:'TICK_PARTIAL'` is kept separate from the local sentinel, MP startup/action paths performed zero local ticks, fulfilled-body and rejected-error MP partial responses both preserve `code:'TICK_PARTIAL'` with distinct callback evidence, `events.js` has same-task tests and syntax gate evidence, `events.js` exports `derivePvpMatchId` and `externalKey` with the token-aware exact import allowlist `node:crypto` and `../rules.js`, the import policy rejects the enumerated comment-spaced, template, escaped-identifier, Unicode string/key, dynamic, indirect, alias, computed, split-key, string-generated, alternate-acquisition, `Reflect`, dead/delayed-branch, parentless/forged-parent, G-mutation, and wall-clock negative corpus, the exact PvP vector `31fa1b6a5d6ecf7c882dbf36bd35b2cf0508252196ac6de8a9da629e4baba072` is asserted with malformed-ref and malformed-defender rejection matrices, invalid/noncanonical refs are rejected or classified through the listed fleet/missile boundary, missing-key, wrong-cardinality, scalar, and malformed-ref matrices, direct `derivePvpMatchId` proves strict top-level/ref-shape validation, direct `stableFleetRef`/`stableMissileRef` vectors include ownerAccountId malformed, boolean/object/array entity/time rejects, maximum safe entity-id accepts, and zero-second launch/arrival accepts, actual `G.banTenLua` action capture of `diLuc` at launch is asserted, `canonicalExternalStatus(kho, ref)` uses only `EXACT`/`ALREADY_ABSENT`/`REF_MISMATCH` and covers live, absent, mismatched, and malformed fleet and missile refs, Task-2 `validateJob` accepts attack/transport/spy/hold/missile jobs, nonempty `deriveExternalJobs(11, state, ownerFor)` proof is present, `APP.lam` has finite/range/callback-safe/FIFO/1000-cap behavior including the latest partial save at the exact cap, APP/startup/import partial checkpoints are saved before timers are scheduled, startup/import/heartbeat/visibility paths are partial-aware without duplicate pending timers across double interval plus visibility overlap, MP startup/API code propagation is tested, invalid budget/options/target matrices are captured through both `G.tick` and `G.tickNoiBo` with behavior-specific RED causes, and aggregate environmental failures did not hide any direct functional failure;
- unexecuted commit intent: `feat: add durable event classification and partial ticking`;
- final status `READY_FOR_REVIEW` or `BLOCKED` with exact failing evidence.

After writing the report, capture the controller handoff identity set. The report
must not claim its own final hash in its body; this post-report manifest is the
handoff evidence for source, tests, artifacts, and report identity:

```bash
test -n "${task3_runtime_dir:-}"
test -d "$task3_runtime_dir"
task3_post_report_identity="$task3_runtime_dir/post-report-identity.sha256"
task3_controller_handoff="$task3_runtime_dir/controller-handoff.txt"
task3_report_path=".superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md"
task3_allowed_after="$task3_runtime_dir/allowed-after.manifest"
task3_scope_after="$task3_runtime_dir/scope-after.manifest"
task3_index_after="$task3_runtime_dir/index-after.manifest"
task3_cached_diff_after="$task3_runtime_dir/cached-diff-after.patch"
task3_authority_after="$task3_runtime_dir/authority-after.sha256"
task3_temp_after="$task3_runtime_dir/tmp-after.txt"
task3_temp_diff="$task3_runtime_dir/tmp-diff.txt"
task3_assert_root_identity
node - "$task3_report_path" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const abs = path.resolve(root, process.argv[2]);
if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('report path escapes root');
const parent = fs.realpathSync(path.dirname(abs));
if (parent !== root && !parent.startsWith(root + path.sep)) {
  throw new Error('report parent escapes root');
}
const stat = fs.lstatSync(abs);
if (!stat.isFile()) throw new Error('Task-3 report is not a regular file after write');
NODE
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const rel = '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-brief.md';
function rooted(target) {
  const abs = path.resolve(root, target);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('brief path escapes root: ' + target);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) {
    throw new Error('brief parent escapes root: ' + target);
  }
  return abs;
}
try {
  fs.lstatSync(rooted(rel));
  throw new Error('Task-3 brief exists or is dangling symlink after report: ' + rel);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
NODE
task3_assert_root_identity
node - "$task3_index_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const indexPath = path.resolve(root, '.git/index');
if (indexPath !== root && !indexPath.startsWith(root + path.sep)) {
  throw new Error('index path escapes root: .git/index');
}
const stat = fs.lstatSync(indexPath);
if (!stat.isFile()) throw new Error('.git/index is not a regular file after report');
const hash = crypto.createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex');
fs.writeFileSync(process.argv[2], 'file ' + hash + ' ' + stat.size + ' ' +
  stat.mode + ' ' + stat.uid + ':' + stat.gid + ' .git/index\n');
NODE
git diff --cached --binary >"$task3_cached_diff_after"
cmp -s "$task3_index_before" "$task3_index_after"
cmp -s "$task3_cached_diff_before" "$task3_cached_diff_after"
test ! -s "$task3_cached_diff_after"
task3_assert_root_identity
sha256sum \
  "$task3_controller_plan_path" \
  docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md \
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md \
  .superpowers/sdd/model-routing.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/progress.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-brief.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-semantic-review.md \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/round8-final-executable-review.md \
  >"$task3_authority_after"
cmp -s "$task3_authority_before" "$task3_authority_after"
task3_assert_root_identity
node - "$task3_allowed_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const allowed = [
  'tools/test-scheduler.js', 'js/fleet.js', 'js/actions.js', 'js/app.js',
  'js/main.js', 'web/js/mp.js', 'server/scheduler/events.js',
  'dist/thien-ha-dai-chien.html', 'dist/artifact.html',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md'
];
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('allowed path escapes root: ' + rel);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) {
    throw new Error('allowed parent escapes root: ' + rel);
  }
  return abs;
}
function row(rel) {
  const abs = rooted(rel);
  const stat = fs.lstatSync(abs);
  const meta = stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid;
  if (stat.isSymbolicLink()) return 'link ' + meta + ' ' + fs.readlinkSync(abs) + ' ' + rel;
  if (stat.isDirectory()) return 'dir ' + meta + ' ' + rel;
  if (!stat.isFile()) return 'other ' + meta + ' ' + rel;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  return 'file ' + hash + ' ' + meta + ' ' + rel;
}
const rows = allowed.map(row);
if (!rows.some((line) =>
    /^file [0-9a-f]{64} [0-9]+ [0-9]+ [0-9]+:[0-9]+ \.superpowers\/sdd\/2026-08-23-durable-event-scheduler-implementation\/task-3-report\.md$/.test(line))) {
  throw new Error('allowed-after did not record Task-3 report as a regular file');
}
fs.writeFileSync(process.argv[2], rows.join('\n') + '\n');
NODE
task3_assert_root_identity
node - "$task3_scope_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const output = process.argv[2];
const root = process.cwd();
const allowed = new Set([
  './tools/test-scheduler.js', './js/fleet.js', './js/actions.js', './js/app.js',
  './js/main.js', './web/js/mp.js', './server/scheduler/events.js',
  './dist/thien-ha-dai-chien.html', './dist/artifact.html',
  './.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-report.md'
]);
const rows = [];
function label(abs) {
  const rel = path.relative(root, abs).split(path.sep).join('/');
  return rel ? './' + rel : '.';
}
function typeRow(stat, abs) {
  const rel = label(abs);
  const meta = stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid;
  if (stat.isDirectory()) return 'dir ' + meta + ' ' + rel;
  if (stat.isSymbolicLink()) return 'link ' + meta + ' ' + fs.readlinkSync(abs) + ' ' + rel;
  if (stat.isFIFO()) return 'fifo ' + meta + ' ' + rel;
  if (stat.isSocket()) return 'socket ' + meta + ' ' + rel;
  if (!stat.isFile()) return 'other ' + meta + ' ' + rel;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  return 'file ' + hash + ' ' + meta + ' ' + rel;
}
function visit(abs) {
  const rel = label(abs);
  if (rel === './.git' || rel.startsWith('./.git/') || allowed.has(rel)) return;
  let stat;
  try { stat = fs.lstatSync(abs); }
  catch (error) { rows.push('error ' + rel + ' ' + (error.code || 'UNKNOWN')); return; }
  rows.push(typeRow(stat, abs));
  if (!stat.isDirectory()) return;
  fs.readdirSync(abs).sort().forEach((name) => visit(path.join(abs, name)));
}
visit(root);
fs.writeFileSync(output, rows.join('\n') + (rows.length ? '\n' : ''));
NODE
cmp -s "$task3_scope_before" "$task3_scope_after"
task3_assert_root_identity
node - "$task3_runtime_dir" "$task3_temp_after" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const runtime = path.resolve(process.argv[2]);
const output = process.argv[3];
const rows = [];
function visit(entry) {
  const resolved = path.resolve(entry);
  if (resolved === runtime || resolved.startsWith(runtime + path.sep)) return;
  let stat;
  try { stat = fs.lstatSync(entry); }
  catch (error) { rows.push('error ' + entry + ' ' + (error.code || 'UNKNOWN')); return; }
  const meta = stat.mode + ' ' + stat.size + ' ' + stat.uid + ':' + stat.gid;
  if (stat.isDirectory()) {
    rows.push('dir ' + meta + ' ' + entry);
    fs.readdirSync(entry).sort().forEach((name) => visit(path.join(entry, name)));
  } else if (stat.isFile()) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex');
    rows.push('file ' + hash + ' ' + meta + ' ' + entry);
  } else if (stat.isSymbolicLink()) rows.push('link ' + meta + ' ' + fs.readlinkSync(entry) + ' ' + entry);
  else if (stat.isFIFO()) rows.push('fifo ' + meta + ' ' + entry);
  else if (stat.isSocket()) rows.push('socket ' + meta + ' ' + entry);
  else rows.push('other ' + meta + ' ' + entry);
}
fs.readdirSync('/tmp').sort().forEach((name) => visit(path.join('/tmp', name)));
fs.writeFileSync(output, rows.join('\n') + (rows.length ? '\n' : ''));
NODE
if ! cmp -s "$task3_temp_before" "$task3_temp_after"; then
  diff -u "$task3_temp_before" "$task3_temp_after" >"$task3_temp_diff" || true
  cat "$task3_temp_diff"
  false
fi
task3_assert_root_identity
node - "$task3_post_report_identity" "$task3_controller_handoff" "$task3_report_path" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
const targets = [
  'tools/test-scheduler.js', 'js/fleet.js', 'js/actions.js', 'js/app.js',
  'js/main.js', 'web/js/mp.js', 'server/scheduler/events.js',
  'dist/thien-ha-dai-chien.html', 'dist/artifact.html', process.argv[4]
];
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('handoff path escapes root: ' + rel);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) {
    throw new Error('handoff parent escapes root: ' + rel);
  }
  return abs;
}
const rows = [];
for (const rel of targets) {
  const abs = rooted(rel);
  const stat = fs.lstatSync(abs);
  if (!stat.isFile()) throw new Error('handoff target is not regular file: ' + rel);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  rows.push('file ' + hash + ' ' + stat.mode + ' ' + stat.size + ' ' +
    stat.uid + ':' + stat.gid + ' ' + rel);
  if (rel === process.argv[4]) {
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    rows.push('report-lines-bytes ' + lines + ' ' + stat.size + ' ' + rel);
  }
}
fs.writeFileSync(process.argv[2], rows.join('\n') + '\n');
fs.writeFileSync(process.argv[3], 'TASK3_CONTROLLER_HANDOFF_BEGIN\n' +
  rows.join('\n') + '\nTASK3_CONTROLLER_HANDOFF_END\n');
NODE
cat "$task3_controller_handoff"
for task3_review_role in logic runtime; do
  task3_review_prompt="$task3_runtime_dir/${task3_review_role}-review-prompt.txt"
  {
    echo "Task3 ${task3_review_role} review must verify and echo this exact controller handoff marker payload:"
    cat "$task3_controller_handoff"
  } >"$task3_review_prompt"
  cat "$task3_review_prompt"
done
test -s "$task3_post_report_identity"
export task3_post_report_identity task3_controller_handoff task3_report_path task3_review_role
export task3_allowed_after task3_scope_after task3_index_after task3_cached_diff_after
export task3_authority_after task3_temp_after task3_temp_diff
```

After the report copies the RED/GREEN/aggregate text from `$task3_runtime_dir`
and the post-report handoff identity is printed, the implementer final response
must paste the exact `TASK3_CONTROLLER_HANDOFF_BEGIN` marker payload. The two
fresh `gpt-5.6-sol` reviewer dispatch prompts must paste the same marker
payload and require reviewers to echo the same source/test/artifact/report
type/mode/owner/hash identity. Cleanup may run only after the controller
captures the marker in the conversation/control plane and acknowledges capture
by exporting `task3_controller_handoff_captured_sha256` equal to the
`sha256sum` of `$task3_controller_handoff`. Then remove the runtime directory
and verify it is absent:

```bash
test -n "${task3_runtime_dir:-}"
test -d "$task3_runtime_dir"
test -n "${task3_controller_handoff_captured_sha256:-}"
test "$task3_controller_handoff_captured_sha256" = \
  "$(sha256sum "$task3_controller_handoff" | cut -d' ' -f1)"
find "$task3_runtime_dir" -type f -delete
find "$task3_runtime_dir" -mindepth 1 -type d -empty -delete
rmdir "$task3_runtime_dir"
test ! -e "$task3_runtime_dir"
unset task3_runtime_dir task3_scope_before task3_scope_after
unset task3_index_before task3_index_after task3_cached_diff_before task3_cached_diff_after
unset task3_allowed_before task3_allowed_impl_after task3_allowed_after
unset task3_authority_before task3_authority_after task3_controller_plan_path
unset task3_temp_before task3_temp_after task3_temp_diff
unset task3_server_preflight_output task3_server_preflight_fingerprint
unset task3_server_preflight_status
unset task3_red_tap task3_green_tap task3_npm_output task3_syntax_output
unset task3_post_report_identity task3_controller_handoff task3_report_path task3_review_prompt
unset task3_review_role
unset task3_controller_handoff_captured_sha256
```

- [ ] **Step 2: Request two fresh reviews before Task 4**

After the report is written, stop source work. The controller must dispatch:

- behavior/logic review: fresh `gpt-5.6-sol`, verifying classifier semantics, partial tick invariants, stable refs, same-task `events.js` tests, `G.TICK_PARTIAL`, and RED/GREEN validity;
- runtime/scope review: separate fresh `gpt-5.6-sol`, verifying changed-path scope, artifact rebuild, direct vs aggregate gate classification, index/temp hygiene, and no Task-4+ implementation.

Both dispatch prompts must paste the exact printed `TASK3_CONTROLLER_HANDOFF_BEGIN` marker payload from the implementer final response, and both reviewers must echo the same report/source/test/artifact type/mode/owner/hash identity set before issuing PASS. Task 4 remains blocked until both reviewers approve that same final identity set.

## Authoring-Time Verification

These commands validate this plan artifact without running Task-3 RED/GREEN or editing source:

```bash
set -Eeuo pipefail
plan=docs/superpowers/plans/2026-08-24-durable-scheduler-task3-remediation-implementation.md
placeholder_pattern="$(printf '%s|%s|%s|%s' 'TB''D' 'TO''DO' 'fill ''in' 'implement ''later')"
test "$(rg -n "$placeholder_pattern" "$plan" | wc -l)" -eq 0
test "$(rg -n '[[:blank:]]+$' "$plan" | wc -l)" -eq 0
node - <<'NODE'
const fs = require('node:fs');
const vm = require('node:vm');
const plan = fs.readFileSync(
  'docs/superpowers/plans/2026-08-24-durable-scheduler-task3-remediation-implementation.md',
  'utf8'
);
let insideFence = false;
let fenceCount = 0;
for (const line of plan.split('\n')) {
  if (!line.startsWith('```')) continue;
  fenceCount += 1;
  insideFence = !insideFence;
}
if (insideFence || fenceCount % 2 !== 0) {
  throw new Error('fence imbalance ' + fenceCount);
}
for (const required of [
  'server/scheduler/events.js',
  'G.TICK_PARTIAL',
  'G.tickOutcomeNeedsDeferral',
  'G.tickNoiBo accepts zero local continuation without returning sentinel',
  'task3 G.sukienKe must remain numeric for legacy callers',
  'task3 G.MO_PHONG_NHE TickOutcome must obey the deferral bridge',
  'task3 actual G.banTenLua action must capture diLuc at launch',
  'TICK_PARTIAL',
  'BLOCKED_EXTERNAL',
  'derivePvpMatchId',
  '31fa1b6a5d6ecf7c882dbf36bd35b2cf0508252196ac6de8a9da629e4baba072',
  'deriveExternalJobs(11, liveState, ownerFor)',
  'jobFromRef(ref, targetAccountForKey)',
  'canonicalExternalStatus(kho, ref)',
  '.superpowers/sdd/model-routing.md',
  '09bd427da604835fef1495bb30d6c8816f59f6d8cb407023a9916cc154e45b0f',
  'externalKey',
  'EXACT',
  'ALREADY_ABSENT',
  'REF_MISMATCH',
  '^# tests 82$',
  '^# fail 20$',
  'task3FlushUntilSettled',
  'Object.defineProperty(global, key',
	  'task3 implicit two-arg budget must stop at the due second',
	  'task3 same-second ordering must cover eight classes',
	  'task3 same-second ordering must execute a canonical research completion',
	  'task3 same-second ordering must execute the raid primitive last',
	  'task3 tickNoiBo zero budget primitive case',
	  "['maintenance', function",
	  'task3 local cap private ST startup must schedule the first continuation',
	  'task3 local multiplayer classifier case npc must stay local',
	  'task3 self local classifier must exercise the equal-owner callback branch',
	  '9007199254740',
	  'task3 safeSecond ceiling must match Task2 exact maximum',
		  'task3 direct stableFleetRef must accept the Task2 safeSecond ceiling',
		  'task3 direct stableFleetRef must accept max safe entity id and zero-second launch arrival',
			  'task3 direct stableFleetRef malformed ownerAccountId case',
			  'zero id',
			  'undefined id',
			  'null id',
			  'negative infinite id',
			  'function id',
			  'boolean id',
			  'object id',
			  'array id',
			  'string launch',
			  'undefined launch',
			  'function launch',
			  'boolean launch',
			  'object launch',
			  'array launch',
			  'negative infinite launch',
			  'string arrival',
			  'undefined arrival',
			  'function arrival',
			  'boolean arrival',
			  'object arrival',
			  'array arrival',
			  'negative infinite arrival',
		  'task3 direct stableMissileRef must accept max safe entity id and zero-second explicit launch arrival',
		  'task3 direct stableMissileRef legacy-derived matrix must accept zero-second derived launch',
			  'task3 derivePvpMatchId malformed ref case',
			  'task3 derivePvpMatchId strict validator must reject incomplete direct refs',
			  'task3 derivePvpMatchId malformed defender case',
			  'owner undefined',
			  'owner null',
			  'owner function',
			  'owner boolean',
			  'owner object',
			  'owner array',
			  'fleet function',
			  'fleet boolean',
			  'fleet object',
			  'fleet array',
			  'missing targetKey',
			  'target object',
			  'missing mission',
			  'mission object',
			  'owner zero',
		  'fleet zero',
		  'launch after arrival',
		  'derived launch negative',
		  'derived launch unsafe arrival',
		  'task3 direct stableMissileRef malformed case',
	  'task3 deriveExternalJobs must derive attack, transport, spy, and hold live fleet jobs',
	  'task3 real classifier must classify ',
	  'module constructor load',
	  'process builtin module load',
	  'code-point escaped identifier require',
	  'arbitrary constructor loader',
	  'split string constructor key',
	  'unicode string constructor key',
	  'template computed constructor key',
	  'split getBuiltinModule load',
	  'Promise delayed loader',
	  'parentless runtime import',
	  'escaped identifier import',
	  'template interpolation require',
	  'task3 startup must call G.tickOutcomeNeedsDeferral',
	  'task3 visibility bridge must use G.laTickPartial',
	  'task3 browser descriptor restored after success',
	  'task3 MP fixture must provide no-op batDauNhip',
	  'task3 MP test must await all action callback microtasks',
	  'task3 MP browser descriptor restored after failure',
  'task3_controller_plan_sha256',
  'task3_cached_diff_before',
  'created target is broken symlink',
  'local paste import schedules a partial checkpoint before continuation',
  'local file import schedules a partial checkpoint before continuation',
  'visibility heartbeat does not duplicate an already pending continuation',
  'task3 interval plus visibility overlap must not duplicate',
  'local APP.lam caps one action at 1000 partial continuations',
  'TICK_SENTINEL_FROM_TICK_INVALID',
  'task3 G.chay real external fixture must convert real blockedExternal',
  'events.js uses nonliteral require',
  'events.js uses indirect loader',
  'Reflect apply require',
  'aliased require',
  'transport code used as local sentinel',
  'task3_authority_before',
  'task3_index_before',
	  'task3_temp_before',
	  'task3_temp_diff',
	  'allowed-before.manifest',
	  'allowed-implementation-after.manifest',
	  'allowed-after did not record Task-3 report as a regular file',
	  'post-report-identity.sha256',
	  'report-lines-bytes',
	  'TASK3_CONTROLLER_HANDOFF_BEGIN',
		  'unknown aggregate output line',
		  'smokeProgressPatterns',
		  'localeNumber',
		  'sản lượng/giờ: KL 27360 TA 18200 NL 3072 TP 11041 | điện 5140/3750',
		  'kết quả trận: hoa, phế liệu 9.900 KL',
		  'tên lửa: bắn 10, bị chặn 7, phá Pháo Laser Lớn ×4',
		  'kết quả 30 chuyến thám hiểm: {"tài nguyên":11',
		  'đổ bộ: thắng, phòng thủ mặt đất địch 632 -> 292, cướp 1.141.288',
		  'tua 30 ngày mất 3ms',
		  'phế liệu . KL',
		  'phế liệu 9..900 KL',
		  'phế liệu 99.90 KL',
		  'Pháo Laser Lớn ×.',
		  'Pháo Laser Lớn ×4..000',
		  'phòng thủ mặt đất địch . -> .., cướp ...',
		  '1.23.456 -> 292',
		  'arbitrary Unicode Ω',
		  'smoke progress: browser smoke completed',
		  'npm aggregate smoke progress benign line rejected',
		  'npm aggregate smoke progress accepted arbitrary line',
		  'unknown syntax output line',
		  'functional syntax diagnostic line',
		  'syntax parser self-test accepted adjacent bad line',
		  'syntax-check spawn EPERM',
		  'syntax-check spawn EACCES',
		  'EPERM SyntaxError: leaked',
		  'Task-3 brief exists or is dangling symlink after report',
		  'task3_root_identity',
		  'root.identity',
		  'workspace root identity changed',
		  'index path escapes root',
		  'report path escapes root',
		  'authoring absent path escapes root',
		  'allowed path escapes root',
		  'handoff path escapes root',
		  'task3_controller_handoff_captured_sha256',
		  'scope-before.manifest',
  'fifo ',
  'socket ',
  'task3-plan-red-tests.js',
  'task3_red_status',
  'task3_green_status',
  'READY_FOR_REVIEW',
  'gpt-5.6-sol',
  'Do not dispatch a Terra reviewer'
]) {
  if (!plan.includes(required)) throw new Error('missing ' + required);
}
const jsFence = plan.match(/```js\n\nvar task3EventsCache;[\s\S]*?\n```/);
if (!jsFence) throw new Error('missing Task-3 RED test fence');
const jsBody = jsFence[0].replace(/^```js\n/, '').replace(/\n```$/, '');
new vm.Script(jsBody, {filename: 'task3-plan-red-tests.js'});
const registered = [];
vm.runInNewContext(jsBody, {
  test: (name, fn) => registered.push({name, fn}),
  require: () => ({}),
  console,
  JSON,
  Number,
  Object,
  Array,
  Math,
  String,
  Error,
  Promise,
  setImmediate: () => {},
  setTimeout: () => {},
  __dirname: '.'
}, {filename: 'task3-plan-red-tests.js', timeout: 1000});
const testNames = Array.from(jsBody.matchAll(/^test\('([^']+)'/gm)).map((match) => match[1]);
if (testNames.length !== 20) throw new Error('Task-3 RED test count ' + testNames.length);
if (new Set(testNames).size !== 20) throw new Error('duplicate Task-3 RED test name');
if (registered.length !== 20) throw new Error('in-memory append registered ' + registered.length);
if (JSON.stringify(registered.map((item) => item.name)) !== JSON.stringify(testNames)) {
  throw new Error('in-memory append registered names do not match source order');
}
const redMap = plan.match(/const expected = \[[\s\S]*?\n\];/);
if (!redMap) throw new Error('missing RED cause map');
const causeNames = Array.from(redMap[0].matchAll(/name: '([^']+)'/g)).map((match) => match[1]);
if (causeNames.length !== 20) throw new Error('RED cause map count ' + causeNames.length);
if (JSON.stringify(causeNames) !== JSON.stringify(testNames)) {
  throw new Error('RED cause map names do not match Task-3 tests');
}
NODE
node - <<'NODE' | bash -n
const fs = require('node:fs');
const plan = fs.readFileSync(
  'docs/superpowers/plans/2026-08-24-durable-scheduler-task3-remediation-implementation.md',
  'utf8'
).split('\n');
let inside = false;
for (const line of plan) {
  if (!inside && line === '```bash') { inside = true; continue; }
  if (inside && line === '```') { inside = false; process.stdout.write('\n'); continue; }
  if (inside) process.stdout.write(line + '\n');
}
if (inside) throw new Error('unclosed bash fence');
NODE
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(process.cwd());
function rooted(rel) {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('authoring absent path escapes root: ' + rel);
  const parent = fs.realpathSync(path.dirname(abs));
  if (parent !== root && !parent.startsWith(root + path.sep)) {
    throw new Error('authoring absent parent escapes root: ' + rel);
  }
  return abs;
}
for (const rel of [
  'server/scheduler/events.js',
  '.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-3-brief.md'
]) {
  try {
    fs.lstatSync(rooted(rel));
    throw new Error('authoring-time absent path exists or is dangling symlink: ' + rel);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
NODE
```
