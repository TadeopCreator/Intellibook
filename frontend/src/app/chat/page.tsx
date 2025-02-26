'use client';
import { useState, useEffect, FormEvent, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from "./chat.module.css";
import NavMenu from '../components/NavMenu';
import { BiSend, BiMicrophone, BiStop, BiPlayCircle } from 'react-icons/bi';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isAudio?: boolean;
  audioContent?: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `¡Hola! Soy Dorian 📚

Puedo ayudarte con:
• Ver tus libros ("¿Qué libros tengo?")
• Seguir tu progreso ("¿Por qué capítulo voy?")
• Hablar sobre literatura

¿Qué quieres saber?`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { 
          type: 'audio/mp3' 
        });
        await sendAudioMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioMessage = async (audioBlob: Blob) => {
    setIsLoading(true);
    
    const userMessage: Message = { 
      role: 'user', 
      content: '🎤 Mensaje de voz enviado',
      isAudio: true 
    };
    setMessages(prev => [...prev, userMessage]);

    const streamingMessage: Message = { 
      role: 'assistant', 
      content: '',
      isStreaming: true 
    };
    setMessages(prev => [...prev, streamingMessage]);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'message.mp3');

      const response = await fetch('http://localhost:8000/api/transcribe-audio', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();

      // Create and play the audio
      if (data.audioContent) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
        audio.play();
      }

      setMessages(prev => prev.map((msg, index) => {
        if (index === prev.length - 1) {
          return {
            role: 'assistant',
            content: data.response || 'Error procesando el audio.',
            isStreaming: false,
            audioContent: data.audioContent
          };
        }
        return msg;
      }));
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map((msg, index) => {
        if (index === prev.length - 1) {
          return {
            role: 'assistant',
            content: 'Error al procesar el mensaje de voz.',
            isStreaming: false
          };
        }
        return msg;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Add a function to play audio for a message
  const playMessageAudio = (audioContent: string) => {
    const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
    audio.play();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    
    const streamingMessage: Message = { 
      role: 'assistant', 
      content: '',
      isStreaming: true 
    };
    setMessages(prev => [...prev, streamingMessage]);
    
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`http://localhost:8000/api/ask-gemini?question=${encodeURIComponent(input)}`);
      const data = await response.json();

      setMessages(prev => prev.map((msg, index) => {
        if (index === prev.length - 1) {
          return {
            role: 'assistant',
            content: data.response || 'Lo siento, hubo un error al procesar tu pregunta.',
            isStreaming: false
          };
        }
        
        return msg;
      }));
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map((msg, index) => {
        if (index === prev.length - 1) {
          return {
            role: 'assistant',
            content: 'Error al conectar con el servidor.',
            isStreaming: false
          };
        }
        return msg;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Simplificar la función scrollToBottom
  const scrollToBottom = () => {
    const messageList = document.querySelector(`.${styles.messageList}`);
    if (messageList) {
      messageList.scrollTop = messageList.scrollHeight;
    }
  };

  // Modificar los useEffects para el scroll
  useEffect(() => {
    // Scroll cuando cambian los mensajes
    scrollToBottom();
  }, [messages]);

  return (
    <div className={styles.container}>
      <NavMenu />
      <main className={styles.main}>
        <h1 className={styles.title}>Chat</h1>
        <p className={styles.subtitle}>Tu asistente personal de lectura</p>

        <div className={styles.chatContainer} ref={chatContainerRef}>
          <div className={styles.messageList}>
            {messages.map((message, index) => (
              <div
                key={index}
                className={`${styles.message} ${
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage
                }`}
              >
                {message.role === 'assistant' && (
                  <div className={styles.assistantHeader}>
                    <span className={styles.assistantName}>Dorian</span>
                    {message.audioContent && (
                      <button 
                        onClick={() => playMessageAudio(message.audioContent!)}
                        className={styles.playAudioButton}
                      >
                        <BiPlayCircle size={20} />
                        <span>Reproducir</span>
                      </button>
                    )}
                  </div>
                )}
                <div className={styles.messageContent}>
                  {message.role === 'assistant' ? (
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({node, ...props}) => <p className={styles.paragraph} {...props} />,
                        code: ({node, inline, ...props}) => (
                          <code className={`${styles.code} ${inline ? styles.inlineCode : styles.codeBlock}`} {...props} />
                        ),
                        pre: ({node, ...props}) => <pre className={styles.pre} {...props} />,
                        h1: ({node, ...props}) => <h1 className={styles.heading} {...props} />,
                        h2: ({node, ...props}) => <h2 className={styles.heading} {...props} />,
                        h3: ({node, ...props}) => <h3 className={styles.heading} {...props} />,
                        ul: ({node, ...props}) => <ul className={styles.list} {...props} />,
                        ol: ({node, ...props}) => <ol className={styles.list} {...props} />,
                        li: ({node, ...props}) => <li className={styles.listItem} {...props} />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className={styles.inputForm}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregúntale algo a Dorian..."
              className={styles.input}
            />
            <button type="submit" className={styles.sendButton}>
              <BiSend size={20} />
            </button>
          </form>
        </div>

        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`${styles.recordButton} ${isRecording ? styles.recording : ''}`}
          type="button"
        >
          {isRecording ? (
            <>
              <BiStop size={20} />
              <span>Detener</span>
            </>
          ) : (
            <>
              <BiMicrophone size={20} />
              <span>Grabar</span>
            </>
          )}
        </button>
      </main>
    </div>
  );
}