import { useEffect } from "react";

declare global {
  interface Window {
    va?: (...args: unknown[]) => void;
    vaq?: unknown[][];
  }
}

export default function VercelAnalytics() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (!window.va) {
      window.va = (...args: unknown[]) => {
        window.vaq = window.vaq || [];
        window.vaq.push(args);
      };
    }

    const scriptSrc = "/_vercel/insights/script.js";
    if (document.head.querySelector(`script[src="${scriptSrc}"]`)) {
      return;
    }

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.defer = true;
    script.dataset.sdkn = "@vercel/analytics/react";
    script.dataset.sdkv = "custom";
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return null;
}
