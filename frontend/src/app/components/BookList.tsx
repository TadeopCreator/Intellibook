'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Book, BookStatus, EbookFormat, AudiobookFormat } from '../types/Book';
import styles from './BookList.module.css';
import ReadingProgressTracker from './ReadingProgress';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import { BiPlus, BiSort, BiFilter, BiEdit, BiDotsVerticalRounded } from 'react-icons/bi';
import { BsGrid3X3Gap, BsList, BsCheckCircleFill, BsBookmarkFill, BsEyeFill } from 'react-icons/bs';
import { MdDelete } from 'react-icons/md';
import { api } from '../services/api';

// Tipos para los filtros y ordenación
type SortOption = 'last_read' | 'title';
type FilterOption = 'all' | 'to_read' | 'reading' | 'read' | 'with_ebook' | 'with_audiobook';
type ViewOption = 'grid' | 'list';

// Extender el tipo Book para incluir información de progreso
interface BookWithProgress extends Book {
  progress?: {
    last_read_date: string | null;
    progress_percentage: number;
    audiobook_position: number | null;
    scroll_position: number;
  };
}

export default function BookList() {
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [filteredBooks, setFilteredBooks] = useState<BookWithProgress[]>([]);
  const [newBook, setNewBook] = useState<Partial<Book>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const ebookInputRef = useRef<HTMLInputElement>(null);
  const audiobookInputRef = useRef<HTMLInputElement>(null);
  const transcriptionInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<number | null>(null);
  const [ebookFile, setEbookFile] = useState<File | null>(null);
  const [audiobookFile, setAudiobookFile] = useState<File | null>(null);
  const [transcriptionFile, setTranscriptionFile] = useState<File | null>(null);
  
  // Estados para filtros y ordenación
  const [sortBy, setSortBy] = useState<SortOption>('last_read');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [showSortOptions, setShowSortOptions] = useState(false);
  const [showFilterOptions, setShowFilterOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewOption>('grid');
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  
  // Lazy loading states
  const [displayedBooks, setDisplayedBooks] = useState<BookWithProgress[]>([]);
  const [itemsToShow, setItemsToShow] = useState(10); // Start with 10 books
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Helper function for direct upload to Cloud Storage
  const uploadFileDirectly = async (file: File, fileType: 'ebook' | 'audiobook' | 'transcription'): Promise<string> => {
    try {
      console.log(`Starting direct upload for ${fileType}: ${file.name} (${file.size} bytes)`);
      
      // Get signed URL from backend
      const response = await api.request('/api/generate-upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          file_type: fileType,
          content_type: file.type || 'application/octet-stream'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate upload URL');
      }

      const { signed_url, final_url } = await response.json();
      console.log(`Got signed URL for ${fileType}: ${final_url}`);

      // Upload file directly to Cloud Storage
      const uploadResponse = await fetch(signed_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        }
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to Cloud Storage');
      }

      console.log(`Direct upload successful for ${fileType}`);
      return final_url;
    } catch (error) {
      console.error('Direct upload failed:', error);
      throw error;
    }
  };

  useEffect(() => {
    fetchBooks();
    // Cargar preferencia de vista desde localStorage
    const savedViewMode = localStorage.getItem('bookLibraryViewMode') as ViewOption;
    if (savedViewMode && (savedViewMode === 'grid' || savedViewMode === 'list')) {
      setViewMode(savedViewMode);
    }
  }, []);

  // Cerrar dropdown cuando se hace click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (activeDropdown !== null) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [activeDropdown]);

  // Aplicar filtros y ordenación cuando cambian los libros o las opciones
  useEffect(() => {
    applyFiltersAndSort();
  }, [books, sortBy, filterBy]);

  // Update displayed books when itemsToShow changes
  useEffect(() => {
    setDisplayedBooks(filteredBooks.slice(0, itemsToShow));
  }, [filteredBooks, itemsToShow]);

  // Load more books function
  const loadMoreBooks = useCallback(() => {
    if (isLoadingMore || displayedBooks.length >= filteredBooks.length) return;
    
    setIsLoadingMore(true);
    setTimeout(() => {
      setItemsToShow(prev => prev + 10);
      setIsLoadingMore(false);
    }, 300); // Small delay to show loading state
  }, [isLoadingMore, displayedBooks.length, filteredBooks.length]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreBooks();
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => {
      if (sentinelRef.current) {
        observer.unobserve(sentinelRef.current);
      }
    };
  }, [loadMoreBooks]);

  const fetchBooks = async () => {
    setIsLoading(true);
    try {
      // Always prioritize the combined endpoint
      const response = await api.books.getAllWithProgress();
      
      if (response.ok) {
        const data = await response.json();
        
        if (Array.isArray(data)) {
          // Normalize progress data to ensure consistency
          const normalizedBooks = data.map((book: BookWithProgress) => ({
            ...book,
            progress: book.progress || {
              last_read_date: null,
              progress_percentage: 0,
              audiobook_position: null,
              scroll_position: 0
            }
          }));
          setBooks(normalizedBooks);
          return;
        } else {
          console.error('API response is not an array:', data);
          setBooks([]);
          return;
        }
      } else {
        throw new Error(`Combined endpoint failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching books with progress:', error);
      
      // Fallback to regular books endpoint (without individual progress calls for performance)
      try {
        console.warn('Falling back to regular books endpoint');
        const fallbackResponse = await api.books.getAll();
        
        if (fallbackResponse.ok) {
          const booksData = await fallbackResponse.json();
          // Set default progress for all books to avoid inconsistencies
          const booksWithDefaultProgress = booksData.map((book: Book) => ({
            ...book,
            progress: {
              last_read_date: null,
              progress_percentage: 0,
              audiobook_position: null,
              scroll_position: 0
            }
          }));
          setBooks(booksWithDefaultProgress);
        } else {
          throw new Error(`Fallback endpoint failed with status: ${fallbackResponse.status}`);
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        setBooks([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Función para aplicar filtros y ordenación
  const applyFiltersAndSort = () => {
    // Asegurarse de que books sea siempre un array
    let result = Array.isArray(books) ? [...books] : [];
    
    // Aplicar filtros
    if (filterBy !== 'all') {
      switch (filterBy) {
        case 'to_read':
          result = result.filter(book => book.status === 'To read');
          break;
        case 'reading':
          result = result.filter(book => book.status === 'Reading');
          break;
        case 'read':
          result = result.filter(book => book.status === 'Read');
          break;
        case 'with_ebook':
          result = result.filter(book => book.ebook_url || book.ebook_path);
          break;
        case 'with_audiobook':
          result = result.filter(book => book.audiobook_url || book.audiobook_path);
          break;
      }
    }
    
    // Aplicar ordenación
    result.sort((a, b) => {
      switch (sortBy) {
        case 'last_read':
          // Ordenar por fecha de última lectura (descendente)
          const aDate = a.progress?.last_read_date ? new Date(a.progress.last_read_date).getTime() : 0;
          const bDate = b.progress?.last_read_date ? new Date(b.progress.last_read_date).getTime() : 0;
          return bDate - aDate; // Orden descendente (más reciente primero)
        
        case 'title':
          // Ordenar por título (ascendente)
          return a.title.localeCompare(b.title);
          
        default:
          return 0;
      }
    });
    
    setFilteredBooks(result);
    // Reset items to show when filters/sort change
    setItemsToShow(10);
    setDisplayedBooks(result.slice(0, 10));
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Create FormData to handle both text fields and files
      const formData = new FormData();
      
      // Add all book data fields to FormData
      for (const [key, value] of Object.entries(newBook)) {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      }
      
      // Handle ebook file
      if (ebookFile) {
        const validEbookFormat = ebookFile.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'epub', 'mobi', 'txt'].includes(validEbookFormat || '')) {
          alert('Please select a PDF, EPUB, MOBI, or TXT file');
          return;
        }
        
        // Check file size and decide upload method
        if (ebookFile.size > 30 * 1024 * 1024) { // 30MB
          // Use direct upload for large files
          const directUrl = await uploadFileDirectly(ebookFile, 'ebook');
          formData.append('ebook_direct_url', directUrl);
        } else {
          // Use regular API upload for smaller files
          formData.append('ebook_file', ebookFile);
        }
        
        formData.append('ebook_format', validEbookFormat as string);
        formData.append('ebook_filename', ebookFile.name);
      }
      
      // Handle audiobook file
      if (audiobookFile) {
        const validAudioFormat = audiobookFile.name.split('.').pop()?.toLowerCase();
        if (!['mp3', 'm4a', 'wav', 'm4b', 'aac', 'ogg'].includes(validAudioFormat || '')) {
          alert('Please select a valid audio file');
          return;
        }
        
        console.log(`Audiobook file size: ${audiobookFile.size} bytes (${(audiobookFile.size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`Audiobook format: ${validAudioFormat}`);
        
        // Check file size and decide upload method
        if (audiobookFile.size > 30 * 1024 * 1024) { // 30MB
          console.log('Using direct upload for large audiobook file');
          // Use direct upload for large files
          const directUrl = await uploadFileDirectly(audiobookFile, 'audiobook');
          console.log(`Direct upload completed. URL: ${directUrl}`);
          formData.append('audiobook_direct_url', directUrl);
        } else {
          console.log('Using API upload for small audiobook file');
          // Use regular API upload for smaller files
          formData.append('audiobook_file', audiobookFile);
        }
        
        formData.append('audiobook_format', validAudioFormat as string);
        formData.append('audiobook_filename', audiobookFile.name);
      }
      
      // Handle transcription file
      if (transcriptionFile) {
        const validTranscriptionFormat = transcriptionFile.name.split('.').pop()?.toLowerCase();
        if (!['txt'].includes(validTranscriptionFormat || '')) {
          alert('Please select a TXT file for transcription');
          return;
        }
        
        // Check file size and decide upload method
        if (transcriptionFile.size > 30 * 1024 * 1024) { // 30MB
          // Use direct upload for large files
          const directUrl = await uploadFileDirectly(transcriptionFile, 'transcription');
          formData.append('transcription_direct_url', directUrl);
        } else {
          // Use regular API upload for smaller files
          formData.append('transcription_file', transcriptionFile);
        }
        
        formData.append('transcription_filename', transcriptionFile.name);
      }

      const response = await api.books.create(formData);
      
      if (response.ok) {
        setNewBook({});
        setIsAdding(false);
        setEbookFile(null);
        setAudiobookFile(null);
        setTranscriptionFile(null);
        
        if (ebookInputRef.current) ebookInputRef.current.value = '';
        if (audiobookInputRef.current) audiobookInputRef.current.value = '';
        if (transcriptionInputRef.current) transcriptionInputRef.current.value = '';
        
        fetchBooks(); // Refresh the book list
      } else {
        throw new Error('Error adding book');
      }
    } catch (error) {
      console.error('Error adding book:', error);
      alert(error instanceof Error ? error.message : 'Error adding book');
    }
  };

  const handleEditBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) {
      console.error('No book ID for editing');
      return;
    }
    
    try {
      const bookData = { ...newBook };
      delete bookData.id; // Remove id from update data
      
      // Create FormData to handle both text fields and files
      const formData = new FormData();
      
      // Add all book data fields to FormData
      for (const [key, value] of Object.entries(bookData)) {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      }
      
      // Add file fields if available
      if (ebookFile) {
        const validEbookFormat = ebookFile.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'epub', 'mobi', 'txt'].includes(validEbookFormat || '')) {
          alert('Please select a PDF, EPUB, MOBI, or TXT file');
          return;
        }
        
        // Check file size and decide upload method
        if (ebookFile.size > 30 * 1024 * 1024) { // 30MB
          // Use direct upload for large files
          const directUrl = await uploadFileDirectly(ebookFile, 'ebook');
          formData.append('ebook_direct_url', directUrl);
        } else {
          // Use regular API upload for smaller files
          formData.append('ebook_file', ebookFile);
        }
        
        formData.append('ebook_format', validEbookFormat as string);
        formData.append('ebook_filename', ebookFile.name);
      }
      
      if (audiobookFile) {
        const validAudioFormat = audiobookFile.name.split('.').pop()?.toLowerCase();
        if (!['mp3', 'm4a', 'wav', 'm4b', 'aac', 'ogg'].includes(validAudioFormat || '')) {
          alert('Please select a valid audio file');
          return;
        }
        
        console.log(`Audiobook file size: ${audiobookFile.size} bytes (${(audiobookFile.size / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`Audiobook format: ${validAudioFormat}`);
        
        // Check file size and decide upload method
        if (audiobookFile.size > 30 * 1024 * 1024) { // 30MB
          console.log('Using direct upload for large audiobook file (edit)');
          // Use direct upload for large files
          const directUrl = await uploadFileDirectly(audiobookFile, 'audiobook');
          console.log(`Direct upload completed (edit). URL: ${directUrl}`);
          formData.append('audiobook_direct_url', directUrl);
        } else {
          console.log('Using API upload for small audiobook file (edit)');
          // Use regular API upload for smaller files
          formData.append('audiobook_file', audiobookFile);
        }
        
        formData.append('audiobook_format', validAudioFormat as string);
        formData.append('audiobook_filename', audiobookFile.name);
      }
      
      // Handle transcription file
      if (transcriptionFile) {
        const validTranscriptionFormat = transcriptionFile.name.split('.').pop()?.toLowerCase();
        if (!['txt'].includes(validTranscriptionFormat || '')) {
          alert('Please select a TXT file for transcription');
          return;
        }
        
        // Check file size and decide upload method
        if (transcriptionFile.size > 30 * 1024 * 1024) { // 30MB
          // Use direct upload for large files
          const directUrl = await uploadFileDirectly(transcriptionFile, 'transcription');
          formData.append('transcription_direct_url', directUrl);
        } else {
          // Use regular API upload for smaller files
          formData.append('transcription_file', transcriptionFile);
        }
        
        formData.append('transcription_filename', transcriptionFile.name);
      }
      
      const response = await api.books.update(editingId, formData);
      
      if (response.ok) {
        fetchBooks();
        setNewBook({});
        setEditingId(null);
        setIsAdding(false);
        setEbookFile(null);
        setAudiobookFile(null);
        setTranscriptionFile(null);
      } else {
        const error = await response.json();
        console.error('Error updating book:', error);
        alert('Error updating book');
      }
    } catch (error) {
      console.error('Error updating book:', error);
      alert('Error connecting to server');
    }
  };

  const handleDeleteBook = async (id: number) => {
    try {
      const response = await api.books.delete(id);
      
      if (response.ok) {
        fetchBooks();
        setIsDeleteModalOpen(false);
        setBookToDelete(null);
      }
    } catch (error) {
      console.error('Error deleting book:', error);
    }
  };

  const startEditing = (book: Book) => {
    setEditingId(book.id || null);
    setNewBook(book);
    setIsAdding(true);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setNewBook({});
    setIsAdding(false);
    setEbookFile(null);
    setAudiobookFile(null);
  };



  const handleCardClick = (bookId: number) => {
    router.push(`/book/${bookId}`);
  };

  const openDeleteModal = (id: number) => {
    setBookToDelete(id);
    setIsDeleteModalOpen(true);
  };

  // Funciones para manejar filtros y ordenación
  const handleSortChange = (option: SortOption) => {
    setSortBy(option);
    setShowSortOptions(false);
  };

  const handleFilterChange = (option: FilterOption) => {
    setFilterBy(option);
    setShowFilterOptions(false);
  };

  const handleViewModeChange = () => {
    const newViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newViewMode);
    localStorage.setItem('bookLibraryViewMode', newViewMode);
  };

  const getStatusIcon = (status: string) => {
    const getStatusClass = (status: string) => {
      switch (status) {
        case 'Read':
          return `${styles.statusIcon} ${styles.read}`;
        case 'Reading':
          return `${styles.statusIcon} ${styles.reading}`;
        case 'To read':
          return `${styles.statusIcon} ${styles.toread}`;
        default:
          return styles.statusIcon;
      }
    };

    switch (status) {
      case 'Read':
        return <BsCheckCircleFill className={getStatusClass(status)} />;
      case 'Reading':
        return <BsEyeFill className={getStatusClass(status)} />;
      case 'To read':
        return <BsBookmarkFill className={getStatusClass(status)} />;
      default:
        return null;
    }
  };

  const getProgressPercentage = (book: BookWithProgress) => {
    if (book.status === 'Read') return 100;
    return book.progress?.progress_percentage || 0;
  };

  const toggleDropdown = (bookId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveDropdown(activeDropdown === bookId ? null : bookId);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerActions}>
          {/* Primera fila: Botones de filtro y ordenación */}
          <div className={styles.filterSortContainer}>
            <div className={styles.dropdown}>
              <button 
                onClick={() => setShowSortOptions(!showSortOptions)}
                className={styles.filterButton}
              >
                <BiSort size={14} />
                <span>Sort: {getSortLabel(sortBy)}</span>
              </button>
              {showSortOptions && (
                <div className={styles.dropdownContent}>
                  <button 
                    onClick={() => handleSortChange('last_read')}
                    className={sortBy === 'last_read' ? styles.active : ''}
                  >
                    Last Read
                  </button>
                  <button 
                    onClick={() => handleSortChange('title')}
                    className={sortBy === 'title' ? styles.active : ''}
                  >
                    Title
                  </button>
                </div>
              )}
            </div>

            <div className={styles.dropdown}>
              <button 
                onClick={() => setShowFilterOptions(!showFilterOptions)}
                className={styles.filterButton}
              >
                <BiFilter size={14} />
                <span>Filter: {getFilterLabel(filterBy)}</span>
              </button>
              {showFilterOptions && (
                <div className={styles.dropdownContent}>
                  <button 
                    onClick={() => handleFilterChange('all')}
                    className={filterBy === 'all' ? styles.active : ''}
                  >
                    All Books
                  </button>
                  <button 
                    onClick={() => handleFilterChange('to_read')}
                    className={filterBy === 'to_read' ? styles.active : ''}
                  >
                    To Read
                  </button>
                  <button 
                    onClick={() => handleFilterChange('reading')}
                    className={filterBy === 'reading' ? styles.active : ''}
                  >
                    Reading
                  </button>
                  <button 
                    onClick={() => handleFilterChange('read')}
                    className={filterBy === 'read' ? styles.active : ''}
                  >
                    Read
                  </button>
                  <button 
                    onClick={() => handleFilterChange('with_ebook')}
                    className={filterBy === 'with_ebook' ? styles.active : ''}
                  >
                    With Ebook
                  </button>
                  <button 
                    onClick={() => handleFilterChange('with_audiobook')}
                    className={filterBy === 'with_audiobook' ? styles.active : ''}
                  >
                    With Audiobook
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Segunda fila: View toggle y Add button */}
          <div className={styles.secondRow}>
            <button 
              onClick={handleViewModeChange}
              className={styles.viewToggleButton}
              title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
            >
              {viewMode === 'grid' ? <BsList size={16} /> : <BsGrid3X3Gap size={16} />}
            </button>

            <button 
              onClick={() => setIsAdding(true)}
              className={styles.addButton}
            >
              <BiPlus size={14} />
              <span>Add Book Manually</span>
            </button>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={isAdding} 
        onClose={cancelEditing}
        title={editingId ? "Edit Book" : "Add Book"}
      >
        <form onSubmit={editingId ? handleEditBook : handleAddBook} className={styles.form}>
          <input
            type="text"
            placeholder="Title"
            value={newBook.title || ''}
            onChange={(e) => setNewBook({...newBook, title: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Author"
            value={newBook.author || ''}
            onChange={(e) => setNewBook({...newBook, author: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Cover URL"
            value={newBook.cover_url || ''}
            onChange={(e) => setNewBook({...newBook, cover_url: e.target.value})}
          />
          <input
            type="text"
            placeholder="ISBN"
            value={newBook.isbn || ''}
            onChange={(e) => setNewBook({...newBook, isbn: e.target.value})}
          />
          <input
            type="text"
            placeholder="Publisher"
            value={newBook.publisher || ''}
            onChange={(e) => setNewBook({...newBook, publisher: e.target.value})}
          />
          <input
            type="number"
            placeholder="Publication year"
            value={newBook.publish_year || ''}
            onChange={(e) => setNewBook({...newBook, publish_year: parseInt(e.target.value)})}
          />
          <input
            type="number"
            placeholder="Number of pages"
            value={newBook.pages || ''}
            onChange={(e) => setNewBook({...newBook, pages: parseInt(e.target.value)})}
          />
          <input
            type="text"
            placeholder="Language"
            value={newBook.language || ''}
            onChange={(e) => setNewBook({...newBook, language: e.target.value})}
          />
          <select
            value={newBook.status || 'To read'}
            onChange={(e) => {
              const status = e.target.value as BookStatus;
              setNewBook({...newBook, status});
            }}
          >
            <option value="To read">To read</option>
            <option value="Reading">Reading</option>
            <option value="Read">Read</option>
          </select>
          {(newBook.status as string === 'Reading' || newBook.status as string === 'Read') && (
            <input
              type="date"
              placeholder="Start date"
              value={newBook.start_date || ''}
              onChange={(e) => setNewBook({...newBook, start_date: e.target.value})}
            />
          )}
          {newBook.status as string === 'Read' && (
            <input
              type="date"
              placeholder="Finish date"
              value={newBook.finish_date || ''}
              onChange={(e) => setNewBook({...newBook, finish_date: e.target.value})}
            />
          )}
          <textarea
            placeholder="Description"
            value={newBook.description || ''}
            onChange={(e) => setNewBook({...newBook, description: e.target.value})}
          />
          <textarea
            placeholder="Personal notes"
            value={newBook.notes || ''}
            onChange={(e) => setNewBook({...newBook, notes: e.target.value})}
          />

          <div className={styles.resourceSection}>
            <h4>📚 Ebook</h4>
            <div className={styles.fileInputContainer}>
              <input
                type="text"
                placeholder="Ebook URL"
                value={newBook.ebook_url || ''}
                onChange={(e) => setNewBook({...newBook, ebook_url: e.target.value})}
              />
              <input
                type="text"
                placeholder="Local ebook path"
                value={newBook.ebook_path || ''}
                onChange={(e) => setNewBook({...newBook, ebook_path: e.target.value})}
                readOnly
              />
              <button
                type="button"
                onClick={() => ebookInputRef.current?.click()}
                className={styles.browseButton}
              >
                Browse
              </button>
              <input
                ref={ebookInputRef}
                type="file"
                accept=".pdf,.epub,.txt,.mobi"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setEbookFile(file);
                    setNewBook({
                      ...newBook, 
                      ebook_path: file.name
                    });
                  }
                }}
              />
            </div>
            <select
              value={newBook.ebook_format || ''}
              onChange={(e) => setNewBook({...newBook, ebook_format: e.target.value as EbookFormat})}
            >
              <option value="">Select format</option>
              <option value="pdf">PDF</option>
              <option value="epub">EPUB</option>
              <option value="txt">TXT</option>
              <option value="mobi">MOBI</option>
            </select>
          </div>

          <div className={styles.resourceSection}>
            <h4>🎧 Audiobook</h4>
            <div className={styles.fileInputContainer}>
              <input
                type="text"
                placeholder="Audiobook URL"
                value={newBook.audiobook_url || ''}
                onChange={(e) => setNewBook({...newBook, audiobook_url: e.target.value})}
              />
              <input
                type="text"
                placeholder="Local audiobook path"
                value={newBook.audiobook_path || ''}
                onChange={(e) => setNewBook({...newBook, audiobook_path: e.target.value})}
                readOnly
              />
              <button
                type="button"
                onClick={() => audiobookInputRef.current?.click()}
                className={styles.browseButton}
              >
                Browse
              </button>
              <input
                ref={audiobookInputRef}
                type="file"
                accept=".mp3,.m4b,.aac,.ogg,.m4a,.wav"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAudiobookFile(file);
                    setNewBook({
                      ...newBook, 
                      audiobook_path: file.name
                    });
                  }
                }}
              />
            </div>
            
            <div className={styles.fileInputGroup}>
              <label>Transcription File (optional):</label>
              <input
                type="text"
                placeholder="Transcription file (TXT)"
                value={transcriptionFile?.name || newBook?.transcription_path || ''}
                readOnly
                className={styles.filePathInput}
              />
              <button
                type="button"
                onClick={() => transcriptionInputRef.current?.click()}
                className={styles.browseButton}
              >
                Browse
              </button>
              <input
                ref={transcriptionInputRef}
                type="file"
                accept=".txt"
                className={styles.hiddenInput}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setTranscriptionFile(file);
                    setNewBook({
                      ...newBook, 
                      transcription_path: file.name
                    });
                  }
                }}
              />
            </div>
            <select
              value={newBook.audiobook_format || ''}
              onChange={(e) => setNewBook({...newBook, audiobook_format: e.target.value as AudiobookFormat})}
            >
              <option value="">Select format</option>
              <option value="mp3">MP3</option>
              <option value="m4b">M4B</option>
              <option value="aac">AAC</option>
              <option value="ogg">OGG</option>
              <option value="m4a">M4A</option>
              <option value="wav">WAV</option>
            </select>
          </div>

          <div className={styles.formActions}>
            <button 
              type="button"
              onClick={cancelEditing}
              className={styles.cancelButton}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className={styles.submitButton}
            >
              {editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Deletion"
      >
        <div className={styles.deleteModal}>
          <p>Are you sure you want to delete this book?</p>
          <div className={styles.deleteModalActions}>
            <button
              onClick={() => bookToDelete && handleDeleteBook(bookToDelete)}
              className={styles.deleteButton}
            >
              Delete
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <div className={`${styles.bookList} ${viewMode === 'list' ? styles.listView : styles.gridView}`}>
        {isLoading ? (
          // Skeleton loader
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.bookCardSkeleton}>
              <div className={styles.coverSkeleton} />
              <div className={styles.infoSkeleton}>
                <div className={styles.titleSkeleton} />
                <div className={styles.authorSkeleton} />
                <div className={styles.statusSkeleton} />
              </div>
            </div>
          ))
        ) : filteredBooks.length === 0 ? (
          <div className={styles.noBooks}>
            <p>No books found with the current filters.</p>
          </div>
        ) : (
          <>
            {displayedBooks.map((book) => (
            <div 
              key={book.id} 
              className={styles.bookCard}
              onClick={() => handleCardClick(book.id!)}
              style={{ cursor: 'pointer' }}
            >
              {book.cover_url && (
                <div className={styles.coverContainer}>
                  <img
                    src={book.cover_url}
                    alt={book.title}
                    className={styles.bookCover}
                  />
                </div>
              )}

              <div className={styles.bookInfo}>
                <div className={styles.bookBasicInfo}>
                  <div className={styles.bookHeader}>
                    <div className={styles.bookTitleSection}>
                      <h3>{book.title}</h3>
                      <p className={styles.author}>By {book.author}</p>
                    </div>
                    
                    <div className={styles.bookActions}>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(book);
                        }}
                        className={styles.editButton}
                        title="Edit book"
                      >
                        <BiEdit size={16} />
                      </button>
                      
                      <div className={styles.dropdown}>
                        <button 
                          onClick={(e) => toggleDropdown(book.id!, e)}
                          className={styles.optionsButton}
                          title="More options"
                        >
                          <BiDotsVerticalRounded size={16} />
                        </button>
                        {activeDropdown === book.id && (
                          <div className={styles.dropdownContent}>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteModal(book.id!);
                                setActiveDropdown(null);
                              }}
                              className={styles.deleteOption}
                            >
                              <MdDelete size={14} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={styles.statusAndProgress}>
                    {/* Show status section only for non-Read books */}
                    {!(book.status?.toLowerCase() === 'read' || book.status?.toLowerCase() === 'leído') && (
                      <div className={styles.statusSection}>
                        {getStatusIcon(book.status || 'To read')}
                        <span className={`${styles.statusText} ${styles[book.status?.toLowerCase() || '']}`}>
                          {book.status}
                        </span>
                      </div>
                    )}
                    
                    {/* Show progress bar only for "Reading" books with progress > 0 */}
                    {(book.status?.toLowerCase() === 'reading' || book.status?.toLowerCase() === 'leyendo') && getProgressPercentage(book) > 0 && (
                      <div className={styles.progressSection}>
                        <div className={styles.progressBar}>
                          <div 
                            className={styles.progressFill}
                            style={{ width: `${getProgressPercentage(book)}%` }}
                          />
                        </div>
                        <span className={styles.progressText}>
                          {Math.round(getProgressPercentage(book))}%
                        </span>
                      </div>
                    )}
                    
                    {/* Show "Read" badge for completed books */}
                    {(book.status?.toLowerCase() === 'read' || book.status?.toLowerCase() === 'leído') && (
                      <div className={styles.readBadge}>
                        READ
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            ))}
            
            {/* Lazy loading sentinel */}
            {displayedBooks.length < filteredBooks.length && (
              <div ref={sentinelRef} className={styles.sentinelElement}>
                {isLoadingMore && (
                  <div className={styles.loadingMore}>
                    <div className={styles.spinner}></div>
                    <p>Loading more books...</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Funciones auxiliares para obtener etiquetas legibles
function getSortLabel(option: SortOption): string {
  switch (option) {
    case 'last_read': return 'Last Read';
    case 'title': return 'Title';
    default: return 'Last Read';
  }
}

function getFilterLabel(option: FilterOption): string {
  switch (option) {
    case 'all': return 'All Books';
    case 'to_read': return 'To Read';
    case 'reading': return 'Reading';
    case 'read': return 'Read';
    case 'with_ebook': return 'With Ebook';
    case 'with_audiobook': return 'With Audiobook';
    default: return 'All Books';
  }
} 