/**
 * Abre o PDV-Pedimais numa janela do Electron.
 * A tela fala só com https://apipdv.reffix.com.br. O banco fica no Postgres do servidor.
 * Em desenvolvimento usa o Vite já existente (porta 5173). No executável, a tela vai junto e abre em 127.0.0.1:4173.
 */
const { app, BrowserWindow, Menu, shell, screen, ipcMain } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// O Chromium recente bloqueia a página em :5173 de chamar a API em :5260
// e o fetch aparece só como "Failed to fetch".
app.commandLine.appendSwitch(
  "disable-features",
  "PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests,LocalNetworkAccessChecks",
);

const localDb = require("./localdb/database.cjs");
const FRONTEND_DIR = path.resolve(__dirname, "../FRONTEND");
const APP_ICON = path.join(__dirname, "assets", "icon.ico");
const WEB_CANDIDATES = ["http://localhost:5173/", "http://127.0.0.1:5173/"];
const API_HOST = "apipdv.reffix.com.br";
const PROD_PORT = 4173;

const ownedChildren = [];
let mainWindow = null;
let staticServer = null;
let updateTimer = null;
let pendingUpdate = null;
let stagedInstaller = null;
let updateInstallStarted = false;
let updateCheckRunning = false;

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
  const upstream = https.request(
    {
      hostname: API_HOST,
      port: 443,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: API_HOST },
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
    ".gif": "image/gif",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function cacheControl(filePath) {
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  if (name === "index.html" || ext === ".html") return "no-cache";
  if (/-[A-Za-z0-9_]{6,}\.(js|css|png|jpe?g|webp|svg|gif|woff2?)$/i.test(name)) {
    return "public, max-age=31536000, immutable";
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".ico", ".woff", ".woff2"].includes(ext)) {
    return "public, max-age=604800";
  }
  return "public, max-age=3600";
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

      const sendFile = (target, statusCode, stat) => {
        const headers = {
          "Content-Type": contentType(target),
          "Cache-Control": cacheControl(target),
        };
        if (stat) {
          headers.ETag = `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`;
          if (request.headers["if-none-match"] === headers.ETag) {
            response.writeHead(304, headers);
            response.end();
            return;
          }
        }
        fs.readFile(target, (error, data) => {
          if (error) {
            response.writeHead(404);
            response.end("Arquivo não encontrado.");
            return;
          }
          response.writeHead(statusCode, headers);
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
          sendFile(filePath, 200, stat);
          return;
        }
        const indexPath = path.join(root, "index.html");
        fs.stat(indexPath, (indexError, indexStat) => {
          sendFile(indexPath, 200, indexError ? undefined : indexStat);
        });
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

function readUpdateFeedUrl() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "update-feed.json"), "utf8"));
    return String(raw.url || "").trim().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function sendUpdate(payload) {
  pendingUpdate = payload;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("pdv-update", payload);
}

function versionParts(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const match = /^(\d+)/.exec(part);
      return match ? Number(match[1]) : 0;
    });
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function installerFileName(file) {
  const name = path.win32.basename(String(file || "").replace(/\\/g, "/")).trim();
  if (!name || name !== String(file || "").trim() || !name.toLowerCase().endsWith(".exe")) return "";
  return name;
}

function requestStream(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      reject(error);
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      reject(new Error("endereço de atualização inválido"));
      return;
    }
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(url, { headers: { "Cache-Control": "no-cache" } }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
        response.resume();
        resolve(requestStream(new URL(location, url).toString(), redirectsLeft - 1));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`atualização respondeu ${status}`));
        return;
      }
      resolve(response);
    });
    request.on("error", reject);
  });
}

function readResponse(response) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => resolve(Buffer.concat(chunks)));
    response.on("error", reject);
  });
}

function downloadTo(url, destination) {
  return requestStream(url).then(
    (response) =>
      new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destination);
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve(destination)));
        file.on("error", (error) => {
          file.close(() => reject(error));
        });
        response.on("error", reject);
      }),
  );
}

function launchStagedInstaller() {
  if (updateInstallStarted || !stagedInstaller || !fs.existsSync(stagedInstaller)) return;
  updateInstallStarted = true;
  spawn(stagedInstaller, ["/S"], { detached: true, stdio: "ignore" }).unref();
}

async function checkServerVersion(feedUrl) {
  const localVersion = app.getVersion();
  const response = await requestStream(`${feedUrl}/version.json?t=${Date.now()}`);
  const manifest = JSON.parse((await readResponse(response)).toString("utf8").replace(/^\uFEFF/, ""));
  const remoteVersion = String(manifest.version || "").trim();
  if (!remoteVersion || compareVersions(remoteVersion, localVersion) <= 0) return;

  const arch = process.arch === "ia32" ? "ia32" : "x64";
  const named = manifest.files && typeof manifest.files === "object" ? manifest.files[arch] : "";
  const fileName = installerFileName(named) || installerFileName(manifest.file);
  if (!fileName) throw new Error("o version.json não informou o instalador");

  const folder = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(folder, { recursive: true });
  const destination = path.join(folder, fileName);
  if (stagedInstaller === destination && fs.existsSync(destination)) {
    sendUpdate({ status: "ready", version: remoteVersion });
    return;
  }

  sendUpdate({ status: "available", version: remoteVersion });
  const temporary = `${destination}.download`;
  await downloadTo(`${feedUrl}/${encodeURIComponent(fileName)}`, temporary);
  const size = fs.statSync(temporary).size;
  if (size < 1000000) {
    fs.unlinkSync(temporary);
    throw new Error("o instalador baixado está incompleto");
  }
  if (fs.existsSync(destination)) fs.unlinkSync(destination);
  fs.renameSync(temporary, destination);
  stagedInstaller = destination;
  sendUpdate({ status: "ready", version: remoteVersion });
}

function startAutoUpdate() {
  if (!app.isPackaged) return;
  const feedUrl = readUpdateFeedUrl();
  if (!feedUrl) return;

  ipcMain.handle("pdv-install-update", () => {
    launchStagedInstaller();
    app.quit();
  });

  const check = async () => {
    if (updateCheckRunning) return;
    updateCheckRunning = true;
    try {
      await checkServerVersion(feedUrl);
    } catch (error) {
      console.error("[atualizacao]", error);
    } finally {
      updateCheckRunning = false;
    }
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
  window.webContents.on("did-fail-load", (_event, _code, _description, validatedURL, isMainFrame) => {
    if (!isMainFrame || !validatedURL) return;
    const devPage = validatedURL.startsWith("http://localhost:5173") || validatedURL.startsWith("http://127.0.0.1:5173");
    if (!devPage) return;
    setTimeout(() => {
      if (!window.isDestroyed()) window.loadURL(validatedURL);
    }, 1200);
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

function frontendDistDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "frontend");
  return path.join(FRONTEND_DIR, "dist");
}

async function resolveAppUrl() {
  if (isProdMode()) {
    const distDir = frontendDistDir();
    if (!fs.existsSync(path.join(distDir, "index.html"))) {
      throw new Error("A tela do caixa não foi encontrada dentro do programa.");
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
    try {
      localDb.open(app);
    } catch (error) {
      console.error("[banco-local]", error);
    }
    ipcMain.handle("pdv-local", (_event, payload) => localDb.handle(payload));
    return boot();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    if (updateTimer) clearInterval(updateTimer);
    launchStagedInstaller();
  });
  app.on("before-quit", stopOwnedChildren);
}
