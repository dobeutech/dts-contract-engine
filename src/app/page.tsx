import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Root: bounce to /login if anonymous, otherwise into the app shell.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/admin" : "/login");
}
