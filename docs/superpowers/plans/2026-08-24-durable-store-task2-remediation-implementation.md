# Durable Store Task 2 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the durable scheduler Store boundary with authoritative lease, replay, payload, application, and terminal-state validation while preserving the completed Task-1 baseline and all Task-3+ interfaces.

**Architecture:** Append one complete 34-case Task-2 matrix to the immutable Task-1 harness, run one missing-module RED, then create one canonical CommonJS `SchedulerStore` body. SQLite remains the sole authority: every mutation proves the live lease, replay ordering is decorated from the persisted root, and application/terminal transitions reload persisted evidence immediately before use.

**Tech Stack:** Node.js >=22.5, CommonJS, `node:sqlite`/`DatabaseSync`, `node:crypto`, Node built-in test runner, SQLite temp files; no runtime dependency.

**Spec:** [Task 2 remediation design](../specs/2026-08-24-durable-store-task2-remediation-design.md), supplementing the [durable scheduler design](../specs/2026-08-23-durable-event-scheduler-design.md)

## Global Constraints

- This plan supersedes only Task 2, lines 2102–5485, of the parent implementation plan at SHA-256 `cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3`; Tasks 1 and 3–10 remain binding.
- The remediation spec is immutable at SHA-256 `7762f5080b0fa6cabd01f8ad0f65b5c39fe47a2b85f11a5e5556b8860a717ec9` (293 lines / 14,633 bytes).
- Node runtime remains the approved `>=22.5`; production uses only Node core plus SQLite through plain `require('node:sqlite')`. Package engines, scripts, dependencies, and lockfiles are verify-only.
- `THDC_DB` continues to select the one shared game-and-scheduler database, defaulting to `server/data/thdc.db`; Task 2 creates no database or service process of its own.
- Gameplay time remains Unix epoch seconds in `*_at_s`; lease, retry, lock, application, and operational timestamps remain Unix epoch milliseconds in `*_at_ms`.
- `dq.state` remains canonical. Task 2 stores only wake/idempotency/application metadata and never stores inventory or fleet snapshots in a job payload.
- Exactly one live `global-writer` owner/generation may mutate Store state. Every state-changing Store entry proves the writer lease at entry, and every non-lease `INSERT`/`UPDATE`/`DELETE` embeds the owner, generation, and `expires_at_ms > nowMs` fence in that exact SQL statement. A zero-row result rechecks the lease before returning an allowed no-op or throwing its contract-specific conflict.
- Strict expiry is `expires_at_ms < nowMs`; equality remains owned. Live execution additionally requires `locked_until_ms > nowMs`.
- Canonical JSON recursively sorts object keys and preserves array order. Hashes are lowercase SHA-256 of the exact UTF-8 canonical bytes. Raw job/result/snapshot JSON is bounded at 65,536 UTF-8 bytes.
- Payload schema v1 and exactly previous v0 are accepted at the caller boundary; every accepted v0 payload is normalized and persisted as canonical schema v1 before hashing.
- Claim order remains `(eligible_at_ms, priority, sequence, id)`, with PENDING eligibility `scheduled_at_s * 1000` and RETRY_WAIT eligibility `retry_at_ms`.
- Replay children retain physical sequence but execute at the exact quarantined root tuple `(scheduled_at_s, priority, sequence, id)`; Store supplies the same persisted logical decoration at barrier listing and executable load.
- `loadExecutableJob` is the sole execution reload. `insertApplication`, `completeApplied`, and `finishResolved` reload authoritative persisted job/application evidence and never trust a caller-carried claimed object.
- `finishResolved` accepts only `CANCELLED` and exactly `STALE_REVISION`, `MATCH_INVALIDATED`, `ENTITY_REMOVED`, or `OPERATOR_CONFIRMED_INVALID`. `RESOLVED_BY_REPLAY` remains private to replay-source terminalization.
- The canonical explicit-resolution miss is `JOB_RESOLUTION_CLAIM_INVALID`; job-ID lookup accepts only exact lowercase scheduler UUID-v4 text and otherwise throws `SCHEDULER_JOB_ID_INVALID`.
- `adoptAccountAdvanceForCommand` accepts only a positive safe-integer account ID and binds `String(accountId)` directly to `aggregate_id=@accountId`.
- Task 2 must not expose `sweepDeletedAccountOrphans` or call future `invalidateGlobalJob`; Task 4 adds both together.
- All 34 Task-2 top-level tests are assembled before Store production exists. New remediation fixtures/assertions are folded into those 34 registrations; no extra `test()` or `t.test()` is permitted.
- The sole RED must report 62 tests, pass 27, fail 34, skip 1, with all Task-2 failures rooted in missing `../server/scheduler/store.js`. The sole GREEN must report 62 tests, pass 61, fail 0, skip 1.
- Run Steps 1–4 in one persistent shell; the exported preimplementation scope/temp snapshot paths remain live until their binding final comparisons and cleanup.
- Immediately after GREEN, run `npm test`, then the direct/deprecation, syntax, lint, protected-hash, scope, snapshot, Git-index, 120-column, whitespace, and temp-delta gates in the exact order below. Environmental socket/spawn/package blockers remain recorded failures, never relabeled as passes.
- Allowed implementation writes are only `tools/test-scheduler.js`, `server/scheduler/store.js`, and the controller-authorized Task-2 report. The Git index is read-only; Step 5 records commit intent only and never runs `git add` or `git commit`.

### Immutable Task-1 baseline

| Path | Required SHA-256 |
|---|---|
| `tools/test-scheduler.js` before Task-2 append | `00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211` |
| `server/scheduler/migrations.js` | `1c2350152f3017a1660f891322ddeeb014ec33edbc0966d9bf7798b8fb579a76` |
| `server/db.js` | `982ff360fa62c0ece158d57cf9acdca34783f35f12ea82409ea478437ade3545` |
| `server/scheduler/contract.js` | `3d3940efb0ed5eb3db52c57c82556efca62a44c1a17742d63008ae0dbc6652a1` |
| `package.json` | `7a3a4dc8e4152b9638e90954d7507253407b33ccb71db069b47f03057f26e48f` |
| `dist/artifact.html` | `9bfb1f6e3d5bb6f42d3e197d59a94c7124c9bc7f65b92a4ab3c7f80c9ae1decd` |
| `dist/thien-ha-dai-chien.html` | `f7e6661a4bf25b11bdd4551f17651f36cf505f27e3ba0014160cf61fcc25b288` |
| Task-1 report | `6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38` |

---

## File map

| Path | Action | Responsibility |
|---|---|---|
| `tools/test-scheduler.js` | Modify | Preserve the 1,954-line Task-1 file byte-for-byte, then append the exact 34-case Task-2 block. |
| `server/scheduler/store.js` | Create | One SQLite authority for canonical validation, sequence, lease, claim, replay, application, terminal, status, and account-wake primitives. |
| `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md` | Create | Literal RED/GREEN/gate/scope/temp evidence and commit intent. |
| `server/scheduler/migrations.js`, `server/db.js`, `server/scheduler/contract.js` | Verify only | Immutable Task-1 production baseline. |
| `package.json`, lockfiles, `dist/`, parent plans/specs/SDD ledger/briefs | Verify only | No Task-2 drift. |

### Task 2: Implement the remediated durable Store boundary

**Files:**

- Create: `server/scheduler/store.js`
- Modify: `tools/test-scheduler.js`
- Create after verification: `.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md`

**Interfaces:**

- Consumes: `Kho.prototype.trongGiaoDich`, Task-1 schema v1, and `{nowMs: () => number}`.
- Produces: the parent Task-2 Store surface required by Tasks 3–10, including scheduling, lease/claim/recovery, authoritative executable and application validation, logical replay decoration, terminal transitions, account-wake/dependency helpers, status, and scrubbers.
- Defers: `sweepDeletedAccountOrphans`, `invalidateGlobalJob`, richer PvP snapshot semantics, and canonical exact-state reconciliation to their owning later tasks.

- [ ] **Step 1: Append the complete 34-case preimplementation matrix**

Verify the baseline hash first, then append exactly one LF-only blank line and this one block after the existing Task-1 EOF. Do not move, rewrite, or reformat any Task-1 byte. The lazy module cache is reached only during a registered Task-2 case. `taoStoreTam` resolves the Store constructor before allocating a temp DB; direct `taoKhoTam` cases require only inside their existing `try/finally`, so import/constructor failure still closes and removes the fixture.

Run this guard before editing the harness:

```bash
set -Eeuo pipefail
test "$(sha256sum \
  docs/superpowers/specs/2026-08-24-durable-store-task2-remediation-design.md | cut -d' ' -f1)" = \
  7762f5080b0fa6cabd01f8ad0f65b5c39fe47a2b85f11a5e5556b8860a717ec9
test "$(sha256sum \
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md | cut -d' ' -f1)" = \
  cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211
test "$(wc -l < tools/test-scheduler.js)" -eq 1954
test "$(wc -c < tools/test-scheduler.js)" -eq 78394
test "$(sha256sum \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md | \
  cut -d' ' -f1)" = \
  6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38
test ! -e server/scheduler/store.js
task2_temp_before="$(mktemp)"
task2_scope_before="$(mktemp)"
export task2_temp_before task2_scope_before
find /tmp -maxdepth 3 \
  \( -type d -name 'thdc-scheduler-*' -o -type f -name 'game.sqlite' -o \
  -type f -name 'game.sqlite-wal' -o -type f -name 'game.sqlite-shm' \) \
  -print | sort >"$task2_temp_before"
find . -path './.git' -prune -o -type f \
  ! -path './tools/test-scheduler.js' \
  ! -path './server/scheduler/store.js' \
  ! -path './.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md' \
  -print0 | sort -z | xargs -0 sha256sum >"$task2_scope_before"
```

```js
// BEGIN TASK2_TEST_APPEND
// Append this block after the byte-identical Task-1 baseline.
var task2StoreCache;
function task2StoreModule() {
  if (!task2StoreCache) task2StoreCache = require('../server/scheduler/store.js');
  return task2StoreCache;
}
function canonicalJson(value) { return task2StoreModule().canonicalJson(value); }
function sha256(text) { return task2StoreModule().sha256(text); }
function newSchedulerStore(kho, clock) {
  return new (task2StoreModule().SchedulerStore)(kho, clock);
}

var fixtureAccountIds = new Map(), nextFixtureAccountId = 100_000;
function accountFixtureIdentity(label, overrides) {
  var canonical = /^account-advance:([1-9][0-9]*):(-1|[0-9]+)$/.exec(String(label));
  if (canonical) return {accountId: Number(canonical[1]), revision: Number(canonical[2])};
  var explicitId = overrides && overrides.aggregateId !== undefined
    ? Number(overrides.aggregateId) : null;
  var accountId = explicitId;
  if (accountId === null) {
    if (!fixtureAccountIds.has(label)) fixtureAccountIds.set(label, nextFixtureAccountId++);
    accountId = fixtureAccountIds.get(label);
  }
  var revision = overrides && overrides.expectedRevision !== undefined
    ? Number(overrides.expectedRevision) : 1;
  return {accountId: accountId, revision: revision};
}
function accountFixtureKey(label, overrides) {
  var identity = accountFixtureIdentity(label, overrides);
  return 'account-advance:' + identity.accountId + ':' + identity.revision;
}
function job(label, scheduledAtS, priority, overrides) {
  overrides = overrides || {};
  var kind = overrides.kind || 'ACCOUNT_ADVANCE';
  if (kind !== 'ACCOUNT_ADVANCE') {
    return Object.assign({
      kind: 'ACCOUNT_ADVANCE', scheduledAtS: scheduledAtS, priority: priority,
      idempotencyKey: label, aggregateType: 'account', aggregateId: '1',
      expectedRevision: 1, payload: {schemaVersion: 1, accountId: 1}, maxAttempts: 8
    }, overrides);
  }
  var identity = accountFixtureIdentity(label, overrides);
  var payload = Object.assign({schemaVersion: 1}, overrides.payload || {}, {
    accountId: identity.accountId
  });
  var canonicalKey = accountFixtureKey(label, overrides);
  return Object.assign({
    kind: kind, scheduledAtS: scheduledAtS, priority: priority,
    idempotencyKey: canonicalKey, aggregateType: 'account',
    aggregateId: String(identity.accountId), expectedRevision: identity.revision,
    payload: payload, maxAttempts: 8
  }, overrides, {
    idempotencyKey: Object.prototype.hasOwnProperty.call(overrides, 'idempotencyKey')
      ? overrides.idempotencyKey : canonicalKey,
    payload: payload
  });
}
function taoStoreTam(clock) {
  var api = task2StoreModule();
  var x;
  try {
    x = taoKhoTam();
    x.clock = clock;
    apDungMigrationScheduler(x.kho, clock.nowMs());
    x.store = new api.SchedulerStore(x.kho, clock);
    x.dong = function () { dongKhoTam(x); };
    return x;
  } catch (error) {
    if (x) dongKhoTam(x);
    throw error;
  }
}
function danhDauRetry(kho, idempotencyKey, retryAtMs) {
  kho.db.prepare(
    "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=?," +
    "locked_by=NULL,locked_until_ms=NULL WHERE idempotency_key=?"
  ).run(retryAtMs, idempotencyKey);
}
function layLease(x, ownerId) {
  var token = x.store.acquireLease(ownerId, x.clock.nowMs(), 15_000);
  assert.ok(token, 'lease phải acquire được trong fixture mới');
  return { ownerId: ownerId, generation: token.generation };
}

test('claim merges PENDING and RETRY_WAIT by the exact CASE eligible key', function () {
  var clock = { nowMs: function () { return 10_000; } };
  var x = taoStoreTam(clock);
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000001');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('local-old', 8, 100), clock.nowMs());
      x.store.schedule(lease, job('retry-now', 1, 100), clock.nowMs());
    }, { immediate: true });
    danhDauRetry(x.kho, accountFixtureKey('retry-now'), 9_000);
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, 10_000, null, 15_000);
    }, { immediate: true });
    assert.equal(claimed.idempotency_key, accountFixtureKey('local-old'));
    x.kho.db.prepare(
      "UPDATE scheduler_lease SET generation=generation+1 WHERE lease_name='global-writer'"
    ).run();
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimNext(lease, 10_000, null, 15_000);
      }, {immediate: true});
    }, /LEASE_LOST/, 'a stale token is not an empty-or-work sentinel when work exists');
    x.kho.db.prepare('DELETE FROM event_jobs').run();
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimNext(lease, 10_000, null, 15_000);
      }, {immediate: true});
    }, /LEASE_LOST/, 'a stale token throws even when the eligible queue is empty');
  } finally { x.dong(); }
});

test('claimNext skips an earlier active lock through equality and claims it one millisecond later',
  function () {
    var now = 10_000, x = taoStoreTam({nowMs: function () { return now; }});
    try {
      var lease = layLease(x, '00000000-0000-4000-8000-000000000066');
      var rows = x.kho.trongGiaoDich(function () {
        var early = x.store.schedule(lease, job('locked-early', 8, 100), now);
        var later = x.store.schedule(lease, job('unlocked-later', 9, 100), now);
        x.kho.db.prepare(
          "UPDATE event_jobs SET locked_by='other',locked_until_ms=? WHERE id=?"
        ).run(now + 1, early.id);
        return {early: early, later: later};
      }, {immediate: true});
      assert.equal(x.kho.trongGiaoDich(function () {
        return x.store.claimNext(lease, now, null, 15_000).id;
      }, {immediate: true}), rows.later.id, 'locked earlier row is skipped');
      now += 1;
      assert.equal(x.kho.trongGiaoDich(function () {
        return x.store.claimNext(lease, now, null, 15_000);
      }, {immediate: true}), null, 'lock expiry equality is still locked');
      now += 1;
      assert.equal(x.kho.trongGiaoDich(function () {
        return x.store.claimNext(lease, now, null, 15_000).id;
      }, {immediate: true}), rows.early.id, 'strictly later instant can claim it');
    } finally { x.dong(); }
  });

test('claim ordering is deterministic across randomized PENDING and RETRY_WAIT ties', function () {
  var now = 20_000, x = taoStoreTam({ nowMs: function () { return now; } });
  var keys = ['p-a', 'r-a', 'p-b', 'r-b', 'p-tie-a', 'p-tie-b'];
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000050');
    for (var seed = 0; seed < 16; seed++) {
      var seedRows = x.kho.trongGiaoDich(function () {
        var rows = [];
        keys.forEach(function (_, index) {
          var key = keys[(index * 5 + seed * 3) % keys.length];
          rows.push(x.store.schedule(
            lease, job(key + '-' + seed, key.indexOf('r-') === 0 ? 19 : 20, 100), now
          ));
        });
        return rows;
      }, { immediate: true });
      danhDauRetry(x.kho, accountFixtureKey('r-a-' + seed), 18_000);
      danhDauRetry(x.kho, accountFixtureKey('r-b-' + seed), 20_000);
      var expected = x.kho.db.prepare(
        'SELECT id FROM event_jobs WHERE id IN (' + seedRows.map(function () { return '?'; }).join(',') + ') ' +
        "ORDER BY CASE WHEN state='RETRY_WAIT' THEN retry_at_ms ELSE scheduled_at_s*1000 END," +
        'priority,sequence,id'
      ).all.apply(null, seedRows.map(function (row) { return row.id; }))
        .map(function (row) { return row.id; });
      var actual = expected.map(function () {
        return x.kho.trongGiaoDich(function () {
          return x.store.claimNext(lease, now, null, 15_000).id;
        }, { immediate: true });
      });
      assert.deepEqual(actual, expected, 'seed ' + seed);
    }
  } finally { x.dong(); }
});


test('same idempotency key accepts equal hash and rejects different payload', function () {
  var literal = '{"a":{"a":1,"z":2},"b":[{"c":3,"d":4},2],"z":0}';
  assert.equal(canonicalJson({z: 0, b: [{d: 4, c: 3}, 2], a: {z: 2, a: 1}}), literal);
  assert.equal(sha256(literal), '1e3df1c647b57786cea2ac927e4c0dc526a70bc60b33f9aa0fc7e6fc142ff3f9');
  var x = taoStoreTam({ nowMs: function () { return 1; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000002'), first;
    var input = job('same', 10, 100, {
      payload: {schemaVersion: 1, nextLocalAtS: 10}
    });
    taoDqChoReconcile(x, Number(input.aggregateId), Number(input.expectedRevision));
    x.kho.trongGiaoDich(function () {
      first = x.store.schedule(lease, input, 1);
      assert.equal(x.store.schedule(lease, input, 1).id, first.id);
      assert.throws(function () {
        x.store.schedule(lease, Object.assign({}, input, {
          payload: Object.assign({}, input.payload, {nextLocalAtS: 11})
        }), 1);
      }, /IDEMPOTENCY_PAYLOAD_MISMATCH/);
      [
        ['kind', 'PVP_RESOLVE'],
        ['scheduled_at_s', 11],
        ['priority', 50],
        ['max_attempts', 9],
        ['aggregate_type', 'match'],
        ['aggregate_id', String(Number(input.aggregateId) + 1)],
        ['expected_revision', Number(input.expectedRevision) + 1],
        ['source_account_id', Number(input.aggregateId)],
        ['payload_json', '{}'],
        ['payload_sha256', '0'.repeat(64)],
        ['replay_of_job_id', first.id]
      ].forEach(function (mutation) {
        var column = mutation[0];
        var original = x.kho.db.prepare(
          'SELECT ' + column + ' AS value FROM event_jobs WHERE id=?'
        ).get(first.id).value;
        x.kho.db.prepare('UPDATE event_jobs SET ' + column + '=? WHERE id=?')
          .run(mutation[1], first.id);
        assert.throws(function () {
          x.store.schedule(lease, input, 1);
        }, /IDEMPOTENCY_PAYLOAD_MISMATCH/, column);
        x.kho.db.prepare('UPDATE event_jobs SET ' + column + '=? WHERE id=?')
          .run(original, first.id);
      });
    }, { immediate: true });
  } finally { x.dong(); }
});

test('stale lease generation rolls back an effect transition', function () {
  var now = 1, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var oldLease = layLease(x, '00000000-0000-4000-8000-000000000003'), saved;
    x.kho.trongGiaoDich(function () {
      saved = x.store.schedule(oldLease, job('generation-job', 1, 100), now);
    }, { immediate: true });
    now = 15_001;
    assert.equal(x.store.acquireLease('00000000-0000-4000-8000-000000000004', now, 15_000), null);
    var oldGeneration = x.kho.db.prepare(
      "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().generation;
    assert.equal(oldGeneration, oldLease.generation);
    now = 15_002; // expiry is strict: existing expires_at_ms=15_001 must be < nowMs
    var newLease = layLease(x, '00000000-0000-4000-8000-000000000004');
    assert.notEqual(newLease.generation, oldLease.generation);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(oldLease, saved, { effectiveAtS: 1, result: { code: 'ok' } }, now);
      }, { immediate: true });
    }, /LEASE_LOST/);
    var oldEffects = x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
    ).get(accountFixtureKey('generation-job')).n;
    assert.equal(oldEffects, 0);
    assert.equal(x.kho.db.prepare('SELECT state FROM event_jobs WHERE id=?').get(saved.id).state, 'PENDING');
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(oldLease, now);
    }, { immediate: true }), false);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(newLease, now);
    }, { immediate: true }), true);
    var releasedExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(releasedExpires, 0);
    var afterRelease = layLease(x, '00000000-0000-4000-8000-000000000013');
    assert.equal(afterRelease.generation, newLease.generation + 1);
  } finally { x.dong(); }
});



test('releaseLease checks owner and generation, then permits immediate takeover', function () {
  var now = 100, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var current = layLease(x, '00000000-0000-4000-8000-000000000014');
    var wrongOwner = { ownerId: '00000000-0000-4000-8000-000000000015', generation: current.generation };
    var wrongGeneration = { ownerId: current.ownerId, generation: current.generation + 1 };
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(wrongOwner, now);
    }, { immediate: true }), false);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(wrongGeneration, now);
    }, { immediate: true }), false);
    var heldExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(heldExpires, 15_100);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.releaseLease(current, now);
    }, { immediate: true }), true);
    var zeroExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(zeroExpires, 0);
    var successor = layLease(x, '00000000-0000-4000-8000-000000000016');
    assert.equal(successor.generation, current.generation + 1);
  } finally { x.dong(); }
});

test('renewLease is generation-conditional and only a live owner extends expiry', function () {
  var now = 1, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000017');
    now = 5_000;
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.renewLease(lease, now, 15_000);
    }, { immediate: true }), true);
    var renewedExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(renewedExpires, 20_000);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.renewLease({ ownerId: lease.ownerId, generation: lease.generation + 1 }, now, 15_000);
    }, { immediate: true }), false);
    var unchangedExpires = x.kho.db.prepare(
      "SELECT expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().expires_at_ms;
    assert.equal(unchangedExpires, 20_000);
  } finally { x.dong(); }
});

function fixtureMatchId(ref, defenderAccountId) {
  return sha256(canonicalJson({
    ownerAccountId: ref.ownerAccountId,
    defenderAccountId: defenderAccountId,
    fleetId: ref.fleetId,
    launchAtS: ref.launchAtS,
    targetKey: ref.targetKey,
    arrivalAtS: ref.arrivalAtS,
    rule: 'pvp-v1'
  }));
}
function globalJob(key, scheduledAtS, replayOfJobId) {
  var ref = {kind: 'fleet', ownerAccountId: 1, fleetId: 1, launchAtS: 1,
    targetKey: '1:1:1', arrivalAtS: scheduledAtS, mission: 'attack'};
  var matchId = fixtureMatchId(ref, 2);
  return job(
    replayOfJobId ? 'manual-replay:' + replayOfJobId + ':fixture-replay' :
      'pvp-resolve:' + matchId + ':' + scheduledAtS,
    scheduledAtS,
    50,
    {
    kind: 'PVP_RESOLVE', aggregateType: 'match', aggregateId: matchId,
    expectedRevision: null, sourceAccountId: 1, replayOfJobId: replayOfJobId || null,
    payload: {
      schemaVersion: 1,
      matchId: matchId,
      ref: ref
    }
  }
  );
}
function replayJobFrom(source, nonce) {
  var payload = source.payload || JSON.parse(source.payload_json);
  return {
    kind: source.kind, scheduledAtS: Number(source.scheduled_at_s),
    priority: Number(source.priority),
    idempotencyKey: 'manual-replay:' + source.id + ':' + nonce,
    aggregateType: source.aggregate_type, aggregateId: source.aggregate_id,
    expectedRevision: source.expected_revision === null ? null : Number(source.expected_revision),
    sourceAccountId: source.source_account_id === null ? null : Number(source.source_account_id),
    payload: payload,
    maxAttempts: Number(source.max_attempts), replayOfJobId: source.id
  };
}
function externalGlobalJob(scheduledAtS) {
  return job('external:fleet:transport:1:1:1:1:1:1:' + scheduledAtS, scheduledAtS, 50, {
    kind: 'EXTERNAL_RESOLVE', aggregateType: 'fleet', aggregateId: '1',
    expectedRevision: null, sourceAccountId: 1,
    payload: { schemaVersion: 1, ref: {
      kind: 'fleet', ownerAccountId: 1, fleetId: 1, launchAtS: 1,
      targetKey: '1:1:1', arrivalAtS: scheduledAtS, mission: 'transport'
    } }
  });
}
test('global quarantine holds T until its replacement application commits', function () {
  var now = 10_000, clock = { nowMs: function () { return now; } }, x = taoStoreTam(clock);
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000018');
    var source, replacement, laterRoot;
    x.kho.trongGiaoDich(function () {
      source = x.store.schedule(lease, globalJob('poison-root', 10), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
        "error_code='INVARIANT' WHERE id=?"
      ).run(now, source.id);
      replacement = x.store.schedule(lease, replayJobFrom(source, 'n1'), now);
      laterRoot = x.store.schedule(lease, globalJob('later-root', 10), now);
    }, { immediate: true });
    assert.equal(x.store.globalWatermarkS(), 10);
    assert.equal(x.store.getByIdempotencyKey(replacement.idempotency_key).state, 'PENDING');
    assert.equal(x.store.globalWatermarkS(), 10, 'creation alone must not release root barrier');
    var barriers = x.store.listBarrierJobsAtOrBefore(lease, 10, now);
    assert.deepEqual(barriers.map(function (row) { return row.id; }), [replacement.id, laterRoot.id]);
    assert.deepEqual([
      barriers[0].logical_root_id,
      barriers[0].logical_key,
      barriers[0].logical_scheduled_at_s,
      barriers[0].logical_priority,
      barriers[0].logical_sequence,
      barriers[0].logical_order_id
    ], [source.id, source.idempotency_key, 10, 50, Number(source.sequence), source.id]);
    var claimed = x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(lease, replacement.id, now, 15_000);
    }, { immediate: true });
    assert.equal(claimed.id, replacement.id);
    x.kho.trongGiaoDich(function () {
      var executable = x.store.loadExecutableJob(lease, Object.assign({}, claimed, {
        logical_root_id: laterRoot.id,
        logical_sequence: Number(laterRoot.sequence)
      }), now);
      assert.deepEqual([
        executable.logical_root_id,
        executable.logical_key,
        executable.logical_scheduled_at_s,
        executable.logical_priority,
        executable.logical_sequence,
        executable.logical_order_id
      ], [source.id, source.idempotency_key, 10, 50, Number(source.sequence), source.id]);
      assert.throws(function () {
        x.store.parkGlobalBehindPreceding(lease, executable, executable.id, 10, now);
      }, /BARRIER_PRECEDING_ORDER_INVALID/);
      assert.equal(x.store.getById(executable.id).state, 'RUNNING');
      x.store.insertApplication(lease, executable, {
        effectiveAtS: 10, result: { code: 'MATCH_INVALIDATED' }, resolvesJobId: source.id
      }, now);
      assert.equal(x.store.globalWatermarkS(), 10, 'application insertion alone does not release root');
      x.store.finishResolved(lease, executable, 'CANCELLED', 'MATCH_INVALIDATED', now);
    }, { immediate: true });
    assert.equal(x.store.globalWatermarkS(), 10, 'later same-time root remains authoritative');
    x.kho.trongGiaoDich(function () {
      var claimedLater = x.store.claimForResolution(lease, laterRoot.id, now, 15_000);
      x.store.insertApplication(lease, claimedLater, {
        effectiveAtS: 10, result: {code: 'MATCH_INVALIDATED'}
      }, now);
      x.store.finishResolved(lease, claimedLater, 'CANCELLED', 'MATCH_INVALIDATED', now);
    }, {immediate: true});
    assert.equal(x.store.globalWatermarkS(), null);
    assert.equal(
      x.kho.db.prepare('SELECT resolved_by_job_id FROM event_jobs WHERE id=?').get(source.id)
        .resolved_by_job_id,
      claimed.id
    );
    var resolves = x.kho.db.prepare(
      'SELECT resolves_job_id FROM event_applications WHERE job_id=?'
    ).get(claimed.id).resolves_job_id;
    assert.equal(resolves, source.id);
  } finally { x.dong(); }
});



test('store accepts current and previous payload schema, then rejects unsafe jobs', function () {
  var now = 100, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000031');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('schema-v1', 1, 100), now);
      var previous = x.store.schedule(lease, job('account-advance:1:1', 2, 100, {
        payload: { schemaVersion: 0, accountId: 1 }
      }), now);
      assert.equal(
        previous.payload_json,
        '{"accountId":1,"nextLocalAtS":2,"schemaVersion":1}'
      );
      assert.equal(
        previous.payload_sha256,
        '59786c5adf75223e34241321256c956a7c28a7251a0e809f2f3d83580d219764'
      );
      assert.throws(function () {
        x.store.schedule(lease, job('schema-v2', 3, 100, {
          payload: { schemaVersion: 2, accountId: 1 }
        }), now);
      }, /PAYLOAD_SCHEMA_UNSUPPORTED/);
      assert.throws(function () {
        x.store.schedule(lease, job('bad-kind', 4, 100, {
          kind: 'RUN_ARBITRARY', payload: { schemaVersion: 1, accountId: 1 }
        }), now);
      }, /JOB_KIND_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('bad-priority', 5, 50), now);
      }, /JOB_PRIORITY_INVALID/);
      var huge = globalJob('large', 6);
      // `targetKey` is a known ref member.  This proves byte validation runs
      // before a later value-range rejection; an unknown `pad` must not mask it.
      huge.payload.ref.targetKey = 'x'.repeat(65_537);
      assert.throws(function () {
        x.store.schedule(lease, huge, now);
      }, /PAYLOAD_TOO_LARGE/);
      assert.throws(function () {
        x.store.schedule(lease, job('unsafe-time', -1, 100), now);
      }, /JOB_SCHEDULED_AT_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('empty-key', 7, 100, {idempotencyKey: ''}), now);
      }, /JOB_IDEMPOTENCY_KEY_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('unsafe-attempts', 8, 100, { maxAttempts: 0 }), now);
      }, /JOB_MAX_ATTEMPTS_INVALID/);
      assert.throws(function () {
        x.store.schedule(lease, job('unsafe-next', 9, 100, {
          payload: { schemaVersion: 1, accountId: 1, nextLocalAtS: -1 }
        }), now);
      }, /PAYLOAD_VALUE_INVALID/);
      var wrongPvpRef = globalJob('wrong-pvp-ref', 10);
      wrongPvpRef.payload.ref.mission = 'transport';
      assert.throws(function () {
        x.store.schedule(lease, wrongPvpRef, now);
      }, /PAYLOAD_VALUE_INVALID/);
      var wrongPvpAggregate = globalJob('wrong-pvp-aggregate', 10);
      wrongPvpAggregate.aggregateId = fixtureMatchId(Object.assign({}, wrongPvpAggregate.payload.ref, {
        fleetId: 99
      }), 2);
      assert.throws(function () {
        x.store.schedule(lease, wrongPvpAggregate, now);
      }, /JOB_AGGREGATE_INVALID/);
      var wrongExternalRef = externalGlobalJob(11);
      wrongExternalRef.payload.ref = {
        kind: 'missile', ownerAccountId: 1, missileId: 1, launchAtS: 1,
        targetKey: '1:1:1', arrivalAtS: 11, mission: 'spy'
      };
      assert.throws(function () {
        x.store.schedule(lease, wrongExternalRef, now);
      }, /PAYLOAD_VALUE_INVALID/);
      var wrongExternalAggregate = externalGlobalJob(12);
      wrongExternalAggregate.aggregateId = '2';
      assert.throws(function () {
        x.store.schedule(lease, wrongExternalAggregate, now);
      }, /JOB_AGGREGATE_INVALID/);
      var wrongExternalRevision = externalGlobalJob(13);
      wrongExternalRevision.expectedRevision = 0;
      assert.throws(function () {
        x.store.schedule(lease, wrongExternalRevision, now);
      }, /JOB_AGGREGATE_INVALID/);
      var nonCanonicalTarget = globalJob('target-leading-zero', 14);
      nonCanonicalTarget.payload.ref.targetKey = '01:1:1';
      assert.throws(function () {
        x.store.schedule(lease, nonCanonicalTarget, now);
      }, /PAYLOAD_VALUE_INVALID/);
    }, { immediate: true });
    var adversarial = [
      'token=secret-token',
      'accountId=42',
      'name="Nguyễn Bí Mật"',
      'uuid=00000000-0000-4000-8000-000000000099',
      '{"payload":{"ships":{"cruiser":30}},"state":"raw"}',
      '😀'.repeat(200)
    ].join(' ');
    var safe = x.store.safeErrorMessage(adversarial);
    assert.ok(Buffer.byteLength(safe, 'utf8') <= 256);
    assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(safe)), safe);
    assert.doesNotMatch(
      safe,
      /secret-token|42|Nguyễn|Bí Mật|00000000-|cruiser|payload|state/
    );
    assert.equal(x.store.safeErrorMessage({ token: 'x', accountId: 7 }), '[redacted-object]');
    assert.deepEqual(x.store.scrubLogEntry({
      event: 'scheduler.tick', at: 123, count: 7, budgetExhausted: false,
      code: undefined, payload: adversarial, accountId: 42
    }), {event: 'scheduler.tick', at: 123, count: 7, budgetExhausted: false});
    assert.deepEqual(x.store.scrubLogEntry({
      event: 'scheduler.error', at: 124, code: 'SQLITE_FULL', message: adversarial
    }), {event: 'scheduler.error', at: 124, code: 'SQLITE_FULL'});
    assert.throws(function () {
      x.store.scrubLogEntry({event: 'scheduler.tick', at: 1, count: -1});
    }, /SCHEDULER_LOG_COUNT_INVALID/);
    assert.throws(function () {
      x.store.scrubLogEntry({event: 'scheduler.error', at: 1, count: 1});
    }, /SCHEDULER_LOG_TICK_FIELDS_INVALID/);
  } finally { x.dong(); }
});

test('execution rejects raw payload tampering before a reducer can receive it', function () {
  var now = 500, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000051');
    var saved = x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('raw-integrity', 0, 100), now);
      return x.store.claimNext(lease, now, null, 15_000);
    }, { immediate: true });
    [
      saved.id.toUpperCase(),
      ' ' + saved.id,
      saved.id.slice(0, 14) + '1' + saved.id.slice(15),
      saved.id.slice(0, 19) + '7' + saved.id.slice(20),
      7,
      null
    ].forEach(function (invalidId) {
      assert.throws(function () {
        x.store.getById(invalidId);
      }, /SCHEDULER_JOB_ID_INVALID/);
    });
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
      .run(' '.repeat(65_537), saved.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, saved, now);
    }, /PAYLOAD_INTEGRITY/);
    var badValues = { accountId: '1', schemaVersion: 1 };
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=?,payload_sha256=? WHERE id=?')
      .run(canonicalJson(badValues), sha256(canonicalJson(badValues)), saved.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, saved, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
      .run(' {"accountId":1,"schemaVersion":1}', saved.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, saved, now);
    }, /PAYLOAD_INTEGRITY/);
    var stale = x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('stale-application-object', 0, 100), now);
      var claimed = x.store.claimNext(lease, now, null, 15_000);
      x.store.fail(lease, claimed, {code: 'SQLITE_BUSY'}, now, {
        retryBaseMs: 1_000, retryMaxMs: 300_000, maxAttempts: 8
      });
      return claimed;
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, stale, {
          effectiveAtS: 0, result: {code: 'ACCOUNT_ADVANCED'}
        }, now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
    ).get(stale.id).n, 0);
  } finally { x.dong(); }
});

test('loadReplayableJob validates a quarantined source before CLI replay copies it', function () {
  var now = 510, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000052');
    var source = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('replay-validated', 12), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=? WHERE id=?"
      ).run(now, saved.id);
      return saved;
    }, { immediate: true });
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.loadReplayableJob(lease, source.id, now).id;
    }, { immediate: true }), source.id);
    x.kho.db.prepare('UPDATE event_jobs SET payload_json=? WHERE id=?')
      .run('{not-json', source.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.loadReplayableJob(lease, source.id, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
  } finally { x.dong(); }
});

test('stored PVP and EXTERNAL rows retain source account through executable and replay validation', function () {
  var now = 21_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000053');
    [globalJob('stored-pvp-source', 20), externalGlobalJob(21)]
      .forEach(function (input, index) {
        var claimed = x.kho.trongGiaoDich(function () {
          var saved = x.store.schedule(lease, input, now);
          return x.store.claimForResolution(
            lease, saved.id, now, 15_000, {onlyEligible: true}
          );
        }, { immediate: true });
        var executable = x.kho.trongGiaoDich(function () {
          return x.store.loadExecutableJob(lease, claimed, now);
        }, { immediate: true });
        assert.equal(Number(executable.source_account_id), 1, input.kind + ' stored source');
        assert.equal(executable.payload.ref.ownerAccountId, 1, input.kind + ' executable ref');
        x.kho.db.prepare(
          "UPDATE event_jobs SET state='QUARANTINED',locked_by=NULL,locked_until_ms=NULL WHERE id=?"
        ).run(claimed.id);
        var replayable = x.kho.trongGiaoDich(function () {
          return x.store.loadReplayableJob(lease, claimed.id, now);
        }, { immediate: true });
        var replay = replayJobFrom(replayable, index === 0 ? 'pvp' : 'external');
        assert.equal(replay.sourceAccountId, 1, input.kind + ' replay source');
        assert.equal(replay.payload.ref.ownerAccountId, 1, input.kind + ' replay ref');
      });
  } finally { x.dong(); }
});

test('replay key and source identity must be canonical and equivalent', function () {
  var now = 515, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000057');
    var source = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('replay-source-check', 12), now);
      x.kho.db.prepare("UPDATE event_jobs SET state='QUARANTINED' WHERE id=?").run(saved.id);
      return saved;
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, globalJob('mismatched', 13, source.id), now);
      }, { immediate: true });
    }, /REPLAY_SOURCE_MISMATCH/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, Object.assign(globalJob('bad-nonce', 12, source.id), {
          idempotencyKey: 'manual-replay:' + source.id + ':UPPER'
        }), now);
      }, { immediate: true });
    }, /JOB_IDEMPOTENCY_KEY_INVALID/);
  } finally { x.dong(); }
});

test('duplicate external application validates canonical result before alreadyApplied', function () {
  var now = 13_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000053');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, externalGlobalJob(13), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 13,
        result: { code: 'EXTERNAL_RESOLVED' }
      }, now);
    }, { immediate: true });
    x.kho.db.prepare(
      'UPDATE event_applications SET result_json=?,result_sha256=? WHERE job_id=?'
    ).run('{bad', sha256('{bad'), claimed.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 13, result: { code: 'EXTERNAL_RESOLVED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
  } finally { x.dong(); }
});

test('PvP application shape is context-validated on first insert and duplicate replay', function () {
  var now = 13_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000055');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('application-context', 13), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 13, result: { code: 'PVP_RESOLVED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 13, result: { code: 'MATCH_INVALIDATED' }
      }, now);
    }, { immediate: true });
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.insertApplication(lease, claimed, {
        effectiveAtS: 13, result: { code: 'MATCH_INVALIDATED' }
      }, now).alreadyApplied;
    }, { immediate: true }), true);
  } finally { x.dong(); }
});

test('application duplicate rejects tampered canonical result identity and replay linkage', function () {
  var now = 14_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000058');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('result-integrity', 14), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 14, result: { code: 'MATCH_INVALIDATED' }
      }, now);
    }, { immediate: true });
    x.kho.db.prepare('UPDATE event_applications SET result_json=?,result_sha256=? WHERE job_id=?')
      .run('{"code":"MATCH_INVALIDATED","schemaVersion":1}', sha256('{}'), claimed.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 14, result: { code: 'MATCH_INVALIDATED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.completeApplied(lease, claimed, now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);
  } finally { x.dong(); }
});

test('application results use per-kind exact fields and cutover recovery evidence', function () {
  var now = 15_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000060');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, globalJob('cutover-evidence', 15), now);
      return x.store.claimForResolution(
        lease, saved.id, now, 15_000, {onlyEligible: true}
      );
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 15, result: { code: 'MATCH_INVALIDATED', extra: true }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 15, result: { code: 'REPLAYED' }
        }, now);
      }, { immediate: true });
    }, /PAYLOAD_INTEGRITY/, 'REPLAYED needs a replay_of_job_id');
    var evidence = {
      code: 'RECOVERED_LATEST_STATE', recoveredAtCutover: true,
      recovery: 'recovered-latest-state', originalScheduledAtS: 15, recoveredAtS: 16
    };
    x.kho.trongGiaoDich(function () {
      x.store.insertApplication(lease, claimed, { effectiveAtS: 16, result: evidence }, now);
    }, { immediate: true });
    assert.deepEqual(JSON.parse(x.kho.db.prepare(
      'SELECT result_json FROM event_applications WHERE job_id=?'
    ).get(claimed.id).result_json), evidence);
    x.kho.db.exec(
      "CREATE TEMP TRIGGER task2_completion_conflict BEFORE UPDATE OF state ON event_jobs " +
      "WHEN OLD.id='" + claimed.id + "' BEGIN SELECT RAISE(IGNORE); END"
    );
    try {
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.completeApplied(lease, claimed, now);
        }, {immediate: true});
      }, /JOB_COMPLETION_CONFLICT/);
    } finally {
      x.kho.db.exec('DROP TRIGGER task2_completion_conflict');
    }
    assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
    x.kho.trongGiaoDich(function () {
      x.store.completeApplied(lease, claimed, now);
    }, {immediate: true});
    assert.equal(x.store.getById(claimed.id).state, 'COMPLETED');
  } finally { x.dong(); }
});

test('unresolved global watermark blocks a later local wake instead of letting it cross T', function () {
  var now = 16_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000061');
    x.kho.trongGiaoDich(function () {
      var global = x.store.schedule(lease, globalJob('watermark-holds-local', 10), now);
      x.store.schedule(lease, {
        kind: 'ACCOUNT_ADVANCE', scheduledAtS: 11, priority: 100,
        idempotencyKey: 'account-advance:1:0', aggregateType: 'account', aggregateId: '1',
        expectedRevision: 0, maxAttempts: 8,
        payload: {schemaVersion: 1, accountId: 1, nextLocalAtS: 11}
      }, now);
      x.kho.db.prepare("UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?")
        .run(now + 10_000, global.id);
    }, { immediate: true });
    assert.equal(x.store.globalWatermarkS(), 10);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, x.store.globalWatermarkS(), 15_000);
    }, { immediate: true }), null);
    assert.equal(x.store.nextEligibleAtMs(now, x.store.globalWatermarkS()), now + 10_000);
  } finally { x.dong(); }
});

test('application conflict target never swallows an unrelated unique job linkage', function () {
  var now = 13_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000065');
    var claimed = x.kho.trongGiaoDich(function () {
      var saved = x.store.schedule(lease, externalGlobalJob(13), now);
      return x.store.claimForResolution(lease, saved.id, now, 15_000);
    }, {immediate: true});
    var resultJson = canonicalJson({code: 'EXTERNAL_RESOLVED'});
    x.kho.db.prepare(
      'INSERT INTO event_applications(' +
      'idempotency_key,job_id,resolves_job_id,effective_at_s,applied_at_ms,' +
      'snapshot_json,snapshot_sha256,result_json,result_sha256) ' +
      'VALUES(?,?,?,?,?,?,?,?,?)'
    ).run(
      'different-application-key', claimed.id, null, 13, now,
      null, null, resultJson, sha256(resultJson)
    );
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.insertApplication(lease, claimed, {
          effectiveAtS: 13, result: {code: 'EXTERNAL_RESOLVED'}
        }, now);
      }, {immediate: true});
    }, /UNIQUE/, 'ON CONFLICT(idempotency_key) must not absorb UNIQUE(job_id)');
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
    ).get(claimed.idempotency_key).n, 0);
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE idempotency_key=?'
    ).get('different-application-key').n, 1);
  } finally { x.dong(); }
});


test('retry and expired-running recovery use the incremented attempt exactly once', function () {
  var now = 10_000, x = taoStoreTam({ nowMs: function () { return now; } });
  var policy = { retryBaseMs: 1_000, retryMaxMs: 300_000, maxAttempts: 8 };
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000032');
    var first = x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('retry-one', 10, 100), now);
      return x.store.claimNext(lease, now, null, 15_000);
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.store.fail(lease, first, { code: 'SQLITE_BUSY', retryable: true }, now, policy);
    }, { immediate: true });
    var retried = x.store.getByIdempotencyKey(accountFixtureKey('retry-one'));
    assert.equal(retried.attempt, 1);
    assert.equal(
      Number(retried.retry_at_ms),
      now + 1_000 + x.store.deterministicJitter(retried.id, 1)
    );
    now = 30_000;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, job('stale-owner', 30, 100), now);
      }, { immediate: true });
    }, /LEASE_LOST/);
    var freshLease = layLease(x, '00000000-0000-4000-8000-000000000043');
    var running = x.kho.trongGiaoDich(function () {
      x.store.schedule(freshLease, job('recover-one', 30, 100), now);
      return x.store.claimNext(freshLease, now, null, 15_000);
    }, { immediate: true });
    assert.equal(running.locked_by, freshLease.ownerId);
    assert.equal(Number(running.locked_until_ms), 45_000);
    now = 45_000;
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.acquireLease('00000000-0000-4000-8000-000000000044', now, 15_000);
    }, { immediate: true }), null);
    now = 45_001;
    var recoveryLease = layLease(x, '00000000-0000-4000-8000-000000000044');
    assert.ok(recoveryLease.generation > freshLease.generation);
    x.kho.trongGiaoDich(function () {
      x.store.recoverExpiredRunning(recoveryLease, now, policy);
    }, { immediate: true });
    var recovered = x.store.getByIdempotencyKey(running.idempotency_key);
    assert.equal(recovered.attempt, 1);
    assert.equal(
      Number(recovered.retry_at_ms),
      now + 1_000 + x.store.deterministicJitter(recovered.id, 1)
    );
  } finally { x.dong(); }
});

test('nextEligibleAtMs and statusSnapshot expose only aggregate scheduling data', function () {
  var now = 10_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000034');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('eligible-pending', 12, 100), now);
      x.store.schedule(lease, job('later-pending', 13, 100), now);
    }, { immediate: true });
    assert.equal(x.store.nextEligibleAtMs(now, null), 12_000);
    var status = x.store.statusSnapshot(now);
    assert.equal(status.pending, 2);
    assert.equal(status.nextEligibleAtMs, 12_000);
    assert.equal(Object.hasOwn(status, 'jobId'), false);
    assert.equal(Object.hasOwn(status, 'payload'), false);
  } finally { x.dong(); }
});



test('local cancellation is idempotent while global cancellation is refused', function () {
  var now = 50, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000033');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('cancel-local', 1, 100), now);
      var global = x.store.schedule(lease, globalJob('cancel-global', 1), now);
      x.store.cancel(lease, accountFixtureKey('cancel-local'), 'SUPERSEDED', now);
      x.store.cancel(lease, accountFixtureKey('cancel-local'), 'SUPERSEDED', now);
      assert.throws(function () {
        x.store.cancel(lease, global.idempotency_key, 'OPERATOR_CANCELLED', now);
      }, /GLOBAL_CANCEL_FORBIDDEN/);
      assert.throws(function () {
        x.store.cancel(lease, accountFixtureKey('cancel-local'), 'free-text', now);
      }, /CANCEL_REASON_INVALID/);
    }, { immediate: true });
    assert.equal(x.store.getByIdempotencyKey(accountFixtureKey('cancel-local')).state, 'CANCELLED');
    x.kho.trongGiaoDich(function () {
      x.store.schedule(lease, job('cancel-application', 0, 100), now);
      var claimed = x.store.claimNext(lease, now, null, 15_000);
      assert.throws(function () {
        x.store.completeApplied(lease, claimed, now);
      }, /APPLICATION_REQUIRED/);
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 0, result: {code: 'STALE_REVISION'}
      }, now);
      assert.throws(function () {
        x.store.completeApplied(lease, claimed, now);
      }, /JOB_COMPLETION_RESULT_INVALID/);
      assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
      x.store.finishResolved(lease, claimed, 'CANCELLED', 'STALE_REVISION', now);
    }, {immediate: true});
  } finally { x.dong(); }
});

test('quarantined global resolution claims, locks, applies, then reaches CANCELLED', function () {
  var now = 80, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000037');
    var source = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, globalJob('resolve-root', 9), now);
    }, { immediate: true });
    x.kho.trongGiaoDich(function () {
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
        "error_code='PAYLOAD_INTEGRITY',error_message_safe='safe' WHERE id=?"
      ).run(now, source.id);
      assert.equal(x.store.globalWatermarkS(), 9);
      var claimed = x.store.claimForResolution(lease, source.id, now, 15_000, {
        allowQuarantined: true
      });
      assert.equal(claimed.state, 'RUNNING');
      assert.equal(claimed.locked_by, lease.ownerId);
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 9,
        result: { code: 'MATCH_INVALIDATED' }
      }, now);
      assert.throws(function () {
        x.store.completeApplied(lease, claimed, now);
      }, /JOB_COMPLETION_RESULT_INVALID/);
      assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
      x.store.finishResolved(
        lease,
        claimed,
        'CANCELLED',
        'MATCH_INVALIDATED',
        now
      );
    }, { immediate: true });
    assert.equal(x.store.getByIdempotencyKey(source.idempotency_key).state, 'CANCELLED');
    assert.equal(x.store.globalWatermarkS(), null);
    assert.equal(
      x.kho.db.prepare('SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?').get(source.id).n,
      1
    );
  } finally { x.dong(); }
});

test('pending global terminalization requires a claimed immutable application', function () {
  var now = 90, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000045');
    var source = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, globalJob('pending-orphan', 10), now);
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, source.id, now, 15_000);
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'default resolution claim obeys scheduled time');
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, source.id, now, 15_000, {allowFuturePending: true}
      );
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: Number(source.scheduled_at_s),
        result: {code: 'MATCH_INVALIDATED'}
      }, now);
      x.store.finishResolved(lease, claimed, 'CANCELLED', 'MATCH_INVALIDATED', now);
    }, { immediate: true });
    assert.equal(x.store.getById(source.id).state, 'CANCELLED');
    assert.equal(x.store.globalWatermarkS(), null);
    assert.equal(x.kho.db.prepare(
      'SELECT COUNT(*) AS n FROM event_applications WHERE job_id=?'
    ).get(source.id).n, 1);

    function claimedWithApplication(input, result) {
      return x.kho.trongGiaoDich(function () {
        var saved = x.store.schedule(lease, input, now);
        var claimed = x.store.claimForResolution(lease, saved.id, now, 15_000, {
          allowFuturePending: true
        });
        if (result) {
          x.store.insertApplication(lease, claimed, {
            effectiveAtS: Number(saved.scheduled_at_s), result: result
          }, now);
        }
        return claimed;
      }, {immediate: true});
    }

    var missing = claimedWithApplication(job('terminal-missing-app', 0, 100), null);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, missing, 'CANCELLED', 'STALE_REVISION', now);
      }, {immediate: true});
    }, /APPLICATION_REQUIRED/);

    var staleRow = claimedWithApplication(job('terminal-stale-row', 0, 100), null);
    x.kho.db.prepare(
      "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?"
    ).run(now + 1_000, staleRow.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, staleRow, 'CANCELLED', 'STALE_REVISION', now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);

    var corrupt = claimedWithApplication(
      globalJob('terminal-corrupt-app', 11), {code: 'MATCH_INVALIDATED'}
    );
    x.kho.db.prepare(
      'UPDATE event_applications SET result_json=?,result_sha256=? WHERE job_id=?'
    ).run('{bad', sha256('{bad'), corrupt.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, corrupt, 'CANCELLED', 'MATCH_INVALIDATED', now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);

    var success = claimedWithApplication(
      externalGlobalJob(12), {code: 'EXTERNAL_RESOLVED'}
    );
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, success, 'COMPLETED', 'free-text', now);
      }, {immediate: true});
    }, /JOB_TERMINAL_STATE_INVALID/, 'state validation has first precedence');
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, success, 'CANCELLED', 'free-text', now);
      }, {immediate: true});
    }, /JOB_TERMINAL_REASON_INVALID/, 'reason validation precedes lease and row reads');
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(
          {ownerId: lease.ownerId, generation: lease.generation + 1},
          success,
          'CANCELLED',
          'MATCH_INVALIDATED',
          now
        );
      }, {immediate: true});
    }, /LEASE_LOST/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.finishResolved(lease, success, 'CANCELLED', 'MATCH_INVALIDATED', now);
      }, {immediate: true});
    }, /JOB_TERMINAL_RESULT_MISMATCH/, 'a success application cannot cancel a job');

    [
      {
        input: job('terminal-mismatch-stale', 0, 100),
        result: {code: 'MATCH_INVALIDATED'}, reason: 'STALE_REVISION'
      },
      {
        input: globalJob('terminal-mismatch-match', 13),
        result: {code: 'ENTITY_REMOVED'}, reason: 'MATCH_INVALIDATED'
      },
      {
        input: globalJob('terminal-mismatch-entity', 14),
        result: {code: 'MATCH_INVALIDATED'}, reason: 'ENTITY_REMOVED'
      },
      {
        input: globalJob('terminal-mismatch-operator', 15),
        result: {code: 'MATCH_INVALIDATED'}, reason: 'OPERATOR_CONFIRMED_INVALID'
      }
    ].forEach(function (example) {
      var claimed = claimedWithApplication(example.input, example.result);
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.finishResolved(lease, claimed, 'CANCELLED', example.reason, now);
        }, {immediate: true});
      }, /JOB_TERMINAL_RESULT_MISMATCH/, example.reason);
      assert.equal(x.store.getById(claimed.id).state, 'RUNNING');
    });

    var conflict = claimedWithApplication(
      globalJob('terminal-conflict', 16), {code: 'MATCH_INVALIDATED'}
    );
    x.kho.db.exec(
      "CREATE TEMP TRIGGER task2_terminal_conflict BEFORE UPDATE OF state ON event_jobs " +
      "WHEN OLD.id='" + conflict.id + "' BEGIN SELECT RAISE(IGNORE); END"
    );
    try {
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.finishResolved(lease, conflict, 'CANCELLED', 'MATCH_INVALIDATED', now);
        }, {immediate: true});
      }, /JOB_TERMINAL_CONFLICT/);
    } finally {
      x.kho.db.exec('DROP TRIGGER task2_terminal_conflict');
    }
    assert.equal(x.store.getById(conflict.id).state, 'RUNNING');
  } finally { x.dong(); }
});

test(
  'resolution claim enforces strict unlock and future capability never bypasses retry time',
  function () {
  var now = 20_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000064');
    var locked = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, globalJob('locked-resolution', 20), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET locked_by='other',locked_until_ms=? WHERE id=?"
      ).run(now + 1, row.id);
      return row;
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, locked.id, now, 15_000);
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'an active lock is not claimable');
    now += 1;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, locked.id, now, 15_000);
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'lock expiry equality remains locked');
    now += 1;
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimForResolution(lease, locked.id, now, 15_000).id;
    }, {immediate: true}), locked.id, 'one millisecond past expiry is claimable');

    var futureRetry = x.kho.trongGiaoDich(function () {
      var row = x.store.schedule(lease, globalJob('future-retry', 20), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?"
      ).run(now + 10_000, row.id);
      return row;
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.claimForResolution(lease, futureRetry.id, now, 15_000, {
          allowFuturePending: true
        });
      }, {immediate: true});
    }, /JOB_RESOLUTION_CLAIM_INVALID/, 'future retry never uses the pending-only bypass');
  } finally { x.dong(); }
  }
);

test('terminal replay atomically resolves the quarantined forensic source only after its application', function () {
  var now = 11_000, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000049');
    x.kho.trongGiaoDich(function () {
      var source = x.store.schedule(lease, globalJob('replay-source', 11), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=?," +
        "error_code='PAYLOAD_INTEGRITY',error_message_safe='safe' WHERE id=?"
      ).run(now, source.id);
      var replay = x.store.schedule(lease, replayJobFrom(source, 'fixture-replay'), now);
      var claimed = x.store.claimForResolution(lease, replay.id, now, 15_000);
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 11,
        resolvesJobId: source.id,
        result: { code: 'REPLAYED' }
      }, now);
      assert.equal(x.store.globalWatermarkS(), 11, 'application alone does not release the source');
      x.store.completeApplied(lease, claimed, now);
      var resolved = x.store.getById(source.id);
      assert.equal(resolved.state, 'CANCELLED');
      assert.equal(resolved.resolved_by_job_id, replay.id);
      assert.equal(resolved.error_code, 'PAYLOAD_INTEGRITY');
    }, { immediate: true });
    assert.equal(x.store.globalWatermarkS(), null);
  } finally { x.dong(); }
});

function taoDqChoReconcile(x, accountId, revision) {
  x.kho.db.prepare(
    'INSERT INTO tk(id,ten,hienthi,mk,muoi,tao,vaoCuoi) VALUES(?,?,?,?,?,?,?)'
  ).run(accountId, 'reconcile' + accountId, 'Reconcile ' + accountId, 'h', 's', 1, 1);
  x.kho.db.prepare(
    'INSERT INTO dq(tk,state,diem,diemCT,diemNC,diemHam,diemThu,lastTick,keTiep,' +
    'lm,soHT,capNhat,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(accountId, '{"v":1}', 0, 0, 0, 0, 0, 1, 10, null, 0, 1, revision);
}
test('only the lease-owned reconcile constructor admits expected revision minus one', function () {
  var now = 530, x = taoStoreTam({ nowMs: function () { return now; } });
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000059');
    taoDqChoReconcile(x, 1, 0);
    var reconcile = job('private-template', 10, 200, {
      aggregateId: '1', expectedRevision: -1,
      payload: { schemaVersion: 1, accountId: 1, reconcile: true, reconcileRevision: 0 }
    });
    x.kho.trongGiaoDich(function () {
      assert.throws(function () { x.store.schedule(lease, reconcile, now); }, /RECONCILE_JOB_FORBIDDEN/);
      var saved = x.store.scheduleReconcileAccountAdvance(lease, reconcile, now);
      assert.equal(saved.expected_revision, -1);
      assert.equal(saved.priority, 200);
      assert.equal(saved.idempotency_key,
        'reconcile:account:1:0:' + saved.sequence + ':10');
      var kept = x.store.ensureReconcileAccountAdvance(lease, reconcile, now);
      assert.equal(kept.id, saved.id);
      assert.equal(x.kho.db.prepare(
        "SELECT COUNT(*) AS n FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
        "AND aggregate_id='1' AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
      ).get().n, 1);
    }, { immediate: true });
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.scheduleReconcileAccountAdvance(lease, Object.assign({}, reconcile, {
          idempotencyKey: 'account-advance:1:10', priority: 100
        }), now);
      }, { immediate: true });
    }, /RECONCILE_JOB_FORBIDDEN/);
  } finally { x.dong(); }
});

test('metadata sequence is monotonic across terminal rows, restart, and rollback', function () {
  var now = 540, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000060');
    var first = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:1', 1, 100), now);
    }, {immediate: true});
    x.kho.db.prepare("UPDATE event_jobs SET state='COMPLETED' WHERE id=?").run(first.id);
    x.kho.db.prepare('DELETE FROM event_jobs WHERE id=?').run(first.id);
    var second = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:2', 2, 100), now);
    }, {immediate: true});
    assert.ok(Number(second.sequence) > Number(first.sequence));
    var persisted = x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, job('account-advance:1:3', 3, 100), now);
        throw new Error('rollback sequence');
      }, {immediate: true});
    }, /rollback sequence/);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, persisted);
    x.kho.dong();
    x.kho = new Kho(x.file);
    x.store = newSchedulerStore(x.kho, {nowMs: function () { return now; }});
    var afterRestart = x.kho.trongGiaoDich(function () {
      return x.store.schedule(lease, job('account-advance:1:3', 3, 100), now);
    }, {immediate: true});
    assert.ok(Number(afterRestart.sequence) > Number(second.sequence));
  } finally { x.dong(); }
});

test('reconcile keeps one RUNNING continuation and supersedes every live sibling', function () {
  var now = 535, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000062');
    taoDqChoReconcile(x, 1, 0);
    var template = job('private-template-running', 10, 200, {
      aggregateId: '1', expectedRevision: -1,
      payload: {schemaVersion: 1, accountId: 1, reconcile: true, reconcileRevision: 0}
    });
    x.kho.trongGiaoDich(function () {
      var running = x.store.scheduleReconcileAccountAdvance(lease, template, now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RUNNING',locked_by=?,locked_generation=?,locked_until_ms=? WHERE id=?"
      ).run(lease.ownerId, lease.generation, now + 15_000, running.id);
      x.store.scheduleReconcileAccountAdvance(lease, Object.assign({}, template, {
        scheduledAtS: 11,
        payload: Object.assign({}, template.payload, {nextLocalAtS: 11})
      }), now);
      assert.equal(x.store.ensureReconcileAccountAdvance(lease, template, now).id, running.id);
    }, {immediate: true});
    assert.equal(x.kho.db.prepare(
      "SELECT COUNT(*) AS n FROM event_jobs WHERE aggregate_id='1' AND state IN ('PENDING','RETRY_WAIT','RUNNING')"
    ).get().n, 1);
  } finally { x.dong(); }
});

test('load boundary, local wake identity, and command adoption reject stale or future rows', function () {
  var now = 100_000;
  var x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000061');
    taoDqChoReconcile(x, 1, 3);
    var local = x.kho.trongGiaoDich(function () {
      return x.store.replaceAccountAdvance(lease, 1, 3, 99, now);
    }, {immediate: true});
    assert.equal(local.source_account_id, null);
    [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null].forEach(function (accountId) {
      assert.throws(function () {
        x.kho.trongGiaoDich(function () {
          x.store.adoptAccountAdvanceForCommand(lease, accountId, 99, now, 15_000);
        }, {immediate: true});
      }, /ACCOUNT_ADVANCE_ADOPTION_INVALID/);
      assert.equal(x.store.getById(local.id).state, 'PENDING');
    });
    var tooEarly = x.kho.trongGiaoDich(function () {
      return x.store.adoptAccountAdvanceForCommand(lease, 1, 98, now, 15000);
    }, {immediate: true});
    assert.equal(tooEarly, null);
    var running = x.kho.trongGiaoDich(function () {
      return x.store.adoptAccountAdvanceForCommand(lease, 1, 99, now, 15000);
    }, {immediate: true});
    var executable = x.kho.trongGiaoDich(function () {
      return x.store.loadExecutableJob(lease, running, now);
    }, {immediate: true});
    assert.equal(executable.id, running.id);
    x.kho.db.prepare("UPDATE event_jobs SET locked_generation=locked_generation+1 WHERE id=?")
      .run(running.id);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.loadExecutableJob(lease, running, now);
      }, {immediate: true});
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET locked_generation=? WHERE id=?')
      .run(lease.generation, running.id);
    x.kho.db.prepare("UPDATE event_jobs SET locked_by='other' WHERE id=?").run(running.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET locked_by=?,locked_until_ms=? WHERE id=?')
      .run(lease.ownerId, now, running.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=?,state=? WHERE id=?')
      .run(now + 15_000, 'RETRY_WAIT', running.id);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /PAYLOAD_INTEGRITY/);
    x.kho.db.prepare("UPDATE event_jobs SET state='RUNNING' WHERE id=?").run(running.id);
    x.kho.db.prepare(
      "UPDATE scheduler_lease SET expires_at_ms=? WHERE lease_name='global-writer'"
    ).run(now);
    assert.throws(function () {
      x.store.loadExecutableJob(lease, running, now);
    }, /LEASE_LOST/);
    x.kho.db.prepare(
      "UPDATE scheduler_lease SET expires_at_ms=? WHERE lease_name='global-writer'"
    ).run(now + 15_000);
  } finally { x.dong(); }
});

test('global dependency blocks account selection across retry quarantine and restart', function () {
  var now = 100_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000064');
    taoDqChoReconcile(x, 1, 3);
    var pair = x.kho.trongGiaoDich(function () {
      var local = x.store.replaceAccountAdvance(lease, 1, 3, 90, now);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(1), true,
        'ordinary PENDING is an actual null-replacement write');
      var global = x.store.schedule(lease, globalJob('ignored', 100), now);
      var adopted = x.store.adoptAccountAdvanceForCommand(lease, 1, 100, now, 15_000);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(1), false,
        'RUNNING continuation is not superseded by null replacement');
      x.store.blockOwnedAccountAdvance(lease, adopted, 3, global.id, now);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(1), false,
        'blocked PENDING triggers replaceAccountAdvance early-return parity');
      return {local: x.store.getById(local.id), global: global};
    }, {immediate: true});
    assert.equal(pair.local.state, 'PENDING');
    assert.equal(pair.local.blocked_by_job_id, pair.global.id);
    var derivedJobs = x.store.listDerivedJobsForAccount(lease, 1, now);
    assert.deepEqual(derivedJobs.map(function (row) { return row.id; }), [pair.global.id]);
    assert.equal(derivedJobs[0].logical_root_id, pair.global.id);
    taoDqChoReconcile(x, 2, 3);
    x.kho.trongGiaoDich(function () {
      var retry = x.store.replaceAccountAdvance(lease, 2, 3, 90, now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='RETRY_WAIT',retry_at_ms=? WHERE id=?"
      ).run(now + 1_000, retry.id);
      assert.equal(x.store.wouldReplaceAccountAdvanceWithNoWake(2), true,
        'ordinary unblocked RETRY_WAIT is superseded by null replacement');
      x.store.replaceAccountAdvance(lease, 2, 3, null, now);
      assert.equal(x.store.getById(retry.id).state, 'CANCELLED');
    }, {immediate: true});
    var sequenceBeforeSibling = x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value;
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.schedule(lease, job('blocked-public-sibling', 91, 100, {
          aggregateId: '1', expectedRevision: 4,
          payload: {schemaVersion: 1, accountId: 1}
        }), now);
      }, {immediate: true});
    }, /ACCOUNT_ADVANCE_DEPENDENCY_BLOCKED/);
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.scheduleReconcileAccountAdvance(lease, job('unused', 92, 200, {
          aggregateId: '1', expectedRevision: -1,
          payload: {schemaVersion: 1, accountId: 1,
            reconcile: true, reconcileRevision: 3}
        }), now);
      }, {immediate: true});
    }, /ACCOUNT_ADVANCE_DEPENDENCY_BLOCKED/);
    assert.equal(x.kho.db.prepare(
      "SELECT value FROM scheduler_meta WHERE key='sequence'"
    ).get().value, sequenceBeforeSibling, 'rejected siblings allocate no sequence');
    assert.equal(x.store.nextAccountEligibleAtMs(100), null);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, 100, 15_000);
    }, {immediate: true}), null);
    x.kho.dong();
    x.kho = new Kho(x.file);
    x.store = newSchedulerStore(x.kho, {nowMs: function () { return now; }});
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, pair.global.id, now, 15_000, {onlyEligible: true, nowS: 100}
      );
      x.store.fail(lease, claimed, Object.assign(new Error('later'),
        {code: 'ETIMEDOUT'}), now,
      {retryBaseMs: 1, retryMaxMs: 10, maxAttempts: 8});
    }, {immediate: true});
    assert.equal(x.store.getById(pair.local.id).blocked_by_job_id, pair.global.id);
    now = Number(x.store.getById(pair.global.id).retry_at_ms);
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, pair.global.id, now, 15_000, {onlyEligible: true, nowS: 100}
      );
      x.store.fail(lease, claimed, new Error('poison'), now,
        {retryBaseMs: 1, retryMaxMs: 10, maxAttempts: 8});
    }, {immediate: true});
    assert.equal(x.store.getById(pair.global.id).state, 'QUARANTINED');
    assert.equal(x.store.getById(pair.local.id).attempt, 0);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, 100, 15_000);
    }, {immediate: true}), null);
    x.kho.trongGiaoDich(function () {
      var claimed = x.store.claimForResolution(
        lease, pair.global.id, now, 15_000, {allowQuarantined: true}
      );
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 100,
        result: {code: 'OPERATOR_CONFIRMED_INVALID'}
      }, now);
      x.store.finishResolved(
        lease, claimed, 'CANCELLED', 'OPERATOR_CONFIRMED_INVALID', now
      );
    }, {immediate: true});
    assert.equal(x.store.getById(pair.local.id).blocked_by_job_id, null);
    assert.equal(x.kho.trongGiaoDich(function () {
      return x.store.claimNext(lease, now, 100, 15_000);
    }, {immediate: true}).id, pair.local.id);
  } finally { x.dong(); }
});

test('dependency integrity rejects a raw live account sibling at startup', function () {
  var now = 101_000, x = taoStoreTam({nowMs: function () { return now; }});
  try {
    var lease = layLease(x, '00000000-0000-4000-8000-000000000096');
    taoDqChoReconcile(x, 1, 3);
    x.kho.trongGiaoDich(function () {
      var primary = x.store.schedule(lease, job('dependency-primary', 99, 100, {
        aggregateId: '1', expectedRevision: 3,
        payload: {schemaVersion: 1, accountId: 1}
      }), now);
      var sibling = x.store.schedule(lease, job('dependency-corrupt-sibling', 100, 100, {
        aggregateId: '1', expectedRevision: 2,
        payload: {schemaVersion: 1, accountId: 1}
      }), now);
      var parent = x.store.schedule(lease, globalJob('ignored', 101), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='CANCELLED',cancel_reason='SUPERSEDED'," +
        "cancelled_at_ms=? WHERE id=?"
      ).run(now, sibling.id);
      var adopted = x.store.adoptAccountAdvanceForCommand(lease, 1, 101, now, 15_000);
      assert.equal(adopted.id, primary.id);
      x.store.blockOwnedAccountAdvance(lease, adopted, 3, parent.id, now);
      // Simulate persisted corruption that bypassed Store before restart.
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='PENDING',cancel_reason=NULL,cancelled_at_ms=NULL " +
        "WHERE id=?"
      ).run(sibling.id);
    }, {immediate: true});
    assert.throws(function () {
      x.kho.trongGiaoDich(function () {
        x.store.assertAccountDependencyIntegrity(lease, now);
      }, {immediate: true});
    }, /ACCOUNT_ADVANCE_DEPENDENCY_CORRUPT/);
  } finally { x.dong(); }
});

test('every Store transition conditions on the current owner generation', function () {
  var now = 8000;
  function mutationSnapshot(x) {
    return JSON.stringify([
      x.kho.db.prepare('SELECT * FROM scheduler_lease ORDER BY lease_name').all(),
      x.kho.db.prepare('SELECT * FROM scheduler_meta ORDER BY key').all(),
      x.kho.db.prepare('SELECT * FROM event_jobs ORDER BY sequence,id').all(),
      x.kho.db.prepare('SELECT * FROM event_applications ORDER BY idempotency_key').all(),
      x.kho.db.prepare('SELECT * FROM scheduler_audit ORDER BY id').all()
    ]);
  }
  function withLeaseLossBefore(x, matcher, label, mutation) {
    var db = x.kho.db;
    var originalPrepare = db.prepare;
    var fired = false;
    db.prepare = function (sql) {
      var statement = originalPrepare.call(db, sql);
      var normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (fired || !matcher.test(normalized)) return statement;
      return new Proxy(statement, {
        get: function (target, property) {
          var member = target[property];
          if (property !== 'run' && property !== 'get') {
            return typeof member === 'function' ? member.bind(target) : member;
          }
          return function () {
            fired = true;
            originalPrepare.call(db,
              "UPDATE scheduler_lease SET generation=generation+1 " +
              "WHERE lease_name='global-writer'"
            ).run();
            return member.apply(target, arguments);
          };
        }
      });
    };
    try {
      return mutation();
    } finally {
      db.prepare = originalPrepare;
      assert.equal(fired, true, label + ' reached its target mutation SQL');
    }
  }
  function pendingLocal(x, lease) {
    return x.store.schedule(lease, job('account-advance:1:0', 8, 100), now);
  }
  function runningLocal(x, lease) {
    var saved = pendingLocal(x, lease);
    return x.store.claimForResolution(lease, saved.id, now, 15_000, {nowS: 8});
  }
  function runningGlobal(x, lease, atS) {
    var saved = x.store.schedule(lease, globalJob('lease-fence-global', atS), now);
    return x.store.claimForResolution(lease, saved.id, now, 15_000, {nowS: atS});
  }
  function prove(label, matcher, setup, mutation) {
    var x = taoStoreTam({nowMs: function () { return now; }});
    try {
      var lease = layLease(x, '00000000-0000-4000-8000-000000000062');
      var context = x.kho.trongGiaoDich(function () {
        return setup ? setup(x, lease) : null;
      }, {immediate: true});
      var before = mutationSnapshot(x);
      var caught = null;
      try {
        x.kho.trongGiaoDich(function () {
          return withLeaseLossBefore(x, matcher, label, function () {
            return mutation(x, lease, context);
          });
        }, {immediate: true});
      } catch (error) {
        caught = error;
      }
      assert.equal(mutationSnapshot(x), before, label + ' changes zero target rows');
      assert.match(String(caught && (caught.code || caught.message)), /LEASE_LOST/, label);
    } finally { x.dong(); }
  }
  function validApplication(x, lease, claimed, result) {
    x.store.insertApplication(lease, claimed, {
      effectiveAtS: Number(claimed.scheduled_at_s), result: result
    }, now);
    return claimed;
  }
  var retryPolicy = {retryBaseMs: 1000, retryMaxMs: 300000, maxAttempts: 8};

  // These cases cover every non-lease mutation statement. Reconcile scheduling
  // composes sequence allocation, job insert, and local cancellation;
  // completeAccountAdvanceAndScheduleSuccessor composes completion and replacement;
  // claimGlobalForInvalidation composes explicit claim; resolveDeletedAccountJobs
  // composes deletion cancellation. Acquire/renew/release have dedicated cases above.

  prove('sequence allocation', /^UPDATE scheduler_meta SET value=CAST/, null,
    function (x, lease) { x.store._allocateSequence(lease, now); });
  prove('job insert', /^INSERT INTO event_jobs\(/, null,
    function (x, lease) { x.store.schedule(lease, job('account-advance:1:0', 8, 100), now); });
  prove('effective time metadata', /^INSERT INTO scheduler_meta.*'effective_now_ms'/, null,
    function (x, lease) { x.store.recordEffectiveNowMs(lease, now); });
  prove('claimNext', /^WITH candidate AS .*UPDATE event_jobs SET state='RUNNING'/,
    pendingLocal, function (x, lease) { x.store.claimNext(lease, now, null, 15_000); });
  prove('claimForResolution', /^WITH live_lease AS .*UPDATE event_jobs SET state='RUNNING'/,
    function (x, lease) { return x.store.schedule(lease, globalJob('claim-fence', 8), now); },
    function (x, lease, saved) {
      x.store.claimForResolution(lease, saved.id, now, 15_000, {nowS: 8});
    });
  prove('resumeOwnedRunning', /^UPDATE event_jobs SET locked_until_ms=/, runningLocal,
    function (x, lease, claimed) {
      x.store.resumeOwnedRunning(lease, claimed.id, now, 15_000);
    });
  prove('application insert', /^INSERT INTO event_applications\(/, runningLocal,
    function (x, lease, claimed) {
      x.store.insertApplication(lease, claimed, {
        effectiveAtS: 8, result: {code: 'ACCOUNT_ADVANCED'}
      }, now);
    });
  prove('partial checkpoint', /^UPDATE event_jobs SET checkpoint_revision=/,
    function (x, lease) {
      taoDqChoReconcile(x, 1, 0);
      return runningLocal(x, lease);
    }, function (x, lease, claimed) { x.store.checkpointPartial(lease, claimed, 0, now); });
  prove('durable mutation metadata', /^INSERT INTO scheduler_meta.*durable_first_mutation/, null,
    function (x, lease) { x.store.markDurableMutation(lease, now); });
  prove('replay source terminalization', /^UPDATE event_jobs SET state='CANCELLED'.*RESOLVED_BY_REPLAY/,
    function (x, lease) {
      var source = x.store.schedule(lease, globalJob('replay-fence', 8), now);
      x.kho.db.prepare(
        "UPDATE event_jobs SET state='QUARANTINED',quarantined_at_ms=? WHERE id=?"
      ).run(now, source.id);
      var child = x.store.schedule(lease, replayJobFrom(source, 'lease-fence'), now);
      var claimed = x.store.claimForResolution(lease, child.id, now, 15_000, {nowS: 8});
      return validApplication(x, lease, claimed, {code: 'REPLAYED'});
    }, function (x, lease, child) { x.store.terminalizeReplaySource(lease, child, now); });
  prove('successful completion', /^UPDATE event_jobs SET state='COMPLETED'/,
    function (x, lease) {
      return validApplication(x, lease, runningLocal(x, lease), {code: 'ACCOUNT_ADVANCED'});
    }, function (x, lease, claimed) { x.store.completeApplied(lease, claimed, now); });
  prove('explicit cancellation', /^UPDATE event_jobs SET state='CANCELLED'.*cancel_reason=\?/,
    function (x, lease) {
      return validApplication(x, lease, runningLocal(x, lease), {code: 'STALE_REVISION'});
    }, function (x, lease, claimed) {
      x.store.finishResolved(lease, claimed, 'CANCELLED', 'STALE_REVISION', now);
    });
  prove('transient failure', /^UPDATE event_jobs SET state='RETRY_WAIT'/, runningLocal,
    function (x, lease, claimed) {
      x.store.fail(lease, claimed, {code: 'SQLITE_BUSY'}, now, retryPolicy);
    });
  prove('quarantine failure', /^UPDATE event_jobs SET state='QUARANTINED'/, runningLocal,
    function (x, lease, claimed) {
      x.store.fail(lease, claimed, new Error('poison'), now, retryPolicy);
    });
  prove('expired-running retry recovery', /^UPDATE event_jobs SET state='RETRY_WAIT'/,
    function (x, lease) {
      var claimed = runningLocal(x, lease);
      x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?').run(now, claimed.id);
      return claimed;
    }, function (x, lease) { x.store.recoverExpiredRunning(lease, now, retryPolicy); });
  prove('expired-running quarantine recovery', /^UPDATE event_jobs SET state='QUARANTINED'/,
    function (x, lease) {
      var claimed = runningLocal(x, lease);
      x.kho.db.prepare('UPDATE event_jobs SET locked_until_ms=? WHERE id=?').run(now, claimed.id);
      return claimed;
    }, function (x, lease) {
      x.store.recoverExpiredRunning(lease, now, {
        retryBaseMs: 1000, retryMaxMs: 300000, maxAttempts: 1
      });
    });
  prove('local cancellation', /^UPDATE event_jobs SET state='CANCELLED',cancel_reason=\?/,
    pendingLocal, function (x, lease) {
      x.store.cancel(lease, 'account-advance:1:0', 'SUPERSEDED', now);
    });
  prove('audit insert', /^INSERT INTO scheduler_audit\(/, null,
    function (x, lease) { x.store.writeAudit(lease, 'CUTOVER', null, 'fence', now); });
  prove('command adoption', /^WITH live_lease AS .*candidate AS .*UPDATE event_jobs/,
    pendingLocal, function (x, lease) {
      x.store.adoptAccountAdvanceForCommand(lease, 1, 8, now, 15_000);
    });
  prove('account replacement cancellation', /^UPDATE event_jobs SET state='CANCELLED'.*SUPERSEDED/,
    pendingLocal, function (x, lease) {
      x.store.replaceAccountAdvance(lease, 1, 0, null, now);
    });
  prove('account dependency block', /^UPDATE event_jobs SET state='PENDING',checkpoint_revision=/,
    function (x, lease) {
      taoDqChoReconcile(x, 1, 0);
      return {local: runningLocal(x, lease), global: x.store.schedule(
        lease, globalJob('block-fence', 8), now
      )};
    }, function (x, lease, rows) {
      x.store.blockOwnedAccountAdvance(lease, rows.local, 0, rows.global.id, now);
    });
  prove('blocked dependency release', /^UPDATE event_jobs SET blocked_by_job_id=NULL/,
    function (x, lease) {
      taoDqChoReconcile(x, 1, 0);
      var terminal = validApplication(
        x, lease, runningGlobal(x, lease, 8), {code: 'MATCH_INVALIDATED'}
      );
      x.store.finishResolved(lease, terminal, 'CANCELLED', 'MATCH_INVALIDATED', now);
      var local = pendingLocal(x, lease);
      x.kho.db.prepare('UPDATE event_jobs SET blocked_by_job_id=? WHERE id=?')
        .run(terminal.id, local.id);
      return terminal;
    }, function (x, lease, terminal) {
      x.store.releaseBlockedAccountDependents(lease, terminal.id, now);
    });
  prove('global barrier park', /^UPDATE event_jobs SET state='PENDING',locked_by=NULL/,
    function (x, lease) {
      var preceding = x.store.schedule(lease, globalJob('preceding-fence', 7), now);
      return {preceding: preceding, running: runningGlobal(x, lease, 8)};
    }, function (x, lease, rows) {
      x.store.parkGlobalBehindPreceding(lease, rows.running, rows.preceding.id, 8, now);
    });
  prove('deleted-account local cancellation',
    /^UPDATE event_jobs SET state='CANCELLED'.*ENTITY_REMOVED/,
    pendingLocal, function (x, lease) {
      x.store.cancelAccountAdvancesForDeletion(lease, 1, now);
    });
});

test('assembled migration and Store lease smoke uses the real current columns', function () {
  var now = 9000, x = taoKhoTam();
  try {
    apDungMigrationScheduler(x.kho, now);
    var store = newSchedulerStore(x.kho, {nowMs: function () { return now; }});
    var token = x.kho.trongGiaoDich(function () {
      return store.acquireLease('00000000-0000-4000-8000-000000000063', now, 15_000);
    }, {immediate: true});
    assert.ok(token);
    assert.equal(x.kho.db.prepare(
      "SELECT heartbeat_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
    ).get().heartbeat_at_ms, now);
    assert.equal(x.kho.trongGiaoDich(function () {
      return store.renewLease(token, now + 1, 15_000);
    }, {immediate: true}), true);
    assert.equal(x.kho.trongGiaoDich(function () {
      return store.releaseLease(token, now + 2);
    }, {immediate: true}), true);
  } finally { dongKhoTam(x); }
});
// END TASK2_TEST_APPEND
```

Before RED, mechanically prove the append has exactly 34 `test(` registrations, no `t.test(`, and that every registration precedes Step 2:

```bash
set -Eeuo pipefail
test -n "${task2_temp_before:-}"
test -f "$task2_temp_before"
test -n "${task2_scope_before:-}"
test -f "$task2_scope_before"
test "$(head -n 1954 tools/test-scheduler.js | sha256sum | cut -d' ' -f1)" = \
  00d655377f375ea0a0765ac1fa67e8910c71dd22517af97b1d3fd6a9c4a97211
test "$(sha256sum tools/test-scheduler.js | cut -d' ' -f1)" = \
  9c1960ce0d9c2d593b8bb66540f5468483baa678e565face7b638fb23faf5b5b
test "$(wc -l < tools/test-scheduler.js)" -eq 3779
test "$(wc -c < tools/test-scheduler.js)" -eq 162109
test ! -e server/scheduler/store.js
awk '/^\/\/ BEGIN TASK2_TEST_APPEND$/{on=1} on{print} /^\/\/ END TASK2_TEST_APPEND$/{exit}' \
  docs/superpowers/plans/2026-08-24-durable-store-task2-remediation-implementation.md |
  node --check -
test "$(awk '/^\/\/ BEGIN TASK2_TEST_APPEND$/{on=1} on{print} \
  /^\/\/ END TASK2_TEST_APPEND$/{exit}' \
  docs/superpowers/plans/2026-08-24-durable-store-task2-remediation-implementation.md |
  rg -c '^test\(')" -eq 34
test "$(awk '/^\/\/ BEGIN TASK2_TEST_APPEND$/{on=1} on{print} \
  /^\/\/ END TASK2_TEST_APPEND$/{exit}' \
  docs/superpowers/plans/2026-08-24-durable-store-task2-remediation-implementation.md |
  awk '/t\.test\(/{n++} END{print n+0}')" -eq 0
test "$(awk '/^\/\/ BEGIN TASK2_TEST_APPEND$/{on=1} on{print} \
  /^\/\/ END TASK2_TEST_APPEND$/{exit}' \
  docs/superpowers/plans/2026-08-24-durable-store-task2-remediation-implementation.md |
  rg -c '^  prove\(')" -eq 24
```

- [ ] **Step 2: Run the sole mandatory RED**

Run this block exactly once after the complete append and before creating `store.js`:

```bash
set -Euo pipefail
tap_file="$(mktemp)"
cleanup() { rm -f "$tap_file"; }
trap cleanup EXIT HUP INT TERM
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests [1-9][0-9]*$' "$tap_file"
positive_status=$?
rg -q '^# tests 62$' "$tap_file"
tests_status=$?
rg -q '^# pass 27$' "$tap_file"
pass_status=$?
rg -q '^# fail 34$' "$tap_file"
fail_status=$?
rg -q '^# skipped 1$' "$tap_file"
skip_status=$?
test "$(rg -c "Cannot find module '../server/scheduler/store.js'" "$tap_file")" -eq 34
root_status=$?
test "$tap_status" -ne 0
node_status=$?
test "$positive_status" -eq 0
test "$tests_status" -eq 0
test "$pass_status" -eq 0
test "$fail_status" -eq 0
test "$skip_status" -eq 0
test "$root_status" -eq 0
test "$node_status" -eq 0
rm -f "$tap_file"
trap - EXIT HUP INT TERM
unset tap_file
unset -f cleanup
```

Expected: shell 0; Node nonzero; TAP exactly 62 total / 27 pass / 34 fail / 1 skip; positive-count, count, root-cause, and final predicates all zero. Any different count, an early module abort, a temp leak, or any root cause other than the missing Store stops dispatch.

- [ ] **Step 3: Create the one canonical standalone Store body**

Create `server/scheduler/store.js` from exactly the following single marked body. Do not retain an earlier fragment or paste a replacement below it.

```js
// BEGIN TASK2_CANONICAL_STORE
"use strict";

var crypto = require('node:crypto');
var OWNER_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var JOB_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
var UUID_V4_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
var UUID_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
var KIND_PRIORITY = Object.freeze({
  PVP_RESOLVE: 50,
  EXTERNAL_RESOLVE: 50,
  ACCOUNT_ADVANCE: 100
});
var PAYLOAD_CURRENT = 1;
var PAYLOAD_PREVIOUS = 0;
function expectedJobPriority(job) {
  if (job.kind === 'ACCOUNT_ADVANCE') return job.expectedRevision === -1 ? 200 : 100;
  // This is the durable counterpart of eventCandidates(): every fleet
  // primitive (including attack) precedes every missile at the same second.
  // Sequence/id then retain stable entity-id and canonical scheduling order
  // within one kind.  A mixed fleet/missile tie therefore cannot be inverted
  // merely because the rows were scheduled by different reconciliation pages.
  return job.payload && job.payload.ref && job.payload.ref.kind === 'missile' ? 51 : 50;
}
function assertSchedulerOwnerId(ownerId) {
  if (typeof ownerId !== 'string' || !OWNER_UUID_V4.test(ownerId)) {
    fail('SCHEDULER_OWNER_ID_INVALID');
  }
  return ownerId;
}
function assertSchedulerJobId(jobId) {
  if (typeof jobId !== 'string' || !JOB_UUID_V4.test(jobId)) {
    fail('SCHEDULER_JOB_ID_INVALID');
  }
  return jobId;
}
function deterministicJitter(jobId, attempt) {
  var text = String(jobId) + ':' + attempt;
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return (hash >>> 0) % 1000;
}
function retryAtMs(jobId, nextAttempt, nowMs, policy) {
  var delay = Math.min(
    policy.retryMaxMs,
    policy.retryBaseMs * Math.pow(2, nextAttempt - 1)
  );
  return nowMs + delay + deterministicJitter(jobId, nextAttempt);
}
function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (Object.prototype.toString.call(value) === '[object Object]') {
    return Object.keys(value).sort().reduce(function (result, key) {
      result[key] = canonicalValue(value[key]);
      return result;
    }, {});
  }
  throw new Error('PAYLOAD_VALUE_INVALID');
}
function canonicalJson(value) { return JSON.stringify(canonicalValue(value)); }
function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}
function positiveInt(value) { return Number.isSafeInteger(value) && value > 0; }
function safeSecond(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 9007199254740; }
function sameKeys(value, keys) {
  if (Array.isArray(value)) {
    return Array.isArray(keys) && value.length === keys.length &&
      value.every(function (entry, index) { return entry === keys[index]; });
  }
  return value && Object.prototype.toString.call(value) === '[object Object]' &&
    Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
}
function fail(code) { var error = new Error(code); error.code = code; throw error; }
function canonicalTargetKey(value) {
  var match = typeof value === 'string' && /^([1-9][0-9]*):([1-9][0-9]*):([1-9][0-9]*)$/.exec(value);
  if (!match || !match.slice(1).every(function (part) { return positiveInt(Number(part)); })) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  // Parsing and serializing makes leading zeroes, whitespace, and alternate
  // coordinate spellings impossible to use as a second target identity.
  return match.slice(1).map(function (part) { return String(Number(part)); }).join(':');
}
function canonicalExternalIdempotencyKey(ref) {
  var entityId = ref.kind === 'fleet' ? ref.fleetId : ref.missileId;
  return [
    'external', ref.kind, ref.mission, ref.ownerAccountId, entityId,
    canonicalTargetKey(ref.targetKey), ref.launchAtS, ref.arrivalAtS
  ].join(':');
}

function validateExternalRef(ref, kind, scheduledAtS) {
  var fleet = ['arrivalAtS', 'fleetId', 'kind', 'launchAtS', 'mission', 'ownerAccountId', 'targetKey'];
  var missile = ['arrivalAtS', 'kind', 'launchAtS', 'mission', 'missileId', 'ownerAccountId', 'targetKey'];
  var allowed = ref && ref.kind === 'fleet' ? fleet : ref && ref.kind === 'missile' ? missile : null;
  if (!allowed || !sameKeys(ref, allowed)) fail('PAYLOAD_VALUE_INVALID');
  if (!positiveInt(ref.ownerAccountId) || !safeSecond(ref.arrivalAtS) ||
      !safeSecond(ref.launchAtS) || ref.launchAtS > ref.arrivalAtS ||
      ref.arrivalAtS !== scheduledAtS || typeof ref.targetKey !== 'string' ||
      Buffer.byteLength(ref.targetKey, 'utf8') < 1 || Buffer.byteLength(ref.targetKey, 'utf8') > 64) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  if (ref.kind === 'fleet') {
    if (!positiveInt(ref.fleetId) || ['attack', 'transport', 'spy', 'hold'].indexOf(ref.mission) < 0) {
      fail('PAYLOAD_VALUE_INVALID');
    }
    if (kind === 'PVP_RESOLVE' && ref.mission !== 'attack') fail('PAYLOAD_VALUE_INVALID');
    if (kind === 'EXTERNAL_RESOLVE' && ref.mission === 'attack') fail('PAYLOAD_VALUE_INVALID');
  }
  if (ref.kind === 'missile' &&
      (!positiveInt(ref.missileId) || ref.mission !== 'missile' ||
      kind !== 'EXTERNAL_RESOLVE')) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  var normalized = Object.assign({}, ref, { targetKey: canonicalTargetKey(ref.targetKey) });
  if (normalized.targetKey !== ref.targetKey) fail('PAYLOAD_VALUE_INVALID');
  return Object.freeze(normalized);
}
function normalizedPayload(job) {
  var payload = canonicalValue(job && job.payload);
  if (!payload || Array.isArray(payload) || Object.prototype.toString.call(payload) !== '[object Object]') {
    fail('PAYLOAD_VALUE_INVALID');
  }
  // Byte limit is deliberately checked before per-field validation.
  if (Buffer.byteLength(canonicalJson(payload), 'utf8') > 65_536) fail('PAYLOAD_TOO_LARGE');
  if (payload.schemaVersion === PAYLOAD_PREVIOUS) payload.schemaVersion = PAYLOAD_CURRENT;
  if (payload.schemaVersion !== PAYLOAD_CURRENT) fail('PAYLOAD_SCHEMA_UNSUPPORTED');
  return payload;
}



function validateJob(job, options) {
  var payload, allowed, next, reconcile;
  var allowReconcile = Boolean(options && options.allowReconcile === true);
  if (!job || !Object.hasOwn(KIND_PRIORITY, job.kind)) fail('JOB_KIND_INVALID');
  if (job.priority !== expectedJobPriority(job)) fail('JOB_PRIORITY_INVALID');
  if (!safeSecond(job.scheduledAtS)) fail('JOB_SCHEDULED_AT_INVALID');
  if (typeof job.idempotencyKey !== 'string' || !/^[a-z][a-z0-9:_-]{0,191}$/.test(job.idempotencyKey)) {
    fail('JOB_IDEMPOTENCY_KEY_INVALID');
  }
  if (!Number.isSafeInteger(job.maxAttempts) || job.maxAttempts < 1 || job.maxAttempts > 20) {
    fail('JOB_MAX_ATTEMPTS_INVALID');
  }
  if (job.replayOfJobId !== undefined && job.replayOfJobId !== null &&
      (typeof job.replayOfJobId !== 'string' || !JOB_UUID_V4.test(job.replayOfJobId))) {
    fail('JOB_REPLAY_SOURCE_INVALID');
  }
  if (job.kind === 'ACCOUNT_ADVANCE') {
    if (job.aggregateType !== 'account' || !/^[1-9][0-9]*$/.test(String(job.aggregateId)) ||
        !Number.isSafeInteger(job.expectedRevision) || job.expectedRevision < -1 ||
        (job.sourceAccountId !== undefined && job.sourceAccountId !== null)) {
      fail('JOB_AGGREGATE_INVALID');
    }
  } else if (job.kind === 'PVP_RESOLVE') {
    if (job.aggregateType !== 'match' || typeof job.aggregateId !== 'string' || job.expectedRevision !== null) {
      fail('JOB_AGGREGATE_INVALID');
    }
  } else {
    if (job.aggregateType !== 'fleet' && job.aggregateType !== 'missile' ||
        job.expectedRevision !== null) fail('JOB_AGGREGATE_INVALID');
  }
  payload = normalizedPayload(job);
  allowed = job.kind === 'ACCOUNT_ADVANCE' ? [
    'accountId', 'nextLocalAtS', 'reconcile', 'reconcileRevision', 'schemaVersion'
  ] :
    job.kind === 'PVP_RESOLVE' ? ['matchId', 'ref', 'schemaVersion'] : ['ref', 'schemaVersion'];
  if (!Object.keys(payload).every(function (key) { return allowed.indexOf(key) >= 0; })) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  if (job.kind === 'ACCOUNT_ADVANCE') {
    next = payload.nextLocalAtS === undefined ? job.scheduledAtS : payload.nextLocalAtS;
    if (!positiveInt(payload.accountId) || String(payload.accountId) !== String(job.aggregateId) ||
        !safeSecond(next) || next < job.scheduledAtS) fail('PAYLOAD_VALUE_INVALID');
    payload.nextLocalAtS = next;
    reconcile = job.expectedRevision === -1;
    if (reconcile) {
      if (!allowReconcile || payload.reconcile !== true ||
          !Number.isSafeInteger(payload.reconcileRevision) || payload.reconcileRevision < 0 ||
          !new RegExp(
            '^reconcile:account:' + job.aggregateId +
            ':' + payload.reconcileRevision + ':[1-9][0-9]*:' + job.scheduledAtS + '$'
          ).test(job.idempotencyKey)) {
        fail('RECONCILE_JOB_FORBIDDEN');
      }
    } else if (payload.reconcile !== undefined || payload.reconcileRevision !== undefined ||
        job.idempotencyKey !== 'account-advance:' + job.aggregateId + ':' +
          job.expectedRevision) {
      fail('PAYLOAD_VALUE_INVALID');
    }
  } else {
    payload.ref = validateExternalRef(payload.ref, job.kind, job.scheduledAtS);
    if (!positiveInt(job.sourceAccountId) ||
        job.sourceAccountId !== payload.ref.ownerAccountId) {
      fail('JOB_SOURCE_ACCOUNT_INVALID');
    }
    if (job.kind === 'PVP_RESOLVE' && !/^[0-9a-f]{64}$/.test(payload.matchId || '')) {
      fail('PAYLOAD_VALUE_INVALID');
    }
    if (job.kind === 'PVP_RESOLVE' && job.aggregateId !== payload.matchId) {
      fail('JOB_AGGREGATE_INVALID');
    }
    if (job.kind === 'EXTERNAL_RESOLVE' &&
        ((payload.ref.kind === 'fleet' && job.aggregateType !== 'fleet') ||
        (payload.ref.kind === 'missile' && job.aggregateType !== 'missile') ||
        (payload.ref.kind === 'fleet' && String(job.aggregateId) !== String(payload.ref.fleetId)) ||
        (payload.ref.kind === 'missile' && String(job.aggregateId) !== String(payload.ref.missileId)))) {
      fail('JOB_AGGREGATE_INVALID');
    }
    if (job.replayOfJobId === null || job.replayOfJobId === undefined) {
      var canonicalKey = job.kind === 'PVP_RESOLVE' ?
        'pvp-resolve:' + payload.matchId + ':' + job.scheduledAtS :
        canonicalExternalIdempotencyKey(payload.ref);
      if (job.idempotencyKey !== canonicalKey) fail('JOB_IDEMPOTENCY_KEY_INVALID');
    } else if (!new RegExp('^manual-replay:' + job.replayOfJobId + ':[a-z0-9_-]{1,64}$').test(job.idempotencyKey)) {
      fail('JOB_IDEMPOTENCY_KEY_INVALID');
    }
  }
  return Object.freeze(Object.assign({}, job, {payload: Object.freeze(payload)}));
}


function utf8Prefix(text, maxBytes) {
  var bytes = Buffer.from(text, 'utf8');
  var decoder = new TextDecoder('utf-8', { fatal: true });
  for (var end = Math.min(bytes.length, maxBytes); end >= 0; end--) {
    try { return decoder.decode(bytes.subarray(0, end)); }
    catch (error) { void error; }
  }
  return '';
}
function stripNestedStructure(text) {
  var prior;
  do {
    prior = text;
    text = text
      .replace(/\{[^{}]*\}/g, '[redacted-json]')
      .replace(/\[[^\[\]]*\]/g, '[redacted-list]')
      .replace(/\([^()]*\)/g, '[redacted-group]');
  } while (text !== prior);
  return text;
}
function safeErrorMessage(value) {
  if (value !== null && typeof value === 'object') return '[redacted-object]';
  var assignment = new RegExp(
    "\\b(token|password|mk|accountId|account_id|account|name|ten|user|tk)\\b" +
    "\\s*(?::|=|\\s+)(?:\"[^\"]*\"|'[^']*'|[^,\\s;\\]}]+)",
    'gi'
  );
  var text = stripNestedStructure(String(value || ''))
    .replace(UUID_GLOBAL, '[redacted-uuid]')
    .replace(assignment, '$1=[redacted]');
  if (/\b(payload|state|cruiser|ships|cargo|linh|snapshot|combat)\b/i.test(text)) {
    text = '[redacted-sensitive]';
  }
  return utf8Prefix(text, 256);
}
var SQLITE_PRIMARY_CODES = Object.freeze({
  5: 'SQLITE_BUSY', 6: 'SQLITE_LOCKED', 10: 'SQLITE_IOERR',
  11: 'SQLITE_CORRUPT', 13: 'SQLITE_FULL', 26: 'SQLITE_NOTADB'
});
function normalizeSchedulerErrorCode(error) {
  if (!error) return null;
  var direct = typeof error.code === 'string' ? error.code : null;
  if (direct && direct !== 'ERR_SQLITE_ERROR') return direct;
  var numeric = Number(error.errcode);
  if (Number.isSafeInteger(numeric) && numeric >= 0 &&
      SQLITE_PRIMARY_CODES[numeric & 0xff]) {
    return SQLITE_PRIMARY_CODES[numeric & 0xff];
  }
  return direct;
}
function payloadIntegrity() {
  var error = new Error('PAYLOAD_INTEGRITY');
  error.code = 'PAYLOAD_INTEGRITY';
  return error;
}
function executableInput(row, payload) {
  return {
    kind: row.kind, scheduledAtS: Number(row.scheduled_at_s), priority: Number(row.priority),
    idempotencyKey: row.idempotency_key, aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    expectedRevision: row.expected_revision === null ? null : Number(row.expected_revision),
    sourceAccountId: row.source_account_id === null ? null : Number(row.source_account_id),
    payload: payload, maxAttempts: Number(row.max_attempts),
    replayOfJobId: row.replay_of_job_id || null
  };
}


function parseCanonicalBoundedJson(raw, expectedHash) {
  if (raw === null) return null;
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 65_536) throw payloadIntegrity();
  var value;
  try { value = JSON.parse(raw); } catch (error) { throw payloadIntegrity(); }
  var canonical = canonicalJson(value);
  if (raw !== canonical || sha256(canonical) !== expectedHash) throw payloadIntegrity();
  return value;
}
function exactCode(value, code, keys) {
  return sameKeys(value, keys) && value.code === code;
}
function invalidationResult(code, reconciliation) {
  if (code === 'MATCH_INVALIDATED') {
    return reconciliation ?
      { code: code, reconciliation: 'canonical-orphan' } :
      { code: code, invalidation: 'canonical' };
  }
  if (code === 'ENTITY_REMOVED' || code === 'OPERATOR_CONFIRMED_INVALID') {
    return { code: code };
  }
  fail('INVALIDATION_REASON_INVALID');
}
function validInvalidation(value, allowedCodes, allowCanonicalNeutralization) {
  if (allowedCodes.indexOf(value.code) < 0) return false;
  if (exactCode(value, value.code, ['code'])) return true;
  if (allowCanonicalNeutralization !== true) return false;
  if (sameKeys(value, ['code', 'invalidation', 'neutralization']) &&
      value.invalidation === 'canonical' &&
      ['MATCH_INVALIDATED', 'ENTITY_REMOVED',
        'OPERATOR_CONFIRMED_INVALID'].indexOf(value.code) >= 0 &&
      ['RETURNED', 'MISSILE_REMOVED', 'ALREADY_ABSENT',
        'REF_MISMATCH'].indexOf(value.neutralization) >= 0) return true;
  return value.code === 'MATCH_INVALIDATED' &&
    exactCode(value, 'MATCH_INVALIDATED', ['code', 'reconciliation']) &&
    value.reconciliation === 'canonical-orphan';
}
function validRecoveredLatestState(value, executableJob, effectiveAtS) {
  return sameKeys(value, [
    'code', 'recoveredAtCutover', 'recovery', 'originalScheduledAtS', 'recoveredAtS'
  ]) && value.code === 'RECOVERED_LATEST_STATE' && value.recoveredAtCutover === true &&
    value.recovery === 'recovered-latest-state' && safeSecond(value.originalScheduledAtS) &&
    safeSecond(value.recoveredAtS) &&
    value.originalScheduledAtS === Number(executableJob.scheduled_at_s) &&
    value.recoveredAtS === effectiveAtS;
}
function validResultForJob(value, executableJob, effectiveAtS) {
  var kind = executableJob.kind;
  var isReplay = executableJob.replay_of_job_id !== null &&
    executableJob.replay_of_job_id !== undefined;
  if (!value || typeof value.code !== 'string') return false;
  if (kind === 'ACCOUNT_ADVANCE') {
    return exactCode(value, 'ACCOUNT_ADVANCED', ['code']) ||
      validInvalidation(value, ['STALE_REVISION', 'MATCH_INVALIDATED'], false);
  }
  if (kind === 'PVP_RESOLVE') {
    return exactCode(value, 'PVP_RESOLVED', ['code']) ||
      (isReplay && exactCode(value, 'REPLAYED', ['code'])) ||
      validInvalidation(value, [
        'MATCH_INVALIDATED', 'ENTITY_REMOVED', 'OPERATOR_CONFIRMED_INVALID'
      ], true) ||
      validRecoveredLatestState(value, executableJob, effectiveAtS);
  }
  return exactCode(value, 'EXTERNAL_RESOLVED', ['code']) ||
    (isReplay && exactCode(value, 'REPLAYED', ['code'])) ||
    validInvalidation(value, [
      'MATCH_INVALIDATED', 'ENTITY_REMOVED', 'OPERATOR_CONFIRMED_INVALID'
    ], true) ||
    validRecoveredLatestState(value, executableJob, effectiveAtS);
}
// Task 2 can prove only immutable JSON/hash bounds.  It intentionally has
// no combat/rules import: the complete v1 semantic validator is installed
// by Task 5 before any PVP reducer or Writer is introduced.
function validateOpaqueSnapshot(raw, hash) {
  return parseCanonicalBoundedJson(raw, hash);
}
function validateStoredApplication(row, executableJob, seedKeyHex) {
  if (!row || row.job_id !== executableJob.id ||
      row.idempotency_key !== executableJob.idempotency_key) throw payloadIntegrity();
  var result = parseCanonicalBoundedJson(row.result_json, row.result_sha256);
  if (!validResultForJob(result, executableJob, Number(row.effective_at_s))) {
    throw payloadIntegrity();
  }
  var code = result.code;
  var recovered = validRecoveredLatestState(
    result, executableJob, Number(row.effective_at_s)
  );
  if (Number(row.effective_at_s) !== Number(executableJob.scheduled_at_s) && !recovered) {
    throw payloadIntegrity();
  }
  if (executableJob.replay_of_job_id) {
    if (row.resolves_job_id !== executableJob.replay_of_job_id) throw payloadIntegrity();
  } else if (row.resolves_job_id !== null) {
    throw payloadIntegrity();
  }
  var hasSnapshot = row.snapshot_json !== null || row.snapshot_sha256 !== null;
  if (executableJob.kind === 'PVP_RESOLVE' && code === 'PVP_RESOLVED') {
    if (!row.snapshot_json || !row.snapshot_sha256) throw payloadIntegrity();
    validateOpaqueSnapshot(row.snapshot_json, row.snapshot_sha256);
  } else if (executableJob.kind === 'PVP_RESOLVE') {
    if (hasSnapshot) throw payloadIntegrity();
  } else if (hasSnapshot) {
    throw payloadIntegrity();
  }
  return row;
}
function classifyTerminalResult(row, executableJob) {
  validateStoredApplication(row, executableJob, null);
  var result = parseCanonicalBoundedJson(row.result_json, row.result_sha256);
  var success = executableJob.kind === 'ACCOUNT_ADVANCE' && result.code === 'ACCOUNT_ADVANCED' ||
    executableJob.kind === 'PVP_RESOLVE' && result.code === 'PVP_RESOLVED' ||
    executableJob.kind === 'EXTERNAL_RESOLVE' && result.code === 'EXTERNAL_RESOLVED' ||
    result.code === 'REPLAYED' || result.code === 'RECOVERED_LATEST_STATE';
  if (success) return {kind: 'success', code: result.code};
  if (['STALE_REVISION', 'MATCH_INVALIDATED', 'ENTITY_REMOVED',
    'OPERATOR_CONFIRMED_INVALID'].indexOf(result.code) >= 0) {
    return {kind: 'cancellation', code: result.code};
  }
  throw payloadIntegrity();
}
function decorateLogicalGlobal(execution, root) {
  return Object.assign({}, execution, {
    logical_root_id: root.id,
    logical_key: root.idempotency_key,
    logical_scheduled_at_s: Number(root.scheduled_at_s),
    logical_priority: Number(root.priority),
    logical_sequence: Number(root.sequence),
    logical_order_id: root.id
  });
}

function sameScheduledJob(row, job, payloadJson, payloadHash) {
  return row.kind === job.kind && Number(row.scheduled_at_s) === job.scheduledAtS &&
    Number(row.priority) === job.priority && row.aggregate_type === job.aggregateType &&
    row.aggregate_id === String(job.aggregateId) &&
    (row.expected_revision === null ? null : Number(row.expected_revision)) === job.expectedRevision &&
    (row.source_account_id === null ? null : Number(row.source_account_id)) ===
      (job.sourceAccountId === undefined ? null : job.sourceAccountId) &&
    row.payload_json === payloadJson && row.payload_sha256 === payloadHash &&
    Number(row.max_attempts) === job.maxAttempts && (row.replay_of_job_id || null) ===
      (job.replayOfJobId || null);
}
function mutationConflict(store, token, nowMs, conflictCode) {
  if (!store.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
  fail(conflictCode);
}
function requiredMutation(store, token, nowMs, changes, conflictCode) {
  if (changes !== 1) mutationConflict(store, token, nowMs, conflictCode);
  return changes;
}
function optionalMutation(store, token, nowMs, changes) {
  if (changes === 0 && !store.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
  return changes;
}
SchedulerStore.prototype._allocateSequence = function (leaseToken, nowMs) {
  this.assertLiveLease(leaseToken, nowMs);
  var row = this.kho.db.prepare(
    "UPDATE scheduler_meta SET value=CAST(value AS INTEGER)+1,updated_at_ms=? " +
    "WHERE key='sequence' AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? " +
    "AND expires_at_ms>?) RETURNING CAST(value AS INTEGER) AS sequence"
  ).get(nowMs, leaseToken.ownerId, leaseToken.generation, nowMs);
  if (!row) mutationConflict(this, leaseToken, nowMs, 'SCHEDULER_SEQUENCE_CONFLICT');
  if (!Number.isSafeInteger(Number(row.sequence)) || Number(row.sequence) < 1) {
    fail('SCHEDULER_SCHEMA_UNSUPPORTED');
  }
  return Number(row.sequence);
};
SchedulerStore.prototype._insertNormalizedWithSequence = function (
  leaseToken, normalized, sequence, nowMs
) {
  this.assertLiveLease(leaseToken, nowMs);
  var payloadJson = canonicalJson(normalized.payload), payloadHash = sha256(payloadJson);
  var old = this.kho.db.prepare('SELECT * FROM event_jobs WHERE idempotency_key=?')
    .get(normalized.idempotencyKey);
  if (old) {
    if (!sameScheduledJob(old, normalized, payloadJson, payloadHash)) fail('IDEMPOTENCY_PAYLOAD_MISMATCH');
    if (normalized.kind !== 'ACCOUNT_ADVANCE' && !normalized.replayOfJobId &&
        ['COMPLETED', 'CANCELLED'].indexOf(old.state) >= 0) {
      fail('DERIVED_TERMINAL_REF_REDISCOVERED');
    }
    return old;
  }
  if (normalized.kind === 'ACCOUNT_ADVANCE' && this.kho.db.prepare(
    "SELECT 1 FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state='PENDING' AND blocked_by_job_id IS NOT NULL LIMIT 1"
  ).get(String(normalized.aggregateId))) {
    fail('ACCOUNT_ADVANCE_DEPENDENCY_BLOCKED');
  }
  var id = crypto.randomUUID();
  var inserted = this.kho.db.prepare(
    'INSERT INTO event_jobs(' +
    'id,kind,scheduled_at_s,priority,sequence,state,idempotency_key,aggregate_type,' +
    'aggregate_id,expected_revision,source_account_id,payload_json,payload_sha256,max_attempts,' +
    'replay_of_job_id,created_at_ms,updated_at_ms) ' +
    'SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM scheduler_lease ' +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(
    id, normalized.kind, normalized.scheduledAtS, normalized.priority, sequence, 'PENDING',
    normalized.idempotencyKey, normalized.aggregateType, String(normalized.aggregateId),
    normalized.expectedRevision, normalized.sourceAccountId === undefined ? null : normalized.sourceAccountId,
    payloadJson, payloadHash, normalized.maxAttempts, normalized.replayOfJobId || null,
    nowMs, nowMs, leaseToken.ownerId, leaseToken.generation, nowMs
  ).changes;
  requiredMutation(this, leaseToken, nowMs, inserted, 'JOB_INSERT_CONFLICT');
  return this.kho.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(id);
};
function sameReplaySource(source, job, payloadJson, payloadHash) {
  return source.kind === job.kind &&
    Number(source.scheduled_at_s) === Number(job.scheduledAtS) &&
    Number(source.priority) === Number(job.priority) &&
    source.aggregate_type === job.aggregateType &&
    source.aggregate_id === String(job.aggregateId) &&
    source.expected_revision === job.expectedRevision &&
    Number(source.source_account_id) === Number(job.sourceAccountId) &&
    source.payload_json === payloadJson && source.payload_sha256 === payloadHash &&
    Number(source.max_attempts) === Number(job.maxAttempts);
}
SchedulerStore.prototype.assertNewReplaySource = function (
  token, job, payloadJson, payloadHash, nowMs
) {
  if (!job.replayOfJobId) return;
  this.assertLiveLease(token, nowMs);
  var source = this.db.prepare('SELECT * FROM event_jobs WHERE id=?')
    .get(job.replayOfJobId);
  if (!source || source.state !== 'QUARANTINED' || source.replay_of_job_id !== null ||
      source.resolved_by_job_id !== null) fail('REPLAY_SOURCE_INVALID');
  if (!sameReplaySource(source, job, payloadJson, payloadHash)) {
    fail('REPLAY_SOURCE_MISMATCH');
  }
  if (this.db.prepare(
    "SELECT 1 FROM event_jobs WHERE replay_of_job_id=? " +
    "AND state NOT IN ('COMPLETED','CANCELLED') LIMIT 1"
  ).get(source.id)) fail('REPLAY_SOURCE_ALREADY_HAS_REPLACEMENT');
};
SchedulerStore.prototype._scheduleNormalized = function (leaseToken, normalized, nowMs) {
  this.assertLiveLease(leaseToken, nowMs);
  var payloadJson = canonicalJson(normalized.payload);
  var payloadHash = sha256(payloadJson);
  var old = this.kho.db.prepare('SELECT * FROM event_jobs WHERE idempotency_key=?')
    .get(normalized.idempotencyKey);
  if (old) {
    if (!sameScheduledJob(old, normalized, payloadJson, payloadHash)) {
      fail('IDEMPOTENCY_PAYLOAD_MISMATCH');
    }
    if (normalized.kind !== 'ACCOUNT_ADVANCE' && !normalized.replayOfJobId &&
        ['COMPLETED', 'CANCELLED'].indexOf(old.state) >= 0) {
      fail('DERIVED_TERMINAL_REF_REDISCOVERED');
    }
    return old;
  }
  this.assertNewReplaySource(
    leaseToken, normalized, payloadJson, payloadHash, nowMs
  );
  return this._insertNormalizedWithSequence(
    leaseToken, normalized, this._allocateSequence(leaseToken, nowMs), nowMs
  );
};
SchedulerStore.prototype.schedule = function (leaseToken, job, nowMs) {
  return this._scheduleNormalized(leaseToken, validateJob(job), nowMs);
};
function normalizeReconcileTemplate(template) {
  var probe = Object.assign({}, template, {
    idempotencyKey: 'reconcile:account:' + template.aggregateId + ':' +
      template.payload.reconcileRevision + ':1:' + template.scheduledAtS
  });
  return validateJob(probe, {allowReconcile: true});
}
SchedulerStore.prototype.scheduleReconcileAccountAdvance = function (leaseToken, template, nowMs) {
  this.assertLiveLease(leaseToken, nowMs);
  var checked = normalizeReconcileTemplate(template);
  if (this.kho.db.prepare(
    "SELECT 1 FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state='PENDING' AND blocked_by_job_id IS NOT NULL LIMIT 1"
  ).get(String(checked.aggregateId))) fail('ACCOUNT_ADVANCE_DEPENDENCY_BLOCKED');
  var epoch = this._allocateSequence(leaseToken, nowMs);
  var job = Object.assign({}, checked, {
    idempotencyKey: 'reconcile:account:' + checked.aggregateId + ':' +
      checked.payload.reconcileRevision + ':' + epoch + ':' + checked.scheduledAtS
  });
  var normalized = validateJob(job, { allowReconcile: true });
  if (normalized.kind !== 'ACCOUNT_ADVANCE' || normalized.expectedRevision !== -1 ||
      normalized.payload.reconcile !== true ||
      !Number.isSafeInteger(normalized.payload.reconcileRevision) ||
      normalized.priority !== 200) {
    fail('RECONCILE_JOB_FORBIDDEN');
  }
  return this._insertNormalizedWithSequence(leaseToken, normalized, epoch, nowMs);
};
SchedulerStore.prototype.ensureReconcileAccountAdvance = function (leaseToken, job, nowMs) {
  this.assertLiveLease(leaseToken, nowMs);
  var normalized = normalizeReconcileTemplate(job);
  var live = this.kho.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_type='account' " +
    "AND aggregate_id=? AND state IN ('PENDING','RETRY_WAIT','RUNNING') " +
    'ORDER BY scheduled_at_s,priority,sequence,id'
  ).all(String(normalized.aggregateId));
  var current = this.kho.db.prepare('SELECT revision FROM dq WHERE tk=?')
    .get(Number(normalized.aggregateId));
  var fence = live.length === 1 ?
    (live[0].checkpoint_revision === null ? live[0].expected_revision : live[0].checkpoint_revision) : null;
  var running = live.find(function (row) { return row.state === 'RUNNING'; });
  var blocked = live.find(function (row) { return row.blocked_by_job_id !== null; });
  if (blocked) {
    live.forEach(function (row) {
      if (row.id !== blocked.id && row.blocked_by_job_id === null &&
          (row.state === 'PENDING' || row.state === 'RETRY_WAIT')) {
        this.cancel(leaseToken, row.idempotency_key, 'SUPERSEDED', nowMs);
      }
    }, this);
    return blocked;
  }
  if (running) {
    // A writer-owned continuation is authoritative. Remove every stale
    // unclaimed sibling before returning it so "one live wake" remains true.
    live.forEach(function (row) {
      if (row.id !== running.id && (row.state === 'PENDING' || row.state === 'RETRY_WAIT')) {
        this.cancel(leaseToken, row.idempotency_key, 'SUPERSEDED', nowMs);
      }
    }, this);
    return running;
  }
  if (live.length === 1 && Number(live[0].scheduled_at_s) === normalized.scheduledAtS && current &&
      ((Number(live[0].expected_revision) === -1 &&
        JSON.parse(live[0].payload_json).reconcileRevision === Number(current.revision)) ||
        Number(fence) === Number(current.revision))) {
    return live[0];
  }
  live.forEach(function (row) {
    this.cancel(leaseToken, row.idempotency_key, 'SUPERSEDED', nowMs);
  }, this);
  return this.scheduleReconcileAccountAdvance(leaseToken, normalized, nowMs);
};

SchedulerStore.prototype.claimGlobalForInvalidation = function (
  leaseToken, jobId, nowMs, lockMs, options
) {
  options = options || {};
  var inspected = this.inspectLogicalJob(leaseToken, jobId, nowMs);
  if (!inspected || inspected.root.kind === 'ACCOUNT_ADVANCE') {
    throw new Error('GLOBAL_INVALIDATION_REQUIRED');
  }
  var target = inspected.root;
  if (inspected.activeChild) {
    if (inspected.activeChild.state !== 'QUARANTINED' ||
        options.allowQuarantined !== true) {
      throw new Error('REPLAY_REPLACEMENT_ACTIVE');
    }
    target = inspected.activeChild;
  }
  if (options.rootMustBeQuarantined === true &&
      inspected.root.state !== 'QUARANTINED') {
    throw new Error('QUARANTINE_RESOLUTION_INVALID');
  }
  if (target.state === 'RUNNING') {
    return this.loadExecutableJob(leaseToken, target, nowMs);
  }
  return this.claimForResolution(leaseToken, target.id, nowMs, lockMs, {
    allowQuarantined: options.allowQuarantined === true,
    allowFuturePending: options.allowFuturePending === true
  });
};

// server/scheduler/store.js — constructor, lease, and operational time.
function SchedulerStore(kho, clock) {
  if (!kho || !kho.db || !clock || typeof clock.nowMs !== 'function') {
    throw new Error('SCHEDULER_STORE_CONTEXT_INVALID');
  }
  this.kho = kho;
  this.db = kho.db;
  this.clock = clock;
}
SchedulerStore.prototype.schedulerMode = function () {
  var row = this.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get();
  return row ? row.value : 'legacy';
};
SchedulerStore.prototype.assertSchemaVersion = function (supportedVersion) {
  var row = this.db.prepare("SELECT value FROM scheduler_meta WHERE key='schema_version'").get();
  var version = row && Number(row.value);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('SCHEDULER_SCHEMA_UNSUPPORTED');
  if (version > supportedVersion) throw new Error('SCHEDULER_SCHEMA_TOO_NEW');
  if (version !== supportedVersion) throw new Error('SCHEDULER_SCHEMA_UNSUPPORTED');
  return version;
};
SchedulerStore.prototype.peekEffectiveNowMs = function (wallNowMs) {
  var row = this.db.prepare("SELECT value FROM scheduler_meta WHERE key='effective_now_ms'").get();
  var prior = row && Number(row.value);
  if (!Number.isSafeInteger(prior) || prior < 0) prior = 0;
  if (!Number.isSafeInteger(wallNowMs) || wallNowMs < 0) throw new Error('EFFECTIVE_NOW_INVALID');
  return Math.max(prior, wallNowMs);
};
SchedulerStore.prototype.recordEffectiveNowMs = function (token, effectiveNowMs) {
  this.assertLiveLease(token, effectiveNowMs);
  var next = this.peekEffectiveNowMs(effectiveNowMs);
  var changed = this.db.prepare(
    "INSERT INTO scheduler_meta(key,value,updated_at_ms) " +
    "SELECT 'effective_now_ms',?,? WHERE EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?) " +
    "ON CONFLICT(key) DO UPDATE SET value=CASE " +
    "WHEN CAST(value AS INTEGER)>CAST(excluded.value AS INTEGER) THEN value ELSE excluded.value END," +
    "updated_at_ms=excluded.updated_at_ms"
  ).run(String(next), next, token.ownerId, token.generation, effectiveNowMs).changes;
  requiredMutation(this, token, effectiveNowMs, changed, 'EFFECTIVE_NOW_CONFLICT');
  return next;
};
SchedulerStore.prototype.leaseTokenIsLive = function (token, nowMs) {
  if (!token || !Number.isSafeInteger(token.generation)) return false;
  return Boolean(this.db.prepare(
    "SELECT 1 AS ok FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?"
  ).get(token.ownerId, token.generation, nowMs));
};
SchedulerStore.prototype.assertLiveLease = function (token, nowMs) {
  if (!this.leaseTokenIsLive(token, nowMs)) {
    var error = new Error('LEASE_LOST'); error.code = 'LEASE_LOST'; throw error;
  }
  return true;
};
SchedulerStore.prototype.acquireLease = function (ownerId, nowMs, leaseMs) {
  assertSchedulerOwnerId(ownerId);
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(leaseMs) || leaseMs < 1) {
    throw new Error('LEASE_ARGUMENT_INVALID');
  }
  this.db.prepare(
    "INSERT OR IGNORE INTO scheduler_lease(" +
    "lease_name,owner_id,generation,expires_at_ms,heartbeat_at_ms) " +
    "VALUES('global-writer','',0,0,0)"
  ).run();
  var held = this.db.prepare(
    "SELECT owner_id,generation,expires_at_ms FROM scheduler_lease WHERE lease_name='global-writer'"
  ).get();
  if (held.owner_id === ownerId && Number(held.expires_at_ms) > nowMs) {
    return {ownerId: ownerId, generation: Number(held.generation)};
  }
  var changed = this.db.prepare(
    "UPDATE scheduler_lease SET owner_id=?,generation=generation+1,expires_at_ms=?,heartbeat_at_ms=? " +
    "WHERE lease_name='global-writer' AND expires_at_ms<?"
  ).run(ownerId, nowMs + leaseMs, nowMs, nowMs).changes;
  if (!changed) return null;
  var row = this.db.prepare(
    "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer' AND owner_id=?"
  ).get(ownerId);
  return {ownerId: ownerId, generation: Number(row.generation)};
};
SchedulerStore.prototype.renewLease = function (token, nowMs, leaseMs) {
  return this.db.prepare(
    "UPDATE scheduler_lease SET expires_at_ms=MAX(expires_at_ms,?)," +
    "heartbeat_at_ms=MAX(heartbeat_at_ms,?) " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? " +
    "AND expires_at_ms>?"
  ).run(nowMs + leaseMs, nowMs, token.ownerId, token.generation, nowMs).changes === 1;
};
SchedulerStore.prototype.releaseLease = function (token, nowMs) {
  return this.db.prepare(
    "UPDATE scheduler_lease SET expires_at_ms=0,heartbeat_at_ms=? " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? " +
    "AND expires_at_ms>?"
  ).run(nowMs, token.ownerId, token.generation, nowMs).changes === 1;
};

// server/scheduler/store.js — claim/read primitives.  All callers are already
// inside the caller's immediate UoW; the CTE proves the lease again in SQL.
SchedulerStore.prototype.claimNext = function (token, nowMs, watermarkS, lockMs) {
  this.assertLiveLease(token, nowMs);
  var sql = "WITH candidate AS (SELECT j.id FROM event_jobs j " +
    "JOIN scheduler_lease l ON l.lease_name='global-writer' " +
    "WHERE l.owner_id=? AND l.generation=? AND l.expires_at_ms>? " +
    "AND j.state IN ('PENDING','RETRY_WAIT') " +
    "AND j.kind='ACCOUNT_ADVANCE' " +
    "AND j.blocked_by_job_id IS NULL " +
    "AND (j.locked_until_ms IS NULL OR j.locked_until_ms<?) " +
    "AND (j.state='PENDING' AND j.scheduled_at_s*1000<=? OR j.state='RETRY_WAIT' AND j.retry_at_ms<=?) " +
    "AND (? IS NULL OR j.scheduled_at_s<=?) " +
    "ORDER BY CASE WHEN j.state='PENDING' THEN j.scheduled_at_s*1000 " +
    "ELSE j.retry_at_ms END,j.priority,j.sequence,j.id LIMIT 1) " +
    "UPDATE event_jobs SET state='RUNNING',locked_by=?,locked_generation=?," +
    "locked_until_ms=?,updated_at_ms=? " +
    "WHERE id=(SELECT id FROM candidate) AND state IN ('PENDING','RETRY_WAIT') " +
    "AND blocked_by_job_id IS NULL " +
    "AND (locked_until_ms IS NULL OR locked_until_ms<?) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?) RETURNING *";
  var row = this.db.prepare(sql).get(
    token.ownerId, token.generation, nowMs, nowMs, nowMs, nowMs,
    watermarkS, watermarkS, token.ownerId, token.generation, nowMs + lockMs, nowMs,
    nowMs, token.ownerId, token.generation, nowMs
  );
  if (!row && !this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
  return row || null;
};
SchedulerStore.prototype.claimForResolution = function (token, jobId, nowMs, lockMs, options) {
  options = options || {};
  assertSchedulerJobId(jobId);
  this.assertLiveLease(token, nowMs);
  var nowS = options.nowS === undefined ? Math.floor(nowMs / 1000) : options.nowS;
  if (!Number.isSafeInteger(nowS) || nowS < 0) throw new Error('JOB_RESOLUTION_TIME_INVALID');
  var sql = "WITH live_lease AS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?) " +
    "UPDATE event_jobs SET state='RUNNING',locked_by=?," +
    "locked_generation=?,locked_until_ms=?,updated_at_ms=? " +
    "WHERE id=? AND blocked_by_job_id IS NULL " +
    "AND (locked_until_ms IS NULL OR locked_until_ms<?) AND (" +
    "(state='PENDING' AND (scheduled_at_s<=? OR ?=1)) OR " +
    "(state='RETRY_WAIT' AND retry_at_ms<=?) OR " +
    "(state='QUARANTINED' AND ?=1)) " +
    "AND EXISTS (SELECT 1 FROM live_lease) RETURNING *";
  var row = this.db.prepare(sql).get(
    token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs + lockMs, nowMs,
    jobId, nowMs, nowS, options.allowFuturePending === true ? 1 : 0, nowMs,
    options.allowQuarantined === true ? 1 : 0
  );
  if (!row) mutationConflict(this, token, nowMs, 'JOB_RESOLUTION_CLAIM_INVALID');
  return row;
};
SchedulerStore.prototype.resumeOwnedRunning = function (token, jobId, nowMs, lockMs) {
  assertSchedulerJobId(jobId);
  this.assertLiveLease(token, nowMs);
  var row = this.db.prepare(
    "UPDATE event_jobs SET locked_until_ms=?,updated_at_ms=? " +
    "WHERE id=? AND state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? AND blocked_by_job_id IS NULL " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?) RETURNING *"
  ).get(nowMs + lockMs, nowMs, jobId, token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs);
  if (!row && !this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
  return row || null;
};
SchedulerStore.prototype.getById = function (jobId) {
  assertSchedulerJobId(jobId);
  return this.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(jobId) || null;
};
SchedulerStore.prototype.getByIdempotencyKey = function (key) {
  return this.db.prepare('SELECT * FROM event_jobs WHERE idempotency_key=?').get(key) || null;
};
SchedulerStore.prototype.loadExecutableJob = function (token, row, nowMs) {
  this.assertLiveLease(token, nowMs);
  if (!row || !row.id) throw payloadIntegrity();
  var persisted = this.getById(row.id);
  if (!persisted || persisted.state !== 'RUNNING' || persisted.locked_by !== token.ownerId ||
      Number(persisted.locked_generation) !== Number(token.generation) ||
      Number(persisted.locked_until_ms) <= nowMs) throw payloadIntegrity();
  if (persisted.kind === 'ACCOUNT_ADVANCE' && persisted.blocked_by_job_id) {
    throw payloadIntegrity();
  }
  var payload = parseCanonicalBoundedJson(persisted.payload_json, persisted.payload_sha256);
  var executable;
  try {
    executable = validateJob(executableInput(persisted, payload), {
      allowReconcile: true
    });
  } catch (error) {
    throw payloadIntegrity();
  }
  var loaded = Object.assign({}, persisted, executable, {
    payload: Object.freeze(executable.payload)
  });
  if (persisted.kind !== 'ACCOUNT_ADVANCE') {
    var children = this.assertReplayLineage(token, nowMs);
    var root = persisted.replay_of_job_id ? this.getById(persisted.replay_of_job_id) : persisted;
    if (!root || root.replay_of_job_id !== null ||
        (persisted.replay_of_job_id && children.get(root.id) !== persisted.id)) {
      fail('REPLAY_LINEAGE_INVALID');
    }
    loaded = decorateLogicalGlobal(loaded, root);
  }
  return Object.freeze(loaded);
};
SchedulerStore.prototype.loadReplayableJob = function (token, jobId, nowMs) {
  this.assertLiveLease(token, nowMs);
  this.assertReplayLineage(token, nowMs);
  var row = this.getById(jobId);
  if (!row || row.state !== 'QUARANTINED' || row.replay_of_job_id !== null ||
      row.resolved_by_job_id !== null || this.db.prepare(
        "SELECT 1 FROM event_jobs WHERE replay_of_job_id=? " +
        "AND state NOT IN ('COMPLETED','CANCELLED') LIMIT 1"
      ).get(jobId)) throw new Error('SCHEDULER_CLI_REPLAY_SOURCE_INVALID');
  var payload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
  var executable;
  try { executable = validateJob(executableInput(row, payload), {allowReconcile: true}); }
  catch (error) { throw payloadIntegrity(); }
return Object.freeze(Object.assign({}, row, executable, {
  payload: Object.freeze(executable.payload)
}));
};
// Read-only diagnostics/restart verification may validate an immutable
// completed row, but may never use it to execute an effect.  Execution still
// exclusively enters through loadExecutableJob's RUNNING+lease fence.
SchedulerStore.prototype.loadImmutableJobForAudit = function (jobId) {
var row = this.getById(jobId);
if (!row) throw payloadIntegrity();
var payload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
var executable;
try { executable = validateJob(executableInput(row, payload), {allowReconcile: true}); }
catch (error) { throw payloadIntegrity(); }
return Object.freeze(Object.assign({}, row, executable, {
  payload: Object.freeze(executable.payload)
}));
};

// server/scheduler/store.js — remaining transitions and status surface.
// Task 2 validates immutable canonical JSON and result linkage. Task 5 extends
// the snapshot semantics while preserving this authoritative reload boundary.
SchedulerStore.prototype.insertApplication = function (
  token, executableJob, application, nowMs, canonicalTContext
) {
  this.assertLiveLease(token, nowMs);
  var persisted = this.loadExecutableJob(token, executableJob, nowMs);
  var idempotencyKey = persisted.idempotency_key;
  var jobId = persisted.id;
  if (persisted.replay_of_job_id) {
    if (application.resolvesJobId !== undefined &&
        application.resolvesJobId !== persisted.replay_of_job_id) {
      throw payloadIntegrity();
    }
    application = Object.assign({}, application, {
      resolvesJobId: persisted.replay_of_job_id
    });
  } else if (application.resolvesJobId !== undefined &&
      application.resolvesJobId !== null) {
    throw payloadIntegrity();
  }
  var resultJson = canonicalJson(application.result);
  var snapshotJson = application.snapshot === undefined ? null : canonicalJson(application.snapshot);
  var candidate = {
    idempotency_key: idempotencyKey,
    job_id: jobId,
    resolves_job_id: application.resolvesJobId || null,
    effective_at_s: application.effectiveAtS,
    applied_at_ms: nowMs,
    snapshot_json: snapshotJson,
    snapshot_sha256: snapshotJson === null ? null : sha256(snapshotJson),
    result_json: resultJson,
    result_sha256: sha256(resultJson)
  };
  validateStoredApplication(candidate, persisted, null);
  var inserted = this.db.prepare(
    'INSERT INTO event_applications(' +
    'idempotency_key,job_id,resolves_job_id,effective_at_s,applied_at_ms,' +
    'snapshot_json,snapshot_sha256,result_json,result_sha256) ' +
    'SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM scheduler_lease ' +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?) " +
    'AND EXISTS (SELECT 1 FROM event_jobs WHERE id=? AND state=\'RUNNING\' ' +
    'AND locked_by=? AND locked_generation=? AND locked_until_ms>?) ' +
    'ON CONFLICT(idempotency_key) DO NOTHING'
  ).run(
    candidate.idempotency_key, candidate.job_id, candidate.resolves_job_id,
    candidate.effective_at_s, candidate.applied_at_ms, candidate.snapshot_json,
    candidate.snapshot_sha256, candidate.result_json, candidate.result_sha256,
    token.ownerId, token.generation, nowMs, jobId, token.ownerId, token.generation, nowMs
  );
  optionalMutation(this, token, nowMs, inserted.changes);
  var created = this.db.prepare(
    'SELECT * FROM event_applications WHERE idempotency_key=?'
  ).get(idempotencyKey);
  if (!created) throw payloadIntegrity();
  validateStoredApplication(created, persisted, null);
  return {alreadyApplied: inserted.changes === 0, row: created};
};
SchedulerStore.prototype.checkpointPartial = function (token, job, revision, nowMs) {
  this.assertLiveLease(token, nowMs);
  job = this.loadExecutableJob(token, job, nowMs);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('CHECKPOINT_REVISION_INVALID');
  var current = this.db.prepare('SELECT revision FROM dq WHERE tk=?').get(Number(job.aggregate_id));
  if (!current || Number(current.revision) !== revision) throw new Error('CHECKPOINT_DQ_FENCE_INVALID');
  if (this.db.prepare(
    "UPDATE event_jobs SET checkpoint_revision=?,updated_at_ms=? " +
    "WHERE id=? AND state='RUNNING' AND locked_by=? AND locked_generation=? " +
    "AND locked_until_ms>? AND (checkpoint_revision IS NULL OR checkpoint_revision=?) " +
    "AND EXISTS (SELECT 1 FROM dq WHERE tk=? AND revision=?) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(revision, nowMs, job.id, token.ownerId, token.generation,
    nowMs, job.checkpoint_revision === null ? null : Number(job.checkpoint_revision),
    Number(job.aggregate_id), revision, token.ownerId, token.generation, nowMs).changes !== 1) {
    mutationConflict(this, token, nowMs, 'JOB_CHECKPOINT_CONFLICT');
  }
};
SchedulerStore.prototype.markDurableMutation = function (token, nowMs) {
  this.assertLiveLease(token, nowMs);
  var changed = this.db.prepare(
    "INSERT INTO scheduler_meta(key,value,updated_at_ms) " +
    "SELECT 'durable_first_mutation_at_ms',?,? WHERE EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?) " +
    "ON CONFLICT(key) DO NOTHING"
  ).run(String(nowMs), nowMs, token.ownerId, token.generation, nowMs).changes;
  optionalMutation(this, token, nowMs, changed);
};
SchedulerStore.prototype.terminalizeReplaySource = function (token, job, nowMs) {
  if (!job.replay_of_job_id) return;
  this.assertLiveLease(token, nowMs);
  if (this.db.prepare(
    "UPDATE event_jobs SET state='CANCELLED',completed_at_ms=NULL,cancelled_at_ms=?," +
    "cancel_reason='RESOLVED_BY_REPLAY',resolved_by_job_id=?,updated_at_ms=? " +
    "WHERE id=? AND state='QUARANTINED' AND replay_of_job_id IS NULL " +
    "AND resolved_by_job_id IS NULL AND EXISTS (SELECT 1 FROM event_applications " +
    "WHERE job_id=? AND resolves_job_id=?) AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(nowMs, job.id, nowMs, job.replay_of_job_id,
    job.id, job.replay_of_job_id, token.ownerId, token.generation, nowMs).changes !== 1) {
    mutationConflict(this, token, nowMs, 'REPLAY_SOURCE_RESOLUTION_INVALID');
  }
  this.releaseBlockedAccountDependents(token, job.replay_of_job_id, nowMs);
};
SchedulerStore.prototype.completeApplied = function (token, job, nowMs) {
  this.assertLiveLease(token, nowMs);
  var executable = this.loadExecutableJob(token, job, nowMs);
  var application = this.db.prepare(
    'SELECT * FROM event_applications WHERE job_id=?'
  ).get(executable.id);
  if (!application) fail('APPLICATION_REQUIRED');
  var classified = classifyTerminalResult(application, executable);
  if (classified.kind !== 'success') fail('JOB_COMPLETION_RESULT_INVALID');
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='COMPLETED',completed_at_ms=?,cancelled_at_ms=NULL," +
    "cancel_reason=NULL,quarantined_at_ms=NULL,retry_at_ms=NULL,error_code=NULL," +
    "error_message_safe=NULL,updated_at_ms=?,locked_by=NULL,locked_generation=NULL," +
    "locked_until_ms=NULL WHERE id=? AND state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? AND EXISTS (SELECT 1 " +
    "FROM scheduler_lease WHERE lease_name='global-writer' AND owner_id=? " +
    "AND generation=? AND expires_at_ms>?)"
  ).run(
    nowMs, nowMs, executable.id, token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs
  ).changes;
  if (changed !== 1) {
    if (!this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
    fail('JOB_COMPLETION_CONFLICT');
  }
  this.terminalizeReplaySource(token, executable, nowMs);
  if (executable.kind === 'PVP_RESOLVE' || executable.kind === 'EXTERNAL_RESOLVE') {
    this.releaseBlockedAccountDependents(token, executable.id, nowMs);
  }
};
SchedulerStore.prototype.finishResolved = function (token, job, state, reason, nowMs) {
  if (state !== 'CANCELLED') fail('JOB_TERMINAL_STATE_INVALID');
  if (['STALE_REVISION', 'MATCH_INVALIDATED', 'ENTITY_REMOVED',
    'OPERATOR_CONFIRMED_INVALID'].indexOf(reason) < 0) {
    fail('JOB_TERMINAL_REASON_INVALID');
  }
  this.assertLiveLease(token, nowMs);
  var executable = this.loadExecutableJob(token, job, nowMs);
  var application = this.db.prepare(
    'SELECT * FROM event_applications WHERE job_id=?'
  ).get(executable.id);
  if (!application) fail('APPLICATION_REQUIRED');
  var classified = classifyTerminalResult(application, executable);
  if (classified.kind !== 'cancellation' || classified.code !== reason) {
    fail('JOB_TERMINAL_RESULT_MISMATCH');
  }
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='CANCELLED',completed_at_ms=NULL,cancelled_at_ms=?," +
    "cancel_reason=?,updated_at_ms=?,locked_by=NULL,locked_generation=NULL," +
    "locked_until_ms=NULL WHERE id=? AND state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? AND EXISTS (SELECT 1 " +
    "FROM scheduler_lease WHERE lease_name='global-writer' AND owner_id=? " +
    "AND generation=? AND expires_at_ms>?)"
  ).run(
    nowMs, reason, nowMs, executable.id, token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs
  ).changes;
  if (changed !== 1) {
    if (!this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
    fail('JOB_TERMINAL_CONFLICT');
  }
  this.terminalizeReplaySource(token, executable, nowMs);
  if (executable.kind === 'PVP_RESOLVE' || executable.kind === 'EXTERNAL_RESOLVE') {
    this.releaseBlockedAccountDependents(token, executable.id, nowMs);
  }
};
SchedulerStore.prototype.completeAccountAdvanceAndScheduleSuccessor = function (token, job, nextLocalAtS, nowMs) {
  var executable = this.loadExecutableJob(token, job, nowMs);
  this.completeApplied(token, executable, nowMs);
  if (Number.isSafeInteger(nextLocalAtS)) {
    var current = this.db.prepare('SELECT revision FROM dq WHERE tk=?')
      .get(Number(executable.aggregate_id));
    if (!current) throw new Error('ACCOUNT_ADVANCE_AGGREGATE_MISSING');
    this.replaceAccountAdvance(
      token,
      Number(executable.aggregate_id),
      Number(current.revision),
      nextLocalAtS,
      nowMs
    );
  }
};
SchedulerStore.prototype.fail = function (token, job, failure, nowMs, policy) {
  this.assertLiveLease(token, nowMs);
  job = this.loadExecutableJob(token, job, nowMs);
  var attempt = Number(job.attempt) + 1;
  var normalizedCode = normalizeSchedulerErrorCode(failure);
  var transient = ['SQLITE_BUSY','SQLITE_LOCKED','SQLITE_IOERR','ETIMEDOUT']
    .includes(normalizedCode);
  if (!transient || attempt >= policy.maxAttempts) {
    var code = safeErrorMessage(normalizedCode);
    var message = safeErrorMessage(failure && failure.message);
    if (this.db.prepare(
      "UPDATE event_jobs SET state='QUARANTINED',attempt=?,retry_at_ms=NULL," +
      "error_code=?,error_message_safe=?,quarantined_at_ms=?,updated_at_ms=?," +
      "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL WHERE id=? " +
      "AND state='RUNNING' AND locked_by=? AND locked_generation=? AND locked_until_ms>? " +
      "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
      "AND owner_id=? AND generation=? AND expires_at_ms>?)"
    ).run(attempt, code, message, nowMs, nowMs, job.id,
      token.ownerId, token.generation, nowMs, token.ownerId,
      token.generation, nowMs).changes !== 1) {
      mutationConflict(this, token, nowMs, 'JOB_FAILURE_CONFLICT');
    }
    return 'QUARANTINED';
  }
  if (this.db.prepare(
    "UPDATE event_jobs SET state='RETRY_WAIT',attempt=?,retry_at_ms=?," +
    "error_code=?,error_message_safe=?,quarantined_at_ms=NULL,updated_at_ms=?," +
    "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL WHERE id=? " +
    "AND state='RUNNING' AND locked_by=? AND locked_generation=? AND locked_until_ms>? " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(attempt, retryAtMs(job.id, attempt, nowMs, policy),
    safeErrorMessage(normalizedCode),
    safeErrorMessage(failure && failure.message), nowMs, job.id,
    token.ownerId, token.generation, nowMs, token.ownerId,
    token.generation, nowMs).changes !== 1) {
    mutationConflict(this, token, nowMs, 'JOB_FAILURE_CONFLICT');
  }
  return 'RETRY_WAIT';
};
SchedulerStore.prototype.recoverExpiredRunning = function (token, nowMs, policy) {
  this.assertLiveLease(token, nowMs);
  var rows = this.db.prepare(
    "SELECT * FROM event_jobs WHERE state='RUNNING' AND " +
    '(locked_generation<? OR (locked_generation=? AND locked_by=? AND locked_until_ms<=?)) ' +
    'ORDER BY scheduled_at_s,priority,sequence,id'
  ).all(token.generation, token.generation, token.ownerId, nowMs);
  return rows.reduce(function (count, row) {
    var attempt = Number(row.attempt) + 1;
    var sql;
    var params;
    if (attempt >= Number(policy.maxAttempts)) {
      sql = "UPDATE event_jobs SET state='QUARANTINED',attempt=?,retry_at_ms=NULL,error_code=?," +
        "error_message_safe=?,quarantined_at_ms=?,updated_at_ms=?,locked_by=NULL," +
        "locked_generation=NULL,locked_until_ms=NULL " +
        "WHERE id=? AND state='RUNNING' AND " +
        "(locked_generation<? OR (locked_generation=? AND locked_by=? AND locked_until_ms<=?)) " +
        "AND EXISTS (SELECT 1 FROM scheduler_lease " +
        "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)";
      params = [attempt, 'EXPIRED_RUNNING', 'expired RUNNING lease', nowMs, nowMs, row.id,
        token.generation, token.generation, token.ownerId, nowMs,
        token.ownerId, token.generation, nowMs];
    } else {
      sql = "UPDATE event_jobs SET state='RETRY_WAIT',attempt=?,retry_at_ms=?,error_code=?," +
        "error_message_safe=?,quarantined_at_ms=NULL,updated_at_ms=?,locked_by=NULL," +
        "locked_generation=NULL,locked_until_ms=NULL WHERE id=? AND state='RUNNING' " +
        "AND (locked_generation<? OR " +
        "(locked_generation=? AND locked_by=? AND locked_until_ms<=?)) " +
        "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
        "AND owner_id=? AND generation=? AND expires_at_ms>?)";
      params = [attempt, retryAtMs(row.id, attempt, nowMs, policy), 'EXPIRED_RUNNING',
        'expired RUNNING lease', nowMs, row.id,
        token.generation, token.generation, token.ownerId, nowMs,
        token.ownerId, token.generation, nowMs];
    }
    var statement = this.db.prepare(sql);
    requiredMutation(
      this, token, nowMs, statement.run.apply(statement, params).changes,
      'JOB_RECOVERY_CONFLICT'
    );
    return count + 1;
  }.bind(this), 0);
};

// server/scheduler/store.js — public status and deletion/reconcile helpers.
SchedulerStore.prototype.cancel = function (token, key, reason, nowMs) {
  this.assertLiveLease(token, nowMs);
  if (['SUPERSEDED', 'ENTITY_REMOVED', 'STALE_REVISION', 'OPERATOR_CANCELLED'].indexOf(reason) < 0) {
    throw new Error('CANCEL_REASON_INVALID');
  }
  var row = this.getByIdempotencyKey(key);
  if (!row) return false;
  if (row.kind !== 'ACCOUNT_ADVANCE') throw new Error('GLOBAL_CANCEL_FORBIDDEN');
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='CANCELLED',cancel_reason=?,completed_at_ms=NULL," +
    "cancelled_at_ms=?,updated_at_ms=? WHERE idempotency_key=? " +
    "AND kind='ACCOUNT_ADVANCE' AND state IN ('PENDING','RETRY_WAIT') " +
    "AND blocked_by_job_id IS NULL " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(reason, nowMs, nowMs, key, token.ownerId,
    token.generation, nowMs).changes;
  return optionalMutation(this, token, nowMs, changed) === 1;
};
SchedulerStore.prototype.globalWatermarkS = function () {
  var row = this.db.prepare(
    "SELECT MIN(scheduled_at_s) AS atS FROM event_jobs " +
    "WHERE kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
    "AND state NOT IN ('COMPLETED','CANCELLED')"
  ).get();
  return row && row.atS === null ? null : Number(row.atS);
};
SchedulerStore.prototype.nextEligibleAtMs = function (nowMs, watermarkS) {
  var row = this.db.prepare(
    "SELECT MIN(CASE WHEN state='PENDING' THEN scheduled_at_s*1000 " +
    "ELSE retry_at_ms END) AS atMs FROM event_jobs " +
    "WHERE state IN ('PENDING','RETRY_WAIT') " +
    "AND (kind<>'ACCOUNT_ADVANCE' OR blocked_by_job_id IS NULL) " +
    "AND (? IS NULL OR scheduled_at_s<=?)"
  ).get(watermarkS, watermarkS);
  return row && row.atMs === null ? null : Number(row.atMs);
};
SchedulerStore.prototype.nextAccountEligibleAtMs = function (watermarkS) {
  var row = this.db.prepare(
    "SELECT MIN(CASE WHEN state='PENDING' THEN scheduled_at_s*1000 ELSE retry_at_ms END) " +
    "AS atMs FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' " +
    "AND state IN ('PENDING','RETRY_WAIT') AND blocked_by_job_id IS NULL " +
    "AND (? IS NULL OR scheduled_at_s<=?)"
  ).get(watermarkS, watermarkS);
  return row && row.atMs === null ? null : Number(row.atMs);
};
SchedulerStore.prototype.statusSnapshot = function (nowMs) {
  var counts = this.db.prepare("SELECT state,COUNT(*) AS n FROM event_jobs GROUP BY state").all();
  var byState = Object.fromEntries(counts.map(function (row) { return [row.state, Number(row.n)]; }));
  var due = this.db.prepare(
    "SELECT COUNT(*) AS n,MIN(CASE WHEN state='PENDING' THEN scheduled_at_s*1000 " +
    "ELSE retry_at_ms END) AS atMs FROM event_jobs WHERE (" +
    "(state='PENDING' AND scheduled_at_s*1000<=?) OR " +
    "(state='RETRY_WAIT' AND retry_at_ms<=?)) AND " +
    "(kind<>'ACCOUNT_ADVANCE' OR blocked_by_job_id IS NULL)"
  ).get(nowMs, nowMs);
  var next = this.db.prepare(
    "SELECT MIN(CASE WHEN state='PENDING' THEN scheduled_at_s*1000 ELSE retry_at_ms END) " +
    "AS atMs FROM event_jobs WHERE state IN ('PENDING','RETRY_WAIT') " +
    "AND (kind<>'ACCOUNT_ADVANCE' OR blocked_by_job_id IS NULL)"
  ).get().atMs;
  return {pending: byState.PENDING || 0, retryWait: byState.RETRY_WAIT || 0,
    running: byState.RUNNING || 0, quarantined: byState.QUARANTINED || 0,
    dueBacklog: Number(due.n || 0),
    oldestDueAgeMs: due.atMs === null ? 0 : Math.max(0, nowMs - Number(due.atMs)),
    nextEligibleAtMs: next === null ? null : Number(next)};
};
SchedulerStore.prototype.writeAudit = function (token, action, jobId, detail, nowMs) {
  this.assertLiveLease(token, nowMs);
  var changed = this.db.prepare(
    'INSERT INTO scheduler_audit(action,job_id,detail_safe,at_ms) ' +
    'SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM scheduler_lease ' +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(action, jobId, safeErrorMessage(detail), nowMs,
    token.ownerId, token.generation, nowMs).changes;
  requiredMutation(this, token, nowMs, changed, 'SCHEDULER_AUDIT_CONFLICT');
};
SchedulerStore.prototype.safeErrorMessage = function (value) { return safeErrorMessage(value); };
SchedulerStore.prototype.deterministicJitter = function (id, attempt) { return deterministicJitter(id, attempt); };
SchedulerStore.prototype.scrubLogEntry = function (entry) {
  var scrubbed = {event: String(entry.event), at: Number(entry.at)};
  if (!Number.isFinite(scrubbed.at)) throw new Error('SCHEDULER_LOG_TIME_INVALID');
  if (entry.code !== undefined) scrubbed.code = safeErrorMessage(entry.code);
  if ((entry.count !== undefined || entry.budgetExhausted !== undefined) &&
      scrubbed.event !== 'scheduler.tick') {
    throw new Error('SCHEDULER_LOG_TICK_FIELDS_INVALID');
  }
  if (entry.count !== undefined) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
      throw new Error('SCHEDULER_LOG_COUNT_INVALID');
    }
    scrubbed.count = entry.count;
  }
  if (entry.budgetExhausted !== undefined) {
    if (typeof entry.budgetExhausted !== 'boolean') {
      throw new Error('SCHEDULER_LOG_BUDGET_INVALID');
    }
    scrubbed.budgetExhausted = entry.budgetExhausted;
  }
  return scrubbed;
};

// server/scheduler/store.js — account-wake and global-resolution helpers.
SchedulerStore.prototype.assertReplayLineage = function (token, nowMs) {
  this.assertLiveLease(token, nowMs);
  var children = this.db.prepare(
    'SELECT * FROM event_jobs WHERE replay_of_job_id IS NOT NULL ORDER BY sequence,id'
  ).all();
  var unresolvedBySource = new Map();
  children.forEach(function (child) {
    var source = this.getById(child.replay_of_job_id);
    if (!source || source.replay_of_job_id !== null || child.kind !== source.kind ||
        Number(child.scheduled_at_s) !== Number(source.scheduled_at_s) ||
        Number(child.priority) !== Number(source.priority) ||
        child.aggregate_type !== source.aggregate_type ||
        child.aggregate_id !== source.aggregate_id ||
        child.expected_revision !== source.expected_revision ||
        child.payload_json !== source.payload_json ||
        child.payload_sha256 !== source.payload_sha256 ||
        Number(child.source_account_id) !== Number(source.source_account_id) ||
        Number(child.max_attempts) !== Number(source.max_attempts)) {
      fail('REPLAY_LINEAGE_INVALID');
    }
    if (child.state !== 'COMPLETED' && child.state !== 'CANCELLED') {
      if (source.state !== 'QUARANTINED' || source.resolved_by_job_id !== null ||
          unresolvedBySource.has(source.id)) {
        fail('REPLAY_LINEAGE_INVALID');
      }
      unresolvedBySource.set(source.id, child.id);
    } else {
      var application = this.db.prepare(
        'SELECT job_id,resolves_job_id FROM event_applications WHERE job_id=?'
      ).get(child.id);
      if (source.state !== 'CANCELLED' ||
          source.cancel_reason !== 'RESOLVED_BY_REPLAY' ||
          source.resolved_by_job_id !== child.id || !application ||
          application.job_id !== child.id || application.resolves_job_id !== source.id) {
        fail('REPLAY_LINEAGE_INVALID');
      }
    }
  }, this);
  return unresolvedBySource;
};
SchedulerStore.prototype.listLogicalBarrierJobsAtOrBefore = function (
  token, targetS, nowMs
) {
  var children = this.assertReplayLineage(token, nowMs);
  return this.db.prepare(
    "SELECT * FROM event_jobs WHERE replay_of_job_id IS NULL " +
    "AND kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
    "AND state NOT IN ('COMPLETED','CANCELLED') AND scheduled_at_s<=? " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
    ).all(targetS).map(function (root) {
      var execution = children.has(root.id) ? this.getById(children.get(root.id)) : root;
      return decorateLogicalGlobal(execution, root);
  }, this);
};
SchedulerStore.prototype.listBarrierJobsAtOrBefore = function (token, targetS, nowMs) {
  return this.listLogicalBarrierJobsAtOrBefore(token, targetS, nowMs);
};
SchedulerStore.prototype.adoptAccountAdvanceForCommand = function (token, accountId, targetS, nowMs, lockMs) {
  if (!Number.isSafeInteger(accountId) || accountId < 1) {
    fail('ACCOUNT_ADVANCE_ADOPTION_INVALID');
  }
  this.assertLiveLease(token, nowMs);
  var nowS = Math.floor(nowMs / 1000);
  var sql = "WITH live_lease AS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=@ownerId AND generation=@generation " +
    "AND expires_at_ms>@nowMs), candidate AS (SELECT id FROM event_jobs " +
    "WHERE kind='ACCOUNT_ADVANCE' AND aggregate_type='account' " +
    "AND aggregate_id=@accountId AND scheduled_at_s<=@targetS " +
    "AND blocked_by_job_id IS NULL AND (" +
    "(state='PENDING' AND scheduled_at_s<=@nowS) OR " +
    "(state='RETRY_WAIT' AND retry_at_ms<=@nowMs) OR " +
    "(state='RUNNING' AND locked_by=@ownerId AND locked_generation=@generation " +
    "AND locked_until_ms>@nowMs)) ORDER BY scheduled_at_s,priority,sequence,id LIMIT 1) " +
    "UPDATE event_jobs SET state='RUNNING',locked_by=@ownerId," +
    "locked_generation=@generation,locked_until_ms=@lockedUntil,updated_at_ms=@nowMs " +
    "WHERE id=(SELECT id FROM candidate) AND EXISTS (SELECT 1 FROM live_lease) RETURNING *";
  var row = this.db.prepare(sql).get({ownerId: token.ownerId,
    generation: token.generation, nowMs: nowMs, nowS: nowS,
    accountId: String(accountId), targetS: targetS, lockedUntil: nowMs + lockMs});
  if (!row) {
    if (!this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
    return null;
  }
  return this.loadExecutableJob(token, row, nowMs);
};
SchedulerStore.prototype.replaceAccountAdvance = function (
  token, accountId, revision, nextLocalAtS, nowMs
) {
  this.assertLiveLease(token, nowMs);
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('ACCOUNT_ADVANCE_REPLACEMENT_INVALID');
  }
  var key = Number.isSafeInteger(nextLocalAtS) ?
    'account-advance:' + accountId + ':' + revision : null;
  var blocked = this.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state='PENDING' AND blocked_by_job_id IS NOT NULL " +
    "ORDER BY sequence,id LIMIT 1"
  ).get(String(accountId));
  if (blocked) return blocked;
  // A RUNNING continuation is the writer's own checkpoint and must survive;
  // every other un-applied local wake becomes retained CANCELLED history.
  var cancelled = this.db.prepare(
    "UPDATE event_jobs SET state='CANCELLED',cancel_reason='SUPERSEDED'," +
    "completed_at_ms=NULL,cancelled_at_ms=?,updated_at_ms=? " +
    "WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? AND state IN ('PENDING','RETRY_WAIT') " +
    "AND blocked_by_job_id IS NULL " +
    "AND (? IS NULL OR idempotency_key<>?) AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(nowMs, nowMs, String(accountId), key, key,
    token.ownerId, token.generation, nowMs).changes;
  optionalMutation(this, token, nowMs, cancelled);
  if (key === null) return null;
  return this.schedule(token, {kind: 'ACCOUNT_ADVANCE', scheduledAtS: nextLocalAtS,
    priority: 100, idempotencyKey: key, aggregateType: 'account', aggregateId: String(accountId),
    expectedRevision: revision, maxAttempts: 8,
    payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: nextLocalAtS}}, nowMs);
};
SchedulerStore.prototype.blockOwnedAccountAdvance = function (
  token, job, checkpointRevision, blockedByJobId, nowMs
) {
  this.assertLiveLease(token, nowMs);
  assertSchedulerJobId(blockedByJobId);
  job = this.loadExecutableJob(token, job, nowMs);
  if (!Number.isSafeInteger(checkpointRevision) || checkpointRevision < 0) {
    throw new Error('CHECKPOINT_REVISION_INVALID');
  }
  var dependency = this.db.prepare(
    "SELECT * FROM event_jobs WHERE id=? AND kind IN " +
    "('PVP_RESOLVE','EXTERNAL_RESOLVE') AND source_account_id=? " +
    "AND replay_of_job_id IS NULL AND state IN " +
    "('PENDING','RUNNING','RETRY_WAIT','QUARANTINED')"
  ).get(blockedByJobId, Number(job.aggregate_id));
  if (!dependency || Number(job.scheduled_at_s) > Number(dependency.scheduled_at_s)) {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_INVALID');
  }
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='PENDING',checkpoint_revision=?,blocked_by_job_id=?," +
    "retry_at_ms=NULL,quarantined_at_ms=NULL,error_code=NULL,error_message_safe=NULL," +
    "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL,updated_at_ms=? " +
    "WHERE id=? AND kind='ACCOUNT_ADVANCE' AND state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? " +
    "AND (blocked_by_job_id IS NULL OR blocked_by_job_id=?) " +
    "AND NOT EXISTS (SELECT 1 FROM event_jobs sibling WHERE sibling.id<>event_jobs.id " +
    "AND sibling.kind='ACCOUNT_ADVANCE' AND sibling.aggregate_id=event_jobs.aggregate_id " +
    "AND sibling.state IN ('PENDING','RETRY_WAIT','RUNNING')) " +
    "AND EXISTS (SELECT 1 FROM dq WHERE tk=? AND revision=?) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(checkpointRevision, blockedByJobId, nowMs, job.id, token.ownerId,
    token.generation, nowMs, blockedByJobId, Number(job.aggregate_id), checkpointRevision,
    token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'ACCOUNT_ADVANCE_BLOCK_CONFLICT');
  return this.getById(job.id);
};
SchedulerStore.prototype.releaseBlockedAccountDependents = function (
  token, terminalGlobalJobId, nowMs
) {
  this.assertLiveLease(token, nowMs);
  assertSchedulerJobId(terminalGlobalJobId);
  var proved = this.db.prepare(
    "SELECT 1 FROM event_jobs root WHERE root.id=? AND root.kind IN " +
    "('PVP_RESOLVE','EXTERNAL_RESOLVE') AND root.state IN ('COMPLETED','CANCELLED') " +
    "AND ((EXISTS (SELECT 1 FROM event_applications a WHERE a.job_id=root.id)) " +
    "OR (root.cancel_reason='RESOLVED_BY_REPLAY' AND root.resolved_by_job_id IS NOT NULL " +
    "AND EXISTS (SELECT 1 FROM event_applications a WHERE " +
    "a.job_id=root.resolved_by_job_id AND a.resolves_job_id=root.id)))"
  ).get(terminalGlobalJobId);
  if (!proved) throw new Error('ACCOUNT_ADVANCE_RELEASE_UNPROVED');
  var changed = this.db.prepare(
    "UPDATE event_jobs SET blocked_by_job_id=NULL," +
    "checkpoint_revision=(SELECT revision FROM dq " +
    "WHERE tk=CAST(event_jobs.aggregate_id AS INTEGER)),updated_at_ms=? " +
    "WHERE blocked_by_job_id=? AND kind='ACCOUNT_ADVANCE' AND state='PENDING' " +
    "AND EXISTS (SELECT 1 FROM dq WHERE tk=CAST(event_jobs.aggregate_id AS INTEGER)) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(nowMs, terminalGlobalJobId, token.ownerId,
    token.generation, nowMs).changes;
  return optionalMutation(this, token, nowMs, changed);
};
SchedulerStore.prototype.parkGlobalBehindPreceding = function (
  token, runningJob, precedingJobId, targetS, nowMs
) {
  this.assertLiveLease(token, nowMs);
  assertSchedulerJobId(precedingJobId);
  runningJob = this.loadExecutableJob(token, runningJob, nowMs);
  var first = this.listBarrierJobsAtOrBefore(token, targetS, nowMs)[0];
  if (!first || first.id !== precedingJobId) {
    throw new Error('BARRIER_PRECEDING_ROOT_CHANGED');
  }
  function tuple(row) {
    return [Number(row.logical_scheduled_at_s === undefined ?
      row.scheduled_at_s : row.logical_scheduled_at_s),
    Number(row.logical_priority === undefined ? row.priority : row.logical_priority),
    Number(row.logical_sequence === undefined ? row.sequence : row.logical_sequence),
    String(row.logical_order_id || row.logical_root_id || row.id)];
  }
  var left = tuple(first), right = tuple(runningJob);
  var earlier = left[0] < right[0] || left[0] === right[0] &&
    (left[1] < right[1] || left[1] === right[1] &&
    (left[2] < right[2] || left[2] === right[2] && left[3] < right[3]));
  if (!earlier) throw new Error('BARRIER_PRECEDING_ORDER_INVALID');
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='PENDING',locked_by=NULL," +
    "locked_generation=NULL,locked_until_ms=NULL,updated_at_ms=? " +
    "WHERE id=? AND state='RUNNING' AND locked_by=? AND locked_generation=? " +
    "AND locked_until_ms>? " +
    "AND NOT EXISTS (SELECT 1 FROM event_applications WHERE job_id=event_jobs.id) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(nowMs, runningJob.id, token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'BARRIER_PARK_CONFLICT');
  return this.getById(runningJob.id);
};
SchedulerStore.prototype.assertAccountDependencyIntegrity = function (token, nowMs) {
  this.assertLiveLease(token, nowMs);
  var invalid = this.db.prepare(
    "SELECT child.id FROM event_jobs child LEFT JOIN event_jobs parent " +
    "ON parent.id=child.blocked_by_job_id WHERE child.blocked_by_job_id IS NOT NULL " +
    "AND (child.kind<>'ACCOUNT_ADVANCE' OR child.state<>'PENDING' " +
    "OR parent.id IS NULL OR parent.kind NOT IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
    "OR parent.replay_of_job_id IS NOT NULL OR parent.source_account_id IS NULL " +
    "OR CAST(child.aggregate_id AS INTEGER)<>parent.source_account_id " +
    "OR child.scheduled_at_s>parent.scheduled_at_s " +
    "OR parent.state IN ('COMPLETED','CANCELLED') OR EXISTS (" +
    "SELECT 1 FROM event_jobs sibling WHERE sibling.id<>child.id " +
    "AND sibling.kind='ACCOUNT_ADVANCE' AND sibling.aggregate_id=child.aggregate_id " +
    "AND sibling.state IN ('PENDING','RETRY_WAIT','RUNNING'))) LIMIT 1"
  ).get();
  if (invalid) throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CORRUPT');
  return true;
};
SchedulerStore.prototype.listDerivedJobsForAccount = function (token, accountId, nowMs) {
  this.assertLiveLease(token, nowMs);
  var children = this.assertReplayLineage(token, nowMs);
  var rows = this.db.prepare(
    "SELECT * FROM event_jobs WHERE replay_of_job_id IS NULL AND source_account_id=? " +
    "AND kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
    "AND state NOT IN ('COMPLETED','CANCELLED') " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
  ).all(Number(accountId)).map(function (root) {
    var execution = children.has(root.id) ? this.getById(children.get(root.id)) : root;
    var payload = parseCanonicalBoundedJson(
      execution.payload_json, execution.payload_sha256
    );
    var validated;
    try {
      validated = validateJob(executableInput(execution, payload), {allowReconcile: true});
    } catch (error) { throw payloadIntegrity(); }
    if (!validated.payload || !validated.payload.ref) throw payloadIntegrity();
      return Object.freeze(Object.assign(decorateLogicalGlobal(execution, root), {
        canonical_ref: Object.freeze(validated.payload.ref)
      }));
  }, this);
  return rows;
};
SchedulerStore.prototype.listUnresolvedGlobalRefsAtOrBefore = function (
  token, accountId, targetS, nowMs
) {
  return this.listUnresolvedGlobalEntriesAtOrBefore(token, targetS, nowMs)
    .filter(function (row) {
      return Number(row.job.source_account_id) === Number(accountId);
    }).map(function (row) { return row.ref; });
};
SchedulerStore.prototype.listUnresolvedGlobalEntriesAtOrBefore = function (
  token, targetS, nowMs
) {
  this.assertLiveLease(token, nowMs);
  return this.listLogicalBarrierJobsAtOrBefore(token, targetS, nowMs).map(function (row) {
    var payload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
    var validated;
    try {
      validated = validateJob(executableInput(row, payload), {allowReconcile: true});
    } catch (error) { throw payloadIntegrity(); }
    if (!validated.payload || !validated.payload.ref) throw payloadIntegrity();
    return Object.freeze({job: Object.freeze(Object.assign({}, row)),
      ref: Object.freeze(validated.payload.ref)});
  });
};
SchedulerStore.prototype.wouldSchedule = function (job) {
  validateJob(job, {allowReconcile: true});
  var row = this.getByIdempotencyKey(job.idempotencyKey);
  if (!row) return true;
  return row.payload_sha256 !== sha256(canonicalJson(job.payload)) ||
    row.kind !== job.kind || Number(row.scheduled_at_s) !== Number(job.scheduledAtS);
};
SchedulerStore.prototype.wouldEnsureReconcileAccountAdvance = function (job) {
  // `localWakeFor` deliberately returns a template: only the allocator may
  // put its fresh epoch into an idempotency key.  Normalize first, then ask
  // whether the one persisted live row is semantically equivalent.
  var normalized = normalizeReconcileTemplate(job);
  var current = this.db.prepare('SELECT revision FROM dq WHERE tk=?')
    .get(Number(normalized.aggregateId));
  var live = this.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_type='account' " +
    "AND aggregate_id=? AND state IN ('PENDING','RETRY_WAIT','RUNNING') " +
    'ORDER BY scheduled_at_s,priority,sequence,id'
  ).all(String(normalized.aggregateId));
  if (!current || live.length !== 1) return true;
  var row = live[0], payload;
  if (row.state === 'RUNNING' || row.blocked_by_job_id !== null) return false;
  try { payload = JSON.parse(row.payload_json); } catch (error) { return true; }
  return !(Number(row.expected_revision) === -1 && payload.reconcile === true &&
    Number(payload.reconcileRevision) === Number(current.revision) &&
    Number(row.scheduled_at_s) === Number(normalized.scheduledAtS) &&
    Number(row.priority) === 200 &&
    (row.checkpoint_revision === null || row.checkpoint_revision === undefined));
};
SchedulerStore.prototype.wouldReplaceAccountAdvanceWithNoWake = function (accountId) {
  var blocked = this.db.prepare(
    "SELECT 1 FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state='PENDING' AND blocked_by_job_id IS NOT NULL LIMIT 1"
  ).get(String(accountId));
  if (blocked) return false;
  return Boolean(this.db.prepare(
    "SELECT 1 FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state IN ('PENDING','RETRY_WAIT') AND blocked_by_job_id IS NULL LIMIT 1"
  ).get(String(accountId)));
};
SchedulerStore.prototype.hasObsoleteDerivedJobs = function (
  token, accountId, liveKeys, nowMs, protectedRecoveryRootIds
) {
  return this.listDerivedJobsForAccount(token, accountId, nowMs)
    .some(function (row) {
      return row.state !== 'RUNNING' && !liveKeys.has(row.logical_key) &&
        !(protectedRecoveryRootIds && protectedRecoveryRootIds.has(row.logical_root_id));
    });
};
SchedulerStore.prototype.hasDeletedAccountOrphans = function () {
  return Boolean(this.db.prepare(
    "SELECT 1 FROM event_jobs j LEFT JOIN dq d ON d.tk=CAST(j.aggregate_id AS INTEGER) " +
    "WHERE j.kind='ACCOUNT_ADVANCE' AND j.state IN ('PENDING','RETRY_WAIT','RUNNING') " +
    "AND d.tk IS NULL UNION ALL SELECT 1 FROM event_jobs j LEFT JOIN dq d ON d.tk=j.source_account_id " +
    "WHERE j.kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') AND j.source_account_id IS NOT NULL " +
    "AND j.state IN ('PENDING','RETRY_WAIT','RUNNING','QUARANTINED') " +
    "AND d.tk IS NULL LIMIT 1"
  ).get());
};
SchedulerStore.prototype.resolveDeletedAccountJobs = function (token, accountId, atS, nowMs) {
  this.assertLiveLease(token, nowMs);
  var local = this.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state IN ('PENDING','RETRY_WAIT','RUNNING') ORDER BY sequence,id"
  ).all(String(accountId));
  if (local.some(function (job) { return job.state === 'RUNNING'; })) {
    throw new Error('DELETED_ACCOUNT_RUNNING_ACTIVE');
  }
  this.cancelAccountAdvancesForDeletion(token, accountId, nowMs);
  // Global rows are returned to the caller. The owning Writer/reducer must
  // run resolveCanonicalGlobalInCurrentUow before dq deletion; Store cannot
  // terminalize them or release dependencies by itself.
  return this.listDerivedJobsForAccount(token, accountId, nowMs);
};
SchedulerStore.prototype.cancelAccountAdvancesForDeletion = function (
  token, accountId, nowMs
) {
  this.assertLiveLease(token, nowMs);
  if (this.db.prepare(
    "SELECT 1 FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state='RUNNING' LIMIT 1"
  ).get(String(accountId))) throw new Error('DELETED_ACCOUNT_RUNNING_ACTIVE');
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='CANCELLED',cancel_reason='ENTITY_REMOVED'," +
    "cancelled_at_ms=?,updated_at_ms=?,blocked_by_job_id=NULL,retry_at_ms=NULL " +
    "WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? " +
    "AND state IN ('PENDING','RETRY_WAIT') AND EXISTS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(nowMs, nowMs, String(accountId), token.ownerId,
    token.generation, nowMs).changes;
  return optionalMutation(this, token, nowMs, changed);
};
SchedulerStore.prototype.inspectLogicalJob = function (token, jobId, nowMs) {
  var row = this.getById(jobId);
  if (!row) return null;
  var children = this.assertReplayLineage(token, nowMs);
  var root = row.replay_of_job_id ? this.getById(row.replay_of_job_id) : row;
  var child = children.has(root.id) ? this.getById(children.get(root.id)) : null;
  return {root: root, activeChild: child};
};

module.exports = {
  SchedulerStore: SchedulerStore,
  assertSchedulerOwnerId: assertSchedulerOwnerId,
  canonicalJson: canonicalJson,
  sha256: sha256,
  parseCanonicalBoundedJson: parseCanonicalBoundedJson,
  payloadIntegrity: payloadIntegrity,
  validateJob: validateJob,
  deterministicJitter: deterministicJitter,
  retryAtMs: retryAtMs,
  safeErrorMessage: safeErrorMessage,
  invalidationResult: invalidationResult,
  normalizeSchedulerErrorCode: normalizeSchedulerErrorCode
};
// END TASK2_CANONICAL_STORE
```

The body intentionally omits orphan sweeping. Task 4 adds `invalidateGlobalJob` and `sweepDeletedAccountOrphans` together, with deleted local/global aggregate coverage.

- [ ] **Step 4: Run the sole GREEN and all gates in binding order**

Run the GREEN exactly once:

```bash
set -Eeuo pipefail
tap_file="$(mktemp)"
cleanup() { rm -f "$tap_file"; }
trap cleanup EXIT HUP INT TERM
set +e
node --test-reporter=tap tools/test-scheduler.js >"$tap_file" 2>&1
tap_status=$?
set -e
cat "$tap_file"
rg -q '^# tests [1-9][0-9]*$' "$tap_file"
positive_status=$?
rg -q '^# tests 62$' "$tap_file"
tests_status=$?
rg -q '^# pass 61$' "$tap_file"
pass_status=$?
rg -q '^# fail 0$' "$tap_file"
fail_status=$?
rg -q '^# skipped 1$' "$tap_file"
skip_status=$?
test "$tap_status" -eq 0
node_status=$?
test "$positive_status" -eq 0
test "$tests_status" -eq 0
test "$pass_status" -eq 0
test "$fail_status" -eq 0
test "$skip_status" -eq 0
test "$node_status" -eq 0
rm -f "$tap_file"
trap - EXIT HUP INT TERM
unset tap_file
unset -f cleanup
```

Immediately after GREEN, run:

```bash
set +e
npm test
task2_npm_status=$?
set -e
node tools/test-scheduler.js
node --throw-deprecation tools/test-scheduler.js
node --check server/scheduler/store.js
node --check tools/test-scheduler.js
node tools/lint.js
set +e
node tools/check-syntax.js
task2_check_syntax_status=$?
set -e
export task2_npm_status task2_check_syntax_status
printf 'npm_test_status=%s\ncheck_syntax_status=%s\n' \
  "$task2_npm_status" "$task2_check_syntax_status"
```

Then run protected/scope/static/temp gates without staging:

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
  docs/superpowers/plans/2026-08-23-durable-event-scheduler-implementation.md | cut -d' ' -f1)" = \
  cbc05d4b8127f7f530bb13789f6fce0aee961e576ced279871d0f43ec67cb8d3
test "$(sha256sum \
  .superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-1-report.md | \
  cut -d' ' -f1)" = \
  6a1c37a1c9e5e04df308b20016a39a6dc4335cf891d809643096791bd510ab38
test -n "${task2_scope_before:-}"
test -f "$task2_scope_before"
task2_scope_after="$(mktemp)"
find . -path './.git' -prune -o -type f \
  ! -path './tools/test-scheduler.js' \
  ! -path './server/scheduler/store.js' \
  ! -path './.superpowers/sdd/2026-08-23-durable-event-scheduler-implementation/task-2-report.md' \
  -print0 | sort -z | xargs -0 sha256sum >"$task2_scope_after"
cmp -s "$task2_scope_before" "$task2_scope_after"
rm -f "$task2_scope_before" "$task2_scope_after"
unset task2_scope_before task2_scope_after
git diff --cached --name-only
test "$(git diff --cached --name-only | wc -l)" -eq 0
git diff --check -- server/scheduler/store.js tools/test-scheduler.js
test "$(awk 'length($0)>120{n++} END{print n+0}' server/scheduler/store.js)" -eq 0
test "$(awk 'length($0)>120{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(rg -n '[[:blank:]]+$' server/scheduler/store.js tools/test-scheduler.js | wc -l)" -eq 0
test "$(rg -c '^test\(' tools/test-scheduler.js)" -eq 62
test "$(awk '/t\.test\(/{n++} END{print n+0}' tools/test-scheduler.js)" -eq 0
test "$(rg -c '^  prove\(' tools/test-scheduler.js)" -eq 24
test "$(awk '/sweepDeletedAccountOrphans|invalidateGlobalJob/{n++} END{print n+0}' \
  server/scheduler/store.js)" -eq 0
test "$(rg -c '^// BEGIN TASK2_CANONICAL_STORE$' server/scheduler/store.js)" -eq 1
test "$(rg -c '^// END TASK2_CANONICAL_STORE$' server/scheduler/store.js)" -eq 1
node - <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync('server/scheduler/store.js', 'utf8');
const definitions = new Set(Array.from(
  source.matchAll(/SchedulerStore\.prototype\.([A-Za-z0-9_]+)\s*=/g),
  function (match) { return match[1]; }
));
const calls = new Set(Array.from(
  source.matchAll(/this\.([A-Za-z0-9_]+)\s*\(/g),
  function (match) { return match[1]; }
));
const missing = Array.from(calls).filter(function (name) { return !definitions.has(name); });
if (missing.length) throw new Error('undefined Store calls: ' + missing.join(','));
NODE
test -n "${task2_temp_before:-}"
test -f "$task2_temp_before"
task2_temp_after="$(mktemp)"
find /tmp -maxdepth 3 \
  \( -type d -name 'thdc-scheduler-*' -o -type f -name 'game.sqlite' -o \
  -type f -name 'game.sqlite-wal' -o -type f -name 'game.sqlite-shm' \) \
  -print | sort >"$task2_temp_after"
task2_temp_delta="$(comm -13 "$task2_temp_before" "$task2_temp_after")"
printf '%s' "$task2_temp_delta"
rm -f "$task2_temp_before" "$task2_temp_after"
unset task2_temp_before task2_temp_after
test -z "$task2_temp_delta"
```

The temp delta must be empty. If it is not, remove only Task-2 paths proven new by the delta and rerun the comparison;
never delete foreign `/tmp` state. Preserve the `npm test` server/socket and aggregate syntax-spawn outcomes exactly
as observed.

- [ ] **Step 5: Write the Task-2 report and record commit intent only**

Create the authorized report only after the GREEN/direct/static gates. It must state the dedicated-plan path/SHA/line/byte identity, remediation-spec SHA, Task-1 baseline hashes, exact allowed and changed paths, all 34 test names, every lease-fence fault-injection label and zero-mutation result, literal RED/GREEN summaries and statuses, immediate `npm test` result, every direct/deprecation/static/scope/temp result, final Store/test hashes and sizes, protected-hash comparison, zero cached paths, and any truthful environmental blocker. It must explicitly state that orphan sweeping remains Task 4 work and that the final source contains one canonical Store body.

Record this unexecuted intent:

```text
feat: add authoritative durable scheduler store
```

Do not run `git add` or `git commit`. Mark the report `READY_FOR_REVIEW` only if the strict GREEN/direct gates pass and every environmental failure is labeled as a blocker rather than a pass. Task 3 remains blocked pending independent logic and scope/runtime approval.

## Authoring-time extraction and assembly verification

Run these read-only commands against this plan. The expected hashes and sizes below are frozen plan artifacts, not implementation output:

```bash
set -Eeuo pipefail
plan=docs/superpowers/plans/2026-08-24-durable-store-task2-remediation-implementation.md
test_append="$(mktemp)"
store_body="$(mktemp)"
assembled="$(mktemp)"
cleanup() { rm -f "$test_append" "$store_body" "$assembled"; }
trap cleanup EXIT HUP INT TERM
awk '/^\/\/ BEGIN TASK2_TEST_APPEND$/{on=1} on{print} \
  /^\/\/ END TASK2_TEST_APPEND$/{exit}' "$plan" >"$test_append"
awk '/^\/\/ BEGIN TASK2_CANONICAL_STORE$/{on=1} on{print} \
  /^\/\/ END TASK2_CANONICAL_STORE$/{exit}' "$plan" >"$store_body"
{ head -n 1954 tools/test-scheduler.js; printf '\n'; cat "$test_append"; } >"$assembled"
node --check - <"$test_append"
node --check - <"$store_body"
node --check - <"$assembled"
test "$(rg -c '^test\(' "$test_append")" -eq 34
test "$(awk '/t\.test\(/{n++} END{print n+0}' "$test_append")" -eq 0
test "$(rg -c '^  prove\(' "$test_append")" -eq 24
test "$(rg -c '^SchedulerStore\.prototype\.[A-Za-z0-9_]* =' "$store_body")" -eq 63
test "$(awk '/sweepDeletedAccountOrphans|invalidateGlobalJob/{n++} END{print n+0}' \
  "$store_body")" -eq 0
test "$(sha256sum "$test_append" | cut -d' ' -f1)" = \
  2a7e8eb44e899514fbadb9a21eccb1f72c9215932d1f99335d23549a3ed10bbe
test "$(wc -l <"$test_append")" -eq 1824
test "$(wc -c <"$test_append")" -eq 83714
test "$(sha256sum "$store_body" | cut -d' ' -f1)" = \
  8c5e609f10b51271fca826adbc2709e20f5f97500cc1d6a2c8ec5c15db362e09
test "$(wc -l <"$store_body")" -eq 1666
test "$(wc -c <"$store_body")" -eq 83078
test "$(sha256sum "$assembled" | cut -d' ' -f1)" = \
  9c1960ce0d9c2d593b8bb66540f5468483baa678e565face7b638fb23faf5b5b
test "$(wc -l <"$assembled")" -eq 3779
test "$(wc -c <"$assembled")" -eq 162109
rm -f "$test_append" "$store_body" "$assembled"
trap - EXIT HUP INT TERM
unset test_append store_body assembled
unset -f cleanup
```
