import type { MyVotesResponse, ScoreMap, ScoresResponse, VoteResponse, VoteValue } from '#shared/types/votes'
import { subjectParams, track } from './useAnalytics'

/**
 * Vote scores: the third dataset tier, and the only one that changes.
 *
 * Loaded like `loadCore`/`loadDataset` in `useDataset.ts` — once, app-wide —
 * but with two differences that drive the whole design:
 *
 * - **Client only, always.** The other tiers run on the server so detail pages
 *   prerender with real content. This one must not: a score baked into 4,300
 *   static files is wrong the moment someone votes, and would ship stale
 *   forever.
 * - **Mutable.** A vote patches the map in place. Refetching would cost a round
 *   trip to learn something the response already told us.
 *
 * Everything degrades to "no voting": if the API is unreachable — no D1 binding,
 * no secret, offline — `status` stays `off`, the controls hide, `scoresInPlay`
 * turns every score-ordered surface back to the order it shipped in, and the
 * site filters exactly as it did before any of this existed.
 */

/** This browser's own votes, so the controls are right before the network answers. */
const STORAGE_KEY = 'chl:votes'

/**
 * Three states, not a boolean, because "not ready yet" and "not happening"
 * need different pixels: the first reserves the control's space so 48 cards
 * don't reflow when scores land, the second removes it entirely.
 *
 * `loading` is also what the server renders, and what the client renders on its
 * first pass — which is what keeps a prerendered page hydrating cleanly.
 */
type VoteStatus = 'loading' | 'ready' | 'off'

interface VoteState {
  scores: ScoreMap
  /** `subject → this visitor's vote`. Absent means they haven't voted. */
  mine: Record<string, VoteValue>
  status: VoteStatus
}

/** Module-level, so N mounted controls trigger exactly one load. */
let loadStarted = false

/**
 * Subjects with a vote in flight, module-level for the same reason `loadStarted`
 * is: the state it guards is shared, so the guard has to be too. Per-call it
 * would only stop a double-click on one button instance, and the same subject
 * can be on screen twice — a card in the list and the detail page it links to.
 */
const inFlight = new Set<string>()

function readStoredVotes(): Record<string, VoteValue> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as Record<string, VoteValue> : {}
  } catch {
    // private mode, quota, or a shape from an older build — start clean
    return {}
  }
}

function storeVotes(votes: Record<string, VoteValue>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(votes))
  } catch {
    // Never let a storage failure lose a vote the server already accepted.
  }
}

/** Moves a subject's totals by the difference between two votes. */
function applyVote(scores: ScoreMap, subject: string, before: VoteValue, after: VoteValue) {
  const [up = 0, down = 0] = scores[subject] ?? []
  scores[subject] = [
    Math.max(0, up + (after === 1 ? 1 : 0) - (before === 1 ? 1 : 0)),
    Math.max(0, down + (after === -1 ? 1 : 0) - (before === -1 ? 1 : 0))
  ]
}

export function useVotes() {
  const state = useState<VoteState>('votes', () => ({ scores: {}, mine: {}, status: 'loading' }))
  const toast = useToast()

  if (import.meta.client && !loadStarted) {
    loadStarted = true
    // `onNuxtReady`, not setup, and this is load-bearing. Touching `state` while
    // components are still hydrating makes the client's first render disagree
    // with the prerendered HTML, and Vue resolves that by keeping the server's
    // DOM — so a returning visitor's own vote stayed visually un-pressed even
    // though `mine` held it, until some later interaction happened to repaint.
    // Deferring past hydration makes every change an ordinary patch.
    onNuxtReady(() => {
      // localStorage first so a returning visitor's own votes light up without
      // waiting on the network, which then supplies everyone else's.
      state.value.mine = readStoredVotes()
      void Promise.all([
        $fetch<ScoresResponse>('/api/scores'),
        // The cookie outlives localStorage — Safari clears script-writable
        // storage after seven quiet days but leaves a Set-Cookie alone — so the
        // server is the authority on what this visitor already voted for.
        $fetch<MyVotesResponse>('/api/me').catch(() => null)
      ]).then(([snapshot, me]) => {
        // Where the two disagree, `me` wins. The snapshot is one document
        // shared by everyone behind a five-minute TTL; `me` is uncached and
        // about this visitor, so it can only ever be the newer of the two.
        //
        // Without this, casting the first vote on a subject and reloading read
        // back as 「–」: an unvoted subject is *absent* from the snapshot rather
        // than stale within it, so the score didn't look old, it looked lost.
        // The reverse case — withdrawing a vote, which drops the subject from
        // `totals` here — still trails the snapshot by up to one TTL, but that
        // reads as somebody else's vote rather than as a lost action.
        state.value.scores = { ...snapshot.scores, ...me?.totals }
        if (me) state.value.mine = me.votes
        // Scores are worth showing even when nobody can vote, but a control
        // that 503s on click is not — which is exactly a deploy that has not
        // had its signing secret set yet.
        state.value.status = snapshot.votingEnabled ? 'ready' : 'off'
      }).catch(() => {
        // No controls, no 得分 sort, no error shown. Voting is an enhancement,
        // and its absence is not the visitor's problem.
        state.value.status = 'off'
      })
    })
  }

  /** Net score, or undefined when nothing is known — which renders as `–`. */
  const net = (subject: string) => netScore(state.value.scores[subject])

  const myVote = (subject: string): VoteValue => state.value.mine[subject] ?? 0

  async function vote(subject: string, next: VoteValue) {
    if (state.value.status !== 'ready' || inFlight.has(subject)) return
    const before = myVote(subject)
    if (before === next) return

    inFlight.add(subject)
    // Paint first, reconcile after: a vote should feel like a button press,
    // not a round trip.
    applyVote(state.value.scores, subject, before, next)
    state.value.mine[subject] = next
    storeVotes(state.value.mine)

    try {
      const result = await $fetch<VoteResponse>('/api/vote', {
        method: 'POST',
        body: { subject, value: next }
      })
      // The server's totals win — ours were a guess made without knowing what
      // anyone else did in the meantime. Written per key rather than by
      // replacing the map: Vue tracks (object, key), so a fresh object would
      // invalidate every mounted control on the page instead of this one.
      state.value.scores[subject] = [result.up, result.down]
      state.value.mine[subject] = result.mine
      storeVotes(state.value.mine)
      // Only what the server kept. The paint above is optimistic and the catch
      // below undoes it, so reporting at the call would count votes that were
      // rate-limited away — and `result.mine`, not `next`, because the server is
      // the authority on what this visitor now holds.
      track('vote', { ...subjectParams(subject), vote_value: result.mine })
    } catch (error) {
      applyVote(state.value.scores, subject, next, before)
      state.value.mine[subject] = before
      storeVotes(state.value.mine)
      const tooMany = (error as { statusCode?: number })?.statusCode === 429
      // Anti-abuse is best-effort and its budget was sized by guess: how often a
      // real visitor hits the hourly cap is the only evidence that it is set
      // anywhere near right. No subject — a failure is about the limiter, and
      // the toast the visitor sees is the same either way.
      track('vote_failed', { reason: tooMany ? 'rate_limited' : 'error' })
      toast.add({
        title: tooMany ? '投票太頻繁' : '投票失敗',
        description: tooMany ? '稍後再試吧。' : '請稍後再試。',
        color: 'error'
      })
    } finally {
      inFlight.delete(subject)
    }
  }

  return {
    scores: computed(() => state.value.scores),
    status: computed(() => state.value.status),
    /**
     * Whether scores are part of this visit at all — the one question the
     * surfaces that *order* by them should ask.
     *
     * It is exactly `status !== 'off'`, named because the reasoning is not in
     * the comparison. `off` has two causes: the snapshot never arrived, or a
     * deploy whose signing secret is unset. Only the first leaves nothing to
     * sort by — but `VoteButtons` removes the whole control in both, the score
     * along with the thumbs, so in the second the site would be ordering itself
     * by numbers it shows nowhere. One line for both, drawn where the numbers
     * are drawn, so every score-ordered surface turns off together rather than
     * each deciding for itself.
     *
     * True while `loading`, deliberately. The map is merely empty then, which
     * every score comparator already resolves to its own tie-break, so nothing
     * has to reshuffle when the snapshot lands a tick later.
     */
    scoresInPlay: computed(() => state.value.status !== 'off'),
    net,
    myVote,
    vote
  }
}
