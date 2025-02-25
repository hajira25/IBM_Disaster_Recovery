# IBM_Disaster_Recovery

Let me break down the project details, setup instructions, and the `.env` file configuration for you based on the provided code. This is a **Database Backup & Restore Dashboard** built with Node.js, Express, IBM Cloud Object Storage (COS), PostgreSQL, WebSockets, and a simple EJS frontend. It allows manual and automated backups, restores, disaster recovery, and log monitoring.

---

### Project Overview
The application provides a web-based dashboard to:
- Create manual database backups (PostgreSQL dump) and upload them to IBM COS.
- Schedule automatic backups using a cron expression.
- Restore a database from a backup.
- Perform disaster recovery by creating a temporary database.
- Download or delete backups.
- View real-time logs and progress via WebSockets.
- Send email notifications for critical events.

It uses basic authentication for security and logs all activities to a file.

---

### Project Dependencies
Before setting up, ensure you have the following installed:
1. **Node.js** (v14.x or later recommended)
2. **PostgreSQL** (with `pg_dump` and `psql` CLI tools installed)
3. **IBM Cloud Object Storage** account (for storing backups)
4. **Git** (optional, for cloning or version control)

Install the required Node.js packages:
```bash
npm install dotenv express ibm-cos-sdk basic-auth util child_process fs path http socket.io node-cron nodemailer ejs
```

---

### Project Structure
Here’s how your project directory should look after setup:

```
your-project/
├── logs/
│   └── backup.log        # Log file (auto-created)
├── public/
│   ├── styles.css       # CSS for the dashboard
│   └── script.js        # Client-side JS (provided above)
├── temp/                # Temporary folder for backup/restore files (auto-created)
├── views/
│   └── dashboard.ejs    # EJS template (provided above)
├── .env                 # Environment variables file
├── package.json         # Node.js project config
└── server.js            # Main application file (provided above)
```

---

### Setup Instructions
1. **Clone or Create the Project**
   - If you have a Git repo, clone it. Otherwise, create a new directory:
     ```bash
     mkdir backup-dashboard
     cd backup-dashboard
     npm init -y
     ```
   - Copy the provided `server.js`, `dashboard.ejs`, and client-side `script.js` into the appropriate directories.

2. **Install Dependencies**
   - Run the `npm install` command listed above to install all required packages.

3. **Set Up IBM Cloud Object Storage**
   - Create an IBM COS bucket in your IBM Cloud account.
   - Note the endpoint, API key, service instance ID, and bucket name.

4. **Set Up PostgreSQL**
   - Ensure you have a PostgreSQL database running.
   - Install PostgreSQL CLI tools (`pg_dump` and `psql`) if not already present:
     ```bash
     # On Ubuntu/Debian
     sudo apt-get install postgresql-client
     # On macOS
     brew install libpq
     ```

5. **Prepare the `.env` File**
   - Create a `.env` file in the project root (see details below).

6. **Run the Application**
   - Start the server:
     ```bash
     node server.js
     ```
   - Access the dashboard at `http://localhost:3000` (or your configured port).

---

### `.env` File Configuration
The `.env` file stores environment variables required for the application. Below is a template with explanations:

```plaintext
# Server Configuration
PORT=3000                    # Port for the Express server

# Authentication
ADMIN_USER=admin                   # Username for basic auth
ADMIN_PASS=securepassword          # Password for basic auth

# PostgreSQL Database
DB_HOST=localhost              # Database host
DB_PORT=5433                   # Database port
DB_USER=your-username          # Database username
DB_PASSWORD=your-password      # Database password
DB_NAME=your-database-name     # Database name

# IBM Cloud Object Storage (COS)
COS_ENDPOINT=your-endpoint                                     # COS endpoint URL
COS_API_KEY=your-api-key                                       # COS API key
COS_SERVICE_INSTANCE_ID=your-service-instant-id                # COS service instance ID
COS_BUCKET_NAME=your-bucket-name                               # COS bucket name

# Email Notification (Gmail example)
EMAIL_USER=your-email@gmail.com       # Email sender address
EMAIL_PASS=your-app-password          # Gmail App Password (not regular password)
NOTIFY_EMAIL=notify@example.com       # Email recipient for notifications

# Auto-Backup Schedule (Cron format: minute hour day month day-of-week)
AUTO_BACKUP_SCHEDULE=0 2 * * *        # Example: Daily at 2 AM
```

#### Notes:
- **Gmail App Password**: If using Gmail, generate an App Password in your Google Account settings (requires 2FA enabled).
- **Cron Schedule**: Use a cron expression (e.g., `0 2 * * *` for 2 AM daily). Leave blank or omit to disable auto-backup.
- **IBM COS**: Replace placeholders with your actual IBM COS credentials (find them in the IBM Cloud console)
---

### How to Use the Dashboard
1. **Access**: Open `http://localhost:3000` and log in with the `ADMIN_USER` and `ADMIN_PASS` from `.env`.
2. **Manual Backup**: Click "Create New Backup" to generate and upload a backup.
3. **Restore**: Select a backup and click "Restore" to overwrite the current database.
4. **Disaster Recovery**: Click "Disaster Recovery" to restore a backup into a temporary database.
5. **Download/Delete**: Use the respective buttons to download or delete backups.
6. **Logs**: View recent logs and filter them using the search bar.
7. **Auto-Backup**: If scheduled in `.env`, backups run automatically.

---

### Troubleshooting
- **Authentication Fails**: Check `ADMIN_USER` and `ADMIN_PASS` in `.env`.
- **Database Errors**: Ensure PostgreSQL credentials are correct and `pg_dump`/`psql` are in your PATH.
- **IBM COS Errors**: Verify COS credentials and bucket name.
- **Email Issues**: Confirm `EMAIL_USER` and `EMAIL_PASS` (use an App Password for Gmail).
- **Port Conflict**: Change `PORT` in `.env` if 3000 is in use.

---

This setup should get your project running smoothly! 
