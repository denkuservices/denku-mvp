import { redirect } from "next/navigation";

/** One number's detail, now under Channels (Sprint 11). Old URL preserved. */
export default async function PhoneLineDetailRedirect({
  params,
}: {
  params: Promise<{ lineId: string }>;
}) {
  const { lineId } = await params;
  redirect(`/dashboard/channels/phone-numbers/${lineId}`);
}
