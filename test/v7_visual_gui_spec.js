"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var http = require("http");
var test = require("tap").test;
var createApp = require("../lib/app.js");

function rawGet(port, reqPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request(
      {
        hostname: "127.0.0.1",
        port: port,
        path: reqPath,
        method: "GET",
      },
      function (res) {
        var chunks = [];
        res.on("data", function (c) {
          chunks.push(c);
        });
        res.on("end", function () {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

test("v7.0 Visual & GUI Overhaul: HD artwork banners, visual-art engine, Bento showcase & wallpaper switcher", async function (t) {
  var instance = createApp({
    passcode: "ibossbad",
    adminPassword: "admin",
    autoLoadSupabase: false,
    skipInternetProbe: true,
  });

  var server = http.createServer(instance.app);
  await new Promise(function (resolve) {
    server.listen(0, "127.0.0.1", resolve);
  });
  var port = server.address().port;

  try {
    var expectedAssets = [
      "/ui/assets/hero-nebula.jpg",
      "/ui/assets/banner-games.jpg",
      "/ui/assets/banner-media.jpg",
      "/ui/assets/banner-emulator.jpg",
      "/ui/assets/banner-desktop.jpg",
      "/ui/assets/banner-cybercity.jpg",
      "/ui/assets/cat-action.jpg",
      "/ui/assets/cat-racing.jpg",
      "/ui/assets/cat-sandbox.jpg",
      "/ui/assets/cat-puzzle.jpg",
    ];

    for (var i = 0; i < expectedAssets.length; i++) {
      var assetRes = await rawGet(port, expectedAssets[i]);
      t.equal(
        assetRes.status,
        200,
        "Serves HD artwork asset " + expectedAssets[i]
      );
      t.ok(
        assetRes.body.length > 10000 &&
          assetRes.body[0] === 0xff &&
          assetRes.body[1] === 0xd8,
        expectedAssets[i] + " is a valid non-empty JPEG image"
      );
    }

    var shellRes = await rawGet(port, "/");
    var html = shellRes.body.toString("utf8");
    t.ok(
      html.indexOf("bento-showcase-grid") !== -1,
      "New Tab includes 4-card Visual Bento Showcase"
    );
    t.ok(
      html.indexOf("wallpaperCycleBtn") !== -1,
      "New Tab includes 1-click Wallpaper Switcher pill"
    );
    t.ok(
      html.indexOf("gate-hero-art") !== -1,
      "Auth Gate includes panoramic nebula artwork header"
    );
    t.ok(
      html.indexOf("/ui/visual-art.js") !== -1,
      "index.html loads /ui/visual-art.js"
    );

    // Verify IbossVisualArt in VM sandbox
    var vaSrc = fs.readFileSync(
      path.join(__dirname, "..", "public", "visual-art.js"),
      "utf8"
    );
    var store = {};
    var win = {
      localStorage: {
        getItem: function (k) {
          return store[k] || null;
        },
        setItem: function (k, v) {
          store[k] = String(v);
        },
      },
    };
    vm.runInNewContext(vaSrc, { window: win, Math: Math });

    t.ok(win.IbossVisualArt, "Exports window.IbossVisualArt");
    var mcCover = win.IbossVisualArt.getGameCoverMeta({
      title: "EaglerCraft 1.8",
      category: "sandbox",
      url: "https://monkeygg2.github.io/games/eaglercraft/",
    });
    t.equal(
      mcCover.photo,
      "/ui/assets/cat-sandbox.jpg",
      "Maps sandbox games to voxel sandbox artwork"
    );
    t.ok(
      mcCover.glyphSvg.indexOf("<polygon") !== -1,
      "Renders custom isometric voxel glyph SVG"
    );

    var ytIcon = win.IbossVisualArt.getSiteIconHtml(
      "https://www.youtube.com/",
      "YouTube"
    );
    t.ok(
      ytIcon.indexOf("rich-site-icon") !== -1 && ytIcon.indexOf("<svg") !== -1,
      "Renders crisp vector brand icon for YouTube"
    );

    var wp1 = win.IbossVisualArt.getActiveWallpaper();
    var wp2 = win.IbossVisualArt.cycleWallpaper();
    t.not(wp1.id, wp2.id, "cycleWallpaper() switches active wallpaper");
  } finally {
    await new Promise(function (resolve) {
      server.close(resolve);
    });
  }
});
