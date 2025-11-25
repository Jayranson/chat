import React, { useEffect, useState, useRef, ChangeEvent } from "react";
import { io, Socket } from "socket.io-client";

// --- Type Definitions ---
type Message = {
  id: string; user: string; text: string; time: string;
  type: 'user' | 'system' | 'server' | 'thought'; room: string;
  deleted?: boolean; edited?: boolean;
};

type User = {
  id: string; name: string; typing?: boolean;
  role: 'admin' | 'owner' | 'host' | 'user';
  isSummoned?: boolean; isSpectating?: boolean; status?: 'online' | 'away' | 'dnd';
};

// MODIFIED: Added new properties
type UserAccount = {
  id: string; username: string; fullName: string; email: string; about: string;
  role: 'admin' | 'user'; isGuest?: boolean; isSummoned?: boolean; isSpectating?: boolean;
  status: 'offline' | 'lobby' | string; // string = in room
  joined?: string;
  messagesCount?: number;
  roomsCreated?: number;
  isBanned?: boolean;
  isGloballyMuted?: boolean;
};

type Room = {
  name: string; type: 'public' | 'dm' | 'judgement'; owner?: string; hosts?: string[];
  participants?: User[];
  summonedUser?: string; isLocked?: boolean; topic?: string;
  userCount?: number; lastActivity?: number;
};

type UserSettings = { enableSounds: boolean; enableWhispers: boolean; };
type ContextMenuState = { visible: boolean; x: number; y: number; user: User | null; };
type AlertData = { reporterName: string; reportedName: string; roomName: string; };
type RebootModalData = { time: number; message: string; };

// NEW: Types for Admin Panel & New Features
type WarnModalData = { from: string; message: string; };
type SupportTicket = {
  ticketId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: string;
  status: 'open' | 'closed';
};
// MODIFIED: Added reason and messages to Report type
type Report = {
  reportId: string;
  reporterId: string;
  reportedId: string;
  reporterName: string;
  reportedName: string;
  roomName: string;
  timestamp: string;
  status: 'open' | 'closed';
  reason?: string;
  messages?: Message[];
};

// --- SVG Icons ---
// (All existing SVG icons are included here... IconShieldCheck, IconMessageSquare, etc.)
const IconShieldCheck = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path>
  </svg>
);
const IconMessageSquare = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);
const IconZap = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
  </svg>
);
const IconArrowRight = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>
  </svg>
);
const IconUser = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>
  </svg>
);
const IconLayoutDashboard = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);
const IconMessagesSquare = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4Z"></path>
    <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"></path>
  </svg>
);
const IconSettings = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);
const IconLogOut = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);
const IconUsers = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);
const IconCalendarDays = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);
const IconMessageCircle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
  </svg>
);
const IconHome = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);
const IconBan = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
  </svg>
);
const IconFlag = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line>
  </svg>
);
const IconSend = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);
const IconX = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);
const IconBot = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
    <path d="M12 7V11"></path><path d="M8 5 12 7l4-2"></path><path d="M8 11h8"></path>
  </svg>
);
const IconActivity = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);
const IconCheckBadge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.78l1.4 1.4a1 1 0 0 0 1.4-1.4l-1.4-1.4A6 6 0 0 0 .14 12.38l1.4 1.4a1 1 0 0 0 1.4-1.4l-1.4-1.4Z"/>
    <path d="M11 12.56a4 4 0 1 1 5.66 5.66l-1.4-1.4a1 1 0 0 0-1.4 1.4l1.4 1.4a6 6 0 0 0-8.49-8.49l-1.4 1.4a1 1 0 0 0 1.4 1.4l1.4-1.4Z"/>
    <path d="m14 14-2 2 4 4 5-5-2-2Z"/>
  </svg>
);
const IconShield = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
);
const IconBarChart = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="20" x2="12" y2="10"></line>
    <line x1="18" y1="20" x2="18" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="16"></line>
  </svg>
);
const IconEye = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);
// NEW: Icons for Admin
const IconSearch = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);
const IconAlertTriangle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);
const IconMail = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>
  </svg>
);
const IconEdit = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);
const IconVolumeX = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>
  </svg>
);
const IconVolume2 = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
  </svg>
);
const IconLogIn = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line>
  </svg>
);
const IconCheckCircle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);
// NEW: Icon for viewing context
const IconFileText = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

// --- Badge SVGs ---
// (All existing badge SVGs are included here... AdminBadge, GoldenCrown, etc.)
const AdminBadge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-500" title="Administrator">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);
const GoldenCrown = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-yellow-400" title="Room Owner">
    <path fillRule="evenodd" d="M10 2a.75.75 0 01.682.433l1.838 3.997 4.494.598a.75.75 0 01.418 1.28l-3.29 3.148 0.81 4.453a.75.75 0 01-1.09.791L10 14.128l-4.062 2.136a.75.75 0 01-1.09-.79l0.81-4.453-3.29-3.148a.75.75 0 01.418-1.28l4.494-.598L9.318 2.433A.75.75 0 0110 2z" clipRule="evenodd" />
  </svg>
);
const SilverCrown = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-gray-400" title="Room Host">
    <path d="M10 2a.75.75 0 01.682.433l1.838 3.997 4.494.598a.75.75 0 01.418 1.28l-3.29 3.148 0.81 4.453a.75.75 0 01-1.09.791L10 14.128l-4.062 2.136a.75.75 0 01-1.09-.79l0.81-4.453-3.29-3.148a.75.75 0 01.418-1.28l4.494-.598L9.318 2.433A.75.75 0 0110 2z" />
  </svg>
);
const BotBadge = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-purple-400" title="AI Bot">
    <path fillRule="evenodd" d="M11.01 3.05C11.346 2.409 12.163 2 13 2h1a2 2 0 0 1 2 2v2.115c0 .546.224 1.07.618 1.464l2.064 2.064a1.5 1.5 0 0 1 .439 1.061V13a2 2 0 0 1-2 2h-1c-.837 0-1.654-.409-1.99.24S11.166 18 10.32 18H9.68c-.846 0-1.663.409-1.99.24s-1.155-1.58-1.99-2.24H5a2 2 0 0 1-2-2v-.296a1.5 1.5 0 0 1 .439-1.06L5.503 7.643A1.5 1.5 0 0 0 6.12 6.182V4a2 2 0 0 1 2-2h1c.837 0 1.654.409 1.99-.24S10.163 2 11.008 2h.002ZM10 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" clipRule="evenodd" />
  </svg>
);
const UserBadge = ({ role, username }: { role?: 'admin' | 'owner' | 'host' | 'user'; username?: string }) => {
  if (username === 'AI_Bot') return <BotBadge />;
  if (role === 'admin') return <AdminBadge />;
  if (role === 'owner') return <GoldenCrown />;
  if (role === 'host') return <SilverCrown />;
  return null;
};
const StatusIndicator = ({ status, size = 'sm' }: { status?: 'online' | 'away' | 'dnd' | 'offline' | string; size?: 'sm' | 'lg' }) => {
  const color = status === 'online' ? 'bg-green-500' :
                status === 'away' ? 'bg-yellow-500' :
                status === 'dnd' ? 'bg-red-500' :
                status === 'lobby' ? 'bg-blue-500' :
                status === 'offline' ? 'bg-gray-600' :
                'bg-purple-500'; // In a room
  
  const title = status === 'online' ? 'Online' :
                status === 'away' ? 'Away' :
                status === 'dnd' ? 'Do Not Disturb' :
                status === 'lobby' ? 'In Lobby' :
                status === 'offline' ? 'Offline' :
                `In Room: ${status}`;
                
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return <span title={title} className={`${sizeClass} rounded-full ${color} inline-block border-2 border-gray-800`}></span>;
};
// --- End Badge SVGs ---


// --- Context Menu ---
type UserContextMenuProps = {
  menuState: ContextMenuState; currentUser: UserAccount | null; currentUserRole: 'admin' | 'owner' | 'host' | 'user';
  onClose: () => void; onDm: (user: User) => void; onPromote: (userId: string) => void; onDemote: (userId: string) => void;
  onIgnore: (userId: string) => void; isIgnored: boolean; onViewProfile: (user: User) => void; onReport: (user: User) => void;
  onSummon: (user: User) => void; onKick: (user: User) => void; onBan: (user: User) => void; onSpectate: (user: User) => void;
};
const UserContextMenu = ({
  menuState, currentUser, currentUserRole, onClose, onDm, onPromote, onDemote, onIgnore, isIgnored, onViewProfile, onReport, onSummon, onKick, onBan, onSpectate,
}: UserContextMenuProps) => {
  if (!menuState.visible || !menuState.user) return null;
  const { x, y, user } = menuState;
  const isSelf = user.id === currentUser?.id;
  const isAdmin = currentUser?.role === 'admin';
  const isOwner = currentUserRole === 'owner';
  const isBot = user.id === 'ai-bot-id'; 
  const handleClick = (e: React.MouseEvent) => e.stopPropagation();
 
  return (
    <div className="fixed z-50 bg-neutral-800 shadow-lg rounded-md p-2 border border-neutral-700 w-52 text-white" style={{ top: y, left: x }} onClick={handleClick}>
      <div className="font-bold text-lg mb-2 pb-2 border-b border-neutral-700">{user.name}</div>
      <ul className="space-y-1">
        {!isSelf && !isBot && (<li><button onClick={() => { onDm(user); onClose(); }} className="w-full text-left px-3 py-1 rounded hover:bg-blue-600">Whisper</button></li>)}
        <li><button onClick={() => { onViewProfile(user); onClose(); }} className="w-full text-left px-3 py-1 rounded hover:bg-neutral-700">View Profile</button></li>
        {!isSelf && !isBot && (<li><button onClick={() => { onIgnore(user.id); onClose(); }} className={`w-full text-left px-3 py-1 rounded ${isIgnored ? 'bg-red-600 text-white' : 'hover:bg-red-600'}`}>{isIgnored ? 'Unignore' : 'Ignore'}</button></li>)}
        {(isOwner && !isAdmin && !isSelf && user.role !== 'admin' && !isBot) && (<>
            <div className="my-1 border-t border-neutral-700"></div>
            {user.role === 'user' ? (<li><button onClick={() => { onPromote(user.id); onClose(); }} className="w-full text-left px-3 py-1 rounded hover:bg-green-600">Promote to Host</button></li>)
            : (<li><button onClick={() => { onDemote(user.id); onClose(); }} className="w-full text-left px-3 py-1 rounded hover:bg-red-600">Demote Host</button></li>)}
        </>)}
        {isAdmin && !isSelf && !isBot && (<>
            <div className="my-1 border-t border-neutral-700"></div>
            {user.role === 'user' ? (<li><button onClick={() => { onPromote(user.id); onClose(); }} className="w-full text-left px-3 py-1 rounded hover:bg-green-600">Promote to Host</button></li>) 
            : user.role === 'host' ? (<li><button onClick={() => { onDemote(user.id); onClose(); }} className="w-full text-left px-3 py-1 rounded hover:bg-red-600">Demote Host</button></li>) : null}
            <li><button onClick={() => { onSummon(user); onClose(); }} className="w-full text-left px-3 py-1 rounded text-white bg-purple-700 hover:bg-purple-800">Summon</button></li>
            <li><button onClick={() => { onSpectate(user); onClose(); }} className="w-full text-left px-3 py-1 rounded text-white bg-yellow-600 hover:bg-yellow-700">{user.isSpectating ? 'Un-Spectate' : 'Spectate'}</button></li>
            <li><button onClick={() => { onKick(user); onClose(); }} className="w-full text-left px-3 py-1 rounded text-white bg-orange-600 hover:bg-orange-700">Kick</button></li>
            <li><button onClick={() => { onBan(user); onClose(); }} className="w-full text-left px-3 py-1 rounded text-white bg-red-800 hover:bg-red-900">Ban</button></li>
        </>)}
        <div className="my-1 border-t border-neutral-700"></div>
        {/* MODIFIED: onReport now opens the new modal */}
        {!isSelf && !isBot && (<li><button onClick={() => { onReport(user); onClose(); }} className="w-full text-left px-3 py-1 rounded hover:bg-red-600">Report</button></li>)}
      </ul>
    </div>
  );
};
// --- End Context Menu ---


// --- Emoji Onboarding Component ---
type EmojiOnboardingProps = { 
  onComplete: (selectedRoom: string) => void;
  onSkip: () => void;
};

const EmojiOnboarding = ({ onComplete, onSkip }: EmojiOnboardingProps) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);

  const questions = [
    {
      emoji: '🎭',
      question: "What's your vibe?",
      options: [
        { emoji: '😎', label: 'Chill & Relaxed', value: 'chill' },
        { emoji: '🎪', label: 'Chaotic & Fun', value: 'chaotic' },
        { emoji: '🤝', label: 'Supportive & Kind', value: 'supportive' },
        { emoji: '💼', label: 'Serious & Professional', value: 'serious' },
        { emoji: '😂', label: 'Comedy & Jokes', value: 'comedy' },
      ]
    },
    {
      emoji: '🛡️',
      question: "How do you like your chat moderation?",
      options: [
        { emoji: '🔥', label: 'Wild & Free', value: 'wild' },
        { emoji: '🌶️', label: 'Spicy but Reasonable', value: 'spicy' },
        { emoji: '⚖️', label: 'Balanced', value: 'balanced' },
        { emoji: '🤗', label: 'Safe & Supportive', value: 'safe' },
        { emoji: '👶', label: 'Family-Friendly', value: 'teen' },
      ]
    },
    {
      emoji: '💬',
      question: "What brings you here?",
      options: [
        { emoji: '🎮', label: 'Gaming & Fun', value: 'gaming' },
        { emoji: '💡', label: 'Learning & Help', value: 'help' },
        { emoji: '🎵', label: 'Music & Art', value: 'music' },
        { emoji: '💬', label: 'Just Chatting', value: 'general' },
        { emoji: '🤖', label: 'Tech & AI', value: 'tech' },
      ]
    },
  ];

  const handleAnswer = (value: string) => {
    const newAnswers = [...answers, value];
    setAnswers(newAnswers);

    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      // Onboarding complete - match to room
      const roomMatch = matchUserToRoom(newAnswers);
      onComplete(roomMatch);
    }
  };

  const matchUserToRoom = (userAnswers: string[]): string => {
    const [vibe, moderation, interest] = userAnswers;

    // Room matching logic
    if (interest === 'help') return 'help';
    if (interest === 'music') return 'music';
    
    // Default to general for most cases
    if (vibe === 'chill' || vibe === 'balanced') return 'general';
    if (vibe === 'comedy' || vibe === 'chaotic') return 'general'; // Could be comedy room
    if (vibe === 'supportive' || moderation === 'safe') return 'help';
    
    return 'general'; // Fallback
  };

  const currentQuestion = questions[step];
  const progress = ((step + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-neutral-900 via-purple-900/20 to-neutral-900">
      <div className="max-w-2xl w-full bg-neutral-800 border-2 border-purple-500/30 rounded-2xl p-8 shadow-2xl">
        {/* Progress bar */}
        <div className="w-full bg-neutral-700 rounded-full h-2 mb-8">
          <div 
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">{currentQuestion.emoji}</div>
          <h2 className="text-3xl font-bold text-white mb-2">{currentQuestion.question}</h2>
          <p className="text-neutral-400 text-sm">Step {step + 1} of {questions.length}</p>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-8">
          {currentQuestion.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleAnswer(option.value)}
              className="w-full p-4 bg-neutral-700 hover:bg-purple-600/30 border-2 border-neutral-600 hover:border-purple-500 rounded-lg transition-all duration-200 flex items-center gap-4 group"
            >
              <span className="text-4xl">{option.emoji}</span>
              <span className="text-lg font-medium text-white group-hover:text-purple-300">{option.label}</span>
            </button>
          ))}
        </div>

        {/* Skip button */}
        <div className="text-center">
          <button
            onClick={onSkip}
            className="text-neutral-500 hover:text-neutral-300 text-sm underline"
          >
            Skip onboarding →
          </button>
        </div>
      </div>
    </div>
  );
};
// --- End Emoji Onboarding ---


// --- Landing Page ---
type LandingPageProps = { onEnterChat: () => void; onShowChangelog: () => void; };
const LandingPage = ({ onEnterChat, onShowChangelog }: LandingPageProps) => (
  <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-neutral-900 text-white">
    <div className="text-center max-w-4xl mx-auto">
      <h1 className="text-5xl md:text-7xl font-bold mb-6">
        <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Welcome to Wibali
        </span>
      </h1>
      <p className="text-lg md:text-xl text-neutral-400 mb-12 max-w-2xl mx-auto">
        Connect, collaborate, and chat in real-time with intelligent AI moderation
      </p>
     
      <button 
        onClick={onEnterChat} 
        className="px-10 py-3 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105"
      >
        Enter Chat
      </button>

      <div className="grid md:grid-cols-3 gap-8 mt-20 max-w-5xl mx-auto">
        <div className="bg-neutral-800 p-6 rounded-lg shadow-xl border border-neutral-700">
          <div className="flex items-center justify-center w-12 h-12 bg-blue-600/20 text-blue-400 rounded-lg mb-4">
            <IconShieldCheck />
          </div>
          <h2 className="text-2xl font-semibold mb-3">AI-Powered Moderation</h2>
          <p className="text-neutral-400">
            Intelligent AI bot monitors conversations, detects toxicity, and keeps chats safe automatically.
          </p>
        </div>
        <div className="bg-neutral-800 p-6 rounded-lg shadow-xl border border-neutral-700">
          <div className="flex items-center justify-center w-12 h-12 bg-blue-600/20 text-blue-400 rounded-lg mb-4">
            <IconMessageSquare />
          </div>
          <h2 className="text-2xl font-semibold mb-3">Smart Whispers</h2>
          <p className="text-neutral-400">
            Private messaging with pulsating indicators and in-room modal interface.
          </p>
        </div>
        <div className="bg-neutral-800 p-6 rounded-lg shadow-xl border border-neutral-700">
          <div className="flex items-center justify-center w-12 h-12 bg-blue-600/20 text-blue-400 rounded-lg mb-4">
            <IconZap />
          </div>
          <h2 className="text-2xl font-semibold mb-3">Real-Time Communication</h2>
          <p className="text-neutral-400">
            Lightning-fast WebSocket connections for instant messaging and live updates.
          </p>
        </div>
      </div>

      <footer className="mt-20 text-neutral-500">
        Powered by OpenAI • Built with React & WebSockets
      </footer>
    </div>
  </div>
);
// --- End Landing Page ---

// --- Changelog Page ---
type ChangelogPageProps = { onBack: () => void; };
const ChangelogPage = ({ onBack }: ChangelogPageProps) => (
  <div className="min-h-screen p-8 bg-neutral-900 text-white">
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">&larr; Back to Home</button>
      <h1 className="text-4xl font-bold mb-6">Wibali Changelog</h1>
      <div className="p-6 rounded-lg shadow-md bg-neutral-800 mb-6">
          <h2 className="text-2xl font-semibold mb-3">v1.8 - The "Context" Update</h2>
            <ul className="list-disc list-inside space-y-2 mb-4">
            <li>**New Feature: Report Reasons!** When reporting a user, you must now provide a reason.</li>
            <li>**New Feature: Message Context!** The server now automatically attaches the reported user's last 5 messages from that room to the report.</li>
            <li>**Admin Panel:** Admins can now see the report reason and click a "View" button to see the attached message context in a modal.</li>
            </ul>
        </div>
      <div className="p-6 rounded-lg shadow-md bg-neutral-800 mb-6">
          <h2 className="text-2xl font-semibold mb-3">v1.7 - The "Admin" Update</h2>
            <ul className="list-disc list-inside space-y-2 mb-4">
            <li>**New Feature: Admin Panel!** Admins now have a dedicated panel in the lobby.</li>
            <li className="ml-4">**User Management:** Search, edit, mute, warn, ban, and unban users directly from the panel.</li>
            <li className="ml-4">**See User Status:** View user status (Offline, Lobby, In Room) at a glance.</li>
            <li className="ml-4">**Reports & Tickets:** View and resolve user-submitted reports and ban appeals.</li>
            <li>**New Feature: Banned User Flow!** Banned users are now notified and can submit one support ticket.</li>
            <li>**New Feature: Admin Warn!** Admins can send a forced pop-up warning to any online user.</li>
            <li>**UI Change:** Login page "Join as Guest" button moved to a dedicated section.</li>
            <li>**Bug Fix:** Username/Email taken errors are now handled correctly.</li>
            </ul>
        </div>
      <div className="p-6 rounded-lg shadow-md bg-neutral-800 mb-6">
          <h2 className="text-2xl font-semibold mb-3">v1.6 - The "Taskbar & DM" Refactor</h2>
            <ul className="list-disc list-inside space-y-2 mb-4">
            <li>**New Feature: Universal Taskbar!**</li>
            <li className="ml-4">A new persistent taskbar is now at the top of the screen.</li>
            <li className="ml-4">It holds your user menu (status, logout) and global alerts.</li>
            <li className="ml-4">See unread whisper (DM) counts and system alerts (like reports) at a glance.</li>
            <li>**Whisper (DM) Overhaul!**</li>
            <li className="ml-4">Whispers are no longer "rooms." Clicking a DM opens a new, dedicated, lightweight chat interface.</li>
            <li className="ml-4">No more empty, messy user lists in your DMs!</li>
            <li>**Lobby DM Management:**</li>
            <li className="ml-4">Whispers in the lobby are now sorted by **most recent activity**.</li>
            <li className="ml-4">You can now "hide" (X) a DM from your lobby list to clean it up.</li>
            </ul>
        </div>
      <div className="p-6 rounded-lg shadow-md bg-neutral-800 mb-6">
          <h2 className="text-2xl font-semibold mb-3">v1.5 - The "Lobby" Refactor</h2>
            <ul className="list-disc list-inside space-y-2 mb-4">
            <li>**New Feature: The Lobby!** After logging in, you now land in the new Lobby.</li>
            <li className="ml-4">The Lobby is your central hub for exploring rooms, managing your DMs, and changing settings.</li>
            <li>**De-Bloated Chat Rooms:** Chat rooms no longer show the full room list and only show users in your current room.</li>
            <li>**New Feature: User Settings** A new "Settings" tab in the lobby allows you to edit your profile and toggle sounds/whispers.</li>
            </ul>
        </div>
    </div>
  </div>
);
// --- End Changelog ---


// --- NEW: Banned Modal ---
type BannedModalProps = {
  username: string;
  onClose: () => void;
};
const BannedModal = ({ username, onClose }: BannedModalProps) => {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted' | 'duplicate' | 'error'>('idle');

  const handleSubmit = async () => {
    if (!message.trim() || status === 'submitting' || status === 'submitted') return;
    setStatus('submitting');
    try {
      const response = await fetch("http://localhost:4000/submit-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, message }),
      });

      if (response.ok) {
        setStatus('submitted');
      } else if (response.status === 429) {
        setStatus('duplicate');
      } else {
        setStatus('error');
      }
    } catch (err) {
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
      <div className="w-full max-w-md p-6 rounded-lg shadow-xl bg-neutral-800 text-white border-2 border-red-500" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-3xl font-bold text-center mb-4 text-red-400">You Are Banned</h2>
        <p className="text-center text-neutral-300 mb-6">
          Your account ({username}) is banned from this server. If you believe this is a mistake, you may submit one support ticket.
        </p>

        {status === 'idle' && (
          <div className="space-y-4">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full h-32 p-3 border rounded-md bg-neutral-700 border-neutral-600 placeholder-neutral-500"
              placeholder="Explain your situation... (this can only be sent once)"
            />
            <button
              onClick={handleSubmit}
              className="w-full py-2.5 px-4 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={!message.trim()}
            >
              Submit Ticket
            </button>
          </div>
        )}

        {status === 'submitting' && (
          <p className="text-center text-yellow-400">Submitting your ticket...</p>
        )}
        {status === 'submitted' && (
          <p className="text-center text-green-400">Your ticket has been submitted. Admins will review it shortly.</p>
        )}
        {status === 'duplicate' && (
          <p className="text-center text-red-400">You have already submitted a ticket for this account.</p>
        )}
        {status === 'error' && (
          <p className="text-center text-red-400">An error occurred. Please try again later.</p>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 px-4 bg-neutral-600 text-neutral-200 font-semibold rounded-md hover:bg-neutral-500"
        >
          Close
        </button>
      </div>
    </div>
  );
};
// --- End Banned Modal ---


// --- Auth Page (MODIFIED) ---
type AuthPageProps = { onAuthSuccess: (socket: Socket, user: UserAccount) => void; };
const AuthPage = ({ onAuthSuccess }: AuthPageProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  
  const [guestUsername, setGuestUsername] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState("");

  const [showBannedModal, setShowBannedModal] = useState(false);

  const connectSocket = (authData: object, callback: (err: Error | null, socket?: Socket, user?: UserAccount) => void) => {
    const SERVER_URL = "http://localhost:4000";
    const socket = io(SERVER_URL, { auth: authData, withCredentials: true });

    socket.on("connect", () => {
      socket.on("self details", (user: UserAccount) => {
        callback(null, socket, user);
      });
    });

    socket.on("connect_error", (err) => {
      // MODIFIED: Pass specific error messages
      if (err.message.includes("banned")) {
        callback(new Error("banned"), undefined, undefined);
      } else if (err.message.includes("Username is already taken")) {
        callback(new Error("username_taken"), undefined, undefined);
      } else if (err.message.includes("Email is already taken")) {
        callback(new Error("email_taken"), undefined, undefined);
      } else {
        callback(err, undefined, undefined);
      }
      socket.disconnect();
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || (!isLogin && (!email || !fullName))) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);
    const authData = {
      type: isLogin ? 'login' : 'register',
      username, password,
      email: isLogin ? undefined : email,
      fullName: isLogin ? undefined : fullName,
    };
    
    connectSocket(authData, (err, socket, user) => {
      setLoading(false);
      if (err) {
        // MODIFIED: Handle new errors
        if (err.message === "banned") {
          setShowBannedModal(true);
          setError(""); // Banned modal is the error
        } else if (err.message === "username_taken") {
          setError("That username is already taken. Please choose another.");
        } else if (err.message === "email_taken") {
          setError("That email is already in use. Please use another.");
        } else {
          setError(err.message);
        }
      } else if (socket && user) {
        onAuthSuccess(socket, user);
      }
    });
  };

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestUsername.trim()) {
      setGuestError("Please enter a username.");
      return;
    }
    setGuestError("");
    setGuestLoading(true);
    const authData = { type: 'guest', username: guestUsername };

    connectSocket(authData, (err, socket, user) => {
      setGuestLoading(false);
      if (err) {
        if (err.message === "username_taken") {
          setGuestError("That username is registered. Please log in.");
        } else {
          setGuestError(err.message);
        }
      } else if (socket && user) {
        onAuthSuccess(socket, user);
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-900 text-white">
      {showBannedModal && (
        <BannedModal username={username} onClose={() => setShowBannedModal(false)} />
      )}
      
      <div className="w-full max-w-md p-8 rounded-lg shadow-xl bg-neutral-800 border border-neutral-700">
       
        <h2 className="text-3xl font-bold text-center mb-2">Welcome Back</h2>
        <p className="text-center text-neutral-400 mb-6">
          Sign in to your account or create a new one
        </p>

        <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900 rounded-lg mb-6">
          <button
            onClick={() => setIsLogin(true)}
            className={`px-4 py-2 rounded-md font-semibold ${isLogin ? 'bg-neutral-700' : 'text-neutral-400 hover:bg-neutral-700/50'}`}
          >
            Login
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`px-4 py-2 rounded-md font-semibold ${!isLogin ? 'bg-neutral-700' : 'text-neutral-400 hover:bg-neutral-700/50'}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-300">Full Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600 placeholder-neutral-500" placeholder="Enter your full name" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-neutral-300">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600 placeholder-neutral-500" placeholder="Enter your email" />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-300">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600 placeholder-neutral-500" placeholder="Enter your username" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-300">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600 placeholder-neutral-500" placeholder="Enter your password" />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-2.5 px-4 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={loading}
          >
            <IconArrowRight />
            {loading ? (isLogin ? "Logging in..." : "Registering...") : (isLogin ? "Login" : "Register")}
          </button>
        </form>

        {/* MODIFIED: Guest section */}
        <div className="border-t border-neutral-700 mt-6 pt-6">
          <form onSubmit={handleGuestSubmit} className="space-y-4">
             <div>
                <label className="block text-sm font-medium mb-1 text-neutral-300">Join as Guest</label>
                <input 
                  type="text" 
                  placeholder="Enter guest username" 
                  value={guestUsername} 
                  onChange={(e) => setGuestUsername(e.target.value)} 
                  className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600 placeholder-neutral-500" 
                />
              </div>
            {guestError && <p className="text-red-500 text-sm text-center">{guestError}</p>}
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-neutral-700 text-neutral-200 font-semibold rounded-md hover:bg-neutral-600 disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={guestLoading || !guestUsername}
            >
              <IconUser />
              {guestLoading ? "Joining..." : "Join as Guest"}
            </button>
          </form>
        </div>
        
      </div>
    </div>
  );
};
// --- End Auth Page ---


// --- Modals ---

// --- Profile Modal ---
type ProfileModalProps = { user: UserAccount; isSelf: boolean; onClose: () => void; onSave: (newAbout: string) => void; onWhisper: (user: UserAccount) => void; onIgnore: (userId: string) => void; onReport: (user: UserAccount) => void; isIgnored: boolean; };
const ProfileModal = ({ user, isSelf, onClose, onSave, onWhisper, onIgnore, onReport, isIgnored }: ProfileModalProps) => {
  const [about, setAbout] = useState(user.about);
  const [isEditing, setIsEditing] = useState(false);
  const handleSave = () => { onSave(about); setIsEditing(false); };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return 'N/A';
    }
  };

  const getInitials = (name: string) => name?.charAt(0).toUpperCase() || '?';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg shadow-xl bg-neutral-800 text-white border border-neutral-700" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-neutral-500 hover:text-white">
            <IconX />
          </button>
         
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <span className="flex items-center justify-center w-20 h-20 bg-blue-600 rounded-full text-3xl font-bold">
                {getInitials(user.username)}
              </span>
              <div className="absolute bottom-0 right-0">
                <StatusIndicator status={user.status} size="lg" />
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-bold">{user.username}</h2>
              <p className="text-neutral-400">{user.fullName}</p>
              <p className="text-green-500 text-sm capitalize">{user.status === 'offline' ? 'Offline' : 'Online'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center mb-6 bg-neutral-900/50 p-4 rounded-lg">
            <div>
              <div className="flex items-center justify-center gap-2 text-neutral-400 text-sm">
                <IconCalendarDays /> Joined
              </div>
              <p className="text-lg font-semibold">{formatDate(user.joined)}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 text-neutral-400 text-sm">
                <IconMessageCircle /> Messages
              </div>
              <p className="text-lg font-semibold">{user.messagesCount ?? 0}</p>
            </div>
            <div>
              <div className="flex items-center justify-center gap-2 text-neutral-400 text-sm">
                <IconHome /> Rooms Created
              </div>
              <p className="text-lg font-semibold">{user.roomsCreated ?? 0}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-neutral-400 mb-2">About Me</h3>
            {isEditing ? (
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                className="w-full h-32 p-3 border rounded-md bg-neutral-700 border-neutral-600 text-base"
                disabled={user.isGuest}
              />
            ) : (
              <p className="p-3 rounded-md min-h-[5rem] bg-neutral-900/50 text-neutral-300">
                {about || <span className="italic text-neutral-500">No bio yet.</span>}
              </p>
            )}
          </div>
         
          {isSelf && (
            <div className="flex justify-end gap-2 mt-4">
              {!isEditing ? (
                <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" disabled={user.isGuest}>
                  Edit Profile
                </button>
              ) : (
                <>
                  <button onClick={() => { setIsEditing(false); setAbout(user.about); }} className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500">
                    Cancel
                  </button>
                  <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                    Save
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {!isSelf && (
          <div className="bg-neutral-900/50 p-4 flex justify-end gap-2 rounded-b-lg border-t border-neutral-700">
            <button 
              onClick={() => { onWhisper(user); onClose(); }}
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <IconMessageSquare /> Whisper
            </button>
            <button 
              onClick={() => onIgnore(user.id)}
              className={`px-4 py-2 font-semibold rounded-md flex items-center gap-2 ${isIgnored ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-neutral-600 text-neutral-200 hover:bg-neutral-500'}`}
            >
              <IconBan /> {isIgnored ? 'Unignore' : 'Ignore'}
            </button>
            <button 
              onClick={() => { onReport(user); onClose(); }} // MODIFIED: onClose added
              className="px-4 py-2 bg-neutral-600 text-neutral-200 font-semibold rounded-md hover:bg-neutral-500 flex items-center gap-2"
            >
              <IconFlag /> Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
// --- End Profile Modal ---

type ReportModalProps = { alert: AlertData; onClose: () => void; };
const ReportModal = ({ alert, onClose }: ReportModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
    <div className="w-full max-w-md p-6 rounded-lg shadow-lg border-4 border-red-500 bg-neutral-800 text-white" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center mb-4"><svg className="w-12 h-12 text-red-500 mr-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><h2 className="text-2xl font-bold">Report Filed</h2></div>
      {/* MODIFIED: Updated text to be more generic */}
      <div className="space-y-3"><p>Your report against <strong>{alert.reportedName}</strong> has been sent to the server administrators.</p></div>
      <button onClick={onClose} className="w-full mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Dismiss</button>
    </div>
  </div>
);

// --- NEW: Report User Modal ---
type ReportUserModalProps = {
  reportedUser: User;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};
const ReportUserModal = ({ reportedUser, onClose, onSubmit }: ReportUserModalProps) => {
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim()) {
      onSubmit(reason.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
      <div className="w-full max-w-lg p-6 rounded-lg shadow-lg bg-neutral-800 text-white border border-neutral-700" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">Report User: {reportedUser.name}</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="reason" className="block text-sm font-medium mb-1 text-neutral-300">
                Please provide a reason for this report:
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-32 p-3 border rounded-md bg-neutral-700 border-neutral-600 placeholder-neutral-500"
                placeholder="E.g., spamming, harassment, etc."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500">
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              disabled={!reason.trim()}
            >
              Submit Report
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
// --- End NEW Modal ---

type MessageLimitModalProps = { onRegister: () => void; };
const MessageLimitModal = ({ onRegister }: MessageLimitModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div className="w-full max-w-md p-6 rounded-lg shadow-lg bg-neutral-800 text-white">
      <h2 className="text-2xl font-bold text-center mb-4">Message Limit Reached</h2><p className="text-center mb-6">You have reached your 5-message limit as a guest. Please register for an account to continue chatting.</p><button onClick={onRegister} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Register Now</button>
    </div>
  </div>
);

type RulesModalProps = { onAccept: () => void; };
const RulesModal = ({ onAccept }: RulesModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div className="w-full max-w-lg p-6 rounded-lg shadow-lg bg-neutral-800 text-white">
      <h2 className="text-2xl font-bold text-center mb-4">Wibali Rules & Guidelines</h2>
      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 mb-6">
        <p>Welcome to Wibali! To keep this a safe and friendly environment for everyone, please agree to the following rules:</p>
        <ul className="list-disc list-inside space-y-2"><li><strong>Be respectful.</strong></li><li><strong>No spamming.</strong></li><li><strong>Keep it SFW.</strong></li><li><strong>Use channels appropriately.</strong></li><li><strong>Listen to Admins.</strong></li></ul>
        <p>By clicking "Accept", you agree to abide by these rules. Failure to do so may result in being kicked or banned.</p>
      </div><button onClick={onAccept} className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold">Accept and Enter Chat</button>
    </div>
  </div>
);

const RebootModal = ({ data }: { data: RebootModalData; }) => {
  const [remaining, setRemaining] = useState(data.time);
  useEffect(() => { if (remaining <= 0) return; const timer = setInterval(() => setRemaining((r) => r - 1), 1000); return () => clearInterval(timer); }, [remaining]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-75">
      <div className="w-full max-w-md p-6 rounded-lg shadow-lg border-4 border-yellow-500 bg-neutral-800 text-white">
        <div className="flex items-center mb-4"><svg className="w-12 h-12 text-yellow-500 mr-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><h2 className="text-2xl font-bold">Server Reboot Initiated</h2></div>
        <div className="space-y-3"><p className="text-lg">The server is restarting. You will be disconnected shortly.</p><p><strong>Message:</strong> {data.message || "No message provided."}</p><p className="text-3xl font-bold text-center text-yellow-500">{remaining > 0 ? `${remaining}s` : "Rebooting..."}</p></div>
      </div>
    </div>
  );
};

type EditModalProps = { message: Message; onClose: () => void; onSave: (newText: string) => void; };
const EditModal = ({ message, onClose, onSave }: EditModalProps) => {
  const [text, setText] = useState(message.text); const handleSave = () => { onSave(text); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div className="w-full max-w-lg p-6 rounded-lg shadow-lg bg-neutral-800 text-white" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">Edit Message</h2>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full h-32 p-2 border rounded-md bg-neutral-700 border-neutral-600 mb-4" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); } }} />
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500">Cancel</button><button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Save</button></div>
      </div>
    </div>
  );
};

type CreateRoomModalProps = { onClose: () => void; onCreate: (roomName: string) => void; };
const CreateRoomModal = ({ onClose, onCreate }: CreateRoomModalProps) => {
  const [roomName, setRoomName] = useState(""); const handleCreate = () => { if (roomName.trim()) { onCreate(roomName.trim().toLowerCase()); } };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div className="w-full max-w-md p-6 rounded-lg shadow-lg bg-neutral-800 text-white" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">Create New Room</h2>
        <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Enter room name..." className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600 mb-4" onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500">Cancel</button><button onClick={handleCreate} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Create</button></div>
      </div>
    </div>
  );
};

// --- NEW: Admin Warn Modal ---
type WarnModalProps = {
  data: WarnModalData;
  onClose: () => void;
};
const WarnModal = ({ data, onClose }: WarnModalProps) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black bg-opacity-75">
    <div className="w-full max-w-md p-6 rounded-lg shadow-lg border-4 border-yellow-500 bg-neutral-800 text-white">
      <div className="flex items-center mb-4">
        <div className="text-yellow-500 mr-4"><IconAlertTriangle /></div>
        <h2 className="text-2xl font-bold">A Warning from Admin</h2>
      </div>
      <div className="space-y-3">
        <p className="text-lg">
          You have received an official warning from <strong>{data.from}</strong>.
        </p>
        <p className="text-lg font-semibold p-4 bg-neutral-900 rounded-md">"{data.message}"</p>
        <p>Please respect the server rules. Further infractions may lead to a kick or ban.</p>
      </div>
      <button onClick={onClose} className="w-full mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
        I Understand
      </button>
    </div>
  </div>
);
// --- End Modals ---


// --- Lobby Page ---
type LobbyPageProps = {
  socket: Socket;
  currentUser: UserAccount;
  onJoinRoom: (room: Room) => void;
  onJoinDM: (room: Room) => void;
  onShowChangelog: () => void;
  onViewProfile: (user: UserAccount) => void;
  onLogout: () => void;
  unreadDMNames: string[];
  onClearUnreadDMs: () => void;
  onWhisper: (user: User) => void;
  onGoToAdmin: () => void;
};
const LobbyPage = ({
  socket, currentUser, onJoinRoom, onJoinDM, onShowChangelog, onViewProfile, onLogout, unreadDMNames, onClearUnreadDMs, onWhisper, onGoToAdmin
}: LobbyPageProps) => {
  const [publicRooms, setPublicRooms] = useState<Room[]>([]);
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [dmRooms, setDmRooms] = useState<Room[]>([]);
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms', 'whispers', 'settings'
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({ enableSounds: true, enableWhispers: true });
  const audioCtx = useRef<AudioContext | null>(null);

  const getInitials = (name: string) => name?.charAt(0).toUpperCase() || '?';

  const initAudio = () => { if (!audioCtx.current) { try { audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtx.current?.resume(); } catch (e) { console.error("Web Audio API not supported", e); } } };
 
  const playSound = (type: 'notify') => {
    if (!settings.enableSounds || !audioCtx.current) return;
    const ctx = audioCtx.current; if (ctx.state === 'suspended') { ctx.resume(); }
    const oscillator = ctx.createOscillator(); const gainNode = ctx.createGain();
    oscillator.connect(gainNode); gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0, ctx.currentTime); gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01); gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.start(ctx.currentTime); oscillator.stop(ctx.currentTime + 0.15);
  };
 
  const fetchLobbyData = () => {
    socket.emit("get lobby data", (data: {
      publicRooms: Room[]; myRooms: Room[]; dmRooms: Room[]; settings: UserSettings;
    }) => {
      setPublicRooms(data.publicRooms);
      setMyRooms(data.myRooms);
      setDmRooms(data.dmRooms);
      if (data.settings) setSettings(data.settings);
    });
  };

  useEffect(() => {
    initAudio();
    fetchLobbyData();

    const handleRoomList = (rooms: Room[]) => {
      setPublicRooms(rooms);
      setMyRooms(rooms.filter(r => r.owner === currentUser.id));
    };
    const handleDMList = (allDMs: Room[]) => setDmRooms(allDMs);
    const handleServerMessage = (msg: Message) => { if (msg.type === 'server') playSound('notify'); };

    socket.on("room list", handleRoomList);
    socket.on("dm list update", handleDMList);
    socket.on("chat message", handleServerMessage);

    return () => {
      socket.off("room list", handleRoomList);
      socket.off("dm list update", handleDMList);
      socket.off("chat message", handleServerMessage);
    };
  }, [socket, currentUser.id]);

  const handleCreateRoom = (roomName: string) => {
    socket.emit("create room", roomName, (newRoom: Room) => {
      if (newRoom) onJoinRoom(newRoom);
    });
    setShowCreateRoom(false);
  };

  const handleSettingChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    const newSettings = { ...settings, [name]: checked };
    setSettings(newSettings);
    socket.emit("update settings", newSettings);
  };
 
  const getDMDisplayName = (room: Room) => {
    const otherUser = room.participants?.find(p => p.id !== currentUser?.id);
    return otherUser ? otherUser.name : 'Direct Message';
  };

  const handleHideDM = (e: React.MouseEvent, roomName: string) => {
    e.stopPropagation();
    socket.emit("hide dm", roomName);
    setDmRooms(prev => prev.filter(r => r.name !== roomName));
  };
 
  const handleTabClick = (tabId: string) => {
    if (tabId === 'whispers') {
      onClearUnreadDMs();
    }
    if (tabId === 'admin') {
      onGoToAdmin();
      return;
    }
    setActiveTab(tabId);
  };

  const tabs = [
    { id: 'rooms', label: 'Rooms', icon: <IconLayoutDashboard /> },
    { id: 'whispers', label: 'Whispers', icon: <IconMessagesSquare /> },
    { id: 'settings', label: 'Settings', icon: <IconSettings /> },
  ];

  if (currentUser.role === 'admin') {
    tabs.push({ id: 'admin', label: 'Admin', icon: <IconShield /> });
  }

  return (
    <div className="bg-neutral-900 text-white h-full flex flex-col font-sans">
      {showCreateRoom && (<CreateRoomModal onClose={() => setShowCreateRoom(false)} onCreate={handleCreateRoom} />)}

      <header className="flex items-center justify-between p-6 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button 
            className="flex items-center justify-center w-12 h-12 bg-blue-600 rounded-full text-xl font-bold"
            onClick={() => onViewProfile(currentUser)}
          >
            {getInitials(currentUser.username)}
          </button>
          <div>
            <h1 className="text-2xl font-bold">Welcome, {currentUser.username}!</h1>
            <p className="text-neutral-400">Choose a room or start a new conversation</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 text-neutral-200 rounded-lg hover:bg-neutral-600 font-semibold"
        >
          <IconLogOut /> Logout
        </button>
      </header>

      <div className="flex-1 flex flex-col min-h-0 p-6">
        <nav className="flex items-center p-1 bg-neutral-800 rounded-lg mb-6 max-w-lg">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-lg font-medium relative ${
                activeTab === tab.id ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:bg-neutral-700/50'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'whispers' && unreadDMNames.length > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-neutral-700">
                  {unreadDMNames.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto">
          {activeTab === 'rooms' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Public Rooms</h2>
                {!currentUser.isGuest && (
                  <button
                    onClick={() => setShowCreateRoom(true)}
                    className="px-4 py-2 rounded-md text-lg font-medium bg-green-600 text-white hover:bg-green-700"
                  >
                    + Create Room
                  </button>
                )}
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {publicRooms.length > 0 ? publicRooms.map(room => (
                  <div key={room.name} className="flex flex-col justify-between bg-neutral-800 p-6 rounded-lg border border-neutral-700 hover:bg-neutral-700/50 transition-colors">
                    <div>
                      <h3 className="text-xl font-semibold mb-1"># {room.name}</h3>
                      <p className="text-sm text-neutral-400 mb-4">{room.topic || "No topic set."}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-neutral-400 text-sm">
                        <IconUsers /> {room.userCount || 0} online
                      </span>
                      <button onClick={() => onJoinRoom(room)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Join</button>
                    </div>
                  </div>
                )) : (<p className="text-neutral-400">No public rooms available.</p>)}
              </div>
             
              {myRooms.length > 0 && (
                <>
                  <h2 className="text-2xl font-bold mt-8 mb-4">My Rooms</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {myRooms.map(room => (
                      <div key={room.name} className="flex flex-col justify-between bg-neutral-800 p-6 rounded-lg border border-neutral-700 hover:bg-neutral-700/50 transition-colors">
                        <div>
                          <h3 className="text-xl font-semibold mb-1"># {room.name}</h3>
                          <p className="text-sm text-neutral-400 mb-4">{room.topic || "No topic set."}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-neutral-400 text-sm">
                            <IconUsers /> {room.userCount || 0} online
                          </span>
                          <button onClick={() => onJoinRoom(room)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Join</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

            </div>
          )}
         
          {activeTab === 'whispers' && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Whispers (Direct Messages)</h2>
              <div className="space-y-2 max-w-2xl">
                {dmRooms.length > 0 ? dmRooms.map(room => {
                  const isUnread = unreadDMNames.includes(room.name);
                  return (
                    <button 
                      key={room.name} 
                      onClick={() => onJoinDM(room)}
                      className={`w-full text-left p-4 rounded-lg flex justify-between items-center group ${
                        isUnread ? 'bg-green-600 hover:bg-green-700' : 'bg-neutral-800 border border-neutral-700 hover:bg-neutral-700/50'
                      }`}
                    >
                      <span className="text-lg font-medium">💬 {getDMDisplayName(room)}</span>
                      <span onClick={(e) => handleHideDM(e, room.name)} className="text-neutral-500 hover:text-white opacity-0 group-hover:opacity-100 p-1 rounded-full">
                        <IconX />
                      </span>
                    </button>
                  )
                }) : (<p className="text-neutral-400">No whisper conversations started.</p>)}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold mb-4">Settings</h2>
              <div className="space-y-6">
                <div className="p-6 bg-neutral-800 rounded-lg border border-neutral-700">
                  <h3 className="text-xl font-semibold mb-3">Profile</h3>
                  <p className="text-neutral-300 mb-3">Your "About Me" and other details are visible to others.</p>
                  <button onClick={() => onViewProfile(currentUser)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Edit Profile</button>
                </div>
                <div className="p-6 bg-neutral-800 rounded-lg border border-neutral-700">
                  <h3 className="text-xl font-semibold mb-3">Application</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-neutral-700/50">
                      <input type="checkbox" name="enableSounds" checked={settings.enableSounds} onChange={handleSettingChange} className="w-5 h-5 rounded bg-neutral-700 border-neutral-600 text-blue-600 focus:ring-blue-600" />
                      <span className="text-lg">Enable Sound Effects</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-neutral-700/50">
                      <input type="checkbox" name="enableWhispers" checked={settings.enableWhispers} onChange={handleSettingChange} className="w-5 h-5 rounded bg-neutral-700 border-neutral-600 text-blue-600 focus:ring-blue-600" />
                      <span className="text-lg">Enable Whispers (DMs)</span>
                    </label>
                  </div>
                </div>
                <div className="p-6 bg-neutral-800 rounded-lg border border-neutral-700">
                  <h3 className="text-xl font-semibold mb-3">Changelog</h3>
                  <p className="text-neutral-300 mb-3">See what's new in Wibali.</p>
                  <button
                    onClick={onShowChangelog}
                    className="px-4 py-2 bg-neutral-700 text-white rounded-md hover:bg-neutral-600 font-semibold"
                  >
                    View Changelog
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
// --- End Lobby Page ---


// --- Chat App ---
type ChatAppProps = {
  socket: Socket;
  initialUser: UserAccount;
  initialRoom: Room;
  onExit: () => void;
  onViewProfile: (user: User) => void;
  onWhisper: (user: User) => void;
  unreadCount: number;
  unreadDMNames: string[];
};
function ChatApp({ socket, initialUser, initialRoom, onExit, onViewProfile, onWhisper, unreadCount, unreadDMNames }: ChatAppProps) {
  const [connected, setConnected] = useState(socket.connected);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<UserAccount>(initialUser);
  const [typing, setTyping] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, user: null });
  const [ignoredUsers, setIgnoredUsers] = useState<string[]>([]);
  const [reportData, setReportData] = useState<AlertData | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<Room>(initialRoom);
  const [usersWithDetails, setUsersWithDetails] = useState<Record<string, User>>({});
  const [currentTopic, setCurrentTopic] = useState<string | undefined>(initialRoom.topic);
  const [isRoomLocked, setIsRoomLocked] = useState<boolean>(initialRoom.isLocked || false);
  const [rebootModal, setRebootModal] = useState<RebootModalData | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  
  // NEW: State for report modal
  const [reportingUser, setReportingUser] = useState<User | null>(null);
  
  // NEW: State for room recap modal
  const [showRecapModal, setShowRecapModal] = useState(false);
  const [roomSummary, setRoomSummary] = useState<string>('');
  const [loadingRecap, setLoadingRecap] = useState(false);

  const [unreadCountsByUser, setUnreadCountsByUser] = useState<Record<string, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const settingsRef = useRef<UserSettings>({ enableSounds: true, enableWhispers: true });

  const fetchRoomRecap = async () => {
    setLoadingRecap(true);
    try {
      const response = await fetch(`http://localhost:4000/api/room/${currentRoom.name}/summary`);
      if (response.ok) {
        const data = await response.json();
        setRoomSummary(data.text || 'No recent activity in this room.');
        setShowRecapModal(true);
      } else {
        setRoomSummary('Unable to load room recap. Please try again.');
        setShowRecapModal(true);
      }
    } catch (error) {
      console.error('Error fetching recap:', error);
      setRoomSummary('Unable to load room recap. Please try again.');
      setShowRecapModal(true);
    } finally {
      setLoadingRecap(false);
    }
  };

  useEffect(() => {
    const counts: Record<string, number> = {};
    const currentUserId = initialUser.id;
  
    for (const roomName of unreadDMNames) {
      const ids = roomName.split('__DM__');
      const otherUserId = ids.find(id => id !== currentUserId);
  
      if (otherUserId) {
        counts[otherUserId] = 1; 
      }
    }
    setUnreadCountsByUser(counts);
  }, [unreadDMNames, initialUser.id]);

  const playSound = (type: 'message' | 'notify') => {
    if (!settingsRef.current.enableSounds) return;
    if (!audioCtx.current) { try { audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtx.current?.resume(); } catch (e) { console.error("Web Audio API not supported", e); return; } }
    const ctx = audioCtx.current; if (ctx.state === 'suspended') { ctx.resume(); }
    const oscillator = ctx.createOscillator(); const gainNode = ctx.createGain();
    oscillator.connect(gainNode); gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0, ctx.currentTime); gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01); gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    switch (type) {
      case 'message': oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(440, ctx.currentTime); break;
      case 'notify': oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, ctx.currentTime); break;
    }
    oscillator.start(ctx.currentTime); oscillator.stop(ctx.currentTime + 0.15);
  };

  useEffect(() => {
    socket.emit("join room", initialRoom.name, (data: { history: Message[]; settings: UserSettings; roomDetails: Room; }) => {
      setMessages(data.history);
      if (data.settings) settingsRef.current = data.settings;
      if (data.roomDetails) {
        setCurrentRoom(data.roomDetails); setCurrentTopic(data.roomDetails.topic); setIsRoomLocked(data.roomDetails.isLocked || false);
      }
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect", () => setConnected(true));
    socket.on("self details", (user: UserAccount) => setCurrentUser(user));
    socket.on("user list", (list: User[]) => {
      setUsers(list);
      setUsersWithDetails(Object.fromEntries(list.map(u => [u.name, u])));
    });
    socket.on("chat message", (msg: Message) => {
      if (msg.room !== currentRoom.name) return;
      if (msg.user === 'System' || msg.type === 'server') playSound('notify');
      else if (msg.user !== currentUser?.username) playSound('message');
      setMessages((prev) => [...prev, msg]);
    });
    socket.on("message updated", (updatedMsg: Message) => {
      if (updatedMsg.room !== currentRoom.name) return;
      setMessages((prev) => prev.map((msg) => (msg.id === updatedMsg.id ? updatedMsg : msg)));
    });
    // MODIFIED: This is now handled by the new report modal flow
    // socket.on("report", (data: AlertData) => setReportData(data));
    socket.on("message limit reached", () => setShowLimitModal(true));
    socket.on("force switch room", (room: Room) => {
      setMessages([]); setCurrentRoom(room); setCurrentTopic(room.topic); setIsRoomLocked(room.isLocked || false);
      socket.emit("join room", room.name, (data: { history: Message[] }) => setMessages(data.history));
    });
    socket.on("room update", (data: { roomName: string, topic: string, isLocked: boolean }) => {
      if (data.roomName === currentRoom.name) { setCurrentTopic(data.topic); setIsRoomLocked(data.isLocked); }
    });
    socket.on("history cleared", ({ room }) => { if (room === currentRoom.name) setMessages([]); });
    socket.on("server reboot", (data: RebootModalData) => setRebootModal(data));
   
    return () => {
      socket.emit("leave room");
      socket.off("disconnect"); socket.off("connect"); socket.off("self details"); socket.off("user list");
      socket.off("chat message"); socket.off("message updated"); // socket.off("report");
      socket.off("message limit reached"); socket.off("force switch room"); socket.off("room update");
      socket.off("history cleared"); socket.off("server reboot");
    };
  }, [socket, initialRoom.name]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!typing) { setTyping(true); socket.emit("user typing", { isTyping: true }); }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => { setTyping(false); socket.emit("user typing", { isTyping: false }); }, 2000);
  };
  const sendMessage = () => {
    const text = newMessage.trim();
    if (!text || showLimitModal) return;
    
    // MODIFIED: Check for global mute
    if (currentUser.isGloballyMuted) {
      setNewMessage("");
      // Optionally, show a small error to the user
      return;
    }
   
    if (text.startsWith('/') && currentUser.role === 'admin') {
      const [command, ...args] = text.split(' ');
      socket.emit("admin command", { command: command.slice(1), args: args.join(' '), });
    } else { 
      socket.emit("chat message", { text }); 
    }
   
    setNewMessage("");
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    setTyping(false); socket.emit("user typing", { isTyping: false });
  };
  const deleteMessage = (id: string) => socket.emit("delete message", { id });
  const addEmoji = (emoji: string) => setNewMessage((prev) => prev + emoji);
  const promoteUser = (targetUserId: string) => { if (!currentUser.isGuest) socket.emit("promote user", { targetUserId }); };
  const demoteUser = (targetUserId: string) => { if (!currentUser.isGuest) socket.emit("demote user", { targetUserId }); };
  const handleKickUser = (user: User) => socket.emit("admin kick", { targetUserId: user.id });
  const handleBanUser = (user: User) => socket.emit("admin ban", { targetUserId: user.id, targetUsername: user.name });
  const handleSpectateUser = (user: User) => socket.emit("admin spectate", { targetUserId: user.id });
  const handleUserContextMenu = (e: React.MouseEvent, user: User) => { if (!currentUser.isSummoned) { e.preventDefault(); e.stopPropagation(); setContextMenu({ visible: true, x: e.pageX, y: e.pageY, user: user }); } };
  const closeContextMenu = () => { if (contextMenu.visible) setContextMenu({ visible: false, x: 0, y: 0, user: null }); };
  const handleIgnoreUser = (userId: string) => setIgnoredUsers((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  
  // MODIFIED: handleReport now opens the modal
  const handleReport = (reportedUser: User) => {
    if (!currentUser.isGuest) {
      setReportingUser(reportedUser);
    }
  };
  
  // NEW: Handler for submitting the report modal
  const handleSubmitReport = (reason: string) => {
    if (currentUser && reportingUser) {
      socket.emit("report", { 
        reportedUserId: reportingUser.id, 
        reason: reason 
      });
      // Show the confirmation modal
      setReportData({ 
        reporterName: currentUser.username, 
        reportedName: reportingUser.name, 
        roomName: currentRoom.name 
      });
      setReportingUser(null);
    }
  };
  
  const handleSummonUser = (user: User) => socket.emit("admin summon", { targetUserId: user.id });
  const handleReleaseUser = () => { if (currentRoom.type === 'judgement' && currentRoom.summonedUser) socket.emit("admin release", { targetUserId: currentRoom.summonedUser }); };

  const getRoomDisplayName = (room: Room) => {
    if (room.type === 'public') return `# ${room.name}`;
    if (room.type === 'judgement') return `⚖️ ${room.name}`;
    return 'Direct Message';
  };
  const currentChatName = getRoomDisplayName(currentRoom);
  const currentUserRole = users.find(u => u.id === currentUser?.id)?.role || (currentUser.role === 'admin' ? 'admin' : 'user');
  const isSummoned = currentUser.isSummoned === true;
  
  // MODIFIED: Added global mute check
  const isInputDisabled = !socket.connected || showLimitModal || (isSummoned && currentUser.role !== 'admin') || (currentUser.role !== 'admin' && (isRoomLocked || currentUser.isSpectating)) || currentUser.isGloballyMuted;
 
  const placeholderText = !socket.connected ? "Connecting..." 
    : showLimitModal ? "Please register to continue chatting" 
    : isSummoned && currentUser.role !== 'admin' ? "You are being held for judgement."
    : currentUser.isGloballyMuted ? "You are globally muted."
    : isRoomLocked && currentUser.role !== 'admin' ? "Room is locked." 
    : currentUser.isSpectating ? "You are spectating (muted)." 
    : currentUser.role === 'admin' ? "Type a message, @AI_Bot, or /command..." 
    : "Type a message or ask @AI_Bot a question...";

  const emojis = [ '😀', '😂', '👍', '❤️', '🤔', '😭', '🔥', '🎉', '👋', '👀', '🙏', '🤷', '🤯', '🥳', '✅', '❌' ];

  return (
    <div
      className={`bg-neutral-900 text-white h-full flex flex-col font-sans overflow-hidden ${isSummoned ? 'border-4 border-red-500' : ''}`}
      onClick={(e) => { closeContextMenu(); setShowEmojiPicker(false); }}
    >
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; } 
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
      {/* MODIFIED: ReportModal is now for confirmation */}
      {reportData && (<ReportModal alert={reportData} onClose={() => setReportData(null)} />)}
      {/* NEW: ReportUserModal */}
      {reportingUser && (
        <ReportUserModal
          reportedUser={reportingUser}
          onClose={() => setReportingUser(null)}
          onSubmit={handleSubmitReport}
        />
      )}
      {showLimitModal && (<MessageLimitModal onRegister={onExit} />)}
      {showRecapModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 border border-purple-500/50 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-purple-300 flex items-center gap-2">
                📖 Previously in #{currentRoom.name}...
              </h3>
              <button onClick={() => setShowRecapModal(false)} className="text-neutral-400 hover:text-white text-2xl">&times;</button>
            </div>
            <div className="bg-neutral-900 rounded-lg p-4 mb-4">
              <pre className="text-sm text-neutral-300 whitespace-pre-wrap font-mono">{roomSummary}</pre>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowRecapModal(false)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {rebootModal && (<RebootModal data={rebootModal} />)}
      {editingMessage && (
        <EditModal 
          message={editingMessage} onClose={() => setEditingMessage(null)}
          onSave={(newText) => {
            if (newText.trim() && newText !== editingMessage.text) { socket.emit("edit message", { id: editingMessage.id, newText }); }
            setEditingMessage(null);
          }}
        />
      )}
      <UserContextMenu
        menuState={contextMenu} currentUserRole={currentUserRole} currentUser={currentUser} onClose={closeContextMenu}
        onDm={onWhisper} onPromote={promoteUser} onDemote={demoteUser} onIgnore={handleIgnoreUser}
        isIgnored={!!contextMenu.user && ignoredUsers.includes(contextMenu.user.id)}
        onViewProfile={onViewProfile} onReport={handleReport} onSummon={handleSummonUser}
        onKick={handleKickUser} onBan={handleBanUser} onSpectate={handleSpectateUser}
      />
     
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* User List Panel */}
        <div className={`bg-neutral-800 border-r border-neutral-700 ${isSummoned ? 'opacity-50 pointer-events-none' : ''} w-full md:w-64 p-4 flex flex-col overflow-y-auto`}>
          <h2 className="text-xl font-semibold mb-3">Users <span className="text-sm font-normal text-neutral-400">({users.length})</span></h2>
          <ul className="space-y-1">
            {users.map((user) => {
              const hasUnread = !!unreadCountsByUser[user.id];
              return (
                <li key={user.id} className={`group flex items-center justify-between gap-2 p-2 rounded-md ${!isSummoned ? 'cursor-pointer hover:bg-neutral-700/50' : ''} ${user.isSummoned ? 'opacity-50 text-neutral-500' : ''} ${user.isSpectating ? 'opacity-60' : ''}`}
                  onContextMenu={(e) => handleUserContextMenu(e, user)}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="relative flex-shrink-0">
                      <StatusIndicator status={user.status} />
                    </div>

                    {hasUnread && (
                      <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" title="Unread Whisper"></span>
                    )}

                    <UserBadge role={user.role} username={user.name} />
                    <span className={`truncate ${user.isSpectating ? 'line-through' : ''}`}>{user.name}</span>
                    {user.id === currentUser?.id && (<span className="text-xs text-blue-400">(You)</span>)}
                  </div>
                  {user.typing && (<span className="text-sm italic text-neutral-400 flex-shrink-0">typing...</span>)}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Chat Panel */}
        <div className="bg-neutral-900 flex-1 flex flex-col p-4 min-h-0">
          <div className="flex justify-between items-center mb-1 border-b pb-3 border-neutral-800">
            <div className="flex items-center gap-3">
               <button onClick={onExit} className="px-3 py-1 bg-neutral-700 text-white rounded-md hover:bg-neutral-600" title="Exit to Lobby" disabled={isSummoned}>&larr; Lobby</button>
              
              <div
                className={`relative px-3 py-1 rounded-md text-white ${unreadCount > 0 ? 'bg-green-600' : 'bg-neutral-700'}`}
              >
                Whispers {unreadCount > 0 ? `(${unreadCount})` : ''}
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-neutral-900">
                    {unreadCount}
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-bold flex items-center gap-2">{isRoomLocked && <span title="Room is Locked">🔒</span>}{currentChatName}</h2>
            </div>
            {currentUser.role === 'admin' && currentRoom.type === 'judgement' && (<button onClick={handleReleaseUser} className="px-4 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold">Release User</button>)}
            {isSummoned && (<p className="text-red-500 font-bold">You are being held for judgement. You cannot leave.</p>)}
          </div>
          {currentTopic && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-neutral-500 italic">Topic: {currentTopic}</p>
              {currentRoom.type !== 'dm' && (
                <button
                  onClick={fetchRoomRecap}
                  disabled={loadingRecap}
                  className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="View room recap"
                >
                  📖 {loadingRecap ? 'Loading...' : 'Previously in this room...'}
                </button>
              )}
            </div>
          )}
          {!currentTopic && currentRoom.type !== 'dm' && (
            <div className="flex justify-end mb-2">
              <button
                onClick={fetchRoomRecap}
                disabled={loadingRecap}
                className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                title="View room recap"
              >
                📖 {loadingRecap ? 'Loading...' : 'Previously in this room...'}
              </button>
            </div>
          )}
         
          <div className="flex-1 overflow-y-auto mb-4 space-y-2 no-scrollbar p-2">
            {messages.filter(msg => !(msg.type === 'user' && msg.user !== currentUser.username && ignoredUsers.find(id => usersWithDetails[msg.user]?.id === id) )).map((msg, index) => {
              if (msg.type === 'system' || msg.type === 'server') { return (
                  <div key={msg.id} className={`text-sm py-1 px-2 ${msg.type === 'server' ? 'text-red-500 font-bold' : 'text-neutral-500 italic'}`}>
                    <span className="text-neutral-600 mr-2">[{msg.time}]</span> {msg.type === 'server' && 'SERVER: '}{msg.text}
                  </div>
              )}
              {/* AI Thought bubble - special styling */}
              if (msg.type === 'thought') { return (
                  <div key={msg.id} className="flex justify-center my-3">
                    <div className="max-w-lg bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-2 border-purple-500/50 rounded-2xl px-4 py-3 shadow-lg animate-fadeIn relative">
                      <div className="absolute -top-2 -left-2 w-4 h-4 bg-purple-500/50 rounded-full"></div>
                      <div className="absolute -top-1 -left-4 w-3 h-3 bg-purple-500/30 rounded-full"></div>
                      <div className="flex items-start gap-2">
                        <span className="text-purple-300 text-sm font-semibold flex items-center gap-1">
                          <IconBot /> AI_Bot
                        </span>
                      </div>
                      <p className="text-purple-100 italic text-sm mt-1">{msg.text}</p>
                      <span className="text-purple-400/60 text-xs mt-1 block">{msg.time}</span>
                    </div>
                  </div>
              )}
              
              const isSelf = msg.user === currentUser?.username && !msg.deleted; 
              const userDetails = usersWithDetails[msg.user];
              const isLastMessage = index === messages.length - 1; const isAdmin = currentUserRole === 'admin';
              const showDeleteButton = !msg.deleted && (isAdmin || (isSelf && isLastMessage)); const showEditButton = !msg.deleted && (isAdmin || (isSelf && isLastMessage));
              return (
                <div key={msg.id} className="group flex items-start justify-between py-1 px-2 rounded hover:bg-neutral-800/50">
                  <div className={`flex-1 min-w-0 ${userDetails?.isSpectating ? 'opacity-60 italic' : ''}`}>
                    <span className="text-neutral-600 mr-2">[{msg.time}]</span>
                    <span className="inline-flex items-center">
                      {!msg.deleted && (
                        <span className="mr-1"><UserBadge role={userDetails?.role} username={userDetails?.name} /></span>
                      )}
                      <strong className={`mr-2 ${isSelf ? 'text-blue-400' : 'text-neutral-300'}`}>
                        {msg.user}:
                      </strong>
                    </span>
                    <span className={`text-base whitespace-pre-wrap ${msg.deleted ? 'italic text-neutral-500' : ''}`}>
                      {' '}{msg.text} {msg.edited && !msg.deleted && <span className="text-xs text-neutral-500 ml-1">(edited)</span>}
                    </span>
                  </div>
                  <div className="flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {showEditButton && (<button className="w-5 h-5 text-neutral-400 hover:text-white" onClick={() => setEditingMessage(msg)} title="Edit message">✎</button>)}
                    {showDeleteButton && (<button className="w-5 h-5 text-red-500 hover:text-red-400" onClick={() => deleteMessage(msg.id)} title="Delete message">✕</button>)}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef}></div>
          </div>

          <div className="border-t pt-4 border-neutral-800">
            <div className="flex gap-2 mb-2 bg-neutral-800 p-2 rounded-lg">
              <input type="text" value={newMessage} onChange={(e) => socket.connected && handleTyping(e.target.value)} placeholder={placeholderText} className="bg-neutral-700 border-neutral-600 flex-1 px-3 py-2 border rounded-md" onKeyDown={(e) => socket.connected && e.key === "Enter" && !e.shiftKey && sendMessage()} disabled={isInputDisabled} />
              <div className="relative">
                <button className="px-3 py-2 bg-neutral-700 text-white rounded-md hover:bg-neutral-600 text-xl disabled:opacity-50" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }} disabled={isInputDisabled} title="Pick emoji">😀</button>
                {showEmojiPicker && (<div className="absolute bottom-12 right-0 bg-neutral-700 p-2 rounded shadow-lg grid grid-cols-8 gap-1 z-10 border border-neutral-600 w-64" onClick={(e) => e.stopPropagation()}>
                    {emojis.map(emoji => (<button key={emoji} onClick={() => { addEmoji(emoji); setShowEmojiPicker(false); }} className="text-2xl p-1 hover:bg-neutral-600 rounded">{emoji}</button>))}
                </div>)}
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50" onClick={sendMessage} disabled={!newMessage.trim() || isInputDisabled}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// --- End Chat App ---


// --- Direct Message Modal ---
type DirectMessageModalContentProps = {
  socket: Socket;
  initialUser: UserAccount;
  initialRoom: Room;
  onClose: () => void;
  onViewProfile: (user: User) => void;
};
function DirectMessageModalContent({ socket, initialUser, initialRoom, onClose, onViewProfile }: DirectMessageModalContentProps) {
  const [connected, setConnected] = useState(socket.connected);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<UserAccount>(initialUser);
  const [typing, setTyping] = useState(false);
  const [ignoredUsers, setIgnoredUsers] = useState<string[]>([]);
  const [reportData, setReportData] = useState<AlertData | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [rebootModal, setRebootModal] = useState<RebootModalData | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
 
  const otherUser = initialRoom.participants?.find(p => p.id !== initialUser.id) || { id: '?', name: 'Unknown', role: 'user' };
  const isAdminWhisper = otherUser.role === 'admin';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const settingsRef = useRef<UserSettings>({ enableSounds: true, enableWhispers: true });

  const playSound = (type: 'message' | 'notify') => {
    if (!settingsRef.current.enableSounds) return;
    if (!audioCtx.current) { try { audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtx.current?.resume(); } catch (e) { console.error("Web Audio API not supported", e); return; } }
    const ctx = audioCtx.current; if (ctx.state === 'suspended') { ctx.resume(); }
    const oscillator = ctx.createOscillator(); const gainNode = ctx.createGain();
    oscillator.connect(gainNode); gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0, ctx.currentTime); gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01); gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    if (type === 'message') { oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(440, ctx.currentTime); }
    else { oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, ctx.currentTime); }
    oscillator.start(ctx.currentTime); oscillator.stop(ctx.currentTime + 0.15);
  };

  useEffect(() => {
    socket.emit("join room", initialRoom.name, (data: { history: Message[]; settings: UserSettings; }) => {
      setMessages(data.history);
      if (data.settings) settingsRef.current = data.settings;
    });

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect", () => setConnected(true));
    socket.on("self details", (user: UserAccount) => setCurrentUser(user));
    socket.on("chat message", (msg: Message) => {
      if (msg.room !== initialRoom.name) return;
      if (msg.user === 'System' || msg.type === 'server') playSound('notify');
      else if (msg.user !== currentUser?.username) playSound('message');
      setMessages((prev) => [...prev, msg]);
    });
    socket.on("message updated", (updatedMsg: Message) => {
      if (updatedMsg.room !== initialRoom.name) return;
      setMessages((prev) => prev.map((msg) => (msg.id === updatedMsg.id ? updatedMsg : msg)));
    });
    socket.on("report", (data: AlertData) => setReportData(data));
    socket.on("message limit reached", () => setShowLimitModal(true));
    socket.on("history cleared", ({ room }) => { if (room === initialRoom.name) setMessages([]); });
    socket.on("server reboot", (data: RebootModalData) => setRebootModal(data));
   
    return () => {
      socket.emit("leave room");
      socket.off("disconnect"); socket.off("connect"); socket.off("self details");
      socket.off("chat message"); socket.off("message updated"); socket.off("report");
      socket.off("message limit reached"); socket.off("history cleared"); socket.off("server reboot");
    };
  }, [socket, initialRoom.name]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!typing) { setTyping(true); socket.emit("user typing", { isTyping: true }); }
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => { setTyping(false); socket.emit("user typing", { isTyping: false }); }, 2000);
  };
  const sendMessage = () => {
    const text = newMessage.trim();
    if (!text || showLimitModal) return;
    
    // MODIFIED: Check for global mute
    if (currentUser.isGloballyMuted) {
      setNewMessage("");
      return;
    }
    
    socket.emit("chat message", { text });
    setNewMessage("");
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    setTyping(false); socket.emit("user typing", { isTyping: false });
  };
  const deleteMessage = (id: string) => socket.emit("delete message", { id });
  const addEmoji = (emoji: string) => setNewMessage((prev) => prev + emoji);
  const handleIgnoreUser = (userId: string) => setIgnoredUsers((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
 
  // MODIFIED: Added global mute check
  const isInputDisabled = !socket.connected || showLimitModal || currentUser.isGloballyMuted;
  const placeholderText = !socket.connected ? "Connecting..." 
    : showLimitModal ? "Please register to continue chatting"
    : currentUser.isGloballyMuted ? "You are globally muted."
    : `Message ${otherUser.name}...`;
    
  const emojis = [ '😀', '😂', '👍', '❤️', '🤔', '😭', '🔥', '🎉', '👋', '👀', '🙏', '🤷', '🤯', '🥳', '✅', '❌' ];
  const getInitials = (name: string) => name?.charAt(0).toUpperCase() || '?';

  return (
    <div
      className={`bg-neutral-800 text-white h-full flex flex-col font-sans overflow-hidden rounded-lg shadow-xl border ${isAdminWhisper ? 'border-blue-500' : 'border-neutral-700'}`}
      onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(false); }}
    >
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
      {reportData && (<ReportModal alert={reportData} onClose={() => setReportData(null)} />)}
      {showLimitModal && (<MessageLimitModal onRegister={onClose} />)}
      {rebootModal && (<RebootModal data={rebootModal} />)}
      {editingMessage && (
        <EditModal 
          message={editingMessage} onClose={() => setEditingMessage(null)}
          onSave={(newText) => {
            if (newText.trim() && newText !== editingMessage.text) { socket.emit("edit message", { id: editingMessage.id, newText }); }
            setEditingMessage(null);
          }}
        />
      )}
     
      <div className={`bg-neutral-800 flex-1 flex flex-col p-4 min-h-0 ${isAdminWhisper ? 'bg-gradient-to-r from-blue-900/50 to-neutral-800' : ''}`}>
        <div className={`flex justify-between items-center mb-1 border-b pb-3 flex-shrink-0 ${isAdminWhisper ? 'border-blue-700' : 'border-neutral-700'}`}>
          <div className="flex items-center gap-3">
             <span className={`flex items-center justify-center w-8 h-8 rounded-full text-lg font-bold ${isAdminWhisper ? 'bg-blue-500' : 'bg-blue-600'}`}>
               {getInitials(otherUser.name)}
             </span>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <UserBadge role={otherUser.role} username={otherUser.name} />
              {otherUser.name}
            </h2>
            <span className="text-green-500 text-sm">● Online</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1 text-neutral-500 hover:text-white">
              <IconX />
            </button>
          </div>
        </div>
        
        {isAdminWhisper && (
          <div className="flex items-center justify-center gap-2 p-2 rounded-md bg-blue-600/20 text-blue-300 text-sm mt-2 border border-blue-500/50">
            <IconCheckBadge />
            You're whispering an official Wibali Administrator.
          </div>
        )}
       
        <div className="flex-1 overflow-y-auto mb-4 space-y-2 no-scrollbar p-2 mt-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <h3 className="text-xl font-semibold mt-4">Start a private conversation</h3>
              <p className="text-neutral-500">You're starting a new whisper with {otherUser.name}.</p>
            </div>
          )}

          {messages.filter(msg => !(msg.type === 'user' && msg.user !== currentUser.username && ignoredUsers.includes(otherUser.id))).map((msg, index) => {
            if (msg.type === 'system' || msg.type === 'server') { return (
                <div key={msg.id} className={`text-sm py-1 px-2 ${msg.type === 'server' ? 'text-red-500 font-bold' : 'text-neutral-500 italic'}`}>
                  <span className="text-neutral-600 mr-2">[{msg.time}]</span> {msg.type === 'server' && 'SERVER: '}{msg.text}
                </div>
            )}
            const isSelf = msg.user === currentUser?.username && !msg.deleted;
            const userRole = isSelf ? currentUser.role : otherUser.role;
            const isLastMessage = index === messages.length - 1; const isAdmin = currentUser.role === 'admin';
            const showDeleteButton = !msg.deleted && (isAdmin || (isSelf && isLastMessage)); const showEditButton = !msg.deleted && (isAdmin || (isSelf && isLastMessage));
            return (
              <div key={msg.id} className="group flex items-start justify-between py-1 px-2 rounded hover:bg-neutral-700/50">
                <div className="flex-1 min-w-0">
                  <span className="text-neutral-600 mr-2">[{msg.time}]</span>
                  <span className="inline-flex items-center">
                    {!msg.deleted && (
                      <span className="mr-1"><UserBadge role={userRole} username={msg.user} /></span>
                    )}
                    <strong className={`mr-2 ${isSelf ? 'text-blue-400' : 'text-neutral-300'}`}>
                      {msg.user}:
                    </strong>
                  </span>
                  <span className={`text-base whitespace-pre-wrap ${msg.deleted ? 'italic text-neutral-500' : ''}`}>
                    {msg.text} {msg.edited && !msg.deleted && <span className="text-xs text-neutral-500 ml-1">(edited)</span>}
                  </span>
                </div>
                <div className="flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {showEditButton && (<button className="w-5 h-5 text-neutral-400 hover:text-white" onClick={() => setEditingMessage(msg)} title="Edit message">✎</button>)}
                  {showDeleteButton && (<button className="w-5 h-5 text-red-500 hover:text-red-400" onClick={() => deleteMessage(msg.id)} title="Delete message">✕</button>)}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef}></div>
        </div>

        <div className="border-t pt-4 border-neutral-700 flex-shrink-0">
          <div className="flex gap-2 mb-2 bg-neutral-800 p-2 rounded-lg">
            <input type="text" value={newMessage} onChange={(e) => socket.connected && handleTyping(e.target.value)} placeholder={placeholderText} className="bg-neutral-700 border-neutral-600 flex-1 px-3 py-2 border rounded-md" onKeyDown={(e) => socket.connected && e.key === "Enter" && !e.shiftKey && sendMessage()} disabled={isInputDisabled || ignoredUsers.includes(otherUser.id)} />
            <div className="relative">
              <button className="px-3 py-2 bg-neutral-700 text-white rounded-md hover:bg-neutral-600 text-xl disabled:opacity-50" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); }} disabled={isInputDisabled} title="Pick emoji">😀</button>
              {showEmojiPicker && (<div className="absolute bottom-12 right-0 bg-neutral-700 p-2 rounded shadow-lg grid grid-cols-8 gap-1 z-10 border border-neutral-600 w-64" onClick={(e) => e.stopPropagation()}>
                {emojis.map(emoji => (<button key={emoji} onClick={() => { addEmoji(emoji); setShowEmojiPicker(false); }} className="text-2xl p-1 hover:bg-neutral-600 rounded">{emoji}</button>))}
              </div>)}
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center" onClick={sendMessage} disabled={!newMessage.trim() || isInputDisabled || ignoredUsers.includes(otherUser.id)}>
              <IconSend />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type DirectMessageModalProps = {
  socket: Socket;
  initialUser: UserAccount;
  initialRoom: Room;
  onExit: () => void;
  onViewProfile: (user: User) => void;
}
const DirectMessageModal = ({ socket, initialUser, initialRoom, onExit, onViewProfile }: DirectMessageModalProps) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-75" onClick={onExit}>
      <div className="w-full max-w-lg h-[70vh] min-h-[400px]" onClick={(e) => e.stopPropagation()}>
        <DirectMessageModalContent
          socket={socket}
          initialUser={initialUser}
          initialRoom={initialRoom}
          onClose={onExit}
          onViewProfile={onViewProfile}
        />
      </div>
    </div>
  );
}
// --- End Direct Message Modal ---


// --- NEW: Admin Panel Modals ---
type EditUserModalProps = {
  user: UserAccount;
  onClose: () => void;
  onSave: (userId: string, details: { fullName: string, email: string, about: string }) => void;
};
const EditUserModal = ({ user, onClose, onSave }: EditUserModalProps) => {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [about, setAbout] = useState(user.about);

  const handleSave = () => {
    onSave(user.id, { fullName, email, about });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
      <div className="w-full max-w-lg p-6 rounded-lg shadow-lg bg-neutral-800 text-white border border-neutral-700" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">Edit User: {user.username}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-300">Full Name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-300">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-neutral-700 border-neutral-600" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-300">About Me</label>
            <textarea value={about} onChange={(e) => setAbout(e.target.value)} className="w-full h-24 p-3 border rounded-md bg-neutral-700 border-neutral-600" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Save Changes</button>
        </div>
      </div>
    </div>
  );
};

type WarnUserModalProps = {
  user: UserAccount;
  onClose: () => void;
  onWarn: (userId: string, message: string) => void;
};
const WarnUserModal = ({ user, onClose, onWarn }: WarnUserModalProps) => {
  const [message, setMessage] = useState("");

  const handleWarn = () => {
    if (message.trim()) {
      onWarn(user.id, message);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
      <div className="w-full max-w-lg p-6 rounded-lg shadow-lg bg-neutral-800 text-white border border-neutral-700" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">Warn User: {user.username}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-neutral-300">Warning Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full h-32 p-3 border rounded-md bg-neutral-700 border-neutral-600"
              placeholder="Enter the warning message to send to the user..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-neutral-600 hover:bg-neutral-500">Cancel</button>
          <button onClick={handleWarn} className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700" disabled={!message.trim()}>Send Warning</button>
        </div>
      </div>
    </div>
  );
};

// NEW: Report Context Modal
type ReportContextModalProps = {
  report: Report;
  onClose: () => void;
};
const ReportContextModal = ({ report, onClose }: ReportContextModalProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75" onClick={onClose}>
      <div className="w-full max-w-2xl p-6 rounded-lg shadow-lg bg-neutral-800 text-white border border-neutral-700" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-4">Report Details ({report.reportId})</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400">Reporter</label>
            <p className="text-lg">{report.reporterName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400">Reported User</label>
            <p className="text-lg">{report.reportedName}</p>
          </div>
           <div>
            <label className="block text-sm font-medium text-neutral-400">Room</label>
            <p className="text-lg">#{report.roomName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400">Reason Provided</label>
            <p className="p-3 rounded-md min-h-[3rem] bg-neutral-900/50 text-neutral-300">
              {report.reason || <span className="italic text-neutral-500">No reason provided.</span>}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400">Attached Message Context (Last 5 from {report.reportedName})</label>
            <div className="p-3 rounded-md bg-neutral-900/50 text-neutral-300 space-y-2 max-h-60 overflow-y-auto">
              {(!report.messages || report.messages.length === 0) ? (
                <p className="italic text-neutral-500">No message context was attached.</p>
              ) : (
                report.messages.map(msg => (
                  <div key={msg.id} className="text-sm">
                    <span className="text-neutral-500 mr-2">[{msg.time}]</span>
                    <strong className="mr-1">{msg.user}:</strong>
                    <span>{msg.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700">Close</button>
        </div>
      </div>
    </div>
  );
};
// --- End Admin Panel Modals ---


// --- Admin Panel Page (MODIFIED) ---
type AdminPanelPageProps = {
  socket: Socket;
  currentUser: UserAccount;
  onBackToLobby: () => void;
  onViewProfile: (user: UserAccount) => void;
  onJoinRoomRequest: (roomName: string) => void;
};
const AdminPanelPage = ({ socket, currentUser, onBackToLobby, onViewProfile, onJoinRoomRequest }: AdminPanelPageProps) => {
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState("");
  
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [warningUser, setWarningUser] = useState<UserAccount | null>(null);
  
  // NEW: State for report context modal
  const [viewingReport, setViewingReport] = useState<Report | null>(null);

  // NEW: State for advanced admin features
  const [chaosMode, setChaosMode] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState('general');
  const [botPersonality, setBotPersonality] = useState({
    humor: 0.5,
    spiciness: 0.5,
    empathy: 0.5,
    formality: 0.5,
    mischief: 0.3,
    topicBias: 'general'
  });
  const [systemStats, setSystemStats] = useState({
    uptime: 0,
    messageCount: 0,
    connections: 0,
    errorCount: 0
  });

  const fetchUsers = () => {
    socket.emit("admin:getAllUsers", (users: UserAccount[]) => {
      if (users) setAllUsers(users);
    });
  };
  
  const fetchReports = () => {
     socket.emit("admin:getReports", (data: Report[]) => {
      if (data) setReports(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });
  };
  
  const fetchTickets = () => {
     socket.emit("admin:getTickets", (data: SupportTicket[]) => {
      if (data) setTickets(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    });
  };

  useEffect(() => {
    fetchUsers();
    fetchReports();
    fetchTickets();

    const handleUserListUpdate = (users: UserAccount[]) => setAllUsers(users);
    const handleReportUpdate = (data: Report[]) => setReports(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    const handleTicketUpdate = (data: SupportTicket[]) => setTickets(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    
    socket.on("admin:userListUpdated", handleUserListUpdate);
    socket.on("admin:reportsUpdated", handleReportUpdate);
    socket.on("admin:ticketsUpdated", handleTicketUpdate);

    return () => {
      socket.off("admin:userListUpdated", handleUserListUpdate);
      socket.off("admin:reportsUpdated", handleReportUpdate);
      socket.off("admin:ticketsUpdated", handleTicketUpdate);
    };
  }, [socket]);

  // --- User Actions ---
  const handleSetRole = (targetUserId: string, role: 'admin' | 'user') => {
    if (currentUser.id === targetUserId) return;
    socket.emit("admin:setRole", { targetUserId, role });
  };
  const handleBan = (targetUserId: string) => {
    if (currentUser.id === targetUserId) return;
    // MODIFIED: Removed window.confirm
    socket.emit("admin:banUser", { targetUserId });
  };
  const handleUnban = (targetUserId: string) => {
    // MODIFIED: Removed window.confirm
    socket.emit("admin:unbanUser", { targetUserId });
  };
  const handleMute = (targetUserId: string, mute: boolean) => {
    socket.emit("admin:globalMute", { targetUserId, mute });
  };
  const handleEditUser = (targetUserId: string, details: { fullName: string, email: string, about: string }) => {
    socket.emit("admin:editUser", { targetUserId, details });
  };
  const handleWarnUser = (targetUserId: string, message: string) => {
    socket.emit("admin:warnUser", { targetUserId, message });
  };
  const handleJoinUserRoom = (user: UserAccount) => {
    if (user.status === 'offline' || user.status === 'lobby') {
      console.log("User is not in a room.");
      return;
    }
    const roomName = user.status;
    onJoinRoomRequest(roomName); // Use the callback to switch pages
  };

  // --- Report/Ticket Actions ---
  const handleResolveItem = (type: 'report' | 'ticket', id: string) => {
    socket.emit("admin:resolveItem", { type, id });
  };
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) { return 'N/A'; }
  };
  
  const filteredUsers = allUsers.filter(user =>
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const openReports = reports.filter(r => r.status === 'open');
  const openTickets = tickets.filter(t => t.status === 'open');

  return (
    <div className="bg-neutral-900 text-white h-full flex flex-col font-sans">
      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSave={handleEditUser} />
      )}
      {warningUser && (
        <WarnUserModal user={warningUser} onClose={() => setWarningUser(null)} onWarn={handleWarnUser} />
      )}
      {/* NEW: Render Report Context Modal */}
      {viewingReport && (
        <ReportContextModal report={viewingReport} onClose={() => setViewingReport(null)} />
      )}
      
      <header className="flex items-center justify-between p-4 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-4">
          <IconShield />
          <h1 className="text-2xl font-bold">Admin Control Panel</h1>
        </div>
        <button
          onClick={onBackToLobby}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-700 text-neutral-200 rounded-lg hover:bg-neutral-600 font-semibold"
        >
          &larr; Back to Lobby
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        <nav className="w-64 bg-neutral-800 border-r border-neutral-700 p-4 flex-shrink-0">
          <ul className="space-y-2">
            <li>
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700'}`}
              >
                <IconUsers /> User Management
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('reports')}
                className={`w-full flex items-center relative gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'reports' ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700'}`}
              >
                <IconFlag /> Reports
                {openReports.length > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {openReports.length}
                  </span>
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('tickets')}
                className={`w-full flex items-center relative gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'tickets' ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700'}`}
              >
                <IconMail /> Support Tickets
                {openTickets.length > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {openTickets.length}
                  </span>
                )}
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('moderation')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'moderation' ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700'}`}
              >
                <IconShieldCheck /> Live Moderation
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('rooms')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'rooms' ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700'}`}
              >
                <IconSettings /> Room Config
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('health')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'health' ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700'}`}
              >
                <IconActivity /> System Health
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('chaos')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'chaos' ? 'bg-red-600 text-white' : 'hover:bg-neutral-700 text-red-400'}`}
              >
                🎭 Chaos Mode
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('timemachine')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'timemachine' ? 'bg-purple-600 text-white' : 'hover:bg-neutral-700 text-purple-400'}`}
              >
                ⏰ Time Machine
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('personality')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-lg ${activeTab === 'personality' ? 'bg-green-600 text-white' : 'hover:bg-neutral-700 text-green-400'}`}
              >
                🎨 Bot Personality
              </button>
            </li>
          </ul>
        </nav>

        <main className="flex-1 p-6 overflow-y-auto flex flex-col">
          {activeTab === 'users' && (
            <>
              <h2 className="text-3xl font-bold mb-4">User Management</h2>
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search by username or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-neutral-700 border border-neutral-600"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <IconSearch />
                </div>
              </div>
              <div className="flex-1 bg-neutral-800 rounded-lg border border-neutral-700 overflow-auto">
                <table className="w-full table-auto">
                  <thead className="bg-neutral-700/50 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Username</th>
                      <th className="p-3 text-left">Email</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Role</th>
                      <th className="p-3 text-left">Joined</th>
                      <th className="p-3 text-left">State</th>
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700">
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="hover:bg-neutral-700/30">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <StatusIndicator status={user.status} />
                            {user.username} {user.id === currentUser.id && '(You)'}
                          </div>
                        </td>
                        <td className="p-3">{user.email}</td>
                        <td className="p-3 capitalize">{user.status}</td>
                        <td className="p-3">
                          {user.role === 'admin' ? <span className="text-blue-400 font-semibold">Admin</span> : 'User'}
                        </td>
                        <td className="p-3">{formatDate(user.joined)}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            {user.isBanned && <span className="text-xs font-bold text-red-400">BANNED</span>}
                            {user.isGloballyMuted && <span className="text-xs font-bold text-yellow-400">MUTED</span>}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <button onClick={() => setEditingUser(user)} className="px-2 py-1 text-sm bg-neutral-600 hover:bg-neutral-500 rounded-md" title="Edit"><IconEdit /></button>
                            <button onClick={() => onViewProfile(user)} className="px-2 py-1 text-sm bg-neutral-600 hover:bg-neutral-500 rounded-md" title="View Profile"><IconEye /></button>
                            
                            {user.id !== currentUser.id && user.role !== 'admin' && (
                              <>
                                <button onClick={() => handleMute(user.id, !user.isGloballyMuted)} className={`px-2 py-1 text-sm rounded-md ${user.isGloballyMuted ? 'bg-green-600 hover:bg-green-500' : 'bg-yellow-600 hover:bg-yellow-500'}`} title={user.isGloballyMuted ? 'Unmute' : 'Mute'}>
                                  {user.isGloballyMuted ? <IconVolume2 /> : <IconVolumeX />}
                                </button>
                                <button onClick={() => setWarningUser(user)} className="px-2 py-1 text-sm bg-yellow-600 hover:bg-yellow-500 rounded-md" title="Warn"><IconAlertTriangle /></button>
                                {user.isBanned ? (
                                  <button onClick={() => handleUnban(user.id)} className="px-2 py-1 text-sm bg-green-600 hover:bg-green-500 rounded-md" title="Unban"><IconCheckCircle /></button>
                                ) : (
                                  <button onClick={() => handleBan(user.id)} className="px-2 py-1 text-sm bg-red-700 hover:bg-red-600 rounded-md" title="Ban"><IconBan /></button>
                                )}
                              </>
                            )}
                            {user.status !== 'offline' && user.status !== 'lobby' && (
                              <button onClick={() => handleJoinUserRoom(user)} className="px-2 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded-md" title="Join Room"><IconLogIn /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {activeTab === 'reports' && (
             <div>
              <h2 className="text-3xl font-bold mb-4">User Reports ({openReports.length} Open)</h2>
              <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
                 <table className="w-full table-auto">
                  <thead className="bg-neutral-700/50">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">Reporter</th>
                      <th className="p-3 text-left">Reported User</th>
                      <th className="p-3 text-left">Room</th>
                      {/* NEW: Added Reason column */}
                      <th className="p-3 text-left">Reason</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700">
                    {reports.map(report => (
                      <tr key={report.reportId} className={`hover:bg-neutral-700/30 ${report.status === 'closed' ? 'opacity-50' : ''}`}>
                        <td className="p-3">{formatDate(report.timestamp)}</td>
                        <td className="p-3">{report.reporterName}</td>
                        <td className="p-3">{report.reportedName}</td>
                        <td className="p-3">#{report.roomName}</td>
                        {/* NEW: Render Reason */}
                        <td className="p-3 max-w-xs truncate" title={report.reason}>{report.reason}</td>
                        <td className="p-3 capitalize">{report.status}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            {/* NEW: View Context Button */}
                            <button onClick={() => setViewingReport(report)} className="px-2 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded-md" title="View Context">
                              <IconFileText />
                            </button>
                            {report.status === 'open' && (
                              <button onClick={() => handleResolveItem('report', report.reportId)} className="px-2 py-1 text-sm bg-green-600 hover:bg-green-500 rounded-md" title="Mark as Resolved">
                                <IconCheckCircle />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reports.length === 0 && <p className="p-4 text-neutral-400">No reports found.</p>}
              </div>
            </div>
          )}
          {activeTab === 'tickets' && (
             <div>
              <h2 className="text-3xl font-bold mb-4">Support Tickets ({openTickets.length} Open)</h2>
              <div className="bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden">
                 <table className="w-full table-auto">
                  <thead className="bg-neutral-700/50">
                    <tr>
                      <th className="p-3 text-left">Date</th>
                      <th className="p-3 text-left">User</th>
                      <th className="p-3 text-left">Message</th>
                      <th className="p-3 text-left">Status</th>
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-700">
                    {tickets.map(ticket => (
                      <tr key={ticket.ticketId} className={`hover:bg-neutral-700/30 ${ticket.status === 'closed' ? 'opacity-50' : ''}`}>
                        <td className="p-3">{formatDate(ticket.timestamp)}</td>
                        <td className="p-3">{ticket.username}</td>
                        <td className="p-3"><p className="max-w-md truncate" title={ticket.message}>{ticket.message}</p></td>
                        <td className="p-3 capitalize">{ticket.status}</td>
                        <td className="p-3">
                          {ticket.status === 'open' && (
                             <button onClick={() => handleResolveItem('ticket', ticket.ticketId)} className="px-2 py-1 text-sm bg-green-600 hover:bg-green-500 rounded-md" title="Mark as Resolved">
                              <IconCheckCircle />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                 {tickets.length === 0 && <p className="p-4 text-neutral-400">No support tickets found.</p>}
              </div>
            </div>
          )}

          {/* NEW: Live Moderation Dashboard */}
          {activeTab === 'moderation' && (
            <div>
              <h2 className="text-3xl font-bold mb-4">🛡️ Live Moderation Dashboard</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-neutral-800 p-4 rounded-lg border border-blue-500/30">
                  <h3 className="text-sm text-neutral-400 mb-2">Active Users</h3>
                  <p className="text-3xl font-bold text-blue-400">{allUsers.filter(u => u.status !== 'offline').length}</p>
                </div>
                <div className="bg-neutral-800 p-4 rounded-lg border border-yellow-500/30">
                  <h3 className="text-sm text-neutral-400 mb-2">AI Flags (Last Hour)</h3>
                  <p className="text-3xl font-bold text-yellow-400">{reports.length}</p>
                </div>
                <div className="bg-neutral-800 p-4 rounded-lg border border-red-500/30">
                  <h3 className="text-sm text-neutral-400 mb-2">High Risk Users</h3>
                  <p className="text-3xl font-bold text-red-400">{allUsers.filter(u => u.isBanned || u.isGloballyMuted).length}</p>
                </div>
              </div>

              <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4">
                <h3 className="text-lg font-bold mb-4">🤖 AI Predictions & Quick Actions</h3>
                <div className="space-y-3">
                  {allUsers.filter(u => !u.isGuest && u.status !== 'offline').slice(0, 10).map(user => (
                    <div key={user.id} className="flex items-center justify-between bg-neutral-700/50 p-3 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${user.isBanned ? 'bg-red-500' : user.isGloballyMuted ? 'bg-yellow-500' : 'bg-green-500'}`} />
                        <div>
                          <p className="font-semibold">{user.username}</p>
                          <p className="text-sm text-neutral-400">In: {user.status === 'lobby' ? 'Lobby' : user.status}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!user.isGloballyMuted && (
                          <button onClick={() => handleMute(user.id, true)} className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 rounded-md">
                            Mute
                          </button>
                        )}
                        {user.isGloballyMuted && (
                          <button onClick={() => handleMute(user.id, false)} className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 rounded-md">
                            Unmute
                          </button>
                        )}
                        {!user.isBanned && (
                          <button onClick={() => handleBan(user.id)} className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 rounded-md">
                            Ban
                          </button>
                        )}
                        <button onClick={() => setWarningUser(user)} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded-md">
                          Warn
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NEW: Room Configuration Control */}
          {activeTab === 'rooms' && (
            <div>
              <h2 className="text-3xl font-bold mb-4">⚙️ Room Configuration</h2>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Select Room</label>
                <select 
                  value={selectedRoom} 
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 w-full md:w-64"
                >
                  <option value="general">General</option>
                  <option value="music">Music</option>
                  <option value="help">Help</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4">
                  <h3 className="text-lg font-bold mb-4">🎭 Room Mood</h3>
                  <div className="space-y-2">
                    {['chill', 'chaotic', 'supportive', 'serious', 'comedy'].map(mood => (
                      <button key={mood} className="w-full px-4 py-2 bg-neutral-700 hover:bg-purple-600/30 border border-neutral-600 rounded-lg text-left capitalize">
                        {mood === 'chill' && '😎'} {mood === 'chaotic' && '🎪'} {mood === 'supportive' && '🤝'} {mood === 'serious' && '💼'} {mood === 'comedy' && '😂'} {mood}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4">
                  <h3 className="text-lg font-bold mb-4">🛡️ Safety Mode</h3>
                  <div className="space-y-2">
                    {['anything_goes', 'spicy_but_sane', 'balanced', 'support_only', 'teen_safe'].map(mode => (
                      <button key={mode} className="w-full px-4 py-2 bg-neutral-700 hover:bg-blue-600/30 border border-neutral-600 rounded-lg text-left">
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 bg-neutral-800 rounded-lg border border-neutral-700 p-4">
                <h3 className="text-lg font-bold mb-4">🤖 Bot Controls</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-5 h-5" />
                    <span>Enable AI_Bot</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" className="w-5 h-5" />
                    <span>Enable Chaos_Bot</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-5 h-5" />
                    <span>Enable Archive_Bot</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* NEW: System Health & Logs */}
          {activeTab === 'health' && (
            <div>
              <h2 className="text-3xl font-bold mb-4">📊 System Health</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-neutral-800 p-4 rounded-lg border border-green-500/30">
                  <h3 className="text-sm text-neutral-400 mb-2">Server Uptime</h3>
                  <p className="text-2xl font-bold text-green-400">{Math.floor(systemStats.uptime / 3600)}h {Math.floor((systemStats.uptime % 3600) / 60)}m</p>
                </div>
                <div className="bg-neutral-800 p-4 rounded-lg border border-blue-500/30">
                  <h3 className="text-sm text-neutral-400 mb-2">Messages/Hr</h3>
                  <p className="text-2xl font-bold text-blue-400">{systemStats.messageCount}</p>
                </div>
                <div className="bg-neutral-800 p-4 rounded-lg border border-purple-500/30">
                  <h3 className="text-sm text-neutral-400 mb-2">Connections</h3>
                  <p className="text-2xl font-bold text-purple-400">{systemStats.connections}</p>
                </div>
                <div className="bg-neutral-800 p-4 rounded-lg border border-red-500/30">
                  <h3 className="text-sm text-neutral-400 mb-2">Errors</h3>
                  <p className="text-2xl font-bold text-red-400">{systemStats.errorCount}</p>
                </div>
              </div>

              <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4 mb-4">
                <h3 className="text-lg font-bold mb-4">🤖 Bot Activity Logs</h3>
                <div className="bg-neutral-900 rounded p-3 font-mono text-sm max-h-64 overflow-y-auto">
                  <div className="text-green-400">[{new Date().toLocaleTimeString()}] AI_Bot: Analyzed 50 messages in #general</div>
                  <div className="text-blue-400">[{new Date().toLocaleTimeString()}] AI_Bot: Generated thought bubble</div>
                  <div className="text-yellow-400">[{new Date().toLocaleTimeString()}] AI_Bot: Flagged toxic message</div>
                  <div className="text-purple-400">[{new Date().toLocaleTimeString()}] AI_Bot: Cached QA pair for #help</div>
                </div>
              </div>

              <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4">
                <h3 className="text-lg font-bold mb-4">⚠️ Error Logs</h3>
                <div className="bg-neutral-900 rounded p-3 font-mono text-sm max-h-64 overflow-y-auto text-red-400">
                  <div>No errors in the last hour ✅</div>
                </div>
              </div>
            </div>
          )}

          {/* NEW: Chaos Mode */}
          {activeTab === 'chaos' && (
            <div>
              <h2 className="text-3xl font-bold mb-4">🎭 Chaos Mode</h2>
              <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border-2 border-red-500/50 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-red-400">Chaos Mode: {chaosMode ? 'ACTIVE 🔥' : 'Inactive'}</h3>
                    <p className="text-neutral-300">Boost chaos, humor, and spontaneous events</p>
                  </div>
                  <button 
                    onClick={() => setChaosMode(!chaosMode)}
                    className={`px-6 py-3 rounded-lg font-bold text-lg ${chaosMode ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                  >
                    {chaosMode ? 'Disable' : 'Activate'}
                  </button>
                </div>
                {chaosMode && (
                  <div className="bg-black/30 rounded p-4">
                    <h4 className="font-bold mb-2">Active Effects:</h4>
                    <ul className="space-y-1 text-sm">
                      <li>✅ AI humor boosted to 90%</li>
                      <li>✅ Chaos_Bot now active</li>
                      <li>✅ Random events every 5 minutes</li>
                      <li>✅ Toxicity threshold relaxed</li>
                    </ul>
                  </div>
                )}
              </div>

              <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4">
                <h3 className="text-lg font-bold mb-4">🎲 Spontaneous Events</h3>
                <div className="space-y-2">
                  {[
                    { emoji: '🔥', name: 'Roast Battle', desc: 'Roast the user above you' },
                    { emoji: '😶', name: 'Emoji Only', desc: 'Reply only in emojis for 2 mins' },
                    { emoji: '🎲', name: 'Random Topics', desc: 'AI generates random conversation starters' },
                    { emoji: '🎭', name: 'Reverse Roles', desc: 'Mods become users, users become mods' },
                    { emoji: '💬', name: 'Story Chain', desc: 'Everyone adds one sentence to a story' },
                  ].map(event => (
                    <button key={event.name} className="w-full flex items-center gap-3 px-4 py-3 bg-neutral-700 hover:bg-red-600/30 border border-neutral-600 rounded-lg text-left">
                      <span className="text-2xl">{event.emoji}</span>
                      <div>
                        <p className="font-semibold">{event.name}</p>
                        <p className="text-sm text-neutral-400">{event.desc}</p>
                      </div>
                      <button className="ml-auto px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm">Trigger</button>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NEW: Room Time Machine */}
          {activeTab === 'timemachine' && (
            <div>
              <h2 className="text-3xl font-bold mb-4">⏰ Room Time Machine</h2>
              <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4 mb-4">
                <label className="block text-sm font-medium mb-2">Select Room to Scrub</label>
                <select className="bg-neutral-700 border border-neutral-600 rounded-md px-3 py-2 w-full md:w-64 mb-4">
                  <option value="general">General</option>
                  <option value="music">Music</option>
                  <option value="help">Help</option>
                </select>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Time Range (Last 24 hours)</label>
                  <input type="range" min="0" max="24" className="w-full" />
                  <div className="flex justify-between text-sm text-neutral-400 mt-1">
                    <span>24h ago</span>
                    <span>Now</span>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-4">
                <h3 className="text-lg font-bold mb-4">🎬 Story Arcs & Highlights</h3>
                <div className="space-y-3">
                  {[
                    { time: '2h ago', title: 'Heated Debate', users: 'Alice vs Bob', messages: 47 },
                    { time: '5h ago', title: 'Funny Joke Chain', users: '8 participants', messages: 23 },
                    { time: '8h ago', title: 'Help Session', users: 'Charlie helped David', messages: 15 },
                  ].map((arc, i) => (
                    <div key={i} className="bg-neutral-700/50 p-3 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-purple-300">{arc.title}</p>
                          <p className="text-sm text-neutral-400">{arc.users} • {arc.messages} messages</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-neutral-400">{arc.time}</p>
                          <button className="mt-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs">Export</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NEW: Bot Personality Sculptor */}
          {activeTab === 'personality' && (
            <div>
              <h2 className="text-3xl font-bold mb-4">🎨 Bot Personality Sculptor</h2>
              <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-6">
                <h3 className="text-lg font-bold mb-6">Tune AI_Bot Behavior</h3>
                <div className="space-y-6">
                  {[
                    { key: 'humor', label: 'Humor 🔥', color: 'red' },
                    { key: 'spiciness', label: 'Spiciness 🌶', color: 'orange' },
                    { key: 'empathy', label: 'Empathy 💗', color: 'pink' },
                    { key: 'formality', label: 'Formality 📘', color: 'blue' },
                    { key: 'mischief', label: 'Mischief 😈', color: 'purple' },
                  ].map(slider => (
                    <div key={slider.key}>
                      <div className="flex justify-between mb-2">
                        <label className="font-medium">{slider.label}</label>
                        <span className="text-neutral-400">{Math.round(botPersonality[slider.key as keyof typeof botPersonality] * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.1"
                        value={botPersonality[slider.key as keyof typeof botPersonality]}
                        onChange={(e) => setBotPersonality({...botPersonality, [slider.key]: parseFloat(e.target.value)})}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-neutral-700">
                  <h4 className="font-bold mb-3">Preset Personalities</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Chaotic Genie', desc: 'High humor, high mischief' },
                      { name: 'Therapist', desc: 'High empathy, high formality' },
                      { name: 'Hype Speaker', desc: 'Max humor, low formality' },
                      { name: 'Sassy Gremlin', desc: 'High spice, high mischief' },
                    ].map(preset => (
                      <button key={preset.name} className="px-4 py-3 bg-neutral-700 hover:bg-green-600/30 border border-neutral-600 rounded-lg text-left">
                        <p className="font-semibold">{preset.name}</p>
                        <p className="text-xs text-neutral-400">{preset.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <button className="mt-6 w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold">
                  Apply Changes
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};
// --- End Admin Panel Page ---


// --- Main App (Router) ---
// Helper function to get DM room name (copied from server)
const getDmRoomName = (id1: string, id2: string) => [id1, id2].sort().join('__DM__');

export default function App() {
  const [page, setPage] = useState<'landing' | 'auth' | 'changelog' | 'lobby' | 'chat' | 'admin' | 'onboarding'>('landing');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
 
  const [unreadDMNames, setUnreadDMNames] = useState<string[]>([]);
 
  const [viewingProfile, setViewingProfile] = useState<UserAccount | null>(null);
  const [reportData, setReportData] = useState<AlertData | null>(null);
  const [rebootModal, setRebootModal] = useState<RebootModalData | null>(null);
  const [viewingDM, setViewingDM] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // NEW: State for Admin Warn Modal
  const [warnModalData, setWarnModalData] = useState<WarnModalData | null>(null);
  
  // NEW: State for onboarding
  const [suggestedRoom, setSuggestedRoom] = useState<string>('general');

  const audioCtx = useRef<AudioContext | null>(null);
 
  const playTaskbarSound = (type: 'whisper' | 'alert') => {
    if (!audioCtx.current) { try { audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtx.current?.resume(); } catch (e) { console.error("Web Audio API not supported", e); return; } }
    const ctx = audioCtx.current; if (ctx.state === 'suspended') { ctx.resume(); }
    const oscillator = ctx.createOscillator(); const gainNode = ctx.createGain();
    oscillator.connect(gainNode); gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(0, ctx.currentTime); gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01); gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    if (type === 'whisper') { oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(660, ctx.currentTime); oscillator.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.05); }
    else { oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(900, ctx.currentTime); }
    oscillator.start(ctx.currentTime); oscillator.stop(ctx.currentTime + 0.15);
  };

  useEffect(() => {
    if (!socket) {
      setIsConnected(false);
      return;
    }

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    if (socket.connected) {
      setIsConnected(true);
    } else {
      setIsConnected(false);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
   
    const handleNewWhisper = (dmRoom: Room) => {
      if (currentUser && !currentUser.isGuest) {
        if (viewingDM?.name !== dmRoom.name) {
          playTaskbarSound('whisper');
          setUnreadDMNames(prev => [...new Set([...prev, dmRoom.name])]);
        }
      }
    };
   
    // MODIFIED: This is for real-time admin alerts, not the confirmation
    const handleReportAlert = (data: AlertData) => {
      if (currentUser?.role === 'admin') {
        playTaskbarSound('alert');
        // We set a minimal alert here, the full data is in the admin panel
        setReportData(data); 
      }
    };

    const handleSelfDetails = (user: UserAccount) => setCurrentUser(user);
    const handleServerReboot = (data: RebootModalData) => setRebootModal(data);
    const handleForceDisconnect = () => handleLogout();
    
    // NEW: Handlers
    const handleForceWarn = (data: WarnModalData) => setWarnModalData(data);
    const handleForceSwitchRoom = (room: Room) => {
      setCurrentRoom(room);
      setPage('chat');
    };

    socket.on("new whisper", handleNewWhisper);
    socket.on("report", handleReportAlert); // MODIFIED: Renamed handler
    socket.on("self details", handleSelfDetails);
    socket.on("server reboot", handleServerReboot);
    socket.on("force disconnect", handleForceDisconnect);
    socket.on("forceWarn", handleForceWarn);
    socket.on("force switch room", handleForceSwitchRoom); // For admin join

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("new whisper", handleNewWhisper);
      socket.off("report", handleReportAlert); // MODIFIED
      socket.off("self details", handleSelfDetails); // Keep this
      socket.off("server reboot", handleServerReboot);
      socket.off("force disconnect", handleForceDisconnect);
      socket.off("forceWarn", handleForceWarn);
      socket.off("force switch room", handleForceSwitchRoom);
    };
  }, [socket, currentUser, viewingDM]); // Added viewingDM to dependency array
 
  const handleAuthSuccess = (newSocket: Socket, user: UserAccount) => {
    setSocket(newSocket);
    setCurrentUser(user);
    setIsConnected(true);
    setPage('lobby');
  };
 
  const handleLogout = () => {
    if (socket) socket.disconnect();
    setSocket(null); setCurrentUser(null); setCurrentRoom(null);
    setUnreadDMNames([]);
    setPage('auth');
    setViewingDM(null);
    setIsConnected(false);
  };
 
  const handleJoinRoom = (room: Room) => {
    setCurrentRoom(room);
    setPage('chat');
  };

  const handleJoinDM = (room: Room) => {
    setViewingDM(room);
    setUnreadDMNames(prev => prev.filter(name => name !== room.name));
  };

  const handleWhisper = (targetUser: User | UserAccount) => {
    if (!socket || !currentUser) return;
   
    socket.emit("start dm", { targetUserId: targetUser.id });

    const dmRoomName = getDmRoomName(currentUser.id, targetUser.id);
    const dmRoom: Room = {
      name: dmRoomName,
      type: 'dm',
      participants: [
        { id: currentUser.id, name: currentUser.username, role: currentUser.role },
        { id: targetUser.id, name: (targetUser as User).name || (targetUser as UserAccount).username, role: (targetUser as User).role || (targetUser as UserAccount).role }
      ]
    };

    setViewingDM(dmRoom);
   
    setUnreadDMNames(prev => prev.filter(name => name !== dmRoomName));
  };


  const handleExit = () => {
    setCurrentRoom(null);
    setPage('lobby');
  };

  const handleSaveProfile = (newAbout: string) => {
    if (!socket || !currentUser || currentUser.isGuest) return;
    socket.emit("update profile", newAbout, (updatedUser: UserAccount) => {
      setCurrentUser(updatedUser);
      setViewingProfile(updatedUser);
    });
  };
 
  const handleIgnoreFromProfile = (userId: string) => {
    console.log("Ignoring/Unignoring user (not fully implemented in Profile):", userId);
  };
 
  // MODIFIED: This now opens the ReportUserModal
  const handleReportFromProfile = (user: UserAccount) => {
     if (!socket || !currentUser || currentUser.isGuest) return;
     // This function is tricky because we don't have the `setReportingUser` state here
     // For now, we will assume reports only happen from within a chat room
     // A proper fix would involve lifting the `reportingUser` state to `App`
     console.log("Report from profile clicked. This should open the report modal.");
     // A simple socket emit for profile reports (no context)
     // To-do: This should open the modal. For now, we'll just log.
     // socket.emit("report", { reportedUserId: user.id, reason: "Reported from profile" });
  };

  useEffect(() => { return () => { if (socket) socket.disconnect(); }; }, [socket]);

  const handleViewProfile = (user: User | UserAccount) => {
     // Check if we already have the full UserAccount object
     if ('fullName' in user && (user as UserAccount).fullName) {
       setViewingProfile(user as UserAccount);
       return;
     }
     // If it's a minimal User object, or incomplete UserAccount, fetch full details
     if (socket) {
       socket.emit("get profile", user.id, (fullUser: UserAccount) => {
         if (fullUser) setViewingProfile(fullUser);
       });
     }
  };
  
  // NEW: Handler for Admin "Join Room" button
  const handleAdminJoinRoomRequest = (roomName: string) => {
    if (!socket) return;
    socket.emit("admin:joinRoom", roomName, (room: Room) => {
      if (room) {
        handleJoinRoom(room);
      } else {
        console.error("Failed to join room:", roomName);
      }
    });
  };


  return (
    <div className="dark font-sans h-screen flex flex-col bg-neutral-900">
      {!isConnected && page !== 'landing' && page !== 'auth' && (
        <div className="bg-red-600 text-white text-center p-2 font-semibold z-[60]">
          Disconnected. Reconnecting...
        </div>
      )}
      
      {/* Global Modals */}
      {viewingProfile && (
        <ProfileModal 
          user={viewingProfile}
          isSelf={!!currentUser && viewingProfile.id === currentUser.id} 
          onClose={() => setViewingProfile(null)} 
          onSave={handleSaveProfile}
          onWhisper={handleWhisper}
          onIgnore={handleIgnoreFromProfile}
          onReport={handleReportFromProfile}  
          isIgnored={false} // Placeholder
        />
      )}
      {/* MODIFIED: This modal is now for admin alerts only */}
      {reportData && currentUser?.role === 'admin' && (<ReportModal alert={reportData} onClose={() => setReportData(null)} />)}
      {rebootModal && (<RebootModal data={rebootModal} />)}
      {warnModalData && (
        <WarnModal data={warnModalData} onClose={() => setWarnModalData(null)} />
      )}
      {viewingDM && socket && currentUser && (
        <DirectMessageModal
          socket={socket}
          initialUser={currentUser}
          initialRoom={viewingDM}
          onExit={() => setViewingDM(null)}
          onViewProfile={handleViewProfile}
        />
      )}
     
      <div className="flex-1 min-h-0">
        {page === 'landing' && (
          <LandingPage onEnterChat={() => setPage('onboarding')} onShowChangelog={() => setPage('changelog')} />
        )}
        {page === 'onboarding' && (
          <EmojiOnboarding
            onComplete={(roomName) => {
              setSuggestedRoom(roomName);
              setPage('auth');
            }}
            onSkip={() => {
              setSuggestedRoom('general');
              setPage('auth');
            }}
          />
        )}
        {page === 'changelog' && (
          <ChangelogPage onBack={() => page === 'landing' ? setPage('landing') : setPage('lobby')} />
        )}
        {page === 'auth' && (
          <AuthPage onAuthSuccess={handleAuthSuccess} />
        )}
        {page === 'lobby' && socket && currentUser && (
          <LobbyPage
            socket={socket}
            currentUser={currentUser}
            onJoinRoom={handleJoinRoom}
            onJoinDM={handleJoinDM}
            onShowChangelog={() => setPage('changelog')}
            onViewProfile={handleViewProfile}
            onLogout={handleLogout}
            unreadDMNames={unreadDMNames}
            onClearUnreadDMs={() => setUnreadDMNames([])}
            onWhisper={handleWhisper}
            onGoToAdmin={() => setPage('admin')}
          />
        )}
        {page === 'chat' && socket && currentUser && currentRoom && (
          <ChatApp
            socket={socket}
            initialUser={currentUser}
            initialRoom={currentRoom}
            onExit={handleExit}
            onViewProfile={handleViewProfile}
            onWhisper={handleWhisper}
            unreadCount={unreadDMNames.length}
            unreadDMNames={unreadDMNames}
          />
        )}
        {page === 'admin' && socket && currentUser && (
          <AdminPanelPage
            socket={socket}
            currentUser={currentUser}
            onBackToLobby={() => setPage('lobby')}
            onViewProfile={handleViewProfile}
            onJoinRoomRequest={handleAdminJoinRoomRequest} // NEW
          />
        )}
      </div>
    </div>
  );
}