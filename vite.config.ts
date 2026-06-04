import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function buildErrorReporter(): Plugin {
  const API = "http://localhost:3001/api/errors/report";
  const seen = new Set<string>();

  async function report(name: string, message: string, stack?: string, file?: string) {
    const key = `${name}::${message.slice(0, 200)}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Clear dedup cache after 30 s so re-introduced errors are re-reported
    setTimeout(() => seen.delete(key), 30_000);
    try {
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error_name: name, error_message: message, error_stack: stack, page_url: file || "", source: "build" }),
      });
    } catch {} // never throw from error reporter
  }

  return {
    name: "build-error-reporter",
    configureServer(server) {
      // Intercept WS messages sent to the browser — Vite sends { type: 'error', err: {...} } on transform failures
      const originalSend = server.ws.send.bind(server.ws) as (data: unknown) => void;
      (server.ws as { send: (data: unknown) => void }).send = (data: unknown) => {
        if (data && typeof data === "object" && (data as { type?: string }).type === "error") {
          const payload = data as { type: string; err?: { message?: string; stack?: string; id?: string; plugin?: string } };
          const err = payload.err;
          if (err?.message) {
            const name = err.plugin ? `BuildError [${err.plugin}]` : "BuildError";
            report(name, err.message, err.stack, err.id).catch(() => {});
          }
        }
        originalSend(data);
      };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        timeout: 600_000,       // 10 min — for long imports (31k rows)
        proxyTimeout: 600_000,
        configure(proxy) {
          proxy.on("error", (err, _req, res) => {
            // ECONNRESET / ECONNREFUSED = server restarting via nodemon — not a real error
            if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") {
              if (res && !res.headersSent && typeof (res as { writeHead?: unknown }).writeHead === "function") {
                (res as import("http").ServerResponse).writeHead(503, { "Content-Type": "application/json" });
                (res as import("http").ServerResponse).end(JSON.stringify({ error: "Serveur en cours de redémarrage, réessayez dans un instant." }));
              }
              return; // suppress console noise
            }
            console.error("[vite/proxy] unexpected error:", err.message);
          });
        },
      },
      "/uploads": {
        target: "http://localhost:3001",
        configure(proxy) {
          proxy.on("error", (_err, _req, _res) => { /* ignore upload proxy noise on restart */ });
        },
      },
    },
    hmr: {
      overlay: false,
    },
    headers: {
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.cal.eu https://*.cal.com https://accounts.google.com https://apis.google.com",
        "script-src-elem 'self' 'unsafe-inline' https://*.cal.eu https://*.cal.com https://accounts.google.com https://apis.google.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https: https://*.googleusercontent.com",
        "connect-src 'self' ws: wss: http://localhost:3001 https://*.cal.eu https://*.cal.com https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://openidconnect.googleapis.com",
        "frame-src 'self' https://*.cal.eu https://*.cal.com https://www.youtube.com https://youtube.com https://accounts.google.com",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), mode === "development" && buildErrorReporter()].filter(Boolean),
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // ── Heavy lazy-only libs: already code-split by React.lazy, keep isolated ──
          // xlsx, recharts/d3, @dnd-kit, leaflet → stay in their lazy chunk
          if (id.includes("xlsx")) return "xlsx";
          if (id.includes("leaflet") || id.includes("react-leaflet")) return "leaflet";

          // ── Tiptap / ProseMirror (rich text editor, lazy-loaded via EditorialEditor) ──
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "tiptap";

          // ── UI framework ──
          if (id.includes("@radix-ui")) return "ui";

          // ── Data fetching ──
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@tanstack")) return "tanstack";

          // ── Icons (tree-shaken but still worth isolating) ──
          if (id.includes("lucide-react")) return "icons";

          // ── Utilities ──
          if (id.includes("date-fns") || id.includes("i18next") || id.includes("react-i18next")) return "utils";
          if (id.includes("zod") || id.includes("react-hook-form")) return "forms";

          // ── Core React runtime ──
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("scheduler")) return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
