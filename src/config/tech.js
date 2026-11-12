/**
 * The technologies the swarm can turn into. Keys are used in scene.config.js.
 *
 * Logo outlines come from the simple-icons package (CC0-1.0 data; the marks
 * themselves belong to their owners). Only the icons imported here end up in
 * the site. A technology without an icon there is spelled out as text instead.
 */
import {
  siUbuntu, siKubernetes, siTerraform,
  siPython, siGo, siTypescript, siRust,
  siReact, siNextdotjs, siRedux, siNodedotjs,
  siFastapi, siPostgresql, siGooglecloud, siDocker, siGithubactions,
  siGithub,
} from 'simple-icons';

const MONO = "700 190px 'JetBrains Mono Variable', ui-monospace, monospace";
const SERIF = "500 220px 'Fraunces Variable', Georgia, serif";

const icon = (si) => ({ label: si.title, shape: 'icon', path: si.path });
const word = (label, text, font = MONO) => ({ label, shape: 'text', text, font });

export const tech = {
  ubuntu: icon(siUbuntu),
  kubernetes: icon(siKubernetes),
  terraform: icon(siTerraform),
  juju: word('Juju', 'juju'),

  python: icon(siPython),
  go: icon(siGo),
  typescript: icon(siTypescript),
  rust: icon(siRust),

  react: icon(siReact),
  nextjs: icon(siNextdotjs),
  redux: icon(siRedux),
  nodejs: icon(siNodedotjs),

  fastapi: icon(siFastapi),
  postgresql: icon(siPostgresql),
  gcp: icon(siGooglecloud),
  docker: icon(siDocker),
  githubactions: icon(siGithubactions),

  github: icon(siGithub),
  email: word('Email', '@', SERIF),
  linkedin: word('LinkedIn', 'in', "800 210px 'Inter Variable', system-ui, sans-serif"),
};
