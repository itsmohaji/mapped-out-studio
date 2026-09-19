/**
 * jsdom test environment that treats the `canvas` package as absent.
 *
 * `canvas` is a production dependency (server-side image work), but its native
 * binary is not built on every machine. jsdom loads `canvas` whenever it can
 * resolve it, so an unbuilt install crashes every jsdom test before it starts.
 * jsdom already works without canvas — nothing tested here draws on one — so
 * we make it resolve as missing, for this test worker only.
 *
 * Use with:  /** @jest-environment ./jest.jsdom.env.cjs *\/
 */
const Module = require('module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'canvas') {
    const err = new Error("Cannot find module 'canvas'");
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  }
  return resolve.call(this, request, ...rest);
};

module.exports = require('jest-environment-jsdom').TestEnvironment;
