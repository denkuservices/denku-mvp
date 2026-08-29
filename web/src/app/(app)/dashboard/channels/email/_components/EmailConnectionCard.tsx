"use client";

import React, { useState, useTransition } from "react";
import { CheckCircle2, AlertTriangle, Mail, Copy, Check } from "lucide-react";
import { Surface, Pill } from "../../../_platform/ui";
import {
  connectEmailAction,
  disconnectEmailAction,
  assignEmailEmployeeAction,
  setEmailReplyModeAction,
  startDomainVerificationAction,
  checkDomainAction,
} from "../_actions";

export interface EmailConnectionSummary {
  id: string;
  inboundAddress: string;
  forwardFromAddress: string | null;
  forwardVerifiedAt: string | null;
  sendingDomain: string | null;
  sendingDomainStatus: "unverified" | "pending" | "verified" | "failed";
  replyMode: "draft" | "auto";
  status: "connected" | "revoked" | "error";
  lastError: string | null;
  lastInboundAt: string | null;
  assignedAgentId: string | null;
}

export interface EmployeeOption {
  id: string;
  name: string;
}

/**
 * The connect surface for a business's email channel.
 *
 * The setup is unusual for this product because the decisive step happens somewhere we cannot
 * see: the customer's own mail settings. So the card is built around telling the truth about a
 * state we can only infer.
 *
 * - **The issued address is shown large and copyable**, because pasting it correctly into
 *   another product is the single action the whole channel depends on.
 * - **"Receiving" is not claimed until mail has actually arrived.** A forwarding rule we cannot
 *   see is not evidence, and a card reading "Connected" over a mailbox that forwards nothing is
 *   exactly the class of lie the honesty rules exist to prevent.
 * - **Sending is described separately from receiving**, because they are separate mechanisms
 *   and a customer who has set up forwarding has not thereby authorised anything to be sent in
 *   their name.
 */
export function EmailConnectionCard({
  connection,
  employees,
  canManage,
}: {
  connection: EmailConnectionSummary | null;
  employees: EmployeeOption[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(!connection);
  /**
   * Controlled, so a rejected submit does not wipe what they typed.
   *
   * A server action resets an uncontrolled form on every response, including failures — which
   * meant an address had to be retyped after the very errors most likely to happen twice in a
   * row (misconfigured environment, address already claimed).
   */
  const [address, setAddress] = useState("");

  function onConnect(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await connectEmailAction(formData);
      if (!res.ok) setError(res.error ?? "Could not connect.");
      else {
        setShowForm(false);
        setAddress("");
      }
    });
  }

  function onDisconnect() {
    if (!connection) return;
    setError(null);
    startTransition(async () => {
      const res = await disconnectEmailAction(connection.id);
      if (!res.ok) setError(res.error ?? "Could not disconnect.");
      else setShowForm(true);
    });
  }

  function onReplyMode(mode: "draft" | "auto") {
    if (!connection) return;
    setError(null);
    startTransition(async () => {
      const res = await setEmailReplyModeAction(connection.id, mode);
      if (!res.ok) setError(res.error ?? "Could not save.");
    });
  }

  function onAssign(agentId: string) {
    if (!connection) return;
    setError(null);
    startTransition(async () => {
      const res = await assignEmailEmployeeAction(connection.id, agentId || null);
      if (!res.ok) setError(res.error ?? "Could not assign.");
    });
  }

  async function onCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked by permissions; the address is selectable on screen either way.
      setCopied(false);
    }
  }

  const receiving = connection?.status === "connected" && Boolean(connection.lastInboundAt);
  const canSend = connection?.sendingDomainStatus === "verified";

  return (
    <div className="flex flex-col gap-4">
      {connection ? (
        <Surface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-navy-700 dark:text-white">
                  {connection.forwardFromAddress ?? "Your address"}
                </p>
                {connection.status === "error" ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{connection.lastError ?? "There was a problem receiving mail."}</span>
                  </p>
                ) : receiving ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Receiving customer email
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Waiting for the first email. Finish the forwarding step below, then send a test
                    message to this address from any other account.
                  </p>
                )}
              </div>
            </div>
            <Pill tone={connection.status === "error" ? "critical" : receiving ? "ok" : "neutral"} dot>
              {connection.status === "error" ? "Problem" : receiving ? "Live" : "Waiting"}
            </Pill>
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/10">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              Forward your email to this address
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white">
                {connection.inboundAddress}
              </code>
              <button
                type="button"
                onClick={() => onCopy(connection.inboundAddress)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              Only mail forwarded here reaches Denku. Your inbox stays private — we never read
              anything you do not forward.
            </p>
          </div>

          {/* Receiving and sending are separate mechanisms, and saying so is the honest thing:
              forwarding never granted us the right to send anything in their name. */}
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/10">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Replying</p>
            {canSend ? (
              <>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Replies are sent from {connection.sendingDomain}
                </p>

                {/* Auto-send is opt-in, and the label says what changes rather than naming a
                    mode. "Draft" and "auto" mean nothing to a shop owner; "who presses send"
                    does. */}
                <label className="mt-3 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    defaultChecked={connection.replyMode === "auto"}
                    disabled={!canManage || pending}
                    onChange={(e) => onReplyMode(e.target.checked ? "auto" : "draft")}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-500 dark:border-white/20"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    Let the AI send replies on its own
                    <span className="mt-0.5 block text-gray-500">
                      Off by default: the AI writes each reply and waits in your Inbox for you to
                      send it. An email cannot be unsent, so turn this on once you trust what it
                      writes.
                    </span>
                  </span>
                </label>
              </>
            ) : (
              <SendingSetup connection={connection} canManage={canManage} />
            )}
          </div>

          {employees.length > 0 ? (
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/10">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Which AI Employee answers here
              </label>
              <select
                defaultValue={connection.assignedAgentId ?? ""}
                disabled={!canManage || pending}
                onChange={(e) => onAssign(e.target.value)}
                className="mt-1.5 w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white"
              >
                {connection.assignedAgentId ? null : (
                  <option value="">
                    {employees.length === 1
                      ? `Not assigned — ${employees[0].name} answers by default`
                      : "Not assigned — choose an employee"}
                  </option>
                )}
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {canManage ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDisconnect}
                disabled={pending}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
              >
                Disconnect
              </button>
            </div>
          ) : null}

          {canManage ? (
            <p className="mt-2 text-xs text-gray-500">
              Disconnecting stops Denku from reading this address. Remember to remove the
              forwarding rule in your own mail settings too — we cannot do that for you.
            </p>
          ) : null}
        </Surface>
      ) : null}

      {showForm && canManage ? (
        <Surface>
          <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Connect your business email</h2>
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Tell us the address your customers write to. We will give you an address to forward it
            to — it takes about two minutes in Gmail, Outlook, or your own mail host.
          </p>

          <form action={onConnect} className="mt-4 flex flex-col gap-3">
            <div>
              <label
                htmlFor="forward_from_address"
                className="block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                Your customer-facing address
              </label>
              <input
                id="forward_from_address"
                name="forward_from_address"
                type="email"
                autoComplete="off"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="info@yourbusiness.com"
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Use a shared address like info@ or support@ — not your personal inbox. Denku only
                sees what this address receives.
              </p>
            </div>

            {employees.length > 1 ? (
              <div>
                <label htmlFor="agent_id" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Employee to answer here
                </label>
                <select
                  id="agent_id"
                  name="agent_id"
                  className="mt-1.5 w-full max-w-sm rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white"
                >
                  <option value="">Choose an employee</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50 sm:w-auto"
            >
              {pending ? "Setting up…" : "Get my forwarding address"}
            </button>
          </form>
        </Surface>
      ) : null}

      {connection ? <ForwardingInstructions address={connection.inboundAddress} /> : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Getting permission to send as the business.
 *
 * The honest framing matters here. Denku cannot send from `theirshop.com` because Denku says so;
 * it can only send once their DNS carries our signing key. So this asks for the domain, hands
 * back records to paste, and then reports what the PROVIDER found — never an inference of our
 * own. Until it says verified, the transport refuses and the AI's replies wait in the Inbox.
 */
function SendingSetup({
  connection,
  canManage,
}: {
  connection: EmailConnectionSummary;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState(connection.sendingDomain ?? "");

  const started = Boolean(connection.sendingDomain);

  function onStart() {
    setError(null);
    startTransition(async () => {
      const res = await startDomainVerificationAction(connection.id, domain);
      if (!res.ok) setError(res.error ?? "Could not add that domain.");
    });
  }

  function onCheck() {
    setError(null);
    startTransition(async () => {
      const res = await checkDomainAction(connection.id);
      if (!res.ok) setError(res.error ?? "Could not check the domain.");
    });
  }

  return (
    <div className="mt-1">
      <p className="text-xs text-gray-500">
        Replies are not switched on yet. Your AI still writes each reply and leaves it in your
        Inbox — nothing is sent until your own domain is verified, so a customer never receives
        mail from an address that is not yours.
      </p>

      {!started ? (
        <div className="mt-3">
          <label htmlFor="sending_domain" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Domain you send from
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              id="sending_domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={!canManage || pending}
              placeholder="yourbusiness.com"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white"
            />
            <button
              type="button"
              onClick={onStart}
              disabled={!canManage || pending || domain.trim().length === 0}
              className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add domain"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            You will get a few DNS records to add. If someone else manages your website or domain,
            this is the step to forward to them.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">{connection.sendingDomain}</span>{" "}
              <DomainStatus status={connection.sendingDomainStatus} />
            </p>
            <button
              type="button"
              onClick={onCheck}
              disabled={!canManage || pending}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
            >
              {pending ? "Checking…" : "Check again"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Add the DNS records from your Resend dashboard to {connection.sendingDomain}, then
            check again. DNS changes can take a few minutes to a few hours to appear.
          </p>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

/** Says exactly what the provider last reported — never "probably verified by now". */
function DomainStatus({ status }: { status: EmailConnectionSummary["sendingDomainStatus"] }) {
  if (status === "verified") return <span className="text-green-600 dark:text-green-400">— verified</span>;
  if (status === "pending") return <span className="text-amber-600 dark:text-amber-400">— waiting for DNS</span>;
  if (status === "failed") return <span className="text-red-600 dark:text-red-400">— records not found</span>;
  return <span className="text-gray-500">— not verified yet</span>;
}

/**
 * Provider-specific setup steps.
 *
 * Written per provider rather than as one generic paragraph because the menus genuinely differ,
 * and because Gmail's confirmation step needs an explanation the others do not: Gmail emails a
 * code to the forwarding address, and since that address is ours we complete it automatically.
 * A customer who is not told that will sit waiting for a code that never reaches them.
 */
function ForwardingInstructions({ address }: { address: string }) {
  const [provider, setProvider] = useState<"gmail" | "outlook" | "other">("gmail");

  const tabs = [
    { id: "gmail" as const, label: "Gmail" },
    { id: "outlook" as const, label: "Outlook" },
    { id: "other" as const, label: "Other" },
  ];

  return (
    <Surface>
      <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Set up forwarding</h2>

      <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-white/5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setProvider(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              provider === tab.id
                ? "bg-white text-navy-700 shadow-sm dark:bg-navy-700 dark:text-white"
                : "text-gray-600 hover:text-navy-700 dark:text-gray-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ol className="mt-4 space-y-2 text-xs text-gray-600 dark:text-gray-400">
        {provider === "gmail" ? (
          <>
            <li>1. Open Gmail → Settings → See all settings → Forwarding and POP/IMAP.</li>
            <li>2. Click “Add a forwarding address” and paste <Address value={address} />.</li>
            <li>
              3. Gmail sends a confirmation code to that address. It arrives here, so we confirm it
              for you — just wait a moment and refresh.
            </li>
            <li>4. Back in Gmail, select “Forward a copy of incoming mail to” and save.</li>
          </>
        ) : provider === "outlook" ? (
          <>
            <li>1. Open Outlook → Settings → Mail → Forwarding.</li>
            <li>2. Tick “Enable forwarding” and paste <Address value={address} />.</li>
            <li>3. Choose whether to keep a copy in Outlook, then Save. There is no code to confirm.</li>
          </>
        ) : (
          <>
            <li>
              1. In your mail host or domain registrar, find “Forwarders”, “Aliases”, or “Email
              routing”.
            </li>
            <li>2. Forward your customer-facing address to <Address value={address} />.</li>
            <li>3. Save. Some hosts send a confirmation email — it arrives here and we handle it.</li>
          </>
        )}
      </ol>

      <p className="mt-3 text-xs text-gray-500">
        Forwarding only applies to mail that arrives after you switch it on. Messages already in
        your inbox stay where they are.
      </p>
    </Surface>
  );
}

function Address({ value }: { value: string }) {
  return (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-navy-700 dark:bg-white/10 dark:text-white">
      {value}
    </code>
  );
}
