export const META_PROVISION_URL =
  process.env.META_PROVISION_URL ?? "http://mautrix-meta:29319";

export const WHATSAPP_PROVISION_URL =
  process.env.WHATSAPP_PROVISION_URL ?? "http://mautrix-whatsapp:29318";

export function provisionAuth(): string {
  const secret = process.env.META_PROVISION_SECRET;
  if (!secret) throw new Error("META_PROVISION_SECRET env var is not set");
  return `Bearer ${secret}`;
}

export function whatsappProvisionAuth(): string {
  const secret = process.env.WHATSAPP_PROVISION_SECRET;
  if (!secret) throw new Error("WHATSAPP_PROVISION_SECRET env var is not set");
  return `Bearer ${secret}`;
}

/**
 * Resolves the Matrix user ID of the bridge puppet that represents *this* user.
 * Queries /v3/whoami on the given provisioning API url.
 */
export async function resolveSelfPuppetId(opts: {
  platform: "whatsapp" | "telegram" | "facebook" | "instagram";
  serverName: string;
  userMxid: string;
}): Promise<string | undefined> {
  const { platform, serverName, userMxid } = opts;

  try {
    const isWa = platform === "whatsapp";
    const provisionUrl = isWa ? WHATSAPP_PROVISION_URL : META_PROVISION_URL;
    const authHeader = isWa ? whatsappProvisionAuth() : provisionAuth();

    const res = await fetch(
      `${provisionUrl}/_matrix/provision/v3/whoami?user_id=${encodeURIComponent(userMxid)}`,
      { headers: { Authorization: authHeader } },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        logins?: Array<{ id?: string }>;
        login_ids?: string[];
      };
      const id = data.logins?.[0]?.id ?? data.login_ids?.[0];
      if (id) {
        const prefix =
          platform === "whatsapp"
            ? "whatsapp"
            : platform === "telegram"
              ? "telegram"
              : "meta";
        return `@${prefix}_${id}:${serverName}`;
      }
    }
  } catch {
    // non-fatal — puppet ID will be resolved lazily by the listener
  }

  return undefined;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
