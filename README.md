# Intellibook

Intellibook is a book and audiobook management application that allows you to organize your personal library, track your reading and listening progress, and enjoy your books in one place.

![Intellibook Logo]()

## Features

- **Digital Library**: Organize and manage your collection of books and audiobooks
- **Integrated Reader**: Read your ebooks directly in the application 
- **Audio Player**: Listen to your audiobooks with a custom player
- **Progress Tracking**: Keep track of your progress in each book
- **Book Search**: Find and add new books to your library
- **Reading Assistant**: Chat with an AI assistant specialized in literature
- **Responsive Design**: Works on mobile and desktop devices

## Technologies

### Frontend
- Next.js
- React
- TypeScript
- CSS Modules

### Backend
- FastAPI
- SQLModel
- SQLite
- Google Cloud (Text-to-Speech, Gemini AI)

## Installation

### Prerequisites
- Node.js (v16 or higher)
- Python (v3.9 or higher)
- pip
- npm or yarn

### Backend Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/intellibook.git
   ```

2. Set up Python virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file in the backend folder with the following variables:
   ```
   GOOGLE_API_KEY=your_google_api_key
   ```

5. Create necessary folders to store files:
   ```bash
   mkdir -p books_storage/audiobooks
   ```

6. Start the server:
   ```bash
   python main.py
   ```

The server will be available at http://localhost:8000.

### Frontend Setup

1. Navigate to the frontend folder:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file with the backend URL:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The frontend will be available at http://localhost:3000.

## Usage

1. Open your browser and go to http://localhost:3000
2. Navigate to the "Library" section to view your books
3. Use the "Search Books" button to add new titles
4. Click on a book to see its details and reading/listening options
5. Use the "Chat" to talk with the assistant about literature

## Mobile Access

To access from mobile devices on the same network:

1. Find your computer's IP on the local network
2. Edit the `frontend/src/app/config/api.ts` file to use that IP
3. Edit the `backend/main.py` file to allow connections from that IP
4. Access from your mobile device using `http://YOUR-COMPUTER-IP:3000`

## Project Structure

intellibook/
├── backend/

│   ├── main.py

│   ├── models.py

│   ├── schemas.py

│   └── utils.py

├── frontend/

│   ├── public/

│   ├── src/

│   ├── .env.local

│   └── package.json

└── README.md