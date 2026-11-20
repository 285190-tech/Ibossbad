"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const test = require("tap").test;
const read = (name) =>
  fs.readFileSync(path.join(__dirname, "../public", name), "utf8");

test("study hub launches platforms and keeps a safe, persistent task list", (t) => {
  const dom = new JSDOM('<!doctype html><div id="view"></div>', {
    url: "https://proxy.example/",
    runScripts: "outside-only",
  });
  const w = dom.window;
  t.teardown(() => w.close());
  w.eval(read("internal-pages.js"));
  const opened = [];
  const navigated = [];
  const pages = w.IbossInternalPages.create({
    openUrl: (url, tab) => opened.push([url, tab]),
    navigate: (url) => navigated.push(url),
  });
  const view = w.document.getElementById("view");
  t.equal(pages.render("iboss://study", view), true);
  t.match(
    view.textContent,
    /No assignments are completed automatically/,
    "clearly describes functionality"
  );
  t.equal(
    view.querySelectorAll(".study-platform-card").length,
    10,
    "renders platform cards"
  );
  const search = view.querySelector("#studySearch");
  search.value = "blooket";
  search.dispatchEvent(new w.Event("input"));
  t.equal(
    view.querySelectorAll(".study-platform-card").length,
    1,
    "search filters platforms"
  );
  view.querySelector(".study-platform-card").click();
  t.match(
    view.querySelector("#studyFeature").textContent,
    /Blooket/,
    "selecting card updates feature"
  );
  view.querySelector(".study-open").click();
  t.same(
    opened[0],
    ["https://www.blooket.com/", true],
    "opens selected site through app hook in new tab"
  );
  search.value = "no such platform";
  search.dispatchEvent(new w.Event("input"));
  t.notOk(
    view.querySelector("#studyEmpty").classList.contains("hidden"),
    "empty search state is shown"
  );
  const input = view.querySelector("#studyTaskInput");
  input.value = '<img src=x onerror="alert(1)">';
  view
    .querySelector("#studyTaskForm")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  t.notOk(
    view.querySelector(".study-tasks img"),
    "task text is not rendered as HTML"
  );
  t.match(
    view.querySelector("#studyTasks").textContent,
    /<img/,
    "task text remains visible"
  );
  pages.render("iboss://study", view);
  t.match(
    view.querySelector("#studyTasks").textContent,
    /<img/,
    "task persists on rerender"
  );
  const checkbox = view.querySelector(".study-task input");
  checkbox.checked = true;
  checkbox.dispatchEvent(new w.Event("change"));
  t.match(
    view.querySelector("#studyTaskCount").textContent,
    /0 tasks left/,
    "completion updates count"
  );
  view.querySelector("#studyClearDone").click();
  t.equal(
    view.querySelectorAll(".study-task").length,
    0,
    "clear completed removes task"
  );
  view.querySelector("[data-study-focus]").click();
  t.same(navigated, ["iboss://focus"], "focus link opens existing timer");
  t.end();
});

test("toolbar study entry opens the internal study hub", async (t) => {
  const dom = new JSDOM(read("index.html"), {
    url: "https://proxy.example/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  t.teardown(() => w.close());
  w.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
  });
  w.requestAnimationFrame = () => 0;
  w.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      url === "/api/status" ? { authenticated: true, authRequired: false } : {},
  });
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (node) => {
    const result = append(node);
    if (node.tagName === "SCRIPT" && node.src.includes("internal-pages.js")) {
      w.eval(read("internal-pages.js"));
      setTimeout(() => node.onload(), 0);
    }
    return result;
  };
  [
    "visual-art",
    "games-catalog",
    "cine-cloud",
    "extensions-engine",
    "media-emulator",
    "diagnostics-tools",
    "app",
  ].forEach((name) => w.eval(read(name + ".js")));
  await new Promise((resolve) => setTimeout(resolve, 40));
  w.document.getElementById("studyHubBtn").click();
  await new Promise((resolve) => setTimeout(resolve, 40));
  t.match(
    w.document.getElementById("internalPageView").textContent,
    /better learning/,
    "toolbar loads study hub"
  );
  t.equal(
    w.document.getElementById("omniboxInput").value,
    "iboss://study",
    "internal URL appears in omnibox"
  );
});
