import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { VerifyEmailPageClient } from "./_components/VerifyEmailPageClient";

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
    <div className="rounded-2xl border p-6 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {emailParam
          ? "Check your inbox and click the confirmation link to continue."
          : "Enter your email address to receive a confirmation link."}
      </p>

      <div className="mt-6">
        <VerifyEmailPageClient initialEmail={emailParam} />
      </div>
    </div>
  );
}
