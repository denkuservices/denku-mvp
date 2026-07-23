import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

/**
 * robots.txt (R-067). Allows crawling of the public marketing site; disallows the
 * authenticated app, onboarding, admin, and API surfaces. Base URL comes from
 * `siteConfig.url` (single source — resolving the denku.io/denku.ai naming fixes this too).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/onboarding", "/admin", "/api/", "/auth/", "/verify-email", "/reset-password"],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
