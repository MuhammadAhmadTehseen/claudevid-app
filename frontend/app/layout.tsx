import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClaudeVid — AI Video Motion Graphics',
  description: 'Drop a video. Get it back edited.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-dark text-white font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
