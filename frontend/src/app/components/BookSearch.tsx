'use client';
import { useState, useEffect } from 'react';
import { OpenLibraryBook, OpenLibraryResponse } from '../types/OpenLibrary';
import { Book, BookStatus } from '../types/Book';
import styles from './BookSearch.module.css';

interface BookSearchProps {
  onAddBook: (book: Book) => void;
}

export default function BookSearch({ onAddBook }: BookSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OpenLibraryBook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const searchBooks = async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&page=${page}`
        );
        const data: OpenLibraryResponse = await response.json();
        
        setResults(data.docs);
        setHasMore(data.numFound > page * 100);
      } catch (error) {
        console.error('Error searching books:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchBooks, 500);
    return () => clearTimeout(timeoutId);
  }, [query, page]);

  const handleAddBook = (openLibraryBook: OpenLibraryBook) => {
    const newBook: Book = {
      title: openLibraryBook.title,
      author: openLibraryBook.author_name?.[0] || 'Unknown author',
      cover_url: openLibraryBook.cover_i 
        ? `https://covers.openlibrary.org/b/id/${openLibraryBook.cover_i}-L.jpg`
        : undefined,
      isbn: openLibraryBook.isbn?.[0],
      publisher: openLibraryBook.publisher?.[0],
      publish_year: openLibraryBook.first_publish_year,
      language: openLibraryBook.language?.[0],
      status: 'To read' as BookStatus,
      description: '',  // OpenLibrary doesn't provide descriptions in search
      notes: '',
    };

    onAddBook(newBook);
  };

  const getCoverUrl = (coverId: number) => 
    `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchHeader}>
        <div className={styles.searchInputWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, ISBN..."
            className={styles.searchInput}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className={styles.clearButton}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Searching books...</p>
        </div>
      ) : results.length > 0 ? (
        <>
          <div className={styles.resultsGrid}>
            {results.map((book) => (
              <div key={book.key} className={styles.bookCard}>
                {book.cover_i && (
                  <div className={styles.coverContainer}>
                    <img
                      src={getCoverUrl(book.cover_i)}
                      alt={book.title}
                      className={styles.bookCover}
                    />
                  </div>
                )}
                <div className={styles.bookInfo}>
                  <h3>{book.title}</h3>
                  {book.author_name && <p className={styles.author}>By {book.author_name[0]}</p>}
                  <div className={styles.bookDetails}>
                    {book.first_publish_year && (
                      <span className={styles.detail}>📅 {book.first_publish_year}</span>
                    )}
                    {book.publisher && (
                      <span className={styles.detail}>📚 {book.publisher[0]}</span>
                    )}
                    {book.language && (
                      <span className={styles.detail}>🌍 {book.language[0]}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleAddBook(book)}
                    className={styles.addButton}
                  >
                    Add to my library
                  </button>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <button
              onClick={() => setPage(p => p + 1)}
              className={styles.loadMoreButton}
              disabled={isLoading}
            >
              Load more results
            </button>
          )}
        </>
      ) : query && !isLoading && (
        <div className={styles.noResults}>
          <p>No results found for "{query}"</p>
          <p>Try with different search terms</p>
        </div>
      )}
    </div>
  );
} 