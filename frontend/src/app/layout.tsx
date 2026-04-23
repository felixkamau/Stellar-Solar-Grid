import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stellar SolarGrid",
  description: "Pay-as-you-go solar energy on the Stellar blockchain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
