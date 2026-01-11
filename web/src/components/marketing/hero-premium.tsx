import { Button } from '@/components/ui/button';
import SplineClient from '@/components/marketing/SplineClient';
import { DemoCallButton } from '@/components/marketing/DemoCallButton';

const SPLINE_SCENE = process.env.NEXT_PUBLIC_SPLINE_SCENE_URL || '';

export default function HeroPremium() {
  return (
    <section className="relative w-full overflow-hidden bg-[#E3E3E3]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
        {/* LEFT */}
        <div className="z-10 space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-black md:text-5xl">
            Voice AI agents
            <br />
            built for real businesses
          </h1>

          <p className="max-w-xl text-lg text-black/70">
            Answer every call. Never lose a lead.  
            Your AI agent handles support, bookings, and follow-ups — automatically.
          </p>

          <div className="flex gap-4">
            <Button size="lg">Request demo</Button>
            <Button size="lg" variant="secondary">
              Talk to the agent
            </Button>
          </div>
        </div>

        {/* RIGHT */}
        <div className="relative flex flex-col gap-6">
          <div className="relative h-[420px] w-full overflow-hidden bg-[#E3E3E3]">
            {SPLINE_SCENE ? (
              <SplineClient scene={SPLINE_SCENE} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-black/40">
                3D preview unavailable
              </div>
            )}
          </div>
          <DemoCallButton />
        </div>
      </div>
    </section>
  );
}
