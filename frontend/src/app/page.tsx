'use client';
import Link from 'next/link';
import styles from "./page.module.css";
import ProtectedRoute from './components/ProtectedRoute';

export default function Home() {
  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <main className={styles.main}>
          <h1 className={styles.title}>Intellibook</h1>
          <p className={styles.subtitle}>Your intelligent assistant for reading and audiobooks</p>

          <div className={styles.grid}>
            <Link href="/library" className={styles.card}>
              <h2>📚 Library</h2>
              <p>Explore your collection of books and audiobooks intelligently organized.</p>
            </Link>

            <Link href="/chat" className={styles.card}>
              <h2>💬 AI Assistant</h2>
              <p>Get intelligent answers about literature and personalized recommendations.</p>
            </Link>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
