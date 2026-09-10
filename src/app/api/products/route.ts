import { checkRequest, readJson, reply } from "@/lib/request";
import { verifyCapture, validateDesign, printTexture } from "@/lib/captures";
import {
  productPageUrl,
  type ItemVariant,
  type SuzuriProduct,
} from "@/lib/suzuri-product";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const invalid = checkRequest(request);
  if (invalid) return invalid;
  const token = process.env.SUZURI_API_KEY?.trim();
  if (!token)
    return reply({ error: "サーバーのSUZURI APIキーが未設定です。" }, 503);
  let payload;
  try {
    const body = await readJson(request, 3 * 1024 * 1024);
    const capture = verifyCapture(body.src, body.receipt);
    const design = validateDesign(body.fit, body.background);
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 80
    )
      throw new Error("作品名を80文字以内で入力してください。");
    if (body.confirmed !== true || body.publish !== true)
      throw new Error("仕上がりとSUZURIでの公開の確認が必要です。");
    payload = {
      url: capture.url,
      texture: await printTexture(capture, design),
      title: body.title.trim(),
    };
  } catch (error) {
    return reply(
      {
        error:
          error instanceof Error && !(error instanceof SyntaxError)
            ? error.message
            : "入力内容を確認してください。",
      },
      400,
    );
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  let creationStarted = false;
  try {
    const itemsResponse = await fetch("https://suzuri.jp/api/v1/items", {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!itemsResponse.ok) return apiError(itemsResponse.status);
    const items = await itemsResponse.json();
    const acrylic = items.items?.find(
      (item: { name: string; id: number }) => item.name === "acrylic-block",
    );
    if (!Number.isInteger(acrylic?.id))
      return reply(
        { error: "現在、SUZURIでアクリルブロックを取得できません。" },
        503,
      );
    const variants: ItemVariant[] = Array.isArray(acrylic.variants)
      ? acrylic.variants
      : [];
    const variant =
      variants.find(
        (v) => v.enabled !== false && v.exemplary && Number.isInteger(v.id),
      ) || variants.find((v) => v.enabled !== false && Number.isInteger(v.id));
    if (!variant)
      return reply(
        { error: "現在作成できるアクリルブロックのサイズ・色がありません。" },
        503,
      );
    const productConfig = {
      itemId: acrylic.id,
      exemplaryItemVariantId: variant.id,
      published: true,
      resizeMode: "contain",
    };
    creationStarted = true;
    const response = await fetch("https://suzuri.jp/api/v1/materials", {
      method: "POST",
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        title: payload.title,
        texture: payload.texture,
        description: `Webサイトをかたちに。\n${payload.url}`,
        price: 0,
        products: [productConfig],
      }),
    });
    if (!response.ok) return apiError(response.status, response.status >= 500);
    let result = await response.json();
    const materialId = result.material?.id;
    if (!Number.isInteger(materialId)) throw new Error("Missing material");
    let product: SuzuriProduct | undefined = result.products?.find(
      (p: SuzuriProduct) => p.item?.id === acrylic.id,
    );
    // Repair the material just created, rather than creating a duplicate, if the API
    // saved the artwork but omitted its product.
    if (!product) {
      const repair = await fetch(
        `https://suzuri.jp/api/v1/materials/${materialId}`,
        {
          method: "PUT",
          headers,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ products: [productConfig] }),
        },
      );
      if (!repair.ok) return apiError(repair.status, true);
      result = await repair.json();
      product = result.products?.find(
        (p: SuzuriProduct) => p.item?.id === acrylic.id,
      );
    }
    if (!product) throw new Error("Missing acrylic product");
    const productUrl = productPageUrl(product, materialId, variant);
    if (!productUrl) throw new Error("Missing product URL");
    return reply({
      productUrl,
      materialId,
      productId: product.id,
      message: "アクリルブロックを公開しました。商品ページへ移動します。",
    });
  } catch {
    return reply(
      {
        uncertain: creationStarted,
        error: creationStarted
          ? "作成結果を確認できませんでした。重複を避けるため、再作成の前に公開先ショップの商品を確認してください。"
          : "SUZURIに接続できませんでした。時間をおいてお試しください。",
      },
      502,
    );
  }
}
function apiError(status: number, uncertain = false) {
  const error =
    status === 401 || status === 403
      ? "APIキーが無効か、read / write 権限がありません。"
      : status === 429
        ? "SUZURIの利用上限に達しました。時間をおいてお試しください。"
        : uncertain
          ? "SUZURIでエラーが発生しました。再作成の前にSUZURIで商品の有無を確認してください。"
          : "SUZURIがリクエストを受け付けませんでした。APIキーと画像を確認してください。";
  return reply(
    {
      error: `${error}（SUZURI HTTP ${status}）`,
      uncertain,
      upstreamStatus: status,
    },
    status === 401 || status === 403 ? 401 : status === 429 ? 429 : 502,
  );
}
