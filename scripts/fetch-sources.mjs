// Fetch raw wikitext for the data sources and cache them to scripts/.cache/.
// Run: node scripts/fetch-sources.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(__dirname, '.cache')

// Source pages on the zh wikis. We pull the raw wikitext (action=raw) because it
// is far more stable to parse than rendered HTML.
const SOURCES = [
  {
    name: 'wikiversity-episodes',
    host: 'zh.wikiversity.org',
    title: '愛·回家之開心速遞集數列表及故事系列'
  },
  {
    name: 'wikipedia-series',
    host: 'zh.wikipedia.org',
    title: '愛·回家之開心速遞'
  },
  {
    name: 'wikipedia-bobby',
    host: 'zh.wikipedia.org',
    title: '波比與群姐的前世今生'
  }
]

function rawUrl({ host, title }) {
  return `https://${host}/w/index.php?title=${encodeURIComponent(title)}&action=raw`
}

async function fetchSource(source) {
  const url = rawUrl(source)
  const res = await fetch(url, {
    headers: { 'user-agent': 'come-home-love-lb episode explorer (data ETL)' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const text = await res.text()
  const out = join(CACHE_DIR, `${source.name}.wikitext`)
  await writeFile(out, text, 'utf8')
  console.log(`${source.name}: ${text.length.toLocaleString()} chars → ${out}`)
}

async function main() {
  await mkdir(CACHE_DIR, { recursive: true })
  await Promise.all(SOURCES.map(fetchSource))
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
