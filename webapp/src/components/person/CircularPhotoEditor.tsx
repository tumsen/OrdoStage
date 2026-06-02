import { useCallback, useEffect, useRef, useState } from "react";
import { RemoteImageHoverPreview } from "@/components/DocumentListThumbnail";
import { cn } from "@/lib/utils";

export type PhotoCrop = { x: number; y: number; zoom: number };

function clampFocus(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function clampZoom(v: number): number {
  if (!Number.isFinite(v)) return 100;
  return Math.max(100, Math.min(400, Math.round(v)));
}

export function normalizePhotoCrop(crop: Partial<PhotoCrop>): PhotoCrop {
  return {
    x: clampFocus(crop.x ?? 50),
    y: clampFocus(crop.y ?? 50),
    zoom: clampZoom(crop.zoom ?? 100),
  };
}

function getDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, 3);
}

function photoCropLayout(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
  crop: PhotoCrop,
  devicePixelRatio: number
) {
  const cw = Math.max(1, containerW);
  const ch = Math.max(1, containerH);
  const nw = Math.max(1, naturalW);
  const nh = Math.max(1, naturalH);
  const dpr = Math.max(1, devicePixelRatio);
  const coverScale = Math.max((cw * dpr) / nw, (ch * dpr) / nh);
  const zoomFactor = crop.zoom / 100;
  const displayW = nw * coverScale * zoomFactor;
  const displayH = nh * coverScale * zoomFactor;
  const maxPanX = Math.max(0, (displayW - cw) / 2);
  const maxPanY = Math.max(0, (displayH - ch) / 2);
  const panX = ((crop.x - 50) / 50) * maxPanX;
  const panY = ((crop.y - 50) / 50) * maxPanY;
  return {
    displayW: Math.round(displayW),
    displayH: Math.round(displayH),
    panX: Math.round(panX),
    panY: Math.round(panY),
    maxPanX,
    maxPanY,
  };
}

function focusFromPan(pan: number, maxPan: number): number {
  if (maxPan <= 0) return 50;
  return clampFocus(50 + (pan / maxPan) * 50);
}

export function CircularPhotoEditor({
  src,
  alt,
  focusX,
  focusY,
  zoom,
  cropSeedKey,
  onCropChange,
  editable = true,
  hoverPreview = !editable,
  sizeClassName = "h-40 w-40",
}: {
  src: string;
  alt: string;
  focusX: number;
  focusY: number;
  zoom: number;
  cropSeedKey?: string;
  onCropChange?: (crop: PhotoCrop) => void;
  editable?: boolean;
  hoverPreview?: boolean;
  sizeClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const notifyParentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 160, h: 160 });
  const [devicePixelRatio, setDevicePixelRatio] = useState(getDevicePixelRatio);
  const [localCrop, setLocalCrop] = useState<PhotoCrop>(() =>
    normalizePhotoCrop({ x: focusX, y: focusY, zoom })
  );
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    maxPanX: number;
    maxPanY: number;
    zoom: number;
  } | null>(null);
  const localCropRef = useRef(localCrop);
  localCropRef.current = localCrop;
  const cropSeedRef = useRef(cropSeedKey);

  const flushNotifyParent = useCallback(
    (crop: PhotoCrop) => {
      if (notifyParentTimerRef.current) {
        clearTimeout(notifyParentTimerRef.current);
        notifyParentTimerRef.current = null;
      }
      onCropChange?.(normalizePhotoCrop(crop));
    },
    [onCropChange]
  );

  const scheduleNotifyParent = useCallback(
    (crop: PhotoCrop) => {
      if (!onCropChange) return;
      if (notifyParentTimerRef.current) clearTimeout(notifyParentTimerRef.current);
      notifyParentTimerRef.current = setTimeout(() => {
        notifyParentTimerRef.current = null;
        onCropChange(normalizePhotoCrop(crop));
      }, 400);
    },
    [onCropChange]
  );

  useEffect(() => {
    return () => {
      if (notifyParentTimerRef.current) {
        clearTimeout(notifyParentTimerRef.current);
        notifyParentTimerRef.current = null;
        onCropChange?.(normalizePhotoCrop(localCropRef.current));
      }
    };
  }, [onCropChange]);

  useEffect(() => {
    if (editable) {
      if (cropSeedKey === undefined) return;
      if (cropSeedRef.current === cropSeedKey) return;
      cropSeedRef.current = cropSeedKey;
      setLocalCrop(normalizePhotoCrop({ x: focusX, y: focusY, zoom }));
      return;
    }
    setLocalCrop(normalizePhotoCrop({ x: focusX, y: focusY, zoom }));
  }, [editable, cropSeedKey, focusX, focusY, zoom]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setNaturalSize(null);
  }, [src]);

  useEffect(() => {
    const syncDpr = () => {
      if (mountedRef.current) setDevicePixelRatio(getDevicePixelRatio());
    };
    syncDpr();
    window.addEventListener("resize", syncDpr);
    return () => window.removeEventListener("resize", syncDpr);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      if (!mountedRef.current) return;
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
      setDevicePixelRatio(getDevicePixelRatio());
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout =
    naturalSize != null
      ? photoCropLayout(
          containerSize.w,
          containerSize.h,
          naturalSize.w,
          naturalSize.h,
          localCrop,
          devicePixelRatio
        )
      : null;

  const cropFromDrag = (
    clientX: number,
    clientY: number,
    start: NonNullable<typeof dragRef.current>
  ): PhotoCrop => {
    const deltaX = clientX - start.startX;
    const deltaY = clientY - start.startY;
    const panX = Math.max(-start.maxPanX, Math.min(start.maxPanX, start.startPanX + deltaX));
    const panY = Math.max(-start.maxPanY, Math.min(start.maxPanY, start.startPanY + deltaY));
    return {
      x: focusFromPan(panX, start.maxPanX),
      y: focusFromPan(panY, start.maxPanY),
      zoom: start.zoom,
    };
  };

  const applyLocalCrop = (crop: PhotoCrop) => {
    setLocalCrop(normalizePhotoCrop(crop));
  };

  const viewport = (
    <div
      ref={containerRef}
      className={`${sizeClassName} relative overflow-hidden rounded-full border border-white/15 bg-black/20 ${
        editable ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      style={{ touchAction: editable ? "none" : undefined }}
      onPointerDown={(e) => {
        if (!editable || !layout) return;
        e.preventDefault();
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startPanX: layout.panX,
          startPanY: layout.panY,
          maxPanX: layout.maxPanX,
          maxPanY: layout.maxPanY,
          zoom: localCrop.zoom,
        };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging || !dragRef.current) return;
        applyLocalCrop(cropFromDrag(e.clientX, e.clientY, dragRef.current));
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        const final = dragRef.current
          ? cropFromDrag(e.clientX, e.clientY, dragRef.current)
          : localCrop;
        dragRef.current = null;
        setDragging(false);
        applyLocalCrop(final);
        flushNotifyParent(final);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }}
      onPointerCancel={(e) => {
        if (!dragging) return;
        const final = dragRef.current
          ? cropFromDrag(e.clientX, e.clientY, dragRef.current)
          : localCrop;
        dragRef.current = null;
        setDragging(false);
        applyLocalCrop(final);
        flushNotifyParent(final);
      }}
      onWheel={(e) => {
        if (!editable) return;
        e.preventDefault();
        const nextZoom = clampZoom(localCrop.zoom + (e.deltaY < 0 ? 8 : -8));
        const next = normalizePhotoCrop({ ...localCrop, zoom: nextZoom });
        applyLocalCrop(next);
        scheduleNotifyParent(next);
      }}
      title={editable ? "Drag to pan; scroll or use slider to zoom" : undefined}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => {
          if (!mountedRef.current) return;
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }
        }}
        className={`pointer-events-none max-w-none select-none ${
          layout ? "absolute" : "h-full w-full object-cover"
        }`}
        style={
          layout
            ? {
                width: layout.displayW,
                height: layout.displayH,
                left: `calc(50% - ${layout.displayW / 2}px + ${layout.panX}px)`,
                top: `calc(50% - ${layout.displayH / 2}px + ${layout.panY}px)`,
              }
            : undefined
        }
      />
    </div>
  );

  const framedViewport =
    hoverPreview && src ? (
      <RemoteImageHoverPreview
        src={src}
        alt={alt}
        openDelay={editable ? 400 : 100}
        triggerClassName={cn(
          sizeClassName,
          "rounded-full border-0 bg-transparent p-0 shadow-none overflow-hidden"
        )}
        trigger={viewport}
      />
    ) : (
      viewport
    );

  if (!editable) return framedViewport;

  return (
    <div className="space-y-2">
      {framedViewport}
      <label className="flex items-center gap-2 text-[10px] text-white/45">
        <span className="shrink-0 w-8">Zoom</span>
        <input
          type="range"
          min={100}
          max={400}
          step={1}
          value={localCrop.zoom}
          onChange={(e) => {
            applyLocalCrop({ ...localCrop, zoom: Number(e.target.value) });
          }}
          onPointerUp={() => flushNotifyParent(localCropRef.current)}
          onBlur={() => flushNotifyParent(localCropRef.current)}
          className="h-1 flex-1 accent-white/70"
        />
      </label>
    </div>
  );
}
