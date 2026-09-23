const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const pkg = require("../package.json");
const {G} = require("../server/rules.js");
const {API} = require("../server/api.js");
const {Kho} = require("../server/db.js");
const {TheGioi} = require("../server/world.js");

function legacyState() {
  const state = G.moiGame("Version Gate", "VERSION-GATE");
  state.v = 3;
  delete state.moHinhCT;
  delete state.moHinhNhip;
  delete state.moHinhQuyDao;
  return state;
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

function checkApi() {
  const versionKho = {
    q: {
      tkDem: {get: () => ({n: 2})},
      htDem: {get: () => ({n: 3})}
    }
  };
  const versionWorld = {seed: function () { return "VERSION-SEED"; }};
  assert.throws(function () {
    const options = versionApiOptions();
    delete options.ensureUniverseBootstrap;
    return new API(versionKho, versionWorld, options);
  }, /ENSURE_UNIVERSE_BOOTSTRAP_REQUIRED/,
  "direct API adapters must not bypass lazy durable bootstrap");
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
}

function checkDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "thdc-version-gate-"));
  const kho = new Kho(path.join(tempDir, "game.sqlite"));
  try {
    const world = new TheGioi(kho);
    world.nangCapDuLieu();
    assert.equal(kho.cauhinh("stateVersion"), String(G.STATE_VERSION));
  } finally {
    kho.dong();
    fs.rmSync(tempDir, {recursive: true, force: true});
  }
}

function checkVersionContract() {
  assert.match(pkg.version, /^[0-9]+\.[0-9]+\.[0-9]+$/);
  assert.equal(G.PHIEN_BAN_LICH_SU, "1.35b-r2");
  assert.equal(G.VERSION, G.PHIEN_BAN_LICH_SU);
  assert.equal(Reflect.set(G, "VERSION", "tampered"), false);
  assert.equal(G.VERSION, "1.35b-r2");
  assert.ok(Number.isInteger(G.STATE_VERSION) && G.STATE_VERSION > 0);
  assert.notEqual(G.PHIEN_BAN_LICH_SU, String(G.STATE_VERSION));

  const state = legacyState();
  G.nangCapState(state, 1700000000);
  assert.equal(state.v, G.STATE_VERSION);
  assert.equal(state.moHinhCT, "so-luong-v1");
  assert.equal(state.moHinhNhip, "bao-tri-dan-su-v1");
  assert.equal(state.moHinhQuyDao, "giu-quy-dao-v1");
  const firstMigration = JSON.stringify(state);
  G.nangCapState(state, 1700000000);
  assert.equal(JSON.stringify(state), firstMigration);
  assert.throws(() => G.nangCapState({v: G.STATE_VERSION + 1}), /mới hơn engine/);

  checkApi();
  checkDatabase();
}

function main() {
  checkVersionContract();
  console.log("✓ release/history/state version contract");
}

if (require.main === module) main();

module.exports = {checkVersionContract};
