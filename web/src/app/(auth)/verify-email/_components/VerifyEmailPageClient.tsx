"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { VerifyEmailForm } from "./VerifyEmailForm";
import { SetPasswordForm } from "./SetPasswordForm";
import { VerifyEmailInputForm } from "./VerifyEmailInputForm";

interface VerifyEmailPageClientProps {
  initialEmail: string;
}

export function VerifyEmailPageClient({ initialEmail }: VerifyEmailPageClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // TEMPORARY: Debug log to confirm we're not being redirected by client logic
  useEffect(() => {
    console.log("[VerifyEmailPageClient] Mounted:", {
      pathname,
      email: searchParams.get("email"),
      timestamp: new Date().toISOString(),
    });
  }, [pathname, searchParams]);

  const [email, setEmail] = useState<string>(initialEmail);
  const [step, setStep] = useState<"email" | "otp" | "password">(
    initialEmail ? "otp" : "email"
  );

  // If email not provided, show email input form
  if (!email) {
    return <VerifyEmailInputForm onEmailSet={(e) => { setEmail(e); setStep("otp"); }} />;
  }

  // After OTP verification, show password form
  if (step === "password") {
    return (
      <SetPasswordForm
        email={email}
        orgName="" // Will be collected in onboarding
        fullName="" // Will be collected in onboarding
      />
    );
  }

  // Default: show OTP form
  return (
    <VerifyEmailForm
      email={email}
      onVerified={(needsPassword) => {
        if (needsPassword) {
          setStep("password");
        }
      }}
    />
  );
}

