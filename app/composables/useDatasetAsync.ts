import { loadCore, loadDataset } from './useDataset'

/** Core tier (episodes/tags/meta) — enough to render and filter the episode list. */
export function useCoreDatasetAsync() {
  return useAsyncData('dataset-core', loadCore, { lazy: true, server: false })
}

/** Full tier (adds characters/plot lines/groups) — for facets, presets and detail pages. */
export function useDatasetAsync() {
  return useAsyncData('dataset', loadDataset, { lazy: true, server: false })
}
