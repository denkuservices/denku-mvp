/** Single source of truth for user-facing brand name */
export const SITE_NAME = "Denku AI";
export const COMPANY_NAME = "Denku AI";

export const siteConfig = {
  name: SITE_NAME,
  url: "https://denku.ai",
  ogImage: "https://denku.ai/og.jpg",
  description:
    "Denku AI is a platform for building, deploying, and managing AI agents.",
  links: {
    twitter: "https://twitter.com/denku-ai",
    github: "https://github.com/denku-ai/denku-ai",
  },
};

export type SiteConfig = typeof siteConfig;
