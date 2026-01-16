import { Resend } from "resend";

export const RESEND_API_KEY = process.env.RESEND_API_KEY;

export const SENDER = "Denku AI <onboarding@resend.dev>";

// Resend is optional in domainless beta - only instantiate if key is present
export const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
