import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Gera só o site público, em dist-site. O caixa continua no build normal.
export default defineConfig({
  build: {
    outDir: "dist-site",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        site: fileURLToPath(new URL("./site.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react()],
});
