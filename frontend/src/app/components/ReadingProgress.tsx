'use client';
import { useState, useEffect } from 'react';
import { ReadingProgress } from '../types/ReadingProgress';
import styles from './ReadingProgress.module.css';
import { api } from '../services/api';

interface ReadingProgressTrackerProps {
  bookId: number;
  totalPages?: number;
  hasAudiobook?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

export default function ReadingProgressTracker({ 
  bookId, 
  totalPages, 
  hasAudiobook,
  onClick 
}: ReadingProgressTrackerProps) {
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchProgress();
  }, [bookId]);

  const fetchProgress = async () => {
    try {
      const response = await api.progress.get(bookId);
      if (response.ok) {
        const data = await response.json();        
        setProgress(data);
      } else {
        throw new Error('Error retrieving progress');
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  };

  const updateProgress = async (updatedData: Partial<ReadingProgress>) => {
    try {
      const response = await api.progress.update(bookId, updatedData);

      if (response.ok) {
        const data = await response.json();
        setProgress(data);
        setIsEditing(false);
      } else {
        throw new Error('Error updating progress');
      }
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!progress && !isEditing) {
    return (
      <button 
        onClick={() => setIsEditing(true)}
        className={styles.startButton}
      >
        Start Tracking
      </button>
    );
  }

  return (
    <div className={styles.progressContainer} onClick={onClick}>
      {isEditing ? (
        <form 
          className={styles.progressForm}
          onSubmit={(e) => {
            e.preventDefault();
            updateProgress(progress || {});
          }}
        >
          {totalPages && (
            <div className={styles.inputGroup}>
              <label>Current page:</label>
              <input
                type="number"
                min="0"
                max={totalPages}
                value={progress?.current_page || 0}
                onChange={(e) => setProgress(prev => ({
                  ...prev!,
                  current_page: parseInt(e.target.value)
                }))}
              />
              <span>of {totalPages}</span>
            </div>
          )}

          <div className={styles.inputGroup}>
            <label>Current chapter:</label>
            <input
              type="text"
              value={progress?.current_chapter || ''}
              onChange={(e) => setProgress(prev => ({
                ...prev!,
                current_chapter: e.target.value
              }))}
            />
          </div>



          <div className={styles.inputGroup}>
            <label>Progress notes:</label>
            <textarea
              value={progress?.notes || ''}
              onChange={(e) => setProgress(prev => ({
                ...prev!,
                notes: e.target.value
              }))}
            />
          </div>

          <div className={styles.buttonGroup}>
            <button type="submit">Save</button>
            <button type="button" onClick={() => setIsEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className={styles.progressInfo}>
          {progress?.current_page && totalPages && (
            <div className={styles.progressItem}>
              <span>📖 Page {progress.current_page} of {totalPages}</span>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ width: `${(progress.current_page / totalPages) * 100}%` }}
                />
              </div>
            </div>
          )}

          {progress?.current_chapter && (
            <div className={styles.progressItem}>
              <span>📑 Chapter: {progress.current_chapter}</span>
            </div>
          )}

          {progress?.audiobook_position && (
            <div className={styles.progressItem}>
              <span>🎧 Time: {formatTime(progress.audiobook_position)}</span>
            </div>
          )}

          {progress?.notes && (
            <div className={styles.progressNotes}>
              <h4>Notes:</h4>
              <p>{progress.notes}</p>
            </div>
          )}

          <button 
            onClick={() => setIsEditing(true)}
            className={styles.editButton}
          >
            Update Pages & Notes
          </button>
        </div>
      )}
    </div>
  );
} 