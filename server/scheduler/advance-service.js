'use strict';

var crypto = require('node:crypto');
var G = require('../rules.js').G;
var schedulerEvents = require('./events.js');
var canonicalJson = require('./store.js').canonicalJson;
var seed32 = require('./combat-snapshot.js').seed32;

var MAX_BUDGET = 50000;
var PUBLIC_RESULT_KEYS = [
  'advancedToS', 'budgetExhausted', 'hasMoreDue', 'nextDueAtS', 'processed'
];
var INTERNAL_RESULT_KEYS = [
  'blockedExternal', 'blockedExternalJobId', 'checkpointJobId',
  'deferredExternal', 'saveReceipt'
];

function fail(code) {
  var error = new Error(code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function safeNonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveAccountId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function exactBudget(value, code) {
  if (!isPlainObject(value) || Object.keys(value).length !== 1 ||
      Object.keys(value)[0] !== 'value' || !safeNonnegative(value.value) ||
      value.value > MAX_BUDGET) {
    fail(code || 'TICK_BUDGET_INVALID');
  }
  return value;
}

function toPublicAdvanceResult(outcome) {
  if (!isPlainObject(outcome)) fail('ADVANCE_RESULT_INVALID');
  var keys = Object.keys(outcome);
  if (PUBLIC_RESULT_KEYS.some(function (key) {
    return !Object.prototype.hasOwnProperty.call(outcome, key);
  }) || keys.some(function (key) {
    return PUBLIC_RESULT_KEYS.indexOf(key) < 0 && INTERNAL_RESULT_KEYS.indexOf(key) < 0;
  }) || !safeNonnegative(outcome.processed) || !safeNonnegative(outcome.advancedToS) ||
      outcome.nextDueAtS !== null && !safeNonnegative(outcome.nextDueAtS) ||
      typeof outcome.hasMoreDue !== 'boolean' ||
      typeof outcome.budgetExhausted !== 'boolean') {
    fail('ADVANCE_RESULT_INVALID');
  }
  return {
    processed: outcome.processed,
    advancedToS: outcome.advancedToS,
    nextDueAtS: outcome.nextDueAtS,
    hasMoreDue: outcome.hasMoreDue,
    budgetExhausted: outcome.budgetExhausted
  };
}

function assertTickOutcome(value) {
  toPublicAdvanceResult(value);
  return value;
}

function GameAdvanceService(options) {
  if (!isPlainObject(options) || !options.kho || !options.world || !options.store ||
      !options.clock || typeof options.clock.nowMs !== 'function') {
    fail('ADVANCE_SERVICE_CONTEXT_INVALID');
  }
  this.kho = options.kho;
  this.world = options.world;
  this.store = options.store;
  this.clock = options.clock;
}

function validateMutation(service, mutation) {
  if (!isPlainObject(mutation) || !mutation.leaseToken ||
      !safeNonnegative(mutation.effectiveNowMs)) {
    fail('SCHEDULER_MUTATION_INVALID');
  }
  exactBudget(mutation.remainingBudget, 'SCHEDULER_MUTATION_INVALID');
  if (!service.world || typeof service.world._schedulerActive !== 'function') {
    fail('SCHEDULER_MUTATION_TOKEN_REQUIRED');
  }
  service.world._schedulerActive(mutation);
  return mutation;
}

function runWithOwner(service, accountId, fn) {
  if (!Array.isArray(service.world.chuStack) ||
      typeof service.world.withRulesHook !== 'function') {
    fail('ADVANCE_SERVICE_CONTEXT_INVALID');
  }
  return service.world.withRulesHook(function () {
    service.world.chuStack.push(accountId);
    try {
      var value = fn();
      if (value && typeof value.then === 'function') fail('WORLD_RULES_HOOK_ASYNC');
      return value;
    } finally {
      service.world.chuStack.pop();
    }
  });
}

function durableRaidRngFactory(service, accountId, revision) {
  if (!positiveAccountId(accountId) || !safeNonnegative(revision)) {
    fail('CANONICAL_STATE_INVALID');
  }
  return function (state) {
    var key = service.kho.cauhinh('combat_seed_key_v1');
    var dueAtS = Number(state && state.nextRaid);
    if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key) ||
        !safeNonnegative(dueAtS)) {
      fail('COMBAT_SEED_KEY_INVALID');
    }
    var stateDigest = crypto.createHash('sha256')
      .update(canonicalJson(state), 'utf8').digest('hex');
    var domain = [
      'npc-raid-v1', accountId, dueAtS, revision, stateDigest
    ].join('|');
    var drawIndex = 0;
    return function () {
      var value = seed32(key, domain, drawIndex, 1);
      drawIndex += 1;
      return value / 0x100000000;
    };
  };
}

function canonicalRows(service) {
  var raw = service.kho.db.prepare(
    'SELECT tk,state,revision FROM dq ORDER BY tk'
  ).all();
  var rows = [], owners = new Map();
  raw.forEach(function (row) {
    var accountId = Number(row.tk), revision = Number(row.revision), state;
    if (!positiveAccountId(accountId) || !safeNonnegative(revision) ||
        typeof row.state !== 'string') fail('CANONICAL_STATE_INVALID');
    try { state = JSON.parse(row.state); }
    catch (error) { fail('CANONICAL_STATE_INVALID'); }
    if (!state || typeof state !== 'object' || !Array.isArray(state.planets) ||
        !Array.isArray(state.fleets) || !Array.isArray(state.tenLua || [])) {
      fail('CANONICAL_STATE_INVALID');
    }
    rows.push({tk: accountId, revision: revision, st: state});
    state.planets.forEach(function (planet) {
      var key = G.tdKey(planet.c);
      if (typeof key !== 'string' || !key) fail('CANONICAL_STATE_INVALID');
      if (owners.has(key)) fail('CANONICAL_TARGET_OWNER_CONFLICT');
      owners.set(key, accountId);
    });
  });
  function targetAccountForKey(targetKey) {
    return owners.has(targetKey) ? owners.get(targetKey) : null;
  }
  return {rows: rows, owners: owners, targetAccountForKey: targetAccountForKey};
}

function sortedByUtf8(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'));
}

function compareDerived(left, right) {
  return Number(left.scheduledAtS) - Number(right.scheduledAtS) ||
    Number(left.priority) - Number(right.priority) ||
    Number(left.sourceAccountId) - Number(right.sourceAccountId) ||
    sortedByUtf8(left.idempotencyKey, right.idempotencyKey);
}

function deriveCandidates(scan) {
  var candidates = [];
  scan.rows.forEach(function (row) {
    schedulerEvents.deriveExternalJobs(
      row.tk, row.st, scan.targetAccountForKey
    ).forEach(function (job) { candidates.push(job); });
  });
  return candidates.sort(compareDerived);
}

function scheduleCandidates(service, mutation, candidates) {
  var inserted = 0;
  candidates.forEach(function (candidate) {
    var existed = service.store.getByIdempotencyKey(candidate.idempotencyKey);
    service.store.schedule(mutation.leaseToken, candidate, mutation.effectiveNowMs);
    if (!existed) inserted += 1;
  });
  return inserted;
}

function logicalTuple(row) {
  return [
    Number(row.logical_scheduled_at_s === undefined ?
      row.scheduled_at_s : row.logical_scheduled_at_s),
    Number(row.logical_priority === undefined ? row.priority : row.logical_priority),
    Number(row.logical_sequence === undefined ? row.sequence : row.logical_sequence),
    String(row.logical_order_id || row.logical_root_id || row.id)
  ];
}

function compareTuple(left, right) {
  for (var index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return sortedByUtf8(left[3], right[3]);
}

function nonemptyFleet(fleet) {
  return ['ships', 'linh'].some(function (key) {
    var map = fleet && fleet[key];
    return map && typeof map === 'object' && Object.keys(map).some(function (name) {
      return Number.isFinite(map[name]) && map[name] > 0;
    });
  });
}

function participantIds(scan, ref, targetS) {
  var ids = new Set(), defenderId = scan.targetAccountForKey(ref.targetKey);
  if (positiveAccountId(ref.ownerAccountId)) ids.add(ref.ownerAccountId);
  if (positiveAccountId(defenderId)) ids.add(defenderId);
  if (positiveAccountId(defenderId)) scan.rows.forEach(function (row) {
    row.st.fleets.forEach(function (fleet) {
      if (!fleet || fleet.mission !== 'hold' || fleet.pha !== 'giu' ||
          Number(fleet.giuTaiTk) !== defenderId ||
          Number(fleet.giuLuc) > targetS || Number(fleet.giuDen_t) <= targetS ||
          G.tdKey(fleet.den) !== ref.targetKey || !nonemptyFleet(fleet)) return;
      ids.add(row.tk);
    });
  });
  return Array.from(ids).sort(function (left, right) { return left - right; });
}

function rowsForParticipants(scan, participants, targetS) {
  var byId = new Map(scan.rows.map(function (row) { return [row.tk, row]; }));
  return participants.map(function (accountId) {
    var row = byId.get(accountId);
    if (!row) fail('BARRIER_PARTICIPANT_MISSING');
    var lastTick = Number(row.st.lastTick), now = Number(row.st.now);
    if (!safeNonnegative(lastTick) || !safeNonnegative(now)) fail('CANONICAL_STATE_INVALID');
    if (lastTick > targetS || now > targetS) fail('BARRIER_PARTICIPANT_BEYOND_T');
    return row;
  });
}

function projectionRows(scan) {
  var ht = [], hamdang = [], hamgiu = [];
  scan.rows.forEach(function (row) {
    row.st.planets.forEach(function (planet, planetIndex) {
      ht.push({td: G.tdKey(planet.c), tk: row.tk, ten: String(planet.ten),
        pi: planetIndex, thuDo: planet.thuDo ? 1 : 0});
    });
  });
  scan.rows.forEach(function (row) {
    row.st.fleets.forEach(function (fleet) {
      var destination = fleet && fleet.den ? G.tdKey(fleet.den) : null;
      var targetOwner = destination && scan.targetAccountForKey(destination);
      if (fleet && fleet.pha === 'di' &&
          ['attack', 'transport', 'hold'].indexOf(fleet.mission) >= 0 &&
          positiveAccountId(targetOwner) && (targetOwner !== row.tk || fleet.mission === 'hold')) {
        hamdang.push({tkA: row.tk, fid: Number(fleet.id), tkD: targetOwner,
          tu: G.tdKey(fleet.tu), den: destination, nv: fleet.mission,
          denT: Math.round(fleet.den_t), tenA: String(row.st.ten),
          lmA: row.st.lm ? row.st.lm.ten : null});
      }
      if (!fleet || fleet.mission !== 'hold' || fleet.pha !== 'giu') return;
      var heldFor = Number(fleet.giuTaiTk);
      var holdAt = Math.floor(Number(fleet.giuLuc) || 0);
      var holdUntil = Math.floor(Number(fleet.giuDen_t) || 0);
      if (!positiveAccountId(heldFor) || !scan.rows.some(function (candidate) {
        return candidate.tk === heldFor;
      }) || !(holdAt >= 0) || !(holdUntil > holdAt)) return;
      hamgiu.push({tkA: row.tk, fid: Number(fleet.id), tkD: heldFor,
        tu: G.tdKey(fleet.tu), td: destination, giuLuc: holdAt,
        giuDenT: holdUntil,
        tiepNLT: Math.floor(Number(fleet.tiepNL_t) || holdUntil)});
    });
  });
  ht.sort(function (left, right) { return sortedByUtf8(left.td, right.td); });
  function fleetOrder(left, right) { return left.tkA - right.tkA || left.fid - right.fid; }
  hamdang.sort(fleetOrder);
  hamgiu.sort(fleetOrder);
  return {ht: ht, hamdang: hamdang, hamgiu: hamgiu};
}

function projectionsNeedRepair(service, scan) {
  var expected = projectionRows(scan);
  var actual = {
    ht: service.kho.db.prepare(
      'SELECT td,tk,ten,pi,thuDo FROM ht ORDER BY td'
    ).all().map(function (row) {
      return {td: row.td, tk: Number(row.tk), ten: row.ten,
        pi: Number(row.pi), thuDo: Number(row.thuDo)};
    }),
    hamdang: service.kho.db.prepare(
      'SELECT tkA,fid,tkD,tu,den,nv,denT,tenA,lmA FROM hamdang ORDER BY tkA,fid'
    ).all().map(function (row) {
      return {tkA: Number(row.tkA), fid: Number(row.fid), tkD: Number(row.tkD),
        tu: row.tu, den: row.den, nv: row.nv, denT: Number(row.denT),
        tenA: row.tenA, lmA: row.lmA};
    }),
    hamgiu: service.kho.db.prepare(
      'SELECT tkA,fid,tkD,tu,td,giuLuc,giuDenT,tiepNLT FROM hamgiu ORDER BY tkA,fid'
    ).all().map(function (row) {
      return {tkA: Number(row.tkA), fid: Number(row.fid), tkD: Number(row.tkD),
        tu: row.tu, td: row.td, giuLuc: Number(row.giuLuc),
        giuDenT: Number(row.giuDenT), tiepNLT: Number(row.tiepNLT)};
    })
  };
  return canonicalJson(expected) !== canonicalJson(actual);
}

function protectedRoots(service, mutation, scan, executableJob) {
  var roots = new Set();
  if (executableJob.logical_root_id) roots.add(executableJob.logical_root_id);
  scan.rows.forEach(function (row) {
    service.store.listDerivedJobsForAccount(
      mutation.leaseToken, row.tk, mutation.effectiveNowMs
    ).forEach(function (job) {
      if (job.logical_root_id) roots.add(job.logical_root_id);
    });
  });
  return roots;
}

function repairProjections(service, mutation, scan, executableJob) {
  var roots = protectedRoots(service, mutation, scan, executableJob);
  var complete = false;
  service.world.batDau();
  try {
    scan.rows.forEach(function (row) {
      service.world.luu(row.tk, row.st, {mutation: mutation,
        deferAccountWake: true, protectedRecoveryRootIds: roots});
    });
    complete = true;
  } finally {
    service.world.ketThuc(complete);
  }
}

function scrubSemantic(value, key) {
  if (key && /^(?:revision|capNhat|updatedAt|updated_at_ms|createdAt|created_at_ms|audit)$/i.test(key)) {
    return undefined;
  }
  if (Array.isArray(value)) return value.map(function (entry) {
    return scrubSemantic(entry, null);
  });
  if (value && typeof value === 'object') {
    var out = {};
    Object.keys(value).sort().forEach(function (name) {
      var scrubbed = scrubSemantic(value[name], name);
      if (scrubbed !== undefined) out[name] = scrubbed;
    });
    if (Array.isArray(out.fleets)) out.fleets.sort(function (left, right) {
      return Number(left.id) - Number(right.id);
    });
    if (Array.isArray(out.tenLua)) out.tenLua.sort(function (left, right) {
      return Number(left.id) - Number(right.id);
    });
    return out;
  }
  return value;
}

function classifierSummary(candidate) {
  if (!candidate) return null;
  return {code: candidate.code, atS: candidate.atS, order: candidate.order,
    rank: candidate.rank, tie: candidate.tie, ref: candidate.ref || null};
}

function convergenceSignature(scan, participantRows, participants, candidates, roots, currentTemplate) {
  var states = participantRows.map(function (row) {
    return {accountId: row.tk, state: scrubSemantic(row.st, null),
      next: classifierSummary(G.phanLoaiSuKienNoiBoKe(
        row.st, row.tk, scan.targetAccountForKey, []
      ))};
  });
  var rootSummary = roots.map(function (row) {
    return {id: row.logical_root_id || row.id, key: row.logical_key || row.idempotency_key,
      tuple: logicalTuple(row)};
  });
  var graph = {participants: participants,
    derivedKeys: candidates.map(function (candidate) { return candidate.idempotencyKey; }),
    currentKey: currentTemplate && currentTemplate.idempotencyKey || null,
    roots: rootSummary, states: states};
  return canonicalJson(graph);
}

function semanticEligibilityState(state) {
  function sortedEntities(values) {
    return (values || []).map(function (value) { return scrubSemantic(value, null); })
      .sort(function (left, right) { return Number(left.id) - Number(right.id); });
  }
  return {lastTick: state.lastTick, now: state.now, nextRaid: state.nextRaid,
    nextMaint: state.nextMaint,
    baoTri: state.baoTri ? scrubSemantic(state.baoTri, null) : null,
    ncQueue: state.ncQueue ? scrubSemantic(state.ncQueue, null) : null,
    planets: (state.planets || []).map(function (planet) {
      return {c: scrubSemantic(planet.c, null), qB: scrubSemantic(planet.qB || [], null),
        qS: scrubSemantic(planet.qS || [], null)};
    }),
    fleets: sortedEntities(state.fleets), tenLua: sortedEntities(state.tenLua),
    toi: scrubSemantic(state.toi || [], null)};
}

function semanticCycleSignature(scan, participantRows, participants, candidates, roots) {
  var owners = Array.from(scan.owners.entries()).sort(function (left, right) {
    return sortedByUtf8(left[0], right[0]);
  });
  var states = participantRows.map(function (row) {
    return {accountId: row.tk, eligibility: semanticEligibilityState(row.st),
      next: classifierSummary(G.phanLoaiSuKienNoiBoKe(
        row.st, row.tk, scan.targetAccountForKey, []
      ))};
  });
  return canonicalJson({participants: participants, owners: owners,
    derivedKeys: candidates.map(function (candidate) { return candidate.idempotencyKey; }),
    roots: roots.map(function (row) {
      return {key: row.logical_key || row.idempotency_key,
        scheduledAtS: Number(row.logical_scheduled_at_s === undefined ?
          row.scheduled_at_s : row.logical_scheduled_at_s),
        priority: Number(row.logical_priority === undefined ? row.priority : row.logical_priority)};
    }), states: states});
}

function scanSignatures(scan, participantRows, participants, candidates, roots, currentTemplate) {
  return {
    convergence: convergenceSignature(
      scan, participantRows, participants, candidates, roots, currentTemplate
    ),
    semantic: semanticCycleSignature(
      scan, participantRows, participants, candidates, roots
    )
  };
}

function resultWithInternal(publicResult, internal) {
  return Object.assign({}, publicResult, internal || {});
}

GameAdvanceService.prototype.advanceTo = function (mutation, accountId, targetS, saveOptions) {
  validateMutation(this, mutation);
  if (!positiveAccountId(accountId) || !safeNonnegative(targetS) ||
      saveOptions !== undefined && !isPlainObject(saveOptions)) {
    fail('TICK_TARGET_INVALID');
  }
  saveOptions = saveOptions || {};
  var scan = canonicalRows(this), targetAccountForKey = scan.targetAccountForKey;
  var loaded = this.world.nap(accountId);
  if (!loaded || !loaded.st) return resultWithInternal({processed: 0,
    advancedToS: targetS, nextDueAtS: null, hasMoreDue: false,
    budgetExhausted: false}, {saveReceipt: null});
  var state = loaded.st, before = JSON.stringify(state), service = this;
  var outcome = runWithOwner(this, accountId, function () {
    return G.tick(state, targetS, {ownerAccountId: accountId,
      remainingBudget: mutation.remainingBudget, multiplayer: true,
      raidRng: durableRaidRngFactory(service, accountId, Number(loaded.row.revision)),
      targetAccountForKey: targetAccountForKey,
      durableFences: Array.isArray(saveOptions.durableFences) ? saveOptions.durableFences : []});
  });
  assertTickOutcome(outcome);
  var receipt = null;
  if (JSON.stringify(state) !== before || outcome.blockedExternal) receipt = service.world.luu(accountId, state,
    Object.assign({}, saveOptions, {mutation: mutation}));
  var internal = {saveReceipt: receipt};
  if (outcome.blockedExternal && outcome.blockedExternal.ref) {
    var deferred = schedulerEvents.jobFromRef(
      outcome.blockedExternal.ref, targetAccountForKey
    );
    if (deferred) {
      var stored = this.store.schedule(mutation.leaseToken, deferred, mutation.effectiveNowMs);
      internal.blockedExternal = outcome.blockedExternal;
      internal.deferredExternal = true;
      internal.blockedExternalJobId = stored.id;
    }
  }
  return resultWithInternal(toPublicAdvanceResult(outcome), internal);
};

GameAdvanceService.prototype.advanceLocalOnlyTo = function (
  mutation, accountId, targetS, targetAccountForKey, runOptions
) {
  validateMutation(this, mutation);
  if (!positiveAccountId(accountId) || !safeNonnegative(targetS) ||
      typeof targetAccountForKey !== 'function' ||
      runOptions !== undefined && !isPlainObject(runOptions)) {
    fail('TICK_TARGET_INVALID');
  }
  runOptions = runOptions || {};
  var loaded = this.world.nap(accountId);
  if (!loaded || !loaded.st) return resultWithInternal({processed: 0,
    advancedToS: targetS, nextDueAtS: null, hasMoreDue: false,
    budgetExhausted: false}, {saveReceipt: null});
  var state = loaded.st, before = JSON.stringify(state), service = this;
  var raidRng = runOptions.rng === undefined ?
    durableRaidRngFactory(service, accountId, Number(loaded.row.revision)) : undefined;
  var outcome = runWithOwner(this, accountId, function () {
    return G.tickNoiBo(state, targetS, {ownerAccountId: accountId,
      remainingBudget: mutation.remainingBudget,
      raidRng: raidRng,
      rng: runOptions.rng,
      targetAccountForKey: targetAccountForKey,
      durableFences: Array.isArray(runOptions.durableFences) ? runOptions.durableFences : []});
  });
  assertTickOutcome(outcome);
  var receipt = null;
  if (JSON.stringify(state) !== before) receipt = service.world.luu(accountId, state, {
    mutation: mutation,
    deferAccountWake: runOptions.deferAccountWake === true,
    currentAccountAdvanceJobId: runOptions.currentAccountAdvanceJobId,
    protectedRecoveryRootIds: runOptions.protectedRecoveryRootIds
  });
  return resultWithInternal(toPublicAdvanceResult(outcome), {saveReceipt: receipt});
};

GameAdvanceService.prototype.advanceBarrier = function (mutation, executableJob) {
  if (!mutation || typeof mutation !== 'object') fail('SCHEDULER_MUTATION_INVALID');
  executableJob = this.store.assertCanonicalExecutable(
    mutation.leaseToken, executableJob, mutation.effectiveNowMs
  );
  validateMutation(this, mutation);
  var targetS = Number(executableJob.scheduled_at_s);
  if (!safeNonnegative(targetS) || !executableJob.payload ||
      !executableJob.payload.ref) fail('PAYLOAD_INTEGRITY');
  var ref = executableJob.payload.ref, processed = 0, scans = 0;
  var initial = canonicalRows(this), initialBudget = mutation.remainingBudget.value;
  var bound = 4 + 4 * initial.rows.length + 4 * initialBudget;
  var previousConvergence = null, previousSemantic = null;
  var seenNonterminal = new Set(), localActions = 0;
  while (true) {
    if (scans >= bound) fail('BARRIER_FIXED_POINT_BOUND');
    scans += 1;
    var scan = scans === 1 ? initial : canonicalRows(this);
    var participants = participantIds(scan, ref, targetS);
    var participantRows = rowsForParticipants(scan, participants, targetS);
    var candidates = deriveCandidates(scan);
    var currentTemplate = schedulerEvents.jobFromRef(ref, scan.targetAccountForKey);
    var inserted = scheduleCandidates(this, mutation, candidates);
    var roots = this.store.listLogicalBarrierJobsAtOrBefore(
      mutation.leaseToken, targetS, mutation.effectiveNowMs
    );
    var first = roots[0];
    if (first && (first.logical_root_id || first.id) !==
        (executableJob.logical_root_id || executableJob.id)) {
      if (compareTuple(logicalTuple(first), logicalTuple(executableJob)) >= 0) {
        fail('BARRIER_PRECEDING_ORDER_INVALID');
      }
      this.store.parkGlobalBehindPreceding(mutation.leaseToken, executableJob,
        first.id, targetS, mutation.effectiveNowMs);
      return resultWithInternal({processed: processed, advancedToS: targetS,
        nextDueAtS: Number(first.logical_scheduled_at_s === undefined ?
          first.scheduled_at_s : first.logical_scheduled_at_s),
        hasMoreDue: true, budgetExhausted: false},
      {blockedExternal: true, blockedExternalJobId: first.id});
    }
    if (projectionsNeedRepair(this, scan)) {
      repairProjections(this, mutation, scan, executableJob);
      previousConvergence = null;
      previousSemantic = null;
      continue;
    }
    if (inserted > 0) {
      previousConvergence = null;
      previousSemantic = null;
      continue;
    }
    var signatures = scanSignatures(
      scan, participantRows, participants, candidates, roots, currentTemplate
    );
    var needing = participantRows.find(function (row) {
      var next = G.phanLoaiSuKienNoiBoKe(
        row.st, row.tk, scan.targetAccountForKey, []
      );
      return Number(row.st.lastTick) < targetS || !!(next && next.atS <= targetS);
    });
    if (!needing) {
      previousSemantic = null;
      if (previousConvergence === signatures.convergence) {
        return {processed: processed, advancedToS: targetS, nextDueAtS: null,
          hasMoreDue: false, budgetExhausted: false};
      }
      previousConvergence = signatures.convergence;
      continue;
    }
    previousConvergence = null;
    if (previousSemantic === signatures.semantic) fail('BARRIER_FIXED_POINT_STALL');
    if (localActions > 0 && seenNonterminal.has(signatures.semantic)) {
      fail('BARRIER_FIXED_POINT_CYCLE');
    }
    if (localActions > 0) seenNonterminal.add(signatures.semantic);
    previousSemantic = signatures.semantic;
    var rootsForSave = protectedRoots(this, mutation, scan, executableJob);
    var fences = this.store.listUnresolvedGlobalRefsAtOrBefore(
      mutation.leaseToken, needing.tk, targetS, mutation.effectiveNowMs
    );
    var local = this.advanceLocalOnlyTo(mutation, needing.tk, targetS,
      scan.targetAccountForKey, {deferAccountWake: true,
        durableFences: fences, protectedRecoveryRootIds: rootsForSave});
    localActions += 1;
    processed += local.processed;
    if (local.budgetExhausted) {
      return resultWithInternal({processed: processed,
        advancedToS: local.advancedToS, nextDueAtS: local.nextDueAtS,
        hasMoreDue: true, budgetExhausted: true}, {saveReceipt: local.saveReceipt});
    }
  }
};

function validatePreflightToken(token) {
  if (!isPlainObject(token) || typeof token.ownerId !== 'string' || !token.ownerId ||
      !Number.isSafeInteger(token.generation) || token.generation < 1) {
    fail('PREFLIGHT_INPUT_INVALID');
  }
}

GameAdvanceService.prototype.preflightCutover = function (
  leaseToken, cutoverAtS, remainingBudget, effectiveNowMs
) {
  validatePreflightToken(leaseToken);
  if (!safeNonnegative(cutoverAtS) || !safeNonnegative(effectiveNowMs)) {
    fail('PREFLIGHT_INPUT_INVALID');
  }
  exactBudget(remainingBudget, 'PREFLIGHT_INPUT_INVALID');
  this.store.assertLiveLease(leaseToken, effectiveNowMs);
  var scan = canonicalRows(this);
  var copies = scan.rows.map(function (row) {
    return {tk: row.tk, revision: row.revision, st: JSON.parse(JSON.stringify(row.st))};
  });
  var processed = 0, priorHook = G.HOOK, service = this;
  try {
    G.HOOK = null;
    copies.forEach(function (row) {
      var outcome = G.tickNoiBo(row.st, cutoverAtS, {ownerAccountId: row.tk,
        remainingBudget: remainingBudget,
        raidRng: durableRaidRngFactory(service, row.tk, row.revision),
        targetAccountForKey: scan.targetAccountForKey, durableFences: []});
      assertTickOutcome(outcome);
      processed += outcome.processed;
    });
  } finally {
    G.HOOK = priorHook;
  }
  var nextDueAtS = null;
  copies.forEach(function (row) {
    var next = G.phanLoaiSuKienNoiBoKe(
      row.st, row.tk, scan.targetAccountForKey, []
    );
    if (next && next.atS <= cutoverAtS &&
        (nextDueAtS === null || next.atS < nextDueAtS)) nextDueAtS = next.atS;
  });
  return {processed: processed, nextDueAtS: nextDueAtS,
    hasMoreDue: nextDueAtS !== null};
};

module.exports = Object.freeze({
  GameAdvanceService: GameAdvanceService,
  toPublicAdvanceResult: toPublicAdvanceResult
});
