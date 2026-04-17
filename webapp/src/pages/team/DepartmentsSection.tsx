import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, Check, X } from "lucide-react";
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
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface Department {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

const PRESET_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
            value === color ? "border-white/80 scale-110" : "border-transparent"
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

interface DeptRowProps {
  dept: Department;
  canWrite: boolean;
  onDelete: (id: string, name: string) => void;
}

function DeptRow({ dept, canWrite, onDelete }: DeptRowProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const [color, setColor] = useState(dept.color);

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/api/departments/${dept.id}`, { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setEditing(false);
    },
  });

  if (editing) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 flex items-center gap-3 flex-wrap">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-white/5 border-white/10 text-white h-7 text-sm w-40 focus:border-white/30"
          />
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !name.trim()}
          >
            <Check size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/30 hover:text-white"
            onClick={() => { setEditing(false); setName(dept.name); setColor(dept.color); }}
          >
            <X size={13} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 group hover:bg-white/[0.02] transition-colors">
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: dept.color }}
      />
      <span className="flex-1 text-sm text-white/80">{dept.name}</span>
      {canWrite ? (
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
            onClick={() => onDelete(dept.id, dept.name)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AddDeptForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const createMutation = useMutation({
    mutationFn: () => api.post<Department>("/api/departments", { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      onDone();
    },
  });

  return (
    <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02] space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Department name"
          className="bg-white/5 border-white/10 text-white h-8 text-sm w-48 placeholder:text-white/25 focus:border-white/30"
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) createMutation.mutate(); }}
          autoFocus
        />
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
          className="bg-red-900 hover:bg-red-800 text-white border-red-700/50 h-7 text-xs gap-1.5"
        >
          <Plus size={12} />
          {createMutation.isPending ? "Adding..." : "Add"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDone}
          className="h-7 text-xs text-white/40 hover:text-white"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface DepartmentsSectionProps {
  canWrite: boolean;
}

export function DepartmentsSection({ canWrite }: DepartmentsSectionProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: departments, isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/departments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setDeleteTarget(null);
    },
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Teams</h2>
          <p className="text-xs text-white/30 mt-0.5">Organise people into one or more teams</p>
        </div>
        {canWrite ? (
          <Button
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 h-8"
          >
            <Plus size={13} /> Add Team
          </Button>
        ) : null}
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full bg-white/5" />
            ))}
          </div>
        ) : (departments ?? []).length === 0 && !showAddForm ? (
          <div className="px-4 py-8 text-center text-white/30 text-sm">
            No teams yet.
          </div>
        ) : (
          <>
            {(departments ?? []).map((dept) => (
              <DeptRow
                key={dept.id}
                dept={dept}
                canWrite={canWrite}
                onDelete={(id, name) => setDeleteTarget({ id, name })}
              />
            ))}
          </>
        )}

        {showAddForm ? (
          <AddDeptForm onDone={() => setShowAddForm(false)} />
        ) : canWrite && (departments ?? []).length > 0 ? (
          <div className="px-4 py-3 border-t border-white/5">
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1.5 transition-colors"
            >
              <Plus size={12} /> Add another team
            </button>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      >
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              "{deleteTarget?.name}" will be permanently deleted. People in this team will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
