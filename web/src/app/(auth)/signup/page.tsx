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
        <p className="text-sm text-slate-600">
          Already have an account?{" "}
          <Link className="underline hover:text-slate-900 transition-colors" href="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
