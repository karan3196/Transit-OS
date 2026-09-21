'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS: { label: string; links: { href: string; text: string }[] }[] = [
  {
    label: 'Run the desk',
    links: [
      { href: '/dashboard', text: 'Dashboard' },
      { href: '/inbox', text: 'Inbox' },
      { href: '/bookings', text: 'Bookings' },
      { href: '/customers', text: 'Customers' },
    ],
  },
  {
    label: 'Configure',
    links: [
      { href: '/agents', text: 'Agents' },
      { href: '/knowledge', text: 'Knowledge' },
      { href: '/playground', text: 'Playground' },
    ],
  },
  {
    label: 'Account',
    links: [
      { href: '/usage', text: 'Usage & cost' },
      { href: '/settings', text: 'Settings' },
    ],
  },
];

export function Nav({ needsHuman }: { needsHuman: number }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar">
      <Link href="/" className="brandmark">
        <span className="glyph" aria-hidden>
          क
        </span>
        <span className="stack">
          <span className="wordmark">Karyalaya</span>
          <span className="sub">Agent portal</span>
        </span>
      </Link>

      {SECTIONS.map((section) => (
        <div className="navgroup" key={section.label}>
          <span className="label">{section.label}</span>
          {section.links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="navlink"
                aria-current={active ? 'page' : undefined}
              >
                <span>{link.text}</span>
                {link.href === '/inbox' && needsHuman > 0 ? (
                  <span className="pill red">{needsHuman}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
