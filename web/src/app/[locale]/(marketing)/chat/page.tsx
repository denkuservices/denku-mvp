import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ChannelPage } from "@/components/marketing/landing/ChannelPage";
import { localeAlternates } from "@/i18n/alternates";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "channelPages.chat" });
  return {
    alternates: localeAlternates(locale, '/chat'),
    title: t("eyebrow"),
    description: t("sub")
  };
}

export default async function ChatPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ChannelPage channel="chat" />;
}
