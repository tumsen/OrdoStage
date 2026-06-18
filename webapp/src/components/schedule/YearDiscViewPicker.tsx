import { useState } from "react";
import { CopyPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { YearDiscSavedView } from "@/components/schedule/yearDiscViews";

const triggerClass =
  "h-8 w-[min(10rem,32vw)] shrink-0 border-white/10 bg-white/5 text-xs text-white [&>span]:truncate";

type NameDialogMode = "save-as" | "rename" | null;

export function YearDiscViewPicker({
  views,
  activeViewId,
  onSelect,
  onSaveAs,
  onRename,
  onDelete,
}: {
  views: YearDiscSavedView[];
  activeViewId: string;
  onSelect: (viewId: string) => void;
  onSaveAs: (name: string) => void;
  onRename: (viewId: string, name: string) => void;
  onDelete: (viewId: string) => void;
}) {
  const [dialogMode, setDialogMode] = useState<NameDialogMode>(null);
  const [nameInput, setNameInput] = useState("");
  const canDelete = views.length > 1;

  function openSaveAs() {
    setNameInput("New view");
    setDialogMode("save-as");
  }

  function openRename() {
    const active = views.find((v) => v.id === activeViewId);
    setNameInput(active?.name ?? "");
    setDialogMode("rename");
  }

  function closeDialog() {
    setDialogMode(null);
    setNameInput("");
  }

  function submitDialog() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    if (dialogMode === "save-as") onSaveAs(trimmed);
    if (dialogMode === "rename") onRename(activeViewId, trimmed);
    closeDialog();
  }

  return (
    <>
      <Select value={activeViewId} onValueChange={onSelect}>
        <SelectTrigger className={triggerClass} aria-label="Disc view">
          <SelectValue placeholder="Disc view" />
        </SelectTrigger>
        <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
          {views.map((view) => (
            <SelectItem key={view.id} value={view.id} className="text-xs">
              {view.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-white/50 hover:text-white hover:bg-white/5"
            aria-label="Disc view actions"
          >
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="bg-[#16161f] border-white/10 text-white">
          <DropdownMenuItem className="text-xs focus:bg-white/10 focus:text-white" onClick={openSaveAs}>
            <CopyPlus size={14} className="mr-2 opacity-70" />
            Save as new view…
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs focus:bg-white/10 focus:text-white" onClick={openRename}>
            <Pencil size={14} className="mr-2 opacity-70" />
            Rename view…
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-white/10" />
          <DropdownMenuItem
            className="text-xs text-red-300 focus:bg-red-950/40 focus:text-red-200"
            disabled={!canDelete}
            onClick={() => onDelete(activeViewId)}
          >
            <Trash2 size={14} className="mr-2 opacity-70" />
            Delete view
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogMode === "rename" ? "Rename disc view" : "Save disc view"}</DialogTitle>
            <DialogDescription className="text-white/50">
              {dialogMode === "rename"
                ? "Choose a name for this saved layout."
                : "Save the current rings, range, and filters as a new view."}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitDialog();
            }}
            autoFocus
            className="border-white/10 bg-white/5 text-white"
            placeholder="View name"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" className="text-white/60 hover:text-white" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="button" className="bg-white/10 text-white hover:bg-white/15" onClick={submitDialog}>
              {dialogMode === "rename" ? "Rename" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
