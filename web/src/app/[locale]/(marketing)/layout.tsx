import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { MarketingSurface } from "@/components/marketing/MarketingSurface";
import { DenkuChatWidget } from "@/components/marketing/DenkuChatWidget";
import { siteConfig } from "@/config/site";

// NOTE: metadata is inherited from the root layout (title template + OG/Twitter/
// canonical base). Marketing pages set their own title/description/canonical via
// per-page `metadata` exports (R-067) — no redundant override here.

const marketingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
      logo: siteConfig.ogImage,
      sameAs: [siteConfig.links.twitter, siteConfig.links.github],
    },
    {
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
    },
  ],
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketingSurface>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingJsonLd) }}
      />
      <Navbar />
      <main className="w-full flex-1">{children}</main>
      <Footer />
      {/* The product, on the product's own site — see DenkuChatWidget for why it is the real
          snippet rather than a marketing chatbot. Marketing pages only: the dashboard has its
          own Inbox and would be answering itself. */}
      <DenkuChatWidget />
    </MarketingSurface>
  );
}
