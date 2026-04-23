import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signOut } from "@/lib/auth-client";
import { usePreferences } from "@/hooks/usePreferences";
import type { DistanceUnit, Language, TimeFormat } from "@/lib/preferences";
import { useI18n } from "@/lib/i18n";
import type { Person, PersonDocument } from "../../../backend/src/types";
import { confirmDeleteAction } from "@/lib/deleteConfirm";

const CONFIRM_PHRASE = "DELETE";

async function uploadPersonPhoto(personId: string, file: File): Promise<void> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(`${baseUrl}/api/people/${personId}/photo`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!resp.ok) throw new Error("Could not upload image.");
}

async function uploadPersonDocument(
  personId: string,
  file: File,
  name: string,
  type: string
): Promise<void> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name.trim() || file.name);
  formData.append("type", type.trim() || "other");
  const resp = await fetch(`${baseUrl}/api/people/${personId}/documents`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!resp.ok) throw new Error("Could not upload document.");
}

export default function Account() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effective, isLoading } = usePreferences();
  const { t } = useI18n();

  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prefsError, setPrefsError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("other");

  const { data: mePerson } = useQuery<Person | null>({
    queryKey: ["people", "me"],
    queryFn: () => api.get<Person | null>("/api/people/me"),
  });

  const { data: myDocs } = useQuery<PersonDocument[]>({
    queryKey: ["people", mePerson?.id, "documents"],
    queryFn: () => api.get<PersonDocument[]>(`/api/people/${mePerson!.id}/documents`),
    enabled: Boolean(mePerson?.id),
  });

  const [profileDraft, setProfileDraft] = useState<{
    name: string;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }>({
    name: "",
    phone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  const updatePrefsMutation = useMutation({
    mutationFn: (body: Partial<{ language: Language; timeFormat: TimeFormat; distanceUnit: DistanceUnit }>) =>
      api.patch<{ ok: boolean }>("/api/preferences", body),
    onSuccess: () => {
      setPrefsError("");
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: (e: unknown) => {
      if (isApiError(e)) setPrefsError(e.message);
      else setPrefsError(t("account.savePrefError"));
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!mePerson) return;
      await api.put(`/api/people/${mePerson.id}`, {
        name: profileDraft.name.trim(),
        phone: profileDraft.phone.trim() || undefined,
        emergencyContactName: profileDraft.emergencyContactName.trim() || undefined,
        emergencyContactPhone: profileDraft.emergencyContactPhone.trim() || undefined,
      });
      if (photoFile) await uploadPersonPhoto(mePerson.id, photoFile);
      if (docFile) await uploadPersonDocument(mePerson.id, docFile, docName, docType);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      if (mePerson?.id) queryClient.invalidateQueries({ queryKey: ["people", mePerson.id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setPhotoFile(null);
      setDocFile(null);
      setDocName("");
      setDocType("other");
      setProfileMessage("Profile saved.");
    },
    onError: (e: Error) => {
      setProfileMessage(e.message || "Could not save profile.");
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: () => api.delete(`/api/people/${mePerson!.id}/photo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      setProfileMessage("Image deleted.");
    },
    onError: () => setProfileMessage("Could not delete image."),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/people/documents/${docId}`),
    onSuccess: () => {
      if (mePerson?.id) queryClient.invalidateQueries({ queryKey: ["people", mePerson.id, "documents"] });
    },
  });

  useEffect(() => {
    if (!mePerson) return;
    setProfileDraft({
      name: mePerson.name ?? "",
      phone: mePerson.phone ?? "",
      emergencyContactName: mePerson.emergencyContactName ?? "",
      emergencyContactPhone: mePerson.emergencyContactPhone ?? "",
    });
  }, [mePerson?.id]);

  async function onDeleteAccount() {
    setError("");
    if (phrase !== CONFIRM_PHRASE) {
      setError(t("account.phraseError", { phrase: CONFIRM_PHRASE }));
      return;
    }
    setLoading(true);
    try {
      await api.delete<undefined>("/api/me/account", {
        body: JSON.stringify({ phrase: CONFIRM_PHRASE }),
        headers: { "Content-Type": "application/json" },
      });
      await signOut();
      navigate("/login");
    } catch (e: unknown) {
      if (isApiError(e)) {
        setError(e.message);
      } else {
        setError(t("account.deleteError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-white">{t("account.title")}</h2>
        <p className="text-sm text-white/45 mt-1">{t("account.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">{t("account.preferencesTitle")}</p>
          <p className="text-xs text-white/50 mt-1">
            {t("account.preferencesHint")}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.language")}</Label>
            <Select
              value={effective?.language ?? "en"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ language: value as Language })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="en">{t("common.english")}</SelectItem>
                <SelectItem value="da">{t("common.danish")}</SelectItem>
                <SelectItem value="de">{t("common.german")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.timeFormat")}</Label>
            <Select
              value={effective?.timeFormat ?? "24h"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ timeFormat: value as TimeFormat })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="24h">{t("common.clock24")}</SelectItem>
                <SelectItem value="12h">{t("common.clock12")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.distance")}</Label>
            <Select
              value={effective?.distanceUnit ?? "km"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ distanceUnit: value as DistanceUnit })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="km">{t("common.kilometers")}</SelectItem>
                <SelectItem value="mi">{t("common.miles")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {prefsError ? <p className="text-xs text-red-400">{prefsError}</p> : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">My profile</p>
          <p className="text-xs text-white/50 mt-1">
            Edit your person profile, image, and personal documents here.
          </p>
        </div>
        {!mePerson ? (
          <p className="text-xs text-white/40">
            No linked person profile found for your email in this organization yet.
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Name</Label>
                <Input
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, name: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Phone</Label>
                <Input
                  value={profileDraft.phone}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, phone: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Emergency contact name</Label>
                <Input
                  value={profileDraft.emergencyContactName}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, emergencyContactName: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Emergency contact phone</Label>
                <Input
                  value={profileDraft.emergencyContactPhone}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, emergencyContactPhone: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Profile image</Label>
                {mePerson.hasPhoto ? (
                  <img
                    src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${mePerson.id}/photo?ts=${mePerson.photoUpdatedAt ?? ""}`}
                    alt="Profile"
                    className="h-24 w-24 rounded-md object-cover border border-white/10"
                  />
                ) : null}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="bg-white/5 border-white/10 text-white file:text-white"
                />
                {mePerson.hasPhoto ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/15 text-white/70"
                    disabled={removePhotoMutation.isPending}
                    onClick={() => {
                      if (!confirmDeleteAction("profile image")) return;
                      removePhotoMutation.mutate();
                    }}
                  >
                    {removePhotoMutation.isPending ? "Deleting..." : "Delete image"}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Documents</Label>
                <Input
                  placeholder="Document name"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
                <Input
                  placeholder="Document type (passport, certificate, etc)"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
                <Input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  className="bg-white/5 border-white/10 text-white file:text-white"
                />
                {myDocs && myDocs.length > 0 ? (
                  <div className="rounded border border-white/10 divide-y divide-white/5">
                    {myDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                        <div className="min-w-0">
                          <div className="text-white/80 truncate">{doc.name}</div>
                          <div className="text-white/35 truncate">{doc.type} · {doc.filename}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={`${import.meta.env.VITE_BACKEND_URL || ""}/api/people/documents/${doc.id}/download`}
                            className="text-blue-300 hover:text-blue-200"
                          >
                            Download
                          </a>
                          <button
                            type="button"
                            className="text-red-300 hover:text-red-200"
                            onClick={() => {
                              if (!confirmDeleteAction(`document "${doc.name}"`)) return;
                              deleteDocMutation.mutate(doc.id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {profileMessage ? <p className="text-xs text-white/60">{profileMessage}</p> : null}
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-600"
              disabled={saveProfileMutation.isPending}
              onClick={() => saveProfileMutation.mutate()}
            >
              {saveProfileMutation.isPending ? "Saving..." : "Save profile"}
            </Button>
          </>
        )}
      </div>

      <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-5 space-y-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">{t("account.deleteTitle")}</p>
            <p className="text-xs text-white/50 leading-relaxed">
              {t("account.deleteHint")}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delete-phrase" className="text-white/70 text-xs uppercase tracking-wide">
            {t("account.typeConfirm", { phrase: CONFIRM_PHRASE })}
          </Label>
          <Input
            id="delete-phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
          />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button
          type="button"
          variant="destructive"
          className="w-full bg-red-900 hover:bg-red-800"
          disabled={loading || phrase !== CONFIRM_PHRASE}
          onClick={onDeleteAccount}
        >
          {loading ? t("account.deleting") : t("account.deleteCta")}
        </Button>
      </div>
    </div>
  );
}
