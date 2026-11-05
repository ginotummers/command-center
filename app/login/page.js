import { sendLink } from './actions';

export const metadata = { title: 'Sign in · Personal Operating Center' };

export default async function Login({ searchParams }) {
  const sp = await searchParams;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '12vh' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <p className="overline">Personal Operating Center</p>
        <h1 style={{ fontSize: 34, margin: '8px 0 6px' }}>Welcome back</h1>
        <p className="muted" style={{ margin: '0 0 20px' }}>We'll email you a sign-in link.</p>
        {sp?.sent ? (
          <p className="hint">Check your inbox for the sign-in link. You can close this tab.</p>
        ) : (
          <form action={sendLink} className="stack">
            <label>Email<input type="email" name="email" required autoComplete="email" /></label>
            <button className="btn" type="submit">Send sign-in link</button>
          </form>
        )}
        {sp?.error && <p className="neg" style={{ marginTop: 14 }}>{sp.error}</p>}
      </div>
    </div>
  );
}
