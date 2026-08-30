import Link from "next/link";
import { SignupForm } from "./_components/SignupForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

export default function SignupPage() {
  return (
    <AuthShell
      title="Create account"
      subtitle="We'll email you an 8-digit code to get started."
      showBackLink
      secondary={<SocialAuthButtons surface="dark" />}
      footer={
        <p className="text-sm text-[var(--s-ink-faint)]">
          Already have an account?{" "}
          <Link className="font-medium text-[var(--s-accent)] underline-offset-2 hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
