import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ICH Guru — Regulatory Intelligence for ICH Q-Series",
  description:
    "AI-powered regulatory intelligence assistant for ICH Q-series pharmaceutical guidelines.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#f9f9f7" }}>
        {children}
      </body>
    </html>
  );
}
