"use strict";

var childProcess = require("child_process");
var path = require("path");
var test = require("tap").test;

var checkScript = path.join(
  __dirname,
  "..",
  "scripts",
  "check-game-catalog.js"
);

test("catalog preflight validates local game covers and reports provenance gaps", function (t) {
  var output = childProcess.execFileSync(
    process.execPath,
    [checkScript, "--json"],
    { encoding: "utf8" }
  );
  var report = JSON.parse(output);

  t.equal(report.ok, true, "catalog structure and local WebP covers are valid");
  t.ok(report.catalogEntries > 0, "preflight reads the built-in catalog");
  t.equal(
    report.webpCovers,
    report.catalogEntries,
    "each catalog item has a corresponding cover"
  );
  t.ok(
    Number.isInteger(report.missingCoverSources),
    "unrecorded image provenance is visible"
  );
  t.ok(
    Number.isInteger(report.sourceRightsUnverified),
    "unverified rights are not presented as cleared"
  );
  t.same(report.errors, [], "valid catalog produces no preflight errors");
  t.end();
});
