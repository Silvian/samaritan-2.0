"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { PersonForm } from "@/components/people/person-form";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { Person } from "@/lib/types";

export default function EditPersonPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useQuery({ queryKey: ["person", id], queryFn: () => api.get<Person>(`/people/${id}/`) });
  if (error) return <ErrorState error={error} />;
  if (!data) return <Skeleton className="h-96 max-w-4xl" />;
  return (
    <>
      <PageHeader title={`Edit ${data.full_name}`} back={{ href: `/people/${id}`, label: data.full_name }} />
      <PersonForm person={data} />
    </>
  );
}
