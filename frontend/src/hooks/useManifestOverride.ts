import { useEffect } from 'react';

/** Temporarily points the page's <link rel="manifest"> at a different file while mounted. */
export function useManifestOverride(href: string) {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) return undefined;
    const previous = link.getAttribute('href');
    link.setAttribute('href', href);
    return () => {
      if (previous) link.setAttribute('href', previous);
    };
  }, [href]);
}
