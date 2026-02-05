"use client";

import { cn } from "@/lib/cn";
import { motion } from "motion/react";

type Job = {
  _id: string;
  phase: "discover" | "extract" | "stage" | "embed" | "publish";
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  error?: string;
};

const PHASE_META: Record<
  Job["phase"],
  { label: string; description: string }
> = {
  discover: {
    label: "Discover",
    description: "Finding sources across the web",
  },
  extract: {
    label: "Extract",
    description: "Reading and parsing full content",
  },
  stage: {
    label: "Stage",
    description: "Generating life-era stages via LLM",
  },
  embed: {
    label: "Embed",
    description: "Chunking and embedding text",
  },
  publish: {
    label: "Publish",
    description: "Building timeline cards",
  },
};

const PHASE_ORDER: Job["phase"][] = [
  "discover",
  "extract",
  "stage",
  "embed",
  "publish",
];

export function ProgressTracker({
  jobs,
  personName,
}: {
  jobs: Job[];
  personName: string;
}) {
  const jobMap = new Map(jobs.map((j) => [j.phase, j]));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="comic-panel p-6 sm:p-8"
    >
      <p className="text-sm font-semibold uppercase text-[var(--muted)]">
        Building Timeline
      </p>
      <h2 className="chapter-header mt-2 text-balance text-4xl sm:text-5xl">
        {personName}
      </h2>

      <div className="mt-8 space-y-4" role="list" aria-label="Pipeline progress">
        {PHASE_ORDER.map((phase, index) => {
          const job = jobMap.get(phase);
          const meta = PHASE_META[phase];
          const status = job?.status ?? "queued";
          const progress = job?.progress ?? 0;

          return (
            <div
              key={phase}
              role="listitem"
              className={cn(
                "flex items-start gap-4 rounded-xl border-2 p-4 transition-colors",
                status === "running"
                  ? "border-[var(--accent)] bg-white"
                  : status === "done"
                    ? "border-[var(--success)] bg-white"
                    : status === "failed"
                      ? "border-red-500 bg-red-50"
                      : "border-[var(--frame)] border-opacity-20 bg-[var(--paper)]",
              )}
            >
              {/* Step Number */}
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                  status === "done"
                    ? "border-[var(--success)] bg-[var(--success)] text-white"
                    : status === "running"
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : status === "failed"
                        ? "border-red-500 text-red-500"
                        : "border-[var(--muted)] text-[var(--muted)]",
                )}
              >
                {status === "done" ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 7L5.5 10L11.5 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{meta.label}</span>
                  {status === "running" && (
                    <span className="tabular-nums text-sm text-[var(--accent)]">
                      {progress}%
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-pretty text-sm text-[var(--muted)]">
                  {status === "failed" && job?.error
                    ? job.error
                    : meta.description}
                </p>

                {/* Progress Bar */}
                {status === "running" && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--paper)]">
                    <motion.div
                      className="h-full rounded-full bg-[var(--accent)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-pretty text-center text-sm text-[var(--muted)]">
        This page updates automatically. Timeline will appear when ready.
      </p>
    </motion.div>
  );
}
