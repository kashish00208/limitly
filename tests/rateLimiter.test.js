const TOTAL_REQUESTS = 100;
const CLIENT_KEY = `smoke-test-${Date.now()}`;

async function main() {
  const requests = Array.from({ length: TOTAL_REQUESTS }, (_, i) =>
    fetch("http://localhost:8080/api-gateway", {
      method: "POST",
      headers: { "x-client-key": CLIENT_KEY },
    }).then(async (res) => ({
        request: i + 1,
        status: res.status,
        body: await res.json(),
      }))
  );

  const results = await Promise.all(requests);

  results.forEach((result) => {
    console.log(
      `Request ${result.request}: ${result.status} ${result.body}`
    );
  });

  const allowed = results.filter((r) => r.body.decision === "ALLOW").length;
  const denied = results.filter((r) => r.body.decision === "DENY").length;

  console.log("\n----------------");
  console.log(`Allowed: ${allowed}`);
  console.log(`Denied:  ${denied}`);
}

main();