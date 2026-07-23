import type { Metadata } from "next";

// Pricing page is a client component, so its metadata lives in this route layout (R-067).
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for Denku's AI voice employee — included minutes, phone numbers, and concurrency per plan, with pay-as-you-go overage.",
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
