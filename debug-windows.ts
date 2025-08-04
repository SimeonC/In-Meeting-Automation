import { openWindowsSync } from "get-windows";

try {
  // Get all current windows
  const windows = openWindowsSync();

  // Output information about each window
  console.log("Current Windows:");
  console.log("----------------");

  windows.forEach((window, index) => {
    console.log(`Window ${index + 1}:`);
    console.log(`  Title: ${window.title}`);
    console.log(`  Owner: ${window.owner.name}`);
    console.log(`  Path: ${window.owner.path}`);
    console.log("----------------");
  });

  // Count windows by application
  const appCounts = windows.reduce((acc: Record<string, number>, win) => {
    const appName = win.owner.name;
    acc[appName] = (acc[appName] || 0) + 1;
    return acc;
  }, {});

  console.log("\nApplication Window Counts:");
  Object.entries(appCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([app, count]) => {
      console.log(`  ${app}: ${count} window(s)`);
    });
} catch (error) {
  console.error("\nError accessing window information:");
  console.error(error.message || error);
  console.error("\nTroubleshooting:");
  console.error("1. This script requires macOS accessibility permissions");
  console.error(
    "2. Go to System Settings › Privacy & Security › Accessibility"
  );
  console.error(
    "3. Add and enable Terminal (or your terminal app) in the list"
  );
  console.error("4. Run this script again");
}
