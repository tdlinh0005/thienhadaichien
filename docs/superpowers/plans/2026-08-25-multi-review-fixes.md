# Plan: Fix đa góc nhìn — Thiên Hà Đại Chiến
**Nguồn:** 6 agent review song song (security, client/UI, silent-failure, performance, test coverage, server logic)  
**Đối chứng:** 100% finding đã verify code thật trước khi ghi vào plan  
**Ưu tiên:** CRITICAL → HIGH → MEDIUM → LOW  
**Nguyên tắc:** minimal diff, mỗi fix chạy `npm test` ngay, có thì commit riêng

---

## NHÓM 1 — CRITICAL (sửa trước tiên, có thể gây mất tiền thật / state chéo)

### Fix 1.1 — `choMua`: rò khóa `dangTick`/`chuStack` ở 2 nhánh return sớm
**Tệp:** `server/world.js:500, 504`  
**Vấn đề:** 2 nhánh `return 'Đơn này vừa hết hàng.'` và `return 'Cần X Galana.'` gọi `ketThuc(false)` rồi return mà không pop khỏi `dangTick`/`chuStack`. Hậu quả: cả 2 tài khoản bị khoá vĩnh viễn khỏi mọi request; `chuStack` giữ row id rác → `luu` có thể ghi đè state đế quốc A lên row đế quốc B (thiên hà đảo ngược).  
**Cách fix:** Dùng `try/finally` bao toàn bộ body từ dòng push `dangTick`/`chuStack` đến pop — pop theo thứ tự đảo, mọi return đi qua finally.

```
Dòng 495: thêm `var daLuu = false;`
Dòng 497: try {
Dòng 534: bỏ pop ở đây (chuyển vào finally)
Dòng 535: daLuu = true;  // đánh dấu thành công
Dòng 537: } finally { // THÊM — pop đối xứng, mọi return đi qua đây
           var pop = [tkA, hang.tk].sort(); // cùng sort
           for (var pk = pop.length-1; pk >= 0; pk--) {
             if (this.chuStack[this.chuStack.length-1] === pop[pk]) this.chuStack.pop();
             this.dangTick.delete(pop[pk]);
           }
           if (!daLuu) this.ketThuc(false);
         }
XÓA toàn bộ catch cũ ở dòng 539
```

---

### Fix 1.2 — `nap()`: phân biệt "không có" vs "hỏng", log rõ ràng
**Tệp:** `server/world.js:667-669`  
**Vấn đề:** `catch (e) { return null; }` nuốt lỗi parse JSON hỏng im lặng. Caller coi `null` = đế quốc không tồn tại → thông báo sai "đang xử lý" trong khi state đã chết.  
**Cách fix:**
```javascript
try { st = JSON.parse(r.state); } catch (e) {
  console.error('[nap] state hỏng cho tk=' + tk + ', độ dài chuỗi=' + (r.state ? r.state.length : 0), e);
  return { hong: true, tk: tk }; // phân biệt với {st:null}
}
```
Sau đó caller `hanhDong`/`tick` kiểm tra `r.hong`:
```javascript
if (!r || r.hong) return { loi: 'Dữ liệu đế quốc bị hỏng, cần khôi phục từ backup.' };
```

---

### Fix 1.3 — `G.tick` (client/solo): try/catch + guard cạn không nuốt thời gian
**Tệp:** `js/fleet.js:1005-1046`  
**Vấn đề:** (a) exception giữa tick để state bán-biến được autosave; (b) guard 50000 cạn thì `lastTick = now` xoá sạch thời gian chưa mô phỏng.  
**Cách fix:**
```javascript
G.tick = function (st, now) {
  now = now || G.giay();
  G.nangCapState(st, now);
  if (now <= st.lastTick) { st.now = st.lastTick; return; }
  if (G.MO_PHONG_NHE) {
    // ... (phần này bọc try/catch)
    try { /* toàn bộ MO_PHONG_NHE body */ } catch(e) {
      console.error('[tick-solo]', e);
      st.tickLoi = (st.tickLoi || 0) + 1;
    }
    return;
  }
  var guard = 0;
  try {
    while (st.lastTick < now && guard++ < 50000) {
      // ... toàn bộ while
    }
  } catch(e) {
    console.error('[tick-solo]', e);
    st.tickLoi = (st.tickLoi || 0) + 1;
    return; // KHÔNG ghi lastTick
  }
  if (guard >= 50000) {
    console.warn('[tick-solo] guard cạn, sự kiện còn lại: ' + G.sukienKe(st));
    st.tickLoi = (st.tickLoi || 0) + 1;
    return; // KHÔNG ghi lastTick
  }
  st.lastTick = now; st.now = now;
};
```

---

## NHÓM 2 — HIGH

### Fix 2.1 — Panel "Chợ Thiên Hà" chết trong màn Tài Nguyên
**Tệp:** `js/ui.js:429-442` + `js/app.js:113-122`  
**Vấn đề:** v7 đã thay `ban`/`mua` bằng thông báo "Chợ cũ đã đóng", nhưng panel chợ cũ vẫn render nút Bán/Mua. Bấm → toast lỗi.  
**Cách fix:** Thay panel chợ cũ bằng nav đến Tài Chính:
```javascript
// Thay block 429-442 bằng:
h += '<div class="panel"><h3>Ngân Hàng & Thị Trường</h3><div class="noi">';
h += '<p class="mo">Chợ cũ đã đóng. Sử dụng màn <b>Ngân Hàng & Thị Trường</b> để quản lý tài chính.</p>';
h += '<button class="nut oke" data-act="man" data-man="taichinh">Mở Ngân Hàng & Thị Trường</button>';
h += '</div></div>';
```
**Đồng thời** trong `app.js:ban` và `app.js:mua` — thêm check đầu:
```javascript
ban: function (el) { U.toast('Chợ cũ đã đóng. Dùng màn Ngân Hàng & Thị Trường.', 'loi'); },
mua: function (el) { U.toast('Chợ cũ đã đóng. Dùng màn Ngân Hàng & Thị Trường.', 'loi'); },
```

---

### Fix 2.2 — Menu MP mất icon
**Tệp:** `web/js/mp.js:143-161`  
**Vấn đề:** `U.MAN` bị ghi đè bằng mảng không có trường `icon`.  
**Cách fix:** Thêm `icon` vào mỗi entry:
```javascript
U.MAN = [
  { id: 'tongquan', icon: 'tongquan', ten: 'Tổng Quan' },
  { id: 'tainguyen', icon: 'tainguyen', ten: 'Tài Nguyên' },
  { id: 'congtrinh', icon: 'congtrinh', ten: 'Công Trình' },
  { id: 'nghiencuu', icon: 'nghiencuu', ten: 'Nghiên Cứu' },
  { id: 'xuong', icon: 'xuong', ten: 'Xưởng Đóng Tàu' },
  { id: 'phongthu', icon: 'phongthu', ten: 'Phòng Thủ' },
  { id: 'hamdoi', icon: 'hamdoi', ten: 'Hạm Đội' },
  { id: 'thienha', icon: 'thienha', ten: 'Thiên Hà' },
  { id: 'lienminh', icon: 'lienminh', ten: 'Liên Minh' },
  { id: 'taichinh', icon: 'taichinh', ten: 'Ngân Hàng & Thị Trường' },
  { id: 'xephang', icon: 'xephang', ten: 'Bảng Xếp Hạng' },
  { id: 'bangtin', icon: 'bangtin', ten: 'Bảng Tin Vũ Trụ' },
  { id: 'chat', icon: 'chat', ten: 'Phòng Chat' },
  { id: 'mophong', icon: 'mophong', ten: 'Máy Tính Trận' },
  { id: 'tinnhan', icon: 'tinnhan', ten: 'Tin Nhắn' },
  { id: 'huongdan', icon: 'huongdan', ten: 'Hướng Dẫn' },
  { id: 'taikhoan', icon: 'taikhoan', ten: 'Tài Khoản' }
];
```

---

### Fix 2.3 — CSP header + X-Frame-Options
**Tệp:** `server/index.js:44-48`  
**Vấn đề:** Không có CSP, X-Frame-Options, Referrer-Policy → stored XSS trong tên LM là stored-XSS "chờ vận may".  
**Cách fix:**
```javascript
res.writeHead(200, {
  'Content-Type': LOAI[path.extname(tep).toLowerCase()] || 'application/octet-stream',
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self';",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
});
```

---

### Fix 2.4 — Poll MP thất bại hoàn toàn vô hình
**Tệp:** `web/js/mp.js:85-95`  
**Vấn đề:** `dongBo()` fail thì handler rỗng — UI vẫn hiện state cũ, countdown tự nhảy.  
**Cách fix:**
```javascript
var demLoiDongBo = 0;
function dongBo() {
  if (!token) return;
  api('/api/state').then(function (r) {
    demLoiDongBo = 0;
    apDung(r);
    // ... existing logic
  }, function (e) {
    if (++demLoiDongBo >= 2) {
      var tt = document.getElementById('tt-net');
      if (tt) { tt.textContent = '⚠'; tt.style.color = 'var(--cam)'; }
      U.toast('Mất kết nối máy chủ, đang thử lại…', 'loi');
    }
  });
}
```

---

### Fix 2.5 — CSP cho API response
**Tệp:** `server/api.js:28-36`  
**Cách fix:** Thêm header CSP vào response JSON:
```javascript
function json(res, ma, o) {
  var s = JSON.stringify(o);
  res.writeHead(ma, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.end(s);
}
```

---

### Fix 2.6 — `choDangBan`: bọc `G.tick` trong `dangTick`/`chuStack`
**Tệp:** `server/world.js:446-469`  
**Vấn đề:** Gọi `G.tick` trực tiếp không push `dangTick`/`chuStack` → hạm đến hạn trong nhịp đó bị giải quyết với "chủ không xác định".  
**Cách fix:**
```javascript
TheGioi.prototype.choDangBan = function (tk, pi, loai, res, so, gia) {
  var d = this.nap(tk);
  if (!d) return 'Đế quốc không tồn tại.';
  this.batDau();
  this.dangTick.add(tk);
  this.chuStack.push(tk);
  var thanhCong = false;
  try {
    G.tick(d.st, this.mocHoacGio());
    var loi = G.dangBan(d.st, Math.max(0, Math.floor(+pi || 0)), loai === 'tudo' ? 'tudo' : 'sieuthi',
      String(res || '').slice(0, 10), so, gia);
    if (loi) { return loi; }
    // ... phần còn lại giữ nguyên
    this.luu(tk, d.st);
    thanhCong = true;
    return null;
  } catch (e) { throw e; }
  finally {
    this.chuStack.pop();
    this.dangTick.delete(tk);
    this.ketThuc(thanhCong);
  }
};
```

---

### Fix 2.7 — Do thám: `veNha` bị gọi quá sớm khi hook defer
**Tệp:** `js/fleet.js:436-441`  
**Vấn đề:** `doThamNguoi` defer nhưng caller vẫn gọi `veNha(null)` → mission im lặng thất bại.  
**Cách fix:** Chỉ `veNha` khi hook không defer:
```javascript
if (f.mission === 'spy') {
  var biDefer = false;
  if (o.loai === 'nguoi' && G.HOOK && G.HOOK.doThamNguoi) {
    G.HOOK.doThamNguoi(st, f, o);
    if (f.den_t > st.now) biDefer = true; // hook đã defer
  }
  if (!biDefer) {
    if (o.loai === 'npc') G.doThamNPC(st, f, o.npc);
    else if (o.loai === 'trong') G.tin(st, 'tt', 'Báo cáo do thám…', 'Ô toạ độ trống.');
    else G.tin(st, 'tt', 'Báo cáo do thám…', 'Hành tinh của chính ta.');
    veNha(null);
  }
  return;
}
```

---

### Fix 2.8 — Nhịp 1s client: try/catch bảo vệ autosave
**Tệp:** `js/app.js:349-355`  
**Cách fix:**
```javascript
var loiLienTuc = 0;
APP.batDauNhip = function () {
  APP.nhipId = setInterval(function () {
    if (!window.ST) return;
    try {
      G.tick(window.ST, G.giay());
      U.live();
      if (APP.moiGiay) APP.moiGiay();
      loiLienTuc = 0;
    } catch (e) {
      console.error('[nhip]', e);
      if (++loiLienTuc >= 3) {
        clearInterval(APP.nhipId);
        U.hop('Lỗi nghiêm trọng', '<p>Game gặp lỗi liên tiếp. Hãy tải lại trang.</p>');
      }
    }
  }, 1000);
};
```

---

### Fix 2.9 — State version mismatch trong test UI
**Tệp:** `tools/test-mp-ui.mjs:651, 720`  
**Vấn đề:** Test chờ `STATE_VERSION === 6` trong khi engine đã lên 7.  
**Cách fix:**
```javascript
// Dòng 651 và 720:
await pSolo.waitForFunction('window.G && G.STATE_VERSION === 7', null, { timeout: 20000 });
```

---

### Fix 2.10 — `netOK` chỉ đổi màu khi response về — request treo vẫn xanh
**Tệp:** `web/js/mp.js:17-46`  
**Cách fix:** Thêm AbortController timeout:
```javascript
function api(duong, dl, phuongThuc) {
  var abort = new AbortController();
  var timeout = setTimeout(function () { abort.abort(); }, 15000);
  var opt = {
    signal: abort.signal,
    // ...existing
  };
  return fetch(duong, opt)
    .then(function (r) { clearTimeout(timeout); /* ...existing */ })
    .catch(function (e) {
      clearTimeout(timeout);
      netOK(false);
      throw e;
    });
}
```

---

## NHÓM 3 — MEDIUM

### Fix 3.1 — Log đầy đủ ở `nhip`: kẻ tài khoản lỗi không spam vô hạn mà không ai biết
**Tệp:** `server/world.js:1758`  
**Cách fix:**
```javascript
catch (e) { console.error('[nhip] lỗi khi tua đế quốc', ds[i].tk, e); }
```

---

### Fix 3.2 — `catch (e) { }` rỗng ở dọn rác
**Tệp:** `server/index.js:112-117`  
**Cách fix:**
```javascript
} catch (e) { console.error('[don-rac]', e); }
```

---

### Fix 3.3 — `nap` đế quốc nhận fail không có tin nhắn
**Tệp:** `server/world.js:1208`  
**Cách fix:**
```javascript
if (!d) { G.tin(st, 'ham', 'Tiếp tế không giao được', 'Đế quốc nhận tạm không truy cập được, hàng được mang về.'); veNha(null); return; }
```

---

### Fix 3.4 — Đăng ký không transaction → account mồ côi
**Tệp:** `server/api.js:146-155`  
**Cách fix:** Bọc transaction:
```javascript
self.kho.giaoDich(function () {
  self.kho.q.tkThem.run(khoa, hienthi, bam(mk, muoi), muoi, now, now);
  var tk = self.kho.q.tkTheoTen.get(khoa);
  var kq = self.tg.taoDeQuoc(tk.id, hienthi);
  if (kq.loi) throw new Error(kq.loi);
  // ...
});
// Sau try-catch, kiểm tra loi và xoá row tk nếu taoDeQuoc fail
```

---

### Fix 3.5 — Progress bar dân số trong `.dash-the-lon` không hiện
**Tệp:** `css/style.css:220-224`  
**Cách fix:** Thêm rule:
```css
.dash-the-lon .bar{height:4px;border-radius:2px;background:rgba(6,10,22,.9);overflow:hidden;margin-top:3px}
.dash-the-lon .bar>i{display:block;height:100%;border-radius:2px;background:linear-gradient(90deg,var(--lam),var(--luc))}
```

---

### Fix 3.6 — Hộp kết quả máy tính trận mất style
**Tệp:** `css/style.css:243-246`  
**Cách fix:** Thêm rule global:
```css
.kq{padding:7px 11px;margin:6px 0;border-left:3px solid var(--vien2);border-radius:0 6px 6px 0}
.kq.thang{border-color:var(--luc);background:rgba(15,42,28,.55)}
.kq.thua{border-color:var(--do);background:rgba(56,17,28,.55)}
.kq.hoa{border-color:var(--vang);background:rgba(56,47,15,.5)}
```

---

### Fix 3.7 — `G.HANHDONG` lookup cho phép prototype key
**Tệp:** `server/api.js:206`  
**Cách fix:**
```javascript
if (!Object.prototype.hasOwnProperty.call(G.HANHDONG, ten3)) return json(res, 400, { loi: 'Hành động không tồn tại.' });
```

---

### Fix 3.8 — Fallback `[i]` trong tin nhắn — mark sai khi tin mới đến giữa render
**Tệp:** `js/app.js:254-260` + `js/ui.js:1314-1315` + `js/engine.js:841-842`  
**Cách fix:** Thêm `msgSeq` tăng dần vào mỗi tin:
```javascript
// engine.js:841 — khi tạo tin:
G._msgSeq = (G._msgSeq || 0) + 1;
st.msgs.unshift({ id: G._msgSeq, t: st.now, loai: loai, td: tieuDe, nd: noiDung, data: data || null, doc: false });

// app.js:254 — doc-tin dùng id thay vì index:
'doc-tin': function (el) {
  var id = +el.getAttribute('data-id');
  U.moTin[id] = !U.moTin[id];
  var st = U.st();
  for (var i = 0; i < st.msgs.length; i++) {
    if (st.msgs[i].id === id && !st.msgs[i].doc) { st.msgs[i].doc = true; lam('doctin', { id: id }); break; }
  }
  U.ve();
},

// ui.js:1314 — render dùng id:
h += '<div class="tn' + (m.doc ? '' : ' moi') + '"><div class="d" data-act="doc-tin" data-id="' + m.id + '">'
```

---

### Fix 3.9 — Modal không focus + không bắt Esc
**Tệp:** `js/ui.js:27-32`  
**Cách fix:**
```javascript
U.hop = function (td, html) {
  document.getElementById('ht-td').textContent = td;
  document.getElementById('ht-noi').innerHTML = html;
  document.getElementById('hop-thoai').style.display = 'flex';
  var first = document.getElementById('hop-thoai').querySelector('button,input,[tabindex]');
  if (first) first.focus();
  this._hopKey = function (e) { if (e.key === 'Escape') U.dongHop(); };
  document.addEventListener('keydown', this._hopKey);
};
U.dongHop = function () {
  document.getElementById('hop-thoai').style.display = 'none';
  if (this._hopKey) document.removeEventListener('keydown', this._hopKey);
};
```

---

### Fix 3.10 — Thuế rỗng → âm thầm đặt 0%
**Tệp:** `js/app.js:58-61`  
**Cách fix:**
```javascript
doithue: function () {
  var e = document.getElementById('thue-pct');
  if (!e || e.value.trim() === '') { U.toast('Nhập mức thuế % muốn đặt.', 'loi'); return; }
  lam('doithue', { pi: U.pi, thue: Number(e.value) }, 'Đã đổi mức thuế từ chu kỳ hiện tại.');
},
```

---

### Fix 3.11 — Countdown phiếu liên minh dùng `Date.now()` thay vì `st.now`
**Tệp:** `js/ui.js:1003`  
**Cách fix:**
```javascript
// Đổi: G.tg(P.hetHan - Date.now()/1000)
// Thành:
G.tg(P.hetHan - (U.st ? U.st().now : Date.now()/1000))
```

---

### Fix 3.12 — Tên liên minh không sanitize HTML
**Tệp:** `server/world.js:1613`  
**Cách fix:**
```javascript
ten = String(ten || '').trim().slice(0, 32).replace(/<[^>]*>/g, '').trim();
```

---

## NHÓM 4 — LOW

### Fix 4.1 — ROLLBACK fail trong catch rỗng
**Tệp:** `server/db.js:377`  
**Cách fix:**
```javascript
catch (e2) { console.error('[db] ROLLBACK cũng thất bại', e2); }
```

---

### Fix 4.2 — `tat()` exit(0) kể cả khi đóng DB thất bại
**Tệp:** `server/index.js` hàm `tat`  
**Cách fix:** Log rồi exit(1) nếu `kho.dong()` thất bại.

---

### Fix 4.3 — File tĩnh 404 không phân biệt ENOENT vs lỗi khác
**Tệp:** `server/index.js:43`  
**Cách fix:**
```javascript
if (e) {
  if (e.code === 'ENOENT') { res.writeHead(404); res.end('Không có file.'); }
  else { console.error('[file]', e); res.writeHead(500); res.end('Lỗi đọc file.'); }
}
```

---

### Fix 4.4 — `G.so()` làm tròn số âm sai
**Tệp:** `js/util.js:6-11`  
**Cách fix:** Thay `Math.floor` bằng `Math.trunc`:
```javascript
G.so = function (n, p) {
  n = +n || 0;
  if (p !== undefined) return n.toFixed(p);
  if (Math.abs(n) >= 1e6) return Math.trunc(n / 1e6 * 100) / 100 + 'M';
  if (Math.abs(n) >= 1e3) return Math.trunc(n / 1e3 * 100) / 100 + 'K';
  return Math.trunc(n * 100) / 100 + '';
};
```

---

### Fix 4.5 — Đánh số mục trùng trong Hướng Dẫn
**Tệp:** `js/ui.js:1426-1450`  
**Cách fix:** Sửa thủ công các số 3./4./5.

---

### Fix 4.6 — `U.dem` hiện "NaNs" khi giây NaN
**Tệp:** `js/util.js:25-36`  
**Cách fix:**
```javascript
G.tg = function (giay) {
  if (!isFinite(giay)) return '—';
  // ...existing
};
```

---

### Fix 4.7 — Class `.chat-nhap` không định nghĩa
**Tệp:** `css/style.css`  
**Cách fix:** Thêm:
```css
.chat-nhap{border:1px solid rgba(59,84,128,.4);border-radius:6px;padding:8px;background:rgba(9,14,27,.5);color:inherit;font-size:12px}
```

---

## THỨ TỰ THỰC HIỆN

1. **Commit 1 — CRITICALs**: Fix 1.1, 1.2, 1.3 (`choMua` lock leak, `nap` hỏng, tick solo)
2. **Commit 2 — HIGH**: Fix 2.1, 2.2, 2.3, 2.4, 2.5 (UI chết, menu MP, CSP, poll fail, `choDangBan`)
3. **Commit 3 — HIGH tiếp**: Fix 2.6, 2.7, 2.8, 2.9, 2.10
4. **Commit 4 — MEDIUM**: Fix 3.1–3.12
5. **Commit 5 — LOW**: Fix 4.1–4.7
6. **Chạy test**: `npm test` sau mỗi commit
7. **Re-review**: Phóng agent độc lập kiểm tra lại các vùng đã sửa
