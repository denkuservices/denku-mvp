"use client";

import React, { useState, useTransition } from "react";
import { CheckCircle2, AlertTriangle, Bot } from "lucide-react";
import { Surface, Pill } from "../../../_platform/ui";
import {
  connectTelegramAction,
  disconnectTelegramAction,
  assignTelegramEmployeeAction,
} from "../_actions";

export interface TelegramConnectionSummary {
  id: string;
  botUsername: string | null;
  botName: string | null;
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
 * The connect surface for a customer's own bot.
 *
 * Two things are load-bearing here and both are about trust:
 *
 * - **The token field is `type="password"` and is never rendered back.** Once it is submitted it
 *   is encrypted and out of reach; a re-connect asks for a fresh paste rather than showing what
 *   is stored, because a field that displays a working credential is one shoulder away from a
 *   leak, and because we could not show it without decrypting it on a page load.
 * - **"Connected" is not claimed until a customer message has actually arrived.** A bot that has
 *   never received anything is described as waiting, not working. The difference is exactly the
 *   class of bug that let a whole product ship with `business_context = null`.
 */
export function TelegramConnectionCard({
  connection,
  employees,
  canManage,
}: {
  connection: TelegramConnectionSummary | null;
  employees: EmployeeOption[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!connection);

  function onConnect(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await connectTelegramAction(formData);
      if (!res.ok) setError(res.error ?? "Could not connect.");
      else setShowForm(false);
    });
  }

  function onDisconnect() {
    if (!connection) return;
    setError(null);
    startTransition(async () => {
      const res = await disconnectTelegramAction(connection.id);
      if (!res.ok) setError(res.error ?? "Could not disconnect.");
      else setShowForm(true);
    });
  }

  function onAssign(agentId: string) {
    if (!connection) return;
    setError(null);
    startTransition(async () => {
      const res = await assignTelegramEmployeeAction(connection.id, agentId || null);
      if (!res.ok) setError(res.error ?? "Could not assign.");
    });
  }

  const live = connection?.status === "connected" && Boolean(connection.lastInboundAt);

  return (
    <div className="flex flex-col gap-4">
      {connection ? (
        <Surface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-navy-700 dark:text-white">
                  {connection.botUsername ? `@${connection.botUsername}` : (connection.botName ?? "Your bot")}
                </p>
                {connection.status === "error" ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{connection.lastError ?? "Telegram reported a problem."}</span>
                  </p>
                ) : live ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Answering messages
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Connected — waiting for the first message. Open the bot in Telegram and say hello.
                  </p>
                )}
              </div>
            </div>
            <Pill tone={connection.status === "error" ? "critical" : live ? "ok" : "neutral"}
              dot>
              {connection.status === "error" ? "Problem" : live ? "Live" : "Waiting"}
            </Pill>
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
                <option value="">
                  {employees.length === 1 ? `${employees[0].name} (default)` : "Choose an employee"}
                </option>
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
                onClick={() => setShowForm((v) => !v)}
                disabled={pending}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
              >
                Replace token
              </button>
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
        </Surface>
      ) : null}

      {showForm && canManage ? (
        <Surface>
          <h2 className="text-sm font-semibold text-navy-700 dark:text-white">
            {connection ? "Replace the bot token" : "Connect your bot"}
          </h2>
          <ol className="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
            <li>1. In Telegram, open @BotFather and send /newbot.</li>
            <li>2. Give it your business name and a username ending in “bot”.</li>
            <li>3. BotFather replies with a token that looks like 123456789:AAH… — paste it below.</li>
          </ol>

          <form action={onConnect} className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="token" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Bot token
              </label>
              <input
                id="token"
                name="token"
                type="password"
                autoComplete="off"
                required
                placeholder="123456789:AAH…"
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white"
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Stored encrypted. We never show it again — if you lose it, ask BotFather for a new one.
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
              {pending ? "Checking with Telegram…" : "Connect bot"}
            </button>
          </form>
        </Surface>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
