"use strict";

var METRIC_FIELDS = [
  'scheduler_writer_lease_held',
  'scheduler_jobs_pending',
  'scheduler_jobs_retry_wait',
  'scheduler_jobs_running',
  'scheduler_jobs_quarantined',
  'scheduler_due_backlog',
  'scheduler_oldest_due_age_ms',
  'scheduler_job_attempts_total',
  'scheduler_job_duration_ms',
  'scheduler_advance_processed',
  'scheduler_advance_budget_exhausted_total',
  'scheduler_lease_acquire_total',
  'scheduler_reconcile_total',
  'scheduler_last_successful_drain_timestamp_ms'
];
var JOB_KINDS = ['ACCOUNT_ADVANCE', 'PVP_RESOLVE', 'EXTERNAL_RESOLVE'];
var JOB_OUTCOMES = ['success', 'partial', 'error'];
var LEASE_OUTCOMES = ['acquired', 'unavailable', 'error'];
var RECONCILE_OUTCOMES = ['success', 'error'];
var DURATION_BUCKETS_MS = [10, 100, 1000, 10000, Infinity];

function newMetricState() {
  return {
    jobAttempts: {},
    jobDuration: {},
    advanceProcessed: 0,
    advanceBudgetExhaustedTotal: 0,
    leaseAcquire: {acquired: 0, unavailable: 0, error: 0},
    reconcile: {success: 0, error: 0},
    lastSuccessfulDrainTimestampMs: 0
  };
}

function finiteNonNegative(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function metricNumber(value) {
  value = Number(value);
  if (!Number.isFinite(value) || value < 0) throw new Error('SCHEDULER_METRIC_VALUE_INVALID');
  return String(value);
}

function metricValue(status, name) {
  var counts = status.counts || {}, ages = status.ages || {}, own = status.metrics || {};
  var table = {
    scheduler_writer_lease_held: status.writerLeaseHeld ? 1 : 0,
    scheduler_jobs_pending: counts.pending,
    scheduler_jobs_retry_wait: counts.retryWait,
    scheduler_jobs_running: counts.running,
    scheduler_jobs_quarantined: counts.quarantined,
    scheduler_due_backlog: counts.dueBacklog,
    scheduler_oldest_due_age_ms: ages.oldestDueAgeMs,
    scheduler_advance_processed: own.advanceProcessed,
    scheduler_advance_budget_exhausted_total: own.advanceBudgetExhaustedTotal,
    scheduler_last_successful_drain_timestamp_ms: own.lastSuccessfulDrainTimestampMs
  };
  return metricNumber(table[name]);
}

function renderMetrics(status) {
  var own = Object.assign(newMetricState(), status.metrics || {});
  var scalarNames = METRIC_FIELDS.filter(function (name) {
    return ['scheduler_job_attempts_total', 'scheduler_job_duration_ms',
      'scheduler_lease_acquire_total', 'scheduler_reconcile_total'].indexOf(name) < 0;
  });
  var rows = scalarNames.map(function (name) {
    return name + ' ' + metricValue(status, name);
  });
  JOB_KINDS.forEach(function (kind) {
    JOB_OUTCOMES.forEach(function (outcome) {
      var key = kind + '|' + outcome;
      var duration = own.jobDuration[key] || {count: 0, sum: 0, buckets: [0, 0, 0, 0, 0]};
      rows.push('scheduler_job_attempts_total{kind="' + kind + '",outcome="' +
        outcome + '"} ' + metricNumber(own.jobAttempts[key] || 0));
      DURATION_BUCKETS_MS.forEach(function (limit, index) {
        rows.push('scheduler_job_duration_ms_bucket{kind="' + kind +
          '",outcome="' + outcome + '",le="' +
          (limit === Infinity ? '+Inf' : limit) + '"} ' +
          metricNumber(duration.buckets[index] || 0));
      });
      rows.push('scheduler_job_duration_ms_sum{kind="' + kind +
        '",outcome="' + outcome + '"} ' + metricNumber(duration.sum || 0));
      rows.push('scheduler_job_duration_ms_count{kind="' + kind +
        '",outcome="' + outcome + '"} ' + metricNumber(duration.count || 0));
    });
  });
  LEASE_OUTCOMES.forEach(function (outcome) {
    rows.push('scheduler_lease_acquire_total{outcome="' + outcome + '"} ' +
      metricNumber((own.leaseAcquire || {})[outcome] || 0));
  });
  RECONCILE_OUTCOMES.forEach(function (outcome) {
    rows.push('scheduler_reconcile_total{outcome="' + outcome + '"} ' +
      metricNumber((own.reconcile || {})[outcome] || 0));
  });
  return rows.join('\n') + '\n';
}

function evaluateReadiness(status, options) {
  options = options || {};
  if (!status || !status.dbOpen) return {ready: false, reason: 'SCHEDULER_DB_CLOSED'};
  if (status.state === 'fatal' || status.reason === 'SCHEDULER_STORAGE_FATAL') {
    return {ready: false, reason: 'SCHEDULER_STORAGE_FATAL'};
  }
  if (status.state === 'crashed' || status.reason === 'SCHEDULER_CRASHED') {
    return {ready: false, reason: 'SCHEDULER_CRASHED'};
  }
  if (status.state === 'stopped' || status.reason === 'SCHEDULER_STOPPED') {
    return {ready: false, reason: 'SCHEDULER_STOPPED'};
  }
  var counts = status.counts || {}, ages = status.ages || {};
  var quarantined = Number(counts.quarantined === undefined ? status.quarantined : counts.quarantined);
  var oldestDueAgeMs = Number(
    ages.oldestDueAgeMs === undefined ? status.oldestDueAgeMs : ages.oldestDueAgeMs
  );
  if (!['pending', 'retryWait', 'running', 'quarantined', 'dueBacklog'].every(function (name) {
    return finiteNonNegative(counts[name]);
  }) || !finiteNonNegative(oldestDueAgeMs) ||
      (ages.nextEligibleAtMs !== null && ages.nextEligibleAtMs !== undefined &&
        !finiteNonNegative(ages.nextEligibleAtMs))) {
    return {ready: false, reason: 'SCHEDULER_STATUS_INVALID'};
  }
  if (status.mode !== 'durable') return {ready: false, reason: 'SCHEDULER_MODE_LEGACY'};
  if (status.reason === 'SCHEDULER_LEASE_LOST') return {ready: false, reason: 'SCHEDULER_LEASE_LOST'};
  if (!status.writerLeaseHeld) return {ready: false, reason: 'SCHEDULER_LEASE_UNHELD'};
  if (!status.recoveryComplete) return {ready: false, reason: 'SCHEDULER_RECOVERING'};
  if (status.draining) return {ready: false, reason: 'SCHEDULER_DRAINING'};
  if (quarantined > Number(options.maxQuarantinedReady || 0)) {
    return {ready: false, reason: 'SCHEDULER_QUARANTINE_LIMIT'};
  }
  if (oldestDueAgeMs > Number(options.maxBacklogAgeMs || 0)) {
    return {ready: false, reason: 'SCHEDULER_BACKLOG_AGE_LIMIT'};
  }
  return {ready: true, reason: null};
}

function canonicalSchedulerStatus(status, options) {
  status = status || {};
  var counts = Object.assign({
    pending: 0, retryWait: 0, running: 0, quarantined: 0, dueBacklog: 0
  }, status.counts || {});
  var ages = Object.assign({oldestDueAgeMs: 0, nextEligibleAtMs: null}, status.ages || {});
  ['pending', 'retryWait', 'running', 'quarantined', 'dueBacklog'].forEach(function (name) {
    counts[name] = finiteNonNegative(counts[name]) ? Number(counts[name]) : NaN;
  });
  ages.oldestDueAgeMs = finiteNonNegative(ages.oldestDueAgeMs) ? Number(ages.oldestDueAgeMs) : NaN;
  if (ages.nextEligibleAtMs !== null && ages.nextEligibleAtMs !== undefined) {
    ages.nextEligibleAtMs = finiteNonNegative(ages.nextEligibleAtMs) ? Number(ages.nextEligibleAtMs) : NaN;
  } else ages.nextEligibleAtMs = null;
  var decision = evaluateReadiness(Object.assign({}, status, {counts: counts, ages: ages}), options);
  return Object.assign({}, status, {
    mode: status.mode || 'legacy',
    state: status.state || 'created',
    ready: decision.ready,
    reason: decision.reason,
    writerLeaseHeld: Boolean(status.writerLeaseHeld),
    leaseHeld: Boolean(status.leaseHeld === undefined ? status.writerLeaseHeld : status.leaseHeld),
    watermarkS: status.watermarkS === undefined ? null : status.watermarkS,
    dbOpen: Boolean(status.dbOpen),
    recoveryComplete: Boolean(status.recoveryComplete),
    draining: Boolean(status.draining),
    wakeTimerActive: Boolean(status.wakeTimerActive),
    pollTimerActive: Boolean(status.pollTimerActive),
    heartbeatTimerActive: Boolean(status.heartbeatTimerActive),
    reconcileTimerActive: Boolean(status.reconcileTimerActive),
    signalHandlerInstalled: Boolean(status.signalHandlerInstalled),
    counts: counts,
    ages: ages,
    metrics: Object.assign(newMetricState(), status.metrics || {})
  });
}

module.exports = {
  METRIC_FIELDS: METRIC_FIELDS,
  newMetricState: newMetricState,
  renderMetrics: renderMetrics,
  evaluateReadiness: evaluateReadiness,
  canonicalSchedulerStatus: canonicalSchedulerStatus
};
