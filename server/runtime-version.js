"use strict";

var MIN_NODE_SQLITE = Object.freeze({major: 22, minor: 5, patch: 0});

function parseConcreteSemver(version) {
  var match = typeof version === 'string' &&
    /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-|$)/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function supportsNodeSqlite(version) {
  var parsed = parseConcreteSemver(version);
  if (!parsed) return false;
  if (parsed.major !== MIN_NODE_SQLITE.major) return parsed.major > MIN_NODE_SQLITE.major;
  if (parsed.minor !== MIN_NODE_SQLITE.minor) return parsed.minor > MIN_NODE_SQLITE.minor;
  return parsed.patch >= MIN_NODE_SQLITE.patch;
}

function assertSupportedNode(version) {
  if (supportsNodeSqlite(version)) return true;
  var error = new Error('NODE_VERSION_UNSUPPORTED');
  error.code = 'NODE_VERSION_UNSUPPORTED';
  error.required = '>=22.5.0';
  error.actual = version;
  throw error;
}

module.exports = Object.freeze({
  supportsNodeSqlite: supportsNodeSqlite,
  assertSupportedNode: assertSupportedNode
});
