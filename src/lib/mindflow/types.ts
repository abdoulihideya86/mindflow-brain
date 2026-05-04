export interface KnowledgeItem {
  label: string;
  tag: string;
  summary?: string;
  children?: KnowledgeItem[];
}

export interface KnowledgeTopic {
  emoji: string;
  label: string;
  tag: string;
  children: KnowledgeItem[];
}

export interface MindNode {
  id: string;
  label: string;
  tag: string;
  summary: string;
  x: number;
  y: number;
  depth: number;
  parentId: string | null;
  isBrain: boolean;
  isCustom: boolean;
  expanded: boolean;
  hasChildren: boolean;
  childrenData?: KnowledgeItem[];
  connections: string[];
  knowledgeLevel: number;
  color: string;
  pulsePhase: number;
  // 🧬 Feature 9: Self-evolving nodes
  maturity: 'seed' | 'sprout' | 'tree' | 'ancient';
  dormant: boolean;
  lastFedAt: number;
  visitCount: number;
  alliedWith: string[]; // IDs of allied nodes
  // 🤖 Feature 1: AI
  aiSummary?: string;
  aiQuestions?: string[];
  aiSuggestedLinks?: string[];
  // Visual
  feedParticles: FeedParticle[];
}

export interface FeedParticle {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  progress: number;
  speed: number;
  color: string;
  size: number;
}

export interface MindEdge {
  id: string;
  from: string;
  to: string;
  type: 'parent' | 'cross-link' | 'feed' | 'ai-link' | 'alliance';
  strength: number;
  animated: boolean;
  createdAt: number;
}

export interface BrainStats {
  totalKnowledge: number;
  totalNodes: number;
  totalConnections: number;
  totalFeeds: number;
  topicsExplored: string[];
  growthRate: number;
  level: number;
  levelName: string;
  // 🕸️ Feature 8: Timeline
  history: TimelineEntry[];
}

export interface TimelineEntry {
  timestamp: number;
  event: 'feed' | 'expand' | 'link' | 'create' | 'ai-insight' | 'level-up' | 'alliance';
  detail: string;
  knowledge: number;
}

export interface BrainLevel {
  min: number;
  name: string;
  emoji: string;
}

// 🕸️ Feature 8: View modes
export type ViewMode = 'normal' | 'heatmap' | 'timeline' | 'filtered';

export interface FilterState {
  topics: string[];
  tags: string[];
  minKnowledge: number;
  maturityFilter: string[];
  showDormant: boolean;
}

// 🤖 Feature 1: AI response types
export interface AIInsight {
  summary: string;
  questions: string[];
  suggestedLinks: { from: string; to: string; reason: string }[];
  suggestedNodes: { label: string; tag: string; summary: string; parentTopic: string }[];
}

// 🧬 Feature 9: Maturity levels
export const MATURITY_LEVELS = {
  seed: { name: 'بذرة', emoji: '🌱', minVisits: 0, color: '#6b7280' },
  sprout: { name: 'برعم', emoji: '🌿', minVisits: 3, color: '#34d399' },
  tree: { name: 'شجرة', emoji: '🌳', minVisits: 8, color: '#f5c400' },
  ancient: { name: 'شجرة عتيقة', emoji: '🌲', minVisits: 15, color: '#a78bfa' },
} as const;

export type MaturityLevel = keyof typeof MATURITY_LEVELS;

export interface MindFlowState {
  nodes: MindNode[];
  edges: MindEdge[];
  brainStats: BrainStats;
  viewport: { x: number; y: number; scale: number };
}
