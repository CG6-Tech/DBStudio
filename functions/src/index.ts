import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onRequest } from "firebase-functions/v2/https";
import { decideManifest, updaterJson } from "./releaseManifest";

if (getApps().length === 0) initializeApp();

function first(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

export const checkUpdate = onRequest({ region: "us-central1", cors: false, timeoutSeconds: 20, memory: "256MiB", maxInstances: 10 }, async (request, response) => {
  if (request.method !== "GET") {
    response.set("Allow", "GET").status(405).send("Method not allowed");
    return;
  }
  response.set("Cache-Control", "public, max-age=60, s-maxage=60");
  const updateRequest = {
    channel: first(request.query.channel),
    target: first(request.query.target),
    arch: first(request.query.arch),
    currentVersion: first(request.query.current_version),
  };
  const snapshot = await getFirestore().doc("releaseChannels/beta").get();
  const decision = decideManifest(updateRequest, snapshot.data());
  if (decision.kind === "bad-request") {
    response.status(400).json({ error: decision.message });
    return;
  }
  if (decision.kind === "current") {
    response.status(204).send();
    return;
  }
  const file = getStorage().bucket().file(decision.target.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    response.status(503).json({ error: "The update artifact is not ready." });
    return;
  }
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60_000 });
  response.status(200).json(updaterJson(decision, url));
});
