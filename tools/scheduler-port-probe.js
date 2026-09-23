"use strict";

const {taoClock} = require("../server/clock.js");
const {Kho} = require("../server/db.js");
const {taoUngDung} = require("../server/app.js");
const {taoScheduler} = require("../server/scheduler/index.js");
const {runMaintenanceCutover} = require("../server/scheduler/cutover.js");

const silentProbeLogger = {
  debug: function () {},
  info: function () {},
  warn: function () {},
  error: function () {}
};

async function main() {
  const dbPath = process.env.THDC_DB;
  if (!dbPath) throw new Error("THDC_DB_REQUIRED");
  const clock = taoClock();
  const kho = new Kho(dbPath);
  try {
    runMaintenanceCutover({
      kho: kho,
      clock: clock,
      ownerId: "00000000-0000-4000-8000-000000000085"
    });
  } finally {
    kho.dong();
  }
  const holdProtocol = process.env.THDC_PROBE_TRACK_REQUEST === "1";
  const app = taoUngDung({
    env: process.env,
    dbPath: dbPath,
    port: Number(process.env.PORT),
    clock: clock,
    schedulerFactory: taoScheduler,
    logger: silentProbeLogger,
    testHooks: holdProtocol ? {
      onRequestTracked: function () {
        process.stdout.write(JSON.stringify({event: "request-tracked"}) + "\n");
      }
    } : undefined
  });
  const signal = new Promise(function (resolve) {
    process.once("SIGTERM", resolve);
  });
  await app.start();
  process.stdout.write(JSON.stringify({port: app.server.address().port}) + "\n");
  await signal;
  await app.stop();
}

main().then(function () {
  process.exitCode = 0;
}).catch(function (error) {
  process.stderr.write((error && (error.code || error.message) || "PORT_PROBE_FAILED") + "\n");
  process.exitCode = 1;
});
