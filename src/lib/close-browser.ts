export async function closeBrowser(
  browser: { close(): Promise<void> } | undefined,
  timeout = 1000,
  onClosed?: () => void,
) {
  if (!browser) {
    onClosed?.();
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Keep cleanup running, but do not hide the original error behind a gateway timeout.
    await Promise.race([
      browser.close().finally(() => onClosed?.()),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeout);
      }),
    ]);
  } catch {
    // Closing an already-crashed browser must not replace the capture failure.
  } finally {
    if (timer) clearTimeout(timer);
  }
}
