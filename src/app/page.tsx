import { redirect } from "next/navigation";

export default function Home() {
  // The (admin) layout enforces auth, so a simple redirect is enough.
  redirect("/admin");
}
