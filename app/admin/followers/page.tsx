import type { Metadata } from "next";
import { AdminFollowers } from "@/components/admin-followers";

export const metadata: Metadata = {
  title: "Followers",
};

export default function AdminFollowersPage() {
  return <AdminFollowers />;
}
