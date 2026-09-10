export type ScreenshotStage =
  "prepare" | "launch" | "context" | "navigate" | "capture";

export class ScreenshotError extends Error {
  readonly code: string;
  constructor(stage: ScreenshotStage, cause: unknown) {
    const messages = {
      prepare:
        "撮影用ブラウザーを準備できませんでした。管理者にお問い合わせください。",
      launch:
        "撮影用ブラウザーを起動できませんでした。管理者にお問い合わせください。",
      context:
        "撮影用画面を作成できませんでした。管理者にお問い合わせください。",
      navigate:
        "サイトを表示できませんでした。公開URLとリダイレクト先を確認してください。",
      capture:
        "サイトの画像を作成できませんでした。時間をおいて再度お試しください。",
    };
    super(messages[stage], { cause });
    this.name = "ScreenshotError";
    // Expose only fixed diagnostic codes, never raw browser errors or target URLs.
    const message = cause instanceof Error ? cause.message : "";
    const reason =
      /error while loading shared libraries|cannot open shared object/i.test(
        message,
      )
        ? "MISSING_LIBRARY"
        : /ENOENT|Executable doesn't exist|input directory.*does not exist/i.test(
              message,
            )
          ? "MISSING_FILE"
          : /EACCES|Permission denied/i.test(message)
            ? "PERMISSION"
            : /Cannot find module|ERR_MODULE_NOT_FOUND/i.test(message)
              ? "MISSING_MODULE"
              : /Timeout|timed out/i.test(message)
                ? "TIMEOUT"
                : "FAILED";
    this.code = `SCREENSHOT_${stage.toUpperCase()}_${reason}`;
  }
}
