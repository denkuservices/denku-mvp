// Import Horizon global styles (scoped to admin routes)
import "@/horizon/styles/index.css";
import "@/horizon/styles/App.css";
import "@/horizon/styles/MiniCalendar.css";
import "@/horizon/styles/Contact.css";

import AppWrappers from "@/horizon/app/AppWrappers";
import AdminLayout from "@/horizon/app/admin/layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppWrappers>
      <AdminLayout>{children}</AdminLayout>
    </AppWrappers>
  );
}
