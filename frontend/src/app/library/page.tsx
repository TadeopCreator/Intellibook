'use client';
import { useState } from 'react';
import styles from "./library.module.css";
import BookList from '../components/BookList';
import BookSearch from '../components/BookSearch';
import NavMenu from '../components/NavMenu';
import { BiSearch, BiArrowBack } from 'react-icons/bi';

export default function Library() {
  const [isSearching, setIsSearching] = useState(false);

  return (
    <div className={styles.container}>
      <NavMenu />
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>{isSearching ? 'Buscar Libros' : 'Biblioteca'}</h1>
          <button 
            onClick={() => setIsSearching(!isSearching)}
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

        {isSearching ? (
          <BookSearch onAddBook={async (book) => {
            try {
              const response = await fetch('http://localhost:8000/api/books/', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(book),
              });
              
              if (response.ok) {
                setIsSearching(false);
              }
            } catch (error) {
              console.error('Error adding book:', error);
            }
          }} />
        ) : (
          <BookList />
        )}
      </main>
    </div>
  );
} 