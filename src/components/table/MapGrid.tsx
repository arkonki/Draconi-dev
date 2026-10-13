interface MapGridProps {
  gridType: 'none' | 'square' | 'hex';
  gridSize: number;
  gridOpacity: number;
  gridColor: string;
  gridOffsetX: number;
  gridOffsetY: number;
  gridRotation: number;
  width: number;
  height: number;
}

/** The grid drawn over a map, in the map image's own pixels (the same convention the Atlas uses). */
export function MapGrid({ gridType, gridSize, gridOpacity, gridColor, gridOffsetX, gridOffsetY, gridRotation, width, height }: MapGridProps) {
  if (gridType === 'none' || gridSize <= 5 || width <= 0 || height <= 0) return null;
  const transform = `rotate(${gridRotation} ${gridOffsetX} ${gridOffsetY})`;

  if (gridType === 'square') {
    return (
      <svg width={width} height={height} className="pointer-events-none absolute inset-0" style={{ opacity: gridOpacity }} aria-hidden="true">
        <defs>
          <pattern id="table-square-grid" x={gridOffsetX} y={gridOffsetY} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse" patternTransform={transform}>
            <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={gridColor} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#table-square-grid)" />
      </svg>
    );
  }

  const side = gridSize;
  const hexWidth = side * Math.sqrt(3);
  const hexHeight = side * 3;
  return (
    <svg width={width} height={height} className="pointer-events-none absolute inset-0" style={{ opacity: gridOpacity }} aria-hidden="true">
      <defs>
        <pattern id="table-hex-grid" x={gridOffsetX} y={gridOffsetY} width={hexWidth} height={hexHeight} patternUnits="userSpaceOnUse" patternTransform={transform}>
          <path
            d={`M ${hexWidth / 2} 0 L ${hexWidth} ${side * 0.5} V ${side * 1.5} L ${hexWidth / 2} ${side * 2} L 0 ${side * 1.5} V ${side * 0.5} Z M ${hexWidth / 2} ${side * 2} V ${side * 3}`}
            fill="none"
            stroke={gridColor}
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#table-hex-grid)" />
    </svg>
  );
}
