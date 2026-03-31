import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import "flag-icons/css/flag-icons.min.css";

createRoot(document.getElementById("root")!).render(<App />);
