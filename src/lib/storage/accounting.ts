import "server-only";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { events, photos } from "@/lib/db/schema";
import { storage } from ".";

/**
 * Legacy events predate stored-byte accounting. Their photo files are listed
 * once after the upgrade, then all later reads use the persisted counter.
 */
export async function ensureEventStoredBytes(eventId: string): Promise<number> {
  const event = getDb()
    .select({ storedBytes: events.storedBytes })
    .from(events)
    .where(eq(events.id, eventId))
    .get();
  if (!event) return 0;
  if (event.storedBytes !== null) return event.storedBytes;

  const photoIds = new Set(
    getDb()
      .select({ id: photos.id })
      .from(photos)
      .where(eq(photos.eventId, eventId))
      .all()
      .map(({ id }) => id),
  );
  const bytesByPhoto = new Map<string, number>();
  for await (const file of storage().list(eventId + "/")) {
    const photoId = file.key.split("/", 2)[1]?.split(".", 1)[0];
    if (photoId && photoIds.has(photoId)) {
      bytesByPhoto.set(photoId, (bytesByPhoto.get(photoId) ?? 0) + file.size);
    }
  }
  const storedBytes = [...bytesByPhoto.values()].reduce((total, bytes) => total + bytes, 0);
  getDb().transaction((tx) => {
    for (const [photoId, bytes] of bytesByPhoto) {
      tx.update(photos).set({ storedBytes: bytes }).where(eq(photos.id, photoId)).run();
    }
    tx.update(events).set({ storedBytes }).where(eq(events.id, eventId)).run();
  });
  return storedBytes;
}

/** Runs after startup for pre-accounting events; it never runs in a gallery request. */
export async function reconcileLegacyEventStorage(): Promise<void> {
  const legacyEvents = getDb()
    .select({ id: events.id })
    .from(events)
    .where(isNull(events.storedBytes))
    .all();
  for (const event of legacyEvents) await ensureEventStoredBytes(event.id);
}
