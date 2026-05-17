import './globals.css'

export const metadata = {
  title: 'PC Training - 外来研修シミュレーター',
  description: 'プライマリケア研修医向け外来診療シミュレーションアプリ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'PC Training',
    statusBarStyle: 'default',
  },
}

export const viewport = {
  themeColor: '#0369a1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>
        {children}
      </body>
    </html>
  )
}
