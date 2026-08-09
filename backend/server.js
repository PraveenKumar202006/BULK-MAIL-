const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const Email = require('./models/Email');

const app = express();
const PORT = process.env.PORT || 5009;

// Middleware
app.use(cors());
app.use(express.json());

// In-Memory Database Fallback if MongoDB is not running
let isMongoConnected = false;
const inMemoryDb = [];

// MongoDB Connection
console.log('Attempting to connect to MongoDB...');
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    isMongoConnected = true;
    console.log('✅ MongoDB connected successfully!');
  })
  .catch(err => {
    isMongoConnected = false;
    console.warn('⚠️ MongoDB connection error:', err.message);
    console.warn('⚠️ App is running in MEMORY FALLBACK mode. History will not persist across restarts.');
    console.warn('⚠️ To enable persistence, start local MongoDB or set MONGO_URI in .env');
  });

// Admin Login Route
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const adminUsername = process.env.ADMIN_USERNAME || 'unique_mail_admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'secure_bulk_pass_2026';

  if (username === adminUsername && password === adminPassword) {
    // Generate a simple token for frontend session management (mock JWT/session token)
    res.status(200).json({ 
      success: true, 
      token: 'mock-session-token-admin',
      user: { username: adminUsername }
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid credentials. Please check your username and password.' 
    });
  }
});

// Helper function to create Nodemailer transporter
async function getTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log('Using custom SMTP configuration:', process.env.SMTP_HOST);
    return {
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      }),
      isTest: false
    };
  }

  // Fallback: Create ethereal email test account dynamically
  console.log('No custom SMTP credentials found. Creating a dynamic Ethereal test account...');
  const testAccount = await nodemailer.createTestAccount();
  console.log('Created Ethereal Test Account user:', testAccount.user);
  
  return {
    transporter: nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    }),
    isTest: true
  };
}

// Send Bulk Mail Route
app.post('/api/emails/send', async (req, res) => {
  const { subject, body, recipients } = req.body;

  if (!subject || !body || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, message: 'Missing subject, body, or recipients' });
  }

  console.log(`Starting bulk mail process for ${recipients.length} recipients...`);

  // Create local email state object
  const localEmail = {
    subject,
    body,
    recipients,
    status: 'pending',
    successCount: 0,
    failureCount: 0,
    errorMessage: '',
    etherealUrl: '',
    sentAt: new Date()
  };

  let dbRecord = null;
  if (isMongoConnected) {
    try {
      dbRecord = new Email(localEmail);
      await dbRecord.save();
    } catch (dbErr) {
      console.error('Failed to create pending MongoDB record:', dbErr.message);
    }
  }

  try {
    const { transporter, isTest } = await getTransporter();
    const fromAddress = process.env.SMTP_FROM || '"Bulk Mail Service" <no-reply@example.com>';

    let successCount = 0;
    let failureCount = 0;
    let etherealUrl = '';

    for (const recipient of recipients) {
      try {
        const info = await transporter.sendMail({
          from: fromAddress,
          to: recipient,
          subject: subject,
          html: body.replace(/\n/g, '<br/>')
        });

        successCount++;
        console.log(`Email successfully sent to ${recipient}. MessageId: ${info.messageId}`);
        
        if (isTest && !etherealUrl) {
          etherealUrl = nodemailer.getTestMessageUrl(info);
          console.log(`Ethereal Preview URL: ${etherealUrl}`);
        }
      } catch (err) {
        failureCount++;
        console.error(`Failed to send email to ${recipient}:`, err.message);
      }
    }

    // Update fields
    localEmail.successCount = successCount;
    localEmail.failureCount = failureCount;
    localEmail.etherealUrl = etherealUrl;

    if (successCount === recipients.length) {
      localEmail.status = 'success';
    } else if (successCount > 0 && failureCount > 0) {
      localEmail.status = 'partial';
    } else {
      localEmail.status = 'failed';
      localEmail.errorMessage = 'All email dispatches failed.';
    }

    // Save final status
    if (isMongoConnected && dbRecord) {
      try {
        dbRecord.status = localEmail.status;
        dbRecord.successCount = localEmail.successCount;
        dbRecord.failureCount = localEmail.failureCount;
        dbRecord.etherealUrl = localEmail.etherealUrl;
        dbRecord.errorMessage = localEmail.errorMessage;
        await dbRecord.save();
      } catch (dbSaveErr) {
        console.error('Failed to update MongoDB record:', dbSaveErr.message);
      }
    } else {
      localEmail._id = Date.now().toString(); // unique id for frontend mapping
      inMemoryDb.unshift(localEmail); // add to top of array
    }

    res.status(200).json({
      success: true,
      message: `Emails sent: ${successCount} succeeded, ${failureCount} failed.`,
      data: dbRecord || localEmail
    });

  } catch (error) {
    console.error('SMTP configuration/sending error:', error);
    localEmail.status = 'failed';
    localEmail.errorMessage = error.message;

    if (isMongoConnected && dbRecord) {
      try {
        dbRecord.status = 'failed';
        dbRecord.errorMessage = error.message;
        await dbRecord.save();
      } catch (dbSaveErr) {
        console.error('Failed to update MongoDB error state:', dbSaveErr.message);
      }
    } else {
      localEmail._id = Date.now().toString();
      inMemoryDb.unshift(localEmail);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to establish connection to mail server.',
      error: error.message,
      data: dbRecord || localEmail
    });
  }
});

// Fetch Mail History Route
app.get('/api/emails/history', async (req, res) => {
  try {
    if (isMongoConnected) {
      const history = await Email.find().sort({ sentAt: -1 });
      return res.status(200).json({ success: true, data: history });
    } else {
      return res.status(200).json({ success: true, data: inMemoryDb });
    }
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch email history' });
  }
});

// Delete Mail Record Route
app.delete('/api/emails/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (isMongoConnected) {
      const deleted = await Email.findByIdAndDelete(id);
      if (deleted) {
        return res.status(200).json({ success: true, message: 'Email record deleted successfully.' });
      } else {
        return res.status(404).json({ success: false, message: 'Email record not found.' });
      }
    } else {
      const index = inMemoryDb.findIndex(item => item._id === id);
      if (index !== -1) {
        inMemoryDb.splice(index, 1);
        return res.status(200).json({ success: true, message: 'Email record deleted from memory.' });
      } else {
        return res.status(404).json({ success: false, message: 'Email record not found.' });
      }
    }
  } catch (error) {
    console.error('Error deleting record:', error);
    res.status(500).json({ success: false, message: 'Failed to delete email record' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
