import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { siteConfig } from "@/config/site";

export const metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="brand-surface marketing flex min-h-screen flex-col bg-[#F7F5F1] text-[#0A1A2F]">
      <Navbar />
      <main className="w-full flex-1">{children}</main>
      <Footer />
    </div>
  );
}
