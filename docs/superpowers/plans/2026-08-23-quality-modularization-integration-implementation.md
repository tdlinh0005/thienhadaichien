# Quality Modularization and Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chia nhỏ các file JavaScript lớn qua facade ổn định, rồi tích hợp toàn bộ cổng chất lượng/CI mà vẫn giữ lịch sử game, scheduler và UI file:// tương thích.

**Architecture:** Mỗi extraction thêm module nhỏ trước, đưa nó vào source manifest, rồi giữ public facade cũ làm delegate. Các test bảo vệ output quan sát được: migration state, event advancement có ngân sách chung, HTTP/scheduler lifecycle và browser file://; không dùng source grep để “chứng minh” refactor. Bốn task tách module chỉ bắt đầu sau khi scheduler durable và orbital UI đã merge, để facade được trích từ hình thái cuối của chúng.

**Tech Stack:** Node.js CommonJS, browser script manifest tĩnh, Node assert, Playwright Chromium dev-only, GitHub Actions.

**Spec:** [quality-maintainability design](../specs/2026-08-23-quality-maintainability-design.md)

## Global Constraints

- Chuỗi tuyệt đối: foundation Tasks 1–8 → durable scheduler → orbital UI → Tasks 1–4 dưới đây → Tasks 5–6 dưới đây.
- Dùng tools/source-manifest.js của foundation làm nguồn thứ tự duy nhất; index.html/web/index.html/build/rules loader cùng xác nhận nó.
- Không thêm runtime dependency, không đổi engines >=22.5, và browser phải tiếp tục chạy từ file://index.html.
- Scheduler-aware core phải giữ G.tick(st,targetS,options), G.phanLoaiSuKienKe, G.xuLyMotSuKien, G.BLOCKED_EXTERNAL và shared budget.
- Core test lấy G bằng require("../server/rules.js").G, không import world.G.
- UI extraction là sau orbital UI; giữ U state/focus/drawer/chat và APP.tuaSolo.
- CI quality/core/server matrix Node 22.5.x và 24.x; UI/load chỉ Node 24.x. Không ghi một patch “current” chưa xác minh.

## File Structure

| Path | Trách nhiệm sau integration |
|---|---|
| js/core/data-catalog.js | dữ liệu hằng/snapshot thuần |
| js/core/util-format.js | utility không thay state |
| js/core/state.js | tạo, chuẩn hóa và migration state |
| js/core/economy.js | tính kinh tế/state pure helpers |
| js/core/timeline.js | advance event scheduler-aware |
| js/core/actions.js | dispatch action game |
| js/core/fleet-lifecycle.js | fleet/event lifecycle |
| js/ui/*.js | shell, screen, presenter, renderer UI orbital cuối |
| js/app/*.js | dispatch và solo loop, facade app.js giữ public API |
| tools/test-modular-core.js | test regression 50,001/external |
| .github/workflows/quality.yml | jobs reproducible CI |

---

### Task 1: Tách dữ liệu và utility qua facade ổn định

**Files:**
- Create: js/core/data-catalog.js
- Create: js/core/util-format.js
- Modify: js/data.js:1-900
- Modify: js/util.js:1-900
- Modify: tools/source-manifest.js:1-140
- Create: tools/test-module-manifest.js
- Create: tools/test-data-util-facade.js

**Interfaces:**
- Consumes: tools/source-manifest.js::{browserScripts,browserStyles}; global G từ rules loader foundation.
- Produces: G.dataCatalog, G.utilFormat; js/data.js và js/util.js giữ tất cả public global tên cũ làm facade; manifest thêm hai module trước facade tương ứng.

- [ ] **Step 1: Viết baseline behavior test**

~~~js
const assert = require("node:assert/strict");
const {G} = require("../server/rules.js");
assert.equal(G.so(1234567), "1.234.567");
assert.equal(G.LHT("onhoa").ten, "Ôn Hoà");
~~~

Lưu tại tools/test-data-util-facade.js. Run: node tools/test-data-util-facade.js. Expected: PASS, ghi output baseline trước extraction.

- [ ] **Step 2: Viết RED manifest test**

~~~js
const assert = require("node:assert/strict");
const manifest = require("./source-manifest.js");
const required = ["js/core/data-catalog.js", "js/core/util-format.js"];
for (const file of required) assert.ok(manifest.browserScripts.includes(file), file);
~~~

Nối vào tools/test-module-manifest.js trước test nào phụ thuộc module. Run: node tools/test-module-manifest.js. Expected: FAIL vì hai path chưa có trong manifest; đây là RED thật, baseline ở Step 1 không được ghi là RED.

- [ ] **Step 3: Implement tối thiểu**

Tạo js/core/data-catalog.js và js/core/util-format.js, gắn exports lên G trước khi facade nạp; tại js/data.js:1-900 và js/util.js:1-900 chỉ delegate:

~~~js
G.so = G.utilFormat.so;
G.giaTri = G.dataCatalog.giaTri;
~~~

Thêm hai paths vào browserScripts ngay trước js/data.js và js/util.js. Không đổi API callers.

- [ ] **Step 4: GREEN**

Run: node tools/test-module-manifest.js && node tools/test-data-util-facade.js && npm run test:core && npm run build && npm run check:artifact. Expected: PASS; cả hai artifact HTML thấy module mới theo đúng manifest.

- [ ] **Step 5: Commit**

Run: git add js/core/data-catalog.js js/core/util-format.js js/data.js js/util.js tools/source-manifest.js index.html web/index.html tools/test-module-manifest.js tools/test-data-util-facade.js && git commit -m "refactor: extract data and utility facades"

### Task 2: Tách state, economy và timeline scheduler-aware

**Files:**
- Create: js/core/state.js
- Create: js/core/economy.js
- Create: js/core/timeline.js
- Modify: js/engine.js:1-900
- Modify: js/fleet.js:1-1100
- Modify: tools/source-manifest.js:1-140
- Create: tools/test-state-timeline-facade.js

**Interfaces:**
- Consumes: G.dataCatalog/G.utilFormat Task 1; durable scheduler event semantics; G from server/rules.js.
- Produces: G.moiGame, G.nangCapState, G.tick(st,targetS,options), G.phanLoaiSuKienKe, G.xuLyMotSuKien, G.BLOCKED_EXTERNAL; each old entrypoint remains a facade.

- [ ] **Step 1: Viết baseline migration/timeline behavior**

~~~js
const assert = require("node:assert/strict");
const {G} = require("../server/rules.js");
const old = G.moiGame("A");
old.v = 3;
delete old.lichSu;
G.nangCapState(old);
assert.ok(Array.isArray(old.lichSu));
assert.throws(() => G.nangCapState({v: 999999}), /newer|future/i);
~~~

Lưu tools/test-state-timeline-facade.js. Run: node tools/test-state-timeline-facade.js. Expected: PASS baseline. Nó đo migration quan sát được, không tìm text trong source.

- [ ] **Step 2: Viết RED manifest test cho ba module**

Thêm trước mọi require trên vào tools/test-module-manifest.js:

~~~js
for (const file of ["js/core/state.js", "js/core/economy.js", "js/core/timeline.js"]) {
  assert.ok(manifest.browserScripts.includes(file), file);
}
~~~

Run: node tools/test-module-manifest.js. Expected: FAIL do ba path chưa tồn tại.

- [ ] **Step 3: Implement tối thiểu**

Di chuyển state creation/migration từ js/engine.js:1-900, economy pure calculations, và event advance từ js/fleet.js:1-1100 vào ba module. Facade phải giữ signature:

~~~js
G.tick = G.timeline.tick; // tick(st, targetS, options)
G.phanLoaiSuKienKe = G.timeline.phanLoaiSuKienKe;
G.xuLyMotSuKien = G.timeline.xuLyMotSuKien;
G.BLOCKED_EXTERNAL = G.timeline.BLOCKED_EXTERNAL;
~~~

Mọi loop truyền cùng options.budget object; không đổi targetS thành wall clock implicit.

- [ ] **Step 4: GREEN**

Run: node tools/test-module-manifest.js && node tools/test-state-timeline-facade.js && npm run test:core && npm run test:scheduler. Expected: PASS, scheduler vẫn nhận G.tick(st,targetS,options).

- [ ] **Step 5: Commit**

Run: git add js/core/state.js js/core/economy.js js/core/timeline.js js/engine.js js/fleet.js tools/source-manifest.js index.html web/index.html tools/test-module-manifest.js tools/test-state-timeline-facade.js && git commit -m "refactor: extract state economy and scheduler timeline"

### Task 3: Tách action và fleet lifecycle, giữ regression external/budget

**Files:**
- Create: js/core/actions.js
- Create: js/core/fleet-lifecycle.js
- Modify: js/actions.js:1-220
- Modify: js/fleet.js:1-1100
- Modify: tools/source-manifest.js:1-140
- Modify: tools/test-scheduler.js:1-520
- Create: tools/test-modular-core.js

**Interfaces:**
- Consumes: G.timeline interface Task 2 and scheduler bridge/harness foundation Task 7.
- Produces: G.lam, G.phanLoaiSuKienKe, G.xuLyMotSuKien and G.tick facades preserving BLOCKED_EXTERNAL and shared budget; tools/test-scheduler.js remains extendable by durable scheduler.

- [ ] **Step 1: Viết RED manifest test**

Thêm vào tools/test-module-manifest.js:

~~~js
for (const file of ["js/core/actions.js", "js/core/fleet-lifecycle.js"]) {
  assert.ok(manifest.browserScripts.includes(file), file);
}
~~~

Run: node tools/test-module-manifest.js. Expected: FAIL vì module chưa được manifest.

- [ ] **Step 2: Viết regression 50,001/external trước extraction**

tools/test-modular-core.js phải định nghĩa helpers trước khi dùng và import đúng rules:

~~~js
const assert = require("node:assert/strict");
const {G} = require("../server/rules.js");
function makeOptions() { return {budget: {value: 50000}}; }
const st = G.moiGame("A");
const opt = makeOptions();
const result = G.tick(st, 50001, opt);
assert.equal(opt.budget.value, 0);
assert.equal(result.budgetExhausted, true);
assert.equal(result.nextAt, 50001);
assert.equal(G.phanLoaiSuKienKe({loai: "external"}), G.BLOCKED_EXTERNAL);
~~~

Run: node tools/test-modular-core.js. Expected: PASS baseline; this is a regression contract, not a fabricated RED.

- [ ] **Step 3: Implement tối thiểu**

Đưa action dispatcher vào js/core/actions.js và lifecycle vào js/core/fleet-lifecycle.js, rồi delegate từ js/actions.js/js/fleet.js. Các module core test phải use:

~~~js
const {G} = require("../server/rules.js");
~~~

Không dùng require("../server/world.js").G. Không để APP hoặc game loop gọi tick trực tiếp với signature cũ; giữ G.tick(st,targetS,options) và options budget chung.

- [ ] **Step 4: GREEN**

Run: node tools/test-module-manifest.js && node tools/test-modular-core.js && npm run test:scheduler && npm run test:core. Expected: PASS, 50,001 events stop at shared limit and external event returns BLOCKED_EXTERNAL mà không advance sai.

- [ ] **Step 5: Commit**

Run: git add js/core/actions.js js/core/fleet-lifecycle.js js/actions.js js/fleet.js tools/source-manifest.js index.html web/index.html tools/test-module-manifest.js tools/test-modular-core.js tools/test-scheduler.js && git commit -m "refactor: extract actions and fleet lifecycle"

### Task 4: Tách UI/app sau orbital UI mà giữ state, focus, drawer và chat

**Files:**
- Create: js/ui/shell.js
- Create: js/ui/screens.js
- Create: js/ui/presenter.js
- Create: js/ui/render.js
- Create: js/app/dispatch.js
- Create: js/app/solo-loop.js
- Modify: js/ui.js:1-2200
- Modify: js/app.js:1-900
- Modify: tools/source-manifest.js:1-140
- Modify: tools/ui-file-gate.mjs:1-260
- Modify: tools/test-mp-ui.mjs:1-260

**Interfaces:**
- Consumes: finalized orbital UI U.ui, U.chupTrang(), U.phucHoiTrang(snapshot), U.datDrawer(open), U.chuyenDrawer(), U.hop/U.dongHop, focus/drawer/chat behavior; tools/source-manifest.js; APP.tuaSolo contract.
- Produces: facade U public methods and APP.tuaSolo remain stable; files are ordered before js/ui.js and js/app.js in manifest.

- [ ] **Step 1: Viết RED manifest/import gate**

Trong tools/ui-file-gate.mjs định nghĩa dependency CommonJS trước mọi assertion:

~~~js
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const manifest = require("./source-manifest.js");
for (const file of ["js/ui/shell.js","js/ui/screens.js","js/ui/presenter.js","js/ui/render.js","js/app/dispatch.js","js/app/solo-loop.js"]) {
  assert.ok(manifest.browserScripts.includes(file), file);
}
~~~

Run: node tools/ui-file-gate.mjs. Expected: FAIL vì new paths chưa có, trước khi bắt đầu extraction.

- [ ] **Step 2: Viết browser behavior baseline**

Trong tools/test-mp-ui.mjs dùng locator, không dùng $eval/$$eval:

~~~js
await page.locator("#nut-menu").click();
assert.equal(await page.locator("#nut-menu").getAttribute("aria-expanded"), "true");
await page.keyboard.press("Escape");
assert.equal(await page.locator("#nut-menu").getAttribute("aria-expanded"), "false");
await page.evaluate(() => { U.man = "chat"; U.ve(); });
await page.locator("#chat-noi-chung").fill("xin chào");
await page.evaluate(() => U.ve());
assert.equal(await page.locator("#chat-noi-chung").inputValue(), "xin chào");
assert.equal(await page.evaluate(() => !!U.ui && typeof U.chupTrang === "function" &&
  typeof U.phucHoiTrang === "function" && typeof APP.tuaSolo === "function"), true);
~~~

Run: npm run test:ui. Expected: PASS baseline on file:// URL, verifying U state/focus/drawer/chat rather than DOM source shape.

- [ ] **Step 3: Implement tối thiểu**

Extract the already-redesigned orbital UI into the six new files. Define exports in the new files before the facades consume them by moving the currently public bodies:

~~~js
// js/ui/render.js, after moving the former U.ve body
U.renderView = U.ve;
// js/ui/shell.js, after moving the former U.hop/U.dongHop bodies
U.shell = {moDrawer: U.hop, dongDrawer: U.dongHop};
// js/app/solo-loop.js, APP.tuaSolo is supplied by the prior orbital UI plan
APP.soloLoop = {tuaSolo: APP.tuaSolo};
~~~

Move the existing concrete bodies into those named functions. js/ui.js stays facade:

~~~js
U.render = U.renderView;
U.moDrawer = U.shell.moDrawer;
U.dongDrawer = U.shell.dongDrawer;
~~~

js/app.js stays facade and delegates solo loop:

~~~js
APP.tuaSolo = APP.soloLoop.tuaSolo;
~~~

Do not replace file:// static scripts with runtime module imports; add exact ordered paths to tools/source-manifest.js, index.html và web/index.html.

- [ ] **Step 4: GREEN**

Run: node tools/ui-file-gate.mjs && npm run test:ui && npm run test:load && npm run build && npm run check:artifact. Expected: PASS; reload/focus return, drawer and chat message behavior survive extraction and file:// remains the test URL.

- [ ] **Step 5: Commit**

Run: git add js/ui js/app js/ui.js js/app.js tools/source-manifest.js index.html web/index.html tools/ui-file-gate.mjs tools/test-mp-ui.mjs && git commit -m "refactor: split finalized orbital ui through facades"

### Task 5: Hoàn thiện scripts và CI tái lập

**Files:**
- Modify: package.json:1-40
- Modify: package-lock.json
- Create: .github/workflows/quality.yml
- Create: tools/test-ci-contract.js

**Interfaces:**
- Consumes: all package scripts from foundation and test:scheduler behavior harness; exact Playwright package in lockfile.
- Produces: CI jobs quality, artifact-and-core, server, load, ui and npm test/test:all composition for release review.

- [ ] **Step 1: Viết RED CI contract**

~~~js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const pkg = require("../package.json");
const yml = fs.readFileSync(".github/workflows/quality.yml", "utf8");
function jobBlock(name) {
  const expression = new RegExp("^  " + name + ":\\n([\\s\\S]*?)(?=^  [A-Za-z][A-Za-z0-9-]*:|$)", "m");
  const match = expression.exec(yml);
  assert.ok(match, "missing job " + name);
  return match[0];
}
assert.match(pkg.scripts.test, /test:scheduler/);
assert.match(pkg.scripts["test:all"], /test:scheduler/);
assert.match(pkg.scripts["test:all"], /npm run build && npm run check:artifact/);
for (const job of ["quality", "artifact-and-core", "server", "load", "ui"]) {
  assert.match(jobBlock(job), /npm ci/, job + " npm ci");
}
for (const job of ["quality", "artifact-and-core", "server"]) {
  assert.match(jobBlock(job), /22\.5\.x/);
  assert.match(jobBlock(job), /24\.x/);
}
for (const job of ["load", "ui"]) assert.match(jobBlock(job), /24\.x/);
assert.match(jobBlock("ui"), /npx --no-install playwright install --with-deps chromium/);
~~~

Lưu tools/test-ci-contract.js. Run: node tools/test-ci-contract.js. Expected: FAIL vì workflow hoặc composition chưa đủ.

- [ ] **Step 2: Implement scripts**

Set script behavior explicitly:

~~~json
{
  "test": "npm run test:core && npm run test:server && npm run test:scheduler",
  "test:all": "npm run check:syntax && npm run lint && npm run check:version && npm run build && npm run check:artifact && npm run test:core && npm run test:server && npm run test:scheduler && npm run test:load && npm run test:ui"
}
~~~

Giữ exact resolved playwright trong package-lock; nếu package upgrade, lại chạy npm view playwright version engines --json trước npm install --save-dev --save-exact, không ghi patch current đoán trước.

- [ ] **Step 3: Implement workflow**

quality, artifact-and-core, server use matrix node [22.5.x, 24.x]; load và ui use 24.x. Every job runs npm ci. ui also runs:

~~~yaml
quality:
  strategy:
    matrix: { node: ["22.5.x", "24.x"] }
  steps:
    - run: npm ci
    - run: npm run check:syntax && npm run lint && npm run check:version
ui:
  steps:
    - run: npm ci
    - run: npx --no-install playwright install --with-deps chromium
    - run: npm run test:ui
~~~

artifact-and-core chạy build, check:artifact và git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html rồi test:core. server chạy test:server && test:scheduler. load chạy test:load. Không chạy browser install trước npm ci; không hardcode Node patch của release line 24.

- [ ] **Step 4: GREEN**

Run: node tools/test-ci-contract.js && npm ci && npm run test:all. Expected: PASS locally; review workflow confirms each matrix job has npm ci and test:scheduler is both test and test:all.

- [ ] **Step 5: Commit**

Run: git add package.json package-lock.json .github/workflows/quality.yml tools/test-ci-contract.js && git commit -m "ci: run reproducible quality matrix"

### Task 6: Tích hợp factory với durable scheduler và release gate

**Files:**
- Modify: server/app.js:1-300
- Modify: server/scheduler/index.js:1-420
- Modify: tools/test-scheduler.js:1-620
- Create: tools/test-quality-integration.js
- Modify: package.json:1-40

**Interfaces:**
- Consumes: taoUngDung(options) Task 6 foundation; scheduler/scheduler/index.js::taoScheduler(context) from durable scheduler plan returning {start,stop,getStatus,runCommand,schedule,cancel,reconcile,advanceTo}; APP.tuaSolo and manifest final.
- Produces: production factory scheduler lifecycle, release integration gate, rollback-safe start/stop behavior.

- [ ] **Step 1: Viết RED two-app scheduler integration test**

tools/test-quality-integration.js must define helpers first:

~~~js
const assert = require("node:assert/strict");
const {taoUngDung} = require("../server/app.js");
async function makeApp(dbPath) {
  return taoUngDung({dbPath, allowMemoryDb: false, clock: {nowMs: () => 1700000000000}});
}
async function closeAll(apps) { for (const app of apps) await app.stop(); }
~~~

Create two apps with the same temporary file db, call start on both, then assert exactly one app.scheduler.getStatus().writerLeaseHeld is true. Run: node tools/test-quality-integration.js. Expected: FAIL before app defaults to taoScheduler(context), because foundation bridge has no lease ownership.

- [ ] **Step 2: Wire the existing durable scheduler**

In server/app.js, construct only:

~~~js
const {taoScheduler} = require("./scheduler/index.js");
const scheduler = options.scheduler || taoScheduler({kho, tg, clock, logger});
~~~

Never expose a writer. start calls scheduler.start before API accepts durable writes; stop calls scheduler.stop before database close. Preserve idempotence and do not bind on require.

- [ ] **Step 3: GREEN release integration**

Extend test-quality-integration.js to assert runCommand accepts exactly {name, accountId, run}, run is sync, repeated start/stop succeeds, and a losing writer does not execute a durable command. Run: node tools/test-quality-integration.js && npm run test:scheduler. Expected: PASS.

- [ ] **Step 4: Final release/rollback evidence**

Run: npm ci && npm run test:all. Then run node tools/test-quality-integration.js once with scheduler disabled by an injected test bridge; Expected: API contract still returns controlled unavailable error and state is unchanged. This is the documented rollback path: deploy prior app package with the same schema only after this state-unchanged test passes; never downgrade state schema.

- [ ] **Step 5: Commit**

Run: git add server/app.js server/scheduler/index.js tools/test-scheduler.js tools/test-quality-integration.js package.json && git commit -m "feat: integrate durable scheduler into quality release gate"

## Review, ownership và handoff

- Foundation owner reviews Tasks 1–8 before scheduler starts.
- Scheduler owner owns server/scheduler/index.js and extends tools/test-scheduler.js; factory owner only wires taoScheduler(context).
- UI owner owns orbital UI behavior before Task 4; modularization owner may only extract its finalized public facade.
- CI owner reviews Task 5 after Tasks 1–4 are green; two reviewers run Task 6: one checks scheduler/UoW semantics, one runs file:// and artifact gates.
- Before merge, run npm ci && npm run test:all plus node tools/test-quality-integration.js on Node 22.5.x and 24.x where applicable. Resolve conflicts by keeping tools/source-manifest.js order and public facade signatures as the single contracts.

## Self-review record

- Spec coverage: package/lock exact procedure Task 5; gates/manifest Tasks 1–5; version/factory/UoW/loader in foundation; incremental splits Tasks 1–4; scheduler integration Task 6.
- Rà soát văn bản đã hoàn tất: không có marker công việc bỏ trống, hướng dẫn “tự xử lý lỗi”, hay hàm được dùng trước task định nghĩa nó.
- Type consistency: all scheduler consumers use taoScheduler(context), getStatus(), and runCommand({name,accountId?,run}); all core consumers use G from server/rules.js and G.tick(st,targetS,options).
