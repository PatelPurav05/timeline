import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function parseCitation(raw: string): { title?: string; url?: string } {
  try {
    return JSON.parse(raw) as { title?: string; url?: string };
  } catch {
    return {};
  }
}

export const createPerson = mutation({
  args: {
    name: v.string(),
    seedUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<{ personId: Id<"persons"> }> => {
    const personId: Id<"persons"> = await ctx.runMutation(api.pipeline.bootstrapPerson, {
      name: args.name,
      seedUrls: args.seedUrls,
    });
    await ctx.runMutation(api.pipeline.startIngestion, { personId });
    return { personId };
  },
});

export const reingestPerson = mutation({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    await ctx.runMutation(api.pipeline.startIngestion, { personId: args.personId });
    return { ok: true };
  },
});

export const listRecentPersons = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    return ctx.db.query("persons").withIndex("by_created").order("desc").take(limit);
  },
});

export const getPerson = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person) return null;

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();

    const orderedJobs = jobs.sort((a, b) => a.createdAt - b.createdAt);
    return { person, jobs: orderedJobs };
  },
});

export const getTimeline = query({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const stages = await ctx.db
      .query("stages")
      .withIndex("by_person_order", (q) => q.eq("personId", args.personId))
      .order("asc")
      .collect();

    const timeline = [] as Array<{
      stage: (typeof stages)[number];
      cards: Array<{
        _id: Id<"timelineCards">;
        type: "moment" | "quote" | "media" | "turning_point";
        headline: string;
        body: string;
        mediaRef?: string;
        order: number;
      }>;
    }>;

    for (const stage of stages) {
      const cards = await ctx.db
        .query("timelineCards")
        .withIndex("by_stage", (q) => q.eq("stageId", stage._id))
        .collect();

      timeline.push({
        stage,
        cards: cards
          .sort((a, b) => a.order - b.order)
          .map((card) => ({
            _id: card._id,
            type: card.type,
            headline: card.headline,
            body: card.body,
            mediaRef: card.mediaRef,
            order: card.order,
          })),
      });
    }

    return timeline;
  },
});

export const getStageSources = query({
  args: {
    personId: v.id("persons"),
    stageId: v.id("stages"),
  },
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage || stage.personId !== args.personId) return [];

    const links = await ctx.db
      .query("stageSourceLinks")
      .withIndex("by_stage", (q) => q.eq("stageId", args.stageId))
      .collect();

    const out: Array<{
      id: Id<"sources">;
      title: string;
      url: string;
      type: "article" | "video" | "post" | "interview" | "other";
      publishedAt?: string;
      relevance: number;
      rationale: string;
      preview: string;
    }> = [];

    for (const link of links.sort((a, b) => b.relevance - a.relevance)) {
      const source = await ctx.db.get(link.sourceId);
      if (!source) continue;
      out.push({
        id: source._id,
        title: source.title,
        url: source.url,
        type: source.type,
        publishedAt: source.publishedAt,
        relevance: link.relevance,
        rationale: link.rationale,
        preview: (source.rawText ?? source.transcriptText ?? source.metadata).slice(0, 260),
      });
    }

    return out;
  },
});

export const getChatSessionMessages = query({
  args: {
    personId: v.id("persons"),
    stageId: v.id("stages"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("chatSessions")
      .withIndex("by_person_stage", (q) =>
        q.eq("personId", args.personId).eq("stageId", args.stageId),
      )
      .first();

    if (!session) {
      return { sessionId: null, messages: [] as Array<unknown> };
    }

    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();

    return {
      sessionId: session._id,
      messages: messages.sort((a, b) => a.createdAt - b.createdAt),
    };
  },
});

type RetrievalChunk = {
  id: string;
  text: string;
  citation: string;
  score: number;
};

type RetrievalResult = {
  usedFallback: boolean;
  chunks: RetrievalChunk[];
};

type TimelineEntry = {
  stage: {
    _id: Id<"stages">;
    title: string;
    eraSummary: string;
    worldviewSummary: string;
    [key: string]: unknown;
  };
  cards: unknown[];
};

type ChatResult = {
  sessionId: Id<"chatSessions">;
  answer: string;
  citations: string[];
  usedFallback: boolean;
};

export const sendStageChat = action({
  args: {
    personId: v.id("persons"),
    stageId: v.id("stages"),
    message: v.string(),
    sessionId: v.optional(v.id("chatSessions")),
  },
  handler: async (ctx, args): Promise<ChatResult> => {
    const personResult: { person: { name: string }; jobs: unknown[] } | null =
      await ctx.runQuery(api.persons.getPerson, {
        personId: args.personId,
      });
    if (!personResult) throw new Error("Person not found");

    const timeline: TimelineEntry[] = await ctx.runQuery(api.persons.getTimeline, {
      personId: args.personId,
    });
    const currentStage = timeline.find(
      (entry: TimelineEntry) => entry.stage._id === args.stageId,
    )?.stage;
    if (!currentStage) throw new Error("Stage not found");

    let sessionId = args.sessionId;
    if (!sessionId) {
      const existing: { sessionId: Id<"chatSessions"> | null; messages: unknown[] } =
        await ctx.runQuery(api.persons.getChatSessionMessages, {
          personId: args.personId,
          stageId: args.stageId,
        });
      sessionId = existing.sessionId ?? undefined;
    }

    if (!sessionId) {
      sessionId = await ctx.runMutation(api.persons.createChatSession, {
        personId: args.personId,
        stageId: args.stageId,
      });
    }

    // At this point sessionId is guaranteed to be set
    const resolvedSessionId: Id<"chatSessions"> = sessionId!;

    await ctx.runMutation(api.persons.appendChatMessage, {
      sessionId: resolvedSessionId,
      role: "user" as const,
      content: args.message,
      citations: [],
      usedFallback: false,
    });

    const retrieval: RetrievalResult = await ctx.runAction(api.pipeline.scoreAndSelectChunks, {
      personId: args.personId,
      stageId: args.stageId,
      query: args.message,
      topK: 8,
    });

    const evidenceLines: string[] = retrieval.chunks.map(
      (chunk: RetrievalChunk, index: number) => {
        const citation = parseCitation(chunk.citation);
        return `${index + 1}. ${chunk.text.slice(0, 450)}\nsource: ${citation.title ?? "Unknown"} ${citation.url ?? ""}`;
      },
    );

    const system: string = [
      `You are answering as an analyst of ${personResult.person.name} during this stage: ${currentStage.title}.`,
      `Stay grounded in stage evidence first. If evidence is weak, explicitly say uncertainty.`,
      `Never invent first-person facts.`,
      `Use concise response style and include citations like [1], [2] that map to provided evidence.`,
    ].join("\n");

    const user: string = [
      `User question: ${args.message}`,
      `Stage summary: ${currentStage.eraSummary}`,
      `Worldview summary: ${currentStage.worldviewSummary}`,
      retrieval.usedFallback
        ? "Retrieval note: stage evidence was sparse; cross-stage fallback was used."
        : "Retrieval note: stage-scoped evidence only.",
      "Evidence:\n" + evidenceLines.join("\n\n"),
    ].join("\n\n");

    const answer: string = await ctx.runAction(api.llm.generateChatReply, {
      system,
      user,
    });

    const citations: string[] = retrieval.chunks
      .slice(0, 4)
      .map((chunk: RetrievalChunk) => parseCitation(chunk.citation))
      .map(
        (citation: { title?: string; url?: string }) =>
          `${citation.title ?? "Unknown"} — ${citation.url ?? ""}`,
      );

    await ctx.runMutation(api.persons.appendChatMessage, {
      sessionId: resolvedSessionId,
      role: "assistant" as const,
      content: answer,
      citations,
      usedFallback: retrieval.usedFallback,
    });

    return {
      sessionId: resolvedSessionId,
      answer,
      citations,
      usedFallback: retrieval.usedFallback,
    };
  },
});

export const createChatSession = mutation({
  args: {
    personId: v.id("persons"),
    stageId: v.id("stages"),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("chatSessions", {
      personId: args.personId,
      stageId: args.stageId,
      createdAt: Date.now(),
    });
  },
});

export const appendChatMessage = mutation({
  args: {
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citations: v.array(v.string()),
    usedFallback: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatMessages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      citations: args.citations,
      usedFallback: args.usedFallback,
      createdAt: Date.now(),
    });
  },
});
