import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminArea } from "@/components/admin-area";

// Private area: keep every admin route out of search indexes.
export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminArea>{children}</AdminArea>;
}
