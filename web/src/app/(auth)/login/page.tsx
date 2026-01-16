import Link from "next/link";
import { loginAction } from "./loginAction";
import { AuthShell } from "@/components/auth/AuthShell";

export default function LoginPage() {
  return (
    <AuthShell
      title="Sign In"
      subtitle="Enter your email and password to sign in!"
      showBackLink
      footer={
        <p className="text-sm text-slate-600">
          Not registered yet?{" "}
          <Link className="underline hover:text-slate-900 transition-colors" href="/signup">
            Create an account
          </Link>
        </p>
      }
    >
      <form action={loginAction} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-900 mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-slate-300 transition-colors"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-900 mb-1.5">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-slate-300 transition-colors"
            placeholder="Your password"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="remember"
              name="remember"
              type="checkbox"
              value="1"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600/20"
            />
            <label htmlFor="remember" className="ml-2 text-sm text-slate-600">
              Keep me logged in
            </label>
          </div>
          <Link
            href="/login?forgot=1"
            className="text-sm text-slate-600 hover:text-slate-900 underline transition-colors"
          >
            Forgot Password?
          </Link>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-indigo-600 text-white py-3.5 font-medium hover:bg-indigo-700 active:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:ring-offset-2 transition-colors"
        >
          Sign in
        </button>
      </form>
    </AuthShell>
  );
}
