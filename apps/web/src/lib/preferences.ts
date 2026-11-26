const PERSON_KEY = 'dc.companion.personId';
const SHOW_CHAT_KEY = 'dc.companion.showChat';

export interface CompanionPreferences {
  personId: string | null;
  showChat: boolean;
}

export function readPreferences(): CompanionPreferences {
  if (typeof window === 'undefined') return { personId: null, showChat: false };
  try {
    return {
      personId: window.localStorage.getItem(PERSON_KEY),
      // Default off: the first screen stays minimal until Settings enables chat.
      showChat: window.localStorage.getItem(SHOW_CHAT_KEY) === 'true',
    };
  } catch {
    return { personId: null, showChat: false };
  }
}

export function savePreferences(personId: string, showChat: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PERSON_KEY, personId);
    window.localStorage.setItem(SHOW_CHAT_KEY, String(showChat));
  } catch {
    // Private browsing / blocked storage should not break the companion.
  }
}
