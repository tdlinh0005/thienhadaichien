/* UI — vẽ & vòng cập nhật live (tách từ ui.js) */
'use strict';
var G = window.G, U = window.U, APP = window.APP;

/* ======================================================================
 * VẼ & CẬP NHẬT
 * ==================================================================== */
U.sig = function () {
  var st = U.st(), bt = U.bt(st), s = [st.planets.length, st.msgs.length, st.fleets.length, st.toi.length, bt.cycle,
    bt.missStreak, U.man, U.pi, st.nk.length, st.lm ? st.lm.ten : '-',
    (st.pvpToi || []).map(function (x) { return x.id + ':' + x.nv + ':' + x.den_t; }).join(','),
    (st.pvpGiu || []).map(function (x) { return x.id + ':' + x.giuDen_t + ':' + x.tiepNL_t; }).join(',')];
  for (var i = 0; i < st.planets.length; i++) {
    var p = st.planets[i], ds = U.ds(p);
    s.push(p.qB.length, p.qS.length, p.qS.length ? p.qS[0].n : 0,
      Math.floor(ds.population), ds.supportBp, ds.taxBp, ds.foodShortfallCycle > 0 ? 1 : 0);
  }
  s.push(st.ncQueue ? st.ncQueue.id + ':' + st.ncQueue.status + ':' + st.ncQueue.installmentsLeft + ':' +
    st.ncQueue.finishAt : '-');
  for (var j = 0; j < st.fleets.length; j++) {
    var f = st.fleets[j];
    s.push([f.id, f.mission, f.pha, f.den_t || 0, f.ve_t || 0,
      f.giuDen_t || 0, f.tiepNL_t || 0, JSON.stringify(f.ships || {}),
      JSON.stringify(f.cargo || {})].join(':'));
  }
  return s.join('|');
};

U.ve = function () {
  var st = U.st();
  if (!st) return;
  document.getElementById('tt-res').innerHTML = U.thanhRes();
  U.veMenu(); U.veCanh(); U.veChonHT();
  var f = U['m_' + U.man] || U.m_tongquan;
  document.getElementById('noidung').innerHTML = f();
  document.getElementById('chan-tt').innerHTML =
    'Thiên Hà Đại Chiến — nhãn lịch sử ' + G.PHIEN_BAN_LICH_SU +
      ' · nguyên tác: Trần Châu Quốc Bình &amp; nhóm 3 người (phát triển từ 2004) · ' +
    'máy chủ tốc độ x' + G.C.TOC_DO_SERVER + ' · chu kỳ bảo trì 6 giờ';
  U.sigCu = U.sig();
};

U.live = function () {
  var st = U.st();
  if (!st) return;
  if (U.sig() !== U.sigCu) { U.ve(); return; }
  var p = U.ht(), s = G.sanLuong(st, p), i;
  var els = document.querySelectorAll('[data-live]');
  for (i = 0; i < els.length; i++) {
    var k = els[i].getAttribute('data-live'), v;
    if (k.indexOf('res.') === 0) v = G.soNgan(p.res[k.slice(4)] || 0);
    else if (k.indexOf('rate.') === 0) { var rk = k.slice(5); v = (s.r[rk] >= 0 ? '+' : '') +
      G.soNgan(s.r[rk]) + '/g'; }
    else if (k === 'galana') v = G.soNgan(st.galana);
    else if (k === 'tech') v = G.soNgan(st.techPts);
    if (v !== undefined && els[i].textContent !== v) els[i].textContent = v;
  }
  var ds = document.querySelectorAll('.dem');
  for (i = 0; i < ds.length; i++) {
    var t = +ds[i].getAttribute('data-t');
    ds[i].textContent = G.tg(t - st.now);
  }
};

