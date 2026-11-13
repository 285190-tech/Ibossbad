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

function createHarness() {
  var storage = Object.create(null);
  var openedUrls = [];
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

  function makeElement(attributes) {
    return {
      attributes: attributes || {},
      listeners: {},
      addEventListener: function (type, handler) {
        this.listeners[type] = handler;
      },
      getAttribute: function (name) {
        return this.attributes[name] || null;
      },
      setAttribute: function (name, value) {
        this.attributes[name] = String(value);
      },
      focus: function () {
        this.focused = true;
      },
    };
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
  };
  var detailsCloseButton = makeElement();
  var detailsTitle = makeElement();
  var detailsCategory = makeElement();
  var detailsBody = makeElement();
  var detailsPlayButton = makeElement();
  detailsPlayButton.disabled = true;

  function parseButtons(html, dataName) {
    var result = [];
    var expression = new RegExp(dataName + '="([^"]*)"', "g");
    var match;
    while ((match = expression.exec(html))) {
      var button = makeElement();
      button.attributes[dataName] = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      result.push(button);
    }
    return result;
  }

  var container = {
    html: "",
    buttonCache: Object.create(null),
    set innerHTML(value) {
      this.html = value;
      this.buttonCache = Object.create(null);
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
      };
      if (elements[selector]) return elements[selector];
      if (
        selector === "#surpriseGameBtn" ||
        selector === "#jumpEmulatorBtn" ||
        selector === "#gamesSearchInput" ||
        selector === "#gamesSortSelect"
      ) {
        return makeElement();
      }
      return null;
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

  var controller = window.IbossInternalPages.create({
    getCustomGames: function () {
      return [];
    },
    toast: function () {},
    navigate: function () {},
    openInNewTab: function (url) {
      openedUrls.push(url);
    },
    openMiniPlayer: function () {},
  });

  return {
    container: container,
    controller: controller,
    detailsBackdrop: detailsBackdrop,
    detailsCloseButton: detailsCloseButton,
    detailsTitle: detailsTitle,
    detailsBody: detailsBody,
    detailsPlayButton: detailsPlayButton,
    openedUrls: openedUrls,
    storage: storage,
  };
}

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
  detailsButton.listeners.click();
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
  hideButton.listeners.click();
  t.match(harness.container.innerHTML, /Hidden \(1\)/, "hidden count updates");
  t.notMatch(
    harness.container.innerHTML,
    /data-play-url="iboss:\/\/jojo"/,
    "hidden title leaves the regular catalog"
  );

  var hiddenFilter = harness.container
    .querySelectorAll("[data-cat]")
    .filter(function (button) {
      return button.getAttribute("data-cat") === "hidden";
    })[0];
  hiddenFilter.listeners.click();
  t.match(
    harness.container.innerHTML,
    /data-play-url="iboss:\/\/jojo"/,
    "hidden filter lets the user find the title again"
  );

  var unhideButton = harness.container
    .querySelectorAll("[data-hide-url]")
    .filter(function (button) {
      return button.getAttribute("data-hide-url") === "iboss://jojo";
    })[0];
  t.match(
    harness.container.innerHTML,
    />Unhide<\/button>/,
    "hidden title offers Unhide"
  );
  unhideButton.listeners.click();
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
