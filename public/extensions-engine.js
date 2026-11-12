"use strict";

(function (window) {
  var DB_NAME = "IbossExtensions";
  var STORE_NAME = "extensions";
  var MODS_KEY = "ibossbad.mods.v1";

  var defaultMods = {
    fpsOverlay: false,
    forceDark: false,
    customCss: "",
    customJs: "",
  };

  function loadMods() {
    try {
      var raw = localStorage.getItem(MODS_KEY);
      return Object.assign({}, defaultMods, raw ? JSON.parse(raw) : {});
    } catch (_e) {
      return Object.assign({}, defaultMods);
    }
  }

  function saveMods(mods) {
    try {
      localStorage.setItem(MODS_KEY, JSON.stringify(mods));
    } catch (_e) {}
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        return reject(new Error("IndexedDB unavailable"));
      }
      var req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  async function listExtensions() {
    try {
      var db = await openDb();
      return await new Promise(function (resolve) {
        var tx = db.transaction(STORE_NAME, "readonly");
        var req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          resolve([]);
        };
      });
    } catch (_e) {
      return [];
    }
  }

  async function importZipExtension(file) {
    if (!file || !/\.zip$/i.test(file.name)) {
      throw new Error("Please choose a valid .zip extension archive.");
    }
    if (typeof JSZip === "undefined") {
      throw new Error("JSZip library is not loaded.");
    }
    var zip = await JSZip.loadAsync(file);
    var entries = Object.values(zip.files);
    var manifestPath = null;
    var i;

    for (i = 0; i < entries.length; i++) {
      if (entries[i].dir) continue;
      var p = entries[i].name.replace(/^\/+/, "");
      if (p === "manifest.json" || p.endsWith("/manifest.json")) {
        manifestPath = p;
        break;
      }
    }
    if (!manifestPath) {
      throw new Error("manifest.json not found inside .zip archive.");
    }

    var root = manifestPath.slice(0, manifestPath.lastIndexOf("manifest.json"));
    var extObj = {
      id: "",
      manifest: null,
      files: {},
      enabled: true,
      installedAt: Date.now(),
    };

    for (i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry.dir) continue;
      var rel = entry.name.replace(/^\/+/, "");
      if (root && rel.indexOf(root) === 0) {
        rel = rel.slice(root.length);
      }
      if (!rel) continue;
      if (/\.(html?|css|js|mjs|json|txt|svg)$/i.test(rel)) {
        extObj.files[rel] = {
          kind: "text",
          data: await entry.async("string"),
        };
      } else {
        extObj.files[rel] = {
          kind: "base64",
          data:
            "data:application/octet-stream;base64," +
            (await entry.async("base64")),
        };
      }
    }

    var manifestRaw =
      extObj.files["manifest.json"] && extObj.files["manifest.json"].data;
    if (!manifestRaw) {
      throw new Error("Unable to read manifest.json.");
    }
    var parsed = JSON.parse(manifestRaw);
    extObj.manifest = parsed;
    extObj.id =
      parsed.id ||
      String(parsed.name || "ext-" + Date.now())
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-");

    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(extObj);
      tx.oncomplete = resolve;
      tx.onerror = function () {
        reject(tx.error || new Error("Failed to save extension."));
      };
    });
    return extObj;
  }

  async function toggleExtension(id, enabled) {
    var db = await openDb();
    var all = await listExtensions();
    var found = all.find(function (e) {
      return e.id === id;
    });
    if (!found) return;
    found.enabled = Boolean(enabled);
    await new Promise(function (resolve) {
      var tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(found);
      tx.oncomplete = resolve;
    });
  }

  async function removeExtension(id) {
    var db = await openDb();
    await new Promise(function (resolve) {
      var tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = resolve;
    });
  }

  function buildExtensionPopupBlobUrl(extObj) {
    var popupFile =
      (extObj.manifest &&
        (extObj.manifest.popup ||
          (extObj.manifest.action && extObj.manifest.action.default_popup))) ||
      "popup.html";
    var rawHtml =
      extObj.files[popupFile] && extObj.files[popupFile].data
        ? extObj.files[popupFile].data
        : "<!DOCTYPE html><html><body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:16px'><h3>" +
          String((extObj.manifest && extObj.manifest.name) || extObj.id) +
          "</h3><p>Extension active.</p></body></html>";

    var bridge =
      "<script>" +
      "window.zinc = window.iboss = {" +
      "  tabs: {" +
      "    executeScript: function(code){ window.parent.postMessage({__ibossExtExec:true, code:String(code)}, '*'); return Promise.resolve(); }," +
      "    open: function(url){ window.parent.postMessage({__ibossExtOpen:true, url:String(url)}, '*'); }" +
      "  }" +
      "};" +
      "</script>";

    var combined = bridge + rawHtml;
    return URL.createObjectURL(new Blob([combined], { type: "text/html" }));
  }

  async function applyModsAndExtensionsToWindow(targetWin) {
    if (!targetWin || !targetWin.document) return;
    var mods = loadMods();
    var doc = targetWin.document;

    try {
      if (mods.forceDark && !doc.getElementById("__iboss_force_dark")) {
        var darkStyle = doc.createElement("style");
        darkStyle.id = "__iboss_force_dark";
        darkStyle.textContent =
          "html{filter:invert(0.92) hue-rotate(180deg)!important;background:#111!important}" +
          "img,video,canvas,svg,picture{filter:invert(1) hue-rotate(180deg)!important}";
        (doc.head || doc.documentElement).appendChild(darkStyle);
      }

      if (mods.customCss && !doc.getElementById("__iboss_custom_css")) {
        var userStyle = doc.createElement("style");
        userStyle.id = "__iboss_custom_css";
        userStyle.textContent = mods.customCss;
        (doc.head || doc.documentElement).appendChild(userStyle);
      }

      if (mods.customJs && !targetWin.__ibossCustomJsRan) {
        targetWin.__ibossCustomJsRan = true;
        targetWin.eval(mods.customJs);
      }

      // Inject enabled .zip extension content_scripts
      var exts = await listExtensions();
      exts.forEach(function (ext) {
        if (!ext.enabled || !ext.manifest) return;
        var scripts = [];
        if (Array.isArray(ext.manifest.content_scripts)) {
          ext.manifest.content_scripts.forEach(function (cs) {
            if (Array.isArray(cs.js)) {
              scripts = scripts.concat(cs.js);
            }
          });
        } else if (ext.manifest.script && ext.files[ext.manifest.script]) {
          scripts.push(ext.manifest.script);
        }
        scripts.forEach(function (sPath) {
          var f = ext.files[sPath];
          if (f && f.data) {
            try {
              targetWin.eval(f.data);
            } catch (_e) {}
          }
        });
      });
    } catch (_err) {
      // ignore cross-origin restrictions if external non-proxied frame
    }
  }

  // Live FPS HUD Overlay Manager on Host Page
  var fpsRaf = null;
  var fpsBadgeEl = null;

  function syncFpsHud() {
    var mods = loadMods();
    if (!mods.fpsOverlay) {
      if (fpsRaf) {
        cancelAnimationFrame(fpsRaf);
        fpsRaf = null;
      }
      if (fpsBadgeEl) {
        fpsBadgeEl.remove();
        fpsBadgeEl = null;
      }
      return;
    }
    if (!fpsBadgeEl) {
      fpsBadgeEl = document.createElement("div");
      fpsBadgeEl.className = "fps-hud-badge";
      fpsBadgeEl.textContent = "60 FPS";
      document.body.appendChild(fpsBadgeEl);
    }
    if (!fpsRaf) {
      var frames = 0;
      var lastTs = performance.now();
      var loop = function (now) {
        frames++;
        if (now - lastTs >= 500) {
          var fps = Math.round((frames * 1000) / (now - lastTs));
          if (fpsBadgeEl) {
            fpsBadgeEl.textContent = fps + " FPS";
          }
          frames = 0;
          lastTs = now;
        }
        fpsRaf = requestAnimationFrame(loop);
      };
      fpsRaf = requestAnimationFrame(loop);
    }
  }

  window.IbossExtensions = {
    loadMods: loadMods,
    saveMods: function (next) {
      saveMods(next);
      syncFpsHud();
    },
    syncFpsHud: syncFpsHud,
    listExtensions: listExtensions,
    importZipExtension: importZipExtension,
    toggleExtension: toggleExtension,
    removeExtension: removeExtension,
    buildExtensionPopupBlobUrl: buildExtensionPopupBlobUrl,
    applyModsAndExtensionsToWindow: applyModsAndExtensionsToWindow,
  };
})(window);
