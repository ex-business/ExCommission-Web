/** 只在当前浏览器会话保存摘要与幂等键，不保存命令载荷。 */
export async function commandKey(
  subject: string,
  operation: string,
  payload: string,
): Promise<string> {
  const fingerprint = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(subject + "\n" + operation + "\n" + payload),
      ),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const storageKey = "ec-command-v1:" + subject + ":" + operation;
  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    if (
      previous?.fingerprint === fingerprint &&
      typeof previous.key === "string"
    )
      return previous.key;
  } catch {}
  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
  } catch {}
  return key;
}
