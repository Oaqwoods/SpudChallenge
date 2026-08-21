import type { Metadata } from "next";
import { AdminSettings } from "@/components/admin-settings";

export const metadata: Metadata = {
  title: "Launch Controls",
};

export default function AdminSettingsPage() {
  return <AdminSettings />;
}
