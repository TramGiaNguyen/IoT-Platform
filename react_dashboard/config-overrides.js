module.exports = function override(config, env) {
  // Cấu hình allowedHosts cho webpack dev server
  if (config.devServer) {
    config.devServer.allowedHosts = [
      'cds.bdu.edu.vn',
      '192.168.69.69'
    ];
  } else {
    config.devServer = {
      allowedHosts: [
        'cds.bdu.edu.vn',
        '192.168.69.69'
      ]
    };
  }
  
  return config;
};


