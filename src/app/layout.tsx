
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProctorTrace | Examination Monitoring System",
  description:
    "A hybrid SQL and NoSQL system for online examination monitoring and behavioral anomaly analysis.",
};

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
