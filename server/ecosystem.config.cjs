module.exports = {
  apps: [{
    name: 'timeplan',
    script: 'src/index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    time: true,
  }],
};