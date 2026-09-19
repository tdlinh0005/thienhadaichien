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
var G = require('../server/rules.js').G;

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

/* Body sai định dạng và tên hành động/tài khoản rác KHÔNG được thành HTTP 500.
   Cả ba lỗi dưới đây từng biến một body hợp lệ về mặt JSON thành lỗi máy chủ. */
async function kiemDauVaoXau() {
  var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'thdc-dauvao-'));
  var dbPath = path.join(directory, 'g.sqlite');
  var clock = clockCoDinh();
  var khoCut = new Kho(dbPath);
  try {
    runMaintenanceCutover({
      kho: khoCut, clock: clock, ownerId: '00000000-0000-4000-8000-000000000051'
    });
  } finally { khoCut.dong(); }

  /* Bài này bắn hàng trăm request nên phải nới trần tần suất, nếu không chính
     bộ giới hạn (429) sẽ che mất thứ đang cần đo. */
  var app = taoUngDung({
    port: 0, dbPath: dbPath, env: {THDC_GIOI_HAN: '100000', THDC_GIOI_HAN_DN: '100000'},
    clock: clock, logger: loggerImLang([]),
    timers: {setInterval: function () { return {}; }, clearInterval: function () {}}
  });
  app.server.listen = function () {
    queueMicrotask(function () { app.server.emit('listening'); });
    return app.server;
  };
  try {
    await app.start();
    var dk = await post(app, '/api/dangky', {
      ten: 'dauvaoxau', mk: 'matkhau-dai', hienthi: 'Đầu Vào Xấu'
    });
    ktra(dk.status === 200 && dk.body.token, 'đầu vào xấu: đăng ký được tài khoản nền');
    var tok = dk.body.token;

    /* 1. body JSON là null/mảng/số — handler đọc b.ten trên null thì ném */
    var mauBody = [null, [], 0, 'x', true];
    var duong = ['/api/tuyenchien', '/api/chuyengalana', '/api/lmtao', '/api/lmxin',
      '/api/lmduoi', '/api/lmchuyen', '/api/chat', '/api/guithu', '/api/doimk', '/api/lam',
      '/api/chodang', '/api/chogo', '/api/chomua'];
    var xau = [], i, j;
    for (i = 0; i < duong.length; i++) {
      for (j = 0; j < mauBody.length; j++) {
        var r = await post(app, duong[i], mauBody[j], tok);
        if (r.status >= 500) xau.push(duong[i] + ' <- ' + JSON.stringify(mauBody[j]));
      }
    }
    ktra(xau.length === 0, 'đầu vào xấu: body không phải object không gây 500 (' + xau.join(', ') + ')');

    /* 2. số hiệu tài khoản rác đi thẳng vào preflight của scheduler */
    var xau2 = [], mauTk = [undefined, null, -1, 0, 'x', 1.5, NaN, [], {}];
    for (i = 0; i < mauTk.length; i++) {
      var rc = await post(app, '/api/tuyenchien', { tk: mauTk[i] }, tok);
      if (rc.status >= 500) xau2.push('tuyenchien tk=' + JSON.stringify(mauTk[i]));
      var rg = await post(app, '/api/chuyengalana', { tk: mauTk[i], so: 10 }, tok);
      if (rg.status >= 500) xau2.push('chuyengalana tk=' + JSON.stringify(mauTk[i]));
    }
    ktra(xau2.length === 0,
      'đầu vào xấu: số hiệu tài khoản rác trả lỗi luật chơi chứ không 500 (' + xau2.join(', ') + ')');

    /* 3. tên hành động trùng khoá trên Object.prototype */
    var xau3 = [], mauTen = ['__proto__', 'toString', 'constructor', 'valueOf',
      'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable'];
    for (i = 0; i < mauTen.length; i++) {
      var ra = await post(app, '/api/lam', { ten: mauTen[i], dl: {} }, tok);
      if (ra.status !== 400) xau3.push(mauTen[i] + ' -> ' + ra.status);
    }
    ktra(xau3.length === 0,
      'đầu vào xấu: tên hành động trên prototype bị từ chối 400 (' + xau3.join(', ') + ')');

    /* hành động thật vẫn chạy */
    var that = await post(app, '/api/lam', { ten: 'doithue', dl: { pi: 0, thue: 12 } }, tok);
    ktra(that.status === 200, 'đầu vào xấu: hành động thật vẫn chạy bình thường');
  } finally {
    await app.stop().catch(function () {});
    xoaFixture(directory);
  }
}

/* Chợ dùng chung: ký quỹ, thuế, giao hàng chậm và khoá chống bán quá hàng.
 * Giao dịch chạm HAI tài khoản nên phải chạy qua đúng scheduler durable. */
async function kiemCho() {
  var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'thdc-cho-'));
  var dbPath = path.join(directory, 'g.sqlite');
  var clock = clockCoDinh();
  var khoCut = new Kho(dbPath);
  try {
    runMaintenanceCutover({
      kho: khoCut, clock: clock, ownerId: '00000000-0000-4000-8000-000000000061'
    });
  } finally { khoCut.dong(); }

  var records = [];
  var app = taoAppDurable(dbPath, clock, records);
  try {
    await app.start();
    var ban = await post(app, '/api/dangky', {ten: 'nguoiban', mk: 'matkhau-ban', hienthi: 'Người Bán'});
    var mua = await post(app, '/api/dangky', {ten: 'nguoimua', mk: 'matkhau-mua', hienthi: 'Người Mua'});
    ktra(ban.status === 200 && mua.status === 200, 'chợ: dựng được hai tài khoản');
    var tB = ban.body.token, tM = mua.body.token;
    var idB = app.kho.q.tkTheoTen.get('nguoiban').id;
    var idM = app.kho.q.tkTheoTen.get('nguoimua').id;

    var rong = await get(app, '/api/cho?loai=tudo', tB);
    ktra(rong.status === 200 && rong.body.ds.length === 0 && rong.body.thue === 0.05,
      'chợ: /api/cho trả sạp rỗng và thuế tự do 5%');

    var kimTruoc = stateCua(app, idB).planets[0].res.metal;
    var dang = await post(app, '/api/chodang',
      {loai: 'tudo', pi: 0, res: 'metal', sl: 1000, gia: 3}, tB);
    ktra(dang.status === 200 && !dang.body.loi && dang.body.cho.ds.length === 1,
      'chợ: ký gửi được lô hàng');
    ktra(stateCua(app, idB).planets[0].res.metal <= kimTruoc - 1000,
      'chợ: hàng ký gửi bị giữ khỏi kho ngay');

    var qua = await post(app, '/api/chodang',
      {loai: 'tudo', pi: 0, res: 'metal', sl: 1e11, gia: 3}, tB);
    ktra(qua.status === 400 && /Không đủ/.test(qua.body.loi || ''),
      'chợ: không ký gửi quá số hàng đang có');

    var loId = dang.body.cho.ds[0].id;
    var tuMua = await post(app, '/api/chomua', {loai: 'tudo', id: loId, sl: 10}, tB);
    ktra(tuMua.status === 400 && /chính mình/.test(tuMua.body.loi || ''),
      'chợ: không tự mua lô của mình');
    var quaMua = await post(app, '/api/chomua', {loai: 'tudo', id: loId, sl: 5000}, tM);
    ktra(quaMua.status === 400, 'chợ: không mua quá số hàng còn lại');
    var goNho = await post(app, '/api/chogo', {loai: 'tudo', id: loId}, tM);
    ktra(goNho.status === 400 && /không phải lô hàng của bạn/i.test(goNho.body.loi || ''),
      'chợ: không gỡ lô của người khác');

    var galBanTruoc = stateCua(app, idB).galana;
    var galMuaTruoc = stateCua(app, idM).galana;
    var kimMuaTruoc = stateCua(app, idM).planets[0].res.metal;
    var muaOk = await post(app, '/api/chomua', {loai: 'tudo', id: loId, sl: 400}, tM);
    ktra(muaOk.status === 200 && !muaOk.body.loi, 'chợ: mua được hàng của người khác');
    var stMua = stateCua(app, idM), stBan = stateCua(app, idB);
    ktra(galMuaTruoc - stMua.galana === 1200, 'chợ: người mua trả đúng 400 × 3 Galana');
    ktra(stBan.galana - galBanTruoc === 1140, 'chợ: người bán nhận đúng phần sau thuế 5%');
    ktra(stMua.planets[0].res.metal <= kimMuaTruoc + 1 && (stMua.giaoHang || []).length === 1 &&
      stMua.giaoHang[0].n === 400, 'chợ: hàng chưa tới ngay mà nằm trên đường giao');
    ktra(muaOk.body.cho.ds[0].sl === 600, 'chợ: lô hàng bị trừ đúng phần đã bán');

    /* hai lệnh mua cùng lúc trên cùng một lô: tổng bán ra không được vượt ký quỹ */
    var doi = await Promise.all([
      post(app, '/api/chomua', {loai: 'tudo', id: loId, sl: 600}, tM),
      post(app, '/api/chomua', {loai: 'tudo', id: loId, sl: 600}, tM)
    ]);
    var thanhCong = doi.filter(function (r) { return r.status === 200 && !r.body.loi; });
    ktra(thanhCong.length === 1, 'chợ: hai lệnh mua tranh nhau thì chỉ một lệnh ăn hàng (' +
      JSON.stringify(doi.map(function (r) { return [r.status, r.body && r.body.loi]; })) + ')');
    var tongNhan = (stateCua(app, idM).giaoHang || []).reduce(function (t, o) {
      return t + o.n;
    }, 0);
    ktra(tongNhan === 1000, 'chợ: tổng hàng giao ra đúng bằng số đã ký gửi');

    /* siêu thị ép giá gốc bất kể người bán khai gì */
    var st = await post(app, '/api/chodang',
      {loai: 'sieuthi', pi: 0, res: 'crystal', sl: 100, gia: 999999}, tB);
    var loST = (st.body.cho.ds || []).filter(function (o) { return o.res === 'crystal'; })[0];
    ktra(st.status === 200 && loST && Math.abs(loST.gia - 1 / 30) < 1e-12,
      'chợ: Siêu Thị ép giá gốc, không cho người bán tự ra giá');
    ktra(st.body.cho.thue === 0.1, 'chợ: thuế Siêu Thị 10%');

    /* Một loại tài nguyên bị bơm đầy lô rẻ KHÔNG được che mất các loại khác.
       Trần phẳng trên cả sạp từng làm đúng chuyện đó. */
    var themLo = app.kho.db.prepare(
      "INSERT INTO cho(khi,loai,tkBan,tenBan,res,sl,gia) VALUES(0,'tudo',?,'Người Bán',?,100,?)");
    for (var lo = 0; lo < 120; lo++) themLo.run(idB, 'crystal', 1 + lo * 0.001);
    ['metal', 'deut', 'food'].forEach(function (r) { themLo.run(idB, r, 500); });
    var sap = await get(app, '/api/cho?loai=tudo', tM);
    var demRes = {};
    sap.body.ds.forEach(function (x) { demRes[x.res] = (demRes[x.res] || 0) + 1; });
    ktra(Object.keys(demRes).length === 4,
      'chợ: một loại bị bơm đầy vẫn không che mất loại khác (' + JSON.stringify(demRes) + ')');
    ktra(demRes.crystal === sap.body.moiRes,
      'chợ: mỗi loại chỉ hiện đúng trần của riêng nó');
    ktra(sap.body.ds.every(function (x, i, a) {
      return i === 0 || a[i - 1].res !== x.res || a[i - 1].gia <= x.gia;
    }), 'chợ: trong mỗi loại, lô rẻ hơn đứng trước');
    app.kho.db.prepare('DELETE FROM cho').run();

    /* rời vũ trụ thì mọi lô hàng phải biến mất theo */
    var xoa = await post(app, '/api/xoatk', {mk: 'matkhau-ban', xacnhan: 'XOA'}, tB);
    ktra(xoa.status === 200, 'chợ: xoá được tài khoản người bán');
    var conTuDo = await get(app, '/api/cho?loai=tudo', tM);
    var conST = await get(app, '/api/cho?loai=sieuthi', tM);
    ktra(conTuDo.body.ds.length === 0 && conST.body.ds.length === 0,
      'chợ: người rời vũ trụ thì lô hàng của họ bị dọn sạch');

    ktra(!records.some(function (r) { return r.level === 'error'; }),
      'chợ: không có lỗi nào lọt vào logger');
  } finally {
    await app.stop().catch(function () {});
    xoaFixture(directory);
  }
}

/* Phong toả quỹ đạo giữa người chơi: lệnh ở lại đi kèm nhiệm vụ Tấn Công, và
 * projection `phongtoa` khoá được cửa phát lệnh của bên bị vây. */
async function kiemPhongToa() {
  var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'thdc-phongtoa-'));
  var dbPath = path.join(directory, 'g.sqlite');
  var clock = clockCoDinh();
  var khoCut = new Kho(dbPath);
  try {
    runMaintenanceCutover({
      kho: khoCut, clock: clock, ownerId: '00000000-0000-4000-8000-000000000071'
    });
  } finally { khoCut.dong(); }

  var records = [];
  var app = taoAppDurable(dbPath, clock, records);
  try {
    await app.start();
    var A = await post(app, '/api/dangky', {ten: 'kevay', mk: 'matkhau-vay', hienthi: 'Kẻ Vây'});
    var D = await post(app, '/api/dangky', {ten: 'bivay', mk: 'matkhau-bi', hienthi: 'Bị Vây'});
    ktra(A.status === 200 && D.status === 200, 'phong toả: dựng được hai tài khoản');
    var tA = A.body.token, tD = D.body.token;
    var idA = app.kho.q.tkTheoTen.get('kevay').id;
    var idD = app.kho.q.tkTheoTen.get('bivay').id;
    var cD = stateCua(app, idD).planets[0].c;
    var cA = stateCua(app, idA).planets[0].c;

    app.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?').run(JSON.stringify((function () {
      var st = stateCua(app, idA);
      st.planets[0].ships = {fighterH: 4000, cruiser: 2000, fighterL: 100};
      st.planets[0].res.deut = 5e7;
      return st;
    })()), idA);

    /* Giữ Chỗ vẫn bị từ chối ở quỹ đạo người chơi khác — và lời từ chối phải
       chỉ đúng sang đường mới, nếu không người chơi không biết làm thế nào. */
    var giuNguoi = await post(app, '/api/lam', {ten: 'gui', dl: {
      pi: 0, ships: {fighterL: 1}, den: cD, mission: 'hold', cargo: {deut: 500}, pct: 100, giu: 1
    }}, tA);
    ktra(giuNguoi.status === 200 && /Tấn Công/.test(giuNguoi.body.loi || ''),
      'phong toả: Giữ Chỗ ở quỹ đạo người khác bị từ chối và chỉ sang nhiệm vụ Tấn Công (' +
      (giuNguoi.body.loi || 'không lỗi') + ')');

    /* Không có lệnh chiến tranh thì không xuất kích được — đây cũng là bài
       chứng minh kiểm tra LÚC PHÁT LỆNH thật sự chạy. */
    var chuaChien = await post(app, '/api/lam', {ten: 'gui', dl: {
      pi: 0, ships: {fighterH: 10}, den: cD, mission: 'attack', cargo: {}, pct: 100, toa: 6
    }}, tA);
    ktra(chuaChien.status === 200 && /24 giờ|tuyên chiến/i.test(chuaChien.body.loi || ''),
      'phong toả: chưa tuyên chiến thì bị chặn NGAY Ở BẾN (' + (chuaChien.body.loi || 'không lỗi') + ')');

    /* tuyên chiến và cho lệnh đủ 24 giờ */
    var tuyen = await post(app, '/api/tuyenchien', {tk: idD}, tA);
    ktra(tuyen.status === 200, 'phong toả: tuyên chiến được');
    app.kho.db.prepare('UPDATE chien SET khi=khi-90000').run();

    /* dựng thẳng một vòng vây trong projection để đo tác dụng của nó */
    var gio = Math.floor(clock.nowMs() / 1000);
    app.kho.q.ptThem.run(idA, 77, idD, G.tdKey(cD), 'Kẻ Vây', null, gio - 10, gio + 20000);

    ktra(app.tg.phongToaTai(G.tdKey(cD), idD, gio).length === 1,
      'phong toả: phongToaTai thấy vòng vây còn hiệu lực');
    ktra(app.tg.phongToaTai(G.tdKey(cD), idA, gio).length === 0,
      'phong toả: chính kẻ vây không tự thấy mình đang vây mình');
    ktra(app.tg.phongToaCua(idD).length === 1 && app.tg.phongToaCua(idA).length === 0,
      'phong toả: bên bị vây thấy vòng vây, bên đi vây thì không');

    var goiD = await get(app, '/api/state', tD);
    ktra(goiD.status === 200 && (goiD.body.st.pvpToa || []).length === 1 &&
      goiD.body.st.pvpToa[0].ten === 'Kẻ Vây', 'phong toả: /api/state trả pvpToa cho bên bị vây');
    ktra(goiD.body.st.pvpToa[0].ships === undefined,
      'phong toả: projection không lộ đội hình kẻ vây — muốn biết thì phải do thám');

    /* cửa phát lệnh của bên bị vây */
    app.kho.db.prepare('UPDATE dq SET state=? WHERE tk=?').run(JSON.stringify((function () {
      var st = stateCua(app, idD);
      st.planets[0].ships = {cargoS: 50, fighterL: 50};
      st.planets[0].res.deut = 5e6;
      return st;
    })()), idD);
    var camVC = await post(app, '/api/lam', {ten: 'gui', dl: {
      pi: 0, ships: {cargoS: 5}, den: cA, mission: 'transport', cargo: {metal: 10}, pct: 100
    }}, tD);
    ktra(camVC.status === 200 && /phong toả/i.test(camVC.body.loi || ''),
      'phong toả: bị vây thì Vận Chuyển không xuất bến được');
    var camGiu = await post(app, '/api/lam', {ten: 'gui', dl: {
      pi: 0, ships: {fighterL: 5}, den: cA, mission: 'hold', cargo: {deut: 1000}, pct: 100, giu: 1
    }}, tD);
    ktra(camGiu.status === 200 && /phong toả/i.test(camGiu.body.loi || ''),
      'phong toả: bị vây thì Giữ Chỗ cũng không xuất bến được');
    var duocDanh = await post(app, '/api/lam', {ten: 'gui', dl: {
      pi: 0, ships: {fighterL: 5}, den: cA, mission: 'attack', cargo: {}, pct: 100
    }}, tD);
    ktra(!/phong toả/i.test((duocDanh.body && duocDanh.body.loi) || ''),
      'phong toả: bị vây vẫn đánh trả được — vây không phải án tử');

    /* Vây phải chặn cả hàng CHỞ TỚI, không chỉ hàng đi ra — đó mới đúng là
       việc của một vòng vây. Hàng không bị huỷ, chỉ nằm chờ tới khi vây tan. */
    var stVay = stateCua(app, idD);
    stVay.giaoHang = [{pi: 0, res: 'metal', n: 777, den_t: stVay.now - 1}];
    var kimTruoc = stVay.planets[0].res.metal;
    app.kho.db.prepare('UPDATE dq SET state=?,keTiep=0 WHERE tk=?')
      .run(JSON.stringify(stVay), idD);
    await get(app, '/api/state', tD);
    var stSauVay = stateCua(app, idD);
    ktra((stSauVay.giaoHang || []).length === 1,
      'phong toả: chuyến hàng tới nơi đang bị vây thì nằm chờ, không huỷ');
    ktra(stSauVay.planets[0].res.metal < kimTruoc + 777,
      'phong toả: hàng chưa được cộng vào kho khi còn bị vây');
    ktra(stSauVay.giaoHang[0].giu === 1 && stSauVay.giaoHang[0].den_t > stSauVay.now,
      'phong toả: chuyến hàng được hẹn lại đúng lúc vây tan');
    ktra(stSauVay.msgs.some(function (m) { return /kẹt ngoài vòng vây/i.test(m.td || ''); }),
      'phong toả: người mua được báo vì sao hàng chưa tới');

    /* gỡ vây -> hàng tự hạ cánh, không cần ai làm gì thêm */
    app.kho.db.prepare('UPDATE phongtoa SET denT=? WHERE tkA=?').run(gio - 1, idA);
    var stGo = stateCua(app, idD);
    stGo.giaoHang[0].den_t = stGo.now - 1;
    app.kho.db.prepare('UPDATE dq SET state=?,keTiep=0 WHERE tk=?').run(JSON.stringify(stGo), idD);
    await get(app, '/api/state', tD);
    var stXong = stateCua(app, idD);
    ktra((stXong.giaoHang || []).length === 0 &&
      stXong.planets[0].res.metal >= kimTruoc + 777,
      'phong toả: vây tan thì hàng kẹt tự hạ cánh đủ số');
    ktra(stXong.msgs.some(function (m) { return /kẹt đã về tới nơi/i.test(m.td || ''); }),
      'phong toả: có tin báo hàng kẹt đã tới');
    app.kho.db.prepare('UPDATE phongtoa SET denT=? WHERE tkA=?').run(gio + 20000, idA);

    /* hai bên vào chung liên minh thì vây tan ngay, không đợi mốc nào */
    app.kho.db.prepare('UPDATE dq SET lm=? WHERE tk IN (?,?)').run('[HB] Hoà Bình', idA, idD);
    ktra(app.tg.phongToaTai(G.tdKey(cD), idD, gio).length === 0,
      'phong toả: vào chung liên minh thì vòng vây tan ngay lập tức');
    ktra(app.tg.phongToaCua(idD).length === 0,
      'phong toả: pvpToa cũng sạch ngay khi thành đồng minh');
    app.kho.db.prepare('UPDATE dq SET lm=NULL WHERE tk IN (?,?)').run(idA, idD);

    /* hết hạn thì tự hết tác dụng, không cần ai dọn */
    app.kho.db.prepare('UPDATE phongtoa SET denT=? WHERE tkA=?').run(gio - 1, idA);
    ktra(app.tg.phongToaTai(G.tdKey(cD), idD, gio).length === 0,
      'phong toả: dòng đã hết hạn không còn chặn gì');

    /* rời vũ trụ thì projection đi theo (khoá ngoại ON DELETE CASCADE) */
    app.kho.q.ptThem.run(idA, 78, idD, G.tdKey(cD), 'Kẻ Vây', null, gio - 10, gio + 20000);
    var xoa = await post(app, '/api/xoatk', {mk: 'matkhau-vay', xacnhan: 'XOA'}, tA);
    ktra(xoa.status === 200, 'phong toả: xoá được tài khoản kẻ vây');
    ktra(app.kho.db.prepare('SELECT COUNT(*) AS n FROM phongtoa').get().n === 0,
      'phong toả: kẻ vây rời vũ trụ thì mọi vòng vây của họ biến mất');

    ktra(!records.some(function (r) { return r.level === 'error'; }),
      'phong toả: không có lỗi nào lọt vào logger');
  } finally {
    await app.stop().catch(function () {});
    xoaFixture(directory);
  }
}

async function main() {
  await kiemTuCutover();
  await kiemDauVaoXau();
  await kiemCho();
  await kiemPhongToa();
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
