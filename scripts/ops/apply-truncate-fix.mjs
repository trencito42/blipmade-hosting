import { readFileSync, writeFileSync } from 'node:fs';

/**
 * One round of the fix for the text that is cut with an ellipsis.
 *
 * A text that is cut asks for the width of the whole phrase when the width of
 * the page is measured. A line that holds such a text asks for that width
 * too, and the card, the column and the page become wider than the phone.
 *
 * The line is given a width of zero and the room that is left (`flex-1`), so
 * the text is cut inside the card and the measurement of the page never sees
 * the length of the phrase.
 *
 * Every replacement has to happen exactly once, so a line that moved or a
 * text that was written twice is not quietly missed.
 */

const changes = [
  // The customer area ------------------------------------------------------
  [
    'web/src/app/Billing.tsx',
    '<div className="min-w-[10rem] flex-1">',
    '<div className="w-0 min-w-[10rem] flex-1">',
  ],
  [
    'web/src/app/Billing.tsx',
    `<div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[14px] font-bold text-ink" title={invoice.number}>`,
    `<div className="flex items-start justify-between gap-3">
                    <div className="w-0 min-w-0 flex-1">
                      <p className="truncate font-mono text-[14px] font-bold text-ink" title={invoice.number}>`,
  ],
  [
    'web/src/app/Instances.tsx',
    `<div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[28%] bg-s3 text-acc">
                  <Icon name={productIcon(product.icon)} size={20} />
                </span>
                <div className="min-w-0">`,
    `<div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-[28%] bg-s3 text-acc">
                  <Icon name={productIcon(product.icon)} size={20} />
                </span>
                <div className="w-0 min-w-0 flex-1">`,
  ],
  [
    'web/src/app/Instances.tsx',
    'className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"',
    'className="w-0 min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"',
  ],
  [
    'web/src/app/Overview.tsx',
    '<span className="min-w-0 flex-1">',
    '<span className="w-0 min-w-0 flex-1">',
  ],
  [
    'web/src/app/Overview.tsx',
    `<div className="flex min-w-0 flex-1 items-start gap-3">
                  <ProductIcon icon={instance.product.icon} />
                  <div className="min-w-0 flex-1">`,
    `<div className="flex min-w-0 flex-1 items-start gap-3">
                  <ProductIcon icon={instance.product.icon} />
                  <div className="w-0 min-w-0 flex-1">`,
  ],
  [
    'web/src/app/Domains.tsx',
    '<div className="min-w-0 flex-1">',
    '<div className="w-0 min-w-0 flex-1">',
  ],
  [
    'web/src/app/DeployCatalog.tsx',
    '<div className="min-w-0 flex-1">',
    '<div className="w-0 min-w-0 flex-1">',
  ],
  [
    'web/src/app/InstanceDetail.tsx',
    `<div className="flex min-w-0 flex-1 items-start gap-3">
            <ProductIcon icon={instance.product.icon} size={46} />
            <div className="min-w-0 flex-1">`,
    `<div className="flex min-w-0 flex-1 items-start gap-3">
            <ProductIcon icon={instance.product.icon} size={46} />
            <div className="w-0 min-w-0 flex-1">`,
  ],
  [
    'web/src/app/InstanceDetail.tsx',
    '<span aria-current="page" className="min-w-0 truncate font-bold text-ink" title={instance.name}>',
    '<span aria-current="page" className="w-0 min-w-0 flex-1 truncate font-bold text-ink" title={instance.name}>',
  ],
  [
    'web/src/app/InstanceDetail.tsx',
    `<span className="min-w-0 truncate font-mono text-[13px] text-ink" title={record.name}>`,
    `<span className="w-0 min-w-0 flex-1 truncate font-mono text-[13px] text-ink" title={record.name}>`,
  ],
  [
    'web/src/app/InstanceDetail.tsx',
    `<span className="min-w-0 truncate font-mono text-[13px] text-ink2" title={record.value}>`,
    `<span className="w-0 min-w-0 flex-1 truncate font-mono text-[13px] text-ink2" title={record.value}>`,
  ],
  [
    'web/src/app/Deploy.tsx',
    '<dd className="min-w-0 truncate text-right text-[14.5px] font-bold text-ink">{children}</dd>',
    '<dd className="w-0 min-w-0 flex-1 truncate text-right text-[14.5px] font-bold text-ink">{children}</dd>',
  ],
  [
    'web/src/pages/Status.tsx',
    '<span className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={component.name}>',
    '<span className="w-0 min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={component.name}>',
  ],
  [
    'web/src/home/Catalog.tsx',
    '<div className="min-w-0"><h3 className="truncate text-[18px]',
    '<div className="w-0 min-w-0 flex-1"><h3 className="truncate text-[18px]',
  ],

  // The staff area ----------------------------------------------------------
  [
    'web/src/admin/Tickets.tsx',
    `<div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14.5px] font-bold tracking-[-0.02em] text-ink" title={\`#\${ticket.number} \${ticket.subject}\`}>`,
    `<div className="flex items-start justify-between gap-3">
                        <div className="w-0 min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-bold tracking-[-0.02em] text-ink" title={\`#\${ticket.number} \${ticket.subject}\`}>`,
  ],
  [
    'web/src/admin/Orders.tsx',
    `<div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[13.5px] font-bold text-ink" title={order.number}>`,
    `<div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate font-mono text-[13.5px] font-bold text-ink" title={order.number}>`,
  ],
  [
    'web/src/admin/Staff.tsx',
    `<div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={member.name ?? 'No name'}>`,
    `<div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={member.name ?? 'No name'}>`,
  ],
  [
    'web/src/admin/Staff.tsx',
    `<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">`,
    `<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="w-0 min-w-0 flex-1">`,
  ],
  [
    'web/src/admin/Products.tsx',
    `<div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={product.name}>`,
    `<div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={product.name}>`,
  ],
  [
    'web/src/admin/Customers.tsx',
    `<div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink"`,
    `<div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p
                          className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink"`,
  ],
  [
    'web/src/admin/Services.tsx',
    `<div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={service.name}>`,
    `<div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={service.name}>`,
  ],
  [
    'web/src/admin/Promotions.tsx',
    `<div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[14px] font-bold text-ink" title={promotion.code}>`,
    `<div className="flex items-start justify-between gap-3">
                      <div className="w-0 min-w-0 flex-1">
                        <p className="truncate font-mono text-[14px] font-bold text-ink" title={promotion.code}>`,
  ],
  [
    'web/src/admin/Pricing.tsx',
    `<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">`,
    `<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="w-0 min-w-0 flex-1">`,
  ],
];

let failed = 0;
for (const [file, from, to] of changes) {
  const before = readFileSync(file, 'utf8');
  const count = before.split(from).length - 1;
  if (count !== 1) {
    console.error(`SKIP ${file}: found ${count} times -> ${from.slice(0, 70)}`);
    failed += 1;
    continue;
  }
  writeFileSync(file, before.replace(from, to));
  console.log(`ok   ${file}  ${from.slice(0, 60)}`);
}
console.log(failed ? `\n${failed} replacements did not match exactly once` : '\nall replacements applied');
process.exit(failed ? 1 : 0);
