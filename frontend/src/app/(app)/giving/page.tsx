"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { DonationDialog } from "@/components/giving/donation-dialog";
import { DonationsTab } from "@/components/giving/donations";
import { FundsTab } from "@/components/giving/funds";
import { GiftAidTab } from "@/components/giving/gift-aid";
import { GivingOverview, useGivingSummary } from "@/components/giving/overview";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "donations", label: "Donations" },
  { value: "funds", label: "Funds" },
  { value: "gift-aid", label: "Gift Aid" },
];

export default function GivingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Giving />
    </Suspense>
  );
}

function Giving() {
  const { can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = TABS.some((t) => t.value === sp.get("tab")) ? sp.get("tab")! : "overview";
  const [year, setYear] = useState(new Date().getFullYear());
  const [recordOpen, setRecordOpen] = useState(false);
  // The summary carries the church's currency; it's cached and shared with the overview tab.
  const { data: summary } = useGivingSummary(new Date().getFullYear());
  const currency = summary?.currency ?? "GBP";

  const setTab = (v: string) => router.replace(v === "overview" ? pathname : `${pathname}?tab=${v}`, { scroll: false });

  return (
    <div>
      <PageHeader
        title="Giving"
        description="Donations, funds and Gift Aid. Giving records are confidential and only visible to people with giving access."
        actions={
          can("giving.manage") ? (
            <Button onClick={() => setRecordOpen(true)}>
              <Plus className="h-4 w-4" />
              Record donation
            </Button>
          ) : undefined
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList items={TABS} className="mb-6" />
        <TabsContent value="overview">
          <GivingOverview year={year} onYear={setYear} />
        </TabsContent>
        <TabsContent value="donations">
          <DonationsTab currency={currency} />
        </TabsContent>
        <TabsContent value="funds">
          <FundsTab currency={currency} />
        </TabsContent>
        <TabsContent value="gift-aid">
          <GiftAidTab currency={currency} />
        </TabsContent>
      </Tabs>
      <DonationDialog open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  );
}
