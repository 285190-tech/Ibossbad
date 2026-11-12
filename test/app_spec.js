"use strict";

var http = require("http");
var WebSocket = require("ws");
var test = require("tap").test;
var createApp = require("../lib/app.js");

function httpJson(port, method, path, body, extraHeaders, cb) {
  var payload = body ? JSON.stringify(body) : null;
  var headers = Object.assign({}, extraHeaders || {});
  if (payload) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload);
  }
  var req = http.request(
    {
      hostname: "127.0.0.1",
      port: port,
      path: path,
      method: method,
      headers: headers,
    },
    function (res) {
      var chunks = [];
      res.on("data", function (c) {
        chunks.push(c);
      });
      res.on("end", function () {
        var raw = Buffer.concat(chunks).toString("utf8");
        var parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          parsed = null;
        }
        cb(null, res, parsed, raw);
      });
    }
  );
  req.on("error", cb);
  if (payload) req.write(payload);
  req.end();
}

test("Ibossbad web app, passcode gate, token session, and authenticated proxying", function (t) {
  var receivedUpstreamCookie = null;

  var remoteServer = http.createServer(function (req, res) {
    receivedUpstreamCookie = req.headers.cookie || "";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!DOCTYPE html><html><head><title>Remote Game</title></head><body><a href="/play">Play</a></body></html>'
    );
  });

  remoteServer.listen(0, "127.0.0.1", function () {
    var remotePort = remoteServer.address().port;
    var instance = createApp({
      authRequired: true,
      passcode: "secret123",
      sessionSecret: "test-secret",
      supabaseUrl: "https://xemrsowtnlderqjzluww.supabase.co",
    });

    var appServer = http.createServer(instance.app);
    instance.attachUpgrade(appServer);

    appServer.listen(0, "127.0.0.1", function () {
      var appPort = appServer.address().port;

      function done() {
        appServer.close(function () {
          remoteServer.close(function () {
            t.end();
          });
        });
      }

      // 1. Landing UI loads at /
      httpJson(appPort, "GET", "/", null, {}, function (err, res, _json, html) {
        t.error(err);
        t.equal(res.statusCode, 200);
        t.ok(html.includes("Ibossbad"), "serves browser UI");

        // 2. Status reports unauthenticated
        httpJson(
          appPort,
          "GET",
          "/api/status",
          null,
          {},
          function (err2, res2, status) {
            t.error(err2);
            t.equal(res2.statusCode, 200);
            t.equal(status.authenticated, false);
            t.equal(status.authRequired, true);

            // 3. Unauthenticated proxy navigation redirects to lock gate
            httpJson(
              appPort,
              "GET",
              "/proxy/http://127.0.0.1:" + remotePort + "/",
              null,
              { Accept: "text/html" },
              function (err3, res3) {
                t.error(err3);
                t.equal(res3.statusCode, 302);
                t.ok(res3.headers.location.indexOf("/?locked=1") === 0);

                // 4. Wrong passcode fails with 401
                httpJson(
                  appPort,
                  "POST",
                  "/api/auth/passcode",
                  { passcode: "wrong" },
                  {},
                  function (err4, res4, badPass) {
                    t.error(err4);
                    t.equal(res4.statusCode, 401);
                    t.equal(badPass.ok, false);

                    // 5. Correct passcode succeeds & sets HttpOnly session cookie
                    httpJson(
                      appPort,
                      "POST",
                      "/api/auth/passcode",
                      { passcode: "secret123" },
                      {},
                      function (err5, res5, goodPass) {
                        t.error(err5);
                        t.equal(res5.statusCode, 200);
                        t.equal(goodPass.ok, true);
                        var setCookie = res5.headers["set-cookie"];
                        t.ok(setCookie, "sets session cookie");
                        var cookieHeader = Array.isArray(setCookie)
                          ? setCookie[0].split(";")[0]
                          : setCookie.split(";")[0];

                        // 6. Authenticated proxy request succeeds & strips internal cookie upstream
                        httpJson(
                          appPort,
                          "GET",
                          "/proxy/http://127.0.0.1:" + remotePort + "/",
                          null,
                          { Cookie: cookieHeader + "; player_id=42" },
                          function (err6, res6, _j6, proxiedHtml) {
                            t.error(err6);
                            t.equal(res6.statusCode, 200);
                            t.ok(
                              proxiedHtml.includes(
                                "/proxy/http://127.0.0.1:" +
                                  remotePort +
                                  "/play"
                              ),
                              "rewrites links in proxied page"
                            );
                            t.equal(
                              receivedUpstreamCookie,
                              "player_id=42",
                              "strips __ibossbad_session before sending to upstream"
                            );

                            // 7. Serves local WASM/AST vendor assets & WISP engine
                            httpJson(
                              appPort,
                              "GET",
                              "/vendor/libcurl/libcurl.js",
                              null,
                              {},
                              function (err7, res7, _j7, libcurlSrc) {
                                t.error(err7);
                                t.equal(res7.statusCode, 200);
                                t.ok(
                                  libcurlSrc.includes("load_wasm"),
                                  "serves local libcurl.js bundle"
                                );

                                // 8. Authenticated WebSocket upgrade to /wisp/ succeeds
                                var ws = new WebSocket(
                                  "ws://127.0.0.1:" + appPort + "/wisp/",
                                  {
                                    headers: { Cookie: cookieHeader },
                                  }
                                );
                                ws.once("message", function (msg) {
                                  t.ok(
                                    Buffer.isBuffer(msg) && msg.length >= 5,
                                    "receives initial WISP CONTINUE handshake frame"
                                  );
                                  ws.close();
                                  done();
                                });
                                ws.once("error", function (wsErr) {
                                  t.error(wsErr);
                                  done();
                                });
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});
