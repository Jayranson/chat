import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { Socket } from 'socket.io-client';

// =============================================================================
// CHATRPG with PHASER.JS - Runescape-inspired MMORPG
// Enhanced with NPCs, Combat Mobs, Quest System, and Better Graphics
// =============================================================================

interface ChatRPGPhaserProps {
  socket: Socket | null;
  username: string;
  currentRoom: string;
  onGameEvent?: (event: { type: 'private' | 'public'; message: string }) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isAdmin?: boolean;
}

// Character data structure
interface CharacterData {
  id: string;
  username: string;
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  gold: number;
  skills: {
    mining: number;
    fishing: number;
    woodcutting: number;
    combat: number;
    crafting: number;
  };
  inventory: InventoryItem[];
  quests: QuestProgress[];
  isAdmin?: boolean;
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  type: 'resource' | 'weapon' | 'armor' | 'consumable';
}

interface QuestProgress {
  questId: string;
  status: 'active' | 'completed';
  progress: number;
  maxProgress: number;
}

interface NPC {
  id: string;
  name: string;
  x: number;
  y: number;
  type: 'questgiver' | 'merchant' | 'trainer';
  dialogue: string[];
  quests?: string[];
}

interface Mob {
  id: string;
  name: string;
  x: number;
  y: number;
  level: number;
  hp: number;
  maxHp: number;
  type: 'goblin' | 'skeleton' | 'wolf' | 'bandit';
  hostile: boolean;
  lootTable: { item: string; chance: number }[];
}

// Main Phaser Game Scene
class MainGameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key; };
  private otherPlayers: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private npcs: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private mobs: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private characterData: CharacterData;
  private socket: Socket | null;
  private username: string;
  private onGameEvent?: (event: { type: 'private' | 'public'; message: string }) => void;
  private isAdmin: boolean;
  private minimapGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'MainGameScene' });
    this.characterData = this.getDefaultCharacter();
    this.socket = null;
    this.username = '';
    this.isAdmin = false;
  }

  init(data: any) {
    this.socket = data.socket;
    this.username = data.username;
    this.onGameEvent = data.onGameEvent;
    this.isAdmin = data.isAdmin || false;
    
    // Load saved character or create new
    const saved = localStorage.getItem(`chatrpg_character_${this.username}`);
    if (saved) {
      try {
        this.characterData = JSON.parse(saved);
      } catch {
        this.characterData = this.getDefaultCharacter();
      }
    }
  }

  preload() {
    // In a real implementation, you'd load sprite sheets here
    // For now, we'll create sprites programmatically
    this.createSpriteSheets();
  }

  create() {
    // Create world map
    this.createWorldMap();
    
    // Create player
    this.player = this.add.sprite(400, 300, 'player');
    this.player.setScale(2);
    
    // Add admin crown if admin
    if (this.isAdmin) {
      const crown = this.add.text(this.player.x, this.player.y - 40, '👑', {
        fontSize: '20px'
      });
      crown.setOrigin(0.5);
      this.player.setData('crown', crown);
    }
    
    // Setup camera
    this.cameras.main.startFollow(this.player);
    this.cameras.main.setZoom(1.5);
    
    // Create controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    
    // Spawn NPCs
    this.spawnNPCs();
    
    // Spawn mobs
    this.spawnMobs();
    
    // Create minimap
    this.createMinimap();
    
    // Setup socket listeners
    this.setupSocketListeners();
  }

  update() {
    if (!this.player) return;
    
    // Handle movement
    let velocityX = 0;
    let velocityY = 0;
    const speed = 200;
    
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      velocityX = -speed;
    } else if (this.cursors.right.isDown || this.wasd.D.isDown) {
      velocityX = speed;
    }
    
    if (this.cursors.up.isDown || this.wasd.W.isDown) {
      velocityY = -speed;
    } else if (this.cursors.down.isDown || this.wasd.S.isDown) {
      velocityY = speed;
    }
    
    // Update player position
    if (velocityX !== 0 || velocityY !== 0) {
      const deltaTime = this.game.loop.delta / 1000; // Convert to seconds
      this.player.x += velocityX * deltaTime;
      this.player.y += velocityY * deltaTime;
      
      // Update admin crown position
      const crown = this.player.getData('crown');
      if (crown) {
        crown.x = this.player.x;
        crown.y = this.player.y - 40;
      }
      
      // Emit position to server
      if (this.socket) {
        this.socket.emit('rpg:move', {
          x: this.player.x,
          y: this.player.y
        });
      }
    }
    
    // Update mobs AI
    this.updateMobs();
  }

  private createSpriteSheets() {
    // Create player sprite
    const playerGraphics = this.make.graphics({} as any);
    playerGraphics.fillStyle(0x4169E1, 1);
    playerGraphics.fillCircle(16, 16, 12);
    playerGraphics.fillStyle(0xFFE4B5, 1);
    playerGraphics.fillCircle(16, 10, 8);
    playerGraphics.generateTexture('player', 32, 32);
    playerGraphics.destroy();
    
    // Create NPC sprite
    const npcGraphics = this.make.graphics({} as any);
    npcGraphics.fillStyle(0x228B22, 1);
    npcGraphics.fillCircle(16, 16, 12);
    npcGraphics.fillStyle(0xFFE4B5, 1);
    npcGraphics.fillCircle(16, 10, 8);
    npcGraphics.fillStyle(0xFFFF00, 1); // Yellow for quest marker
    npcGraphics.fillCircle(16, 30, 4);
    npcGraphics.generateTexture('npc', 32, 32);
    npcGraphics.destroy();
    
    // Create goblin mob
    const goblinGraphics = this.make.graphics({} as any);
    goblinGraphics.fillStyle(0x556B2F, 1);
    goblinGraphics.fillCircle(16, 16, 10);
    goblinGraphics.fillStyle(0x8B4513, 1);
    goblinGraphics.fillCircle(16, 12, 6);
    goblinGraphics.generateTexture('goblin', 32, 32);
    goblinGraphics.destroy();
    
    // Create skeleton mob
    const skeletonGraphics = this.make.graphics({} as any);
    skeletonGraphics.fillStyle(0xE0E0E0, 1);
    skeletonGraphics.fillCircle(16, 16, 10);
    skeletonGraphics.fillStyle(0x000000, 1);
    skeletonGraphics.fillCircle(12, 12, 3);
    skeletonGraphics.fillCircle(20, 12, 3);
    skeletonGraphics.generateTexture('skeleton', 32, 32);
    skeletonGraphics.destroy();
    
    // Create wolf mob
    const wolfGraphics = this.make.graphics({} as any);
    wolfGraphics.fillStyle(0x808080, 1);
    wolfGraphics.fillCircle(16, 18, 10);
    wolfGraphics.fillTriangle(8, 8, 12, 12, 14, 8); // Left ear
    wolfGraphics.fillTriangle(18, 8, 20, 12, 22, 8); // Right ear
    wolfGraphics.generateTexture('wolf', 32, 32);
    wolfGraphics.destroy();
    
    // Create tree sprite
    const treeGraphics = this.make.graphics({} as any);
    treeGraphics.fillStyle(0x8B4513, 1);
    treeGraphics.fillRect(12, 20, 8, 20);
    treeGraphics.fillStyle(0x228B22, 1);
    treeGraphics.fillCircle(16, 18, 14);
    treeGraphics.generateTexture('tree', 32, 40);
    treeGraphics.destroy();
    
    // Create rock sprite
    const rockGraphics = this.make.graphics({} as any);
    rockGraphics.fillStyle(0x696969, 1);
    rockGraphics.fillCircle(16, 20, 12);
    rockGraphics.fillStyle(0xA9A9A9, 1);
    rockGraphics.fillCircle(12, 18, 6);
    rockGraphics.generateTexture('rock', 32, 32);
    rockGraphics.destroy();
  }

  private createWorldMap() {
    const tileSize = 48;
    const mapWidth = 50;
    const mapHeight = 50;
    
    // Create ground tiles
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = this.add.rectangle(
          x * tileSize + tileSize / 2,
          y * tileSize + tileSize / 2,
          tileSize,
          tileSize,
          this.getGroundColor(x, y)
        );
        tile.setStrokeStyle(1, 0x228B22, 0.2);
      }
    }
    
    // Add trees randomly
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.Between(2, mapWidth - 2) * tileSize;
      const y = Phaser.Math.Between(2, mapHeight - 2) * tileSize;
      const tree = this.add.sprite(x, y, 'tree');
      tree.setScale(1.5);
      tree.setData('type', 'tree');
      tree.setData('resource', 'wood');
    }
    
    // Add rocks randomly
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(2, mapWidth - 2) * tileSize;
      const y = Phaser.Math.Between(2, mapHeight - 2) * tileSize;
      const rock = this.add.sprite(x, y, 'rock');
      rock.setScale(1.5);
      rock.setData('type', 'rock');
      rock.setData('resource', 'ore');
    }
  }

  private getGroundColor(x: number, y: number): number {
    // Create varied grass colors for more realistic look
    const grassColors = [0x228B22, 0x2E8B57, 0x3CB371, 0x32CD32];
    const hash = (x * 73856093) ^ (y * 19349663);
    return grassColors[Math.abs(hash) % grassColors.length];
  }

  private spawnNPCs() {
    const npcData: NPC[] = [
      {
        id: 'npc_questgiver_1',
        name: 'Elder Marcus',
        x: 500,
        y: 400,
        type: 'questgiver',
        dialogue: ['Greetings, traveler!', 'The goblins have been causing trouble...', 'Would you help us?'],
        quests: ['quest_goblin_slayer']
      },
      {
        id: 'npc_merchant_1',
        name: 'Merchant Tom',
        x: 600,
        y: 400,
        type: 'merchant',
        dialogue: ['Welcome to my shop!', 'What can I get you?']
      },
      {
        id: 'npc_trainer_1',
        name: 'Combat Trainer Sarah',
        x: 700,
        y: 400,
        type: 'trainer',
        dialogue: ['Want to learn combat skills?', 'I can teach you!']
      }
    ];
    
    npcData.forEach(data => {
      const npc = this.add.sprite(data.x, data.y, 'npc');
      npc.setScale(2);
      npc.setInteractive();
      
      // Add name label
      const nameText = this.add.text(data.x, data.y - 30, data.name, {
        fontSize: '14px',
        color: '#FFFF00',
        backgroundColor: '#000000',
        padding: { x: 4, y: 2 }
      });
      nameText.setOrigin(0.5);
      
      // Add click handler
      npc.on('pointerdown', () => {
        this.interactWithNPC(data);
      });
      
      this.npcs.set(data.id, npc);
    });
  }

  private spawnMobs() {
    const mobTypes = ['goblin', 'skeleton', 'wolf'];
    
    for (let i = 0; i < 20; i++) {
      const mobType = Phaser.Math.RND.pick(mobTypes) as 'goblin' | 'skeleton' | 'wolf';
      const x = Phaser.Math.Between(200, 2000);
      const y = Phaser.Math.Between(200, 2000);
      const maxHp = 80 + Phaser.Math.Between(0, 40);
      
      const mob: Mob = {
        id: `mob_${mobType}_${i}`,
        name: mobType.charAt(0).toUpperCase() + mobType.slice(1),
        x,
        y,
        level: Phaser.Math.Between(1, 5),
        hp: maxHp,
        maxHp: maxHp,
        type: mobType,
        hostile: true,
        lootTable: [
          { item: 'gold', chance: 1.0 },
          { item: 'bone', chance: 0.5 },
          { item: 'leather', chance: 0.3 }
        ]
      };
      
      const mobSprite = this.add.sprite(mob.x, mob.y, mobType);
      mobSprite.setScale(1.8);
      mobSprite.setData('mobData', mob);
      mobSprite.setInteractive();
      
      // Add HP bar
      const hpBarBg = this.add.rectangle(mob.x, mob.y - 25, 40, 6, 0x000000);
      const hpBar = this.add.rectangle(mob.x - 20, mob.y - 25, 40, 4, 0xFF0000);
      hpBar.setOrigin(0, 0.5);
      mobSprite.setData('hpBar', hpBar);
      mobSprite.setData('hpBarBg', hpBarBg);
      
      // Add level label
      const levelText = this.add.text(mob.x, mob.y - 40, `Lv${mob.level}`, {
        fontSize: '12px',
        color: '#FF0000'
      });
      levelText.setOrigin(0.5);
      mobSprite.setData('levelText', levelText);
      
      // Add click to attack
      mobSprite.on('pointerdown', () => {
        this.attackMob(mob.id);
      });
      
      this.mobs.set(mob.id, mobSprite);
    }
  }

  private updateMobs() {
    this.mobs.forEach((mobSprite, mobId) => {
      const mobData = mobSprite.getData('mobData') as Mob;
      
      // Simple AI: move randomly and chase player if close
      const distToPlayer = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        mobSprite.x, mobSprite.y
      );
      
      if (distToPlayer < 150 && mobData.hostile) {
        // Chase player
        const angle = Phaser.Math.Angle.Between(
          mobSprite.x, mobSprite.y,
          this.player.x, this.player.y
        );
        mobSprite.x += Math.cos(angle) * 0.5;
        mobSprite.y += Math.sin(angle) * 0.5;
      } else {
        // Random movement
        if (Math.random() < 0.01) {
          mobSprite.x += Phaser.Math.Between(-2, 2);
          mobSprite.y += Phaser.Math.Between(-2, 2);
        }
      }
      
      // Update HP bar position
      const hpBar = mobSprite.getData('hpBar');
      const hpBarBg = mobSprite.getData('hpBarBg');
      const levelText = mobSprite.getData('levelText');
      
      if (hpBar) {
        hpBar.x = mobSprite.x - 20;
        hpBar.y = mobSprite.y - 25;
      }
      if (hpBarBg) {
        hpBarBg.x = mobSprite.x;
        hpBarBg.y = mobSprite.y - 25;
      }
      if (levelText) {
        levelText.x = mobSprite.x;
        levelText.y = mobSprite.y - 40;
      }
    });
  }

  private attackMob(mobId: string) {
    const mobSprite = this.mobs.get(mobId);
    if (!mobSprite) return;
    
    const mobData = mobSprite.getData('mobData') as Mob;
    
    // Calculate damage based on combat skill
    const damage = 10 + this.characterData.skills.combat * 2;
    mobData.hp -= damage;
    
    // Update HP bar
    const hpBar = mobSprite.getData('hpBar');
    if (hpBar) {
      const hpPercent = mobData.hp / mobData.maxHp;
      hpBar.width = 40 * hpPercent;
    }
    
    // Show damage text
    const damageText = this.add.text(mobSprite.x, mobSprite.y - 50, `-${damage}`, {
      fontSize: '16px',
      color: '#FF0000',
      fontStyle: 'bold'
    });
    damageText.setOrigin(0.5);
    this.tweens.add({
      targets: damageText,
      y: mobSprite.y - 80,
      alpha: 0,
      duration: 1000,
      onComplete: () => damageText.destroy()
    });
    
    if (mobData.hp <= 0) {
      // Mob defeated
      this.defeatMob(mobId, mobData);
    }
  }

  private defeatMob(mobId: string, mobData: Mob) {
    const mobSprite = this.mobs.get(mobId);
    if (!mobSprite) return;
    
    // Award XP and gold
    const xpGain = 25 + mobData.level * 5;
    const goldGain = Phaser.Math.Between(5, 15) + mobData.level * 2;
    
    this.characterData.skills.combat += 1;
    this.characterData.gold += goldGain;
    
    // Show loot
    if (this.onGameEvent) {
      this.onGameEvent({
        type: 'private',
        message: `⚔️ Defeated ${mobData.name}! (+${xpGain} XP, +${goldGain} gold)`
      });
      
      // Check for level up
      if (this.characterData.skills.combat % 10 === 0) {
        this.onGameEvent({
          type: 'public',
          message: `🎉 ${this.username}'s Combat leveled up to ${this.characterData.skills.combat}!`
        });
      }
    }
    
    // Remove mob
    const hpBar = mobSprite.getData('hpBar');
    const hpBarBg = mobSprite.getData('hpBarBg');
    const levelText = mobSprite.getData('levelText');
    
    hpBar?.destroy();
    hpBarBg?.destroy();
    levelText?.destroy();
    mobSprite.destroy();
    this.mobs.delete(mobId);
    
    // Save character
    this.saveCharacter();
  }

  private interactWithNPC(npcData: NPC) {
    // Show dialogue
    const dialogueBox = this.add.rectangle(
      this.cameras.main.centerX,
      this.cameras.main.height - 100,
      600,
      150,
      0x000000,
      0.8
    );
    dialogueBox.setScrollFactor(0);
    
    const dialogueText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.height - 100,
      `${npcData.name}: ${npcData.dialogue[0]}`,
      {
        fontSize: '16px',
        color: '#FFFFFF',
        wordWrap: { width: 550 }
      }
    );
    dialogueText.setOrigin(0.5);
    dialogueText.setScrollFactor(0);
    
    // Close button
    this.time.delayedCall(3000, () => {
      dialogueBox.destroy();
      dialogueText.destroy();
    });
  }

  private createMinimap() {
    const minimapSize = 150;
    this.minimapGraphics = this.add.graphics();
    this.minimapGraphics.setScrollFactor(0);
    this.minimapGraphics.setDepth(100);
    
    // Draw minimap background
    this.minimapGraphics.fillStyle(0x000000, 0.7);
    this.minimapGraphics.fillRect(
      this.cameras.main.width - minimapSize - 10,
      10,
      minimapSize,
      minimapSize
    );
    
    // Draw player position
    this.minimapGraphics.fillStyle(0x00FF00, 1);
    this.minimapGraphics.fillCircle(
      this.cameras.main.width - minimapSize / 2 - 10,
      minimapSize / 2 + 10,
      3
    );
  }

  private setupSocketListeners() {
    if (!this.socket) return;
    
    this.socket.on('rpg:player-moved', (data: { id: string; x: number; y: number; username: string }) => {
      if (data.id === this.socket?.id) return;
      
      let otherPlayer = this.otherPlayers.get(data.id);
      if (!otherPlayer) {
        otherPlayer = this.add.sprite(data.x, data.y, 'player');
        otherPlayer.setScale(2);
        otherPlayer.setTint(0xFFAAAA);
        
        const nameLabel = this.add.text(data.x, data.y - 30, data.username, {
          fontSize: '12px',
          color: '#FFFFFF',
          backgroundColor: '#000000',
          padding: { x: 3, y: 2 }
        });
        nameLabel.setOrigin(0.5);
        otherPlayer.setData('nameLabel', nameLabel);
        
        this.otherPlayers.set(data.id, otherPlayer);
      }
      
      otherPlayer.x = data.x;
      otherPlayer.y = data.y;
      
      const nameLabel = otherPlayer.getData('nameLabel');
      if (nameLabel) {
        nameLabel.x = data.x;
        nameLabel.y = data.y - 30;
      }
    });
  }

  private getDefaultCharacter(): CharacterData {
    return {
      id: '',
      username: this.username,
      x: 400,
      y: 300,
      level: 1,
      hp: 100,
      maxHp: 100,
      gold: 0,
      skills: {
        mining: 1,
        fishing: 1,
        woodcutting: 1,
        combat: 1,
        crafting: 1
      },
      inventory: [],
      quests: []
    };
  }

  private saveCharacter() {
    localStorage.setItem(`chatrpg_character_${this.username}`, JSON.stringify(this.characterData));
  }
}

// React Component Wrapper
const ChatRPGPhaser: React.FC<ChatRPGPhaserProps> = ({
  socket,
  username,
  currentRoom,
  onGameEvent,
  isExpanded,
  onToggleExpand,
  isAdmin
}) => {
  const gameRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    // Simulate asset loading
    const loadInterval = setInterval(() => {
      setLoadProgress(prev => {
        if (prev >= 100) {
          clearInterval(loadInterval);
          setIsLoading(false);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    return () => clearInterval(loadInterval);
  }, []);

  useEffect(() => {
    if (isLoading || !gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: gameRef.current,
      width: isExpanded ? 800 : 600,
      height: isExpanded ? 600 : 450,
      backgroundColor: '#228B22',
      scene: MainGameScene,
      physics: {
        default: 'arcade',
        arcade: {
          debug: false
        }
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    };

    gameInstanceRef.current = new Phaser.Game(config);
    
    gameInstanceRef.current.scene.start('MainGameScene', {
      socket,
      username,
      onGameEvent,
      isAdmin
    });

    return () => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.destroy(true);
        gameInstanceRef.current = null;
      }
    };
  }, [isLoading, socket, username, onGameEvent, isAdmin, isExpanded]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-white p-8">
        <h2 className="text-2xl font-bold mb-4">ChatRPG</h2>
        <div className="w-64 bg-gray-700 rounded-full h-4 mb-4">
          <div
            className="bg-green-500 h-4 rounded-full transition-all duration-300"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
        <p className="text-sm">Loading game assets... {loadProgress}%</p>
        <p className="text-xs text-gray-400 mt-2">World Map Data, Character Sprites, NPC Data, Mob AI...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div className="bg-gray-800 p-2 flex justify-between items-center">
        <h3 className="text-white font-bold">ChatRPG - {currentRoom}</h3>
        <button
          onClick={onToggleExpand}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {isExpanded ? '⬅️ Shrink' : '➡️ Expand'}
        </button>
      </div>
      <div ref={gameRef} className="flex-1" />
      <div className="bg-gray-800 p-2 text-xs text-gray-400 border-t border-gray-700">
        <p>Controls: WASD/Arrow Keys to move | Click NPCs to interact | Click mobs to attack</p>
      </div>
    </div>
  );
};

export default ChatRPGPhaser;
