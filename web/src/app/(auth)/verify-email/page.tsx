import Link from "next/link";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const sp = await searchParams;
  const email = sp.email ?? "";

  return (
    <div className="rounded-2xl border p-6 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We sent a verification link to{" "}
        <span className="font-medium">{email || "your email address"}</span>.
        Open your inbox and click the link, then come back to sign in.
      </p>

      <div className="mt-6 flex gap-3">
        <Link className="rounded-md bg-black text-white px-4 py-2 text-sm" href="/login">
          Go to login
        </Link>
        <Link className="rounded-md border px-4 py-2 text-sm" href="/signup">
          Use a different email
        </Link>
      </div>
    </div>
  );
}
