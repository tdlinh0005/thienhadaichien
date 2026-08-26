/* Gộp toàn bộ game vào một file HTML duy nhất: node tools/build.js [file-ra] */
const fs = require("node:fs");
const path = require("node:path");
const manifest = require("./source-manifest.js");

const root = path.join(__dirname, "..");

function styleMarker(file) {
  return '<style data-source="' + file + '" data-sha256="' +
    manifest.styleHashes[file] + '">';
}

function scriptMarker(file) {
  return "/* source: " + file + " sha256:" + manifest.scriptHashes[file] + " */";
}

function inlineStyles(html) {
  for (const file of manifest.browserStyles) {
    const tag = '<link rel="stylesheet" href="' + file + '">';
    if (!html.includes(tag)) throw new Error("Không tìm thấy stylesheet " + file);
    html = html.replace(tag, () => {
      return styleMarker(file) + manifest.styleContents[file] + "</style>";
    });
  }
  return html;
}

function inlineScripts(html) {
  for (const file of manifest.browserScripts) {
    const tag = '<script src="' + file + '"></script>';
    if (!html.includes(tag)) throw new Error("Không tìm thấy script " + file);
    html = html.replace("\n" + tag, "");
  }
  const blocks = manifest.browserScripts.map(file => {
    return scriptMarker(file) + "\n" + manifest.scriptContents[file];
  });
  return html.replace("</body>", () => {
    return "<script>\n" + blocks.join("\n") + "</script>\n</body>";
  });
}

function linkDocumentation(html) {
  return html.replace(
    '<a href="docs/NGHIEN-CUU.md">phần nghiên cứu</a>',
    '<a href="' +
      'https://github.com/tdlinh0005/thienhadaichien/blob/main/docs/NGHIEN-CUU.md" ' +
      'target="_blank" rel="noreferrer">phần nghiên cứu</a>'
  );
}

function makeEmbeddable(html) {
  const title = /<title>([^<]*)<\/title>/.exec(html)[1];
  const style = /<style\b[^>]*>[\s\S]*?<\/style>/.exec(html)[0];
  const body = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));
  return "<title>" + title + "</title>\n" + style + "\n" +
    "<script>window.THDC_ARTIFACT=true;</script>\n" + body;
}

function build({artifact = false, output} = {}) {
  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  html = inlineStyles(html);
  html = inlineScripts(html);
  html = linkDocumentation(html);
  if (artifact) html = makeEmbeddable(html);

  const relativeOutput = manifest.artifactOutputs[artifact ? 1 : 0];
  const outputFile = output || path.join(root, relativeOutput);
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, html);
  return {outputFile, html};
}

function main() {
  const args = process.argv.slice(2);
  const artifact = args.includes("--artifact");
  const output = args.find(argument => !argument.startsWith("--"));
  const result = build({artifact, output});
  console.log("Đã ghi " + result.outputFile + " (" + Math.round(result.html.length / 1024) + " KB)");
}

if (require.main === module) main();

module.exports = {build};
