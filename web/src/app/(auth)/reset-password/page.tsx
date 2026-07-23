"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { updatePasswordAction } from "./updatePasswordAction";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await updatePasswordAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        // Recovery session is now a full session — go straight into the app.
        router.push("/dashboard");
      }
    });
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Enter a new password for your account."
      footer={
        <p className="text-sm text-[#6B7888]">
          Need a new link?{" "}
          <Link className="font-medium text-[#1B6E6E] underline-offset-2 hover:underline" href="/forgot-password">
            Request another
          </Link>
        </p>
      }
    >
      <form action={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#0A1A2F]">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-[10px] border border-[#0A1A2F]/10 bg-white px-4 py-3 text-[#0A1A2F] placeholder:text-[#6B7888]/70 transition-colors focus:border-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/15"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-[#0A1A2F]">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-[10px] border border-[#0A1A2F]/10 bg-white px-4 py-3 text-[#0A1A2F] placeholder:text-[#6B7888]/70 transition-colors focus:border-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/15"
            placeholder="Re-enter your new password"
          />
        </div>

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[10px] bg-[#0A1A2F] py-3.5 font-medium text-[#F7F5F1] transition-all hover:bg-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
