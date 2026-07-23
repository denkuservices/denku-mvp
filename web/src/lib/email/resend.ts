import { Resend } from "resend";

export const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Sender addresses are centralized in `./senders` (R-080). The legacy sandbox
// `onboarding@resend.dev` const was removed — all sends use verified denku.io
// senders via `resolveSender()`.

// Resend is optional in domainless beta - only instantiate if key is present
export const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
