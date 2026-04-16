import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus, Edit2, Trash2, Phone, Mail, MapPin, ShieldAlert, User
} from "lucide-react";
import { api } from "@/lib/api";
import type { Person } from "../../../backend/src/types";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Form schema ───────────────────────────────────────────────────────────────

const PRESET_ROLES = ["Tour Manager", "Actor", "Tech"] as const;

const PersonFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  rolePreset: z.string().optional(),
  roleCustom: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

type PersonFormValues = z.infer<typeof PersonFormSchema>;

function resolveRole(values: PersonFormValues): string | undefined {
  if (!values.rolePreset || values.rolePreset === "") return undefined;
  if (values.rolePreset === "other") return values.roleCustom || undefined;
  return values.rolePreset;
}

function roleToFormValues(role: string | null): { rolePreset: string; roleCustom: string } {
  if (!role) return { rolePreset: "", roleCustom: "" };
  if ((PRESET_ROLES as readonly string[]).includes(role)) return { rolePreset: role, roleCustom: "" };
  return { rolePreset: "other", roleCustom: role };
}

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  "Tour Manager": "bg-purple-900/40 text-purple-300 border-purple-700/30",
  "Actor": "bg-red-900/40 text-red-300 border-red-700/30",
  "Tech": "bg-blue-900/40 text-blue-300 border-blue-700/30",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-white/25 text-xs">—</span>;
  const cls = ROLE_COLORS[role] ?? "bg-white/5 text-white/50 border-white/10";
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {role}
    </span>
  );
}

// ── Person form dialog ────────────────────────────────────────────────────────

function PersonFormDialog({
  open,
  onOpenChange,
  person,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  person?: Person;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();

  const { rolePreset: defaultPreset, roleCustom: defaultCustom } = roleToFormValues(person?.role ?? null);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(PersonFormSchema),
    values: person
      ? {
          name: person.name,
          rolePreset: defaultPreset,
          roleCustom: defaultCustom,
          email: person.email ?? "",
          phone: person.phone ?? "",
          address: person.address ?? "",
          emergencyContactName: person.emergencyContactName ?? "",
          emergencyContactPhone: person.emergencyContactPhone ?? "",
        }
      : {
          name: "",
          rolePreset: "",
          roleCustom: "",
          email: "",
          phone: "",
          address: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
        },
  });

  const rolePreset = form.watch("rolePreset");

  const mutation = useMutation({
    mutationFn: (values: PersonFormValues) => {
      const payload = {
        name: values.name,
        role: resolveRole(values),
        email: values.email || undefined,
        phone: values.phone || undefined,
        address: values.address || undefined,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
      };
      return person
        ? api.put(`/api/people/${person.id}`, payload)
        : api.post<Person>("/api/people", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      onOpenChange(false);
      form.reset();
      onSuccess?.();
    },
  });

  function handleSubmit(values: PersonFormValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle>{person ? "Edit Person" : "Add Person"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Name + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Name *</Label>
              <Input
                {...form.register("name")}
                placeholder="Full name"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
              {form.formState.errors.name ? (
                <p className="text-red-400 text-xs">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Role</Label>
              <Controller
                control={form.control}
                name="rolePreset"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      {PRESET_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                      <SelectItem value="other">Other...</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Custom role input */}
          {rolePreset === "other" ? (
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Custom Role</Label>
              <Input
                {...form.register("roleCustom")}
                placeholder="e.g. Sound Engineer, Driver..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
            </div>
          ) : null}

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Email</Label>
              <Input
                {...form.register("email")}
                type="email"
                placeholder="email@example.com"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
              {form.formState.errors.email ? (
                <p className="text-red-400 text-xs">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Phone</Label>
              <Input
                {...form.register("phone")}
                placeholder="+47 000 00 000"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs uppercase tracking-wide">Address</Label>
            <Input
              {...form.register("address")}
              placeholder="Street, City, Country"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
            />
          </div>

          {/* Emergency contact */}
          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <ShieldAlert size={11} className="text-amber-400/60" /> Emergency Contact
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                {...form.register("emergencyContactName")}
                placeholder="Contact name"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
              <Input
                {...form.register("emergencyContactPhone")}
                placeholder="Contact phone"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-white/60 hover:text-white bg-transparent"
          >
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={form.handleSubmit(handleSubmit)}
            className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
          >
            {mutation.isPending ? "Saving..." : person ? "Save Changes" : "Add Person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Person card (list item) ───────────────────────────────────────────────────

function PersonCard({
  person,
  onEdit,
  onDelete,
}: {
  person: Person;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-4 border-b border-white/5 group hover:bg-white/[0.02] transition-colors">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <User size={15} className="text-white/30" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white/90">{person.name}</span>
          <RoleBadge role={person.role} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
          {person.email ? (
            <a href={`mailto:${person.email}`} className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors">
              <Mail size={10} />{person.email}
            </a>
          ) : null}
          {person.phone ? (
            <a href={`tel:${person.phone}`} className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors">
              <Phone size={10} />{person.phone}
            </a>
          ) : null}
          {person.address ? (
            <span className="text-xs text-white/30 flex items-center gap-1">
              <MapPin size={10} />{person.address}
            </span>
          ) : null}
        </div>
        {(person.emergencyContactName || person.emergencyContactPhone) ? (
          <div className="mt-1 text-xs text-white/25 flex items-center gap-1.5">
            <ShieldAlert size={10} className="text-amber-400/40" />
            Emergency: {[person.emergencyContactName, person.emergencyContactPhone].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-white" onClick={onEdit}>
          <Edit2 size={13} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-red-400" onClick={onDelete}>
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function People() {
  const [addOpen, setAddOpen] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <p className="text-sm text-white/40">Cast, crew and contacts.</p>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2"
        >
          <Plus size={14} /> Add Person
        </Button>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg bg-white/5" />)}
          </div>
        ) : error ? (
          <div className="py-10 text-center text-red-400 text-sm">Failed to load people.</div>
        ) : (people ?? []).length === 0 ? (
          <div className="py-12 text-center">
            <User size={24} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No contacts yet.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
              className="mt-3 border-white/10 text-white/50 hover:text-white gap-2"
            >
              <Plus size={13} /> Add first person
            </Button>
          </div>
        ) : (
          <div>
            {(people ?? []).map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                onEdit={() => setEditPerson(person)}
                onDelete={() => setDeleteId(person.id)}
              />
            ))}
            <div className="px-5 py-3 border-t border-white/5">
              <button
                onClick={() => setAddOpen(true)}
                className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1.5 transition-colors"
              >
                <Plus size={12} /> Add another person
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add dialog */}
      <PersonFormDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Edit dialog */}
      {editPerson ? (
        <PersonFormDialog
          open={!!editPerson}
          onOpenChange={(v) => { if (!v) setEditPerson(null); }}
          person={editPerson}
        />
      ) : null}

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete person?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              This will permanently delete the contact and remove them from all tours and events.
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
