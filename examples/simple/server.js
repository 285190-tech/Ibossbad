"use strict";

var http = require("http");
var Unblocker = require("unblocker");
// Import the solver client
const { SolveClient } = require('@useagentstore/solve');

// Initialize the solver client with your API key.
// You should store this key in Render's environment variables.
const client = new SolveClient({ apiKey: process.env.USEAGENTSTORE_API_KEY });

// Your target site and its Turnstile sitekey.
// You'll need to find the actual sitekey by inspecting the page's HTML.
const TARGET_URL = 'https://neal.fun';
const SITEKEY = '0x4AAAAAAA...'; // Replace with the real sitekey

var unblocker = Unblocker({});

var server = http
  .createServer(function (req, res) {
    // Example: Check if the request is for your target site
    // and try to solve the challenge before proxying.
    if (req.url.includes('neal.fun')) {
      try {
        // This is an async operation, so you'd need to handle it properly.
        // For simplicity, this is a conceptual illustration.
        client.solveTurnstile({ url: TARGET_URL, sitekey: SITEKEY })
          .then(result => {
            if (result.success) {
              // You would then need to attach the token to the request
              // before passing it to unblocker.
              console.log('Token:', result.token);
              // ... proceed with unblocker ...
            }
          })
          .catch(err => {
            console.error('Solver failed:', err);
            // ... fallback ...
          });
      } catch (e) {
        // Handle errors
      }
    }

    // The rest of your existing unblocker logic...
    unblocker(req, res, function (err) {
      var headers = { "content-type": "text/plain" };
      if (err) {
        res.writeHead(500, headers);
        return res.end(err.stack || err);
      }
      if (req.url == "/") {
        res.writeHead(200, headers);
        return res.end(
          "Use the format http://thissite.com/proxy/http://site-i-want.com/ to access the proxy."
        );
      } else {
        res.writeHead(404, headers);
        return res.end("Error 404: file not found.");
      }
    });
  })
  .listen(process.env.PORT || 8080, "0.0.0.0");

server.on("upgrade", unblocker.onUpgrade);

console.log("proxy server live at http://localhost:8080/");