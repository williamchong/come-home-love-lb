import type { H3Event } from 'h3'

/**
 * The anonymous voter: a random id in a signed, HttpOnly cookie.
 *
 * No accounts, and none wanted — this exists only so a second vote on the same
 * subject can be recognised as the same person's. It is deliberately beatable
 * (clear your cookies and you are someone new); the bar is honest duplicates
 * and casual scripting, not a determined attacker.
 *
 * Why a cookie rather than a browser-stored id: Safari's ITP clears all
 * script-writable storage — localStorage, IndexedDB, and cookies written from
 * JavaScript — after seven days without interaction, while a cookie delivered
 * in a `Set-Cookie` header is exempt and keeps its stated Max-Age. An id that
 * evaporates weekly cannot deduplicate anything, and this audience is heavily
 * iOS. The same reasoning rules out Firebase Anonymous Auth, which keeps its
 * uid in IndexedDB.
 *
 * It is first-party because the API is same-origin — one of the reasons the
 * vote endpoints live in this app rather than on an api.* subdomain.
 */
const COOKIE_NAME = 'chl_v'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * 160 of the HMAC's 256 bits, base64url. Truncating a MAC is standard (it is
 * what HMAC-SHA256-128 does); 160 bits leaves forgery far out of reach while
 * keeping the cookie short.
 */
const SIGNATURE_LENGTH = 27

/** Imported once per isolate — `importKey` is not free and the secret is fixed. */
let signingKey: Promise<CryptoKey> | undefined

function keyFor(secret: string) {
  signingKey ??= crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return signingKey
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(id: string, secret: string) {
  const mac = await crypto.subtle.sign('HMAC', await keyFor(secret), new TextEncoder().encode(id))
  return base64url(new Uint8Array(mac)).slice(0, SIGNATURE_LENGTH)
}

/** Compared without an early exit, so a wrong signature takes the same time as a right one. */
function equalsInConstantTime(a: string, b: string) {
  if (a.length !== b.length) return false
  let differences = 0
  for (let i = 0; i < a.length; i++) differences |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return differences === 0
}

/**
 * The caller's voter id, issuing and setting one if they have no valid cookie.
 *
 * `null` means voting is switched off — the secret is unset, so no id can be
 * signed or trusted. Failing closed is the point: without it an unset secret
 * would mean *every* forged cookie verifies.
 *
 * Never call this from a cached response. The `Set-Cookie` it may add would be
 * cached alongside the body and hand one visitor's id to everyone who follows.
 */
export async function resolveVoter(event: H3Event): Promise<string | null> {
  const secret = useRuntimeConfig(event).voteSecret
  if (!secret) return null

  const cookie = getCookie(event, COOKIE_NAME)
  if (cookie) {
    // rsplit: the id is base64url and carries no dot, but be explicit about it
    const cut = cookie.lastIndexOf('.')
    const id = cut > 0 ? cookie.slice(0, cut) : ''
    if (id && equalsInConstantTime(cookie.slice(cut + 1), await sign(id, secret))) return id
  }

  const id = base64url(crypto.getRandomValues(new Uint8Array(16)))
  setCookie(event, COOKIE_NAME, `${id}.${await sign(id, secret)}`, {
    httpOnly: true,
    // Lax, not Strict: a vote arriving right after someone follows a shared
    // link should still be recognised. Same-origin either way.
    sameSite: 'lax',
    // `wrangler dev` serves plain http, and a Secure cookie would be dropped.
    secure: !import.meta.dev,
    path: '/',
    maxAge: COOKIE_MAX_AGE
  })
  return id
}
