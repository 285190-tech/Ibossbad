"use strict";

var Transform = require("stream").Transform;
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

  var out = src;
  for (var i = 0; i < edits.length; i++) {
    var e = edits[i];
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
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

function locationRewriter(config) {
  function handleResponse(data) {
    if (!config.rewriteLocation) {
      return;
    }

    var isJs = contentTypes.js.includes(data.contentType);
    var isHtml = contentTypes.html.includes(data.contentType);
    if (!isJs && !isHtml) {
      return;
    }

    debug("rewriting location references in %s", data.url);
    var chunks = [];
    var totalBytes = 0;
    var MAX_BUFFER = 6 * 1024 * 1024; // 6MB safety cap

    data.stream = data.stream.pipe(
      new Transform({
        transform: function (chunk, _enc, next) {
          var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
          totalBytes += buf.length;
          chunks.push(buf);
          next();
        },
        flush: function (done) {
          var fullBuf = Buffer.concat(chunks);
          if (totalBytes > MAX_BUFFER) {
            this.push(fullBuf);
            return done();
          }
          var text = fullBuf.toString("utf8");
          var transformed = isJs
            ? rewriteLocationRefs(text)
            : rewriteInlineScriptsInHtml(text);
          this.push(transformed, "utf8");
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
