const mongoose = require('mongoose');

const EmailSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
    trim: true
  },
  body: {
    type: String,
    required: true
  },
  recipients: {
    type: [String],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'partial'],
    default: 'pending'
  },
  successCount: {
    type: Number,
    default: 0
  },
  failureCount: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String,
    default: ''
  },
  etherealUrl: {
    type: String,
    default: ''
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Email', EmailSchema);
