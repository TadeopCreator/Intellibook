'use client';
import { useState, useEffect, FormEvent, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from "./chat.module.css";
import NavMenu from '../components/NavMenu';
import ProtectedRoute from '../components/ProtectedRoute';
import { BiSend, BiMicrophone, BiStop, BiPlayCircle } from 'react-icons/bi';
import { api } from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isAudio?: boolean;
  audioContent?: string;
}

function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I'm Dorian 📚

I can help you with:
• View your books ("What books do I have?")
• Track your progress ("What chapter am I on?")
• Discuss literature

What would you like to know?`
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
      content: '🎤 Voice message sent',
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
      // Convert Blob to File
      const audioFile = new File([audioBlob], 'message.mp3', { type: 'audio/mp3' });
      
      const response = await api.chat.transcribeAudio(audioFile);
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
            content: data.response || 'Sorry, there was an error processing your question.',
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
            content: 'Error processing the voice message.',
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
      const response = await api.chat.askGemini(input);
      const data = await response.json();

      setMessages(prev => prev.map((msg, index) => {
        if (index === prev.length - 1) {
          return {
            role: 'assistant',
            content: data.response || 'Sorry, there was an error processing your question.',
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
            content: 'Error connecting to the server.',
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
        <h1 className={styles.title}>Assistant - Dorian</h1>
        <p className={styles.subtitle}>Your personal reading assistant</p>

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
                        <span>Play</span>
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
                        code: ({node, inline, className, ...props}: {
                          node?: any;
                          inline?: boolean;
                          className?: string;
                          children?: React.ReactNode;
                        }) => (
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
              placeholder="Ask Dorian something..."
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
              <span>Stop</span>
            </>
          ) : (
            <>
              <BiMicrophone size={20} />
              <span>Record</span>
            </>
          )}
        </button>
      </main>
    </div>
  );
}

export default function Chat() {
  return (
    <ProtectedRoute>
      <ChatPage />
    </ProtectedRoute>
  );
}