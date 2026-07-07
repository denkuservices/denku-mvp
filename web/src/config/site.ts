/** Single source of truth for user-facing brand name */
export const SITE_NAME = "Denku";
export const COMPANY_NAME = "Denku";

export const siteConfig = {
  name: SITE_NAME,
  url: "https://denku.ai",
  ogImage: "https://denku.ai/og.jpg",
  description:
    "Denku builds AI voice employees that answer every call, qualify every lead, and book every appointment — 24/7.",
  links: {
    twitter: "https://twitter.com/denku-ai",
    github: "https://github.com/denku-ai/denku-ai",
  },
};

export type SiteConfig = typeof siteConfig;
