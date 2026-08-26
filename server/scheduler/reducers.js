'use strict';

var G = require('../rules.js').G;
var schedulerEvents = require('./events.js');
var snapshotModule = require('./combat-snapshot.js');
var seed32 = snapshotModule.seed32;
var buildCombatSnapshotV1 = snapshotModule.buildCombatSnapshotV1;
var payloadIntegrity = require('./store.js').payloadIntegrity;

var preparedCapabilities = new WeakMap();
var executableCapabilities = new WeakMap();
var MAX_BUDGET = 50000;

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

function positive(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function ownEnumerableDataKeys(value) {
  if (!isPlainObject(value)) return null;
  var keys = Reflect.ownKeys(value);
  for (var index = 0; index < keys.length; index++) {
    if (typeof keys[index] !== 'string') return null;
    var descriptor = Object.getOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
  }
  return keys;
}

function exactBudget(value) {
  return isPlainObject(value) && Object.keys(value).length === 1 &&
    Object.keys(value)[0] === 'value' && safeNonnegative(value.value) &&
    value.value <= MAX_BUDGET;
}

function validateMutation(reducer, mutation) {
  if (!isPlainObject(mutation) || !mutation.leaseToken ||
      !safeNonnegative(mutation.effectiveNowMs) || !exactBudget(mutation.remainingBudget)) {
    fail('MUTATION_CONTEXT_INVALID');
  }
  if (!reducer.world || typeof reducer.world._schedulerActive !== 'function') {
    fail('MUTATION_CONTEXT_INVALID');
  }
  reducer.world._schedulerActive(mutation);
  return mutation;
}

function deepFreeze(value, seen) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  seen = seen || new Set();
  if (seen.has(value)) return value;
  seen.add(value);
  Object.keys(value).forEach(function (key) { deepFreeze(value[key], seen); });
  return Object.freeze(value);
}

function frozenPrepared(reducer, value) {
  var prepared = deepFreeze(value);
  preparedCapabilities.get(reducer).add(prepared);
  return prepared;
}

function exactResources(value) {
  value = value || {};
  return {metal: Number(value.metal || 0), crystal: Number(value.crystal || 0),
    deut: Number(value.deut || 0), food: Number(value.food || 0)};
}

function exactTech(value) {
  value = value || {};
  return {weapon: Math.max(0, Math.floor(Number(value.weapon) || 0)),
    shield: Math.max(0, Math.floor(Number(value.shield) || 0)),
    armor: Math.max(0, Math.floor(Number(value.armor) || 0))};
}

function exactUnits(value, definitions) {
  var allowed = new Set(definitions.map(function (entry) { return entry.id; }));
  return Object.keys(value || {}).sort().reduce(function (out, key) {
    var count = Number(value[key]);
    if (!allowed.has(key) || !safeNonnegative(count)) throw payloadIntegrity();
    if (count > 0) out[key] = count;
    return out;
  }, {});
}

function canonicalRows(reducer) {
  var owners = new Map(), states = new Map();
  reducer.kho.db.prepare('SELECT tk,state,revision FROM dq ORDER BY tk').all()
    .forEach(function (row) {
      var accountId = Number(row.tk), state;
      if (!positive(accountId) || !safeNonnegative(Number(row.revision))) throw payloadIntegrity();
      try { state = JSON.parse(row.state); }
      catch (error) { throw payloadIntegrity(); }
      if (!state || !Array.isArray(state.planets) || !Array.isArray(state.fleets) ||
          !Array.isArray(state.tenLua || [])) throw payloadIntegrity();
      states.set(accountId, {accountId: accountId, revision: Number(row.revision), state: state});
      state.planets.forEach(function (planet) {
        var key = G.tdKey(planet.c);
        if (owners.has(key)) fail('CANONICAL_TARGET_OWNER_CONFLICT');
        owners.set(key, accountId);
      });
    });
  return {owners: owners, states: states};
}

function currentEntity(context, ref) {
  var owner = context.states.get(Number(ref.ownerAccountId));
  if (!owner) return null;
  var list = ref.kind === 'missile' ? owner.state.tenLua : owner.state.fleets;
  var id = ref.kind === 'missile' ? ref.missileId : ref.fleetId;
  var entity = list.find(function (candidate) { return Number(candidate.id) === Number(id); });
  return entity ? {owner: owner, entity: entity} : null;
}

function targetContext(context, ref) {
  var accountId = context.owners.get(ref.targetKey);
  if (!positive(accountId) || accountId === Number(ref.ownerAccountId)) return null;
  var owner = context.states.get(accountId);
  var planet = owner && owner.state.planets.find(function (candidate) {
    return G.tdKey(candidate.c) === ref.targetKey;
  });
  return planet ? {accountId: accountId, owner: owner, planet: planet} : null;
}

function combatSnapshotInput(reducer, job, context, target, entity) {
  var ref = job.payload.ref, terrain = G.loaiHT(target.owner.state, target.planet);
  var atS = Number(job.scheduled_at_s);
  if (Number(entity.owner.state.lastTick) !== atS || Number(entity.owner.state.now) !== atS ||
      Number(target.owner.state.lastTick) !== atS || Number(target.owner.state.now) !== atS) {
    fail('BARRIER_PARTICIPANT_NOT_AT_T');
  }
  if (!terrain || !Number.isFinite(Number(terrain.thuDat)) ||
      typeof terrain.ten !== 'string') throw payloadIntegrity();
  var supporters = [];
  context.states.forEach(function (entry) {
    entry.state.fleets.forEach(function (fleet) {
      if (!fleet || fleet.mission !== 'hold' || fleet.pha !== 'giu' ||
          Number(fleet.giuTaiTk) !== target.accountId ||
          G.tdKey(fleet.den) !== ref.targetKey ||
          Number(fleet.giuLuc) > Number(job.scheduled_at_s) ||
          Number(fleet.giuDen_t) <= Number(job.scheduled_at_s)) return;
      if (Number(entry.state.lastTick) !== atS || Number(entry.state.now) !== atS) {
        fail('BARRIER_PARTICIPANT_NOT_AT_T');
      }
      var ships = exactUnits(fleet.ships, G.SHIPS);
      if (!Object.keys(ships).length) return;
      supporters.push({accountId: entry.accountId, revision: entry.revision,
        fleetId: Number(fleet.id), tech: exactTech(entry.state.tech), ships: ships});
    });
  });
  var seedKeyHex = reducer.kho.cauhinh('combat_seed_key_v1');
  if (typeof seedKeyHex !== 'string' || !/^[0-9a-f]{64}$/.test(seedKeyHex)) {
    fail('COMBAT_SEED_KEY_INVALID');
  }
  var snapshot = buildCombatSnapshotV1({
    executableJob: job, seedKeyHex: seedKeyHex,
    attacker: {accountId: Number(ref.ownerAccountId), revision: entity.owner.revision,
      fleetId: Number(ref.fleetId), tech: exactTech(entity.owner.state.tech),
      ships: exactUnits(entity.entity.ships, G.SHIPS),
      linh: exactUnits(entity.entity.linh || {}, G.BOBINH),
      cargo: exactResources(entity.entity.cargo)},
    defender: {accountId: target.accountId, revision: target.owner.revision,
      targetKey: ref.targetKey, tech: exactTech(target.owner.state.tech),
      ships: exactUnits(target.planet.ships || {}, G.SHIPS),
      def: exactUnits(target.planet.def || {}, G.DEFENSES),
      linh: exactUnits(target.planet.linh || {}, G.BOBINH),
      res: exactResources(target.planet.res),
      terrain: {thuDat: Number(terrain.thuDat), loaiHT: terrain.ten}},
    supporters: supporters
  });
  if (snapshot.seed !== reducer.seedForJob(job)) throw payloadIntegrity();
  return {seedKeyHex: seedKeyHex, snapshot: snapshot};
}

function canonicalWorldTarget(mutation, job, target, neutralization) {
  return Object.freeze({mutation: mutation, effectiveAtS: Number(job.scheduled_at_s),
    accountId: target ? target.accountId : null,
    targetKey: job.payload.ref.targetKey,
    logicalRootId: job.logical_root_id || job.id,
    neutralization: neutralization || null});
}

function cancellationPrepared(reducer, mutation, job, reason, neutralization, target) {
  var result = {code: reason, invalidation: 'canonical', neutralization: neutralization};
  var apply = function () {
    if (neutralization === 'ALREADY_ABSENT' || neutralization === 'REF_MISMATCH') {
      return {neutralization: neutralization};
    }
    var ref = job.payload.ref;
    var method = ref.kind === 'missile' ? 'resolveMissileAt' :
      ref.mission === 'attack' ? 'resolvePvpAt' :
      ref.mission === 'transport' ? 'resolveTransportAt' :
      ref.mission === 'spy' ? 'resolveSpyAt' : 'resolveHoldAt';
    var worldTarget = canonicalWorldTarget(mutation, job, target, neutralization);
    if (method === 'resolvePvpAt') {
      return reducer.world.resolvePvpAt(ref, Number(job.scheduled_at_s), 0, null, worldTarget);
    }
    return reducer.world[method](ref, Number(job.scheduled_at_s), worldTarget);
  };
  return frozenPrepared(reducer, {kind: 'prepared', terminalState: 'CANCELLED',
    cancelReason: reason, application: {effectiveAtS: Number(job.scheduled_at_s), result: result},
    apply: apply});
}

function EventReducer(options) {
  if (!isPlainObject(options) || !options.kho || !options.world || !options.store ||
      !options.clock || !options.advanceService) fail('EVENT_REDUCER_CONTEXT_INVALID');
  this.kho = options.kho;
  this.world = options.world;
  this.store = options.store;
  this.clock = options.clock;
  this.advanceService = options.advanceService;
  preparedCapabilities.set(this, new WeakSet());
  executableCapabilities.set(this, new WeakSet());
}

EventReducer.prototype.initializeCombatSeed = function (leaseToken, effectiveNowMs) {
  return this.store.getOrCreateCombatSeedKey(leaseToken, effectiveNowMs);
};

function prepareAccount(reducer, mutation, job, options) {
  var row = reducer.kho.db.prepare('SELECT revision FROM dq WHERE tk=?')
    .get(Number(job.aggregate_id));
  if (!row) return frozenPrepared(reducer, {kind: 'prepared', terminalState: 'CANCELLED',
    cancelReason: 'MATCH_INVALIDATED', application: {
      effectiveAtS: Number(job.scheduled_at_s), result: {code: 'MATCH_INVALIDATED'}
    }, saveReceipt: null, advanceResult: null, apply: function () { return null; }});
  var expected = job.checkpoint_revision === null || job.checkpoint_revision === undefined ?
    Number(job.expected_revision) : Number(job.checkpoint_revision);
  var reconcile = Number(job.expected_revision) === -1 && job.payload.reconcile === true &&
    job.checkpoint_revision === null;
  if (!reconcile && expected !== Number(row.revision)) {
    return frozenPrepared(reducer, {kind: 'prepared', terminalState: 'CANCELLED',
      cancelReason: 'STALE_REVISION', application: {
        effectiveAtS: Number(job.scheduled_at_s), result: {code: 'STALE_REVISION'}
      }, saveReceipt: null, advanceResult: null, apply: function () { return null; }});
  }
  var targetS = options.executionTargetS === undefined ? Number(job.scheduled_at_s) :
    options.executionTargetS;
  if (!safeNonnegative(targetS) || targetS < Number(job.scheduled_at_s)) {
    fail('ACCOUNT_ADVANCE_TARGET_INVALID');
  }
  var roots = new Set();
  if (job.logical_root_id) roots.add(job.logical_root_id);
  var advanceResult = reducer.advanceService.advanceTo(mutation,
    Number(job.aggregate_id), targetS, {currentAccountAdvanceJobId: job.id,
      deferAccountWake: true, protectedRecoveryRootIds: roots});
  var receipt = advanceResult.saveReceipt || null;
  var partial = advanceResult.budgetExhausted === true ||
    advanceResult.deferredExternal === true || !!advanceResult.blockedExternalJobId;
  if (partial) {
    var establishedZero = advanceResult.processed === 0 &&
      advanceResult.budgetExhausted === true && advanceResult.hasMoreDue === true &&
      mutation.remainingBudget.value === 0;
    if (!receipt && !establishedZero) fail('ACCOUNT_PARTIAL_RECEIPT_REQUIRED');
    return frozenPrepared(reducer, {kind: 'partial', advanceResult: advanceResult,
      saveReceipt: receipt, apply: function () {
        return {checkpointRevision: receipt && receipt.revision, saveReceipt: receipt};
      }});
  }
  return frozenPrepared(reducer, {kind: 'prepared', terminalState: 'COMPLETED',
    application: {effectiveAtS: Number(job.scheduled_at_s), result: {code: 'ACCOUNT_ADVANCED'}},
    advanceResult: advanceResult, saveReceipt: receipt,
    nextLocalAtS: receipt && receipt.nextLocalAtS, apply: function () { return receipt; }});
}

function prepareGlobal(reducer, mutation, job) {
  var ref = job.payload && job.payload.ref;
  if (!ref) throw payloadIntegrity();
  var status = schedulerEvents.canonicalExternalStatus(reducer.kho, ref);
  var context = canonicalRows(reducer);
  var target = targetContext(context, ref);
  if (status === 'ALREADY_ABSENT' || status === 'REF_MISMATCH') {
    return cancellationPrepared(reducer, mutation, job, 'MATCH_INVALIDATED', status, target);
  }
  if (status !== 'EXACT') throw payloadIntegrity();
  if (!target) {
    return cancellationPrepared(reducer, mutation, job, 'MATCH_INVALIDATED',
      ref.kind === 'missile' ? 'MISSILE_REMOVED' : 'RETURNED', null);
  }
  var entity = currentEntity(context, ref);
  if (!entity) return cancellationPrepared(
    reducer, mutation, job, 'MATCH_INVALIDATED', 'ALREADY_ABSENT', target
  );
  var worldTarget = canonicalWorldTarget(mutation, job, target, null);
  if (job.kind === 'PVP_RESOLVE') {
    if (ref.kind !== 'fleet' || ref.mission !== 'attack' ||
        schedulerEvents.derivePvpMatchId(ref, target.accountId) !== job.payload.matchId ||
        job.aggregate_id !== job.payload.matchId) throw payloadIntegrity();
    var built = combatSnapshotInput(reducer, job, context, target, entity);
    return frozenPrepared(reducer, {kind: 'prepared', terminalState: 'COMPLETED',
      canonicalTContext: {snapshot: built.snapshot, seedKeyHex: built.seedKeyHex},
      application: {effectiveAtS: Number(job.scheduled_at_s), snapshot: built.snapshot,
        result: {code: 'PVP_RESOLVED'}}, apply: function () {
          return reducer.world.resolvePvpAt(ref, Number(job.scheduled_at_s),
            built.snapshot.seed, built.snapshot, worldTarget);
        }});
  }
  var methods = {transport: 'resolveTransportAt', spy: 'resolveSpyAt',
    hold: 'resolveHoldAt', missile: 'resolveMissileAt'};
  var method = methods[ref.mission];
  if (job.kind !== 'EXTERNAL_RESOLVE' || !method ||
      typeof reducer.world[method] !== 'function') throw payloadIntegrity();
  return frozenPrepared(reducer, {kind: 'prepared', terminalState: 'COMPLETED',
    application: {effectiveAtS: Number(job.scheduled_at_s),
      result: {code: 'EXTERNAL_RESOLVED'}}, apply: function () {
        return reducer.world[method](ref, Number(job.scheduled_at_s), worldTarget);
      }});
}

EventReducer.prototype.prepare = function (mutation, executableJob, options) {
  validateMutation(this, mutation);
  executableJob = this.store.assertCanonicalExecutable(
    mutation.leaseToken, executableJob, mutation.effectiveNowMs
  );
  executableCapabilities.get(this).add(executableJob);
  options = options === undefined ? {} : options;
  if (!isPlainObject(options) || Object.keys(options).some(function (key) {
    return key !== 'executionTargetS';
  })) fail('REDUCER_OPTIONS_INVALID');
  if (executableJob.kind === 'ACCOUNT_ADVANCE') {
    return prepareAccount(this, mutation, executableJob, options);
  }
  if (executableJob.kind === 'PVP_RESOLVE' || executableJob.kind === 'EXTERNAL_RESOLVE') {
    return prepareGlobal(this, mutation, executableJob);
  }
  throw payloadIntegrity();
};

EventReducer.prototype.applyPrepared = function (mutation, prepared) {
  validateMutation(this, mutation);
  var capabilities = preparedCapabilities.get(this);
  if (!capabilities || !capabilities.has(prepared) || typeof prepared.apply !== 'function') {
    fail('PREPARED_EFFECT_INVALID');
  }
  var result = prepared.apply();
  if (result && typeof result.then === 'function') fail('WORLD_RULES_HOOK_ASYNC');
  return result;
};

EventReducer.prototype.prepareCanonicalInvalidation = function (
  mutation, executableJob, reason, detail
) {
  validateMutation(this, mutation);
  executableJob = this.store.assertCanonicalExecutable(
    mutation.leaseToken, executableJob, mutation.effectiveNowMs
  );
  executableCapabilities.get(this).add(executableJob);
  if (executableJob.kind === 'ACCOUNT_ADVANCE' ||
      ['MATCH_INVALIDATED', 'ENTITY_REMOVED', 'OPERATOR_CONFIRMED_INVALID'].indexOf(reason) < 0 ||
      detail !== null && detail !== undefined && !isPlainObject(detail)) {
    fail('CANONICAL_INVALIDATION_INVALID');
  }
  var ref = executableJob.payload.ref;
  var status = schedulerEvents.canonicalExternalStatus(this.kho, ref);
  var context = canonicalRows(this), target = targetContext(context, ref);
  var neutralization = status;
  if (status === 'EXACT') neutralization = ref.kind === 'missile' ? 'MISSILE_REMOVED' : 'RETURNED';
  if (['RETURNED', 'MISSILE_REMOVED', 'ALREADY_ABSENT', 'REF_MISMATCH']
      .indexOf(neutralization) < 0) throw payloadIntegrity();
  return cancellationPrepared(this, mutation, executableJob, reason, neutralization, target);
};

EventReducer.prototype.prepareRecoveredLatestState = function (
  mutation, executableJob, cutoverAtS
) {
  var self = this;
  validateMutation(this, mutation);
  executableJob = this.store.assertCanonicalExecutable(
    mutation.leaseToken, executableJob, mutation.effectiveNowMs
  );
  executableCapabilities.get(this).add(executableJob);
  if (executableJob.kind === 'ACCOUNT_ADVANCE' || !safeNonnegative(cutoverAtS) ||
      cutoverAtS < Number(executableJob.scheduled_at_s)) {
    fail('RECOVERED_LATEST_STATE_INVALID');
  }
  return frozenPrepared(this, {kind: 'prepared', terminalState: 'COMPLETED',
    application: {effectiveAtS: cutoverAtS, result: {
      code: 'RECOVERED_LATEST_STATE', recoveredAtCutover: true,
      recovery: 'recovered-latest-state',
      originalScheduledAtS: Number(executableJob.scheduled_at_s), recoveredAtS: cutoverAtS
    }}, apply: function () {
      var ref = executableJob.payload.ref;
      var loaded = self.world.nap(Number(ref.ownerAccountId));
      if (!loaded) return null;
      var list = ref.kind === 'missile' ? loaded.st.tenLua : loaded.st.fleets;
      var id = ref.kind === 'missile' ? Number(ref.missileId) : Number(ref.fleetId);
      if (!Array.isArray(list)) return null;
      var index = list.findIndex(function (unit) {
        return Number(unit && unit.id) === id;
      });
      if (index < 0) return null;
      var unit = list[index];
      if (ref.kind === 'fleet' && unit.pha !== 'di') return null;
      var stable;
      try {
        stable = ref.kind === 'missile' ?
          schedulerEvents.stableMissileRef(Number(loaded.row.tk), unit) :
          schedulerEvents.stableFleetRef(Number(loaded.row.tk), unit);
      } catch (error) {
        return null;
      }
      if (!schedulerEvents.sameExternalRef(stable, ref)) return null;
      loaded.st.now = Math.max(Number(loaded.st.now) || 0, Number(cutoverAtS));
      if (ref.kind === 'missile') list.splice(index, 1);
      else G.batDauVe(loaded.st, unit, true, null);
      if (mutation.protectedRecoveryRootIds !== undefined &&
          !(mutation.protectedRecoveryRootIds instanceof Set)) {
        fail('RECOVERED_LATEST_STATE_INVALID');
      }
      return self.world.luu(Number(loaded.row.tk), loaded.st, {
        mutation: mutation,
        protectedRecoveryRootIds: mutation.protectedRecoveryRootIds
      });
    }});
};

EventReducer.prototype.seedForJob = function (executableJob) {
  var key = this.kho.cauhinh('combat_seed_key_v1');
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key) ||
      !executableCapabilities.get(this).has(executableJob) ||
      !executableJob || executableJob.kind !== 'PVP_RESOLVE' ||
      !executableJob.payload || !executableJob.payload.matchId) {
    fail('COMBAT_SEED_KEY_INVALID');
  }
  return seed32(key, executableJob.payload.matchId,
    Number(executableJob.scheduled_at_s), 1);
};

function validateHelperContext(context, options) {
  var contextKeys = ownEnumerableDataKeys(context) || [];
  var allowedContextKeys = ['store', 'reducer', 'mutation', 'leaseToken', 'nowMs'];
  var hasLockMs = contextKeys.indexOf('lockMs') >= 0;
  if (hasLockMs) allowedContextKeys.push('lockMs');
  var optionKeys = ownEnumerableDataKeys(options) || [];
  if (!isPlainObject(context) || !ownEnumerableDataKeys(context) ||
      contextKeys.length !== allowedContextKeys.length ||
      contextKeys.some(function (key) {
        return typeof key !== 'string' || allowedContextKeys.indexOf(key) < 0;
      }) || !context.store || !context.reducer || context.reducer.store !== context.store ||
      context.reducer.kho !== context.store.kho || context.store.db !== context.store.kho.db ||
      context.store.kho.transactionDepth < 1 || context.store.db.isTransaction !== true ||
      !isPlainObject(context.mutation) || context.leaseToken !== context.mutation.leaseToken ||
      !safeNonnegative(context.nowMs) || context.nowMs !== context.mutation.effectiveNowMs ||
      hasLockMs && !positive(context.lockMs) ||
      !exactBudget(context.mutation.remainingBudget) || !isPlainObject(options) ||
      !ownEnumerableDataKeys(options) ||
      optionKeys.some(function (key) {
        if (typeof key !== 'string') return true;
        return ['rootMustBeQuarantined', 'detail', 'afterApplicationForTest'].indexOf(key) < 0;
      }) || Object.hasOwn(options, 'rootMustBeQuarantined') &&
        typeof options.rootMustBeQuarantined !== 'boolean' ||
      Object.hasOwn(options, 'detail') && options.detail !== null &&
        !isPlainObject(options.detail) ||
      Object.hasOwn(options, 'afterApplicationForTest') &&
        typeof options.afterApplicationForTest !== 'function') {
    fail('CANONICAL_GLOBAL_HELPER_INVALID');
  }
  try { context.reducer.world._schedulerActive(context.mutation); }
  catch (error) { fail('CANONICAL_GLOBAL_HELPER_INVALID'); }
  return hasLockMs ? context.lockMs : 15_000;
}

function resolveCanonicalGlobalInCurrentUow(context, jobId, reason, options) {
  options = options === undefined ? {} : options;
  var lockMs = validateHelperContext(context, options);
  if (typeof jobId !== 'string' || !jobId ||
      ['MATCH_INVALIDATED', 'ENTITY_REMOVED', 'OPERATOR_CONFIRMED_INVALID'].indexOf(reason) < 0) {
    fail('CANONICAL_GLOBAL_HELPER_INVALID');
  }
  var job = context.store.claimGlobalForInvalidation(
    context.leaseToken, jobId, context.nowMs, lockMs,
    {allowQuarantined: true, allowFuturePending: true,
      rootMustBeQuarantined: options.rootMustBeQuarantined === true}
  );
  if (!job) fail('CANONICAL_GLOBAL_HELPER_INVALID');
  var prepared = context.reducer.prepareCanonicalInvalidation(
    context.mutation, job, reason, options.detail || null
  );
  var alreadyCommitted = context.store.hasCommittedApplication(
    context.leaseToken, job, context.nowMs
  );
  if (!alreadyCommitted) {
    if (context.mutation.remainingBudget.value < 1) fail('TICK_BUDGET_INVALID');
    context.mutation.remainingBudget.value -= 1;
  }
  context.store.markDurableMutation(context.leaseToken, context.nowMs);
  var stored = context.store.insertApplication(context.leaseToken, job,
    prepared.application, context.nowMs, prepared.canonicalTContext || null);
  if (options.afterApplicationForTest) options.afterApplicationForTest(job, stored);
  var effect = stored.alreadyApplied ?
    {neutralization: prepared.application.result.neutralization} :
    context.reducer.applyPrepared(context.mutation, prepared);
  if (!effect || effect.neutralization !== prepared.application.result.neutralization) {
    fail('CANONICAL_INVALIDATION_EFFECT_MISMATCH');
  }
  context.store.finishResolved(
    context.leaseToken, job, 'CANCELLED', prepared.cancelReason, context.nowMs
  );
  return {logicalRootId: job.logical_root_id || job.id, resolvedJobId: job.id,
    neutralization: prepared.application.result.neutralization};
}

module.exports = Object.freeze({
  EventReducer: EventReducer,
  seed32: seed32,
  resolveCanonicalGlobalInCurrentUow: resolveCanonicalGlobalInCurrentUow
});
