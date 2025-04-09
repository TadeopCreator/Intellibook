import React from 'react';
import styles from './Footer.module.css';
import Link from 'next/link';

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.copyright}>
          <p>© Intellibook by Tadeo Deluca</p>
        </div>
        <div className={styles.links}>
          <Link href="https://github.com/TadeopCreator/Intellibook" target="_blank" rel="noopener noreferrer">
            GitHub
          </Link>
          <Link href="https://x.com/Tadeop44" target="_blank" rel="noopener noreferrer">
            X
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 