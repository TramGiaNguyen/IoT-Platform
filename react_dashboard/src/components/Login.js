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
                style={{ paddingRight: '36px', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px',
                }}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? '🙈' : '👁'}
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
