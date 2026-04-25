import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Heart, Maximize, Minimize, Minus, Monitor, RotateCcw, Search, Plus, Shield, Skull, Zap } from 'lucide-react';
import { getPlayerDisplayState } from '../lib/api/projectorDisplay';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import type { DisplayCorner, PlayerDisplayState } from '../types/projectorDisplay';

const CONDITION_STYLES: Record<string, string> = {
  exhausted: 'bg-amber-100 text-amber-900 border-amber-200',
  sickly: 'bg-lime-100 text-lime-900 border-lime-200',
  dazed: 'bg-violet-100 text-violet-900 border-violet-200',
  angry: 'bg-red-100 text-red-900 border-red-200',
  scared: 'bg-sky-100 text-sky-900 border-sky-200',
  disheartened: 'bg-slate-100 text-slate-900 border-slate-300',
};

function GridOverlay({
  gridType,
  gridSize,
  gridOpacity,
  gridColor,
  gridOffsetX,
  gridOffsetY,
  gridRotation,
  width,
  height,
}: {
  gridType: 'none' | 'square' | 'hex';
  gridSize: number;
  gridOpacity: number;
  gridColor: string;
  gridOffsetX: number;
  gridOffsetY: number;
  gridRotation: number;
  width: number;
  height: number;
}) {
  if (gridType === 'none' || gridSize <= 5 || width <= 0 || height <= 0) {
    return null;
  }

  if (gridType === 'square') {
    return (
      <svg width={width} height={height} className="pointer-events-none" style={{ opacity: gridOpacity }}>
        <defs>
          <pattern
            id="projector-square-grid"
            x={gridOffsetX}
            y={gridOffsetY}
            width={gridSize}
            height={gridSize}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${gridRotation} ${gridOffsetX} ${gridOffsetY})`}
          >
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={gridColor} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#projector-square-grid)" />
      </svg>
    );
  }

  const side = gridSize;
  const hexWidth = side * Math.sqrt(3);
  const hexHeight = side * 3;

  return (
    <svg width={width} height={height} className="pointer-events-none" style={{ opacity: gridOpacity }}>
      <defs>
        <pattern
          id="projector-hex-grid"
          x={gridOffsetX}
          y={gridOffsetY}
          width={hexWidth}
          height={hexHeight}
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${gridRotation} ${gridOffsetX} ${gridOffsetY})`}
        >
          <path
            d={`M ${hexWidth / 2} 0 L ${hexWidth} ${side * 0.5} V ${side * 1.5} L ${hexWidth / 2} ${side * 2} L 0 ${side * 1.5} V ${side * 0.5} Z M ${hexWidth / 2} ${side * 2} V ${side * 3}`}
            fill="none"
            stroke={gridColor}
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#projector-hex-grid)" />
    </svg>
  );
}

type WakeLockSentinelLike = EventTarget & {
  released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type?: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

function SlotCard({
  slot,
  kioskMode,
}: {
  slot: PlayerDisplayState['slots'][number];
  kioskMode: boolean;
}) {
  const character = slot.character;
  const activeConditions = character
    ? Object.entries(character.conditions || {}).filter(([, active]) => active)
    : [];
  const isDying = !!character && character.currentHp === 0;

  return (
    <div
      className={`w-[26rem] max-w-[calc(100vw-2rem)] rounded-2xl border text-white shadow-2xl overflow-hidden ${
        kioskMode ? 'bg-black/85' : 'bg-black/70 backdrop-blur-md'
      } ${
        isDying ? 'border-red-400/60 ring-2 ring-red-500/40' : 'border-white/20'
      }`}
      style={{ transform: `rotate(${slot.rotationDeg}deg)` }}
    >
      {character ? (
        <>
          <div className="flex items-center gap-3 p-3 border-b border-white/10">
            {character.portraitUrl ? (
              <img src={character.portraitUrl} alt={character.name} className="h-12 w-12 rounded-full object-cover border border-white/20 bg-black/40 shrink-0" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-lg font-bold shrink-0">
                {character.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-lg leading-tight truncate">{character.name}</h3>
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">Player Seat</p>
            </div>

            <div className={`min-w-[5.25rem] rounded-xl border px-3 py-2 ${isDying ? 'bg-red-500/25 border-red-300/35' : 'bg-red-500/15 border-red-400/20'}`}>
              <div className="flex items-center gap-1.5 text-red-200 text-[10px] uppercase tracking-[0.18em]">
                <Heart className="h-3.5 w-3.5" />
                Health
              </div>
              <div className="mt-1 text-lg font-bold leading-none">{character.currentHp}/{character.maxHp}</div>
            </div>

            <div className="min-w-[5.25rem] rounded-xl bg-blue-500/15 border border-blue-400/20 px-3 py-2">
              <div className="flex items-center gap-1.5 text-blue-200 text-[10px] uppercase tracking-[0.18em]">
                <Zap className="h-3.5 w-3.5" />
                Will
              </div>
              <div className="mt-1 text-lg font-bold leading-none">{character.currentWp}/{character.maxWp}</div>
            </div>
          </div>

          <div className="p-3">
            <div className="min-h-[40px]">
              {isDying || activeConditions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {isDying ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-300/30 bg-red-500/20 px-2 py-1 text-[10px] font-bold uppercase text-red-100">
                      <Skull className="w-3 h-3" />
                      Dying
                    </span>
                  ) : null}
                  {activeConditions.map(([name]) => (
                    <span
                      key={name}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${CONDITION_STYLES[name] || 'bg-white/10 text-white border-white/20'}`}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase text-emerald-200">
                  <Shield className="w-3 h-3" />
                  Ready
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="p-4">
          <p className="text-sm font-semibold text-white/80">Seat Unassigned</p>
          <p className="mt-1 text-xs text-white/50">The GM has not assigned a character to this side yet.</p>
        </div>
      )}
    </div>
  );
}

const CORNER_CLASSES: Record<DisplayCorner, string> = {
  top_left: 'top-4 left-1/2 -translate-x-1/2 items-center',
  top_right: 'top-1/2 right-4 -translate-y-1/2 items-end',
  bottom_left: 'top-1/2 left-4 -translate-y-1/2 items-start',
  bottom_right: 'bottom-4 left-1/2 -translate-x-1/2 items-center',
};

const MIN_IMAGE_SCALE = 1;
const MAX_IMAGE_SCALE = 3;
const IMAGE_SCALE_STEP = 0.2;
const CONTROL_HIDE_DELAY_MS = 2600;

function clampScale(value: number) {
  return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, value));
}

function getFullscreenElement() {
  const fullscreenDocument = document as FullscreenCapableDocument;
  return document.fullscreenElement
    || fullscreenDocument.webkitFullscreenElement
    || fullscreenDocument.msFullscreenElement
    || null;
}

async function requestFullscreenCompat(element: HTMLElement | null) {
  const target = (element || document.documentElement) as FullscreenCapableElement;

  if (target.requestFullscreen) {
    await target.requestFullscreen();
    return;
  }

  if (target.webkitRequestFullscreen) {
    await target.webkitRequestFullscreen();
    return;
  }

  if (target.msRequestFullscreen) {
    await target.msRequestFullscreen();
    return;
  }

  throw new Error('Fullscreen is not supported in this browser.');
}

async function exitFullscreenCompat() {
  const fullscreenDocument = document as FullscreenCapableDocument;

  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }

  if (fullscreenDocument.webkitExitFullscreen) {
    await fullscreenDocument.webkitExitFullscreen();
    return;
  }

  if (fullscreenDocument.msExitFullscreen) {
    await fullscreenDocument.msExitFullscreen();
    return;
  }

  throw new Error('Fullscreen exit is not supported in this browser.');
}

export function ProjectorDisplayPage() {
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const controlsHideTimeoutRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageTransform, setImageTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [now, setNow] = useState(() => Date.now());
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(getFullscreenElement()));
  const [controlsVisible, setControlsVisible] = useState(true);
  const [wakeLockState, setWakeLockState] = useState<'idle' | 'active' | 'unsupported' | 'error'>('idle');
  const [wakeLockError, setWakeLockError] = useState<string | null>(null);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const isKiosk = searchParams.get('kiosk') === '1';
  const shouldKeepAwake = isKiosk || isFullscreen;

  const { data, error, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['player-display', sessionToken],
    queryFn: () => getPlayerDisplayState(sessionToken!),
    enabled: !!sessionToken,
    refetchInterval: 1500,
    retry: 1,
  });

  const measureImage = () => {
    if (!imageRef.current) {
      return;
    }

    setImageSize({
      width: imageRef.current.clientWidth,
      height: imageRef.current.clientHeight,
    });
  };

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimeoutRef.current !== null) {
      window.clearTimeout(controlsHideTimeoutRef.current);
      controlsHideTimeoutRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback((delay = CONTROL_HIDE_DELAY_MS) => {
    clearControlsHideTimer();

    if (!isKiosk) {
      setControlsVisible(true);
      return;
    }

    controlsHideTimeoutRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, delay);
  }, [clearControlsHideTimer, isKiosk]);

  const revealControls = useCallback((delay = CONTROL_HIDE_DELAY_MS) => {
    setControlsVisible(true);
    scheduleControlsHide(delay);
  }, [scheduleControlsHide]);

  useEffect(() => {
    window.addEventListener('resize', measureImage);
    return () => {
      window.removeEventListener('resize', measureImage);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(getFullscreenElement()));
      setFullscreenError(null);
      revealControls(4000);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    document.addEventListener('msfullscreenchange', handleFullscreenChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange as EventListener);
    };
  }, [revealControls]);

  useEffect(() => {
    measureImage();
  }, [data?.displayImageUrl, data?.map?.imageUrl]);

  useEffect(() => {
    setImageTransform({ x: 0, y: 0, scale: 1 });
  }, [data?.displayImageUrl, data?.map?.imageUrl]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isKiosk) {
      clearControlsHideTimer();
      setControlsVisible(true);
      return;
    }

    revealControls(4000);
    return clearControlsHideTimer;
  }, [clearControlsHideTimer, isKiosk, revealControls]);

  useEffect(() => {
    if (!isKiosk) {
      return;
    }

    const handleActivity = () => revealControls();
    const handleKeyDown = () => revealControls(4000);

    window.addEventListener('pointermove', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('wheel', handleActivity, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointermove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isKiosk, revealControls]);

  const connectionLost = !!data && now - dataUpdatedAt > 5000;
  const displayImageUrl = data?.displayImageUrl || data?.map?.imageUrl || null;
  const displayMap = data?.map ?? null;
  const showControlOverlay = controlsVisible || !isKiosk || wakeLockState === 'error' || !isFullscreen;

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;

    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        // Ignore release failures; the browser may have already dropped the lock.
      }
    }

    setWakeLockState((current) => (current === 'unsupported' ? current : 'idle'));
  }, []);

  const requestWakeLock = useCallback(async () => {
    const wakeLockNavigator = navigator as WakeLockNavigator;

    if (!shouldKeepAwake) {
      return;
    }

    if (!wakeLockNavigator.wakeLock) {
      setWakeLockState('unsupported');
      setWakeLockError(null);
      return;
    }

    if (document.visibilityState !== 'visible') {
      return;
    }

    if (wakeLockRef.current && !wakeLockRef.current.released) {
      setWakeLockState('active');
      return;
    }

    try {
      const sentinel = await wakeLockNavigator.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockState('active');
      setWakeLockError(null);

      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) {
          wakeLockRef.current = null;
        }
        setWakeLockState((current) => (current === 'unsupported' ? current : 'idle'));
      }, { once: true });
    } catch (wakeLockError) {
      setWakeLockState('error');
      setWakeLockError(wakeLockError instanceof Error ? wakeLockError.message : 'Unable to keep the projector awake.');
    }
  }, [shouldKeepAwake]);

  useEffect(() => {
    if (!shouldKeepAwake) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();
    return () => {
      void releaseWakeLock();
    };
  }, [releaseWakeLock, requestWakeLock, shouldKeepAwake]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (shouldKeepAwake) {
          void requestWakeLock();
        }
        if (isKiosk) {
          revealControls(4000);
        }
        return;
      }

      if (wakeLockRef.current) {
        wakeLockRef.current = null;
      }

      setWakeLockState((current) => (current === 'unsupported' ? current : 'idle'));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isKiosk, requestWakeLock, revealControls, shouldKeepAwake]);

  const updateKioskMode = (enabled: boolean) => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);

      if (enabled) {
        nextParams.set('kiosk', '1');
      } else {
        nextParams.delete('kiosk');
      }

      return nextParams;
    }, { replace: true });
  };

  const toggleKioskMode = () => {
    const nextKioskMode = !isKiosk;
    updateKioskMode(nextKioskMode);
    setControlsVisible(true);
  };

  const toggleFullscreen = async () => {
    try {
      if (!getFullscreenElement()) {
        await requestFullscreenCompat(rootRef.current);
      } else {
        await exitFullscreenCompat();
      }
    } catch (fullscreenError) {
      console.error('Failed to toggle fullscreen', fullscreenError);
      setFullscreenError(fullscreenError instanceof Error ? fullscreenError.message : 'Fullscreen request failed.');
    } finally {
      revealControls(4000);
    }
  };

  const updateScale = (nextScale: number) => {
    setImageTransform((current) => ({
      ...current,
      scale: clampScale(nextScale),
    }));
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    updateScale(imageTransform.scale + direction * IMAGE_SCALE_STEP);
    revealControls();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    revealControls();

    if (!displayImageUrl) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    revealControls();

    const deltaX = event.clientX - dragStateRef.current.x;
    const deltaY = event.clientY - dragStateRef.current.y;

    dragStateRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    setImageTransform((current) => ({
      ...current,
      x: current.x + deltaX,
      y: current.y + deltaY,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    revealControls();
  };

  if (!sessionToken) {
    return (
      <div className="min-h-screen bg-stone-950 text-white flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <AlertTriangle className="w-10 h-10 mx-auto text-amber-300" />
          <h1 className="mt-4 text-2xl font-bold">Missing display token</h1>
          <p className="mt-2 text-white/70">Open this page through the GM-generated projector link.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 text-white flex flex-col items-center justify-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-white/70">Connecting projector display...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-stone-950 text-white flex items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-red-400/20 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-300" />
          <h1 className="mt-4 text-2xl font-bold">Display unavailable</h1>
          <p className="mt-2 text-white/80">{(error as Error | undefined)?.message || 'This projector session is unavailable.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative min-h-screen overflow-hidden bg-stone-950 text-white">
      {!isKiosk ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.2),_transparent_40%),radial-gradient(circle_at_bottom,_rgba(245,158,11,0.12),_transparent_40%)]" />
      ) : null}

      {displayImageUrl ? (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div
            className="relative touch-none cursor-grab active:cursor-grabbing"
            style={{
              transform: `translate(${imageTransform.x}px, ${imageTransform.y}px) scale(${imageTransform.scale})`,
              transformOrigin: 'center center',
            }}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <img
              ref={imageRef}
              src={displayImageUrl}
              alt="Projector display"
              onLoad={measureImage}
              draggable={false}
              className="block max-w-screen max-h-screen object-contain select-none"
            />

            {displayMap && imageSize.width > 0 && imageSize.height > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                <GridOverlay
                  gridType={displayMap.gridType}
                  gridSize={displayMap.gridSize}
                  gridOpacity={displayMap.gridOpacity}
                  gridColor={displayMap.gridColor}
                  gridOffsetX={displayMap.gridOffsetX}
                  gridOffsetY={displayMap.gridOffsetY}
                  gridRotation={displayMap.gridRotation}
                  width={imageSize.width}
                  height={imageSize.height}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-white/10 bg-black/50 p-8 text-center backdrop-blur-md">
            <Monitor className="w-12 h-12 mx-auto text-white/60" />
            <h1 className="mt-4 text-2xl font-bold">Projector Display</h1>
            <p className="mt-2 text-white/60">No active map or display image is selected yet.</p>
          </div>
        </div>
      )}

      {data.slots.map((slot) => (
        slot.character ? (
          <div key={slot.corner} className={`absolute ${CORNER_CLASSES[slot.corner]} z-20 flex`}>
            <SlotCard slot={slot} kioskMode={isKiosk} />
          </div>
        ) : null
      ))}

      <div
        className={`absolute right-4 bottom-24 z-30 flex max-w-[calc(100vw-2rem)] justify-end transition-opacity duration-300 ${
          showControlOverlay ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2 rounded-3xl border border-white/15 bg-black/75 px-3 py-2 text-xs text-white/85 shadow-xl backdrop-blur-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-semibold">
            <Monitor className="h-4 w-4" />
            {isKiosk ? 'Kiosk Mode' : 'Projector View'}
          </span>

          <span className={`rounded-full border px-3 py-1 font-medium ${
            wakeLockState === 'active'
              ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
              : wakeLockState === 'unsupported'
                ? 'border-white/10 bg-white/5 text-white/65'
                : wakeLockState === 'error'
                  ? 'border-red-300/30 bg-red-500/15 text-red-100'
                  : 'border-white/10 bg-white/5 text-white/70'
          }`}>
            {wakeLockState === 'active'
              ? 'Screen awake'
              : wakeLockState === 'unsupported'
                ? 'Wake lock unavailable'
                : wakeLockState === 'error'
                  ? 'Wake lock failed'
                  : 'Screen can sleep'}
          </span>

          {!isFullscreen && isKiosk ? (
            <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 font-medium text-amber-100">
              Fullscreen recommended
            </span>
          ) : null}

          {connectionLost ? (
            <div className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 font-semibold text-amber-200">
              Connection lost. Retrying...
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`absolute right-4 bottom-4 z-30 flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-2 rounded-3xl border border-white/15 bg-black/75 px-3 py-3 shadow-xl backdrop-blur-md transition-opacity duration-300 ${
          showControlOverlay ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={toggleKioskMode}
          className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
            isKiosk ? 'border-blue-300/35 bg-blue-500/15 text-blue-100' : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {isKiosk ? 'Exit Kiosk' : 'Enter Kiosk'}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>

        {wakeLockState === 'error' || wakeLockState === 'idle' ? (
          <button
            type="button"
            onClick={() => {
              void requestWakeLock();
              revealControls(4000);
            }}
            className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            Keep Awake
          </button>
        ) : null}

        {displayImageUrl ? (
          <>
            <button
              type="button"
              onClick={() => updateScale(imageTransform.scale - IMAGE_SCALE_STEP)}
              className="rounded-full border border-white/15 bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Zoom out"
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-1 text-xs text-white/70">
              <Search className="w-4 h-4" />
              <span>{Math.round(imageTransform.scale * 100)}%</span>
            </div>
            <button
              type="button"
              onClick={() => updateScale(imageTransform.scale + IMAGE_SCALE_STEP)}
              className="rounded-full border border-white/15 bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Zoom in"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setImageTransform({ x: 0, y: 0, scale: 1 });
                revealControls(4000);
              }}
              className="rounded-full border border-white/15 bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Reset image position"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </>
        ) : null}
      </div>

      {(wakeLockError || fullscreenError) && showControlOverlay ? (
        <div className="absolute left-4 bottom-4 z-30 max-w-md rounded-2xl border border-red-300/30 bg-red-500/15 px-4 py-3 text-sm text-red-50 shadow-xl backdrop-blur-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{fullscreenError || wakeLockError}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
