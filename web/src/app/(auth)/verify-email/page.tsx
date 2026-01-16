import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VerifyEmailPageClient } from "./_components/VerifyEmailPageClient";
import { AuthShell } from "@/components/auth/AuthShell";

interface VerifyEmailPageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  // Check if user is already confirmed (if session exists)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const emailConfirmed = (user as any).email_confirmed_at || (user as any).confirmed_at;
    if (emailConfirmed) {
      redirect("/dashboard");
    }
  }

  // Resolve searchParams (Next.js 16+)
  const resolvedSearchParams = await searchParams;
  const emailParam = resolvedSearchParams.email || "";

  return (
    <AuthShell
      title="Verify your email"
      subtitle={
        emailParam
          ? "Enter the code we sent to your email to continue."
          : "Enter your email address to receive a confirmation link."
      }
      showBackLink
    >
      <VerifyEmailPageClient initialEmail={emailParam} />
    </AuthShell>
  );
}
