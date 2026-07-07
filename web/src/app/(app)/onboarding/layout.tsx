/**
 * Onboarding route group layout.
 * Full-screen, focused, branded onboarding experience (no app chrome / sidebar).
 * The wizard (OnboardingClient) owns the entire split layout.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="brand-surface min-h-screen w-full bg-[#F7F5F1]">{children}</div>;
}
