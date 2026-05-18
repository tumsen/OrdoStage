import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, CalendarRange, ChevronRight } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/hooks/usePreferences";

export type AnnouncementBarPayload = {
  nextAssignedJob: {
    id: string;
    title: string;
    jobDate: string;
    startTime: string;
    eventId: string;
    showId: string;
    eventTitle: string;
    venueName: string | null;
  } | null;
  nextOrgShow: {
    showId: string;
    eventId: string;
    eventTitle: string;
    showDate: string;
    showTime: string;
    venueName: string | null;
    status: string;
  } | null;
};

function formatWhen(
  isoDate: string,
  timeHHmm: string,
  locale: string,
  hour12: boolean
): string {
  const day = new Date(isoDate);
  if (!Number.isFinite(day.getTime())) return timeHHmm;
  const [hh, mm] = timeHHmm.split(":").map((x) => Number(x));
  const d = new Date(day);
  if (Number.isFinite(hh) && Number.isFinite(mm)) d.setHours(hh, mm, 0, 0);
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
}

/**
 * Global strip: your next assigned show job (matched by your account email on the crew record) + next upcoming show in the org.
 */
export function WorkAnnouncementBar() {
  const { data: session } = useSession();
  const { effective } = usePreferences();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  const locale =
    effective?.language === "da"
      ? "da-DK"
      : effective?.language === "de"
        ? "de-DE"
        : "en-US";
  const hour12 = effective?.timeFormat === "12h";

  const { data } = useQuery({
    queryKey: ["me", "announcement-bar"],
    queryFn: () => api.get<AnnouncementBarPayload>("/api/me/announcement-bar"),
    enabled: Boolean(session?.user && orgId),
    staleTime: 45_000,
  });

  if (!orgId || !data) return null;

  const { nextAssignedJob, nextOrgShow } = data;
  const hasJob = Boolean(nextAssignedJob);
  const hasShow = Boolean(nextOrgShow);

  if (!hasJob && !hasShow) {
    return null;
  }

  return (
    <div
      className="flex-shrink-0 border-b border-teal-500/25 bg-gradient-to-r from-teal-950/50 via-[#0d0d14] to-indigo-950/40 px-3 py-2.5"
      role="region"
      aria-label="Upcoming work and shows"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2 sm:gap-6 text-sm">
        {hasJob && nextAssignedJob ? (
          <Link
            to={`/events/${nextAssignedJob.eventId}`}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 -my-1",
              "text-teal-100/95 hover:bg-white/5 transition-colors min-w-0"
            )}
          >
            <Briefcase size={15} className="text-teal-400 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="text-white/50 text-xs uppercase tracking-wide mr-2">Your next job</span>
              <span className="font-medium text-white">{nextAssignedJob.title}</span>
              <span className="text-white/55"> · {nextAssignedJob.eventTitle}</span>
              <span className="text-white/45 text-xs sm:text-sm hidden sm:inline">
                {" "}
                — {formatWhen(nextAssignedJob.jobDate, nextAssignedJob.startTime, locale, hour12)}
                {nextAssignedJob.venueName ? ` · ${nextAssignedJob.venueName}` : ""}
              </span>
              <span className="text-white/45 text-xs sm:hidden">
                {" "}
                — {formatWhen(nextAssignedJob.jobDate, nextAssignedJob.startTime, locale, hour12)}
              </span>
            </span>
            <ChevronRight size={14} className="text-white/25 shrink-0 hidden sm:block" aria-hidden />
          </Link>
        ) : null}

        {hasJob && hasShow ? (
          <span className="hidden sm:block w-px h-5 bg-white/15 shrink-0" aria-hidden />
        ) : null}

        {hasShow && nextOrgShow ? (
          <Link
            to={`/events/${nextOrgShow.eventId}`}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 -my-1",
              "text-indigo-100/95 hover:bg-white/5 transition-colors min-w-0"
            )}
          >
            <CalendarRange size={15} className="text-indigo-400 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="text-white/50 text-xs uppercase tracking-wide mr-2">Next show</span>
              <span className="font-medium text-white">{nextOrgShow.eventTitle}</span>
              <span className="text-white/45 text-xs sm:text-sm hidden sm:inline">
                {" "}
                — {formatWhen(nextOrgShow.showDate, nextOrgShow.showTime, locale, hour12)}
                {nextOrgShow.venueName ? ` · ${nextOrgShow.venueName}` : ""}
              </span>
              <span className="text-white/45 text-xs sm:hidden">
                {" "}
                — {formatWhen(nextOrgShow.showDate, nextOrgShow.showTime, locale, hour12)}
              </span>
              {nextOrgShow.status === "draft" ? (
                <span className="ml-1.5 text-[10px] uppercase px-1.5 py-px rounded bg-ordo-yellow/25 text-ordo-yellow border border-ordo-yellow/40">
                  Draft
                </span>
              ) : null}
              {nextOrgShow.status === "confirmed" ? (
                <span className="ml-1.5 text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/50">
                  Confirmed
                </span>
              ) : null}
            </span>
            <ChevronRight size={14} className="text-white/25 shrink-0 hidden sm:block" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
