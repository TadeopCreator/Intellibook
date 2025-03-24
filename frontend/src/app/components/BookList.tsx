'use client';
import { useState, useEffect, useRef } from 'react';
import { Book, BookStatus, EbookFormat, AudiobookFormat } from '../types/Book';
import styles from './BookList.module.css';
import ReadingProgressTracker from './ReadingProgress';
import { useRouter } from 'next/navigation';
import Modal from './Modal';
import { BiPlus } from 'react-icons/bi';
import { API_URL } from '../config/api';

export default function BookList() {
  const [books, setBooks] = useState<Book[]>([]);
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

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const response = await fetch(`${API_URL}/api/books/`);
      const data = await response.json();
      setBooks(data);
    } catch (error) {
      console.error('Error fetching books:', error);
    }
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
      
      // Add file fields if available
      if (ebookFile) {
        const validEbookFormat = ebookFile.name.split('.').pop()?.toLowerCase();
        if (!['pdf', 'epub', 'mobi', 'txt'].includes(validEbookFormat || '')) {
          alert('Por favor selecciona un archivo PDF, EPUB, MOBI o TXT');
          return;
        }
        
        formData.append('ebook_file', ebookFile);
        formData.append('ebook_format', validEbookFormat as string);
        formData.append('ebook_filename', ebookFile.name);
      }
      
      if (audiobookFile) {
        const validAudioFormat = audiobookFile.name.split('.').pop()?.toLowerCase();
        if (!['mp3', 'm4a', 'wav', 'm4b', 'aac', 'ogg'].includes(validAudioFormat || '')) {
          alert('Por favor selecciona un archivo de audio válido');
          return;
        }
        
        formData.append('audiobook_file', audiobookFile);
        formData.append('audiobook_format', validAudioFormat as string);
        formData.append('audiobook_filename', audiobookFile.name);
      }

      // Send request with FormData instead of JSON
      const response = await fetch(`${API_URL}/api/books/`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary for FormData
      });
      
      if (response.ok) {
        fetchBooks();
        setNewBook({});
        setIsAdding(false);
        setEbookFile(null);
        setAudiobookFile(null);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al agregar el libro');
      }
    } catch (error) {
      console.error('Error adding book:', error);
      alert('Error al agregar el libro: ' + error.message);
    }
  };

  const handleEditBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;

    try {
      const { id, created_at, ...bookData } = newBook;
      
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
          alert('Por favor selecciona un archivo PDF, EPUB, MOBI o TXT');
          return;
        }
        
        formData.append('ebook_file', ebookFile);
        formData.append('ebook_format', validEbookFormat as string);
        formData.append('ebook_filename', ebookFile.name);
      }
      
      if (audiobookFile) {
        const validAudioFormat = audiobookFile.name.split('.').pop()?.toLowerCase();
        if (!['mp3', 'm4a', 'wav', 'm4b', 'aac', 'ogg'].includes(validAudioFormat || '')) {
          alert('Por favor selecciona un archivo de audio válido');
          return;
        }
        
        formData.append('audiobook_file', audiobookFile);
        formData.append('audiobook_format', validAudioFormat as string);
        formData.append('audiobook_filename', audiobookFile.name);
      }
      
      const response = await fetch(`${API_URL}/api/books/${editingId}`, {
        method: 'PUT',
        body: formData,
        // Don't set Content-Type header - browser will set it with boundary for FormData
      });
      
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
        alert('Error al actualizar el libro');
      }
    } catch (error) {
      console.error('Error updating book:', error);
      alert('Error al conectar con el servidor');
    }
  };

  const handleDeleteBook = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/api/books/${id}`, {
        method: 'DELETE',
      });
      
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Mi Biblioteca</h2>
        <button 
          onClick={() => setIsAdding(true)}
          className={styles.addButton}
        >
          <BiPlus size={20} />
          <span>Agregar Libro Manualmente</span>
        </button>
      </div>

      <Modal 
        isOpen={isAdding} 
        onClose={cancelEditing}
        title={editingId ? "Editar Libro" : "Agregar Libro"}
      >
        <form onSubmit={editingId ? handleEditBook : handleAddBook} className={styles.form}>
          <input
            type="text"
            placeholder="Título"
            value={newBook.title || ''}
            onChange={(e) => setNewBook({...newBook, title: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="Autor"
            value={newBook.author || ''}
            onChange={(e) => setNewBook({...newBook, author: e.target.value})}
            required
          />
          <input
            type="text"
            placeholder="URL de la portada"
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
            placeholder="Editorial"
            value={newBook.publisher || ''}
            onChange={(e) => setNewBook({...newBook, publisher: e.target.value})}
          />
          <input
            type="number"
            placeholder="Año de publicación"
            value={newBook.publish_year || ''}
            onChange={(e) => setNewBook({...newBook, publish_year: parseInt(e.target.value)})}
          />
          <input
            type="number"
            placeholder="Número de páginas"
            value={newBook.pages || ''}
            onChange={(e) => setNewBook({...newBook, pages: parseInt(e.target.value)})}
          />
          <input
            type="text"
            placeholder="Idioma"
            value={newBook.language || ''}
            onChange={(e) => setNewBook({...newBook, language: e.target.value})}
          />
          <select
            value={newBook.status || 'Por leer'}
            onChange={(e) => setNewBook({...newBook, status: e.target.value as BookStatus})}
          >
            <option value="Por leer">Por leer</option>
            <option value="Leyendo">Leyendo</option>
            <option value="Leído">Leído</option>
          </select>
          {(newBook.status === 'Leyendo' || newBook.status === 'Leído') && (
            <input
              type="date"
              placeholder="Fecha de inicio"
              value={newBook.start_date || ''}
              onChange={(e) => setNewBook({...newBook, start_date: e.target.value})}
            />
          )}
          {newBook.status === 'Leído' && (
            <input
              type="date"
              placeholder="Fecha de finalización"
              value={newBook.finish_date || ''}
              onChange={(e) => setNewBook({...newBook, finish_date: e.target.value})}
            />
          )}
          <textarea
            placeholder="Descripción"
            value={newBook.description || ''}
            onChange={(e) => setNewBook({...newBook, description: e.target.value})}
          />
          <textarea
            placeholder="Notas personales"
            value={newBook.notes || ''}
            onChange={(e) => setNewBook({...newBook, notes: e.target.value})}
          />

          <div className={styles.resourceSection}>
            <h4>📚 Libro Digital</h4>
            <div className={styles.fileInputContainer}>
              <input
                type="text"
                placeholder="URL del libro digital"
                value={newBook.ebook_url || ''}
                onChange={(e) => setNewBook({...newBook, ebook_url: e.target.value})}
              />
              <input
                type="text"
                placeholder="Ruta local del libro digital"
                value={newBook.ebook_path || ''}
                onChange={(e) => setNewBook({...newBook, ebook_path: e.target.value})}
                readOnly
              />
              <button
                type="button"
                onClick={() => ebookInputRef.current?.click()}
                className={styles.browseButton}
              >
                Explorar
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
              <option value="">Seleccionar formato</option>
              <option value="pdf">PDF</option>
              <option value="epub">EPUB</option>
              <option value="txt">TXT</option>
              <option value="mobi">MOBI</option>
            </select>
          </div>

          <div className={styles.resourceSection}>
            <h4>🎧 Audiolibro</h4>
            <div className={styles.fileInputContainer}>
              <input
                type="text"
                placeholder="URL del audiolibro"
                value={newBook.audiobook_url || ''}
                onChange={(e) => setNewBook({...newBook, audiobook_url: e.target.value})}
              />
              <input
                type="text"
                placeholder="Ruta local del audiolibro"
                value={newBook.audiobook_path || ''}
                onChange={(e) => setNewBook({...newBook, audiobook_path: e.target.value})}
                readOnly
              />
              <button
                type="button"
                onClick={() => audiobookInputRef.current?.click()}
                className={styles.browseButton}
              >
                Explorar
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
              <option value="">Seleccionar formato</option>
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
              Cancelar
            </button>
            <button 
              type="submit"
              className={styles.submitButton}
            >
              {editingId ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirmar Eliminación"
      >
        <div className={styles.deleteModal}>
          <p>¿Estás seguro de que quieres eliminar este libro?</p>
          <div className={styles.deleteModalActions}>
            <button
              onClick={() => bookToDelete && handleDeleteBook(bookToDelete)}
              className={styles.deleteButton}
            >
              Eliminar
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className={styles.cancelButton}
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>

      <div className={styles.bookList}>
        {books.map((book) => (
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
                <p className={styles.author}>Por {book.author}</p>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCardExpansion(book.id!);
                  }}
                  className={styles.expandButton}
                >
                  {expandedCards.has(book.id!) ? 'Mostrar menos' : 'Mostrar más'}
                </button>
              </div>

              <div className={`${styles.expandableContent} ${expandedCards.has(book.id!) ? styles.expanded : ''}`}>
                <div className={styles.status}>
                  <span className={`${styles.statusBadge} ${styles[book.status?.toLowerCase() || '']}`}>
                    {book.status}
                  </span>
                </div>

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
                    Comenzado: {new Date(book.start_date).toLocaleDateString()}
                    {book.finish_date && ` - Terminado: ${new Date(book.finish_date).toLocaleDateString()}`}
                  </p>
                )}

                {book.notes && (
                  <div className={styles.notes}>
                    <h4>Notas:</h4>
                    <p>{book.notes}</p>
                  </div>
                )}

                <ReadingProgressTracker 
                  bookId={book.id!}
                  totalPages={book.pages}
                  hasAudiobook={Boolean(book.audiobook_url || book.audiobook_path)}
                  onClick={(e) => e.stopPropagation()}
                />

                {(book.ebook_url || book.audiobook_url) && (
                  <div className={styles.bookResources}>
                    {book.ebook_url && (
                      <div className={styles.resourceSection}>
                        <h4>📚 Libro Digital</h4>
                        <a 
                          href={book.ebook_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={styles.actionButton}
                        >
                          Leer Online
                        </a>
                      </div>
                    )}

                    {book.audiobook_url && (
                      <div className={styles.resourceSection}>
                        <h4>🎧 Audiolibro</h4>
                        <a 
                          href={book.audiobook_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={styles.actionButton}
                        >
                          Escuchar Online
                        </a>
                      </div>
                    )}
                  </div>
                )}
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
                Editar
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteModal(book.id!);
                }}
                className={styles.deleteButton}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 