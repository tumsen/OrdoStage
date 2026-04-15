import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit2, Trash2, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PersonFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
});

type PersonFormValues = z.infer<typeof PersonFormSchema>;

function PersonRow({ person, onDelete }: { person: Person; onDelete: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(PersonFormSchema),
    values: {
      name: person.name,
      role: person.role ?? "",
      email: person.email ?? "",
      phone: person.phone ?? "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: PersonFormValues) => {
      const payload = {
        name: data.name,
        role: data.role || undefined,
        email: data.email || undefined,
        phone: data.phone || undefined,
      };
      return api.put(`/api/people/${person.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setEditing(false);
    },
  });

  if (editing) {
    return (
      <tr className="border-b border-white/5">
        <td className="px-5 py-3">
          <Input {...form.register("name")} className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30" />
        </td>
        <td className="px-5 py-3 hidden sm:table-cell">
          <Input {...form.register("role")} className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30" />
        </td>
        <td className="px-5 py-3 hidden md:table-cell">
          <Input {...form.register("email")} type="email" className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30" />
        </td>
        <td className="px-5 py-3 hidden lg:table-cell">
          <Input {...form.register("phone")} className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30" />
        </td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
              onClick={form.handleSubmit((v) => updateMutation.mutate(v))}
              disabled={updateMutation.isPending}
            >
              <Check size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-white"
              onClick={() => setEditing(false)}
            >
              <X size={13} />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-white/5 group hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-3.5 text-sm font-medium text-white/90">{person.name}</td>
      <td className="px-5 py-3.5 text-sm text-white/50 hidden sm:table-cell">{person.role ?? "—"}</td>
      <td className="px-5 py-3.5 text-sm text-white/50 hidden md:table-cell">{person.email ?? "—"}</td>
      <td className="px-5 py-3.5 text-sm text-white/50 hidden lg:table-cell">{person.phone ?? "—"}</td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/30 hover:text-white"
            onClick={() => setEditing(true)}
          >
            <Edit2 size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/30 hover:text-red-400"
            onClick={() => onDelete(person.id)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AddPersonForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(PersonFormSchema),
    defaultValues: { name: "", role: "", email: "", phone: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: PersonFormValues) => {
      const payload = {
        name: data.name,
        role: data.role || undefined,
        email: data.email || undefined,
        phone: data.phone || undefined,
      };
      return api.post<Person>("/api/people", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      form.reset();
      onSuccess();
    },
  });

  return (
    <tr className="border-t border-white/10 bg-white/[0.02]">
      <td className="px-5 py-3">
        <Input
          {...form.register("name")}
          placeholder="Full name *"
          className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
        />
        {form.formState.errors.name && (
          <p className="text-red-400 text-xs mt-1">{form.formState.errors.name.message}</p>
        )}
      </td>
      <td className="px-5 py-3 hidden sm:table-cell">
        <Input
          {...form.register("role")}
          placeholder="Role"
          className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
        />
      </td>
      <td className="px-5 py-3 hidden md:table-cell">
        <Input
          {...form.register("email")}
          type="email"
          placeholder="email@example.com"
          className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
        />
        {form.formState.errors.email && (
          <p className="text-red-400 text-xs mt-1">{form.formState.errors.email.message}</p>
        )}
      </td>
      <td className="px-5 py-3 hidden lg:table-cell">
        <Input
          {...form.register("phone")}
          placeholder="Phone"
          className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
        />
      </td>
      <td className="px-5 py-3">
        <Button
          size="sm"
          onClick={form.handleSubmit((v) => createMutation.mutate(v))}
          disabled={createMutation.isPending}
          className="bg-red-900 hover:bg-red-800 text-white border-red-700/50 h-8 gap-1.5"
        >
          <Plus size={13} />
          {createMutation.isPending ? "Adding..." : "Add"}
        </Button>
      </td>
    </tr>
  );
}

export default function People() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: people, isLoading, error } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/people/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/40">Contacts and crew for your events.</p>
        <Button
          size="sm"
          onClick={() => setShowAddForm(true)}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2"
        >
          <Plus size={14} /> Add Person
        </Button>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide">Name</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden sm:table-cell">Role</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden md:table-cell">Email</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden lg:table-cell">Phone</th>
              <th className="px-5 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8">
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full bg-white/5" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-red-400 text-sm">
                  Failed to load people.
                </td>
              </tr>
            ) : (people ?? []).length === 0 && !showAddForm ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-white/30 text-sm">
                  No contacts yet.
                </td>
              </tr>
            ) : (
              (people ?? []).map((person) => (
                <PersonRow key={person.id} person={person} onDelete={setDeleteId} />
              ))
            )}
            {showAddForm && (
              <AddPersonForm onSuccess={() => setShowAddForm(false)} />
            )}
          </tbody>
        </table>

        {!showAddForm && (people ?? []).length > 0 && (
          <div className="px-5 py-3 border-t border-white/5">
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1.5 transition-colors"
            >
              <Plus size={12} /> Add another person
            </button>
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete person?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              This will permanently delete the contact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
