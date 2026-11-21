/**
 * THE file to edit to swap a placeholder for a real model, move things on the set,
 * or change how each section frames the scene.
 *
 * objects — what stands on the concrete slab
 *   id          unique name
 *   model       path to a .glb or .gltf inside public/ (for example '/models/tv.glb',
 *               read as inside the site's own folder), or null to use the placeholder
 *   placeholder name of a builder in src/scene/objects.js
 *   fit         size in metres: the object is scaled so its largest side equals this
 *   position    [x, y, z] where its base sits (the slab's top is y = STAGE_TOP)
 *   rotationY   turn around the vertical axis, in degrees
 *   section     id of the page section it leads to when clicked
 *   action      instead of a section: 'world' flips the Static (other-world) mode
 *   label       text for its sticker label when it has an action
 *   gloss       0..1 size of the hard highlight (optional)
 *   sss         0..1 strength of the warm band where light meets shadow (optional;
 *               subtle by default, turn it up for skin on a character model)
 *   Leave out section and action for decoration.
 *
 * views — what each page section (channel) shows
 *   Either the whole set:
 *     camera    [x, y, z] camera position
 *     target    [x, y, z] point the camera looks at
 *   or one object by itself, on a small stand:
 *     feature   id of the object
 *     from      [turn, tilt] in degrees, the direction it is seen from: turn 0 is
 *               straight in front, positive turns to its right; tilt raises the camera
 *     fill      0..1 how much of the view's height the object takes up (measured on
 *               the ball that just encloses it; its stand may reach further)
 *   The view is drawn to fill a square about as tall as the art window, so a featured
 *   object overlaps the 4:3 screen frame on purpose.
 */

export const STAGE_TOP = 0.1;

export const objects = [
  { id: 'tv', model: null, placeholder: 'tv', fit: 0.98, position: [0, STAGE_TOP, -0.16], rotationY: -6, action: 'world', label: 'Static', gloss: 0.5 },
  { id: 'cassette', model: null, placeholder: 'cassette', fit: 0.3, position: [0.6, STAGE_TOP, 0.36], rotationY: -14, section: 'about', gloss: 0.4 },
  { id: 'tapes', model: null, placeholder: 'tapes', fit: 0.36, position: [-0.08, STAGE_TOP, 0.36], rotationY: 16, section: 'drops', gloss: 0.3 },
  { id: 'cone', model: null, placeholder: 'cone', fit: 0.38, position: [0.7, STAGE_TOP, -0.16], rotationY: 12, section: 'tour' },
  { id: 'floppies', model: null, placeholder: 'floppies', fit: 0.25, position: [-0.62, STAGE_TOP, 0.34], rotationY: -10, section: 'kit' },
  { id: 'phone', model: null, placeholder: 'phone', fit: 0.34, position: [-0.66, STAGE_TOP, -0.22], rotationY: 22, section: 'contact', gloss: 0.5 },
  { id: 'can', model: null, placeholder: 'can', fit: 0.26, position: [0.26, STAGE_TOP, 0.4], rotationY: 0, gloss: 0.8 },
];

export const views = {
  intro: { camera: [2.5, 1.85, 3.8], target: [0, 0.42, 0] },
  about: { feature: 'cassette', from: [24, 22], fill: 0.6 },
  drops: { feature: 'tapes', from: [-26, 22], fill: 0.62 },
  tour: { feature: 'cone', from: [28, 16], fill: 0.7 },
  kit: { feature: 'floppies', from: [-24, 26], fill: 0.64 },
  contact: { feature: 'phone', from: [26, 14], fill: 0.7 },
};
