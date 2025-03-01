'use client';
import { useState } from 'react';
import styles from "./library.module.css";
import BookList from '../components/BookList';
import BookSearch from '../components/BookSearch';
import NavMenu from '../components/NavMenu';
import { BiSearch, BiArrowBack } from 'react-icons/bi';
import { API_URL } from '../config/api';

export default function Library() {
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddBook = async (book: any) => {
    try {
      const response = await fetch(`${API_URL}/api/books/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(book),
      });
      
      if (response.ok) {
        setIsSearching(false);
        setError(null);
      } else {
        throw new Error('Error al añadir el libro');
      }
    } catch (error) {
      console.error('Error adding book:', error);
      setError(error instanceof Error ? error.message : 'Error al añadir el libro');
    }
  };

  return (
    <div className={styles.container}>
      <NavMenu />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>{isSearching ? 'Buscar Libros' : 'Biblioteca'}</h1>
          <button 
            onClick={() => {
              setIsSearching(!isSearching);
              setError(null);
            }}
            className={styles.searchButton}
          >
            {isSearching ? (
              <>
                <BiArrowBack size={20} />
                <span>Volver</span>
              </>
            ) : (
              <>
                <BiSearch size={20} />
                <span>Buscar Libros</span>
              </>
            )}
          </button>
        </div>

        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}

        {isSearching ? (
          <BookSearch onAddBook={handleAddBook} />
        ) : (
          <BookList />
        )}
      </main>
    </div>
  );
} 