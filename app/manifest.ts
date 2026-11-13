import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MapToCode",
    short_name: "MapToCode",
    description: "Visual programming IDE for turning algorithms into flowcharts and code.",
    start_url: "/workspace",
    display: "standalone",
    background_color: "#1e1e1e",
    theme_color: "#1e1e1e",
    orientation: "any",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
