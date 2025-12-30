import Link from "next/link";
import { loginAction } from "./loginAction";

export default function LoginPage() {
  return (
    <div className="rounded-2xl border p-6 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Access your dashboard and manage your agents.
      </p>

      <form action={loginAction} className="mt-6 space-y-4">
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
            className="mt-1 w-full rounded-md border px-3 py-2"
            placeholder="Your password"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-black text-white py-2 font-medium"
        >
          Sign in
        </button>
      </form>

      <p className="mt-4 text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link className="underline" href="/signup">
          Create one
        </Link>
      </p>
    </div>
  );
}
