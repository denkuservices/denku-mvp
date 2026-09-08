import './globals.css';
import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  robots: { index: true, follow: true },
  /*
   * No `alternates` here, deliberately.
   *
   * This layout wraps every locale, so a canonical declared at this level is inherited by all
   * of them — which is how `/tr/pricing` came to announce `https://www.denku.io` as its
   * canonical URL, telling Google the Turkish page is the English home page and should not be
   * indexed on its own. Each localised page declares its own through `localeAlternates()`
   * (src/i18n/alternates.ts); a page that declares none is better off with no canonical than
   * with somebody else's.
   */
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    images: [{ url: siteConfig.ogImage }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
