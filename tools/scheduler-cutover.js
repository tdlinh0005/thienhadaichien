"use strict";

var fs = require('fs');
var crypto = require('node:crypto');
var Kho = require('../server/db.js').Kho;
var cutover = require('../server/scheduler/cutover.js');
var runMaintenanceCutover = cutover.runMaintenanceCutover;
var rollbackDurableScheduler = cutover.rollbackDurableScheduler;

function codedError(code) {
  var error = new Error(code);
  error.code = code;
  return error;
}

function sanitizeErrorCode(error) {
  var code = error && typeof error.code === 'string' ? error.code : null;
  if (!code && error && typeof error.message === 'string') code = error.message;
  return /^[A-Z][A-Z0-9_]{0,80}$/.test(code || '') ? code : 'SCHEDULER_CUTOVER_FAILED';
}

function parseArgs(argv) {
  argv = Array.isArray(argv) ? argv : [];
  if (argv.length !== 4 || argv[0] !== '--db' || argv[2] !== '--action' ||
      ['cutover', 'rollback'].indexOf(argv[3]) < 0 ||
      typeof argv[1] !== 'string' || argv[1].length === 0) {
    throw codedError('SCHEDULER_CLI_ARGS_INVALID');
  }
  if (fs.existsSync(argv[1]) && fs.statSync(argv[1]).isDirectory()) {
    throw codedError('SCHEDULER_CLI_ARGS_INVALID');
  }
  return {dbPath: argv[1], action: argv[3]};
}

function defaultClock() {
  return {nowMs: function () { return Date.now(); }};
}

function defaultOwnerId() {
  return crypto.randomUUID();
}

async function runCli(argv, options) {
  options = options || {};
  var parsed;
  var kho = null;
  var opened = false;
  var stdout = '';
  var stderr = '';
  var exitCode = 0;
  var primaryError = null;
  try {
    parsed = parseArgs(argv);
    var openKho = options.openKho || function (dbPath) {
      return new Kho(dbPath);
    };
    kho = openKho(parsed.dbPath);
    opened = true;
    var context = {
      kho: kho,
      clock: options.clock || defaultClock(),
      ownerId: (options.makeOwnerId || defaultOwnerId)()
    };
    var result = parsed.action === 'cutover' ? runMaintenanceCutover(context) :
      rollbackDurableScheduler(context);
    stdout = JSON.stringify(parsed.action === 'cutover' ? {
      action: 'cutover', mode: result.mode, imported: result.imported, recovered: result.recovered
    } : {
      action: 'rollback', mode: result.mode, restored: result.restored
    }) + '\n';
  } catch (error) {
    primaryError = error;
  } finally {
    if (opened && kho && typeof kho.dong === 'function') {
      try { kho.dong(); }
      catch (error) {
        if (!primaryError) primaryError = error;
      }
    }
  }
  if (primaryError) {
    exitCode = 1;
    stdout = '';
    stderr = sanitizeErrorCode(primaryError) + '\n';
  }
  return {exitCode: exitCode, stdout: stdout, stderr: stderr};
}

async function main(argv, env, streams, processLike) {
  void env;
  streams = streams || {stdout: process.stdout, stderr: process.stderr};
  var result = await runCli(argv, {});
  if (result.stdout) streams.stdout.write(result.stdout);
  if (result.stderr) streams.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
  if (processLike && processLike !== process) processLike.exitCode = result.exitCode;
  return result;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(function () {
    process.stderr.write('SCHEDULER_CUTOVER_FAILED\n');
    process.exitCode = 1;
  });
}

module.exports = {
  main: main,
  parseArgs: parseArgs,
  runCli: runCli
};
