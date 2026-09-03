/**
 * Pure view model for the first-run workspace launchpad.
 *
 * Completion is derived from product data rather than a second set of onboarding flags. That is
 * what lets a field collected during onboarding render as already done, and what lets the guide
 * disappear when someone completes a task from the normal product surface.
 */

export type LaunchpadTaskKind =
  | "workspace"
  | "agent"
  | "knowledge"
  | "channel"
  | "hours"
  | "test"
  | "integration"
  | "team";

export interface LaunchpadTask {
  id: LaunchpadTaskKind;
  title: string;
  description: string;
  benefit: string;
  href: string | null;
  actionLabel: string | null;
  minutes: number;
  completed: boolean;
  optional: boolean;
  detail: string;
}

export interface WorkspaceLaunchpadSource {
  orgName: string;
  languageLabel: string | null;
  onboardingGoal: string | null;
  businessDescription: string | null;
  agentId: string | null;
  agentName: string | null;
  firstMessage: string | null;
  emphasisPoints: unknown;
  businessContext: unknown;
  defaultTimezone: string | null;
  businessHoursConfigured: boolean;
  connectedChannelLabels: string[];
  conversationCount: number;
  connectedBusinessTool: boolean;
  memberCount: number;
}

export interface WorkspaceLaunchpadModel {
  orgName: string;
  agentName: string;
  progress: number;
  completedEssentials: number;
  totalEssentials: number;
  minutesLeft: number;
  carryOvers: string[];
  channelLabels: string[];
  tasks: LaunchpadTask[];
}

const KNOWLEDGE_KEYS = [
  "services",
  "openingHours",
  "serviceArea",
  "faqs",
  "bookingPolicy",
  "cancellationPolicy",
] as const;

function filled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function countUsefulKnowledge(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const context = value as Record<string, unknown>;
  return KNOWLEDGE_KEYS.filter((key) => filled(context[key])).length;
}

function hasEmphasisPoint(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(filled);
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.some(filled) : filled(parsed);
  } catch {
    return true;
  }
}

export function buildWorkspaceLaunchpad(source: WorkspaceLaunchpadSource): WorkspaceLaunchpadModel {
  const orgName = source.orgName.trim() || "Your workspace";
  const agentName = source.agentName?.trim() || "Your AI employee";
  const agentHref = source.agentId ? `/dashboard/team/${source.agentId}` : "/dashboard/team/new";
  const knowledgeCount = countUsefulKnowledge(source.businessContext);
  // Name and language are the identity settings this task links to. Goal and business description
  // feed the employee/knowledge tasks instead, so an older workspace missing either must not be
  // sent to an identity form that cannot even edit them.
  const workspaceCarriedOver = Boolean(source.orgName.trim() && source.languageLabel);

  const tasks: LaunchpadTask[] = [
    {
      id: "workspace",
      title: "Workspace basics",
      description: workspaceCarriedOver
        ? "Your business details are already here."
        : "Add the few business details your workspace still needs.",
      benefit: "Keeps every employee and channel working from the same identity.",
      href: workspaceCarriedOver ? null : "/dashboard/settings/workspace#identity",
      actionLabel: workspaceCarriedOver ? null : "Finish workspace details",
      minutes: 2,
      completed: workspaceCarriedOver,
      optional: false,
      detail: workspaceCarriedOver
        ? "Carried over from onboarding — nothing to enter twice."
        : "We will only ask for details that were not captured during onboarding.",
    },
    {
      id: "agent",
      title: `Make ${agentName} sound like you`,
      description: "Tune the greeting, personality and one must-do instruction.",
      benefit: "Customers hear your brand, not a generic receptionist script.",
      href: `${agentHref}?tab=setup`,
      actionLabel: source.agentId ? "Personalise employee" : "Create an AI employee",
      minutes: 2,
      completed: Boolean(source.agentId && filled(source.firstMessage) && hasEmphasisPoint(source.emphasisPoints)),
      optional: false,
      detail: source.agentId
        ? "Your language and role are already filled from onboarding. Add one priority and review the greeting."
        : "Create the employee who will answer your connected channels.",
    },
    {
      id: "knowledge",
      title: "Teach it the answers",
      description: `${knowledgeCount}/6 useful knowledge areas filled`,
      benefit: "More questions get answered instantly instead of becoming work for you.",
      href: `${agentHref}?tab=knowledge`,
      actionLabel: source.agentId ? "Build its knowledge" : "Create an employee first",
      minutes: 3,
      completed: Boolean(source.agentId && knowledgeCount >= 3),
      optional: false,
      detail:
        knowledgeCount > 0
          ? "We kept what you told us during onboarding. Add hours, common questions or policies to round it out."
          : "Start with services, opening hours and the questions customers ask most. AI drafting can help.",
    },
    {
      id: "channel",
      title: "Open a door for customers",
      description:
        source.connectedChannelLabels.length > 0
          ? `${source.connectedChannelLabels.join(", ")} connected`
          : "Connect phone, web chat, email or social.",
      benefit: "A configured employee can only help once customers can reach it.",
      href: "/dashboard/channels",
      actionLabel: source.connectedChannelLabels.length > 0 ? "Manage channels" : "Connect a channel",
      minutes: 2,
      completed: source.connectedChannelLabels.length > 0,
      optional: false,
      detail:
        source.connectedChannelLabels.length > 0
          ? "Already connected during setup — you do not need to connect it again."
          : "Choose the channel your customers already use most; you can add more later.",
    },
    {
      id: "hours",
      title: "Set your working rhythm",
      description: "Add opening hours and confirm your timezone.",
      benefit: "Your AI can set honest expectations after hours while it keeps answering.",
      href: "/dashboard/settings/workspace#hours",
      actionLabel: "Set opening hours",
      minutes: 2,
      completed: Boolean(source.defaultTimezone?.trim() && source.businessHoursConfigured),
      optional: false,
      detail: "This was intentionally left out of the short onboarding. Add it once here and every employee follows it.",
    },
    {
      id: "test",
      title: "Give it a test mission",
      description:
        source.conversationCount > 0
          ? "First conversation handled — nice work."
          : "Call or message it like a real customer.",
      benefit: "A 60-second rehearsal catches awkward greetings and missing answers early.",
      href: source.conversationCount > 0 ? "/dashboard/inbox" : "/dashboard/channels",
      actionLabel: source.conversationCount > 0 ? "See the conversation" : "Start a test",
      minutes: 1,
      completed: source.conversationCount > 0,
      optional: false,
      detail: "Try a common question, a tricky policy question and one request to book or leave a message.",
    },
    {
      id: "integration",
      title: "Connect your business tools",
      description: source.connectedBusinessTool
        ? "Your live business data is connected."
        : "Let your AI read products, prices and stock.",
      benefit: "Answers stay current without copying catalogue data into prompts.",
      href: "/dashboard/settings/integrations",
      actionLabel: source.connectedBusinessTool ? "Manage integrations" : "Explore integrations",
      minutes: 3,
      completed: source.connectedBusinessTool,
      optional: true,
      detail: "Best for stores and teams whose answers depend on data that changes often.",
    },
    {
      id: "team",
      title: "Bring a teammate aboard",
      description: source.memberCount > 1 ? `${source.memberCount} people have access` : "Invite someone who can step in when needed.",
      benefit: "Human handoffs and workspace changes no longer depend on one person.",
      href: "/dashboard/settings/workspace#members",
      actionLabel: source.memberCount > 1 ? "Manage members" : "Invite a teammate",
      minutes: 1,
      completed: source.memberCount > 1,
      optional: true,
      detail: "Optional, but useful before the first busy day.",
    },
  ];

  const essentials = tasks.filter((task) => !task.optional);
  const completedEssentials = essentials.filter((task) => task.completed).length;
  const minutesLeft = essentials.filter((task) => !task.completed).reduce((total, task) => total + task.minutes, 0);
  const carryOvers = [
    source.orgName.trim() ? `Business: ${source.orgName.trim()}` : null,
    source.languageLabel ? `Language: ${source.languageLabel}` : null,
    source.onboardingGoal ? "Goal selected" : null,
    source.connectedChannelLabels.length > 0 ? "First channel ready" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    orgName,
    agentName,
    progress: Math.round((completedEssentials / essentials.length) * 100),
    completedEssentials,
    totalEssentials: essentials.length,
    minutesLeft,
    carryOvers,
    channelLabels: source.connectedChannelLabels,
    tasks,
  };
}
