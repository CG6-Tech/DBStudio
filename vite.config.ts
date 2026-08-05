import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { scanDevelopmentWorkspace } from "./dev/workspaceFixture";

const host = process.env.TAURI_DEV_HOST;
// Optional local folder of .sql files loaded by the dev-only "development workspace"
// shortcut. Point DBSTUDIO_DEV_WORKSPACE at a directory to enable it; when unset the
// middleware reports that it is not configured rather than reading a hardcoded path.
const developmentWorkspaceRoot = process.env.DBSTUDIO_DEV_WORKSPACE?.trim();

function developmentWorkspacePlugin(): Plugin {
  return { name: "dbstudio-development-workspace", apply: "serve", configureServer(server) {
    server.middlewares.use("/__viewdb/development-workspace", async (_request, response) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store");
      if (!developmentWorkspaceRoot) {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: "Set DBSTUDIO_DEV_WORKSPACE to a folder of .sql files to use the development workspace shortcut." }));
        return;
      }
      try { response.statusCode = 200; response.end(JSON.stringify(await scanDevelopmentWorkspace(developmentWorkspaceRoot))); }
      catch (error) { response.statusCode = 404; response.end(JSON.stringify({ error: error instanceof Error ? error.message : "The development workspace fixture could not be loaded." })); }
    });
  } };
}

export default defineConfig({
  plugins: [react(), developmentWorkspacePlugin()],
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0-dev") },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    // Tauri uses the installed system webview. PixiJS 8 ships modern class
    // syntax that Vite 8 intentionally leaves intact for current webviews.
    target: "esnext",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
