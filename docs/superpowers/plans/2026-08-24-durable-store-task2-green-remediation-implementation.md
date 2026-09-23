# Durable Store Task 2 Green Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair four Task-2 test-fixture defects and one private reconcile-validation defect while preserving the approved Store API, historical RED evidence, and Task-3+ compatibility.

**Architecture:** Keep the current 34-case Task-2 matrix and canonical Store body in place. Correct the four fixtures first, run one full remediation RED against the byte-identical failed-GREEN Store, then add one private reconcile-shape preflight before generic validation and run the strict GREEN and release gates.

**Tech Stack:** Node.js >=22.5, CommonJS, Node built-in test runner, `node:sqlite`/`DatabaseSync`, SQLite temp files, Bash; no new dependency.

**Spec:** [Task 2 remediation design](../specs/2026-08-24-durable-store-task2-remediation-design.md), supplementing the [durable scheduler design](../specs/2026-08-23-durable-event-scheduler-design.md) and the [first Task-2 remediation plan](2026-08-24-durable-store-task2-remediation-implementation.md)

## Global Constraints

- The valid historical missing-module RED remains immutable evidence: 62 tests, 27 pass, 34 fail, one skip, with every Task-2 failure rooted in the absent Store module. Do not rerun or replace it.
- The first full GREEN attempt is preserved as failed evidence: 62 tests, 56 pass, five fail, one skip, at test SHA-256 `9c1960ce0d9c2d593b8bb66540f5468483baa678e565face7b638fb23faf5b5b` and Store SHA-256 `8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09`.
- The failed test artifact is exactly 3,779 lines / 162,109 bytes. Its first 1,954 lines remain the immutable Task-1 prefix at SHA-256 `00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211` and 78,394 bytes.
- The failed Store artifact is exactly 1,666 lines / 83,078 bytes. It is the one canonical Store body from the first remediation plan; this follow-up changes only private reconcile-template validation.
- The first remediation plan is immutable at SHA-256 `89f5633e30a7560e2b54c62419a6b36a14968479a85317d4ff987a518420bb1f` (3,887 lines / 188,997 bytes). The remediation spec remains immutable at SHA-256 `7762f5080b0fa6cabd01f8ad0f65b5c39fe47a2b85f11a5e5556b8860a717ec9`.
- Preserve exactly 34 Task-2 top-level registrations, zero `t.test` registrations, 62 total registrations, and the one existing socket skip. All new assertions remain inside the existing cases.
- Failures 1–4 are fixture defects. They authorize no production relaxation: `StatementSync` retains its receiver requirement; canonical PvP identity remains derived from stable reference fields; public job validation remains priority-first; `claimNext` retains exact eligible-time ordering.
- Failure 5 is the sole production defect. Only private reconcile-template normalization maps invalid reconcile shape to `RECONCILE_JOB_FORBIDDEN`; public `schedule` retains generic priority-first validation.
- `scheduleReconcileAccountAdvance` and `ensureReconcileAccountAdvance` retain lease-first precedence. A stale token still throws `LEASE_LOST` before private template validation.
- No Store SQL, lease fence, replay logic, mutation semantics, public signature, export, or Task-3+ interface may change.
- Run exactly one full remediation RED after all fixture corrections and before the production patch. It must be 62 total, 60 pass, one fail, one skip, with only the reconcile-constructor case failing because `JOB_PRIORITY_INVALID` does not match `RECONCILE_JOB_FORBIDDEN`.
- The remediation GREEN must be 62 total, 61 pass, zero fail, one skip. Run `npm test` immediately afterward, followed by the direct, deprecation, syntax, lint, protected-hash, scope, index, static, and temp gates below.
- Execution may modify only `tools/test-scheduler.js`, `server/scheduler/store.js`, and `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md`. Do not modify either plan, either spec, migrations, database bridge, contract, package metadata, artifacts, SDD ledger/briefs, or the Git index.
- Existing temp artifacts are foreign baseline state unless the new before/after comparison proves they were created by this cycle. Remove stale snapshot files only through the validated paths exported by the failed cycle; never delete an unrelated `/tmp` path.
- Record commit intent only. Do not run `git add` or `git commit`; Task 3 remains blocked pending review of the final report and artifacts.

---

## File map

| Path | Action | Responsibility |
|---|---|---|
| `tools/test-scheduler.js` | Modify | Bind the SQLite statement receiver and repair three identity/isolation fixtures while preserving 34 Task-2 cases. |
| `server/scheduler/store.js` | Modify | Reject invalid private reconcile shape before generic job validation. |
| `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md` | Create | Preserve historical evidence and record the remediation RED/GREEN and all gates. |
| This plan, both specs, first remediation plan, Task-1 files, package/artifacts, Git index | Verify only | Remain byte-identical. |

### Task 1: Establish the failed-GREEN baseline and safe snapshots

**Files:**

- Verify: `tools/test-scheduler.js`
- Verify: `server/scheduler/store.js`
- Verify: protected plans, specs, source, package, and artifacts listed below

**Interfaces:**

- Consumes: the failed full-GREEN artifacts and any still-exported `task2_temp_before` / `task2_scope_before` snapshot paths.
- Produces: exported `task2_green_temp_before` and `task2_green_scope_before` paths for the final comparisons.

- [ ] **Step 1: Verify exact failed artifacts and clean only validated stale snapshot files**

Run in one persistent shell and keep it open through Task 5:

```bash
set -Eeuo pipefail
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  9c1960ce0d9c2d593b8bb66540f5468483baa678e565face7b638fb23faf5b5b
test "$(wc -l < tools/test-scheduler.js)" -eq 3779
test "$(wc -c < tools/test-scheduler.js)" -eq 162109
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09
test "$(wc -l < server/scheduler/store.js)" -eq 1666
test "$(wc -c < server/scheduler/store.js)" -eq 83078
test "$(head -n 1954 tools/test-scheduler.js | sha256sum | cut -d' ' -f1)" = \
  00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211
test "$(head -n 1954 tools/test-scheduler.js | wc -c)" -eq 78394
test "$(sha256sum \
  docs/superpowers/specs/2026-08-24-durable-store-task2-remediation-design.md | cut -d' ' -f1)" = \
  7762f5080b0fa6cabd01f8ad0f65b5c39fe47a2b85f11a5e5556b8860a717ec9
test "$(sha256sum \
  docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md | cut -d' ' -f1)" = \
  1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf
test "$(sha256sum \
  docs/superpowers/plans/2026-08-24-durable-store-task2-remediation-implementation.md | cut -d' ' -f1)" = \
  89f5633e30a7560e2b54c62419a6b36a14968479a85317d4ff987a518420bb1f
test "$(rg -c '^test\(' tools/test-scheduler.js)" -eq 62
test "$(tail -n +1956 tools/test-scheduler.js | rg -c '^test\(')" -eq 34
test "$(awk '/t\.test\(/{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
node --check tools/test-scheduler.js
node --check server/scheduler/store.js

remove_stale_task2_snapshot() {
  stale_snapshot_path="$1"
  test -n "$stale_snapshot_path" || return 0
  test -e "$stale_snapshot_path" || return 0
  case "$stale_snapshot_path" in
    /tmp/tmp.*) ;;
    *) printf 'refusing stale snapshot path: %s\n' "$stale_snapshot_path" >&2; return 1 ;;
  esac
  case "${stale_snapshot_path#/tmp/}" in
    */*) printf 'refusing nested stale snapshot path: %s\n' "$stale_snapshot_path" >&2; return 1 ;;
  esac
  if ! test -f "$stale_snapshot_path" ||
    test -L "$stale_snapshot_path" ||
    ! test -O "$stale_snapshot_path"
  then
    printf 'refusing unsafe stale snapshot file: %s\n' "$stale_snapshot_path" >&2
    return 1
  fi
  rm -f -- "$stale_snapshot_path"
}
remove_stale_task2_snapshot "${task2_temp_before:-}"
remove_stale_task2_snapshot "${task2_scope_before:-}"
unset task2_temp_before task2_scope_before
unset -f remove_stale_task2_snapshot

task2_green_temp_before="$(mktemp /tmp/tmp.XXXXXXXXXX)"
task2_green_scope_before="$(mktemp /tmp/tmp.XXXXXXXXXX)"
task2_green_red_tap=
task2_green_tap=
task2_green_scope_after=
task2_green_temp_after=
cleanup_task2_green_cycle() {
  task2_green_cleanup_status="$1"
  trap - EXIT HUP INT TERM
  for task2_green_cleanup_path in \
    "${task2_green_red_tap:-}" \
    "${task2_green_tap:-}" \
    "${task2_green_temp_before:-}" \
    "${task2_green_scope_before:-}" \
    "${task2_green_scope_after:-}" \
    "${task2_green_temp_after:-}"
  do
    test -n "$task2_green_cleanup_path" || continue
    case "$task2_green_cleanup_path" in
      /tmp/tmp.*) ;;
      *)
        printf 'refusing cycle cleanup path: %s\n' "$task2_green_cleanup_path" >&2
        task2_green_cleanup_status=1
        continue
        ;;
    esac
    case "${task2_green_cleanup_path#/tmp/}" in
      */*)
        printf 'refusing nested cycle cleanup path: %s\n' "$task2_green_cleanup_path" >&2
        task2_green_cleanup_status=1
        continue
        ;;
    esac
    test -e "$task2_green_cleanup_path" || continue
    if ! test -f "$task2_green_cleanup_path" ||
      test -L "$task2_green_cleanup_path" ||
      ! test -O "$task2_green_cleanup_path"
    then
      printf 'refusing unsafe cycle cleanup file: %s\n' "$task2_green_cleanup_path" >&2
      task2_green_cleanup_status=1
      continue
    fi
    rm -f -- "$task2_green_cleanup_path"
  done
  exit "$task2_green_cleanup_status"
}
trap 'cleanup_task2_green_cycle "$?"' EXIT
trap 'cleanup_task2_green_cycle 129' HUP
trap 'cleanup_task2_green_cycle 130' INT
trap 'cleanup_task2_green_cycle 143' TERM
export task2_green_temp_before task2_green_scope_before
find /tmp -maxdepth 3 \
  \( -type d -name 'thdc-scheduler-*' -o -type f -name 'game.sqlite' -o \
  -type f -name 'game.sqlite-wal' -o -type f -name 'game.sqlite-shm' \) \
  -print | sort >"$task2_green_temp_before"
find . -path './.git' -prune -o -type f \
  ! -path './tools/test-scheduler.js' \
  ! -path './server/scheduler/store.js' \
  ! -path './.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md' \
  -print0 | sort -z | xargs -0 sha256sum >"$task2_green_scope_before"
test -f "$task2_green_temp_before"
test -f "$task2_green_scope_before"
```

Do not remove any path listed inside `task2_green_temp_before`; those paths predate this cycle and are baseline state.

### Task 2: Repair the four fixtures without changing Store

**Files:**

- Modify: `tools/test-scheduler.js:2099-2129`
- Modify: `tools/test-scheduler.js:2286-2355`
- Modify: `tools/test-scheduler.js:2469-2476`
- Modify: `tools/test-scheduler.js:2864-2911`
- Modify: `tools/test-scheduler.js:3244-3274`
- Verify only: `server/scheduler/store.js`

**Interfaces:**

- Consumes: `DatabaseSync.prepare() -> StatementSync`, canonical PvP and external-ref identities, `claimNext(token, nowMs, watermarkS, lockMs)`, and the private reconcile constructor.
- Produces: the same 62-test/34-Task-2 topology at test SHA-256 `59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e`.

- [ ] **Step 1: Apply the exact fixture and regression patch**

Apply this patch to `tools/test-scheduler.js`:

```diff
*** Begin Patch
*** Update File: tools/test-scheduler.js
@@
-      var expected = x.kho.db.prepare(
-        'SELECT id FROM event_jobs WHERE id IN (' + seedRows.map(function () { return '?'; }).join(',') + ') ' +
+      var ids = seedRows.map(function (row) { return row.id; });
+      var expectedStatement = x.kho.db.prepare(
+        'SELECT id FROM event_jobs WHERE id IN (' + ids.map(function () { return '?'; }).join(',') + ') ' +
         "ORDER BY CASE WHEN state='RETRY_WAIT' THEN retry_at_ms ELSE scheduled_at_s*1000 END," +
         'priority,sequence,id'
-      ).all.apply(null, seedRows.map(function (row) { return row.id; }))
+      );
+      var expected = expectedStatement.all.apply(expectedStatement, ids)
         .map(function (row) { return row.id; });
+      assert.equal(expected.length, seedRows.length, 'seed ' + seed + ' fixture cardinality');
@@
-function globalJob(key, scheduledAtS, replayOfJobId) {
-  var ref = {kind: 'fleet', ownerAccountId: 1, fleetId: 1, launchAtS: 1,
+function globalJob(key, scheduledAtS, replayOfJobId, fleetId) {
+  fleetId = fleetId || 1;
+  var ref = {kind: 'fleet', ownerAccountId: 1, fleetId: fleetId, launchAtS: 1,
@@
-      laterRoot = x.store.schedule(lease, globalJob('later-root', 10), now);
+      laterRoot = x.store.schedule(lease, globalJob('later-root', 10, null, 2), now);
     }, { immediate: true });
+    assert.notEqual(laterRoot.id, source.id, 'same-T root B has a distinct stable identity');
+    assert.notEqual(laterRoot.idempotency_key, source.idempotency_key,
+      'same-T root B has a distinct canonical key');
     assert.equal(x.store.globalWatermarkS(), 10);
@@
       var wrongExternalRef = externalGlobalJob(11);
+      wrongExternalRef.priority = 51;
+      wrongExternalRef.aggregateType = 'missile';
+      wrongExternalRef.idempotencyKey = 'external:missile:spy:1:1:1:1:1:1:11';
       wrongExternalRef.payload.ref = {
         kind: 'missile', ownerAccountId: 1, missileId: 1, launchAtS: 1,
         targetKey: '1:1:1', arrivalAtS: 11, mission: 'spy'
       };
+      assert.deepEqual([
+        wrongExternalRef.priority, wrongExternalRef.aggregateType,
+        wrongExternalRef.aggregateId, wrongExternalRef.sourceAccountId,
+        wrongExternalRef.idempotencyKey
+      ], [51, 'missile', '1', 1, 'external:missile:spy:1:1:1:1:1:1:11']);
       assert.throws(function () {
         x.store.schedule(lease, wrongExternalRef, now);
       }, /PAYLOAD_VALUE_INVALID/);
@@
     assert.equal(
       Number(retried.retry_at_ms),
       now + 1_000 + x.store.deterministicJitter(retried.id, 1)
     );
+    x.kho.db.prepare('UPDATE event_jobs SET retry_at_ms=? WHERE id=?')
+      .run(100_000, retried.id);
     now = 30_000;
@@
+    assert.equal(running.idempotency_key, accountFixtureKey('recover-one'));
+    assert.equal(Number(running.attempt), 0);
     assert.equal(running.locked_by, freshLease.ownerId);
     assert.equal(Number(running.locked_until_ms), 45_000);
@@
-    x.kho.trongGiaoDich(function () {
-      x.store.recoverExpiredRunning(recoveryLease, now, policy);
+    var recoveredCount = x.kho.trongGiaoDich(function () {
+      return x.store.recoverExpiredRunning(recoveryLease, now, policy);
     }, { immediate: true });
+    assert.equal(recoveredCount, 1);
+    assert.equal(x.store.getById(retried.id).state, 'RETRY_WAIT');
+    assert.equal(Number(x.store.getById(retried.id).attempt), 1);
     var recovered = x.store.getByIdempotencyKey(running.idempotency_key);
@@
-    assert.throws(function () {
+    var sequenceBeforeReject = x.kho.db.prepare(
+      "SELECT value FROM scheduler_meta WHERE key='sequence'"
+    ).get().value;
+    var rowsBeforeReject = x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_jobs').get().n;
+    var rejected;
+    try {
       x.kho.trongGiaoDich(function () {
-        x.store.scheduleReconcileAccountAdvance(lease, Object.assign({}, reconcile, {
-          idempotencyKey: 'account-advance:1:10', priority: 100
-        }), now);
-      }, { immediate: true });
-    }, /RECONCILE_JOB_FORBIDDEN/);
+        x.store.scheduleReconcileAccountAdvance(
+          lease, Object.assign({}, reconcile, {priority: 100}), now
+        );
+      }, {immediate: true});
+    } catch (error) { rejected = error; }
+    assert.ok(rejected, 'private reconcile constructor rejects priority 100');
+    assert.equal(x.kho.db.prepare(
+      "SELECT value FROM scheduler_meta WHERE key='sequence'"
+    ).get().value, sequenceBeforeReject, 'rejection allocates no sequence');
+    assert.equal(x.kho.db.prepare(
+      'SELECT COUNT(*) AS n FROM event_jobs'
+    ).get().n, rowsBeforeReject, 'rejection inserts no row');
+    assert.match(String(rejected.message), /^RECONCILE_JOB_FORBIDDEN$/);
*** End Patch
```

The missile input is intentionally an otherwise coherent external missile envelope: priority 51, aggregate type `missile`, aggregate ID `"1"`, source account 1, and the structurally canonical key for its `spy` ref. Only the missile mission value is invalid. Do not change `expectedJobPriority` or validation order.

- [ ] **Step 2: Verify the repaired test artifact and unchanged Store without running tests**

```bash
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
test "$(wc -l < tools/test-scheduler.js)" -eq 3814
test "$(wc -c < tools/test-scheduler.js)" -eq 164072
test "$(head -n 1954 tools/test-scheduler.js | sha256sum | cut -d' ' -f1)" = \
  00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211
test "$(rg -c '^test\(' tools/test-scheduler.js)" -eq 62
test "$(tail -n +1956 tools/test-scheduler.js | rg -c '^test\(')" -eq 34
test "$(awk '/t\.test\(/{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09
test "$(wc -l < server/scheduler/store.js)" -eq 1666
test "$(wc -c < server/scheduler/store.js)" -eq 83078
node --check tools/test-scheduler.js
node --check server/scheduler/store.js
test "$(awk 'length($0)>120{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(rg -n '[[:blank:]]+$' tools/test-scheduler.js | wc -l)" -eq 0
```

### Task 3: Run the sole full remediation RED

**Files:**

- Test: `tools/test-scheduler.js`
- Verify only: `server/scheduler/store.js`

**Interfaces:**

- Consumes: repaired test SHA `59f0593a…` and unchanged Store SHA `8c5e609f…`.
- Produces: one full TAP RED with 62 total, 60 pass, one fail, one skip and no source mutation.

- [ ] **Step 1: Run exactly one full remediation RED and prove its sole root cause**

Do not run any focused or full Task-2 test before this block:

```bash
set -Euo pipefail
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09
task2_green_red_tap="$(mktemp /tmp/tmp.XXXXXXXXXX)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$task2_green_red_tap" 2>&1
task2_green_red_status=$?
set -e
cat "$task2_green_red_tap"
test "$task2_green_red_status" -ne 0
rg -q '^# tests 62$' "$task2_green_red_tap"
rg -q '^# pass 60$' "$task2_green_red_tap"
rg -q '^# fail 1$' "$task2_green_red_tap"
rg -q '^# skipped 1$' "$task2_green_red_tap"
test "$(rg -c '^not ok ' "$task2_green_red_tap")" -eq 1
rg -q '^not ok [0-9]+ - only the lease-owned reconcile constructor admits expected revision minus one$' \
  "$task2_green_red_tap"
rg -q 'JOB_PRIORITY_INVALID' "$task2_green_red_tap"
rg -q 'RECONCILE_JOB_FORBIDDEN' "$task2_green_red_tap"
rg -q '^ok [0-9]+ - claim ordering is deterministic across randomized PENDING and RETRY_WAIT ties$' \
  "$task2_green_red_tap"
rg -q '^ok [0-9]+ - global quarantine holds T until its replacement application commits$' \
  "$task2_green_red_tap"
rg -q '^ok [0-9]+ - store accepts current and previous payload schema, then rejects unsafe jobs$' \
  "$task2_green_red_tap"
rg -q '^ok [0-9]+ - retry and expired-running recovery use the incremented attempt exactly once$' \
  "$task2_green_red_tap"
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09
rm -f -- "$task2_green_red_tap"
unset task2_green_red_tap
export task2_green_red_status
```

The reconcile case records the caught error before its final code assertion. Its sequence and row-count assertions execute first, so this RED also proves the rejected call made no persistent sequence or job-row mutation.

### Task 4: Add the private reconcile-shape preflight

**Files:**

- Modify: `server/scheduler/store.js:556-582`
- Test: existing reconcile case in `tools/test-scheduler.js`

**Interfaces:**

- Consumes: private template `{kind, expectedRevision, priority, payload.reconcile, payload.reconcileRevision}`.
- Produces: `normalizeReconcileTemplate(template) -> normalized job` or `RECONCILE_JOB_FORBIDDEN` for invalid private shape; public `validateJob` remains unchanged.

- [ ] **Step 1: Apply the one production patch**

Apply this patch to `server/scheduler/store.js`:

```diff
*** Begin Patch
*** Update File: server/scheduler/store.js
@@
 function normalizeReconcileTemplate(template) {
+  if (!template || template.kind !== 'ACCOUNT_ADVANCE' ||
+      template.expectedRevision !== -1 || template.priority !== 200 ||
+      !template.payload || template.payload.reconcile !== true ||
+      !Number.isSafeInteger(template.payload.reconcileRevision) ||
+      template.payload.reconcileRevision < 0) {
+    fail('RECONCILE_JOB_FORBIDDEN');
+  }
   var probe = Object.assign({}, template, {
@@
   });
   var normalized = validateJob(job, { allowReconcile: true });
-  if (normalized.kind !== 'ACCOUNT_ADVANCE' || normalized.expectedRevision !== -1 ||
-      normalized.payload.reconcile !== true ||
-      !Number.isSafeInteger(normalized.payload.reconcileRevision) ||
-      normalized.priority !== 200) {
-    fail('RECONCILE_JOB_FORBIDDEN');
-  }
   return this._insertNormalizedWithSequence(leaseToken, normalized, epoch, nowMs);
*** End Patch
```

This preflight is private because only `normalizeReconcileTemplate` uses it. `scheduleReconcileAccountAdvance` and `ensureReconcileAccountAdvance` still call `assertLiveLease` before normalization. The public `schedule -> validateJob` path and its priority-first `JOB_PRIORITY_INVALID` behavior are byte-for-byte unchanged.

- [ ] **Step 2: Verify the exact final artifacts before GREEN**

```bash
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
test "$(wc -l < tools/test-scheduler.js)" -eq 3814
test "$(wc -c < tools/test-scheduler.js)" -eq 164072
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  f15b00f6e45e32d17446d0004fac569ab0479e64c071930853a7e7e2d100974d
test "$(wc -l < server/scheduler/store.js)" -eq 1667
test "$(wc -c < server/scheduler/store.js)" -eq 83150
node --check tools/test-scheduler.js
node --check server/scheduler/store.js
test "$(rg -c '^test\(' tools/test-scheduler.js)" -eq 62
test "$(tail -n +1956 tools/test-scheduler.js | rg -c '^test\(')" -eq 34
test "$(awk '/t\.test\(/{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(rg -c '^SchedulerStore\.prototype\.[A-Za-z0-9_]* =' server/scheduler/store.js)" -eq 63
test "$(awk 'length($0)>120{n++} END{print n+0}' \
  tools/test-scheduler.js server/scheduler/store.js)" -eq 0
test "$(rg -n '[[:blank:]]+$' tools/test-scheduler.js server/scheduler/store.js | wc -l)" -eq 0
```

### Task 5: Run remediation GREEN and all release gates

**Files:**

- Test: `tools/test-scheduler.js`
- Verify: `server/scheduler/store.js` and all protected paths
- Create after gates: `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md`

**Interfaces:**

- Consumes: final test SHA `59f0593a…`, final Store SHA `f15b00f…`, and persistent before-snapshot paths.
- Produces: strict GREEN evidence, gate evidence, empty new-temp delta, and the Task-2 report.

- [ ] **Step 1: Run the full remediation GREEN once**

```bash
set -Euo pipefail
task2_green_tap="$(mktemp /tmp/tmp.XXXXXXXXXX)"
set +e
node --test-reporter=tap tools/test-scheduler.js >"$task2_green_tap" 2>&1
task2_green_status=$?
set -e
cat "$task2_green_tap"
rg -q '^# tests 62$' "$task2_green_tap"
rg -q '^# pass 61$' "$task2_green_tap"
rg -q '^# fail 0$' "$task2_green_tap"
rg -q '^# skipped 1$' "$task2_green_tap"
test "$task2_green_status" -eq 0
rm -f -- "$task2_green_tap"
unset task2_green_tap
export task2_green_status
```

- [ ] **Step 2: Immediately run aggregate, direct, deprecation, and syntax gates**

```bash
set +e
npm test
task2_green_npm_status=$?
set -e
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
node --check server/scheduler/store.js
node --check tools/test-scheduler.js
node tools/lint.js
set +e
node tools/check-syntax.js
task2_green_syntax_status=$?
set -e
export task2_green_npm_status task2_green_syntax_status
printf 'npm_test_status=%s\ncheck_syntax_status=%s\n' \
  "$task2_green_npm_status" "$task2_green_syntax_status"
```

Environmental socket/spawn/package failures remain blockers and must be reported literally. Direct scheduler, deprecation, parse, and lint failures stop execution.

- [ ] **Step 3: Verify protected hashes, scope, index, static shape, and temp cleanup in order**

```bash
test "$(head -n 1954 tools/test-scheduler.js | sha256sum | cut -d' ' -f1)" = \
  00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211
test "$(sha256sum server/scheduler/migrations.js | cut -d' ' -f1)" = \
  1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76
test "$(sha256sum server/db.js | cut -d' ' -f1)" = \
  982ff360fa62c0ece158d57cf9acdca34783f35f12ea82409ea478437ade3545
test "$(sha256sum server/scheduler/contract.js | cut -d' ' -f1)" = \
  3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1
test "$(sha256sum package.json | cut -d' ' -f1)" = \
  7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f
test "$(sha256sum dist/artifact.html | cut -d' ' -f1)" = \
  9bfb1f6e3d5bb6f42d3e197d59a94c7124c9bc7f65b92a4ab3c7f80c9ae1decd
test "$(sha256sum dist/thien-ha-dai-chien.html | cut -d' ' -f1)" = \
  f7e6661a4bf25b11bdd4551f17651f36cf505f27e3ba0014160cf61fcc25b288
test "$(sha256sum \
  docs/superpowers/specs/2026-08-24-durable-store-task2-remediation-design.md | cut -d' ' -f1)" = \
  7762f5080b0fa6cabd01f8ad0f65b5c39fe47a2b85f11a5e5556b8860a717ec9
test "$(sha256sum \
  docs/superpowers/plans/2026-08-24-durable-store-task2-remediation-implementation.md | cut -d' ' -f1)" = \
  89f5633e30a7560e2b54c62419a6b36a14968479a85317d4ff987a518420bb1f
test "$(sha256sum \
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md | cut -d' ' -f1)" = \
  cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
test "$(sha256sum .superpowers/sdd/model-routing.md | cut -d' ' -f1)" = \
  b15d2498ec8699c227f7d3c6d6b7724e4518b996448ec832cea1c315b55c9426
test "$(sha256sum \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-brief.md | \
  cut -d' ' -f1)" = \
  2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a
test "$(sha256sum \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md | \
  cut -d' ' -f1)" = \
  6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38
test "$(sha256sum \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/progress.md | \
  cut -d' ' -f1)" = \
  67f74197c85f8316df30393a2351830530e76b47c050c183b2f23e232281beee

test -n "${task2_green_scope_before:-}"
test -f "$task2_green_scope_before"
task2_green_scope_after="$(mktemp /tmp/tmp.XXXXXXXXXX)"
find . -path './.git' -prune -o -type f \
  ! -path './tools/test-scheduler.js' \
  ! -path './server/scheduler/store.js' \
  ! -path './.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md' \
  -print0 | sort -z | xargs -0 sha256sum >"$task2_green_scope_after"
cmp -s "$task2_green_scope_before" "$task2_green_scope_after"
rm -f "$task2_green_scope_before" "$task2_green_scope_after"
unset task2_green_scope_before task2_green_scope_after

git diff --cached --name-only
test "$(git diff --cached --name-only | wc -l)" -eq 0
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  f15b00f6e45e32d17446d0004fac569ab0479e64c071930853a7e7e2d100974d
git diff --check -- tools/test-scheduler.js server/scheduler/store.js
test "$(awk 'length($0)>120{n++} END{print n+0}' \
  tools/test-scheduler.js server/scheduler/store.js)" -eq 0
test "$(rg -n '[[:blank:]]+$' tools/test-scheduler.js server/scheduler/store.js | wc -l)" -eq 0
test "$(rg -c '^test\(' tools/test-scheduler.js)" -eq 62
test "$(tail -n +1956 tools/test-scheduler.js | rg -c '^test\(')" -eq 34
test "$(awk '/t\.test\(/{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(rg -c '^  prove\(' tools/test-scheduler.js)" -eq 24
test "$(rg -c '^SchedulerStore\.prototype\.[A-Za-z0-9_]* =' server/scheduler/store.js)" -eq 63
test "$(awk '/sweepDeletedAccountOrphans|invalidateGlobalJob/{n++} END{print n+0}' \
  server/scheduler/store.js)" -eq 0
test "$(rg -c '^// BEGIN TASK2_CANONICAL_STORE$' server/scheduler/store.js)" -eq 1
test "$(rg -c '^// END TASK2_CANONICAL_STORE$' server/scheduler/store.js)" -eq 1
node - <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync('server/scheduler/store.js', 'utf8');
const definitions = Array.from(
  source.matchAll(/SchedulerStore\.prototype\.([A-Za-z0-9_]+)\s*=/g),
  function (match) { return match[1]; }
);
const calls = Array.from(
  source.matchAll(/this\.([A-Za-z0-9_]+)\s*\(/g),
  function (match) { return match[1]; }
);
const duplicateDefinitions = definitions.filter(function (name, index) {
  return definitions.indexOf(name) !== index;
});
const missing = Array.from(new Set(calls)).filter(function (name) {
  return definitions.indexOf(name) < 0;
});
if (duplicateDefinitions.length || missing.length) {
  throw new Error(JSON.stringify({duplicateDefinitions: duplicateDefinitions, missing: missing}));
}
NODE

test -n "${task2_green_temp_before:-}"
test -f "$task2_green_temp_before"
task2_green_temp_after="$(mktemp /tmp/tmp.XXXXXXXXXX)"
find /tmp -maxdepth 3 \
  \( -type d -name 'thdc-scheduler-*' -o -type f -name 'game.sqlite' -o \
  -type f -name 'game.sqlite-wal' -o -type f -name 'game.sqlite-shm' \) \
  -print | sort >"$task2_green_temp_after"
task2_green_temp_delta="$(comm -13 "$task2_green_temp_before" "$task2_green_temp_after")"
printf '%s' "$task2_green_temp_delta"
if test -n "$task2_green_temp_delta"; then
  export task2_green_temp_delta
  node - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const delta = process.env.task2_green_temp_delta.split('\n').filter(Boolean);
const roots = new Set(delta.map(function (entry) {
  const match = /^(\/tmp\/thdc-scheduler-[^/]+)(?:\/game\.sqlite(?:-wal|-shm)?)?$/.exec(entry);
  if (!match) throw new Error('refusing non-Task-2 temp delta: ' + entry);
  return match[1];
}));
for (const root of roots) {
  if (path.dirname(root) !== '/tmp' || !path.basename(root).startsWith('thdc-scheduler-')) {
    throw new Error('refusing broad temp root: ' + root);
  }
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) {
    throw new Error('refusing unsafe temp root: ' + root);
  }
  fs.rmSync(root, {recursive: true, force: true});
}
NODE
  find /tmp -maxdepth 3 \
    \( -type d -name 'thdc-scheduler-*' -o -type f -name 'game.sqlite' -o \
    -type f -name 'game.sqlite-wal' -o -type f -name 'game.sqlite-shm' \) \
    -print | sort >"$task2_green_temp_after"
  task2_green_temp_delta="$(comm -13 "$task2_green_temp_before" "$task2_green_temp_after")"
fi
test -z "$task2_green_temp_delta"
rm -f -- "$task2_green_temp_before" "$task2_green_temp_after"
unset task2_green_temp_before task2_green_temp_after
unset task2_green_temp_delta
trap - EXIT HUP INT TERM
unset -f cleanup_task2_green_cycle
unset task2_green_red_tap task2_green_tap
unset task2_green_cleanup_status task2_green_cleanup_path
```

The cleanup script accepts only newly observed, owned, non-symlink `/tmp/thdc-scheduler-*` directories. Any other new path aborts cleanup and remains a reported blocker.

- [ ] **Step 4: Write the Task-2 report and record commit intent only**

Create `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md` only after the gates. The report must include:

- Exact authority identities: the controller-frozen SHA-256/line/byte dispatch identity of
  `docs/superpowers/plans/2026-08-24-durable-store-task2-green-remediation-implementation.md`; first
  remediation plan `89f5633e30a7560e2b54c62419a6b36a14968479a85317d4ff987a518420bb1f`
  (3,887 lines / 188,997 bytes); remediation spec
  `7762f5080b0fa6cabd01f8ad0f65b5c39fe47a2b85f11a5e5556b8860a717ec9` (293 lines / 14,633 bytes);
  parent design `1fc85a8d33384aeb511cfa9946743910d58454cbab4bb0f6070a3076ecb78ddf` (311 lines /
  42,966 bytes); parent implementation plan
  `cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3` (23,455 lines / 1,128,291
  bytes); and model routing `b15d2498ec8699c227f7d3c6d6b7724e4518b996448ec832cea1c315b55c9426`
  (94 lines / 5,163 bytes). The executor copies this plan's identity from the immutable dispatch handoff; it must not
  edit the plan to manufacture a self-referential identity.
- Exact Task-1 identities: brief `2e4e609d68cd0570bacbc9b4499b130bb3f88e1409c1a755a0251a36d8be529a`
  (212 lines / 11,308 bytes), report
  `6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38` (252 lines / 9,306 bytes),
  and progress `67f74197c85f8316df30393a2351830530e76b47c050c183b2f23e232281beee` (259 lines /
  17,329 bytes).
- Exact allowed paths and actual changed paths. The only allowed and expected changed paths are
  `tools/test-scheduler.js`, `server/scheduler/store.js`, and
  `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md`; list each actual changed
  path and state explicitly that no other path and no cached/index path changed.
- The valid historical missing-module RED `62/27/34/1` and failed first GREEN `62/56/5/1`, both labeled
  historical and neither rerun or relabeled. Include the failed test identity
  `9c1960ce0d9c2d593b8bb66540f5468483baa678e565face7b638fb23faf5b5b` (3,779 lines / 162,109
  bytes), failed Store identity `8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09`
  (1,666 lines / 83,078 bytes), and all five diagnosed roots.
- The sole current remediation RED `62/60/1/1`, its literal nonzero process status, the sole actual
  `JOB_PRIORITY_INVALID` versus expected `RECONCILE_JOB_FORBIDDEN` mismatch, the byte-identical failed Store
  identity, and the reconcile assertion's zero sequence/row mutation evidence.
- The current remediation GREEN `62/61/0/1` and literal zero process status; final test SHA
  `59f0593a10973483c61ea2eab4f5aea927d9e3e5c05840487928d88e09926c3e` with 3,814 lines / 164,072
  bytes; and final Store SHA `f15b00f6e45e32d17446d0004fac569ab0479e64c071930853a7e7e2d100974d`
  with 1,667 lines / 83,150 bytes.
- Literal outcomes and process statuses for the immediately following `npm test`, direct scheduler,
  throw-deprecation, Store parse, test parse, lint, aggregate syntax, protected-hash, scope, index,
  `git diff --check`, width, whitespace, topology, prototype, deferred-symbol, canonical-marker, call-graph, and
  temp-delta gates. Report environmental failures as blockers, never passes.
- Every protected Task-1 baseline hash: test prefix
  `00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211`; migrations
  `1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76`; database bridge
  `982ff360fa62c0ece158d57cf9acdca34783f35f12ea82409ea478437ade3545`; scheduler contract
  `3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1`; package
  `7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f`; artifact
  `9bfb1f6e3d5bb6f42d3e197d59a94c7124c9bc7f65b92a4ab3c7f80c9ae1decd`; standalone distribution
  `f7e6661a4bf25b11bdd4551f17651f36cf505f27e3ba0014160cf61fcc25b288`; plus the exact routing,
  Task-1 brief/report/progress, specs, and parent-plan identities above. State the comparison result for each.
- These exact 34 Task-2 top-level test names, in registration order, plus the observed result of each:

  1. `claim merges PENDING and RETRY_WAIT by the exact CASE eligible key`
  2. `claimNext skips an earlier active lock through equality and claims it one millisecond later`
  3. `claim ordering is deterministic across randomized PENDING and RETRY_WAIT ties`
  4. `same idempotency key accepts equal hash and rejects different payload`
  5. `stale lease generation rolls back an effect transition`
  6. `releaseLease checks owner and generation, then permits immediate takeover`
  7. `renewLease is generation-conditional and only a live owner extends expiry`
  8. `global quarantine holds T until its replacement application commits`
  9. `store accepts current and previous payload schema, then rejects unsafe jobs`
  10. `execution rejects raw payload tampering before a reducer can receive it`
  11. `loadReplayableJob validates a quarantined source before CLI replay copies it`
  12. `stored PVP and EXTERNAL rows retain source account through executable and replay validation`
  13. `replay key and source identity must be canonical and equivalent`
  14. `duplicate external application validates canonical result before alreadyApplied`
  15. `PvP application shape is context-validated on first insert and duplicate replay`
  16. `application duplicate rejects tampered canonical result identity and replay linkage`
  17. `application results use per-kind exact fields and cutover recovery evidence`
  18. `unresolved global watermark blocks a later local wake instead of letting it cross T`
  19. `application conflict target never swallows an unrelated unique job linkage`
  20. `retry and expired-running recovery use the incremented attempt exactly once`
  21. `nextEligibleAtMs and statusSnapshot expose only aggregate scheduling data`
  22. `local cancellation is idempotent while global cancellation is refused`
  23. `quarantined global resolution claims, locks, applies, then reaches CANCELLED`
  24. `pending global terminalization requires a claimed immutable application`
  25. `resolution claim enforces strict unlock and future capability never bypasses retry time`
  26. `terminal replay atomically resolves the quarantined forensic source only after its application`
  27. `only the lease-owned reconcile constructor admits expected revision minus one`
  28. `metadata sequence is monotonic across terminal rows, restart, and rollback`
  29. `reconcile keeps one RUNNING continuation and supersedes every live sibling`
  30. `load boundary, local wake identity, and command adoption reject stale or future rows`
  31. `global dependency blocks account selection across retry quarantine and restart`
  32. `dependency integrity rejects a raw live account sibling at startup`
  33. `every Store transition conditions on the current owner generation`
  34. `assembled migration and Store lease smoke uses the real current columns`
- These exact 24 lease-fault labels, each paired with its observed `LEASE_LOST` result and zero target-row,
  metadata, audit, dependency, or sequence mutation result as applicable:

  1. `sequence allocation`
  2. `job insert`
  3. `effective time metadata`
  4. `claimNext`
  5. `claimForResolution`
  6. `resumeOwnedRunning`
  7. `application insert`
  8. `partial checkpoint`
  9. `durable mutation metadata`
  10. `replay source terminalization`
  11. `successful completion`
  12. `explicit cancellation`
  13. `transient failure`
  14. `quarantine failure`
  15. `expired-running retry recovery`
  16. `expired-running quarantine recovery`
  17. `local cancellation`
  18. `audit insert`
  19. `command adoption`
  20. `account replacement cancellation`
  21. `account dependency block`
  22. `blocked dependency release`
  23. `global barrier park`
  24. `deleted-account local cancellation`
- Confirmation that public priority-first behavior, all Store SQL, 63 Store prototypes, 62 total/34 Task-2/zero
  nested registrations, one socket skip, public signatures, exports, and Task-3+ interfaces are unchanged.
- Confirmation that the source has exactly one `TASK2_CANONICAL_STORE` body with no superseded fragment,
  duplicate prototype, or undefined Store call. State explicitly that `sweepDeletedAccountOrphans` and
  `invalidateGlobalJob` remain absent and are deferred together to Task 4.
- Confirmation that stale snapshot cleanup touched only validated exported regular files, cycle cleanup was
  disarmed only after successful final comparisons, and temp-delta cleanup touched only owned nonsymlink paths
  proved new by this cycle.

Record this unexecuted intent:

```text
fix: remediate durable Store green failures
```

Do not run `git add` or `git commit`. Mark the report `READY_FOR_REVIEW` only if the strict remediation GREEN and every non-environmental gate pass. Otherwise mark it `BLOCKED` with exact evidence.

## Authoring-time verification

These commands validate the plan artifact without executing RED, GREEN, or any source test:

```bash
set -Eeuo pipefail
plan=docs/superpowers/plans/2026-08-24-durable-store-task2-green-remediation-implementation.md
test "$(rg -c '^```bash$' "$plan")" -eq 8
test "$(rg -c '^```diff$' "$plan")" -eq 2
test "$(rg -c '^```text$' "$plan")" -eq 1
test "$(rg -c '^```$' "$plan")" -eq 11
test "$(rg -c '^```' "$plan")" -eq 22
test "$(rg -n '[[:blank:]]+$' "$plan" | wc -l)" -eq 0
node - <<'NODE' | bash -n
const fs = require('node:fs');
const lines = fs.readFileSync(
  'docs/superpowers/plans/2026-08-24-durable-store-task2-green-remediation-implementation.md',
  'utf8'
).split('\n');
let inside = false;
for (const line of lines) {
  if (!inside && line === '```bash') { inside = true; continue; }
  if (inside && line === '```') { inside = false; process.stdout.write('\n'); continue; }
  if (inside) process.stdout.write(line + '\n');
}
if (inside) throw new Error('unclosed bash fence');
NODE
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  9c1960ce0d9c2d593b8bb66540f5468483baa678e565face7b638fb23faf5b5b
test "$(sha256sum server/scheduler/store.js | cut -d' ' -f1)" = \
  8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09
node --check tools/test-scheduler.js
node --check server/scheduler/store.js
```

At dispatch, the exact patch contexts above produce the frozen final test and Store identities in Task 4. If either post-patch hash differs, stop before RED or GREEN and report the assembly mismatch.
