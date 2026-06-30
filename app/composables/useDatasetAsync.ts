import { loadDataset } from './useDataset'

/** Lazily loads the shared dataset on the client (same cache key across all pages). */
export function useDatasetAsync() {
  return useAsyncData('dataset', loadDataset, { lazy: true, server: false })
}
