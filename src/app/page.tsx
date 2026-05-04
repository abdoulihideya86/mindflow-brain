'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  KNOWLEDGE_BASE,
  TOPIC_COLORS,
  getBrainLevel,
  CROSS_LINK_RULES,
} from '@/lib/mindflow/knowledge';
import { sounds, toggleMute, isMuted, setMuted as setMutedGlobal } from '@/lib/mindflow/sounds';
import { MATURITY_LEVELS, ACHIEVEMENTS } from '@/lib/mindflow/types';
import type {
  MindNode, MindEdge, BrainStats, TimelineEntry, ViewMode,
  FilterState, AIInsight, FeedParticle, QuizQuestion, AutoLearnResult,
  ProjectAnalysis, ProjectTask, ThemeMode, Achievement,
} from '@/lib/mindflow/types';

// ─── Utility ────────────────────────────────────────────────
let _nid = 0;
function nid() { return `n${++_nid}_${Date.now()}`; }
function eid() { return `e${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

const BRAIN_ID = '__brain__';
const STORAGE_KEY = 'mindflow_brain_state_v3';

function createBrainNode(cx: number, cy: number): MindNode {
  return {
    id: BRAIN_ID, label: 'العقل', tag: '🧠',
    summary: 'العقل المركزي — يتغذى ويتعلم من كل عقدة تتصل به',
    x: cx, y: cy, depth: 0, parentId: null,
    isBrain: true, isCustom: false, expanded: false, hasChildren: false,
    connections: [], knowledgeLevel: 0, color: '#f5c400', pulsePhase: 0,
    maturity: 'ancient', dormant: false, lastFedAt: Date.now(), visitCount: 99,
    alliedWith: [], aiSummary: '', aiQuestions: [], aiSuggestedLinks: [],
    feedParticles: [],
    isProject: false, projectPhase: 'idea', projectProgress: 0, projectTasks: [],
    quizQuestion: undefined, quizOptions: undefined, quizCorrectIndex: undefined,
    enterAnim: 1, selected: false,
  };
}

function defaultStats(): BrainStats {
  return {
    totalKnowledge: 0, totalNodes: 1, totalConnections: 0, totalFeeds: 0,
    topicsExplored: [], growthRate: 0, level: 1, levelName: 'بذرة', history: [],
    quizCorrect: 0, quizTotal: 0, streak: 0, lastActiveDate: new Date().toISOString().slice(0, 10),
    projectsCreated: 0, projectsCompleted: 0, tasksCompleted: 0,
  };
}

function getMaturity(visits: number): MindNode['maturity'] {
  if (visits >= 15) return 'ancient';
  if (visits >= 8) return 'tree';
  if (visits >= 3) return 'sprout';
  return 'seed';
}

function getMaturityEmoji(m: MindNode['maturity']) { return MATURITY_LEVELS[m].emoji; }
function getMaturityColor(m: MindNode['maturity']) { return MATURITY_LEVELS[m].color; }

function makeNode(overrides: Partial<MindNode> & { id: string; label: string; x: number; y: number }): MindNode {
  return {
    tag: 'مخصص', summary: '', depth: 1, parentId: null,
    isBrain: false, isCustom: false, expanded: false, hasChildren: false,
    connections: [], knowledgeLevel: 0, color: '#00ffe0', pulsePhase: Math.random() * Math.PI * 2,
    maturity: 'seed', dormant: false, lastFedAt: Date.now(), visitCount: 0,
    alliedWith: [], aiSummary: '', aiQuestions: [], aiSuggestedLinks: [],
    feedParticles: [],
    isProject: false, projectPhase: 'idea', projectProgress: 0, projectTasks: [],
    quizQuestion: undefined, quizOptions: undefined, quizCorrectIndex: undefined,
    enterAnim: 0, selected: false,
    childrenData: undefined,
    ...overrides,
  };
}

// ─── Persistence ────────────────────────────────────────────
interface PersistedState {
  brainStats: BrainStats;
  customNodes: { label: string; tag: string; summary: string }[];
  exploredTopics: string[];
  unlockedAchievements: string[];
}

// Full state persistence - saves ALL nodes and edges for complete restore
interface FullPersistedState {
  version: number;
  brainStats: BrainStats;
  nodes: MindNode[];
  edges: MindEdge[];
  exploredTopics: string[];
  unlockedAchievements: string[];
}

const FULL_STORAGE_KEY = 'mindflow_brain_full_v5';

function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch { /* */ }
  return null;
}

function loadFullState(): FullPersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const r = localStorage.getItem(FULL_STORAGE_KEY);
    if (r) {
      const parsed = JSON.parse(r);
      if (parsed.version >= 5) return parsed;
    }
  } catch { /* */ }
  return null;
}

function saveFullState(stats: BrainStats, allNodes: MindNode[], allEdges: MindEdge[], exploredTopics: string[], unlockedAch: string[]) {
  if (typeof window === 'undefined') return;
  try {
    // Strip transient data that shouldn't be persisted
    const cleanNodes = allNodes.map(n => ({
      ...n,
      feedParticles: [],
      enterAnim: 1,
      selected: false,
    }));
    const data: FullPersistedState = {
      version: 5,
      brainStats: stats,
      nodes: cleanNodes,
      edges: allEdges,
      exploredTopics,
      unlockedAchievements: unlockedAch,
    };
    localStorage.setItem(FULL_STORAGE_KEY, JSON.stringify(data));
  } catch { /* */ }
}

function saveState(stats: BrainStats, customNodes: MindNode[], exploredTopics: string[], unlockedAch: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const data: PersistedState = {
      brainStats: stats,
      customNodes: customNodes.filter(n => n.isCustom).map(n => ({ label: n.label, tag: n.tag, summary: n.summary })),
      exploredTopics,
      unlockedAchievements: unlockedAch,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* */ }
}

// ─── Project Panel Component ──────────────────────────────
function ProjectPanel({ projectNode, nodes, theme, taskExecuting, onClose, onExecuteTask, onNavigate, onSelectNode, onClosePanel, onFeed, onDelete, onGenerateCode, onGeneratePreview, onGenerateReport, onExecuteAll }: {
  projectNode: MindNode;
  nodes: MindNode[];
  theme: ThemeMode;
  taskExecuting: string | null;
  onClose: () => void;
  onExecuteTask: (taskId: string, taskLabel: string, parentNodeId: string) => void;
  onNavigate: (nodeId: string) => void;
  onSelectNode: (node: MindNode) => void;
  onClosePanel: () => void;
  onFeed: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onGenerateCode: (projectNode: MindNode) => void;
  onGeneratePreview: (projectNode: MindNode) => void;
  onGenerateReport: (projectNode: MindNode) => void;
  onExecuteAll: (parentNodeId: string) => void;
}) {
  // Get live project node from state (not stale from when panel was opened)
  const liveProject = nodes.find(n => n.id === projectNode.id) || projectNode;
  // Get child nodes (phases/tasks) for navigation
  const childNodes = nodes.filter(n => n.parentId === liveProject.id);
  const tasks = liveProject.projectTasks || [];
  const progress = liveProject.projectProgress ?? 0;
  const phase = liveProject.projectPhase || 'idea';
  const isProjectRoot = liveProject.isProject;

  // For phase nodes, also collect tasks from child task nodes
  const allTasks = isProjectRoot ? tasks : (() => {
    // Phase node: gather tasks from child task nodes + own projectTasks
    const childTasks = childNodes.flatMap(cn => cn.projectTasks || []);
    return [...tasks, ...childTasks];
  })();

  const phaseLabels: Record<string, string> = {
    idea: 'فكرة', analysis: 'تحليل', planning: 'تخطيط', execution: 'تنفيذ', done: 'مكتمل ✅',
  };

  const pendingTasks = allTasks.filter(t => t.status !== 'done');

  return (
    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-96 max-w-[90vw] rounded-xl border p-4 pointer-events-auto ${theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold">{isProjectRoot ? '🚀' : '📂'} {liveProject.label || 'مشروع'}</h3>
        <button onClick={onClose} className="text-xs opacity-50 hover:opacity-100">✕</button>
      </div>
      {liveProject.summary && <p className="text-xs opacity-70 mb-2">{liveProject.summary}</p>}
      <div className="flex gap-2 text-[10px] mb-2">
        <span>المرحلة: <b>{phaseLabels[phase] || phase}</b></span>
        <span>التقدم: <b>{progress}%</b></span>
        {!isProjectRoot && <span className="opacity-50">(مرحلة فرعية)</span>}
      </div>
      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-white/10 mb-3">
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: progress === 100 ? '#34d399' : '#f59e0b' }} />
      </div>
      {/* Tasks from this node's projectTasks */}
      {tasks.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
          <p className="text-[10px] font-bold opacity-60 mb-1">📋 المهام:</p>
          {tasks.map(task => (
            <div key={task.id} className={`flex items-center justify-between p-1.5 rounded text-xs ${task.status === 'done' ? 'opacity-50 line-through' : ''}`}>
              <span className="flex-1">{task.status === 'done' ? '✅' : task.status === 'in-progress' ? '🔄' : '⏳'} {task.label}</span>
              {task.status !== 'done' && (
                <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5 shrink-0" disabled={taskExecuting === task.id}
                  onClick={() => onExecuteTask(task.id, task.label, liveProject.id)}>
                  {taskExecuting === task.id ? '⏳' : '▶️'} نفّذ
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Child nodes (phases for project, tasks for phase) with progress */}
      {childNodes.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto mb-2">
          <p className="text-[10px] font-bold opacity-60 mb-1">{isProjectRoot ? '📂 المراحل الفرعية:' : '📋 المهام الفرعية:'}</p>
          {childNodes.map(cn => {
            const cnProgress = cn.projectProgress ?? 0;
            const cnTasks = cn.projectTasks || [];
            const cnDone = cnTasks.filter(t => t.status === 'done').length;
            const cnTotal = cnTasks.length;
            return (
              <div key={cn.id}>
                <button className="w-full text-right px-2 py-1.5 rounded text-xs flex items-center justify-between hover:bg-white/5 transition-colors"
                  onClick={() => { onNavigate(cn.id); onSelectNode(cn); onClosePanel(); }}>
                  <span style={{ color: cn.color }}>● {cn.label}</span>
                  <span className="opacity-50 text-[9px]">{cn.tag} {cnTotal > 0 ? `(${cnDone}/${cnTotal})` : ''}</span>
                </button>
                {/* Progress bar for child phase */}
                {(cnProgress > 0 || cnTotal > 0) && (
                  <div className="w-full h-1 rounded-full bg-white/5 mx-2 mb-1" style={{ width: 'calc(100% - 16px)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${cnProgress || (cnTotal > 0 ? Math.round(cnDone / cnTotal * 100) : 0)}%`, background: cnProgress === 100 ? '#34d399' : '#f59e0b' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Action buttons */}
      <div className="flex gap-1 mt-3 pt-2 border-t border-white/10 flex-wrap">
        {isProjectRoot && (
          <>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onGenerateCode(liveProject)}>🔧 كود</Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onGeneratePreview(liveProject)}>🌐 معاينة</Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onGenerateReport(liveProject)}>📄 تقرير</Button>
          </>
        )}
        {pendingTasks.length > 0 && (
          <Button size="sm" variant="outline" className="h-6 text-[10px] text-cyan-400" onClick={() => onExecuteAll(liveProject.id)} disabled={!!taskExecuting}>
            ⚡ تنفيذ الكل
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onFeed(liveProject.id)}>🍎 غذّ</Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-400" onClick={() => { onDelete(liveProject.id); onClose(); }}>🗑️ حذف</Button>
      </div>
    </div>
  );
}

// ─── Live Output Panel Component ──────────────────────────
function LivePanel({ open, title, type, content, fullContent, onClose, onCopy, onOpenNew, onDownload }: {
  open: boolean;
  title: string;
  type: 'planning' | 'code' | 'preview' | 'report';
  content: string;
  fullContent: string;
  onClose: () => void;
  onCopy: () => void;
  onOpenNew: () => void;
  onDownload: () => void;
}) {
  const contentRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [content]);

  if (!open) return null;

  const typeEmoji = type === 'code' ? '🔧' : type === 'preview' ? '🌐' : type === 'report' ? '📄' : '🧠';
  const typeLabel = type === 'code' ? 'توليد الكود' : type === 'preview' ? 'المعاينة' : type === 'report' ? 'التقرير' : 'التخطيط';

  return (
    <div className="fixed top-0 left-0 h-full z-40 pointer-events-auto" style={{ width: '420px', maxWidth: '90vw' }}>
      <div className="h-full flex flex-col bg-gray-950 text-gray-100 border-l border-gray-800 shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="text-sm">{typeEmoji}</span>
            <span className="text-xs font-bold text-cyan-400">{typeLabel}</span>
            <span className="text-[10px] text-gray-500">— {title}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm px-1">✕</button>
        </div>
        {/* Content area */}
        <pre ref={contentRef} className="flex-1 overflow-auto p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words" dir="ltr" style={{ background: '#0d1117' }}>
          {content}
          <span className="animate-pulse text-cyan-400">▌</span>
        </pre>
        {/* Bottom buttons */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-800 bg-gray-900">
          <button onClick={onCopy} className="px-2.5 py-1 rounded text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">📋 نسخ</button>
          {type === 'preview' && (
            <button onClick={onOpenNew} className="px-2.5 py-1 rounded text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">🔗 نافذة جديدة</button>
          )}
          <button onClick={onDownload} className="px-2.5 py-1 rounded text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">💾 تحميل</button>
          <div className="flex-1" />
          <span className="text-[9px] text-gray-600">{fullContent.length} حرف</span>
        </div>
      </div>
    </div>
  );
}

// ─── Undo/Redo ─────────────────────────────────────────────
interface HistoryEntry {
  nodes: MindNode[];
  edges: MindEdge[];
  brainStats: BrainStats;
}

// ─── Component ──────────────────────────────────────────────
export default function MindFlowBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<MindNode[]>([]);
  const edgesRef = useRef<MindEdge[]>([]);
  const viewportRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ nodeId: string | null; startX: number; startY: number; nodeStartX: number; nodeStartY: number; moved: boolean }>({
    nodeId: null, startX: 0, startY: 0, nodeStartX: 0, nodeStartY: 0, moved: false,
  });
  const panRef = useRef<{ active: boolean; startX: number; startY: number; vpStartX: number; vpStartY: number }>({
    active: false, startX: 0, startY: 0, vpStartX: 0, vpStartY: 0,
  });
  const particlesRef = useRef<FeedParticle[]>([]);
  const timeRef = useRef(0);
  const cameraTargetRef = useRef<{ x: number; y: number; scale: number; animating: boolean; startTime: number; duration: number; fromX: number; fromY: number; fromScale: number }>({
    x: 0, y: 0, scale: 1, animating: false, startTime: 0, duration: 500, fromX: 0, fromY: 0, fromScale: 1,
  });

  // Multi-select
  const selectionRef = useRef<{ active: boolean; startX: number; startY: number; endX: number; endY: number }>({
    active: false, startX: 0, startY: 0, endX: 0, endY: 0,
  });

  // History
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  // ─── Hydration-safe initialization ──────────────────────
  // FIX: Always start with empty/server-safe defaults so SSR and client
  // initial render match perfectly (no hydration mismatch = React error #418).
  // Real data from localStorage is loaded in useEffect after mount.
  const [mounted, setMounted] = useState(false);

  const [nodes, setNodes] = useState<MindNode[]>([]);
  const [edges, setEdges] = useState<MindEdge[]>([]);
  const [brainStats, setBrainStats] = useState<BrainStats>(defaultStats());
  const [selectedNode, setSelectedNode] = useState<MindNode | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [exploredTopics, setExploredTopics] = useState<string[]>([]);
  const [showStats, setShowStats] = useState(false);

  // 🔍 Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<MindNode[]>([]);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 🕸️ View
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [filterState, setFilterState] = useState<FilterState>({
    topics: [], tags: [], minKnowledge: 0, maturityFilter: [], showDormant: true,
  });
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // 🎨 Theme
  const [theme, setTheme] = useState<ThemeMode>('dark');

  // 🔊 Sound
  const [muted, setMuted] = useState(false);

  // 🤖 AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [learningPath, setLearningPath] = useState<string[]>([]);

  // 🎓 Quiz
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState<QuizQuestion | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizResult, setQuizResult] = useState<'correct' | 'wrong' | null>(null);

  // 💡 Idea → Project
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false);
  const [ideaText, setIdeaText] = useState('');
  const [ideaLoading, setIdeaLoading] = useState(false);
  const [ideaError, setIdeaError] = useState('');
  const [projectPanelNode, setProjectPanelNode] = useState<MindNode | null>(null);
  const [taskExecuting, setTaskExecuting] = useState<string | null>(null);

  // 🧠 Auto-learn
  const [autoLearnActive, setAutoLearnActive] = useState(false);
  const [autoLearnLoading, setAutoLearnLoading] = useState(false);
  const [autoLearnInsights, setAutoLearnInsights] = useState<string[]>([]);

  // 🏆 Achievements
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [achievementToast, setAchievementToast] = useState<Achievement | null>(null);

  // 🔧 Code Generator
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeFiles, setCodeFiles] = useState<{ path: string; content: string }[]>([]);
  const [selectedCodeFile, setSelectedCodeFile] = useState<string | null>(null);

  // 🌐 Live Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  // 📄 Project Report
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<{
    executiveSummary?: string;
    requirements?: string[];
    techStack?: string[];
    architecture?: string;
    timeline?: string;
    risks?: string[];
    recommendations?: string[];
  } | null>(null);

  // 🖥️ Live Output Panel
  const [livePanelOpen, setLivePanelOpen] = useState(false);
  const [livePanelContent, setLivePanelContent] = useState('');
  const [livePanelTitle, setLivePanelTitle] = useState('');
  const [livePanelType, setLivePanelType] = useState<'planning' | 'code' | 'preview' | 'report'>('planning');
  const [livePanelFullContent, setLivePanelFullContent] = useState('');

  // 🖱️ Click feedback — shows a brief pulse when a node is clicked
  const [clickFeedback, setClickFeedback] = useState<{ x: number; y: number; label: string } | null>(null);

  // Multi-select
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  // Edge flow particles
  const edgeParticlesRef = useRef<{ edgeId: string; progress: number; speed: number }[]>([]);

  // ─── Load persisted state after mount (fixes hydration mismatch) ──
  useEffect(() => {
    if (mounted) return; // Only run once
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    // Try full state first (includes projects, edges, all data)
    const fullPersisted = loadFullState();
    if (fullPersisted) {
      const brain = fullPersisted.nodes.find(n => n.isBrain);
      const offsetX = brain ? cx - brain.x : 0;
      const offsetY = brain ? cy - brain.y : 0;
      const restoredNodes = fullPersisted.nodes.map(n => {
        const defaults: Partial<MindNode> = {
          isBrain: false, isCustom: false, expanded: false, hasChildren: false,
          connections: [], knowledgeLevel: 0, color: '#00ffe0', pulsePhase: Math.random() * Math.PI * 2,
          maturity: 'seed', dormant: false, lastFedAt: Date.now(), visitCount: 0,
          alliedWith: [], aiSummary: '', aiQuestions: [], aiSuggestedLinks: [],
          feedParticles: [],
          isProject: false, projectPhase: 'idea', projectProgress: 0, projectTasks: [],
          quizQuestion: undefined, quizOptions: undefined, quizCorrectIndex: undefined,
          enterAnim: 1, selected: false,
          childrenData: undefined,
        };
        return {
          ...defaults,
          ...n,
          x: n.x + offsetX,
          y: n.y + offsetY,
          feedParticles: [],
          enterAnim: 1,
          selected: false,
        };
      });
      const restoredEdges = fullPersisted.edges.map(e => ({ ...e }));
      const restoredStats = { ...defaultStats(), ...fullPersisted.brainStats };
      setNodes(restoredNodes);
      setEdges(restoredEdges);
      setBrainStats(restoredStats);
      setExploredTopics(fullPersisted.exploredTopics || []);
      setUnlockedAchievements(fullPersisted.unlockedAchievements || []);
    } else {
      // Fallback: legacy persistence or create fresh brain
      const brain = createBrainNode(cx, cy);
      const persisted = loadState();
      let initialNodes = [brain];
      let initialStats = defaultStats();
      let initialExplored: string[] = [];
      let initialUnlockedAch: string[] = [];

      if (persisted) {
        initialStats = { ...defaultStats(), ...persisted.brainStats };
        initialExplored = persisted.exploredTopics;
        initialUnlockedAch = persisted.unlockedAchievements || [];
        persisted.customNodes.forEach((cn, i) => {
          const angle = (i / Math.max(1, persisted.customNodes.length)) * Math.PI * 2 - Math.PI / 2;
          const dist = 220 + Math.random() * 80;
          initialNodes.push(makeNode({
            id: nid(), label: cn.label, tag: cn.tag || 'مخصص', summary: cn.summary,
            x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
            depth: 1, parentId: BRAIN_ID, isCustom: true,
            connections: [BRAIN_ID], knowledgeLevel: 50, color: '#ff6b9d',
            maturity: 'sprout', visitCount: 5, enterAnim: 1,
          }));
          initialStats.totalNodes++;
        });
      }
      setNodes(initialNodes);
      setEdges([]);
      setBrainStats(initialStats);
      setExploredTopics(initialExplored);
      setUnlockedAchievements(initialUnlockedAch);
    }
    setMounted(true);
  }, [mounted]);

  // ─── Sync refs ─────────────────────────────────────────
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ─── Save on changes (full state + legacy fallback) ────────
  useEffect(() => {
    if (nodes.length === 0) return;
    saveFullState(brainStats, nodes, edges, exploredTopics, unlockedAchievements);
    saveState(brainStats, nodes, exploredTopics, unlockedAchievements);
  }, [brainStats, nodes, edges, exploredTopics, unlockedAchievements]);

  // ─── Canvas Resize ─────────────────────────────────────
  useEffect(() => {
    function onResize() {
      const c = canvasRef.current; if (!c) return;
      c.width = window.innerWidth; c.height = window.innerHeight;
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ─── History ───────────────────────────────────────────
  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const entry: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: JSON.parse(JSON.stringify(edgesRef.current)),
      brainStats: JSON.parse(JSON.stringify(brainStats)),
    };
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(entry);
    if (newHistory.length > 50) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
  }, [brainStats]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    if (entry) {
      skipHistoryRef.current = true;
      setNodes(entry.nodes);
      setEdges(entry.edges);
      setBrainStats(entry.brainStats);
      setSelectedNode(null);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    if (entry) {
      skipHistoryRef.current = true;
      setNodes(entry.nodes);
      setEdges(entry.edges);
      setBrainStats(entry.brainStats);
      setSelectedNode(null);
    }
  }, []);

  // ─── Find node at position ─────────────────────────────
  const findNodeAt = useCallback((sx: number, sy: number): MindNode | null => {
    const vp = viewportRef.current;
    const wx = (sx - vp.x) / vp.scale;
    const wy = (sy - vp.y) / vp.scale;
    // Larger hit areas for mobile/touch friendliness
    const isTouchDevice = 'ontouchstart' in window;
    const touchBonus = isTouchDevice ? 20 : 0;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const r = (n.isBrain ? 55 : n.isProject ? 45 : 32) + touchBonus;
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 < r * r) return n;
    }
    return null;
  }, []);

  // ─── Smooth camera ─────────────────────────────────────
  const navigateToNode = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;
    const vp = viewportRef.current;
    cameraTargetRef.current = {
      x: -node.x * vp.scale + window.innerWidth / 2,
      y: -node.y * vp.scale + window.innerHeight / 2,
      scale: vp.scale,
      animating: true, startTime: performance.now(), duration: 500,
      fromX: vp.x, fromY: vp.y, fromScale: vp.scale,
    };
  }, []);

  const resetView = useCallback(() => {
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!brain) return;
    const vp = viewportRef.current;
    cameraTargetRef.current = {
      x: window.innerWidth / 2 - brain.x,
      y: window.innerHeight / 2 - brain.y,
      scale: 1,
      animating: true, startTime: performance.now(), duration: 400,
      fromX: vp.x, fromY: vp.y, fromScale: vp.scale,
    };
  }, []);

  // ─── Add timeline entry ────────────────────────────────
  const addTimeline = useCallback((event: TimelineEntry['event'], detail: string) => {
    setBrainStats(prev => ({
      ...prev,
      history: [...prev.history.slice(-100), {
        timestamp: Date.now(), event, detail, knowledge: prev.totalKnowledge,
      }],
    }));
  }, []);

  // ─── Check Dormant Nodes ───────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setNodes(prev => prev.map(n => {
        if (n.isBrain || n.dormant) return n;
        const timeSinceFed = now - n.lastFedAt;
        const shouldDormant = timeSinceFed > 120000 && n.knowledgeLevel > 0;
        if (shouldDormant && !n.dormant) return { ...n, dormant: true };
        return n;
      }));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // ─── Entry animation ───────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(prev => prev.map(n => {
        if (n.enterAnim < 1) return { ...n, enterAnim: Math.min(1, n.enterAnim + 0.05) };
        return n;
      }));
    }, 16);
    return () => clearInterval(interval);
  }, []);

  // ─── Cross-Link ────────────────────────────────────────
  const addCrossLinks = useCallback((newNodes: MindNode[]) => {
    const allNodes = nodesRef.current;
    setEdges(prev => {
      const additional: MindEdge[] = [];
      newNodes.forEach(nn => {
        const rules = CROSS_LINK_RULES[nn.tag];
        if (!rules) return;
        allNodes.forEach(existing => {
          if (existing.id === nn.id || existing.isBrain) return;
          if (rules.includes(existing.label) || existing.tag === nn.tag) {
            const exists = prev.some(e =>
              (e.from === nn.id && e.to === existing.id) ||
              (e.from === existing.id && e.to === nn.id) ||
              additional.some(a =>
                (a.from === nn.id && a.to === existing.id) ||
                (a.from === existing.id && a.to === nn.id)
              )
            );
            if (!exists) {
              additional.push({
                id: eid(), from: nn.id, to: existing.id,
                type: 'cross-link', strength: 0.3, animated: true, createdAt: Date.now(),
              });
            }
          }
        });
      });
      return [...prev, ...additional];
    });
  }, []);

  // ─── Feed Brain ────────────────────────────────────────
  const feedBrain = useCallback((nodeId: string, multiplier = 1) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!node || !brain || node.isBrain) return;

    const newParticles: FeedParticle[] = [];
    for (let i = 0; i < 8; i++) {
      newParticles.push({
        id: `p_${Date.now()}_${i}`, x: node.x, y: node.y,
        targetX: brain.x, targetY: brain.y,
        progress: 0, speed: 0.015 + Math.random() * 0.015,
        color: node.color, size: 3 + Math.random() * 3,
      });
    }
    particlesRef.current = [...particlesRef.current, ...newParticles];

    const knowledgeGain = (5 + Math.floor(Math.random() * 10)) * multiplier;
    pushHistory();
    setBrainStats(prev => {
      const newK = prev.totalKnowledge + knowledgeGain;
      const lv = getBrainLevel(newK);
      const wasLevel = prev.level;
      if (lv.level > wasLevel) sounds.levelUp();
      return {
        ...prev, totalKnowledge: newK, totalFeeds: prev.totalFeeds + 1,
        level: lv.level, levelName: lv.name,
        growthRate: Math.round((prev.totalFeeds + 1) / Math.max(1, prev.totalNodes) * 100),
        history: [...prev.history.slice(-100), {
          timestamp: Date.now(), event: 'feed', detail: `تغذية: ${node.label}`, knowledge: newK,
        }],
      };
    });

    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        const newVisits = n.visitCount + 1;
        const newKnowledge = Math.min(100, n.knowledgeLevel + 10 * multiplier);
        const newMaturity = getMaturity(newVisits);
        const wasMaturity = n.maturity;
        if (newMaturity !== wasMaturity) sounds.mature();
        return {
          ...n,
          knowledgeLevel: newKnowledge,
          connections: n.connections.includes(BRAIN_ID) ? n.connections : [...n.connections, BRAIN_ID],
          visitCount: newVisits, maturity: newMaturity,
          dormant: false, lastFedAt: Date.now(),
        };
      }
      return n;
    }));

    setEdges(prev => {
      const exists = prev.some(e => (e.from === nodeId && e.to === BRAIN_ID) || (e.from === BRAIN_ID && e.to === nodeId));
      if (!exists) return [...prev, { id: eid(), from: nodeId, to: BRAIN_ID, type: 'feed', strength: 0.5, animated: true, createdAt: Date.now() }];
      return prev;
    });

    sounds.feed();
  }, [pushHistory]);

  // ─── Expand Topic ─────────────────────────────────────
  const expandTopic = useCallback((topicKey: string) => {
    const topic = KNOWLEDGE_BASE[topicKey];
    if (!topic) return;
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!brain) return;

    pushHistory();
    const newNodes: MindNode[] = [];
    const newEdges: MindEdge[] = [];
    const count = topic.children.length;
    const color = TOPIC_COLORS[topicKey] || '#00ffe0';

    topic.children.forEach((child, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const dist = 200 + Math.random() * 60;
      const childNode = makeNode({
        id: nid(), label: child.label, tag: child.tag, summary: child.summary || '',
        x: brain.x + Math.cos(angle) * dist, y: brain.y + Math.sin(angle) * dist,
        depth: 1, parentId: BRAIN_ID,
        hasChildren: !!child.children?.length,
        childrenData: child.children, color,
      });
      newNodes.push(childNode);
      newEdges.push({ id: eid(), from: BRAIN_ID, to: childNode.id, type: 'parent', strength: 1, animated: false, createdAt: Date.now() });
    });

    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
    setBrainStats(prev => ({
      ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length,
      topicsExplored: prev.topicsExplored.includes(topicKey) ? prev.topicsExplored : [...prev.topicsExplored, topicKey],
      history: [...prev.history.slice(-100), { timestamp: Date.now(), event: 'expand', detail: `استكشاف: ${topicKey}`, knowledge: prev.totalKnowledge }],
    }));
    setExploredTopics(prev => prev.includes(topicKey) ? prev : [...prev, topicKey]);

    setTimeout(() => { newNodes.forEach((n, i) => { setTimeout(() => feedBrain(n.id), i * 200); }); }, 300);
    setTimeout(() => { addCrossLinks(newNodes); }, 500);
  }, [feedBrain, addCrossLinks, pushHistory]);

  // ─── Expand Sub-nodes ─────────────────────────────────
  const expandNode = useCallback((nodeId: string) => {
    const parent = nodesRef.current.find(n => n.id === nodeId);
    if (!parent || !parent.childrenData?.length) return;

    if (parent.expanded) {
      pushHistory();
      setNodes(prev => {
        const toRemove = new Set(prev.filter(n => n.parentId === nodeId).map(n => n.id));
        return prev.filter(n => !toRemove.has(n.id)).map(n => n.id === nodeId ? { ...n, expanded: false } : n);
      });
      setEdges(prev => {
        const toRemove = new Set(nodesRef.current.filter(n => n.parentId === nodeId).map(n => n.id));
        return prev.filter(e => !toRemove.has(e.to));
      });
      return;
    }

    pushHistory();
    const newNodes: MindNode[] = [];
    const newEdges: MindEdge[] = [];
    const count = parent.childrenData.length;

    parent.childrenData.forEach((child, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const dist = 150 + Math.random() * 40;
      const childNode = makeNode({
        id: nid(), label: child.label, tag: child.tag, summary: child.summary || '',
        x: parent.x + Math.cos(angle) * dist, y: parent.y + Math.sin(angle) * dist,
        depth: parent.depth + 1, parentId: nodeId,
        hasChildren: !!child.children?.length,
        childrenData: child.children, color: parent.color,
      });
      newNodes.push(childNode);
      newEdges.push({ id: eid(), from: nodeId, to: childNode.id, type: 'parent', strength: 0.8, animated: false, createdAt: Date.now() });
    });

    setNodes(prev => [...prev, ...newNodes].map(n => n.id === nodeId ? { ...n, expanded: true, visitCount: n.visitCount + 1, maturity: getMaturity(n.visitCount + 1) } : n));
    setEdges(prev => [...prev, ...newEdges]);
    setBrainStats(prev => ({ ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length }));
    setTimeout(() => { newNodes.forEach((n, i) => { setTimeout(() => feedBrain(n.id), i * 150); }); }, 200);
  }, [feedBrain, pushHistory]);

  // ─── Add Custom Node ──────────────────────────────────
  const addCustomNode = useCallback(() => {
    if (!newLabel.trim()) return;
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!brain) return;

    pushHistory();
    const angle = Math.random() * Math.PI * 2;
    const dist = 220 + Math.random() * 80;
    const newNode = makeNode({
      id: nid(), label: newLabel.trim(), tag: newTag.trim() || 'مخصص', summary: newSummary.trim(),
      x: brain.x + Math.cos(angle) * dist, y: brain.y + Math.sin(angle) * dist,
      depth: 1, parentId: BRAIN_ID, isCustom: true,
      connections: [BRAIN_ID], knowledgeLevel: 50, color: '#ff6b9d',
      maturity: 'sprout', visitCount: 3,
    });

    setNodes(prev => [...prev, newNode]);
    setEdges(prev => [...prev, { id: eid(), from: BRAIN_ID, to: newNode.id, type: 'feed', strength: 0.6, animated: true, createdAt: Date.now() }]);
    setBrainStats(prev => {
      const newK = prev.totalKnowledge + 15;
      const lv = getBrainLevel(newK);
      return { ...prev, totalNodes: prev.totalNodes + 1, totalConnections: prev.totalConnections + 1, totalKnowledge: newK, totalFeeds: prev.totalFeeds + 1, level: lv.level, levelName: lv.name };
    });
    setNewLabel(''); setNewTag(''); setNewSummary('');
    setAddDialogOpen(false);
    addTimeline('create', `عقدة جديدة: ${newLabel.trim()}`);
    setTimeout(() => feedBrain(newNode.id), 100);
  }, [newLabel, newTag, newSummary, feedBrain, addTimeline, pushHistory]);

  // ─── Manual Connect ────────────────────────────────────
  const connectNodes = useCallback((fromId: string, toId: string) => {
    pushHistory();
    setEdges(prev => {
      const exists = prev.some(e => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId));
      if (exists) return prev;
      return [...prev, { id: eid(), from: fromId, to: toId, type: 'cross-link', strength: 0.5, animated: true, createdAt: Date.now() }];
    });
    setNodes(prev => prev.map(n => {
      if (n.id === fromId) return { ...n, connections: [...n.connections, toId] };
      if (n.id === toId) return { ...n, connections: [...n.connections, fromId] };
      return n;
    }));
    setBrainStats(prev => ({ ...prev, totalConnections: prev.totalConnections + 1, totalKnowledge: prev.totalKnowledge + 8 }));
    sounds.connect();
    addTimeline('link', 'ربط يدوي بين عقدتين');
  }, [addTimeline, pushHistory]);

  // ─── Delete Node ───────────────────────────────────────
  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === BRAIN_ID) return;
    pushHistory();
    const toRemove = new Set<string>();
    function collect(id: string) { toRemove.add(id); nodesRef.current.filter(n => n.parentId === id).forEach(n => collect(n.id)); }
    collect(nodeId);
    setNodes(prev => prev.filter(n => !toRemove.has(n.id)));
    setEdges(prev => prev.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to)));
    setSelectedNode(null);
    setSelectedNodeIds(prev => { const next = new Set(prev); toRemove.forEach(id => next.delete(id)); return next; });
  }, [pushHistory]);

  // ─── Search ────────────────────────────────────────────
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchActive(false); setSearchResults([]); setHighlightedNodes(new Set());
      return;
    }
    const q = query.toLowerCase();
    const results = nodesRef.current.filter(n =>
      !n.isBrain && (n.label.toLowerCase().includes(q) || n.tag.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q))
    );
    setSearchActive(true); setSearchResults(results); setHighlightedNodes(new Set(results.map(n => n.id)));
    if (results.length > 0) { sounds.searchFound(); navigateToNode(results[0].id); }
  }, [navigateToNode]);

  // ─── Filter ────────────────────────────────────────────
  const getFilteredNodeIds = useCallback(() => {
    if (viewMode !== 'filtered') return null;
    const ids = new Set<string>();
    nodesRef.current.forEach(n => {
      if (n.isBrain) { ids.add(n.id); return; }
      if (filterState.minKnowledge > 0 && n.knowledgeLevel < filterState.minKnowledge) return;
      if (!filterState.showDormant && n.dormant) return;
      if (filterState.maturityFilter.length > 0 && !filterState.maturityFilter.includes(n.maturity)) return;
      if (filterState.tags.length > 0 && !filterState.tags.includes(n.tag)) return;
      ids.add(n.id);
    });
    return ids;
  }, [viewMode, filterState]);

  // ─── AI Functions ──────────────────────────────────────
  const aiSummarize = useCallback(async () => {
    setAiLoading(true); setAiPanelOpen(true);
    try {
      const nodeData = nodesRef.current.map(n => ({ id: n.id, label: n.label, tag: n.tag, summary: n.summary, isBrain: n.isBrain }));
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize', nodes: nodeData, brainKnowledge: brainStats.totalKnowledge }),
      });
      const data = await res.json();
      setAiInsight(prev => ({ summary: data.summary || 'لم يتم توليد ملخص', questions: data.questions || [], suggestedLinks: prev?.suggestedLinks || [], suggestedNodes: prev?.suggestedNodes || [] }));
      sounds.aiInsight(); addTimeline('ai-insight', 'توليد ملخص ذكي');
    } catch { setAiInsight(prev => ({ ...prev, summary: 'خطأ في الاتصال بالذكاء الاصطناعي' })); }
    setAiLoading(false);
  }, [brainStats.totalKnowledge, addTimeline]);

  const aiSuggestLinks = useCallback(async () => {
    setAiLoading(true);
    try {
      const nodeData = nodesRef.current.filter(n => !n.isBrain).map(n => ({ id: n.id, label: n.label, tag: n.tag, summary: n.summary }));
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest-links', nodes: nodeData }),
      });
      const data = await res.json();
      if (data.suggestedLinks?.length) {
        data.suggestedLinks.forEach((link: { from: string; to: string; reason: string }) => {
          const fromNode = nodesRef.current.find(n => n.id === link.from || n.label === link.from);
          const toNode = nodesRef.current.find(n => n.id === link.to || n.label === link.to);
          if (fromNode && toNode) connectNodes(fromNode.id, toNode.id);
        });
        sounds.aiInsight(); addTimeline('ai-insight', 'اقتراح روابط ذكية');
      }
    } catch (err) { console.error('aiSuggestLinks error:', err); }
    setAiLoading(false);
  }, [addTimeline, connectNodes]);

  const aiGenerateNodes = useCallback(async (parentNode: MindNode) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-nodes', nodeLabel: parentNode.label, nodeTag: parentNode.tag, nodeSummary: parentNode.summary }),
      });
      const data = await res.json();
      if (data.suggestedNodes?.length) {
        pushHistory();
        const newNodes: MindNode[] = []; const newEdges: MindEdge[] = [];
        const count = data.suggestedNodes.length;
        data.suggestedNodes.forEach((sn: { label: string; tag: string; summary: string }, i: number) => {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const dist = 150 + Math.random() * 40;
          newNodes.push(makeNode({
            id: nid(), label: sn.label, tag: sn.tag, summary: sn.summary,
            x: parentNode.x + Math.cos(angle) * dist, y: parentNode.y + Math.sin(angle) * dist,
            depth: parentNode.depth + 1, parentId: parentNode.id, color: '#a78bfa',
          }));
          newEdges.push({ id: eid(), from: parentNode.id, to: newNodes[newNodes.length - 1].id, type: 'ai-link', strength: 0.6, animated: true, createdAt: Date.now() });
        });
        setNodes(prev => [...prev, ...newNodes]); setEdges(prev => [...prev, ...newEdges]);
        setBrainStats(prev => ({ ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length }));
        sounds.aiInsight(); addTimeline('ai-insight', `AI ولّد ${newNodes.length} عقد`);
        setTimeout(() => { newNodes.forEach((n, i) => { setTimeout(() => feedBrain(n.id), i * 150); }); }, 200);
      }
    } catch (err) { console.error('aiGenerateNodes error:', err); }
    setAiLoading(false);
  }, [feedBrain, addTimeline, pushHistory]);

  const aiAsk = useCallback(async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    try {
      const nodeData = nodesRef.current.filter(n => !n.isBrain).map(n => ({ label: n.label, summary: n.summary }));
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ask', nodes: nodeData, question: aiQuestion }),
      });
      const data = await res.json();
      setAiAnswer(data.answer || 'لا إجابة'); sounds.aiInsight();
    } catch { setAiAnswer('خطأ في الاتصال'); }
    setAiLoading(false);
  }, [aiQuestion]);

  // ─── Alliance ──────────────────────────────────────────
  const formAlliance = useCallback((nodeId1: string, nodeId2: string) => {
    pushHistory();
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId1) return { ...n, alliedWith: [...n.alliedWith, nodeId2] };
      if (n.id === nodeId2) return { ...n, alliedWith: [...n.alliedWith, nodeId1] };
      return n;
    }));
    setEdges(prev => [...prev, { id: eid(), from: nodeId1, to: nodeId2, type: 'alliance', strength: 0.8, animated: true, createdAt: Date.now() }]);
    sounds.alliance(); addTimeline('alliance', 'تحالف عقد');
  }, [addTimeline, pushHistory]);

  const wakeNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, dormant: false, lastFedAt: Date.now() } : n));
    feedBrain(nodeId);
  }, [feedBrain]);

  // ─── 🎓 Quiz ───────────────────────────────────────────
  const generateQuiz = useCallback(async () => {
    setQuizLoading(true); setQuizOpen(true);
    try {
      const nodeData = nodesRef.current.filter(n => !n.isBrain).map(n => ({ label: n.label, tag: n.tag, summary: n.summary }));
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-quiz', nodes: nodeData }),
      });
      const data = await res.json();
      if (data.quiz) {
        setCurrentQuiz({ question: data.quiz.question, options: data.quiz.options || [], correctIndex: data.quiz.correctIndex ?? 0, explanation: data.quiz.explanation || '', relatedNodeId: undefined });
        setQuizAnswer(null); setQuizResult(null);
      } else {
        setCurrentQuiz({ question: 'لم يتم توليد سؤال', options: ['أ', 'ب', 'ج', 'د'], correctIndex: 0, explanation: '' });
      }
    } catch { setCurrentQuiz({ question: 'خطأ في الاتصال', options: ['أ', 'ب', 'ج', 'د'], correctIndex: 0, explanation: '' }); }
    setQuizLoading(false);
  }, []);

  const answerQuiz = useCallback((optionIndex: number) => {
    if (!currentQuiz || quizResult) return;
    setQuizAnswer(optionIndex);
    const isCorrect = optionIndex === currentQuiz.correctIndex;
    setQuizResult(isCorrect ? 'correct' : 'wrong');
    setBrainStats(prev => ({
      ...prev,
      quizTotal: prev.quizTotal + 1,
      quizCorrect: isCorrect ? prev.quizCorrect + 1 : prev.quizCorrect,
    }));
    if (isCorrect) {
      sounds.levelUp();
      // 2x feed on a random node
      const nonBrain = nodesRef.current.filter(n => !n.isBrain);
      if (nonBrain.length > 0) {
        const target = nonBrain[Math.floor(Math.random() * nonBrain.length)];
        feedBrain(target.id, 2);
      }
    }
    addTimeline('quiz', isCorrect ? 'إجابة صحيحة! 🎉' : 'إجابة خاطئة');
  }, [currentQuiz, quizResult, feedBrain, addTimeline]);

  // ─── 💡 Idea → Project ─────────────────────────────────
  const analyzeIdea = useCallback(async () => {
    if (!ideaText.trim()) return;
    setIdeaLoading(true);
    setIdeaError('');
    try {
      // Add timeout (90 seconds) - AI analysis can take time
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze-idea', idea: ideaText.trim() }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errMsg = `خطأ في الخادم (${res.status})`;
        try {
          const errData = await res.json();
          errMsg = errData.summary || errData.error || errMsg;
        } catch { /* */ }
        setIdeaError(errMsg);
        return;
      }

      const data = await res.json();
      if (!data.analysis) {
        setIdeaError('لم يتم توليد خطة المشروع. حاول مرة أخرى.');
        return;
      }

      pushHistory();
      const analysis: ProjectAnalysis = data.analysis;
      const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
      if (!brain) { setIdeaError('لم يتم العثور على العقل المركزي'); return; }

      const projectAngle = Math.random() * Math.PI * 2;
      const projectDist = 300;
      const projectNode = makeNode({
        id: nid(), label: `🚀 ${analysis.title}`, tag: analysis.tags?.[0] || 'مشروع',
        summary: analysis.description,
        x: brain.x + Math.cos(projectAngle) * projectDist,
        y: brain.y + Math.sin(projectAngle) * projectDist,
        depth: 1, parentId: BRAIN_ID, isCustom: true,
        connections: [BRAIN_ID], color: '#f59e0b',
        isProject: true, projectPhase: 'planning', projectProgress: 0,
        projectTasks: analysis.phases.flatMap(p =>
          p.tasks.map(t => ({ id: nid(), label: t.label, status: 'pending' as const }))
        ),
        knowledgeLevel: 30, maturity: 'sprout', visitCount: 3,
      });

      const newNodes = [projectNode];
      const newEdges: MindEdge[] = [{ id: eid(), from: BRAIN_ID, to: projectNode.id, type: 'project', strength: 1, animated: true, createdAt: Date.now() }];

      // Create phase sub-nodes
      analysis.phases.forEach((phase, pi) => {
        const phaseAngle = projectAngle + (pi / analysis.phases.length) * Math.PI * 2;
        const phaseDist = 180;
        const phaseNode = makeNode({
          id: nid(), label: phase.name, tag: 'مرحلة', summary: phase.description,
          x: projectNode.x + Math.cos(phaseAngle) * phaseDist,
          y: projectNode.y + Math.sin(phaseAngle) * phaseDist,
          depth: 2, parentId: projectNode.id, color: '#f59e0b',
          connections: [projectNode.id], knowledgeLevel: 10,
        });
        newNodes.push(phaseNode);
        newEdges.push({ id: eid(), from: projectNode.id, to: phaseNode.id, type: 'project', strength: 0.8, animated: true, createdAt: Date.now() });

        // Task sub-nodes
        phase.tasks.forEach((task, ti) => {
          const taskAngle = phaseAngle + (ti / phase.tasks.length) * Math.PI * 1.5 - 0.3;
          const taskDist = 120;
          const taskNode = makeNode({
            id: nid(), label: task.label, tag: 'مهمة', summary: task.description,
            x: phaseNode.x + Math.cos(taskAngle) * taskDist,
            y: phaseNode.y + Math.sin(taskAngle) * taskDist,
            depth: 3, parentId: phaseNode.id, color: '#34d399',
            connections: [phaseNode.id], knowledgeLevel: 0,
            isProject: false,
            projectTasks: [{ id: nid(), label: task.label, status: 'pending' }],
          });
          newNodes.push(taskNode);
          newEdges.push({ id: eid(), from: phaseNode.id, to: taskNode.id, type: 'project', strength: 0.6, animated: true, createdAt: Date.now() });
        });
      });

      setNodes(prev => [...prev, ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
      setBrainStats(prev => ({
        ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length,
        projectsCreated: prev.projectsCreated + 1, totalKnowledge: prev.totalKnowledge + 20,
      }));
      sounds.levelUp(); addTimeline('project', `مشروع جديد: ${analysis.title}`);
      setIdeaDialogOpen(false); setIdeaText('');
    } catch (err: unknown) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      setIdeaError(isTimeout ? 'انتهت مهلة الاتصال بالذكاء الاصطناعي. حاول مرة أخرى.' : 'خطأ في الاتصال بالخادم. تحقق من الإنترنت.');
      console.error('analyzeIdea error:', err);
    } finally {
      setIdeaLoading(false);
    }
  }, [ideaText, feedBrain, addTimeline, pushHistory]);

  // ─── Helper: Update ancestor progress recursively ────────
  const updateAncestorProgress = useCallback((startNodeId: string, allNodes: MindNode[]): MindNode[] => {
    // Build a map of parentId -> children
    const childrenMap = new Map<string, MindNode[]>();
    allNodes.forEach(n => {
      const pid = n.parentId;
      if (pid) {
        const children = childrenMap.get(pid) || [];
        children.push(n);
        childrenMap.set(pid, children);
      }
    });

    // Calculate progress for a node based on its children
    function calcProgress(nodeId: string): number {
      const children = childrenMap.get(nodeId);
      if (!children || children.length === 0) {
        // Leaf node - use its own projectTasks
        const node = allNodes.find(n => n.id === nodeId);
        if (!node) return 0;
        const tasks = node.projectTasks || [];
        if (tasks.length === 0) return 0;
        return Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100);
      }
      // Average of children's progress
      const childProgresses = children.map(c => calcProgress(c.id));
      return Math.round(childProgresses.reduce((a, b) => a + b, 0) / childProgresses.length);
    }

    // Walk up from startNodeId and update each ancestor
    const updatedNodes = [...allNodes];
    let currentId: string | null = startNodeId;
    while (currentId) {
      const nodeIdx = updatedNodes.findIndex(n => n.id === currentId);
      if (nodeIdx === -1) break;
      const node = updatedNodes[nodeIdx];
      const progress = calcProgress(currentId);
      const allDone = progress === 100;
      const isProjectNode = node.isProject;
      updatedNodes[nodeIdx] = {
        ...node,
        projectProgress: progress,
        ...(isProjectNode ? { projectPhase: allDone ? 'done' as const : 'execution' as const } : {}),
      };
      currentId = node.parentId;
    }
    return updatedNodes;
  }, []);

  const executeTask = useCallback(async (taskId: string, taskLabel: string, parentNodeId: string) => {
    setTaskExecuting(taskId);
    try {
      // Find the project node for context
      const projectNode = nodesRef.current.find(n => n.id === parentNodeId || n.isProject);
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute-task', taskLabel, taskDescription: taskLabel, projectContext: projectNode?.label || '' }),
      });
      const data = await res.json();

      // Mark the task as done and store the result in summary
      setNodes(prev => {
        const updated = prev.map(n => {
          if (n.id === parentNodeId) {
            const updatedTasks = n.projectTasks.map(t => t.id === taskId ? { ...t, status: 'done' as const, summary: data.result || '' } : t);
            const allDone = updatedTasks.every(t => t.status === 'done');
            return { ...n, projectTasks: updatedTasks, projectProgress: allDone ? 100 : Math.round(updatedTasks.filter(t => t.status === 'done').length / updatedTasks.length * 100), projectPhase: allDone ? 'done' : 'execution' };
          }
          return n;
        });
        // Now propagate progress up the hierarchy
        return updateAncestorProgress(parentNodeId, updated);
      });

      // Also update the task node's summary if it's a separate node
      setNodes(prev => prev.map(n => {
        // If there's a task node with this task's label that's a child of the parent
        if (n.parentId === parentNodeId && n.label === taskLabel) {
          return { ...n, summary: data.result || n.summary };
        }
        return n;
      }));

      setBrainStats(prev => ({ ...prev, tasksCompleted: prev.tasksCompleted + 1 }));
      feedBrain(parentNodeId);
      addTimeline('project', `تم تنفيذ: ${taskLabel}`);

      // Show result in a small toast-like notification
      if (data.result) {
        setLivePanelTitle(`نتيجة: ${taskLabel}`);
        setLivePanelType('planning');
        setLivePanelContent('');
        setLivePanelFullContent(data.result);
        setLivePanelOpen(true);
        // Animate typing the result
        let idx = 0;
        const text = data.result;
        const interval = setInterval(() => {
          idx += Math.min(3, text.length - idx);
          setLivePanelContent(text.slice(0, idx));
          if (idx >= text.length) clearInterval(interval);
        }, 20);
      }
    } catch {
      // Show error
      setLivePanelTitle('خطأ في التنفيذ');
      setLivePanelType('planning');
      setLivePanelContent('❌ حدث خطأ أثناء تنفيذ المهمة. حاول مرة أخرى.');
      setLivePanelFullContent('❌ حدث خطأ أثناء تنفيذ المهمة. حاول مرة أخرى.');
      setLivePanelOpen(true);
    }
    setTaskExecuting(null);
  }, [feedBrain, addTimeline, updateAncestorProgress]);

  // ─── Execute All Tasks ──────────────────────────────────
  const executeAllTasks = useCallback(async (parentNodeId: string) => {
    const node = nodesRef.current.find(n => n.id === parentNodeId);
    if (!node) return;

    // Collect all pending tasks from this node and its children
    const pendingTasks: { taskId: string; taskLabel: string; parentNodeId: string }[] = [];

    // Tasks on this node itself
    (node.projectTasks || []).forEach(t => {
      if (t.status !== 'done') pendingTasks.push({ taskId: t.id, taskLabel: t.label, parentNodeId: node.id });
    });

    // Tasks on child nodes (phase -> task nodes)
    const children = nodesRef.current.filter(n => n.parentId === parentNodeId);
    children.forEach(cn => {
      (cn.projectTasks || []).forEach(t => {
        if (t.status !== 'done') pendingTasks.push({ taskId: t.id, taskLabel: t.label, parentNodeId: cn.id });
      });
    });

    if (pendingTasks.length === 0) return;

    // Open live panel for progress
    setLivePanelOpen(true);
    setLivePanelTitle(`تنفيذ الكل: ${node.label}`);
    setLivePanelType('planning');
    setLivePanelContent(`⏳ جاري تنفيذ ${pendingTasks.length} مهمة...\n\n`);
    setLivePanelFullContent('');

    let resultText = `تنفيذ ${pendingTasks.length} مهمة:\n\n`;
    for (const task of pendingTasks) {
      resultText += `▶️ تنفيذ: ${task.taskLabel}\n`;
      setLivePanelContent(resultText);
      await executeTask(task.taskId, task.taskLabel, task.parentNodeId);
      resultText += `  ✅ تم\n\n`;
      setLivePanelContent(resultText);
    }
    resultText += `\n🎉 تم تنفيذ جميع المهام!`;
    setLivePanelContent(resultText);
    setLivePanelFullContent(resultText);
  }, [executeTask]);

  // ─── 🔧 Code Generator (with Live Panel) ────────────────
  const generateProjectCode = useCallback(async (projectNode: MindNode) => {
    setCodeLoading(true);
    setCodeFiles([]);
    setSelectedCodeFile(null);

    // Open live panel
    setLivePanelOpen(true);
    setLivePanelTitle(projectNode.label || 'مشروع');
    setLivePanelType('code');
    setLivePanelContent('');
    setLivePanelFullContent('');

    const idea = projectNode.summary || projectNode.label;
    const phaseNodes = nodesRef.current.filter(n => n.parentId === projectNode.id);
    const phases = phaseNodes.map(pn => {
      const taskNodes = nodesRef.current.filter(n => n.parentId === pn.id);
      return {
        name: pn.label,
        description: pn.summary || '',
        tasks: taskNodes.map(tn => ({ label: tn.label, description: tn.summary || '' })),
      };
    });
    const flatTasks = projectNode.projectTasks || [];

    // Show initial message
    setLivePanelContent('⏳ جاري توليد هيكل المشروع...\n\n');
    setLivePanelFullContent('⏳ جاري توليد هيكل المشروع...\n\n');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-code', idea, phases, tasks: flatTasks }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.files?.length) {
        setCodeFiles(data.files);
        setSelectedCodeFile(data.files[0].path);
        // Build full content
        const fullText = data.files.map((f: { path: string; content: string }) =>
          `\n${'═'.repeat(50)}\n📄 ${f.path}\n${'═'.repeat(50)}\n\n${f.content}`
        ).join('\n');
        setLivePanelFullContent(fullText);
        // Animate typing each file
        let currentIdx = 0;
        let displayed = '';
        const typingInterval = setInterval(() => {
          const chunkSize = Math.min(8, fullText.length - currentIdx);
          if (chunkSize <= 0) { clearInterval(typingInterval); return; }
          currentIdx += chunkSize;
          displayed = fullText.slice(0, currentIdx);
          setLivePanelContent(displayed);
        }, 15);
      } else {
        setLivePanelContent('❌ لم يتم توليد كود. حاول مرة أخرى.');
        setLivePanelFullContent('❌ لم يتم توليد كود. حاول مرة أخرى.');
      }
    } catch (err) {
      console.error('generateProjectCode error:', err);
      const errMsg = '❌ خطأ في توليد الكود. حاول مرة أخرى.';
      setLivePanelContent(errMsg);
      setLivePanelFullContent(errMsg);
      setCodeFiles([]);
    }
    setCodeLoading(false);
  }, []);

  // ─── 🌐 Live Preview (with Live Panel) ────────────────
  const generateProjectPreview = useCallback(async (projectNode: MindNode) => {
    setPreviewLoading(true);
    setPreviewHtml('');

    // Open live panel
    setLivePanelOpen(true);
    setLivePanelTitle(projectNode.label || 'مشروع');
    setLivePanelType('preview');
    setLivePanelContent('⏳ جاري بناء المعاينة...\n\n');
    setLivePanelFullContent('');

    try {
      const idea = projectNode.summary || projectNode.label;
      const phaseNodes = nodesRef.current.filter(n => n.parentId === projectNode.id);
      const phases = phaseNodes.map(pn => {
        const taskNodes = nodesRef.current.filter(n => n.parentId === pn.id);
        return {
          name: pn.label,
          description: pn.summary || '',
          tasks: taskNodes.map(tn => ({ label: tn.label, description: tn.summary || '' })),
        };
      });
      const flatTasks = projectNode.projectTasks || [];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-preview', idea, phases, tasks: flatTasks }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.html) {
        setPreviewHtml(data.html);
        // Show HTML source in live panel with typing animation
        const fullText = data.html;
        setLivePanelFullContent(fullText);
        let currentIdx = 0;
        const typingInterval = setInterval(() => {
          const chunkSize = Math.min(12, fullText.length - currentIdx);
          if (chunkSize <= 0) { clearInterval(typingInterval); return; }
          currentIdx += chunkSize;
          setLivePanelContent(fullText.slice(0, currentIdx));
        }, 10);
      } else {
        setLivePanelContent('❌ لم يتم توليد معاينة.');
        setLivePanelFullContent('');
      }
    } catch (err) {
      console.error('generateProjectPreview error:', err);
      setLivePanelContent('❌ خطأ في توليد المعاينة. حاول مرة أخرى.');
      setLivePanelFullContent('');
      setPreviewHtml('');
    }
    setPreviewLoading(false);
  }, []);

  // ─── 📄 Project Report (with Live Panel) ──────────────
  const generateProjectReport = useCallback(async (projectNode: MindNode) => {
    setReportLoading(true);
    setReportData(null);

    // Open live panel
    setLivePanelOpen(true);
    setLivePanelTitle(projectNode.label || 'مشروع');
    setLivePanelType('report');
    setLivePanelContent('⏳ جاري توليد التقرير...\n\n');
    setLivePanelFullContent('');

    try {
      const idea = projectNode.summary || projectNode.label;
      const phaseNodes = nodesRef.current.filter(n => n.parentId === projectNode.id);
      const phases = phaseNodes.map(pn => {
        const taskNodes = nodesRef.current.filter(n => n.parentId === pn.id);
        return {
          name: pn.label,
          description: pn.summary || '',
          tasks: taskNodes.map(tn => ({ label: tn.label, description: tn.summary || '' })),
        };
      });
      const flatTasks = projectNode.projectTasks || [];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-report', idea, phases, tasks: flatTasks }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.report) {
        setReportData(data.report);
        // Build formatted report text
        const r = data.report;
        const parts: string[] = [];
        if (r.executiveSummary) parts.push(`📋 الملخص التنفيذي:\n${r.executiveSummary}`);
        if (r.requirements?.length) parts.push(`\n✅ المتطلبات:\n${r.requirements.map((x: string) => `  • ${x}`).join('\n')}`);
        if (r.techStack?.length) parts.push(`\n🛠️ التقنيات:\n${r.techStack.map((x: string) => `  • ${x}`).join('\n')}`);
        if (r.architecture) parts.push(`\n🏗️ البنية التقنية:\n${r.architecture}`);
        if (r.timeline) parts.push(`\n📅 الجدول الزمني:\n${r.timeline}`);
        if (r.risks?.length) parts.push(`\n⚠️ المخاطر:\n${r.risks.map((x: string) => `  • ${x}`).join('\n')}`);
        if (r.recommendations?.length) parts.push(`\n💡 التوصيات:\n${r.recommendations.map((x: string) => `  • ${x}`).join('\n')}`);
        const fullText = parts.join('\n\n');
        setLivePanelFullContent(fullText);
        // Animate typing
        let currentIdx = 0;
        const typingInterval = setInterval(() => {
          const chunkSize = Math.min(4, fullText.length - currentIdx);
          if (chunkSize <= 0) { clearInterval(typingInterval); return; }
          currentIdx += chunkSize;
          setLivePanelContent(fullText.slice(0, currentIdx));
        }, 18);
      } else {
        setLivePanelContent('❌ لم يتم توليد تقرير.');
        setLivePanelFullContent('');
      }
    } catch (err) {
      console.error('generateProjectReport error:', err);
      setLivePanelContent('❌ خطأ في توليد التقرير. حاول مرة أخرى.');
      setLivePanelFullContent('');
      setReportData(null);
    }
    setReportLoading(false);
  }, []);

  // ─── 🧠 Auto-Learn ────────────────────────────────────
  const autoLearn = useCallback(async () => {
    setAutoLearnLoading(true);
    try {
      const nodeData = nodesRef.current.map(n => ({ label: n.label, tag: n.tag, summary: n.summary, isBrain: n.isBrain }));
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto-learn', nodes: nodeData, brainKnowledge: brainStats.totalKnowledge }),
      });
      const data: AutoLearnResult = await res.json();
      if (data.newNodes?.length) {
        pushHistory();
        const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
        if (brain) {
          const newNodes: MindNode[] = [];
          const newEdges: MindEdge[] = [];
          data.newNodes.forEach((sn, i) => {
            const angle = (i / data.newNodes.length) * Math.PI * 2 - Math.PI / 2;
            const dist = 250 + Math.random() * 80;
            newNodes.push(makeNode({
              id: nid(), label: sn.label, tag: sn.tag, summary: sn.summary,
              x: brain.x + Math.cos(angle) * dist, y: brain.y + Math.sin(angle) * dist,
              depth: 1, parentId: BRAIN_ID, connections: [BRAIN_ID], color: '#a78bfa',
              knowledgeLevel: 10,
            }));
            newEdges.push({ id: eid(), from: BRAIN_ID, to: newNodes[newNodes.length - 1].id, type: 'learning', strength: 0.5, animated: true, createdAt: Date.now() });
          });
          // Create links
          if (data.newLinks) {
            data.newLinks.forEach(link => {
              const fromN = nodesRef.current.find(n => n.label === link.fromLabel) || newNodes.find(n => n.label === link.fromLabel);
              const toN = nodesRef.current.find(n => n.label === link.toLabel) || newNodes.find(n => n.label === link.toLabel);
              if (fromN && toN) {
                newEdges.push({ id: eid(), from: fromN.id, to: toN.id, type: 'learning', strength: 0.4, animated: true, createdAt: Date.now() });
              }
            });
          }
          setNodes(prev => [...prev, ...newNodes]); setEdges(prev => [...prev, ...newEdges]);
          setBrainStats(prev => ({ ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length }));
          setTimeout(() => { newNodes.forEach((n, i) => { setTimeout(() => feedBrain(n.id), i * 150); }); }, 200);
        }
      }
      setAutoLearnInsights(data.insights || []);
      addTimeline('auto-learn', 'تعلم ذاتي: عقد وروابط جديدة');
      sounds.aiInsight();
    } catch { /* */ }
    setAutoLearnLoading(false);
  }, [brainStats.totalKnowledge, feedBrain, addTimeline, pushHistory]);

  // Auto-learn timer
  useEffect(() => {
    if (!autoLearnActive) return;
    const interval = setInterval(() => { autoLearn(); }, 120000);
    return () => clearInterval(interval);
  }, [autoLearnActive, autoLearn]);

  // ─── 🎓 Learning Path ─────────────────────────────────
  const generateLearningPath = useCallback(async () => {
    setAiLoading(true);
    try {
      const nodeData = nodesRef.current.filter(n => !n.isBrain).map(n => ({ label: n.label, tag: n.tag, summary: n.summary, knowledgeLevel: n.knowledgeLevel }));
      const res = await fetch('/api/brain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ask', nodes: nodeData, question: 'اقترح مساراً تعليمياً مثالياً لفهم هذه المواضيع بالترتيب. اذكر أسماء العقد بالترتيب فقط مفصولة بـ |' }),
      });
      const data = await res.json();
      if (data.answer) {
        const path = data.answer.split('|').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        setLearningPath(path);
      }
    } catch { /* */ }
    setAiLoading(false);
  }, []);

  // ─── 🏆 Achievements ──────────────────────────────────
  const checkAchievements = useCallback(() => {
    const currentStats = brainStats;
    const currentNodes = nodesRef.current;
    ACHIEVEMENTS.forEach(ach => {
      if (unlockedAchievements.includes(ach.id)) return;
      try {
        if (ach.condition(currentStats, currentNodes)) {
          setUnlockedAchievements(prev => [...prev, ach.id]);
          setAchievementToast(ach);
          sounds.levelUp();
          setTimeout(() => setAchievementToast(null), 4000);
        }
      } catch { /* */ }
    });
  }, [brainStats, unlockedAchievements]);

  useEffect(() => { checkAchievements(); }, [checkAchievements]);

  // ─── Export PNG ────────────────────────────────────────
  const exportPNG = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const link = document.createElement('a');
      link.download = `mindflow_${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch { /* */ }
  }, []);

  // ─── Export/Import JSON ────────────────────────────────
  const exportJSON = useCallback(() => {
    try {
      const data = { nodes: nodesRef.current, edges: edgesRef.current, brainStats, exploredTopics, unlockedAchievements };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.download = `mindflow_${Date.now()}.json`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch { /* */ }
  }, [brainStats, exploredTopics, unlockedAchievements]);

  const importJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.nodes && data.edges) {
            pushHistory();
            setNodes(data.nodes); setEdges(data.edges);
            if (data.brainStats) setBrainStats(data.brainStats);
            if (data.exploredTopics) setExploredTopics(data.exploredTopics);
            if (data.unlockedAchievements) setUnlockedAchievements(data.unlockedAchievements);
          }
        } catch { /* */ }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [pushHistory]);

  // ─── Keyboard Shortcuts ────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'f' || e.key === 'F' || e.key === 'ب') { e.preventDefault(); searchInputRef.current?.focus(); }
      if (e.key === 'a' || e.key === 'A' || e.key === 'ش') { e.preventDefault(); setAddDialogOpen(true); }
      if (e.key === 's' || e.key === 'S' || e.key === 'س') { e.preventDefault(); setShowStats(prev => !prev); }
      if (e.key === 'Delete') {
        if (selectedNode && selectedNode.id !== BRAIN_ID) { deleteNode(selectedNode.id); }
        else if (selectedNodeIds.size > 0) { selectedNodeIds.forEach(id => deleteNode(id)); }
      }
      if (e.key === 'Escape') {
        setSelectedNode(null); setSelectedNodeIds(new Set());
        setConnectMode(false); setConnectFrom(null);
        setAiPanelOpen(false); setQuizOpen(false);
        setProjectPanelNode(null); setShowFilterPanel(false);
        setSearchActive(false); setHighlightedNodes(new Set());
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedNode, selectedNodeIds, deleteNode, undo, redo]);

  // ─── Virtual Rendering Check ───────────────────────────
  const isNodeInViewport = useCallback((node: MindNode, vp: { x: number; y: number; scale: number }, W: number, H: number) => {
    const margin = 100;
    const sx = node.x * vp.scale + vp.x;
    const sy = node.y * vp.scale + vp.y;
    const r = (node.isBrain ? 55 : node.isProject ? 45 : 32) * vp.scale + margin;
    return sx + r > 0 && sx - r < W && sy + r > 0 && sy - r < H;
  }, []);

  // ─── Canvas Render ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const mmCanvas = minimapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mmCtx = mmCanvas?.getContext('2d') ?? null;

    function render() {
      if (!ctx || !canvas) return;
      timeRef.current += 0.016;
      const t = timeRef.current;

      // Smooth camera animation
      const cam = cameraTargetRef.current;
      if (cam.animating) {
        const elapsed = performance.now() - cam.startTime;
        const progress = Math.min(1, elapsed / cam.duration);
        const ease = 1 - Math.pow(1 - progress, 3); // ease out cubic
        viewportRef.current.x = cam.fromX + (cam.x - cam.fromX) * ease;
        viewportRef.current.y = cam.fromY + (cam.y - cam.fromY) * ease;
        viewportRef.current.scale = cam.fromScale + (cam.scale - cam.fromScale) * ease;
        if (progress >= 1) cam.animating = false;
      }

      const vp = viewportRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const isDark = theme === 'dark';
      const filteredIds = getFilteredNodeIds();

      ctx.clearRect(0, 0, W, H);

      // Background
      if (isDark) {
        ctx.fillStyle = '#050508';
      } else {
        ctx.fillStyle = '#f0f0f5';
      }
      ctx.fillRect(0, 0, W, H);

      // Background grid
      ctx.save();
      ctx.translate(vp.x % (48 * vp.scale), vp.y % (48 * vp.scale));
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W + 48 * vp.scale; x += 48 * vp.scale) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H + 48 * vp.scale; y += 48 * vp.scale) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();

      // BG glow
      if (isDark) {
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
        grad.addColorStop(0, 'rgba(0, 255, 224, 0.04)');
        grad.addColorStop(0.5, 'rgba(255, 60, 172, 0.02)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.save();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.scale, vp.scale);

      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;

      // Node map for fast lookup
      const nodeMap = new Map<string, MindNode>();
      currentNodes.forEach(n => nodeMap.set(n.id, n));

      // ─── Draw Edges ────────────────────────────────
      currentEdges.forEach(edge => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return;
        if (filteredIds && (!filteredIds.has(from.id) || !filteredIds.has(to.id))) return;
        // Virtual: skip if both endpoints are off-screen
        if (!isNodeInViewport(from, vp, W, H) && !isNodeInViewport(to, vp, W, H)) return;

        const fromR = from.isBrain ? 55 : from.isProject ? 45 : 32;
        const toR = to.isBrain ? 55 : to.isProject ? 45 : 32;
        const dx = to.x - from.x; const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const nx = dx / dist; const ny = dy / dist;
        const sx = from.x + nx * fromR; const sy = from.y + ny * fromR;
        const ex = to.x - nx * toR; const ey = to.y - ny * toR;
        const mx = (sx + ex) / 2; const my = (sy + ey) / 2 - 20;

        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey);

        const alpha = isDark ? 1 : 0.7;
        if (edge.type === 'feed') {
          const g = ctx.createLinearGradient(sx, sy, ex, ey);
          g.addColorStop(0, `rgba(245, 196, 0, ${0.6 * alpha})`); g.addColorStop(1, `rgba(0, 255, 224, ${0.4 * alpha})`);
          ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([]);
        } else if (edge.type === 'alliance') {
          const g = ctx.createLinearGradient(sx, sy, ex, ey);
          g.addColorStop(0, `rgba(245, 196, 0, ${0.5 * alpha})`); g.addColorStop(1, `rgba(167, 139, 250, ${0.5 * alpha})`);
          ctx.strokeStyle = g; ctx.lineWidth = 2.5; ctx.setLineDash([]);
        } else if (edge.type === 'ai-link' || edge.type === 'learning') {
          ctx.strokeStyle = `rgba(167, 139, 250, ${0.35 * alpha})`; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
        } else if (edge.type === 'project') {
          const g = ctx.createLinearGradient(sx, sy, ex, ey);
          g.addColorStop(0, `rgba(245, 158, 11, ${0.6 * alpha})`); g.addColorStop(1, `rgba(52, 211, 153, ${0.4 * alpha})`);
          ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([]);
        } else if (edge.type === 'cross-link') {
          ctx.strokeStyle = `rgba(255, 107, 157, ${(0.15 + edge.strength * 0.25) * alpha})`; ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
        } else {
          const g = ctx.createLinearGradient(sx, sy, ex, ey);
          g.addColorStop(0, `rgba(0, 255, 224, ${0.4 * alpha})`); g.addColorStop(1, `rgba(167, 139, 250, ${0.3 * alpha})`);
          ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
        }
        ctx.stroke(); ctx.setLineDash([]);

        // Animated dot (flow particle)
        if (edge.animated || edge.type === 'feed' || edge.type === 'alliance' || edge.type === 'project') {
          const progress = ((t * 0.3 + edge.strength) % 1);
          const qx = (1 - progress) ** 2 * sx + 2 * (1 - progress) * progress * mx + progress ** 2 * ex;
          const qy = (1 - progress) ** 2 * sy + 2 * (1 - progress) * progress * my + progress ** 2 * ey;
          ctx.beginPath(); ctx.arc(qx, qy, edge.type === 'feed' ? 3 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle = edge.type === 'feed' ? '#f5c400' : edge.type === 'alliance' ? '#a78bfa' : edge.type === 'project' ? '#f59e0b' : '#ff6b9d';
          ctx.fill();

          // Second flow particle offset
          const progress2 = ((t * 0.3 + edge.strength + 0.5) % 1);
          const qx2 = (1 - progress2) ** 2 * sx + 2 * (1 - progress2) * progress2 * mx + progress2 ** 2 * ex;
          const qy2 = (1 - progress2) ** 2 * sy + 2 * (1 - progress2) * progress2 * my + progress2 ** 2 * ey;
          ctx.beginPath(); ctx.arc(qx2, qy2, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = edge.type === 'feed' ? 'rgba(245,196,0,0.5)' : edge.type === 'alliance' ? 'rgba(167,139,250,0.5)' : 'rgba(255,107,157,0.5)';
          ctx.fill();
        }
      });

      // ─── Feed Particles ────────────────────────────
      const remainingP: FeedParticle[] = [];
      particlesRef.current.forEach(p => {
        p.progress += p.speed;
        if (p.progress >= 1) return;
        const x = p.x + (p.targetX - p.x) * p.progress;
        const y = p.y + (p.targetY - p.y) * p.progress;
        const alpha = 1 - p.progress;
        const size = p.size * (1 - p.progress * 0.5);
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
        glow.addColorStop(0, p.color + Math.round(alpha * 80).toString(16).padStart(2, '0'));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow; ctx.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
        remainingP.push(p);
      });
      particlesRef.current = remainingP;

      // ─── Draw Nodes ────────────────────────────────
      currentNodes.forEach(node => {
        if (filteredIds && !filteredIds.has(node.id)) return;
        if (!isNodeInViewport(node, vp, W, H)) return;

        // Entry animation scale
        const animScale = node.enterAnim < 1 ? 0.3 + node.enterAnim * 0.7 * (1 + Math.sin(node.enterAnim * Math.PI) * 0.15) : 1;
        const isBrain = node.isBrain;
        const isProj = node.isProject;
        const isSelected = selectedNode?.id === node.id || selectedNodeIds.has(node.id);
        const isHighlighted = highlightedNodes.has(node.id);
        const isSearchDimmed = searchActive && !isBrain && !isHighlighted;
        const baseRadius = isBrain ? 40 + Math.sin(t * 2) * 5 + Math.min(20, brainStats.totalKnowledge / 50) : isProj ? 38 : 25 + node.knowledgeLevel / 10;
        const radius = baseRadius * animScale;

        // Heatmap glow
        if (viewMode === 'heatmap' && !isBrain) {
          const heat = node.connections.length / 5;
          if (heat > 0) {
            const heatGlow = ctx.createRadialGradient(node.x, node.y, radius, node.x, node.y, radius + heat * 30);
            heatGlow.addColorStop(0, `rgba(255, 60, 172, ${Math.min(0.3, heat * 0.1)})`);
            heatGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = heatGlow;
            ctx.fillRect(node.x - radius - 40, node.y - radius - 40, (radius + 40) * 2, (radius + 40) * 2);
          }
        }

        // Brain glow
        if (isBrain) {
          const pulse = 1 + Math.sin(t * 1.5) * 0.08;
          for (let ring = 3; ring >= 0; ring--) {
            ctx.beginPath(); ctx.arc(node.x, node.y, radius * pulse + ring * 15, 0, Math.PI * 2);
            ctx.strokeStyle = isDark ? `rgba(245, 196, 0, ${0.06 - ring * 0.012})` : `rgba(180, 140, 0, ${0.08 - ring * 0.015})`;
            ctx.lineWidth = 1.5; ctx.stroke();
          }
        }

        // Project glow
        if (isProj) {
          const pulse = 1 + Math.sin(t * 2) * 0.06;
          ctx.beginPath(); ctx.arc(node.x, node.y, radius * pulse + 10, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)'; ctx.lineWidth = 2; ctx.stroke();
        }

        // Dormant overlay
        if (node.dormant) {
          ctx.beginPath(); ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(107, 114, 128, 0.4)'; ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        }

        // Body
        ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        const bodyG = ctx.createRadialGradient(node.x - radius * 0.3, node.y - radius * 0.3, 0, node.x, node.y, radius);
        if (isDark) {
          bodyG.addColorStop(0, isBrain ? 'rgba(40, 35, 10, 0.95)' : isProj ? 'rgba(40, 30, 5, 0.95)' : 'rgba(10, 10, 20, 0.92)');
          bodyG.addColorStop(1, isBrain ? 'rgba(20, 18, 5, 0.95)' : isProj ? 'rgba(25, 18, 3, 0.95)' : 'rgba(5, 5, 12, 0.92)');
        } else {
          bodyG.addColorStop(0, isBrain ? 'rgba(255, 250, 220, 0.95)' : isProj ? 'rgba(255, 245, 210, 0.95)' : 'rgba(240, 240, 250, 0.92)');
          bodyG.addColorStop(1, isBrain ? 'rgba(250, 240, 190, 0.95)' : isProj ? 'rgba(250, 235, 190, 0.95)' : 'rgba(230, 230, 245, 0.92)');
        }
        ctx.fillStyle = bodyG; ctx.fill();

        // Dim overlay for search
        if (isSearchDimmed) {
          ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? 'rgba(5, 5, 8, 0.7)' : 'rgba(200, 200, 210, 0.7)';
          ctx.fill();
        }

        // Border
        ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        if (isBrain) { ctx.strokeStyle = `rgba(245, 196, 0, ${0.5 + Math.sin(t * 2) * 0.2})`; ctx.lineWidth = 2.5; }
        else if (isSelected) { ctx.strokeStyle = 'rgba(0, 255, 224, 0.8)'; ctx.lineWidth = 2.5; }
        else if (isHighlighted) { ctx.strokeStyle = 'rgba(0, 255, 224, 0.7)'; ctx.lineWidth = 2.5; }
        else if (node.dormant) { ctx.strokeStyle = 'rgba(107, 114, 128, 0.3)'; ctx.lineWidth = 1; }
        else if (isProj) { ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)'; ctx.lineWidth = 2; }
        else if (node.isCustom) { ctx.strokeStyle = 'rgba(255, 107, 157, 0.5)'; ctx.lineWidth = 1.5; }
        else { ctx.strokeStyle = node.color + '60'; ctx.lineWidth = 1.5; }
        ctx.stroke();

        // Maturity ring
        if (!isBrain) {
          const mColor = getMaturityColor(node.maturity);
          ctx.beginPath(); ctx.arc(node.x, node.y, radius + 4, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * node.knowledgeLevel / 100));
          ctx.strokeStyle = mColor + '80'; ctx.lineWidth = 2; ctx.stroke();
        }

        // Brain inner rings
        if (isBrain) {
          ctx.beginPath(); ctx.arc(node.x, node.y, radius * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 196, 0, 0.15)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.arc(node.x, node.y, radius * 0.3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 196, 0, 0.1)'; ctx.lineWidth = 1; ctx.stroke();
          for (let i = 0; i < 4; i++) {
            const a = t * 0.8 + i * Math.PI / 2;
            ctx.beginPath(); ctx.arc(node.x + Math.cos(a) * radius * 0.75, node.y + Math.sin(a) * radius * 0.75, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 196, 0, 0.6)'; ctx.fill();
          }
        }

        // Project progress bar
        if (isProj && node.projectProgress > 0) {
          const barW = radius * 1.6; const barH = 4;
          const barX = node.x - barW / 2; const barY = node.y + radius + 8;
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = node.projectProgress === 100 ? '#34d399' : '#f59e0b';
          ctx.fillRect(barX, barY, barW * node.projectProgress / 100, barH);
        }

        // Label
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const textCol = isDark ? '#e8e8f0' : '#1a1a2e';
        if (isBrain) {
          ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#f5c400';
          ctx.fillText('🧠', node.x, node.y - 6);
          ctx.font = 'bold 13px sans-serif'; ctx.fillText('العقل', node.x, node.y + 14);
        } else if (isProj) {
          ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#f59e0b';
          const maxLen = 12;
          ctx.fillText(node.label.length > maxLen ? node.label.slice(0, maxLen) + '..' : node.label, node.x, node.y - 8);
          ctx.font = '9px sans-serif'; ctx.fillStyle = textCol + '80';
          ctx.fillText(`${node.projectPhase === 'done' ? '✅' : '🚀'} ${node.projectProgress}%`, node.x, node.y + 8);
        } else {
          const maxLen = radius < 30 ? 10 : 14;
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = node.dormant ? 'rgba(107,114,128,0.6)' : isHighlighted ? '#00ffe0' : node.isCustom ? '#ff6b9d' : node.color;
          ctx.fillText(node.label.length > maxLen ? node.label.slice(0, maxLen) + '..' : node.label, node.x, node.y - 6);
          ctx.font = '9px sans-serif';
          ctx.fillStyle = isDark ? 'rgba(232, 232, 240, 0.3)' : 'rgba(30, 30, 50, 0.3)';
          ctx.fillText(`${getMaturityEmoji(node.maturity)} ${node.tag}`, node.x, node.y + 10);
        }

        // Selection / connect highlight
        if (isSelected) {
          ctx.beginPath(); ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 255, 224, 0.3)'; ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        }
        if (connectMode && connectFrom && node.id !== connectFrom && !node.isBrain) {
          ctx.beginPath(); ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 107, 157, 0.4)'; ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        }
      });

      // Selection rectangle
      if (selectionRef.current.active) {
        const sel = selectionRef.current;
        const sx1 = Math.min(sel.startX, sel.endX); const sy1 = Math.min(sel.startY, sel.endY);
        const sw = Math.abs(sel.endX - sel.startX); const sh = Math.abs(sel.endY - sel.startY);
        // Convert from screen to world
        const wx1 = (sx1 - vp.x) / vp.scale; const wy1 = (sy1 - vp.y) / vp.scale;
        const ww = sw / vp.scale; const wh = sh / vp.scale;
        ctx.strokeStyle = 'rgba(0, 255, 224, 0.5)'; ctx.lineWidth = 1 / vp.scale;
        ctx.setLineDash([4 / vp.scale, 4 / vp.scale]);
        ctx.strokeRect(wx1, wy1, ww, wh);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0, 255, 224, 0.05)'; ctx.fillRect(wx1, wy1, ww, wh);
      }

      ctx.restore();

      // ─── Minimap ────────────────────────────────────
      if (mmCtx && mmCanvas) {
        const mw = mmCanvas.width; const mh = mmCanvas.height;
        mmCtx.clearRect(0, 0, mw, mh);
        mmCtx.fillStyle = isDark ? 'rgba(5,5,8,0.85)' : 'rgba(240,240,245,0.85)';
        mmCtx.fillRect(0, 0, mw, mh);

        // Find bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        currentNodes.forEach(n => {
          minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y);
        });
        const pad = 100;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        const worldW = maxX - minX || 1; const worldH = maxY - minY || 1;
        const mmScale = Math.min(mw / worldW, mh / worldH);

        currentNodes.forEach(node => {
          const mx = (node.x - minX) * mmScale;
          const my = (node.y - minY) * mmScale;
          const mr = Math.max(1.5, (node.isBrain ? 5 : node.isProject ? 4 : 2.5) * mmScale);
          mmCtx.beginPath(); mmCtx.arc(mx, my, mr, 0, Math.PI * 2);
          mmCtx.fillStyle = node.isBrain ? '#f5c400' : node.isProject ? '#f59e0b' : node.color + '80';
          mmCtx.fill();
        });

        // Viewport rect
        const vpLeft = (-vp.x / vp.scale - minX) * mmScale;
        const vpTop = (-vp.y / vp.scale - minY) * mmScale;
        const vpW = (W / vp.scale) * mmScale;
        const vpH = (H / vp.scale) * mmScale;
        mmCtx.strokeStyle = 'rgba(0, 255, 224, 0.6)'; mmCtx.lineWidth = 1;
        mmCtx.strokeRect(vpLeft, vpTop, vpW, vpH);
      }

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [selectedNode, brainStats.totalKnowledge, connectMode, connectFrom, highlightedNodes, searchActive, viewMode, filterState, getFilteredNodeIds, theme, selectedNodeIds, isNodeInViewport]);

  // ─── Node click handler (shared logic) ────────────────────
  const handleNodeClick = useCallback((hitNode: MindNode) => {
    // Visual feedback
    setClickFeedback({ x: hitNode.x, y: hitNode.y, label: hitNode.label });
    setTimeout(() => setClickFeedback(null), 800);

    if (connectMode && connectFrom) {
      if (hitNode.id !== connectFrom && !hitNode.isBrain) {
        connectNodes(connectFrom, hitNode.id);
        setConnectMode(false); setConnectFrom(null);
      }
      return;
    }
    setSelectedNode({...hitNode});
    setSelectedNodeIds(new Set([hitNode.id]));
    // Open project panel for project nodes, phase nodes, or nodes with children/tasks
    const isProjectNode = hitNode.isProject || hitNode.tag === 'مشروع' || hitNode.tag === 'مرحلة' || (hitNode.projectTasks && hitNode.projectTasks.length > 0);
    const hasChildrenNodes = nodesRef.current.some(n => n.parentId === hitNode.id);
    if (isProjectNode || hasChildrenNodes) {
      if (!hitNode.isProject && hitNode.tag !== 'مرحلة') {
        setNodes(prev => prev.map(n => n.id === hitNode.id ? { ...n, isProject: true, tag: n.tag || 'مشروع' } : n));
      }
      setProjectPanelNode({...hitNode, isProject: hitNode.isProject || hitNode.tag === 'مشروع', tag: hitNode.tag || 'مشروع'});
    } else {
      setProjectPanelNode(null);
    }
    sounds.searchFound();
  }, [connectMode, connectFrom, connectNodes]);

  // ─── Mouse/Touch Handlers (React events + minimal addEventListener) ──
  // Track tap/drag state in refs so they persist across re-renders
  const tapRef = useRef<{ nodeId: string | null; isDragging: boolean }>({ nodeId: null, isDragging: false });

  // Canvas pointer DOWN
  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    tapRef.current = { nodeId: null, isDragging: false };

    const hit = findNodeAt(sx, sy);
    if (hit) {
      tapRef.current.nodeId = hit.id;
      dragRef.current = { nodeId: hit.id, startX: sx, startY: sy, nodeStartX: hit.x, nodeStartY: hit.y, moved: false };
    } else {
      if (e.shiftKey) {
        selectionRef.current = { active: true, startX: sx, startY: sy, endX: sx, endY: sy };
      } else {
        panRef.current = { active: true, startX: sx, startY: sy, vpStartX: viewportRef.current.x, vpStartY: viewportRef.current.y };
      }
    }
  }, [findNodeAt]);

  // Canvas pointer MOVE
  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragRef.current.nodeId) {
      const dx = sx - dragRef.current.startX;
      const dy = sy - dragRef.current.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        dragRef.current.moved = true;
        tapRef.current.isDragging = true;
        tapRef.current.nodeId = null;
      }
      if (dragRef.current.moved) {
        const vp = viewportRef.current;
        setNodes(prev => prev.map(n => n.id === dragRef.current.nodeId ? { ...n, x: dragRef.current.nodeStartX + dx / vp.scale, y: dragRef.current.nodeStartY + dy / vp.scale } : n));
      }
    } else if (selectionRef.current.active) {
      selectionRef.current.endX = sx; selectionRef.current.endY = sy;
    } else if (panRef.current.active) {
      const dx = sx - panRef.current.startX;
      const dy = sy - panRef.current.startY;
      viewportRef.current.x = panRef.current.vpStartX + dx;
      viewportRef.current.y = panRef.current.vpStartY + dy;
    }
  }, []);

  // Canvas pointer UP — handles node clicks, multi-select, and empty space taps
  // This is the PRIMARY click handler — we detect clicks here instead of relying on onClick,
  // because pointer events are more reliable on mobile/touch and don't have the
  // moved-flag race condition that onClick has.
  const onCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Multi-select
    if (selectionRef.current.active) {
      const sel = selectionRef.current;
      const vp = viewportRef.current;
      const wx1 = Math.min(sel.startX, sel.endX); const wy1 = Math.min(sel.startY, sel.endY);
      const wx2 = Math.max(sel.startX, sel.endX); const wy2 = Math.max(sel.startY, sel.endY);
      const worldX1 = (wx1 - vp.x) / vp.scale; const worldY1 = (wy1 - vp.y) / vp.scale;
      const worldX2 = (wx2 - vp.x) / vp.scale; const worldY2 = (wy2 - vp.y) / vp.scale;
      const selected = new Set<string>();
      nodesRef.current.forEach(n => {
        if (n.x >= worldX1 && n.x <= worldX2 && n.y >= worldY1 && n.y <= worldY2 && !n.isBrain) {
          selected.add(n.id);
        }
      });
      setSelectedNodeIds(selected);
      selectionRef.current = { active: false, startX: 0, startY: 0, endX: 0, endY: 0 };
      cleanupDrag();
      return;
    }

    // Node click — if we had a node on pointerdown and didn't drag, it's a click
    const wasNodeTap = tapRef.current.nodeId && !tapRef.current.isDragging;
    if (wasNodeTap) {
      const nodeId = tapRef.current.nodeId!;
      const hitNode = nodesRef.current.find(n => n.id === nodeId);
      if (hitNode) {
        handleNodeClick(hitNode);
      }
    } else if (!tapRef.current.isDragging && panRef.current.active) {
      // Empty space tap — deselect
      setSelectedNode(null);
      setSelectedNodeIds(new Set());
      setProjectPanelNode(null);
    }

    cleanupDrag();
  }, [handleNodeClick]);

  // Canvas CLICK — backup handler (clicks are primarily handled in pointerup)
  // This catches any edge cases where pointerup didn't fire properly.
  // We skip it if pointerup already handled the click (tapRef.nodeId was consumed).
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // If tapRef still has a nodeId, pointerup didn't fire — handle click here as fallback
    // But normally pointerup already consumed the tap, so we just handle empty-space deselection
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = findNodeAt(sx, sy);
    if (hit && !dragRef.current.moved) {
      // Double-check: only fire if selectedNode isn't already this node
      // (pointerup may have already handled it)
      if (!selectedNode || selectedNode.id !== hit.id) {
        handleNodeClick(hit);
      }
    } else if (!hit && !dragRef.current.moved) {
      setSelectedNode(null);
      setSelectedNodeIds(new Set());
      setProjectPanelNode(null);
    }
    // Reset drag moved flag
    dragRef.current.moved = false;
  }, [findNodeAt, handleNodeClick, selectedNode]);

  // Canvas double click
  const onCanvasDblClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = findNodeAt(sx, sy);
    if (hit) {
      if (hit.hasChildren || hit.childrenData?.length) {
        expandNode(hit.id);
      } else {
        feedBrain(hit.id);
      }
    } else {
      setAddDialogOpen(true);
    }
  }, [findNodeAt, expandNode, feedBrain]);

  function cleanupDrag() {
    dragRef.current = { nodeId: null, startX: 0, startY: 0, nodeStartX: 0, nodeStartY: 0, moved: false };
    panRef.current = { active: false, startX: 0, startY: 0, vpStartX: 0, vpStartY: 0 };
    tapRef.current = { nodeId: null, isDragging: false };
  }

  // Wheel zoom and touch prevention — need addEventListener for non-passive
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
      const vp = viewportRef.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.2, Math.min(5, vp.scale * delta));
      const wx = (sx - vp.x) / vp.scale; const wy = (sy - vp.y) / vp.scale;
      vp.x = sx - wx * newScale; vp.y = sy - wy * newScale;
      vp.scale = newScale;
    }

    const preventTouch = (e: TouchEvent) => { e.preventDefault(); };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', preventTouch, { passive: false });
    canvas.addEventListener('touchmove', preventTouch, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', preventTouch);
      canvas.removeEventListener('touchmove', preventTouch);
    };
  }, []);

  // ─── Minimap Click ─────────────────────────────────────
  const onMinimapClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const mmCanvas = minimapCanvasRef.current;
    if (!mmCanvas) return;
    const rect = mmCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    const currentNodes = nodesRef.current;
    if (currentNodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    currentNodes.forEach(n => { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); });
    const pad = 100; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const worldW = maxX - minX || 1; const worldH = maxY - minY || 1;
    const mmScale = Math.min(mmCanvas.width / worldW, mmCanvas.height / worldH);
    const worldX = mx / mmScale + minX; const worldY = my / mmScale + minY;
    const vp = viewportRef.current;
    cameraTargetRef.current = {
      x: -worldX * vp.scale + window.innerWidth / 2,
      y: -worldY * vp.scale + window.innerHeight / 2,
      scale: vp.scale,
      animating: true, startTime: performance.now(), duration: 300,
      fromX: vp.x, fromY: vp.y, fromScale: vp.scale,
    };
  }, []);

  // ─── Theme toggle ──────────────────────────────────────
  const toggleTheme = useCallback(() => { setTheme(prev => prev === 'dark' ? 'light' : 'dark'); }, []);

  // ─── Sound toggle ──────────────────────────────────────
  const toggleSound = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    setMutedGlobal(newMuted);
    toggleMute();
  }, [muted]);

  // ─── Topic pills ───────────────────────────────────────
  const topicKeys = Object.keys(KNOWLEDGE_BASE);

  // ─── JSX ───────────────────────────────────────────────
  // Don't render canvas until mounted — prevents hydration mismatch (React error #418)
  if (!mounted) {
    return (
      <div className="w-screen h-screen flex items-center justify-center" style={{ background: '#050508' }}>
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🧠</div>
          <div className="text-yellow-400/70 text-sm">جاري تحميل العقل...</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-screen h-screen overflow-hidden" style={{ background: theme === 'dark' ? '#050508' : '#f0f0f5', pointerEvents: 'none' }}>
      {/* Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
        style={{ touchAction: 'none', cursor: 'pointer', pointerEvents: 'auto' }}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
        onClick={onCanvasClick}
        onDoubleClick={onCanvasDblClick}
      />

      {/* ─── Top Bar ──────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 py-2 flex-wrap pointer-events-auto" style={{ background: theme === 'dark' ? 'rgba(5,5,8,0.85)' : 'rgba(240,240,245,0.9)', backdropFilter: 'blur(10px)', borderBottom: theme === 'dark' ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.08)' }}>
        {/* Logo */}
        <div className="flex items-center gap-1.5 mr-2">
          <span className="text-lg">🧠</span>
          <span className={`text-sm font-bold ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'}`}>MindFlow</span>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Input ref={searchInputRef} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); performSearch(e.target.value); }}
            placeholder="🔍 ابحث..." className={`h-8 text-xs ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-black/5 border-black/10 text-black'}`}
            onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); performSearch(''); (e.target as HTMLInputElement).blur(); } }}
          />
          {searchActive && searchResults.length > 0 && (
            <div className={`absolute top-full mt-1 left-0 right-0 rounded-lg border max-h-48 overflow-y-auto z-50 pointer-events-auto ${theme === 'dark' ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
              {searchResults.slice(0, 8).map(n => (
                <button key={n.id} className={`w-full text-right px-3 py-1.5 text-xs hover:bg-white/10 flex items-center gap-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}
                  onClick={() => { navigateToNode(n.id); setSelectedNode(n); }}>
                  <span style={{ color: n.color }}>●</span> {n.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Topic pills */}
        <div className="flex gap-1 flex-wrap">
          {topicKeys.filter(k => !exploredTopics.includes(k)).map(k => (
            <button key={k} onClick={() => expandTopic(k)}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-all hover:scale-105"
              style={{ background: TOPIC_COLORS[k] + '20', color: TOPIC_COLORS[k], border: `1px solid ${TOPIC_COLORS[k]}40` }}>
              {KNOWLEDGE_BASE[k].emoji} {k}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 items-center mr-2">
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={() => setAddDialogOpen(true)}>➕ عقدة</Button>
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={() => setIdeaDialogOpen(true)}>💡 فكرة</Button>
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={() => setAiPanelOpen(true)}>🤖 AI</Button>
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={generateQuiz}>🎓 تعلّم</Button>
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={() => setViewMode(prev => prev === 'heatmap' ? 'normal' : 'heatmap')}>
            {viewMode === 'heatmap' ? '🔥' : '🌐'}
          </Button>
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</Button>
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={toggleSound}>{muted ? '🔇' : '🔊'}</Button>
          <Button size="sm" variant="ghost" className={`h-7 text-xs px-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'}`} onClick={() => setShowStats(prev => !prev)}>📊</Button>
        </div>
      </div>

      {/* ─── Minimap ──────────────────────────────────── */}
      <canvas ref={minimapCanvasRef} width={150} height={100}
        className="absolute bottom-4 left-4 z-20 rounded-lg border cursor-pointer pointer-events-auto"
        style={{ background: theme === 'dark' ? 'rgba(5,5,8,0.8)' : 'rgba(240,240,245,0.8)', borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
        onClick={onMinimapClick}
      />

      {/* ─── Bottom Bar ───────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pointer-events-auto">
        <Button size="sm" variant="ghost" className={`h-7 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} onClick={resetView}>🏠 عرض أساسي</Button>
        <span className={`text-[10px] ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>انقر مرتين = توسيع | Shift+سحب = تحديد | Ctrl+Z/Y = تراجع</span>
      </div>

      {/* ─── Brain Level Badge ────────────────────────── */}
      <div className="absolute bottom-4 right-4 z-20">
        <Badge className={`${theme === 'dark' ? 'bg-yellow-900/50 text-yellow-400 border-yellow-700/50' : 'bg-yellow-100 text-yellow-700 border-yellow-300'}`}>
          {getBrainLevel(brainStats.totalKnowledge).emoji} مستوى {brainStats.level}: {brainStats.levelName} ({brainStats.totalKnowledge})
        </Badge>
      </div>

      {/* ─── Stats Panel ──────────────────────────────── */}
      {showStats && (
        <div className={`absolute top-14 right-4 z-30 w-72 rounded-xl border p-4 max-h-[80vh] overflow-y-auto pointer-events-auto ${theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold">📊 إحصائيات العقل</h3>
            <button onClick={() => setShowStats(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span>المعرفة</span><span className="font-mono">{brainStats.totalKnowledge}</span></div>
            <div className="flex justify-between"><span>العقد</span><span className="font-mono">{brainStats.totalNodes}</span></div>
            <div className="flex justify-between"><span>الروابط</span><span className="font-mono">{brainStats.totalConnections}</span></div>
            <div className="flex justify-between"><span>التغذيات</span><span className="font-mono">{brainStats.totalFeeds}</span></div>
            <div className="flex justify-between"><span>المواضيع</span><span className="font-mono">{brainStats.topicsExplored.length}/6</span></div>
            <div className="flex justify-between"><span>الاختبارات</span><span className="font-mono">{brainStats.quizCorrect}/{brainStats.quizTotal}</span></div>
            <div className="flex justify-between"><span>المشاريع</span><span className="font-mono">{brainStats.projectsCreated} ({brainStats.projectsCompleted} مكتمل)</span></div>
            <div className="flex justify-between"><span>المهام المنفذة</span><span className="font-mono">{brainStats.tasksCompleted}</span></div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10">
            <h4 className="text-xs font-bold mb-2">🏆 الإنجازات</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {ACHIEVEMENTS.map(ach => (
                <div key={ach.id} className={`flex items-center gap-2 text-[10px] p-1 rounded ${unlockedAchievements.includes(ach.id) ? (theme === 'dark' ? 'bg-yellow-900/30' : 'bg-yellow-50') : 'opacity-40'}`}>
                  <span>{unlockedAchievements.includes(ach.id) ? ach.emoji : '🔒'}</span>
                  <span className="font-medium">{ach.name}</span>
                  <span className="opacity-60">- {ach.description}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={exportPNG}>📷 PNG</Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={exportJSON}>💾 JSON</Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={importJSON}>📂 استيراد</Button>
          </div>
        </div>
      )}

      {/* ─── AI Panel ─────────────────────────────────── */}
      {aiPanelOpen && (
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-96 max-w-[90vw] rounded-xl border p-4 pointer-events-auto ${theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold">🤖 العقل الذكي</h3>
            <button onClick={() => setAiPanelOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={aiSummarize} disabled={aiLoading}>📋 ملخص</Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={aiSuggestLinks} disabled={aiLoading}>🔗 اقتراح روابط</Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={generateLearningPath} disabled={aiLoading}>🎓 مسار تعلمي</Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={autoLearn} disabled={autoLearnLoading}>🧠 تعلّم ذاتي</Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setAutoLearnActive(prev => !prev)}>
                {autoLearnActive ? '⏹️ إيقاف تلقائي' : '🔄 تلقائي (2د)'}
              </Button>
            </div>
            {aiLoading && <div className="text-xs text-center py-2 animate-pulse">⏳ جاري التفكير...</div>}
            {aiInsight && (
              <div className={`p-2 rounded-lg text-xs ${theme === 'dark' ? 'bg-purple-900/20' : 'bg-purple-50'}`}>
                <p className="mb-1">{aiInsight.summary}</p>
                {aiInsight.questions.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {aiInsight.questions.map((q, i) => <p key={i} className="opacity-70">❓ {q}</p>)}
                  </div>
                )}
              </div>
            )}
            {learningPath.length > 0 && (
              <div className={`p-2 rounded-lg text-xs ${theme === 'dark' ? 'bg-green-900/20' : 'bg-green-50'}`}>
                <p className="font-bold mb-1">🎓 المسار التعليمي:</p>
                {learningPath.map((step, i) => <p key={i}>{i + 1}. {step}</p>)}
              </div>
            )}
            {autoLearnInsights.length > 0 && (
              <div className={`p-2 rounded-lg text-xs ${theme === 'dark' ? 'bg-cyan-900/20' : 'bg-cyan-50'}`}>
                <p className="font-bold mb-1">💡 رؤى:</p>
                {autoLearnInsights.map((ins, i) => <p key={i}>• {ins}</p>)}
              </div>
            )}
            {/* Ask AI */}
            <div className="flex gap-1">
              <Input value={aiQuestion} onChange={e => setAiQuestion(e.target.value)} placeholder="اسأل العقل..." className="h-7 text-xs flex-1" onKeyDown={e => { if (e.key === 'Enter') aiAsk(); }} />
              <Button size="sm" className="h-7 text-xs" onClick={aiAsk} disabled={aiLoading}>اسأل</Button>
            </div>
            {aiAnswer && <div className={`p-2 rounded-lg text-xs ${theme === 'dark' ? 'bg-blue-900/20' : 'bg-blue-50'}`}>{aiAnswer}</div>}
          </div>
        </div>
      )}

      {/* ─── Selected Node Panel ────── */}
      {selectedNode && !selectedNode.isBrain && !(selectedNode.isProject || selectedNode.tag === 'مشروع') && (() => {
        // Use live node data from state so panel always reflects current values
        const liveNode = nodes.find(n => n.id === selectedNode.id) || selectedNode;
        return (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-80 max-w-[90vw] rounded-xl border p-3 pointer-events-auto ${theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold" style={{ color: liveNode.color || '#00ffe0' }}>{liveNode.tag || '●'} {liveNode.label}</h3>
            <button onClick={() => setSelectedNode(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
          </div>
          {liveNode.summary && <p className="text-[10px] opacity-70 mb-2">{liveNode.summary}</p>}
          <div className="flex gap-1 flex-wrap text-[10px] mb-2">
            <span className="opacity-50">{getMaturityEmoji(liveNode.maturity || 'seed')} {liveNode.tag || 'عقدة'}</span>
            <span className="opacity-50">| معرفة: {liveNode.knowledgeLevel ?? 0}%</span>
            <span className="opacity-50">| زيارات: {liveNode.visitCount ?? 0}</span>
            {liveNode.dormant && <span className="text-red-400">💤 نائم</span>}
          </div>
          {/* Knowledge progress bar */}
          <div className="w-full h-1.5 rounded-full bg-white/10 mb-2">
            <div className="h-full rounded-full transition-all" style={{ width: `${liveNode.knowledgeLevel ?? 0}%`, background: `linear-gradient(90deg, ${liveNode.color || '#00ffe0'}, ${liveNode.color || '#00ffe0'}88)` }} />
          </div>
          <div className="flex gap-1 flex-wrap">
            {!liveNode.isBrain && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => feedBrain(liveNode.id)}>🍎 غذّ</Button>}
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { setConnectMode(true); setConnectFrom(liveNode.id); }}>🔗 ربط</Button>
            {liveNode.hasChildren && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => expandNode(liveNode.id)}>{liveNode.expanded ? '📂 أغلق' : '📂 توسع'}</Button>}
            {liveNode.dormant && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => wakeNode(liveNode.id)}>⚡ أيقظ</Button>}
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => aiGenerateNodes(liveNode)} disabled={aiLoading}>🤖 ولّد</Button>
            {!liveNode.isBrain && <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-400" onClick={() => deleteNode(liveNode.id)}>🗑️</Button>}
          </div>
          {connectMode && connectFrom === liveNode.id && (
            <p className="text-[10px] text-cyan-400 mt-1 animate-pulse">🔗 انقر على عقدة أخرى للربط...</p>
          )}
        </div>
        );
      })()}

      {/* ─── Brain Node Panel ────── */}
      {selectedNode && selectedNode.isBrain && (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-80 max-w-[90vw] rounded-xl border p-3 pointer-events-auto ${theme === 'dark' ? 'bg-gray-900/95 border-yellow-900/50 text-white' : 'bg-white/95 border-yellow-200 text-gray-900'}`}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-bold text-yellow-400">🧠 العقل المركزي</h3>
            <button onClick={() => setSelectedNode(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
          </div>
          <p className="text-[10px] opacity-70 mb-2">العقل المركزي — يتغذى ويتعلم من كل عقدة تتصل به</p>
          <div className="grid grid-cols-2 gap-1 text-[10px] mb-2">
            <span className="opacity-60">📊 المعرفة: <b className="text-yellow-400">{brainStats.totalKnowledge}</b></span>
            <span className="opacity-60">📈 المستوى: <b className="text-yellow-400">{brainStats.level} ({brainStats.levelName})</b></span>
            <span className="opacity-60">🔗 العقد: <b>{brainStats.totalNodes}</b></span>
            <span className="opacity-60">🍼 التغذيات: <b>{brainStats.totalFeeds}</b></span>
            <span className="opacity-60">🌐 الروابط: <b>{brainStats.totalConnections}</b></span>
            <span className="opacity-60">🚀 المشاريع: <b>{brainStats.projectsCreated}</b></span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 mb-2">
            <div className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all" style={{ width: `${Math.min(100, brainStats.totalKnowledge / 10)}%` }} />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={aiSummarize} disabled={aiLoading}>🤖 ملخص ذكي</Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={aiSuggestLinks} disabled={aiLoading}>🔗 اقترح روابط</Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setShowStats(true)}>📊 تفاصيل</Button>
          </div>
        </div>
      )}

      {/* ─── Project Panel ────────────────────────────── */}
      {projectPanelNode && (projectPanelNode.isProject || projectPanelNode.tag === 'مشروع' || projectPanelNode.tag === 'مرحلة' || (projectPanelNode.projectTasks && projectPanelNode.projectTasks.length > 0) || nodes.some(n => n.parentId === projectPanelNode.id)) && (
        <ProjectPanel
          projectNode={projectPanelNode}
          nodes={nodes}
          theme={theme}
          taskExecuting={taskExecuting}
          onClose={() => { setProjectPanelNode(null); setSelectedNode(null); }}
          onExecuteTask={executeTask}
          onNavigate={navigateToNode}
          onSelectNode={setSelectedNode}
          onClosePanel={() => setProjectPanelNode(null)}
          onFeed={feedBrain}
          onDelete={deleteNode}
          onGenerateCode={generateProjectCode}
          onGeneratePreview={generateProjectPreview}
          onGenerateReport={generateProjectReport}
          onExecuteAll={executeAllTasks}
        />
      )}

      {/* ─── Quiz Panel ───────────────────────────────── */}
      {quizOpen && (
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-96 max-w-[90vw] rounded-xl border p-4 pointer-events-auto ${theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold">🎓 اختبار المعرفة</h3>
            <button onClick={() => setQuizOpen(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
          </div>
          {quizLoading ? (
            <div className="text-center py-4 animate-pulse text-xs">⏳ جاري توليد السؤال...</div>
          ) : currentQuiz ? (
            <div>
              <p className="text-sm font-medium mb-3">{currentQuiz.question}</p>
              <div className="space-y-1.5">
                {currentQuiz.options.map((opt, i) => (
                  <button key={i} className={`w-full text-right p-2 rounded-lg border text-xs transition-all ${
                    quizAnswer === i
                      ? quizResult === 'correct' && i === currentQuiz.correctIndex ? 'bg-green-900/30 border-green-500'
                        : quizResult === 'wrong' && i === currentQuiz.correctIndex ? 'bg-green-900/30 border-green-500'
                        : 'bg-red-900/30 border-red-500'
                      : 'border-white/10 hover:bg-white/5'
                  }`} onClick={() => answerQuiz(i)} disabled={quizResult !== null}>
                    {String.fromCharCode(1571 + i)} - {opt}
                  </button>
                ))}
              </div>
              {quizResult && (
                <div className={`mt-3 p-2 rounded-lg text-xs ${quizResult === 'correct' ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                  {quizResult === 'correct' ? '🎉 صحيح! +2x تغذية' : '❌ خطأ!'}
                  {currentQuiz.explanation && <p className="mt-1 opacity-70">{currentQuiz.explanation}</p>}
                </div>
              )}
              {quizResult && (
                <Button size="sm" className="mt-2 w-full h-7 text-xs" onClick={generateQuiz}>سؤال آخر</Button>
              )}
              <div className="mt-2 text-[10px] opacity-50 text-center">
                صحيح: {brainStats.quizCorrect}/{brainStats.quizTotal}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ─── Filter Panel ─────────────────────────────── */}
      {showFilterPanel && (
        <div className={`absolute top-14 left-4 z-30 w-56 rounded-xl border p-3 pointer-events-auto ${theme === 'dark' ? 'bg-gray-900/95 border-gray-700 text-white' : 'bg-white/95 border-gray-200 text-gray-900'}`}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-bold">🔍 تصفية</h3>
            <button onClick={() => setShowFilterPanel(false)} className="text-xs opacity-50 hover:opacity-100">✕</button>
          </div>
          <div className="space-y-2 text-[10px]">
            <div>
              <label className="block mb-1 opacity-70">وضع العرض</label>
              <div className="flex gap-1">
                {(['normal', 'heatmap', 'filtered'] as ViewMode[]).map(m => (
                  <button key={m} className={`px-2 py-0.5 rounded text-[10px] ${viewMode === m ? 'bg-cyan-600 text-white' : 'bg-white/5'}`} onClick={() => setViewMode(m)}>{m === 'normal' ? 'عادي' : m === 'heatmap' ? 'حراري' : 'مصفى'}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block mb-1 opacity-70">أقل معرفة: {filterState.minKnowledge}</label>
              <input type="range" min="0" max="100" value={filterState.minKnowledge} onChange={e => setFilterState(p => ({ ...p, minKnowledge: +e.target.value }))} className="w-full" />
            </div>
            <label className="flex items-center gap-1"><input type="checkbox" checked={filterState.showDormant} onChange={e => setFilterState(p => ({ ...p, showDormant: e.target.checked }))} /> أظهر النائمين</label>
          </div>
        </div>
      )}

      {/* ─── Add Node Dialog ──────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent aria-describedby={undefined} className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : ''} pointer-events-auto`}>
          <DialogHeader><DialogTitle>➕ إضافة عقدة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="اسم العقدة" className={theme === 'dark' ? 'bg-white/5 border-white/10' : ''} />
            <Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="التصنيف (اختياري)" className={theme === 'dark' ? 'bg-white/5 border-white/10' : ''} />
            <Textarea value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder="وصف مختصر (اختياري)" className={theme === 'dark' ? 'bg-white/5 border-white/10' : ''} rows={2} />
            <Button className="w-full" onClick={addCustomNode} disabled={!newLabel.trim()}>إضافة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Idea Dialog ──────────────────────────────── */}
      <Dialog open={ideaDialogOpen} onOpenChange={(open) => { setIdeaDialogOpen(open); if (!open) { setIdeaError(''); setIdeaLoading(false); } }}>
        <DialogContent aria-describedby={undefined} className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : ''} pointer-events-auto`}>
          <DialogHeader><DialogTitle>💡 حوّل فكرتك إلى مشروع</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea value={ideaText} onChange={e => { setIdeaText(e.target.value); setIdeaError(''); }} placeholder="اكتب فكرتك هنا... وسيتولى الذكاء الاصطناعي تحويلها إلى خطة مشروع مفصلة" className={theme === 'dark' ? 'bg-white/5 border-white/10' : ''} rows={4} />
            {ideaError && <p className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{ideaError}</p>}
            <Button className="w-full" onClick={analyzeIdea} disabled={!ideaText.trim() || ideaLoading}>
              {ideaLoading ? '⏳ جاري التحليل...' : '🚀 حلّل وأنشئ المشروع'}
            </Button>
            {ideaLoading && <p className="text-xs text-center animate-pulse opacity-70">⏳ جاري التحليل... قد يستغرق بضع ثوان</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── 🔧 Code Viewer Dialog ──────────────────────── */}
      <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
        <DialogContent aria-describedby={undefined} className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : ''} pointer-events-auto max-w-4xl max-h-[85vh]`}>
          <DialogHeader><DialogTitle>🔧 مولّد الكود - Next.js</DialogTitle></DialogHeader>
          {codeLoading ? (
            <div className="text-center py-8 animate-pulse text-sm">⏳ جاري توليد الكود... قد يستغرق بضع ثوان</div>
          ) : codeFiles.length > 0 ? (
            <div className="flex gap-3 h-[60vh]">
              {/* File tree */}
              <div className={`w-56 shrink-0 rounded-lg border p-2 overflow-y-auto ${theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <p className="text-[10px] font-bold opacity-50 mb-2">📂 الملفات ({codeFiles.length})</p>
                {codeFiles.map(f => (
                  <button key={f.path} className={`w-full text-right px-2 py-1.5 rounded text-xs transition-colors mb-0.5 ${selectedCodeFile === f.path ? (theme === 'dark' ? 'bg-cyan-900/40 text-cyan-400' : 'bg-cyan-100 text-cyan-700') : (theme === 'dark' ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-gray-100 text-gray-700')}`}
                    onClick={() => setSelectedCodeFile(f.path)}>
                    {f.path.endsWith('.tsx') || f.path.endsWith('.ts') ? '📘' : f.path.endsWith('.json') ? '📋' : f.path.endsWith('.css') ? '🎨' : '📄'} {f.path}
                  </button>
                ))}
              </div>
              {/* Code view */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {selectedCodeFile && (() => {
                  const file = codeFiles.find(f => f.path === selectedCodeFile);
                  if (!file) return null;
                  return (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className={`flex items-center justify-between px-3 py-1.5 rounded-t-lg text-xs ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                        <span className="font-mono">{file.path}</span>
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2" onClick={() => { navigator.clipboard.writeText(file.content); }}>📋 نسخ</Button>
                      </div>
                      <pre className={`flex-1 overflow-auto p-3 rounded-b-lg text-xs font-mono direction-ltr ${theme === 'dark' ? 'bg-gray-950 text-green-400' : 'bg-gray-900 text-green-400'}`} dir="ltr" style={{ lineHeight: '1.6' }}>
                        {file.content}
                      </pre>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs opacity-50">لم يتم توليد كود بعد</div>
          )}
          {codeFiles.length > 0 && (
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                const allCode = codeFiles.map(f => `\n${'='.repeat(60)}\n📄 ${f.path}\n${'='.repeat(60)}\n\n${f.content}`).join('\n\n');
                const blob = new Blob([allCode], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.download = `project-code-${Date.now()}.txt`;
                link.href = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(link.href);
              }}>💾 تحميل الكل</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 🌐 Live Preview Dialog ─────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent aria-describedby={undefined} className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : ''} pointer-events-auto max-w-5xl max-h-[90vh]`}>
          <DialogHeader><DialogTitle>🌐 معاينة المشروع</DialogTitle></DialogHeader>
          {previewLoading ? (
            <div className="text-center py-8 animate-pulse text-sm">⏳ جاري توليد المعاينة... قد يستغرق بضع ثوان</div>
          ) : previewHtml ? (
            <div className="flex flex-col gap-2">
              <iframe
                srcDoc={previewHtml}
                className="w-full rounded-lg border bg-white"
                style={{ height: '60vh', border: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}
                title="معاينة المشروع"
                sandbox="allow-scripts"
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                  const win = window.open('', '_blank');
                  if (win) {
                    win.document.write(previewHtml);
                    win.document.close();
                  }
                }}>🔗 فتح في نافذة جديدة</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                  const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
                  const link = document.createElement('a');
                  link.download = `project-preview-${Date.now()}.html`;
                  link.href = URL.createObjectURL(blob);
                  link.click();
                  URL.revokeObjectURL(link.href);
                }}>💾 تحميل HTML</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs opacity-50">لم يتم توليد معاينة بعد</div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── 📄 Project Report Dialog ───────────────────── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent aria-describedby={undefined} className={`${theme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : ''} pointer-events-auto max-w-3xl max-h-[85vh]`}>
          <DialogHeader><DialogTitle>📄 تقرير المشروع</DialogTitle></DialogHeader>
          {reportLoading ? (
            <div className="text-center py-8 animate-pulse text-sm">⏳ جاري توليد التقرير... قد يستغرق بضع ثوان</div>
          ) : reportData ? (
            <div className="space-y-4 max-h-[65vh] overflow-y-auto" dir="rtl">
              {/* Executive Summary */}
              {reportData.executiveSummary && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'}`}>
                  <h4 className="text-sm font-bold mb-1">📋 الملخص التنفيذي</h4>
                  <p className="text-xs leading-relaxed">{reportData.executiveSummary}</p>
                </div>
              )}
              {/* Requirements */}
              {Array.isArray(reportData.requirements) && reportData.requirements.length > 0 && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-green-900/20 border border-green-800/30' : 'bg-green-50 border border-green-200'}`}>
                  <h4 className="text-sm font-bold mb-2">✅ المتطلبات</h4>
                  <ul className="space-y-1">
                    {reportData.requirements.map((r: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-2"><span className="text-green-400 mt-0.5">●</span> {r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Tech Stack */}
              {Array.isArray(reportData.techStack) && reportData.techStack.length > 0 && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-purple-900/20 border border-purple-800/30' : 'bg-purple-50 border border-purple-200'}`}>
                  <h4 className="text-sm font-bold mb-2">🛠️ التقنيات</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {reportData.techStack.map((t: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {/* Architecture */}
              {reportData.architecture && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-yellow-900/20 border border-yellow-800/30' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <h4 className="text-sm font-bold mb-1">🏗️ البنية التقنية</h4>
                  <p className="text-xs leading-relaxed">{reportData.architecture}</p>
                </div>
              )}
              {/* Timeline */}
              {reportData.timeline && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-cyan-900/20 border border-cyan-800/30' : 'bg-cyan-50 border border-cyan-200'}`}>
                  <h4 className="text-sm font-bold mb-1">📅 الجدول الزمني</h4>
                  <p className="text-xs leading-relaxed">{reportData.timeline}</p>
                </div>
              )}
              {/* Risks */}
              {Array.isArray(reportData.risks) && reportData.risks.length > 0 && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-200'}`}>
                  <h4 className="text-sm font-bold mb-2">⚠️ المخاطر</h4>
                  <ul className="space-y-1">
                    {reportData.risks.map((r: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-2"><span className="text-red-400 mt-0.5">●</span> {r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Recommendations */}
              {Array.isArray(reportData.recommendations) && reportData.recommendations.length > 0 && (
                <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-emerald-900/20 border border-emerald-800/30' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <h4 className="text-sm font-bold mb-2">💡 التوصيات</h4>
                  <ul className="space-y-1">
                    {reportData.recommendations.map((r: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-2"><span className="text-emerald-400 mt-0.5">●</span> {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-xs opacity-50">لم يتم توليد تقرير بعد</div>
          )}
          {reportData && (
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                const text = Object.entries(reportData).map(([key, value]) => {
                  const label: Record<string, string> = {
                    executiveSummary: 'الملخص التنفيذي',
                    requirements: 'المتطلبات',
                    techStack: 'التقنيات',
                    architecture: 'البنية التقنية',
                    timeline: 'الجدول الزمني',
                    risks: 'المخاطر',
                    recommendations: 'التوصيات',
                  };
                  const heading = label[key] || key;
                  if (Array.isArray(value)) return `${heading}:\n${(value as string[]).map(v => `  • ${v}`).join('\n')}`;
                  return `${heading}:\n${value}`;
                }).join('\n\n');
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const link = document.createElement('a');
                link.download = `project-report-${Date.now()}.txt`;
                link.href = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(link.href);
              }}>💾 تحميل التقرير</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Achievement Toast ────────────────────────── */}
      {achievementToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="px-6 py-3 rounded-xl bg-yellow-500 text-black font-bold text-sm shadow-2xl flex items-center gap-2">
            <span className="text-2xl">{achievementToast.emoji}</span>
            <div>
              <div className="font-bold">{achievementToast.name}</div>
              <div className="text-xs font-normal opacity-80">{achievementToast.description}</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Multi-select info ────────────────────────── */}
      {selectedNodeIds.size > 1 && (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg text-xs ${theme === 'dark' ? 'bg-cyan-900/50 text-cyan-400' : 'bg-cyan-100 text-cyan-700'}`}>
          تم تحديد {selectedNodeIds.size} عقد
          <Button size="sm" variant="ghost" className="h-5 text-[10px] ml-2 text-red-400" onClick={() => { selectedNodeIds.forEach(id => deleteNode(id)); setSelectedNodeIds(new Set()); }}>🗑️ حذف الكل</Button>
        </div>
      )}

      {/* ─── Click Feedback Pulse ────────────────────────── */}
      {clickFeedback && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none animate-ping">
          <div className="px-3 py-1.5 rounded-full bg-cyan-500/30 text-cyan-300 text-xs font-bold">
            ✨ {clickFeedback.label}
          </div>
        </div>
      )}

      {/* ─── 🖥️ Live Output Panel ─────────────────────────── */}
      <LivePanel
        open={livePanelOpen}
        title={livePanelTitle}
        type={livePanelType}
        content={livePanelContent}
        fullContent={livePanelFullContent}
        onClose={() => setLivePanelOpen(false)}
        onCopy={() => { navigator.clipboard.writeText(livePanelFullContent); }}
        onOpenNew={() => {
          if (previewHtml) {
            const win = window.open('', '_blank');
            if (win) { win.document.write(previewHtml); win.document.close(); }
          }
        }}
        onDownload={() => {
          const ext = livePanelType === 'preview' ? 'html' : livePanelType === 'code' ? 'txt' : 'txt';
          const blob = new Blob([livePanelFullContent], { type: 'text/plain;charset=utf-8' });
          const link = document.createElement('a');
          link.download = `mindflow-${livePanelType}-${Date.now()}.${ext}`;
          link.href = URL.createObjectURL(blob);
          link.click();
          URL.revokeObjectURL(link.href);
        }}
      />
    </div>
  );
}
