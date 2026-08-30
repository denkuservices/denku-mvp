import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { EMPLOYEES } from "@/lib/marketing/employees";
import { INDUSTRIES } from "@/lib/marketing/industries";
import { SERVICES } from "@/lib/marketing/content/services";
import { routing } from "@/i18n/routing";

/**
 * sitemap.xml (R-067) — the public marketing routes, in every language.
 *
 * Each path is emitted once per locale, and each entry carries `alternates.languages`
 * so search engines can see the four versions as translations of one page rather
 * than as duplicates. English has no prefix (`localePrefix: "as-needed"`), which is
 * why `href()` special-cases the default locale.
 *
 * Excludes the authenticated app and param-driven utility pages.
 */

type Entry = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
};

const entries: Entry[] = [
  { path: "", priority: 1.0, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.9, changeFrequency: "monthly" },
  { path: "/services", priority: 0.9, changeFrequency: "monthly" },
  { path: "/employees", priority: 0.9, changeFrequency: "monthly" },
  { path: "/industries", priority: 0.8, changeFrequency: "monthly" },
  { path: "/use-cases", priority: 0.8, changeFrequency: "monthly" },
  { path: "/request", priority: 0.7, changeFrequency: "monthly" },
  { path: "/security", priority: 0.7, changeFrequency: "monthly" },
  { path: "/docs", priority: 0.7, changeFrequency: "monthly" },
  { path: "/support", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.6, changeFrequency: "monthly" },
  { path: "/company", priority: 0.6, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  ...SERVICES.map((s) => ({
    path: `/services/${s.slug}`,
    priority: 0.8,
    changeFrequency: "monthly" as const,
  })),
  ...EMPLOYEES.map((e) => ({
    path: `/employees/${e.slug}`,
    priority: 0.8,
    changeFrequency: "monthly" as const,
  })),
  ...INDUSTRIES.map((i) => ({
    path: `/industries/${i.slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  })),
];

function href(locale: string, path: string): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${siteConfig.url}${prefix}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return entries.flatMap((e) => {
    const languages = Object.fromEntries(
      routing.locales.map((l) => [l, href(l, e.path)])
    );

    return routing.locales.map((locale) => ({
      url: href(locale, e.path),
      lastModified: now,
      changeFrequency: e.changeFrequency,
      // Slightly demote the translations so the English page stays canonical
      // for queries that could match either.
      priority: locale === routing.defaultLocale ? e.priority : e.priority * 0.9,
      alternates: { languages },
    }));
  });
}
