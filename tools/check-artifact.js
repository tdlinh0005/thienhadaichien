const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ARTIFACT_BOOTSTRAP = "<script>window.THDC_ARTIFACT=true;</script>";
const DEVELOPMENT_ASSET = new RegExp(
  "^(?:file:|/(?:users|home|tmp)/|[a-z]:[\\\\/]|" +
    "(?:https?:)?//(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?(?:[/?#]|$))",
  "i"
);

function normalizeAsset(value) {
  return String(value).replace(/^\/+/, "");
}

function openingTags(html, tag) {
  const expression = new RegExp("<" + tag + "\\b[^>]*>", "gi");
  return [...html.matchAll(expression)].map(match => match[0]);
}

function attributeValue(tag, attribute) {
  const expression = new RegExp(
    "\\b" + attribute + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
    "i"
  );
  const match = expression.exec(tag);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3]).trim();
}

function assetList(html, tag, attribute) {
  return openingTags(html, tag)
    .map(element => attributeValue(element, attribute))
    .filter(value => value !== null)
    .map(normalizeAsset);
}

function isStylesheetTag(tag) {
  const rel = attributeValue(tag, "rel");
  return rel !== null && rel.split(/\s+/).some(value => value.toLowerCase() === "stylesheet");
}

function stylesheetList(html) {
  return openingTags(html, "link")
    .filter(isStylesheetTag)
    .map(tag => normalizeAsset(attributeValue(tag, "href") ?? ""));
}

function sameArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(label + " differs from manifest");
  }
}

function styleMarker(file, manifest) {
  return '<style data-source="' + file + '" data-sha256="' +
    manifest.styleHashes[file] + '">';
}

function scriptMarker(file, manifest) {
  return "/* source: " + file + " sha256:" + manifest.scriptHashes[file] + " */";
}

function checkHash(kind, file, content, expected) {
  const actual = crypto.createHash("sha256").update(content).digest("hex");
  if (actual !== expected) throw new Error(kind + " hash mismatch for " + file);
}

function expectedStyleBlocks(manifest) {
  return manifest.browserStyles.map(file => {
    const content = manifest.styleContents[file];
    checkHash("style", file, content, manifest.styleHashes[file]);
    return styleMarker(file, manifest) + content + "</style>";
  });
}

function expectedSourceBundle(manifest) {
  const sources = manifest.browserScripts.map(file => {
    const content = manifest.scriptContents[file];
    checkHash("script", file, content, manifest.scriptHashes[file]);
    return scriptMarker(file, manifest) + "\n" + content;
  });
  return "<script>\n" + sources.join("\n") + "</script>";
}

function pairedBlocks(html, tag, name) {
  const expression = new RegExp("<" + tag + "\\b[^>]*>[\\s\\S]*?</" + tag + "\\s*>", "gi");
  const blocks = [...html.matchAll(expression)].map(match => ({
    index: match.index,
    text: match[0]
  }));
  const openingCount = openingTags(html, tag).length;
  const closingExpression = new RegExp("</" + tag + "\\s*>", "gi");
  const closingCount = [...html.matchAll(closingExpression)].length;
  if (blocks.length !== openingCount || blocks.length !== closingCount) {
    throw new Error("malformed " + tag + " block in " + name);
  }
  return blocks;
}

function isEmbeddedArtifact(name, manifest) {
  const normalizedName = String(name).replaceAll("\\", "/");
  const embeddedOutput = manifest.artifactOutputs[1].replaceAll("\\", "/");
  return normalizedName === embeddedOutput || normalizedName.endsWith("/" + embeddedOutput);
}

function markerLikeLines(text) {
  return [...text.matchAll(/\/\*\s*source\b[^\r\n]*/gi)].map(match => match[0]);
}

function checkClosedWorldBlocks(name, text, manifest) {
  const expectedStyles = expectedStyleBlocks(manifest);
  const bundle = expectedSourceBundle(manifest);
  const expectedScripts = isEmbeddedArtifact(name, manifest) ? [ARTIFACT_BOOTSTRAP, bundle] : [bundle];
  const styleBlocks = pairedBlocks(text, "style", name);
  const scriptBlocks = pairedBlocks(text, "script", name);
  sameArray(styleBlocks.map(block => block.text), expectedStyles, name + " style blocks");
  sameArray(scriptBlocks.map(block => block.text), expectedScripts, name + " script blocks");

  const actualOrder = [...styleBlocks, ...scriptBlocks]
    .sort((left, right) => left.index - right.index)
    .map(block => block.text);
  sameArray(actualOrder, [...expectedStyles, ...expectedScripts], name + " executable block order");
  sameArray(markerLikeLines(text), markerLikeLines(bundle), name + " source marker syntax");
}

function assetAttributeValues(html) {
  const expression = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  return [...html.matchAll(expression)].map(match => {
    return (match[1] ?? match[2] ?? match[3]).trim();
  });
}

function isDevelopmentAsset(value) {
  return DEVELOPMENT_ASSET.test(value);
}

function checkRuntimeAssets(name, text) {
  const runtimeScript = openingTags(text, "script").some(tag => attributeValue(tag, "src") !== null);
  const runtimeStylesheet = openingTags(text, "link").some(isStylesheetTag);
  if (runtimeScript || runtimeStylesheet) {
    throw new Error("runtime asset not inline in " + name);
  }
  if (assetAttributeValues(text).some(isDevelopmentAsset)) {
    throw new Error("absolute development asset in " + name);
  }
}

function checkArtifactText(name, text, manifest) {
  checkRuntimeAssets(name, text);
  checkClosedWorldBlocks(name, text, manifest);
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
  try {
    main();
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}

module.exports = {checkArtifactText, checkArtifacts, checkStaticShells};
