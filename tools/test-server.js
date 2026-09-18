/* Regression server durable, tự chạy không cần bind socket.
 * Chạy: node tools/test-server.js */
'use strict';

var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');
var PassThrough = require('node:stream').PassThrough;
var taoUngDung = require('../server/app.js').taoUngDung;
var Kho = require('../server/db.js').Kho;
var cutoverModule = require('../server/scheduler/cutover.js');
var runMaintenanceCutover = cutoverModule.runMaintenanceCutover;
var isPristineDatabase = cutoverModule.isPristineDatabase;
var apDungMigrationScheduler = require('../server/scheduler/migrations.js').apDungMigrationScheduler;

var kiemTra = 0;
function ktra(dieuKien, ten) {
  if (!dieuKien) throw new Error(ten);
  kiemTra++;
}

function clockCoDinh() {
  var nowMs = 1700000000000;
  return {nowMs: function () { return nowMs; }};
}

function loggerImLang(records) {
  function ghi(level) {
    return function (entry) { records.push({level: level, entry: entry}); };
  }
  return {debug: ghi('debug'), info: ghi('info'), warn: ghi('warn'), error: ghi('error')};
}

function xoaFixture(directory) {
  fs.rmSync(directory, {recursive: true, force: true});
}

function requestNoiBo(app, method, pathname, body, token) {
  var req = new PassThrough();
  req.url = pathname;
  req.method = method;
  req.headers = {};
  if (body !== undefined) req.headers['content-type'] = 'application/json';
  if (token) req.headers['x-thdc-token'] = token;
  req.socket = {remoteAddress: '127.0.0.1'};
  return new Promise(function (resolve, reject) {
    var res = {
      headersSent: false,
      writableEnded: false,
      writeHead: function (status, headers) {
        this.statusCode = status;
        this.headersSent = true;
        this.headers = headers || {};
      },
      end: function (chunk) {
        this.writableEnded = true;
        try {
          resolve({
            status: this.statusCode,
            body: chunk === undefined || chunk === '' ? null : JSON.parse(String(chunk))
          });
        } catch (error) { reject(error); }
      }
    };
    app.server.emit('request', req, res);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

function get(app, pathname, token) {
  return requestNoiBo(app, 'GET', pathname, undefined, token);
}
function post(app, pathname, body, token) {
  return requestNoiBo(app, 'POST', pathname, body, token);
}

function taoAppDurable(dbPath, clock, records) {
  var app = taoUngDung({
    port: 0,
    dbPath: dbPath,
    env: {},
    clock: clock,
    logger: loggerImLang(records),
    timers: {setInterval: function () { return {}; }, clearInterval: function () {}}
  });
  app.server.listen = function () {
    queueMicrotask(function () { app.server.emit('listening'); });
    return app.server;
  };
  return app;
}

function stateCua(app, accountId) {
  return JSON.parse(app.kho.q.dqGet.get(accountId).state);
}

/* Tự cutover: chỉ được chạm vào database CHƯA CÓ GÌ. */
async function kiemTuCutover() {
  var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'thdc-tu-cutover-'));
  var clock = clockCoDinh();
  function moDb(ten) { return new Kho(path.join(directory, ten)); }
  function modeCua(ten) {
    var kho = moDb(ten);
    try {
      var row = kho.db.prepare("SELECT value FROM scheduler_meta WHERE key='scheduler_mode'").get();
      return row ? row.value : null;
    } finally { kho.dong(); }
  }
  try {
    /* 1. database mới tinh -> tự chuyển sang durable, server sẵn sàng ngay */
    var app = taoAppDurable(path.join(directory, 'moi.sqlite'), clock, []);
    try {
      await app.start();
      var ready = await get(app, '/readyz');
      ktra(ready.status === 200 && ready.body.ready === true,
        'tu-cutover: database mới tinh khởi động là sẵn sàng ngay');
      ktra((await get(app, '/api/thongtin')).status === 200,
        'tu-cutover: gameplay API dùng được sau khi tự cutover');
    } finally { await app.stop().catch(function () {}); }
    ktra(modeCua('moi.sqlite') === 'durable', 'tu-cutover: database mới đã ở chế độ durable');

    /* 2. database ĐÃ CÓ DỮ LIỆU -> tuyệt đối không tự cutover */
    var coDl = path.join(directory, 'codulieu.sqlite');
    var khoDl = moDb('codulieu.sqlite');
    try {
      apDungMigrationScheduler(khoDl, clock.nowMs());
      ktra(isPristineDatabase(khoDl) === true, 'tu-cutover: database trống được coi là mới');
      khoDl.db.prepare('INSERT INTO tk (ten,hienthi,mk,muoi,tao,vaoCuoi,quyen) VALUES (?,?,?,?,?,?,?)')
        .run('nguoicu', 'Người Cũ', 'bam', 'muoi', 1, 1, 'nguoi');
      ktra(isPristineDatabase(khoDl) === false,
        'tu-cutover: có một tài khoản là hết được coi là mới');
    } finally { khoDl.dong(); }
    var app2 = taoAppDurable(coDl, clock, []);
    try {
      await app2.start();
      var chuaSan = await get(app2, '/readyz');
      ktra(chuaSan.status === 503 && chuaSan.body.reason === 'SCHEDULER_MODE_LEGACY',
        'tu-cutover: database có dữ liệu vẫn đòi cutover thủ công');
    } finally { await app2.stop().catch(function () {}); }
    ktra(modeCua('codulieu.sqlite') === 'legacy',
      'tu-cutover: database có dữ liệu KHÔNG bị đổi chế độ');

    /* 3. THDC_TU_CUTOVER=0 tắt hẳn, kể cả trên database mới */
    var tat = path.join(directory, 'tat.sqlite');
    var app3 = taoUngDung({
      port: 0, dbPath: tat, env: {THDC_TU_CUTOVER: '0'}, clock: clock,
      logger: loggerImLang([]),
      timers: {setInterval: function () { return {}; }, clearInterval: function () {}}
    });
    app3.server.listen = function () {
      queueMicrotask(function () { app3.server.emit('listening'); });
      return app3.server;
    };
    try {
      await app3.start();
      var tatReady = await get(app3, '/readyz');
      ktra(tatReady.status === 503 && tatReady.body.reason === 'SCHEDULER_MODE_LEGACY',
        'tu-cutover: THDC_TU_CUTOVER=0 tắt được tính năng');
    } finally { await app3.stop().catch(function () {}); }
    ktra(modeCua('tat.sqlite') === 'legacy', 'tu-cutover: tắt rồi thì database vẫn legacy');
  } finally {
    xoaFixture(directory);
  }
}

async function main() {
  await kiemTuCutover();
  var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'thdc-server-durable-'));
  var dbPath = path.join(directory, 'game.sqlite');
  var clock = clockCoDinh();
  var app = null;
  var reopened = null;
  var records = [];
  try {
    var khoCutover = new Kho(dbPath);
    try {
      var cutover = runMaintenanceCutover({
        kho: khoCutover,
        clock: clock,
        ownerId: '00000000-0000-4000-8000-000000000041'
      });
      ktra(cutover && cutover.mode === 'durable' && cutover.imported === 0,
        'cutover fresh durable');
    } finally { khoCutover.dong(); }

    app = taoAppDurable(dbPath, clock, records);
    await app.start();
    var ready = await get(app, '/readyz');
    ktra(ready.status === 200 && ready.body && ready.body.ready === true,
      'readyz durable ready');
    var info = await get(app, '/api/thongtin');
    ktra(info.status === 200 && typeof info.body.seed === 'string' && info.body.seed.length > 0,
      'thongtin bootstrap qua bridge');
    ktra((await get(app, '/api/state')).status === 401, 'state khong token bi tu choi');

    var alphaRegistration = await post(app, '/api/dangky', {
      ten: 'durablealpha', hienthi: 'Durable Alpha', mk: 'alpha-secret'
    });
    ktra(alphaRegistration.status === 200 && alphaRegistration.body.token && alphaRegistration.body.nha,
      'dang ky alpha');
    var alphaToken = alphaRegistration.body.token;
    var alpha = app.kho.q.tkTheoTen.get('durablealpha');
    ktra(alpha && app.kho.q.dqGet.get(alpha.id), 'dang ky tao tai khoan va de quoc');
    ktra((await post(app, '/api/dangky', {
      ten: 'DurableAlpha', hienthi: 'Duplicate', mk: 'alpha-secret'
    })).status === 409, 'khong dang ky trung ten');
    ktra((await post(app, '/api/dangky', {
      ten: 'x', hienthi: 'x', mk: 'bad'
    })).status === 400, 'chan dang ky khong hop le');
    ktra((await post(app, '/api/dangnhap', {
      ten: 'durablealpha', mk: 'wrong-secret'
    })).status === 401, 'dang nhap sai mat khau');
    var alphaLogin = await post(app, '/api/dangnhap', {
      ten: 'durablealpha', mk: 'alpha-secret'
    });
    ktra(alphaLogin.status === 200 && alphaLogin.body.token, 'dang nhap dung mat khau');

    var alphaState = await get(app, '/api/state', alphaToken);
    ktra(alphaState.status === 200 && alphaState.body.st && alphaState.body.st.planets.length === 1,
      'state authenticated');
    ktra(Object.prototype.hasOwnProperty.call(alphaState.body.st, 'pvpToi') &&
      Object.prototype.hasOwnProperty.call(alphaState.body.st, 'pvpGiu'),
      'state response co projection pvp');
    var alphaStored = stateCua(app, alpha.id);
    ktra(!Object.prototype.hasOwnProperty.call(alphaStored, 'pvpToi') &&
      !Object.prototype.hasOwnProperty.call(alphaStored, 'pvpGiu'),
      'projection response khong ghi vao canonical state');
    var validAction = await post(app, '/api/lam', {
      ten: 'doithue', dl: {pi: 0, thue: 11}
    }, alphaToken);
    ktra(validAction.status === 200 && stateCua(app, alpha.id).planets[0].danSu.taxBp === 1100,
      'action hop le qua scheduler');
    ktra((await post(app, '/api/lam', {ten: 'khong-co', dl: {}}, alphaToken)).status === 400,
      'action khong hop le bi chan');

    var betaRegistration = await post(app, '/api/dangky', {
      ten: 'durablebeta', hienthi: 'Durable Beta', mk: 'beta-secret'
    });
    ktra(betaRegistration.status === 200 && betaRegistration.body.token,
      'dang ky beta');
    var betaToken = betaRegistration.body.token;
    var beta = app.kho.q.tkTheoTen.get('durablebeta');
    ktra(beta && beta.id !== alpha.id, 'hai tai khoan phan biet');

    var war = await post(app, '/api/tuyenchien', {tk: beta.id}, alphaToken);
    ktra(war.status === 200 && app.kho.q.chienGetTK.get(alpha.id, beta.id),
      'tuyen chien qua scheduler');
    var mail = await post(app, '/api/guithu', {
      den: 'Durable Beta', noi: 'durable mail'
    }, alphaToken);
    ktra(mail.status === 200 && stateCua(app, beta.id).msgs.some(function (message) {
      return message.nd === 'durable mail';
    }), 'gui thu qua scheduler');

    var alliance = await post(app, '/api/lmtao', {
      ten: 'Durable Collective', tag: 'DC'
    }, alphaToken);
    ktra(alliance.status === 200, 'tao lien minh');
    ktra((await post(app, '/api/lmxin', {
      ten: '[DC] Durable Collective'
    }, betaToken)).status === 200, 'beta xin vao lien minh');
    ktra((await post(app, '/api/lmduyet', {tk: beta.id}, alphaToken)).status === 200 &&
      app.kho.q.dqGet.get(beta.id).lm === '[DC] Durable Collective',
      'alpha duyet beta vao lien minh');

    await app.scheduler.runCommand({
      name: 'test-fund-galana',
      accountId: alpha.id,
      run: function () {
        var loaded = app.tg.nap(alpha.id);
        if (!loaded || !loaded.st) throw new Error('FUND_ACCOUNT_MISSING');
        loaded.st.galana = 5000;
        app.tg.luu(alpha.id, loaded.st, {mutation: app.tg._schedulerMutation});
        return null;
      }
    });
    var betaGalana = stateCua(app, beta.id).galana;
    var alphaRevision = Number(app.kho.q.dqGet.get(alpha.id).revision);
    var betaRevision = Number(app.kho.q.dqGet.get(beta.id).revision);
    var transfer = await post(app, '/api/chuyengalana', {tk: beta.id, so: 1000}, alphaToken);
    ktra(transfer.status === 200 && stateCua(app, alpha.id).galana === 4000 &&
      stateCua(app, beta.id).galana === betaGalana + 1000,
      'chuyen Galana qua scheduler');
    ktra(Number(app.kho.q.dqGet.get(alpha.id).revision) > alphaRevision &&
      Number(app.kho.q.dqGet.get(beta.id).revision) > betaRevision,
      'Galana cap nhat revision ca hai ben');

    var passwordChange = await post(app, '/api/doimk', {
      cu: 'alpha-secret', moi: 'alpha-secret-new'
    }, alphaToken);
    ktra(passwordChange.status === 200 && passwordChange.body.thuHoiPhien === true,
      'doi mat khau qua scheduler');
    ktra((await get(app, '/api/state', alphaLogin.body.token)).status === 401,
      'doi mat khau thu hoi phien khac');
    ktra((await get(app, '/api/state', alphaToken)).status === 200,
      'doi mat khau giu phien hien tai');

    var deletion = await post(app, '/api/xoatk', {
      mk: 'beta-secret', xacnhan: 'XOA'
    }, betaToken);
    ktra(deletion.status === 200 && !app.kho.q.tkTheoId.get(beta.id),
      'xoa tai khoan qua scheduler');
    ktra((await get(app, '/api/state', betaToken)).status === 401,
      'token tai khoan da xoa bi thu hoi');
    ktra(app.scheduler.getStatus().ready === true && !records.some(function (record) {
      return record.entry && record.entry.code === 'SCHEDULER_MUTATION_TOKEN_REQUIRED';
    }), 'khong co legacy mutation bypass');

    await app.stop();
    app = null;
    var reopenedRecords = [];
    reopened = taoAppDurable(dbPath, clock, reopenedRecords);
    await reopened.start();
    var reopenedReady = await get(reopened, '/readyz');
    ktra(reopenedReady.status === 200 && reopenedReady.body.ready === true,
      'reopen durable ready');
    var reopenedLogin = await post(reopened, '/api/dangnhap', {
      ten: 'durablealpha', mk: 'alpha-secret-new'
    });
    ktra(reopenedLogin.status === 200 && (await get(reopened, '/api/state', reopenedLogin.body.token)).status === 200,
      'reopen giu state va mat khau moi');
  } finally {
    if (reopened) await reopened.stop().catch(function () {});
    if (app) await app.stop().catch(function () {});
    xoaFixture(directory);
  }
}

main().then(function () {
  console.log('✓ ' + kiemTra + ' kiểm tra server durable in-process đạt');
}).catch(function (error) {
  console.error('✗ server durable in-process thất bại:\n' + (error && error.stack || error));
  process.exitCode = 1;
});
