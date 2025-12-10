import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BolTest Test Case Tool',
  description:
    'BolTest Test Case Tool — It\'s so simple. Made by Gon Shaul lavan. RAW/Bulk-Edit editor for Azure DevOps and TFS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
