# Quality Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo nền chất lượng tái lập, factory server quan sát được, mutation
gate thống nhất và loader an toàn, trong khi `file://index.html` vẫn mở game solo
không cần dependency lúc chạy.

**Architecture:** `tools/source-manifest.js` là nguồn thứ tự duy nhất cho hai
shell, build, artifact checker và rules loader. Server chuyển side effect lúc
`require` sang `taoUngDung(options)`, inject clock/logger/kho, và chỉ công bố
`app.scheduler`. Scheduler durable sau đó thay bridge rỗng cùng interface; không
có writer hay transaction capability khác lộ ra ứng dụng.

**Tech stack:** Node.js CommonJS, npm/package-lock, Playwright dev-only, Node
assert, SQLite `node:sqlite`, GitHub Actions.

**Spec:** [quality-maintainability design](../specs/2026-08-23-quality-maintainability-design.md).

## Trạng thái thực thi tại thời điểm đóng băng plan

- Task 1 hiện **BLOCKED bởi môi trường**: DNS npm trả `EAI_AGAIN`, cache offline
  trả `ENOTCACHED`, nên chưa có `package-lock.json` hợp lệ và package contract
  cố ý vẫn RED. Không bịa lockfile, không ghi nhận `npm ci` hay UI là xanh.
- Tasks 2–5 đã có snapshot source-only đã review độc lập. Bằng chứng và
  snapshot nằm trong
  `.superpowers/sdd/2026-08-23-quality-foundation-implementation/`:
  `task-{1,2,3,4,5}-report.md`, `progress.md`, và `snapshots/after-task-{2,3,4,5}`.
  Task 2 và Task 4 được **mở lại có giới hạn** ở các Step 6 và Step 5 bên dưới
  để bổ sung regression còn thiếu; snapshot cũ là bằng chứng lịch sử, không
  phải GREEN cuối cùng của hai task đó. Các direct Node gate lịch sử đã pass;
  bind socket và Chromium vẫn không được tính pass trong sandbox hiện tại.
- Task 1 khi có registry/cache sẽ chỉ sửa `package.json`, `package-lock.json`,
  `tools/test-package-contract.js`, rồi nối lại script contract. Tasks 2–5
  không sửa package metadata trong lúc Task 1 bị chặn.
- Tasks 6–8 chưa thực hiện. Chúng phải bắt đầu từ snapshot Task 5, không thay
  đổi package/lock ownership của Task 1.

## Ràng buộc bất biến

- `engines.node` giữ đúng `>=22.5`; runtime `dependencies` giữ đúng `{}`.
  Playwright là devDependency duy nhất và phải pin một version exact.
- Người dùng vẫn có thể mở trực tiếp `index.html`; browser không dùng import map,
  dynamic import, bundler, HTTP bắt buộc hay dependency mạng lúc chạy.
- `package.json.version` là release canonical; `G.PHIEN_BAN_LICH_SU` là nhãn
  tư liệu; `G.STATE_VERSION` là schema save. Không hoán đổi ba khái niệm này.
- `dbPath` ưu tiên `options.dbPath`, `env.THDC_DB`, rồi
  `rootDir/server/data/thdc.db`. `:memory:` chỉ hợp lệ khi
  `allowMemoryDb === true`, kể cả khi gọi `new Kho` trực tiếp.
- Chỉ `schedulerFactory` là injection scheduler. Hợp đồng public là
  `taoScheduler(context)`, `getStatus()`, và
  `runCommand({name, accountId?, run})`, trong đó `run` đồng bộ.
- Không dùng grep/source-shape để chứng minh mutation gate, migration hay loader.
  Kiểm thử phải quan sát state, response, transaction hoặc artifact thực.
- Mọi JS/MJS mới/sửa phải không tab, không trailing whitespace, không quá 120
  cột. Không tạo baseline/wildcard mới; URL hoặc chuỗi tư liệu duy nhất có thể
  dùng annotation `lint-allow-line` có lý do rõ ràng.

## Chuỗi tích hợp và ownership

Chuỗi bắt buộc là: **foundation Tasks 1–8 → durable scheduler → orbital UI →
modular Tasks 1–5 → CI-integration Tasks 6–7**. Foundation không được tự làm
scheduler durable, UI redesign hay tách module big-bang.

| Interface | Producer | Consumer |
|---|---|---|
| scripts, lockfile exact, engine/dependency policy | Task 1 | CI-integration Task 6 |
| lint/syntax/source manifest/artifact checker | Tasks 2–3 | UI, modular, CI |
| release/history/state contract | Task 4 | API, UI, server, CI |
| clock/logger/re-entrant UoW/no-op bridge | Task 5 | factory, scheduler |
| `taoUngDung({schedulerFactory})` | Task 6 | durable scheduler, integration |
| command-family behavioral harness | Task 7 | durable scheduler |
| `napLuat`, `G`, `THU_TU`, allowlist rỗng | Task 8 | server, core/module work |

CI-integration Task 6 là owner workflow, không phải foundation. Nó phải giữ
chính xác: `quality`, `artifact-and-core`, `server` matrix
`["22.5.x", "24.x"]`; `load` và `ui` dùng `24.x`; mọi job bắt đầu `npm ci`;
job UI sau đó chạy
`npx --no-install playwright install --with-deps chromium`, rồi `npm run test:ui`.
Không hardcode patch Node 24 chưa được xác minh.

---

### Task 1: Khóa công cụ dev và dựng command contract

**Files (owner duy nhất):**

- Modify: `package.json:1-18`
- Create/modify: `package-lock.json`
- Create: `tools/test-package-contract.js`

**Produces:** `engines.node === ">=22.5"`, `dependencies === {}`, exact
dev-only `playwright@1.62.1`, và toàn bộ scripts nêu trong test bên dưới.

- [ ] **Step 1 — RED: tạo contract package/lock exact (2–3 phút).**

  Tạo `tools/test-package-contract.js` với code hoàn chỉnh sau. Các script có
  thể trỏ đến test được tạo ở task sau; test này chỉ kiểm tra object package,
  không chạy chúng.

  ~~~js
  "use strict";
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  const path = require("node:path");
  const pkg = require("../package.json");
  const root = path.join(__dirname, "..");
  const expectedScripts = {
    start: "node server/index.js",
    test: "npm run test:core && npm run test:server && npm run test:scheduler",
    "test:luat": "node tools/smoke.js",
    "test:core": "node tools/smoke.js",
    "test:server": "node tools/test-server.js",
    "test:scheduler": "node --test tools/test-scheduler.js",
    "test:load": "node tools/test-tai.js 60",
    "test:ui": "node tools/test-mp-ui.mjs",
    "check:syntax": "node tools/check-syntax.js",
    lint: "node tools/lint.js",
    "check:version": "node tools/check-version.js",
    build: "node tools/build.js && node tools/build.js --artifact",
    "check:artifact": "node tools/check-artifact.js",
    "test:all": [
      "npm run check:syntax", "npm run lint", "npm run check:version",
      "npm run build", "npm run check:artifact", "npm run test:core",
      "npm run test:server", "npm run test:scheduler", "npm run test:load",
      "npm run test:ui"
    ].join(" && ")
  };
  assert.equal(pkg.engines.node, ">=22.5");
  assert.deepEqual(pkg.dependencies, {});
  assert.deepEqual(pkg.devDependencies, {playwright: "1.62.1"});
  assert.equal(Object.hasOwn(pkg.dependencies, "playwright"), false);
  assert.deepEqual(pkg.scripts, expectedScripts);
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, "package-lock.json"), "utf8")
  );
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[""].dependencies || {}, {});
  assert.deepEqual(lock.packages[""].devDependencies, {playwright: "1.62.1"});
  assert.equal(lock.packages["node_modules/playwright"].version, "1.62.1");
  assert.equal(lock.packages["node_modules/playwright"].dev, true);
  ~~~

  Run: `node tools/test-package-contract.js`.

  Expected RED hiện tại: assertion đầu tiên về `pkg.devDependencies`, sau đó
  file lock thiếu. Đây là RED được giữ lại trong report Task 1, không phải lỗi
  cần lách bằng fixture hoặc lockfile thủ công.

- [ ] **Step 2 — xác minh metadata, pin và ghi script map exact (2 phút khi npm sẵn sàng).**

  `npm install` chỉ có trách nhiệm thêm devDependency và lock; nó **không**
  được giả định đã tạo các command của plan. Run metadata/install trước:

  ~~~bash
  npm view playwright@1.62.1 version engines --json
  npm install --save-dev --save-exact playwright@1.62.1
  ~~~

  Ngay sau install, sửa `package.json` trước bất kỳ `npm ci` hoặc package
  contract nào: thay nguyên object `scripts` bằng **đúng** object
  `expectedScripts` ở Step 1 (không merge aliases cũ, không thêm/mất key), giữ
  `engines.node` là `">=22.5"`, giữ `dependencies` là `{}`, và để
  `devDependencies` đúng `{ "playwright": "1.62.1" }`. Đây là một thay đổi
  implementation có chủ đích trong Task 1, không phải tác dụng phụ của npm.
  Sau khi lưu JSON, run theo đúng thứ tự:

  ~~~bash
  node tools/test-package-contract.js
  npm ci
  node tools/test-package-contract.js
  ~~~

  Chỉ tiếp tục nếu metadata npm trả version `1.62.1` và `engines` tương thích
  Node `>=22.5` (ledger đã xác minh release này khai báo Node `>=20`). Không
  thay version bằng `latest`, range, hoặc một patch tương lai đoán trước; không
  đổi `engines.node`. Khi DNS/cache còn block như trạng thái hiện tại, không
  sửa nửa vời script/lock và giữ RED đã ghi ở Step 1 cho tới lần chạy lại này.

- [ ] **Step 3 — GREEN và regression tối thiểu (2 phút).**

  Expected GREEN: `npm ci` tạo install khớp lock, test chứng minh root không có
  runtime dependency và entry `node_modules/playwright` là dev-only exact.
  Sau đó chạy `node tools/smoke.js`. `npm test` được phép chưa chạy ở đầu chuỗi
  lịch sử vì `tools/test-scheduler.js` chỉ được tạo Task 7; không coi điều đó là
  Task-1 failure.

- [ ] **Step 4 — commit intent (2 phút).**

  ~~~bash
  git add package.json package-lock.json tools/test-package-contract.js
  git commit -m "build: pin playwright and declare quality commands"
  ~~~

  Nếu `.git/index` read-only, chụp scoped diff/snapshot và ghi intent, không
  stage plan hay source khác. Hiện tại task vẫn BLOCKED, không có commit.

### Task 2: Syntax/lint, cấm thực thi động và reflow source

**Files (snapshot Task 2 + reopen hẹp):**

- Create: `tools/check-syntax.js`, `tools/lint.js`, `tools/test-quality-gate.js`
- Modify/reflow: `js/actions.js`, `js/app.js`, `js/combat.js`, `js/data.js`,
  `js/engine.js`, `js/fleet.js`, `js/galaxy.js`, `js/main.js`, `js/ui.js`,
  `js/util.js`, `server/db.js`, `server/world.js`, `tools/build.js`,
  `tools/smoke.js`, `tools/test-mp-ui.mjs`, `tools/test-server.js`,
  `tools/test-tai.js`, `web/js/mp.js`, và `tools/test-package-contract.js` nếu
  Task 1 đã tạo line dài trước khi Task 2 chạy.

**Produces:** `lintText`, `checkFile`, `checkTree`, `listSourceFiles`, `main`,
và allowlist chuyển tiếp chính xác `server/rules.js`, `tools/smoke.js`. Task 8
đưa allowlist về rỗng.

- [x] **Step 1 — RED behavioral fixtures và CLI fallback hẹp (đã thực hiện).**

  `tools/test-quality-gate.js` tạo text cấm tại runtime để nó không tự bị quét,
  và gọi cả `checkFile` lẫn `checkTree`. Phần cốt lõi phải giữ đúng như sau:

  ~~~js
  function callText(parts) { return parts.join(""); }
  const forbiddenSources = [
    callText(["e", "val", "(", "\"1\"", ")"]),
    callText(["Fun", "ction", "(", "\"return 1\"", ")"]),
    callText(["im", "port", "(", "\"x\"", ")"]),
    callText(["node", ":", "vm"])
  ];
  const badTree = fixtureTree("nested/bad.mjs", "\tconst bad = true;");
  expectFailure(() => checkTree(badTree.root, {rootDir: badTree.root}), "no-tab");
  const cliFixture = path.join(__dirname, "__lint_cli_fixture__.js");
  fs.writeFileSync(cliFixture, forbiddenSources[1]);
  try {
    const cli = spawnSync(process.execPath, [path.join(__dirname, "lint.js")], {
      encoding: "utf8"
    });
    if (cli.error && cli.error.code === "EPERM") {
      let diagnostic = "";
      const status = main({
        files: [cliFixture],
        stderr: {write: text => { diagnostic += text; }}
      });
      assert.equal(status, 1);
      assert.equal(
        diagnostic,
        "tools/__lint_cli_fixture__.js:1 forbidden dynamic execution\n"
      );
    } else {
      assert.equal(cli.error, undefined);
      assert.notEqual(cli.status, 0);
      assert.match(cli.stderr, /forbidden dynamic execution/);
    }
  } finally {
    fs.rmSync(cliFixture, {force: true});
  }
  ~~~

  Mọi helper (`fixtureTree`, `expectFailure`, `main`) được khai báo trước block
  này trong test. Fallback chỉ cho đúng `EPERM`; mọi lỗi spawn khác phải làm test
  fail. Không dùng `vm`, `eval`, `Function` hoặc dynamic import làm fallback.

- [x] **Step 2 — implement checker/cổng ban đầu (đã thực hiện).**

  `tools/lint.js` duyệt chính xác `js`, `server`, `tools`, `web/js`; `checkTree`
  gom mọi lỗi từ một tree fixture; `main()` trả `1` và ghi `path:line rule` khi
  có lỗi. Bản snapshot ban đầu của `tools/check-syntax.js` chạy `node --check`
  cho từng file source, nhưng Step 6 phải thay nó để error từ `spawnSync` cũng
  là một failure có chẩn đoán:

  ~~~js
  const {spawnSync} = require("node:child_process");
  const {listSourceFiles} = require("./lint.js");
  let failed = false;
  for (const file of listSourceFiles()) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8"
    });
    if (result.status !== 0) {
      failed = true;
      process.stderr.write(file + "\n" + (result.stderr || ""));
    }
  }
  if (failed) process.exitCode = 1;
  ~~~

  Allowlist ban đầu là đúng `new Set(["server/rules.js", "tools/smoke.js"])`;
  không có baseline/wildcard. `tools/test-mp-ui.mjs` chuyển từ loader động sang
  static dev-only `import {chromium} from "playwright";`. Điều này làm cổng
  lexical đúng ngay cả khi UI chưa chạy vì Task 1 bị chặn.

- [x] **Step 3 — reflow bounded, không che nợ cũ (đã thực hiện).**

  Inventory gốc là 258 dòng vượt 120 trong 18 file liệt kê ở report Task 2.
  Nếu Task 1 đã tạo `tools/test-package-contract.js`, đo lại trước RED và đưa
  file đó vào scope reflow. Reflow cơ học toàn bộ inventory đo được; giữ nguyên
  string/order/behavior; final count phải bằng 0, không thêm annotation blanket.

- [x] **Step 4 — evidence source-only ban đầu (đã thực hiện).**

  Các command direct đã pass theo thứ tự tuần tự (tránh race fixture tạm):

  ~~~bash
  node tools/test-quality-gate.js
  node tools/lint.js
  node tools/check-syntax.js
  for f in $(rg --files js server tools web/js -g '*.js' -g '*.mjs'); do node --check "$f"; done
  node tools/smoke.js
  node tools/test-tai.js 60
  git diff --check -- js server tools web/js
  ~~~

  Đây là evidence trước reopen. Expected khi đó: lint/syntax pass, smoke
  `201/201`, load `73/73`, scoped diff sạch.
  `tools/test-server.js` dừng trước assertion với `listen EPERM` và UI không
  chạy vì Playwright chưa cài; cả hai không được ghi là GREEN. Sau Task 1, chạy
  `npm run check:syntax && npm run lint` và `npm run test:ui` để hòa script.

- [x] **Step 5 — commit intent đã ghi.**

  Scoped command là:

  ~~~bash
  git add tools/check-syntax.js tools/lint.js tools/test-quality-gate.js js/actions.js \
    js/app.js js/combat.js js/data.js js/engine.js js/fleet.js js/galaxy.js \
    js/main.js js/ui.js js/util.js server/db.js server/world.js tools/build.js \
    tools/smoke.js tools/test-mp-ui.mjs tools/test-server.js tools/test-tai.js \
    web/js/mp.js
  git commit -m "test: add syntax lint and dynamic execution gate"
  ~~~

  Nếu preflight đo `tools/test-package-contract.js` là line dài, Task 2 chỉ
  reflow nó rồi để lại cho **Task 1** stage/commit owner; không kéo package/lock
  vào Task 2. Git index read-only nên không có commit; snapshot `after-task-2`
  là baseline.

- [ ] **Step 6 — REOPEN RED/GREEN: child syntax error phải có file/code (2–3 phút).**

  Tạo trước assertion mới trong `tools/test-quality-gate.js`, sau mọi helper
  fixture hiện hữu. RED hiện tại là thật: `require("./check-syntax.js")` chưa
  export `checkFiles`, nên assertion gọi hàm thất bại trước khi implementation
  mới được viết. Không spawn child cho RED này và không dùng fallback lint.

  ~~~js
  const syntax = require("./check-syntax.js");
  let syntaxDiagnostic = "";
  const spawnFailure = new Error("permission denied by fixture");
  spawnFailure.code = "EPERM";
  const syntaxExit = syntax.checkFiles(["js/fixture.js"], {
    spawnSync: function () {
      return {status: null, stderr: "", error: spawnFailure};
    },
    stderr: {
      write: function (text) { syntaxDiagnostic += text; }
    }
  });
  assert.equal(syntaxExit, 1);
  assert.equal(
    syntaxDiagnostic,
    "js/fixture.js: syntax-check spawn EPERM: permission denied by fixture\n"
  );
  ~~~

  Sau RED, thay `tools/check-syntax.js` bằng module/CLI hoàn chỉnh dưới. Mọi
  helper được khai báo trước `main`; `result.error` luôn thắng `status`, nên
  process spawn lỗi không thể bị coi là syntax pass. Đây không phải fallback:
  production CLI chỉ ghi file/code và trả `1`.

  ~~~js
  "use strict";
  const {spawnSync} = require("node:child_process");
  const {listSourceFiles} = require("./lint.js");

  function writeSpawnError(stderr, file, error) {
    const code = String((error && (error.code || error.name)) || "UNKNOWN");
    const message = String((error && error.message) || "unknown spawn failure");
    stderr.write(file + ": syntax-check spawn " + code + ": " + message + "\n");
  }

  function checkFiles(files, dependencies) {
    const deps = dependencies || {};
    const run = deps.spawnSync || spawnSync;
    const stderr = deps.stderr || process.stderr;
    let failed = false;
    for (const file of files) {
      const result = run(process.execPath, ["--check", file], {encoding: "utf8"});
      if (result.error) {
        failed = true;
        writeSpawnError(stderr, file, result.error);
      } else if (result.status !== 0) {
        failed = true;
        stderr.write(file + "\n" + (result.stderr || ""));
      }
    }
    return failed ? 1 : 0;
  }

  function main(dependencies) {
    const deps = dependencies || {};
    return checkFiles(deps.files || listSourceFiles(), deps);
  }

  if (require.main === module) process.exitCode = main();
  module.exports = {checkFiles, main};
  ~~~

  `EPERM` fallback vẫn chỉ tồn tại ở block CLI lint của Step 1 trong
  `tools/test-quality-gate.js`; test syntax ở đây inject `spawnSync` để chứng
  minh diagnostic, không chạy `lint.main()` và production checker không có
  nhánh fallback nào. Re-run evidence tuần tự, ghi rõ result mới thay snapshot
  Task 2 cũ: trên host CI `node tools/check-syntax.js` phải pass; nếu sandbox
  trả `EPERM`, nó phải exit `1` với file/code và outer-shell loop bên dưới là
  evidence syntax riêng, không được gọi checker GREEN.

  ~~~bash
  node tools/test-quality-gate.js
  node tools/lint.js
  node tools/check-syntax.js
  for f in $(rg --files js server tools web/js -g '*.js' -g '*.mjs'); do node --check "$f"; done
  node tools/smoke.js
  node tools/test-tai.js 60
  git diff --check -- tools/check-syntax.js tools/test-quality-gate.js
  ~~~

  Expected normal host: tất cả pass, smoke `201/201`, load `73/73`; expected
  restricted sandbox: only spawn-based checker is environment-blocked as just
  diagnosed, never silently green. Lưu snapshot evidence reopen tách khỏi
  `after-task-2`.

- [ ] **Step 7 — commit follow-up reopen (2 phút).**

  ~~~bash
  git add tools/check-syntax.js tools/test-quality-gate.js
  git commit -m "test: diagnose syntax checker spawn failures"
  ~~~

  Commit này là follow-up có thứ tự sau snapshot Task 2 và trước Task 3/4
  consumers; nếu index read-only, lưu scoped snapshot/diff mới. Không stage
  package/lock hoặc file Task 1.

### Task 3: Manifest canonical và checker artifact closed-world

**Files (snapshot Task 3):**

- Create: `tools/source-manifest.js`, `tools/check-artifact.js`,
  `tools/test-artifact.js`
- Modify: `tools/build.js`
- Modify/generated: `dist/thien-ha-dai-chien.html`, `dist/artifact.html`
- Verify-only (không rewrite no-op): `index.html`, `web/index.html`

**Produces:**
`{browserStyles,browserScripts,mpScripts,rulesScripts,artifactOutputs,
styleContents,styleHashes,scriptContents,scriptHashes}` và checker exports
`checkArtifactText`, `checkArtifacts`, `checkStaticShells`.

- [x] **Step 1 — RED artifact/unit matrix (đã thực hiện).**

  Test tạo manifest nhỏ, CSS/script bytes thật, solo bundle và artifact bundle
  với bootstrap duy nhất `window.THDC_ARTIFACT=true`. Nó yêu cầu checker reject
  closed-world table sau; mỗi hàng là một mutation độc lập và expected là throw:

  | Nhóm | Mutation bắt buộc reject |
  |---|---|
  | executable | script inline không marker trước/sau bundle; bytes trước marker đầu/cuối marker; extra bootstrap/script |
  | style/script order | style extra, duplicate style canonical, style đảo; source duplicate/đảo/đổi bytes/hash |
  | marker | malformed/fake marker, marker hash sai, marker source dư |
  | tag syntax | `SCRIPT`/`LINK` uppercase, khoảng trắng quanh attribute, runtime `src`/stylesheet `href` |
  | path | `file:`, `/Users`, `/home`, `/tmp`, `C:/`, `C:\\`, `localhost`, `127.0.0.1`, `[::1]` |
  | artifact mode | bootstrap ở solo, bootstrap đổi bytes, bootstrap đặt sau bundle |

  Test static shell assert array script/style exact của `index.html` và
  `web/index.html`, bao gồm `rulesScripts` export. HTTPS documentation anchor
  không bị reject: checker chỉ xét runtime asset `script src` và stylesheet
  `link`, không cấm mọi `href`.

- [x] **Step 2 — build/checker implementation (đã thực hiện).**

  `tools/build.js` lấy output/order duy nhất từ manifest. Khi inline CSS/JS,
  callback replacement bắt buộc để literal `$'` trong source không bị
  `String.replace` diễn dịch:

  ~~~js
  function replaceExact(html, tag, bytes) {
    return html.replace(tag, () => bytes);
  }
  ~~~

  Checker xây exact expected style blocks từ `browserStyles`, exact source bundle
  từ `browserScripts`, parse toàn bộ paired `style`/`script` blocks, và so sánh
  *toàn bộ mảng theo thứ tự* cùng `markerLikeLines`. Solo chỉ có canonical bundle;
  `dist/artifact.html` chỉ có canonical bootstrap ngay trước bundle. Một block
  không marker, marker giả, byte thừa, duplicate hoặc reorder làm mảng khác và
  throw. Không dùng `includes` hay substring proof.

- [x] **Step 3 — GREEN deterministic và ownership dist (đã thực hiện).**

  ~~~bash
  artifact_snapshot="$(mktemp -d)"
  node tools/build.js
  node tools/build.js --artifact
  node tools/test-artifact.js
  node tools/check-artifact.js
  cp dist/thien-ha-dai-chien.html dist/artifact.html "$artifact_snapshot/"
  node tools/build.js
  node tools/build.js --artifact
  cmp -s "$artifact_snapshot/thien-ha-dai-chien.html" dist/thien-ha-dai-chien.html
  cmp -s "$artifact_snapshot/artifact.html" dist/artifact.html
  ~~~

  Hai `cmp` phải pass. Trong workspace index read-only, generated `dist` diff là
  output expected và không phải GREEN gate; sau khi baseline dist được commit,
  CI-integration dùng `git diff --exit-code -- dist/thien-ha-dai-chien.html
  dist/artifact.html`.

- [x] **Step 4 — source-only evidence/commit intent.**

  23/23 mutation đã bị reject. Report Task 3 ghi hash baseline; Task 4 sau đó
  tái build browser bytes và là owner hash mới. Intent:

  ~~~bash
  git add tools/source-manifest.js tools/check-artifact.js tools/test-artifact.js \
    tools/build.js dist/thien-ha-dai-chien.html dist/artifact.html
  git commit -m "build: make source manifest and artifacts reproducible"
  ~~~

  Snapshot là `after-task-3` do Git index read-only. Shell HTML đã pass verify
  but không bị rewrite/stage nếu bytes không đổi.

### Task 4: Hợp đồng release, nhãn lịch sử và schema migration

**Files (snapshot Task 4 + reopen hẹp):**

- Create: `tools/check-version.js`, `tools/test-version-contract.js`
- Modify: `js/data.js`, `js/engine.js`, `js/main.js`, `js/ui.js`,
  `web/js/mp.js`, `server/api.js`, `server/index.js`, `README.md`
- Modify/generated: `dist/thien-ha-dai-chien.html`, `dist/artifact.html`

**Không thuộc task này:** `package.json`/lock (Task 1 owner) và factory/world
(Tasks 5–6 owner).

- [x] **Step 1 — RED observable contract ban đầu (đã thực hiện).**

  `tools/test-version-contract.js` bắt đầu bằng imports `assert`, `pkg`, `G`,
  `API`, `Kho`, `TheGioi`; sau đó khai báo helper trước khi dùng. Nó kiểm
  migration thực, API additive và SQLite bootstrap. Mẫu assertion trọng tâm
  của snapshot ban đầu là:

  ~~~js
  function oldV3State() {
    const state = G.moiGame("Cựu Chỉ Huy", "VERSION-OLD");
    state.v = 3;
    delete state.moHinhCT;
    delete state.moHinhNhip;
    delete state.moHinhQuyDao;
    return state;
  }
  assert.equal(G.PHIEN_BAN_LICH_SU, "1.35b-r2");
  assert.equal(G.VERSION, G.PHIEN_BAN_LICH_SU);
  assert.equal(pkg.version, "1.36.0");
  const before = JSON.stringify(oldV3State());
  const state = JSON.parse(before);
  G.nangCapState(state, 1700000000);
  assert.equal(state.v, G.STATE_VERSION);
  assert.equal(state.moHinhCT, "so-luong-v1");
  assert.equal(state.moHinhNhip, "bao-tri-dan-su-v1");
  assert.equal(state.moHinhQuyDao, "giu-quy-dao-v1");
  const migrated = JSON.stringify(state);
  G.nangCapState(state, 1700000000);
  assert.equal(JSON.stringify(state), migrated);
  assert.throws(() => G.nangCapState({v: G.STATE_VERSION + 1}), /mới hơn engine/);
  ~~~

  Test khởi động `Kho(tempDb)`/`TheGioi`, gọi migration, và assert
  `kho.cauhinh("stateVersion") === String(G.STATE_VERSION)`.

- [x] **Step 2 — implementation additive ban đầu (đã thực hiện).**

  `js/data.js` phải dùng property immutable, không assignment writable:

  ~~~js
  G.PHIEN_BAN_LICH_SU = "1.35b-r2";
  Object.defineProperty(G, "VERSION", {
    value: G.PHIEN_BAN_LICH_SU,
    enumerable: true,
    writable: false,
    configurable: false
  });
  ~~~

  `API.thongTin()` giữ các field legacy `seed`, `soNguoi`, `soHT`, `tocDo`,
  `tocDoBay`, `chuKy`, `now` và *thêm* bốn field `releaseVersion`,
  `phienBanLichSu`, `stateVersion`, `phienBan`; test assert subset để future
  additive field không bị cấm. Consumer nội bộ hiển thị canonical history name,
  còn `G.VERSION`/`phienBan` giữ tương thích một release.

- [x] **Step 3 — version/artifact GREEN ban đầu (đã thực hiện).**

  ~~~bash
  node tools/test-version-contract.js
  node tools/check-version.js
  version_artifacts="$(mktemp -d)"
  node tools/build.js
  node tools/build.js --artifact
  node tools/check-artifact.js
  cp dist/thien-ha-dai-chien.html dist/artifact.html "$version_artifacts/"
  node tools/build.js
  node tools/build.js --artifact
  cmp -s "$version_artifacts/thien-ha-dai-chien.html" dist/thien-ha-dai-chien.html
  cmp -s "$version_artifacts/artifact.html" dist/artifact.html
  sha256sum dist/thien-ha-dai-chien.html dist/artifact.html
  ~~~

  Hai build/cmp deterministic và checker phải pass. Hash hiện hành sau browser
  change là lần lượt
  `81cc91559c43828a323c786618319a56a07cbc5f7cab740b9ad6820f55d2dfb4` và
  `5681d60b5ebd1e149f9c1fabd3d9d67633f3a1c2d11cb6d59967ec3decc5fdbc`.

- [x] **Step 4 — commit intent/source-only evidence ban đầu.**

  Commit gồm *cả hai* artifact:

  ~~~bash
  git add js/data.js js/engine.js js/main.js js/ui.js web/js/mp.js server/api.js \
    server/index.js README.md tools/check-version.js tools/test-version-contract.js \
    dist/thien-ha-dai-chien.html dist/artifact.html
  git commit -m "feat: define canonical release version contract"
  ~~~

  Snapshot `after-task-4` thay commit do index read-only; server bind vẫn
  environment-blocked.

- [ ] **Step 5 — REOPEN baseline verification: descriptor immutable và reload live (2–3 phút).**

  Đây là characterisation, không phải RED giả. Controller đã chạy probe thật
  trên snapshot Task 4: descriptor là immutable đầy đủ và hai lần xóa cache/
  `require("../server/rules.js")` trả cùng `G` mà không ném. ECMAScript cho phép
  define lại property non-configurable khi descriptor mới không khác descriptor
  cũ, nên expectation `Cannot redefine property` là sai với product hiện hữu.
  Ghi assertion executable này vào `tools/test-version-contract.js`; nó phải
  **GREEN ngay trên baseline**, rồi được giữ như regression. Khai báo helper
  trước khi gọi nó:

  ~~~js
  function versionDescriptor(value) {
    return {
      value: value.value,
      enumerable: value.enumerable,
      writable: value.writable,
      configurable: value.configurable
    };
  }

  function reloadRules() {
    const rulesPath = require.resolve("../server/rules.js");
    delete require.cache[rulesPath];
    return require("../server/rules.js");
  }

  const descriptor = Object.getOwnPropertyDescriptor(G, "VERSION");
  assert.deepEqual(versionDescriptor(descriptor), {
    value: G.PHIEN_BAN_LICH_SU,
    enumerable: true,
    writable: false,
    configurable: false
  });
  assert.equal(Reflect.set(G, "VERSION", "tampered"), false);
  assert.equal(G.VERSION, G.PHIEN_BAN_LICH_SU);
  const firstReload = reloadRules();
  const secondReload = reloadRules();
  assert.strictEqual(firstReload.G, secondReload.G);
  assert.deepEqual(
    versionDescriptor(Object.getOwnPropertyDescriptor(secondReload.G, "VERSION")),
    versionDescriptor(descriptor)
  );
  ~~~

  Không sửa `js/data.js`, browser source, hay artifact cho baseline này. Một
  guard `VERSION_ALIAS_CONFLICT` chỉ để làm một RED tưởng tượng pass là thay đổi
  không có yêu cầu sản phẩm và bị cấm. Re-run direct contract/gate; source Task
  4 đã có evidence thật trong report và ledger, còn assertion mới bảo vệ reload
  cache trong tương lai:

  ~~~bash
  node tools/test-version-contract.js
  node tools/check-version.js
  git diff --check -- tools/test-version-contract.js
  ~~~

  Follow-up Files của Step 5 chỉ là `tools/test-version-contract.js`. Task 7
  sau đó được phép sửa fixture constructor/options trong file này để theo API
  injection mới; nó phải giữ nguyên assertions descriptor/reload này. Browser
  artifacts vẫn là hash Task 4 bởi không có browser input nào đổi.

- [ ] **Step 6 — commit follow-up reopen (2 phút).**

  ~~~bash
  git add tools/test-version-contract.js
  git commit -m "test: characterize immutable version alias reload"
  ~~~

  Đây là commit test-only nối tiếp snapshot Task 4; index read-only dùng scoped
  snapshot thay thế. Không bao gồm `package.json`, lock, source browser, artifact,
  hay API factory change Task 6/7.

### Task 5: Clock, logger, UoW re-entrant và bridge foundation

**Files (đúng sáu path snapshot Task 5):**

- Create: `server/clock.js`, `server/logger.js`,
  `server/scheduler/contract.js`, `tools/test-uow.js`
- Modify: `server/db.js`, `tools/test-server.js`

`tools/test-server.js` chỉ có đúng hai fixture `new KhoLuat(":memory:")`; cả
hai phải truyền `{allowMemoryDb: true}`. Không thêm bypass production.

- [x] **Step 1 — RED adversarial UoW (đã thực hiện).**

  `tools/test-uow.js` dùng SQLite thực và recorder SQL/transaction. Các case
  bắt buộc, đều chạy trước implementation tương ứng:

  | Case | Bằng chứng GREEN |
  |---|---|
  | nested normal/immediate | chỉ outer `BEGIN`/`BEGIN IMMEDIATE`, một commit |
  | nested ordinary failure bị outer catch | failure đầu tiên còn identity tới depth 0; nested và write sau catch đều rollback |
  | Promise và malformed thenable | `Promise.resolve()` cho typed `UNIT_OF_WORK_ASYNC`; object có getter `then` ném lỗi giữ chính identity; cả hai rollback và UoW mới vẫn commit được |
  | bridge failure | `runCommand` gọi closure đúng một lần, giữ identity/code, outer UoW rollback |
  | rollback observer throws | không thay original failure |
  | post-COMMIT observer throws | row còn durable, event SQL chỉ `BEGIN`, `COMMIT`, không rollback |
  | direct memory/open/reopen | constructor từ chối memory không opt-in; file DB reopen giữ dữ liệu |

- [x] **Step 2 — implement seams (đã thực hiện).**

  `taoClock({nowMs = Date.now})` là adapter production duy nhất cho wall clock.
  `taoLogger` yêu cầu `{event:string, at:number}` và recursive redact
  `password`, `mk`, `salt`, `muoi`, `token`, `body`, `state` mà không mutate
  input. `Kho.prototype.giaoDich === Kho.prototype.trongGiaoDich` giữ identity.

  UoW depth 0 giữ `transactionRollbackOnly` và `transactionFailure`; nested
  throw lưu **failure đầu tiên** ngay cả khi outer callback bắt nó. Depth 0
  rethrow đúng object sau một rollback, reset toàn bộ state ở `finally`; callback
  returning thenable callable bị Kho, không phải bridge, biến thành typed
  `UNIT_OF_WORK_ASYNC`; lỗi khi đọc getter `then` đi qua cùng rollback boundary
  và giữ identity gốc. Commit observer chạy sau `COMMIT`, ngoài rollback catch.

  `server/scheduler/contract.js::taoScheduler(context)` trả đúng tám method
  `start`, `stop`, `getStatus`, `runCommand`, `schedule`, `cancel`,
  `reconcile`, `advanceTo`. `runCommand` validate command và gọi một outer
  `kho.trongGiaoDich(command.run,{immediate:true})`; không có thenable guard
  thứ hai. No-op foundation trả trực tiếp kết quả sync này; scheduler durable có
  thể bọc result trong Promise, còn `command.run` luôn phải sync.

- [x] **Step 3 — source-only evidence/commit intent.**

  ~~~bash
  node tools/test-uow.js
  node tools/test-quality-gate.js
  node tools/lint.js
  node tools/check-syntax.js
  node tools/check-version.js
  node tools/test-artifact.js
  node tools/smoke.js
  node tools/test-tai.js 60
  ~~~

  Direct gates pass; server bind remains `EPERM` trước assertion. Scoped command:

  ~~~bash
  git add server/db.js server/clock.js server/logger.js server/scheduler/contract.js \
    tools/test-uow.js tools/test-server.js
  git commit -m "refactor: add clock logger and reentrant unit of work"
  ~~~

  Baseline là `after-task-5` because index vẫn read-only.

### Task 6: Factory server, env local và lifecycle quan sát được

**Files:**

- Create: `server/app.js`, `tools/test-server-factory.js`,
  `tools/test-server-entrypoint.js`
- Modify: `server/index.js`, `server/db.js`, `server/api.js`, `server/world.js`,
  `js/engine.js`
- Modify/generated: `dist/thien-ha-dai-chien.html`, `dist/artifact.html`

**Consumes:** Task-5 clock/logger/Kho/no-op `taoScheduler(context)`.

**Produces:**
`taoUngDung(options) -> {server,kho,tg,api,scheduler,start,stop,nhip,donRac,getStatus}`.
Factory exposes `app.scheduler` only, never a writer or raw scheduler store.

- [ ] **Step 1 — RED factory and deterministic lifecycle tests (3–5 phút).**

  In `tools/test-server-factory.js`, import trước helpers: `assert` từ
  `node:assert/strict`, `{test}` từ `node:test`, `fs` từ `node:fs`, `path` từ
  `node:path`, HTTP/request helpers, `taoUngDung`, `G`, `TheGioi`, và
  `taoLogger`. Khai báo helper **trước mọi `test`** theo thứ tự `tempDir`,
  `tempDb`, `removeDb`,
  `fakeClock`, `silentLogger`, `captureConsoleSink`,
  `readyStatus`, `taoDeferred`, `taoTimersGia`, `request`, `snapshot`,
  `recordingSchedulerFactory`, `taoApp`. Dùng `port: 0`, DB temp, fake clock
  `1700000000000`; mọi fixture có `finally` gọi `await app.stop()` rồi xóa temp
  dir. Không dùng default port hay `process.env` global trong fixture.

  RED đầu tiên là resolver table-driven. Export test-only
  `resolveFoundationOptions(options, env)` từ `server/app.js`; nó không mở DB
  hay listener. Bảng này là contract exact, gồm priority lẫn conflict: một
  source đứng trước thắng giá trị khác ở sau; source được chọn phải hợp lệ,
  source bị che không bị parse/ngầm thay default.

  ~~~js
  const pollCases = [
    ["canonical option", {schedulerPollMs: 800}, {}, 800, []],
    ["legacy option", {tickMs: 801}, {}, 801, ["tickMs"]],
    ["canonical environment", {}, {SCHEDULER_POLL_MS: "802"}, 802, []],
    ["legacy environment", {}, {THDC_NHIP: "803"}, 803, ["THDC_NHIP"]],
    ["default", {}, {}, 1000, []],
    [
      "canonical option wins conflicting aliases",
      {schedulerPollMs: 804, tickMs: 805},
      {SCHEDULER_POLL_MS: "806", THDC_NHIP: "807"},
      804,
      []
    ],
    [
      "canonical environment wins legacy environment",
      {},
      {SCHEDULER_POLL_MS: "808", THDC_NHIP: "809"},
      808,
      []
    ],
    [
      "selected canonical option hides invalid legacy environment",
      {schedulerPollMs: 810},
      {THDC_NHIP: "invalid"},
      810,
      []
    ]
  ];
  pollCases.forEach(function (entry) {
    const resolved = resolveFoundationOptions(entry[1], entry[2]);
    assert.equal(resolved.schedulerPollMs, entry[3], entry[0]);
    assert.deepEqual(resolved.deprecatedAliases, entry[4], entry[0]);
  });

  const logCases = [
    ["canonical option", {schedulerLogTicks: false}, {THDC_AM: "1"}, false, []],
    ["canonical env", {}, {SCHEDULER_LOG_TICKS: "0", THDC_AM: "1"}, false, []],
    ["legacy env", {}, {THDC_AM: "1"}, true, ["THDC_AM"]],
    ["default", {}, {}, false, []]
  ];
  logCases.forEach(function (entry) {
    const resolved = resolveFoundationOptions(entry[1], entry[2]);
    assert.equal(resolved.schedulerLogTicks, entry[3], entry[0]);
    assert.deepEqual(resolved.deprecatedAliases, entry[4], entry[0]);
  });
  assert.equal(resolveFoundationOptions({schedulerLogTicks: true}, {}).schedulerLogTicks, true);
  assert.equal(resolveFoundationOptions({}, {}).cleanupMs, 3600000);
  assert.equal(resolveFoundationOptions({cleanupMs: 60000}, {}).cleanupMs, 60000);
  assert.throws(function () {
    resolveFoundationOptions({schedulerPollMs: 99}, {});
  }, /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({tickMs: 100.5}, {});
  }, /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({}, {SCHEDULER_POLL_MS: "800ms"});
  }, /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({}, {THDC_NHIP: "invalid"});
  }, /SCHEDULER_POLL_MS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({schedulerLogTicks: "true"}, {});
  }, /SCHEDULER_LOG_TICKS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({}, {SCHEDULER_LOG_TICKS: "true"});
  }, /SCHEDULER_LOG_TICKS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({}, {THDC_AM: "yes"});
  }, /SCHEDULER_LOG_TICKS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({cleanupMs: 0}, {});
  }, /CLEANUP_MS_INVALID/);
  assert.throws(function () {
    resolveFoundationOptions({cleanupMs: "60000"}, {});
  }, /CLEANUP_MS_INVALID/);

  function captureConsoleSink(records) {
    function record(level) {
      return function (info) { records.push({level: level, info: info}); };
    }
    return {
      debug: record("debug"),
      info: record("info"),
      warn: record("warn"),
      error: record("error")
    };
  }

  function readyStatus() { return {state: "ready", ready: true}; }

  async function assertDeprecatedAliasWarnings() {
    const cases = [
      ["legacy-option", {tickMs: 800}, {}, ["tickMs"]],
      ["legacy-poll-env", {}, {THDC_NHIP: "801"}, ["THDC_NHIP"]],
      ["legacy-log-env", {}, {THDC_AM: "1"}, ["THDC_AM"]]
    ];
    for (const entry of cases) {
      const aliasEvents = [];
      const aliasDirectory = tempDir("alias-" + entry[0]);
      let aliasApp = null;
      try {
        aliasApp = taoUngDung(Object.assign({}, entry[1], {
          clock: fakeClock(1700000000000),
          dbPath: path.join(aliasDirectory, "game.sqlite"),
          env: Object.assign({TOP_SECRET: "khong-duoc-log"}, entry[2]),
          logger: taoLogger(captureConsoleSink(aliasEvents)),
          schedulerFactory: function () {
            return {
              start: async function () {},
              stop: async function () {},
              getStatus: readyStatus,
              runCommand: function (command) { return command.run(); },
              schedule: function () {},
              cancel: function () {},
              reconcile: function () {},
              advanceTo: function () {}
            };
          }
        }));
        const warnings = aliasEvents.filter(function (entry0) {
          return entry0.info.event === "server.config.deprecated_alias";
        }).map(function (entry0) {
          return {
            level: entry0.level,
            event: entry0.info.event,
            at: entry0.info.at,
            alias: entry0.info.alias
          };
        });
        assert.deepEqual(warnings, entry[3].map(function (alias) {
          return {
            level: "warn",
            event: "server.config.deprecated_alias",
            at: 1700000000000,
            alias: alias
          };
        }));
        assert.doesNotMatch(JSON.stringify(aliasEvents), /khong-duoc-log/);
      } finally {
        if (aliasApp) await aliasApp.stop();
        fs.rmSync(aliasDirectory, {recursive: true, force: true});
      }
    }
  }
  test("deprecated alias warning is scrubbed and exactly once", async function () {
    await assertDeprecatedAliasWarnings();
  });
  ~~~

  `taoLogger()` mặc định dùng chính `console`, vì vậy mọi capture test truyền
  console-shaped sink có đủ `debug`, `info`, `warn`, `error`; không truyền một
  function như sink. `schedulerPollMs`/`tickMs` là integer number 100–10000;
  env poll là chuỗi base-10 nguyên trong cùng range. `schedulerLogTicks` option
  là boolean; hai env log chỉ nhận `"0"`/`"1"`; `cleanupMs` là positive safe
  integer option, default `3600000`. Vì priority ở bảng đã giải quyết conflict,
  không có fallback im lặng từ source được chọn nhưng lỗi. `tickMs`, `THDC_NHIP`,
  và `THDC_AM` chỉ thêm tên alias vào `deprecatedAliases` khi chính chúng thắng;
  factory emit đúng một warning redactable/không-value cho mỗi tên đó, không log
  `env`, DB path, hay secret. Đây giữ `THDC_NHIP:"7"` invalid và default poll
  `1000` như contract durable.

  Factory fake phải ghi context/counter/order, không monkey-patch closure nội
  bộ của app, scheduler hay Kho:

  ~~~js
  function recordingSchedulerFactory(order, status, startFailure) {
    return function makeScheduler(context) {
      let starts = 0;
      let stops = 0;
      return {
        start: async function () {
          starts++;
          order.push("scheduler.start");
          if (startFailure) throw startFailure;
        },
        stop: async function () {
          if (starts) stops++;
          order.push("scheduler.stop");
        },
        getStatus: function () { return status(); },
        runCommand: function (command) { return command.run(); },
        schedule: function () {},
        cancel: function () {},
        reconcile: function () {},
        advanceTo: function () {},
        counters: function () {
          return {starts: starts, stops: stops, context: context};
        }
      };
    };
  }
  ~~~

  Assert exact nested context (không scalar duplicate):

  ~~~js
  assert.deepEqual(app.scheduler.counters().context.schedulerOptions, {
    schedulerPollMs: 800,
    schedulerLogTicks: true,
    cleanupMs: 3600000
  });
  assert.deepEqual(
    Object.keys(app.scheduler.counters().context).sort(),
    ["clock", "env", "kho", "logger", "schedulerOptions", "tg"]
  );
  ~~~

  Test config dùng `env` riêng `{PORT:"0",THDC_DB:dbPath,THDC_NHIP:"800",
  THDC_AM:"1",THDC_PROXY:"1",THDC_GIOI_HAN:"9",THDC_GIOI_HAN_DN:"3"}`;
  assert API tin proxy/limit từ **instance env** này, còn instance thứ hai với
  env khác không đổi instance đầu. `options.dbPath` thắng `env.THDC_DB`; nếu
  cả hai vắng dùng `rootDir/server/data/thdc.db`; `:memory:` cần opt-in.

  RED fake-clock phải đi đến state account thật, không chỉ response clock.
  Trong fixture có `fakeClock(1700000123000)`, gọi direct compatibility
  `G.moiGame("Clock", "CLOCK-SEED", undefined, 1700000123)` rồi assert
  `now`, `t0`, `lastTick` đều là `1700000123`. Sau đó tạo `taoUngDung` cùng
  fake clock, gọi đường server `app.tg.taoDeQuoc(accountId, "Clock")`, đọc JSON
  `dq.state` từ SQLite thực và assert ba field persisted cũng đúng
  `1700000123`; đây là account-state initialization qua `TheGioi`, không mock
  `G.moiGame`. Test giữ browser legacy ba tham số bằng một call riêng không
  override và chỉ assert type/shape để không ép solo dùng server clock.

  Đặt explicit seams trên factory: `lifecycleObserver(event)`, `timers`
  (`setInterval`, `clearInterval`), và test-only
  `testHooks.beforeApiDispatch(req)`. Handler tăng `inflight` **trước** hook/
  API dispatch, giảm trong `finally`, và `waitForInflight()` resolve chỉ khi
  count bằng 0. `Kho.prototype.choRanh()` là public seam thật: trả Promise
  resolve chỉ khi `transactionDepth===0`, queue waiter ở depth khác 0, và Kho
  flush waiter trong outer `finally`. Factory luôn gọi seam này, không vá một
  closure ẩn. `lifecycleObserver` nhận đúng edge sau trên healthy stop:

  ~~~text
  draining -> admission.close -> listener.close -> wait.inflight -> wait.uow
  -> scheduler.stop -> timer.clear -> db.close
  ~~~

  Observer cũng nhận lifecycle events `db.opened`/`db.closed`, migration,
  server và `http.error`; assertion thứ tự stop lấy filter chỉ trên tám edge
  ở trên, vì `db.closed` structured là event riêng và không được làm giả mất
  thứ tự cleanup.

  `listener.close` nghĩa là đã gọi `server.close()` để ngừng nhận connection;
  callback close có thể chờ request đang mở và được await sau `wait.inflight`.
  Test dùng `taoDeferred()` tại `beforeApiDispatch`, gửi một request admitted,
  gọi đồng thời hai `stop()`, assert scheduler chưa stop trước `deferred.resolve()`,
  rồi assert exact array trên, one bind, one scheduler start/stop, two fake-timer
  `clearInterval` call, và one `Kho.choRanh()` call. `Promise.all([app.start(), app.start()])`
  tạo đúng một bind/start; listener listening trước `scheduler.start`.
  `/healthz`, `/readyz`, `/metrics` quan sát được khi recovering, còn gameplay
  503 trước ready.

  Test riêng scheduler `start` reject và migration reject bằng temp SQLite có
  một row `dq.state` JSON hỏng được tạo **sau factory, trước `start`**. Cả hai
  phải reject đúng **object error gốc** dù `server.close`, `scheduler.stop` hay
  `kho.dong` cleanup ném lỗi sau đó; cleanup error chỉ được logger redact, không
  thay error gốc. Test recorder kiểm exact acquired-resource flags:

  | Failure | Flags được acquire | Logger/observer/call phải có | Tuyệt đối không có |
  |---|---|---|---|
  | migration hỏng | DB | `db.opened`, `migration.started`, `migration.failed`, `db.close` | bind/listener, scheduler start/stop, timer, admission |
  | scheduler start reject trước resolve | DB + listener | `db.opened`, migration complete, bind, `scheduler.start`, `listener.close`, wait inflight/UoW, `db.close` | `scheduler.stop`, timer clear, admission |

  Sau từng failure, hai `stop()` concurrent cùng await một cleanup promise và
  resolve không gọi close lần hai. Healthy path vẫn có one bind, one scheduler
  start/stop, two timer clear. Không coi bind `EPERM` sandbox là GREEN hoặc
  failed assertion.

  RED construction cleanup chạy table `logger-open`, `world`, `api`,
  `schedulerFactory`: fixture tạo DB temp, inject lần lượt logger console-shaped
  có `info` ném đúng `openError` tại `db.opened`,
  `testHooks.createWorld`, `testHooks.createApi`, hoặc `schedulerFactory` ném
  đúng object `cause`. Mỗi row assert `taoUngDung` throw cùng identity `cause`,
  observer thấy `db.close` đúng một lần sau `db.opened`, DB handle không còn
  lock (mở lại file thành công), và không có bind/timer/scheduler stop. Nếu
  `kho.dong`/logger cleanup ném thì `cause` ban đầu vẫn thắng. Test riêng gọi
  `taoUngDung` **không** truyền logger, capture `console.debug/info/warn/error`
  tạm thời trong `try/finally`, và assert default `taoLogger()` gọi các method
  console-shaped hợp lệ thay vì coi sink là callback.

  RED timer table dùng `taoTimersGia`: `setInterval` trả `tickHandle` lần một,
  ném `timerError` lần hai. Sau `await app.start()` reject đúng `timerError`,
  assert `clearInterval` chỉ nhận `[tickHandle]`, listener/scheduler/DB đã dọn
  một lần, và event không nói `timer.clear` cho handle chưa acquire. Case factory
  scheduler ném khi construction và case scheduler `start` ném sau bind cùng
  assert identity, cleanup scope, `db.closed`, `migration.failed` hoặc
  `server.start_failed` đúng semantic. Event capture kiểm đủ
  `db.opened`, `db.closed`, `migration.started`, `migration.completed` hoặc
  `migration.failed`, `server.started`, `server.stopped`, và `http.error`; event
  HTTP phải chứa `code`/message redacted, không body/password/token/state.

  RED `G.HOOK` isolation: tạo `app1`/`app2` trên hai DB temp, lưu `priorHook`,
  rồi tạo app2. Assert `G.HOOK === priorHook` ngay sau từng constructor. Sau
  app2, tạo account/empire chỉ ở app1, tìm tọa độ NPC bằng `G.coNPC(st.seed,c)`,
  gọi `app1.tg.xemHe(accountId,c.g,c.h)`, và assert NPC/projection xuất hiện
  trong DB1 nhưng `snapshot(app2.kho)` byte-identical. Trong cùng test, gọi
  `app1.tg.withRulesHook`, lồng `app2.tg.withRulesHook` ném lỗi, assert hook
  lần lượt là hook1/hook2/hook1/prior ở mọi `finally`; một thenable từ callback
  phải throw `WORLD_RULES_HOOK_ASYNC` trước khi có async context leak. Test
  `RULES_HOOK_METHODS` exact bằng `Object.getOwnPropertyNames(TheGioi.prototype)`
  (trừ `constructor`, `veHook`, `withRulesHook`) để entrypoint mới không thể
  xuất hiện mà không được bind. Đây là test runtime/public API, không grep text.

  RED cũng kiểm static bytes, không chỉ status: `GET /`/`/index.html` chứa
  `web/js/mp.js`, `/motnguoi`/`/solo` chứa `js/main.js`; body khác nhau và path
  traversal 404. Require `server/index.js` với `THDC_DB` temp trước getter phải
  không bind port/timer và legacy facade mở temp DB, không phải DB workspace.

- [ ] **Step 2 — implement factory/options/clock propagation (3–5 phút).**

  `server/app.js` resolve `env` trong **mỗi lần** `taoUngDung`; implementation
  của resolver phải khớp table Step 1, không dùng `parseInt` với fallback im lặng:

  ~~~js
  const env = options.env || process.env;
  const rootDir = options.rootDir || path.join(__dirname, "..");
  const dbPath = resolveDbPath(options, env, rootDir);
  const clock = options.clock || taoClock();
  const logger = options.logger || taoLogger();
  const testHooks = options.testHooks || {};
  const lifecycleObserver = options.lifecycleObserver || function () {};
  const timers = options.timers || {
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  function optionPoll(value) {
    if (!Number.isSafeInteger(value) || value < 100 || value > 10000) {
      throw new Error("SCHEDULER_POLL_MS_INVALID");
    }
    return value;
  }
  function envPoll(value) {
    if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
      throw new Error("SCHEDULER_POLL_MS_INVALID");
    }
    return optionPoll(Number(value));
  }
  function envBool(value) {
    if (value === "1") return true;
    if (value === "0") return false;
    throw new Error("SCHEDULER_LOG_TICKS_INVALID");
  }
  function resolveFoundationOptions(options, env) {
    options = options || {};
    env = env || {};
    const deprecatedAliases = [];
    let poll;
    if (Object.hasOwn(options, "schedulerPollMs")) {
      poll = optionPoll(options.schedulerPollMs);
    } else if (Object.hasOwn(options, "tickMs")) {
      poll = optionPoll(options.tickMs);
      deprecatedAliases.push("tickMs");
    } else if (env.SCHEDULER_POLL_MS !== undefined) {
      poll = envPoll(env.SCHEDULER_POLL_MS);
    } else if (env.THDC_NHIP !== undefined) {
      poll = envPoll(env.THDC_NHIP);
      deprecatedAliases.push("THDC_NHIP");
    } else {
      poll = 1000;
    }
    let logTicks;
    if (Object.hasOwn(options, "schedulerLogTicks")) {
      if (typeof options.schedulerLogTicks !== "boolean") {
        throw new Error("SCHEDULER_LOG_TICKS_INVALID");
      }
      logTicks = options.schedulerLogTicks;
    } else if (env.SCHEDULER_LOG_TICKS !== undefined) {
      logTicks = envBool(env.SCHEDULER_LOG_TICKS);
    } else if (env.THDC_AM !== undefined) {
      logTicks = envBool(env.THDC_AM);
      deprecatedAliases.push("THDC_AM");
    } else {
      logTicks = false;
    }
    const cleanup = Object.hasOwn(options, "cleanupMs")
      ? options.cleanupMs
      : 3600000;
    if (!Number.isSafeInteger(cleanup) || cleanup < 1) {
      throw new Error("CLEANUP_MS_INVALID");
    }
    return {
      schedulerPollMs: poll,
      schedulerLogTicks: logTicks,
      cleanupMs: cleanup,
      deprecatedAliases: deprecatedAliases
    };
  }

  const resolved = resolveFoundationOptions(options, env);
  const acquired = {
    db: false,
    listener: false,
    scheduler: false,
    timers: false,
    admission: false
  };
  let kho = null;
  let tg = null;
  let scheduler = null;
  let api = null;
  let gameNow = null;
  let schedulerOptions = null;
  function safeLog(level, event, error) {
    try {
      logger[level]({
        event: event,
        at: clock.nowMs(),
        code: error && error.code,
        message: error && error.message
      });
    } catch (ignored) {
      void ignored;
    }
  }
  function reportError(event, error) { safeLog("error", event, error); }
  function closeConstruction(cause) {
    if (acquired.db) {
      acquired.db = false;
      try {
        kho.dong();
      } catch (cleanupError) {
        reportError("server.cleanup_failed", cleanupError);
      }
      safeLog("info", "db.closed");
      lifecycleObserver("db.closed");
      lifecycleObserver("db.close");
    }
    throw cause;
  }
  try {
    resolved.deprecatedAliases.forEach(function (alias) {
      logger.warn({
        event: "server.config.deprecated_alias",
        at: clock.nowMs(),
        alias: alias
      });
    });
    kho = new Kho(dbPath, {
      allowMemoryDb: options.allowMemoryDb === true,
      clock: clock,
      logger: logger,
      onIdleWait: testHooks.onWaitForUowIdle
    });
    acquired.db = true;
    lifecycleObserver("db.opened");
    logger.info({event: "db.opened", at: clock.nowMs()});
    const makeWorld = testHooks.createWorld || function (kho0, worldOptions) {
      return new TheGioi(kho0, worldOptions);
    };
    tg = makeWorld(kho, {clock: clock});
    gameNow = function () { return tg.gameNow(); };
    schedulerOptions = {
      schedulerPollMs: resolved.schedulerPollMs,
      schedulerLogTicks: resolved.schedulerLogTicks,
      cleanupMs: resolved.cleanupMs
    };
    const schedulerFactory = options.schedulerFactory || taoSchedulerMacDinh;
    scheduler = schedulerFactory({
      kho,
      tg,
      clock,
      logger,
      env,
      schedulerOptions
    });
    const makeApi = testHooks.createApi || function (kho0, tg0, apiOptions) {
      return new API(kho0, tg0, apiOptions);
    };
    api = makeApi(kho, tg, {clock, logger, scheduler, env, gameNow});
  } catch (cause) {
    closeConstruction(cause);
  }
  ~~~

  Đặt helper validation hoàn chỉnh trên trước `taoUngDung`, rồi export nó cùng
  factory cho RED table: `resolveDbPath`, `optionPoll`, `envPoll`, `envBool`,
  `resolveFoundationOptions` được declare trước factory; `taoClock`, `taoLogger`,
  `Kho`, `TheGioi`, `API`, và `{taoScheduler: taoSchedulerMacDinh}` được import
  trước chúng.
  Không nhận scheduler instance thứ hai, không
  spread scalar thuộc tính của `schedulerOptions`, và factory chỉ chuyển nested
  object đó. Không read `process.env` ở module load trong `server/api.js`. API parse
  `THDC_PROXY`, `THDC_GIOI_HAN`, `THDC_GIOI_HAN_DN` từ object options/env và
  giữ `PORT`, `THDC_DB`, `THDC_NHIP`, `THDC_AM` tương thích. `port:0` phải giữ
  nguyên thay vì fallback 8080. Giữ static allowlist, decode/path-traversal
  rejection, `nosniff` headers và không mở DB/workspace thật khi chỉ `require`.

  Clock game phải vượt qua boundary browser/server mà không thay đổi solo ba
  tham số. Task 6 là owner thay đổi `js/engine.js` này và bắt buộc rebuild cả
  hai artifact. `TheGioi(kho, {clock})` giữ `this.clock`, expose `gameNow()`,
  và `taoDeQuoc` tính một `now` duy nhất rồi truyền nó vào `G.moiGame`; tất cả
  timestamp save cùng request dùng cùng game second đó:

  Áp dụng đúng các hunk sau vào body hiện hữu (đây là diff, không phải body
  thay thế rút gọn):

  ~~~diff
  diff --git a/js/engine.js b/js/engine.js
  @@
  -G.moiGame = function (ten, seedStr, home) {
  -  var now = G.giay();
  +G.moiGame = function (ten, seedStr, home, nowOverride) {
  +  var now = nowOverride === undefined ? G.giay() : Number(nowOverride);
  +  if (!Number.isSafeInteger(now)) throw new Error('GAME_NOW_INVALID');
  @@
  diff --git a/server/world.js b/server/world.js
  @@
   var G = require('./rules.js').G;
  +var taoClock = require('./clock.js').taoClock;
  @@
  -function TheGioi(kho) {
  +function TheGioi(kho, options) {
     this.kho = kho;
  +  this.clock = (options && options.clock) || taoClock();
  +  this.gameNow = function () { return Math.floor(this.clock.nowMs() / 1000); };
  @@
  -  G.HOOK = this.veHook();
  +  this.rulesHook = this.veHook();
  @@
  +  var now = this.gameNow();
  -  var st = G.moiGame(hienthi, this.seed(), nha);
  +  var st = G.moiGame(hienthi, this.seed(), nha, now);
  @@
  -  var now = Math.floor(Date.now() / 1000);
  ~~~

  Hunk cuối xóa chính declaration `now` hiện hữu trong `taoDeQuoc`, do đó mọi
  write còn lại dùng biến local đã tính trước `G.moiGame`.
  Signature cũ `G.moiGame(ten, seedStr, home)` tiếp tục gọi `G.giay()`, nên
  `file://` và browser globals không nhận dependency server. `server/app.js`
  tạo `new TheGioi(kho, {clock})`; world không gọi `Date.now()` ngoài production
  clock adapter sau migration này.

  `TheGioi` không được gán `G.HOOK` trong constructor nữa. Constructor tạo
  `this.rulesHook = this.veHook()`; `withRulesHook(fn)` phải đặt hook instance,
  chạy callback đồng bộ, restore prior hook ở `finally`, và reject thenable:

  ~~~js
  TheGioi.prototype.withRulesHook = function (fn) {
    const prior = G.HOOK;
    G.HOOK = this.rulesHook;
    try {
      const value = fn();
      if (value && typeof value.then === "function") {
        const error = new TypeError("WORLD_RULES_HOOK_ASYNC");
        error.code = "WORLD_RULES_HOOK_ASYNC";
        throw error;
      }
      return value;
    } finally {
      G.HOOK = prior;
    }
  };
  ~~~

  Khai báo/export immutable list và binder exact dưới. List gồm mọi prototype
  method hiện hữu trừ `constructor`, `veHook`, `withRulesHook`; runtime check
  chặn một entrypoint mới không được bind:

  ~~~js
  const RULES_HOOK_METHODS = Object.freeze([
    "nangCapDuLieu", "seed", "batDau", "ketThuc", "ghiBangTin", "ghiTran",
    "npcLay", "npcGhi", "plLay", "laDongMinh", "quyenDanh", "kiemTraGui",
    "kiemTraGiu", "chuHienTai", "oNguoi", "nap", "_chuanBiLuu",
    "_ghiChiMucHam", "_ghiNhieu", "luu", "_dongBoChiMucTrongGD",
    "dongBoChiMuc", "hamDangToi", "hamGiuTai", "tick", "hanhDong",
    "danhNguoi", "doThamNguoi", "tangNguoi", "xepHangCho", "xemHe",
    "oTrong", "timNha", "taoDeQuoc", "tenLuaNguoi", "xoaTaiKhoan",
    "guiThu", "tuyenChien", "chienCua", "chuyenGalana", "lmDS", "lmTao",
    "lmThanhVien", "lmXin", "lmDuyet", "lmDuoi", "lmChuyenChu", "lmRa",
    "nhip"
  ]);
  function sameNames(left, right) {
    return left.length === right.length && left.every(function (name, index) {
      return name === right[index];
    });
  }
  function bindRulesHooks() {
    const ignored = new Set(["constructor", "veHook", "withRulesHook"]);
    const actual = Object.getOwnPropertyNames(TheGioi.prototype)
      .filter(function (name) { return !ignored.has(name); })
      .sort();
    const expected = RULES_HOOK_METHODS.slice().sort();
    if (!sameNames(actual, expected)) {
      throw new Error("WORLD_RULES_HOOK_METHODS_OUT_OF_DATE");
    }
    RULES_HOOK_METHODS.forEach(function (name) {
      const raw = TheGioi.prototype[name];
      Object.defineProperty(TheGioi.prototype, name, {
        configurable: true,
        enumerable: true,
        value: function () {
          const self = this;
          const args = arguments;
          return self.withRulesHook(function () { return raw.apply(self, args); });
        },
        writable: true
      });
    });
  }
  bindRulesHooks();
  module.exports = {TheGioi: TheGioi, G: G, RULES_HOOK_METHODS: RULES_HOOK_METHODS};
  ~~~

  Do đó nested call app1→app2→app1 restore stack đúng và public method mới
  không thể lặng lẽ bypass. **Durable scheduler task là owner bắt buộc** của
  mọi thay đổi scheduler thêm/bỏ `TheGioi` public method: trong cùng PR nó cập
  nhật `RULES_HOOK_METHODS`, rerun exact inventory và regression two-app/nested
  hook của Task 6. Ở foundation manifest này được export từ `server/world.js`;
  nếu scheduler relocation nó sang module khác, relocation/export/test phải đi
  cùng một commit. List foundation ở trên là exact snapshot hiện tại, không là
  allowlist mở. Đây là dispatch context server synchronous, độc lập hoàn toàn
  với `G` browser shared và policy one-global CommonJS của Task 8.

  Thay tất cả 8 call `Date.now()` trong `server/api.js` và 27 call trong
  `server/world.js` bằng injected clock/game-second helper; cả line comment có
  chuỗi này phải đổi mô tả để final scan chỉ còn `server/clock.js`. Test fake
  clock phải quan sát timestamps ở rate limit, info now, register/login account
  creation/last seen/session expiry, session cleanup, chat cleanup/chat create,
  seed `moLuc`, migration, tick/save, battle/news/alliance timestamps và
  scheduler context. Không chỉ mock một endpoint.

  Emit logger structured/redacted, clocked: `db.opened`, `db.closed`,
  `migration.started`, `migration.completed`, `migration.failed`,
  `server.started`, `server.stopped`, `http.error`. `migration.failed`/`http.error`
  mang code/message safe, không body/password/salt/token/state. Test inspect
  sink cả presence/order và redaction.

- [ ] **Step 3 — lifecycle/entrypoint implementation (3–5 phút).**

  Factory construction không bind/timer/signal. `start()` bootstrap DB/migration,
  bind listener ở `recovering` trước `scheduler.start`, vì vậy health/ready/
  metrics có thể phản ánh acquire/recovery. Listener được admission sau
  `scheduler.start`, nhưng mỗi gameplay request vẫn kiểm
  `scheduler.getStatus().ready` động và trả 503 trong recovering/standby.
  Giữ one promise `starting` và `stopping` để call concurrent/idempotent không
  bind/start/stop lần hai. Khai báo helper
  trong `taoUngDung` **trước** request handler/start/stop; không giấu counter
  trong closure không thể test:

  ~~~js
  const timerHandles = [];
  const inflightWaiters = [];
  let admissionOpen = false;
  let inflight = 0;

  function emit(event) { lifecycleObserver(event); }
  function finishInflight() {
    inflight--;
    if (inflight === 0) inflightWaiters.splice(0).forEach(function (resolve) {
      resolve();
    });
  }
  function trackApiRequest(fn) {
    inflight++;
    return Promise.resolve().then(fn).finally(finishInflight);
  }
  function waitForInflight() {
    if (inflight === 0) return Promise.resolve();
    return new Promise(function (resolve) { inflightWaiters.push(resolve); });
  }
  function closeListenerWithoutAcceptingNewRequests() {
    if (!server.listening) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      server.close(function (error) {
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING") return reject(error);
        resolve();
      });
    });
  }
  function clearAllTimers() {
    timerHandles.splice(0).forEach(function (handle) {
      timers.clearInterval(handle);
    });
  }
  ~~~

  `server/app.js` sở hữu responder transient, không gọi helper private của
  `server/api.js`. Nó được khai báo trước handler; test HTTP của Task 6/7 assert
  status, ba header, và JSON body thực của nó. Request handler chỉ tại đây (ngoài
  UoW) có `await` test hook:

  ~~~js
  function traJsonApp(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    res.end(body);
  }

  function xuLyApiCoTheoDoi(req, res, duong, tv) {
    return trackApiRequest(async function () {
      try {
        if (testHooks.beforeApiDispatch) await testHooks.beforeApiDispatch(req);
        return await api.xuLy(req, res, duong, tv);
      } catch (error) {
        emit("http.error");
        reportError("http.error", error);
        return traJsonApp(res, 500, {loi: "Lỗi máy chủ."});
      }
    });
  }
  ~~~

  Task 7 thay một delegate duy nhất trong wrapper bằng
  `await dispatchAdmittedApi(req, res, duong, tv)` và giữ catch này. Dispatcher
  đó dùng `traJsonApp` cho 503 known code; không export `json` từ API chỉ để
  tiện dùng. Regression tạo error đã scrub, gọi route, và assert 500 body/header
  exact cùng `http.error` structured/redacted.

  `Kho` có helper public thật, được tạo/flush trước khi `stop()` có thể gọi nó:

  ~~~js
  Kho.prototype._baoRanh = function () {
    if (this.transactionDepth !== 0) return;
    this.idleWaiters.splice(0).forEach(function (resolve) { resolve(); });
  };
  Kho.prototype.choRanh = function () {
    const self = this;
    if (self.onIdleWait) self.onIdleWait(self.transactionDepth);
    if (self.transactionDepth === 0) return Promise.resolve();
    return new Promise(function (resolve) { self.idleWaiters.push(resolve); });
  };
  ~~~

  Constructor `Kho` initialize `idleWaiters = []` và nhận optional
  `onIdleWait` function; factory chuyển only test hook
  `testHooks.onWaitForUowIdle` vào option này. Outer `finally` của
  `trongGiaoDich` đặt depth/failure về idle rồi gọi `_baoRanh()`. Test gọi
  `choRanh()` trong một UoW sync thật, assert Promise chưa settle trước outer
  return và settle sau COMMIT/ROLLBACK; lifecycle test assert callback public
  đúng một lần ở edge `wait.uow`, không patch hidden implementation.
  Khi start thành công, push đúng two handles (`nhip`, cleanup) từ
  `timers.setInterval` vào `timerHandles`; không tạo interval trước bind
  hoặc sau failure.

  `stop()` không được dùng `stopOnce` vô điều kiện. Khai báo flags trước
  `start()` và chỉ cleanup resource đã acquire; lifecycle observer emit ngay
  sau transition. `server.close` được khởi tạo trước nhưng callback chỉ await
  sau inflight. Đoạn dưới là body hoàn chỉnh của helper trong `taoUngDung`:

  ~~~js
  let starting = null;
  let stopping = null;
  let stopRequested = false;

  async function attemptCleanup(action, original, firstCleanupError) {
    try {
      await action();
    } catch (error) {
      reportError("server.cleanup_failed", error);
      if (!original && !firstCleanupError.value) firstCleanupError.value = error;
    }
  }

  async function closeAcquired(original) {
    const firstCleanupError = {value: null};
    const hadRunningService = acquired.listener || acquired.scheduler || acquired.timers;
    const needsDbDrain = hadRunningService;
    if (hadRunningService) {
      emit("draining");
      if (acquired.admission) {
        admissionOpen = false;
        acquired.admission = false;
        emit("admission.close");
      }
    }
    let listenerClosed = Promise.resolve();
    if (acquired.listener) {
      listenerClosed = Promise.resolve().then(closeListenerWithoutAcceptingNewRequests);
      acquired.listener = false;
      emit("listener.close");
      emit("wait.inflight");
      await attemptCleanup(waitForInflight, original, firstCleanupError);
      await attemptCleanup(function () { return listenerClosed; }, original, firstCleanupError);
    }
    if (acquired.db && needsDbDrain) {
      emit("wait.uow");
      await attemptCleanup(function () { return kho.choRanh(); }, original, firstCleanupError);
    }
    if (acquired.scheduler) {
      acquired.scheduler = false;
      await attemptCleanup(function () { return scheduler.stop(); }, original, firstCleanupError);
      emit("scheduler.stop");
    }
    if (acquired.timers) {
      acquired.timers = false;
      await attemptCleanup(clearAllTimers, original, firstCleanupError);
      emit("timer.clear");
    }
    if (acquired.db) {
      acquired.db = false;
      await attemptCleanup(function () { return kho.dong(); }, original, firstCleanupError);
      safeLog("info", "db.closed");
      emit("db.closed");
      emit("db.close");
    }
    if (original) throw original;
    if (firstCleanupError.value) throw firstCleanupError.value;
  }

  async function startOnce() {
    let migrationCompleted = false;
    try {
      emit("migration.started");
      logger.info({event: "migration.started", at: clock.nowMs()});
      tg.nangCapDuLieu();
      migrationCompleted = true;
      emit("migration.completed");
      logger.info({event: "migration.completed", at: clock.nowMs()});
      if (stopRequested) return;
      await listenOnConfiguredPort();
      acquired.listener = true;
      if (stopRequested) return;
      await scheduler.start();
      acquired.scheduler = true;
      if (stopRequested) return;
      const tickHandle = timers.setInterval(nhip, schedulerOptions.schedulerPollMs);
      timerHandles.push(tickHandle);
      acquired.timers = true;
      const cleanupHandle = timers.setInterval(donRac, schedulerOptions.cleanupMs);
      timerHandles.push(cleanupHandle);
      admissionOpen = true;
      acquired.admission = true;
      emit("server.started");
      logger.info({event: "server.started", at: clock.nowMs()});
    } catch (error) {
      const failureEvent = migrationCompleted ? "server.start_failed" : "migration.failed";
      emit(failureEvent);
      reportError(failureEvent, error);
      await closeAcquired(error);
    }
  }

  function start() {
    if (!starting) starting = startOnce();
    return starting;
  }

  function stop() {
    if (stopping) return stopping;
    stopRequested = true;
    const waitForStart = starting ? starting.catch(function () {}) : Promise.resolve();
    let hadRunningService = false;
    stopping = waitForStart.then(function () {
      hadRunningService = acquired.listener || acquired.scheduler || acquired.timers;
      return closeAcquired(null);
    }).finally(function () {
      if (hadRunningService) logger.info({event: "server.stopped", at: clock.nowMs()});
      if (hadRunningService) emit("server.stopped");
    });
    return stopping;
  }
  ~~~

  `listenOnConfiguredPort` và `nhip`/`donRac` được khai báo trước `startOnce`.
  `start()` đặt `acquired.listener` chỉ sau bind resolve, `acquired.scheduler`
  chỉ sau `scheduler.start()` resolve, và `acquired.timers` ngay sau **mỗi**
  handle interval đã nhận; start reject vì vậy dọn chính xác handle thứ nhất nếu
  handle thứ hai không tạo được, nhưng không gọi cleanup chưa acquire. Nếu
  `scheduler.start()` cần cleanup sau một reject từng phần, durable scheduler
  phải tự hoàn tất bên trong `start` trước khi reject. `app.start()` chỉ resolve
  sau chính Promise `scheduler.start()` resolve; durable adapter được resolve
  trong standby/recovering, và `getStatus().ready` tiếp tục admission 503. Nếu
  Promise reject, `startOnce` giữ original error và dọn theo flags foundation.
  `clearAllTimers` clear đúng tick và cleanup handles một lần; request wrapper
  giữ `inflight` trong `try/finally`, bao gồm error response. Không `process.exit`
  trong factory.

  `server/index.js` chỉ start khi `require.main === module`. Legacy facade phải
  memoize **một** app, để mọi getter coherent và `require` không bind/listen:

  ~~~js
  let legacyApp = null;
  function getLegacyApp() {
    if (!legacyApp) legacyApp = taoUngDung({env: process.env});
    return legacyApp;
  }
  module.exports = {
    taoUngDung: taoUngDung,
    getLegacyApp: getLegacyApp,
    get server() { return getLegacyApp().server; },
    get kho() { return getLegacyApp().kho; },
    get tg() { return getLegacyApp().tg; },
    get api() { return getLegacyApp().api; }
  };
  ~~~

  Test đặt `THDC_DB` temp **trước require**, lấy getters nhiều lần, assert
  `facade.server === facade.server`, `facade.kho === facade.tg.kho`,
  `facade.kho === facade.api.kho`, `facade.api === facade.api`, và server không
  listening/timer; finally gọi `await facade.getLegacyApp().stop()` rồi xóa DB.
  `getLegacyApp` là named compatibility inspection seam, không bind và không
  tạo app thứ hai. Production signal handler gọi `stop()` và đặt
  `process.exitCode`, không ép exit.

  `tools/test-server-entrypoint.js` spawn `server/index.js` với `PORT=0`/
  `THDC_DB=temp.sqlite`, đợi logger `server.started`, gửi SIGTERM, assert exit
  `0` rồi always remove DB. Hết hạn kiểm thử dùng timeout có cleanup; không sleep.

- [ ] **Step 4 — GREEN and audits (2–3 phút).**

  ~~~bash
  node tools/test-server-factory.js
  node tools/test-server-entrypoint.js
  node tools/test-version-contract.js
  rg -n 'Date\.now' server/api.js server/world.js
  factory_artifacts="$(mktemp -d)"
  node tools/build.js
  node tools/build.js --artifact
  node tools/test-artifact.js
  node tools/check-artifact.js
  cp dist/thien-ha-dai-chien.html dist/artifact.html "$factory_artifacts/"
  node tools/build.js
  node tools/build.js --artifact
  cmp -s "$factory_artifacts/thien-ha-dai-chien.html" dist/thien-ha-dai-chien.html
  cmp -s "$factory_artifacts/artifact.html" dist/artifact.html
  node tools/test-server.js
  ~~~

  Expected normal CI: first two/test-server pass; `rg` không output. Test Task
  6 phải trực tiếp chạy resolver matrix, warnings deprecated alias, two-factory
  hook isolation, healthy/failed lifecycle, fake clock game-state/logger/static/
  legacy facade assertions; `tools/test-server.js` giữ HTTP regression. Vì
  Task 6 đổi `js/engine.js`, two-build/cmp và artifact checker ở trên là bắt
  buộc; ghi hash fresh trong report. Trong sandbox bind bị `EPERM` trước
  assertion phải report environment-blocked, không mark green.

- [ ] **Step 5 — commit.**

  ~~~bash
  git add server/app.js server/index.js server/db.js server/api.js server/world.js \
    js/engine.js tools/test-server-factory.js tools/test-server-entrypoint.js \
    dist/thien-ha-dai-chien.html dist/artifact.html
  git commit -m "refactor: create observable server factory"
  ~~~

### Task 7: Gate mọi durable write qua scheduler bridge

**Files:**

- Modify: `server/app.js`, `server/api.js`, `server/world.js`,
  `tools/test-version-contract.js`, `tools/check-version.js`
- Create: `tools/test-scheduler.js`

`package.json` không thuộc task này: Task 1 đã sở hữu exact
`test:scheduler` command.

- [ ] **Step 1 — RED HTTP/SQLite harness (3–5 phút).**

  `tools/test-scheduler.js` khai báo trước test: `tempDb`, `removeDb`,
  `fakeClock`, `silentLogger`, `appUrl`, `requestJson`, `get`, `post`,
  `snapshot`, `seedAccounts`, `makeBridge`, `taoApp`, `assertBlockedHttp`,
  `assertBlockedCall`. `snapshot(kho)` đọc danh sách mọi bảng non-SQLite theo
  tên và `rowid`, serialize object canonical; không dùng source grep.

  Bridge fake ready có `runCommand` tăng counter, ghi `{name,accountId}`, và
  khi mode block, throw **trước** `command.run`. Nó có mode `promiseResult`:
  closure `run` vẫn chạy synchronously đúng một lần, nhưng bridge trả
  `Promise.resolve(result)`. Đây phản ánh durable admission async mà không
  cho callback transaction async. Hai transient response được cố định,
  additive với `loi` cũ:

  ~~~js
  const transientBodies = {
    SCHEDULER_UNAVAILABLE: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_UNAVAILABLE"
    },
    GLOBAL_BARRIER_PENDING: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "GLOBAL_BARRIER_PENDING"
    }
  };
  ~~~

  Với từng `code`, test gọi `assert.deepEqual(response, {status: 503, headers:
  {"cache-control":"no-store", "content-type":"application/json; charset=utf-8",
  "x-content-type-options":"nosniff"}, body: transientBodies[code]})`, assert
  closure counter không tăng và full logical DB snapshot byte-identical.
  `SCHEDULER_UNAVAILABLE` và `GLOBAL_BARRIER_PENDING` đều được tested trước
  command closure; không chỉ assert message regex.

  `makeBridge` là helper runtime, không mock route; definition nằm trước các
  `test` và chính nó tạo mode Promise:

  ~~~js
  function makeBridge(options) {
    const config = options || {};
    const commands = [];
    let closures = 0;
    const scheduler = {
      start: async function () {},
      stop: async function () {},
      getStatus: function () {
        return config.status || {state: "ready", ready: true};
      },
      runCommand: function (command) {
        commands.push({name: command.name, accountId: command.accountId});
        if (config.code) {
          const error = new Error(config.code);
          error.code = config.code;
          throw error;
        }
        closures++;
        const value = command.run();
        return config.promiseResult ? Promise.resolve(value) : value;
      },
      schedule: function () {},
      cancel: function () {},
      reconcile: function () {},
      advanceTo: function () {}
    };
    return {scheduler: scheduler, commands: commands, closures: function () { return closures; }};
  }
  ~~~

  Thêm regression Promise chính xác trước implementation. Với bridge
  `promiseResult`, gửi hai `GET /api/thongtin` concurrent bằng `Promise.all`,
  await cả HTTP response, rồi assert mỗi `body.seed` là cùng non-empty string,
  `typeof body.seed !== "object"`, và command `universe-bootstrap` đúng một
  lần. Call thứ ba giữ cùng seed/counter. Đọc `cauhinh.seed`/`cauhinh.moLuc`
  SQLite thực và assert string/int thay vì `{}` hoặc thenable. Cùng mode gọi
  `GET /api/he` sau bootstrap với token hợp lệ, assert response JSON là system
  object thực chứ không Promise/empty object. Đây chứng minh caller await
  bridge **ngoài** closure, không serialize Promise vào `universeSeed`, DB, hay
  JSON.

  Bổ sung hai GET có thể ghi vào **cùng** blocked/success snapshot matrix, với
  hai fixture độc lập để bootstrap của test `/api/he` không làm sai RED của
  `/api/thongtin`:

  1. Đặt bridge trả từng transient code, snapshot toàn DB, gọi lần đầu
     `GET /api/thongtin`, assert response exact 503, bridge closure counter
     `0`, và snapshot không đổi: chưa có `cauhinh.seed`/`cauhinh.moLuc`.
  2. Cho bridge ready, gọi cùng GET, assert một command
     `universe-bootstrap`, `seed` lẫn `moLuc` được tạo với fake-clock game
     second; snapshot lần hai. Gọi GET lần nữa, assert command count không
     tăng và snapshot byte-identical: thông tin sau bootstrap thật sự read-only.
  3. Quy tắc observable `/api/he` là **readiness gate trước authentication**.
     Fixture A giữ token expired, bridge `getStatus().ready === false`, snapshot
     trước request; `GET /api/he?g=<g>&h=<h>` phải trả exact
     `SCHEDULER_UNAVAILABLE` 503 và token expired vẫn còn trong full snapshot.
     Sau khi ready, expiry mới được command `session-expiry` xử lý; vì vậy test
     chứng minh gate chưa gọi auth mutation sớm.
  4. Fixture B bootstrap seed khi ready, tạo token hợp lệ và snapshot. Chuyển
     bridge sang ready nhưng `runCommand` throw `GLOBAL_BARRIER_PENDING` trước
     closure, rồi gọi `/api/he`. Response phải exact 503/body barrier, counter
     closure bằng 0, `vaoCuoi`, session, NPC và toàn snapshot không đổi. Auth
     ở phase này chỉ read token; không generic `tkVao.run` trước command.
  5. Cuối cùng bridge ready thật, cùng GET gọi đúng `last-seen` rồi
     `system-read`, trả NPC deterministic từ `G.coNPC(seed, c)`, và chỉ khi
     hai closure admitted mới tạo row NPC/last-seen mong đợi. Snapshot success
     phải khác baseline đúng ở durable fields đó.

  Test log command theo thứ tự `{name,accountId}`; snapshots serialize mọi
  bảng non-SQLite/`rowid`, nên seed, `moLuc`, session, NPC và projection không
  thể bị bỏ qua. Không dùng mock route hoặc source-shape assertion.

  Matrix behavior bắt buộc gồm: register (account/empire/session), login
  (session/last-seen/expired cleanup), expiry session, last-seen, logout,
  state-read, action gồm `lmra`, war, transfer-galana; **mọi** alliance branch
  `lmtao`, `lmxin`, `lmduyet`, `lmtuchoi`, `lmduoi`, `lmchuyen`; chat GET TTL
  cleanup và chat POST; mail; password change; account deletion; `app.donRac()`;
  `app.nhip()`. Mỗi row mode-blocked phải giữ snapshot; success pass phải thấy
  command name đúng và mutation thực. `phien(req)` phải chỉ phát hiện expired
  token; delete thực nằm trong command `session-expiry` để blocked path không
  có write sớm. Hai row GET mới ở trên là bắt buộc, không được coi là public
  read-only chỉ vì HTTP method là GET.

- [ ] **Step 2 — implement one canonical mutation boundary (3–5 phút).**

  `server/app.js` giữ duy nhất:

  ~~~js
  const schedulerFactory = options.schedulerFactory || taoSchedulerMacDinh;
  const scheduler = schedulerFactory({
    kho,
    tg,
    clock,
    logger,
    env,
    schedulerOptions
  });
  ~~~

  API/world nhận bridge đó. Mỗi SQL/game durable mutation chỉ xảy ra trong
  closure `command.run` **synchronous** được truyền vào
  `scheduler.runCommand({name,accountId,run})`; public `runCommand` có thể trả
  value hoặc Promise. No-op foundation bridge mở outer re-entrant immediate UoW.
  Nhóm command exact là
  `universe-bootstrap`, `register`, `login`, `session-expiry`, `last-seen`,
  `logout`, `state-read`, `action`, `system-read`, `alliance`, `war`,
  `transfer-galana`, `chat`, `mail`, `password-change`, `account-delete`,
  `cleanup`, `advance-due`. `nhip`/`donRac` không được ghi ngoài wrapper.
  Scheduler durable sau này thay implementation, không đổi shape.

  Khai báo helper này trước khi tạo `API`; nó là đường duy nhất khởi tạo seed
  universe, khác với combat seed/cutover durable và không chạy trước admission
  ready:

  ~~~js
  let universeSeed = null;
  let universeBootstrapPromise = null;
  function currentUniverseSeed() {
    if (universeSeed === null) throw new Error("UNIVERSE_NOT_BOOTSTRAPPED");
    return universeSeed;
  }
  async function ensureUniverseBootstrap() {
    if (universeSeed !== null) return universeSeed;
    if (!universeBootstrapPromise) {
      universeBootstrapPromise = Promise.resolve(scheduler.runCommand({
        name: "universe-bootstrap",
        run: function () { return tg.seed(); }
      })).then(function (seed) {
        if (typeof seed !== "string" || seed.length === 0) {
          throw new Error("UNIVERSE_SEED_INVALID");
        }
        universeSeed = seed;
        return seed;
      }).catch(function (error) {
        universeBootstrapPromise = null;
        throw error;
      });
    }
    return await universeBootstrapPromise;
  }
  const api = new API(kho, tg, {
    clock,
    logger,
    scheduler,
    env,
    gameNow,
    getUniverseSeed: currentUniverseSeed
  });
  ~~~

  Mở rộng constructor `API(kho, tg, options)` đã được Task 6 tạo để lưu đúng
  `this.scheduler`, `this.gameNow`, và `this.getUniverseSeed`; reject factory
  nếu callback seed không phải function. `API.thongTin()` gọi
  `this.getUniverseSeed()` và `this.gameNow()`, không `tg.seed()`/`Date.now()`.
  Các direct API fixture phải nhận callback read-only cùng bridge thật, không
  tự gán seed để lách admission. Vì vậy Task 7 là owner update tương thích của
  `tools/test-version-contract.js` và fixture API cũ trong `tools/check-version.js`:
  khai báo options/bridge trước `new API`, giữ mọi assertion Task 4
  descriptor/reload còn nguyên, và không còn gọi constructor API cũ thiếu
  `scheduler`, `gameNow`, `getUniverseSeed`.

  ~~~js
  function versionApiOptions() {
    const clock = {nowMs: function () { return 1700000000000; }};
    const scheduler = {
      start: async function () {},
      stop: async function () {},
      getStatus: function () { return {state: "ready", ready: true}; },
      runCommand: function (command) { return command.run(); },
      schedule: function () {},
      cancel: function () {},
      reconcile: function () {},
      advanceTo: function () {}
    };
    return {
      clock: clock,
      logger: {
        debug: function () {},
        info: function () {},
        warn: function () {},
        error: function () {}
      },
      env: {},
      scheduler: scheduler,
      gameNow: function () { return Math.floor(clock.nowMs() / 1000); },
      getUniverseSeed: function () { return "VERSION-SEED"; }
    };
  }

  const versionKho = {
    q: {
      tkDem: {get: function () { return {n: 7}; }},
      htDem: {get: function () { return {n: 11}; }}
    }
  };
  const versionWorld = {seed: function () { return "VERSION-SEED"; }};
  const api = new API(versionKho, versionWorld, versionApiOptions());
  ~~~

  Fixture cung cấp đủ eight methods canonical; không tạo scheduler option thứ
  hai hoặc bypass factory. Constructor API chỉ giữ reference bridge đã được
  factory tạo, không đổi surface này.

  `universeBootstrapPromise` chỉ là memo promise private điều phối first-call;
  `universeSeed` chỉ nhận primitive đã resolve. Không Promise nào được cache
  như game state hay serialize vào DB/response. Test concurrent chứng minh
  first callers share một bridge command; test sequential chứng minh cache
  primitive khiến request thứ hai không thêm command. Dispatcher app kiểm
  `scheduler.getStatus().ready` và map transient **trước** `API.phien`, rate
  limit hay `API.xuLy`; riêng `GET /api/thongtin` await
  `ensureUniverseBootstrap()` sau gate. API `thongTin()` dùng
  `getUniverseSeed()` thay vì gọi `tg.seed()`, nên GET thứ hai không còn side
  effect. Không được bootstrap ở factory/start/migration hoặc trước scheduler
  ready; combat seed và mode cutover durable vẫn thuộc scheduler plan.

  Dispatcher API dùng thứ tự thực thi này; `xuLyApiCoTheoDoi` của Task 6 gọi
  helper dưới sau khi đã tăng counter inflight, còn `API.phien` chỉ nằm trong
  `api.xuLy` phía sau hai `await` đầu:

  ~~~js
  const transientBodies = {
    SCHEDULER_UNAVAILABLE: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "SCHEDULER_UNAVAILABLE"
    },
    GLOBAL_BARRIER_PENDING: {
      loi: "Máy chủ đang đồng bộ, hãy thử lại.",
      code: "GLOBAL_BARRIER_PENDING"
    }
  };

  async function dispatchAdmittedApi(req, res, duong, truyVan) {
    const status = scheduler.getStatus();
    if (!admissionOpen || status.ready !== true) {
      return traJsonApp(res, 503, transientBodies.SCHEDULER_UNAVAILABLE);
    }
    if (duong === "/api/thongtin") await ensureUniverseBootstrap();
    return api.xuLy(req, res, duong, truyVan);
  }
  ~~~

  Catch trong `xuLyApiCoTheoDoi` kiểm code trước generic 500: error
  `GLOBAL_BARRIER_PENDING` hoặc `SCHEDULER_UNAVAILABLE` từ awaited `api.xuLy`
  trả `traJsonApp(res, 503, transientBodies[error.code])`; mọi error khác giữ
  500 responder Task 6. Nó map after auth read but before `command.run`; matrix
  Step 1 phân biệt case này với initial readiness gate và assert header/body
  exact, không gọi helper private `api.js`.

  `API.phien` trở thành read-only: token expired trả record `{expiredToken, tk}`
  thay vì xóa. Đầu `API.prototype.xuLy` sau readiness gate `await` command
  `session-expiry` để xóa record đó rồi trả 401; vì `phien` chỉ được gọi sau
  dispatcher gate, expired token trước ready còn byte-identical. Khai báo
  `API.prototype.commandFor` và `markLastSeen` trước `xuLy`: expiry không gọi
  `markLastSeen`; mọi authenticated route hợp lệ await named `last-seen` trước
  command family của route. Riêng `/api/he` phải await cả hai closure này,
  không chỉ bọc JSON:

  ~~~js
  API.prototype.commandFor = function (p, name, run) {
    const self = this;
    return Promise.resolve(self.scheduler.runCommand({
      name: name,
      accountId: p && p.tk,
      run: run
    }));
  };
  API.prototype.markLastSeen = function (p) {
    const self = this;
    return Promise.resolve(self.scheduler.runCommand({
      name: "last-seen",
      accountId: p.tk,
      run: function () { return self.kho.q.tkVao.run(self.gameNow(), p.tk); }
    }));
  };
  async function xuLyPhienExpired(self, p, res) {
    await self.commandFor(p, "session-expiry", function () {
      self.kho.q.phienXoa.run(p.expiredToken);
      return null;
    });
    return json(res, 401, {loi: "Chưa đăng nhập."});
  }
  async function xuLyHeDaXacThuc(self, p, truyVan, res) {
    await self.markLastSeen(p);
    const he = await self.commandFor(p, "system-read", function () {
      return self.tg.xemHe(p.tk, truyVan.get("g"), truyVan.get("h"));
    });
    return json(res, 200, he);
  }
  ~~~

  Trong `API.prototype.xuLy`, ngay sau `p = self.phien(req)`, branch expired là
  `if (p && p.expiredToken) return xuLyPhienExpired(self, p, res);`; branch
  `/api/he` là `return xuLyHeDaXacThuc(self, p, truyVan, res);`. Parent method
  đã là `async`, nên HTTP handler await returned Promise. Other authenticated
  route closures cũng await `self.markLastSeen(p)` trước rồi await
  `self.commandFor` theo group exact ở trên;
  `state-read` chỉ contains time advance/save; `last-seen` là command named
  riêng trước nó, session expiry owns delete, và `chat` owns both GET TTL cleanup
  and POST. Thus no generic
  pre-route `tkVao.run` remains outside command. `app.nhip()` là
  `advance-due` và `app.donRac()` là `cleanup`, cả hai invoking bridge.

  API catch code ở dispatcher trước JSON generic: hai code trong map Step 1 trả
  503/body exact; lỗi khác giữ behavior existing. Không expose scheduler job
  state, writer, token hay DB detail.

- [ ] **Step 3 — GREEN.**

  ~~~bash
  node --test tools/test-scheduler.js
  node tools/test-version-contract.js
  npm run test:scheduler
  npm run test:server
  ~~~

  Expected CI: all pass. Nếu Task 1 vẫn blocked, command middle chưa tồn tại
  trong package; chạy direct first command, ghi package-block separately, không
  sửa package trong Task 7. Durable plan phải mở rộng harness này, không thay
  bằng test source-shape.

- [ ] **Step 4 — commit.**

  ~~~bash
  git add server/app.js server/api.js server/world.js tools/test-scheduler.js \
    tools/test-version-contract.js tools/check-version.js
  git commit -m "refactor: route durable writes through scheduler bridge"
  ~~~

### Task 8: Loader CommonJS an toàn, cache policy và allowlist rỗng

**Files:**

- Create: `server/rules-loader.js`, `tools/test-loader.js`
- Modify: `server/rules.js`, `tools/source-manifest.js`, `tools/smoke.js`,
  `tools/test-mp-ui.mjs`, `tools/lint.js`, `tools/test-quality-gate.js`

**Produces:** `napLuat({rootDir,requireFn,globalObject})`, `THU_TU`, public
`server/rules.js::{G,THU_TU,napLuat}`, exact manifest order, and an empty
`LEGACY_EXECUTION_ALLOWLIST`.

- [ ] **Step 1 — RED cache/global policy tests (3–5 phút).**

  Policy được hỗ trợ là **một globalObject thành công trên mỗi module instance**.
  Gọi lần hai với *cùng* object trả cùng identity/cache và không require lại;
  global khác bị reject deterministic `RULES_GLOBAL_CONFLICT`, thay vì âm thầm
  trả `undefined` do CommonJS cache. Mỗi policy scenario chạy child process bởi
  `tools/test-loader.js`; loader production không spawn process.

  Test child A: custom global rỗng, recording `requireFn`, gọi loader hai lần;
  assert `seen === manifest.rulesScripts`, `first === second`, `STATE_VERSION`
  positive, và `global.window` sentinel được restore. Child A sau đó thử custom
  global thứ hai và default global, assert cả hai throw code conflict, không
  materialize object thứ hai. Child B require `server/rules.js`, assert exact
  `THU_TU`, `G === napLuat()`, and cache identity. Child C uses requireFn that
  throws tại `js/fleet.js` lần đầu, asserts message nêu path, global custom
  trở lại absence ban đầu, retry với requireFn thường succeeds; cache partial
  không làm retry trả undefined.

  `tools/test-quality-gate.js` đổi test temporary allowlist thành `size === 0`
  và tạo forbidden data runtime như Task 2; fixture source không chứa lexical
  dynamic-execution call.

- [ ] **Step 2 — implement loader không tự diễn dịch source (3–5 phút).**

  `server/rules-loader.js` dùng CommonJS `require` theo `manifest.rulesScripts`.
  Code sau là policy cốt lõi; helper nào dùng đều được khai báo trước:

  ~~~js
  "use strict";
  const path = require("node:path");
  const manifest = require("../tools/source-manifest.js");
  let cached = null;
  function rulesError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
  function restoreWindow(object, hadOwn, value) {
    if (hadOwn) object.window = value;
    else delete object.window;
  }
  function clearAttempt(files) {
    for (const file of files) delete require.cache[file];
  }
  function napLuat(options = {}) {
    const rootDir = options.rootDir || path.join(__dirname, "..");
    const requireFn = options.requireFn || require;
    const globalObject = options.globalObject || global;
    if (cached) {
      if (cached.globalObject !== globalObject) {
        throw rulesError("RULES_GLOBAL_CONFLICT", "rules already loaded for another globalObject");
      }
      return cached.G;
    }
    const hadTargetWindow = Object.hasOwn(globalObject, "window");
    const priorTargetWindow = globalObject.window;
    const hadProcessWindow = Object.hasOwn(global, "window");
    const priorProcessWindow = global.window;
    const targetWindow = globalObject.window || {};
    const attempted = [];
    let currentFile = null;
    globalObject.window = targetWindow;
    global.window = targetWindow;
    try {
      for (const file of manifest.rulesScripts) {
        currentFile = file;
        const absolute = path.join(rootDir, file);
        attempted.push(absolute);
        requireFn(absolute);
      }
      if (!targetWindow.G) throw rulesError("RULES_MISSING_G", "rules did not publish G");
      cached = {globalObject, G: targetWindow.G};
      return cached.G;
    } catch (cause) {
      clearAttempt(attempted);
      restoreWindow(globalObject, hadTargetWindow, priorTargetWindow);
      const prefix = currentFile ? "cannot load " + currentFile + ": " : "cannot load rules: ";
      throw rulesError(cause.code || "RULES_LOAD_FAILED", prefix + cause.message);
    } finally {
      restoreWindow(global, hadProcessWindow, priorProcessWindow);
    }
  }
  const THU_TU = manifest.rulesScripts.slice();
  module.exports = {napLuat, THU_TU};
  ~~~

  `server/rules.js` chỉ là facade:

  ~~~js
  "use strict";
  const {napLuat, THU_TU} = require("./rules-loader.js");
  const G = napLuat();
  module.exports = {G, THU_TU, napLuat};
  ~~~

  Không đọc-file rồi diễn dịch, không `eval`, `Function`, `node:vm`, dynamic
  import. Browser vẫn dùng script tags static theo manifest, nên `file://` không
  thay đổi. Khi failure, xóa cache chỉ của file manifest đã thử để retry cùng
  module instance thực sự execute lại; khi success không xóa cache.

- [ ] **Step 3 — close allowlist và GREEN (2–3 phút).**

  Set `LEGACY_EXECUTION_ALLOWLIST = new Set()`. `tools/smoke.js` consume
  `require("../server/rules.js")`; UI runner giữ static Playwright import và
  thay DOM API dynamic cũ bằng locator/evaluate phù hợp. Run:

  ~~~bash
  node tools/test-loader.js
  node tools/test-quality-gate.js
  node tools/lint.js
  node tools/check-syntax.js
  node tools/smoke.js
  node tools/test-tai.js 60
  rg -n '\\beval\\s*\\(|\\bFunction\\s*\\(|node:vm|\\bimport\\s*\\(' server js tools web
  ~~~

  Trên normal host/CI, sáu command đầu pass và `rg` không có result. Trong
  sandbox hiện tại, `node tools/check-syntax.js` **expected exit 1** với
  diagnostic `syntax-check spawn EPERM` vì host cấm child process; ghi nó là
  environment-limited, không là GREEN. Khi đó outer check độc lập vẫn phải pass:

  ~~~bash
  while IFS= read -r file; do
    node --check "$file"
  done < <(rg --files -g '*.js' -g '*.mjs' server js tools web)
  ~~~

  Các outer checks không thay implementation spawn-based: normal CI vẫn phải
  chạy `check-syntax` thật. `npm run test:ui` chỉ được coi pass sau Task 1
  `npm ci` và Playwright browser installation; test loader child isolation không
  là claim về runtime child process.

- [ ] **Step 4 — commit.**

  ~~~bash
  git add server/rules-loader.js server/rules.js tools/source-manifest.js \
    tools/smoke.js tools/test-mp-ui.mjs tools/lint.js tools/test-quality-gate.js \
    tools/test-loader.js
  git commit -m "refactor: replace legacy dynamic execution with manifest loader"
  ~~~

## Completion, snapshots và handoff

Trước full green, đóng theo thứ tự source-only còn mở:
**Task 2 Step 6–7 → Task 4 Step 5–6 → Task 6 → Task 7 → Task 8**. Khi npm
registry/cache trở lại, hoàn tất Task 1 exact package/lock rồi mới gọi toàn bộ
package scripts. Không đổi ownership Task 1 chỉ để làm các reopen pass.

Sau khi Task 1 unblock, hai reopen và Tasks 6–8 hoàn thành, chạy theo thứ tự
chính xác:

~~~bash
npm ci
node tools/test-package-contract.js
node tools/test-quality-gate.js
npm run check:syntax
npm run lint
node tools/test-version-contract.js
npm run check:version
npm run build
node tools/test-artifact.js
npm run check:artifact
npm run test:core
node tools/test-uow.js
node tools/test-server-factory.js
node tools/test-server-entrypoint.js
npm run test:server
npm run test:scheduler
npm run test:load
npx --no-install playwright install --with-deps chromium
npm run test:ui
node tools/test-loader.js
npm run test:all
git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html
~~~

`npm run test:all` intentionally repeats the full script contract without a
browser install; the explicit Playwright install immediately before it makes the
last UI segment reproducible. In CI, job UI installs browser after `npm ci` as
recorded above; other jobs do not need Chromium.

Không đổi package contract chỉ để đặt alias cho direct regressions. CI-integration
Task 6 phải chạy hoặc aggregate **đúng từng direct regression** sau, ngoài các
`npm run` trong spec:

~~~bash
node tools/test-package-contract.js
node tools/test-quality-gate.js
node tools/check-syntax.js
node tools/test-artifact.js
node tools/test-version-contract.js
node tools/test-uow.js
node tools/test-server-factory.js
node tools/test-server-entrypoint.js
node tools/test-loader.js
~~~

Job `quality` chạy package/quality/version direct gates; `artifact-and-core`
chạy artifact/loader; `server` chạy UoW/factory/entrypoint trước
`npm run test:server && npm run test:scheduler`. Không gate nào được coi là
pass khi Task 1 còn thiếu lock/Playwright; source-only reports chỉ là bằng
chứng tạm, không thay `npm ci` matrix.

Before each task commit, run `git diff --check --` followed by the concrete paths
in that task's **Files** list and verify only that task's paths changed. If Git
metadata is read-only, controller stores
a scoped snapshot/diff and commit intent; correctness remains the executable
gate, not staging success. Do not stage any concurrently edited plan.

Handoff requirements:

- Durable scheduler consumes `schedulerFactory(context)`, `context.schedulerOptions`,
  `app.scheduler`, `getStatus()`, and `runCommand({name,accountId?,run})`; it
  extends `tools/test-scheduler.js` behaviorally. Foundation chuyển đúng một
  object nested `{schedulerPollMs,schedulerLogTicks,cleanupMs}`, không scalar
  spread/rename; scheduler plan frozen hiện chỉ tiêu thụ seam đó.
- Có một conflict external đã biết với draft modular về scalar ownership.
  Foundation không sửa plan modular: canonical producer vẫn chỉ là nested
  `context.schedulerOptions`; controller phải giải quyết mọi consumer scalar
  ở plan owner đó trước CI-integration.
- Canonical HTTP/scheduler boundary: dispatcher `GET /api/thongtin` awaits the
  one memoized universe-bootstrap exactly once, then `API.thongTin()` is
  synchronous/pure over its resolved primitive seed. `/api/he` awaits named
  `last-seen` and then awaited `system-read`; only `command.run` is synchronous,
  while public `runCommand` may return a Promise. `app.start()` awaits the
  scheduler's own `start()` resolution; durable may resolve in standby, with
  `getStatus()` retaining 503 admission, whereas a rejected start follows this
  foundation cleanup/original-error path. External scheduler implementation must
  align with this rule; modular CI/owner patches remain owned outside this plan.
- Orbital UI consumes source manifest and safe loader, keeps static file://
  shell order, and does not fork version/API contracts.
- Modularization consumes the foundation only after both durable and UI plans;
  references must say **modular Tasks 1–5 / CI-integration Tasks 6–7**.

Rollback is per commit and must include `package.json` plus lock together.
Never downgrade state JSON/schema: a future `G.STATE_VERSION` rejects old code;
restore a pre-migration SQLite backup or issue forward fix. Rebuild `dist` from
the rollback commit; never edit artifact by hand.

## Final self-audit record

- Every task names all create/modify paths and commit intent; Task 1 alone owns
  package/lock, writes the exact script map after official install and before
  `npm ci`, and honestly remains RED/BLOCKED until registry/cache returns.
  Tasks 2–5 retain source-only snapshots, with Task 2 Step 6–7 and Task 4
  Step 5–6 explicitly reopened rather than falsely counted final-green.
- Task 2 names static Playwright import, `checkTree`, exact EPERM-only fallback,
  258-line baseline/reflow, `spawnSync.result.error` file/code failure, and
  honest bind/UI outcomes. Task 4's descriptor/reload is an existing-green
  characterization (not a fabricated source RED); it preserves Task-4 artifact
  hashes because no browser input changes.
- Task 3 is closed-world/order/hash based and covers all adversarial classes;
  Task 4 includes immutable alias, additive API and both generated artifacts.
- Task 5 records all six approved paths and rollback-only/observer/thenable
  behavior. Task 6 has table-driven precedence/alias warnings, only nested
  `schedulerOptions`, acquired-resource lifecycle cleanup/original-error
  precedence including construction/second-timer failure, fake clock through
  `G.moiGame`, and exhaustive synchronous
  `G.HOOK` instance binding/restoration. Task 7 covers every named durable
  family, Promise-returning bridge values, readiness-before-auth versus
  barrier-after-auth, full DB snapshots, and the version fixture update. Task 8
  has explicit one-global cache policy, retry cleanup, re-export, no dynamic
  execution and file://.
- Completion/CI invokes package-contract plus each direct quality, artifact,
  version, UoW, factory, entrypoint, and loader regression in addition to the
  frozen package command contract; it never claims package/UI GREEN while Task
  1 is blocked.
- Không còn nhãn công việc chưa xác định hay chỗ trống ellipsis, helper dùng
  trước khi được khai báo,
  khẳng định patch Node tương lai, hay source-shape gate trong implementation
  body.
