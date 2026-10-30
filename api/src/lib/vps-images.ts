import { env } from '../env.js';

/**
 * The operating systems a VPS can be built from.
 *
 * Debian 13 is the template of the platform. The others are offered only when the operator has
 * made a template for them and named it in VPS_IMAGES, so the list never promises an image that
 * does not exist.
 */
export const VPS_IMAGE_LABELS: Record<string, string> = {
  'debian-13': 'Debian 13',
  'ubuntu-24.04': 'Ubuntu 24.04 LTS',
  'almalinux-9': 'AlmaLinux 9',
};

export const DEFAULT_IMAGE = 'debian-13';

function configured(): Record<string, number> {
  const images: Record<string, number> = { [DEFAULT_IMAGE]: env.VPS_TEMPLATE_VMID };
  if (!env.VPS_IMAGES.trim()) return images;
  try {
    const parsed = JSON.parse(env.VPS_IMAGES) as Record<string, unknown>;
    for (const [slug, vmid] of Object.entries(parsed)) {
      if (slug in VPS_IMAGE_LABELS && typeof vmid === 'number' && Number.isInteger(vmid) && vmid >= 100) images[slug] = vmid;
    }
  } catch {
    /* a value that is not JSON offers only the default image */
  }
  return images;
}

export function availableImages(): { slug: string; label: string }[] {
  return Object.keys(configured()).map((slug) => ({ slug, label: VPS_IMAGE_LABELS[slug] ?? slug }));
}

/** The template of an image, or null when the image is not offered. */
export function templateOfImage(slug: string): number | null {
  return configured()[slug] ?? null;
}

export const imageLabel = (slug: string): string => VPS_IMAGE_LABELS[slug] ?? slug;
