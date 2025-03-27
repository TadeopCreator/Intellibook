'use client';
import { useState, useEffect } from 'react';
import { Book } from '../types/Book';
import { ReadingProgress } from '../types/ReadingProgress';
import styles from './statistics.module.css';
import NavMenu from '../components/NavMenu';
import { API_URL } from '../config/api';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line
} from 'recharts';
import useWindowSize from '../hooks/useWindowSize';

// Define types for statistics
interface BookStats {
  totalBooks: number;
  booksRead: number;
  booksReading: number;
  booksToRead: number;
  readingStreak: number;
  totalReadingTime: number; // in minutes
}

interface DailyReadingData {
  date: string;
  minutes: number;
}

export default function Statistics() {
  const [books, setBooks] = useState<Book[]>([]);
  const [bookStats, setBookStats] = useState<BookStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'time'>('overview');
  
  // Mock data for reading time (will be replaced with real data later)
  const [dailyReadingData, setDailyReadingData] = useState<DailyReadingData[]>([]);
  const [weeklyReadingData, setWeeklyReadingData] = useState<DailyReadingData[]>([]);

  // Colors for charts
  const COLORS = ['#FF8C00', '#FF621F', '#FF4500', '#FF7F50', '#FFA07A', '#FF6347'];
  
  const { width } = useWindowSize();
  const isMobile = width < 768;
  const isSmallMobile = width < 480;
  
  useEffect(() => {
    fetchBooks();
    generateMockData();
  }, []);

  const fetchBooks = async () => {
    try {
      setIsLoading(true);
      
      // Try to fetch books with progress first
      let response = await fetch(`${API_URL}/api/books/with-progress`);
      
      // If that fails, fetch regular books
      if (!response.ok) {
        response = await fetch(`${API_URL}/api/books/`);
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch books');
      }
      
      const data = await response.json();
      setBooks(data);
      
      // Calculate statistics
      calculateStatistics(data);
    } catch (error) {
      console.error('Error fetching books:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStatistics = (books: Book[]) => {
    // Basic counts
    const totalBooks = books.length;
    const booksRead = books.filter(book => book.status === 'Read').length;
    const booksReading = books.filter(book => book.status === 'Reading').length;
    const booksToRead = books.filter(book => book.status === 'To read').length;
    
    // Calculate reading streak (mock data for now)
    const readingStreak = 7; // Mock data
    
    // Calculate total reading time (mock data for now)
    const totalReadingTime = books.reduce((sum, book) => {
      // Estimate 2 minutes per page for read books
      if (book.status === 'Read') {
        return sum + ((book.pages || 0) * 2);
      }
      // For books in progress, use progress percentage
      if (book.status === 'Reading' && book.progress?.progress_percentage) {
        return sum + ((book.pages || 0) * (book.progress.progress_percentage / 100) * 2);
      }
      return sum;
    }, 0);
    
    setBookStats({
      totalBooks,
      booksRead,
      booksReading,
      booksToRead,
      readingStreak,
      totalReadingTime
    });
  };

  const generateMockData = () => {
    // Generate daily reading data for the last 30 days
    const daily = [];
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Generate random reading minutes between 0 and 120
      const minutes = Math.floor(Math.random() * 120);
      
      daily.push({
        date: date.toISOString().split('T')[0],
        minutes
      });
    }
    
    setDailyReadingData(daily);
    
    // Generate weekly reading data for the last 12 weeks
    const weekly = [];
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - (i * 7));
      
      // Generate random reading minutes between 100 and 600
      const minutes = 100 + Math.floor(Math.random() * 500);
      
      weekly.push({
        date: `Week ${12-i}`,
        minutes
      });
    }
    
    setWeeklyReadingData(weekly);
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    if (hours === 0) {
      return `${mins} min`;
    }
    
    return `${hours}h ${mins}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <NavMenu />
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <NavMenu />
      
      <div className={styles.content}>
        <h1 className={styles.title}>Reading Statistics</h1>
        
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'overview' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'time' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('time')}
          >
            Reading Time
          </button>
        </div>
        
        {activeTab === 'overview' && bookStats && (
          <div className={styles.overviewTab}>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <h3>Total Books</h3>
                <p className={styles.statValue}>{bookStats.totalBooks}</p>
              </div>
              
              <div className={styles.statCard}>
                <h3>Books Read</h3>
                <p className={styles.statValue}>{bookStats.booksRead}</p>
              </div>
              
              <div className={styles.statCard}>
                <h3>Currently Reading</h3>
                <p className={styles.statValue}>{bookStats.booksReading}</p>
              </div>
              
              <div className={styles.statCard}>
                <h3>To Read</h3>
                <p className={styles.statValue}>{bookStats.booksToRead}</p>
              </div>
              
              <div className={styles.statCard}>
                <h3>Reading Streak</h3>
                <p className={styles.statValue}>{bookStats.readingStreak} days</p>
              </div>
              
              <div className={styles.statCard}>
                <h3>Total Reading Time</h3>
                <p className={styles.statValue}>{formatTime(bookStats.totalReadingTime)}</p>
              </div>
            </div>
            
            <div className={styles.chartSection}>
              <h2>Reading Status</h2>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Read', value: bookStats.booksRead },
                        { name: 'Reading', value: bookStats.booksReading },
                        { name: 'To Read', value: bookStats.booksToRead }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={isSmallMobile ? 70 : 100}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => 
                        isSmallMobile 
                          ? `${(percent * 100).toFixed(0)}%` 
                          : `${name}: ${(percent * 100).toFixed(0)}%`
                      }
                    >
                      {[0, 1, 2].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} books`, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'time' && (
          <div className={styles.timeTab}>
            <div className={styles.chartSection}>
              <h2>Daily Reading Time (Last 30 Days)</h2>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyReadingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatDate}
                      interval={isMobile ? 13 : 6}
                      stroke="#999"
                    />
                    <YAxis 
                      label={{ 
                        value: 'Minutes', 
                        angle: -90, 
                        position: 'insideLeft',
                        style: { fill: '#999' }
                      }} 
                      stroke="#999"
                    />
                    <Tooltip 
                      formatter={(value) => [`${value} minutes`, 'Reading time']}
                      labelFormatter={(label) => formatDate(label)}
                      contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #444' }}
                    />
                    <Bar dataKey="minutes" fill="#FF8C00" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className={styles.chartSection}>
              <h2>Weekly Reading Time (Last 12 Weeks)</h2>
              <div className={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyReadingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#999"
                      interval={isMobile ? 2 : 0}
                    />
                    <YAxis 
                      label={{ 
                        value: 'Minutes', 
                        angle: -90, 
                        position: 'insideLeft',
                        style: { fill: '#999' }
                      }} 
                      stroke="#999"
                    />
                    <Tooltip 
                      formatter={(value) => [`${formatTime(value as number)}`, 'Reading time']}
                      contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #444' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="minutes" 
                      stroke="#FF8C00" 
                      strokeWidth={2}
                      dot={{ fill: '#FF8C00', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <h3>Average Daily</h3>
                <p className={styles.statValue}>
                  {formatTime(Math.round(dailyReadingData.reduce((sum, day) => sum + day.minutes, 0) / dailyReadingData.length))}
                </p>
              </div>
              
              <div className={styles.statCard}>
                <h3>Average Weekly</h3>
                <p className={styles.statValue}>
                  {formatTime(Math.round(weeklyReadingData.reduce((sum, week) => sum + week.minutes, 0) / weeklyReadingData.length))}
                </p>
              </div>
              
              <div className={styles.statCard}>
                <h3>Best Day</h3>
                <p className={styles.statValue}>
                  {formatTime(Math.max(...dailyReadingData.map(day => day.minutes)))}
                </p>
              </div>
              
              <div className={styles.statCard}>
                <h3>Best Week</h3>
                <p className={styles.statValue}>
                  {formatTime(Math.max(...weeklyReadingData.map(week => week.minutes)))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 