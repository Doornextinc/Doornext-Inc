/**
 * Generates all required PNG icon sizes for Median.co app submission.
 * Outputs icons to each app's public/icons/ directory.
 *
 * Usage:
 *   node scripts/generate-icons.mjs
 *
 * Requires: sharp
 *   npm install --save-dev sharp   (or pnpm add -D sharp)
 */

import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Source SVG — lives in the customer app (all apps share the same brand mark)
const SVG_PATH = join(ROOT, 'apps/customer/public/icons/icon.svg')
const svgBuffer = readFileSync(SVG_PATH)

// Sizes required:
//   192  — manifest + apple-touch-icon (all apps)
//   512  — manifest (all apps)
//   1024 — App Store / Play Store submission (all apps)
//   180  — iPhone legacy apple-touch-icon
const SIZES = [180, 192, 512, 1024]

// Apps that need icons (admin intentionally excluded — desktop-only)
const APPS = ['customer', 'maker', 'driver']

async function run() {
  for (const app of APPS) {
    const outDir = join(ROOT, `apps/${app}/public/icons`)
    mkdirSync(outDir, { recursive: true })

    for (const size of SIZES) {
      const outPath = join(outDir, `icon-${size}.png`)
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outPath)
      console.log(`✓  ${app}/public/icons/icon-${size}.png`)
    }
  }
  console.log('\nDone. All icons generated.')
}

run().catch((err) => {
  console.error('Icon generation failed:', err.message)
  console.error('Install sharp first:  npm install --save-dev sharp')
  process.exit(1)
})
