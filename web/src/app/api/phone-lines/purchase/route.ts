import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { isWorkspacePaused } from "@/lib/workspace-status";
import { logEvent } from "@/lib/observability/logEvent";
import { randomUUID } from "crypto";

type VapiCreatePhoneNumberResponse = {
  id: string;
  number?: string;
  phoneNumber?: string;
  status?: string;
};

type VapiPhoneNumberDetails = {
  id: string;
  number?: string;
  phoneNumber?: string;
  status?: string;
};

/**
 * POST /api/phone-lines/purchase
 * 
 * Production-grade purchase orchestration for phone lines.
 * Flow: Stripe subscription items → Vapi provisioning → DB insert
 * With compensation/rollback on failure.
 */
export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  let stripeSuccess = false;
  let vapiPhoneId: string | null = null;
  let phoneNumberE164: string | null = null;
  let backingAssistantId: string | null = null;
  let backingAgent: { id: string } | null = null;
  let body: any = null;

  try {
    // 1) Parse request body with backward compatibility
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error("[purchase] Failed to parse JSON body", { err: parseErr });
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Backward compatibility: default missing fields
    const country = body?.country || "US";
    const preferredAreaCodeRaw = body?.preferredAreaCode ?? body?.areaCode ?? body?.area_code ?? null;
    const preferredAreaCode =
      preferredAreaCodeRaw != null && /^\d{3}$/.test(String(preferredAreaCodeRaw).trim())
        ? String(preferredAreaCodeRaw).trim()
        : null;
    const lineType = "support"; // Always enforce "support" for now

    // Validate inputs
    if (country !== "US") {
      return NextResponse.json(
        { ok: false, error: "Only US phone numbers are supported" },
        { status: 400 }
      );
    }

    // 2) Authenticate user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("[purchase] Authentication failed", { authError });
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 3) Get org_id from profile
    // Use maybeSingle() for robust error handling and RLS compatibility
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .maybeSingle<{ org_id: string | null }>();

    if (profileError) {
      // Log detailed error information for debugging
      const errorDetails = {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint,
      };
      
      console.error("[purchase] Failed to fetch profile", {
        error: profileError,
        errorDetails,
        user_id: user.id,
        auth_user_id: user.id,
      });
      
      return NextResponse.json(
        { ok: false, error: "Failed to fetch user profile" },
        { status: 500 }
      );
    }

    const org_id = profile?.org_id ?? null;

    if (!org_id) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 400 }
      );
    }

    // 4) Check workspace status
    try {
      const workspacePaused = await isWorkspacePaused(org_id);
      if (workspacePaused) {
        return NextResponse.json(
          { ok: false, error: "Workspace is paused. Please contact support." },
          { status: 409 }
        );
      }
    } catch (workspaceErr) {
      console.error("[purchase] Failed to check workspace status", { err: workspaceErr });
      // Continue - don't block on workspace check errors
    }

    // 5) Get current addon quantity for rollback tracking
    const { data: currentAddon } = await supabaseAdmin
      .from("billing_org_addons")
      .select("qty")
      .eq("org_id", org_id)
      .eq("addon_key", "extra_phone")
      .maybeSingle<{ qty: number }>();

    const currentQty = currentAddon?.qty ? Number(currentAddon.qty) : 0;
    const newQty = currentQty + 1;

    // 6) Stripe step: increase extra_phone by +1 via addons/update endpoint
    const addonUpdateUrl = new URL("/api/billing/addons/update", req.url);
    const addonUpdateRes = await fetch(addonUpdateUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("Cookie") || "",
      },
      body: JSON.stringify({
        addon_key: "extra_phone",
        qty: newQty,
      }),
    });

    if (!addonUpdateRes.ok) {
      const addonData = await addonUpdateRes.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: addonData.error || "Failed to update billing" },
        { status: addonUpdateRes.status }
      );
    }

    stripeSuccess = true;

    // 7) Create backing agent and provision phone number
    // Wrap in try/catch for rollback on failure
    try {
      // Helper function for base URL
      function getBaseUrl(): string {
        if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
        if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
        return "http://localhost:3000";
      }

      const baseUrl = getBaseUrl();
      const toolsServerUrl = `${baseUrl}/api/tools`;

      // Create Vapi assistant for backing agent
      // Generate short name <= 40 chars: "PL {orgId first 4} {timestamp last 6}"
      const orgIdShort = org_id.slice(0, 4);
      const timestampShort = Date.now().toString().slice(-6);
      const assistantName = `PL ${orgIdShort} ${timestampShort}`; // Max length: 2 + 1 + 4 + 1 + 6 = 14 chars
      
      let assistantResponse: { id: string } | null = null;
      let vapiErrorStatus = 500;
      let vapiErrorMessage = "";
      
      try {
        assistantResponse = await vapiFetch<{ id: string }>("/assistant", {
          method: "POST",
          body: JSON.stringify({
            name: assistantName,
            model: {
              provider: "openai",
              model: "gpt-4o",
              messages: [
                {
                  role: "system",
                  content: "You are a helpful customer support voice assistant. Be friendly, professional, and focused on resolving customer inquiries.",
                },
              ],
            },
            firstMessage: "Hi, thanks for calling. How can I help you today?",
            serverUrl: toolsServerUrl,
            // Note: tools are NOT sent here - Vapi doesn't accept tools in assistant creation
            // Tools will be configured separately if needed, or stored in our DB only
          }),
        });
      } catch (assistantErr) {
        // Parse Vapi error response
        const assistantErrorMsg = assistantErr instanceof Error ? assistantErr.message : String(assistantErr);
        
        // Extract status code and message from Vapi error
        // Format: "Vapi error 400: {message}"
        const statusMatch = assistantErrorMsg.match(/Vapi error (\d+):/);
        if (statusMatch) {
          vapiErrorStatus = parseInt(statusMatch[1], 10);
          vapiErrorMessage = assistantErrorMsg.replace(/^Vapi error \d+: /, "").trim();
        } else {
          vapiErrorMessage = assistantErrorMsg;
        }
        
        console.error("[purchase] Failed to create Vapi assistant", { 
          err: assistantErr, 
          vapiErrorStatus,
          vapiErrorMessage,
          assistantName 
        });
        
        // Rollback Stripe: decrement extra_phone
        await fetch(addonUpdateUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("Cookie") || "",
          },
          body: JSON.stringify({
            addon_key: "extra_phone",
            qty: currentQty,
          }),
        }).catch(() => {
          // Ignore rollback errors
        });

        // Return appropriate status based on Vapi error (400 -> 400, others -> 502)
        const responseStatus = vapiErrorStatus === 400 ? 400 : 502;
        return NextResponse.json(
          { ok: false, error: vapiErrorMessage || `Failed to create backing agent: ${assistantErrorMsg}` },
          { status: responseStatus }
        );
      }

    const backingAssistantId = assistantResponse?.id;
    if (!backingAssistantId) {
      // Rollback Stripe: decrement extra_phone
      await fetch(addonUpdateUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: req.headers.get("Cookie") || "",
        },
        body: JSON.stringify({
          addon_key: "extra_phone",
          qty: currentQty,
        }),
      }).catch(() => {
        // Ignore rollback errors
      });

      return NextResponse.json(
        { ok: false, error: "Failed to create backing agent: No assistant ID returned" },
        { status: 502 }
      );
    }

      // Insert backing agent into agents table
      // Required fields: org_id, name, created_by, language, voice, timezone
      const { data: backingAgent, error: agentInsertError } = await supabaseAdmin
        .from("agents")
        .insert({
          org_id: org_id,
          name: `Phone Line Support Agent`,
          created_by: user.id, // Required: user who created this agent
          language: "en", // Default: English
          voice: "jennifer", // Default voice
          timezone: "America/New_York", // Default timezone
          vapi_assistant_id: backingAssistantId,
          behavior_preset: "friendly-support",
          agent_type: "phone_line_backing",
          // Note: status column does not exist in agents table
          // vapi_sync_status can be set if needed, but leaving it null is fine
        })
        .select("id")
        .single<{ id: string }>();

      if (agentInsertError || !backingAgent) {
        // Log detailed error information
        const errorDetails = agentInsertError 
          ? {
              message: agentInsertError.message,
              code: agentInsertError.code,
              details: agentInsertError.details,
              hint: agentInsertError.hint,
            }
          : { message: "No error object but backingAgent is null" };
        
        console.error("[purchase] Failed to insert backing agent", {
          error: agentInsertError,
          errorDetails,
          org_id,
          backingAssistantId,
          user_id: user.id,
        });

        // Rollback: delete Vapi assistant (best-effort)
        try {
          await vapiFetch(`/assistant/${backingAssistantId}`, {
            method: "DELETE",
          }).catch((deleteErr) => {
            console.error("[purchase] Failed to delete Vapi assistant during rollback", { err: deleteErr });
          });
        } catch (err) {
          console.error("[purchase] Exception deleting Vapi assistant during rollback", { err });
        }

        // Rollback Stripe: decrement extra_phone
        try {
          await fetch(addonUpdateUrl.toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("Cookie") || "",
            },
            body: JSON.stringify({
              addon_key: "extra_phone",
              qty: currentQty,
            }),
          });
        } catch (rollbackErr) {
          console.error("[purchase] Failed to rollback Stripe addon", { err: rollbackErr });
        }

        // Return error with safe message (don't expose internal details)
        const safeErrorMsg = errorDetails.message 
          ? `Failed to save backing agent: ${errorDetails.message}`
          : "Failed to save backing agent. Please try again.";
        
        return NextResponse.json(
          { ok: false, error: safeErrorMsg },
          { status: 500 }
        );
      }

      // 8) Vapi step: provision phone number with backing assistant
      // Try preferred area code first; if Vapi returns no availability / 4xx, retry with default 321
      const DEFAULT_AREA_CODE = "321";
      const tryAreaCodes: string[] =
        preferredAreaCode && preferredAreaCode !== DEFAULT_AREA_CODE
          ? [preferredAreaCode, DEFAULT_AREA_CODE]
          : [DEFAULT_AREA_CODE];

      let phone: VapiCreatePhoneNumberResponse | null = null;
      let lastVapiErrorStatus = 502;
      let lastVapiErrorMessage = "";

      for (const desiredAreaCode of tryAreaCodes) {
        try {
          phone = await vapiFetch<VapiCreatePhoneNumberResponse>("/phone-number", {
            method: "POST",
            body: JSON.stringify({
              provider: "vapi",
              assistantId: backingAssistantId,
              numberDesiredAreaCode: desiredAreaCode,
            }),
          });
          break;
        } catch (vapiErr) {
          const vapiErrorMsg = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
          let vapiErrorStatus = 502;
          let vapiErrorMessage = vapiErrorMsg;
          const statusMatch = vapiErrorMsg.match(/Vapi error (\d+):/);
          if (statusMatch) {
            vapiErrorStatus = parseInt(statusMatch[1], 10);
            vapiErrorMessage = vapiErrorMsg.replace(/^Vapi error \d+: /, "").trim();
          }
          lastVapiErrorStatus = vapiErrorStatus;
          lastVapiErrorMessage = vapiErrorMessage;
          console.error("[purchase] Vapi phone provisioning failed", {
            err: vapiErr,
            desiredAreaCode,
            vapiErrorStatus,
            vapiErrorMessage,
          });
          const isAvailabilityIssue =
            vapiErrorStatus >= 400 &&
            vapiErrorStatus < 500 &&
            (vapiErrorMessage.toLowerCase().includes("available") ||
              vapiErrorMessage.toLowerCase().includes("no number") ||
              vapiErrorMessage.toLowerCase().includes("not found"));
          if (isAvailabilityIssue && tryAreaCodes.indexOf(desiredAreaCode) < tryAreaCodes.length - 1) {
            continue;
          }
          await fetch(addonUpdateUrl.toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("Cookie") || "",
            },
            body: JSON.stringify({
              addon_key: "extra_phone",
              qty: currentQty,
            }),
          }).catch(() => {});
          const responseStatus = lastVapiErrorStatus === 400 ? 400 : 502;
          return NextResponse.json(
            {
              ok: false,
              error:
                lastVapiErrorMessage ||
                "Failed to provision phone number. Try again or use a different area code.",
            },
            { status: responseStatus }
          );
        }
      }

      if (!phone?.id) {
        // Rollback Stripe: decrement extra_phone
        await fetch(addonUpdateUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("Cookie") || "",
          },
          body: JSON.stringify({
            addon_key: "extra_phone",
            qty: currentQty,
          }),
        }).catch(() => {
          // Ignore rollback errors
        });

        return NextResponse.json(
          { ok: false, error: "Phone provisioning returned no ID" },
          { status: 502 }
        );
      }

      vapiPhoneId = phone.id;

      // 9) Poll for phone number E164 if status is "activating"
      let phoneStatus = phone.status || "activating";
      let pollAttempts = 0;
      const maxPolls = 10;

      while (phoneStatus === "activating" && pollAttempts < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        pollAttempts++;

        try {
          const phoneDetails = await vapiFetch<VapiPhoneNumberDetails>(
            `/phone-number/${phone.id}`
          );
          phoneStatus = phoneDetails?.status || "activating";

          if (phoneDetails?.number || phoneDetails?.phoneNumber) {
            phoneNumberE164 = phoneDetails.number ?? phoneDetails.phoneNumber ?? null;
          }

          if (phoneStatus === "active") {
            break;
          }
        } catch (pollErr) {
          // Continue polling
        }
      }

      // 10) Get final phone details if E164 still missing
      if (!phoneNumberE164) {
        try {
          const phoneDetails = await vapiFetch<VapiPhoneNumberDetails>(
            `/phone-number/${phone.id}`
          );
          phoneNumberE164 = phoneDetails.number ?? phoneDetails.phoneNumber ?? null;
        } catch (err) {
          // Will continue with null - can be set later
        }
      }

      // 11) DB step: insert phone line row with backing agent reference
      // 
      // SQL Schema Requirement:
      // The phone_lines table must have an assigned_agent_id column (UUID, nullable):
      //   ALTER TABLE public.phone_lines
      //   ADD COLUMN IF NOT EXISTS assigned_agent_id UUID NULL
      //   REFERENCES public.agents(id) ON DELETE SET NULL;
      //
      // This column stores the 1:1 backing agent ID for each phone line.
      // The backing agent is created during purchase and is used exclusively for this line.
      //
      const now = new Date().toISOString();
      const { data: phoneLine, error: insertError } = await supabaseAdmin
        .from("phone_lines")
        .insert({
          org_id: org_id,
          vapi_phone_number_id: vapiPhoneId,
          phone_number_e164: phoneNumberE164,
          status: "live",
          line_type: lineType,
          assigned_agent_id: backingAgent.id, // Store backing agent ID (1:1 mapping)
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError) {
        // Log detailed error information
        const errorDetails = {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        };
        
        console.error("[purchase] Failed to insert phone line", {
          error: insertError,
          errorDetails,
          org_id,
          vapiPhoneId,
          phoneNumberE164,
          backingAgentId: backingAgent?.id,
        });

        // Check if error is due to table not existing
        const errorMsg = insertError.message || String(insertError);
        if (errorMsg.includes("relation") && errorMsg.includes("phone_lines") && errorMsg.includes("does not exist")) {
          // Rollback Stripe: decrement extra_phone
          try {
            await fetch(addonUpdateUrl.toString(), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.get("Cookie") || "",
              },
              body: JSON.stringify({
                addon_key: "extra_phone",
                qty: currentQty,
              }),
            });
          } catch (rollbackErr) {
            console.error("[purchase] Failed to rollback Stripe addon (table missing)", { err: rollbackErr });
          }

          return NextResponse.json(
            { ok: false, error: "Database configuration error. Please contact support." },
            { status: 500 }
          );
        }

        // Rollback: attempt Vapi deprovision (best-effort)
        if (vapiPhoneId) {
          try {
            await vapiFetch(`/phone-number/${vapiPhoneId}`, {
              method: "DELETE",
            }).catch((deleteErr) => {
              console.error("[purchase] Failed to delete Vapi phone during rollback", { err: deleteErr });
            });
          } catch (deprovisionErr) {
            console.error("[purchase] Exception deleting Vapi phone during rollback", { err: deprovisionErr });
          }
        }

        // Rollback: delete backing agent and assistant if created
        if (backingAgent?.id) {
          try {
            // Delete agent record (best-effort)
            const { error: deleteAgentError } = await supabaseAdmin
              .from("agents")
              .delete()
              .eq("id", backingAgent.id);
            
            if (deleteAgentError) {
              console.error("[purchase] Failed to delete agent during rollback", { err: deleteAgentError });
            }

            // Delete Vapi assistant (best-effort)
            if (backingAssistantId) {
              await vapiFetch(`/assistant/${backingAssistantId}`, {
                method: "DELETE",
              }).catch((deleteErr) => {
                console.error("[purchase] Failed to delete Vapi assistant during rollback", { err: deleteErr });
              });
            }
          } catch (err) {
            console.error("[purchase] Exception during agent/assistant rollback", { err });
          }
        }

        // Rollback Stripe: decrement extra_phone
        try {
          await fetch(addonUpdateUrl.toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("Cookie") || "",
            },
            body: JSON.stringify({
              addon_key: "extra_phone",
              qty: currentQty,
            }),
          });
        } catch (rollbackErr) {
          console.error("[purchase] Failed to rollback Stripe addon", { err: rollbackErr });
        }

        // Return error with safe message
        const safeErrorMsg = errorDetails.message 
          ? `Failed to save phone line: ${errorDetails.message}`
          : "Failed to save phone line. Please try again.";
        
        return NextResponse.json(
          { ok: false, error: safeErrorMsg },
          { status: 500 }
        );
      }

      // 12) Success - return 201
      logEvent({
        tag: "[PHONE_LINES][PURCHASE][SUCCESS]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: org_id,
        severity: "info",
        details: {
          request_id: requestId,
          line_id: phoneLine.id,
          vapi_phone_number_id: vapiPhoneId,
          phone_number_e164: phoneNumberE164,
          line_type: lineType,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          lineId: phoneLine.id,
          phoneNumberE164: phoneNumberE164,
        },
        { status: 200 }
      );
    } catch (err) {
      // Rollback Stripe if Vapi or DB failed after Stripe succeeded
      if (stripeSuccess) {
        try {
          await fetch(addonUpdateUrl.toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("Cookie") || "",
            },
            body: JSON.stringify({
              addon_key: "extra_phone",
              qty: currentQty,
            }),
          });
        } catch (rollbackErr) {
          // Log but don't fail the response
        }
      }

      // Attempt Vapi deprovision if phone was created
      if (vapiPhoneId) {
        try {
          await vapiFetch(`/phone-number/${vapiPhoneId}`, {
            method: "DELETE",
          }).catch(() => {
            // Best-effort only
          });
        } catch (deprovisionErr) {
          // Ignore
        }
      }

      // Attempt backing agent cleanup if created
      if (backingAssistantId) {
        try {
          // Try to find and delete agent record
          const { data: agents } = await supabaseAdmin
            .from("agents")
            .select("id")
            .eq("vapi_assistant_id", backingAssistantId)
            .eq("org_id", org_id)
            .limit(1);

          if (agents && agents.length > 0) {
            const { error: deleteAgentError } = await supabaseAdmin
              .from("agents")
              .delete()
              .eq("id", agents[0].id);
            
            if (deleteAgentError) {
              console.error("[purchase] Failed to delete agent during rollback", { err: deleteAgentError });
            }
          }

          // Delete Vapi assistant
          await vapiFetch(`/assistant/${backingAssistantId}`, {
            method: "DELETE",
          }).catch(() => {
            // Best-effort only
          });
        } catch (err) {
          // Ignore
        }
      }

      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      
      console.error("[purchase] Purchase failed", { 
        body, 
        err, 
        errorMsg,
        vapiPhoneId,
        backingAssistantId,
        stripeSuccess 
      });
      
      try {
        logEvent({
          tag: "[PHONE_LINES][PURCHASE][ERROR]",
          ts: Date.now(),
          stage: "COST",
          source: "system",
          org_id: org_id || "unknown",
          severity: "error",
          details: {
            request_id: requestId,
            error: errorMsg,
            vapi_phone_id: vapiPhoneId,
            stripe_rolled_back: stripeSuccess,
          },
        });
      } catch (logErr) {
        // Ignore logging errors
      }
      
      // Return 502 for Vapi errors, 500 for others
      const statusCode = errorMsg.includes("Vapi") || errorMsg.includes("vapi") ? 502 : 500;
      
      return NextResponse.json(
        { ok: false, error: errorMsg || "Failed to provision phone number. Please try again." },
        { status: statusCode }
      );
    }
  } catch (outerErr) {
    const errorMsg = outerErr instanceof Error ? outerErr.message : "Unknown error";
    console.error("[purchase] Outer catch - purchase failed", { body, err: outerErr });
    
    return NextResponse.json(
      { ok: false, error: errorMsg || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
