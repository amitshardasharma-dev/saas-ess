import { launch, loginAs, visit, apiGet } from './helper.mjs'

const { browser, ctx } = await launch()
try {
  const { page, loginResult, errors } = await loginAs(ctx, 'admin')
  console.log('LOGIN:', JSON.stringify(loginResult))

  // who am I (real API behind the bearer token)
  const me = await apiGet(page, '/api/auth/user')
  console.log('AUTH/USER:', me.status, JSON.stringify(me.body)?.slice(0, 200))

  // modules enabled for this tenant
  const mods = await apiGet(page, '/api/modules')
  console.log('MODULES:', mods.status, JSON.stringify(mods.body)?.slice(0, 400))

  // render the dashboard
  const dash = await visit(page, '/dashboard', 'smoke-dashboard')
  console.log('DASHBOARD render:', dash.status, '| errors:', dash.errors.length)
  console.log('DASHBOARD text(first 300):', dash.bodyText.slice(0, 300).replace(/\n+/g, ' | '))
  if (dash.errors.length) console.log('DASHBOARD console errors:', dash.errors.slice(0, 5))
} finally {
  await browser.close()
}
