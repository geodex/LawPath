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
    },
    {
      // SAFLII corpus indexer — runs every Sunday at 02:00
      // Indexes new SA case law from SAFLII into the legal_corpus_documents table.
      // First run: node server/saflii.js --limit 50 --years 5
      name: "lawpath-saflii-indexer",
      script: "server/saflii.js",
      cwd: "/home2/lawpath/app/LawPath",
      instances: 1,
      exec_mode: "fork",
      cron_restart: "0 2 * * 0",
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production"
      },
      time: true,
      error_file: "/home2/lawpath/app/LawPath/logs/saflii-error.log",
      out_file: "/home2/lawpath/app/LawPath/logs/saflii-out.log",
      merge_logs: true,
      args: "--limit 30 --years 2"
    },
    {
      // Notification scheduler — checks DSR deadlines and trust reconciliations daily at 07:00
      name: "lawpath-notifications",
      script: "server/notification-runner.js",
      cwd: "/home2/lawpath/app/LawPath",
      instances: 1,
      exec_mode: "fork",
      cron_restart: "0 7 * * *",
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production"
      },
      time: true,
      error_file: "/home2/lawpath/app/LawPath/logs/notifications-error.log",
      out_file: "/home2/lawpath/app/LawPath/logs/notifications-out.log",
      merge_logs: true
    }
  ]
};
