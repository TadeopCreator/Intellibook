const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Helper function to get auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// Helper function for FormData requests (don't set Content-Type for FormData)
const getAuthHeadersForFormData = (): HeadersInit => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  
  const headers: HeadersInit = {};
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

// Generic API request function
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  
  // Determine if this is a FormData request
  const isFormData = options.body instanceof FormData;
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...(isFormData ? getAuthHeadersForFormData() : getAuthHeaders()),
      ...options.headers,
    },
  };
  
  const response = await fetch(url, config);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', response.status, response.statusText, errorText);
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response;
};

// API service object
export const api = {
  // Generic request method
  request: apiRequest,
  
  // Auth endpoints
  auth: {
    check: () => apiRequest('/api/auth/check'),
    status: () => apiRequest('/api/auth/status'),
  },
  
  // Books endpoints
  books: {
    getAll: () => apiRequest('/api/books/'),
    getAllWithProgress: () => apiRequest('/api/books/with-progress'),
    getById: (id: number) => apiRequest(`/api/books/${id}`),
    create: (formData: FormData) => apiRequest('/api/books/', {
      method: 'POST',
      body: formData,
    }),
    update: (id: number, formData: FormData) => apiRequest(`/api/books/${id}`, {
      method: 'PUT',
      body: formData,
    }),
    delete: (id: number) => apiRequest(`/api/books/${id}`, {
      method: 'DELETE',
    }),
    getContent: (id: number) => apiRequest(`/api/books/${id}/content`),
    getSignedUrl: (id: number) => apiRequest(`/api/signed-url/${id}`),
  },
  
  // Reading progress endpoints
  progress: {
    get: (bookId: number) => apiRequest(`/api/books/${bookId}/progress`),
    update: (bookId: number, data: any) => apiRequest(`/api/books/${bookId}/progress`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  },
  
  // Chat endpoints
  chat: {
    askGemini: (question: string, sessionId?: string) => {
      const params = new URLSearchParams({ question });
      if (sessionId) {
        params.append('session_id', sessionId);
      }
      return apiRequest(`/api/ask-gemini?${params}`);
    },
    transcribeAudio: (audioFile: File) => {
      const formData = new FormData();
      formData.append('audio', audioFile);
      return apiRequest('/api/transcribe-audio', {
        method: 'POST',
        body: formData,
      });
    },
  },

  // Statistics endpoints
  statistics: {
    getOverview: () => apiRequest('/api/statistics/overview'),
    getReadingTime: (period?: 'daily' | 'weekly') => {
      const params = period ? `?period=${period}` : '';
      return apiRequest(`/api/statistics/reading-time${params}`);
    },
    getBookStats: () => apiRequest('/api/statistics/books'),
  },
};

// For backward compatibility, export the BASE_URL
export { BASE_URL as API_URL };

export default api; 