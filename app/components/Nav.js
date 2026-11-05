'use client';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['/', 'Home'],
  ['/goals', 'Goals'],
  ['/money', 'Money'],
  ['/reflections', 'Reflections'],
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Sections">
      {ITEMS.map(([href, label]) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <a key={href} href={href} className={`pill${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>{label}</a>
        );
      })}
    </nav>
  );
}
