# Minh Nguyen — "After hours"

A portfolio site where scrolling moves a camera across a desk at night, written
like a text-first RPG. A swarm of light particles ("the daemon") follows the
visitor from object to object and forms the logos of the technologies used in
each chapter. Clickable objects carry a faint enchantment glint.

![Intro](docs/screenshots/01-intro.jpg)

## Run it

```bash
npm install
```

```bash
npm run dev
```

Other scripts: `npm run build` writes the static site to `dist/`, and
`npm run preview` serves that build locally.

Vite 8.3.6 requires Node `^20.19.0 || >=22.12.0` (from its `package.json`).
Built and tested with Node 22.23.4, three 0.187.0, gsap 3.15.1, lenis 1.3.27 and
simple-icons 16.37.0.

## Where things live

| File | What it holds |
|---|---|
| `index.html` | All the words: name, voices, quests, roles, links |
| `src/config/scene.config.js` | Objects, camera stops, and which technologies the swarm shows at each stop |
| `src/config/tech.js` | The technologies the swarm can form (logo or text) |
| `src/style.css` | Colours, type and layout. Theme colours are the variables at the top |
| `src/scene/stage.js` | Room, window, lamp, lights, outline and bloom |
| `src/scene/swarm.js`, `shapes.js` | The particle swarm and the shapes it can form |
| `src/scene/enchant.js` | The glint on clickable objects |
| `src/scene/loader.js` | The single loader for placeholders and `.glb` models |
| `src/scene/placeholders.js` | Stand-in shapes used until real models exist |
| `src/scroll.js` | Scroll position → camera path, active section |
| `src/interact.js` | Pointer and touch: hover, click, camera drift, swarm reaction |
| `src/check.js` | The dice roll shown when something is inspected |
| `src/reveal.js` | Text reveals |

## Theme guide

Keep these rules and new work will match what is there.

**The idea.** It is late, the lamp is on, and the page reads like a text-first
RPG played at a developer's desk. Fantasy role-playing conventions, said in
computer-science words.

**Type.**
- Serif (Fraunces) is the narrator: headings and italic scene-setting lines.
- Sans (Inter) is plain speech: the sentences a visitor actually reads.
- Mono (JetBrains Mono) is the machine: labels, voice names, checks, dates,
  anything that looks like output.

**Colour.**
- Two accents only: warm `--warm` (the lamp) and cool `--cool` (the screen).
  Gradients run warm to cool.
- Violet `--ench` means "clickable" and nothing else.
- The six pastel voice colours are used only for voice names and their rules.
- No other colours. Technology logos are drawn in the swarm's warm-to-cool
  light, never in brand colours.

**Voices.** Facts are spoken by inner voices named after parts of a computer.
Use the voice that fits what is being said:

| Voice | Speaks about |
|---|---|
| Kernel | Who I am, in plain terms |
| Cache | Memory: what I have done before |
| Compiler | Strict, checkable facts: degrees, titles, numbers |
| Scheduler | What is running now and what is next |
| Linter | Taste and detail (unused so far) |
| Socket | Connection: how to reach me |

A line with no voice, in italic serif, is the narrator setting the scene.

**Words.**
- Sections are scenes. Projects are quests (`done`), open-source work is side
  quests, navigation links are numbered dialogue options phrased as actions
  ("Read the monitor.").
- Inspecting something rolls a d20, shown as one line of terminal output. It is
  flavour: the action always happens, whatever the dice say.
- The swarm is "the daemon". Its label names the technology it is showing.
- The role-playing layer is a frame. Every fact inside it is real and stated
  plainly; nothing is invented for flavour.

**Clickable things.**
- 3D objects: a faint glint drifts over them all the time. On desktop they also
  have a soft pulsing outline; under the pointer the outline and glint brighten
  and an "inspect" label appears.
- HTML controls use the `ench` class: a slow band of light crosses them, and
  hover or keyboard focus adds a violet outline.
- Nothing else in the scene glints or is outlined.

## Change the technologies the swarm shows

Each stop in `src/config/scene.config.js` lists technologies by key:

```js
swarm: { tech: ['python', 'go', 'typescript', 'rust'], at: [0.5, 1.03, 0.14], size: 0.075 }
```

The swarm forms each one in turn, changing every few seconds. Keys come from
`src/config/tech.js`. To add one, import its icon from `simple-icons` there and
add an entry. A technology with no icon in that package (Juju and LinkedIn at
the time of writing) is spelled out as text instead.

## Swap a placeholder for a real model

1. Put the compressed file in `public/models/`, for example `public/models/mug.glb`.
2. In `src/config/scene.config.js`, set that object's `model`:

   ```js
   { id: 'mug', model: '/models/mug.glb', placeholder: 'mug', fit: 0.12, ... }
   ```

The loader rescales the model so its largest side equals `fit` (metres), centres
it and stands it on the desk. If the file fails to load, the placeholder is used
instead. The glint and outline work on any model without changes. Models
compressed with `npx @gltf-transform/cli optimize` load as they are: that tool's
default geometry compression is meshopt (checked against version 4.5.1), and the
loader registers the matching decoder.

## Add a new object

1. Add an entry to `objects` in `scene.config.js` (`id`, `model`, `placeholder`,
   `fit`, `position`, `rotationY`). With no model yet, add a builder of the same
   name to `src/scene/placeholders.js`.
2. Add an entry to `stops` with the camera position, the point it looks at, the
   text side, and a `swarm` list. An object named in a stop becomes clickable.
3. Add a matching `<section data-stop="..." data-label="..." data-object="...">`
   to `index.html`, a dot in the `<nav class="dots">` list, and the new name in
   the dot-highlight rule in `src/style.css`.

## Screens and accessibility

Checked in headless Chromium at 360×640, 390×844, 768×1024, 1024×768, 1280×720,
1366×768, 1440×900, 1920×1080 and 2560×1080: the active section's text fits on
screen at every stop tested, with no sideways scrolling.

- **Desktop:** full scene with bloom, outlines, shadows, smooth scrolling and
  pointer effects.
- **Phones and small tablets:** the scene sits above the text, with fewer
  particles and no shadows, bloom or outlines. Objects can be tapped.
- **`prefers-reduced-motion`:** the camera jumps between stops, the swarm and
  glint stand still, and text appears without animation.
- **Keyboard:** every destination is a focusable link; the dialogue options do
  what clicking the objects does.
- **No WebGL:** the page falls back to plain, readable HTML.
- **Slow frame rates:** resolution drops in steps, then the idle outline is
  switched off, then bloom. Add `?q=high` to the address to pin full quality.

## 3D models: status

All objects are still placeholders. The planned cloud GPU session never ran: the
credit expired before a provider was confirmed, so nothing was created and
nothing was spent (see `COSTS.md`). The remaining route is a free hosted
image-to-3D demo, then `gltf-transform optimize`, then the swap described above.
Source photos go in `assets/source/`: one object per photo, three-quarter view,
plain background, soft even light.

## Licences of what is bundled

three (MIT), lenis (MIT), Fraunces, Inter and JetBrains Mono via Fontsource
(OFL-1.1), GSAP under its standard "no charge" licence
(https://gsap.com/standard-license), and logo outlines from simple-icons
(CC0-1.0 data; the logos themselves remain trademarks of their owners and are
used here only to name technologies).
