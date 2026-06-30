// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Build-time ETL tooling — plain Node scripts, not part of the app bundle.
  { ignores: ['scripts/**', 'app/data/**'] }
)
