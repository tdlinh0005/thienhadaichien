'use strict';

var G = require('../rules.js').G;
var TheGioi = require('../world.js').TheGioi;
var apDungMigrationScheduler = require('./migrations.js').apDungMigrationScheduler;
var storeModule = require('./store.js');
var SchedulerStore = storeModule.SchedulerStore;
var assertSchedulerOwnerId = storeModule.assertSchedulerOwnerId;
var canonicalJson = storeModule.canonicalJson;
var events = require('./events.js');
var deriveExternalJobs = events.deriveExternalJobs;
var canonicalExternalStatus = events.canonicalExternalStatus;
var stableFleetRef = events.stableFleetRef;
var stableMissileRef = events.stableMissileRef;
var sameExternalRef = events.sameExternalRef;
var GameAdvanceService = require('./advance-service.js').GameAdvanceService;
var EventReducer = require('./reducers.js').EventReducer;

function requireCutoverContext(context) {
  if (!context || !context.kho || !context.store || !context.world ||
      !context.clock || !context.leaseToken) throw new Error('CUTOVER_CONTEXT_INVALID');
  return context;
}

function effectiveNow(context) {
  var wall = Number(context.clock.nowMs());
  var prior = context.store.peekEffectiveNowMs(wall);
  if (!Number.isSafeInteger(wall) || !Number.isSafeInteger(prior)) {
    throw new Error('EFFECTIVE_NOW_INVALID');
  }
  return Math.max(wall, prior, Number(context.effectiveNowMs || 0));
}

function canonicalRows(kho) {
  return kho.db.prepare('SELECT * FROM dq ORDER BY tk').all().map(function (row) {
    var accountId = Number(row.tk);
    var revision = Number(row.revision);
    var state;
    if (!Number.isSafeInteger(accountId) || accountId < 1 ||
        !Number.isSafeInteger(revision) || revision < 0 ||
        typeof row.state !== 'string') {
      throw new Error('CANONICAL_STATE_INVALID');
    }
    try {
      state = JSON.parse(row.state);
    } catch (error) {
      throw new Error('CANONICAL_STATE_INVALID');
    }
    if (!state || typeof state !== 'object' || Array.isArray(state) ||
        !Array.isArray(state.planets) || !Array.isArray(state.fleets) ||
        !Array.isArray(state.tenLua || [])) {
      throw new Error('CANONICAL_STATE_INVALID');
    }
    return Object.assign({}, row, {
      tk: accountId,
      revision: revision,
      state: row.state,
      st: state
    });
  });
}

function canonicalTargetOwners(rows) {
  var owners = new Map();
  rows.forEach(function (entry) {
    (entry.st.planets || []).forEach(function (planet) {
      var key = G.tdKey(planet.c);
      if (owners.has(key) && owners.get(key) !== entry.tk) {
        throw new Error('CANONICAL_TARGET_OWNER_CONFLICT');
      }
      owners.set(key, entry.tk);
    });
  });
  return owners;
}

function localWakeFor(row, owners) {
  var next = G.phanLoaiSuKienNoiBoKe(row.st, row.tk, function (targetKey) {
    return owners.has(targetKey) ? owners.get(targetKey) : null;
  });
  if (!next) return null;
  return {
    kind: 'ACCOUNT_ADVANCE',
    scheduledAtS: next.atS,
    priority: 200,
    aggregateType: 'account',
    aggregateId: String(row.tk),
    expectedRevision: -1,
    payload: {
      schemaVersion: 1,
      accountId: row.tk,
      nextLocalAtS: next.atS,
      reconcile: true,
      reconcileRevision: row.revision
    },
    maxAttempts: 8
  };
}

function nextCursor(kho) {
  var row = kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='reconcile_cursor'").get();
  return row ? Number(row.value) : null;
}

function writeCursor(kho, cursor, nowMs) {
  kho.db.prepare(
    "INSERT INTO scheduler_meta(key,value,updated_at_ms) VALUES('reconcile_cursor',?,?) " +
    'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at_ms=excluded.updated_at_ms'
  ).run(String(cursor), nowMs);
}

function sortedByUtf8(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'));
}

function projectionRows(context, all) {
  var owners = canonicalTargetOwners(all);
  var accountIds = new Set(all.map(function (row) { return Number(row.tk); }));
  var ht = [];
  var hamdang = [];
  var hamgiu = [];
  all.forEach(function (row) {
    (row.st.planets || []).forEach(function (planet, index) {
      ht.push({
        td: G.tdKey(planet.c),
        tk: Number(row.tk),
        ten: planet.ten,
        pi: index,
        thuDo: planet.thuDo ? 1 : 0
      });
    });
  });
  all.forEach(function (row) {
    (row.st.fleets || []).forEach(function (fleet) {
      var destination = fleet && fleet.den ? G.tdKey(fleet.den) : null;
      if (fleet && fleet.pha === 'di' &&
          (fleet.mission === 'attack' || fleet.mission === 'transport' ||
          fleet.mission === 'hold')) {
        var targetOwner = destination && owners.has(destination) ? owners.get(destination) : null;
        if (targetOwner && (Number(targetOwner) !== Number(row.tk) || fleet.mission === 'hold')) {
          hamdang.push({
            tkA: Number(row.tk),
            fid: Number(fleet.id),
            tkD: Number(targetOwner),
            tu: G.tdKey(fleet.tu),
            den: destination,
            nv: fleet.mission,
            denT: Math.round(fleet.den_t),
            tenA: row.st.ten,
            lmA: row.st.lm ? row.st.lm.ten : null
          });
        }
      }
      if (!fleet || fleet.mission !== 'hold' || fleet.pha !== 'giu') return;
      var heldFor = Number(fleet.giuTaiTk);
      var holdAt = Math.floor(Number(fleet.giuLuc) || 0);
      var holdUntil = Math.floor(Number(fleet.giuDen_t) || 0);
      if (!Number.isSafeInteger(heldFor) || heldFor < 1 || !accountIds.has(heldFor) ||
          !(holdAt >= 0) || !(holdUntil > holdAt)) return;
      hamgiu.push({
        tkA: Number(row.tk),
        fid: Number(fleet.id),
        tkD: heldFor,
        tu: G.tdKey(fleet.tu),
        td: destination,
        giuLuc: holdAt,
        giuDenT: holdUntil,
        tiepNLT: Math.floor(Number(fleet.tiepNL_t) || holdUntil)
      });
    });
  });
  ht.sort(function (left, right) { return sortedByUtf8(left.td, right.td); });
  function fleetOrder(left, right) { return left.tkA - right.tkA || left.fid - right.fid; }
  hamdang.sort(fleetOrder);
  hamgiu.sort(fleetOrder);
  void context;
  return {ht: ht, hamdang: hamdang, hamgiu: hamgiu};
}

function actualProjectionRows(context) {
  return {
    ht: context.kho.db.prepare(
      'SELECT td,tk,ten,pi,thuDo FROM ht ORDER BY td'
    ).all().map(function (row) {
      return {td: row.td, tk: Number(row.tk), ten: row.ten,
        pi: Number(row.pi), thuDo: Number(row.thuDo)};
    }),
    hamdang: context.kho.db.prepare(
      'SELECT tkA,fid,tkD,tu,den,nv,denT,tenA,lmA FROM hamdang ORDER BY tkA,fid'
    ).all().map(function (row) {
      return {tkA: Number(row.tkA), fid: Number(row.fid), tkD: Number(row.tkD),
        tu: row.tu, den: row.den, nv: row.nv, denT: Number(row.denT),
        tenA: row.tenA, lmA: row.lmA};
    }),
    hamgiu: context.kho.db.prepare(
      'SELECT tkA,fid,tkD,tu,td,giuLuc,giuDenT,tiepNLT FROM hamgiu ORDER BY tkA,fid'
    ).all().map(function (row) {
      return {tkA: Number(row.tkA), fid: Number(row.fid), tkD: Number(row.tkD),
        tu: row.tu, td: row.td, giuLuc: Number(row.giuLuc),
        giuDenT: Number(row.giuDenT), tiepNLT: Number(row.tiepNLT)};
    })
  };
}

function projectionsNeedRebuild(context, all) {
  var expected = projectionRows(context, all);
  var actual = actualProjectionRows(context);
  return canonicalJson(expected) !== canonicalJson(actual);
}

function canonicalExactLogicalKeysForAccount(context, accountId, nowMs) {
  if (typeof context.store.canonicalExactLogicalKeysForAccount === 'function') {
    return context.store.canonicalExactLogicalKeysForAccount(
      context.leaseToken, accountId, nowMs
    );
  }
  var keys = new Set();
  context.store.listDerivedJobsForAccount(context.leaseToken, accountId, nowMs)
    .forEach(function (job) {
      if (canonicalExternalStatus(context.kho, job.canonical_ref) === 'EXACT') {
        keys.add(job.logical_key);
      }
    });
  return keys;
}

function dryCutoverPreflight(context, remainingBudget, preflightNowMs) {
  var states = new Map(canonicalRows(context.kho).map(function (row) {
    return [Number(row.tk), JSON.parse(JSON.stringify(row.st))];
  }));
  var entries = context.store.listUnresolvedGlobalEntriesAtOrBefore(
    context.leaseToken, context.cutoverAtS, preflightNowMs
  ).map(function (entry) {
    return {job: Object.assign({}, entry.job), ref: entry.ref, persisted: true};
  });
  var nextSequence = entries.reduce(function (maximum, entry) {
    return Math.max(maximum, Number(entry.job.sequence || 0));
  }, 0) + 1;
  var knownKeys = new Set(entries.map(function (entry) {
    return entry.job.logical_key || entry.job.idempotency_key;
  }));
  var processed = 0;

  function rebuildOwners() {
    var owners = new Map();
    Array.from(states).sort(function (left, right) {
      return left[0] - right[0];
    }).forEach(function (entry) {
      (entry[1].planets || []).forEach(function (planet) {
        var key = G.tdKey(planet.c);
        if (owners.has(key) && owners.get(key) !== entry[0]) {
          throw new Error('CANONICAL_TARGET_OWNER_CONFLICT');
        }
        owners.set(key, entry[0]);
      });
    });
    return owners;
  }

  function ownerFor(owners, targetKey) {
    return owners.has(targetKey) ? owners.get(targetKey) : null;
  }

  function rescanCanonicalRefs() {
    var owners = rebuildOwners();
    Array.from(states).sort(function (left, right) {
      return left[0] - right[0];
    }).forEach(function (entry) {
      deriveExternalJobs(entry[0], entry[1], ownerFor.bind(null, owners))
        .filter(function (job) { return job.scheduledAtS <= context.cutoverAtS; })
        .forEach(function (job) {
          if (knownKeys.has(job.idempotencyKey)) return;
          knownKeys.add(job.idempotencyKey);
          entries.push({
            job: {
              id: 'dry:' + nextSequence,
              idempotency_key: job.idempotencyKey,
              scheduled_at_s: job.scheduledAtS,
              priority: job.priority,
              sequence: nextSequence,
              source_account_id: job.sourceAccountId,
              logical_root_id: 'dry:' + nextSequence,
              logical_key: job.idempotencyKey,
              logical_scheduled_at_s: job.scheduledAtS,
              logical_priority: job.priority,
              logical_sequence: nextSequence,
              logical_order_id: 'dry:' + nextSequence
            },
            ref: job.payload.ref,
            persisted: false
          });
          nextSequence += 1;
        });
    });
    return owners;
  }

  function firstGlobal() {
    return entries.slice().sort(function (left, right) {
      return Number(left.job.logical_scheduled_at_s || left.job.scheduled_at_s) -
        Number(right.job.logical_scheduled_at_s || right.job.scheduled_at_s) ||
        Number(left.job.logical_priority || left.job.priority) -
        Number(right.job.logical_priority || right.job.priority) ||
        Number(left.job.logical_sequence || left.job.sequence) -
        Number(right.job.logical_sequence || right.job.sequence) ||
        String(left.job.logical_order_id || left.job.id).localeCompare(
          String(right.job.logical_order_id || right.job.id)
        );
    })[0] || null;
  }

  function refsFor(accountId, horizon) {
    return entries.filter(function (entry) {
      return Number(entry.job.source_account_id) === Number(accountId) &&
        Number(entry.job.scheduled_at_s) <= horizon;
    }).map(function (entry) { return entry.ref; });
  }

  function nextLocalAt(owners) {
    var next = null;
    Array.from(states).forEach(function (entry) {
      var due = G.phanLoaiSuKienNoiBoKe(
        entry[1], entry[0], ownerFor.bind(null, owners),
        refsFor(entry[0], context.cutoverAtS)
      );
      if (due && due.atS <= context.cutoverAtS &&
          (next === null || due.atS < next)) {
        next = Number(due.atS);
      }
    });
    return next;
  }

  function applyRecoveredLatest(entry) {
    var ref = entry.ref;
    var state = states.get(Number(ref.ownerAccountId));
    if (!state) return;
    var list = ref.kind === 'missile' ? state.tenLua : state.fleets;
    var entityId = ref.kind === 'missile' ? Number(ref.missileId) : Number(ref.fleetId);
    if (!Array.isArray(list)) return;
    var entity = list.find(function (item) {
      return Number(item && item.id) === entityId;
    });
    if (!entity) return;
    var currentRef;
    try {
      currentRef = ref.kind === 'missile' ?
        stableMissileRef(ref.ownerAccountId, entity) :
        stableFleetRef(ref.ownerAccountId, entity);
    } catch (error) {
      return;
    }
    if (!sameExternalRef(currentRef, ref)) return;
    state.now = Math.max(Number(state.now) || 0, Number(context.cutoverAtS));
    if (ref.kind === 'missile') list.splice(list.indexOf(entity), 1);
    else G.batDauVe(state, entity, true, null);
  }

  while (true) {
    var owners = rescanCanonicalRefs();
    var root = firstGlobal();
    var localAtS = nextLocalAt(owners);
    var horizon = Math.min(
      root ? Number(root.job.logical_scheduled_at_s || root.job.scheduled_at_s) :
        context.cutoverAtS,
      localAtS === null ? context.cutoverAtS : localAtS
    );
    var accountIds = Array.from(states.keys()).sort(function (left, right) {
      return left - right;
    });
    for (var index = 0; index < accountIds.length; index += 1) {
      var accountId = accountIds[index];
      var state = states.get(accountId);
      owners = rebuildOwners();
      var local = G.tickNoiBo(state, horizon, {
        ownerAccountId: accountId,
        remainingBudget: remainingBudget,
        rng: G.rng(G.hash(
          'cutover-preflight-v2|' + accountId + '|' + horizon + '|' + canonicalJson(state)
        )),
        targetAccountForKey: ownerFor.bind(null, owners),
        durableFences: refsFor(accountId, horizon)
      });
      processed += Number(local.processed || 0);
      rescanCanonicalRefs();
      if (local.budgetExhausted) {
        return {processed: processed, nextDueAtS: local.nextDueAtS, hasMoreDue: true};
      }
    }
    root = firstGlobal();
    if (!root) {
      if (horizon < context.cutoverAtS) continue;
      return {processed: processed, nextDueAtS: null, hasMoreDue: false};
    }
    if (Number(root.job.logical_scheduled_at_s || root.job.scheduled_at_s) > horizon) {
      continue;
    }
    if (remainingBudget.value === 0) {
      return {
        processed: processed,
        nextDueAtS: Number(root.job.logical_scheduled_at_s || root.job.scheduled_at_s),
        hasMoreDue: true
      };
    }
    remainingBudget.value -= 1;
    processed += 1;
    applyRecoveredLatest(root);
    entries.splice(entries.indexOf(root), 1);
    rescanCanonicalRefs();
  }
}

function reconcileRowsInCurrentUow(context, rows, owners, nowMs) {
  var changed = false;
  rows.forEach(function (row) {
    var wake = localWakeFor(row, owners);
    if (wake) {
      if (context.store.wouldEnsureReconcileAccountAdvance(wake)) changed = true;
    } else if (context.store.wouldReplaceAccountAdvanceWithNoWake(row.tk)) {
      changed = true;
    }
    var desired = deriveExternalJobs(row.tk, row.st, function (targetKey) {
      return owners.has(targetKey) ? owners.get(targetKey) : null;
    });
    var liveKeys = new Set(desired.map(function (job) { return job.idempotencyKey; }));
    canonicalExactLogicalKeysForAccount(context, row.tk, nowMs)
      .forEach(function (key) { liveKeys.add(key); });
    if (context.store.hasObsoleteDerivedJobs(
      context.leaseToken, row.tk, liveKeys, nowMs,
      context.protectedRecoveryRootIds
    )) changed = true;
    desired.forEach(function (job) {
      if (context.store.wouldSchedule(job)) changed = true;
    });
  });
  if (changed && context.markDurable !== false) {
    context.store.markDurableMutation(context.leaseToken, nowMs);
  }
  rows.forEach(function (row) {
    var wake = localWakeFor(row, owners);
    if (wake) {
      context.store.ensureReconcileAccountAdvance(context.leaseToken, wake, nowMs);
    } else {
      context.store.replaceAccountAdvance(
        context.leaseToken, row.tk, row.revision, null, nowMs
      );
    }
    var desired = deriveExternalJobs(row.tk, row.st, function (targetKey) {
      return owners.has(targetKey) ? owners.get(targetKey) : null;
    });
    desired.forEach(function (job) {
      context.store.schedule(context.leaseToken, job, nowMs);
    });
    var liveKeys = new Set(desired.map(function (job) { return job.idempotencyKey; }));
    canonicalExactLogicalKeysForAccount(context, row.tk, nowMs)
      .forEach(function (key) { liveKeys.add(key); });
    context.store.listDerivedJobsForAccount(context.leaseToken, row.tk, nowMs).forEach(function (job) {
      if (liveKeys.has(job.logical_key) || job.has_application) return;
      if (context.protectedRecoveryRootIds &&
          context.protectedRecoveryRootIds.has(job.logical_root_id)) return;
      if (job.state === 'RUNNING') return;
      var canonicalStatus = canonicalExternalStatus(context.kho, job.canonical_ref);
      if (canonicalStatus === 'EXACT') return;
      if (canonicalStatus !== 'ALREADY_ABSENT' && canonicalStatus !== 'REF_MISMATCH') {
        throw new Error('CANONICAL_EXTERNAL_STATUS_INVALID');
      }
      invalidateGlobalOrphanInCurrentUow(context, job, nowMs);
    });
  });
  return changed;
}

function invalidateGlobalOrphanInCurrentUow(context, row, nowMs) {
  var claimed = context.store.claimForResolution(context.leaseToken, row.id, nowMs, 15_000, {
    allowQuarantined: true,
    allowFuturePending: true
  });
  var executable = context.store.loadExecutableJob(context.leaseToken, claimed, nowMs);
  var canonicalStatus = canonicalExternalStatus(context.kho, executable.payload.ref);
  if (canonicalStatus === 'EXACT') {
    throw new Error('CANONICAL_NEUTRALIZATION_REQUIRED');
  }
  if (canonicalStatus !== 'ALREADY_ABSENT' && canonicalStatus !== 'REF_MISMATCH') {
    throw new Error('CANONICAL_EXTERNAL_STATUS_INVALID');
  }
  if (context.onInvalidationForTest) context.onInvalidationForTest('claimed', executable);
  context.store.markDurableMutation(context.leaseToken, nowMs);
  var application = context.store.insertApplication(context.leaseToken, executable, {
    effectiveAtS: Number(executable.scheduled_at_s),
    result: {code: 'MATCH_INVALIDATED', reconciliation: 'canonical-orphan'}
  }, nowMs, null);
  if (context.onInvalidationForTest) {
    context.onInvalidationForTest('application-inserted', application.row);
  }
  context.store.finishResolved(context.leaseToken, executable, 'CANCELLED',
    'MATCH_INVALIDATED', nowMs);
  if (context.onInvalidationForTest) context.onInvalidationForTest('completed', executable);
}

function sweepDeletedOrphansInCurrentUow(context, nowMs) {
  var local = context.kho.db.prepare(
    "SELECT j.* FROM event_jobs j LEFT JOIN dq d ON d.tk=CAST(j.aggregate_id AS INTEGER) " +
    "WHERE j.kind='ACCOUNT_ADVANCE' AND j.state IN " +
    "('PENDING','RETRY_WAIT','RUNNING') AND d.tk IS NULL " +
    'ORDER BY j.sequence,j.id'
  ).all();
  var global = context.store.listLogicalBarrierJobsAtOrBefore(
    context.leaseToken, Number.MAX_SAFE_INTEGER, nowMs
  ).filter(function (row) {
    return row.source_account_id !== null && !context.kho.db.prepare(
      'SELECT 1 FROM dq WHERE tk=?'
    ).get(Number(row.source_account_id));
  });
  var changed = 0;
  var running = 0;
  var marked = false;
  function markBeforeMutation() {
    if (marked || context.markDurable === false) return;
    context.store.markDurableMutation(context.leaseToken, nowMs);
    marked = true;
  }
  local.forEach(function (row) {
    if (row.state === 'RUNNING') {
      running += 1;
      return;
    }
    markBeforeMutation();
    context.store.cancel(context.leaseToken, row.idempotency_key, 'ENTITY_REMOVED', nowMs);
    changed += 1;
  });
  global.forEach(function (row) {
    if (row.state === 'RUNNING' ||
        row.state === 'RETRY_WAIT' && Number(row.retry_at_ms) > nowMs) {
      running += 1;
      return;
    }
    markBeforeMutation();
    invalidateGlobalOrphanInCurrentUow(context, row, nowMs);
    changed += 1;
  });
  return {local: local.length, global: global.length, changed: changed, running: running};
}

function renewReconcileLease(context, nowMs) {
  var leaseMs = context.leaseMs || context.writer && context.writer.leaseMs || 15_000;
  if (!context.store.renewLease(context.leaseToken, nowMs, leaseMs)) {
    var error = new Error('LEASE_LOST');
    error.code = 'LEASE_LOST';
    if (context.writer) context.writer.transitionLeaseLost(error);
    throw error;
  }
  if (context.writer) {
    context.writer.lastEffectiveNowMs = Math.max(context.writer.lastEffectiveNowMs, nowMs);
  }
}

function invalidateGlobalOrphan(context, row, effectiveNowMs) {
  context = requireCutoverContext(context);
  return context.kho.trongGiaoDich(function () {
    renewReconcileLease(context, effectiveNowMs);
    context.store.recordEffectiveNowMs(context.leaseToken, effectiveNowMs);
    var result = invalidateGlobalOrphanInCurrentUow(context, row, effectiveNowMs);
    var commitNowMs = effectiveNow(context);
    renewReconcileLease(context, commitNowMs);
    context.store.recordEffectiveNowMs(context.leaseToken, commitNowMs);
    return result;
  }, {immediate: true});
}

function reconcileCanonicalState(context) {
  context = requireCutoverContext(context);
  var pageSize = context.pageSize === undefined ? 100 : context.pageSize;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('RECONCILE_PAGE_SIZE_INVALID');
  }
  context.kho.trongGiaoDich(function () {
    var recoveryNowMs = effectiveNow(context);
    renewReconcileLease(context, recoveryNowMs);
    context.store.recordEffectiveNowMs(context.leaseToken, recoveryNowMs);
    var recovered = context.store.recoverExpiredRunning(context.leaseToken, recoveryNowMs, {
      retryBaseMs: 1_000,
      retryMaxMs: 300_000,
      maxAttempts: 8
    });
    if (recovered > 0) {
      context.store.markDurableMutation(context.leaseToken, recoveryNowMs);
    }
    recoveryNowMs = effectiveNow(context);
    renewReconcileLease(context, recoveryNowMs);
    context.store.recordEffectiveNowMs(context.leaseToken, recoveryNowMs);
  }, {immediate: true});

  var all = canonicalRows(context.kho);
  var owners = canonicalTargetOwners(all);
  var cursor = nextCursor(context.kho);
  var pages = 0;
  var resumedFrom = cursor;
  if (cursor === null) cursor = 0;
  while (true) {
    var page = all.filter(function (row) { return row.tk > cursor; }).slice(0, pageSize);
    if (page.length === 0) break;
    var last = page[page.length - 1].tk;
    context.kho.trongGiaoDich(function () {
      var nowMs = effectiveNow(context);
      renewReconcileLease(context, nowMs);
      context.store.recordEffectiveNowMs(context.leaseToken, nowMs);
      reconcileRowsInCurrentUow(context, page, owners, nowMs);
      writeCursor(context.kho, last, nowMs);
      nowMs = effectiveNow(context);
      renewReconcileLease(context, nowMs);
      context.store.recordEffectiveNowMs(context.leaseToken, nowMs);
    }, {immediate: true});
    cursor = last;
    pages += 1;
    if (context.onPageForTest) context.onPageForTest({cursor: cursor, pages: pages});
  }

  var unresolvedAfterSweep = context.kho.trongGiaoDich(function () {
    var nowMs = effectiveNow(context);
    renewReconcileLease(context, nowMs);
    context.store.recordEffectiveNowMs(context.leaseToken, nowMs);
    var rebuild = projectionsNeedRebuild(context, all);
    var hasCursor = context.kho.db.prepare(
      "SELECT 1 AS yes FROM scheduler_meta WHERE key='reconcile_cursor'"
    ).get();
    if (rebuild && context.markDurable !== false) {
      context.store.markDurableMutation(context.leaseToken, nowMs);
    }
    if (rebuild) context.world._dongBoChiMucTrongGD(all);
    sweepDeletedOrphansInCurrentUow(context, nowMs);
    if (context.store.hasDeletedAccountOrphans()) {
      nowMs = effectiveNow(context);
      renewReconcileLease(context, nowMs);
      context.store.recordEffectiveNowMs(context.leaseToken, nowMs);
      return true;
    }
    if (hasCursor) {
      context.kho.db.prepare("DELETE FROM scheduler_meta WHERE key='reconcile_cursor'").run();
    }
    nowMs = effectiveNow(context);
    renewReconcileLease(context, nowMs);
    context.store.recordEffectiveNowMs(context.leaseToken, nowMs);
    return false;
  }, {immediate: true});
  if (unresolvedAfterSweep) {
    throw new Error('RECONCILE_UNRESOLVED_CANONICAL_ROWS');
  }
  return {pages: pages, resumedFrom: resumedFrom};
}

function preflightCutoverBudget(context) {
  context = requireCutoverContext(context);
  var preflightNowMs = Number.isSafeInteger(context.effectiveNowMs) ?
    context.effectiveNowMs : effectiveNow(context);
  var remainingBudget = {value: 50_000};
  var dry = dryCutoverPreflight(context, remainingBudget, preflightNowMs);
  return {
    ok: remainingBudget.value > 0 || dry.hasMoreDue === false,
    processed: dry.processed,
    nextDueAtS: dry.nextDueAtS === null ? null : dry.nextDueAtS
  };
}

function samePreflight(left, right) {
  return Boolean(left && right) && left.ok === right.ok &&
    left.processed === right.processed && left.nextDueAtS === right.nextDueAtS;
}

function assertCutoverRunningInventory(context, nowMs) {
  context.store.assertLiveLease(context.leaseToken, nowMs);
  var rows = context.kho.db.prepare(
    'SELECT id,kind,scheduled_at_s,locked_by,locked_generation,locked_until_ms ' +
    "FROM event_jobs WHERE state='RUNNING' " +
    'ORDER BY scheduled_at_s,priority,sequence,id'
  ).all();
  rows.forEach(function (row) {
    var structurallyValid = Number.isSafeInteger(row.scheduled_at_s) &&
      ['ACCOUNT_ADVANCE', 'PVP_RESOLVE', 'EXTERNAL_RESOLVE'].indexOf(row.kind) >= 0 &&
      typeof row.locked_by === 'string' && row.locked_by.length > 0 &&
      Number.isSafeInteger(row.locked_generation) && row.locked_generation >= 0 &&
      Number.isSafeInteger(row.locked_until_ms) && row.locked_until_ms >= 0;
    if (!structurallyValid) {
      throw new Error('CUTOVER_RUNNING_INVENTORY_UNRECOVERABLE');
    }
    var generation = row.locked_generation;
    var lockedUntilMs = row.locked_until_ms;
    var olderGeneration = generation >= 0 &&
      generation < Number(context.leaseToken.generation);
    var expiredCurrentOwner = generation === Number(context.leaseToken.generation) &&
      row.locked_by === context.leaseToken.ownerId &&
      lockedUntilMs <= nowMs;
    if (!olderGeneration && !expiredCurrentOwner) {
      throw new Error('CUTOVER_RUNNING_JOB_ACTIVE');
    }
  });
  return rows.length;
}

function snapshotBeforeCutover(context, nowMs) {
  var seedRow = context.kho.db.prepare(
    "SELECT v FROM cauhinh WHERE k='combat_seed_key_v1'"
  ).get();
  var snapshot = {
    dq: canonicalRows(context.kho),
    ht: context.kho.db.prepare('SELECT * FROM ht').all(),
    hamdang: context.kho.db.prepare('SELECT * FROM hamdang').all(),
    hamgiu: context.kho.db.prepare('SELECT * FROM hamgiu').all(),
    jobs: context.kho.db.prepare('SELECT * FROM event_jobs ORDER BY id').all(),
    applications: context.kho.db.prepare('SELECT * FROM event_applications ORDER BY idempotency_key').all(),
    meta: context.kho.db.prepare('SELECT * FROM scheduler_meta ORDER BY key').all(),
    lease: context.schedulerLeaseBefore ||
      context.kho.db.prepare('SELECT * FROM scheduler_lease ORDER BY lease_name').all(),
    audit: context.kho.db.prepare('SELECT * FROM scheduler_audit ORDER BY id').all(),
    seed: seedRow ? seedRow.v : null,
    cursor: nextCursor(context.kho),
    importedJobIds: [],
    existingJobIds: context.kho.db.prepare('SELECT id FROM event_jobs ORDER BY id').all()
      .map(function (row) { return row.id; })
  };
  context.kho.db.prepare(
    'INSERT INTO scheduler_cutover_snapshot(' +
    'snapshot_id,created_at_ms,mode_before,reconcile_cursor_before,dq_rows_json,ht_rows_json,' +
    'hamdang_rows_json,hamgiu_rows_json,event_jobs_rows_json,event_applications_rows_json,' +
    'scheduler_meta_rows_json,scheduler_lease_rows_json,scheduler_audit_rows_json,' +
    'imported_job_ids_json,combat_seed_key_before' +
    ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(
    1, nowMs, 'legacy', snapshot.cursor === null ? null : String(snapshot.cursor),
    JSON.stringify(snapshot.dq), JSON.stringify(snapshot.ht), JSON.stringify(snapshot.hamdang),
    JSON.stringify(snapshot.hamgiu), JSON.stringify(snapshot.jobs), JSON.stringify(snapshot.applications),
    JSON.stringify(snapshot.meta), JSON.stringify(snapshot.lease), JSON.stringify(snapshot.audit),
    JSON.stringify(snapshot.importedJobIds), snapshot.seed
  );
  return snapshot;
}

function extendProtectedRecoveryRoots(context, protectedRoots, nowMs) {
  context.store.listLogicalBarrierJobsAtOrBefore(
    context.leaseToken, context.cutoverAtS, nowMs
  ).forEach(function (job) {
    protectedRoots.add(job.logical_root_id);
  });
  return protectedRoots;
}

function recoverOverdueJobsInCurrentUow(context, mutation, snapshot, nowMs) {
  void snapshot;
  var recoveredRunningIds = new Set(context.store.listExpiredRunningForRecovery(
    mutation.leaseToken, nowMs
  ).map(function (row) { return row.id; }));
  context.store.recoverExpiredRunning(mutation.leaseToken, nowMs, {
    retryBaseMs: 1_000,
    retryMaxMs: 300_000,
    maxAttempts: 8
  });
  var recovered = 0;

  function synchronizeCanonical() {
    var all = canonicalRows(context.kho);
    var owners = canonicalTargetOwners(all);
    extendProtectedRecoveryRoots(context, mutation.protectedRecoveryRootIds, nowMs);
    reconcileRowsInCurrentUow(Object.assign({}, context, {
      markDurable: false,
      protectedRecoveryRootIds: mutation.protectedRecoveryRootIds
    }), all, owners, nowMs);
    extendProtectedRecoveryRoots(context, mutation.protectedRecoveryRootIds, nowMs);
    context.world._dongBoChiMucTrongGD(all);
    return {all: all, owners: owners};
  }

  function nextLocalAt(canonical) {
    var next = null;
    canonical.all.forEach(function (row) {
      var fences = context.store.listUnresolvedGlobalRefsAtOrBefore(
        mutation.leaseToken, Number(row.tk), context.cutoverAtS, nowMs
      );
      var due = G.phanLoaiSuKienNoiBoKe(
        row.st,
        Number(row.tk),
        function (targetKey) {
          return canonical.owners.has(targetKey) ? canonical.owners.get(targetKey) : null;
        },
        fences
      );
      if (due && due.atS <= context.cutoverAtS &&
          (next === null || Number(due.atS) < next)) {
        next = Number(due.atS);
      }
    });
    return next;
  }

  while (true) {
    var canonical = synchronizeCanonical();
    var roots = context.store.listLogicalBarrierJobsAtOrBefore(
      mutation.leaseToken, context.cutoverAtS, nowMs
    );
    var localAtS = nextLocalAt(canonical);
    var horizon = Math.min(
      roots.length ? Number(roots[0].logical_scheduled_at_s) : context.cutoverAtS,
      localAtS === null ? context.cutoverAtS : localAtS
    );
    var accountIds = canonical.all.map(function (row) { return Number(row.tk); });
    for (var index = 0; index < accountIds.length; index += 1) {
      canonical = synchronizeCanonical();
      var localRow = canonical.all.find(function (candidate) {
        return Number(candidate.tk) === Number(accountIds[index]);
      });
      var fences = context.store.listUnresolvedGlobalRefsAtOrBefore(
        mutation.leaseToken, accountIds[index], horizon, nowMs
      );
      var local = context.advanceService.advanceLocalOnlyTo(
        mutation,
        accountIds[index],
        horizon,
        function (targetKey) {
          return canonical.owners.has(targetKey) ? canonical.owners.get(targetKey) : null;
        },
        {
          durableFences: fences,
          deferAccountWake: true,
          protectedRecoveryRootIds: mutation.protectedRecoveryRootIds,
          rng: G.rng(G.hash(
            'cutover-preflight-v2|' + accountIds[index] + '|' + horizon + '|' +
            canonicalJson(localRow.st)
          ))
        }
      );
      if (local.budgetExhausted) throw new Error('CUTOVER_PREFLIGHT_CHANGED');
      synchronizeCanonical();
    }
    roots = context.store.listLogicalBarrierJobsAtOrBefore(
      mutation.leaseToken, context.cutoverAtS, nowMs
    );
    if (!roots.length) {
      if (horizon < context.cutoverAtS) continue;
      return recovered;
    }
    if (Number(roots[0].logical_scheduled_at_s) > horizon) continue;
    if (mutation.remainingBudget.value <= 0) {
      throw new Error('CUTOVER_PREFLIGHT_CHANGED');
    }
    mutation.remainingBudget.value -= 1;
    var row = roots[0];
    var claimed;
    if (row.state === 'RUNNING') {
      if (row.locked_by !== mutation.leaseToken.ownerId ||
          Number(row.locked_generation) !== Number(mutation.leaseToken.generation)) {
        throw new Error('CUTOVER_RUNNING_JOB_ACTIVE');
      }
      claimed = context.store.resumeOwnedRunning(mutation.leaseToken, row.id, nowMs, 15_000);
    } else if (row.state === 'RETRY_WAIT' && recoveredRunningIds.has(row.id)) {
      claimed = context.store.claimRecoveredRetryForCutover(
        mutation.leaseToken, row.id, context.cutoverAtS, nowMs, 15_000
      );
    } else {
      claimed = context.store.claimForResolution(mutation.leaseToken, row.id, nowMs, 15_000, {
        allowQuarantined: true,
        allowFuturePending: true
      });
    }
    var executable = context.store.loadExecutableJob(mutation.leaseToken, claimed, nowMs);
    var prepared = context.reducer.prepareRecoveredLatestState(
      mutation, executable, context.cutoverAtS
    );
    context.store.markDurableMutation(mutation.leaseToken, nowMs);
    var application = context.store.insertApplication(
      mutation.leaseToken, executable, prepared.application, nowMs, null
    );
    if (!application.alreadyApplied) context.reducer.applyPrepared(mutation, prepared);
    context.store.completeApplied(mutation.leaseToken, executable, nowMs);
    context.store.writeAudit(mutation.leaseToken, 'CUTOVER', executable.id,
      'recovered-latest-state', nowMs);
    recovered += 1;
    synchronizeCanonical();
  }
}

function cutoverDurableSchedulerInCurrentUow(context, preflight) {
  context = requireCutoverContext(context);
  if (!preflight || preflight.ok !== true) throw new Error('CUTOVER_PREFLIGHT_BUDGET_EXHAUSTED');
  var nowMs = Number(context.effectiveNowMs);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('EFFECTIVE_NOW_INVALID');
  context.store.assertLiveLease(context.leaseToken, nowMs);
  context.store.assertSchemaVersion(1);
  if (context.store.schedulerMode() !== 'legacy') {
    throw new Error('SCHEDULER_CUTOVER_ALREADY_DURABLE');
  }
  assertCutoverRunningInventory(context, nowMs);
  if (!samePreflight(preflight, preflightCutoverBudget(context))) {
    throw new Error('CUTOVER_PREFLIGHT_CHANGED');
  }
  var snapshot = snapshotBeforeCutover(context, nowMs);
  context.store.recordEffectiveNowMs(context.leaseToken, nowMs);
  context.reducer.initializeCombatSeed(context.leaseToken, nowMs);
  if (context.onStageForTest) context.onStageForTest('seed-initialized');
  var all = canonicalRows(context.kho);
  var owners = canonicalTargetOwners(all);
  var protectedRoots = new Set(context.store.listLogicalBarrierJobsAtOrBefore(
    context.leaseToken, context.cutoverAtS, nowMs
  ).map(function (job) { return job.logical_root_id; }));
  reconcileRowsInCurrentUow(Object.assign({}, context, {
    markDurable: false,
    protectedRecoveryRootIds: protectedRoots
  }), all, owners, nowMs);
  extendProtectedRecoveryRoots(context, protectedRoots, nowMs);
  context.world._dongBoChiMucTrongGD(all);
  snapshot.importedJobIds = context.kho.db.prepare('SELECT id FROM event_jobs ORDER BY id').all()
    .map(function (row) { return row.id; })
    .filter(function (id) { return snapshot.existingJobIds.indexOf(id) < 0; });
  context.kho.db.prepare(
    'UPDATE scheduler_cutover_snapshot SET imported_job_ids_json=? WHERE snapshot_id=1'
  ).run(JSON.stringify(snapshot.importedJobIds));
  var mutation = {
    leaseToken: context.leaseToken,
    remainingBudget: {value: 50_000},
    effectiveNowMs: nowMs,
    protectedRecoveryRootIds: protectedRoots
  };
  var recovered = context.world.trongMutationScheduler(mutation, function () {
    return recoverOverdueJobsInCurrentUow(context, mutation, snapshot, nowMs);
  });
  if (50_000 - mutation.remainingBudget.value !== preflight.processed) {
    throw new Error('CUTOVER_PREFLIGHT_CHANGED');
  }
  snapshot.importedJobIds = context.kho.db.prepare('SELECT id FROM event_jobs ORDER BY id').all()
    .map(function (row) { return row.id; })
    .filter(function (id) { return snapshot.existingJobIds.indexOf(id) < 0; });
  context.kho.db.prepare(
    'UPDATE scheduler_cutover_snapshot SET imported_job_ids_json=? WHERE snapshot_id=1'
  ).run(JSON.stringify(snapshot.importedJobIds));
  if (context.onStageForTest && recovered) context.onStageForTest('overdue-reducer');
  if (context.onStageForTest) context.onStageForTest('before-mode-durable');
  context.kho.db.prepare(
    "UPDATE scheduler_meta SET value='durable',updated_at_ms=? WHERE key='scheduler_mode'"
  ).run(nowMs);
  context.store.writeAudit(context.leaseToken, 'CUTOVER', null, 'mode-durable', nowMs);
  if (context.onStageForTest) context.onStageForTest('mode-durable');
  return {mode: 'durable', imported: all.length, recovered: recovered};
}

function cutoverDurableScheduler(context, preflight) {
  return context.kho.trongGiaoDich(function () {
    return cutoverDurableSchedulerInCurrentUow(context, preflight);
  }, {immediate: true});
}

function runCutoverWithLease(context) {
  var retainedNowMs = 0;
  var token = null;
  var committed = false;
  var releaseContext = context;
  var result;
  try {
    releaseContext = context;
    result = context.kho.trongGiaoDich(function () {
      retainedNowMs = effectiveNow(context);
      if (!Number.isSafeInteger(retainedNowMs) || retainedNowMs < 0) {
        throw new Error('CUTOVER_LEASE_TIME_INVALID');
      }
      var leaseBefore = context.kho.db.prepare(
        'SELECT * FROM scheduler_lease ORDER BY lease_name'
      ).all();
      token = context.store.acquireLease(
        assertSchedulerOwnerId(context.ownerId), retainedNowMs, 15_000
      );
      if (!token) throw new Error('SCHEDULER_LEASE_UNHELD');
      var captured = requireCutoverContext(Object.assign({}, context, {
        leaseToken: token,
        leaseAcquiredAtMs: retainedNowMs,
        schedulerLeaseBefore: leaseBefore,
        effectiveNowMs: retainedNowMs
      }));
      var preflight = preflightCutoverBudget(captured);
      if (!preflight.ok) throw new Error('CUTOVER_PREFLIGHT_BUDGET_EXHAUSTED');
      return cutoverDurableSchedulerInCurrentUow(captured, preflight);
    }, {immediate: true});
    committed = true;
    return result;
  } finally {
    var releaseAt = Number.isSafeInteger(retainedNowMs) && retainedNowMs >= 0 ?
      retainedNowMs : 0;
    try {
      releaseAt = Math.max(releaseAt, effectiveNow(releaseContext));
    } catch (error) {
      void error;
    }
    if (committed && releaseContext && releaseContext.kho && releaseContext.store && token) {
      releaseContext.kho.trongGiaoDich(function () {
        releaseContext.store.releaseLease(token, releaseAt);
      }, {immediate: true});
    }
  }
}

function buildCutoverDependencies(context) {
  var store = new SchedulerStore(context.kho, context.clock);
  var world = new TheGioi(context.kho, {clock: context.clock});
  var service = new GameAdvanceService({
    kho: context.kho,
    world: world,
    store: store,
    clock: context.clock
  });
  world.datScheduler(store);
  world.datAdvanceService(service);
  return Object.assign({}, context, {
    store: store,
    world: world,
    advanceService: service,
    reducer: new EventReducer({
      kho: context.kho,
      world: world,
      store: store,
      clock: context.clock,
      advanceService: service
    })
  });
}

function runMaintenanceCutover(context) {
  apDungMigrationScheduler(context.kho, context.clock.nowMs());
  var deps = buildCutoverDependencies(context);
  var nowMs = Number(context.clock.nowMs());
  return runCutoverWithLease(Object.assign(deps, {
    ownerId: assertSchedulerOwnerId(context.ownerId),
    cutoverAtS: context.cutoverAtS === undefined ? Math.floor(nowMs / 1000) : context.cutoverAtS
  }));
}

function canRollbackDurableScheduler(kho) {
  return Boolean(kho.db.prepare('SELECT 1 FROM scheduler_cutover_snapshot LIMIT 1').get()) &&
    !kho.db.prepare("SELECT 1 FROM scheduler_meta WHERE key='durable_first_mutation_at_ms'").get() &&
    !kho.db.prepare('SELECT 1 FROM event_applications LIMIT 1').get();
}

function assertRollbackAllowedInCurrentUow(kho) {
  var snapshots = kho.db.prepare('SELECT COUNT(*) AS n FROM scheduler_cutover_snapshot').get().n;
  if (Number(snapshots) !== 1) throw new Error('SCHEDULER_ROLLBACK_SNAPSHOT_INVALID');
  var mode = kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get();
  if (!mode || mode.value !== 'durable') throw new Error('SCHEDULER_ROLLBACK_MODE_INVALID');
  if (kho.db.prepare("SELECT 1 FROM scheduler_meta WHERE key='durable_first_mutation_at_ms'").get() ||
      kho.db.prepare('SELECT 1 FROM event_applications LIMIT 1').get()) {
    throw new Error('DURABLE_EFFECT_ALREADY_APPLIED');
  }
}

function rollbackDurableScheduler(context) {
  apDungMigrationScheduler(context.kho, context.clock.nowMs());
  var deps = buildCutoverDependencies(context);
  var nowMs = Math.max(
    Number(deps.store.peekEffectiveNowMs(context.clock.nowMs())),
    Number(context.clock.nowMs())
  );
  return deps.kho.trongGiaoDich(function () {
    assertRollbackAllowedInCurrentUow(deps.kho);
    var row = deps.kho.db.prepare(
      'SELECT dq_rows_json,ht_rows_json,hamdang_rows_json,hamgiu_rows_json,reconcile_cursor_before,' +
      'combat_seed_key_before,imported_job_ids_json,event_jobs_rows_json,' +
      'event_applications_rows_json,scheduler_meta_rows_json,' +
      'scheduler_lease_rows_json,scheduler_audit_rows_json ' +
      'FROM scheduler_cutover_snapshot WHERE snapshot_id=1'
    ).get();
    var snapshot = {
      dq: JSON.parse(row.dq_rows_json),
      ht: JSON.parse(row.ht_rows_json),
      hamdang: JSON.parse(row.hamdang_rows_json),
      hamgiu: JSON.parse(row.hamgiu_rows_json),
      cursor: row.reconcile_cursor_before,
      seed: row.combat_seed_key_before,
      importedJobIds: JSON.parse(row.imported_job_ids_json),
      jobs: JSON.parse(row.event_jobs_rows_json),
      applications: JSON.parse(row.event_applications_rows_json),
      meta: JSON.parse(row.scheduler_meta_rows_json),
      lease: JSON.parse(row.scheduler_lease_rows_json),
      audit: JSON.parse(row.scheduler_audit_rows_json)
    };
    var token = deps.store.acquireLease(assertSchedulerOwnerId(context.ownerId), nowMs, 15_000);
    if (!token) throw new Error('SCHEDULER_LEASE_UNHELD');
    deps.store.assertLiveLease(token, nowMs);
    if (context.onRollbackLockedForTest) {
      context.onRollbackLockedForTest(deps, token, nowMs);
    }
    assertRollbackAllowedInCurrentUow(deps.kho);
    deps.kho.db.exec('PRAGMA defer_foreign_keys=ON;');
    deps.kho.db.exec('DELETE FROM hamdang; DELETE FROM hamgiu; DELETE FROM ht;');
    deps.kho.db.exec(
      'DELETE FROM event_applications; DELETE FROM event_jobs; DELETE FROM scheduler_audit;' +
      'DELETE FROM scheduler_meta; DELETE FROM scheduler_lease;'
    );
    if (context.onRestoreForTest) context.onRestoreForTest('after-delete');
    snapshot.dq.forEach(function (saved) {
      var keys = Object.keys(saved).filter(function (key) {
        return key !== 'tk' && key !== 'st';
      }).sort();
      var dqRestore = deps.kho.db.prepare('UPDATE dq SET ' + keys.map(function (key) {
        return key + '=?';
      }).join(',') + ' WHERE tk=?');
      dqRestore.run.apply(dqRestore, keys.map(function (key) {
        return saved[key];
      }).concat(saved.tk));
    });
    function restoreRows(table, rows) {
      rows.forEach(function (saved) {
        var keys = Object.keys(saved).sort();
        var statement = deps.kho.db.prepare(
          'INSERT INTO ' + table + '(' + keys.join(',') + ') VALUES(' +
          keys.map(function () { return '?'; }).join(',') + ')'
        );
        statement.run.apply(statement, keys.map(function (key) { return saved[key]; }));
      });
    }
    restoreRows('ht', snapshot.ht);
    restoreRows('hamdang', snapshot.hamdang);
    restoreRows('hamgiu', snapshot.hamgiu);
    restoreRows('event_jobs', snapshot.jobs.map(function (saved) {
      return Object.assign({}, saved, {
        replay_of_job_id: null,
        resolved_by_job_id: null,
        blocked_by_job_id: null
      });
    }));
    restoreRows('event_applications', snapshot.applications);
    snapshot.jobs.forEach(function (saved) {
      deps.kho.db.prepare(
        'UPDATE event_jobs SET replay_of_job_id=?,resolved_by_job_id=?,' +
        'blocked_by_job_id=? WHERE id=?'
      ).run(saved.replay_of_job_id, saved.resolved_by_job_id,
        saved.blocked_by_job_id, saved.id);
    });
    if (deps.kho.db.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('ROLLBACK_FOREIGN_KEY_INVALID');
    }
    restoreRows('scheduler_meta', snapshot.meta);
    restoreRows('scheduler_audit', snapshot.audit);
    restoreRows('scheduler_lease', snapshot.lease);
    if (snapshot.seed === null) {
      deps.kho.db.prepare("DELETE FROM cauhinh WHERE k='combat_seed_key_v1'").run();
    } else {
      deps.kho.db.prepare(
        "INSERT INTO cauhinh(k,v) VALUES('combat_seed_key_v1',?) " +
        'ON CONFLICT(k) DO UPDATE SET v=excluded.v'
      ).run(snapshot.seed);
    }
    deps.kho.db.prepare(
      "INSERT INTO scheduler_audit(action,job_id,detail_safe,at_ms) VALUES('ROLLBACK',NULL,?,?)"
    ).run('restored-pre-effect-cutover', nowMs);
    deps.kho.db.prepare('DELETE FROM scheduler_cutover_snapshot').run();
    return {mode: 'legacy', restored: true};
  }, {immediate: true});
}

module.exports = {
  reconcileCanonicalState: reconcileCanonicalState,
  invalidateGlobalOrphan: invalidateGlobalOrphan,
  invalidateGlobalOrphanInCurrentUow: invalidateGlobalOrphanInCurrentUow,
  preflightCutoverBudget: preflightCutoverBudget,
  cutoverDurableScheduler: cutoverDurableScheduler,
  cutoverDurableSchedulerInCurrentUow: cutoverDurableSchedulerInCurrentUow,
  runCutoverWithLease: runCutoverWithLease,
  runMaintenanceCutover: runMaintenanceCutover,
  rollbackDurableScheduler: rollbackDurableScheduler,
  canRollbackDurableScheduler: canRollbackDurableScheduler
};
