"use strict";

var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var repoRoot = path.join(__dirname, "..");
var catalogPath = path.join(repoRoot, "public", "games-catalog.js");
var coversDir = path.join(repoRoot, "public", "assets", "game-covers");
var sourcesPath = path.join(coversDir, "sources.json");
var catalogWindow = {};
var errors = [];
var warnings = [];
var duplicates = [];

function slugify(title) {
  return String(title || "game")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isWebUrl(value) {
  try {
    var parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_err) {
    return false;
  }
}

function isCatalogUrl(value) {
  return (
    typeof value === "string" &&
    (value.indexOf("/mgg-games/") === 0 ||
      /^iboss:\/\//i.test(value) ||
      isWebUrl(value))
  );
}

function addUrlError(entry, field, value) {
  if (!value || !isWebUrl(value)) {
    errors.push(entry + " has an invalid " + field + " URL: " + value);
  }
}

try {
  vm.runInNewContext(fs.readFileSync(catalogPath, "utf8"), {
    window: catalogWindow,
  });
} catch (err) {
  throw new Error("Unable to load games catalog: " + err.message);
}

var games =
  catalogWindow.IbossGamesCatalog && catalogWindow.IbossGamesCatalog.builtin;
if (!Array.isArray(games) || games.length === 0) {
  throw new Error("Built-in catalog did not export any games.");
}

var sources;
try {
  sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
} catch (err) {
  throw new Error("Unable to read cover sources manifest: " + err.message);
}

var sourceAssets = sources && sources.assets;
if (!sourceAssets || typeof sourceAssets !== "object") {
  throw new Error("Cover sources manifest must contain an assets object.");
}

var coverFiles = fs.readdirSync(coversDir).filter(function (name) {
  return path.extname(name).toLowerCase() === ".webp";
});
var coverFileSet = Object.create(null);
var usedCoverSet = Object.create(null);
var fileHashes = Object.create(null);
var sourceRightsUnverified = 0;
var missingSourceCount = 0;

coverFiles.forEach(function (name) {
  coverFileSet[name] = true;
});

games.forEach(function (game, index) {
  var label = "catalog[" + index + "]";
  if (!game || typeof game !== "object") {
    errors.push(label + " is not a game object");
    return;
  }
  if (!String(game.title || "").trim()) {
    errors.push(label + " has no title");
  }
  if (!isCatalogUrl(game.url)) {
    errors.push(label + " has an unsupported game URL: " + game.url);
  }
  if (!String(game.category || "").trim()) {
    errors.push(label + " has no category");
  }

  var expectedFile = slugify(game.title) + ".webp";
  if (
    typeof game.cover !== "string" ||
    game.cover.indexOf("/ui/assets/game-covers/") !== 0 ||
    path.basename(game.cover) !== expectedFile
  ) {
    errors.push(
      label +
        " cover path must be the local title slug " +
        expectedFile +
        ": " +
        game.cover
    );
    return;
  }

  var coverPath = path.join(coversDir, expectedFile);
  if (!fs.existsSync(coverPath)) {
    errors.push(label + " is missing cover " + expectedFile);
    return;
  }

  usedCoverSet[expectedFile] = true;
  var image = fs.readFileSync(coverPath);
  if (
    image.length < 100 ||
    image.toString("ascii", 0, 4) !== "RIFF" ||
    image.toString("ascii", 8, 12) !== "WEBP"
  ) {
    errors.push(label + " has an invalid WebP file: " + expectedFile);
  }

  var hash = crypto.createHash("sha256").update(image).digest("hex");
  if (fileHashes[hash]) {
    duplicates.push([fileHashes[hash], expectedFile]);
  } else {
    fileHashes[hash] = expectedFile;
  }

  if (!sourceAssets[expectedFile]) {
    missingSourceCount++;
  }
});

coverFiles.forEach(function (name) {
  if (!usedCoverSet[name]) {
    warnings.push("Unused WebP cover file: " + name);
  }
});

Object.keys(sourceAssets).forEach(function (name) {
  var entry = sourceAssets[name];
  if (!coverFileSet[name]) {
    errors.push("Source manifest references missing cover: " + name);
    return;
  }
  if (!entry || typeof entry !== "object") {
    errors.push("Source manifest entry is invalid: " + name);
    return;
  }
  if (!entry.sourcePage || !isWebUrl(entry.sourcePage)) {
    errors.push(name + " must have an http(s) sourcePage URL");
  }
  if (entry.sourceImage) addUrlError(name, "sourceImage", entry.sourceImage);
  if (entry.rightsStatus !== "verified") sourceRightsUnverified++;
});

if (duplicates.length) {
  duplicates.forEach(function (pair) {
    warnings.push("Identical cover bytes: " + pair[0] + " and " + pair[1]);
  });
}

var report = {
  ok: errors.length === 0,
  catalogEntries: games.length,
  webpCovers: coverFiles.length,
  missingCoverSources: missingSourceCount,
  sourceRecords: Object.keys(sourceAssets).length,
  sourceRightsUnverified: sourceRightsUnverified,
  duplicateCoverPairs: duplicates,
  errors: errors,
  warnings: warnings,
};

if (process.argv.indexOf("--json") !== -1) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    "Catalog check " +
      (report.ok ? "passed" : "failed") +
      ": " +
      report.catalogEntries +
      " entries, " +
      report.webpCovers +
      " WebP covers."
  );
  console.log(
    "Cover provenance: " +
      report.sourceRecords +
      " source records; " +
      report.missingCoverSources +
      " covers without a source record; " +
      report.sourceRightsUnverified +
      " recorded rights statuses not verified."
  );
  warnings.forEach(function (warning) {
    console.warn("WARN: " + warning);
  });
  errors.forEach(function (error) {
    console.error("ERROR: " + error);
  });
}

if (errors.length) process.exitCode = 1;
