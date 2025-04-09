import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AudioProvider } from './context/AudioContext';
import { ThemeProvider } from 'next-themes';
import Footer from './components/Footer';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Intellibook - Your intelligent reading assistant",
  description: "An intelligent assistant for book recommendations, author information, and literary analysis",
  keywords: "books, literature, recommendations, authors, AI, assistant, audiobooks",
  authors: [{ name: "Tadeo Deluca" }],
  openGraph: {
    title: "Intellibook",
    description: "Your intelligent assistant for reading and audiobooks",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="dark">
          <AudioProvider>
            <div className="flex flex-col min-h-screen">
              {children}
              <Footer />
            </div>
          </AudioProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
