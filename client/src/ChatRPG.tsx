import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';

// --- Type Definitions ---
type CharacterAppearance = {
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  outfit: number;
  outfitColor: number;
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

type TileType = 'grass' | 'water' | 'rock' | 'tree' | 'ore' | 'fish' | 'sand' | 'path' | 'building';

type WorldTile = {
  type: TileType;
  walkable: boolean;
  interactable?: boolean;
  resource?: string;
};

type GameMessage = {
  id: string;
  text: string;
  type: 'system' | 'action' | 'chat' | 'loot' | 'levelup';
  timestamp: number;
};

// --- Constants ---
const TILE_SIZE = 32;
const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;
const VIEW_WIDTH = 10;
const VIEW_HEIGHT = 8;

const SKIN_TONES = ['#FFD5B4', '#C68642', '#8D5524', '#703D1A', '#E5B887'];
const HAIR_COLORS = ['#1C1C1C', '#8B4513', '#DAA520', '#DC143C', '#4169E1', '#228B22', '#FF69B4', '#FFFFFF'];
const OUTFIT_COLORS = ['#8B0000', '#00008B', '#006400', '#4B0082', '#FF8C00', '#20B2AA', '#FFD700', '#2F4F4F'];

// World map generator
const generateWorld = (): WorldTile[][] => {
  const world: WorldTile[][] = [];
  
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: WorldTile[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      // Base grass
      let tile: WorldTile = { type: 'grass', walkable: true };
      
      // Water on edges and in pond
      if (x < 2 || (y > 10 && x > 15)) {
        tile = { type: 'water', walkable: false };
      }
      // Fishing spots near water
      else if ((x === 2 && y > 3 && y < 8) || (y === 11 && x === 15)) {
        tile = { type: 'fish', walkable: false, interactable: true, resource: 'fish' };
      }
      // Rocks and ore in mountain area
      else if (x > 15 && y < 5) {
        if (Math.random() > 0.6) {
          tile = { type: 'ore', walkable: false, interactable: true, resource: 'ore' };
        } else {
          tile = { type: 'rock', walkable: false };
        }
      }
      // Trees in forest area
      else if (y > 10 && x > 5 && x < 14) {
        if (Math.random() > 0.5) {
          tile = { type: 'tree', walkable: false, interactable: true, resource: 'wood' };
        }
      }
      // Path through the middle
      else if ((y === 7 || y === 8) && x > 3 && x < 17) {
        tile = { type: 'path', walkable: true };
      }
      // Sand beach
      else if (x === 2 && y > 8) {
        tile = { type: 'sand', walkable: true };
      }
      // Building/shop area
      else if (x > 8 && x < 12 && y > 3 && y < 6) {
        tile = { type: 'building', walkable: x === 10 && y === 5 }; // Door at center
      }
      // Scattered trees
      else if (Math.random() > 0.92) {
        tile = { type: 'tree', walkable: false, interactable: true, resource: 'wood' };
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
  onComplete: (appearance: CharacterAppearance) => void;
};

const CharacterCreator: React.FC<CharacterCreatorProps> = ({ username, onComplete }) => {
  const [appearance, setAppearance] = useState<CharacterAppearance>({
    skinTone: 0,
    hairStyle: 0,
    hairColor: 0,
    outfit: 0,
    outfitColor: 0,
  });

  const hairStyles = ['Short', 'Long', 'Spiky', 'Bald', 'Ponytail', 'Mohawk'];
  const outfits = ['Warrior', 'Mage', 'Ranger', 'Merchant', 'Peasant', 'Noble'];

  return (
    <div className="bg-neutral-800 border border-purple-500/50 rounded-lg p-4 w-full max-w-md">
      <h3 className="text-xl font-bold text-purple-300 mb-4 text-center">
        🎮 Create Your Character
      </h3>
      <p className="text-neutral-400 text-sm text-center mb-4">
        Welcome, {username}! Design your in-world avatar.
      </p>

      {/* Preview */}
      <div className="flex justify-center mb-4">
        <div 
          className="w-24 h-32 rounded-lg border-2 border-purple-500 flex items-center justify-center"
          style={{ backgroundColor: '#2a2a2a' }}
        >
          <CharacterSprite appearance={appearance} size={64} direction="down" />
        </div>
      </div>

      {/* Skin Tone */}
      <div className="mb-3">
        <label className="text-sm text-neutral-400 mb-1 block">Skin Tone</label>
        <div className="flex gap-2">
          {SKIN_TONES.map((color, i) => (
            <button
              key={i}
              onClick={() => setAppearance({ ...appearance, skinTone: i })}
              className={`w-8 h-8 rounded-full border-2 ${appearance.skinTone === i ? 'border-purple-500' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Hair Style */}
      <div className="mb-3">
        <label className="text-sm text-neutral-400 mb-1 block">Hair Style</label>
        <select
          value={appearance.hairStyle}
          onChange={(e) => setAppearance({ ...appearance, hairStyle: parseInt(e.target.value) })}
          className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2"
        >
          {hairStyles.map((style, i) => (
            <option key={i} value={i}>{style}</option>
          ))}
        </select>
      </div>

      {/* Hair Color */}
      <div className="mb-3">
        <label className="text-sm text-neutral-400 mb-1 block">Hair Color</label>
        <div className="flex gap-2 flex-wrap">
          {HAIR_COLORS.map((color, i) => (
            <button
              key={i}
              onClick={() => setAppearance({ ...appearance, hairColor: i })}
              className={`w-6 h-6 rounded-full border-2 ${appearance.hairColor === i ? 'border-purple-500' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Outfit */}
      <div className="mb-3">
        <label className="text-sm text-neutral-400 mb-1 block">Outfit</label>
        <select
          value={appearance.outfit}
          onChange={(e) => setAppearance({ ...appearance, outfit: parseInt(e.target.value) })}
          className="w-full bg-neutral-700 border border-neutral-600 rounded px-3 py-2"
        >
          {outfits.map((outfit, i) => (
            <option key={i} value={i}>{outfit}</option>
          ))}
        </select>
      </div>

      {/* Outfit Color */}
      <div className="mb-4">
        <label className="text-sm text-neutral-400 mb-1 block">Outfit Color</label>
        <div className="flex gap-2 flex-wrap">
          {OUTFIT_COLORS.map((color, i) => (
            <button
              key={i}
              onClick={() => setAppearance({ ...appearance, outfitColor: i })}
              className={`w-6 h-6 rounded-full border-2 ${appearance.outfitColor === i ? 'border-purple-500' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <button
        onClick={() => onComplete(appearance)}
        className="w-full py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg font-bold"
      >
        ✨ Enter World
      </button>
    </div>
  );
};

type CharacterSpriteProps = {
  appearance: CharacterAppearance;
  size: number;
  direction: 'up' | 'down' | 'left' | 'right';
  isMoving?: boolean;
};

const CharacterSprite: React.FC<CharacterSpriteProps> = ({ appearance, size, direction, isMoving }) => {
  const skinColor = SKIN_TONES[appearance.skinTone];
  const hairColor = HAIR_COLORS[appearance.hairColor];
  const outfitColor = OUTFIT_COLORS[appearance.outfitColor];
  
  // Simple pixel-art style character
  const headSize = size * 0.35;
  const bodyWidth = size * 0.4;
  const bodyHeight = size * 0.35;
  
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Shadow */}
      <ellipse 
        cx={size/2} 
        cy={size - 4} 
        rx={size * 0.25} 
        ry={size * 0.08} 
        fill="rgba(0,0,0,0.3)"
        className={isMoving ? 'animate-pulse' : ''}
      />
      
      {/* Body */}
      <rect 
        x={(size - bodyWidth) / 2} 
        y={size * 0.45}
        width={bodyWidth}
        height={bodyHeight}
        fill={outfitColor}
        rx={4}
      />
      
      {/* Legs */}
      <rect 
        x={size * 0.3} 
        y={size * 0.75}
        width={size * 0.15}
        height={size * 0.18}
        fill={outfitColor}
        style={{ filter: 'brightness(0.8)' }}
      />
      <rect 
        x={size * 0.55} 
        y={size * 0.75}
        width={size * 0.15}
        height={size * 0.18}
        fill={outfitColor}
        style={{ filter: 'brightness(0.8)' }}
      />
      
      {/* Head */}
      <circle 
        cx={size/2} 
        cy={size * 0.32}
        r={headSize / 2}
        fill={skinColor}
      />
      
      {/* Hair */}
      {appearance.hairStyle !== 3 && ( // Not bald
        <path 
          d={appearance.hairStyle === 2 
            ? `M ${size * 0.35} ${size * 0.2} L ${size/2} ${size * 0.08} L ${size * 0.65} ${size * 0.2} Q ${size/2} ${size * 0.28} ${size * 0.35} ${size * 0.2}` // Spiky
            : appearance.hairStyle === 1 
              ? `M ${size * 0.3} ${size * 0.35} Q ${size * 0.3} ${size * 0.12} ${size/2} ${size * 0.12} Q ${size * 0.7} ${size * 0.12} ${size * 0.7} ${size * 0.5}` // Long
              : `M ${size * 0.32} ${size * 0.25} Q ${size * 0.32} ${size * 0.12} ${size/2} ${size * 0.12} Q ${size * 0.68} ${size * 0.12} ${size * 0.68} ${size * 0.25}` // Short
          }
          fill={hairColor}
        />
      )}
      
      {/* Eyes */}
      {direction !== 'up' && (
        <>
          <circle cx={size * 0.42} cy={size * 0.32} r={2} fill="#1C1C1C" />
          <circle cx={size * 0.58} cy={size * 0.32} r={2} fill="#1C1C1C" />
        </>
      )}
    </svg>
  );
};

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
  
  const getTileColor = (type: TileType): string => {
    switch(type) {
      case 'grass': return '#4a7c23';
      case 'water': return '#3498db';
      case 'rock': return '#7f8c8d';
      case 'tree': return '#27ae60';
      case 'ore': return '#95a5a6';
      case 'fish': return '#2980b9';
      case 'sand': return '#f4d03f';
      case 'path': return '#8b7355';
      case 'building': return '#5d4e37';
      default: return '#4a7c23';
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
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
          
          // Base tile
          ctx.fillStyle = getTileColor(tile.type);
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
          
          // Tile details
          if (tile.type === 'tree') {
            ctx.fillStyle = '#5d4e37';
            ctx.fillRect(screenX + 12, screenY + 20, 8, 12);
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            ctx.arc(screenX + 16, screenY + 14, 12, 0, Math.PI * 2);
            ctx.fill();
          } else if (tile.type === 'ore') {
            ctx.fillStyle = '#7f8c8d';
            ctx.beginPath();
            ctx.moveTo(screenX + 16, screenY + 4);
            ctx.lineTo(screenX + 28, screenY + 28);
            ctx.lineTo(screenX + 4, screenY + 28);
            ctx.closePath();
            ctx.fill();
            // Ore sparkle
            ctx.fillStyle = '#f39c12';
            ctx.fillRect(screenX + 10, screenY + 15, 4, 4);
            ctx.fillRect(screenX + 18, screenY + 20, 3, 3);
          } else if (tile.type === 'fish') {
            // Fishing spot ripples
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.arc(screenX + 16, screenY + 16, 8, 0, Math.PI * 2);
            ctx.stroke();
          } else if (tile.type === 'water') {
            // Water wave effect
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(screenX + 4, screenY + 10, 24, 2);
            ctx.fillRect(screenX + 8, screenY + 20, 20, 2);
          } else if (tile.type === 'building') {
            ctx.fillStyle = '#d35400';
            ctx.fillRect(screenX + 8, screenY + 2, 16, 6);
          }
          
          // Grid lines
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
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
        className="cursor-pointer"
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
              className="absolute transition-all duration-200"
              style={{ 
                left: screenX, 
                top: screenY - 8,
                transform: 'translate(-8px, -8px)'
              }}
            >
              <CharacterSprite 
                appearance={player.appearance} 
                size={TILE_SIZE + 16} 
                direction={player.direction}
                isMoving={player.isMoving}
              />
              <div className="text-xs text-white text-center bg-black/50 px-1 rounded mt-1 truncate max-w-[60px]">
                {player.username}
              </div>
            </div>
          );
        })}
        
        {/* Current player (always centered) */}
        <div
          className="absolute"
          style={{ 
            left: (character.x - cameraX) * TILE_SIZE,
            top: (character.y - cameraY) * TILE_SIZE - 8,
            transform: 'translate(-8px, -8px)'
          }}
        >
          <CharacterSprite 
            appearance={character.appearance} 
            size={TILE_SIZE + 16} 
            direction={character.direction}
            isMoving={character.isMoving}
          />
          <div className="text-xs text-green-300 text-center bg-black/50 px-1 rounded mt-1 font-bold">
            {character.username}
          </div>
        </div>
      </div>
    </div>
  );
};

type StatsBarProps = {
  character: Character;
};

const StatsBar: React.FC<StatsBarProps> = ({ character }) => {
  // Avoid division by zero: minimum level is 1, so xpForNextLevel is at least 100
  const xpForNextLevel = Math.max(character.level, 1) * 100;
  const xpProgress = (character.xp % 100) / 100 * 100; // Simplified: each level needs 100 XP
  
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
    <div className="bg-neutral-800/90 border border-neutral-700 rounded-lg p-2 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-purple-300">Lvl {character.level}</span>
        <span className="text-yellow-400">💰 {character.gold}</span>
      </div>
      
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span>XP</span>
          <span>{character.xp % 100}/{100}</span>
        </div>
        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
            style={{ width: `${xpProgress}%` }}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-1 text-xs">
        {(Object.keys(character.stats) as Array<keyof CharacterStats>).slice(0, 4).map(stat => (
          <div key={stat} className="flex items-center gap-1 bg-neutral-700/50 rounded px-1 py-0.5" title={stat}>
            <span>{statIcons[stat]}</span>
            <span>{character.stats[stat]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

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
      case 'system': return 'text-neutral-400';
      case 'action': return 'text-blue-300';
      case 'loot': return 'text-yellow-300';
      case 'levelup': return 'text-purple-300 font-bold';
      default: return 'text-white';
    }
  };

  return (
    <div 
      ref={logRef}
      className="h-24 overflow-y-auto bg-neutral-900/80 rounded border border-neutral-700 p-2 text-xs"
    >
      {messages.map(msg => (
        <div key={msg.id} className={getMessageColor(msg.type)}>
          {msg.text}
        </div>
      ))}
    </div>
  );
};

// --- Main Component ---

type ChatRPGProps = {
  socket: Socket;
  username: string;
  userId: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  onToggleSize: () => void;
  isMinimized: boolean;
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
}) => {
  const [gameState, setGameState] = useState<'loading' | 'create' | 'playing'>('loading');
  const [world] = useState<WorldTile[][]>(() => generateWorld());
  const [character, setCharacter] = useState<Character | null>(null);
  const [otherPlayers, setOtherPlayers] = useState<Character[]>([]);
  const [messages, setMessages] = useState<GameMessage[]>([
    { id: '1', text: 'Welcome to ChatRPG! Use arrow keys or WASD to move.', type: 'system', timestamp: Date.now() },
    { id: '2', text: 'Click on resources to gather them.', type: 'system', timestamp: Date.now() },
  ]);
  const [cameraX, setCameraX] = useState(5);
  const [cameraY, setCameraY] = useState(5);

  // Initialize or load character
  useEffect(() => {
    if (!isOpen) return;
    
    // Try to load saved character from localStorage
    const savedChar = localStorage.getItem(`chatrpg_${userId}`);
    if (savedChar) {
      try {
        const parsed = JSON.parse(savedChar);
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
  }, [isOpen, userId]);

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

    socket.on('rpg:players', handlePlayerUpdate);
    socket.on('rpg:action', handlePlayerAction);

    // Announce presence
    socket.emit('rpg:join', { roomName, character });

    return () => {
      socket.off('rpg:players', handlePlayerUpdate);
      socket.off('rpg:action', handlePlayerAction);
      socket.emit('rpg:leave', { roomName });
    };
  }, [socket, character, roomName, userId, gameState]);

  const addMessage = useCallback((text: string, type: GameMessage['type'] = 'system') => {
    setMessages(prev => [...prev.slice(-50), {
      id: `${Date.now()}_${Math.random()}`,
      text,
      type,
      timestamp: Date.now(),
    }]);
  }, []);

  const handleCharacterCreate = (appearance: CharacterAppearance) => {
    const newChar: Character = {
      id: userId,
      username,
      x: 5,
      y: 7,
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
      gold: 50,
      direction: 'down',
    };
    
    setCharacter(newChar);
    setCameraX(newChar.x - VIEW_WIDTH / 2);
    setCameraY(newChar.y - VIEW_HEIGHT / 2);
    setGameState('playing');
    addMessage(`${username} has entered the world!`, 'system');
  };

  const moveCharacter = useCallback((dx: number, dy: number) => {
    if (!character) return;
    
    const newX = character.x + dx;
    const newY = character.y + dy;
    
    // Bounds check
    if (newX < 0 || newX >= MAP_WIDTH || newY < 0 || newY >= MAP_HEIGHT) return;
    
    // Walkability check
    const targetTile = world[newY][newX];
    if (!targetTile.walkable) {
      // Try to interact with resource
      if (targetTile.interactable && targetTile.resource) {
        handleResourceInteraction(newX, newY, targetTile);
      }
      return;
    }
    
    // Direction
    const direction = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    
    setCharacter(prev => prev ? { ...prev, x: newX, y: newY, direction, isMoving: true } : null);
    setCameraX(newX - VIEW_WIDTH / 2);
    setCameraY(newY - VIEW_HEIGHT / 2);
    
    // Emit movement to server
    if (socket) {
      socket.emit('rpg:move', { roomName, x: newX, y: newY, direction });
    }
    
    setTimeout(() => {
      setCharacter(prev => prev ? { ...prev, isMoving: false } : null);
    }, 200);
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
        xpGain = 5 + Math.floor(Math.random() * 5);
        goldGain = Math.random() > 0.7 ? 2 : 0;
        actionText = '🪓 You chop some wood!';
        break;
      case 'ore':
        skillKey = 'mining';
        xpGain = 8 + Math.floor(Math.random() * 7);
        goldGain = Math.random() > 0.5 ? 5 : 2;
        actionText = '⛏️ You mine some ore!';
        break;
      case 'fish':
        skillKey = 'fishing';
        xpGain = 6 + Math.floor(Math.random() * 6);
        goldGain = Math.random() > 0.6 ? 3 : 0;
        actionText = '🎣 You catch a fish!';
        break;
    }
    
    if (skillKey) {
      const newStats = { ...character.stats };
      const currentSkillLevel = newStats[skillKey];
      // Each skill level requires 50 XP. We increment from current level.
      // Since we don't track skill XP, just increment level occasionally based on RNG
      const shouldLevelUp = Math.random() < (xpGain / 50); // Higher XP gain = higher chance
      const newSkillLevel = shouldLevelUp ? currentSkillLevel + 1 : currentSkillLevel;
      
      if (newSkillLevel > currentSkillLevel) {
        addMessage(`🎉 ${skillKey.charAt(0).toUpperCase() + skillKey.slice(1)} leveled up to ${newSkillLevel}!`, 'levelup');
        newStats[skillKey] = newSkillLevel;
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
      
      addMessage(actionText + ` (+${xpGain} XP${goldGain > 0 ? `, +${goldGain} gold` : ''})`, 'loot');
      
      if (leveledUp) {
        addMessage(`🌟 LEVEL UP! You are now level ${newLevel}!`, 'levelup');
      }
      
      // Emit action to server
      if (socket) {
        socket.emit('rpg:action', { roomName, action: resource, result: `${username} gathered ${resource}` });
      }
    }
  };

  const handleTileClick = (x: number, y: number) => {
    if (!character) return;
    
    const dx = x - character.x;
    const dy = y - character.y;
    
    // Move towards clicked tile (one step at a time)
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      moveCharacter(dx > 0 ? 1 : -1, 0);
    } else if (dy !== 0) {
      moveCharacter(0, dy > 0 ? 1 : -1);
    }
  };

  // Keyboard controls
  useEffect(() => {
    if (!isOpen || gameState !== 'playing' || isMinimized) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
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
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, gameState, moveCharacter, isMinimized]);

  if (!isOpen) return null;

  return (
    <div className={`
      bg-neutral-900 border-2 border-purple-500/50 rounded-lg shadow-2xl overflow-hidden
      transition-all duration-300
      ${isMinimized ? 'w-64' : 'w-auto'}
    `}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-b border-purple-500/30">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎮</span>
          <span className="font-bold text-purple-200">ChatRPG</span>
          {character && (
            <span className="text-xs text-neutral-400">#{roomName}</span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={onToggleSize}
            className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '🔼' : '🔽'}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-600/50 rounded text-neutral-400 hover:text-white"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="p-3">
          {gameState === 'loading' && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-pulse text-purple-300">Loading...</div>
            </div>
          )}

          {gameState === 'create' && (
            <CharacterCreator username={username} onComplete={handleCharacterCreate} />
          )}

          {gameState === 'playing' && character && (
            <div className="flex gap-3">
              {/* Game area */}
              <div className="flex flex-col gap-2">
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
              <div className="w-32 flex flex-col gap-2">
                <StatsBar character={character} />
                
                {/* Controls hint */}
                <div className="bg-neutral-800/50 rounded p-2 text-xs text-neutral-400">
                  <p className="font-bold mb-1">Controls:</p>
                  <p>WASD / Arrows: Move</p>
                  <p>Click: Move/Interact</p>
                </div>
                
                {/* Other players */}
                {otherPlayers.length > 0 && (
                  <div className="bg-neutral-800/50 rounded p-2 text-xs">
                    <p className="font-bold text-green-300 mb-1">Nearby ({otherPlayers.length})</p>
                    {otherPlayers.slice(0, 3).map(p => (
                      <p key={p.id} className="text-neutral-300 truncate">{p.username}</p>
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
        <div className="p-2 flex items-center gap-2">
          <CharacterSprite appearance={character.appearance} size={24} direction="down" />
          <div className="text-xs">
            <p className="font-bold text-purple-300">Lvl {character.level}</p>
            <p className="text-yellow-400">💰 {character.gold}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRPG;
