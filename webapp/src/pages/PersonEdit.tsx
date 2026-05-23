import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { useSession } from "@/lib/auth-client";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
import type { AutoSaveStatus as AutoSaveStatusType } from "@/hooks/useAutoSave";
import { PersonFormDialog } from "./People";

export default function PersonEdit() {
  const queryClient = useQueryClient();
  const { id: personId = "" } = useParams<{ id: string }>();
  const [autoSaveState, setAutoSaveState] = useState<{
    status: AutoSaveStatusType;
    error: string | null;
  }>({ status: "idle", error: null });
  const { canWrite } = usePermissions();
  const { data: session } = useSession();

  const {
    data: person,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["people", personId],
    queryFn: () => api.get<Person>(`/api/people/${personId}`),
    enabled: Boolean(personId),
  });

  if (!personId) {
    return <Navigate to="/people" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col gap-6 p-6">
        <Skeleton className="h-9 w-48 bg-white/5" />
        <Skeleton className="h-64 w-full rounded-xl border border-white/10 bg-white/5" />
        <Skeleton className="h-40 w-full rounded-xl border border-white/10 bg-white/5" />
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center gap-4">
        <p className="text-red-400 text-sm">Could not load this person.</p>
        <Button asChild variant="outline" className="border-white/10 bg-white/5 text-white">
          <Link to="/people">Back to people</Link>
        </Button>
      </div>
    );
  }

  const sessionEmail = session?.user?.email?.toLowerCase() ?? null;
  const personEmail = person.email?.toLowerCase() ?? null;
  const canEditPerson =
    canWrite || Boolean(sessionEmail && personEmail && sessionEmail === personEmail);

  if (!canEditPerson) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center gap-4 max-w-md mx-auto">
        <p className="text-white/50 text-sm">
          You do not have permission to edit this person.
        </p>
        <Button asChild variant="outline" className="border-white/10 bg-white/5 text-white">
          <Link to="/people">Back to people</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/10 px-6 py-4">
        <div className="flex items-start gap-3">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="shrink-0 h-9 w-9 text-white/50 hover:text-white mt-0.5"
          >
            <Link to="/people" aria-label="Back to people">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">Edit person</h1>
            <p className="text-sm text-white/40 mt-0.5">{person.name}</p>
            <AutoSaveStatus
              status={autoSaveState.status}
              error={autoSaveState.error}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <PersonFormDialog
        asPage
        person={person}
        onAutoSaveState={setAutoSaveState}
        onPersonUpdated={(updated) => {
          queryClient.setQueryData(["people", personId], updated);
        }}
      />
    </div>
  );
}
