import { redirect } from "next/navigation";
import AdminShell from "@/src/components/AdminShell";
import { ConfirmProvider } from "@/src/components/ConfirmDialog";
import { ToastProvider } from "@/src/components/Toast";
import { getCurrentUser } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) redirect("/login");

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminShell
          user={{
            email: user.email,
            displayName: user.displayName,
            role: user.role,
          }}
        >
          {children}
        </AdminShell>
      </ConfirmProvider>
    </ToastProvider>
  );
}
