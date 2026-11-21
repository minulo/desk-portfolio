# Street rebuild: design

Date: 2026-11-21. Branch: `street`. Status: written while building; Minh said
"Go for it", so nothing here was approved in advance. Everything marked
**my call** is a choice I made and can be reversed.

## Why

Minh reported the site as "hella laggy" and "takes actual eons to load even on
my Mac", asked to rethink it from the beginning, and gave a new art direction:

> An urban fantasy aesthetic that blends modern-day street clothing with a
> gritty, 2000s street-culture and 80s/90s retro-futuristic edge.
> High-contrast combinations use stark blacks and neutrals anchored by vivid,
> punchy accents like hazard yellow, crimson, electric magenta, or neon
> highlights. Illustrations and art feature clean line art, bold stylized
> typography, bounce light, and subtle subsurface scattering on characters.

## What the measurements showed

Measured in headless Chromium at 1512 x 982 CSS px, 2x (a 14-inch MacBook Pro
at default scaling). This container has no GPU, so frame *time* could not be
measured; the *amount of work asked of the GPU* could.

| | `main` | `rpg-theme` |
|---|---|---|
| Canvas | 2646 x 1718 px | 2646 x 1718 px |
| Render passes per frame | 18 | 27 |
| Megapixels shaded per frame | 23.9 | 51.3 |
| Draw calls per frame | 64 | 141 |
| Shader programs compiled at start | 30 | 40 |
| Frames drawn while idle | every frame | every frame |
| JS downloaded, production build | 0.91 MB | 0.96 MB |
| JS downloaded, `npm run dev` | not measured | 22.2 MB in 45 requests |

Root causes:

1. **Lag.** A full-screen post-processing chain (bloom, anti-aliasing, outline,
   tone mapping) redraws the Retina-sized canvas 18 to 27 times per frame, and
   the page never stops drawing. At 60 Hz that is 1.4 to 3.1 billion shaded
   pixels per second.
2. **Slow load.** In dev mode the browser downloads the whole `simple-icons`
   package (13.1 MB with its source map) for 18 logos, plus 6 MB of three.js.
   Nothing is shown until all scripts have run, 30 to 40 shader programs have
   compiled, and a 3.5 second intro has played.

The frame-rate governor added earlier only reacted below 33 fps. It treated a
symptom.

## Goals

- First paint is styled text, with no script needed to see it.
- The page does no drawing work while nothing changes.
- One render pass per frame, no post-processing, at most 6 shader programs.
- The new art direction, applied to every part of the page.
- Still a 3D desk whose objects lead to sections, with models swappable in one
  config file.

## Non-goals

- Photoreal lighting, glow, depth of field, particles.
- Continuous scroll-scrubbed camera flight.
- Characters. None exist yet. The shader's bounce and subsurface terms work on
  any model, so a character model would pick them up.

## Anti-goals

- Any effect that needs a second full-screen pass.
- Any dependency whose dev-mode import pulls in megabytes for a few kilobytes
  of use.
- Copying a specific game's or brand's look. The references are a genre:
  street posters, sticker culture, hazard signage, cel animation.

## Approaches considered

1. **Tune the current scene** (lower resolution, fewer passes). Rejected: the
   look depends on the passes that cause the lag, and Minh asked for a
   different, stylized look.
2. **No WebGL: illustrated 2D page.** Fastest possible. Rejected for now
   because it drops the 3D desk and the model-swap path the project was built
   around. It remains the fallback if the scene below is still too heavy.
3. **Cel-shaded 3D, drawn on demand, under a graphic HTML layout.** Chosen
   (**my call**). The stylized look is cheap by nature: flat shading and ink
   outlines need one pass and three small shaders. Primitive placeholder
   objects look deliberate in this style instead of unfinished.

## Design

**Page.** Six sections in normal document flow with native scrolling:
Intro, Who, Drops (projects and open-source "collabs"), Tour (experience as a
tour-date list), Kit (technologies as stickers), Hotline (contact). Each has an
opaque colour-blocked content panel on one side and an "art window" on the
other. Text is real HTML and complete without JavaScript.

**Art layer.** Fixed behind the content: a flat colour field, a huge outlined
word, a rotating sigil ring, and the transparent 3D canvas on top of those.
When the active section changes, a slanted block wipes across the art layer;
at its midpoint the field colour, word and camera framing switch. The camera
cuts instead of flying, so a section change costs a handful of frames.

**3D.** three.js, loaded after first paint as a separate chunk. One custom toon
material: two-tone shading with a hard edge, halftone dots in the shadow,
bounce light tinted by the section's accent colour, a warm band at the
light/shadow edge for the subsurface look, and a hard highlight. Ink outlines
by the inverted-hull method with averaged normals. Flat ink shadows by planar
projection. No shadow maps, environment maps, or post-processing. The scene
renders only when the section, hover target, pointer position or window size
changes.

**Palette.** Ink `#0b0b0c`, paper `#f2efe6`, concrete `#8d8d86`; accents
hazard yellow `#ffd400`, electric magenta `#ff2e88`, crimson `#d7263d`, and a
neon lime `#b6ff3c` used only for small highlights. One accent dominates each
section.

**Type.** Anton for headlines, Chakra Petch for labels and numbers, Space
Grotesk for reading text.

**Words.** Plain, short, upper-case headings. Streetwear vocabulary where it
fits a real thing: projects are drops, open-source contributions are collabs,
experience is a tour, technologies are the kit. Every fact comes from the
previous portfolio's data files.

## Constraints

- Node tooling only; works on Linux, Windows and macOS.
- Free static hosting; no server code.
- `prefers-reduced-motion`: no wipes, no rotation, no marquee.
- Works with touch, keyboard, no WebGL, and no JavaScript.

## Performance budget (enforced by tests)

- Entry JS at most 20 KB gzip; all JS at most 230 KB gzip; CSS at most 20 KB gzip.
- Dev mode: at most 8 MB of JS downloaded; no request for `simple-icons`.
- Heading text visible while the 3D chunk is still loading.
- 0 draw calls during 3 idle seconds.
- 1 render pass per drawn frame; at most 6 shader programs.

## Left to the builder

Exact object proportions, camera framings, sticker placement and copy edits,
judged from screenshots.

## What cannot be verified here

Real frame rate on a Mac GPU. The page has a `?perf` readout that shows load
and frame timings on the device it runs on.
