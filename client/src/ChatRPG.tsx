import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';

// =============================================================================
// CHATRPG ENHANCED - Early 2000s Runescape-inspired game with chat integration
// =============================================================================

// --- Type Definitions ---
type CharacterAppearance = {
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  outfit: number;
  outfitColor: number;
};

type ChatBubble = {
  text: string;
  timestamp: number;
};

type Character = {
  id: string;
  username: string;
  x: number;
  y: number;
  appearance: CharacterAppearance;
  stats: CharacterStats;
  level: number;
  xp: number;
  gold: number;
  lastAction?: string;
  isMoving?: boolean;
  direction: 'up' | 'down' | 'left' | 'right';
  isAdmin?: boolean;
  chatBubble?: ChatBubble;
};

type CharacterStats = {
  attack: number;
  defense: number;
  mining: number;
  fishing: number;
  woodcutting: number;
  crafting: number;
  cooking: number;
};

type TileType = 'grass' | 'water' | 'rock' | 'tree' | 'ore' | 'fish' | 'sand' | 'path' | 'building' | 'flower' | 'bush' | 'fence';

type WorldTile = {
  type: TileType;
  walkable: boolean;
  interactable?: boolean;
  resource?: string;
  variant?: number;
};

type GameMessage = {
  id: string;
  text: string;
  type: 'system' | 'action' | 'chat' | 'loot' | 'levelup';
  timestamp: number;
  username?: string;
};

// --- Enhanced Constants for larger view ---
const TILE_SIZE = 48; // Larger tiles for better visuals
const MAP_WIDTH = 40; // Larger map
const MAP_HEIGHT = 30;
const VIEW_WIDTH = 16; // More visible area
const VIEW_HEIGHT = 12;

// Runescape-inspired color palette
const SKIN_TONES = ['#FFDBB4', '#E5AC69', '#C68642', '#8D5524', '#5C3317'];
const HAIR_COLORS = ['#090806', '#2C1B18', '#71635A', '#B7A69E', '#D6C4C2', '#FAF0BE', '#E8CBAB', '#DEBC99', '#B9770E', '#A55728'];
const OUTFIT_COLORS = ['#B22222', '#8B0000', '#00008B', '#191970', '#006400', '#228B22', '#4B0082', '#663399', '#FF8C00', '#DAA520'];

// Runescape-style grass color variations
const GRASS_COLORS = ['#228B22', '#2E8B57', '#3CB371', '#32CD32', '#228B22'];
const WATER_COLORS = ['#1E90FF', '#4169E1', '#0000CD'];

// World map generator with more variety
const generateWorld = (): WorldTile[][] => {
  const world: WorldTile[][] = [];
  
  // Pre-generate some random values for consistency
  const treePositions: Set<string> = new Set();
  const rockPositions: Set<string> = new Set();
  const flowerPositions: Set<string> = new Set();
  
  // Generate random positions
  for (let i = 0; i < 80; i++) {
    const x = Math.floor(Math.random() * MAP_WIDTH);
    const y = Math.floor(Math.random() * MAP_HEIGHT);
    if (Math.random() > 0.5) {
      treePositions.add(`${x},${y}`);
    } else {
      rockPositions.add(`${x},${y}`);
    }
  }
  
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(Math.random() * MAP_WIDTH);
    const y = Math.floor(Math.random() * MAP_HEIGHT);
    flowerPositions.add(`${x},${y}`);
  }
  
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      const key = `${x},${y}`;
      let tile: WorldTile = { type: 'grass', walkable: true, variant: Math.floor(Math.random() * 5) };
      
      // River running through the map
      if ((x >= 5 && x <= 7 && y < 15) || (y >= 13 && y <= 15 && x <= 15) || (x >= 13 && x <= 15 && y >= 13)) {
        tile = { type: 'water', walkable: false, variant: Math.floor(Math.random() * 3) };
      }
      // Fishing spots
      else if ((x === 8 && y >= 5 && y <= 12) || (y === 16 && x >= 8 && x <= 12)) {
        tile = { type: 'fish', walkable: false, interactable: true, resource: 'fish', variant: 0 };
      }
      // Mountain/mining area (top right)
      else if (x > 28 && y < 10) {
        if (rockPositions.has(key) || Math.random() > 0.7) {
          tile = { type: 'ore', walkable: false, interactable: true, resource: 'ore', variant: Math.floor(Math.random() * 3) };
        } else {
          tile = { type: 'rock', walkable: false, variant: Math.floor(Math.random() * 3) };
        }
      }
      // Forest area (bottom left)
      else if (x < 12 && y > 18) {
        if (treePositions.has(key) || Math.random() > 0.5) {
          tile = { type: 'tree', walkable: false, interactable: true, resource: 'wood', variant: Math.floor(Math.random() * 4) };
        }
      }
      // Town center with paths
      else if (x >= 18 && x <= 24 && y >= 12 && y <= 18) {
        if ((x === 18 || x === 24) && (y === 12 || y === 18)) {
          tile = { type: 'fence', walkable: false, variant: 0 };
        } else if (x === 21 && (y === 15 || y === 16)) {
          tile = { type: 'path', walkable: true, variant: 0 };
        } else if ((x === 19 || x === 23) && (y === 13 || y === 17)) {
          tile = { type: 'building', walkable: false, variant: Math.floor(Math.random() * 2) };
        } else if (x >= 19 && x <= 23 && y >= 13 && y <= 17) {
          tile = { type: 'path', walkable: true, variant: 1 };
        }
      }
      // Main paths
      else if ((y === 15 && x >= 10 && x <= 35) || (x === 21 && y >= 5 && y <= 25)) {
        tile = { type: 'path', walkable: true, variant: x % 2 };
      }
      // Sand beach near water
      else if ((x >= 3 && x <= 4 && y < 15) || (y >= 10 && y <= 12 && x <= 7)) {
        tile = { type: 'sand', walkable: true, variant: Math.floor(Math.random() * 2) };
      }
      // Scattered decorations
      else if (flowerPositions.has(key) && tile.walkable) {
        tile = { type: 'flower', walkable: true, variant: Math.floor(Math.random() * 4) };
      }
      else if (treePositions.has(key) && tile.walkable && Math.random() > 0.7) {
        if (Math.random() > 0.5) {
          tile = { type: 'tree', walkable: false, interactable: true, resource: 'wood', variant: Math.floor(Math.random() * 4) };
        } else {
          tile = { type: 'bush', walkable: false, variant: Math.floor(Math.random() * 2) };
        }
      }
      
      row.push(tile);
    }
    world.push(row);
  }
  
  return world;
};

// --- Components ---

type CharacterCreatorProps = {
  username: string;
  isAdmin: boolean;
  onComplete: (appearance: CharacterAppearance) => void;
};

const CharacterCreator: React.FC<CharacterCreatorProps> = ({ username, isAdmin, onComplete }) => {
  const [appearance, setAppearance] = useState<CharacterAppearance>({
    skinTone: 0,
    hairStyle: 0,
    hairColor: 0,
    outfit: 0,
    outfitColor: 0,
  });

  const hairStyles = ['Short', 'Long', 'Spiky', 'Bald', 'Ponytail', 'Mohawk', 'Curly', 'Braided'];
  const outfits = ['Warrior', 'Mage', 'Ranger', 'Merchant', 'Peasant', 'Noble', 'Knight', 'Rogue'];

  return (
    <div className="bg-gradient-to-b from-amber-900/80 to-amber-950/90 border-4 border-amber-600 rounded-lg p-6 w-full max-w-lg shadow-2xl" 
         style={{ fontFamily: "'Times New Roman', serif" }}>
      <div className="text-center mb-4">
        <h3 className="text-2xl font-bold text-amber-200 drop-shadow-lg" style={{ textShadow: '2px 2px 4px #000' }}>
          ⚔️ Create Your Character ⚔️
        </h3>
        {isAdmin && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded mt-1">
            👑 Admin
          </span>
        )}
      </div>
      <p className="text-amber-100/80 text-sm text-center mb-4">
        Welcome, <span className="font-bold text-amber-200">{username}</span>! Design your avatar.
      </p>

      {/* Preview */}
      <div className="flex justify-center mb-4">
        <div 
          className="w-28 h-36 rounded border-4 border-amber-500 flex items-center justify-center bg-gradient-to-b from-green-800 to-green-900"
          style={{ boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)' }}
        >
          <RunescapeCharacter appearance={appearance} size={80} direction="down" isAdmin={isAdmin} />
        </div>
      </div>

      {/* Skin Tone */}
      <div className="mb-4">
        <label className="text-sm text-amber-200 mb-2 block font-bold">Skin Tone</label>
        <div className="flex gap-2 justify-center">
          {SKIN_TONES.map((color, i) => (
            <button
              key={i}
              onClick={() => setAppearance({ ...appearance, skinTone: i })}
              className={`w-10 h-10 rounded-full border-4 transition-all ${appearance.skinTone === i ? 'border-amber-300 scale-110' : 'border-amber-800 hover:border-amber-500'}`}
              style={{ backgroundColor: color, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            />
          ))}
        </div>
      </div>

      {/* Hair Style */}
      <div className="mb-4">
        <label className="text-sm text-amber-200 mb-2 block font-bold">Hair Style</label>
        <select
          value={appearance.hairStyle}
          onChange={(e) => setAppearance({ ...appearance, hairStyle: parseInt(e.target.value) })}
          className="w-full bg-amber-900 border-2 border-amber-600 rounded px-3 py-2 text-amber-100"
          style={{ fontFamily: "'Times New Roman', serif" }}
        >
          {hairStyles.map((style, i) => (
            <option key={i} value={i}>{style}</option>
          ))}
        </select>
      </div>

      {/* Hair Color */}
      <div className="mb-4">
        <label className="text-sm text-amber-200 mb-2 block font-bold">Hair Color</label>
        <div className="flex gap-2 flex-wrap justify-center">
          {HAIR_COLORS.map((color, i) => (
            <button
              key={i}
              onClick={() => setAppearance({ ...appearance, hairColor: i })}
              className={`w-7 h-7 rounded-full border-3 transition-all ${appearance.hairColor === i ? 'border-amber-300 scale-110' : 'border-amber-800 hover:border-amber-500'}`}
              style={{ backgroundColor: color, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            />
          ))}
        </div>
      </div>

      {/* Outfit */}
      <div className="mb-4">
        <label className="text-sm text-amber-200 mb-2 block font-bold">Class</label>
        <select
          value={appearance.outfit}
          onChange={(e) => setAppearance({ ...appearance, outfit: parseInt(e.target.value) })}
          className="w-full bg-amber-900 border-2 border-amber-600 rounded px-3 py-2 text-amber-100"
          style={{ fontFamily: "'Times New Roman', serif" }}
        >
          {outfits.map((outfit, i) => (
            <option key={i} value={i}>{outfit}</option>
          ))}
        </select>
      </div>

      {/* Outfit Color */}
      <div className="mb-4">
        <label className="text-sm text-amber-200 mb-2 block font-bold">Outfit Color</label>
        <div className="flex gap-2 flex-wrap justify-center">
          {OUTFIT_COLORS.map((color, i) => (
            <button
              key={i}
              onClick={() => setAppearance({ ...appearance, outfitColor: i })}
              className={`w-7 h-7 rounded-full border-3 transition-all ${appearance.outfitColor === i ? 'border-amber-300 scale-110' : 'border-amber-800 hover:border-amber-500'}`}
              style={{ backgroundColor: color, boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            />
          ))}
        </div>
      </div>

      <button
        onClick={() => onComplete(appearance)}
        className="w-full py-3 bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 rounded border-2 border-amber-300 font-bold text-amber-900 text-lg transition-all"
        style={{ fontFamily: "'Times New Roman', serif", textShadow: '1px 1px 2px rgba(255,255,255,0.3)' }}
      >
        ⚔️ Enter The Realm ⚔️
      </button>
    </div>
  );
};

type RunescapeCharacterProps = {
  appearance: CharacterAppearance;
  size: number;
  direction: 'up' | 'down' | 'left' | 'right';
  isMoving?: boolean;
  isAdmin?: boolean;
  chatBubble?: ChatBubble;
  username?: string;
  showName?: boolean;
};

// Enhanced Runescape-style character sprite
const RunescapeCharacter: React.FC<RunescapeCharacterProps> = ({ 
  appearance, size, direction, isMoving, isAdmin, chatBubble, username, showName = false 
}) => {
  const skinColor = SKIN_TONES[appearance.skinTone] || SKIN_TONES[0];
  const hairColor = HAIR_COLORS[appearance.hairColor] || HAIR_COLORS[0];
  const outfitColor = OUTFIT_COLORS[appearance.outfitColor] || OUTFIT_COLORS[0];
  
  // Calculate sprite dimensions
  const bodyWidth = size * 0.5;
  const bodyHeight = size * 0.4;
  const headSize = size * 0.32;
  const legWidth = size * 0.15;
  const legHeight = size * 0.2;
  const armWidth = size * 0.12;
  const armHeight = size * 0.25;

  // Animation offset for walking
  const legOffset = isMoving ? Math.sin(Date.now() / 100) * 3 : 0;
  
  // Determine if chat bubble should show (within last 5 seconds)
  const showBubble = chatBubble && (Date.now() - chatBubble.timestamp < 5000);
  
  return (
    <div className="relative" style={{ width: size, height: size + (showName ? 20 : 0) + (showBubble ? 40 : 0) }}>
      {/* Chat Bubble */}
      {showBubble && chatBubble && (
        <div 
          className="absolute left-1/2 -translate-x-1/2 bg-white text-black text-xs px-2 py-1 rounded-lg shadow-lg max-w-[150px] text-center z-10"
          style={{ 
            top: -35,
            borderRadius: '12px 12px 12px 4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          <div className="truncate">{chatBubble.text.substring(0, 30)}{chatBubble.text.length > 30 ? '...' : ''}</div>
          <div 
            className="absolute w-3 h-3 bg-white"
            style={{
              bottom: -5,
              left: '30%',
              transform: 'rotate(45deg)',
            }}
          />
        </div>
      )}
      
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={isMoving ? 'animate-bounce-subtle' : ''}>
        {/* Shadow */}
        <ellipse 
          cx={size/2} 
          cy={size - 6} 
          rx={size * 0.28} 
          ry={size * 0.1} 
          fill="rgba(0,0,0,0.4)"
        />
        
        {/* Legs with walking animation */}
        <rect 
          x={size * 0.32 + legOffset} 
          y={size * 0.72}
          width={legWidth}
          height={legHeight}
          fill={outfitColor}
          rx={2}
          style={{ filter: 'brightness(0.7)' }}
        />
        <rect 
          x={size * 0.55 - legOffset} 
          y={size * 0.72}
          width={legWidth}
          height={legHeight}
          fill={outfitColor}
          rx={2}
          style={{ filter: 'brightness(0.7)' }}
        />
        
        {/* Boots */}
        <rect 
          x={size * 0.30 + legOffset} 
          y={size * 0.87}
          width={legWidth + 4}
          height={size * 0.08}
          fill="#3D2817"
          rx={2}
        />
        <rect 
          x={size * 0.53 - legOffset} 
          y={size * 0.87}
          width={legWidth + 4}
          height={size * 0.08}
          fill="#3D2817"
          rx={2}
        />
        
        {/* Body/Torso */}
        <rect 
          x={(size - bodyWidth) / 2} 
          y={size * 0.42}
          width={bodyWidth}
          height={bodyHeight}
          fill={outfitColor}
          rx={3}
        />
        {/* Belt */}
        <rect 
          x={(size - bodyWidth) / 2} 
          y={size * 0.68}
          width={bodyWidth}
          height={size * 0.05}
          fill="#5D4037"
        />
        <rect 
          x={size * 0.47} 
          y={size * 0.67}
          width={size * 0.06}
          height={size * 0.07}
          fill="#FFD700"
          rx={1}
        />
        
        {/* Arms */}
        <rect 
          x={size * 0.22} 
          y={size * 0.45}
          width={armWidth}
          height={armHeight}
          fill={outfitColor}
          rx={2}
          style={{ filter: 'brightness(0.85)' }}
          transform={isMoving ? `rotate(${legOffset * 2}, ${size * 0.28}, ${size * 0.45})` : ''}
        />
        <rect 
          x={size * 0.66} 
          y={size * 0.45}
          width={armWidth}
          height={armHeight}
          fill={outfitColor}
          rx={2}
          style={{ filter: 'brightness(0.85)' }}
          transform={isMoving ? `rotate(${-legOffset * 2}, ${size * 0.72}, ${size * 0.45})` : ''}
        />
        {/* Hands */}
        <circle cx={size * 0.28} cy={size * 0.70} r={size * 0.05} fill={skinColor} />
        <circle cx={size * 0.72} cy={size * 0.70} r={size * 0.05} fill={skinColor} />
        
        {/* Head */}
        <circle 
          cx={size/2} 
          cy={size * 0.30}
          r={headSize / 2}
          fill={skinColor}
          stroke="#00000030"
          strokeWidth="1"
        />
        
        {/* Hair based on style */}
        {appearance.hairStyle !== 3 && ( // Not bald
          <>
            {appearance.hairStyle === 0 && ( // Short
              <path 
                d={`M ${size * 0.32} ${size * 0.24} 
                    Q ${size * 0.32} ${size * 0.12} ${size/2} ${size * 0.10} 
                    Q ${size * 0.68} ${size * 0.12} ${size * 0.68} ${size * 0.24}`}
                fill={hairColor}
              />
            )}
            {appearance.hairStyle === 1 && ( // Long
              <path 
                d={`M ${size * 0.28} ${size * 0.45} 
                    Q ${size * 0.25} ${size * 0.12} ${size/2} ${size * 0.08} 
                    Q ${size * 0.75} ${size * 0.12} ${size * 0.72} ${size * 0.45}`}
                fill={hairColor}
              />
            )}
            {appearance.hairStyle === 2 && ( // Spiky
              <>
                <polygon 
                  points={`${size * 0.35},${size * 0.18} ${size * 0.40},${size * 0.05} ${size * 0.45},${size * 0.18}`}
                  fill={hairColor}
                />
                <polygon 
                  points={`${size * 0.45},${size * 0.16} ${size * 0.50},${size * 0.02} ${size * 0.55},${size * 0.16}`}
                  fill={hairColor}
                />
                <polygon 
                  points={`${size * 0.55},${size * 0.18} ${size * 0.60},${size * 0.05} ${size * 0.65},${size * 0.18}`}
                  fill={hairColor}
                />
              </>
            )}
            {appearance.hairStyle >= 4 && ( // Ponytail and others
              <ellipse 
                cx={size/2} 
                cy={size * 0.16}
                rx={size * 0.18}
                ry={size * 0.10}
                fill={hairColor}
              />
            )}
          </>
        )}
        
        {/* Face features */}
        {direction !== 'up' && (
          <>
            {/* Eyes */}
            <ellipse cx={size * 0.42} cy={size * 0.28} rx={size * 0.04} ry={size * 0.035} fill="white" />
            <ellipse cx={size * 0.58} cy={size * 0.28} rx={size * 0.04} ry={size * 0.035} fill="white" />
            <circle cx={size * 0.43} cy={size * 0.28} r={size * 0.025} fill="#1C1C1C" />
            <circle cx={size * 0.59} cy={size * 0.28} r={size * 0.025} fill="#1C1C1C" />
            {/* Eye shine */}
            <circle cx={size * 0.44} cy={size * 0.27} r={size * 0.01} fill="white" />
            <circle cx={size * 0.60} cy={size * 0.27} r={size * 0.01} fill="white" />
            
            {/* Nose */}
            <ellipse cx={size/2} cy={size * 0.33} rx={size * 0.02} ry={size * 0.015} fill={skinColor} style={{ filter: 'brightness(0.9)' }} />
            
            {/* Mouth */}
            <path 
              d={`M ${size * 0.44} ${size * 0.37} Q ${size/2} ${size * 0.40} ${size * 0.56} ${size * 0.37}`}
              fill="none"
              stroke="#8B4513"
              strokeWidth="1.5"
            />
          </>
        )}
        
        {/* Admin Crown */}
        {isAdmin && (
          <g transform={`translate(${size * 0.35}, ${size * 0.02})`}>
            <polygon 
              points={`0,${size * 0.08} ${size * 0.05},0 ${size * 0.10},${size * 0.06} ${size * 0.15},0 ${size * 0.20},${size * 0.06} ${size * 0.25},0 ${size * 0.30},${size * 0.08} ${size * 0.30},${size * 0.12} 0,${size * 0.12}`}
              fill="#FFD700"
              stroke="#B8860B"
              strokeWidth="1"
            />
            {/* Crown gems */}
            <circle cx={size * 0.05} cy={size * 0.03} r={2} fill="#FF0000" />
            <circle cx={size * 0.15} cy={size * 0.02} r={2} fill="#00FF00" />
            <circle cx={size * 0.25} cy={size * 0.03} r={2} fill="#0000FF" />
          </g>
        )}
      </svg>
      
      {/* Username with Admin Badge */}
      {showName && username && (
        <div className="text-center mt-1">
          <div 
            className={`text-xs px-1 py-0.5 rounded inline-flex items-center gap-1 ${
              isAdmin 
                ? 'bg-gradient-to-r from-blue-600 to-blue-800 text-yellow-200 font-bold' 
                : 'bg-black/60 text-white'
            }`}
            style={{ 
              fontFamily: "'Times New Roman', serif",
              textShadow: '1px 1px 1px #000'
            }}
          >
            {isAdmin && <span>👑</span>}
            <span className="truncate max-w-[80px]">{username}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Style for subtle bounce animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes bounce-subtle {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  .animate-bounce-subtle {
    animation: bounce-subtle 0.3s ease-in-out infinite;
  }
`;
if (typeof document !== 'undefined' && !document.querySelector('[data-chatrpg-styles]')) {
  styleSheet.setAttribute('data-chatrpg-styles', 'true');
  document.head.appendChild(styleSheet);
}

// Enhanced Game Canvas with Runescape-style graphics
type GameCanvasProps = {
  world: WorldTile[][];
  character: Character;
  otherPlayers: Character[];
  cameraX: number;
  cameraY: number;
  onTileClick: (x: number, y: number) => void;
};

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  world, 
  character, 
  otherPlayers, 
  cameraX, 
  cameraY,
  onTileClick 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Runescape-inspired tile rendering
  const drawTile = (ctx: CanvasRenderingContext2D, tile: WorldTile, screenX: number, screenY: number) => {
    const variant = tile.variant || 0;
    
    switch(tile.type) {
      case 'grass':
        ctx.fillStyle = GRASS_COLORS[variant % GRASS_COLORS.length];
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Add grass detail
        if (Math.random() > 0.8) {
          ctx.fillStyle = '#1B7B1B';
          ctx.fillRect(screenX + 10, screenY + 15, 2, 8);
          ctx.fillRect(screenX + 25, screenY + 20, 2, 6);
        }
        break;
        
      case 'water':
        ctx.fillStyle = WATER_COLORS[variant % WATER_COLORS.length];
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Water ripples
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2, 8 + (variant * 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2, 4 + (variant * 2), 0, Math.PI * 2);
        ctx.stroke();
        break;
        
      case 'tree':
        // Ground
        ctx.fillStyle = '#228B22';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Tree trunk
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(screenX + TILE_SIZE/2 - 5, screenY + TILE_SIZE * 0.5, 10, TILE_SIZE * 0.5);
        // Tree shadow on ground
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(screenX + TILE_SIZE/2, screenY + TILE_SIZE * 0.95, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tree foliage (Runescape-style layered circles)
        const treeColors = ['#006400', '#228B22', '#32CD32', '#228B22'];
        treeColors.forEach((color, i) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(
            screenX + TILE_SIZE/2 + (i % 2 === 0 ? -5 : 5), 
            screenY + TILE_SIZE * 0.3 + (i * 5), 
            12 - i * 2, 
            0, 
            Math.PI * 2
          );
          ctx.fill();
        });
        break;
        
      case 'rock':
        ctx.fillStyle = '#228B22';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Rock
        ctx.fillStyle = '#696969';
        ctx.beginPath();
        ctx.moveTo(screenX + 8, screenY + TILE_SIZE - 5);
        ctx.lineTo(screenX + 15, screenY + 10);
        ctx.lineTo(screenX + TILE_SIZE - 10, screenY + 8);
        ctx.lineTo(screenX + TILE_SIZE - 5, screenY + TILE_SIZE - 8);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#808080';
        ctx.beginPath();
        ctx.moveTo(screenX + 15, screenY + 10);
        ctx.lineTo(screenX + 20, screenY + 5);
        ctx.lineTo(screenX + TILE_SIZE - 10, screenY + 8);
        ctx.closePath();
        ctx.fill();
        break;
        
      case 'ore':
        ctx.fillStyle = '#228B22';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Ore rock
        ctx.fillStyle = '#4A4A4A';
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2, 16, 0, Math.PI * 2);
        ctx.fill();
        // Ore sparkles
        const oreColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        const oreColor = oreColors[variant % 3];
        ctx.fillStyle = oreColor;
        ctx.fillRect(screenX + 12, screenY + 15, 6, 6);
        ctx.fillRect(screenX + 28, screenY + 22, 5, 5);
        ctx.fillRect(screenX + 20, screenY + 30, 4, 4);
        // Sparkle effect
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(screenX + 14, screenY + 17, 2, 2);
        break;
        
      case 'fish':
        ctx.fillStyle = '#1E90FF';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Ripples
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2, 6, 0, Math.PI * 2);
        ctx.stroke();
        // Fish icon
        ctx.fillStyle = '#87CEEB';
        ctx.beginPath();
        ctx.ellipse(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2, 8, 5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'sand':
        ctx.fillStyle = '#F4D03F';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#E6C34F';
        ctx.fillRect(screenX + 5, screenY + 5, 4, 4);
        ctx.fillRect(screenX + 20, screenY + 25, 3, 3);
        ctx.fillRect(screenX + 35, screenY + 10, 5, 5);
        break;
        
      case 'path':
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Path texture
        ctx.fillStyle = '#A0896C';
        ctx.fillRect(screenX + 2, screenY + 10, 8, 6);
        ctx.fillRect(screenX + 30, screenY + 25, 10, 8);
        ctx.fillRect(screenX + 15, screenY + 38, 6, 5);
        // Path border
        ctx.strokeStyle = '#6B5344';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenX + 1, screenY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        break;
        
      case 'building':
        ctx.fillStyle = '#8B7355';
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Building wall
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(screenX + 4, screenY + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        // Roof
        ctx.fillStyle = '#D35400';
        ctx.beginPath();
        ctx.moveTo(screenX + TILE_SIZE/2, screenY);
        ctx.lineTo(screenX + TILE_SIZE - 2, screenY + 15);
        ctx.lineTo(screenX + 2, screenY + 15);
        ctx.closePath();
        ctx.fill();
        // Door
        ctx.fillStyle = '#3E2723';
        ctx.fillRect(screenX + TILE_SIZE/2 - 6, screenY + 25, 12, 18);
        break;
        
      case 'flower':
        ctx.fillStyle = GRASS_COLORS[0];
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Flower stem
        ctx.fillStyle = '#228B22';
        ctx.fillRect(screenX + TILE_SIZE/2 - 1, screenY + 20, 2, 15);
        // Flower petals
        const flowerColors = ['#FF6B6B', '#FFE66D', '#C792EA', '#89CFF0'];
        ctx.fillStyle = flowerColors[variant % 4];
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + 18, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + 18, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'bush':
        ctx.fillStyle = GRASS_COLORS[0];
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Bush
        ctx.fillStyle = '#2D5016';
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2, screenY + TILE_SIZE/2 + 5, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3D6B22';
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2 - 5, screenY + TILE_SIZE/2, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(screenX + TILE_SIZE/2 + 5, screenY + TILE_SIZE/2, 10, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'fence':
        ctx.fillStyle = GRASS_COLORS[0];
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
        // Fence posts
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(screenX + 5, screenY + 10, 8, 30);
        ctx.fillRect(screenX + 35, screenY + 10, 8, 30);
        // Fence rails
        ctx.fillRect(screenX, screenY + 15, TILE_SIZE, 5);
        ctx.fillRect(screenX, screenY + 30, TILE_SIZE, 5);
        break;
        
      default:
        ctx.fillStyle = GRASS_COLORS[0];
        ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
    }
    
    // Subtle grid overlay
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with dark background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw visible tiles
    for (let dy = -1; dy <= VIEW_HEIGHT + 1; dy++) {
      for (let dx = -1; dx <= VIEW_WIDTH + 1; dx++) {
        const worldX = Math.floor(cameraX) + dx;
        const worldY = Math.floor(cameraY) + dy;
        
        if (worldX >= 0 && worldX < MAP_WIDTH && worldY >= 0 && worldY < MAP_HEIGHT) {
          const tile = world[worldY][worldX];
          const screenX = (dx - (cameraX % 1)) * TILE_SIZE;
          const screenY = (dy - (cameraY % 1)) * TILE_SIZE;
          
          drawTile(ctx, tile, screenX, screenY);
        }
      }
    }
  }, [world, cameraX, cameraY]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const tileX = Math.floor(cameraX + clickX / TILE_SIZE);
    const tileY = Math.floor(cameraY + clickY / TILE_SIZE);
    
    onTileClick(tileX, tileY);
  };

  return (
    <div className="relative" style={{ width: VIEW_WIDTH * TILE_SIZE, height: VIEW_HEIGHT * TILE_SIZE }}>
      <canvas
        ref={canvasRef}
        width={VIEW_WIDTH * TILE_SIZE}
        height={VIEW_HEIGHT * TILE_SIZE}
        onClick={handleClick}
        className="cursor-pointer rounded-lg border-4 border-amber-700"
        style={{ 
          imageRendering: 'pixelated',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.3)'
        }}
      />
      
      {/* Render player characters on top of canvas */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Other players */}
        {otherPlayers.map(player => {
          const screenX = (player.x - cameraX) * TILE_SIZE;
          const screenY = (player.y - cameraY) * TILE_SIZE;
          if (screenX < -TILE_SIZE || screenX > VIEW_WIDTH * TILE_SIZE || 
              screenY < -TILE_SIZE || screenY > VIEW_HEIGHT * TILE_SIZE) return null;
          
          return (
            <div
              key={player.id}
              className="absolute transition-all duration-150"
              style={{ 
                left: screenX - 8, 
                top: screenY - 30,
              }}
            >
              <RunescapeCharacter 
                appearance={player.appearance} 
                size={TILE_SIZE + 16} 
                direction={player.direction}
                isMoving={player.isMoving}
                isAdmin={player.isAdmin}
                chatBubble={player.chatBubble}
                username={player.username}
                showName={true}
              />
            </div>
          );
        })}
        
        {/* Current player (centered) */}
        <div
          className="absolute"
          style={{ 
            left: (character.x - cameraX) * TILE_SIZE - 8,
            top: (character.y - cameraY) * TILE_SIZE - 30,
          }}
        >
          <RunescapeCharacter 
            appearance={character.appearance} 
            size={TILE_SIZE + 16} 
            direction={character.direction}
            isMoving={character.isMoving}
            isAdmin={character.isAdmin}
            chatBubble={character.chatBubble}
            username={character.username}
            showName={true}
          />
        </div>
      </div>
      
      {/* Minimap */}
      <div 
        className="absolute top-2 right-2 w-32 h-24 bg-black/70 rounded border-2 border-amber-600 overflow-hidden"
        style={{ boxShadow: '0 0 10px rgba(0,0,0,0.5)' }}
      >
        <div className="text-xs text-amber-200 text-center font-bold py-0.5 bg-amber-900/80">World Map</div>
        <div className="relative w-full h-[calc(100%-20px)]">
          {/* Player position dot */}
          <div 
            className="absolute w-2 h-2 bg-green-400 rounded-full animate-pulse"
            style={{
              left: `${(character.x / MAP_WIDTH) * 100}%`,
              top: `${(character.y / MAP_HEIGHT) * 100}%`,
            }}
          />
          {/* Other player dots */}
          {otherPlayers.map(p => (
            <div 
              key={p.id}
              className="absolute w-1.5 h-1.5 bg-blue-400 rounded-full"
              style={{
                left: `${(p.x / MAP_WIDTH) * 100}%`,
                top: `${(p.y / MAP_HEIGHT) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Enhanced Stats Bar with Runescape styling
type StatsBarProps = {
  character: Character;
};

const StatsBar: React.FC<StatsBarProps> = ({ character }) => {
  const xpForNextLevel = Math.max(character.level, 1) * 100;
  const xpProgress = (character.xp % 100);
  
  const statIcons: Record<keyof CharacterStats, string> = {
    attack: '⚔️',
    defense: '🛡️',
    mining: '⛏️',
    fishing: '🎣',
    woodcutting: '🪓',
    crafting: '🔨',
    cooking: '🍳',
  };

  return (
    <div 
      className="bg-gradient-to-b from-amber-900/90 to-amber-950/95 border-2 border-amber-600 rounded-lg p-3 text-sm"
      style={{ fontFamily: "'Times New Roman', serif" }}
    >
      {/* Level and Gold header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-700">
        <div className="flex items-center gap-2">
          <span className="text-amber-300 font-bold text-lg">Lvl {character.level}</span>
          {character.isAdmin && <span className="text-yellow-400">👑</span>}
        </div>
        <div className="flex items-center gap-1 text-yellow-400 font-bold">
          <span>💰</span>
          <span>{character.gold.toLocaleString()}</span>
        </div>
      </div>
      
      {/* XP Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1 text-amber-200">
          <span>Experience</span>
          <span>{xpProgress}/{100}</span>
        </div>
        <div className="h-3 bg-black/50 rounded-full overflow-hidden border border-amber-700">
          <div 
            className="h-full bg-gradient-to-r from-green-600 via-green-500 to-green-400 transition-all"
            style={{ width: `${xpProgress}%` }}
          />
        </div>
      </div>
      
      {/* Skills Grid */}
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        {(Object.keys(character.stats) as Array<keyof CharacterStats>).map(stat => (
          <div 
            key={stat} 
            className="flex items-center gap-1.5 bg-black/30 rounded px-2 py-1 border border-amber-800/50"
            title={`${stat.charAt(0).toUpperCase() + stat.slice(1)} Level`}
          >
            <span className="text-base">{statIcons[stat]}</span>
            <span className="text-amber-200 capitalize text-[10px]">{stat.slice(0, 4)}</span>
            <span className="text-amber-100 font-bold ml-auto">{character.stats[stat]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Game Log with Runescape styling
type GameLogProps = {
  messages: GameMessage[];
};

const GameLog: React.FC<GameLogProps> = ({ messages }) => {
  const logRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);
  
  const getMessageColor = (type: GameMessage['type']): string => {
    switch(type) {
      case 'system': return 'text-amber-400';
      case 'action': return 'text-cyan-300';
      case 'loot': return 'text-yellow-300';
      case 'levelup': return 'text-purple-300 font-bold';
      case 'chat': return 'text-white';
      default: return 'text-amber-100';
    }
  };

  return (
    <div 
      ref={logRef}
      className="h-28 overflow-y-auto bg-black/80 rounded-lg border-2 border-amber-700 p-2 text-xs"
      style={{ fontFamily: "'Times New Roman', serif" }}
    >
      {messages.map(msg => (
        <div key={msg.id} className={`${getMessageColor(msg.type)} leading-tight`}>
          {msg.username && msg.type === 'chat' && (
            <span className="text-cyan-400 font-bold">{msg.username}: </span>
          )}
          {msg.text}
        </div>
      ))}
    </div>
  );
};

// --- Main ChatRPG Component ---
type ChatRPGProps = {
  socket: Socket;
  username: string;
  userId: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  onToggleSize: () => void;
  isMinimized: boolean;
  isAdmin?: boolean;
  onGameStateChange?: (isExpanded: boolean) => void;
  chatMessages?: Array<{ user: string; text: string }>;
};

const ChatRPG: React.FC<ChatRPGProps> = ({
  socket,
  username,
  userId,
  roomName,
  isOpen,
  onClose,
  onToggleSize,
  isMinimized,
  isAdmin = false,
  onGameStateChange,
  chatMessages = [],
}) => {
  const [gameState, setGameState] = useState<'loading' | 'create' | 'playing'>('loading');
  const [world] = useState<WorldTile[][]>(() => generateWorld());
  const [character, setCharacter] = useState<Character | null>(null);
  const [otherPlayers, setOtherPlayers] = useState<Character[]>([]);
  const [messages, setMessages] = useState<GameMessage[]>([
    { id: '1', text: '⚔️ Welcome to ChatRPG! Use WASD or Arrow keys to move.', type: 'system', timestamp: Date.now() },
    { id: '2', text: '🎮 Walk near resources and press SPACE or click to gather.', type: 'system', timestamp: Date.now() },
    { id: '3', text: '💬 Your chat messages appear above your character!', type: 'system', timestamp: Date.now() },
  ]);
  const [cameraX, setCameraX] = useState(10);
  const [cameraY, setCameraY] = useState(10);
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle chat messages from the main chat
  useEffect(() => {
    if (!character || chatMessages.length === 0) return;
    
    const lastMessage = chatMessages[chatMessages.length - 1];
    if (lastMessage && lastMessage.user === username) {
      // Update character's chat bubble
      setCharacter(prev => prev ? {
        ...prev,
        chatBubble: {
          text: lastMessage.text,
          timestamp: Date.now()
        }
      } : null);
      
      // Emit to other players
      if (socket) {
        socket.emit('rpg:chat', { roomName, text: lastMessage.text });
      }
    }
  }, [chatMessages, username, character, socket, roomName]);

  // Initialize or load character
  useEffect(() => {
    if (!isOpen) return;
    
    const savedChar = localStorage.getItem(`chatrpg_${userId}`);
    if (savedChar) {
      try {
        const parsed = JSON.parse(savedChar);
        parsed.isAdmin = isAdmin;
        setCharacter(parsed);
        setCameraX(parsed.x - VIEW_WIDTH / 2);
        setCameraY(parsed.y - VIEW_HEIGHT / 2);
        setGameState('playing');
      } catch {
        setGameState('create');
      }
    } else {
      setGameState('create');
    }
  }, [isOpen, userId, isAdmin]);

  // Save character on changes
  useEffect(() => {
    if (character && gameState === 'playing') {
      localStorage.setItem(`chatrpg_${userId}`, JSON.stringify(character));
    }
  }, [character, userId, gameState]);

  // Socket events for multiplayer
  useEffect(() => {
    if (!socket || !character || gameState !== 'playing') return;

    const handlePlayerUpdate = (players: Character[]) => {
      setOtherPlayers(players.filter(p => p.id !== userId));
    };

    const handlePlayerAction = (data: { playerId: string; action: string; result: string }) => {
      if (data.playerId !== userId) {
        addMessage(data.result, 'action');
      }
    };

    const handlePlayerChat = (data: { playerId: string; username: string; text: string }) => {
      if (data.playerId !== userId) {
        setOtherPlayers(prev => prev.map(p => 
          p.id === data.playerId 
            ? { ...p, chatBubble: { text: data.text, timestamp: Date.now() } }
            : p
        ));
        addMessage(`${data.username}: ${data.text}`, 'chat', data.username);
      }
    };

    socket.on('rpg:players', handlePlayerUpdate);
    socket.on('rpg:action', handlePlayerAction);
    socket.on('rpg:chat', handlePlayerChat);

    socket.emit('rpg:join', { roomName, character });

    return () => {
      socket.off('rpg:players', handlePlayerUpdate);
      socket.off('rpg:action', handlePlayerAction);
      socket.off('rpg:chat', handlePlayerChat);
      socket.emit('rpg:leave', { roomName });
    };
  }, [socket, character, roomName, userId, gameState]);

  const addMessage = useCallback((text: string, type: GameMessage['type'] = 'system', msgUsername?: string) => {
    setMessages(prev => [...prev.slice(-50), {
      id: `${Date.now()}_${Math.random()}`,
      text,
      type,
      timestamp: Date.now(),
      username: msgUsername,
    }]);
  }, []);

  const handleCharacterCreate = (appearance: CharacterAppearance) => {
    const newChar: Character = {
      id: userId,
      username,
      x: 21,
      y: 15,
      appearance,
      stats: {
        attack: 1,
        defense: 1,
        mining: 1,
        fishing: 1,
        woodcutting: 1,
        crafting: 1,
        cooking: 1,
      },
      level: 1,
      xp: 0,
      gold: 100,
      direction: 'down',
      isAdmin,
    };
    
    setCharacter(newChar);
    setCameraX(newChar.x - VIEW_WIDTH / 2);
    setCameraY(newChar.y - VIEW_HEIGHT / 2);
    setGameState('playing');
    addMessage(`⚔️ ${username} has entered the realm!`, 'system');
  };

  const moveCharacter = useCallback((dx: number, dy: number) => {
    if (!character) return;
    
    const newX = character.x + dx;
    const newY = character.y + dy;
    
    if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) return;
    
    const targetTile = world[newY][newX];
    if (!targetTile.walkable) {
      if (targetTile.interactable && targetTile.resource) {
        handleResourceInteraction(newX, newY, targetTile);
      }
      return;
    }
    
    const direction = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    
    setCharacter(prev => prev ? { ...prev, x: newX, y: newY, direction, isMoving: true } : null);
    setCameraX(newX - VIEW_WIDTH / 2);
    setCameraY(newY - VIEW_HEIGHT / 2);
    
    if (socket) {
      socket.emit('rpg:move', { roomName, x: newX, y: newY, direction });
    }
    
    setTimeout(() => {
      setCharacter(prev => prev ? { ...prev, isMoving: false } : null);
    }, 150);
  }, [character, world, socket, roomName]);

  const handleResourceInteraction = (x: number, y: number, tile: WorldTile) => {
    if (!character) return;
    
    const resource = tile.resource;
    let xpGain = 0;
    let goldGain = 0;
    let skillKey: keyof CharacterStats | null = null;
    let actionText = '';
    
    switch (resource) {
      case 'wood':
        skillKey = 'woodcutting';
        xpGain = 10 + Math.floor(Math.random() * 10);
        goldGain = Math.random() > 0.6 ? 5 : 2;
        actionText = '🪓 You chopped some logs!';
        break;
      case 'ore':
        skillKey = 'mining';
        xpGain = 15 + Math.floor(Math.random() * 15);
        goldGain = Math.random() > 0.4 ? 10 : 5;
        actionText = '⛏️ You mined some ore!';
        break;
      case 'fish':
        skillKey = 'fishing';
        xpGain = 12 + Math.floor(Math.random() * 12);
        goldGain = Math.random() > 0.5 ? 8 : 3;
        actionText = '🎣 You caught a fish!';
        break;
    }
    
    if (skillKey) {
      const newStats = { ...character.stats };
      const shouldLevelUp = Math.random() < (xpGain / 60);
      
      if (shouldLevelUp) {
        newStats[skillKey] += 1;
        addMessage(`🎉 ${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)} leveled up to ${newStats[skillKey]}!`, 'levelup');
      }
      
      const newXp = character.xp + xpGain;
      const newLevel = Math.floor(newXp / 100) + 1;
      const leveledUp = newLevel > character.level;
      
      setCharacter({
        ...character,
        stats: newStats,
        xp: newXp,
        level: newLevel,
        gold: character.gold + goldGain,
      });
      
      addMessage(`${actionText} (+${xpGain} XP, +${goldGain} gold)`, 'loot');
      
      if (leveledUp) {
        addMessage(`🌟 LEVEL UP! You are now level ${newLevel}!`, 'levelup');
      }
      
      if (socket) {
        socket.emit('rpg:action', { roomName, action: resource, result: `${username} gathered ${resource}` });
      }
    }
  };

  const handleTileClick = (x: number, y: number) => {
    if (!character) return;
    
    const dx = x - character.x;
    const dy = y - character.y;
    
    // If adjacent tile, interact or move
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      if (dx !== 0 || dy !== 0) {
        moveCharacter(dx > 0 ? 1 : dx < 0 ? -1 : 0, dy > 0 ? 1 : dy < 0 ? -1 : 0);
      }
    } else {
      // Move towards clicked tile
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
        moveCharacter(dx > 0 ? 1 : -1, 0);
      } else if (dy !== 0) {
        moveCharacter(0, dy > 0 ? 1 : -1);
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    if (!isOpen || gameState !== 'playing' || isMinimized) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if typing in input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          e.preventDefault();
          moveCharacter(0, -1);
          break;
        case 's':
        case 'arrowdown':
          e.preventDefault();
          moveCharacter(0, 1);
          break;
        case 'a':
        case 'arrowleft':
          e.preventDefault();
          moveCharacter(-1, 0);
          break;
        case 'd':
        case 'arrowright':
          e.preventDefault();
          moveCharacter(1, 0);
          break;
        case ' ':
          e.preventDefault();
          // Interact with adjacent tile
          if (character) {
            const dirs = [
              { dx: 0, dy: -1 },
              { dx: 0, dy: 1 },
              { dx: -1, dy: 0 },
              { dx: 1, dy: 0 },
            ];
            for (const dir of dirs) {
              const tx = character.x + dir.dx;
              const ty = character.y + dir.dy;
              if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
                const tile = world[ty][tx];
                if (tile.interactable && tile.resource) {
                  handleResourceInteraction(tx, ty, tile);
                  break;
                }
              }
            }
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, gameState, moveCharacter, isMinimized, character, world]);

  // Toggle expanded state
  const toggleExpanded = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (onGameStateChange) {
      onGameStateChange(newExpanded);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`
        bg-gradient-to-b from-amber-950 to-neutral-900 
        border-4 border-amber-600 rounded-lg shadow-2xl overflow-hidden
        transition-all duration-300 flex flex-col
        ${isMinimized ? 'w-72' : isExpanded ? 'w-full max-w-4xl' : 'w-auto'}
      `}
      style={{ 
        fontFamily: "'Times New Roman', serif",
        boxShadow: '0 0 30px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.2)'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-amber-800 to-amber-900 border-b-2 border-amber-600">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚔️</span>
          <span className="font-bold text-amber-200 text-lg" style={{ textShadow: '2px 2px 4px #000' }}>
            ChatRPG
          </span>
          {character && (
            <span className="text-xs text-amber-400 ml-2">#{roomName}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleExpanded}
            className="p-1.5 hover:bg-amber-700 rounded text-amber-300 hover:text-white transition-colors"
            title={isExpanded ? 'Shrink' : 'Expand'}
          >
            {isExpanded ? '⬅️' : '➡️'}
          </button>
          <button
            onClick={onToggleSize}
            className="p-1.5 hover:bg-amber-700 rounded text-amber-300 hover:text-white transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '🔼' : '🔽'}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-red-600/50 rounded text-amber-300 hover:text-white transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="p-3 flex-1">
          {gameState === 'loading' && (
            <div className="flex items-center justify-center h-40">
              <div className="text-amber-300 text-xl animate-pulse" style={{ textShadow: '2px 2px 4px #000' }}>
                ⚔️ Loading realm...
              </div>
            </div>
          )}

          {gameState === 'create' && (
            <CharacterCreator username={username} isAdmin={isAdmin} onComplete={handleCharacterCreate} />
          )}

          {gameState === 'playing' && character && (
            <div className={`flex gap-3 ${isExpanded ? 'flex-row' : 'flex-col'}`}>
              {/* Game area */}
              <div className="flex flex-col gap-2 flex-1">
                <GameCanvas
                  world={world}
                  character={character}
                  otherPlayers={otherPlayers}
                  cameraX={cameraX}
                  cameraY={cameraY}
                  onTileClick={handleTileClick}
                />
                <GameLog messages={messages} />
              </div>
              
              {/* Stats sidebar */}
              <div className={`flex flex-col gap-2 ${isExpanded ? 'w-44' : 'flex-row'}`}>
                <StatsBar character={character} />
                
                {/* Controls hint */}
                <div className="bg-black/50 border border-amber-700 rounded-lg p-2 text-xs text-amber-200">
                  <p className="font-bold mb-1 text-amber-300">⌨️ Controls:</p>
                  <p>WASD / Arrows: Move</p>
                  <p>Space: Interact</p>
                  <p>Click: Move/Gather</p>
                </div>
                
                {/* Other players */}
                {otherPlayers.length > 0 && (
                  <div className="bg-black/50 border border-amber-700 rounded-lg p-2 text-xs">
                    <p className="font-bold text-green-400 mb-1">👥 Nearby ({otherPlayers.length})</p>
                    {otherPlayers.slice(0, 5).map(p => (
                      <div key={p.id} className="text-amber-200 truncate flex items-center gap-1">
                        {p.isAdmin && <span>👑</span>}
                        <span>{p.username}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Minimized view */}
      {isMinimized && character && (
        <div className="p-3 flex items-center gap-3">
          <RunescapeCharacter appearance={character.appearance} size={40} direction="down" isAdmin={character.isAdmin} />
          <div className="text-xs">
            <p className="font-bold text-amber-200">Lvl {character.level} {character.username}</p>
            <p className="text-yellow-400">💰 {character.gold.toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRPG;
