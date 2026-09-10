"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import dynamic from "next/dynamic";
import { siteQr, QR_SIZE, QR_OFFSET } from "@/lib/qr";
import { readApiResponse } from "@/lib/api-response";
const AcrylicPreview = dynamic(() => import("@/components/acrylic-preview"), {
  ssr: false,
  loading: () => <p className="hint">3Dプレビューを準備中…</p>,
});
import { normalizeSiteUrl, PRINT_SIZE } from "@/lib/validation";

type Capture = {
  src: string;
  width: number;
  height: number;
  url: string;
  receipt: string;
};
export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [capture, setCapture] = useState<Capture | null>(null);
  const [texture, setTexture] = useState("");
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [background, setBackground] = useState("#f5f1e9");
  const [title, setTitle] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"capture" | "create" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    productUrl: string;
    message: string;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    panelRef.current?.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (!capture) return;
    let cancelled = false;
    const image = new Image();
    image.onload = async () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PRINT_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, PRINT_SIZE, PRINT_SIZE);
      const scale =
        fit === "contain"
          ? Math.min(PRINT_SIZE / image.width, PRINT_SIZE / image.height)
          : Math.max(PRINT_SIZE / image.width, PRINT_SIZE / image.height);
      const w = image.width * scale,
        h = image.height * scale;
      ctx.drawImage(image, (PRINT_SIZE - w) / 2, (PRINT_SIZE - h) / 2, w, h);
      try {
        const qr = new Image();
        qr.src = await siteQr(capture.url);
        await qr.decode();
        if (cancelled) return;
        ctx.drawImage(qr, QR_OFFSET, QR_OFFSET, QR_SIZE, QR_SIZE);
        setTexture(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled)
          setError(
            "QRコードを生成できませんでした。もう一度撮影してください。",
          );
      }
    };
    image.src = capture.src;
    return () => {
      cancelled = true;
    };
  }, [capture, fit, background]);

  async function takeScreenshot() {
    if (lock.current) return;
    setError("");
    let site: string;
    try {
      site = normalizeSiteUrl(url);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    lock.current = true;
    setBusy("capture");
    try {
      const response = await fetch("/api/screenshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: site }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await readApiResponse<Capture & { error?: string }>(
        response,
      );
      if (!response.ok) throw new Error(data.error || "撮影できませんでした。");
      setCapture(data);
      setStep(2);
      setTexture("");
      setConfirmed(false);
      setResult(null);
      setUncertain(false);
      if (!title)
        setTitle(`${new URL(site).hostname.split(".")[0]} のWebサイト`);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "撮影に時間がかかっています。少し待ってもう一度お試しください。",
      );
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  async function createProduct() {
    if (
      lock.current ||
      !capture ||
      !texture ||
      !confirmed ||
      result ||
      uncertain
    )
      return;
    lock.current = true;
    setBusy("create");
    setError("");
    let knownFailure = false;
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          src: capture.src,
          receipt: capture.receipt,
          fit,
          background,
          title,
          confirmed,
          publish: confirmed,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await readApiResponse<{
        productUrl: string;
        message: string;
        error?: string;
        uncertain?: boolean;
      }>(response);
      if (!response.ok) {
        knownFailure = true;
        setUncertain(!!data.uncertain);
        throw new Error(data.error || "商品を作成できませんでした。");
      }
      if (
        typeof data.productUrl !== "string" ||
        typeof data.message !== "string"
      )
        throw new Error("Invalid creation response");
      const target = new URL(data.productUrl);
      if (
        target.protocol !== "https:" ||
        target.hostname !== "suzuri.jp" ||
        target.pathname === "/"
      )
        throw new Error("Invalid product URL");
      setResult(data);
      window.location.assign(target.href);
    } catch (e) {
      if (!knownFailure || !(e instanceof Error)) {
        setUncertain(true);
        setError(
          "通信が途切れました。再作成の前にSUZURIで商品の有無を確認してください。",
        );
      } else setError(e.message);
    } finally {
      setBusy(null);
      lock.current = false;
    }
  }
  function resetDesign() {
    setConfirmed(false);
    setResult(null);
    setTexture("");
  }
  return (
    <main className="mobile-studio">
      <section
        className="preview-panel"
        aria-label="アクリルブロックのプレビュー"
      >
        <header className="studio-header">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <NextImage
                src="/brand/wo-logo.png"
                alt="w/o"
                width={108}
                height={54}
                loading="eager"
              />
            </span>
            <span>WEB / OBJECT</span>
          </Link>
          <span className="product-tag">アクリルブロック</span>
        </header>
        <AcrylicPreview src={texture} />
        {busy === "capture" && (
          <div className="capture-status" role="status">
            <span className="spinner" />
            サイトを撮影しています…
          </div>
        )}
      </section>
      <section className="control-panel" aria-label="かんたん3ステップ">
        <ol className="step-progress" aria-label="作成の手順">
          {(["URL", "デザイン", "作成"] as const).map((label, index) => (
            <li
              key={label}
              aria-current={step === index + 1 ? "step" : undefined}
              data-done={step > index + 1}
            >
              <span>{step > index + 1 ? "✓" : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <form
          className="step-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) void takeScreenshot();
            else if (step === 2 && texture) setStep(3);
            else if (step === 3) void createProduct();
          }}
        >
          <div className="step-content" ref={panelRef}>
            <h1 ref={headingRef} tabIndex={-1}>
              {step === 1
                ? "サイトを、飾ろう。"
                : step === 2
                  ? "好きな仕上がりに。"
                  : "あなただけのグッズに。"}
            </h1>
            {step === 1 && (
              <>
                <p className="step-description">
                  URLを入れるだけ。3ステップでグッズに。
                </p>
                <label htmlFor="site-url">公開したサイトのURL</label>
                <input
                  id="site-url"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  placeholder="your-site.lolipop-now.app"
                  value={url}
                  disabled={!!busy}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setCapture(null);
                    setTexture("");
                    setConfirmed(false);
                    setResult(null);
                    setError("");
                  }}
                />
                <p className="hint">*.lolipop-now.app の公開サイトに対応</p>
              </>
            )}
            {step === 2 && (
              <>
                <p className="step-description">
                  サイトへつながるQRコードも付いています。
                </p>
                <fieldset disabled={!!busy || !!result || uncertain}>
                  <legend>画像の配置</legend>
                  <div className="segmented">
                    <button
                      type="button"
                      aria-pressed={fit === "contain"}
                      onClick={() => {
                        if (fit !== "contain") {
                          resetDesign();
                          setFit("contain");
                        }
                      }}
                    >
                      全体を入れる
                    </button>
                    <button
                      type="button"
                      aria-pressed={fit === "cover"}
                      onClick={() => {
                        if (fit !== "cover") {
                          resetDesign();
                          setFit("cover");
                        }
                      }}
                    >
                      大きく見せる
                    </button>
                  </div>
                  <div className="color-row">
                    <span>余白の色</span>
                    <div className="swatches">
                      {[
                        { value: "#f5f1e9", label: "クリーム" },
                        { value: "#ffffff", label: "ホワイト" },
                        { value: "#202b27", label: "グリーン" },
                        { value: "#ed794e", label: "オレンジ" },
                      ].map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          aria-label={color.label}
                          aria-pressed={background === color.value}
                          style={{ background: color.value }}
                          onClick={() => {
                            if (background !== color.value) {
                              resetDesign();
                              setBackground(color.value);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </fieldset>
                {texture && (
                  <a
                    className="download"
                    href={texture}
                    download="web-object-1732.png"
                  >
                    画像を保存 ↓
                  </a>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <p className="step-description">
                  作成後、SUZURIの商品ページへ移動します。
                </p>
                <label htmlFor="title">作品名</label>
                <input
                  id="title"
                  maxLength={80}
                  value={title}
                  disabled={!!busy || !!result}
                  onChange={(e) => setTitle(e.target.value)}
                  enterKeyHint="done"
                />
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={!!busy || !!result}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    画像をグッズにする権利を持ち、SUZURIでの公開に同意します。
                  </span>
                </label>
                <p className="hint">
                  連携アカウントで公開。注文・支払いはSUZURIで。
                </p>
              </>
            )}
            <div aria-live="polite">
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              {uncertain && (
                <div className="notice">
                  <a href="https://suzuri.jp/" target="_blank" rel="noreferrer">
                    SUZURIで商品を確認 ↗
                  </a>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setUncertain(false);
                      setError("");
                    }}
                  >
                    未作成であることを確認しました
                  </button>
                </div>
              )}
              {result && (
                <div className="notice success">
                  <a href={result.productUrl}>作成した商品を開く ↗</a>
                </div>
              )}
            </div>
          </div>
          <div className="step-actions">
            {step > 1 && (
              <button
                type="button"
                className="back-button"
                disabled={!!busy}
                onClick={() => setStep(step === 3 ? 2 : 1)}
              >
                戻る
              </button>
            )}
            <button
              type="submit"
              className="primary"
              disabled={
                !!busy ||
                !!result ||
                uncertain ||
                (step === 1
                  ? !url.trim()
                  : step === 2
                    ? !texture
                    : !texture || !confirmed || !title.trim())
              }
            >
              {busy === "capture"
                ? "撮影中…"
                : busy === "create"
                  ? "作成中…"
                  : step === 1
                    ? "撮影して次へ"
                    : step === 2
                      ? "これで次へ"
                      : "SUZURIで作成する"}
              {!busy && <span>↗</span>}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
