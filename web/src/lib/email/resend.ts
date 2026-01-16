import { Resend } from "resend";

export const SENDER = "Denku AI <onboarding@resend.dev>";

export const resend = new Resend(process.env.RESEND_API_KEY!);
