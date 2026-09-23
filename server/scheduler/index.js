"use strict";

var crypto = require('node:crypto');
var fs = require('node:fs');
var path = require('node:path');
var storeModule = require('./store.js');
var SchedulerStore = storeModule.SchedulerStore;
var assertSchedulerOwnerId = storeModule.assertSchedulerOwnerId;
var GameAdvanceService = require('./advance-service.js').GameAdvanceService;
var EventReducer = require('./reducers.js').EventReducer;
var SchedulerWriter = null;
var reconcileCanonicalState = require('./cutover.js').reconcileCanonicalState;

var bridgeByKho = new WeakMap();
var bridgeByWriter = new WeakMap();
var STATUS_KEYS = [
  'ages', 'continuationActive', 'counts', 'dbOpen', 'draining', 'dueBacklog',
  'heartbeatTimerActive', 'leaseHeld', 'metrics', 'mode', 'nextEligibleAtMs',
  'oldestDueAgeMs', 'pending', 'pollTimerActive', 'quarantined', 'ready',
  'reason', 'reconcileTimerActive', 'recoveryComplete', 'retryWait',
  'running', 'signalHandlerInstalled', 'state', 'wakeTimerActive',
  'watermarkS', 'writerLeaseHeld'
];
var STATUS_DEFAULTS = {
  ages: {},
  continuationActive: false,
  counts: {},
  dbOpen: true,
  draining: false,
  dueBacklog: 0,
  heartbeatTimerActive: false,
  leaseHeld: false,
  metrics: {jobAttempts: {}, jobDuration: {}, leaseAcquire: {}, reconcile: {}},
  mode: 'legacy',
  nextEligibleAtMs: null,
  oldestDueAgeMs: 0,
  pending: 0,
  pollTimerActive: false,
  quarantined: 0,
  ready: false,
  reason: null,
  reconcileTimerActive: false,
  recoveryComplete: false,
  retryWait: 0,
  running: 0,
  signalHandlerInstalled: false,
  state: 'standby',
  wakeTimerActive: false,
  watermarkS: null,
  writerLeaseHeld: false
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseSchedulerOptions(value) {
  var keys = value && Object.keys(value).sort();
  if (!keys || keys.join(',') !== 'cleanupMs,schedulerLogTicks,schedulerPollMs') {
    throw new Error('FOUNDATION_SCHEDULER_OPTIONS_INVALID');
  }
  return value;
}

function inRange(name, value, min, max) {
  var n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(name + ' must be an integer in [' + min + ',' + max + ']');
  }
  return n;
}

function envRange(env, name, fallback, min, max) {
  return env[name] === undefined ? fallback : inRange(name, env[name], min, max);
}

function assertPrivateOwner(stat, code) {
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error(code + '_OWNER_INVALID');
  }
  if ((stat.mode & 0o077) !== 0) throw new Error(code + '_MODE_INSECURE');
}

function validateProductionDatabasePath(dbPath, options) {
  options = options || {};
  var production = options.production === true || options.nodeEnv === 'production';
  if (production && dbPath === ':memory:') throw new Error('THDC_DB_MEMORY_FORBIDDEN');
  if (!production) return dbPath;
  var resolved = path.resolve(dbPath);
  if (!Array.isArray(options.dbPathAllowlist) || options.dbPathAllowlist.length === 0) {
    throw new Error('THDC_DB_ALLOWLIST_REQUIRED');
  }
  var allowlist = options.dbPathAllowlist.map(function (entry) {
    if (typeof entry !== 'string' || !path.isAbsolute(entry)) {
      throw new Error('THDC_DB_ALLOWLIST_INVALID');
    }
    return path.resolve(entry);
  });
  if (allowlist.indexOf(resolved) === -1) throw new Error('THDC_DB_NOT_ALLOWLISTED');
  assertPrivateOwner(fs.statSync(path.dirname(resolved)), 'THDC_DB_PARENT');
  if (!fs.existsSync(resolved)) {
    var fd = fs.openSync(resolved, 'wx', 0o600);
    fs.closeSync(fd);
    fs.chmodSync(resolved, 0o600);
  }
  assertPrivateOwner(fs.statSync(resolved), 'THDC_DB');
  return resolved;
}

function resolveDurableSchedulerOptions(base, env) {
  env = env || process.env;
  base = baseSchedulerOptions(base);
  var schedulerPollMs = inRange('schedulerPollMs', base.schedulerPollMs, 100, 10_000);
  if (typeof base.schedulerLogTicks !== 'boolean') {
    throw new Error('schedulerLogTicks must be boolean');
  }
  var cleanupMs = inRange('cleanupMs', base.cleanupMs, 1, Number.MAX_SAFE_INTEGER);
  var leaseMs = envRange(env, 'SCHEDULER_LEASE_MS', 15_000, 3_000, 60_000);
  if (schedulerPollMs >= leaseMs / 3) {
    throw new Error('schedulerPollMs must be strictly less than SCHEDULER_LEASE_MS / 3');
  }
  var retryBaseMs = envRange(env, 'SCHEDULER_RETRY_BASE_MS', 1_000, 100, 60_000);
  var retryMaxMs = envRange(env, 'SCHEDULER_RETRY_MAX_MS', 300_000, 100, 3_600_000);
  if (retryMaxMs < retryBaseMs) {
    throw new Error('SCHEDULER_RETRY_MAX_MS must be at least base');
  }
  return {
    schedulerPollMs: schedulerPollMs,
    schedulerLogTicks: base.schedulerLogTicks,
    cleanupMs: cleanupMs,
    leaseMs: leaseMs,
    retryBaseMs: retryBaseMs,
    retryMaxMs: retryMaxMs,
    maxAttempts: envRange(env, 'SCHEDULER_MAX_ATTEMPTS', 8, 1, 20),
    maxQuarantinedReady: envRange(env, 'SCHEDULER_MAX_QUARANTINED_READY', 0, 0, 10_000),
    maxBacklogAgeMs: envRange(env, 'SCHEDULER_MAX_BACKLOG_AGE_MS', 60_000, 1_000, 3_600_000),
    shutdownGraceMs: envRange(env, 'SCHEDULER_SHUTDOWN_GRACE_MS', 10_000, 1_000, 60_000),
    reconcileIntervalMs: envRange(env, 'SCHEDULER_RECONCILE_INTERVAL_MS', 300_000, 1_000, 3_600_000)
  };
}

function sameBase(left, right) {
  return left.schedulerPollMs === right.schedulerPollMs &&
    left.schedulerLogTicks === right.schedulerLogTicks &&
    left.cleanupMs === right.cleanupMs;
}

function sameDurable(left, right) {
  return Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(function (key) { return left[key] === right[key]; });
}

function factoryContextKind(context) {
  var keys = Object.keys(context).sort().join(',');
  if (keys === 'clock,env,kho,logger,schedulerOptions,tg') return 'production';
  if (keys === 'clock,env,kho,logger,makeOwnerId,schedulerOptions,tg') return 'production-test';
  if (keys === 'advanceService,clock,logger,reducer,schedulerOptions,store,world,writer') {
    return 'direct';
  }
  throw new Error('SCHEDULER_FACTORY_CONTEXT_INVALID');
}

function sameFrozenDependencies(existing, deps) {
  return existing.kho === deps.kho && existing.world === deps.world &&
    existing.clock === deps.clock && existing.logger === deps.logger &&
    existing.store === deps.store && existing.reducer === deps.reducer &&
    existing.advanceService === deps.advanceService &&
    sameBase(existing.base, deps.base) && sameDurable(existing.durable, deps.durable) &&
    existing.ownerId === deps.ownerId;
}

function schedulerReconciler(context, store, world) {
  if (context.reconciler) return context.reconciler;
  return {reconcile: function (args) {
    return reconcileCanonicalState({
      kho: context.kho,
      store: store,
      world: world,
      clock: context.clock,
      leaseToken: args.leaseToken,
      effectiveNowMs: args.effectiveNowMs,
      writer: args.writer,
      onPageForTest: context.onReconcilePageForTest
    });
  }};
}

function loadSchedulerWriter() {
  if (!SchedulerWriter) SchedulerWriter = require('./writer.js').SchedulerWriter;
  return SchedulerWriter;
}

function signalInstalled(writer, fallback) {
  if (writer.signalHandlerState &&
      typeof writer.signalHandlerState.installed === 'boolean') {
    return writer.signalHandlerState.installed;
  }
  return fallback;
}

function normalizeStatus(raw, dbOpen, signalHandlerInstalled) {
  raw = raw || {};
  var source = Object.assign({}, STATUS_DEFAULTS, raw, {
    dbOpen: dbOpen,
    signalHandlerInstalled: signalHandlerInstalled
  });
  if (!dbOpen) {
    source.ready = false;
    source.reason = 'SCHEDULER_DB_CLOSED';
    source.state = source.state === 'fatal' ? source.state : 'standby';
  }
  var out = {};
  STATUS_KEYS.forEach(function (key) {
    var value = source[key] === undefined ? STATUS_DEFAULTS[key] : source[key];
    out[key] = cloneJson(value);
  });
  return out;
}

function createBridge(writer, options) {
  var dbOpen = true;
  var localSignalInstalled = false;
  var lastStatus = null;
  var stopFinalization = null;
  options = options || {};
  var bridge = {
    start: function () { return writer.start(); },
    stop: function (graceMs) { return writer.stop(graceMs); },
    getStatus: function () {
      if (!dbOpen) {
        return normalizeStatus(lastStatus, false, signalInstalled(writer, localSignalInstalled));
      }
      lastStatus = normalizeStatus(
        writer.status(), true, signalInstalled(writer, localSignalInstalled)
      );
      return normalizeStatus(lastStatus, true, signalInstalled(writer, localSignalInstalled));
    },
    runCommand: function (command) { return writer.runCommand(command); },
    schedule: function (job) { return writer.schedule(job); },
    cancel: function (key, reason) { return writer.cancel(key, reason); },
    reconcile: function () { return writer.reconcile(); },
    advanceTo: function (accountId, targetS) { return writer.advanceTo(accountId, targetS); }
  };
  Object.defineProperty(bridge, '_datSignalHandlerInstalled', {
    value: function (installed) {
      localSignalInstalled = Boolean(installed);
      if (writer.signalHandlerState && Object.prototype.hasOwnProperty.call(
        writer.signalHandlerState, 'installed'
      )) {
        writer.signalHandlerState.installed = localSignalInstalled;
      }
    },
    enumerable: false
  });
  Object.defineProperty(bridge, '_beginStop', {
    value: function (reason, graceMs) {
      if (typeof writer.beginStop === 'function') {
        stopFinalization = writer.beginStop(reason, graceMs);
      } else {
        stopFinalization = writer.stop(graceMs);
      }
      return stopFinalization;
    },
    enumerable: false
  });
  Object.defineProperty(bridge, '_waitForStopFinalization', {
    value: function () {
      return stopFinalization || writer.stopFinalizePromise || Promise.resolve();
    },
    enumerable: false
  });
  Object.defineProperty(bridge, '_datDatabaseClosing', {
    value: function () {
      if (!dbOpen) return;
      var snapshotError = null;
      try { lastStatus = normalizeStatus(writer.status(), true, signalInstalled(writer, localSignalInstalled)); }
      catch (error) { snapshotError = error; }
      dbOpen = false;
      writer.dbOpen = false;
      writer.ready = false;
      writer.reason = 'SCHEDULER_DB_CLOSED';
      if (typeof writer.clearAllTimers === 'function') writer.clearAllTimers();
      else if (typeof writer.clearMutationTimers === 'function') writer.clearMutationTimers();
      if (snapshotError) throw snapshotError;
    },
    enumerable: false
  });
  void options;
  return bridge;
}

function taoScheduler(context) {
  context = context || {};
  var contextKind = factoryContextKind(context);
  var world = context.world || context.tg;
  var base = baseSchedulerOptions(context.schedulerOptions);
  var durable = resolveDurableSchedulerOptions(base, context.env || {});
  var production = contextKind !== 'direct';
  var cacheKey = production ? context.kho : context.writer;
  var cache = production ? bridgeByKho : bridgeByWriter;
  if (!cacheKey || (typeof cacheKey !== 'object' && typeof cacheKey !== 'function')) {
    throw new Error('SCHEDULER_FACTORY_CONTEXT_INVALID');
  }
  if (context.makeOwnerId !== undefined && typeof context.makeOwnerId !== 'function') {
    throw new Error('SCHEDULER_OWNER_SEAM_INVALID');
  }
  var suppliedOwnerId = context.makeOwnerId === undefined ? null :
    assertSchedulerOwnerId(context.makeOwnerId());
  var existing = cache.get(cacheKey);
  var candidateOwnerId = suppliedOwnerId || (existing && existing.ownerId) || null;
  if (existing) {
    if (!sameFrozenDependencies(existing, {
      kho: production ? context.kho : undefined,
      world: world,
      clock: context.clock,
      logger: context.logger,
      store: production ? existing.store : context.store,
      reducer: production ? existing.reducer : context.reducer,
      advanceService: production ? existing.advanceService : context.advanceService,
      base: base,
      durable: durable,
      ownerId: candidateOwnerId
    })) {
      throw new Error('SCHEDULER_FACTORY_DUPLICATE_CONTEXT');
    }
    return existing.bridge;
  }
  var Writer = context.writer ? null : loadSchedulerWriter();
  var store = context.store || (context.writer && context.writer.store) ||
    (world && world._scheduler) || new SchedulerStore(context.kho, context.clock);
  if (world && typeof world.datScheduler === 'function') world.datScheduler(store);
  var advanceService = context.advanceService ||
    (context.writer && context.writer.advanceService) ||
    (world && world._advanceService) || new GameAdvanceService({
      kho: context.kho,
      world: world,
      store: store,
      clock: context.clock
    });
  if (world && typeof world.datAdvanceService === 'function') {
    world.datAdvanceService(advanceService);
  }
  var reducer = context.reducer || (context.writer && context.writer.reducer) ||
    new EventReducer({
      kho: context.kho,
      world: world,
      store: store,
      clock: context.clock,
      advanceService: advanceService
    });
  var ownerId = context.writer ? assertSchedulerOwnerId(context.writer.ownerId) :
    suppliedOwnerId || assertSchedulerOwnerId(crypto.randomUUID());
  var writer = context.writer || new Writer({
    ownerId: ownerId,
    store: store,
    world: world,
    reducer: reducer,
    advanceService: advanceService,
    clock: context.clock,
    logger: context.logger,
    pollMs: durable.schedulerPollMs,
    logTicks: durable.schedulerLogTicks,
    cleanupMs: durable.cleanupMs,
    leaseMs: durable.leaseMs,
    retryBaseMs: durable.retryBaseMs,
    retryMaxMs: durable.retryMaxMs,
    maxAttempts: durable.maxAttempts,
    maxQuarantinedReady: durable.maxQuarantinedReady,
    maxBacklogAgeMs: durable.maxBacklogAgeMs,
    reconcileIntervalMs: durable.reconcileIntervalMs,
    shutdownGraceMs: durable.shutdownGraceMs,
    reconciler: schedulerReconciler(context, store, world)
  });
  var bridge = createBridge(writer);
  cache.set(cacheKey, {
    bridge: bridge,
    writer: writer,
    kho: production ? context.kho : undefined,
    world: world,
    store: store,
    reducer: reducer,
    advanceService: advanceService,
    clock: context.clock,
    logger: context.logger,
    base: base,
    durable: durable,
    ownerId: ownerId
  });
  return bridge;
}

module.exports = {
  taoScheduler: taoScheduler,
  inRange: inRange,
  resolveDurableSchedulerOptions: resolveDurableSchedulerOptions,
  validateProductionDatabasePath: validateProductionDatabasePath
};
