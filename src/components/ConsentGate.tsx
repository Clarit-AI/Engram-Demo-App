import { useEffect, useState } from 'react';
import * as CookieConsent from '@gothassos/vanilla-cookieconsent';
import '@gothassos/vanilla-cookieconsent/dist/cookieconsent.css';
import { useDemoSessionHeartbeat } from '../hooks/useDemoSessionHeartbeat';

const CONSENT_COOKIE_NAME = 'ngram_demo_consent';
const CONSENT_EVENT = 'clarit:cookie-consent';

type ConsentWindow = Window & {
  __claritCookieConsentStarted?: boolean;
};

function envText(name: string, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function hasConsentCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((part) => part.trim().startsWith(`${CONSENT_COOKIE_NAME}=`));
}

export function ConsentGate() {
  const [consented, setConsented] = useState(hasConsentCookie);
  useDemoSessionHeartbeat(consented);

  useEffect(() => {
    const markConsented = () => setConsented(true);
    window.addEventListener(CONSENT_EVENT, markConsented);

    const consentWindow = window as ConsentWindow;
    if (consentWindow.__claritCookieConsentStarted) {
      return () => window.removeEventListener(CONSENT_EVENT, markConsented);
    }

    consentWindow.__claritCookieConsentStarted = true;
    const dispatchConsent = () => window.dispatchEvent(new Event(CONSENT_EVENT));

    void CookieConsent.run({
      mode: 'opt-in',
      autoShow: true,
      disablePageInteraction: true,
      guiOptions: {
        consentModal: {
          layout: 'box wide',
          position: 'middle center',
          equalWeightButtons: false,
        },
      },
      cookie: {
        name: CONSENT_COOKIE_NAME,
        sameSite: 'Lax',
        secure: window.location.protocol === 'https:',
        expiresAfterDays: 30,
      },
      categories: {
        necessary: {
          enabled: true,
          readOnly: true,
        },
      },
      language: {
        default: 'en',
        translations: {
          en: {
            consentModal: {
              title: envText('VITE_CONSENT_MODAL_TITLE', 'Ngram demonstration'),
              description: envText(
                'VITE_CONSENT_MODAL_DESCRIPTION',
                'This interactive simulation uses required cookies to keep a short-lived session, track active usage, and protect the live model from overload. By continuing, you acknowledge that the experience may connect to live inference providers and that request volume may be limited while the system is under test.',
              ),
              acceptAllBtn: envText('VITE_CONSENT_MODAL_ACCEPT', 'Start the simulation'),
              footer: envText('VITE_CONSENT_MODAL_FOOTER', ''),
            },
            preferencesModal: {
              title: 'Simulation cookies',
              acceptAllBtn: envText('VITE_CONSENT_MODAL_ACCEPT', 'Start the simulation'),
              savePreferencesBtn: 'Save preferences',
              closeIconLabel: 'Close',
              sections: [
                {
                  title: 'Required session cookie',
                  description:
                    'The live simulation uses a required opaque session cookie for active-session tracking, rate limiting, and overload protection.',
                  linkedCategory: 'necessary',
                },
              ],
            },
          },
        },
      },
      onConsent: () => {
        dispatchConsent();
      },
      onFirstConsent: () => {
        dispatchConsent();
      },
    });

    return () => {
      window.removeEventListener(CONSENT_EVENT, markConsented);
    };
  }, []);

  return null;
}
