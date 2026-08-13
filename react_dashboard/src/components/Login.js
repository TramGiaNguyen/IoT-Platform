import React, { useState } from 'react';
import { login } from '../services';

const Login = ({ setToken }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(username, password);
      const data = res.data;
      setToken(
        data.access_token,
        data.refresh_token,
        data.vai_tro,
        data.allowed_pages,
        data.phai_doi_mat_khau,
        data.user_id || null,
      );
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
            <label>Tên người dùng</label>
            <input
              placeholder="Tên người dùng"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />

            <label>Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                placeholder="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={18}
                style={{ paddingRight: '40px', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? (
                  /* Eye Closed - an mat khau */
                  <svg width="20" height="20" viewBox="0 0 16 16" version="1.1" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#64748b" d="M8 3.5C5.5 3.5 3.8 5.6 2.1 7.5c0.2 0.3.2 0.7 0 1L3 9.3c0.1.2.2.3.4.3.1 0 .2 0 .3-.1C5.8 8.1 6.9 7.5 8 7.5s2.2.6 4.3 1.9c.1.1.2.1.3.1.1 0 .3-.1.4-.3L13.9 8.5c.2-.3.2-.7 0-1C12.2 5.6 10.5 3.5 8 3.5zM5.5 5.7c0.4-.2.9-.2 1.3-.2s0.9 0 1.3.2C6.4 6.2 5.5 7.5 5.5 8.5c0 1-.9 2.3-1.6 3.1-.4.2-.9.2-1.3.2s-.9 0-1.3-.2C1.9 10.8 1 9.5 1 8.5S2.3 5.7 5.5 5.7zM8 9.5c1.1 0 2-.4 2-.4s-.9.4-2 .4-2-.4-2-.4.9.4 2 .4z"/>
                    <path fill="#64748b" d="M8 1.5C3.3 1.5 1 5.6 1 5.6s.8 2.5 4 3.6c0 0-.4-.6-.4-1.4 0-1.5 1.2-2.8 2.8-2.8s2.8 1.3 2.8 2.8c0 .8-.2 1.4-.4 1.4 3.2-1.1 4-3.6 4-3.6S12.7 1.5 8 1.5z"/>
                  </svg>
                ) : (
                  /* Eye Open - hien mat khau */
                  <svg width="20" height="20" viewBox="0 0 16 16" version="1.1" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#64748b" d="M8 3.5C5.5 3.5 3.8 5.6 2.1 7.5c0.2 0.3.2 0.7 0 1L3 9.3c0.1.2.2.3.4.3.1 0 .2 0 .3-.1C5.8 8.1 6.9 7.5 8 7.5s2.2.6 4.3 1.9c.1.1.2.1.3.1.1 0 .3-.1.4-.3L13.9 8.5c.2-.3.2-.7 0-1C12.2 5.6 10.5 3.5 8 3.5zM5.5 5.7c0.4-.2.9-.2 1.3-.2s0.9 0 1.3.2C6.4 6.2 5.5 7.5 5.5 8.5c0 1-.9 2.3-1.6 3.1-.4.2-.9.2-1.3.2s-.9 0-1.3-.2C1.9 10.8 1 9.5 1 8.5S2.3 5.7 5.5 5.7zM8 9.5c1.1 0 2-.4 2-.4s-.9.4-2 .4-2-.4-2-.4.9.4 2 .4z"/>
                    <path fill="#64748b" d="M8 1.5C3.3 1.5 1 5.6 1 5.6s.8 2.5 4 3.6c0 0-.4-.6-.4-1.4 0-1.5 1.2-2.8 2.8-2.8s2.8 1.3 2.8 2.8c0 .8-.2 1.4-.4 1.4 3.2-1.1 4-3.6 4-3.6S12.7 1.5 8 1.5zM3.5 5.7c0.5-.3 1.3-.3 1.3-.3s-0.5.9-.5 1.6c0 .7.2 1.1.2 1.1l-1.1.2c0 0-.3-.5-.3-1.2 0-.8.4-1.4.4-1.4z"/>
                  </svg>
                )}
              </button>
            </div>

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
