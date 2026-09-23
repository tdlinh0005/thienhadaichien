"use strict";

const {napLuat, THU_TU} = require("./rules-loader.js");

const G = napLuat();

module.exports = {G: G, THU_TU: THU_TU, napLuat: napLuat};
