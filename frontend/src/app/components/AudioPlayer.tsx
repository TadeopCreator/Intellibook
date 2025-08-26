'use client';
import { useState, useRef, useEffect } from 'react';
import { BiPlay, BiPause } from 'react-icons/bi';
import { IoIosArrowDown } from 'react-icons/io';
import { FaArrowRotateLeft, FaArrowRotateRight } from "react-icons/fa6";
import { MdSubtitles } from "react-icons/md";
import styles from './AudioPlayer.module.css';
import Modal from './Modal';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

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
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isPositionSet, setIsPositionSet] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const [transcriptionData, setTranscriptionData] = useState<string>('');
  const [transcriptionLines, setTranscriptionLines] = useState<Array<{start: number, end: number, text: string}>>([]);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [previousLineIndex, setPreviousLineIndex] = useState(-1);
  const [isLineChanging, setIsLineChanging] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  const { refreshAuth, signOut } = useAuth();

  // Function to fetch transcription data
  const fetchTranscription = async () => {
    try {
      const response = await api.books.getTranscription(parseInt(bookId));
      const data = await response.json();
      const transcriptionText = data.transcription;
      setTranscriptionData(transcriptionText);
      parseTranscription(transcriptionText);
    } catch (error) {
      console.error('Error fetching transcription:', error);
      setTranscriptionData('');
      setTranscriptionLines([]);
    }
  };

  // Function to parse transcription text into time-stamped lines
  const parseTranscription = (text: string) => {
    const lines: Array<{start: number, end: number, text: string}> = [];
    
    // Split by lines and process each line
    const textLines = text.split('\n');
    
    for (const line of textLines) {
      // Match pattern: [start_time -> end_time] text
      const match = line.match(/^\[(\d+\.?\d*)s\s*->\s*(\d+\.?\d*)s\]\s*(.+)$/);
      
      if (match) {
        const start = parseFloat(match[1]);
        const end = parseFloat(match[2]);
        const text = match[3].trim();
        
        lines.push({ start, end, text });
      }
    }
    
    setTranscriptionLines(lines);
  };

  // Optimized function to find current line based on audio time
  // Since lines are chronologically ordered and approximately every 5 seconds
  const findCurrentLine = (currentTime: number) => {
    if (transcriptionLines.length === 0) return -1;
    
    // Estimate starting position based on ~5 seconds per line
    const estimatedIndex = Math.floor(currentTime / 5);
    const startSearchIndex = Math.max(0, Math.min(estimatedIndex - 2, transcriptionLines.length - 1));
    
    // Search forward from estimated position
    for (let i = startSearchIndex; i < transcriptionLines.length; i++) {
      const line = transcriptionLines[i];
      if (currentTime >= line.start && currentTime <= line.end) {
        return i;
      }
      // If we've passed the current time, no line is active
      if (currentTime < line.start) {
        break;
      }
    }
    
    // If not found in forward search, check a few lines backward
    for (let i = startSearchIndex - 1; i >= Math.max(0, startSearchIndex - 5); i--) {
      const line = transcriptionLines[i];
      if (currentTime >= line.start && currentTime <= line.end) {
        return i;
      }
    }
    
    return -1;
  };

  // Function to toggle transcription mode
  const toggleTranscription = async () => {
    if (!showTranscription && transcriptionData === '') {
      // First time opening transcription, fetch data
      await fetchTranscription();
    }
    setShowTranscription(!showTranscription);
  };

  useEffect(() => {
    if (!isVisible) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsLoaded(false);
      setIsPositionSet(false);
    }
  }, [isVisible]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isVisible) return;

    // Reset states when audio URL or book changes
    setIsPlaying(false);
    setIsLoaded(false);
    setIsPositionSet(false);
    setCurrentTime(initialPosition);

    const handleLoadedData = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
      
      // Set the correct position BEFORE attempting to play
      if (initialPosition > 0) {
        audio.currentTime = initialPosition;
        setCurrentTime(initialPosition);
      }
      setIsPositionSet(true);
      
      // Now we can safely start playing from the correct position
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

    // Load the audio
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
  }, [isVisible, audioUrl, bookId, initialPosition]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !isLoaded || !isPositionSet) return;

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

  const saveProgress = async (position: number, retryCount: number = 0) => {
    try {
      await api.progress.update(parseInt(bookId), {
        audiobook_position: Math.floor(position)
      });
    } catch (error: any) {
      console.error('Error saving progress:', error);
      
      // Check if it's an authentication error
      if (error.message && error.message.includes('401') && retryCount === 0) {
        // Try to refresh authentication once
        try {
          const refreshed = await refreshAuth();
          if (refreshed) {
            // Retry saving progress with refreshed auth
            return await saveProgress(position, 1);
          } else {
            // Refresh failed, show session expired message
            alert('Your session has expired. Please log in again to save your progress.');
            signOut();
          }
        } catch (refreshError) {
          console.error('Failed to refresh auth:', refreshError);
          alert('Your session has expired. Please log in again to save your progress.');
          signOut();
        }
      } else if (error.message && error.message.includes('401')) {
        // Already retried once, session is definitely expired
        alert('Your session has expired. Please log in again to save your progress.');
        signOut();
      } else {
        // Show generic error message for non-auth errors
        alert('Failed to save progress. Please try again later.');
      }
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

  // Debounced update for better performance
  const updateLineIndexRef = useRef<number | null>(null);
  
  // Update current line index based on current time with smooth continuous scrolling
  useEffect(() => {
    if (showTranscription && transcriptionLines.length > 0) {
      // Clear previous timeout to debounce rapid updates
      if (updateLineIndexRef.current) {
        clearTimeout(updateLineIndexRef.current);
      }
      
      updateLineIndexRef.current = window.setTimeout(() => {
        const lineIndex = findCurrentLine(currentTime);
        if (lineIndex !== -1 && lineIndex !== currentLineIndex) {
          // Update the index - the CSS transitions will create the smooth scroll effect
          setPreviousLineIndex(currentLineIndex);
          setCurrentLineIndex(lineIndex);
        }
      }, 100); // Debounce by 100ms
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (updateLineIndexRef.current) {
        clearTimeout(updateLineIndexRef.current);
      }
    };
  }, [currentTime, showTranscription, transcriptionLines, currentLineIndex]);

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Limpiar estados del drag
    setIsDragging(false);
    setDragOffset(0);
    
    // Iniciar la animación de minimización
    setIsMinimizing(true);
    
    // Esperar a que termine la animación antes de cambiar el estado
    // Mobile-optimized timing to match CSS animations
    const isMobile = window.innerWidth <= 768;
    const animationDuration = isMobile ? 250 : 300;
    
    setTimeout(() => {
      setIsExpanded(false);
      setIsMinimizing(false);
    }, animationDuration);
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

  // Funciones para manejar el gesto de deslizar hacia abajo
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isExpanded) return;
    const touch = e.touches[0];
    setStartY(touch.clientY);
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !isExpanded) return;
    
    const touch = e.touches[0];
    const currentY = touch.clientY;
    const diff = currentY - startY;
    
    // Solo permitir deslizar hacia abajo
    if (diff > 0) {
      // Agregar resistencia después de 150px para hacer el gesto más natural
      const resistance = diff > 150 ? 150 + (diff - 150) * 0.3 : diff;
      setDragOffset(resistance);
      // Prevenir el scroll del body
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || !isExpanded) return;
    
    setIsDragging(false);
    
    // Si se deslizó más de 100px hacia abajo, cerrar el reproductor
    if (dragOffset > 100) {
      handleMinimize(new MouseEvent('click') as unknown as React.MouseEvent);
    } else {
      // Si no, regresar a la posición original
      setDragOffset(0);
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
            className={`${styles.expandedPlayer} ${isMinimizing ? styles.minimizing : ''} ${showTranscription ? styles.transcriptionMode : ''}`} 
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: isDragging ? `translateY(${dragOffset}px)` : 'translateY(0)',
              opacity: isDragging ? Math.max(0.3, 1 - (dragOffset / 300)) : 1,
              transition: isDragging ? 'none' : 'transform 0.3s ease-out, opacity 0.3s ease-out'
            }}
          >
            {/* Indicador de swipe */}
            <div className={styles.swipeIndicator}></div>
            
            <div className={styles.expandedCoverContainer}>
              {showTranscription && transcriptionLines.length > 0 ? (
                <div 
                  ref={transcriptionContainerRef}
                  className={styles.transcriptionContainer}
                >
                  <div 
                    className={styles.transcriptionScroller}
                    style={{
                      transform: `translateY(${currentLineIndex * 0}px)` // Force re-render trigger
                    }}
                  >
                    {/* Show multiple lines for context and smooth scrolling */}
                    {transcriptionLines.length > 0 && (
                      <>
                        {/* Two lines before current */}
                        {currentLineIndex > 1 && (
                          <div 
                            className={`${styles.transcriptionLine} ${styles.farPreviousLine}`}
                            key={`far-prev-${currentLineIndex - 2}`}
                          >
                            {transcriptionLines[currentLineIndex - 2].text}
                          </div>
                        )}
                        
                        {/* Previous line */}
                        {currentLineIndex > 0 && (
                          <div 
                            className={`${styles.transcriptionLine} ${styles.previousLine}`}
                            key={`prev-${currentLineIndex - 1}`}
                          >
                            {transcriptionLines[currentLineIndex - 1].text}
                          </div>
                        )}
                        
                        {/* Current line */}
                        {currentLineIndex >= 0 && currentLineIndex < transcriptionLines.length && (
                          <div 
                            className={`${styles.transcriptionLine} ${styles.currentLine}`}
                            key={`current-${currentLineIndex}`}
                          >
                            {transcriptionLines[currentLineIndex].text}
                          </div>
                        )}
                        
                        {/* Next line */}
                        {currentLineIndex < transcriptionLines.length - 1 && (
                          <div 
                            className={`${styles.transcriptionLine} ${styles.nextLine}`}
                            key={`next-${currentLineIndex + 1}`}
                          >
                            {transcriptionLines[currentLineIndex + 1].text}
                          </div>
                        )}
                        
                        {/* Two lines after current */}
                        {currentLineIndex < transcriptionLines.length - 2 && (
                          <div 
                            className={`${styles.transcriptionLine} ${styles.farNextLine}`}
                            key={`far-next-${currentLineIndex + 2}`}
                          >
                            {transcriptionLines[currentLineIndex + 2].text}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : !showTranscription && coverUrl ? (
                <img 
                  src={coverUrl} 
                  alt={bookTitle} 
                  className={styles.expandedCover}
                />
              ) : showTranscription ? (
                <div className={styles.noTranscriptionMessage}>
                  No transcription available for this book
                </div>
              ) : null}
            </div>
            
            {!showTranscription && (
              <div className={styles.expandedDetails}>
                <h3 className={styles.expandedTitle}>{bookTitle}</h3>
                <p className={styles.expandedAuthor}>{author}</p>
              </div>
            )}
            
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
              <button 
                className={`${styles.transcriptionButton} ${showTranscription ? styles.active : ''}`}
                onClick={toggleTranscription}
                title="Toggle transcription"
              >
                <MdSubtitles size={20} />
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