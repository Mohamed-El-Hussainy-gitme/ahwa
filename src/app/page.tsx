import { redirect } from "next/navigation";

export default function Home() {
  // Route groups like (app) are not part of the URL.
  redirect("/dashboard");
}
