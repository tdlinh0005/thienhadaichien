const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {
  lintText,
  checkFile,
  checkTree,
  listSourceFiles,
  main,
  LEGACY_EXECUTION_ALLOWLIST
} = require("./lint.js");

function expectFailure(fn, code) {
  assert.throws(fn, new RegExp(code));
}

function fixture(name, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-q-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return file;
}

function fixtureTree(relative, text) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-q-tree-"));
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
  return {root, file};
}

function callText(parts) {
  return parts.join("");
}

const forbiddenSources = [
  callText(["e", "val", "(", "\"1\"", ")"]),
  callText(["Fun", "ction", "(", "\"return 1\"", ")"]),
  callText(["im", "port", "(", "\"x\"", ")"]),
  callText(["node", ":", "vm"])
];

assert.ok(
  lintText("const a=1;\tconst b=2;", "any.js").some(x => x.rule === "no-tab")
);
assert.ok(
  lintText("const a=1;  \n", "any.js").some(x => x.rule === "trailing-space")
);
assert.ok(
  lintText("x".repeat(121), "any.js").some(x => x.rule === "max-line")
);

for (const text of ["\tconst a=1;", "const a=1;\t", ...forbiddenSources]) {
  expectFailure(() => checkFile(fixture("outside.txt", text)), "forbidden|no-tab");
}

assert.equal(LEGACY_EXECUTION_ALLOWLIST.size, 0);

const notAllowed = fixtureTree("server/other.js", forbiddenSources[0]);
expectFailure(
  () => checkFile(notAllowed.file, {rootDir: notAllowed.root}),
  "forbidden"
);

const badTree = fixtureTree("nested/bad.mjs", "\tconst bad = true;");
expectFailure(() => checkTree(badTree.root, {rootDir: badTree.root}), "no-tab");

assert.ok(listSourceFiles().includes(__filename));

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
