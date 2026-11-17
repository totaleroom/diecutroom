# Timeless Grotesk Custom Font Drop-In

Drop your licensed **Timeless Grotesk** `.woff2` files into this directory (`public/fonts/`).
The application automatically detects matching files on load with zero 404 console errors when empty:

- Single or variable file: `TimelessGrotesk.woff2` (automatically mapped to weights `100 900`)
- Individual weight files:
  - `TimelessGrotesk-Regular.woff2` (`400`)
  - `TimelessGrotesk-Medium.woff2` (`500`)
  - `TimelessGrotesk-SemiBold.woff2` (`600`)
  - `TimelessGrotesk-Bold.woff2` (`700`)

If deploying in production (`npm run build`), rebuild or copy the `.woff2` files into `dist/fonts/` as well.
