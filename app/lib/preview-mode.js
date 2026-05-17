/**
 * プレビューモード判定ヘルパー
 *
 * Vercel が自動的に設定する VERCEL_ENV に基づいて判定:
 * - 'production': main ブランチの本番デプロイ → false(is_active=true のみ表示)
 * - 'preview':    develop など他ブランチのプレビュー → true(is_active=false も表示)
 * - undefined:    ローカル開発(npm run dev)→ false (本番扱い)
 *
 * Vercel UI での環境変数手動設定は不要(VERCEL_ENV は自動)
 * next.config.js で NEXT_PUBLIC_VERCEL_ENV としてブラウザにも公開
 */
export function shouldShowPreview() {
  return process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview'
}
