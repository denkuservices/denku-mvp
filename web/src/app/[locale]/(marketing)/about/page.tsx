import { permanentRedirect } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * `/about` → `/company`.
 *
 * There were two about-us pages. `/company` was written for the V3 site and is current: it
 * states what we sell, who it is for, how you buy, who answers support, and the four rules we
 * engineer to — each one checkable against the product. `/about` was the pre-V3 one, and the
 * rebuild never repointed the footer at its replacement, so the stale page stayed the linked
 * one and the good page went unlinked. It described Denku as an architecture "designed for
 * multi-tenant SaaS products" and sold tenant isolation, scoped tooling and observability to
 * a plumber deciding whether to let software answer their phone.
 *
 * Rewriting it would have produced a third variant of the same page competing with `/company`
 * for the same search results. A permanent redirect is the honest version of the rewrite: the
 * link keeps working, anything already indexed at `/about` is told where the page went, and
 * there is one about-us page to keep true instead of two.
 *
 * Locale-aware, so `/tr/about` lands on `/tr/company` rather than dropping a Turkish reader
 * onto the English page.
 */
export default async function AboutRedirectPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  permanentRedirect({ href: '/company', locale: locale as Locale });
}
