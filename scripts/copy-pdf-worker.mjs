// Copies the pdf.js worker (from the installed pdfjs-dist, whatever version
// react-pdf pulls) into public/pdf.worker.min.mjs so the in-browser PDF renderer
// loads a version-matched worker from our own origin. Runs on `prebuild`, so
// CI/Vercel always ships the correct worker; the file is also committed so local
// `next dev` works on a fresh clone.
import { existsSync, readdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DEST = join(ROOT, 'public', 'pdf.worker.min.mjs')

const candidates = [join(ROOT, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs')]
const pnpmDir = join(ROOT, 'node_modules/.pnpm')
if (existsSync(pnpmDir)) {
  for (const d of readdirSync(pnpmDir)) {
    if (d.startsWith('pdfjs-dist@')) {
      candidates.push(join(pnpmDir, d, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'))
    }
  }
}

const src = candidates.find(existsSync)
if (!src) {
  console.error('[copy-pdf-worker] pdf.worker.min.mjs not found in node_modules — is pdfjs-dist installed?')
  process.exit(1)
}
copyFileSync(src, DEST)
console.log(`[copy-pdf-worker] ${src} → ${DEST}`)
