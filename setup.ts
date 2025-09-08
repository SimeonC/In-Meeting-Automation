import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  intro,
  text,
  multiselect,
  confirm,
  outro,
  isCancel,
} from "@clack/prompts";
import os from "os";
import { execSync } from "child_process";

const ENV_FILE = ".env";

// Load existing .env if present
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE) });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to wrap a prompt and handle cancellation
async function ask<T>(
  operation: () => Promise<T>
): Promise<Exclude<T, symbol>> {
  const answer = await operation();
  if (isCancel(answer)) {
    outro("✖ Setup cancelled.");
    process.exit(1);
  }
  return answer as Exclude<T, symbol>;
}

// Type for available light selection options
type LightOption = { label: string; value: string };

async function main() {
  intro("🚀 Philips Hue Setup");

  // Initialize or load saved values
  let bridgeIp: string = process.env.HUE_BRIDGE_IP ?? "";
  let username: string = process.env.HUE_TOKEN ?? "";
  let lightIds: string = process.env.HUE_LIGHT_IDS ?? "";
  // Options for lighting selection
  let lightOptions: LightOption[] = [];

  // Helper to rewrite .env after each change
  function writeEnv() {
    const lines = [
      bridgeIp ? `HUE_BRIDGE_IP=${bridgeIp}` : undefined,
      username ? `HUE_TOKEN=${username}` : undefined,
      lightIds ? `HUE_LIGHT_IDS=${lightIds}` : undefined,
      "NODE_TLS_REJECT_UNAUTHORIZED=0",
    ].filter(Boolean) as string[];
    fs.writeFileSync(
      path.resolve(process.cwd(), ENV_FILE),
      lines.join("\n") + "\n"
    );
  }

  // Step 1: Bridge IP
  if (!bridgeIp) {
    console.log("Step 1: Enter your Philips Hue Bridge IP address");
    bridgeIp = String(
      await ask(() =>
        text({ message: "Bridge IP", placeholder: "192.168.x.x" })
      )
    );
    writeEnv();
  } else {
    console.log(`Using existing Bridge IP: ${bridgeIp}`);
  }

  // Step 2: Hue user token
  if (!username) {
    console.log("\nStep 2: Create a new user token");
    console.log("→ Press the link button on your Hue Bridge when prompted.");
    console.log("→ Waiting 30 seconds before first attempt...");
    await sleep(30000);
    while (true) {
      console.log("Attempting to register a new user...");
      try {
        const response = await fetch(`http://${bridgeIp}/api`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ devicetype: "in-meeting-automation#setup" }),
        });
        const data = (await response.json()) as {
          success: { username: string };
          error?: { type: number };
        }[];
        if (Array.isArray(data) && data[0].error) {
          if (data[0].error.type === 101) {
            console.log(
              "> Link button not pressed yet. Retrying in 5 seconds..."
            );
            await sleep(5000);
            continue;
          } else {
            console.error("Unexpected error:", data[0].error);
            process.exit(1);
          }
        }
        username = data[0].success.username;
        console.log("✅ Received token:", username);
        writeEnv();
        break;
      } catch (err: any) {
        console.error("Network or parsing error:", err.message || err);
        process.exit(1);
      }
    }
  } else {
    console.log(`Using existing Hue user token: ${username}`);
  }

  // Step 3: Fetch available lights
  console.log("\nStep 3: Fetching lights from bridge...");
  const lightsRes = await fetch(`http://${bridgeIp}/api/${username}/lights`);
  const lights = (await lightsRes.json()) as Record<string, { name: string }>;
  lightOptions = Object.entries(lights).map<LightOption>(([id, l]) => ({
    label: `${id}: ${l.name}`,
    value: id,
  }));

  // Step 4: Select lights to control
  if (!lightIds) {
    const selectedLights = await ask(() =>
      multiselect({
        message: "Select the lights you want to control:",
        options: lightOptions,
        required: true,
      })
    );

    lightIds = selectedLights.join(",");
    writeEnv();
  } else {
    console.log(`Using existing light IDs: ${lightIds}`);
  }

  // Final confirmation
  outro("✅ Setup complete! .env file created/updated.");

  // Final step: create LaunchAgent plist in the current directory
  const user = os.userInfo().username;
  const label = `com.${user}.meeting-light`;
  const cwd = process.cwd();
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/simeoncheeseman/.asdf/installs/bun/1.2.2/bin/bun</string>
        <string>run</string>
        <string>${cwd}/index.ts</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${cwd}</string>
    <key>StandardErrorPath</key>
    <string>${cwd}/error.log</string>
    <key>StandardOutPath</key>
    <string>${cwd}/output.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${process.env.PATH}</string>
        <key>HOME</key>
        <string>${os.homedir()}</string>
    </dict>
</dict>
</plist>`;
  // Write plist to current directory
  const plistPath = path.resolve(cwd, `${label}.plist`);
  fs.writeFileSync(plistPath, plistContent);
  console.log(`Created plist at ${plistPath}`);
  // Prompt to load into launchctl
  const shouldLoad = await ask(() =>
    confirm({
      message: "Would you like to load this plist into launchctl now?",
    })
  );

  const launchAgentsDir = path.join(os.homedir(), "Library/LaunchAgents");
  const targetPath = path.join(launchAgentsDir, `${label}.plist`);

  // Check if directory exists and is writable
  if (!fs.existsSync(launchAgentsDir)) {
    console.log(
      `${launchAgentsDir} doesn't exist. Creating it requires sudo privileges.`
    );
    execSync(`mkdir -p "${launchAgentsDir}"`, { stdio: "inherit" });
  }

  if (shouldLoad) {
    execSync(`launchctl load -w "${plistPath}"`, {
      stdio: "inherit",
      cwd: launchAgentsDir,
    });
    console.log("✅ Loaded plist into launchctl");
  } else {
    console.log(`You can load it later with: launchctl load "${plistPath}"`);
  }

  // Ask if should launch on login
  const shouldLaunchOnLogin = await ask(() =>
    confirm({
      message: "Would you like to make this start automatically on login?",
    })
  );

  if (shouldLaunchOnLogin) {
    try {
      // Copy the file with sudo
      execSync(`cp "${plistPath}" "${launchAgentsDir}"`, { stdio: "inherit" });
      execSync(`chmod 644 "${targetPath}"`, { stdio: "inherit" });

      console.log(
        `✅ Copied plist to ${targetPath} for automatic startup on login`
      );
    } catch (error) {
      console.error("Error setting up launch on login:", error);
      console.log(
        "You can manually copy the plist file to /Library/LaunchAgents with sudo privileges."
      );
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
