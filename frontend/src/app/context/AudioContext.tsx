'use client';
import { createContext, useContext, useState, ReactNode } from 'react';
import AudioPlayer from '../components/AudioPlayer';

interface AudioContextType {
  isPlayerVisible: boolean;
  currentAudio: {
    url: string;
    bookTitle: string;
    author: string;
    coverUrl: string;
    bookId: string;
    initialPosition: number;
  } | null;
  showPlayer: (audio: {
    url: string;
    bookTitle: string;
    author: string;
    coverUrl: string;
    bookId: string;
    initialPosition: number;
  }) => void;
  hidePlayer: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<AudioContextType['currentAudio']>(null);

  const showPlayer = (audio: AudioContextType['currentAudio']) => {
    setCurrentAudio(audio);
    setIsPlayerVisible(true);
  };

  const hidePlayer = () => {
    setIsPlayerVisible(false);
    setCurrentAudio(null);
  };

  return (
    <AudioContext.Provider value={{ isPlayerVisible, currentAudio, showPlayer, hidePlayer }}>
      {children}
      {currentAudio && (
        <AudioPlayer
          audioUrl={currentAudio.url}
          bookTitle={currentAudio.bookTitle}
          author={currentAudio.author}
          coverUrl={currentAudio.coverUrl}
          isVisible={isPlayerVisible}
          bookId={currentAudio.bookId}
          initialPosition={currentAudio.initialPosition}
          onClose={hidePlayer}
        />
      )}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
} 