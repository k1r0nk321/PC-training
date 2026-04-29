import './globals.css'

export const metadata = {
  title: 'PC Training - 外来研修シミュレーター',
  description: 'プライマリケア研修医向け外来診療シミュレーションアプリ',
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
