import "dotenv/config";

/**
 * Debug script to display current color settings of all Hue lights.
 * Shows detailed information including on/off state, brightness, hue, saturation,
 * and color temperature for each light.
 */

async function main() {
  // Get bridge IP and username from environment
  const bridgeIp = process.env.HUE_BRIDGE_IP;
  const username = process.env.HUE_TOKEN;

  if (!bridgeIp || !username) {
    console.error("Missing HUE_BRIDGE_IP or HUE_TOKEN in .env file");
    console.error(
      "Please run 'bun run setup.ts' first to configure your Hue bridge"
    );
    process.exit(1);
  }

  const baseUrl = `https://${bridgeIp}/api/${username}`;

  try {
    // Fetch all lights
    console.log("Fetching information for all lights...\n");
    const response = await fetch(`${baseUrl}/lights`);
    const lights = (await response.json()) as Record<string, any>;

    if (!lights || typeof lights !== "object") {
      console.error("Failed to fetch lights or received invalid response");
      process.exit(1);
    }

    // Check if we got an error response
    if (lights.error) {
      console.error(
        "Error from Hue Bridge:",
        lights.error.description || JSON.stringify(lights.error)
      );
      process.exit(1);
    }

    // Print header
    console.log(
      "============================================== HUE LIGHTS DEBUG =============================================="
    );
    console.log(
      "ID | Name                 | State | Brightness       | Hue              | Saturation        | Color Temp        | Mode"
    );
    console.log(
      "                                    | (0-254)         | (0-65535)        | (0-254)           | (CT)              |"
    );
    console.log(
      "-----------------------------------------------------------------------------------------------------------"
    );

    // Print details for each light
    for (const [id, light] of Object.entries(lights)) {
      const name = light.name.padEnd(20).substring(0, 20);
      const state = light.state.on ? "ON " : "OFF";

      // Show both formatted and raw values
      const briFormatted = light.state.on
        ? `${Math.round((light.state.bri / 254) * 100)}%`
        : "N/A";
      const briRaw = light.state.on ? light.state.bri : "N/A";
      const bri = `${briFormatted} (${briRaw})`.padEnd(16);

      const hueFormatted =
        light.state.hue !== undefined
          ? `${Math.round((light.state.hue / 65535) * 360)}°`
          : "N/A";
      const hueRaw = light.state.hue !== undefined ? light.state.hue : "N/A";
      const hue = `${hueFormatted} (${hueRaw})`.padEnd(16);

      const satFormatted =
        light.state.sat !== undefined
          ? `${Math.round((light.state.sat / 254) * 100)}%`
          : "N/A";
      const satRaw = light.state.sat !== undefined ? light.state.sat : "N/A";
      const sat = `${satFormatted} (${satRaw})`.padEnd(17);

      const ctFormatted =
        light.state.ct !== undefined
          ? `${Math.round(1000000 / light.state.ct)}K`
          : "N/A";
      const ctRaw = light.state.ct !== undefined ? light.state.ct : "N/A";
      const ct = `${ctFormatted} (${ctRaw})`.padEnd(17);

      // Determine color mode
      let mode = "Unknown";
      if (light.state.colormode) {
        mode =
          light.state.colormode === "hs"
            ? "Color"
            : light.state.colormode === "ct"
            ? "White"
            : light.state.colormode === "xy"
            ? "XY"
            : light.state.colormode;
      }

      console.log(
        `${id.padEnd(
          2
        )} | ${name} | ${state} | ${bri} | ${hue} | ${sat} | ${ct} | ${mode}`
      );
    }

    console.log(
      "=============================================================================================================="
    );
    console.log("\nAdditional details:");

    // Show more detailed information for each light
    for (const [id, light] of Object.entries(lights)) {
      console.log(`\n[Light ${id}: ${light.name}]`);
      console.log(`  Model:         ${light.modelid || "Unknown"}`);
      console.log(`  Type:          ${light.type || "Unknown"}`);
      console.log(`  Manufacturer:  ${light.manufacturername || "Unknown"}`);
      console.log(`  Product name:  ${light.productname || "Unknown"}`);
      console.log(`  Software ver:  ${light.swversion || "Unknown"}`);

      if (light.state.on) {
        console.log("  State details:");
        console.log(
          `    On:             ${light.state.on} (raw: ${light.state.on})`
        );
        console.log(
          `    Brightness:     ${Math.round(
            (light.state.bri / 254) * 100
          )}% (raw: ${light.state.bri})`
        );

        if (light.state.hue !== undefined) {
          console.log(
            `    Hue:            ${Math.round(
              (light.state.hue / 65535) * 360
            )}° (raw: ${light.state.hue})`
          );
        }

        if (light.state.sat !== undefined) {
          console.log(
            `    Saturation:     ${Math.round(
              (light.state.sat / 254) * 100
            )}% (raw: ${light.state.sat})`
          );
        }

        if (light.state.ct !== undefined) {
          console.log(
            `    Color Temp:     ${Math.round(
              1000000 / light.state.ct
            )}K (raw CT: ${light.state.ct})`
          );
        }

        console.log(
          `    XY coordinates: ${
            light.state.xy
              ? `[${light.state.xy[0].toFixed(4)}, ${light.state.xy[1].toFixed(
                  4
                )}] (raw: [${light.state.xy[0]}, ${light.state.xy[1]}])`
              : "N/A"
          }`
        );
        console.log(`    Alert mode:     ${light.state.alert || "none"}`);
        console.log(`    Effect:         ${light.state.effect || "none"}`);
        console.log(
          `    Reachable:      ${
            light.state.reachable === true ? "Yes" : "No"
          } (raw: ${light.state.reachable})`
        );
        console.log(`    Color mode:     ${light.state.colormode || "N/A"}`);
      } else {
        console.log("  Light is OFF");
        console.log(
          `    Reachable:      ${
            light.state.reachable === true ? "Yes" : "No"
          } (raw: ${light.state.reachable})`
        );
      }
    }
  } catch (error) {
    console.error("Error connecting to Hue Bridge:", error);
    process.exit(1);
  }
}

main().catch(console.error);
