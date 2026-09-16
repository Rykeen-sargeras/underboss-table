const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const fs = require("fs");

function serverUrl() {
  if (process.env.UNDERBOSS_SERVER_URL) return process.env.UNDERBOSS_SERVER_URL;
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "server.json"), "utf8"));
    if (saved.url) return saved.url;
  } catch {}
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, "server.json"), "utf8"));
    return config.url;
  } catch {
    return "http://localhost:3000";
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0a0a0b",
    title: "Underboss Table",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  const url = serverUrl();
  if (url.includes("YOUR-RAILWAY-DOMAIN")) win.loadFile(path.join(__dirname, "setup.html"));
  else win.loadURL(url);
  win.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith("underboss-config://save")) return;
    event.preventDefault();
    try {
      const chosen = new URL(target).searchParams.get("url");
      const parsed = new URL(chosen);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
      fs.writeFileSync(path.join(app.getPath("userData"), "server.json"), JSON.stringify({ url: parsed.origin }));
      win.loadURL(parsed.origin);
    } catch { win.loadFile(path.join(__dirname, "setup.html"), { query: { error: "Enter a valid http or https address." } }); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
