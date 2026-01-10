import { DM_Sans } from "next/font/google";
import { requireVerifiedEmail } from "@/lib/auth/requireVerifiedEmail";
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
  // Enforce email verification for all dashboard routes
  await requireVerifiedEmail();

  return (
    <>
      <HorizonStylesheet />
      <div className={`${dmSans.className} w-full`}>
        <HorizonShell>{children}</HorizonShell>
      </div>
    </>
  );
}
