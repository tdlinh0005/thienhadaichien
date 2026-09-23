/* Local-only durable scheduler quarantine operator CLI. */
'use strict';

var crypto = require('node:crypto');
var Kho = require('../server/db.js').Kho;
var TheGioi = require('../server/world.js').TheGioi;
var apDungMigrationScheduler = require('../server/scheduler/migrations.js').apDungMigrationScheduler;
var storeModule = require('../server/scheduler/store.js');
var SchedulerStore = storeModule.SchedulerStore;
var assertSchedulerOwnerId = storeModule.assertSchedulerOwnerId;
var GameAdvanceService = require('../server/scheduler/advance-service.js').GameAdvanceService;
var reducers = require('../server/scheduler/reducers.js');
var EventReducer = reducers.EventReducer;
var resolveCanonicalGlobalInCurrentUow = reducers.resolveCanonicalGlobalInCurrentUow;

var ACTIONS = new Set(['inspect', 'replay', 'resolve']);
var RESOLVE_REASONS = new Set([
  'MATCH_INVALIDATED', 'ENTITY_REMOVED', 'OPERATOR_CONFIRMED_INVALID'
]);
var JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(code) {
  var error = new Error(code);
  error.code = code;
  throw error;
}

function shortId(id) { return String(id).slice(0, 8); }

function assertReplayNonce(nonce) {
  if (typeof nonce !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(nonce)) {
    fail('SCHEDULER_CLI_INVALID_NONCE');
  }
  return nonce;
}

function parseCliArgs(argv) {
  var parsed = {};
  var names = new Set(['--db', '--action', '--job', '--nonce', '--reason']);
  if (!Array.isArray(argv)) fail('SCHEDULER_CLI_ARGUMENT_INVALID');
  for (var index = 0; index < argv.length; index += 2) {
    var name = argv[index];
    var value = argv[index + 1];
    if (!names.has(name) || value === undefined ||
        Object.prototype.hasOwnProperty.call(parsed, name)) {
      fail('SCHEDULER_CLI_ARGUMENT_INVALID');
    }
    parsed[name] = value;
  }
  if (typeof parsed['--db'] !== 'string' || parsed['--db'].length === 0) {
    fail('SCHEDULER_CLI_DB_REQUIRED');
  }
  if (!ACTIONS.has(parsed['--action'])) fail('SCHEDULER_CLI_ACTION_INVALID');
  if (typeof parsed['--job'] !== 'string' || !JOB_ID.test(parsed['--job'])) {
    fail('SCHEDULER_CLI_JOB_INVALID');
  }
  if (parsed['--action'] === 'replay') {
    assertReplayNonce(parsed['--nonce']);
    if (parsed['--reason'] !== undefined) fail('SCHEDULER_CLI_ARGUMENT_INVALID');
  }
  if (parsed['--action'] === 'resolve') {
    if (!RESOLVE_REASONS.has(parsed['--reason'])) fail('SCHEDULER_CLI_INVALID_REASON');
    if (parsed['--nonce'] !== undefined) fail('SCHEDULER_CLI_ARGUMENT_INVALID');
  }
  if (parsed['--action'] === 'inspect' &&
      (parsed['--nonce'] !== undefined || parsed['--reason'] !== undefined)) {
    fail('SCHEDULER_CLI_ARGUMENT_INVALID');
  }
  return {
    dbPath: parsed['--db'],
    action: parsed['--action'],
    jobId: parsed['--job'],
    nonce: parsed['--nonce'] || null,
    reason: parsed['--reason'] || null
  };
}

function replayQuarantined(store, leaseToken, jobId, nonce, nowMs) {
  var source;
  try {
    source = store.loadReplayableJob(leaseToken, jobId, nowMs);
  } catch (error) {
    if (error && (error.code === 'SCHEDULER_CLI_REPLAY_SOURCE_INVALID' ||
        error.message === 'SCHEDULER_CLI_REPLAY_SOURCE_INVALID')) {
      fail('SCHEDULER_CLI_REPLAY_SOURCE_INVALID');
    }
    throw error;
  }
  if (source.state !== 'QUARANTINED') fail('SCHEDULER_CLI_REPLAY_SOURCE_INVALID');
  var replacement = {
    kind: source.kind,
    scheduledAtS: Number(source.scheduled_at_s),
    priority: Number(source.priority),
    idempotencyKey: 'manual-replay:' + source.id + ':' + assertReplayNonce(nonce),
    aggregateType: source.aggregate_type,
    aggregateId: source.aggregate_id,
    expectedRevision: source.expected_revision === null ? null : Number(source.expected_revision),
    sourceAccountId: source.source_account_id === null ? null : Number(source.source_account_id),
    payload: source.payload,
    maxAttempts: Number(source.max_attempts),
    replayOfJobId: source.id
  };
  store.markDurableMutation(leaseToken, nowMs);
  var saved = store.schedule(leaseToken, replacement, nowMs);
  store.writeAudit(leaseToken, 'CLI_REPLAY', source.id, 'replacement-created', nowMs);
  return saved;
}

function safeCliCode(error) {
  var candidate = error && (error.code || error.message);
  return typeof candidate === 'string' && /^[A-Z0-9_]{3,80}$/.test(candidate) ?
    candidate : 'SCHEDULER_CLI_FAILED';
}

function runCli(argv, dependencies) {
  dependencies = dependencies || {};
  var parsed;
  var kho;
  var leaseToken;
  var store;
  var nowMs;
  var output;
  try {
    parsed = parseCliArgs(argv);
    kho = (dependencies.openKho || function (file) { return new Kho(file); })(parsed.dbPath);
    var clock = dependencies.clock || {nowMs: Date.now};
    nowMs = Number(clock.nowMs());
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('SCHEDULER_CLI_TIME_INVALID');
    apDungMigrationScheduler(kho, nowMs);
    store = new SchedulerStore(kho, clock);
    var world = new TheGioi(kho, {clock: clock, scheduler: store});
    var service = new GameAdvanceService({
      kho: kho, world: world, store: store, clock: clock
    });
    world.datAdvanceService(service);
    var reducer = new EventReducer({
      kho: kho, world: world, store: store, advanceService: service, clock: clock
    });
    var ownerId = assertSchedulerOwnerId((dependencies.makeOwnerId || crypto.randomUUID)());
    kho.trongGiaoDich(function () {
      leaseToken = store.acquireLease(ownerId, nowMs, 15_000);
      if (!leaseToken) fail('SCHEDULER_CLI_LEASE_UNAVAILABLE');
      if (parsed.action === 'inspect') {
        var inspected = store.inspectLogicalJob(leaseToken, parsed.jobId, nowMs);
        if (!inspected) fail('SCHEDULER_CLI_JOB_NOT_FOUND');
        var found = inspected.root;
        var child = inspected.activeChild;
        store.writeAudit(leaseToken, 'CLI_INSPECT', found.id, 'read', nowMs);
        output = {
          action: 'inspect',
          jobId: shortId(found.id),
          kind: found.kind,
          state: found.state,
          attempt: Number(found.attempt),
          scheduledAtS: Number(found.scheduled_at_s),
          activeReplacement: child ? shortId(child.id) : null,
          replacementState: child ? child.state : null
        };
      } else if (parsed.action === 'replay') {
        var saved = replayQuarantined(store, leaseToken, parsed.jobId, parsed.nonce, nowMs);
        output = {
          action: 'replay', jobId: shortId(parsed.jobId),
          replacement: shortId(saved.id), state: 'PENDING'
        };
      } else {
        var mutation = {
          leaseToken: leaseToken,
          remainingBudget: {value: 1},
          effectiveNowMs: nowMs
        };
        var resolution = world.trongMutationScheduler(mutation, function () {
          var resolved = resolveCanonicalGlobalInCurrentUow({
            store: store,
            reducer: reducer,
            mutation: mutation,
            leaseToken: leaseToken,
            nowMs: nowMs,
            lockMs: 15_000
          }, parsed.jobId, parsed.reason, {
            rootMustBeQuarantined: true,
            detail: {domainReason: 'OPERATOR_INVALIDATED', message: ''}
          });
          store.writeAudit(leaseToken, 'CLI_RESOLVE', parsed.jobId, parsed.reason, nowMs);
          return resolved;
        });
        output = {
          action: 'resolve', jobId: shortId(resolution.logicalRootId),
          state: 'CANCELLED', resolved: true,
          neutralization: resolution.neutralization
        };
      }
    }, {immediate: true});
    return {exitCode: 0, stdout: JSON.stringify(output) + '\n', stderr: ''};
  } catch (error) {
    return {exitCode: 1, stdout: '', stderr: safeCliCode(error) + '\n'};
  } finally {
    if (store && leaseToken && kho) {
      try {
        kho.trongGiaoDich(function () {
          store.releaseLease(leaseToken, nowMs);
        }, {immediate: true});
      } catch (releaseError) { void releaseError; }
    }
    if (kho) {
      try { kho.dong(); } catch (closeError) { void closeError; }
    }
  }
}

function main(argv, io) {
  io = io || process;
  var result = runCli(argv, io.dependencies);
  (result.exitCode === 0 ? io.stdout : io.stderr).write(
    result.exitCode === 0 ? result.stdout : result.stderr
  );
  return result.exitCode;
}

module.exports = {
  parseCliArgs: parseCliArgs,
  replayQuarantined: replayQuarantined,
  runCli: runCli,
  main: main
};

if (require.main === module) process.exitCode = main(process.argv.slice(2), process);
