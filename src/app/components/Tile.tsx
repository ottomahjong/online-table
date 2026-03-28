import React from 'react';
import { Tile as TileType } from '../types';
import svgPaths from '../../imports/svg-j2e1svqzjb';

// Figma-designed tile imports
import BirdBam from '../../imports/BirdBam';
import Component2Bam from '../../imports/2Bam';
import Component3Bam from '../../imports/3Bam';
import Component4Bam from '../../imports/4Bam';
import Component5Bam from '../../imports/5Bam';
import Component6Bam from '../../imports/6Bam';
import Component7Bam from '../../imports/7Bam';
import Component8Bam from '../../imports/8Bam';
import Component9Bam from '../../imports/9Bam';
import GreenDragon from '../../imports/GreenDragon';

// Figma-designed Crak tile imports
import Component1Crak from '../../imports/1Crak';
import Component2Crak from '../../imports/2Crak';
import Component3Crak from '../../imports/3Crak';
import Component4Crak from '../../imports/4Crak';
import Component5Crak from '../../imports/5Crak';
import Component6Crak from '../../imports/6Crak';
import Component7Crak from '../../imports/7Crak';
import Component8Crak from '../../imports/8Crak';
import Component9Crak from '../../imports/9Crak';
import RedDragon from '../../imports/RedDragon';

// Figma-designed Dot tile imports
import Component1Dot from '../../imports/1Dot';
import Component2Dot from '../../imports/2Dot';
import Component3Dot from '../../imports/3Dot';
import Component4Dot from '../../imports/4Dot';
import Component5Dot from '../../imports/5Dot';
import Component6Dot from '../../imports/6Dot';
import Component7Dot from '../../imports/7Dot';
import Component8Dot from '../../imports/8Dot';
import Component9Dot from '../../imports/9Dot';
import SoapDragon from '../../imports/SoapDragon';

// Figma-designed Joker tile imports
import Joker1 from '../../imports/Joker1';
import Joker2 from '../../imports/Joker2';
import Joker3 from '../../imports/Joker3';
import Joker4 from '../../imports/Joker4';
import Joker5 from '../../imports/Joker5';
import Joker6 from '../../imports/Joker6';
import Joker7 from '../../imports/Joker7';
import Joker8 from '../../imports/Joker8';
import Joker9 from '../../imports/Joker9';
import Joker10 from '../../imports/Joker10';

// Figma-designed Flower tile imports
import Flower1 from '../../imports/Flower1';
import Flower2 from '../../imports/Flower2';
import Flower3 from '../../imports/Flower3';
import Flower4 from '../../imports/Flower4';
import Flower5 from '../../imports/Flower5';
import Flower6 from '../../imports/Flower6';
import Flower7 from '../../imports/Flower7';
import Flower8 from '../../imports/Flower8';

// Figma-designed Wind tile imports
import NorthWind from '../../imports/NorthWind';
import SouthWind from '../../imports/SouthWind';
import EastWind from '../../imports/EastWind';
import WestWind from '../../imports/WestWind';

// Figma-designed Tile Back SVG paths
import tileBackPaths from '../../imports/svg-xkenso6b24';

interface TileProps {
  tile: TileType;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  selectedColor?: string;
  onClick?: () => void;
  interactive?: boolean;
  horizontal?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { w: 32, h: 44 },
  md: { w: 44, h: 60 },
  lg: { w: 56, h: 76 },
};

// Starburst SVG for decorative elements
function Starburst({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color}>
      <path d="M10 0L12 7L20 7L14 11L16 18L10 14L4 18L6 11L0 7L8 7Z" />
    </svg>
  );
}

function FourPointStar({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z" />
    </svg>
  );
}

function DiamondStar({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color}>
      <path d="M10 0L13 7L20 10L13 13L10 20L7 13L0 10L7 7Z" />
    </svg>
  );
}

// Otto Mahjong Mark for tile backs
function OttoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52.8 52.8" fill="none" preserveAspectRatio="xMidYMid meet">
      <path d={svgPaths.p340ce500} fill="#AF6B4F" />
    </svg>
  );
}

// Mid-century modern geometric dragon motifs
function DragonIcon({ color, size, primary, accent }: { color: string; size: number; primary: string; accent: string }) {
  if (color === 'red') {
    // Red Dragon: bold geometric serpent with angular coils
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        {/* Stylized angular dragon body */}
        <path d="M8 32 L8 18 L14 12 L26 12 L32 18 L32 22 L26 16 L20 16 L14 22 L14 28 L20 28 L26 22 L32 28 L32 32"
          stroke={primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Dragon eye */}
        <circle cx="22" cy="12" r="2.5" fill={primary} />
        {/* Accent diamond */}
        <path d="M20 6 L22 3 L24 6 L22 9 Z" fill={accent} />
      </svg>
    );
  }

  if (color === 'green') {
    // Green Dragon: geometric stylized dragon with angular wings
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        {/* Stylized angular dragon silhouette */}
        <path d="M10 34 L10 20 L16 14 L22 14 L22 20 L28 14 L34 14 L34 20 L28 26 L22 26 L22 32 L16 32 L16 26 L10 34"
          stroke={primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Wing accent */}
        <path d="M28 14 L32 8 L34 14" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {/* Dragon eye */}
        <circle cx="19" cy="17" r="2" fill={primary} />
        {/* Scale detail */}
        <path d="M14 24 L16 22 L18 24" stroke={accent} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    );
  }

  // Soap Dragon: clean outlined geometric form, lighter/ethereal
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      {/* Outlined geometric dragon - open/airy feel */}
      <path d="M12 32 L12 22 L18 16 L24 16 L30 22 L30 28 L24 22 L18 22 L18 28 L24 34"
        stroke={primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Crown/head detail */}
      <path d="M18 16 L16 10 L20 13 L24 10 L22 16" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Hollow eye */}
      <circle cx="21" cy="16" r="1.5" stroke={primary} strokeWidth="1.5" fill="none" />
      {/* Accent dots */}
      <circle cx="14" cy="27" r="1" fill={accent} />
      <circle cx="26" cy="25" r="1" fill={accent} />
    </svg>
  );
}

// Map bam values to their Figma-designed components
const bamComponents: Record<number, React.FC> = {
  1: BirdBam,
  2: Component2Bam,
  3: Component3Bam,
  4: Component4Bam,
  5: Component5Bam,
  6: Component6Bam,
  7: Component7Bam,
  8: Component8Bam,
  9: Component9Bam,
};

// Map crak values to their Figma-designed components
const crakComponents: Record<number, React.FC> = {
  1: Component1Crak,
  2: Component2Crak,
  3: Component3Crak,
  4: Component4Crak,
  5: Component5Crak,
  6: Component6Crak,
  7: Component7Crak,
  8: Component8Crak,
  9: Component9Crak,
};

// Map dot values to their Figma-designed components
const dotComponents: Record<number, React.FC> = {
  1: Component1Dot,
  2: Component2Dot,
  3: Component3Dot,
  4: Component4Dot,
  5: Component5Dot,
  6: Component6Dot,
  7: Component7Dot,
  8: Component8Dot,
  9: Component9Dot,
};

// Array of Figma-designed Joker components (10 unique designs, cycled for 11+)
const jokerComponents: React.FC[] = [
  Joker1, Joker2, Joker3, Joker4, Joker5,
  Joker6, Joker7, Joker8, Joker9, Joker10,
];

// Array of Figma-designed Flower components (8 unique designs, cycled for 9+)
const flowerComponents: React.FC[] = [
  Flower1, Flower2, Flower3, Flower4, Flower5,
  Flower6, Flower7, Flower8,
];

function renderTileFace(tile: TileType, sizeKey: 'sm' | 'md' | 'lg') {
  const isSmall = sizeKey === 'sm';
  const isMed = sizeKey === 'md';
  const numSize = isSmall ? 'text-[11px]' : isMed ? 'text-[15px]' : 'text-[19px]';
  const labelSize = isSmall ? 'text-[6px]' : isMed ? 'text-[7px]' : 'text-[8px]';
  const starSize = isSmall ? 5 : isMed ? 7 : 9;

  switch (tile.type) {
    case 'suited': {
      // Use Figma-designed SVG tiles for bam suit
      if (tile.suit === 'bam') {
        const BamComponent = bamComponents[tile.value];
        if (BamComponent) {
          return <BamComponent />;
        }
      }

      // Use Figma-designed SVG tiles for crak suit
      if (tile.suit === 'crak') {
        const CrakComponent = crakComponents[tile.value];
        if (CrakComponent) {
          return <CrakComponent />;
        }
      }

      // Use Figma-designed SVG tiles for dot suit
      if (tile.suit === 'dot') {
        const DotComponent = dotComponents[tile.value];
        if (DotComponent) {
          return <DotComponent />;
        }
      }

      const suitColors: Record<string, { primary: string; accent: string; label: string }> = {
        bam: { primary: '#2D6A4F', accent: '#B5704F', label: 'BAM' },
        crak: { primary: '#1B2A4A', accent: '#B5704F', label: 'CRAK' },
        dot: { primary: '#B5704F', accent: '#2D6A4F', label: 'DOT' },
      };
      const s = suitColors[tile.suit];

      return (
        <div className="flex flex-col items-center justify-between h-full py-0.5 px-0.5">
          <span className={`${numSize} tracking-tight`} style={{ color: s.primary, fontFamily: "'Jost', sans-serif", fontWeight: 700 }}>
            {tile.value}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-[1px]">
            {tile.suit === 'dot' && Array.from({ length: Math.min(tile.value, 4) }).map((_, i) => (
              <FourPointStar key={i} color={i % 2 === 0 ? s.primary : s.accent} size={starSize} />
            ))}
            {tile.suit === 'crak' && Array.from({ length: Math.min(tile.value, 3) }).map((_, i) => (
              <svg key={i} width={starSize} height={starSize} viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" fill={s.primary} />
                <circle cx="10" cy="10" r="4" fill="white" />
              </svg>
            ))}
          </div>
          <span className={`${labelSize} tracking-[0.15em] uppercase`} style={{ color: s.primary, fontFamily: "'Jost', sans-serif", fontWeight: 600 }}>
            {s.label}
          </span>
        </div>
      );
    }

    case 'wind': {
      // Use Figma-designed Wind components
      const windComponents: Record<string, React.FC> = {
        north: NorthWind,
        south: SouthWind,
        east: EastWind,
        west: WestWind,
      };
      const WindComponent = windComponents[tile.direction];
      if (WindComponent) {
        return <WindComponent />;
      }

      const windColors: Record<string, string> = {
        north: '#B5704F',
        east: '#1B2A4A',
        west: '#2D6A4F',
        south: '#B5704F',
      };
      const color = windColors[tile.direction];
      const letter = tile.direction[0].toUpperCase();
      const fullName = tile.direction.toUpperCase();

      return (
        <div className="flex flex-col items-center justify-center h-full gap-0.5">
          <Starburst color="#1B2A4A" size={starSize} />
          <span className={`${numSize}`} style={{ color, fontFamily: "'Jost', sans-serif", fontWeight: 800 }}>
            {letter}
          </span>
          <span className={`${labelSize} tracking-[0.1em]`} style={{ color, fontFamily: "'Jost', sans-serif", fontWeight: 600 }}>
            {fullName}
          </span>
        </div>
      );
    }

    case 'dragon': {
      // Use Figma-designed SVG for green dragon
      if (tile.color === 'green') {
        return <GreenDragon />;
      }

      // Use Figma-designed SVG for red dragon
      if (tile.color === 'red') {
        return <RedDragon />;
      }

      // Use Figma-designed SVG for soap dragon
      if (tile.color === 'soap') {
        return <SoapDragon />;
      }

      const dragonColors: Record<string, { primary: string; accent: string }> = {
        red: { primary: '#C4453E', accent: '#E8A090' },
        green: { primary: '#2D6A4F', accent: '#8BB59E' },
        soap: { primary: '#8B9D83', accent: '#C5CFBF' },
      };
      const d = dragonColors[tile.color];
      const iconSize = isSmall ? 22 : isMed ? 30 : 40;
      const labelSize = isSmall ? 'text-[5px]' : isMed ? 'text-[7px]' : 'text-[8px]';

      return (
        <div className="flex flex-col items-center justify-center h-full gap-0.5 px-0.5">
          <DragonIcon color={tile.color} size={iconSize} primary={d.primary} accent={d.accent} />
          <span className={`${labelSize} tracking-[0.15em] uppercase`}
            style={{ color: d.primary, fontFamily: "'Jost', sans-serif", fontWeight: 700 }}>
            {tile.color === 'soap' ? 'SOAP' : tile.color.toUpperCase()}
          </span>
        </div>
      );
    }

    case 'special': {
      if (tile.specialType === 'joker') {
        // Use Figma-designed Joker components (10 unique designs, cycling for 11+)
        const jokerIndex = tile.number % jokerComponents.length;
        const JokerComponent = jokerComponents[jokerIndex];
        return <JokerComponent />;
      }

      if (tile.specialType === 'flower') {
        // Use Figma-designed Flower components (8 unique designs, cycling for 9+)
        const flowerIndex = tile.number % flowerComponents.length;
        const FlowerComponent = flowerComponents[flowerIndex];
        return <FlowerComponent />;
      }

      // Blank tile
      return (
        <div className="flex items-center justify-center h-full">
          <div className="border border-[#E8DFD0] rounded-sm" style={{
            width: isSmall ? 16 : isMed ? 24 : 32,
            height: isSmall ? 22 : isMed ? 32 : 42
          }} />
        </div>
      );
    }
  }
}

function getTileName(tile: TileType): string {
  switch (tile.type) {
    case 'suited':
      return `${tile.value} ${tile.suit.charAt(0).toUpperCase() + tile.suit.slice(1)}`;
    case 'wind':
      return `${tile.direction.charAt(0).toUpperCase() + tile.direction.slice(1)} Wind`;
    case 'dragon':
      return `${tile.color.charAt(0).toUpperCase() + tile.color.slice(1)} Dragon`;
    case 'special':
      if (tile.specialType === 'joker') return `Joker`;
      if (tile.specialType === 'flower') return `Flower`;
      return 'Blank';
  }
}

export function TileComponent({
  tile,
  faceDown = false,
  size = 'md',
  selected = false,
  selectedColor,
  onClick,
  interactive = false,
  horizontal = false,
  className = '',
}: TileProps) {
  const isInteractive = !!onClick || interactive;
  const ringColor = selectedColor || '#2D6A4F';
  const dims = sizeMap[size];
  const w = horizontal ? dims.h : dims.w;
  const h = horizontal ? dims.w : dims.h;

  if (faceDown) {
    return (
      <div
        className={`rounded-sm shadow-sm relative overflow-hidden ${className}`}
        style={{
          width: w,
          height: h,
          minWidth: w,
        }}
      >
        <div style={{ transform: horizontal ? 'rotate(-90deg) scale(1)' : 'none', transformOrigin: 'center center', width: horizontal ? h : w, height: horizontal ? w : h, position: horizontal ? 'absolute' : 'relative', top: horizontal ? '50%' : undefined, left: horizontal ? '50%' : undefined, marginTop: horizontal ? -(w / 2) : undefined, marginLeft: horizontal ? -(h / 2) : undefined }}>
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 86.3896 115.186">
            <path d={tileBackPaths.p15faec00} fill="#AF6B4F" />
            <path d={tileBackPaths.p2c4440f0} fill="#17183C" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`
        rounded-sm border shadow-sm relative group/tile
        ${isInteractive ? 'cursor-pointer hover:shadow-md active:shadow-inner transition-all' : ''}
        ${selected ? 'shadow-lg' : ''}
        ${className}
      `}
      style={{
        width: w,
        height: h,
        minWidth: w,
        background: '#FFFDF7',
        borderColor: selected ? ringColor : 'rgba(27, 42, 74, 0.15)',
        boxShadow: selected
          ? `0 0 0 2.5px ${ringColor}, 0 6px 16px rgba(0,0,0,0.25)`
          : undefined,
        marginBottom: selected ? 14 : 0,
        transition: 'margin-bottom 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
      }}
    >
      <div className="size-full overflow-hidden">
        {renderTileFace(tile, size)}
      </div>
      {/* Hover tooltip */}
      <div
        className="absolute inset-0 flex items-center justify-center rounded bg-[#1B2A4A]/85 text-white opacity-0 pointer-events-none group-hover/tile:opacity-100 transition-opacity"
        style={{ fontFamily: "'Jost', sans-serif", fontSize: size === 'sm' ? 9 : size === 'md' ? 10 : 11, lineHeight: 1.2 }}
      >
        <span className="px-0.5 text-center break-words hyphens-auto leading-tight" style={{ maxWidth: '100%', wordBreak: 'break-word' }}>{getTileName(tile)}</span>
      </div>
    </div>
  );
}

export function TileBack({ size = 'md', horizontal = false, className = '' }: { size?: 'sm' | 'md' | 'lg'; horizontal?: boolean; className?: string }) {
  const dims = sizeMap[size];
  const w = horizontal ? dims.h : dims.w;
  const h = horizontal ? dims.w : dims.h;

  return (
    <div
      className={`rounded-sm shadow-sm relative overflow-hidden ${className}`}
      style={{
        width: w,
        height: h,
        minWidth: w,
      }}
    >
      <div style={{ transform: horizontal ? 'rotate(-90deg) scale(1)' : 'none', transformOrigin: 'center center', width: horizontal ? h : w, height: horizontal ? w : h, position: horizontal ? 'absolute' : 'relative', top: horizontal ? '50%' : undefined, left: horizontal ? '50%' : undefined, marginTop: horizontal ? -(w / 2) : undefined, marginLeft: horizontal ? -(h / 2) : undefined }}>
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 86.3896 115.186">
          <path d={tileBackPaths.p15faec00} fill="#AF6B4F" />
          <path d={tileBackPaths.p2c4440f0} fill="#17183C" />
        </svg>
      </div>
    </div>
  );
}