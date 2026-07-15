module.exports = function override(config, env) {
  // Cho phép mọi host truy cập webpack dev server
  if (config.devServer) {
    config.devServer.allowedHosts = 'all';
    config.devServer.host = '0.0.0.0';  // Bind to all interfaces
    config.devServer.useLocalIp = false;
  } else {
    config.devServer = {
      allowedHosts: 'all',
      host: '0.0.0.0',  // Bind to all interfaces
      useLocalIp: false
    };
  }

  return config;
};


