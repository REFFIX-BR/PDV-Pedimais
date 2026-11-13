import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const chunkGroups: Record<string, string> = {
  react: "vendor-react",
  "react-dom": "vendor-react",
  scheduler: "vendor-react",
  "react-router": "vendor-router",
  "react-router-dom": "vendor-router",
  "date-fns": "vendor-date",
  "@date-fns/tz": "vendor-date",
  "react-day-picker": "vendor-ui",
  "lucide-react": "vendor-ui",
  recharts: "vendor-charts",
  "d3-array": "vendor-charts",
  "d3-color": "vendor-charts",
  "d3-format": "vendor-charts",
  "d3-interpolate": "vendor-charts",
  "d3-path": "vendor-charts",
  "d3-scale": "vendor-charts",
  "d3-shape": "vendor-charts",
  eventemitter3: "vendor-charts",
};

function getPackageName(id: string) {
  const [, pathAfterNodeModules] = id.split("node_modules/");
  if (!pathAfterNodeModules) return null;

  const parts = pathAfterNodeModules.split("/");
  if (parts[0].startsWith("@") && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    target: "esnext",
    sourcemap: false,
    outDir: "dist",
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        site: fileURLToPath(new URL("./site.html", import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          const pkgName = getPackageName(id);
          if (!pkgName) return "vendor";

          return chunkGroups[pkgName] ?? "vendor";
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "pdv-site-route",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const path = req.url?.split("?")[0];
          if (path === "/site" || path === "/site/" || path === "/site/precos" || path === "/site/precos/") {
            req.url = "/site.html";
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          const path = req.url?.split("?")[0];
          if (path === "/site" || path === "/site/" || path === "/site/precos" || path === "/site/precos/") {
            req.url = "/site.html";
          }
          next();
        });
      },
    },
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5260",
        changeOrigin: true,
      },
    },
  },
});
