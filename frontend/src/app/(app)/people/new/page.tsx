"use client";

import { PersonForm } from "@/components/people/person-form";
import { PageHeader } from "@/components/ui/page";

export default function NewPersonPage() {
  return (
    <>
      <PageHeader title="Add a person" back={{ href: "/people", label: "People" }} description="Only first and last name are required. You can add more later." />
      <PersonForm />
    </>
  );
}
