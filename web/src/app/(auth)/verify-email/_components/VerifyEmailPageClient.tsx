"use client";

import { useState } from "react";
import { VerifyEmailHoldingPage } from "./VerifyEmailHoldingPage";
import { VerifyEmailInputForm } from "./VerifyEmailInputForm";

interface VerifyEmailPageClientProps {
  initialEmail: string;
}

export function VerifyEmailPageClient({ initialEmail }: VerifyEmailPageClientProps) {
  const [email, setEmail] = useState<string>(initialEmail);

  if (email) {
    return <VerifyEmailHoldingPage email={email} />;
  }

  return <VerifyEmailInputForm onEmailSet={setEmail} />;
}

