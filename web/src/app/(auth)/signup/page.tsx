import Link from "next/link";
import { SignupForm } from "./_components/SignupForm";
import { AuthShell } from "@/components/auth/AuthShell";

export default function SignupPage() {
  return (
    <AuthShell
      title="Create account"
      subtitle="We'll email you an 8-digit code to get started."
      showBackLink
      footer={
        <p className="text-sm text-[#6B7888]">
          Already have an account?{" "}
          <Link className="font-medium text-[#1B6E6E] underline-offset-2 hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
