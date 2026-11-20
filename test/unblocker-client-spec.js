"use strict";
const { test } = require("tap");
const prefix = "/proxy/";
const proxy = "http://localhost";
const target = "http://example.com/page.html?query#hash";
const location = new URL(proxy + prefix + target);

const config = (global.unblocker = { prefix, url: target });
const { fixUrl, initForWindow } = require("../lib/client/unblocker-client.js");

// 1x1 transparent gif
const pixel =
  " data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

test("client URL rewriting defaults missing config to the standard proxy prefix", (t) => {
  t.equal(
    fixUrl("/challenge", undefined, location),
    "/proxy/http://example.com/challenge"
  );
  t.equal(
    fixUrl("https://captcha.example/verify", {}, location),
    "/proxy/https://captcha.example/verify"
  );
  t.end();
});

test("client initialization tolerates missing config", (t) => {
  const fakeWindow = {
    URL,
    location,
    document: {},
    addEventListener: function () {},
  };
  t.doesNotThrow(() => initForWindow(undefined, fakeWindow));
  t.end();
});

const testCases = [
  { url: "http://foo.com/", expected: "/proxy/http://foo.com/" },
  { url: "/bar", expected: "/proxy/http://example.com/bar" },
  { url: "baz", expected: "/proxy/http://example.com/baz" },
  {
    url: "/bar",
    location: new URL(proxy + prefix + "http://example.com/bam/biz"),
    expected: "/proxy/http://example.com/bar",
  },
  {
    url: "baz",
    location: new URL(proxy + prefix + "http://example.com/bam/biz"),
    expected: "/proxy/http://example.com/bam/baz",
  },
  {
    url: "../parent",
    location: new URL(proxy + prefix + "http://example.com/foo/bar/"),
    expected: "/proxy/http://example.com/foo/parent",
  },
  { url: "../too-high", expected: "/proxy/http://example.com/too-high" },
  { url: "#", expected: "/proxy/http://example.com/page.html?query#" },
  { url: "https://example.com/", expected: "/proxy/https://example.com/" },
  // this is for when website js tries to be clever and use location.protocol + location.host + a new path.
  { url: "http://localhost/path", expected: "/proxy/http://example.com/path" },
  // don't break data: urls
  { url: pixel, expected: pixel },
  // don't break protocol-relative urls
  { url: "//example.com/foo", expected: "/proxy/http://example.com/foo" },
  // don't break about:blank urls
  { url: "about:blank", expected: "about:blank" },
  // don't break already proxied URLs
  {
    url: proxy + prefix + "http://example.com/foo",
    expected: proxy + prefix + "http://example.com/foo",
  },
  {
    url: prefix + "http://example.com/foo",
    expected: prefix + "http://example.com/foo",
  },
  // todo: port numbers
  // todo: more https tests
  // todo: websockets(?)
];

testCases.forEach((tc) => {
  test(JSON.stringify(tc), (t) => {
    // todo: replace || with ??
    const actual = fixUrl(tc.url, tc.config || config, tc.location || location);
    t.equal(actual, tc.expected);
    t.end();
  });
});

// todo: something about cookies and subdomains

test("encoded proxy navigation resolves dynamic URLs using injected target", (t) => {
  const encodedLocation = new URL(
    "https://proxy.example/proxy/u1_c29tZXRva2Vu?extra=1"
  );
  const remoteConfig = {
    prefix: "/proxy/",
    url: "https://target.example/section/page?extra=1",
  };
  t.equal(
    fixUrl("/cdn-cgi/challenge-platform/test", remoteConfig, encodedLocation),
    "/proxy/https://target.example/cdn-cgi/challenge-platform/test",
    "root-relative request uses upstream origin"
  );
  t.equal(
    fixUrl("./asset.js", remoteConfig, encodedLocation),
    "/proxy/https://target.example/section/asset.js",
    "relative request uses upstream page directory"
  );
  t.equal(
    fixUrl("https://proxy.example/challenge", remoteConfig, encodedLocation),
    "/proxy/https://target.example/challenge",
    "proxy host references are mapped to upstream host"
  );
  t.equal(
    fixUrl("https://elsewhere.example/file", remoteConfig, encodedLocation),
    "/proxy/https://elsewhere.example/file",
    "absolute external URLs continue to work"
  );
  t.end();
});

test("encoded navigation patches fetch and exposes the correct virtual location", async (t) => {
  const JSDOM = require("jsdom").JSDOM;
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://proxy.example/proxy/u1_c29tZXRva2Vu",
    runScripts: "outside-only",
  });
  const win = dom.window;
  t.teardown(() => win.close());
  let requested;
  win.fetch = (url) => {
    requested = url;
    return Promise.resolve({ ok: true });
  };
  initForWindow(
    { prefix: "/proxy/", url: "https://target.example/section/page" },
    win
  );
  await win.fetch("/cdn-cgi/challenge-platform/fixture");
  t.equal(
    requested,
    "/proxy/https://target.example/cdn-cgi/challenge-platform/fixture",
    "fetch is sent to the intended origin"
  );
  t.equal(
    win.__ibossLoc.hostname,
    "target.example",
    "virtual location uses the real upstream hostname"
  );
  t.equal(
    win.__ibossLoc.pathname,
    "/section/page",
    "virtual location retains upstream path"
  );
});
