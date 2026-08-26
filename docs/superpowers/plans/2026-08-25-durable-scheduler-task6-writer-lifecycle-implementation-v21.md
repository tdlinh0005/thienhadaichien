# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V21

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every implementation wave and `superpowers:verification-before-completion` before reporting completion.

**Goal:** Implement Task 6 durable scheduler writer lifecycle, global watermark handling, retry/backoff/quarantine, command MutationGate, fresh cutover, CLI, and Task7-private lifecycle seams on accepted Tasks 1-5.

**Architecture:** V21 preserves V20's implementation contracts, helper prerequisite import strategy, and parent73 runtime import. It supersedes V20's overlay harness because V20's `task6v20Sentinel` fail-open wrapper could prefix arbitrary exceptions. V21 uses overlay8: the seven V20 overlay obligations rewritten with exact first-failure RED contracts plus one added exact-null partial wrapper regression. It also adds a real report draft producer before Stage-A grep validation and replaces the fixture-smoke block so no stray `tools/test-scheduler.js` command can execute after `fi`. Counts become `parent73 + overlay8 = N81`, final scheduler TAP `244/243/0/1`.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`. V20 retained contract source is `docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md`.

## Global constraints

- Preserve V1-V20 plan artifacts. This planning task creates only this V21 file.
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
- Overlay runtime registrations: `8`.
- Mechanical count: `parent runtime=73 + overlay=8 => N=81`.
- Expected final scheduler TAP: `244 tests`, `243 pass`, `0 fail`, `1 skipped`.
- V18 replay and partial-wrapper overlays remain absent.
- Parent Task6, accepted Task5, live source APIs, and V20 production contracts override any V1-V19 conflict; this V21 file overrides V20 artifact/report/smoke workflow.
- No report self-hash and no embedded V21 self-hash; root passes `TASK6_V21_APPROVED_SHA` externally.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
```

## Retained V20 implementation contract

Keep these V20 sections unchanged in implementation meaning:

- Helper prerequisite import and sealing:
  - Base world helpers `6411-6470`
  - Task5 imports/helper `7601-7609` plus V20 explicit imports
  - PvP fixture helpers `7677-7702` plus V21-owned fixed `taoPvpFixtureAt(arrivalAtS)`; do not copy broken parent lines `7703-7744` blindly because current accepted baseline can produce no `PVP_RESOLVE` row and fail before overlay targets.
  - Fixture execution helpers `7748-7850`
  - Account/reopen helpers `7855-7904`
  - Raw local helpers `8134-8144`
- Parent73 import:
  - `10886-11844`
  - `11848-12485`
  - `12489-12833`
  - `12837-13070`
- Production contracts:
  - Task5 downstream replay/prepare/insert/apply/terminal ordering.
  - Store primitives `quarantineClaimedRaw`, `retargetOwnedPendingAccountAdvanceForCommand`, `validateBlockedAccountAdvanceForDependency`, `listExpiredRunningForRecovery`, `listOwnedRunningForRecovery`.
  - Writer lifecycle, status/cache/private seams, timers, startup recovery, global/account claim, failure settlement, crash hooks, `advanceDueInCurrentUow`, `runCommand`, direct external continuation, public five-key `advanceTo`.
  - Exact `index.js` exports `{taoScheduler, inRange, resolveDurableSchedulerOptions}`.
  - Exact `runMaintenanceCutover({kho, clock, ownerId})`.
  - Exact CLI exports `{parseArgs, runCli, main}` and safe error behavior.
- Overlay8 tests:
  - Raw quarantine direct Store primitive with invalid JSON bytes.
  - Status/cache/private seams/index exports.
  - Retarget and blocked descriptor Store primitives.
  - Startup renew-before-ready and publish-after-commit.
  - Due61 live order and continuation.
  - Cutover guards and release precedence.
  - CLI grammar/lifecycle/exports and process.exitCode restoration.
  - Task5 exact-null partial wrapper: `{checkpointRevision:null, saveReceipt:null}` performs zero checkpoint/block/application/terminal/lifecycle calls and leaves the adopted `RUNNING` lock tuple byte-for-byte unchanged.

## V21 source-slice production

There is no producer in this section. Every `/tmp/task6-v21-*` artifact is created exactly once in `Standalone V21 artifact creation from fresh /tmp` below.

The helper producer reads directly from pinned parent ranges, not from V20 `/tmp` outputs. The parent73 producer reads directly from pinned parent ranges. The overlay8 producer reads the pinned V20 overlay only as a source of seven obligation bodies, rewrites it to V21 fail-closed semantics, and appends the new exact-null wrapper regression. The V20 hash remains pinned so contract drift is explicit.

V21 overlay RED rules:

- Do not use `task6v20Sentinel` semantics. The V21 helper must never catch an arbitrary exception and add the sentinel.
- Each overlay begins with exactly one targeted capability assertion that can fail before later setup: `task6v21RequireFunction`, `task6v21RequireExport`, or `task6v21RequireBridgeSeam`.
- Those helpers throw `AssertionError` with exact `message === sentinel + ' missing <target>'`, `code === 'ERR_ASSERTION'`, and no wrapping.
- The RED harness accepts only the exact expected failure message for that overlay and rejects `TypeError`, `ReferenceError`, `MODULE_NOT_FOUND`, `SQLITE_`, generic `AssertionError` messages without the exact missing target, and every unexpected pass.
- Later GREEN assertions may use the same sentinel in assertion messages, but RED proof for each overlay is the first targeted missing-capability assertion only.
- Stage-A compares the final current overlay slice byte-for-byte with the approved V21 overlay slice generated from this plan workflow.

The eight exact overlay names and first RED targets are:

```text
Task 6 v21 overlay raw quarantine store primitive preserves attempt without parsing invalid payload	TASK6V21_RED_001_RAW_QUARANTINE_STORE	missing quarantineClaimedRaw
Task 6 v21 overlay status cache private seams bridge seams and exact scheduler exports	TASK6V21_RED_002_STATUS_EXPORTS	missing bridge._datDatabaseClosing
Task 6 v21 overlay retarget and blocked descriptor store primitives use dependency source account	TASK6V21_RED_003_RETARGET_DESCRIPTOR	missing retargetOwnedPendingAccountAdvanceForCommand
Task 6 v21 overlay startup renews after recovery before ready and publishes after commit	TASK6V21_RED_004_STARTUP_RENEW	missing listExpiredRunningForRecovery
Task 6 v21 overlay advance due keeps live order and enqueues continuation at sixty one	TASK6V21_RED_005_DUE61_ORDER	missing advanceDueInCurrentUow
Task 6 v21 overlay maintenance cutover validates guards and release precedence	TASK6V21_RED_006_CUTOVER_RELEASE	missing runMaintenanceCutover
Task 6 v21 overlay scheduler cutover CLI grammar lifecycle and exact exports	TASK6V21_RED_007_CLI	missing runCli
Task 6 v21 overlay exact null partial retains running lock without lifecycle calls	TASK6V21_RED_008_EXACT_NULL_PARTIAL	missing executeClaimedInCurrentUow
```

## Corrected fixture smoke command

Replace V20's fixture-smoke block with this exact shell. There is no command after `fi`.

```bash
node --test --test-isolation=none --test-reporter=tap \
  --test-name-pattern '^manualDrain starts with no timer and mutates a due job only on explicit drainNow$' \
  tools/test-scheduler.js > /tmp/task6-v21-fixture-smoke.tap
if rg -n 'ReferenceError|is not defined|MISSING_PREREQUISITE' /tmp/task6-v21-fixture-smoke.tap; then
  exit 1
fi
```

## Standalone V21 artifact creation from fresh `/tmp`

Run from a clean shell. This block creates every referenced V21 artifact; it does not depend on V20 `/tmp` files.

```bash
set -euo pipefail
rm -f /tmp/task6-v21-*

test -n "$TASK6_V21_APPROVED_SHA"
case "$TASK6_V21_APPROVED_SHA" in (*[!0-9a-f]*|'') exit 1 ;; esac
test "${#TASK6_V21_APPROVED_SHA}" -eq 64
printf '%s  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md\n' \
  "$TASK6_V21_APPROVED_SHA" > /tmp/task6-v21-approved-plan.sha256

cat > /tmp/task6-v21-authorities.sha256 <<'EOF'
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md
EOF
sha256sum -c /tmp/task6-v21-approved-plan.sha256
sha256sum -c /tmp/task6-v21-authorities.sha256

cat > /tmp/task6-v21-tap-normalize.sh <<'SH'
normalize_tap_for_hash() {
  sed -E '/^[[:space:]]+duration_ms:/d;/^# duration_ms /d' "$1"
}
SH
sha256sum /tmp/task6-v21-tap-normalize.sh > /tmp/task6-v21-tap-normalize.sh.sha256
```

### Inventory helper and PRE inventory

The normalized inventory excludes only the exact report file and exact reports directory entry from content diff. Stage-A separately validates their type, mode, and required content. Because the report is excluded, `post_inventory_sha` can be written into the report without a self-hash cycle, and Stage-B approval append does not change inventory.

```bash
cat > /tmp/task6-v21-inventory.sh <<'SH'
repo_inventory() {
  python3 - <<'PY'
import hashlib, os, stat, subprocess
excluded = {
  'docs/superpowers/reports',
  'docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
}
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
    if p in excluded:
        continue
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
sha256sum /tmp/task6-v21-inventory.sh > /tmp/task6-v21-inventory.sh.sha256
. /tmp/task6-v21-inventory.sh
repo_inventory > /tmp/task6-v21-pre-inventory.tsv
sha256sum /tmp/task6-v21-pre-inventory.tsv > /tmp/task6-v21-pre-inventory.tsv.sha256
```

### Baseline, prefix, helper, parent, and overlay artifacts

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v21-baseline.tap
grep -E '^# tests 163$' /tmp/task6-v21-baseline.tap
grep -E '^# pass 162$' /tmp/task6-v21-baseline.tap
grep -E '^# fail 0$' /tmp/task6-v21-baseline.tap
grep -E '^# skipped 1$' /tmp/task6-v21-baseline.tap
node - <<'NODE' /tmp/task6-v21-baseline.tap > /tmp/task6-v21-baseline-names.txt
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
if (names.length !== 163) throw new Error('BASELINE_NAME_COUNT_' + names.length);
for (const name of names) console.log(name);
NODE
sha256sum /tmp/task6-v21-baseline-names.txt > /tmp/task6-v21-baseline-names.txt.sha256

node - <<'NODE' > /tmp/task6-v21-prefix.tsv
const fs = require('fs'), crypto = require('crypto');
const data = fs.readFileSync('tools/test-scheduler.js');
for (const marker of [
  '// TASK6_V21_HELPERS_START',
  '// TASK6_V21_HELPERS_END',
  '// TASK6_V21_PARENT_TESTS_START',
  '// TASK6_V21_PARENT_TESTS_END',
  '// TASK6_V21_OVERLAY_TESTS_START',
  '// TASK6_V21_OVERLAY_TESTS_END'
]) {
  if (data.includes(Buffer.from(marker))) throw new Error('TASK6_V21_ALREADY_PRESENT');
}
console.log([data.length, crypto.createHash('sha256').update(data).digest('hex')].join('\t'));
NODE
sha256sum /tmp/task6-v21-prefix.tsv > /tmp/task6-v21-prefix.tsv.sha256

cat > /tmp/task6-v21-helper-imports.js <<'EOF'
var {
  GameAdvanceService,
  toPublicAdvanceResult
} = require('../server/scheduler/advance-service.js');
var {
  EventReducer,
  resolveCanonicalGlobalInCurrentUow
} = require('../server/scheduler/reducers.js');
var {SchedulerStore} = require('../server/scheduler/store.js');
EOF
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'
sed -n '6411,6470p' "$parent" > /tmp/task6-v21-helper-base.js
sed -n '7601,7609p' "$parent" > /tmp/task6-v21-helper-advance.js
sed -n '7677,7702p' "$parent" > /tmp/task6-v21-helper-pvp-base.js
cat > /tmp/task6-v21-helper-pvp.js <<'EOF'
function taoPvpFixtureAt(arrivalAtS) {
  var x = taoWorldSchedulerTam(), alliance = 'LienMinh' + x.target;
  x.clock.setS(arrivalAtS - 120);
  x.lease = layLease(x, '00000000-0000-4000-8000-000000000006');
  x.supporter = themTaiKhoan(x.kho, 'supporter-' + path.basename(x.file), giayTuClock(x.clock));
  x.unrelatedAccount = themTaiKhoan(x.kho, 'unrelated-' + path.basename(x.file), giayTuClock(x.clock));
  x.kho.trongGiaoDich(function () {
    var mutation = taoMutationTam(x.lease, undefined, x.clock.nowMs());
    x.world.trongMutationScheduler(mutation, function () {
      x.world.taoDeQuoc(x.supporter, 'Supporter', {mutation: mutation});
      x.world.taoDeQuoc(x.unrelatedAccount, 'Unrelated', {mutation: mutation});
    });
  }, {immediate: true});
  x.kho.q.lmThem.run(alliance, 'LM' + x.target, x.target, arrivalAtS - 90_000, null);
  x.kho.q.chienThemTK.run(x.attacker, x.target, arrivalAtS - 90_000);
  var defender = coDinhTimeline(docState(x.kho, x.target), arrivalAtS - 120);
  defender.lm = {ten: alliance};
  luuQuaMutation(x, x.target, defender);
  var supporter = coDinhTimeline(docState(x.kho, x.supporter), arrivalAtS - 120);
  supporter.lm = {ten: alliance};
  supporter.fleets.push(holdAt(supporter, x.targetHome, x.target, arrivalAtS));
  luuQuaMutation(x, x.supporter, supporter);
  var unrelated = coDinhTimeline(docState(x.kho, x.unrelatedAccount), arrivalAtS - 120);
  luuQuaMutation(x, x.unrelatedAccount, unrelated);
  var attacker = coDinhTimeline(docState(x.kho, x.attacker), arrivalAtS - 120);
  attacker.fleets.push(attackTo(attacker, x.targetHome));
  luuQuaMutation(x, x.attacker, attacker);
  installAdvanceServiceFixture(x);
  tuaFixtureQuaDichVu(x, x.attacker, arrivalAtS);
  var row = x.kho.db.prepare(
    "SELECT idempotency_key FROM event_jobs WHERE kind='PVP_RESOLVE' " +
    'ORDER BY sequence LIMIT 1'
  ).get();
  assert.ok(row && row.idempotency_key, 'TASK6V21_FIXTURE_PVP_JOB_CREATED');
  x.pvpStoredJob = x.store.getByIdempotencyKey(row.idempotency_key);
  assert.ok(x.pvpStoredJob && x.pvpStoredJob.id, 'TASK6V21_FIXTURE_PVP_JOB_LOADABLE');
  x.pvpJob = x.pvpStoredJob;
  x.pvpExecutable = null;
  x.reducer = new EventReducer({
    kho: x.kho, world: x.world, store: x.store,
    clock: x.clock, advanceService: x.service
  });
  return x;
}
EOF
sed -n '7748,7850p' "$parent" > /tmp/task6-v21-helper-exec.js
sed -n '7855,7904p' "$parent" > /tmp/task6-v21-helper-account.js
sed -n '8134,8144p' "$parent" > /tmp/task6-v21-helper-local.js
cat /tmp/task6-v21-helper-imports.js \
  /tmp/task6-v21-helper-base.js \
  /tmp/task6-v21-helper-advance.js \
  /tmp/task6-v21-helper-pvp-base.js \
  /tmp/task6-v21-helper-pvp.js \
  /tmp/task6-v21-helper-exec.js \
  /tmp/task6-v21-helper-account.js \
  /tmp/task6-v21-helper-local.js > /tmp/task6-v21-expected-helper-slice.js
test -s /tmp/task6-v21-expected-helper-slice.js
if rg -n '^[[:space:]]*test[[:space:]]*\\(' /tmp/task6-v21-expected-helper-slice.js; then exit 1; fi
sha256sum /tmp/task6-v21-expected-helper-slice.js > /tmp/task6-v21-expected-helper-slice.js.sha256
sha256sum /tmp/task6-v21-helper-*.js > /tmp/task6-v21-helper-parts.sha256

python3 - <<'PY' > /tmp/task6-v21-helper-free-identifiers.txt
names = [
 'assert','EventReducer','G','GameAdvanceService','Kho','SchedulerStore','TheGioi',
 'apDungMigrationScheduler','attackTo','coDinhTimeline','datNoiTaiCungGiay',
 'docState','fakeClock','giayTuClock','holdArrivingAt','holdAt',
 'installAdvanceServiceFixture','job','layLease','luuQuaMutation','path',
 'resolveCanonicalGlobalInCurrentUow','taoAccountAdvanceFixture','taoDongHoS',
 'taoKhoTam','taoMutationTam','taoPvpFixtureAt','taoStoreTam',
 'taoWorldSchedulerTam','themTaiKhoan','toPublicAdvanceResult'
]
print('\\n'.join(names))
PY
sha256sum /tmp/task6-v21-helper-free-identifiers.txt > /tmp/task6-v21-helper-free-identifiers.txt.sha256

python3 - <<'PY' > /tmp/task6-v21-parent73-names.txt
from pathlib import Path
text = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v20.md').read_text()
start = "cat > /tmp/task6-v20-parent73-names.txt <<'EOF'\\n"
end = "\\nEOF\\nwc -l /tmp/task6-v20-parent73-names.txt"
body = text.split(start, 1)[1].split(end, 1)[0]
print(body, end='')
PY
wc -l /tmp/task6-v21-parent73-names.txt | grep -E '^73 '
sha256sum /tmp/task6-v21-parent73-names.txt > /tmp/task6-v21-parent73-names.txt.sha256

sed -n '10886,11844p' "$parent" > /tmp/task6-v21-parent-block-1.md
sed -n '11848,12485p' "$parent" > /tmp/task6-v21-parent-block-2.md
sed -n '12489,12833p' "$parent" > /tmp/task6-v21-parent-block-3.md
sed -n '12837,13070p' "$parent" > /tmp/task6-v21-parent-block-4.md
sha256sum /tmp/task6-v21-parent-block-*.md > /tmp/task6-v21-parent-blocks.sha256
python3 - <<'PY' /tmp/task6-v21-parent-block-1.md /tmp/task6-v21-parent-block-2.md /tmp/task6-v21-parent-block-3.md /tmp/task6-v21-parent-block-4.md > /tmp/task6-v21-expected-parent-slice.js
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
test -s /tmp/task6-v21-expected-parent-slice.js
sha256sum /tmp/task6-v21-expected-parent-slice.js > /tmp/task6-v21-expected-parent-slice.js.sha256

python3 - <<'PY' > /tmp/task6-v21-expected-overlay.js
from pathlib import Path
text = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md').read_text()
start = '// TASK6_V21_PLAN_OVERLAY_JS_START\\n'
end = '// TASK6_V21_PLAN_OVERLAY_JS_END'
if start not in text or end not in text:
    raise SystemExit('TASK6_V21_PLAN_OVERLAY_BODY_MISSING')
body = text.split(start, 1)[1].split(end, 1)[0]
if 'task6v20Sentinel' in body or 'TASK6V20' in body:
    raise SystemExit('TASK6_V21_OVERLAY_FAIL_OPEN_REUSE')
print(body, end='')
PY
test -s /tmp/task6-v21-expected-overlay.js
sha256sum /tmp/task6-v21-expected-overlay.js > /tmp/task6-v21-expected-overlay.js.sha256

cat > /tmp/task6-v21-overlay8-red-contracts.tsv <<'EOF'
Task 6 v21 overlay raw quarantine store primitive preserves attempt without parsing invalid payload	TASK6V21_RED_001_RAW_QUARANTINE_STORE	missing quarantineClaimedRaw
Task 6 v21 overlay status cache private seams bridge seams and exact scheduler exports	TASK6V21_RED_002_STATUS_EXPORTS	missing bridge._datDatabaseClosing
Task 6 v21 overlay retarget and blocked descriptor store primitives use dependency source account	TASK6V21_RED_003_RETARGET_DESCRIPTOR	missing retargetOwnedPendingAccountAdvanceForCommand
Task 6 v21 overlay startup renews after recovery before ready and publishes after commit	TASK6V21_RED_004_STARTUP_RENEW	missing listExpiredRunningForRecovery
Task 6 v21 overlay advance due keeps live order and enqueues continuation at sixty one	TASK6V21_RED_005_DUE61_ORDER	missing advanceDueInCurrentUow
Task 6 v21 overlay maintenance cutover validates guards and release precedence	TASK6V21_RED_006_CUTOVER_RELEASE	missing runMaintenanceCutover
Task 6 v21 overlay scheduler cutover CLI grammar lifecycle and exact exports	TASK6V21_RED_007_CLI	missing runCli
Task 6 v21 overlay exact null partial retains running lock without lifecycle calls	TASK6V21_RED_008_EXACT_NULL_PARTIAL	missing executeClaimedInCurrentUow
EOF
cut -f1 /tmp/task6-v21-overlay8-red-contracts.tsv > /tmp/task6-v21-overlay8-names.txt
wc -l /tmp/task6-v21-overlay8-names.txt | grep -E '^8 '
sha256sum /tmp/task6-v21-overlay8-red-contracts.tsv > /tmp/task6-v21-overlay8-red-contracts.tsv.sha256
sha256sum /tmp/task6-v21-overlay8-names.txt > /tmp/task6-v21-overlay8-names.txt.sha256

python3 - <<'PY'
from pathlib import Path
text = Path('/tmp/task6-v21-expected-overlay.js').read_text()
actual = []
for line in text.splitlines():
    stripped = line.strip()
    if stripped.startswith("test('Task 6 v21 overlay "):
        actual.append(stripped.split("'", 2)[1])
expected = Path('/tmp/task6-v21-overlay8-names.txt').read_text().splitlines()
if actual != expected:
    raise SystemExit('TASK6_V21_OVERLAY_NAME_MISMATCH')
PY
```

## V21 implementation order override

Use this order instead of any V20 order that would let overlay tests fail during module load or fixture setup:

1. Capture PRE inventory, baseline TAP names, and prefix hash before any implementation edit.
2. Create minimal skeletons for the six owned files so `require('../server/scheduler/index.js')`, `require('../server/scheduler/cutover.js')`, `require('./scheduler-cutover.js')`, parent helper construction, `taoWriterFixture()`, `taoPvpFixtureAt()`, and `taoDurableOrderFixture()` can run without `MODULE_NOT_FOUND`, `ReferenceError`, `TypeError`, `SQLITE_`, or `TASK6V21_FIXTURE_` failures.
3. The skeleton must intentionally omit only these RED targets: `quarantineClaimedRaw`, bridge `_datDatabaseClosing`, `retargetOwnedPendingAccountAdvanceForCommand`, `listExpiredRunningForRecovery`, `advanceDueInCurrentUow`, `runMaintenanceCutover`, `runCli`, and `executeClaimedInCurrentUow`. Do not stub these to throw generic errors.
4. Append V21 helper slice, parent73 slice, and overlay8 slice under markers.
5. Run the eight isolated overlay RED cases once. Any failure other than the exact target assertion in `/tmp/task6-v21-overlay8-red-contracts.tsv` invalidates the skeleton/helper setup; fix setup before implementation.
6. Implement green behavior in TDD waves while preserving the sealed prefix, helper slice, parent slice, overlay slice, and expected runtime name order.

## V21 approved overlay JS body

Stage extracts the expected overlay body below from this approved V21 plan. The body intentionally has no catch-and-prefix wrapper. Each overlay's first missing-capability failure is exact and machine-checked by the RED producer.

```js
// TASK6_V21_PLAN_OVERLAY_JS_START
function task6v21RequireFunction(object, name, sentinel, label) {
  assert.equal(typeof (object && object[name]), 'function',
    sentinel + ' missing ' + (label || name));
}
function task6v21RequireExport(object, name, sentinel) {
  task6v21RequireFunction(object, name, sentinel, 'export.' + name);
}
function task6v21RequireBridgeSeam(bridge, name, sentinel) {
  task6v21RequireFunction(bridge, name, sentinel, 'bridge.' + name);
  assert.equal(Object.keys(bridge).includes(name), false,
    sentinel + ' bridge seam enumerable ' + name);
}
function task6v21Rows(kho, sql, params) {
  var stmt = kho.db.prepare(sql);
  return stmt.all.apply(stmt, params || []);
}
function task6v21RawJob(kho, id) {
  return kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(id);
}
function task6v21LockProjection(row) {
  return {
    id: row.id,
    state: row.state,
    locked_by: row.locked_by,
    locked_generation: row.locked_generation,
    locked_until_ms: row.locked_until_ms,
    attempt: row.attempt
  };
}

test('Task 6 v21 overlay raw quarantine store primitive preserves attempt without parsing invalid payload', async function () {
  var sentinel = 'TASK6V21_RED_001_RAW_QUARANTINE_STORE';
  var x = taoWriterFixture();
  try {
    assert.ok(x.pvpJob && x.pvpJob.idempotency_key, 'TASK6V21_FIXTURE_PVP_JOB_CREATED');
    task6v21RequireFunction(x.store, 'quarantineClaimedRaw', sentinel);
    x.clock.setS(x.pvpJob.scheduled_at_s);
    var token = layLease(x, x.ownerId);
    var nowMs = x.clock.nowMs();
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(token, x.pvpJob.id, nowMs, 15_000, {allowFuturePending: true});
    }, {immediate: true});
    x.kho.db.prepare('UPDATE event_jobs SET attempt=?,payload_json=? WHERE id=?')
      .run(3, '{not-json', claimed.id);
    var raw = task6v21RawJob(x.kho, claimed.id);
    var settled = x.kho.trongGiaoDich(function () {
      return x.store.quarantineClaimedRaw(token, raw,
        Object.assign(new Error('unsafe payload'), {code: 'PAYLOAD_INTEGRITY'}), nowMs);
    }, {immediate: true});
    assert.equal(settled.id, claimed.id, sentinel + ' quarantined id');
    assert.equal(settled.state, 'QUARANTINED', sentinel + ' state');
    var stored = x.store.getById(claimed.id);
    assert.equal(Number(stored.attempt), 3, sentinel + ' attempt preserved');
    assert.equal(stored.error_code, 'PAYLOAD_INTEGRITY', sentinel + ' scrubbed code');
    assert.equal(stored.retry_at_ms, null, sentinel + ' retry cleared');
    assert.equal(stored.locked_by, null, sentinel + ' owner cleared');
    assert.equal(stored.locked_generation, null, sentinel + ' generation cleared');
    assert.equal(stored.locked_until_ms, null, sentinel + ' lock cleared');
  } finally { x.dong(); }
});

test('Task 6 v21 overlay status cache private seams bridge seams and exact scheduler exports', async function () {
  var sentinel = 'TASK6V21_RED_002_STATUS_EXPORTS';
  var indexExports = require('../server/scheduler/index.js');
  task6v21RequireExport(indexExports, 'taoScheduler', sentinel);
  assert.deepEqual(Object.keys(indexExports).sort(),
    ['inRange', 'resolveDurableSchedulerOptions', 'taoScheduler'].sort(),
    sentinel + ' exact public exports');
  var x = taoWriterFixture({manualDrain: false, timers: taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }})});
  try {
    await x.writer.start();
    ['_datSignalHandlerInstalled', '_beginStop', '_waitForStopFinalization', '_datDatabaseClosing']
      .forEach(function (name) { task6v21RequireBridgeSeam(x.scheduler, name, sentinel); });
    var clearAllCalls = 0;
    var realClearAll = x.writer.clearAllTimers.bind(x.writer);
    x.writer.clearAllTimers = function () { clearAllCalls += 1; return realClearAll(); };
    var calls = 0;
    var realStatus = x.writer.status.bind(x.writer);
    x.writer.status = function () { calls += 1; return realStatus(); };
    var bridgeStatus = x.scheduler.getStatus();
    assert.equal(calls, 1, sentinel + ' bridge delegates to writer.status');
    assert.deepEqual(Object.keys(bridgeStatus).sort(), [
      'ages', 'continuationActive', 'counts', 'dbOpen', 'draining',
      'dueBacklog', 'heartbeatTimerActive', 'leaseHeld', 'metrics', 'mode',
      'nextEligibleAtMs', 'oldestDueAgeMs', 'pending', 'pollTimerActive',
      'quarantined', 'ready', 'reason', 'reconcileTimerActive',
      'recoveryComplete', 'retryWait', 'running', 'signalHandlerInstalled',
      'state', 'wakeTimerActive', 'watermarkS', 'writerLeaseHeld'
    ].sort(), sentinel + ' exact status keys');
    assert.equal(Object.prototype.hasOwnProperty.call(bridgeStatus, 'effectiveNowMs'), false,
      sentinel + ' effectiveNowMs private');
    bridgeStatus.metrics.jobAttempts.mutated = 1;
    bridgeStatus.metrics.jobDuration.ACCOUNT_ADVANCE = {success: {bucket: 1}};
    bridgeStatus.metrics.leaseAcquire.acquired = 99;
    bridgeStatus.metrics.reconcile.success = 99;
    assert.equal(x.writer.metrics.jobAttempts.mutated, undefined, sentinel + ' clone attempts');
    assert.equal(x.writer.metrics.jobDuration.ACCOUNT_ADVANCE, undefined, sentinel + ' clone duration');
    assert.notEqual(x.writer.metrics.leaseAcquire.acquired, 99, sentinel + ' clone lease');
    assert.notEqual(x.writer.metrics.reconcile.success, 99, sentinel + ' clone reconcile');
    x.scheduler._datSignalHandlerInstalled(true);
    assert.equal(x.scheduler.getStatus().signalHandlerInstalled, true, sentinel + ' signal seam');
    x.scheduler._datDatabaseClosing();
    assert.equal(clearAllCalls, 1, sentinel + ' db close clears all timers');
    x.store.statusSnapshot = function () { throw new Error('SQLITE_READ_AFTER_CLOSE'); };
    var closed = x.scheduler.getStatus();
    assert.equal(closed.dbOpen, false, sentinel + ' closed db');
    assert.equal(closed.ready, false, sentinel + ' closed not ready');
    assert.equal(closed.reason, 'SCHEDULER_DB_CLOSED', sentinel + ' closed reason');
    x.scheduler._beginStop('test-stop', 100);
    await x.scheduler._waitForStopFinalization();
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});

test('Task 6 v21 overlay retarget and blocked descriptor store primitives use dependency source account', async function () {
  var sentinel = 'TASK6V21_RED_003_RETARGET_DESCRIPTOR';
  var T = 1_800_020_000;
  var x = taoPvpFixtureAt(T);
  try {
    task6v21RequireFunction(x.store, 'retargetOwnedPendingAccountAdvanceForCommand', sentinel);
    task6v21RequireFunction(x.store, 'validateBlockedAccountAdvanceForDependency', sentinel);
    assert.ok(x.pvpJob && x.pvpJob.idempotency_key, 'TASK6V21_FIXTURE_PVP_JOB_CREATED');
    x.clock.setS(T);
    var token = layLease(x, '00000000-0000-4000-8000-000000000391');
    var nowMs = x.clock.nowMs();
    var accountId = Number(x.pvpJob.source_account_id);
    assert.equal(accountId, x.attacker, sentinel + ' dependency source account');
    var revision = Number(x.kho.q.dqGet.get(accountId).revision);
    var pending = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(token, accountId, revision, T + 10, nowMs);
    }, {immediate: true});
    var retargeted = x.kho.trongGiaoDich(function () {
      return x.store.retargetOwnedPendingAccountAdvanceForCommand(
        token, accountId, revision, T, nowMs
      );
    }, {immediate: true});
    assert.deepEqual(retargeted, Object.freeze({id: pending.id, accountId: accountId,
      revision: revision, scheduledAtS: T}), sentinel + ' exact retarget descriptor');
    assert.equal(Number(x.store.getById(pending.id).scheduled_at_s), T, sentinel + ' scheduled retargeted');
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(token, pending.id, nowMs, 15_000, {allowFuturePending: true});
    }, {immediate: true});
    x.kho.trongGiaoDich(function () {
      x.store.blockOwnedAccountAdvance(token, claimed, revision, x.pvpJob.id, nowMs);
    }, {immediate: true});
    var descriptor = x.kho.trongGiaoDich(function () {
      return x.store.validateBlockedAccountAdvanceForDependency(
        token, accountId, revision, x.pvpJob.id, T, nowMs
      );
    }, {immediate: true});
    assert.equal(Object.isFrozen(descriptor), true, sentinel + ' frozen blocked descriptor');
    assert.deepEqual(Object.keys(descriptor).sort(),
      ['accountId', 'blockedByJobId', 'id', 'revision', 'scheduledAtS'].sort(),
      sentinel + ' safe descriptor keys');
    assert.equal(descriptor.id, pending.id, sentinel + ' descriptor id');
    assert.equal(descriptor.blockedByJobId, x.pvpJob.id, sentinel + ' dependency id');
    assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'payload'), false,
      sentinel + ' no raw payload');
    assert.equal(x.store.retargetOwnedPendingAccountAdvanceForCommand(token, accountId + 1, revision, T, nowMs),
      null, sentinel + ' absent same key returns null');
    assert.throws(function () {
      x.store.validateBlockedAccountAdvanceForDependency(
        token, accountId, revision, '00000000-0000-4000-8000-000000000999', T, nowMs
      );
    }, /ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT/, sentinel + ' wrong dependency rejected');
  } finally { x.dong(); }
});

test('Task 6 v21 overlay startup renews after recovery before ready and publishes after commit', async function () {
  var sentinel = 'TASK6V21_RED_004_STARTUP_RENEW';
  var x = taoWriterFixture({manualDrain: false, timers: taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }})});
  try {
    task6v21RequireFunction(x.store, 'listExpiredRunningForRecovery', sentinel);
    task6v21RequireFunction(x.store, 'listOwnedRunningForRecovery', sentinel);
    var order = [];
    ['listExpiredRunningForRecovery', 'recoverExpiredRunning', 'renewLease',
      'resumeOwnedRunning', 'assertLeaseLive'].forEach(function (name) {
      var real = x.store[name].bind(x.store);
      x.store[name] = function () {
        order.push(name + ':ready=' + x.writer.ready);
        if (name === 'renewLease') assert.equal(x.writer.ready, false, sentinel + ' renew before ready');
        return real.apply(null, arguments);
      };
    });
    await x.writer.start();
    assert.equal(x.writer.ready, true, sentinel + ' ready after startup commit');
    assert.ok(order.indexOf('renewLease:ready=false') >= 0, sentinel + ' renew called');
    assert.ok(order.some(function (entry) { return entry.startsWith('assertLeaseLive:'); }),
      sentinel + ' final fence');
    assert.equal(x.writer.continuationActive || x.writer.wakeTimerActive || x.writer.pollTimerActive,
      true, sentinel + ' timers publish only after start');
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});

test('Task 6 v21 overlay advance due keeps live order and enqueues continuation at sixty one', async function () {
  var sentinel = 'TASK6V21_RED_005_DUE61_ORDER';
  var T = 1_800_010_061, x = taoDurableOrderFixture(T);
  try {
    x.installWriter({manualDrain: true});
    task6v21RequireFunction(x.writer, 'advanceDueInCurrentUow', sentinel);
    var original = x.kho.q.dqDenHan.all.bind(x.kho.q.dqDenHan);
    var ids = [3, 1, 2].concat(Array.from({length: 58}, function (_, i) { return i + 4; }));
    x.kho.q.dqDenHan.all = function (nowS, limit) {
      assert.equal(limit, 61, sentinel + ' limit plus one');
      return ids.map(function (id) { return {tk: id, keTiep: T}; });
    };
    var processed = [];
    var realAdvance = x.world.advanceAccountNoiBo.bind(x.world);
    x.world.advanceAccountNoiBo = function (mutation, accountId, targetS, options) {
      processed.push(Number(accountId));
      return realAdvance(mutation, accountId, targetS, options);
    };
    await x.writer.start();
    var closureCalls = 0;
    var result = await x.writer.runCommand({
      name: 'due61-live-order',
      run: function () { closureCalls += 1; return 'done'; }
    });
    assert.deepEqual(processed.slice(0, 3), [3, 1, 2], sentinel + ' live dq order');
    assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'}, sentinel + ' public partial');
    assert.equal(closureCalls, 0, sentinel + ' closure skipped');
    assert.equal(x.writer.continuationActive, true, sentinel + ' continuation active');
    x.kho.q.dqDenHan.all = original;
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});

test('Task 6 v21 overlay maintenance cutover validates guards and release precedence', async function () {
  var sentinel = 'TASK6V21_RED_006_CUTOVER_RELEASE';
  var cutover = require('../server/scheduler/cutover.js');
  task6v21RequireFunction(cutover, 'runMaintenanceCutover', sentinel);
  var x = taoWriterFixture();
  try {
    var tokenSeen = null;
    var releaseCount = 0;
    var realRelease = x.store.releaseLease.bind(x.store);
    x.store.releaseLease = function (token) {
      tokenSeen = token;
      releaseCount += 1;
      return realRelease(token);
    };
    var result = await cutover.runMaintenanceCutover({kho: x.kho, clock: x.clock, ownerId: x.ownerId});
    assert.equal(result.status, 'ok', sentinel + ' success');
    assert.ok(tokenSeen && tokenSeen.ownerId === x.ownerId, sentinel + ' same token release');
    assert.equal(releaseCount, 1, sentinel + ' release once');
    x.kho.q.dqThem.run(x.account, '{}', 1, 1, 1, 1, 1, 1, 1, null, 1, 1);
    await assert.rejects(function () {
      return cutover.runMaintenanceCutover({kho: x.kho, clock: x.clock, ownerId: x.ownerId});
    }, /SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED/, sentinel + ' nonempty guard');
  } finally { x.dong(); }
});

test('Task 6 v21 overlay scheduler cutover CLI grammar lifecycle and exact exports', async function () {
  var sentinel = 'TASK6V21_RED_007_CLI';
  var cli = require('./scheduler-cutover.js');
  task6v21RequireFunction(cli, 'runCli', sentinel);
  assert.deepEqual(Object.keys(cli).sort(), ['main', 'parseArgs', 'runCli'].sort(),
    sentinel + ' exact cli exports');
  var priorExitCode = process.exitCode;
  try {
    var invalid = await cli.runCli(['--action', 'cutover', '--db', '/tmp/db.sqlite'], {});
    assert.equal(invalid.exitCode, 1, sentinel + ' strict order');
    assert.equal(invalid.stderr, 'SCHEDULER_CLI_ARGS_INVALID\n', sentinel + ' safe stderr');
    var closeCount = 0;
    var result = await cli.runCli(['--db', '/tmp/task6-v21-cli.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000604'; },
      clock: fakeClock(1_800_010_000_000),
      openKho: function () {
        return {dong: function () { closeCount += 1; throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'}); }};
      }
    });
    assert.equal(result.exitCode, 1, sentinel + ' close-only fails');
    assert.equal(result.stderr, 'BAD_CLOSE\n', sentinel + ' close code');
    assert.equal(closeCount, 1, sentinel + ' close once');
    var out = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var err = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var mainResult = await cli.main(['--db', '/tmp', '--action', 'cutover'], {}, {stdout: out, stderr: err}, {});
    assert.equal(mainResult.exitCode, 1, sentinel + ' main returns');
    assert.equal(process.exitCode, 1, sentinel + ' main sets exitCode');
    assert.equal(err.chunks.join(''), 'SCHEDULER_CLI_ARGS_INVALID\n', sentinel + ' main stderr');
  } finally {
    if (priorExitCode === undefined) delete process.exitCode;
    else process.exitCode = priorExitCode;
  }
});

test('Task 6 v21 overlay exact null partial retains running lock without lifecycle calls', async function () {
  var sentinel = 'TASK6V21_RED_008_EXACT_NULL_PARTIAL';
  var T = 1_800_010_081, x = taoDurableOrderFixture(T);
  try {
    x.addLocalBatch(x.attacker, 49_999);
    x.addFleet(x.attacker, x.targetHome, 'spy');
    x.addLocalTimes(x.unrelatedAccount, [T]);
    x.installWriter({manualDrain: true});
    task6v21RequireFunction(x.writer, 'executeClaimedInCurrentUow', sentinel);
    var forbidden = ['checkpointPartial', 'blockOwnedAccountAdvance', 'insertApplication',
      'finishResolved', 'completeApplied', 'completeAccountAdvanceAndScheduleSuccessor'];
    var calls = {};
    forbidden.forEach(function (name) {
      calls[name] = 0;
      var real = x.store[name].bind(x.store);
      x.store[name] = function () { calls[name] += 1; return real.apply(null, arguments); };
    });
    var afterClaim = null;
    x.writer.callFaultHook = function (stage, claimed) {
      if (stage === 'after-claim' && claimed && claimed.kind === 'ACCOUNT_ADVANCE') {
        afterClaim = task6v21LockProjection(task6v21RawJob(x.kho, claimed.id));
      }
    };
    await x.writer.start();
    var closureCalls = 0;
    var result = await x.writer.runCommand({
      name: 'exact-null-partial',
      accountId: x.unrelatedAccount,
      run: function () { closureCalls += 1; return 'done'; }
    });
    assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'}, sentinel + ' public partial');
    assert.equal(closureCalls, 0, sentinel + ' closure skipped');
    assert.ok(afterClaim, sentinel + ' after claim captured');
    var running = x.kho.db.prepare(
      "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? AND state='RUNNING'"
    ).get(String(x.unrelatedAccount));
    assert.deepEqual(task6v21LockProjection(running), afterClaim, sentinel + ' lock unchanged');
    forbidden.forEach(function (name) {
      assert.equal(calls[name], 0, sentinel + ' zero ' + name);
    });
  } finally { if (x.writer) await x.writer.stop(100).catch(function () {}); x.dong(); }
});
// TASK6_V21_PLAN_OVERLAY_JS_END
```

## V21 RED evidence

Append helpers, parent73, and overlay8 to `tools/test-scheduler.js` under V21 markers before running RED. The RED producer is fail-closed.

```bash
set -euo pipefail
test ! -e /tmp/task6-v21-red-evidence.tap
: > /tmp/task6-v21-red-evidence.tap
run_one_overlay_red() {
  set -euo pipefail
  name="$1"; sentinel="$2"; expected_message="$3"
  pattern="$(node - "$name" <<'NODE'
const s = process.argv[2];
process.stdout.write('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
NODE
)"
  tmp="$(mktemp /tmp/task6-v21-overlay-red.XXXXXX.tap)"
  if node --test --test-isolation=none --test-reporter=tap --test-name-pattern "$pattern" tools/test-scheduler.js > "$tmp" 2>&1; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  grep -F "# Subtest: $name" "$tmp" >/dev/null || { cat "$tmp"; rm -f "$tmp"; exit 1; }
  grep -F "not ok 1 - $name" "$tmp" >/dev/null || { cat "$tmp"; rm -f "$tmp"; exit 1; }
  grep -F "$sentinel $expected_message" "$tmp" >/dev/null || { cat "$tmp"; rm -f "$tmp"; exit 1; }
  grep -F "code: 'ERR_ASSERTION'" "$tmp" >/dev/null || { cat "$tmp"; rm -f "$tmp"; exit 1; }
  if grep -E 'MODULE_NOT_FOUND|ReferenceError|TypeError|SQLITE_|MISSING_PREREQUISITE|is not defined|fixture setup|fixture job must|idempotency_key|TASK6V21_FIXTURE_' "$tmp"; then
    cat "$tmp"; rm -f "$tmp"; exit 1
  fi
  printf '%s\nname=%s\nsentinel=%s\nexpected_message=%s\n' \
    '### TASK6_V21_OVERLAY_RED_CASE_START' "$name" "$sentinel" "$expected_message" \
    >> /tmp/task6-v21-red-evidence.tap
  cat "$tmp" >> /tmp/task6-v21-red-evidence.tap
  printf '%s\n' '### TASK6_V21_OVERLAY_RED_CASE_END' >> /tmp/task6-v21-red-evidence.tap
  rm -f "$tmp"
}
while IFS="$(printf '\t')" read -r name sentinel expected_message; do
  run_one_overlay_red "$name" "$sentinel" "$expected_message"
done < /tmp/task6-v21-overlay8-red-contracts.tsv
grep -c '^### TASK6_V21_OVERLAY_RED_CASE_START$' /tmp/task6-v21-red-evidence.tap | grep -E '^8$'
grep -c '^### TASK6_V21_OVERLAY_RED_CASE_END$' /tmp/task6-v21-red-evidence.tap | grep -E '^8$'
sha256sum /tmp/task6-v21-red-evidence.tap > /tmp/task6-v21-red-evidence.tap.sha256
```

## Corrected report producer and Stage-A

This replaces V20's `touch "$report"`-only draft. The producer writes every field Stage-A greps, after the artifacts exist. It preserves any `reviewer\t...` lines already appended, so Stage-B can rerun Stage-A without erasing approvals. It writes no report hash.

Create six-file metadata:

```bash
cat > /tmp/task6-v21-six-meta.sh <<'SH'
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
sha256sum /tmp/task6-v21-six-meta.sh > /tmp/task6-v21-six-meta.sh.sha256
. /tmp/task6-v21-six-meta.sh
make_six_meta > /tmp/task6-v21-six-meta.sealed.tsv
sha256sum /tmp/task6-v21-six-meta.sealed.tsv > /tmp/task6-v21-six-meta.sealed.tsv.sha256
```

Create the report producer:

```bash
cat > /tmp/task6-v21-write-report-base.sh <<'SH'
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
mkdir -p docs/superpowers/reports
chmod 0755 docs/superpowers/reports
touch "$report"
chmod 0644 "$report"
reviewers="$(mktemp /tmp/task6-v21-reviewers.XXXXXX)"
awk 'BEGIN{FS="\t"} $1=="reviewer"{print}' "$report" > "$reviewers" || true
tmp="$(mktemp /tmp/task6-v21-report.XXXXXX)"
{
  echo 'task=durable-scheduler-task6-writer-lifecycle'
  echo 'plan_version=V21'
  echo "plan_v21_sha=$(cut -d' ' -f1 /tmp/task6-v21-approved-plan.sha256)"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v20_contract_sha=1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305'
  echo 'counts=parent runtime=73 + overlay=8 => N=81'
  echo 'stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped'
  echo "pre_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v21-pre-inventory.tsv.sha256)"
  echo "post_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v21-post-inventory.tsv.sha256)"
  echo "helper_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-helper-slice.js.sha256)"
  echo "helper_free_identifiers_sha=$(cut -d' ' -f1 /tmp/task6-v21-helper-free-identifiers.txt.sha256)"
  echo "prefix_len=$(cut -f1 /tmp/task6-v21-prefix.tsv)"
  echo "prefix_sha=$(cut -f2 /tmp/task6-v21-prefix.tsv)"
  echo "baseline_names_sha=$(cut -d' ' -f1 /tmp/task6-v21-baseline-names.txt.sha256)"
  echo "parent73_names_sha=$(cut -d' ' -f1 /tmp/task6-v21-parent73-names.txt.sha256)"
  echo "overlay8_names_sha=$(cut -d' ' -f1 /tmp/task6-v21-overlay8-names.txt.sha256)"
  echo "overlay8_red_contracts_sha=$(cut -d' ' -f1 /tmp/task6-v21-overlay8-red-contracts.tsv.sha256)"
  echo "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-parent-slice.js.sha256)"
  echo "overlay_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-overlay.js.sha256)"
  echo "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v21-red-evidence.tap.sha256)"
  echo "stage_a_script_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a.sh.sha256)"
  echo "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a.normalized.tap.sha256)"
  echo "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a-throw.normalized.tap.sha256)"
  echo "review_bundle_sha=$(cut -d' ' -f1 /tmp/task6-v21-review-bundle.tsv.sha256)"
  echo 'node_check_status=PASS'
  echo 'whitespace_status=PASS'
  echo 'inventory_status=PASS'
  echo 'stage_a_status=PASS'
  while IFS= read -r row; do echo "six_meta=$row"; done < /tmp/task6-v21-six-meta.sealed.tsv
  cat "$reviewers"
} > "$tmp"
mv "$tmp" "$report"
rm -f "$reviewers"
SH
chmod +x /tmp/task6-v21-write-report-base.sh
sha256sum /tmp/task6-v21-write-report-base.sh > /tmp/task6-v21-write-report-base.sh.sha256
```

Create Stage-A script. It runs fresh tests, computes post inventory, then writes the report base before grep validation.

```bash
cat > /tmp/task6-v21-stage-a.sh <<'SH'
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
sha256sum -c /tmp/task6-v21-stage-a.sh.sha256
sha256sum -c /tmp/task6-v21-approved-plan.sha256
sha256sum -c /tmp/task6-v21-authorities.sha256
sha256sum -c /tmp/task6-v21-inventory.sh.sha256
sha256sum -c /tmp/task6-v21-pre-inventory.tsv.sha256
sha256sum -c /tmp/task6-v21-tap-normalize.sh.sha256
sha256sum -c /tmp/task6-v21-baseline-names.txt.sha256
sha256sum -c /tmp/task6-v21-prefix.tsv.sha256
sha256sum -c /tmp/task6-v21-expected-helper-slice.js.sha256
sha256sum -c /tmp/task6-v21-helper-parts.sha256
sha256sum -c /tmp/task6-v21-helper-free-identifiers.txt.sha256
sha256sum -c /tmp/task6-v21-parent73-names.txt.sha256
sha256sum -c /tmp/task6-v21-parent-blocks.sha256
sha256sum -c /tmp/task6-v21-expected-parent-slice.js.sha256
sha256sum -c /tmp/task6-v21-expected-overlay.js.sha256
sha256sum -c /tmp/task6-v21-overlay8-red-contracts.tsv.sha256
sha256sum -c /tmp/task6-v21-overlay8-names.txt.sha256
sha256sum -c /tmp/task6-v21-red-evidence.tap.sha256
sha256sum -c /tmp/task6-v21-six-meta.sh.sha256
sha256sum -c /tmp/task6-v21-six-meta.sealed.tsv.sha256
sha256sum -c /tmp/task6-v21-write-report-base.sh.sha256

for part in helper parent overlay; do
  case "$part" in
    helper) start='// TASK6_V21_HELPERS_START\n'; end='// TASK6_V21_HELPERS_END\n'; expected=/tmp/task6-v21-expected-helper-slice.js; current=/tmp/task6-v21-current-helper-slice.js ;;
    parent) start='// TASK6_V21_PARENT_TESTS_START\n'; end='// TASK6_V21_PARENT_TESTS_END\n'; expected=/tmp/task6-v21-expected-parent-slice.js; current=/tmp/task6-v21-current-parent-slice.js ;;
    overlay) start='// TASK6_V21_OVERLAY_TESTS_START\n'; end='// TASK6_V21_OVERLAY_TESTS_END\n'; expected=/tmp/task6-v21-expected-overlay.js; current=/tmp/task6-v21-current-overlay.js ;;
  esac
  node - "$start" "$end" > "$current" <<'NODE'
const fs = require('fs');
const text = fs.readFileSync('tools/test-scheduler.js', 'utf8');
const start = process.argv[2], end = process.argv[3];
const a = text.indexOf(start), b = text.indexOf(end);
if (a < 0 || b < 0 || b <= a) throw new Error('TASK6_V21_MARKERS_INVALID');
process.stdout.write(text.slice(a + start.length, b));
NODE
  cmp -s "$expected" "$current"
done
if rg -n '^[[:space:]]*test[[:space:]]*\\(' /tmp/task6-v21-current-helper-slice.js; then exit 1; fi

node - <<'NODE'
const fs = require('fs'), crypto = require('crypto');
const [lenText, sha] = fs.readFileSync('/tmp/task6-v21-prefix.tsv', 'utf8').trim().split('\t');
const data = fs.readFileSync('tools/test-scheduler.js').subarray(0, Number(lenText));
const actual = crypto.createHash('sha256').update(data).digest('hex');
if (actual !== sha) throw new Error('TASK6_V21_PREFIX_CHANGED');
NODE

. /tmp/task6-v21-six-meta.sh
make_six_meta > /tmp/task6-v21-six-meta.stage-a-before.tsv
diff -u /tmp/task6-v21-six-meta.sealed.tsv /tmp/task6-v21-six-meta.stage-a-before.tsv
node --check server/scheduler/store.js
node --check server/scheduler/writer.js
node --check server/scheduler/index.js
node --check server/scheduler/cutover.js
node --check tools/scheduler-cutover.js
node --check tools/test-scheduler.js

node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v21-stage-a.tap
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js > /tmp/task6-v21-stage-a-throw.tap
for f in /tmp/task6-v21-stage-a.tap /tmp/task6-v21-stage-a-throw.tap; do
  grep -E '^# tests 244$' "$f"
  grep -E '^# pass 243$' "$f"
  grep -E '^# fail 0$' "$f"
  grep -E '^# skipped 1$' "$f"
  if rg -n 'ReferenceError|MISSING_PREREQUISITE|is not defined' "$f"; then exit 1; fi
done

. /tmp/task6-v21-tap-normalize.sh
normalize_tap_for_hash /tmp/task6-v21-stage-a.tap > /tmp/task6-v21-stage-a.normalized.tap
normalize_tap_for_hash /tmp/task6-v21-stage-a-throw.tap > /tmp/task6-v21-stage-a-throw.normalized.tap
sha256sum /tmp/task6-v21-stage-a.normalized.tap > /tmp/task6-v21-stage-a.normalized.tap.sha256
sha256sum /tmp/task6-v21-stage-a-throw.normalized.tap > /tmp/task6-v21-stage-a-throw.normalized.tap.sha256

node - <<'NODE' /tmp/task6-v21-stage-a.tap
const fs = require('fs');
const tap = fs.readFileSync(process.argv[2], 'utf8');
const names = Array.from(tap.matchAll(/^# Subtest: (.+)$/gm)).map((m) => m[1]);
const baseline = fs.readFileSync('/tmp/task6-v21-baseline-names.txt', 'utf8').trim().split('\n');
const parent = fs.readFileSync('/tmp/task6-v21-parent73-names.txt', 'utf8').trim().split('\n');
const overlay = fs.readFileSync('/tmp/task6-v21-overlay8-names.txt', 'utf8').trim().split('\n');
if (names.length !== 244) throw new Error('TASK6_V21_NAME_COUNT_' + names.length);
const expected = [...baseline, ...parent, ...overlay];
if (names.join('\n') !== expected.join('\n')) throw new Error('TASK6_V21_NAME_ORDER_CHANGED');
NODE

make_six_meta > /tmp/task6-v21-six-meta.stage-a-after.tsv
diff -u /tmp/task6-v21-six-meta.stage-a-before.tsv /tmp/task6-v21-six-meta.stage-a-after.tsv

mkdir -p docs/superpowers/reports
chmod 0755 docs/superpowers/reports
touch "$report"
chmod 0644 "$report"
test -d docs/superpowers/reports
test ! -L docs/superpowers/reports
mode="$(python3 - <<'PY'
import os, stat
print(format(stat.S_IMODE(os.lstat('docs/superpowers/reports').st_mode), '04o'))
PY
)"
test "$mode" = 0755

. /tmp/task6-v21-inventory.sh
repo_inventory > /tmp/task6-v21-post-inventory.tsv
python3 - <<'PY'
from pathlib import Path
pre = {line.split('\t',1)[0]: line for line in Path('/tmp/task6-v21-pre-inventory.tsv').read_text().splitlines()}
post = {line.split('\t',1)[0]: line for line in Path('/tmp/task6-v21-post-inventory.tsv').read_text().splitlines()}
allowed = {
 'server/scheduler/store.js','server/scheduler/writer.js','server/scheduler/index.js',
 'server/scheduler/cutover.js','tools/scheduler-cutover.js','tools/test-scheduler.js'
}
diffs = []
for key in sorted(set(pre) | set(post)):
    if pre.get(key) != post.get(key) and key not in allowed:
        diffs.append(key)
if diffs:
    raise SystemExit('TASK6_V21_SCOPE_DIFF ' + ','.join(diffs))
PY
sha256sum /tmp/task6-v21-post-inventory.tsv > /tmp/task6-v21-post-inventory.tsv.sha256

{
  echo "plan_v21_sha=$(cut -d' ' -f1 /tmp/task6-v21-approved-plan.sha256)"
  echo 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3'
  echo 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf'
  echo 'v20_contract_sha=1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305'
  echo "helper_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-helper-slice.js.sha256)"
  echo "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-parent-slice.js.sha256)"
  echo "overlay_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-overlay.js.sha256)"
  echo "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v21-red-evidence.tap.sha256)"
  echo "six_meta_sha=$(cut -d' ' -f1 /tmp/task6-v21-six-meta.sealed.tsv.sha256)"
  echo "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a.normalized.tap.sha256)"
  echo "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a-throw.normalized.tap.sha256)"
  echo 'stage_a_counts=244/243/0/1'
  while IFS= read -r row; do echo "six_meta=$row"; done < /tmp/task6-v21-six-meta.sealed.tsv
} > /tmp/task6-v21-review-bundle.tsv
sha256sum /tmp/task6-v21-review-bundle.tsv > /tmp/task6-v21-review-bundle.tsv.sha256
sha256sum -c /tmp/task6-v21-review-bundle.tsv.sha256

/tmp/task6-v21-write-report-base.sh
test -f "$report"
test ! -L "$report"
file_mode="$(python3 - <<'PY'
import os, stat
print(format(stat.S_IMODE(os.lstat('docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md').st_mode), '04o'))
PY
)"
test "$file_mode" = 0644

if rg -n '[[:blank:]]+$' server/scheduler/store.js server/scheduler/writer.js server/scheduler/index.js server/scheduler/cutover.js tools/scheduler-cutover.js tools/test-scheduler.js "$report"; then exit 1; fi

grep -F "plan_v21_sha=$(cut -d' ' -f1 /tmp/task6-v21-approved-plan.sha256)" "$report"
grep -F 'parent_task6_sha=cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3' "$report"
grep -F 'task5_remediation_sha=c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf' "$report"
grep -F 'v20_contract_sha=1535788e4dc1be2e2f56e613debd7c523a763059c514de0f2827c6693de1d305' "$report"
grep -F "pre_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v21-pre-inventory.tsv.sha256)" "$report"
grep -F "post_inventory_sha=$(cut -d' ' -f1 /tmp/task6-v21-post-inventory.tsv.sha256)" "$report"
grep -F "helper_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-helper-slice.js.sha256)" "$report"
grep -F "helper_free_identifiers_sha=$(cut -d' ' -f1 /tmp/task6-v21-helper-free-identifiers.txt.sha256)" "$report"
grep -F "baseline_names_sha=$(cut -d' ' -f1 /tmp/task6-v21-baseline-names.txt.sha256)" "$report"
grep -F "parent73_names_sha=$(cut -d' ' -f1 /tmp/task6-v21-parent73-names.txt.sha256)" "$report"
grep -F "overlay8_names_sha=$(cut -d' ' -f1 /tmp/task6-v21-overlay8-names.txt.sha256)" "$report"
grep -F "overlay8_red_contracts_sha=$(cut -d' ' -f1 /tmp/task6-v21-overlay8-red-contracts.tsv.sha256)" "$report"
grep -F "parent_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-parent-slice.js.sha256)" "$report"
grep -F "overlay_slice_sha=$(cut -d' ' -f1 /tmp/task6-v21-expected-overlay.js.sha256)" "$report"
grep -F "overlay_red_evidence_sha=$(cut -d' ' -f1 /tmp/task6-v21-red-evidence.tap.sha256)" "$report"
grep -F "stage_a_script_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a.sh.sha256)" "$report"
grep -F "stage_a_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a.normalized.tap.sha256)" "$report"
grep -F "stage_a_throw_normalized_tap_sha=$(cut -d' ' -f1 /tmp/task6-v21-stage-a-throw.normalized.tap.sha256)" "$report"
grep -F "review_bundle_sha=$(cut -d' ' -f1 /tmp/task6-v21-review-bundle.tsv.sha256)" "$report"
grep -F 'stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped' "$report"
grep -F 'node_check_status=PASS' "$report"
grep -F 'whitespace_status=PASS' "$report"
grep -F 'inventory_status=PASS' "$report"
grep -F 'stage_a_status=PASS' "$report"
while IFS= read -r row; do grep -F "six_meta=$row" "$report"; done < /tmp/task6-v21-six-meta.sealed.tsv
SH
chmod +x /tmp/task6-v21-stage-a.sh
sha256sum /tmp/task6-v21-stage-a.sh > /tmp/task6-v21-stage-a.sh.sha256
```

## Stage-A, review, Stage-B

Run Stage-A:

```bash
/tmp/task6-v21-stage-a.sh
```

Launch two distinct fresh implementation reviewers using model `gpt-5.6-sol` and effort `high`. Review payload includes `/tmp/task6-v21-review-bundle.tsv` and its SHA, exact six rows from `/tmp/task6-v21-six-meta.sealed.tsv`, V21 approved plan hash, V20 contract hash, parent/Task5 hashes, helper/parent/overlay slice hashes, overlay RED evidence hash, Stage-A TAP counts, report producer hash, and normalized TAP hashes.

Each reviewer must return a regular non-symlink artifact file with this exact key set and with values matching `/tmp/task6-v21-review-bundle.tsv`:

```text
identity=$TASK6_V21_REVIEWER_ID
model=gpt-5.6-sol
effort=high
outcome=PASS
review_bundle_sha=$TASK6_V21_REVIEW_BUNDLE_SHA
six_meta_sha=$TASK6_V21_SIX_META_SHA
stage_a_normalized_tap_sha=$TASK6_V21_STAGE_A_NORMALIZED_TAP_SHA
stage_a_throw_normalized_tap_sha=$TASK6_V21_STAGE_A_THROW_NORMALIZED_TAP_SHA
overlay_red_evidence_sha=$TASK6_V21_RED_EVIDENCE_SHA
```

After both genuine PASS outcomes, append exactly two lines to the report by running this command with real artifact paths and identities. This binds each textual PASS line to the exact digest bundle and artifact hash.

```bash
set -euo pipefail
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
for var in TASK6_V21_REVIEWER_1_ID TASK6_V21_REVIEWER_2_ID TASK6_V21_REVIEWER_1_ARTIFACT TASK6_V21_REVIEWER_2_ARTIFACT; do
  test -n "${!var}"
done
test "$TASK6_V21_REVIEWER_1_ID" != "$TASK6_V21_REVIEWER_2_ID"
bundle_sha="$(cut -d' ' -f1 /tmp/task6-v21-review-bundle.tsv.sha256)"
six_meta_sha="$(cut -d' ' -f1 /tmp/task6-v21-six-meta.sealed.tsv.sha256)"
normal_sha="$(cut -d' ' -f1 /tmp/task6-v21-stage-a.normalized.tap.sha256)"
throw_sha="$(cut -d' ' -f1 /tmp/task6-v21-stage-a-throw.normalized.tap.sha256)"
red_sha="$(cut -d' ' -f1 /tmp/task6-v21-red-evidence.tap.sha256)"
append_review_line() {
  identity="$1"; artifact="$2"
  test -f "$artifact"; test ! -L "$artifact"
  grep -Fx "identity=$identity" "$artifact"
  grep -Fx 'model=gpt-5.6-sol' "$artifact"
  grep -Fx 'effort=high' "$artifact"
  grep -Fx 'outcome=PASS' "$artifact"
  grep -Fx "review_bundle_sha=$bundle_sha" "$artifact"
  grep -Fx "six_meta_sha=$six_meta_sha" "$artifact"
  grep -Fx "stage_a_normalized_tap_sha=$normal_sha" "$artifact"
  grep -Fx "stage_a_throw_normalized_tap_sha=$throw_sha" "$artifact"
  grep -Fx "overlay_red_evidence_sha=$red_sha" "$artifact"
  artifact_sha="$(sha256sum "$artifact" | cut -d' ' -f1)"
  printf 'reviewer\tidentity=%s\tmodel=gpt-5.6-sol\teffort=high\toutcome=PASS\treview_bundle_sha=%s\tartifact_sha=%s\n' \
    "$identity" "$bundle_sha" "$artifact_sha" >> "$report"
}
append_review_line "$TASK6_V21_REVIEWER_1_ID" "$TASK6_V21_REVIEWER_1_ARTIFACT"
append_review_line "$TASK6_V21_REVIEWER_2_ID" "$TASK6_V21_REVIEWER_2_ARTIFACT"
```

Then run Stage-B. Stage-A preserves reviewer lines when regenerating the report base.

```bash
/tmp/task6-v21-stage-a.sh
report='docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md'
python3 - <<'PY' "$report"
import sys
text = open(sys.argv[1], encoding='utf-8').read().splitlines()
rows = [line for line in text if line.startswith('reviewer\t')]
if len(rows) != 2:
    raise SystemExit('TASK6_V21_REVIEWER_COUNT')
seen = set()
bundle = open('/tmp/task6-v21-review-bundle.tsv.sha256', encoding='utf-8').read().split()[0]
for row in rows:
    parts = dict(field.split('=', 1) for field in row.split('\t')[1:])
    ident = parts.get('identity')
    if not ident or ident in seen:
        raise SystemExit('TASK6_V21_REVIEWER_IDENTITY')
    seen.add(ident)
    if parts.get('model') != 'gpt-5.6-sol' or parts.get('effort') != 'high' or parts.get('outcome') != 'PASS':
        raise SystemExit('TASK6_V21_REVIEWER_OUTCOME')
    if parts.get('review_bundle_sha') != bundle:
        raise SystemExit('TASK6_V21_REVIEWER_BUNDLE')
    artifact_sha = parts.get('artifact_sha')
    if not artifact_sha or len(artifact_sha) != 64 or any(c not in '0123456789abcdef' for c in artifact_sha):
        raise SystemExit('TASK6_V21_REVIEWER_ARTIFACT_SHA')
PY
```

Actual collaboration tool outcomes are required separately; report text alone is not proof.

## Self-audit checklist

- [ ] V21 count remains parent runtime `73` plus overlay `8`, final `244/243/0/1`.
- [ ] V20 implementation contracts are retained via pinned V20 SHA, while V21 overlay8 replaces the fail-open V20 overlay body.
- [ ] V21 helper slice does not copy broken parent `taoPvpFixtureAt` lines `7703-7744`; it uses the fixed V21 fixture and asserts `TASK6V21_FIXTURE_PVP_JOB_CREATED` before overlay target assertions.
- [ ] V21 helper/parent/overlay artifacts are produced from fresh `/tmp/task6-v21-*` names.
- [ ] Fixture smoke block has no stray command after `fi`.
- [ ] Report draft is produced by `/tmp/task6-v21-write-report-base.sh` before Stage-A grep validation.
- [ ] Report producer writes every field Stage-A greps and preserves reviewer lines across Stage-B reruns.
- [ ] Report and reports directory are excluded from normalized content inventory/diff and separately validated for type/mode/content.
- [ ] No report self-hash exists.
- [ ] Stage-A creates/checks all artifacts from fresh `/tmp`, runs fresh normal and throw-deprecation TAP, checks before/after six-meta, writes report, then validates report fields.
- [ ] Stage-B appends approvals after Stage-A, binds each approval to `/tmp/task6-v21-review-bundle.tsv` and reviewer artifact SHA, and reruns Stage-A without erasing approvals.
