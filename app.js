require('dotenv').config();
const express = require('express');
const IBM = require('ibm-cos-sdk');
const basicAuth = require('basic-auth');
const { promisify } = require('util');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const execPromise = promisify(exec);

// Log file setup
const logFile = path.join(__dirname, 'logs', 'backup.log');
fs.mkdirSync(path.dirname(logFile), { recursive: true });

const log = (message, notify = false) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
  if (notify) sendEmailNotification(logMessage);
};

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmailNotification = (message) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: 'Backup Dashboard Notification',
    text: message,
  };
  transporter.sendMail(mailOptions, (error) => {
    if (error) log(`Email notification failed: ${error.message}`);
    else log('Email notification sent successfully');
  });
};

log('Starting Backup & Restore Dashboard...');

const cosConfig = {
  endpoint: process.env.COS_ENDPOINT,
  apiKeyId: process.env.COS_API_KEY,
  serviceInstanceId: process.env.COS_SERVICE_INSTANCE_ID,
};
const cos = new IBM.S3(cosConfig);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// WebSocket connection
io.on('connection', (socket) => {
  log('Client connected for real-time updates');
});

// Authentication middleware
app.use((req, res, next) => {
  const user = basicAuth(req);
  if (user && user.name === process.env.ADMIN_USER && user.pass === process.env.ADMIN_PASS) {
    log(`Authentication successful for user: ${user.name}`);
    next();
  } else {
    log('Authentication failed');
    res.set('WWW-Authenticate', 'Basic realm="Backup Dashboard"');
    res.status(401).send('Authentication required');
  }
});

// Home Route - Show Backups, Logs, and Auto-Backup Status
app.get('/', async (req, res) => {
  try {
    log('Fetching backup list from IBM Cloud Storage...');
    const list = await cos.listObjectsV2({ Bucket: process.env.COS_BUCKET_NAME }).promise();
    const backups = list.Contents.map((item) => item.Key);
    const logs = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).reverse().slice(0, 50);
    const autoBackupSchedule = process.env.AUTO_BACKUP_SCHEDULE || 'Not scheduled';
    log(`Found ${backups.length} backups`);
    res.render('dashboard', { backups, logs, autoBackupSchedule });
  } catch (error) {
    log(`Error loading dashboard: ${error.message}`, true);
    res.status(500).send('Failed to load dashboard');
  }
});

// Backup Function (Reusable for Manual and Auto)
const performBackup = async (socket) => {
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `backup-${timestamp}.sql`;
    const filepath = path.join(__dirname, 'temp', filename);

    log(`Starting backup process: ${filename}`);
    if (socket) socket.emit('progress', { message: 'Starting backup...', percentage: 0 });

    await execPromise(
      `pg_dump -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -f ${filepath}`,
      { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } }
    );

    log(`Backup file created: ${filepath}, uploading to IBM COS...`);
    if (socket) socket.emit('progress', { message: 'Uploading backup...', percentage: 10 });

    const fileSize = fs.statSync(filepath).size;
    let uploadedBytes = 0;

    const fileStream = fs.createReadStream(filepath);
    fileStream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      const percentage = ((uploadedBytes / fileSize) * 90 + 10).toFixed(2);
      if (socket) socket.emit('progress', { message: 'Uploading...', percentage });
    });

    await cos.upload({ Bucket: process.env.COS_BUCKET_NAME, Key: filename, Body: fileStream }).promise();

    log(`Backup uploaded: ${filename}`);
    if (socket) socket.emit('progress', { message: 'Backup completed', percentage: 100 });

    fs.unlinkSync(filepath);
    log(`Temporary file deleted: ${filepath}`);
    return true;
  } catch (error) {
    log(`Backup failed: ${error.message}`, true);
    if (socket) socket.emit('progress', { message: 'Backup failed', percentage: -1 });
    return false;
  }
};

// Manual Backup Route
app.post('/backup', async (req, res) => {
  await performBackup(io);
  res.redirect('/');
});

// Auto-Backup Scheduling
if (process.env.AUTO_BACKUP_SCHEDULE) {
  cron.schedule(process.env.AUTO_BACKUP_SCHEDULE, async () => {
    log('Running scheduled auto-backup...');
    await performBackup(null); // No socket for auto-backup
    log('Auto-backup completed');
  });
  log(`Auto-backup scheduled with cron expression: ${process.env.AUTO_BACKUP_SCHEDULE}`);
}

// Restore Route
app.post('/restore/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'temp', filename);

    log(`Starting restore process: ${filename}`);
    io.emit('progress', { message: 'Starting restore...', percentage: 0 });

    const metadata = await cos.headObject({ Bucket: process.env.COS_BUCKET_NAME, Key: filename }).promise();
    const fileSize = metadata.ContentLength;
    let downloadedBytes = 0;

    const fileStream = fs.createWriteStream(filepath);
    const objectStream = cos.getObject({ Bucket: process.env.COS_BUCKET_NAME, Key: filename }).createReadStream();

    objectStream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const percentage = ((downloadedBytes / fileSize) * 80).toFixed(2);
      io.emit('progress', { message: 'Downloading...', percentage });
    });

    objectStream.pipe(fileStream);
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    log(`Backup file downloaded: ${filename}, restoring database...`);
    io.emit('progress', { message: 'Restoring database...', percentage: 80 });

    await execPromise(
      `psql -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -f ${filepath}`,
      { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } }
    );

    log(`Database restored successfully from: ${filename}`, true);
    io.emit('progress', { message: 'Restore completed', percentage: 100 });

    fs.unlinkSync(filepath);
    log(`Temporary file deleted: ${filepath}`);

    res.redirect('/');
  } catch (error) {
    log(`Restore failed: ${error.message}`, true);
    io.emit('progress', { message: 'Restore failed', percentage: -1 });
    res.status(500).send('Restore failed');
  }
});

// Delete Backup Route
app.post('/delete/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    log(`Deleting backup: ${filename}`);
    await cos.deleteObject({ Bucket: process.env.COS_BUCKET_NAME, Key: filename }).promise();
    log(`Backup deleted successfully: ${filename}`, true);
    res.redirect('/');
  } catch (error) {
    log(`Delete failed: ${error.message}`, true);
    res.status(500).send('Delete failed');
  }
});

// Download Backup Route
app.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    log(`Downloading backup: ${filename}`);
    const fileStream = cos.getObject({ Bucket: process.env.COS_BUCKET_NAME, Key: filename }).createReadStream();
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fileStream.pipe(res);
    fileStream.on('end', () => log(`Backup downloaded successfully: ${filename}`));
  } catch (error) {
    log(`Download failed: ${error.message}`, true);
    res.status(500).send('Download failed');
  }
});

// Disaster Recovery Route
app.post('/disaster-recovery/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const tempDbName = `recovery_${Date.now()}`;
    const filepath = path.join(__dirname, 'temp', filename);

    log(`Starting disaster recovery with temporary database: ${tempDbName}`);
    io.emit('progress', { message: 'Starting disaster recovery...', percentage: 0 });

    await execPromise(
      `createdb -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} ${tempDbName}`,
      { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } }
    );
    log(`Temporary database created: ${tempDbName}`);
    io.emit('progress', { message: 'Temporary database created...', percentage: 10 });

    const metadata = await cos.headObject({ Bucket: process.env.COS_BUCKET_NAME, Key: filename }).promise();
    const fileSize = metadata.ContentLength;
    let downloadedBytes = 0;

    const fileStream = fs.createWriteStream(filepath);
    const objectStream = cos.getObject({ Bucket: process.env.COS_BUCKET_NAME, Key: filename }).createReadStream();

    objectStream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const percentage = ((downloadedBytes / fileSize) * 70 + 10).toFixed(2);
      io.emit('progress', { message: 'Downloading backup...', percentage });
    });

    objectStream.pipe(fileStream);
    await new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    log(`Backup downloaded: ${filename}`);
    io.emit('progress', { message: 'Restoring to temporary database...', percentage: 80 });

    await execPromise(
      `psql -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} -d ${tempDbName} -f ${filepath}`,
      { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } }
    );

    log(`Temporary database restored: ${tempDbName}`, true);
    io.emit('progress', { message: 'Disaster recovery completed', percentage: 100 });

    fs.unlinkSync(filepath);
    log(`Temporary file deleted: ${filepath}`);

    res.redirect('/');
  } catch (error) {
    log(`Disaster recovery failed: ${error.message}`, true);
    io.emit('progress', { message: 'Disaster recovery failed', percentage: -1 });
    res.status(500).send('Disaster recovery failed');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`Server running on port ${PORT}`);
});