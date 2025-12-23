import React, { useState } from 'react';
import { login } from '../services';

const Login = ({ setToken }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(username, password);
      console.log('[Login] Response:', res.data);
      // Pass token, vai_tro, and allowed_pages to parent
      setToken(res.data.access_token, res.data.vai_tro, res.data.allowed_pages);
    } catch (err) {
      setError('Sai tài khoản hoặc mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-overlay" />
      <div className="login-container">
        <div className="login-card">
          <div className="login-hero">
            <img src="/bdu-logo.png" alt="BDU Logo" className="login-logo" />
            <div className="login-hero-text">
              <p className="hero-badge">BDU IoT Platform</p>
              <h2>Đăng nhập</h2>
              <p className="hero-subtitle">
                Hệ thống IoT Bình Dương - Trường Đại học Bình Dương
              </p>
            </div>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <label>Tài khoản</label>
            <input
              placeholder="Email đăng nhập"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />

            <label>Mật khẩu</label>
            <input
              placeholder="Mật khẩu"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            {error && <div className="login-error">{error}</div>}

            <button type="submit" disabled={loading}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;