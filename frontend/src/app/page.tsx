'use client';
import Link from 'next/link';
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Book Assistant</h1>
        <p className={styles.subtitle}>Tu asistente personal para literatura</p>

        <div className={styles.grid}>
          <Link href="/library" className={styles.card}>
            <h2>📚 Biblioteca</h2>
            <p>Gestiona tu colección de libros y mantén un registro de tus lecturas.</p>
          </Link>

          <Link href="/chat" className={styles.card}>
            <h2>💬 Chat</h2>
            <p>Consulta cualquier duda sobre libros, autores o recomendaciones.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
