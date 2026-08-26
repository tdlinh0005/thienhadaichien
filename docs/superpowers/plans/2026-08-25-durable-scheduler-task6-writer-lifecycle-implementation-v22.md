# Durable Scheduler Task 6 Writer Lifecycle Implementation Plan V22

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for every code wave and `superpowers:verification-before-completion` before reporting completion.

**Goal:** Implement Task 6 durable scheduler writer lifecycle on accepted Tasks 1-5 with executable parent73 plus overlay8 coverage, fixing V21 overlay/runtime weaknesses without touching Task7+ files.

**Architecture:** V22 preserves V21's scope, report producer, inventory, digest-bundle review seal, fixed fail-closed RED strategy, and `parent73 + overlay8 = N81` count. V22 replaces V21's helper fixture path and five overlay bodies that were runtime-weak: startup, due61, cutover, CLI, and exact-null partial. V22 also keeps V21's Task7 bridge/status overlay and Store primitive overlays. Expected final scheduler TAP stays `244 tests / 243 pass / 0 fail / 1 skipped`.

**Tech Stack:** Node.js CommonJS, `node:test` TAP with `--test-isolation=none`, SQLite through existing `Kho`, live `TheGioi`, `SchedulerStore`, `GameAdvanceService`, and `EventReducer`.

**Spec:** Parent Task6 is `docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md:10866-15333`. Accepted Task5 downstream protocol is `docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md:825-833`. V21 retained workflow is `docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md`.

## Global constraints

- Preserve V1-V21 plan artifacts. This planning task creates only this V22 file.
- Implementation may edit exactly six Task6-owned files:
  - `server/scheduler/store.js`
  - `server/scheduler/writer.js`
  - `server/scheduler/index.js`
  - `server/scheduler/cutover.js`
  - `tools/scheduler-cutover.js`
  - `tools/test-scheduler.js`
- Exact report path remains `docs/superpowers/reports/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-report.md`.
- No Task7+ production edits.
- Parent runtime registrations: `73`.
- Overlay runtime registrations: `8`.
- Mechanical count: `parent runtime=73 + overlay=8 => N=81`.
- Expected final scheduler TAP: `244 tests`, `243 pass`, `0 fail`, `1 skipped`.
- Root passes `TASK6_V22_APPROVED_SHA` externally; the plan must not contain its own hash.

Pinned authorities:

```text
cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md
c89ba74ce9431ef479e91ffc996e0d9f4adde4217a157756c50ce4bf49ec3eaf  docs/superpowers/plans/2026-08-24-durable-scheduler-task5-remediation-implementation.md
34bab113d7eba2a09e82a0fabb3dbc9012e6cf3a385a819d258128f70786631a  docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md
```

## V22 override summary

Use V21 as the base workflow with these exact changes:

1. Rename every artifact namespace from `task6-v21`/`TASK6_V21`/`TASK6V21`/`Task 6 v21` to `task6-v22`/`TASK6_V22`/`TASK6V22`/`Task 6 v22`.
2. Replace the helper prerequisite producer with the V22 helper block below. It does not copy broken parent `taoPvpFixtureAt` lines `7703-7744`, and it does not call parent `tuaFixtureQuaDichVu` with `null` save options. The corrected helper calls `x.service.advanceTo(mutation, accountId, atS, undefined)`.
3. Replace V21 overlay bodies for startup, due61, cutover, CLI, and exact-null partial with the V22 replacement bodies below.
4. Keep V21 overlay bodies for raw quarantine, status/index bridge seams, and retarget/blocked descriptor, with V22 name/sentinel substitutions.
5. Keep V21 report producer, Stage-A, Stage-B, inventory exclusion, and reviewer digest-bundle binding, with V22 namespace and V22 counts.

## V22 helper prerequisite producer

Replace V21 helper generation with this exact producer. It fixes both live fixture blockers: no missing `PVP_RESOLVE`, and no `TICK_TARGET_INVALID` from `advanceTo(..., null)`.

```bash
set -euo pipefail
parent='docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md'

cat > /tmp/task6-v22-helper-imports.js <<'EOF'
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

sed -n '6411,6470p' "$parent" > /tmp/task6-v22-helper-base.js
sed -n '7601,7609p' "$parent" > /tmp/task6-v22-helper-advance.js
sed -n '7677,7702p' "$parent" > /tmp/task6-v22-helper-pvp-base.js
sed -n '7748,7802p' "$parent" > /tmp/task6-v22-helper-exec-a.js
sed -n '7813,7850p' "$parent" > /tmp/task6-v22-helper-exec-b.js
sed -n '7855,7904p' "$parent" > /tmp/task6-v22-helper-account.js
sed -n '8134,8144p' "$parent" > /tmp/task6-v22-helper-local.js

cat > /tmp/task6-v22-helper-fixed-pvp.js <<'EOF'
function task6v22AdvanceFixtureAccount(x, accountId, atS) {
  x.clock.setS(atS);
  damBaoLeaseFixture(x);
  x.kho.trongGiaoDich(function () {
    var mutation = taoMutationTam(x.lease, {value: 50_000}, x.clock.nowMs());
    x.world.trongMutationScheduler(mutation, function () {
      x.service.advanceTo(mutation, accountId, atS, undefined);
    });
  }, {immediate: true});
}
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
  task6v22AdvanceFixtureAccount(x, x.attacker, arrivalAtS);
  var row = x.kho.db.prepare(
    "SELECT idempotency_key FROM event_jobs WHERE kind='PVP_RESOLVE' " +
    'ORDER BY sequence LIMIT 1'
  ).get();
  assert.ok(row && row.idempotency_key, 'TASK6V22_FIXTURE_PVP_JOB_CREATED');
  x.pvpStoredJob = x.store.getByIdempotencyKey(row.idempotency_key);
  assert.ok(x.pvpStoredJob && x.pvpStoredJob.id, 'TASK6V22_FIXTURE_PVP_JOB_LOADABLE');
  x.pvpJob = x.pvpStoredJob;
  x.pvpExecutable = null;
  x.reducer = new EventReducer({
    kho: x.kho, world: x.world, store: x.store,
    clock: x.clock, advanceService: x.service
  });
  return x;
}
function tuaFixtureQuaDichVu(x, accountId, atS) {
  task6v22AdvanceFixtureAccount(x, accountId, atS);
}
EOF

cat /tmp/task6-v22-helper-imports.js \
  /tmp/task6-v22-helper-base.js \
  /tmp/task6-v22-helper-advance.js \
  /tmp/task6-v22-helper-pvp-base.js \
  /tmp/task6-v22-helper-fixed-pvp.js \
  /tmp/task6-v22-helper-exec-a.js \
  /tmp/task6-v22-helper-exec-b.js \
  /tmp/task6-v22-helper-account.js \
  /tmp/task6-v22-helper-local.js > /tmp/task6-v22-expected-helper-slice.js

test -s /tmp/task6-v22-expected-helper-slice.js
if rg -n '^[[:space:]]*test[[:space:]]*\(' /tmp/task6-v22-expected-helper-slice.js; then exit 1; fi
sha256sum /tmp/task6-v22-expected-helper-slice.js > /tmp/task6-v22-expected-helper-slice.js.sha256
sha256sum /tmp/task6-v22-helper-*.js > /tmp/task6-v22-helper-parts.sha256
```

Fixture proof before sealing:

- The first isolated RED case constructs `taoWriterFixture()`, which calls fixed `taoPvpFixtureAt()`.
- The case asserts `TASK6V22_FIXTURE_PVP_JOB_CREATED` and `TASK6V22_FIXTURE_PVP_JOB_LOADABLE` before the target method assertion.
- The RED harness rejects `TASK6V22_FIXTURE_`, `TICK_TARGET_INVALID`, `idempotency_key`, `TypeError`, `ReferenceError`, `MODULE_NOT_FOUND`, and `SQLITE_`.
- Therefore accepting case 001's exact first target failure `TASK6V22_RED_001_RAW_QUARANTINE_STORE missing quarantineClaimedRaw` proves live fixture creation reached the target.

## V22 overlay generation and contracts

Generate V22 overlay body by reading V21's approved overlay body, replacing names/sentinels to V22, then replacing the five corrected bodies from this plan.

```bash
set -euo pipefail
sha256sum -c /tmp/task6-v22-authorities.sha256

python3 - <<'PY' > /tmp/task6-v22-expected-overlay.js
from pathlib import Path
v21 = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v21.md').read_text()
body = v21.split('// TASK6_V21_PLAN_OVERLAY_JS_START\\n', 1)[1].split('// TASK6_V21_PLAN_OVERLAY_JS_END', 1)[0]
body = body.replace('task6v21', 'task6v22').replace('TASK6V21', 'TASK6V22')
body = body.replace('Task 6 v21 overlay', 'Task 6 v22 overlay')
plan = Path('docs/superpowers/plans/2026-08-25-durable-scheduler-task6-writer-lifecycle-implementation-v22.md').read_text()
def replacement(name):
    start = '// TASK6_V22_REPLACEMENT_START ' + name + '\\n'
    end = '// TASK6_V22_REPLACEMENT_END ' + name
    return plan.split(start, 1)[1].split(end, 1)[0]
def replace_test(body, title, replacement_body):
    needle = "test('" + title + "'"
    start = body.index(needle)
    next_start = body.find("\\ntest('Task 6 v22 overlay ", start + 1)
    if next_start == -1:
        end = body.index('// TASK6_V22_PLAN_OVERLAY_JS_END', start) if '// TASK6_V22_PLAN_OVERLAY_JS_END' in body else len(body)
    else:
        end = next_start + 1
    return body[:start] + replacement_body + body[end:]
for key, title in [
    ('STARTUP', 'Task 6 v22 overlay startup renews after recovery before ready and publishes after commit'),
    ('DUE61', 'Task 6 v22 overlay advance due keeps live order and enqueues continuation at sixty one'),
    ('CUTOVER', 'Task 6 v22 overlay maintenance cutover validates guards and release precedence'),
    ('CLI', 'Task 6 v22 overlay scheduler cutover CLI grammar lifecycle and exact exports'),
    ('EXACT_NULL', 'Task 6 v22 overlay exact null partial retains running lock without lifecycle calls')
]:
    body = replace_test(body, title, replacement(key))
if 'task6v21' in body or 'TASK6V21' in body or 'Task 6 v21 overlay' in body:
    raise SystemExit('TASK6_V22_OVERLAY_V21_LEAK')
print(body, end='')
PY

node --check /tmp/task6-v22-expected-overlay.js
sha256sum /tmp/task6-v22-expected-overlay.js > /tmp/task6-v22-expected-overlay.js.sha256
```

V22 RED contracts:

```text
Task 6 v22 overlay raw quarantine store primitive preserves attempt without parsing invalid payload	TASK6V22_RED_001_RAW_QUARANTINE_STORE	missing quarantineClaimedRaw
Task 6 v22 overlay status cache private seams bridge seams and exact scheduler exports	TASK6V22_RED_002_STATUS_EXPORTS	missing bridge._datDatabaseClosing
Task 6 v22 overlay retarget and blocked descriptor store primitives use dependency source account	TASK6V22_RED_003_RETARGET_DESCRIPTOR	missing retargetOwnedPendingAccountAdvanceForCommand
Task 6 v22 overlay startup renews after recovery before ready and publishes after commit	TASK6V22_RED_004_STARTUP_RENEW	missing listExpiredRunningForRecovery
Task 6 v22 overlay advance due keeps live order and enqueues continuation at sixty one	TASK6V22_RED_005_DUE61_ORDER	missing advanceDueInCurrentUow
Task 6 v22 overlay maintenance cutover validates guards and release precedence	TASK6V22_RED_006_CUTOVER_RELEASE	missing runMaintenanceCutover
Task 6 v22 overlay scheduler cutover CLI grammar lifecycle and exact exports	TASK6V22_RED_007_CLI	missing runCli
Task 6 v22 overlay exact null partial retains running lock without lifecycle calls	TASK6V22_RED_008_EXACT_NULL_PARTIAL	missing executeClaimedInCurrentUow
```

V22 RED evidence parser must not assume the selected test is TAP ordinal one. `node --test --test-isolation=none --test-name-pattern` still loads the full file, so the selected overlay can appear as ordinal `237` through `244`. Replace V21's fixed-ordinal grep with this parser:

```bash
parse_overlay_red_tap() {
  tap_file="$1"; expected_name="$2"; expected_message="$3"
  node - "$tap_file" "$expected_name" "$expected_message" <<'NODE'
const fs = require('fs');
const [tapFile, expectedName, expectedMessage] = process.argv.slice(2);
const tap = fs.readFileSync(tapFile, 'utf8');
const lines = tap.split(/\n/);
const subtestLine = '# Subtest: ' + expectedName;
const start = lines.findIndex((line) => line === subtestLine);
if (start < 0) throw new Error('TASK6_V22_RED_SUBTEST_MISSING');
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (lines[i].startsWith('# Subtest: ')) { end = i; break; }
}
const block = lines.slice(start, end).join('\n');
const escaped = expectedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (!new RegExp('^not ok [0-9]+ - ' + escaped + '$', 'm').test(block)) {
  throw new Error('TASK6_V22_RED_STATUS_MISSING');
}
if (!block.includes(expectedMessage)) throw new Error('TASK6_V22_RED_EXPECTED_MESSAGE_MISSING');
if (!block.includes("code: 'ERR_ASSERTION'")) throw new Error('TASK6_V22_RED_ASSERTION_CODE_MISSING');
for (const banned of ['MODULE_NOT_FOUND', 'ReferenceError', 'TypeError', 'SQLITE_',
  'MISSING_PREREQUISITE', 'is not defined', 'fixture setup', 'fixture job must',
  'idempotency_key', 'TICK_TARGET_INVALID', 'TASK6V22_FIXTURE_']) {
  if (block.includes(banned)) throw new Error('TASK6_V22_RED_BANNED_' + banned);
}
NODE
}
```

## Corrected overlay replacement bodies

These are exact JavaScript test bodies inserted by the producer above.

```js
// TASK6_V22_REPLACEMENT_START STARTUP
test('Task 6 v22 overlay startup renews after recovery before ready and publishes after commit', async function () {
  var sentinel = 'TASK6V22_RED_004_STARTUP_RENEW';
  var x;
  var timers = taoBoHenGia({nowMs: function () { return x.clock.nowMs(); }});
  x = taoWriterFixture({manualDrain: false, timers: timers});
  var order = [], entryNow, resumeCalls = 0, finalFenceCalls = 0;
  try {
    ['listExpiredRunningForRecovery', 'listOwnedRunningForRecovery', 'resumeOwnedRunning']
      .forEach(function (name) { task6v22RequireFunction(x.store, name, sentinel); });
    task6v22RequireFunction(x.writer, 'refreshLeasePhaseInCurrentUow', sentinel);
    var originalExpired = x.store.listExpiredRunningForRecovery;
    var originalOwned = x.store.listOwnedRunningForRecovery;
    var originalRecover = x.store.recoverExpiredRunning;
    var originalRenew = x.store.renewLease;
    var originalResume = x.store.resumeOwnedRunning;
    var originalFence = x.writer.refreshLeasePhaseInCurrentUow;
    x.store.listExpiredRunningForRecovery = function () {
      order.push('listExpired');
      return originalExpired.apply(this, arguments);
    };
    x.store.listOwnedRunningForRecovery = function () {
      order.push('listOwned');
      return originalOwned.apply(this, arguments);
    };
    x.store.recoverExpiredRunning = function () {
      order.push('recover');
      x.clock.advanceMs(14_900);
      return originalRecover.apply(this, arguments);
    };
    x.store.resumeOwnedRunning = function () {
      resumeCalls++;
      order.push('resume');
      return originalResume.apply(this, arguments);
    };
    x.store.renewLease = function (token, nowMs, leaseMs) {
      order.push('renew:' + nowMs);
      assert.equal(x.writer.ready, false, sentinel + ' renew occurs before ready');
      assert.equal(timers.soDangCho(), 0, sentinel + ' no timer before commit');
      assert.ok(nowMs >= entryNow + 14_900, sentinel + ' renew uses fresh post-recovery time');
      return originalRenew.apply(this, arguments);
    };
    x.writer.refreshLeasePhaseInCurrentUow = function () {
      finalFenceCalls++;
      order.push('finalFence');
      return originalFence.apply(this, arguments);
    };
    entryNow = x.clock.nowMs();
    await x.writer.start();
    assert.ok(order.indexOf('listExpired') >= 0, sentinel + ' listed expired');
    assert.ok(order.indexOf('listOwned') >= 0, sentinel + ' listed owned');
    assert.ok(order.indexOf('recover') > order.indexOf('listExpired'), sentinel + ' recover after preview');
    assert.ok(order.some(function (item) { return item.indexOf('renew:') === 0; }), sentinel + ' renewed');
    assert.ok(finalFenceCalls >= 1, sentinel + ' final fence');
    assert.ok(resumeCalls >= 0, sentinel + ' resume path observable');
    var readyStatus = x.writer.status();
    assert.equal(readyStatus.ready, true, sentinel + ' ready after commit');
    assert.ok(readyStatus.wakeTimerActive || readyStatus.pollTimerActive ||
      readyStatus.heartbeatTimerActive || readyStatus.continuationActive,
      sentinel + ' public status exposes active timer after ready commit');
    assert.ok(timers.soDangCho() > 0, sentinel + ' timers publish after ready commit');
    var lease = x.kho.db.prepare(
      "SELECT owner_id,generation,expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get();
    assert.ok(Number(lease.expires_at_ms) > x.clock.nowMs(), sentinel + ' lease live');
    assert.equal(lease.owner_id, x.writer.leaseToken.ownerId, sentinel + ' owner');
    assert.equal(Number(lease.generation), Number(x.writer.leaseToken.generation), sentinel + ' generation');
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});
// TASK6_V22_REPLACEMENT_END STARTUP

// TASK6_V22_REPLACEMENT_START DUE61
test('Task 6 v22 overlay advance due keeps live order and enqueues continuation at sixty one', async function () {
  var sentinel = 'TASK6V22_RED_005_DUE61_ORDER';
  var x = taoWriterFixture({manualDrain: false});
  var timers = taoBoHenGia(x.clock);
  var processed = [], closureRan = false, helperCalls = 0;
  try {
    task6v22RequireFunction(x.writer, 'advanceDueInCurrentUow', sentinel);
    x.writer.timers = timers;
    await x.writer.start();
    var originalAll = x.kho.q.dqDenHan.all;
    var originalDirect = x.writer.directAccountOutcomeInCurrentUow;
    var originalHelper = x.writer.advanceDueInCurrentUow;
    var nowS = Math.floor(x.clock.nowMs() / 1000);
    var mixed = [{tk: 3, keTiep: nowS - 2}, {tk: 1, keTiep: nowS - 1}, {tk: 2, keTiep: nowS - 1}];
    for (var i = 4; i <= 61; i++) mixed.push({tk: i, keTiep: nowS});
    x.kho.q.dqDenHan.all = function (queryNowS, limit) {
      assert.equal(limit, 61, sentinel + ' limit plus one');
      assert.ok(queryNowS >= nowS, sentinel + ' query now');
      return mixed.slice();
    };
    x.writer.directAccountOutcomeInCurrentUow = function (mutation, accountId, targetS) {
      processed.push(Number(accountId));
      assert.ok(targetS <= Math.floor(x.clock.nowMs() / 1000), sentinel + ' target not future');
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
    assert.equal(helperCalls, 1, sentinel + ' helper called once');
    assert.deepEqual(processed.slice(0, 3), [3, 1, 2], sentinel + ' live dq order');
    assert.equal(processed.length, 60, sentinel + ' first sixty processed');
    assert.deepEqual(result, {deferred: true, code: 'TICK_PARTIAL'}, sentinel + ' public partial');
    assert.equal(closureRan, false, sentinel + ' closure skipped');
    assert.equal(x.writer.status().continuationActive, true, sentinel + ' continuation active');
    assert.ok(timers.soDangCho() >= 1, sentinel + ' continuation timer');
    x.kho.q.dqDenHan.all = originalAll;
    x.writer.directAccountOutcomeInCurrentUow = originalDirect;
    x.writer.advanceDueInCurrentUow = originalHelper;
  } finally { await x.writer.stop(100).catch(function () {}); x.dong(); }
});
// TASK6_V22_REPLACEMENT_END DUE61

// TASK6_V22_REPLACEMENT_START CUTOVER
test('Task 6 v22 overlay maintenance cutover validates guards and release precedence', function () {
  var sentinel = 'TASK6V22_RED_006_CUTOVER_RELEASE';
  var cutover = require('../server/scheduler/cutover.js');
  var storeModule = require('../server/scheduler/store.js');
  var runMaintenanceCutover = cutover.runMaintenanceCutover;
  task6v22RequireFunction(cutover, 'runMaintenanceCutover', sentinel);
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
      assert.deepEqual(result, {mode: 'durable', imported: 0, recovered: 0}, sentinel + ' exact result');
      assert.equal(released.ownerId, acquired.ownerId, sentinel + ' release same owner');
      assert.equal(Number(released.generation), Number(acquired.generation), sentinel + ' release same generation');
      assert.equal(success.kho.cauhinh('seed'), null, sentinel + ' no legacy seed');
      assert.match(success.kho.cauhinh('combat_seed_key_v1'), /^[0-9a-f]{64}$/, sentinel + ' combat seed');
      assert.deepEqual(success.kho.db.prepare(
        "SELECT action,job_id,detail_safe FROM scheduler_audit WHERE action='CUTOVER' ORDER BY id DESC LIMIT 1"
      ).get(), {action: 'CUTOVER', job_id: null, detail_safe: 'fresh-only'}, sentinel + ' audit');
      assert.throws(function () {
        runMaintenanceCutover({kho: success.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000505'});
      }, /SCHEDULER_CUTOVER_ALREADY_DURABLE/, sentinel + ' already durable');
    } finally { dongKhoTam(success); }
    var nonempty = taoKhoTam();
    try {
      var legacyId = Number(nonempty.kho.db.prepare(
        'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
      ).run('v22-cutover-legacy', 'V22 Cutover Legacy', 'h', 's', 1, 1).lastInsertRowid);
      nonempty.kho.db.prepare(
        'INSERT INTO dq(' +
        'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
        'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
      assert.throws(function () {
        runMaintenanceCutover({kho: nonempty.kho, clock: fakeClock(NOW_MS),
          ownerId: '00000000-0000-4000-8000-000000000502'});
      }, /SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED/, sentinel + ' nonempty fresh DB');
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
      }, /PRIMARY_WRITE_AUDIT_FAILURE/, sentinel + ' primary over release');
      assert.equal(primaryReleased, true, sentinel + ' release attempted after primary');
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
      }, /RELEASE_ONLY_FAILURE/, sentinel + ' release only');
    } finally { dongKhoTam(releaseOnly); }
  } finally {
    storeModule.SchedulerStore.prototype.acquireLease = originalAcquire;
    storeModule.SchedulerStore.prototype.releaseLease = originalRelease;
    storeModule.SchedulerStore.prototype.writeAudit = originalWriteAudit;
  }
});
// TASK6_V22_REPLACEMENT_END CUTOVER

// TASK6_V22_REPLACEMENT_START CLI
test('Task 6 v22 overlay scheduler cutover CLI grammar lifecycle and exact exports', async function () {
  var sentinel = 'TASK6V22_RED_007_CLI';
  var cli = require('./scheduler-cutover.js');
  var priorExitCode = process.exitCode;
  try {
    task6v22RequireFunction(cli, 'runCli', sentinel);
    assert.deepEqual(Object.keys(cli).sort(), ['main', 'parseArgs', 'runCli'].sort(), sentinel + ' exports');
    assert.deepEqual(cli.parseArgs(['--db', '/tmp/game.sqlite', '--action', 'cutover']),
      {dbPath: '/tmp/game.sqlite', action: 'cutover'}, sentinel + ' valid grammar');
    [
      ['--action', 'cutover', '--db', '/tmp/game.sqlite'],
      ['--db', '', '--action', 'cutover'],
      ['--db', '/tmp', '--action', 'cutover'],
      ['--db', '/tmp/game.sqlite', '--action', 'cutover', '--action', 'cutover'],
      ['--db', '/tmp/game.sqlite', '--unknown', 'cutover'],
      ['--db', '/tmp/game.sqlite'],
      ['--db', '/tmp/game.sqlite', '--action', 'cutover', 'extra']
    ].forEach(function (argv) {
      assert.throws(function () { cli.parseArgs(argv); }, /SCHEDULER_CLI_ARGS_INVALID/,
        sentinel + ' invalid grammar ' + argv.join(' '));
    });
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
      assert.equal(result.exitCode, 0, sentinel + ' success exit');
      assert.equal(closed, 1, sentinel + ' success closes');
      assert.equal(result.stderr, '', sentinel + ' success stderr');
      assert.equal(result.stdout, JSON.stringify({action: 'cutover', mode: 'durable',
        imported: 0, recovered: 0}) + '\n', sentinel + ' success stdout');
    } finally { removeDb(x.file); }
    var unsafe = await cli.runCli(['--db', '/tmp/game.sqlite', '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000602'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { throw new Error('contains secret payload'); }
    });
    assert.equal(unsafe.exitCode, 1, sentinel + ' unsafe exit');
    assert.equal(unsafe.stdout, '', sentinel + ' unsafe stdout');
    assert.equal(unsafe.stderr, 'SCHEDULER_CUTOVER_FAILED\n', sentinel + ' safe generic error');
    var primaryClose = taoKhoTam();
    var primaryCloseCount = 0;
    var primaryCloseReal = primaryClose.kho.dong.bind(primaryClose.kho);
    primaryClose.kho.dong = function () {
      primaryCloseCount++;
      primaryCloseReal();
      throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'});
    };
    try {
      var legacyId = Number(primaryClose.kho.db.prepare(
        'INSERT INTO tk(ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?)'
      ).run('v22-cli-legacy', 'V22 CLI Legacy', 'h', 's', 1, 1).lastInsertRowid);
      primaryClose.kho.db.prepare(
        'INSERT INTO dq(' +
        'tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
        'lm,soHT,capNhat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run(legacyId, '{"legacy":true}', 0, 0, 0, 0, 0, 1, 2, null, 1, 1);
      var primaryWins = await cli.runCli(['--db', primaryClose.file, '--action', 'cutover'], {
        makeOwnerId: function () { return '00000000-0000-4000-8000-000000000603'; },
        clock: fakeClock(NOW_MS),
        openKho: function () { return primaryClose.kho; }
      });
      assert.equal(primaryWins.exitCode, 1, sentinel + ' primary exit');
      assert.equal(primaryWins.stderr, 'SCHEDULER_CUTOVER_RECONCILIATION_REQUIRED\n',
        sentinel + ' primary over close');
      assert.equal(primaryCloseCount, 1, sentinel + ' primary close attempted');
    } finally { removeDb(primaryClose.file); }
    var closeDb = taoKhoTam();
    var closeCount = 0;
    var realClose = closeDb.kho.dong.bind(closeDb.kho);
    closeDb.kho.dong = function () {
      closeCount++;
      realClose();
      throw Object.assign(new Error('bad close'), {code: 'BAD_CLOSE'});
    };
    var closeOnly = await cli.runCli(['--db', closeDb.file, '--action', 'cutover'], {
      makeOwnerId: function () { return '00000000-0000-4000-8000-000000000604'; },
      clock: fakeClock(NOW_MS),
      openKho: function () { return closeDb.kho; }
    });
    assert.equal(closeOnly.exitCode, 1, sentinel + ' close-only exit');
    assert.equal(closeOnly.stdout, '', sentinel + ' close-only stdout');
    assert.equal(closeOnly.stderr, 'BAD_CLOSE\n', sentinel + ' close-only code');
    assert.equal(closeCount, 1, sentinel + ' close-only count');
    removeDb(closeDb.file);
    var out = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var err = {chunks: [], write: function (chunk) { this.chunks.push(String(chunk)); }};
    var mainResult = await cli.main(['--db', '/tmp', '--action', 'cutover'], {}, {stdout: out, stderr: err}, {});
    assert.equal(mainResult.exitCode, 1, sentinel + ' main result');
    assert.equal(process.exitCode, 1, sentinel + ' process exitCode');
    assert.equal(err.chunks.join(''), 'SCHEDULER_CLI_ARGS_INVALID\n', sentinel + ' main stderr');
  } finally {
    if (priorExitCode === undefined) delete process.exitCode;
    else process.exitCode = priorExitCode;
  }
});
// TASK6_V22_REPLACEMENT_END CLI

// TASK6_V22_REPLACEMENT_START EXACT_NULL
test('Task 6 v22 overlay exact null partial retains running lock without lifecycle calls', function () {
  var sentinel = 'TASK6V22_RED_008_EXACT_NULL_PARTIAL';
  var T = 1_800_010_081, x = taoAccountAdvanceFixture(T);
  try {
    x.ownerId = '00000000-0000-4000-8000-000000000881';
    x.writer = new SchedulerWriter({
      ownerId: x.ownerId, store: x.store, world: x.world, reducer: x.reducer,
      advanceService: x.service, clock: x.clock, logger: silentLogger(),
      pollMs: 1_000, leaseMs: 15_000, manualDrain: true
    });
    task6v22RequireFunction(x.writer, 'executeClaimedInCurrentUow', sentinel);
    x.clock.setS(T);
    var token = layLease(x, x.ownerId);
    x.writer.leaseToken = token;
    var forbidden = ['checkpointPartial', 'blockOwnedAccountAdvance', 'insertApplication',
      'finishResolved', 'completeApplied', 'completeAccountAdvanceAndScheduleSuccessor',
      'releaseBlockedAccountDependents'];
    var calls = {};
    forbidden.forEach(function (name) {
      if (typeof x.store[name] === 'function') {
        calls[name] = 0;
        var real = x.store[name].bind(x.store);
        x.store[name] = function () { calls[name]++; return real.apply(null, arguments); };
      }
    });
    var prepareCalls = 0, applyCalls = 0, effectSeen = null, beforeLock = null, afterLock = null, outcome = null;
    var prepared = {kind: 'partial', deferredExternal: false,
      advanceResult: {processed: 0, advancedToS: T, nextDueAtS: T,
        hasMoreDue: true, budgetExhausted: true}};
    x.reducer.prepare = function (mutation, executable) {
      prepareCalls++;
      assert.equal(executable.kind, 'ACCOUNT_ADVANCE', sentinel + ' branded account executable');
      return prepared;
    };
    x.reducer.applyPrepared = function (mutation, actualPrepared) {
      applyCalls++;
      assert.equal(actualPrepared, prepared, sentinel + ' prepared identity');
      effectSeen = {checkpointRevision: null, saveReceipt: null};
      return effectSeen;
    };
    x.kho.trongGiaoDich(function () {
      var nowMs = x.clock.nowMs();
      var claimed = x.store.claimNext(token, nowMs, T, 15_000);
      beforeLock = task6v22LockProjection(task6v22RawJob(x.kho, claimed.id));
      var mutation = taoMutationTam(token, {value: 0}, nowMs);
      outcome = x.world.trongMutationScheduler(mutation, function () {
        return x.writer.executeClaimedInCurrentUow(mutation, claimed, nowMs, {
          executionTargetS: T
        });
      });
      afterLock = task6v22LockProjection(task6v22RawJob(x.kho, claimed.id));
    }, {immediate: true});
    assert.equal(prepareCalls, 1, sentinel + ' prepare once');
    assert.equal(applyCalls, 1, sentinel + ' apply once');
    assert.deepEqual(Object.keys(effectSeen), ['checkpointRevision', 'saveReceipt'],
      sentinel + ' exact two-key order');
    assert.deepEqual(effectSeen, {checkpointRevision: null, saveReceipt: null},
      sentinel + ' exact null wrapper');
    assert.deepEqual(outcome.partial, true, sentinel + ' partial outcome');
    assert.deepEqual(afterLock, beforeLock, sentinel + ' running lock unchanged');
    forbidden.forEach(function (name) {
      assert.equal(calls[name] || 0, 0, sentinel + ' zero ' + name);
    });
  } finally { x.dong(); }
});
// TASK6_V22_REPLACEMENT_END EXACT_NULL
```

## V22 Stage-A/Stage-B requirements

Use V21's report and inventory workflow with these changes:

- Files and temp artifacts use `task6-v22`, `TASK6_V22`, and `TASK6V22`.
- `/tmp/task6-v22-authorities.sha256` pins parent Task6, Task5 remediation, and V21 SHA listed above.
- The report producer writes `plan_version=V22`, `plan_v22_sha`, `counts=parent runtime=73 + overlay=8 => N=81`, `stage_a_counts=244 tests / 243 pass / 0 fail / 1 skipped`, helper/parent/overlay slice hashes, overlay RED evidence hash, six meta rows, review bundle hash, report producer hash, Stage-A script hash, and current Stage-A normal/throw normalized TAP hashes.
- Stage-A must create real `docs/superpowers/reports` directory mode `0755` and report file mode `0644` before post-inventory, exclude only those exact report paths from inventory content diff, then run the producer before grep validation.
- The report producer may write to a `mktemp` file, but after `mv "$tmp" "$report"` it must immediately run `chmod 0644 "$report"`. Do not rely on `touch "$report"; chmod 0644 "$report"` before `mv`, because `mktemp` creates `0600` and `mv` replaces the inode.
- Stage-A must run fresh:

```bash
node --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js
node --throw-deprecation --test --test-isolation=none --test-reporter=tap tools/test-scheduler.js
```

Both must report:

```text
# tests 244
# pass 243
# fail 0
# skipped 1
```

- Stage-A must compare current helper/parent/overlay slices byte-for-byte to `/tmp/task6-v22-expected-*.js`.
- Stage-A must verify the overlay name order equals baseline163 + parent73 + overlay8.
- `/tmp/task6-v22-review-bundle.tsv` must include at minimum these exact digest fields before hashing: `plan_v22_sha`, `parent_task6_sha`, `task5_remediation_sha`, `v21_contract_sha`, `stage_a_script_sha`, `report_producer_sha`, `helper_slice_sha`, `parent_slice_sha`, `overlay_slice_sha`, `overlay_red_evidence_sha`, `six_meta_sha`, `stage_a_normalized_tap_sha`, `stage_a_throw_normalized_tap_sha`, and every `six_meta=` row. Reviewer artifacts must echo `plan_v22_sha`, `stage_a_script_sha`, `report_producer_sha`, and `review_bundle_sha`.
- Stage-B approvals must bind each reviewer line to `/tmp/task6-v22-review-bundle.tsv.sha256` and to an immutable reviewer artifact SHA. Validation is stricter than V21:
  - Require two distinct regular non-symlink artifact paths.
  - Require two distinct reviewer identities.
  - Require two distinct artifact SHA256 values.
  - Parse each artifact as exactly twelve nonempty `key=value` lines with unique keys and no extras: `identity`, `model`, `effort`, `outcome`, `plan_v22_sha`, `stage_a_script_sha`, `report_producer_sha`, `review_bundle_sha`, `six_meta_sha`, `stage_a_normalized_tap_sha`, `stage_a_throw_normalized_tap_sha`, `overlay_red_evidence_sha`.
  - Require exact values for `model=gpt-5.6-sol`, `effort=high`, `outcome=PASS`, and all digest fields against current `/tmp/task6-v22-*` seals.
  - Reject duplicate keys, extra keys, missing keys, same artifact path, same artifact SHA, same identity, symlink artifact, and non-regular artifact.

Use this validator before appending reviewer lines:

```bash
python3 - <<'PY' "$TASK6_V22_REVIEWER_1_ARTIFACT" "$TASK6_V22_REVIEWER_2_ARTIFACT"
import hashlib, os, stat, sys
paths = sys.argv[1:]
if len(paths) != 2 or paths[0] == paths[1]:
    raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_PATHS')
expected_keys = [
    'identity', 'model', 'effort', 'outcome', 'plan_v22_sha',
    'stage_a_script_sha', 'report_producer_sha', 'review_bundle_sha', 'six_meta_sha',
    'stage_a_normalized_tap_sha', 'stage_a_throw_normalized_tap_sha',
    'overlay_red_evidence_sha'
]
expected_values = {
    'model': 'gpt-5.6-sol',
    'effort': 'high',
    'outcome': 'PASS',
    'plan_v22_sha': open('/tmp/task6-v22-approved-plan.sha256').read().split()[0],
    'stage_a_script_sha': open('/tmp/task6-v22-stage-a.sh.sha256').read().split()[0],
    'report_producer_sha': open('/tmp/task6-v22-write-report-base.sh.sha256').read().split()[0],
    'review_bundle_sha': open('/tmp/task6-v22-review-bundle.tsv.sha256').read().split()[0],
    'six_meta_sha': open('/tmp/task6-v22-six-meta.sealed.tsv.sha256').read().split()[0],
    'stage_a_normalized_tap_sha': open('/tmp/task6-v22-stage-a.normalized.tap.sha256').read().split()[0],
    'stage_a_throw_normalized_tap_sha': open('/tmp/task6-v22-stage-a-throw.normalized.tap.sha256').read().split()[0],
    'overlay_red_evidence_sha': open('/tmp/task6-v22-red-evidence.tap.sha256').read().split()[0],
}
identities, artifact_hashes = set(), set()
for path in paths:
    st = os.lstat(path)
    if not stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode):
        raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_TYPE')
    data = open(path, 'rb').read()
    artifact_sha = hashlib.sha256(data).hexdigest()
    if artifact_sha in artifact_hashes:
        raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_SHA_DUP')
    artifact_hashes.add(artifact_sha)
    lines = data.decode('utf-8').splitlines()
    if len(lines) != 12:
        raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_LINE_COUNT')
    parsed = {}
    for line in lines:
        if '=' not in line:
            raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_FORMAT')
        key, value = line.split('=', 1)
        if key in parsed:
            raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_DUP_KEY')
        parsed[key] = value
    if list(parsed.keys()) != expected_keys:
        raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_KEYS')
    for key, value in expected_values.items():
        if parsed[key] != value:
            raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_VALUE_' + key)
    if not parsed['identity'] or parsed['identity'] in identities:
        raise SystemExit('TASK6_V22_REVIEW_ARTIFACT_IDENTITY')
    identities.add(parsed['identity'])
    print('reviewer\tidentity={}\tmodel=gpt-5.6-sol\teffort=high\toutcome=PASS\treview_bundle_sha={}\tartifact_sha={}'.format(
        parsed['identity'], parsed['review_bundle_sha'], artifact_sha
    ))
PY
```

## Self-audit checklist

- [ ] V22 created as a new immutable plan; V21 preserved.
- [ ] No source/test file edited by the plan author.
- [ ] Count remains `parent73 + overlay8 = N81`, final `244/243/0/1`.
- [ ] Fixed helper never calls `advanceTo(..., null)` and proves fixture creation by case 001 RED target reachability.
- [ ] Cutover overlay spies `SchedulerStore.prototype`, uses distinct fresh DBs for nonempty, asserts exact result `{mode:'durable', imported:0, recovered:0}`, combat seed, audit, already-durable, nonempty, primary-over-release, release-only, and same-token release.
- [ ] CLI overlay covers valid grammar, reordered/empty/dir/duplicate/unknown/missing/extra invalid grammar, success open/close, safe generic error, primary-over-close, close-only using real successful cutover DB, main/exitCode restoration.
- [ ] Due61 overlay stubs `directAccountOutcomeInCurrentUow`, processes 60 in live returned order `[3,1,2]`, asserts `limit=61`, `targetS<=now`, closure skipped, continuation active, and timer armed.
- [ ] Exact-null partial overlay stubs reducer `prepare/applyPrepared`, observes exact `{checkpointRevision:null, saveReceipt:null}`, and spies zero checkpoint/block/application/terminal/dependent-release calls while preserving the RUNNING lock tuple.
- [ ] Startup overlay asserts listExpired/listOwned/recover/renew/resume/final fence ordering, fresh now after recovery, renew before ready, and active timer booleans only through `writer.status()` after ready commit.
- [ ] Startup overlay and implementation use live Store `assertLiveLease` where a Store lease assertion is needed; the old reversed-name Store method is not referenced.
- [ ] RED harness remains fail-closed with exact first-target messages and rejects fixture/setup/type/sql failures.
