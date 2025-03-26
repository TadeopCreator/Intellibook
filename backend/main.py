import asyncio
import base64
import json
import logging
import os
import shutil
import sys
from google.cloud.sql.connector import Connector, IPTypes
import pymysql
import sqlalchemy
from datetime import datetime, timedelta
import time

from fastapi import FastAPI, File, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from google.cloud import texttospeech
from google import genai
from google.genai import types

from sqlmodel import SQLModel, Session, create_engine, select
from typing import Dict, List, Union, Optional
from dotenv import load_dotenv
from models import Book, AUDIOBOOKS_DIR, EBOOKS_DIR, ReadingProgress
from PyPDF2 import PdfReader
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

from google.cloud import storage

# Load environment variables first, before setting any variables that depend on them
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Set to DEBUG to show all messages
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Ensure output goes to stdout
    ]
)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Explicitly set logger level

# Now set DEBUG_MODE after environment variables are loaded
DEBUG_MODE = os.getenv('DEBUG_MODE', 'True').lower() == 'true'
logger.info(f"Application running in {'DEBUG' if DEBUG_MODE else 'PRODUCTION'} mode")

# To execute FastAPI API: fastapi dev main.py (dev)
# To execute FastAPI API: fastapi run main.py (prod?)
# Uvicorn will be running on http://127.0.0.1:8000

app = FastAPI()

# Configurar CORS para permitir acceso desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Definir las rutas de los directorios
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
EBOOKS_DIR = os.path.join(STATIC_DIR, "ebooks")
AUDIOBOOKS_DIR = os.path.join(STATIC_DIR, "audiobooks")

# Crear los directorios si no existen
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(EBOOKS_DIR, exist_ok=True)
os.makedirs(AUDIOBOOKS_DIR, exist_ok=True)

# Montar los directorios estáticos
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/static/ebooks", StaticFiles(directory=EBOOKS_DIR), name="ebooks")
app.mount("/static/audiobooks", StaticFiles(directory=AUDIOBOOKS_DIR), name="audiobooks")

# Configurar Gemini
client = genai.Client(api_key=os.getenv('GOOGLE_API_KEY'))

# Database setup based on DEBUG_MODE
def get_database_engine():
    if DEBUG_MODE:
        # Use SQLite for local development
        DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'books.db')}"
        logger.info(f"Using SQLite database at {DATABASE_URL}")
        return create_engine(DATABASE_URL)
    else:
        # Use Cloud SQL (MySQL) for production
        try:                        
            # Get connection parameters from environment variables
            instance_connection_name = os.environ.get("INSTANCE_CONNECTION_NAME")
            db_user = os.environ.get("DB_USER")
            db_pass = os.environ.get("DB_PASS")
            db_name = os.environ.get("DB_NAME")
            
            if not all([instance_connection_name, db_user, db_pass, db_name]):
                logger.error("Missing required environment variables for Cloud SQL connection")
                raise ValueError("Missing required environment variables for Cloud SQL connection")
            
            ip_type = IPTypes.PRIVATE if os.environ.get("PRIVATE_IP") else IPTypes.PUBLIC
            
            # Initialize Cloud SQL Python Connector
            connector = Connector(ip_type=ip_type, refresh_strategy="LAZY")
            
            def getconn() -> pymysql.connections.Connection:
                conn: pymysql.connections.Connection = connector.connect(
                    instance_connection_name,
                    "pymysql",
                    user=db_user,
                    password=db_pass,
                    db=db_name,
                )
                return conn
            
            # Create SQLAlchemy engine
            engine = sqlalchemy.create_engine(
                "mysql+pymysql://",
                creator=getconn,
                pool_size=5,
                max_overflow=2,
                pool_timeout=30,
                pool_recycle=1800
            )
            
            logger.info(f"Connected to Cloud SQL MySQL instance: {instance_connection_name}")
            return engine
            
        except Exception as e:
            logger.error(f"Error connecting to Cloud SQL: {str(e)}")
            logger.error("Falling back to SQLite database")
            
            # Fallback to SQLite if Cloud SQL connection fails
            DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'books.db')}"
            return create_engine(DATABASE_URL)

# Get the database engine
engine = get_database_engine()

# Create tables
def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

# Create tables on startup
create_db_and_tables()

# Define system instructions for different functions
DORIAN_BASE_INSTRUCTION = """You are Dorian, an AI assistant specialized exclusively in books and literature. You must:
1. Only respond to questions about books, reading, and literature
2. Politely deflect questions about other topics
3. Respond in the same language as the question
4. When mentioning book titles in other languages, include translations
5. Keep responses concise and focused
6. Never mention databases, records, or technical details
7. Maintain a warm, bookish personality"""

ANALYSIS_INSTRUCTION = """You are a precise analyzer focused only on determining if questions require accessing the book database of the person who is asking the question. You must:
1. Return only a valid JSON object
2. Set "needs_db" to true ONLY for questions about:
   - User's personal book collection
   - Reading progress
   - Reading history
   - Book status
3. Include required_data array with ONLY:
   - "books" for collection queries
   - "reading_progress" for progress queries
4. Set query_type to:
   - "single_book" for specific book queries
   - "all_books" for collection queries
   - "reading_progress" for progress queries
5. Return {"needs_db": false, "required_data": [], "query_type": null} for non-library questions"""

# Función para analizar si la pregunta necesita datos de la BD
async def analyze_question(question: str) -> Dict[str, Union[bool, List[str]]]:
    try:
        logger.debug("Starting analyze_question")
        
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                config=types.GenerateContentConfig(
                    system_instruction=ANALYSIS_INSTRUCTION
                ),
                contents=f"Analyze this question: {question}"
            )
            logger.debug("Got response from Gemini")
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                logger.warning("Rate limit hit, waiting 2 seconds...")
                await asyncio.sleep(2)
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    config=types.GenerateContentConfig(
                        system_instruction=ANALYSIS_INSTRUCTION
                    ),
                    contents=f"Analyze this question: {question}"
                )
            else:
                raise e
        
        # Clean and parse the response
        text = response.text.strip()
        #logger.debug(f"Raw response text: {text}")
        
        try:
            # Remove last line and first line of the text
            text = text.replace('```json', '').replace('```', '')
            text = text.split('\n')[1:-1]
            text = ''.join(text)
            # Remove trailing and leading whitespace
            text = text.strip()

            # Parse JSON and ensure required fields
            result = json.loads(text)
            result = {
                "needs_db": bool(result.get("needs_db", False)),
                "required_data": list(result.get("required_data", [])),
                "query_type": result.get("query_type")
            }
            
            logger.debug(f"Parsed and validated JSON: {result}")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"JSON parsing error: {e}")
            logger.error(f"Failed to parse text: {text}")
            return {"needs_db": False, "required_data": [], "query_type": None}
            
    except Exception as e:
        logger.error(f"Error in analyze_question: {e}", exc_info=True)
        return {"needs_db": False, "required_data": [], "query_type": None}

# Función para obtener datos relevantes de la BD
async def get_relevant_data(analysis: Dict) -> str:
    with Session(engine) as session:
        context_data = []
        
        if "books" in analysis.get("required_data", []):
            if analysis.get("query_type") == "single_book":
                book_title = extract_book_title(analysis.get("question", ""))
                books = session.exec(
                    select(Book).where(Book.title.contains(book_title))
                ).all()
            else:
                books = session.exec(select(Book)).all()
            context_data.extend([{
                "title": book.title,
                "author": book.author,
                "publish_year": book.publish_year,
                "status": book.status,
                "start_date": str(book.start_date) if book.start_date else None,
                "finish_date": str(book.finish_date) if book.finish_date else None
            } for book in books])
        
        if "reading_progress" in analysis.get("required_data", []):
            progress_data = session.exec(select(ReadingProgress)).all()
            context_data.extend([{
                "book_id": prog.book_id,
                "book_title": prog.book.title,
                "current_page": prog.current_page,
                "total_pages": prog.total_pages,
                "current_chapter": prog.current_chapter,
                "audiobook_position": prog.audiobook_position,
                "scroll_position": prog.scroll_position,
                "progress_percentage": prog.progress_percentage,
                "last_read_date": str(prog.last_read_date),
                "notes": prog.notes
            } for prog in progress_data])
        
        return json.dumps(context_data, indent=2)

# Add a chat session manager
class ChatSessionManager:
    def __init__(self):
        self.chats: Dict[str, any] = {}
    
    def get_or_create_chat(self, session_id: str) -> any:
        if session_id not in self.chats:
            self.chats[session_id] = client.chats.create(
                model="gemini-2.0-flash",
                config=types.GenerateContentConfig(
                    system_instruction=DORIAN_BASE_INSTRUCTION
                )
            )
        return self.chats[session_id]

# Initialize the chat manager
chat_manager = ChatSessionManager()

# Modify the ask_gemini endpoint
@app.get("/api/ask-gemini")
async def ask_gemini(question: str, session_id: Optional[str] = None):
    try:
        logger.debug(f"Received question: {question}")
        
        # Get or create chat session
        if not session_id:
            session_id = "default"  # You might want to generate unique IDs
        
        chat = chat_manager.get_or_create_chat(session_id)
        
        # Analyze the question first
        analysis = await analyze_question(question)
        logger.debug(f"Question analysis: {analysis}")
        
        await asyncio.sleep(1)
        
        try:
            if analysis.get("needs_db", False):
                # Get context data
                context_data = await get_relevant_data(analysis)
                logger.debug(f"Retrieved context data: {context_data}")
                
                # Send context and question
                response = chat.send_message(
                    f"""Based on this library data of the user who is asking the question:
                    {context_data}
                    
                    Answer this question: {question}"""
                )
            else:
                # Send question directly
                response = chat.send_message(question)
                
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                logger.warning("Rate limit hit, waiting 2 seconds...")
                await asyncio.sleep(2)
                
                # Retry with the same logic
                if analysis.get("needs_db", False):
                    context_data = await get_relevant_data(analysis)
                    response = chat.send_message(
                        f"""Based on this library data of the user who is asking the question:
                        {context_data}
                        
                        Answer this question: {question}"""
                    )
                else:
                    response = chat.send_message(question)
            else:
                raise e

        return {
            "response": response.text,
            "session_id": session_id
        }
    except Exception as e:
        logger.exception("Error in ask_gemini endpoint")
        return {
            "error": str(e),
            "details": {
                "question": question,
                "trace": str(e.__traceback__)
            }
        }

def extract_book_title(question: str) -> str:
    TITLE_EXTRACTION_INSTRUCTION = """You are a precise book title extractor. You must:
1. Return ONLY the book title mentioned in the question
2. Return "None" if no specific book is mentioned
3. Include both original title and translation if the book is mentioned in another language
4. Do not include any additional text or explanation"""
    
    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            config=types.GenerateContentConfig(
                system_instruction=TITLE_EXTRACTION_INSTRUCTION
            ),
            contents=question
        )
        return response.text.strip()
    except:
        return "None"

@app.post("/api/transcribe-audio")
async def transcribe_audio(audio: UploadFile = File(...)):
    try:
        # Crear directorio temporal si no existe
        temp_dir = "temp_audio"
        if not os.path.exists(temp_dir):
            os.makedirs(temp_dir)
        
        # Guardar archivo temporalmente
        temp_path = os.path.join(temp_dir, audio.filename)
        with open(temp_path, "wb") as buffer:
            content = await audio.read()
            buffer.write(content)
        
        # Procesar con Gemini
        myfile = client.files.upload(file=temp_path)
        
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            config=types.GenerateContentConfig(
                system_instruction=DORIAN_BASE_INSTRUCTION
            ),
            contents=[myfile]
        )
        
        # Limpiar archivo temporal
        os.remove(temp_path)
        client.files.delete(name=myfile.name)

        # Set the text input to be synthesized
        synthesis_input = texttospeech.SynthesisInput(text=response.text)

        # Build the voice request, select the language code ("en-US") and the ssml
        # voice gender ("neutral")
        voice = texttospeech.VoiceSelectionParams(
            language_code="es-US",
            name="es-US-Neural2-C"
        )

        # Select the type of audio file you want returned
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            effects_profile_id=["small-bluetooth-speaker-class-device"],
            speaking_rate=0.9,
            pitch=-5.0,
            volume_gain_db=0.0
        )

        # Perform the text-to-speech request
        tts_response = client_tts.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )

        # Return both the text response and the audio content as base64
        return {
            "response": response.text,
            "audioContent": base64.b64encode(tts_response.audio_content).decode('utf-8')
        }
    except Exception as e:
        return {"error": str(e)}

# Upload a book to Cloud Storage from local file path
def upload_book_to_cloud_storage(source_file_name, book_type, filename=None):
    """
    Uploads a book file to Google Cloud Storage bucket.
    
    Args:
        source_file_name: Local path to the file
        book_type: Either 'ebook' or 'audiobook'
        filename: Optional custom filename to use in the cloud
    
    Returns:
        Public URL of the uploaded file
    """
    if filename is None:
        filename = os.path.basename(source_file_name)
    
    bucket_name = "intellibook_static"
    folder = "ebooks" if book_type == 'ebook' else "audiobooks"
    destination_blob_name = f"{folder}/{filename}"
    
    try:
        from google.cloud.storage import retry
        from google.api_core import retry as api_retry
        
        # Create storage client with custom retry configuration
        storage_client = storage.Client()
        
        # Get bucket
        bucket = storage_client.bucket(bucket_name)
        
        # Create blob with explicit retry settings
        blob = bucket.blob(destination_blob_name)
        
        # Configure retry with exponential backoff
        retry_config = api_retry.Retry(
            initial=1.0,  # Initial delay in seconds
            maximum=60.0,  # Maximum delay in seconds
            multiplier=2.0,  # Delay multiplier
            deadline=300.0,  # Total deadline in seconds (5 minutes)
            predicate=api_retry.if_transient_error
        )
        
        # Upload with retry and longer timeout
        blob.upload_from_filename(
            source_file_name,
            retry=retry_config,
            timeout=300,
        )
        
        logger.info(f"File {source_file_name} uploaded to gs://{bucket_name}/{destination_blob_name}")
        
        # Return the public URL
        return f"https://storage.cloud.google.com/{bucket_name}/{destination_blob_name}"
    
    except Exception as e:
        logger.error(f"Error uploading to cloud storage: {str(e)}")
        logger.error(f"Error details: {type(e).__name__}: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise e

def copy_file_to_storage(source_path: str, book_type: str) -> str:
    """
    Copy a file to the appropriate storage location and return the new path.
    In DEBUG_MODE, files are stored locally.
    In production, files are uploaded to Google Cloud Storage.
    """
    if DEBUG_MODE:
        if book_type == 'ebook':
            relative_web_path = f"ebooks/{os.path.basename(source_path)}"
            base_dir = EBOOKS_DIR            
        else:  # audiobook
            relative_web_path = f"audiobooks/{os.path.basename(source_path)}"
            base_dir = AUDIOBOOKS_DIR            

        # Get filename
        filename = os.path.basename(source_path)

        # Create target path (absolute for file operations)
        absolute_target_path = os.path.join(base_dir, filename)
        
        # Copy file if it exists
        if os.path.exists(source_path):
            shutil.copy2(source_path, absolute_target_path)
        
        logger.debug(f"DEBUG MODE: File copied locally to {absolute_target_path}")
        logger.debug(f"Returning web-accessible relative path: {relative_web_path}")
        
        # Return the web-accessible relative path instead of the absolute path
        return relative_web_path
    else:
        # Production mode - use Google Cloud Storage
        try:
            cloud_url = upload_book_to_cloud_storage(source_path, book_type)
            logger.info(f"PRODUCTION MODE: File uploaded to cloud: {cloud_url}")
            return cloud_url
        except Exception as e:
            logger.error(f"Failed to upload to cloud storage: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload file to cloud storage: {str(e)}"
            )

@app.post("/api/books/")
async def create_book(
    request: Request,
    ebook_file: UploadFile = File(None),
    audiobook_file: UploadFile = File(None)
):
    try:
        # Parse form data to get book info
        form = await request.form()
        
        # Extract book data from form
        book_data = {}
        for key, value in form.items():
            if key not in ['ebook_file', 'audiobook_file']:
                book_data[key] = value
        
        # Create Book model
        book = Book(**book_data)
        
        # Handle ebook file if provided
        if ebook_file:
            # Save to temporary location first
            temp_dir = os.path.join(BASE_DIR, "temp_files")
            os.makedirs(temp_dir, exist_ok=True)
            temp_path = os.path.join(temp_dir, ebook_file.filename)
            
            with open(temp_path, "wb") as buffer:
                content = await ebook_file.read()
                buffer.write(content)
            
            # Use copy_file_to_storage to save to appropriate location
            result_path = copy_file_to_storage(temp_path, 'ebook')
            
            # Set appropriate fields based on DEBUG_MODE
            if DEBUG_MODE:
                book.ebook_path = result_path
                book.ebook_url = None
            else:
                book.ebook_url = result_path
                book.ebook_path = None
            
            # Set format
            book.ebook_format = form.get('ebook_format')
            
            # Clean up temp file
            os.remove(temp_path)
        
        # Handle audiobook file if provided
        if audiobook_file:
            # Save to temporary location first
            temp_dir = os.path.join(BASE_DIR, "temp_files")
            os.makedirs(temp_dir, exist_ok=True)
            temp_path = os.path.join(temp_dir, audiobook_file.filename)
            
            with open(temp_path, "wb") as buffer:
                content = await audiobook_file.read()
                buffer.write(content)
            
            # Use copy_file_to_storage to save to appropriate location
            result_path = copy_file_to_storage(temp_path, 'audiobook')
            
            # Set appropriate fields based on DEBUG_MODE
            if DEBUG_MODE:
                book.audiobook_path = result_path
                book.audiobook_url = None
            else:
                book.audiobook_url = result_path
                book.audiobook_path = None
            
            # Set format
            book.audiobook_format = form.get('audiobook_format')
            
            # Clean up temp file
            os.remove(temp_path)
        
        # Save book to database
        with Session(engine) as session:
            session.add(book)
            session.commit()
            session.refresh(book)
            
            logger.debug(f"Book created: ID={book.id}, DEBUG={DEBUG_MODE}, " +
                         f"ebook_path={book.ebook_path}, ebook_url={book.ebook_url}, " +
                         f"audiobook_path={book.audiobook_path}, audiobook_url={book.audiobook_url}")
            
            return book
            
    except Exception as e:
        logger.error(f"Error creating book: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# Update an existing book
@app.put("/api/books/{book_id}")
async def update_book(
    book_id: int,
    request: Request,
    ebook_file: UploadFile = File(None),
    audiobook_file: UploadFile = File(None)
):
    try:
        # Parse form data
        form = await request.form()
        
        # Extract book data from form
        book_data = {}
        for key, value in form.items():
            if key not in ['ebook_file', 'audiobook_file']:
                book_data[key] = value
        
        # Get existing book
        with Session(engine) as session:
            book = session.get(Book, book_id)
            if not book:
                raise HTTPException(status_code=404, detail="Book not found")
            
            # Handle ebook file if provided
            if ebook_file:
                # Save to temporary location first
                temp_dir = os.path.join(BASE_DIR, "temp_files")
                os.makedirs(temp_dir, exist_ok=True)
                temp_path = os.path.join(temp_dir, ebook_file.filename)
                
                with open(temp_path, "wb") as buffer:
                    content = await ebook_file.read()
                    buffer.write(content)
                
                # Use copy_file_to_storage to save to appropriate location
                result_path = copy_file_to_storage(temp_path, 'ebook')
                
                # Set appropriate fields based on DEBUG_MODE
                if DEBUG_MODE:
                    book_data['ebook_path'] = result_path
                    book_data['ebook_url'] = None
                else:
                    book_data['ebook_url'] = result_path
                    book_data['ebook_path'] = None
                
                # Clean up temp file
                os.remove(temp_path)
            
            # Handle audiobook file if provided
            if audiobook_file:
                # Save to temporary location first
                temp_dir = os.path.join(BASE_DIR, "temp_files")
                os.makedirs(temp_dir, exist_ok=True)
                temp_path = os.path.join(temp_dir, audiobook_file.filename)
                
                with open(temp_path, "wb") as buffer:
                    content = await audiobook_file.read()
                    buffer.write(content)
                
                # Use copy_file_to_storage to save to appropriate location
                result_path = copy_file_to_storage(temp_path, 'audiobook')
                
                # Set appropriate fields based on DEBUG_MODE
                if DEBUG_MODE:
                    book_data['audiobook_path'] = result_path
                    book_data['audiobook_url'] = None
                else:
                    book_data['audiobook_url'] = result_path
                    book_data['audiobook_path'] = None
                
                # Clean up temp file
                os.remove(temp_path)
            
            # Update book attributes
            for key, value in book_data.items():
                if hasattr(book, key):
                    setattr(book, key, value)
            
            # Save changes
            session.add(book)
            session.commit()
            session.refresh(book)
            
            logger.debug(f"Book updated: ID={book.id}, DEBUG={DEBUG_MODE}, " +
                         f"ebook_path={book.ebook_path}, ebook_url={book.ebook_url}, " +
                         f"audiobook_path={book.audiobook_path}, audiobook_url={book.audiobook_url}")
            
            return book
            
    except Exception as e:
        logger.error(f"Error updating book: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/api/books/", response_model=List[Book])
def get_books():
    with Session(engine) as session:
        books = session.exec(select(Book)).all()
        return books

@app.get("/api/books/{book_id}", response_model=Book)
def get_book(book_id: int):
    with Session(engine) as session:
        book = session.get(Book, book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        return book

@app.delete("/api/books/{book_id}")
def delete_book(book_id: int):
    with Session(engine) as session:
        try:
            # Primero eliminar los registros de progreso asociados
            progress = session.exec(
                select(ReadingProgress).where(ReadingProgress.book_id == book_id)
            ).first()
            
            if progress:
                session.delete(progress)
                session.commit()

            # Luego eliminar el libro
            book = session.get(Book, book_id)
            if not book:
                raise HTTPException(status_code=404, detail="Book not found")

            # Eliminar archivos asociados si existen
            if book.ebook_path:
                file_path = os.path.join(EBOOKS_DIR, os.path.basename(book.ebook_path))
                if os.path.exists(file_path):
                    os.remove(file_path)

            if book.audiobook_path:
                file_path = os.path.join(AUDIOBOOKS_DIR, os.path.basename(book.audiobook_path))
                if os.path.exists(file_path):
                    os.remove(file_path)

            session.delete(book)
            session.commit()
            return {"message": "Book deleted successfully"}

        except Exception as e:
            session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Error deleting book: {str(e)}"
            )

# Get progress for a book
@app.get("/api/books/{book_id}/progress", response_model=ReadingProgress)
def get_book_progress(book_id: int):
    with Session(engine) as session:
        progress = session.exec(
            select(ReadingProgress).where(ReadingProgress.book_id == book_id)
        ).first()
        
        if not progress:
            # Si no existe, crear un nuevo progreso con valores por defecto
            progress = ReadingProgress(
                book_id=book_id,
                scroll_position=0,
                progress_percentage=0,
                current_page=None,
                total_pages=None,
                current_chapter=None,
                audiobook_position=None,
                last_read_date=datetime.now()
            )
            session.add(progress)
            session.commit()
        
        return {
            "book_id": progress.book_id,
            "scroll_position": progress.scroll_position,
            "progress_percentage": progress.progress_percentage,
            "current_page": progress.current_page,
            "total_pages": progress.total_pages,
            "current_chapter": progress.current_chapter,
            "audiobook_position": progress.audiobook_position,
            "last_read_date": progress.last_read_date,
            "notes": progress.notes
        }

# Update or create progress
@app.put("/api/books/{book_id}/progress")
async def update_book_progress(book_id: int, progress_data: dict):
    with Session(engine) as session:
        progress = session.exec(
            select(ReadingProgress).where(ReadingProgress.book_id == book_id)
        ).first()
        
        if progress:
            # Update existing progress
            if 'scroll_position' in progress_data:
                progress.scroll_position = progress_data['scroll_position']
            if 'progress_percentage' in progress_data:
                progress.progress_percentage = progress_data['progress_percentage']
            if 'current_page' in progress_data:
                progress.current_page = progress_data['current_page']
            if 'total_pages' in progress_data:
                progress.total_pages = progress_data['total_pages']
            if 'current_chapter' in progress_data:
                progress.current_chapter = progress_data['current_chapter']
            if 'audiobook_position' in progress_data:
                progress.audiobook_position = progress_data['audiobook_position']
        else:
            # Create new progress
            progress = ReadingProgress(
                book_id=book_id,
                scroll_position=progress_data.get('scroll_position', 0),
                progress_percentage=progress_data.get('progress_percentage', 0),
                current_page=progress_data.get('current_page'),
                total_pages=progress_data.get('total_pages'),
                current_chapter=progress_data.get('current_chapter'),
                audiobook_position=progress_data.get('audiobook_position')
            )
        
        progress.last_read_date = datetime.now()
        session.add(progress)
        session.commit()
        return progress

def extract_text_from_epub(epub_path):
    book = epub.read_epub(epub_path)
    chapters = []
    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            chapters.append(BeautifulSoup(item.get_content(), 'html.parser').get_text())
    return '\n\n'.join(chapters)

def extract_text_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    text = []
    for page in reader.pages:
        text.append(page.extract_text())
    return '\n\n'.join(text)

@app.get("/api/books/{book_id}/content")
async def get_book_content(book_id: int):
    logger.debug(f"Attempting to get content for book ID: {book_id}")
    
    with Session(engine) as session:
        book = session.get(Book, book_id)
        logger.debug(f"Book found: {book}")
        
        if not book:
            logger.warning("Book not found in database")
            raise HTTPException(status_code=404, detail="Book not found")
        
        temp_file = None
        try:
            if DEBUG_MODE:
                # Local file mode - use ebook_path
                if not book.ebook_path:
                    logger.warning("Book has no associated file path")
                    raise HTTPException(status_code=404, detail="Book has no associated file")
                
                # Use the path directly
                file_path = os.path.join(EBOOKS_DIR, os.path.basename(book.ebook_path))
                
            else:
                # Cloud storage mode - use ebook_url
                if not book.ebook_url:
                    logger.warning("Book has no associated URL")
                    raise HTTPException(status_code=404, detail="Book has no associated URL")
                
                logger.debug(f"Ebook URL: {book.ebook_url}")
                
                # Create temp directory if it doesn't exist
                temp_dir = os.path.join(BASE_DIR, "temp_files")
                os.makedirs(temp_dir, exist_ok=True)
                
                extension = book.ebook_format  # Remove the dot
                # Set up the temp file path
                temp_file = os.path.join(temp_dir, f"temp_{book_id}_{int(time.time())}.{extension}")
                
                logger.debug(f"Downloading from URL: {book.ebook_url}")
                
                # Try alternative method using GCS client if HTTP download fails
                try:
                    logger.debug("Attempting download with GCS client")
                    from google.cloud import storage
                    
                    # Parse URL to get bucket and blob path
                    parts = book.ebook_url.replace("https://storage.cloud.google.com/", "").split("/", 1)
                    bucket_name = parts[0]
                    blob_path = parts[1] if len(parts) > 1 else ""
                    
                    # Initialize the storage client
                    storage_client = storage.Client()
                    bucket = storage_client.bucket(bucket_name)
                    blob = bucket.blob(blob_path)
                    
                    # Download the file
                    blob.download_to_filename(temp_file)
                    file_path = temp_file
                    logger.debug(f"Successfully downloaded with GCS client")
                    
                except Exception as gcs_error:
                    logger.error(f"GCS client download also failed: {str(gcs_error)}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to download file: {str(e)}"
                    )
            
            # Process file based on extension
            extension = os.path.splitext(file_path)[1].lower()[1:]  # Remove the dot
            
            if extension == 'pdf':
                logger.debug("Extracting text from PDF")
                content = extract_text_from_pdf(file_path)
            elif extension == 'epub':
                logger.debug("Extracting text from EPUB")
                content = extract_text_from_epub(file_path)
            else:
                logger.debug("Reading plain text file")
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
            
            logger.debug(f"Content extracted successfully, length: {len(content)}")
            return {"content": content}
            
        except Exception as e:
            logger.error(f"Error extracting text: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            
            raise HTTPException(
                status_code=500, 
                detail=f"Error extracting text: {str(e)}"
            )
        finally:
            # Clean up temp file if it was created
            if temp_file and os.path.exists(temp_file):
                #os.remove(temp_file)
                pass

@app.get("/api/signed-url/{book_id}")
async def get_signed_url(book_id: int):
    with Session(engine) as session:
        book = session.get(Book, book_id)
        if not book or not book.audiobook_url:
            raise HTTPException(status_code=404, detail="Audiobook not found")
        
        try:
            if "storage.cloud.google.com" in book.audiobook_url:
                parts = book.audiobook_url.replace("https://storage.cloud.google.com/", "").split("/", 1)
                bucket_name = parts[0]
                blob_path = parts[1] if len(parts) > 1 else ""
                
                storage_client = storage.Client()
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_path)
                
                # URL válida por 3 horas - usando timedelta correctamente
                url = blob.generate_signed_url(
                    version="v4",
                    expiration=timedelta(hours=3),
                    method="GET"
                )
                
                return {"signed_url": url}
            else:
                return {"url": book.audiobook_url}
        except Exception as e:
            logger.error(f"Error generating signed URL: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 