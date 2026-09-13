// Also embedded verbatim in the generated native viewer; keep this self-contained.
export async function waitForDesktopEngine(invoke, {
  isCurrent = () => true, fetchImpl = globalThis.fetch,
  timeoutMs = 20000, pollMs = 150, requestMs = 2000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (isCurrent() && Date.now() < deadline) {
    const controller = new AbortController();
    let timer;
    let timedOut = false;
    try {
      const ready = await Promise.race([
        (async () => {
          const token = await invoke("take_viewer_token");
          if (!isCurrent() || !/^[a-fA-F0-9]{64}$/.test(token)) return false;
          const response = await fetchImpl("http://127.0.0.1:4814/", {
            headers: { Authorization: "Bearer " + token }, signal: controller.signal,
            cache: "no-store", redirect: "error",
          });
          return response.ok && (await response.json()).state === "serving";
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error("Engine readiness request timed out")); },
            Math.min(requestMs, Math.max(1, deadline - Date.now())));
        }),
      ]);
      if (ready && isCurrent()) return;
    } catch {
      // Do not retry a stalled IPC call: its host worker may still own admission.
      if (timedOut) throw new Error("Engine readiness request timed out");
    } finally { clearTimeout(timer); controller.abort(); }
    if (isCurrent()) await new Promise(resolve => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
  }
  throw new Error(isCurrent() ? "Engine did not become ready" : "Engine startup cancelled");
}
