from sqlmodel import SQLModel, Field, Relationship
from typing import Optional
from datetime import date, datetime
import os

# Define base directory for book files
BOOKS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'backend/books_storage')
EBOOKS_DIR = os.path.join(BOOKS_DIR, 'ebooks')
AUDIOBOOKS_DIR = os.path.join(BOOKS_DIR, 'audiobooks')

# Create directories if they don't exist
os.makedirs(EBOOKS_DIR, exist_ok=True)
os.makedirs(AUDIOBOOKS_DIR, exist_ok=True)

class ReadingProgress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="book.id")
    current_page: Optional[int] = None
    total_pages: Optional[int] = None
    current_chapter: Optional[str] = None
    audiobook_position: Optional[int] = None  # Position in seconds
    scroll_position: float = Field(default=0)  # Para el scroll del texto
    progress_percentage: float = Field(default=0)  # Porcentaje general de progreso
    last_read_date: datetime = Field(default_factory=datetime.now)
    notes: Optional[str] = None
    
    # Add relationship to Book
    book: Optional["Book"] = Relationship(back_populates="reading_progress")

class Book(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    author: str
    cover_url: Optional[str] = None
    isbn: Optional[str] = None
    publisher: Optional[str] = None
    publish_year: Optional[int] = None
    pages: Optional[int] = None
    language: Optional[str] = None
    description: Optional[str] = None
    status: str = Field(default="Por leer")  # Por leer, Leyendo, Leído
    start_date: Optional[date] = None
    finish_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: date = Field(default=date.today())        
    
    # Add relationship to ReadingProgress
    reading_progress: Optional["ReadingProgress"] = Relationship(
        back_populates="book",
        sa_relationship_kwargs={"cascade": "all, delete"}
    )
    
    # New fields for book content
    ebook_url: Optional[str] = None  # For online URLs
    ebook_path: Optional[str] = None  # For local files
    ebook_format: Optional[str] = None  # pdf, epub, txt, etc.
    
    audiobook_url: Optional[str] = None  # For online URLs
    audiobook_path: Optional[str] = None  # For local files
    audiobook_format: Optional[str] = None  # mp3, m4b, etc. 