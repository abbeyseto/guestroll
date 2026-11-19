import { NextResponse } from "next/server";
import { createEvent, getEventById, toAdminEvent } from "@/lib/events";
import { apiError, readJson, requireAdmin } from "@/lib/http";
import { parseEventInput } from "@/lib/validation";

const EVENTUS_ALBUM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates the album reserved by Eventus using its stable claim id. Repeating
 * the request is safe: a previous successful provision is simply returned.
 */
export async function POST(request: Request) {
  const { denied } = await requireAdmin(request, { owner: true });
  if (denied) return denied;

  const body = await readJson(request);
  const id = typeof body === "object" && body !== null ? (body as Record<string, unknown>).id : undefined;
  if (typeof id !== "string" || !EVENTUS_ALBUM_ID.test(id)) {
    return apiError("bad_request", { id: "Expected a UUID" });
  }

  const existing = getEventById(id);
  if (existing) return NextResponse.json({ event: toAdminEvent(existing) });

  const parsed = parseEventInput(body, false);
  if (!parsed.ok) return apiError("bad_request", parsed.errors);
  const event = createEvent({ ...parsed.value, id, name: parsed.value.name! });
  return NextResponse.json({ event: toAdminEvent(event) }, { status: 201 });
}
