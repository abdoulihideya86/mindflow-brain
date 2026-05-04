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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  KNOWLEDGE_BASE,
  TOPIC_COLORS,
  getBrainLevel,
  CROSS_LINK_RULES,
} from '@/lib/mindflow/knowledge';
import { sounds, toggleMute, isMuted } from '@/lib/mindflow/sounds';
import { MATURITY_LEVELS } from '@/lib/mindflow/types';
import type { MindNode, MindEdge, BrainStats, TimelineEntry, ViewMode, FilterState, AIInsight } from '@/lib/mindflow/types';

// ─── Utility ────────────────────────────────────────────────
let _nid = 0;
function nid() { return `n${++_nid}_${Date.now()}`; }
function eid() { return `e${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

const BRAIN_ID = '__brain__';
const STORAGE_KEY = 'mindflow_brain_state_v2';

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
  };
}

function defaultStats(): BrainStats {
  return { totalKnowledge: 0, totalNodes: 1, totalConnections: 0, totalFeeds: 0, topicsExplored: [], growthRate: 0, level: 1, levelName: 'بذرة', history: [] };
}

function getMaturity(visits: number): MindNode['maturity'] {
  if (visits >= 15) return 'ancient';
  if (visits >= 8) return 'tree';
  if (visits >= 3) return 'sprout';
  return 'seed';
}

function getMaturityEmoji(m: MindNode['maturity']) {
  return MATURITY_LEVELS[m].emoji;
}

function getMaturityColor(m: MindNode['maturity']) {
  return MATURITY_LEVELS[m].color;
}

// ─── Persistence ────────────────────────────────────────────
interface PersistedState {
  brainStats: BrainStats;
  customNodes: { label: string; tag: string; summary: string }[];
  exploredTopics: string[];
}

function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return null;
}

function saveState(stats: BrainStats, customNodes: MindNode[], exploredTopics: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const data: PersistedState = {
      brainStats: stats,
      customNodes: customNodes.filter(n => n.isCustom).map(n => ({ label: n.label, tag: n.tag, summary: n.summary })),
      exploredTopics,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// ─── Component ──────────────────────────────────────────────
export default function MindFlowBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const aiLoadingRef = useRef(false);

  // ─── Lazy Initializer ──────────────────────────────────
  const getInitialState = () => {
    if (typeof window === 'undefined') {
      return { nodes: [] as MindNode[], edges: [] as MindEdge[], stats: defaultStats(), explored: [] as string[] };
    }
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const brain = createBrainNode(cx, cy);
    const persisted = loadState();
    let initialNodes = [brain];
    let initialStats = defaultStats();
    let initialExplored: string[] = [];

    if (persisted) {
      initialStats = persisted.brainStats;
      initialExplored = persisted.exploredTopics;
      persisted.customNodes.forEach((cn, i) => {
        const angle = (i / Math.max(1, persisted.customNodes.length)) * Math.PI * 2 - Math.PI / 2;
        const dist = 220 + Math.random() * 80;
        initialNodes.push({
          id: nid(), label: cn.label, tag: cn.tag, summary: cn.summary,
          x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
          depth: 1, parentId: BRAIN_ID, isBrain: false, isCustom: true,
          expanded: false, hasChildren: false, connections: [BRAIN_ID],
          knowledgeLevel: 50, color: '#ff6b9d', pulsePhase: Math.random() * Math.PI * 2,
          maturity: 'sprout', dormant: false, lastFedAt: Date.now(), visitCount: 5,
          alliedWith: [], feedParticles: [],
        });
        initialStats.totalNodes++;
      });
    }
    return { nodes: initialNodes, edges: [] as MindEdge[], stats: initialStats, explored: initialExplored };
  };

  const [initialData] = useState(getInitialState);
  const [nodes, setNodes] = useState<MindNode[]>(initialData.nodes);
  const [edges, setEdges] = useState<MindEdge[]>(initialData.edges);
  const [brainStats, setBrainStats] = useState<BrainStats>(initialData.stats);
  const [selectedNode, setSelectedNode] = useState<MindNode | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [exploredTopics, setExploredTopics] = useState<string[]>(initialData.explored);
  const [showStats, setShowStats] = useState(false);
  const [feedAnim, setFeedAnim] = useState<{ from: string; to: string } | null>(null);
  const [muted, setMuted] = useState(false);

  // 🔍 Feature 2: Smart Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<MindNode[]>([]);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());

  // 🕸️ Feature 8: Advanced View
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [filterState, setFilterState] = useState<FilterState>({
    topics: [], tags: [], minKnowledge: 0, maturityFilter: [], showDormant: true,
  });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(-1);

  // 🤖 Feature 1: AI
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');

  // ─── Sync refs ─────────────────────────────────────────
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ─── Save on changes ───────────────────────────────────
  useEffect(() => {
    if (nodes.length === 0) return;
    saveState(brainStats, nodes, exploredTopics);
  }, [brainStats, nodes, exploredTopics]);

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

  // ─── Find node at position ─────────────────────────────
  const findNodeAt = useCallback((sx: number, sy: number): MindNode | null => {
    const vp = viewportRef.current;
    const wx = (sx - vp.x) / vp.scale;
    const wy = (sy - vp.y) / vp.scale;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const r = n.isBrain ? 55 : 32;
      if ((wx - n.x) ** 2 + (wy - n.y) ** 2 < r * r) return n;
    }
    return null;
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

  // ─── Check Dormant Nodes (🧬 Feature 9) ───────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setNodes(prev => prev.map(n => {
        if (n.isBrain || n.dormant) return n;
        const timeSinceFed = now - n.lastFedAt;
        const shouldDormant = timeSinceFed > 60000 && n.knowledgeLevel > 0; // 1 min
        if (shouldDormant && !n.dormant) return { ...n, dormant: true };
        return n;
      }));
    }, 10000);
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
  const feedBrain = useCallback((nodeId: string) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!node || !brain || node.isBrain) return;

    // Particles
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

    const knowledgeGain = 5 + Math.floor(Math.random() * 10);
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

    // Update node maturity + knowledge
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        const newVisits = n.visitCount + 1;
        const newKnowledge = Math.min(100, n.knowledgeLevel + 10);
        const newMaturity = getMaturity(newVisits);
        const wasMaturity = n.maturity;
        if (newMaturity !== wasMaturity) sounds.mature();
        return {
          ...n,
          knowledgeLevel: newKnowledge,
          connections: n.connections.includes(BRAIN_ID) ? n.connections : [...n.connections, BRAIN_ID],
          visitCount: newVisits,
          maturity: newMaturity,
          dormant: false,
          lastFedAt: Date.now(),
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
    setFeedAnim({ from: nodeId, to: BRAIN_ID });
    setTimeout(() => setFeedAnim(null), 1500);
  }, []);

  // ─── Expand Topic ─────────────────────────────────────
  const expandTopic = useCallback((topicKey: string) => {
    const topic = KNOWLEDGE_BASE[topicKey];
    if (!topic) return;
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!brain) return;

    const newNodes: MindNode[] = [];
    const newEdges: MindEdge[] = [];
    const count = topic.children.length;
    const color = TOPIC_COLORS[topicKey] || '#00ffe0';

    topic.children.forEach((child, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const dist = 200 + Math.random() * 60;
      const childNode: MindNode = {
        id: nid(), label: child.label, tag: child.tag, summary: child.summary || '',
        x: brain.x + Math.cos(angle) * dist, y: brain.y + Math.sin(angle) * dist,
        depth: 1, parentId: BRAIN_ID, isBrain: false, isCustom: false,
        expanded: false, hasChildren: !!child.children?.length,
        childrenData: child.children, connections: [], knowledgeLevel: 0,
        color, pulsePhase: Math.random() * Math.PI * 2,
        maturity: 'seed', dormant: false, lastFedAt: Date.now(), visitCount: 0,
        alliedWith: [], feedParticles: [],
      };
      newNodes.push(childNode);
      newEdges.push({ id: eid(), from: BRAIN_ID, to: childNode.id, type: 'parent', strength: 1, animated: false, createdAt: Date.now() });
    });

    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
    setBrainStats(prev => ({
      ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length,
      history: [...prev.history.slice(-100), { timestamp: Date.now(), event: 'expand', detail: `استكشاف: ${topicKey}`, knowledge: prev.totalKnowledge }],
    }));
    setExploredTopics(prev => prev.includes(topicKey) ? prev : [...prev, topicKey]);

    setTimeout(() => { newNodes.forEach((n, i) => { setTimeout(() => feedBrain(n.id), i * 200); }); }, 300);
    setTimeout(() => { addCrossLinks(newNodes); }, 500);
  }, [feedBrain, addCrossLinks]);

  // ─── Expand Sub-nodes ─────────────────────────────────
  const expandNode = useCallback((nodeId: string) => {
    const parent = nodesRef.current.find(n => n.id === nodeId);
    if (!parent || !parent.childrenData?.length) return;
    if (parent.expanded) {
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

    const newNodes: MindNode[] = [];
    const newEdges: MindEdge[] = [];
    const count = parent.childrenData.length;

    parent.childrenData.forEach((child, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const dist = 150 + Math.random() * 40;
      const childNode: MindNode = {
        id: nid(), label: child.label, tag: child.tag, summary: child.summary || '',
        x: parent.x + Math.cos(angle) * dist, y: parent.y + Math.sin(angle) * dist,
        depth: parent.depth + 1, parentId: nodeId, isBrain: false, isCustom: false,
        expanded: false, hasChildren: !!child.children?.length,
        childrenData: child.children, connections: [], knowledgeLevel: 0,
        color: parent.color, pulsePhase: Math.random() * Math.PI * 2,
        maturity: 'seed', dormant: false, lastFedAt: Date.now(), visitCount: 0,
        alliedWith: [], feedParticles: [],
      };
      newNodes.push(childNode);
      newEdges.push({ id: eid(), from: nodeId, to: childNode.id, type: 'parent', strength: 0.8, animated: false, createdAt: Date.now() });
    });

    setNodes(prev => [...prev, ...newNodes].map(n => n.id === nodeId ? { ...n, expanded: true, visitCount: n.visitCount + 1, maturity: getMaturity(n.visitCount + 1) } : n));
    setEdges(prev => [...prev, ...newEdges]);
    setBrainStats(prev => ({ ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length }));
    setTimeout(() => { newNodes.forEach((n, i) => { setTimeout(() => feedBrain(n.id), i * 150); }); }, 200);
  }, [feedBrain]);

  // ─── Add Custom Node ──────────────────────────────────
  const addCustomNode = useCallback(() => {
    if (!newLabel.trim()) return;
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!brain) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 220 + Math.random() * 80;
    const newNode: MindNode = {
      id: nid(), label: newLabel.trim(), tag: newTag.trim() || 'مخصص', summary: newSummary.trim(),
      x: brain.x + Math.cos(angle) * dist, y: brain.y + Math.sin(angle) * dist,
      depth: 1, parentId: BRAIN_ID, isBrain: false, isCustom: true,
      expanded: false, hasChildren: false, connections: [BRAIN_ID],
      knowledgeLevel: 50, color: '#ff6b9d', pulsePhase: Math.random() * Math.PI * 2,
      maturity: 'sprout', dormant: false, lastFedAt: Date.now(), visitCount: 3,
      alliedWith: [], feedParticles: [],
    };

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
  }, [newLabel, newTag, newSummary, feedBrain, addTimeline]);

  // ─── Manual Connect ────────────────────────────────────
  const connectNodes = useCallback((fromId: string, toId: string) => {
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
  }, [addTimeline]);

  // ─── Delete Node ───────────────────────────────────────
  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === BRAIN_ID) return;
    const toRemove = new Set<string>();
    function collect(id: string) { toRemove.add(id); nodesRef.current.filter(n => n.parentId === id).forEach(n => collect(n.id)); }
    collect(nodeId);
    setNodes(prev => prev.filter(n => !toRemove.has(n.id)));
    setEdges(prev => prev.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to)));
    setSelectedNode(null);
  }, []);

  // 🔍 Feature 2: Smart Search
  const performSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchActive(false);
      setSearchResults([]);
      setHighlightedNodes(new Set());
      return;
    }
    const q = query.toLowerCase();
    const results = nodesRef.current.filter(n =>
      !n.isBrain && (
        n.label.toLowerCase().includes(q) ||
        n.tag.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q)
      )
    );
    setSearchActive(true);
    setSearchResults(results);
    setHighlightedNodes(new Set(results.map(n => n.id)));
    if (results.length > 0) sounds.searchFound();
  }, []);

  // 🕸️ Feature 8: Filter nodes
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

  // 🤖 Feature 1: AI Functions
  const aiSummarize = useCallback(async () => {
    setAiLoading(true);
    setAiPanelOpen(true);
    try {
      const nodeData = nodesRef.current.map(n => ({ id: n.id, label: n.label, tag: n.tag, summary: n.summary, isBrain: n.isBrain }));
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize', nodes: nodeData, brainKnowledge: brainStats.totalKnowledge }),
      });
      const data = await res.json();
      setAiInsight(prev => ({
        summary: data.summary || 'لم يتم توليد ملخص',
        questions: data.questions || [],
        suggestedLinks: prev?.suggestedLinks || [],
        suggestedNodes: prev?.suggestedNodes || [],
      }));
      sounds.aiInsight();
      addTimeline('ai-insight', 'توليد ملخص ذكي');
    } catch {
      setAiInsight(prev => ({ ...prev, summary: 'خطأ في الاتصال بالذكاء الاصطناعي' }));
    }
    setAiLoading(false);
  }, [brainStats.totalKnowledge, addTimeline]);

  const aiSuggestLinks = useCallback(async () => {
    setAiLoading(true);
    try {
      const nodeData = nodesRef.current.filter(n => !n.isBrain).map(n => ({ id: n.id, label: n.label, tag: n.tag, summary: n.summary }));
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest-links', nodes: nodeData }),
      });
      const data = await res.json();
      if (data.suggestedLinks?.length) {
        data.suggestedLinks.forEach((link: { from: string; to: string; reason: string }) => {
          const fromNode = nodesRef.current.find(n => n.id === link.from || n.label === link.from);
          const toNode = nodesRef.current.find(n => n.id === link.to || n.label === link.to);
          if (fromNode && toNode) {
            setEdges(prev => {
              const exists = prev.some(e => (e.from === fromNode.id && e.to === toNode.id) || (e.from === toNode.id && e.to === fromNode.id));
              if (!exists) return [...prev, { id: eid(), from: fromNode.id, to: toNode.id, type: 'ai-link', strength: 0.4, animated: true, createdAt: Date.now() }];
              return prev;
            });
          }
        });
        sounds.aiInsight();
        addTimeline('ai-insight', 'اقتراح روابط ذكية');
      }
    } catch {}
    setAiLoading(false);
  }, [addTimeline]);

  const aiGenerateNodes = useCallback(async (parentNode: MindNode) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-nodes', nodeLabel: parentNode.label, nodeTag: parentNode.tag, nodeSummary: parentNode.summary }),
      });
      const data = await res.json();
      if (data.suggestedNodes?.length) {
        const newNodes: MindNode[] = [];
        const newEdges: MindEdge[] = [];
        const count = data.suggestedNodes.length;
        data.suggestedNodes.forEach((sn: { label: string; tag: string; summary: string }, i: number) => {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const dist = 150 + Math.random() * 40;
          newNodes.push({
            id: nid(), label: sn.label, tag: sn.tag, summary: sn.summary,
            x: parentNode.x + Math.cos(angle) * dist, y: parentNode.y + Math.sin(angle) * dist,
            depth: parentNode.depth + 1, parentId: parentNode.id, isBrain: false, isCustom: false,
            expanded: false, hasChildren: false, connections: [], knowledgeLevel: 0,
            color: '#a78bfa', pulsePhase: Math.random() * Math.PI * 2,
            maturity: 'seed', dormant: false, lastFedAt: Date.now(), visitCount: 0,
            alliedWith: [], feedParticles: [],
          });
          newEdges.push({ id: eid(), from: parentNode.id, to: newNodes[newNodes.length - 1].id, type: 'ai-link', strength: 0.6, animated: true, createdAt: Date.now() });
        });
        setNodes(prev => [...prev, ...newNodes]);
        setEdges(prev => [...prev, ...newEdges]);
        setBrainStats(prev => ({ ...prev, totalNodes: prev.totalNodes + newNodes.length, totalConnections: prev.totalConnections + newEdges.length }));
        sounds.aiInsight();
        addTimeline('ai-insight', `AI ولّد ${newNodes.length} عقد`);
        setTimeout(() => { newNodes.forEach((n, i) => { setTimeout(() => feedBrain(n.id), i * 150); }); }, 200);
      }
    } catch {}
    setAiLoading(false);
  }, [feedBrain, addTimeline]);

  const aiAsk = useCallback(async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    try {
      const nodeData = nodesRef.current.filter(n => !n.isBrain).map(n => ({ label: n.label, summary: n.summary }));
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ask', nodes: nodeData, question: aiQuestion }),
      });
      const data = await res.json();
      setAiAnswer(data.answer || 'لا إجابة');
      sounds.aiInsight();
    } catch { setAiAnswer('خطأ في الاتصال'); }
    setAiLoading(false);
  }, [aiQuestion]);

  // 🧬 Feature 9: Form Alliance
  const formAlliance = useCallback((nodeId1: string, nodeId2: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId1) return { ...n, alliedWith: [...n.alliedWith, nodeId2] };
      if (n.id === nodeId2) return { ...n, alliedWith: [...n.alliedWith, nodeId1] };
      return n;
    }));
    setEdges(prev => [...prev, { id: eid(), from: nodeId1, to: nodeId2, type: 'alliance', strength: 0.8, animated: true, createdAt: Date.now() }]);
    sounds.alliance();
    addTimeline('alliance', 'تحالف عقد');
  }, [addTimeline]);

  // Wake dormant node
  const wakeNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, dormant: false, lastFedAt: Date.now() } : n));
    feedBrain(nodeId);
  }, [feedBrain]);

  // ─── Canvas Render ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render() {
      if (!ctx || !canvas) return;
      timeRef.current += 0.016;
      const t = timeRef.current;
      const vp = viewportRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const filteredIds = getFilteredNodeIds();

      ctx.clearRect(0, 0, W, H);

      // Background grid
      ctx.save();
      ctx.translate(vp.x % (48 * vp.scale), vp.y % (48 * vp.scale));
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W + 48 * vp.scale; x += 48 * vp.scale) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H + 48 * vp.scale; y += 48 * vp.scale) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();

      // BG glow
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      grad.addColorStop(0, 'rgba(0, 255, 224, 0.04)');
      grad.addColorStop(0.5, 'rgba(255, 60, 172, 0.02)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.scale, vp.scale);

      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;

      // ─── Draw Edges ────────────────────────────────
      currentEdges.forEach(edge => {
        const from = currentNodes.find(n => n.id === edge.from);
        const to = currentNodes.find(n => n.id === edge.to);
        if (!from || !to) return;
        // Skip if filtered
        if (filteredIds && (!filteredIds.has(from.id) || !filteredIds.has(to.id))) return;

        const fromR = from.isBrain ? 55 : 32;
        const toR = to.isBrain ? 55 : 32;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        const nx = dx / dist; const ny = dy / dist;
        const sx = from.x + nx * fromR; const sy = from.y + ny * fromR;
        const ex = to.x - nx * toR; const ey = to.y - ny * toR;
        const mx = (sx + ex) / 2; const my = (sy + ey) / 2 - 20;

        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey);

        if (edge.type === 'feed') {
          const g = ctx.createLinearGradient(sx, sy, ex, ey);
          g.addColorStop(0, 'rgba(245, 196, 0, 0.6)'); g.addColorStop(1, 'rgba(0, 255, 224, 0.4)');
          ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.setLineDash([]);
        } else if (edge.type === 'alliance') {
          const g = ctx.createLinearGradient(sx, sy, ex, ey);
          g.addColorStop(0, 'rgba(245, 196, 0, 0.5)'); g.addColorStop(1, 'rgba(167, 139, 250, 0.5)');
          ctx.strokeStyle = g; ctx.lineWidth = 2.5; ctx.setLineDash([]);
        } else if (edge.type === 'ai-link') {
          ctx.strokeStyle = 'rgba(167, 139, 250, 0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
        } else if (edge.type === 'cross-link') {
          ctx.strokeStyle = `rgba(255, 107, 157, ${0.15 + edge.strength * 0.25})`; ctx.lineWidth = 1; ctx.setLineDash([4, 8]);
        } else {
          const g = ctx.createLinearGradient(sx, sy, ex, ey);
          g.addColorStop(0, 'rgba(0, 255, 224, 0.4)'); g.addColorStop(1, 'rgba(167, 139, 250, 0.3)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
        }
        ctx.stroke(); ctx.setLineDash([]);

        // Animated dot
        if (edge.animated || edge.type === 'feed' || edge.type === 'alliance') {
          const progress = ((t * 0.3 + edge.strength) % 1);
          const qx = (1 - progress) ** 2 * sx + 2 * (1 - progress) * progress * mx + progress ** 2 * ex;
          const qy = (1 - progress) ** 2 * sy + 2 * (1 - progress) * progress * my + progress ** 2 * ey;
          ctx.beginPath(); ctx.arc(qx, qy, edge.type === 'feed' ? 3 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle = edge.type === 'feed' ? '#f5c400' : edge.type === 'alliance' ? '#a78bfa' : edge.type === 'ai-link' ? '#a78bfa' : '#ff6b9d';
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

        const isBrain = node.isBrain;
        const isSelected = selectedNode?.id === node.id;
        const isHighlighted = highlightedNodes.has(node.id);
        const isSearchDimmed = searchActive && !isBrain && !isHighlighted;
        const radius = isBrain
          ? 40 + Math.sin(t * 2) * 5 + Math.min(20, brainStats.totalKnowledge / 50)
          : 25 + node.knowledgeLevel / 10;

        // 🕸️ Heatmap glow
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
            ctx.strokeStyle = `rgba(245, 196, 0, ${0.06 - ring * 0.012})`; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }

        // Dormant overlay (🧬)
        if (node.dormant) {
          ctx.beginPath(); ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(107, 114, 128, 0.4)'; ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        }

        // Body
        ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        const bodyG = ctx.createRadialGradient(node.x - radius * 0.3, node.y - radius * 0.3, 0, node.x, node.y, radius);
        bodyG.addColorStop(0, isBrain ? 'rgba(40, 35, 10, 0.95)' : 'rgba(10, 10, 20, 0.92)');
        bodyG.addColorStop(1, isBrain ? 'rgba(20, 18, 5, 0.95)' : 'rgba(5, 5, 12, 0.92)');
        ctx.fillStyle = bodyG; ctx.fill();

        // Dim overlay for search
        if (isSearchDimmed) {
          ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(5, 5, 8, 0.7)'; ctx.fill();
        }

        // Border
        ctx.beginPath(); ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        if (isBrain) { ctx.strokeStyle = `rgba(245, 196, 0, ${0.5 + Math.sin(t * 2) * 0.2})`; ctx.lineWidth = 2.5; }
        else if (isSelected) { ctx.strokeStyle = 'rgba(0, 255, 224, 0.8)'; ctx.lineWidth = 2; }
        else if (isHighlighted) { ctx.strokeStyle = 'rgba(0, 255, 224, 0.7)'; ctx.lineWidth = 2.5; }
        else if (node.dormant) { ctx.strokeStyle = 'rgba(107, 114, 128, 0.3)'; ctx.lineWidth = 1; }
        else if (node.isCustom) { ctx.strokeStyle = 'rgba(255, 107, 157, 0.5)'; ctx.lineWidth = 1.5; }
        else { ctx.strokeStyle = node.color + '60'; ctx.lineWidth = 1.5; }
        ctx.stroke();

        // 🧬 Maturity ring
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

        // Label
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (isBrain) {
          ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#f5c400';
          ctx.fillText('🧠', node.x, node.y - 6);
          ctx.font = 'bold 13px sans-serif'; ctx.fillText('العقل', node.x, node.y + 14);
        } else {
          const maxLen = radius < 30 ? 10 : 14;
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = node.dormant ? 'rgba(107,114,128,0.6)' : isHighlighted ? '#00ffe0' : node.isCustom ? '#ff6b9d' : node.color;
          ctx.fillText(node.label.length > maxLen ? node.label.slice(0, maxLen) + '..' : node.label, node.x, node.y - 6);
          // Maturity + tag
          ctx.font = '9px sans-serif';
          ctx.fillStyle = 'rgba(232, 232, 240, 0.3)';
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

      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [selectedNode, brainStats.totalKnowledge, connectMode, connectFrom, highlightedNodes, searchActive, viewMode, filterState, getFilteredNodeIds]);

  // ─── Mouse/Touch Handlers ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onPointerDown(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
      const hit = findNodeAt(sx, sy);
      if (hit) {
        dragRef.current = { nodeId: hit.id, startX: sx, startY: sy, nodeStartX: hit.x, nodeStartY: hit.y, moved: false };
      } else {
        panRef.current = { active: true, startX: sx, startY: sy, vpStartX: viewportRef.current.x, vpStartY: viewportRef.current.y };
        setSelectedNode(null);
      }
    }
    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
      if (dragRef.current.nodeId) {
        const dx = sx - dragRef.current.startX; const dy = sy - dragRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
        const vp = viewportRef.current;
        setNodes(prev => prev.map(n => n.id === dragRef.current.nodeId ? { ...n, x: dragRef.current.nodeStartX + dx / vp.scale, y: dragRef.current.nodeStartY + dy / vp.scale } : n));
      } else if (panRef.current.active) {
        viewportRef.current = { ...viewportRef.current, x: panRef.current.vpStartX + (sx - panRef.current.startX), y: panRef.current.vpStartY + (sy - panRef.current.startY), scale: viewportRef.current.scale };
      }
    }
    function onPointerUp(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
      if (dragRef.current.nodeId && !dragRef.current.moved) {
        const hit = findNodeAt(sx, sy);
        if (hit) {
          if (connectMode && connectFrom && hit.id !== connectFrom) {
            connectNodes(connectFrom, hit.id);
            setConnectMode(false); setConnectFrom(null);
          } else {
            setSelectedNode(hit);
          }
        }
      }
      dragRef.current = { nodeId: null, startX: 0, startY: 0, nodeStartX: 0, nodeStartY: 0, moved: false };
      panRef.current = { active: false, startX: 0, startY: 0, vpStartX: 0, vpStartY: 0 };
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(3, Math.max(0.3, viewportRef.current.scale * delta));
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
      viewportRef.current = {
        x: sx - (sx - viewportRef.current.x) * (newScale / viewportRef.current.scale),
        y: sy - (sy - viewportRef.current.y) * (newScale / viewportRef.current.scale),
        scale: newScale,
      };
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [findNodeAt, connectMode, connectFrom, connectNodes]);

  const resetView = () => { viewportRef.current = { x: 0, y: 0, scale: 1 }; };
  const levelInfo = getBrainLevel(brainStats.totalKnowledge);

  // Get all unique tags
  const allTags = [...new Set(nodes.filter(n => !n.isBrain).map(n => n.tag))];

  return (
    <div ref={containerRef} className="fixed inset-0 bg-[#050508] overflow-hidden" style={{ fontFamily: "'Space Mono', monospace" }}>
      <canvas ref={canvasRef} className="absolute inset-0 z-10" style={{ touchAction: 'none' }} />

      {/* ═══ TOP BAR ═══ */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-2 px-3 py-2 bg-[rgba(5,5,8,0.9)] backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 mr-1">
          <span className="text-[#00ffe0] font-bold text-base" style={{ fontFamily: 'Syne, sans-serif' }}>Mind<span className="text-[#ff3cac]">Flow</span></span>
          <span className="text-[#f5c400] text-lg">{levelInfo.emoji}</span>
        </div>

        {/* 🔍 Search */}
        <div className="relative flex-1 max-w-[200px]">
          <input
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); performSearch(e.target.value); }}
            placeholder="🔍 بحث..."
            className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-[#00ffe0]/40 placeholder:text-white/20"
            dir="rtl"
          />
          {searchActive && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 right-0 w-64 max-h-48 overflow-y-auto bg-[rgba(10,10,20,0.95)] backdrop-blur-xl border border-white/10 rounded-lg shadow-xl z-50" dir="rtl">
              {searchResults.map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    viewportRef.current = { x: window.innerWidth / 2 - n.x * viewportRef.current.scale, y: window.innerHeight / 2 - n.y * viewportRef.current.scale, scale: viewportRef.current.scale };
                    setSelectedNode(n);
                    setSearchActive(false);
                  }}
                  className="w-full text-right px-3 py-2 text-xs hover:bg-white/[0.05] border-b border-white/[0.04] last:border-0"
                >
                  <div className="text-white/80 font-bold">{getMaturityEmoji(n.maturity)} {n.label}</div>
                  <div className="text-white/30 text-[10px]">{n.tag} — {n.summary.slice(0, 40)}...</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Topic buttons */}
        <div className="flex gap-1 overflow-x-auto flex-1 scrollbar-hide py-0.5">
          {Object.entries(KNOWLEDGE_BASE).map(([key, topic]) => (
            <button key={key} onClick={() => expandTopic(key)}
              className="flex-shrink-0 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-white/50 text-[10px] hover:bg-[rgba(0,255,224,0.12)] hover:text-[#00ffe0] hover:border-[rgba(0,255,224,0.4)] transition-all">
              {topic.emoji} {topic.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 flex-shrink-0">
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <button className="px-2.5 py-1 rounded-lg bg-[#ff6b9d] text-black font-bold text-[10px]" style={{ fontFamily: 'Syne, sans-serif' }}>+ عقدة</button>
            </DialogTrigger>
            <DialogContent className="bg-[#0d0d14] border-white/10 text-white max-w-sm">
              <DialogHeader><DialogTitle className="text-[#00ffe0] text-right" style={{ fontFamily: 'Syne, sans-serif' }}>إضافة عقدة جديدة</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><label className="text-xs text-white/40 mb-1 block text-right">الاسم</label><Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="اسم العقدة..." className="bg-white/[0.05] border-white/10 text-white text-right" dir="rtl" /></div>
                <div><label className="text-xs text-white/40 mb-1 block text-right">التصنيف</label><Input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="تصنيف العقدة..." className="bg-white/[0.05] border-white/10 text-white text-right" dir="rtl" /></div>
                <div><label className="text-xs text-white/40 mb-1 block text-right">الوصف</label><Textarea value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder="وصف مختصر..." className="bg-white/[0.05] border-white/10 text-white text-right min-h-[60px]" dir="rtl" /></div>
                <Button onClick={addCustomNode} className="w-full bg-[#00ffe0] text-black font-bold hover:bg-[#00ffe0]/80" disabled={!newLabel.trim()}>أضف وأطعم العقل 🧠</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* 🤖 AI Button */}
          <button onClick={aiSummarize} disabled={aiLoading}
            className="px-2.5 py-1 rounded-lg bg-[rgba(167,139,250,0.2)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] text-[10px] font-bold hover:bg-[rgba(167,139,250,0.3)] transition-all disabled:opacity-50">
            🤖 AI
          </button>

          {/* 🕸️ View Mode */}
          <button onClick={() => {
            const modes: ViewMode[] = ['normal', 'heatmap', 'filtered'];
            const idx = modes.indexOf(viewMode);
            setViewMode(modes[(idx + 1) % modes.length]);
          }}
            className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-white/50 text-[10px] hover:text-[#f5c400] hover:border-[rgba(245,196,0,0.4)] transition-all">
            {viewMode === 'normal' ? '🕸️' : viewMode === 'heatmap' ? '🔥' : '🔽'} {viewMode === 'normal' ? '' : viewMode === 'heatmap' ? 'حرارية' : 'فلتر'}
          </button>

          {/* 🔊 Mute */}
          <button onClick={() => { const m = toggleMute(); setMuted(m); }}
            className="px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-white/50 text-[10px] hover:text-white/70 transition-all">
            {muted ? '🔇' : '🔊'}
          </button>

          <button onClick={() => setShowStats(!showStats)}
            className="px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-white/50 text-[10px] hover:text-[#f5c400] hover:border-[rgba(245,196,0,0.4)] transition-all">
            📊
          </button>
        </div>
      </div>

      {/* ═══ FILTER PANEL (🕸️ Feature 8) ═══ */}
      {viewMode === 'filtered' && (
        <div className="fixed top-14 left-3 z-50 w-56 bg-[rgba(10,10,20,0.95)] backdrop-blur-xl border border-white/10 rounded-xl p-3 space-y-2" dir="rtl">
          <div className="text-[#f5c400] text-xs font-bold mb-1">🔽 فلترة العقد</div>
          <div>
            <label className="text-white/30 text-[10px] block mb-0.5">الحد الأدنى للمعرفة: {filterState.minKnowledge}%</label>
            <input type="range" min="0" max="100" value={filterState.minKnowledge}
              onChange={e => setFilterState(prev => ({ ...prev, minKnowledge: Number(e.target.value) }))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#00ffe0]" />
          </div>
          <div>
            <label className="text-white/30 text-[10px] block mb-0.5">التصنيفات</label>
            <div className="flex flex-wrap gap-1">
              {allTags.map(tag => (
                <button key={tag} onClick={() => setFilterState(prev => ({
                  ...prev,
                  tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
                }))}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${filterState.tags.includes(tag) ? 'bg-[rgba(0,255,224,0.15)] text-[#00ffe0] border-[#00ffe0]/30' : 'bg-white/[0.03] text-white/30 border-white/10'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-white/30 text-[10px] block mb-0.5">النضج</label>
            <div className="flex gap-1">
              {Object.entries(MATURITY_LEVELS).map(([key, val]) => (
                <button key={key} onClick={() => setFilterState(prev => ({
                  ...prev,
                  maturityFilter: prev.maturityFilter.includes(key) ? prev.maturityFilter.filter(m => m !== key) : [...prev.maturityFilter, key],
                }))}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-all ${filterState.maturityFilter.includes(key) ? 'bg-[rgba(245,196,0,0.15)] text-[#f5c400] border-[#f5c400]/30' : 'bg-white/[0.03] text-white/30 border-white/10'}`}>
                  {val.emoji}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-white/30 text-[10px] cursor-pointer">
            <input type="checkbox" checked={filterState.showDormant}
              onChange={e => setFilterState(prev => ({ ...prev, showDormant: e.target.checked }))}
              className="accent-[#00ffe0]" />
            أظهر العقد النائمة
          </label>
        </div>
      )}

      {/* ═══ STATS PANEL ═══ */}
      {showStats && (
        <div className="fixed top-14 right-3 z-50 w-64 bg-[rgba(10,10,20,0.95)] backdrop-blur-xl border border-white/10 rounded-xl p-4 space-y-3 max-h-[80vh] overflow-y-auto" dir="rtl">
          <div className="flex items-center justify-between">
            <span className="text-[#f5c400] font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>🧠 حالة العقل</span>
            <Badge variant="outline" className="text-[#f5c400] border-[#f5c400]/30 text-[10px]">مستوى {levelInfo.level} — {levelInfo.name}</Badge>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-white/40 mb-1"><span>المعرفة</span><span>{brainStats.totalKnowledge}</span></div>
            <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (brainStats.totalKnowledge % 300) / 3)}%`, background: 'linear-gradient(90deg, #f5c400, #00ffe0)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/[0.03] rounded-lg p-2 text-center"><div className="text-[#00ffe0] font-bold text-lg">{nodes.length}</div><div className="text-white/30 text-[10px]">العقد</div></div>
            <div className="bg-white/[0.03] rounded-lg p-2 text-center"><div className="text-[#ff6b9d] font-bold text-lg">{edges.length}</div><div className="text-white/30 text-[10px]">الروابط</div></div>
            <div className="bg-white/[0.03] rounded-lg p-2 text-center"><div className="text-[#f5c400] font-bold text-lg">{brainStats.totalFeeds}</div><div className="text-white/30 text-[10px]">التغذيات</div></div>
            <div className="bg-white/[0.03] rounded-lg p-2 text-center"><div className="text-[#a78bfa] font-bold text-lg">{brainStats.growthRate}%</div><div className="text-white/30 text-[10px]">النمو</div></div>
          </div>

          {/* 🧬 Maturity distribution */}
          <div>
            <div className="text-white/30 text-[10px] mb-1">🧬 توزيع النضج</div>
            <div className="flex gap-1">
              {Object.entries(MATURITY_LEVELS).map(([key, val]) => {
                const count = nodes.filter(n => !n.isBrain && n.maturity === key).length;
                return count > 0 ? (
                  <span key={key} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]" style={{ color: val.color }}>
                    {val.emoji} {count}
                  </span>
                ) : null;
              })}
              {nodes.filter(n => n.dormant).length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-gray-400">💤 {nodes.filter(n => n.dormant).length}</span>
              )}
            </div>
          </div>

          {/* 🕸️ Timeline */}
          {brainStats.history.length > 0 && (
            <div>
              <div className="text-white/30 text-[10px] mb-1">🕸️ آخر الأنشطة</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {brainStats.history.slice(-10).reverse().map((h, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[9px] text-white/30">
                    <span>{h.event === 'feed' ? '🍎' : h.event === 'ai-insight' ? '🤖' : h.event === 'link' ? '🔗' : h.event === 'expand' ? '📂' : h.event === 'create' ? '➕' : h.event === 'alliance' ? '🤝' : '📊'}</span>
                    <span className="truncate flex-1">{h.detail}</span>
                    <span className="text-white/15">{h.knowledge}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {exploredTopics.length > 0 && (
            <div>
              <div className="text-white/30 text-[10px] mb-1">المواضيع المستكشفة</div>
              <div className="flex flex-wrap gap-1">
                {exploredTopics.map(t => (
                  <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-[rgba(0,255,224,0.08)] text-[#00ffe0] border border-[rgba(0,255,224,0.18)]">
                    {KNOWLEDGE_BASE[t]?.emoji} {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 🤖 AI PANEL (Feature 1) ═══ */}
      {aiPanelOpen && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[90vw] bg-[rgba(10,10,20,0.97)] backdrop-blur-xl border border-[rgba(167,139,250,0.3)] rounded-xl p-4 space-y-3 max-h-[70vh] overflow-y-auto" dir="rtl">
          <div className="flex items-center justify-between">
            <span className="text-[#a78bfa] font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>🤖 ذكاء العقل</span>
            <button onClick={() => setAiPanelOpen(false)} className="text-white/30 hover:text-white/60 text-lg leading-none">×</button>
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 text-[#a78bfa] text-xs">
              <div className="w-4 h-4 border-2 border-[#a78bfa]/30 border-t-[#a78bfa] rounded-full animate-spin" />
              العقل يفكر...
            </div>
          )}

          {aiInsight?.summary && (
            <div className="bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.15)] rounded-lg p-3">
              <div className="text-[#a78bfa] text-[10px] font-bold mb-1">📋 ملخص العقل</div>
              <p className="text-white/60 text-xs leading-relaxed">{aiInsight.summary}</p>
            </div>
          )}

          {aiInsight?.questions && aiInsight.questions.length > 0 && (
            <div className="bg-[rgba(245,196,0,0.08)] border border-[rgba(245,196,0,0.15)] rounded-lg p-3">
              <div className="text-[#f5c400] text-[10px] font-bold mb-1">❓ أسئلة مثيرة</div>
              {aiInsight.questions.map((q, i) => (
                <button key={i} onClick={() => { setAiQuestion(q); }}
                  className="block w-full text-right text-white/50 text-xs py-1 hover:text-[#f5c400] transition-colors">
                  → {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={aiSummarize} disabled={aiLoading}
              className="flex-1 px-3 py-2 rounded-lg bg-[rgba(167,139,250,0.12)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] text-[10px] font-bold hover:bg-[rgba(167,139,250,0.2)] transition-all disabled:opacity-50">
              📋 ملخص
            </button>
            <button onClick={aiSuggestLinks} disabled={aiLoading}
              className="flex-1 px-3 py-2 rounded-lg bg-[rgba(255,107,157,0.12)] text-[#ff6b9d] border border-[rgba(255,107,157,0.3)] text-[10px] font-bold hover:bg-[rgba(255,107,157,0.2)] transition-all disabled:opacity-50">
              🔗 اقترح روابط
            </button>
          </div>

          {/* Ask AI */}
          <div className="flex gap-2">
            <input
              value={aiQuestion}
              onChange={e => setAiQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aiAsk()}
              placeholder="اسأل العقل..."
              className="flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-[#a78bfa]/40 placeholder:text-white/20"
              dir="rtl"
            />
            <button onClick={aiAsk} disabled={aiLoading}
              className="px-3 py-1.5 rounded-lg bg-[#a78bfa] text-black text-[10px] font-bold hover:bg-[#a78bfa]/80 transition-all disabled:opacity-50">
              اسأل
            </button>
          </div>

          {aiAnswer && (
            <div className="bg-[rgba(0,255,224,0.08)] border border-[rgba(0,255,224,0.15)] rounded-lg p-3">
              <p className="text-white/60 text-xs leading-relaxed">{aiAnswer}</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ SELECTED NODE PANEL ═══ */}
      {selectedNode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[360px] max-w-[90vw] bg-[rgba(10,10,20,0.95)] backdrop-blur-xl border border-white/10 rounded-xl p-4 max-h-[60vh] overflow-y-auto" dir="rtl">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif', color: selectedNode.isBrain ? '#f5c400' : selectedNode.isCustom ? '#ff6b9d' : selectedNode.color }}>
                {selectedNode.isBrain ? '🧠' : getMaturityEmoji(selectedNode.maturity)} {selectedNode.label}
                {selectedNode.dormant && ' 💤'}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px]" style={{ color: selectedNode.color, borderColor: selectedNode.color + '40' }}>{selectedNode.tag}</Badge>
                <Badge variant="outline" className="text-[10px]" style={{ color: getMaturityColor(selectedNode.maturity), borderColor: getMaturityColor(selectedNode.maturity) + '40' }}>
                  {MATURITY_LEVELS[selectedNode.maturity].name}
                </Badge>
              </div>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-white/30 hover:text-white/60 text-lg leading-none">×</button>
          </div>

          {selectedNode.summary && <p className="text-white/50 text-xs mb-3 leading-relaxed">{selectedNode.summary}</p>}

          {/* Knowledge + Maturity */}
          {!selectedNode.isBrain && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <div className="flex justify-between text-[10px] text-white/30 mb-0.5"><span>المعرفة</span><span>{selectedNode.knowledgeLevel}%</span></div>
                <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${selectedNode.knowledgeLevel}%`, background: selectedNode.color }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-white/30 mb-0.5"><span>النضج</span><span>{selectedNode.visitCount} زيارة</span></div>
                <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, selectedNode.visitCount / 15 * 100)}%`, background: getMaturityColor(selectedNode.maturity) }} />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 flex-wrap">
            {!selectedNode.isBrain && (
              <button onClick={() => feedBrain(selectedNode.id)}
                className="px-3 py-1.5 rounded-lg bg-[rgba(245,196,0,0.12)] text-[#f5c400] border border-[rgba(245,196,0,0.3)] text-[10px] font-bold hover:bg-[rgba(245,196,0,0.2)] transition-all">
                🍎 أطعم العقل
              </button>
            )}
            {selectedNode.hasChildren && (
              <button onClick={() => expandNode(selectedNode.id)}
                className="px-3 py-1.5 rounded-lg bg-[rgba(0,255,224,0.12)] text-[#00ffe0] border border-[rgba(0,255,224,0.3)] text-[10px] font-bold hover:bg-[rgba(0,255,224,0.2)] transition-all">
                {selectedNode.expanded ? '↺ أغلق' : '⊕ توسع'}
              </button>
            )}
            {!selectedNode.isBrain && (
              <button onClick={() => {
                if (connectMode && connectFrom === selectedNode.id) { setConnectMode(false); setConnectFrom(null); }
                else { setConnectMode(true); setConnectFrom(selectedNode.id); }
              }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${connectMode && connectFrom === selectedNode.id ? 'bg-[rgba(255,107,157,0.2)] text-[#ff6b9d] border border-[rgba(255,107,157,0.4)]' : 'bg-white/[0.04] text-white/50 border border-white/10 hover:text-[#ff6b9d]'}`}>
                🔗 ربط
              </button>
            )}
            {!selectedNode.isBrain && (
              <button onClick={() => aiGenerateNodes(selectedNode)} disabled={aiLoading}
                className="px-3 py-1.5 rounded-lg bg-[rgba(167,139,250,0.12)] text-[#a78bfa] border border-[rgba(167,139,250,0.3)] text-[10px] font-bold hover:bg-[rgba(167,139,250,0.2)] transition-all disabled:opacity-50">
                🤖 ولّد عقد
              </button>
            )}
            {!selectedNode.isBrain && selectedNode.knowledgeLevel >= 30 && selectedNode.connections.length >= 2 && (
              <button onClick={() => {
                const otherConnected = selectedNode.connections.filter(id => id !== BRAIN_ID);
                if (otherConnected.length >= 1) formAlliance(selectedNode.id, otherConnected[0]);
              }}
                className="px-3 py-1.5 rounded-lg bg-[rgba(245,196,0,0.12)] text-[#f5c400] border border-[rgba(245,196,0,0.3)] text-[10px] font-bold hover:bg-[rgba(245,196,0,0.2)] transition-all">
                🤝 تحالف
              </button>
            )}
            {selectedNode.dormant && (
              <button onClick={() => wakeNode(selectedNode.id)}
                className="px-3 py-1.5 rounded-lg bg-[rgba(52,211,153,0.12)] text-[#34d399] border border-[rgba(52,211,153,0.3)] text-[10px] font-bold hover:bg-[rgba(52,211,153,0.2)] transition-all">
                ⚡ أيقظ
              </button>
            )}
            {!selectedNode.isBrain && (
              <button onClick={() => deleteNode(selectedNode.id)}
                className="px-2 py-1.5 rounded-lg bg-white/[0.04] text-white/30 border border-white/10 text-[10px] hover:text-red-400 hover:border-red-400/30 transition-all">
                ✕
              </button>
            )}
          </div>

          {/* Connections */}
          {selectedNode.connections.length > 0 && (
            <div className="mt-3 pt-2 border-t border-white/[0.06]">
              <div className="text-white/30 text-[10px] mb-1">متصل بـ ({selectedNode.connections.length})</div>
              <div className="flex flex-wrap gap-1">
                {selectedNode.connections.map(cid => {
                  const c = nodes.find(n => n.id === cid);
                  return c ? <span key={cid} className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.04] text-white/40 border border-white/[0.06]">{c.label}</span> : null;
                })}
              </div>
            </div>
          )}

          {/* 🧬 Allied nodes */}
          {selectedNode.alliedWith.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/[0.06]">
              <div className="text-[#a78bfa] text-[10px] mb-1">🤝 متحالف مع</div>
              <div className="flex flex-wrap gap-1">
                {selectedNode.alliedWith.map(aid => {
                  const a = nodes.find(n => n.id === aid);
                  return a ? <span key={aid} className="text-[9px] px-2 py-0.5 rounded-full bg-[rgba(167,139,250,0.08)] text-[#a78bfa] border border-[rgba(167,139,250,0.2)]">{a.label}</span> : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CONNECT MODE BANNER ═══ */}
      {connectMode && connectFrom && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[rgba(255,107,157,0.15)] backdrop-blur-xl border border-[rgba(255,107,157,0.3)] rounded-full text-[#ff6b9d] text-xs" dir="rtl">
          🔗 وضع الربط — اضغط على عقدة أخرى
          <button onClick={() => { setConnectMode(false); setConnectFrom(null); }} className="mr-2 text-white/30 hover:text-white/60">✕</button>
        </div>
      )}

      {/* ═══ FEED ANIMATION ═══ */}
      {feedAnim && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[rgba(245,196,0,0.15)] backdrop-blur-xl border border-[rgba(245,196,0,0.3)] rounded-full text-[#f5c400] text-xs animate-bounce" dir="rtl">
          🍎 العقل يتغذى!
        </div>
      )}

      {/* ═══ BOTTOM HINT ═══ */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 text-[10px] text-white/20 bg-[rgba(5,5,8,0.75)] backdrop-blur-xl px-4 py-1.5 rounded-full border border-white/[0.06]" dir="rtl">
        اضغط عقدة · اسحب · عجلة للتكبير · 🤖 AI ذكي · 🔍 بحث · 🕸️ أوضاع عرض
      </div>

      {/* ═══ BRAIN LEVEL ═══ */}
      <div className="fixed bottom-3 right-3 z-40 flex items-center gap-2 px-3 py-1.5 bg-[rgba(10,10,20,0.9)] backdrop-blur-xl border border-[rgba(245,196,0,0.2)] rounded-full" dir="rtl">
        <span className="text-lg">{levelInfo.emoji}</span>
        <div>
          <div className="text-[#f5c400] text-[11px] font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{levelInfo.name}</div>
          <div className="text-white/20 text-[9px]">مستوى {levelInfo.level}</div>
        </div>
      </div>

      {/* ═══ RESET VIEW ═══ */}
      <button onClick={resetView}
        className="fixed bottom-3 left-3 z-40 px-3 py-1.5 bg-[rgba(10,10,20,0.9)] backdrop-blur-xl border border-white/10 rounded-full text-white/30 text-xs hover:text-white/60 transition-all">
        ⟳
      </button>
    </div>
  );
}
