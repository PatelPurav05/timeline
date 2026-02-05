"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "timeline-atlas-client-id";

function generateId(): string {
  // crypto.randomUUID is available in all modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a stable, persistent client ID stored in localStorage.
 * Same browser = same ID across tabs and sessions.
 * Different browser or incognito = different ID = fresh chat threads.
 */
export function useClientId(): string {
  const [clientId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  });

  return clientId;
}
