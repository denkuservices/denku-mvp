"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Mail,
  MessageSquare,
  PartyPopper,
  Phone,
  PlugZap,
  Rocket,
  Sparkles,
  TestTube2,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  LaunchpadTask,
  LaunchpadTaskKind,
  WorkspaceLaunchpadModel,
} from "@/lib/dashboard/workspaceLaunchpadModel";

const TASK_ICONS: Record<LaunchpadTaskKind, LucideIcon> = {
  workspace: Building2,
  agent: WandSparkles,
  knowledge: BookOpen,
  channel: MessageSquare,
  hours: Clock3,
  test: TestTube2,
  integration: PlugZap,
  team: Users,
};

function ProgressRing({ value }: { value: number }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center" aria-label={`${value}% complete`}>
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 104 104" aria-hidden="true">
        <circle cx="52" cy="52" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-white/10" />
        <circle
          cx="52"
          cy="52"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-emerald-300 transition-all duration-700"
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-semibold tabular-nums text-white">{value}%</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">ready</p>
      </div>
    </div>
  );
}

/** A small product illustration made from interface primitives, so it stays crisp in every theme. */
function EmployeeOrbit({ agentName, channels }: { agentName: string; channels: string[] }) {
  return (
    <div className="relative mx-auto h-48 w-full max-w-[300px]" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/15" />
      <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400/20 blur-xl" />
      <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[28px] border border-white/15 bg-white/10 shadow-2xl backdrop-blur-sm">
        <Bot className="h-9 w-9 text-white" />
        <span className="absolute -bottom-2 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-4 border-navy-800 bg-emerald-400 text-navy-900">
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </span>
      </div>
      <div className="absolute left-5 top-5 flex h-10 w-10 -rotate-6 items-center justify-center rounded-2xl bg-emerald-300 text-navy-900 shadow-lg shadow-black/20">
        <Phone className="h-4 w-4" />
      </div>
      <div className="absolute right-5 top-8 flex h-10 w-10 rotate-6 items-center justify-center rounded-2xl bg-[#ffd783] text-navy-900 shadow-lg shadow-black/20">
        <MessageSquare className="h-4 w-4" />
      </div>
      <div className="absolute bottom-5 left-9 flex h-10 w-10 rotate-3 items-center justify-center rounded-2xl bg-[#c9bdff] text-navy-900 shadow-lg shadow-black/20">
        <Mail className="h-4 w-4" />
      </div>
      <div className="absolute bottom-4 right-8 flex h-10 w-10 -rotate-3 items-center justify-center rounded-2xl bg-white/90 text-brand-600 shadow-lg shadow-black/20">
        <PlugZap className="h-4 w-4" />
      </div>
      <p className="absolute bottom-0 left-1/2 max-w-[180px] -translate-x-1/2 truncate rounded-full border border-white/10 bg-navy-900/70 px-3 py-1 text-[11px] font-medium text-white/70">
        {`${agentName} · ${channels.length > 0 ? "connected" : "getting ready"}`}
      </p>
    </div>
  );
}

function TaskRow({
  task,
  active,
  onSelect,
}: {
  task: LaunchpadTask;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = TASK_ICONS[task.id];
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "h-auto w-full justify-start whitespace-normal rounded-2xl border px-3 py-3 text-left shadow-none",
        active
          ? "border-brand-200 bg-brand-50 hover:bg-brand-50 dark:border-brand-400/30 dark:bg-brand-400/10 dark:hover:bg-brand-400/10"
          : "border-transparent bg-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-white/10 dark:hover:bg-white/5"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          task.completed
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
            : active
              ? "bg-brand-500 text-white"
              : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300"
        )}
      >
        {task.completed ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-semibold", task.completed ? "text-gray-500 line-through decoration-gray-300" : "text-navy-700 dark:text-white")}>
          {task.title}
        </span>
        <span className="mt-0.5 block text-xs font-normal leading-4 text-gray-500">{task.description}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-medium text-gray-400">
        {task.completed ? "Done" : `${task.minutes} min`}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Button>
  );
}

export default function WorkspaceLaunchpadClient({ model }: { model: WorkspaceLaunchpadModel }) {
  const firstOpen = model.tasks.find((task) => !task.optional && !task.completed) ?? model.tasks[0];
  const [activeId, setActiveId] = React.useState<LaunchpadTaskKind>(firstOpen.id);
  const activeTask = model.tasks.find((task) => task.id === activeId) ?? firstOpen;
  const ActiveIcon = TASK_ICONS[activeTask.id];
  const essentials = model.tasks.filter((task) => !task.optional);
  const extras = model.tasks.filter((task) => task.optional);

  return (
    <section
      aria-labelledby="workspace-launchpad-title"
      className="mb-6 overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_20px_60px_rgba(27,37,75,0.08)] dark:border-white/10 dark:bg-navy-800"
    >
      <div className="relative overflow-hidden bg-navy-800 px-5 py-6 text-white md:px-7 md:py-7">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/[0.06]" />
        <div className="absolute -right-4 -top-14 h-52 w-52 rounded-full border border-white/[0.06]" />
        <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                <Rocket className="h-3.5 w-3.5 text-emerald-300" /> Workspace launch plan
              </span>
              {model.minutesLeft > 0 ? (
                <span className="rounded-full bg-emerald-300 px-2.5 py-1 text-[11px] font-semibold text-navy-900">
                  {`About ${model.minutesLeft} min left`}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <ProgressRing value={model.progress} />
              <div className="max-w-2xl">
                <h2 id="workspace-launchpad-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {`Let's get ${model.orgName} ready for its first customer.`}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
                  A short, hands-on tour. We have already checked off everything you told us during onboarding.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {model.carryOvers.map((item) => (
                    <span key={item} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] text-white/65">
                      <Check className="h-3 w-3 text-emerald-300" /> {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <EmployeeOrbit agentName={model.agentName} channels={model.channelLabels} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(330px,.8fr)_minmax(0,1.2fr)]">
        <div className="border-b border-gray-100 p-4 sm:p-5 lg:border-b-0 lg:border-r dark:border-white/10">
          <div className="mb-3 flex items-center justify-between px-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Essentials</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {`${model.completedEssentials} of ${model.totalEssentials} complete`}
              </p>
            </div>
            <div className="flex gap-1" aria-hidden="true">
              {essentials.map((task) => (
                <span key={task.id} className={cn("h-1.5 w-5 rounded-full", task.completed ? "bg-emerald-400" : "bg-gray-200 dark:bg-white/10")} />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            {essentials.map((task) => (
              <TaskRow key={task.id} task={task} active={activeTask.id === task.id} onSelect={() => setActiveId(task.id)} />
            ))}
          </div>
        </div>

        <div className="flex min-h-[440px] flex-col bg-[#fbfcff] p-5 sm:p-7 dark:bg-navy-900/35">
          <div className="flex flex-1 flex-col justify-center">
            <div className="mb-5 flex items-start justify-between gap-3">
              <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", activeTask.completed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" : "bg-brand-500 text-white shadow-lg shadow-brand-500/20")}>
                {activeTask.completed ? <CheckCircle2 className="h-6 w-6" /> : <ActiveIcon className="h-6 w-6" />}
              </span>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", activeTask.completed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300")}>
                {activeTask.completed ? "Already done" : activeTask.optional ? "Bonus" : "Next up"}
              </span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">
              {activeTask.completed ? "Nice work" : activeTask.optional ? "Level up" : `${activeTask.minutes} minute mission`}
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-navy-700 dark:text-white">{activeTask.title}</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">{activeTask.detail}</p>
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-brand-100 bg-white p-4 dark:border-brand-400/20 dark:bg-white/5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div>
                <p className="text-xs font-semibold text-navy-700 dark:text-white">Why it matters</p>
                <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">{activeTask.benefit}</p>
              </div>
            </div>
            {activeTask.href && activeTask.actionLabel ? (
              <div className="mt-6">
                <Button asChild variant="primary" size="lg" className="rounded-xl px-5">
                  <Link href={activeTask.href}>
                    {activeTask.actionLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <PartyPopper className="h-4 w-4" /> Saved from onboarding
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-gray-200 pt-5 dark:border-white/10">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Bonus missions</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {extras.map((task) => {
                const Icon = TASK_ICONS[task.id];
                return (
                  <Button
                    key={task.id}
                    type="button"
                    variant="ghost"
                    onClick={() => setActiveId(task.id)}
                    className={cn(
                      "h-auto justify-start whitespace-normal rounded-xl border px-3 py-3 text-left",
                      activeTask.id === task.id
                        ? "border-brand-200 bg-brand-50 dark:border-brand-400/30 dark:bg-brand-400/10"
                        : "border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    )}
                  >
                    {task.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Icon className="h-4 w-4 text-gray-400" />}
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-navy-700 dark:text-white">{task.title}</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-gray-500">{task.completed ? "Done" : "Optional"}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
