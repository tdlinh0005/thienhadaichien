'use strict';

var crypto = require('node:crypto');
var G = require('../rules.js').G;
var events = require('./events.js');

var SAFE_SECOND_MAX = 9007199254740;
var SNAPSHOT_KEYS = [
  'schemaVersion', 'matchId', 'arrivalAtS', 'seed', 'attacker', 'defender', 'supporters'
];
var ATTACKER_KEYS = ['accountId', 'revision', 'fleetId', 'tech', 'ships', 'linh', 'cargo'];
var DEFENDER_KEYS = [
  'accountId', 'revision', 'targetKey', 'tech', 'ships', 'def', 'linh', 'res', 'terrain'
];
var SUPPORTER_KEYS = ['accountId', 'revision', 'fleetId', 'tech', 'ships'];
var TECH_KEYS = ['weapon', 'shield', 'armor'];
var RESOURCE_KEYS = ['metal', 'crystal', 'deut', 'food'];

function fail() {
  var error = new Error('PAYLOAD_INTEGRITY');
  error.code = 'PAYLOAD_INTEGRITY';
  throw error;
}

function plain(value) {
  return value !== null && Object.prototype.toString.call(value) === '[object Object]';
}

function exactOrderedKeys(value, keys) {
  return plain(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
}

function safeNonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positive(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function safeSecond(value) {
  return safeNonnegative(value) && value <= SAFE_SECOND_MAX;
}

function canonicalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (plain(value)) {
    return Object.keys(value).sort().reduce(function (out, key) {
      out[key] = canonicalValue(value[key]);
      return out;
    }, {});
  }
  fail();
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
  return Object.freeze(value);
}

function seed32(keyHex, matchId, arrivalAtS, schemaVersion) {
  if (typeof keyHex !== 'string' || !/^[0-9a-f]{64}$/.test(keyHex) ||
      typeof matchId !== 'string' || matchId.length < 1 ||
      Buffer.byteLength(matchId, 'utf8') > 256 || !safeSecond(arrivalAtS) ||
      schemaVersion !== 1) fail();
  var digest = crypto.createHmac('sha256', Buffer.from(keyHex, 'hex'))
    .update(matchId + '|' + arrivalAtS + '|' + schemaVersion, 'utf8').digest();
  return digest.readUInt32BE(0);
}

function normalizeTech(value) {
  if (!plain(value) || Object.keys(value).sort().join(',') !== TECH_KEYS.slice().sort().join(',')) fail();
  return {
    weapon: safeNonnegative(value.weapon) ? value.weapon : fail(),
    shield: safeNonnegative(value.shield) ? value.shield : fail(),
    armor: safeNonnegative(value.armor) ? value.armor : fail()
  };
}

function normalizeUnits(value, definitions) {
  if (!plain(value)) fail();
  var allowed = new Set(definitions.map(function (entry) { return entry.id; }));
  return Object.keys(value).sort().reduce(function (out, key) {
    if (!allowed.has(key) || !safeNonnegative(value[key])) fail();
    if (value[key] > 0) out[key] = value[key];
    return out;
  }, {});
}

function normalizeResources(value) {
  if (!plain(value) || Object.keys(value).sort().join(',') !==
      RESOURCE_KEYS.slice().sort().join(',')) fail();
  return RESOURCE_KEYS.reduce(function (out, key) {
    var amount = value[key];
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) fail();
    out[key] = amount;
    return out;
  }, {});
}

function normalizeAttacker(value) {
  if (!plain(value)) fail();
  return {
    accountId: positive(value.accountId) ? value.accountId : fail(),
    revision: safeNonnegative(value.revision) ? value.revision : fail(),
    fleetId: positive(value.fleetId) ? value.fleetId : fail(),
    tech: normalizeTech(value.tech),
    ships: normalizeUnits(value.ships, G.SHIPS),
    linh: normalizeUnits(value.linh, G.BOBINH),
    cargo: normalizeResources(value.cargo)
  };
}

function normalizeDefender(value) {
  if (!plain(value) || typeof value.targetKey !== 'string' || value.targetKey.length < 1 ||
      !plain(value.terrain) || Object.keys(value.terrain).sort().join(',') !== 'loaiHT,thuDat' ||
      typeof value.terrain.thuDat !== 'number' || !Number.isFinite(value.terrain.thuDat) ||
      value.terrain.thuDat <= 0 || typeof value.terrain.loaiHT !== 'string' ||
      value.terrain.loaiHT.length < 1) fail();
  return {
    accountId: positive(value.accountId) ? value.accountId : fail(),
    revision: safeNonnegative(value.revision) ? value.revision : fail(),
    targetKey: value.targetKey,
    tech: normalizeTech(value.tech),
    ships: normalizeUnits(value.ships, G.SHIPS),
    def: normalizeUnits(value.def, G.DEFENSES),
    linh: normalizeUnits(value.linh, G.BOBINH),
    res: normalizeResources(value.res),
    terrain: {thuDat: value.terrain.thuDat, loaiHT: value.terrain.loaiHT}
  };
}

function normalizeSupporter(value) {
  if (!plain(value)) fail();
  return {
    accountId: positive(value.accountId) ? value.accountId : fail(),
    revision: safeNonnegative(value.revision) ? value.revision : fail(),
    fleetId: positive(value.fleetId) ? value.fleetId : fail(),
    tech: normalizeTech(value.tech),
    ships: normalizeUnits(value.ships, G.SHIPS)
  };
}

function validateJobBinding(executableJob) {
  var ref = executableJob && executableJob.payload && executableJob.payload.ref;
  var arrivalAtS = executableJob && Number(executableJob.scheduled_at_s);
  if (!executableJob || executableJob.kind !== 'PVP_RESOLVE' || !ref ||
      !safeSecond(arrivalAtS) || ref.kind !== 'fleet' || ref.mission !== 'attack' ||
      Number(ref.arrivalAtS) !== arrivalAtS ||
      typeof executableJob.payload.matchId !== 'string' ||
      !/^[0-9a-f]{64}$/.test(executableJob.payload.matchId)) fail();
  return {ref: ref, arrivalAtS: arrivalAtS};
}

function buildCombatSnapshotV1(input) {
  if (!plain(input) || Object.keys(input).sort().join(',') !==
      ['attacker', 'defender', 'executableJob', 'seedKeyHex', 'supporters'].join(',')) fail();
  var binding = validateJobBinding(input.executableJob);
  var attacker = normalizeAttacker(input.attacker);
  var defender = normalizeDefender(input.defender);
  var supporters = Array.isArray(input.supporters) ?
    input.supporters.map(normalizeSupporter).sort(function (left, right) {
      return left.accountId - right.accountId || left.fleetId - right.fleetId;
    }) : fail();
  if (attacker.accountId !== Number(binding.ref.ownerAccountId) ||
      attacker.fleetId !== Number(binding.ref.fleetId) ||
      defender.targetKey !== binding.ref.targetKey ||
      input.executableJob.payload.matchId !== events.derivePvpMatchId(binding.ref, defender.accountId)) fail();
  for (var index = 1; index < supporters.length; index += 1) {
    if (supporters[index - 1].accountId === supporters[index].accountId &&
        supporters[index - 1].fleetId === supporters[index].fleetId) fail();
  }
  var snapshot = {
    schemaVersion: 1,
    matchId: input.executableJob.payload.matchId,
    arrivalAtS: binding.arrivalAtS,
    seed: seed32(input.seedKeyHex, input.executableJob.payload.matchId, binding.arrivalAtS, 1),
    attacker: attacker,
    defender: defender,
    supporters: supporters
  };
  return deepFreeze(snapshot);
}

function validateCombatSnapshotV1(snapshot, context) {
  if (!plain(context) || !context.executableJob ||
      typeof context.seedKeyHex !== 'string') fail();
  var binding = validateJobBinding(context.executableJob);
  if (!exactOrderedKeys(snapshot, SNAPSHOT_KEYS) || snapshot.schemaVersion !== 1 ||
      snapshot.matchId !== context.executableJob.payload.matchId ||
      snapshot.arrivalAtS !== binding.arrivalAtS || !safeNonnegative(snapshot.seed) ||
      snapshot.seed > 0xffffffff || snapshot.seed !==
      seed32(context.seedKeyHex, snapshot.matchId, snapshot.arrivalAtS, 1) ||
      !exactOrderedKeys(snapshot.attacker, ATTACKER_KEYS) ||
      !exactOrderedKeys(snapshot.defender, DEFENDER_KEYS) || !Array.isArray(snapshot.supporters)) fail();
  var attacker = normalizeAttacker(snapshot.attacker);
  var defender = normalizeDefender(snapshot.defender);
  if (canonicalJson(attacker) !== canonicalJson(snapshot.attacker) ||
      canonicalJson(defender) !== canonicalJson(snapshot.defender) ||
      attacker.accountId !== Number(binding.ref.ownerAccountId) ||
      attacker.fleetId !== Number(binding.ref.fleetId) || defender.targetKey !== binding.ref.targetKey ||
      snapshot.matchId !== events.derivePvpMatchId(binding.ref, defender.accountId)) fail();
  var normalizedSupporters = snapshot.supporters.map(function (entry, index) {
    if (!exactOrderedKeys(entry, SUPPORTER_KEYS)) fail();
    var normalized = normalizeSupporter(entry);
    if (canonicalJson(normalized) !== canonicalJson(entry)) fail();
    if (index > 0) {
      var previous = snapshot.supporters[index - 1];
      if (previous.accountId > entry.accountId ||
          (previous.accountId === entry.accountId && previous.fleetId >= entry.fleetId)) fail();
    }
    return normalized;
  });
  if (canonicalJson(normalizedSupporters) !== canonicalJson(snapshot.supporters)) fail();
  if (context.canonicalTContext) {
    var canonical = context.canonicalTContext;
    if (!plain(canonical) || canonical.seedKeyHex !== context.seedKeyHex ||
        canonicalJson(canonical.snapshot) !== canonicalJson(snapshot)) fail();
  }
  return snapshot;
}

module.exports = {
  seed32: seed32,
  buildCombatSnapshotV1: buildCombatSnapshotV1,
  validateCombatSnapshotV1: validateCombatSnapshotV1
};
