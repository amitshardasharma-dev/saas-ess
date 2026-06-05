// Merges test-results/{agentA,agentB,agentC}/results.json into a single
// self-contained test-results/report.html with embedded (base64) screenshots,
// a summary table, and per-scenario end-user stories (expected vs actual, steps).
//
// Run: node tests/make-report.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = '/Volumes/ssd2/projects/saas-ess'
const RES = `${ROOT}/test-results`
const SHOTS = `${RES}/screenshots`

const AGENT_TITLES = {
  agentA: 'Agent A — User Profile Management',
  agentB: 'Agent B — Role-Based Access Control',
  agentC: 'Agent C — Profile × RBAC Interactions',
}

function loadAgent(agent) {
  const p = `${RES}/${agent}/results.json`
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { return { agent, error: String(e), scenarios: [], total: 0, passed: 0, failed: 0, durationMs: 0 } }
}

function imgDataUri(rel) {
  // rel looks like 'screenshots/<file>.png'
  const file = rel.replace(/^screenshots\//, '')
  const p = `${SHOTS}/${file}`
  if (!existsSync(p)) return null
  try {
    const b = readFileSync(p)
    return `data:image/png;base64,${b.toString('base64')}`
  } catch { return null }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function fmtActual(a) {
  if (a == null) return ''
  if (typeof a === 'string') return esc(a)
  // matrices / objects → pretty JSON in a <pre>
  return `<pre class="json">${esc(JSON.stringify(a, null, 2))}</pre>`
}

const agents = ['agentA', 'agentB', 'agentC'].map(loadAgent).filter(Boolean)

let total = 0, passed = 0, failed = 0, duration = 0
for (const a of agents) { total += a.total || 0; passed += a.passed || 0; failed += a.failed || 0; duration += a.durationMs || 0 }
const gaps = agents.flatMap(a => a.scenarios || []).filter(s => s.pass === false && /gap|divergen|not implemented|not enforced/i.test((s.actual||'') + (s.error||''))).length

const now = new Date().toISOString()
const pct = total ? Math.round((passed / total) * 100) : 0

function scenarioHtml(agent, s) {
  const statusClass = s.pass ? 'pass' : 'fail'
  const statusText = s.pass ? 'PASS' : 'FAIL'
  const shots = (s.screenshots || []).map((rel) => {
    const uri = imgDataUri(rel)
    if (!uri) return `<div class="shot missing">missing: ${esc(rel)}</div>`
    return `<figure class="shot"><img src="${uri}" loading="lazy" alt="${esc(rel)}"><figcaption>${esc(rel.replace('screenshots/', ''))}</figcaption></figure>`
  }).join('\n')

  return `
  <section class="scenario ${statusClass}" id="${agent}-${esc(s.id)}">
    <div class="scn-head">
      <span class="badge ${statusClass}">${statusText}</span>
      <h3>${esc(s.id)} — ${esc(s.useCase)}</h3>
      <span class="dur">${((s.durationMs||0)/1000).toFixed(1)}s</span>
    </div>
    <div class="scn-body">
      <div class="kv"><b>Steps</b><ol>${(s.steps||[]).map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>
      <div class="grid2">
        <div class="kv"><b>Expected</b><div>${esc(s.expected) || '<i>—</i>'}</div></div>
        <div class="kv"><b>Actual</b><div>${fmtActual(s.actual) || '<i>—</i>'}</div></div>
      </div>
      ${s.error ? `<div class="kv err"><b>Error</b><pre>${esc(s.error)}</pre></div>` : ''}
      ${shots ? `<div class="shots">${shots}</div>` : '<div class="noshot">no screenshots</div>'}
    </div>
  </section>`
}

const agentSections = agents.map((a) => `
  <div class="agent">
    <h2>${esc(AGENT_TITLES[a.agent] || a.agent)} <small>${a.passed||0}/${a.total||0} passed · ${((a.durationMs||0)/1000).toFixed(1)}s</small></h2>
    ${(a.scenarios||[]).map(s => scenarioHtml(a.agent, s)).join('\n')}
  </div>
`).join('\n')

const summaryRows = agents.map(a => `
  <tr>
    <td>${esc(AGENT_TITLES[a.agent] || a.agent)}</td>
    <td class="num">${a.total||0}</td>
    <td class="num ok">${a.passed||0}</td>
    <td class="num ${(a.failed||0)>0?'bad':''}">${a.failed||0}</td>
    <td class="num">${((a.durationMs||0)/1000).toFixed(1)}s</td>
  </tr>`).join('')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Volunteer Platform — E2E Test Report</title>
<style>
  :root { --ok:#16a34a; --bad:#dc2626; --bg:#0b0f17; --card:#141a26; --line:#243049; --txt:#e6edf6; --mut:#90a0b8; }
  * { box-sizing:border-box }
  body { margin:0; font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:var(--bg); color:var(--txt); }
  header { padding:28px 32px; border-bottom:1px solid var(--line); background:linear-gradient(180deg,#10182a,#0b0f17); }
  header h1 { margin:0 0 4px; font-size:24px } header .meta { color:var(--mut); font-size:13px }
  .wrap { max-width:1100px; margin:0 auto; padding:24px 32px 80px }
  .summary { display:flex; gap:16px; flex-wrap:wrap; margin:20px 0 8px }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 20px; min-width:130px }
  .stat .n { font-size:30px; font-weight:700 } .stat .l { color:var(--mut); font-size:12px; text-transform:uppercase; letter-spacing:.06em }
  .stat.ok .n { color:var(--ok) } .stat.bad .n { color:var(--bad) }
  table.sum { width:100%; border-collapse:collapse; margin:18px 0; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden }
  table.sum th, table.sum td { padding:10px 14px; border-bottom:1px solid var(--line); text-align:left }
  table.sum th { background:#0f1521; color:var(--mut); font-size:12px; text-transform:uppercase; letter-spacing:.05em }
  td.num { text-align:right; font-variant-numeric:tabular-nums } td.ok { color:var(--ok) } td.bad { color:var(--bad) }
  .agent { margin-top:36px } .agent h2 { font-size:18px; border-left:3px solid #3b82f6; padding-left:10px } .agent h2 small { color:var(--mut); font-weight:400; font-size:13px }
  .scenario { background:var(--card); border:1px solid var(--line); border-left-width:4px; border-radius:10px; margin:14px 0; overflow:hidden }
  .scenario.pass { border-left-color:var(--ok) } .scenario.fail { border-left-color:var(--bad) }
  .scn-head { display:flex; align-items:center; gap:12px; padding:12px 16px; background:#0f1521 }
  .scn-head h3 { margin:0; font-size:15px; flex:1 } .scn-head .dur { color:var(--mut); font-size:12px }
  .badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px }
  .badge.pass { background:rgba(22,163,74,.15); color:var(--ok) } .badge.fail { background:rgba(220,38,38,.15); color:var(--bad) }
  .scn-body { padding:14px 16px } .kv { margin:10px 0 } .kv > b { color:var(--mut); font-size:12px; text-transform:uppercase; letter-spacing:.05em; display:block; margin-bottom:4px }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px } @media(max-width:720px){ .grid2{grid-template-columns:1fr} }
  .kv.err pre, pre.json { background:#0b0f17; border:1px solid var(--line); border-radius:8px; padding:10px; overflow:auto; font-size:12px; max-height:340px }
  ol { margin:0; padding-left:20px } li { margin:2px 0 }
  .shots { display:flex; flex-wrap:wrap; gap:12px; margin-top:14px }
  figure.shot { margin:0; width:240px; background:#0b0f17; border:1px solid var(--line); border-radius:8px; overflow:hidden }
  figure.shot img { width:100%; display:block; cursor:zoom-in } figure.shot figcaption { font-size:10px; color:var(--mut); padding:5px 7px; word-break:break-all }
  .shot.missing,.noshot { color:var(--mut); font-size:12px; font-style:italic }
  /* lightbox */
  #lb { position:fixed; inset:0; background:rgba(0,0,0,.9); display:none; align-items:center; justify-content:center; z-index:50; cursor:zoom-out }
  #lb img { max-width:96vw; max-height:96vh }
</style></head>
<body>
<header>
  <h1>Volunteer Management Platform — End-to-End Test Report</h1>
  <div class="meta">Target: https://saas-ess.vercel.app · Generated ${esc(now)} · Modules: User Profile Management, Role-Based Access Control, and their interactions</div>
</header>
<div class="wrap">
  <div class="summary">
    <div class="stat"><div class="n">${total}</div><div class="l">Scenarios</div></div>
    <div class="stat ok"><div class="n">${passed}</div><div class="l">Passed</div></div>
    <div class="stat ${failed>0?'bad':''}"><div class="n">${failed}</div><div class="l">Failed</div></div>
    <div class="stat"><div class="n">${pct}%</div><div class="l">Pass rate</div></div>
    <div class="stat"><div class="n">${(duration/1000).toFixed(0)}s</div><div class="l">Total duration</div></div>
  </div>
  <table class="sum">
    <thead><tr><th>Module / Agent</th><th class="num">Total</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Duration</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
  ${agentSections}
</div>
<div id="lb" onclick="this.style.display='none'"><img></div>
<script>
  document.querySelectorAll('figure.shot img').forEach(img => img.addEventListener('click', e => {
    const lb = document.getElementById('lb'); lb.querySelector('img').src = img.src; lb.style.display='flex';
  }));
</script>
</body></html>`

writeFileSync(`${RES}/report.html`, html)
console.log('Report written:', `${RES}/report.html`)
console.log(`Summary: ${passed}/${total} passed, ${failed} failed, ${(duration/1000).toFixed(1)}s total`)
for (const a of agents) console.log(`  ${a.agent}: ${a.passed||0}/${a.total||0} passed`)
