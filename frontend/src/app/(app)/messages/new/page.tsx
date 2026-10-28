"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Composer } from "@/components/messages/composer";
import { ErrorState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function NewMessage() {
  const { can, me } = useAuth();
  const sp = useSearchParams();
  const people = (sp.get("people") ?? "").split(",").filter(Boolean);
  return (
    <div>
      <PageHeader title="New message" description="Write an email to people in your church." back={{ href: "/messages", label: "Messages" }} />
      {me && !can("comms.send") ? <ErrorState error={new ApiError(403, {})} /> : <Composer initialPersonIds={people} />}
    </div>
  );
}

export default function NewMessagePage() {
  return (
    <Suspense>
      <NewMessage />
    </Suspense>
  );
}
