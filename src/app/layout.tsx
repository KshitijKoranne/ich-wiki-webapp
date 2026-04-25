import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ICH Wiki — Q-Series Knowledge Base",
  description:
    "Structured knowledge base of ICH Q-series guidelines with AI-powered query interface.",
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
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#060606" }}>
        {children}
      </body>
    </html>
  );
}
