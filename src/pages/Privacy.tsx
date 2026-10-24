import { ContactLine, LegalLayout } from '../components/auth/LegalLayout';
import { useLegalContact } from '../components/auth/useLegalContact';

export function Privacy() {
  const legal = useLegalContact();
  const contact = <ContactLine legal={legal} />;
  return (
    <LegalLayout title="Privacy policy" updated={legal?.termsVersion}>
      <p>
        This site is a character manager and virtual table for the Dragonbane tabletop game. It is run by {contact}, who decides
        what is done with your data (the &ldquo;operator&rdquo;). This page explains what is stored and why.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Account:</strong> your email address, username, an optional first and last name, avatar link and bio, and your password as a salted hash (the password itself is never kept).</li>
        <li><strong>Your game content:</strong> characters, notes, campaign membership, chat messages, maps and images you upload, and what you do in campaigns you join.</li>
        <li><strong>Technical data:</strong> a sign-in session (a random token with an expiry), when you last signed in, and server logs that record requests and errors, which can include your network address.</li>
        <li><strong>Consent:</strong> when you registered and which version of the terms you agreed to.</li>
      </ul>

      <h2>Why, and on what basis</h2>
      <p>We use this data to give you an account and run the service you asked for (contract), to keep the site secure and working, such as limiting repeated sign-in attempts and fixing errors (legitimate interest), and to send the emails described below.</p>

      <h2>Emails</h2>
      <p>The site sends only service emails: confirming a new account or a new email address, and password-reset links. They go through the operator&apos;s email provider. There is no advertising and no newsletter.</p>

      <h2>Cookies and similar storage</h2>
      <p>The site does not use advertising or tracking cookies and has no analytics. It keeps your sign-in session and a few display preferences in your browser&apos;s local storage, which is necessary for the site to work. Fonts and some artwork are loaded from third-party servers (Google Fonts and GitHub), which can see your network address when your browser fetches them.</p>

      <h2>Built-in AI features</h2>
      <p>Optional AI features (the story helper and solo narrator) work only if you add your own OpenRouter key. When you use them, the text needed for the request is sent to OpenRouter and the model provider you chose, under their terms. Your key is stored encrypted and is used only for your requests.</p>

      <h2>Who can see your content</h2>
      <p>Other members of a campaign can see what the campaign shares with them (for example characters, notes and messages in that campaign). Administrators of this site can see accounts and, to run and repair the service, the data it stores. Images you upload are served from public addresses: anyone who has the address can open the image.</p>

      <h2>How long we keep it</h2>
      <p>Your data is kept while your account exists. When you delete your account, your profile, characters, notes, messages and uploaded images are deleted. Backups made before the deletion are overwritten as old backups expire, usually within about a week. Server logs are kept for a short time for security and troubleshooting.</p>

      <h2>Your rights</h2>
      <p>
        You can download a copy of your data and delete your account yourself under <em>Settings &rarr; Profile</em>. You can also
        ask {contact} to correct, restrict or erase your data, or to object to its use. If you are in the EU/EEA you may complain to
        your data protection authority (in Estonia, the Andmekaitse Inspektsioon).
      </p>

      <h2>Where data is stored and security</h2>
      <p>Data is stored on the operator&apos;s server and in its backups. Passwords are hashed, sign-in attempts are rate limited, and connections use HTTPS. No system is perfectly secure; tell the operator at once if you suspect a problem.</p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, the version shown above changes and you will be asked to agree again where the law requires it.</p>
    </LegalLayout>
  );
}
