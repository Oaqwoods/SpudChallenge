import type { Metadata } from "next";
import { AdminOfferDetail } from "@/components/admin-offer-detail";

export const metadata: Metadata = {
  title: "Offer Detail",
};

// Static hosting has no dynamic routes, so the offer id travels as a query
// parameter: /admin/offers/?id=<uuid>
export default function AdminOfferDetailPage() {
  return <AdminOfferDetail />;
}
