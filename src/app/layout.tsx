import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "User management",
  description: "Role-based user management and client directory",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
