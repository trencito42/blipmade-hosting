/**
 * Customer App visual evidence collector. Staging / fake customer data only.
 * Opt-in via BM_APP_AUDIT=1, BM_APP_AUDIT_STORAGE_STATE and E2E_BASE_URL.
 * Set BM_APP_AUDIT_IDS to JSON keys instance, vps, mailDomain, invoice, ticket,
 * productSlug. Missing fixtures are skipped, not passed.
 * Never run with real customers/production; screenshots can contain private data.
 */
import { test, expect } from '@playwright/test';
const audit = process.env.BM_APP_AUDIT === '1';
const storage = process.env.BM_APP_AUDIT_STORAGE_STATE;
let ids: Record<string,string> = {};
try { ids = JSON.parse(process.env.BM_APP_AUDIT_IDS || '{}') as Record<string,string>; } catch { ids = {}; }

const routes = [
  { path:'/app' }, { path:'/app/instances' },
  { path:'/app/instances/:id', fixture:'instance' },
  { path:'/app/instances/:id/:tab', fixture:'instance' },
  { path:'/app/deploy' }, { path:'/app/deploy/:slug', fixture:'productSlug' },
  { path:'/app/domains' }, { path:'/app/mail' },
  { path:'/app/mail/domains/:id', fixture:'mailDomain' },
  { path:'/app/servers', canonical:'/app/vps' },
  { path:'/app/servers/:id', fixture:'vps', canonical:'/app/vps/' },
  { path:'/app/vps' }, { path:'/app/vps/new' },
  { path:'/app/vps/:id', fixture:'vps' },
  { path:'/app/email/checkout' },
  { path:'/app/billing/invoices/:id', fixture:'invoice' },
  { path:'/app/billing' }, { path:'/app/tickets' },
  { path:'/app/tickets/:id', fixture:'ticket' },
  { path:'/app/settings' }, { path:'/app/notifications' },
] as const;
const widths=[320,390,768,1024,1440,1920];

test.describe('21-route customer app read-only visual evidence',()=>{
  test.skip(!audit || !storage,'Requires explicit staged BM_APP_AUDIT=1 and storage state');
  if(storage) test.use({storageState:storage});
  test.setTimeout(90000);
  for(const entry of routes){
    for(const width of widths){
      test(entry.path+' @ '+width+'px',async({page},info)=>{
        const id=('fixture' in entry) ? ids[entry.fixture] : undefined;
        test.skip('fixture' in entry && !id,'Missing seed for '+(('fixture' in entry)?entry.fixture:''));
        const path=entry.path.replace(':id',encodeURIComponent(id??''))
          .replace(':slug',encodeURIComponent(id??'')).replace(':tab','overview');
        const errors:{path:string,status:number}[]=[];
        page.on('response',(resp)=>{
          if(resp.url().includes('/api/') && resp.status()>=400 && errors.length<30)
            errors.push({path:new URL(resp.url()).pathname,status:resp.status()});
        });
        await page.setViewportSize({width,height:900});
        const response=await page.goto(path,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>undefined);
        const data=await page.evaluate(()=>{
          const root=document.documentElement;
          return {
            title:document.title,
            headings:[...document.querySelectorAll('h1,h2')].map(el=>el.textContent?.trim()).filter(Boolean).slice(0,16),
            viewportHeight:window.innerHeight,
            bodyHeight:document.body.scrollHeight,
            horizontalOverflowPx:Math.max(0,root.scrollWidth-root.clientWidth),
            buttons:document.querySelectorAll('button').length,
            inputCount:document.querySelectorAll('input,textarea,select').length
          };
        });
        await info.attach('audit.json',{body:JSON.stringify({path,width,finalURL:page.url(),status:response?.status(),apiErrors:errors,...data},null,2),contentType:'application/json'});
        await page.screenshot({path:info.outputPath('page.png'),fullPage:true,animations:'disabled'});
        expect(response?.status()??0).toBeLessThan(400);
        const target=('canonical' in entry) ? entry.canonical : '/app';
        expect(new URL(page.url()).pathname.startsWith(target),'Incorrect /app destination').toBe(true);
        expect(data.horizontalOverflowPx,'Page-wide horizontal overflow').toBeLessThanOrEqual(8);
      });
    }
  }
});
