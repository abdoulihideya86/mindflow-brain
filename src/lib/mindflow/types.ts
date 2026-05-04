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
  // 🧬 Self-evolving nodes
  maturity: 'seed' | 'sprout' | 'tree' | 'ancient';
  dormant: boolean;
  lastFedAt: number;
  visitCount: number;
  alliedWith: string[];
  // 🤖 AI
  aiSummary?: string;
  aiQuestions?: string[];
  aiSuggestedLinks?: string[];
  // 💡 Project nodes
  isProject: boolean;
  projectPhase: 'idea' | 'analysis' | 'planning' | 'execution' | 'done';
  projectProgress: number; // 0-100
  projectTasks: ProjectTask[];
  // 🎓 Learning
  quizQuestion?: string;
  quizOptions?: string[];
  quizCorrectIndex?: number;
  // 🎨 Visual
  feedParticles: FeedParticle[];
  enterAnim: number; // 0-1, animation progress on appear
  selected: boolean;
}

export interface ProjectTask {
  id: string;
  label: string;
  status: 'pending' | 'in-progress' | 'done';
  nodeId?: string; // linked mind node
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
  type: 'parent' | 'cross-link' | 'feed' | 'ai-link' | 'alliance' | 'project' | 'learning';
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
  history: TimelineEntry[];
  // 🎓 Learning stats
  quizCorrect: number;
  quizTotal: number;
  streak: number;
  lastActiveDate: string;
  // 💡 Project stats
  projectsCreated: number;
  projectsCompleted: number;
  tasksCompleted: number;
}

export interface TimelineEntry {
  timestamp: number;
  event: 'feed' | 'expand' | 'link' | 'create' | 'ai-insight' | 'level-up' | 'alliance' | 'project' | 'quiz' | 'auto-learn';
  detail: string;
  knowledge: number;
}

export interface BrainLevel {
  min: number;
  name: string;
  emoji: string;
}

// View modes
export type ViewMode = 'normal' | 'heatmap' | 'filtered';

export type ThemeMode = 'dark' | 'light';

export interface FilterState {
  topics: string[];
  tags: string[];
  minKnowledge: number;
  maturityFilter: string[];
  showDormant: boolean;
}

// 🤖 AI response types
export interface AIInsight {
  summary: string;
  questions: string[];
  suggestedLinks: { from: string; to: string; reason: string }[];
  suggestedNodes: { label: string; tag: string; summary: string; parentTopic: string }[];
}

// 💡 Project analysis response
export interface ProjectAnalysis {
  title: string;
  description: string;
  phases: { name: string; description: string; tasks: { label: string; description: string }[] }[];
  estimatedNodes: number;
  tags: string[];
}

// 🎓 Quiz question
export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  relatedNodeId?: string;
}

// 🧠 Auto-learn result
export interface AutoLearnResult {
  newNodes: { label: string; tag: string; summary: string }[];
  newLinks: { fromLabel: string; toLabel: string; reason: string }[];
  insights: string[];
}

// Maturity levels
export const MATURITY_LEVELS = {
  seed: { name: 'بذرة', emoji: '🌱', minVisits: 0, color: '#6b7280' },
  sprout: { name: 'برعم', emoji: '🌿', minVisits: 3, color: '#34d399' },
  tree: { name: 'شجرة', emoji: '🌳', minVisits: 8, color: '#f5c400' },
  ancient: { name: 'شجرة عتيقة', emoji: '🌲', minVisits: 15, color: '#a78bfa' },
} as const;

export type MaturityLevel = keyof typeof MATURITY_LEVELS;

// 🏆 Achievements
export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  condition: (stats: BrainStats, nodes: MindNode[]) => boolean;
  unlocked: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_feed', name: 'أول تغذية', emoji: '🍎', description: 'أطعم العقل لأول مرة', condition: (s) => s.totalFeeds >= 1, unlocked: false },
  { id: 'explorer', name: 'مستكشف', emoji: '🌍', description: 'استكشف 3 مواضيع', condition: (s) => s.topicsExplored.length >= 3, unlocked: false },
  { id: 'connector', name: 'ربّاط', emoji: '🔗', description: 'اربط 5 عقد يدوياً', condition: (s) => s.totalConnections >= 5, unlocked: false },
  { id: 'brain_5', name: 'عقل ناضج', emoji: '🧠', description: 'أوصل المستوى 5', condition: (s) => s.level >= 5, unlocked: false },
  { id: 'ai_friend', name: 'صديق الآلي', emoji: '🤖', description: 'استعمل AI 5 مرات', condition: (s) => s.history.filter(h => h.event === 'ai-insight').length >= 5, unlocked: false },
  { id: 'full_explorer', name: 'عالِم شامل', emoji: '🎓', description: 'استكشف كل المواضيع', condition: (s) => s.topicsExplored.length >= 6, unlocked: false },
  { id: 'savior', name: 'منقذ النائمين', emoji: '⚡', description: 'أيقظ 3 عقد نائمة', condition: (s, n) => n.filter(x => !x.dormant && x.visitCount > 1 && Date.now() - x.lastFedAt < 120000).length >= 3, unlocked: false },
  { id: 'diplomat', name: 'دبلوماسي', emoji: '🤝', description: 'كوّن 3 تحالفات', condition: (s, n) => n.filter(x => x.alliedWith.length > 0).length >= 3, unlocked: false },
  { id: 'quiz_master', name: 'بطل الاختبارات', emoji: '🏆', description: 'أجب 5 أسئلة صحيحة', condition: (s) => s.quizCorrect >= 5, unlocked: false },
  { id: 'project_starter', name: 'رائد المشاريع', emoji: '💡', description: 'أنشئ مشروعك الأول', condition: (s) => s.projectsCreated >= 1, unlocked: false },
  { id: 'project_finisher', name: 'منفذ المشاريع', emoji: '✅', description: 'أكمل مشروع كامل', condition: (s) => s.projectsCompleted >= 1, unlocked: false },
  { id: 'knowledge_500', name: 'خزّان المعرفة', emoji: '📚', description: 'اجمع 500 معرفة', condition: (s) => s.totalKnowledge >= 500, unlocked: false },
  { id: 'streak_3', name: 'متواصل', emoji: '🔥', description: 'سلسلة 3 أيام متتالية', condition: (s) => s.streak >= 3, unlocked: false },
  { id: 'auto_learner', name: 'متعلّم ذاتي', emoji: '🧬', description: 'فعّل التعلم التلقائي 3 مرات', condition: (s) => s.history.filter(h => h.event === 'auto-learn').length >= 3, unlocked: false },
];

export interface MindFlowState {
  nodes: MindNode[];
  edges: MindEdge[];
  brainStats: BrainStats;
  viewport: { x: number; y: number; scale: number };
}
