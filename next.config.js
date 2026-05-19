/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Vercel が自動的に設定する VERCEL_ENV を、ブラウザでも利用可能にする
    // - 'production': main ブランチの本番デプロイ
    // - 'preview':    develop など他のブランチのプレビュー
    // - undefined:    ローカル開発(npm run dev)
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV,
  },
}

module.exports = nextConfig
