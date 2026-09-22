"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AccountShell, AccountShellSkeleton } from "./AccountShell";

function SessionFallback() {
  return <AccountShellSkeleton />;
}

interface AuthenticatedAccountShellProps {
  children: React.ReactNode;
  loginHref: string;
}

/**
 * The server layout rejects requests with no session credentials. This client
 * boundary verifies the remaining session before exposing account chrome and
 * preserves the existing refresh-token recovery flow.
 */
export function AuthenticatedAccountShell({
  children,
  loginHref,
}: AuthenticatedAccountShellProps) {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace(loginHref);
  }, [isAuthenticated, loading, loginHref, router]);

  if (loading || !isAuthenticated) return <SessionFallback />;

  return <AccountShell>{children}</AccountShell>;
}
