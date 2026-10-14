import { redirect } from "next/navigation";
import Link from "next/link";
import { POSWorkspace } from "@/components/pos-workspace";
import { createClient } from "@/lib/supabase/server";

export default async function POSPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login?next=%2Fpos");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login?next=%2Fpos");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Could not check administrator access</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You are signed in, but the app could not read your profile role. Check the
            profiles table permissions and try again.
          </p>
          <p className="mt-3 break-words rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">
            {profileError.message}
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-slate-900 underline">
            Return to store
          </Link>
        </section>
      </main>
    );
  }

  if (profile?.role !== "admin") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Administrator access required</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You are signed in as <strong>{user.email ?? "this account"}</strong>, but this
            account&apos;s profile role is {profile?.role ? `"${profile.role}"` : "not set"}.
            Ask an administrator to set <code>public.profiles.role</code> to{" "}
            <code>admin</code> for your user ID:
          </p>
          <p className="mt-3 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-600">
            {user.id}
          </p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-slate-900 underline">
            Return to store
          </Link>
        </section>
      </main>
    );
  }

  return <POSWorkspace />;
}
