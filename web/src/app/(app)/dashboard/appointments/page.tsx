import { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId } from "@/lib/analytics/params";
import {
  TableCard,
  TableRoot,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui-horizon/table";
import { EmptyState } from "@/components/ui-horizon/empty";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Appointments",
};

// TODO: Verify exact column names from Supabase schema
type AppointmentRow = {
  id: string;
  org_id: string;
  lead_id: string | null;
  call_id: string | null;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSourceLabel(appointment: AppointmentRow): string {
  if (appointment.call_id) return "AI";
  return "Manual";
}

function getStatusLabel(status: string | null): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function getAppointments(orgId: string): Promise<AppointmentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, org_id, lead_id, call_id, start_at, end_at, status, notes, created_at, updated_at")
    .eq("org_id", orgId)
    .order("start_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AppointmentRow[];
}

async function getLeadName(leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("leads")
    .select("name")
    .eq("id", leadId)
    .maybeSingle();

  return data?.name ?? null;
}

export const dynamic = "force-dynamic";

export default async function AppointmentsPage() {
  const orgId = await resolveOrgId();
  const appointments = await getAppointments(orgId);

  const now = new Date();
  const upcoming = appointments.filter((apt) => {
    if (!apt.start_at) return false;
    return new Date(apt.start_at) >= now;
  });

  const past = appointments.filter((apt) => {
    if (!apt.start_at) return true;
    return new Date(apt.start_at) < now;
  });

  const upcomingWithNames = await Promise.all(
    upcoming.map(async (apt) => ({
      ...apt,
      leadName: await getLeadName(apt.lead_id),
    }))
  );

  const pastWithNames = await Promise.all(
    past.map(async (apt) => ({
      ...apt,
      leadName: await getLeadName(apt.lead_id),
    }))
  );

  return (
    <div className="space-y-6">
      {/* Upcoming Appointments */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Upcoming Appointments</h2>
        </div>

        <TableCard>
          {upcomingWithNames.length === 0 ? (
            <EmptyState
              title="No appointments yet"
              description="Upcoming appointments will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <TableRoot>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & time</TableHead>
                    <TableHead>Customer name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingWithNames.map((apt) => (
                    <TableRow key={apt.id} className="hover:bg-muted/50">
                      <TableCell>{formatDateTime(apt.start_at)}</TableCell>
                      <TableCell>{apt.leadName || "—"}</TableCell>
                      <TableCell>{getSourceLabel(apt)}</TableCell>
                      <TableCell>{getStatusLabel(apt.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" disabled>
                            Reschedule
                          </Button>
                          <Button variant="outline" size="sm" disabled>
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableRoot>
            </div>
          )}
        </TableCard>
      </div>

      {/* Past Appointments */}
      <div className="space-y-4">
        <div className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold text-foreground">Past Appointments</h2>
        </div>

        <TableCard>
          {pastWithNames.length === 0 ? (
            <EmptyState
              title="No past appointments"
              description="Completed appointments will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <TableRoot>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & time</TableHead>
                    <TableHead>Customer name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastWithNames.map((apt) => (
                    <TableRow key={apt.id} className="hover:bg-muted/50">
                      <TableCell>{formatDateTime(apt.start_at)}</TableCell>
                      <TableCell>{apt.leadName || "—"}</TableCell>
                      <TableCell>{getSourceLabel(apt)}</TableCell>
                      <TableCell>{getStatusLabel(apt.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableRoot>
            </div>
          )}
        </TableCard>
      </div>
    </div>
  );
}
