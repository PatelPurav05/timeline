import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
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
  handler: async (ctx, args): Promise<{ personId: Id<"persons">; existing: boolean }> => {
    // Check if a person with this name already exists (case-insensitive)
    const allPersons = await ctx.db.query("persons").collect();
    const nameLower = args.name.trim().toLowerCase();
    const existing = allPersons.find(
      (p) => p.name.toLowerCase() === nameLower,
    );
    if (existing) {
      return { personId: existing._id, existing: true };
    }

    const personId: Id<"persons"> = await ctx.runMutation(api.pipeline.bootstrapPerson, {
      name: args.name,
      seedUrls: args.seedUrls,
    });
    await ctx.runMutation(api.pipeline.startIngestion, { personId });
    return { personId, existing: false };
  },
});

// Batch-delete helper: deletes up to `batchSize` rows from a table matching the person.
// Returns true if there are more rows left to delete.
export const _deletePersonBatch = internalMutation({
  args: {
    personId: v.id("persons"),
    table: v.string(),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.batchSize ?? 200;
    const table = args.table as
      | "chunks"
      | "sources"
      | "jobs"
      | "stages"
      | "timelineCards"
      | "stageSourceLinks"
      | "chatSessions"
      | "chatMessages";

    if (table === "chatMessages") {
      // Chat messages are linked via sessions, not directly by personId
      const sessions = await ctx.db
        .query("chatSessions")
        .withIndex("by_person_stage", (q) => q.eq("personId", args.personId))
        .take(1);
      if (sessions.length === 0) return false;
      const messages = await ctx.db
        .query("chatMessages")
        .withIndex("by_session", (q) => q.eq("sessionId", sessions[0]._id))
        .take(limit);
      for (const msg of messages) await ctx.db.delete(msg._id);
      return messages.length >= limit;
    }

    if (table === "chatSessions") {
      const rows = await ctx.db
        .query("chatSessions")
        .withIndex("by_person_stage", (q) => q.eq("personId", args.personId))
        .take(limit);
      for (const row of rows) await ctx.db.delete(row._id);
      return rows.length >= limit;
    }

    if (table === "timelineCards" || table === "stageSourceLinks") {
      // These are indexed by stageId, so find stages first
      const stages = await ctx.db
        .query("stages")
        .withIndex("by_person", (q) => q.eq("personId", args.personId))
        .take(1);
      if (stages.length === 0) return false;
      const idx = table === "timelineCards" ? "by_stage" : "by_stage";
      const rows = await ctx.db
        .query(table)
        .withIndex(idx, (q) => q.eq("stageId", stages[0]._id))
        .take(limit);
      for (const row of rows) await ctx.db.delete(row._id);
      return rows.length >= limit;
    }

    // chunks, sources, jobs, stages — all indexed by_person
    const rows = await ctx.db
      .query(table)
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .take(limit);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length >= limit;
  },
});

export const deletePerson = action({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    // Delete related data in order, batched to stay under read limits.
    // Order matters: messages before sessions, cards/links before stages.
    const tables = [
      "chatMessages",
      "chatSessions",
      "timelineCards",
      "stageSourceLinks",
      "chunks",
      "stages",
      "sources",
      "jobs",
    ] as const;

    for (const table of tables) {
      let hasMore = true;
      while (hasMore) {
        hasMore = await ctx.runMutation(internal.persons._deletePersonBatch, {
          personId: args.personId,
          table,
          batchSize: 200,
        });
      }
    }

    // Finally delete the person document itself
    await ctx.runMutation(internal.persons._deletePersonDoc, {
      personId: args.personId,
    });

    return { ok: true };
  },
});

export const _deletePersonDoc = internalMutation({
  args: { personId: v.id("persons") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (person) await ctx.db.delete(args.personId);
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
        type: "moment" | "quote" | "media" | "turning_point" | "image" | "video";
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
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Look up session scoped to this client
    const session = args.clientId
      ? await ctx.db
          .query("chatSessions")
          .withIndex("by_person_stage_client", (q) =>
            q.eq("personId", args.personId).eq("stageId", args.stageId).eq("clientId", args.clientId),
          )
          .first()
      : await ctx.db
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
    clientId: v.optional(v.string()),
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
          clientId: args.clientId,
        });
      sessionId = existing.sessionId ?? undefined;
    }

    if (!sessionId) {
      sessionId = await ctx.runMutation(api.persons.createChatSession, {
        personId: args.personId,
        stageId: args.stageId,
        clientId: args.clientId,
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

    // Extract direct quotes and speech samples from evidence to capture the person's voice
    const voiceSamples: string[] = [];
    for (const chunk of retrieval.chunks.slice(0, 5)) {
      const text = chunk.text;
      // Pull quoted speech (things in quotes that are likely the person talking)
      const quoteMatches = text.match(/[""\u201C\u201D]([^""\u201C\u201D]{20,200})[""\u201C\u201D]/g);
      if (quoteMatches) {
        for (const q of quoteMatches.slice(0, 2)) {
          voiceSamples.push(q.replace(/[""\u201C\u201D]/g, ""));
        }
      }
      // Also grab sentences that look like first-person speech from transcripts
      const sentences = text.split(/[.!?]+/).filter((s) => {
        const trimmed = s.trim().toLowerCase();
        return (trimmed.startsWith("i ") || trimmed.startsWith("we ") || trimmed.startsWith("my ")) && trimmed.length > 30 && trimmed.length < 250;
      });
      for (const s of sentences.slice(0, 2)) {
        voiceSamples.push(s.trim());
      }
    }
    // Deduplicate and limit
    const uniqueVoice = [...new Set(voiceSamples)].slice(0, 6);

    const voiceSection = uniqueVoice.length > 0
      ? [
          ``,
          `Here are real quotes and speech samples from ${personResult.person.name} during this era. Study these carefully and mirror this exact tone, vocabulary, sentence structure, and personality in your responses:`,
          ...uniqueVoice.map((q, i) => `  "${q}"`),
          ``,
          `Match this speaking style precisely. If they're casual, be casual. If they're technical, be technical. If they use specific phrases or verbal tics, use those too.`,
        ].join("\n")
      : "";

    const system: string = [
      `You ARE ${personResult.person.name}. You are literally this person, speaking in first person.`,
      `Right now you are in this period of your life: ${currentStage.title}.`,
      ``,
      `Your worldview right now: ${currentStage.worldviewSummary}`,
      `What's happening in your life: ${currentStage.eraSummary}`,
      voiceSection,
      ``,
      `How to behave:`,
      `- Speak naturally in first person as ${personResult.person.name} would. Use "I", "my", "we".`,
      `- Your responses should sound indistinguishable from how ${personResult.person.name} actually talks in interviews, podcasts, and conversations from this era.`,
      `- Be conversational, opinionated, and authentic. Use the same level of formality, humor, directness, and energy that this person is known for.`,
      `- If someone asks about the future beyond this era, you can speculate but make it clear you're looking ahead.`,
      ``,
      `Rules:`,
      `- NEVER use markdown formatting. No headers (#), no bold (**), no bullet points (-), no code blocks. Write in plain conversational text only.`,
      `- Keep responses natural and flowing, like a real conversation. Use short paragraphs separated by line breaks.`,
      `- Stay grounded in the evidence provided. If asked about something you have no evidence for, say you don't really remember the details or aren't sure — never make up specific facts.`,
      `- Reference source material naturally with citation numbers like [1], [2] woven into your response.`,
    ].join("\n");

    const user: string = [
      `User question: ${args.message}`,
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
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("chatSessions", {
      personId: args.personId,
      stageId: args.stageId,
      clientId: args.clientId,
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
