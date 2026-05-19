import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampaignOS — marketing strategy workspace",
  description:
    "Turn a product idea into a complete marketing strategy: positioning, awareness, offer, ads, landing copy, store copy, and experiments.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
