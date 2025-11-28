/**
 * Room Engine - Room configuration and management
 * Provides room mood, safety settings, analytics, and episode tracking
 */

// Available room moods
export const ROOM_MOODS = ['chill', 'chaotic', 'supportive', 'serious', 'comedy'];

// Available safety modes
export const ROOM_SAFETY_MODES = ['anything_goes', 'spicy_but_sane', 'balanced', 'support_only', 'teen_safe'];

// Room configurations storage
const roomConfigs = new Map();

// Room episodes storage (notable events)
const roomEpisodes = new Map();

// Default room configuration
const getDefaultConfig = () => ({
  mood: 'chill',
  safetyMode: 'balanced',
  aiEnabled: true,
  chaosBotEnabled: false,
  archiveBotEnabled: true,
  customSettings: {}
});

// Mood personality adjustments
const MOOD_SETTINGS = {
  chill: {
    aiHumorLevel: 0.5,
    aiFormality: 0.4,
    toxicityMultiplier: 1.0,
    allowProfanity: false
  },
  chaotic: {
    aiHumorLevel: 0.9,
    aiFormality: 0.2,
    toxicityMultiplier: 0.7,
    allowProfanity: true
  },
  supportive: {
    aiHumorLevel: 0.3,
    aiFormality: 0.6,
    toxicityMultiplier: 1.3,
    allowProfanity: false
  },
  serious: {
    aiHumorLevel: 0.2,
    aiFormality: 0.9,
    toxicityMultiplier: 1.2,
    allowProfanity: false
  },
  comedy: {
    aiHumorLevel: 0.95,
    aiFormality: 0.1,
    toxicityMultiplier: 0.8,
    allowProfanity: true
  }
};

// Safety mode adjustments
const SAFETY_SETTINGS = {
  anything_goes: {
    autoBlockThreshold: 10,
    warnThreshold: 8,
    toxicityMultiplier: 0.5,
    allowProfanity: true
  },
  spicy_but_sane: {
    autoBlockThreshold: 7,
    warnThreshold: 5,
    toxicityMultiplier: 0.8,
    allowProfanity: true
  },
  balanced: {
    autoBlockThreshold: 5,
    warnThreshold: 3,
    toxicityMultiplier: 1.0,
    allowProfanity: false
  },
  support_only: {
    autoBlockThreshold: 3,
    warnThreshold: 2,
    toxicityMultiplier: 1.5,
    allowProfanity: false
  },
  teen_safe: {
    autoBlockThreshold: 2,
    warnThreshold: 1,
    toxicityMultiplier: 2.0,
    allowProfanity: false
  }
};

/**
 * Get room configuration
 * @param {string} roomName - The room name
 * @returns {Object} Room configuration
 */
export const getRoomConfig = (roomName) => {
  if (!roomConfigs.has(roomName)) {
    roomConfigs.set(roomName, getDefaultConfig());
  }
  return { ...roomConfigs.get(roomName) };
};

/**
 * Update room configuration
 * @param {string} roomName - The room name
 * @param {Object} updates - Configuration updates
 * @returns {Object} Updated configuration
 */
export const updateRoomConfig = (roomName, updates) => {
  const config = getRoomConfig(roomName);
  const updated = { ...config, ...updates };
  roomConfigs.set(roomName, updated);
  return updated;
};

/**
 * Get combined room settings (config + mood + safety adjustments)
 * @param {string} roomName - The room name
 * @returns {Object} Combined settings
 */
export const getRoomSettings = (roomName) => {
  const config = getRoomConfig(roomName);
  const moodSettings = MOOD_SETTINGS[config.mood] || MOOD_SETTINGS.chill;
  const safetySettings = SAFETY_SETTINGS[config.safetyMode] || SAFETY_SETTINGS.balanced;
  
  return {
    ...config,
    ...moodSettings,
    ...safetySettings,
    // Combine toxicity multipliers
    toxicityMultiplier: moodSettings.toxicityMultiplier * safetySettings.toxicityMultiplier,
    // Allow profanity only if both mood and safety allow it
    allowProfanity: moodSettings.allowProfanity && safetySettings.allowProfanity
  };
};

/**
 * Get room summary based on recent messages
 * @param {string} roomName - The room name
 * @param {Array} messages - Recent messages
 * @returns {Object} Room summary
 */
export const getRoomSummary = (roomName, messages) => {
  if (!messages || messages.length === 0) {
    return {
      text: 'No recent activity in this room.',
      messageCount: 0,
      participants: [],
      topics: []
    };
  }
  
  const recentMessages = messages.slice(-50);
  const participants = [...new Set(recentMessages.filter(m => m.type === 'user').map(m => m.user))];
  
  // Extract common words for topics (simple implementation)
  const allText = recentMessages.filter(m => m.type === 'user').map(m => m.text).join(' ');
  const words = allText.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const wordFreq = {};
  words.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });
  const topics = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  
  // Generate summary text
  const summaryLines = [];
  if (participants.length > 0) {
    summaryLines.push(`${participants.length} participant${participants.length > 1 ? 's' : ''} active: ${participants.slice(0, 5).join(', ')}${participants.length > 5 ? '...' : ''}`);
  }
  if (topics.length > 0) {
    summaryLines.push(`Topics discussed: ${topics.join(', ')}`);
  }
  summaryLines.push(`${recentMessages.length} recent messages`);
  
  return {
    text: summaryLines.join('\n'),
    messageCount: recentMessages.length,
    participants,
    topics
  };
};

/**
 * Add a notable episode/event to room history
 * @param {string} roomName - The room name
 * @param {string} description - Event description
 * @param {Object} metadata - Additional metadata
 */
export const addRoomEpisode = (roomName, description, metadata = {}) => {
  if (!roomEpisodes.has(roomName)) {
    roomEpisodes.set(roomName, []);
  }
  
  const episodes = roomEpisodes.get(roomName);
  episodes.push({
    id: `ep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    description,
    timestamp: new Date().toISOString(),
    ...metadata
  });
  
  // Keep only last 100 episodes per room
  if (episodes.length > 100) {
    episodes.shift();
  }
};

/**
 * Get room episodes (notable events)
 * @param {string} roomName - The room name
 * @param {number} limit - Maximum number of episodes to return
 * @returns {Array} Room episodes
 */
export const getRoomEpisodes = (roomName, limit = 10) => {
  if (!roomEpisodes.has(roomName)) {
    return [];
  }
  return roomEpisodes.get(roomName).slice(-limit);
};

/**
 * Analyze room activity
 * @param {string} roomName - The room name
 * @param {Array} messages - Messages to analyze
 * @returns {Object} Activity analytics
 */
export const analyzeRoomActivity = (roomName, messages) => {
  if (!messages || messages.length === 0) {
    return {
      messageCount: 0,
      uniqueUsers: 0,
      avgMessagesPerUser: 0,
      mostActiveUsers: [],
      messageTypes: { user: 0, system: 0, server: 0 },
      hourlyActivity: {}
    };
  }
  
  const recentMessages = messages.slice(-200);
  const userMessages = recentMessages.filter(m => m.type === 'user');
  const userCounts = {};
  const messageTypes = { user: 0, system: 0, server: 0, thought: 0 };
  const hourlyActivity = {};
  
  recentMessages.forEach(msg => {
    // Count by user
    if (msg.type === 'user') {
      userCounts[msg.user] = (userCounts[msg.user] || 0) + 1;
    }
    
    // Count by type
    messageTypes[msg.type] = (messageTypes[msg.type] || 0) + 1;
    
    // Hourly activity (if timestamp available)
    if (msg.time) {
      const hour = msg.time.split(':')[0];
      hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
    }
  });
  
  const uniqueUsers = Object.keys(userCounts).length;
  const mostActiveUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([user, count]) => ({ user, messageCount: count }));
  
  return {
    messageCount: recentMessages.length,
    uniqueUsers,
    avgMessagesPerUser: uniqueUsers > 0 ? Math.round(userMessages.length / uniqueUsers) : 0,
    mostActiveUsers,
    messageTypes,
    hourlyActivity
  };
};
