import { createClient } from "@/lib/supabase/server";

export async function getAdminClient() {
  const supabase = await createClient();
  if (!supabase) {
    return {
      supabase: null,
      error: { status: 503, message: "Supabase is not configured." },
    } as const;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      supabase: null,
      error: { status: 401, message: "Sign in with an administrator account." },
    } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      supabase: null,
      error: { status: 500, message: "Unable to verify administrator access." },
    } as const;
  }

  if (profile?.role !== "admin") {
    return {
      supabase: null,
      error: { status: 403, message: "Administrator access is required." },
    } as const;
  }

  return { supabase, error: null } as const;
}
