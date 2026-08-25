import { redirect } from 'next/navigation';

/**
 * Legacy top-level Usage link. Sprint 9 · T5: points at the Billing page's usage section,
 * which is now the single place usage is reported (it previously forwarded to a stub page).
 */
export default function UsagePage() {
  redirect('/dashboard/settings/workspace/billing#usage');
}
