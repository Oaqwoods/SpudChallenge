import type { Metadata } from "next";
import { BroadcastCenter } from "@/components/broadcast-center";

export const metadata: Metadata = {
  title: "Email Broadcasts",
};

// Static hosting has no dynamic routes, so the broadcast id travels as a
// query parameter: /admin/emails/?id=<uuid>
export default function AdminEmailsPage() {
  return <BroadcastCenter />;
}
