const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pkg = require("../package.json");
const {G} = require("../server/rules.js");
const {API} = require("../server/api.js");
const {Kho} = require("../server/db.js");
const {TheGioi} = require("../server/world.js");

function oldState() {
  const state = G.moiGame("Cựu Chỉ Huy", "VERSION-OLD");
  state.v = 3;
  delete state.moHinhCT;
  delete state.moHinhNhip;
  delete state.moHinhQuyDao;
  return state;
}

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
    getUniverseSeed: function () { return "VERSION-SEED"; },
    ensureUniverseBootstrap: async function () { return "VERSION-SEED"; }
  };
}

assert.match(pkg.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
assert.equal(G.PHIEN_BAN_LICH_SU, "1.35b-r2");
assert.equal(G.VERSION, G.PHIEN_BAN_LICH_SU);
const descriptor = Object.getOwnPropertyDescriptor(G, "VERSION");
assert.deepEqual(versionDescriptor(descriptor), {
  value: G.PHIEN_BAN_LICH_SU,
  enumerable: true,
  writable: false,
  configurable: false
});
assert.equal(Reflect.set(G, "VERSION", "tampered"), false);
assert.equal(G.VERSION, "1.35b-r2");
const firstReload = reloadRules();
const secondReload = reloadRules();
assert.strictEqual(firstReload.G, secondReload.G);
assert.deepEqual(
  versionDescriptor(Object.getOwnPropertyDescriptor(secondReload.G, "VERSION")),
  versionDescriptor(descriptor)
);
assert.ok(Number.isInteger(G.STATE_VERSION) && G.STATE_VERSION > 0);
assert.notEqual(G.PHIEN_BAN_LICH_SU, String(G.STATE_VERSION));

const state = oldState();
G.nangCapState(state, 1700000000);
assert.equal(state.v, G.STATE_VERSION);
assert.equal(state.moHinhCT, "so-luong-v1");
assert.equal(state.moHinhNhip, "bao-tri-dan-su-v1");
assert.equal(state.moHinhQuyDao, "giu-quy-dao-v1");
const migratedBytes = JSON.stringify(state);
G.nangCapState(state, 1700000000);
assert.equal(JSON.stringify(state), migratedBytes);
assert.throws(() => G.nangCapState({v: G.STATE_VERSION + 1}), /mới hơn engine/);

const versionKho = {
  q: {
    tkDem: {get: () => ({n: 7})},
    htDem: {get: () => ({n: 11})}
  }
};
const versionWorld = {seed: function () { return "VERSION-SEED"; }};
assert.throws(function () {
  var options = versionApiOptions();
  delete options.ensureUniverseBootstrap;
  return new API(versionKho, versionWorld, options);
}, /ENSURE_UNIVERSE_BOOTSTRAP_REQUIRED/,
"API construction must reject a direct adapter that can bypass lazy durable bootstrap");
const api = new API(versionKho, versionWorld, versionApiOptions());
const info = api.thongTin();
for (const field of ["seed", "soNguoi", "soHT", "tocDo", "tocDoBay", "chuKy", "now"]) {
  assert.ok(Object.hasOwn(info, field), "missing existing API field " + field);
}
assert.deepEqual({
  releaseVersion: info.releaseVersion,
  phienBanLichSu: info.phienBanLichSu,
  stateVersion: info.stateVersion,
  phienBan: info.phienBan
}, {
  releaseVersion: pkg.version,
  phienBanLichSu: G.PHIEN_BAN_LICH_SU,
  stateVersion: G.STATE_VERSION,
  phienBan: G.VERSION
});
assert.equal(info.seed, "VERSION-SEED");
assert.equal(info.soNguoi, 7);
assert.equal(info.soHT, 11);
assert.ok(Number.isInteger(info.now));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-version-"));
const kho = new Kho(path.join(tempDir, "game.sqlite"));
try {
  const world = new TheGioi(kho);
  world.nangCapDuLieu();
  assert.equal(kho.cauhinh("stateVersion"), String(G.STATE_VERSION));
} finally {
  kho.dong();
  fs.rmSync(tempDir, {recursive: true, force: true});
}

console.log("✓ version contract");
