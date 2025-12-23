import axios, { AxiosInstance } from 'axios';
import { LoginResponse } from '../types';

// Create Axios instance
const api: AxiosInstance = axios.create({
  baseURL: 'https://api.mock-bdu-iot.com', // Mock URL
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// MOCK API FUNCTION for demonstration purposes
// In a real app, this would hit the actual backend
export const loginUser = async (username: string, password: string): Promise<LoginResponse> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  if (username === 'admin' && password === '123456') {
    const mockResponse: LoginResponse = {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-token',
      user: {
        id: '1',
        username: 'admin',
        name: 'Quản trị viên',
        role: 'admin',
      },
    };
    return mockResponse;
  }
  
  throw new Error('Tên đăng nhập hoặc mật khẩu không đúng');
};

export default api;
