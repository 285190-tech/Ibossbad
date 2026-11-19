"use strict";

var Transform = require("stream").Transform;
var StringDecoder = require("string_decoder").StringDecoder;
var acorn = require("acorn");
var walk = require("acorn-walk");
var contentTypes = require("./content-types.js");
var debug = require("debug")("unblocker:location-rewriter");

/**
 * AST-based location rewriter (inspired by GUST, AGPL-3.0).
 * Rewrites member accesses `obj.location` / `obj["location"]` -> `__ibossSafe(obj).__ibossLoc$`
 * and bare `location` identifier reads/writes -> `__ibossLoc` so SPAs (React Router,
 * Next.js, Nuxt, Vite, etc.) read the real proxied site's URL instead of the proxy path.
 */
function rewriteLocationRefs(src) {
  if (!src || typeof src !== "string" || src.indexOf("location") === -1) {
    return src;
  }

  var ast;
  try {
    ast = acorn.parse(src, {
      ecmaVersion: "latest",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowHashBang: true,
      allowImportExportEverywhere: true,
    });
  } catch (err) {
    try {
      ast = acorn.parse(src, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        allowHashBang: true,
      });
    } catch (err2) {
      return src;
    }
  }

  var declared = false;
  function mark(id) {
    if (id && id.type === "Identifier" && id.name === "location") {
      declared = true;
    }
  }
  function checkPattern(p) {
    if (!p) return;
    if (p.type === "Identifier") {
      mark(p);
    } else if (p.type === "ObjectPattern") {
      p.properties.forEach(function (pr) {
        checkPattern(pr.value || pr.argument);
      });
    } else if (p.type === "ArrayPattern") {
      p.elements.forEach(checkPattern);
    } else if (p.type === "AssignmentPattern") {
      checkPattern(p.left);
    } else if (p.type === "RestElement") {
      checkPattern(p.argument);
    }
  }

  walk.full(ast, function (n) {
    if (n.type === "VariableDeclarator") {
      checkPattern(n.id);
    } else if (
      n.type === "FunctionDeclaration" ||
      n.type === "FunctionExpression" ||
      n.type === "ArrowFunctionExpression"
    ) {
      if (n.id) mark(n.id);
      n.params.forEach(checkPattern);
    } else if (n.type === "ClassDeclaration" || n.type === "ClassExpression") {
      if (n.id) mark(n.id);
    } else if (n.type === "CatchClause") {
      checkPattern(n.param);
    } else if (
      n.type === "ImportDefaultSpecifier" ||
      n.type === "ImportNamespaceSpecifier" ||
      n.type === "ImportSpecifier"
    ) {
      mark(n.local);
    }
  });

  if (declared) {
    return src;
  }

  var edits = [];
  walk.ancestor(ast, {
    MemberExpression: function (n) {
      var dot =
        !n.computed &&
        n.property.type === "Identifier" &&
        n.property.name === "location";
      var br =
        n.computed &&
        n.property.type === "Literal" &&
        n.property.value === "location";
      if ((!dot && !br) || n.object.type === "Super") {
        return;
      }
      var seq = n.object.type === "SequenceExpression";
      edits.push({
        start: n.object.start,
        end: n.object.start,
        text: seq ? "__ibossSafe((" : "__ibossSafe(",
      });

      var optionalChain = false;
      for (
        var o = n.object;
        o;
        o =
          o.type === "MemberExpression"
            ? o.object
            : o.type === "CallExpression"
            ? o.callee
            : null
      ) {
        if (o.optional) {
          optionalChain = true;
          break;
        }
      }

      if (optionalChain) {
        edits.push({
          start: n.object.end,
          end: n.property.end,
          text:
            (seq ? "))" : ")") + (dot ? "?.__ibossLoc$" : '?.["__ibossLoc$"'),
        });
      } else {
        edits.push({
          start: n.object.end,
          end: n.object.end,
          text: seq ? "))" : ")",
        });
        edits.push({
          start: n.property.start,
          end: n.property.end,
          text: dot ? "__ibossLoc$" : '"__ibossLoc$"',
        });
      }
    },
    Identifier: function (n, _st, anc) {
      if (n.name !== "location") return;
      var p = anc[anc.length - 2];
      if (!p) return;
      if (p.type === "MemberExpression" && !p.computed && p.property === n) {
        return;
      }
      if (
        (p.type === "Property" ||
          p.type === "PropertyDefinition" ||
          p.type === "MethodDefinition") &&
        !p.computed &&
        p.key === n
      ) {
        return;
      }
      if (p.type === "Property" && p.shorthand) {
        return;
      }
      edits.push({ start: n.start, end: n.end, text: "__ibossLoc" });
    },
    VariablePattern: function (n, _st, anc) {
      if (n.name !== "location") return;
      var p = anc[anc.length - 2];
      if (p && p.type === "AssignmentExpression" && p.left === n) {
        edits.push({ start: n.start, end: n.end, text: "__ibossLoc" });
      }
    },
  });

  if (!edits.length) {
    return src;
  }

  edits.sort(function (a, b) {
    return b.start - a.start || b.end - b.start - (a.end - a.start);
  });

  // Assemble non-overlapping edits in one pass instead of repeatedly slicing
  // the growing output, which becomes expensive on location-heavy bundles.
  // Preserve the historical behavior for overlapping edits.
  var parts = [];
  var cursor = src.length;
  for (var i = 0; i < edits.length; i++) {
    var e = edits[i];
    if (e.end > cursor) {
      var out = src;
      for (var j = 0; j < edits.length; j++) {
        var edit = edits[j];
        out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
      }
      return out;
    }
    parts.push(src.slice(e.end, cursor), e.text);
    cursor = e.start;
  }
  parts.push(src.slice(0, cursor));
  return parts.reverse().join("");
}

function rewriteInlineScriptsInHtml(html) {
  if (!html || html.indexOf("location") === -1) {
    return html;
  }
  return html.replace(
    /(<script\b(?![^>]*\bsrc\s*=)[^>]*>)([\s\S]*?)(<\/script>)/gi,
    function (full, openTag, body, closeTag) {
      if (
        /type\s*=\s*['"]?(application\/(ld\+)?json|importmap|text\/html|text\/template)/i.test(
          openTag
        )
      ) {
        return full;
      }
      if (body.indexOf("unblockerInit(") !== -1) {
        return full;
      }
      return openTag + rewriteLocationRefs(body) + closeTag;
    }
  );
}

// HTML can be rewritten one complete inline script at a time. Everything
// outside a possible script is forwarded immediately, allowing the browser to
// parse the head and start subresource requests while the origin is still
// sending the rest of the page.
function createHtmlRewriteStream(maxBuffer) {
  var decoder = new StringDecoder("utf8");
  var pending = "";
  var passthrough = false;
  var closeSearchOffset = 0;
  var scriptParts = null;
  var scriptCurrent = [];
  var scriptTail = "";
  var scriptBytes = 0;
  var stream = new Transform({
    transform: function (chunk, _enc, next) {
      if (passthrough) {
        this.push(
          decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
          "utf8"
        );
        return next();
      }
      var text = decoder.write(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      );
      if (scriptParts) {
        if (!text) return next();
        scriptCurrent.push(text);
        if (scriptCurrent.length >= 1024) {
          scriptParts.push(scriptCurrent.join(""));
          scriptCurrent = [];
        }
        scriptBytes += Buffer.byteLength(text, "utf8");
        var boundary = scriptTail + text;
        if (boundary.toLowerCase().indexOf("</script>") !== -1) {
          pending = scriptParts.concat(scriptCurrent).join("");
          scriptParts = null;
          scriptCurrent = [];
          processPending(false);
        } else if (scriptBytes > maxBuffer) {
          this.push(scriptParts.concat(scriptCurrent).join(""), "utf8");
          scriptParts = null;
          scriptCurrent = [];
          passthrough = true;
        } else {
          scriptTail = boundary.slice(-8);
        }
      } else {
        pending += text;
        processPending(false);
      }
      next();
    },
    flush: function (done) {
      if (passthrough) {
        this.push(decoder.end(), "utf8");
      } else {
        if (scriptParts) {
          pending = scriptParts.concat(scriptCurrent).join("");
          scriptParts = null;
          scriptCurrent = [];
        }
        pending += decoder.end();
        processPending(true);
      }
      done();
    },
  });

  function processPending(final) {
    while (pending) {
      var start = /<script\b/i.exec(pending);
      if (!start) {
        // A script opening token may cross a chunk boundary.
        var safeLength = final
          ? pending.length
          : Math.max(0, pending.length - 7);
        // Do not split a UTF-16 surrogate pair when slicing decoded text.
        if (
          safeLength > 0 &&
          safeLength < pending.length &&
          /[\uD800-\uDBFF]/.test(pending.charAt(safeLength - 1))
        ) {
          safeLength--;
        }
        if (safeLength) stream.push(pending.slice(0, safeLength), "utf8");
        pending = pending.slice(safeLength);
        break;
      }
      if (start.index) {
        stream.push(pending.slice(0, start.index), "utf8");
        pending = pending.slice(start.index);
        closeSearchOffset = 0;
      }
      var openEnd = pending.indexOf(">");
      if (openEnd !== -1) {
        var openTag = pending.slice(0, openEnd + 1);
        // If the boundary was at the end of a chunk, validate it again now.
        if (!/^<script\b/i.test(openTag) || /\bsrc\s*=/i.test(openTag)) {
          stream.push(openTag, "utf8");
          pending = pending.slice(openEnd + 1);
          closeSearchOffset = 0;
          continue;
        }
        var searchFrom = Math.max(openEnd + 1, closeSearchOffset);
        var closeIndex = pending
          .slice(searchFrom)
          .toLowerCase()
          .indexOf("</script>");
        if (closeIndex !== -1) closeIndex += searchFrom;
        if (closeIndex !== -1) {
          var scriptEnd = closeIndex + 9;
          var scriptText = pending.slice(0, scriptEnd);
          stream.push(
            Buffer.byteLength(scriptText, "utf8") > maxBuffer
              ? scriptText
              : rewriteInlineScriptsInHtml(scriptText),
            "utf8"
          );
          pending = pending.slice(scriptEnd);
          closeSearchOffset = 0;
          continue;
        }
        // Only the suffix can be the start of a closing tag split across chunks.
        closeSearchOffset = Math.max(openEnd + 1, pending.length - 8);
      }
      if (final) {
        stream.push(pending, "utf8");
        pending = "";
      } else if (Buffer.byteLength(pending, "utf8") > maxBuffer) {
        // Never buffer an unbounded script/tag, including malformed markup.
        stream.push(pending, "utf8");
        pending = "";
        passthrough = true;
      } else if (openEnd !== -1) {
        // Hold unfinished script bodies as chunks. Repeated concatenation and
        // byte-length scans of the entire body become quadratic on large files.
        scriptParts = [pending];
        scriptBytes = Buffer.byteLength(pending, "utf8");
        scriptTail = pending.slice(-8);
        pending = "";
      }
      break;
    }
  }
  return stream;
}

function locationRewriter(config) {
  function handleResponse(data) {
    if (!config.rewriteLocation) return;
    var isJs = contentTypes.js.includes(data.contentType);
    var isHtml = contentTypes.html.includes(data.contentType);
    if (!isJs && !isHtml) return;

    debug("rewriting location references in %s", data.url);
    var MAX_BUFFER = 6 * 1024 * 1024;
    if (isHtml) {
      data.stream = data.stream.pipe(createHtmlRewriteStream(MAX_BUFFER));
      return;
    }

    var chunks = [];
    var totalBytes = 0;
    var passthrough = false;
    data.stream = data.stream.pipe(
      new Transform({
        transform: function (chunk, _enc, next) {
          var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
          if (passthrough) {
            this.push(buf);
          } else {
            totalBytes += buf.length;
            chunks.push(buf);
            if (totalBytes > MAX_BUFFER) {
              chunks.forEach((part) => this.push(part));
              chunks = [];
              passthrough = true;
            }
          }
          next();
        },
        flush: function (done) {
          if (!passthrough) {
            this.push(
              rewriteLocationRefs(Buffer.concat(chunks).toString("utf8")),
              "utf8"
            );
          }
          done();
        },
      })
    );
  }

  handleResponse.rewriteLocationRefs = rewriteLocationRefs;
  handleResponse.rewriteInlineScriptsInHtml = rewriteInlineScriptsInHtml;
  return handleResponse;
}

module.exports = locationRewriter;
module.exports.rewriteLocationRefs = rewriteLocationRefs;
module.exports.rewriteInlineScriptsInHtml = rewriteInlineScriptsInHtml;
