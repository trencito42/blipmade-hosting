/**
 * A browser identifier for the check on free services. It is loaded only when a free order is activated, so
 * no other page pays for it. The server treats it as untrusted, stores only a keyed hash of it, and a missing
 * identifier changes nothing, so any failure here is swallowed.
 */
export async function browserId(): Promise<string | undefined> {
  try {
    const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
    const agent = await FingerprintJS.load();
    const result = await Promise.race([
      agent.get(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    return result?.visitorId;
  } catch {
    return undefined;
  }
}
