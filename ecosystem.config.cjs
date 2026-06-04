module.exports = {
  apps: [
    {
      name: "lawpath-api",
      script: "server/index.js",
      cwd: "/home2/lawpath/app/LawPath",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3069
      },
      time: true,
      max_memory_restart: "512M",
      error_file: "/home2/lawpath/app/LawPath/logs/api-error.log",
      out_file: "/home2/lawpath/app/LawPath/logs/api-out.log",
      merge_logs: true
    }
  ]
};
