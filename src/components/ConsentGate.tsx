import { useEffect } from 'react';
import { useArcStore } from '../store/arcStore';
import * as CookieConsent from '@gothassos/vanilla-cookieconsent';
import '@gothassos/vanilla-cookieconsent/dist/cookieconsent.css';
import { useDemoSessionHeartbeat } from '../hooks/useDemoSessionHeartbeat';
import { useSessionStore } from '../store/sessionStore';

const CONSENT_COOKIE_NAME = 'ngram_demo_consent';
const CONSENT_EVENT = 'clarit:cookie-consent';

type ConsentWindow = Window & {
  __claritCookieConsentStarted?: boolean;
};

function envText(name: string, fallback: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function mapProvisionToAvailability(provisionState: string | undefined): 'offline' | 'open' | 'code-required' {
  switch (provisionState) {
    case 'running':
      return 'open';
    case 'provisioning':
    case 'terminating':
      return 'code-required';
    case 'none':
    case 'error':
    default:
      return 'offline';
  }
}


export function ConsentGate() {
  const consented = useArcStore((s) => s.consented);
  const setConsented = useArcStore((s) => s.setConsented);
  const setAvailabilityState = useArcStore((s) => s.setAvailabilityState);
  useDemoSessionHeartbeat(consented);

  const rateLimit = useSessionStore((s) => s.rateLimit);

  // Keep arcStore.availabilityState in sync with the live provision state from the session heartbeat.
  useEffect(() => {
    if (rateLimit) {
      setAvailabilityState(mapProvisionToAvailability(rateLimit.provisionState));
    }
  }, [rateLimit, setAvailabilityState]);

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
      disablePageInteraction: false,
      guiOptions: {
        consentModal: {
          layout: 'bar',
          position: 'bottom',
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
              title: envText('VITE_CONSENT_MODAL_TITLE', 'Cookie consent'),
              description: envText(
                'VITE_CONSENT_MODAL_DESCRIPTION',
                'We use required cookies to keep your session active and protect the service from overload. See our <a href="https://clarit.ai/cookie-policy" rel="noopener" target="_blank">cookie policy</a> and <a href="https://clarit.ai/privacy" rel="noopener" target="_blank">privacy policy</a> for details.',
              ),
              acceptAllBtn: envText('VITE_CONSENT_MODAL_ACCEPT', 'Accept'),
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
  }, [setConsented]);

  return null;
}
