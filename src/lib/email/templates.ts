import { User } from '@supabase/supabase-js';

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export function getWelcomeEmail(user: User): EmailTemplate {
  return {
    subject: 'Welcome to DragonBane Character Manager',
    text: `Welcome to DragonBane Character Manager!\n\nThank you for joining us. You can now create and manage your characters, join parties, and keep track of your adventures.\n\nEnjoy your journey!`,
    html: `
      <h1>Welcome to DragonBane Character Manager!</h1>
      <p>Thank you for joining us. You can now:</p>
      <ul>
        <li>Create and manage your characters</li>
        <li>Join adventure parties</li>
        <li>Keep track of your adventures</li>
      </ul>
      <p>Enjoy your journey!</p>
    `
  };
}

export function getPartyInviteEmail(inviterName: string, partyName: string, acceptUrl: string): EmailTemplate {
  return {
    subject: `You've been invited to join ${partyName}`,
    text: `${inviterName} has invited you to join their party "${partyName}".\n\nClick here to accept: ${acceptUrl}`,
    html: `
      <h1>Party Invitation</h1>
      <p><strong>${inviterName}</strong> has invited you to join their party "<strong>${partyName}</strong>".</p>
      <p>
        <a href="${acceptUrl}" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Accept Invitation
        </a>
      </p>
    `
  };
}

export function getGameSessionEmail(partyName: string, date: string, time: string, notes?: string): EmailTemplate {
  return {
    subject: `Game Session Scheduled - ${partyName}`,
    text: `A new game session has been scheduled for ${partyName}.\n\nDate: ${date}\nTime: ${time}\n${notes ? `\nNotes: ${notes}` : ''}`,
    html: `
      <h1>Game Session Scheduled</h1>
      <h2>${partyName}</h2>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
    `
  };
}

export function getCharacterLevelUpEmail(characterName: string, newLevel: number): EmailTemplate {
  return {
    subject: `${characterName} has leveled up!`,
    text: `Congratulations! Your character ${characterName} has reached level ${newLevel}!`,
    html: `
      <h1>Level Up!</h1>
      <p>Congratulations! Your character <strong>${characterName}</strong> has reached level <strong>${newLevel}</strong>!</p>
      <p>Log in to update your character sheet and select new abilities.</p>
    `
  };
}
