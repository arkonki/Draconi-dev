import { ContactLine, LegalLayout } from '../components/auth/LegalLayout';
import { useLegalContact } from '../components/auth/useLegalContact';

export function Terms() {
  const legal = useLegalContact();
  const contact = <ContactLine legal={legal} />;
  return (
    <LegalLayout title="Terms of use" updated={legal?.termsVersion}>
      <p>By creating an account or using this site you agree to these terms. The site is run by {contact}.</p>

      <h2>The service</h2>
      <p>The site helps you keep Dragonbane characters, run campaigns and share maps and notes with your group. It is provided free of charge and &ldquo;as is&rdquo;, without a promise that it will always be available or error-free. Features may change or be removed.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give a real email address you can read; it is used to confirm your account and reset your password.</li>
        <li>Keep your password to yourself and tell the operator if you think someone else has used your account.</li>
        <li>One person, one account. You are responsible for what happens under your account.</li>
      </ul>

      <h2>Your content</h2>
      <p>You keep the rights to what you create and upload. You allow the site to store it, show it to the people you share it with, and back it up, so the service can work. Only upload content you have the right to use, such as your own artwork or images you are allowed to share.</p>

      <h2>Acceptable use</h2>
      <p>Do not use the site to:</p>
      <ul>
        <li>harass, threaten or discriminate against others, or share content that is illegal or sexually exploits minors;</li>
        <li>upload malware, or try to break into the site, other accounts, or to overload it;</li>
        <li>create accounts automatically or in bulk, or use more storage than you are allowed;</li>
        <li>infringe someone else&apos;s copyright or privacy.</li>
      </ul>

      <h2>Storage limits</h2>
      <p>Each account has a storage allowance for uploaded images. The operator may change limits to keep the service running.</p>

      <h2>Removal and suspension</h2>
      <p>The operator may remove content or suspend or delete an account that breaks these terms or puts the site at risk. You can delete your own account at any time under <em>Settings &rarr; Profile</em>.</p>

      <h2>Game material</h2>
      <p>This is an unofficial fan project. Dragonbane and its rules and artwork belong to their respective owners. This site is not endorsed by them, and you are responsible for using game material in line with its publishers&apos; terms.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, the operator is not liable for lost data or other damage from using the site. Keep your own copy of anything important; you can download your data from your profile.</p>

      <h2>Changes and contact</h2>
      <p>These terms may change; the version shown above says which text you agreed to. Questions or complaints: {contact}.</p>
    </LegalLayout>
  );
}
