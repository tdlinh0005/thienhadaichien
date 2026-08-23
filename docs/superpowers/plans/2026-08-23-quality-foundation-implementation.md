# Quality Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo nền chất lượng tái lập, factory server quan sát được và loader an toàn mà không phá game chạy trực tiếp từ file://index.html.

**Architecture:** Manifest nguồn là chuẩn duy nhất cho HTML, build và loader. Server chuyển từ side effect khi require sang taoUngDung(options), inject clock/logger/kho, và chỉ công bố scheduler bridge; durable scheduler sau đó thay bridge rỗng bằng taoScheduler(context). Các kiểm thử thực thi command/HTTP và artifact thay vì grep cấu trúc source.

**Tech Stack:** Node.js CommonJS, npm/package-lock, playwright dev-only, Node assert, SQLite kho hiện hữu, GitHub Actions.

**Spec:** [quality-maintainability design](../specs/2026-08-23-quality-maintainability-design.md)

## Global Constraints

- Node engine giữ chính xác package contract >=22.5, trừ một thay đổi được phê duyệt độc lập.
- playwright chỉ là devDependency exact-pinned sau khi npm metadata chính thức xác nhận tương thích; production dependencies vẫn rỗng.
- Browser phải tiếp tục mở từ file://index.html, không runtime import mạng và không server bắt buộc.
- releaseVersion chuẩn là package.json.version; historicalLabel và stateVersion là metadata khác.
- dbPath ưu tiên options.dbPath, THDC_DB, rồi server/data/thdc.db; :memory: chỉ hợp lệ khi allowMemoryDb === true.
- TaoScheduler thật thuộc scheduler plan; bridge foundation giữ cùng interface và chỉ app.scheduler được public.
- Không giữ allowlist execution sau Task 8; không dùng source-string/change-detector thay cho behavior test.

**Không làm trong kế hoạch này:** durable scheduler thực sự, tái thiết kế orbital UI, hoặc big-bang chuyển toàn bộ engine/UI sang ES module. Hai công việc đó lần lượt thuộc [scheduler plan](../specs/2026-08-23-durable-event-scheduler-design.md) và [UI plan](../specs/2026-08-23-ui-modernization-design.md).

## File Structure

| Path | Trách nhiệm sau kế hoạch |
|---|---|
| package.json, package-lock.json | engine, exact dev tool, script contract |
| tools/source-manifest.js | danh sách browser assets chuẩn duy nhất |
| tools/check-version.js | release, historical và schema version contract |
| server/clock.js, server/logger.js | seam determinism/observability |
| server/db.js | Kho và Unit-of-Work lồng nhau |
| server/app.js | taoUngDung lifecycle, policy DB, dependency injection |
| server/scheduler/contract.js | scheduler bridge rỗng cùng API durable scheduler |
| tools/check-*.js, tools/test-*.js | cổng behavior và harness lệnh |
| server/rules-loader.js | loader CommonJS có thứ tự manifest, không tự diễn dịch source |

---

## Thứ tự bắt buộc và hợp đồng xuất bản

Chuỗi tích hợp là: foundation Tasks 1–8 → durable scheduler → orbital UI → modularization Tasks 1–4 → CI/integration Tasks 5–6.

- package engines giữ >=22.5 trừ khi một thay đổi được phê duyệt riêng.
- Runtime production giữ zero dependency: mọi package mới chỉ ở devDependencies; client vẫn hoạt động từ file://index.html và không có runtime import mạng.
- Phiên bản release chuẩn là package.json.version. Nhãn lịch sử và trạng thái migration lưu riêng; chúng không thay phiên bản release.
- Task 5 tạo bridge rỗng server/scheduler/contract.js::taoScheduler(context); scheduler plan thay implementation bằng server/scheduler/index.js::taoScheduler(context) cùng shape. Factory chỉ tiêu thụ factory này, không tự định nghĩa scheduler bền.
- UI plan tiêu thụ manifest và loader của Tasks 3, 8; nó không tự ý đổi thứ tự script.

## Interfaces tạo ra bởi foundation

| Interface | Producer | Consumer |
|---|---|---|
| package scripts: check:syntax, lint, check:version, check:artifact, test:core, test:server, test:scheduler, test:load, test:ui, test:all | Tasks 1–3, 7 | CI Tasks 5–6, scheduler/UI plans |
| tools/source-manifest.js | Task 3 | build, rules loader, UI plan |
| G.PHIEN_BAN_LICH_SU, G.VERSION alias | Task 4 | server API, UI, migration tests |
| taoUngDung(options) | Task 6 | server entrypoint, scheduler plan, integration |
| clock/logger/kho seams | Tasks 5–6 | server tests, scheduler |
| app.scheduler bridge | Tasks 5–7 | API, scheduler plan |
| loader an toàn, allowlist rỗng | Task 8 | browser/node runners, UI plan |

### Task 1: Khóa công cụ dev và dựng lệnh nền

**Files:**
- Modify: package.json:1-18
- Modify: package-lock.json
- Create: tools/test-package-contract.js

**Interfaces:**
- Consumes: package.json engines hiện tại tại dòng 5 và scripts tại dòng 6-14.
- Produces: package contract engines.node === ">=22.5"; devDependencies.playwright là exact string; các scripts chất lượng gọi được qua npm run.

- [ ] **Step 1: Viết failing package contract**

~~~js
const assert = require("node:assert/strict");
const pkg = require("../package.json");
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
  "test:all": "npm run check:syntax && npm run lint && npm run check:version && npm run build && npm run check:artifact && npm run test:core && npm run test:server && npm run test:scheduler && npm run test:load && npm run test:ui"
};
function isExact(v) {
  return typeof v === "string" && v.split(".").length === 3 &&
    !v.includes("^") && !v.includes("~") && !v.includes("*");
}
assert.equal(pkg.engines.node, ">=22.5");
assert.deepEqual(pkg.dependencies, {});
assert.ok(isExact(pkg.devDependencies && pkg.devDependencies.playwright));
assert.equal(Object.hasOwn(pkg.dependencies, "playwright"), false);
for (const [name, command] of Object.entries(expectedScripts)) {
  assert.equal(pkg.scripts[name], command, name);
}
~~~

Lưu tools/test-package-contract.js. Run: node tools/test-package-contract.js. Expected: FAIL vì devDependency exact và scripts quality chưa tồn tại.

- [ ] **Step 2: Xác minh và pin Playwright**

Run:

~~~bash
npm view playwright version engines --json
PLAYWRIGHT_VERSION="$(npm view playwright version)"
npm install --save-dev --save-exact "playwright@$PLAYWRIGHT_VERSION"
~~~

Expected: metadata xác nhận release được chọn tương thích Node >=22.5, package.json và package-lock.json ghi cùng exact release không có ^ hay ~. Không thay engines.node.

- [ ] **Step 3: Implement exact package contract**

Copy nguyên object expectedScripts ở Step 1 vào package.json scripts, giữ start/test:luat compatibility, thêm test:core, và không thêm script alias thay thế. dependencies phải đúng {}. test và test:all đều phải có test:scheduler đúng một lần trong chuỗi. Không đổi engines.node.

- [ ] **Step 4: GREEN**

Run: npm ci && node tools/test-package-contract.js. Expected: PASS; lockfile có dev-only exact Playwright và production dependency vẫn rỗng.

- [ ] **Step 5: Commit intent**

Nếu sandbox cho phép index Git, run: git add package.json package-lock.json tools/test-package-contract.js && git commit -m "build: pin playwright and declare quality commands". Nếu .git read-only, controller chụp snapshot diff và lưu đúng commit message này để thực hiện ngoài sandbox; npm ci/test PASS mới là completion gate.

### Task 2: Syntax/lint và cổng cấm thực thi động

**Files:**
- Create: tools/check-syntax.js
- Create: tools/lint.js
- Create: tools/test-quality-gate.js
- Modify: package.json:6-14

**Interfaces:**
- Consumes: scripts Task 1 và hai legacy paths server/rules.js, tools/smoke.js.
- Produces: tools/lint.js::{lintText,checkFile,checkTree,LEGACY_EXECUTION_ALLOWLIST}; Task 8 sẽ đưa allowlist về rỗng.

- [ ] **Step 1: Viết behavior RED không tự kích hoạt lint**

~~~js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {lintText, checkFile} = require("./lint.js");
function expectFailure(fn, code) { assert.throws(fn, new RegExp(code)); }
function fixture(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-q-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text); return file;
}
function callText(parts) { return parts.join(""); }
const forbiddenSources = [
  callText(["e", "val", "(", "\"1\"", ")"]),
  callText(["Fun", "ction", "(", "\"return 1\"", ")"]),
  callText(["im", "port", "(", "\"x\"", ")"]),
  callText(["node", ":", "vm"])
];
assert.ok(lintText("const a=1;\tconst b=2;", "any.js").some(x => x.rule === "no-tab"));
assert.ok(lintText("const a=1;  \n", "any.js").some(x => x.rule === "trailing-space"));
assert.ok(lintText("x".repeat(121), "any.js").some(x => x.rule === "max-line"));
for (const text of ["\tconst a=1;", "const a=1;\t", ...forbiddenSources]) {
  expectFailure(() => checkFile(fixture("outside.txt", text)), "forbidden|no-tab");
}
~~~

Lưu tools/test-quality-gate.js. Run: node tools/test-quality-gate.js. Expected: FAIL Cannot find module ./lint.js. Test fixture là .txt, nên checker được gọi trực tiếp nhưng JS walker không tự lint source của test. Nó không chứa lexical dynamic-execution call nào.

- [ ] **Step 2: Implement checker/CLI và allowlist tạm**

~~~js
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
const LEGACY_EXECUTION_ALLOWLIST = new Set(["server/rules.js", "tools/smoke.js"]);
const DYNAMIC_PATTERNS = [
  new RegExp("(^|[^.$A-Za-z0-9_])" + ["e", "val"].join("") + "\\s*\\("),
  new RegExp("(^|[^.$A-Za-z0-9_])" + ["Fun", "ction"].join("") + "\\s*\\("),
  new RegExp(["im", "port"].join("") + "\\s*\\("),
  new RegExp(["node", ":", "vm"].join(""))
];
function lintText(text, file) {
  const errors = [];
  for (const [i, line] of text.split("\n").entries()) {
    if (line.includes("\t")) errors.push({file, line: i + 1, rule: "no-tab"});
    if (/[ \t]+$/.test(line)) errors.push({file, line: i + 1, rule: "trailing-space"});
    if (line.length > 120 && !line.includes("lint-allow-line")) {
      errors.push({file, line: i + 1, rule: "max-line"});
    }
  }
  return errors;
}
function checkFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  if (!LEGACY_EXECUTION_ALLOWLIST.has(rel) && DYNAMIC_PATTERNS.some(rx => rx.test(text))) {
    throw new Error("forbidden dynamic execution: " + rel);
  }
  const errors = lintText(text, rel);
  if (errors.length) throw new Error(errors.map(x => x.file + ":" + x.line + " " + x.rule).join("\n"));
}
function listSourceFiles() {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|mjs)$/.test(file)) files.push(file);
    }
  }
  for (const dir of ["js", "server", "tools", "web/js"]) walk(path.join(root, dir));
  return files.sort();
}
function main() {
  const failures = [];
  for (const file of listSourceFiles()) {
    try { checkFile(file); } catch (error) { failures.push(error.message); }
  }
  if (failures.length) {
    process.stderr.write(failures.join("\n") + "\n");
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = {lintText, checkFile, listSourceFiles, main, LEGACY_EXECUTION_ALLOWLIST};
~~~

Export API trên từ tools/lint.js. listSourceFiles chỉ quét js, server, tools, web/js .js/.mjs, không quét dist hoặc .txt fixture. CLI luôn in path:dòng và đặt exit nonzero khi lỗi. Allowlist đúng hai file nêu trên, không wildcard.

- [ ] **Step 3: Add syntax CLI và script bodies**

~~~js
const {spawnSync} = require("node:child_process");
const {listSourceFiles} = require("./lint.js");
let failed = false;
for (const file of listSourceFiles()) {
  const result = spawnSync(process.execPath, ["--check", file], {encoding: "utf8"});
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(file + "\n" + result.stderr);
  }
}
if (failed) process.exitCode = 1;
~~~

Lưu tools/check-syntax.js; package scripts là check:syntax = node tools/check-syntax.js và lint = node tools/lint.js. Run: node tools/check-syntax.js. Expected: exit 0 trước refactor format vì cú pháp hiện tại hợp lệ.

- [ ] **Step 4: Reflow cơ học hữu hạn — nhóm lõi/browser**

Trước khi sửa, chạy:

~~~bash
find js server tools web/js -type f \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 awk 'length($0)>120{c[FILENAME]++} END{for(f in c) print f ":" c[f]}' | sort
~~~

Expected: đúng 258 dòng trên 120 ký tự trong 18 file. Reflow chỉ tách expression, object, điều kiện, callback hoặc string concat mà không đổi token/logic; không đổi indent bằng tab. Hoàn thành các file/count sau: js/ui.js:116, js/fleet.js:26, js/data.js:10, js/galaxy.js:5, js/engine.js:4, js/actions.js:2, js/app.js:1, js/combat.js:1, js/main.js:1, js/util.js:1.

- [ ] **Step 5: Reflow cơ học hữu hạn — nhóm server/tools/MP**

Tiếp tục cùng quy tắc với: server/db.js:8, server/world.js:14, tools/build.js:2, tools/smoke.js:11, tools/test-mp-ui.mjs:9, tools/test-server.js:31, tools/test-tai.js:2, web/js/mp.js:14. Chỉ khi URL hoặc chuỗi tư liệu không thể tách mà vẫn phải vượt giới hạn thì thêm đúng một chú thích cuối dòng lint-allow-line giải thích URL/tư liệu đó; không dùng annotation cho code, không dùng baseline/wildcard.

- [ ] **Step 6: GREEN**

Run: node tools/test-quality-gate.js && npm run check:syntax && npm run lint. Expected: PASS; fixture .txt bị chặn cho bốn dạng dynamic execution, mọi tab bị bắt, mọi code line <=120 trừ annotation URL/tư liệu được kiểm từng dòng, và hai legacy file tạm được phép.

- [ ] **Step 7: Commit**

Nếu sandbox cho phép index Git, run: git add package.json tools/check-syntax.js tools/lint.js tools/test-quality-gate.js js server tools web/js && git commit -m "test: add syntax lint and dynamic execution gate". Nếu .git read-only, controller phải chụp working-tree snapshot và ghi commit intent cùng lệnh này; staging/commit không phải điều kiện đánh giá correctness.

### Task 3: Manifest nguồn và kiểm tra hai artifact build

**Files:**
- Create: tools/source-manifest.js
- Create: tools/check-artifact.js
- Create: tools/test-artifact.js
- Modify: tools/build.js:1-120
- Modify: index.html:10,64-73
- Modify: web/index.html:10,81-90
- Modify: package.json:6-14

**Interfaces:**
- Consumes: browser script/style order hiện có trong index.html:10,64-73, web/index.html:10,81-90 và tools/build.js:1-120.
- Produces: tools/source-manifest.js::{browserScripts,mpScripts,rulesScripts,browserStyles,artifactOutputs,styleHashes,scriptHashes}; tools/check-artifact.js::{checkArtifactText,checkArtifacts,checkStaticShells}. UI plan và Tasks 8, modularization tiêu thụ không đổi thứ tự.

- [ ] **Step 1: Viết RED artifact checker hoàn chỉnh**

~~~js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const {checkArtifactText, checkArtifacts, checkStaticShells} = require("./check-artifact.js");
function hash(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
const style = "body{}";
const sourceA = "A();";
const sourceB = "B();";
const manifest = {
  browserStyles: ["css/style.css"],
  browserScripts: ["js/a.js", "js/b.js"],
  mpScripts: ["js/a.js", "js/b.js", "web/js/mp.js"],
  artifactOutputs: ["dist/thien-ha-dai-chien.html", "dist/artifact.html"],
  styleContents: {"css/style.css": style},
  styleHashes: {"css/style.css": hash(style)},
  scriptContents: {"js/a.js": sourceA, "js/b.js": sourceB},
  scriptHashes: {"js/a.js": hash(sourceA), "js/b.js": hash(sourceB)}
};
const goodHtml = '<style data-source="css/style.css" data-sha256="' + manifest.styleHashes["css/style.css"] + '">' +
  style + '</style><script>/* source: js/a.js sha256:' + manifest.scriptHashes["js/a.js"] + ' */\n' +
  sourceA + '\n/* source: js/b.js sha256:' + manifest.scriptHashes["js/b.js"] + ' */\n' + sourceB + "</script>";
const badHtml = '<link rel="stylesheet" href="css/style.css"><script src="js/a.js"></script>';
const badHashHtml = goodHtml.replace(manifest.styleHashes["css/style.css"], "wrong");
const badScriptHtml = goodHtml.replace(sourceA, "Z();");
const soloShell = '<link rel="stylesheet" href="css/style.css"><script src="js/a.js"></script><script src="js/b.js"></script>';
const mpShell = '<link rel="stylesheet" href="/css/style.css"><script src="/js/a.js"></script><script src="/js/b.js"></script><script src="/web/js/mp.js"></script>';
assert.doesNotThrow(() => checkArtifactText("dist/thien-ha-dai-chien.html", goodHtml, manifest));
assert.throws(() => checkArtifactText("dist/artifact.html", badHtml, manifest));
assert.throws(() => checkArtifactText("dist/artifact.html", badHashHtml, manifest));
assert.throws(() => checkArtifactText("dist/artifact.html", badScriptHtml, manifest));
assert.doesNotThrow(() => checkStaticShells(soloShell, mpShell, manifest));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-artifact-"));
for (const output of manifest.artifactOutputs) fs.mkdirSync(path.dirname(path.join(root, output)), {recursive: true});
fs.writeFileSync(path.join(root, "dist/thien-ha-dai-chien.html"), goodHtml);
fs.writeFileSync(path.join(root, "dist/artifact.html"), goodHtml);
assert.doesNotThrow(() => checkArtifacts(root, manifest));
~~~

Lưu tools/test-artifact.js. Run: node tools/test-artifact.js. Expected: FAIL Cannot find module ./check-artifact.js.

- [ ] **Step 2: Implement manifest/checker**

tools/source-manifest.js export chính xác:

~~~js
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
}
const browserStyles = ["css/style.css"];
const browserScripts = ["js/data.js","js/util.js","js/galaxy.js","js/combat.js","js/engine.js","js/fleet.js","js/actions.js","js/ui.js","js/app.js","js/main.js"];
const mpScripts = ["js/data.js","js/util.js","js/galaxy.js","js/combat.js","js/engine.js","js/fleet.js","js/actions.js","js/ui.js","js/app.js","web/js/mp.js"];
const rulesScripts = ["js/data.js","js/util.js","js/galaxy.js","js/combat.js","js/engine.js","js/fleet.js","js/actions.js"];
module.exports = {
  browserStyles, browserScripts, mpScripts, rulesScripts,
  artifactOutputs: ["dist/thien-ha-dai-chien.html","dist/artifact.html"],
  styleContents: Object.fromEntries(browserStyles.map(file => [file, fs.readFileSync(path.join(root, file), "utf8")])),
  styleHashes: Object.fromEntries(browserStyles.map(file => [file, sha256File(file)])),
  scriptContents: Object.fromEntries([...new Set([...browserScripts, ...mpScripts])].map(file => [file, fs.readFileSync(path.join(root, file), "utf8")])),
  scriptHashes: Object.fromEntries([...new Set([...browserScripts, ...mpScripts])].map(file => [file, sha256File(file)]))
};
~~~

Tại tools/check-artifact.js define trước khi export:

~~~js
const fs = require("node:fs");
const path = require("node:path");
function normalizeAsset(value) { return String(value).replace(/^\/+/, ""); }
function assetList(html, tag, attribute) {
  const expression = new RegExp("<" + tag + "\\b[^>]*\\b" + attribute + "=[\"']([^\"']+)[\"']", "gi");
  return [...html.matchAll(expression)].map(match => normalizeAsset(match[1]));
}
function stylesheetList(html) {
  const expression = /<link\b(?=[^>]*\brel=[\"']stylesheet[\"'])[^>]*\bhref=[\"']([^\"']+)[\"']/gi;
  return [...html.matchAll(expression)].map(match => normalizeAsset(match[1]));
}
function sameArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(label + " differs from manifest");
}
function checkArtifactText(name, text, manifest) {
  for (const file of manifest.browserStyles) {
    const hash = manifest.styleHashes[file];
    const actualHash = crypto.createHash("sha256").update(manifest.styleContents[file]).digest("hex");
    if (actualHash !== hash) throw new Error("style hash mismatch for " + file);
    const marker = '<style data-source="' + file + '" data-sha256="' + hash + '">';
    if (!text.includes(marker)) throw new Error("missing style marker " + file + " in " + name);
    if (!text.includes(marker + manifest.styleContents[file] + "</style>")) {
      throw new Error("inline CSS content differs for " + file + " in " + name);
    }
  }
  let at = -1;
  for (const file of manifest.browserScripts) {
    const marker = "/* source: " + file + " sha256:" + manifest.scriptHashes[file] + " */";
    const next = text.indexOf(marker);
    if (next <= at) throw new Error("missing or out-of-order " + file + " in " + name);
    if (crypto.createHash("sha256").update(manifest.scriptContents[file]).digest("hex") !== manifest.scriptHashes[file]) {
      throw new Error("script hash mismatch for " + file);
    }
    if (text.indexOf(marker + "\n" + manifest.scriptContents[file], next) !== next) {
      throw new Error("inline JavaScript content differs for " + file + " in " + name);
    }
    at = next;
  }
  if (/<script\b[^>]*\bsrc=|<link\b[^>]*\brel=[\"']stylesheet[\"']/.test(text)) {
    throw new Error("runtime asset not inline in " + name);
  }
  if (/\b(src|href)=[\"'](?:file:|\/(?:Users|home|tmp)\/|[A-Za-z]:\\)/.test(text)) {
    throw new Error("absolute development asset in " + name);
  }
}
function checkArtifacts(root, manifest) {
  for (const output of manifest.artifactOutputs) {
    const file = path.join(root, output);
    if (!fs.existsSync(file)) throw new Error("missing " + output);
    checkArtifactText(output, fs.readFileSync(file, "utf8"), manifest);
  }
}
function checkStaticShells(soloHtml, mpHtml, manifest) {
  sameArray(assetList(soloHtml, "script", "src"), manifest.browserScripts, "index.html scripts");
  sameArray(assetList(mpHtml, "script", "src"), manifest.mpScripts, "web/index.html scripts");
  sameArray(stylesheetList(soloHtml), manifest.browserStyles, "index.html styles");
  sameArray(stylesheetList(mpHtml), manifest.browserStyles, "web/index.html styles");
}
function main() {
  const root = path.join(__dirname, "..");
  const manifest = require("./source-manifest.js");
  checkStaticShells(
    fs.readFileSync(path.join(root, "index.html"), "utf8"),
    fs.readFileSync(path.join(root, "web", "index.html"), "utf8"),
    manifest
  );
  checkArtifacts(root, manifest);
}
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
module.exports = {checkArtifactText, checkArtifacts, checkStaticShells};
~~~

Use manifest cho index.html, web/index.html, tools/build.js:1-120 và rules loader; build phải ghi đủ CSS thật lẫn data-source/data-sha256 marker và exact CSS bytes, mỗi script thật lẫn source/hash marker và exact source bytes theo manifest order vào cả hai single-file HTML. checkStaticShells đọc static shell thật; anchor HTTPS tài liệu hợp lệ vì checker chỉ xét runtime asset tag, không xét mọi href.

- [ ] **Step 3: Wire build**

Sửa tools/build.js:1-120 require("./source-manifest.js") thay danh sách hardcode, dùng manifest.artifactOutputs thay literal output, phát hai artifact bằng hai lần build, và thêm check:artifact = node tools/check-artifact.js trong package.json. Sửa index.html:64-73 và web/index.html:81-90 chỉ theo manifest order; không runtime import/ES module. CLI check-artifact phải gọi checkStaticShells(fs.readFileSync("index.html"), fs.readFileSync("web/index.html"), manifest) trước checkArtifacts.

- [ ] **Step 4: GREEN**

Run: npm run build && node tools/test-artifact.js && npm run check:artifact && git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html. Expected: PASS; hoán đổi manifest copy, thẻ src game, link CSS hoặc thiếu marker tạo FAIL trong checkArtifactText.

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add tools/source-manifest.js tools/build.js tools/check-artifact.js tools/test-artifact.js index.html web/index.html package.json && git commit -m "build: make source manifest and artifacts verifiable". Nếu .git read-only, controller lưu snapshot/diff và commit intent; artifact and shell checks vẫn bắt buộc pass.

### Task 4: Hợp đồng phiên bản release và migration quan sát được

**Files:**
- Create: tools/check-version.js
- Create: tools/test-version-contract.js
- Modify: package.json:1-18
- Modify: js/data.js:10-15
- Modify: server/api.js:60-520
- Modify: js/engine.js:1-900
- Modify: js/main.js:1-190
- Modify: js/ui.js:1340-1370
- Modify: web/js/mp.js:260-285,620-640
- Modify: README.md:1-120
- Modify: server/index.js:125-140

**Interfaces:**
- Consumes: package.json.version, G từ server/rules.js và SQLite cauhinh.stateVersion.
- Produces: G.PHIEN_BAN_LICH_SU, G.VERSION read-compatible alias trong một release, API {releaseVersion,phienBanLichSu,stateVersion,phienBan}; migration behavior quan sát được.

- [ ] **Step 1: Viết RED version/migration test quan sát được**

~~~js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const pkg = require("../package.json");
const {G} = require("../server/rules.js");
const {API} = require("../server/api.js");
const {Kho} = require("../server/db.js");
const {TheGioi} = require("../server/world.js");
function tempDb() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "thdc-version-")), "game.sqlite");
}
function oldState() {
  const state = G.moiGame("Cựu Chỉ Huy", "VERSION-OLD");
  state.v = 3; delete state.moHinhCT; delete state.moHinhNhip; delete state.moHinhQuyDao;
  return state;
}
assert.equal(G.PHIEN_BAN_LICH_SU, "1.35b-r2");
assert.equal(G.VERSION, G.PHIEN_BAN_LICH_SU);
assert.match(pkg.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
const state = oldState(); G.nangCapState(state, 1700000000);
assert.equal(state.v, G.STATE_VERSION);
assert.equal(state.moHinhCT, "so-luong-v1");
assert.equal(state.moHinhNhip, "bao-tri-dan-su-v1");
assert.equal(state.moHinhQuyDao, "giu-quy-dao-v1");
assert.throws(() => G.nangCapState({v: G.STATE_VERSION + 1}), /mới hơn engine/);
const api = new API({q: {tkDem: {get: () => ({n: 0})}, htDem: {get: () => ({n: 0})}}}, {seed: () => "seed"});
const info = api.thongTin();
assert.equal(info.releaseVersion, pkg.version);
assert.equal(info.phienBanLichSu, G.PHIEN_BAN_LICH_SU);
assert.equal(info.stateVersion, G.STATE_VERSION);
assert.equal(info.phienBan, G.VERSION);
const kho = new Kho(tempDb());
const world = new TheGioi(kho);
world.nangCapDuLieu();
assert.equal(kho.cauhinh("stateVersion"), String(G.STATE_VERSION));
kho.dong();
~~~

Lưu tools/test-version-contract.js. Run: node tools/test-version-contract.js. Expected: FAIL vì PHIEN_BAN_LICH_SU và API fields mới chưa tồn tại.

- [ ] **Step 2: Implement canonical names**

Trong js/data.js:12 thay hằng bằng:

~~~js
G.PHIEN_BAN_LICH_SU = "1.35b-r2";
G.VERSION = G.PHIEN_BAN_LICH_SU; // alias đọc tương thích trong release chuyển tiếp
~~~

server/api.js đọc releaseVersion trực tiếp từ require("../package.json").version, và thongTin trả:

~~~js
releaseVersion: releaseVersion,
phienBanLichSu: G.PHIEN_BAN_LICH_SU,
stateVersion: G.STATE_VERSION,
phienBan: G.VERSION
~~~

Chuyển consumer nội bộ js/main.js, js/ui.js, web/js/mp.js, README.md và banner server/index.js sang tên canonical; chỉ compatibility output giữ phienBan/G.VERSION alias.

- [ ] **Step 3: Implement executable gate**

tools/check-version.js chạy cùng API/migration/temp-SQLite assertion của test, kiểm tra SemVer, historical label khác state version, STATE_VERSION positive integer, state cũ migration idempotent byte-for-byte sau lần thứ hai, future state bị từ chối, và sau bootstrap cauhinh.stateVersion === String(G.STATE_VERSION). Nó không tìm chuỗi source hay marker bằng grep.

- [ ] **Step 4: GREEN**

Run: node tools/test-version-contract.js && npm run check:version && npm run test:core && npm run test:server. Expected: PASS; release, history, schema tách rõ; cauhinh.stateVersion bằng G.STATE_VERSION sau server bootstrap.

- [ ] **Step 5: Commit intent**

Nếu sandbox cho phép index Git, run: git add package.json js/data.js js/engine.js js/main.js js/ui.js web/js/mp.js server/api.js server/index.js README.md tools/check-version.js tools/test-version-contract.js && git commit -m "feat: define canonical release version contract". Nếu .git read-only, controller lưu snapshot/diff và commit intent; version gate PASS vẫn là completion gate.

### Task 5: Clock và UoW re-entrant làm tiền đề server

**Files:**
- Modify: server/db.js:1-420
- Create: server/clock.js
- Create: server/logger.js
- Create: server/scheduler/contract.js
- Create: tools/test-uow.js

**Interfaces:**
- Consumes: Kho hiện có ở server/db.js:172-420.
- Produces: taoClock({nowMs}), taoLogger(sink), kho.trongGiaoDich(fn,{immediate}), scheduler contract taoScheduler(context); giaoDich alias tương thích.

- [ ] **Step 1: Viết RED nested UoW**

~~~js
const assert = require("node:assert/strict");
const {Kho} = require("../server/db.js");
const {taoClock} = require("../server/clock.js");
const {taoLogger} = require("../server/logger.js");
const {taoScheduler} = require("../server/scheduler/contract.js");
const clock = taoClock({nowMs: () => 1700000000000});
const records = [];
const sink = Object.fromEntries(["debug", "info", "warn", "error"].map(level => [level, entry => records.push(entry)]));
const logger = taoLogger(sink);
const events = [];
assert.throws(() => new Kho(":memory:"), /allowMemoryDb/);
const kho = new Kho(":memory:", {allowMemoryDb: true, clock, logger, onTransaction: e => events.push(e)});
kho.trongGiaoDich(() => kho.trongGiaoDich(() => kho.cauhinh("probe", "1")), {immediate: true});
assert.deepEqual(events, ["begin-immediate", "commit"]);
assert.throws(() => kho.trongGiaoDich(() => kho.trongGiaoDich(() => {
  kho.cauhinh("rollback", "no"); throw new Error("nested");
})), /nested/);
assert.equal(kho.cauhinh("rollback"), null);
assert.throws(() => kho.trongGiaoDich(() => Promise.resolve()), /async/);
const bridge = taoScheduler({kho, clock, logger});
bridge.runCommand({name: "probe", run: () => kho.cauhinh("bridge", "1")});
assert.equal(kho.cauhinh("bridge"), "1");
logger.info({event: "probe", at: clock.nowMs(), password: "secret", token: "secret", state: {hidden: true}});
assert.deepEqual(records.at(-1), {event: "probe", at: 1700000000000, password: "[redacted]", token: "[redacted]", state: "[redacted]"});
kho.dong();
~~~

Lưu tools/test-uow.js. Run: node tools/test-uow.js. Expected: FAIL vì clock/logger/scheduler modules chưa có và Kho chưa nhận options/trongGiaoDich.

- [ ] **Step 2: Implement clock/logger và UoW**

~~~js
// server/clock.js
"use strict";
function taoClock({nowMs = Date.now} = {}) { return {nowMs}; }
module.exports = {taoClock};
~~~

~~~js
// server/logger.js
"use strict";
const SENSITIVE_KEYS = new Set(["password", "mk", "salt", "muoi", "token", "body", "state"]);
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, SENSITIVE_KEYS.has(key) ? "[redacted]" : redact(item)]));
}
function taoLogger(sink = console) {
  return ["debug","info","warn","error"].reduce((out, level) => {
    out[level] = info => {
      if (!info || typeof info.event !== "string" || typeof info.at !== "number") throw new TypeError("structured log required");
      sink[level](redact(info));
    };
    return out;
  }, {});
}
module.exports = {taoLogger, redact};
~~~

~~~js
// server/scheduler/contract.js
"use strict";
function taoScheduler(context) {
  const {kho} = context;
  function runCommand(command) {
    if (!command || typeof command.name !== "string" || typeof command.run !== "function") throw new TypeError("invalid command");
    return kho.trongGiaoDich(() => {
      const value = command.run();
      if (value && typeof value.then === "function") throw new TypeError("UNIT_OF_WORK_ASYNC");
      return value;
    }, {immediate: true});
  }
  return {
    start: async () => {}, stop: async () => {},
    getStatus: () => ({state: "ready", ready: true, writerLeaseHeld: true, mode: "bridge"}),
    runCommand, schedule(){}, cancel(){}, reconcile(){}, advanceTo(){}
  };
}
module.exports = {taoScheduler};
~~~

Trong server/db.js:172-420, constructor trực tiếp từ chối ":memory:" trừ options.allowMemoryDb === true; factory không là lối tắt bypass policy. Constructor nhận onTransaction chỉ cho test cùng clock/logger. Outer depth 0 chạy đúng BEGIN IMMEDIATE khi immediate, gọi onTransaction("begin-immediate"), rồi commit/rollback một lần; nested chỉ gọi fn trên context đó và không BEGIN/COMMIT. Reject Promise result trong transaction để cấm await/network I/O. Giữ giaoDich là alias gọi trongGiaoDich. server/scheduler/contract.js export chính xác taoScheduler(context) trong snippet trên; đây là no-op bridge canonical trước factory.

- [ ] **Step 3: Add deterministic cases**

Thêm assertion immediate outer + nested normal không tạo BEGIN thứ hai, nested throw rollback state, async callback bị từ chối trước commit, timestamp game dùng Math.floor(clock.nowMs()/1000), và logger sink nhận {event,at,password:"[redacted]",token:"[redacted]",state:"[redacted]"} thay vì giá trị bí mật. Gọi taoScheduler({kho,clock,logger}).runCommand({name:"probe",run:() => kho.cauhinh("bridge","1")}) và assert một outer UoW.

- [ ] **Step 4: GREEN**

Run: node tools/test-uow.js && npm run test:server. Expected: PASS; không sleep/real clock và không nested BEGIN.

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add server/db.js server/clock.js server/logger.js server/scheduler/contract.js tools/test-uow.js && git commit -m "refactor: add clock logger and reentrant unit of work". Nếu .git read-only, controller lưu snapshot/diff và commit intent này.

### Task 6: Factory server, database policy và lifecycle idempotent

**Files:**
- Create: server/app.js
- Modify: server/index.js:1-144
- Modify: server/db.js:1-420
- Create: tools/test-server-factory.js
- Create: tools/test-server-entrypoint.js

**Interfaces:**
- Consumes: Kho.trongGiaoDich, taoClock, taoLogger, server/scheduler/contract.js::taoScheduler từ Task 5.
- Produces: taoUngDung({schedulerFactory,...}) -> {server,kho,tg,api,scheduler,start,stop,nhip,donRac,getStatus}; schedulerFactory là tùy chọn scheduler duy nhất, start/stop idempotent và không bind khi require.

- [ ] **Step 1: Viết RED factory/lifecycle test**

~~~js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {taoUngDung} = require("../server/app.js");
const {taoLogger} = require("../server/logger.js");
function tempDb() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "thdc-factory-")), "game.sqlite");
}
function fakeClock(ms) {
  let value = ms;
  return {nowMs: () => value, advance: delta => (value += delta)};
}
function recordingSchedulerFactory(context) {
  const calls = [];
  return {
    calls, context, start: async () => {}, stop: async () => {},
    getStatus: () => ({state: "ready", ready: true, writerLeaseHeld: true}),
    runCommand(command) { calls.push(command.name); return command.run(); },
    schedule(){}, cancel(){}, reconcile(){}, advanceTo(){}
  };
}
async function requestJson(base, pathname, body, token) {
  const res = await fetch(base + pathname, {
    method: body === undefined ? "GET" : "POST",
    headers: Object.assign({"content-type": "application/json"}, token ? {"x-thdc-token": token} : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {status: res.status, body: await res.json()};
}
async function main() {
  const clock = fakeClock(1700000000000);
  const records = [];
  const logger = taoLogger(Object.fromEntries(["debug", "info", "warn", "error"].map(level => [level, entry => records.push(entry)])));
  const dbPath = tempDb();
  assert.throws(() => taoUngDung({dbPath: ":memory:"}), /allowMemoryDb/);
  const app = taoUngDung({
    env: {PORT: "0", THDC_DB: dbPath, THDC_NHIP: "7", THDC_AM: "1", THDC_PROXY: "1"},
    clock, logger, schedulerFactory: recordingSchedulerFactory
  });
  assert.equal(app.server.listening, false);
  assert.equal(app.kho.duong, dbPath);
  assert.equal(app.scheduler.context.clock, clock);
  assert.equal(app.scheduler.context.logger, logger);
  assert.equal(app.scheduler.context.kho, app.kho);
  assert.equal(app.scheduler.context.tg, app.tg);
  await app.start(); await app.start();
  const base = "http://127.0.0.1:" + app.server.address().port;
  for (const pathname of ["/", "/index.html", "/motnguoi", "/solo"]) {
    assert.equal((await fetch(base + pathname)).status, 200, pathname);
  }
  const registered = await requestJson(base, "/api/dangky", {ten: "clock-a", mk: "mat-khau-1", hienthi: "Clock A"});
  assert.equal(registered.status, 200);
  const token = registered.body.token;
  const account = app.kho.q.tkTheoTen.get("clock-a");
  const session = app.kho.q.phienGet.get(token);
  assert.equal(account.tao, 1700000000);
  assert.equal(account.vaoCuoi, 1700000000);
  assert.equal(session.tao, 1700000000);
  assert.equal(session.hetHan, 1700000000 + 30 * 86400);
  assert.equal(app.kho.cauhinh("moLuc"), "1700000000");
  clock.advance(60_000);
  assert.equal((await requestJson(base, "/api/state", undefined, token)).status, 200);
  assert.equal(app.kho.q.tkTheoTen.get("clock-a").vaoCuoi, 1700000060);
  clock.advance((30 * 86400 + 1) * 1000);
  app.donRac();
  assert.equal(app.kho.q.phienGet.get(token), undefined);
  assert.ok(records.some(entry => entry.event === "server.started"));
  await app.stop(); await app.stop();
  assert.ok(records.some(entry => entry.event === "server.stopped"));
  const legacy = require("../server/index.js");
  assert.equal(typeof legacy.taoUngDung, "function");
  assert.equal(legacy.server.listening, false);
  legacy.kho.dong();
}
main().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
~~~

Tất cả helper được khai báo trước main; factory test không dùng sleep hay port cố định. Nó chứng minh fake clock đi qua API (tao/vaoCuoi/phien), TheGioi seed (moLuc), cleanup và context scheduler; Task 7 sẽ thêm assertion nhip/cleanup đã đi qua MutationGate. Run: node tools/test-server-factory.js. Expected: FAIL Cannot find module ../server/app.js.

- [ ] **Step 2: Implement option policy và factory**

Implement taoUngDung(options = {}) với default:

~~~js
const path = require("node:path");
const {Kho} = require("./db.js");
const {TheGioi} = require("./world.js");
const {API} = require("./api.js");
const {taoClock} = require("./clock.js");
const {taoLogger} = require("./logger.js");
const {taoScheduler: taoSchedulerMacDinh} = require("./scheduler/contract.js");
const rootDir = options.rootDir || path.join(__dirname, "..");
const env = options.env || process.env;
const logger = options.logger || taoLogger();
const clock = options.clock || taoClock();
const dbPath = options.dbPath || env.THDC_DB || path.join(rootDir, "server", "data", "thdc.db");
if (dbPath === ":memory:" && options.allowMemoryDb !== true) throw new Error("allowMemoryDb is test-only");
const configuredPort = options.port ?? Number.parseInt(env.PORT || "8080", 10);
const gameNow = () => Math.floor(clock.nowMs() / 1000);
const kho = options.kho || new Kho(dbPath, {allowMemoryDb: options.allowMemoryDb, clock, logger});
const tg = options.tg || new TheGioi(kho, {clock, logger});
const schedulerFactory = options.schedulerFactory || taoSchedulerMacDinh;
const scheduler = schedulerFactory({kho, tg, clock, logger, env});
const api = options.api || new API(kho, tg, {clock, logger, scheduler, gameNow});
~~~

options accepted: rootDir, port, dbPath, clock, logger, env, schedulerFactory, schedulerPollMs, schedulerLogTicks, tickMs alias, cleanupMs, allowMemoryDb. schedulerFactory is the sole scheduler injection point; there is no options.scheduler. Default is Task 5 no-op taoScheduler(context). `configuredPort` preserves options.port (including 0) then PORT then 8080. Poll precedence is schedulerPollMs, tickMs, env.SCHEDULER_POLL_MS, env.THDC_NHIP, default. Logging precedence is schedulerLogTicks then env.SCHEDULER_LOG_TICKS then env.THDC_AM. Every default is production-safe; options.env defaults process.env.

- [ ] **Step 3: Implement lifecycle/entrypoint**

Construct TheGioi(kho,{clock,logger}), API(kho,tg,{clock,logger,scheduler,gameNow}) and cleanup with the same clock; scheduler receives the same tg in schedulerFactory context. No game/session/cleanup code calls Date.now directly (the sole production adapter is server/clock.js). `start({port = configuredPort, host = "127.0.0.1"} = {})` idempotently bootstraps DB, calls scheduler.start(), and binds the listener once without waiting for durable recovery; thus a standby scheduler can answer healthz while readyz/gameplay remain unavailable. It admits gameplay only when scheduler.getStatus().ready is true; healthz/readyz/metrics remain available otherwise. `stop()` switches draining, rejects gameplay, stops scheduler/cleanup, closes listener/UoW/kho and resolves even if called twice. Emit structured `db.opened`, `server.started`, and `server.stopped` records with `at: clock.nowMs()`.

server/index.js must export a non-binding legacy facade and only create/start the production app under require.main:

~~~js
"use strict";
const {taoUngDung} = require("./app.js");
let legacy;
function legacyApp() { return legacy || (legacy = taoUngDung({env: process.env})); }
async function main() {
  const app = taoUngDung({env: process.env});
  const stop = async () => { await app.stop(); process.exitCode = 0; };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  await app.start();
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
module.exports = {
  taoUngDung,
  get server() { return legacyApp().server; }, get kho() { return legacyApp().kho; },
  get tg() { return legacyApp().tg; }, get api() { return legacyApp().api; }
};
~~~

`legacyApp()` may construct objects on property access but never binds a port or creates timers; the test closes its legacy kho. Preserve `THDC_DB`, `THDC_PROXY`, `THDC_NHIP`, `THDC_AM`, legacy tick aliases and static URLs exactly.

- [ ] **Step 4: GREEN**

Extend tools/test-server-factory.js with the shown monotonic fake clock: it advances from 1700000000000 to 1700000060000, performs register/state/cleanup, and asserts persisted tao/vaoCuoi/session expiry/cleanup cutoff derive from that clock. Assert injected factory receives exactly the same clock/logger/kho/tg, and a logger sink receives structured redacted server.started/db.opened/server.stopped records. Add an isolated `tools/test-server-entrypoint.js` that spawns `server/index.js` with `PORT=0` and `THDC_DB=temp.sqlite`, waits for its `server.started` stdout record, sends SIGTERM, and asserts exit code 0 within 2 seconds. Run: node tools/test-server-factory.js && npm run test:server && node tools/test-server-entrypoint.js. Expected: PASS; db path precedence is options.dbPath, THDC_DB, rootDir/server/data/thdc.db; direct Kho and factory both reject unapproved memory DB, require does not bind, and no real clock affects observable timestamps.

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add server/app.js server/index.js server/db.js server/api.js server/world.js tools/test-server-factory.js tools/test-server-entrypoint.js && git commit -m "refactor: create observable server factory". Nếu .git read-only, controller lưu snapshot/diff và commit intent này.

### Task 7: Gate ghi bền và harness scheduler thật

**Files:**
- Modify: server/app.js:1-260
- Modify: server/api.js:60-520
- Modify: server/world.js:1-1371
- Create: tools/test-scheduler.js
- Modify: package.json

**Interfaces:**
- Consumes: taoUngDung({schedulerFactory}), Kho.trongGiaoDich, clock/logger và server/scheduler/contract.js::taoScheduler từ Tasks 5–6.
- Produces: app.scheduler::{start,stop,getStatus,runCommand,schedule,cancel,reconcile,advanceTo}; runCommand({name,accountId?,run}) với run đồng bộ. Durable scheduler thay default bằng server/scheduler/index.js::taoScheduler(context) cùng shape, không thêm option scheduler thứ hai.

- [ ] **Step 1: Viết RED HTTP command harness**

~~~js
const test = require("node:test");
const assert = require("node:assert/strict");
function recordingSchedulerFactory(context) {
  const names = [];
  return {names, context, start: async () => {}, stop: async () => {}, getStatus(){ return {state: "ready", ready: true, writerLeaseHeld: true}; },
    runCommand(command) { names.push(command.name); return command.run(); },
    schedule(){}, cancel(){}, reconcile(){}, advanceTo(){}};
}
async function requestJson(base, method, pathname, body, token) {
  const res = await fetch(base + pathname, {method, headers: {"content-type":"application/json","x-thdc-token":token || ""}, body: body && JSON.stringify(body)});
  return {status: res.status, body: await res.json()};
}
~~~

Tạo app qua taoUngDung({schedulerFactory: recordingSchedulerFactory,...}). Hoàn thiện một test HTTP cho session creation/expiry/last-seen/logout, register/login, state-read, action, alliance, war, transfer, chat, mail, password/account deletion, cleanup, nhip và donRac. Assert names chứa chính xác session-create, session-expiry, last-seen, logout, register, login, state-read, action, alliance, war, transfer-galana, chat, mail, password-change, account-delete, cleanup, advance-due. Run: node --test tools/test-scheduler.js. Expected: FAIL vì factory/API chưa inject canonical bridge.

- [ ] **Step 2: Wire canonical bridge without a second contract**

server/app.js resolves exactly options.schedulerFactory || require("./scheduler/contract.js").taoScheduler, calls that factory once with {kho,tg,clock,logger,env}, and exposes only app.scheduler. API/world receive that bridge; app never exposes writer, transaction capability or a second scheduler option. Do not rename taoScheduler or wrap it in an incompatible adapter.

- [ ] **Step 3: Gate every durable mutation**

Inject scheduler in API/the world. Each route/nhip/donRac calls scheduler.runCommand with the named command. Session expiry/creation/last-seen/logout, register/login, state-read, action, alliance, war, transfer, chat, mail, password/account deletion, cleanup and advance-due must have a behavior assertion through the harness. Add throwingFactory whose runCommand throws before calling command.run; compare row/state snapshots before/after each mutation family to prove no persistent result changes. nhip and donRac must never call SQL/game write outside this wrapper.

- [ ] **Step 4: GREEN**

Run: node --test tools/test-scheduler.js && npm run test:scheduler && npm run test:server. Expected: PASS; harness is HTTP/behavioral, not source grep. Durable scheduler plan extends this real harness for server/scheduler/index.js::taoScheduler(context).

- [ ] **Step 5: Commit**

Nếu sandbox cho phép index Git, run: git add server/app.js server/api.js server/world.js tools/test-scheduler.js package.json && git commit -m "refactor: route durable writes through scheduler bridge". Nếu .git read-only, controller lưu snapshot/diff và commit intent này.

### Task 8: Loader an toàn và kết thúc allowlist

**Files:**
- Create: server/rules-loader.js
- Modify: server/rules.js:1-80
- Modify: tools/source-manifest.js:1-120
- Modify: tools/smoke.js:1-120
- Modify: tools/test-mp-ui.mjs:1-260
- Modify: tools/lint.js:1-220
- Modify: tools/test-quality-gate.js:1-180
- Create: tools/test-loader.js

**Interfaces:**
- Consumes: tools/source-manifest.js Task 3, lint Task 2.
- Produces: server/rules-loader.js::napLuat({rootDir,requireFn,globalObject}); server/rules.js re-export {G,THU_TU,napLuat}; LEGACY_EXECUTION_ALLOWLIST rỗng.

- [ ] **Step 1: Viết RED loader test độc lập, thứ tự và cache**

~~~js
const assert = require("node:assert/strict");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const manifest = require("./source-manifest.js");
const {napLuat} = require("../server/rules-loader.js");
function child(code) {
  return spawnSync(process.execPath, ["-e", code], {cwd: path.join(__dirname, ".."), encoding: "utf8"});
}
function recordingRequire(root, seen) {
  return function requireFile(file) {
    seen.push(path.relative(root, file).replaceAll(path.sep, "/"));
    return require(file);
  };
}
const root = path.join(__dirname, "..");
const seen = [];
const isolated = {};
const first = napLuat({rootDir: root, requireFn: recordingRequire(root, seen), globalObject: isolated});
const second = napLuat({rootDir: root, requireFn: recordingRequire(root, []), globalObject: isolated});
assert.deepEqual(seen, manifest.rulesScripts);
assert.equal(first, second);
assert.equal(first.STATE_VERSION > 0, true);
function missingRequire(file) {
  if (file.endsWith(path.join("js", "fleet.js"))) throw new Error("ENOENT fixture");
  return require(file);
}
assert.throws(() => napLuat({rootDir: root, requireFn: missingRequire, globalObject: {}}), /js[\\/]fleet\.js/);
const result = child('const x=require("./server/rules-loader.js"); const a=x.napLuat({rootDir:process.cwd()}); const b=x.napLuat({rootDir:process.cwd()}); if(a!==b) process.exit(2); console.log(a.STATE_VERSION)');
assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /^[1-9][0-9]*\n$/);
~~~

Lưu tools/test-loader.js. Run: node tools/test-loader.js. Expected: FAIL Cannot find module ../server/rules-loader.js. Mỗi isolation case là child process; test không xóa global hoặc require cache của test khác. Source fixture không chứa dynamic-execution lexical call.

- [ ] **Step 2: Implement CommonJS rules loader**

~~~js
const path = require("node:path");
const manifest = require("../tools/source-manifest.js");
function napLuat({rootDir = path.join(__dirname, ".."), requireFn = require, globalObject = global} = {}) {
  globalObject.window = globalObject.window || {};
  const previousWindow = global.window;
  global.window = globalObject.window;
  try {
    for (const file of manifest.rulesScripts) {
      const absolute = path.join(rootDir, file);
      try { requireFn(absolute); } catch (error) {
        throw new Error("cannot load " + file + ": " + error.message);
      }
    }
    return globalObject.window.G;
  } finally {
    global.window = previousWindow;
  }
}
const THU_TU = manifest.rulesScripts.slice();
module.exports = {napLuat, THU_TU};
~~~

server/rules.js dùng đúng bridge:

~~~js
const {napLuat, THU_TU} = require("./rules-loader.js");
const G = napLuat();
module.exports = {G, THU_TU, napLuat};
~~~

Loader không đọc source text hay tự diễn dịch code. Browser files remain CommonJS-compatible by attaching to window.G; index.html/web/index.html retain static scripts for file://.

- [ ] **Step 3: Close the allowlist without lexical test pollution**

Replace server/rules.js loader with Step 2 bridge, update tools/smoke.js to consume re-export, and replace Playwright $eval/$$eval with locator.evaluate only where DOM-derived values are needed. Set LEGACY_EXECUTION_ALLOWLIST = new Set(). In tools/test-quality-gate.js add:

~~~js
assert.equal(LEGACY_EXECUTION_ALLOWLIST.size, 0);
for (const source of forbiddenSources) {
  expectFailure(() => checkFile(fixture("after-loader.txt", source)), "forbidden");
}
~~~

The predeclared forbiddenSources helper from Task 2 constructs its data at runtime, so lint of tools/test-quality-gate.js remains green while checkFile behavior stays covered.

- [ ] **Step 4: GREEN**

Run: node tools/test-loader.js && node tools/test-quality-gate.js && npm run lint && npm run test:core && npm run test:server && npm run test:load && npm run test:ui. Expected: PASS; exact rules order and CommonJS cache identity hold in isolated child, missing rules file error names that path, and no allowlist remains.

- [ ] **Step 5: Final no-eval evidence and commit**

Run: rg -n "\\beval\\s*\\(|\\bFunction\\s*\\(|node:vm|\\bimport\\s*\\(" server js tools web. Expected: no result. The .txt fixture is generated in a temp directory at test runtime and is outside these trees; no exception applies.

Nếu sandbox cho phép index Git, run: git add server/rules-loader.js server/rules.js tools/source-manifest.js tools/smoke.js tools/test-mp-ui.mjs tools/lint.js tools/test-loader.js tools/test-quality-gate.js && git commit -m "refactor: replace legacy dynamic execution with manifest loader". Nếu .git read-only, controller lưu snapshot/diff và commit intent này.

## Hoàn tất foundation

- [ ] Chạy npm ci, npm run check:syntax, npm run lint, npm run check:version, npm run build, npm run check:artifact, git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html, npm run test:core, npm run test:server, npm run test:scheduler, npm run test:load, npm run test:ui.
- [ ] Reviewer đọc lại toàn bộ plan trước execution, xác nhận mọi helper, path, command và expected result đã được nêu trong task tạo ra nó; không được chấp nhận marker công việc bỏ trống.
- [ ] Không bắt đầu modularization cho tới khi scheduler plan và UI plan đã được tích hợp theo chuỗi bắt buộc.
