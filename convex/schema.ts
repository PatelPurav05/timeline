import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  persons: defineTable({
    name: v.string(),
    slug: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    birthDate: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_created", ["createdAt"]),

  jobs: defineTable({
    personId: v.id("persons"),
    phase: v.union(
      v.literal("discover"),
      v.literal("extract"),
      v.literal("stage"),
      v.literal("embed"),
      v.literal("publish"),
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    progress: v.number(),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_person", ["personId"]),

  sources: defineTable({
    personId: v.id("persons"),
    url: v.string(),
    type: v.union(
      v.literal("article"),
      v.literal("video"),
      v.literal("post"),
      v.literal("interview"),
      v.literal("other"),
    ),
    title: v.string(),
    publishedAt: v.optional(v.string()),
    metadata: v.string(),
    rawText: v.optional(v.string()),
    transcriptText: v.optional(v.string()),
    qualityScore: v.number(),
    createdAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_person_url", ["personId", "url"]),

  stages: defineTable({
    personId: v.id("persons"),
    order: v.number(),
    title: v.string(),
    ageStart: v.number(),
    ageEnd: v.number(),
    dateStart: v.string(),
    dateEnd: v.string(),
    eraSummary: v.string(),
    worldviewSummary: v.string(),
    turningPoints: v.array(v.string()),
    confidence: v.number(),
    createdAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_person_order", ["personId", "order"]),

  chunks: defineTable({
    personId: v.id("persons"),
    sourceId: v.id("sources"),
    stageId: v.optional(v.id("stages")),
    text: v.string(),
    embedding: v.array(v.float64()),
    citation: v.string(),
    createdAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_stage", ["stageId"]),

  stageSourceLinks: defineTable({
    stageId: v.id("stages"),
    sourceId: v.id("sources"),
    relevance: v.number(),
    rationale: v.string(),
  })
    .index("by_stage", ["stageId"])
    .index("by_source", ["sourceId"]),

  timelineCards: defineTable({
    stageId: v.id("stages"),
    type: v.union(
      v.literal("moment"),
      v.literal("quote"),
      v.literal("media"),
      v.literal("turning_point"),
      v.literal("image"),
      v.literal("video"),
    ),
    headline: v.string(),
    body: v.string(),
    mediaRef: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_stage", ["stageId"]),

  chatSessions: defineTable({
    personId: v.id("persons"),
    stageId: v.id("stages"),
    clientId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_person_stage", ["personId", "stageId"])
    .index("by_person_stage_client", ["personId", "stageId", "clientId"]),

  chatMessages: defineTable({
    sessionId: v.id("chatSessions"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    citations: v.array(v.string()),
    usedFallback: v.boolean(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
});
