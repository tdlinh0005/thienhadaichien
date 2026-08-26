const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function sha256File(file) {
  return crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");
}

const browserStyles = ["css/style.css"];
const browserScripts = [
  "js/data.js", "js/util.js", "js/galaxy.js", "js/combat.js", "js/engine.js",
  "js/fleet.js", "js/actions.js", "js/ui.js", "js/app.js", "js/main.js"
];
const mpScripts = [
  "js/data.js", "js/util.js", "js/galaxy.js", "js/combat.js", "js/engine.js",
  "js/fleet.js", "js/actions.js", "js/ui.js", "js/app.js", "web/js/mp.js"
];
const rulesScripts = [
  "js/data.js", "js/util.js", "js/galaxy.js", "js/combat.js", "js/engine.js",
  "js/fleet.js", "js/actions.js"
];
const scriptFiles = [...new Set([...browserScripts, ...mpScripts, ...rulesScripts])];

module.exports = {
  browserStyles,
  browserScripts,
  mpScripts,
  rulesScripts,
  artifactOutputs: ["dist/thien-ha-dai-chien.html", "dist/artifact.html"],
  styleContents: Object.fromEntries(browserStyles.map(file => [
    file,
    fs.readFileSync(path.join(root, file), "utf8")
  ])),
  styleHashes: Object.fromEntries(browserStyles.map(file => [file, sha256File(file)])),
  scriptContents: Object.fromEntries(scriptFiles.map(file => [
    file,
    fs.readFileSync(path.join(root, file), "utf8")
  ])),
  scriptHashes: Object.fromEntries(scriptFiles.map(file => [file, sha256File(file)]))
};
