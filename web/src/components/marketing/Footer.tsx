import Link from "next/link";

import { siteConfig } from "@/config/site";
import { Container } from "@/components/marketing/Container";

export function Footer() {
  return (
    <footer className="border-t">
      <Container>
        <div className="flex flex-col items-center justify-between gap-4 py-10 md:h-24 md:flex-row md:py-0">
          <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
            <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
              © {new Date().getFullYear()} {siteConfig.name}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Terms
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Contact
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
