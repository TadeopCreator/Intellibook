export type BookStatus = 'Por leer' | 'Leyendo' | 'Leído';
export type EbookFormat = 'pdf' | 'epub' | 'txt' | 'mobi';
export type AudiobookFormat = 'mp3' | 'm4b' | 'aac' | 'ogg';

export interface Book {
  id?: number;
  title: string;
  author: string;
  cover_url?: string;
  isbn?: string;
  publisher?: string;
  publish_year?: number;
  pages?: number;
  language?: string;
  description?: string;
  status?: BookStatus;
  start_date?: string;
  finish_date?: string;
  notes?: string;
  created_at?: string;
  
  // New fields
  ebook_url?: string;
  ebook_path?: string;  // Ruta local del ebook
  ebook_format?: EbookFormat;
  
  audiobook_url?: string;
  audiobook_path?: string;  // Ruta local del audiolibro
  audiobook_format?: AudiobookFormat;
} 