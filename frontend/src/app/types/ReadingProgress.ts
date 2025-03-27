export interface ReadingProgress {
  id?: number;
  book_id: number;
  current_page?: number;
  total_pages?: number;
  current_chapter?: string;
  audiobook_position?: number;  // Position in seconds
  scroll_position?: number;
  progress_percentage?: number;
  last_read_date: string;
  notes?: string;
} 