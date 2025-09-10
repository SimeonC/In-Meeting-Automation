import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import MeetingLightController from "./MeetingLightController";
import fs from "fs/promises";
import { watchFile } from "fs";
import path from "path";

let controller: MeetingLightController;

// Handle process termination signals
process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
process.on("SIGHUP", handleShutdown);

// Graceful shutdown function
async function handleShutdown() {
  console.log("Received shutdown signal");
  if (controller) {
    try {
      await controller.shutdown();
      console.log("Graceful shutdown completed");
    } catch (error) {
      console.error("Error during shutdown:", error);
    }
  }
  process.exit(0);
}

// Catch unhandled errors
process.on("uncaughtException", async (error) => {
  console.error("Uncaught exception:", error);
  await handleShutdown();
});

async function backupLogFile(fileName: "error" | "output") {
  const fileNameOnDisk = `${fileName}.log`;
  try {
    await fs.access(fileNameOnDisk);
    await fs.copyFile(fileNameOnDisk, `${fileName}-previous.log`);
    console.log(`Backed up ${fileNameOnDisk} to ${fileName}-previous.log`);
  } catch (err) {}
  await fs.writeFile(fileNameOnDisk, "");
}

// Start the application
(async () => {
  // Backup and clear logs at startup
  try {
    await Promise.all([backupLogFile("error"), backupLogFile("output")]);
    console.log("Cleared error.log and output.log");
  } catch (err) {
    console.error("Failed to backup/clear log files:", err);
  }

  controller = new MeetingLightController();
  await controller.run();

  // Watch .env for changes and restart controller
  const envPath = path.resolve(process.cwd(), ".env");
  watchFile(envPath, { interval: 1000 }, async (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      console.log(".env changed, restarting service...");
      try {
        await controller.shutdown();
      } catch (err) {
        console.error("Error shutting down controller:", err);
      }
      dotenv.config({ path: envPath, override: true });
      controller = new MeetingLightController();
      await controller.run();
    }
  });
})().catch(async (error) => {
  console.error(error);
  await handleShutdown();
});
