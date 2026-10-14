"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { supabase } from "@/lib/supabase/client";

export function SiteNavigation() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    if (!supabase) {
      setError("Sign out is unavailable because Supabase is not configured.");
      return;
    }

    setSigningOut(true);
    setError("");

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;

      router.replace("/");
      router.refresh();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error ? signOutError.message : "Unable to sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-bold text-slate-900">
          Yein Store
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <Link href="/custom-print" className="text-sm text-slate-600 hover:text-slate-900">
            Custom print
          </Link>
          <Link href="/store" className="text-sm text-slate-600 hover:text-slate-900">
            Ready-made shop
          </Link>
          <Link href="/cart" className="text-sm text-slate-600 hover:text-slate-900">
            Cart
          </Link>

          {!loading && user ? (
            <>
              <Link href="/pos" className="text-sm text-slate-600 hover:text-slate-900">
                POS
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </>
          ) : null}

          {!loading && !user ? (
            <>
              <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
                Login
              </Link>
              <Link href="/register" className="text-sm text-slate-600 hover:text-slate-900">
                Register
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mx-auto max-w-7xl px-4 pb-3 text-sm text-rose-700 sm:px-6">
          {error}
        </p>
      ) : null}
    </nav>
  );
}
