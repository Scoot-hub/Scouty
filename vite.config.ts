import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
      },
      "/uploads": "http://localhost:3001",
    },
    hmr: {
      overlay: false,
    },
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.cal.eu https://*.cal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: http://localhost:3001 https://*.cal.eu https://*.cal.com; frame-src 'self' https://*.cal.eu https://*.cal.com https://www.youtube.com https://youtube.com;",
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
