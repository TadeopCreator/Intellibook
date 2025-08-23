'use client';
import { useState, useEffect, useMemo } from 'react';
import { Book } from '../../types/Book';
import styles from './bookDetail.module.css';
import { useRouter } from 'next/navigation';
import { BiDownload, BiArrowBack, BiBookOpen, BiHeadphone } from 'react-icons/bi';
import NavMenu from '../../components/NavMenu';
import ProtectedRoute from '../../components/ProtectedRoute';
import ReadingProgressTracker from '../../components/ReadingProgress';
import Link from 'next/link';
import { useAudio } from '../../context/AudioContext';
import { api } from '../../services/api';
import { API_URL } from '../../config/api';
import { use } from "react";

function BookDetailPage({ params }: { params: Promise<{ id: string }>}) {
  const [book, setBook] = useState<Book | null>(null);
  const [audioPosition, setAudioPosition] = useState(0);
  const { showPlayer, isPlayerVisible, currentAudio } = useAudio();
  const router = useRouter();
  const { id } = use(params);

  // Verify if this book is currently playing
  const isCurrentlyPlaying = useMemo(() => {
    return isPlayerVisible && currentAudio?.bookId === (book?.id?.toString() || null);
  }, [isPlayerVisible, currentAudio?.bookId, book?.id]);

  // Modify the function that retrieves progress to avoid cache
  const fetchBookProgress = async (bookId: string) => {
    try {
      const response = await api.progress.get(parseInt(bookId));
      
      if (!response.ok) {
        throw new Error('Error retrieving progress');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error retrieving progress:', error);
      return null;
    }
  };

  // Cargar libro y progreso inicial
  useEffect(() => {
    const fetchBookAndProgress = async () => {
      try {
        const [bookResponse, progressResponse] = await Promise.all([
          api.books.getById(parseInt(id)),
          fetchBookProgress(id)
        ]);
        
        const bookData = await bookResponse.json();
        const progressData = await progressResponse;
        
        setBook(bookData);
        setAudioPosition(progressData?.audiobook_position || 0);
      } catch (error) {
        console.error('Error fetching book data:', error);
      }
    };

    fetchBookAndProgress();
  }, [id]);

  // Handle navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isPlayerVisible) {
        e.preventDefault();
        e.returnValue = 'Do you want to save your progress before leaving?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPlayerVisible]);

  // Recargar el progreso cuando se muestra el reproductor
  const handleShowPlayer = async () => {
    await fetchBookProgress(id);
    if (!book) return;
    
    let audioUrl = book.audiobook_url || `${API_URL}/static/${book.audiobook_path}`;
    
    // Si la URL es de Cloud Storage, obtener URL firmada
    if (audioUrl.includes('storage.cloud.google.com')) {
      try {
        const response = await api.books.getSignedUrl(book.id!);
        const data = await response.json();
        audioUrl = data.signed_url || data.url;
      } catch (error) {
        console.error("Error obteniendo URL firmada:", error);
      }
    }

    console.log("Audio url: " + audioUrl);
    
    showPlayer({
      url: audioUrl,
      bookTitle: book.title || '',
      author: book.author || '',
      coverUrl: book.cover_url || '',
      bookId: book.id?.toString() || '',
      initialPosition: audioPosition
    });
  };

  // En el componente BookPage o similar
  useEffect(() => {
    // Cargar el progreso del libro cuando se monta el componente o cambia el ID
    const loadBookProgress = async () => {
      if (book?.id) {
        const progress = await fetchBookProgress(book.id.toString());
        if (progress) {
          setAudioPosition(progress.audiobook_position || 0);
        }
      }
    };
    
    loadBookProgress();
  }, [book?.id]); // Dependencia en el ID del libro

  // Escuchar el evento de actualización de progreso
  useEffect(() => {
    const handleProgressUpdate = (event: any) => {
      const { bookId, position } = event.detail;
      if (bookId === id) {
        setAudioPosition(position);
      }
    };
    
    window.addEventListener('audioProgressUpdated', handleProgressUpdate);
    
    return () => {
      window.removeEventListener('audioProgressUpdated', handleProgressUpdate);
    };
  }, [id]);

  if (!book) return (
    <div className={styles.loadingContainer}>
      <div className={styles.spinner}></div>
      <p>Loading book details...</p>
    </div>
  );

  const handleDownload = () => {
    if (!book) return;
    
    if (book.ebook_url) {
      window.open(book.ebook_url, '_blank');
    } else if (book.ebook_path) {
      const fileUrl = `/api/books/${book.id}/download`;
      window.open(fileUrl, '_blank');
    }
  };

  const handleStartReading = () => {
    if (book.ebook_path) {
      router.push(`/book/${book.id}/read`);
    }
  };

  const handleStartListening = () => {
    if (!book) return;
    
    if (book.audiobook_url) {
      window.open(book.audiobook_url, '_blank');
    } else if (book.audiobook_path) {
      const fileUrl = `/api/books/${book.id}/listen`;
      window.open(fileUrl, '_blank');
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calcular la rotación basada en la posición del mouse
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    // Invertimos los signos para que se hunda en lugar de levantarse
    const rotateX = (centerY - y) / 20;  // Cambiado de (y - centerY) a (centerY - y)
    const rotateY = (x - centerX) / 20;  // Cambiado de (centerX - x) a (x - centerX)

    // Aplicar la transformación
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget;
    // Resetear la transformación suavemente
    card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0)';
  };

  return (
    <div className={styles.container}>
      <NavMenu />
      <button 
        onClick={() => router.back()} 
        className={styles.backButton}
      >
        <BiArrowBack size={20} />
        <span>Back</span>
      </button>

      <div className={styles.content}>
        <div className={styles.bookHeader}>
          <div className={styles.coverContainer}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {book.cover_url && (
              <img
                src={book.cover_url}
                alt={book.title}
                className={styles.cover}
              />
            )}
          </div>

          <div className={styles.bookInfo}>
            <h1>{book.title}</h1>
            <h2>{book.author}</h2>
            <div className={styles.status}>
              <span className={`${styles.statusBadge} ${styles[book.status?.toLowerCase() || '']}`}>
                {book.status}
              </span>
            </div>

            <div className={styles.actions}>
              {(book.ebook_url || book.ebook_path) && (
                <Link href={`/book/${book.id}/read`} className={`${styles.actionButton} ${styles.playButton}`}>
                  <BiBookOpen />
                  <span>Read</span>
                </Link>
              )}

              {(book.audiobook_url || book.audiobook_path) && (
                <button 
                  onClick={handleShowPlayer}
                  className={`${styles.actionButton} ${styles.playButton} ${isCurrentlyPlaying ? styles.listening : ''}`}
                >
                  <BiHeadphone />
                  <span>{isCurrentlyPlaying ? 'Listening...' : 'Listen'}</span>
                </button>
              )}

              {(book.ebook_url || book.ebook_path) && (
                <button 
                  onClick={handleDownload}
                  className={styles.actionButton}
                >
                  <BiDownload />
                  <span>Download</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.details}>
          <div className={styles.detailSection}>
            <h3>Reading Progress</h3>
            <div className={styles.progressContainer}>
              <ReadingProgressTracker 
                bookId={book.id!}
                totalPages={book.pages}
                hasAudiobook={Boolean(book.audiobook_url || book.audiobook_path)}
              />
            </div>
          </div>

          <div className={styles.detailSection}>
            <h3>Book Details</h3>
            <div className={styles.detailGrid}>
              {book.publisher && (
                <div className={styles.detailItem}>
                  <span>Publisher:</span>
                  <span>{book.publisher}</span>
                </div>
              )}
              {book.publish_year && (
                <div className={styles.detailItem}>
                  <span>Year:</span>
                  <span>{book.publish_year}</span>
                </div>
              )}
              {book.isbn && (
                <div className={styles.detailItem}>
                  <span>ISBN:</span>
                  <span>{book.isbn}</span>
                </div>
              )}
              {book.language && (
                <div className={styles.detailItem}>
                  <span>Language:</span>
                  <span>{book.language}</span>
                </div>
              )}
              {book.pages && (
                <div className={styles.detailItem}>
                  <span>Pages:</span>
                  <span>{book.pages}</span>
                </div>
              )}
            </div>
          </div>

          {book.description && (
            <div className={styles.detailSection}>
              <h3>Description</h3>
              <p>{book.description}</p>
            </div>
          )}

          {book.notes && (
            <div className={styles.detailSection}>
              <h3>Notes</h3>
              <p>{book.notes}</p>
            </div>
          )}

          {book.start_date && (
            <div className={styles.detailSection}>
              <h3>Reading Dates</h3>
              <div className={styles.dates}>
                <p>Started: {new Date(book.start_date).toLocaleDateString()}</p>
                {book.finish_date && (
                  <p>Finished: {new Date(book.finish_date).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BookDetail({ params }: { params: Promise<{ id: string }>}) {
  return (
    <ProtectedRoute>
      <BookDetailPage params={params} />
    </ProtectedRoute>
  );
} 