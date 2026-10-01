const TOTAL_REQUESTS = 100;

async function main() {
  const requests = Array.from({ length: TOTAL_REQUESTS }, (_, i) =>
    fetch("http://localhost:8080/")
      .then(async (res) => ({
        request: i + 1,
        status: res.status,
        body: await res.text(),
      }))
  );

  const results = await Promise.all(requests);

  results.forEach((result) => {
    console.log(
      `Request ${result.request}: ${result.status} ${result.body}`
    );
  });

  const successful = results.filter((r) => r.status === 200).length;
  const rejected = results.filter((r) => r.status === 429).length;

  console.log("\n----------------");
  console.log(`Successful: ${successful}`);
  console.log(`Rejected:   ${rejected}`);
}

main();