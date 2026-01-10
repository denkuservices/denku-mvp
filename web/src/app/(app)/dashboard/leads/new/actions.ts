"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Normalize phone number: keep leading +, strip other non-digits
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone || !phone.trim()) return null;
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return hasPlus ? `+${digits}` : digits;
}

/**
 * Create lead schema
 */
const CreateLeadSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((val) => normalizePhone(val)),
  email: z
    .string()
    .trim()
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .refine((val) => val === null || z.string().email().safeParse(val).success, {
      message: "Invalid email format",
    }),
  source: z.string().default("manual"),
  status: z.enum(["new", "contacted", "qualified", "unqualified"]).default("new"),
  notes: z.string().trim().nullable().optional().or(z.literal("").transform(() => null)),
});

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

/**
 * Create a new lead
 */
export async function createLead(
  orgId: string,
  userId: string,
  input: CreateLeadInput
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    // Verify authentication
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return { ok: false, error: "Not authenticated" };
    }

    // Verify userId matches authenticated user
    if (userId !== authData.user.id) {
      return { ok: false, error: "User ID mismatch" };
    }

    // Validate input
    const parsed = CreateLeadSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: `Validation error: ${parsed.error.message}` };
    }

    // Insert lead
    const { data: lead, error: insertError } = await supabaseAdmin
      .from("leads")
      .insert({
        org_id: orgId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: parsed.data.email,
        source: parsed.data.source,
        status: parsed.data.status,
        notes: parsed.data.notes,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !lead) {
      return { ok: false, error: `Failed to create lead: ${insertError?.message ?? "Unknown error"}` };
    }

    // Revalidate leads list page
    revalidatePath("/dashboard/leads");

    return { ok: true, data: { id: lead.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
