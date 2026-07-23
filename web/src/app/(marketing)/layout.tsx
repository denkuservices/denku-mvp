import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
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
    <div className="brand-surface marketing flex min-h-screen flex-col bg-[#F7F5F1] text-[#0A1A2F]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(marketingJsonLd) }}
      />
      <Navbar />
      <main className="w-full flex-1">{children}</main>
      <Footer />
    </div>
  );
}
