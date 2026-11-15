import { base, react, typescript } from '@nyg/eslint-config'
import { defineConfig } from 'eslint/config'

const dashboard = react.map(config => ({ ...config, files: ['examples/**/*.{ts,tsx}'] }))

export default defineConfig([base, typescript, dashboard])
