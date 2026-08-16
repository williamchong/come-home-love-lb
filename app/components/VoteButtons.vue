<script setup lang="ts">
import type { VoteValue } from '#shared/types/votes'

/**
 * Up / score / down for any votable thing — an episode, a character, a story
 * line, a festival tag. One control because one vocabulary: `subject` is the
 * same `key:value` token the filter chips and the playlist already speak.
 */
const props = withDefaults(defineProps<{
  /** A `key:value` subject token — build it with `subjectToken`. */
  subject: string
  /** `rail` stacks vertically for the narrow column on an episode card. */
  variant?: 'rail' | 'row'
  label?: string
}>(), { variant: 'row', label: undefined })

const { net, myVote, vote, status } = useVotes()

const score = computed(() => net(props.subject))
const mine = computed(() => myVote(props.subject))

// Pressing the direction you already chose takes the vote back, which is the
// only way to undo one — there is no separate clear affordance.
const cast = (direction: Exclude<VoteValue, 0>) =>
  vote(props.subject, mine.value === direction ? 0 : direction)

const isRail = computed(() => props.variant === 'rail')
const buttonColor = (direction: Exclude<VoteValue, 0>) =>
  (mine.value === direction ? 'primary' : 'neutral')
</script>

<template>
  <!-- **All three states share one footprint**, and only `off` is invisible.
       Reserving space for `loading` is not enough on its own: `loading` is what
       the server renders and what the client renders on its first pass, so a
       `v-if` dropping the node on `off` would take the control out of the rail
       of all 48 cards *after* hydration — and `off` is not exotic, it is any
       failure of `/api/scores` plus every deploy whose `NUXT_VOTE_SECRET` isn't
       set yet. `visibility: hidden` keeps the geometry while taking the buttons
       out of the tab order and the accessibility tree, which `display: none` or
       an absent node cannot do. Rendering the same `loading` markup on the
       server and on the client's first pass is what keeps a prerendered page
       hydrating cleanly. -->
  <div
    class="flex items-center gap-0.5"
    :class="[isRail ? 'flex-col' : 'flex-row', { invisible: status === 'off' }]"
    :aria-hidden="status === 'off' || undefined"
  >
    <!-- Thumbs rather than arrows: this is like/dislike, which every viewer
         already knows, not a ranking nudge. -->
    <UButton
      icon="i-lucide-thumbs-up"
      :size="isRail ? 'xs' : 'sm'"
      :color="buttonColor(1)"
      variant="ghost"
      :disabled="status !== 'ready'"
      :aria-label="label ? `讚好：${label}` : '讚好'"
      :aria-pressed="mine === 1"
      @click.stop.prevent="cast(1)"
    />
    <span
      class="tabular-nums text-xs font-medium"
      :class="score === undefined ? 'text-dimmed' : 'text-highlighted'"
    >{{ score ?? '–' }}</span>
    <UButton
      icon="i-lucide-thumbs-down"
      :size="isRail ? 'xs' : 'sm'"
      :color="buttonColor(-1)"
      variant="ghost"
      :disabled="status !== 'ready'"
      :aria-label="label ? `踩：${label}` : '踩'"
      :aria-pressed="mine === -1"
      @click.stop.prevent="cast(-1)"
    />
  </div>
</template>
