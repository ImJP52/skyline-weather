import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const metadataBase = new URL(`${protocol}://${host}`);
  const title = "Cody Sky | Justin Cody’s Des Moines Weather";
  const description =
    "Justin Cody’s personal Des Moines weather dashboard with live conditions, forecasts, alerts, radar, and satellite imagery.";

  return {
    metadataBase,
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "Cody Sky",
      description: "Justin Cody’s Des Moines Weather",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Cody Sky — Justin Cody’s Des Moines Weather" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Cody Sky",
      description: "Justin Cody’s Des Moines Weather",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
