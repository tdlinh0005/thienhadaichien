"use strict";

const SENSITIVE_KEYS = new Set(["password", "mk", "salt", "muoi", "token", "body", "state"]);

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(function ([key, item]) {
    return [key, SENSITIVE_KEYS.has(key) ? "[redacted]" : redact(item)];
  }));
}

function taoLogger(sink = console) {
  return ["debug", "info", "warn", "error"].reduce(function (logger, level) {
    logger[level] = function (info) {
      if (!info || typeof info.event !== "string" || typeof info.at !== "number") {
        throw new TypeError("structured log required");
      }
      sink[level](redact(info));
    };
    return logger;
  }, {});
}

module.exports = {taoLogger, redact};
