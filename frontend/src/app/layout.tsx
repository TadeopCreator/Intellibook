import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AudioProvider } from './context/AudioContext';
import { ThemeProvider } from 'next-themes';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Book Assistant - Tu asistente literario",
  description: "Un asistente inteligente para recomendaciones de libros, información sobre autores y análisis literarios",
  keywords: "libros, literatura, recomendaciones, autores, AI, asistente",
  authors: [{ name: "Book Assistant Team" }],
  openGraph: {
    title: "Book Assistant",
    description: "Tu asistente personal para literatura y recomendaciones de libros",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="dark">
          <AudioProvider>
            {children}
          </AudioProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
