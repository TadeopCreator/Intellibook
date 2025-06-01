'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import styles from './NavMenu.module.css';
import { BiHome, BiLibrary, BiChat, BiMenu, BiX, BiStats, BiLogOut, BiLogIn } from 'react-icons/bi';
import { API_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';

export default function NavMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, signIn, signOut } = useAuth();

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const handleSignOut = () => {
    signOut();
    closeMenu();
  };

  const handleSignIn = () => {
    signIn();
    closeMenu();
  };

  return (
    <>
      <button 
        className={styles.menuButton}
        onClick={toggleMenu}
        aria-label="Toggle menu"
      >
        {isMenuOpen ? <BiX size={24} /> : <BiMenu size={24} />}
      </button>

      <div 
        className={`${styles.overlay} ${isMenuOpen ? styles.visible : ''}`}
        onClick={closeMenu}
      />

      <nav className={`${styles.sidebar} ${isMenuOpen ? styles.open : ''}`}>
        <div className={styles.logo}>
          <Image 
            src="/favicon.ico" 
            alt="Intellibook Logo" 
            width={32} 
            height={32}
            className={styles.logoImage}
          />
          <h1>Intellibook</h1>
        </div>
        
        {user && (
          <div className={styles.userInfo}>
            <div className={styles.userDetails}>
              <div className={styles.userName}>{user.name}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          </div>
        )}
        
        <div className={styles.navLinks}>
          {user ? (
            <>
              <Link 
                href="/" 
                className={`${styles.navLink} ${pathname === '/' ? styles.active : ''}`}
              >
                <BiHome size={24} />
                <span>Home</span>
              </Link>
              
              <Link 
                href="/library" 
                className={`${styles.navLink} ${pathname === '/library' ? styles.active : ''}`}
              >
                <BiLibrary size={24} />
                <span>Library</span>
              </Link>
              
              <Link 
                href="/chat" 
                className={`${styles.navLink} ${pathname === '/chat' ? styles.active : ''}`}
              >
                <BiChat size={24} />
                <span>Chat</span>
              </Link>
              
              <Link 
                href="/statistics" 
                className={`${styles.navLink} ${pathname === '/statistics' ? styles.active : ''}`}
              >
                <BiStats size={24} />
                <span>Statistics</span>
              </Link>

              <button 
                onClick={handleSignOut}
                className={styles.authButton}
              >
                <BiLogOut size={24} />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button 
              onClick={handleSignIn}
              className={styles.authButton}
            >
              <BiLogIn size={24} />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
} 