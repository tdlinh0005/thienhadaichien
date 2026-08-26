# Orbital Command UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` (preferred) or
> `superpowers:executing-plans`. Execute one task at a time, with a fresh
> implementer and an independent spec/quality review before the next task.

**Goal:** Hiện đại hoá toàn bộ giao diện vanilla JavaScript của Thiên Hà Đại
Chiến thành một “Đài chỉ huy quỹ đạo” đẹp, rõ, dùng được bằng bàn phím, giữ
nguyên luật game, save, API và mọi facade công khai.

**Architecture:** Hai entrypoint solo/multiplayer giữ nguyên. HTML sở hữu shell
semantic; `css/style.css` sở hữu hệ token, visual signature và responsive;
`js/ui.js` sở hữu renderer/presentation state; `js/app.js` sở hữu delegation;
`web/js/mp.js` vẫn là adapter server-authoritative. Browser test chạy server
in-process qua đúng `taoUngDung({port:0,...,schedulerFactory})`, không spawn
child server. Task 1 chạy maintenance cutover công khai trên temp DB trước
browser context đầu tiên, rồi toàn bộ Tasks 1–10 dùng durable
`taoScheduler` thật qua seam Foundation. Không có fake ready bridge.

**Tech stack:** HTML5, CSS custom properties, vanilla browser DOM, Node.js
`>=22.5`, `node:sqlite`, Playwright Chromium được Foundation pin chính xác,
Node built-in test runner và build/artifact checker của Foundation.

**Specs:**

- `docs/superpowers/specs/2026-08-23-ui-modernization-design.md`
- `docs/superpowers/specs/2026-08-23-durable-event-scheduler-design.md`
- `docs/superpowers/specs/2026-08-23-quality-maintainability-design.md`

## Điều kiện vào và thứ tự tích hợp tuyệt đối

Thứ tự không được đảo là:

**Foundation Tasks 1–8 → Scheduler Tasks 1–10 → UI Tasks 1–10 →
Modularization Tasks 1–5 → CI/integration Tasks 6–7.**

Trước UI Task 1, chạy:

~~~bash
node tools/test-package-contract.js
npm ci
npm run test:scheduler
npm run test:server
~~~

Expected: PASS. Foundation Task 1 là owner duy nhất của `package.json`,
`package-lock.json` và pin Playwright. Nếu registry/cache vẫn không truy cập
được thì browser RED/GREEN của plan này là **BLOCKED**, không được đổi static
`import { chromium } from "playwright"`, không thêm dynamic loader, không tự
viết lockfile và không tuyên bố UI đã xanh.

UI plan không tạo một scheduler option thứ hai. Seam duy nhất là
`schedulerFactory(context)` đã được Foundation đóng băng, và giá trị duy
nhất plan truyền là `taoScheduler`. Trạng thái luôn lấy bằng
`app.scheduler.getStatus()`. Trước browser test đầu tiên, maintenance dùng
đúng public contract Scheduler Task 9:

~~~js
runMaintenanceCutover({kho, clock, ownerId});
~~~

Sau khi maintenance `Kho` đóng, app duy nhất là:

~~~js
taoUngDung({
  port: 0,
  dbPath,
  clock,
  logger,
  schedulerFactory: taoScheduler
});
~~~

Không route, middleware, world method, DB flag, fake lease hay ready status
nào được patch. Task 9 restart cùng DB và Task 10 rerun suite để kiểm
lại cutover result, real writer, registration và durable mutation.

## Visual direction đã duyệt

**Chủ thể:** một webgame chiến thuật Việt cho người chơi cần giám sát đế quốc,
ra quyết định nhanh và so sánh nhiều dữ liệu. **Một việc chính của mỗi màn:**
cho người chơi thấy tình hình, rủi ro và hành động kế tiếp mà không phải đoán.

Hệ thiết kế dùng đúng tinh thần ảnh đã duyệt tại
`docs/superpowers/specs/assets/thdc-orbital-command-reference.png`, nhưng PNG
chỉ nằm trong docs và tuyệt đối không xuất hiện trong HTML/CSS/JS/build runtime.

- **Nền Hố sâu `#030813`:** nền không gian tĩnh, đủ tối để số liệu nổi lên.
- **Kim loại lệnh `#071321`:** command/nav shell.
- **Mặt kính `#0b1a2a` và `#10263a`:** panel nền/nổi, viền rõ thay vì blur nặng.
- **Cyan quỹ đạo `#42d9ff`:** focus, route hiện hành, radar và dữ liệu đang live.
- **Amber lệnh `#ffb454`:** hành động chính/điểm nhấn đế quốc.
- **Đỏ cảnh báo `#ff6b66`, vàng `#ffd166`, xanh `#55d98b`:** trạng thái luôn có
  text/icon đi kèm.

Typography không tải mạng: display dùng
`"Bahnschrift Condensed", "Arial Narrow", "Roboto Condensed", sans-serif`;
body dùng `"Segoe UI Variable", "Aptos", "Noto Sans", sans-serif`; số liệu dùng
`"Cascadia Mono", "Consolas", "DejaVu Sans Mono", monospace`. Display và body
phải có computed `font-family` khác nhau.

Visual signature duy nhất là **trường quỹ đạo/radar code-native**: vòng tròn
đồng tâm, trục tọa độ, lõi amber và sweep cyan được dựng bằng element, border,
`repeating-radial-gradient`, `conic-gradient` và pseudo-element. Nó xuất hiện ở
logo command và phần Tổng Quan, encode đúng ngôn ngữ hành tinh/quỹ đạo. Các
panel còn lại tiết chế, không rải glow/gradient trang trí. Với reduced motion,
sweep đứng yên nhưng vòng/trục vẫn thấy rõ.

Tự phê bình bắt buộc: đây không được trở thành “dashboard tối + card + neon”
chung chung. Test visual phải chứng minh có cấu trúc radar/quỹ đạo, type roles,
active navigation, amber command, cyan focus, bề mặt kim loại và grid tọa độ;
không chỉ kiểm một màu nền.

## Baseline file map và ranh giới

Các range sau là baseline hiện tại trước UI implementation; khi code dịch dòng,
worker dùng symbol/ID ghi cạnh range, không bám số dòng mù quáng.

| File baseline | Owner trong plan |
| --- | --- |
| `index.html:13-62` | Solo startup/main, game shell, command/resources, modal/toast. |
| `web/index.html:13-79` | MP auth tabs/forms/main và cùng game shell. |
| `css/style.css:3-221` | Toàn bộ token, signature, component, breakpoint. |
| `js/ui.js:3-1674` | `U`, command/nav/alert, preservation, mọi renderer. |
| `js/app.js:7-310` | Delegation, validation, drawer/modal/action. |
| `js/main.js:5-191` | Solo startup/save/import/export/delete. |
| `web/js/mp.js:6-666` | Auth, MP reads/retry/chat/account/alliance. |
| `tools/test-mp-ui.mjs:1-773` | In-process browser harness và acceptance. |
| `server/app.js::taoUngDung` | Verify/consume only; không sửa trong UI plan. |
| `server/scheduler/index.js::taoScheduler` | Verify/consume only. |
| `server/scheduler/cutover.js::runMaintenanceCutover` | Verify/consume only. |
| `tools/source-manifest.js`, `tools/build.js` | Verify only; Foundation/Modularization own source order. |

## Hợp đồng toàn cục không được phá

- Giữ gameplay, công thức, state/save schema, routes, API, payload `APP.lam`,
  server authority, localStorage key/token, `id`, `data-act`, `data-man` và nhãn
  sáu tài nguyên.
- Giữ public function/arity đã được modular plan khoá, đặc biệt
  `U.hop(title,html,options)`, `U.chupTrang()`, `U.phucHoiTrang(snapshot)`,
  `U.tieuDeMan()`, `U.datDrawer(open)`, `U.chuyenDrawer()`,
  `U.giuTabTrongHop(event)`, `U.nhanTruong(id,label,controlHtml,helpHtml)`,
  `U.bang(id,caption,headHtml,bodyHtml,className)`,
  `U.chuanHoaNoiDung(root)`, `APP.tuaSolo()` và `APP.thuLai(key)`.
- Helper mới không thuộc public surface phải mang prefix `_`, thí dụ
  `U._khoaFocusNoiBo`, `U._baoLoiFormNoiBo`, `U._datTaiNguyenNoiBo`.
- Giữ object identity của `U.ui`, `U.MAN`, `U.nguon`, `APP.ACT` qua render.
- Giữ thứ tự facade. Không thêm framework, dependency runtime, font/network,
  ESM runtime import hoặc bitmap runtime.
- Không dùng `$eval`, `$$eval`, string-form `page.evaluate`, `eval` hoặc
  `new Function` trong test mới. Static Playwright import của Foundation đứng
  ở top-level.
- Không có dòng JavaScript mới dài quá 120 cột. Mỗi task chạy `npm run lint`
  và `git diff --check`.
- Screenshot review là output kiểm tra, không phải source asset và không stage.
- Các `git add/commit` block là exact intended commit boundary. Nếu `.git` vẫn
  read-only, controller không retry phá sandbox; lưu SDD snapshot + SHA/diff,
  ghi commit intent và chỉ tiến task sau khi code/review gates xanh.

## Test harness chuẩn dùng cho mọi task

Task 1 chỉ tạo một temp DB. Trước khi tạo page/context, nó chạy
Scheduler Task 9 maintenance contract trên DB đó, đóng maintenance handle,
rồi start app bằng real `taoScheduler`. Harness dùng clock cố định, port hệ
điều hành cấp, base address lấy sau bind và deadline có huỷ timer; không có
`nghi`, random port hay sleep sau response:

~~~js
let UI_NOW_MS = 1_800_000_000_000;

function voiHan(promise, timeoutMs, label) {
  var timer;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      reject(new Error("timeout: " + label));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(function () {
    clearTimeout(timer);
  });
}

function baseUrlCuaApp(app) {
  var address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("server has no TCP address");
  }
  return "http://127.0.0.1:" + address.port;
}

function chuanBiDbDurable() {
  var maintenanceKho = new Kho(DB, {clock: CLOCK, logger: LOGGER});
  try {
    return runMaintenanceCutover({
      kho: maintenanceKho,
      clock: CLOCK,
      ownerId: "00000000-0000-4000-8000-000000000091"
    });
  } finally {
    maintenanceKho.dong();
    if (process.platform !== "win32") fs.chmodSync(DB, 0o600);
  }
}

async function doiSchedulerSanSang(app) {
  var deadline = Date.now() + 10_000;
  var status;
  while (Date.now() < deadline) {
    status = app.scheduler.getStatus();
    if (status.mode && status.mode !== "durable") {
      throw new Error("unexpected scheduler mode: " + status.mode);
    }
    if (status.ready) return status;
    await new Promise(function (resolve) { setImmediate(resolve); });
  }
  throw new Error("durable scheduler not ready: " +
    JSON.stringify(status && {state: status.state, reason: status.reason}));
}

async function khoiDongApp() {
  var app = taoUngDung({
    port: 0,
    dbPath: DB,
    clock: CLOCK,
    logger: LOGGER,
    env: UI_ENV,
    schedulerFactory: taoScheduler
  });
  try {
    await voiHan(app.start(), 5_000, "app.start");
    var status = await doiSchedulerSanSang(app);
    return {app: app, baseUrl: baseUrlCuaApp(app), status: status};
  } catch (error) {
    try { await app.stop(); } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}
~~~

Outer setup gán `CUTOVER_RESULT=chuanBiDbDurable()` đúng một lần, assert
`mode="durable"`, rồi `app/BASE_URL/DURABLE_STATUS` từ `khoiDongApp()`. Assert
`mode="durable"`, `ready=true`, `reason=null`, `writerLeaseHeld=true`,
`recoveryComplete=true`, sau đó `/readyz` và `/healthz` đều 200. Chỉ lúc
đó mới được tạo browser context đầu tiên.

Existing fleet/hold fixtures that create a due event go through the real writer
fixture command; the next account command exercises its installed sole
`GameAdvanceService`. No UI test substitutes a no-op `advanceTo`.

Mọi `page.waitForResponse`, `waitForFunction`, `locator.waitFor` có timeout hữu
hạn và chờ outcome cụ thể. Cleanup luôn theo thứ tự browser contexts → browser →
`app.stop()` → close `Kho` maintenance nếu có → xoá temp directory cùng
`-wal/-shm`; lỗi cleanup không che lỗi đầu tiên.

---

### Task 1: In-process harness và semantic startup/auth shell

**Files:**

- Modify: `tools/test-mp-ui.mjs:1-773`
- Modify: `index.html:13-62`
- Modify: `web/index.html:13-79`
- Modify: `js/main.js:163-191`
- Modify: `web/js/mp.js:566-666`
- Verify only: `server/world.js::G` test export used later by Task 9

**Interfaces:**

- Consumes: Foundation `taoUngDung`, static Playwright import, Scheduler Task 9
  `runMaintenanceCutover`, `Kho`, `taoScheduler`, existing server `G` test
  export and canonical status.
- Produces: one real durable in-process `app` at a time, `CUTOVER_RESULT`,
  `DURABLE_STATUS`, `BASE_URL` từ `server.address()`, temp DB cleanup, semantic
  startup forms, đúng một visible `main`, auth tabs roving tabindex. Baseline
  account identities are numeric `accountId1/accountId2`, captured from real
  successful `/api/state` responses in outer `chay()` scope.
- Preserves: `/`, `/index.html`, `/solo`, `/motnguoi`, root `file://index.html`,
  mọi startup/game ID và localStorage keys.

- [ ] **Step 1: Đổi harness trước, không đổi acceptance**

  Xoá imports `spawn`, biến `CONG`, child `sv`, function `nghi`, loop port
  8300–8399, SIGKILL và fixed waits. Thêm `createRequire`, require đúng public
  modules sau khi Scheduler Task 10 đã merge:

  ~~~js
  import {createRequire} from "node:module";
  import {fileURLToPath, pathToFileURL} from "node:url";

  const require = createRequire(import.meta.url);
  const {taoUngDung} = require("../server/app.js");
  const {taoClock} = require("../server/clock.js");
  const {Kho} = require("../server/db.js");
  const {G: G_SERVER} = require("../server/world.js");
  const {taoScheduler} = require("../server/scheduler/index.js");
  const {
    runMaintenanceCutover
  } = require("../server/scheduler/cutover.js");
  ~~~

  Rename the current server-address binding `var URL` to
  `var BASE_URL = ""`. Every server `page.goto`, `fetch`, log, restart
  assignment and context bootstrap reads `BASE_URL`; no declaration,
  parameter, destructuring target or assignment may bind bare `URL`.

  Xoá import `DatabaseSync` và display-name lookup. Arm
  `page.waitForResponse` cho `/api/state` trước submit đăng ký/đăng nhập; chỉ
  response 200 thật mới được đưa vào producer dưới đây. `dangKy` trả cả payload
  cũ và numeric ID; declare `accountId1/accountId2` ngay sau hai registration,
  trước bất kỳ `suaStateUI` nào. Các fixture helpers chính xác là:

  ~~~js
  function kiemKhongCheURL(source) {
    var constructorName = "U" + "RL";
    var approved = new RegExp(
      "\\bnew\\s+" + constructorName + "\\s*\\(\\s*" +
      "(response\\.url\\(\\)|import\\.meta\\.url)\\s*\\)",
      "g"
    );
    var constructorArgs = [];
    var withoutApproved = source.replace(approved, function (_, argument) {
      constructorArgs.push(argument);
      return "";
    });
    constructorArgs.sort();
    if (constructorArgs.join(",") !== "import.meta.url,response.url()") {
      throw new Error("unexpected constructor sites: " + constructorArgs.join(","));
    }
    var bareConstructor = new RegExp("\\b" + constructorName + "\\b");
    if (bareConstructor.test(withoutApproved)) {
      throw new Error("server base shadows the platform constructor");
    }
  }

  var TEST_SOURCE = fs.readFileSync(new URL(import.meta.url), "utf8");
  kiemKhongCheURL(TEST_SOURCE);

  async function layAccountIdTuState(response, expectedName) {
    var pathname = new URL(response.url()).pathname;
    if (pathname !== "/api/state" || response.status() !== 200) {
      throw new Error("expected successful /api/state response");
    }
    var payload = await response.json();
    var accountId = Number(payload && payload.toi && payload.toi.tk);
    if (!Number.isSafeInteger(accountId) || accountId < 1 ||
        payload.toi.ten !== expectedName) {
      throw new Error("invalid account identity from /api/state");
    }
    return accountId;
  }

  function docRevisionUI(accountId) {
    var row = app.kho.q.dqGet.get(accountId);
    var revision = Number(row && row.revision);
    if (!row || !Number.isSafeInteger(revision) || revision < 0) {
      throw new Error("missing canonical revision: " + accountId);
    }
    return revision;
  }

  async function suaStateUI(accountId, mutate) {
    if (!Number.isSafeInteger(accountId) || accountId < 1) {
      throw new Error("invalid fixture accountId");
    }
    var beforeState;
    var revisionBeforeSave;
    await app.scheduler.runCommand({
      name: "ui-test-fixture",
      accountId: accountId,
      run: function () {
        var loaded = app.tg.nap(accountId);
        if (!loaded || !loaded.st) throw new Error("fixture account missing");
        beforeState = JSON.parse(JSON.stringify(loaded.st));
        var state = JSON.parse(JSON.stringify(loaded.st));
        revisionBeforeSave = Number(loaded.row.revision);
        if (!Number.isSafeInteger(revisionBeforeSave)) {
          throw new Error("fixture revision missing before save");
        }
        var result = mutate(state);
        if (result && typeof result.then === "function") {
          throw new Error("fixture mutate must be synchronous");
        }
        app.tg.luu(accountId, state);
      }
    });
    var revision = docRevisionUI(accountId);
    if (revision !== revisionBeforeSave + 1) {
      throw new Error("fixture revision mismatch");
    }
    return {beforeState: beforeState, revision: revision};
  }

  function resolveWarUI(attackerId, defenderId) {
    if (!app.tg.nap(attackerId) || !app.tg.nap(defenderId)) {
      throw new Error("war fixture account missing");
    }
    var rows = app.tg.chienCua(attackerId).di.filter(function (row) {
      return Number(row.tkD) === defenderId;
    });
    if (rows.length !== 1) throw new Error("war relation is not unique");
    return rows[0];
  }

  async function quaMocChienUI(attackerId, defenderId, effectiveAtS) {
    if (![attackerId, defenderId, effectiveAtS].every(Number.isSafeInteger)) {
      throw new Error("invalid war boundary fixture");
    }
    var targetMs = (effectiveAtS + 1) * 1000;
    if (targetMs <= UI_NOW_MS) throw new Error("war clock must advance");
    await voiHan(app.stop(), 5_000, "war-boundary app.stop");
    app = null;
    UI_NOW_MS = targetMs;
    var durableRun = await khoiDongApp();
    app = durableRun.app;
    BASE_URL = durableRun.baseUrl;
    DURABLE_STATUS = durableRun.status;
    if (!DURABLE_STATUS.ready || DURABLE_STATUS.mode !== "durable" ||
        !DURABLE_STATUS.writerLeaseHeld) {
      throw new Error("war-boundary scheduler not ready");
    }
    var resolved;
    await app.scheduler.runCommand({
      name: "ui-test-war-boundary",
      accountId: attackerId,
      run: function () {
        resolved = resolveWarUI(attackerId, defenderId);
        if (resolved.hieuLuc !== effectiveAtS ||
            resolved.trang !== "hieuluc" || resolved.duoc !== true) {
          throw new Error("war did not cross canonical boundary");
        }
      }
    });
    return resolved;
  }
  ~~~

  `suaStateUI` luôn `app.tg.nap(accountId)` sau automatic advance trong
  synchronous writer closure, clone/mutate đồng bộ, gọi `app.tg.luu`, rồi chỉ
  đọc canonical revision qua prepared `dqGet` sau khi awaited command commit.
  Đổi hai hold call sites hiện hữu thành `await suaStateUI(accountId2, ...)`.
  Helper không làm registration/login/action pass, không direct SQL và không
  mở SQLite connection thứ hai.

  Thay riêng block `UPDATE chien ... khi` hiện hữu bằng authoritative boundary
  flow. Capture returned response from `await nhan(...,{url:"/api/tuyenchien"})`
  and parse its successful JSON; resolve exactly one outgoing row có
  `tkD===accountId1`, assert `trang="cho"`, `duoc=false` và
  `hieuLuc-khi===86_400`. Sau khi UI đã chứng minh modal/countdown ở cả hai bên,
  close both browser contexts, then call
  `await quaMocChienUI(accountId2,accountId1,row.hieuLuc)`. Helper stops the app
  at the old clock while its 15-second lease is still live, then advances the
  shared mutable `CLOCK` and reopens the same already-durable DB. It never runs
  cutover twice. The fresh real `taoScheduler` acquires a new lease at the new
  operational time; this avoids invalidating a live lease with a 24-hour jump.

  Scheduler Task 7 đã đổi `chienCua/quyenDanh` khỏi `Date.now()` sang injected
  clock. After canonical ready assertions, `runCommand` advances attacker,
  holds its real lease/UoW, then resolves both accounts and exactly one outgoing
  relation synchronously. Recreate both contexts against new derived `BASE_URL`,
  re-login with the original credentials, refresh by real `/api/he`, and assert
  the target row exposes Tấn Công. Không update/backdate/delete war row; clock
  only moves forward and the record remains until outer temp-DB cleanup.

  Tạo temp directory bằng `fs.mkdtempSync(path.join(os.tmpdir(),
  "thdc-ui-"))`; DB là file `game.db` trong directory đó. Clock dùng
  `taoClock({nowMs:function(){return UI_NOW_MS;}})`. `UI_ENV` là object test
  riêng, không mutate `process.env`, với `PORT:"0"`, `THDC_DB:DB`,
  `THDC_NHIP:"100"`, `THDC_AM:"0"`, `THDC_GIOI_HAN:"5000"` và
  `THDC_GIOI_HAN_DN:"5000"`. Logger gom structured entry vào array và
  không in token/state:

  ~~~js
  var LOGGER_ENTRIES = [];
  var LOGGER = {};
  ["debug", "info", "warn", "error"].forEach(function (level) {
    LOGGER[level] = function (entry) {
      LOGGER_ENTRIES.push({level: level, entry: entry});
    };
  });
  ~~~

  Gọi `chuanBiDbDurable()` đúng một lần trước `browserType.launch`,
  sau đó `khoiDongApp()` và canonical status/health/ready assertions đã
  đóng băng ở harness section. Không tạo fake factory cho static, file
  hay browser context nào; static/file contexts không gọi server game route.

  Thay toàn bộ `$eval/$$eval` bằng `locator().evaluate/evaluateAll`. Thay mọi
  string-form `evaluate/waitForFunction` bằng function + argument. Thay helper
  `nhan` bằng response/outcome driven contract:

  ~~~js
  async function nhan(page, selector, options) {
    options = options || {};
    var response = options.url ? page.waitForResponse(function (item) {
      return item.url().includes(options.url);
    }, {timeout: 20_000}) : null;
    await page.locator(selector).click();
    var resolvedResponse = response ? await response : null;
    if (options.done) {
      await page.waitForFunction(options.done, options.arg, {timeout: 20_000});
    }
    return resolvedResponse;
  }
  ~~~

  Mỗi call hiện hữu truyền outcome đang được assertion kế tiếp dùng; không thêm
  “đợi 200/350 ms”. Sau `dangKy/dangNhap`, chờ `#game` visible,
  `#man-khoidong` hidden và `ST.planets.length > 0`. Sau poll membership, chờ
  đúng `ST.lm.ten`; sau chat, chờ đúng message `id/noi`; sau render, chờ đúng
  `U.man` và control màn đích.

  `finally` giữ first error, đóng mỗi context còn live, browser, rồi `app.stop()`
  only when `app` is non-null; cuối cùng `fs.rmSync(TMP_UI,
  {recursive:true,force:true})`. Server log assertion đọc `LOGGER_ENTRIES`,
  không regex stdout child.

- [ ] **Step 2: Chạy baseline harness**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  ! rg -n 'spawn\(|8300|8399|function nghi|\$\$?eval|SIGKILL|DatabaseSync|taoSchedulerUiDongBo' \
    tools/test-mp-ui.mjs
  ! rg -ni 'UPDATE[[:space:]]+chien|DELETE[[:space:]]+FROM[[:space:]]+chien' \
    tools/test-mp-ui.mjs
  rg -n '\bBASE_URL\b|new URL\((response\.url\(\)|import\.meta\.url)\)' \
    tools/test-mp-ui.mjs
  ~~~

  Expected: baseline behavior PASS qua in-process app, canonical cutover và
  real ready writer qua đúng schedulerFactory seam. Nếu Playwright
  package/browser thiếu, ghi BLOCKED theo prerequisite, không đổi loader.

- [ ] **Step 3: Viết RED cho route, visible main, form và auth tabs**

  Thêm helper kiểm phần tử thật sự visible (computed style + bounding box), rồi
  kiểm cả bốn server route và file route:

  ~~~js
  async function routeIdentity(page, expectedMode) {
    return await page.locator("body").evaluate(function (_, mode) {
      function visible(element) {
        if (!element) return false;
        var style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" &&
          !element.hidden && element.getClientRects().length > 0;
      }
      var visibleMains = Array.from(document.querySelectorAll("main"))
        .filter(visible);
      var actualMode = window.APP && APP.mp ? "multiplayer" : "solo";
      return {
        mode: actualMode,
        matchesMode: actualMode === mode,
        visibleMains: visibleMains.map(function (main) { return main.id; }),
        auth: visible(document.getElementById("form-dn")),
        soloStart: visible(document.getElementById("kd-batdau")),
        game: visible(document.getElementById("game")),
        title: document.title,
        startupText: (document.getElementById("man-khoidong") || {}).textContent || ""
      };
    }, expectedMode);
  }
  ~~~

  Assertions chính xác:

  - `/` và `/index.html`: mode multiplayer, visible main chỉ
    `man-khoidong`, login visible, `#kd-batdau` không tồn tại, copy có “máy chủ”.
  - `/solo` và `/motnguoi`: mode solo, visible main chỉ `man-khoidong`,
    `#kd-batdau` visible, auth controls không tồn tại, copy có “một người”.
  - root `file://index.html`: cùng solo identity, không HTTP request.
  - Sau vào game: startup hidden, visible main chỉ `noidung`, mode không đổi,
    opposite controls vẫn hidden/absent.

  Test tab bằng keyboard thật: từ `#tab-dn`, `ArrowRight` chọn đăng ký;
  `ArrowLeft` quay login; `End` chọn tab cuối; `Home` tab đầu. Chỉ tab selected
  có `tabindex="0"`; panel selected không hidden; panel kia hidden; label/form
  vẫn đúng. Test không gọi `.focus()`; dùng `Tab` từ body tới tab đầu.

  Thêm deferred-route RED riêng cho cả `/api/dangky` và `/api/dangnhap`, mỗi
  endpoint chạy một failure 503 rồi một real success. Arm route và successful
  `/api/state` response trước keyboard submit. Trong lúc promise bị giữ, assert
  owning form `aria-busy=true`, `data-submitting=true`, submit native-disabled,
  visible status “Đang xử lý…” và Enter lần hai vẫn chỉ có một request. Release
  failure: form/draft/error còn visible, busy false và button enabled. Release
  real success: game/state visible, hidden form's button cũng enabled, busy false
  và `layAccountIdTuState` trả numeric ID đúng display name. Mỗi route được
  unroute trong `finally`; không dùng timeout để quan sát pending state.

  Run: `node tools/test-mp-ui.mjs`.

  Expected RED: startup chưa là `main`, auth labels chưa liên kết, tabs chưa có
  `aria-selected/hidden/roving tabindex`, route shell chưa phân biệt semantic,
  và auth chưa có busy/disabled/single-flight lifecycle.

- [ ] **Step 4: GREEN semantic shells và dynamic tabs**

  Trong cả hai HTML:

  - Đổi `#man-khoidong` thành `<main>`; giữ `#game` là sibling và
    `#noidung` là main của game.
  - Startup content có heading `h1`; solo dùng `<form id="form-solo">`, MP
    dùng hai `<form>` có `aria-labelledby`.
  - Mọi label có `for`; mọi button có `type`; help text có ID và
    `aria-describedby`; `#kd-loi` là `role="alert"`.
  - Game shell có `header`, named `nav`, `main#noidung tabindex="-1"`, footer,
    `#thanh-canh` named live region, modal `role="dialog" aria-modal="true"`
    và toast status region.
  - Tạo real button `#nut-tongquan`; giữ `data-act="man"` và
    `data-man="tongquan"`.
  - `#nut-menu` có `aria-controls="menu" aria-expanded="false"`.
  - Thêm mobile resource command `#nut-tainguyen` có
    `data-act="tai-nguyen-toggle"`, `aria-controls="tt-res"` và
    `aria-expanded="false"`; Task 2 sở hữu behavior.

  MP tab markup:

  ~~~html
  <div id="kd-tab" role="tablist" aria-label="Truy cập máy chủ">
    <button id="tab-dn" type="button" role="tab" aria-selected="true"
      aria-controls="form-dn" tabindex="0">Đăng nhập</button>
    <button id="tab-dk" type="button" role="tab" aria-selected="false"
      aria-controls="form-dk" tabindex="-1">Tạo tài khoản</button>
  </div>
  <form id="form-dn" role="tabpanel" aria-labelledby="tab-dn"></form>
  <form id="form-dk" role="tabpanel" aria-labelledby="tab-dk" hidden></form>
  ~~~

  Trong `web/js/mp.js`, local function `datTabKhoiDong(id, moveFocus)` là owner
  duy nhất của `hidden`, `aria-selected`, `tabIndex`; click và
  ArrowLeft/ArrowRight/Home/End gọi function đó. `dangXuatCuc` gọi
  `datTabKhoiDong("tab-dn", false)` thay vì chỉnh inline display. Form submit
  gọi logic đăng nhập/đăng ký cũ; không giữ Enter handler gọi `.click()`.

  Local `datDangGuiKhoiDong(form,button,label,pending)` owns startup submit
  presentation. Begin returns false when `data-submitting=true`; otherwise it
  sets `aria-busy/data-submitting`, native `disabled`, original-label metadata
  and one named `role=status` processing node. Both login/register promise
  chains use `request.finally(endPending).then(success,failure)`, so label,
  busy and button restore before success hides startup or failure maps error.
  It never changes `APP.lam` or a public arity.

  Trong `js/main.js`, `form-solo` submit gọi create/continue contract cũ;
  button Tiếp tục vẫn có ID. Task 4 thay native `confirm` bằng modal.

- [ ] **Step 5: Verify và commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run lint
  npm run check:syntax
  git diff --check
  ~~~

  Expected: route/body/auth/tab assertions PASS; existing selectors/actions
  và both-outcome auth submitting assertions PASS; existing selectors/actions
  vẫn PASS; không fixed wait/child server/eval shorthand.

  Commit:

  ~~~bash
  git add index.html web/index.html js/main.js web/js/mp.js tools/test-mp-ui.mjs
  git commit -m "test(ui): add in-process semantic entrypoint harness"
  ~~~

### Task 2: Orbital visual system, responsive shell và mobile resources

**Files:**

- Modify: `css/style.css:3-221`
- Modify: `index.html:33-62`
- Modify: `web/index.html:51-79`
- Modify: `js/ui.js:3-155,1447-1481`
- Modify: `js/app.js:34-43,258-310`
- Modify: `tools/test-mp-ui.mjs` after Task 1 route/shell assertions

**Interfaces:**

- Produces all semantic tokens in the UI spec plus `--font-display`,
  `--font-body`, `--font-data` and `data-visual-signature="orbital-command"`.
- Produces private `U._datTaiNguyenNoiBo(open)`; no new public U/APP function.
- Acceptance sizes are exact: 320×844 and 390×844 mobile, 768×1024 boundary,
  1024×768 tablet, 1400×900 and 1440×900 desktop. Zoom uses real
  `visualViewport` at 200%.
- PNG remains docs-only; no runtime/build reference.

- [ ] **Step 1: Viết RED structural/computed visual tests**

  Thêm `docVisual(page)` đọc computed styles, không so screenshot pixel:

  ~~~js
  async function docVisual(page) {
    return await page.locator("#game").evaluate(function (game) {
      var root = getComputedStyle(document.documentElement);
      var mark = document.querySelector(".orbital-mark");
      var markBefore = mark ? getComputedStyle(mark, "::before") : null;
      var sweep = document.querySelector(".orbital-sweep");
      var body = getComputedStyle(document.body);
      var display = document.querySelector(".command-brand");
      var panel = document.querySelector(".panel");
      var active = document.querySelector("#menu [aria-current='page']");
      var primary = document.querySelector(".nut.oke,[data-variant='primary']");
      return {
        signature: game.getAttribute("data-visual-signature"),
        tokens: {
          bgSpace: root.getPropertyValue("--bg-space").trim(),
          bgCommand: root.getPropertyValue("--bg-command").trim(),
          surface1: root.getPropertyValue("--surface-1").trim(),
          surface2: root.getPropertyValue("--surface-2").trim(),
          cyan: root.getPropertyValue("--signal-cyan").trim(),
          amber: root.getPropertyValue("--signal-amber").trim(),
          danger: root.getPropertyValue("--state-danger").trim(),
          warning: root.getPropertyValue("--state-warning").trim(),
          success: root.getPropertyValue("--state-success").trim()
        },
        bodyFont: body.fontFamily,
        displayFont: display ? getComputedStyle(display).fontFamily : "",
        dataFont: root.getPropertyValue("--font-data").trim(),
        grid: body.backgroundImage,
        rings: markBefore ? markBefore.backgroundImage : "",
        sweep: sweep ? getComputedStyle(sweep).backgroundImage : "",
        round: mark ? getComputedStyle(mark).borderRadius : "",
        panelSurface: panel ? getComputedStyle(panel).backgroundColor : "",
        panelBorder: panel ? getComputedStyle(panel).borderTopColor : "",
        panelDepth: panel ? getComputedStyle(panel).boxShadow : "",
        activeBorder: active ? getComputedStyle(active).borderLeftColor : "",
        activeSurface: active ? getComputedStyle(active).backgroundColor : "",
        primarySurface: primary ? getComputedStyle(primary).backgroundColor : ""
      };
    });
  }
  ~~~

  Assert exact token hex values, signature, different display/body fonts,
  monospace data stack, grid has `linear-gradient`, rings have
  `repeating-radial-gradient`, sweep has `conic-gradient`, mark is circular,
  panel uses declared metal surface with restrained nonzero depth, active item
  has distinct cyan rail/surface and primary command resolves to amber.
  Assert reference PNG absent:

  ~~~bash
  ! rg -n 'thdc-orbital-command-reference\.png' \
    index.html web/index.html css js web/js tools dist
  ~~~

  Run `node tools/test-mp-ui.mjs`. Expected RED: semantic tokens, signature,
  rings and type roles do not exist.

- [ ] **Step 2: Viết RED responsive/resource/focus/zoom tests**

  Helper `kiemKhung` chạy đúng thứ tự 320×844, 390×844, 768×1024,
  1024×768, 1400×900, 1440×900; sau mỗi case khôi phục viewport kế tiếp,
  không để drawer/resource state rò:

  ~~~js
  async function kiemKhung(page, width, height) {
    await page.setViewportSize({width: width, height: height});
    return await page.locator("html").evaluate(function (html) {
      var visibleControls = Array.from(document.querySelectorAll(
        "button:not([hidden]),a[href],input:not([type=hidden]),select," +
        "textarea,[data-act]"
      )).filter(function (item) {
        var style = getComputedStyle(item);
        return style.display !== "none" && style.visibility !== "hidden" &&
          item.getClientRects().length > 0;
      });
      return {
        pageOverflow: html.scrollWidth > html.clientWidth,
        touchTargets: visibleControls.map(function (item) {
          var rect = item.getBoundingClientRect();
          return {key: item.id || item.getAttribute("data-act"),
            width: rect.width, height: rect.height};
        }),
        resourceHidden: document.getElementById("tt-res").hidden,
        resourceExpanded: document.getElementById("nut-tainguyen")
          .getAttribute("aria-expanded")
      };
    });
  }
  ~~~

  At both 320×844 and 390×844, press Tab until `#nut-tainguyen`, Enter to open,
  assert its `aria-expanded=true`, `#tt-res.hidden=false`, all six resources +
  Điện + Bảo trì visible in a wrapping grid and
  `#tt-res.scrollWidth <= clientWidth`. Press Enter again to close. No resource
  carousel/horizontal scroll.

  At 768/1024, drawer button visible; at both 1400/1440, nav visible and drawer
  button hidden. Run the target/overflow audit on MP startup, solo startup and
  game. Every visible interactive target is at least 44×44 CSS px; no
  actionable inline table link is excluded.

  Zoom helper uses CDP `Emulation.setPageScaleFactor({pageScaleFactor:2})`.
  Bounds must include `visualViewport.offsetLeft/offsetTop`, not assume zero:

  ~~~js
  function visualEvidence(element) {
    var rect = element.getBoundingClientRect();
    var viewport = window.visualViewport;
    var left = viewport.offsetLeft;
    var top = viewport.offsetTop;
    return {
      scale: viewport.scale,
      bounds: [left, top, left + viewport.width, top + viewport.height],
      rect: [rect.left, rect.top, rect.right, rect.bottom],
      inside: rect.left >= left && rect.top >= top &&
        rect.right <= left + viewport.width &&
        rect.bottom <= top + viewport.height
    };
  }
  ~~~

  Scroll each of command, drawer item and primary action into view, use
  `click({trial:true})`, assert `scale>=1.99`, `inside=true`, then always reset
  page scale to 1 and viewport to 1440×900 in `finally`.

  Reduced motion assertion requires computed animation/transition duration at
  most `0.01s`; focus is reached by Tab/Shift+Tab, has `:focus-visible` and
  outline at least 3px. Contrast tests compute WCAG ratio for declared
  token/surface pairs and require 4.5:1.

- [ ] **Step 3: Implement code-native orbital shell**

  Add `data-visual-signature="orbital-command"` to both `#game`. Inside
  `#nut-tongquan`, add decorative markup with `aria-hidden="true"`:

  ~~~html
  <span class="orbital-mark" aria-hidden="true">
    <span class="orbital-core"></span>
    <span class="orbital-sweep"></span>
  </span>
  <span class="command-brand">THIÊN HÀ ĐẠI CHIẾN</span>
  ~~~

  Rewrite CSS around exact tokens from Visual direction. Required structural
  styles:

  - body grid uses two 1px `linear-gradient` layers and restrained radial
    atmosphere; never a runtime bitmap address.
  - `.orbital-mark` is circular; pseudo-elements use
    `repeating-radial-gradient` and crosshair lines; `.orbital-sweep` uses
    `conic-gradient`; core is amber.
  - Command bar is grid, surfaces use one subtle highlight and metal border;
    panel titles use display font, body uses body font, `.sz` uses data font.
  - Active nav gets cyan rail and `aria-current`; primary action gets amber;
    danger/warning/success get text/icon/class, not color alone.
  - `:focus-visible` uses 3px cyan + offset; disabled has visible reason text
    supplied by later renderer tasks.
  - Table overflow is local named region; page gets no `overflow-x:hidden`
    band-aid.

  CSS has exactly these media partitions, with no old 860px query:

  ~~~css
  @media (min-width: 1200px) { /* fixed reading nav, one-line command */ }
  @media (min-width: 768px) and (max-width: 1199px) { /* tablet drawer */ }
  @media (max-width: 767px) { /* one column, explicit resource disclosure */ }
  @media (prefers-reduced-motion: reduce) { /* stationary radar/sweep */ }
  ~~~

  At mobile, `#tt-res` is a wrapping grid beneath command only when disclosure
  is open; it never uses permanent horizontal scroll.

- [ ] **Step 4: Implement resource disclosure without public surface growth**

  Initialize `U.ui` only when absent, then add `resourcesOpen:false` only when
  that own property is absent; never replace an existing object. Define only
  private `U._datTaiNguyenNoiBo(open)`; it detects `(max-width:767px)`, sets
  `#tt-res.hidden`, `#nut-tainguyen aria-expanded`, body class and label. Add
  ACT `tai-nguyen-toggle`. On resize call private sync; desktop/tablet always
  expose resources. `U.ve` calls private sync after resource render; `U.live`
  only changes `[data-live]` and never toggles disclosure/focus.

- [ ] **Step 5: GREEN, responsive reset và commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run lint
  npm run check:syntax
  ! rg -n 'max-width:\s*860px|overflow-x:\s*hidden' css/style.css
  ! rg -n 'thdc-orbital-command-reference\.png' \
    index.html web/index.html css js web/js tools dist
  git diff --check
  ~~~

  Expected: visual structure/computed styles, exact
  320/390/768/1024/1400/1440 cases, 200% zoom, reduced motion, contrast, touch
  targets and explicit mobile resource toggle PASS. Viewport ends at 1440×900,
  page scale 1, drawer/resource closed.

  Commit:

  ~~~bash
  git add css/style.css index.html web/index.html js/ui.js js/app.js \
    tools/test-mp-ui.mjs
  git commit -m "feat(ui): establish orbital command visual system"
  ~~~

### Task 3: Command bar, exact navigation/alerts và preservation qua mọi `U.ve`

**Files:**

- Modify: `js/ui.js:3-205,725-1069,1426-1481`
- Modify: `js/app.js:34-43,99-198,258-310`
- Modify: `web/js/mp.js:98-145,388-402`
- Modify: `css/style.css` command/nav/alert/focus selectors from Task 2
- Modify: `tools/test-mp-ui.mjs` after command-shell tests

**Interfaces:**

- Produces public contracts with exact arity:
  `U.chupTrang()`, `U.phucHoiTrang(snapshot)`, `U.tieuDeMan()`.
- Produces private `U._khoaFocusNoiBo(element)`; state stays inside `U.ui`.
- `U.MAN` order/group is deterministic and each group renders once.
- `U.veCanh` renders exact priority danger → warning → success with an
  actionable control whenever a destination/action exists.
- Every `U.ve` snapshots/restores same-screen field/focus and any explicitly
  declared `[data-ui-scroll]`; `U.live` never steals focus. Task 3 creates and
  proves the first real target, `fleet-active`; Task 6 preserves that key.

#### Exact navigation contract

Solo arrays by group:

| Group | Exact `data-man` order |
| --- | --- |
| Đế quốc | `tongquan,tainguyen,congtrinh,nghiencuu,xuong,phongthu` |
| Hạm đội | `hamdoi,thienha,mophong` |
| Cộng đồng | `lienminh,xephang,tinnhan` |
| Hệ thống | `huongdan,nhatky` |

Multiplayer arrays by group:

| Group | Exact `data-man` order |
| --- | --- |
| Đế quốc | `tongquan,tainguyen,congtrinh,nghiencuu,xuong,phongthu` |
| Hạm đội | `hamdoi,thienha,mophong` |
| Cộng đồng | `lienminh,xephang,tinnhan,bangtin,chat` |
| Hệ thống | `huongdan,taikhoan` |

`U.MAN` có đúng 14/16 entry, mỗi entry có `nhom`; MP gán exact array một lần
khi adapter load, không `push`, không nối lại sau `ACT.man`, poll hay `U.ve`.

#### Exact incoming-alert family contract

- `npc-incoming`, each `ST.toi`: level `danger`; visible “BÁO ĐỘNG NPC” plus
  attacker/target/countdown; “Bố trí phòng thủ” goes to `phongthu` + target pi.
- `pvp-attack`, `pvpToi.nv=attack`: level `danger`; visible “BÁO ĐỘNG ĐỎ” plus
  commander/origin/target/countdown; “Điều hạm đội” goes to `hamdoi` + target pi.
- `allied-hold`, `pvpToi.nv=hold`: level `success`; visible “ĐỒNG MINH GIỮ QUỸ
  ĐẠO” plus commander/target/countdown; “Theo dõi quỹ đạo” goes to `hamdoi` + pi.
- `delivery`, every other `pvpToi.nv`: level `success`; visible “TIẾP VẬN ĐANG
  ĐẾN” plus commander/target/countdown; “Mở kho đích” goes to `tainguyen` + pi.

Maintenance debt, research retry and food shortfall remain `warning`. Exact
family order is NPC → PvP attack, maintenance → research → food, allied hold →
delivery; the global order remains all danger → all warning → all success.

- [ ] **Step 1: Viết RED command/nav/alert tests**

  Sau p1/pSolo vào game, assert command text chứa đúng:
  `Kim Loại, Thạch Anh, Nhiên Liệu, Thực Phẩm, Galana, Kỹ Thuật, Điện,
  Bảo trì sau`.

  Helper đọc group và item order:

  ~~~js
  async function docMenu(page) {
    return await page.locator("#menu [data-menu-group]").evaluateAll(function (groups) {
      return groups.map(function (group) {
        return {
          name: group.getAttribute("data-menu-group"),
          items: Array.from(group.querySelectorAll("[data-man]")).map(function (item) {
            return item.getAttribute("data-man");
          })
        };
      });
    });
  }
  ~~~

  So exact deep equality với hai tables trên. Gọi `U.ve()` ba lần, đổi màn hai
lần rồi quay lại, assert vẫn đúng bốn group, mỗi group đúng một lần, item không
duplicate, và đúng một `aria-current="page"`.

  Tạo fixture có cả bốn incoming families trong table cùng maintenance debt,
  research retry và food shortfall trong `try/finally`. Gọi `U.veCanh()`, đọc
  `data-alert-family/data-alert-level`, visible text và control label; assert
  exact family/level order, required text fields and all danger → warning →
  success. Keyboard-activate từng family action; assert exact `U.man`, `U.pi`,
  selected planet and heading. Warning controls lần lượt đi `tainguyen`,
  `nghiencuu`, `tainguyen`. Restore state, `U.pi`, screen and render after each
  case and once more in outer `finally`.

  Run `node tools/test-mp-ui.mjs`. Expected RED: menu chưa group, dùng anchor
  không href, alert chưa priority/action/semantic level.

- [ ] **Step 2: Viết RED preservation tests cho id-less/dynamic controls**

  Bốn case đều đi qua `U.ve`, không gọi thẳng restore:

  1. Màn Hạm Đội: nhập draft `ft-cargoS`, click
     `[data-act="max-hang"]`; handler render lại. Assert active element mới vẫn
     là `max-hang` và draft được giữ. Button này không có ID.
  2. Click `[data-act="max-tau"][data-id="cargoS"]` và
     `[data-act="max-linh"][data-id]`; assert focus restored theo semantic key,
     không theo ID.
  3. Màn Xếp Hạng: activate filter `data-loai`, response/render xong assert
     focus ở đúng filter và `aria-pressed=true`.
  4. Focus một dynamic queue action, remove đúng row trong test fixture rồi gọi
     `U.ve` after setting `U.ui.removedFocusKey` to the captured opener key;
     vì semantic target biến mất, focus fallback tới `main#noidung`, không
     body, không một row khác có index giống nhau.
  5. Qua `await suaStateUI(accountId1, ...)`, add one non-due active fleet and
     retain its returned `beforeState`; restore that state through an awaited
     `accountId1` writer command in `finally`. At 320px, first assert
     `[data-ui-scroll="fleet-active"]` exists; this is the initial RED because
     current markup has only `.bang-cuon`. Set a bounded nonzero `scrollLeft`,
     call `U.ve()`, then assert exact clamped value survives.

  Đồng thời điền `#thue-pct`, focus bằng click, gọi `U.ve`, assert draft,
  selection và focus được giữ trên cùng màn. Đổi sang màn khác có ID trùng,
  assert snapshot cũ không áp vào màn mới. Gọi `U.live`, assert active element
  và draft/`fleet-active` scroll không đổi. The test never injects a synthetic
  scroll node; it fails before Task 3 implementation on the real fleet wrapper.

  Run `node tools/test-mp-ui.mjs`. Expected RED: current `U.ve` thay toàn bộ
  `innerHTML` và mất focus/draft/scroll.

- [ ] **Step 3: Implement deterministic menu và alert model**

  Khởi tạo `U.ui` một lần, không replace object:

  ~~~js
  U.ui = U.ui || {};
  var uiDefaults = {
    dialogOpener: null,
    dialogOpenerKey: null,
    drawerOpen: false,
    drawerCloseTarget: "opener",
    resourcesOpen: false,
    renderedMan: "",
    dialogDestructive: false
  };
  Object.keys(uiDefaults).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(U.ui, key)) {
      U.ui[key] = uiDefaults[key];
    }
  });
  ~~~

  `U.veMenu` group theo exact group order, render một `<section
  data-menu-group>` + heading + button list cho mỗi group. Items là
  `<button type="button" data-act="man" data-man>` và active item có
  `aria-current="page"`. Badge dùng `aria-label` bổ sung, không chỉ màu.

  `U.veCanh` partition exact families above, build three arrays, then
  concatenate danger/warning/success. Markup mỗi item có
  `data-alert-family`, `data-alert-level`, visible severity text/icon và action
  button. `APP.ACT["canh-man"]` validates optional `data-pi`, selects that
  planet, clears `U.form`, sets the declared `data-man`, renders and focuses
  `main#noidung`; it never mutates gameplay. Không đổi dữ liệu/luật.

- [ ] **Step 4: Implement stable snapshot keys và fallback**

  `U._khoaFocusNoiBo(element)` ưu tiên theo thứ tự:

  1. `data-ui-focus-key` explicit;
  2. `id` với prefix `id:`;
  3. `data-act` + stable identity attrs (`data-id`, `data-fid`, `data-key`,
     `data-loai`, `data-man`, `data-ten`, `data-tk`, `data-res`), không dùng
     `data-i` một mình nếu row có semantic entity;
  4. `name/type` cho static form control.

  Renderer gắn explicit keys:

  - `fleet:max-tau:<unit>`, `fleet:max-linh:<unit>`, `fleet:max-hang`;
  - `rank:filter:<loai>`;
  - `build:cancel:<building>:<same-kind-ordinal>`,
    `ship:cancel:<unit>:<same-kind-ordinal>`,
    `research:cancel:<research>:<startedAt>`;
  - `galaxy:<coordinate>:<action>`, `message:<message-id>:toggle`,
    `alliance:<account-id>:<action>`.

  Snapshot shape:

  ~~~js
  {
    man: "hamdoi",
    activeKey: "fleet:max-hang",
    fields: {"id:f-g": {value: "1", checked: false, selectedIndex: -1}},
    scroll: {"fleet-active": {left: 120, top: 0}}
  }
  ~~~

  `U.chupTrang()` chỉ đọc `#noidung`; `U.phucHoiTrang(snapshot)` return ngay
  nếu `snapshot.man !== U.man`. Scroll map chỉ đọc elements có explicit stable
  `data-ui-scroll`, never class/ordinal inference. In Task 3, add
  `data-ui-scroll="fleet-active"` to the existing active-fleet `.bang-cuon`
  before snapshot GREEN; Task 6 later replaces it with
  `U.bang("fleet-active",...)` without changing the key. Restore fields, clamp
  declared scroll theo max hiện tại, rồi
  focus stable key nếu còn enabled/visible. Nếu activeKey từng nằm trong
  main nhưng target biến mất, focus `#noidung`; nếu không có activeKey thì không
  đánh cắp focus. `U.ve` snapshot trước replacement, render h1 + screen,
  `U.chuanHoaNoiDung` chỉ khi đã tồn tại ở Task 4, restore, rồi cập nhật
  `renderedMan`. `U.live` không gọi focus/restore.

  Queue rows hiện không có persisted ID và plan không đổi save schema. Khi
  Task 4 confirm cancel, handler copies the initiating
  `U.ui.dialogOpenerKey` into `U.ui.removedFocusKey` before mutation; it never
  stores the modal confirm button key. Restore forces that key to main even if
  a later identical row shifts into the same ordinal, then clears the marker.
  Poll/rerender không xoá row vẫn dùng semantic kind + ordinal ổn định.

  Giữ exact public arities 0/1/0 và không thêm public helper khác.

- [ ] **Step 5: GREEN và commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run lint
  npm run check:syntax
  git diff --check
  ~~~

  Expected: exact nav order/no duplicates, four-family alert inventory,
  `fleet-active` RED/GREEN scroll and all focus-key/draft/deletion-fallback/
  U.live assertions PASS.

  Commit:

  ~~~bash
  git add js/ui.js js/app.js web/js/mp.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): preserve state across orbital command renders"
  ~~~

### Task 4: Drawer, dialogs, validation và global accessibility contract

**Files:**

- Modify: `js/ui.js:20-32,1426-1481`
- Modify: `js/app.js:34-73,159-255,258-310` (`ACT.man`, `huyxay`, `huync`,
  `huydong`, `goive`, `ban-ten-lua` and delegation/keyboard symbols)
- Modify: `js/main.js:79-191`
- Modify: `web/js/mp.js:418-564,589-648`
- Modify: `index.html:13-62`
- Modify: `web/index.html:13-79`
- Modify: `css/style.css` form/error/drawer/modal/toast selectors
- Modify: `tools/test-mp-ui.mjs` after Task 3 preservation tests

**Interfaces:**

- Produces exact public functions/arities:
  `U.datDrawer(open)`, `U.chuyenDrawer()`, `U.giuTabTrongHop(event)`,
  `U.hop(title,html,options)`, `U.dongHop()`,
  `U.nhanTruong(id,label,controlHtml,helpHtml)`,
  `U.bang(id,caption,headHtml,bodyHtml,className)`,
  `U.chuanHoaNoiDung(root)`.
- Produces private helpers `_baoLoiFormNoiBo`, `_xoaLoiFormNoiBo`,
  `_laNhapLieuNoiBo`, `_dongDrawerNoiBo` and `_datDangGuiNoiBo`; modular public
  surface không tăng.
- Drawer: aria/inert/focus/scroll lock. Dialog: labelled/modal/focus trap/origin.
- Shared error: summary + inline + `aria-invalid` + `aria-describedby` + focus
  first invalid.

#### Consequential action inventory

Không action dưới đây được mutate state/API trước confirm. Mỗi dialog nêu object
và hậu quả, initial focus ở cancel/close, destructive confirm không là default:

| Trigger | Confirm action | Hậu quả |
| --- | --- | --- |
| `huyxay` | `huyxay-ok` | Huỷ row xây/refund. |
| `huydong` | `huydong-ok` | Huỷ row xưởng/refund. |
| `huync` | `huync-ok` | Huỷ nghiên cứu/refund. |
| `goive` | `goive-ok` | Gọi hạm đội đang bay/quỹ đạo về. |
| `doihuong` | existing `doihuong-ok` | Đổi đích bay và trả phí. |
| `ban-ten-lua` | `ban-ten-lua-ok` | Phóng và tiêu hao tên lửa. |
| `xoa-tin` | `xoa-tin-ok` | Xoá toàn bộ tin. |
| `lm-ra` | `lm-ra-ok` | Rời liên minh. |
| `lm-tu-choi` | `lm-tu-choi-ok` | Từ chối đơn cụ thể. |
| `lm-duoi` | existing `lm-duoi-ok` | Loại thành viên cụ thể. |
| `lm-chuyen` | existing `lm-chuyen-ok` | Chuyển toàn bộ quyền chủ. |
| `tuyen-chien` | existing `tuyen-chien-ok` | Tuyên chiến, chờ 24 giờ. |
| `chuyen-galana` | existing `chuyen-galana-ok` | Chuyển tiền cho đồng minh. |
| `bo-hoang` | existing `bo-hoang-ok` | Mất thuộc địa. |
| `xoa-game` | existing `xoa-that` | Xoá mọi save local. |
| create new over old save | `tao-moi-xac-nhan` | Ghi đè bàn hiện tại. |
| `nhap` | existing `nhap-ok` in dialog | Ghi đè state bằng save nhập. |
| `xoa-tk` | existing `xoa-tk-ok` | Xoá vĩnh viễn tài khoản. |
| `mp-xoa` | `mp-xoa-ok` | Xoá toàn bộ draft simulator. |

War declaration và clear-all messages bắt buộc nằm trong automated inventory
test, không chỉ review thủ công.

- [ ] **Step 1: Viết RED global native/validation audit**

  `loiA11yTrang(page)` scan mọi visible form/control cả ngoài `#noidung`:

  - đúng một visible main;
  - input/select/textarea có `label[for]` hoặc accessible name;
  - `aria-describedby` IDs tồn tại;
  - form có accessible name;
  - buttons có name;
  - at 320px, every visible interactive target is at least 44×44 CSS px and
    its form/dialog causes no page-level overflow;
  - visible tables có caption/label, `th` có scope;
  - dialog có role/modal/label; live regions đúng role.

  Chạy ở solo startup, MP login, MP register, solo game, MP game và trên từng
  dialog field inventory: `dh-*`, `bh-xn`, `ten-ht`, `xuat-js`, `nhap-js`,
  `file-nhap`, `galana-so`, `thu-den`, `thu-noi`, `mk-cu`, `mk-moi`, `xtk-mk`,
  `xtk-xn`.

  Với auth, submit rỗng bằng keyboard. Assert error summary visible, field đầu
  có focus, mọi invalid field `aria-invalid=true`, inline error ID nằm trong
  `aria-describedby`. Sửa field rồi submit, assert error tương ứng clear.

  Dùng một disposable MP account và deferred routes để RED submitting state
  cho cả `/api/doimk` và `/api/xoatk`. Mỗi endpoint chạy failure rồi real
  success qua keyboard-activated explicit confirm. While held, assert dialog
  form busy/submitting, trigger disabled + processing text, duplicate Enter
  produces one request. Failure keeps dialog/drafts/error and re-enables;
  retain trigger/form node handles so success asserts `disabled=false` and
  busy clear even after dialog detaches. Password success is verified by real
  logout/login. Delete success reaches named startup and the deleted account
  cannot login. Route/session/account cleanup is in `finally`; success is
  never fulfilled with fake JSON.

  Thêm cùng RED cho one real MP `APP.lam`: `doithue`. Hold `/api/lam`, press
  Enter twice on exact tax action, assert one request, owning panel busy,
  button disabled/processing. A 503 preserves input/state/error and re-enables;
  a continued real success re-enables, clears busy and changes tax by the exact
  authoritative delta. Restore original tax through a real command in
  `finally`. This test spies `APP.lam.length===3` and `APP.gui.length===3`.

  Run `node tools/test-mp-ui.mjs`. Expected RED: labels dialog/auth, shared
  inline/summary and deferred account/`doithue` submitting contracts chưa có.

- [ ] **Step 2: Viết RED drawer/dialog/consequence tests bằng keyboard thật**

  At 320px, từ body dùng Tab tới `#nut-menu`, Enter mở. Repeat the
  same drawer lifecycle at 768×1024 and 1024×768; reset viewport/drawer in
  `finally` after each case. Assert:

  - `aria-expanded=true`, nav visible, `body.menu-mo`;
  - `#noidung`, footer, command controls ngoài opener và alert rail inert;
  - Tab/Shift+Tab chỉ đi trong drawer/opener;
  - ArrowDown/ArrowUp/Home/End đi item nav; Enter chọn;
  - Escape đóng, clear inert/scroll lock và focus về opener.

  Trong một vòng thứ hai ở cả ba viewport, mở drawer, Arrow tới một item không
  active rồi Enter. Assert `ACT.man` đổi đúng screen, gọi
  `U.datDrawer(false)`, `aria-expanded=false`, nav `aria-hidden=true`, `.mo-ra`
  và `body.menu-mo` mất, mọi background `inert=false`, scroll lock mất và focus
  ở `main#noidung` của screen mới. Selection không trả focus về menu opener.

  Tạo keyboard-only dispatcher fixtures cho `input`, `textarea`, `select` và
  temporary `[contenteditable=true]`. Tab tới từng control; press
  ArrowUp/ArrowDown/Home/End/Enter. Assert native value/selection behavior được
  phép nhưng `U.man`, drawer index and APP/network counters không đổi. Trong
  non-destructive dialog, Escape từ input/textarea/select vẫn đóng và restore
  opener; trong destructive dialog, cùng Escape giữ dialog mở và counter 0.

  Dialog đổi tên: keyboard activate opener; initial focus vào `#ten-ht`; Tab và
  Shift+Tab wrap; Escape đóng non-destructive và trả focus đúng stable opener
  sau một `U.ve`.

  Loop consequential inventory dùng spy quanh `APP.lam` và network route
  counters. Activate trigger, assert dialog visible and counter vẫn 0; Escape
  destructive không execute; activate explicit confirm thì counter đúng 1.
  For queue cancellation, assert the removed opener cannot shift to an
  identical ordinal and focus lands on `main#noidung`. Fixture được restore
  sau mỗi case. Riêng war và `xoa-tin` bắt buộc chạy qua real MP/APP route
  response; không mock success bằng gọi handler trực tiếp.

  Run `node tools/test-mp-ui.mjs`. Expected RED: drawer chưa inert/keyboard,
  modal chưa trap/origin/options, clear messages/cancels còn immediate.

- [ ] **Step 3: Implement public component helpers và validation**

  `U.nhanTruong` tạo label, help và reserved inline error:

  ~~~html
  <div class="field" data-field="FIELD_ID">
    <label for="FIELD_ID">LABEL</label>
    <!-- original control, same id/name/data-* -->
    <span id="FIELD_ID-help" class="field-help">HELP</span>
    <span id="FIELD_ID-error" class="field-error" aria-live="polite"></span>
  </div>
  ~~~

  Control `aria-describedby` chứa các ID tồn tại, không duplicate. `U.bang`
  luôn tạo named focusable scroll region + `table/caption/thead/tbody`.
  `U.chuanHoaNoiDung` bổ sung scope thiếu an toàn nhưng không biến layout div
  thành table giả.

  `_baoLoiFormNoiBo(form, errors)` nhận object `{fieldId:message}`; clear lỗi cũ,
  set inline text + invalid/describedby, build summary `role="alert"
  tabindex="-1"` với links, rồi focus control invalid đầu. `_xoaLoiFormNoiBo`
  clear field khi input hợp lệ. Startup static forms có summary/inline nodes
  tương đương.

  Auth/solo startup/dialog action validate presentation trước API/APP; server
  vẫn quyết định authoritative outcome. Error server map vào summary hoặc field
  khi biết field, không chỉ toast.

  `U._datDangGuiNoiBo(region,trigger,label,pending)` giữ arity 4. Begin returns
  false nếu region đã `data-submitting=true`; nếu không, set
  `aria-busy/data-submitting`, native disabled, original label and one named
  `role=status` node. End restores label, removes pending state and enables in
  both success/failure. Account password/delete chains use
  `request.finally(endPending).then(success,failure)`, before close/logout or
  error mapping. `ACT.doithue(el)` calls
  `APP.lam` directly with the old three arguments and wraps only its callback;
  it does not change `lam`, `APP.lam` or `APP.gui` arity/payload.

- [ ] **Step 4: Implement drawer/modal và inventory**

  `U.datDrawer` đồng bộ `U.ui.drawerOpen`, `.mo-ra`, body class,
  `aria-expanded/aria-hidden`, inert background and focus. Desktop luôn nav
  visible/non-inert. `U.chuyenDrawer` delegate. `U.ui.drawerCloseTarget` mặc
  định `"opener"`; `ACT.man` đặt `"content"`, gọi `U.datDrawer(false)`, render,
  rồi focus `main#noidung`. Private `_dongDrawerNoiBo` luôn clear inert/scroll
  lock/ARIA trước khi chọn opener hoặc content target và reset close target.

  Một keydown listener duy nhất xử lý drawer/dialog, không listener mới mỗi
  render. `_laNhapLieuNoiBo(target)` true cho
  `input,textarea,select,[contenteditable]`. Dispatcher order bắt buộc:

  1. Khi dialog mở, `Escape` và `Tab` đi qua dialog contract kể cả target đang
     editable; destructive Escape prevent default nhưng không đóng/execute.
  2. Khi drawer mở, `Escape` luôn đóng về opener. Sau đó editable target return
     ngay, không chạy Arrow/Home/End/Enter shortcut.
  3. Chỉ non-editable target mới đi qua drawer Arrow/Home/End/Enter dispatcher.

  Task 1 tablist keydown vẫn scoped vào `#kd-tab`; dispatcher toàn cục không
  nuốt native key của form hoặc tablist.

  `U.hop(td,html,opt)` giữ arity 3, snapshot semantic opener key vào
  `U.ui.dialogOpenerKey` plus live element vào `U.ui.dialogOpener`,
  set `dialogDestructive`, render title/content, focus `opt.initialFocus` hoặc
  first field/safe close. `U.giuTabTrongHop` trap enabled visible controls.
  `U.dongHop` clear content/state và restore live original element hoặc stable
  key mới; fallback main. Destructive Escape chỉ giữ dialog mở, không execute.

  Chuyển exact inventory table thành modal-confirm handlers. Thay native
  `confirm` ở solo create-over-save. Không đổi final APP/API action names hoặc
  payload; confirm handler gọi body cũ đúng một lần. `U.toast` đặt `role=alert`
  cho blocking error, `role=status` cho success/info.

- [ ] **Step 5: GREEN và commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run lint
  npm run check:syntax
  ! rg -n '\bconfirm\s*\(' js/main.js js/app.js web/js/mp.js
  git diff --check
  ~~~

  Expected: global startup/game/dialog audit, auth errors, drawer selection
  cleanup/content focus, editable-key guard, intended dialog Escape, focus
  trap/origin restore, account/`doithue` submit lifecycles và every
  consequential inventory case PASS.

  Commit:

  ~~~bash
  git add index.html web/index.html css/style.css js/ui.js js/app.js \
    js/main.js web/js/mp.js tools/test-mp-ui.mjs
  git commit -m "feat(ui): add accessible dialogs validation and navigation"
  ~~~

### Task 5: Economy/Construction renderers — đủ cả sáu màn

**Files:**

- Modify: `js/ui.js:210-624`
- Modify: `js/app.js:44-73,269-293`
- Modify: `css/style.css` panel/field/table/queue/card selectors
- Modify: `tools/test-mp-ui.mjs` economy/construction section

**Screens owned:** `tongquan`, `tainguyen`, `congtrinh`, `nghiencuu`, `xuong`,
`phongthu`. Không màn nào được bỏ khỏi RED/GREEN loop.

**Interfaces:**

- Consumes Task 4 `U.nhanTruong/U.bang/U.chuanHoaNoiDung` và shared errors.
- Preserves all IDs: `thue-pct`, `cho-*`, `ct-sl-*`, `sl-*`, `tl-*`; all
  `data-act`/payload and queue semantics.
- Produces native headings/forms/tables, stable focus keys, disabled reasons và
  orbital overview structure.

- [ ] **Step 1: Viết RED audit cho từng màn**

  Loop exact six screens. Với mỗi screen assert:

  - `h1#man-tieu-de` và at least one named section/panel heading;
  - every visible field labelled/described;
  - every table has caption, `thead/tbody`, col/row scopes;
  - every `.bang-cuon` focusable/named;
  - every disabled action has `aria-describedby` to visible reason;
  - every visible interactive target is at least 44×44 at 320;
  - no duplicate ID; no page overflow at 320 and 1400.

  Additional exact checks:

  - Tổng Quan: tax field/error, four queue tables, orbital overview marker.
  - Tài Nguyên: production/market tables and all four market fields.
  - Công Trình: every `ct-sl-*`, cost/time IDs and build buttons.
  - Nghiên Cứu: tech table/queue/disabled prerequisite reasons.
  - Xưởng: every ship/infantry/defense queue quantity field it renders.
  - Phòng Thủ: defense/missile tables and `tl-g/h/p/n` labels.

  Trigger invalid tax, market, building quantity, shipyard quantity and missile
  coordinates; assert shared error contract and that APP spy saw no action.

  Run `node tools/test-mp-ui.mjs`. Expected RED on every named screen, not just
  first three.

- [ ] **Step 2: Implement heading/panel/orbital overview**

  `U.ve` prepends one h1 for `U.tieuDeMan`; renderers never add a second h1.
  Each panel title gets a stable ID and panel `aria-labelledby`.

  Tổng Quan adds code-native `.orbital-overview` containing planet name,
  coordinates, core status and decorative `.orbital-field` with
  `aria-hidden=true`; CSS reuses Task 2 rings/grid. It does not pretend to be a
  bitmap planet, does not add gameplay data and does not link the reference
  PNG.

  Decision data (cost, prerequisites, completion, risk) stays beside action;
  reference prose comes later. Native tables remain tables, not card grids.

- [ ] **Step 3: Implement fields/tables for all six renderers**

  Use `U.nhanTruong` for every listed ID. Use `U.bang` with stable keys:
  `overview-build-queue`, `overview-ship-queue`, `overview-research`,
  `overview-fleets`, `resource-production`, `resource-market`,
  `building-catalog`, `research-catalog`, `shipyard-catalog`,
  `defense-catalog`, `missile-control`.

  Queue action focus keys use semantic identity from Task 3. Every header has
  `scope="col"`; meaningful row label is `th scope="row"`. Empty states remain
  inside the named section and give next action. Preserve all calculation/body
  logic; only markup/presentation/validation changes.

  In `js/app.js`, validate finite integer/range before `APP.lam`; send exact old
  payload on valid input. Disabled reasons are presentation only; server remains
  authoritative.

- [ ] **Step 4: GREEN all six screens and regression actions**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run test:luat
  npm run lint
  npm run check:syntax
  git diff --check
  ~~~

  Expected: six-screen audit PASS plus existing build quantity, tax, market,
  research, ship/defense/missile UI behavior. No test helper hides later screen
  failures after first GREEN.

- [ ] **Step 5: Commit**

  ~~~bash
  git add js/ui.js js/app.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): rebuild economy and construction command screens"
  ~~~

### Task 6: Fleet, Galaxy, Alliance và Ranking renderers

**Files:**

- Modify: `js/ui.js:625-1084`
- Modify: `js/app.js:74-191,220-223`
- Modify: `web/js/mp.js:296-386,388-507`
- Modify: `css/style.css` fleet/galaxy/community/table/filter selectors
- Modify: `tools/test-mp-ui.mjs` fleet/galaxy/alliance/ranking sections

**Screens owned:** `hamdoi`, `thienha`, `lienminh`, `xephang`. Task này test cả
bốn, including MP override của Liên Minh.

**Interfaces:**

- Preserve `U.form`, `U.capNhatForm`, all `f-*`, `ft-*`, `fl-*`, `fc-*`,
  `g-g/g-h`, `lm-tag/lm-ten`, `data-act` and payload.
- Galaxy output has exactly one table wrapper created by `U.bang`; old manual
  open/header/close strings are deleted before adding the new call.
- Every Galaxy body row exposes stable `data-coordinate="g,h,p"`; Task 9 uses
  the first `.trong` row only to choose a canonical free fixture coordinate.
- Ranking filters have exact `aria-pressed`; alliance create/join errors use
  Task 4 contract.

- [ ] **Step 1: Viết RED four-screen/native/state tests**

  Run shared audit for all four screens. Add exact assertions:

  **Fleet**

  - labels/help for `f-g`, `f-h`, `f-p`, `f-mission`, `f-pct`, `f-giu`, every
    `ft-*`, `fl-*`, `fc-*`;
  - ship/soldier/cargo groups have fieldset/legend or named group;
  - max buttons have stable focus key and 44px target;
  - active mission updates help without losing focused field.

  **Galaxy**

  - `g-g/g-h` labelled; control group named;
  - exactly one `[data-ui-scroll="galaxy-table"] table`, one caption, one
    `thead`, one `tbody`; 16 data rows remain;
  - every data row has exact parseable `data-coordinate`, unique across rows;
  - at 320px, assert `scrollWidth > clientWidth`, set the real
    `[data-ui-scroll="galaxy-table"]` to a bounded nonzero `scrollLeft`, call
    `U.ve()`, then assert exact clamped `scrollLeft` survives; switch screen and
    back once to prove a stale snapshot is not applied across screens;
  - action names include coordinate/mission, not ambiguous whole-row click.

  **Alliance**

  - labels/errors for `lm-tag/lm-ten`, named member/application/war tables;
  - create and join controls have accessible name and stable focus key;
  - owner buttons retain member identity in accessible name.

  **Ranking**

  - one captioned table, row/col scopes;
  - exactly one filter `aria-pressed=true`, rest false;
  - filter response keeps focus and table scroll.

  Run `node tools/test-mp-ui.mjs`. Expected RED across field labels/table
  semantics/aria-pressed and galaxy wrapper.

- [ ] **Step 2: Implement Fleet semantic groups**

  Apply `U.nhanTruong` to every fleet field. Wrap coordinate, mission, ships,
  infantry and cargo in named groups. Range value `#f-pct-v` is a live output
  associated with `f-pct`. Preserve `U.form` object identity and input listener
  logic. Each dynamic max/action gets the Task 3 focus key.

  Fleet tables use `U.bang` with keys `fleet-active`, `fleet-inbound`,
  `fleet-garrison`. Keep mission names/status text and countdowns; do not expose
  scheduler jobs.

- [ ] **Step 3: Replace Galaxy table atomically, không double wrapper**

  In `U.m_thienha`, delete old statements that append `<div class="bang-cuon">
  <table>`, the old header row, and the matching closing strings. Declare
  `var rows = ""` before the loop; loop appends only `<tr>...</tr>` to `rows`.
  After loop call exactly once:

  ~~~js
  h += U.bang(
    "galaxy-table",
    "Bản đồ thiên hà " + g + ":" + hh,
    galaxyHead,
    rows,
    "bang-thien-ha"
  );
  ~~~

  Declare `galaxyHead` before the call; it contains seven
  `th scope="col"` cells. Preserve row classes
  `trong/toi/nguoi/npc-bo`, all `data-act="nv|tuyen-chien|gui-thu|xem-tt"`,
  coordinate and API load. Each `<tr>` gets escaped numeric
  `data-coordinate="g,h,p"`. Add labels to `g-g/g-h` and a named control group.
  Task 4 `U.bang("galaxy-table",...)` creates this screen's stable
  `data-ui-scroll="galaxy-table"`; never add an inferred class/ordinal key.

  Add a source-level regression in test that reads `js/ui.js` and asserts the
  `U.m_thienha` slice has exactly one match for
  `/U\.bang\s*\(\s*["']galaxy-table["']/g`, zero manual `/<table\b/i` matches,
  and no old header/open/close append before `U.m_lienminh`. This supplements,
  not replaces, the DOM test.

- [ ] **Step 4: Implement Alliance/Ranking and shared errors**

  Use `U.bang` keys `alliance-members`, `alliance-applications`,
  `alliance-list`, `alliance-war-outgoing`, `alliance-war-incoming`,
  `ranking-table`. Do not turn rows into controls.

  MP alliance create uses labelled fields and validation summary; exact server
  payload remains `{ten,tag}`. Join/create/admin actions retain API endpoints.
  Consequential owner actions continue through Task 4 modal inventory.

  Ranking filters are buttons with stable focus key and
  `aria-pressed=String(U.xhLoai===id)`. `APP.taiXepHang` remains authoritative
  for MP.

- [ ] **Step 5: GREEN and commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run test:luat
  npm run lint
  npm run check:syntax
  git diff --check
  ~~~

  Expected: four screens PASS; galaxy still 16 rows/PvP actions; alliance
  create/join/admin and ranking behavior unchanged; no double table wrapper.

  Commit:

  ~~~bash
  git add js/ui.js js/app.js web/js/mp.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): rebuild fleet galaxy and community screens"
  ~~~

### Task 7: Reports, Messages, System và Combat Simulator

**Files:**

- Modify: `js/ui.js:1085-1421,1483-1674`
- Modify: `js/app.js:193-218`
- Modify: `js/main.js:79-161`
- Modify: `css/style.css` report/message/system/simulator selectors
- Modify: `tools/test-mp-ui.mjs` report/system/simulator sections

**Screens/outputs owned:** `tinnhan`, `nhatky`, `huongdan`, `mophong`,
`U.veBaoCao`, `U.veDoTham`, `U.veBaoCaoTenLua`, save/import/export dialogs.

**Interfaces:**

- Preserve message actions and simulator public facade/arity/state.
- Every report table, system form/table and simulator field is covered by RED.
- Message disclosure is a real button; clear-all stays Task 4 modal-confirm.

- [ ] **Step 1: Viết RED exhaustive renderer audit**

  Loop exact screens `tinnhan,nhatky,huongdan,mophong`. Assert shared audit plus:

  - message disclosure is `button`, has `aria-expanded`, `aria-controls`, stable
    key and controlled panel `hidden` state;
  - `doc-het` and modal `xoa-tin` retain actions;
  - every report table from battle/spy/missile fixture has caption, scoped
    headers, named scroll region;
  - `xem-tt` opens labelled dialog and dialog audit passes;
  - Nhật ký save/export/import controls named; export/import textarea + file
    input are labelled/described and error mapping is inline/summary;
  - simulator every `mpa-*`, `mpd-*`, `mpf-*`, `mpta-*`, `mptd-*`, `mp-bc`
    field is labelled; attacker/defender/defense are fieldsets with legends;
  - simulator result tables are native and named.
  - `U.mp` has no own property before the first simulator render, materializes
    only through `m_mophong`, and keeps identity through simulator rerenders.

  Build report fixtures by cloning/restoring only `ST.msgs/ST.spy` in
  `try/finally`; never leave gameplay fixture mutated. Exercise all three
  renderer functions, not only a generic table audit.

  Run `node tools/test-mp-ui.mjs`. Expected RED on each report family,
  save/import forms and simulator labels/fieldsets.

- [ ] **Step 2: Implement report/message semantics**

  Convert message header div to button preserving `data-act="doc-tin"` and
  `data-i`; controlled content ID derives from stable message identity, not
  index alone. `aria-expanded` mirrors `U.moTin`; controlled content uses
  `hidden`. New/unread includes text for screen readers.

  `U.veBaoCao`, `U.veDoTham`, `U.veBaoCaoTenLua` use `U.bang` for every tabular
  comparison. Preserve combat narrative/data/class names. Row labels get
  `scope="row"`; no div-based fake table.

  `xoa-tin` remains only an opener; `xoa-tin-ok` sends exact old `xoatin`
  action then closes dialog and clears `U.moTin`.

- [ ] **Step 3: Implement System/save/import/export semantics**

  Nhật ký/Hướng Dẫn have named sections and native tables where data is
  compared. `#file-nhap` has an associated visible or sr-only label. Export and
  import dialogs use Task 4 field/error markup. Invalid JSON marks `nhap-js`
  invalid, summary explains parse/migration failure and retains draft; success
  clears error and preserves exact localStorage/save migration behavior.

  Delete/new-game remain modal inventory; no native confirm.

- [ ] **Step 4: Implement all Simulator fields/tables**

  Update local `mpO` to call `U.nhanTruong` with exact unit name. Wrap attacker,
  defender fleet, defender defenses and each tech trio in fieldset/legend.
  `mp-bc` has label. Buttons preserve `mp-chay/mp-nap-ham/mp-xoa/mp-nap-bc`;
  `mp-xoa` confirms per Task 4.

  Result comparison uses `U.bang` with keys `sim-attacker-result`,
  `sim-defender-result`; status still includes win/draw/loss text, not color
  only. Preserve lazy `U.mp` materialization and public function arities for
  modular Task 5.

- [ ] **Step 5: GREEN and commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run test:luat
  npm run lint
  npm run check:syntax
  git diff --check
  ~~~

  Expected: all report/system/simulator fixtures PASS; existing message,
  save migration, file://, simulator behavior and public facade remain intact.

  Commit:

  ~~~bash
  git add js/ui.js js/app.js js/main.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): rebuild reports system and simulator screens"
  ~~~

### Task 8: Multiplayer loading/error/retry và complete chat live-state

**Files:**

- Modify: `web/js/mp.js:12-125,147-294,388-666`
- Modify: `css/style.css` loading/error/network/chat selectors
- Modify: `tools/test-mp-ui.mjs` MP route/chat sections

**Interfaces:**

- Owns exhaustive semantics for exact MP-only screens `bangtin`, `chat`,
  `taikhoan`; consumes Task 4 `U.nhanTruong`, `U.bang` and shared errors.
- Produces `MP.ui={loading,errors,connection,chat}` presentation-only state.
- Produces exact public `APP.thuLai(key)` arity 1.
- Retry keys: `thongtin`, `he`, `xephang`, `lienminh`, `bangtin`, `chat`.
- Read endpoints only are retried; never retry a gameplay command automatically.
- Account server table displays additive `releaseVersion`,
  `phienBanLichSu`, `stateVersion`; compatibility `phienBan` remains accepted.

#### Runtime state matrix — every row needs a RED assertion

| Area | Required observable states |
| --- | --- |
| All reads | initial loading; cached + “Đang làm mới”; error + retry; retry success + online. |
| Network chip | `online/offline`, text + icon + `role=status`, no inline-color-only state. |
| Thông Tin startup/account | No-cache startup and cached account loading/error/retry/recovery. |
| Bảng Tin | `/api/bangtin` loading/error/cache and `APP.thuLai("bangtin")`. |
| Account versions | Additive `releaseVersion`, `phienBanLichSu`, `stateVersion`; legacy `phienBan` fallback. |
| Session expiry | Protected read 401 returns to named login form, hides/inerts game, clears account UI cache. |
| Chat initial | loading placeholder, then named logs; no duplicate initial announcement. |
| Chat refresh | cached refresh; bottom auto-follow only if eligible. |
| Chat scrolled up | preserve `scrollTop`; live off; show “Xem tin mới”. |
| Chat new button | show once; click resets bottom/unread/live; hide after reset. |
| Chat typing | preserve draft/focus; no spoken duplicate; new button shown. |
| Chat dedupe | same message IDs never duplicate DOM or announcement. |
| Chat send fail | button re-enabled; draft retained; inline/toast error. |
| Chat send success | draft clears only after POST success; one refresh; status success. |

- [ ] **Step 1: RED exhaustive semantics for all three MP-only screens**

  Sau login, loop exact `bangtin`, `chat`, `taikhoan`; không return sớm khi một
  screen pass. Mỗi screen phải có `h1#man-tieu-de`, và mọi `.panel` là named
  `section` với stable heading ID + `aria-labelledby`. Assert exact panels:

  - Bảng Tin: `bulletin-feed`, `bulletin-battles`;
  - Chat: `chat-common`, `chat-alliance` kể cả empty/non-member state;
  - Tài Khoản: `account-summary`, `server-summary`.

  Route a deterministic read-only `/api/bangtin` response containing one battle
  row; use the real Task 6 joined-alliance account for conditional chat, and
  restore route/session in `finally`. Audit every visible table: one stable
  `[data-ui-scroll]`, `caption`, `thead`, `tbody`, every column header
  `scope="col"`, every attribute label `scope="row"`. Assert exact U.bang keys
  `bulletin-battles`, `account-summary`, `server-summary`; no raw table exists
  outside those wrappers.

  Audit every field through Task 4 markup: `chat-noi-chung`, conditional
  `chat-noi-lienminh`, and—after keyboard-opening the account dialogs—`mk-cu`,
  `mk-moi`, `xtk-mk`, `xtk-xn`. Each control sits in `[data-field]`, has exact
  `label[for]`, existing help/error IDs in `aria-describedby`, and its form has
  an accessible name. Assert invalid submit uses summary/inline/first-invalid
  focus and sends no request. Every visible action remains at least 44×44 at
  320 and no panel causes page overflow.

  Run `node tools/test-mp-ui.mjs`. Expected RED on unnamed MP panels, raw Bảng
  Tin/account tables and chat/account fields not produced by shared helpers.

- [ ] **Step 2: RED loading/cache/error/retry for all keys**

  Use Playwright `route` with deferred promises, not sleeps. For each key:

  1. clear cache/state, hold first `route.fetch`, enter screen, assert loading;
  2. release success, assert final content;
  3. hold next refresh, assert old content remains + “Đang làm mới”;
  4. abort request, assert old content + error + visible retry and offline chip;
  5. unroute failure, keyboard activate retry, wait response, assert error gone,
     content current and online chip.

  The loop's key/endpoint pairs are exactly `thongtin:/api/thongtin`,
  `he:/api/he`, `xephang:/api/xephang`, `lienminh:/api/lm`,
  `bangtin:/api/bangtin`, `chat:/api/chat`. Evaluate only to observe that
  `APP.thuLai("bangtin")` and `APP.thuLai("thongtin")` return/start their read;
  each call must produce a real request and visible DOM transition.

  Thông Tin gets two explicit paths. In a clean logged-out context, hold the
  first `/api/thongtin`: `#kd-sv` is a named busy region while login/register
  remain usable. Fail with no cache: show alert + `thongtin` retry without
  hiding auth; keyboard retry succeeds and updates startup copy. In the logged
  in context, enter Tài Khoản, hold refresh, retain old server table plus “Đang
  làm mới”; abort, retain table plus error/retry/offline; retry with new values,
  assert account table and cached startup copy both update and network is
  online. Logout only after these assertions to reveal the recovered startup
  copy; restore authenticated fixture afterward.

  Route `/api/thongtin` with distinct deterministic values for
  `releaseVersion`, `phienBanLichSu` and `stateVersion`; assert all three labels
  and values are visible without an exact total-key check. Run a second fixture
  containing only compatibility `phienBan` and assert the legacy version still
  renders while missing additive fields get an explicit unavailable value.

  Route a protected refresh to 401. Assert exactly one visible main is the MP
  startup, login form is visible and named, the expiry message is a clear alert,
  game controls are hidden/inert, account/chat/alliance cache is cleared and a
  not-yet-materialized `U.mp` remains an absent own property. A deliberately
  late old-session response cannot repopulate the new session.

  Run `node tools/test-mp-ui.mjs`. Expected RED for `MP.ui`, Thông Tin and Bảng
  Tin retry keys, startup/account recovery, cached refresh and additive account
  version display.

- [ ] **Step 3: RED full chat state matrix**

  Route `/api/chat` with deterministic objects containing stable `id`.

  - Hold initial GET: loading visible; release and assert log role/name.
  - Add messages until overflow, set scrollTop to a known midpoint, type a
    draft, release one new unique ID. Assert exact scrollTop remains, draft and
    focus remain, log `aria-live=off`, one `chat-xuong` button visible.
  - Deliver identical payload twice. Attach `MutationObserver` before delivery;
    assert one DOM node for the ID and one announcement mutation at most.
  - Keyboard activate “Xem tin mới”; assert at bottom, button hidden, unread
    reset, live returns `polite` only when input is not focused.
  - Hold POST and press Enter twice: assert named chat form
    `aria-busy/data-submitting`, send disabled + processing state and one
    request. Abort: assert same draft, send enabled, busy clear, error visible.
    Retry POST success: draft clears only after response, one new message,
    send enabled and busy clear.
  - Test both common and alliance logs, then membership loss removes alliance
    input/log without leaking cached messages.

  Run `node tools/test-mp-ui.mjs`. Expected RED for dedupe/live/button/failure
  retention even if existing basic chat tests pass.

- [ ] **Step 4: Implement presentation state and retry functions**

  Initialize once:

  ~~~js
  MP.ui = {
    loading: {},
    errors: {},
    connection: "online",
    chat: {
      chung: {atBottom: true, unread: 0, lastAnnouncedId: 0},
      lienminh: {atBottom: true, unread: 0, lastAnnouncedId: 0}
    }
  };
  ~~~

  Local `datTai`, `datLoi`, `datKetNoi` own state. A read wrapper accepts key
  and loader; it marks loading before fetch, retains cache, clears only its key
  on success, records error on failure. Network abort sets offline; valid HTTP
  response sets online even when application reports an error.

  Define public facade once with arity 1:

  ~~~js
  APP.thuLai = function (key) {
    if (key === "thongtin") return taiThongTin(true);
    if (key === "he" && U.gal) return APP.taiHe(U.gal.g, U.gal.h);
    if (key === "xephang") return APP.taiXepHang(U.xhLoai);
    if (key === "lienminh") return taiLienMinh(true);
    if (key === "bangtin") return taiBangTin(true);
    if (key === "chat") return taiChat(true);
  };
  ~~~

  `APP.ACT["thu-lai"]` passes `data-ui-retry`; no command endpoint is accepted.
  Render loading/error/cache via reusable private markup with
  `aria-busy`, `role=status/alert` and retry button.

  Replace the startup one-shot call with local `taiThongTin(force)` through the
  same read wrapper. It owns `MP.sv`, renders `#kd-sv` for no-cache/loading/
  cached-refresh/error/recovered states, and rerenders `taikhoan` only when that
  screen is active. Entering Tài Khoản requests a refresh. Failure never clears
  a valid `MP.sv`; no-cache failure never disables auth. A success updates both
  startup cache view and the two account tables without duplicating listeners.

  `dangXuatCuc` clears loading/errors/chat counters and increments the existing
  session generation before showing the named auth main; it hides/inerts game
  content, deletes lazy `U.mp` rather than assigning `null`, and emits the
  expiry alert. A late read from account A cannot set retry/cache/live state
  after account B logs in.

- [ ] **Step 5: Implement MP-only semantics and chat live behavior**

  Render each exact panel from Step 1 as `section.panel` with stable heading
  ID. Bảng Tin uses a semantic list for feed items and
  `U.bang("bulletin-battles",...)` for battles. Tài Khoản uses
  `U.bang("account-summary",...)` and `U.bang("server-summary",...)`; both
  have two column headers and each attribute name is `th scope="row"`.

  Chat common/alliance sends are named forms. Build `chat-noi-chung` and the
  conditional `chat-noi-lienminh` only through `U.nhanTruong`; retain exact IDs,
  `data-act`, channel payloads and draft state. Account password/delete fields
  remain Task 4 dialogs but their MP bodies also call `U.nhanTruong`, so the
  Step 1 exhaustive loop has no raw visible field or table exception.

  Logs are `role="log"`, named, `aria-relevant="additions text"`; entries use
  message `id` as `data-chat-id`. Initial cache render has live off, then enables
  polite without replaying old nodes. Refresh computes new IDs, updates or
  appends exactly once.

  Before DOM update capture `scrollTop`, `scrollHeight`, bottom threshold and
  focused input. If scrolled up or typing, keep relative scroll position, set
  live off, increment unique unread and show one button. If at bottom and not
  typing, append unique messages, keep bottom and live polite. Button action
  scrolls target bottom, clears unread, hides itself and restores eligible live
  state. Repeated IDs do nothing.

  Chat POST retains draft until success. It uses the Task 4 private submitting
  helper, ignores duplicate submit while pending and calls end in `finally` for
  both outcomes. Success clears only matching input after server accepts;
  failure leaves exact draft and visible error.

  Server summary displays all additive version fields and tests actual values
  from `/api/thongtin`; no exact API total-key assertion.

- [ ] **Step 6: GREEN semantic/runtime matrix and commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run lint
  npm run check:syntax
  git diff --check
  ~~~

  Expected: all three MP-only semantic screen loops and every runtime matrix
  row PASS, including Thông Tin/Bảng Tin retry, release/history/state version
  and complete chat state transitions.

  Commit:

  ~~~bash
  git add web/js/mp.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): add resilient multiplayer reads and live chat"
  ~~~

### Task 9: Keyboard-only journeys, stable invariants và real durable cutover

**Files:**

- Modify: `tools/test-mp-ui.mjs` final acceptance block before destructive
  cleanup and final logger assertion
- Verify only: `server/app.js::taoUngDung`
- Verify only: `server/world.js::G` for canonical `G.htMoi` fixture creation
- Verify only: `server/scheduler/index.js::taoScheduler`
- Verify only: `server/scheduler/cutover.js::runMaintenanceCutover`
- Runtime review outputs only, never staged:
  `/tmp/thdc-orbital-ui-review/*.png`

**Interfaces:**

- Consumes all Task 1–8 helpers/runtime contracts.
- Keeps helper names `vaoManBangBanPhim`, `chupGameplay`, variables `p1`,
  `pSolo`, `stateMpTruoc`, `stateSoloTruoc` before the modular Task 5 insertion
  point.
- Declares `keyboardAccountAId` and `keyboardAccountBId` in Step 2's journey
  scope and `restartAccountId` only in Step 4's reopened-app scope. Each is
  assigned exactly once by `layAccountIdTuState` from the matching real
  `/api/state` response armed before keyboard submit. No display-name/DB lookup
  produces an ID, and no generic undeclared `accountId` is used in this task.
- `chupGameplay` captures stable identity/schema only; it never snapshots
  ticking resources, countdowns or mutable fleet arrays for long-flow equality.
- Consumes Task 1 `CUTOVER_RESULT/DURABLE_STATUS`; every MP journey already
  runs through the canonical real writer. This task verifies that evidence,
  restarts the same durable DB and performs a fresh post-restart mutation.

#### Stable identity contract

~~~js
async function chupGameplay(page) {
  return await page.locator("body").evaluate(function () {
    var state = window.ST;
    return {
      mode: APP.mp ? "multiplayer" : "solo",
      stateVersion: state.v,
      seed: state.seed,
      commander: state.ten,
      home: G.tdKey(state.home),
      planets: state.planets.map(function (planet) {
        return G.tdKey(planet.c);
      })
    };
  });
}
~~~

Expected deltas được assert ngay sau từng action:

- build: queue thêm đúng one `{id:"metalMine",n:1}`;
- trade 90 metal: metal giảm đúng 90, Galana tăng đúng
  `Math.floor(90 / G.C.TY_GIA.metal)` từ response authoritative;
- planet selector: keyboard changes `#chon-ht` from option 0 to fixture option
  1, `U.pi=1`, selected value and rendered planet name all agree;
- shipyard: selected planet queues exactly `{id:"cargoS",n:2}`, metal and
  crystal each decrease exactly 4,000, first planet and every other queue stay
  unchanged;
- fleet: one new immutable `fleetId`, mission `thamhiem`, destination slot 16,
  selected ship removed from planet once;
- chat: one server message ID/text, draft clears after success;
- alliance: exact tag/name, join request then approved membership;
- solo save: chosen tax/state marker persists after reload + actual Continue.

Không so naturally ticking resources/fleets ở đầu và cuối journey.

- [ ] **Step 1: Tạo keyboard helpers không programmatic focus**

  Helper Tab chỉ đọc active descriptor ở Node side:

  ~~~js
  async function activeDescriptor(page) {
    return await page.locator("body").evaluate(function () {
      var active = document.activeElement || document.body;
      return {
        id: active.id || "",
        act: active.getAttribute && active.getAttribute("data-act"),
        man: active.getAttribute && active.getAttribute("data-man"),
        dataId: active.getAttribute && active.getAttribute("data-id"),
        kenh: active.getAttribute && active.getAttribute("data-kenh"),
        tag: active.tagName
      };
    });
  }

  async function tabDen(page, match, options) {
    options = options || {};
    var key = options.reverse ? "Shift+Tab" : "Tab";
    var limit = options.limit || 160;
    for (var index = 0; index < limit; index++) {
      await page.keyboard.press(key);
      var active = await activeDescriptor(page);
      if (match(active)) return active;
    }
    throw new Error("keyboard target not reached");
  }

  async function vaoManBangBanPhim(page, man) {
    await tabDen(page, function (active) { return active.man === man; });
    await page.keyboard.press("Enter");
    await page.waitForFunction(function (expected) {
      return window.U && U.man === expected;
    }, man, {timeout: 10_000});
  }

  function layKhoiKeyboard(source, name) {
    var start = "/* KEYBOARD_" + name + "_START */";
    var end = "/* KEYBOARD_" + name + "_END */";
    var from = source.indexOf(start);
    var to = source.indexOf(end);
    if (from < 0 || to <= from || from !== source.lastIndexOf(start) ||
        to !== source.lastIndexOf(end)) {
      throw new Error("invalid keyboard markers: " + name);
    }
    return source.slice(from + start.length, to);
  }

  function kiemKhoiKeyboardOnly(source) {
    var guarded = ["BOOTSTRAP", "GAMEPLAY", "RESTART"].map(function (name) {
      return layKhoiKeyboard(source, name);
    }).join("\n");
    var forbidden = /\.(?:click|fill|focus|selectOption|dispatchEvent)\s*\(/;
    if (forbidden.test(guarded)) {
      throw new Error("programmatic interaction inside keyboard journey");
    }
  }
  ~~~

  Gọi `kiemKhoiKeyboardOnly(TEST_SOURCE)` sau journeys; Task 1 đã đọc source
  bằng approved `new URL(import.meta.url)` constructor duy nhất. Ba guarded
  slices phải exercise Tab, Shift+Tab, Arrow, Enter
  và Escape đúng ngữ cảnh; chúng không được dùng `locator/page.focus`,
  `.click`, `.fill`, DOM `.focus()`, `selectOption` hoặc synthetic dispatch.
  Marker names được ghép chuỗi trong helper nên helper không tự match token.
  Frozen Modular Task 5 probe nằm ngoài cả ba slices; nó được phép giữ exact
  `.focus/.click/.fill` đã duyệt và vẫn bị global `$eval/$$eval` scan kiểm tra.

- [ ] **Step 2: Bootstrap both modes, freeze insertion point, rồi complete MP journeys**

  Tạo hai MP context sạch và một file context riêng với browser `Date.now`
  fixed bằng `addInitScript`; không reuse account đã qua mouse baseline và
  không điều hướng file context qua HTTP.

  Đặt literal `/* KEYBOARD_BOOTSTRAP_START */` ngay trước registration; mọi
  auth và solo-start interaction dưới đây ở trong slice này.

  **Registration + login**

  - Từ body Tab tới login tab; ArrowRight chọn register; Shift+Tab/Tab chứng
    minh roving order; Tab qua username/display/password/submit, type và Enter.
  - Arm both `/api/dangky` and its ensuing `/api/state` response before Enter;
    assert game visible/stable identity, then assign `keyboardAccountAId` from
    that state response before any writer fixture.
  - Keyboard activate logout, then Tab through login fields and Enter; assert
    `/api/dangnhap`, same account/home/`toi.tk===keyboardAccountAId` and no stale
    password/draft.

  **Solo startup + exact Modular Task 5 insertion point**

  Trước gameplay action đầu tiên, tạo `pSolo` trong clean `file://` root
  context, gắn HTTP-request recorder, rồi từ body Tab qua commander/seed/start
  và Enter. Assert game visible và recorder rỗng. Lúc này helpers,
  `p1`, `pSolo` và `ktra` đều đã tồn tại. Đặt
  `/* KEYBOARD_BOOTSTRAP_END */`, rồi capture đúng hai stable snapshots:

  ~~~js
  var stateMpTruoc = await chupGameplay(p1);
  var stateSoloTruoc = await chupGameplay(pSolo);
  ~~~

  Approved Modular Task 5 chèn public-surface baseline ngay sau hai dòng này và
  trước block Build bên dưới. `pSolo` chưa render `mophong`; insertion có thể
  kiểm lazy absence/materialization rồi restore mà không che một journey trước
  đó. Probe nằm ngoài guarded slices vì frozen code của nó chủ động dùng
  `.focus/.click/.fill`. Đây không phải mutable gameplay snapshot. Đặt
  `/* KEYBOARD_GAMEPLAY_START */` chỉ sau khi probe kết thúc và ngay trước Build.

  **Build**

  - `vaoManBangBanPhim(...,"congtrinh")`;
  - Tab tới `ct-sl-metalMine`, `Control+A`, type `1`, Tab tới exact build button,
    Enter; wait `/api/lam` and queue outcome;
  - assert exact queue delta, not a long snapshot.

  **Trade**

  - Keyboard navigate `tainguyen`, Tab to `cho-metal`, type 90, Tab to Sell,
    Enter; wait authoritative response;
  - assert exact immediate delta formula and matching log entry.

  **Planet selector + shipyard `data-act="dong"`**

  Keyboard-navigate to `thienha`, wait the real `/api/he` response and read the
  first visible empty row's coordinate attribute without activating it. Parse
  three bounded integers into `freeCoordinate`; reject a missing/non-empty row.
  Take a canonical state/revision snapshot. Call
  `await suaStateUI(keyboardAccountAId, function (state) {...})`; in that sync
  mutator create `G_SERVER.htMoi(state,freeCoordinate,"UI Keyboard B",false)`,
  set only the new planet's `b.shipyard=2`, `res.metal=12000`,
  `res.crystal=12000`, set `state.tech.combustion=Math.max(old,2)`, and push it.
  The helper owns `app.tg.luu`; assert revision +1 and the `ht` projection
  exposes option 1.

  Reload and login using the guarded keyboard flow. From body Tab to
  `#chon-ht`; press `End`, then `Enter` to commit the second option—never
  `selectOption` or DOM change dispatch. Wait until `U.pi===1`; assert native
  selected value `"1"`, rendered heading/command planet name and coordinate.
  Keyboard-navigate `xuong`, Tab to `#sl-cargoS`, `Control+A`, type `2`, Tab to
  exact `[data-act="dong"][data-id="cargoS"]`, Enter and wait the authoritative
  `/api/lam` response. Immediately assert second planet queue gained exactly
  `{id:"cargoS",n:2}`, metal/crystal each fell 4,000, first planet/qS and all
  unrelated state stayed equal, and revision advanced.

  In `finally`, one awaited real writer closure calls
  `app.tg.luu(keyboardAccountAId,planetSnapshot)`, asserts projections/revision,
  and keyboard re-login restores option count and state. The temporary planet,
  prerequisites and ship queue cannot reach fleet/alliance/restart flows.

  **Fleet launch**

  After registration/build/trade, snapshot the canonical state and current
  `dq.revision`. Without any browser interaction, call the real
  `app.scheduler.runCommand` with `accountId:keyboardAccountAId`; its
  synchronous `run` calls `app.tg.nap(keyboardAccountAId)`, adds one `cargoS`
  and sufficient deut, preserves every other field, then calls
  `app.tg.luu(keyboardAccountAId,state)`. Assert revision rose by one and
  derived jobs/projections remain consistent. No direct SQL, fake lease, world
  tick or alternate app option is allowed.

  Reload/login via keyboard to obtain authoritative fixture. Navigate
  `hamdoi`; Tab through coordinates; set destination p=16; on `f-mission` press
  End to choose `thamhiem`; Tab to `ft-cargoS`, type 1; Tab to Launch and Enter.
  Assert exact fleet delta/invariants listed above.

  In `finally`, submit a second real `ui-test-fixture` command whose closure
  uses `accountId:keyboardAccountAId`, calls
  `app.tg.luu(keyboardAccountAId,snapshot)`, and awaits the outer command. The
  world save owns every projection, successor job and revision increment.
  Assert canonical state equals the snapshot, revision increased rather than
  moving backward, then refresh. The injected ship/fuel and launched test
  fleet cannot leak into later journeys or restart.

  **Chat**

  Navigate `chat`; Tab to `chat-noi-chung`, type a unique text; Shift+Tab then
  Tab returns to same input; Tab to Send, Enter. Assert one POST success,
  exactly one message ID/text and cleared draft.

  **Alliance create + join**

  Account A keyboard navigates `lienminh`, enters tag/name and creates. Account
  B arms its own `/api/state`, registers/logs in by keyboard, assigns
  `keyboardAccountBId`, navigates Liên Minh and activates the exact join button.
  A keyboard returns to Liên Minh and activates the request whose `data-tk`
  equals `keyboardAccountBId`. Wait bounded state/DOM condition for B
  membership; assert exact alliance identity and no duplicate member.

  Every route, viewport and writer-backed state fixture has `try/finally`. All
  unique keyboard accounts are removed with the suite temp DB in outer cleanup.

- [ ] **Step 3: Complete solo save + actual load/continue by keyboard**

  Tiếp tục trên clean `pSolo` đã khởi động bằng keyboard ở Step 2. Navigate by
  keyboard to Tổng Quan, change tax and activate action; Tab to header Save and
  Enter. Assert `thdc_save_v6` contains expected state version/tax.

  Reload page (persistence boundary), then from body use Tab/Shift+Tab to reach
  `#kd-tieptuc` and press Enter. Assert game visible and exact saved tax,
  commander, seed and state marker restored. Open import dialog by keyboard,
  Escape closes and returns focus; no HTTP request occurred.

  At end compare only the stable identity contract captured before the first
  gameplay action. Never compare ticking resources or fleet arrays. Put
  `/* KEYBOARD_GAMEPLAY_END */` only after Continue, dialog Escape and all MP
  behavior assertions have completed.

- [ ] **Step 4: Verify canonical cutover evidence and real-writer restart**

  Before shutdown, assert the Task 1 `CUTOVER_RESULT` came from the exact
  Scheduler Task 9 public call and has `mode="durable"`. Assert current
  `app.scheduler.getStatus()` has canonical ready/lease/recovery/count/age
  fields. Completed keyboard actions have already proved their HTTP responses
  and persisted rule deltas; there is no fake status object to satisfy this
  assertion.

  Close all MP/file contexts and `await app.stop()` first. Restart the same,
  already durable DB without invoking cutover a second time:

  ~~~js
  var durableRun = await khoiDongApp();
  app = durableRun.app;
  BASE_URL = durableRun.baseUrl;
  DURABLE_STATUS = durableRun.status;
  ~~~

  `khoiDongApp` uses the bounded `getStatus` condition yielding with
  `setImmediate`, not a fixed sleep. Assert canonical fields:
  `mode=durable`, `ready=true`, `reason=null`, `writerLeaseHeld=true`,
  `recoveryComplete=true`. Assert `/readyz` 200 and `/healthz` 200.

  Open a new context against durable `BASE_URL`. Complete a fresh registration
  by the
  keyboard flow, arm its real `/api/state`, assign `restartAccountId`, and
  assert it differs from the two Step 2 IDs. Complete one real tax mutation
  tied to that identity inside literal
  `/* KEYBOARD_RESTART_START */` / `/* KEYBOARD_RESTART_END */`; wait the real
  HTTP response and verify persisted state via keyboard logout, second login
  and read. Assert no direct DB setup was used for this durable action. This
  proves production registration is reachable after canonical cutover plus a
  real writer restart, and the UI did not bypass admission. Task 10 reruns this
  exact proof through `test:ui`.

- [ ] **Step 5: Deterministic manual-review checkpoints**

  Under fixed browser Date, disable animations, navigate to Tổng Quan and reset
  drawer/resources before each capture. Write exactly:

  ~~~text
  /tmp/thdc-orbital-ui-review/desktop-1400x900.png
  /tmp/thdc-orbital-ui-review/tablet-1024x768.png
  /tmp/thdc-orbital-ui-review/mobile-320x844.png
  ~~~

  Desktop shows overview/radar + command/nav; tablet shows closed drawer with
  command resources; mobile shows opened resource disclosure and closed nav.
  `page.screenshot({animations:"disabled"})`; print the three absolute paths.
  Files are review output only and must not be staged or referenced at runtime.

- [ ] **Step 6: GREEN integration and commit**

  Run:

  ~~~bash
  node tools/test-mp-ui.mjs
  npm run test:ui
  test "$(rg -c '/\* KEYBOARD_(BOOTSTRAP|GAMEPLAY|RESTART)_(START|END) \*/' \
    tools/test-mp-ui.mjs)" -eq 6
  ! rg -n '\$\$?eval|\beval\s*\(|new Function' tools/test-mp-ui.mjs
  npm run lint
  npm run check:syntax
  git diff --check
  ~~~

  Expected: all three guarded keyboard slices, planet selection, shipyard,
  complete journeys, stable action deltas, file save/load, canonical cutover,
  real durable registration/action and three screenshots PASS. Frozen Modular
  probe remains outside slices. No naturally ticking long-flow equality.

  Commit:

  ~~~bash
  git add tools/test-mp-ui.mjs
  git commit -m "test(ui): verify keyboard journeys and durable cutover"
  ~~~

### Task 10: Build/artifact ownership và release verification

**Files:**

- Modify generated only: `dist/thien-ha-dai-chien.html`
- Modify generated only: `dist/artifact.html`
- Verify only: `tools/build.js`, `tools/source-manifest.js`,
  `tools/check-artifact.js`, `package.json`, `package-lock.json`

**Interfaces:**

- Foundation Task 3 remains sole owner of build/manifest/checker behavior.
- Modularization Task 5 later owns adding internal UI/app modules to manifest.
- UI Task 10 only regenerates current two artifacts after source is final.
- `npm run test:ui` includes Task 9 real cutover, so Task 10 re-verifies it.

- [ ] **Step 1: Verify package/manifest owner contracts before build**

  Run:

  ~~~bash
  node tools/test-package-contract.js
  node tools/test-artifact.js
  node tools/check-version.js
  ~~~

  Expected: PASS. Do not edit `package.json`, lockfile, build/checker or manifest
  in this task. If static shell order is stale, return failure to Foundation/
  manifest owner rather than adding UI-local loader logic.

- [ ] **Step 2: Generate both artifacts and verify closed-world output**

  Run:

  ~~~bash
  npm run build
  npm run check:artifact
  rg -n 'data-visual-signature="orbital-command"' \
    dist/thien-ha-dai-chien.html dist/artifact.html
  ! rg -n 'thdc-orbital-command-reference\.png' \
    dist/thien-ha-dai-chien.html dist/artifact.html
  ! rg -n 'src="js/|href="css/style\.css"' dist/thien-ha-dai-chien.html
  ~~~

  Expected: both generated outputs contain semantic/orbital shell, inline
  canonical source exactly once and contain no PNG/runtime relative dependency.

- [ ] **Step 3: Full release gates**

  Run in this order:

  ~~~bash
  npm test
  npm run test:scheduler
  npm run test:server
  npm run test:load
  npm run test:ui
  npm run lint
  npm run check:syntax
  npm run check:artifact
  git diff --check
  ~~~

  Expected: PASS. UI suite covers `/`, `/index.html`, `/solo`, `/motnguoi`,
  file root, exact 320/390/768/1024/1400/1440 viewports, 200% visual viewport,
  every screen/form/table, complete keyboard flows, loading/chat and real
  durable cutover.

- [ ] **Step 4: Compatibility/static scans**

  Run:

  ~~~bash
  ! rg -n 'thdc-orbital-command-reference\.png' \
    index.html web/index.html css js web/js dist
  ! rg -n '\$\$?eval|\beval\s*\(|new Function' tools/test-mp-ui.mjs
  rg -n 'thdc_save_v6|thdc_mp_token' js/main.js web/js/mp.js
  rg -n 'data-act=|data-man=' index.html web/index.html js/ui.js js/app.js web/js/mp.js
  ~~~

  Expected: no runtime bitmap/eval; localStorage keys and selectors remain.
  Run a final public facade test from approved modular plan before extraction.

- [ ] **Step 5: Commit only generated outputs**

  ~~~bash
  git add dist/thien-ha-dai-chien.html dist/artifact.html
  git diff --cached --check
  git commit -m "build: refresh orbital command artifacts"
  git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html
  ~~~

  Do not stage `/tmp` screenshots, docs reference PNG, plan docs, package files,
  manifest/build checker or unrelated worktree changes.

## Plan self-review

### Finding-to-task mapping

| Reviewer finding | Resolution |
| --- | --- |
| 1. Fresh DB legacy/not-ready | Task 1 cuts over before pages and uses real writer; Tasks 9/10 restart/rerun. |
| 2. Random child port/sleeps/cleanup | Task 1 uses `port:0`, `BASE_URL`, bounded outcomes and robust cleanup. |
| 3. Keyboard flow only edited drafts | Task 9 completes every required journey and checks outcomes. |
| 4. Startup/auth semantics + tabs | Task 1 owns visible mains/forms and roving keyboard tabs. |
| 5. Route checks used hidden DOM | Task 1 checks visible, distinct route bodies and opposite controls. |
| 6. Focus restore was ID-only | Task 3 stable keys/fallback; Task 4 dialog origin. |
| 7. Responsive/zoom/resources | Task 2 exact sizes, offsets, touch, overflow and disclosure. |
| 8. Global forms/errors | Task 4 shared contract/inventory; Tasks 5–7 own screens. |
| 9. Bảng Tin/chat runtime gaps | Task 8 Thông Tin/Bảng Tin retry, versions and every chat live state. |
| 10. Visual direction generic | Tasks 2/5 structural design; Task 9 screenshots. |
| 11. Nav/alert/dialog gaps | Task 3 exact model; Task 4 full consequence inventory. |
| 12. Time-flaky gameplay snapshot | Task 9 stable identity plus immediate rule-derived deltas; fixed clock. |
| 13. Incomplete screen/runtime TDD | Tasks 5–7 loops; Task 8 adds all MP-only screens and runtime states. |
| 14. Stale ranges/order/artifact | Updated map, helper order, integration order and Task 10 ownership. |
| 15. JS line/fence/diff quality | Every task runs lint/syntax/diff; final author validation below. |

### Round-2 closure mapping

| Review finding | Executable closure |
| --- | --- |
| R2-1. Keyboard guard vs Modular probe | Task 9 uses bootstrap/gameplay/restart slices; frozen probe stays outside. |
| R2-2. MP-only semantic gap | Task 8 loops `bangtin/chat/taikhoan`, every panel/table/field. |
| R2-3. Thông Tin states/retry | Task 8 adds no-cache startup, cached account and `thongtin` retry. |
| R2-4. Planet/shipyard keyboard gaps | Task 9 selects `#chon-ht` and completes authoritative `dong`. |
| R2-5. Missing canonical sizes | Task 2 tests exact 390×844 and 1440×900 in addition to prior four. |
| R2-6. Editable key interception | Task 4 guards four editable kinds while preserving dialog Escape. |
| R2-7. Alert families underspecified | Task 3 freezes four incoming families, copy, severity and destination. |
| R2-8. Drawer selection cleanup | Task 4 routes `ACT.man` through `U.datDrawer(false)` and content focus. |
| R2-9. Scroll target used too early | Task 3 creates/tests real `fleet-active`; Task 6 preserves/adds keys. |
| R2-10. Consequence source range | Task 4 owns exact `huyxay/huync/huydong/goive/ban-ten-lua` symbols. |

### Round-3 closure mapping

| Review finding | Executable closure |
| --- | --- |
| R3-1. Raw war backdate | Task 1 releases lease, advances clock, reopens, gates, then checks `/api/he`. |
| R3-2. Missing account identity | Task 1 captures `toi.tk`; Task 9 scopes A/B/restart IDs and every writer use. |
| R3-3. Missing submit lifecycle | Tasks 1/4 defer auth/account/`APP.lam`; Task 8 retains chat. |
| R3-4. Scroll RED after implementation | Task 3 RED proves `fleet-active` absent before creating it. |

### Accessibility ownership matrix

| Surface | Owner |
| --- | --- |
| Solo/MP startup, auth tabs/forms | Task 1 semantics; Task 4 errors. |
| Command/nav/resources/alerts | Tasks 2–3. |
| Drawer/modal/toast/global dialog fields | Task 4. |
| Economy/construction/research/shipyard/defense | Task 5. |
| Fleet/galaxy/alliance/ranking | Task 6. |
| Reports/messages/save/import/export/simulator | Task 7. |
| MP loading/Thông Tin/Bảng Tin/chat/account versions | Task 8. |
| Keyboard/end-to-end/routes/file/durable | Task 9. |

### Public-surface consistency

The plan introduces no unexpected non-underscore U function. All public helpers
named by approved modular plan exist before its Task 5 and retain exact arity.
`U.ui/U.MAN/U.nguon/APP.ACT` identities survive. `U.mp` remains lazy until
simulator render. `APP.thuLai` exists only in MP and has arity 1. `U.hop` is
dialog, never a drawer alias. `APP.tuaSolo` remains untouched.

### Scheduler consistency

Task 1 consumes `runMaintenanceCutover({kho,clock,ownerId})` before the first
browser context, closes maintenance, then supplies only `taoScheduler` through
the sole `schedulerFactory` option. Every authoritative browser action and
server-state fixture uses the real writer; fixture saves use
`scheduler.runCommand` plus world save under its active lease. Task 9 verifies
cutover evidence and restarts the same durable DB; Task 10 reruns it. Status is
`app.scheduler.getStatus()`. Task 1 stops/releases before its 24-hour clock jump
and reopens without recutover. No fake ready bridge, HTTP cutover, direct mode
SQL, second factory option, scheduler metadata UI or world tick bypass exists.

### Final plan-author validation

Run before freezing this document:

~~~bash
ui_plan=docs/superpowers/plans/2026-08-23-orbital-command-ui-implementation.md
awk 'length($0) > 120 { print NR ":" length($0) }' "$ui_plan"
test "$(rg -c '^### Task [0-9]+:' "$ui_plan")" -eq 10
! rg -n 'TO[D]O|TB[D]' "$ui_plan"
node -e '
const fs = require("node:fs");
const child = require("node:child_process");
const source = fs.readFileSync(process.argv[1], "utf8");
const tasks = [...source.matchAll(/^### Task (\d+):/gm)]
  .map(function (item) { return Number(item[1]); });
if (tasks.join(",") !== "1,2,3,4,5,6,7,8,9,10") {
  throw new Error("stale task labels: " + tasks.join(","));
}
const fence = /^\s*~~~js\r?\n([\s\S]*?)^\s*~~~\s*$/gm;
let match;
let count = 0;
while ((match = fence.exec(source))) {
  count++;
  const code = match[1].replace(/^  /gm, "");
  if (/\$\$?eval|\beval\s*\(|new Function|import\s*\(/.test(code)) {
    throw new Error("forbidden JS in fence " + count);
  }
  const result = child.spawnSync(
    process.execPath,
    ["--input-type=module", "--check"],
    {input: code, encoding: "utf8"}
  );
  if (result.status) throw new Error("JS fence " + count + ": " + result.stderr);
}
if (count !== 21) throw new Error("expected 21 JS fences, got " + count);
' "$ui_plan"
git diff --check -- "$ui_plan"
~~~

Expected: exactly Tasks 1–10 and 21 parseable JavaScript fences, no placeholder,
forbidden test loader or whitespace error, and no line over 120 columns. Freeze
line count and SHA-256 after these checks and before dispatching UI Task 1.
