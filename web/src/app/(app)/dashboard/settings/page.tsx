function maskKey(value: string) {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

export default function Page() {
  // Mock config (replace with org/workspace settings from Supabase later)
  const org = {
    name: "Denku Workspace",
    environment: "Production",
    region: "us-east-1",
  };

  const integration = {
    vapi: {
      status: "connected" as "connected" | "disconnected",
      agentSync: "enabled" as "enabled" | "disabled",
      lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toLocaleString(),
    },
  };

  const endpoints = {
    webhookUrl: "https://YOUR_DOMAIN/api/webhooks/vapi",
    events: ["end-of-call-report", "call-started", "call-ended"],
  };

  const apiKeys = {
    publicKey: "pk_live_1234567890abcdef",
    secretKey: "sk_live_abcdef1234567890",
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Workspace configuration, integrations, and API access.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Workspace */}
        <div className="rounded-xl border bg-white lg:col-span-2">
          <div className="border-b p-4">
            <p className="text-sm font-medium">Workspace</p>
            <p className="text-xs text-muted-foreground">Basic workspace configuration</p>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Workspace name</p>
                <input
                  readOnly
                  value={org.name}
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
                <p className="text-xs text-muted-foreground">Editable in a later milestone.</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Environment</p>
                <input
                  readOnly
                  value={org.environment}
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Region</p>
                <input
                  readOnly
                  value={org.region}
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Access</p>
                <input
                  readOnly
                  value="Admin"
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white opacity-60"
                title="Coming soon"
              >
                Save changes
              </button>
              <p className="text-xs text-muted-foreground">
                Settings edits will be enabled after backend wiring is complete.
              </p>
            </div>
          </div>
        </div>

        {/* Integration */}
        <div className="rounded-xl border bg-white">
          <div className="border-b p-4">
            <p className="text-sm font-medium">Integrations</p>
            <p className="text-xs text-muted-foreground">External providers</p>
          </div>

          <div className="p-4 space-y-4">
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Vapi</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    integration.vapi.status === "connected"
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-50 text-zinc-600 border border-zinc-200"
                  }`}
                >
                  {integration.vapi.status === "connected" ? "Connected" : "Disconnected"}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                Agent sync: <span className="font-medium text-zinc-900">{integration.vapi.agentSync}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Last sync: <span className="font-medium text-zinc-900">{integration.vapi.lastSyncAt}</span>
              </p>

              <button
                type="button"
                disabled
                className="mt-2 w-full rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 opacity-60"
                title="Coming soon"
              >
                Manage integration
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              Note: Integration status is mocked for UI. Next step: compute from stored provider credentials + last sync job.
            </div>
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Webhooks</p>
          <p className="text-xs text-muted-foreground">Inbound events for call reporting</p>
        </div>

        <div className="p-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Webhook URL</p>
            <input
              readOnly
              value={endpoints.webhookUrl}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <p className="text-xs text-muted-foreground">
              Tip: click the field and copy. A “Copy” button can be added once we decide client/server boundaries.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Subscribed events</p>
            <div className="rounded-md border bg-white p-3 text-sm">
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                {endpoints.events.map((e) => (
                  <li key={e} className="font-mono text-xs">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">API keys</p>
          <p className="text-xs text-muted-foreground">Used for server-to-server access</p>
        </div>

        <div className="p-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Public key</p>
            <input
              readOnly
              value={maskKey(apiKeys.publicKey)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <p className="text-xs text-muted-foreground">Public identifier (safe to share in limited contexts).</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Secret key</p>
            <input
              readOnly
              value={maskKey(apiKeys.secretKey)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <p className="text-xs text-muted-foreground">Never expose in client-side code.</p>
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="button"
              disabled
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 opacity-60"
              title="Coming soon"
            >
              Rotate keys
            </button>
            <p className="text-xs text-muted-foreground">
              Key rotation will be implemented with an audited server action.
            </p>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Danger zone</p>
          <p className="text-xs text-muted-foreground">Irreversible actions</p>
        </div>

        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Disable workspace</p>
            <p className="text-xs text-muted-foreground">
              Temporarily disable all agents and stop processing webhooks.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 opacity-60"
            title="Coming soon"
          >
            Disable
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Note: This page is currently using mock data. Next step: persist settings in Supabase (org/workspace scope) and
        surface real integration status from sync jobs.
      </p>
    </div>
  );
}
