"use strict";
const tap = require("tap");
const http = require("http");
const { request } = require("playwright");
const createApp = require("../lib/app");

async function fixture() {
  const instance = createApp({
    authRequired: true,
    passcode: "temporary-test-passcode",
    adminPassword: "temporary-test-admin",
    sessionSecret: "temporary-test-secret",
    autoLoadSupabase: false,
    skipInternetProbe: true,
  });
  instance.adminManager.state.rateLimitPerMin = 2;
  const server = http.createServer(instance.app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, baseURL: "http://127.0.0.1:" + server.address().port };
}

tap.test(
  "rate limited status is HTTP 429 even with a saved user session",
  async (t) => {
    const { server, baseURL } = await fixture();
    const api = await request.newContext({ baseURL });
    try {
      t.equal(
        (
          await api.post("/api/auth/passcode", {
            data: { passcode: "temporary-test-passcode" },
          })
        ).status(),
        200
      );
      const state = await api.storageState();
      const fresh = await request.newContext({ baseURL, storageState: state });
      try {
        t.equal((await fresh.get("/api/status")).status(), 200);
        const limited = await fresh.get("/api/status");
        t.equal(limited.status(), 429);
        t.notOk((await limited.json()).authenticated);
      } finally {
        await fresh.dispose();
      }
    } finally {
      await api.dispose();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);

tap.test(
  "isolated admin session survives rate limiting across fresh contexts",
  async (t) => {
    const { server, baseURL } = await fixture();
    const api = await request.newContext({ baseURL });
    try {
      const login = await api.post("/api/auth/passcode", {
        data: { passcode: "temporary-test-admin" },
      });
      t.equal(login.status(), 200);
      const state = await api.storageState();
      for (let i = 0; i < 5; i++) {
        const fresh = await request.newContext({
          baseURL,
          storageState: state,
        });
        try {
          const response = await fresh.get("/api/status");
          t.equal(response.status(), 200);
          t.equal((await response.json()).isAdmin, true);
        } finally {
          await fresh.dispose();
        }
      }
    } finally {
      await api.dispose();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
