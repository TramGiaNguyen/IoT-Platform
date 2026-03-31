module.exports = function override(config, env) {
  // Cho phép mọi host truy cập webpack dev server
  if (config.devServer) {
    config.devServer.allowedHosts = 'all';
  } else {
    config.devServer = {
      allowedHosts: 'all'
    };
  }
  
  return config;
};


