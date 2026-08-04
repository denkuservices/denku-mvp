export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4 md:p-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,theme(colors.primary/0.05),transparent_40%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom_right,theme(colors.primary/0.05),transparent_40%)]" />
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
