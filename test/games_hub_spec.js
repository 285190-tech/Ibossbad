"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var test = require("tap").test;

var catalogSource = fs.readFileSync(
  path.join(__dirname, "..", "public", "games-catalog.js"),
  "utf8"
);
var internalPagesSource = fs.readFileSync(
  path.join(__dirname, "..", "public", "internal-pages.js"),
  "utf8"
);

function createHarness(options) {
  options = options || {};
  var storage = Object.create(null);
  var openedUrls = [];
  var miniPlayers = [];
  var checkedBatches = [];
  var coverManifest = { assets: {} };
  var window = {};
  var context = {
    window: window,
    navigator: {
      getGamepads: function () {
        return [];
      },
    },
    localStorage: {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(storage, key)
          ? storage[key]
          : null;
      },
      setItem: function (key, value) {
        storage[key] = String(value);
      },
    },
    fetch: function () {
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.resolve(coverManifest);
        },
      });
    },
  };

  vm.runInNewContext(catalogSource, context);
  vm.runInNewContext(internalPagesSource, context);

  function makeClassList(initial) {
    var names = Object.create(null);
    (initial || []).forEach(function (name) {
      if (name) names[name] = true;
    });
    return {
      add: function (name) {
        names[name] = true;
      },
      remove: function (name) {
        delete names[name];
      },
      contains: function (name) {
        return Boolean(names[name]);
      },
      toggle: function (name, force) {
        var shouldAdd = force === undefined ? !names[name] : Boolean(force);
        if (shouldAdd) names[name] = true;
        else delete names[name];
        return shouldAdd;
      },
    };
  }

  function makeElement(attributes) {
    var element = {
      attributes: attributes || {},
      listeners: Object.create(null),
      textContent: "",
      value: "",
      disabled: false,
      addEventListener: function (type, handler) {
        this.listeners[type] = handler;
      },
      getAttribute: function (name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
          ? this.attributes[name]
          : null;
      },
      hasAttribute: function (name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name);
      },
      setAttribute: function (name, value) {
        this.attributes[name] = String(value);
      },
      focus: function () {
        this.focused = true;
      },
      closest: function (selector) {
        return selector === "button" ? this : null;
      },
      contains: function (node) {
        return node === this;
      },
    };
    element.classList = makeClassList([]);
    return element;
  }

  var detailsBackdrop = makeElement();
  var backdropClasses = { hidden: true };
  detailsBackdrop.classList = {
    add: function (name) {
      backdropClasses[name] = true;
    },
    remove: function (name) {
      delete backdropClasses[name];
    },
    contains: function (name) {
      return Boolean(backdropClasses[name]);
    },
    toggle: function (name, force) {
      var shouldAdd =
        force === undefined ? !backdropClasses[name] : Boolean(force);
      if (shouldAdd) backdropClasses[name] = true;
      else delete backdropClasses[name];
      return shouldAdd;
    },
  };
  var detailsCloseButton = makeElement();
  var detailsTitle = makeElement();
  var detailsCategory = makeElement();
  var detailsBody = makeElement();
  var detailsPlayButton = makeElement();
  detailsPlayButton.disabled = true;
  var availabilityCheckButton = makeElement();
  var availabilityProgress = makeElement();
  var gamesCountValue = makeElement();
  var gamesEmptyState = makeElement();
  gamesEmptyState.classList.add("hidden");
  var searchInput = makeElement();
  var sortSelect = makeElement();
  var surpriseButton = makeElement();
  var emulatorButton = makeElement();
  var gamesGrid = makeElement();
  var tileCacheHtml = null;
  var tileCache = [];

  function decodeAttribute(value) {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function parseButtons(html, dataName) {
    var result = [];
    var expression = new RegExp(dataName + '="([^"]*)"', "g");
    var match;
    while ((match = expression.exec(html))) {
      var button = makeElement();
      button.attributes[dataName] = decodeAttribute(match[1]);
      result.push(button);
    }
    return result;
  }

  gamesGrid.contains = function (node) {
    return Boolean(node);
  };
  gamesGrid.querySelectorAll = function (selector) {
    if (selector !== ".game-tile") return [];
    if (tileCacheHtml !== container.html) {
      tileCacheHtml = container.html;
      tileCache = [];
      var expression = /<div class="game-tile([^"]*)" data-game-url="([^"]*)"/g;
      var match;
      while ((match = expression.exec(container.html))) {
        var tile = makeElement({ "data-game-url": decodeAttribute(match[2]) });
        tile.classList = makeClassList(match[1].trim().split(/\s+/));
        tileCache.push(tile);
      }
    }
    return tileCache;
  };

  var container = {
    html: "",
    buttonCache: Object.create(null),
    set innerHTML(value) {
      this.html = value;
      this.buttonCache = Object.create(null);
      tileCacheHtml = null;
    },
    get innerHTML() {
      return this.html;
    },
    querySelector: function (selector) {
      var elements = {
        "#gameDetailsBackdrop": detailsBackdrop,
        "#gameDetailsCloseBtn": detailsCloseButton,
        "#gameDetailsTitle": detailsTitle,
        "#gameDetailsCategory": detailsCategory,
        "#gameDetailsBody": detailsBody,
        "#gameDetailsPlayBtn": detailsPlayButton,
        "#checkGameAvailabilityBtn": availabilityCheckButton,
        "#gameAvailabilityProgress": availabilityProgress,
        "#gamesCountValue": gamesCountValue,
        "#gamesEmptyState": gamesEmptyState,
        "#gamesCatalogGrid": gamesGrid,
        "#gamesSearchInput": searchInput,
        "#gamesSortSelect": sortSelect,
        "#surpriseGameBtn": surpriseButton,
        "#jumpEmulatorBtn": emulatorButton,
      };
      return elements[selector] || null;
    },
    querySelectorAll: function (selector) {
      var match = selector.match(/^\[([^\]]+)\]$/);
      if (!match) return [];
      if (!this.buttonCache[selector]) {
        this.buttonCache[selector] = parseButtons(this.html, match[1]);
      }
      return this.buttonCache[selector];
    },
  };

  function clickGridButton(dataName, value) {
    var button = container
      .querySelectorAll("[" + dataName + "]")
      .filter(function (candidate) {
        return candidate.getAttribute(dataName) === value;
      })[0];
    if (!button || !gamesGrid.listeners.click) return button;
    if (dataName === "data-play-url" || dataName === "data-pip-url") {
      var marker = dataName + '="' + value.replace(/&/g, "&amp;") + '"';
      var markerIndex = container.html.indexOf(marker);
      if (markerIndex !== -1) {
        var buttonStart = container.html.lastIndexOf("<button", markerIndex);
        var buttonEnd = container.html.indexOf(">", markerIndex);
        var buttonMarkup = container.html.slice(buttonStart, buttonEnd + 1);
        var titleAttribute =
          dataName === "data-pip-url" ? "data-pip-title" : "data-play-title";
        var titleMatch = buttonMarkup.match(
          new RegExp(titleAttribute + '="([^"]*)"')
        );
        if (titleMatch) {
          button.setAttribute(titleAttribute, decodeAttribute(titleMatch[1]));
        }
      }
    }
    gamesGrid.listeners.click({
      target: button,
      stopPropagation: function () {},
    });
    return button;
  }

  var controller = window.IbossInternalPages.create({
    getCustomGames: function () {
      return options.customGames || [];
    },
    getGameAvailability: function () {
      return options.availability || {};
    },
    getGameMirrors: function () {
      return options.mirrors || [];
    },
    checkGameAvailability: function (urls) {
      checkedBatches.push(urls);
      return options.checkGameAvailability
        ? options.checkGameAvailability(urls)
        : Promise.resolve({ ok: true });
    },
    toast: function () {},
    navigate: function () {},
    openInNewTab: function (url) {
      openedUrls.push(url);
    },
    openMiniPlayer: function (url, title) {
      miniPlayers.push({ url: url, title: title });
    },
  });

  return {
    container: container,
    controller: controller,
    detailsBackdrop: detailsBackdrop,
    detailsCloseButton: detailsCloseButton,
    detailsTitle: detailsTitle,
    detailsBody: detailsBody,
    detailsPlayButton: detailsPlayButton,
    availabilityCheckButton: availabilityCheckButton,
    availabilityProgress: availabilityProgress,
    gamesCountValue: gamesCountValue,
    gamesEmptyState: gamesEmptyState,
    gamesGrid: gamesGrid,
    searchInput: searchInput,
    clickGridButton: clickGridButton,
    checkedBatches: checkedBatches,
    openedUrls: openedUrls,
    miniPlayers: miniPlayers,
    storage: storage,
  };
}

test("Games hub shows per-game and mirror availability and checks the current results", async function (t) {
  var checkedAt = Date.now() - 60000;
  var harness = createHarness({
    availability: {
      "/mgg-games/slope/": {
        status: "available",
        lastCheckedAt: checkedAt,
        mirrorId: "mirror-2",
      },
      "https://neal.fun/": {
        status: "unavailable",
        httpStatus: 503,
        lastCheckedAt: checkedAt,
        message: "The game host returned HTTP 503.",
      },
    },
    mirrors: [
      {
        id: "mirror-1",
        label: "Mirror 1 (primary.test)",
        status: "unavailable",
        lastCheckedAt: checkedAt,
      },
      {
        id: "mirror-2",
        label: "Mirror 2 (fallback.test)",
        status: "available",
        lastCheckedAt: checkedAt,
      },
    ],
  });
  harness.controller.render("iboss://games", harness.container);

  t.match(
    harness.container.innerHTML,
    /game-availability-available[\s\S]*Available/,
    "a checked game displays its available badge"
  );
  t.match(
    harness.container.innerHTML,
    /game-availability-unavailable[\s\S]*Unavailable/,
    "an unavailable game displays its status badge"
  );
  t.match(
    harness.container.innerHTML,
    /Checked [^<]+/,
    "per-game last-checked dates are visible"
  );
  t.match(
    harness.container.innerHTML,
    /Mirror 2 \(fallback\.test\): Available/,
    "mirror health and fallback state are summarized"
  );

  harness.availabilityCheckButton.listeners.click();
  await new Promise(function (resolve) {
    setImmediate(resolve);
  });
  t.ok(
    harness.checkedBatches.length > 1,
    "large catalog is checked in batches"
  );
  t.ok(
    harness.checkedBatches.every(function (batch) {
      return batch.length <= 24;
    }),
    "each API batch stays within the server limit"
  );
  t.ok(
    harness.checkedBatches.some(function (batch) {
      return batch.indexOf("/mgg-games/slope/") !== -1;
    }),
    "mirror-backed games are included in availability checks"
  );
  t.end();
});

test("Games hub search filters cached tiles without rebuilding the hub", function (t) {
  var harness = createHarness();
  harness.controller.render("iboss://games", harness.container);
  var initialHtml = harness.container.innerHTML;
  var tiles = harness.gamesGrid.querySelectorAll(".game-tile");

  t.equal(tiles.length, 207, "the full catalog is rendered once into the grid");
  harness.searchInput.value = "btd5";
  harness.searchInput.listeners.input();

  t.equal(
    harness.container.innerHTML,
    initialHtml,
    "typing filters the existing tile DOM instead of replacing the hub"
  );
  t.equal(harness.gamesCountValue.textContent, "1", "the result count updates");
  var visibleTiles = tiles.filter(function (tile) {
    return !tile.classList.contains("hidden");
  });
  t.equal(visibleTiles.length, 1, "alias search shows only the matching game");
  t.equal(
    visibleTiles[0].getAttribute("data-game-url"),
    "/mgg-games/flash/?game=bloons-td-5",
    "the Bloons TD 5 alias resolves to its catalog tile"
  );
  t.equal(
    harness.availabilityCheckButton.textContent,
    "Check 1 shown games",
    "availability check count follows the visible results"
  );

  harness.searchInput.value = "";
  harness.searchInput.listeners.input();
  t.equal(
    tiles.filter(function (tile) {
      return !tile.classList.contains("hidden");
    }).length,
    207,
    "clearing the query restores the cached catalog tiles"
  );
  t.end();
});

test("Games hub tile actions use one delegated click handler", function (t) {
  var harness = createHarness();
  harness.controller.render("iboss://games", harness.container);

  harness.clickGridButton("data-play-url", "iboss://jojo");
  t.same(harness.openedUrls, ["iboss://jojo"], "Play opens the selected title");

  harness.clickGridButton("data-fav-url", "iboss://jojo");
  t.same(
    JSON.parse(harness.storage.ibossbad_fav_games_v1),
    ["iboss://jojo"],
    "Favorite persists through delegated tile handling"
  );

  harness.clickGridButton("data-pip-url", "iboss://jojo");
  t.same(
    harness.miniPlayers,
    [
      {
        url: "iboss://jojo",
        title: "JoJo's Bizarre Adventure: Heritage for the Future",
      },
    ],
    "Mini opens the selected title without per-card event handlers"
  );
  t.end();
});

test("Games hub details show cover-source status and launch through the game handler", async function (t) {
  var harness = createHarness();
  harness.controller.render("iboss://games", harness.container);

  t.match(
    harness.container.innerHTML,
    /data-game-details-url="iboss:\/\/jojo"/,
    "catalog tiles expose a details action"
  );
  t.match(
    harness.container.innerHTML,
    /id="gameDetailsBackdrop" class="game-detail-backdrop hidden" aria-hidden="true"/,
    "a collapsed, screen-reader-hidden details drawer is available"
  );

  var detailsButton = harness.container
    .querySelectorAll("[data-game-details-url]")
    .filter(function (button) {
      return button.getAttribute("data-game-details-url") === "iboss://jojo";
    })[0];
  harness.clickGridButton("data-game-details-url", "iboss://jojo");
  await new Promise(function (resolve) {
    setImmediate(resolve);
  });

  t.equal(
    harness.detailsBackdrop.classList.contains("hidden"),
    false,
    "details drawer opens"
  );
  t.equal(
    harness.detailsTitle.textContent,
    "JoJo's Bizarre Adventure: Heritage for the Future"
  );
  t.match(
    harness.detailsBody.innerHTML,
    /Cover source and usage rights have not been verified/,
    "unverified cover rights are stated explicitly"
  );
  harness.detailsPlayButton.listeners.click();
  t.same(
    harness.openedUrls,
    ["iboss://jojo"],
    "detail play launches the selected game"
  );
  harness.detailsCloseButton.listeners.click();
  t.equal(
    harness.detailsBackdrop.classList.contains("hidden"),
    true,
    "close action hides the drawer"
  );
  t.equal(
    detailsButton.getAttribute("aria-expanded"),
    "false",
    "closing the drawer restores the trigger state"
  );
  t.end();
});

test("Games hub hide filter can be reversed without losing the title", function (t) {
  var harness = createHarness();
  harness.controller.render("iboss://games", harness.container);

  var hideButton = harness.container
    .querySelectorAll("[data-hide-url]")
    .filter(function (button) {
      return button.getAttribute("data-hide-url") === "iboss://jojo";
    })[0];
  t.ok(hideButton, "title has a Hide action");
  harness.clickGridButton("data-hide-url", "iboss://jojo");
  t.match(harness.container.innerHTML, /Hidden \(1\)/, "hidden count updates");
  t.match(
    harness.container.innerHTML,
    /class="game-tile hidden" data-game-url="iboss:\/\/jojo"/,
    "hidden title remains cached in the grid but is filtered from view"
  );

  var hiddenFilter = harness.container
    .querySelectorAll("[data-cat]")
    .filter(function (button) {
      return button.getAttribute("data-cat") === "hidden";
    })[0];
  hiddenFilter.listeners.click();
  t.match(
    harness.container.innerHTML,
    /class="game-tile" data-game-url="iboss:\/\/jojo"/,
    "hidden filter shows the cached tile again"
  );

  var unhideButton = harness.container
    .querySelectorAll("[data-hide-url]")
    .filter(function (button) {
      return button.getAttribute("data-hide-url") === "iboss://jojo";
    })[0];
  t.ok(unhideButton, "the hidden title has a delegated Unhide action");
  t.match(
    harness.container.innerHTML,
    />Unhide<\/button>/,
    "hidden title offers Unhide"
  );
  harness.clickGridButton("data-hide-url", "iboss://jojo");
  t.same(
    JSON.parse(harness.storage.ibossbad_hidden_games_v1),
    [],
    "unhiding removes the URL from local preferences"
  );
  t.match(
    harness.container.innerHTML,
    /No games are hidden/,
    "empty hidden filter explains how to use it"
  );
  t.end();
});
