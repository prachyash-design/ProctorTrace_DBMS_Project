
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";

export async function getCurrentSession() {
  const cookieStore = await cookies();

  const token = cookieStore.get("proctortrace_session")?.value;

  if (!token) {
    return null;
  }

  return await verifySession(token);
}

export async function requireRole(
  allowedRoles: Array<"ADMIN" | "PROCTOR" | "STUDENT">
) {
  const session = await getCurrentSession();

  if (!session || !allowedRoles.includes(session.role)) {
    return null;
  }

  return session;
}
