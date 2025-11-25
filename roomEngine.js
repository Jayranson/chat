// roomEngine.js
// Room configuration and management system with mood, safety modes, and AI summarization

// In-memory config store
export const ROOM_MOODS = ['chill', 'chaotic', 'supportive', 'serious', 'comedy'];

export const ROOM_SAFETY_MODES = [
  'anything_goes',   // 18+
  'spicy_but_sane',
  'balanced',
  'support_only',
  'teen_safe',
];

export const defaultRoomConfig = (roomName) => ({
  name: roomName,
  mood: 'balanced',            // overall vibe
  safetyMode: 'balanced',      // moderation strictness
  aiPersonality: 'default',    // for future personas
  allowUserBots: true,
  allowChaosBot: false,
  allowArchiveBot: true,
  description: '',
  topicTags: [],               // e.g. ['cycling','gaming','ai']
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const roomConfigs = new Map();          // roomName -> config
const roomSummaries = new Map();        // roomName -> { text, createdAt }
const roomEpisodes = new Map();         // roomName -> Array of notable events

// Ensure config exists
export const getRoomConfig = (roomName) => {
  if (!roomConfigs.has(roomName)) {
    roomConfigs.set(roomName, defaultRoomConfig(roomName));
  }
  return roomConfigs.get(roomName);
};

export const updateRoomConfig = (roomName, partial) => {
  const existing = getRoomConfig(roomName);
  const updated = {
    ...existing,
    ...partial,
    updatedAt: Date.now(),
  };
  roomConfigs.set(roomName, updated);
  return updated;
};

// --- Memory & summarisation helpers ---

// Very lightweight summariser: no LLM, just heuristic compression
export const generateRoomSummary = (roomName, messages, maxLines = 6) => {
  if (!messages || !messages.length) {
    return {
      text: 'Nothing much has happened yet in this room. Start something 🤭',
      createdAt: Date.now(),
    };
  }

  // Prefer recent messages, but keep some structure
  const recent = messages.slice(-120);

  const important = recent.filter((m) => {
    // System messages, AI thoughts, or messages with mentions
    if (m.type === 'system' || m.type === 'thought') return true;
    if (m.text && m.text.includes('@')) return true;
    
    // Questions (likely important)
    if (m.text && m.text.includes('?')) return true;
    
    // Long messages (probably meaningful)
    if (m.text && m.text.length > 80) return true;
    
    return false;
  });

  // If we have enough important messages, use those
  const candidates = important.length >= maxLines ? important : recent;
  
  // Take the most recent ones up to maxLines
  const selected = candidates.slice(-maxLines);

  // Build summary text
  const lines = selected.map(m => {
    const user = m.user || 'Unknown';
    const text = m.text || '';
    const truncated = text.length > 100 ? text.substring(0, 97) + '...' : text;
    return `[${user}]: ${truncated}`;
  });

  return {
    text: lines.join('\n'),
    createdAt: Date.now(),
  };
};

// Store a summary for a room
export const storeRoomSummary = (roomName, messages) => {
  const summary = generateRoomSummary(roomName, messages);
  roomSummaries.set(roomName, summary);
  return summary;
};

// Get stored summary or generate a new one
export const getRoomSummary = (roomName, messages) => {
  const existing = roomSummaries.get(roomName);
  
  // If summary exists and is less than 10 minutes old, return it
  if (existing && (Date.now() - existing.createdAt < 10 * 60 * 1000)) {
    return existing;
  }
  
  // Otherwise, generate a fresh summary
  return storeRoomSummary(roomName, messages);
};

// --- Episode tracking (notable events) ---

export const addRoomEpisode = (roomName, description, metadata = {}) => {
  if (!roomEpisodes.has(roomName)) {
    roomEpisodes.set(roomName, []);
  }
  
  const episodes = roomEpisodes.get(roomName);
  episodes.push({
    description,
    timestamp: Date.now(),
    ...metadata,
  });
  
  // Keep last 50 episodes
  if (episodes.length > 50) {
    episodes.shift();
  }
};

export const getRoomEpisodes = (roomName, limit = 10) => {
  const episodes = roomEpisodes.get(roomName) || [];
  return episodes.slice(-limit);
};

// --- Mood-based behavior adjustments ---

export const getMoodAdjustments = (mood) => {
  switch (mood) {
    case 'chill':
      return {
        toxicityThreshold: 0.7,      // More lenient
        spamThreshold: 0.6,
        aiHumorLevel: 0.6,
        aiFormality: 0.3,
      };
    case 'chaotic':
      return {
        toxicityThreshold: 0.8,      // Very lenient
        spamThreshold: 0.8,
        aiHumorLevel: 0.9,
        aiFormality: 0.1,
      };
    case 'supportive':
      return {
        toxicityThreshold: 0.4,      // Stricter
        spamThreshold: 0.5,
        aiHumorLevel: 0.3,
        aiFormality: 0.6,
      };
    case 'serious':
      return {
        toxicityThreshold: 0.3,      // Very strict
        spamThreshold: 0.4,
        aiHumorLevel: 0.1,
        aiFormality: 0.9,
      };
    case 'comedy':
      return {
        toxicityThreshold: 0.7,
        spamThreshold: 0.7,
        aiHumorLevel: 1.0,
        aiFormality: 0.2,
      };
    default: // 'balanced'
      return {
        toxicityThreshold: 0.5,
        spamThreshold: 0.5,
        aiHumorLevel: 0.5,
        aiFormality: 0.5,
      };
  }
};

// --- Safety mode adjustments ---

export const getSafetyAdjustments = (safetyMode) => {
  switch (safetyMode) {
    case 'anything_goes':
      return {
        allowProfanity: true,
        allowControversial: true,
        toxicityMultiplier: 0.5,     // Half the usual toxicity score
        autoBlockThreshold: 10,       // Very high
      };
    case 'spicy_but_sane':
      return {
        allowProfanity: true,
        allowControversial: true,
        toxicityMultiplier: 0.7,
        autoBlockThreshold: 8,
      };
    case 'balanced':
      return {
        allowProfanity: false,
        allowControversial: true,
        toxicityMultiplier: 1.0,
        autoBlockThreshold: 5,
      };
    case 'support_only':
      return {
        allowProfanity: false,
        allowControversial: false,
        toxicityMultiplier: 1.5,      // More sensitive
        autoBlockThreshold: 3,
      };
    case 'teen_safe':
      return {
        allowProfanity: false,
        allowControversial: false,
        toxicityMultiplier: 2.0,      // Very sensitive
        autoBlockThreshold: 2,
      };
    default:
      return getSafetyAdjustments('balanced');
  }
};

// --- Combined room settings ---

export const getRoomSettings = (roomName) => {
  const config = getRoomConfig(roomName);
  const moodSettings = getMoodAdjustments(config.mood);
  const safetySettings = getSafetyAdjustments(config.safetyMode);
  
  return {
    ...config,
    ...moodSettings,
    ...safetySettings,
  };
};

// --- Analytics & Insights ---

export const analyzeRoomActivity = (roomName, messages) => {
  if (!messages || !messages.length) {
    return {
      messageCount: 0,
      uniqueUsers: 0,
      avgSentiment: 0,
      topTopics: [],
      activityLevel: 'inactive',
    };
  }

  const recent = messages.slice(-100); // Last 100 messages
  const users = new Set(recent.map(m => m.user).filter(Boolean));
  
  // Simple sentiment approximation
  let sentimentScore = 0;
  const positiveWords = ['good', 'great', 'awesome', 'love', 'happy', 'thanks', 'excellent', 'nice'];
  const negativeWords = ['bad', 'hate', 'terrible', 'awful', 'angry', 'sad', 'stupid', 'suck'];
  
  recent.forEach(m => {
    if (!m.text) return;
    const lower = m.text.toLowerCase();
    positiveWords.forEach(w => { if (lower.includes(w)) sentimentScore++; });
    negativeWords.forEach(w => { if (lower.includes(w)) sentimentScore--; });
  });
  
  // Activity level based on message frequency
  const timeSpan = messages.length > 1 
    ? (messages[messages.length - 1].timestamp || Date.now()) - (messages[0].timestamp || Date.now())
    : 0;
  const messagesPerMinute = timeSpan > 0 ? (recent.length / (timeSpan / 60000)) : 0;
  
  let activityLevel = 'inactive';
  if (messagesPerMinute > 5) activityLevel = 'very_active';
  else if (messagesPerMinute > 2) activityLevel = 'active';
  else if (messagesPerMinute > 0.5) activityLevel = 'moderate';
  else if (messagesPerMinute > 0) activityLevel = 'slow';
  
  return {
    messageCount: recent.length,
    uniqueUsers: users.size,
    avgSentiment: sentimentScore / Math.max(recent.length, 1),
    activityLevel,
    messagesPerMinute: Math.round(messagesPerMinute * 10) / 10,
  };
};

// --- Export all room data (for potential persistence) ---

export const exportRoomState = (roomName) => {
  return {
    config: roomConfigs.get(roomName),
    summary: roomSummaries.get(roomName),
    episodes: roomEpisodes.get(roomName),
  };
};

export const importRoomState = (roomName, state) => {
  if (state.config) roomConfigs.set(roomName, state.config);
  if (state.summary) roomSummaries.set(roomName, state.summary);
  if (state.episodes) roomEpisodes.set(roomName, state.episodes);
};

// --- Cleanup ---

export const cleanupOldData = () => {
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  // Clean old summaries
  for (const [roomName, summary] of roomSummaries.entries()) {
    if (now - summary.createdAt > maxAge) {
      roomSummaries.delete(roomName);
    }
  }
  
  // Clean old episodes (keep last 50 per room)
  for (const [roomName, episodes] of roomEpisodes.entries()) {
    if (episodes.length > 50) {
      roomEpisodes.set(roomName, episodes.slice(-50));
    }
  }
};

// Run cleanup once per hour
setInterval(cleanupOldData, 60 * 60 * 1000);
