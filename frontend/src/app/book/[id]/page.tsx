'use client';
import { useState, useEffect, useMemo } from 'react';
import { use } from 'react';
import { Book } from '../../types/Book';
import styles from './bookDetail.module.css';
import { useRouter } from 'next/navigation';
import { BiDownload, BiBook, BiArrowBack, BiPlay, BiBookOpen, BiHeadphone } from 'react-icons/bi';
import NavMenu from '../../components/NavMenu';
import Link from 'next/link';
import { useAudio } from '../../context/AudioContext';

export default function BookDetail({ params }: { params: { id: string } }) {
  const [book, setBook] = useState<Book | null>(null);
  const [audioPosition, setAudioPosition] = useState(0);
  const { showPlayer, isPlayerVisible, currentAudio } = useAudio();
  const router = useRouter();
  const { id } = use(params);

  // Verificar si este libro es el que se está reproduciendo actualmente
  const isCurrentlyPlaying = useMemo(() => {
    return isPlayerVisible && currentAudio?.bookId === book?.id.toString();
  }, [isPlayerVisible, currentAudio?.bookId, book?.id]);

  // Función para obtener el progreso actual
  const fetchProgress = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/books/${id}/progress`);
      const progressData = await response.json();
      setAudioPosition(progressData.audiobook_position || 0);
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  };

  // Cargar libro y progreso inicial
  useEffect(() => {
    const fetchBookAndProgress = async () => {
      try {
        const [bookResponse, progressResponse] = await Promise.all([
          fetch(`http://localhost:8000/api/books/${id}`),
          fetch(`http://localhost:8000/api/books/${id}/progress`)
        ]);
        
        const bookData = await bookResponse.json();
        const progressData = await progressResponse.json();
        
        setBook(bookData);
        setAudioPosition(progressData.audiobook_position || 0);
      } catch (error) {
        console.error('Error fetching book data:', error);
      }
    };

    fetchBookAndProgress();
  }, [id]);

  // Manejar la navegación
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (showPlayer) {
        e.preventDefault();
        e.returnValue = '¿Quieres guardar tu progreso antes de salir?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [showPlayer]);

  // Recargar el progreso cuando se muestra el reproductor
  const handleShowPlayer = async () => {
    await fetchProgress();
    showPlayer({
      url: book.audiobook_url || `http://localhost:8000/static/${book.audiobook_path}`,
      bookTitle: book?.title || '',
      author: book?.author || '',
      coverUrl: book?.cover_url || '',
      bookId: book?.id?.toString() || '',
      initialPosition: audioPosition
    });
  };

  if (!book) return <div>Cargando...</div>;

  const handleDownload = () => {
    if (book.ebook_url) {
      window.open(book.ebook_url, '_blank');
    } else if (book.ebook_path) {
      const fileUrl = `http://localhost:8000/static/${book.ebook_path}`;
      window.open(fileUrl, '_blank');
    }
  };

  const handleStartReading = () => {
    if (book.ebook_path) {
      router.push(`/book/${book.id}/read`);
    }
  };

  const handleStartListening = () => {
    if (book.audiobook_url) {
      window.open(book.audiobook_url, '_blank');
    } else if (book.audiobook_path) {
      // La ruta ya es relativa (ej: "audiobooks/1.mp3")
      const fileUrl = `http://localhost:8000/static/${book.audiobook_path}`;
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
        <span>Volver</span>
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
                  <span>Leer</span>
                </Link>
              )}

              {(book.audiobook_url || book.audiobook_path) && (
                <button 
                  onClick={handleShowPlayer}
                  className={`${styles.actionButton} ${styles.playButton} ${isCurrentlyPlaying ? styles.listening : ''}`}
                >
                  <BiHeadphone />
                  <span>{isCurrentlyPlaying ? 'Escuchando...' : 'Escuchar'}</span>
                </button>
              )}

              {(book.ebook_url || book.ebook_path) && (
                <button 
                  onClick={handleDownload}
                  className={styles.actionButton}
                >
                  <BiDownload />
                  <span>Descargar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.details}>
          <div className={styles.detailSection}>
            <h3>Detalles del Libro</h3>
            <div className={styles.detailGrid}>
              {book.publisher && (
                <div className={styles.detailItem}>
                  <span>Editorial:</span>
                  <span>{book.publisher}</span>
                </div>
              )}
              {book.publish_year && (
                <div className={styles.detailItem}>
                  <span>Año:</span>
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
                  <span>Idioma:</span>
                  <span>{book.language}</span>
                </div>
              )}
              {book.pages && (
                <div className={styles.detailItem}>
                  <span>Páginas:</span>
                  <span>{book.pages}</span>
                </div>
              )}
            </div>
          </div>

          {book.description && (
            <div className={styles.detailSection}>
              <h3>Descripción</h3>
              <p>{book.description}</p>
            </div>
          )}

          {book.notes && (
            <div className={styles.detailSection}>
              <h3>Notas</h3>
              <p>{book.notes}</p>
            </div>
          )}

          {book.start_date && (
            <div className={styles.detailSection}>
              <h3>Fechas de Lectura</h3>
              <div className={styles.dates}>
                <p>Comenzado: {new Date(book.start_date).toLocaleDateString()}</p>
                {book.finish_date && (
                  <p>Terminado: {new Date(book.finish_date).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 