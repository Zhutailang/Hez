import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "APIhezdevkey";
const LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET || "hez_dev_secret_change_me_in_production";
export const LIVEKIT_URL = process.env.LIVEKIT_URL || "ws://localhost:7880";

export async function createRoomToken(opts: {
  roomName: string;
  identity: string;
  displayName: string;
}): Promise<string> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
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
