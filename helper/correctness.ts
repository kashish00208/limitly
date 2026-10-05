const BASE = "http://localhost:8080";
const H = {
  "content-type": "application/json",
  "x-admin-token": "dev-admin-token",
};

async function run(
  mode: "token_bucket" | "sliding_window",
  burst: number,
  total: number,
) {
  const key = `test-${mode}-${Date.now()}`;
  await fetch(`${BASE}/admin/clients/${key}`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({
      mode,
      rate: mode === "token_bucket" ? 0.001 : burst,
      burst,
    }),
  });
  const res = await Promise.all(
    Array.from({ length: total }, () =>
      fetch(`${BASE}/api-gateway`, {
        method: "POST",
        headers: { "x-client-key": key },
      }),
    ),
  );
  const allowed = res.filter((r) => r.status === 200).length;
  console.log(
    `${mode}: allowed=${allowed} expected=${burst}`,
    allowed === burst ? "PASS" : "FAIL",
  );
}

(async () => {
  await run("token_bucket", 100, 1000);
  await run("sliding_window", 100, 1000); // run completes within the 1s window
})();
