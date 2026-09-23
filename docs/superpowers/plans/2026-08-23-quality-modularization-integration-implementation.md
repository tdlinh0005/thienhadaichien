# Quality Modularization and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chia nhỏ các file JavaScript lớn qua facade ổn định, rồi tích hợp toàn bộ cổng chất lượng/CI mà vẫn giữ lịch
sử game, scheduler và UI file:// tương thích.

**Architecture:** Mỗi extraction thêm module nhỏ trước, đưa nó vào source manifest, rồi giữ public facade cũ làm
delegate. Các test bảo vệ output quan sát được: migration state, event advancement có ngân sách chung, HTTP/scheduler
lifecycle và browser file://; không dùng source grep để “chứng minh” refactor. Năm task tách module chỉ bắt đầu sau
khi scheduler durable và orbital UI đã merge, để facade được trích từ hình thái cuối của chúng.

**Tech Stack:** Node.js CommonJS, browser script manifest tĩnh, Node assert, Playwright Chromium dev-only, GitHub
Actions.

**Specs:** [quality-maintainability design](../specs/2026-08-23-quality-maintainability-design.md), [durable scheduler
design](../specs/2026-08-23-durable-event-scheduler-design.md), [UI modernization
design](../specs/2026-08-23-ui-modernization-design.md)

## Revision provenance

- Superseded Modular baseline: SHA-256
  `404b72c6e8c4fb10aab03fea2ef6a7f9e5149e3c344bcd07dd20e9f0128c52a5`, 1,959 lines.
- Accepted socketless remediation proposal: SHA-256
  `f0dc63df15f10a0cc3c0ffc86f0c19f5377d23c2674d56e5bc6b732a74687852`, 471 lines.
- Proposal PASS review: SHA-256
  `8ab94b26a74d9042fa2f046992310b482bdf3f62e15678df166d9cbf663f4bdf`, 92 lines.
- Preceding Round-2 findings: SHA-256
  `5c83e80e84ff8f63c3164e0f7ee7da02f6916379884ec1a5f445e0617f34328d`, 60 lines.
- Round-9 independent review (`CHANGES_REQUIRED`): SHA-256
  `927dd157728ae57dc01ff03c6e9db139e5b8ba52f37b9dc102e2cf8ef9cf1286`, 107 lines.

The PASS applies to the proposal, not to this revised plan. Task 7 remains non-dispatchable until this exact plan
revision is frozen and independently approved.

## Global Constraints

- Chuỗi tuyệt đối: foundation Tasks 1–8 → durable scheduler → orbital UI → Tasks 1–5 dưới đây → Tasks 6–7 dưới đây.
- Tên cross-plan canonical là **modular Tasks 1–5 / CI-integration Tasks 6–7**; không dùng lại nhãn legacy trong
  handoff, interface hay link liên-plan.
- Quy tắc một boundary/PR áp dụng rõ cho phần từng gộp: Task 2 chỉ state/migration; Task 3 chỉ economy/timeline; không
  cherry-pick/chung commit hai task này.
- Dùng tools/source-manifest.js của foundation làm nguồn thứ tự duy nhất; index.html/web/index.html/build/rules loader
  cùng xác nhận nó.
- Không thêm runtime dependency, không đổi engines >=22.5, và browser phải tiếp tục chạy từ file://index.html.
- Scheduler-aware core phải giữ G.tick(st,targetS,options), G.phanLoaiSuKienKe, G.xuLyMotSuKien, G.BLOCKED_EXTERNAL và
  shared budget.
- Cross-plan type cố định: `ExternalRef` là union public của durable scheduler;
  `BlockedExternal={code:'BLOCKED_EXTERNAL',ref:ExternalRef,atS:number}` và
  `AdvanceResult.blockedExternal?:BlockedExternal`; không flatten `code`, `ref` hay `atS` lên result.
- Core test lấy G bằng require("../server/rules.js").G, không import world.G.
- UI extraction là sau orbital UI; giữ U state/focus/drawer/chat và APP.tuaSolo.
- CI quality/core/server matrix Node 22.5.x và 24.x; UI/load chỉ Node 24.x. Không ghi một patch “current” chưa xác
  minh.
- Mọi core extraction phải vào browserScripts, mpScripts và rulesScripts trước facade phụ thuộc; UI/app extraction chỉ
  vào browserScripts và mpScripts, tuyệt đối không vào rulesScripts.
- tools/test-module-manifest.js kiểm mảng exact và không trùng lặp của browserScripts/mpScripts/rulesScripts, rồi kiểm
  index.html/web/index.html qua checkStaticShells; build/check:artifact xác nhận artifact từ cùng manifest, không chỉ
  kiểm includes.
- Mọi JS/MJS mới hoặc sửa trong plan này reflow dưới 120 cột theo foundation Task 2; chỉ URL/chuỗi tư liệu được chú
  thích lint-allow-line mới là ngoại lệ, không dùng baseline/wildcard.
- Task 7 chỉ xác minh Scheduler đã được phê duyệt: không sửa Scheduler plan/source/test, không thêm production bypass,
  owner scalar, factory thứ hai, direct writer hoặc raw cutover write khi dependency upstream thất bại.

## File Structure

| Path | Trách nhiệm sau integration |
|---|---|
| js/core/data-catalog.js | dữ liệu hằng/snapshot thuần |
| js/core/util-format.js | utility không thay state |
| js/core/state.js | tạo, chuẩn hóa và migration state |
| js/core/economy.js | cost, sản xuất và hàng đợi public |
| js/core/timeline.js | maintenance và advance event scheduler-aware |
| js/core/actions.js | dispatch action game |
| js/core/fleet-lifecycle.js | fleet/event lifecycle |
| js/ui/*.js | shell, screen, presenter, renderer UI orbital cuối |
| js/app/*.js | dispatch/solo loop; app facade giữ API solo/retry |
| tools/test-module-manifest.js | exact, duplicate-safe manifest/static-shell gate |
| tools/test-core-facade-surface.js | closed G namespace/member/arity/delegate ownership gate |
| tools/test-economy-timeline-facade.js | production, maintenance, queue và tick regression |
| tools/test-modular-core.js | baseline/regression 50.001 event cùng-second và external |
| .github/workflows/quality.yml | jobs reproducible CI |

---

### Task 1: Tách dữ liệu và utility qua facade ổn định

**Files:**
- Create: js/core/data-catalog.js
- Create: js/core/util-format.js
- Modify: js/data.js:1-900
- Modify: js/util.js:1-900
- Modify: tools/source-manifest.js:1-140
- Modify: index.html (script tags generated từ canonical manifest)
- Modify: web/index.html (script tags generated từ canonical manifest)
- Modify: dist/thien-ha-dai-chien.html (generated artifact)
- Modify: dist/artifact.html (generated artifact)
- Create: tools/test-module-manifest.js
- Create: tools/test-data-util-facade.js

**Interfaces:**
- Consumes: tools/source-manifest.js::{browserScripts,mpScripts,rulesScripts,browserStyles,artifactOutputs};
  tools/check-artifact.js::checkStaticShells; global G từ rules loader foundation.
- Produces: G.dataCatalog, G.utilFormat; js/data.js và js/util.js giữ tất cả public global tên cũ làm facade. Mỗi core
  module có mặt trước facade trong cả browserScripts, mpScripts và rulesScripts; static shells/artifact tiếp tục
  canonical theo manifest.

- [ ] **Step 1: Viết baseline behavior test**

~~~js
const assert = require("node:assert/strict");
const {G} = require("../server/rules.js");
assert.equal(G.so(1234567), "1.234.567");
assert.equal(G.LHT("onhoa").ten, "Ôn Hoà");
~~~

Lưu tại tools/test-data-util-facade.js. Run: node tools/test-data-util-facade.js. Expected: PASS, ghi output baseline
trước extraction.

- [ ] **Step 2: Viết RED manifest test**

~~~js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./source-manifest.js");
const {checkStaticShells} = require("./check-artifact.js");
const root = path.join(__dirname, "..");
const SCRIPT_GROUPS = ["browserScripts", "mpScripts", "rulesScripts"];
function assertStaticShells() {
  checkStaticShells(
    fs.readFileSync(path.join(root, "index.html"), "utf8"),
    fs.readFileSync(path.join(root, "web", "index.html"), "utf8"),
    manifest
  );
}
function assertExactManifest(expected) {
  for (const group of SCRIPT_GROUPS) {
    const actual = manifest[group];
    assert.ok(Array.isArray(actual), group + " must be an array");
    assert.equal(new Set(actual).size, actual.length, group + " has duplicate scripts");
    assert.deepEqual(actual, expected[group], group + " exact canonical order");
  }
  assert.deepEqual(manifest.browserStyles, ["css/style.css"], "exact style list");
  assertStaticShells();
}
const expected = {
  browserScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/engine.js", "js/fleet.js",
    "js/actions.js", "js/ui.js", "js/app.js", "js/main.js"
  ],
  mpScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/engine.js", "js/fleet.js",
    "js/actions.js", "js/ui.js", "js/app.js", "web/js/mp.js"
  ],
  rulesScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/engine.js", "js/fleet.js",
    "js/actions.js"
  ]
};
assertExactManifest(expected);
~~~

Lưu tools/test-module-manifest.js. Mọi helper được khai báo trước assertion; ở Tasks 2–5 chỉ thay hằng `expected`,
không đổi helper hay hạ chuẩn thành subsequence. Run: node tools/test-module-manifest.js. Expected: FAIL vì mọi exact
group đều chưa có hai path; đây là RED thật, baseline ở Step 1 không được ghi là RED.

- [ ] **Step 3: Implement tối thiểu**

Tạo js/core/data-catalog.js và js/core/util-format.js, gắn exports lên G trước khi facade nạp; tại js/data.js:1-900 và
js/util.js:1-900 chỉ delegate:

~~~js
G.so = G.utilFormat.so;
G.LHT = G.dataCatalog.LHT;
~~~

Thêm js/core/data-catalog.js ngay trước js/data.js và js/core/util-format.js ngay trước js/util.js trong **cả**
browserScripts, mpScripts, rulesScripts. Sửa static index.html/web/index.html chỉ bằng thứ tự manifest;
build/check-artifact foundation tự lấy browserScripts và browserStyles từ manifest. Không đổi API callers.

- [ ] **Step 4: GREEN**

Run: node tools/test-module-manifest.js && node tools/test-data-util-facade.js && npm run test:core && npm run build
&& npm run check:artifact. Expected: PASS; ba core group, solo/MP static shell và hai artifact đều thấy module mới
theo đúng manifest.

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add js/core/data-catalog.js js/core/util-format.js js/data.js js/util.js
tools/source-manifest.js index.html web/index.html tools/test-module-manifest.js tools/test-data-util-facade.js
dist/thien-ha-dai-chien.html dist/artifact.html && git commit -m "refactor: extract data and utility facades". Nếu
.git read-only, controller lưu snapshot/diff và commit intent; correctness chỉ cần các gate GREEN.

### Task 2: Tách state và migration qua facade ổn định

**Files:**
- Create: js/core/state.js
- Modify: js/engine.js:1-900
- Modify: tools/source-manifest.js:1-140
- Modify: index.html:10,64-90
- Modify: web/index.html:10,81-110
- Modify: dist/thien-ha-dai-chien.html (generated artifact)
- Modify: dist/artifact.html (generated artifact)
- Modify: tools/test-module-manifest.js
- Create: tools/test-state-facade.js

**Interfaces:**
- Consumes: G.dataCatalog/G.utilFormat Task 1; G từ server/rules.js; module-manifest helpers Task 1.
- Produces: G.state::{STATE_VERSION,moiGame,nangCapState} trước khi engine chạy, cùng G.STATE_VERSION, G.moiGame và
  G.nangCapState qua facade js/engine.js; js/core/state.js đứng trước engine trong browserScripts, mpScripts và
  rulesScripts. PR này không di chuyển economy, timeline, fleet hay action.

- [ ] **Step 1: Viết baseline migration behavior**

~~~js
const assert = require("node:assert/strict");
const {G} = require("../server/rules.js");
function v3State() {
  const state = G.moiGame("Module Migration", "module-v3");
  state.v = 3;
  delete state.moHinhCT; delete state.moHinhNhip; delete state.moHinhQuyDao;
  return state;
}
const old = v3State();
G.nangCapState(old, 1700000000);
assert.equal(old.v, G.STATE_VERSION);
assert.equal(old.moHinhCT, "so-luong-v1");
assert.equal(old.moHinhNhip, "bao-tri-dan-su-v1");
assert.equal(old.moHinhQuyDao, "giu-quy-dao-v1");
const bytes = JSON.stringify(old);
G.nangCapState(old, 1700000000);
assert.equal(JSON.stringify(old), bytes);
assert.throws(() => G.nangCapState({v: G.STATE_VERSION + 1}), /mới hơn engine/);
~~~

Lưu tools/test-state-facade.js. Run: node tools/test-state-facade.js. Expected: PASS baseline v3→v6 với ba marker hiện
có, byte-for-byte idempotence và reject future state. Nó đo migration quan sát được, không tìm text trong source.

- [ ] **Step 2: Viết RED manifest test cho state module**

Thay duy nhất hằng `expected` của Task 1 trong tools/test-module-manifest.js bằng bản dưới đây;
`assertExactManifest(expected)` ở cuối file giữ nguyên. Nó cấm cả thiếu/thừa/đổi thứ tự/duplicate ở từng group:

~~~js
const expected = {
  browserScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/engine.js",
    "js/fleet.js", "js/actions.js", "js/ui.js", "js/app.js", "js/main.js"
  ],
  mpScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/engine.js",
    "js/fleet.js", "js/actions.js", "js/ui.js", "js/app.js", "web/js/mp.js"
  ],
  rulesScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/engine.js",
    "js/fleet.js", "js/actions.js"
  ]
};
assertExactManifest(expected);
~~~

Run: node tools/test-module-manifest.js. Expected: FAIL vì js/core/state.js chưa tồn tại trong browserScripts,
mpScripts và rulesScripts trước js/engine.js.

- [ ] **Step 3: Implement chỉ state/migration boundary**

Di chuyển state creation, STATE_VERSION, normalize và migration từ js/engine.js:1-900 vào js/core/state.js; không di
chuyển G.giaXay, G.sanLuong, G.sanXuat, G.tick hoặc bất kỳ action/fleet body nào. File core phải tạo `G.state` và đặt
đúng ba member `STATE_VERSION`, `moiGame`, `nangCapState` trước khi engine facade đọc chúng. Chèn state trước
js/engine.js trong **cả ba** manifest group, regenerate index.html/web/index.html từ manifest, rồi giữ engine facade
thực thi được:

~~~js
G.STATE_VERSION = G.state.STATE_VERSION;
G.moiGame = G.state.moiGame;
G.nangCapState = G.state.nangCapState;
~~~

- [ ] **Step 4: GREEN**

Run: node tools/test-module-manifest.js && node tools/test-state-facade.js && npm run test:core && npm run build &&
npm run check:artifact. Expected: PASS; state facade, ba manifest group/static shells và artifact đều canonical, còn
economy/timeline untouched cho PR sau.

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add js/core/state.js js/engine.js tools/source-manifest.js index.html
web/index.html tools/test-module-manifest.js tools/test-state-facade.js dist/thien-ha-dai-chien.html
dist/artifact.html && git commit -m "refactor: extract state migration facade". Nếu .git read-only, controller lưu
snapshot/diff và commit intent; correctness chỉ cần các gate GREEN.

### Task 3: Tách economy và timeline scheduler-aware

**Files:**
- Create: js/core/economy.js
- Create: js/core/timeline.js
- Modify: js/engine.js (chỉ facade cho closed `G.economy` surface bên dưới)
- Modify: js/fleet.js (chỉ facade cho closed `G.timeline` surface bên dưới)
- Modify: tools/source-manifest.js:1-140
- Modify: index.html:10,64-90
- Modify: web/index.html:10,81-110
- Modify: dist/thien-ha-dai-chien.html (generated artifact)
- Modify: dist/artifact.html (generated artifact)
- Modify: tools/test-module-manifest.js
- Create: tools/test-economy-timeline-facade.js
- Create: tools/test-core-facade-surface.js

**Interfaces:**
- Consumes: G.state Task 2, durable scheduler event semantics, G từ server/rules.js và module-manifest helpers Task 1.
- Produces closed `G.economy` members: `giaXay`, `giaCongTrinh`, `giaDonVi`, `duTien`, `truTien`, `hoanTien`,
  `thoaDK`, `slYeuCau`, `thieuDK`, `tongSoCT`, `tongCapCT`, `themCongTrinh`, `giamCongTrinh`, `dungTich`, `loaiHT`,
  `sanLuong`, `sanXuat`, `tgXay`, `tgTau`, `tgNC`, `capDangXay`, `soDangXay`, `loMacDinhXay`, `xepXay`, `huyXay`,
  `oToiDa`, `oDaDung`, `oDaDungDuKien`, `xepTau`, `dangDong`, `huyDong`, `xepNC`, `huyNC`.
- Produces closed `G.timeline` members: `phiBaoTriNhip`, `timHanhTinhNhip`, `moTaVectorNhip`, `thatBaiNCNhip`,
  `thanhToanNCNhip`, `gioiHanBpNhip`, `suyThoaiCongTrinhNhip`, `nhipDanSu`, `baoTri`, `congDonVi`, `chayXuong`,
  `sukienKe`, mutable boolean `MO_PHONG_NHE`, mutable string `TICK_PARTIAL` with initial exact value `"Đang tua thời
  gian; thử lại ngay."`, `phanLoaiSuKienKe`, `BLOCKED_EXTERNAL`, `tick`, `xuLySuKien`, `xuLyMotSuKien`.
- Every listed function `G.<name>` remains an arity-preserving identity delegate to that namespace. `G.MO_PHONG_NHE`
  and `G.TICK_PARTIAL` are live getter/setter facades over the same-named `G.timeline` scalars. `TICK_PARTIAL`
  preserves its existing ordinary-assignment behavior: string type, exact initial value and write-through/restore
  behavior; extraction does not reinitialize, coerce or tighten its write semantics. economy/timeline precede their
  facades in browserScripts, mpScripts and rulesScripts. Task 3 owns no fleet/PvP body: `hepRaid`, `dichToi`,
  `chiaHang`, fleet travel/hold/missile/exploration/ground functions remain byte-identical in js/fleet.js for Task 4.

- [ ] **Step 1: Viết baseline economy/timeline behavior**

~~~js
const assert = require("node:assert/strict");
const {G} = require("../server/rules.js");
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function clampStore(value, rate, cap) {
  return Math.max(0, Math.min(cap, value + rate));
}
function fillResources(state, planet) {
  for (const id of G.RES_HANH_TINH) planet.res[id] = 1000000;
  state.galana = 1000000;
  state.techPts = 1000000;
}
function economyState() {
  const nowS = 1700000000;
  const state = G.moiGame(
    "Economy Timeline", "module-economy-timeline", undefined, nowS
  );
  const planet = state.planets[0];
  assert.equal(state.now, nowS, "fixture uses explicit game time");
  state.lastTick = nowS;
  state.baoTri.activatedAt = state.now - 1;
  state.baoTri.nextAt = state.now + G.NHIP_V1.cycleSeconds;
  planet.b.metalMine = 3;
  planet.b.solar = 20;
  planet.b.metalStore = 10;
  planet.b.crystalStore = 10;
  planet.b.deutStore = 10;
  planet.b.silo = 10;
  planet.b.shipyard = 1;
  planet.b.lab = 1;
  return {state, planet};
}
const {state, planet} = economyState();
const price = G.giaXay(G.B("metalMine"), 1);
assert.deepEqual(price, {metal: 60, crystal: 15});
const caps = G.dungTich(planet);
for (const id of G.RES_HANH_TINH) planet.res[id] = Math.floor(caps[id] / 2);
const beforeProduction = clone(planet.res);
const beforeGalana = state.galana;
const beforeTech = state.techPts;
const production = G.sanLuong(state, planet);
G.sanXuat(state, planet, 3600);
for (const id of G.RES_HANH_TINH) {
  assert.equal(planet.res[id], clampStore(beforeProduction[id], production.r[id], caps[id]));
}
assert.equal(state.galana, beforeGalana + production.r.galana);
assert.equal(state.techPts, beforeTech + production.r.tech);
state.now = state.baoTri.nextAt;
state.baoTri.activatedAt = state.now - 1;
const beforeCycle = state.baoTri.cycle;
const beforeNextAt = state.baoTri.nextAt;
const maintenanceFee = G.phiBaoTriNhip(state).phi;
state.galana = maintenanceFee + 1000;
G.baoTri(state);
assert.equal(state.baoTri.cycle, beforeCycle + 1);
assert.equal(state.galana, 1000);
assert.equal(state.baoTri.arrearsGalana, 0);
assert.equal(state.baoTri.nextAt, beforeNextAt + G.NHIP_V1.cycleSeconds);
fillResources(state, planet);
const beforeBuild = clone(planet.res);
assert.equal(G.xepXay(state, planet, "metalMine", 1), null);
assert.equal(planet.qB.length, 1);
assert.equal(planet.qB[0].xong, state.now + planet.qB[0].tg);
G.huyXay(state, planet, 0);
assert.deepEqual(planet.res, beforeBuild);
const beforeShip = clone(planet.res);
assert.equal(G.xepTau(state, planet, "missileLauncher", 2), null);
assert.equal(planet.qS.length, 1);
assert.equal(planet.qS[0].id, "missileLauncher");
assert.equal(planet.qS[0].n, 2);
G.huyDong(state, planet, 0);
assert.deepEqual(planet.res, beforeShip);
const beforeResearch = clone(planet.res);
assert.equal(G.xepNC(state, planet, "energy"), null);
assert.equal(state.ncQueue.id, "energy");
assert.equal(state.ncQueue.planetKey, G.tdKey(planet.c));
assert.ok(state.ncQueue.finishAt > state.now);
G.huyNC(state);
assert.equal(state.ncQueue, null);
assert.deepEqual(planet.res, beforeResearch);
state.lastTick = state.now;
const targetS = state.now + 6 * 60 * 60;
state.nextRaid = targetS + 1;
state.baoTri.nextAt = targetS + 1;
state.nextMaint = state.baoTri.nextAt;
assert.ok(state.nextRaid > targetS);
assert.ok(state.baoTri.nextAt > targetS);
planet.qB.push({id: "metalMine", n: 1, xong: state.now + 60, tg: 0});
const remainingBudget = {value: 50000};
const result = G.tick(state, targetS, {remainingBudget, multiplayer: true});
assert.equal(result.processed, 1);
assert.equal(result.budgetExhausted, false);
assert.equal(result.advancedToS, targetS);
assert.equal(remainingBudget.value, 49999);
~~~

Lưu tools/test-economy-timeline-facade.js. Run: node tools/test-economy-timeline-facade.js. Expected: PASS sau durable
scheduler: fixture dùng exact `nowOverride`, giá/lưu kho/sản xuất một giờ, checkpoint bảo trì, ba pair queue/hủy và
tick +6 giờ đều giữ behavior. `nextRaid` và maintenance nằm sau target, một queue primitive tiêu đúng một
shared-budget unit (50.000→49.999); không có wall-clock hay random raid chen vào. Đây là baseline behavior, không phải
RED fabricated.

- [ ] **Step 2: Viết RED closed public-surface/delegate test**

Tạo tools/test-core-facade-surface.js bằng block hoàn chỉnh dưới. Nó đọc `G` qua canonical rules loader và kiểm module
owner trong cả ba canonical manifest group; không đọc source body hoặc chấp nhận namespace thừa:

~~~js
"use strict";
const assert = require("node:assert/strict");
const manifest = require("./source-manifest.js");
const {G} = require("../server/rules.js");
const GROUPS = ["browserScripts", "mpScripts", "rulesScripts"];
const ECONOMY = {
  giaXay: 2, giaCongTrinh: 2, giaDonVi: 2, duTien: 3, truTien: 3,
  hoanTien: 4, thoaDK: 3, slYeuCau: 2, thieuDK: 3, tongSoCT: 1,
  tongCapCT: 1, themCongTrinh: 3, giamCongTrinh: 3, dungTich: 1,
  loaiHT: 2, sanLuong: 2, sanXuat: 3, tgXay: 3, tgTau: 3, tgNC: 3,
  capDangXay: 2, soDangXay: 2, loMacDinhXay: 2, xepXay: 4, huyXay: 3,
  oToiDa: 1, oDaDung: 1, oDaDungDuKien: 1, xepTau: 4, dangDong: 2,
  huyDong: 3, xepNC: 3, huyNC: 1
};
const TIMELINE = {
  phiBaoTriNhip: 1, timHanhTinhNhip: 2, moTaVectorNhip: 1,
  thatBaiNCNhip: 4, thanhToanNCNhip: 2, gioiHanBpNhip: 2,
  suyThoaiCongTrinhNhip: 2, nhipDanSu: 5, baoTri: 1, congDonVi: 4,
  chayXuong: 3, sukienKe: 1, phanLoaiSuKienKe: 2, BLOCKED_EXTERNAL: 2,
  tick: 3, xuLySuKien: 2, xuLyMotSuKien: 3
};
function assertManifestOwner(modulePath, facadePath) {
  for (const group of GROUPS) {
    const scripts = manifest[group];
    assert.equal(scripts.filter(file => file === modulePath).length, 1, group + " module");
    assert.equal(scripts.filter(file => file === facadePath).length, 1, group + " facade");
    assert.ok(scripts.indexOf(modulePath) < scripts.indexOf(facadePath), group + " owner order");
  }
}
function assertFunctionSurface(namespaceName, expected, extraNames) {
  const namespace = G[namespaceName];
  assert.ok(namespace && typeof namespace === "object", namespaceName + " namespace");
  assert.deepEqual(
    Object.keys(namespace).sort(),
    Object.keys(expected).concat(extraNames || []).sort(),
    namespaceName + " exact members"
  );
  for (const [name, arity] of Object.entries(expected)) {
    assert.equal(typeof namespace[name], "function", namespaceName + "." + name);
    assert.equal(namespace[name].length, arity, name + " arity");
    assert.strictEqual(G[name], namespace[name], name + " facade identity");
  }
}
assertManifestOwner("js/core/economy.js", "js/engine.js");
assertManifestOwner("js/core/timeline.js", "js/fleet.js");
assertFunctionSurface("economy", ECONOMY);
assertFunctionSurface("timeline", TIMELINE, ["MO_PHONG_NHE", "TICK_PARTIAL"]);
assert.strictEqual(G.tongCapCT, G.tongSoCT, "building-count alias identity");
function assertLiveTimelineScalar(name) {
  const oldValue = G[name];
  const descriptor = Object.getOwnPropertyDescriptor(G, name);
  assert.ok(Object.prototype.hasOwnProperty.call(G.timeline, name), name + " namespace member");
  assert.ok(descriptor, name + " public descriptor");
  assert.equal(typeof descriptor.get, "function", name + " facade getter");
  assert.equal(typeof descriptor.set, "function", name + " facade setter");
  assert.equal(typeof G.timeline[name], "boolean", name + " scalar type");
  assert.strictEqual(G[name], G.timeline[name], name + " initial facade value");
  try {
    G[name] = !oldValue;
    assert.strictEqual(G.timeline[name], !oldValue, name + " public setter delegates");
    G.timeline[name] = oldValue;
    assert.strictEqual(G[name], oldValue, name + " public getter remains live");
  } finally {
    G[name] = oldValue;
  }
}
assertLiveTimelineScalar("MO_PHONG_NHE");
const TICK_PARTIAL = "Đang tua thời gian; thử lại ngay.";
const timelinePartial = Object.getOwnPropertyDescriptor(G.timeline, "TICK_PARTIAL");
const publicPartial = Object.getOwnPropertyDescriptor(G, "TICK_PARTIAL");
assert.ok(timelinePartial, "TICK_PARTIAL namespace descriptor");
assert.strictEqual(timelinePartial.value, TICK_PARTIAL, "TICK_PARTIAL exact timeline value");
assert.equal(timelinePartial.writable, true, "TICK_PARTIAL preserves ordinary assignment");
assert.equal(timelinePartial.configurable, true, "TICK_PARTIAL remains configurable");
assert.equal(timelinePartial.enumerable, true, "TICK_PARTIAL remains enumerable");
assert.ok(publicPartial, "TICK_PARTIAL public descriptor");
assert.equal(typeof publicPartial.get, "function", "TICK_PARTIAL facade getter");
assert.equal(typeof publicPartial.set, "function", "TICK_PARTIAL facade setter");
assert.equal(publicPartial.configurable, true, "TICK_PARTIAL facade remains configurable");
assert.equal(publicPartial.enumerable, true, "TICK_PARTIAL facade remains enumerable");
assert.equal(typeof G.TICK_PARTIAL, "string", "TICK_PARTIAL public type");
assert.strictEqual(G.TICK_PARTIAL, TICK_PARTIAL, "TICK_PARTIAL exact public value");
assert.strictEqual(G.TICK_PARTIAL, G.timeline.TICK_PARTIAL, "TICK_PARTIAL facade identity");
try {
  G.TICK_PARTIAL = "partial fixture value";
  assert.strictEqual(G.timeline.TICK_PARTIAL, "partial fixture value", "TICK_PARTIAL setter delegates");
  G.timeline.TICK_PARTIAL = TICK_PARTIAL;
  assert.strictEqual(G.TICK_PARTIAL, TICK_PARTIAL, "TICK_PARTIAL getter remains live");
} finally {
  G.TICK_PARTIAL = TICK_PARTIAL;
}
~~~

Run: node tools/test-core-facade-surface.js. Expected: FAIL vì manifest chưa có js/core/economy.js/js/core/timeline.js
và `G.economy`/`G.timeline` chưa tồn tại. Sau implementation, cùng test cấm thiếu/thừa member, sai arity, wrapper khác
identity, `MO_PHONG_NHE` mất live delegation hoặc `TICK_PARTIAL` khác exact string/mất write-through live delegation.

- [ ] **Step 3: Viết RED manifest test cho economy/timeline**

Thay duy nhất hằng `expected` Task 2 trong tools/test-module-manifest.js bằng bản đầy đủ dưới đây; giữ
`assertExactManifest(expected)` và mọi duplicate/static-shell check:

~~~js
const expected = {
  browserScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/fleet.js", "js/actions.js",
    "js/ui.js", "js/app.js", "js/main.js"
  ],
  mpScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/fleet.js", "js/actions.js",
    "js/ui.js", "js/app.js", "web/js/mp.js"
  ],
  rulesScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/fleet.js", "js/actions.js"
  ]
};
assertExactManifest(expected);
~~~

Run: node tools/test-module-manifest.js. Expected: FAIL vì js/core/economy.js và js/core/timeline.js chưa tồn tại
trong mỗi core group trước facade tương ứng.

- [ ] **Step 4: Implement economy/timeline boundary**

Di chuyển theo symbol, không theo khoảng dòng. js/core/economy.js sở hữu đúng closed set `G.economy` ở Interfaces;
js/core/timeline.js sở hữu đúng closed set `G.timeline`. Dependency helper không public nằm module-scope. Khi chuyển
khởi tạo pre-existing của partial tick, timeline module phải giữ ordinary assignment đúng một lần
`G.timeline.TICK_PARTIAL = "Đang tua thời gian; thử lại ngay."`; facade bên dưới chỉ bridge property này, không gán
lại default hoặc siết khả năng ghi đã có. Đặc biệt `hepRaid`, `dichToi`, `chiaHang`, mọi
travel/hold/missile/exploration/ground body và `G.HANHDONG/G.chay` không được chuyển ở task này. Chèn economy trước
js/engine.js và timeline trước js/fleet.js trong **cả ba** manifest group, regenerate hai static shell/artifact từ
manifest, rồi publish toàn bộ facade exact sau:

~~~js
G.giaXay = G.economy.giaXay;
G.giaCongTrinh = G.economy.giaCongTrinh;
G.giaDonVi = G.economy.giaDonVi;
G.duTien = G.economy.duTien;
G.truTien = G.economy.truTien;
G.hoanTien = G.economy.hoanTien;
G.thoaDK = G.economy.thoaDK;
G.slYeuCau = G.economy.slYeuCau;
G.thieuDK = G.economy.thieuDK;
G.tongSoCT = G.economy.tongSoCT;
G.tongCapCT = G.economy.tongCapCT;
G.themCongTrinh = G.economy.themCongTrinh;
G.giamCongTrinh = G.economy.giamCongTrinh;
G.dungTich = G.economy.dungTich;
G.loaiHT = G.economy.loaiHT;
G.sanLuong = G.economy.sanLuong;
G.sanXuat = G.economy.sanXuat;
G.tgXay = G.economy.tgXay;
G.tgTau = G.economy.tgTau;
G.tgNC = G.economy.tgNC;
G.capDangXay = G.economy.capDangXay;
G.soDangXay = G.economy.soDangXay;
G.loMacDinhXay = G.economy.loMacDinhXay;
G.xepXay = G.economy.xepXay;
G.huyXay = G.economy.huyXay;
G.oToiDa = G.economy.oToiDa;
G.oDaDung = G.economy.oDaDung;
G.oDaDungDuKien = G.economy.oDaDungDuKien;
G.xepTau = G.economy.xepTau;
G.dangDong = G.economy.dangDong;
G.huyDong = G.economy.huyDong;
G.xepNC = G.economy.xepNC;
G.huyNC = G.economy.huyNC;
G.phiBaoTriNhip = G.timeline.phiBaoTriNhip;
G.timHanhTinhNhip = G.timeline.timHanhTinhNhip;
G.moTaVectorNhip = G.timeline.moTaVectorNhip;
G.thatBaiNCNhip = G.timeline.thatBaiNCNhip;
G.thanhToanNCNhip = G.timeline.thanhToanNCNhip;
G.gioiHanBpNhip = G.timeline.gioiHanBpNhip;
G.suyThoaiCongTrinhNhip = G.timeline.suyThoaiCongTrinhNhip;
G.nhipDanSu = G.timeline.nhipDanSu;
G.baoTri = G.timeline.baoTri;
G.congDonVi = G.timeline.congDonVi;
G.chayXuong = G.timeline.chayXuong;
G.sukienKe = G.timeline.sukienKe;
G.phanLoaiSuKienKe = G.timeline.phanLoaiSuKienKe;
G.BLOCKED_EXTERNAL = G.timeline.BLOCKED_EXTERNAL;
G.tick = G.timeline.tick;
G.xuLySuKien = G.timeline.xuLySuKien;
G.xuLyMotSuKien = G.timeline.xuLyMotSuKien;
Object.defineProperty(G, "MO_PHONG_NHE", {
  configurable: true,
  enumerable: true,
  get: function () { return G.timeline.MO_PHONG_NHE; },
  set: function (value) { G.timeline.MO_PHONG_NHE = value; }
});
Object.defineProperty(G, "TICK_PARTIAL", {
  configurable: true,
  enumerable: true,
  get: function () { return G.timeline.TICK_PARTIAL; },
  set: function (value) { G.timeline.TICK_PARTIAL = value; }
});
~~~

Trong namespace, đặt `G.economy.tongCapCT = G.economy.tongSoCT` để giữ alias identity. Mọi loop truyền cùng
`options.remainingBudget` object; không đổi targetS thành wall clock implicit. Test baseline phải xanh trước/after
extraction, gồm refund queue, checkpoint maintenance và một event tiêu đúng một budget unit, nên không được đổi
luật/cân bằng khi move body. Đây là đúng một boundary/commit economy-timeline và tập ownership rời Task 4.

- [ ] **Step 5: GREEN**

Run: node tools/test-module-manifest.js && node tools/test-core-facade-surface.js && node
tools/test-economy-timeline-facade.js && npm run test:core && npm run test:scheduler && npm run build && npm run
check:artifact. Expected: PASS, namespace/member/arity/delegate identity đóng kín; `MO_PHONG_NHE` vẫn live boolean còn
`TICK_PARTIAL` giữ exact initial string và writable live delegation, không đổi giá trị khởi tạo khi extraction;
scheduler vẫn nhận G.tick(st,targetS,options), ba manifest group/static shells và artifact cùng thứ tự.

- [ ] **Step 6: Commit**

Nếu sandbox cho phép index Git, run: git add js/core/economy.js js/core/timeline.js js/engine.js js/fleet.js
tools/source-manifest.js index.html web/index.html tools/test-module-manifest.js tools/test-economy-timeline-facade.js
tools/test-core-facade-surface.js dist/thien-ha-dai-chien.html dist/artifact.html && git commit -m "refactor: extract
economy and scheduler timeline". Nếu .git read-only, controller lưu snapshot/diff và commit intent; correctness chỉ
cần các gate GREEN.

### Task 4: Tách action và fleet lifecycle, giữ regression external/budget

**Files:**
- Create: js/core/actions.js
- Create: js/core/fleet-lifecycle.js
- Modify: js/actions.js (chỉ facade cho closed `G.actions` surface bên dưới)
- Modify: js/fleet.js (chỉ facade cho closed `G.fleetLifecycle` surface bên dưới)
- Modify: tools/source-manifest.js:1-140
- Modify: index.html:10,64-90
- Modify: web/index.html:10,81-110
- Modify: dist/thien-ha-dai-chien.html (generated artifact)
- Modify: dist/artifact.html (generated artifact)
- Modify: tools/test-module-manifest.js
- Modify: tools/test-core-facade-surface.js
- Verify: tools/test-scheduler.js (durable scheduler owner remains its writer)
- Create: tools/test-modular-core.js

**Interfaces:**
- Consumes: G.timeline interface Task 3 and durable scheduler's concrete same-second fixture/AdvanceResult contract; G
  từ server/rules.js.
- Produces closed `G.actions` members: object `HANHDONG` and function `chay(st,ten,dl)`; both public values are
  identity delegates from js/actions.js.
- Produces closed `G.fleetLifecycle` members: `bonusDC`, `tocDoHam`, `tgBay`, `nhienLieu`, `nhienLieuGiu`,
  `nhienLieuGiuTong`, `mocHamKe`, `xoaTrangThaiGiu`, `batDauVe`, `kiemTraGiu`, `batDauGiu`, `hamThanhPheLieu`,
  `nhipGiu`, `hamGiuTai`, `guiHam`, `doiMucTieu`, `goiVe`, `hamToiDich`, `hamVeNha`, `xoaHam`, `doThamNPC`, `hepRaid`,
  `dichToi`, `chiaHang`, `tamTenLua`, `tgTenLua`, `banTenLua`, `noTenLua`, `moTaPha`, `tenLuaToiDich`, `kheThamHiem`,
  `dangThamHiem`, `thamHiem`, `sucChoLinh`, `choLinhCan`, `sucPhaCT`, `phaCongTrinh`, `moTaPhaCT`, `thuMatDat`,
  `gopThuMatDat`, `doBoXuong`.
- Every listed public `G.<name>` remains an arity-preserving identity delegate. Task 4 never owns Task-3 names
  `phiBaoTriNhip` through `xuLyMotSuKien`, including live boolean `MO_PHONG_NHE`, live writable string `TICK_PARTIAL
  === "Đang tua thời gian; thử lại ngay."`, classifier, BLOCKED_EXTERNAL and tick. Hai task tuần tự cùng chạm facade
  js/fleet.js nhưng không chung function body: Task 4 rebase sau Task 3 và giữ nguyên byte-for-byte toàn bộ
  `G.timeline` delegate/scalar block, vì vậy không đổi initial value, type, ordinary-assignment
  writability/configurability/enumerability hoặc live getter/setter của hai scalar. Named durable contract remains
  `BlockedExternal={code:'BLOCKED_EXTERNAL',ref:ExternalRef,atS:number}` nested only at
  `AdvanceResult.blockedExternal?`; shared `options.remainingBudget` is unchanged. Action/fleet modules precede
  facades in all three manifest groups; tools/test-scheduler.js remains scheduler-owned.

- [ ] **Step 1: Viết regression baseline 50.001/external trước extraction**

Tái sử dụng fixture concrete cùng-second ở durable scheduler Task 3 (và AdvanceResult/shared remainingBudget mà
durable reducer Task 4 tiêu thụ), không tự bịa epoch, budget key hay result field. Lưu tools/test-modular-core.js với
mọi helper trước test:

~~~js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {G} = require("../server/rules.js");
function gameWithEventsAt(atS, count) {
  const st = G.moiGame(
    "Ngân sách", "module-budget-" + atS + "-" + count, undefined, atS - 1
  );
  const planet = st.planets[0];
  st.now = atS - 1; st.lastTick = atS - 1;
  st.nextRaid = atS + 9000000;
  st.baoTri.nextAt = atS + 9000000;
  st.nextMaint = st.baoTri.nextAt;
  planet.qB = Array.from({length: count}, () => ({
    id: "metalMine", n: 1, xong: atS, tg: 0
  }));
  return st;
}
function externalAttackState(atS) {
  const st = gameWithEventsAt(atS, 0), home = st.planets[0].c;
  st.fleets.push({
    id: st.fleetIdSeq++, pi: 0, tu: {g: home.g, h: home.h, p: home.p},
    den: {g: home.g, h: home.h + 1, p: home.p}, mission: "attack",
    ships: {fighterL: 1}, linh: {}, cargo: {}, pct: 100,
    diLuc: atS - 30, den_t: atS, veLuc: null, ve_t: null,
    pha: "di", giu: 0, nl: 0, kc: 1, doiHuong: 0
  });
  return st;
}
test("shared remainingBudget leaves the 50.001st same-second event due", () => {
  const st = gameWithEventsAt(2000, 50001);
  const remainingBudget = {value: 50000};
  const result = G.tick(st, 2000, {remainingBudget, multiplayer: true});
  assert.deepEqual({
    processed: result.processed, advancedToS: result.advancedToS,
    nextDueAtS: result.nextDueAtS, hasMoreDue: result.hasMoreDue,
    budgetExhausted: result.budgetExhausted
  }, {
    processed: 50000, advancedToS: 2000, nextDueAtS: 2000,
    hasMoreDue: true, budgetExhausted: true
  });
  assert.equal(remainingBudget.value, 0);
  assert.equal(G.phanLoaiSuKienKe(st).atS, 2000);
});
test("two-argument solo tick continues the same-second remainder", () => {
  const st = gameWithEventsAt(2000, 50001);
  const first = G.tick(st, 2000), second = G.tick(st, 2000);
  assert.equal(first.budgetExhausted, true);
  assert.equal(first.nextDueAtS, 2000);
  assert.equal(second.processed, 1);
  assert.equal(second.hasMoreDue, false);
});
test("external fleet returns AdvanceResult.blockedExternal without consuming its event", () => {
  const st = externalAttackState(3000), oldHook = G.HOOK;
  const targetKey = G.tdKey(st.fleets[0].den);
  G.HOOK = {oNguoi: () => ({loai: "nguoi", tk: 2, key: targetKey})};
  try {
    const next = G.phanLoaiSuKienKe(st, 1);
    assert.deepEqual(next.ref, {
      kind: "fleet", ownerAccountId: 1, fleetId: 1, launchAtS: 2970,
      targetKey, arrivalAtS: 3000, mission: "attack"
    });
    const remainingBudget = {value: 50000};
    const result = G.tick(st, 3000, {
      remainingBudget, multiplayer: true, ownerAccountId: 1
    });
    assert.deepEqual({
      processed: result.processed, advancedToS: result.advancedToS,
      nextDueAtS: result.nextDueAtS, hasMoreDue: result.hasMoreDue,
      budgetExhausted: result.budgetExhausted,
      blockedExternal: result.blockedExternal
    }, {
      processed: 0, advancedToS: 3000, nextDueAtS: 3000, hasMoreDue: true,
      budgetExhausted: false,
      blockedExternal: {code: "BLOCKED_EXTERNAL", ref: next.ref, atS: 3000}
    });
    assert.equal(remainingBudget.value, 50000);
    const stillDue = G.phanLoaiSuKienKe(st, 1);
    assert.equal(stillDue.atS, 3000);
    assert.deepEqual(stillDue.ref, next.ref, "blocked external event remains unconsumed");
  } finally { G.HOOK = oldHook; }
});
~~~

Run: node --test tools/test-modular-core.js. Expected: PASS before extraction, because durable scheduler has already
made this exact behavior green. A blocked external advances game time/production to its barrier but leaves that same
external event due and unconsumed, with the shared budget unchanged. Đây là baseline regression, không phải RED
fabricated.

- [ ] **Step 2: Mở rộng RED closed public-surface/delegate test**

Thay tools/test-core-facade-surface.js của Task 3 bằng file hoàn chỉnh dưới. Ngoài exact namespace/arity/identity,
test chứng minh bốn owner set rời nhau và module đứng trước facade trong canonical manifest:

~~~js
"use strict";
const assert = require("node:assert/strict");
const manifest = require("./source-manifest.js");
const {G} = require("../server/rules.js");
const GROUPS = ["browserScripts", "mpScripts", "rulesScripts"];
const ECONOMY = {
  giaXay: 2, giaCongTrinh: 2, giaDonVi: 2, duTien: 3, truTien: 3,
  hoanTien: 4, thoaDK: 3, slYeuCau: 2, thieuDK: 3, tongSoCT: 1,
  tongCapCT: 1, themCongTrinh: 3, giamCongTrinh: 3, dungTich: 1,
  loaiHT: 2, sanLuong: 2, sanXuat: 3, tgXay: 3, tgTau: 3, tgNC: 3,
  capDangXay: 2, soDangXay: 2, loMacDinhXay: 2, xepXay: 4, huyXay: 3,
  oToiDa: 1, oDaDung: 1, oDaDungDuKien: 1, xepTau: 4, dangDong: 2,
  huyDong: 3, xepNC: 3, huyNC: 1
};
const TIMELINE = {
  phiBaoTriNhip: 1, timHanhTinhNhip: 2, moTaVectorNhip: 1,
  thatBaiNCNhip: 4, thanhToanNCNhip: 2, gioiHanBpNhip: 2,
  suyThoaiCongTrinhNhip: 2, nhipDanSu: 5, baoTri: 1, congDonVi: 4,
  chayXuong: 3, sukienKe: 1, phanLoaiSuKienKe: 2, BLOCKED_EXTERNAL: 2,
  tick: 3, xuLySuKien: 2, xuLyMotSuKien: 3
};
const FLEET = {
  bonusDC: 2, tocDoHam: 2, tgBay: 4, nhienLieu: 4, nhienLieuGiu: 3,
  nhienLieuGiuTong: 3, mocHamKe: 1, xoaTrangThaiGiu: 1, batDauVe: 4,
  kiemTraGiu: 3, batDauGiu: 3, hamThanhPheLieu: 3, nhipGiu: 2,
  hamGiuTai: 2, guiHam: 9, doiMucTieu: 3, goiVe: 2, hamToiDich: 3,
  hamVeNha: 2, xoaHam: 2, doThamNPC: 3, hepRaid: 1, dichToi: 2,
  chiaHang: 3, tamTenLua: 1, tgTenLua: 1, banTenLua: 4, noTenLua: 6,
  moTaPha: 1, tenLuaToiDich: 3, kheThamHiem: 1, dangThamHiem: 1,
  thamHiem: 2, sucChoLinh: 1, choLinhCan: 1, sucPhaCT: 1,
  phaCongTrinh: 3, moTaPhaCT: 1, thuMatDat: 1, gopThuMatDat: 2,
  doBoXuong: 3
};
function assertManifestOwner(modulePath, facadePath) {
  for (const group of GROUPS) {
    const scripts = manifest[group];
    assert.equal(scripts.filter(file => file === modulePath).length, 1, group + " module");
    assert.equal(scripts.filter(file => file === facadePath).length, 1, group + " facade");
    assert.ok(scripts.indexOf(modulePath) < scripts.indexOf(facadePath), group + " owner order");
  }
}
function assertFunctionSurface(namespaceName, expected, extraNames) {
  const namespace = G[namespaceName];
  assert.ok(namespace && typeof namespace === "object", namespaceName + " namespace");
  assert.deepEqual(
    Object.keys(namespace).sort(),
    Object.keys(expected).concat(extraNames || []).sort(),
    namespaceName + " exact members"
  );
  for (const [name, arity] of Object.entries(expected)) {
    assert.equal(typeof namespace[name], "function", namespaceName + "." + name);
    assert.equal(namespace[name].length, arity, name + " arity");
    assert.strictEqual(G[name], namespace[name], name + " facade identity");
  }
}
assertManifestOwner("js/core/economy.js", "js/engine.js");
assertManifestOwner("js/core/timeline.js", "js/fleet.js");
assertManifestOwner("js/core/fleet-lifecycle.js", "js/fleet.js");
assertManifestOwner("js/core/actions.js", "js/actions.js");
assertFunctionSurface("economy", ECONOMY);
assertFunctionSurface("timeline", TIMELINE, ["MO_PHONG_NHE", "TICK_PARTIAL"]);
assertFunctionSurface("fleetLifecycle", FLEET);
assert.ok(G.actions && typeof G.actions === "object", "actions namespace");
assert.deepEqual(Object.keys(G.actions).sort(), ["HANHDONG", "chay"]);
assert.strictEqual(G.HANHDONG, G.actions.HANHDONG, "action table identity");
assert.equal(typeof G.HANHDONG, "object");
assert.equal(G.actions.chay.length, 3);
assert.strictEqual(G.chay, G.actions.chay, "action dispatcher identity");
assert.strictEqual(G.tongCapCT, G.tongSoCT, "building-count alias identity");
const ownedNames = [
  ...Object.keys(ECONOMY), ...Object.keys(TIMELINE), "MO_PHONG_NHE", "TICK_PARTIAL",
  ...Object.keys(FLEET), "HANHDONG", "chay"
];
assert.equal(new Set(ownedNames).size, ownedNames.length, "Task 3/4 ownership is disjoint");
function assertPreservedTimelineBoolean(name) {
  const oldValue = G[name];
  const descriptor = Object.getOwnPropertyDescriptor(G, name);
  assert.ok(Object.prototype.hasOwnProperty.call(G.timeline, name), name + " namespace member");
  assert.ok(descriptor, name + " public descriptor");
  assert.equal(typeof descriptor.get, "function", name + " facade getter");
  assert.equal(typeof descriptor.set, "function", name + " facade setter");
  assert.equal(typeof G.timeline[name], "boolean", name + " scalar type");
  assert.strictEqual(G[name], G.timeline[name], name + " initial facade value");
  try {
    G[name] = !oldValue;
    assert.strictEqual(G.timeline[name], !oldValue, name + " public setter delegates");
    G.timeline[name] = oldValue;
    assert.strictEqual(G[name], oldValue, name + " public getter remains live");
  } finally {
    G[name] = oldValue;
  }
}
assertPreservedTimelineBoolean("MO_PHONG_NHE");
const TICK_PARTIAL = "Đang tua thời gian; thử lại ngay.";
const timelinePartial = Object.getOwnPropertyDescriptor(G.timeline, "TICK_PARTIAL");
const publicPartial = Object.getOwnPropertyDescriptor(G, "TICK_PARTIAL");
assert.ok(timelinePartial, "TICK_PARTIAL namespace descriptor survives Task 4");
assert.strictEqual(timelinePartial.value, TICK_PARTIAL, "TICK_PARTIAL initial value survives Task 4");
assert.equal(timelinePartial.writable, true, "TICK_PARTIAL remains writable");
assert.equal(timelinePartial.configurable, true, "TICK_PARTIAL remains configurable");
assert.equal(timelinePartial.enumerable, true, "TICK_PARTIAL remains enumerable");
assert.ok(publicPartial, "TICK_PARTIAL public descriptor survives Task 4");
assert.equal(typeof publicPartial.get, "function", "TICK_PARTIAL facade getter survives Task 4");
assert.equal(typeof publicPartial.set, "function", "TICK_PARTIAL facade setter survives Task 4");
assert.equal(publicPartial.configurable, true, "TICK_PARTIAL facade remains configurable");
assert.equal(publicPartial.enumerable, true, "TICK_PARTIAL facade remains enumerable");
assert.equal(typeof G.TICK_PARTIAL, "string", "TICK_PARTIAL string type survives Task 4");
try {
  G.TICK_PARTIAL = "partial fixture value";
  assert.strictEqual(G.timeline.TICK_PARTIAL, "partial fixture value", "TICK_PARTIAL setter survives Task 4");
  G.timeline.TICK_PARTIAL = TICK_PARTIAL;
  assert.strictEqual(G.TICK_PARTIAL, TICK_PARTIAL, "TICK_PARTIAL getter survives Task 4");
} finally {
  G.TICK_PARTIAL = TICK_PARTIAL;
}
~~~

Run: node tools/test-core-facade-surface.js. Expected: FAIL trước Task-4 extraction vì hai new module paths và
`G.fleetLifecycle`/`G.actions` chưa tồn tại; Task-3 economy/timeline assertions vẫn PASS. Đây là RED public surface
thật, độc lập với RED exact-manifest tiếp theo.

- [ ] **Step 3: Viết RED manifest test**

Thay duy nhất hằng `expected` Task 3 trong tools/test-module-manifest.js bằng phiên bản đầy đủ sau;
`assertExactManifest(expected)` vẫn kiểm exact arrays, duplicate và static shells:

~~~js
const expected = {
  browserScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/core/fleet-lifecycle.js",
    "js/fleet.js", "js/core/actions.js", "js/actions.js", "js/ui.js",
    "js/app.js", "js/main.js"
  ],
  mpScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/core/fleet-lifecycle.js",
    "js/fleet.js", "js/core/actions.js", "js/actions.js", "js/ui.js",
    "js/app.js", "web/js/mp.js"
  ],
  rulesScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/core/fleet-lifecycle.js",
    "js/fleet.js", "js/core/actions.js", "js/actions.js"
  ]
};
assertExactManifest(expected);
~~~

Run: node tools/test-module-manifest.js. Expected: FAIL vì js/core/fleet-lifecycle.js và js/core/actions.js chưa có
trong mọi core group.

- [ ] **Step 4: Implement closed action/fleet boundary**

Di chuyển theo symbol, không theo khoảng dòng. js/core/actions.js tạo closed `G.actions`; js/core/fleet-lifecycle.js
tạo closed `G.fleetLifecycle` với đúng member trong Interfaces. Helper dependency không public nằm module-scope. Không
lấy lại bất kỳ Task-3 body nào, kể cả maintenance, production queue advancement, `sukienKe`, `MO_PHONG_NHE`,
`TICK_PARTIAL`, classifier/BLOCKED_EXTERNAL/tick/event dispatcher. Chèn fleet-lifecycle trước js/fleet.js và
core/actions trước js/actions.js trong browserScripts, mpScripts, rulesScripts; regenerate hai static shell/artifact.
Facade đầy đủ là:

~~~js
G.bonusDC = G.fleetLifecycle.bonusDC;
G.tocDoHam = G.fleetLifecycle.tocDoHam;
G.tgBay = G.fleetLifecycle.tgBay;
G.nhienLieu = G.fleetLifecycle.nhienLieu;
G.nhienLieuGiu = G.fleetLifecycle.nhienLieuGiu;
G.nhienLieuGiuTong = G.fleetLifecycle.nhienLieuGiuTong;
G.mocHamKe = G.fleetLifecycle.mocHamKe;
G.xoaTrangThaiGiu = G.fleetLifecycle.xoaTrangThaiGiu;
G.batDauVe = G.fleetLifecycle.batDauVe;
G.kiemTraGiu = G.fleetLifecycle.kiemTraGiu;
G.batDauGiu = G.fleetLifecycle.batDauGiu;
G.hamThanhPheLieu = G.fleetLifecycle.hamThanhPheLieu;
G.nhipGiu = G.fleetLifecycle.nhipGiu;
G.hamGiuTai = G.fleetLifecycle.hamGiuTai;
G.guiHam = G.fleetLifecycle.guiHam;
G.doiMucTieu = G.fleetLifecycle.doiMucTieu;
G.goiVe = G.fleetLifecycle.goiVe;
G.hamToiDich = G.fleetLifecycle.hamToiDich;
G.hamVeNha = G.fleetLifecycle.hamVeNha;
G.xoaHam = G.fleetLifecycle.xoaHam;
G.doThamNPC = G.fleetLifecycle.doThamNPC;
G.hepRaid = G.fleetLifecycle.hepRaid;
G.dichToi = G.fleetLifecycle.dichToi;
G.chiaHang = G.fleetLifecycle.chiaHang;
G.tamTenLua = G.fleetLifecycle.tamTenLua;
G.tgTenLua = G.fleetLifecycle.tgTenLua;
G.banTenLua = G.fleetLifecycle.banTenLua;
G.noTenLua = G.fleetLifecycle.noTenLua;
G.moTaPha = G.fleetLifecycle.moTaPha;
G.tenLuaToiDich = G.fleetLifecycle.tenLuaToiDich;
G.kheThamHiem = G.fleetLifecycle.kheThamHiem;
G.dangThamHiem = G.fleetLifecycle.dangThamHiem;
G.thamHiem = G.fleetLifecycle.thamHiem;
G.sucChoLinh = G.fleetLifecycle.sucChoLinh;
G.choLinhCan = G.fleetLifecycle.choLinhCan;
G.sucPhaCT = G.fleetLifecycle.sucPhaCT;
G.phaCongTrinh = G.fleetLifecycle.phaCongTrinh;
G.moTaPhaCT = G.fleetLifecycle.moTaPhaCT;
G.thuMatDat = G.fleetLifecycle.thuMatDat;
G.gopThuMatDat = G.fleetLifecycle.gopThuMatDat;
G.doBoXuong = G.fleetLifecycle.doBoXuong;
G.HANHDONG = G.actions.HANHDONG;
G.chay = G.actions.chay;
~~~

Các module core test phải use:

~~~js
const {G} = require("../server/rules.js");
~~~

Không dùng require("../server/world.js").G. Không để APP hoặc game loop gọi tick trực tiếp với signature cũ; giữ
G.tick(st,targetS,options), options.remainingBudget chung, G.phanLoaiSuKienKe/G.xuLyMotSuKien/BLOCKED_EXTERNAL và
APP.tuaSolo. `hamToiDich(st,f,options)` và `tenLuaToiDich(st,tl,options)` giữ arity 3 của durable scheduler; không rút
lại thành facade arity 2 cũ.

- [ ] **Step 5: GREEN**

Run: node tools/test-module-manifest.js && node tools/test-core-facade-surface.js && node --test
tools/test-modular-core.js && npm run test:scheduler && npm run test:core && npm run build && npm run check:artifact.
Expected: PASS, four closed owner sets rời nhau với exact arity/identity; `MO_PHONG_NHE` vẫn live boolean còn
`TICK_PARTIAL` giữ exact initial string và write-through getter/setter qua Task 4; 50.001 events stop at shared limit,
external returns AdvanceResult.blockedExternal mà không advance sai, và cả ba manifest group/static shell/artifact
cùng thứ tự.

- [ ] **Step 6: Commit**

Nếu sandbox cho phép index Git, run: git add js/core/actions.js js/core/fleet-lifecycle.js js/actions.js js/fleet.js
tools/source-manifest.js index.html web/index.html tools/test-module-manifest.js tools/test-core-facade-surface.js
tools/test-modular-core.js dist/thien-ha-dai-chien.html dist/artifact.html && git commit -m "refactor: extract actions
and fleet lifecycle". Nếu .git read-only, controller lưu snapshot/diff và commit intent; correctness chỉ cần các gate
GREEN.

### Task 5: Tách UI/app sau orbital UI mà giữ state, focus, drawer và chat

**Files:**
- Create: js/ui/shell.js
- Create: js/ui/screens.js
- Create: js/ui/presenter.js
- Create: js/ui/render.js
- Create: js/app/dispatch.js
- Create: js/app/solo-loop.js
- Modify: js/ui.js:1-2200
- Modify: js/app.js:1-900
- Modify: js/main.js:57-190 (solo APP facade/private bodies)
- Modify: web/js/mp.js:62-665 (MP renderer/app private bodies and final APP.thuLai facade)
- Modify: tools/source-manifest.js:1-140
- Modify: index.html:10,64-110
- Modify: web/index.html:10,81-130
- Modify: dist/thien-ha-dai-chien.html (generated artifact)
- Modify: dist/artifact.html (generated artifact)
- Modify: tools/test-module-manifest.js
- Modify: tools/test-mp-ui.mjs: UI Task 9, after `KEYBOARD_BOOTSTRAP_END` snapshots and before
  `KEYBOARD_GAMEPLAY_START`

**Interfaces:**
- Consumes: surface orbital đã hoàn tất cùng source manifest, focus/drawer/chat behavior. Khoá U common gồm `esc(s)`,
  `st()`, `ht()`, `toast(message,kind)`, `hop(title,html,options)`, `dongHop()`, `dem(ts,suffix)`,
  `gia(cost,planet,state)`, `dsRes(resources,compact)`, `htTheoKey(key)`, `bt(state)`, `ds(planet)`, `bp(value)`,
  `ncConLai(queue)`, `ncKyTiep(queue)`, `dsTau(units)`, `thanhRes()`, `veMenu()`, `veCanh()`, `veChonHT()`,
  `theCT(state,planet,building)`, `theDonVi(state,planet,unit,kind)`, `formMoi()`, `capNhatForm()`, `ttBay()`,
  `veBaoCao(report)`, `veDoTham(report)`, `veBaoCaoTenLua(report)`, `sig()`, `ve()`, `live()`, `mpMoi()`,
  `mpNapDoTham(key)`, `mpDoc()`, `mpChay()`, `chupTrang()`, `phucHoiTrang(snapshot)`, `tieuDeMan()`,
  `datDrawer(open)`, `chuyenDrawer()`, `giuTabTrongHop(event)`, `nhanTruong(id,label,controlHtml,helpHtml)`,
  `bang(id,caption,headHtml,bodyHtml,className)`, `chuanHoaNoiDung(root)` và renderer
  `m_tongquan/m_tainguyen/m_congtrinh/m_nghiencuu/m_xuong/m_phongthu/m_hamdoi` và
  `m_thienha/m_lienminh/m_xephang/m_tinnhan/m_nhatky/m_huongdan/m_mophong`
  (arity 0). MP bổ sung `m_bangtin/m_chat/m_taikhoan` (arity 0). State public đóng kín gồm `U.ui`, `U.MAN`, `U.HU`,
  `U.XH_LOAI`, `U.MP_LAN`, `U.nguon`, `U.man`, `U.pi`, `U.gal`, `U.form`, `U.cho`, `U.moTin`, `U.sigCu`, `U.xhLoai`,
  `APP.ACT` và `APP.mp`; `U.mp` là state lazy, chưa có own property cho tới render `m_mophong` thực sự chạy.
- Consumes: app common `APP.gui(ten,dl,okMsg)`, `APP.themACT(actions)`, `APP.batDauNhip()`, `APP.tuaSolo()` và
  `APP.ACT`; solo `APP.lam(ten,dl,xong)`, `APP.luu(immediate)`, `APP.moiGiay()`, `APP.doiFile(event)`; MP
  `APP.lam(ten,dl,xong)`, `APP.taiXepHang(loai)`, `APP.taiHe(g,h)`, `APP.luu()`, `APP.moiGiay()`, `APP.hienLai()`,
  `APP.thuLai(key)`. `U.nguon` giữ solo `{xemHe(g,h),xepHang(loai),dsLM()}` hoặc MP
  `{xemHe(g,h),xepHang(),dsLM(),thanhVien(),daXin(ten)}`.
- Produces: mọi function nêu trên với cùng arity, receiver và toàn bộ arguments. `U.gal` là `null|{g:number,h:number}`
  do `m_thienha` dùng; `U.form` là `null|{den:{g,h,p},mission,pct,ships,linh,cargo,giu}` do màn hạm đội dùng;
  `U.sigCu` là string fingerprint mà `ve/live` đọc-ghi; `U.mp` chỉ xuất hiện qua nhánh existing `m_mophong`, rồi là
  `{A:{ships,tech},D:{ships,def,tech,res},nguon,kq}`. Shell không khai báo `U.mp` hoặc shadow state; screens chỉ
  materialize đúng object live khi simulator render. `U.ui`, `U.MAN`, `U.nguon`, `U.gal`, `U.form`, `U.cho`, `U.moTin`
  và `APP.ACT` giữ object identity qua render; `U.mp` giữ identity sau khi lazy-materialize và bị trả về absence ban
  đầu khi fixture kết thúc; `U.sigCu` phải được render cập nhật rồi fixture khôi phục đúng scalar trước test.
  `U.hop/U.dongHop` tiếp tục là dialog, không alias thành drawer. Sáu module mới chỉ vào browserScripts/mpScripts,
  trước facade tương ứng; rulesScripts không chứa UI/app.

- [ ] **Step 1: Viết RED manifest/static-shell gate**

Trong tools/test-module-manifest.js, giữ helper Task 1 và thay duy nhất hằng `expected` Task 4 bằng block dưới đây.
`assertExactManifest(expected)` sẽ kiểm exact arrays/duplicate/static-shell, vì vậy không còn acceptance dựa trên
inclusion hoặc subsequence:

~~~js
const expected = {
  browserScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/core/fleet-lifecycle.js",
    "js/fleet.js", "js/core/actions.js", "js/actions.js",
    "js/ui/shell.js", "js/ui/screens.js", "js/ui/presenter.js", "js/ui/render.js",
    "js/ui.js", "js/app/dispatch.js", "js/app/solo-loop.js", "js/app.js", "js/main.js"
  ],
  mpScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/core/fleet-lifecycle.js",
    "js/fleet.js", "js/core/actions.js", "js/actions.js",
    "js/ui/shell.js", "js/ui/screens.js", "js/ui/presenter.js", "js/ui/render.js",
    "js/ui.js", "js/app/dispatch.js", "js/app/solo-loop.js", "js/app.js", "web/js/mp.js"
  ],
  rulesScripts: [
    "js/core/data-catalog.js", "js/data.js",
    "js/core/util-format.js", "js/util.js",
    "js/galaxy.js", "js/combat.js", "js/core/state.js", "js/core/economy.js",
    "js/engine.js", "js/core/timeline.js", "js/core/fleet-lifecycle.js",
    "js/fleet.js", "js/core/actions.js", "js/actions.js"
  ]
};
assertExactManifest(expected);
~~~

Run: node tools/test-module-manifest.js. Expected: FAIL thật với browserScripts exact canonical order (thiếu
js/ui/shell.js); sau đó cùng test sẽ bắt mpScripts/rulesScripts thừa-thiếu-trùng hoặc static shell sai thứ tự.

- [ ] **Step 2: Viết browser behavior baseline**

Trong UI Task 9, đặt đoạn sau đúng insertion point đã freeze: sau literal `/* KEYBOARD_BOOTSTRAP_END */` và hai
snapshot `stateMpTruoc`/`stateSoloTruoc`, nhưng trước literal `/* KEYBOARD_GAMEPLAY_START */`. Khi đó
`vaoManBangBanPhim`, `chupGameplay`, `p1`, `pSolo` và `ktra` đã tồn tại. Probe phải nằm ngoài cả ba guarded source
slice `BOOTSTRAP/GAMEPLAY/RESTART`; không di chuyển marker để lách guard, vì probe đã duyệt chủ động dùng
`.focus/.click/.fill`. `pSolo` chưa đi qua mophong, nên được kiểm đầu tiên với `expectLazyAbsence`; shell nào eager
tạo own `U.mp` sẽ fail ngay entry. Fixture chỉ materialize qua `U.man="mophong"; U.ve()` (nhánh simulator thật) và
`finally` trả lại absence nếu ban đầu chưa own property. Dùng đúng Playwright harness hiện hữu, không tạo page/assert
không tồn tại và không dùng $eval/$$eval:

~~~js
var UI_PUBLIC = {
  commonU: {
    esc: 1, st: 0, ht: 0, toast: 2, hop: 3, dongHop: 0, dem: 2, gia: 3,
    dsRes: 2, htTheoKey: 1, bt: 1, ds: 1, bp: 1, ncConLai: 1, ncKyTiep: 1,
    dsTau: 1, thanhRes: 0, veMenu: 0, veCanh: 0, veChonHT: 0,
    m_tongquan: 0, m_tainguyen: 0, theCT: 3, m_congtrinh: 0,
    m_nghiencuu: 0, theDonVi: 4, m_xuong: 0, m_phongthu: 0, formMoi: 0,
    capNhatForm: 0, ttBay: 0, m_hamdoi: 0, m_thienha: 0, m_lienminh: 0,
    m_xephang: 0, veBaoCao: 1, veDoTham: 1, veBaoCaoTenLua: 1,
    m_tinnhan: 0, m_nhatky: 0, m_huongdan: 0, sig: 0, ve: 0, live: 0,
    mpMoi: 0, mpNapDoTham: 1, mpDoc: 0, mpChay: 0, m_mophong: 0,
    chupTrang: 0, phucHoiTrang: 1, tieuDeMan: 0, datDrawer: 1,
    chuyenDrawer: 0, giuTabTrongHop: 1, nhanTruong: 4, bang: 5,
    chuanHoaNoiDung: 1
  },
  multiplayerU: {m_bangtin: 0, m_chat: 0, m_taikhoan: 0},
  source: {
    solo: {xemHe: 2, xepHang: 1, dsLM: 0},
    multiplayer: {xemHe: 2, xepHang: 0, dsLM: 0, thanhVien: 0, daXin: 1}
  },
  commonApp: {gui: 3, themACT: 1, batDauNhip: 0, tuaSolo: 0},
  soloApp: {lam: 3, luu: 1, moiGiay: 0, doiFile: 1},
  multiplayerApp: {
    lam: 3, taiXepHang: 1, taiHe: 2, luu: 0, moiGiay: 0, hienLai: 0,
    thuLai: 1
  },
  stateU: [
    "ui", "MAN", "HU", "XH_LOAI", "MP_LAN", "nguon", "man", "pi", "gal",
    "form", "cho", "moTin", "sigCu", "xhLoai"
  ],
  lazyStateU: ["mp"],
  stateApp: ["ACT", "mp"]
};
function tronMatCongKhai() {
  return Object.assign.apply(Object, [{}].concat(Array.prototype.slice.call(arguments)));
}
function thongSoMatCongKhai(mode) {
  var multiplayer = mode === "multiplayer";
  return {
    u: tronMatCongKhai(UI_PUBLIC.commonU, multiplayer ? UI_PUBLIC.multiplayerU : {}),
    app: tronMatCongKhai(
      UI_PUBLIC.commonApp,
      multiplayer ? UI_PUBLIC.multiplayerApp : UI_PUBLIC.soloApp
    ),
    source: multiplayer ? UI_PUBLIC.source.multiplayer : UI_PUBLIC.source.solo,
    stateU: UI_PUBLIC.stateU,
    lazyStateU: UI_PUBLIC.lazyStateU,
    stateApp: UI_PUBLIC.stateApp,
    expectLazyAbsence: mode === "solo",
    multiplayer: multiplayer
  };
}
async function kiemMatCongKhai(page, spec) {
  return await page.evaluate(function (spec) {
    var missing = [], wrongArity = [], unexpected = [];
    function own(owner, name) {
      return Object.prototype.hasOwnProperty.call(owner, name);
    }
    var hadMpBefore = own(U, "mp");
    var mpBefore = U.mp;
    function check(owner, names, prefix) {
      Object.keys(names).forEach(function (name) {
        if (typeof owner[name] !== "function") missing.push(prefix + name);
        else if (owner[name].length !== names[name]) wrongArity.push(prefix + name);
      });
    }
    function checkClosed(owner, names, states, prefix) {
      Object.keys(owner).forEach(function (name) {
        if (name.charAt(0) !== "_" && names.indexOf(name) < 0 && states.indexOf(name) < 0) {
          unexpected.push(prefix + name);
        }
      });
    }
    check(U, spec.u, "U.");
    check(APP, spec.app, "APP.");
    spec.stateU.forEach(function (name) { if (!own(U, name)) missing.push("U." + name); });
    spec.stateApp.forEach(function (name) { if (!own(APP, name)) missing.push("APP." + name); });
    checkClosed(U, Object.keys(spec.u), spec.stateU.concat(spec.lazyStateU), "U.");
    checkClosed(APP, Object.keys(spec.app), spec.stateApp, "APP.");
    if (spec.expectLazyAbsence && hadMpBefore) missing.push("U.mp lazy absence");
    if (!U.nguon || typeof U.nguon !== "object") missing.push("U.nguon");
    else check(U.nguon, spec.source, "U.nguon.");
    if (!U.ui || typeof U.ui !== "object") missing.push("U.ui");
    if (!Array.isArray(U.MAN)) missing.push("U.MAN");
    if (!U.HU || typeof U.HU !== "object") missing.push("U.HU");
    if (!Array.isArray(U.XH_LOAI)) missing.push("U.XH_LOAI");
    if (typeof U.MP_LAN !== "number") missing.push("U.MP_LAN");
    if (!APP.ACT || typeof APP.ACT !== "object") missing.push("APP.ACT");
    if (typeof APP.mp !== "boolean") missing.push("APP.mp");
    else if (APP.mp !== spec.multiplayer) missing.push("APP.mp mode");
    var uiBefore = U.ui;
    var manBefore = U.MAN, huBefore = U.HU, ranksBefore = U.XH_LOAI;
    var actBefore = APP.ACT, nguonBefore = U.nguon, cyclesBefore = U.MP_LAN;
    var sigFacadeBefore = U.sig, veFacadeBefore = U.ve, liveFacadeBefore = U.live;
    var stateBefore = {
      gal: U.gal, form: U.form, sigCu: U.sigCu, mp: mpBefore, cho: U.cho,
      moTin: U.moTin, man: U.man, pi: U.pi, xhLoai: U.xhLoai
    };
    var sigCuShape = typeof stateBefore.sigCu === "string";
    var probeKey = "__qualityFacadeProbe";
    var hadProbe = !!uiBefore && own(uiBefore, probeKey);
    var oldProbe = uiBefore && uiBefore[probeKey];
    var result;
    try {
      if (uiBefore) uiBefore[probeKey] = true;
      var planet = U.ht();
      var galProbe = stateBefore.gal || {
        g: planet && planet.c ? planet.c.g : NaN,
        h: planet && planet.c ? planet.c.h : NaN
      };
      var formProbe = stateBefore.form || U.formMoi();
      var needsMpRender = !hadMpBefore || !stateBefore.mp;
      var mpProbe = stateBefore.mp;
      var lazyMaterializedByRender = false;
      if (needsMpRender) {
        U.man = "mophong";
        U.ve();
        mpProbe = U.mp;
        lazyMaterializedByRender = own(U, "mp") && !!mpProbe;
        U.man = stateBefore.man;
      }
      U.gal = galProbe;
      U.form = formProbe;
      var galShape = !!galProbe && typeof galProbe.g === "number" &&
        typeof galProbe.h === "number";
      var formShape = !!formProbe && !!formProbe.den &&
        typeof formProbe.den.g === "number" && typeof formProbe.den.h === "number" &&
        typeof formProbe.den.p === "number" && typeof formProbe.mission === "string" &&
        typeof formProbe.pct === "number" && !!formProbe.ships && !!formProbe.linh &&
        !!formProbe.cargo && typeof formProbe.giu === "number";
      var mpShape = !!mpProbe && !!mpProbe.A && !!mpProbe.D && !!mpProbe.A.ships &&
        !!mpProbe.A.tech && !!mpProbe.D.ships && !!mpProbe.D.def && !!mpProbe.D.tech &&
        Object.prototype.hasOwnProperty.call(mpProbe.D, "res") &&
        typeof mpProbe.nguon === "string" && Object.prototype.hasOwnProperty.call(mpProbe, "kq");
      var signatureBefore = U.sig();
      U.sigCu = signatureBefore;
      U.ve();
      var signatureAfterRender = U.sigCu;
      U.live();
      var signatureAfterLive = U.sig();
      var signatureWorks = typeof signatureBefore === "string" &&
        signatureAfterRender === signatureAfterLive && signatureBefore === signatureAfterLive;
      var sameIdentity = !!uiBefore && U.ui === uiBefore &&
        U.ui[probeKey] === true && U.MAN === manBefore && U.HU === huBefore &&
        U.XH_LOAI === ranksBefore && U.MP_LAN === cyclesBefore && APP.ACT === actBefore &&
        U.nguon === nguonBefore && U.gal === galProbe && U.form === formProbe &&
        U.mp === mpProbe && U.cho === stateBefore.cho && U.moTin === stateBefore.moTin &&
        U.man === stateBefore.man && U.pi === stateBefore.pi && U.xhLoai === stateBefore.xhLoai &&
        U.sig === sigFacadeBefore && U.ve === veFacadeBefore && U.live === liveFacadeBefore;
      result = {
        missing: missing, wrongArity: wrongArity, unexpected: unexpected,
        sameIdentity: sameIdentity,
        stateShape: galShape && formShape && mpShape && sigCuShape,
        signatureWorks: signatureWorks,
        lazyAtEntry: !hadMpBefore,
        lazyMaterializedByRender: lazyMaterializedByRender
      };
    } finally {
      U.gal = stateBefore.gal;
      U.form = stateBefore.form;
      U.sigCu = stateBefore.sigCu;
      U.cho = stateBefore.cho;
      U.moTin = stateBefore.moTin;
      U.man = stateBefore.man;
      U.pi = stateBefore.pi;
      U.xhLoai = stateBefore.xhLoai;
      if (hadMpBefore) U.mp = mpBefore;
      else delete U.mp;
      if (uiBefore) {
        if (hadProbe) uiBefore[probeKey] = oldProbe;
        else delete uiBefore[probeKey];
      }
      if (result) {
        result.restored = U.gal === stateBefore.gal && U.form === stateBefore.form &&
          U.sigCu === stateBefore.sigCu && U.cho === stateBefore.cho &&
          U.moTin === stateBefore.moTin && U.man === stateBefore.man &&
          U.pi === stateBefore.pi && U.xhLoai === stateBefore.xhLoai &&
          (hadMpBefore ? U.mp === mpBefore : !own(U, "mp"));
      }
    }
    return result;
  }, spec);
}
var soloSurface = await kiemMatCongKhai(pSolo, thongSoMatCongKhai("solo"));
var mpSurface = await kiemMatCongKhai(p1, thongSoMatCongKhai("multiplayer"));
ktra(soloSurface.missing.length === 0 && soloSurface.wrongArity.length === 0 &&
  soloSurface.unexpected.length === 0,
  "solo giữ toàn bộ UI/APP public surface, own key và arity");
ktra(mpSurface.missing.length === 0 && mpSurface.wrongArity.length === 0 &&
  mpSurface.unexpected.length === 0,
  "multiplayer giữ toàn bộ UI/APP public surface, own key và arity");
ktra(soloSurface.lazyAtEntry && soloSurface.lazyMaterializedByRender &&
  soloSurface.sameIdentity && mpSurface.sameIdentity && soloSurface.stateShape &&
  mpSurface.stateShape && soloSurface.signatureWorks && mpSurface.signatureWorks &&
  soloSurface.restored && mpSurface.restored,
  "U.mp vắng mặt thật rồi chỉ materialize qua mophong; facade khôi phục state/identity");
var helperOutput = await p1.evaluate(function () {
  var field = U.nhanTruong("quality-field", "Quality", "<input id=\"quality-field\">", "help");
  var table = U.bang("quality-table", "Quality table", "<tr></tr>", "<tr></tr>", "quality");
  U.chuanHoaNoiDung(document.getElementById("noidung"));
  return {
    title: U.tieuDeMan(),
    field: field.indexOf("for=\"quality-field\"") >= 0,
    table: table.indexOf("data-ui-scroll=\"quality-table\"") >= 0
  };
});
ktra(helperOutput.title.length > 0 && helperOutput.field && helperOutput.table,
  "helper UI giữ signature và output public");
var dialogOutput = await p1.evaluate(function () {
  U.hop("Facade options", "<button id=\"facade-focus\">Focus</button>", {
    initialFocus: "#facade-focus"
  });
  var output = {
    title: document.getElementById("ht-td").textContent,
    focus: document.activeElement && document.activeElement.id
  };
  U.dongHop();
  return output;
});
ktra(dialogOutput.title === "Facade options" && dialogOutput.focus === "facade-focus",
  "U.hop forward đủ title/html/options qua facade");
await p1.setViewportSize({width: 1024, height: 768});
try {
  await p1.locator("#nut-menu").focus();
  await p1.locator("#nut-menu").click();
  ktra(await p1.locator("#nut-menu").getAttribute("aria-expanded") === "true",
    "drawer multiplayer mở qua public contract ở tablet");
  await p1.keyboard.press("Escape");
  ktra(await p1.locator("#nut-menu").getAttribute("aria-expanded") === "false",
    "Escape đóng drawer qua public contract ở tablet");
  ktra(await p1.locator("#nut-menu").evaluate(function (el) {
    return document.activeElement === el;
  }), "Escape trả focus về nút drawer");
} finally {
  await p1.setViewportSize({width: 1400, height: 950});
}
await vaoManBangBanPhim(p1, "chat");
await p1.locator("#chat-noi-chung").fill("draft facade không mất");
await p1.evaluate(function () { U.ve(); });
ktra(await p1.locator("#chat-noi-chung").inputValue() === "draft facade không mất",
  "render facade giữ draft chat đang gõ");
~~~

Run: npm run test:ui. Expected: PASS trước extraction, gồm file:// đã được UI Task 3 kiểm; đây là baseline hành vi UI,
còn RED ở Step 1 kiểm manifest/order.

- [ ] **Step 3: Implement tối thiểu**

Chỉ sau khi UI Task 10 đã merge, tách concrete body đã redesign vào sáu file. Vì scripts không phải ESM và module phải
đứng trước facade, js/ui/shell.js phải bootstrap một lần bằng var U = window.U || (window.U = {}); var APP =
window.APP || (window.APP = {});, rồi di chuyển initializer đã hoàn tất của UI plan (bao gồm identity hiện hữu của
U.ui) vào đó. js/ui.js sau đó chỉ dùng var U = window.U; var APP = window.APP; và không được reset U, APP, U.ui, U.MAN
hoặc APP.ACT.

Đầu js/ui/shell.js phải là bootstrap thực thi được sau đây; đây là file đầu tiên của UI group:

~~~js
"use strict";
var U = window.U || (window.U = {});
var APP = window.APP || (window.APP = {});
function coU(name) { return Object.prototype.hasOwnProperty.call(U, name); }
if (!coU("man")) U.man = "tongquan";
if (!coU("pi")) U.pi = 0;
if (!coU("gal")) U.gal = null;
if (!coU("form")) U.form = null;
if (!coU("moTin")) U.moTin = {};
if (!coU("cho")) U.cho = {};
if (!coU("sigCu")) U.sigCu = "";
if (!coU("xhLoai")) U.xhLoai = "tong";
if (!coU("ui")) U.ui = {dialogOpener: null, drawerOpen: false, renderedMan: ""};
~~~

Di chuyển toàn bộ body đã final theo mapping cố định, không chỉ renderer đang được test: shell chứa `esc`, `toast`,
drawer/dialog/focus và initializer duy nhất cho `man/pi/gal/form/cho/moTin/sigCu`; presenter chứa
`st/ht/dem/gia/dsRes/htTheoKey/bt/ds/bp/ncConLai/ncKyTiep/dsTau/chupTrang/phucHoiTrang/tieuDeMan`; render chứa
`thanhRes/veMenu/veCanh/veChonHT/sig/ve/live/nhanTruong/bang/chuanHoaNoiDung`; screens chứa base renderer
`m_tongquan/m_tainguyen/m_congtrinh/m_nghiencuu/m_xuong/m_phongthu/m_hamdoi` và
`m_thienha/m_lienminh/m_xephang/m_tinnhan/m_nhatky/m_huongdan/m_mophong`,
`theCT`, `theDonVi`, `formMoi`, `capNhatForm`, `ttBay`, `veBaoCao`, `veDoTham`, `veBaoCaoTenLua`, `mpMoi`,
`mpNapDoTham`, `mpDoc`, `mpChay`; web/js/mp.js giữ private MP override `m_lienminh` và renderer
`m_bangtin/m_chat/m_taikhoan`; dispatch chứa `gui/themACT/batDauNhip`; solo-loop chứa `tuaSolo`. Shell chỉ đặt default
khi property chưa tồn tại (`gal/form` là null, `sigCu` là chuỗi rỗng). Không shell/facade nào được tạo `U.mp`; chỉ
existing `m_mophong` đặt `U.mp = U.mpMoi()` khi thật sự render simulator. Không module nào giữ shadow copy. Mỗi
concrete function được đặt trước facade ở exact private key `_<publicName>NoiBo`: ví dụ `U._hopNoiBo`,
`U._giuTabTrongHopNoiBo`, `U._nhanTruongNoiBo`, `U._bangNoiBo`, `U._chuanHoaNoiDungNoiBo` và `APP._tuaSoloNoiBo`.
`U.MAN`, `U.HU`, `U.XH_LOAI`, `U.MP_LAN`, `U.nguon` và object state giữ nguyên identity, không copy/recreate.

`U.sig` thuộc render, không thuộc facade file. Trong js/ui/render.js đặt `_sigNoiBo` trước
`_veNoiBo` và `_liveNoiBo`; chuyển nguyên logic fingerprint hiện hữu thành body private sau đây.
Vì `U.ve()` và `U.live()` đều gọi `U.sig()`, browser gate ở Step 2 sẽ throw nếu facade trỏ
tới private target không tồn tại:

Trong js/ui/render.js khai báo `_sigNoiBo` trước `_veNoiBo/_liveNoiBo`; sau khi toàn bộ private body đã nạp, js/ui.js
khai báo helper rồi tạo facade arity-preserving. Một fence dưới đây ghi rõ hai file theo thứ tự load. Đây là toàn bộ
cơ chế dành cho common U surface; không dùng `Function`, `eval` hay wrapper arity-0 chung:

~~~js
/* js/ui/render.js, loaded before js/ui.js */
U._sigNoiBo = function () {
  var st = U.st(), bt = U.bt(st);
  var s = [
    st.planets.length, st.msgs.length, st.fleets.length, st.toi.length, bt.cycle,
    bt.missStreak, U.man, U.pi, st.nk.length, st.lm ? st.lm.ten : "-",
    (st.pvpToi || []).map(function (x) { return x.id + ":" + x.nv + ":" + x.den_t; }).join(","),
    (st.pvpGiu || []).map(function (x) {
      return x.id + ":" + x.giuDen_t + ":" + x.tiepNL_t;
    }).join(",")
  ];
  for (var i = 0; i < st.planets.length; i++) {
    var p = st.planets[i], ds = U.ds(p);
    s.push(
      p.qB.length, p.qS.length, p.qS.length ? p.qS[0].n : 0,
      Math.floor(ds.population), ds.supportBp, ds.taxBp,
      ds.foodShortfallCycle > 0 ? 1 : 0
    );
  }
  s.push(
    st.ncQueue ? st.ncQueue.id + ":" + st.ncQueue.status + ":" +
      st.ncQueue.installmentsLeft + ":" + st.ncQueue.finishAt : "-"
  );
  for (var j = 0; j < st.fleets.length; j++) {
    var f = st.fleets[j];
    s.push([
      f.id, f.mission, f.pha, f.den_t || 0, f.ve_t || 0,
      f.giuDen_t || 0, f.tiepNL_t || 0, JSON.stringify(f.ships || {}),
      JSON.stringify(f.cargo || {})
    ].join(":"));
  }
  return s.join("|");
};

/* js/ui.js, loaded after all private U bodies */
function datFacade0(owner, name, privateName) {
  owner[name] = function () { return owner[privateName].apply(owner, arguments); };
}
function datFacade1(owner, name, privateName) {
  owner[name] = function (a) { return owner[privateName].apply(owner, arguments); };
}
function datFacade2(owner, name, privateName) {
  owner[name] = function (a, b) { return owner[privateName].apply(owner, arguments); };
}
function datFacade3(owner, name, privateName) {
  owner[name] = function (a, b, c) { return owner[privateName].apply(owner, arguments); };
}
function datFacade4(owner, name, privateName) {
  owner[name] = function (a, b, c, d) {
    return owner[privateName].apply(owner, arguments);
  };
}
function datFacade5(owner, name, privateName) {
  owner[name] = function (a, b, c, d, e) {
    return owner[privateName].apply(owner, arguments);
  };
}
function datCacFacade(owner, arity, names) {
  var dat = [datFacade0, datFacade1, datFacade2, datFacade3, datFacade4, datFacade5][arity];
  names.forEach(function (name) { dat(owner, name, "_" + name + "NoiBo"); });
}
U._datCacFacade = datCacFacade;
datCacFacade(U, 0, [
  "st", "ht", "dongHop", "thanhRes", "veMenu", "veCanh", "veChonHT",
  "m_tongquan", "m_tainguyen", "m_congtrinh", "m_nghiencuu", "m_xuong",
  "m_phongthu", "formMoi", "capNhatForm", "ttBay", "m_hamdoi",
  "m_thienha", "m_lienminh", "m_xephang", "m_tinnhan", "m_nhatky",
  "m_huongdan", "sig", "ve", "live", "mpMoi", "mpDoc", "mpChay",
  "m_mophong", "chupTrang", "tieuDeMan", "chuyenDrawer"
]);
datCacFacade(U, 1, [
  "esc", "htTheoKey", "bt", "ds", "bp", "ncConLai", "ncKyTiep", "dsTau",
  "veBaoCao", "veDoTham", "veBaoCaoTenLua", "mpNapDoTham", "phucHoiTrang",
  "datDrawer", "giuTabTrongHop", "chuanHoaNoiDung"
]);
datCacFacade(U, 2, ["toast", "dem", "dsRes"]);
datCacFacade(U, 3, ["hop", "gia", "theCT"]);
datCacFacade(U, 4, ["theDonVi", "nhanTruong"]);
datCacFacade(U, 5, ["bang"]);
~~~

Trong web/js/mp.js, đổi MP override `m_lienminh`, concrete `m_bangtin/m_chat/m_taikhoan` và final `APP.thuLai` thành
private bodies, rồi delegate sau body; không copy logic hoặc tạo runtime import. Trong js/main.js và web/js/mp.js, đổi
mode adapter thành private body trước khi publish facade. Nhờ `U._datCacFacade` đã tồn tại sau js/ui.js, mỗi mode vẫn
giữ exact arity và mọi arguments:

~~~js
/* js/main.js, sau private concrete body solo */
U._datCacFacade(APP, 3, ["lam"]);
U._datCacFacade(APP, 1, ["luu", "doiFile"]);
U._datCacFacade(APP, 0, ["moiGiay"]);

/* web/js/mp.js, sau private concrete MP body */
U._datCacFacade(U, 0, ["m_lienminh", "m_bangtin", "m_chat", "m_taikhoan"]);
U._datCacFacade(APP, 3, ["lam"]);
U._datCacFacade(APP, 2, ["taiHe"]);
U._datCacFacade(APP, 1, ["taiXepHang", "thuLai"]);
U._datCacFacade(APP, 0, ["luu", "moiGiay", "hienLai"]);

/* js/app.js, sau concrete dispatch/solo bodies */
U._datCacFacade(APP, 3, ["gui"]);
U._datCacFacade(APP, 1, ["themACT"]);
U._datCacFacade(APP, 0, ["batDauNhip", "tuaSolo"]);
~~~

Trước mỗi call trên, đổi body cùng tên thành exact private key: `APP.lam` thành `APP._lamNoiBo`, `APP.luu` thành
`APP._luuNoiBo`, `APP.moiGiay` thành `APP._moiGiayNoiBo`, `APP.doiFile` thành `APP._doiFileNoiBo`, `APP.hienLai` thành
`APP._hienLaiNoiBo`, `APP.taiHe` thành `APP._taiHeNoiBo`, `APP.taiXepHang` thành `APP._taiXepHangNoiBo`, `APP.thuLai`
thành `APP._thuLaiNoiBo`, `APP.gui` thành `APP._guiNoiBo`, `APP.themACT` thành `APP._themACTNoiBo`, `APP.batDauNhip`
thành `APP._batDauNhipNoiBo` và `APP.tuaSolo` thành `APP._tuaSoloNoiBo`. Với assignment cũ, dùng exact chuyển đổi
`APP._guiNoiBo = lam` thay cho `APP.gui = lam` và `APP._luuNoiBo = luu` thay cho `APP.luu = luu`; không đổi closure đã
có. Mọi facade forward toàn bộ arguments bằng `apply`; `U.hop/U.dongHop` vẫn là dialog, không alias thành drawer. U
state/focus/draft/chat đã có tiếp tục được concrete body sử dụng.

Thêm đúng mảng `expected` Task 5 vào tools/source-manifest.js; regenerate index.html và web/index.html từ manifest.
UI/app paths không xuất hiện trong rulesScripts. Giữ scripts tĩnh, không ESM/runtime import để file://index.html tiếp
tục mở trực tiếp.

- [ ] **Step 4: GREEN**

Run: node tools/test-module-manifest.js && npm run test:ui && npm run test:load && npm run build && npm run
check:artifact. Expected: PASS; manifest validates exact browser/mp/rules arrays không duplicate và hai static shell,
artifact lấy đúng browserScripts, UI giữ full public surface/focus/drawer/dialog/chat/U.ui/APP.tuaSolo/APP.thuLai, và
file:// vẫn là URL test.

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add js/ui js/app js/ui.js js/app.js js/main.js web/js/mp.js
tools/source-manifest.js index.html web/index.html tools/test-module-manifest.js tools/test-mp-ui.mjs
dist/thien-ha-dai-chien.html dist/artifact.html && git commit -m "refactor: split finalized orbital ui through
facades". Nếu .git read-only, controller lưu snapshot/diff và commit intent; correctness là các gate GREEN.

### Task 6: Hoàn thiện scripts và CI tái lập

**Files:**
- Verify: package.json:1-40 và package-lock.json (Task 1 foundation là owner duy nhất)
- Verify: tools/test-package-contract.js, tools/test-quality-gate.js, tools/check-syntax.js, tools/lint.js
- Verify: tools/test-artifact.js, tools/test-version-contract.js, tools/test-uow.js, tools/test-loader.js
- Verify: tools/test-server-factory.js, tools/test-server-entrypoint.js, tools/test-scheduler.js
- Create: .github/workflows/quality.yml
- Create: tools/test-ci-contract.js

**Interfaces:**
- Consumes: exact scripts/dev-only lock từ foundation Task 1; direct regressions
  quality/artifact/version/UoW/factory/entrypoint/loader từ foundation Tasks 1–8; scheduler behavior harness; manifest
  final Tasks 1–5.
- Produces: CI jobs quality, artifact-and-core, server, load, ui. Workflow chạy trực tiếp từng foundation regression
  ngoài các npm gate core/server/scheduler/load/UI; contract giữ exact npm test/test:all, zero runtime dependencies và
  exact Playwright `1.62.1` mà không sửa package/lock.

- [ ] **Step 1: Viết RED CI contract**

~~~js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pkg = require("../package.json");
const root = path.join(__dirname, "..");
const yml = fs.readFileSync(path.join(root, ".github", "workflows", "quality.yml"), "utf8");
const lockPath = path.join(root, "package-lock.json");
assert.ok(fs.existsSync(lockPath), "foundation Task 1 package-lock blocked by npm registry/cache");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const expectedTest = "npm run test:core && npm run test:server && npm run test:scheduler";
const expectedAll = [
  "npm run check:syntax", "npm run lint", "npm run check:version", "npm run build",
  "npm run check:artifact", "npm run test:core", "npm run test:server",
  "npm run test:scheduler", "npm run test:load", "npm run test:ui"
].join(" && ");
const qualityGate = [
  "node tools/test-ci-contract.js", "node tools/test-package-contract.js",
  "node tools/test-quality-gate.js",
  "node tools/check-syntax.js", "npm run lint", "node tools/test-version-contract.js",
  "npm run check:version"
].join(" && ");
const artifactGate = [
  "npm run build", "node tools/test-artifact.js", "npm run check:artifact",
  "git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html",
  "node tools/test-loader.js", "npm run test:core"
].join(" && ");
const serverGate = [
  "node tools/test-uow.js", "node tools/test-server-factory.js",
  "node tools/test-server-entrypoint.js", "npm run test:server", "npm run test:scheduler"
].join(" && ");
const jobsAt = yml.indexOf("\njobs:\n");
assert.ok(jobsAt >= 0, "missing jobs map");
const jobNames = Array.from(
  yml.slice(jobsAt).matchAll(/^  ([A-Za-z][A-Za-z0-9-]*):$/gm), match => match[1]
);
assert.deepEqual(jobNames, ["quality", "artifact-and-core", "server", "load", "ui"]);
function jobBlock(name) {
  const marker = "\n  " + name + ":\n";
  const start = yml.indexOf(marker);
  assert.ok(start >= 0, "missing job " + name);
  const bodyStart = start + marker.length;
  const next = yml.slice(bodyStart).search(/\n  [A-Za-z][A-Za-z0-9-]*:\n/);
  return next < 0 ? yml.slice(start) : yml.slice(start, bodyStart + next);
}
function assertMatrixJob(name) {
  const block = jobBlock(name);
  assert.match(block, /node:\s*\["22\.5\.x", "24\.x"\]/, name + " matrix");
  assert.match(block, /actions\/checkout@v4/, name + " checkout");
  assert.match(block, /actions\/setup-node@v4/, name + " setup-node");
  assert.match(block, /node-version:\s*"?\$\{\{\s*matrix\.node\s*\}\}"?/, name + " node variable");
  assert.match(block, /npm ci/, name + " npm ci");
  return block;
}
function assertNode24Job(name) {
  const block = jobBlock(name);
  assert.match(block, /actions\/checkout@v4/, name + " checkout");
  assert.match(block, /actions\/setup-node@v4/, name + " setup-node");
  assert.match(block, /node-version:\s*"24\.x"/, name + " Node 24.x");
  assert.match(block, /npm ci/, name + " npm ci");
  return block;
}
function runCommands(block) {
  const lines = block.split("\n"), commands = [];
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s+- run:\s*(.*)$/);
    if (!match) continue;
    if (match[1] !== ">-") {
      commands.push(match[1]);
      continue;
    }
    const parts = [];
    while (index + 1 < lines.length && /^\s{10,}\S/.test(lines[index + 1])) {
      parts.push(lines[++index].trim());
    }
    commands.push(parts.join(" "));
  }
  return commands;
}
assert.equal(pkg.engines.node, ">=22.5");
assert.deepEqual(pkg.dependencies, {});
assert.equal(pkg.scripts.test, expectedTest);
assert.equal(pkg.scripts["test:all"], expectedAll);
assert.deepEqual(pkg.devDependencies, {playwright: "1.62.1"});
assert.deepEqual(lock.packages[""].devDependencies, {playwright: "1.62.1"});
assert.equal(lock.packages["node_modules/playwright"].version, "1.62.1");
assert.equal(lock.packages["node_modules/playwright"].dev, true);
const quality = assertMatrixJob("quality");
const artifact = assertMatrixJob("artifact-and-core");
const server = assertMatrixJob("server");
const load = assertNode24Job("load");
const ui = assertNode24Job("ui");
const browserInstall = "npx --no-install playwright install --with-deps chromium";
assert.deepEqual(runCommands(quality), [
  "npm ci", qualityGate
]);
assert.deepEqual(runCommands(artifact), ["npm ci", artifactGate]);
assert.deepEqual(runCommands(server), ["npm ci", serverGate]);
assert.deepEqual(runCommands(load), ["npm ci", "npm run test:load"]);
assert.deepEqual(runCommands(ui), [
  "npm ci", browserInstall, "npm run test:ui"
]);
~~~

Lưu tools/test-ci-contract.js. Run: node tools/test-ci-contract.js. Expected RED theo thứ tự: trước implementation
fail vì `.github/workflows/quality.yml` chưa có; nếu workspace hiện tại vẫn chưa unblock foundation Task 1, sau khi
workflow xuất hiện nó dừng với message exact `foundation Task 1 package-lock blocked by npm registry/cache`, không bị
ghi nhầm là lỗi workflow. Khi lock tồn tại, các assertion chứng minh exact script/lock/matrix/browser-install và toàn
bộ direct regression command.

- [ ] **Step 2: Xác nhận package/lock foundation, không fork contract**

Task 1 foundation đã là owner của package script và lockfile. Trước CI implementation, xác nhận
`pkg.scripts.test === expectedTest` và `pkg.scripts["test:all"] === expectedAll`, dùng đúng hai hằng hoàn chỉnh đã
định nghĩa trong Step 1. Không thay chúng bằng alias.

dependencies phải là {}; `devDependencies` phải đúng `{ "playwright": "1.62.1" }` và đồng nhất với package-lock.json.
Foundation Task 1 là owner duy nhất chạy `npm view playwright@1.62.1 version engines --json` và `npm install
--save-dev --save-exact playwright@1.62.1`; Task 6 không chạy npm install lại, không bịa lock và không sửa
package/lock để CI xanh. Workspace đóng băng hiện ghi `EAI_AGAIN`/`ENOTCACHED`; đó là blocker npm/network của Task 1,
không phải GREEN hay failure của source-only workflow.

- [ ] **Step 3: Implement workflow**

Tạo .github/workflows/quality.yml. quality, artifact-and-core, server dùng matrix node ["22.5.x", "24.x"]; load và ui
pin release line "24.x". Mọi job chạy npm ci trước lệnh khác. Không dồn direct regressions vào package scripts vì Task
1 đã freeze contract. Workflow hoàn chỉnh:

~~~yaml
name: quality
on:
  push:
  pull_request:
jobs:
  quality:
    runs-on: ubuntu-latest
    strategy:
      matrix: { node: ["22.5.x", "24.x"] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ matrix.node }}" }
      - run: npm ci
      - run: >-
          node tools/test-ci-contract.js && node tools/test-package-contract.js &&
          node tools/test-quality-gate.js && node tools/check-syntax.js && npm run lint &&
          node tools/test-version-contract.js && npm run check:version
  artifact-and-core:
    runs-on: ubuntu-latest
    strategy:
      matrix: { node: ["22.5.x", "24.x"] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ matrix.node }}" }
      - run: npm ci
      - run: >-
          npm run build && node tools/test-artifact.js && npm run check:artifact &&
          git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html &&
          node tools/test-loader.js && npm run test:core
  server:
    runs-on: ubuntu-latest
    strategy:
      matrix: { node: ["22.5.x", "24.x"] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "${{ matrix.node }}" }
      - run: npm ci
      - run: >-
          node tools/test-uow.js && node tools/test-server-factory.js &&
          node tools/test-server-entrypoint.js && npm run test:server && npm run test:scheduler
  load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "24.x" }
      - run: npm ci
      - run: npm run test:load
  ui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "24.x" }
      - run: npm ci
      - run: npx --no-install playwright install --with-deps chromium
      - run: npm run test:ui
~~~

`quality` chạy package/quality/syntax/lint/version; `artifact-and-core` chạy build, direct artifact, artifact checker,
committed-output diff, loader và core; `server` chạy UoW/factory/entrypoint trước server/scheduler. Git diff artifact
chỉ chạy sau foundation Task 3 đã commit baseline generated. Không chạy browser install trước npm ci; không hardcode
patch thuộc release line Node 24.

- [ ] **Step 4: GREEN**

Only after Foundation Task 1 has supplied the exact committed lock and the runner has declared registry/cache
availability, run the exact local closure below; do not replace it with a package alias. If either precondition is
absent, stop before `npm ci` and record `BLOCKED_EXTERNAL npm/network` without creating or rewriting package data.

~~~bash
set -Eeuo pipefail
node tools/test-ci-contract.js
npm ci
node tools/test-package-contract.js
node tools/test-quality-gate.js
node tools/check-syntax.js
npm run lint
node tools/test-version-contract.js
npm run check:version
npm run build
node tools/test-artifact.js
npm run check:artifact
git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html
node tools/test-loader.js
npm run test:core
node tools/test-uow.js
node tools/test-server-factory.js
node tools/test-server-entrypoint.js
npm run test:server
npm run test:scheduler
npm run test:load
npx --no-install playwright install --with-deps chromium
npm run test:ui
npm run test:all
~~~

Expected normal host/CI sau foundation Task 1: PASS; workflow contract chứng minh matrix quality/core/server, Node 24
UI/load, npm ci mỗi job, direct foundation regressions, browser install sau npm ci và test:scheduler đúng một lần
trong test/test:all. Trong workspace đang đóng băng, nếu lock vẫn thiếu hoặc npm trả `EAI_AGAIN`/`ENOTCACHED`, dừng và
ghi **BLOCKED_EXTERNAL npm/network**; không đánh dấu GREEN, không sửa package/lock, và không quy lỗi đó cho workflow
source.

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add .github/workflows/quality.yml tools/test-ci-contract.js && git commit -m
"ci: run reproducible quality matrix". Nếu .git read-only, controller lưu snapshot/diff và commit intent; không stage
package/lock hoặc tài liệu plan ngoài task.

### Task 7: Verification integration gate với durable scheduler

**Files:**
- Verify only: server/app.js (durable Task 7 owns the final six-key factory wiring)
- Verify only: server/index.js (durable Tasks 7–8 own the production adapter/lifecycle)
- Verify only: server/scheduler/index.js::taoScheduler(context) (durable Tasks 6–8 owner)
- Verify only: server/scheduler/cutover.js::runMaintenanceCutover(context) (durable Task 9 owner)
- Verify only: tools/test-scheduler.js and every scheduler-owned test
- Create: tools/test-quality-integration.js

**Interfaces:**
- Consumes: final `taoUngDung(options)` from durable Tasks 7–8. Its sole `schedulerFactory(context)` receives
  exactly `{kho,tg,clock,logger,env,schedulerOptions}`. The nested options retain exactly
  `{schedulerPollMs,schedulerLogTicks,cleanupMs}`.
- Consumes: `taoScheduler(context)` returning exactly
  `{start,stop,getStatus,runCommand,schedule,cancel,reconcile,advanceTo}`. The local wrapper may add only
  `makeOwnerId` to a fresh copy before calling the real adapter; no app owner scalar or second production seam exists.
- Consumes: durable Task 9's public `runMaintenanceCutover({kho,clock,ownerId})`. It prepares each fresh database
  before either real-adapter app is constructed; this task performs no raw mode write or private migration call.
- Produces: only tools/test-quality-integration.js. Functional cases use a fake listener and `PassThrough`
  request/response objects against the real `http.Server` request listener, so they bind no socket.
- Produces: exact canonical scheduler status coverage, immediate first-holder/second-standby coverage, lazy bootstrap,
  not-ready admission, failed-register, cleanup, and one isolated real-bind capability probe.

**Entry gate:** Before dispatch, the controller records and verifies the independently approved Scheduler-plan hash.
Any mismatch or failed Scheduler behavior blocks Task 7 and returns evidence to the Scheduler owner. It never
authorizes a Scheduler plan/source/test edit from this task. The proposal PASS did not approve this revised plan.

- [ ] **Step 1: Write the complete socketless integration verifier**

Save the following complete file as tools/test-quality-integration.js. `fakeClock` deliberately exposes only
`nowMs` and `advanceMs`. The test never calls `advanceMs`, injects a Scheduler timer, drains a callback, waits for a
poll, or exercises takeover. `fakeIntervals` is passed only as `taoUngDung`'s application-timer option.

~~~js
"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {PassThrough} = require("node:stream");
const {taoUngDung} = require("../server/app.js");
const {Kho} = require("../server/db.js");
const {taoScheduler} = require("../server/scheduler/index.js");
const {runMaintenanceCutover} = require("../server/scheduler/cutover.js");

function tempDb(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-quality-" + label + "-"));
  return path.join(dir, "game.sqlite");
}

function databasePaths(dbPath) {
  return [dbPath, dbPath + "-wal", dbPath + "-shm", path.dirname(dbPath)];
}

function removeDb(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, {force: true});
  }
  fs.rmSync(path.dirname(dbPath), {force: true, recursive: true});
}

function fakeClock(startMs) {
  let nowMs = startMs;
  return {
    nowMs: function () { return nowMs; },
    advanceMs: function (deltaMs) {
      assert.ok(Number.isSafeInteger(deltaMs) && deltaMs >= 0);
      nowMs += deltaMs;
      return nowMs;
    }
  };
}

function fakeIntervals() {
  let nextId = 0;
  const active = new Map();
  return {
    setInterval: function (fn, delayMs) {
      assert.equal(typeof fn, "function");
      assert.ok(Number.isSafeInteger(delayMs) && delayMs > 0);
      const id = ++nextId;
      active.set(id, {fn: fn, delayMs: delayMs});
      return id;
    },
    clearInterval: function (id) { active.delete(id); },
    activeCount: function () { return active.size; }
  };
}

function silentLogger() {
  return {
    debug: function () {},
    info: function () {},
    warn: function () {},
    error: function () {}
  };
}

function installSocketlessListener(app) {
  const server = app.server;
  const originalListen = server.listen;
  const originalAddress = server.address;
  let listenCalls = 0;

  function fakeListen() {
    listenCalls++;
    queueMicrotask(function () { server.emit("listening"); });
    return server;
  }

  function forbiddenAddress() {
    throw new Error("SOCKETLESS_ADDRESS_FORBIDDEN");
  }

  server.listen = fakeListen;
  server.address = forbiddenAddress;
  return {
    listenCalls: function () { return listenCalls; },
    restore: function () {
      if (server.listen === fakeListen) server.listen = originalListen;
      if (server.address === forbiddenAddress) server.address = originalAddress;
    }
  };
}

function openInProcessRequest(app, method, pathname, body, token) {
  const req = new PassThrough();
  const headers = {};
  let resolveResponse;
  const response = new Promise(function (resolve) { resolveResponse = resolve; });
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["x-thdc-token"] = token;
  req.url = pathname;
  req.method = method;
  req.headers = headers;
  req.socket = {remoteAddress: "127.0.0.1"};

  const res = {
    statusCode: 200,
    headers: {},
    headersSent: false,
    writableEnded: false,
    setHeader: function (name, value) { this.headers[name] = value; },
    getHeader: function (name) { return this.headers[name]; },
    writeHead: function (statusCode, responseHeaders) {
      this.statusCode = statusCode;
      Object.assign(this.headers, responseHeaders || {});
      this.headersSent = true;
      return this;
    },
    end: function (chunk) {
      if (this.writableEnded) return;
      this.writableEnded = true;
      const text = chunk === undefined ? "" : Buffer.from(chunk).toString("utf8");
      resolveResponse({status: this.statusCode, headers: this.headers, text: text});
    }
  };

  app.server.emit("request", req, res);
  req.end(body === undefined ? undefined : JSON.stringify(body));
  return response;
}

async function requestText(app, pathname) {
  return openInProcessRequest(app, "GET", pathname);
}

async function requestJson(app, method, pathname, body, token) {
  const result = await openInProcessRequest(app, method, pathname, body, token);
  return {
    status: result.status,
    headers: result.headers,
    body: result.text ? JSON.parse(result.text) : null
  };
}

function prepareDurable(dbPath, clock, universeSeed) {
  const kho = new Kho(dbPath);
  try {
    if (universeSeed !== undefined) {
      assert.equal(typeof universeSeed, "string");
      assert.ok(universeSeed.length > 0);
      kho.cauhinh("seed", universeSeed);
      kho.cauhinh("moLuc", String(Math.floor(clock.nowMs() / 1000)));
    }
    return runMaintenanceCutover({
      kho: kho,
      clock: clock,
      ownerId: "00000000-0000-4000-8000-000000000042"
    });
  } finally {
    kho.dong();
  }
}

function countAccounts(kho) {
  return kho.db.prepare("SELECT COUNT(*) AS n FROM tk").get().n;
}

function leaseRow(kho) {
  return kho.db.prepare(
    "SELECT owner_id,generation,expires_at_ms FROM scheduler_lease " +
    "WHERE lease_name='global-writer'"
  ).get();
}

function assertFactoryContext(context) {
  assert.deepEqual(Object.keys(context).sort(), [
    "clock", "env", "kho", "logger", "schedulerOptions", "tg"
  ]);
  assert.deepEqual(Object.keys(context.schedulerOptions).sort(), [
    "cleanupMs", "schedulerLogTicks", "schedulerPollMs"
  ]);
  assert.equal(context.schedulerOptions.schedulerPollMs, 10_000);
  assert.equal(context.schedulerOptions.schedulerLogTicks, false);
  assert.equal(context.schedulerOptions.cleanupMs, 60_000);
}

function schedulerFactoryForFixture(ownerId) {
  return function schedulerFactory(context) {
    assertFactoryContext(context);
    const firstContext = Object.assign({}, context, {
      makeOwnerId: function () { return ownerId; }
    });
    const repeatedContext = Object.assign({}, context, {
      makeOwnerId: function () { return ownerId; }
    });
    assert.notStrictEqual(firstContext, context);
    assert.notStrictEqual(repeatedContext, context);
    assert.notStrictEqual(firstContext, repeatedContext, "factory contexts are fresh copies");
    const adapterKeys = [
      "clock", "env", "kho", "logger", "makeOwnerId", "schedulerOptions", "tg"
    ];
    assert.deepEqual(Object.keys(firstContext).sort(), adapterKeys);
    assert.deepEqual(Object.keys(repeatedContext).sort(), adapterKeys);
    const first = taoScheduler(firstContext);
    const repeated = taoScheduler(repeatedContext);
    const bridgeKeys = [
      "advanceTo", "cancel", "getStatus", "reconcile", "runCommand", "schedule",
      "start", "stop"
    ];
    assert.deepEqual(Object.keys(first).sort(), bridgeKeys);
    assert.deepEqual(Object.keys(repeated).sort(), bridgeKeys);
    assert.strictEqual(repeated, first, "adapter memoizes bridge by Kho and owner UUID");
    assert.strictEqual(repeated.getStatus, first.getStatus, "adapter reuses one Writer");
    return first;
  };
}

function makeSocketlessApp(fixture, clock, schedulerFactory, ownerId) {
  const appTimers = fakeIntervals();
  const app = taoUngDung({
    port: 0,
    dbPath: fixture.dbPath,
    env: {},
    clock: clock,
    logger: silentLogger(),
    timers: appTimers,
    schedulerPollMs: 10_000,
    schedulerLogTicks: false,
    cleanupMs: 60_000,
    schedulerFactory: schedulerFactory
  });
  const listener = installSocketlessListener(app);
  const record = {
    app: app,
    appTimers: appTimers,
    listener: listener,
    ownerId: ownerId
  };
  fixture.apps.push(record);
  return record;
}

function makeDurableApp(fixture, clock, ownerId) {
  return makeSocketlessApp(
    fixture,
    clock,
    schedulerFactoryForFixture(ownerId),
    ownerId
  );
}

function makeFixture(t, label) {
  const fixture = {dbPath: tempDb(label), apps: []};
  t.after(async function () { await cleanupFixture(fixture); });
  return fixture;
}

async function cleanupFixture(fixture) {
  const failures = [];
  function capture(error) {
    if (error) failures.push(error);
  }

  for (const record of fixture.apps.slice().reverse()) {
    try {
      await record.app.stop();
    } catch (error) {
      capture(error);
    }
  }
  for (const record of fixture.apps.slice().reverse()) {
    try {
      record.listener.restore();
    } catch (error) {
      capture(error);
    }
    try {
      assert.equal(record.appTimers.activeCount(), 0, "application intervals cleared");
    } catch (error) {
      capture(error);
    }
  }
  try {
    removeDb(fixture.dbPath);
  } catch (error) {
    capture(error);
  }
  if (failures.length) {
    failures[0].cleanupErrors = failures.slice(1);
    throw failures[0];
  }
}

function canonicalStatus(overrides) {
  const base = {
    dbOpen: true, mode: "durable", state: "ready", ready: true, reason: null,
    leaseHeld: true, writerLeaseHeld: true, watermarkS: null,
    recoveryComplete: true, draining: false,
    pending: 0, retryWait: 0, running: 0, quarantined: 0,
    oldestDueAgeMs: 0, nextEligibleAtMs: null,
    counts: {pending: 0, retryWait: 0, running: 0, quarantined: 0},
    ages: {oldestDueAgeMs: 0, nextEligibleAtMs: null},
    metrics: {
      jobAttemptsTotal: 0, jobDurationMs: 0, advanceProcessed: 0,
      advanceBudgetExhaustedTotal: 0, leaseAcquireTotal: 0,
      reconcileTotal: 0, lastSuccessfulDrainTimestampMs: 0
    },
    wakeTimerActive: false, pollTimerActive: false, heartbeatTimerActive: false,
    reconcileTimerActive: false, signalHandlerInstalled: false
  };
  const input = overrides || {};
  const status = Object.assign({}, base, input);
  status.counts = {
    pending: status.pending, retryWait: status.retryWait,
    running: status.running, quarantined: status.quarantined
  };
  status.ages = {
    oldestDueAgeMs: status.oldestDueAgeMs, nextEligibleAtMs: status.nextEligibleAtMs
  };
  status.metrics = Object.assign({}, base.metrics, input.metrics || {});
  return status;
}

function assertCanonicalStatus(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), [
    "ages", "counts", "dbOpen", "draining", "heartbeatTimerActive", "leaseHeld", "metrics",
    "mode", "nextEligibleAtMs", "oldestDueAgeMs", "pending", "pollTimerActive",
    "quarantined", "ready", "reason", "reconcileTimerActive", "recoveryComplete",
    "retryWait", "running", "signalHandlerInstalled", "state", "wakeTimerActive",
    "watermarkS", "writerLeaseHeld"
  ]);
  assert.deepEqual(Object.keys(actual.counts).sort(), [
    "pending", "quarantined", "retryWait", "running"
  ]);
  assert.deepEqual(Object.keys(actual.ages).sort(), ["nextEligibleAtMs", "oldestDueAgeMs"]);
  assert.deepEqual(Object.keys(actual.metrics).sort(), [
    "advanceBudgetExhaustedTotal", "advanceProcessed", "jobAttemptsTotal", "jobDurationMs",
    "lastSuccessfulDrainTimestampMs", "leaseAcquireTotal", "reconcileTotal"
  ]);
  Object.entries(actual.metrics).forEach(function ([name, value]) {
    assert.ok(Number.isFinite(value) && value >= 0, name + " must be finite and nonnegative");
  });
  assert.deepEqual(actual, expected);
}

function assertCommand(command) {
  if (!command || typeof command.name !== "string" || typeof command.run !== "function") {
    throw new TypeError("invalid command");
  }
}

function unavailableSchedulerFactory(status, calls) {
  return function makeUnavailableScheduler(context) {
    assertFactoryContext(context);
    let stopped = false;
    return {
      start: async function () { calls.starts++; },
      stop: async function () {
        if (stopped) return;
        stopped = true;
        calls.stops++;
      },
      getStatus: function () { return status; },
      runCommand: function (command) {
        assertCommand(command);
        calls.names.push(command.name);
        if (command.name === "universe-bootstrap") {
          calls.bootstrapRuns++;
          const seed = command.run();
          assert.equal(seed, calls.expectedSeed, "bootstrap returns deterministic fixture seed");
          assert.ok(!seed || typeof seed.then !== "function", "bootstrap closure is synchronous");
          calls.bootstrapValues.push(seed);
          return seed;
        }
        if (command.name === "register") {
          calls.failedRegisters++;
          const error = new Error("scheduler unavailable");
          error.code = "SCHEDULER_UNAVAILABLE";
          throw error;
        }
        const unexpected = new Error("unexpected fixture command: " + command.name);
        unexpected.code = "UNEXPECTED_TEST_COMMAND";
        throw unexpected;
      },
      schedule: function () {},
      cancel: function () {},
      reconcile: function () {},
      advanceTo: function () {}
    };
  };
}

function readyNoopSchedulerFactory(calls) {
  const status = canonicalStatus();
  return function makeReadyNoopScheduler(context) {
    assertFactoryContext(context);
    let stopped = false;
    return {
      start: async function () { calls.starts++; },
      stop: async function () {
        if (stopped) return;
        stopped = true;
        calls.stops++;
      },
      getStatus: function () { return status; },
      runCommand: function (command) {
        assertCommand(command);
        calls.names.push(command.name);
        const result = command.run();
        assert.ok(!result || typeof result.then !== "function", "command closure is synchronous");
        return result;
      },
      schedule: function () {},
      cancel: function () {},
      reconcile: function () {},
      advanceTo: function () {}
    };
  };
}

test(
  "socketless real adapter exposes one holder and one standby immediately",
  {timeout: 5_000},
  async function (t) {
    const fixture = makeFixture(t, "real-adapter");
    const clock = fakeClock(1_700_000_000_000);
    prepareDurable(fixture.dbPath, clock);
    const first = makeDurableApp(
      fixture,
      clock,
      "00000000-0000-4000-8000-000000000051"
    );
    const second = makeDurableApp(
      fixture,
      clock,
      "00000000-0000-4000-8000-000000000052"
    );

    await first.app.start();
    assert.equal(first.listener.listenCalls(), 1);
    const firstStatus = first.app.scheduler.getStatus();
    assertCanonicalStatus(firstStatus, firstStatus);
    assert.equal(firstStatus.ready, true);
    assert.equal(firstStatus.mode, "durable");
    assert.equal(firstStatus.state, "ready");
    assert.equal(firstStatus.writerLeaseHeld, true);
    assert.equal(firstStatus.leaseHeld, true);
    assert.equal(firstStatus.reason, null);
    assert.ok(firstStatus.metrics.leaseAcquireTotal > 0, "holder records lease acquisition");
    assert.deepEqual(first.app.getStatus().scheduler, firstStatus);

    await second.app.start();
    assert.equal(second.listener.listenCalls(), 1);
    const secondStatus = second.app.scheduler.getStatus();
    assertCanonicalStatus(secondStatus, secondStatus);
    assert.equal(secondStatus.ready, false);
    assert.equal(secondStatus.state, "standby");
    assert.equal(secondStatus.writerLeaseHeld, false);
    assert.equal(secondStatus.leaseHeld, false);
    assert.equal(secondStatus.reason, "SCHEDULER_LEASE_UNHELD");
    assert.deepEqual(second.app.getStatus().scheduler, secondStatus);

    const holders = [first, second].filter(function (record) {
      return record.app.scheduler.getStatus().writerLeaseHeld === true;
    });
    assert.deepEqual(holders, [first], "ordered starts produce only the first holder");
    assert.equal((await requestText(first.app, "/healthz")).status, 200);
    assert.equal((await requestText(first.app, "/readyz")).status, 200);
    assert.equal((await requestText(second.app, "/healthz")).status, 200);
    assert.equal((await requestText(second.app, "/readyz")).status, 503);

    const before = countAccounts(second.app.kho);
    const denied = await requestJson(second.app, "POST", "/api/dangky", {
      ten: "standbynew",
      mk: "mat-khau-123",
      hienthi: "Standby New"
    });
    assert.equal(denied.status, 503);
    assert.equal(denied.body.code, "SCHEDULER_UNAVAILABLE");
    assert.equal(countAccounts(second.app.kho), before, "standby did not create account");

    await first.app.start();
    assert.equal(first.listener.listenCalls(), 1, "application listen is exactly once");
    const lease = leaseRow(second.app.kho);
    assert.equal(lease.owner_id, first.ownerId);
    assert.ok(Number.isSafeInteger(lease.generation) && lease.generation > 0);
    assert.ok(Number.isSafeInteger(lease.expires_at_ms));

    await second.app.stop();
    await first.app.stop();
    assert.equal(second.appTimers.activeCount(), 0);
    assert.equal(first.appTimers.activeCount(), 0);
  }
);

test(
  "socketless not-ready admission submits zero commands and performs zero writes",
  {timeout: 5_000},
  async function (t) {
    const fixture = makeFixture(t, "not-ready");
    const clock = fakeClock(1_700_000_000_000);
    prepareDurable(fixture.dbPath, clock);
    const calls = {
      names: [],
      expectedSeed: null,
      bootstrapRuns: 0,
      bootstrapValues: [],
      failedRegisters: 0,
      starts: 0,
      stops: 0
    };
    const status = canonicalStatus({
      leaseHeld: false,
      writerLeaseHeld: false,
      watermarkS: null,
      recoveryComplete: false,
      state: "standby",
      ready: false,
      reason: "SCHEDULER_LEASE_UNHELD"
    });
    const record = makeSocketlessApp(
      fixture,
      clock,
      unavailableSchedulerFactory(status, calls),
      null
    );

    await record.app.start();
    await record.app.start();
    assert.equal(calls.starts, 1);
    assert.equal(record.listener.listenCalls(), 1);
    assert.deepEqual(calls.names, []);
    assert.equal((await requestText(record.app, "/healthz")).status, 200);
    assert.equal((await requestText(record.app, "/readyz")).status, 503);
    assertCanonicalStatus(record.app.scheduler.getStatus(), status);
    assert.deepEqual(record.app.getStatus().scheduler, status);

    const before = countAccounts(record.app.kho);
    const response = await requestJson(record.app, "POST", "/api/dangky", {
      ten: "standbynew",
      mk: "mat-khau-123",
      hienthi: "Standby New"
    });
    assert.equal(response.status, 503);
    assert.deepEqual(calls.names, [], "not-ready admission submits no command");
    assert.equal(calls.bootstrapRuns, 0);
    assert.equal(calls.failedRegisters, 0);
    assert.equal(countAccounts(record.app.kho), before, "not-ready admission performs no write");

    await record.app.stop();
    await record.app.stop();
    assert.equal(calls.stops, 1);
    assert.equal(record.appTimers.activeCount(), 0);
  }
);

test(
  "socketless ready bridge bootstraps lazily once and blocks register before its closure",
  {timeout: 5_000},
  async function (t) {
    const fixture = makeFixture(t, "lazy-ready");
    const clock = fakeClock(1_700_000_000_000);
    const seed = "quality-unavailable-seed";
    prepareDurable(fixture.dbPath, clock, seed);
    const calls = {
      names: [],
      expectedSeed: seed,
      bootstrapRuns: 0,
      bootstrapValues: [],
      failedRegisters: 0,
      starts: 0,
      stops: 0
    };
    const status = canonicalStatus();
    const record = makeSocketlessApp(
      fixture,
      clock,
      unavailableSchedulerFactory(status, calls),
      null
    );

    await record.app.start();
    await record.app.start();
    assert.equal(calls.starts, 1);
    assert.equal(record.listener.listenCalls(), 1);
    assert.deepEqual(calls.names, []);
    assert.equal((await requestText(record.app, "/healthz")).status, 200);
    assert.equal((await requestText(record.app, "/readyz")).status, 200);
    assert.deepEqual(calls.names, [], "health and readiness do not bootstrap");
    assertCanonicalStatus(record.app.scheduler.getStatus(), status);
    assert.deepEqual(record.app.getStatus().scheduler, status);

    const infoRequests = await Promise.all([
      requestJson(record.app, "GET", "/api/thongtin"),
      requestJson(record.app, "GET", "/api/thongtin")
    ]);
    assert.equal(infoRequests[0].status, 200);
    assert.equal(infoRequests[1].status, 200);
    assert.equal(infoRequests[0].body.seed, seed);
    assert.deepEqual(infoRequests[1].body, infoRequests[0].body);
    assert.deepEqual(calls.names, ["universe-bootstrap"]);
    assert.equal(calls.bootstrapRuns, 1);
    assert.deepEqual(calls.bootstrapValues, [seed]);

    const thirdInfo = await requestJson(record.app, "GET", "/api/thongtin");
    assert.equal(thirdInfo.status, 200);
    assert.equal(thirdInfo.body.seed, seed);
    assert.deepEqual(calls.names, ["universe-bootstrap"]);
    assert.equal(calls.bootstrapRuns, 1, "later reads do not bootstrap again");

    const before = countAccounts(record.app.kho);
    const response = await requestJson(record.app, "POST", "/api/dangky", {
      ten: "unavailable",
      mk: "mat-khau-123",
      hienthi: "Unavailable Bridge"
    });
    assert.equal(response.status, 503);
    assert.equal(response.body.code, "SCHEDULER_UNAVAILABLE");
    assert.deepEqual(calls.names, ["universe-bootstrap", "register"]);
    assert.equal(calls.bootstrapRuns, 1);
    assert.equal(calls.failedRegisters, 1);
    assert.equal(countAccounts(record.app.kho), before, "failed register closure performs no write");

    await record.app.stop();
    await record.app.stop();
    assert.equal(calls.stops, 1);
    assert.equal(record.appTimers.activeCount(), 0);
  }
);

test(
  "socketless registered cleanup removes database after a body failure",
  {timeout: 5_000},
  async function (t) {
    const fixture = makeFixture(t, "cleanup");
    const paths = databasePaths(fixture.dbPath);
    t.after(function () {
      for (const target of paths) {
        assert.equal(fs.existsSync(target), false, "registered cleanup removed " + target);
      }
    });
    const clock = fakeClock(1_700_000_000_000);
    prepareDurable(fixture.dbPath, clock);
    const first = makeDurableApp(
      fixture,
      clock,
      "00000000-0000-4000-8000-000000000061"
    );
    const second = makeDurableApp(
      fixture,
      clock,
      "00000000-0000-4000-8000-000000000062"
    );
    await first.app.start();
    await second.app.start();

    const expected = new Error("INTENTIONAL_FIXTURE_BODY_FAILURE");
    let observed;
    try {
      throw expected;
    } catch (error) {
      observed = error;
    }
    assert.strictEqual(observed, expected);
  }
);

function isRestrictedBind(error) {
  return Boolean(error && (error.code === "EPERM" || error.code === "EACCES"));
}

async function cleanupBindFixture(fixture) {
  const failures = [];
  function capture(error) {
    if (error) failures.push(error);
  }
  if (fixture.app) {
    try {
      await fixture.app.stop();
    } catch (error) {
      capture(error);
    }
  }
  try {
    assert.equal(fixture.appTimers.activeCount(), 0, "bind-probe app intervals cleared");
    assert.deepEqual(fixture.calls.names, [], "bind probe submitted no command");
  } catch (error) {
    capture(error);
  }
  try {
    removeDb(fixture.dbPath);
  } catch (error) {
    capture(error);
  }
  if (failures.length) {
    failures[0].cleanupErrors = failures.slice(1);
    throw failures[0];
  }
}

function makeBindFixture(t) {
  const fixture = {
    dbPath: tempDb("bind"),
    app: null,
    appTimers: fakeIntervals(),
    calls: {names: [], starts: 0, stops: 0}
  };
  t.after(async function () { await cleanupBindFixture(fixture); });
  const clock = fakeClock(1_700_000_000_000);
  prepareDurable(fixture.dbPath, clock);
  fixture.app = taoUngDung({
    port: 0,
    host: "127.0.0.1",
    dbPath: fixture.dbPath,
    env: {},
    clock: clock,
    logger: silentLogger(),
    timers: fixture.appTimers,
    schedulerPollMs: 10_000,
    schedulerLogTicks: false,
    cleanupMs: 60_000,
    schedulerFactory: readyNoopSchedulerFactory(fixture.calls)
  });
  return fixture;
}

test("dedicated real bind capability probe", {timeout: 5_000}, async function (t) {
  const fixture = makeBindFixture(t);
  let emittedBindError = null;
  function captureBindError(error) {
    if (emittedBindError === null) emittedBindError = error;
  }
  fixture.app.server.once("error", captureBindError);
  try {
    await fixture.app.start();
  } catch (error) {
    if (error !== emittedBindError || !isRestrictedBind(error)) throw error;
    if (process.env.THDC_REQUIRE_REAL_BIND === "1") throw error;
    t.diagnostic("real bind unavailable: " + error.code);
    t.skip("real bind restricted by host: " + error.code);
    return;
  } finally {
    fixture.app.server.removeListener("error", captureBindError);
  }
  assert.equal(emittedBindError, null, "successful listen emitted no bind error");
  assert.equal(fixture.app.server.listening, true);
  const address = fixture.app.server.address();
  assert.equal(address.address, "127.0.0.1");
  assert.ok(Number.isSafeInteger(address.port) && address.port > 0);
  assert.equal(fixture.calls.starts, 1);
  assert.deepEqual(fixture.calls.names, []);
});
~~~

The fake listener emits `listening` in a microtask but never opens a socket. Its replacement `address` throws, so a
functional call to `server.address()` fails immediately. Each response promise resolves only when the real server
request listener calls `res.end`; readiness, admission, API dispatch, and error mapping are therefore not mocked.

`makeFixture` registers cleanup immediately after creating a unique temporary directory. Cleanup stops every app in
reverse order, restores both listener methods, checks only application fake intervals, removes the database, WAL,
SHM, and exact containing directory, and preserves the first error while attaching later cleanup errors. The cleanup
regression registers its filesystem assertion after the fixture hook, then deliberately throws after both apps start.

- [ ] **Step 2: Run the socketless verifier and focused functional gate**

The ordinary development host needs Node >=22.5 and the dependencies already provisioned by the approved
Foundation/Task-6 lock workflow. It does not need bind permission. Run:

~~~bash
set -Eeuo pipefail
node --check tools/test-quality-integration.js
node --test tools/test-quality-integration.js
node --test --test-name-pattern='socketless|lazy|not-ready|holder|standby' \
  tools/test-quality-integration.js
~~~

Expected: every functional case passes. A restricted host may report exactly one skipped test, the dedicated probe,
with `EPERM` or `EACCES`. The focused command runs only socketless behavior and must report no skip or failure.

The verifier provides these observable RED discriminators:

1. Reintroducing real `listen`/`address`/network request flow makes a functional test fail under restricted bind.
2. Zero or two holders, or a second app that is not immediate standby, fails exact status and lease assertions.
3. A startup `universe-bootstrap` fails the zero-command assertion.
4. Two closures from concurrent first information reads fail the exact call list.
5. Executing the rejected register closure or writing an account fails exact calls or account count.
6. Binding or starting twice fails listener and Scheduler-start counters.
7. Leaking an application interval fails registered cleanup.
8. Skipping any error other than the identical server-emitted `EPERM`/`EACCES` object fails the bind probe.

- [ ] **Step 3: Verify upstream ownership without rewiring source**

Do not modify server/app.js, server/index.js, server/scheduler, scheduler-owned tests, or the Scheduler plan. The
production factory must pass exactly six keys; the test copy may add only `makeOwnerId`. Do not add `clock.nowS`,
an owner scalar, another factory/cache/Writer, a raw cutover write, a Scheduler timer seam, or a test-only production
bypass. A failure such as `clock.nowS is not a function` is Scheduler evidence because Foundation exposes
`clock.nowMs`; return it to that owner and leave Task 7 blocked.

- [ ] **Step 4: Run fail-fast release and capable-bind gates**

Run the full local/ordinary-CI release gate in one fail-fast shell:

~~~bash
set -Eeuo pipefail
node --check tools/test-quality-integration.js
node --test tools/test-quality-integration.js
node --test --test-name-pattern='socketless|lazy|not-ready|holder|standby' \
  tools/test-quality-integration.js
npm run test:scheduler
npm run test:server
npm run test:all
~~~

Then run this separate gate on at least one known bind-capable CI runner:

~~~bash
set -Eeuo pipefail
THDC_REQUIRE_REAL_BIND=1 node --test tools/test-quality-integration.js
~~~

Expected: all commands pass, and the capable runner reports zero skipped tests. The dedicated probe makes no HTTP
request and proves only bind/close capability. The ordinary run may skip only the identical emitted bind error object
with `EPERM`/`EACCES`. `EADDRINUSE`, migration/Scheduler/timer/cleanup failure, an unrelated restricted error, bad
address, close failure, or any functional failure remains RED. If a provisioned dependency is unavailable because
the registry/cache is inaccessible, record `BLOCKED_EXTERNAL npm/network`; do not fabricate package or lock data.

Mechanical acceptance also requires balanced Markdown fences, independent and combined JavaScript syntax, Bash
syntax, no placeholders, no changed line over 120 columns, clean `git diff --check`, and a scoped Task-7 commit.
The functional verifier contains no network request API, wall-clock wait, global timer call, random port lookup,
process spawn, clock advance, Scheduler timer injection, callback drain, or takeover scenario. The sole
`server.address()` call is in the named bind probe.

- [ ] **Step 5: Commit only the verifier**

If the sandbox permits the Git index, run:

~~~bash
set -Eeuo pipefail
git add tools/test-quality-integration.js
git diff --cached --name-only
git commit -m "test: verify durable scheduler release integration"
~~~

Expected staged path: exactly tools/test-quality-integration.js. Do not stage server/app.js, server/index.js,
Scheduler source/tests/plan, package files, UI files, or this plan. If the index is read-only, the controller records
the scoped diff, command output, approved Scheduler hash, revised Modular hash, bind-probe disposition, cleanup
evidence, and commit intent.

## Review, ownership và handoff

- Foundation owner reviews Tasks 1–8 before scheduler starts.
- Scheduler owner owns server/scheduler/index.js, final server/app.js/server/index.js factory wiring, cutover, and
  scheduler-owned tests. Task 7 only verifies their public behavior.
- UI owner owns orbital UI behavior before Task 5; modularization owner may only extract its finalized public facade.
- CI owner reviews Task 6 after Tasks 1–5 are green. Task 7 review has four distinct checkpoints: Scheduler context,
  cache, lease, and timer boundaries; server request/listener/cleanup behavior; restricted-host socketless execution;
  and a required-bind execution on capable CI.
- Handoff từ Foundation phải gọi chính xác hai stage này là
  **modular Tasks 1–5 / CI-integration Tasks 6–7**; không dùng nhãn legacy trong link/interface liên-plan.
- Task 6 provisions exact lock dependencies before release. Then the fail-fast Task-7 gates run on Node 22.5.x and
  24.x where applicable. `EAI_AGAIN`/`ENOTCACHED` is `BLOCKED_EXTERNAL npm/network`, never GREEN or permission to
  rewrite package data. Keep tools/source-manifest.js order and public facade signatures as the conflict contracts.
- This revision must be frozen and independently approved before Task 7 dispatch; this plan records no such approval.

## Self-review record

- Spec coverage: package/lock exact procedure Task 6; gates/manifest Tasks 1–6; version/factory/UoW/loader in
  Foundation; incremental splits Tasks 1–5; socketless Scheduler integration verification Task 7.
- Manifest audit: mọi stage Tasks 1–5 có ba array full/exact và `new Set(list).size===list.length`; Files/green/commit
  của từng task cùng ghi index.html, web/index.html và hai generated dist artifacts, đều downstream từ một manifest.
- UI audit: Task 5 closed-set inventory/test/delegate toàn bộ own public U/APP surface, arity/arguments,
  `U.ui`/`U.MAN`/`APP.ACT` identity, `U.gal`/`U.form` live shape-identity, `U.mp` absence-first rồi materialize qua
  mophong/restore absence, `U.sigCu` scalar restore và `U.sig` qua `ve/live`; probe nằm sau `KEYBOARD_BOOTSTRAP_END`
  và trước `KEYBOARD_GAMEPLAY_START`, ngoài ba guarded slices.
- Economy audit: Task 3 fixture gọi exact `G.moiGame("Economy Timeline", "module-economy-timeline", undefined, nowS)`,
  đặt raid/maintenance sau target +6h, cover giá, cap/sản xuất, checkpoint, xếp/hủy ba queue và chứng minh một
  primitive giảm shared budget 50.000→49.999.
- Core ownership audit: RED/GREEN surface gate khóa exact 33 economy functions, 17 timeline functions + live boolean
  `MO_PHONG_NHE` và live writable string `TICK_PARTIAL === "Đang tua thời gian; thử lại ngay."`, 41 fleet functions và
  action object/function; namespace keys, arity, facade identity, scalar value/type/ordinary-assignment preservation,
  manifest order và disjoint ownership đều executable. Fleet set gồm travel/hold, raid/PvP, missiles, exploration và
  ground combat; Task 3/4 không dùng numeric extraction slice chồng lấn.
- Type consistency: `taoUngDung` chỉ chuyển exact six-key Scheduler context. The fixture constructs two distinct fresh
  copies, adds only `makeOwnerId`, and proves one real bridge/Writer cache by physical `Kho`; it adds no owner scalar,
  competing cache, second factory, or Scheduler timer. Public `runCommand` may be async while `command.run` remains
  synchronous; `BlockedExternal` stays nested in `AdvanceResult`.
- Readiness audit: Task 7 fake status retains exact flattened fields, nested `counts/ages`, exact seven-member
  `metrics`, five lifecycle booleans, `writerLeaseHeld`, `watermarkS`, and `reason`. The real first holder records a
  positive lease-acquire count. `app.getStatus().scheduler` matches the Scheduler status. The first ordered app is
  immediately ready/holder and the second is immediately standby without a poll or takeover. Startup submits zero
  commands; concurrent first information reads bootstrap once; a later read does not; one register fails before its
  closure and leaves account count unchanged.
- Socketless audit: all functional cases use one fake listener and `PassThrough` requests through the real handler.
  Only application intervals are faked. The dedicated real-bind probe alone uses `server.address()` and may skip only
  the same server-emitted `EPERM`/`EACCES` object; capable CI turns that disposition into a hard failure.
- Clock handoff audit: modular fake giữ đúng `nowMs`/`advanceMs` and never advances it. Mọi `clock.nowS` failure thuộc
  Scheduler owner và không được che bằng test-only seam mới.
- CI audit: Task 6 giữ package scripts/lock ownership ở foundation, nhưng workflow chạy trực tiếp
  package/quality/syntax/lint/version, artifact/loader/core, UoW/factory/entrypoint/server/scheduler, load và UI; npm
  registry/cache blocker được ghi riêng.
- Rà soát văn bản đã hoàn tất: không có marker công việc bỏ trống, hướng dẫn “tự xử lý lỗi”, hay hàm được dùng trước
  task định nghĩa nó.
