import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { intro, text, select, confirm, outro, isCancel } from "@clack/prompts";
import os from "os";
import { execSync } from "child_process";
import { getOrCreateCertificate } from "./cert-utils";

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
    "Could not detect Bun installation. Please ensure Bun is installed and in your PATH.",
  );
}

function detectLaunchAgentsDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, "Library", "LaunchAgents");
}

function detectUsername(): string {
  return os.userInfo().username;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to wrap a prompt and handle cancellation
async function ask<T>(
  operation: () => Promise<T>,
): Promise<Exclude<T, symbol>> {
  const answer = await operation();
  if (isCancel(answer)) {
    outro("✖ Setup cancelled.");
    process.exit(1);
  }
  return answer as Exclude<T, symbol>;
}

type SceneOption = { label: string; value: string };
type ZoneOption = { label: string; value: string };

async function registerCertificateWithKeychain(
  certPath: string,
): Promise<void> {
  const certAbsolutePath = path.resolve(process.cwd(), certPath);

  if (!fs.existsSync(certAbsolutePath)) {
    throw new Error(`Certificate file not found: ${certAbsolutePath}`);
  }

  try {
    execSync(
      `security add-trusted-cert -d -r trustRoot "${certAbsolutePath}"`,
      { stdio: "pipe" },
    );
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    if (
      errorMessage.includes("already exists") ||
      errorMessage.includes("duplicate")
    ) {
      try {
        execSync(`security delete-certificate -c "localhost"`, {
          stdio: "pipe",
        });
        execSync(
          `security add-trusted-cert -d -r trustRoot "${certAbsolutePath}"`,
          { stdio: "pipe" },
        );
      } catch (retryError: any) {
        throw new Error(
          `Failed to update existing certificate: ${retryError.message || retryError}`,
        );
      }
    } else {
      throw new Error(`Failed to add certificate to keychain: ${errorMessage}`);
    }
  }
}

async function main() {
  intro("🚀 Philips Hue Setup");

  // Initialize or load saved values
  let bridgeIp: string = process.env.HUE_BRIDGE_IP ?? "";
  let username: string = process.env.HUE_TOKEN ?? "";
  let sceneOff: string = process.env.HUE_OFF_ZONE ?? "";
  let sceneNotMeeting: string = process.env.HUE_SCENE_NOT_MEETING ?? "";
  let sceneMeeting: string = process.env.HUE_SCENE_MEETING ?? "";
  // Options for scene selection
  let sceneOptions: SceneOption[] = [];

  // Helper to rewrite .env after each change
  function writeEnv() {
    const lines = [
      bridgeIp ? `HUE_BRIDGE_IP=${bridgeIp}` : undefined,
      username ? `HUE_TOKEN=${username}` : undefined,
      sceneOff ? `HUE_OFF_ZONE=${sceneOff}` : undefined,
      sceneNotMeeting ? `HUE_SCENE_NOT_MEETING=${sceneNotMeeting}` : undefined,
      sceneMeeting ? `HUE_SCENE_MEETING=${sceneMeeting}` : undefined,
      "NODE_TLS_REJECT_UNAUTHORIZED=0",
    ].filter(Boolean) as string[];
    fs.writeFileSync(
      path.resolve(process.cwd(), ENV_FILE),
      lines.join("\n") + "\n",
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
        }),
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
          text({ message: "Enter Bridge IP", placeholder: "192.168.x.x" }),
        ),
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
                "> Link button not pressed yet. Retrying in 5 seconds...",
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

  // Step 3: Fetch available scenes and zones
  console.log("\nStep 3: Fetching scenes and zones from bridge...");
  const scenesRes = await fetch(`http://${bridgeIp}/api/${username}/scenes`);
  const scenes = (await scenesRes.json()) as Record<string, { name: string }>;
  sceneOptions = Object.entries(scenes).map<SceneOption>(([id, s]) => ({
    label: s.name,
    value: id,
  }));

  const groupsRes = await fetch(`http://${bridgeIp}/api/${username}/groups`);
  const groups = (await groupsRes.json()) as Record<
    string,
    { name: string; type?: string }
  >;
  const zoneOptions: ZoneOption[] = Object.entries(groups)
    .filter(([_, group]) => group.type === "Zone" || group.type === "Room")
    .map<ZoneOption>(([id, group]) => ({
      label: group.name,
      value: id,
    }));

  // Step 4: Select zones and scenes
  console.log("\nStep 4: Select zones and scenes");

  console.log("\nSelect 'Off' zone (used when service shuts down):");
  sceneOff = await checkCurrentValue({
    currentValue: sceneOff,
    message: "Use previous 'Off' zone",
    displayValue: (id) => {
      const zoneId = id;
      const option = zoneOptions.find((opt) => opt.value === zoneId);
      return option ? option.label : id;
    },
    getNewValue: async () => {
      return await ask(() =>
        select({
          message: "Select the 'Off' zone:",
          options: zoneOptions,
        }),
      );
    },
  });

  console.log("\nSelect 'Not Meeting' scene (used when not in a meeting):");
  sceneNotMeeting = await checkCurrentValue({
    currentValue: sceneNotMeeting,
    message: "Use previous 'Not Meeting' scene",
    displayValue: (id) => {
      const option = sceneOptions.find((opt) => opt.value === id);
      return option ? option.label : id;
    },
    getNewValue: async () => {
      const selected = await ask(() =>
        select({
          message: "Select the 'Not Meeting' scene:",
          options: sceneOptions,
        }),
      );
      return selected;
    },
  });

  console.log("\nSelect 'Meeting' scene (used when in a meeting):");
  sceneMeeting = await checkCurrentValue({
    currentValue: sceneMeeting,
    message: "Use previous 'Meeting' scene",
    displayValue: (id) => {
      const option = sceneOptions.find((opt) => opt.value === id);
      return option ? option.label : id;
    },
    getNewValue: async () => {
      const selected = await ask(() =>
        select({
          message: "Select the 'Meeting' scene:",
          options: sceneOptions,
        }),
      );
      return selected;
    },
  });

  console.log("\nStep 5: Generating SSL certificates...");
  let certPath: string;
  try {
    const { cert, key } = getOrCreateCertificate();
    certPath = cert;
    console.log(`✅ SSL certificates ready at ${cert} and ${key}`);
  } catch (error: any) {
    console.error("❌ Failed to generate SSL certificates:", error.message);
    console.log(
      "   The service may not be able to start without certificates.",
    );
    process.exit(1);
  }

  console.log("\nStep 6: Registering certificate with system keychain...");
  try {
    await registerCertificateWithKeychain(certPath);
    console.log("✅ Certificate registered with macOS Keychain");
    console.log(
      "   Chrome and other browsers should now trust the certificate",
    );
  } catch (error: any) {
    console.error("❌ Failed to register certificate:", error.message);
    console.log("   You may need to manually trust the certificate:");
    console.log(`   1. Open Keychain Access`);
    console.log(`   2. Find 'localhost' in the login keychain`);
    console.log(
      `   3. Double-click it and set 'When using this certificate' to 'Always Trust'`,
    );
    console.log(
      "   Or run: security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db .certs/cert.pem",
    );
  }

  writeEnv();
  outro("✅ Setup complete! .env file created/updated.");
  console.log(
    "\n🎯 Meeting Light Controller is now configured as a user agent.",
  );
  console.log(
    "   This is safer than a system service and can request permissions directly.",
  );
  console.log(
    "   Google Meet detection will work immediately via browser extension.",
  );
  console.log(
    "   Slack and Zoom detection requires screen recording permissions for 'Bun'.",
  );

  // Final step: create LaunchAgent plist in the current directory
  const user = detectUsername();
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
        <string>/usr/bin/osascript</string>
        <string>-e</string>
        <string>tell application "Terminal" to do script "cd ${cwd} &amp;&amp; bun run index.ts &amp;&amp; exit"</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
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
    "   For full functionality, you'll need to grant screen recording permissions to 'Bun'",
  );
  console.log(
    "   The service will work with Google Meet detection even without permissions",
  );

  // Prompt to load into launchctl
  const shouldLoad = await ask(() =>
    confirm({
      message: "Would you like to load this plist into launchctl now?",
    }),
  );

  const launchAgentsDir = detectLaunchAgentsDir();
  const targetPath = path.join(launchAgentsDir, `${label}.plist`);
  const domainTarget = `gui/$(id -u)`;

  // Check if directory exists and is writable
  if (!fs.existsSync(launchAgentsDir)) {
    console.log(
      `${launchAgentsDir} doesn't exist. Creating it requires sudo privileges.`,
    );
    execSync(`mkdir -p "${launchAgentsDir}"`, { stdio: "inherit" });
  }

  if (shouldLoad) {
    try {
      fs.unlinkSync(targetPath);
      fs.copyFileSync(plistPath, targetPath);
      execSync(`chmod 644 "${targetPath}"`, { stdio: "inherit" });

      try {
        execSync(`launchctl bootout ${domainTarget}/${label}`, {
          stdio: "ignore",
        });
      } catch {}

      execSync(`plutil -lint "${targetPath}"`, { stdio: "inherit" });

      execSync(`launchctl bootstrap ${domainTarget} "${targetPath}"`, {
        stdio: "inherit",
      });
      console.log("✅ Loaded plist into launchctl");
      console.log("\n🔐 Next Steps for Full Functionality:");
      console.log(
        "   1. Open System Settings > Privacy & Security > Screen & System Audio Recording",
      );
      console.log("   2. Add 'Bun' to the list of allowed applications");
      console.log(
        "   3. The service will automatically detect the permission change",
      );
      console.log(
        "   4. Check the logs to see if Slack and Zoom detection is working",
      );
    } catch (error: any) {
      console.error("❌ Failed to load plist:", error.message);
      console.log(`\nYou can try manually with:`);
      console.log(`  launchctl bootstrap ${domainTarget} "${targetPath}"`);
      console.log(`\nOr use the legacy command:`);
      console.log(`  launchctl load "${targetPath}"`);
    }
  } else {
    console.log(`You can load it later with:`);
    console.log(`  launchctl bootstrap ${domainTarget} "${targetPath}"`);
  }

  // Ask if should launch on login
  const shouldLaunchOnLogin = await ask(() =>
    confirm({
      message: "Would you like to make this start automatically on login?",
    }),
  );

  if (shouldLaunchOnLogin && !shouldLoad) {
    try {
      fs.copyFileSync(plistPath, targetPath);
      execSync(`chmod 644 "${targetPath}"`, { stdio: "inherit" });

      console.log(
        `✅ Copied plist to ${targetPath} for automatic startup on login`,
      );
      const domainTarget = `gui/$(id -u)`;
      console.log(`\nTo load it, run:`);
      console.log(`  launchctl bootstrap ${domainTarget} "${targetPath}"`);
    } catch (error) {
      console.error("Error setting up launch on login:", error);
      console.log(
        "You can manually copy the plist file to ~/Library/LaunchAgents and load it.",
      );
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
