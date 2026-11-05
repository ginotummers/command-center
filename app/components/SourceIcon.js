// App icons for "Needs your attention". External apps use their own site icon
// (served by Google's favicon service); dashboard sections use simple line icons.
const DOMAINS = {
  Email: 'mail.google.com',
  Gmail: 'mail.google.com',
  Calendar: 'calendar.google.com',
  Akiflow: 'akiflow.com',
  Zoom: 'zoom.us',
  'Wispr Flow': 'wisprflow.ai',
  Rize: 'rize.io',
};

const LINE = {
  Reflection: <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zm0 13a3 3 0 0 1 3-3h10M9 8h5" />,
  Finance: <path d="M15.5 7.5A5 5 0 1 0 15.5 16.5M6 10.5h7M6 13.5h7" />,
  Goal: <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-4a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />,
  Health: <path d="M3 12h4l2-5 4 10 2-5h6" />,
};

const box = { width: 40, height: 40, flex: '0 0 40px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' };

export default function SourceIcon({ source }) {
  const domain = DOMAINS[source];
  if (domain) {
    return (
      <span style={box} title={source}>
        <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={source} width={22} height={22} style={{ borderRadius: 4 }} />
      </span>
    );
  }
  return (
    <span style={box} title={source} role="img" aria-label={source}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {LINE[source] || <circle cx="12" cy="12" r="4" />}
      </svg>
    </span>
  );
}
