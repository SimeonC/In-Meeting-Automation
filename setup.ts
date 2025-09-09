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

// Helper functions to detect system paths dynamically
function detectBunPath(): string {
  try {
    const bunPath = execSync("which bun", { encoding: "utf8" }).trim();
    if (bunPath) {
      return bunPath;
    }
  } catch (error) {
    // which command failed, try alternative
  }

  try {
    const bunPath = execSync("command -v bun", { encoding: "utf8" }).trim();
    if (bunPath) {
      return bunPath;
    }
  } catch (error) {
    // command -v failed
  }

  throw new Error(
    "Could not detect Bun installation. Please ensure Bun is installed and in your PATH."
  );
}

function detectLaunchAgentsDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, "Library", "LaunchAgents");
}

function detectUsername(): string {
  return os.userInfo().username;
}

function detectHomeDir(): string {
  return os.homedir();
}

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

  async function checkCurrentValue<T>({
    currentValue,
    message,
    getNewValue,
    displayValue,
  }: {
    currentValue: T;
    message: string;
    getNewValue: () => Promise<T>;
    displayValue?: (value: T) => string;
  }): Promise<T> {
    if (currentValue) {
      const displayText = displayValue
        ? displayValue(currentValue)
        : String(currentValue);
      const useExisting = await ask(() =>
        confirm({
          message: `${message}: ${displayText}`,
          initialValue: true,
        })
      );

      if (useExisting) {
        console.log(`Using existing value: ${displayText}`);
        return currentValue;
      }
    }
    const newValue = await getNewValue();
    writeEnv();
    return newValue;
  }

  // Step 1: Bridge IP
  console.log("Step 1: Philips Hue Bridge IP address");
  bridgeIp = await checkCurrentValue({
    currentValue: bridgeIp,
    message: "Use existing Bridge IP",
    getNewValue: async () =>
      String(
        await ask(() =>
          text({ message: "Enter Bridge IP", placeholder: "192.168.x.x" })
        )
      ),
  });

  // Step 2: Hue user token
  console.log("\nStep 2: Hue user token");
  username = await checkCurrentValue({
    currentValue: username,
    message: "Use existing Hue user token",
    displayValue: () => "********",
    getNewValue: async () => {
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
          const newToken = data[0].success.username;
          console.log("✅ Received token:", newToken);
          return newToken;
        } catch (err: any) {
          console.error("Network or parsing error:", err.message || err);
          process.exit(1);
        }
      }
    },
  });

  // Step 3: Fetch available lights
  console.log("\nStep 3: Fetching lights from bridge...");
  const lightsRes = await fetch(`http://${bridgeIp}/api/${username}/lights`);
  const lights = (await lightsRes.json()) as Record<string, { name: string }>;
  lightOptions = Object.entries(lights).map<LightOption>(([id, l]) => ({
    label: l.name,
    value: id,
  }));

  // Step 4: Select lights to control
  console.log("\nStep 4: Select lights to control");
  lightIds = await checkCurrentValue({
    currentValue: lightIds,
    message: "Use previous lights selection",
    displayValue: (ids) => {
      const selectedIds = ids.split(",");
      const lightNames = selectedIds
        .map((id) => {
          const option = lightOptions.find((opt) => opt.value === id);
          return option ? option.label : id;
        })
        .join(", ");
      return lightNames;
    },
    getNewValue: async () => {
      const selectedLights = await ask(() =>
        multiselect({
          message: "Select the lights you want to control:",
          options: lightOptions,
          required: true,
        })
      );

      return selectedLights.join(",");
    },
  });

  // Final confirmation
  outro("✅ Setup complete! .env file created/updated.");
  console.log(
    "\n🎯 Meeting Light Controller is now configured as a user agent."
  );
  console.log(
    "   This is safer than a system service and can request permissions directly."
  );
  console.log(
    "   Google Meet detection will work immediately via browser extension."
  );
  console.log(
    "   Slack and Zoom detection requires screen recording permissions for 'Bun'."
  );

  // Final step: create LaunchAgent plist in the current directory
  const user = detectUsername();
  const label = `com.${user}.meeting-light`;
  const cwd = process.cwd();
  const bunPath = detectBunPath();
  const homeDir = detectHomeDir();

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${bunPath}</string>
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
        <string>${homeDir}</string>
    </dict>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
</dict>
</plist>`;
  // Write plist to current directory
  const plistPath = path.resolve(cwd, `${label}.plist`);
  fs.writeFileSync(plistPath, plistContent);
  console.log(`Created user agent plist at ${plistPath}`);

  // Explain the user agent setup
  console.log("\n📋 User Agent Setup Information:");
  console.log("   This will run as a user agent (safer than system service)");
  console.log("   It can request permissions directly from the user");
  console.log(
    "   For full functionality, you'll need to grant screen recording permissions to 'Bun'"
  );
  console.log(
    "   The service will work with Google Meet detection even without permissions"
  );

  // Prompt to load into launchctl
  const shouldLoad = await ask(() =>
    confirm({
      message: "Would you like to load this plist into launchctl now?",
    })
  );

  const launchAgentsDir = detectLaunchAgentsDir();
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
    console.log("\n🔐 Next Steps for Full Functionality:");
    console.log(
      "   1. Open System Settings > Privacy & Security > Screen & System Audio Recording"
    );
    console.log("   2. Add 'Bun' to the list of allowed applications");
    console.log(
      "   3. The service will automatically detect the permission change"
    );
    console.log(
      "   4. Check the logs to see if Slack and Zoom detection is working"
    );
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
