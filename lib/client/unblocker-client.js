(function (global) {
  "use strict";

  function extractRemoteHref(config, location) {
    var currentRemoteHref;
    if (
      location &&
      location.pathname &&
      location.pathname.substr(0, config.prefix.length) === config.prefix
    ) {
      currentRemoteHref =
        location.pathname.substr(config.prefix.length) +
        (location.search || "") +
        (location.hash || "");
      currentRemoteHref = currentRemoteHref.replace(
        /^(https?:\/)([^/])/i,
        "$1/$2"
      );
    } else {
      currentRemoteHref =
        config.url && config.url.href ? config.url.href : String(config.url);
    }
    return currentRemoteHref;
  }

  function unproxyHref(proxiedOrRemote, config, location) {
    if (!proxiedOrRemote) return String(config.url || "");
    var str = String(proxiedOrRemote);
    if (str.substr(0, config.prefix.length) === config.prefix) {
      return str
        .substr(config.prefix.length)
        .replace(/^(https?:\/)([^/])/i, "$1/$2");
    }
    if (location && str.indexOf(location.origin + config.prefix) === 0) {
      return str
        .substr((location.origin + config.prefix).length)
        .replace(/^(https?:\/)([^/])/i, "$1/$2");
    }
    return str;
  }

  function fixUrl(urlStr, config, location) {
    if (urlStr === null || urlStr === undefined) {
      return urlStr;
    }
    if (typeof urlStr !== "string") {
      urlStr = String(urlStr);
    }
    if (!urlStr) {
      return urlStr;
    }

    var trimmed = urlStr.trim();
    if (/^(data:|blob:|javascript:|mailto:|tel:|about:)/i.test(trimmed)) {
      return urlStr;
    }

    var currentRemoteHref = extractRemoteHref(config, location);

    // check if it's already proxied (root-relative)
    if (urlStr.substr(0, config.prefix.length) === config.prefix) {
      return urlStr;
    }

    var url;
    try {
      url = new URL(urlStr, currentRemoteHref);
    } catch (err) {
      return urlStr;
    }

    // check if it's already proxied (absolute)
    if (
      location &&
      url.origin === location.origin &&
      url.pathname.substr(0, config.prefix.length) === config.prefix
    ) {
      return urlStr;
    }

    // don't break non-http(s) urls
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return urlStr;
    }

    // handle scripts that construct URLs from location.host / location.hostname
    if (location && url.hostname === location.hostname) {
      try {
        var currentRemoteUrl = new URL(currentRemoteHref);
        url.host = currentRemoteUrl.host;
        url.protocol = currentRemoteUrl.protocol;
      } catch (err) {
        // ignore
      }
    }
    return config.prefix + url.href;
  }

  function fixSrcset(srcsetValue, config, location) {
    if (!srcsetValue || typeof srcsetValue !== "string") {
      return srcsetValue;
    }
    return srcsetValue
      .split(",")
      .map(function (entry) {
        var trimmed = entry.trim();
        if (!trimmed) return entry;
        var spaceIdx = trimmed.search(/\s/);
        if (spaceIdx === -1) {
          return fixUrl(trimmed, config, location);
        }
        var u = trimmed.substr(0, spaceIdx);
        var descriptor = trimmed.substr(spaceIdx);
        return fixUrl(u, config, location) + descriptor;
      })
      .join(", ");
  }

  function initXMLHttpRequest(config, window) {
    if (!window.XMLHttpRequest || !window.XMLHttpRequest.prototype) return;
    var _open = window.XMLHttpRequest.prototype.open;
    if (!_open || _open.__unblockerPatched) return;

    var patchedOpen = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.length > 1 && args[1]) {
        args[1] = fixUrl(args[1], config, window.location);
      }
      return _open.apply(this, args);
    };
    patchedOpen.__unblockerPatched = true;
    window.XMLHttpRequest.prototype.open = patchedOpen;
  }

  function initFetch(config, window) {
    if (!window.fetch || window.fetch.__unblockerPatched) return;
    var _fetch = window.fetch;

    var patchedFetch = function (resource, init) {
      try {
        if (
          typeof window.Request !== "undefined" &&
          resource instanceof window.Request
        ) {
          var fixedReqUrl = fixUrl(resource.url, config, window.location);
          if (fixedReqUrl !== resource.url) {
            resource = new window.Request(fixedReqUrl, resource);
          }
        } else if (typeof URL !== "undefined" && resource instanceof URL) {
          resource = fixUrl(resource.href, config, window.location);
        } else if (resource !== undefined && resource !== null) {
          resource = fixUrl(String(resource), config, window.location);
        }
      } catch (err) {
        // fallback to original resource if Request cloning fails
      }
      return _fetch.call(window, resource, init);
    };
    patchedFetch.__unblockerPatched = true;
    window.fetch = patchedFetch;
  }

  function initSetAttribute(config, window) {
    if (!window.Element || !window.Element.prototype.setAttribute) return;
    var _setAttribute = window.Element.prototype.setAttribute;
    if (_setAttribute.__unblockerPatched) return;

    var URL_ATTRS = {
      src: true,
      href: true,
      action: true,
      formaction: true,
      poster: true,
    };

    var patchedSetAttribute = function (name, value) {
      if (typeof name === "string" && typeof value === "string") {
        var lower = name.toLowerCase();
        if (URL_ATTRS[lower]) {
          var trimmed = value.trim();
          // preserve in-page hash anchors on <a>/<area>
          if (trimmed.charAt(0) !== "#") {
            value = fixUrl(value, config, window.location);
          }
        } else if (lower === "srcset") {
          value = fixSrcset(value, config, window.location);
        } else if (lower === "integrity") {
          return _setAttribute.call(this, "data-unblocker-integrity", value);
        }
      }
      return _setAttribute.call(this, name, value);
    };
    patchedSetAttribute.__unblockerPatched = true;
    window.Element.prototype.setAttribute = patchedSetAttribute;
  }

  function initCreateElement(config, window) {
    if (!window.document || !window.document.createElement) return;
    var _createElement = window.document.createElement;
    if (_createElement.__unblockerPatched) return;

    var patchedCreateElement = function (tagName, options) {
      if (tagName && String(tagName).toLowerCase() === "iframe") {
        initAppendBodyIframe(config, window);
      }
      var element = _createElement.call(window.document, tagName, options);
      try {
        Object.defineProperty(element, "src", {
          set: function (src) {
            delete element.src;
            element.src = fixUrl(src, config, window.location);
          },
          configurable: true,
        });
        Object.defineProperty(element, "href", {
          set: function (href) {
            delete element.href;
            if (typeof href === "string" && href.trim().charAt(0) === "#") {
              element.href = href;
            } else {
              element.href = fixUrl(href, config, window.location);
            }
          },
          configurable: true,
        });
      } catch (err) {
        // ignore non-configurable elements
      }
      return element;
    };
    patchedCreateElement.__unblockerPatched = true;
    window.document.createElement = patchedCreateElement;
  }

  function initAppendBodyIframe(config, window) {
    if (
      !window.document ||
      !window.document.body ||
      !window.document.body.appendChild ||
      window.document.body.unblockerIframeAppendListenerInstalled
    ) {
      return;
    }

    var _appendChild = window.document.body.appendChild;

    window.document.body.appendChild = function (element) {
      var ret = _appendChild.call(window.document.body, element);
      try {
        if (
          element &&
          element.tagName &&
          element.tagName.toLowerCase() === "iframe" &&
          (!element.src || element.src === "about:blank") &&
          element.contentWindow
        ) {
          initForWindow(config, element.contentWindow);
        }
      } catch (err) {
        // ignore cross-origin iframe access errors
      }
      return ret;
    };
    window.document.body.unblockerIframeAppendListenerInstalled = true;
  }

  function initWebSockets(config, window) {
    if (!window.WebSocket || window.WebSocket.__unblockerPatched) return;
    var _WebSocket = window.WebSocket;
    var prefix = config.prefix;
    var reWsUrl = /^ws(s?):\/\/([^/]+)($|\/.*)/i;

    var WrappedWebSocket = function (wsUrl, protocols) {
      var parsedUrl = String(wsUrl).match(reWsUrl);
      if (parsedUrl) {
        var wsSecure = parsedUrl[1];
        // Note: location.protocol includes trailing colon ("https:")
        var isSecure = window.location.protocol === "https:";
        var wsProto = isSecure ? "wss://" : "ws://";
        var wsHost = parsedUrl[2];
        var remoteHref = extractRemoteHref(config, window.location);
        if (
          wsHost === window.location.host ||
          wsHost === window.location.hostname
        ) {
          try {
            var targetURL = new URL(remoteHref);
            wsHost = targetURL.host;
          } catch (err) {
            // keep wsHost
          }
        }
        var wsPath = parsedUrl[3] || "/";
        var proxiedWsUrl =
          wsProto +
          window.location.host +
          prefix +
          "http" +
          wsSecure.toLowerCase() +
          "://" +
          wsHost +
          wsPath;
        return protocols !== undefined
          ? new _WebSocket(proxiedWsUrl, protocols)
          : new _WebSocket(proxiedWsUrl);
      }
      return protocols !== undefined
        ? new _WebSocket(wsUrl, protocols)
        : new _WebSocket(wsUrl);
    };

    WrappedWebSocket.prototype = _WebSocket.prototype;
    WrappedWebSocket.CONNECTING = _WebSocket.CONNECTING;
    WrappedWebSocket.OPEN = _WebSocket.OPEN;
    WrappedWebSocket.CLOSING = _WebSocket.CLOSING;
    WrappedWebSocket.CLOSED = _WebSocket.CLOSED;
    WrappedWebSocket.__unblockerPatched = true;
    window.WebSocket = WrappedWebSocket;
  }

  function notifyParentNavigation(config, window) {
    if (!window.parent || window.parent === window) return;
    try {
      var remoteHref = extractRemoteHref(config, window.location);
      window.parent.postMessage(
        {
          type: "ibossbad:navigation",
          url: remoteHref,
          title: (window.document && window.document.title) || "",
        },
        "*"
      );
    } catch (err) {
      // ignore
    }
  }

  function initPushState(config, window) {
    if (!window.history) return;

    if (
      window.history.pushState &&
      !window.history.pushState.__unblockerPatched
    ) {
      var _pushState = window.history.pushState;
      var patchedPushState = function (state, title, url) {
        if (url !== undefined && url !== null && url !== "") {
          url = fixUrl(String(url), config, window.location);
          config.url = unproxyHref(url, config, window.location);
        }
        var res = _pushState.call(window.history, state, title, url);
        notifyParentNavigation(config, window);
        return res;
      };
      patchedPushState.__unblockerPatched = true;
      window.history.pushState = patchedPushState;
    }

    if (
      window.history.replaceState &&
      !window.history.replaceState.__unblockerPatched
    ) {
      var _replaceState = window.history.replaceState;
      var patchedReplaceState = function (state, title, url) {
        if (url !== undefined && url !== null && url !== "") {
          url = fixUrl(String(url), config, window.location);
          config.url = unproxyHref(url, config, window.location);
        }
        var res = _replaceState.call(window.history, state, title, url);
        notifyParentNavigation(config, window);
        return res;
      };
      patchedReplaceState.__unblockerPatched = true;
      window.history.replaceState = patchedReplaceState;
    }
  }

  function initWindowOpen(config, window) {
    if (!window.open || window.open.__unblockerPatched) return;
    var _open = window.open;
    var patchedWindowOpen = function (url, target, features) {
      if (url && url !== "about:blank") {
        url = fixUrl(String(url), config, window.location);
      }
      return _open.call(window, url, target, features);
    };
    patchedWindowOpen.__unblockerPatched = true;
    window.open = patchedWindowOpen;
  }

  function initSendBeacon(config, window) {
    if (
      !window.navigator ||
      !window.navigator.sendBeacon ||
      window.navigator.sendBeacon.__unblockerPatched
    ) {
      return;
    }
    var _sendBeacon = window.navigator.sendBeacon;
    var patchedSendBeacon = function (url, data) {
      if (url) {
        url = fixUrl(String(url), config, window.location);
      }
      return _sendBeacon.call(window.navigator, url, data);
    };
    patchedSendBeacon.__unblockerPatched = true;
    window.navigator.sendBeacon = patchedSendBeacon;
  }

  function initWorkers(config, window) {
    if (window.Worker && !window.Worker.__unblockerPatched) {
      var _Worker = window.Worker;
      var WrappedWorker = function (scriptURL, options) {
        var fixed = fixUrl(String(scriptURL), config, window.location);
        return options !== undefined
          ? new _Worker(fixed, options)
          : new _Worker(fixed);
      };
      WrappedWorker.prototype = _Worker.prototype;
      WrappedWorker.__unblockerPatched = true;
      window.Worker = WrappedWorker;
    }

    if (window.SharedWorker && !window.SharedWorker.__unblockerPatched) {
      var _SharedWorker = window.SharedWorker;
      var WrappedSharedWorker = function (scriptURL, options) {
        var fixed = fixUrl(String(scriptURL), config, window.location);
        return options !== undefined
          ? new _SharedWorker(fixed, options)
          : new _SharedWorker(fixed);
      };
      WrappedSharedWorker.prototype = _SharedWorker.prototype;
      WrappedSharedWorker.__unblockerPatched = true;
      window.SharedWorker = WrappedSharedWorker;
    }
  }

  function initAudio(config, window) {
    if (!window.Audio || window.Audio.__unblockerPatched) return;
    var _Audio = window.Audio;
    var WrappedAudio = function (src) {
      if (src !== undefined && src !== null && src !== "") {
        return new _Audio(fixUrl(String(src), config, window.location));
      }
      return new _Audio();
    };
    WrappedAudio.prototype = _Audio.prototype;
    WrappedAudio.__unblockerPatched = true;
    window.Audio = WrappedAudio;
  }

  function initServiceWorkerGuard(window) {
    if (
      !window.navigator ||
      !window.navigator.serviceWorker ||
      !window.navigator.serviceWorker.register ||
      window.navigator.serviceWorker.register.__unblockerPatched
    ) {
      return;
    }
    var stubRegister = function () {
      if (window.Promise && window.Promise.reject) {
        return window.Promise.reject(
          new Error(
            "ServiceWorker registration is disabled inside proxy context"
          )
        );
      }
      return null;
    };
    stubRegister.__unblockerPatched = true;
    try {
      window.navigator.serviceWorker.register = stubRegister;
    } catch (err) {
      // ignore if read-only
    }
  }

  function rewriteElementTree(root, config, window) {
    if (!root || root.nodeType !== 1) return;
    var ATTR_PAIRS = [
      ["a", "href"],
      ["link", "href"],
      ["area", "href"],
      ["img", "src"],
      ["script", "src"],
      ["iframe", "src"],
      ["audio", "src"],
      ["video", "src"],
      ["video", "poster"],
      ["source", "src"],
      ["embed", "src"],
      ["form", "action"],
      ["button", "formaction"],
    ];

    var rewriteAttr = function (el, attr) {
      var raw = el.getAttribute(attr);
      if (!raw) return;
      var trimmed = raw.trim();
      if (
        trimmed.charAt(0) === "#" ||
        trimmed.substr(0, config.prefix.length) === config.prefix
      ) {
        return;
      }
      var fixed = fixUrl(raw, config, window.location);
      if (fixed !== raw) {
        el.setAttribute(attr, fixed);
      }
    };

    ATTR_PAIRS.forEach(function (pair) {
      var tag = pair[0];
      var attr = pair[1];
      if (root.tagName && root.tagName.toLowerCase() === tag) {
        rewriteAttr(root, attr);
      }
      if (root.querySelectorAll) {
        var nodes = root.querySelectorAll(tag + "[" + attr + "]");
        for (var i = 0; i < nodes.length; i++) {
          rewriteAttr(nodes[i], attr);
        }
      }
    });

    var srcsetNodes = root.querySelectorAll
      ? root.querySelectorAll("[srcset]")
      : [];
    if (root.hasAttribute && root.hasAttribute("srcset")) {
      var rootSrcset = root.getAttribute("srcset");
      var fixedRootSrcset = fixSrcset(rootSrcset, config, window.location);
      if (fixedRootSrcset !== rootSrcset) {
        root.setAttribute("srcset", fixedRootSrcset);
      }
    }
    for (var j = 0; j < srcsetNodes.length; j++) {
      var sNode = srcsetNodes[j];
      var curSrcset = sNode.getAttribute("srcset");
      var newSrcset = fixSrcset(curSrcset, config, window.location);
      if (newSrcset !== curSrcset) {
        sNode.setAttribute("srcset", newSrcset);
      }
    }
  }

  function initMutationObserver(config, window) {
    if (!window.MutationObserver || !window.document) return;
    var observer = new window.MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "childList" && m.addedNodes) {
          for (var k = 0; k < m.addedNodes.length; k++) {
            rewriteElementTree(m.addedNodes[k], config, window);
          }
        }
      }
    });

    var startObserving = function () {
      var target = window.document.documentElement || window.document;
      if (target) {
        observer.observe(target, {
          childList: true,
          subtree: true,
        });
      }
    };

    if (window.document.documentElement) {
      startObserving();
    } else if (window.addEventListener) {
      window.addEventListener("DOMContentLoaded", startObserving);
    }
  }

  function initParentBridge(config, window) {
    if (!window.addEventListener) return;

    window.addEventListener("DOMContentLoaded", function () {
      initAppendBodyIframe(config, window);
      notifyParentNavigation(config, window);
    });
    window.addEventListener("load", function () {
      notifyParentNavigation(config, window);
    });
    window.addEventListener("popstate", function () {
      notifyParentNavigation(config, window);
    });
    window.addEventListener("hashchange", function () {
      notifyParentNavigation(config, window);
    });

    // Forward potential panic hotkeys to parent browser shell when not typing in an input
    window.addEventListener("keydown", function (ev) {
      if (!window.parent || window.parent === window) return;
      var tag =
        ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : "";
      var isEditable =
        tag === "input" ||
        tag === "textarea" ||
        (ev.target && ev.target.isContentEditable);
      if (isEditable && ev.key !== "Escape") return;
      try {
        window.parent.postMessage(
          {
            type: "ibossbad:keydown",
            key: ev.key,
            code: ev.code,
          },
          "*"
        );
      } catch (err) {
        // ignore
      }
    });
  }

  function initLocationProxy(config, window) {
    if (!window || !window.URL) return;

    function getParsedRemote() {
      var href = extractRemoteHref(config, window.location);
      try {
        return new window.URL(href);
      } catch (e) {
        return new window.URL("http://localhost/");
      }
    }

    function navigateRemote(dest, replaceMode) {
      if (dest === null || dest === undefined) return;
      var str = String(dest);
      if (str.charAt(0) === "#") {
        window.location.hash = str;
        notifyParentNavigation(config, window);
        return;
      }
      var target = fixUrl(str, config, window.location);
      if (replaceMode && window.location && window.location.replace) {
        window.location.replace(target);
      } else if (window.location) {
        window.location.href = target;
      }
    }

    var ancestorOrigins = {
      length: 0,
      item: function () {
        return null;
      },
      contains: function () {
        return false;
      },
    };

    var locTarget = {
      assign: function (u) {
        navigateRemote(u, false);
      },
      replace: function (u) {
        navigateRemote(u, true);
      },
      reload: function () {
        if (window.location && window.location.reload) {
          window.location.reload();
        }
      },
      toString: function () {
        return getParsedRemote().href;
      },
      valueOf: function () {
        return getParsedRemote().href;
      },
      ancestorOrigins: ancestorOrigins,
    };

    var locProxy = locTarget;
    if (window.Proxy) {
      locProxy = new window.Proxy(locTarget, {
        get: function (t, prop) {
          if (Object.prototype.hasOwnProperty.call(t, prop)) {
            return t[prop];
          }
          var u = getParsedRemote();
          if (prop in u) {
            var val = u[prop];
            return typeof val === "function" ? val.bind(u) : val;
          }
          return undefined;
        },
        set: function (_t, prop, value) {
          if (prop === "hash") {
            window.location.hash = value;
            notifyParentNavigation(config, window);
            return true;
          }
          var u = getParsedRemote();
          try {
            if (prop === "href") {
              navigateRemote(value, false);
              return true;
            }
            if (prop in u) {
              u[prop] = value;
              navigateRemote(u.href, false);
              return true;
            }
          } catch (err) {
            // ignore invalid URL component assignment
          }
          return true;
        },
      });
    }

    try {
      Object.defineProperty(window, "__ibossLoc", {
        configurable: true,
        get: function () {
          return locProxy;
        },
        set: function (v) {
          navigateRemote(v, false);
        },
      });
    } catch (e1) {
      window.__ibossLoc = locProxy;
    }

    try {
      if (!Object.getOwnPropertyDescriptor(Object.prototype, "__ibossLoc$")) {
        Object.defineProperty(Object.prototype, "__ibossLoc$", {
          configurable: true,
          enumerable: false,
          get: function () {
            if (this === window || this === window.document) {
              return locProxy;
            }
            return this.location;
          },
          set: function (v) {
            if (this === window || this === window.document) {
              navigateRemote(v, false);
              return;
            }
            this.location = v;
          },
        });
      }
    } catch (e2) {
      // ignore if Object.prototype is frozen
    }

    window.__ibossSafe = function (obj) {
      if (obj === null || obj === undefined) return obj;
      if (obj === window || obj === window.document) return window;
      try {
        void obj.__ibossLoc$;
        return obj;
      } catch (secErr) {
        return { __ibossLoc$: locProxy };
      }
    };

    try {
      Object.defineProperty(window, "origin", {
        configurable: true,
        get: function () {
          return getParsedRemote().origin;
        },
      });
    } catch (e3) {
      // ignore
    }

    if (window.document) {
      ["URL", "documentURI"].forEach(function (propName) {
        try {
          Object.defineProperty(window.document, propName, {
            configurable: true,
            get: function () {
              return getParsedRemote().href;
            },
          });
        } catch (e4) {
          // ignore
        }
      });
      try {
        Object.defineProperty(window.document, "domain", {
          configurable: true,
          get: function () {
            return getParsedRemote().hostname;
          },
          set: function () {},
        });
      } catch (e5) {
        // ignore
      }
    }

    if (window.Location && window.Location.prototype) {
      try {
        var origAssign = window.Location.prototype.assign;
        if (origAssign) {
          window.Location.prototype.assign = function (u) {
            return origAssign.call(this, fixUrl(u, config, window.location));
          };
        }
        var origReplace = window.Location.prototype.replace;
        if (origReplace) {
          window.Location.prototype.replace = function (u) {
            return origReplace.call(this, fixUrl(u, config, window.location));
          };
        }
      } catch (e6) {
        // ignore unforgeable Location methods
      }
    }
  }

  function initStorageIsolation(config, window) {
    if (!config || !config.isolateStorage || !window) return;

    function getOriginPrefix() {
      try {
        var parsed = new window.URL(extractRemoteHref(config, window.location));
        return "_iboss_s_" + parsed.origin + "_";
      } catch (e) {
        return "_iboss_s_default_";
      }
    }

    function makeScopedStorage(rawStorage) {
      if (!rawStorage) return null;
      return {
        getItem: function (k) {
          return rawStorage.getItem(getOriginPrefix() + k);
        },
        setItem: function (k, v) {
          rawStorage.setItem(getOriginPrefix() + k, String(v));
        },
        removeItem: function (k) {
          rawStorage.removeItem(getOriginPrefix() + k);
        },
        clear: function () {
          var pfx = getOriginPrefix();
          var toDelete = [];
          for (var i = 0; i < rawStorage.length; i++) {
            var key = rawStorage.key(i);
            if (key && key.indexOf(pfx) === 0) {
              toDelete.push(key);
            }
          }
          for (var j = 0; j < toDelete.length; j++) {
            rawStorage.removeItem(toDelete[j]);
          }
        },
        key: function (idx) {
          var pfx = getOriginPrefix();
          var matching = [];
          for (var i = 0; i < rawStorage.length; i++) {
            var key = rawStorage.key(i);
            if (key && key.indexOf(pfx) === 0) {
              matching.push(key.substr(pfx.length));
            }
          }
          return matching[idx] !== undefined ? matching[idx] : null;
        },
        get length() {
          var pfx = getOriginPrefix();
          var count = 0;
          for (var i = 0; i < rawStorage.length; i++) {
            var key = rawStorage.key(i);
            if (key && key.indexOf(pfx) === 0) count++;
          }
          return count;
        },
      };
    }

    try {
      var scopedLocal = makeScopedStorage(window.localStorage);
      if (scopedLocal) {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get: function () {
            return scopedLocal;
          },
        });
      }
      var scopedSession = makeScopedStorage(window.sessionStorage);
      if (scopedSession) {
        Object.defineProperty(window, "sessionStorage", {
          configurable: true,
          get: function () {
            return scopedSession;
          },
        });
      }
    } catch (e) {
      // ignore sandboxed storage errors
    }

    if (window.indexedDB && window.indexedDB.open) {
      try {
        var origIdbOpen = window.indexedDB.open.bind(window.indexedDB);
        window.indexedDB.open = function (name, version) {
          var scopedName = getOriginPrefix() + name;
          return arguments.length > 1
            ? origIdbOpen(scopedName, version)
            : origIdbOpen(scopedName);
        };
      } catch (e2) {
        // ignore
      }
    }
  }

  function safeRun(fn) {
    try {
      fn();
    } catch (err) {
      // keep remaining client initializers running even if one browser API is restricted
    }
  }

  function initForWindow(config, window) {
    safeRun(function () {
      initLocationProxy(config, window);
    });
    safeRun(function () {
      initStorageIsolation(config, window);
    });
    safeRun(function () {
      initXMLHttpRequest(config, window);
    });
    safeRun(function () {
      initFetch(config, window);
    });
    safeRun(function () {
      initSetAttribute(config, window);
    });
    safeRun(function () {
      initCreateElement(config, window);
    });
    safeRun(function () {
      initAppendBodyIframe(config, window);
    });
    safeRun(function () {
      initWebSockets(config, window);
    });
    safeRun(function () {
      initPushState(config, window);
    });
    safeRun(function () {
      initWindowOpen(config, window);
    });
    safeRun(function () {
      initSendBeacon(config, window);
    });
    safeRun(function () {
      initWorkers(config, window);
    });
    safeRun(function () {
      initAudio(config, window);
    });
    safeRun(function () {
      initServiceWorkerGuard(window);
    });
    safeRun(function () {
      initMutationObserver(config, window);
    });
    safeRun(function () {
      initParentBridge(config, window);
    });

    if (window === global) {
      delete global.unblockerInit;
    }
  }

  /*globals module*/
  if (typeof module === "undefined") {
    global.unblockerInit = initForWindow;
  } else {
    module.exports = {
      initForWindow: initForWindow,
      fixUrl: fixUrl,
      fixSrcset: fixSrcset,
    };
  }
})(this);
