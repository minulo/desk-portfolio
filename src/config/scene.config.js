/**
 * THE file to edit to swap a placeholder for a real model, move things on the desk,
 * or change how each section frames the scene.
 *
 * objects — what stands on the desk
 *   id          unique name
 *   model       path to a .glb or .gltf under /public (for example '/models/mug.glb'),
 *               or null to use the built-in placeholder
 *   placeholder name of a builder in src/scene/objects.js
 *   fit         size in metres: the object is scaled so its largest side equals this
 *   position    [x, y, z] where its base sits (the desk top is y = DESK_TOP)
 *   rotationY   turn around the vertical axis, in degrees
 *   section     id of the page section it leads to when clicked (omit for decoration)
 *   gloss       0..1 size of the hard highlight (optional)
 *   sss         0..1 strength of the warm band where light meets shadow (optional;
 *               subtle by default, turn it up for skin on a character model)
 *
 * views — how each page section frames the scene
 *   camera      [x, y, z] camera position
 *   target      [x, y, z] point the camera looks at
 *   The view is drawn to fill a square about as tall as the art window.
 */

export const DESK_TOP = 0.75;

export const objects = [
  { id: 'monitor', model: null, placeholder: 'monitor', fit: 0.62, position: [0.02, DESK_TOP, -0.2], rotationY: -4, section: 'drops', gloss: 0.4 },
  { id: 'keyboard', model: null, placeholder: 'keyboard', fit: 0.44, position: [-0.02, DESK_TOP, 0.17], rotationY: 3, section: 'kit' },
  { id: 'mug', model: null, placeholder: 'mug', fit: 0.13, position: [0.5, DESK_TOP, 0.15], rotationY: -35, section: 'about', gloss: 0.7 },
  { id: 'phone', model: null, placeholder: 'phone', fit: 0.16, position: [-0.5, DESK_TOP, 0.2], rotationY: -8, section: 'contact', gloss: 0.5 },
  { id: 'cone', model: null, placeholder: 'cone', fit: 0.22, position: [-0.56, DESK_TOP, -0.2], rotationY: 12, section: 'tour' },
  { id: 'can', model: null, placeholder: 'can', fit: 0.19, position: [0.6, DESK_TOP, -0.24], rotationY: 0, gloss: 0.8 },
];

export const views = {
  intro: { camera: [2.4, 2.3, 3.6], target: [0.04, 0.72, 0] },
  about: { camera: [1.1, 1.08, 0.9], target: [0.42, 0.84, 0.1] },
  drops: { camera: [0.75, 1.22, 1.55], target: [0.02, 1.0, -0.2] },
  tour: { camera: [-1.35, 1.2, 0.75], target: [-0.56, 0.86, -0.2] },
  kit: { camera: [0.55, 1.42, 1.25], target: [-0.02, 0.78, 0.17] },
  contact: { camera: [-0.92, 0.98, 0.98], target: [-0.5, 0.84, 0.2] },
};
