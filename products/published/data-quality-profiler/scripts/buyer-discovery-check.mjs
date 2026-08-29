import {
  runInProcessBuyerDiscovery,
  runRemoteBuyerDiscovery,
} from "../src/discovery/buyer-discovery-runner.mjs";

try {
  const report = process.env.TARGET_URL
    ? await runRemoteBuyerDiscovery({ targetUrl: process.env.TARGET_URL })
    : await runInProcessBuyerDiscovery();

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.overall === "pass" ? 0 : 1;
} catch (error) {
  const message = error instanceof Error ? error.message : "buyer discovery check failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
