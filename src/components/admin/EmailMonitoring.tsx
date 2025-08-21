import React, { useState, useEffect } from 'react';
import { Mail, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface EmailStats {
  totalSent: number;
  failedCount: number;
  averageDeliveryTime: number;
  userEmailsRemaining: number;
  globalEmailsRemaining: number;
}

interface EmailLog {
  id: string;
  timestamp: string;
  message: string;
}

export function EmailMonitoring() {
  const { user } = useAuth();
  const [stats, setStats] = useState<EmailStats>({
    totalSent: 0,
    failedCount: 0,
    averageDeliveryTime: 0,
    userEmailsRemaining: 5,
    globalEmailsRemaining: 100
  });
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadEmailStats();
    }
  }, [user]);

  async function loadEmailStats() {
    try {
      setLoading(true);
      // Simulate API call for stats and logs:
      // Replace the following with your API fetch logic.
      const fetchedStats: EmailStats = {
        totalSent: 150,
        failedCount: 3,
        averageDeliveryTime: 245,
        userEmailsRemaining: 3,
        globalEmailsRemaining: 85
      };

      const fetchedLogs: EmailLog[] = [
        { id: '1', timestamp: '2025-03-07 12:34:56', message: 'Sent email to user@example.com' },
        { id: '2', timestamp: '2025-03-07 12:35:10', message: 'Failed to send email to user2@example.com' },
        { id: '3', timestamp: '2025-03-07 12:36:02', message: 'Sent email to user3@example.com' }
      ];

      setStats(fetchedStats);
      setLogs(fetchedLogs);
    } catch (error) {
      console.error('Failed to load email stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Emails Sent */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Sent</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalSent}</p>
            </div>
            <Mail className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        {/* Failed Emails */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Failed</p>
              <p className="text-2xl font-semibold text-red-600">{stats.failedCount}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Success Rate</p>
              <p className="text-2xl font-semibold text-green-600">
                {stats.totalSent > 0
                  ? (((stats.totalSent - stats.failedCount) / stats.totalSent) * 100).toFixed(1)
                  : 'N/A'}%
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

        {/* Average Delivery Time */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg. Delivery Time</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.averageDeliveryTime}ms</p>
            </div>
            <Clock className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Rate Limits */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Rate Limits</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">User Emails Remaining</span>
              <span className="text-sm font-medium text-gray-900">{stats.userEmailsRemaining}/5</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${(stats.userEmailsRemaining / 5) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Global Emails Remaining</span>
              <span className="text-sm font-medium text-gray-900">{stats.globalEmailsRemaining}/100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full"
                style={{ width: `${(stats.globalEmailsRemaining / 100) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Email Logs */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Email Logs</h3>
        {logs.length > 0 ? (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li key={log.id}>
                <p className="text-sm text-gray-700">
                  {log.timestamp} - {log.message}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-700">No logs available.</p>
        )}
      </div>
    </div>
  );
}
