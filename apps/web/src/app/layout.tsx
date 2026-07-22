import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
import './globals.css';

export const metadata: Metadata = {
  title: '3D Sports Displays — Print Queue',
  description: 'Private print queue for the Bambu Lab P1S, built for 3D Sports Displays',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Print Queue',
  },
  // Favicon / apple-touch-icon come from the app/icon.png and
  // app/apple-icon.png file-convention icons (Next injects the <link> tags
  // automatically) — no explicit `icons` entry needed here.
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#171717',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
