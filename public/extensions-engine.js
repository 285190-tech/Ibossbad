"use strict";

(function (window) {
  var DB_NAME = "IbossExtensions";
  var STORE_NAME = "extensions";
  var MODS_KEY = "ibossbad.mods.v1";
  var STORE_MODS_KEY = "ibossbad.store_mods.v1";

  var defaultMods = {
    fpsOverlay: false,
    forceDark: false,
    customCss: "",
    customJs: "",
  };

  var BUILTIN_STORE_ITEMS = [
    {
      id: "eruda-devtools",
      name: "Eruda Full DevTools",
      badge: "DEV",
      category: "Developer",
      desc:
        "Injects full floating DevTools (Elements, Console, Network, Storage, Sources) inside any proxied page.",
      autoInjectable: true,
      code:
        "(function(){if(window.__erudaLoaded)return;window.__erudaLoaded=true;" +
        "var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/eruda';" +
        "s.onload=function(){if(window.eruda)window.eruda.init();};document.documentElement.appendChild(s);})();",
    },
    {
      id: "video-speed-16x",
      name: "Video Speed Controller (0.25x–16x)",
      badge: "16X",
      category: "Media",
      desc:
        "Adds floating 0.5x / 1x / 2x / 4x / 16x playback controls and [ / ] hotkeys to HTML5 videos.",
      autoInjectable: true,
      code:
        "(function(){if(window.__ibossVidSpeed)return;window.__ibossVidSpeed=true;" +
        "var bar=document.createElement('div');" +
        "bar.style.cssText='position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(15,23,42,.88);color:#e2e8f0;border:1px solid #334155;border-radius:99px;padding:4px 10px;font:600 11px system-ui,sans-serif;display:flex;gap:6px;align-items:center;backdrop-filter:blur(6px)';" +
        "function setRate(r){document.querySelectorAll('video').forEach(function(v){v.playbackRate=r;});lbl.textContent=r.toFixed(2).replace(/\\.00$/,'')+'x';}" +
        "var lbl=document.createElement('span');lbl.textContent='1x';" +
        "[0.5,1,1.5,2,4,16].forEach(function(r){var b=document.createElement('button');b.textContent=r+'x';b.style.cssText='background:#1e293b;color:#38bdf8;border:0;border-radius:99px;padding:2px 7px;cursor:pointer;font-size:11px';b.onclick=function(){setRate(r);};bar.appendChild(b);});" +
        "bar.insertBefore(lbl,bar.firstChild);document.body.appendChild(bar);" +
        "window.addEventListener('keydown',function(e){if(e.key===']'||e.key==='['){var v=document.querySelector('video');if(v){setRate(Math.max(0.25,Math.min(16,v.playbackRate+(e.key===']'?0.25:-0.25))));}}});" +
        "})();",
    },
    {
      id: "idle-autoclicker",
      name: "Idle-Game Auto-Clicker",
      badge: "CPS",
      category: "Gaming",
      desc:
        "Spawns a draggable target crosshair with 1–50 CPS speed control (press F8 to start/stop clicking).",
      autoInjectable: false,
      code:
        "(function(){if(window.__ibossClicker)return;window.__ibossClicker=true;" +
        "var on=false,cps=20,timer=null,tx=Math.round(innerWidth/2),ty=Math.round(innerHeight/2);" +
        "var dot=document.createElement('div');dot.style.cssText='position:fixed;left:'+(tx-14)+'px;top:'+(ty-14)+'px;width:28px;height:28px;border:2px solid #22d3ee;border-radius:50%;background:rgba(34,211,238,.2);z-index:2147483646;cursor:move;box-shadow:0 0 12px #22d3ee';" +
        "var hud=document.createElement('div');hud.style.cssText='position:fixed;top:12px;left:12px;z-index:2147483647;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:8px;padding:6px 10px;font:600 12px system-ui;display:flex;gap:8px;align-items:center';" +
        "var btn=document.createElement('button');btn.textContent='Start [F8]';btn.style.cssText='background:#0ea5e9;color:#fff;border:0;border-radius:5px;padding:3px 8px;cursor:pointer';" +
        "var inp=document.createElement('input');inp.type='number';inp.min=1;inp.max=50;inp.value=20;inp.style.cssText='width:48px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:4px;padding:2px 4px';" +
        "function toggle(){on=!on;btn.textContent=on?'Stop [F8]':'Start [F8]';btn.style.background=on?'#ef4444':'#0ea5e9';clearInterval(timer);if(on){var ms=Math.max(20,Math.round(1000/Math.min(50,Math.max(1,Number(inp.value)||20))));timer=setInterval(function(){dot.style.pointerEvents='none';var el=document.elementFromPoint(tx,ty);dot.style.pointerEvents='auto';if(el){['mousedown','mouseup','click'].forEach(function(t){el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,clientX:tx,clientY:ty}));});}},ms);}}" +
        "btn.onclick=toggle;window.addEventListener('keydown',function(e){if(e.key==='F8'){e.preventDefault();toggle();}});" +
        "var drag=false;dot.onmousedown=function(){drag=true;};window.addEventListener('mousemove',function(e){if(!drag)return;tx=e.clientX;ty=e.clientY;dot.style.left=(tx-14)+'px';dot.style.top=(ty-14)+'px';});window.addEventListener('mouseup',function(){drag=false;});" +
        "hud.append('AutoClicker CPS:',inp,btn);document.body.append(dot,hud);})();",
    },
    {
      id: "element-zapper",
      name: "Page Element & Overlay Zapper",
      badge: "ZAP",
      category: "Utility",
      desc:
        "Hover and click any annoying popup, banner, or page element to delete it instantly (Esc to exit).",
      autoInjectable: false,
      code:
        "(function(){var last=null;function mv(e){if(last)last.style.outline='';last=e.target;last.style.outline='2px solid #ef4444';}" +
        "function clk(e){e.preventDefault();e.stopPropagation();if(e.target&&e.target!==document.body&&e.target!==document.documentElement){e.target.remove();}done();}" +
        "function kd(e){if(e.key==='Escape')done();}" +
        "function done(){if(last)last.style.outline='';window.removeEventListener('mouseover',mv,true);window.removeEventListener('click',clk,true);window.removeEventListener('keydown',kd,true);}" +
        "window.addEventListener('mouseover',mv,true);window.addEventListener('click',clk,true);window.addEventListener('keydown',kd,true);})();",
    },
    {
      id: "reader-focus",
      name: "Clean Reader Typography",
      badge: "RDR",
      category: "Study",
      desc:
        "Softens glare, hides common ad containers, and formats article text for comfortable reading.",
      autoInjectable: true,
      code:
        "(function(){if(document.getElementById('__iboss_reader'))return;var s=document.createElement('style');s.id='__iboss_reader';" +
        's.textContent=\'aside,[class*="ad-"],[id*="google_ads"]{display:none!important}article,main{max-width:780px!important;margin:0 auto!important;line-height:1.7!important;font-size:17px!important}\';' +
        "(document.head||document.documentElement).appendChild(s);})();",
    },
    {
      id: "reading-ruler",
      name: "Focus Reading Ruler",
      badge: "FOC",
      category: "Study",
      desc:
        "Adds a subtle translucent reading guide bar that follows your mouse cursor vertically.",
      autoInjectable: true,
      code:
        "(function(){if(document.getElementById('__iboss_ruler'))return;var r=document.createElement('div');r.id='__iboss_ruler';" +
        "r.style.cssText='position:fixed;left:0;right:0;height:32px;background:rgba(56,189,248,0.12);border-top:1px solid rgba(56,189,248,0.35);border-bottom:1px solid rgba(56,189,248,0.35);pointer-events:none;z-index:2147483645;top:120px';" +
        "document.body.appendChild(r);window.addEventListener('mousemove',function(e){r.style.top=(e.clientY-16)+'px';});})();",
    },
  ];

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

  function getEnabledStoreMods() {
    try {
      var raw = localStorage.getItem(STORE_MODS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function toggleStoreMod(modId, enabled) {
    var map = getEnabledStoreMods();
    if (enabled) map[modId] = true;
    else delete map[modId];
    try {
      localStorage.setItem(STORE_MODS_KEY, JSON.stringify(map));
    } catch (_e) {}
    return map;
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
    var enabledStore = getEnabledStoreMods();
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

      // Inject enabled 1-Click Store Mods
      BUILTIN_STORE_ITEMS.forEach(function (item) {
        if (item.autoInjectable && enabledStore[item.id]) {
          try {
            targetWin.eval(item.code);
          } catch (_e) {}
        }
      });

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
    storeCatalog: BUILTIN_STORE_ITEMS,
    getEnabledStoreMods: getEnabledStoreMods,
    toggleStoreMod: toggleStoreMod,
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
