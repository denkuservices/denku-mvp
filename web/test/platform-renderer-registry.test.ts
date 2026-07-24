import { describe, it, expect } from "vitest";
import {
  getRenderer,
  hasRenderer,
  registerRenderer,
} from "@/app/(app)/dashboard/_platform/conversation/renderers/registry";
import DefaultTurnRenderer from "@/app/(app)/dashboard/_platform/conversation/renderers/DefaultTurnRenderer";

describe("conversation renderer registry (plugin-based)", () => {
  it("built-in channels are registered to the default renderer", () => {
    expect(hasRenderer("voice")).toBe(true);
    expect(hasRenderer("instagram")).toBe(true);
    expect(getRenderer("voice")).toBe(DefaultTurnRenderer);
  });

  it("unknown/future channels fall back to the default renderer (no core change needed)", () => {
    expect(hasRenderer("whatsapp")).toBe(false);
    expect(getRenderer("whatsapp")).toBe(DefaultTurnRenderer);
    expect(getRenderer("email")).toBe(DefaultTurnRenderer);
  });

  it("a channel can register its own renderer without touching the core", () => {
    const CustomRenderer = () => null;
    registerRenderer("whatsapp", CustomRenderer);
    expect(hasRenderer("whatsapp")).toBe(true);
    expect(getRenderer("whatsapp")).toBe(CustomRenderer);
    // does not disturb other channels
    expect(getRenderer("voice")).toBe(DefaultTurnRenderer);
  });
});
