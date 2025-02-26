'use client';
import { useState, useRef, useEffect } from 'react';
import { BiPlay, BiPause } from 'react-icons/bi';
import styles from './AudioPlayer.module.css';
import Modal from './Modal';

interface AudioPlayerProps {
  audioUrl: string;
  bookTitle: string;
  author: string;
  coverUrl: string;
  isVisible: boolean;
  bookId: string;
  initialPosition?: number;
  onClose: () => void;
}

export default function AudioPlayer({ 
  audioUrl, 
  bookTitle,
  author,
  coverUrl,
  isVisible,
  bookId,
  initialPosition = 0,
  onClose 
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialPosition);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!isVisible) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsLoaded(false);
    }
  }, [isVisible]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isVisible) return;

    const handleLoadedData = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
      if (isVisible) {
        audio.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error('Error al reproducir:', err));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.load();
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
    };
  }, [isVisible, audioUrl]);

  useEffect(() => {
    if (audioRef.current && isVisible) {
      audioRef.current.currentTime = initialPosition;
    }
  }, [isVisible, initialPosition]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !isLoaded) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Error al reproducir/pausar:', err);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !isLoaded) return;

    const value = Number(e.target.value);
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const saveProgress = async (position: number) => {
    try {
      // Actualizar la base de datos
      await fetch(`http://localhost:8000/api/books/${bookId}/progress`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audiobook_position: Math.floor(position)
        }),
      });
    } catch (error) {
      console.error('Error al guardar el progreso:', error);
    }
  };

  const handleClose = () => {
    if (audioRef.current) {
      setShowSaveModal(true);
    } else {
      onClose();
    }
  };

  const handleConfirmSave = async () => {
    if (audioRef.current) {
      await saveProgress(audioRef.current.currentTime);
    }
    setShowSaveModal(false);
    onClose();
  };

  const handleStopListening = () => {
    if (audioRef.current) {
      setShowStopModal(true);
    }
  };

  const handleConfirmStop = async () => {
    if (audioRef.current) {
      await saveProgress(audioRef.current.currentTime);
    }
    setShowStopModal(false);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <>
      <div className={styles.playerContainer}>
        <audio 
          ref={audioRef} 
          src={audioUrl}
          preload="metadata"
        />
        
        <div className={styles.playerContent}>
          <div className={styles.bookInfo}>
            {coverUrl && (
              <img 
                src={coverUrl} 
                alt={bookTitle} 
                className={styles.coverImage}
              />
            )}
            <div className={styles.bookDetails}>
              <span className={styles.bookTitle}>{bookTitle}</span>
              <span className={styles.bookAuthor}>{author}</span>
            </div>
          </div>

          <div className={styles.controls}>
            <button className={styles.playButton} onClick={togglePlay}>
              {isPlaying ? <BiPause size={30} /> : <BiPlay size={30} />}
            </button>
            <button className={styles.stopButton} onClick={handleStopListening}>
              Dejar de escuchar
            </button>
          </div>

          <div className={styles.progressBar}>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className={styles.progress}
              style={{
                background: `linear-gradient(to right, 
                  #ff8c00 0%, 
                  #ff8c00 ${(currentTime / (duration || 1)) * 100}%, 
                  #535353 ${(currentTime / (duration || 1)) * 100}%
                )`
              }}
            />
            <span className={styles.time}>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Guardar progreso"
      >
        <div className={styles.modalContent}>
          <p>¿Quieres guardar tu progreso de escucha?</p>
          <div className={styles.modalButtons}>
            <button 
              onClick={handleConfirmSave}
              className={styles.primaryButton}
            >
              Guardar y salir
            </button>
            <button 
              onClick={() => {
                setShowSaveModal(false);
                onClose();
              }}
              className={styles.secondaryButton}
            >
              Salir sin guardar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showStopModal}
        onClose={() => setShowStopModal(false)}
        title="Dejar de escuchar"
      >
        <div className={styles.modalContent}>
          <p>¿Seguro que quieres dejar de escuchar? Se guardará tu progreso.</p>
          <div className={styles.modalButtons}>
            <button 
              onClick={handleConfirmStop}
              className={styles.primaryButton}
            >
              Guardar y salir
            </button>
            <button 
              onClick={() => setShowStopModal(false)}
              className={styles.secondaryButton}
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
} 