import { redirect } from "next/navigation";

/** Buying a number is connecting a channel (Sprint 11). Old URL preserved. */
export default function AddPhoneLineRedirect() {
  redirect("/dashboard/channels/phone-numbers/add");
}
