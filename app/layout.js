import { Manrope, Inter } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';
import { createClient } from '@/lib/supabase';
import { signOut } from './actions';

const manrope = Manrope({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });

export const metadata = { title: 'Command Center', description: 'How life is going, at a glance.' };
export const viewport = { themeColor: '#000310' };

export default async function RootLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable}`}>
      <body>
        <div className="shell">
          {user && (
            <div className="topbar">
              <a href="/" className="brand">Command<span>Center</span></a>
              <Nav />
              <form action={signOut}><button className="linkbtn" type="submit">Sign out</button></form>
            </div>
          )}
          {children}
        </div>
      </body>
    </html>
  );
}
