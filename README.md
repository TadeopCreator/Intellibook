# 📚 Intellibook

> Your intelligent assistant for reading and audiobooks

Intellibook is a book and audiobook management application with an AI-powered reading assistant and integrated ebook reader. Built with Next.js, FastAPI, and deployed on Google Cloud Platform.

![Intellibook Homepage](docs/images/homepage-dashboard.png)

## ✨ Features

### 📖 **Digital Library Management**
- Add, edit, and organize your books and audiobooks
- Support for PDF, EPUB, and audiobook formats
- Store metadata including cover images, descriptions, publication info
- Track books as "To Read", "Reading", or "Read"
- Search and add new books to your library

![Library Management](docs/images/library-with-books.png)

### 📱 **Integrated Ebook Reader**
- Page splitting optimized for readability
- Light and dark reading modes
- Adjustable font size and content width
- Touch navigation on mobile devices
- Automatic bookmark saving and progress restoration

![Reading Interface](docs/images/reading-interface.png)

### 🤖 **AI Reading Assistant - "Dorian"**
- AI assistant powered by Google Gemini 2.0 Flash
- Answers questions about your book collection
- Get book recommendations
- Discuss themes, characters, and literary techniques
- Multi-language support

![AI Chat Interface](docs/images/ai-chat-interface.png)

### 📊 **Reading Analytics & Statistics**
- Visual charts of your reading progress
- Monitor reading consistency
- Overview of books read, in progress, and planned
- Track daily and weekly reading time

![Reading Statistics](docs/images/reading-statistics.png)

### 🎧 **Audiobook Player**
- Built-in audiobook player with resume functionality
- Sync listening progress across devices
- Cloud storage for audiobooks

### 🔐 **Authentication**
- Google OAuth 2.0 sign-in
- Access control with user permissions

## 🛠 Technology Stack

### Frontend
- Next.js 14 with TypeScript
- CSS Modules
- Recharts for data visualization
- Google OAuth 2.0
- React Context API

### Backend
- FastAPI (Python 3.11)
- SQLite (development), Cloud SQL MySQL (production)
- SQLModel
- Google Gemini 2.0 Flash
- Google Cloud Text-to-Speech
- Google OAuth 2.0

### Google Cloud Platform
- Cloud Run for deployment
- Cloud Storage and Cloud SQL
- Secret Manager
- Cloud Build with Artifact Registry
- Gemini AI and Text-to-Speech APIs

## 📋 Prerequisites

- Node.js (v18 or higher)
- Python (v3.11 or higher)
- Google Cloud Account (for production)

## 🔧 Installation

### Local Development

#### 1. Clone Repository
```bash
git clone https://github.com/yourusername/intellibook.git
cd intellibook
```

#### 2. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env` file:
```env
DEBUG_MODE=True
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CLIENT_ID=your_google_client_id
FRONTEND_URL=http://localhost:3000
```

#### 3. Frontend Setup
```bash
cd frontend
npm install
```

Create `.env.local` file:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
```

#### 4. Start Servers
```bash
# Backend
cd backend && python main.py

# Frontend (in another terminal)
cd frontend && npm run dev
```

Access at `http://localhost:3000`

---

**Created by Tadeo Deluca**