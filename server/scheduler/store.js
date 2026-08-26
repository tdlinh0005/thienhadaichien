// BEGIN TASK2_CANONICAL_STORE
"use strict";

var crypto = require('node:crypto');
var validateCombatSnapshotV1 = require('./combat-snapshot.js').validateCombatSnapshotV1;
var canonicalExternalStatus = require('./events.js').canonicalExternalStatus;
var executableCapabilities = new WeakMap();
var OWNER_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var JOB_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
var UUID_V4_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
var UUID_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
var KIND_PRIORITY = Object.freeze({
  PVP_RESOLVE: 50,
  EXTERNAL_RESOLVE: 50,
  ACCOUNT_ADVANCE: 100
});
var ROW_NORMALIZER = Symbol.for('thienhadaichien.scheduler.rowNormalizer.v1');
var PAYLOAD_CURRENT = 1;
var PAYLOAD_PREVIOUS = 0;
function plainRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row) ||
      Object.getPrototypeOf(row) === Object.prototype) return row;
  return Object.assign({}, row);
}
function plainRows(rows) {
  return Array.isArray(rows) ? rows.map(plainRow) : rows;
}
function normalizePreparedRows(db) {
  if (!db || typeof db.prepare !== 'function' || db[ROW_NORMALIZER]) return;
  var originalPrepare = db.prepare.bind(db);
  db.prepare = function () {
    var statement = originalPrepare.apply(null, arguments);
    if (!statement || typeof statement !== 'object') return statement;
    return new Proxy(statement, {
      get: function (target, property, receiver) {
        if (property === 'get' && typeof target.get === 'function') {
          return function () { return plainRow(target.get.apply(target, arguments)); };
        }
        if (property === 'all' && typeof target.all === 'function') {
          return function () { return plainRows(target.all.apply(target, arguments)); };
        }
        var value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };
  Object.defineProperty(db, ROW_NORMALIZER, {value: true});
}
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
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype ||
        Reflect.ownKeys(value).length !== value.length + 1) {
      throw new Error('PAYLOAD_VALUE_INVALID');
    }
    var arrayResult = [];
    for (var index = 0; index < value.length; index++) {
      var arrayDescriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!arrayDescriptor ||
          !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value') ||
          arrayDescriptor.enumerable !== true) throw new Error('PAYLOAD_VALUE_INVALID');
      arrayResult.push(canonicalValue(arrayDescriptor.value));
    }
    return arrayResult;
  }
  if (value && typeof value === 'object' &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    var keys = Object.keys(value).sort();
    if (Reflect.ownKeys(value).length !== keys.length) throw new Error('PAYLOAD_VALUE_INVALID');
    return keys.reduce(function (result, key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.enumerable !== true) throw new Error('PAYLOAD_VALUE_INVALID');
      Object.defineProperty(result, key, {
        value: canonicalValue(descriptor.value),
        enumerable: true, writable: true, configurable: true
      });
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
function legacyDueRootExistsForLeaseHandoff(store, nowMs) {
  return store.schedulerMode() === 'legacy' && Boolean(store.db.prepare(
    "SELECT 1 AS ok FROM event_jobs WHERE replay_of_job_id IS NULL " +
    "AND kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
    "AND state IN ('PENDING','RETRY_WAIT','QUARANTINED') " +
    "AND scheduled_at_s<=? LIMIT 1"
  ).get(Math.floor(nowMs / 1000)));
}
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
function validateStoredApplication(row, executableJob, seedKeyHex, canonicalTContext) {
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
    var snapshot = validateOpaqueSnapshot(row.snapshot_json, row.snapshot_sha256);
    if (seedKeyHex !== null && seedKeyHex !== undefined) {
      validateCombatSnapshotV1(snapshot, {
        executableJob: executableJob,
        seedKeyHex: seedKeyHex,
        canonicalTContext: canonicalTContext || null
      });
    }
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
function attachApplicationFlag(store, execution, root) {
  var row = decorateLogicalGlobal(execution, root);
  row.has_application = Boolean(store.db.prepare(
    'SELECT 1 FROM event_applications WHERE job_id=? OR job_id=? LIMIT 1'
  ).get(execution.id, root.id));
  return row;
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
function retargetOrReviveSameKeyAccountAdvance(
  store, token, row, job, payloadJson, payloadHash, nowMs
) {
  if (!row || row.kind !== 'ACCOUNT_ADVANCE' || job.kind !== 'ACCOUNT_ADVANCE' ||
      job.expectedRevision < 0 || row.aggregate_type !== 'account' ||
      job.aggregateType !== 'account' || row.aggregate_id !== String(job.aggregateId) ||
      Number(row.expected_revision) !== Number(job.expectedRevision) ||
      Number(row.priority) !== Number(job.priority) ||
      Number(row.max_attempts) !== Number(job.maxAttempts) ||
      row.source_account_id !== null ||
      (job.sourceAccountId !== undefined && job.sourceAccountId !== null) ||
      row.replay_of_job_id !== null || job.replayOfJobId !== null && job.replayOfJobId !== undefined) {
    return null;
  }
  if (!job.payload || Number(job.payload.nextLocalAtS) !== Number(job.scheduledAtS)) {
    return null;
  }
  var persistedPayload, persisted;
  try {
    persistedPayload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
  } catch (error) {
    return null;
  }
  if (!persistedPayload ||
      Number(persistedPayload.nextLocalAtS) !== Number(row.scheduled_at_s)) {
    return null;
  }
  try {
    persisted = validateJob(executableInput(row, persistedPayload), {allowReconcile: true});
  } catch (error) {
    return null;
  }
  if (persisted.kind !== 'ACCOUNT_ADVANCE' ||
      persisted.aggregateType !== 'account' ||
      persisted.aggregateId !== String(job.aggregateId) ||
      Number(persisted.expectedRevision) !== Number(job.expectedRevision) ||
      persisted.idempotencyKey !== job.idempotencyKey ||
      Number(persisted.priority) !== Number(job.priority) ||
      Number(persisted.maxAttempts) !== Number(job.maxAttempts) ||
      persisted.sourceAccountId !== null || persisted.replayOfJobId !== null ||
      !persisted.payload || persisted.payload.reconcile === true ||
      Number(persisted.payload.accountId) !== Number(job.aggregateId)) {
    return null;
  }
  var revive = row.state === 'CANCELLED' && !store.db.prepare(
    'SELECT 1 FROM event_applications WHERE job_id=? LIMIT 1'
  ).get(row.id);
  var retarget = row.state === 'PENDING' && row.blocked_by_job_id === null;
  if (!retarget && !revive) return null;
  var changed = store.db.prepare(
    "UPDATE event_jobs SET scheduled_at_s=?,payload_json=?,payload_sha256=?," +
    "state='PENDING',attempt=0,checkpoint_revision=NULL,blocked_by_job_id=NULL," +
    "completed_at_ms=NULL,cancelled_at_ms=NULL,cancel_reason=NULL," +
    "quarantined_at_ms=NULL,retry_at_ms=NULL,error_code=NULL,error_message_safe=NULL," +
    "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL,updated_at_ms=? " +
    "WHERE id=? AND kind='ACCOUNT_ADVANCE' AND idempotency_key=? " +
    "AND aggregate_type='account' AND aggregate_id=? AND expected_revision=? " +
    "AND source_account_id IS NULL AND replay_of_job_id IS NULL " +
    "AND resolved_by_job_id IS NULL AND (state='PENDING' AND blocked_by_job_id IS NULL " +
    "OR state='CANCELLED' AND NOT EXISTS (SELECT 1 FROM event_applications WHERE job_id=event_jobs.id)) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(job.scheduledAtS, payloadJson, payloadHash, nowMs, row.id,
    job.idempotencyKey, String(job.aggregateId), job.expectedRevision,
    token.ownerId, token.generation, nowMs).changes;
  requiredMutation(store, token, nowMs, changed, 'JOB_INSERT_CONFLICT');
  return store.db.prepare('SELECT * FROM event_jobs WHERE id=?').get(row.id);
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
    if (!sameScheduledJob(old, normalized, payloadJson, payloadHash)) {
      var retargeted = retargetOrReviveSameKeyAccountAdvance(
        this, leaseToken, old, normalized, payloadJson, payloadHash, nowMs
      );
      if (retargeted) return retargeted;
      fail('IDEMPOTENCY_PAYLOAD_MISMATCH');
    }
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
      var retargeted = retargetOrReviveSameKeyAccountAdvance(
        this, leaseToken, old, normalized, payloadJson, payloadHash, nowMs
      );
      if (retargeted) return retargeted;
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
  if (!template || template.kind !== 'ACCOUNT_ADVANCE' ||
      template.expectedRevision !== -1 || template.priority !== 200 ||
      !template.payload || template.payload.reconcile !== true ||
      !Number.isSafeInteger(template.payload.reconcileRevision) ||
      template.payload.reconcileRevision < 0) {
    fail('RECONCILE_JOB_FORBIDDEN');
  }
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
  var claimed = this.claimForResolution(leaseToken, target.id, nowMs, lockMs, {
    allowQuarantined: options.allowQuarantined === true,
    allowFuturePending: options.allowFuturePending === true
  });
  return this.loadExecutableJob(leaseToken, claimed, nowMs);
};

// server/scheduler/store.js — constructor, lease, and operational time.
function SchedulerStore(kho, clock) {
  if (!kho || !kho.db || !clock || typeof clock.nowMs !== 'function') {
    throw new Error('SCHEDULER_STORE_CONTEXT_INVALID');
  }
  this.kho = kho;
  this.db = kho.db;
  normalizePreparedRows(this.db);
  this.clock = clock;
  executableCapabilities.set(this, new WeakSet());
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
  if (held.owner_id && held.owner_id !== ownerId && Number(held.expires_at_ms) > nowMs &&
      legacyDueRootExistsForLeaseHandoff(this, nowMs)) {
    var handed = this.db.prepare(
      "UPDATE scheduler_lease SET owner_id=?,generation=generation+1,expires_at_ms=?,heartbeat_at_ms=? " +
      "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?"
    ).run(ownerId, nowMs + leaseMs, nowMs, held.owner_id,
      Number(held.generation), nowMs).changes;
    if (handed) {
      var handedRow = this.db.prepare(
        "SELECT generation FROM scheduler_lease WHERE lease_name='global-writer' AND owner_id=?"
      ).get(ownerId);
      return {ownerId: ownerId, generation: Number(handedRow.generation)};
    }
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
SchedulerStore.prototype.claimRecoveredRetryForCutover = function (
  token, jobId, cutoverAtS, nowMs, lockMs
) {
  assertSchedulerJobId(jobId);
  if (!safeSecond(cutoverAtS) || !Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(lockMs) || lockMs < 1) {
    fail('CUTOVER_RECOVERY_CLAIM_INVALID');
  }
  this.assertLiveLease(token, nowMs);
  var row = this.db.prepare(
    "WITH live_lease AS (SELECT 1 FROM scheduler_lease " +
    "WHERE lease_name='global-writer' AND owner_id=? AND generation=? AND expires_at_ms>?) " +
    "UPDATE event_jobs SET state='RUNNING',locked_by=?,locked_generation=?," +
    "locked_until_ms=?,updated_at_ms=? WHERE id=? AND kind IN " +
    "('PVP_RESOLVE','EXTERNAL_RESOLVE') AND state='RETRY_WAIT' AND attempt>=1 " +
    "AND scheduled_at_s<=? AND retry_at_ms>? AND blocked_by_job_id IS NULL " +
    "AND locked_by IS NULL AND locked_generation IS NULL AND locked_until_ms IS NULL " +
    "AND EXISTS (SELECT 1 FROM live_lease) RETURNING *"
  ).get(
    token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs + lockMs, nowMs,
    jobId, cutoverAtS, nowMs
  );
  if (!row) mutationConflict(this, token, nowMs, 'CUTOVER_RECOVERY_CLAIM_INVALID');
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
SchedulerStore.prototype.listExpiredRunningForRecovery = function (token, nowMs) {
  this.assertLiveLease(token, nowMs);
  return this.db.prepare(
    "SELECT * FROM event_jobs WHERE state='RUNNING' AND " +
    "(locked_generation<? OR locked_until_ms<=?) " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
  ).all(token.generation, nowMs);
};
SchedulerStore.prototype.listOwnedRunningForRecovery = function (token, nowMs) {
  this.assertLiveLease(token, nowMs);
  return this.db.prepare(
    "SELECT * FROM event_jobs WHERE state='RUNNING' AND locked_by=? " +
    "AND locked_generation=? AND locked_until_ms>? AND blocked_by_job_id IS NULL " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
  ).all(token.ownerId, token.generation, nowMs);
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
  var canonicalExecutable = Object.freeze(loaded);
  executableCapabilities.get(this).add(canonicalExecutable);
  return canonicalExecutable;
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
SchedulerStore.prototype.assertCanonicalExecutable = function (token, executableJob, nowMs) {
  var capabilities = executableCapabilities.get(this);
  if (!capabilities || !capabilities.has(executableJob)) throw payloadIntegrity();
  return this.loadExecutableJob(token, executableJob, nowMs);
};
SchedulerStore.prototype.getOrCreateCombatSeedKey = function (token, nowMs) {
  if (this.kho.transactionDepth < 1) {
    var uowError = new Error('SCHEDULER_UOW_REQUIRED');
    uowError.code = 'SCHEDULER_UOW_REQUIRED';
    throw uowError;
  }
  var candidate = crypto.randomBytes(32).toString('hex');
  var inserted = this.db.prepare(
    "INSERT INTO cauhinh(k,v) SELECT 'combat_seed_key_v1',? " +
    "WHERE EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    'AND owner_id=? AND generation=? AND expires_at_ms>?) ' +
    'ON CONFLICT(k) DO NOTHING'
  ).run(candidate, token.ownerId, token.generation, nowMs);
  optionalMutation(this, token, nowMs, inserted.changes);
  var key = this.kho.cauhinh('combat_seed_key_v1');
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key)) {
    var keyError = new Error('COMBAT_SEED_KEY_INVALID');
    keyError.code = 'COMBAT_SEED_KEY_INVALID';
    throw keyError;
  }
  this.assertLiveLease(token, nowMs);
  return key;
};
SchedulerStore.prototype.hasCommittedApplication = function (token, executableJob, nowMs) {
  this.assertLiveLease(token, nowMs);
  var persisted = this.assertCanonicalExecutable(token, executableJob, nowMs);
  var row = this.db.prepare(
    'SELECT * FROM event_applications WHERE idempotency_key=?'
  ).get(persisted.idempotency_key);
  if (!row) return false;
  validateStoredApplication(row, persisted, this.kho.cauhinh('combat_seed_key_v1'), null);
  return true;
};
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
  var seedKeyHex = this.kho.cauhinh('combat_seed_key_v1');
  validateStoredApplication(candidate, persisted, seedKeyHex, canonicalTContext || null);
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
  validateStoredApplication(created, persisted, seedKeyHex, null);
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
SchedulerStore.prototype.quarantineClaimedRaw = function (token, raw, failure, nowMs) {
  this.assertLiveLease(token, nowMs);
  if (!raw || typeof raw.id !== 'string') throw payloadIntegrity();
  assertSchedulerJobId(raw.id);
  var code = safeErrorMessage(normalizeSchedulerErrorCode(failure) || 'SCHEDULER_JOB_FAILED');
  var message = safeErrorMessage(failure && failure.message);
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='QUARANTINED',retry_at_ms=NULL," +
    "error_code=?,error_message_safe=?,quarantined_at_ms=?,updated_at_ms=?," +
    "locked_by=NULL,locked_generation=NULL,locked_until_ms=NULL WHERE id=? " +
    "AND state='RUNNING' AND locked_by=? AND locked_generation=? AND locked_until_ms>? " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(code, message, nowMs, nowMs, raw.id, token.ownerId,
    token.generation, nowMs, token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'CLAIM_SETTLEMENT_CONFLICT');
  return this.getById(raw.id);
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
  if (!Number.isSafeInteger(Number(targetS)) || Number(targetS) < 0) {
    throw new Error('BARRIER_TARGET_INVALID');
  }
  var children = this.assertReplayLineage(token, nowMs);
  return this.db.prepare(
    "SELECT * FROM event_jobs WHERE replay_of_job_id IS NULL " +
    "AND kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
    "AND state NOT IN ('COMPLETED','CANCELLED') AND scheduled_at_s<=? " +
    "ORDER BY scheduled_at_s,priority,sequence,id"
    ).all(targetS).map(function (root) {
      var execution = children.has(root.id) ? this.getById(children.get(root.id)) : root;
      return attachApplicationFlag(this, execution, root);
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
  if (key !== null) {
    var existingSameKey = this.getByIdempotencyKey(key);
    if (existingSameKey && existingSameKey.kind === 'ACCOUNT_ADVANCE' &&
        existingSameKey.state === 'PENDING' &&
        existingSameKey.blocked_by_job_id === null) {
      var retargetedSameKey = this.retargetOwnedPendingAccountAdvanceForCommand(
        token, accountId, revision, nextLocalAtS, nowMs
      );
      return this.getById(retargetedSameKey.id);
    }
  }
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
SchedulerStore.prototype.retargetOwnedPendingAccountAdvanceForCommand = function (
  token, accountId, revision, targetS, nowMs
) {
  this.assertLiveLease(token, nowMs);
  if (!Number.isSafeInteger(accountId) || accountId < 1 ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      !Number.isSafeInteger(targetS) || targetS < 0 ||
      !Number.isSafeInteger(nowMs)) {
    fail('ACCOUNT_ADVANCE_RETARGET_INVALID');
  }
  var key = 'account-advance:' + accountId + ':' + revision;
  var row = this.getByIdempotencyKey(key);
  if (!row) return null;
  var validated;
  try {
    validated = validateJob(executableInput(
      row, parseCanonicalBoundedJson(row.payload_json, row.payload_sha256)
    ), {
      allowReconcile: true
    });
  } catch (error) { throw payloadIntegrity(); }
  if (validated.kind !== 'ACCOUNT_ADVANCE' ||
      validated.aggregateType !== 'account' ||
      validated.aggregateId !== String(accountId) ||
      Number(validated.expectedRevision) !== revision ||
      validated.idempotencyKey !== key ||
      Number(validated.priority) !== 100 ||
      Number(validated.maxAttempts) !== 8 ||
      validated.replayOfJobId !== null ||
      validated.sourceAccountId !== null ||
      !validated.payload ||
      Number(validated.payload.accountId) !== accountId) {
    throw payloadIntegrity();
  }
  if (row.state !== 'PENDING' || row.blocked_by_job_id !== null) {
    mutationConflict(this, token, nowMs, 'ACCOUNT_ADVANCE_RETARGET_CONFLICT');
  }
  var normalized = validateJob({
    kind: 'ACCOUNT_ADVANCE',
    scheduledAtS: targetS,
    priority: 100,
    idempotencyKey: key,
    aggregateType: 'account',
    aggregateId: String(accountId),
    expectedRevision: revision,
    sourceAccountId: null,
    maxAttempts: Number(row.max_attempts),
    replayOfJobId: null,
    payload: {schemaVersion: 1, accountId: accountId, nextLocalAtS: targetS}
  }, {allowReconcile: true});
  var payloadJson = canonicalJson(normalized.payload);
  var payloadHash = sha256(payloadJson);
  var changed = this.db.prepare(
    "UPDATE event_jobs SET scheduled_at_s=?,payload_json=?,payload_sha256=?," +
    "updated_at_ms=? WHERE id=? AND kind='ACCOUNT_ADVANCE' " +
    "AND aggregate_type='account' AND aggregate_id=? AND expected_revision=? " +
    "AND idempotency_key=? AND state='PENDING' AND blocked_by_job_id IS NULL " +
    "AND (locked_by IS NULL OR (locked_by=? AND locked_generation=? AND locked_until_ms>?)) " +
    "AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?)"
  ).run(targetS, payloadJson, payloadHash, nowMs, row.id, String(accountId),
    revision, key, token.ownerId, token.generation, nowMs,
    token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'ACCOUNT_ADVANCE_RETARGET_CONFLICT');
  return Object.freeze({id: row.id, accountId: accountId,
    revision: revision, scheduledAtS: targetS});
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
  if (!dependency) {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_INVALID');
  }
  var blockedScheduledAtS = Math.min(
    Number(job.scheduled_at_s), Number(dependency.scheduled_at_s)
  );
  var blockedNormalized = validateJob({
    kind: 'ACCOUNT_ADVANCE',
    scheduledAtS: blockedScheduledAtS,
    priority: Number(job.priority),
    idempotencyKey: job.idempotency_key,
    aggregateType: job.aggregate_type,
    aggregateId: job.aggregate_id,
    expectedRevision: Number(job.expected_revision),
    sourceAccountId: null,
    maxAttempts: Number(job.max_attempts),
    replayOfJobId: null,
    payload: {schemaVersion: 1, accountId: Number(job.aggregate_id),
      nextLocalAtS: blockedScheduledAtS}
  }, {allowReconcile: true});
  var blockedPayloadJson = canonicalJson(blockedNormalized.payload);
  var blockedPayloadHash = sha256(blockedPayloadJson);
  var changed = this.db.prepare(
    "UPDATE event_jobs SET state='PENDING',checkpoint_revision=?,scheduled_at_s=?," +
    "payload_json=?,payload_sha256=?,blocked_by_job_id=?," +
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
  ).run(checkpointRevision, blockedScheduledAtS, blockedPayloadJson, blockedPayloadHash,
    blockedByJobId, nowMs, job.id, token.ownerId,
    token.generation, nowMs, blockedByJobId, Number(job.aggregate_id), checkpointRevision,
    token.ownerId, token.generation, nowMs).changes;
  if (changed !== 1) mutationConflict(this, token, nowMs, 'ACCOUNT_ADVANCE_BLOCK_CONFLICT');
  return this.getById(job.id);
};
SchedulerStore.prototype.validateBlockedAccountAdvanceForDependency = function (
  token, accountId, revision, blockedByJobId, targetS, nowMs
) {
  this.assertLiveLease(token, nowMs);
  assertSchedulerJobId(blockedByJobId);
  if (!Number.isSafeInteger(accountId) || accountId < 1 ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      !Number.isSafeInteger(targetS) || targetS < 0) {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
  }
  var key;
  var row = this.db.prepare(
    "SELECT * FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND state='PENDING' " +
    "AND aggregate_type='account' AND aggregate_id=? AND scheduled_at_s=? " +
    "AND checkpoint_revision=? " +
    "AND blocked_by_job_id=? AND source_account_id IS NULL " +
    "AND replay_of_job_id IS NULL AND locked_by IS NULL " +
    "AND locked_generation IS NULL AND locked_until_ms IS NULL " +
    "AND retry_at_ms IS NULL AND quarantined_at_ms IS NULL " +
    "AND error_code IS NULL AND error_message_safe IS NULL " +
    "AND completed_at_ms IS NULL AND cancelled_at_ms IS NULL " +
    "AND cancel_reason IS NULL AND resolved_by_job_id IS NULL LIMIT 1"
  ).get(String(accountId), targetS, revision, blockedByJobId);
  var dependency = this.db.prepare(
    "SELECT * FROM event_jobs WHERE id=? AND kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
    "AND replay_of_job_id IS NULL AND source_account_id=? " +
    "AND state IN ('PENDING','RUNNING','RETRY_WAIT','QUARANTINED')"
  ).get(blockedByJobId, accountId);
  if (!row || !dependency) {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
  }
  if (!Number.isSafeInteger(Number(row.expected_revision)) ||
      Number(row.expected_revision) < 0) {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
  }
  key = 'account-advance:' + accountId + ':' + Number(row.expected_revision);
  var accountPayload, accountJob, dependencyPayload, dependencyJob;
  try {
    accountPayload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
    accountJob = validateJob(executableInput(row, accountPayload), {allowReconcile: true});
    dependencyPayload = parseCanonicalBoundedJson(
      dependency.payload_json, dependency.payload_sha256
    );
    dependencyJob = validateJob(executableInput(dependency, dependencyPayload), {
      allowReconcile: true
    });
  } catch (error) {
    throw payloadIntegrity();
  }
  if (accountJob.kind !== 'ACCOUNT_ADVANCE' ||
      accountJob.aggregateType !== 'account' ||
      accountJob.aggregateId !== String(accountId) ||
      accountJob.expectedRevision !== Number(row.expected_revision) ||
      accountJob.sourceAccountId !== null ||
      accountJob.replayOfJobId !== null ||
      accountJob.idempotencyKey !== key ||
      accountJob.priority !== 100 ||
      accountJob.maxAttempts !== 8 ||
      !accountPayload ||
      accountPayload.schemaVersion !== 1 ||
      accountPayload.accountId !== accountId ||
      accountPayload.nextLocalAtS !== targetS ||
      dependencyJob.idempotencyKey !== dependency.idempotency_key ||
      dependencyJob.sourceAccountId !== accountId ||
      dependencyJob.replayOfJobId !== null ||
      !dependencyPayload || !dependencyPayload.ref ||
      dependencyPayload.ref.ownerAccountId !== accountId ||
      Number(row.scheduled_at_s) > Number(dependency.scheduled_at_s) ||
      dependency.blocked_by_job_id !== null ||
      dependency.completed_at_ms !== null ||
      dependency.cancelled_at_ms !== null ||
      dependency.cancel_reason !== null ||
      dependency.resolved_by_job_id !== null) {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
  }
  if (dependency.state === 'RUNNING') {
    if (typeof dependency.locked_by !== 'string' ||
        !Number.isSafeInteger(Number(dependency.locked_generation)) ||
        !Number.isSafeInteger(Number(dependency.locked_until_ms)) ||
        Number(dependency.locked_until_ms) <= nowMs ||
        dependency.retry_at_ms !== null ||
        dependency.quarantined_at_ms !== null) {
      throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
    }
  } else if (dependency.locked_by !== null || dependency.locked_generation !== null ||
      dependency.locked_until_ms !== null) {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
  } else if (dependency.state === 'PENDING') {
    if (dependency.retry_at_ms !== null || dependency.quarantined_at_ms !== null ||
        dependency.error_code !== null || dependency.error_message_safe !== null) {
      throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
    }
  } else if (dependency.state === 'RETRY_WAIT') {
    if (!Number.isSafeInteger(Number(dependency.retry_at_ms)) ||
        dependency.quarantined_at_ms !== null) {
      throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
    }
  } else if (dependency.state === 'QUARANTINED') {
    if (!Number.isSafeInteger(Number(dependency.quarantined_at_ms)) ||
        typeof dependency.error_code !== 'string') {
      throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
    }
  } else {
    throw new Error('ACCOUNT_ADVANCE_DEPENDENCY_CONFLICT');
  }
  return Object.freeze({id: row.id, accountId: accountId, revision: revision,
    scheduledAtS: Number(row.scheduled_at_s), blockedByJobId: blockedByJobId});
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
  if (!Number.isSafeInteger(Number(accountId)) || Number(accountId) < 1) {
    throw new Error('ACCOUNT_ID_INVALID');
  }
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
      return Object.freeze(Object.assign(attachApplicationFlag(this, execution, root), {
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
  try {
    payload = parseCanonicalBoundedJson(row.payload_json, row.payload_sha256);
    validateJob(executableInput(row, payload), {allowReconcile: true});
  } catch (error) { return true; }
  return !(Number(row.expected_revision) === -1 && payload.reconcile === true &&
    Number(payload.reconcileRevision) === Number(current.revision) &&
    Number(row.scheduled_at_s) === Number(normalized.scheduledAtS) &&
    Number(row.priority) === 200 &&
    (row.checkpoint_revision === null || row.checkpoint_revision === undefined));
};
SchedulerStore.prototype.wouldReplaceAccountAdvanceWithNoWake = function (accountId) {
  if (!Number.isSafeInteger(Number(accountId)) || Number(accountId) < 1) {
    throw new Error('ACCOUNT_ID_INVALID');
  }
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
  if (!(liveKeys instanceof Set)) throw new Error('RECONCILE_LIVE_KEYS_INVALID');
  return this.listDerivedJobsForAccount(token, accountId, nowMs)
    .some(function (row) {
      return row.state !== 'RUNNING' && !liveKeys.has(row.logical_key) &&
        !(protectedRecoveryRootIds && protectedRecoveryRootIds.has(row.logical_root_id));
    });
};
SchedulerStore.prototype.canonicalExactLogicalKeysForAccount = function (
  leaseToken, accountId, nowMs
) {
  var keys = new Set();
  this.listDerivedJobsForAccount(leaseToken, accountId, nowMs)
    .forEach(function (job) {
      if (canonicalExternalStatus(this.kho, job.canonical_ref) === 'EXACT') {
        keys.add(job.logical_key);
      }
    }, this);
  return keys;
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
SchedulerStore.prototype.listLogicalGlobalsReferencingAccount = function (
  token, accountId, targetKeys, nowMs
) {
  this.assertLiveLease(token, nowMs);
  if (!Number.isSafeInteger(accountId) || accountId < 1 || !(targetKeys instanceof Set)) {
    throw new Error('DELETED_ACCOUNT_REFERENCE_INVALID');
  }
  var children = this.assertReplayLineage(token, nowMs);
  return this.db.prepare(
    "SELECT * FROM event_jobs WHERE replay_of_job_id IS NULL AND kind IN " +
    "('PVP_RESOLVE','EXTERNAL_RESOLVE') ORDER BY scheduled_at_s,priority,sequence,id"
  ).all().map(function (root) {
    var child = children.has(root.id) ? this.getById(children.get(root.id)) : null;
    var execution = child || root;
    var payload = parseCanonicalBoundedJson(execution.payload_json, execution.payload_sha256);
    var checked;
    try { checked = validateJob(executableInput(execution, payload), {allowReconcile: true}); }
    catch (error) { throw payloadIntegrity(); }
    if (!checked.payload || !checked.payload.ref) throw payloadIntegrity();
    var ref = Object.freeze(checked.payload.ref);
    var source = Number(root.source_account_id) === accountId;
    var target = targetKeys.has(ref.targetKey);
    if (!source && !target) return null;
    return Object.freeze({root: Object.freeze(root), activeChild: child ? Object.freeze(child) : null,
      canonicalRef: ref, referencedAsSource: source, referencedAsTarget: target});
  }, this).filter(Boolean);
};
SchedulerStore.prototype.prepareDeletedAccountJobResolution = function (
  token, accountId, targetKeys, nowMs
) {
  this.assertLiveLease(token, nowMs);
  if (this.db.prepare(
    "SELECT 1 FROM event_jobs WHERE kind='ACCOUNT_ADVANCE' AND aggregate_id=? AND state='RUNNING' LIMIT 1"
  )
    .get(String(accountId))) throw new Error('DELETED_ACCOUNT_RUNNING_ACTIVE');
  var localCancelled = this.cancelAccountAdvancesForDeletion(token, accountId, nowMs);
  var invalidatable = [], protectedReplay = [];
  this.listLogicalGlobalsReferencingAccount(token, accountId, targetKeys, nowMs).forEach(function (entry) {
    if (entry.activeChild) { protectedReplay.push(entry); return; }
    if (entry.root.state === 'PENDING' || entry.root.state === 'RETRY_WAIT' || entry.root.state === 'QUARANTINED') {
      invalidatable.push(entry);
    }
  });
  return {localCancelled: localCancelled, invalidatable: invalidatable, protectedReplay: protectedReplay};
};
SchedulerStore.prototype.invalidateGlobalJob = function (
  token, rootJobId, reason, effectiveAtS, nowMs, evidence
) {
  this.assertLiveLease(token, nowMs);
  var inspected = this.inspectLogicalJob(token, rootJobId, nowMs);
  if (!inspected || inspected.root.id !== rootJobId || inspected.root.kind === 'ACCOUNT_ADVANCE') {
    throw new Error('GLOBAL_INVALIDATION_REQUIRED');
  }
  var root = inspected.root;
  if (inspected.activeChild) throw new Error('REPLAY_REPLACEMENT_ACTIVE');
  if (Number(effectiveAtS) !== Number(root.scheduled_at_s)) throw new Error('INVALIDATION_EFFECTIVE_TIME_INVALID');
  if (['PENDING', 'RETRY_WAIT', 'QUARANTINED'].indexOf(root.state) < 0) {
    throw new Error('GLOBAL_INVALIDATION_STATE_INVALID');
  }
  var payload = parseCanonicalBoundedJson(root.payload_json, root.payload_sha256), checked;
  try { checked = validateJob(executableInput(root, payload), {allowReconcile: true}); }
  catch (error) { throw payloadIntegrity(); }
  var result;
  if (reason === 'EXACT') {
    if (!evidence || typeof evidence.targetRemovedKey !== 'string') {
      throw new Error('CANONICAL_NEUTRALIZATION_REQUIRED');
    }
    if (!checked.payload.ref || evidence.targetRemovedKey !== checked.payload.ref.targetKey) {
      throw new Error('TARGET_REMOVAL_EVIDENCE_INVALID');
    }
    result = {code: 'ENTITY_REMOVED'};
  } else {
    if (reason !== 'ALREADY_ABSENT' && reason !== 'REF_MISMATCH') throw new Error('CANONICAL_NEUTRALIZATION_REQUIRED');
    result = {code: 'ENTITY_REMOVED', invalidation: 'canonical', neutralization: reason};
  }
  var claim = this.db.prepare(
    "UPDATE event_jobs SET state='RUNNING',locked_by=?,locked_generation=?,locked_until_ms=?,updated_at_ms=? " +
    "WHERE id=? AND replay_of_job_id IS NULL AND state IN ('PENDING','RETRY_WAIT','QUARANTINED') " +
    "AND blocked_by_job_id IS NULL AND EXISTS (SELECT 1 FROM scheduler_lease WHERE lease_name='global-writer' " +
    "AND owner_id=? AND generation=? AND expires_at_ms>?) RETURNING *"
  ).get(token.ownerId, token.generation, nowMs + 15000, nowMs, root.id,
    token.ownerId, token.generation, nowMs);
  if (!claim) {
    if (!this.leaseTokenIsLive(token, nowMs)) fail('LEASE_LOST');
    throw new Error('GLOBAL_INVALIDATION_CLAIM_INVALID');
  }
  this.markDurableMutation(token, nowMs);
  var executable = this.loadExecutableJob(token, claim, nowMs);
  this.insertApplication(token, executable, {effectiveAtS: effectiveAtS, result: result}, nowMs);
  this.finishResolved(token, executable, 'CANCELLED', 'ENTITY_REMOVED', nowMs);
  return this.loadImmutableJobForAudit(root.id);
};
SchedulerStore.prototype.sweepDeletedAccountOrphans = function (token, nowMs) {
  var self = this;
  function run() {
    self.assertLiveLease(token, nowMs);
    var result = {local: 0, global: 0, protectedReplay: 0, running: 0};
    var locals = self.db.prepare(
      "SELECT j.aggregate_id FROM event_jobs j LEFT JOIN dq d ON d.tk=CAST(j.aggregate_id AS INTEGER) " +
      "WHERE j.kind='ACCOUNT_ADVANCE' AND j.state IN ('PENDING','RETRY_WAIT') AND d.tk IS NULL GROUP BY j.aggregate_id"
    ).all();
    locals.forEach(function (row) {
      result.local += self.cancelAccountAdvancesForDeletion(token, Number(row.aggregate_id), nowMs);
    });
    var roots = self.db.prepare(
      "SELECT DISTINCT source_account_id AS accountId FROM event_jobs j LEFT JOIN dq d ON d.tk=j.source_account_id " +
      "WHERE j.replay_of_job_id IS NULL AND j.kind IN ('PVP_RESOLVE','EXTERNAL_RESOLVE') " +
      "AND j.source_account_id IS NOT NULL AND d.tk IS NULL"
    ).all();
    roots.forEach(function (row) {
      self.listLogicalGlobalsReferencingAccount(token, Number(row.accountId), new Set(), nowMs)
        .forEach(function (entry) {
        if (!entry.referencedAsSource) return;
        if (entry.activeChild) { result.protectedReplay++; return; }
        if (entry.root.state === 'RUNNING') { result.running++; return; }
        if (['PENDING','RETRY_WAIT','QUARANTINED'].indexOf(entry.root.state) < 0) return;
        self.invalidateGlobalJob(token, entry.root.id, 'ALREADY_ABSENT', Number(entry.root.scheduled_at_s), nowMs);
        result.global++;
      });
    });
    self.assertLiveLease(token, nowMs);
    return result;
  }
  return this.kho.transactionDepth > 0 ? run() : this.kho.trongGiaoDich(run, {immediate: true});
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
