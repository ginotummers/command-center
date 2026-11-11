import { Manrope, Inter, Caveat, Kalam, Patrick_Hand, Architects_Daughter } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';
import { createClient } from '@/lib/supabase';
import { signOut } from './actions';

const manrope = Manrope({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
// Handwritten fonts for the Vision Board title (chosen on the board)
const caveat = Caveat({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-hw-caveat', preload: false });
const kalam = Kalam({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-hw-kalam', preload: false });
const patrick = Patrick_Hand({ subsets: ['latin'], weight: '400', variable: '--font-hw-patrick', preload: false });
const architects = Architects_Daughter({ subsets: ['latin'], weight: '400', variable: '--font-hw-architects', preload: false });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });

export const metadata = { title: 'Personal Operating Center', description: 'How life is going, at a glance.' };
export const viewport = { themeColor: '#000310' };

export default async function RootLayout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable} ${caveat.variable} ${kalam.variable} ${patrick.variable} ${architects.variable}`}>
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
