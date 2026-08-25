"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AddPhoneNumberModal } from "./AddPhoneNumberModal";

interface AddPhoneNumberButtonProps {
  isPreviewMode?: boolean;
}

export function AddPhoneNumberButton({ isPreviewMode = false }: AddPhoneNumberButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    // Refresh the page data when a new phone line is added
    router.refresh();
  };

  // In preview mode, show "Choose a plan" button that routes to billing
  if (isPreviewMode) {
    return (
      <Link
        href="/dashboard/settings/workspace/billing"
        className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-[11px] font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
      >
        Choose a plan
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-[11px] font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
      >
        + Add phone number
      </button>
      <AddPhoneNumberModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={handleSuccess} />
    </>
  );
}
