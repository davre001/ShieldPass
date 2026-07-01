import './globals.css'

export const metadata = {
  title: 'ShieldPass Docs',
  description: 'Documentation for ShieldPass V2'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/style.css" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-mono/style.css" />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
