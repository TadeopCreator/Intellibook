export interface OpenLibraryBook {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  publisher?: string[];
  language?: string[];
}

export interface OpenLibraryResponse {
  numFound: number;
  start: number;
  docs: OpenLibraryBook[];
} 