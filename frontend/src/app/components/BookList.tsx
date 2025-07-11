'use client';
import { useState, useEffect, useRef } from 'react';
import { Book, BookStatus, EbookFormat, AudiobookFormat } from '../types/Book';
import styles from './BookList.module.css';
import ReadingProgressTracker from './ReadingProgress';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import { BiPlus, BiSort, BiFilter } from 'react-icons/bi';
import { api } from '../services/api';

// Tipos para los filtros y ordenación
type SortOption = 'last_read' | 'title';
type FilterOption = 'all' | 'to_read' | 'reading' | 'read' | 'with_ebook' | 'with_audiobook';

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
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const router = useRouter();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<number | null>(null);
  const [ebookFile, setEbookFile] = useState<File | null>(null);
  const [audiobookFile, setAudiobookFile] = useState<File | null>(null);
  
  // Estados para filtros y ordenación
  const [sortBy, setSortBy] = useState<SortOption>('last_read');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [showSortOptions, setShowSortOptions] = useState(false);
  const [showFilterOptions, setShowFilterOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Helper function for direct upload to Cloud Storage
  const uploadFileDirectly = async (file: File, fileType: 'ebook' | 'audiobook'): Promise<string> => {
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
  }, []);

  // Aplicar filtros y ordenación cuando cambian los libros o las opciones
  useEffect(() => {
    applyFiltersAndSort();
  }, [books, sortBy, filterBy]);

  const fetchBooks = async () => {
    setIsLoading(true);
    try {
      // Try the endpoint with progress first
      let response = await api.books.getAllWithProgress();
      
      if (response.ok) {
        const data = await response.json();
        
        if (Array.isArray(data)) {
          setBooks(data);
          return;
        } else {
          console.error('API response is not an array:', data);
          setBooks([]);
        }
      } else {
        // If that fails, use the regular books endpoint and load progress separately
        console.warn('Endpoint with progress failed, falling back to regular books endpoint');
        response = await api.books.getAll();
        
        if (!response.ok) {
          throw new Error(`Error fetching books: ${response.status}`);
        }
        
        const booksData = await response.json();
        
        // Load progress separately for each book
        const booksWithProgress = await Promise.all(
          booksData.map(async (book: Book) => {
            try {
              if (book.id) {
                const progressResponse = await api.progress.get(book.id);
                if (progressResponse.ok) {
                  const progressData = await progressResponse.json();
                  return {
                    ...book,
                    progress: {
                      last_read_date: progressData.last_read_date,
                      progress_percentage: progressData.progress_percentage || 0,
                      audiobook_position: progressData.audiobook_position,
                      scroll_position: progressData.scroll_position || 0
                    }
                  };
                }
              }
              return { ...book, progress: { last_read_date: null, progress_percentage: 0, audiobook_position: null, scroll_position: 0 } };
            } catch (e) {
              return { ...book, progress: { last_read_date: null, progress_percentage: 0, audiobook_position: null, scroll_position: 0 } };
            }
          })
        );
        
        setBooks(booksWithProgress);
      }
    } catch (error) {
      console.error('Error fetching books:', error);
      setBooks([]);
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

      const response = await api.books.create(formData);
      
      if (response.ok) {
        setNewBook({});
        setIsAdding(false);
        setEbookFile(null);
        setAudiobookFile(null);
        
        if (ebookInputRef.current) ebookInputRef.current.value = '';
        if (audiobookInputRef.current) audiobookInputRef.current.value = '';
        
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
      
      const response = await api.books.update(editingId, formData);
      
      if (response.ok) {
        fetchBooks();
        setNewBook({});
        setEditingId(null);
        setIsAdding(false);
        setEbookFile(null);
        setAudiobookFile(null);
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

  const toggleCardExpansion = (bookId: number) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bookId)) {
        newSet.delete(bookId);
      } else {
        newSet.add(bookId);
      }
      return newSet;
    });
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerActions}>
          {/* Botones de filtro y ordenación */}
          <div className={styles.filterSortContainer}>
            <div className={styles.dropdown}>
              <button 
                onClick={() => setShowSortOptions(!showSortOptions)}
                className={styles.filterButton}
              >
                <BiSort size={16} />
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
                <BiFilter size={16} />
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

          <button 
            onClick={() => setIsAdding(true)}
            className={styles.addButton}
          >
            <BiPlus size={16} />
            <span>Add Book Manually</span>
          </button>
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

      <div className={styles.bookList}>
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
          filteredBooks.map((book) => (
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
                  <h3>{book.title}</h3>
                  <p className={styles.author}>By {book.author}</p>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCardExpansion(book.id!);
                    }}
                    className={styles.expandButton}
                  >
                    {expandedCards.has(book.id!) ? 'Show less' : 'Show more'}
                  </button>
                </div>

                <div className={`${styles.expandableContent} ${expandedCards.has(book.id!) ? styles.expanded : ''}`}>
                  <div className={styles.status}>
                    <span className={`${styles.statusBadge} ${styles[book.status?.toLowerCase() || '']}`}>
                      {book.status}
                    </span>
                  </div>

                  {book.progress?.last_read_date && (
                    <p className={styles.lastRead}>
                      Last read: {new Date(book.progress.last_read_date).toLocaleDateString()}
                    </p>
                  )}

                  {book.publisher && (
                    <p className={styles.publisher}>
                      {book.publisher}, {book.publish_year}
                    </p>
                  )}

                  {book.description && (
                    <div className={styles.description}>{book.description}</div>
                  )}

                  {book.start_date && (
                    <p className={styles.dates}>
                      Started: {new Date(book.start_date).toLocaleDateString()}
                      {book.finish_date && ` - Finished: ${new Date(book.finish_date).toLocaleDateString()}`}
                    </p>
                  )}

                  {book.notes && (
                    <div className={styles.notes}>
                      <h4>Notes:</h4>
                      <p>{book.notes}</p>
                    </div>
                  )}

                  <ReadingProgressTracker 
                    bookId={book.id!}
                    totalPages={book.pages}
                    hasAudiobook={Boolean(book.audiobook_url || book.audiobook_path)}
                    onClick={(e) => e.stopPropagation()}
                  />

                  <div className={styles.bookResources}>
                    {(book.ebook_url || book.ebook_path) && (
                      <div className={styles.resourceSection}>
                        <h4>📚 Ebook</h4>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/book/${book.id}/read`);
                          }}
                          className={styles.actionButton}
                        >
                          {(book.progress?.progress_percentage || 0) > 0 ? 'Continue Reading' : 'Read Online'}
                        </button>
                      </div>
                    )}

                    {(book.audiobook_url || book.audiobook_path) && (
                      <div className={styles.resourceSection}>
                        <h4>🎧 Audiobook</h4>
                        <a 
                          href={book.audiobook_url || `/api/books/${book.id}/listen`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={styles.actionButton}
                        >
                          Listen Online
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.bookActions}>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditing(book);
                  }}
                  className={styles.editButton}
                >
                  Edit
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteModal(book.id!);
                  }}
                  className={styles.deleteButton}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
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