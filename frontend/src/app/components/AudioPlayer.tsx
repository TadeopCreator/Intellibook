'use client';
import { useState, useRef, useEffect } from 'react';
import { BiPlay, BiPause } from 'react-icons/bi';
import { IoIosArrowDown } from 'react-icons/io';
import { FaArrowRotateLeft, FaArrowRotateRight } from "react-icons/fa6";
import styles from './AudioPlayer.module.css';
import Modal from './Modal';
import { api } from '../services/api';

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
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
          .catch(err => console.error('Error playing:', err));
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

  useEffect(() => {
    // Reiniciar el estado cuando cambia el libro o la posición inicial
    setCurrentTime(initialPosition);
    setIsPlaying(false);
    setIsLoaded(false);
    
    // Si hay un audio cargado, actualizar su posición
    if (audioRef.current) {
      audioRef.current.currentTime = initialPosition;
    }
  }, [bookId, initialPosition]);

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
      console.error('Error playing/pausing:', err);
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
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const saveProgress = async (position: number) => {
    try {
      await api.progress.update(parseInt(bookId), {
        audiobook_position: Math.floor(position)
      });
    } catch (error) {
      console.error('Error saving progress:', error);
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
      
      // En lugar de recargar la página, simplemente cerramos el reproductor
      // y notificamos al componente padre que debe actualizar el progreso
      setShowStopModal(false);
      onClose();
      
      // Emitir un evento personalizado que el componente padre puede escuchar
      const event = new CustomEvent('audioProgressUpdated', { 
        detail: { 
          bookId, 
          position: Math.floor(audioRef.current.currentTime) 
        } 
      });
      window.dispatchEvent(event);
    }
  };

  const handleStopWithoutSaving = () => {
    // Close the modal and audio player without saving progress
    setShowStopModal(false);
    onClose();
    
    // Don't emit any event - this preserves the existing progress in the database
    // so the audio will resume from where it was previously saved
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const skipBackward = () => {
    if (audioRef.current && isLoaded) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const skipForward = () => {
    if (audioRef.current && isLoaded) {
      audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10);
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  useEffect(() => {
    // Buscar el botón de menú por cualquier clase que contenga "menuButton"
    const menuButton = document.querySelector('[class*="menuButton"]') as HTMLElement;
    
    if (menuButton) {
      if (isExpanded) {
        menuButton.style.display = 'none';
      } else {
        menuButton.style.display = 'block';
      }
    }
    
    return () => {
      // Restaurar la visibilidad del botón cuando el componente se desmonte
      const menuBtn = document.querySelector('[class*="menuButton"]') as HTMLElement;
      if (menuBtn) {
        menuBtn.style.display = 'block';
      }
    };
  }, [isExpanded]);

  // Add MediaSession API support for iOS lock screen controls
  useEffect(() => {
    if (!isVisible || !audioRef.current) return;
    
    // Check if MediaSession API is supported
    if ('mediaSession' in navigator) {
      // Make sure we have a valid cover URL
      const artworkUrl = coverUrl || 'https://placehold.co/1080x1920'; // Fallback image
      
      // Create absolute URLs if the cover URL is relative
      const getAbsoluteUrl = (url: string) => {
        if (url.startsWith('http')) return url;
        // If it's a relative URL, convert to absolute
        const baseUrl = window.location.origin;
        return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      };
      
      const absoluteCoverUrl = getAbsoluteUrl(artworkUrl);
      
      // Set metadata for lock screen display
      navigator.mediaSession.metadata = new MediaMetadata({
        title: bookTitle || 'Audiobook',
        artist: author || 'Unknown Author',
        album: 'Audiobook',
        artwork: [
          { src: absoluteCoverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: absoluteCoverUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: absoluteCoverUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: absoluteCoverUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: absoluteCoverUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: absoluteCoverUrl, sizes: '512x512', type: 'image/jpeg' },
        ]
      });

      // Set action handlers for media keys
      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play().then(() => setIsPlaying(true));
      });
      
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
        setIsPlaying(false);
      });
      
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        skipBackward();
      });
      
      navigator.mediaSession.setActionHandler('seekforward', () => {
        skipForward();
      });
      
      // Update playback state
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
    
    return () => {
      if ('mediaSession' in navigator) {
        // Clear handlers when component unmounts
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
      }
    };
  }, [isVisible, isPlaying, bookTitle, author, coverUrl, skipBackward, skipForward]);

  // Update playback state when it changes
  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Iniciar la animación de minimización
    setIsMinimizing(true);
    
    // Esperar a que termine la animación antes de cambiar el estado
    setTimeout(() => {
      setIsExpanded(false);
      setIsMinimizing(false);
    }, 300); // Duración de la animación
  };

  useEffect(() => {
    // Add keyboard event listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default behavior for these keys to avoid page scrolling
      if ([' ', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(e.code)) {
        e.preventDefault();
      }

      // Prevent space key from scrolling the page
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
      }

      switch (e.code) {
        case 'Space':
          togglePlay();
          break;
        case 'ArrowLeft':
          skipBackward();
          break;
        case 'ArrowRight':
          skipForward();
          break;
        case 'Escape':
          if (isExpanded) {
            handleMinimize(e as unknown as React.MouseEvent);
          }
          break;
      }
    };

    // Only add event listeners if the player is visible
    if (isVisible) {
      window.addEventListener('keydown', handleKeyDown, { capture: true });
    }

    // Clean up event listeners
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isVisible, togglePlay, skipBackward, skipForward, isExpanded, handleMinimize]);

  const togglePlaybackSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
      setPlaybackSpeed(nextSpeed);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      <div 
        className={styles.playerContainer} 
        onClick={toggleExpanded}
      >
        <audio 
          ref={audioRef} 
          src={audioUrl}
          preload="metadata"
          playsInline
          controls={false}
          x-webkit-airplay="allow"
          controlsList="nodownload"
        />
        
        {!isExpanded ? (
          // Vista minimizada
          <div className={styles.playerContent}>
            <div className={styles.playerLeftSection}>
              <button className={styles.playButton} onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}>
                {isPlaying ? <BiPause size={24} /> : <BiPlay size={24} />}
              </button>
              
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
                onClick={(e) => e.stopPropagation()}
                className={styles.progress}
                style={{
                  '--progress-percent': `${(currentTime / (duration || 1)) * 100}%`
                } as React.CSSProperties}
              />
              <span className={styles.time}>{formatTime(duration)}</span>
            </div>

            <button 
              className={styles.stopButton} 
              onClick={(e) => {
                e.stopPropagation();
                handleStopListening();
              }}
            >
              Stop Listening
            </button>
          </div>
        ) : (
          // Vista expandida
          <div 
            className={`${styles.expandedPlayer} ${isMinimizing ? styles.minimizing : ''}`} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.expandedCoverContainer}>
              {coverUrl && (
                <img 
                  src={coverUrl} 
                  alt={bookTitle} 
                  className={styles.expandedCover}
                />
              )}
            </div>
            
            <div className={styles.expandedDetails}>
              <h3 className={styles.expandedTitle}>{bookTitle}</h3>
              <p className={styles.expandedAuthor}>{author}</p>
            </div>
            
            <div className={styles.expandedControls}>
              <button 
                className={styles.skipButton} 
                onClick={skipBackward}
                title="Retroceder 10 segundos"
              >
                <FaArrowRotateLeft size={20} />
                <span className={styles.skipText}>10s</span>
              </button>
              
              <button 
                className={styles.expandedPlayButton} 
                onClick={togglePlay}
              >
                {isPlaying ? <BiPause size={40} /> : <BiPlay size={40} />}
              </button>
              
              <button 
                className={styles.skipButton} 
                onClick={skipForward}
                title="Adelantar 10 segundos"
              >
                <FaArrowRotateRight size={20} />
                <span className={styles.skipText}>10s</span>
              </button>
            </div>

            <div className={styles.speedControl}>
              <button 
                className={styles.speedButton}
                onClick={togglePlaybackSpeed}
                title={`Playback speed: ${playbackSpeed}x`}
              >
                {playbackSpeed}x
              </button>
            </div>
            
            <div className={styles.expandedProgressBar}>
              <span className={styles.expandedTime}>{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                className={styles.expandedProgress}
                style={{
                  '--progress-percent': `${(currentTime / (duration || 1)) * 100}%`
                } as React.CSSProperties}
              />
              <span className={styles.expandedTime}>{formatTime(duration)}</span>
            </div>
            
            {/* Botón de minimizar */}
            <button 
              className={styles.minimizeButton}
              onClick={handleMinimize}
            >
              <IoIosArrowDown size={24} />
            </button>
            
            {/* Botón de dejar de escuchar */}
            <button 
              className={styles.expandedStopButton} 
              onClick={(e) => {
                e.stopPropagation();
                handleStopListening();
              }}
            >
              Stop Listening
            </button>
          </div>
        )}
      </div>

      <Modal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Save Progress"
      >
        <div className={styles.modalContent}>
          <p>Do you want to save your listening progress?</p>
          <div className={styles.modalButtons}>
            <button 
              onClick={handleConfirmSave}
              className={styles.primaryButton}
            >
              Save and Exit
            </button>
            <button 
              onClick={() => {
                setShowSaveModal(false);
                onClose();
              }}
              className={styles.secondaryButton}
            >
              Exit without Saving
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showStopModal}
        onClose={() => setShowStopModal(false)}
        title="Stop Listening"
      >
        <div className={styles.modalContent}>
          <p>What would you like to do?</p>
          <div className={styles.modalButtons}>
            <button 
              onClick={handleConfirmStop}
              className={styles.primaryButton}
            >
              Save and Exit
            </button>
            <button 
              onClick={handleStopWithoutSaving}
              className={styles.secondaryButton}
            >
              Exit without Saving
            </button>
            <button 
              onClick={() => setShowStopModal(false)}
              className={styles.secondaryButton}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}