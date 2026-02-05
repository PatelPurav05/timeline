"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { StageChapter } from "@/components/StageChapter";
import { ChatPanel } from "@/components/ChatPanel";

type TimelineStage = {
  _id: Id<"stages">;
  personId: Id<"persons">;
  order: number;
  title: string;
  ageStart: number;
  ageEnd: number;
  dateStart: string;
  dateEnd: string;
  eraSummary: string;
  worldviewSummary: string;
  turningPoints: string[];
  confidence: number;
  createdAt: number;
};

type TimelineCard = {
  _id: Id<"timelineCards">;
  type: "moment" | "quote" | "media" | "turning_point" | "image" | "video";
  headline: string;
  body: string;
  mediaRef?: string;
  order: number;
};

type TimelineEntry = {
  stage: TimelineStage;
  cards: TimelineCard[];
};

export function TimelineScroller({
  personId,
  personName,
}: {
  personId: Id<"persons">;
  personName: string;
}) {
  const timeline = useQuery(api.persons.getTimeline, { personId }) as TimelineEntry[] | undefined;
  const [activeIndex, setActiveIndex] = useState(0);
  const chapterRefs = useRef<Map<number, HTMLElement>>(new Map());
  const tocRef = useRef<HTMLElement>(null);

  // Chat state
  const [chatStageId, setChatStageId] = useState<Id<"stages"> | null>(null);

  const setRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) {
        chapterRefs.current.set(index, el);
      } else {
        chapterRefs.current.delete(index);
      }
    },
    [],
  );

  // IntersectionObserver for active chapter tracking
  useEffect(() => {
    if (!timeline || timeline.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute("data-stage-index"));
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
            }
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );

    for (const [, el] of chapterRefs.current) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [timeline]);

  const scrollToChapter = (index: number) => {
    const el = chapterRefs.current.get(index);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (timeline === undefined) {
    return <TimelineSkeleton />;
  }

  if (timeline.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <div className="comic-panel p-8">
          <h2 className="text-balance text-3xl">No Stages Found</h2>
          <p className="mt-3 text-pretty text-base text-[var(--muted)]">
            The timeline was generated but no stages were produced. This may
            indicate low source coverage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
      {/* ── Sticky TOC Sidebar (desktop) ──────────── */}
      <nav
        ref={tocRef}
        aria-label="Timeline chapters"
        className="hidden lg:block"
      >
        <div className="sticky top-24">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
            Chapters
          </p>
          <ol className="mt-3 space-y-1" role="list">
            {timeline.map((entry, index) => {
              const ageLabel = `${entry.stage.ageStart}–${entry.stage.ageEnd}`;
              const titleParts = entry.stage.title.split(" - ");
              const shortTitle =
                titleParts.length > 1 ? titleParts.slice(1).join(" - ") : entry.stage.title;

              return (
                <li key={entry.stage._id}>
                  <button
                    onClick={() => scrollToChapter(index)}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                      index === activeIndex
                        ? "bg-[var(--accent)] font-semibold text-white"
                        : "hover:bg-[var(--panel)]",
                    )}
                  >
                    <span className="tabular-nums text-xs opacity-70">
                      {ageLabel}
                    </span>
                    <span className="mt-0.5 block truncate leading-tight">
                      {shortTitle}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>

      {/* ── Timeline Spine + Chapters ─────────────── */}
      <div className="timeline-spine pl-12 lg:pl-16">
        {timeline.map((entry, index) => (
          <StageChapter
            key={entry.stage._id}
            ref={setRef(index)}
            index={index}
            stage={entry.stage}
            cards={entry.cards}
            personId={personId}
            personName={personName}
            isActive={index === activeIndex}
            onOpenChat={() => setChatStageId(entry.stage._id)}
          />
        ))}
      </div>

      {/* ── Chat Panel (lazy import to keep bundle smaller) ── */}
      {chatStageId && (
        <ChatPanelWrapper
          personId={personId}
          personName={personName}
          stageId={chatStageId}
          stages={timeline.map((e) => e.stage)}
          onClose={() => setChatStageId(null)}
        />
      )}
    </div>
  );
}

function ChatPanelWrapper({
  personId,
  personName,
  stageId,
  stages,
  onClose,
}: {
  personId: Id<"persons">;
  personName: string;
  stageId: Id<"stages">;
  stages: Array<{ _id: Id<"stages">; title: string }>;
  onClose: () => void;
}) {
  const stage = stages.find((s) => s._id === stageId);
  return (
    <ChatPanel
      personId={personId}
      personName={personName}
      stageId={stageId}
      stageTitle={stage?.title ?? "Unknown Stage"}
      onClose={onClose}
    />
  );
}

function TimelineSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-5 py-12">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <div className="skeleton h-10 w-72" />
          <div className="skeleton h-32 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <div className="skeleton h-28" />
            <div className="skeleton h-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
