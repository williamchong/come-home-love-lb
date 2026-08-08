#!/usr/bin/env node
// Zero-dependency headless-Chrome REPL driver for the 愛·回家 episode navigator.
// Speaks Chrome DevTools Protocol over Node's built-in WebSocket (Node >= 22).
//
// Usage:  node .claude/skills/run-come-home-love-lb/driver.mjs <<'EOF'
//   nav http://localhost:3000/
//   wait-for 集數
//   screenshot home
//   quit
// EOF
//
// Commands (one per line; lines starting with # are ignored):
//   nav <url>            navigate and wait for the load event
//   wait-for <text>      poll (10s) until document.body.innerText contains <text>
//   wait-sel <selector>  poll (10s) until querySelector(<selector>) exists
//   click <selector>     querySelector(<selector>).click()
//   fill <selector> <v>  set input value to <v> and dispatch input+change (works with v-model)
//   press <selector> <k> dispatch keydown of key <k> on <selector> (e.g. Enter)
//   text <selector>      print the element's innerText (first 500 chars)
//   count <selector>     print querySelectorAll length
//   eval <js>            evaluate JS in the page, print the JSON result
//   url                  print the current location.href
//   screenshot [name]    save PNG to screenshots/<name>.png (default: shot-<n>)
//   console-errors       print page console errors + uncaught exceptions so far
//   quit                 close Chrome and exit

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { setTimeout as sleep } from 'node:timers/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const HERE = dirname(fileURLToPath(import.meta.url))
const SS_DIR = process.env.SS_DIR || join(HERE, 'screenshots')
const PROFILE = join(HERE, '.chrome-profile')

// ---- launch chrome with an ephemeral debugging port ----
rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', `--window-size=${process.env.WINDOW_SIZE || '1280,900'}`,
  '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] })
let chromeErr = ''
chrome.stderr.on('data', d => { chromeErr += d })
process.on('exit', () => chrome.kill())

// chrome writes "<port>\n<browser-ws-path>" here once the port is bound
const portFile = join(PROFILE, 'DevToolsActivePort')
let port = null
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100)
  if (chrome.exitCode !== null) { console.error('chrome exited:\n' + chromeErr); process.exit(1) }
  if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split('\n')[0].trim()
}
if (!port) { console.error('chrome never bound a devtools port:\n' + chromeErr); process.exit(1) }

// /json/new requires PUT since Chrome 111
const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

// ---- minimal CDP plumbing ----
let msgId = 0
const pending = new Map()
const events = []          // collected console errors / exceptions
let loadFired = () => {}
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
  } else if (msg.method === 'Page.loadEventFired') {
    loadFired()
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    events.push('console.error: ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '))
  } else if (msg.method === 'Runtime.exceptionThrown') {
    events.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text))
  }
}
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId
  pending.set(id, { res, rej })
  ws.send(JSON.stringify({ id, method, params }))
})
await cdp('Page.enable')
await cdp('Runtime.enable')

// evaluate an expression, return its JSON value; throws on page-side exception
async function evalJs (expr, { awaitPromise = false } = {}) {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

async function poll (expr, what) {
  for (let i = 0; i < 100; i++) {
    if (await evalJs(expr)) return
    await sleep(100)
  }
  throw new Error(`timeout (10s) waiting for ${what}`)
}

const q = s => JSON.stringify(s)
mkdirSync(SS_DIR, { recursive: true })
let shotN = 0

async function run (line) {
  const [cmd, ...rest] = line.split(/\s+/)
  const arg = rest.join(' ')
  switch (cmd) {
    case 'nav': {
      const loaded = new Promise(res => { loadFired = res })
      await cdp('Page.navigate', { url: arg })
      await Promise.race([loaded, sleep(15000).then(() => { throw new Error('nav timeout') })])
      return 'ok'
    }
    case 'wait-for':
      await poll(`document.body && document.body.innerText.includes(${q(arg)})`, `text ${q(arg)}`)
      return 'ok'
    case 'wait-sel':
      await poll(`!!document.querySelector(${q(arg)})`, `selector ${q(arg)}`)
      return 'ok'
    case 'click':
      await evalJs(`document.querySelector(${q(arg)}).click()`)
      return 'ok'
    case 'fill': {
      const sel = rest[0], value = rest.slice(1).join(' ')
      await evalJs(`{ const el = document.querySelector(${q(sel)});
        el.value = ${q(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true })) }`)
      return 'ok'
    }
    case 'submit':
      // fires the form's submit event (what @submit.prevent listens for);
      // synthetic Enter keydowns do NOT trigger native form submission
      await evalJs(`document.querySelector(${q(arg)}).closest('form').requestSubmit()`)
      return 'ok'
    case 'press':
      await evalJs(`document.querySelector(${q(rest[0])}).dispatchEvent(
        new KeyboardEvent('keydown', { key: ${q(rest[1])}, bubbles: true }))`)
      return 'ok'
    case 'text':
      return (await evalJs(`document.querySelector(${q(arg)})?.innerText ?? '(no match)'`)).slice(0, 500)
    case 'count':
      return String(await evalJs(`document.querySelectorAll(${q(arg)}).length`))
    case 'eval':
      return JSON.stringify(await evalJs(arg, { awaitPromise: true }))
    case 'url':
      return await evalJs('location.href')
    case 'screenshot': {
      const name = arg || `shot-${++shotN}`
      const { data } = await cdp('Page.captureScreenshot', { format: 'png' })
      const file = join(SS_DIR, `${name}.png`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      return file
    }
    case 'console-errors':
      return events.length ? events.join('\n') : '(none)'
    case 'quit':
      ws.close(); chrome.kill(); process.exit(0)
    // eslint-disable-next-line no-fallthrough -- process.exit never returns
    default:
      return `unknown command: ${cmd}`
  }
}

// ---- sequential stdin REPL ----
const rl = createInterface({ input: process.stdin })
let chain = Promise.resolve()
rl.on('line', (line) => {
  line = line.trim()
  if (!line || line.startsWith('#')) return
  chain = chain.then(async () => {
    try {
      console.log(`> ${line}\n${await run(line)}`)
    } catch (e) {
      console.log(`> ${line}\nERROR: ${e.message}`)
      process.exitCode = 1
    }
  })
})
rl.on('close', () => { chain.then(() => { ws.close(); chrome.kill(); process.exit() }) })
