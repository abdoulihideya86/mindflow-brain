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
  connections: string[]; // IDs of cross-linked nodes
  knowledgeLevel: number; // 0-100, how much this node has fed the brain
  color: string;
  pulsePhase: number;
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
  type: 'parent' | 'cross-link' | 'feed';
  strength: number;
  animated: boolean;
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
}

export interface MindFlowState {
  nodes: MindNode[];
  edges: MindEdge[];
  brainStats: BrainStats;
  viewport: { x: number; y: number; scale: number };
}
