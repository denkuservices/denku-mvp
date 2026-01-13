import { SignupForm } from "./_components/SignupForm";

export default function SignupPage() {
  return (
    <div className="rounded-2xl border border-slate-200 p-6 md:p-7 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <p className="mt-1 text-sm text-slate-600">
        Create your workspace and start managing call capacity.
      </p>

      <SignupForm />
    </div>
  );
}
