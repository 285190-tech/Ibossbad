"use strict";

var test = require("tap").test;
var fs = require("fs");
var vm = require("vm");
var source = fs.readFileSync(
  require("path").join(__dirname, "../public/server-finder.js"),
  "utf8"
);

function scanner(mode) {
  function FakeWebSocket() {
    var self = this;
    self.sent = [];
    setImmediate(function () {
      self.onmessage({
        data: new Uint8Array([3, 0, 0, 0, 0, 128, 0, 0, 0]).buffer,
      });
    });
  }
  FakeWebSocket.prototype.close = function () {};
  FakeWebSocket.prototype.send = function (packet) {
    this.sent.push(packet);
    if (packet[0] !== 2) return;
    var self = this;
    var id = packet.slice(1, 5);
    function deliver(type, body) {
      var result = new Uint8Array(5 + body.length);
      result[0] = type;
      result.set(id, 1);
      result.set(body, 5);
      if (self.onmessage) self.onmessage({ data: result.buffer });
    }
    setImmediate(function () {
      if (mode === "close") return deliver(4, [3]);
      if (mode === "invalid")
        return deliver(2, Buffer.from("NOT HTTP RESPONSE"));
      deliver(2, Buffer.from("HTTP/1."));
      deliver(2, Buffer.from("1 301 Moved\r\n"));
    });
  };
  var storage = {
    getItem: function () {
      return null;
    },
    setItem: function () {},
  };
  var win = {
    location: { protocol: "https:", host: "example.test" },
    sessionStorage: storage,
    localStorage: storage,
    WebSocket: FakeWebSocket,
  };
  vm.runInNewContext(source, {
    window: win,
    URL: URL,
    ArrayBuffer: ArrayBuffer,
    Uint8Array: Uint8Array,
    DataView: DataView,
    performance: require("perf_hooks").performance,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Map: Map,
    Set: Set,
  });
  return win.IbossServerFinder;
}

test("WISP scanner requires a real HTTP response, including fragmented data", async function (t) {
  var success = await scanner("ok").probeWispHandshake(
    "wss://relay.test/",
    500
  );
  t.ok(success.ok, "accepts a response split across DATA packets");
  t.equal(success.protocol, "WISP v1");
  t.notOk(
    (await scanner("close").probeWispHandshake("wss://relay.test/", 500)).ok,
    "rejects stream CLOSE"
  );
  t.notOk(
    (await scanner("invalid").probeWispHandshake("wss://relay.test/", 500)).ok,
    "rejects arbitrary DATA"
  );
});
