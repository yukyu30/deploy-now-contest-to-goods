// Hosting errors may return an empty body or HTML instead of our API's JSON.
export async function readApiResponse<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      `サーバーから正常な応答を受け取れませんでした（HTTP ${response.status}）。時間をおいて再度お試しください。`,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error(
      `サーバーの応答形式が正しくありません（HTTP ${response.status}）。時間をおいて再度お試しください。`,
    );
  return data as T;
}
