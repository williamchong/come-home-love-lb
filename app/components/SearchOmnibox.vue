<script setup lang="ts">
/**
 * The one search surface: an always-visible field on the page, and the palette
 * it opens. Everything the site can be filtered or navigated by is reachable by
 * typing — 角色, 故事線 / CP, 節日, 客串, 里程碑, 家庭・機構, 編劇, an episode
 * title, or a bare episode number (which is what the old 跳至集數 form was).
 *
 * A palette rather than a dropdown under the field because the list has to be
 * usable on a phone, where the panel's combobox left it about eight rows tall
 * behind the results it was filtering.
 */
const { open, term, show } = useOmnibox()

// Tiers, both already in flight from the page — `useAsyncData` keys and the
// module-level promises behind them mean asking again is free. The palette
// opens before either lands: numbers and titles answer at `core`, facets need
// `full`, and the input spins until it has it.
const { data: core } = useCoreDatasetAsync()
const { data: full } = useDatasetAsync()
const { sections } = useFacetIndex(full)
const groups = useOmniboxGroups(core, sections)

// `usingInput` because the default disables a shortcut while any field has
// focus — and the panel's 搜尋劇集標題 box is exactly where you realise you
// wanted the wider search. `meta` becomes Ctrl off macOS on its own.
defineShortcuts({ meta_k: { usingInput: true, handler: () => show() } })

// `open` is app-wide state but the modal is only ever mounted here, so leaving
// the page with it true (browser Back, the phone's back gesture) would pop the
// palette open unprompted on the way back.
onUnmounted(() => {
  open.value = false
})
</script>

<template>
  <div>
    <!-- Styled as the input it stands in for: the placeholder is the pitch, and
         it has to read as searchable at a glance rather than after a click. -->
    <UButton
      block
      size="lg"
      color="neutral"
      variant="outline"
      icon="i-lucide-search"
      aria-label="搜尋"
      :ui="{ base: 'justify-start gap-2.5 font-normal' }"
      @click="show()"
    >
      <span class="text-dimmed truncate">搜尋角色、故事線、節日或集數…</span>
      <span class="ml-auto hidden sm:flex items-center gap-0.5">
        <UKbd value="meta" />
        <UKbd value="k" />
      </span>
    </UButton>

    <UModal
      v-model:open="open"
      title="搜尋"
      description="搜尋角色、故事線、節日、集數或劇集標題"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #content>
        <!-- Lazy because `UCommandPalette` is the one Nuxt UI component that
             pulls in fuse.js (~9 KB gz) — which this palette never uses, every
             group being `ignoreFilter`. Deferring it keeps the weight off the
             home page and out of the first paint. -->
        <LazyUCommandPalette
          v-model:search-term="term"
          :groups="groups"
          :loading="!full"
          placeholder="搜尋角色、故事線、節日或集數…"
          close
          class="max-h-[60vh] sm:max-h-96"
          @update:open="open = $event"
        >
          <!-- facet rows keep the panel's icon + hue + count, so the same
               option reads the same here as it does among the chips -->
          <template #facet-leading="{ item }">
            <UIcon
              :name="item.icon"
              :class="['size-5 shrink-0', item.textClass]"
              :style="toneTextStyle(item.tone)"
            />
          </template>
          <template #facet-label="{ item }">
            <span class="truncate">{{ item.label }}</span>
            <span
              v-if="item.meta"
              class="text-muted text-xs ml-1"
            >{{ item.meta }}</span>
          </template>
          <template #facet-trailing="{ item }">
            <span class="text-muted text-xs">{{ item.count }}</span>
          </template>
        </LazyUCommandPalette>
      </template>
    </UModal>
  </div>
</template>
