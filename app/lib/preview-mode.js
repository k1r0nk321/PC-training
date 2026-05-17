/**
 * プレビューモード判定ヘルパー
 *
 * 環境変数 NEXT_PUBLIC_SHOW_PREVIEW で制御:
 * - production (main): false または未設定 → is_active=true のみ表示
 * - preview (develop): true → is_active=false も表示
 *
 * Vercel の Environment Variables で各環境ごとに設定:
 * - Production: NEXT_PUBLIC_SHOW_PREVIEW = false (or unset)
 * - Preview:    NEXT_PUBLIC_SHOW_PREVIEW = true
 */
export function shouldShowPreview() {
  return process.env.NEXT_PUBLIC_SHOW_PREVIEW === 'true'
}

/**
 * Supabase クエリビルダに is_active フィルタを条件付きで適用するヘルパー
 *
 * 使用例:
 *   const { data } = await applyActiveFilter(
 *     supabase.from('diseases').select('*')
 *   )
 */
export function applyActiveFilter(query) {
  if (shouldShowPreview()) {
    // プレビュー環境: is_active=false も含めて全件表示
    return query
  }
  // 本番環境: is_active=true のみ
  return query.eq('is_active', true)
}
