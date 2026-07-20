import { doc, runTransaction, serverTimestamp, type DocumentData } from "firebase/firestore";
import type { SafeDiagnostics } from "./diagnostics";
import { anonymousFeedbackUser, feedbackFirestore } from "./firebaseClient";

export type FeedbackCategory = "bug" | "idea" | "question" | "other";
export interface FeedbackSubmission { category: FeedbackCategory; message: string; contactEmail?: string; diagnostics?: SafeDiagnostics }

export const MAX_FEEDBACK_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;

export function validateFeedback(value: FeedbackSubmission): string | null {
  const message = value.message.trim();
  if (!message) return "Please enter your feedback.";
  if (message.length < 10) return "Please add a little more detail (at least 10 characters).";
  if (message.length > 4000) return "Feedback must be 4,000 characters or fewer.";
  if (value.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail)) return "Enter a valid contact email or leave it blank.";
  return null;
}

export interface RateState { count: number; windowStartedAtMs: number; feedbackIds: string[] }
export function nextRateState(current: RateState | null, nowMs: number, feedbackId: string): RateState {
  if (!current || nowMs - current.windowStartedAtMs >= WINDOW_MS) return { count: 1, windowStartedAtMs: nowMs, feedbackIds: [feedbackId] };
  if (current.count >= MAX_FEEDBACK_PER_HOUR) throw new Error("You’ve reached the feedback limit. Please try again in about an hour.");
  return { count: current.count + 1, windowStartedAtMs: current.windowStartedAtMs, feedbackIds: [...current.feedbackIds, feedbackId] };
}

export async function submitFeedback(value: FeedbackSubmission): Promise<string> {
  const validation = validateFeedback(value);
  if (validation) throw new Error(validation);
  const user = await anonymousFeedbackUser();
  const db = feedbackFirestore();
  const feedbackId = crypto.randomUUID();
  const feedbackRef = doc(db, "feedback", feedbackId);
  const rateRef = doc(db, "feedbackRateLimits", user.uid);
  const nowMs = Date.now();
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(rateRef);
    const raw = snapshot.data() as DocumentData | undefined;
    const current = raw ? { count: Number(raw.count), windowStartedAtMs: raw.windowStartedAt?.toMillis?.() ?? 0, feedbackIds: Array.isArray(raw.feedbackIds) ? raw.feedbackIds : [] } : null;
    const next = nextRateState(current, nowMs, feedbackId);
    transaction.set(rateRef, {
      ownerUid: user.uid,
      count: next.count,
      windowStartedAt: next.windowStartedAtMs === nowMs ? serverTimestamp() : raw?.windowStartedAt,
      updatedAt: serverTimestamp(),
      feedbackIds: next.feedbackIds,
    });
    transaction.set(feedbackRef, {
      ownerUid: user.uid,
      category: value.category,
      message: value.message.trim(),
      contactEmail: value.contactEmail?.trim() || null,
      diagnostics: value.diagnostics || null,
      createdAt: serverTimestamp(),
    });
  });
  return feedbackId;
}
