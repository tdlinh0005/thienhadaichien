const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  checkArtifactText,
  checkArtifacts,
  checkStaticShells
} = require("./check-artifact.js");
const sourceManifest = require("./source-manifest.js");

function hash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function styleBlock(file, manifest) {
  return '<style data-source="' + file + '" data-sha256="' +
    manifest.styleHashes[file] + '">' + manifest.styleContents[file] + "</style>";
}

function scriptMarker(file, manifest) {
  return "/* source: " + file + " sha256:" + manifest.scriptHashes[file] + " */";
}

function sourceBundle(manifest) {
  const source = manifest.browserScripts.map(file => {
    return scriptMarker(file, manifest) + "\n" + manifest.scriptContents[file];
  }).join("\n");
  return "<script>\n" + source + "</script>";
}

function expectAllRejected(cases, manifest) {
  const accepted = [];
  for (const [label, name, html] of cases) {
    try {
      checkArtifactText(name, html, manifest);
      accepted.push(label);
    } catch {}
  }
  assert.deepEqual(accepted, [], "closed-world checker accepted: " + accepted.join(", "));
}

const style = "body{}";
const sourceA = "A();";
const sourceB = "B();";
const manifest = {
  browserStyles: ["css/style.css"],
  browserScripts: ["js/a.js", "js/b.js"],
  mpScripts: ["js/a.js", "js/b.js", "web/js/mp.js"],
  rulesScripts: ["js/a.js", "js/b.js"],
  artifactOutputs: ["dist/thien-ha-dai-chien.html", "dist/artifact.html"],
  styleContents: {"css/style.css": style},
  styleHashes: {"css/style.css": hash(style)},
  scriptContents: {"js/a.js": sourceA, "js/b.js": sourceB},
  scriptHashes: {"js/a.js": hash(sourceA), "js/b.js": hash(sourceB)}
};
const bootstrap = "<script>window.THDC_ARTIFACT=true;</script>";
const styles = styleBlock("css/style.css", manifest);
const bundle = sourceBundle(manifest);
const goodSolo = styles + bundle;
const goodArtifact = styles + bootstrap + bundle;
const markerA = scriptMarker("js/a.js", manifest);

assert.doesNotThrow(() => {
  checkArtifactText("dist/thien-ha-dai-chien.html", goodSolo, manifest);
});
assert.doesNotThrow(() => {
  checkArtifactText("dist/artifact.html", goodArtifact, manifest);
});

const closedWorldCases = [
  [
    "unmarked inline script before bundle",
    "dist/thien-ha-dai-chien.html",
    goodSolo.replace(bundle, "<script>BEFORE();</script>" + bundle)
  ],
  [
    "unmarked inline script after bundle",
    "dist/thien-ha-dai-chien.html",
    goodSolo + "<script>AFTER();</script>"
  ],
  [
    "executable bytes before first marker",
    "dist/thien-ha-dai-chien.html",
    goodSolo.replace("<script>\n" + markerA, "<script>\nPREFIX();\n" + markerA)
  ],
  [
    "executable bytes after last marker",
    "dist/thien-ha-dai-chien.html",
    goodSolo.replace(sourceB + "</script>", sourceB + "\nSUFFIX();</script>")
  ],
  [
    "malformed source marker",
    "dist/thien-ha-dai-chien.html",
    goodSolo + "<!-- /* source fake marker */ -->"
  ],
  [
    "invalid-hash source marker",
    "dist/thien-ha-dai-chien.html",
    goodSolo + "<!-- /* source: fake.js sha256:" + "g".repeat(64) + " */ -->"
  ],
  [
    "extra inline style",
    "dist/thien-ha-dai-chien.html",
    "<style>.extra{}</style>" + goodSolo
  ],
  [
    "duplicate extra inline style",
    "dist/thien-ha-dai-chien.html",
    "<style>.extra{}</style><style>.extra{}</style>" + goodSolo
  ],
  [
    "duplicate canonical inline style",
    "dist/thien-ha-dai-chien.html",
    styles + goodSolo
  ],
  [
    "uppercase spaced runtime script",
    "dist/thien-ha-dai-chien.html",
    goodSolo + '<SCRIPT SRC = "remote.js"></SCRIPT>'
  ],
  [
    "uppercase spaced runtime stylesheet",
    "dist/thien-ha-dai-chien.html",
    goodSolo + '<LINK REL = "stylesheet" HREF = "remote.css">'
  ],
  [
    "Windows slash development path",
    "dist/thien-ha-dai-chien.html",
    goodSolo + '<img src="C:/tmp/game.png">'
  ],
  [
    "Windows backslash development path",
    "dist/thien-ha-dai-chien.html",
    goodSolo + '<img SRC = "C:\\tmp\\game.png">'
  ],
  [
    "localhost asset URL",
    "dist/thien-ha-dai-chien.html",
    goodSolo + '<img src="http://localhost:8080/game.png">'
  ],
  [
    "IPv4 loopback asset URL",
    "dist/thien-ha-dai-chien.html",
    goodSolo + '<img src="https://127.0.0.1/game.png">'
  ],
  [
    "IPv6 loopback asset URL",
    "dist/thien-ha-dai-chien.html",
    goodSolo + '<img src="http://[::1]:8080/game.png">'
  ],
  [
    "artifact bootstrap in solo output",
    "dist/thien-ha-dai-chien.html",
    styles + bootstrap + bundle
  ],
  [
    "changed artifact bootstrap",
    "dist/artifact.html",
    goodArtifact.replace(bootstrap, "<script>window.THDC_ARTIFACT = true;</script>")
  ],
  [
    "artifact bootstrap after bundle",
    "dist/artifact.html",
    styles + bundle + bootstrap
  ],
  [
    "extra artifact inline script",
    "dist/artifact.html",
    goodArtifact + "<script>EXTRA();</script>"
  ]
];

const secondStyle = "a{}";
const twoStyleManifest = {
  ...manifest,
  browserStyles: ["css/style.css", "css/second.css"],
  styleContents: {
    "css/style.css": style,
    "css/second.css": secondStyle
  },
  styleHashes: {
    "css/style.css": hash(style),
    "css/second.css": hash(secondStyle)
  }
};
const firstStyleBlock = styleBlock("css/style.css", twoStyleManifest);
const secondStyleBlock = styleBlock("css/second.css", twoStyleManifest);
const twoStyleGood = firstStyleBlock + secondStyleBlock + sourceBundle(twoStyleManifest);
const reversedStyles = secondStyleBlock + firstStyleBlock + sourceBundle(twoStyleManifest);
assert.doesNotThrow(() => {
  checkArtifactText("dist/thien-ha-dai-chien.html", twoStyleGood, twoStyleManifest);
});
assert.throws(() => {
  checkArtifactText("dist/thien-ha-dai-chien.html", reversedStyles, twoStyleManifest);
});
expectAllRejected(closedWorldCases, manifest);

const badHtml = '<link rel="stylesheet" href="css/style.css"><script src="js/a.js"></script>';
const badHashHtml = goodSolo.replace(manifest.styleHashes["css/style.css"], "wrong");
const badScriptHtml = goodSolo.replace(sourceA, "Z();");
const injectedScriptHtml = goodSolo.replace(sourceA, sourceA + "\nINJECT();");
assert.throws(() => checkArtifactText("dist/artifact.html", badHtml, manifest));
assert.throws(() => checkArtifactText("dist/artifact.html", badHashHtml, manifest));
assert.throws(() => checkArtifactText("dist/artifact.html", badScriptHtml, manifest));
assert.throws(() => checkArtifactText("dist/artifact.html", injectedScriptHtml, manifest));

const soloShell = [
  '<link rel="stylesheet" href="css/style.css">',
  '<script src="js/a.js"></script>',
  '<script src="js/b.js"></script>'
].join("");
const mpShell = [
  '<link rel="stylesheet" href="/css/style.css">',
  '<script src="/js/a.js"></script>',
  '<script src="/js/b.js"></script>',
  '<script src="/web/js/mp.js"></script>'
].join("");
const swappedSoloShell = soloShell.replace(
  '<script src="js/a.js"></script><script src="js/b.js"></script>',
  '<script src="js/b.js"></script><script src="js/a.js"></script>'
);
assert.doesNotThrow(() => checkStaticShells(soloShell, mpShell, manifest));
assert.throws(() => checkStaticShells(swappedSoloShell, mpShell, manifest));

assert.deepEqual(sourceManifest.browserStyles, ["css/style.css"]);
assert.deepEqual(sourceManifest.browserScripts, [
  "js/data.js", "js/util.js", "js/galaxy.js", "js/combat.js", "js/engine.js",
  "js/fleet.js", "js/actions.js", "js/ui.js", "js/app.js", "js/main.js"
]);
assert.deepEqual(sourceManifest.mpScripts, [
  "js/data.js", "js/util.js", "js/galaxy.js", "js/combat.js", "js/engine.js",
  "js/fleet.js", "js/actions.js", "js/ui.js", "js/app.js", "web/js/mp.js"
]);
assert.deepEqual(sourceManifest.rulesScripts, [
  "js/data.js", "js/util.js", "js/galaxy.js", "js/combat.js", "js/engine.js",
  "js/fleet.js", "js/actions.js"
]);
assert.deepEqual(sourceManifest.artifactOutputs, manifest.artifactOutputs);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-artifact-"));
try {
  fs.mkdirSync(path.join(tempRoot, "dist"), {recursive: true});
  fs.writeFileSync(path.join(tempRoot, manifest.artifactOutputs[0]), goodSolo);
  fs.writeFileSync(path.join(tempRoot, manifest.artifactOutputs[1]), goodArtifact);
  assert.doesNotThrow(() => checkArtifacts(tempRoot, manifest));
  fs.rmSync(path.join(tempRoot, manifest.artifactOutputs[1]));
  assert.throws(() => checkArtifacts(tempRoot, manifest), /missing dist\/artifact\.html/);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
