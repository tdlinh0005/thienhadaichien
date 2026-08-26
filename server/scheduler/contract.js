"use strict";

function taoScheduler(context) {
  const {kho} = context;

  function runCommand(command) {
    if (!command || typeof command.name !== "string" || typeof command.run !== "function") {
      throw new TypeError("invalid command");
    }
    return kho.trongGiaoDich(() => command.run(), {immediate: true});
  }

  return {
    start: async function () {},
    stop: async function () {},
    getStatus: function () {
      return {state: "ready", ready: true, writerLeaseHeld: true, mode: "bridge"};
    },
    runCommand,
    schedule: function () {},
    cancel: function () {},
    reconcile: function () {},
    advanceTo: function () {}
  };
}

module.exports = {taoScheduler};
