import { ShaderMaterial, Vector2, Vector3, BackSide, DoubleSide } from 'three';

/**
 * The three materials that draw everything. No lights, shadow maps, textures or
 * post-processing are involved: each is a few lines of shader, so a frame is one pass.
 *
 *  toon     two flat tones with a hard edge, halftone dots where they meet, bounce light
 *           tinted by the section's colour, a warm band at the edge of the shadow (the
 *           look of light passing through skin or plastic), and a hard highlight
 *  outline  the ink line: a copy of the mesh pushed outward by a fixed number of pixels
 *  shadow   a flat shadow: the mesh flattened onto a plane along the light direction
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
  };
}

const TOON_VERT = /* glsl */ `
attribute vec4 aColor;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vColor = aColor;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const TOON_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uBounce;
uniform float uPixel;
uniform float uGloss;
uniform float uSss;
uniform float uHover;
varying vec4 vColor;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 base = vColor.rgb;

  // Flat parts (screens, printed details) are drawn exactly as painted.
  if (vColor.a > 0.5) {
    gl_FragColor = vec4(base + uHover * 0.1, 1.0);
    return;
  }

  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float ndl = dot(n, uLight);
  float ndv = max(dot(n, v), 0.0);

  // Two tones with a hard edge, softened by one pixel so the edge is not jagged.
  const float EDGE = 0.1;
  float aa = fwidth(ndl) + 1e-4;
  float lit = smoothstep(EDGE - aa, EDGE + aa, ndl);

  // Shadow tone: darker and cooler, plus light bounced up from the coloured surroundings.
  vec3 shade = base * vec3(0.5, 0.47, 0.6);
  float fromBelow = clamp(0.45 - n.y * 0.55, 0.0, 1.0);
  shade += uBounce * (0.07 + 0.2 * fromBelow);
  // A rim of bounce light on the dark side.
  shade += uBounce * 0.35 * smoothstep(0.6, 0.66, 1.0 - ndv);

  vec3 light = base * vec3(1.03, 1.01, 0.97) + 0.015;

  // Halftone: just inside the shadow, dots of the light tone shrink away to nothing.
  vec2 grid = gl_FragCoord.xy / (7.0 * uPixel);
  grid = vec2(grid.x + grid.y, grid.x - grid.y) * 0.7071;
  float dotDistance = length(fract(grid) - 0.5);
  float reach = smoothstep(EDGE - 0.5, EDGE, ndl);          // 0 deep in shadow, 1 at the edge
  float dots = (1.0 - smoothstep(reach * 0.5 - 0.06, reach * 0.5 + 0.06, dotDistance)) * step(0.02, reach);

  vec3 colour = mix(shade, light, max(lit, dots));

  // Subsurface look: a warm, saturated band where light meets shadow.
  float band = exp(-pow((ndl - EDGE) / 0.16, 2.0));
  colour = mix(colour, colour * vec3(1.22, 0.74, 0.66) + vec3(0.09, 0.0, 0.02), band * uSss);

  // One hard highlight.
  vec3 h = normalize(uLight + v);
  float spec = dot(n, h);
  float edge = 1.0 - 0.012 * uGloss - 0.002;
  colour = mix(colour, vec3(1.0), smoothstep(edge - fwidth(spec), edge + fwidth(spec), spec) * step(0.01, uGloss) * lit);

  gl_FragColor = vec4(colour + uHover * 0.07, 1.0);
}
`;

const OUTLINE_VERT = /* glsl */ `
attribute vec3 aSmooth;
uniform vec2 uResolution;
uniform float uPixel;
uniform float uWidth;

void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Push each vertex outward in screen space, so the line keeps the same pixel width
  // however far away the object is.
  vec3 viewNormal = normalize(normalMatrix * aSmooth);
  vec2 direction = normalize((projectionMatrix * vec4(viewNormal, 0.0)).xy + 1e-6);
  clip.xy += direction * (uWidth * uPixel) / uResolution * 2.0 * clip.w;
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

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Slide the vertex along the light direction until it reaches the plane.
  float t = max(world.y - uPlane, 0.0) / max(uLight.y, 0.05);
  world.xyz -= uLight * t;
  world.y = uPlane;
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SHADOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec2 uHalf;     // half-size of the surface the shadow may fall on (x, z)
varying vec3 vWorld;
void main() {
  if (abs(vWorld.x) > uHalf.x || abs(vWorld.z) > uHalf.y) discard;
  gl_FragColor = vec4(uColor, 1.0);
}
`;

export function createMaterials(shared) {
  return {
    /** Each object gets its own copy so it can be highlighted on its own; all copies share one shader program. */
    toon({ gloss = 0, sss = 0.22 } = {}) {
      return new ShaderMaterial({
        vertexShader: TOON_VERT,
        fragmentShader: TOON_FRAG,
        uniforms: {
          uLight: shared.uLight,
          uBounce: shared.uBounce,
          uPixel: shared.uPixel,
          uGloss: { value: gloss },
          uSss: { value: sss },
          uHover: { value: 0 },
        },
      });
    },
    outline({ color, width = 2.6 }) {
      return new ShaderMaterial({
        vertexShader: OUTLINE_VERT,
        fragmentShader: OUTLINE_FRAG,
        side: BackSide,
        uniforms: {
          uResolution: shared.uResolution,
          uPixel: shared.uPixel,
          uWidth: { value: width },
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
          uLight: shared.uLight,
          uPlane: { value: plane },
          uHalf: { value: new Vector2(half[0], half[1]) },
          uColor: { value: color },
        },
      });
    },
  };
}
