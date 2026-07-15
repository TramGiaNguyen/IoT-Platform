const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const apiUrl = process.env.REACT_APP_API_URL || 'http://fastapi-backend:8000';

  const opts = {
    target: apiUrl,
    changeOrigin: true,
    logLevel: 'warn',
  };

  // Proxy các API paths cụ thể (KHÔNG bao gồm /docs, /public vì đây là file tĩnh)
  const apiPaths = [
    '/token',
    '/refresh',
    '/auth',
    '/devices',
    '/rooms',
    '/users',
    '/rules',
    '/scheduled-rules',
    '/dashboards',
    '/ac',
    '/alerts',
    '/classes',
    '/groups',
    '/teachers',
    '/device-profiles',
    '/api',
    '/internal',
    '/health',
    '/ingest',
    '/telemetry',
    '/control',
    '/events',
    '/me',
  ];

  apiPaths.forEach(path => {
    app.use(path, createProxyMiddleware(opts));
  });

  // WebSocket
  app.use('/ws', createProxyMiddleware({ ...opts, ws: true }));
};