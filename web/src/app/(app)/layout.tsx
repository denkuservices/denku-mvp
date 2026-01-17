import { DM_Sans } from "next/font/google";
import HorizonShell from "@/components/horizon-shell/HorizonShell";
import HorizonStylesheet from "@/components/horizon-shell/HorizonStylesheet";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: Do NOT enforce email verification here.
  // - Onboarding uses OTP verification (not email_confirmed_at)
  // - Auth gating is handled server-side in page.tsx components and middleware
  // - Client-side auth checks cannot read httpOnly cookies and should be avoided

  return (
    <>
      <HorizonStylesheet />
      <div className={`${dmSans.className} w-full`}>
        <HorizonShell>{children}</HorizonShell>
      </div>
    </>
  );
}
