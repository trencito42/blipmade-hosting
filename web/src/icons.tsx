const P = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowUR: 'M7 17 17 7M8 7h9v9',
  check: 'm5 12 5 5 9-10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  eye: 'M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  eyeOff: 'M3 3l18 18M10.6 5.3A9.6 9.6 0 0 1 12 5.25c6 0 9.75 6.75 9.75 6.75a17 17 0 0 1-3.1 3.9M6.4 6.5C3.8 8.3 2.25 12 2.25 12S6 18.75 12 18.75c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3ZM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  term: 'M4 5h16v14H4zM8 10l3 2-3 2M13 15h3',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  card: 'M3 6h18v12H3zM3 10h18',
  rocket: 'M5 15c-1.5 1-2 4-2 6 2 0 5-.5 6-2M14 4c3-1 6-1 7 0 1 1 1 4 0 7l-6 6-5-5 4-8ZM9 14l-3-3 3-1',
  shield: 'M12 3 4 6v6c0 4.5 3.3 8 8 9 4.7-1 8-4.5 8-9V6l-8-3Z',
  restart: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
  box: 'M12 3 3 7.5v9L12 21l9-4.5v-9L12 3ZM3 7.5l9 4.5 9-4.5M12 12v9',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  bot: 'M5 9h14v10H5zM12 5v4M9 14h.01M15 14h.01',
  mon: 'M3 12h4l3-7 4 14 3-7h4',
  flow: 'M5 5h5v5H5zM14 14h5v5h-5zM10 7.5h3a2 2 0 0 1 2 2V14',
  code: 'm8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
} as const;
export type IconName = keyof typeof P;
export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={P[name]} />
    </svg>
  );
}
