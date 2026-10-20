# Commonfolk Partnership Coffee Globe

An interactive, Stripe-style dotted globe that shows Commonfolk's coffee partners around the world. Spin it, tap a pin, and meet the people behind the coffee — with their latest release and a link to read their story.

Built with [three.js](https://threejs.org) (WebGL) + [Vite](https://vite.dev). No framework.

```bash
npm install
npm run dev      # local dev server
npm run build    # production bundle in dist/
npm run build:preview  # one self-contained HTML file in preview/ (opens from disk, includes the tweak panel)
```

## How it works

| File | What it does |
| --- | --- |
| `src/settings.js` | **The look & feel.** Globe size, dot density/size, arc height, marker size, chip timing, etc. |
| `src/tweaks.js` | Live tweak panel (see below). Loaded on demand — not part of the normal page bundle. |
| `src/partners.js` | **The content.** One entry per partner: name, farm, location, story, partner-page URL, latest coffee. Edit this to add/update partners. |
| `src/globe.js` | The 3D globe. Dotted land (sampled from Natural Earth via `world-atlas`), pins, animated arcs back to the Mornington roastery, drag/auto-rotate, fly-to-partner. |
| `src/main.js` | Card, floating chips and partner list UI wired to the globe. |
| `src/style.css` | Brand tokens + layout. Colours come from the *Commonfolk – UI 2024* Figma file. |

### Interaction

- Globe auto-rotates; drag to spin. On touch, dragging the globe spins it rather than scrolling the page.
- Hover a pin for a name tag; click/tap to fly to it and open the partner card.
- Partner names below the globe do the same (keyboard accessible); ←/→ and Esc work while a card is open.
- Respects `prefers-reduced-motion` (no auto-rotate, instant transitions).
- Rendering pauses when the globe is scrolled off-screen.

### Tweak panel

A slider panel for every visual parameter (globe, dots, arcs, markers, chips, colours). It appears in `npm run dev`, in the single-file preview, and on any build with `?tweak` in the URL.

- Changes apply live and are remembered in your browser until you hit **Reset everything**.
- **Copy settings** → paste over `src/settings.js` to make your tuning the default.
- **Copy colours** → paste into the `.cf-partners` block in `src/style.css` (brand colours come out as `var(--cf-…)` tokens).
- **Replay intro** re-runs the pop-in and arc draw-in.

### Editing partners

Each partner in `src/partners.js`:

```js
{
  id: 'zukuka-bora',
  name: 'Zukuka Bora',             // headline on the card + list
  farm: 'Zukuka Bora Coffee Company',
  region: 'Mt Elgon', country: 'Uganda',
  lat: 1.2, lng: 34.45,            // pin position
  since: 2014,                     // optional
  story: '…',
  image: null,                     // farm photo URL — falls back to an illustration
  url: '…/pages/partners/zukuka-bora',
  latestCoffee: { name, notes: [], url },  // optional
}
```

Any `null` field is simply hidden on the card. Pins that sit very close together (e.g. the two Huila farms) lean apart automatically.

### Brand

Colours are CSS custom properties in `src/style.css` (`--cf-*`), and the globe reads its colours from `--cf-globe-*`, so restyling never needs a JS change.

Fonts: the stack is `GT Walsheim` / `GT Walsheim Condensed` / `Commonfolk Hand` — on the live site (where those licensed fonts are loaded) they'll be used automatically. Locally, Bricolage Grotesque stands in.

## Still to do

- **Farm photos** — set `image` for each partner (the card currently shows a brand-coloured illustration).
- **Bom Jesus location** — pin is placed approximately in São Paulo state; confirm the farm's coordinates.
- **Partnership start years** for Diego & Derlin and Elias & Bellani.
- **Latest coffee** for Mausi & Eddy (La Hammonia), and a check that the other coffees/URLs are current.
- **Shopify embed** — the bundle is ~180 KB gzipped (mostly three.js). To drop it into the theme, build and load `dist/assets/*.js` + `*.css` in a section containing the markup from `index.html`, or ask for a section/snippet version.
