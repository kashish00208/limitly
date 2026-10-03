const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const BASE_URL = "http://localhost:8080/api-gateway";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startServer() {
  const child = spawn(process.execPath, [
    "./node_modules/ts-node/dist/bin.js",
    "src/index.ts",
  ], {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let started = false;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Timed out waiting for the rate limiter service to start."));
    }, 20000);

    const onOutput = (chunk) => {
      const output = chunk.toString();
      if (output.includes("Service is running on Port 8080")) {
        if (!started) {
          started = true;
          clearTimeout(timeout);
          resolve(child);
        }
      }
    };

    child.stdout.on("data", onOutput);
    child.stderr.on("data", onOutput);

    child.on("exit", (code, signal) => {
      if (!started) {
        clearTimeout(timeout);
        reject(new Error(`Rate limiter service exited before starting (code=${code}, signal=${signal}).`));
      }
    });
  });
}

async function requestRateLimit(clientKey, extraHeaders = {}) {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "x-client-key": clientKey,
      ...extraHeaders,
    },
  });

  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const server = await startServer();

  try {
    const missingKeyResponse = await fetch(BASE_URL, { method: "POST" });
    assert.equal(missingKeyResponse.status, 400);
    const missingKeyBody = await missingKeyResponse.json();
    assert.deepEqual(missingKeyBody, { error: "x-client-key header is required" });

    const clientKey = `smoke-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const burstResults = await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        requestRateLimit(clientKey).then((result) => ({
          index: index + 1,
          ...result,
        }))
      )
    );

    const allowed = burstResults.filter((result) => result.body.decision === "ALLOW").length;
    const denied = burstResults.filter((result) => result.body.decision === "DENY").length;

    assert.equal(allowed, 10, `Expected first burst to allow 10 requests, got ${allowed}`);
    assert.equal(denied, 5, `Expected first burst to deny 5 requests, got ${denied}`);

    await sleep(650);
    const recovery = await requestRateLimit(clientKey);
    assert.equal(recovery.status, 200, `Expected the client to recover after a refill window, got status ${recovery.status}`);
    assert.equal(recovery.body.decision, "ALLOW");

    const secondClientKey = `isolated-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const secondBurst = await Promise.all(
      Array.from({ length: 12 }, () => requestRateLimit(secondClientKey))
    );

    const secondAllowed = secondBurst.filter((result) => result.body.decision === "ALLOW").length;
    assert.equal(secondAllowed, 10, `Expected a separate client to get 10 allowed requests, got ${secondAllowed}`);

    console.log("Rate limiter tests passed.");
    console.log(`Burst results: ${allowed} allowed / ${denied} denied`);
    console.log(`Isolation check: ${secondAllowed} allowed for a second client`);
  } finally {
    server.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});