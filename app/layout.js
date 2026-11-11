import { Manrope, Inter, Permanent_Marker } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';
import { createClient } from '@/lib/supabase';
import { signOut } from './actions';

const manrope = Manrope({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-marker' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });

export const metadata = { title: 'Personal Operating Center', description: 'How life is going, at a glance.' };
export const viewport = { themeColor: '#000310' };

export default async function RootLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable} ${marker.variable}`}>
      <body>
        <div className="shell">
          {user && (
            <div className="topbar">
              <a href="/" className="brand">Personal Operating <span>Center</span></a>
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
