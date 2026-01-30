import { redirect } from 'next/navigation';

/**
 * Usage sidebar link points here; redirect to canonical workspace usage page.
 */
export default function UsagePage() {
  redirect('/dashboard/settings/workspace/usage');
}
