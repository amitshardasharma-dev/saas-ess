import { launch, loginAs } from './helper.mjs'
const { browser, ctx } = await launch()
try {
  const { page } = await loginAs(ctx, 'admin')
  const errs = []
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()) })
  page.on('pageerror', e => errs.push('PAGEERROR: '+e.message))
  await page.goto('https://saas-ess.vercel.app/dashboard/onboarding', { waitUntil:'networkidle', timeout:45000 })
  await page.waitForTimeout(2000)
  console.log('--- errors ---')
  errs.slice(0,6).forEach(e => console.log(e.slice(0,300)))
} finally { await browser.close() }
