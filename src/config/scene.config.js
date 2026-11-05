/**
 * THE file to edit when swapping placeholders for generated models.
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
 *   align       which side of the screen the text panel sits on
 */

export const DESK_TOP = 0.75;

export const objects = [
  {
    id: 'monitor',
    model: null,
    placeholder: 'monitor',
    fit: 0.62,
    position: [0, DESK_TOP, -0.22],
    rotationY: 0,
  },
  {
    id: 'keyboard',
    model: null,
    placeholder: 'keyboard',
    fit: 0.44,
    position: [0, DESK_TOP, 0.14],
    rotationY: 0,
  },
  {
    id: 'mug',
    model: null,
    placeholder: 'mug',
    fit: 0.12,
    position: [0.52, DESK_TOP, 0.08],
    rotationY: -30,
  },
  {
    id: 'phone',
    model: null,
    placeholder: 'phone',
    fit: 0.16,
    position: [-0.5, DESK_TOP, 0.1],
    rotationY: 20,
  },
];

export const stops = [
  { section: 'intro',      object: null,       camera: [1.55, 1.55, 1.85], target: [0, 0.86, 0],      align: 'left' },
  { section: 'about',      object: 'mug',      camera: [0.88, 0.97, 0.48], target: [0.52, 0.8, 0.08], align: 'left' },
  { section: 'projects',   object: 'monitor',  camera: [0.05, 1.06, 0.62], target: [0, 1.0, -0.22],   align: 'right' },
  { section: 'experience', object: 'keyboard', camera: [0.32, 1.12, 0.58], target: [0, 0.76, 0.14],   align: 'left' },
  { section: 'contact',    object: 'phone',    camera: [-0.86, 1.0, 0.5],  target: [-0.5, 0.77, 0.1], align: 'right' },
];
