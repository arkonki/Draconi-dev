import { useEffect, useState } from 'react';
import { accountApi } from '../../lib/supabase';

export interface LegalContact {
  operator: string;
  contactEmail: string;
  termsVersion: string;
}

/** Who runs this installation and how to reach them, as set by the administrator in the server's environment. */
export function useLegalContact(): LegalContact | null {
  const [legal, setLegal] = useState<LegalContact | null>(null);
  useEffect(() => {
    let active = true;
    accountApi.config().then(({ data }) => { if (active) setLegal(data?.legal ?? { operator: '', contactEmail: '', termsVersion: '' }); });
    return () => { active = false; };
  }, []);
  return legal;
}
