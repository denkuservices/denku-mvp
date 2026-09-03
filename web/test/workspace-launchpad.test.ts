import { describe, expect, it } from "vitest";
import {
  buildWorkspaceLaunchpad,
  countUsefulKnowledge,
  type WorkspaceLaunchpadSource,
} from "@/lib/dashboard/workspaceLaunchpadModel";

const base: WorkspaceLaunchpadSource = {
  orgName: "Acme Dental",
  languageLabel: "English",
  onboardingGoal: "support",
  businessDescription: "A family dental practice",
  agentId: "agent-1",
  agentName: "Mia",
  firstMessage: "Thanks for calling Acme Dental.",
  emphasisPoints: [],
  businessContext: { services: "Dental care" },
  defaultTimezone: null,
  businessHoursConfigured: false,
  connectedChannelLabels: ["Phone"],
  conversationCount: 0,
  connectedBusinessTool: false,
  memberCount: 1,
};

describe("workspace launchpad", () => {
  it("checks off details and channels already collected during onboarding", () => {
    const model = buildWorkspaceLaunchpad(base);

    expect(model.tasks.find((task) => task.id === "workspace")?.completed).toBe(true);
    expect(model.tasks.find((task) => task.id === "channel")?.completed).toBe(true);
    expect(model.carryOvers).toContain("Business: Acme Dental");
    expect(model.carryOvers).toContain("First channel ready");
  });

  it("requires useful facts beyond the business name before knowledge is ready", () => {
    expect(countUsefulKnowledge({ businessName: "Acme", tone: "Warm" })).toBe(0);
    expect(countUsefulKnowledge({ services: "Repairs", openingHours: "9–5", faqs: "Parking is free" })).toBe(3);

    const model = buildWorkspaceLaunchpad({
      ...base,
      businessContext: { services: "Repairs", openingHours: "9–5", faqs: "Parking is free" },
    });
    expect(model.tasks.find((task) => task.id === "knowledge")?.completed).toBe(true);
  });

  it("does not treat a generated greeting alone as personalisation", () => {
    const before = buildWorkspaceLaunchpad(base);
    const after = buildWorkspaceLaunchpad({ ...base, emphasisPoints: ["Always confirm the callback number"] });

    expect(before.tasks.find((task) => task.id === "agent")?.completed).toBe(false);
    expect(after.tasks.find((task) => task.id === "agent")?.completed).toBe(true);
  });

  it("reaches 100% only when every essential has real product state behind it", () => {
    const model = buildWorkspaceLaunchpad({
      ...base,
      emphasisPoints: JSON.stringify(["Offer the earliest appointment"]),
      businessContext: { services: "Dental care", openingHours: "9–5", faqs: "Parking is free" },
      defaultTimezone: "Europe/Istanbul",
      businessHoursConfigured: true,
      conversationCount: 1,
    });

    expect(model.completedEssentials).toBe(model.totalEssentials);
    expect(model.progress).toBe(100);
    expect(model.minutesLeft).toBe(0);
  });
});
