import type { Metadata } from "next";
import { AdminTrades } from "@/components/admin-trades";

export const metadata: Metadata = {
  title: "Trades",
};

export default function AdminTradesRoute() {
  return <AdminTrades />;
}
