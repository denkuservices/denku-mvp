import Link from "next/link";
import { loginAction } from "./loginAction";

export default function LoginPage() {
  return (
    <div className="rounded-2xl border border-slate-200 p-6 md:p-7 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Access your workspace and manage call capacity.
      </p>

      <form action={loginAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-900">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-900">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
            placeholder="Your password"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-black text-white py-2.5 font-medium hover:bg-slate-900 active:bg-black focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:ring-offset-2 transition-colors"
        >
          Sign in
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-200">
        <p className="text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link className="underline hover:text-slate-900" href="/signup">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
