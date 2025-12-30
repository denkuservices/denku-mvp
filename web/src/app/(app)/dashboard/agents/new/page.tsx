import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAgentAction } from "./actions";

export default async function NewAgentPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Create an agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the default behavior. You can refine tools and channels later.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Back
        </Link>
      </div>

      <div className="rounded-2xl border p-6 bg-white">
        <form action={createAgentAction} className="space-y-5">
          <div>
            <label className="text-sm font-medium">Agent name</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="e.g., Notus Support"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Shown internally and in your dashboard.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Language</label>
              <select
                name="language"
                className="mt-1 w-full rounded-md border px-3 py-2"
                defaultValue="en"
              >
                <option value="en">English</option>
                <option value="tr">Turkish</option>
                <option value="es">Spanish</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Primary agent language.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Voice</label>
              <select
                name="voice"
                className="mt-1 w-full rounded-md border px-3 py-2"
                defaultValue="alloy"
              >
                <option value="alloy">Alloy</option>
                <option value="verse">Verse</option>
                <option value="aria">Aria</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Default voice preset (MVP).
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Timezone</label>
            <select
              name="timezone"
              className="mt-1 w-full rounded-md border px-3 py-2"
              defaultValue="America/New_York"
            >
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/Istanbul">Europe/Istanbul</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Used for business hours and scheduling tools.
            </p>
          </div>

          <button className="w-full rounded-md bg-black text-white py-2 font-medium">
            Create agent
          </button>
        </form>
      </div>
    </div>
  );
}