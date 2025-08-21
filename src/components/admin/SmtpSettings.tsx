import React, { useState } from 'react';
import { Save, Beaker, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailTemplates {
  welcome: {
    subject: string;
    body: string;
  };
  passwordReset: {
    subject: string;
    body: string;
  };
}

export function SmtpSettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<SmtpConfig>({
    host: '',
    port: 465,
    secure: true,
    auth: {
      user: '',
      pass: ''
    }
  });
  const [testEmail, setTestEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // New state for email template customization
  const [templates, setTemplates] = useState<EmailTemplates>({
    welcome: {
      subject: 'Welcome to our service!',
      body: 'Dear user, thank you for joining our platform. We are excited to have you on board!'
    },
    passwordReset: {
      subject: 'Password Reset Request',
      body: 'Click the link below to reset your password. If you did not request a password reset, please ignore this email.'
    }
  });

  async function handleSave() {
    try {
      // In a real application, this would call your backend API with both SMTP settings and email templates
      setStatus('success');
      setMessage('SMTP settings and email templates saved successfully');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to save settings');
    }
  }

  async function handleTest() {
    if (!testEmail) {
      setStatus('error');
      setMessage('Please enter a test email address');
      return;
    }

    try {
      setStatus('testing');
      // In a real application, this would call your backend API
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      setStatus('success');
      setMessage('Test email sent successfully');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Failed to send test email');
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {status !== 'idle' && (
        <div
          className={`p-4 rounded-lg ${
            status === 'success'
              ? 'bg-green-50 text-green-700'
              : status === 'error'
              ? 'bg-red-50 text-red-700'
              : 'bg-blue-50 text-blue-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <p>{message}</p>
          </div>
        </div>
      )}

      {/* SMTP Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
          <input
            type="text"
            value={config.host}
            onChange={(e) => setConfig({ ...config, host: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
          <input
            type="number"
            value={config.port}
            onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value, 10) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input
            type="text"
            value={config.auth.user}
            onChange={(e) =>
              setConfig({
                ...config,
                auth: { ...config.auth, user: e.target.value }
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={config.auth.pass}
            onChange={(e) =>
              setConfig({
                ...config,
                auth: { ...config.auth, pass: e.target.value }
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Test Email Section */}
      <div className="border-t pt-6 mt-6">
        <h3 className="text-lg font-medium mb-4">Test Configuration</h3>
        <div className="flex gap-4">
          <input
            type="email"
            placeholder="Enter test email address"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleTest}
            disabled={status === 'testing'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Beaker className="w-5 h-5" />
            {status === 'testing' ? 'Sending...' : 'Send Test'}
          </button>
        </div>
      </div>

      {/* Email Customization Section */}
      <div className="border-t pt-6 mt-6 space-y-6">
        <h3 className="text-lg font-medium mb-4">Customize Emails</h3>
        
        {/* Welcome Email Customization */}
        <div>
          <h4 className="text-md font-semibold mb-2">Welcome Email</h4>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={templates.welcome.subject}
              onChange={(e) =>
                setTemplates({
                  ...templates,
                  welcome: { ...templates.welcome, subject: e.target.value }
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              value={templates.welcome.body}
              onChange={(e) =>
                setTemplates({
                  ...templates,
                  welcome: { ...templates.welcome, body: e.target.value }
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
            />
          </div>
        </div>

        {/* Password Reset Email Customization */}
        <div>
          <h4 className="text-md font-semibold mb-2">Password Reset Email</h4>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={templates.passwordReset.subject}
              onChange={(e) =>
                setTemplates({
                  ...templates,
                  passwordReset: { ...templates.passwordReset, subject: e.target.value }
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea
              value={templates.passwordReset.body}
              onChange={(e) =>
                setTemplates({
                  ...templates,
                  passwordReset: { ...templates.passwordReset, body: e.target.value }
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Save className="w-5 h-5" />
          Save Settings
        </button>
      </div>
    </div>
  );
}
