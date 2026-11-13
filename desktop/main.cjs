/**
 * Abre o PDV-Pedimais numa janela do Electron.
 * Em desenvolvimento usa o Vite já existente (porta 5173) e a API local (porta 5260).
 * Com --prod, serve a pasta FRONTEND/dist em 127.0.0.1:4173, origem já liberada no CORS da API.
 */
const { app, BrowserWindow, Menu, shell, screen, ipcMain } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

// O Chromium recente bloqueia a página em :5173 de chamar a API em :5260
// e o fetch aparece só como "Failed to fetch".
app.commandLine.appendSwitch(
  "disable-features",
  "PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests,LocalNetworkAccessChecks",
);

const FRONTEND_DIR = path.resolve(__dirname, "../FRONTEND");
const APP_ICON = path.join(__dirname, "assets", "icon.ico");
const API_DIR = path.resolve(__dirname, "../API/NETCORE");
const WEB_CANDIDATES = ["http://localhost:5173/", "http://127.0.0.1:5173/"];
const API_CANDIDATES = ["http://localhost:5260/", "http://127.0.0.1:5260/"];
const PROD_PORT = 4173;

const ownedChildren = [];
let mainWindow = null;
let staticServer = null;
let updateTimer = null;
let pendingUpdate = null;

const DEFAULT_CONNECTION =
  "Server=.\\SQLEXPRESS;Database=HorusPdv;Integrated Security=True;TrustServerCertificate=True;Encrypt=True;MultipleActiveResultSets=True";

function isProdMode() {
  return app.isPackaged || process.argv.includes("--prod");
}

function httpResponds(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 1500 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function waitUntil(check, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await check()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("timeout"));
        return;
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

function track(child) {
  ownedChildren.push(child);
  child.on("exit", () => {
    const index = ownedChildren.indexOf(child);
    if (index >= 0) ownedChildren.splice(index, 1);
  });
  return child;
}

function stopOwnedChildren() {
  for (const child of ownedChildren) {
    if (!child.pid || child.killed) continue;
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
    } else {
      child.kill("SIGTERM");
    }
  }
  ownedChildren.length = 0;
  if (staticServer) {
    staticServer.close();
    staticServer = null;
  }
}

function spawnProcess(command, args, options) {
  return track(
    spawn(command, args, {
      ...options,
      shell: process.platform === "win32",
      windowsHide: true,
    }),
  );
}

function startApi() {
  const dotnetCommand = "dotnet";
  return spawnProcess(
    dotnetCommand,
    ["run", "--project", "HORUSPDV-API.csproj", "--urls", "http://localhost:5260"],
    {
      cwd: API_DIR,
      env: {
        ...process.env,
        DOTNET_ROLL_FORWARD: "Major",
        ASPNETCORE_ENVIRONMENT: "Development",
        ConnectionStrings__HorusPdv: process.env.ConnectionStrings__HorusPdv || DEFAULT_CONNECTION,
      },
    },
  );
}

function startVite() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnProcess(
    npmCommand,
    ["run", "dev", "--", "--host", "localhost", "--port", "5173", "--strictPort"],
    {
      cwd: FRONTEND_DIR,
      env: process.env,
    },
  );
}

function proxyToApi(request, response) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: 5260,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: "127.0.0.1:5260" },
    },
    (apiResponse) => {
      response.writeHead(apiResponse.statusCode || 502, apiResponse.headers);
      apiResponse.pipe(response);
    },
  );
  upstream.on("error", () => {
    if (response.headersSent) return;
    response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ success: false, message: "A API do caixa não respondeu." }));
  });
  request.pipe(upstream);
}

function contentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function serveDist(distDir) {
  return new Promise((resolve, reject) => {
    const root = path.resolve(distDir);
    const server = http.createServer((request, response) => {
      const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
      if (requestPath === "/api" || requestPath.startsWith("/api/")) {
        proxyToApi(request, response);
        return;
      }
      const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^[/\\]+/, "");
      const filePath = path.resolve(root, relative);
      const insideRoot = filePath === root || filePath.startsWith(root + path.sep);

      const sendFile = (target, statusCode) => {
        fs.readFile(target, (error, data) => {
          if (error) {
            response.writeHead(404);
            response.end("Arquivo não encontrado.");
            return;
          }
          response.writeHead(statusCode, { "Content-Type": contentType(target) });
          response.end(data);
        });
      };

      if (!insideRoot) {
        response.writeHead(403);
        response.end();
        return;
      }

      fs.stat(filePath, (error, stat) => {
        if (!error && stat.isFile()) {
          sendFile(filePath, 200);
          return;
        }
        sendFile(path.join(root, "index.html"), 200);
      });
    });

    server.on("error", reject);
    server.listen(PROD_PORT, "127.0.0.1", () => {
      staticServer = server;
      resolve(`http://127.0.0.1:${PROD_PORT}/`);
    });
  });
}

const SPLASH_FILE = path.join(__dirname, "splash.html");

async function setSplashMessage(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const text = JSON.stringify(String(message ?? ""));
  try {
    await mainWindow.webContents.executeJavaScript(
      `(() => { const el = document.getElementById("boot-status"); if (el) el.textContent = ${text}; })()`,
    );
  } catch {
    // A tela principal pode já ter substituído a abertura.
  }
}

function isMarketingSiteUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return false;
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return pathname === "/site" || pathname === "/site.html" || pathname.startsWith("/site/");
  } catch {
    return false;
  }
}

function openMarketingSite(url) {
  shell.openExternal(url);
}

function attachWindowOpenHandler(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isMarketingSiteUrl(url)) {
      openMarketingSite(url);
      return { action: "deny" };
    }

    const local =
      url.startsWith("http://localhost") ||
      url.startsWith("http://127.0.0.1") ||
      url === "" ||
      url === "about:blank";
    if (!local) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 640,
        title: "PDV-Pedimais",
        icon: APP_ICON,
        backgroundColor: "#111827",
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isMarketingSiteUrl(url)) return;
    event.preventDefault();
    openMarketingSite(url);
  });
}

function readUpdateFeed() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "update-feed.json"), "utf8"));
    return {
      owner: String(raw.owner || "").trim(),
      repo: String(raw.repo || "").trim(),
      url: String(raw.url || "").trim().replace(/\/+$/, ""),
    };
  } catch {
    return { owner: "", repo: "", url: "" };
  }
}

function sendUpdate(payload) {
  pendingUpdate = payload;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pdv-update", payload);
}

function startAutoUpdate() {
  if (!app.isPackaged) return;
  const feed = readUpdateFeed();
  if (!feed.url && !(feed.owner && feed.repo)) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (error) {
    console.error("[atualizacao] módulo indisponível", error);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL(
    feed.url
      ? { provider: "generic", url: feed.url }
      : { provider: "github", owner: feed.owner, repo: feed.repo },
  );
  autoUpdater.on("update-available", (info) => {
    sendUpdate({ status: "available", version: info?.version || "" });
  });
  autoUpdater.on("update-downloaded", (info) => {
    sendUpdate({ status: "ready", version: info?.version || "" });
  });
  autoUpdater.on("error", (error) => {
    console.error("[atualizacao]", error);
  });

  ipcMain.handle("pdv-install-update", () => {
    autoUpdater.quitAndInstall(false, true);
  });

  const check = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error("[atualizacao]", error);
    });
  };
  check();
  updateTimer = setInterval(check, 60 * 60 * 1000);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: "PDV-Pedimais",
    icon: APP_ICON,
    backgroundColor: "#111827",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  attachWindowOpenHandler(window);
  window.webContents.on("console-message", (details) => {
    const message = typeof details === "string" ? details : details?.message;
    if (message) console.log(`[tela] ${message}`);
  });
  window.webContents.on("did-finish-load", () => {
    if (pendingUpdate) window.webContents.send("pdv-update", pendingUpdate);
  });
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

function installMenu() {
  const template = [
    {
      label: "Arquivo",
      submenu: [{ label: "Sair", accelerator: "Alt+F4", role: "quit" }],
    },
    {
      label: "Visualizar",
      submenu: [
        { label: "Recarregar", accelerator: "F5", role: "reload" },
        { label: "Tela cheia", accelerator: "F11", role: "togglefullscreen" },
        ...(!isProdMode() ? [{ label: "Ferramentas", accelerator: "F12", role: "toggleDevTools" }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function firstResponding(urls) {
  for (const url of urls) {
    if (await httpResponds(url)) return url;
  }
  return null;
}

async function resolveAppUrl() {
  const apiUp = await firstResponding(API_CANDIDATES);
  if (!apiUp) {
    await setSplashMessage("Preparando o caixa. Na primeira vez isso pode levar um pouco.");
    startApi();
    try {
      await waitUntil(() => firstResponding(API_CANDIDATES), 90000);
    } catch {
      throw new Error("A API não respondeu em http://localhost:5260. Confira se o SQL Server Express e o .NET estão instalados.");
    }
  }

  if (isProdMode()) {
    const distDir = path.join(FRONTEND_DIR, "dist");
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("A pasta FRONTEND/dist ainda não existe. Rode o build do frontend antes de abrir o modo de produção.");
    }
    return serveDist(distDir);
  }

  const webUp = await firstResponding(WEB_CANDIDATES);
  if (webUp) return webUp;

  await setSplashMessage("Preparando a tela.");
  startVite();
  try {
    await waitUntil(() => firstResponding(WEB_CANDIDATES), 60000);
  } catch {
    throw new Error("A tela não respondeu em http://localhost:5173.");
  }
  return (await firstResponding(WEB_CANDIDATES)) || WEB_CANDIDATES[0];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function presentSplash(window) {
  const area = screen.getPrimaryDisplay().workArea;
  window.setBounds({ x: area.x, y: area.y, width: area.width, height: area.height });
  window.setAlwaysOnTop(true, "screen-saver");
  window.show();
  window.focus();
}

async function boot() {
  installMenu();
  const window = createWindow();
  await window.loadFile(SPLASH_FILE);
  presentSplash(window);
  const shownAt = Date.now();

  try {
    const url = await resolveAppUrl();
    const remaining = 4000 - (Date.now() - shownAt);
    if (remaining > 0) await wait(remaining);
    window.setAlwaysOnTop(false);
    await setSplashMessage("Carregando o sistema");
    await window.loadURL(url);
    startAutoUpdate();
  } catch (error) {
    window.setAlwaysOnTop(false);
    const message = error instanceof Error ? error.message : "Não foi possível abrir o PDV.";
    await setSplashMessage(message);
  }
}

app.on("browser-window-created", (_event, created) => {
  created.webContents.on("will-prevent-unload", (event) => {
    event.preventDefault();
  });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("br.com.pedimais.pdv");
    return boot();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    if (updateTimer) clearInterval(updateTimer);
  });
  app.on("before-quit", stopOwnedChildren);
}
