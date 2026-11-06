# 10 — Email, DNS, Cloudflare

## Mail sales

`MAIL_SALES_ENABLED=true`. Three EMAIL_HOSTING products DEPLOYABLE, prices 299/599/1199 EUR cents. Gate is the flag only (BM-018). K-19 said coming-soon; production sells.

Mailcow VM104. Docker.sock denied for audit SSH user — container health UNVERIFIED. Ports DNATed on `.20` (25/465/587/993/4190/80/443).

No Blipmade off-site unit (BM-021). RAID 0. Paid mailbox RPO unbounded.

## DNS (public, no zone login)

- Apex A/AAAA Cloudflare anycast. Origin not in public A.
- `MX 10 mail.blipmade.com.`
- SPF: `v=spf1 mx a ip4:193.34.214.20 ~all` (soft fail).
- DMARC quarantine reported in later pass; DKIM selector not dumped here. IMAP login not tested.

## Cloudflare in app

Zone/token code exists; tokens would be v1-sealed with `SESSION_SECRET` (BM-003). Live zone not read. `GAME_CONNECT_ENABLED` UNSET — Smart Connect not a launch item.

## Product

Hosted mail at €2.99 without backup or quota proof is the weakest SKU. Turn `MAIL_SALES_ENABLED` off until Mailcow off-site matches VPS agent.
