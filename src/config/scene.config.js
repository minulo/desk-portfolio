/**
 * THE file to edit when swapping placeholders for generated models,
 * re-framing the camera, or changing what the light swarm turns into.
 *
 * Each object:
 *   id          unique name, also used to link a section to its object
 *   model       path to a .glb under /public (e.g. '/models/mug.glb'),
 *               or null to use the built-in placeholder
 *   placeholder name of a builder in src/scene/placeholders.js
 *   fit         target size in metres; the loader rescales the model so its
 *               largest dimension equals `fit`, centres it, and stands it on the desk
 *   position    [x, y, z] where the object's base sits (desk top is y = DESK_TOP)
 *   rotationY   turn around the vertical axis, in degrees
 *
 * Each stop:
 *   section     id of the HTML <section data-stop="..."> it reveals
 *   object      id of the object it frames (null for the overview)
 *   camera      [x, y, z] camera position
 *   target      [x, y, z] point the camera looks at
 *   align       which side of the screen the text sits on
 *   swarm       what the particle swarm ("the daemon") shows at this stop:
 *     tech      technologies from src/config/tech.js, by key. The swarm forms
 *               each logo in turn, changing every few seconds
 *     at        [x, y, z] centre of the shape
 *     size      radius of the shape in metres
 *     glow      brightness multiplier (optional)
 *   A single procedural shape also works instead of `tech`:
 *     shape     'knot' | 'helix' | 'sphere' | 'text' (with `text` and `font`)
 *     spin      [roll, twirl] slow rotation speeds in radians/second (optional)
 */

export const DESK_TOP = 0.75;

export const objects = [
  {
    id: 'monitor',
    model: null,
    placeholder: 'monitor',
    fit: 0.62,
    position: [0, DESK_TOP, -0.2],
    rotationY: 0,
  },
  {
    id: 'keyboard',
    model: null,
    placeholder: 'keyboard',
    fit: 0.44,
    position: [0, DESK_TOP, 0.15],
    rotationY: 0,
  },
  {
    id: 'mug',
    model: null,
    placeholder: 'mug',
    fit: 0.12,
    position: [0.5, DESK_TOP, 0.14],
    rotationY: -30,
  },
  {
    id: 'phone',
    model: null,
    placeholder: 'phone',
    fit: 0.16,
    position: [-0.52, DESK_TOP, 0.14],
    rotationY: 20,
  },
];

export const stops = [
  {
    section: 'intro', object: null, align: 'left',
    camera: [1.45, 1.5, 2.55], target: [-0.3, 1.14, 0],
    // The platform stack at Canonical
    swarm: { tech: ['ubuntu', 'kubernetes', 'terraform', 'juju'], at: [0, 1.63, 0.02], size: 0.19 },
  },
  {
    section: 'about', object: 'mug', align: 'left',
    camera: [0.16, 1.03, 1.0], target: [0.46, 0.93, 0.0],
    // Languages
    swarm: { tech: ['python', 'go', 'typescript', 'rust'], at: [0.5, 1.03, 0.14], size: 0.075 },
  },
  {
    section: 'projects', object: 'monitor', align: 'right',
    camera: [-0.22, 1.2, 1.36], target: [0.16, 1.17, -0.2],
    // The web stack behind the projects
    swarm: { tech: ['react', 'nextjs', 'redux', 'nodejs'], at: [0, 1.4, -0.16], size: 0.1 },
  },
  {
    section: 'experience', object: 'keyboard', align: 'left',
    camera: [0.66, 1.22, 0.92], target: [-0.35, 0.86, 0.1],
    // Backend, data and delivery tools from past roles
    swarm: { tech: ['fastapi', 'postgresql', 'gcp', 'docker', 'githubactions'], at: [-0.09, 0.99, 0.24], size: 0.085 },
  },
  {
    section: 'contact', object: 'phone', align: 'right',
    camera: [-0.08, 1.12, 0.9], target: [-0.5, 0.9, 0.02],
    swarm: { tech: ['github', 'email', 'linkedin'], at: [-0.56, 1.0, 0.16], size: 0.07 },
  },
];
