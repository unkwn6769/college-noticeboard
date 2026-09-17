import { redirect } from "next/navigation";
import AdminNav from "@/src/components/AdminNav";
import { getCurrentUser } from "@/src/lib/auth/session";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) redirect("/login");
  return <><AdminNav/><main className="container page">{children}</main></>;
}
