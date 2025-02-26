'use client';
import { useState, useEffect, useRef } from 'react';
import { use } from 'react';
import styles from './readBook.module.css';
import { useRouter } from 'next/navigation';
import { BiArrowBack, BiSun, BiMoon } from 'react-icons/bi';
import { Book } from '../../../types/Book';
import Modal from '../../../components/Modal';

export default function ReadBook({ params }: { params: Promise<{ id: string }> }) {
  const [content, setContent] = useState<string>('');
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { id } = use(params);
  const [viewerTheme, setViewerTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const fetchBookAndContent = async () => {
      try {
        const [bookResponse, contentResponse, progressResponse] = await Promise.all([
          fetch(`http://localhost:8000/api/books/${id}`),
          fetch(`http://localhost:8000/api/books/${id}/content`),
          fetch(`http://localhost:8000/api/books/${id}/progress`)
        ]);

        if (!bookResponse.ok || !contentResponse.ok) {
          throw new Error('Error al cargar el libro o su contenido');
        }

        const [bookData, contentData, progressData] = await Promise.all([
          bookResponse.json(),
          contentResponse.json(),
          progressResponse.ok ? progressResponse.json() : null
        ]);

        setBook(bookData);
        setContent(contentData.content || '');

        // Restaurar la posición de lectura si existe
        if (progressData?.scroll_position && contentRef.current) {
          setTimeout(() => {
            if (contentRef.current) {
              contentRef.current.scrollTop = progressData.scroll_position;
            }
          }, 100);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookAndContent();
  }, [id]);

  useEffect(() => {
    // Cargar preferencia guardada o usar dark por defecto
    const savedTheme = localStorage.getItem('viewerTheme') || 'dark';
    setViewerTheme(savedTheme as 'light' | 'dark');
  }, []);

  // Calcular el progreso de lectura
  const handleScroll = () => {
    if (contentRef.current) {
      const element = contentRef.current;
      const scrollTop = element.scrollTop;
      const scrollHeight = element.scrollHeight - element.clientHeight;
      const progress = (scrollTop / scrollHeight) * 100;
      setReadingProgress(progress);
    }
  };

  const handleBack = () => {
    setShowSaveModal(true);
  };

  const saveProgress = async () => {
    if (contentRef.current) {
      try {
        const response = await fetch(`http://localhost:8000/api/books/${id}/progress`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scroll_position: contentRef.current.scrollTop,
            progress_percentage: readingProgress
          }),
        });

        if (response.ok) {
          router.back();
        }
      } catch (error) {
        console.error('Error saving progress:', error);
      }
    }
  };

  const toggleViewerTheme = () => {
    const newTheme = viewerTheme === 'light' ? 'dark' : 'light';
    setViewerTheme(newTheme);
    localStorage.setItem('viewerTheme', newTheme);
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingMessage}>Cargando contenido...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button onClick={() => router.back()} className={styles.backButton}>
            <BiArrowBack size={20} />
            <span>Volver</span>
          </button>
        </div>
        <div className={styles.errorMessage}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button 
            onClick={handleBack}
            className={styles.backButton}
          >
            <BiArrowBack size={20} />
            <span>Volver</span>
          </button>

          {book && (
            <div className={styles.bookInfo}>
              {book.cover_url && (
                <img 
                  src={book.cover_url} 
                  alt={book.title}
                  className={styles.miniCover}
                />
              )}
              <div className={styles.bookDetails}>
                <span className={styles.bookTitle}>{book.title}</span>
                <span className={styles.bookReader}>Lectura Interactiva</span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.headerRight}>
          <button
            onClick={toggleViewerTheme}
            className={styles.themeButton}
            title={viewerTheme === 'light' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {viewerTheme === 'light' ? <BiSun size={20} /> : <BiMoon size={20} />}
          </button>
        </div>
      </div>

      <div className={styles.progressBar}>
        <div 
          className={styles.progressFill} 
          style={{ width: `${readingProgress}%` }}
        />
      </div>

      <div className={`${styles.contentWrapper} ${viewerTheme === 'dark' ? styles.darkTheme : styles.lightTheme}`}>
        <div 
          ref={contentRef}
          onScroll={handleScroll}
          className={styles.content}
        >
          {content && content.split('\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>

      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Guardar Progreso"
      >
        <div className={styles.saveModal}>
          <p>¿Deseas guardar tu progreso de lectura?</p>
          <div className={styles.modalActions}>
            <button
              onClick={saveProgress}
              className={styles.primaryButton}
            >
              Guardar Progreso
            </button>
            <button
              onClick={() => router.back()}
              className={styles.secondaryButton}
            >
              No Guardar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
} 