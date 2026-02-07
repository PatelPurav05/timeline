"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { ProgressTracker } from "@/components/ProgressTracker";
import { TimelineScroller } from "@/components/TimelineScroller";

export default function PersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const personId = id as Id<"persons">;
  const data = useQuery(api.persons.getPerson, { personId });
  const reingest = useMutation(api.persons.reingestPerson);

  if (data === undefined) {
    return <PersonSkeleton />;
  }

  if (data === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-5">
        <div className="comic-panel max-w-md p-8 text-center">
          <h1 className="text-balance text-4xl">Person Not Found</h1>
          <p className="mt-3 text-pretty text-base text-[var(--muted)]">
            This timeline does not exist or may have been removed.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl border-2 border-[var(--frame)] bg-[var(--accent)] px-5 py-2.5 font-semibold text-white transition hover:translate-y-[-1px]"
          >
            Back to LORE
          </Link>
        </div>
      </main>
    );
  }

  const { person, jobs } = data;

  return (
    <main className="min-h-dvh">
      {/* ── Top Bar ─────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="sticky top-0 z-30 border-b-3 border-[var(--frame)] bg-[var(--panel)] px-5 py-3 sm:px-8"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold transition hover:bg-[var(--paper)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M10 12L6 8L10 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            LORE
          </Link>
          <div className="h-5 w-px bg-[var(--frame)] opacity-30" />
          <h1 className="truncate text-lg font-semibold">{person.name}</h1>
          <span
            className={cn(
              "ml-auto rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase",
              person.status === "ready" &&
                "border-[var(--success)] text-[var(--success)]",
              person.status === "processing" &&
                "border-[var(--warn)] text-[var(--warn)]",
              person.status === "failed" &&
                "border-red-600 text-red-600",
              person.status === "pending" &&
                "border-[var(--muted)] text-[var(--muted)]",
            )}
          >
            {person.status}
          </span>
        </div>
      </motion.header>

      {/* ── Processing State ────────────────────────── */}
      {(person.status === "pending" || person.status === "processing") && (
        <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
          <ProgressTracker jobs={jobs} personName={person.name} />
        </div>
      )}

      {/* ── Failed State ────────────────────────────── */}
      {person.status === "failed" && (() => {
        const PHASE_ORDER = ["discover", "extract", "stage", "embed", "publish"];
        const failedJob = jobs.find((j: { status: string }) => j.status === "failed");
        const lastDoneJob = [...jobs]
          .filter((j: { status: string }) => j.status === "done")
          .sort((a: { phase: string }, b: { phase: string }) =>
            PHASE_ORDER.indexOf(b.phase) - PHASE_ORDER.indexOf(a.phase)
          )[0];
        const resumePhase = failedJob
          ? (failedJob as { phase: string }).phase
          : lastDoneJob
            ? PHASE_ORDER[PHASE_ORDER.indexOf((lastDoneJob as { phase: string }).phase) + 1]
            : undefined;

        return (
          <div className="mx-auto max-w-lg px-5 py-16 text-center">
            <div className="comic-panel p-8">
              <h2 className="text-balance text-3xl">Timeline Generation Failed</h2>
              <p className="mt-3 text-pretty text-base text-[var(--muted)]">
                Something went wrong while building this timeline.
                {resumePhase && (
                  <> Failed during the <strong>{resumePhase}</strong> phase.</>
                )}
              </p>
              {(failedJob as { error?: string } | undefined)?.error && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {(failedJob as { error?: string }).error}
                </p>
              )}
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                {resumePhase && (
                  <button
                    onClick={() => reingest({ personId, fromPhase: resumePhase })}
                    className="rounded-xl border-2 border-[var(--frame)] bg-[var(--accent)] px-5 py-2.5 font-semibold text-white transition hover:translate-y-[-1px]"
                  >
                    Resume from {resumePhase}
                  </button>
                )}
                <button
                  onClick={() => reingest({ personId, fromPhase: "discover" })}
                  className="rounded-xl border-2 border-[var(--frame)] bg-[var(--panel)] px-5 py-2.5 font-semibold transition hover:translate-y-[-1px]"
                >
                  Retry from scratch
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Ready State → Timeline ──────────────────── */}
      {person.status === "ready" && (
        <TimelineScroller personId={personId} personName={person.name} />
      )}
    </main>
  );
}

function PersonSkeleton() {
  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b-3 border-[var(--frame)] bg-[var(--panel)] px-5 py-3 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <div className="skeleton h-5 w-12" />
          <div className="h-5 w-px bg-[var(--frame)] opacity-30" />
          <div className="skeleton h-5 w-40" />
          <div className="skeleton ml-auto h-5 w-16 rounded-full" />
        </div>
      </header>
      <div className="mx-auto max-w-2xl space-y-6 px-5 py-12">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-48 w-full" />
        <div className="skeleton h-48 w-full" />
      </div>
    </main>
  );
}
