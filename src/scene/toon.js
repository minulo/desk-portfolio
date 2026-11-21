import { ShaderMaterial, Vector2, Vector3, BackSide, DoubleSide } from 'three';

/**
 * The three materials that draw everything. No lights, shadow maps, textures or
 * post-processing are involved: each is a few lines of shader, so a frame is one pass.
 *
 *  toon     three flat tones with hard edges, halftone dots where light meets shadow,
 *           bounce and rim light in the section's accent, a warm band at the shadow
 *           edge (the look of light passing through skin or plastic), a hard highlight
 *  outline  a copy of the mesh pushed outward by a fixed number of pixels. Used twice
 *           per object: a thin ink line, and a wide paper edge behind it that makes the
 *           object read as a die-cut sticker
 *  shadow   a flat shadow: the mesh flattened onto a plane along the light direction
 *
 * In Static (other-world) mode the same shaders go dark, light the edges in the accent,
 * add scanlines and shift a few horizontal slices sideways, as a tape that is tracking
 * badly would. The slices only move when the section or the mode changes.
 *
 * Colours are written as they should appear on screen; nothing here converts colour spaces.
 */

/** Values shared by every material. Change them once and all objects follow. */
export function createShared() {
  return {
    uLight: { value: new Vector3(-0.42, 0.78, 0.46).normalize() }, // direction toward the light
    uBounce: { value: new Vector3(1, 0.83, 0) },                   // the section's accent colour
    uResolution: { value: new Vector2(1, 1) },                     // canvas size in device pixels
    uPixel: { value: 1 },                                          // device pixels per CSS pixel
    uWorld: { value: 0 },                                          // 1 in Static mode
    uSeed: { value: 0 },                                           // where the glitched slices fall
  };
}

// Shared by all three vertex shaders so an object, its outline and its shadow tear together.
const GLITCH = /* glsl */ `
uniform float uWorld;
uniform float uSeed;
vec4 glitch(vec4 clip) {
  float row = clip.y / clip.w * 2.6 + uSeed;
  float torn = step(0.86, fract(row)) - step(0.955, fract(row * 1.7 + 0.3));
  clip.x += torn * 0.022 * uWorld * clip.w;
  return clip;
}
`;

const TOON_VERT = /* glsl */ `
attribute vec4 aColor;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
${GLITCH}
void main() {
  vColor = aColor;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = glitch(projectionMatrix * viewMatrix * world);
}
`;

const TOON_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uBounce;
uniform float uPixel;
uniform float uWorld;
uniform float uGloss;
uniform float uSss;
uniform float uRim;
uniform float uHover;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 base = vColor.rgb;
  float scan = step(0.5, fract(gl_FragCoord.y / (4.0 * uPixel)));

  // Flat parts (screens, labels, printed details) are drawn exactly as painted.
  if (vColor.a > 0.5) {
    // Static mode: colours slip a channel and burn brighter.
    vec3 slipped = mix(base, base.brg, 0.55) * 1.12;
    vec3 flatColour = mix(base, slipped * (0.8 + 0.2 * scan), uWorld);
    gl_FragColor = vec4(flatColour + uHover * 0.1, 1.0);
    return;
  }

  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float ndl = dot(n, uLight);
  float ndv = max(dot(n, v), 0.0);

  // Three tones with hard edges, each softened by one pixel so it is not jagged.
  const float EDGE = 0.1;
  const float CORE = -0.5;
  float aa = fwidth(ndl) + 1e-4;
  float lit = smoothstep(EDGE - aa, EDGE + aa, ndl);
  float deep = 1.0 - smoothstep(CORE - aa, CORE + aa, ndl);

  // Shadow tone: darker and cooler, plus light bounced up from the coloured surroundings.
  vec3 shade = base * vec3(0.52, 0.49, 0.6);
  float fromBelow = clamp(0.45 - n.y * 0.55, 0.0, 1.0);
  shade += uBounce * (0.05 + 0.16 * fromBelow);
  // Core shadow: the third tone, on faces turned well away from the light.
  shade = mix(shade, shade * vec3(0.62, 0.6, 0.72), deep);
  // A rim of accent light on the dark side.
  float rim = smoothstep(0.6, 0.66, 1.0 - ndv);
  shade += uBounce * uRim * rim;

  vec3 light = base * vec3(1.03, 1.01, 0.97) + 0.015;

  // Halftone: just inside the shadow, dots of the light tone shrink away to nothing.
  vec2 grid = gl_FragCoord.xy / (7.0 * uPixel);
  grid = vec2(grid.x + grid.y, grid.x - grid.y) * 0.7071;
  float dotDistance = length(fract(grid) - 0.5);
  float reach = smoothstep(EDGE - 0.5, EDGE, ndl);          // 0 deep in shadow, 1 at the edge
  float dots = (1.0 - smoothstep(reach * 0.5 - 0.06, reach * 0.5 + 0.06, dotDistance)) * step(0.02, reach);

  vec3 colour = mix(shade, light, max(lit, dots));

  // Subsurface look: a warm, saturated band where light meets shadow.
  float fromEdge = (ndl - EDGE) / 0.16;
  float band = exp(-fromEdge * fromEdge);
  colour = mix(colour, colour * vec3(1.22, 0.74, 0.66) + vec3(0.09, 0.0, 0.02), band * uSss);

  // One hard highlight.
  vec3 h = normalize(uLight + v);
  float spec = dot(n, h);
  float edge = 1.0 - 0.012 * uGloss - 0.002;
  colour = mix(colour, vec3(0.97, 0.96, 0.93), smoothstep(edge - fwidth(spec), edge + fwidth(spec), spec) * step(0.01, uGloss) * lit);

  // Static mode: the body drops to near-black, its rim lights up in the accent, and
  // scanlines run across it.
  vec3 dark = base * 0.13 + uBounce * 0.03;
  vec3 otherworld = mix(dark, base * 0.42 + uBounce * 0.2, max(lit, dots));
  // Only surfaces seen nearly edge-on catch it, so flat tops stay dark.
  otherworld = mix(otherworld, uBounce * 1.05, smoothstep(0.8, 0.86, 1.0 - ndv));
  otherworld *= 0.76 + 0.24 * scan;
  colour = mix(colour, otherworld, uWorld);

  gl_FragColor = vec4(colour + uHover * 0.07, 1.0);
}
`;

const OUTLINE_VERT = /* glsl */ `
attribute vec3 aSmooth;
uniform vec2 uResolution;
uniform float uPixel;
uniform float uWidth;
uniform float uShift;
${GLITCH}
void main() {
  vec4 clip = glitch(projectionMatrix * modelViewMatrix * vec4(position, 1.0));
  // Push each vertex outward in screen space, so the line keeps the same pixel width
  // however far away the object is.
  vec3 viewNormal = normalize(normalMatrix * aSmooth);
  vec2 direction = normalize((projectionMatrix * vec4(viewNormal, 0.0)).xy + 1e-6);
  clip.xy += direction * (uWidth * uPixel) / uResolution * 2.0 * clip.w;
  // A sideways offset, used in Static mode to split the edge into two colours.
  clip.x += uShift * uPixel / uResolution.x * 2.0 * clip.w;
  gl_Position = clip;
}
`;

const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }
`;

const SHADOW_VERT = /* glsl */ `
uniform vec3 uLight;
uniform float uPlane;
varying vec3 vWorld;
${GLITCH}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Slide the vertex along the light direction until it reaches the plane.
  float t = max(world.y - uPlane, 0.0) / max(uLight.y, 0.05);
  world.xyz -= uLight * t;
  world.y = uPlane;
  vWorld = world.xyz;
  gl_Position = glitch(projectionMatrix * viewMatrix * world);
}
`;

const SHADOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec2 uCentre;   // centre of the surface the shadow may fall on (x, z)
uniform vec2 uHalf;     // and its half-size
varying vec3 vWorld;
void main() {
  if (abs(vWorld.x - uCentre.x) > uHalf.x || abs(vWorld.z - uCentre.y) > uHalf.y) discard;
  gl_FragColor = vec4(uColor, 1.0);
}
`;

export function createMaterials(shared) {
  const world = { uWorld: shared.uWorld, uSeed: shared.uSeed };
  return {
    /** Each object gets its own copy so it can be highlighted on its own; all copies share one shader program. */
    toon({ gloss = 0, sss = 0.22, rim = 0.4 } = {}) {
      return new ShaderMaterial({
        vertexShader: TOON_VERT,
        fragmentShader: TOON_FRAG,
        uniforms: {
          ...world,
          uLight: shared.uLight,
          uBounce: shared.uBounce,
          uPixel: shared.uPixel,
          uGloss: { value: gloss },
          uSss: { value: sss },
          uRim: { value: rim },
          uHover: { value: 0 },
        },
      });
    },
    /**
     * @param {object} o
     * @param {Vector3} o.color
     * @param {number} o.width   in CSS pixels
     * @param {{value: number}} [o.shift]  shared sideways offset in CSS pixels
     * @param {boolean} [o.behind]  draw slightly further away, so a thinner line of the
     *                              same object stays on top of this one
     */
    outline({ color, width = 2.6, shift = { value: 0 }, behind = false }) {
      return new ShaderMaterial({
        vertexShader: OUTLINE_VERT,
        fragmentShader: OUTLINE_FRAG,
        side: BackSide,
        polygonOffset: behind,
        polygonOffsetFactor: 3,
        polygonOffsetUnits: 3,
        uniforms: {
          ...world,
          uResolution: shared.uResolution,
          uPixel: shared.uPixel,
          uWidth: { value: width },
          uShift: shift,
          uColor: { value: color },
        },
      });
    },
    shadow({ color, plane, half }) {
      return new ShaderMaterial({
        vertexShader: SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        side: DoubleSide,
        // Pull the shadow a hair toward the camera so it does not flicker against the surface.
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        uniforms: {
          ...world,
          uLight: shared.uLight,
          uPlane: { value: plane },
          uCentre: { value: new Vector2(0, 0) },
          uHalf: { value: new Vector2(half[0], half[1]) },
          uColor: { value: color },
        },
      });
    },
  };
}
