"use strict";

var storeModule = require('./store.js');
var assertSchedulerOwnerId = storeModule.assertSchedulerOwnerId;
var normalizeSchedulerErrorCode = storeModule.normalizeSchedulerErrorCode;
var safeErrorMessage = storeModule.safeErrorMessage;
var toPublicAdvanceResult = require('./advance-service.js').toPublicAdvanceResult;
var canonicalSchedulerStatus = require('./metrics.js').canonicalSchedulerStatus;
var G = require('../rules.js').G;

var DEFAULT_BUDGET = 50000;
var DEFAULT_LEASE_MS = 15000;
var DEFAULT_POLL_MS = 1000;

function fail(code) {
  var error = new Error(code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function noopLogger() {
  return {
    debug: function () {},
    info: function () {},
    warn: function () {},
    error: function () {}
  };
}

function timerApi(timers) {
  return timers || {setTimeout: setTimeout, clearTimeout: clearTimeout};
}

function setTimer(timers, fn, delayMs) {
  return timers.setTimeout(fn, Math.max(0, delayMs));
}

function clearTimer(timers, handle) {
  if (handle !== null && handle !== undefined) timers.clearTimeout(handle);
}

function schedulerError(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}

function isFatalStorageFailure(error) {
  var code = normalizeSchedulerErrorCode(error);
  return code === 'SQLITE_FULL' || code === 'SQLITE_CORRUPT' ||
    code === 'SQLITE_NOTADB';
}

function isInjectedCrash(error) {
  return error && error.code === 'INJECTED_CRASH';
}

function PartialDeferred(outcome) {
  this.name = 'PartialDeferred';
  this.outcome = outcome || {partial: true};
}
PartialDeferred.prototype = Object.create(Error.prototype);
PartialDeferred.prototype.constructor = PartialDeferred;

function isExactNullPartial(prepared, effect, mutation) {
  return isPlainObject(effect) &&
    Object.keys(effect).join(',') === 'checkpointRevision,saveReceipt' &&
    Object.getOwnPropertySymbols(effect).length === 0 &&
    effect.checkpointRevision === null && effect.saveReceipt === null &&
    prepared && prepared.advanceResult &&
    prepared.advanceResult.processed === 0 &&
    prepared.advanceResult.budgetExhausted === true &&
    prepared.advanceResult.hasMoreDue === true &&
    prepared.deferredExternal !== true &&
    mutation.remainingBudget.value === 0;
}

function normalizeMutationContext(mutation) {
  if (!mutation || typeof mutation !== 'object' || !mutation.leaseToken ||
      !mutation.remainingBudget || !Number.isSafeInteger(mutation.effectiveNowMs)) {
    throw new Error('SCHEDULER_MUTATION_INVALID');
  }
  if (!mutation.metricLedger || typeof mutation.metricLedger !== 'object') {
    mutation.metricLedger = {seenAdvance: new WeakSet(), seenJobs: new Set(),
      advances: [], jobs: [], flushed: false};
  }
  if (!(mutation.metricLedger.seenAdvance instanceof WeakSet)) {
    mutation.metricLedger.seenAdvance = new WeakSet();
  }
  if (!(mutation.metricLedger.seenJobs instanceof Set)) {
    mutation.metricLedger.seenJobs = new Set();
  }
  if (!Array.isArray(mutation.metricLedger.advances)) {
    mutation.metricLedger.advances = [];
  }
  if (!Array.isArray(mutation.metricLedger.jobs)) {
    mutation.metricLedger.jobs = [];
  }
  if (typeof mutation.recordAdvance !== 'function') {
    mutation.recordAdvance = function (outcome) {
      if (!outcome || typeof outcome !== 'object') return;
      var processed = Number(outcome.processed || 0);
      if (!Number.isSafeInteger(processed) || processed < 0 ||
          typeof outcome.budgetExhausted !== 'boolean') {
        throw new Error('SCHEDULER_ADVANCE_METRIC_INVALID');
      }
      if (mutation.metricLedger.seenAdvance.has(outcome)) return;
      mutation.metricLedger.seenAdvance.add(outcome);
      mutation.metricLedger.advances.push({processed: processed,
        budgetExhausted: outcome.budgetExhausted === true});
    };
  }
  if (typeof mutation.recordJob !== 'function') {
    mutation.recordJob = function (job, outcome, startedAtMs) {
      if (!job || typeof job.id !== 'string' || typeof job.kind !== 'string' ||
          ['success', 'partial', 'error'].indexOf(outcome) < 0 ||
          !Number.isSafeInteger(startedAtMs) ||
          mutation.metricLedger.seenJobs.has(job.id)) {
        throw new Error('JOB_METRIC_DUPLICATE');
      }
      mutation.metricLedger.seenJobs.add(job.id);
      mutation.metricLedger.jobs.push({job: {id: job.id, kind: job.kind},
        outcome: outcome, startedAtMs: startedAtMs});
    };
  }
  return mutation;
}

function statusState(ready, reason) {
  if (ready) return 'ready';
  if (reason === 'SCHEDULER_MODE_LEGACY') return 'legacy';
  if (reason === 'SCHEDULER_STORAGE_FATAL') return 'fatal';
  if (reason === 'SCHEDULER_CRASHED') return 'crashed';
  return 'standby';
}

function SchedulerWriter(options) {
  options = options || {};
  assertSchedulerOwnerId(options.ownerId);
  if (!options.store || !options.world || !options.reducer || !options.advanceService ||
      !options.clock || typeof options.clock.nowMs !== 'function') {
    throw new Error('SCHEDULER_WRITER_CONTEXT_INVALID');
  }
  this.ownerId = options.ownerId;
  this.store = options.store;
  this.world = options.world;
  this.reducer = options.reducer;
  this.advanceService = options.advanceService;
  this.clock = options.clock;
  this.logger = options.logger || noopLogger();
  this.timers = timerApi(options.timers);
  this.immediate = options.immediate || null;
  this.pollMs = options.pollMs || DEFAULT_POLL_MS;
  this.leaseMs = options.leaseMs || DEFAULT_LEASE_MS;
  this.retryBaseMs = options.retryBaseMs || 1000;
  this.retryMaxMs = options.retryMaxMs || 300000;
  this.maxAttempts = options.maxAttempts || 8;
  this.durableOptions = {
    maxQuarantinedReady: Number.isSafeInteger(options.maxQuarantinedReady) ?
      options.maxQuarantinedReady : 0,
    maxBacklogAgeMs: Number.isSafeInteger(options.maxBacklogAgeMs) ?
      options.maxBacklogAgeMs : 60000,
    shutdownGraceMs: Number.isSafeInteger(options.shutdownGraceMs) ?
      options.shutdownGraceMs : 10000
  };
  this.reconcileIntervalMs = options.reconcileIntervalMs || 300000;
  this.onReconcileForTest = options.onReconcileForTest || null;
  this.manualDrain = options.manualDrain === true;
  this.logTicks = options.logTicks === true;
  this.ready = false;
  this.reason = null;
  this.state = 'standby';
  this.recoveryComplete = false;
  this.leaseToken = null;
  this.startPromise = null;
  this.stopRequested = false;
  this.stopPromise = null;
  this.stopFinalizePromise = null;
  this.stopCapturedTail = null;
  this.tail = Promise.resolve();
  this.draining = false;
  this.crashed = false;
  this.storageFatal = false;
  this.signalHandlerInstalled = false;
  this.dbOpen = true;
  this.cachedClosedStatus = null;
  this.lastSafeStatusAggregate = null;
  this.activeAdmissionCapability = null;
  this.wakeTimer = null;
  this.pollTimer = null;
  this.heartbeatTimer = null;
  this.reconcileTimer = null;
  this.continuationTimer = null;
  this.continuationHandle = null;
  this.partialQueue = [];
  this.partialIds = new Set();
  this.heartbeatDelayMs = Math.max(1, Math.floor(this.leaseMs / 3) - 1);
  this.faultHook = null;
  this.phaseRecheckHook = options.phaseRecheckHook || null;
  if (this.phaseRecheckHook !== null && typeof this.phaseRecheckHook !== 'function') {
    throw new Error('PHASE_RECHECK_HOOK_INVALID');
  }
  this.reconciler = options.reconciler || null;
  this.metrics = {
    advanceProcessed: 0,
    advanceBudgetExhaustedTotal: 0,
    jobAttempts: {},
    jobDuration: {},
    leaseAcquire: {acquired: 0, unavailable: 0, error: 0},
    reconcile: {success: 0, error: 0},
    lastSuccessfulDrainTimestampMs: 0
  };
  this.lastEffectiveNowMs = 0;
  if (typeof this.world.datScheduler === 'function') this.world.datScheduler(this.store);
  if (typeof this.world.datAdvanceService === 'function') this.world.datAdvanceService(this.advanceService);
}

SchedulerWriter.prototype.retryPolicy = function () {
  return {retryBaseMs: this.retryBaseMs, retryMaxMs: this.retryMaxMs,
    maxAttempts: this.maxAttempts};
};

SchedulerWriter.prototype.setFaultHook = function (fn) {
  if (fn !== null && fn !== undefined && typeof fn !== 'function') {
    throw new Error('SCHEDULER_FAULT_HOOK_INVALID');
  }
  this.faultHook = fn || null;
};

SchedulerWriter.prototype.callFaultHook = function (stage, job) {
  if (this.faultHook) this.faultHook(stage, job);
};

SchedulerWriter.prototype.setPhaseRecheckHook = function (fn) {
  if (fn !== null && fn !== undefined && typeof fn !== 'function') {
    throw new Error('PHASE_RECHECK_HOOK_INVALID');
  }
  this.phaseRecheckHook = fn || null;
};

SchedulerWriter.prototype.newMutationContext = function (leaseToken, budget, effectiveNowMs) {
  var remaining = isPlainObject(budget) ? budget : {value: budget === undefined ? DEFAULT_BUDGET : budget};
  if (!nonnegativeInteger(remaining.value) || remaining.value > DEFAULT_BUDGET ||
      !nonnegativeInteger(effectiveNowMs)) {
    throw new Error('SCHEDULER_MUTATION_INVALID');
  }
  var ledger = {seenAdvance: new WeakSet(), seenJobs: new Set(),
    advances: [], jobs: [], flushed: false};
  var mutation = {
    leaseToken: leaseToken,
    remainingBudget: remaining,
    effectiveNowMs: effectiveNowMs,
    metricLedger: ledger
  };
  mutation.recordAdvance = function (outcome) {
    if (!outcome || typeof outcome !== 'object') return;
    var processed = Number(outcome.processed || 0);
    if (!Number.isSafeInteger(processed) || processed < 0 ||
        typeof outcome.budgetExhausted !== 'boolean') {
      throw new Error('SCHEDULER_ADVANCE_METRIC_INVALID');
    }
    if (ledger.seenAdvance.has(outcome)) return;
    ledger.seenAdvance.add(outcome);
    ledger.advances.push({processed: processed,
      budgetExhausted: outcome.budgetExhausted === true});
  };
  mutation.recordJob = function (job, outcome, startedAtMs) {
    if (!job || typeof job.id !== 'string' || typeof job.kind !== 'string' ||
        ['success', 'partial', 'error'].indexOf(outcome) < 0 ||
        !Number.isSafeInteger(startedAtMs) || ledger.seenJobs.has(job.id)) {
      throw new Error('JOB_METRIC_DUPLICATE');
    }
    ledger.seenJobs.add(job.id);
    ledger.jobs.push({job: {id: job.id, kind: job.kind},
      outcome: outcome, startedAtMs: startedAtMs});
  };
  return mutation;
};

SchedulerWriter.prototype.flushCommittedMetricLedger = function (ledger) {
  if (!ledger || typeof ledger !== 'object') return;
  if (ledger.flushed) return;
  ledger.flushed = true;
  var summary = {count: 0, budgetExhausted: false};
  (ledger.advances || []).forEach(function (outcome) {
    var processed = Number(outcome.processed || 0);
    if (Number.isSafeInteger(processed) && processed > 0) {
      this.metrics.advanceProcessed += processed;
      summary.count += processed;
    }
    if (outcome.budgetExhausted === true) {
      this.metrics.advanceBudgetExhaustedTotal += 1;
      summary.budgetExhausted = true;
    }
  }, this);
  (ledger.jobs || []).forEach(function (entry) {
    var key = entry.job.kind + '|' + entry.outcome;
    this.metrics.jobAttempts[key] = (this.metrics.jobAttempts[key] || 0) + 1;
    var duration = this.metrics.jobDuration[key] ||
      {count: 0, sum: 0, buckets: [0, 0, 0, 0, 0]};
    var durationMs = Math.max(0, this.effectiveNowMs() - entry.startedAtMs);
    duration.count += 1;
    duration.sum += durationMs;
    [10, 100, 1000, 10000, Infinity].forEach(function (limit, index) {
      if (durationMs <= limit) duration.buckets[index] += 1;
    });
    this.metrics.jobDuration[key] = duration;
  }, this);
  if (this.logTicks && (summary.count > 0 || summary.budgetExhausted)) {
    this.log('info', 'scheduler.tick', {
      count: summary.count,
      budgetExhausted: summary.budgetExhausted
    });
  }
};

SchedulerWriter.prototype.computeOpenStatusFromStore = function () {
  var nowMs = this.effectiveNowMs();
  var mode = this.store.schedulerMode();
  var snapshot = this.store.statusSnapshot(nowMs);
  var watermarkS = this.store.globalWatermarkS();
  var leaseHeld = this.leaseToken ? this.store.leaseTokenIsLive(this.leaseToken, nowMs) : false;
  this.lastSafeStatusAggregate = Object.assign({}, snapshot, {
    mode: mode,
    watermarkS: watermarkS
  });
  if (this.leaseToken && !leaseHeld && this.ready) this.transitionLeaseLost();
  return {
    state: this.state || statusState(this.ready && leaseHeld, this.reason),
    ready: this.ready === true && leaseHeld === true,
    reason: this.ready && leaseHeld ? null : this.reason,
    mode: mode,
    dbOpen: this.dbOpen,
    writerLeaseHeld: leaseHeld,
    leaseHeld: leaseHeld,
    wakeTimerActive: this.wakeTimer !== null,
    pollTimerActive: this.pollTimer !== null,
    heartbeatTimerActive: this.heartbeatTimer !== null,
    reconcileTimerActive: this.reconcileTimer !== null,
    continuationActive: this.continuationTimer !== null,
    signalHandlerInstalled: this.signalHandlerInstalled,
    recoveryComplete: this.recoveryComplete,
    draining: this.draining,
    watermarkS: watermarkS,
    pending: snapshot.pending,
    retryWait: snapshot.retryWait,
    running: snapshot.running,
    quarantined: snapshot.quarantined,
    dueBacklog: snapshot.dueBacklog,
    oldestDueAgeMs: snapshot.oldestDueAgeMs,
    nextEligibleAtMs: snapshot.nextEligibleAtMs,
    counts: {
      pending: snapshot.pending,
      retryWait: snapshot.retryWait,
      running: snapshot.running,
      quarantined: snapshot.quarantined,
      dueBacklog: snapshot.dueBacklog
    },
    ages: {oldestDueAgeMs: snapshot.oldestDueAgeMs, nextEligibleAtMs: snapshot.nextEligibleAtMs},
    metrics: clone(this.metrics)
  };
};

SchedulerWriter.prototype.status = function () {
  if (!this.dbOpen && this.cachedClosedStatus) return clone(this.cachedClosedStatus);
  try {
    return clone(canonicalSchedulerStatus(this.computeOpenStatusFromStore(), this.durableOptions));
  } catch (error) {
    if (!isFatalStorageFailure(error)) throw error;
    this.transitionStorageFatal(error);
    var aggregate = Object.assign({
      pending: 0,
      retryWait: 0,
      running: 0,
      quarantined: 0,
      dueBacklog: 0,
      oldestDueAgeMs: 0,
      nextEligibleAtMs: null,
      mode: 'durable',
      watermarkS: null
    }, this.lastSafeStatusAggregate || {});
    return clone(canonicalSchedulerStatus({
      state: 'fatal',
      ready: false,
      reason: 'SCHEDULER_STORAGE_FATAL',
      mode: aggregate.mode || 'durable',
      dbOpen: this.dbOpen,
      writerLeaseHeld: false,
      leaseHeld: false,
      recoveryComplete: this.recoveryComplete,
      draining: this.draining,
      watermarkS: aggregate.watermarkS === undefined ? null : aggregate.watermarkS,
      wakeTimerActive: this.wakeTimer !== null,
      pollTimerActive: this.pollTimer !== null,
      heartbeatTimerActive: this.heartbeatTimer !== null,
      reconcileTimerActive: this.reconcileTimer !== null,
      continuationActive: this.continuationTimer !== null,
      signalHandlerInstalled: this.signalHandlerInstalled,
      counts: {
        pending: aggregate.pending,
        retryWait: aggregate.retryWait,
        running: aggregate.running,
        quarantined: aggregate.quarantined,
        dueBacklog: aggregate.dueBacklog
      },
      ages: {oldestDueAgeMs: aggregate.oldestDueAgeMs, nextEligibleAtMs: aggregate.nextEligibleAtMs},
      metrics: clone(this.metrics)
    }, this.durableOptions));
  }
};

SchedulerWriter.prototype.clearMutationTimers = function () {
  clearTimer(this.timers, this.wakeTimer);
  clearTimer(this.timers, this.heartbeatTimer);
  clearTimer(this.timers, this.reconcileTimer);
  clearTimer(this.timers, this.pollTimer);
  this.wakeTimer = null;
  this.heartbeatTimer = null;
  this.reconcileTimer = null;
  this.pollTimer = null;
};

SchedulerWriter.prototype.clearAllTimers = function () {
  this.clearMutationTimers();
  if (this.immediate && typeof this.immediate.clear === 'function') {
    this.immediate.clear(this.continuationTimer);
  } else {
    clearTimer(this.timers, this.continuationTimer);
  }
  this.continuationTimer = null;
  this.continuationHandle = null;
};

SchedulerWriter.prototype.refreshLeasePhaseInCurrentUow = function (phase, token, nowMs) {
  var effective = Math.max(Number(nowMs || 0), this.effectiveNowMs());
  if (phase === 'startup-final') {
    if (this.phaseRecheckHook) this.phaseRecheckHook(phase, token, effective);
    this.store.assertLiveLease(token, effective);
    this.lastEffectiveNowMs = effective;
    return effective;
  }
  effective = this.recordEffectiveNowInCurrentUow(token, effective);
  if (!this.store.renewLease(token, effective, this.leaseMs)) {
    throw schedulerError('LEASE_LOST');
  }
  if (this.phaseRecheckHook) this.phaseRecheckHook(phase, token, effective);
  effective = Math.max(effective, this.effectiveNowMs());
  effective = this.recordEffectiveNowInCurrentUow(token, effective);
  if (!this.store.renewLease(token, effective, this.leaseMs)) {
    throw schedulerError('LEASE_LOST');
  }
  this.lastEffectiveNowMs = effective;
  return effective;
};

SchedulerWriter.prototype.effectiveNowMs = function () {
  return Math.max(Number(this.lastEffectiveNowMs || 0), Number(this.clock.nowMs()));
};

SchedulerWriter.prototype.recordEffectiveNowInCurrentUow = function (token, nowMs) {
  var effective = this.store.recordEffectiveNowMs(token, nowMs);
  this.lastEffectiveNowMs = effective;
  return effective;
};

SchedulerWriter.prototype.markDurableMutationInCurrentUow = function (mutation, nowMs) {
  if (!mutation.__task6DurableMarked) {
    this.store.markDurableMutation(mutation.leaseToken, nowMs);
    Object.defineProperty(mutation, '__task6DurableMarked', {value: true});
  }
};

SchedulerWriter.prototype.requireReadyLease = function (nowMs) {
  if (this.hasCapturedAdmissionCapability()) {
    this.store.assertLiveLease(this.leaseToken, nowMs);
    return this.leaseToken;
  }
  if (this.reason === 'SCHEDULER_MODE_LEGACY' || this.state === 'legacy') {
    throw schedulerError('SCHEDULER_MODE_LEGACY');
  }
  if (this.reason === 'SCHEDULER_STORAGE_FATAL' || this.state === 'fatal') {
    throw schedulerError('SCHEDULER_STORAGE_FATAL');
  }
  if (this.reason === 'SCHEDULER_CRASHED' || this.state === 'crashed') {
    throw schedulerError('SCHEDULER_CRASHED');
  }
  if (this.reason === 'SCHEDULER_LEASE_LOST') {
    throw schedulerError('SCHEDULER_LEASE_LOST');
  }
  if (this.state !== 'ready' || !this.leaseToken) {
    throw schedulerError('SCHEDULER_NOT_READY');
  }
  try {
    this.store.assertLiveLease(this.leaseToken, nowMs);
    return this.leaseToken;
  } catch (error) {
    if (error && error.code === 'LEASE_LOST') this.transitionLeaseLost();
    throw error;
  }
};

SchedulerWriter.prototype.transitionLeaseLost = function () {
  this.ready = false;
  this.reason = 'SCHEDULER_LEASE_LOST';
  this.state = 'standby';
  this.leaseToken = null;
  this.clearMutationTimers();
  if (this.immediate && typeof this.immediate.clear === 'function') {
    this.immediate.clear(this.continuationTimer);
  } else {
    clearTimer(this.timers, this.continuationTimer);
  }
  this.continuationTimer = null;
  this.continuationHandle = null;
  this.armStandbyPoll();
};

SchedulerWriter.prototype.handleLeaseLoss = function (error) {
  this.transitionLeaseLost();
  return schedulerError((error && error.code) || 'LEASE_LOST');
};

SchedulerWriter.prototype.handlePublicFailure = function (error) {
  if (isFatalStorageFailure(error)) this.transitionStorageFatal(error);
  else if (error && error.code === 'LEASE_LOST') this.handleLeaseLoss(error);
  return error;
};

SchedulerWriter.prototype.handleDrainError = function (error) {
  if (isFatalStorageFailure(error)) {
    this.transitionStorageFatal(error);
    return;
  }
  if (error && error.code === 'LEASE_LOST') {
    this.handleLeaseLoss(error);
    return;
  }
  try {
    this.logger.error(this.store.scrubLogEntry({
      event: 'scheduler.continuation_failed',
      at: this.effectiveNowMs(),
      code: safeErrorMessage(normalizeSchedulerErrorCode(error) ||
        (error && error.code) || 'SCHEDULER_ERROR')
    }));
  } catch (logError) { void logError; }
};

SchedulerWriter.prototype.log = function (level, event, fields) {
  try {
    this.logger[level](this.store.scrubLogEntry(Object.assign({
      event: event,
      at: this.effectiveNowMs()
    }, fields || {})));
  } catch (logError) { void logError; }
};

SchedulerWriter.prototype.start = function () {
  if (this.crashed) return Promise.reject(schedulerError('SCHEDULER_CRASHED'));
  if (this.storageFatal) return Promise.reject(schedulerError('SCHEDULER_STORAGE_FATAL'));
  if (this.stopRequested || this.state === 'stopped') {
    return Promise.reject(schedulerError('SCHEDULER_STOPPED'));
  }
  if (this.startPromise) return this.startPromise;
  var self = this;
  this.startPromise = Promise.resolve().then(function () {
    return self.startFresh();
  }).catch(function (error) {
    self.metrics.leaseAcquire.error += 1;
    self.handlePublicFailure(error);
    var code = normalizeSchedulerErrorCode(error) || error && error.code;
    if (code) throw schedulerError(code);
    throw error;
  }).finally(function () {
    self.startPromise = null;
  });
  return this.startPromise;
};

SchedulerWriter.prototype.startFresh = function () {
  if (this.store.schedulerMode() !== 'durable') {
    this.ready = false;
    this.reason = 'SCHEDULER_MODE_LEGACY';
    this.state = 'legacy';
    this.recoveryComplete = false;
    return;
  }
  var entryNow = this.clock.nowMs();
  var token = this.store.acquireLease(this.ownerId, entryNow, this.leaseMs);
  if (!token) {
    this.ready = false;
    this.reason = 'SCHEDULER_LEASE_UNHELD';
    this.state = 'standby';
    this.metrics.leaseAcquire.unavailable += 1;
    if (!this.manualDrain) this.armStandbyPoll();
    return;
  }
  this.state = 'recovering';
  this.ready = false;
  var self = this;
  var recoveryNowMs = entryNow;
  this.store.kho.trongGiaoDich(function () {
    if (self.reducer && typeof self.reducer.initializeCombatSeed === 'function') {
      self.reducer.initializeCombatSeed(token, entryNow);
    }
    var expired = self.store.listExpiredRunningForRecovery(token, entryNow);
    var owned = self.store.listOwnedRunningForRecovery(token, entryNow);
    if (expired.length) self.store.markDurableMutation(token, entryNow);
    self.store.recoverExpiredRunning(token, entryNow, self.retryPolicy());
    if (typeof self.store.assertAccountDependencyIntegrity === 'function') {
      self.store.assertAccountDependencyIntegrity(token, self.clock.nowMs());
    }
    var freshNow = self.clock.nowMs();
    if (!self.store.renewLease(token, freshNow, self.leaseMs)) fail('LEASE_LOST');
    owned.forEach(function (row) {
      self.store.resumeOwnedRunning(token, row.id, freshNow, self.leaseMs);
    });
    self.refreshLeasePhaseInCurrentUow('startup-final', token, freshNow);
    recoveryNowMs = freshNow;
  }, {immediate: true});
  this.leaseToken = token;
  this.metrics.leaseAcquire.acquired += 1;
  function becomeReady() {
    if (self.stopRequested) throw schedulerError('SCHEDULER_STOPPED');
    if (self.onReconcileForTest) self.onReconcileForTest();
    self.ready = true;
    self.reason = null;
    self.state = 'ready';
    self.recoveryComplete = true;
    if (!self.manualDrain) {
      self.armHeartbeat();
      self.armWakeTimer();
      self.scheduleReconcileTimer();
    }
  }
  function unwindReconcileFailure(error) {
    self.metrics.reconcile.error += 1;
    self.handlePublicFailure(error);
    try {
      var releaseNowMs = self.effectiveNowMs();
      if (self.leaseToken && self.dbOpen &&
          self.store.leaseTokenIsLive(self.leaseToken, releaseNowMs)) {
        self.store.kho.trongGiaoDich(function () {
          self.store.releaseLease(self.leaseToken, releaseNowMs);
        }, {immediate: true});
      }
    } catch (releaseError) { void releaseError; }
    self.leaseToken = null;
    self.ready = false;
    self.recoveryComplete = false;
    if (!self.storageFatal && !self.crashed && !self.stopRequested) {
      self.state = 'standby';
      self.reason = 'SCHEDULER_STARTUP_FAILED';
      if (!self.manualDrain) self.armStandbyPoll();
    }
    throw error;
  }
  if (this.reconciler && typeof this.reconciler.reconcile === 'function') {
    return this.reconcileOwned(token, recoveryNowMs, true).then(function (result) {
      self.metrics.reconcile.success += 1;
      becomeReady();
      return result;
    }).catch(unwindReconcileFailure);
  }
  becomeReady();
};

SchedulerWriter.prototype.beginStop = function () {
  if (this.stopRequested || this.state === 'stopped') {
    return this.stopCapturedTail || this.tail;
  }
  this.stopRequested = true;
  this.ready = false;
  this.reason = 'SCHEDULER_DRAINING';
  this.state = 'stopping';
  this.draining = true;
  this.clearAllTimers();
  this.stopCapturedTail = this.tail;
  return this.stopCapturedTail;
};

SchedulerWriter.prototype.stop = function (graceMs) {
  var self = this;
  var effectiveGraceMs = graceMs === undefined || graceMs === null ?
    this.durableOptions.shutdownGraceMs : Number(graceMs);
  if (!Number.isSafeInteger(effectiveGraceMs) || effectiveGraceMs < 1 || effectiveGraceMs > 60000) {
    return Promise.reject(schedulerError('SCHEDULER_STOP_GRACE_INVALID'));
  }
  if (this.stopPromise || this.state === 'stopped') {
    return this.stopPromise || this.stopFinalizePromise || Promise.resolve();
  }
  var capturedTail = this.beginStop();
  this.stopFinalizePromise = Promise.resolve(capturedTail).then(function () {
    self.clearAllTimers();
    var token = self.leaseToken;
    if (token && self.dbOpen) {
      var nowMs = self.effectiveNowMs();
      if (self.store.leaseTokenIsLive(token, nowMs)) {
        self.store.kho.trongGiaoDich(function () {
          nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
          self.store.releaseLease(token, nowMs);
        }, {immediate: true});
      }
    }
    self.leaseToken = null;
  }).then(function () {
    self.draining = false;
    self.ready = false;
    self.reason = 'SCHEDULER_STOPPED';
    self.state = 'stopped';
  }).catch(function (error) {
    self.clearAllTimers();
    self.ready = false;
    self.draining = false;
    self.state = 'stopped';
    self.reason = 'SCHEDULER_STOPPED';
    throw error;
  });
  this.stopPromise = new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimer(self.timers, function () {
      if (settled) return;
      settled = true;
      self.reason = 'SCHEDULER_STOP_GRACE_EXPIRED';
      self.state = 'stopping';
      self.draining = true;
      reject(schedulerError('SCHEDULER_STOP_GRACE_EXPIRED'));
    }, effectiveGraceMs);
    Promise.resolve(capturedTail).then(function () {
      if (settled) return;
      settled = true;
      clearTimer(self.timers, timer);
      resolve();
    }, function (error) {
      if (settled) return;
      settled = true;
      clearTimer(self.timers, timer);
      reject(error);
    });
  }).then(function () {
    return self.stopFinalizePromise;
  });
  return this.stopPromise;
};

SchedulerWriter.prototype.ensureReady = function () {
  if (this.stopRequested || this.state === 'stopped') {
    throw schedulerError('SCHEDULER_STOPPED');
  }
  this.assertOperationalAdmission();
};

SchedulerWriter.prototype.hasCapturedAdmissionCapability = function () {
  var capability = this.activeAdmissionCapability;
  if (!capability || !this.dbOpen || this.storageFatal || this.crashed) return false;
  return Boolean(this.stopRequested && this.state === 'stopping' &&
    ['SCHEDULER_DRAINING', 'SCHEDULER_STOP_GRACE_EXPIRED'].indexOf(this.reason) >= 0 &&
    capability.leaseToken && this.leaseToken &&
    capability.leaseToken.ownerId === this.leaseToken.ownerId &&
    Number(capability.leaseToken.generation) === Number(this.leaseToken.generation));
};

SchedulerWriter.prototype.assertOperationalAdmission = function () {
  var captured = this.hasCapturedAdmissionCapability();
  var status = this.status();
  if (captured && this.hasCapturedAdmissionCapability()) {
    this.store.assertLiveLease(this.leaseToken, this.effectiveNowMs());
    return canonicalSchedulerStatus(Object.assign({}, status, {
      state: 'ready', ready: true, reason: null, draining: false
    }), this.durableOptions);
  }
  if (!status.ready) throw schedulerError(status.reason || 'SCHEDULER_NOT_READY');
  return status;
};

SchedulerWriter.prototype.enqueue = function (fn, admitted) {
  var self = this;
  var capability = admitted === true && this.leaseToken ?
    {leaseToken: this.leaseToken} : null;
  function run() {
    var previous = self.activeAdmissionCapability;
    self.activeAdmissionCapability = capability;
    return Promise.resolve().then(fn).finally(function () {
      self.activeAdmissionCapability = previous;
    });
  }
  var next = this.tail.then(run, run);
  this.tail = next.catch(function () {});
  return next.catch(function (error) {
    if (isFatalStorageFailure(error)) self.transitionStorageFatal(error);
    throw error;
  });
};

SchedulerWriter.prototype.withWriterMutationDefaults = function (mutation, fn) {
  var world = this.world;
  var writer = this;
  var realLuu = world.luu;
  var realTick = world.tick;
  var realGuiThu = world.guiThu;
  var realTuyenChien = world.tuyenChien;
  var realChuyenGalana = world.chuyenGalana;
  function preflight(accountId, targetS) {
    accountId = Number(accountId);
    if (Number.isSafeInteger(mutation.commandAccountId) &&
        accountId === mutation.commandAccountId) return;
    var outcome = writer.advanceAccountInCurrentUow(
      mutation, accountId, targetS, mutation.effectiveNowMs,
      {deferAccountFinalize: true}
    );
    if (outcome && outcome.partial) throw new PartialDeferred(outcome);
  }
  world.luu = function (tk, st, options) {
    options = Object.assign({}, options || {});
    if (!options.mutation) options.mutation = mutation;
    return realLuu.call(this, tk, st, options);
  };
  world.tick = function (tk, now, dl) {
    var targetS = now || Math.floor(mutation.effectiveNowMs / 1000);
    preflight(Number(tk), targetS);
    var loaded = world.nap(Number(tk));
    if (!loaded) return null;
    if (dl && dl.truoc) dl.truoc(loaded.st);
    if (dl && dl.sau) {
      dl.ketQua = dl.sau(loaded.st);
      world.luu(Number(tk), loaded.st, {mutation: mutation});
    }
    return loaded.st;
  };
  world.guiThu = function (tkGui, tenGui, denAi, noi) {
    var nhan = null;
    if (/^\d+$/.test(String(denAi))) nhan = world.kho.q.tkTheoId.get(Math.floor(+denAi));
    if (!nhan) nhan = world.kho.q.tkTheoHienThi.get(String(denAi || '').trim());
    if (nhan) preflight(Number(nhan.id), Math.floor(mutation.effectiveNowMs / 1000));
    return realGuiThu.call(world, tkGui, tenGui, denAi, noi);
  };
  world.tuyenChien = function (tkA, tkD) {
    preflight(Number(tkD), Math.floor(mutation.effectiveNowMs / 1000));
    return realTuyenChien.call(world, tkA, tkD);
  };
  world.chuyenGalana = function (tkA, tkD, so) {
    var targetS = Math.floor(mutation.effectiveNowMs / 1000);
    preflight(Number(tkA), targetS);
    preflight(Number(tkD), targetS);
    return realChuyenGalana.call(world, tkA, tkD, so);
  };
  try { return fn(); }
  finally {
    world.luu = realLuu;
    world.tick = realTick;
    world.guiThu = realGuiThu;
    world.tuyenChien = realTuyenChien;
    world.chuyenGalana = realChuyenGalana;
  }
};

SchedulerWriter.prototype.executeClaimedInCurrentUow = function (mutation, claimed, nowMs, options) {
  mutation = normalizeMutationContext(mutation);
  options = options || {};
  var executable = this.store.loadExecutableJob(mutation.leaseToken, claimed, nowMs);
  this.store.markDurableMutation(mutation.leaseToken, nowMs);
  var barrierAdvance = null;
  var alreadyApplied = false;
  var chargedApplication = false;
  if (executable.kind !== 'ACCOUNT_ADVANCE') {
    barrierAdvance = this.advanceService.advanceBarrier(mutation, executable);
    mutation.recordAdvance(barrierAdvance);
    if (barrierAdvance.blockedExternalJobId || barrierAdvance.precedingJobId) {
      mutation.recordJob(executable.kind, 'partial');
      return {partial: true, reordered: true, jobId: executable.id,
        metricLedger: mutation.metricLedger, advanceResult: barrierAdvance};
    }
    if (barrierAdvance.budgetExhausted) {
      mutation.recordJob(executable.kind, 'partial');
      return {partial: true, budgetExhausted: true, jobId: executable.id,
        metricLedger: mutation.metricLedger, advanceResult: barrierAdvance};
    }
    alreadyApplied = this.store.hasCommittedApplication(mutation.leaseToken, executable, nowMs);
    if (!alreadyApplied) {
      if (mutation.remainingBudget.value === 0) {
        mutation.recordJob(executable.kind, 'partial');
        return {partial: true, budgetExhausted: true, jobId: executable.id,
          metricLedger: mutation.metricLedger, advanceResult: barrierAdvance};
      }
      mutation.remainingBudget.value -= 1;
      chargedApplication = true;
    }
  }
  var prepared = this.reducer.prepare(mutation, executable, options);
  if (prepared.kind === 'partial') {
    var partialEffect = this.reducer.applyPrepared(mutation, prepared);
    if (isExactNullPartial(prepared, partialEffect, mutation)) {
      return {partial: true, jobId: executable.id, metricLedger: mutation.metricLedger,
        advanceResult: prepared.advanceResult};
    }
    if (prepared.advanceResult) mutation.recordAdvance(prepared.advanceResult);
    var checkpoint = partialEffect && partialEffect.checkpointRevision;
    var blockedBy = prepared.advanceResult && prepared.advanceResult.blockedExternalJobId;
    if (Number.isSafeInteger(checkpoint)) {
      if (blockedBy) {
        this.store.blockOwnedAccountAdvance(
          mutation.leaseToken, executable, checkpoint, blockedBy, nowMs
        );
      } else {
        this.store.checkpointPartial(mutation.leaseToken, executable, checkpoint, nowMs);
      }
    }
    mutation.recordJob(executable.kind, 'partial');
    return {partial: true, jobId: executable.id, metricLedger: mutation.metricLedger,
      advanceResult: prepared.advanceResult};
  }
  var application = this.store.insertApplication(
    mutation.leaseToken,
    executable,
    prepared.application,
    nowMs,
    prepared.canonicalTContext || null
  );
  this.callFaultHook('after-application-insert', executable);
  var effect = prepared.mutation || {nextLocalAtS: null};
  if (!application.alreadyApplied) {
    effect = this.reducer.applyPrepared(mutation, prepared) || effect;
    this.callFaultHook('after-game-mutation', executable);
  }
  if (prepared.advanceResult) mutation.recordAdvance(prepared.advanceResult);
  if (chargedApplication) mutation.recordAdvance({
    processed: 1,
    budgetExhausted: mutation.remainingBudget.value === 0
  });
  if (prepared.terminalState === 'CANCELLED') {
    this.store.finishResolved(
      mutation.leaseToken, executable, 'CANCELLED', prepared.cancelReason, nowMs
    );
    mutation.recordJob(executable.kind, 'cancelled');
  } else if (executable.kind === 'ACCOUNT_ADVANCE') {
    this.store.completeAccountAdvanceAndScheduleSuccessor(
      mutation.leaseToken,
      executable,
      effect && Number.isSafeInteger(effect.nextLocalAtS) ? effect.nextLocalAtS : prepared.nextLocalAtS,
      nowMs
    );
    mutation.recordJob(executable.kind, 'success');
  } else {
    this.store.completeApplied(mutation.leaseToken, executable, nowMs);
    mutation.recordJob(executable.kind, 'success');
  }
  return {partial: false, jobId: executable.id, executable: executable,
    metricLedger: mutation.metricLedger, advanceResult: prepared.advanceResult || barrierAdvance};
};

SchedulerWriter.prototype.applyClaimed = function (claimed, budget, nowMs, options) {
  var self = this;
  return this.store.kho.trongGiaoDich(function () {
    var mutation = self.newMutationContext(self.leaseToken, budget, nowMs);
    return self.world.trongMutationScheduler(mutation, function () {
      return self.executeClaimedInCurrentUow(mutation, claimed, nowMs, options || {});
    });
  }, {immediate: true});
};

SchedulerWriter.prototype.settleClaimFailure = function (claimed, error, nowMs) {
  if (isInjectedCrash(error)) throw error;
  var self = this;
  var settled = this.store.kho.trongGiaoDich(function () {
    if (error && error.code === 'PAYLOAD_INTEGRITY') {
      return self.store.quarantineClaimedRaw(self.leaseToken, claimed, error, nowMs);
    }
    var row = self.store.getById(claimed.id);
    if (!row || row.state !== 'RUNNING') return row;
    var transition;
    try {
      transition = self.store.fail(self.leaseToken, row, error, nowMs, self.retryPolicy());
    } catch (loadError) {
      if (loadError && loadError.code === 'PAYLOAD_INTEGRITY') {
        return self.store.quarantineClaimedRaw(self.leaseToken, row, loadError, nowMs);
      }
      throw loadError;
    }
    return self.store.getById(row.id) || {state: transition};
  }, {immediate: true});
  if (settled && settled.state === 'QUARANTINED') this.logQuarantine(error);
  return settled;
};

SchedulerWriter.prototype.logQuarantine = function (error) {
  try {
    this.logger.warn({
      event: 'scheduler.job_quarantined',
      at: this.clock.nowMs(),
      code: safeErrorMessage(normalizeSchedulerErrorCode(error) ||
        (error && error.code) || 'SCHEDULER_JOB_FAILED')
    });
  } catch (logError) { void logError; }
};

SchedulerWriter.prototype.claimFirstGlobal = function (targetS) {
  var self = this, nowMs = this.clock.nowMs();
  return this.store.kho.trongGiaoDich(function () {
    self.store.assertLiveLease(self.leaseToken, nowMs);
    var roots = self.store.listBarrierJobsAtOrBefore(self.leaseToken, targetS, nowMs);
    if (!roots.length) return null;
    var first = roots[0];
    if (first.state === 'QUARANTINED') return {blocked: 'SCHEDULER_QUARANTINE_LIMIT', row: first};
    if (first.state === 'RUNNING') {
      if (first.locked_by === self.leaseToken.ownerId &&
          Number(first.locked_generation) === Number(self.leaseToken.generation) &&
          Number(first.locked_until_ms) > nowMs) return first;
      return {blocked: 'GLOBAL_BARRIER_PENDING', row: first};
    }
    if (first.state === 'RETRY_WAIT' && Number(first.retry_at_ms) > nowMs) {
      return {blocked: 'GLOBAL_BARRIER_PENDING', row: first};
    }
    return self.store.claimForResolution(self.leaseToken, first.id, nowMs, self.leaseMs, {
      nowS: targetS
    });
  }, {immediate: true});
};

SchedulerWriter.prototype.applyClaimedWithFailurePolicy = function (claimed, budget, admission) {
  var nowMs = this.clock.nowMs();
  try {
    this.callFaultHook('after-claim', claimed);
    var outcome = this.applyClaimed(claimed, budget, nowMs);
    this.flushCommittedMetricLedger(outcome.metricLedger);
    return outcome;
  } catch (error) {
    if (error && error.code === 'LEASE_LOST') {
      this.ready = false;
      this.reason = 'SCHEDULER_LEASE_LOST';
      this.clearMutationTimers();
      throw error;
    }
    if (isInjectedCrash(error)) throw error;
    if (isFatalStorageFailure(error)) {
      this.transitionStorageFatal(error);
      throw error;
    }
    this.settleClaimFailure(claimed, error, nowMs);
    if (admission) throw schedulerError('GLOBAL_BARRIER_PENDING');
    return {failed: true, metricLedger: null};
  }
};

SchedulerWriter.prototype.processGlobalBarriers = function (targetS, budget, admission) {
  var processed = 0;
  while (budget.value > 0) {
    var claimed = this.claimFirstGlobal(targetS);
    if (!claimed) return {partial: false, processed: processed};
    if (claimed.blocked) {
      if (admission) throw schedulerError(claimed.blocked);
      return {partial: false, blocked: claimed.blocked, processed: processed};
    }
    var outcome = this.applyClaimedWithFailurePolicy(claimed, budget, admission);
    if (outcome.failed) continue;
    processed += Number(outcome.advanceResult && outcome.advanceResult.processed || 0);
    if (outcome.partial) return outcome;
  }
  return {partial: true, budgetExhausted: true, processed: processed};
};

SchedulerWriter.prototype.directAccountOutcomeInCurrentUow = function (mutation, accountId, targetS) {
  if (!positiveInteger(accountId) || !nonnegativeInteger(targetS)) {
    throw new Error('ACCOUNT_ADVANCE_TARGET_INVALID');
  }
  if (targetS > Math.floor(mutation.effectiveNowMs / 1000)) {
    throw new Error('ADVANCE_TARGET_FUTURE');
  }
  var row = this.store.kho.db.prepare('SELECT revision FROM dq WHERE tk=?').get(accountId);
  if (!row) return {partial: false, advanceResult: {
    processed: 0, advancedToS: targetS, nextDueAtS: null,
    hasMoreDue: false, budgetExhausted: false
  }};
  var revision = Number(row.revision);
  this.store.retargetOwnedPendingAccountAdvanceForCommand(
    mutation.leaseToken, accountId, revision, targetS, mutation.effectiveNowMs
  );
  var claimed = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, accountId, targetS, mutation.effectiveNowMs, this.leaseMs
  );
  if (!claimed) {
    this.store.replaceAccountAdvance(
      mutation.leaseToken, accountId, revision, targetS, mutation.effectiveNowMs
    );
    claimed = this.store.adoptAccountAdvanceForCommand(
      mutation.leaseToken, accountId, targetS, mutation.effectiveNowMs, this.leaseMs
    );
  }
  if (!claimed) return {partial: false, advanceResult: {
    processed: 0, advancedToS: targetS, nextDueAtS: null,
    hasMoreDue: false, budgetExhausted: false
  }};
  return this.executeClaimedInCurrentUow(mutation, claimed, mutation.effectiveNowMs, {
    executionTargetS: targetS
  });
};

SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, nowS, budget) {
  void budget;
  var rows = this.store.kho.q.dqDenHan.all(nowS, 61);
  var limit = Math.min(60, rows.length);
  var processed = 0;
  for (var index = 0; index < limit; index += 1) {
    var dueAtS = Number.isSafeInteger(Number(rows[index].keTiep)) ?
      Number(rows[index].keTiep) : nowS;
    var targetS = Math.min(dueAtS, nowS);
    var outcome = this.directAccountOutcomeInCurrentUow(mutation, Number(rows[index].tk), targetS);
    processed += Number(outcome.advanceResult && outcome.advanceResult.processed || 0);
    if (outcome.partial) return Object.assign({partial: true}, outcome);
  }
  if (rows.length > 60) {
    return {partial: true, deferred: true, code: 'TICK_PARTIAL',
      advanceResult: {processed: processed, advancedToS: nowS, nextDueAtS: nowS,
        hasMoreDue: true, budgetExhausted: true}};
  }
  return {partial: false, processed: processed};
};

SchedulerWriter.prototype.runCommandInCurrentUow = function (command, budget, nowMs) {
  var mutation = this.newMutationContext(this.leaseToken, budget, nowMs);
  var self = this;
  return this.world.trongMutationScheduler(mutation, function () {
    var nowS = Math.floor(nowMs / 1000);
    if (command.name === 'advance-due') {
      var due = self.advanceDueInCurrentUow(mutation, nowS, budget);
      if (due.partial) return {deferred: true, code: 'TICK_PARTIAL',
        metricLedger: mutation.metricLedger};
      return {value: command.run(), metricLedger: mutation.metricLedger};
    }
    if (command.accountId !== undefined && command.accountId !== null) {
      var accountOutcome = self.directAccountOutcomeInCurrentUow(
        mutation, Number(command.accountId), nowS
      );
      if (accountOutcome.partial) return {deferred: true, code: 'TICK_PARTIAL',
        metricLedger: mutation.metricLedger};
    }
    try {
      return {value: self.withWriterMutationDefaults(mutation, function () {
        return command.run();
      }), metricLedger: mutation.metricLedger};
    } catch (error) {
      if (error instanceof PartialDeferred) return {deferred: true,
        code: 'TICK_PARTIAL', metricLedger: mutation.metricLedger};
      throw error;
    }
  });
};

SchedulerWriter.prototype.validateCommand = function (command) {
  if (!command || typeof command.name !== 'string' || command.name.length < 1 ||
      typeof command.run !== 'function') {
    throw new Error('SCHEDULER_COMMAND_INVALID');
  }
  if (command.accountId !== undefined && command.accountId !== null &&
      !positiveInteger(Number(command.accountId))) {
    throw new Error('SCHEDULER_COMMAND_INVALID');
  }
};

SchedulerWriter.prototype.runCommand = function (command) {
  this.validateCommand(command);
  var self = this;
  return this.enqueue(function () {
    self.ensureReady();
    var budget = {value: DEFAULT_BUDGET};
    var nowS = Math.floor(self.clock.nowMs() / 1000);
    if (command.name !== 'advance-due') {
      var barrier = self.processGlobalBarriers(nowS, budget, true);
      if (barrier.partial) {
        self.armContinuation();
        return {deferred: true, code: 'TICK_PARTIAL'};
      }
    }
    var returned = self.store.kho.trongGiaoDich(function () {
      return self.runCommandInCurrentUow(command, budget, self.clock.nowMs());
    }, {immediate: true});
    self.flushCommittedMetricLedger(returned.metricLedger);
    if (returned.deferred) {
      self.armContinuation();
      return {deferred: true, code: returned.code};
    }
    if (returned.value && typeof returned.value.then === 'function') {
      throw new Error('SCHEDULER_COMMAND_ASYNC');
    }
    self.armWakeTimer();
    return returned.value;
  });
};

SchedulerWriter.prototype.advanceTo = function (accountId, targetS) {
  if (!positiveInteger(Number(accountId)) || !nonnegativeInteger(Number(targetS))) {
    return Promise.reject(schedulerError('TICK_TARGET_INVALID'));
  }
  var self = this;
  return this.enqueue(function () {
    self.ensureReady();
    if (Number(targetS) > Math.floor(self.clock.nowMs() / 1000)) {
      throw new Error('ADVANCE_TARGET_FUTURE');
    }
    var budget = {value: DEFAULT_BUDGET};
    var barrier = self.processGlobalBarriers(Number(targetS), budget, true);
    if (barrier.partial) {
      self.armContinuation();
      return toPublicAdvanceResult(barrier.advanceResult || {
        processed: 0, advancedToS: Number(targetS), nextDueAtS: Number(targetS),
        hasMoreDue: true, budgetExhausted: true
      });
    }
    var returned = self.store.kho.trongGiaoDich(function () {
      var mutation = self.newMutationContext(self.leaseToken, budget, self.clock.nowMs());
      return self.world.trongMutationScheduler(mutation, function () {
        var outcome = self.directAccountOutcomeInCurrentUow(mutation, Number(accountId), Number(targetS));
        return {outcome: outcome, metricLedger: mutation.metricLedger};
      });
    }, {immediate: true});
    self.flushCommittedMetricLedger(returned.metricLedger);
    if (returned.outcome.partial) self.armContinuation();
    return toPublicAdvanceResult(returned.outcome.advanceResult || {
      processed: 0, advancedToS: Number(targetS), nextDueAtS: null,
      hasMoreDue: false, budgetExhausted: false
    });
  });
};

SchedulerWriter.prototype.drainNow = function () {
  var self = this;
  return this.enqueue(function () {
    self.ensureReady();
    self.draining = true;
    var budget = {value: DEFAULT_BUDGET};
    var count = 0;
    try {
      while (budget.value > 0) {
        var nowMs = self.clock.nowMs();
        var nowS = Math.floor(nowMs / 1000);
        var firstGlobal = self.store.kho.trongGiaoDich(function () {
          var roots = self.store.listBarrierJobsAtOrBefore(self.leaseToken, nowS, nowMs);
          return roots[0] || null;
        }, {immediate: true});
        if (firstGlobal && firstGlobal.state === 'RUNNING' &&
            (firstGlobal.locked_by !== self.leaseToken.ownerId ||
            Number(firstGlobal.locked_generation) !== Number(self.leaseToken.generation))) {
          break;
        }
        var accountClaim = self.store.kho.trongGiaoDich(function () {
          var watermark = self.store.globalWatermarkS();
          return self.store.claimNext(self.leaseToken, nowMs, watermark, self.leaseMs);
        }, {immediate: true});
        if (accountClaim) {
          try { self.callFaultHook('after-claim', accountClaim); }
          catch (error) {
            self.settleClaimFailure(accountClaim, error, nowMs);
            if (isInjectedCrash(error)) throw error;
            continue;
          }
          try {
            var accountOutcome = self.applyClaimed(accountClaim, budget, nowMs);
            self.flushCommittedMetricLedger(accountOutcome.metricLedger);
            count += 1;
            if (accountOutcome.partial) { self.armContinuation(); return count; }
          } catch (error) {
            self.settleClaimFailure(accountClaim, error, nowMs);
            if (isInjectedCrash(error)) throw error;
          }
          continue;
        }
        var globalOutcome = self.processGlobalBarriers(nowS, budget, false);
        if (globalOutcome.partial) { self.armContinuation(); return count; }
        if (!globalOutcome.processed && !globalOutcome.failed) break;
        count += 1;
      }
      self.armWakeTimer();
      return count;
    } finally {
      self.draining = false;
    }
  });
};

SchedulerWriter.prototype.schedule = function (job) {
  try { this.ensureReady(); } catch (error) { return Promise.reject(error); }
  var self = this;
  return this.enqueue(function () {
    self.assertOperationalAdmission();
    var row = self.store.kho.trongGiaoDich(function () {
      var nowMs = self.clock.nowMs();
      var accountSchedule = task6CanonicalAccountSchedule(job);
      if (accountSchedule) {
        return self.store.replaceAccountAdvance(
          self.leaseToken,
          accountSchedule.accountId,
          accountSchedule.revision,
          accountSchedule.scheduledAtS,
          nowMs
        );
      }
      return self.store.schedule(self.leaseToken, job, nowMs);
    }, {immediate: true});
    self.armWakeTimer();
    return row;
  }, true).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  });
};

SchedulerWriter.prototype.cancel = function (key, reason) {
  try { this.ensureReady(); } catch (error) { return Promise.reject(error); }
  var self = this;
  return this.enqueue(function () {
    self.assertOperationalAdmission();
    return self.store.kho.trongGiaoDich(function () {
      return self.store.cancel(self.leaseToken, key, reason, self.clock.nowMs());
    }, {immediate: true});
  }, true).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  });
};

SchedulerWriter.prototype.reconcileOwned = function (token, nowMs, allowRecovering) {
  if (!this.reconciler || typeof this.reconciler.reconcile !== 'function') {
    return Promise.reject(schedulerError('SCHEDULER_RECONCILER_UNAVAILABLE'));
  }
  if (!token) {
    try { token = this.requireReadyLease(nowMs); }
    catch (error) { return Promise.reject(error); }
  } else {
    try { this.store.assertLiveLease(token, nowMs); }
    catch (error) { return Promise.reject(error); }
  }
  if (!allowRecovering && (!this.ready || this.state !== 'ready')) {
    return Promise.reject(schedulerError('SCHEDULER_NOT_READY'));
  }
  var self = this;
  return Promise.resolve().then(function () {
    return self.reconciler.reconcile({
      leaseToken: token,
      effectiveNowMs: self.store.peekEffectiveNowMs(nowMs),
      writer: self
    });
  });
};

SchedulerWriter.prototype.reconcile = function () {
  if (!this.reconciler || typeof this.reconciler.reconcile !== 'function') {
    return Promise.reject(schedulerError('SCHEDULER_RECONCILER_UNAVAILABLE'));
  }
  try { this.ensureReady(); } catch (error) { return Promise.reject(error); }
  var self = this;
  return this.enqueue(function () {
    self.assertOperationalAdmission();
    var nowMs = self.effectiveNowMs();
    return self.reconcileOwned(self.requireReadyLease(nowMs), nowMs, false)
      .then(function (result) {
        self.metrics.reconcile.success += 1;
        return result;
      }, function (error) {
      self.metrics.reconcile.error += 1;
      throw error;
      });
  }, true).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  });
};

SchedulerWriter.prototype.armStandbyPoll = function () {
  if (this.manualDrain || this.pollTimer !== null || !this.dbOpen) return;
  var self = this;
  this.pollTimer = setTimer(this.timers, function () {
    self.pollTimer = null;
    self.start().catch(function () {});
  }, this.pollMs);
};

SchedulerWriter.prototype.armHeartbeat = function () {
  if (this.manualDrain || this.heartbeatTimer !== null || !this.dbOpen) return;
  var self = this;
  this.heartbeatTimer = setTimer(this.timers, function () {
    self.heartbeatTimer = null;
    self.heartbeatNow();
  }, this.heartbeatDelayMs);
};

SchedulerWriter.prototype.scheduleReconcileTimer = function () {
  if (this.manualDrain || this.reconcileTimer !== null || !this.dbOpen ||
      !this.ready || !this.leaseToken || this.stopRequested) return;
  var self = this;
  this.reconcileTimer = setTimer(this.timers, function () {
    self.reconcileTimer = null;
    if (!self.ready || !self.leaseToken || self.stopRequested) return;
    return self.reconcile().then(function () {
      if (self.ready && self.leaseToken && !self.stopRequested) {
        self.scheduleReconcileTimer();
      }
    }).catch(function () {});
  }, this.reconcileIntervalMs);
};

SchedulerWriter.prototype.heartbeatNow = function () {
  var self = this;
  if (!this.leaseToken || !this.ready) return;
  try {
    var nowMs = this.effectiveNowMs();
    var ok = this.store.kho.trongGiaoDich(function () {
      nowMs = self.recordEffectiveNowInCurrentUow(self.leaseToken, nowMs);
      return self.store.renewLease(self.leaseToken, nowMs, self.leaseMs);
    }, {immediate: true});
    if (!ok) {
      this.transitionLeaseLost();
      return;
    }
    this.armHeartbeat();
  } catch (error) {
    if (isFatalStorageFailure(error)) {
      this.transitionStorageFatal(error);
      return;
    }
    this.armHeartbeat();
  }
};

SchedulerWriter.prototype.armWakeTimer = function () {
  if (this.manualDrain || !this.ready || !this.dbOpen) return;
  clearTimer(this.timers, this.wakeTimer);
  this.wakeTimer = null;
  var nowMs = this.clock.nowMs();
  var nextAt = this.store.nextEligibleAtMs(nowMs, this.store.globalWatermarkS());
  if (nextAt === null) return;
  var self = this;
  this.wakeTimer = setTimer(this.timers, function () {
    self.wakeTimer = null;
    return self.drainNow().catch(function () {});
  }, Math.max(0, Number(nextAt) - nowMs));
};

SchedulerWriter.prototype.armContinuation = function () {
  if (this.manualDrain || this.continuationTimer !== null || !this.ready || !this.dbOpen) return;
  var self = this;
  var fn = function () {
    self.continuationTimer = null;
    self.continuationHandle = null;
    self.drainNow().catch(function () {});
  };
  if (this.immediate && typeof this.immediate.set === 'function') {
    this.continuationTimer = this.immediate.set(fn);
  } else {
    this.continuationTimer = setTimer(this.timers, fn, 0);
  }
  this.continuationHandle = this.continuationTimer;
};

SchedulerWriter.prototype.simulateFatalCrashForTest = function () {
  this.crashed = true;
  this.ready = false;
  this.reason = 'SCHEDULER_CRASHED';
  this.state = 'crashed';
  this.clearAllTimers();
};

SchedulerWriter.prototype.transitionStorageFatal = function (error) {
  if (this.storageFatal) return false;
  this.storageFatal = true;
  this.ready = false;
  this.reason = 'SCHEDULER_STORAGE_FATAL';
  this.state = 'fatal';
  this.clearAllTimers();
  try {
    this.logger.error({event: 'scheduler.error', at: this.clock.nowMs(),
      code: safeErrorMessage(normalizeSchedulerErrorCode(error) || 'SCHEDULER_STORAGE_FATAL')});
  } catch (logError) { void logError; }
  return true;
};

function task6SharedRemainingBudget() { return {value: DEFAULT_BUDGET}; }
function task6AssertNewDrainBudget(budget) {
  if (!budget || !Number.isInteger(budget.value) || budget.value < 1 ||
      budget.value > DEFAULT_BUDGET) throw new Error('TICK_BUDGET_INVALID');
  return budget;
}
function task6AssertEstablishedBudget(budget) {
  if (!budget || !Number.isInteger(budget.value) || budget.value < 0 ||
      budget.value > DEFAULT_BUDGET) throw new Error('TICK_BUDGET_INVALID');
  return budget;
}
function task6IsGlobalJob(job) {
  return job && (job.kind === 'PVP_RESOLVE' || job.kind === 'EXTERNAL_RESOLVE');
}
function task6BarrierEligible(job, nowMs, nowS) {
  return job.state === 'PENDING' && Number(job.scheduled_at_s) <= nowS ||
    job.state === 'RETRY_WAIT' && Number(job.retry_at_ms) <= nowMs;
}
function task6ValidateCommand(command) {
  if (!command || Object.getPrototypeOf(command) !== Object.prototype ||
      typeof command.name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(command.name) ||
      typeof command.run !== 'function' ||
      (command.accountId !== undefined &&
        (!Number.isSafeInteger(command.accountId) || command.accountId < 1))) {
    throw new Error('SCHEDULER_COMMAND_INVALID');
  }
  return command;
}

function task6CanonicalAccountSchedule(job) {
  if (!job || job.kind !== 'ACCOUNT_ADVANCE' || job.aggregateType !== 'account' ||
      job.replayOfJobId !== undefined && job.replayOfJobId !== null ||
      !Number.isSafeInteger(job.scheduledAtS) || job.scheduledAtS < 0 ||
      !Number.isSafeInteger(job.expectedRevision) || job.expectedRevision < 0) {
    return null;
  }
  var accountId = Number(job.aggregateId);
  if (!Number.isSafeInteger(accountId) || accountId < 1 ||
      job.idempotencyKey !== 'account-advance:' + accountId + ':' +
        job.expectedRevision) {
    return null;
  }
  var payload = job.payload || {};
  if (payload.nextLocalAtS !== undefined &&
      Number(payload.nextLocalAtS) !== Number(job.scheduledAtS)) {
    return null;
  }
  return {accountId: accountId, revision: job.expectedRevision,
    scheduledAtS: job.scheduledAtS};
}

SchedulerWriter.prototype.validateCommand = task6ValidateCommand;

SchedulerWriter.prototype.executeClaimedInCurrentUow = function (
  mutation, claimedJob, nowMs, options
) {
  mutation = normalizeMutationContext(mutation);
  options = options || {};
  var token = mutation.leaseToken;
  var self = this, startedAtMs = nowMs, executableJob, globalAdvanceResult = null;
  function finish(outcome, label, advanceResult) {
    if (advanceResult) mutation.recordAdvance(advanceResult);
    mutation.recordJob(executableJob, label, startedAtMs);
    self.refreshLeasePhaseInCurrentUow('before-effect-commit', token, nowMs);
    outcome.metricLedger = mutation.metricLedger;
    return outcome;
  }
  task6AssertEstablishedBudget(mutation.remainingBudget);
  this.store.assertLiveLease(token, nowMs);
  executableJob = this.store.loadExecutableJob(token, claimedJob, nowMs);
  this.markDurableMutationInCurrentUow(mutation, nowMs);
  if (task6IsGlobalJob(executableJob)) {
    var barrier = this.advanceService.advanceBarrier(mutation, executableJob);
    if (barrier.precedingJobId) {
      this.store.parkGlobalBehindPreceding(
        token, executableJob, barrier.precedingJobId,
        Number(executableJob.logical_scheduled_at_s === undefined ?
          executableJob.scheduled_at_s : executableJob.logical_scheduled_at_s),
        nowMs
      );
      var reorderedAdvance = {processed: Number(barrier.processed || 0),
        advancedToS: Number(barrier.advancedToS || executableJob.scheduled_at_s),
        nextDueAtS: Number(executableJob.scheduled_at_s),
        hasMoreDue: true, budgetExhausted: barrier.budgetExhausted === true};
      return finish({reordered: true, partial: false,
        budgetExhausted: barrier.budgetExhausted === true,
        jobId: executableJob.id, precedingJobId: barrier.precedingJobId,
        advanceResult: reorderedAdvance}, 'partial', reorderedAdvance);
    }
    if (barrier.budgetExhausted) {
      var barrierPartialAdvance = {processed: Number(barrier.processed || 0),
        advancedToS: Number(barrier.advancedToS || executableJob.scheduled_at_s),
        nextDueAtS: barrier.nextDueAtS === undefined ? null : barrier.nextDueAtS,
        hasMoreDue: true, budgetExhausted: true};
      return finish({partial: true, budgetExhausted: true,
        jobId: executableJob.id, advanceResult: barrierPartialAdvance},
      'partial', barrierPartialAdvance);
    }
    var alreadyApplied = this.store.hasCommittedApplication(token, executableJob, nowMs);
    if (!alreadyApplied) {
      if (mutation.remainingBudget.value === 0) {
        var zeroGlobalAdvance = {processed: Number(barrier.processed || 0),
          advancedToS: Number(barrier.advancedToS || executableJob.scheduled_at_s),
          nextDueAtS: Number(executableJob.scheduled_at_s),
          hasMoreDue: true, budgetExhausted: true};
        return finish({partial: true, budgetExhausted: true,
          jobId: executableJob.id, advanceResult: zeroGlobalAdvance},
        'partial', zeroGlobalAdvance);
      }
      mutation.remainingBudget.value -= 1;
    }
    globalAdvanceResult = {processed: Number(barrier.processed || 0) +
        (alreadyApplied ? 0 : 1),
      advancedToS: Number(barrier.advancedToS || executableJob.scheduled_at_s),
      nextDueAtS: null, hasMoreDue: false, budgetExhausted: false};
  }
  var reducerOptions = {};
  if (options.executionTargetS !== undefined) {
    reducerOptions.executionTargetS = options.executionTargetS;
  }
  var prepared = this.reducer.prepare(mutation, executableJob, reducerOptions);
  if (executableJob.kind === 'ACCOUNT_ADVANCE' && prepared.advanceResult) {
    mutation.recordAdvance(prepared.advanceResult);
  }
  if (prepared.kind === 'partial') {
    var effect = this.reducer.applyPrepared(mutation, prepared);
    var preparedAdvanceResult = prepared.advanceResult || null;
    var preparedDeferredExternal = prepared.deferredExternal === true ||
      preparedAdvanceResult && (preparedAdvanceResult.deferredExternal === true ||
        !!preparedAdvanceResult.blockedExternalJobId);
    if (isExactNullPartial(prepared, effect, mutation)) {
      return {partial: true, jobId: executableJob.id,
        metricLedger: mutation.metricLedger, advanceResult: prepared.advanceResult || null};
    }
    if (executableJob.kind === 'ACCOUNT_ADVANCE') {
      if (options.deferAccountFinalize) {
        return finish({partial: true,
          budgetExhausted: Boolean(prepared.advanceResult && prepared.advanceResult.budgetExhausted),
          deferredExternal: preparedDeferredExternal === true,
          jobId: executableJob.id,
          accountFinalizer: {job: executableJob, prepared: prepared, effect: effect, partial: true},
          advanceResult: prepared.advanceResult || null}, 'partial', null);
      }
      if (preparedDeferredExternal === true) {
        if (!effect || !Number.isSafeInteger(effect.checkpointRevision) ||
            !preparedAdvanceResult || !preparedAdvanceResult.blockedExternalJobId) {
          throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
        }
        var blockedAccount = this.store.blockOwnedAccountAdvance(
          token, executableJob, effect.checkpointRevision,
          preparedAdvanceResult.blockedExternalJobId, nowMs
        );
        this.store.validateBlockedAccountAdvanceForDependency(
          token, Number(executableJob.aggregate_id), effect.checkpointRevision,
          preparedAdvanceResult.blockedExternalJobId,
          Number(blockedAccount.scheduled_at_s), nowMs
        );
      } else {
        this.store.checkpointPartial(token, executableJob, effect && effect.checkpointRevision, nowMs);
      }
    }
    return finish({partial: true,
      budgetExhausted: Boolean(prepared.advanceResult && prepared.advanceResult.budgetExhausted),
      deferredExternal: preparedDeferredExternal === true,
      jobId: preparedDeferredExternal === true ? null : executableJob.id,
      blockedAccountJobId: preparedDeferredExternal === true ? executableJob.id : null,
      dependencyJobId: preparedDeferredExternal === true ?
        preparedAdvanceResult.blockedExternalJobId : null,
      advanceResult: prepared.advanceResult || null}, 'partial', null);
  }
  var application = this.store.insertApplication(
    token, executableJob, prepared.application, nowMs,
    prepared.canonicalTContext || null
  );
  var appliedEffect = prepared.mutation || {nextLocalAtS: prepared.nextLocalAtS || null};
  if (!application.alreadyApplied) {
    this.callFaultHook('after-application-insert', executableJob);
    appliedEffect = task6IsGlobalJob(executableJob) ?
      this.withGlobalResolutionWorldDefaults(mutation, executableJob, function () {
        return self.reducer.applyPrepared(mutation, prepared);
      }) || appliedEffect :
      this.reducer.applyPrepared(mutation, prepared) || appliedEffect;
    this.callFaultHook('after-game-mutation', executableJob);
  }
  this.callFaultHook('before-job-completion', executableJob);
  if (prepared.terminalState === 'CANCELLED') {
    this.store.finishResolved(token, executableJob, 'CANCELLED', prepared.cancelReason, nowMs);
  } else if (executableJob.kind === 'ACCOUNT_ADVANCE' && options.deferAccountFinalize) {
    return finish({partial: false, budgetExhausted: false, jobId: executableJob.id,
      accountFinalizer: {job: executableJob, prepared: prepared,
        effect: appliedEffect, partial: false},
      advanceResult: prepared.advanceResult || null}, 'success', null);
  } else if (executableJob.kind === 'ACCOUNT_ADVANCE') {
    var nextLocalAtS = prepared.nextLocalAtS || appliedEffect.nextLocalAtS;
    if (!Number.isSafeInteger(nextLocalAtS)) {
      nextLocalAtS = this.computeNextLocalAtSForAccount(executableJob.aggregate_id);
    }
    this.store.completeAccountAdvanceAndScheduleSuccessor(
      token, executableJob, nextLocalAtS, nowMs
    );
  } else {
    this.store.completeApplied(token, executableJob, nowMs);
  }
  return finish({partial: false, budgetExhausted: false, jobId: executableJob.id,
    afterCancel: executableJob.kind === 'ACCOUNT_ADVANCE' &&
      prepared.terminalState === 'CANCELLED',
    advanceResult: prepared.advanceResult || globalAdvanceResult}, 'success', globalAdvanceResult);
};

SchedulerWriter.prototype.applyClaimed = function (claimed, budget, nowMs, options) {
  var self = this;
  task6AssertEstablishedBudget(budget);
  return this.store.kho.trongGiaoDich(function () {
    nowMs = self.recordEffectiveNowInCurrentUow(self.leaseToken, nowMs);
    var mutation = self.newMutationContext(self.leaseToken, budget, nowMs);
    var result = self.world.trongMutationScheduler(mutation, function () {
      return self.executeClaimedInCurrentUow(mutation, claimed, nowMs, options || {
        executionTargetS: Number(claimed.scheduled_at_s)
      });
    });
    result.metricLedger = mutation.metricLedger;
    self.refreshLeasePhaseInCurrentUow('before-effect-commit', self.leaseToken, nowMs);
    return result;
  }, {immediate: true});
};

SchedulerWriter.prototype.recordJobError = function (job) {
  if (!job || typeof job.kind !== 'string') return;
  if (['ACCOUNT_ADVANCE', 'PVP_RESOLVE', 'EXTERNAL_RESOLVE'].indexOf(job.kind) < 0) return;
  var key = job.kind + '|error';
  this.metrics.jobAttempts[key] = Number(this.metrics.jobAttempts[key] || 0) + 1;
};

SchedulerWriter.prototype.settleClaimFailure = function (claimed, error, nowMs) {
  if (error && error.code === 'LEASE_LOST') { this.handleLeaseLoss(error); throw error; }
  if (isInjectedCrash(error)) throw error;
  if (isFatalStorageFailure(error)) { this.transitionStorageFatal(error); throw error; }
  this.recordJobError(claimed);
  var self = this;
  var state = this.store.kho.trongGiaoDich(function () {
    var token = self.leaseToken;
    nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
    nowMs = self.refreshLeasePhaseInCurrentUow('before-failure', token, nowMs);
    if (error && error.code === 'PAYLOAD_INTEGRITY') {
      var quarantined = self.store.quarantineClaimedRaw(token, claimed, error, nowMs);
      nowMs = self.refreshLeasePhaseInCurrentUow('before-failure-commit', token, nowMs);
      return quarantined && quarantined.state;
    }
    try {
      var outcome = self.store.fail(token, claimed, error || new Error('UNKNOWN'), nowMs,
        self.retryPolicy());
      nowMs = self.refreshLeasePhaseInCurrentUow('before-failure-commit', token, nowMs);
      return outcome;
    } catch (loadError) {
      if (loadError && loadError.code === 'PAYLOAD_INTEGRITY') {
        var raw = self.store.getById(claimed.id) || claimed;
        var rawOutcome = self.store.quarantineClaimedRaw(token, raw, loadError, nowMs);
        nowMs = self.refreshLeasePhaseInCurrentUow('before-failure-commit', token, nowMs);
        return rawOutcome && rawOutcome.state;
      }
      throw loadError;
    }
  }, {immediate: true});
  if (state === 'QUARANTINED') {
    this.log('warn', 'scheduler.job_quarantined', {
      kind: claimed.kind,
      code: safeErrorMessage(normalizeSchedulerErrorCode(error) ||
        (error && error.code) || 'SCHEDULER_JOB_FAILED')
    });
  }
  return state;
};

SchedulerWriter.prototype.takeNextJob = function (token, nowMs, watermarkS) {
  var self = this;
  return this.store.kho.trongGiaoDich(function () {
    nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
    var remaining = self.partialQueue.length;
    while (remaining-- > 0) {
      var id = self.partialQueue.shift();
      var row = self.store.getById(id);
      var accountAllowed = row && row.kind === 'ACCOUNT_ADVANCE' &&
        (watermarkS === null || Number(row.scheduled_at_s) <= watermarkS);
      if (accountAllowed) {
        self.partialIds.delete(id);
        return self.store.resumeOwnedRunning(token, id, nowMs, self.leaseMs);
      }
      self.partialQueue.push(id);
    }
    return self.store.claimNext(token, nowMs, watermarkS, self.leaseMs);
  }, {immediate: true});
};

SchedulerWriter.prototype.enqueuePartial = function (jobId) {
  if (!jobId || this.partialIds.has(jobId)) return;
  this.partialIds.add(jobId);
  this.partialQueue.push(jobId);
  this.armContinuation();
};

SchedulerWriter.prototype.enqueueCommittedPartial = function (jobId) {
  if (!jobId) return false;
  var row = this.store.getById(jobId);
  if (!row || row.state !== 'RUNNING' || !this.leaseToken ||
      row.locked_by !== this.leaseToken.ownerId ||
      Number(row.locked_generation) !== Number(this.leaseToken.generation)) return false;
  this.enqueuePartial(jobId);
  return true;
};

SchedulerWriter.prototype.enqueueBudgetContinuationIfDue = function (token, nowMs) {
  if (this.manualDrain || this.continuationTimer !== null) return false;
  var nowS = Math.floor(nowMs / 1000);
  var first = this.store.listBarrierJobsAtOrBefore(token, nowS, nowMs)[0];
  var runningOwned = Boolean(first && first.state === 'RUNNING' &&
    first.locked_by === token.ownerId &&
    Number(first.locked_generation) === Number(token.generation));
  if (first && first.state === 'RUNNING' && !runningOwned) return false;
  var barrierDue = Boolean(first && (runningOwned || task6BarrierEligible(first, nowMs, nowS)));
  var watermarkS = this.store.globalWatermarkS();
  var nextEligibleAtMs = barrierDue ? null : first ?
    this.store.nextAccountEligibleAtMs(watermarkS) :
    this.store.nextEligibleAtMs(nowMs, watermarkS);
  if (!barrierDue && (nextEligibleAtMs === null || nextEligibleAtMs > nowMs)) return false;
  this.armContinuation();
  return this.continuationTimer !== null;
};

SchedulerWriter.prototype.claimFirstBarrierForDrain = function (token, nowMs, horizonS) {
  var self = this;
  var nowS = horizonS === undefined ? Math.floor(nowMs / 1000) : horizonS;
  var rows = this.store.listBarrierJobsAtOrBefore(token, nowS, nowMs);
  if (!rows.length) return {claimed: null, blocked: false};
  var row = rows[0];
  if (row.state === 'QUARANTINED') {
    return {claimed: null, blocked: true, allowAccount: true,
      code: 'SCHEDULER_QUARANTINE_LIMIT'};
  }
  if (row.state !== 'RUNNING' && !task6BarrierEligible(row, nowMs, nowS)) {
    return {claimed: null, blocked: true, allowAccount: true,
      code: 'GLOBAL_BARRIER_PENDING'};
  }
  this.callFaultHook('before-claim', row);
  var claimed = this.store.kho.trongGiaoDich(function () {
    nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
    if (row.state === 'RUNNING') {
      return self.store.resumeOwnedRunning(token, row.id, nowMs, self.leaseMs);
    }
    return self.store.claimForResolution(token, row.id, nowMs, self.leaseMs,
      {onlyEligible: true, nowS: nowS});
  }, {immediate: true});
  if (!claimed) return {claimed: null, blocked: true, allowAccount: row.state !== 'RUNNING'};
  this.partialIds.delete(row.id);
  this.partialQueue = this.partialQueue.filter(function (id) { return id !== row.id; });
  return {claimed: claimed, blocked: false};
};

SchedulerWriter.prototype.settleBarriersForAdmission = function (budget, nowS, nowMs) {
  var startingBudget = budget.value;
  while (true) {
    nowMs = this.effectiveNowMs();
    var token = this.requireReadyLease(nowMs);
    var barrierClaim = this.claimFirstBarrierForDrain(token, nowMs, nowS);
  if (barrierClaim.blocked) return {deferred: true,
    code: barrierClaim.code || 'GLOBAL_BARRIER_PENDING',
    processed: startingBudget - budget.value};
    var claimed = barrierClaim.claimed;
    if (!claimed || Number(claimed.scheduled_at_s) > nowS) {
      return {deferred: false, budgetExhausted: false,
        processed: startingBudget - budget.value};
    }
    var outcome;
    try {
      this.callFaultHook('after-claim', claimed);
      outcome = this.applyClaimed(claimed, budget, nowMs);
    } catch (error) {
      if (isFatalStorageFailure(error)) { this.handlePublicFailure(error); throw error; }
      if (error && error.code === 'LEASE_LOST') { this.handleLeaseLoss(error); throw error; }
      this.settleClaimFailure(claimed, error, nowMs);
      return {deferred: true, code: 'GLOBAL_BARRIER_PENDING',
        processed: startingBudget - budget.value};
    }
    this.flushCommittedMetricLedger(outcome.metricLedger);
    if (outcome.reordered) {
      if (budget.value === 0) return Object.assign({}, outcome, {
        budgetExhausted: true, processed: startingBudget - budget.value
      });
      continue;
    }
    if (outcome.budgetExhausted || outcome.partial) return Object.assign({}, outcome, {
      processed: startingBudget - budget.value
    });
  }
};

SchedulerWriter.prototype.adoptDirectContinuationInCurrentUow = function (
  mutation, accountId, targetS, result, nowMs
) {
  var revision = result && result.saveReceipt && Number(result.saveReceipt.revision);
  if (result && result.deferredExternal === true) {
    if (!Number.isSafeInteger(revision) || !result.blockedExternalJobId) {
      throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
    }
    var retargeted = this.store.retargetOwnedPendingAccountAdvanceForCommand(
      mutation.leaseToken, accountId, revision, targetS, nowMs
    );
    if (!retargeted) this.store.replaceAccountAdvance(
      mutation.leaseToken, accountId, revision, targetS, nowMs
    );
  }
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, accountId, targetS, nowMs, this.leaseMs
  );
  if (!adopted) throw new Error('ACCOUNT_CONTINUATION_MISSING');
  if (result && result.deferredExternal === true) {
    var blockedAdopted = this.store.blockOwnedAccountAdvance(
      mutation.leaseToken, adopted, revision, result.blockedExternalJobId, nowMs
    );
    this.store.validateBlockedAccountAdvanceForDependency(
      mutation.leaseToken, Number(accountId), revision, result.blockedExternalJobId,
      Number(blockedAdopted.scheduled_at_s), nowMs
    );
  } else if (result && result.saveReceipt) {
    this.store.checkpointPartial(
      mutation.leaseToken, adopted, result.saveReceipt.revision, nowMs
    );
  }
  return adopted;
};

SchedulerWriter.prototype.directAccountOutcomeInCurrentUow = function (
  mutation, accountId, targetS, nowMs, options
) {
  options = options || {};
  if (!positiveInteger(accountId) || !nonnegativeInteger(targetS)) {
    throw new Error('ACCOUNT_ADVANCE_TARGET_INVALID');
  }
  var nextLocalAtS, loadedForZero, zeroJob, zeroResult, probeBudget = false, result;
  if (mutation.remainingBudget.value === 0) {
    nextLocalAtS = this.computeNextLocalAtSForAccount(accountId);
    if (Number.isSafeInteger(nextLocalAtS) && nextLocalAtS <= targetS) {
      loadedForZero = this.world.nap(Number(accountId));
      if (!loadedForZero) throw new Error('ACCOUNT_ADVANCE_AGGREGATE_MISSING');
      this.store.replaceAccountAdvance(
        mutation.leaseToken, Number(accountId), Number(loadedForZero.row.revision),
        nextLocalAtS, nowMs
      );
      zeroJob = this.store.adoptAccountAdvanceForCommand(
        mutation.leaseToken, accountId, nextLocalAtS, nowMs, this.leaseMs
      );
      if (!zeroJob) throw new Error('ACCOUNT_CONTINUATION_MISSING');
      zeroResult = {processed: 0,
        advancedToS: Number(loadedForZero.st.lastTick || loadedForZero.st.now || 0),
        nextDueAtS: nextLocalAtS, hasMoreDue: true, budgetExhausted: true};
      mutation.recordAdvance(zeroResult);
      mutation.recordJob(zeroJob, 'partial', nowMs);
      return {partial: true, budgetExhausted: true, deferredExternal: false,
        jobId: zeroJob.id, blockedAccountJobId: null, dependencyJobId: null,
        advanceResult: zeroResult};
    }
    mutation.remainingBudget.value = 1;
    probeBudget = true;
  }
  var probePrimaryError = null;
  try {
    result = this.advanceService.advanceTo(mutation, accountId, targetS);
  } catch (error) {
    probePrimaryError = error;
    throw error;
  } finally {
    if (probeBudget) {
      var probeConsumed = mutation.remainingBudget.value !== 1;
      mutation.remainingBudget.value = 0;
      if (probeConsumed && !probePrimaryError) {
        throw new Error('SCHEDULER_ZERO_BUDGET_PROBE_CONSUMED');
      }
    }
  }
  mutation.recordAdvance(result);
  var budgetPartial = result.budgetExhausted === true && result.hasMoreDue === true;
  if (budgetPartial && !result.saveReceipt &&
      Number.isSafeInteger(result.nextDueAtS)) {
    var loaded = this.world.nap(Number(accountId));
    if (!loaded) throw new Error('ACCOUNT_ADVANCE_AGGREGATE_MISSING');
    this.store.replaceAccountAdvance(
      mutation.leaseToken, Number(accountId), Number(loaded.row.revision),
      Number(result.nextDueAtS), nowMs
    );
  }
  if (budgetPartial || result.deferredExternal === true) {
    var target = result.deferredExternal === true && result.blockedExternal &&
      Number.isSafeInteger(result.blockedExternal.atS) ?
      Number(result.blockedExternal.atS) :
      Number.isSafeInteger(result.nextDueAtS) ? Number(result.nextDueAtS) : targetS;
    if (options.deferAccountFinalize) {
      return {partial: true, budgetExhausted: budgetPartial,
        deferredExternal: result.deferredExternal === true, jobId: null,
        accountFinalizer: {directMode: true, directReceipt: result.saveReceipt,
          accountId: accountId, targetS: target, advanceResult: result,
          deferredExternal: result.deferredExternal === true,
          blockedExternalJobId: result.blockedExternalJobId || null},
        advanceResult: result};
    }
    var adopted = this.adoptDirectContinuationInCurrentUow(
      mutation, accountId, target, result, nowMs
    );
    mutation.recordJob(adopted, 'partial', nowMs);
    return {partial: true, budgetExhausted: budgetPartial,
      deferredExternal: result.deferredExternal === true,
      jobId: result.deferredExternal === true ? null : adopted.id,
      blockedAccountJobId: result.deferredExternal === true ? adopted.id : null,
      dependencyJobId: result.deferredExternal === true ? result.blockedExternalJobId : null,
      advanceResult: result};
  }
  return {partial: false, budgetExhausted: false, jobId: null, advanceResult: result};
};

SchedulerWriter.prototype.advanceAccountInCurrentUow = function (
  mutation, accountId, targetS, nowMs, options
) {
  options = options || {};
  var adopted = this.store.adoptAccountAdvanceForCommand(
    mutation.leaseToken, accountId, targetS, nowMs, this.leaseMs
  );
  if (adopted && mutation.remainingBudget.value === 0) {
    var adoptedZeroResult = {processed: 0,
      advancedToS: Number(adopted.scheduled_at_s),
      nextDueAtS: Number(adopted.scheduled_at_s),
      hasMoreDue: true, budgetExhausted: true};
    mutation.recordAdvance(adoptedZeroResult);
    mutation.recordJob(adopted, 'partial', nowMs);
    return {partial: true, budgetExhausted: true, deferredExternal: false,
      jobId: adopted.id, advanceResult: adoptedZeroResult};
  }
  if (!adopted) return this.directAccountOutcomeInCurrentUow(
    mutation, accountId, targetS, nowMs, options
  );
  var adoptedOutcome = this.executeClaimedInCurrentUow(mutation, adopted, nowMs, {
    executionTargetS: targetS,
    deferAccountFinalize: options.deferAccountFinalize === true
  });
  if (!adoptedOutcome.afterCancel) return adoptedOutcome;
  var afterCancel = this.directAccountOutcomeInCurrentUow(
    mutation, accountId, targetS, nowMs, options
  );
  return Object.assign({}, afterCancel, {afterCancel: true,
    cancelledJobId: adoptedOutcome.jobId});
};

SchedulerWriter.prototype.advanceDueInCurrentUow = function (mutation, nowS, budget) {
  this.world._schedulerActive(mutation);
  var rows = this.store.kho.q.dqDenHan.all(nowS, 61);
  var limit = Math.min(60, rows.length);
  var processed = 0;
  for (var index = 0; index < limit; index += 1) {
    var dueAtS = Number.isSafeInteger(Number(rows[index].keTiep)) ?
      Number(rows[index].keTiep) : nowS;
    var targetS = Math.min(dueAtS, nowS);
    var outcome = this.advanceAccountInCurrentUow(
      mutation, Number(rows[index].tk), targetS, mutation.effectiveNowMs,
      {deferAccountFinalize: true}
    );
    processed += Number(outcome.advanceResult && outcome.advanceResult.processed || 0);
    if (outcome.accountFinalizer) mutation.commandAccountFinalizer = outcome.accountFinalizer;
    if (outcome.partial || outcome.budgetExhausted || outcome.deferredExternal) {
      return Object.assign({partial: true}, outcome);
    }
    if (budget && budget.value === 0) break;
  }
  if (rows.length > 60 || budget && budget.value === 0) {
    return {partial: true, deferred: true, code: 'TICK_PARTIAL',
      advanceResult: {processed: processed, advancedToS: nowS, nextDueAtS: nowS,
        hasMoreDue: true, budgetExhausted: true}};
  }
  return {partial: false, processed: processed};
};

SchedulerWriter.prototype.withCommandWorldBatchInCurrentUow = function (mutation, fn) {
  var ok = false, result;
  if (this.world._schedulerMutation !== mutation) {
    throw new Error('SCHEDULER_MUTATION_TOKEN_CONFLICT');
  }
  if (this.world.ctx) throw new Error('SCHEDULER_WORLD_BATCH_ALREADY_OPEN');
  this.world.batDau();
  try {
    result = this.withWriterMutationDefaults(mutation, fn);
    ok = true;
    return result;
  } catch (error) {
    if (error instanceof PartialDeferred) ok = true;
    throw error;
  } finally {
    this.world.ketThuc(ok);
  }
};

SchedulerWriter.prototype.withGlobalResolutionWorldDefaults = function (
  mutation, executableJob, fn
) {
  var world = this.world;
  var realLuu = world.luu;
  var rootId = executableJob.logical_root_id || executableJob.id;
  world.luu = function (tk, st, options) {
    options = Object.assign({}, options || {});
    if (!options.mutation) options.mutation = mutation;
    if (options.mutation === mutation) {
      options.deferAccountWake = true;
      if (options.protectedRecoveryRootIds === undefined) {
        options.protectedRecoveryRootIds = new Set([rootId]);
      } else if (options.protectedRecoveryRootIds instanceof Set) {
        options.protectedRecoveryRootIds = new Set(options.protectedRecoveryRootIds);
        options.protectedRecoveryRootIds.add(rootId);
      }
    }
    return realLuu.call(this, tk, st, options);
  };
  try { return fn(); }
  finally { world.luu = realLuu; }
};

SchedulerWriter.prototype.computeNextLocalAtSForAccount = function (accountId) {
  accountId = Number(accountId);
  var loaded = this.world.nap(accountId);
  if (!loaded || !loaded.st) return null;
  var owners = new Map();
  this.store.kho.db.prepare('SELECT tk,state FROM dq ORDER BY tk').all()
    .forEach(function (row) {
      var state = JSON.parse(row.state);
      (state.planets || []).forEach(function (planet) {
        owners.set(G.tdKey(planet.c), Number(row.tk));
      });
    });
  var next = G.phanLoaiSuKienNoiBoKe(loaded.st, accountId, function (key) {
    return owners.get(key) || null;
  });
  return next && Number.isSafeInteger(next.atS) ? next.atS : null;
};

SchedulerWriter.prototype.finalizeCommandAccountInCurrentUow = function (
  mutation, finalizer, nowMs
) {
  if (finalizer.directMode === true) {
    var adopted = this.adoptDirectContinuationInCurrentUow(
      mutation, finalizer.accountId, finalizer.targetS,
      {saveReceipt: finalizer.directReceipt,
        deferredExternal: finalizer.deferredExternal,
        blockedExternalJobId: finalizer.blockedExternalJobId}, nowMs
    );
    mutation.recordJob(adopted, 'partial', nowMs);
    if (finalizer.deferredExternal === true) {
      return {partial: true, jobId: null, blockedAccountJobId: adopted.id,
        dependencyJobId: finalizer.blockedExternalJobId};
    }
    return {partial: true, jobId: adopted.id};
  }
  var effect = finalizer.effect;
  var receipt = effect && effect.saveReceipt ? effect.saveReceipt :
    effect && effect.revision !== undefined ? effect :
    finalizer.prepared && finalizer.prepared.saveReceipt;
  if ((!receipt || !Number.isSafeInteger(receipt.revision)) &&
      finalizer.job && finalizer.job.aggregate_id !== undefined) {
    var receiptRow = this.store.kho.q.dqGet.get(Number(finalizer.job.aggregate_id));
    if (receiptRow && Number.isSafeInteger(Number(receiptRow.revision))) {
      receipt = {revision: Number(receiptRow.revision),
        nextLocalAtS: receipt && receipt.nextLocalAtS !== undefined ?
          receipt.nextLocalAtS : finalizer.prepared && finalizer.prepared.nextLocalAtS};
    }
  }
  if (finalizer.partial) {
    var finalizerAdvanceResult = finalizer.prepared && finalizer.prepared.advanceResult;
    var finalizerDeferredExternal = finalizer.prepared &&
      (finalizer.prepared.deferredExternal === true ||
        finalizerAdvanceResult && (finalizerAdvanceResult.deferredExternal === true ||
          !!finalizerAdvanceResult.blockedExternalJobId));
    if (finalizerDeferredExternal) {
      if (!receipt || !Number.isSafeInteger(receipt.revision) ||
          !finalizerAdvanceResult ||
          !finalizerAdvanceResult.blockedExternalJobId) {
        throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_MISSING');
      }
      var blockedFinalizer = this.store.blockOwnedAccountAdvance(
        mutation.leaseToken, finalizer.job, receipt.revision,
        finalizerAdvanceResult.blockedExternalJobId, nowMs
      );
      this.store.validateBlockedAccountAdvanceForDependency(
        mutation.leaseToken, Number(finalizer.job.aggregate_id), receipt.revision,
        finalizerAdvanceResult.blockedExternalJobId,
        Number(blockedFinalizer.scheduled_at_s), nowMs
      );
      return {partial: true, jobId: null, blockedAccountJobId: finalizer.job.id,
        dependencyJobId: finalizerAdvanceResult.blockedExternalJobId};
    }
    if (!receipt && finalizer.prepared && finalizer.prepared.advanceResult &&
        Number(finalizer.prepared.advanceResult.processed) === 0 &&
        finalizer.prepared.advanceResult.budgetExhausted === true) {
      this.store.loadExecutableJob(mutation.leaseToken, finalizer.job, nowMs);
      return {partial: true, jobId: finalizer.job.id};
    }
    if (!receipt || !Number.isSafeInteger(receipt.revision)) {
      throw new Error('ACCOUNT_COMMAND_RECEIPT_MISSING');
    }
    this.store.checkpointPartial(mutation.leaseToken, finalizer.job, receipt.revision, nowMs);
    return {partial: true, jobId: finalizer.job.id};
  }
  var finalizerNextLocalAtS = receipt && receipt.nextLocalAtS !== undefined ?
    receipt.nextLocalAtS : finalizer.prepared.nextLocalAtS;
  if (!Number.isSafeInteger(finalizerNextLocalAtS)) {
    finalizerNextLocalAtS = this.computeNextLocalAtSForAccount(finalizer.job.aggregate_id);
  }
  this.store.completeAccountAdvanceAndScheduleSuccessor(
    mutation.leaseToken, finalizer.job, finalizerNextLocalAtS, nowMs
  );
  return {partial: false, jobId: null};
};

SchedulerWriter.prototype.runCommand = function (command) {
  task6ValidateCommand(command);
  try { this.ensureReady(); } catch (error) { return Promise.reject(error); }
  var self = this;
  return this.enqueue(function () {
    self.assertOperationalAdmission();
    var nowMs = self.effectiveNowMs(), nowS = Math.floor(nowMs / 1000), committed;
    var budget = task6AssertNewDrainBudget(task6SharedRemainingBudget());
    var barrier = self.settleBarriersForAdmission(budget, nowS, nowMs);
    if (barrier.deferred) throw schedulerError(barrier.code || 'GLOBAL_BARRIER_PENDING');
    if (barrier.budgetExhausted) {
      if (barrier.jobId) self.enqueueCommittedPartial(barrier.jobId);
      else self.enqueueBudgetContinuationIfDue(self.leaseToken, self.effectiveNowMs());
      return {deferred: true, code: 'TICK_PARTIAL'};
    }
    nowMs = self.effectiveNowMs();
    committed = self.store.kho.trongGiaoDich(function () {
      var token = self.requireReadyLease(nowMs);
      nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
      var mutation = self.newMutationContext(token, budget, nowMs);
      var tx = self.world.trongMutationScheduler(mutation, function () {
        var outcome, due, result, finalized;
        self.markDurableMutationInCurrentUow(mutation, nowMs);
        if (command.name === 'account-delete') {
          result = command.run();
          if (result && typeof result.then === 'function') throw new Error('UNIT_OF_WORK_ASYNC');
          return {response: result, partialJobId: null, metricOutcome: null};
        }
        if (command.name === 'advance-due') {
          due = self.advanceDueInCurrentUow(mutation, nowS, budget);
          if (due && (due.budgetExhausted || due.deferredExternal === true || due.partial)) {
            if (mutation.commandAccountFinalizer) {
              finalized = self.finalizeCommandAccountInCurrentUow(
                mutation, mutation.commandAccountFinalizer, nowMs
              );
            } else finalized = {jobId: due.jobId || null, partial: true};
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId, metricOutcome: due};
          }
        }
        if (command.accountId !== undefined) {
          mutation.commandAccountId = Number(command.accountId);
          outcome = self.advanceAccountInCurrentUow(
            mutation, command.accountId, nowS, nowMs,
            {deferAccountFinalize: true}
          );
          if (outcome.budgetExhausted || outcome.partial) {
            finalized = outcome.accountFinalizer ?
              self.finalizeCommandAccountInCurrentUow(
                mutation, outcome.accountFinalizer, nowMs
              ) : outcome;
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId, metricOutcome: outcome};
          }
        }
        try {
          result = self.withCommandWorldBatchInCurrentUow(mutation, function () {
            var value = command.run();
            if (value && typeof value.then === 'function') throw new Error('UNIT_OF_WORK_ASYNC');
            return {deferred: false, value: value, outcome: outcome || null};
          });
        } catch (error) {
          if (error instanceof PartialDeferred) {
            var partialOutcome = error.outcome || {};
            if (outcome && outcome.accountFinalizer) {
              self.finalizeCommandAccountInCurrentUow(
                mutation, outcome.accountFinalizer, nowMs
              );
            }
            if (partialOutcome.accountFinalizer) {
              var partialFinalized = self.finalizeCommandAccountInCurrentUow(
                mutation, partialOutcome.accountFinalizer, nowMs
              );
              partialOutcome = Object.assign({}, partialOutcome, {
                jobId: partialFinalized.jobId,
                blockedAccountJobId: partialFinalized.blockedAccountJobId ||
                  partialOutcome.blockedAccountJobId || null,
                dependencyJobId: partialFinalized.dependencyJobId ||
                  partialOutcome.dependencyJobId || null
              });
            }
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: partialOutcome && partialOutcome.jobId || null,
              metricOutcome: partialOutcome || null};
          }
          throw error;
        }
        if (result.outcome && result.outcome.accountFinalizer) {
          finalized = self.finalizeCommandAccountInCurrentUow(
            mutation, result.outcome.accountFinalizer, nowMs
          );
          if (finalized.partial) {
            return {response: {deferred: true, code: 'TICK_PARTIAL'},
              partialJobId: finalized.jobId, metricOutcome: result.outcome};
          }
        }
        if (mutation.commandAccountFinalizer) {
          finalized = self.finalizeCommandAccountInCurrentUow(
            mutation, mutation.commandAccountFinalizer, nowMs
          );
          return {response: {deferred: true, code: 'TICK_PARTIAL'},
            partialJobId: finalized.jobId,
            metricOutcome: mutation.commandAccountFinalizer.advanceResult || null};
        }
        if (result.deferred) {
          finalized = result.outcome.accountFinalizer ?
            self.finalizeCommandAccountInCurrentUow(
              mutation, result.outcome.accountFinalizer, nowMs
            ) : result.outcome;
          return {response: {deferred: true, code: 'TICK_PARTIAL'},
            partialJobId: finalized.jobId, metricOutcome: result.outcome};
        }
        return {response: result.value, partialJobId: null,
          metricOutcome: result.outcome || due || null};
      });
      tx.metricLedger = mutation.metricLedger;
      self.refreshLeasePhaseInCurrentUow('before-command-commit', token, nowMs);
      return tx;
    }, {immediate: true});
    self.flushCommittedMetricLedger(committed.metricLedger);
    if (committed.partialJobId) self.enqueueCommittedPartial(committed.partialJobId);
    else if (committed.response && committed.response.deferred === true) {
      if (command.name === 'advance-due') self.armContinuation();
      else self.enqueueBudgetContinuationIfDue(self.leaseToken, self.effectiveNowMs());
    }
    return committed.response;
  }, true).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  });
};

SchedulerWriter.prototype.advanceTo = function (accountId, targetS) {
  task6ValidateCommand({name: 'advance-to', accountId: accountId, run: function () {}});
  try { this.ensureReady(); } catch (error) { return Promise.reject(error); }
  if (!Number.isSafeInteger(targetS) || targetS < 0) {
    return Promise.reject(new Error('ADVANCE_TARGET_INVALID'));
  }
  if (targetS > Math.floor(this.effectiveNowMs() / 1000)) {
    return Promise.reject(schedulerError('ADVANCE_TARGET_FUTURE'));
  }
  var self = this;
  return this.enqueue(function () {
    self.assertOperationalAdmission();
    var nowMs = self.effectiveNowMs(), nowS = Math.floor(nowMs / 1000), committed;
    if (targetS > nowS) throw schedulerError('ADVANCE_TARGET_FUTURE');
    var budget = task6AssertNewDrainBudget(task6SharedRemainingBudget());
    var barrier = self.settleBarriersForAdmission(budget, Math.min(nowS, targetS), nowMs);
    if (barrier.deferred) throw schedulerError(barrier.code || 'GLOBAL_BARRIER_PENDING');
    if (barrier.budgetExhausted) {
      if (barrier.jobId) self.enqueueCommittedPartial(barrier.jobId);
      else self.enqueueBudgetContinuationIfDue(self.leaseToken, self.effectiveNowMs());
      var loaded = self.world.nap(accountId);
      var staged = loaded && loaded.st;
      var nextDueAtS = barrier.advanceResult &&
        barrier.advanceResult.nextDueAtS !== undefined ?
        barrier.advanceResult.nextDueAtS : self.store.globalWatermarkS();
      return toPublicAdvanceResult({processed: Number(barrier.processed || 0),
        advancedToS: staged ? Number(staged.lastTick) : targetS,
        nextDueAtS: nextDueAtS, hasMoreDue: true, budgetExhausted: true});
    }
    nowMs = self.effectiveNowMs();
    committed = self.store.kho.trongGiaoDich(function () {
      var token = self.requireReadyLease(nowMs);
      nowMs = self.recordEffectiveNowInCurrentUow(token, nowMs);
      var mutation = self.newMutationContext(token, budget, nowMs);
      var tx = self.world.trongMutationScheduler(mutation, function () {
        self.markDurableMutationInCurrentUow(mutation, nowMs);
        var outcome = self.advanceAccountInCurrentUow(mutation, accountId, targetS, nowMs);
        return {partialJobId: outcome.budgetExhausted || outcome.partial ? outcome.jobId : null,
          deferredExternal: outcome.deferredExternal === true,
          result: toPublicAdvanceResult(outcome.advanceResult || outcome),
          metricOutcome: outcome};
      });
      tx.metricLedger = mutation.metricLedger;
      self.refreshLeasePhaseInCurrentUow('before-advance-commit', token, nowMs);
      return tx;
    }, {immediate: true});
    self.flushCommittedMetricLedger(committed.metricLedger);
    if (committed.partialJobId) self.enqueueCommittedPartial(committed.partialJobId);
    else if (committed.deferredExternal) {
      self.enqueueBudgetContinuationIfDue(self.leaseToken, self.effectiveNowMs());
    }
    var publicResult = Object.assign({}, committed.result, {
      processed: Number(committed.result.processed || 0) + Number(barrier.processed || 0)
    });
    if (committed.deferredExternal === true) publicResult.advancedToS = targetS;
    return publicResult;
  }, true).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  });
};

SchedulerWriter.prototype.drainNow = function () {
  try { this.requireReadyLease(this.effectiveNowMs()); }
  catch (error) { return Promise.reject(error); }
  var self = this;
  return this.enqueue(function () {
    var budget = task6AssertNewDrainBudget(task6SharedRemainingBudget());
    self.draining = true;
    try {
      while (budget.value > 0) {
        var nowMs = self.effectiveNowMs();
        var token = self.requireReadyLease(nowMs);
        var barrierClaim = self.claimFirstBarrierForDrain(token, nowMs);
        if (barrierClaim.blocked && !barrierClaim.allowAccount) return;
        var claimed = barrierClaim.claimed;
        if (!claimed) {
          var watermarkS = self.store.globalWatermarkS();
          self.callFaultHook('before-claim', null);
          claimed = self.takeNextJob(token, nowMs, watermarkS);
        }
        if (!claimed) {
          self.armWakeTimer();
          return;
        }
        var outcome;
        try {
          self.callFaultHook('after-claim', claimed);
          outcome = self.applyClaimed(claimed, budget, nowMs);
        } catch (error) {
          if (isInjectedCrash(error)) throw error;
          if (isFatalStorageFailure(error)) { self.handlePublicFailure(error); throw error; }
          if (error && error.code === 'LEASE_LOST') { self.handleLeaseLoss(error); throw error; }
          try { self.settleClaimFailure(claimed, error, nowMs); }
          catch (settleError) { self.handlePublicFailure(settleError); throw settleError; }
          continue;
        }
        self.flushCommittedMetricLedger(outcome.metricLedger);
        if (outcome.reordered) {
          if (budget.value === 0) {
            self.enqueueBudgetContinuationIfDue(token, self.effectiveNowMs());
            return;
          }
          continue;
        }
        if (outcome.partial) {
          if (claimed && claimed.kind === 'ACCOUNT_ADVANCE' &&
              outcome.deferredExternal === true && outcome.dependencyJobId &&
              budget.value > 0) {
            var dependency = self.store.getById(outcome.dependencyJobId);
            var dependencyDue = dependency && task6IsGlobalJob(dependency) &&
              Number(dependency.scheduled_at_s) < Number(claimed.scheduled_at_s) &&
              Number(dependency.scheduled_at_s) <= Math.floor(self.effectiveNowMs() / 1000) &&
              (dependency.state === 'PENDING' ||
                dependency.state === 'RUNNING' &&
                dependency.locked_by === token.ownerId &&
                Number(dependency.locked_generation) === Number(token.generation));
            if (dependencyDue) continue;
          }
          if (!self.enqueueCommittedPartial(outcome.jobId) &&
              outcome.deferredExternal === true) {
            self.enqueueBudgetContinuationIfDue(token, self.effectiveNowMs());
          }
          return;
        }
        self.metrics.lastSuccessfulDrainTimestampMs = self.effectiveNowMs();
        if (budget.value === 0) {
          self.enqueueBudgetContinuationIfDue(token, self.effectiveNowMs());
          return;
        }
      }
    } finally {
      self.draining = false;
    }
  }, true).catch(function (error) {
    self.handlePublicFailure(error);
    throw error;
  }).finally(function () {
    if (self.ready) self.armWakeTimer();
  });
};

module.exports = {
  SchedulerWriter: SchedulerWriter
};
