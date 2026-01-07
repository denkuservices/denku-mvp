"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { VerifyEmailForm } from "./_components/VerifyEmailForm";
import { SetPasswordForm } from "./_components/SetPasswordForm";

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const [email, setEmail] = useState<string>("");
  const [orgName, setOrgName] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [step, setStep] = useState<"verify" | "password">("verify");
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    async function loadParams() {
      const sp = await searchParams;
      const emailParam = sp.email ?? "";
      
      // Always set email if provided in URL
      if (emailParam) {
        setEmail(emailParam);
      }

      // Load signup data from sessionStorage
      if (typeof window !== "undefined" && emailParam) {
        const lowerEmail = emailParam.toLowerCase();
        const stored = sessionStorage.getItem(`signup_${lowerEmail}`);
        if (stored) {
          try {
            const data = JSON.parse(stored);
            setOrgName(data.org_name || "");
            setFullName(data.full_name || "");
          } catch {
            // Ignore parse errors
          }
        }
      } else if (typeof window !== "undefined" && !emailParam) {
        // If no email in URL, try to get from sessionStorage (fallback)
        // Check all signup_ keys to find the most recent one
        let foundEmail = "";
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("signup_") && !key.includes(":phone:")) {
            const extractedEmail = key.replace("signup_", "");
            if (extractedEmail) {
              foundEmail = extractedEmail;
              break;
            }
          }
        }
        if (foundEmail) {
          setEmail(foundEmail);
        }
      }
    }
    loadParams();
  }, [searchParams]);

  const handleVerified = (needsPasswordValue: boolean) => {
    setNeedsPassword(needsPasswordValue);
    setStep("password");
  };

  if (!email) {
    return (
      <div className="rounded-2xl border p-6 shadow-sm bg-white">
        <h1 className="text-2xl font-semibold">Verify your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please provide your email address to receive a verification code.
        </p>
        <div className="mt-6">
          <Link className="rounded-md bg-black text-white px-4 py-2 text-sm inline-block" href="/signup">
            Go to signup
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-6 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">
        {step === "verify" ? "Verify your email" : "Set your password"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {step === "verify" ? (
          <>
            We sent a verification code to{" "}
            <span className="font-medium">{email}</span>. Enter the code below.
          </>
        ) : (
          <>
            Your email has been verified. Please create a password for your account.
          </>
        )}
      </p>

      <div className="mt-6">
        {step === "verify" ? (
          <VerifyEmailForm email={email} onVerified={handleVerified} />
        ) : (
          <SetPasswordForm email={email} orgName={orgName} fullName={fullName} />
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Link className="rounded-md border px-4 py-2 text-sm" href="/login">
          Go to login
        </Link>
        <Link className="rounded-md border px-4 py-2 text-sm" href="/signup">
          Use a different email
        </Link>
      </div>
    </div>
  );
}
