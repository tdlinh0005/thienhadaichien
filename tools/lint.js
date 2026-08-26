const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const LEGACY_EXECUTION_ALLOWLIST = new Set();
const DYNAMIC_PATTERNS = [
  {
    expression: new RegExp(
      "(^|[^.$A-Za-z0-9_])" + ["e", "val"].join("") + "\\s*\\("
    ),
    prefixed: true
  },
  {
    expression: new RegExp(
      "(^|[^.$A-Za-z0-9_])" + ["Fun", "ction"].join("") + "\\s*\\("
    ),
    prefixed: true
  },
  {
    expression: new RegExp(["im", "port"].join("") + "\\s*\\("),
    prefixed: false
  },
  {
    expression: new RegExp(["node", ":", "vm"].join("")),
    prefixed: false
  }
];

function lintText(text, file) {
  const errors = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.includes("\t")) {
      errors.push({file, line: index + 1, rule: "no-tab"});
    }
    if (/[ \t]+$/.test(line)) {
      errors.push({file, line: index + 1, rule: "trailing-space"});
    }
    if (line.length > 120 && !line.includes("lint-allow-line")) {
      errors.push({file, line: index + 1, rule: "max-line"});
    }
  }
  return errors;
}

function findDynamicExecution(text) {
  for (const pattern of DYNAMIC_PATTERNS) {
    const match = pattern.expression.exec(text);
    if (!match) continue;
    return match.index + (pattern.prefixed ? match[1].length : 0);
  }
  return -1;
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkFile(file, {rootDir = root} = {}) {
  const text = fs.readFileSync(file, "utf8");
  const relative = path.relative(rootDir, file).replaceAll(path.sep, "/");
  const forbiddenAt = findDynamicExecution(text);
  if (!LEGACY_EXECUTION_ALLOWLIST.has(relative) && forbiddenAt >= 0) {
    throw new Error(
      relative + ":" + lineAt(text, forbiddenAt) + " forbidden dynamic execution"
    );
  }
  const errors = lintText(text, relative);
  if (errors.length) {
    throw new Error(
      errors.map(error => error.file + ":" + error.line + " " + error.rule).join("\n")
    );
  }
}

function collectSourceFiles(directory) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(file);
      } else if (/\.(js|mjs)$/.test(file)) {
        files.push(file);
      }
    }
  }
  walk(directory);
  return files;
}

function checkTree(directory, {rootDir = root} = {}) {
  const failures = [];
  for (const file of collectSourceFiles(directory)) {
    try {
      checkFile(file, {rootDir});
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
}

function listSourceFiles() {
  const files = [];
  for (const directory of ["js", "server", "tools", "web/js"]) {
    files.push(...collectSourceFiles(path.join(root, directory)));
  }
  return files.sort();
}

function main({files = listSourceFiles(), stderr = process.stderr} = {}) {
  const failures = [];
  for (const file of files) {
    try {
      checkFile(file);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) {
    stderr.write(failures.join("\n") + "\n");
    return 1;
  }
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  lintText,
  checkFile,
  checkTree,
  listSourceFiles,
  main,
  LEGACY_EXECUTION_ALLOWLIST
};
