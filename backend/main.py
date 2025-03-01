import asyncio
import base64
import json
import logging
import os
import shutil
import sys
from datetime import datetime, date

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from google.api_core import retry
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
import docx

# Instantiates a client
client_tts = texttospeech.TextToSpeechClient()

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

# To execute FastAPI API: fastapi dev main.py (dev)
# To execute FastAPI API: fastapi run main.py (prod?)
# Uvicorn will be running on http://127.0.0.1:8000

# Cargar variables de entorno
load_dotenv()

app = FastAPI()

# Configurar CORS para permitir acceso desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.168.0.13:3000"],  # URL del frontend
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

# Database setup
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'books.db')}" 
engine = create_engine(DATABASE_URL)

# Create tables
def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

# Crear tablas al iniciar
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

def copy_file_to_storage(source_path: str, book_type: str) -> str:
    """
    Copy a file to the appropriate storage directory and return the new path
    """
    if book_type == 'ebook':
        base_dir = EBOOKS_DIR
    else:  # audiobook
        base_dir = AUDIOBOOKS_DIR

    # Get filename and create format-specific subdirectory
    filename = os.path.basename(source_path)
    file_format = filename.split('.')[-1].lower()
    target_dir = os.path.join(base_dir, file_format)
    os.makedirs(target_dir, exist_ok=True)

    # Create target path
    target_path = os.path.join(target_dir, filename)
    
    # Copy file if it exists
    if os.path.exists(source_path):
        shutil.copy2(source_path, target_path)
    
    return target_path

@app.post("/api/books/")
def create_book(book: Book):
    with Session(engine) as session:
        # Convertir fechas de string a objetos date si es necesario
        if isinstance(book.start_date, str):
            try:
                book.start_date = date.fromisoformat(book.start_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid start_date format")
        
        if isinstance(book.finish_date, str):
            try:
                book.finish_date = date.fromisoformat(book.finish_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid finish_date format")

        # Handle ebook file
        if book.ebook_path:
            try:
                book.ebook_path = copy_file_to_storage(book.ebook_path, 'ebook')
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error copying ebook: {str(e)}")

        # Handle audiobook file
        if book.audiobook_path:
            try:
                book.audiobook_path = copy_file_to_storage(book.audiobook_path, 'audiobook')
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error copying audiobook: {str(e)}")

        session.add(book)
        session.commit()
        session.refresh(book)
        return book

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

@app.put("/api/books/{book_id}", response_model=Book)
def update_book(book_id: int, book_data: dict):
    with Session(engine) as session:
        book = session.get(Book, book_id)
        if not book:
            raise HTTPException(status_code=404, detail="Book not found")
        
        # Convertir fechas de string a objetos date
        date_fields = ['created_at', 'start_date', 'finish_date']
        for field in date_fields:
            if field in book_data and book_data[field]:
                try:
                    if isinstance(book_data[field], str):
                        book_data[field] = date.fromisoformat(book_data[field])
                except ValueError:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Invalid date format for {field}"
                    )
        
        # Actualizamos solo los campos proporcionados
        for key, value in book_data.items():
            if hasattr(book, key):
                setattr(book, key, value)
        
        try:
            session.add(book)
            session.commit()
            session.refresh(book)
            return book
        except Exception as e:
            session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Error updating book: {str(e)}"
            )

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

@app.post("/api/upload/{file_type}/{book_id}")
async def upload_file(file_type: str, book_id: int, file: UploadFile = File(...)):
    try:
        print(f"Subiendo archivo para libro ID: {book_id}")
        print(f"Tipo de archivo: {file_type}")
        print(f"Nombre original del archivo: {file.filename}")
        
        # Determinar la carpeta según el tipo de archivo
        folder = "ebooks" if file_type == "ebook" else "audiobooks"
        
        # Crear nombre de archivo único usando el book_id
        file_extension = os.path.splitext(file.filename)[1]
        new_filename = f"{book_id}{file_extension}"
        
        # Guardar el archivo en la carpeta correspondiente
        file_path = os.path.join(folder, new_filename)
        absolute_path = os.path.join(EBOOKS_DIR if file_type == "ebook" else AUDIOBOOKS_DIR, new_filename)
        
        print(f"Ruta relativa del archivo: {file_path}")
        print(f"Ruta absoluta del archivo: {absolute_path}")
        print(f"¿El directorio existe? {os.path.exists(os.path.dirname(absolute_path))}")
        
        # Guardar el archivo
        try:
            with open(absolute_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
                print(f"Archivo guardado exitosamente, tamaño: {len(content)} bytes")
                print(f"¿El archivo existe después de guardar? {os.path.exists(absolute_path)}")
        except Exception as e:
            print(f"Error al guardar el archivo: {str(e)}")
            raise
            
        # Devolver la ruta relativa del archivo
        return {"file_path": file_path}
        
    except Exception as e:
        print(f"Error en upload_file: {str(e)}")
        import traceback
        print(f"Traceback completo: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

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
    print(f"Intentando obtener contenido para libro ID: {book_id}")
    
    with Session(engine) as session:
        book = session.get(Book, book_id)
        print(f"Libro encontrado: {book}")
        
        if not book:
            print("Libro no encontrado en la base de datos")
            raise HTTPException(status_code=404, detail="Book not found")
            
        if not book.ebook_path:
            print("Libro no tiene ruta de archivo")
            raise HTTPException(status_code=404, detail="Book has no associated file")
        
        print(f"Ruta del ebook: {book.ebook_path}")
        file_path = os.path.join(EBOOKS_DIR, os.path.basename(book.ebook_path))
        print(f"Ruta completa del archivo: {file_path}")
        print(f"¿El archivo existe? {os.path.exists(file_path)}")
        print(f"Contenido del directorio EBOOKS_DIR: {os.listdir(EBOOKS_DIR)}")
        
        if not os.path.exists(file_path):
            print(f"Archivo no encontrado en: {file_path}")
            raise HTTPException(
                status_code=404, 
                detail=f"File not found at path: {file_path}"
            )
        
        try:
            extension = book.ebook_path.split('.')[-1].lower()
            print(f"Extensión del archivo: {extension}")
            
            if extension == 'pdf':
                print("Intentando extraer texto de PDF")
                content = extract_text_from_pdf(file_path)
            elif extension == 'epub':
                print("Intentando extraer texto de EPUB")
                content = extract_text_from_epub(file_path)
            else:
                print("Intentando leer archivo de texto plano")
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            
            print(f"Contenido extraído exitosamente, longitud: {len(content)}")
            return {"content": content}
            
        except Exception as e:
            print(f"Error al extraer texto: {str(e)}")
            print(f"Tipo de error: {type(e)}")
            import traceback
            print(f"Traceback completo: {traceback.format_exc()}")
            raise HTTPException(
                status_code=500, 
                detail=f"Error extracting text: {str(e)}"
            ) 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 