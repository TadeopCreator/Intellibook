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

    // Create FormData to handle both text fields and files
    const formData = new FormData();
      
    // Add all book data fields to FormData
    for (const [key, value] of Object.entries(book)) {
      if (value !== undefined && value !== null) {
        formData.append(key, value.toString());
      }
    }

    try {
      const response = await fetch(`${API_URL}/api/books/`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        setIsSearching(false);
        setError(null);
      } else {
        throw new Error('Error adding book');
      }
    } catch (error) {
      console.error('Error adding book:', error);
      setError(error instanceof Error ? error.message : 'Error adding book');
    }
  };

  return (
    <div className={styles.container}>
      <NavMenu />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>{isSearching ? 'Search Books' : 'Library'}</h1>
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
                <span>Back</span>
              </>
            ) : (
              <>
                <BiSearch size={20} />
                <span>Search Books</span>
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