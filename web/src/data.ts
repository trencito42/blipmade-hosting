export const CATEGORIES = ['All', 'Web & CMS', 'Developer Tools', 'Monitoring', 'Automation', 'Bots', 'Databases'] as const;
export type Category = (typeof CATEGORIES)[number];

export const FAQ = [
  ['What am I billed for?', 'The memory, CPU and storage you configure for each app or database, billed monthly. No setup fees.'],
  ['How do upgrades work?', 'Change the resources from the dashboard whenever you need more. No new server to buy and nothing to migrate.'],
  ['What is included?', 'Access to files, logs, domains and usage for every instance.'],
  ['How do I cancel?', 'From the billing page in your dashboard. Your service runs until the end of the paid period.'],
  ['How do I get support?', 'Open a ticket from the dashboard. Response times will be published before launch.'],
] as const;
