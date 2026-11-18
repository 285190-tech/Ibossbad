"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var test = require("tap").test;

var wispCode = fs.readFileSync(
  path.join(__dirname, "../public/wisp-engine.js"),
  "utf8"
);
var sandbox = {
  URL: URL,
  window: { location: { href: "https://iboss.local/" } },
};
vm.runInNewContext(wispCode, sandbox);
var api = sandbox.window.IbossWispEngine;

test("WISP only proxies recognized HTTPS CAPTCHA iframe URLs", function (t) {
  var allowedUrls = [
    "https://www.google.com/recaptcha/api2/anchor?ar=1",
    "https://www.recaptcha.net/recaptcha/enterprise/anchor",
    "https://newassets.hcaptcha.com/captcha/v1/123/static/hcaptcha.html",
    "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/if/ov2/av0/",
    "https://client-api.arkoselabs.com/fc/gc/?session=123",
    "https://iframe-api.funcaptcha.com/fc/gc/",
  ];
  allowedUrls.forEach(function (url) {
    t.equal(api.isCaptchaFrameUrl(url), true, "Recognizes CAPTCHA URL: " + url);
  });

  var rejectedUrls = [
    "http://www.google.com/recaptcha/api2/anchor",
    "https://www.google.com/account/login",
    "https://google.com.evil.test/recaptcha/api2/anchor",
    "https://newassets.hcaptcha.com.evil.test/captcha/v1/frame",
    "https://challenges.cloudflare.com/other/frame",
    "https://example.com/recaptcha/api2/anchor",
  ];
  rejectedUrls.forEach(function (url) {
    t.equal(
      api.isCaptchaFrameUrl(url),
      false,
      "Rejects non-CAPTCHA URL: " + url
    );
  });

  t.equal(
    api.isCaptchaFrameUrl(
      "//www.google.com/recaptcha/api2/anchor",
      "https://site.test/page"
    ),
    true,
    "Resolves a protocol-relative CAPTCHA URL against its HTTPS page"
  );
  t.equal(
    api.isCaptchaFrameUrl(
      "//www.google.com/recaptcha/api2/anchor",
      "http://site.test/page"
    ),
    false,
    "Does not accept an HTTP CAPTCHA frame"
  );
  t.end();
});

test("WISP keeps CAPTCHA frames inside the configured same-origin proxy", function (t) {
  var target = "https://www.google.com/recaptcha/api2/anchor?ar=1";
  var proxyBuilder = function (url) {
    return "/proxy/" + encodeURIComponent(url);
  };
  var proxied = api.getCaptchaFrameProxyUrl(
    target,
    "https://site.test/",
    proxyBuilder,
    "https://iboss.local/app"
  );

  t.ok(proxied, "Builds a proxy URL for an allowlisted CAPTCHA frame");
  t.equal(
    new URL(proxied).origin,
    "https://iboss.local",
    "The proxied CAPTCHA iframe remains on the app origin"
  );
  t.equal(
    api.getCaptchaFrameProxyUrl(
      "https://example.com/frame",
      "https://site.test/",
      proxyBuilder,
      "https://iboss.local/app"
    ),
    null,
    "Does not proxy arbitrary remote frames"
  );
  t.equal(
    api.getCaptchaFrameProxyUrl(
      target,
      "https://site.test/",
      function () {
        return "https://attacker.test/frame";
      },
      "https://iboss.local/app"
    ),
    null,
    "Rejects a proxy builder result that escapes the app origin"
  );
  t.equal(
    api.getCaptchaFrameProxyUrl(
      target,
      "https://site.test/",
      null,
      "https://iboss.local/app"
    ),
    null,
    "Safely rejects CAPTCHA frames when no proxy builder is configured"
  );
  t.end();
});
