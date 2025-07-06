'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { use } from 'react';
import styles from './readBook.module.css';
import readModuleStyles from './read.module.css';
import { useRouter } from 'next/navigation';
import { BiArrowBack, BiSun, BiMoon, BiChevronLeft, BiChevronRight } from 'react-icons/bi';
import { FaTextHeight, FaMinus, FaPlus } from 'react-icons/fa';
import { Book } from '../../../types/Book';
import Modal from '../../../components/Modal';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { api } from '../../../services/api';
import { ReadingProgress } from '@/app/types/ReadingProgress';

function ReadBookPage({ params }: { params: Promise<{ id: string }> }) {
  const [content, setContent] = useState<string>('');
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [contentWidth, setContentWidth] = useState(800);
  const [showFontControls, setShowFontControls] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { id } = use(params);
  const [viewerTheme, setViewerTheme] = useState<'light' | 'dark'>('dark');

  // Pagination state
  const [pagesContent, setPagesContent] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [showMobileHint, setShowMobileHint] = useState(false);

  // Constants for pagination
  const WORDS_PER_PAGE = 150; // Reduced from 250 to 150 words per page
  const MIN_LINES_PER_PAGE = 8; // Reduced from 12 to 8 lines
  const MAX_LINES_PER_PAGE = 18; // Reduced from 25 to 18 lines

  // State to prevent double firing of events
  const [lastInteraction, setLastInteraction] = useState<number>(0);
  
  // Touch gesture tracking
  const [touchStart, setTouchStart] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  // Constants for touch gesture detection
  const MAX_TAP_DURATION = 300; // milliseconds
  const MAX_TAP_MOVEMENT = 10; // pixels

  // Improved function to split content into pages
  const splitContentIntoPages = useCallback((text: string) => {
    if (!text) return [];

    // Split text by paragraphs and filter out empty ones
    const paragraphs = text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
      
    const pages: string[] = [];
    let currentPageContent: string[] = [];
    let currentWordCount = 0;
    let currentLineEstimate = 0;
    
    // Calculate estimated lines for a paragraph
    const estimateLines = (paragraph: string): number => {
      if (!paragraph) return 0;
      
      // More accurate line estimation based on character count and font size
      const charsPerLine = 60; // Reduced for smaller width
      const charCount = paragraph.length;
      
      // Count line breaks explicitly
      const lineBreaks = (paragraph.match(/\n/g) || []).length;
      
      // Calculate line estimate - each line break adds a line
      const estimatedLines = Math.max(1, Math.ceil(charCount / charsPerLine)) + lineBreaks;
      
      return estimatedLines;
    };
    
    // Process each paragraph
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const wordCount = paragraph.split(/\s+/).length;
      const lineEstimate = estimateLines(paragraph);
      
      // Special handling for very long paragraphs (more than 1.5x the target)
      if (wordCount > WORDS_PER_PAGE * 1.5 || lineEstimate > MAX_LINES_PER_PAGE) {
        // If we already have content on this page, finish it first
        if (currentPageContent.length > 0) {
          pages.push(currentPageContent.join('\n\n'));
          currentPageContent = [];
          currentWordCount = 0;
          currentLineEstimate = 0;
        }
        
        // Split the long paragraph into sentences
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        let sentenceChunk: string[] = [];
        let chunkWordCount = 0;
        let chunkLineEstimate = 0;
        
        // Group sentences into reasonable chunks
        sentences.forEach(sentence => {
          const sentenceWords = sentence.trim().split(/\s+/).length;
          const sentenceLineEstimate = estimateLines(sentence.trim());
          
          if ((chunkWordCount + sentenceWords > WORDS_PER_PAGE || 
               chunkLineEstimate + sentenceLineEstimate > MAX_LINES_PER_PAGE) && 
              chunkLineEstimate >= MIN_LINES_PER_PAGE) {
            // Add completed chunk to pages
            pages.push(sentenceChunk.join(' '));
            sentenceChunk = [sentence.trim()];
            chunkWordCount = sentenceWords;
            chunkLineEstimate = sentenceLineEstimate;
          } else {
            sentenceChunk.push(sentence.trim());
            chunkWordCount += sentenceWords;
            chunkLineEstimate += sentenceLineEstimate;
          }
        });
        
        // Add the last chunk if not empty
        if (sentenceChunk.length > 0) {
          pages.push(sentenceChunk.join(' '));
        }
      }
      // Normal paragraph handling - check if adding this paragraph would exceed limits
      else if ((currentWordCount + wordCount > WORDS_PER_PAGE || 
                currentLineEstimate + lineEstimate > MAX_LINES_PER_PAGE) && 
               currentLineEstimate >= MIN_LINES_PER_PAGE) {
        // Add the current page content to pages and start a new page
        pages.push(currentPageContent.join('\n\n'));
        currentPageContent = [paragraph];
        currentWordCount = wordCount;
        currentLineEstimate = lineEstimate;
      } else {
        // Add paragraph to current page
        currentPageContent.push(paragraph);
        currentWordCount += wordCount;
        currentLineEstimate += lineEstimate;
      }
    }
    
    // Add the last page if it has content
    if (currentPageContent.length > 0) {
      pages.push(currentPageContent.join('\n\n'));
    }

    // Post-process to ensure minimum lines per page and break up long pages
    const finalPages = [];
    for (let i = 0; i < pages.length; i++) {
      const pageContent = pages[i];
      const estimatedLines = pageContent.split('\n').length + 
                         (pageContent.match(/\. /g) || []).length / 2;
      
      // If page is too short and not the last one, combine with next page
      if (estimatedLines < MIN_LINES_PER_PAGE && i < pages.length - 1) {
        // Combine with the next page if this one is too short
        const combined = pageContent + '\n\n' + pages[i + 1];
        finalPages.push(combined);
        i++; // Skip the next page since we combined it
      } 
      // If page is too long, split it further
      else if (estimatedLines > MAX_LINES_PER_PAGE) {
        // Split the page into paragraphs
        const paragraphs = pageContent.split('\n\n');
        let currentPage: string[] = [];
        let currentLines = 0;
        
        // Distribute paragraphs to maintain line count
        for (const para of paragraphs) {
          const paraLines = estimateLines(para);
          
          if (currentLines + paraLines > MAX_LINES_PER_PAGE && currentPage.length > 0) {
            // Add current page and start a new one
            finalPages.push(currentPage.join('\n\n'));
            currentPage = [para];
            currentLines = paraLines;
          } else {
            currentPage.push(para);
            currentLines += paraLines;
          }
        }
        
        // Add the last page if not empty
        if (currentPage.length > 0) {
          finalPages.push(currentPage.join('\n\n'));
        }
      } 
      // Normal sized page
      else {
        finalPages.push(pageContent);
      }
    }

    return finalPages;
  }, []);

  // Update pages when content changes
  useEffect(() => {
    if (content) {
      const pages = splitContentIntoPages(content);
      setPagesContent(pages);
      setTotalPages(pages.length);
      setIsLoading(false);
    }
  }, [content, splitContentIntoPages]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('viewerTheme') || 'dark';
    const savedFontSize = localStorage.getItem('viewerFontSize');
    const hasSeenMobileHint = localStorage.getItem('hasSeenMobileHint');
    
    setViewerTheme(savedTheme as 'light' | 'dark');
    if (savedFontSize) setFontSize(parseInt(savedFontSize));
    
    // Show mobile hint if on mobile and haven't seen it before
    if (window.innerWidth <= 768 && !hasSeenMobileHint) {
      setShowMobileHint(true);
      // Auto-hide after 3 seconds
      setTimeout(() => {
        setShowMobileHint(false);
        localStorage.setItem('hasSeenMobileHint', 'true');
      }, 3000);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    let isMounted = true;

    const fetchBookAndContent = async () => {
      if (!isMounted) return;
      setIsLoading(true);
      try {
        console.log("Fetching book, content, and progress...");
        const [bookResponse, contentResponse, progressResponse] = await Promise.all([
          api.books.getById(parseInt(id)),
          api.books.getContent(parseInt(id)),
          api.progress.get(parseInt(id))
        ]);

        if (!isMounted) return;

        if (!bookResponse.ok || !contentResponse.ok) {
          throw new Error('Error loading the book or its content');
        }

        const bookData = await bookResponse.json();
        const contentData = await contentResponse.json();
        const progressData = progressResponse.ok ? await progressResponse.json() : null;

        setBook(bookData);
        setContent(contentData.content || '');

        if (progressData?.current_page && progressData.current_page > 0) {
          setCurrentPage(progressData.current_page);
        }

      } catch (error) {
        console.error('Error:', error);
        if (isMounted) setError('Error loading book content');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchBookAndContent();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleBack = () => {
    setShowSaveModal(true);
  };

  const saveProgress = async () => {
    try {
      console.log(`Saving progress: Page ${currentPage}`);
      const response = await api.progress.update(parseInt(id), {
        current_page: currentPage,
        total_pages: totalPages,
        scroll_position: 0
      });

      if (response.ok) {
        router.back();
      } else {
        const errorData = await response.json();
        console.error('Error saving progress:', errorData);
        throw new Error('Error saving progress');
      }
    } catch (error) {
      console.error('Error saving progress:', error);
      setError('Error saving progress');
      setShowSaveModal(false);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      // Auto-save progress when page changes
      saveProgressSilently(newPage);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      // Auto-save progress when page changes
      saveProgressSilently(newPage);
    }
  };

  // Silent progress saving (doesn't redirect)
  const saveProgressSilently = async (pageToSave: number) => {
    try {
      await api.progress.update(parseInt(id), {
        current_page: pageToSave,
        total_pages: totalPages,
        scroll_position: 0
      });
    } catch (error) {
      console.error('Error auto-saving progress:', error);
      // Don't show error for auto-save, just log it
    }
  };

  // Calculate reading percentage
  const getReadingPercentage = () => {
    if (totalPages === 0) return 0;
    return Math.round((currentPage / totalPages) * 100);
  };

  const toggleViewerTheme = () => {
    const newTheme = viewerTheme === 'light' ? 'dark' : 'light';
    setViewerTheme(newTheme);
    localStorage.setItem('viewerTheme', newTheme);
  };

  const increaseFontSize = () => {
    const newSize = Math.min(fontSize + 2, 32);
    setFontSize(newSize);
    localStorage.setItem('viewerFontSize', newSize.toString());
  };

  const decreaseFontSize = () => {
    const newSize = Math.max(fontSize - 2, 12);
    setFontSize(newSize);
    localStorage.setItem('viewerFontSize', newSize.toString());
  };

  const toggleFontControls = () => {
    setShowFontControls(!showFontControls);
  };

  // Unified navigation handler
  const handleNavigation = (clientX: number, elementRect: DOMRect) => {
    // Prevent rapid double-firing (within 100ms)
    const now = Date.now();
    if (now - lastInteraction < 100) return;
    setLastInteraction(now);

    // Hide mobile hint on first interaction
    if (showMobileHint) {
      setShowMobileHint(false);
      localStorage.setItem('hasSeenMobileHint', 'true');
    }
    
    // Only apply on mobile devices
    if (window.innerWidth > 768) return;
    
    const clickX = clientX - elementRect.left;
    const contentWidth = elementRect.width;
    const halfWidth = contentWidth / 2;
    
    if (clickX < halfWidth) {
      // Left half - go to previous page
      goToPreviousPage();
    } else {
      // Right half - go to next page
      goToNextPage();
    }
  };

  // Add mobile tap navigation handler
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle if this is not a touch device or if touch events aren't supported
    if ('ontouchstart' in window) return;
    
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    handleNavigation(e.clientX, rect);
  };

  // Add touch handler for better mobile support
  const handleContentTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    handleNavigation(touch.clientX, rect);
  };

  // Handle touch start - track initial touch position and time
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Don't prevent default here - allow normal scrolling
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    
    setTouchStart({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      time: Date.now()
    });
  };

  // Handle touch end - check if it was a tap or scroll
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart) return;
    
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = touch.clientX - rect.left;
    const endY = touch.clientY - rect.top;
    const duration = Date.now() - touchStart.time;
    
    // Calculate movement distance
    const deltaX = Math.abs(endX - touchStart.x);
    const deltaY = Math.abs(endY - touchStart.y);
    const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Only trigger navigation if:
    // 1. Touch duration is short (like a tap)
    // 2. Movement is minimal (not a scroll gesture)
    // 3. Only on mobile devices
    if (duration <= MAX_TAP_DURATION && 
        totalMovement <= MAX_TAP_MOVEMENT && 
        window.innerWidth <= 768) {
      
      // Prevent the default action only for navigation taps
      e.preventDefault();
      handleNavigation(touchStart.x + rect.left, rect);
    }
    
    // Reset touch start
    setTouchStart(null);
  };

  // Add touch cancel handler to reset state
  const handleTouchCancel = () => {
    setTouchStart(null);
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
          <button onClick={() => window.location.reload()} style={{marginTop: '1rem'}}>Retry</button>
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
                <span className={styles.bookReader}>
                   Reading
                </span>
              </div>
            </div>
          )}

          {/* Reading Progress Indicator */}
          {totalPages > 0 && (
            <div className={styles.progressIndicator}>
              <div className={styles.progressText}>
                <span className={styles.progressPercentage}>{getReadingPercentage()}%</span>
                <span className={styles.progressPages}>Page {currentPage} of {totalPages}</span>
              </div>
              <div className={styles.progressBarHeader}>
                <div 
                  className={styles.progressFillHeader} 
                  style={{ width: `${getReadingPercentage()}%` }}
                />
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

      <div className={styles.paginationWrapper}>
        <button
          onClick={goToPreviousPage}
          disabled={currentPage <= 1}
          className={styles.pageNavButton}
          aria-label="Previous Page"
        >
          <BiChevronLeft size={40} />
        </button>

        <div className={styles.contentWrapper}>
          <div
            ref={contentRef}
            className={`${styles.content} ${styles.paginatedContent} ${readModuleStyles[viewerTheme]}`}
            style={{
              fontSize: `${fontSize}px`,
              maxWidth: `${contentWidth}px`,
              margin: '0 auto',
              lineHeight: '1.6',
              textAlign: 'justify',
            }}
            aria-live="polite"
            onClick={handleContentClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            {pagesContent.length > 0 ? (
              <div 
                className={readModuleStyles[viewerTheme]}
                dangerouslySetInnerHTML={{ 
                  __html: pagesContent[currentPage - 1]
                    .split('\n\n')
                    .map(para => {
                      // Check if this is a sentence chunk (no line breaks) or a regular paragraph
                      if (para.includes('\n')) {
                        return `<p>${para.replace(/\n/g, '<br/>')}</p>`;
                      } else {
                        return `<p>${para}</p>`;
                      }
                    })
                    .join('')
                }} 
              />
            ) : (
              <div className={`${styles.noContent} ${readModuleStyles[viewerTheme]}`}>No content available</div>
            )}
          </div>
          
          {/* Mobile navigation hint */}
          {showMobileHint && (
            <div className={styles.mobileHint}>
              <div className={styles.hintContent}>
                <div className={styles.hintLeft}>
                  <BiChevronLeft size={24} />
                  <span>Tap left to go back</span>
                </div>
                <div className={styles.hintRight}>
                  <span>Tap right to go forward</span>
                  <BiChevronRight size={24} />
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={goToNextPage}
          disabled={currentPage >= totalPages}
          className={styles.pageNavButton}
          aria-label="Next Page"
        >
          <BiChevronRight size={40} />
        </button>
      </div>

      {/* Page counter for mobile */}
      <div className={styles.pageCounter}>
        <div className={styles.pageCounterText}>
          <span className={styles.pageInfo}>Page {currentPage} of {totalPages}</span>
          <span className={styles.percentageInfo}>{getReadingPercentage()}% complete</span>
        </div>
        <div className={styles.progressBarContainer}>
          <div 
            className={styles.progressBar} 
            style={{ width: `${(currentPage / totalPages) * 100}%` }}
          />
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
              Don't Save & Exit
            </button>
             <button
               onClick={() => setShowSaveModal(false)}
               className={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function ReadBook({ params }: { params: Promise<{ id: string }> }) {
  return (
    <ProtectedRoute>
      <ReadBookPage params={params} />
    </ProtectedRoute>
  );
} 