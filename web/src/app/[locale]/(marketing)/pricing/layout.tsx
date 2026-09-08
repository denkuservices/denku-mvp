import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/alternates";

// Pricing page is a client component, so its metadata lives in this route layout (R-067).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricingPage" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates(locale, "/pricing"),
  };
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
