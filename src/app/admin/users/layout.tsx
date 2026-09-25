import { notFound } from "next/navigation";
import { getCurrentUser } from "@/src/lib/auth/session";

// User administration is owner-only. The admin layout allows ADMIN, so this
// segment needs its own server-side gate; a hidden nav link is not authorization.
export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "OWNER") notFound();
  return <>{children}</>;
}
