"use strict";

function taoClock({nowMs = Date.now} = {}) {
  return {nowMs};
}

module.exports = {taoClock};
