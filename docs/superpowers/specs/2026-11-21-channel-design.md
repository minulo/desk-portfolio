# Channel: design note

Date: 2026-11-21. Branch: `channel`, cut from `street`. A second test of the landing
page against a more detailed brief from Minh. They left the choices to me ("you may
change the 3D objects to things you find thematically correct"), so everything below
is **my call** unless it quotes the brief.

## The brief, in short

Urban fantasy: streetwear, 2000s street culture, 80s/90s retro-futurism. A world
"built from packaging, signage, posters and graffiti, then viewed through analog
media: VHS tapes, CRT televisions, cassette labels and comic panels."

- **Colour, two layers.** A quiet, low-saturation base (near-black, warm charcoal,
  concrete gray, off-white paper; never pure #000 or #FFF). Small, loud, flat accents
  on top: hazard yellow first, then crimson, electric magenta, cyan or acid green,
  usually one per element. Each section can own one accent. A separate other-world
  mode swaps in deep black with glowing, slightly corrupted colour.
- **Graphic language.** Hazard stripes, tape and sticker labels, stamped serials,
  barcodes and spec text, halftone, comic speech panels, diagonal cuts, CRT scanlines,
  VHS tracking glitches, TV-channel transitions. Hard edges; almost no soft shadows.
- **Type.** Heavy, condensed, often italic display type, big and tight, sometimes
  skewed or knocked out of a colour block. Small monospaced text for labels and data.
- **Illustration.** Clean line art, cel shading in two or three hard tone steps, rim
  and bounce light, a hint of subsurface scattering. Characters break out of frames
  like stickers.
- **Motion.** Snappy: fast cuts, overshoot and squash-and-stretch on small elements,
  glitch and channel-flip transitions.

## Concept

A pirate TV station broadcasting from a street corner. The page is the station's
programme guide; each section is a channel (CH 01 Who … CH 05 Hotline) with one
signature accent. Changing section flips the channel.

## What changes from `street`

| Area | `street` | `channel` |
|---|---|---|
| Colour | Full-bleed yellow, magenta and crimson blocks | Quiet base everywhere; accent only on small elements; one accent per section |
| Art window | Flat colour field | A screen: frame, scanlines, on-screen display, concrete wall behind |
| Section change | Slanted wipe | Channel flip: static, tracking bands, vertical roll, channel number |
| Type | Anton, Chakra Petch | Barlow Condensed 800 italic (skewed, knocked out), Space Mono |
| Details | Stickers, tape | Plus barcodes, stamped serials, spec text, a speech panel |
| 3D set | Desk with monitor, keyboard, mug | Concrete slab with a CRT television, VHS tapes, cassette, floppy disks, brick phone, cone, spray can |
| 3D style | Ink outline, two tones | Three tones; a second, wider paper outline so objects read as die-cut stickers that overlap the frame |
| What a section shows | A close-up of the desk | The opening view shows the whole set; every other channel features one object by itself on a small stand |
| Other-world | none | "Static" mode: deep black, glowing accents, split-colour outlines and type, scanlines on everything |

Section accents: intro yellow, Who cyan, Drops magenta, Tour crimson, Kit acid green,
Hotline yellow.

## One object per channel (decided while tuning)

The first build moved the camera around the whole set, as `street` does. Close-ups of
a crowded slab hid the screen frame and printed the on-screen display across the
objects. Since a channel flip is a hard cut under static anyway, each channel now
shows its own programme: one object, alone, on a hazard-striped stand, large enough
to overlap the frame's edge. The camera is placed by a small tested function
(`src/lib/feature-view.js`) from a direction and a fill share, so a replacement model
of a different shape is still framed. Objects are clickable shortcuts on the opening
view only; a featured object answers a click with a squash and stretch.

## Names

The brief calls the other-world mode "the Hollows". That name belongs to an existing
game, so the mode here is called **Static** (the signal drops and the page tunes to
the dead channel). No names, logos, characters or interface layouts are taken from any
game; the brief is treated as a genre, and every graphic is drawn for this site.

## Unchanged rules (enforced by the existing tests)

- Text is on screen before any script runs; the 3D code loads afterwards.
- One render pass, at most 6 shader programs, nothing drawn while idle.
- Away from the opening screen, nothing animates while idle. Glitches happen on
  section change and on interaction only; scanlines are a static overlay.
- Works with keyboard, touch, no JavaScript, no WebGL, reduced motion.
- Text meets WCAG AA contrast; focus rings are two-colour.

## New rules (new tests)

- No pure black or pure white anywhere in the styles or the 3D palette.
- Block backgrounds are base tones only; `data-accent` on each section names its one
  accent from the five allowed.
- A Static switch in the top bar toggles the mode, is a real button with
  `aria-pressed`, and the 3D scene follows it. Clicking the television does the same.
- After a section change the on-screen display shows that section's channel.
- Every channel after the opening one draws one object and its stand, nothing else.
- Clicking a featured object does not move the page.

## Not in scope

Characters (none exist), sound, a second page. "Transitions between pages" is read
as transitions between sections, since this is one page.

## Tasks

1. Tests for the new rules; update tests tied to old object names.
2. Tokens, type and page styles; markup for the screen frame, display, barcodes,
   serials, speech panel and Static switch.
3. Channel-flip transition and Static mode in `main.js`.
4. New objects, three-tone shading, sticker outline and Static look in the scene.
5. Tune from screenshots; full test run; fresh review; push.
