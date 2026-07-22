import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { getServerSettings } from "./settings.js";

/** @deprecated prefer getLivekitUrl() — kept for log compatibility at boot */
export function getLivekitUrl(): string {
  return getServerSettings().livekitUrl;
}

export async function createRoomToken(opts: {
  roomName: string;
  identity: string;
  displayName: string;
}): Promise<string> {
  const { livekitApiKey, livekitApiSecret } = getServerSettings();
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: opts.identity,
    name: opts.displayName,
    ttl: "2h",
  });

  token.addGrant({
    roomJoin: true,
    room: opts.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}

/**
 * Get participant count for a LiveKit room.
 * Returns 0 if the room doesn't exist or has no participants.
 */
export async function getRoomParticipantCount(roomName: string): Promise<number> {
  try {
    const { livekitUrl, livekitApiKey, livekitApiSecret } = getServerSettings();
    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) return 0;
    const svc = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
    const participants = await svc.listParticipants(roomName);
    return participants.length;
  } catch {
    // Room may not exist on LiveKit yet
    return 0;
  }
}

/**
 * Get participant counts for multiple LiveKit rooms in parallel.
 * Returns a map of roomName → count.
 */
export async function getRoomParticipantCounts(
  roomNames: string[],
): Promise<Record<string, number>> {
  const { livekitUrl, livekitApiKey, livekitApiSecret } = getServerSettings();
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret || roomNames.length === 0) {
    return {};
  }
  const svc = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
  const results = await Promise.allSettled(
    roomNames.map(async (name) => {
      const participants = await svc.listParticipants(name);
      return { name, count: participants.length };
    }),
  );
  const map: Record<string, number> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      map[r.value.name] = r.value.count;
    }
  }
  return map;
}
