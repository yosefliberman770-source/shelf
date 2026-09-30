// Deep zoom for an original map scan, straight from the holding collection's
// IIIF image server: only the tiles on screen are fetched, at the resolution
// the screen needs, up to the scan's own full resolution — never beyond it.
// Loaded on demand (OpenSeadragon is only downloaded when a map is opened).
import OpenSeadragon from 'openseadragon';
import { useEffect, useRef, useState } from 'react';

export interface ZoomState { /** Screen pixels per scan pixel (1 = the scan's full resolution). */ ratio: number; atMax: boolean }

export default function DeepZoom({ service, title, onState, onFail, commands }: {
  service: string; title: string;
  onState?: (s: ZoomState) => void;
  onFail?: (why: string) => void;
  /** Filled with zoom controls for the surrounding toolbar. */
  commands?: { current: { zoomIn?: () => void; zoomOut?: () => void; home?: () => void } };
}) {
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!el.current) return;
    const v = OpenSeadragon({
      element: el.current,
      tileSources: `${service}/info.json`,
      // Canvas drawing: no pixel reads, so tiles from any IIIF server work without CORS on images.
      drawer: 'canvas',
      crossOriginPolicy: false,
      showNavigationControl: false,
      // Stop at the scan's own resolution (×1.5 for a little magnifier headroom) — no fake detail.
      maxZoomPixelRatio: 1.5,
      visibilityRatio: 0.6,
      gestureSettingsTouch: { pinchRotate: false, flickEnabled: true, dblClickToZoom: true },
      animationTime: 0.6,
      immediateRender: false,
    });
    const report = () => {
      const item = v.world.getItemAt(0);
      if (!item) return;
      const ratio = item.viewportToImageZoom(v.viewport.getZoom(true));
      onState?.({ ratio, atMax: ratio >= 1.45 });
    };
    v.addHandler('open', () => { setReady(true); report(); });
    v.addHandler('animation', report);
    v.addHandler('open-failed', (e: { message?: string }) => onFail?.(e.message || 'The image server didn’t answer.'));
    if (commands) commands.current = { zoomIn: () => v.viewport.zoomBy(1.6), zoomOut: () => v.viewport.zoomBy(1 / 1.6), home: () => v.viewport.goHome() };
    return () => { v.destroy(); if (commands) commands.current = {}; };
  }, [service]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={el} className="deepzoom" role="img" aria-label={title} style={{ width: '100%', height: '100%', opacity: ready ? 1 : 0.4 }} />
  );
}
