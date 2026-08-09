import React, { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:5009/api';

const BulkMailIcon = () => (
  <svg 
    width="28" 
    height="28" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    style={{ marginRight: '0.6rem', verticalAlign: 'text-bottom', color: 'var(--accent-primary)' }}
  >
    <path d="M6 2h14c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2" opacity="0.4" />
    <polyline points="6,6 13,11 20,6" opacity="0.4" />
    <rect x="2" y="7" width="16" height="12" rx="1.5" />
    <polyline points="2,9 10,14 18,9" />
  </svg>
);

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [authError, setAuthError] = useState('');

  // Email form state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // Email History state
  const [history, setHistory] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // UI state
  const [toasts, setToasts] = useState([]);
  const chipInputRef = useRef(null);

  // Check auth session on load
  useEffect(() => {
    const savedToken = localStorage.getItem('admin_token');
    const savedUser = localStorage.getItem('admin_username');
    if (savedToken) {
      setIsAuthenticated(true);
      setUsername(savedUser || 'admin');
      fetchHistory();
    }
  }, []);

  // Fetch History from API
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`${API_BASE}/emails/history`);
      const resData = await response.json();
      if (resData.success) {
        setHistory(resData.data);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
      showToast('error', 'Failed to retrieve email dispatch history.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Toast Management
  const showToast = (type, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Auth Submit
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });
      const data = await response.json();
      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        localStorage.setItem('admin_username', data.user.username);
        setIsAuthenticated(true);
        setUsername(data.user.username);
        showToast('success', 'Logged in successfully as Admin.');
        fetchHistory();
      } else {
        setAuthError(data.message);
      }
    } catch (err) {
      setAuthError('Connection server error. Is the backend running?');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    setIsAuthenticated(false);
    setUsername('');
    setHistory([]);
    setSelectedItem(null);
    showToast('success', 'Logged out successfully.');
  };

  // Recipients input actions
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.toLowerCase());
  };

  const addRecipient = (emailStr) => {
    const cleanEmail = emailStr.trim();
    if (!cleanEmail) return;

    if (!validateEmail(cleanEmail)) {
      showToast('error', `"${cleanEmail}" is not a valid email address.`);
      return;
    }

    if (recipients.includes(cleanEmail)) {
      showToast('warning', `"${cleanEmail}" is already added.`);
      return;
    }

    setRecipients(prev => [...prev, cleanEmail]);
  };

  const handleRecipientKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addRecipient(recipientInput);
      setRecipientInput('');
    }
  };

  const handleRecipientPaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    // Split by commas, semicolons, spaces or newlines
    const emails = pastedText.split(/[\s,;]+/);
    let addedCount = 0;
    
    emails.forEach(email => {
      const clean = email.trim();
      if (clean && validateEmail(clean) && !recipients.includes(clean)) {
        setRecipients(prev => {
          if (!prev.includes(clean)) {
            addedCount++;
            return [...prev, clean];
          }
          return prev;
        });
      }
    });

    if (addedCount > 0) {
      showToast('success', `Parsed and added ${addedCount} emails from clipboard.`);
    } else {
      showToast('error', 'No valid new email addresses found in pasted text.');
    }
    setRecipientInput('');
  };

  const removeRecipient = (indexToRemove) => {
    setRecipients(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  // Send Bulk Email Submit
  const handleSendEmail = async (e) => {
    e.preventDefault();

    if (recipients.length === 0) {
      showToast('error', 'Please add at least one recipient email.');
      return;
    }
    if (!subject.trim()) {
      showToast('error', 'Subject is required.');
      return;
    }
    if (!body.trim()) {
      showToast('error', 'Email body is required.');
      return;
    }

    setIsSending(true);
    showToast('info', `Dispatching bulk email queue to ${recipients.length} recipients...`);

    try {
      const response = await fetch(`${API_BASE}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, recipients })
      });
      const data = await response.json();

      if (data.success) {
        showToast('success', data.message);
        // Clear fields
        setSubject('');
        setBody('');
        setRecipients([]);
        setRecipientInput('');
        
        // Refresh History
        fetchHistory();
      } else {
        showToast('error', data.message || 'Dispatch failed.');
        fetchHistory();
      }
    } catch (err) {
      showToast('error', 'Failed to submit email queue to backend.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteEmail = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this email record from history?')) return;

    try {
      const response = await fetch(`${API_BASE}/emails/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        showToast('success', 'Email record deleted successfully.');
        setHistory(prev => prev.filter(item => item._id !== id));
        if (selectedItem && selectedItem._id === id) {
          setSelectedItem(null);
        }
      } else {
        showToast('error', data.message || 'Delete failed.');
      }
    } catch (err) {
      showToast('error', 'Failed to delete record from backend.');
    }
  };

  // Helper date formatter
  const formatDate = (dateStr) => {
    const options = { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    };
    return new Date(dateStr).toLocaleDateString('en-US', options);
  };

  // If not authenticated, render Login Screen
  if (!isAuthenticated) {
    return (
      <div className="auth-wrapper">
        <div className="glass-card auth-card">
          <div className="auth-header">
            <h1><BulkMailIcon />bulk mail</h1>
            <p className="subtitle">Admin Mail Control Console</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input 
                type="text" 
                className="form-input" 
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                placeholder="Enter admin username"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input 
                type="password" 
                className="form-input" 
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                placeholder="Enter admin password"
                required
              />
            </div>
            {authError && (
              <p style={{ color: 'var(--color-error)', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>
                {authError}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-block">
              Login
            </button>
          </form>
        </div>

        {/* Toasts */}
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.message}</span>
              <button className="toast-close" onClick={() => removeToast(t.id)}>&times;</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Dashboard Screen (Authenticated)
  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="app-header">
        <div>
          <h1><BulkMailIcon />bulk mail</h1>
        </div>
        <div className="user-info">
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Session: <strong>{username}</strong>
          </span>
          <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Grid Layout */}
      <div className="dashboard-grid">
        
        {/* Left Hand: Compose panel */}
        <div className="glass-card">
          <h2>Compose Bulk Email</h2>
          <form onSubmit={handleSendEmail}>
            <div className="form-group">
              <label className="form-label">Recipients</label>
              <div 
                className="chips-wrapper" 
                onClick={() => chipInputRef.current && chipInputRef.current.focus()}
              >
                {recipients.map((email, idx) => (
                  <span key={idx} className="email-chip">
                    {email}
                    <button type="button" onClick={() => removeRecipient(idx)}>&times;</button>
                  </span>
                ))}
                <input
                  ref={chipInputRef}
                  type="text"
                  className="chip-input"
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  onKeyDown={handleRecipientKeyDown}
                  onPaste={handleRecipientPaste}
                  placeholder={recipients.length === 0 ? "Type email + Enter, or paste list..." : ""}
                />
              </div>
              <p className="form-help">Press Enter or comma to add email. Paste comma-separated lists to import in bulk.</p>
            </div>

            <div className="form-group">
              <label className="form-label">Subject</label>
              <input
                type="text"
                className="form-input"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Enter email subject line"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Body</label>
              <textarea
                className="form-input form-textarea"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your email body here. Supports standard multiline text."
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={isSending}>
              {isSending ? (
                <>
                  <div className="spinner"></div>
                  Dispatching Bulk Queue...
                </>
              ) : (
                'Send Bulk Mail'
              )}
            </button>
          </form>
        </div>

        {/* Right Hand: History & Details panels */}
        <div className="flex flex-col gap-4">
          
          {/* Email History List */}
          <div className="glass-card" style={{ flex: 1 }}>
            <h2>Sent History</h2>
            
            {isLoadingHistory && history.length === 0 ? (
              <div className="text-center" style={{ padding: '2rem 0' }}>
                <div className="spinner" style={{ margin: '0 auto 1rem', borderTopColor: 'var(--accent-primary)' }}></div>
                <p style={{ color: 'var(--text-secondary)' }}>Loading history records...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center" style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>
                <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✉️</p>
                <p>No emails sent yet.</p>
              </div>
            ) : (
              <div className="history-container">
                {history.map(item => {
                  const total = item.recipients.length;
                  const success = item.successCount;
                  
                  let badgeClass = 'badge-pending';
                  if (item.status === 'success') badgeClass = 'badge-success';
                  if (item.status === 'failed') badgeClass = 'badge-failed';
                  if (item.status === 'partial') badgeClass = 'badge-partial';

                  return (
                    <div 
                      key={item._id} 
                      className={`history-item ${selectedItem && selectedItem._id === item._id ? 'active' : ''}`}
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="history-meta">
                        <span className={`badge ${badgeClass}`}>{item.status}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="history-date">{formatDate(item.sentAt)}</span>
                          <button 
                            onClick={(e) => handleDeleteEmail(item._id, e)} 
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              padding: '0 0.2rem',
                              transition: 'var(--transition-smooth)'
                            }}
                            onMouseOver={(e) => e.target.style.color = 'var(--color-error)'}
                            onMouseOut={(e) => e.target.style.color = 'var(--text-muted)'}
                            title="Delete record"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <div className="history-subject">{item.subject}</div>
                      <div className="history-stats">
                        <span>Recipients: {total}</span>
                        <span>Delivered: {success}/{total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Details Panel */}
          {selectedItem && (
            <div className="glass-card" style={{ animation: 'slideUp 0.3s ease-out' }}>
              <div className="details-panel">
                <div className="details-header flex justify-between items-center">
                  <h3>Mail Dispatch Details</h3>
                  <div className="flex gap-2">
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-error)', color: 'var(--color-error)' }} 
                      onClick={(e) => handleDeleteEmail(selectedItem._id, e)}
                    >
                      Delete Record
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} 
                      onClick={() => setSelectedItem(null)}
                    >
                      Close Panel
                    </button>
                  </div>
                </div>

                {selectedItem.etherealUrl && (
                  <div className="ethereal-banner">
                    <div><strong>📧 Dynamic Test Server Link</strong></div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      This was dispatched using Ethereal sandbox SMTP. Open the preview to view the email render online:
                    </p>
                    <a href={selectedItem.etherealUrl} target="_blank" rel="noreferrer" className="ethereal-link">
                      View Mailbox Preview &rarr;
                    </a>
                  </div>
                )}

                <div className="details-row">
                  <span className="details-label">Subject</span>
                  <div className="details-value" style={{ fontWeight: 600 }}>{selectedItem.subject}</div>
                </div>

                <div className="details-row">
                  <span className="details-label">Recipients ({selectedItem.recipients.length})</span>
                  <div className="details-recipients-box">
                    {selectedItem.recipients.join(', ')}
                  </div>
                </div>

                <div className="details-row">
                  <span className="details-label">Status Summary</span>
                  <div className="details-value">
                    Success count: <strong>{selectedItem.successCount}</strong> | 
                    Failure count: <strong>{selectedItem.failureCount}</strong>
                    {selectedItem.errorMessage && (
                      <p style={{ color: 'var(--color-error)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
                        Error: {selectedItem.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="details-row">
                  <span className="details-label">Body Content</span>
                  <div className="details-body-box">{selectedItem.body}</div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => removeToast(t.id)}>&times;</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
