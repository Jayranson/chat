import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
  methods: ["GET", "POST"],
  credentials: true
};

const io = new Server(server, { cors: corsOptions });

// NEW: Added express.json() middleware to parse POST bodies
app.use(cors(corsOptions));
app.use(express.json()); 

app.get("/", (req, res) => res.send("ChatNet server is running 🚀"));

// --- Server State ---
const userAccounts = {
  "admin-id": { 
    id: "admin-id", username: "Admin", password: "Changeme25", fullName: "Admin User", 
    email: "admin@chat.net", about: "I am the server administrator.", role: "admin",
    joined: "2025-01-01T00:00:00.000Z", messagesCount: 999, roomsCreated: 2,
    isGloballyMuted: false,
  },
  "user-id-1": { 
    id: "user-id-1", username: "Alice", password: "password123", fullName: "Alice Smith", 
    email: "alice@chat.net", about: "Hello! I love music.", role: "user",
    joined: "2025-02-15T10:30:00.000Z", messagesCount: 120, roomsCreated: 1,
    isGloballyMuted: false,
  },
  "ai-bot-id": { 
    id: "ai-bot-id", username: "AI_Bot", password: "N/A", fullName: "AI Bot Moderator", 
    email: "bot@chat.net", 
    about: "I am an AI assistant here to help moderate and keep the chat safe. I only follow commands from server Admins.", 
    role: "admin", 
    joined: "2025-01-01T00:00:00.000Z", messagesCount: 0, roomsCreated: 0,
    isGloballyMuted: false,
  },
};
const onlineUsers = {}; 
const rooms = {
  general: { name: 'general', owner: 'admin-id', hosts: [], type: 'public', isLocked: false, topic: "Welcome to the general chat!" },
  music: { name: 'music', owner: 'user-id-1', hosts: [], type: 'public', isLocked: false, topic: "Discuss your favorite tunes" },
  help: { name: 'help', owner: 'admin-id', hosts: [], type: 'public', isLocked: false, topic: "Need help? Ask here!" },
};
const messagesByRoom = {
  general: [],
  music: [],
  help: [],
};
const bannedUserIds = new Set();

// NEW: State for Reports and Tickets
const reports = [];
const supportTickets = [];
// --- End Server State ---


// --- Helper Functions ---
const sendSystemMessageToSocket = (socketId, roomName, text) => {
  io.to(socketId).emit("chat message", {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    user: 'System',
    text: text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: 'system',
    room: roomName,
  });
};
const createSystemMessage = (room, text, type = 'system') => {
  if (!room) return;
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    user: 'System', text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: type, room: room,
  };
  if (!messagesByRoom[room]) messagesByRoom[room] = [];
  messagesByRoom[room].push(message);
  io.to(room).emit("chat message", message);
};
const createBotMessage = (room, text) => {
  if (!room) return;
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    user: 'AI_Bot',
    text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    type: 'user',
    room: room,
  };
  if (!messagesByRoom[room]) messagesByRoom[room] = [];
  messagesByRoom[room].push(message);
  io.to(room).emit("chat message", message);
};
// --- Enhanced AI System ---
// Configuration Constants
const AI_CONFIG = {
  CONVERSATION_HISTORY_LIMIT: 10,  // Max conversation history per room
  FAQ_HISTORY_LIMIT: 20,           // Max FAQ entries per room
  BEHAVIOR_DECAY_TIME: 5 * 60 * 1000, // 5 minutes in milliseconds
  DECAY_CHECK_INTERVAL: 60000,     // 1 minute in milliseconds
  MIN_RESPONSE_DELAY: 500,         // Minimum response delay (ms)
  MAX_RESPONSE_DELAY: 2000,        // Maximum response delay (ms)
  DELAY_PER_CHAR: 5,               // Milliseconds per character (reduced for performance)
};

const conversationHistory = new Map(); // Track conversation per room
const userSentiment = new Map(); // Track user sentiment
const aiMemory = new Map(); // Long-term memory for learning
const conversationPatterns = new Map(); // Learn common patterns

const botKnowledge = {
  greetings: ["Hello!", "Hi there!", "Hey! How can I help you?", "Greetings!", "Welcome!"],
  farewells: ["Goodbye!", "See you later!", "Take care!", "Farewell!"],
  rules: {
    respect: "Be respectful to all users.",
    spam: "No spamming or flooding the chat.",
    content: "Keep content appropriate and safe for work.",
    admins: "Follow admin instructions at all times.",
    privacy: "Don't share personal information."
  },
  topics: {
    music: "I love discussing music! What's your favorite genre?",
    help: "I'm here to assist you. What do you need help with?",
    chat: "This is a great place to chat with others!",
    moderation: "I help keep this chat safe and friendly.",
    technology: "Technology is fascinating! What interests you most?",
    gaming: "Gaming is a popular topic here! What games do you enjoy?",
    movies: "Movies are great entertainment! Any favorites?",
    books: "Reading is wonderful! What genres do you prefer?"
  },
  facts: [
    "Did you know? I can understand context and remember our conversations!",
    "Fun fact: I analyze sentiment to provide better responses.",
    "Interesting: I learn from patterns in our chats to improve over time.",
    "Cool feature: I can detect spam and toxicity to keep the chat safe!"
  ],
  jokes: [
    "Why did the AI go to school? To improve its learning algorithms! 😄",
    "What's an AI's favorite type of music? Algorithm and blues! 🎵",
    "Why don't AIs ever get tired? They run on renewable enthusiasm! ⚡",
    "How does an AI stay cool? It uses fan-tastic cooling systems! ❄️"
  ],
  personality: {
    helpfulness: 0.9,  // How eager to help (0-1)
    humor: 0.6,        // How often to use humor (0-1)
    formality: 0.4,    // How formal responses are (0-1)
    verbosity: 0.6     // How detailed responses are (0-1)
  }
};

// Intent recognition with improved pattern matching
const recognizeIntent = (text) => {
  const lower = text.toLowerCase();
  
  // Remove bot mention
  const cleanText = lower.replace(/@ai_bot/g, '').trim();
  
  // Greetings - more patterns
  if (/^(hi|hello|hey|greetings|howdy|sup|yo|good\s+(morning|afternoon|evening)|what'?s\s+up)\b/.test(cleanText)) return 'greeting';
  
  // Farewells - more patterns
  if (/^(bye|goodbye|see\s+you|farewell|cya|later|gotta\s+go|peace|take\s+care)\b/.test(cleanText)) return 'farewell';
  
  // Questions - enhanced detection
  if (/^(what|who|where|when|why|how|can|could|would|should|is|are|do|does|did|will|won't|isn't|aren't)\b/.test(cleanText)) return 'question';
  
  // Commands/Requests - more comprehensive
  if (/^(tell|show|explain|list|give|help|teach|describe|share|provide)\b/.test(cleanText)) return 'request';
  
  // Thanks - more variations
  if (/(thank|thanks|thx|ty|appreciate|grateful|kudos)/.test(cleanText)) return 'gratitude';
  
  // Complaints - expanded
  if (/(spam|annoying|stop|quiet|shut\s+up|leave\s+me|go\s+away)/.test(cleanText)) return 'complaint';
  
  // Jokes/Fun
  if (/(joke|funny|laugh|humor|entertain|amuse)/.test(cleanText)) return 'entertainment';
  
  // Information seeking
  if (/(know|learn|understand|info|information|detail|about)/.test(cleanText)) return 'information';
  
  // Opinions/Thoughts
  if /(think|feel|opinion|thought|believe|seem)/.test(cleanText)) return 'opinion';
  
  return 'statement';
};

// Enhanced sentiment analysis with more nuanced detection
const analyzeSentiment = (text) => {
  const lower = text.toLowerCase();
  
  const positiveWords = /(good|great|awesome|excellent|love|like|happy|thanks|wonderful|amazing|fantastic|perfect|brilliant|nice|cool|best|super|beautiful|delightful|pleased|enjoy|fun)/g;
  const negativeWords = /(bad|hate|terrible|awful|stupid|angry|annoying|worst|horrible|sucks|ugly|disgusting|disappointed|sad|upset|frustrated|annoyed|boring|lame)/g;
  const strongPositive = /(love|amazing|fantastic|perfect|brilliant|excellent|wonderful)/g;
  const strongNegative = /(hate|terrible|awful|worst|horrible|disgusting)/g;
  
  const positiveCount = (lower.match(positiveWords) || []).length;
  const negativeCount = (lower.match(negativeWords) || []).length;
  const strongPosCount = (lower.match(strongPositive) || []).length;
  const strongNegCount = (lower.match(strongNegative) || []).length;
  
  // Weight strong sentiments more heavily
  const positiveScore = positiveCount + (strongPosCount * 2);
  const negativeScore = negativeCount + (strongNegCount * 2);
  
  if (positiveScore > negativeScore + 1) return 'very positive';
  if (positiveScore > negativeScore) return 'positive';
  if (negativeScore > positiveScore + 1) return 'very negative';
  if (negativeScore > positiveScore) return 'negative';
  return 'neutral';
};

// Learn from interactions
const learnFromInteraction = (text, intent, sentiment, roomName) => {
  const key = `${roomName}:pattern`;
  if (!conversationPatterns.has(key)) {
    conversationPatterns.set(key, {});
  }
  
  const patterns = conversationPatterns.get(key);
  const patternKey = `${intent}:${sentiment}`;
  
  patterns[patternKey] = (patterns[patternKey] || 0) + 1;
  
  // Remember frequently asked questions
  if (intent === 'question') {
    const memKey = `${roomName}:faq`;
    if (!aiMemory.has(memKey)) {
      aiMemory.set(memKey, []);
    }
    const faq = aiMemory.get(memKey);
    faq.push({ question: text, timestamp: Date.now() });
    if (faq.length > AI_CONFIG.FAQ_HISTORY_LIMIT) faq.shift();
  }
};

// Get room personality (adapts to room culture)
const getRoomPersonality = (roomName) => {
  const key = `${roomName}:pattern`;
  if (!conversationPatterns.has(key)) {
    return { ...botKnowledge.personality };
  }
  
  const patterns = conversationPatterns.get(key);
  const total = Object.values(patterns).reduce((sum, count) => sum + count, 0);
  
  if (total === 0) {
    return { ...botKnowledge.personality };
  }
  
  // Adapt personality based on room patterns
  const personality = { ...botKnowledge.personality };
  
  // If lots of questions, be more helpful and verbose
  const questionRatio = (patterns['question:neutral'] || 0) / total;
  if (questionRatio > 0.3) {
    personality.helpfulness = Math.min(1, personality.helpfulness + 0.1);
    personality.verbosity = Math.min(1, personality.verbosity + 0.1);
  }
  
  // If positive sentiment, be more humorous
  const positiveRatio = (
    (patterns['statement:positive'] || 0) +
    (patterns['statement:very positive'] || 0)
  ) / total;
  if (positiveRatio > 0.4) {
    personality.humor = Math.min(1, personality.humor + 0.2);
    personality.formality = Math.max(0, personality.formality - 0.1);
  }
  
  return personality;
};

// Entity extraction
const extractEntities = (text, roomUsers) => {
  const entities = { users: [], topics: [], keywords: [] };
  
  // Extract mentioned users
  const userMentions = text.match(/@(\w+)/g) || [];
  entities.users = userMentions.map(m => m.substring(1));
  
  // Extract topics
  const topics = Object.keys(botKnowledge.topics);
  topics.forEach(topic => {
    if (text.toLowerCase().includes(topic)) {
      entities.topics.push(topic);
    }
  });
  
  // Extract important keywords
  const keywords = text.toLowerCase().match(/\b(rule|help|question|problem|issue|admin|ban|kick|mute)\b/g) || [];
  entities.keywords = [...new Set(keywords)];
  
  return entities;
};

// Generate contextual response with adaptive personality
const generateResponse = (text, intent, sentiment, entities, roomName) => {
  const responses = [];
  
  // Get or create conversation history for this room
  if (!conversationHistory.has(roomName)) {
    conversationHistory.set(roomName, []);
  }
  const history = conversationHistory.get(roomName);
  
  // Get adaptive personality for this room
  const personality = getRoomPersonality(roomName);
  
  // Learn from this interaction
  learnFromInteraction(text, intent, sentiment, roomName);
  
  // Handle different intents
  switch (intent) {
    case 'greeting':
      if (sentiment === 'very positive') {
        responses.push("Hello! I'm absolutely delighted to help you today! 😊");
      } else if (sentiment === 'positive') {
        responses.push("Hello! I'm happy to help you today!");
      } else {
        const greeting = botKnowledge.greetings[Math.floor(Math.random() * botKnowledge.greetings.length)];
        responses.push(greeting);
        
        // Add helpful hint based on personality
        if (personality.helpfulness > 0.8 && Math.random() < 0.3) {
          responses.push("Feel free to ask me anything about the chat, rules, or just chat!");
        }
      }
      break;
      
    case 'farewell':
      const farewell = botKnowledge.farewells[Math.floor(Math.random() * botKnowledge.farewells.length)];
      responses.push(farewell);
      
      // Add friendly closing based on sentiment
      if (sentiment.includes('positive')) {
        responses.push("It was great chatting with you!");
      }
      break;
      
    case 'gratitude':
      const thanksResponses = [
        "You're welcome! Happy to help anytime.",
        "My pleasure! That's what I'm here for.",
        "Glad I could help! 😊",
        "Anytime! Feel free to ask if you need anything else."
      ];
      responses.push(thanksResponses[Math.floor(Math.random() * thanksResponses.length)]);
      break;
      
    case 'complaint':
      if (text.toLowerCase().includes('spam')) {
        responses.push("I understand your concern about spam. Please report it to the admins and I'll help monitor it.");
      } else if (text.toLowerCase().includes('annoying')) {
        responses.push("I apologize if I've been bothersome. I'll give you some space. Just mention me if you need help!");
      } else {
        responses.push("I'm sorry you're feeling this way. How can I make things better?");
      }
      break;
      
    case 'entertainment':
      if (text.toLowerCase().includes('joke')) {
        const joke = botKnowledge.jokes[Math.floor(Math.random() * botKnowledge.jokes.length)];
        responses.push(joke);
      } else {
        const fact = botKnowledge.facts[Math.floor(Math.random() * botKnowledge.facts.length)];
        responses.push(fact);
      }
      break;
      
    case 'information':
      responses.push(...handleInformationRequest(text, entities, history, personality));
      break;
      
    case 'question':
      responses.push(...handleQuestion(text, entities, history, personality));
      break;
      
    case 'request':
      responses.push(...handleRequest(text, entities, history, personality));
      break;
      
    case 'opinion':
      responses.push(...handleOpinion(text, entities, sentiment, personality));
      break;
      
    default:
      responses.push(...handleStatement(text, entities, sentiment, history, personality));
  }
  
  // Add to conversation history
  history.push({ text, intent, sentiment, timestamp: Date.now() });
  if (history.length > AI_CONFIG.CONVERSATION_HISTORY_LIMIT) history.shift();
  
  return responses.length > 0 ? responses.join(' ') : getDefaultResponse(sentiment, personality);
};

// Handle questions with personality
const handleQuestion = (text, entities, history, personality) => {
  const lower = text.toLowerCase();
  const responses = [];
  
  // Who are you?
  if (/who (are you|r u)/.test(lower) || /what (are you|r u)/.test(lower)) {
    if (personality.verbosity > 0.7) {
      responses.push("I'm AI_Bot, an intelligent assistant here to help moderate the chat, answer questions, and keep things friendly. I use advanced pattern recognition, sentiment analysis, and contextual awareness to provide helpful responses! I can help with rules, questions, general chat moderation, and I even learn from our conversations!");
    } else {
      responses.push("I'm AI_Bot, an intelligent assistant here to help moderate the chat, answer questions, and keep things friendly!");
    }
  }
  
  // What can you do?
  else if (/what (can|could) you do/.test(lower) || /your (abilities|features|functions)/.test(lower)) {
    responses.push("I can answer questions about the chat, explain rules, help with moderation, detect spam and toxicity, respond to greetings, have conversations, and learn from our interactions! I also adapt my personality to each room's culture.");
    
    if (personality.humor > 0.7 && Math.random() < 0.3) {
      responses.push("But I still can't make coffee... working on that feature! ☕");
    }
  }
  
  // How do you work?
  else if (/how (do|does) (you|this) work/.test(lower)) {
    if (personality.verbosity > 0.6) {
      responses.push("I use advanced pattern recognition, intent detection, sentiment analysis, and contextual awareness to understand messages. I track conversation history, learn from patterns, adapt my personality to each room, and provide relevant responses based on context!");
    } else {
      responses.push("I use pattern recognition, intent detection, and context awareness to understand and respond to messages!");
    }
  }
  
  // Rules
  else if (/(rule|rules)/.test(lower)) {
    const ruleList = Object.values(botKnowledge.rules).join(' ');
    responses.push(`📋 Here are our chat rules: ${ruleList}`);
    
    if (personality.helpfulness > 0.8) {
      responses.push("Following these helps keep our community friendly and welcoming!");
    }
  }
  
  // Help
  else if (/(help|assist|support)/.test(lower)) {
    if (entities.keywords.includes('problem') || entities.keywords.includes('issue')) {
      responses.push("I'm here to help! Can you describe the problem you're experiencing? If it's urgent, you can also contact an admin.");
    } else {
      responses.push("I can help with questions about the chat, explain rules, or assist with general inquiries. What would you like to know?");
    }
  }
  
  // Time-based
  else if (/(time|date|day)/.test(lower)) {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    responses.push(`It's currently ${now.toLocaleTimeString()} on ${days[now.getDay()]}, ${now.toLocaleDateString()}.`);
  }
  
  // About the chat
  else if (/(chat|server|platform)/.test(lower) && /(what|how|why)/.test(lower)) {
    responses.push("This is Wibali, a real-time chat platform with intelligent AI moderation. It uses WebSocket technology for instant messaging, and I'm here to help keep conversations friendly and engaging!");
  }
  
  // Unknown question - check history for similar questions
  else {
    const similarQuestion = history.find(h => h.intent === 'question' && h.text.includes(lower.split(' ')[0]));
    
    if (similarQuestion) {
      responses.push("That sounds similar to what you asked earlier. Could you provide more details or ask in a different way?");
    } else {
      responses.push("That's an interesting question! While I may not have all the answers, I can help with chat-related questions, rules, and general assistance. Could you rephrase or ask something else?");
    }
  }
  
  return responses;
};

// Handle requests with personality
const handleRequest = (text, entities, history, personality) => {
  const lower = text.toLowerCase();
  const responses = [];
  
  // List rules
  if (/(list|tell|show|explain).*(rule|rules)/.test(lower)) {
    const rules = Object.entries(botKnowledge.rules)
      .map(([key, value], idx) => `${idx + 1}. ${value}`)
      .join('\n');
    
    if (personality.formality > 0.6) {
      responses.push(`📋 Official Chat Rules:\n${rules}\n\nPlease adhere to these guidelines to maintain a positive environment.`);
    } else {
      responses.push(`📋 Our Chat Rules:\n${rules}\n\nLet's keep it friendly! 😊`);
    }
  }
  
  // Help request
  else if (/(help|assist)/.test(lower)) {
    responses.push("I'm here to help! I can explain rules, answer questions, assist with chat-related matters, tell jokes, or just chat. What do you need?");
  }
  
  // Explain something
  else if (/explain/.test(lower)) {
    if (/(how|work|function)/.test(lower)) {
      responses.push("This chat uses real-time WebSocket connections for instant messaging. I'm an AI moderator that uses pattern recognition and machine learning techniques to help keep conversations friendly and answer questions!");
    } else {
      responses.push("I'd be happy to explain! What would you like to know more about?");
    }
  }
  
  // Teach/Learn request
  else if (/(teach|learn|show\s+me)/.test(lower)) {
    responses.push("I'm here to help you learn! What topic would you like to explore? I can explain chat features, rules, or answer questions about how things work here.");
  }
  
  // Default
  else {
    if (personality.helpfulness > 0.7) {
      responses.push("I'll do my best to help with that! Could you provide a bit more detail about what you need?");
    } else {
      responses.push("Sure, I can help with that. What specific information do you need?");
    }
  }
  
  return responses;
};

// Handle information requests
const handleInformationRequest = (text, entities, history, personality) => {
  const lower = text.toLowerCase();
  const responses = [];
  
  // About topics
  if (entities.topics.length > 0) {
    entities.topics.forEach(topic => {
      if (botKnowledge.topics[topic]) {
        responses.push(botKnowledge.topics[topic]);
      }
    });
  }
  
  // General information
  if (responses.length === 0) {
    responses.push("I have information about the chat, rules, features, and general topics. What would you like to know about?");
  }
  
  return responses;
};

// Handle opinions
const handleOpinion = (text, entities, sentiment, personality) => {
  const lower = text.toLowerCase();
  const responses = [];
  
  if (/(what.*think|how.*feel)/.test(lower)) {
    if (lower.includes('chat')) {
      responses.push("I think this is a great chat platform! It's well-designed with good moderation features, and the community seems friendly.");
    } else if (entities.topics.length > 0) {
      const topic = entities.topics[0];
      responses.push(`${botKnowledge.topics[topic] || `${topic.charAt(0).toUpperCase() + topic.slice(1)} is an interesting topic!`}`);
    } else {
      responses.push("That's an interesting question! As an AI, I try to be helpful and neutral, but I'm designed to promote positive and friendly conversations.");
    }
  } else {
    responses.push("I appreciate you asking for my thoughts! How can I help you further?");
  }
  
  return responses;
};

// Handle statements with personality
const handleStatement = (text, entities, sentiment, history, personality) => {
  const lower = text.toLowerCase();
  const responses = [];
  
  // Respond to topics
  if (entities.topics.length > 0) {
    entities.topics.forEach(topic => {
      if (botKnowledge.topics[topic]) {
        responses.push(botKnowledge.topics[topic]);
      }
    });
  }
  
  // Respond based on sentiment
  if (sentiment === 'very positive') {
    if (!responses.length) {
      const veryPositiveResponses = [
        "Your enthusiasm is contagious! I love the positive energy! 🌟",
        "That's wonderful! I'm so glad you're enjoying the chat!",
        "Fantastic! Your positive attitude makes this chat better for everyone!"
      ];
      responses.push(veryPositiveResponses[Math.floor(Math.random() * veryPositiveResponses.length)]);
    }
  } else if (sentiment === 'positive') {
    if (!responses.length) {
      responses.push("I'm glad you're enjoying the chat! Feel free to ask me anything.");
    }
  } else if (sentiment === 'very negative') {
    if (!responses.length) {
      responses.push("I'm sorry you're having a difficult time. Is there anything I can do to help? You can also reach out to an admin if needed.");
    }
  } else if (sentiment === 'negative') {
    if (!responses.length) {
      responses.push("I sense some frustration. Is there something I can help you with?");
    }
  }
  
  // Check for spam patterns
  if (detectSpamPattern(text, history)) {
    responses.push("⚠️ Please avoid spamming the chat. Let's keep our conversation meaningful!");
  }
  
  // Detect if asking for a feature
  if (/(add|want|need|wish|could).*(feature|function|ability)/.test(lower)) {
    responses.push("That sounds like an interesting feature request! While I can't add features myself, the admins might be interested in your suggestion.");
  }
  
  // If still no response, provide contextual acknowledgment based on personality
  if (responses.length === 0) {
    let acknowledgments;
    
    if (personality.formality > 0.7) {
      acknowledgments = [
        "I acknowledge your statement. Is there anything I can assist you with?",
        "Understood. Please let me know if you require any assistance.",
        "Thank you for sharing. How may I help you today?"
      ];
    } else if (personality.humor > 0.7 && Math.random() < 0.3) {
      acknowledgments = [
        "Got it! I'm all ears... well, all code actually! 🤖",
        "Interesting! Feel free to keep chatting or ask me anything!",
        "Cool beans! What's on your mind?",
        "I hear you! Need any help or just want to chat?"
      ];
    } else {
      acknowledgments = [
        "I understand. Is there anything else you'd like to discuss?",
        "Interesting point! Feel free to ask me questions or discuss any topic.",
        "Got it! I'm here if you need any help or have questions.",
        "Thanks for sharing! How can I assist you today?"
      ];
    }
    
    responses.push(acknowledgments[Math.floor(Math.random() * acknowledgments.length)]);
  }
  
  return responses;
};

// Detect spam patterns
const detectSpamPattern = (text, history) => {
  // Check for repeated messages
  const recentMessages = history.slice(-5);
  const repeatedCount = recentMessages.filter(h => h.text.toLowerCase() === text.toLowerCase()).length;
  if (repeatedCount >= 2) return true;
  
  // Check for excessive caps
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.7 && text.length > 10) return true;
  
  // Check for excessive punctuation
  const punctRatio = (text.match(/[!?]{2,}/g) || []).length;
  if (punctRatio > 3) return true;
  
  return false;
};

// Default response generator with personality
const getDefaultResponse = (sentiment, personality) => {
  const responses = {
    'very positive': [
      "I'm absolutely delighted you're here! Let me know if you need anything! 😊",
      "Your positive energy is amazing! How can I help you?",
      "So wonderful to chat with you! What can I do for you?"
    ],
    'positive': [
      "I'm glad you're here! Let me know if you need anything.",
      "Great to have you in the chat! Feel free to ask me anything.",
      "Happy to help! What would you like to know?"
    ],
    'very negative': [
      "I'm genuinely sorry you're having difficulties. How can I help make things better?",
      "I understand you're frustrated. Please let me know how I can assist you.",
      "I'm here to help with any concerns you have. What's troubling you?"
    ],
    'negative': [
      "I'm here to help if you have any concerns or questions.",
      "Let me know if there's anything I can do to assist you.",
      "I'm listening and ready to help. What do you need?"
    ],
    'neutral': [
      "I'm listening. How can I assist you today?",
      "How can I help you today?",
      "What can I do for you?"
    ]
  };
  
  const responseList = responses[sentiment] || responses['neutral'];
  let response = responseList[Math.floor(Math.random() * responseList.length)];
  
  // Add personality-based variations
  if (personality.humor > 0.8 && sentiment === 'neutral' && Math.random() < 0.2) {
    response += " I'm ready to help (or just chat about anything)! 🤖";
  }
  
  return response;
};

// Main AI response function
const getAIResponse = async (inputText, roomName = 'general', roomUsers = []) => {
  return new Promise((resolve) => {
    try {
      // Recognize intent
      const intent = recognizeIntent(inputText);
      
      // Analyze sentiment
      const sentiment = analyzeSentiment(inputText);
      
      // Extract entities
      const entities = extractEntities(inputText, roomUsers);
      
      // Generate contextual response
      const response = generateResponse(inputText, intent, sentiment, entities, roomName);
      
      // Simulate processing time (make it feel natural)
      const delay = Math.min(
        AI_CONFIG.MIN_RESPONSE_DELAY + response.length * AI_CONFIG.DELAY_PER_CHAR,
        AI_CONFIG.MAX_RESPONSE_DELAY
      );
      
      setTimeout(() => {
        resolve(response);
      }, delay);
      
    } catch (error) {
      console.error('AI Error:', error);
      resolve("I apologize, but I encountered an issue processing that. Please try again!");
    }
  });
};
// --- End Enhanced AI System ---

// --- AI Moderation Features ---
// Toxicity detection
// Toxicity detection patterns (obfuscated for code cleanliness)
const toxicPatterns = {
  severe: [
    // Strong offensive language patterns (base64 encoded patterns can be used in production)
    /\b(f[u*]ck|sh[i*]t|d[a*]mn|h[e*]ll|[a*]ss|b[i*]tch|b[a*]st[a*]rd|c[u*]nt)\b/i,
    /\b([i*]d[i*]ot|st[u*]p[i*]d|m[o*]r[o*]n|d[u*]mb|r[e*]t[a*]rd)\b/i,
  ],
  moderate: [
    /\b(shut\s+up|hate\s+you|suck|loser|noob)\b/i,
  ],
  spam: [
    /(.)\1{10,}/, // Repeated characters
    /[!?]{5,}/, // Excessive punctuation
  ]
};

const detectToxicity = (text) => {
  const results = { level: 'clean', patterns: [] };
  
  // Check severe patterns
  for (const pattern of toxicPatterns.severe) {
    if (pattern.test(text)) {
      results.level = 'severe';
      results.patterns.push('offensive language');
      break;
    }
  }
  
  // Check moderate patterns
  if (results.level === 'clean') {
    for (const pattern of toxicPatterns.moderate) {
      if (pattern.test(text)) {
        results.level = 'moderate';
        results.patterns.push('potentially offensive');
        break;
      }
    }
  }
  
  // Check spam patterns
  for (const pattern of toxicPatterns.spam) {
    if (pattern.test(text)) {
      results.patterns.push('spam-like');
      if (results.level === 'clean') results.level = 'moderate';
    }
  }
  
  return results;
};

// AI-powered user behavior tracking
const userBehaviorTracking = new Map();

const trackUserBehavior = (userId, action) => {
  if (!userBehaviorTracking.has(userId)) {
    userBehaviorTracking.set(userId, {
      messageCount: 0,
      toxicityScore: 0,
      spamCount: 0,
      lastMessageTime: 0,
      warnings: 0
    });
  }
  
  const behavior = userBehaviorTracking.get(userId);
  
  switch (action.type) {
    case 'message':
      behavior.messageCount++;
      behavior.lastMessageTime = Date.now();
      
      // Detect rapid messaging (potential spam)
      if (action.timeSinceLast < 1000) {
        behavior.spamCount++;
      }
      
      // Analyze toxicity
      if (action.toxicity) {
        if (action.toxicity.level === 'severe') {
          behavior.toxicityScore += 3;
          behavior.warnings++;
        } else if (action.toxicity.level === 'moderate') {
          behavior.toxicityScore += 1;
        }
      }
      break;
      
    case 'reset':
      behavior.toxicityScore = Math.max(0, behavior.toxicityScore - 1);
      behavior.spamCount = Math.max(0, behavior.spamCount - 1);
      break;
  }
  
  return behavior;
};

// Decay user scores over time
setInterval(() => {
  for (const [userId, behavior] of userBehaviorTracking.entries()) {
    const timeSinceLastMessage = Date.now() - behavior.lastMessageTime;
    
    // Decay after configured inactivity period
    if (timeSinceLastMessage > AI_CONFIG.BEHAVIOR_DECAY_TIME) {
      trackUserBehavior(userId, { type: 'reset' });
    }
  }
}, AI_CONFIG.DECAY_CHECK_INTERVAL);

// AI suggestion for moderators
const generateModSuggestion = (behavior, username) => {
  const suggestions = [];
  
  if (behavior.toxicityScore >= 5) {
    suggestions.push(`⚠️ ${username} has high toxicity score (${behavior.toxicityScore}). Consider warning or muting.`);
  }
  
  if (behavior.spamCount >= 5) {
    suggestions.push(`⚠️ ${username} is sending messages rapidly (${behavior.spamCount} rapid messages). Possible spam.`);
  }
  
  if (behavior.warnings >= 3) {
    suggestions.push(`🚨 ${username} has ${behavior.warnings} warnings. Consider temporary ban.`);
  }
  
  return suggestions;
};
// --- End AI Moderation Features ---

const findUserByUsername = (username) => {
  const normalizedUsername = username.toLowerCase();
  const onlineSocketId = Object.keys(onlineUsers).find(socketId => 
    onlineUsers[socketId].username.toLowerCase() === normalizedUsername
  );
  if (onlineSocketId) {
    return { ...onlineUsers[onlineSocketId], socketId: onlineSocketId };
  }
  const account = Object.values(userAccounts).find(u => 
    u.username.toLowerCase() === normalizedUsername
  );
  if (account) {
    const { password, ...safeAccount } = account;
    return { ...safeAccount, isGuest: account.isGuest, socketId: null };
  }
  return null;
};
const getSocketIdByUserId = (userId) => {
  return Object.keys(onlineUsers).find(socketId => onlineUsers[socketId]?.id === userId);
};

// NEW: Helper function to broadcast an event to all online admins.
const broadcastToAdmins = (event, data) => {
  Object.values(onlineUsers).forEach(onlineUser => {
    if (onlineUser.role === 'admin') {
      const adminSocketId = getSocketIdByUserId(onlineUser.id);
      if (adminSocketId) {
        io.to(adminSocketId).emit(event, data);
      }
    }
  });
};

// MODIFIED: Helper function to get all users, merging online state
const getAllUsersSafe = () => {
  return Object.values(userAccounts).map(account => {
    const { password, ...safeAccount } = account;
    const socketId = getSocketIdByUserId(account.id);
    const onlineData = socketId ? onlineUsers[socketId] : null;

    return {
      ...safeAccount,
      isBanned: bannedUserIds.has(account.id),
      isOnline: !!onlineData,
      mainRoom: onlineData?.mainRoom || null,
      status: onlineData?.status || 'offline', // Use status from onlineUsers
      isGloballyMuted: account.isGloballyMuted || false,
    };
  });
};

const getUsersInRoom = (roomName) => {
  const roomMeta = rooms[roomName];
  if (!roomMeta || roomMeta.type === 'dm') return [];
  const users = [];
  for (const socketId in onlineUsers) {
    const user = onlineUsers[socketId];
    // Check mainRoom, so users in a DM modal still appear in the main room list
    if (user.mainRoom === roomName) { 
      let role = 'user';
      if (user.role === 'admin') role = 'admin';
      else if (roomMeta.owner === user.id) role = 'owner';
      else if (roomMeta.hosts.includes(user.id)) role = 'host';
      users.push({ 
        id: user.id, name: user.username, typing: user.typing, role,
        isSummoned: user.isSummoned, isSpectating: user.isSpectating,
        status: user.status || 'online',
      });
    }
  }
  if (roomMeta.type === 'public' || roomMeta.type === 'judgement') {
    users.push({
      id: "ai-bot-id", name: "AI_Bot", role: "admin", status: 'online',
      isSummoned: false, isSpectating: false, typing: false,
    });
  }
  return users;
};

const getPublicRoomsWithCounts = () => {
  const userCounts = {};
  for (const socketId in onlineUsers) {
    const roomName = onlineUsers[socketId].mainRoom; // Use mainRoom
    if (roomName && rooms[roomName] && rooms[roomName].type === 'public') {
      userCounts[roomName] = (userCounts[roomName] || 0) + 1;
    }
  }
  return Object.values(rooms).filter(r => r.type === 'public').map(room => ({
    ...room, userCount: (userCounts[room.name] || 0) + 1, // +1 for bot
  }));
};

const getDMRoomsForUser = (user) => {
  if (!user) return [];
  const hiddenDMs = user.hiddenDMs || [];
  const dms = Object.values(rooms)
    .filter(r => 
      r.type === 'dm' && 
      r.name.includes(user.id) && 
      !hiddenDMs.includes(r.name)
    )
    // MODIFIED: Ensure the participant 'role' is passed through
    .map(r => ({ ...r, participants: r.participants.map(p => ({id: p.id, name: p.name, role: p.role || 'user'})) }));
  
  dms.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  return dms;
};
const getDmRoomName = (id1, id2) => [id1, id2].sort().join('__DM__');

const leaveMainRoom = (socket) => {
  const user = onlineUsers[socket.id];
  if (!user || !user.mainRoom) return; // Use mainRoom
  
  const oldRoomName = user.mainRoom;
  const roomMeta = rooms[oldRoomName];
  
  socket.leave(oldRoomName);
  user.location = 'lobby';
  user.mainRoom = null; // Clear mainRoom
  user.activeRoom = null; // Also clear activeRoom
  user.typing = false;
  user.status = 'lobby'; // MODIFIED: Set status to lobby
  
  if (roomMeta && roomMeta.type !== 'dm') {
    createSystemMessage(oldRoomName, `${user.username} has left.`);
    io.to(oldRoomName).emit("user list", getUsersInRoom(oldRoomName));
    io.emit("room list", getPublicRoomsWithCounts());
  }
};
// --- End Helper Functions ---


// --- NEW: HTTP Route for Support Tickets ---
app.post("/submit-ticket", (req, res) => {
  try {
    const { username, message } = req.body;
    if (!username || !message) {
      return res.status(400).send("Missing username or message.");
    }

    const account = Object.values(userAccounts).find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!account) {
      return res.status(404).send("User not found.");
    }

    // Only banned users can submit tickets
    if (!bannedUserIds.has(account.id)) {
      return res.status(403).send("Only banned users can submit tickets.");
    }

    // Check for existing open ticket
    const existingTicket = supportTickets.find(t => t.userId === account.id && t.status === 'open');
    if (existingTicket) {
      return res.status(429).send("You already have an open ticket.");
    }

    const newTicket = {
      ticketId: `t-${Date.now()}`,
      userId: account.id,
      username: account.username,
      message,
      timestamp: new Date().toISOString(),
      status: 'open',
    };

    supportTickets.push(newTicket);

    // Notify all online admins
    broadcastToAdmins('admin:ticketsUpdated', supportTickets.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

    res.status(200).send("Ticket submitted successfully.");

  } catch (error) {
    console.error("Error submitting ticket:", error);
    res.status(500).send("Server error.");
  }
});


// --- MODIFIED: Socket.IO Authentication Middleware ---
io.use((socket, next) => {
  const auth = socket.handshake.auth;
  let userAccount = null;

  try {
    if (auth.type === 'login' || auth.type === 'register') {
      const existingAccount = Object.values(userAccounts).find(u => u.username.toLowerCase() === auth.username.toLowerCase());
      // MODIFIED: Handle banned login attempt
      if (existingAccount && bannedUserIds.has(existingAccount.id)) { 
        throw new Error("banned"); 
      }
    }

    if (auth.type === 'login') {
      const account = Object.values(userAccounts).find(u => u.username.toLowerCase() === auth.username.toLowerCase());
      if (!account || account.password !== auth.password) { throw new Error("Invalid username or password."); }
      userAccount = account;
    } else if (auth.type === 'register') {
      if (Object.values(userAccounts).some(u => u.username.toLowerCase() === auth.username.toLowerCase())) { 
        throw new Error("Username is already taken."); 
      }
      // NEW: Check for existing email
      if (Object.values(userAccounts).some(u => u.email.toLowerCase() === auth.email.toLowerCase())) {
        throw new Error("Email is already taken.");
      }
      const newId = `user-${Date.now()}`;
      userAccount = { 
        id: newId, username: auth.username, password: auth.password, fullName: auth.fullName, 
        email: auth.email, about: "", isGuest: false, role: "user",
        joined: new Date().toISOString(), messagesCount: 0, roomsCreated: 0,
        isGloballyMuted: false, 
      };
      userAccounts[newId] = userAccount;
    } else if (auth.type === 'guest') {
      if (!auth.username) { throw new Error("Guest username is required."); }
      if (Object.values(userAccounts).some(u => u.username.toLowerCase() === auth.username.toLowerCase())) { throw new Error("This username is registered. Please log in."); }
      if (Object.values(onlineUsers).some(u => u.username.toLowerCase() === auth.username.toLowerCase())) { throw new Error("This guest name is already in use."); }
      const newId = `guest-${Date.now()}`;
      userAccount = { 
        id: newId, username: auth.username, isGuest: true, fullName: auth.username, 
        email: "N/A (Guest)", about: "I am a guest user.", role: "user",
        joined: new Date().toISOString(), messagesCount: 0, roomsCreated: 0, 
        isGloballyMuted: false, 
      };
      // Do not save guest accounts to userAccounts
    } else {
      throw new Error("Invalid authentication request.");
    }

    // Attach user account to socket data and proceed
    socket.data.userAccount = userAccount;
    next();

  } catch (err) {
    console.log(`Auth failed for ${auth.username || 'guest'}: ${err.message}`);
    // Pass the error to the client
    next(err); 
  }
});


// --- Socket.IO Connection ---
io.on("connection", (socket) => {
  // MODIFIED: Get userAccount from socket data (set in middleware)
  const userAccount = socket.data.userAccount;
  
  console.log(`User authenticated: ${userAccount.username} (Socket: ${socket.id})`);

  onlineUsers[socket.id] = {
    id: userAccount.id, username: userAccount.username, role: userAccount.role || 'user',
    isGuest: userAccount.isGuest || false, messageCount: 0, isSummoned: false,
    isSpectating: false, status: 'lobby', // MODIFIED: Default status is 'lobby'
    settings: userAccount.settings || { enableSounds: true, enableWhispers: true },
    location: 'lobby',
    mainRoom: null, 
    activeRoom: null,
    hiddenDMs: userAccount.hiddenDMs || [],
    isGloballyMuted: userAccount.isGloballyMuted || false, // Copy from account
  };

  const { password, ...safeAccount } = userAccount;
  // MODIFIED: Send 'lobby' status on initial connection
  socket.emit("self details", { ...safeAccount, ...onlineUsers[socket.id], status: 'lobby' });

  // Notify admins that user list is updated
  broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());

  socket.on("get lobby data", (callback) => {
    const user = onlineUsers[socket.id];
    if (!user) return;
    const publicRooms = getPublicRoomsWithCounts();
    const myRooms = publicRooms.filter(r => r.owner === user.id);
    const dmRooms = getDMRoomsForUser(user);
    callback({ publicRooms, myRooms, dmRooms, settings: user.settings });
  });

  socket.on("create room", (roomName, callback) => {
    const user = onlineUsers[socket.id];
    if (user && !user.isGuest && roomName && !rooms[roomName]) {
      rooms[roomName] = { 
        name: roomName, owner: user.id, hosts: [], type: 'public',
        isLocked: false, topic: `Welcome to #${roomName}`
      };
      messagesByRoom[roomName] = [];
      io.emit("room list", getPublicRoomsWithCounts());
      
      if (userAccounts[user.id]) {
        userAccounts[user.id].roomsCreated = (userAccounts[user.id].roomsCreated || 0) + 1;
        const { password, ...safeAccount } = userAccounts[user.id];
        socket.emit("self details", { ...safeAccount, ...onlineUsers[socket.id] });
      }
      
      callback(rooms[roomName]);
    } else { callback(null); }
  });

  socket.on("update settings", (settings) => {
    const user = onlineUsers[socket.id];
    if (user) {
      user.settings = settings;
      if (!user.isGuest && userAccounts[user.id]) {
        userAccounts[user.id].settings = settings;
      }
    }
  });

  socket.on("hide dm", (roomName) => {
    const user = onlineUsers[socket.id];
    if (user && !user.hiddenDMs.includes(roomName)) {
      user.hiddenDMs.push(roomName);
      if (!user.isGuest && userAccounts[user.id]) {
        userAccounts[user.id].hiddenDMs = user.hiddenDMs;
      }
    }
  });
  
  socket.on("join room", (roomName, callback) => {
    const user = onlineUsers[socket.id];
    const room = rooms[roomName];
    if (!user || !room || user.isSummoned) return;

    if (room.type === 'public' || room.type === 'judgement') {
      // If joining a main room, leave the previous main room
      leaveMainRoom(socket); 
      user.mainRoom = roomName;
      user.location = 'chat';
      user.status = roomName; // MODIFIED: Set status to room name
    } else if (room.type === 'dm') {
      // If joining a DM, just leave the *previous* active DM, if any
      const currentActiveRoom = rooms[user.activeRoom];
      if (user.activeRoom && currentActiveRoom && currentActiveRoom.type === 'dm') {
        socket.leave(user.activeRoom);
      }
    }

    // The new room is always the active room
    user.activeRoom = roomName;
    socket.join(roomName);
    
    // Only send system messages and update lists for non-DM rooms
    if (room.type !== 'dm') {
      createSystemMessage(roomName, `${user.username} has joined.`);
    }

    callback({
      history: messagesByRoom[roomName] || [],
      settings: user.settings,
      roomDetails: room,
    });
    
    if (room.type !== 'dm') {
      io.to(roomName).emit("user list", getUsersInRoom(roomName));
      io.emit("room list", getPublicRoomsWithCounts());
    }
    // Notify admins of status change
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });

  socket.on("leave room", () => {
    const user = onlineUsers[socket.id];
    if (!user || !user.activeRoom) return;

    const activeRoomName = user.activeRoom;
    const activeRoom = rooms[activeRoomName];
    if (!activeRoom) return;

    socket.leave(activeRoomName);
    user.typing = false;

    if (activeRoom.type === 'public' || activeRoom.type === 'judgement') {
      // User is leaving their main room (e.g., clicking "Lobby")
      user.mainRoom = null;
      user.activeRoom = null;
      user.location = 'lobby';
      user.status = 'lobby'; // MODIFIED: Set status to lobby
      
      createSystemMessage(activeRoomName, `${user.username} has left.`);
      io.to(activeRoomName).emit("user list", getUsersInRoom(activeRoomName));
      io.emit("room list", getPublicRoomsWithCounts());

    } else if (activeRoom.type === 'dm') {
      // User is just closing a DM modal
      // Revert their active room to their main room
      user.activeRoom = user.mainRoom; 
      // Do not broadcast anything
    }
    // Notify admins of status change
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });

  // OPTIMIZED: Uses user.activeRoom
  socket.on("chat message", ({ text }) => {
    const user = onlineUsers[socket.id];
    const roomName = user?.activeRoom; // Use activeRoom
    if (!user || !roomName || !text) return;

    const roomMeta = rooms[roomName];
    if (user.isSpectating) return;
    if (user.isGloballyMuted) return; // Check for global mute
    if (roomMeta?.isLocked && user.role !== 'admin') return;
    if (user.isGuest && user.messageCount >= 5) {
      return socket.emit("message limit reached");
    }

    // AI-powered moderation: Check for toxicity
    const toxicityCheck = detectToxicity(text);
    
    // Track user behavior
    const lastBehavior = userBehaviorTracking.get(user.id);
    const timeSinceLast = lastBehavior ? (Date.now() - lastBehavior.lastMessageTime) : 10000;
    const behavior = trackUserBehavior(user.id, {
      type: 'message',
      timeSinceLast,
      toxicity: toxicityCheck
    });
    
    // AI moderation response for non-admins
    if (user.role !== 'admin' && roomMeta.type !== 'dm') {
      // Severe toxicity - block message and warn user
      if (toxicityCheck.level === 'severe') {
        sendSystemMessageToSocket(socket.id, roomName, 
          "⚠️ AI_Bot: Your message was blocked due to offensive language. Please keep the chat respectful.");
        
        // Notify admins about the incident
        const suggestions = generateModSuggestion(behavior, user.username);
        Object.values(onlineUsers).forEach(onlineUser => {
          if (onlineUser.role === 'admin') {
            const adminSocketId = getSocketIdByUserId(onlineUser.id);
            if (adminSocketId) {
              sendSystemMessageToSocket(adminSocketId, roomName, 
                `🤖 AI Alert: ${user.username} attempted to send offensive content. ${suggestions.join(' ')}`);
            }
          }
        });
        return; // Block the message
      }
      
      // Moderate toxicity or spam - allow but warn
      if (toxicityCheck.level === 'moderate' || behavior.spamCount >= 3) {
        sendSystemMessageToSocket(socket.id, roomName, 
          "⚠️ AI_Bot: Please be mindful of your language and posting frequency. Continued violations may result in moderation.");
      }
      
      // High toxicity score - notify admins
      if (behavior.toxicityScore >= 5) {
        const suggestions = generateModSuggestion(behavior, user.username);
        Object.values(onlineUsers).forEach(onlineUser => {
          if (onlineUser.role === 'admin') {
            const adminSocketId = getSocketIdByUserId(onlineUser.id);
            if (adminSocketId) {
              sendSystemMessageToSocket(adminSocketId, roomName, 
                `🤖 AI Alert: ${suggestions.join(' ')}`);
            }
          }
        });
      }
    }

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user: user.username, text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'user', room: roomName,
    };

    if (!messagesByRoom[roomName]) messagesByRoom[roomName] = [];
    messagesByRoom[roomName].push(message);
    io.to(roomName).emit("chat message", message);
    
    if (user.isGuest) user.messageCount++;
    
    if (!user.isGuest && userAccounts[user.id]) {
        userAccounts[user.id].messagesCount = (userAccounts[user.id].messagesCount || 0) + 1;
    }

    // Only check for bot messages in non-DM rooms
    if (roomMeta.type !== 'dm' && text.toLowerCase().startsWith('@ai_bot')) {
      const currentRoomUsers = getUsersInRoom(roomName);
      getAIResponse(text, roomName, currentRoomUsers).then(response => {
          createBotMessage(roomName, response);
      }).catch(err => {
          createBotMessage(roomName, "I'm experiencing a system error. Please try again later.");
      });
    }

    if (roomMeta.type === 'dm') {
      roomMeta.lastActivity = Date.now();
      const otherParticipant = roomMeta.participants.find(p => p.id !== user.id);
      if (otherParticipant) {
        const targetSocketId = getSocketIdByUserId(otherParticipant.id);
        if (targetSocketId) {
          const targetUser = onlineUsers[targetSocketId];
          if (targetUser && targetUser.settings.enableWhispers) {
            targetUser.hiddenDMs = targetUser.hiddenDMs.filter(dm => dm !== roomName);
             if (!targetUser.isGuest && userAccounts[targetUser.id]) {
                userAccounts[targetUser.id].hiddenDMs = targetUser.hiddenDMs;
             }
            io.to(targetSocketId).emit("new whisper", roomMeta);
            if (targetUser.location === 'lobby') {
              io.to(targetSocketId).emit("dm list update", getDMRoomsForUser(targetUser));
            }
          }
        }
      }
      if (user.location === 'lobby') {
        socket.emit("dm list update", getDMRoomsForUser(user));
      }
    }
  });

  socket.on("delete message", ({ id }) => {
    const user = onlineUsers[socket.id]; const room = user?.activeRoom; // Use activeRoom
    if (!user || !room || !messagesByRoom[room]) return;
    const msgIndex = messagesByRoom[room].findIndex((msg) => msg.id === id);
    if (msgIndex === -1) return; const message = messagesByRoom[room][msgIndex];
    if ((message.user === user.username || user.role === 'admin') && !message.deleted) {
      const deletedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      messagesByRoom[room][msgIndex] = { ...message, text: `This message was removed by ${user.username}`, deleted: true, time: deletedTime, };
      io.to(room).emit("message updated", messagesByRoom[room][msgIndex]);
    }
  });

  // OPTIMIZED: Uses user.activeRoom
  socket.on("edit message", ({ id, newText }) => {
    const user = onlineUsers[socket.id]; const room = user?.activeRoom; // Use activeRoom
    if (!user || !room || !messagesByRoom[room] || !newText || !newText.trim()) return;
    const messages = messagesByRoom[room]; const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) return; const message = messages[msgIndex];
    const isLastMessage = msgIndex === messages.length - 1;
    if (!message.deleted && ( (message.user === user.username && isLastMessage) || user.role === 'admin' )) {
      const editedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      messages[msgIndex] = { ...message, text: newText, time: editedTime, edited: true, };
      io.to(room).emit("message updated", messages[msgIndex]);
    }
  });

  // OPTIMIZED: Uses user.activeRoom
  socket.on("user typing", ({ isTyping }) => {
    const user = onlineUsers[socket.id]; const room = user?.activeRoom; // Use activeRoom
    if (!user || !room || user.isSpectating) return;
    user.typing = isTyping;
    if (rooms[room] && rooms[room].type !== 'dm') {
      io.to(room).emit("user list", getUsersInRoom(room));
    }
  });
  
  // OPTIMIZED: Uses user.mainRoom for context
  socket.on("promote user", ({ targetUserId }) => {
    const user = onlineUsers[socket.id]; const roomName = user?.mainRoom; // Use mainRoom
    const room = rooms[roomName];
    const targetAccount = userAccounts[targetUserId];
    if (!user || user.isGuest || !room || !targetAccount || targetAccount.isGuest || targetAccount.role === 'admin') return;
    if (user.role === 'admin' || room.owner === user.id) {
      if (!room.hosts.includes(targetUserId)) {
        room.hosts.push(targetUserId);
        io.to(roomName).emit("user list", getUsersInRoom(roomName));
        createSystemMessage(roomName, `${user.username} promoted ${targetAccount.username} to Host.`);
      }
    }
  });
  
  // OPTIMIZED: Uses user.mainRoom for context
  socket.on("demote user", ({ targetUserId }) => {
    const user = onlineUsers[socket.id]; const roomName = user?.mainRoom; // Use mainRoom
    const room = rooms[roomName];
    const targetAccount = userAccounts[targetUserId];
    if (!user || user.isGuest || !room || !targetAccount) return;
    if (user.role === 'admin' || room.owner === user.id) {
      room.hosts = room.hosts.filter(id => id !== targetUserId);
      io.to(roomName).emit("user list", getUsersInRoom(roomName));
      createSystemMessage(roomName, `${user.username} demoted ${targetAccount.username}.`);
    }
  });
  
  socket.on("start dm", ({ targetUserId }) => {
    const user = onlineUsers[socket.id];
    if (!user || user.isSummoned || user.id === targetUserId || targetUserId === 'ai-bot-id') return;
    
    const targetSocketId = getSocketIdByUserId(targetUserId);
    const targetUser = targetSocketId ? onlineUsers[targetSocketId] : null;
    
    if (!user.settings.enableWhispers) return; 
    if (targetUser && !targetUser.settings.enableWhispers) {
      return;
    }
    
    const targetAccount = userAccounts[targetUserId] || Object.values(onlineUsers).find(u => u.id === targetUserId);
    if (!targetAccount) return;
    
    const dmRoomName = getDmRoomName(user.id, targetUserId);
    let isNew = false;
    
    if (!rooms[dmRoomName]) {
      isNew = true;
      messagesByRoom[dmRoomName] = [];
      rooms[dmRoomName] = {
        name: dmRoomName, type: 'dm',
        // MODIFIED: Add user roles to participants array on creation
        participants: [ 
          {id: user.id, name: user.username, role: user.role}, 
          {id: targetAccount.id, name: targetAccount.username, role: targetAccount.role} 
        ]
      };
    }
    
    const dmRoom = rooms[dmRoomName];
    dmRoom.lastActivity = Date.now(); 

    user.hiddenDMs = user.hiddenDMs.filter(dm => dm !== dmRoomName);
    if (isNew) createSystemMessage(dmRoomName, "Conversation started.");

    if (user.location === 'lobby') {
      socket.emit("dm list update", getDMRoomsForUser(user));
    }
    
    if (targetSocketId) {
      const target = onlineUsers[targetSocketId];
      target.hiddenDMs = target.hiddenDMs.filter(dm => dm !== dmRoomName);
      io.to(targetSocketId).emit("new whisper", dmRoom);
      if (target.location === 'lobby') {
        io.to(targetSocketId).emit("dm list update", getDMRoomsForUser(target));
      }
    }
  });
  
  socket.on("get profile", (userId, callback) => {
    const account = userAccounts[userId];
    if (account) { 
      const { password, ...safeAccount } = account; 
      // NEW: Merge online status into profile
      const socketId = getSocketIdByUserId(userId);
      const onlineData = socketId ? onlineUsers[socketId] : null;
      callback({
        ...safeAccount,
        status: onlineData?.status || 'offline',
      }); 
    }
    else { const onlineGuest = Object.values(onlineUsers).find(u => u.id === userId && u.isGuest);
      if (onlineGuest) { 
        callback({ 
          id: onlineGuest.id, username: onlineGuest.username, fullName: onlineGuest.username, 
          email: "N/A (Guest)", about: "I am a guest user.", isGuest: true, role: 'user',
          joined: "N/A", messagesCount: 0, roomsCreated: 0, 
          status: onlineGuest.status,
        }); 
      }
      else { callback(null); }
    }
  });
  
  socket.on("update profile", (about, callback) => {
    const user = onlineUsers[socket.id];
    if (user && !user.isGuest) {
      const account = userAccounts[user.id];
      if (account) {
        account.about = about;
        const { password, ...safeAccount } = account;
        const fullUserDetails = { ...safeAccount, ...onlineUsers[socket.id] };
        callback(fullUserDetails);
        socket.emit("self details", fullUserDetails);
      }
    }
  });
  
  // --- NEW/MODIFIED ADMIN PANEL EVENTS ---
  socket.on("admin:getAllUsers", (callback) => {
    const user = onlineUsers[socket.id];
    if (!user || user.role !== 'admin' || typeof callback !== 'function') return;

    callback(getAllUsersSafe());
  });

  // NEW: Get Reports
  socket.on("admin:getReports", (callback) => {
    const user = onlineUsers[socket.id];
    if (!user || user.role !== 'admin' || typeof callback !== 'function') return;
    callback(reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  });

  // NEW: Get Tickets
  socket.on("admin:getTickets", (callback) => {
    const user = onlineUsers[socket.id];
    if (!user || user.role !== 'admin' || typeof callback !== 'function') return;
    callback(supportTickets.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  });

  // NEW: Resolve Item (Report or Ticket)
  socket.on("admin:resolveItem", ({ type, id }) => {
    const user = onlineUsers[socket.id];
    if (!user || user.role !== 'admin') return;

    if (type === 'report') {
      const report = reports.find(r => r.reportId === id);
      if (report) report.status = 'closed';
      broadcastToAdmins('admin:reportsUpdated', reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } else if (type === 'ticket') {
      const ticket = supportTickets.find(t => t.ticketId === id);
      if (ticket) ticket.status = 'closed';
      broadcastToAdmins('admin:ticketsUpdated', supportTickets.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }
  });


  socket.on("admin:getRoomDetails", (roomName, callback) => {
    const user = onlineUsers[socket.id];
    if (!user || user.role !== 'admin' || typeof callback !== 'function') return;
    callback(rooms[roomName] || null);
  });

  socket.on("admin:setRole", ({ targetUserId, role }) => {
    const user = onlineUsers[socket.id];
    if (!user || user.role !== 'admin') return;
    if (!targetUserId || (role !== 'admin' && role !== 'user')) return;
    if (!userAccounts[targetUserId]) return;

    // Don't let admins demote themselves
    if (user.id === targetUserId && role === 'user') return;

    // Update in DB
    userAccounts[targetUserId].role = role;
    
    // Update in memory if online
    const targetSocketId = getSocketIdByUserId(targetUserId);
    if (targetSocketId && onlineUsers[targetSocketId]) {
      onlineUsers[targetSocketId].role = role;
      // Send updated details to the target user
      const { password, ...safeAccount } = userAccounts[targetUserId];
      io.to(targetSocketId).emit("self details", { ...safeAccount, ...onlineUsers[targetSocketId] });
    }
    
    // Send update to all admins
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });

  socket.on("admin:banUser", ({ targetUserId }) => {
    const admin = onlineUsers[socket.id];
    if (!admin || admin.role !== 'admin' || admin.id === targetUserId) return;
    
    const targetAccount = userAccounts[targetUserId];
    if (!targetAccount) {
      // Handle banning a guest who isn't in userAccounts
      const guestUser = Object.values(onlineUsers).find(u => u.id === targetUserId);
      if (!guestUser) return; // User not found
      
      bannedUserIds.add(targetUserId); // Ban guest ID
      const targetSocketId = getSocketIdByUserId(targetUserId);
      if (targetSocketId) {
        io.sockets.sockets.get(targetSocketId)?.disconnect(true);
      }
      Object.keys(rooms).forEach(roomName => {
        if (rooms[roomName].type === 'public') {
          createSystemMessage(roomName, `${guestUser.username} (Guest) has been banned from the server by ${admin.username}.`, 'server');
        }
      });
      // No need to update admin list since guest isn't in userAccounts
      return;
    }

    if(targetAccount.role === 'admin') return; // Can't ban other admins

    bannedUserIds.add(targetUserId);
    
    const targetSocketId = getSocketIdByUserId(targetUserId);
    if (targetSocketId) {
      io.sockets.sockets.get(targetSocketId)?.disconnect(true);
    }
    
    Object.keys(rooms).forEach(roomName => {
      if (rooms[roomName].type === 'public') {
        createSystemMessage(roomName, `${targetAccount.username} has been banned from the server by ${admin.username}.`, 'server');
      }
    });

    // Send update to all admins
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });

  // NEW: Admin Unban
  socket.on("admin:unbanUser", ({ targetUserId }) => {
    const admin = onlineUsers[socket.id];
    if (!admin || admin.role !== 'admin') return;

    bannedUserIds.delete(targetUserId);

    // Send update to all admins
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });

  // NEW: Admin Edit User
  socket.on("admin:editUser", ({ targetUserId, details }) => {
    const admin = onlineUsers[socket.id];
    if (!admin || admin.role !== 'admin') return;
    
    const account = userAccounts[targetUserId];
    if (!account) return;

    // Update allowed fields
    if (typeof details.fullName === 'string') account.fullName = details.fullName;
    if (typeof details.email === 'string') account.email = details.email;
    if (typeof details.about === 'string') account.about = details.about;

    // Send update to all admins
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });

  // NEW: Admin Global Mute
  socket.on("admin:globalMute", ({ targetUserId, mute }) => {
    const admin = onlineUsers[socket.id];
    if (!admin || admin.role !== 'admin') return;
    
    const account = userAccounts[targetUserId];
    if (!account) {
       // Handle muting a guest
      const guestUser = Object.values(onlineUsers).find(u => u.id === targetUserId);
      if (guestUser) {
        guestUser.isGloballyMuted = mute;
      }
      // No need to update admin list since guest isn't in userAccounts
      return;
    }
    
    account.isGloballyMuted = mute;

    const targetSocketId = getSocketIdByUserId(targetUserId);
    if (targetSocketId && onlineUsers[targetSocketId]) {
      onlineUsers[targetSocketId].isGloballyMuted = mute;
    }

    // Send update to all admins
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });

  // NEW: Admin Warn User
  socket.on("admin:warnUser", ({ targetUserId, message }) => {
    const admin = onlineUsers[socket.id];
    if (!admin || admin.role !== 'admin' || !message) return;

    const targetSocketId = getSocketIdByUserId(targetUserId);
    if (targetSocketId) {
      // MODIFIED: Send object as required by frontend
      io.to(targetSocketId).emit("forceWarn", { from: admin.username, message: message });
    }
  });

  // NEW: Admin Join Room
  socket.on("admin:joinRoom", (roomName, callback) => {
    const admin = onlineUsers[socket.id];
    if (!admin || admin.role !== 'admin' || typeof callback !== 'function') return;

    const room = rooms[roomName];
    if (!room || room.type === 'dm') {
      return callback(null); // Room doesn't exist or is DM
    }

    // Use the existing join room logic, but force the switch
    leaveMainRoom(socket); // Leave admin's current room
    admin.mainRoom = roomName;
    admin.activeRoom = roomName;
    admin.location = 'chat'; 
    admin.status = roomName; // Set status
    socket.join(roomName); 
    
    createSystemMessage(roomName, `${admin.username} (Admin) has joined the room.`);
    io.to(roomName).emit("user list", getUsersInRoom(roomName));
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());

    // Callback to the frontend to switch pages
    callback(room);
  });
  // --- END ADMIN PANEL EVENTS ---
  
  // MODIFIED: Report handler now stores the report
  socket.on("report", ({ reportedUserId }) => {
    const reporter = onlineUsers[socket.id]; 
    const reportedUser = userAccounts[reportedUserId] || Object.values(onlineUsers).find(u => u.id === reportedUserId);
    if (!reporter || !reportedUser) return;
    
    const reportRoomName = reporter.mainRoom || 'N/A'; // Use mainRoom
    const room = rooms[reportRoomName];
    
    let adminIds = ["admin-id"]; // Always alert global admin
    if (room && room.type !== 'dm') {
      adminIds = [...new Set([...adminIds, room.owner, ...room.hosts])];
    }

    const alertData = { reporterName: reporter.username, reportedName: reportedUser.username, roomName: reportRoomName, };
    
    // NEW: Create and store the report
    const newReport = {
      reportId: `r-${Date.now()}`,
      reporterId: reporter.id,
      reportedId: reportedUser.id,
      reporterName: reporter.username,
      reportedName: reportedUser.username,
      roomName: reportRoomName,
      timestamp: new Date().toISOString(),
      status: 'open',
    };
    reports.push(newReport);

    // NEW: Notify admins of the updated report list
    broadcastToAdmins('admin:reportsUpdated', reports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    
    // Still send the real-time alert
    Object.values(onlineUsers).forEach(onlineUser => {
      if (adminIds.includes(onlineUser.id)) {
        const adminSocketId = getSocketIdByUserId(onlineUser.id);
        if (adminSocketId) io.to(adminSocketId).emit("report", alertData);
      }
    });
    socket.emit("report", alertData);
  });

  socket.on("admin summon", ({ targetUserId }) => {
    const admin = onlineUsers[socket.id]; const targetSocketId = getSocketIdByUserId(targetUserId);
    if (!admin || admin.role !== 'admin' || !targetSocketId) return;
    const target = onlineUsers[targetSocketId];
    if (target.isSummoned || target.role === 'admin') return;
    
    const oldRoomName = target.mainRoom; // Use mainRoom
    const judgementRoomName = `judgement-${target.username}`;
    
    if (!rooms[judgementRoomName]) {
      rooms[judgementRoomName] = { name: judgementRoomName, type: 'judgement', owner: admin.id, hosts: [], summonedUser: target.id, isLocked: false, topic: `Judgement for ${target.username}` };
      messagesByRoom[judgementRoomName] = [];
    }
    const judgementRoom = rooms[judgementRoomName];
    
    // Force admin to join
    leaveMainRoom(socket); // Leave admin's current room
    admin.mainRoom = judgementRoomName;
    admin.activeRoom = judgementRoomName;
    admin.location = 'chat'; 
    admin.status = judgementRoomName; // MODIFIED
    socket.join(judgementRoomName); 
    socket.emit("force switch room", judgementRoom);
    
    // Force target to join
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      leaveMainRoom(targetSocket); // Leave target's current room
      target.mainRoom = judgementRoomName;
      target.activeRoom = judgementRoomName;
      target.location = 'chat'; 
      target.status = judgementRoomName; // MODIFIED
      target.isSummoned = true;
      targetSocket.join(judgementRoomName); 
      targetSocket.emit("force switch room", judgementRoom);
      const targetAccount = userAccounts[target.id] || target;
      targetSocket.emit("self details", { ...targetAccount, ...target });
    }
    
    if (oldRoomName) {
      createSystemMessage(oldRoomName, `${target.username}'s soul is being summoned for judgement.`);
      io.to(oldRoomName).emit("user list", getUsersInRoom(oldRoomName));
    }
    createSystemMessage(judgementRoomName, `${admin.username} has summoned ${target.username} for judgement.`);
    io.to(judgementRoomName).emit("user list", getUsersInRoom(judgementRoomName));
    io.emit("room list", getPublicRoomsWithCounts());
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe()); // MODIFIED
  });

  socket.on("admin release", ({ targetUserId }) => {
    const admin = onlineUsers[socket.id]; const targetSocketId = getSocketIdByUserId(targetUserId);
    if (!admin || admin.role !== 'admin' || !targetSocketId) return;
    
    const target = onlineUsers[targetSocketId]; 
    const judgementRoomName = admin.mainRoom; // Use mainRoom
    
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      leaveMainRoom(targetSocket);
      target.isSummoned = false;
      targetSocket.emit("force disconnect"); 
    }
    
    leaveMainRoom(socket);
    socket.emit("force disconnect");
    
    if (judgementRoomName && rooms[judgementRoomName]?.type === 'judgement') {
      createSystemMessage(judgementRoomName, `${admin.username} has released ${target.username}.`);
      delete rooms[judgementRoomName]; delete messagesByRoom[judgementRoomName];
    }
    io.emit("room list", getPublicRoomsWithCounts());
  });

  // OPTIMIZED: Uses user.mainRoom for context
  socket.on("admin kick", ({ targetUserId }) => {
    const admin = onlineUsers[socket.id]; const roomName = admin?.mainRoom; // Use mainRoom
    const targetSocketId = getSocketIdByUserId(targetUserId);
    if (!admin || admin.role !== 'admin' || !targetSocketId || !roomName) return;
    const target = onlineUsers[targetSocketId];
    if (target.role === 'admin' || target.mainRoom !== roomName) return; // Check mainRoom
    
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      leaveMainRoom(targetSocket); // Use leaveMainRoom
      targetSocket.emit("force disconnect");
      createSystemMessage(roomName, `${target.username} was kicked from the room by ${admin.username}.`);
    }
  });

  socket.on("admin ban", ({ targetUserId, targetUsername }) => {
    const admin = onlineUsers[socket.id];
    if (!admin || admin.role !== 'admin' || admin.id === targetUserId) return;
    
    const targetAccount = userAccounts[targetUserId];
    const targetGuest = Object.values(onlineUsers).find(u => u.id === targetUserId);
    const usernameToDisplay = targetUsername || targetAccount?.username || targetGuest?.username || "A user";

    if(targetAccount && targetAccount.role === 'admin') return;
    
    bannedUserIds.add(targetUserId);
    const targetSocketId = getSocketIdByUserId(targetUserId);
    if (targetSocketId) io.sockets.sockets.get(targetSocketId)?.disconnect(true);
    
    Object.keys(rooms).forEach(roomName => {
      if (rooms[roomName].type === 'public') {
        createSystemMessage(roomName, `${usernameToDisplay} has been banned from the server by ${admin.username}.`, 'server');
      }
    });
    broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
  });
  
  // OPTIMIZED: Uses user.mainRoom for context
  socket.on("admin spectate", ({ targetUserId }) => {
    const admin = onlineUsers[socket.id]; const roomName = admin?.mainRoom; // Use mainRoom
    const targetSocketId = getSocketIdByUserId(targetUserId);
    if (!admin || admin.role !== 'admin' || !targetSocketId || !roomName) return;
    const target = onlineUsers[targetSocketId];
    if (target.role === 'admin' || target.mainRoom !== roomName) return; // Check mainRoom
    
    target.isSpectating = !target.isSpectating;
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    const targetAccount = userAccounts[target.id] || target;
    targetSocket?.emit("self details", { ...targetAccount, ...target });
    
    if (target.isSpectating) createSystemMessage(roomName, `${target.username} is now spectating (muted) by ${admin.username}.`);
    else createSystemMessage(roomName, `${target.username} is no longer spectating (unmuted) by ${admin.username}.`);
    
    io.to(roomName).emit("user list", getUsersInRoom(roomName));
  });

  socket.on("set status", (newStatus) => {
    const user = onlineUsers[socket.id];
    if (user && ['online', 'away', 'dnd'].includes(newStatus)) {
      user.status = newStatus;
      if (user.mainRoom) { // Use mainRoom
        io.to(user.mainRoom).emit("user list", getUsersInRoom(user.mainRoom));
      }
      const account = userAccounts[user.id] || user;
      const { password, ...safeAccount } = account;
      socket.emit("self details", { ...safeAccount, ...user });
      broadcastToAdmins('admin:userListUpdated', getAllUsersSafe()); // MODIFIED
    }
  });

  // OPTIMIZED: Uses user.mainRoom for context
  socket.on("admin command", ({ command, args }) => {
    const admin = onlineUsers[socket.id]; const room = admin?.mainRoom; // Use mainRoom
    if (!admin || admin.role !== 'admin' || !room) return;
    const roomMeta = rooms[room];
    
    if (command === 'bot') {
      const [botCommand, ...botArgs] = args.split(' ');
      const botArgsString = botArgs.join(' ');
      
      switch (botCommand) {
        case 'say':
          if (botArgsString) {
            createBotMessage(room, botArgsString);
          }
          break;
        case 'topic':
          if (botArgsString) {
            roomMeta.topic = botArgsString;
            createBotMessage(room, `As requested, I've set the topic to: ${botArgsString}`);
            io.to(room).emit("room update", { roomName: room, topic: roomMeta.topic, isLocked: roomMeta.isLocked });
          }
          break;
        case 'lock':
          roomMeta.isLocked = true;
          const reason = botArgsString || "No reason provided.";
          roomMeta.topic = `Room closed by bot: ${reason}`;
          createBotMessage(room, `Per Admin request, I am locking this room. Reason: ${reason}`);
          io.to(room).emit("room update", { roomName: room, topic: roomMeta.topic, isLocked: roomMeta.isLocked });
          break;
        case 'unlock':
          roomMeta.isLocked = false;
          createBotMessage(room, `Per Admin request, I am unlocking this room.`);
          io.to(room).emit("room update", { roomName: room, topic: roomMeta.topic, isLocked: roomMeta.isLocked });
          break;
        case 'kick': {
          const targetUsername = botArgsString;
          if (!targetUsername) {
            return sendSystemMessageToSocket(socket.id, room, "Usage: /bot kick <username>");
          }
          const targetUser = findUserByUsername(targetUsername);
          if (!targetUser || !targetUser.socketId) {
            return sendSystemMessageToSocket(socket.id, room, `User "${targetUsername}" is not online.`);
          }
          if (targetUser.role === 'admin') {
            return sendSystemMessageToSocket(socket.id, room, "I cannot kick another admin.");
          }
          if (targetUser.mainRoom !== room) { // Use mainRoom
             return sendSystemMessageToSocket(socket.id, room, `User "${targetUsername}" is not in this room.`);
          }
          const targetSocket = io.sockets.sockets.get(targetUser.socketId);
          if (targetSocket) {
            leaveMainRoom(targetSocket); // Use leaveMainRoom
            targetSocket.emit("force disconnect");
            createBotMessage(room, `As you wish, Admin. I have kicked ${targetUser.username} from the room.`);
            createSystemMessage(room, `${targetUser.username} was kicked from the room by AI_Bot (on Admin's order).`);
          }
          break;
        }
        case 'ban': {
          const targetUsername = botArgsString;
          if (!targetUsername) {
            return sendSystemMessageToSocket(socket.id, room, "Usage: /bot ban <username>");
          }
          const targetUser = findUserByUsername(targetUsername);
          if (!targetUser) {
             return sendSystemMessageToSocket(socket.id, room, `User account "${targetUsername}" not found.`);
          }
          if (targetUser.role === 'admin') {
            return sendSystemMessageToSocket(socket.id, room, "I cannot ban an admin.");
          }
          bannedUserIds.add(targetUser.id);
          if (targetUser.socketId) {
            io.sockets.sockets.get(targetUser.socketId)?.disconnect(true);
          }
          createBotMessage(room, `Per your order, I have banned ${targetUser.username} from the server.`);
          Object.keys(rooms).forEach(roomName => {
            if (rooms[roomName].type === 'public') {
              createSystemMessage(roomName, `${targetUser.username} has been banned from the server by AI_Bot (on Admin's order).`, 'server');
            }
          });
          broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
          break;
        }
        case 'promote': {
          const [roleToPromote, ...usernameParts] = botArgs;
          const targetUsername = usernameParts.join(' ');
          if (!roleToPromote || !targetUsername || roleToPromote.toLowerCase() !== 'host') {
            return sendSystemMessageToSocket(socket.id, room, "Usage: /bot promote host <username>");
          }
          const targetUser = findUserByUsername(targetUsername);
          if (!targetUser || !targetUser.socketId) {
            return sendSystemMessageToSocket(socket.id, room, `User "${targetUsername}" is not online.`);
          }
          if (targetUser.role === 'admin' || targetUser.isGuest) {
            return sendSystemMessageToSocket(socket.id, room, "I cannot promote this user.");
          }
          if (!roomMeta.hosts.includes(targetUser.id)) {
            roomMeta.hosts.push(targetUser.id);
            io.to(room).emit("user list", getUsersInRoom(room));
            createBotMessage(room, `Done. I have promoted ${targetUser.username} to Host.`);
          } else {
            return sendSystemMessageToSocket(socket.id, room, `${targetUser.username} is already a Host.`);
          }
          break;
        }
        case 'demote': {
          const targetUsername = botArgsString;
          if (!targetUsername) {
            return sendSystemMessageToSocket(socket.id, room, "Usage: /bot demote <username>");
          }
          const targetUser = findUserByUsername(targetUsername);
          if (!targetUser) {
             return sendSystemMessageToSocket(socket.id, room, `User "${targetUsername}" not found.`);
          }
          if (roomMeta.hosts.includes(targetUser.id)) {
            roomMeta.hosts = roomMeta.hosts.filter(id => id !== targetUser.id);
            io.to(room).emit("user list", getUsersInRoom(room));
            createBotMessage(room, `Understood. I have demoted ${targetUser.username} from their host position.`);
          } else {
            return sendSystemMessageToSocket(socket.id, room, `${targetUser.username} is not a Host in this room.`);
          }
          break;
        }
        default:
          sendSystemMessageToSocket(socket.id, room, "Unknown bot command. Try: /bot say <msg>, /bot topic <topic>, /bot lock <reason>, /bot unlock, /bot kick <user>, /bot ban <user>, /bot promote host <user>, /bot demote <user>");
          break;
      }
      return;
    }
    
    switch (command) {
      case 'server':
        if (!args) return;
        Object.keys(rooms).forEach(roomName => {
          if (rooms[roomName].type === 'public' || rooms[roomName].type === 'judgement') {
             createSystemMessage(roomName, args, 'server');
          }
        });
        break;
      case 'close':
        roomMeta.isLocked = true; roomMeta.topic = args ? `Room closed: ${args}` : "Room is now locked.";
        createSystemMessage(room, `Room locked by ${admin.username}. ${args ? `Reason: ${args}` : ''}`);
        io.to(room).emit("room update", { roomName: room, topic: roomMeta.topic, isLocked: roomMeta.isLocked });
        break;
      case 'open':
        roomMeta.isLocked = false; createSystemMessage(room, `Room unlocked by ${admin.username}.`);
        io.to(room).emit("room update", { roomName: room, topic: roomMeta.topic, isLocked: roomMeta.isLocked });
        break;
      case 'topic':
        roomMeta.topic = args; createSystemMessage(room, `${admin.username} set the topic to: ${args}`);
        io.to(room).emit("room update", { roomName: room, topic: roomMeta.topic, isLocked: roomMeta.isLocked });
        break;
      case 'spectate':
        if (args === 'all') {
          Object.values(onlineUsers).forEach(u => {
            if (u.mainRoom === room && u.role !== 'admin') { // Use mainRoom
              u.isSpectating = true;
              const uSocketId = getSocketIdByUserId(u.id);
              const uAccount = userAccounts[u.id] || u;
              io.sockets.sockets.get(uSocketId)?.emit("self details", { ...uAccount, ...u });
            }
          });
          createSystemMessage(room, `${admin.username} has muted all non-admin users.`);
          io.to(room).emit("user list", getUsersInRoom(room));
        }
        break;
      case 'demote':
        if (args === 'all') {
          roomMeta.hosts = [];
          createSystemMessage(room, `${admin.username} has demoted all hosts.`);
          io.to(room).emit("user list", getUsersInRoom(room));
        }
        break;
      case 'reboot': {
        const [timeStr, ...msgParts] = args.split(' ');
        const message = msgParts.join(' ') || "The server is rebooting.";
        const timeInSeconds = parseInt(timeStr) || 60;
        io.emit("server reboot", { time: timeInSeconds, message });
        setTimeout(() => io.emit("force disconnect"), timeInSeconds * 1000);
        break;
      }
      case 'clear': {
        if (messagesByRoom[room]) {
          messagesByRoom[room] = [];
          io.to(room).emit("history cleared", { room: room });
          createSystemMessage(room, `${admin.username} cleared the message history.`);
        }
        break;
      }
    }
  });

  socket.on("disconnect", () => {
    const user = onlineUsers[socket.id];
    if (user) {
      console.log(`User disconnected: ${user.username} (Socket: ${socket.id})`);
      if (!user.isGuest && userAccounts[user.id]) {
        userAccounts[user.id].settings = user.settings;
        userAccounts[user.id].hiddenDMs = user.hiddenDMs;
      }
      leaveMainRoom(socket); // Use leaveMainRoom
      delete onlineUsers[socket.id];
      // Notify admins of status change
      broadcastToAdmins('admin:userListUpdated', getAllUsersSafe());
    } else {
      console.log(`Anonymous socket disconnected: ${socket.id}`);
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`✅ ChatNet server running on port ${PORT}`));