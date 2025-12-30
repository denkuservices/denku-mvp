import Link from "next/link";
import { signupAction } from "./signupAction";

export default function SignupPage() {
  return (
    <div className="rounded-2xl border p-6 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your workspace and start configuring agents.
      </p>

      <form action={signupAction} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium">Workspace name</label>
          <input
            name="org_name"
            required
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Kevin LLC"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Full name</label>
          <input
            name="full_name"
            required
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Ali Dinç"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Minimum 8 characters"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-black text-white py-2 font-medium"
        >
          Create account
        </button>
      </form>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="underline" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
