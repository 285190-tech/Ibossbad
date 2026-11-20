"use strict";

var tap = require("tap");
var PassThrough = require("stream").PassThrough;
var charsetMiddleware = require("../lib/charsets.js");
var iconv = require("iconv-lite");

function setup() {
  var source = new PassThrough();
  var data = {
    headers: { "content-type": "text/html" },
    contentType: "text/html",
    stream: source,
  };
  charsetMiddleware({ processContentTypes: ["text/html"] })(data);
  var chunks = [];
  data.stream.on("data", function (chunk) {
    chunks.push(Buffer.from(chunk));
  });
  var ended = new Promise(function (resolve, reject) {
    data.stream.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    data.stream.on("error", reject);
  });
  return { source: source, data: data, chunks: chunks, ended: ended };
}

tap.test(
  "charset sniffing streams large headless HTML before origin completes",
  async function (t) {
    var stream = setup();
    var chunk = Buffer.from("abc ".repeat(1024));
    for (var i = 0; i < 16; i++) stream.source.write(chunk);
    await new Promise(function (resolve) {
      setImmediate(resolve);
    });
    t.ok(
      stream.chunks.length,
      "decoding starts after bounded sniff window without waiting for end"
    );
    var suffix = Buffer.from("é終");
    stream.source.write(suffix.subarray(0, 1));
    stream.source.write(suffix.subarray(1, 4));
    stream.source.end(suffix.subarray(4));
    t.equal(
      await stream.ended,
      chunk.toString().repeat(16) + "é終",
      "preserves content and multibyte characters across chunks"
    );
    t.equal(
      stream.data.charset,
      "utf8",
      "uses UTF-8 if no charset was declared"
    );
  }
);

tap.test(
  "charset declarations across chunks remain supported",
  async function (t) {
    var stream = setup();
    stream.source.write(Buffer.from("<html><head><meta char"));
    stream.source.write(Buffer.from('set="windows-1250">'));
    stream.source.end(iconv.encode("Zażółć", "windows-1250"));
    var result = await stream.ended;
    t.match(result, /Zażółć/, "declared charset is decoded");
    t.equal(stream.data.charset, "windows-1250", "detected split declaration");
  }
);

tap.test(
  "short HTML without charset preserves non-ASCII on end",
  async function (t) {
    var stream = setup();
    stream.source.end(Buffer.from("<p>café 中文</p>"));
    t.equal(await stream.ended, "<p>café 中文</p>");
  }
);
