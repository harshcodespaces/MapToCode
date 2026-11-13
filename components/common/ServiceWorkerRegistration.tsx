"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // The app remains fully usable if service-worker registration fails.
    });
  }, []);

  return null;
}
