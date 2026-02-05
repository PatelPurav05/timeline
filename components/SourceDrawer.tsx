"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { motion } from "motion/react";

type StageSource = {
  id: Id<"sources">;
  title: string;
  url: string;
  type: "article" | "video" | "post" | "interview" | "other";
  publishedAt?: string;
  relevance: number;
  rationale: string;
  preview: string;
};

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  video: "Video",
  post: "Post",
  interview: "Interview",
  other: "Source",
};

export function SourceDrawer({
  personId,
  stageId,
}: {
  personId: Id<"persons">;
  stageId: Id<"stages">;
}) {
  const sources = useQuery(api.persons.getStageSources, { personId, stageId }) as StageSource[] | undefined;

  if (sources === undefined) {
    return (
      <div className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-16 w-full" />
        ))}
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="mt-4 rounded-xl border-2 border-dashed border-[var(--frame)] p-6 text-center"
      >
        <p className="text-pretty text-sm text-[var(--muted)]">
          No sources linked to this stage.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="mt-4 space-y-3"
      role="list"
      aria-label="Linked sources"
    >
      {sources.map((source) => (
        <div
          key={source.id}
          role="listitem"
          className="comic-panel flex items-start gap-3 p-4"
        >
          {/* Source type badge */}
          <span className="source-badge shrink-0">
            {TYPE_LABELS[source.type] ?? source.type}
          </span>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-1 text-sm font-semibold underline decoration-[var(--accent)] decoration-1 underline-offset-2 transition hover:text-[var(--accent)]"
            >
              {source.title}
            </a>

            {source.publishedAt && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {source.publishedAt}
              </p>
            )}

            {source.preview && (
              <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-[var(--muted)]">
                {source.preview}
              </p>
            )}

            {/* Relevance bar */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-[var(--muted)]">Relevance</span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--paper)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.round(source.relevance * 100)}%` }}
                />
              </div>
              <span className="tabular-nums text-xs text-[var(--muted)]">
                {Math.round(source.relevance * 100)}%
              </span>
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}
