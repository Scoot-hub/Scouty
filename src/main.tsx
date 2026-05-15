import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import "flag-icons/css/flag-icons.min.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Skip the Google provider entirely when no client_id is configured —
// mounting it with an empty string throws "Missing required parameter client_id"
// on every page load. Auth.tsx already gates the Google button on the same env.
createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    {GOOGLE_CLIENT_ID ? (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <App />
    )}
  </HelmetProvider>
);

