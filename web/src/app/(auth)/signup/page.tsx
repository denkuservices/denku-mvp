import { SignupForm } from "./_components/SignupForm";

export default function SignupPage() {
  return (
    <div className="rounded-2xl border p-6 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your workspace and start configuring agents.
      </p>

      <SignupForm />
    </div>
  );
}
