'use client';
import { useState, useEffect, useRef } from 'react';
import { use } from 'react';
import styles from './readBook.module.css';
import { useRouter } from 'next/navigation';
import { BiArrowBack, BiSun, BiMoon } from 'react-icons/bi';
import { FaTextHeight, FaMinus, FaPlus } from 'react-icons/fa';
import { Book } from '../../../types/Book';
import Modal from '../../../components/Modal';
import { API_URL } from '../../../config/api';

export default function ReadBook({ params }: { params: Promise<{ id: string }> }) {
  const [content, setContent] = useState<string>('');
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [fontSize, setFontSize] = useState(18); // Tamaño de fuente predeterminado
  const [contentWidth, setContentWidth] = useState(800); // Ancho máximo del contenido
  const [showFontControls, setShowFontControls] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { id } = use(params);
  const [viewerTheme, setViewerTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    // Cargar preferencias guardadas
    const savedTheme = localStorage.getItem('viewerTheme') || 'dark';
    const savedFontSize = localStorage.getItem('viewerFontSize');
    const savedContentWidth = localStorage.getItem('viewerContentWidth');
    
    setViewerTheme(savedTheme as 'light' | 'dark');
    if (savedFontSize) setFontSize(parseInt(savedFontSize));
    if (savedContentWidth) setContentWidth(parseInt(savedContentWidth));
  }, []);

  useEffect(() => {
    const fetchBookAndContent = async () => {
      try {
        const [bookResponse, contentResponse, progressResponse] = await Promise.all([
          fetch(`${API_URL}/api/books/${id}`),
          fetch(`${API_URL}/api/books/${id}/content`),
          fetch(`${API_URL}/api/books/${id}/progress`)
        ]);

        if (!bookResponse.ok || !contentResponse.ok) {
          throw new Error('Error loading the book or its content');
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
          console.log("Progress: " + progressData.scroll_position)
          setTimeout(() => {
            if (contentRef.current) {
              contentRef.current.scrollTop = progressData.scroll_position;
            }
          }, 100);
        }
      } catch (error) {
        console.error('Error:', error);
        setError('Error loading book content');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookAndContent();
  }, [id]);

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
        const response = await fetch(`${API_URL}/api/books/${id}/progress`, {
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
        } else {
          throw new Error('Error al guardar el progreso');
        }
      } catch (error) {
        console.error('Error saving progress:', error);
        setError('Error al guardar el progreso');
      }
    }
  };

  const toggleViewerTheme = () => {
    const newTheme = viewerTheme === 'light' ? 'dark' : 'light';
    setViewerTheme(newTheme);
    localStorage.setItem('viewerTheme', newTheme);
  };

  const increaseFontSize = () => {
    const newSize = Math.min(fontSize + 2, 32); // Máximo tamaño de fuente
    setFontSize(newSize);
    localStorage.setItem('viewerFontSize', newSize.toString());
  };

  const decreaseFontSize = () => {
    const newSize = Math.max(fontSize - 2, 12); // Mínimo tamaño de fuente
    setFontSize(newSize);
    localStorage.setItem('viewerFontSize', newSize.toString());
  };

  const toggleFontControls = () => {
    setShowFontControls(!showFontControls);
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading content...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button onClick={() => router.back()} className={styles.backButton}>
            <BiArrowBack size={20} />
            <span>Back</span>
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
            <span>Back</span>
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
                <span className={styles.bookReader}>Interactive Reading</span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.headerRight}>
          <div className={styles.fontControls}>
            <button
              onClick={toggleFontControls}
              className={styles.themeButton}
              title="Font size controls"
            >
              <FaTextHeight size={18} />
            </button>
            
            {showFontControls && (
              <div className={styles.fontSizeControls}>
                <button 
                  onClick={decreaseFontSize} 
                  className={styles.fontSizeButton}
                  title="Decrease font size"
                >
                  <FaMinus size={14} />
                </button>
                <span className={styles.currentFontSize}>{fontSize}px</span>
                <button 
                  onClick={increaseFontSize} 
                  className={styles.fontSizeButton}
                  title="Increase font size"
                >
                  <FaPlus size={14} />
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={toggleViewerTheme}
            className={styles.themeButton}
            title={viewerTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
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
          style={{ 
            fontSize: `${fontSize}px`,
            maxWidth: `${contentWidth}px`,
            margin: '0 auto',
            lineHeight: '1.6'
          }}
        >
          {content && content.split('\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>

      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Save Progress"
      >
        <div className={styles.saveModal}>
          <p>Do you want to save your reading progress?</p>
          <div className={styles.modalActions}>
            <button
              onClick={saveProgress}
              className={styles.primaryButton}
            >
              Save Progress
            </button>
            <button
              onClick={() => router.back()}
              className={styles.secondaryButton}
            >
              Don't Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
} 