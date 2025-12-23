import React, { useState } from 'react';
import { loginUser } from '../services/api';

interface LoginFormProps {
  onLoginSuccess: (token: string) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Using the mocked Axios service
      const response = await loginUser(username, password);
      // Store token
      localStorage.setItem('jwt_token', response.token);
      onLoginSuccess(response.token);
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full network-bg flex items-center justify-center p-4">
      <div className="content-layer w-full max-w-[420px] bg-white rounded-lg shadow-2xl overflow-hidden p-8">
        
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 mb-4 relative flex items-center justify-center">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Logo_Dai_hoc_Binh_Duong.png/266px-Logo_Dai_hoc_Binh_Duong.png" 
              alt="BDU Logo" 
              className="object-contain w-full h-full"
            />
          </div>
          <h2 className="text-[#1a2b4b] text-2xl font-bold text-center">
            BDU-Flatform IoT
          </h2>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Username Field */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Tên người dùng
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <i className="far fa-user text-lg"></i>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên người dùng"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-600 placeholder-gray-400"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Mật khẩu
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <i className="fas fa-lock text-lg"></i>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu"
                className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-600 placeholder-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
              {error} (Thử: admin / 123456)
            </div>
          )}

          {/* Forgot Password Link */}
          <div className="flex justify-end">
            <a href="#" className="text-sm text-gray-600 hover:text-blue-800 font-medium">
              Quên mật khẩu?
            </a>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-[#ed7d31] hover:bg-[#d66b26] text-white font-medium py-3 px-4 rounded-md transition duration-200 shadow-md ${
              loading ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <i className="fas fa-circle-notch fa-spin mr-2"></i> Đang xử lý...
              </span>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        {/* No Registration Section */}
        <div className="mt-6 text-center">
           <span className="text-gray-600 text-sm">Chưa có tài khoản? </span>
           <a href="#" className="text-gray-800 text-sm font-medium hover:underline">Đăng ký ngay</a>
        </div>

      </div>
      
      {/* Footer Info */}
      <div className="absolute bottom-4 text-white/50 text-xs">
        &copy; 2024 BDU IoT Platform. All rights reserved.
      </div>
    </div>
  );
};

export default LoginForm;