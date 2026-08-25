import { redirect } from "next/navigation";

/** Security is a section of Account now (Settings 9 → 4). The URL still resolves. */
export default function AccountSecurityRedirect() {
  redirect("/dashboard/settings/account#security");
}
