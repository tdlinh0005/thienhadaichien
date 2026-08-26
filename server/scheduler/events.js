'use strict';

var crypto = require('node:crypto');
var G = require('../rules.js').G;

var SAFE_SECOND_MAX = 9007199254740;
var FLEET_REF_KEYS = ['arrivalAtS', 'fleetId', 'kind', 'launchAtS', 'mission', 'ownerAccountId', 'targetKey'];
var MISSILE_REF_KEYS = ['arrivalAtS', 'kind', 'launchAtS', 'mission', 'missileId', 'ownerAccountId', 'targetKey'];
var EXTERNAL_FLEET_MISSIONS = ['attack', 'transport', 'spy', 'hold'];

function fail(code) {
  var error = new Error(code);
  error.code = code;
  throw error;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameKeys(value, keys) {
  return isObject(value) &&
    Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
}

function positiveInt(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function safeSecond(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= SAFE_SECOND_MAX;
}

function canonicalTargetKey(value) {
  var match = typeof value === 'string' && /^([1-9][0-9]*):([1-9][0-9]*):([1-9][0-9]*)$/.exec(value);
  if (!match || !match.slice(1).every(function (part) { return positiveInt(Number(part)); })) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  return match.slice(1).map(function (part) { return String(Number(part)); }).join(':');
}

function validCoord(value) {
  return isObject(value) && positiveInt(value.g) && positiveInt(value.h) && positiveInt(value.p);
}

function stableFleetRef(ownerAccountId, fleet) {
  if (!positiveInt(ownerAccountId)) fail('OWNER_ACCOUNT_INVALID');
  if (!isObject(fleet)) fail('EXTERNAL_REF_INVALID');
  if (fleet.pha !== 'di' ||
      !positiveInt(fleet.id) || !safeSecond(fleet.diLuc) || !safeSecond(fleet.den_t) ||
      fleet.diLuc > fleet.den_t || !validCoord(fleet.den) ||
      EXTERNAL_FLEET_MISSIONS.indexOf(fleet.mission) < 0) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  return {
    kind: 'fleet',
    ownerAccountId: ownerAccountId,
    fleetId: fleet.id,
    launchAtS: fleet.diLuc,
    targetKey: canonicalTargetKey(G.tdKey(fleet.den)),
    arrivalAtS: fleet.den_t,
    mission: fleet.mission
  };
}

function stableMissileRef(ownerAccountId, missile) {
  if (!positiveInt(ownerAccountId)) fail('OWNER_ACCOUNT_INVALID');
  if (!isObject(missile)) fail('EXTERNAL_REF_INVALID');
  if (!positiveInt(missile.id) || !safeSecond(missile.khi) || !validCoord(missile.den)) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  var launchAtS;
  if (Object.prototype.hasOwnProperty.call(missile, 'diLuc')) {
    if (!safeSecond(missile.diLuc)) fail('PAYLOAD_VALUE_INVALID');
    launchAtS = missile.diLuc;
  } else {
    if (!validCoord(missile.tu)) fail('PAYLOAD_VALUE_INVALID');
    launchAtS = missile.khi - G.tgTenLua(Math.abs(missile.den.h - missile.tu.h));
    if (!safeSecond(launchAtS)) fail('PAYLOAD_VALUE_INVALID');
  }
  if (launchAtS > missile.khi) fail('PAYLOAD_VALUE_INVALID');
  return {
    kind: 'missile',
    ownerAccountId: ownerAccountId,
    missileId: missile.id,
    launchAtS: launchAtS,
    targetKey: canonicalTargetKey(G.tdKey(missile.den)),
    arrivalAtS: missile.khi,
    mission: 'missile'
  };
}

function normalizeFleetRef(ref, allowDeploy) {
  if (!sameKeys(ref, FLEET_REF_KEYS)) fail('PAYLOAD_VALUE_INVALID');
  if (!positiveInt(ref.ownerAccountId) || !positiveInt(ref.fleetId) ||
      !safeSecond(ref.launchAtS) || !safeSecond(ref.arrivalAtS) ||
      ref.launchAtS > ref.arrivalAtS || canonicalTargetKey(ref.targetKey) !== ref.targetKey) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  if (EXTERNAL_FLEET_MISSIONS.indexOf(ref.mission) < 0 &&
      !(allowDeploy && ref.mission === 'deploy')) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  return {
    kind: 'fleet',
    ownerAccountId: ref.ownerAccountId,
    fleetId: ref.fleetId,
    launchAtS: ref.launchAtS,
    targetKey: ref.targetKey,
    arrivalAtS: ref.arrivalAtS,
    mission: ref.mission
  };
}

function normalizeMissileRef(ref) {
  if (!sameKeys(ref, MISSILE_REF_KEYS)) fail('PAYLOAD_VALUE_INVALID');
  if (!positiveInt(ref.ownerAccountId) || !positiveInt(ref.missileId) ||
      !safeSecond(ref.launchAtS) || !safeSecond(ref.arrivalAtS) ||
      ref.launchAtS > ref.arrivalAtS || ref.mission !== 'missile' ||
      canonicalTargetKey(ref.targetKey) !== ref.targetKey) {
    fail('PAYLOAD_VALUE_INVALID');
  }
  return {
    kind: 'missile',
    ownerAccountId: ref.ownerAccountId,
    missileId: ref.missileId,
    launchAtS: ref.launchAtS,
    targetKey: ref.targetKey,
    arrivalAtS: ref.arrivalAtS,
    mission: 'missile'
  };
}

function normalizeExternalRef(ref, allowDeploy) {
  if (!isObject(ref)) fail('PAYLOAD_VALUE_INVALID');
  if (ref.kind === 'fleet') return normalizeFleetRef(ref, allowDeploy);
  if (ref.kind === 'missile') return normalizeMissileRef(ref);
  fail('PAYLOAD_VALUE_INVALID');
}

function sameExternalRef(left, right) {
  try {
    left = normalizeExternalRef(left, false);
    right = normalizeExternalRef(right, false);
  } catch (error) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableJson(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function derivePvpMatchId(ref, defenderAccountId) {
  ref = normalizeExternalRef(ref, false);
  if (ref.kind !== 'fleet' || ref.mission !== 'attack') fail('EXTERNAL_REF_INVALID');
  if (!positiveInt(defenderAccountId) || defenderAccountId === ref.ownerAccountId) {
    fail('DEFENDER_ACCOUNT_INVALID');
  }
  return crypto.createHash('sha256').update(stableJson({
    arrivalAtS: ref.arrivalAtS,
    defenderAccountId: defenderAccountId,
    fleetId: ref.fleetId,
    launchAtS: ref.launchAtS,
    ownerAccountId: ref.ownerAccountId,
    rule: 'pvp-v1',
    targetKey: ref.targetKey
  })).digest('hex');
}

function externalKey(ref) {
  ref = normalizeExternalRef(ref, false);
  if (ref.kind === 'fleet' && ref.mission === 'attack') fail('PAYLOAD_VALUE_INVALID');
  var entityId = ref.kind === 'fleet' ? ref.fleetId : ref.missileId;
  return ['external', ref.kind, ref.mission, ref.ownerAccountId, entityId,
    ref.targetKey, ref.launchAtS, ref.arrivalAtS].join(':');
}

function defenderFrom(ref, targetAccountForKey) {
  if (typeof targetAccountForKey !== 'function') fail('TARGET_ACCOUNT_FOR_KEY_INVALID');
  var defenderAccountId = targetAccountForKey(ref.targetKey);
  return positiveInt(defenderAccountId) && defenderAccountId !== ref.ownerAccountId ?
    defenderAccountId : null;
}

function jobFromRef(ref, targetAccountForKey) {
  ref = normalizeExternalRef(ref, true);
  if (ref.kind === 'fleet' && ref.mission === 'deploy') return null;
  var defenderAccountId = defenderFrom(ref, targetAccountForKey);
  if (!defenderAccountId) return null;
  if (ref.kind === 'fleet' && ref.mission === 'attack') {
    var matchId = derivePvpMatchId(ref, defenderAccountId);
    return {
      kind: 'PVP_RESOLVE',
      scheduledAtS: ref.arrivalAtS,
      priority: 50,
      idempotencyKey: 'pvp-resolve:' + matchId + ':' + ref.arrivalAtS,
      aggregateType: 'match',
      aggregateId: matchId,
      expectedRevision: null,
      sourceAccountId: ref.ownerAccountId,
      payload: {schemaVersion: 1, matchId: matchId, ref: ref},
      maxAttempts: 8
    };
  }
  return {
    kind: 'EXTERNAL_RESOLVE',
    scheduledAtS: ref.arrivalAtS,
    priority: ref.kind === 'missile' ? 51 : 50,
    idempotencyKey: externalKey(ref),
    aggregateType: ref.kind,
    aggregateId: String(ref.kind === 'fleet' ? ref.fleetId : ref.missileId),
    expectedRevision: null,
    sourceAccountId: ref.ownerAccountId,
    payload: {schemaVersion: 1, ref: ref},
    maxAttempts: 8
  };
}

function deriveExternalJobs(accountId, state, targetAccountForKey) {
  return G.phanLoaiTatCaSuKienNgoai(state, accountId, targetAccountForKey)
    .map(function (ref) { return jobFromRef(ref, targetAccountForKey); })
    .filter(function (job) { return !!job; });
}

function canonicalExternalStatus(kho, ref) {
  try {
    ref = normalizeExternalRef(ref, false);
  } catch (error) {
    return 'REF_MISMATCH';
  }
  var row = kho && kho.db && kho.db.prepare('SELECT state FROM dq WHERE tk=?').get(ref.ownerAccountId);
  if (!row || typeof row.state !== 'string') return 'ALREADY_ABSENT';
  var state;
  try { state = JSON.parse(row.state); } catch (error) { return 'REF_MISMATCH'; }
  var list = ref.kind === 'fleet' ? state.fleets : state.tenLua;
  if (!Array.isArray(list)) return 'ALREADY_ABSENT';
  var live = null;
  var entityId = ref.kind === 'fleet' ? ref.fleetId : ref.missileId;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === entityId) live = list[i];
  if (!live) return 'ALREADY_ABSENT';
  if (ref.kind === 'fleet' && live.pha !== 'di') return 'ALREADY_ABSENT';
  try {
    var liveRef = ref.kind === 'fleet' ?
      stableFleetRef(ref.ownerAccountId, live) :
      stableMissileRef(ref.ownerAccountId, live);
    return sameExternalRef(ref, liveRef) ? 'EXACT' : 'REF_MISMATCH';
  } catch (error) {
    return 'REF_MISMATCH';
  }
}

module.exports = {
  stableFleetRef: stableFleetRef,
  stableMissileRef: stableMissileRef,
  sameExternalRef: sameExternalRef,
  derivePvpMatchId: derivePvpMatchId,
  externalKey: externalKey,
  jobFromRef: jobFromRef,
  deriveExternalJobs: deriveExternalJobs,
  canonicalExternalStatus: canonicalExternalStatus
};
