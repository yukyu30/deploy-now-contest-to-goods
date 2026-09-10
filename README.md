# WEB / OBJECT

`*.lolipop-now.app` のURLを入力すると、サーバー側のヘッドレスChromiumが公開ページを撮影し、SUZURIのアクリルブロックを作成できるNext.jsアプリです。利用者のタブ選択・画面共有・APIキー入力は不要です。

## ローカル起動

Next.js 16.3.4 / React 19.2.8。Node.js 22以上を推奨します。

```sh
npm ci
npm run browser:install
# .env に SUZURI_API_KEY を設定（.env.example 参照）
npm run dev
```

ターミナルに表示されるLocal URLを開きます。既定は http://localhost:3000 です。使用中の場合は別のポートになります。

1. `https://your-site.lolipop-now.app` を入力し「撮影して次へ」を押します。
2. プレビューで切り抜き・余白の色を調整します。
3. 作品名と公開への同意を入力して作成。QRコード付きのアクリルブロックが公開され、自動で商品ページへ移動します。

スマホ向けの1カラムUIです。上部に3Dプレビューを表示したまま、下部で3ステップを操作できます。

すべての商品は **サーバーに設定したAPIキーの所有者のアカウント** に作成されます。訪問者ごとのSUZURIアカウント連携ではありません。注文・支払いはSUZURI側で行います。これまでは非公開設定でしたが、商品ページを訪問者が開けるよう、作成時に公開の同意を必須にしています。既存の非公開商品は自動で公開しません。

## プレビューと商品作成

React Three Fiber / Three.jsによる3Dプレビューを実装しています。10 × 10 × 2 cm相当の比率、透明素材の屈折・反射、印刷層、接地影を再現し、ドラッグで回転できます。WebGL非対応時は画像プレビューに戻ります。

印刷画像の右下に撮影URLのQRコードを埋め込みます。プレビューとサーバーで共通のサイズ・余白・誤り訂正設定を使い、最終PNGから元のURLを読み取れることを自動テストしています。

SUZURI APIのitem一覧からサイズ・色の代表バリエーションを取得し、`exemplaryItemVariantId`を明示して作成します。素材のみ作られて商品が返らなかった場合は、その素材にPUTで商品を追加し、素材の重複作成を避けます。商品URLが得られなければ成功として扱わず、SUZURIトップページへの代替遷移もしません。

## 自動撮影

- ページ上部1440 × 1080 CSS pxを等倍で撮影します。Lambda上の3D描画負荷を抑えるため、端末の高DPI設定は使いません。印刷画像は1732 × 1732 pxです。
- ページのロードとフォントを待ち、描画のため短い待機時間を設けて撮影します。遅いAPIに依存する表示は完了前に撮影される場合があります。
- ログイン済みの利用者のブラウザは使いません。ログイン不要の公開ページのみ対応します。ブラウザ拡張も必要ありません。
- Lambdaでの画像書き出し負荷を抑えるため、撮影時にJPEG（品質90）へ直接出力します。2 MiBを超えた場合は品質80で再圧縮し、それでも超える画像はエラーにします。入稿時はPNGに変換します。
- 完全な長尺ページ撮影、ログイン、Cookie依存の画面、WebSocket、Service Worker、POST API依存の画面は対象外です。
- ページ本体とフレームの移動先はHTTPSの `*.lolipop-now.app` のみ。外部CDNの画像・CSS・フォント等は公開HTTP(S)に限って読み込みます。
- DNS解決した全IPを検証し、接続先IPを固定。プライベートIP、ループバック、リンクローカル、メタデータサービス等への接続を拒否します。HTTPリダイレクトは最大5回までサーバー側で検証・取得します。
- 転送後のHTMLにbase URLを付けて相対パスを補正します。`location` や複雑なリダイレクトに依存するアプリでは見え方に差が出る場合があります。
- 撮影1件あたりリソース数・転送量・時間に制限を設け、完了時・失敗時はブラウザを閉じます。ChromiumへSUZURIキーやAWS資格情報を環境変数として渡しません。

## デプロイ now / Lambda

デプロイ now公式のNext.js要件に合わせて `output: "standalone"` を設定しています。公開先がLambdaの場合は `@sparticuz/chromium` の実行ファイルを `/tmp` に展開して使います。圧縮ブラウザと日本語フォントは `outputFileTracingIncludes` で成果物へ含めています。

### デプロイ設定

- フレームワーク：`next`
- インストール：`npm ci`
- ビルド：`npm run build`
- 出力：`.next/standalone`

```sh
lolipop deploy --name web-object --framework next
```

新しい公開先を作成するコマンドです。既存のプロジェクトがある場合は、そのプロジェクトへリンクしてから `lolipop deploy` を使ってください。

### 公開先の環境変数

デプロイ nowはローカルの `.env` をビルド・公開時に参照しません。ダッシュボードのプロジェクト詳細「環境変数」で設定してください。

| 名前               | 値                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------- |
| `SUZURI_API_KEY`   | 所有者のSUZURI APIキー（read / write）                                                  |
| `APP_ORIGIN`       | Fetch Metadata非対応クライアント用の公開origin。例 `https://web-object.lolipop-now.app` |
| `CHROMIUM_RUNTIME` | `lambda`（AWS_LAMBDA_FUNCTION_NAMEが提供される環境では自動検出）                        |

APIキーはサーバーだけで使用します。`NEXT_PUBLIC_` プレフィックスは付けません。SUZURIの認証情報をフロントエンドへ配信しません。

ブラウザーからのAPI操作は `Sec-Fetch-Site: same-origin` と有効な `Origin` を確認します。これにより、本番の `APP_ORIGIN` を引き継いだプレビューでも、その画面からの操作を許可します。別サイト・別サブドメインからの操作は拒否し、このヘッダーがないクライアントは `APP_ORIGIN`（未設定時はリクエストURLのorigin）との完全一致が必要です。転送ヘッダーや `*.lolipop-now.app` の一括許可には依存しません。

### Lambdaの条件と検証範囲

現状は **Linux x86_64 + Lambda向けChromium** を想定しています。Playwright 1.62.0 / @sparticuz/chromium 152.0.0を固定していますが、この組み合わせのLambda上での起動は未検証です。ローカルはPlaywright付属のブラウザでテストします。

- Chromium実行には、目安としてメモリ2 GB、`/tmp` 1 GB、リクエスト実行時間60秒以上を推奨します。実際に利用できる設定・ネイティブバイナリの起動可否はデプロイ nowの実行環境で確認が必要です。
- AWS Lambdaには同期要求・応答6 MB、ZIP展開後250 MBなどの上限があります。アプリのJSON入力は最大3 MiB、返却する撮影画像のバイナリは最大2 MiBです。デプロイ now側の独自制限も別途適用されます。
- 撮影画像は永続ストレージに保存しません。画像・URL・15分の期限をHMAC署名して画面へ返し、商品作成時に検証します。署名キーはSUZURIキーから用途を分離して使うため、異なるLambdaインスタンスでも同じキーなら検証できます。キーを変更すると既存の撮影結果は無効になります。
- 商品作成APIは画像を再検証してサーバーで切り抜き・余白を描画します。クライアントから任意の未署名画像を送ることはできません。
- 作成結果不明時はSUZURIを確認してから再操作してください。署名は一度限りの使用を保証せず、分散環境での厳密な重複防止は未実装です。公開サービスで作成回数を制限する場合は、認証・共有ストアによるレート制限や冪等性を追加してください。Originチェックだけは利用者認証になりません。
- 起動時間・サイズ・実行制約でChromiumを同梱できない場合は、撮影処理を別のLambdaまたは外部のブラウザサービスへ分離する必要があります。

このリポジトリからデプロイ nowへの公開、および公開環境でのChromium起動はまだ行っていません。

## 検証

```sh
npm test
npm run test:browser
# npm run dev を起動した状態で画面操作・3D描画・リダイレクトを検証
TEST_ORIGIN=http://localhost:3001 npm run test:studio
npm run lint
npm run build
```

- 単体/APIテスト：ドメイン・IP制限、署名改ざん/期限切れ、サーバーキーの利用、1732pxの印刷画像生成、SUZURIの商品作成リクエスト、エラー処理。
- ブラウザテスト：実Chromium＋固定のHTML/CSSで描画・撮影・寸法・背景色・対象外への移動の拒否を検証。SUZURIの商品作成はモックです。
- 設定された実キーでSUZURIのアイテム一覧取得を確認済みです。作成済みの「tool-box のWebサイト」素材へアクリルブロックを追加する操作も実APIで確認しました（この既存商品は非公開のままです）。

## 参照

- [デプロイ now: Next.js](https://deploy.lolipop.jp/docs/frameworks/nextjs)
- [デプロイ now: 環境変数](https://deploy.lolipop.jp/docs/configuration/environment-variables)
- [AWS Lambdaの上限](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
- [Lambda向けChromium](https://github.com/Sparticuz/chromium)
- [SUZURI API](https://suzuri.jp/developer/documentation/v1?locale=ja)

日本語フォントはNoto Sans JP（SIL Open Font License）です。ライセンスは `assets/fonts/OFL.txt` に同梱しています。
