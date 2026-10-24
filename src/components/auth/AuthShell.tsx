import React from 'react';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** Page frame for the public account pages: logo, heading and a centered column. */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <img src="/dragonbane-icon.png" alt="DragonBane Logo" className="mx-auto mb-6 h-40 w-auto drop-shadow-2xl" />
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-gray-600">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthNotice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const styles = tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md p-4 text-sm ${styles}`}>{children}</div>;
}

export const authInputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
