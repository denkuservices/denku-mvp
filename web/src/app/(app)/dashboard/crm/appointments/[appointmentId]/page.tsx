import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getAppointmentDetail } from "@/lib/platform/readModel/requests";
import AppointmentDetailBody from "../../requests/[requestId]/AppointmentDetailBody";

export const dynamic = "force-dynamic";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  if (!platformUxEnabled()) notFound();

  const { appointmentId } = await params;
  const orgId = await resolveActiveOrgId();
  if (!orgId) notFound();

  const appointment = await getAppointmentDetail(orgId, appointmentId);
  if (!appointment) notFound();

  return <AppointmentDetailBody orgId={orgId} appointment={appointment} />;
}
