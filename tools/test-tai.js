/* Durable scheduler load verification.  Every game mutation uses one Writer. */
'use strict';
var path = require('path'), os = require('os'), fs = require('fs');
var assert = require('node:assert/strict');
var Kho = require(path.join(__dirname, '..', 'server', 'db.js')).Kho;
var W = require(path.join(__dirname, '..', 'server', 'world.js'));
var TheGioi = W.TheGioi, G = W.G;
var SchedulerStore = require('../server/scheduler/store.js').SchedulerStore;
var GameAdvanceService = require('../server/scheduler/advance-service.js').GameAdvanceService;
var EventReducer = require('../server/scheduler/reducers.js').EventReducer;
var SchedulerWriter = require('../server/scheduler/writer.js').SchedulerWriter;
var runMaintenanceCutover = require('../server/scheduler/cutover.js').runMaintenanceCutover;
var SO_TK = Math.max(4, parseInt(process.argv[2] || '60', 10));
var DB = path.join(os.tmpdir(), 'thdc-tai-' + process.pid + '.db');
var loi = 0, ok = 0;
function ktra(okValue, name) { if (okValue) ok++; else { loi++; console.log('  ✗ ' + name); } }
function log(value) { console.log('  · ' + value); }
function clockAt(seconds) {
  var ms = seconds * 1000;
  return {
    nowMs: function () { return ms; },
    advanceMs: function (n) { ms += n; }
  };
}
function nowS(clock) { return Math.floor(clock.nowMs() / 1000); }
function timers(clock) {
  var n = 0, pending = new Map();
  return {
    setTimeout: function (fn, delay) {
      var id = ++n;
      pending.set(id, {id: id, at: clock.nowMs() + delay, fn: fn});
      return id;
    },
    clearTimeout: function (id) { pending.delete(id); },
    run: async function () {
      var due = Array.from(pending.values()).filter(function (x) {
        return x.at <= clock.nowMs();
      }).sort(function (a, b) { return a.at - b.at || a.id - b.id; });
      for (var x of due) { pending.delete(x.id); await x.fn(); }
    }
  };
}
function state(kho, id) { return JSON.parse(kho.q.dqGet.get(id).state); }
function logger() { return {debug: function () {}, info: function () {}, warn: function () {}, error: function () {}}; }
function startLoad(kho, seconds) {
  var clock = clockAt(seconds);
  assert.equal(runMaintenanceCutover({
    kho: kho, clock: clock, ownerId: '00000000-0000-4000-8000-000000000027'
  }).mode, 'durable');
  var store = new SchedulerStore(kho, clock), world = new TheGioi(kho, {clock: clock, scheduler: store});
  var advance = new GameAdvanceService({kho: kho, world: world, store: store, clock: clock});
  world.datScheduler(store); world.datAdvanceService(advance);
  var reducer = new EventReducer({kho: kho, world: world, store: store, clock: clock, advanceService: advance});
  var clockTimers = timers(clock);
  var writer = new SchedulerWriter({
    ownerId: '00000000-0000-4000-8000-000000000028', store: store,
    world: world, reducer: reducer, advanceService: advance, clock: clock,
    timers: clockTimers, logger: logger(), pollMs: 1000, leaseMs: 15000,
    retryBaseMs: 1000, retryMaxMs: 300000, maxAttempts: 8,
    maxBacklogAgeMs: 3600000, reconcileIntervalMs: 300000, manualDrain: false
  });
  return {clock: clock, timers: clockTimers, store: store, world: world, writer: writer};
}
async function moveTo(tai, seconds) {
  while (nowS(tai.clock) < seconds) {
    tai.clock.advanceMs(Math.min(4000, (seconds - nowS(tai.clock)) * 1000));
    await tai.timers.run();
  }
}
async function makeAccount(tai, kho, name) {
  return tai.writer.runCommand({
    name: 'load-register',
    run: function () {
      var id = Number(kho.q.tkThem.run(
        name, name, 'load-hash', 'load-salt', nowS(tai.clock), nowS(tai.clock)
      ).lastInsertRowid);
      tai.world.taoDeQuoc(id, name);
      return id;
    }
  });
}
async function equip(tai, id) {
  return tai.writer.runCommand({
    name: 'load-equip', accountId: id,
    run: function () {
      var s = tai.world.layStateNoiBo(id), p = s.planets[0];
      p.res = {metal: 3e5, crystal: 2e5, deut: 1e6, food: 1e5};
      p.ships = {cruiser: 30, cargoL: 10, probe: 5};
      s.tech = {weapon: 5, shield: 5, armor: 5, combustion: 8, impulse: 5, hyperdrive: 3};
      return tai.world.luu(id, s);
    }
  });
}
async function advanceAll(tai, ids, seconds) {
  while (nowS(tai.clock) < seconds) {
    var checkpoint = Math.min(seconds, nowS(tai.clock) + 1800);
    await moveTo(tai, checkpoint);
    for (var id of ids) await tai.writer.advanceTo(id, checkpoint);
  }
}
async function launchAndDrain(tai, kho, ids, homes, atS) {
  for (var i = 0; i < ids.length; i++) await tai.writer.runCommand({
    name: 'load-launch', accountId: ids[i],
    run: (function (id, target) {
      return function () {
        var result = tai.world.hanhDong(id, 'gui', {
          pi: 0, ships: {cruiser: 30}, den: target,
          mission: 'attack', cargo: {}, pct: 100
        });
        if (result.loi) throw new Error('LOAD_LAUNCH:' + result.loi);
        var s = tai.world.layStateNoiBo(id);
        s.fleets.forEach(function (fleet) {
          if (fleet.pha === 'di') fleet.den_t = atS;
        });
        return tai.world.luu(id, s);
      };
    })(ids[i], homes[(i + 1) % ids.length])
  });
  assert.equal(kho.db.prepare(
    "SELECT COUNT(*) AS n FROM event_jobs WHERE kind='PVP_RESOLVE' " +
    "AND state IN ('PENDING','RUNNING','RETRY_WAIT')"
  ).get().n, ids.length);
  await moveTo(tai, atS);
  for (var batch = 0; batch < 128; batch++) {
    await tai.writer.drainNow();
    if (kho.db.prepare(
      "SELECT COUNT(*) AS n FROM event_jobs WHERE kind='PVP_RESOLVE' " +
      "AND state IN ('PENDING','RUNNING','RETRY_WAIT','QUARANTINED')"
    ).get().n === 0) break;
  }
  assert.equal(kho.db.prepare(
    "SELECT COUNT(*) AS n FROM event_jobs WHERE kind='PVP_RESOLVE' " +
    "AND state IN ('PENDING','RUNNING','RETRY_WAIT','QUARANTINED')"
  ).get().n, 0);
}
async function main() {
  var kho = new Kho(DB), tai = null;
  try {
    var start = 1800030000, ids = [], homes = [], t0 = Date.now();
    tai = startLoad(kho, start); await tai.writer.start();
    assert.equal(tai.writer.status().writerLeaseHeld, true);
    for (var i = 0; i < SO_TK; i++) {
      var id = await makeAccount(tai, kho, 'nc' + i);
      await equip(tai, id);
      ids.push(id); homes.push(state(kho, id).planets[0].c);
      ktra(true, 'tạo được đế quốc ' + i);
    }
    log('tạo ' + SO_TK + ' đế quốc qua một writer mất ' + (Date.now() - t0) + 'ms');
    ktra(kho.q.htDem.get().n === SO_TK, 'mỗi đế quốc chiếm đúng 1 ô hành tinh');
    for (i = 0; i < SO_TK; i++) await tai.writer.runCommand({
      name: 'load-war', accountId: ids[i],
      run: (function (a, d) {
        return function () { return tai.world.tuyenChien(a, d); };
      })(ids[i], ids[(i + 1) % SO_TK])
    });
    var target = start + 24 * 3600, advanceStart = Date.now();
    await advanceAll(tai, ids, target);
    log('tua 24 giờ qua writer mất ' + (Date.now() - advanceStart) + 'ms');
    await launchAndDrain(tai, kho, ids, homes, target + 61);
    ktra(kho.q.tranDS.all(1000).length >= SO_TK * 0.9, 'gần như mọi cuộc tấn công thành trận thật');
    ktra(ids.every(function (id) {
      var p = state(kho, id).planets[0];
      return p && Object.keys(p.res).every(function (key) {
        return p.res[key] >= 0 && isFinite(p.res[key]);
      });
    }), 'không có tài nguyên âm hoặc NaN');
    await tai.writer.runCommand({name: 'advance-due', run: function () { return null; }});
    ktra(fs.statSync(DB).size / SO_TK < 200 * 1024, 'dung lượng mỗi tài khoản dưới 200 KB');
  } catch (error) { loi++; console.log('  ✗ NGOẠI LỆ: ' + (error && error.stack || error)); }
  finally {
    if (tai) await tai.writer.stop(100);
    kho.dong();
    try {
      fs.unlinkSync(DB); fs.unlinkSync(DB + '-wal'); fs.unlinkSync(DB + '-shm');
    } catch (error) { void error; }
  }
  return {loi: loi, ok: ok};
}
main().then(function (summary) {
  console.log('\n' + (summary.loi ? '✗ ' + summary.loi + ' lỗi / ' : '✓ ') +
    summary.ok + ' kiểm tra đạt');
  process.exitCode = summary.loi ? 1 : 0;
}).catch(function (error) {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
