import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignupForm } from "./_components/SignupForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

/**
 * Signup.
 *
 * The chrome is translated along with the form. A page that answers one question in the reader's
 * language — "this email is already registered" — while its own heading, hint and button stay in
 * English would be a stranger thing than either version alone: the reader would be left wondering
 * which of the two languages the product actually speaks. The auth group already resolves the
 * locale from the `NEXT_LOCALE` cookie the marketing site set (see the group's layout), so this
 * costs nothing but the strings.
 */
export default async function SignupPage() {
  const t = await getTranslations("auth.signup");

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      showBackLink
      secondary={<SocialAuthButtons surface="dark" />}
      footer={
        <p className="text-sm text-[var(--s-ink-faint)]">
          {t("haveAccount")}{" "}
          <Link className="font-medium text-[var(--s-accent)] underline-offset-2 hover:underline" href="/login">
            {t("signIn")}
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
