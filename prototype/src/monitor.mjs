import { loadConfig, runMonitor, printReport } from "./rpc-monitor.mjs";

try {
  const report = await runMonitor(loadConfig());
  printReport(report);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

