import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LegalContact } from './useLegalContact';

export function ContactLine({ legal }: { legal: LegalContact | null }) {
  const operator = legal?.operator || 'the operator of this site';
  return legal?.contactEmail
    ? <>{operator} ({<a className="text-blue-600 underline" href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>})</>
    : <>{operator}</>;
}

export function LegalLayout({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <main className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-sm md:p-10">
        <p className="mb-4 text-sm"><Link to="/login" className="font-medium text-blue-600 hover:underline">← Back to sign in</Link></p>
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {updated && <p className="mt-1 text-sm text-gray-500">Version {updated}</p>}
        <div className="mt-6 space-y-5 text-sm leading-relaxed text-gray-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-gray-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          {children}
        </div>
        <p className="mt-10 border-t pt-4 text-xs text-gray-500">
          <Link to="/terms" className="hover:underline">Terms of use</Link> · <Link to="/privacy" className="hover:underline">Privacy policy</Link>
        </p>
      </main>
    </div>
  );
}
