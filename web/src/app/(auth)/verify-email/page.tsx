import { VerifyEmailPageClient } from "./_components/VerifyEmailPageClient";
import { AuthShell } from "@/components/auth/AuthShell";

interface VerifyEmailPageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  // NON-BLOCKING: /verify-email must be accessible without authentication
  // User only has email + OTP code; no session required to access this page
  // OTP verification is our confirmation mechanism; we do NOT require link-based email_confirmed_at
  
  // Note: We intentionally do NOT check for user session or email_confirmed_at here
  // because:
  // 1. OTP verification establishes the session (via verifyOtp)
  // 2. Users may need to re-verify if session expired
  // 3. This page must work even when no session exists
  
  // If user is already authenticated and has completed onboarding, they would be
  // redirected by middleware when accessing /dashboard, not by this page

  // Resolve searchParams (Next.js 16+)
  const resolvedSearchParams = await searchParams;
  const emailParam = resolvedSearchParams.email || "";

  return (
    <AuthShell
      title="Verify your email"
      subtitle={
        emailParam
          ? "Enter the 8-digit code we sent to your email to continue."
          : "Enter your email address to receive a verification code."
      }
      showBackLink
    >
      <VerifyEmailPageClient initialEmail={emailParam} />
    </AuthShell>
  );
}
