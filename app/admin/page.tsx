import type { Metadata } from "next";
import { AdminHome } from "@/components/admin-home";

export const metadata: Metadata = {
  title: "Admin Dashboard",
};

export default function AdminPage() {
  return <AdminHome />;
}
